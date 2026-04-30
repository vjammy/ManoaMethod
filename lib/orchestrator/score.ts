import type { CommandResult, GateResult, ObjectiveCriterion, RepoState, Scorecard, ScorecardVerdict } from './types';
import { detectHardCapSignals } from './gates';
import { ratio } from './utils';

export const RELEASE_APPROVAL_BLOCKER_LABELS = [
  'Lifecycle state is synchronized',
  'Final reports are repo-specific'
] as const;

export type ReleaseApprovalBlockerLabel = (typeof RELEASE_APPROVAL_BLOCKER_LABELS)[number];

function isReleaseApprovalOnlyFailure(gates: GateResult[]) {
  const failed = gates.filter((gate) => gate.status === 'fail');
  if (failed.length !== 1) return null;
  const releaseGate = failed[0];
  if (releaseGate.gate !== 'release gate') return null;
  if (releaseGate.failedCriteria.length === 0) return null;
  const everyFailureIsApprovalOnly = releaseGate.failedCriteria.every((label) =>
    (RELEASE_APPROVAL_BLOCKER_LABELS as readonly string[]).includes(label)
  );
  return everyFailureIsApprovalOnly ? releaseGate : null;
}

export function buildReleaseBlockerExplanation(failedCriteria: string[]) {
  const reasons = failedCriteria.map((label) => {
    if (label === 'Lifecycle state is synchronized') {
      return 'Manifest lifecycle is not yet ApprovedForBuild — production release requires explicit human approval (manifest.approvedForBuild=true and lifecycleStatus=ApprovedForBuild).';
    }
    if (label === 'Final reports are repo-specific') {
      return 'FINAL_RELEASE_REPORT.md is still a generated pending shell — fill it with the actual release summary, scope, and caveats before approving release.';
    }
    return label;
  });
  return [
    'Build evidence is complete, but release approval is intentionally withheld.',
    ...reasons,
    'Treat this as BUILD PASS / RELEASE NOT APPROVED until the release gate passes.'
  ].join(' ');
}

function category(
  key: Scorecard['categories'][number]['key'],
  label: string,
  weight: number,
  awarded: number,
  rationale: string[]
) {
  return { key, label, weight, awarded: Math.max(0, Math.min(weight, awarded)), rationale };
}

