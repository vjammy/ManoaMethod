import { scoreProject } from './scoring';
import { buildQuestionPrompts, getProfileConfig, slugify } from './templates';
import type {
  CritiqueItem,
  GeneratedFile,
  LifecycleStatus,
  PhasePlan,
  ProfileConfig,
  ProjectBundle,
  ProjectInput,
  QuestionnaireItem,
  WarningItem,
  WarningSeverity,
  XeleraState
} from './types';

type PhaseBlueprint = {
  tag:
    | 'brief'
    | 'audience'
    | 'workflow'
    | 'scope'
    | 'business-value'
    | 'stakeholders'
    | 'operations'
    | 'data'
    | 'architecture'
    | 'testing'
    | 'deployment'
    | 'security'
    | 'observability'
    | 'handoff'
    | 'rollout'
    | 'scaling';
  name: string;
  rationale: string;
  primaryInputs: string[];
  confirmationPrompts: string[];
};

type ProjectContext = {
  profile: ProfileConfig;
  mustHaves: string[];
  niceToHaves: string[];
  nonGoals: string[];
  constraints: string[];
  risks: string[];
  integrations: string[];
  audienceSegments: string[];
  keywords: string[];
  answers: Record<string, string>;
  primaryAudience: string;
  primaryFeature: string;
  secondaryFeature: string;
  outputAnchor: string;
  workflowAnchor: string;
  riskAnchor: string;
  acceptanceAnchor: string;
  inferredAssumptions: string[];
};

type AgentName = 'Codex' | 'Claude Code' | 'OpenCode';
const DEFAULT_EXPORT_ROOT = 'xelera-method-workspace';

function ensureTrailingNewline(value: string) {
  return `${value.trim()}\n`;
}

function splitItems(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function listToBullets(items: string[], fallback: string) {
  const finalItems = items.length ? items : [fallback];
  return finalItems.map((item) => `- ${item}`).join('\n');
}

function truncateText(value: string, maxWords: number) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= maxWords) return value.trim();
  return `${parts.slice(0, maxWords).join(' ')}...`;
}

function normalizeTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function extractKeywords(input: ProjectInput) {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'that',
    'with',
    'from',
    'into',
    'this',
    'will',
    'have',
    'your',
    'their',
    'then',
    'than',
    'what',
    'when',
    'where',
    'must',
    'should',
    'using',
    'before',
    'after',
    'build',
    'ready',
    'first',
    'product',
    'project',
    'users',
    'teams'
  ]);

  const source = [
    input.productName,
    input.productIdea,
    input.targetAudience,
    input.problemStatement,
    input.desiredOutput,
    input.mustHaveFeatures
  ].join(' ');

  const counts = new Map<string, number>();
  for (const token of normalizeTokens(source)) {
    if (token.length < 4 || stopWords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function findContradictions(input: ProjectInput) {
  const mustHaves = input.mustHaveFeatures.toLowerCase();
  const nonGoals = input.nonGoals.toLowerCase();
  const contradictions: Array<{ topic: string; message: string }> = [];

  const topics = ['auth', 'payment', 'database', 'collaboration', 'integration', 'storage'];
  for (const topic of topics) {
    if (mustHaves.includes(topic) && nonGoals.includes(topic)) {
      contradictions.push({
        topic,
        message: `The current scope says ${topic} is both required and out of scope.`
      });
    }
  }

  if (input.desiredOutput.toLowerCase().includes('zip') && !input.mustHaveFeatures.toLowerCase().includes('zip')) {
    contradictions.push({
      topic: 'zip-export',
      message: 'The desired output expects an exported package, but must-have scope does not mention export or zip behavior.'
    });
  }

  return contradictions;
}

function buildContext(input: ProjectInput): ProjectContext {
  const profile = getProfileConfig(input);
  const mustHaves = splitItems(input.mustHaveFeatures);
  const niceToHaves = splitItems(input.niceToHaveFeatures);
  const nonGoals = splitItems(input.nonGoals);
  const constraints = splitItems(input.constraints);
  const risks = splitItems(input.risks);
  const integrations = splitItems(input.dataAndIntegrations);
  const audienceSegments = splitItems(input.targetAudience);
  const answers = input.questionnaireAnswers;
  const keywords = extractKeywords(input);

  const inferredAssumptions: string[] = [];
  if (!integrations.length) {
    inferredAssumptions.push('Inferred assumption: the first release does not depend on external integrations beyond local file generation.');
  }
  if (!nonGoals.length) {
    inferredAssumptions.push('Please review and confirm: non-goals are not yet explicit, so scope drift risk remains high.');
  }
  if (profile.key.endsWith('technical') && !answers['data-boundaries']) {
    inferredAssumptions.push('Please review and confirm: the data and interface boundaries are still being inferred from the brief rather than from an explicit answer.');
  }
  if (profile.key.startsWith('advanced') && profile.key.endsWith('business') && !answers.monetization) {
    inferredAssumptions.push('Please review and confirm: the business value and operating model are inferred rather than explicitly justified.');
  }

  return {
    profile,
    mustHaves,
    niceToHaves,
    nonGoals,
    constraints,
    risks,
    integrations,
    audienceSegments,
    keywords,
    answers,
    primaryAudience: audienceSegments[0] || 'the primary target user',
    primaryFeature: mustHaves[0] || truncateText(input.desiredOutput, 8) || input.productName,
    secondaryFeature: mustHaves[1] || truncateText(input.productIdea, 8),
    outputAnchor: truncateText(input.desiredOutput || input.productIdea, 10),
    workflowAnchor: truncateText(answers['primary-workflow'] || input.desiredOutput, 12),
    riskAnchor: truncateText(answers['operating-risks'] || input.risks, 12),
    acceptanceAnchor: truncateText(answers.acceptance || input.successMetrics, 12),
    inferredAssumptions
  };
}

function buildQuestionnaire(input: ProjectInput): QuestionnaireItem[] {
  return buildQuestionPrompts(getProfileConfig(input));
}

function normalizeIdPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function mapCritiqueSeverityToWarningSeverity(severity: CritiqueItem['severity']): WarningSeverity {
  if (severity === 'critical') return 'blocker';
  if (severity === 'important') return 'warning';
  return 'info';
}

function createWarning(warning: WarningItem): WarningItem {
  return warning;
}

function dedupeWarnings(warnings: WarningItem[]) {
  const byId = new Map<string, WarningItem>();
  const severityRank: Record<WarningSeverity, number> = { info: 1, warning: 2, blocker: 3 };

  for (const warning of warnings) {
    const existing = byId.get(warning.id);
    if (!existing) {
      byId.set(warning.id, warning);
      continue;
    }

    const merged: WarningItem =
      severityRank[warning.severity] > severityRank[existing.severity]
        ? { ...warning, openQuestion: warning.openQuestion || existing.openQuestion, assumption: warning.assumption || existing.assumption }
        : {
            ...existing,
            openQuestion: existing.openQuestion || warning.openQuestion,
            assumption: existing.assumption || warning.assumption
          };
    byId.set(warning.id, merged);
  }

  return Array.from(byId.values());
}

function getCriticalQuestionIds(profile: ProfileConfig) {
  const base = ['north-star', 'primary-workflow', 'scope-cut', 'acceptance', 'operating-risks'];
  if (profile.key.endsWith('technical')) base.push('data-boundaries');
  if (profile.key === 'advanced-technical') {
    base.push('observability', 'scaling-risk');
  }
  if (profile.key === 'advanced-business') {
    base.push('monetization', 'adoption-risks');
  }
  if (profile.key === 'beginner-business') {
    base.push('customer-pain', 'business-proof');
  }
  if (profile.key === 'beginner-technical') {
    base.push('repo-shape', 'test-proof');
  }
  if (profile.key === 'intermediate-business') {
    base.push('user-segments', 'stakeholder-workflow');
  }
  if (profile.key === 'intermediate-technical') {
    base.push('deployment-guardrails', 'test-proof');
  }
  return Array.from(new Set(base));
}

function getMissingCriticalAnswers(input: ProjectInput, questionnaire: QuestionnaireItem[], context: ProjectContext) {
  const criticalIds = new Set(getCriticalQuestionIds(context.profile));
  return questionnaire
    .filter((item) => criticalIds.has(item.id))
    .filter((item) => !(input.questionnaireAnswers[item.id] || '').trim())
    .map((item) => item.prompt);
}

function getWeakAnswerWarnings(input: ProjectInput, questionnaire: QuestionnaireItem[], context: ProjectContext) {
  const warnings: WarningItem[] = [];

  if (wordCount(input.productIdea) < 16) {
    warnings.push(
      createWarning({
        id: 'weak-product-idea',
        severity: 'warning',
        title: 'Product idea is still thin',
        message: `The product idea for ${input.productName} is still short enough that later package details may rely on inference.`,
        action: 'Add more concrete user and outcome detail to the brief before review.',
        source: 'brief',
        openQuestion: 'What exact change should this product create for the user between project start and successful completion?'
      })
    );
  }
  if (wordCount(input.problemStatement) < 16) {
    warnings.push(
      createWarning({
        id: 'weak-problem-statement',
        severity: 'warning',
        title: 'Problem consequence is weak',
        message: `The problem statement does not yet fully explain why ${context.primaryAudience} feels the pain strongly enough to prioritize this work.`,
        action: 'Clarify the consequence and urgency of the problem in the brief.',
        source: 'brief',
        openQuestion: `What specifically breaks today for ${context.primaryAudience}, and what is the cost of leaving it unresolved?`
      })
    );
  }
  if (context.mustHaves.length < 4) {
    warnings.push(
      createWarning({
        id: 'narrow-must-have-scope',
        severity: 'info',
        title: 'Must-have scope is still narrow',
        message: `The must-have scope for ${input.productName} is still narrow, so later phases may under-specify acceptance criteria.`,
        action: 'Confirm whether the must-have list is intentionally minimal or still incomplete.',
        source: 'generator'
      })
    );
  }

  for (const item of questionnaire) {
    const answer = (input.questionnaireAnswers[item.id] || '').trim();
    if (!answer) continue;
    if (wordCount(answer) < 8) {
      warnings.push(
        createWarning({
          id: `weak-answer-${normalizeIdPart(item.id)}`,
          severity: 'warning',
          title: `Answer is still short: ${item.intent}`,
          message: `The answer for "${item.prompt}" is short enough that later package details may still be inferred.`,
          action: 'Expand the answer with more concrete evidence, examples, or scope detail.',
          source: 'questionnaire',
          openQuestion: item.prompt
        })
      );
    }
  }

  return warnings;
}

function buildWarnings(
  input: ProjectInput,
  questionnaire: QuestionnaireItem[],
  critique: CritiqueItem[],
  context: ProjectContext,
  score: ReturnType<typeof scoreProject>
) {
  const missingCriticalAnswers = getMissingCriticalAnswers(input, questionnaire, context);
  const warnings: WarningItem[] = [];

  for (const missing of missingCriticalAnswers) {
    warnings.push(
      createWarning({
        id: `missing-critical-${normalizeIdPart(missing)}`,
        severity: 'blocker',
        title: 'Critical answer missing',
        message: `A critical planning answer is still missing: ${missing}`,
        action: 'Answer this question before treating the package as ready for formal review.',
        source: 'questionnaire',
        openQuestion: missing
      })
    );
  }

  for (const critiqueItem of critique) {
    warnings.push(
      createWarning({
        id: `critique-${normalizeIdPart(critiqueItem.title)}`,
        severity: mapCritiqueSeverityToWarningSeverity(critiqueItem.severity),
        title: critiqueItem.title,
        message: critiqueItem.detail,
        action: critiqueItem.followUpQuestion,
        source: 'critique',
        openQuestion: critiqueItem.followUpQuestion,
        assumption: critiqueItem.signal === 'inferred-assumption' ? critiqueItem.detail : undefined
      })
    );
  }

  warnings.push(...getWeakAnswerWarnings(input, questionnaire, context));

  for (const blocker of score.blockers) {
    warnings.push(
      createWarning({
        id: `score-blocker-${normalizeIdPart(blocker)}`,
        severity: 'blocker',
        title: 'Readiness blocker',
        message: blocker,
        action: 'Resolve this blocker before treating the package as build-capable.',
        source: 'score'
      })
    );
  }

  for (const category of score.categories) {
    if (category.score === category.max) continue;
    warnings.push(
      createWarning({
        id: `score-category-${normalizeIdPart(category.key)}`,
        severity: category.score <= Math.floor(category.max / 2) ? 'warning' : 'info',
        title: `${category.label} needs attention`,
        message: category.reasonsLost[0] || `${category.label} lost points.`,
        action: category.improvements[0] || 'Improve this category before final review.',
        source: 'score'
      })
    );
  }

  const approvalDecision = (input.questionnaireAnswers['approval-decision'] || '').trim();
  const approvalChecklistComplete = (input.questionnaireAnswers['approval-checklist-complete'] || '').trim().toLowerCase();
  if (!approvalDecision) {
    warnings.push(
      createWarning({
        id: 'approval-decision-missing',
        severity: 'info',
        title: 'Approval decision not recorded',
        message: 'The package has not yet recorded a human approval decision.',
        action: 'Use the approval gate to record whether the package is ready for build or still under review.',
        source: 'approval',
        openQuestion: 'Who is responsible for approving this package for build, and what decision did they make?'
      })
    );
  }
  if (approvalChecklistComplete !== 'true') {
    warnings.push(
      createWarning({
        id: 'approval-checklist-incomplete',
        severity: 'info',
        title: 'Approval checklist not complete',
        message: 'The human approval checklist has not been marked complete yet.',
        action: 'Review the approval gate checklist before treating the package as build-ready.',
        source: 'approval',
        openQuestion: 'Has a reviewer confirmed that blockers, warnings, assumptions, and phase gates have been checked?'
      })
    );
  }

  return dedupeWarnings(warnings);
}

function buildAssumptionsAndOpenQuestions(warnings: WarningItem[], context: ProjectContext) {
  const assumptions = Array.from(
    new Set(
      context.inferredAssumptions.concat(warnings.map((warning) => warning.assumption).filter(Boolean) as string[])
    )
  );

  const openQuestions = Array.from(
    new Set(warnings.map((warning) => warning.openQuestion).filter(Boolean) as string[])
  );

  return { assumptions, openQuestions };
}

function deriveLifecycleStatus(options: {
  warnings: WarningItem[];
  scoreTotal: number;
  approvedForBuild: boolean;
}) {
  if (options.warnings.some((warning) => warning.severity === 'blocker')) return 'Blocked' as LifecycleStatus;
  const reviewReady =
    options.scoreTotal >= 88 && options.warnings.every((warning) => warning.severity === 'info');
  if (reviewReady && options.approvedForBuild) return 'ApprovedForBuild' as LifecycleStatus;
  if (reviewReady) return 'ReviewReady' as LifecycleStatus;
  return 'Draft' as LifecycleStatus;
}

function getApprovalFlags(input: ProjectInput) {
  const approvalDecision = (input.questionnaireAnswers['approval-decision'] || '').trim().toLowerCase();
  const approvalChecked = (input.questionnaireAnswers['approval-checklist-complete'] || '').trim().toLowerCase();
  const approvedForBuild =
    approvalDecision === 'approvedforbuild' ||
    approvalDecision === 'approved-for-build' ||
    (approvalDecision === 'approved' && approvalChecked === 'true');

  return {
    approvalRequired: true,
    approvedForBuild
  };
}

function getLifecycleSummary(status: LifecycleStatus) {
  switch (status) {
    case 'ApprovedForBuild':
      return 'The package has explicit approval metadata and can be treated as approved for build execution.';
    case 'ReviewReady':
      return 'The package is complete enough for formal human review, but it is not yet explicitly approved for build execution.';
    case 'Blocked':
      return 'The package is blocked by unresolved blocker warnings, missing critical answers, or failed readiness conditions.';
    default:
      return 'The package is still in draft form. It can be exported for review, but it should not be treated as build-approved.';
  }
}

function buildCritique(input: ProjectInput, questionnaire: QuestionnaireItem[], context: ProjectContext): CritiqueItem[] {
  const critique: CritiqueItem[] = [];
  const contradictions = findContradictions(input);

  if (wordCount(input.productIdea) < 12) {
    critique.push({
      severity: 'critical',
      title: 'Product idea is still too abstract',
      detail: `Please review and confirm: the current idea statement is too thin to drive project-specific phases for ${input.productName}.`,
      followUpQuestion: 'What exact change should this product create for the user between project start and successful completion?',
      signal: 'needs-user-confirmation'
    });
  }

  if (wordCount(input.problemStatement) < 12 || !/(because|causes|creates|delays|costs|blocks|slows)/i.test(input.problemStatement)) {
    critique.push({
      severity: 'critical',
      title: 'Problem statement lacks consequence',
      detail: `Please review and confirm: the brief names the problem, but it does not clearly describe why ${context.primaryAudience} feels the pain strongly enough to justify this build.`,
      followUpQuestion: `What specifically breaks today for ${context.primaryAudience}, and what is the cost of leaving it unresolved?`,
      signal: 'needs-user-confirmation'
    });
  }

  if (context.audienceSegments.length < 2 && !input.questionnaireAnswers['user-segments']) {
    critique.push({
      severity: 'important',
      title: 'Audience is not prioritized enough',
      detail: `Based on your answers so far: the brief references ${context.primaryAudience}, but it does not clearly separate the primary audience from secondary reviewers or stakeholders.`,
      followUpQuestion: 'Which audience matters first, and who else only needs to review or approve the handoff?',
      signal: 'generated-from-current-input'
    });
  }

  if (!input.questionnaireAnswers['scope-cut'] || !/(defer|cut|remove|later|future|keep)/i.test(input.questionnaireAnswers['scope-cut'])) {
    critique.push({
      severity: 'important',
      title: 'Scope-cut logic is weak',
      detail: `Please review and confirm: the current package does not yet show what gets removed if ${input.productName} has less time than expected.`,
      followUpQuestion: 'If the schedule tightens, which capabilities stay in v1 and which are explicitly deferred?',
      signal: 'needs-user-confirmation'
    });
  }

  if (context.profile.key.endsWith('technical') && !input.questionnaireAnswers['data-boundaries']) {
    critique.push({
      severity: context.profile.key === 'advanced-technical' ? 'critical' : 'important',
      title: 'Technical boundaries are still inferred',
      detail: `Inferred assumption: the generator is inferring data, API, or integration boundaries for ${input.productName} from the brief instead of from an explicit technical answer.`,
      followUpQuestion: 'Which entities, interfaces, integrations, or file boundaries must be explicit before coding begins?',
      signal: 'inferred-assumption'
    });
  }

  if (context.profile.key === 'advanced-business' && !input.questionnaireAnswers.monetization) {
    critique.push({
      severity: 'important',
      title: 'Business value proof is still inferred',
      detail: `Inferred assumption: the package can describe ${input.productName}, but it cannot yet justify the business value, operating leverage, or monetization logic with confidence.`,
      followUpQuestion: 'How does this MVP create measurable business value, revenue potential, or operating leverage?',
      signal: 'inferred-assumption'
    });
  }

  if (context.profile.key === 'advanced-technical' && !input.questionnaireAnswers.observability) {
    critique.push({
      severity: 'important',
      title: 'Observability gates are not explicit',
      detail: `Please review and confirm: advanced technical mode expects launch visibility, but the package does not yet say how ${input.productName} should be monitored or supported after release.`,
      followUpQuestion: 'What observability or support signals should exist before the build is called handoff-ready?',
      signal: 'needs-user-confirmation'
    });
  }

  for (const contradiction of contradictions) {
    critique.push({
      severity: 'critical',
      title: `Scope contradiction: ${contradiction.topic}`,
      detail: `Based on your answers so far: ${contradiction.message}`,
      followUpQuestion: `Which version is correct for ${contradiction.topic}: required in v1 or explicitly out of scope?`,
      signal: 'generated-from-current-input'
    });
  }

  for (const question of questionnaire) {
    if (!(input.questionnaireAnswers[question.id] || '').trim()) {
      critique.push({
        severity: 'important',
        title: `Questionnaire answer missing: ${sentenceCase(question.id.replace(/-/g, ' '))}`,
        detail: `Please review and confirm: ${question.intent} is still missing, so later phases are being partially inferred.`,
        followUpQuestion: question.prompt,
        signal: 'needs-user-confirmation'
      });
    }
  }

  return critique;
}

function buildPhaseBlueprints(input: ProjectInput, context: ProjectContext, critique: CritiqueItem[]): PhaseBlueprint[] {
  const common: PhaseBlueprint[] = [
    {
      tag: 'brief',
      name: `${input.productName} brief and planning guardrails`,
      rationale: `Lock the problem, audience, constraints, and output expectations for ${input.productName} before build work starts.`,
      primaryInputs: [input.productIdea, input.problemStatement, input.desiredOutput],
      confirmationPrompts: ['Is the brief specific enough to survive without chat history?']
    },
    {
      tag: 'audience',
      name: `${context.primaryAudience} user, customer, and stakeholder map`,
      rationale: `Clarify who ${input.productName} serves first and who else influences approval or rollout.`,
      primaryInputs: [input.targetAudience, context.answers['user-segments'] || '', context.answers['stakeholder-workflow'] || ''],
      confirmationPrompts: ['Which audience matters first, and which stakeholders only review or approve?']
    },
    {
      tag: 'workflow',
      name: `${input.productName} workflow and failure-path plan`,
      rationale: `Map the core path, support path, and failure path for ${context.primaryAudience}.`,
      primaryInputs: [context.answers['primary-workflow'] || input.desiredOutput, context.answers['failure-modes'] || context.answers['customer-pain'] || ''],
      confirmationPrompts: ['Where does the workflow fail, stall, or create support load?']
    },
    {
      tag: 'scope',
      name: `MVP scope and non-goals for ${context.primaryFeature}`,
      rationale: `Protect the first release by separating ${context.primaryFeature} from later ideas and optional extras.`,
      primaryInputs: [input.mustHaveFeatures, input.nonGoals, context.answers['scope-cut'] || ''],
      confirmationPrompts: ['If time shrinks, what stays in v1 and what moves out?']
    }
  ];

  const trackSpecific: PhaseBlueprint[] =
    input.track === 'business'
      ? [
          {
            tag: 'business-value',
            name: `Business value proof for ${input.productName}`,
            rationale: `Make the user value, business value, and success metrics explicit for ${input.productName}.`,
            primaryInputs: [input.successMetrics, context.answers['business-proof'] || context.answers.acceptance || '', context.answers.monetization || ''],
            confirmationPrompts: ['What business proof should exist before this handoff is called build-ready?']
          },
          {
            tag: 'stakeholders',
            name: `Stakeholder and adoption gates for ${context.primaryAudience}`,
            rationale: `Document how stakeholders, reviewers, and adopters influence scope, launch, or acceptance.`,
            primaryInputs: [context.answers['stakeholder-workflow'] || '', context.answers['adoption-risks'] || '', input.teamContext],
            confirmationPrompts: ['Who can block adoption even if the implementation works?']
          },
          {
            tag: 'operations',
            name: `Operational guardrails and rollout risks for ${input.productName}`,
            rationale: `Turn trust, support, and rollout risks into explicit business-side gates.`,
            primaryInputs: [input.risks, context.answers['operating-risks'] || '', input.constraints],
            confirmationPrompts: ['Which operating risk should stop launch readiness?']
          }
        ]
      : [
          {
            tag: 'data',
            name: `Data boundaries and integrations for ${context.primaryFeature}`,
            rationale: `Define the data, files, and interfaces that ${input.productName} must create, store, or exchange.`,
            primaryInputs: [input.dataAndIntegrations, context.answers['data-boundaries'] || '', input.constraints],
            confirmationPrompts: ['Which entities, inputs, outputs, or APIs must be explicit before coding?']
          },
          {
            tag: 'architecture',
            name: `Architecture and repo structure for ${input.productName}`,
            rationale: `Translate the current plan into implementation structure, ownership, and repo-level boundaries.`,
            primaryInputs: [context.answers['repo-shape'] || '', input.teamContext, input.mustHaveFeatures],
            confirmationPrompts: ['What repo, file, or module structure should the next builder expect?']
          },
          {
            tag: 'testing',
            name: `Testing and review gates for ${context.primaryFeature}`,
            rationale: `Make testability, review evidence, and regression risk explicit before build handoff.`,
            primaryInputs: [context.answers['test-proof'] || context.answers.acceptance || '', input.successMetrics, context.answers['failure-modes'] || ''],
            confirmationPrompts: ['What should be tested or reviewed first before trusting the implementation?']
          }
        ];

  const sharedClosing: PhaseBlueprint[] = [
    {
      tag: 'rollout',
      name: `Readiness and rollout checks for ${input.productName}`,
      rationale: `Confirm that the current package is ready to leave planning and enter disciplined implementation.`,
      primaryInputs: [input.timeline, input.constraints, input.successMetrics],
      confirmationPrompts: ['What must be true before the next builder should start implementation?']
    },
    {
      tag: 'handoff',
      name: `Final handoff package for ${input.productName}`,
      rationale: `Package the work so another builder can execute it without relying on hidden chat context.`,
      primaryInputs: [input.desiredOutput, input.teamContext, context.acceptanceAnchor],
      confirmationPrompts: ['What would a new builder still need clarified before they can begin?']
    }
  ];

  const advancedExtras: PhaseBlueprint[] =
    input.track === 'business'
      ? [
          {
            tag: 'rollout',
            name: `Operating model, monetization, and adoption proof for ${input.productName}`,
            rationale: `Stress-test the operating model and business proof before implementation creates sunk cost.`,
            primaryInputs: [context.answers.monetization || '', context.answers['adoption-risks'] || '', input.successMetrics],
            confirmationPrompts: ['What evidence proves the business case, not just the feature idea?']
          }
        ]
      : [
          {
            tag: 'security',
            name: `Security and failure-mode gates for ${context.primaryFeature}`,
            rationale: `Convert hidden complexity, failure states, and trust risks into explicit technical gates.`,
            primaryInputs: [context.answers['failure-modes'] || '', context.answers['operating-risks'] || '', input.constraints],
            confirmationPrompts: ['Which failure modes or trust risks would force a design change if unresolved?']
          },
          {
            tag: 'observability',
            name: `Observability and support readiness for ${input.productName}`,
            rationale: `Make sure launch and support risks are visible before implementation begins.`,
            primaryInputs: [context.answers.observability || '', input.risks, input.teamContext],
            confirmationPrompts: ['What should be monitored, logged, or reviewed once the product is in use?']
          },
          {
            tag: 'scaling',
            name: `Scalability and architecture stress points for ${input.productName}`,
            rationale: `Identify the scale, concurrency, or architecture assumptions most likely to cause rework later.`,
            primaryInputs: [context.answers['scaling-risk'] || '', input.constraints, input.dataAndIntegrations],
            confirmationPrompts: ['Which scale or concurrency assumptions need confirmation now instead of after implementation?']
          }
        ];

  const beginnerExtras: PhaseBlueprint[] =
    input.track === 'business'
      ? [
          {
            tag: 'testing',
            name: `Simple acceptance and review checklist for ${input.productName}`,
            rationale: `Create an approachable proof checklist so a non-technical reviewer can decide whether the package is ready.`,
            primaryInputs: [input.successMetrics, context.answers.acceptance || '', input.teamContext],
            confirmationPrompts: ['Could a non-technical reviewer understand what success looks like?']
          }
        ]
      : [
          {
            tag: 'deployment',
            name: `Build order and release checklist for ${input.productName}`,
            rationale: `Create a beginner-friendly repo, testing, and release order for the next technical builder.`,
            primaryInputs: [context.answers['deployment-guardrails'] || '', context.answers['repo-shape'] || '', input.timeline],
            confirmationPrompts: ['What should the next technical builder do first, second, and third?']
          }
        ];

  const intermediateExtras: PhaseBlueprint[] =
    input.track === 'technical'
      ? [
          {
            tag: 'deployment',
            name: `Deployment and release guardrails for ${input.productName}`,
            rationale: `Turn delivery assumptions into concrete environment, release, and rollback gates.`,
            primaryInputs: [context.answers['deployment-guardrails'] || '', input.constraints, input.timeline],
            confirmationPrompts: ['What release assumption would create rework if it stays vague?']
          }
        ]
      : [];

  let phases = [...common, ...trackSpecific];

  if (input.level === 'beginner') phases = [...phases, ...beginnerExtras];
  if (input.level === 'intermediate') phases = [...phases, ...intermediateExtras];
  if (input.level === 'advanced') phases = [...phases, ...advancedExtras];

  phases = [...phases, ...sharedClosing];

  if (critique.length > 6) {
    phases.splice(
      phases.length - 1,
      0,
      {
        tag: 'scope',
        name: `Open questions and unresolved blockers for ${input.productName}`,
        rationale: `Document the gaps that should be closed before the final handoff is trusted.`,
        primaryInputs: critique.map((item) => item.title),
        confirmationPrompts: ['Which critique items must be resolved before handoff?']
      }
    );
  }

  while (phases.length < context.profile.minimumPhaseCount) {
    phases.splice(
      phases.length - 1,
      0,
      {
        tag: 'handoff',
        name: `${input.productName} package review checkpoint ${phases.length - context.profile.minimumPhaseCount + 2}`,
        rationale: `Add an extra review checkpoint because ${context.profile.label} expects more disciplined package quality.`,
        primaryInputs: [context.acceptanceAnchor, context.workflowAnchor, context.riskAnchor],
        confirmationPrompts: ['What still needs confirmation before the next review checkpoint passes?']
      }
    );
  }

  return phases.slice(0, Math.max(context.profile.minimumPhaseCount, Math.min(phases.length, 15)));
}

function buildPhaseEntryCriteria(index: number, blueprint: PhaseBlueprint, input: ProjectInput, context: ProjectContext) {
  if (index === 1) {
    return [
      'Project brief exists.',
      'User profile selected.',
      'Business or technical orientation selected.',
      'Initial problem statement captured.',
      'Target user or customer captured.',
      'Known constraints captured.',
      'Output expectations captured.'
    ];
  }

  return [
    'Previous phase handoff complete.',
    'Previous exit gate passed.',
    'Unresolved blockers documented.',
    'Scope changes recorded.',
    `Based on the project information provided: the source material for "${blueprint.name}" is present in the package.`
  ];
}

function buildPhaseExitCriteria(blueprint: PhaseBlueprint, context: ProjectContext) {
  return [
    `Based on your answers so far: the phase now reflects ${context.primaryFeature} and ${context.primaryAudience} rather than generic planning language.`,
    `Please review and confirm: any remaining uncertainty for "${blueprint.name}" is explicitly recorded before the phase closes.`,
    `Inferred assumption: no hidden assumptions remain unlabelled around ${context.outputAnchor}.`,
    `${context.profile.gateStrength}`
  ];
}

function buildPhaseContent(
  blueprint: PhaseBlueprint,
  index: number,
  input: ProjectInput,
  context: ProjectContext,
  critique: CritiqueItem[]
): PhasePlan {
  const generatedFromInput = Array.from(
    new Set(
      blueprint.primaryInputs
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => `Based on your answers so far: ${truncateText(item, 18)}`)
    )
  ).slice(0, 4);

  const needsConfirmation = Array.from(
    new Set(
      blueprint.confirmationPrompts.map((item) => `Please review and confirm: ${item}`)
    )
  );

  const inferredAssumptions = Array.from(
    new Set(
      context.inferredAssumptions.concat(
        critique
          .slice(0, 2)
          .map((item) => `${item.signal === 'inferred-assumption' ? 'Inferred assumption' : 'Please review and confirm'}: ${item.followUpQuestion}`)
      )
    )
  ).slice(0, 4);

  const businessSpecific =
    input.track === 'business'
      ? `Keep the business-side validation anchored to ${context.profile.businessFocus}.`
      : `Translate business expectations into engineering-ready proof for ${context.primaryAudience}.`;

  const technicalSpecific =
    input.track === 'technical'
      ? `Use ${context.profile.technicalFocus} to decide whether the package is implementation-ready.`
      : `Only add technical detail when it protects the business outcome or reduces delivery risk.`;

  const entryCriteria = buildPhaseEntryCriteria(index, blueprint, input, context);
  const exitCriteria = buildPhaseExitCriteria(blueprint, context);
  const riskFocus = [
    `Based on your answers so far: ${truncateText(input.risks, 18)}`,
    `Based on your answers so far: ${truncateText(context.riskAnchor, 18)}`
  ];
  const nextActions = [
    `Confirm the open questions for "${blueprint.name}" before treating the output as settled.`,
    `Update the package so ${context.primaryAudience} and ${context.primaryFeature} are referenced directly in this phase.`,
    `Record what is already supported by the project information, what still needs confirmation, and what is still an inferred assumption.`
  ];

  return {
    index,
    slug: `phase-${String(index).padStart(2, '0')}`,
    name: blueprint.name,
    goal: blueprint.rationale,
    focusSummary: `This phase is shaped by ${context.primaryAudience}, ${context.primaryFeature}, and the selected mode ${context.profile.label}.`,
    riskFocus,
    generatedFromInput,
    needsConfirmation,
    inferredAssumptions,
    nextActions,
    entryCriteria,
    implementationChecklist: [
      `Review the project brief, questionnaire answers, and critique before editing "${blueprint.name}".`,
      `Apply ${context.profile.label} guidance: ${context.profile.planningExpectation}`,
      `Keep this phase anchored to these current inputs: ${context.keywords.slice(0, 4).join(', ') || input.productName}.`,
      `Use ${context.primaryFeature} and ${context.outputAnchor} as the main decision anchors, not generic planning filler.`,
      businessSpecific,
      technicalSpecific,
      'Do not hardcode final AI prompts. Instead, ask the coding AI to draft implementation or review prompts from this phase output.'
    ],
    businessAcceptanceCriteria: [
      `Based on your answers so far: a stakeholder can explain how "${blueprint.name}" supports ${input.productName} for ${context.primaryAudience}.`,
      `Please review and confirm: the business outcome still lines up with ${truncateText(input.successMetrics, 16)}.`,
      `Based on your answers so far: the phase protects the stated non-goals and constraints instead of expanding scope.`
    ],
    technicalAcceptanceCriteria: [
      `Based on your answers so far: the implementation implications connect back to ${context.primaryFeature} and ${context.secondaryFeature}.`,
      `Please review and confirm: the package is explicit enough about ${context.profile.technicalFocus}.`,
      `Inferred assumption: any unresolved technical boundary is labelled rather than presented as settled fact.`
    ],
    testingRequirements: [
      `Use the current acceptance anchor as proof guidance: ${context.acceptanceAnchor}.`,
      `Verify that the phase output still matches the workflow answer: ${context.workflowAnchor}.`,
      `Re-check the highest risk focus before closing the phase: ${context.riskAnchor}.`
    ],
    exitCriteria,
    implementationPromptPlaceholder:
      `Ask your coding AI to draft an implementation prompt for "${blueprint.name}" using this package's constraints, must-have scope, and acceptance criteria.`,
    reviewPromptPlaceholder:
      `Ask your coding AI to draft a review or testing prompt for "${blueprint.name}" using the current risks, failure paths, and exit criteria.`
  };
}

function buildPhasePlan(input: ProjectInput, context: ProjectContext, critique: CritiqueItem[]) {
  return buildPhaseBlueprints(input, context, critique).map((blueprint, index) =>
    buildPhaseContent(blueprint, index + 1, input, context, critique)
  );
}

function renderQuestionnaireMarkdown(questionnaire: QuestionnaireItem[], input: ProjectInput) {
  return questionnaire
    .map((item, index) => {
      const answer = input.questionnaireAnswers[item.id] || 'Please review and confirm: no answer provided yet.';
      return `## ${index + 1}. ${item.prompt}

Intent: ${item.intent}

Helper:
${item.helper}

Answer:
${answer}
`;
    })
    .join('\n');
}

function renderCritiqueMarkdown(critique: CritiqueItem[]) {
  if (!critique.length) {
    return '- Based on your answers so far: no major critique items are open right now.\n- Please review and confirm: keep validating assumptions as the package changes.';
  }

  return critique
    .map(
      (item, index) => `## ${index + 1}. ${item.title}

Severity: ${item.severity}

Signal:
${item.signal}

Why this matters:
${item.detail}

Follow-up question:
${item.followUpQuestion}
`
    )
    .join('\n');
}

function renderPhasePlanMarkdown(phases: PhasePlan[]) {
  return phases
    .map(
      (phase) => `## ${phase.index}. ${phase.name}

- Goal: ${phase.goal}
- Focus summary: ${phase.focusSummary}
- Gate file pair: /gates/gate-${String(phase.index).padStart(2, '0')}-entry.md and /gates/gate-${String(phase.index).padStart(2, '0')}-exit.md
- Phase folder: /phases/${phase.slug}/
`
    )
    .join('\n');
}

function renderScorecardMarkdown(bundle: ProjectBundle) {
  const { score } = bundle;

  return `# SCORECARD

## Package status
${bundle.lifecycleStatus}

| Category | Score |
| --- | ---: |
${score.categories.map((category) => `| ${category.label} | ${category.score}/${category.max} |`).join('\n')}
| **Total** | **${score.total}/100** |

## Rating
${score.rating}

## Blockers
${score.blockers.length ? score.blockers.map((item) => `- ${item}`).join('\n') : '- No blocking issues detected.'}

## Unresolved warnings
${bundle.unresolvedWarnings.length ? bundle.unresolvedWarnings.map((item) => `- [${item.severity}] ${item.title}: ${item.message}`).join('\n') : '- No unresolved warnings recorded.'}

## Why points were lost
${score.categories
  .map((category) => {
    const losses = category.reasonsLost.length ? category.reasonsLost.map((item) => `- ${item}`).join('\n') : '- No points lost in this category.';
    return `### ${category.label}\n${losses}`;
  })
  .join('\n\n')}

