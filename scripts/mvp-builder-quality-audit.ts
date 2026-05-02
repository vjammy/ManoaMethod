#!/usr/bin/env node
/**
 * Quality audit for an MVP Builder workspace.
 *
 * Goes beyond pass/fail. Scores a workspace 0-100 across 7 weighted dimensions
 * and emits a structured findings report. The point is to detect cookie-cutter
 * output that satisfies the structural validators but isn't actually useful.
 *
 * Dimensions:
 *   1. Domain vocabulary penetration (20)   — brief tokens land in phase briefs / requirements / sample data
 *   2. Anti-generic prose (15)              — penalize "the application" / "the user" / "review the plan" / TBD
 *   3. Sample data realism (15)             — ≥N entities, named like the domain, happy + negative paths, ≥3 fields
 *   4. Requirement specificity (15)         — every REQ has actor, entity, testable outcome, domain tokens
 *   5. Phase distinctness (10)              — phase goals are not paraphrases of each other
 *   6. Test-script substance (10)           — phase TEST_SCRIPT.md has concrete actions tied to entities
 *   7. Cross-artifact consistency (10)      — REQ IDs in tests exist in requirements; product name appears in core files
 *   + Research-grounding flag (-5 if missing) — workspace was templated, not research-extracted
 *
 * Usage:
 *   npm run audit -- --package=<workspace-root>
 *   npm run audit -- --package=<workspace-root> --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getResearchSource, type ResearchSource } from '../lib/research/schema';

type Finding = {
  dimension: string;
  severity: 'info' | 'warning' | 'blocker';
  message: string;
  detail?: string;
};

type DimensionScore = {
  name: string;
  score: number;
  max: number;
  weight: number;
  findings: Finding[];
  evidence: string[];
};

type ExpertScore = {
  name: string;
  score: number;
  max: number;
  evidence: string[];
  cap?: { applied: number; reason: string }; // when this dim caps the total
};

type Readiness = {
  /** Workspace is structurally complete and well-formed (audit total ≥ 85). */
  productionReady: boolean;
  /** Workspace is grounded in research extractions (research/extracted/* present). */
  researchGrounded: boolean;
  /** Workspace is fit to show a real customer/stakeholder. Requires real research source + complete artifacts. */
  demoReady: boolean;
  /** Alias of demoReady — same rule, surfaced separately so client-vs-internal use can diverge later. */
  clientReady: boolean;
  /** Human-readable explanation of why demoReady/clientReady is false (or empty when true). */
  reason: string;
  /** RC2: research-source provenance ('synthesized' | 'agent-recipe' | 'imported-real' | 'manual'). */
  researchSource: ResearchSource;
};

type AuditResult = {
  packageRoot: string;
  productName: string;
  total: number;
  rating: 'cookie-cutter' | 'thin' | 'workable' | 'production-ready';
  researchGrounded: boolean;
  /** RC2: source-aware readiness assessment. */
  readiness: Readiness;
  dimensions: DimensionScore[];
  topFindings: Finding[];
  expert?: {
    bonus: number;
    cap: number; // strongest cap applied
    dimensions: ExpertScore[];
    capReasons: string[];
  };
};

function getArg(name: string): string | undefined {
  const exact = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  if (process.argv.includes(`--${name}`)) return 'true';
  return undefined;
}

function readSafe(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => path.join(dir, f));
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

const STOP_WORDS = new Set([
  'this',
  'that',
  'with',
  'from',
  'into',
  'their',
  'have',
  'will',
  'should',
  'must',
  'plan',
  'phase',
  'phases',
  'review',
  'workspace',
  'package',
  'project',
  'product',
  'system',
  'application',
  'feature',
  'features',
  'process',
  'workflow',
  'documentation',
  'requirement',
  'requirements',
  'gate',
  'gates',
  'before',
  'after',
  'while',
  'these',
  'those',
  'there',
  'where',
  'which',
  'because',
  'when',
  'they',
  'work',
  'used',
  'each',
  'about',
  'mode',
  'role',
  'roles',
  'task',
  'tasks',
  'data',
  'view',
  'list',
  'item',
  'items',
  'name',
  'names',
  'mvp-builder',
  'mvpbuilder',
  'codex',
  'claude'
]);

function domainTokens(brief: string, productName: string): string[] {
  const raw = tokenize(`${productName} ${brief}`);
  const filtered = raw.filter((t) => !STOP_WORDS.has(t));
  // Keep tokens that are long enough or part of the product name
  return uniq(filtered).slice(0, 60);
}

function countOccurrences(needle: string, haystack: string): number {
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  return (haystack.match(re) || []).length;
}

/**
 * Phase B: load research-derived token vocabulary from research/extracted/ if it
 * exists. Returns an empty array when research is absent, which means the
 * downstream checks gracefully fall back to brief-only behavior.
 */
function loadResearchVocab(packageRoot: string): { tokens: string[]; present: boolean } {
  const root = path.join(packageRoot, 'research', 'extracted');
  if (!fs.existsSync(path.join(root, 'meta.json'))) return { tokens: [], present: false };
  const safeRead = (name: string): unknown => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    } catch {
      return undefined;
    }
  };
  const actors = (safeRead('actors.json') as Array<{ name: string }> | undefined) || [];
  const entities = (safeRead('entities.json') as Array<{ name: string; fields?: Array<{ name: string }>; sample?: Record<string, unknown> }> | undefined) || [];
  const workflows = (safeRead('workflows.json') as Array<{ name: string }> | undefined) || [];
  const risks = (safeRead('risks.json') as Array<{ category: string }> | undefined) || [];
  const gates = (safeRead('gates.json') as Array<{ name: string; mandatedByDetail?: string }> | undefined) || [];

  const citations: string[] = [];
  for (const g of gates) {
    if (!g.mandatedByDetail) continue;
    const matches = g.mandatedByDetail.match(
      /\b(GDPR(?:\s+Art\.?\s*\d+)?|CAN-SPAM|HIPAA(?:\s+[A-Z][a-z]+\s+Rule)?(?:\s+§\d[\d.]*)?|CPRA(?:\s+§\d[\d.]*)?|CCPA|FERPA|PCI(?:\s+DSS)?|SOC\s*2|TCPA|CASL|COPPA)\b/gi
    );
    if (matches) citations.push(...matches);
  }
  const sampleIds: string[] = [];
  for (const e of entities) {
    if (!e.sample) continue;
    for (const v of Object.values(e.sample)) {
      if (typeof v === 'string' && /[a-z]+-[a-z0-9]+/i.test(v)) sampleIds.push(v);
    }
  }

  const raw = [
    ...actors.map((a) => a.name),
    ...entities.map((e) => e.name),
    ...entities.flatMap((e) => (e.fields || []).map((f) => f.name)),
    ...workflows.map((w) => w.name),
    ...risks.map((r) => r.category),
    ...gates.map((g) => g.name),
    ...citations,
    ...sampleIds
  ];

  // Tokenize the names — multi-word names like "Sales Development Rep" produce three
  // tokens "sales", "development", "rep" that we look for individually in artifacts.
  const tokens = uniq(
    raw
      .flatMap((s) => (s || '').split(/[\s\/_-]+/))
      .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
  );

  return { tokens, present: true };
}

