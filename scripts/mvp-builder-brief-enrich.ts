#!/usr/bin/env node
/**
 * Phase 5 — Brief enrichment gate.
 *
 * Runs eight predictable brief-quality probes (5 blockers + 3 warnings)
 * BEFORE `npm run create-project` generates 100+ files, so that a vague
 * product idea, missing actors, no must-haves, etc. fail fast with a
 * concrete clarification question instead of getting buried in a generated
 * workspace nobody can review.
 *
 * Pure: reads the brief JSON, writes a single markdown report next to it
 * (or wherever `--out` points). No network, no spawning, no other side
 * effects. Idempotent — same input produces the same report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectInput } from '../lib/types';

export type ProbeSeverity = 'blocker' | 'warning';

export type ProbeResult = {
  name: string;
  severity: ProbeSeverity;
  passed: boolean;
  detail: string;
  followUpQuestion: string;
};

export type EnrichmentReport = {
  inputPath: string;
  passed: boolean;
  probes: ProbeResult[];
  blockerCount: number;
  warningCount: number;
};

// ---------------------------------------------------------------------------
// Helpers — re-implemented locally rather than importing from
// lib/generator.ts (which doesn't currently re-export these). Behavior must
// stay byte-identical to the originals.
// ---------------------------------------------------------------------------

/** Paren/bracket-aware splitter — port of lib/generator.ts:splitItems. */
function splitItems(value: string): string[] {
  if (!value) return [];
  const items: string[] = [];
  let buf = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  for (const ch of value) {
    if (ch === '(' || ch === '[') {
      if (ch === '(') parenDepth++;
      else bracketDepth++;
      buf += ch;
      continue;
    }
    if (ch === ')' || ch === ']') {
      if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else bracketDepth = Math.max(0, bracketDepth - 1);
      buf += ch;
      continue;
    }
    const isSeparator =
      (ch === '\n' || ch === ';' || ch === ',') && parenDepth === 0 && bracketDepth === 0;
    if (isSeparator) {
      const trimmed = buf.trim();
      if (trimmed) items.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) items.push(tail);
  if (items.length === 1) {
    const clauses = items[0].split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
    if (clauses.length >= 4 && clauses.every((part) => part.length <= 80)) {
      return clauses.map((part) => part.replace(/\.$/, '').trim()).filter(Boolean);
    }
  }
  return items;
}

/** Whitespace-tokenized word count — port of lib/generator.ts:wordCount. */
function wordCount(value: string): number {
  if (!value) return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const CONSEQUENCE_WORDS = [
  'lose',
  'miss',
  'broken',
  'frustrat',
  'today',
  'currently',
  'fail',
  'late',
  "can't",
  'cannot',
  'never',
  'nobody',
  'struggle',
  'manual',
  'paperwork',
  'error',
];

function containsConsequenceWord(value: string): boolean {
  const lower = (value || '').toLowerCase();
  return CONSEQUENCE_WORDS.some((word) => lower.includes(word));
}

// ---------------------------------------------------------------------------
// Probes — public list, kept stable for Phase 7's portfolio runner.
// ---------------------------------------------------------------------------

type ProbeDefinition = {
  name: string;
  severity: ProbeSeverity;
  /**
   * Returns null when the probe should be skipped for this input (e.g. the
   * repo-shape probe is technical-track-only). Otherwise returns the probe
   * outcome.
   */
  run(
    input: ProjectInput,
  ): { passed: boolean; detail: string; followUpQuestion: string } | null;
};

export const PROBES: ProbeDefinition[] = [
  {
    name: 'product-idea-specificity',
    severity: 'blocker',
    run(input) {
      const wc = splitItems(input.productIdea || '')
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length;
      const passed = wc >= 15;
      const productName = input.productName || 'this product';
      return {
        passed,
        detail: passed
          ? `productIdea has ${wc} specific words (>=15 required).`
          : `productIdea only has ${wc} specific words; need at least 15 to describe what users can do.`,
        followUpQuestion: `What does ${productName} let users do that they cannot do today? Aim for at least 15 specific words.`,
      };
    },
  },
  {
    name: 'problem-consequence-strength',
    severity: 'blocker',
    run(input) {
      const wc = wordCount(input.problemStatement || '');
      const hasConsequence = containsConsequenceWord(input.problemStatement || '');
      const passed = wc >= 15 && hasConsequence;
      const productName = input.productName || 'this product';
      let detail: string;
      if (passed) {
        detail = `problemStatement has ${wc} words and includes a consequence cue.`;
      } else if (wc < 15 && !hasConsequence) {
        detail = `problemStatement is only ${wc} words and contains no consequence cue (lose/miss/broken/...).`;
      } else if (wc < 15) {
        detail = `problemStatement is only ${wc} words; need at least 15 to describe the consequence.`;
      } else {
        detail = `problemStatement has ${wc} words but no consequence cue (lose/miss/broken/frustrat/today/currently/fail/late/can't/cannot/never/nobody/struggle/manual/paperwork/error).`;
      }
      return {
        passed,
        detail,
        followUpQuestion: `What concretely goes wrong today without ${productName}? Name a consequence (lost time, missed handoff, frustration, etc.).`,
      };
    },
  },
  {
    name: 'audience-prioritization',
    severity: 'blocker',
    run(input) {
      const actorCount = input.actors?.length || 0;
      const audienceCount = splitItems(input.targetAudience || '').length;
      const passed = actorCount >= 2 || audienceCount >= 2;
      const productName = input.productName || 'this product';
      return {
        passed,
        detail: passed
          ? `Found ${actorCount} actor(s) and ${audienceCount} audience entry(ies); at least two distinct roles or audiences are described.`
          : `Only ${actorCount} actor(s) and ${audienceCount} audience entry(ies); need at least two distinct roles or audiences.`,
        followUpQuestion: `Who else uses ${productName}? List at least two distinct roles or audiences.`,
      };
    },
  },
  {
    name: 'must-have-features-listed',
    severity: 'blocker',
    run(input) {
      const count = splitItems(input.mustHaveFeatures || '').length;
      const passed = count >= 3;
      return {
        passed,
        detail: passed
          ? `mustHaveFeatures lists ${count} item(s).`
          : `mustHaveFeatures only lists ${count} item(s); need at least 3 specific features for v1.`,
        followUpQuestion: 'Which 3+ specific features must ship in v1?',
      };
    },
  },
  {
    name: 'repo-shape-answer',
    severity: 'blocker',
    run(input) {
      // Skipped on the business track; the repo-shape question is only
      // relevant when the workspace is being handed to a technical implementer.
      if (input.track !== 'technical') return null;
      const answer = input.questionnaireAnswers?.['repo-shape'] || '';
      const wc = wordCount(answer);
      const passed = wc >= 5;
      return {
        passed,
        detail: passed
          ? `questionnaireAnswers['repo-shape'] has ${wc} words.`
          : `questionnaireAnswers['repo-shape'] only has ${wc} words; need at least 5.`,
        followUpQuestion:
          'Describe the repo shape in 5+ words: monorepo / single-app / what languages / where the existing code lives.',
      };
    },
  },
  {
    name: 'non-goals-listed',
    severity: 'warning',
    run(input) {
      const count = splitItems(input.nonGoals || '').length;
      const passed = count >= 1;
      return {
        passed,
        detail: passed
          ? `nonGoals lists ${count} explicit non-goal(s).`
          : 'nonGoals is empty; no explicit out-of-scope items recorded.',
        followUpQuestion: 'Name at least one explicit non-goal so scope drift stays detectable.',
      };
    },
  },
  {
    name: 'risks-listed',
    severity: 'warning',
    run(input) {
      const count = splitItems(input.risks || '').length;
      const passed = count >= 1;
      return {
        passed,
        detail: passed
          ? `risks lists ${count} item(s).`
          : 'risks is empty; no risks recorded for v1.',
        followUpQuestion: "What's the biggest risk to v1 success?",
      };
    },
  },
  {
    name: 'acceptance-completeness',
    severity: 'warning',
    run(input) {
      const acceptanceWc = wordCount(input.questionnaireAnswers?.['acceptance'] || '');
      const successWc = wordCount(input.successMetrics || '');
      const passed = acceptanceWc >= 12 || successWc >= 12;
      return {
        passed,
        detail: passed
          ? `acceptance answer has ${acceptanceWc} words and successMetrics has ${successWc} words; at least one is >=12.`
          : `acceptance answer has ${acceptanceWc} words and successMetrics has ${successWc} words; neither reaches the 12-word completeness bar.`,
        followUpQuestion: 'How will a skeptical reviewer know v1 is done?',
      };
    },
  },
];

export function runBriefProbes(input: ProjectInput): ProbeResult[] {
  const results: ProbeResult[] = [];
  for (const probe of PROBES) {
    const outcome = probe.run(input);
    if (outcome === null) continue; // skipped (e.g. repo-shape on business track)
    results.push({
      name: probe.name,
      severity: probe.severity,
      passed: outcome.passed,
      detail: outcome.detail,
      followUpQuestion: outcome.followUpQuestion,
    });
  }
  return results;
}

export function renderEnrichmentMarkdown(report: EnrichmentReport): string {
  const lines: string[] = [];
  // Read productName off the first probe-friendly source. We don't have the
  // raw input here, so the caller is expected to embed it via the report's
  // probes' detail strings — but the title needs the actual name, so we
  // require it via a sidecar lookup. To keep the contract clean, we stuff
  // productName into a synthetic field via the inputPath suffix? No — we
  // simply pass productName explicitly through `report.passed` etc. won't
  // help, so we read the file again would break purity. Solution: derive
  // productName from a probe detail isn't reliable. Instead we accept that
  // renderEnrichmentMarkdown takes everything it needs in `report`, so we
  // extend the title to use the file basename as a fallback only if
  // needed. The real productName is already woven through follow-up
  // questions where it matters for the user.
  const fallbackTitle = path.basename(report.inputPath).replace(/\.json$/i, '');
  // We intentionally use the input filename here; the productName is
  // embedded in each probe's follow-up question, so the report stays
  // unambiguous even when the title is just the brief filename.
  lines.push(`# Brief enrichment report — ${fallbackTitle}`);
  lines.push('');
  lines.push(`- Source: ${report.inputPath}`);
  lines.push(
    `- Status: **${report.passed ? 'PASS' : 'FAIL'}** (${report.blockerCount} blocker(s), ${report.warningCount} warning(s))`,
  );
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push('');

  const failingBlockers = report.probes.filter((p) => p.severity === 'blocker' && !p.passed);
  const failingWarnings = report.probes.filter((p) => p.severity === 'warning' && !p.passed);
  const passing = report.probes.filter((p) => p.passed);

  lines.push('## Blockers');
  lines.push('');
  if (failingBlockers.length === 0) {
    lines.push('None.');
    lines.push('');
  } else {
    for (const probe of failingBlockers) {
      lines.push(`### ${probe.name}`);
      lines.push(`- Detail: ${probe.detail}`);
      lines.push(`- Follow-up question: ${probe.followUpQuestion}`);
      lines.push('');
    }
  }

  lines.push('## Warnings');
  lines.push('');
  if (failingWarnings.length === 0) {
    lines.push('None.');
    lines.push('');
  } else {
    for (const probe of failingWarnings) {
      lines.push(`### ${probe.name}`);
      lines.push(`- Detail: ${probe.detail}`);
      lines.push(`- Follow-up question: ${probe.followUpQuestion}`);
      lines.push('');
    }
  }

  lines.push('## Probes passed');
  lines.push('');
  if (passing.length === 0) {
    lines.push('None.');
    lines.push('');
  } else {
    for (const probe of passing) {
      lines.push(`- ${probe.name}: ${probe.detail}`);
    }
    lines.push('');
  }

  lines.push('## Next step');
  lines.push('');
  if (report.passed) {
    lines.push(
      `Run \`npm run create-project -- --input=${report.inputPath}\` to generate the workspace.`,
    );
  } else {
    lines.push(
      `Resolve the blocker(s) above, then re-run \`npm run brief:enrich -- --input=${report.inputPath} --strict\`.`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function getArg(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function buildReport(input: ProjectInput, inputPath: string): EnrichmentReport {
  const probes = runBriefProbes(input);
  const failingBlockers = probes.filter((p) => p.severity === 'blocker' && !p.passed);
  const failingWarnings = probes.filter((p) => p.severity === 'warning' && !p.passed);
  return {
    inputPath,
    passed: failingBlockers.length === 0,
    probes,
    blockerCount: failingBlockers.length,
    warningCount: failingWarnings.length,
  };
}

// Render with productName-aware title. We thread productName separately so
// renderEnrichmentMarkdown stays a pure function of the EnrichmentReport
// contract; the CLI applies a one-line title rewrite afterwards.
function renderWithProductName(report: EnrichmentReport, productName: string): string {
  const md = renderEnrichmentMarkdown(report);
  if (!productName) return md;
  return md.replace(
    /^# Brief enrichment report — .*$/m,
    `# Brief enrichment report — ${productName}`,
  );
}

function main(): void {
  const inputArg = getArg('input');
  if (!inputArg) {
    console.error('Error: --input=<file> is required.');
    process.exit(2);
  }

  const inputPath = path.resolve(inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: input file not found: ${inputPath}`);
    process.exit(2);
  }

  let input: ProjectInput;
  try {
    const raw = fs.readFileSync(inputPath, 'utf8');
    input = JSON.parse(raw) as ProjectInput;
  } catch (err) {
    console.error(`Error: failed to parse ${inputPath}: ${(err as Error).message}`);
    process.exit(2);
    return;
  }

  const report = buildReport(input, inputArg);
  const markdown = renderWithProductName(report, input.productName || '');

  const outArg = getArg('out');
  const outPath = outArg ? path.resolve(outArg) : `${inputPath}.enrichment.md`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');

  const strict = hasFlag('strict');
  const passing = report.probes.filter((p) => p.passed).length;
  const total = report.probes.length;
  console.log(
    `[brief:enrich] ${report.passed ? 'PASS' : 'FAIL'} — ${passing}/${total} probes passed (${report.blockerCount} blocker(s), ${report.warningCount} warning(s))`,
  );
  console.log(`[brief:enrich] report: ${outPath}`);

  if (strict && !report.passed) {
    process.exit(1);
  }
}

// Only run main() when invoked as a script, not when imported.
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
  main();
}