## What must improve before build handoff
${score.recommendations.map((item) => `- ${item}`).join('\n')}
`;
}

function renderPhaseMarkdown(phase: PhasePlan) {
  return `# ${phase.name}

## Phase goal
${phase.goal}

## Focus summary
${phase.focusSummary}

## Based on the project information provided
${listToBullets(phase.generatedFromInput, 'Based on your answers so far: no direct source signals were captured.')}

## Please review and confirm
${listToBullets(phase.needsConfirmation, 'Please review and confirm: no explicit confirmation items were captured.')}

## Inferred assumptions
${listToBullets(phase.inferredAssumptions, 'Inferred assumption: no explicit assumptions were recorded.')}

## Assumptions and open questions
${listToBullets(
  phase.inferredAssumptions.concat(phase.needsConfirmation),
  'Please review and confirm: no open assumptions or questions were recorded.'
)}

## Risk focus
${listToBullets(phase.riskFocus, 'Based on your answers so far: no phase-specific risk focus was captured.')}

## Entry criteria
${phase.entryCriteria.map((item) => `- ${item}`).join('\n')}

## Implementation checklist
${phase.implementationChecklist.map((item) => `- ${item}`).join('\n')}

## Business acceptance criteria
${phase.businessAcceptanceCriteria.map((item) => `- ${item}`).join('\n')}

