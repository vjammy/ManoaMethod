#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepoState } from '../lib/orchestrator/scanner';
import { runProjectCommands } from '../lib/orchestrator/commands';
import { runGateChecks } from '../lib/orchestrator/gates';
import { ensureDir, resolveOrchestratorRoot, writeFile } from '../lib/orchestrator/utils';

function getArg(name: string) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

export function runGates() {
  const repoRoot = path.resolve(getArg('repo') || process.cwd());
  const packageRoot = getArg('package') ? path.resolve(getArg('package')!) : undefined;
  const dryRun = (getArg('dry-run') || 'false').toLowerCase() === 'true';
  const repoState = buildRepoState(repoRoot, packageRoot);
  const orchestratorRoot = resolveOrchestratorRoot(repoRoot);
  const reportsRoot = path.join(orchestratorRoot, 'reports');
  const commandsRoot = path.join(orchestratorRoot, 'runs', `${repoState.runId}-gates`, 'commands');
  ensureDir(reportsRoot);
  ensureDir(commandsRoot);
  const commands = runProjectCommands(repoState, commandsRoot, dryRun);
  const gates = runGateChecks(repoState, commands);
  writeFile(
    path.join(reportsRoot, 'GATE_RESULTS.md'),
    `# GATE_RESULTS

${gates
  .map((gate) => `## ${gate.gate}\n\n- Status: ${gate.status}\n- Summary: ${gate.summary}\n${gate.checks.map((check) => `- ${check.passed ? 'PASS' : 'FAIL'}: ${check.label} - ${check.detail}`).join('\n')}`)
  .join('\n\n')}
`
  );

  console.log(`Gate report: ${path.join(reportsRoot, 'GATE_RESULTS.md')}`);
  for (const gate of gates) {
    console.log(`${gate.gate}: ${gate.status}`);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runGates();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
