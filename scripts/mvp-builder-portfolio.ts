#!/usr/bin/env node
/**
 * Phase 7 — Portfolio batch runner.
 *
 * Reads a list of brief inputs (paths and/or inline ProjectInput objects)
 * and, for each idea, runs the full pre-build pipeline:
 *
 *   1. Phase 5 brief probes (mvp-builder-brief-enrich:runBriefProbes).
 *      If any blocker fails, the idea is recorded with status
 *      'brief-blocked' and skipped — but the portfolio still completes.
 *   2. Synthesizer (synthesize-research-ontology) so create-project has
 *      research extractions to consume — same path the harnesses use.
 *   3. createArtifactPackage to generate the workspace at
 *      <out>/<NN>-<slug>/mvp-builder-workspace.
 *   4. E4 content-quality probes (autoresearch-probes:runProbes +
 *      deriveReadinessLabels) against the generated workspace.
 *
 * Then aggregates:
 *   - blocker-frequency (Phase 5 probes failing across the corpus)
 *   - probe-weaknesses  (E4 probes ranked by lowest avg score/max ratio)
 *   - diversity         (mean / range / stddev of artifact-quality %)
 *
 * Output:
 *   <out>/PORTFOLIO_REPORT.md       — markdown summary with ranked tables
 *   <out>/portfolio-summary.json    — machine-readable aggregate
 *   <out>/<NN>-<slug>/...           — generated workspaces (one per idea)
 *
 * Idempotent: same inputs file produces the same report (modulo timestamp);
 * iteration order follows the inputs list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROBES,
  runBriefProbes,
  type ProbeResult as BriefProbeResult,
  type ProbeSeverity as BriefProbeSeverity,
} from './mvp-builder-brief-enrich';
import { createArtifactPackage } from './mvp-builder-create-project';
import {
  loadProbeRubric,
  runProbes,
  deriveReadinessLabels,
  type ProbeReport,
  type ReadinessLabels,
} from './autoresearch-probes';
import { synthesizeExtractions, writeSynthesizedToWorkspace } from './synthesize-research-ontology';
import { baseProjectInput, slugify } from '../lib/templates';
import type { ProjectInput } from '../lib/types';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function getArg(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

// ---------------------------------------------------------------------------
// Inputs file resolution
// ---------------------------------------------------------------------------

type RawInputEntry = string | Partial<ProjectInput>;

type InputsFileShape = {
  inputs: RawInputEntry[];
};

type ResolvedIdea = {
  /** Original list-index, 1-based, zero-padded later. */
  index: number;
  /** Source path (absolute) when the entry was a string; null for inline. */
  sourcePath: string | null;
  input: ProjectInput;
};

/** Merge a partial ProjectInput onto a fresh baseProjectInput, including questionnaireAnswers. */
function hydrateInput(parsed: Partial<ProjectInput>): ProjectInput {
  const base = baseProjectInput();
  return {
    ...base,
    ...parsed,
    questionnaireAnswers: {
      ...base.questionnaireAnswers,
      ...(parsed.questionnaireAnswers || {}),
    },
  };
}

