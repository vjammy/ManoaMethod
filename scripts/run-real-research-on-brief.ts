#!/usr/bin/env node
/**
 * Phase A4 proof run: drive the real lib/research/loop.ts against a single
 * brief using the Anthropic SDK provider, then write extractions to the
 * existing research/extracted/ layout that create-project --research-from
 * already consumes.
 *
 * Usage:
 *   tsx scripts/run-real-research-on-brief.ts --input=examples/sdr-sales-module.json --out=.tmp/a4-real
 *   (requires ANTHROPIC_API_KEY in env)
 *
 * Output:
 *   <out>/research/USE_CASE_RESEARCH.md
 *   <out>/research/DOMAIN_RESEARCH.md
 *   <out>/research/CONVERGENCE_LOG.md
 *   <out>/research/extracted/*.json
 *   <out>/RUN_SUMMARY.md         (passes, scores, tokens, durations)
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

function getArg(name: string): string | undefined {
  const exact = process.argv.find((a) => a.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

async function main() {
  const inputArg = getArg('input');
  const outArg = getArg('out');
  const maxPasses = Number(getArg('max-passes') || '4');
  const tokenCap = Number(getArg('token-cap') || '200000');
  const auditThresholdArg = getArg('audit-threshold');
  const auditThreshold = auditThresholdArg ? Number(auditThresholdArg) : undefined;
  const auditMaxRetries = Number(getArg('audit-max-retries') || '2');
  const respectCaps = (getArg('respect-caps') || 'true').toLowerCase() !== 'false';
  const enforceDepth = (getArg('enforce-depth') || 'false').toLowerCase() === 'true';

  if (!inputArg || !outArg) {
    console.error('Usage: tsx scripts/run-real-research-on-brief.ts --input=brief.json --out=<dir> [--max-passes=4] [--token-cap=200000] [--audit-threshold=95] [--audit-max-retries=2] [--respect-caps=true] [--enforce-depth=true]');
    process.exit(1);
  }

  const brief = JSON.parse(fs.readFileSync(path.resolve(inputArg), 'utf8')) as ProjectInput;
  const out = path.resolve(outArg);
  fs.mkdirSync(out, { recursive: true });

  console.log(`[A4] Loading Anthropic provider…`);
  const provider = await loadAnthropicProvider({ model: 'claude-sonnet-4-6' });

  const auditExit = auditThreshold
    ? { ...buildAuditExitCallback({ brief, threshold: auditThreshold, respectCaps, depthEnforcement: enforceDepth }), maxRetries: auditMaxRetries }
    : undefined;
  if (auditExit) {
    console.log(`[A4] Audit-exit: threshold=${auditThreshold}, respectCaps=${respectCaps}, maxRetries=${auditMaxRetries}, enforceDepth=${enforceDepth}`);
  }

  console.log(`[A4] Running research loop on "${brief.productName}" (max-passes=${maxPasses}, token-cap=${tokenCap.toLocaleString()})…`);
  const startedAt = Date.now();
  const result = await runResearchLoop({ brief, provider, maxPasses, maxTotalTokens: tokenCap, auditExit });
  const elapsedMs = Date.now() - startedAt;
  if (result.auditExit) {
    console.log(
      `[A4] Audit-exit final: total=${result.auditExit.finalAudit.total}, cap=${result.auditExit.finalAudit.capApplied}, retries=${result.auditExit.retries}, passed=${result.auditExit.passed}`
    );
  }

  console.log(`[A4] Loop finished in ${(elapsedMs / 1000).toFixed(1)}s. tokens=${result.totalTokensUsed.toLocaleString()}.`);

  // Validate extractions BEFORE writing so we get a clean error on failure.
  const issues = validateExtractions(result.extractions);
  if (issues.length) {
    console.error(`[A4] Schema validation FAILED — ${issues.length} issues:`);
    for (const i of issues.slice(0, 20)) console.error(`  - ${i.path}: ${i.message}`);
    fs.writeFileSync(path.join(out, 'EXTRACTIONS_RAW.json'), JSON.stringify(result.extractions, null, 2));
    fs.writeFileSync(
      path.join(out, 'VALIDATION_ISSUES.json'),
      JSON.stringify({ issues, extractionsKey: 'EXTRACTIONS_RAW.json' }, null, 2)
    );
    process.exit(2);
  }

  // Write to workspace layout (research/extracted/*.json + narratives + convergence log).
  writeResearchToWorkspace(out, result);

  const summary = renderRunSummary(result, elapsedMs, maxPasses, tokenCap);
  fs.writeFileSync(path.join(out, 'RUN_SUMMARY.md'), summary, 'utf8');

  console.log(`[A4] Wrote: ${path.relative(process.cwd(), path.join(out, 'research'))}`);
  console.log(`[A4] Run summary: ${path.relative(process.cwd(), path.join(out, 'RUN_SUMMARY.md'))}`);
  console.log(`[A4] Schema valid: yes  |  passes use-case=${result.useCase.passes.length}, domain=${result.domain.passes.length}  |  scores u=${result.useCase.finalScore} d=${result.domain.finalScore}`);
}

function renderRunSummary(result: Awaited<ReturnType<typeof runResearchLoop>>, elapsedMs: number, maxPasses: number, tokenCap: number): string {
  const lines: string[] = [];
  lines.push('# A4 — real recipe execution summary');
  lines.push('');
  lines.push(`- Brief hash: \`${result.briefHash}\``);
  lines.push(`- Started: ${result.startedAt}`);
  lines.push(`- Completed: ${result.completedAt}`);
  lines.push(`- Wall-clock: ${(elapsedMs / 1000).toFixed(1)}s`);
  lines.push(`- Token cap: ${tokenCap.toLocaleString()} | Tokens used: ${result.totalTokensUsed.toLocaleString()}`);
  lines.push(`- Pass cap: ${maxPasses}`);
  lines.push('');
  lines.push('## Use-case loop');
  lines.push(renderTopic(result.useCase));
  lines.push('## Domain loop');
  lines.push(renderTopic(result.domain));
  lines.push('## Extraction sizes');
  const ex = result.extractions;
  lines.push(`- actors: ${ex.actors.length}`);
  lines.push(`- entities: ${ex.entities.length}`);
  lines.push(`- workflows: ${ex.workflows.length}  (steps total: ${ex.workflows.reduce((s, w) => s + w.steps.length, 0)})`);
  lines.push(`- integrations: ${ex.integrations.length}`);
  lines.push(`- risks: ${ex.risks.length}`);
  lines.push(`- gates: ${ex.gates.length}`);
  lines.push(`- antiFeatures: ${ex.antiFeatures.length}`);
  lines.push(`- conflicts: ${ex.conflicts.length}`);
  lines.push('');
  return lines.join('\n') + '\n';
}

function renderTopic(t: { topic: string; passes: { pass: number; tokensUsed: number; durationMs: number; critique: { totalScore: number; verdict: string; gaps: { area: string; severity: string }[] } }[]; finalScore: number; convergedEarly: boolean; stalled: boolean }): string {
  const rows = t.passes
    .map(
      (p) =>
        `| ${p.pass} | ${p.critique.totalScore} | ${p.critique.verdict} | ${p.critique.gaps.length} (${p.critique.gaps.filter((g) => g.severity === 'critical').length} critical) | ${p.tokensUsed.toLocaleString()} | ${p.durationMs}ms |`
    )
    .join('\n');
  return `\nFinal score: **${t.finalScore}** — ${t.convergedEarly ? 'converged early' : t.stalled ? 'stalled' : 'reached pass cap'}\n\n| Pass | Score | Verdict | Gaps | Tokens | Duration |\n|---|---|---|---|---|---|\n${rows}\n`;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
