/**
 * Phase E4: Content-quality probes for autoresearch.
 *
 * The legacy rubric in scoreUseCase() checks file presence and pattern hits;
 * every domain ends up scoring ~95-97/100. This module replaces that signal
 * with content-quality probes that measure unique actors, distinct verbs,
 * repeated failure-case strings, etc., and emits 3 distinct readiness labels:
 *
 *   - artifactQuality (0-100, derived from probe scores + caps)
 *   - buildApproval   (manifest.lifecycleStatus check)
 *   - demoReadiness   (artifactQuality >= 75 && approved && research-source eligible)
 *
 * Probes, rules, and caps are configured in autoresearch/rubrics/probes.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getResearchSource, type ResearchSource } from '../lib/research/schema';

// ---------- Types ----------

export type ProbeRule =
  | 'uniqueRatio'
  | 'consistencyCheck'
  | 'perActorMin'
  | 'stddevBelow'
  | 'thresholdHits'
  | 'perCategoryMin';

export type ProbeConfig = {
  name: string;
  max: number;
  inspect: string[];
  extract: string;
  rule: ProbeRule;
  min?: number | Record<string, number>;
  minUnique?: number;
  maxStddev?: number;
};

export type CapConfig = {
  when: string;
  max: number;
  label: string;
};

export type ProbeRubric = {
  version: number;
  probes: ProbeConfig[];
  caps: CapConfig[];
};

export type PerProbeResult = {
  name: string;
  max: number;
  passed: boolean;
  score: number;
  detail: string;
};

export type ProbeReport = {
  perProbe: PerProbeResult[];
  rawScore: number;
  appliedCap: { label: string; max: number } | null;
  finalScore: number;
  finalPercent: number;
};

export type ReadinessLabels = {
  artifactQuality: { score: number; pct: number };
  buildApproval: { approved: boolean; reason: string };
  demoReadiness: { ready: boolean; reason: string };
  researchSource: ResearchSource;
};

// ---------- Rubric loader ----------

export function loadProbeRubric(rubricPath: string): ProbeRubric {
  const raw = fs.readFileSync(rubricPath, 'utf8');
  const parsed = JSON.parse(raw) as ProbeRubric;
  if (!parsed.probes || !Array.isArray(parsed.probes)) {
    throw new Error(`Invalid probe rubric at ${rubricPath}: missing probes array`);
  }
  if (!parsed.caps || !Array.isArray(parsed.caps)) {
    throw new Error(`Invalid probe rubric at ${rubricPath}: missing caps array`);
  }
  return parsed;
}

// ---------- File helpers ----------

function readFileSafe(packageRoot: string, relativePath: string): string {
  const fullPath = path.join(packageRoot, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function readJsonSafe<T>(packageRoot: string, relativePath: string): T | null {
  const fullPath = path.join(packageRoot, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as T;
  } catch {
    return null;
  }
}

// ---------- Extractors ----------

/** `^- Actor ID:` lines beneath each `## Requirement N:` heading. */
function extractActorIdLines(content: string): string[] {
  const out: string[] = [];
  const lines = content.split(/\r?\n/);
  let inRequirement = false;
  for (const line of lines) {
    if (/^##\s+Requirement\s+\d+/i.test(line)) {
      inRequirement = true;
      continue;
    }
    if (/^##\s+/.test(line) && !/^##\s+Requirement\s+\d+/i.test(line)) {
      inRequirement = false;
      continue;
    }
    if (!inRequirement) continue;
    const m = /^-\s+Actor ID:\s*(.+)$/i.exec(line);
    if (m) out.push(m[1].trim().toLowerCase());
  }
  return out;
}

/** `^- User action:` first lowercase verb (skip Capitalized actor nouns). */
function extractUserActionFirstVerbs(content: string): string[] {
  const out: string[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = /^-\s+User action:\s*(.+)$/i.exec(line);
    if (!m) continue;
    const action = m[1].trim();
    const tokens = action.split(/\s+/);
    let firstVerb: string | null = null;
    for (const tok of tokens) {
      const cleaned = tok.replace(/[^A-Za-z]/g, '');
      if (!cleaned) continue;
      // Skip capitalized actor nouns at the start; pick the first lowercase token.
      if (/^[A-Z]/.test(cleaned)) continue;
      firstVerb = cleaned.toLowerCase();
      break;
    }
    if (firstVerb === null) {
      // All-capitalized phrase: fall back to the first token lowercased.
      const first = tokens[0]?.replace(/[^A-Za-z]/g, '') ?? '';
      firstVerb = first.toLowerCase();
    }
    if (firstVerb) out.push(firstVerb);
  }
  return out;
}