/** Resolve a string entry to an absolute path, trying inputsFileDir then CWD then raw. */
function resolveBriefPath(entry: string, inputsFileDir: string): string {
  // Already absolute or starts with drive letter — trust it.
  if (path.isAbsolute(entry)) return entry;
  const candidates = [
    path.resolve(inputsFileDir, entry),
    path.resolve(process.cwd(), entry),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  // Fall back to raw absolute path resolution; loader will surface the error.
  return path.resolve(entry);
}

function loadInputsFile(inputsArg: string): { inputs: RawInputEntry[]; inputsFile: string; inputsFileDir: string } {
  const inputsFile = path.resolve(inputsArg);
  if (!fs.existsSync(inputsFile)) {
    throw new Error(`inputs file not found: ${inputsFile}`);
  }
  const raw = fs.readFileSync(inputsFile, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`failed to parse inputs JSON at ${inputsFile}: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as InputsFileShape).inputs)) {
    throw new Error(`inputs file ${inputsFile} must contain an "inputs" array`);
  }
  const inputs = (parsed as InputsFileShape).inputs;
  return { inputs, inputsFile, inputsFileDir: path.dirname(inputsFile) };
}

function resolveIdeas(rawInputs: RawInputEntry[], inputsFileDir: string): ResolvedIdea[] {
  const resolved: ResolvedIdea[] = [];
  rawInputs.forEach((entry, idx) => {
    const oneBased = idx + 1;
    if (typeof entry === 'string') {
      const briefPath = resolveBriefPath(entry, inputsFileDir);
      if (!fs.existsSync(briefPath)) {
        throw new Error(`brief input not found for entry #${oneBased}: ${entry}`);
      }
      const raw = fs.readFileSync(briefPath, 'utf8');
      let parsed: Partial<ProjectInput>;
      try {
        parsed = JSON.parse(raw) as Partial<ProjectInput>;
      } catch (err) {
        throw new Error(`failed to parse brief at ${briefPath}: ${(err as Error).message}`);
      }
      resolved.push({
        index: oneBased,
        sourcePath: briefPath,
        input: hydrateInput(parsed),
      });
    } else if (entry && typeof entry === 'object') {
      resolved.push({
        index: oneBased,
        sourcePath: null,
        input: hydrateInput(entry),
      });
    } else {
      throw new Error(`inputs[${idx}] is neither a string nor a ProjectInput object`);
    }
  });
  return resolved;
}

// ---------------------------------------------------------------------------
// Per-idea pipeline
// ---------------------------------------------------------------------------

type IdeaStatus = 'generated' | 'brief-blocked' | 'error';