## Technical acceptance criteria
${phase.technicalAcceptanceCriteria.map((item) => `- ${item}`).join('\n')}

## Testing requirements
${phase.testingRequirements.map((item) => `- ${item}`).join('\n')}

## Exit gate criteria
${phase.exitCriteria.map((item) => `- ${item}`).join('\n')}

## Next actions
${listToBullets(phase.nextActions, 'Please review and confirm: no next actions were generated.')}

## AI implementation prompt placeholder
${phase.implementationPromptPlaceholder}

## AI review or testing prompt placeholder
${phase.reviewPromptPlaceholder}
`;
}

function formatWarningLine(warning: WarningItem) {
  return `[${warning.severity}] ${warning.title}: ${warning.message}`;
}

function inferImplementationFileHints(phase: PhasePlan) {
  const signature = `${phase.slug} ${phase.name}`.toLowerCase();
  if (/brief|audience|stakeholder|workflow|handoff/.test(signature)) {
    return ['Product documentation, planning notes, and implementation README or docs that define the workflow clearly.'];
  }
  if (/data|architecture|api|integration/.test(signature)) {
    return ['Core application modules, data models, API handlers, and integration boundary files that implement the phase scope.'];
  }
  if (/testing|test/.test(signature)) {
    return ['Automated test files, smoke checks, fixtures, and validation scripts that prove the phase behavior.'];
  }
  if (/deployment|rollout/.test(signature)) {
    return ['Build scripts, environment configuration, deployment instructions, and release-related files touched by this phase.'];
  }
  if (/security|observability|scal/.test(signature)) {
    return ['Security-sensitive modules, logging or instrumentation files, and reliability guardrail code required for this phase.'];
  }

  return ['The implementation repo files needed to satisfy this phase goal, plus the phase packet files that record proof and handoff context.'];
}

function buildAgentPrompt(
  agentName: AgentName,
  phase: PhasePlan,
  input: ProjectInput,
  context: ProjectContext
) {
  const implementationHints = inferImplementationFileHints(phase);
  const includeAgents = agentName === 'OpenCode';

  return `# ${agentName.toUpperCase()} BUILD PROMPT

## What this file is for
Use this file when you want ${agentName} to work on this phase.

## Files to give ${agentName}
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- ${includeAgents ? 'AGENTS.md\n- ' : ''}PROJECT_BRIEF.md
- PHASE_PLAN.md
- SCORECARD.md
- 00_APPROVAL_GATE.md
- phases/${phase.slug}/PHASE_BRIEF.md
- phases/${phase.slug}/ENTRY_GATE.md
- phases/${phase.slug}/TEST_PLAN.md
- phases/${phase.slug}/HANDOFF_SUMMARY.md
- phases/${phase.slug}/NEXT_PHASE_CONTEXT.md
- repo/manifest.json
- repo/xelera-state.json
${agentName === 'OpenCode' ? `- OPENCODE_START_HERE.md
- phases/${phase.slug}/OPENCODE_BUILD_PROMPT.md
` : ''}

## What you should do now
1. Give ${agentName} the files listed above.
2. Paste the prompt below into ${agentName}.
3. Ask ${agentName} to work only on this phase.
4. Review the result before filling out verification files.

## Prompt to paste
\`\`\`text
You are taking over phase ${String(phase.index).padStart(2, '0')} for ${input.productName}.

Read the provided markdown files as the full source of truth. Do not rely on hidden chat context. First confirm the entry gate, then implement only the work required for "${phase.name}".

Phase goal:
${phase.goal}

Primary audience:
${context.primaryAudience}

Must-have anchor:
${context.primaryFeature}

Constraints that still matter:
${context.constraints.join('; ') || 'Keep the work local-first, markdown-first, and within the current MVP scope.'}

Required output from you:
1. Restate the phase goal and entry gate in your own words.
2. List the exact implementation files you plan to change before editing anything.
3. Complete the implementation for this phase only.
4. Run or describe the tests from TEST_PLAN.md.
5. Return a short handoff summary that includes changed files, test results, remaining risks, and whether the exit gate now passes.
6. Draft updated text for HANDOFF_SUMMARY.md and NEXT_PHASE_CONTEXT.md.

Do not jump ahead to later phases. If the phase packet is missing information, call it out explicitly before coding.
\`\`\`

## Expected output
- A concise restatement of the phase goal and entry gate.
- A list of implementation repo files changed for this phase.
- Completed work for this phase only.
- Test output or a clear note explaining what could not be tested.
- A short handoff summary suitable for phases/${phase.slug}/HANDOFF_SUMMARY.md.

## Tests to run
${listToBullets(phase.testingRequirements, 'Run the smallest test or smoke proof that demonstrates this phase now works.')}

## Files that should change
${listToBullets(
  implementationHints.concat([
    `phases/${phase.slug}/HANDOFF_SUMMARY.md`,
    `phases/${phase.slug}/EXIT_GATE.md`,
    `phases/${phase.slug}/NEXT_PHASE_CONTEXT.md`,
    'repo/xelera-state.json'
  ]),
  'The implementation repo files required for this phase and the phase packet markdown should be updated.'
)}

## Handoff summary to request before moving on
- What changed for ${phase.name}
- Which implementation files changed
- Which tests ran and what passed or failed
- Which risks or assumptions remain open
- Whether the exit gate passed
- What the next phase needs to know
`;
}

function buildPhaseBrief(
  phase: PhasePlan,
  input: ProjectInput,
  context: ProjectContext,
  assumptionsAndQuestions: { assumptions: string[]; openQuestions: string[] },
  nextPhase?: PhasePlan
) {
  const outOfScope = [
    nextPhase
      ? `Do not start "${nextPhase.name}" in this phase. Finish and verify ${phase.name} first.`
      : 'Do not reopen earlier phases unless verification found a blocker that must be fixed before final handoff.',
    context.nonGoals.length
      ? `Project non-goals still stay out of scope here: ${context.nonGoals.slice(0, 3).join(', ')}.`
      : `Do not add unrelated later-phase work outside the goal for ${phase.name}.`,
    context.niceToHaves.length
      ? `Defer optional ideas like ${context.niceToHaves.slice(0, 2).join(' and ')} unless this phase explicitly asks you to plan them.`
      : `If new ideas appear during this phase, record them for later instead of building them now.`
  ];

  return `# PHASE_BRIEF

## What this file is for
This file explains the current phase in plain language. Read it before you ask a coding agent to do any work for this phase.

## Phase
${phase.name}

## Goal
${phase.goal}

## Why this phase exists
${phase.focusSummary}

## What you should do now
1. Read the goal and open questions below.
2. Check ENTRY_GATE.md before starting work.
3. Give this file and the matching build prompt to your coding agent.
4. Do not move to the next phase yet. Verification happens after the work is reviewed.

## Files to give Codex or Claude Code for this phase
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- AGENTS.md
- PROJECT_BRIEF.md
- PHASE_PLAN.md
- phases/${phase.slug}/PHASE_BRIEF.md
- phases/${phase.slug}/ENTRY_GATE.md
- phases/${phase.slug}/CODEX_BUILD_PROMPT.md or phases/${phase.slug}/CLAUDE_BUILD_PROMPT.md
- phases/${phase.slug}/TEST_PLAN.md
- phases/${phase.slug}/HANDOFF_SUMMARY.md
- phases/${phase.slug}/NEXT_PHASE_CONTEXT.md
- repo/manifest.json
- repo/xelera-state.json

## Files to give OpenCode specifically
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- AGENTS.md
- OPENCODE_START_HERE.md
- phases/${phase.slug}/PHASE_BRIEF.md
- phases/${phase.slug}/ENTRY_GATE.md
- phases/${phase.slug}/TEST_PLAN.md
- phases/${phase.slug}/OPENCODE_BUILD_PROMPT.md
${phase.index > 1 ? `- phases/phase-${String(phase.index - 1).padStart(2, '0')}/HANDOFF_SUMMARY.md` : '- No previous phase handoff summary is required for phase 1.'}

## Output to expect
- A focused implementation for this phase only
- A list of changed implementation files
- Test evidence for this phase
- A completed handoff summary for the next phase

## This phase is ready only when
- The work matches the goal above.
- The entry gate was respected.
- The exit gate can be reviewed with real evidence.
- The next builder could understand what happened without hidden chat context.

## Out of scope for this phase
${outOfScope.map((item) => `- ${item}`).join('\n')}

## Project-specific anchors
- Product: ${input.productName}
- Audience: ${context.primaryAudience}
- Must-have focus: ${context.primaryFeature}
- Workflow anchor: ${context.workflowAnchor}
- Acceptance anchor: ${context.acceptanceAnchor}

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions.slice(0, 5), 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(phase.needsConfirmation.concat(assumptionsAndQuestions.openQuestions.slice(0, 4)), 'Please review and confirm: no open questions recorded.')}
`;
}

