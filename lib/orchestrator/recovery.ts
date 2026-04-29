import type { GateResult, RecoveryPlan, RepoState } from './types';
import { unique, writeFile } from './utils';
import path from 'node:path';

function findLikelyFiles(repoState: RepoState, failedGate: GateResult | undefined) {
  const likely = [
    ...repoState.docs.filter((doc) => doc.exists).map((doc) => doc.path),
    ...repoState.verificationReports,
    ...repoState.handoffFiles
  ];

  if (failedGate?.gate === 'implementation gate' || failedGate?.gate === 'test gate' || failedGate?.gate === 'regression gate') {
    likely.unshift('package.json', 'scripts/', 'lib/');
  }

  return unique(likely).slice(0, 10);
}

export function buildRecoveryPlan(repoState: RepoState, gates: GateResult[], reportsRoot: string): RecoveryPlan {
  const failedGate = gates.find((gate) => gate.status === 'fail');
  const failedCriteria = gates.flatMap((gate) => gate.failedCriteria);
  const evidenceInspected = unique([
    ...repoState.verificationReports.slice(0, 5),
    ...repoState.handoffFiles.slice(0, 3),
    ...repoState.docs.filter((doc) => doc.exists).map((doc) => doc.path).slice(0, 4)
  ]);
  const exactProblems = gates
    .filter((gate) => gate.status === 'fail')
    .flatMap((gate) => gate.checks.filter((check) => !check.passed).map((check) => `${gate.gate}: ${check.label} - ${check.detail}`));
  const likelyFilesToChange = findLikelyFiles(repoState, failedGate);
  const commandsToRerun = [
    'npm run typecheck',
    'npm run smoke',
    'npm run build',
    'npm run test:quality-regression'
  ];
  const expectedProof = [
    'Failed gate status changes from fail to pass.',
    'The rerun command output is captured under orchestrator/runs/<run-id>/commands/.',
    'The updated scorecard reflects the fixed criteria without triggering the same hard cap.'
  ];
  const broadRewriteRecommended = exactProblems.length >= 5 && likelyFilesToChange.length >= 8;
  const nextAgentPrompt = `Focus only on fixing the failed gate: ${failedGate?.gate || 'failed gate'}. Make the smallest repo-specific changes that restore evidence and gate consistency.

Failed criteria:
${failedCriteria.join('\n') || 'none'}

Evidence inspected:
${evidenceInspected.join('\n') || 'none'}

Commands to rerun:
${commandsToRerun.join('\n')}

Expected proof of success:
${expectedProof.join('\n')}

Problems to fix:
${exactProblems.join('\n') || 'No exact problems recorded.'}`;
  const recoveryPrompt = `# Recovery Agent Prompt

## Failed gate
${failedGate?.gate || 'none'}

## Exact failed criteria
${failedCriteria.length ? failedCriteria.map((item) => `- ${item}`).join('\n') : '- none'}

## Likely files to change
${likelyFilesToChange.length ? likelyFilesToChange.map((item) => `- ${item}`).join('\n') : '- inspect repo state'}

## Evidence inspected
${evidenceInspected.length ? evidenceInspected.map((item) => `- ${item}`).join('\n') : '- none'}

## Commands to rerun
${commandsToRerun.map((item) => `- ${item}`).join('\n')}

## Expected proof of success
${expectedProof.map((item) => `- ${item}`).join('\n')}

## Rules
- Do not recommend a broad rewrite unless the current structure prevents safe repair.
- Prefer a focused recovery that restores real evidence, command health, and phase continuity.
- Preserve local-first and markdown-first constraints.
`;

  const plan: RecoveryPlan = {
    failedGate: failedGate?.gate || 'none',
    failedCriteria,
    evidenceInspected,
    likelyFilesToChange,
    commandsToRerun,
    expectedProof,
    exactProblems,
    nextAgentPrompt,
    recoveryPrompt,
    broadRewriteRecommended
  };

  writeFile(
    path.join(reportsRoot, 'RECOVERY_PLAN.md'),
    `# RECOVERY_PLAN

- Failed gate: ${plan.failedGate}
- Broad rewrite recommended: ${plan.broadRewriteRecommended ? 'yes' : 'no'}

## Exact problems
${exactProblems.length ? exactProblems.map((item) => `- ${item}`).join('\n') : '- No failed gate problems were recorded.'}

## Evidence inspected
${evidenceInspected.length ? evidenceInspected.map((item) => `- ${item}`).join('\n') : '- none'}

## Likely files to change
${likelyFilesToChange.length ? likelyFilesToChange.map((item) => `- ${item}`).join('\n') : '- none'}

## Commands to rerun
${commandsToRerun.map((item) => `- ${item}`).join('\n')}

## Expected proof of success
${expectedProof.map((item) => `- ${item}`).join('\n')}
`
  );
  writeFile(path.join(reportsRoot, 'NEXT_AGENT_PROMPT.md'), nextAgentPrompt);

  return plan;
}
