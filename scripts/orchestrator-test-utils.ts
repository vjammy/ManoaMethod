import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { baseProjectInput } from '../lib/templates';
import type { ProjectInput } from '../lib/types';
import { createArtifactPackage } from './mvp-builder-create-project';
import { buildRepoState } from '../lib/orchestrator/scanner';
import { deriveObjectiveCriteria } from '../lib/orchestrator/criteria';
import { runProjectCommands } from '../lib/orchestrator/commands';
import { runGateChecks } from '../lib/orchestrator/gates';
import {
  RELEASE_APPROVAL_BLOCKER_LABELS,
  buildScorecard,
  computeReleaseBlocker,
  computeVerdict,
  qualifiedRecommendation
} from '../lib/orchestrator/score';
import { buildRecoveryPlan } from '../lib/orchestrator/recovery';
import { orchestrate } from '../lib/orchestrator/runner';
import { ensureDir } from '../lib/orchestrator/utils';
import type { CommandResult, GateResult } from '../lib/orchestrator/types';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function buildAnsweredInput(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    ...baseProjectInput(),
    ...overrides,
    questionnaireAnswers: {
      'north-star': 'Turn repository intent into an evidence-backed build loop.',
      'primary-workflow': 'Read docs, plan the next phase, run commands, verify evidence, score, and hand off.',
      'scope-cut': 'Keep the first release local-first and markdown-first. Defer hosted execution.',
      acceptance: 'A reviewer can inspect markdown reports and command outputs and understand why the score was given.',
      'operating-risks': 'Fake evidence, bypassed gates, generic reports, and missing local validation are unacceptable.',
      ...(overrides.questionnaireAnswers || {})
    }
  };
}

function makePackage() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-builder-orchestrator-'));
  return createArtifactPackage({
    input: buildAnsweredInput({
      productName: 'Orchestrator Test Package',
      productIdea: 'A package used to test the orchestrator.',
      targetAudience: 'Reviewers and AI-assisted builders.',
      problemStatement: 'The builder needs objective evidence and safe recovery guidance.',
      constraints: 'Local-first, markdown-first, no hosted backend.',
      mustHaveFeatures: 'Repo scan, prompt packets, commands, gates, scoring, recovery.',
      dataAndIntegrations: 'Markdown files, command outputs, package metadata.',
      risks: 'Fake evidence, skipped commands, contradictory reports.',
      successMetrics: 'A reviewer can see why a score was earned and what failed next.',
      nonGoals: 'No auth, no database, no hosted SaaS.'
    }),
    outDir,
    zip: false
  });
}

