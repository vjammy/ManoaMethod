import type { ProfileConfig, ProfileKey, ProjectInput, QuestionnaireItem } from './types';

export const profileConfigs: Record<ProfileKey, ProfileConfig> = {
  'beginner-business': {
    key: 'beginner-business',
    label: 'Beginner + Business',
    description: 'Plain-language planning for founders and operators who need structure before build work begins.',
    wordingStyle: 'Use simple language, short explanations, and explicit examples.',
    critiqueDepth: 'Explain missing basics clearly and avoid assuming product or delivery experience.',
    planningExpectation: 'Require step-by-step planning, checklist confirmation, and obvious business validation gates.',
    technicalDepth: 'Keep technical assumptions light and only include repo or testing details that protect delivery.',
    gateStrength: 'Use plain yes or no gates tied to customer clarity, scope discipline, and MVP usefulness.',
    handoffDetail: 'Spell out what the builder should do first, second, and third without hidden jargon.',
    languageMode: 'simple',
    businessFocus: 'customer problem, value proof, and launch usefulness',
    technicalFocus: 'light technical scaffolding only when needed',
    checklistBias: 'high',
    validationFocus: 'business validation before implementation',
    minimumPhaseCount: 10
  },
  'beginner-technical': {
    key: 'beginner-technical',
    label: 'Beginner + Technical',
    description: 'Accessible planning for junior builders who need more technical scaffolding and file-level guidance.',
    wordingStyle: 'Use simple language, but be explicit about technical steps and repo expectations.',
    critiqueDepth: 'Call out missing technical structure without assuming senior engineering judgment.',
    planningExpectation: 'Require workflow, file, test, and release scaffolding before build handoff.',
    technicalDepth: 'Include repo shape, data boundaries, testing expectations, and implementation checkpoints.',
    gateStrength: 'Use direct gates around ambiguity, missing interfaces, and weak test plans.',
    handoffDetail: 'Provide a practical build order with extra guidance for testing and review.',
    languageMode: 'simple-technical',
    businessFocus: 'user value and scope control',
    technicalFocus: 'repo structure, file boundaries, and test setup',
    checklistBias: 'high',
    validationFocus: 'technical scaffolding with beginner-friendly explanations',
    minimumPhaseCount: 11
  },
  'intermediate-business': {
    key: 'intermediate-business',
    label: 'Intermediate + Business',
    description: 'Balanced planning for product and operations leaders who need sharper workflow and delivery clarity.',
    wordingStyle: 'Use direct product language with moderate detail.',
    critiqueDepth: 'Challenge vague workflow, market, and rollout assumptions with moderate firmness.',
    planningExpectation: 'Require solid user, workflow, scope, and acceptance planning before build handoff.',
    technicalDepth: 'Include enough implementation detail to prevent weak engineering handoffs.',
    gateStrength: 'Use stronger gates around user flow, acceptance, and launch readiness.',
    handoffDetail: 'Translate product strategy into implementation-ready artifacts with concrete review checks.',
    languageMode: 'balanced',
    businessFocus: 'market fit, workflow clarity, and adoption readiness',
    technicalFocus: 'implementation detail only where it strengthens delivery',
    checklistBias: 'medium',
    validationFocus: 'balanced product and delivery validation',
    minimumPhaseCount: 11
  },
  'intermediate-technical': {
    key: 'intermediate-technical',
    label: 'Intermediate + Technical',
    description: 'Planning for technical PMs and builders who need stronger architecture, API, and testing gates.',
    wordingStyle: 'Use concise technical product language.',
    critiqueDepth: 'Challenge gaps in architecture, data flow, API shape, and testing with direct feedback.',
    planningExpectation: 'Require implementation readiness, deployment thinking, and explicit validation steps.',
    technicalDepth: 'Expect meaningful detail in architecture, data contracts, APIs, tests, and deployment checks.',
    gateStrength: 'Use firm gates that block coding when interfaces or evidence remain weak.',
    handoffDetail: 'Provide clear build sequencing, file ownership direction, and validation criteria.',
    languageMode: 'technical-balanced',
    businessFocus: 'user impact and rollout risk',
    technicalFocus: 'architecture, data model, APIs, tests, and deployment',
    checklistBias: 'medium',
    validationFocus: 'technical implementation readiness',
    minimumPhaseCount: 12
  },
  'advanced-business': {
    key: 'advanced-business',
    label: 'Advanced + Business',
    description: 'Strategic planning for senior operators who need sharper critique and stronger operating-model logic.',
    wordingStyle: 'Use concise executive-level language and challenge weak assumptions directly.',
    critiqueDepth: 'Push hard on monetization, stakeholder alignment, adoption risk, and operating-model gaps.',
    planningExpectation: 'Require evidence-backed tradeoffs, business proof, and disciplined rollout logic.',
    technicalDepth: 'Capture technical constraints only where they change business viability or delivery risk.',
    gateStrength: 'Use strict gates that force explicit decisions on scope, adoption, and operating risk.',
    handoffDetail: 'Create a high-confidence handoff with stakeholder, operating, and rollout context.',
    languageMode: 'executive',
    businessFocus: 'monetization, operating model, adoption risk, and stakeholder workflow',
    technicalFocus: 'technical assumptions that materially change business decisions',
    checklistBias: 'medium-low',
    validationFocus: 'strategic business readiness',
    minimumPhaseCount: 12
  },
  'advanced-technical': {
    key: 'advanced-technical',
    label: 'Advanced + Technical',
    description: 'Deep planning for senior builders who need architecture, failure-mode, security, and observability rigor.',
    wordingStyle: 'Use direct technical language and assume comfort with architecture and delivery detail.',
    critiqueDepth: 'Be toughest on ambiguity, hidden complexity, edge cases, security, scalability, and observability gaps.',
    planningExpectation: 'Require precise interfaces, failure-path thinking, and measurable acceptance before build handoff.',
    technicalDepth: 'Demand concrete expectations for architecture, APIs, jobs, data boundaries, tests, deployment, and observability.',
    gateStrength: 'Use the strongest gates and treat unresolved ambiguity as a build blocker.',
    handoffDetail: 'Create a handoff package that a senior engineer or coding agent can execute with minimal follow-up.',
    languageMode: 'deep-technical',
    businessFocus: 'user impact and delivery risk',
    technicalFocus: 'architecture, security, scalability, observability, and failure modes',
    checklistBias: 'medium-low',
    validationFocus: 'deep technical readiness',
    minimumPhaseCount: 13
  }
};

