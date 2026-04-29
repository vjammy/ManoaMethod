#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileExists, getArg, readJsonFile, resolvePackageRoot, writeJsonFile } from './mvp-builder-package-utils';
import { runLoop } from './mvp-builder-loop';
import { runBrowserLoop } from './mvp-builder-loop-browser';

type AutoRegressionIteration = {
  iteration: number;
  startedAt: string;
  finishedAt: string;
  buildPassed: boolean;
  buildExitCode: number | null;
  buildNotes: string;
  loopScore: number;
  loopStatus: string;
  browserScore: number;
  browserCovered: number;
  browserTotal: number;
  combinedScore: number;
  target: number;
  fixPromptPath: string;
};

type AutoRegressionState = {
  iterations: AutoRegressionIteration[];
  lastCombinedScore: number;
  status: 'running' | 'converged' | 'stalled' | 'max-iterations' | 'aborted' | 'no-build';
};

const STATE_RELATIVE = 'repo/mvp-builder-auto-regression-state.json';

function readState(packageRoot: string): AutoRegressionState {
  const filePath = path.join(packageRoot, STATE_RELATIVE);
  if (!fileExists(filePath)) {
    return { iterations: [], lastCombinedScore: 0, status: 'running' };
  }
  return readJsonFile<AutoRegressionState>(filePath);
}

function writeState(packageRoot: string, state: AutoRegressionState) {
  writeJsonFile(path.join(packageRoot, STATE_RELATIVE), state);
}

function runBuild(packageRoot: string, buildCommand: string): { exitCode: number | null; passed: boolean; notes: string } {
  const isWindows = process.platform === 'win32';
  const result = spawnSync(buildCommand, {
    cwd: packageRoot,
    shell: isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh',
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 16 * 1024 * 1024
  });
  const exitCode = typeof result.status === 'number' ? result.status : null;
  const passed = exitCode === 0;
  const stderrSnippet = (result.stderr || '').slice(0, 1024);
  const stdoutSnippet = (result.stdout || '').slice(0, 1024);
  return {
    exitCode,
    passed,
    notes: passed
      ? `Build "${buildCommand}" exited with 0.`
      : `Build "${buildCommand}" exited with ${exitCode ?? 'no exit code'}. stderr: ${stderrSnippet}. stdout: ${stdoutSnippet}.`
  };
}

function combineScores(loopScore: number, browserScore: number, browserAvailable: boolean): number {
  if (!browserAvailable) return loopScore;
  return Math.round(loopScore * 0.5 + browserScore * 0.5);
}