function buildPhaseEntryGate(phase: PhasePlan) {
  return `# ENTRY_GATE

## What this file is for
This file tells you whether the phase is ready to start. Do not begin the phase until these checks are true.

## Phase
${phase.name}

## This phase can start when
${phase.entryCriteria.map((item) => `- ${item}`).join('\n')}

## What you should do now
- Read each line below.
- If every line is true, you can start the phase.
- If any line is false or unclear, stop and fix that first.

## What to do if the gate fails
- Stop implementation for this phase.
- Record the blocker in repo/xelera-state.json so the package still shows the truth.
- Update phases/${phase.slug}/HANDOFF_SUMMARY.md with what is missing.
- Do not move to the next phase yet.
`;
}

function buildPhaseExitGate(phase: PhasePlan) {
  return `# EXIT_GATE

## What this file is for
This file tells you what must be true before the phase can be called complete.

## Phase
${phase.name}

## This phase is ready only when
${phase.exitCriteria.map((item) => `- ${item}`).join('\n')}
- Existing functionality and previously completed phase outputs still work, or any regression is documented as a blocker.

## Evidence to gather before closing the phase
Evidence means the files or notes that prove the phase was checked. Use real file paths when you fill out VERIFICATION_REPORT.md.

${phase.testingRequirements.map((item) => `- ${item}`).join('\n')}

## What you should do next
1. Review the completed work against this checklist.
2. Open VERIFY_PROMPT.md and EVIDENCE_CHECKLIST.md.
3. Fill out VERIFICATION_REPORT.md.
4. Do not move to the next phase yet unless verification says the phase can proceed.
`;
}

function buildPhaseTestPlan(phase: PhasePlan) {
  return `# TEST_PLAN

## Tests to run for ${phase.name}
${phase.testingRequirements.map((item) => `- ${item}`).join('\n')}

## Expected output
- Clear pass/fail notes for the tests that ran
- Any blockers that prevented testing
- A recommendation on whether the exit gate is satisfied
`;
}

function buildPhaseHandoffSummary(phase: PhasePlan) {
  return `# HANDOFF_SUMMARY

## What this file is for
Use this file to leave a short summary for the next person or agent. It should explain what changed, what was checked, and what still needs attention.

## What to do next
Fill this out after the phase work and verification review are done.

Use this template after completing ${phase.name}.

- Phase outcome:
- Implementation files changed:
- Tests run:
- Exit gate status:
- Remaining blockers or warnings:
- Assumptions that still need confirmation:
`;
}

function buildNextPhaseContext(phase: PhasePlan, nextPhase: PhasePlan | undefined) {
  return `# NEXT_PHASE_CONTEXT

## What this file is for
This file helps the next phase start with the right context instead of guessing what happened earlier.

## Current phase
${phase.name}

## Next phase
${nextPhase ? nextPhase.name : 'No next phase. This is the final phase.'}

## What the next phase should inherit
${listToBullets(phase.nextActions, 'No additional context was generated for the next phase.')}

## What you should do next
- Update this file before handing work to the next builder.
- Keep it short and specific.
- Mention anything the next phase must know to avoid rework.

## What the next builder should request
- A short recap of what changed in this phase
- The implementation files touched
- The tests that passed or failed
- Any blocker or warning that still matters before ${nextPhase ? nextPhase.name : 'final handoff'}
`;
}

function buildVerifyPrompt(
  phase: PhasePlan,
  bundle: ProjectBundle,
  input: ProjectInput
) {
  const fileList = [
    `phases/${phase.slug}/PHASE_BRIEF.md`,
    `phases/${phase.slug}/ENTRY_GATE.md`,
    `phases/${phase.slug}/EXIT_GATE.md`,
    `phases/${phase.slug}/TEST_PLAN.md`,
    `phases/${phase.slug}/HANDOFF_SUMMARY.md`,
    `phases/${phase.slug}/VERIFICATION_REPORT.md`,
    `phases/${phase.slug}/EVIDENCE_CHECKLIST.md`,
    `repo/manifest.json`,
    `repo/xelera-state.json`
  ].join('\n- ');

  return `# VERIFY_PROMPT for ${phase.name}

## What this file is for
Use this file to review whether ${input.productName} phase ${String(phase.index).padStart(2, '0')} (${phase.name}) is really ready to close. This prompt works with Codex, Claude Code, or OpenCode.

## What you should do now
1. Review the files listed below.
2. Check whether the phase goal and gates were met.
3. Use the results to fill out VERIFICATION_REPORT.md.
4. If you are unsure, leave the result or recommendation as pending.

## Files to inspect
- ${fileList}
- All changed implementation files for this phase

## What evidence means
Evidence means the files or notes that prove you checked the phase. Good evidence usually includes the changed files, the handoff summary, the evidence checklist, and any test output you reviewed.

## Functional checks
- [ ] The phase implementation satisfies the goal: ${phase.goal}
- [ ] Entry gate criteria are met
- [ ] Exit gate criteria are met
- [ ] Tests from TEST_PLAN.md were run and passed
- [ ] No new blockers were introduced

## Scope checks
- [ ] Work stays within ${phase.name} scope
- [ ] No unrelated phases were modified
- [ ] Must-have scope was not expanded without justification
- [ ] Non-goals and constraints are respected

## Local-first constraint checks
- [ ] No external service dependencies were added without explicit justification
- [ ] No auth, payments, database, or cloud backend requirements were introduced
- [ ] All files remain local and markdown-based

## Markdown-first constraint checks
- [ ] All handoff files are readable markdown
- [ ] No binary or proprietary formats are required for review
- [ ] State and evidence are recorded in markdown or JSON, not hidden in chat history

## Agent-readability checks
- [ ] File names and headings are clear and consistent
- [ ] Cross-references between phase files are accurate
- [ ] The next builder can understand context without chat history

## Novice-user clarity checks
- [ ] Language is plain enough for a non-expert reviewer
- [ ] Technical jargon is explained or linked
- [ ] Checklists are concrete and actionable

## Regression risks
- [ ] Changes do not break earlier phase outputs
- [ ] Existing tests still pass
- [ ] No unintended side effects in repo structure or shared files

## Final decision rules
- Set result to "pass" only if all functional checks, scope checks, and constraint checks pass.
- Set result to "fail" if any functional check or constraint check fails.
- Set recommendation to "proceed" only if result is "pass" and no unresolved blockers remain.
- Set recommendation to "revise" if result is "pass" but minor issues need cleanup.
- Set recommendation to "blocked" if result is "fail" or a critical blocker remains.

## Expected output
- A completed phases/${phase.slug}/VERIFICATION_REPORT.md
- A checked phases/${phase.slug}/EVIDENCE_CHECKLIST.md
- A clear recommendation: proceed, revise, or blocked
`;
}

function buildVerificationReport(phase: PhasePlan) {
  return `# VERIFICATION_REPORT for ${phase.name}

## What this file is for
Use this file to record the review result for the current phase. Keep the required headers exactly as written so the package can read them correctly.

## What you should do now
- Fill in the sections below after reviewing the phase.
- If you are unsure, leave result or recommendation as pending.
- Do not select pass + proceed unless you can list real evidence files.

## result: pending
Allowed: pass | fail | pending

Selected result: pending

## recommendation: pending
Allowed: proceed | revise | blocked | pending

Selected recommendation: pending

## summary
-

## files reviewed
- phases/${phase.slug}/PHASE_BRIEF.md
- phases/${phase.slug}/ENTRY_GATE.md
- phases/${phase.slug}/EXIT_GATE.md
- phases/${phase.slug}/TEST_PLAN.md
- phases/${phase.slug}/HANDOFF_SUMMARY.md
- phases/${phase.slug}/EVIDENCE_CHECKLIST.md
- repo/manifest.json
- repo/xelera-state.json

## files changed
-

## commands run
-

## evidence files
Evidence means the files or notes that prove the phase was checked. List the evidence files you actually reviewed before selecting \`pass + proceed\`.

- pending

Rules:
- Replace \`pending\` with real evidence file paths.
- Do not select \`pass + proceed\` until the listed files exist and support the decision.

## warnings
-

## defects found
-

## follow-up actions
-

## final decision
Pending completion of all sections above. Update result and recommendation before marking complete.
`;
}

function buildEvidenceChecklist(phase: PhasePlan) {
  return `# EVIDENCE_CHECKLIST for ${phase.name}

## What this file is for
Use this file to make sure the phase review includes enough proof before you try to advance.

## What evidence means
Evidence means the files or notes that prove the phase was checked. Real evidence is usually a combination of reviewed files, test output, and a completed handoff summary.

## What you should do now
- Check the items that are truly complete.
- Use this checklist while filling out VERIFICATION_REPORT.md.
- If key items are still missing, do not move to the next phase yet.

## Required evidence
- [ ] VERIFICATION_REPORT.md completed with result and recommendation
- [ ] HANDOFF_SUMMARY.md updated with phase outcome
- [ ] Changed implementation files listed and committed or documented

## Commands expected to run
- [ ] Phase-specific tests from TEST_PLAN.md
- [ ] Lint or typecheck if applicable
- [ ] Smoke test or regression check
- [ ] Build verification if build files exist

## Files expected to change
- [ ] phases/${phase.slug}/HANDOFF_SUMMARY.md
- [ ] phases/${phase.slug}/EXIT_GATE.md (if exit criteria changed)
- [ ] phases/${phase.slug}/VERIFICATION_REPORT.md
- [ ] phases/${phase.slug}/EVIDENCE_CHECKLIST.md
- [ ] repo/xelera-state.json
- Implementation files specific to this phase

## Acceptable evidence
- Markdown verification report with explicit result and recommendation
- Test output logs or screenshots
- Commit history or file diff
- Updated handoff summary
- Checked evidence checklist

## Unacceptable evidence
- Vague claims without file references
- Chat history or informal notes
- Untested code
- Missing verification report
- Pending or incomplete recommendation

## Manual checks
- [ ] Reviewer read the phase brief and exit gate
- [ ] Reviewer inspected changed files
- [ ] Reviewer confirmed no scope creep
- [ ] Reviewer confirmed local-first and markdown-first constraints still hold
`;
}

