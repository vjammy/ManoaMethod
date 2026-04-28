import type { LifecycleStatus, ProjectBundle, ProjectInput, QuestionnaireItem, WarningItem } from './types';

export type WorkflowStepId =
  | 'project-brief'
  | 'mode-selection'
  | 'business-questions'
  | 'technical-questions'
  | 'risk-review'
  | 'phase-plan'
  | 'approval-gate'
  | 'export-package';

export type WorkflowStepStatus = 'Complete' | 'Needs attention' | 'Blocked';

export type WorkflowStep = {
  id: WorkflowStepId;
  title: string;
  description: string;
  status: WorkflowStepStatus;
  warnings: WarningItem[];
  nextAction: string;
};

const STEP_ORDER: WorkflowStepId[] = [
  'project-brief',
  'mode-selection',
  'business-questions',
  'technical-questions',
  'risk-review',
  'phase-plan',
  'approval-gate',
  'export-package'
];

const STEP_META: Record<WorkflowStepId, { title: string; description: string }> = {
  'project-brief': {
    title: 'Project Brief',
    description: 'Define the problem, audience, scope, constraints, and desired handoff.'
  },
  'mode-selection': {
    title: 'Mode Selection',
    description: 'Choose the experience level and business or technical orientation.'
  },
  'business-questions': {
    title: 'Business Questions',
    description: 'Clarify value, users, workflows, adoption, and stakeholder expectations.'
  },
  'technical-questions': {
    title: 'Technical Questions',
    description: 'Clarify boundaries, failure modes, testing, deployment, and technical guardrails.'
  },
  'risk-review': {
    title: 'Risk Review',
    description: 'Review critique, contradictions, risks, and readiness gaps before phase work.'
  },
  'phase-plan': {
    title: 'Phase Plan',
    description: 'Inspect phases, entry criteria, exit gates, and checklist depth.'
  },
  'approval-gate': {
    title: 'Approval Gate',
    description: 'Review lifecycle status, blockers, assumptions, and human approval signals.'
  },
  'export-package': {
    title: 'Export Package',
    description: 'Export the draft package any time, and only export build-ready after approval.'
  }
};

function hasText(value: string) {
  return Boolean(value.trim());
}

const BUSINESS_QUESTION_IDS = new Set([
  'north-star',
  'primary-workflow',
  'customer-pain',
  'business-proof',
  'user-segments',
  'stakeholder-workflow',
  'monetization',
  'adoption-risks'
]);

const TECHNICAL_QUESTION_IDS = new Set([
  'north-star',
  'primary-workflow',
  'repo-shape',
  'test-proof',
  'data-boundaries',
  'deployment-guardrails',
  'failure-modes',
  'observability',
  'scaling-risk'
]);

