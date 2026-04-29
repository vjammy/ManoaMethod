import type { CommandResult, GateResult, ObjectiveCriterion, RepoState, Scorecard } from './types';
import { detectHardCapSignals } from './gates';
import { ratio } from './utils';

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
    { reason: 'If repo cannot build at all', maxScore: 60, triggered: hardCapSignals.repoCannotBuildAtAll }
  ];

  const activeCaps = hardCaps.filter((cap) => cap.triggered);
  const cap = activeCaps.length ? Math.min(...activeCaps.map((item) => item.maxScore)) : null;
  const cappedTotal = cap === null ? total : Math.min(total, cap);
  const capReason = activeCaps.find((item) => item.maxScore === cap)?.reason || null;
  const hasFailedGate = gates.some((gate) => gate.status === 'fail');
  const verdict =
    hasFailedGate || cappedTotal < 60
      ? 'FAIL'
      : cappedTotal >= 90
        ? 'PASS'
        : cappedTotal >= 80
          ? 'CONDITIONAL PASS'
          : 'NEEDS FIXES';

  return {
    total,
    cappedTotal,
    verdict,
    categories,
    hardCaps,
    capReason,
    summary: capReason
      ? `Raw score ${total}/100 capped to ${cappedTotal}/100 because ${capReason.toLowerCase()}.`
      : `Score ${cappedTotal}/100 with no hard caps triggered.`
  };
}