function buildRootAgentStart(
  agentName: AgentName,
  input: ProjectInput,
  bundle: ProjectBundle,
  context: ProjectContext
) {
  const promptFile =
    agentName === 'Codex'
      ? 'CODEX_HANDOFF_PROMPT.md'
      : agentName === 'Claude Code'
        ? 'CLAUDE_HANDOFF_PROMPT.md'
        : 'OPENCODE_HANDOFF_PROMPT.md';
  const usageFile =
    agentName === 'Codex'
      ? '02_HOW_TO_USE_WITH_CODEX.md'
      : agentName === 'Claude Code'
        ? '03_HOW_TO_USE_WITH_CLAUDE_CODE.md'
        : '04_HOW_TO_USE_WITH_OPENCODE.md';
  const startFile =
    agentName === 'Codex' ? 'CODEX_START_HERE.md' : agentName === 'Claude Code' ? 'CLAUDE_START_HERE.md' : 'OPENCODE_START_HERE.md';

  return `# ${agentName.toUpperCase()} START HERE

## What this file is for
Open this file first if you want to use ${agentName} on this package.

## Package
${input.productName}

## Current package status
${bundle.lifecycleStatus}

## What this status means
${
  bundle.lifecycleStatus === 'Blocked'
    ? 'This package is still usable, but it is not ready to advance. Work the current phase, resolve the listed blockers, and only move forward after status and verification agree.'
    : bundle.lifecycleStatus === 'Draft'
      ? 'This package is usable for planning work, but it is not yet ready for formal approval or phase advancement.'
      : bundle.lifecycleStatus === 'ReviewReady'
        ? 'This package is ready for formal approval review, but it is not yet approved for build execution.'
        : 'This package has explicit approval metadata and is ready for build execution.'
}

## Read these first
1. START_HERE.md
2. 00_PROJECT_CONTEXT.md
3. 01_CONTEXT_RULES.md
4. ${usageFile}
5. 00_APPROVAL_GATE.md
6. PROJECT_BRIEF.md
7. PHASE_PLAN.md
8. repo/manifest.json
9. repo/xelera-state.json
${agentName === 'OpenCode' ? `10. AGENTS.md
` : ''}

## Start with phase
Phase ${String(bundle.phases[0]?.index || 1).padStart(2, '0')} - ${bundle.phases[0]?.name || 'Initial phase'}

## What to paste into ${agentName}
Open ${promptFile} and paste its prompt into ${agentName}. Then give ${agentName} the files listed in that prompt.

## What you should do next
1. Open the current phase folder.
2. Give ${agentName} the matching phase files.
3. Ask ${agentName} to stay inside the current phase only.
4. Stop and verify before trying to advance.

## Expected result
- ${agentName} should restate the current phase, confirm the gate, work only within the current phase scope, run tests, and return a short handoff summary before you continue.

## Product-specific anchors
- Audience: ${context.primaryAudience}
- Must-have focus: ${context.primaryFeature}
- Desired output: ${context.outputAnchor}
`;
}

function buildPackageStartHere(bundle: ProjectBundle, input: ProjectInput) {
  const firstPhase = bundle.phases[0];
  const packageFolder = `./${bundle.exportRoot}`;
  return `# START_HERE

## What this package is
This is a local, markdown-first Xelera Method workspace. It is meant to help you plan, verify, hand off, and resume work without depending on hidden chat history.

## Open these files first
1. README.md
2. QUICKSTART.md
3. 00_PROJECT_CONTEXT.md
4. 01_CONTEXT_RULES.md
5. 00_APPROVAL_GATE.md
6. PROJECT_BRIEF.md
7. PHASE_PLAN.md
8. CODEX_START_HERE.md, CLAUDE_START_HERE.md, or OPENCODE_START_HERE.md

## Current phase
Phase ${String(firstPhase?.index || 1).padStart(2, '0')} - ${firstPhase?.name || 'Initial phase'}

## Current package status
${bundle.lifecycleStatus}

## What the status means
${
  bundle.lifecycleStatus === 'Blocked'
    ? 'Blocked means the package still has planning blockers. You can still work the current phase, but do not advance until the blockers are resolved and status no longer shows blocked.'
    : bundle.lifecycleStatus === 'Draft'
      ? 'Draft means the package is still being shaped and should not be treated as build-ready yet.'
      : bundle.lifecycleStatus === 'ReviewReady'
        ? 'ReviewReady means the package is ready for human approval review, but not yet approved for build.'
        : 'ApprovedForBuild means the package has explicit approval metadata and no remaining blockers.'
}

## Key terms
- Entry gate: the checklist that must be true before you start work in a phase.
- Exit gate: the checklist that must be true before you call the phase complete.
- Evidence: the real files, test output, or notes you reviewed to justify your result and recommendation.

## How to work this package
1. Read the root context files and the current phase packet.
2. Give the current phase files to Codex, Claude Code, or OpenCode.
3. Complete or update VERIFICATION_REPORT.md and EVIDENCE_CHECKLIST.md.
4. Run status and validate before trying to advance.
5. Run next-phase only after the report says pass + proceed and the package is no longer blocked.

## What you should do next
Open QUICKSTART.md for the exact commands, then open the current phase folder and the matching agent start file. If the package is blocked, fix the blocker before trying to advance.

## Commands to know
- From the folder that contains this workspace:
  - Check status: npm run status -- --package=${packageFolder}
  - Validate package files: npm run validate -- --package=${packageFolder}
  - Advance after verification: npm run next-phase -- --package=${packageFolder} --evidence=${packageFolder}/phases/${firstPhase?.slug || 'phase-01'}/VERIFICATION_REPORT.md
- If you are already inside this workspace folder:
  - Check status: npm run status -- --package=.
  - Validate package files: npm run validate -- --package=.
  - Advance after verification: npm run next-phase -- --package=. --evidence=phases/${firstPhase?.slug || 'phase-01'}/VERIFICATION_REPORT.md

QUICKSTART.md includes the same commands in one place.

## Resume and handoff
- Yes, you can resume later. repo/xelera-state.json records the current phase and evidence details.
- Yes, you can hand off between Codex, Claude Code, and OpenCode. Use the same markdown files as the source of truth and start with the matching *_START_HERE.md file.
`;
}

function buildRootReadme(bundle: ProjectBundle, input: ProjectInput) {
  return `# ${input.productName}

## What this package is
This is a local Xelera Method workspace. It is a markdown package that helps you plan the work, check each phase, record evidence, and hand the project between Codex, Claude Code, and OpenCode without relying on hidden chat history.

## Open these files first
- [START_HERE.md](START_HERE.md)
- [QUICKSTART.md](QUICKSTART.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Main planning files
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md)
- [PHASE_PLAN.md](PHASE_PLAN.md)
- [00_APPROVAL_GATE.md](00_APPROVAL_GATE.md)

## Agent start files
- [CODEX_START_HERE.md](CODEX_START_HERE.md)
- [CLAUDE_START_HERE.md](CLAUDE_START_HERE.md)
- [OPENCODE_START_HERE.md](OPENCODE_START_HERE.md)

## Current package status
${bundle.lifecycleStatus}

## What you should do next
1. Read START_HERE.md for the big picture.
2. Open QUICKSTART.md for the exact commands.
3. Open the current phase files before asking an agent to do any work.
`;
}

function buildPackageQuickstart(bundle: ProjectBundle, input: ProjectInput) {
  const firstPhase = bundle.phases[0];
  const packageFolder = `./${bundle.exportRoot}`;

  return `# QUICKSTART

## What this file is for
Use this file when you want the shortest path from package creation to phase work.

## If you are in the folder that contains this workspace
- Check status: \`npm run status -- --package=${packageFolder}\`
- Validate the package: \`npm run validate -- --package=${packageFolder}\`
- Advance after verification: \`npm run next-phase -- --package=${packageFolder} --evidence=${packageFolder}/phases/${firstPhase?.slug || 'phase-01'}/VERIFICATION_REPORT.md\`

## If you are already inside this workspace folder
- Check status: \`npm run status -- --package=.\`
- Validate the package: \`npm run validate -- --package=.\`
- Advance after verification: \`npm run next-phase -- --package=. --evidence=phases/${firstPhase?.slug || 'phase-01'}/VERIFICATION_REPORT.md\`

## Open these files first
1. README.md
2. START_HERE.md
3. PROJECT_BRIEF.md
4. PHASE_PLAN.md
5. CODEX_START_HERE.md, CLAUDE_START_HERE.md, or OPENCODE_START_HERE.md

## What you should do next
1. Read the current phase brief.
2. Give the matching phase files to your coding agent.
3. Stop and fill out verification before trying to advance.
`;
}

function buildPackageTroubleshooting() {
  return `# TROUBLESHOOTING

## What this file is for
Use this file when status, validate, or next-phase gives you a result you do not understand.

## Common status words
- pending: the review is not finished yet.
- pass: the phase review says the work met the checks.
- fail: the phase review says something important is still wrong.
- proceed: the reviewer says the phase can move forward.
- revise: the phase mostly works, but you should fix issues before moving on.
- blocked: the package or phase still has an issue that must be resolved before advancement.

## What "blocked" means
Blocked does not mean the package is useless. It means you should stop trying to advance, review the blocker, and fix or document it first.

## If validate fails
- Read the exact file name in the error message.
- Fix the missing file, malformed report value, or weak evidence it names.
- Run validate again after saving the file.

## If next-phase refuses to advance
- Check VERIFICATION_REPORT.md.
- Make sure result is \`pass\`.
- Make sure recommendation is \`proceed\`.
- Make sure ## evidence files lists real files with meaningful content.
- Make sure status no longer says the package is blocked.

## If evidence is the problem
- Evidence means the files or notes that prove the phase was really checked.
- Default template files with empty checklists or placeholder text do not count yet.
- Comment-only files do not count.
- Add real notes, test output, changed file references, or completed handoff details before selecting \`pass + proceed\`.
`;
}

function buildRootAgentPrompt(
  agentName: AgentName,
  input: ProjectInput,
  bundle: ProjectBundle,
  context: ProjectContext
) {
  const firstPhase = bundle.phases[0];
  const buildPromptFile =
    agentName === 'Codex'
      ? 'CODEX_BUILD_PROMPT.md'
      : agentName === 'Claude Code'
        ? 'CLAUDE_BUILD_PROMPT.md'
        : 'OPENCODE_BUILD_PROMPT.md';
  return `# ${agentName.toUpperCase()} HANDOFF PROMPT

## What this file is for
Paste this into ${agentName} with the listed files attached or opened.

## Files to give ${agentName}
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- ${agentName === 'OpenCode' ? 'AGENTS.md\n- ' : ''}00_APPROVAL_GATE.md
- PROJECT_BRIEF.md
- QUESTIONNAIRE.md
- PLAN_CRITIQUE.md
- PHASE_PLAN.md
- SCORECARD.md
- phases/${firstPhase.slug}/PHASE_BRIEF.md
- phases/${firstPhase.slug}/ENTRY_GATE.md
- phases/${firstPhase.slug}/${buildPromptFile}
- phases/${firstPhase.slug}/TEST_PLAN.md
- repo/manifest.json
- repo/xelera-state.json

## Prompt
\`\`\`text
You are starting work on ${input.productName} using the Xelera Method package.

Treat the provided markdown files as the full source of truth. Do not rely on hidden chat context. Work only on the current phase, confirm the gate before coding, and stop if the package says the phase is blocked.

Current package status: ${bundle.lifecycleStatus}
Current phase: ${firstPhase.name}
Primary audience: ${context.primaryAudience}
Primary feature: ${context.primaryFeature}

Please:
1. Restate the project goal and the current phase goal.
2. Confirm the entry gate and call out any blocker immediately.
3. Identify the exact implementation repo files you expect to change.
4. Complete only the current phase.
5. Run or describe the required tests.
6. Return a short handoff summary and suggested text for repo/xelera-state.json updates.
\`\`\`
`;
}