export const CORE_AGENT_OPERATING_RULES = `## Core Agent Operating Rules

1. Don't assume. Don't hide confusion. Surface tradeoffs.
2. Minimum code that solves the problem. Nothing speculative.
3. Touch only what you must. Clean up only your own mess.
4. Define success criteria. Loop until verified.`;

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'manoa-project';
}

export function getProfileKey(input: Pick<ProjectInput, 'level' | 'track'>): ProfileKey {
  return `${input.level}-${input.track}`;
}

export function getProfileConfig(input: Pick<ProjectInput, 'level' | 'track'>) {
  return profileConfigs[getProfileKey(input)];
}

export function baseProjectInput(): ProjectInput {
  return {
    productName: 'Manoa Method Sample',
    level: 'beginner',
    track: 'business',
    productIdea: 'A planning layer that slows teams down long enough to turn a rough product idea into build-ready artifacts before coding begins.',
    targetAudience: 'Founders, product managers, operators, and technical builders handing work to AI coding tools or development teams.',
    problemStatement: 'Teams jump into implementation too early, miss critical assumptions, and create expensive churn because requirements, gates, and handoff quality are weak.',
    constraints: 'Keep v1 markdown-first, local-first, and easy to run without auth, payments, or a database.',
    desiredOutput: 'A structured project plan, gated phases, readiness score, final build guide, and downloadable artifact package.',
    mustHaveFeatures: 'Profile-aware questionnaire, critique and follow-up questions, multi-phase plan, gate files, readiness scorecard, markdown export, zip download, CLI package generation.',
    niceToHaveFeatures: 'Team collaboration, template library, persistent project storage, richer prompt orchestration, connector integrations.',
    dataAndIntegrations: 'Markdown files, local browser state, zip export, optional CLI input JSON. Future GitHub and docs integrations are out of scope for v1.',
    risks: 'Users may under-specify the problem, overscope the first release, skip testing, or create handoffs that still rely on chat history.',
    successMetrics: 'A sample project can be created locally, produces a readable phase plan and gate package, scores readiness, and exports a handoff zip that another builder can use without extra context.',
    nonGoals: 'Do not add authentication, payments, a production database, or heavyweight collaboration in the MVP.',
    timeline: 'Validate the workflow with a local MVP first, then expand based on real user feedback.',
    teamContext: 'One product owner using the web UI and CLI, handing artifacts to Codex, Claude, Cursor, or a human engineering team.',
    questionnaireAnswers: {}
  };
}