function isBriefIncomplete(input: ProjectInput) {
  return ![
    input.productName,
    input.productIdea,
    input.targetAudience,
    input.problemStatement,
    input.constraints,
    input.desiredOutput,
    input.mustHaveFeatures
  ].every(hasText);
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function mapWarningToStep(warning: WarningItem): WorkflowStepId {
  const haystack = [warning.id, warning.title, warning.message, warning.action, warning.openQuestion || '']
    .join(' ')
    .toLowerCase();

  if (includesAny(haystack, [/approval/, /approver/, /approved/, /review checklist/])) {
    return 'approval-gate';
  }
  if (
    includesAny(haystack, [
      /product idea/,
      /problem statement/,
      /target user/,
      /target audience/,
      /audience/,
      /must-have/,
      /brief/,
      /desired output/,
      /constraints?/
    ])
  ) {
    return 'project-brief';
  }
  if (includesAny(haystack, [/profile/, /mode selection/, /experience level/, /orientation/])) {
    return 'mode-selection';
  }
  if (
    includesAny(haystack, [
      /customer/,
      /business/,
      /stakeholder/,
      /monetization/,
      /adoption/,
      /user segments?/,
      /workflow/
    ])
  ) {
    return 'business-questions';
  }
  if (
    includesAny(haystack, [
      /technical/,
      /auth/,
      /security/,
      /deployment/,
      /test/,
      /repo/,
      /data boundaries?/,
      /interfaces?/,
      /integrations?/,
      /failure modes?/,
      /observability/,
      /scaling/
    ])
  ) {
    return 'technical-questions';
  }
  if (includesAny(haystack, [/risk/, /contradiction/, /readiness/, /score/, /scope-cut/, /operating/])) {
    return 'risk-review';
  }
  if (includesAny(haystack, [/phase/, /gate/, /acceptance criteria/, /handoff/, /checklist/])) {
    return 'phase-plan';
  }

  return warning.source === 'brief'
    ? 'project-brief'
    : warning.source === 'questionnaire'
      ? 'business-questions'
      : warning.source === 'approval'
        ? 'approval-gate'
        : warning.source === 'score'
          ? 'risk-review'
          : 'phase-plan';
}

export function canApproveForBuild(bundle: ProjectBundle) {
  return bundle.blockingWarnings.length === 0 && bundle.lifecycleStatus === 'ReviewReady';
}

export function canExportBuildReady(bundle: ProjectBundle) {
  return (
    bundle.lifecycleStatus === 'ApprovedForBuild' &&
    bundle.approvedForBuild &&
    bundle.blockingWarnings.length === 0
  );
}

export function mapQuestionToStep(item: QuestionnaireItem): WorkflowStepId {
  if (BUSINESS_QUESTION_IDS.has(item.id)) return 'business-questions';
  if (TECHNICAL_QUESTION_IDS.has(item.id)) return 'technical-questions';
  if (item.id === 'operating-risks' || item.id === 'scope-cut' || item.id === 'acceptance') return 'risk-review';
  return 'business-questions';
}

function getStepStatus(warnings: WarningItem[], fallbackNeedsAttention: boolean) {
  if (warnings.some((warning) => warning.severity === 'blocker')) return 'Blocked' as WorkflowStepStatus;
  if (warnings.length || fallbackNeedsAttention) return 'Needs attention' as WorkflowStepStatus;
  return 'Complete' as WorkflowStepStatus;
}

function getLifecycleNextAction(status: LifecycleStatus) {
  if (status === 'Blocked') return 'Resolve blocker warnings before asking for approval.';
  if (status === 'Draft') return 'Close the remaining planning warnings so the package can move into formal review.';
  if (status === 'ReviewReady') return 'Complete the approval checklist and record an approval decision if the package is ready for build.';
  return 'Build-ready export is available because the package has explicit approval metadata and no blockers.';
}

export function buildWorkflowSteps(input: ProjectInput, bundle: ProjectBundle): WorkflowStep[] {
  const warningMap = new Map<WorkflowStepId, WarningItem[]>();

  for (const stepId of STEP_ORDER) {
    warningMap.set(stepId, []);
  }

  for (const warning of bundle.warnings) {
    warningMap.get(mapWarningToStep(warning))?.push(warning);
  }

  const businessWarnings = warningMap.get('business-questions') || [];
  const technicalWarnings = warningMap.get('technical-questions') || [];
  const approvalWarnings = warningMap.get('approval-gate') || [];

  const businessQuestions = bundle.questionnaire.filter((item) => mapQuestionToStep(item) === 'business-questions');
  const technicalQuestions = bundle.questionnaire.filter((item) => mapQuestionToStep(item) === 'technical-questions');
  const businessStepNeedsAttention = businessQuestions.some(
    (item) => item.required && !hasText(input.questionnaireAnswers[item.id] || '')
  );
  const technicalStepNeedsAttention = technicalQuestions.some(
    (item) => item.required && !hasText(input.questionnaireAnswers[item.id] || '')
  );
  const approvalStepNeedsAttention = bundle.lifecycleStatus !== 'ApprovedForBuild';

  return STEP_ORDER.map((id) => {
    const warnings = warningMap.get(id) || [];
    let fallbackNeedsAttention = false;
    let nextAction = warnings[0]?.action || 'Continue working through the planning flow.';

    if (id === 'project-brief') {
      fallbackNeedsAttention = isBriefIncomplete(input);
      if (fallbackNeedsAttention && !warnings.length) {
        nextAction = 'Fill the missing brief fields before moving deeper into the package.';
      }
    } else if (id === 'mode-selection') {
      fallbackNeedsAttention = !input.level || !input.track;
      if (fallbackNeedsAttention && !warnings.length) {
        nextAction = 'Select an experience level and orientation before continuing.';
      }
    } else if (id === 'business-questions') {
      fallbackNeedsAttention = businessStepNeedsAttention || (input.track === 'business' && businessWarnings.length > 0);
      if (!warnings.length) {
        nextAction =
          input.track === 'technical'
            ? 'Review any business assumptions even if the primary mode is technical.'
            : 'Answer the business-oriented questions that shape user value and approval criteria.';
      }
    } else if (id === 'technical-questions') {
      fallbackNeedsAttention =
        technicalStepNeedsAttention || (input.track === 'technical' && technicalWarnings.length > 0);
      if (!warnings.length) {
        nextAction =
          input.track === 'business'
            ? 'Review technical assumptions that could still block the handoff.'
            : 'Answer the technical boundary, testing, and deployment questions before approval.';
      }
    } else if (id === 'risk-review') {
      fallbackNeedsAttention = bundle.score.blockers.length > 0 || warnings.length > 0;
      if (!warnings.length) {
        nextAction = 'Review the critique and scorecard to confirm the package still matches the brief.';
      }
    } else if (id === 'phase-plan') {
      fallbackNeedsAttention = warnings.length > 0;
      if (!warnings.length) {
        nextAction = 'Walk the phase gates in order and confirm the sequence still fits the project scope.';
      }
    } else if (id === 'approval-gate') {
      fallbackNeedsAttention = approvalStepNeedsAttention || approvalWarnings.length > 0;
      nextAction = getLifecycleNextAction(bundle.lifecycleStatus);
    } else if (id === 'export-package') {
      fallbackNeedsAttention = !canExportBuildReady(bundle);
      nextAction = canExportBuildReady(bundle)
        ? 'Export the approved-for-build package and hand it to the builder.'
        : 'Export the draft package for review now, then finish approval before requesting a build-ready export.';
    }

    const status =
      id === 'approval-gate' && bundle.blockingWarnings.length > 0
        ? ('Blocked' as WorkflowStepStatus)
        : id === 'export-package' && canExportBuildReady(bundle)
          ? ('Complete' as WorkflowStepStatus)
          : getStepStatus(warnings, fallbackNeedsAttention);

    return {
      id,
      title: STEP_META[id].title,
      description: STEP_META[id].description,
      status,
      warnings,
      nextAction
    };
  });
}
