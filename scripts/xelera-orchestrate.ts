#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orchestrate } from '../lib/orchestrator/runner';

function getArg(name: string) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

export function runOrchestrate() {
  const repoRoot = path.resolve(getArg('repo') || process.cwd());
  const packageRoot = getArg('package') ? path.resolve(getArg('package')!) : undefined;
  const targetScore = Number(getArg('target-score') || '95');
  const maxRounds = Number(getArg('max-rounds') || '5');
  const dryRun = (getArg('dry-run') || 'false').toLowerCase() === 'true';

  const result = orchestrate({
    repoRoot,
    packageRoot,
    targetScore,
    maxRounds,
    dryRun
  });

  console.log(`Xelera Orchestrator completed ${result.rounds.length} round(s).`);
  console.log(`Final score: ${result.finalRound.scorecard.cappedTotal}/100`);
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Reports: ${path.join(repoRoot, 'orchestrator', 'reports')}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runOrchestrate();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
