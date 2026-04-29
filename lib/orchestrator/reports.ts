import path from 'node:path';
import type { CommandResult, GateResult, OrchestratorRun, RepoState, RoundResult, Scorecard } from './types';
import { summarizeList, writeFile } from './utils';

function renderCommandResults(commands: CommandResult[]) {
  return commands
    .map(
      (command) => `## ${command.name}

- Command: \`${command.command}\`
- Required: ${command.required ? 'yes' : 'no'}
- Detected: ${command.detected ? 'yes' : 'no'}
- Status: ${command.status}
- Exit code: ${command.exitCode ?? 'none'}

\`\`\`text
${(command.stdout + (command.stderr ? `\n${command.stderr}` : '')).trim() || '(no output)'}
\`\`\`
`
    )
    .join('\n');
}

function renderGates(gates: GateResult[]) {
  return gates
    .map(
      (gate) => `## ${gate.gate}

- Status: ${gate.status}
- Summary: ${gate.summary}

${gate.checks.map((check) => `- ${check.passed ? 'PASS' : 'FAIL'}: ${check.label} - ${check.detail}`).join('\n')}
`
    )
    .join('\n');
}

function renderScorecard(scorecard: Scorecard) {
  return `# OBJECTIVE_SCORECARD

- Raw score: ${scorecard.total}/100
- Final score: ${scorecard.cappedTotal}/100
- Verdict: ${scorecard.verdict}
- Hard cap reason: ${scorecard.capReason || 'none'}

| Category | Awarded | Weight |
| --- | ---: | ---: |
${scorecard.categories.map((category) => `| ${category.label} | ${category.awarded} | ${category.weight} |`).join('\n')}

## Hard caps
${scorecard.hardCaps.map((cap) => `- ${cap.triggered ? 'TRIGGERED' : 'not triggered'}: ${cap.reason} -> max ${cap.maxScore}`).join('\n')}

## Summary
${scorecard.summary}
`;
}

export function writeRoundReports(round: RoundResult, reportsRoot: string, runRoot: string) {
  writeFile(path.join(reportsRoot, 'GATE_RESULTS.md'), `# GATE_RESULTS\n\n${renderGates(round.gates)}`);
  writeFile(path.join(reportsRoot, 'TEST_RESULTS.md'), `# TEST_RESULTS\n\n${renderCommandResults(round.commands)}`);
  writeFile(path.join(reportsRoot, 'OBJECTIVE_SCORECARD.md'), renderScorecard(round.scorecard));
  writeFile(
    path.join(runRoot, 'SCORECARD.md'),
    `# SCORECARD\n\n- Round: ${round.round}\n- Score: ${round.scorecard.cappedTotal}/100\n- Summary: ${round.scorecard.summary}\n`
  );
  writeFile(
    path.join(reportsRoot, 'ORCHESTRATOR_RUN_REPORT.md'),
    `# ORCHESTRATOR_RUN_REPORT

- Round: ${round.round}
- Project: ${round.repoState.projectName}
- Repo root: \`${round.repoState.repoRoot}\`
- Package root: \`${round.repoState.packageRoot || 'not detected'}\`
- Final score this round: ${round.scorecard.cappedTotal}/100
- Verdict: ${round.scorecard.verdict}
- Stop reason: ${round.stopReason || 'continuing'}

## Gate summary
${summarizeList(round.gates.map((gate) => `${gate.gate}: ${gate.status}`), 'No gates were run.')}

## Recovery summary
${summarizeList(round.recoveryPlan.exactProblems, 'No recovery issues were recorded.')}
`
  );
}

export function writeFinalReports(run: OrchestratorRun, reportsRoot: string) {
  const finalRound = run.finalRound;
  writeFile(
    path.join(reportsRoot, 'FINAL_ORCHESTRATOR_REPORT.md'),
    `# FINAL_ORCHESTRATOR_REPORT

- Project: ${finalRound.repoState.projectName}
- Target score: ${run.options.targetScore}
- Final score: ${finalRound.scorecard.cappedTotal}
- Verdict: ${finalRound.scorecard.verdict}
- Rounds completed: ${run.rounds.length}
- Stop reason: ${run.stopReason}

## Final gate state
${summarizeList(finalRound.gates.map((gate) => `${gate.gate}: ${gate.status}`), 'No gates were recorded.')}

## Final recovery state
${summarizeList(finalRound.recoveryPlan.exactProblems, 'No active recovery problems remain.')}
`
  );
}