function buildRootContext(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  return `# 00_PROJECT_CONTEXT

## What this file is for
This file gives the short version of the project so a new reader can understand the package quickly.

## Project
${input.productName}

## Current package status
${bundle.lifecycleStatus}

## What this package is for
This is a local, markdown-first planning and gating package for AI-assisted builds in Codex, Claude Code, and OpenCode.

## What you should do next
- Read this file first to understand the project.
- Then open 01_CONTEXT_RULES.md and the current phase files.
- If blockers are listed below, do not assume the package is ready to advance.

## Project-specific anchors
- Product idea: ${input.productIdea}
- Primary audience: ${context.primaryAudience}
- Problem statement: ${input.problemStatement}
- Desired output: ${input.desiredOutput}
- Must-have scope: ${context.mustHaves.join(', ') || 'Please review and confirm'}

## Current blockers
${listToBullets(bundle.blockingWarnings.map((warning) => formatWarningLine(warning)), 'No blocker warnings recorded.')}

## Current phase
${bundle.phases[0]?.name || 'Phase 1'}
`;
}

function buildContextRules() {
  return `# 01_CONTEXT_RULES

## What this file is for
This file explains the working rules for the package. Use it when you are unsure how to behave inside the workspace.

## Rules
- Treat markdown files in this package as the source of truth.
- Do not rely on hidden chat history.
- Work one phase at a time.
- Confirm the entry gate before implementation.
- Update the handoff summary before moving to the next phase.
- Keep prompts and context packets small enough to copy and paste cleanly.
- If a required answer is missing, stop and surface the blocker instead of inventing certainty.

## What you should do next
- Follow these rules while working in every phase.
- If a file seems unclear, trust the package files over memory.
- Stop and verify before moving to the next phase.

## Supported agent workflows
- Codex
- Claude Code
- OpenCode
`;
}

function buildHowToUseWithAgent(agentName: AgentName) {
  const promptFile =
    agentName === 'Codex'
      ? 'CODEX_HANDOFF_PROMPT.md'
      : agentName === 'Claude Code'
        ? 'CLAUDE_HANDOFF_PROMPT.md'
        : 'OPENCODE_HANDOFF_PROMPT.md';
  const startFile =
    agentName === 'Codex' ? 'CODEX_START_HERE.md' : agentName === 'Claude Code' ? 'CLAUDE_START_HERE.md' : 'OPENCODE_START_HERE.md';
  const heading =
    agentName === 'Codex'
      ? '02_HOW_TO_USE_WITH_CODEX'
      : agentName === 'Claude Code'
        ? '03_HOW_TO_USE_WITH_CLAUDE_CODE'
        : '04_HOW_TO_USE_WITH_OPENCODE';
  return `# ${heading}

## What this file is for
Use this file if you want a short workflow for ${agentName}.

## Start
1. Open ${startFile}.
2. Gather the files listed there.
3. Paste the contents of ${promptFile} into ${agentName}.
4. Attach or open the current phase packet files.
5. Ask for a handoff summary before moving to the next phase.

## For each phase
- Give ${agentName} the current phase folder files only, plus the root context files${agentName === 'OpenCode' ? ', AGENTS.md, and the OpenCode start file' : ''}.
- Keep the context packet small.
- Do not include unrelated earlier phase files unless the current phase explicitly depends on them.
- After the phase completes, update repo/xelera-state.json and the phase handoff summary.
`;
}

function buildAgentsMd() {
  return `# AGENTS

## Xelera Method agent rules
- Work one phase at a time.
- Read the current phase packet before editing anything.
- Do not skip entry gates.
- Do not bypass blockers.
- Do not silently mark phases complete.
- Run the phase test plan.
- Write or update the handoff summary before moving on.
- Do not modify future phase files unless explicitly instructed.

## Supported local agent workflows
- Codex
- Claude Code
- OpenCode
`;
}

function buildXeleraState(bundle: ProjectBundle): XeleraState {
  const phaseEvidence = Object.fromEntries(
    bundle.phases.map((phase) => [
      phase.slug,
      {
        testsRun: [],
        changedFiles: [],
        verificationReportPath: `phases/${phase.slug}/VERIFICATION_REPORT.md`,
        exitGateReviewed: false,
        approvedToProceed: false,
        knownIssues: [],
        reviewerRecommendation: '',
        evidenceFiles: [
          `phases/${phase.slug}/VERIFICATION_REPORT.md`,
          `phases/${phase.slug}/EVIDENCE_CHECKLIST.md`,
          `phases/${phase.slug}/HANDOFF_SUMMARY.md`
        ]
      }
    ])
  );

  return {
    currentPhase: bundle.phases[0]?.index || 1,
    lifecycleStatus: bundle.lifecycleStatus,
    completedPhases: [],
    blockedPhases: bundle.blockingWarnings.length ? [bundle.phases[0]?.slug || 'phase-01'] : [],
    unresolvedBlockers: bundle.blockingWarnings.map((warning) => ({
      id: warning.id,
      title: warning.title,
      message: warning.message,
      action: warning.action
    })),
    lastHandoffSummary: 'No phase handoff has been recorded yet.',
    phaseEvidence
  };
}

function createGeneratedFiles(bundle: ProjectBundle, input: ProjectInput, context: ProjectContext): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const add = (path: string, content: string) => {
    files.push({ path, content: ensureTrailingNewline(content) });
  };
  const assumptionsAndQuestions = buildAssumptionsAndOpenQuestions(bundle.warnings, context);
  const statusSummary = getLifecycleSummary(bundle.lifecycleStatus);
  const blockingWarningLines = bundle.blockingWarnings.map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`);
  const nonBlockingWarningLines = bundle.warnings
    .filter((warning) => warning.severity !== 'blocker')
    .map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`);
  const modeGuideIntro =
    context.profile.key === 'beginner-business'
      ? 'Simple checklist: read the brief, answer the open questions, confirm the customer problem, and only then move into phase work.'
      : context.profile.key === 'beginner-technical'
        ? 'Simple technical checklist: confirm the brief, repo expectations, and first tests before trusting the handoff.'
        : context.profile.key === 'advanced-technical'
          ? 'Technical review note: treat unresolved architecture, observability, and failure-mode questions as blockers until they are explicit.'
          : context.profile.key === 'advanced-business'
            ? 'Executive review note: treat unresolved business value, adoption, and operating-model questions as blockers until they are explicit.'
            : 'Review the brief, close the open questions, and then work the package in phase order.';
  const xeleraState = buildXeleraState(bundle);

  add('README.md', buildRootReadme(bundle, input));
  add('QUICKSTART.md', buildPackageQuickstart(bundle, input));
  add('TROUBLESHOOTING.md', buildPackageTroubleshooting());
  add('START_HERE.md', buildPackageStartHere(bundle, input));
  add('00_PROJECT_CONTEXT.md', buildRootContext(input, bundle, context));
  add('01_CONTEXT_RULES.md', buildContextRules());
  add('02_HOW_TO_USE_WITH_CODEX.md', buildHowToUseWithAgent('Codex'));
  add('03_HOW_TO_USE_WITH_CLAUDE_CODE.md', buildHowToUseWithAgent('Claude Code'));
  add('04_HOW_TO_USE_WITH_OPENCODE.md', buildHowToUseWithAgent('OpenCode'));
  add('AGENTS.md', buildAgentsMd());
  add('CODEX_START_HERE.md', buildRootAgentStart('Codex', input, bundle, context));
  add('CLAUDE_START_HERE.md', buildRootAgentStart('Claude Code', input, bundle, context));
  add('OPENCODE_START_HERE.md', buildRootAgentStart('OpenCode', input, bundle, context));
  add('CODEX_HANDOFF_PROMPT.md', buildRootAgentPrompt('Codex', input, bundle, context));
  add('CLAUDE_HANDOFF_PROMPT.md', buildRootAgentPrompt('Claude Code', input, bundle, context));
  add('OPENCODE_HANDOFF_PROMPT.md', buildRootAgentPrompt('OpenCode', input, bundle, context));

  add(
    'PROJECT_BRIEF.md',
    `# PROJECT_BRIEF

## Product
${input.productName}

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## Selected profile
${bundle.profile.label}

## Profile behavior
- Question wording: ${bundle.profile.wordingStyle}
- Critique depth: ${bundle.profile.critiqueDepth}
- Planning expectation: ${bundle.profile.planningExpectation}
- Technical detail level: ${bundle.profile.technicalDepth}
- Gate strength: ${bundle.profile.gateStrength}
- Handoff detail: ${bundle.profile.handoffDetail}

## Based on the project information provided
- Product idea: ${input.productIdea}
- Audience: ${input.targetAudience}
- Problem: ${input.problemStatement}
- Desired output: ${input.desiredOutput}
- Must-have scope: ${context.mustHaves.join(', ') || 'Please review and confirm'}

## Please review and confirm
${listToBullets(
  bundle.critique
    .filter((item) => item.signal === 'needs-user-confirmation')
    .slice(0, 5)
    .map((item) => item.followUpQuestion),
  'Please review and confirm: no open confirmation questions are recorded.'
)}

## Inferred assumptions
${listToBullets(context.inferredAssumptions, 'Inferred assumption: none recorded.')}

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions, 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(assumptionsAndQuestions.openQuestions, 'Please review and confirm: no open questions recorded.')}

## Warning summary
### Blocking issues
${listToBullets(blockingWarningLines, 'No blocker warnings recorded.')}

### Non-blocking warnings
${listToBullets(nonBlockingWarningLines, 'No non-blocking warnings recorded.')}

## Constraints
${listToBullets(context.constraints, 'Please review and confirm: constraints are not yet explicit.')}

## Risks currently shaping the plan
${listToBullets(context.risks, 'Please review and confirm: risk list is still empty.')}
`
  );

  add(
    'PHASE_PLAN.md',
    `# PHASE_PLAN

## Package status
${bundle.lifecycleStatus}

${statusSummary}

This package contains ${bundle.phases.length} phases for ${input.productName}.

${renderPhasePlanMarkdown(bundle.phases)}

## Risks and open questions affecting sequencing
${listToBullets(
  assumptionsAndQuestions.openQuestions.slice(0, 6).concat(context.risks.slice(0, 3).map((item) => `Based on your answers so far: ${item}`)),
  'Please review and confirm: no sequencing questions recorded.'
)}
`
  );

  add('SCORECARD.md', renderScorecardMarkdown(bundle));

  add(
    '00_APPROVAL_GATE.md',
    `# 00_APPROVAL_GATE

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## Blocking issues
${listToBullets(blockingWarningLines, 'No blocker warnings recorded.')}

## Non-blocking warnings
${listToBullets(nonBlockingWarningLines, 'No non-blocking warnings recorded.')}

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions, 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(assumptionsAndQuestions.openQuestions, 'Please review and confirm: no open questions recorded.')}

## Human approval checklist
- Confirm the package status still matches the actual planning state.
- Confirm blocker warnings are resolved or intentionally escalated outside this package.
- Confirm non-blocking warnings, assumptions, and open questions are visible to reviewers.
- Confirm the phase plan, gates, and scorecard reflect the actual brief and questionnaire answers.
- Confirm the next builder can work from this package without hidden chat context.

## Approval decision section
- Approval required: ${bundle.approvalRequired ? 'Yes' : 'No'}
- Approved for build: ${bundle.approvedForBuild ? 'Yes' : 'No'}
- Recorded approval decision: ${(input.questionnaireAnswers['approval-decision'] || 'Not recorded yet.')}
- Recorded approver: ${(input.questionnaireAnswers['approval-reviewed-by'] || 'Not recorded yet.')}
- Recorded approval notes: ${(input.questionnaireAnswers['approval-notes'] || 'Not recorded yet.')}
`
  );

  add(
    'HANDOFF.md',
    `# HANDOFF

## Build objective
${input.desiredOutput}

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## Current mode
${bundle.profile.label}

## Based on the project information provided
- Primary audience: ${context.primaryAudience}
- Primary feature focus: ${context.primaryFeature}
- Workflow anchor: ${context.workflowAnchor}
- Acceptance anchor: ${context.acceptanceAnchor}

## Please review and confirm
${listToBullets(
  Array.from(new Set(bundle.critique.map((item) => item.followUpQuestion))).slice(0, 5),
  'Please review and confirm: no open follow-up questions are recorded.'
)}

## Inferred assumptions
${listToBullets(context.inferredAssumptions, 'Inferred assumption: none recorded.')}

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions, 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(assumptionsAndQuestions.openQuestions, 'Please review and confirm: no open questions recorded.')}

## Unresolved warnings
${listToBullets(bundle.unresolvedWarnings.map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`), 'No unresolved warnings recorded.')}

