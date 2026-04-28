import type { CritiqueItem, ProjectInput, QuestionnaireItem, ScoreBreakdown, ScoreCategory } from './types';

function splitItems(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function hasKeywords(value: string, keywords: string[]) {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function countAnswered(questionnaire: QuestionnaireItem[], answers: Record<string, string>) {
  return questionnaire.filter((item) => item.required && (answers[item.id] || '').trim()).length;
}

function scoreCategory(config: {
  key: ScoreCategory['key'];
  label: string;
  max: number;
  checks: Array<{ ok: boolean; points: number; reasonLost: string; improvement: string }>;
}): ScoreCategory {
  let score = 0;
  const reasonsLost: string[] = [];
  const improvements: string[] = [];

  for (const check of config.checks) {
    if (check.ok) {
      score += check.points;
    } else {
      reasonsLost.push(check.reasonLost);
      if (!improvements.includes(check.improvement)) improvements.push(check.improvement);
    }
  }

  return {
    key: config.key,
    label: config.label,
    score: Math.min(config.max, score),
    max: config.max,
    reasonsLost,
    improvements
  };
}

export function scoreProject(
  input: ProjectInput,
  questionnaire: QuestionnaireItem[] = [],
  critique: CritiqueItem[] = []
): ScoreBreakdown {
  const mustHaves = splitItems(input.mustHaveFeatures);
  const nonGoals = splitItems(input.nonGoals);
  const risks = splitItems(input.risks);
  const audience = splitItems(input.targetAudience);
  const integrations = splitItems(input.dataAndIntegrations);
  const answeredCount = countAnswered(questionnaire, input.questionnaireAnswers);
  const criticalCritiqueCount = critique.filter((item) => item.severity === 'critical').length;
  const importantCritiqueCount = critique.filter((item) => item.severity === 'important').length;

  const categories: ScoreCategory[] = [
    scoreCategory({
      key: 'problem-clarity',
      label: 'Problem clarity',
      max: 12,
      checks: [
        {
          ok: wordCount(input.productIdea) >= 12,
          points: 4,
          reasonLost: 'The product idea is still too abstract.',
          improvement: 'State what the product changes for the user in plain language.'
        },
        {
          ok: wordCount(input.problemStatement) >= 12 && hasKeywords(input.problemStatement, ['because', 'today', 'causes', 'creates', 'leads', 'results']),
          points: 4,
          reasonLost: 'The problem statement does not clearly describe why the pain matters.',
          improvement: 'Explain the consequence of the current problem, not just its topic.'
        },
        {
          ok: (input.questionnaireAnswers['north-star'] || '').trim().length > 0 && wordCount(input.desiredOutput) >= 8,
          points: 4,
          reasonLost: 'The package lacks a crisp proof statement for the first release.',
          improvement: 'Add a clear north-star outcome and connect it to the desired handoff output.'
        }
      ]
    }),
    scoreCategory({
      key: 'target-user-clarity',
      label: 'Target user clarity',
      max: 12,
      checks: [
        {
          ok: audience.length >= 2,
          points: 4,
          reasonLost: 'The audience definition is too broad or too singular.',
          improvement: 'Differentiate the primary audience from secondary users or reviewers.'
        },
        {
          ok: hasKeywords(input.targetAudience, ['user', 'buyer', 'operator', 'engineer', 'manager', 'founder', 'team', 'customer']),
          points: 4,
          reasonLost: 'The audience section does not clearly name the roles involved.',
          improvement: 'Name the roles that use, approve, or receive the handoff.'
        },
        {
          ok: questionnaire.length === 0 || answeredCount >= Math.ceil(questionnaire.length * 0.6),
          points: 4,
          reasonLost: 'Too many required planning questions are still unanswered.',
          improvement: 'Complete the audience and workflow-oriented questionnaire answers.'
        }
      ]
    }),
    scoreCategory({
      key: 'workflow-clarity',
      label: 'Workflow clarity',
      max: 12,
      checks: [
        {
          ok: wordCount(input.questionnaireAnswers['primary-workflow'] || '') >= 12,
          points: 4,
          reasonLost: 'The core workflow is not described with enough sequence detail.',
          improvement: 'Describe the user journey step-by-step from first touch to success.'
        },
        {
          ok: hasKeywords(input.questionnaireAnswers['primary-workflow'] || '', ['then', 'start', 'review', 'export', 'create', 'complete']) || splitItems(input.questionnaireAnswers['primary-workflow'] || '').length >= 3,
          points: 4,
          reasonLost: 'The workflow answer does not read like an actual flow.',
          improvement: 'Write the workflow as actions in order rather than as a general statement.'
        },
        {
          ok: (input.questionnaireAnswers['failure-modes'] || '').trim().length > 0 || (input.questionnaireAnswers['customer-pain'] || '').trim().length > 0,
          points: 4,
          reasonLost: 'Failure or support paths are not visible yet.',
          improvement: 'Capture where the workflow can fail, confuse the user, or need support.'
        }
      ]
    }),
    scoreCategory({
      key: 'constraint-clarity',
      label: 'Constraint clarity',
      max: 10,
      checks: [
        {
          ok: splitItems(input.constraints).length >= 2 || hasKeywords(input.constraints, ['avoid', 'keep', 'without', 'must', 'limit']),
          points: 4,
          reasonLost: 'The constraints do not define clear planning boundaries.',
          improvement: 'Spell out the boundaries that should stop scope creep or technical drift.'
        },
        {
          ok: nonGoals.length >= 2,
          points: 3,
          reasonLost: 'The non-goals are not strong enough to protect scope.',
          improvement: 'List at least two explicit exclusions for the MVP.'
        },
        {
          ok: wordCount(input.timeline) >= 6,
          points: 3,
          reasonLost: 'The timeline or rollout pressure is still vague.',
          improvement: 'State the timing pressure or rollout sequence that affects planning.'
        }
      ]
    }),
    scoreCategory({
      key: 'risk-coverage',
      label: 'Risk coverage',
      max: 12,
      checks: [
        {
          ok: risks.length >= 2,
          points: 4,
          reasonLost: 'The base risk list is too short.',
          improvement: 'List the most likely delivery, trust, operational, or product risks.'
        },
        {
          ok: (input.questionnaireAnswers['operating-risks'] || '').trim().length > 0,
          points: 4,
          reasonLost: 'The gating risks are not explicit yet.',
          improvement: 'Answer which risks should block a phase from moving forward.'
        },
        {
          ok: hasKeywords(
            `${input.risks} ${input.questionnaireAnswers['operating-risks'] || ''}`,
            ['security', 'privacy', 'support', 'operational', 'delivery', 'trust', 'adoption', 'scope', 'testing', 'risk']
          ),
          points: 4,
          reasonLost: 'The risks lack enough coverage across planning dimensions.',
          improvement: 'Cover business, delivery, and technical risks rather than one narrow area.'
        }
      ]
    }),
    scoreCategory({
      key: 'acceptance-quality',
      label: 'Acceptance criteria quality',
      max: 12,
      checks: [
        {
          ok: wordCount(input.successMetrics) >= 10,
          points: 4,
          reasonLost: 'Success metrics are not concrete enough yet.',
          improvement: 'Describe what success looks like in observable or reviewable terms.'
        },
        {
          ok: hasKeywords(
            `${input.successMetrics} ${input.questionnaireAnswers['acceptance'] || ''}`,
            ['prove', 'evidence', 'metric', 'review', 'acceptance', 'test', 'pass', 'ready']
          ),
          points: 4,
          reasonLost: 'Acceptance proof is not stated as actual evidence.',
          improvement: 'Name the evidence that should convince the next reviewer to proceed.'
        },
        {
          ok: (input.questionnaireAnswers['acceptance'] || '').trim().length > 0,
          points: 4,
          reasonLost: 'The acceptance answer is missing.',
          improvement: 'Explain what proof should be present before build handoff.'
        }
      ]
    }),
    scoreCategory({
      key: 'implementation-readiness',
      label: 'Implementation readiness',
      max: 12,
      checks: [
        {
          ok: mustHaves.length >= 3,
          points: 4,
          reasonLost: 'The must-have scope is too thin for reliable implementation planning.',
          improvement: 'List at least three must-have capabilities for the MVP.'
        },
        {
          ok: integrations.length >= 1,
          points: 4,
          reasonLost: 'Inputs, outputs, or integrations are not described yet.',
          improvement: 'Define the key data boundaries and external touchpoints.'
        },
        {
          ok: wordCount(input.teamContext) >= 8,
          points: 4,
          reasonLost: 'The team context does not yet explain who builds or receives the handoff.',
          improvement: 'Describe who is planning, who is building, and who depends on the package.'
        }
      ]
    }),
    scoreCategory({
      key: 'testability',
      label: 'Testability',
      max: 10,
      checks: [
        {
          ok: hasKeywords(
            `${input.successMetrics} ${input.questionnaireAnswers['test-proof'] || ''} ${input.questionnaireAnswers['failure-modes'] || ''}`,
            ['test', 'smoke', 'review', 'acceptance', 'edge', 'failure', 'proof', 'validate']
          ),
          points: 4,
          reasonLost: 'The package does not yet show how the plan would be verified.',
          improvement: 'State what should be tested, reviewed, or proven before coding proceeds.'
        },
        {
          ok: (input.questionnaireAnswers['failure-modes'] || '').trim().length > 0 || (input.questionnaireAnswers['test-proof'] || '').trim().length > 0,
          points: 3,
          reasonLost: 'Failure-path or test-proof thinking is still missing.',
          improvement: 'Add a failure-mode or testing answer that names concrete review checks.'
        },
        {
          ok: criticalCritiqueCount === 0,
          points: 3,
          reasonLost: 'Critical critique issues remain, so the package is not test-ready.',
          improvement: 'Resolve the critical critique items before trusting the package.'
        }
      ]
    }),
    scoreCategory({
      key: 'handoff-completeness',
      label: 'Handoff completeness',
      max: 8,
      checks: [
        {
          ok: Boolean(input.productName.trim() && input.level && input.track),
          points: 2,
          reasonLost: 'The package identity or selected mode is incomplete.',
          improvement: 'Confirm the project name, experience level, and orientation.'
        },
        {
          ok: questionnaire.length === 0 || answeredCount === questionnaire.length,
          points: 3,
          reasonLost: 'Some required questionnaire answers are still missing.',
          improvement: 'Complete the remaining required questionnaire answers.'
        },
        {
          ok: importantCritiqueCount <= 2,
          points: 3,
          reasonLost: 'Too many important critique issues are still unresolved.',
          improvement: 'Reduce the important critique list before handoff.'
        }
      ]
    })
  ];

  const total = categories.reduce((sum, category) => sum + category.score, 0);
  const blockers: string[] = [];
  const recommendations = Array.from(
    new Set(categories.flatMap((category) => category.improvements).concat(critique.map((item) => item.followUpQuestion)))
  ).slice(0, 8);

  if (categories.find((category) => category.key === 'problem-clarity')?.score! < 8) {
    blockers.push('Problem framing is not clear enough for build handoff.');
  }
  if (categories.find((category) => category.key === 'workflow-clarity')?.score! < 8) {
    blockers.push('Workflow clarity is too weak to support phase-by-phase delivery.');
  }
  if (categories.find((category) => category.key === 'handoff-completeness')?.score! < 5) {
    blockers.push('Required handoff information is still missing.');
  }
  if (criticalCritiqueCount > 0) {
    blockers.push('Critical critique items remain unresolved.');
  }

  const rating =
    total >= 88 && blockers.length === 0
      ? 'Strong handoff'
      : total >= 72 && blockers.length <= 1
        ? 'Build ready'
        : total >= 52
          ? 'Needs work'
          : 'Not ready';

  return {
    categories,
    total,
    rating,
    blockers,
    recommendations
  };
}