export function buildScorecard(
  repoState: RepoState,
  criteria: ObjectiveCriterion[],
  commands: CommandResult[],
  gates: GateResult[]
): Scorecard {
  const docsPresent = repoState.docs.filter((doc) => doc.exists).length;
  const requiredCommands = commands.filter((command) => command.required);
  const passedGates = gates.filter((gate) => gate.status === 'pass').length;
  const phasesWithHandoffs = repoState.phases.filter((phase) => phase.hasHandoff).length;
  const criteriaCoverage = ratio(criteria.length, 8);
  const expectedCoreDocs = repoState.mode === 'package' ? 5 : 3;
  const repoModeArtifactHits = [
    'docs/ORCHESTRATOR.md',
    'ORCHESTRATOR_IMPLEMENTATION_REPORT.md',
    'orchestrator/reports/OBJECTIVE_CRITERIA.md',
    'orchestrator/reports/OBJECTIVE_SCORECARD.md',
    'orchestrator/reports/GATE_RESULTS.md',
    'orchestrator/reports/TEST_RESULTS.md',
    'orchestrator/reports/RECOVERY_PLAN.md',
    'orchestrator/reports/FINAL_ORCHESTRATOR_REPORT.md'
  ].filter((file) => repoState.reportFiles.includes(file) || repoState.docs.some((doc) => doc.path === file && doc.exists)).length;
  const repoModeRecoveryHits = [
    'ORCHESTRATOR_IMPLEMENTATION_REPORT.md',
    'orchestrator/reports/RECOVERY_PLAN.md',
    'orchestrator/reports/NEXT_AGENT_PROMPT.md',
    'orchestrator/reports/FINAL_ORCHESTRATOR_REPORT.md'
  ].filter((file) => repoState.reportFiles.includes(file) || repoState.handoffFiles.includes(file) || repoState.docs.some((doc) => doc.path === file && doc.exists)).length;
  const categories = [
    category(
      'objectiveFit',
      'Objective fit',
      20,
      Math.round(20 * Math.min(1, criteriaCoverage) * Math.min(1, ratio(docsPresent, expectedCoreDocs))),
      ['Scored from derived objective criteria coverage and core-doc presence.']
    ),
    category(
      'functionalCorrectness',
      'Functional correctness',
      15,
      Math.round(15 * ratio(requiredCommands.filter((command) => command.status === 'passed' || command.status === 'skipped').length, requiredCommands.length || 1)),
      requiredCommands.map((command) => `${command.name}: ${command.status}`)
    ),
    category(
      'testRegressionCoverage',
      'Test and regression coverage',
      15,
      Math.round(
        15 *
          ratio(
            commands.filter((command) => ['smoke', 'test:quality-regression', 'test', 'regression'].includes(command.name) && (command.status === 'passed' || command.status === 'skipped')).length +
              repoState.regressionFiles.length,
            6
          )
      ),
      ['Combines command coverage with regression-suite presence.']
    ),
    category(
      'gateEnforcement',
      'Gate enforcement',
      15,
      Math.round(15 * ratio(passedGates, gates.length || 1)),
      gates.map((gate) => `${gate.gate}: ${gate.status}`)
    ),
    category(
      'artifactUsefulness',
      'Artifact usefulness',
      10,
      Math.round(
        10 *
          (repoState.mode === 'package'
            ? ratio(repoState.reportFiles.length + repoState.verificationReports.length, 12)
            : ratio(repoModeArtifactHits, 8))
      ),
      ['Rewards concrete markdown artifacts, reports, and verification records.']
    ),
    category(
      'beginnerUsability',
      'Beginner usability',
      10,
      Math.round(
        10 *
          ratio(
            repoState.docs.filter((doc) => doc.exists && /start here|readme|status/i.test(doc.path)).length +
              (repoState.docs.some((doc) => /plain english|beginner|what to do/i.test(doc.content)) ? 1 : 0),
            repoState.mode === 'package' ? 4 : 3
          )
      ),
      ['Scores whether a new non-expert can orient from markdown docs.']
    ),
    category(
      'handoffRecoveryQuality',
      'Handoff/recovery quality',
      10,
      Math.round(
        10 *
          (repoState.mode === 'package'
            ? ratio(repoState.handoffFiles.length + phasesWithHandoffs, 8)
            : ratio(repoModeRecoveryHits, 4))
      ),
      ['Rewards phase handoffs, next-context files, and recovery readiness.']
    ),
    category(
      'localFirstCompliance',
      'Local-first/markdown-first compliance',
      5,
      Math.round(5 * ratio(repoState.localFirstSignals.length || 1, 3)),
      ['Checks for explicit local-first and markdown-first signals in the repo docs.']
    )
  ];

  const total = categories.reduce((sum, item) => sum + item.awarded, 0);
  const hardCapSignals = detectHardCapSignals(repoState, commands, gates);
  const hardCaps = [
    { reason: 'If tests were not run', maxScore: 79, triggered: !hardCapSignals.testsWereRun },
    { reason: 'If build fails', maxScore: 69, triggered: Boolean(hardCapSignals.buildFails) },
    { reason: 'If verification claims pass but body says blocked/fail', maxScore: 59, triggered: hardCapSignals.verificationContradiction },
    { reason: 'If generated artifacts are mostly generic templates', maxScore: 74, triggered: hardCapSignals.mostlyGeneric },
    { reason: 'If phase gates are bypassed', maxScore: 69, triggered: hardCapSignals.bypassedGates },
    { reason: 'If fake evidence is present', maxScore: 49, triggered: hardCapSignals.fakeEvidence },
    { reason: 'If repo cannot build at all', maxScore: 60, triggered: hardCapSignals.repoCannotBuildAtAll },
    { reason: 'If a phase has more than 3 rework attempts', maxScore: 79, triggered: Boolean(hardCapSignals.excessiveRework) },
    { reason: 'If requirement bodies are duplicated boilerplate', maxScore: 74, triggered: Boolean(hardCapSignals.duplicateRequirementBodies) }
  ];

  const activeCaps = hardCaps.filter((cap) => cap.triggered);
  const cap = activeCaps.length ? Math.min(...activeCaps.map((item) => item.maxScore)) : null;
  const cappedTotal = cap === null ? total : Math.min(total, cap);
  const capReason = activeCaps.find((item) => item.maxScore === cap)?.reason || null;
  const releaseBlocker = computeReleaseBlocker(gates);

  const verdict = computeVerdict(cappedTotal, gates, releaseBlocker);

  const summary = capReason
    ? `Raw score ${total}/100 capped to ${cappedTotal}/100 because ${capReason.toLowerCase()}.`
    : releaseBlocker.blocked
      ? `Build score ${cappedTotal}/100, but release is not approved: ${releaseBlocker.explanation}`
      : `Score ${cappedTotal}/100 with no hard caps triggered.`;

  return {
    total,
    cappedTotal,
    verdict,
    categories,
    hardCaps,
    capReason,
    summary,
    releaseBlocker
  };
}