## Status meaning
- Draft: export is allowed for planning review, but the package still needs more work before formal approval review.
- Blocked: export is allowed for diagnosis and review, but blocker warnings prevent a build-ready package.
- ReviewReady: the package is complete enough for human approval review, but it is not yet approved for build.
- ApprovedForBuild: the package contains explicit approval metadata and can be treated as build-approved.

## What the builder should read first
1. 00_PROJECT_CONTEXT.md
2. 01_CONTEXT_RULES.md
3. 00_APPROVAL_GATE.md
4. PROJECT_BRIEF.md
5. PHASE_PLAN.md
6. CODEX_START_HERE.md, CLAUDE_START_HERE.md, or OPENCODE_START_HERE.md
7. /phases in sequence

## Rules for the builder
- Use markdown files in this package as the source of truth.
- Do not rely on chat history.
- Do not skip entry or exit gates.
- Do not hardcode final AI prompts in package files. Ask the coding AI to draft prompts when needed.
- Keep the MVP inside the stated must-have scope, non-goals, and constraints.

## Current readiness
${bundle.score.total}/100 - ${bundle.score.rating}

## Recommended next step
Review the open confirmation items, then start phase 1 with the current brief and constraints.
`
  );

  add(
    'STEP_BY_STEP_BUILD_GUIDE.md',
    `# STEP_BY_STEP_BUILD_GUIDE

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## Mode-specific guidance
${modeGuideIntro}

1. Read PROJECT_BRIEF.md and restate ${input.productName} in your own words.
2. Review QUESTIONNAIRE.md and PLAN_CRITIQUE.md so you know which parts are based on the current project information, which still need confirmation, and which are inferred assumptions.
3. Confirm the SCORECARD.md blockers list is empty or explicitly accepted.
4. Work phase-by-phase in the order listed in PHASE_PLAN.md.
5. For phase 1, verify the brief, profile, audience, constraints, and desired output are present before moving on.
6. For phase 2 and later, require the previous phase handoff, previous exit gate, blocker log, and scope-change log before starting.
7. During each phase, keep the files tied to ${context.primaryAudience}, ${context.primaryFeature}, and ${context.outputAnchor}.
8. When you need a coding prompt or review prompt, ask your coding AI to draft one from the current phase goal, constraints, and acceptance criteria.
9. Before final handoff, revisit SCORECARD.md and confirm that the package still matches the actual scope and unresolved risks.
10. Hand the package to Codex, Claude, Cursor, or a human development team as the implementation source of truth.

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions, 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(assumptionsAndQuestions.openQuestions, 'Please review and confirm: no open questions recorded.')}

## Unresolved warnings
${listToBullets(bundle.unresolvedWarnings.map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`), 'No unresolved warnings recorded.')}

## Status meaning
- Draft: export is allowed for planning review, but the package is not yet ready for human build approval.
- Blocked: export is allowed for diagnosis and review, but blocker warnings prevent a build-ready package.
- ReviewReady: the package is complete enough for human approval review, but it is not yet approved for build.
- ApprovedForBuild: the package contains explicit approval metadata and can be treated as build-approved.
`
  );

  add(
    'QUESTIONNAIRE.md',
    `# QUESTIONNAIRE

Profile: ${bundle.profile.label}

${renderQuestionnaireMarkdown(bundle.questionnaire, input)}
`
  );

  add(
    'PLAN_CRITIQUE.md',
    `# PLAN_CRITIQUE

${renderCritiqueMarkdown(bundle.critique)}
`
  );

  add(
    'repo/README.md',
    `# ${input.productName}

Generated by Xelera Method.

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## What this repo package is for
This directory is a local, markdown-first planning and handoff package for AI-assisted builds in Codex, Claude Code, and OpenCode. Its purpose is to help another builder implement ${input.productName} without depending on hidden chat context.

## Based on the project information provided
${listToBullets(context.mustHaves.map((item) => `Based on your answers so far: ${item}`), 'Based on your answers so far: must-have features were not listed.')}

## Please review and confirm
${listToBullets(bundle.critique.map((item) => item.followUpQuestion).slice(0, 4), 'Please review and confirm: no open questions are listed.')}

## Non-goals
${listToBullets(context.nonGoals.map((item) => `Based on your answers so far: ${item}`), 'Please review and confirm: non-goals are not yet explicit.')}

## Data and integrations
${listToBullets(context.integrations.map((item) => `Based on your answers so far: ${item}`), 'Inferred assumption: the first release is mostly local and markdown-first.')}

## Unresolved warnings
${listToBullets(bundle.unresolvedWarnings.map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`), 'No unresolved warnings recorded.')}
`
  );

  add('repo/input.json', JSON.stringify(input, null, 2));
  add('repo/xelera-state.json', JSON.stringify(xeleraState, null, 2));

  add(
    'repo/manifest.json',
    JSON.stringify(
      {
        exportRoot: bundle.exportRoot,
        profile: bundle.profile.key,
        readinessScore: bundle.score.total,
        rating: bundle.score.rating,
        lifecycleStatus: bundle.lifecycleStatus,
        phaseCount: bundle.phases.length,
        primaryAudience: context.primaryAudience,
        primaryFeature: context.primaryFeature,
        supportedAgents: ['codex', 'claude-code', 'opencode'],
        generatedArtifacts: [
          'CODEX_START_HERE.md',
          'CLAUDE_START_HERE.md',
          'OPENCODE_START_HERE.md',
          'CODEX_HANDOFF_PROMPT.md',
          'CLAUDE_HANDOFF_PROMPT.md',
          'OPENCODE_HANDOFF_PROMPT.md',
          'AGENTS.md'
        ],
        packageSummary: `${input.productName} package for Codex, Claude Code, and OpenCode.`,
        warningCounts: bundle.warningCounts,
        blockingWarnings: bundle.blockingWarnings.map((warning) => ({
          id: warning.id,
          title: warning.title,
          message: warning.message,
          action: warning.action
        })),
        approvalRequired: bundle.approvalRequired,
        approvedForBuild: bundle.approvedForBuild,
        unresolvedWarnings: bundle.unresolvedWarnings,
        currentPhase: xeleraState.currentPhase,
        completedPhases: xeleraState.completedPhases,
        blockedPhases: xeleraState.blockedPhases
      },
      null,
      2
    )
  );

  bundle.phases.forEach((phase) => {
    const gateNumber = String(phase.index).padStart(2, '0');
    const nextPhase = bundle.phases[phase.index];
    add(`phases/${phase.slug}/README.md`, renderPhaseMarkdown(phase));
    add(`phases/${phase.slug}/PHASE_BRIEF.md`, buildPhaseBrief(phase, input, context, assumptionsAndQuestions, nextPhase));
    add(`phases/${phase.slug}/ENTRY_GATE.md`, buildPhaseEntryGate(phase));
    add(`phases/${phase.slug}/CODEX_BUILD_PROMPT.md`, buildAgentPrompt('Codex', phase, input, context));
    add(`phases/${phase.slug}/CLAUDE_BUILD_PROMPT.md`, buildAgentPrompt('Claude Code', phase, input, context));
    add(`phases/${phase.slug}/OPENCODE_BUILD_PROMPT.md`, buildAgentPrompt('OpenCode', phase, input, context));
    add(`phases/${phase.slug}/VERIFY_PROMPT.md`, buildVerifyPrompt(phase, bundle, input));
    add(`phases/${phase.slug}/VERIFICATION_REPORT.md`, buildVerificationReport(phase));
    add(`phases/${phase.slug}/EVIDENCE_CHECKLIST.md`, buildEvidenceChecklist(phase));
    add(`phases/${phase.slug}/EXIT_GATE.md`, buildPhaseExitGate(phase));
    add(`phases/${phase.slug}/TEST_PLAN.md`, buildPhaseTestPlan(phase));
    add(`phases/${phase.slug}/HANDOFF_SUMMARY.md`, buildPhaseHandoffSummary(phase));
    add(`phases/${phase.slug}/NEXT_PHASE_CONTEXT.md`, buildNextPhaseContext(phase, nextPhase));
    add(
      `gates/gate-${gateNumber}-entry.md`,
      `# Gate ${gateNumber} Entry

## What this file is for
This is the short entry checklist for the phase. Use it when you want a quick gate-only view.

## Phase
${phase.name}

## This phase can start when
${phase.entryCriteria.map((item) => `- ${item}`).join('\n')}

## What you should do next
- If every line is true, the phase can start.
- If any line is false or unclear, stop and fix it first.
`
    );
    add(
      `gates/gate-${gateNumber}-exit.md`,
      `# Gate ${gateNumber} Exit

## What this file is for
This is the short exit checklist for the phase. Use it when you want a quick gate-only view before closing the phase.

## Phase
${phase.name}

## This phase is ready only when
${phase.exitCriteria.map((item) => `- ${item}`).join('\n')}
- Existing functionality and previously completed phase outputs still work, or any regression is documented as a blocker.

## Required evidence
${phase.testingRequirements.map((item) => `- ${item}`).join('\n')}

## What you should do next
- Review this checklist before calling the phase complete.
- Fill out VERIFICATION_REPORT.md before trying to advance.
`
    );
  });

  return files;
}

export function generateProjectBundle(input: ProjectInput): ProjectBundle {
  const profile = getProfileConfig(input);
  const questionnaire = buildQuestionnaire(input);
  const context = buildContext(input);
  const critique = buildCritique(input, questionnaire, context);
  const phases = buildPhasePlan(input, context, critique);
  const score = scoreProject(input, questionnaire, critique);
  const warnings = buildWarnings(input, questionnaire, critique, context, score);
  const { approvalRequired, approvedForBuild } = getApprovalFlags(input);
  const lifecycleStatus = deriveLifecycleStatus({
    warnings,
    scoreTotal: score.total,
    approvedForBuild
  });
  const warningCounts: Record<WarningSeverity, number> = {
    info: warnings.filter((warning) => warning.severity === 'info').length,
    warning: warnings.filter((warning) => warning.severity === 'warning').length,
    blocker: warnings.filter((warning) => warning.severity === 'blocker').length
  };
  const blockingWarnings = warnings.filter((warning) => warning.severity === 'blocker');
  const unresolvedWarnings = warnings.filter((warning) => warning.severity !== 'info' || lifecycleStatus !== 'ApprovedForBuild').slice(0, 12);
  const bundle: ProjectBundle = {
    exportRoot: DEFAULT_EXPORT_ROOT,
    profile,
    questionnaire,
    critique,
    warnings,
    phases,
    score,
    lifecycleStatus,
    unresolvedWarnings,
    warningCounts,
    blockingWarnings,
    approvalRequired,
    approvedForBuild,
    files: []
  };

  bundle.files = createGeneratedFiles(bundle, input, context);
  return bundle;
}

export function generateProjectFiles(input: ProjectInput) {
  return generateProjectBundle(input).files;
}
