#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepoState } from '../lib/orchestrator/scanner';
import { deriveObjectiveCriteria } from '../lib/orchestrator/criteria';
import { runProjectCommands } from '../lib/orchestrator/commands';
import { runGateChecks } from '../lib/orchestrator/gates';
import { buildScorecard } from '../lib/orchestrator/score';
import { ensureDir, resolveOrchestratorRoot, writeFile } from '../lib/orchestrator/utils';

function getArg(name: string) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

export function runScore() {
  const repoRoot = path.resolve(getArg('repo') || process.cwd());
  const packageRoot = getArg('package') ? path.resolve(getArg('package')!) : undefined;
  const dryRun = (getArg('dry-run') || 'false').toLowerCase() === 'true';
  const repoState = buildRepoState(repoRoot, packageRoot);
  const orchestratorRoot = resolveOrchestratorRoot(repoRoot);
  const reportsRoot = path.join(orchestratorRoot, 'reports');
  const commandsRoot = path.join(orchestratorRoot, 'runs', `${repoState.runId}-score`, 'commands');
  ensureDir(reportsRoot);
  ensureDir(commandsRoot);
  const criteria = deriveObjectiveCriteria(repoState, reportsRoot);
  const commands = runProjectCommands(repoState, commandsRoot, dryRun);
  const gates = runGateChecks(repoState, commands);
  const scorecard = buildScorecard(repoState, criteria, commands, gates);

  writeFile(
    path.join(reportsRoot, 'OBJECTIVE_SCORECARD.md'),
    `# OBJECTIVE_SCORECARD

- Project: ${repoState.projectName}
- Score: ${scorecard.cappedTotal}/100
- Raw score: ${scorecard.total}/100
- Verdict: ${scorecard.verdict}
- Hard cap reason: ${scorecard.capReason || 'none'}

${scorecard.categories.map((category) => `- ${category.label}: ${category.awarded}/${category.weight}`).join('\n')}
`
  );

  console.log(`Score: ${scorecard.cappedTotal}/100`);
  console.log(`Report: ${path.join(reportsRoot, 'OBJECTIVE_SCORECARD.md')}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runScore();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
