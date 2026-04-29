import path from 'node:path';
import { buildRepoState } from './scanner';
import { deriveObjectiveCriteria } from './criteria';
import { writePromptPackets } from './prompts';
import { runProjectCommands } from './commands';
import { runGateChecks } from './gates';
import { buildScorecard } from './score';
import { buildRecoveryPlan } from './recovery';
import { writeFinalReports, writeRoundReports } from './reports';
import type { OrchestratorOptions, OrchestratorRun, RoundResult, StopReason } from './types';
import { ensureDir, resolveOrchestratorRoot } from './utils';

function getPaths(repoRoot: string, runId: string) {
  const orchestratorRoot = resolveOrchestratorRoot(repoRoot);
  const reportsRoot = path.join(orchestratorRoot, 'reports');
  const promptsRoot = path.join(orchestratorRoot, 'prompts');
  const runRoot = path.join(orchestratorRoot, 'runs', runId);
  const commandsRoot = path.join(runRoot, 'commands');
  const runAgentsRoot = path.join(runRoot, 'agents');
  [orchestratorRoot, reportsRoot, promptsRoot, runRoot, commandsRoot, runAgentsRoot].forEach(ensureDir);
  return { orchestratorRoot, reportsRoot, promptsRoot, runRoot, commandsRoot, runAgentsRoot };
}

function detectStopReason(
  round: RoundResult,
  rounds: RoundResult[],
  options: OrchestratorOptions
): StopReason | null {
  if (round.scorecard.cappedTotal >= options.targetScore) return 'target-score-reached';
  if (/hosted backend|database|auth system/i.test(round.recoveryPlan.exactProblems.join(' '))) return 'violates-local-first';
  if (round.recoveryPlan.exactProblems.some((problem) => /missing dependency|external dependency/i.test(problem))) {
    return 'missing-external-dependency';
  }
  const lastTwo = rounds.slice(-2);
  if (
    lastTwo.length === 2 &&
    lastTwo[0].recoveryPlan.failedGate !== 'none' &&
    lastTwo[0].recoveryPlan.failedGate === lastTwo[1].recoveryPlan.failedGate &&
    lastTwo[0].recoveryPlan.failedCriteria.join('|') === lastTwo[1].recoveryPlan.failedCriteria.join('|')
  ) {
    return 'same-critical-failure-twice';
  }
  if (round.recoveryPlan.failedGate !== 'none') {
    return 'no-meaningful-change-possible';
  }
  return null;
}

export function orchestrate(options: OrchestratorOptions): OrchestratorRun {
  const initialState = buildRepoState(options.repoRoot, options.packageRoot);
  const rounds: RoundResult[] = [];
  const paths = getPaths(options.repoRoot, initialState.runId);

  for (let roundNumber = 1; roundNumber <= options.maxRounds; roundNumber += 1) {
    const repoState = roundNumber === 1 ? initialState : buildRepoState(options.repoRoot, options.packageRoot);
    const roundPaths = roundNumber === 1 ? paths : getPaths(options.repoRoot, `${repoState.runId}-r${roundNumber}`);
    const criteria = deriveObjectiveCriteria(repoState, roundPaths.reportsRoot);
    const provisionalRecovery = {
      failedGate: 'none' as const,
      failedCriteria: [],
      evidenceInspected: [],
      likelyFilesToChange: [],
      commandsToRerun: [],
      expectedProof: [],
      exactProblems: [],
      nextAgentPrompt: '',
      recoveryPrompt: '',
      broadRewriteRecommended: false
    };
    const agentTasks = writePromptPackets(repoState, criteria, roundPaths.promptsRoot, roundPaths.runAgentsRoot, provisionalRecovery);
    const commands = runProjectCommands(repoState, roundPaths.commandsRoot, options.dryRun);
    const provisionalGates = runGateChecks(repoState, commands);
    const scorecard = buildScorecard(repoState, criteria, commands, provisionalGates);
    const gates = runGateChecks(repoState, commands, scorecard);
    const recoveryPlan = buildRecoveryPlan(repoState, gates, roundPaths.reportsRoot);
    const round: RoundResult = {
      round: roundNumber,
      repoState,
      criteria,
      agentTasks,
      commands,
      gates,
      scorecard,
      recoveryPlan,
      stopReason: null
    };
    rounds.push(round);
    round.stopReason = detectStopReason(round, rounds, options);
    writePromptPackets(repoState, criteria, roundPaths.promptsRoot, roundPaths.runAgentsRoot, recoveryPlan);
    writeRoundReports(round, roundPaths.reportsRoot, roundPaths.runRoot);

    if (round.stopReason) {
      const stopReason =
        round.stopReason === 'target-score-reached'
          ? round.stopReason
          : roundNumber >= options.maxRounds
            ? 'max-rounds-reached'
            : round.stopReason;
      const finalRound = { ...round, stopReason };
      const run: OrchestratorRun = {
        options,
        rounds,
        finalRound,
        stopReason
      };
      writeFinalReports(run, roundPaths.reportsRoot);
      return run;
    }
  }

  const finalRound = rounds[rounds.length - 1];
  const run: OrchestratorRun = {
    options,
    rounds,
    finalRound: { ...finalRound, stopReason: 'max-rounds-reached' },
    stopReason: 'max-rounds-reached'
  };
  writeFinalReports(run, path.join(options.repoRoot, 'orchestrator', 'reports'));
  return run;
}