export type ReleaseBlockerInfo = Scorecard['releaseBlocker'];

export function computeReleaseBlocker(gates: GateResult[]): ReleaseBlockerInfo {
  const releaseApprovalOnlyGate = isReleaseApprovalOnlyFailure(gates);
  if (!releaseApprovalOnlyGate) return { blocked: false, failedCriteria: [], explanation: null };
  return {
    blocked: true,
    failedCriteria: [...releaseApprovalOnlyGate.failedCriteria],
    explanation: buildReleaseBlockerExplanation(releaseApprovalOnlyGate.failedCriteria)
  };
}

export function computeVerdict(
  cappedTotal: number,
  gates: GateResult[],
  releaseBlocker: ReleaseBlockerInfo
): ScorecardVerdict {
  const hasFailedGate = gates.some((gate) => gate.status === 'fail');
  if (cappedTotal < 60) return 'FAIL';
  if (releaseBlocker.blocked && cappedTotal >= 80) return 'PASS WITH RELEASE BLOCKER';
  if (hasFailedGate) return 'FAIL';
  if (cappedTotal >= 90) return 'PASS';
  if (cappedTotal >= 80) return 'CONDITIONAL PASS';
  return 'NEEDS FIXES';
}

export function qualifiedRecommendation(
  scorecard: Pick<Scorecard, 'verdict' | 'cappedTotal' | 'releaseBlocker'>,
  gates: GateResult[]
): 'PASS' | 'BUILD PASS / RELEASE NOT APPROVED' | 'CONDITIONAL PASS' | 'NEEDS TARGETED FIXES' | 'FAIL' {
  // The recommendation is anchored on the verdict so they can never silently
  // disagree. releaseBlocker.blocked alone is NOT enough to surface BUILD PASS
  // / RELEASE NOT APPROVED — the verdict must already be 'PASS WITH RELEASE
  // BLOCKER', which itself requires a passing build score (>= 80) and only the
  // release gate failing for the canonical approval-only criteria.
  if (scorecard.verdict === 'PASS') return 'PASS';
  if (scorecard.verdict === 'PASS WITH RELEASE BLOCKER') {
    return 'BUILD PASS / RELEASE NOT APPROVED';
  }
  if (scorecard.verdict === 'CONDITIONAL PASS') return 'CONDITIONAL PASS';
  if (scorecard.verdict === 'NEEDS FIXES') return 'NEEDS TARGETED FIXES';
  // verdict === 'FAIL'
  if (gates.filter((gate) => gate.status === 'fail').length === 0 && scorecard.cappedTotal >= 90) {
    return 'PASS';
  }
  return 'FAIL';
}
