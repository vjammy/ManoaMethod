#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepoState } from '../lib/orchestrator/scanner';
import { runProjectCommands } from '../lib/orchestrator/commands';
import { runGateChecks } from '../lib/orchestrator/gates';
import { buildScorecard } from '../lib/orchestrator/score';
import { deriveObjectiveCriteria } from '../lib/orchestrator/criteria';
import { buildRecoveryPlan } from '../lib/orchestrator/recovery';
import { ensureDir, resolveOrchestratorRoot } from '../lib/orchestrator/utils';

function getArg(name: string) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

export function runRecover() {
  const repoRoot = path.resolve(getArg('repo') || process.cwd());
  const packageRoot = getArg('package') ? path.resolve(getArg('package')!) : undefined;
  const repoState = buildRepoState(repoRoot, packageRoot);
  const orchestratorRoot = resolveOrchestratorRoot(repoRoot);
  const reportsRoot = path.join(orchestratorRoot, 'reports');
  const commandsRoot = path.join(orchestratorRoot, 'runs', `${repoState.runId}-recover`, 'commands');
  ensureDir(reportsRoot);
  ensureDir(commandsRoot);
  const criteria = deriveObjectiveCriteria(repoState, reportsRoot);
  const commands = runProjectCommands(repoState, commandsRoot, true);
  const gates = runGateChecks(repoState, commands);
  const scorecard = buildScorecard(repoState, criteria, commands, gates);
  const recoveryPlan = buildRecoveryPlan(repoState, runGateChecks(repoState, commands, scorecard), reportsRoot);

  console.log(`Recovery plan written to ${path.join(reportsRoot, 'RECOVERY_PLAN.md')}`);
  console.log(`Next prompt written to ${path.join(reportsRoot, 'NEXT_AGENT_PROMPT.md')}`);
  console.log(`Failed gate: ${recoveryPlan.failedGate}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runRecover();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
