#!/usr/bin/env node
/**
 * Phase G G4 wrapper: drive `runResearchLoop` against a brief with the audit-
 * exit callback configured for production thresholds (--audit-threshold=95
 * --respect-caps --enforce-depth) and capture a structured trace to
 * `.tmp/real-llm-validation-<brief>/REPORT.json`. Comparable to the W4 manual
 * extractions to verify the recipe + gap-feedback wording is actionable to a
 * live model.
 *
 * Requires ANTHROPIC_API_KEY.
 *
 * Usage:
 *   tsx scripts/run-real-research-validation.ts --input=examples/sdr-sales-module.json [--out=.tmp/real-llm-validation-sdr]
 *
 * Outputs (under <out>):
 *   research/USE_CASE_RESEARCH.md
 *   research/DOMAIN_RESEARCH.md
 *   research/CONVERGENCE_LOG.md
 *   research/extracted/*.json
 *   RUN_SUMMARY.md
 *   REPORT.json — structured trace this script writes (the G4 deliverable)
 *   REPORT.md   — human-readable rendering of REPORT.json
 *
 * The current `AuditExitOutcome` exposes the final audit but not a per-retry
 * history. The script records `auditRetries` and the final depth-gate state;
 * adding a richer per-retry trace is a follow-up that requires lib/research/
 * loop.ts to surface `retryHistory`. The runbook documents that follow-up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectInput } from '../lib/types';
import { runResearchLoop } from '../lib/research/loop';
import { loadAnthropicProvider } from '../lib/research/providers';
import { writeResearchToWorkspace } from '../lib/research/persistence';
import { validateExtractions } from '../lib/research/schema';
import { buildAuditExitCallback } from '../lib/research/audit-exit-runner';

type DepthGateFailureLite = {
  dim: string;
  score: number;
  threshold: number;
  upstreamPass: string;
  remediation: string;
};

type Report = {
  brief: string;
  productName: string;
  model: string;
  threshold: number;
  respectCaps: boolean;
  enforceDepth: boolean;
  totalPasses: number;
  useCasePasses: number;
  domainPasses: number;
  auditRetries: number;
  finalDepthGateBlocking: DepthGateFailureLite[];
  finalAudit: { total: number; cap: number; passed: boolean } | null;
  elapsedMs: number;
  tokensUsed: number;
  schemaValid: boolean;
  schemaIssueCount: number;
  baselineComparison?: { baselinePackageRoot: string; baselineTotal: number; baselineDepth: number };
};

function getArg(name: string): string | undefined {
  const exact = process.argv.find((a) => a.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

function briefSlug(inputPath: string): string {
  const base = path.basename(inputPath).replace(/\.json$/i, '');
  return base.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

async function main() {
  const inputArg = getArg('input');
  if (!inputArg) {
    console.error('Usage: tsx scripts/run-real-research-validation.ts --input=<brief.json> [--out=<dir>] [--threshold=95] [--max-retries=2] [--max-passes=10]');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[G4] ANTHROPIC_API_KEY not set. This script requires a real API key — see docs/REAL_LLM_VALIDATION_RUNBOOK.md.');
    process.exit(1);
  }

  const slug = briefSlug(inputArg);
  const out = path.resolve(getArg('out') || `.tmp/real-llm-validation-${slug}`);
  const threshold = Number(getArg('threshold') || '95');
  const maxRetries = Number(getArg('max-retries') || '2');
  const maxPasses = Number(getArg('max-passes') || '10');
  const tokenCap = Number(getArg('token-cap') || '300000');
  const respectCaps = (getArg('respect-caps') || 'true').toLowerCase() !== 'false';
  const enforceDepth = (getArg('enforce-depth') || 'true').toLowerCase() === 'true';

  fs.mkdirSync(out, { recursive: true });
  const brief = JSON.parse(fs.readFileSync(path.resolve(inputArg), 'utf8')) as ProjectInput;

  console.log(`[G4] brief=${inputArg} out=${out}`);
  console.log(`[G4] threshold=${threshold} respect-caps=${respectCaps} enforce-depth=${enforceDepth} max-retries=${maxRetries} max-passes=${maxPasses}`);

  const model = 'claude-sonnet-4-6';
  console.log(`[G4] loading provider model=${model} …`);
  const provider = await loadAnthropicProvider({ model });

  const auditCallback = buildAuditExitCallback({
    brief,
    threshold,
    respectCaps,
    depthEnforcement: enforceDepth
  });
  const auditExit = { ...auditCallback, maxRetries };

  console.log(`[G4] running research loop on "${brief.productName}" …`);
  const startedAt = Date.now();
  const result = await runResearchLoop({
    brief,
    provider,
    maxPasses,
    maxTotalTokens: tokenCap,
    auditExit
  });
  const elapsedMs = Date.now() - startedAt;
  console.log(`[G4] loop done in ${(elapsedMs / 1000).toFixed(1)}s, tokens=${result.totalTokensUsed.toLocaleString()}`);

  const issues = validateExtractions(result.extractions);
  const schemaValid = issues.length === 0;

  if (schemaValid) writeResearchToWorkspace(out, result);
  else {
    fs.writeFileSync(path.join(out, 'EXTRACTIONS_RAW.json'), JSON.stringify(result.extractions, null, 2));
    fs.writeFileSync(path.join(out, 'VALIDATION_ISSUES.json'), JSON.stringify(issues, null, 2));
  }

  const auditTrace = result.auditExit;
  const finalDepthGateBlocking = (auditTrace?.finalAudit?.depthGateBlocking || []) as DepthGateFailureLite[];

  const report: Report = {
    brief: path.resolve(inputArg),
    productName: brief.productName,
    model,
    threshold,
    respectCaps,
    enforceDepth,
    totalPasses: result.useCase.passes.length + result.domain.passes.length,
    useCasePasses: result.useCase.passes.length,
    domainPasses: result.domain.passes.length,
    auditRetries: auditTrace?.retries ?? 0,
    finalDepthGateBlocking,
    finalAudit: auditTrace
      ? {
          total: auditTrace.finalAudit.total,
          cap: auditTrace.finalAudit.capApplied,
          passed: auditTrace.passed
        }
      : null,
    elapsedMs,
    tokensUsed: result.totalTokensUsed,
    schemaValid,
    schemaIssueCount: issues.length
  };

  const baseline = pickW4Baseline(slug);
  if (baseline) {
    const b = readBaselineAudit(baseline);
    if (b) {
      report.baselineComparison = { baselinePackageRoot: baseline, baselineTotal: b.total, baselineDepth: b.depth };
    }
  }

  fs.writeFileSync(path.join(out, 'REPORT.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(out, 'REPORT.md'), renderReport(report));

  console.log(`[G4] wrote ${path.join(out, 'REPORT.json')}`);
  console.log(`[G4] wrote ${path.join(out, 'REPORT.md')}`);

  if (!schemaValid) {
    console.error(`[G4] FAIL — schema validation failed (${issues.length} issues). See VALIDATION_ISSUES.json.`);
    process.exit(2);
  }
  if (report.finalAudit && !report.finalAudit.passed) {
    console.error(`[G4] FAIL — audit threshold not met after ${report.auditRetries} retries.`);
    process.exit(3);
  }
  console.log('[G4] PASS');
}

function renderReport(r: Report): string {
  const lines: string[] = [];
  lines.push(`# Real LLM validation — ${r.productName}`);
  lines.push('');
  lines.push(`- Brief: \`${r.brief}\``);
  lines.push(`- Model: \`${r.model}\``);
  lines.push(`- Threshold: ${r.threshold}/100, respect-caps: ${r.respectCaps}, enforce-depth: ${r.enforceDepth}`);
  lines.push(`- Total passes: ${r.totalPasses} (use-case=${r.useCasePasses}, domain=${r.domainPasses})`);
  lines.push(`- Audit retries: ${r.auditRetries}`);
  lines.push(`- Elapsed: ${(r.elapsedMs / 1000).toFixed(1)}s`);
  lines.push(`- Tokens used: ${r.tokensUsed.toLocaleString()}`);
  lines.push(`- Schema valid: ${r.schemaValid ? 'yes' : `no (${r.schemaIssueCount} issues)`}`);
  if (r.finalAudit) {
    lines.push(`- Final audit: ${r.finalAudit.total}/100, cap ${r.finalAudit.cap}, passed=${r.finalAudit.passed}`);
  }
  if (r.baselineComparison) {
    lines.push('');
    lines.push('## Comparison to W4 manual baseline');
    lines.push('');
    lines.push(`- Baseline package: \`${r.baselineComparison.baselinePackageRoot}\``);
    lines.push(`- Baseline audit: ${r.baselineComparison.baselineTotal}/100, depth ${r.baselineComparison.baselineDepth}/30`);
    if (r.finalAudit) {
      const totalDelta = r.finalAudit.total - r.baselineComparison.baselineTotal;
      lines.push(`- Live vs baseline (total): ${totalDelta >= 0 ? '+' : ''}${totalDelta}`);
    }
  }
  lines.push('');
  lines.push('## Final depth-gate state');
  lines.push('');
  if (!r.finalDepthGateBlocking.length) {
    lines.push('No blocking depth-gate failures in the final audit.');
  } else {
    lines.push('Final blocking failures (audit retries exhausted before these resolved):');
    for (const f of r.finalDepthGateBlocking) {
      lines.push(`- **\`${f.dim}\`** = ${f.score} (≥ ${f.threshold}) — ${f.upstreamPass}`);
      lines.push(`  - Remediation: ${f.remediation}`);
    }
  }
  lines.push('');
  lines.push('## Red-flag check');
  lines.push('');
  if (r.auditRetries === 0) {
    lines.push('Audit passed on the first run — no red flags.');
  } else if (r.finalAudit?.passed) {
    lines.push(`Audit passed after ${r.auditRetries} retry/retries — gap feedback is actionable.`);
  } else {
    lines.push(`**Investigate**: audit FAILED after ${r.auditRetries} retries. Recipe + gap-feedback wording may not be actionable to a live model. See REAL_LLM_VALIDATION_RUNBOOK.md "Red flags" section.`);
  }
  return lines.join('\n') + '\n';
}

function pickW4Baseline(slug: string): string | undefined {
  const candidates: Array<[string, string]> = [
    ['conference-sdr', '.tmp/recipe-validation/out/mvp-builder-workspace'],
    ['sdr-sales', '.tmp/recipe-validation/out/mvp-builder-workspace'],
    ['clinic', '.tmp/w4-clinic/out/mvp-builder-workspace'],
    ['pantry', '.tmp/w4-pantry/out/mvp-builder-workspace'],
    ['budget', '.tmp/w4-budget/out/mvp-builder-workspace']
  ];
  for (const [needle, baseline] of candidates) {
    if (slug.includes(needle) && fs.existsSync(path.resolve(baseline))) return baseline;
  }
  return undefined;
}

function readBaselineAudit(packageRoot: string): { total: number; depth: number } | undefined {
  const auditDir = path.join(packageRoot, 'evidence', 'audit');
  if (!fs.existsSync(auditDir)) return undefined;
  const files = fs.readdirSync(auditDir).filter((f) => f.startsWith('QUALITY_AUDIT-') && f.endsWith('.md')).sort();
  if (!files.length) return undefined;
  const last = fs.readFileSync(path.join(auditDir, files[files.length - 1]), 'utf8');
  const totalMatch = last.match(/\*\*Overall:\*\*\s*(\d+)\/100/);
  const depthMatch = last.match(/\*\*Depth grade:\*\*\s*(\d+)\/30/);
  if (!totalMatch || !depthMatch) return undefined;
  return { total: Number(totalMatch[1]), depth: Number(depthMatch[1]) };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error('[G4] crashed:', err);
    process.exit(1);
  });
}
