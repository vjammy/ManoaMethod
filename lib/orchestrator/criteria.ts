import path from 'node:path';
import type { ObjectiveCriterion, RepoState } from './types';
import { extractBullets, unique, writeFile } from './utils';

const GENERIC_CRITERIA_PATTERNS = [
  /^read this file first/i,
  /^then open /i,
  /^if blockers are listed/i,
  /^current phase/i,
  /^current package status/i,
  /^good news/i,
  /^what to open/i
];

function isMeaningfulCriterionBullet(bullet: string) {
  const normalized = bullet.trim();
  return normalized.length >= 24 && !GENERIC_CRITERIA_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildCoreCriteria(repoState: RepoState): ObjectiveCriterion[] {
  const docsByKey = new Map(repoState.docs.map((doc) => [doc.key, doc]));
  const readme = docsByKey.get('readme')?.content || '';
  const scorecard = docsByKey.get('scorecard')?.content || '';
  const testing = docsByKey.get('testingStrategy')?.content || '';
  const regression = docsByKey.get('regressionPlan')?.content || '';
  const context = docsByKey.get('projectContext')?.content || '';
  const bullets = unique(
    [
      ...extractBullets(context),
      ...extractBullets(scorecard),
      ...extractBullets(testing),
      ...extractBullets(regression)
    ].filter(isMeaningfulCriterionBullet)
  ).slice(0, 8);

  const criteria: ObjectiveCriterion[] = bullets.map((bullet, index) => ({
    id: `criterion-${String(index + 1).padStart(2, '0')}`,
    category:
      index < 2
        ? 'objective-fit'
        : index < 4
          ? 'test-regression'
          : index < 6
            ? 'gates'
            : 'artifacts',
    title: bullet.slice(0, 90),
    description: bullet,
    evidencePaths: repoState.docs.filter((doc) => doc.exists).map((doc) => doc.path).slice(0, 4),
    measurableCheck: `Confirm repo evidence clearly demonstrates: ${bullet}`
  }));

  if (criteria.length === 0) {
    const repoSpecificEvidence = repoState.mode === 'repo'
      ? ['README.md', 'docs/ORCHESTRATOR.md', 'ORCHESTRATOR_IMPLEMENTATION_REPORT.md'].filter((item) =>
          repoState.docs.some((doc) => doc.path === item && doc.exists)
        )
      : ['README.md', 'START_HERE.md', '00_PROJECT_CONTEXT.md'].filter((item) =>
          repoState.docs.some((doc) => doc.path === item && doc.exists)
        );
    criteria.push(
      {
        id: 'criterion-01',
        category: 'objective-fit',
        title: 'Project intent is recoverable from markdown',
        description: `${repoState.projectName} should be understandable from local docs without hidden chat context.`,
        evidencePaths: repoSpecificEvidence,
        measurableCheck: 'A new builder can identify the project goal, scope, and constraints from repository docs.'
      },
      {
        id: 'criterion-02',
        category: 'functional-correctness',
        title: 'Required local validation commands run successfully',
        description: 'Typecheck, smoke, build, and quality regression commands should run locally with captured output.',
        evidencePaths: ['package.json'],
        measurableCheck: 'Required commands have recorded results and no required command is missing.'
      },
      {
        id: 'criterion-03',
        category: 'gates',
        title: 'Phase gates and evidence stay consistent',
        description: 'Verification reports, gate files, and handoffs should agree and should not contain fake pass claims.',
        evidencePaths: repoState.mode === 'repo' ? ['orchestrator/reports/GATE_RESULTS.md'] : repoState.verificationReports.slice(0, 4),
        measurableCheck: 'No gate bypasses, pass/fail contradictions, or placeholder evidence remain.'
      }
    );
    if (repoState.mode === 'repo') {
      criteria.push({
        id: 'criterion-04',
        category: 'beginner-usability',
        title: 'Repo-level orchestrator docs tell a beginner what to run next',
        description: 'A mild-technical business user should understand what orchestrate does, what dry-run means, where reports live, and what to do if the score is low.',
        evidencePaths: ['docs/ORCHESTRATOR.md', 'README.md'].filter((item) =>
          repoState.docs.some((doc) => doc.path === item && doc.exists)
        ),
        measurableCheck: 'The repo docs name commands, reports, dry-run behavior, and next steps in plain language.'
      });
    }
  }

  const readmeSpecificity = readme
    .split(/\r?\n/)
    .filter((line) => line.includes(repoState.projectName) || /local-first|markdown-first|orchestrator/i.test(line))
    .slice(0, 3);

  criteria.push({
    id: `criterion-${String(criteria.length + 1).padStart(2, '0')}`,
    category: 'local-first',
    title: 'Local-first and markdown-first constraints remain intact',
    description:
      'The repo must stay free of hosted-backend, auth-system, and database-first drift in the first orchestrator version.',
    evidencePaths: ['README.md', ...(repoState.docs.find((doc) => doc.key === 'contextRules')?.exists ? ['01_CONTEXT_RULES.md'] : [])],
    measurableCheck: `Repo docs still emphasize local-first behavior. Evidence snippets: ${readmeSpecificity.join(' | ') || 'not found'}`
  });

  return criteria;
}

function renderCriteria(criteria: ObjectiveCriterion[], repoState: RepoState) {
  return `# OBJECTIVE_CRITERIA

- Project: ${repoState.projectName}
- Repo root: \`${repoState.repoRoot}\`
- Package root: \`${repoState.packageRoot || 'not detected'}\`

## Criteria
${criteria
  .map(
    (criterion) => `### ${criterion.id} - ${criterion.title}

- Category: ${criterion.category}
- Description: ${criterion.description}
- Evidence paths: ${criterion.evidencePaths.join(', ') || 'none'}
- Measurable check: ${criterion.measurableCheck}`
  )
  .join('\n\n')}
`;
}

export function deriveObjectiveCriteria(repoState: RepoState, reportsRoot: string) {
  const criteria = buildCoreCriteria(repoState);
  writeFile(path.join(reportsRoot, 'OBJECTIVE_CRITERIA.md'), renderCriteria(criteria, repoState));
  return criteria;
}