function readBrief(packageRoot: string): { productName: string; briefText: string } {
  const briefPath = path.join(packageRoot, 'PROJECT_BRIEF.md');
  const brief = readSafe(briefPath);
  const productSection = brief.match(/##\s+Product\s*\n([^\n#]+)/i);
  const inlineMatch = brief.match(/Product name:\s*([^\n]+)/i);
  const manifest = readSafe(path.join(packageRoot, 'repo', 'manifest.json'));
  let manifestName = '';
  try {
    manifestName = (JSON.parse(manifest || '{}').productName || '').toString();
  } catch {
    manifestName = '';
  }
  const productName =
    (productSection?.[1].trim() || inlineMatch?.[1].trim() || manifestName || 'Unknown Product').replace(/[*_`]+/g, '').trim();
  return { productName, briefText: brief };
}

// 1. Domain vocabulary penetration (Phase B: brief tokens ∪ research tokens)
function auditDomainVocabulary(
  packageRoot: string,
  briefTokens: string[],
  researchVocab: { tokens: string[]; present: boolean }
): DimensionScore {
  const findings: Finding[] = [];
  const evidence: string[] = [];
  // Combined vocabulary: brief + research. Research adds entity/actor/workflow/regulatory
  // names that may not appear in the brief but are domain-correct.
  const combinedTokens = uniq([...briefTokens, ...researchVocab.tokens]);
  const targets = [
    'PHASE_PLAN.md',
    'requirements/FUNCTIONAL_REQUIREMENTS.md',
    'requirements/ACCEPTANCE_CRITERIA.md',
    'SAMPLE_DATA.md',
    'TESTING_STRATEGY.md'
  ];
  let totalHits = 0;
  let totalChecked = 0;
  for (const target of targets) {
    const content = readSafe(path.join(packageRoot, target));
    if (!content) {
      findings.push({ dimension: 'domain-vocabulary', severity: 'warning', message: `Missing ${target}` });
      continue;
    }
    const distinctTokensFound = combinedTokens.filter((t) => countOccurrences(t, content) >= 1).length;
    totalHits += distinctTokensFound;
    totalChecked += 1;
    evidence.push(`${target}: ${distinctTokensFound}/${combinedTokens.length} combined tokens present`);
  }
  // Phase briefs: each phase must have ≥3 distinct domain tokens
  const phasesDir = path.join(packageRoot, 'phases');
  let phasesScored = 0;
  let phasesPassed = 0;
  for (const phaseDir of listFiles(phasesDir)) {
    if (!fs.statSync(phaseDir).isDirectory()) continue;
    const briefContent = readSafe(path.join(phaseDir, 'PHASE_BRIEF.md'));
    if (!briefContent) continue;
    phasesScored += 1;
    const found = combinedTokens.filter((t) => countOccurrences(t, briefContent) >= 1).length;
    if (found >= 3) phasesPassed += 1;
  }
  evidence.push(`phase briefs with ≥3 combined tokens: ${phasesPassed}/${phasesScored}`);
  if (phasesScored > 0 && phasesPassed / phasesScored < 0.8) {
    findings.push({
      dimension: 'domain-vocabulary',
      severity: phasesPassed / phasesScored < 0.5 ? 'blocker' : 'warning',
      message: `${phasesPassed}/${phasesScored} phase briefs contain ≥3 distinct combined tokens`
    });
  }

  // Phase B enforcement: when research is present, measure how much of the
  // research vocabulary actually penetrates the artifacts. Cap the score if
  // penetration is poor — research that's collected and then ignored should
  // not be rewarded.
  let researchPenetrationCap = 20;
  if (researchVocab.present && researchVocab.tokens.length > 0) {
    const aggregateContent = targets.map((t) => readSafe(path.join(packageRoot, t))).join('\n');
    const phaseBriefContent = listFiles(phasesDir)
      .filter((p) => fs.statSync(p).isDirectory())
      .map((p) => readSafe(path.join(p, 'PHASE_BRIEF.md')))
      .join('\n');
    const allContent = `${aggregateContent}\n${phaseBriefContent}`;
    const researchHits = researchVocab.tokens.filter((t) => countOccurrences(t, allContent) >= 1).length;
    const researchCoverage = researchHits / researchVocab.tokens.length;
    evidence.push(
      `research-token coverage across phase-briefs + 5 root files: ${researchHits}/${researchVocab.tokens.length} (${(researchCoverage * 100).toFixed(0)}%)`
    );
    if (researchCoverage < 0.3) {
      findings.push({
        dimension: 'domain-vocabulary',
        severity: 'blocker',
        message: `Research present but only ${(researchCoverage * 100).toFixed(0)}% of research vocabulary lands in artifacts (need ≥30% for full credit)`,
        detail: `Cap applied: max 14/20 until artifact renderers consume more research tokens.`
      });
      researchPenetrationCap = 14;
    } else if (researchCoverage < 0.5) {
      findings.push({
        dimension: 'domain-vocabulary',
        severity: 'warning',
        message: `Research-token coverage is ${(researchCoverage * 100).toFixed(0)}% (target ≥50% for full credit)`
      });
      researchPenetrationCap = 17;
    }
  }

  // Score: 60% weight to phase coverage, 40% to top-level files
  // File score: target 30 distinct domain tokens per file = full 8 points. The
  // denominator is a stable target rather than vocabulary size, so growing the
  // vocabulary (e.g. by adding research tokens) doesn't punish workspaces that
  // had good brief-only coverage. Workspaces with research that lands in
  // artifacts will easily clear the threshold.
  const phaseScore = phasesScored ? (phasesPassed / phasesScored) * 12 : 0;
  const TARGET_HITS_PER_FILE = 30;
  const fileScore = totalChecked
    ? Math.min(8, (totalHits / (totalChecked * TARGET_HITS_PER_FILE)) * 8)
    : 0;
  const score = Math.min(researchPenetrationCap, Math.round(phaseScore + fileScore));
  return { name: 'domain-vocabulary', score, max: 20, weight: 20, findings, evidence };
}

// 2. Anti-generic prose
const GENERIC_PHRASES = [
  /\bthe application\b/gi,
  /\bthe system\b/gi,
  /\bthe user\b/gi,
  /\bthe team\b/gi,
  /\bthe project\b/gi,
  /\breview the plan\b/gi,
  /\bfollow the steps\b/gi,
  /\bas needed\b/gi,
  /\bif applicable\b/gi,
  /\btbd\b/gi,
  /\btodo\b/gi,
  /\[insert [^\]]+\]/gi,
  /\bplaceholder\b/gi,
  /\bto be defined\b/gi
];

function auditAntiGeneric(packageRoot: string): DimensionScore {
  const findings: Finding[] = [];
  const evidence: string[] = [];
  const targets = ['PHASE_PLAN.md', 'requirements/FUNCTIONAL_REQUIREMENTS.md', 'requirements/ACCEPTANCE_CRITERIA.md'];
  const phaseFiles = listFiles(path.join(packageRoot, 'phases'))
    .filter((p) => fs.statSync(p).isDirectory())
    .flatMap((p) => [path.join(p, 'PHASE_BRIEF.md'), path.join(p, 'TEST_SCRIPT.md')]);
  let totalContent = 0;
  let totalGeneric = 0;
  for (const target of [...targets.map((t) => path.join(packageRoot, t)), ...phaseFiles]) {
    const content = readSafe(target);
    if (!content) continue;
    totalContent += content.length;
    let fileGeneric = 0;
    for (const re of GENERIC_PHRASES) {
      fileGeneric += (content.match(re) || []).length;
    }
    totalGeneric += fileGeneric;
  }
  // Density per 10k chars; under 20 is good, 20-40 is warning, >40 is blocker
  const density = totalContent ? (totalGeneric / totalContent) * 10000 : 0;
  evidence.push(`generic phrases: ${totalGeneric} across ${(totalContent / 1000).toFixed(0)}k chars (density ${density.toFixed(1)}/10k)`);
  if (density > 40) {
    findings.push({
      dimension: 'anti-generic',
      severity: 'blocker',
      message: `Generic-phrase density is high (${density.toFixed(1)}/10k chars)`,
      detail: 'Phase briefs and requirements lean on generic language instead of product-specific nouns.'
    });
  } else if (density > 20) {
    findings.push({
      dimension: 'anti-generic',
      severity: 'warning',
      message: `Generic-phrase density is moderate (${density.toFixed(1)}/10k chars)`
    });
  }
  // Score: linear from 15 (density 0) to 0 (density 50)
  const score = Math.max(0, Math.round(15 - (density / 50) * 15));
  return { name: 'anti-generic', score, max: 15, weight: 15, findings, evidence };
}

// 3. Sample data realism
function auditSampleData(packageRoot: string, tokens: string[]): DimensionScore {
  const findings: Finding[] = [];
  const evidence: string[] = [];
  const sampleData = readSafe(path.join(packageRoot, 'SAMPLE_DATA.md'));
  if (!sampleData) {
    findings.push({ dimension: 'sample-data', severity: 'blocker', message: 'SAMPLE_DATA.md missing' });
    return { name: 'sample-data', score: 0, max: 15, weight: 15, findings, evidence };
  }
  const entityHeadings = sampleData.match(/^##\s+([^\n]+)/gm) || [];
  // Filter out the meta sections like "What this file is for", "How to use this file"
  const entities = entityHeadings.filter(
    (h) => !/(what this file|how to use|naming and traceability|sample-data|use this file)/i.test(h)
  );
  const entityCount = entities.length;
  const happyPathBlocks = (sampleData.match(/Happy-path sample/gi) || []).length;
  const negativePathBlocks = (sampleData.match(/Negative-path sample/gi) || []).length;
  const reqRefs = (sampleData.match(/REQ-\d+/g) || []).length;
  const tokenHits = tokens.filter((t) => countOccurrences(t, sampleData) >= 1).length;
  evidence.push(`entities: ${entityCount}, happy: ${happyPathBlocks}, negative: ${negativePathBlocks}, REQ refs: ${reqRefs}, brief tokens: ${tokenHits}/${tokens.length}`);
  if (entityCount < 3) {
    findings.push({ dimension: 'sample-data', severity: 'blocker', message: `Only ${entityCount} entities — need at least 3 distinct domain entities` });
  }
  if (happyPathBlocks < entityCount) {
    findings.push({
      dimension: 'sample-data',
      severity: 'warning',
      message: `${happyPathBlocks} happy-path samples for ${entityCount} entities — every entity should have one`
    });
  }
  if (negativePathBlocks < entityCount) {
    findings.push({
      dimension: 'sample-data',
      severity: 'warning',
      message: `${negativePathBlocks} negative-path samples for ${entityCount} entities`
    });
  }
  if (reqRefs === 0) {
    findings.push({ dimension: 'sample-data', severity: 'blocker', message: 'No REQ-* references in SAMPLE_DATA.md' });
  }
  let score = 0;
  if (entityCount >= 3) score += 4;
  if (entityCount >= 5) score += 1;
  if (happyPathBlocks >= entityCount) score += 3;
  if (negativePathBlocks >= entityCount) score += 3;
  if (reqRefs >= entityCount) score += 2;
  if (tokenHits >= Math.min(5, tokens.length / 3)) score += 2;
  return { name: 'sample-data', score: Math.min(15, score), max: 15, weight: 15, findings, evidence };
}

// 4. Requirement specificity
function auditRequirements(packageRoot: string, tokens: string[]): DimensionScore {
  const findings: Finding[] = [];
  const evidence: string[] = [];
  const reqContent = readSafe(path.join(packageRoot, 'requirements/FUNCTIONAL_REQUIREMENTS.md'));
  if (!reqContent) {
    findings.push({ dimension: 'requirement-specificity', severity: 'blocker', message: 'FUNCTIONAL_REQUIREMENTS.md missing' });
    return { name: 'requirement-specificity', score: 0, max: 15, weight: 15, findings, evidence };
  }
  const reqs = reqContent.match(/##\s+Requirement\s+\d+:[\s\S]*?(?=##\s+Requirement\s+\d+:|$)/g) || [];
  evidence.push(`${reqs.length} requirements detected`);
  if (reqs.length < 5) {
    findings.push({ dimension: 'requirement-specificity', severity: 'blocker', message: `Only ${reqs.length} requirements — expected at least 5` });
  }
  let withActor = 0;
  let withTestable = 0;
  let withEntity = 0;
  let withDomainToken = 0;
  for (const r of reqs) {
    if (/Actor:\s*\S/.test(r)) withActor += 1;
    if (/Testable outcome:\s*\S/.test(r)) withTestable += 1;
    if (/Related entities:\s*\S/.test(r) || /Stored data:\s*\S/.test(r)) withEntity += 1;
    if (tokens.some((t) => countOccurrences(t, r) >= 1)) withDomainToken += 1;
  }
  evidence.push(`with actor: ${withActor}/${reqs.length}, testable: ${withTestable}/${reqs.length}, entity: ${withEntity}/${reqs.length}, domain tokens: ${withDomainToken}/${reqs.length}`);
  if (reqs.length > 0 && withActor / reqs.length < 0.9) {
    findings.push({ dimension: 'requirement-specificity', severity: 'warning', message: `${reqs.length - withActor} requirements lack Actor` });
  }
  if (reqs.length > 0 && withTestable / reqs.length < 0.9) {
    findings.push({ dimension: 'requirement-specificity', severity: 'warning', message: `${reqs.length - withTestable} requirements lack Testable outcome` });
  }
  if (reqs.length > 0 && withDomainToken / reqs.length < 0.7) {
    findings.push({
      dimension: 'requirement-specificity',
      severity: 'blocker',
      message: `Only ${withDomainToken}/${reqs.length} requirements include any brief-derived domain tokens`
    });
  }
  let score = 0;
  if (reqs.length >= 5) score += 4;
  if (reqs.length >= 8) score += 1;
  if (reqs.length > 0) {
    score += Math.round((withActor / reqs.length) * 3);
    score += Math.round((withTestable / reqs.length) * 3);
    score += Math.round((withEntity / reqs.length) * 2);
    score += Math.round((withDomainToken / reqs.length) * 2);
  }
  return { name: 'requirement-specificity', score: Math.min(15, score), max: 15, weight: 15, findings, evidence };
}

// 5. Phase distinctness
function auditPhaseDistinctness(packageRoot: string): DimensionScore {
  const findings: Finding[] = [];
  const evidence: string[] = [];
  const phasesDir = path.join(packageRoot, 'phases');
  const phaseDirs = listFiles(phasesDir).filter((p) => fs.statSync(p).isDirectory());
  const goals: string[] = [];
  for (const dir of phaseDirs) {
    const brief = readSafe(path.join(dir, 'PHASE_BRIEF.md'));
    const goalMatch = brief.match(/##\s+Goal\s*\n([\s\S]*?)\n##/);
    if (goalMatch) goals.push(goalMatch[1].trim());
  }
  if (goals.length < 2) {
    findings.push({ dimension: 'phase-distinctness', severity: 'warning', message: `Only ${goals.length} phase goals found` });
    return {
      name: 'phase-distinctness',
      score: goals.length ? 5 : 0,
      max: 10,
      weight: 10,
      findings,
      evidence: [`${goals.length} phase goals`]
    };
  }
  // Pairwise Jaccard similarity over token sets
  const tokenSets = goals.map((g) => new Set(tokenize(g).filter((t) => !STOP_WORDS.has(t))));
  let highOverlapPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < tokenSets.length; i += 1) {
    for (let j = i + 1; j < tokenSets.length; j += 1) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      const intersect = Array.from(a).filter((t) => b.has(t)).length;
      const union = new Set([...a, ...b]).size;
      const j2 = union ? intersect / union : 0;
      totalPairs += 1;
      if (j2 > 0.7) highOverlapPairs += 1;
    }
  }
  evidence.push(`${highOverlapPairs}/${totalPairs} phase-goal pairs have Jaccard > 0.7`);
  const ratio = totalPairs ? highOverlapPairs / totalPairs : 0;
  if (ratio > 0.3) {
    findings.push({
      dimension: 'phase-distinctness',
      severity: 'blocker',
      message: `${(ratio * 100).toFixed(0)}% of phase-goal pairs are near-duplicates (Jaccard > 0.7)`
    });
  } else if (ratio > 0.1) {
    findings.push({
      dimension: 'phase-distinctness',
      severity: 'warning',
      message: `${(ratio * 100).toFixed(0)}% of phase-goal pairs are similar`
    });
  }
  const score = Math.max(0, Math.round(10 - ratio * 30));
  return { name: 'phase-distinctness', score, max: 10, weight: 10, findings, evidence };
}

// 6. Test-script substance
function auditTestScripts(packageRoot: string, tokens: string[]): DimensionScore {
  const findings: Finding[] = [];
  const evidence: string[] = [];
  const phasesDir = path.join(packageRoot, 'phases');
  const phaseDirs = listFiles(phasesDir).filter((p) => fs.statSync(p).isDirectory());
  let withConcreteAction = 0;
  let withDomainToken = 0;
  let withSampleDataRef = 0;
  let total = 0;
  for (const dir of phaseDirs) {
    const ts = readSafe(path.join(dir, 'TEST_SCRIPT.md'));
    if (!ts) continue;
    total += 1;
    if (/```(?:bash|sh|shell|zsh|powershell|ps1|cmd)/i.test(ts) || /Command or action:\s*\S{30,}/.test(ts)) {
      withConcreteAction += 1;
    }
    if (tokens.some((t) => countOccurrences(t, ts) >= 1)) withDomainToken += 1;
    if (/SAMPLE_DATA\.md|REQ-\d+/.test(ts)) withSampleDataRef += 1;
  }
  evidence.push(`phases with concrete action: ${withConcreteAction}/${total}, domain token: ${withDomainToken}/${total}, sample-data ref: ${withSampleDataRef}/${total}`);
  if (total > 0) {
    if (withConcreteAction / total < 0.8) {
      findings.push({
        dimension: 'test-script-substance',
        severity: 'warning',
        message: `${total - withConcreteAction}/${total} TEST_SCRIPT.md files lack a concrete action or shell command`
      });
    }
    if (withDomainToken / total < 0.7) {
      findings.push({
        dimension: 'test-script-substance',
        severity: 'blocker',
        message: `${withDomainToken}/${total} TEST_SCRIPT.md files reference a brief-derived domain token`
      });
    }
  }
  let score = 0;
  if (total > 0) {
    score += (withConcreteAction / total) * 4;
    score += (withDomainToken / total) * 3;
    score += (withSampleDataRef / total) * 3;
  }
  return { name: 'test-script-substance', score: Math.round(Math.min(10, score)), max: 10, weight: 10, findings, evidence };
}

// 7. Cross-artifact consistency
function auditConsistency(packageRoot: string, productName: string): DimensionScore {
  const findings: Finding[] = [];
  const evidence: string[] = [];
  // REQ IDs in tests must exist in requirements
  const reqContent = readSafe(path.join(packageRoot, 'requirements/FUNCTIONAL_REQUIREMENTS.md'));
  const definedReqs = uniq((reqContent.match(/Requirement\s+(\d+):/g) || []).map((m) => `REQ-${m.match(/\d+/)![0]}`));
  const phasesDir = path.join(packageRoot, 'phases');
  const phaseDirs = listFiles(phasesDir).filter((p) => fs.statSync(p).isDirectory());
  const referenced: Set<string> = new Set();
  for (const dir of phaseDirs) {
    for (const f of ['PHASE_BRIEF.md', 'TEST_SCRIPT.md', 'EVIDENCE_CHECKLIST.md']) {
      const c = readSafe(path.join(dir, f));
      const matches = c.match(/REQ-\d+/g) || [];
      matches.forEach((r) => referenced.add(r));
    }
  }
  const orphanRefs = Array.from(referenced).filter((r) => !definedReqs.includes(r));
  evidence.push(`defined REQs: ${definedReqs.length}, referenced REQs: ${referenced.size}, orphan refs: ${orphanRefs.length}`);
  if (orphanRefs.length > 0) {
    findings.push({
      dimension: 'consistency',
      severity: 'blocker',
      message: `${orphanRefs.length} orphan REQ references (in tests/briefs but not defined in FUNCTIONAL_REQUIREMENTS.md)`,
      detail: orphanRefs.slice(0, 8).join(', ')
    });
  }
  // Product name presence in core files
  const coreFiles = [
    'START_HERE.md',
    'PHASE_PLAN.md',
    'TESTING_STRATEGY.md',
    'REGRESSION_TEST_PLAN.md',
    'TEST_SCRIPT_INDEX.md',
    'AGENTS.md'
  ];
  let withName = 0;
  for (const f of coreFiles) {
    const c = readSafe(path.join(packageRoot, f));
    if (c && c.toLowerCase().includes(productName.toLowerCase())) withName += 1;
  }
  evidence.push(`core files mentioning product name "${productName}": ${withName}/${coreFiles.length}`);
  if (withName / coreFiles.length < 0.5) {
    findings.push({
      dimension: 'consistency',
      severity: 'warning',
      message: `Product name appears in only ${withName}/${coreFiles.length} core planning files`
    });
  }
  let score = 0;
  // Penalize orphan refs harshly
  if (orphanRefs.length === 0) score += 5;
  else if (orphanRefs.length <= 2) score += 3;
  else if (orphanRefs.length <= 5) score += 1;
  // Reward product name density
  score += Math.round((withName / coreFiles.length) * 5);
  return { name: 'consistency', score: Math.min(10, score), max: 10, weight: 10, findings, evidence };
}

// ---------- Phase D: expert rubric ----------
//
// Five deterministic dimensions that score actual research depth, role
// boundaries, regulatory mapping, and sample data realism. Each dimension
// awards 0-N bonus points OR applies a TOTAL CAP when expert content is
// shallow despite research being present.
//
// Caps trump bonuses. If multiple caps apply, the strongest one wins.
//
// Designed so:
//   - workspaces with rich research that artifacts consume → +5..+8 bonus
//   - workspaces with research that artifacts ignore → caps pull total down
//   - workspaces without research are unaffected (expert dims are skipped)

const GENERIC_FAILURE_TRIGGERS = [
  'invalid input',
  'invalid data',
  'user error',
  'validation error',
  'system error',
  'something goes wrong',
  'error occurs'
];

type ResearchExtractsLite = {
  actors: Array<{ id: string; name: string; visibility: string[]; type?: string }>;
  entities: Array<{
    id: string;
    name: string;
    fields: Array<{
      name: string;
      pii?: boolean;
      sensitive?: boolean;
      example?: unknown;
      dbType?: string;
      indexed?: boolean;
      unique?: boolean;
      fk?: { entityId: string; fieldName: string; onDelete: string };
    }>;
    sample: Record<string, unknown>;
    ownerActors: string[];
  }>;
  workflows: Array<{
    name: string;
    steps: Array<{ action?: string; branchOn?: string }>;
    failureModes: Array<{ trigger: string; effect: string; mitigation: string }>;
  }>;
  risks: Array<{ category: string; description: string; mitigation: string; affectedEntities: string[] }>;
  gates: Array<{ name: string; mandatedBy: string; mandatedByDetail?: string; evidenceRequired: string[] }>;
  antiFeatures: Array<{ description: string }>;
  screens?: Array<{
    id: string;
    name: string;
    purpose?: string;
    sections: Array<{ kind: string; title: string }>;
    fields: Array<{ name: string; kind: string; refEntityField?: string }>;
    states: { empty: string; loading: string; error: string; populated: string };
    actions: Array<{ label: string; kind: string; navTo?: string; refWorkflowStep?: string }>;
    navIn: Array<{ screen: string }>;
    navOut: Array<{ screen: string }>;
  }>;
  uxFlow?: Array<{ fromScreen: string; toScreen: string; viaAction: string }>;
  testCases?: Array<{
    id: string;
    workflowId: string;
    scenario: 'happy-path' | 'edge-case' | 'failure-mode';
    testDataRefs: string[];
    expectedFailureRef?: string;
  }>;
  jobsToBeDone?: Array<{
    id: string;
    actorId: string;
    situation: string;
    motivation: string;
    expectedOutcome: string;
    currentWorkaround: string;
    hireForCriteria: string[];
  }>;
  meta?: {
    researcher?: string;
    researchSource?: ResearchSource;
    discovery?: {
      valueProposition?: { headline?: string; oneLineProblem?: string; oneLineSolution?: string; topThreeOutcomes?: string[] };
      whyNow?: { driver?: string; recentChange?: string; risksIfDelayed?: string };
      ideaCritique?: Array<{ weakSpot: string; mitigation: string }>;
      competingAlternatives?: Array<{ name: string; whyInsufficient: string }>;
    };
  };
};

function loadExtracts(packageRoot: string): ResearchExtractsLite | undefined {
  const root = path.join(packageRoot, 'research', 'extracted');
  if (!fs.existsSync(path.join(root, 'meta.json'))) return undefined;
  const safe = (name: string): unknown => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    } catch {
      return undefined;
    }
  };
  return {
    actors: (safe('actors.json') as ResearchExtractsLite['actors']) || [],
    entities: (safe('entities.json') as ResearchExtractsLite['entities']) || [],
    workflows: (safe('workflows.json') as ResearchExtractsLite['workflows']) || [],
    risks: (safe('risks.json') as ResearchExtractsLite['risks']) || [],
    gates: (safe('gates.json') as ResearchExtractsLite['gates']) || [],
    antiFeatures: (safe('antiFeatures.json') as ResearchExtractsLite['antiFeatures']) || [],
    screens: (safe('screens.json') as ResearchExtractsLite['screens']) || undefined,
    uxFlow: (safe('uxFlow.json') as ResearchExtractsLite['uxFlow']) || undefined,
    testCases: (safe('testCases.json') as ResearchExtractsLite['testCases']) || undefined,
    jobsToBeDone: (safe('jobsToBeDone.json') as ResearchExtractsLite['jobsToBeDone']) || undefined,
    meta: (safe('meta.json') as ResearchExtractsLite['meta']) || undefined
  };
}

