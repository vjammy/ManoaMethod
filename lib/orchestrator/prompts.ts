import path from 'node:path';
import type { AgentTask, ObjectiveCriterion, RecoveryPlan, RepoState } from './types';
import { summarizeList, writeFile } from './utils';

const AGENTS: AgentTask['agent'][] = [
  'Planner Agent',
  'Builder Agent',
  'UI Agent',
  'Test Agent',
  'Verifier Agent',
  'Critic Agent',
  'Recovery Agent'
];

function agentFileName(agent: AgentTask['agent']) {
  return agent.toLowerCase().replace(/\s+/g, '-');
}

function buildPrompt(
  agent: AgentTask['agent'],
  repoState: RepoState,
  criteria: ObjectiveCriterion[],
  recoveryPlan?: RecoveryPlan
) {
  const focus =
    agent === 'Planner Agent'
      ? 'tighten phase intent, objective criteria, and repo-specific sequencing'
      : agent === 'Builder Agent'
        ? 'make the smallest repo-specific implementation changes needed to improve the build'
        : agent === 'UI Agent'
          ? 'improve user-facing workflow clarity without adding a heavyweight UI app'
          : agent === 'Test Agent'
            ? 'strengthen command coverage, regression evidence, and reproducible checks'
            : agent === 'Verifier Agent'
              ? 'inspect artifacts and command results for objective proof'
              : agent === 'Critic Agent'
                ? 'identify exact gaps, contradictions, regressions, and fake evidence'
                : 'repair the specific failed gate with focused, non-broad changes';

  const likelyFiles = [
    ...repoState.docs.filter((doc) => doc.exists).map((doc) => doc.path).slice(0, 4),
    ...repoState.phases.flatMap((phase) => phase.files.slice(0, 2)).slice(0, 4)
  ];

  return {
    agent,
    fileName: `${agentFileName(agent)}.md`,
    likelyFilesToChange: likelyFiles,
    prompt: `# ${agent}

## Mission
You are responsible for: ${focus}.

## Project
- Project name: ${repoState.projectName}
- Repo root: \`${repoState.repoRoot}\`
- Package root: \`${repoState.packageRoot || 'not detected'}\`
- Generated package detected: ${repoState.isGeneratedPackage ? 'yes' : 'no'}

## Objective criteria
${criteria
  .slice(0, 8)
  .map((criterion) => `- ${criterion.id}: ${criterion.description}`)
  .join('\n')}

## Repo signals
${summarizeList(repoState.localFirstSignals, 'No explicit local-first signals captured yet.')}

## Likely files
${summarizeList(likelyFiles, 'Inspect repo docs and active phase files first.')}

## Rules
- Do not invent agent execution results.
- Do not claim a gate passed without evidence from files or command outputs.
- Do not add hosted backends, auth systems, or database-first architecture.
- Prefer small, focused changes tied directly to failed criteria.

## Recovery context
${recoveryPlan ? summarizeList(recoveryPlan.exactProblems, 'No recovery issues recorded.') : '- No active recovery plan for this packet.'}
`
  };
}

export function writePromptPackets(
  repoState: RepoState,
  criteria: ObjectiveCriterion[],
  promptsRoot: string,
  runAgentsRoot: string,
  recoveryPlan?: RecoveryPlan
) {
  const tasks = AGENTS.map((agent) => buildPrompt(agent, repoState, criteria, recoveryPlan));

  for (const task of tasks) {
    writeFile(path.join(promptsRoot, task.fileName), task.prompt);
    writeFile(path.join(runAgentsRoot, task.fileName), task.prompt);
  }

  return tasks;
}
