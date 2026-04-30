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

type AuditResult = {
  packageRoot: string;
  productName: string;
  total: number;
  rating: 'cookie-cutter' | 'thin' | 'workable' | 'production-ready';
  researchGrounded: boolean;
  dimensions: DimensionScore[];
  topFindings: Finding[];
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

// 1. Domain vocabulary penetration
function auditDomainVocabulary(packageRoot: string, tokens: string[]): DimensionScore {
  const findings: Finding[] = [];
  const evidence: string[] = [];
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
    const distinctTokensFound = tokens.filter((t) => countOccurrences(t, content) >= 1).length;
    totalHits += distinctTokensFound;
    totalChecked += 1;
    evidence.push(`${target}: ${distinctTokensFound}/${tokens.length} brief tokens present`);
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
    const found = tokens.filter((t) => countOccurrences(t, briefContent) >= 1).length;
    if (found >= 3) phasesPassed += 1;
  }
  evidence.push(`phase briefs with ≥3 brief tokens: ${phasesPassed}/${phasesScored}`);
  if (phasesScored > 0 && phasesPassed / phasesScored < 0.8) {
    findings.push({
      dimension: 'domain-vocabulary',
      severity: phasesPassed / phasesScored < 0.5 ? 'blocker' : 'warning',
      message: `${phasesPassed}/${phasesScored} phase briefs contain ≥3 distinct brief tokens`
    });
  }
  // Score: 60% weight to phase coverage, 40% to top-level files
  const phaseScore = phasesScored ? (phasesPassed / phasesScored) * 12 : 0;
  const fileScore = totalChecked ? Math.min(8, (totalHits / (tokens.length * totalChecked)) * 16) : 0;
  const score = Math.round(phaseScore + fileScore);
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
  const tokens = domainTokens(briefText, productName);
  const dimensions: DimensionScore[] = [
    auditDomainVocabulary(packageRoot, tokens),
    auditAntiGeneric(packageRoot),
    auditSampleData(packageRoot, tokens),
    auditRequirements(packageRoot, tokens),
    auditPhaseDistinctness(packageRoot),
    auditTestScripts(packageRoot, tokens),
    auditConsistency(packageRoot, productName)
  ];
  let total = dimensions.reduce((sum, d) => sum + d.score, 0);
  const researchGrounded = detectResearchGrounded(packageRoot);
  if (!researchGrounded) total = Math.max(0, total - 5);
  const allFindings = dimensions.flatMap((d) => d.findings);
  const topFindings = [
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
    topFindings
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
