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
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ideas } from './loop-50-ideas';

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
};

function runCmd(name: string, command: string, args: string[], cwd: string): StepResult {
  const startedAt = Date.now();
  const isWindows = process.platform === 'win32';
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: isWindows,
    timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, INIT_CWD: cwd }
  });
  const stdoutTail = (result.stdout || '').slice(-1500);
  const stderrTail = (result.stderr || '').slice(-1500);
  return {
    name,
    command: `${command} ${args.join(' ')}`,
    passed: result.status === 0,
    exitCode: typeof result.status === 'number' ? result.status : null,
    durationMs: Date.now() - startedAt,
    stdoutTail,
    stderrTail
  };
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

  // Step 1: create-project
  steps.push(
    runCmd('create-project', 'npm', ['run', 'create-project', '--', `--input=${inputJsonPath}`, `--out=${outDir}`], REPO_ROOT)
  );
  if (!fs.existsSync(packageDir)) {
    notes.push('Workspace not generated; remaining steps skipped.');
    return finalize(iteration, idea, packageDir, startedAt, steps, notes);
  }

  // Step 2: validate
  steps.push(runCmd('validate', 'npm', ['run', 'validate', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 3: status
  steps.push(runCmd('status', 'npm', ['run', 'status', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 4: traceability
  steps.push(runCmd('traceability', 'npm', ['run', 'traceability', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 5: gates
  steps.push(runCmd('gates', 'npm', ['run', 'gates', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 6: regression suite (workspace artifact regression)
  steps.push(runCmd('regression', 'npm', ['run', 'regression', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 7: test-scripts (uses INIT_CWD via test-scripts.ts spawn cwd)
  steps.push(runCmd('test-scripts', 'npm', ['run', 'test-scripts', '--', `--package=${packageDir}`], REPO_ROOT));

  // Step 8: probe with --skip-start to avoid starting 50 dev servers
  steps.push(
    runCmd('probe-skip-start', 'npm', ['run', 'probe', '--', `--package=${packageDir}`, '--skip-start=true'], REPO_ROOT)
  );

  // Step 9: loop one round, dry-run-test-scripts to skip live app dependency
  steps.push(
    runCmd(
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

  return finalize(iteration, idea, packageDir, startedAt, steps, notes);
}

function finalize(
  iteration: number,
  idea: typeof ideas[number],
  packageDir: string,
  startedAt: string,
  steps: StepResult[],
  notes: string[]
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
    notes
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
  lines.push('| # | Product | Status | Failing steps |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of results) {
    const failing = r.steps.filter((s) => !s.passed).map((s) => s.name).join(', ') || '—';
    lines.push(`| ${r.iteration} | ${r.productName} | ${r.passed ? 'PASS' : 'FAIL'} | ${failing} |`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  ensureDir(RUN_ROOT);
  const startArg = process.argv.find((a) => a.startsWith('--start='));
  const endArg = process.argv.find((a) => a.startsWith('--end='));
  const start = startArg ? Number.parseInt(startArg.slice('--start='.length), 10) : 1;
  const end = endArg ? Number.parseInt(endArg.slice('--end='.length), 10) : 50;

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
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