type IdeaResult = {
  index: number;
  paddedIndex: string;
  slug: string;
  productName: string;
  sourcePath: string | null;
  status: IdeaStatus;
  briefProbes: BriefProbeResult[];
  briefBlockers: BriefProbeResult[];
  probeReport: ProbeReport | null;
  readiness: ReadinessLabels | null;
  error?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

async function runIdeaPipeline(idea: ResolvedIdea, outRoot: string, rubricPath: string): Promise<IdeaResult> {
  const padded = pad2(idea.index);
  const slug = slugify(idea.input.productName || `idea-${padded}`);
  const productName = idea.input.productName || `Idea ${padded}`;
  const ideaOutDir = path.join(outRoot, `${padded}-${slug}`);

  // Step 1: brief probes.
  const briefProbes = runBriefProbes(idea.input);
  const briefBlockers = briefProbes.filter((p) => p.severity === 'blocker' && !p.passed);

  if (briefBlockers.length > 0) {
    return {
      index: idea.index,
      paddedIndex: padded,
      slug,
      productName,
      sourcePath: idea.sourcePath,
      status: 'brief-blocked',
      briefProbes,
      briefBlockers,
      probeReport: null,
      readiness: null,
    };
  }

  // Step 2: synthesize research extractions, write into a research-input dir.
  // The synthesizer writes <dir>/research/extracted/*.json which createArtifactPackage
  // copies into the workspace via researchFrom.
  fs.mkdirSync(ideaOutDir, { recursive: true });
  const researchInputDir = path.join(ideaOutDir, 'research-input');
  if (fs.existsSync(researchInputDir)) {
    fs.rmSync(researchInputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(researchInputDir, { recursive: true });

  let probeReport: ProbeReport | null = null;
  let readiness: ReadinessLabels | null = null;
  try {
    const ex = synthesizeExtractions(idea.input);
    writeSynthesizedToWorkspace(researchInputDir, idea.input, ex);

    // Step 3: createArtifactPackage. The package output goes to <ideaOutDir>/mvp-builder-workspace.
    const workspaceOutDir = path.join(ideaOutDir, 'workspace');
    if (fs.existsSync(workspaceOutDir)) {
      fs.rmSync(workspaceOutDir, { recursive: true, force: true });
    }
    const result = await createArtifactPackage({
      input: idea.input,
      outDir: workspaceOutDir,
      zip: false,
      researchFrom: researchInputDir,
    });

    // Step 4: E4 probes.
    const rubric = loadProbeRubric(rubricPath);
    probeReport = runProbes(result.rootDir, rubric);
    readiness = deriveReadinessLabels(result.rootDir, probeReport);

    return {
      index: idea.index,
      paddedIndex: padded,
      slug,
      productName,
      sourcePath: idea.sourcePath,
      status: 'generated',
      briefProbes,
      briefBlockers: [],
      probeReport,
      readiness,
    };
  } catch (err) {
    return {
      index: idea.index,
      paddedIndex: padded,
      slug,
      productName,
      sourcePath: idea.sourcePath,
      status: 'error',
      briefProbes,
      briefBlockers: [],
      probeReport,
      readiness,
      error: (err as Error).message,
    };
  }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

type BlockerFrequencyEntry = {
  probe: string;
  severity: BriefProbeSeverity;
  failedCount: number;
  totalEvaluated: number;
  sampleFollowUp: string;
};

function rankBlockerFrequency(results: IdeaResult[]): BlockerFrequencyEntry[] {
  // Track per probe: how many ideas had it evaluated (i.e. it ran), and how many failed it.
  const evaluatedCounts = new Map<string, number>();
  const failedCounts = new Map<string, number>();
  const followUps = new Map<string, string>();
  const severities = new Map<string, BriefProbeSeverity>();

  for (const result of results) {
    for (const probe of result.briefProbes) {
      // Restrict to declared blocker probes for "top blockers" ranking.
      if (probe.severity !== 'blocker') continue;
      evaluatedCounts.set(probe.name, (evaluatedCounts.get(probe.name) ?? 0) + 1);
      severities.set(probe.name, probe.severity);
      if (!followUps.has(probe.name)) followUps.set(probe.name, probe.followUpQuestion);
      if (!probe.passed) {
        failedCounts.set(probe.name, (failedCounts.get(probe.name) ?? 0) + 1);
      }
    }
  }

  // Ensure every declared blocker probe shows up even if every brief passed it.
  for (const def of PROBES) {
    if (def.severity !== 'blocker') continue;
    if (!severities.has(def.name)) severities.set(def.name, def.severity);
  }

  const entries: BlockerFrequencyEntry[] = [];
  for (const probeName of Array.from(severities.keys())) {
    entries.push({
      probe: probeName,
      severity: severities.get(probeName) ?? 'blocker',
      failedCount: failedCounts.get(probeName) ?? 0,
      totalEvaluated: evaluatedCounts.get(probeName) ?? 0,
      sampleFollowUp: followUps.get(probeName) ?? '',
    });
  }
  // Sort: most failures first, then probe name for determinism.
  entries.sort((a, b) => b.failedCount - a.failedCount || a.probe.localeCompare(b.probe));
  return entries;
}

type ProbeWeaknessEntry = {
  probe: string;
  avgRatio: number;
  failingIdeas: string[];
  evaluatedCount: number;
};

function rankProbeWeaknesses(results: IdeaResult[]): ProbeWeaknessEntry[] {
  const ratioSums = new Map<string, number>();
  const counts = new Map<string, number>();
  const failers = new Map<string, string[]>();

  for (const result of results) {
    if (!result.probeReport) continue;
    for (const probe of result.probeReport.perProbe) {
      const ratio = probe.max === 0 ? 0 : probe.score / probe.max;
      ratioSums.set(probe.name, (ratioSums.get(probe.name) ?? 0) + ratio);
      counts.set(probe.name, (counts.get(probe.name) ?? 0) + 1);
      if (!probe.passed) {
        const list = failers.get(probe.name) ?? [];
        list.push(`${result.paddedIndex}-${result.slug}`);
        failers.set(probe.name, list);
      }
    }
  }

  const entries: ProbeWeaknessEntry[] = [];
  for (const probeName of Array.from(counts.keys())) {
    const evaluated = counts.get(probeName) ?? 0;
    const avg = evaluated === 0 ? 0 : (ratioSums.get(probeName) ?? 0) / evaluated;
    entries.push({
      probe: probeName,
      avgRatio: round2(avg),
      failingIdeas: (failers.get(probeName) ?? []).slice().sort(),
      evaluatedCount: evaluated,
    });
  }
  entries.sort((a, b) => a.avgRatio - b.avgRatio || a.probe.localeCompare(b.probe));
  return entries;
}

type DiversityStats = {
  mean: number;
  range: [number, number] | null;
  stddev: number;
  count: number;
};

function diversityScore(results: IdeaResult[]): DiversityStats {
  const pcts = results
    .filter((r) => r.status === 'generated' && r.readiness)
    .map((r) => r.readiness!.artifactQuality.pct);
  if (pcts.length === 0) {
    return { mean: 0, range: null, stddev: 0, count: 0 };
  }
  const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const variance = pcts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / pcts.length;
  const stddev = Math.sqrt(variance);
  const minVal = Math.min(...pcts);
  const maxVal = Math.max(...pcts);
  return {
    mean: round1(mean),
    range: [round1(minVal), round1(maxVal)],
    stddev: round1(stddev),
    count: pcts.length,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function fmtPct(n: number): string {
  return `${round1(n).toFixed(1)}`;
}

function renderMarkdown(args: {
  generatedAt: string;
  inputCount: number;
  blockedCount: number;
  diversity: DiversityStats;
  results: IdeaResult[];
  blockerFreq: BlockerFrequencyEntry[];
  probeWeak: ProbeWeaknessEntry[];
  inputsFile: string;
  outDir: string;
}): string {
  const { generatedAt, inputCount, blockedCount, diversity, results, blockerFreq, probeWeak, inputsFile, outDir } = args;
  const lines: string[] = [];
  lines.push('# Portfolio report');
  lines.push('');
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Inputs: ${inputCount} ideas`);
  lines.push(`- Blocked at brief stage: ${blockedCount}`);
  if (diversity.count > 0 && diversity.range) {
    lines.push(`- Mean artifact quality: ${fmtPct(diversity.mean)}%`);
    lines.push(`- Range: ${fmtPct(diversity.range[0])}%–${fmtPct(diversity.range[1])}%`);
    lines.push(`- Stddev: ${fmtPct(diversity.stddev)}`);
  } else {
    lines.push('- Mean artifact quality: n/a (no ideas generated)');
    lines.push('- Range: n/a');
    lines.push('- Stddev: n/a');
  }
  lines.push('');
  lines.push('## Per-idea results');
  lines.push('');
  lines.push('| # | Slug | Product name | Status | Brief blockers | Artifact quality | Build approval | Demo readiness | Research source |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  // Display rows in original list order — stable + matches the directory layout.
  const displayRows = results.slice().sort((a, b) => a.index - b.index);
  for (const r of displayRows) {
    const statusLabel = r.status;
    const blockerCount = r.briefBlockers.length;
    if (r.status === 'generated' && r.probeReport && r.readiness) {
      const aq = `${r.readiness.artifactQuality.pct}/100`;
      const ba = r.readiness.buildApproval.approved ? 'approved' : 'not approved';
      const dr = r.readiness.demoReadiness.ready ? 'ready' : 'not ready';
      const rs = r.readiness.researchSource;
      lines.push(`| ${r.paddedIndex} | ${r.slug} | ${r.productName} | ${statusLabel} | ${blockerCount} | ${aq} | ${ba} | ${dr} | ${rs} |`);
    } else {
      lines.push(`| ${r.paddedIndex} | ${r.slug} | ${r.productName} | ${statusLabel} | ${blockerCount} | – | – | – | – |`);
    }
  }
  lines.push('');

  lines.push('## Top brief blockers (ranked by frequency)');
  lines.push('');
  if (blockerFreq.length === 0) {
    lines.push('None recorded.');
    lines.push('');
  } else {
    lines.push('| Probe | Failed in | Severity | Sample follow-up |');
    lines.push('| --- | --- | --- | --- |');
    for (const entry of blockerFreq) {
      const denom = entry.totalEvaluated > 0 ? entry.totalEvaluated : inputCount;
      lines.push(`| ${entry.probe} | ${entry.failedCount}/${denom} ideas | ${entry.severity} | ${entry.sampleFollowUp} |`);
    }
    lines.push('');
  }

  lines.push('## Probe weaknesses (lowest avg ratio first)');
  lines.push('');
  if (probeWeak.length === 0) {
    lines.push('No probes evaluated (all ideas brief-blocked or errored).');
    lines.push('');
  } else {
    lines.push('| Probe | Avg ratio | Failing ideas |');
    lines.push('| --- | --- | --- |');
    for (const entry of probeWeak) {
      const failing = entry.failingIdeas.length === 0 ? '—' : entry.failingIdeas.join(', ');
      lines.push(`| ${entry.probe} | ${entry.avgRatio.toFixed(2)} | ${failing} |`);
    }
    lines.push('');
  }

  lines.push('## Top fixes');
  lines.push('');
  const fixes = computeTopFixes(blockerFreq, probeWeak);
  if (fixes.length === 0) {
    lines.push('- Nothing flagged. Every idea passed brief gating and every probe is at full ratio.');
  } else {
    fixes.forEach((line, idx) => {
      lines.push(`- ${idx + 1}. ${line}`);
    });
  }
  lines.push('');

  lines.push('## Diversity');
  lines.push('');
  if (diversity.count > 0 && diversity.range) {
    lines.push(`- Mean: ${fmtPct(diversity.mean)}%`);
    lines.push(`- Range: ${fmtPct(diversity.range[0])}%–${fmtPct(diversity.range[1])}%`);
    lines.push(`- Stddev: ${fmtPct(diversity.stddev)}`);
  } else {
    lines.push('- Mean: n/a');
    lines.push('- Range: n/a');
    lines.push('- Stddev: n/a');
  }
  lines.push('');

  lines.push('## Source');
  lines.push('');
  lines.push(`- Inputs file: ${inputsFile}`);
  lines.push(`- Output dir: ${outDir}`);
  lines.push('');

  return lines.join('\n');
}

function computeTopFixes(blockerFreq: BlockerFrequencyEntry[], probeWeak: ProbeWeaknessEntry[]): string[] {
  const fixes: string[] = [];
  // Ranked highest: brief blockers that fired (they prevent generation entirely).
  const firedBlockers = blockerFreq.filter((b) => b.failedCount > 0);
  for (const blocker of firedBlockers.slice(0, 3)) {
    const noun = blocker.failedCount === 1 ? 'idea' : 'ideas';
    fixes.push(
      `Resolve \`${blocker.probe}\` in the ${blocker.failedCount} ${noun} where it fired (ranked highest because it blocks generation entirely).`,
    );
  }
  // Then content-quality probes with the lowest ratios that have failures.
  const weakProbes = probeWeak.filter((p) => p.failingIdeas.length > 0).slice(0, 5 - fixes.length);
  for (const weak of weakProbes) {
    const sample = weak.failingIdeas[0];
    fixes.push(
      `Improve \`${weak.probe}\` in ${sample} (avg ratio across portfolio: ${weak.avgRatio.toFixed(2)}, failing ideas: ${weak.failingIdeas.length}).`,
    );
  }
  return fixes;
}

// ---------------------------------------------------------------------------
// JSON summary builder
// ---------------------------------------------------------------------------

function buildJsonSummary(args: {
  generatedAt: string;
  inputCount: number;
  blockedCount: number;
  diversity: DiversityStats;
  results: IdeaResult[];
  blockerFreq: BlockerFrequencyEntry[];
  probeWeak: ProbeWeaknessEntry[];
  inputsFile: string;
  outDir: string;
}) {
  const { generatedAt, inputCount, blockedCount, diversity, results, blockerFreq, probeWeak, inputsFile, outDir } = args;
  return {
    generatedAt,
    inputsFile,
    outDir,
    inputCount,
    blockedCount,
    diversity: {
      mean: diversity.mean,
      range: diversity.range,
      stddev: diversity.stddev,
      count: diversity.count,
    },
    ideas: results
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((r) => ({
        index: r.index,
        paddedIndex: r.paddedIndex,
        slug: r.slug,
        productName: r.productName,
        sourcePath: r.sourcePath,
        status: r.status,
        briefBlockers: r.briefBlockers.map((p) => ({
          name: p.name,
          severity: p.severity,
          detail: p.detail,
          followUpQuestion: p.followUpQuestion,
        })),
        briefProbes: r.briefProbes.map((p) => ({
          name: p.name,
          severity: p.severity,
          passed: p.passed,
        })),
        probeReport: r.probeReport,
        readiness: r.readiness,
        error: r.error,
      })),
    blockerFrequency: blockerFreq,
    probeWeaknesses: probeWeak,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const inputsArg = getArg('inputs');
  const outArg = getArg('out');
  if (!inputsArg || !outArg) {
    console.error('Usage: tsx scripts/mvp-builder-portfolio.ts --inputs=<file.json> --out=<dir>');
    process.exit(2);
  }

  const { inputs: rawInputs, inputsFile, inputsFileDir } = loadInputsFile(inputsArg!);
  const ideas = resolveIdeas(rawInputs, inputsFileDir);
  const outRoot = path.resolve(outArg!);
  fs.mkdirSync(outRoot, { recursive: true });

  // Locate the rubric relative to this script's location, not CWD.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rubricPath = path.resolve(here, '..', 'autoresearch', 'rubrics', 'probes.json');
  if (!fs.existsSync(rubricPath)) {
    throw new Error(`probes rubric not found at ${rubricPath}`);
  }

  const results: IdeaResult[] = [];
  for (const idea of ideas) {
    const padded = pad2(idea.index);
    const productName = idea.input.productName || `idea-${padded}`;
    process.stdout.write(`[portfolio] ${padded} ${productName} … `);
    const result = await runIdeaPipeline(idea, outRoot, rubricPath);
    results.push(result);
    if (result.status === 'generated' && result.readiness) {
      console.log(`generated (${result.readiness.artifactQuality.pct}%)`);
    } else if (result.status === 'brief-blocked') {
      console.log(`brief-blocked (${result.briefBlockers.length} blocker(s))`);
    } else {
      console.log(`error: ${result.error ?? 'unknown'}`);
    }
  }

  const generatedAt = new Date().toISOString();
  const blockedCount = results.filter((r) => r.status === 'brief-blocked').length;
  const blockerFreq = rankBlockerFrequency(results);
  const probeWeak = rankProbeWeaknesses(results);
  const diversity = diversityScore(results);

  const markdown = renderMarkdown({
    generatedAt,
    inputCount: results.length,
    blockedCount,
    diversity,
    results,
    blockerFreq,
    probeWeak,
    inputsFile,
    outDir: outRoot,
  });
  fs.writeFileSync(path.join(outRoot, 'PORTFOLIO_REPORT.md'), markdown, 'utf8');

  const summary = buildJsonSummary({
    generatedAt,
    inputCount: results.length,
    blockedCount,
    diversity,
    results,
    blockerFreq,
    probeWeak,
    inputsFile,
    outDir: outRoot,
  });
  fs.writeFileSync(path.join(outRoot, 'portfolio-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log(`[portfolio] wrote ${path.join(outRoot, 'PORTFOLIO_REPORT.md')}`);
  console.log(`[portfolio] wrote ${path.join(outRoot, 'portfolio-summary.json')}`);
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    const resolved = path.resolve(argv1).toLowerCase();
    const self = path.resolve(__filename).toLowerCase();
    return resolved === self;
  } catch {
    return true;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  });
}