/**
 * RC2: synthesizer is a deterministic regression harness, not a product
 * critic. Cap judgment-heavy expert dimensions on synth so the headline
 * cannot pretend synth output is equivalent to real-recipe output.
 *
 *   research-depth:      cap 6/10  (real recipe can fully populate)
 *   edge-case-coverage:  cap 7/10  (real recipe can name domain-specific failures)
 *   idea-clarity:        cap 2/5   (already enforced via existing rule)
 *
 * Structural dimensions (screen-depth, schema-realism, test-case-grounding,
 * jtbd-coverage, realistic-sample-data, role-permission-matrix,
 * regulatory-mapping) remain uncapped — synth proves the generator works.
 *
 * Caps are NOT promoted to expert blocker caps (the lowest-applied total
 * stays at 100 for synth). They simply prevent synth from claiming full
 * judgment-heavy credit, and feed into demoReady=false.
 */
function synthJudgmentCap(source: ResearchSource, dimension: string): number | undefined {
  if (source !== 'synthesized') return undefined;
  if (dimension === 'research-depth') return 6;
  if (dimension === 'edge-case-coverage') return 7;
  return undefined;
}

// E1. research-depth (max +2 bonus, cap=85 when score < 4/10)
function expertResearchDepth(ex: ResearchExtractsLite, source: ResearchSource): ExpertScore {
  const evidence: string[] = [];
  let score = 0;
  if (ex.entities.length >= 3) {
    score += 1;
    evidence.push(`entities: ${ex.entities.length} (≥3)`);
  } else {
    evidence.push(`entities: ${ex.entities.length} (need ≥3)`);
  }
  if (ex.actors.length >= 2) {
    score += 1;
    evidence.push(`actors: ${ex.actors.length} (≥2)`);
  }
  if (ex.workflows.length >= 3) {
    score += 1;
    evidence.push(`workflows: ${ex.workflows.length} (≥3)`);
  }
  // Workflow step depth: each workflow ≥5 steps
  const deepWorkflows = ex.workflows.filter((w) => w.steps.length >= 5).length;
  if (deepWorkflows >= ex.workflows.length && ex.workflows.length > 0) {
    score += 2;
    evidence.push(`all ${ex.workflows.length} workflows have ≥5 steps`);
  } else {
    evidence.push(`only ${deepWorkflows}/${ex.workflows.length} workflows have ≥5 steps`);
    score += Math.max(0, Math.round((deepWorkflows / Math.max(1, ex.workflows.length)) * 2));
  }
  // Decision points: ≥1 step in any workflow has branchOn
  const branchPoints = ex.workflows.reduce(
    (sum, w) => sum + w.steps.filter((s) => s.branchOn && s.branchOn.trim().length > 0).length,
    0
  );
  if (branchPoints >= 2) {
    score += 1;
    evidence.push(`workflow decision points (branchOn): ${branchPoints} (≥2)`);
  } else {
    evidence.push(`workflow decision points (branchOn): ${branchPoints} (need ≥2)`);
  }
  // Failure modes per workflow
  const wfWithFm = ex.workflows.filter((w) => w.failureModes && w.failureModes.length >= 2).length;
  if (wfWithFm >= ex.workflows.length && ex.workflows.length > 0) {
    score += 2;
    evidence.push(`all ${ex.workflows.length} workflows have ≥2 failure modes`);
  } else {
    score += Math.max(0, Math.round((wfWithFm / Math.max(1, ex.workflows.length)) * 2));
    evidence.push(`only ${wfWithFm}/${ex.workflows.length} workflows have ≥2 failure modes`);
  }
  // PII/sensitive fields tagged on at least one entity
  const piiTagged = ex.entities.some((e) => e.fields.some((f) => f.pii || f.sensitive));
  if (piiTagged) {
    score += 1;
    evidence.push('at least one entity has pii/sensitive field tagged');
  } else {
    evidence.push('no entity has pii/sensitive field tagged');
  }
  // Cap: if score < 4/10, cap total at 85 (production-ready boundary)
  const cap = score < 4 ? { applied: 85, reason: `research depth ${score}/10 — too shallow for production-ready` } : undefined;
  // RC2: synth judgment cap. Don't penalize synth as a generator failure —
  // just don't give full real-recipe credit on this judgment dimension.
  const synthCap = synthJudgmentCap(source, 'research-depth');
  if (synthCap !== undefined && score > synthCap) {
    evidence.push(`synthesized research source — capped at ${synthCap}/10 on judgment-heavy dimension; run docs/RESEARCH_RECIPE.md for full credit`);
    score = synthCap;
  }
  return { name: 'research-depth', score: Math.min(10, score), max: 10, evidence, cap };
}