function setReportEvidence(reportPath: string, evidenceFile: string, extraBody = '') {
  let content = fs.readFileSync(reportPath, 'utf8');
  content = content.replace(/## result:\s*pending/i, '## result: pass');
  content = content.replace(/## recommendation:\s*pending/i, '## recommendation: proceed');
  content = content.replace(/- pending/, `- ${evidenceFile}`);
  if (extraBody) {
    content = content.replace(/## summary/i, `## summary\n- ${extraBody}\n\n## warnings`);
  }
  fs.writeFileSync(reportPath, content, 'utf8');
}

function setVerificationDecision(reportPath: string, result: 'pass' | 'fail' | 'pending', recommendation: 'proceed' | 'revise' | 'blocked' | 'pending', evidenceFile = 'repo/manifest.json', extraBody = '') {
  let content = fs.readFileSync(reportPath, 'utf8');
  content = content.replace(/## result:\s*(pass|fail|pending)/i, `## result: ${result}`);
  content = content.replace(/## recommendation:\s*(proceed|revise|blocked|pending)/i, `## recommendation: ${recommendation}`);
  content = content.replace(/- pending/, `- ${evidenceFile}`);
  if (extraBody) {
    content = content.replace(/## summary[\s\S]*?## warnings/i, `## summary\n- ${extraBody}\n\n## warnings`);
  }
  fs.writeFileSync(reportPath, content, 'utf8');
}

function buildFakeCommand(name: string, status: CommandResult['status'], required = true): CommandResult {
  return {
    name,
    command: `npm run ${name}`,
    required,
    detected: status !== 'missing',
    status,
    exitCode: status === 'passed' ? 0 : status === 'failed' ? 1 : null,
    stdout: '',
    stderr: '',
    outputPath: `fake/${name}.md`
  };
}

function findGate(gates: GateResult[], name: GateResult['gate']) {
  const gate = gates.find((item) => item.gate === name);
  assert(gate, `Missing gate ${name}`);
  return gate!;
}

export async function runOrchestratorRegressionChecks() {
  const pkg = await makePackage();
  const reportsRoot = path.join(pkg.rootDir, 'orchestrator-test-reports');
  const commandsRoot = path.join(pkg.rootDir, 'orchestrator-test-commands');
  ensureDir(reportsRoot);
  ensureDir(commandsRoot);

  const repoState = buildRepoState(process.cwd(), pkg.rootDir);
  assert(repoState.isGeneratedPackage, 'Repo scanner should detect a generated MVP Builder package.');
  assert(repoState.phases.length > 0, 'Repo scanner should discover phase folders.');
  assert(repoState.docs.some((doc) => doc.key === 'readme' && doc.exists), 'Repo scanner should read README.md.');
  assert(repoState.mode === 'package', 'Explicit package root should switch the scanner into package mode.');

  const rootRepoState = buildRepoState(process.cwd());
  assert(
    rootRepoState.mode === 'repo' || rootRepoState.mode === 'package',
    'Source repo should scan successfully in either repo mode or package mode.'
  );
  assert(
    rootRepoState.mode === 'repo'
      ? rootRepoState.docs.some((doc) => doc.path === 'docs/ORCHESTRATOR.md' && doc.exists)
      : rootRepoState.docs.some((doc) => doc.key === 'readme' && doc.exists),
    'Root repo scan should expose core orientation docs for the active mode.'
  );

  const criteria = deriveObjectiveCriteria(repoState, reportsRoot);
  assert(criteria.length >= 3, 'Objective criteria extraction should produce measurable criteria.');
  assert(fs.existsSync(path.join(reportsRoot, 'OBJECTIVE_CRITERIA.md')), 'Objective criteria report should be written.');
  assert(criteria.every((criterion) => !/^Read this file first/i.test(criterion.description)), 'Objective criteria should reject generic starter bullets.');

  const commandResults = runProjectCommands(rootRepoState, commandsRoot, true);
  const requiredCommands = commandResults.filter((command) => command.required);
  assert(requiredCommands.every((command) => command.detected), 'Command runner should detect required npm scripts in this repo.');
  assert(requiredCommands.every((command) => command.status === 'skipped'), 'Dry-run commands should be marked skipped.');
  assert(commandResults.every((command) => /^[a-z0-9:-]+$/i.test(command.name)), 'Command runner should only execute safe script names.');

  const entryOnlyGates = runGateChecks(repoState, commandResults);
  assert(entryOnlyGates.some((gate) => gate.gate === 'entry gate'), 'Gate runner should include the entry gate.');
  assert(
    !findGate(entryOnlyGates, 'entry gate').failedCriteria.includes('Phase 1 does not require prior phase handoff'),
    'Phase 1 should keep the prior-phase handoff exception.'
  );

  const reportPath = path.join(pkg.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  setReportEvidence(reportPath, 'repo/manifest.json', 'blocked because a required dependency failed');
  const contradictionGates = runGateChecks(buildRepoState(process.cwd(), pkg.rootDir), commandResults);
  const evidenceGate = findGate(contradictionGates, 'evidence gate');
  assert(
    evidenceGate.failedCriteria.some((item) => /Evidence quality/.test(item)),
    'Evidence gate should reject PASS headers with blocked/failing body text.'
  );

  const contradictionScore = buildScorecard(buildRepoState(process.cwd(), pkg.rootDir), criteria, commandResults, contradictionGates);
  assert(contradictionScore.cappedTotal <= 59, 'PASS header plus blocked body should trigger the 59-point hard cap.');
  assert(contradictionScore.verdict === 'FAIL', 'Contradictory verification evidence should produce FAIL verdict.');

  setReportEvidence(reportPath, 'repo/manifest.json', 'looks good and ready to proceed');
  const fakeEvidenceGates = runGateChecks(buildRepoState(process.cwd(), pkg.rootDir), commandResults);
  const fakeEvidenceScore = buildScorecard(buildRepoState(process.cwd(), pkg.rootDir), criteria, commandResults, fakeEvidenceGates);
  assert(fakeEvidenceScore.cappedTotal <= 49, 'Generic fake evidence should trigger the 49-point hard cap.');

  const recoveryPlan = buildRecoveryPlan(buildRepoState(process.cwd(), pkg.rootDir), fakeEvidenceGates, reportsRoot);
  assert(recoveryPlan.failedGate !== 'none', 'Recovery plan should identify the failed gate.');
  assert(recoveryPlan.nextAgentPrompt.includes('failed gate'), 'Recovery plan should write a focused next-agent prompt.');
  assert(recoveryPlan.evidenceInspected.length > 0, 'Recovery plan should record evidence inspected.');
  assert(recoveryPlan.commandsToRerun.includes('npm run build'), 'Recovery plan should include commands to rerun.');
  assert(recoveryPlan.expectedProof.length > 0, 'Recovery plan should define expected proof of success.');
  assert(fs.existsSync(path.join(reportsRoot, 'RECOVERY_PLAN.md')), 'Recovery plan report should be written.');
  assert(fs.existsSync(path.join(reportsRoot, 'NEXT_AGENT_PROMPT.md')), 'Next agent prompt should be written.');

  // Missing handoff should fail the exit gate.
  fs.unlinkSync(path.join(pkg.rootDir, 'phases', 'phase-01', 'HANDOFF_SUMMARY.md'));
  const missingHandoffGates = runGateChecks(buildRepoState(process.cwd(), pkg.rootDir), commandResults);
  assert(findGate(missingHandoffGates, 'exit gate').status === 'fail', 'Missing handoff should fail the exit gate.');

  // Empty template shell should fail entry gate.
  fs.writeFileSync(path.join(pkg.rootDir, 'README.md'), '# README\n\n- pending\n', 'utf8');
  const emptyShellGates = runGateChecks(buildRepoState(process.cwd(), pkg.rootDir), commandResults);
  assert(findGate(emptyShellGates, 'entry gate').status === 'fail', 'Empty template shells should fail the entry gate.');

  // Rebuild a fresh package for remaining tests.
  const pkg2 = await makePackage();
  const repoState2 = buildRepoState(process.cwd(), pkg2.rootDir);
  const reportPath2 = path.join(pkg2.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  const regressionFiles = fs.readdirSync(path.join(pkg2.rootDir, 'regression-suite'));
  assert(regressionFiles.length > 0, 'Fresh package should include regression suite files.');

  // Missing regression suite should fail package-mode evidence gate.
  fs.rmSync(path.join(pkg2.rootDir, 'regression-suite'), { recursive: true, force: true });
  const missingRegressionGates = runGateChecks(buildRepoState(process.cwd(), pkg2.rootDir), commandResults);
  assert(findGate(missingRegressionGates, 'evidence gate').status === 'fail', 'Missing regression suite should fail in package mode.');

  // Phase 2 missing prior handoff should fail exit gate and trigger the 69 cap.
  const pkg3 = await makePackage();
  const statePath3 = path.join(pkg3.rootDir, 'repo', 'mvp-builder-state.json');
  const state3 = JSON.parse(fs.readFileSync(statePath3, 'utf8'));
  state3.currentPhase = 2;
  state3.completedPhases = [];
  state3.phaseEvidence['phase-01'].approvedToProceed = false;
  fs.writeFileSync(statePath3, JSON.stringify(state3, null, 2), 'utf8');
  const bypassRepoState = buildRepoState(process.cwd(), pkg3.rootDir);
  const bypassGates = runGateChecks(bypassRepoState, commandResults);
  const bypassScore = buildScorecard(bypassRepoState, deriveObjectiveCriteria(bypassRepoState, reportsRoot), commandResults, bypassGates);
  assert(findGate(bypassGates, 'exit gate').status === 'fail', 'Phase 2 without prior approval should fail the exit gate.');
  assert(bypassScore.cappedTotal <= 69, 'Bypassed phase gates should trigger the 69-point hard cap.');

  // Fake command matrix: tests not run -> max 79.
  const commandsNoTests = [
    buildFakeCommand('typecheck', 'passed'),
    buildFakeCommand('smoke', 'skipped'),
    buildFakeCommand('build', 'passed'),
    buildFakeCommand('test:quality-regression', 'skipped')
  ];
  const noTestsScore = buildScorecard(rootRepoState, deriveObjectiveCriteria(rootRepoState, reportsRoot), commandsNoTests, runGateChecks(rootRepoState, commandsNoTests));
  assert(noTestsScore.cappedTotal <= 79, 'Skipped tests should trigger the 79-point hard cap.');

  // Build fails -> max 69 and implementation gate fail.
  const commandsBuildFail = [
    buildFakeCommand('typecheck', 'passed'),
    buildFakeCommand('smoke', 'passed'),
    buildFakeCommand('build', 'failed'),
    buildFakeCommand('test:quality-regression', 'passed')
  ];
  const buildFailGates = runGateChecks(rootRepoState, commandsBuildFail);
  const buildFailScore = buildScorecard(rootRepoState, deriveObjectiveCriteria(rootRepoState, reportsRoot), commandsBuildFail, buildFailGates);
  assert(findGate(buildFailGates, 'implementation gate').status === 'fail', 'Failed build output should fail the implementation gate.');
  assert(buildFailScore.cappedTotal <= 69, 'Failed build should trigger the 69-point hard cap.');

  // Repo cannot build at all -> max 60.
  const commandsNoBuild = [
    buildFakeCommand('typecheck', 'passed'),
    buildFakeCommand('smoke', 'passed'),
    buildFakeCommand('build', 'missing'),
    buildFakeCommand('test:quality-regression', 'passed')
  ];
  const noBuildScore = buildScorecard(rootRepoState, deriveObjectiveCriteria(rootRepoState, reportsRoot), commandsNoBuild, runGateChecks(rootRepoState, commandsNoBuild));
  assert(noBuildScore.cappedTotal <= 60, 'Missing build command should trigger the 60-point hard cap.');

  // Generic artifacts -> max 74.
  const genericRepoState = {
    ...rootRepoState,
    docs: rootRepoState.docs.map((doc) => ({ ...doc, exists: true, content: 'Generic template text for any project.' }))
  };
  const genericGates = runGateChecks(genericRepoState, commandResults);
  const genericScore = buildScorecard(genericRepoState, deriveObjectiveCriteria(genericRepoState, reportsRoot), commandResults, genericGates);
  assert(genericScore.cappedTotal <= 74, 'Mostly generic artifacts should trigger the 74-point hard cap.');

  // Score can remain below 90 even when gates pass.
  const rootCriteria = deriveObjectiveCriteria(rootRepoState, reportsRoot);
  const rootGates = runGateChecks(rootRepoState, commandResults);
  const rootScore = buildScorecard(rootRepoState, rootCriteria, commandResults, rootGates);
  if (rootRepoState.mode === 'repo') {
    // The MVP Builder source repo is not a finalized release: there is no
    // tracked `repo/manifest.json` with `lifecycleStatus=ApprovedForBuild` on
    // a fresh checkout, so the release gate fails for the canonical
    // approval-only reason ("Lifecycle state is synchronized"). Every other
    // gate must still pass, otherwise the baseline is unhealthy. The
    // distinction between BUILD_READY and RELEASE_READY is preserved by the
    // release-blocker semantics in lib/orchestrator/score.ts.
    const failingGates = rootGates.filter((gate) => gate.status === 'fail');
    const releaseGate = rootGates.find((gate) => gate.gate === 'release gate');
    assert(
      failingGates.length === 0 || (failingGates.length === 1 && failingGates[0].gate === 'release gate'),
      `Repo dry-run baseline must not fail any gate other than release. Failing: ${failingGates.map((gate) => gate.gate).join(', ')}`
    );
    if (releaseGate?.status === 'fail') {
      const approvalOnlySet = new Set(RELEASE_APPROVAL_BLOCKER_LABELS as readonly string[]);
      assert(
        releaseGate.failedCriteria.length > 0 &&
          releaseGate.failedCriteria.every((label) => approvalOnlySet.has(label)),
        `Release gate may only fail for canonical approval-only criteria in repo mode. Failed: ${releaseGate.failedCriteria.join(', ')}`
      );
      assert(
        rootScore.releaseBlocker.blocked,
        'Release gate failing for approval-only reasons must populate scorecard.releaseBlocker.'
      );
    }
    assert(rootScore.cappedTotal < 90, 'A repo can pass gates and still score below 90 if quality is not strong enough yet.');
    // verdict is FAIL when score is sub-80 (the dry-run "tests were not run"
    // cap pulls the score below 80 even when build evidence is present), or
    // PASS WITH RELEASE BLOCKER when score reaches 80+. NEEDS FIXES only
    // applies when no gate is failing.
    assert(
      rootScore.verdict === 'FAIL' ||
        rootScore.verdict === 'NEEDS FIXES' ||
        rootScore.verdict === 'PASS WITH RELEASE BLOCKER' ||
        rootScore.verdict === 'CONDITIONAL PASS',
      `Repo baseline verdict should be one of FAIL / NEEDS FIXES / PASS WITH RELEASE BLOCKER / CONDITIONAL PASS. Got: ${rootScore.verdict}`
    );
    // Recommendation must agree with verdict (no PASS while gates fail).
    const rec = qualifiedRecommendation(rootScore, rootGates);
    assert(rec !== 'PASS', `Repo baseline must not surface plain PASS while a gate fails. Got recommendation=${rec}`);
  } else {
    assert(rootGates.every((gate) => gate.status === 'pass'), 'Dry-run gate checks should stay healthy in the baseline package scan.');
    assert(rootScore.cappedTotal >= 79, 'A completed package-mode root should stay at or above the dry-run cap floor.');
    assert(
      rootScore.capReason === 'If tests were not run' || rootScore.capReason === null,
      'A healthy package-mode dry run should only be capped for skipped test execution.'
    );
    assert(rootScore.verdict !== 'FAIL', 'A healthy package-mode root should not fail the dry-run baseline.');
  }

  // Package-mode criteria should remain project-specific.
  const pkg4 = await makePackage();
  const packageCriteria = deriveObjectiveCriteria(buildRepoState(process.cwd(), pkg4.rootDir), reportsRoot);
  assert(
    packageCriteria.some((criterion) => /orchestrator|repo scan|recovery/i.test(criterion.description)),
    'Package-mode objective criteria should remain project-specific.'
  );

  const orchestration = orchestrate({
    repoRoot: process.cwd(),
    packageRoot: pkg4.rootDir,
    targetScore: 95,
    maxRounds: 2,
    dryRun: true
  });
  assert(
    orchestration.stopReason === 'no-meaningful-change-possible' || orchestration.stopReason === 'same-critical-failure-twice',
    `Dry-run orchestration should stop safely when no automated improvement path exists. Got: ${orchestration.stopReason}`
  );
  assert(fs.existsSync(path.join(process.cwd(), 'orchestrator', 'reports', 'FINAL_ORCHESTRATOR_REPORT.md')), 'Final orchestrator report should be created.');
  assert(fs.existsSync(path.join(process.cwd(), 'orchestrator', 'reports', 'OBJECTIVE_SCORECARD.md')), 'Objective scorecard should be created.');
  assert(fs.existsSync(path.join(process.cwd(), 'orchestrator', 'reports', 'GATE_RESULTS.md')), 'Gate results report should be created.');

  await runReleaseBlockerVerdictRegressionChecks();
}

function buildSyntheticGate(
  name: GateResult['gate'],
  status: 'pass' | 'fail',
  failedCriteria: string[] = []
): GateResult {
  return {
    gate: name,
    status,
    summary: status === 'pass' ? `${name} pass` : `${name} fail`,
    checks: failedCriteria.map((label) => ({ label, passed: false, detail: 'synthetic check' })),
    failedCriteria
  };
}

function buildSyntheticScorecard(score: number, gates: GateResult[]) {
  const releaseBlocker = computeReleaseBlocker(gates);
  const verdict = computeVerdict(score, gates, releaseBlocker);
  return {
    total: score,
    cappedTotal: score,
    verdict,
    capReason: null,
    categories: [],
    hardCaps: [],
    summary: '',
    releaseBlocker
  };
}

export async function runReleaseBlockerVerdictRegressionChecks() {
  // Scenario A: 7 gates pass, release gate fails for canonical approval-only
  // reasons, score is 96 (mirrors the actual swarm output before the fix).
  // The verdict must be 'PASS WITH RELEASE BLOCKER' (not plain FAIL or PASS),
  // and the recommendation must be 'BUILD PASS / RELEASE NOT APPROVED'.
  const releaseBlockerOnlyGates: GateResult[] = [
    buildSyntheticGate('entry gate', 'pass'),
    buildSyntheticGate('implementation gate', 'pass'),
    buildSyntheticGate('test gate', 'pass'),
    buildSyntheticGate('regression gate', 'pass'),
    buildSyntheticGate('evidence gate', 'pass'),
    buildSyntheticGate('security gate', 'pass'),
    buildSyntheticGate('release gate', 'fail', [...RELEASE_APPROVAL_BLOCKER_LABELS]),
    buildSyntheticGate('exit gate', 'pass')
  ];
  const releaseOnlyScorecard = buildSyntheticScorecard(96, releaseBlockerOnlyGates);
  assert(
    releaseOnlyScorecard.verdict === 'PASS WITH RELEASE BLOCKER',
    `Release-only approval failure with score 96 must produce verdict 'PASS WITH RELEASE BLOCKER'. Got: ${releaseOnlyScorecard.verdict}`
  );
  assert(
    releaseOnlyScorecard.releaseBlocker.blocked,
    'Release-only approval failure should set releaseBlocker.blocked=true.'
  );
  assert(
    releaseOnlyScorecard.releaseBlocker.failedCriteria.length === RELEASE_APPROVAL_BLOCKER_LABELS.length,
    'Release blocker should record the canonical approval-only criteria.'
  );

  const releaseOnlyRecommendation = qualifiedRecommendation(releaseOnlyScorecard, releaseBlockerOnlyGates);
  assert(
    releaseOnlyRecommendation === 'BUILD PASS / RELEASE NOT APPROVED',
    `Release-only approval failure should yield recommendation 'BUILD PASS / RELEASE NOT APPROVED'. Got: ${releaseOnlyRecommendation}`
  );
  assert(
    releaseOnlyRecommendation !== 'PASS',
    'Recommendation must NOT be a plain PASS while the release gate is failing.'
  );

  // Scenario B: release gate fails for a NON-approval reason (e.g., release
  // documentation missing). This must remain a real FAIL — not soft-blocked.
  const releaseDocsMissingGates: GateResult[] = [
    buildSyntheticGate('entry gate', 'pass'),
    buildSyntheticGate('implementation gate', 'pass'),
    buildSyntheticGate('test gate', 'pass'),
    buildSyntheticGate('regression gate', 'pass'),
    buildSyntheticGate('evidence gate', 'pass'),
    buildSyntheticGate('security gate', 'pass'),
    buildSyntheticGate('release gate', 'fail', ['Release documentation exists']),
    buildSyntheticGate('exit gate', 'pass')
  ];
  const releaseDocsMissingScorecard = buildSyntheticScorecard(96, releaseDocsMissingGates);
  assert(
    releaseDocsMissingScorecard.verdict === 'FAIL',
    `Release gate failing for non-approval reasons must keep verdict=FAIL. Got: ${releaseDocsMissingScorecard.verdict}`
  );
  assert(
    !releaseDocsMissingScorecard.releaseBlocker.blocked,
    'Release blocker should only trigger for canonical approval-only failures.'
  );
  assert(
    qualifiedRecommendation(releaseDocsMissingScorecard, releaseDocsMissingGates) === 'FAIL',
    'Release-docs missing must yield recommendation FAIL.'
  );

  // Scenario C: multiple gates failing must always produce FAIL even if release
  // gate would otherwise be approval-only.
  const multiFailGates: GateResult[] = [
    buildSyntheticGate('entry gate', 'pass'),
    buildSyntheticGate('implementation gate', 'fail', ['Required commands were detected']),
    buildSyntheticGate('test gate', 'pass'),
    buildSyntheticGate('regression gate', 'pass'),
    buildSyntheticGate('evidence gate', 'pass'),
    buildSyntheticGate('security gate', 'pass'),
    buildSyntheticGate('release gate', 'fail', [...RELEASE_APPROVAL_BLOCKER_LABELS]),
    buildSyntheticGate('exit gate', 'pass')
  ];
  const multiFailScorecard = buildSyntheticScorecard(96, multiFailGates);
  assert(
    multiFailScorecard.verdict === 'FAIL',
    `More than one failing gate must keep verdict=FAIL. Got: ${multiFailScorecard.verdict}`
  );
  assert(
    !multiFailScorecard.releaseBlocker.blocked,
    'Release blocker semantics must not apply when other gates also fail.'
  );

  // Scenario D: PASS verdict with all gates passing must produce PASS recommendation.
  const allPassingGates = releaseBlockerOnlyGates.map((gate) =>
    gate.gate === 'release gate' ? buildSyntheticGate('release gate', 'pass') : gate
  );
  const allPassingScorecard = buildSyntheticScorecard(96, allPassingGates);
  assert(
    allPassingScorecard.verdict === 'PASS',
    `All gates passing at score 96 should yield PASS verdict. Got: ${allPassingScorecard.verdict}`
  );
  assert(
    qualifiedRecommendation(allPassingScorecard, allPassingGates) === 'PASS',
    'PASS verdict with all gates passing must produce PASS recommendation.'
  );

  // Cross-cutting invariants: verdict must never silently disagree with the
  // recommendation. These are the exact contradictions seen in the original
  // swarm output (verdict=FAIL alongside recommendation=PASS).
  const scenarios = [
    { name: 'release-only', scorecard: releaseOnlyScorecard, gates: releaseBlockerOnlyGates },
    { name: 'release-docs-missing', scorecard: releaseDocsMissingScorecard, gates: releaseDocsMissingGates },
    { name: 'multi-fail', scorecard: multiFailScorecard, gates: multiFailGates },
    { name: 'all-passing', scorecard: allPassingScorecard, gates: allPassingGates }
  ];
  for (const scenario of scenarios) {
    const recommendation = qualifiedRecommendation(scenario.scorecard, scenario.gates);
    if (scenario.scorecard.verdict === 'FAIL') {
      assert(
        recommendation !== 'PASS' && recommendation !== 'BUILD PASS / RELEASE NOT APPROVED',
        `[${scenario.name}] verdict=FAIL must never yield a PASS-flavored recommendation. Got recommendation=${recommendation}.`
      );
    }
    if (recommendation === 'PASS') {
      assert(
        scenario.scorecard.verdict === 'PASS',
        `[${scenario.name}] recommendation=PASS requires verdict=PASS. Got verdict=${scenario.scorecard.verdict}.`
      );
    }
    if (scenario.scorecard.verdict === 'PASS WITH RELEASE BLOCKER') {
      assert(
        recommendation === 'BUILD PASS / RELEASE NOT APPROVED',
        `[${scenario.name}] verdict='PASS WITH RELEASE BLOCKER' must yield 'BUILD PASS / RELEASE NOT APPROVED'. Got recommendation=${recommendation}.`
      );
    }
  }

  // Aggregate-swarm safety: 20 apps where every app fails release gate for the
  // same canonical approval-only reason must NOT emit a plain PASS aggregate.
  const aggregatePerApp = Array.from({ length: 20 }, () => ({
    verdict: releaseOnlyScorecard.verdict,
    recommendation: releaseOnlyRecommendation
  }));
  assert(
    aggregatePerApp.every((entry) => entry.recommendation === 'BUILD PASS / RELEASE NOT APPROVED'),
    'Every app failing release gate for approval reasons must surface a release-blocker recommendation, never a plain PASS.'
  );
  assert(
    aggregatePerApp.every((entry) => entry.verdict === 'PASS WITH RELEASE BLOCKER'),
    'Every app with release-only approval failure must surface verdict=PASS WITH RELEASE BLOCKER.'
  );
}