export function buildQuestionPrompts(profile: ProfileConfig): QuestionnaireItem[] {
  const shared: QuestionnaireItem[] = [
    {
      id: 'north-star',
      prompt: profile.key.endsWith('technical')
        ? 'What is the smallest end-to-end outcome the first release must prove technically and for the user?'
        : 'What must the first release prove for the customer and for the business?',
      helper: `${profile.wordingStyle} Anchor the answer in the actual product idea instead of abstract ambition.`,
      required: true,
      intent: 'north star and release proof'
    },
    {
      id: 'primary-workflow',
      prompt: 'Describe the core workflow from first touch to success in clear sequence order.',
      helper: `${profile.planningExpectation} Include the happy path and at least one failure or support path.`,
      required: true,
      intent: 'workflow clarity'
    },
    {
      id: 'scope-cut',
      prompt: 'If the timeline is cut in half, what stays in v1 and what gets deferred?',
      helper: `Keep this answer consistent with ${profile.businessFocus}.`,
      required: true,
      intent: 'scope discipline'
    },
    {
      id: 'acceptance',
      prompt:
        profile.key.startsWith('advanced')
          ? 'What evidence should convince a skeptical reviewer that this plan is ready for build handoff?'
          : 'What evidence should tell the next builder that this plan is clear enough to start with?',
      helper: `${profile.validationFocus} Mention proof, evidence, or acceptance checks instead of just confidence.`,
      required: true,
      intent: 'acceptance quality'
    },
    {
      id: 'operating-risks',
      prompt:
        profile.key.endsWith('technical')
          ? 'Which security, privacy, observability, support, or operational risks need explicit gates?'
          : 'Which legal, operational, trust, or delivery risks need explicit gates?',
      helper: `${profile.critiqueDepth} Name the risks that should block the next phase if unresolved.`,
      required: true,
      intent: 'risk coverage'
    }
  ];

  switch (profile.key) {
    case 'beginner-business':
      return [
        shared[0],
        {
          id: 'customer-pain',
          prompt: 'What specific customer frustration should this product remove first?',
          helper: 'Use plain language and explain why that frustration matters now.',
          required: true,
          intent: 'customer pain'
        },
        shared[1],
        {
          id: 'business-proof',
          prompt: 'How will you tell whether the business side of this MVP is working?',
          helper: 'Name signals such as adoption, faster work, fewer mistakes, or clearer handoffs.',
          required: true,
          intent: 'business proof'
        },
        shared[2],
        shared[3],
        shared[4]
      ];
    case 'beginner-technical':
      return [
        shared[0],
        shared[1],
        {
          id: 'repo-shape',
          prompt: 'What repo, file, or implementation structure should the next builder expect?',
          helper: 'List the major files, modules, or artifacts the builder will probably touch first.',
          required: true,
          intent: 'repo guidance'
        },
        {
          id: 'test-proof',
          prompt: 'What should the builder test first before trusting the implementation?',
          helper: 'Mention a concrete smoke test, phase proof, or acceptance check.',
          required: true,
          intent: 'testability'
        },
        shared[2],
        shared[3],
        shared[4]
      ];
    case 'intermediate-business':
      return [
        shared[0],
        {
          id: 'user-segments',
          prompt: 'Which user segment matters most first, and which segment is secondary?',
          helper: 'Tie the answer to the current audience and workflow, not a generic persona list.',
          required: true,
          intent: 'user clarity'
        },
        shared[1],
        {
          id: 'stakeholder-workflow',
          prompt: 'Which internal stakeholder workflows need to change for this plan to succeed?',
          helper: 'Call out decision makers, reviewers, or operators who influence launch readiness.',
          required: true,
          intent: 'stakeholder workflow'
        },
        shared[2],
        shared[3],
        shared[4]
      ];
    case 'intermediate-technical':
      return [
        shared[0],
        shared[1],
        {
          id: 'data-boundaries',
          prompt: 'What data boundaries, APIs, or integrations must be explicit before implementation starts?',
          helper: 'Name the important entities, inputs, outputs, and external touchpoints.',
          required: true,
          intent: 'data boundaries'
        },
        {
          id: 'deployment-guardrails',
          prompt: 'What deployment, environment, or release guardrails need to be planned now?',
          helper: 'Include what can break in delivery if these guardrails stay vague.',
          required: true,
          intent: 'deployment readiness'
        },
        {
          id: 'test-proof',
          prompt: 'What tests, review steps, or proof points must pass before the handoff is considered build-ready?',
          helper: 'Be specific about smoke checks, acceptance proofs, or regression risks.',
          required: true,
          intent: 'testability'
        },
        shared[2],
        shared[3],
        shared[4]
      ];
    case 'advanced-business':
      return [
        shared[0],
        {
          id: 'user-segments',
          prompt: 'Which user, buyer, and stakeholder workflows create or block value in this plan?',
          helper: 'Differentiate the user workflow from the operating or approval workflow.',
          required: true,
          intent: 'stakeholder workflow'
        },
        shared[1],
        {
          id: 'monetization',
          prompt: 'How does this MVP create measurable business value, revenue potential, or operating leverage?',
          helper: 'Avoid abstract strategy language; make the economic or operational proof concrete.',
          required: true,
          intent: 'business viability'
        },
        {
          id: 'adoption-risks',
          prompt: 'What adoption, rollout, or change-management risks could make the plan fail even if the product works?',
          helper: 'Focus on stakeholder behavior, incentives, and operational friction.',
          required: true,
          intent: 'adoption risk'
        },
        shared[2],
        shared[3],
        shared[4]
      ];
    default:
      return [
        shared[0],
        shared[1],
        {
          id: 'data-boundaries',
          prompt: 'Which entities, interfaces, or integrations must be explicit before coding begins?',
          helper: 'Include the boundaries that would create rework if left implicit.',
          required: true,
          intent: 'data boundaries'
        },
        {
          id: 'failure-modes',
          prompt: 'Which edge cases, failure modes, or invalid states should shape the phase gates?',
          helper: 'Focus on the cases most likely to create hidden complexity or user harm.',
          required: true,
          intent: 'failure modes'
        },
        {
          id: 'observability',
          prompt: 'What observability or support signals should exist before the build is called handoff-ready?',
          helper: 'Mention what needs to be monitored, logged, or reviewed after launch.',
          required: true,
          intent: 'observability'
        },
        {
          id: 'scaling-risk',
          prompt: 'Which scalability, security, or concurrency risks should influence the architecture and gates now?',
          helper: 'Call out the risks that can turn into expensive rewrites if ignored.',
          required: true,
          intent: 'scalability and security'
        },
        shared[2],
        shared[3],
        shared[4]
      ];
  }
}
