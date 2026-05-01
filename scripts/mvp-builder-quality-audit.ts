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

type AuditResult = {
  packageRoot: string;
  productName: string;
  total: number;
  rating: 'cookie-cutter' | 'thin' | 'workable' | 'production-ready';
  researchGrounded: boolean;
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
  actors: Array<{ id: string; name: string; visibility: string[] }>;
  entities: Array<{
    id: string;
    name: string;
    fields: Array<{ name: string; pii?: boolean; sensitive?: boolean; example?: unknown }>;
    sample: Record<string, unknown>;
    ownerActors: string[];
  }>;
  workflows: Array<{
    name: string;
    steps: Array<{ branchOn?: string }>;
    failureModes: Array<{ trigger: string; effect: string; mitigation: string }>;
  }>;
  risks: Array<{ category: string; description: string; mitigation: string; affectedEntities: string[] }>;
  gates: Array<{ name: string; mandatedBy: string; mandatedByDetail?: string; evidenceRequired: string[] }>;
  antiFeatures: Array<{ description: string }>;
  screens?: Array<{
    id: string;
    name: string;
    sections: Array<{ kind: string; title: string }>;
    fields: Array<{ name: string; kind: string; refEntityField?: string }>;
    states: { empty: string; loading: string; error: string; populated: string };
    actions: Array<{ label: string; kind: string; navTo?: string; refWorkflowStep?: string }>;
    navIn: Array<{ screen: string }>;
    navOut: Array<{ screen: string }>;
  }>;
  uxFlow?: Array<{ fromScreen: string; toScreen: string; viaAction: string }>;
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
    uxFlow: (safe('uxFlow.json') as ResearchExtractsLite['uxFlow']) || undefined
  };
}

// E1. research-depth (max +2 bonus, cap=85 when score < 4/10)
function expertResearchDepth(ex: ResearchExtractsLite): ExpertScore {
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
  return { name: 'research-depth', score: Math.min(10, score), max: 10, evidence, cap };
}

// E2. edge-case-coverage (max +2 bonus, cap=86 when generic-failure-mode rate ≥40%)
function expertEdgeCaseCoverage(ex: ResearchExtractsLite, packageRoot: string): ExpertScore {
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

function evaluateExpertRubric(packageRoot: string): NonNullable<AuditResult['expert']> | undefined {
  const ex = loadExtracts(packageRoot);
  if (!ex) return undefined;

  const dims = [
    expertResearchDepth(ex),
    expertEdgeCaseCoverage(ex, packageRoot),
    expertPermissionMatrix(ex, packageRoot),
    expertRegulatoryMapping(ex, packageRoot),
    expertRealisticSampleData(ex)
  ];
  const screenDepth = expertScreenDepth(ex, packageRoot);
  if (screenDepth) dims.push(screenDepth);

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

  // Phase D: layer the expert rubric. Bonus is added to total (capped at 100);
  // expert caps then pull total down if any expert dim found shallow content.
  const expert = evaluateExpertRubric(packageRoot);
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
  return {
    packageRoot,
    productName,
    total,
    rating: rate(total),
    researchGrounded,
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
  lines.push(`- **Research-grounded:** ${result.researchGrounded ? 'yes' : 'no (−5 penalty applied)'}`);
  lines.push(`- **Package:** ${result.packageRoot}`);
  lines.push('');
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
  console.log(`Quality audit: ${result.total}/100 — ${result.rating} (research-grounded=${result.researchGrounded})`);
  console.log(`Report: ${path.relative(packageRoot, reportPath).replace(/\\/g, '/')}`);
  process.exitCode = result.total >= 50 ? 0 : 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
