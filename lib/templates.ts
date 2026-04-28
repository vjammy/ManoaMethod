import type { ExperienceLevel, ProjectInput, UserTrack } from './types';

export const phaseNames = [
  '01-discovery-and-north-star',
  '02-users-and-jobs-to-be-done',
  '03-workflows-and-edge-cases',
  '04-product-critique-and-scope',
  '05-data-model-and-integrations',
  '06-ui-screen-spec-and-content',
  '07-security-privacy-and-abuse',
  '08-technical-architecture',
  '09-test-plan-and-acceptance',
  '10-build-handoff-and-agent-instructions'
];

export const profileDescriptions: Record<`${ExperienceLevel}-${UserTrack}`, string> = {
  'beginner-business': 'Plain-language guided planning for founders and business users.',
  'beginner-technical': 'Guided technical planning for users with light technical experience.',
  'intermediate-business': 'Balanced business and delivery planning for PMs, founders, and operators.',
  'intermediate-technical': 'Architecture-aware planning with gates, data model, tests, and handoff.',
  'advanced-business': 'Strategic product critique, operating model, phase planning, and readiness scoring.',
  'advanced-technical': 'Deep technical planning with architecture, non-functional requirements, and risk controls.'
};

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'xelera-project';
}

export function checklistFor(profile: `${ExperienceLevel}-${UserTrack}`) {
  const beginner = profile.startsWith('beginner');
  const technical = profile.endsWith('technical');
  return [
    beginner ? 'Explain the product in one paragraph without jargon.' : 'State the product thesis and non-goals.',
    'Define primary users, secondary users, and decision makers.',
    'Write happy path, failure path, and support path.',
    'Separate must-have scope from future scope.',
    technical ? 'Define entities, permissions, APIs, jobs, and events.' : 'List what information the product must collect, store, show, and protect.',
    'Create phase-by-phase entry and exit gates.',
    'Score readiness before coding begins.'
  ];
}

export function baseProjectInput(): ProjectInput {
  return {
    productName: 'New Product',
    oneLineIdea: 'A markdown-first planning system that turns a vague idea into build-ready artifacts.',
    targetUsers: 'Business users, technical users, founders, product managers, offshore teams, and AI coding agents.',
    primaryOutcome: 'Create a clear, gated build handoff before coding begins.',
    mustHaveFeatures: 'Questionnaire, artifact generator, phase plan, gate files, scorecard, final handoff zip.',
    niceToHaveFeatures: 'Collaboration, authentication, cloud storage, integrations with Claude, Codex, GitHub, and project trackers.',
    risks: 'Vague inputs, over-scoping, missing edge cases, weak testing, security assumptions, stale documentation.',
    dataAndIntegrations: 'Markdown files, local browser state, generated zip exports. Future: GitHub, Google Drive, project management tools.',
    constraints: 'Keep v1 markdown-first. Avoid heavy database and login until the workflow is validated.',
    level: 'beginner',
    track: 'business'
  };
}