function buildIterationFixPrompt(args: {
  iteration: number;
  combinedScore: number;
  target: number;
  loopScore: number;
  browserScore: number;
  browserCovered: number;
  browserTotal: number;
  buildPassed: boolean;
  buildNotes: string;
  stalled: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`# AUTO_REGRESSION_FIX_PROMPT — iteration ${args.iteration}`);
  lines.push('');
  lines.push('## What this file is for');
  lines.push(
    'The MVP Builder auto-regression loop combined build, HTTP probe + test-script execution, and browser-driven requirement coverage. The combined score is below target. This file lists every concrete failure for the next iteration to fix.'
  );
  lines.push('');
  lines.push('## Score summary');
  lines.push(`- Combined score: ${args.combinedScore}/100`);
  lines.push(`- HTTP loop score: ${args.loopScore}/100`);
  lines.push(`- Browser loop score: ${args.browserScore}/100 (covered ${args.browserCovered}/${args.browserTotal})`);
  lines.push(`- Target: ${args.target}/100`);
  lines.push(`- Stalled from previous iteration: ${args.stalled ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Build');
  lines.push(`- Build passed: ${args.buildPassed ? 'yes' : 'no'}`);
  lines.push(`- Notes: ${args.buildNotes}`);
  lines.push('');
  lines.push('## What to inspect for the next iteration');
  lines.push('1. Check `evidence/runtime/last-test-scripts.json` for the failing TEST_SCRIPT.md steps.');
  lines.push('2. Check the latest `evidence/runtime/browser/<timestamp>/BROWSER_LOOP_REPORT.md` for uncovered REQ-IDs.');
  lines.push('3. Cross-reference uncovered REQ-IDs with `requirements/ACCEPTANCE_CRITERIA.md` and `SAMPLE_DATA.md`.');
  lines.push('4. Implement or fix the failing feature so the happy-path tokens from SAMPLE_DATA.md render on the page.');
  lines.push('5. Do NOT relax SAMPLE_DATA.md tokens, TEST_SCRIPT.md steps, or RUNTIME_TARGET.md to make the loop pass.');
  lines.push('6. After fixes, re-run `npm run auto-regression -- --package=<workspace>`.');
  lines.push('');
  if (args.stalled) {
    lines.push('## Stall warning');
    lines.push('The previous iteration produced the same combined score. If the next iteration also stalls, the loop will exit without converging and a human reviewer must triage.');
    lines.push('');
  }
  lines.push('## Rules');
  lines.push('- Build failures stop the iteration before probe/browser checks run.');
  lines.push('- Forbidden shell commands inside TEST_SCRIPT.md remain skipped; do not whitelist them.');
  lines.push('- Browser coverage is content-presence based: real flow drivers should be added to TEST_SCRIPT.md when richer assertions are needed.');
  return `${lines.join('\n')}\n`;
}

export async function runAutoRegression(): Promise<AutoRegressionState> {
  const packageRoot = resolvePackageRoot(getArg('package'));
  const target = Number.parseInt(getArg('target') || '90', 10);
  const maxIterations = Number.parseInt(getArg('max-iterations') || '3', 10);
  const buildCommand = getArg('build-command') || 'npm run build';
  const skipBrowserArg = (getArg('skip-browser') || '').toLowerCase();
  const skipBrowser = skipBrowserArg === 'true' || skipBrowserArg === '1';

  const state = readState(packageRoot);
  let lastScore = state.lastCombinedScore;

  for (let iteration = state.iterations.length + 1; iteration <= maxIterations; iteration += 1) {
    const startedAt = new Date().toISOString();
    const buildResult = runBuild(packageRoot, buildCommand);

    if (!buildResult.passed) {
      const finishedAt = new Date().toISOString();
      const fixPromptPath = path.join(packageRoot, 'evidence', 'runtime', `AUTO_REGRESSION_FIX_PROMPT_iteration-${String(iteration).padStart(2, '0')}.md`);
      fs.mkdirSync(path.dirname(fixPromptPath), { recursive: true });
      fs.writeFileSync(
        fixPromptPath,
        buildIterationFixPrompt({
          iteration,
          combinedScore: 0,
          target,
          loopScore: 0,
          browserScore: 0,
          browserCovered: 0,
          browserTotal: 0,
          buildPassed: false,
          buildNotes: buildResult.notes,
          stalled: false
        }),
        'utf8'
      );
      state.iterations.push({
        iteration,
        startedAt,
        finishedAt,
        buildPassed: false,
        buildExitCode: buildResult.exitCode,
        buildNotes: buildResult.notes,
        loopScore: 0,
        loopStatus: 'skipped-build-failed',
        browserScore: 0,
        browserCovered: 0,
        browserTotal: 0,
        combinedScore: 0,
        target,
        fixPromptPath: path.relative(packageRoot, fixPromptPath).replace(/\\/g, '/')
      });
      state.lastCombinedScore = 0;
      state.status = 'no-build';
      writeState(packageRoot, state);
      console.log(`Iteration ${iteration}: build failed. Stopping.`);
      console.log(`Fix prompt: ${path.relative(packageRoot, fixPromptPath).replace(/\\/g, '/')}`);
      return state;
    }

    // Re-run the existing HTTP/test-scripts loop for one iteration. We invoke runLoop directly
    // and read back its state. To keep iterations independent, we reset the loop state file before each pass.
    const loopStatePath = path.join(packageRoot, 'repo', 'mvp-builder-loop-state.json');
    if (fs.existsSync(loopStatePath)) fs.unlinkSync(loopStatePath);
    process.argv = ['node', 'mvp-builder-loop.ts', `--package=${packageRoot}`, '--max-iterations=1', `--target=${target}`];
    const loopState = await runLoop().catch((error) => {
      console.error(`Loop iteration error: ${(error as Error).message}`);
      return { iterations: [], lastOutcomeScore: 0, status: 'aborted' as const };
    });
    const loopScore = loopState.lastOutcomeScore;

    let browserScore = 0;
    let browserCovered = 0;
    let browserTotal = 0;
    let browserAvailable = false;
    if (!skipBrowser) {
      process.argv = ['node', 'mvp-builder-loop-browser.ts', `--package=${packageRoot}`, `--target=${target}`];
      const browserOutcome = await runBrowserLoop().catch((error) => {
        console.error(`Browser loop error: ${(error as Error).message}`);
        return null;
      });
      if (browserOutcome) {
        browserScore = browserOutcome.outcomeScore;
        browserCovered = browserOutcome.coveredRequirements;
        browserTotal = browserOutcome.totalRequirements;
        browserAvailable = browserOutcome.playwrightAvailable && browserOutcome.startSucceeded;
      }
    }

    const combinedScore = combineScores(loopScore, browserScore, browserAvailable);
    const stalled = iteration > 1 && combinedScore === lastScore && combinedScore < target;
    const finishedAt = new Date().toISOString();

    let fixPromptPath = '';
    if (combinedScore < target) {
      const promptFile = path.join(packageRoot, 'evidence', 'runtime', `AUTO_REGRESSION_FIX_PROMPT_iteration-${String(iteration).padStart(2, '0')}.md`);
      fs.mkdirSync(path.dirname(promptFile), { recursive: true });
      fs.writeFileSync(
        promptFile,
        buildIterationFixPrompt({
          iteration,
          combinedScore,
          target,
          loopScore,
          browserScore,
          browserCovered,
          browserTotal,
          buildPassed: true,
          buildNotes: buildResult.notes,
          stalled
        }),
        'utf8'
      );
      fixPromptPath = path.relative(packageRoot, promptFile).replace(/\\/g, '/');
    }

    state.iterations.push({
      iteration,
      startedAt,
      finishedAt,
      buildPassed: true,
      buildExitCode: buildResult.exitCode,
      buildNotes: buildResult.notes,
      loopScore,
      loopStatus: loopState.status,
      browserScore,
      browserCovered,
      browserTotal,
      combinedScore,
      target,
      fixPromptPath
    });
    state.lastCombinedScore = combinedScore;

    console.log(
      `Iteration ${iteration}: combined=${combinedScore}/${target} (loop=${loopScore}, browser=${browserScore}, covered=${browserCovered}/${browserTotal}).`
    );

    if (combinedScore >= target) {
      state.status = 'converged';
      writeState(packageRoot, state);
      console.log(`Auto-regression converged on iteration ${iteration}.`);
      return state;
    }
    if (stalled) {
      state.status = 'stalled';
      writeState(packageRoot, state);
      console.log(`Auto-regression stalled. Fix prompt: ${fixPromptPath}`);
      return state;
    }
    lastScore = combinedScore;
    writeState(packageRoot, state);
    if (fixPromptPath) console.log(`Fix prompt: ${fixPromptPath}`);
  }

  state.status = 'max-iterations';
  writeState(packageRoot, state);
  console.log(`Auto-regression hit max iterations (${maxIterations}) without converging. Last score ${state.lastCombinedScore}/${target}.`);
  return state;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runAutoRegression()
    .then((state) => {
      process.exitCode = state.status === 'converged' ? 0 : 1;
    })
    .catch((error) => {
      console.error((error as Error).message);
      process.exit(1);
    });
}