// E2. edge-case-coverage (max +2 bonus, cap=86 when generic-failure-mode rate ≥40%)
function expertEdgeCaseCoverage(ex: ResearchExtractsLite, packageRoot: string, source: ResearchSource): ExpertScore {
  const evidence: string[] = [];
  let score = 0;
  const allTriggers = ex.workflows.flatMap((w) => (w.failureModes || []).map((f) => f.trigger.toLowerCase()));
  const generic = allTriggers.filter((t) => GENERIC_FAILURE_TRIGGERS.some((g) => t.includes(g))).length;
  const total = allTriggers.length;
  const genericRate = total ? generic / total : 1;
  evidence.push(`workflow failure-mode triggers: ${total}, generic phrases: ${generic} (${(genericRate * 100).toFixed(0)}%)`);
  if (total > 0 && genericRate < 0.1) {
    score += 4;
    evidence.push('failure modes are concrete and domain-specific');
  } else if (total > 0 && genericRate < 0.4) {
    score += 2;
    evidence.push('most failure modes are concrete');
  }
  // Each REQ in FUNCTIONAL_REQUIREMENTS has a Failure case naming a specific scenario
  const reqContent = readSafe(path.join(packageRoot, 'requirements/FUNCTIONAL_REQUIREMENTS.md'));
  const reqBlocks = reqContent.match(/##\s+Requirement\s+\d+:[\s\S]*?(?=##\s+Requirement\s+\d+:|$)/g) || [];
  const reqsWithFailure = reqBlocks.filter((r) => /Failure case|Failure handling/.test(r)).length;
  if (reqBlocks.length > 0 && reqsWithFailure / reqBlocks.length >= 0.9) {
    score += 3;
    evidence.push(`${reqsWithFailure}/${reqBlocks.length} REQs name a failure case`);
  } else {
    evidence.push(`only ${reqsWithFailure}/${reqBlocks.length} REQs name a failure case`);
    score += Math.round((reqsWithFailure / Math.max(1, reqBlocks.length)) * 3);
  }
  // ≥1 failure mode references a regulatory concern
  const refsRegulation = ex.workflows.some((w) =>
    (w.failureModes || []).some((f) => /\b(GDPR|CAN-SPAM|HIPAA|CPRA|CCPA|FERPA|PCI|TCPA|CASL|COPPA|opt-out|consent|audit|reputation|sender)\b/i.test(`${f.trigger} ${f.effect} ${f.mitigation}`))
  );
  if (refsRegulation) {
    score += 3;
    evidence.push('at least one failure mode references a regulatory or systemic concern');
  } else {
    evidence.push('no failure mode references a regulatory or systemic concern');
  }
  const cap = total > 3 && genericRate >= 0.4 ? { applied: 86, reason: `${(genericRate * 100).toFixed(0)}% of failure-mode triggers are generic ("invalid input", "user error", etc.)` } : undefined;
  // RC2: synth judgment cap. Real-recipe can name domain-specific edge cases
  // that the deterministic synthesizer cannot.
  const synthCap = synthJudgmentCap(source, 'edge-case-coverage');
  if (synthCap !== undefined && score > synthCap) {
    evidence.push(`synthesized research source — capped at ${synthCap}/10 on judgment-heavy dimension; run docs/RESEARCH_RECIPE.md for full credit`);
    score = synthCap;
  }
  return { name: 'edge-case-coverage', score: Math.min(10, score), max: 10, evidence, cap };
}

// E3. role-permission-matrix (max +2 bonus, cap=87 when actors > 1 and matrix missing/weak)
function expertPermissionMatrix(ex: ResearchExtractsLite, packageRoot: string): ExpertScore {
  const evidence: string[] = [];
  let score = 0;
  const filePath = path.join(packageRoot, 'requirements/PERMISSION_MATRIX.md');
  const content = readSafe(filePath);
  const fileExists = content.length > 0;
  if (fileExists) {
    score += 2;
    evidence.push('requirements/PERMISSION_MATRIX.md exists');
  } else {
    evidence.push('requirements/PERMISSION_MATRIX.md missing');
  }
  // Cell coverage: count grid cells (rows × cols) and ensure ≥80% are populated with non-blank values.
  let totalCells = 0;
  let filledCells = 0;
  const denyCount = (content.match(/\bDENY\b/g) || []).length;
  if (fileExists) {
    const rows = content.match(/^\|\s+\*\*[^|]+\*\*[^\n]*$/gm) || [];
    for (const row of rows) {
      const cells = row.split('|').slice(2, -1).map((c) => c.trim());
      totalCells += cells.length;
      filledCells += cells.filter((c) => c.length > 0 && c !== '—').length;
    }
    const fillRate = totalCells ? filledCells / totalCells : 0;
    evidence.push(`grid coverage: ${filledCells}/${totalCells} cells filled (${(fillRate * 100).toFixed(0)}%)`);
    if (fillRate >= 0.95) score += 4;
    else if (fillRate >= 0.8) score += 3;
    else if (fillRate >= 0.5) score += 1;
    if (denyCount >= 1) {
      score += 2;
      evidence.push(`${denyCount} DENY cells (boundary enforcement is explicit)`);
    } else {
      evidence.push('no DENY cells (cannot tell if role boundaries are enforced)');
    }
    // ≥3 actors and ≥3 entities means the matrix is meaningful
    if (ex.actors.length >= 3 && ex.entities.length >= 3) {
      score += 2;
      evidence.push(`${ex.actors.length} actors × ${ex.entities.length} entities is meaningful coverage`);
    }
  }
  const cap = ex.actors.length > 1 && (!fileExists || filledCells === 0)
    ? { applied: 87, reason: 'multiple actors but no permission matrix' }
    : ex.actors.length > 1 && denyCount === 0 && fileExists
      ? { applied: 88, reason: 'permission matrix has no DENY cells (role boundaries not enforced)' }
      : undefined;
  return { name: 'role-permission-matrix', score: Math.min(10, score), max: 10, evidence, cap };
}

// E4. regulatory-mapping (max +1 bonus, cap=87 when citations exist in research but absent from artifacts)
function expertRegulatoryMapping(ex: ResearchExtractsLite, packageRoot: string): ExpertScore {
  const evidence: string[] = [];
  const score = (() => {
    const allCitations = new Set<string>();
    const citationRe = /\b(GDPR(?:\s+Art\.?\s*\d+)?|CAN-SPAM|HIPAA|CPRA|CCPA|FERPA|PCI(?:\s+DSS)?|SOC\s*2|TCPA|CASL|COPPA)\b/gi;
    for (const g of ex.gates) {
      const text = `${g.name} ${g.mandatedByDetail || ''}`;
      const m = text.match(citationRe) || [];
      m.forEach((c) => allCitations.add(c.trim()));
    }
    for (const r of ex.risks) {
      const text = `${r.description} ${r.mitigation}`;
      const m = text.match(citationRe) || [];
      m.forEach((c) => allCitations.add(c.trim()));
    }
    if (allCitations.size === 0) {
      evidence.push('no regulatory citations in research — regulatory mapping skipped');
      return 5; // full credit when no regulation applies (e.g. internal tool)
    }
    evidence.push(`research has ${allCitations.size} regulatory citations`);
    let s = 0;
    // (a) requirements/REGULATORY_NOTES.md exists and contains the citations
    const regNotes = readSafe(path.join(packageRoot, 'requirements/REGULATORY_NOTES.md'));
    if (regNotes) {
      s += 1;
      const present = Array.from(allCitations).filter((c) => regNotes.toLowerCase().includes(c.toLowerCase()));
      evidence.push(`REGULATORY_NOTES present, contains ${present.length}/${allCitations.size} citations`);
      if (present.length / allCitations.size >= 0.8) s += 2;
      else if (present.length / allCitations.size >= 0.5) s += 1;
    } else {
      evidence.push('REGULATORY_NOTES missing');
    }
    // (b) at least 1 citation appears in security-risk docs
    const securityDocs = listFiles(path.join(packageRoot, 'security-risk'))
      .filter((p) => p.endsWith('.md'))
      .map((p) => readSafe(p))
      .join('\n');
    const inSecurity = Array.from(allCitations).some((c) => securityDocs.toLowerCase().includes(c.toLowerCase()));
    if (inSecurity) {
      s += 1;
      evidence.push('citations appear in security-risk/ docs');
    } else {
      evidence.push('citations missing from security-risk/ docs');
    }
    // (c) at least 1 citation appears in TEST_SCRIPT.md somewhere
    const phasesDir = path.join(packageRoot, 'phases');
    const testScripts = listFiles(phasesDir)
      .filter((p) => fs.statSync(p).isDirectory())
      .map((p) => readSafe(path.join(p, 'TEST_SCRIPT.md')))
      .join('\n');
    const inTests = Array.from(allCitations).some((c) => testScripts.toLowerCase().includes(c.toLowerCase()));
    if (inTests) {
      s += 1;
      evidence.push('citations appear in at least one phase TEST_SCRIPT.md');
    } else {
      evidence.push('citations missing from all phase TEST_SCRIPT.md files');
    }
    return Math.min(5, s);
  })();
  const cap = score < 2
    ? { applied: 87, reason: 'regulatory citations exist in research but are not surfaced in workspace artifacts' }
    : undefined;
  return { name: 'regulatory-mapping', score, max: 5, evidence, cap };
}

// E5. realistic-sample-data (max +1 bonus, cap=88 when sample IDs are placeholder-ish)
function expertRealisticSampleData(ex: ResearchExtractsLite): ExpertScore {
  const evidence: string[] = [];
  let score = 0;
  // Examine entity samples for ID-like fields. Acceptable: domain-prefixed
  // (e.g. "acct-acme-001", "MRN-484823", "lead-acme-jordan-001"). Generic:
  // "record-001", "entity-001", "id-001", short numeric, etc.
  let totalIds = 0;
  let domainConventional = 0;
  for (const e of ex.entities) {
    const sample = e.sample as Record<string, unknown>;
    for (const [key, val] of Object.entries(sample || {})) {
      if (typeof val !== 'string') continue;
      if (!/id$|Id$|ref$/i.test(key)) continue;
      totalIds += 1;
      const isGeneric = /^(record|entity|item|user|audit|object)-\d{1,4}$/i.test(val) || /^id-\d+$/i.test(val);
      const isDomain = /^[a-z]{2,}-[a-z0-9-]{3,}$/i.test(val) && !isGeneric;
      if (isDomain) domainConventional += 1;
    }
  }
  evidence.push(`entity-sample IDs: ${totalIds}, domain-conventional: ${domainConventional}`);
  if (totalIds > 0) {
    const ratio = domainConventional / totalIds;
    if (ratio >= 0.9) score += 5;
    else if (ratio >= 0.6) score += 3;
    else if (ratio >= 0.3) score += 1;
  }
  // Cap: when research has entities but sample IDs are mostly generic
  const cap = totalIds >= 3 && domainConventional / totalIds < 0.3
    ? { applied: 88, reason: `${domainConventional}/${totalIds} entity sample IDs follow domain conventions (need ≥30%)` }
    : undefined;
  return { name: 'realistic-sample-data', score: Math.min(5, score), max: 5, evidence, cap };
}

// E6 (Phase E2). screen-depth (max 10) — only scored when extractions include screens.
function expertScreenDepth(ex: ResearchExtractsLite, packageRoot: string): ExpertScore | undefined {
  if (!ex.screens || ex.screens.length === 0) return undefined;
  const evidence: string[] = [];
  let score = 0;

  const totalScreens = ex.screens.length;
  const totalSections = ex.screens.reduce((s, x) => s + (x.sections?.length || 0), 0);
  const totalFields = ex.screens.reduce((s, x) => s + (x.fields?.length || 0), 0);
  const totalActions = ex.screens.reduce((s, x) => s + (x.actions?.length || 0), 0);
  evidence.push(
    `screens: ${totalScreens}, avg sections=${(totalSections / totalScreens).toFixed(1)}, avg fields=${(totalFields / totalScreens).toFixed(1)}, avg actions=${(totalActions / totalScreens).toFixed(1)}`
  );

  // Reward avg section/field/action depth (up to 4 points)
  const avgSections = totalSections / totalScreens;
  const avgFields = totalFields / totalScreens;
  const avgActions = totalActions / totalScreens;
  if (avgSections >= 3) score += 1;
  if (avgFields >= 4) score += 2;
  if (avgActions >= 2) score += 1;

  // All four states must be filled per screen (up to 2 points). If any screen
  // is missing a state, the screen is partially scored.
  const stateKeys: Array<keyof ResearchExtractsLite['screens'] extends Array<infer S> ? (S extends { states: infer T } ? keyof T : never) : never> =
    ['empty', 'loading', 'error', 'populated'] as never[];
  let fullyStated = 0;
  for (const screen of ex.screens) {
    let filled = 0;
    for (const k of stateKeys) {
      if ((screen.states as unknown as Record<string, unknown>)?.[k as string]) filled += 1;
    }
    if (filled === 4) fullyStated += 1;
  }
  evidence.push(`screens with all four states defined: ${fullyStated}/${totalScreens}`);
  if (fullyStated === totalScreens) score += 2;
  else if (fullyStated >= totalScreens * 0.8) score += 1;

  // Navigation symmetry: every action with navTo should have a matching navOut entry, and
  // every navOut should be reachable as a navIn on the target screen (up to 2 points).
  let symmetricEdges = 0;
  let totalEdges = 0;
  for (const s of ex.screens) {
    for (const out of s.navOut || []) {
      totalEdges += 1;
      const target = ex.screens.find((x) => x.id === out.screen);
      if (target && (target.navIn || []).some((i) => i.screen === s.id)) symmetricEdges += 1;
    }
  }
  evidence.push(`navigation edges: ${totalEdges}, symmetric: ${symmetricEdges}`);
  if (totalEdges > 0) {
    const ratio = symmetricEdges / totalEdges;
    if (ratio >= 0.8) score += 2;
    else if (ratio >= 0.5) score += 1;
  }

  // UX_FLOW.md presence (1 point)
  const uxFlowPresent = fs.existsSync(path.join(packageRoot, 'ui-ux/UX_FLOW.md'));
  if (uxFlowPresent) score += 1;
  evidence.push(`ui-ux/UX_FLOW.md present: ${uxFlowPresent}`);

  // Per-screen specs present (already 0/1 contributed; cap on missing files)
  let specFilesPresent = 0;
  for (const s of ex.screens) {
    if (fs.existsSync(path.join(packageRoot, 'ui-ux', 'screens', `${s.id}.md`))) specFilesPresent += 1;
  }
  evidence.push(`per-screen spec files present: ${specFilesPresent}/${totalScreens}`);

  // Cap when ≥1 screen is missing all four states (the empty/loading/error/populated contract)
  const missingStates = totalScreens - fullyStated;
  const cap =
    missingStates > 0 && missingStates / totalScreens >= 0.5
      ? { applied: 89, reason: `${missingStates}/${totalScreens} screens missing required state contract (empty/loading/error/populated)` }
      : undefined;

  return { name: 'screen-depth', score: Math.min(10, score), max: 10, evidence, cap };
}

// E7 (Phase E3). schema-realism (max 10) — only scored when entity fields carry dbType.
function expertSchemaRealism(ex: ResearchExtractsLite, packageRoot: string): ExpertScore | undefined {
  const allFields = ex.entities.flatMap((e) => e.fields);
  if (allFields.length === 0) return undefined;
  const fieldsWithDbType = allFields.filter((f) => f.dbType);
  if (fieldsWithDbType.length === 0) return undefined;

  const evidence: string[] = [];
  let score = 0;

  const dbTypeRatio = fieldsWithDbType.length / allFields.length;
  evidence.push(`fields with dbType: ${fieldsWithDbType.length}/${allFields.length} (${Math.round(dbTypeRatio * 100)}%)`);
  if (dbTypeRatio >= 0.95) score += 3;
  else if (dbTypeRatio >= 0.7) score += 2;
  else if (dbTypeRatio >= 0.4) score += 1;

  const fkFields = allFields.filter((f) => f.fk);
  evidence.push(`fields with fk: ${fkFields.length}`);
  if (fkFields.length >= 2) score += 2;
  else if (fkFields.length >= 1) score += 1;

  const indexedFields = allFields.filter((f) => f.indexed);
  evidence.push(`indexed fields: ${indexedFields.length}`);
  if (indexedFields.length >= ex.entities.length) score += 2;   // ≥1 index per table
  else if (indexedFields.length >= Math.ceil(ex.entities.length * 0.5)) score += 1;

  const ddlPresent = fs.existsSync(path.join(packageRoot, 'architecture/DATABASE_SCHEMA.sql'));
  evidence.push(`architecture/DATABASE_SCHEMA.sql present: ${ddlPresent}`);
  if (ddlPresent) score += 2;

  const dataModelMd = readSafe(path.join(packageRoot, 'architecture/DATABASE_SCHEMA.md'));
  const tablesMentioned = ex.entities.filter((e) => dataModelMd.toLowerCase().includes(e.name.toLowerCase())).length;
  evidence.push(`DATABASE_SCHEMA.md mentions ${tablesMentioned}/${ex.entities.length} entities`);
  if (ex.entities.length && tablesMentioned === ex.entities.length) score += 1;

  const cap =
    dbTypeRatio < 0.4 || !ddlPresent
      ? { applied: 90, reason: `schema realism weak: dbType ratio ${Math.round(dbTypeRatio * 100)}%, DDL present=${ddlPresent}` }
      : undefined;

  return { name: 'schema-realism', score: Math.min(10, score), max: 10, evidence, cap };
}

// E8 (Phase E3). test-case-grounding (max 10) — only when extractions include testCases.
function expertTestCaseGrounding(ex: ResearchExtractsLite): ExpertScore | undefined {
  if (!ex.testCases || ex.testCases.length === 0) return undefined;

  const evidence: string[] = [];
  let score = 0;

  // Build the set of valid sample data refs from entity samples + variant heuristics.
  const validRefs = new Set<string>();
  for (const e of ex.entities) {
    const sample = e.sample as Record<string, unknown>;
    for (const [, v] of Object.entries(sample || {})) {
      if (typeof v === 'string' && v.length >= 3) validRefs.add(v);
    }
  }
  // Also accept variant- and negative- prefixed refs.
  const total = ex.testCases.length;
  const refOk = ex.testCases.filter((t) =>
    t.testDataRefs.some(
      (r) => validRefs.has(r) || /^variant-/.test(r) || /^negative-/.test(r)
    )
  ).length;
  evidence.push(`test cases with grounded sample refs: ${refOk}/${total}`);
  const refRatio = total ? refOk / total : 0;
  if (refRatio >= 0.95) score += 4;
  else if (refRatio >= 0.7) score += 2;
  else if (refRatio >= 0.4) score += 1;

  // Failure-mode coverage: every researched failure mode should have ≥1 matching case.
  const totalFailureModes = ex.workflows.reduce((s, w) => s + w.failureModes.length, 0);
  const coveredFailureModes = new Set<string>();
  for (const t of ex.testCases) {
    if (t.scenario === 'failure-mode' && t.expectedFailureRef) {
      coveredFailureModes.add(`${t.workflowId}:${t.expectedFailureRef}`);
    }
  }
  evidence.push(`failure-mode coverage: ${coveredFailureModes.size}/${totalFailureModes}`);
  const fmRatio = totalFailureModes ? coveredFailureModes.size / totalFailureModes : 1;
  if (fmRatio >= 0.95) score += 3;
  else if (fmRatio >= 0.7) score += 2;
  else if (fmRatio >= 0.4) score += 1;

  // Scenario sanity: every workflow should have ≥1 happy-path test.
  const wfsWithHappy = new Set<string>();
  for (const t of ex.testCases) if (t.scenario === 'happy-path') wfsWithHappy.add(t.workflowId);
  evidence.push(`workflows with ≥1 happy-path test: ${wfsWithHappy.size}/${ex.workflows.length}`);
  const happyRatio = ex.workflows.length ? wfsWithHappy.size / ex.workflows.length : 1;
  if (happyRatio >= 0.95) score += 2;
  else if (happyRatio >= 0.7) score += 1;

  // Edge-case presence (any) is a small bonus.
  const hasEdge = ex.testCases.some((t) => t.scenario === 'edge-case');
  evidence.push(`edge-case tests present: ${hasEdge}`);
  if (hasEdge) score += 1;

  const cap =
    refRatio < 0.4 || happyRatio < 0.4
      ? { applied: 91, reason: `test cases poorly grounded: ref ratio ${Math.round(refRatio * 100)}%, workflow happy-path ratio ${Math.round(happyRatio * 100)}%` }
      : undefined;

  return { name: 'test-case-grounding', score: Math.min(10, score), max: 10, evidence, cap };
}

// E9 (Phase E4). jtbd-coverage (max 5) — only when extractions include JTBDs.
function expertJtbdCoverage(ex: ResearchExtractsLite): ExpertScore | undefined {
  if (!ex.jobsToBeDone || ex.jobsToBeDone.length === 0) return undefined;

  const evidence: string[] = [];
  let score = 0;

  // 1. Coverage: ≥1 JTBD per actor.
  const actorIds = new Set(ex.actors.map((a) => a.id));
  const covered = new Set(ex.jobsToBeDone.map((j) => j.actorId));
  const missing = [...actorIds].filter((id) => !covered.has(id));
  evidence.push(`actors with ≥1 JTBD: ${covered.size}/${actorIds.size}`);
  if (missing.length === 0) score += 2;
  else if (missing.length <= Math.ceil(actorIds.size * 0.25)) score += 1;

  // 2. Outcomes are measurable (not vague).
  const vaguePatterns = [/feel better/i, /be more productive/i, /save time/i, /improve experience/i, /increase efficiency/i];
  const concreteOutcomes = ex.jobsToBeDone.filter((j) => !vaguePatterns.some((p) => p.test(j.expectedOutcome))).length;
  evidence.push(`JTBDs with concrete (non-vague) expected outcome: ${concreteOutcomes}/${ex.jobsToBeDone.length}`);
  const concreteRatio = concreteOutcomes / ex.jobsToBeDone.length;
  if (concreteRatio >= 0.95) score += 2;
  else if (concreteRatio >= 0.7) score += 1;

  // 3. Hire-for criteria present.
  const hireForOk = ex.jobsToBeDone.filter((j) => j.hireForCriteria && j.hireForCriteria.length >= 2).length;
  evidence.push(`JTBDs with ≥2 hire-for criteria: ${hireForOk}/${ex.jobsToBeDone.length}`);
  if (hireForOk === ex.jobsToBeDone.length) score += 1;

  const cap =
    missing.length > Math.ceil(actorIds.size * 0.5)
      ? { applied: 92, reason: `${missing.length}/${actorIds.size} actors lack a JTBD` }
      : undefined;

  return { name: 'jtbd-coverage', score: Math.min(5, score), max: 5, evidence, cap };
}

// E10 (Phase E4 / RC2). idea-clarity (max 5) — credits non-empty, non-generic critique
// only when the research source is not synthesized.
function expertIdeaClarity(ex: ResearchExtractsLite, source: ResearchSource): ExpertScore | undefined {
  const discovery = ex.meta?.discovery;
  if (!discovery) return undefined;

  const evidence: string[] = [];
  let score = 0;

  const vp = discovery.valueProposition;
  if (vp) {
    const headline = vp.headline || '';
    const isGeneric = /the application helps|the system helps|better experience|improved efficiency|streamline/i.test(headline);
    evidence.push(`headline non-generic: ${!isGeneric}`);
    if (headline && !isGeneric) score += 1;
    if ((vp.topThreeOutcomes || []).length >= 3) {
      evidence.push(`top-three outcomes present: ${vp.topThreeOutcomes!.length}`);
      score += 1;
    } else {
      evidence.push(`top-three outcomes present: ${(vp.topThreeOutcomes || []).length}`);
    }
  } else {
    evidence.push(`valueProposition: missing`);
  }

  const wn = discovery.whyNow;
  if (wn && wn.driver && wn.recentChange && wn.risksIfDelayed) {
    evidence.push(`whyNow complete: yes`);
    score += 1;
  } else {
    evidence.push(`whyNow complete: no`);
  }

  // Critique only credited for real research sources (agent-recipe / imported-real / manual).
  // Synth deliberately leaves critique empty — see deriveDiscovery in the synthesizer.
  const isSynth = source === 'synthesized';
  const critique = discovery.ideaCritique || [];
  const alternatives = discovery.competingAlternatives || [];
  evidence.push(`researchSource: ${source}, researcher: ${ex.meta?.researcher || 'unknown'}, critique entries: ${critique.length}, alternatives: ${alternatives.length}`);
  if (!isSynth) {
    if (critique.length >= 3) score += 1;
    if (alternatives.length >= 1) score += 1;
  } else {
    // Synth: don't punish (no cap), don't reward (no critique credit).
    evidence.push(`synthesized research source — critique not credited (run docs/RESEARCH_RECIPE.md for full idea-clarity score)`);
  }

  return { name: 'idea-clarity', score: Math.min(5, score), max: 5, evidence };
}

// ===== Phase F3: comprehensive-depth dimensions (E11–E16) =====

// E11. workflow-step-realism (max 5) — penalize templated CRUD verbs
function expertWorkflowStepRealism(ex: ResearchExtractsLite): ExpertScore {
  const evidence: string[] = [];
  // Generic step patterns that synth used to emit before pack-aware F1.
  const TEMPLATED_PATTERNS = [
    /^create a new\s/i,
    /^edit the .* (title|status)/i,
    /^view the dashboard for status/i,
    /^open .* and authenticate/i,
    /^review the .* before it is considered final/i,
    /^run the workflow/i
  ];
  const allSteps = ex.workflows.flatMap((w) => w.steps);
  if (allSteps.length === 0) {
    evidence.push('no workflow steps to score');
    return { name: 'workflow-step-realism', score: 0, max: 5, evidence };
  }
  const templated = allSteps.filter((s) => TEMPLATED_PATTERNS.some((p) => p.test(s.action || '')));
  const fraction = templated.length / allSteps.length;
  evidence.push(`workflow steps: ${allSteps.length}, templated CRUD: ${templated.length} (${(fraction * 100).toFixed(0)}%)`);
  const score = Math.max(0, Math.round(5 * (1 - fraction)));
  // Phase F3: dim scores signal depth without capping the headline; the headline
  // /100 ceiling is preserved per Phase E5 decision (downstream consumers depend
  // on fixed thresholds). Real signal lives in per-dim scores.
  return { name: 'workflow-step-realism', score: Math.min(5, score), max: 5, evidence };
}

// E12. requirement-failure-variance (max 5) — penalize identical failure cases across REQs
function expertFailureVariance(packageRoot: string): ExpertScore {
  const evidence: string[] = [];
  const reqsContent = readSafe(path.join(packageRoot, 'requirements/FUNCTIONAL_REQUIREMENTS.md'));
  if (!reqsContent) {
    evidence.push('FUNCTIONAL_REQUIREMENTS.md missing');
    return { name: 'requirement-failure-variance', score: 0, max: 5, evidence };
  }
  // Pull every "Failure case:" line.
  const failureLines = (reqsContent.match(/Failure case:[^\n]+/g) || []).map((s) => s.replace(/^Failure case:\s*/, '').trim().toLowerCase());
  if (failureLines.length < 2) {
    evidence.push(`only ${failureLines.length} failure-case lines — insufficient to score variance`);
    return { name: 'requirement-failure-variance', score: 5, max: 5, evidence };
  }
  // Count how many failure-case lines are duplicates (Jaccard-like via exact substring containment after normalizing whitespace).
  const norm = failureLines.map((s) => s.replace(/\s+/g, ' '));
  const counts = new Map<string, number>();
  for (const s of norm) counts.set(s, (counts.get(s) || 0) + 1);
  const dupCount = Array.from(counts.values()).filter((c) => c > 1).reduce((sum, c) => sum + (c - 1), 0);
  const dupFraction = dupCount / norm.length;
  evidence.push(`failure-case lines: ${norm.length}, duplicate-occurrence count: ${dupCount} (${(dupFraction * 100).toFixed(0)}%)`);
  const score = Math.max(0, Math.round(5 * (1 - dupFraction)));
  return { name: 'requirement-failure-variance', score: Math.min(5, score), max: 5, evidence };
}

// E13. entity-field-richness (max 5) — credit domain depth on entity fields
function expertEntityFieldRichness(ex: ResearchExtractsLite): ExpertScore {
  const evidence: string[] = [];
  if (ex.entities.length === 0) {
    evidence.push('no entities');
    return { name: 'entity-field-richness', score: 0, max: 5, evidence };
  }
  const totalFields = ex.entities.reduce((s, e) => s + e.fields.length, 0);
  const meanFields = totalFields / ex.entities.length;
  const entitiesWithExtras = ex.entities.filter((e) => {
    const hasEnumOrFk = e.fields.some((f) => f.dbType === 'ENUM' || f.fk || f.indexed || f.pii || f.sensitive);
    return hasEnumOrFk;
  }).length;
  const extrasFraction = entitiesWithExtras / ex.entities.length;
  evidence.push(`entities: ${ex.entities.length}, mean fields/entity: ${meanFields.toFixed(1)} (target ≥6)`);
  evidence.push(`entities with enum / fk / indexed / pii / sensitive flags: ${entitiesWithExtras}/${ex.entities.length}`);
  // Score: 3 points for mean fields ≥6, 2 points for ≥80% entities have extras.
  let score = 0;
  score += Math.min(3, Math.round((meanFields / 6) * 3));
  score += Math.round(extrasFraction * 2);
  return { name: 'entity-field-richness', score: Math.min(5, score), max: 5, evidence };
}

// E14. per-screen-acceptance-uniqueness (max 5) — credit screens with distinct purposes
function expertPerScreenAcceptanceUniqueness(ex: ResearchExtractsLite, packageRoot: string): ExpertScore | undefined {
  if (!ex.screens || ex.screens.length === 0) return undefined;
  const evidence: string[] = [];
  const purposes = ex.screens.map((s) => (s.purpose || s.name).toLowerCase().replace(/\s+/g, ' ').trim());
  // Count unique purposes
  const set = new Set(purposes);
  const uniqueFraction = set.size / purposes.length;
  evidence.push(`screens: ${ex.screens.length}, unique purposes: ${set.size} (${(uniqueFraction * 100).toFixed(0)}%)`);
  // Bonus signal: PER_SCREEN_REQUIREMENTS.md present
  const perScreenReqs = readSafe(path.join(packageRoot, 'requirements/PER_SCREEN_REQUIREMENTS.md'));
  if (perScreenReqs && /Screen-specific acceptance/i.test(perScreenReqs)) {
    evidence.push('requirements/PER_SCREEN_REQUIREMENTS.md present with per-screen acceptance');
  } else {
    evidence.push('requirements/PER_SCREEN_REQUIREMENTS.md missing or lacks per-screen acceptance section');
  }
  const score = Math.round(5 * uniqueFraction);
  return { name: 'per-screen-acceptance-uniqueness', score: Math.min(5, score), max: 5, evidence };
}

// E15. use-case-depth (max 5) — credit USE_CASES.md depth
function expertUseCaseDepth(packageRoot: string, ex: ResearchExtractsLite, source: ResearchSource): ExpertScore | undefined {
  const md = readSafe(path.join(packageRoot, 'product-strategy/USE_CASES.md'));
  if (!md) return undefined;
  const evidence: string[] = [];
  let score = 0;
  // 1 point: ≥1 use case per workflow
  const useCaseCount = (md.match(/^## Use case:/gm) || []).length;
  if (ex.workflows.length > 0 && useCaseCount >= ex.workflows.length) {
    score += 1;
    evidence.push(`use cases: ${useCaseCount} (≥ workflows ${ex.workflows.length})`);
  } else {
    evidence.push(`use cases: ${useCaseCount}, workflows: ${ex.workflows.length}`);
  }
  // 1 point each for: main flow ≥3 numbered steps, alternative flows present, failure modes present, postconditions present
  if (/Main flow:[^\n]*\n1\.\s/.test(md) && /\n2\.\s/.test(md)) {
    score += 1;
    evidence.push('main flow has numbered steps');
  }
  if (/Alternative flows[\s\S]+- Step/.test(md)) {
    score += 1;
    evidence.push('alternative flows / branches present');
  }
  if (/Failure modes:[^\n]*\n1\./.test(md)) {
    score += 1;
    evidence.push('failure modes present');
  }
  if (/Why .* will use this/.test(md)) {
    score += 1;
    evidence.push('"Why they will use this" section present');
  }
  // Synth cap: limit to 3/5 because synth's use cases are pack-seeded.
  const synthCap = source === 'synthesized' ? 3 : 5;
  return { name: 'use-case-depth', score: Math.min(synthCap, score), max: 5, evidence };
}

// E16. persona-depth (max 5) — credit USER_PERSONAS.md depth
function expertPersonaDepth(packageRoot: string, ex: ResearchExtractsLite, source: ResearchSource): ExpertScore | undefined {
  const md = readSafe(path.join(packageRoot, 'product-strategy/USER_PERSONAS.md'));
  if (!md) return undefined;
  const evidence: string[] = [];
  let score = 0;
  const personaActorCount = ex.actors.filter((a) => a.type !== 'external').length;
  const personaSections = (md.match(/^## /gm) || []).length;
  if (personaSections >= personaActorCount && personaActorCount > 0) {
    score += 1;
    evidence.push(`persona sections: ${personaSections} (≥ non-external actors ${personaActorCount})`);
  } else {
    evidence.push(`persona sections: ${personaSections}, non-external actors: ${personaActorCount}`);
  }
  if (/### Why they will use it/.test(md) && /Motivation:/.test(md)) {
    score += 1;
    evidence.push('"Why they will use it" with Motivation present');
  }
  if (/### Pain points/.test(md) && /\n- /.test(md)) {
    score += 1;
    evidence.push('Pain points section present');
  }
  if (/### Adoption signals/.test(md)) {
    score += 1;
    evidence.push('Adoption signals section present');
  }
  if (/### Visibility scope/.test(md)) {
    score += 1;
    evidence.push('Visibility scope section present');
  }
  // Synth cap: limit to 3/5.
  const synthCap = source === 'synthesized' ? 3 : 5;
  return { name: 'persona-depth', score: Math.min(synthCap, score), max: 5, evidence };
}

function evaluateExpertRubric(
  packageRoot: string,
  source: ResearchSource
): NonNullable<AuditResult['expert']> | undefined {
  const ex = loadExtracts(packageRoot);
  if (!ex) return undefined;

  const dims = [
    expertResearchDepth(ex, source),
    expertEdgeCaseCoverage(ex, packageRoot, source),
    expertPermissionMatrix(ex, packageRoot),
    expertRegulatoryMapping(ex, packageRoot),
    expertRealisticSampleData(ex)
  ];
  const screenDepth = expertScreenDepth(ex, packageRoot);
  if (screenDepth) dims.push(screenDepth);
  const schemaRealism = expertSchemaRealism(ex, packageRoot);
  if (schemaRealism) dims.push(schemaRealism);
  const testCaseGrounding = expertTestCaseGrounding(ex);
  if (testCaseGrounding) dims.push(testCaseGrounding);
  const jtbdCoverage = expertJtbdCoverage(ex);
  if (jtbdCoverage) dims.push(jtbdCoverage);
  const ideaClarity = expertIdeaClarity(ex, source);
  if (ideaClarity) dims.push(ideaClarity);
  // Phase F3: comprehensive-depth dimensions.
  dims.push(expertWorkflowStepRealism(ex));
  dims.push(expertFailureVariance(packageRoot));
  dims.push(expertEntityFieldRichness(ex));
  const perScreenAcceptance = expertPerScreenAcceptanceUniqueness(ex, packageRoot);
  if (perScreenAcceptance) dims.push(perScreenAcceptance);
  const useCaseDepth = expertUseCaseDepth(packageRoot, ex, source);
  if (useCaseDepth) dims.push(useCaseDepth);
  const personaDepth = expertPersonaDepth(packageRoot, ex, source);
  if (personaDepth) dims.push(personaDepth);

  // Bonus: bonus = round(rawTotal / sumMax × 8). 8-point ceiling because 92 base + 8 = 100.
  const rawTotal = dims.reduce((s, d) => s + d.score, 0);
  const sumMax = dims.reduce((s, d) => s + d.max, 0);
  const bonus = sumMax ? Math.round((rawTotal / sumMax) * 8) : 0;

  // Cap: take the strongest cap (lowest applied total) among all dims.
  const caps = dims.map((d) => d.cap).filter((c): c is { applied: number; reason: string } => Boolean(c));
  const strongestCap = caps.reduce<{ applied: number; reason: string } | undefined>(
    (acc, c) => (acc === undefined || c.applied < acc.applied ? c : acc),
    undefined
  );

  return {
    bonus,
    cap: strongestCap?.applied ?? 100,
    dimensions: dims,
    capReasons: caps.map((c) => `cap ${c.applied}: ${c.reason}`)
  };
}

function detectResearchGrounded(packageRoot: string): boolean {
  const reqContent = readSafe(path.join(packageRoot, 'requirements/FUNCTIONAL_REQUIREMENTS.md'));
  return !/Generated WITHOUT research extractions/i.test(reqContent);
}

/**
 * RC2: classify the workspace's research source. Reads research/extracted/meta.json
 * and falls back to inference when the explicit `researchSource` field is absent.
 * Returns 'manual' when no extractions exist (don't overclaim demo readiness).
 */
function detectResearchSource(packageRoot: string): ResearchSource {
  const metaPath = path.join(packageRoot, 'research', 'extracted', 'meta.json');
  if (!fs.existsSync(metaPath)) return 'manual';
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
      researcher?: string;
      researchSource?: ResearchSource;
    };
    return getResearchSource(meta);
  } catch {
    return 'manual';
  }
}

/**
 * RC2: compute demo/client readiness. Synth output can be production-ready
 * (structurally complete) and research-grounded (extractions present), but
 * is never demo/client-ready — judgment-heavy artifacts (idea critique,
 * competing alternatives) require an LLM agent following docs/RESEARCH_RECIPE.md.
 */
function computeReadiness(args: {
  packageRoot: string;
  total: number;
  researchGrounded: boolean;
  researchSource: ResearchSource;
  expertCap: number;
}): Readiness {
  const productionReady = args.total >= 85;
  const reasons: string[] = [];

  // Source rule: synth and unknown manual fixtures are never demo-ready.
  const sourceOk = args.researchSource === 'agent-recipe' || args.researchSource === 'imported-real' || args.researchSource === 'manual';
  if (args.researchSource === 'synthesized') {
    reasons.push('research source is synthesized — synth proves the generator is structurally sound but cannot supply real product judgment (idea critique, competing alternatives, market risk)');
  }

  // Score rule: demo readiness requires high audit total.
  if (args.total < 95) {
    reasons.push(`audit total ${args.total}/100 below demo threshold 95`);
  }

  // No expert caps fired.
  if (args.expertCap < 100) {
    reasons.push(`expert cap applied at ${args.expertCap} (cap reasons must be addressed before demo)`);
  }

  // Required artifacts for a demo-ready workspace.
  const ex = loadExtracts(args.packageRoot);
  const ideaCritique = ex?.meta?.discovery?.ideaCritique || [];
  const competingAlternatives = ex?.meta?.discovery?.competingAlternatives || [];
  const screens = ex?.screens || [];
  const testCases = ex?.testCases || [];
  const ddlExists = fs.existsSync(path.join(args.packageRoot, 'architecture/DATABASE_SCHEMA.sql'));

  if (sourceOk) {
    if (ideaCritique.length === 0) {
      reasons.push('no idea critique recorded (Pass 0 of docs/RESEARCH_RECIPE.md must populate ideaCritique[])');
    }
    if (competingAlternatives.length === 0) {
      reasons.push('no competing alternatives recorded (real research must name what the audience could pick instead)');
    }
    if (screens.length === 0) {
      reasons.push('no screens defined (ui-ux/screens/*.md cannot be generated)');
    }
    if (!ddlExists) {
      reasons.push('architecture/DATABASE_SCHEMA.sql missing (DB schema realism cannot be demonstrated)');
    }
    if (testCases.length === 0) {
      reasons.push('no concrete test cases (TEST_CASES.md cannot ground the demo)');
    }
  }

  const demoReady =
    sourceOk &&
    args.total >= 95 &&
    args.expertCap >= 100 &&
    ideaCritique.length > 0 &&
    competingAlternatives.length > 0 &&
    screens.length > 0 &&
    testCases.length > 0 &&
    ddlExists &&
    args.researchGrounded;

  return {
    productionReady,
    researchGrounded: args.researchGrounded,
    demoReady,
    clientReady: demoReady,
    reason: demoReady ? '' : reasons.join('; '),
    researchSource: args.researchSource
  };
}

function rate(score: number): AuditResult['rating'] {
  if (score >= 85) return 'production-ready';
  if (score >= 70) return 'workable';
  if (score >= 50) return 'thin';
  return 'cookie-cutter';
}

export function runAudit(packageRoot: string): AuditResult {
  const { productName, briefText } = readBrief(packageRoot);
  const briefTokenList = domainTokens(briefText, productName);
  const researchVocab = loadResearchVocab(packageRoot);
  // Combined vocabulary used by sample-data / requirement-specificity / test-script
  // checks: brief tokens give a portable baseline; research tokens reward
  // workspaces that use the agent-extracted ontology.
  const combinedTokens = uniq([...briefTokenList, ...researchVocab.tokens]);
  const dimensions: DimensionScore[] = [
    auditDomainVocabulary(packageRoot, briefTokenList, researchVocab),
    auditAntiGeneric(packageRoot),
    auditSampleData(packageRoot, combinedTokens),
    auditRequirements(packageRoot, combinedTokens),
    auditPhaseDistinctness(packageRoot),
    auditTestScripts(packageRoot, combinedTokens),
    auditConsistency(packageRoot, productName)
  ];
  let total = dimensions.reduce((sum, d) => sum + d.score, 0);
  const researchGrounded = detectResearchGrounded(packageRoot);
  if (!researchGrounded) total = Math.max(0, total - 5);

  // RC2: classify research source before evaluating the expert rubric so
  // synth-vs-real judgment caps can fire correctly inside expert dims.
  const researchSource = detectResearchSource(packageRoot);

  // Phase D: layer the expert rubric. Bonus is added to total (capped at 100);
  // expert caps then pull total down if any expert dim found shallow content.
  const expert = evaluateExpertRubric(packageRoot, researchSource);
  if (expert) {
    total = Math.min(100, total + expert.bonus);
    if (expert.cap < 100) total = Math.min(total, expert.cap);
  }

  const allFindings = dimensions.flatMap((d) => d.findings);
  // Surface expert caps as top findings so they're visible in the rendered report.
  const expertCapFindings: Finding[] = expert
    ? expert.capReasons.map((reason) => ({ dimension: 'expert-rubric', severity: 'blocker', message: reason }))
    : [];
  const topFindings = [
    ...expertCapFindings,
    ...allFindings.filter((f) => f.severity === 'blocker'),
    ...allFindings.filter((f) => f.severity === 'warning')
  ].slice(0, 12);

  const readiness = computeReadiness({
    packageRoot,
    total,
    researchGrounded,
    researchSource,
    expertCap: expert?.cap ?? 100
  });

  return {
    packageRoot,
    productName,
    total,
    rating: rate(total),
    researchGrounded,
    readiness,
    dimensions,
    topFindings,
    expert
  };
}

export function renderAudit(result: AuditResult): string {
  const lines: string[] = [];
  lines.push(`# Quality audit — ${result.productName}`);
  lines.push('');
  lines.push(`- **Overall:** ${result.total}/100 — ${result.rating}`);
  lines.push(`- **Research source:** ${result.readiness.researchSource}`);
  lines.push(`- **Production-ready:** ${result.readiness.productionReady ? 'yes' : 'no'}`);
  lines.push(`- **Research-grounded:** ${result.researchGrounded ? 'yes' : 'no (−5 penalty applied)'}`);
  lines.push(`- **Demo-ready / Client-ready:** ${result.readiness.demoReady ? 'yes' : 'no'}`);
  if (!result.readiness.demoReady && result.readiness.reason) {
    lines.push(`  - Why not: ${result.readiness.reason}`);
  }
  lines.push(`- **Package:** ${result.packageRoot}`);
  lines.push('');
  if (result.readiness.researchSource === 'synthesized') {
    lines.push('> ℹ️ Synthesized research is structurally valid (regression-grade) but is **not** client/demo-ready. Idea critique, competing alternatives, and judgment-heavy dimensions require an LLM agent following docs/RESEARCH_RECIPE.md. Run real recipe to unlock full idea-clarity, research-depth, and edge-case-coverage scoring.');
    lines.push('');
  }
  lines.push('## Dimensions');
  lines.push('| Dimension | Score | Max |');
  lines.push('| --- | ---: | ---: |');
  for (const d of result.dimensions) {
    lines.push(`| ${d.name} | ${d.score} | ${d.max} |`);
  }
  lines.push('');
  if (result.expert) {
    lines.push('## Expert rubric (Phase D)');
    lines.push(`- Bonus applied: +${result.expert.bonus} (max +8)`);
    lines.push(`- Cap applied: ${result.expert.cap === 100 ? 'none' : `${result.expert.cap}`}`);
    lines.push('');
    lines.push('| Dimension | Score | Max |');
    lines.push('| --- | ---: | ---: |');
    for (const e of result.expert.dimensions) {
      lines.push(`| ${e.name} | ${e.score} | ${e.max} |`);
    }
    lines.push('');
  }
  if (result.topFindings.length) {
    lines.push('## Top findings');
    for (const f of result.topFindings) {
      lines.push(`- **${f.severity.toUpperCase()}** [${f.dimension}] ${f.message}${f.detail ? ` — ${f.detail}` : ''}`);
    }
  } else {
    lines.push('## Top findings');
    lines.push('- none');
  }
  lines.push('');
  lines.push('## Evidence');
  for (const d of result.dimensions) {
    lines.push(`### ${d.name}`);
    d.evidence.forEach((e) => lines.push(`- ${e}`));
  }
  if (result.expert) {
    for (const e of result.expert.dimensions) {
      lines.push(`### expert.${e.name}`);
      e.evidence.forEach((ev) => lines.push(`- ${ev}`));
    }
  }
  return lines.join('\n') + '\n';
}

function main() {
  const packageRoot = path.resolve(getArg('package') || process.env.INIT_CWD || process.cwd());
  if (!fs.existsSync(path.join(packageRoot, 'repo', 'manifest.json'))) {
    console.error(`Not an MVP Builder workspace: ${packageRoot}`);
    process.exit(1);
  }
  const result = runAudit(packageRoot);
  if (getArg('json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const evidenceDir = path.join(packageRoot, 'evidence', 'audit');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(evidenceDir, `QUALITY_AUDIT-${stamp}.md`);
  fs.writeFileSync(reportPath, renderAudit(result), 'utf8');
  fs.writeFileSync(path.join(evidenceDir, 'last-audit.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(
    `Quality audit: ${result.total}/100 — ${result.rating} ` +
      `(research-grounded=${result.researchGrounded}, source=${result.readiness.researchSource}, ` +
      `productionReady=${result.readiness.productionReady}, demoReady=${result.readiness.demoReady})`
  );
  console.log(`Report: ${path.relative(packageRoot, reportPath).replace(/\\/g, '/')}`);
  process.exitCode = result.total >= 50 ? 0 : 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
