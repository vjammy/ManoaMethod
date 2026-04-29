#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileExists, getArg, readJsonFile, readState as readMvpBuilderState, readTextFile, resolvePackageRoot, writeJsonFile } from './mvp-builder-package-utils';
import { runLoop } from './mvp-builder-loop';
import { runBrowserLoop } from './mvp-builder-loop-browser';
import type { MvpBuilderState, PhaseAttempt } from '../lib/types';

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

function parsePhaseRequirementMap(packageRoot: string): Map<string, string> {
  // Returns Map<REQ-ID, phaseSlug>
  const map = new Map<string, string>();
  const phasePlanPath = path.join(packageRoot, 'PHASE_PLAN.md');
  if (!fileExists(phasePlanPath)) return map;
  const content = readTextFile(phasePlanPath);
  const phaseBlocks = Array.from(content.matchAll(/##\s+(\d+)\.\s+([^\n]+)\n([\s\S]*?)(?=\n##\s+\d+\.|$)/g));
  for (const match of phaseBlocks) {
    const phaseIndex = Number.parseInt(match[1], 10);
    const slug = `phase-${String(phaseIndex).padStart(2, '0')}`;
    const body = match[3];
    const reqLine = body.match(/Requirement IDs?:\s*([^\n]+)/i)?.[1] || '';
    const reqIds = reqLine
      .split(/[,\s]+/)
      .map((token) => token.trim())
      .filter((token) => /^REQ-\d+$/i.test(token))
      .map((token) => token.toUpperCase());
    for (const reqId of reqIds) {
      // Earliest phase wins so the rework rollback targets where the work first lives.
      if (!map.has(reqId)) map.set(reqId, slug);
    }
  }
  return map;
}

type PhaseFailure = {
  slug: string;
  reqFailures: Array<{ reqId: string; status: string; reason: string }>;
  scriptFailingFromHttpLoop: boolean;
};

function groupFailuresByPhase(args: {
  phaseReqMap: Map<string, string>;
  browserReqResults: Array<{ reqId: string; status: string; entityName: string; testResultsVerified: boolean; notes: string[] }>;
  httpLoopFailingPhases: string[];
}): PhaseFailure[] {
  const byPhase = new Map<string, PhaseFailure>();
  const ensure = (slug: string): PhaseFailure => {
    if (!byPhase.has(slug)) {
      byPhase.set(slug, { slug, reqFailures: [], scriptFailingFromHttpLoop: false });
    }
    return byPhase.get(slug)!;
  };
  for (const result of args.browserReqResults) {
    if (result.status === 'covered') continue;
    const slug = args.phaseReqMap.get(result.reqId);
    if (!slug) continue;
    const reason = result.status === 'partially-covered'
      ? `partially-covered: ${result.notes[0] || 'tokens render but TEST_RESULTS.md is not verified'}`
      : `uncovered: ${result.notes[0] || 'no tokens rendered'}`;
    ensure(slug).reqFailures.push({ reqId: result.reqId, status: result.status, reason });
  }
  for (const slug of args.httpLoopFailingPhases) {
    ensure(slug).scriptFailingFromHttpLoop = true;
  }
  // Sort by phase slug ascending so the earliest failing phase is first.
  return Array.from(byPhase.values()).sort((left, right) => left.slug.localeCompare(right.slug));
}

function writePhaseReworkArtifacts(args: {
  packageRoot: string;
  phaseFailure: PhaseFailure;
  iteration: number;
  combinedScore: number;
  target: number;
  attemptNumber: number;
  buildPassed: boolean;
}): { reworkPromptPath: string; testResultsAppendApplied: boolean } {
  const phaseDir = path.join(args.packageRoot, 'phases', args.phaseFailure.slug);
  if (!fs.existsSync(phaseDir)) fs.mkdirSync(phaseDir, { recursive: true });

  const reworkPromptName = `REWORK_PROMPT_auto-regression-iteration-${String(args.iteration).padStart(2, '0')}_attempt-${String(args.attemptNumber).padStart(2, '0')}.md`;
  const reworkPromptPath = path.join(phaseDir, reworkPromptName);
  const reworkLines: string[] = [];
  reworkLines.push(`# REWORK_PROMPT for ${args.phaseFailure.slug} — auto-regression iteration ${args.iteration}, attempt ${args.attemptNumber}`);
  reworkLines.push('');
  reworkLines.push('## What this file is for');
  reworkLines.push('Auto-regression detected one or more failures owned by this phase. This file packages the failure context as input for the next attempt at this phase. Treat it as the source of truth for what to fix before re-running auto-regression.');
  reworkLines.push('');
  reworkLines.push('## Auto-regression context');
  reworkLines.push(`- Combined score this iteration: ${args.combinedScore}/${args.target}`);
  reworkLines.push(`- Build passed this iteration: ${args.buildPassed ? 'yes' : 'no'}`);
  reworkLines.push(`- HTTP loop reported this phase as failing: ${args.phaseFailure.scriptFailingFromHttpLoop ? 'yes' : 'no'}`);
  reworkLines.push('');
  reworkLines.push('## Failing REQs owned by this phase');
  if (args.phaseFailure.reqFailures.length) {
    for (const failure of args.phaseFailure.reqFailures) {
      reworkLines.push(`- ${failure.reqId} (${failure.status}): ${failure.reason}`);
    }
  } else {
    reworkLines.push('- No REQ-level failures attributed. The HTTP loop flagged this phase from TEST_SCRIPT.md command failures.');
  }
  reworkLines.push('');
  reworkLines.push('## What the next attempt must do');
  reworkLines.push('1. Open this phase folder and read PHASE_BRIEF.md, TEST_SCRIPT.md, and TEST_RESULTS.md.');
  reworkLines.push('2. For each failing REQ above, find its entity in SAMPLE_DATA.md and confirm the happy-path tokens actually render and persist in the running app.');
  reworkLines.push('3. Run the phase TEST_SCRIPT.md procedures and record real evidence under "Scenario evidence: REQ-N" inside TEST_RESULTS.md, with `## Final result: pass` once the work is done.');
  reworkLines.push('4. Re-run `npm run auto-regression` from the workspace root.');
  reworkLines.push('');
  reworkLines.push('## Rules');
  reworkLines.push('- Do not relax SAMPLE_DATA.md tokens or TEST_SCRIPT.md scenarios to make the loop pass.');
  reworkLines.push('- TEST_RESULTS.md must include real recorded evidence per REQ-ID, not pending placeholders.');
  reworkLines.push('- Keep prior REWORK_PROMPT files in this folder. Each attempt produces a new one.');
  fs.writeFileSync(reworkPromptPath, `${reworkLines.join('\n')}\n`, 'utf8');

  // Append a structured failure section to TEST_RESULTS.md so validators and humans see it.
  let testResultsAppendApplied = false;
  const testResultsPath = path.join(phaseDir, 'TEST_RESULTS.md');
  if (fs.existsSync(testResultsPath)) {
    const existing = fs.readFileSync(testResultsPath, 'utf8');
    const stamp = new Date().toISOString();
    const appendLines: string[] = [];
    appendLines.push('');
    appendLines.push(`## Auto-regression failures (iteration ${args.iteration}, attempt ${args.attemptNumber}, ${stamp})`);
    appendLines.push(`- Combined score: ${args.combinedScore}/${args.target}`);
    if (args.phaseFailure.reqFailures.length) {
      for (const failure of args.phaseFailure.reqFailures) {
        appendLines.push(`- ${failure.reqId} (${failure.status}): ${failure.reason}`);
      }
    } else {
      appendLines.push('- HTTP loop TEST_SCRIPT.md commands failed for this phase.');
    }
    appendLines.push(`- See: ${path.relative(args.packageRoot, reworkPromptPath).replace(/\\/g, '/')}`);
    fs.writeFileSync(testResultsPath, `${existing.trimEnd()}\n${appendLines.join('\n')}\n`, 'utf8');
    testResultsAppendApplied = true;
  }

  return {
    reworkPromptPath: path.relative(args.packageRoot, reworkPromptPath).replace(/\\/g, '/'),
    testResultsAppendApplied
  };
}

function rollStateToEarliestFailingPhase(args: {
  packageRoot: string;
  failingPhases: PhaseFailure[];
  iteration: number;
}): { rolledBack: boolean; targetSlug: string | null; previousPhase: number } {
  if (!args.failingPhases.length) return { rolledBack: false, targetSlug: null, previousPhase: 0 };
  const earliest = args.failingPhases[0]; // already sorted ascending by slug
  const slugMatch = earliest.slug.match(/^phase-(\d+)$/);
  if (!slugMatch) return { rolledBack: false, targetSlug: null, previousPhase: 0 };
  const targetIndex = Number.parseInt(slugMatch[1], 10);
  let state: MvpBuilderState;
  try {
    state = readMvpBuilderState(args.packageRoot);
  } catch {
    return { rolledBack: false, targetSlug: earliest.slug, previousPhase: 0 };
  }
  const previousPhase = state.currentPhase;
  const phaseRecord = state.phaseEvidence[earliest.slug] || {
    testsRun: [],
    changedFiles: [],
    verificationReportPath: '',
    exitGateReviewed: false,
    approvedToProceed: false,
    knownIssues: [],
    reviewerRecommendation: 'pending',
    evidenceFiles: [],
    attempts: []
  };
  const previousAttempts = phaseRecord.attempts || [];
  const lastAttemptNumber = previousAttempts.reduce((max, attempt) => Math.max(max, attempt.attempt), 0);
  const failedCriteria = earliest.reqFailures
    .map((failure) => `${failure.reqId}: ${failure.reason}`)
    .concat(earliest.scriptFailingFromHttpLoop ? ['HTTP loop reported TEST_SCRIPT.md failures for this phase.'] : []);
  const newAttempt: PhaseAttempt = {
    attempt: lastAttemptNumber + 1,
    startedAt: new Date().toISOString(),
    status: 'fail',
    failedCriteria,
    reworkPromptPath: ''
  };
  const updatedAttempts = previousAttempts.map((attempt) =>
    attempt.attempt === lastAttemptNumber && !attempt.resolvedAt
      ? { ...attempt, status: 'fail' as const, resolvedAt: new Date().toISOString() }
      : attempt
  );
  const blockedSlugs = Array.from(new Set(state.blockedPhases.concat(args.failingPhases.map((failure) => failure.slug))));
  const phaseEvidence = { ...state.phaseEvidence };
  phaseEvidence[earliest.slug] = {
    ...phaseRecord,
    approvedToProceed: false,
    exitGateReviewed: false,
    attempts: updatedAttempts.concat(newAttempt)
  };
  const nextState: MvpBuilderState = {
    ...state,
    currentPhase: targetIndex,
    lifecycleStatus: 'InRework',
    blockedPhases: blockedSlugs,
    phaseEvidence
  };
  writeJsonFile(path.join(args.packageRoot, 'repo', 'mvp-builder-state.json'), nextState);
  // Mirror minimal fields onto manifest.json for parity with the existing rework script.
  try {
    const manifestPath = path.join(args.packageRoot, 'repo', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = readJsonFile<Record<string, unknown>>(manifestPath);
      writeJsonFile(manifestPath, {
        ...manifest,
        lifecycleStatus: 'InRework',
        currentPhase: targetIndex,
        blockedPhases: blockedSlugs
      });
    }
  } catch {
    // ignore manifest update failures
  }
  return { rolledBack: true, targetSlug: earliest.slug, previousPhase };
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
  const phaseReqMap = parsePhaseRequirementMap(packageRoot);
  let lastFailingPhases: PhaseFailure[] = [];

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
    let browserReqResults: Array<{ reqId: string; status: string; entityName: string; testResultsVerified: boolean; notes: string[] }> = [];
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
        browserReqResults = browserOutcome.reqResults.map((result) => ({
          reqId: result.reqId,
          status: result.status,
          entityName: result.entityName,
          testResultsVerified: result.testResultsVerified,
          notes: result.notes
        }));
      }
    }

    const combinedScore = combineScores(loopScore, browserScore, browserAvailable);
    const stalled = iteration > 1 && combinedScore === lastScore && combinedScore < target;
    const finishedAt = new Date().toISOString();

    // Group failures by owning phase and write per-phase rework artifacts inside each phase folder.
    const httpLoopFailingPhases = (loopState.iterations[0]?.failingPhases as string[] | undefined) || [];
    const failingPhases = combinedScore < target
      ? groupFailuresByPhase({ phaseReqMap, browserReqResults, httpLoopFailingPhases })
      : [];
    if (failingPhases.length) {
      let mvpState: MvpBuilderState | null = null;
      try {
        mvpState = readMvpBuilderState(packageRoot);
      } catch {
        mvpState = null;
      }
      for (const phaseFailure of failingPhases) {
        const priorAttempts = mvpState?.phaseEvidence?.[phaseFailure.slug]?.attempts || [];
        const lastAttemptNumber = priorAttempts.reduce((max, attempt) => Math.max(max, attempt.attempt), 0);
        writePhaseReworkArtifacts({
          packageRoot,
          phaseFailure,
          iteration,
          combinedScore,
          target,
          attemptNumber: lastAttemptNumber + iteration,
          buildPassed: true
        });
      }
      lastFailingPhases = failingPhases;
    } else {
      lastFailingPhases = [];
    }

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
      const rollback = rollStateToEarliestFailingPhase({ packageRoot, failingPhases: lastFailingPhases, iteration });
      console.log(`Auto-regression stalled. Fix prompt: ${fixPromptPath}`);
      if (rollback.rolledBack) {
        console.log(`State rolled back: currentPhase ${rollback.previousPhase} → ${rollback.targetSlug}, lifecycleStatus=InRework.`);
      }
      return state;
    }
    lastScore = combinedScore;
    writeState(packageRoot, state);
    if (fixPromptPath) console.log(`Fix prompt: ${fixPromptPath}`);
  }

  state.status = 'max-iterations';
  writeState(packageRoot, state);
  const rollback = rollStateToEarliestFailingPhase({ packageRoot, failingPhases: lastFailingPhases, iteration: maxIterations });
  console.log(`Auto-regression hit max iterations (${maxIterations}) without converging. Last score ${state.lastCombinedScore}/${target}.`);
  if (rollback.rolledBack) {
    console.log(`State rolled back: currentPhase ${rollback.previousPhase} → ${rollback.targetSlug}, lifecycleStatus=InRework.`);
  }
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