/** `^- Failure case:` and `^- Negative case:` lines. */
function extractFailureCaseLines(contents: string[]): string[] {
  const out: string[] = [];
  for (const content of contents) {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = /^-\s+(?:Failure case|Negative case):\s*(.+)$/i.exec(line);
      if (m) out.push(m[1].trim().toLowerCase());
    }
  }
  return out;
}

/** `^- Purpose:` lines per screen block in SCREEN_INVENTORY.md. */
function extractScreenPurposes(content: string): string[] {
  const out: string[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = /^-\s+Purpose:\s*(.+)$/i.exec(line);
    if (m) out.push(m[1].trim().toLowerCase());
  }
  return out;
}

type WorkflowEntry = { workflowName: string; targetUser: string; requiredScreens: string[] };
type ScreenEntry = { name: string; primaryUser: string };

function parseWorkflows(content: string): WorkflowEntry[] {
  const out: WorkflowEntry[] = [];
  const sections = content.split(/^##\s+/m).slice(1);
  for (const section of sections) {
    const headLine = section.split(/\r?\n/)[0]?.trim() ?? '';
    let workflowName = headLine;
    const nameLine = /^-\s+Workflow name:\s*(.+)$/im.exec(section);
    if (nameLine) workflowName = nameLine[1].trim();
    const targetMatch = /^-\s+Target user:\s*(.+)$/im.exec(section);
    const reqMatch = /^-\s+Required screens:\s*(.+)$/im.exec(section);
    const requiredScreens = reqMatch
      ? reqMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    out.push({
      workflowName,
      targetUser: targetMatch ? targetMatch[1].trim() : '',
      requiredScreens
    });
  }
  return out;
}

function parseScreens(content: string): ScreenEntry[] {
  const out: ScreenEntry[] = [];
  // Use the "Per-screen quick view" section (### blocks) rather than the index table.
  const sections = content.split(/^###\s+/m).slice(1);
  for (const section of sections) {
    const headLine = section.split(/\r?\n/)[0]?.trim() ?? '';
    if (!headLine) continue;
    const primaryMatch = /^-\s+Primary (?:user|actor):\s*(.+)$/im.exec(section);
    out.push({
      name: headLine,
      primaryUser: primaryMatch ? primaryMatch[1].trim() : ''
    });
  }
  return out;
}

type WorkflowScreenPair = { workflowTargetUser: string; screenPrimaryUser: string; screenName: string };

function extractWorkflowScreenActorMap(workflowsContent: string, screensContent: string): WorkflowScreenPair[] {
  const workflows = parseWorkflows(workflowsContent);
  const screens = parseScreens(screensContent);
  const pairs: WorkflowScreenPair[] = [];
  for (const wf of workflows) {
    for (const reqScreen of wf.requiredScreens) {
      // Substring match either direction against a screen entry.
      const matched = screens.find((s) => {
        const sname = s.name.toLowerCase();
        const rname = reqScreen.toLowerCase();
        return sname.includes(rname) || rname.includes(sname);
      });
      pairs.push({
        workflowTargetUser: wf.targetUser,
        screenPrimaryUser: matched?.primaryUser ?? '',
        screenName: matched?.name ?? reqScreen
      });
    }
  }
  return pairs;
}

type SamplesByActor = {
  /** actor-id (lowercased) → { happy, negative, boundary, rolePermission } counts across ALL entities */
  perActor: Map<string, { happy: number; negative: number; boundary: number; rolePermission: number }>;
  /** actor-ids (lowercased) referenced in `Used by requirements: REQ-N (actor-id)` annotations */
  declaredActors: Set<string>;
};

function extractSamplesByActor(content: string): SamplesByActor {
  const declaredActors = new Set<string>();
  const perActor = new Map<
    string,
    { happy: number; negative: number; boundary: number; rolePermission: number }
  >();
  const ensure = (actor: string) => {
    if (!perActor.has(actor)) {
      perActor.set(actor, { happy: 0, negative: 0, boundary: 0, rolePermission: 0 });
    }
    return perActor.get(actor)!;
  };

  // Split on top-level "## " entity headers.
  const entitySections = content.split(/^##\s+/m).slice(1);
  for (const section of entitySections) {
    // Skip top-of-file admin sections like "How to use this file" / "Foreign keys".
    const headLine = section.split(/\r?\n/)[0] ?? '';
    if (!/`entity-/i.test(headLine)) continue;

    // Collect actor ids declared via `Used by requirements: REQ-N (actor-...)`
    const usedMatch = /^-\s+Used by requirements:\s*(.+)$/im.exec(section);
    const entityActors = new Set<string>();
    if (usedMatch) {
      for (const m of usedMatch[1].matchAll(/\(([^)]+)\)/g)) {
        const a = m[1].trim().toLowerCase();
        if (a) {
          declaredActors.add(a);
          entityActors.add(a);
        }
      }
    }
    // Default actor when a sample doesn't carry its own `- Actor:` line is the first declared actor.
    const defaultActor = entityActors.values().next().value as string | undefined;

    // Walk samples (### Sample <category>: ...).
    const sampleBlocks = section.split(/^###\s+/m).slice(1);
    for (const block of sampleBlocks) {
      const head = block.split(/\r?\n/)[0] ?? '';
      const catMatch = /^Sample\s+([A-Za-z\-]+):/i.exec(head);
      if (!catMatch) continue;
      const rawCat = catMatch[1].toLowerCase();
      let category: 'happy' | 'negative' | 'boundary' | 'rolePermission' | null = null;
      if (rawCat === 'happy') category = 'happy';
      else if (rawCat === 'negative') category = 'negative';
      else if (rawCat === 'boundary') category = 'boundary';
      else if (rawCat === 'role-permission' || rawCat === 'rolepermission') category = 'rolePermission';
      if (!category) continue;

      const actorMatch = /^-\s+Actor:\s*(.+)$/im.exec(block);
      const actor = actorMatch ? actorMatch[1].trim().toLowerCase() : defaultActor ?? '';
      if (!actor) continue;
      declaredActors.add(actor);
      const counts = ensure(actor);
      counts[category]++;
    }
  }
  return { perActor, declaredActors };
}

type ReqIdsPerPhase = Array<{ phaseTitle: string; phaseType: string; reqCount: number; reqIds: string[] }>;

function extractReqIdsPerPhase(content: string): ReqIdsPerPhase {
  const out: ReqIdsPerPhase = [];
  const sections = content.split(/^##\s+/m).slice(1);
  for (const section of sections) {
    const headLine = section.split(/\r?\n/)[0]?.trim() ?? '';
    // Phase headings start with `<digit>. `.
    if (!/^\d+\.\s+/.test(headLine)) continue;
    const phaseTypeMatch = /^-\s+Phase type:\s*(.+)$/im.exec(section);
    const phaseType = phaseTypeMatch ? phaseTypeMatch[1].trim().toLowerCase() : '';
    const reqMatch = /^-\s+Requirement IDs:\s*(.+)$/im.exec(section);
    let reqIds: string[] = [];
    if (reqMatch) {
      const raw = reqMatch[1].trim();
      if (!/^none$/i.test(raw)) {
        reqIds = raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => /^REQ-\d+/i.test(s));
      }
    }
    out.push({ phaseTitle: headLine, phaseType, reqCount: reqIds.length, reqIds });
  }
  return out;
}

type DomainKeywordHits = { keywords: string[]; hits: number };

function extractDomainKeywordHits(packageRoot: string, inspectContents: string[]): DomainKeywordHits {
  type InputJson = { productName?: string; mustHaveFeatures?: string };
  const input = readJsonSafe<InputJson>(packageRoot, 'repo/input.json');
  const keywords: string[] = [];
  if (input?.productName) keywords.push(input.productName.trim());
  if (input?.mustHaveFeatures) {
    for (const part of input.mustHaveFeatures.split(/[,\n]/)) {
      const trimmed = part.trim();
      if (trimmed.length >= 3) keywords.push(trimmed);
    }
  }
  const combined = inspectContents.join('\n').toLowerCase();
  let hits = 0;
  const seen = new Set<string>();
  for (const kw of keywords) {
    const lc = kw.toLowerCase();
    if (!lc || seen.has(lc)) continue;
    seen.add(lc);
    if (combined.includes(lc)) hits++;
  }
  return { keywords: Array.from(seen), hits };
}

type SampleCategoryCounts = Map<
  string,
  { happy: number; negative: number; boundary: number; rolePermission: number }
>;

function extractSampleCategoryCounts(content: string): SampleCategoryCounts {
  const out: SampleCategoryCounts = new Map();
  const sections = content.split(/^##\s+/m).slice(1);
  for (const section of sections) {
    const headLine = section.split(/\r?\n/)[0] ?? '';
    if (!/`entity-/i.test(headLine)) continue;
    const idMatch = /`(entity-[^`]+)`/.exec(headLine);
    const entityId = idMatch ? idMatch[1] : headLine.trim();
    const counts = { happy: 0, negative: 0, boundary: 0, rolePermission: 0 };
    const sampleHeaders = section.matchAll(/^###\s+Sample\s+([A-Za-z\-]+):/gim);
    for (const m of sampleHeaders) {
      const cat = m[1].toLowerCase();
      if (cat === 'happy') counts.happy++;
      else if (cat === 'negative') counts.negative++;
      else if (cat === 'boundary') counts.boundary++;
      else if (cat === 'role-permission' || cat === 'rolepermission') counts.rolePermission++;
    }
    out.set(entityId, counts);
  }
  return out;
}

// ---------- Rules ----------

function ruleUniqueRatio(values: string[], probe: ProbeConfig): PerProbeResult {
  const total = values.length;
  const unique = new Set(values).size;
  const ratio = total === 0 ? 0 : unique / total;
  const minRatio = typeof probe.min === 'number' ? probe.min : 0;
  const minUnique = typeof probe.minUnique === 'number' ? probe.minUnique : 0;
  const meetsUniqueFloor = unique >= minUnique;
  const meetsRatio = total === 0 ? false : ratio >= minRatio;
  const passed = meetsUniqueFloor && meetsRatio;
  let score = 0;
  if (total > 0) {
    if (minRatio > 0) {
      score = Math.min(1, ratio / minRatio) * probe.max;
    } else if (minUnique > 0) {
      score = Math.min(1, unique / Math.max(minUnique, 1)) * probe.max;
    } else {
      score = ratio * probe.max;
    }
  }
  return {
    name: probe.name,
    max: probe.max,
    passed,
    score: round(score),
    detail: `unique=${unique}/${total}, ratio=${ratio.toFixed(2)} (minRatio=${minRatio}, minUnique=${minUnique})`
  };
}

function ruleConsistencyCheck(pairs: WorkflowScreenPair[], probe: ProbeConfig): PerProbeResult {
  if (pairs.length === 0) {
    return {
      name: probe.name,
      max: probe.max,
      passed: false,
      score: 0,
      detail: 'no (workflow, screen) pairs to evaluate'
    };
  }
  let consistent = 0;
  for (const pair of pairs) {
    const tu = pair.workflowTargetUser.toLowerCase();
    const pu = pair.screenPrimaryUser.toLowerCase();
    if (!tu || !pu) continue;
    if (tu.includes(pu) || pu.includes(tu)) consistent++;
  }
  const ratio = consistent / pairs.length;
  const passed = ratio >= 0.7;
  return {
    name: probe.name,
    max: probe.max,
    passed,
    score: round(ratio * probe.max),
    detail: `consistent=${consistent}/${pairs.length}, ratio=${ratio.toFixed(2)}`
  };
}

function rulePerActorMin(samples: SamplesByActor, probe: ProbeConfig): PerProbeResult {
  const minSpec = (probe.min && typeof probe.min === 'object' ? probe.min : {}) as Record<string, number>;
  const declared = Array.from(samples.declaredActors);
  if (declared.length === 0) {
    return {
      name: probe.name,
      max: probe.max,
      passed: false,
      score: 0,
      detail: 'no declared actors via REQ annotations'
    };
  }
  let actorsMeeting = 0;
  for (const actor of declared) {
    const counts = samples.perActor.get(actor) ?? { happy: 0, negative: 0, boundary: 0, rolePermission: 0 };
    let ok = true;
    for (const [cat, min] of Object.entries(minSpec)) {
      const value = (counts as Record<string, number>)[cat] ?? 0;
      if (value < min) {
        ok = false;
        break;
      }
    }
    if (ok) actorsMeeting++;
  }
  const ratio = actorsMeeting / declared.length;
  return {
    name: probe.name,
    max: probe.max,
    passed: actorsMeeting === declared.length,
    score: round(ratio * probe.max),
    detail: `${actorsMeeting}/${declared.length} actors meet ${JSON.stringify(minSpec)}`
  };
}

function ruleStddevBelow(perPhase: ReqIdsPerPhase, probe: ProbeConfig): PerProbeResult {
  const eligible = perPhase.filter((p) => p.phaseType === 'design' || p.phaseType === 'implementation');
  const counts = eligible.map((p) => p.reqCount);
  if (counts.length === 0) {
    return {
      name: probe.name,
      max: probe.max,
      passed: false,
      score: 0,
      detail: 'no design or implementation phases found'
    };
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / counts.length;
  const stddev = Math.sqrt(variance);
  const maxStddev = typeof probe.maxStddev === 'number' ? probe.maxStddev : 4;
  const passed = stddev <= maxStddev;
  let score = 0;
  if (passed) {
    score = probe.max;
  } else if (stddev > 0) {
    score = probe.max * (maxStddev / stddev);
  }
  return {
    name: probe.name,
    max: probe.max,
    passed,
    score: round(score),
    detail: `stddev=${stddev.toFixed(2)} (maxStddev=${maxStddev}), counts=[${counts.join(',')}]`
  };
}

function ruleThresholdHits(domain: DomainKeywordHits, probe: ProbeConfig): PerProbeResult {
  const min = typeof probe.min === 'number' ? probe.min : 1;
  const ratio = Math.min(domain.hits / Math.max(min, 1), 1);
  const passed = domain.hits >= min;
  return {
    name: probe.name,
    max: probe.max,
    passed,
    score: round(ratio * probe.max),
    detail: `hits=${domain.hits} of ${domain.keywords.length} keywords (min=${min})`
  };
}

function rulePerCategoryMin(counts: SampleCategoryCounts, probe: ProbeConfig): PerProbeResult {
  const minSpec = (probe.min && typeof probe.min === 'object' ? probe.min : {}) as Record<string, number>;
  let anyEntityMeets = false;
  let exemplar = '';
  for (const [entityId, c] of counts.entries()) {
    let ok = true;
    for (const [cat, min] of Object.entries(minSpec)) {
      const value = (c as Record<string, number>)[cat] ?? 0;
      if (value < min) {
        ok = false;
        break;
      }
    }
    if (ok) {
      anyEntityMeets = true;
      exemplar = entityId;
      break;
    }
  }
  return {
    name: probe.name,
    max: probe.max,
    passed: anyEntityMeets,
    score: anyEntityMeets ? probe.max : 0,
    detail: anyEntityMeets
      ? `entity ${exemplar} meets ${JSON.stringify(minSpec)}`
      : `no entity meets ${JSON.stringify(minSpec)} across ${counts.size} entities`
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- Cap evaluator ----------

function evaluateCap(cap: CapConfig, perProbe: PerProbeResult[]): boolean {
  // Supports `<probeName> == N` and `<probeName> < N`.
  const eqMatch = /^(.+?)\s*==\s*(\d+)$/.exec(cap.when.trim());
  const ltMatch = /^(.+?)\s*<\s*(\d+)$/.exec(cap.when.trim());
  if (!eqMatch && !ltMatch) return false;
  const m = (eqMatch ?? ltMatch)!;
  const probeName = m[1].trim();
  const threshold = Number(m[2]);
  const result = perProbe.find((p) => p.name === probeName);
  if (!result) return false;
  if (eqMatch) return result.score === threshold;
  return result.score < threshold;
}

// ---------- Orchestrator ----------

export function runProbes(packageRoot: string, rubric: ProbeRubric): ProbeReport {
  const perProbe: PerProbeResult[] = [];
  for (const probe of rubric.probes) {
    perProbe.push(runSingleProbe(packageRoot, probe));
  }
  const rawScore = round(perProbe.reduce((sum, p) => sum + p.score, 0));
  const totalMax = rubric.probes.reduce((sum, p) => sum + p.max, 0);

  // Apply caps. The lowest-max cap that fires "wins" (most restrictive).
  let appliedCap: { label: string; max: number } | null = null;
  for (const cap of rubric.caps) {
    if (!evaluateCap(cap, perProbe)) continue;
    if (rawScore <= cap.max) continue;
    if (appliedCap === null || cap.max < appliedCap.max) {
      appliedCap = { label: cap.label, max: cap.max };
    }
  }
  const finalScore = appliedCap === null ? rawScore : Math.min(rawScore, appliedCap.max);
  const finalPercent = totalMax === 0 ? 0 : round((finalScore / totalMax) * 100);

  return { perProbe, rawScore, appliedCap, finalScore: round(finalScore), finalPercent };
}

function runSingleProbe(packageRoot: string, probe: ProbeConfig): PerProbeResult {
  const inspectContents = probe.inspect.map((rel) => readFileSafe(packageRoot, rel));

  switch (probe.extract) {
    case 'actorIdLines': {
      const values = extractActorIdLines(inspectContents[0] ?? '');
      return ruleUniqueRatio(values, probe);
    }
    case 'userActionFirstVerbs': {
      const values = extractUserActionFirstVerbs(inspectContents[0] ?? '');
      return ruleUniqueRatio(values, probe);
    }
    case 'failureCaseLines': {
      const values = extractFailureCaseLines(inspectContents);
      return ruleUniqueRatio(values, probe);
    }
    case 'screenPurposes': {
      const values = extractScreenPurposes(inspectContents[0] ?? '');
      return ruleUniqueRatio(values, probe);
    }
    case 'workflowScreenActorMap': {
      const pairs = extractWorkflowScreenActorMap(inspectContents[0] ?? '', inspectContents[1] ?? '');
      return ruleConsistencyCheck(pairs, probe);
    }
    case 'samplesByActor': {
      const samples = extractSamplesByActor(inspectContents[0] ?? '');
      return rulePerActorMin(samples, probe);
    }
    case 'reqIdsPerPhase': {
      const perPhase = extractReqIdsPerPhase(inspectContents[0] ?? '');
      return ruleStddevBelow(perPhase, probe);
    }
    case 'domainKeywordHits': {
      const hits = extractDomainKeywordHits(packageRoot, inspectContents);
      return ruleThresholdHits(hits, probe);
    }
    case 'sampleCategoryCounts': {
      const counts = extractSampleCategoryCounts(inspectContents[0] ?? '');
      return rulePerCategoryMin(counts, probe);
    }
    default:
      return {
        name: probe.name,
        max: probe.max,
        passed: false,
        score: 0,
        detail: `unknown extract key: ${probe.extract}`
      };
  }
}

// ---------- Readiness labels ----------

const APPROVED_LIFECYCLE = new Set(['ApprovedForBuild', 'BuildReady', 'DemoReady']);

type ManifestShape = {
  lifecycleStatus?: string;
  researchSource?: ResearchSource;
};

type MetaShape = {
  researcher?: string;
  researchSource?: ResearchSource;
};

export function deriveReadinessLabels(packageRoot: string, probeReport: ProbeReport): ReadinessLabels {
  const manifest = readJsonSafe<ManifestShape>(packageRoot, 'repo/manifest.json');
  const meta = readJsonSafe<MetaShape>(packageRoot, 'research/extracted/meta.json');

  const lifecycleStatus = manifest?.lifecycleStatus ?? '';
  const approved = APPROVED_LIFECYCLE.has(lifecycleStatus);
  const buildReason = approved
    ? `manifest.lifecycleStatus = ${lifecycleStatus}`
    : `manifest.lifecycleStatus = ${lifecycleStatus || 'missing'} (need one of ${Array.from(APPROVED_LIFECYCLE).join(', ')})`;

  let researchSource: ResearchSource;
  if (manifest?.researchSource) {
    researchSource = manifest.researchSource;
  } else if (meta) {
    researchSource = getResearchSource(meta);
  } else {
    researchSource = 'synthesized';
  }

  const artifactPct = probeReport.finalPercent;
  const sourceEligible = researchSource === 'agent-recipe' || researchSource === 'imported-real';
  const ready = artifactPct >= 75 && approved && sourceEligible;

  let demoReason: string;
  if (ready) {
    demoReason = `artifact-quality ${artifactPct}% + ${lifecycleStatus} + research-source ${researchSource}`;
  } else {
    const failures: string[] = [];
    if (artifactPct < 75) failures.push(`artifact-quality ${artifactPct}% < 75%`);
    if (!approved) failures.push(`not approved (${lifecycleStatus || 'no lifecycleStatus'})`);
    if (!sourceEligible) failures.push(`research-source ${researchSource}`);
    demoReason = `not ready: ${failures.join('; ')}`;
  }

  return {
    artifactQuality: { score: probeReport.finalScore, pct: artifactPct },
    buildApproval: { approved, reason: buildReason },
    demoReadiness: { ready, reason: demoReason },
    researchSource
  };
}
