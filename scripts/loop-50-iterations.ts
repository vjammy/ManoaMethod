#!/usr/bin/env node
/**
 * 50-iteration loop harness for the MVP Builder.
 *
 * For each iteration:
 *   1. Pick a curated business idea
 *   2. Generate workspace via create-project
 *   3. Validate it
 *   4. Run status / traceability / gates
 *   5. Run test-scripts
 *   6. Run regression suite
 *   7. Run loop with --skip-start (probe steps that don't require live app)
 *   8. Verify autoresearch artifacts referenced
 *   9. Record per-iteration observations
 *
 * Aggregates and writes a final report to .tmp/loop-50/REPORT.md.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ideas } from './loop-50-ideas';
import { runAudit, renderAudit } from './mvp-builder-quality-audit';
import { synthesizeExtractions, writeSynthesizedToWorkspace } from './synthesize-research-ontology';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ROOT = path.join(REPO_ROOT, '.tmp', 'loop-50');

type StepResult = {
  name: string;
  command: string;
  passed: boolean;
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
};

type AuditSnapshot = {
  total: number;
  rating: 'cookie-cutter' | 'thin' | 'workable' | 'production-ready';
  researchGrounded: boolean;
  dimensions: Array<{ name: string; score: number; max: number }>;
  topFindings: Array<{ dimension: string; severity: string; message: string }>;
};

type IterationResult = {
  iteration: number;
  idea: string;
  productName: string;
  packageDir: string;
  startedAt: string;
  finishedAt: string;
  steps: StepResult[];
  passed: boolean;
  notes: string[];
  audit?: AuditSnapshot;
};

function runCmd(name: string, command: string, args: string[], cwd: string): Promise<StepResult> {
  const startedAt = Date.now();
  const isWindows = process.platform === 'win32';
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: isWindows,
      env: { ...process.env, INIT_CWD: cwd }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 8 * 1024 * 1024) stdout = stdout.slice(-(2 * 1024 * 1024));
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 8 * 1024 * 1024) stderr = stderr.slice(-(2 * 1024 * 1024));
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 300_000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({
        name,
        command: `${command} ${args.join(' ')}`,
        passed: code === 0,
        exitCode: typeof code === 'number' ? code : null,
        durationMs: Date.now() - startedAt,
        stdoutTail: stdout.slice(-1500),
        stderrTail: stderr.slice(-1500)
      });
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      resolve({
        name,
        command: `${command} ${args.join(' ')}`,
        passed: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdoutTail: '',
        stderrTail: err.message
      });
    });
  });
}

function tail(s: string, n = 400) {
  return s.length <= n ? s : '...' + s.slice(-n);
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeText(p: string, content: string) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}

function summarize(result: IterationResult): string {
  const passCount = result.steps.filter((s) => s.passed).length;
  const total = result.steps.length;
  const status = result.passed ? 'PASS' : 'FAIL';
  return `[${result.iteration.toString().padStart(2, '0')}/50] ${status} ${result.productName} — ${passCount}/${total} steps`;
}

async function runIteration(iteration: number, idea: typeof ideas[number]): Promise<IterationResult> {
  const slug = idea.slug;
  const startedAt = new Date().toISOString();
  const iterDir = path.join(RUN_ROOT, `iter-${String(iteration).padStart(2, '0')}-${slug}`);
  const inputJsonPath = path.join(iterDir, 'input.json');
  const outDir = path.join(iterDir, 'out');
  const packageDir = path.join(outDir, 'mvp-builder-workspace');
  ensureDir(iterDir);
  fs.writeFileSync(inputJsonPath, JSON.stringify(idea.input, null, 2), 'utf8');

  const steps: StepResult[] = [];
  const notes: string[] = [];

  // Step 0: synthesize research extractions from the brief (deterministic, in-process).
  // Real users get this from an agent following docs/RESEARCH_RECIPE.md; the synthesizer
  // is the harness-only bridge that lets us measure audit deltas without LLM calls.
  const researchInputDir = path.join(iterDir, 'research-input');
  const synthStart = Date.now();
  let synthOk = false;
  let synthOutput = '';
  try {
    const ex = synthesizeExtractions(idea.input);
    fs.mkdirSync(researchInputDir, { recursive: true });
    writeSynthesizedToWorkspace(researchInputDir, idea.input, ex);
    synthOk = true;
    synthOutput = `actors=${ex.actors.length} entities=${ex.entities.length} workflows=${ex.workflows.length} risks=${ex.risks.length} gates=${ex.gates.length}`;
  } catch (err) {
    synthOutput = `synthesizer threw: ${(err as Error).message}`;
  }
  steps.push({
    name: 'synthesize-research',
    command: 'in-process synthesize-research-ontology',
    passed: synthOk,
    exitCode: synthOk ? 0 : 1,
    durationMs: Date.now() - synthStart,
    stdoutTail: synthOutput,
    stderrTail: ''
  });

  // Step 1: create-project, hydrated with synthesized research
  steps.push(
    await runCmd(
      'create-project',
      'npm',
      ['run', 'create-project', '--', `--input=${inputJsonPath}`, `--out=${outDir}`, `--research-from=${researchInputDir}`],
      REPO_ROOT
    )
  );
  if (!fs.existsSync(packageDir)) {
    notes.push('Workspace not generated; remaining steps skipped.');
    return finalize(iteration, idea, packageDir, startedAt, steps, notes);
  }

  // Step 2: validate
  steps.push(await runCmd('validate', 'npm', ['run', 'validate', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 3: status
  steps.push(await runCmd('status', 'npm', ['run', 'status', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 4: traceability
  steps.push(await runCmd('traceability', 'npm', ['run', 'traceability', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 5: gates
  steps.push(await runCmd('gates', 'npm', ['run', 'gates', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 6: regression suite (workspace artifact regression)
  steps.push(await runCmd('regression', 'npm', ['run', 'regression', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 7: test-scripts (uses INIT_CWD via test-scripts.ts spawn cwd)
  steps.push(await runCmd('test-scripts', 'npm', ['run', 'test-scripts', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 8: probe with --skip-start to avoid starting 50 dev servers
  steps.push(
    await runCmd('probe-skip-start', 'npm', ['run', 'probe', '--', `--package=${packageDir}`, '--skip-start=true'], REPO_ROOT)
  );

  // Step 9: loop one round, dry-run-test-scripts to skip live app dependency
  steps.push(
    await runCmd(
      'loop-dry',
      'npm',
      ['run', 'loop', '--', `--package=${packageDir}`, '--max-iterations=1', '--skip-start=true', '--dry-run-test-scripts=true'],
      REPO_ROOT
    )
  );

  // Step 10: autoresearch artifacts present in workspace
  const autoResearchPaths = [
    path.join(packageDir, 'AUTORESEARCH_NOTES.md'),
    path.join(packageDir, 'autoresearch'),
    path.join(packageDir, 'requirements')
  ];
  const found = autoResearchPaths.find((p) => fs.existsSync(p));
  steps.push({
    name: 'autoresearch-coverage',
    command: 'check workspace autoresearch artifacts',
    passed: Boolean(found),
    exitCode: found ? 0 : 1,
    durationMs: 0,
    stdoutTail: found ? `Found: ${path.relative(packageDir, found)}` : 'No autoresearch artifacts found in workspace',
    stderrTail: ''
  });

  // Step 11: quality audit (in-process, fast)
  const auditStart = Date.now();
  let audit: AuditSnapshot | undefined;
  let auditPassed = false;
  let auditOutput = '';
  try {
    const result = runAudit(packageDir);
    audit = {
      total: result.total,
      rating: result.rating,
      researchGrounded: result.researchGrounded,
      dimensions: result.dimensions.map((d) => ({ name: d.name, score: d.score, max: d.max })),
      topFindings: result.topFindings.map((f) => ({ dimension: f.dimension, severity: f.severity, message: f.message }))
    };
    const auditDir = path.join(packageDir, 'evidence', 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    fs.writeFileSync(path.join(auditDir, 'last-audit.json'), JSON.stringify(result, null, 2), 'utf8');
    fs.writeFileSync(path.join(auditDir, 'QUALITY_AUDIT.md'), renderAudit(result), 'utf8');
    auditPassed = result.total >= 70;
    auditOutput = `${result.total}/100 — ${result.rating} (research-grounded=${result.researchGrounded})`;
  } catch (err) {
    auditOutput = `audit threw: ${(err as Error).message}`;
  }
  steps.push({
    name: 'quality-audit',
    command: 'in-process quality audit',
    passed: auditPassed,
    exitCode: auditPassed ? 0 : 1,
    durationMs: Date.now() - auditStart,
    stdoutTail: auditOutput,
    stderrTail: ''
  });

  return finalize(iteration, idea, packageDir, startedAt, steps, notes, audit);
}

function finalize(
  iteration: number,
  idea: typeof ideas[number],
  packageDir: string,
  startedAt: string,
  steps: StepResult[],
  notes: string[],
  audit?: AuditSnapshot
): IterationResult {
  const finishedAt = new Date().toISOString();
  const passed = steps.length > 0 && steps.every((s) => s.passed);
  return {
    iteration,
    idea: idea.input.productIdea.slice(0, 120),
    productName: idea.input.productName,
    packageDir,
    startedAt,
    finishedAt,
    steps,
    passed,
    notes,
    audit
  };
}

function renderIterationLog(r: IterationResult): string {
  const lines: string[] = [];
  lines.push(`# Iteration ${r.iteration} — ${r.productName}`);
  lines.push('');
  lines.push(`- Idea: ${r.idea}`);
  lines.push(`- Started: ${r.startedAt}`);
  lines.push(`- Finished: ${r.finishedAt}`);
  lines.push(`- Overall: ${r.passed ? 'PASS' : 'FAIL'}`);
  if (r.notes.length) {
    lines.push('');
    lines.push('## Notes');
    r.notes.forEach((n) => lines.push(`- ${n}`));
  }
  lines.push('');
  lines.push('## Steps');
  for (const step of r.steps) {
    lines.push(`### ${step.name} — ${step.passed ? 'PASS' : 'FAIL'} (exit=${step.exitCode}, ${step.durationMs}ms)`);
    lines.push('```');
    lines.push(step.command);
    lines.push('```');
    if (step.stdoutTail.trim()) {
      lines.push('stdout (tail):');
      lines.push('```');
      lines.push(tail(step.stdoutTail));
      lines.push('```');
    }
    if (step.stderrTail.trim()) {
      lines.push('stderr (tail):');
      lines.push('```');
      lines.push(tail(step.stderrTail));
      lines.push('```');
    }
  }
  return lines.join('\n') + '\n';
}

function renderRunReport(results: IterationResult[]): string {
  const lines: string[] = [];
  const totalIters = results.length;
  const passed = results.filter((r) => r.passed).length;
  const allSteps = results.flatMap((r) => r.steps);
  const stepStats = new Map<string, { pass: number; fail: number }>();
  for (const s of allSteps) {
    const stats = stepStats.get(s.name) || { pass: 0, fail: 0 };
    if (s.passed) stats.pass += 1;
    else stats.fail += 1;
    stepStats.set(s.name, stats);
  }
  lines.push(`# 50-iteration loop — final report`);
  lines.push('');
  lines.push(`- Iterations: ${totalIters}`);
  lines.push(`- All-green iterations: ${passed}/${totalIters}`);
  lines.push('');
  lines.push('## Step pass/fail breakdown');
  lines.push('| Step | Pass | Fail |');
  lines.push('| --- | --- | --- |');
  for (const [name, stats] of stepStats) {
    lines.push(`| ${name} | ${stats.pass} | ${stats.fail} |`);
  }
  lines.push('');
  lines.push('## Per-iteration summary');
  lines.push('| # | Product | Status | Audit | Rating | Failing steps |');
  lines.push('| --- | --- | --- | ---: | --- | --- |');
  for (const r of results) {
    const failing = r.steps.filter((s) => !s.passed).map((s) => s.name).join(', ') || '—';
    const auditTotal = r.audit ? `${r.audit.total}/100` : '—';
    const auditRating = r.audit ? r.audit.rating : '—';
    lines.push(`| ${r.iteration} | ${r.productName} | ${r.passed ? 'PASS' : 'FAIL'} | ${auditTotal} | ${auditRating} | ${failing} |`);
  }

  // Aggregate audit section
  const audits = results.filter((r) => r.audit).map((r) => r.audit!);
  if (audits.length) {
    lines.push('');
    lines.push('## Quality audit aggregate');
    const totals = audits.map((a) => a.total).sort((a, b) => a - b);
    const min = totals[0];
    const max = totals[totals.length - 1];
    const median = totals[Math.floor(totals.length / 2)];
    const mean = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
    const ratingCounts = new Map<string, number>();
    audits.forEach((a) => ratingCounts.set(a.rating, (ratingCounts.get(a.rating) || 0) + 1));
    const grounded = audits.filter((a) => a.researchGrounded).length;
    lines.push(`- Workspaces audited: ${audits.length}`);
    lines.push(`- Score: min ${min} / median ${median} / mean ${mean} / max ${max}`);
    lines.push(`- Research-grounded: ${grounded}/${audits.length}`);
    lines.push('');
    lines.push('| Rating | Count |');
    lines.push('| --- | ---: |');
    for (const [rating, count] of ratingCounts) {
      lines.push(`| ${rating} | ${count} |`);
    }
    // Per-dimension averages
    const dimMap = new Map<string, { total: number; max: number; n: number }>();
    for (const a of audits) {
      for (const d of a.dimensions) {
        const existing = dimMap.get(d.name) || { total: 0, max: d.max, n: 0 };
        existing.total += d.score;
        existing.n += 1;
        dimMap.set(d.name, existing);
      }
    }
    lines.push('');
    lines.push('### Dimension averages');
    lines.push('| Dimension | Mean | Max |');
    lines.push('| --- | ---: | ---: |');
    for (const [name, stats] of dimMap) {
      const mean2 = stats.n ? (stats.total / stats.n).toFixed(1) : '—';
      lines.push(`| ${name} | ${mean2} | ${stats.max} |`);
    }
    // Top findings frequency
    const findingFreq = new Map<string, number>();
    for (const a of audits) {
      for (const f of a.topFindings) {
        const key = `[${f.severity}] ${f.dimension}: ${f.message}`;
        findingFreq.set(key, (findingFreq.get(key) || 0) + 1);
      }
    }
    const sorted = Array.from(findingFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length) {
      lines.push('');
      lines.push('### Most common findings');
      for (const [msg, count] of sorted) {
        lines.push(`- (${count}×) ${msg}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

function startPlaceholderServer(port: number): Promise<{ close: () => Promise<void> } | null> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<html><head><title>MVP Builder Probe Placeholder</title></head><body><h1>OK</h1><p>${req.url}</p></body></html>`);
    });
    server.once('error', () => resolve(null));
    server.listen(port, () => {
      resolve({
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          })
      });
    });
  });
}

async function main() {
  ensureDir(RUN_ROOT);
  const startArg = process.argv.find((a) => a.startsWith('--start='));
  const endArg = process.argv.find((a) => a.startsWith('--end='));
  const start = startArg ? Number.parseInt(startArg.slice('--start='.length), 10) : 1;
  const end = endArg ? Number.parseInt(endArg.slice('--end='.length), 10) : 50;
  const placeholder = await startPlaceholderServer(3000);
  if (placeholder) {
    console.log('[harness] Started placeholder HTTP server on :3000 for probe steps.');
  } else {
    console.log('[harness] Port 3000 already taken — relying on the externally running server.');
  }

  const results: IterationResult[] = [];
  for (let i = start; i <= end && i <= ideas.length; i += 1) {
    const idea = ideas[i - 1];
    console.log(`\n=== Iteration ${i}/50: ${idea.input.productName} ===`);
    const result = await runIteration(i, idea);
    const iterDir = path.join(RUN_ROOT, `iter-${String(i).padStart(2, '0')}-${idea.slug}`);
    writeText(path.join(iterDir, 'iteration-log.md'), renderIterationLog(result));
    writeText(path.join(iterDir, 'iteration.json'), JSON.stringify(result, null, 2));
    results.push(result);
    console.log(summarize(result));
  }

  writeText(path.join(RUN_ROOT, 'REPORT.md'), renderRunReport(results));
  writeText(
    path.join(RUN_ROOT, 'results.json'),
    JSON.stringify(
      results.map((r) => ({ iteration: r.iteration, productName: r.productName, passed: r.passed, steps: r.steps.map((s) => ({ name: s.name, passed: s.passed, exitCode: s.exitCode })) })),
      null,
      2
    )
  );
  const passed = results.filter((r) => r.passed).length;
  console.log(`\n=== DONE === ${passed}/${results.length} iterations all-green. Report: ${path.relative(REPO_ROOT, path.join(RUN_ROOT, 'REPORT.md'))}`);
  if (placeholder) await placeholder.close();
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
