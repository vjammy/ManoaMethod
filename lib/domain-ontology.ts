import type { ProjectInput } from './types';

export type DomainArchetype =
  | 'family-task'
  | 'family-readiness'
  | 'sdr-sales'
  | 'restaurant-ordering'
  | 'budget-planner'
  | 'clinic-scheduler'
  | 'hoa-maintenance'
  | 'school-club'
  | 'volunteer-manager'
  | 'inventory'
  | 'general';

export type RiskFlag =
  | 'children'
  | 'medical'
  | 'legal'
  | 'emergency'
  | 'privacy'
  | 'money'
  | 'sensitive-data';

export type OntologyField = {
  name: string;
  type: string;
  description: string;
  example: string;
  aliases: string[];
};

export type OntologyActor = {
  name: string;
  type: string;
  aliases: string[];
  responsibilities: string[];
  visibility: string[];
};

export type OntologyEntity = {
  name: string;
  type: string;
  aliases: string[];
  description: string;
  core: boolean;
  fields: OntologyField[];
  relationships: string[];
  ownerActors: string[];
  riskTypes: string[];
  sample: Record<string, string | number | boolean | null>;
};

export type OntologyWorkflow = {
  name: string;
  type: string;
  aliases: string[];
  description: string;
  primaryActors: string[];
  entityRefs: string[];
  steps: string[];
  failureModes: string[];
  featureTriggers: string[];
  acceptancePattern: string;
};

export type OntologyIntegration = {
  name: string;
  type: string;
  aliases: string[];
  purpose: string;
  required: boolean;
  trigger: string;
  requirementRefs: string[];
  failureModes: string[];
  envVar: string;
  mockedByDefault: boolean;
};

export type OntologyRisk = {
  name: string;
  type: string;
  description: string;
  appliesToEntities: string[];
  appliesToActors: string[];
  appliesToWorkflows: string[];
  mitigationNow: string;
  mitigationLater: string;
  verification: string;
};

export type OntologyAcceptancePattern = {
  key: string;
  label: string;
  verificationMethod: string;
  negativeExpectation: string;
};

export type OntologyFeatureScenario = {
  feature: string;
  scenarioType: string;
  actor: OntologyActor;
  workflow: OntologyWorkflow;
  entities: OntologyEntity[];
  fields: OntologyField[];
  integrations: OntologyIntegration[];
  risks: OntologyRisk[];
  userAction: string;
  systemResponse: string;
  storedData: string;
  failureCase: string;
  testableOutcome: string;
};

export type DomainOntology = {
  domainType: DomainArchetype;
  actorTypes: OntologyActor[];
  workflowTypes: OntologyWorkflow[];
  entityTypes: OntologyEntity[];
  fieldTypes: OntologyField[];
  riskTypes: OntologyRisk[];
  integrationTypes: OntologyIntegration[];
  acceptanceTestPatterns: OntologyAcceptancePattern[];
  featureScenarios: OntologyFeatureScenario[];
};

type BuildArgs = {
  domainArchetype: DomainArchetype;
  riskFlags: RiskFlag[];
  audienceSegments: string[];
  mustHaves: string[];
  niceToHaves: string[];
  integrations: string[];
  nonGoals: string[];
  constraints: string[];
};

type Blueprint = {
  actors: OntologyActor[];
  entities: OntologyEntity[];
  workflows: OntologyWorkflow[];
  integrations: OntologyIntegration[];
  risks: OntologyRisk[];
};

const ACCEPTANCE_PATTERNS: OntologyAcceptancePattern[] = [
  {
    key: 'workspace-setup',
    label: 'Workspace setup',
    verificationMethod: 'Verify the new workspace or configuration record is created and visible to the correct roles.',
    negativeExpectation: 'Reject missing required setup fields or unauthorized membership changes.'
  },
  {
    key: 'role-access',
    label: 'Role and permission boundary',
    verificationMethod: 'Verify the restricted role sees only allowed records, fields, and actions.',
    negativeExpectation: 'Reject any cross-role access, edit, or visibility leak.'
  },
  {
    key: 'record-create',
    label: 'Record creation',
    verificationMethod: 'Verify the new record appears with the required fields and default state.',
    negativeExpectation: 'Reject blank required fields, duplicate records, or invalid values.'
  },
  {
    key: 'assignment',
    label: 'Assignment and ownership',
    verificationMethod: 'Verify the assignee, due time, and ownership status are stored together.',
    negativeExpectation: 'Reject assignments to missing recipients, conflicting owners, or unavailable slots.'
  },
  {
    key: 'status-transition',
    label: 'Status transition',
    verificationMethod: 'Verify the state change is visible to the next actor and the history is preserved.',
    negativeExpectation: 'Reject illegal transitions or silent state changes.'
  },
  {
    key: 'review-approval',
    label: 'Review and approval',
    verificationMethod: 'Verify the reviewer decision, reason, and resulting state are all stored.',
    negativeExpectation: 'Reject approval without a pending request or without the required reviewer.'
  },
  {
    key: 'dashboard-view',
    label: 'Dashboard or review view',
    verificationMethod: 'Verify the view shows realistic records, empty-state language, and the right filters.',
    negativeExpectation: 'Reject hidden data gaps, wrong totals, or cross-role leakage.'
  },
  {
    key: 'notification',
    label: 'Reminder or notification',
    verificationMethod: 'Verify the rule, recipient, and delivery-safe content are stored and reviewable.',
    negativeExpectation: 'Reject delivery attempts without approved channels or with sensitive details.'
  },
  {
    key: 'handoff',
    label: 'Handoff or share step',
    verificationMethod: 'Verify the next actor receives the minimum context needed to continue the workflow.',
    negativeExpectation: 'Reject handoffs that omit required context, state, or ownership.'
  },
  {
    key: 'threshold-alert',
    label: 'Threshold or scoring rule',
    verificationMethod: 'Verify the threshold value, trigger condition, and resulting action are stored.',
    negativeExpectation: 'Reject alerts that fire with wrong thresholds or without supporting data.'
  },
  {
    key: 'conflict-resolution',
    label: 'Conflict handling',
    verificationMethod: 'Verify the conflicting record is blocked, explained, and routed to the right actor.',
    negativeExpectation: 'Reject double-booking, duplicate assignment, or silent overwrite behavior.'
  }
];

function splitItems(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(value: string) {
  return value
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function slugify(value: string) {
  return normalize(value).replace(/\s+/g, '_');
}

function envName(value: string) {
  return slugify(value).toUpperCase();
}

function containsAny(text: string, aliases: string[]) {
  const normalized = normalize(text);
  return aliases.some((alias) => normalized.includes(normalize(alias)));
}

function actor(
  name: string,
  type: string,
  aliases: string[],
  responsibilities: string[],
  visibility: string[]
): OntologyActor {
  return { name, type, aliases, responsibilities, visibility };
}

function field(
  name: string,
  type: string,
  description: string,
  example: string,
  aliases: string[] = []
): OntologyField {
  return { name, type, description, example, aliases: unique([name, ...aliases]) };
}

function entity(config: Omit<OntologyEntity, 'aliases'> & { aliases?: string[] }): OntologyEntity {
  return {
    ...config,
    aliases: unique([config.name, ...(config.aliases || [])])
  };
}

function workflow(config: OntologyWorkflow): OntologyWorkflow {
  return {
    ...config,
    aliases: unique([config.name, ...config.aliases])
  };
}

function integration(config: OntologyIntegration): OntologyIntegration {
  return {
    ...config,
    aliases: unique([config.name, ...config.aliases])
  };
}

function risk(config: OntologyRisk): OntologyRisk {
  return config;
}

function buildBlueprint(domainType: DomainArchetype): Blueprint {
  switch (domainType) {
    case 'family-task':
      return {
        actors: [
          actor('Parent Admin', 'parent-admin', ['parent', 'household admin', 'primary parent'], ['Create tasks', 'Approve completion', 'Manage child visibility'], ['All household tasks', 'All member profiles']),
          actor('Co-Parent', 'co-parent', ['co-parent', 'second parent', 'caregiver'], ['Help assign tasks', 'Review completion'], ['Shared household tasks', 'Allowed child profiles']),
          actor('Child User', 'child-user', ['child', 'kid', 'kid user'], ['View assigned chores', 'Mark a task complete'], ['Own tasks', 'Own reminder-safe view'])
        ],
        entities: [
          entity({
            name: 'Family Workspace',
            type: 'workspace',
            core: true,
            description: 'Shared household container for members, tasks, and visibility rules.',
            fields: [
              field('workspaceId', 'id', 'Stable workspace identifier.', 'family-home-001', ['family workspace', 'workspace']),
              field('householdName', 'string', 'Human-readable family name.', 'Rivera Household', ['family name', 'household name']),
              field('timezone', 'string', 'Local timezone for due dates and reminders.', 'America/New_York', ['timezone']),
              field('defaultVisibility', 'enum', 'Default task visibility rule.', 'assigned-only', ['visibility'])
            ],
            relationships: ['Owns Family Member records', 'Owns Household Task records'],
            ownerActors: ['Parent Admin', 'Co-Parent'],
            riskTypes: ['Child visibility leak'],
            sample: { workspaceId: 'family-home-001', householdName: 'Rivera Household', timezone: 'America/New_York', defaultVisibility: 'assigned-only' }
          }),
          entity({
            name: 'Family Member',
            type: 'person',
            core: true,
            description: 'Adult or child profile with role and visibility boundaries.',
            aliases: ['parent profile', 'kid profile', 'child profile', 'family account'],
            fields: [
              field('memberId', 'id', 'Stable member identifier.', 'member-maya', ['profile id']),
              field('displayName', 'string', 'Name shown in the app.', 'Maya Rivera', ['name']),
              field('role', 'enum', 'Household role.', 'parent-admin', ['role']),
              field('childSafeView', 'boolean', 'Whether the profile uses the child-safe dashboard.', 'true', ['child-safe view']),
              field('contactChannel', 'string', 'Allowed contact method.', 'local-only', ['contact', 'email'])
            ],
            relationships: ['Belongs to Family Workspace', 'Owns or completes Household Task records'],
            ownerActors: ['Parent Admin'],
            riskTypes: ['Child visibility leak'],
            sample: { memberId: 'member-maya', displayName: 'Maya Rivera', role: 'parent-admin', childSafeView: false, contactChannel: 'local-only' }
          }),
          entity({
            name: 'Household Task',
            type: 'task',
            core: true,
            description: 'Task assigned inside the household workflow.',
            aliases: ['task', 'chore', 'household task'],
            fields: [
              field('taskId', 'id', 'Stable task identifier.', 'task-dishes', ['task id']),
              field('title', 'string', 'Short task title.', 'Unload dishwasher', ['task title']),
              field('assigneeMemberId', 'reference', 'Assigned family member.', 'member-ella', ['assignee', 'assignment']),
              field('dueDate', 'date', 'Task due date.', '2026-05-01', ['due date', 'due dates']),
              field('priority', 'enum', 'Task priority.', 'medium', ['priority']),
              field('status', 'enum', 'Current task state.', 'awaiting-approval', ['task status', 'status'])
            ],
            relationships: ['Belongs to Family Workspace', 'References Family Member assignee'],
            ownerActors: ['Parent Admin', 'Co-Parent'],
            riskTypes: ['Stale household task data', 'Child visibility leak'],
            sample: { taskId: 'task-dishes', title: 'Unload dishwasher', assigneeMemberId: 'member-ella', dueDate: '2026-05-01', priority: 'medium', status: 'awaiting-approval' }
          }),
          entity({
            name: 'Completion Review',
            type: 'review',
            core: true,
            description: 'Parent approval record for child-completed work.',
            aliases: ['approval state', 'parent approval', 'completion state'],
            fields: [
              field('reviewId', 'id', 'Stable review identifier.', 'review-dishes-1', ['review id']),
              field('taskId', 'reference', 'Task under review.', 'task-dishes', ['task']),
              field('submittedByMemberId', 'reference', 'Member who marked the task done.', 'member-ella', ['submitted by']),
              field('reviewerMemberId', 'reference', 'Parent or co-parent reviewer.', 'member-maya', ['reviewer']),
              field('decision', 'enum', 'Review decision.', 'approved', ['decision', 'approval']),
              field('reviewNote', 'string', 'Optional reason or feedback.', 'Counter is clean and dishes are put away.', ['note'])
            ],
            relationships: ['References Household Task', 'References Family Member for submitter and reviewer'],
            ownerActors: ['Parent Admin', 'Co-Parent'],
            riskTypes: ['Approval bottleneck'],
            sample: { reviewId: 'review-dishes-1', taskId: 'task-dishes', submittedByMemberId: 'member-ella', reviewerMemberId: 'member-maya', decision: 'approved', reviewNote: 'Counter is clean and dishes are put away.' }
          }),
          entity({
            name: 'Reminder Rule',
            type: 'notification-rule',
            core: true,
            description: 'Reminder preference stored locally until live delivery is approved.',
            aliases: ['reminder preference', 'basic reminder preferences', 'reminder'],
            fields: [
              field('ruleId', 'id', 'Stable rule identifier.', 'rule-task-dishes', ['rule id']),
              field('taskId', 'reference', 'Task the reminder applies to.', 'task-dishes', ['task']),
              field('channel', 'enum', 'Allowed reminder channel.', 'mock-email', ['channel', 'email reminder']),
              field('leadTimeHours', 'number', 'Hours before due date.', '24', ['lead time']),
              field('active', 'boolean', 'Whether the reminder is active.', 'true', ['active'])
            ],
            relationships: ['References Household Task'],
            ownerActors: ['Parent Admin', 'Co-Parent'],
            riskTypes: ['Reminder confusion'],
            sample: { ruleId: 'rule-task-dishes', taskId: 'task-dishes', channel: 'mock-email', leadTimeHours: 24, active: true }
          })
        ],
        workflows: [
          workflow({ name: 'Household setup', type: 'workspace-setup', aliases: ['family workspace setup', 'family setup', 'household setup'], description: 'Create the shared family space and member roles.', primaryActors: ['Parent Admin'], entityRefs: ['Family Workspace', 'Family Member'], steps: ['Create household', 'Add co-parent or caregiver', 'Create child profiles', 'Confirm visibility defaults'], failureModes: ['Parent creates incomplete child profile', 'Visibility defaults expose too much'], featureTriggers: ['family workspace setup', 'parent and co-parent roles', 'kid profiles'], acceptancePattern: 'workspace-setup' }),
          workflow({ name: 'Task assignment', type: 'assignment', aliases: ['task assignment', 'task creation', 'assign chores'], description: 'Create household tasks and assign them to the correct family member.', primaryActors: ['Parent Admin', 'Co-Parent'], entityRefs: ['Household Task'], steps: ['Create task', 'Set due date and priority', 'Assign member', 'Save visible task'], failureModes: ['Task has no assignee', 'Past due date entered', 'Wrong child sees the task'], featureTriggers: ['task creation', 'task assignment', 'due dates', 'priority'], acceptancePattern: 'assignment' }),
          workflow({ name: 'Completion approval', type: 'review-approval', aliases: ['parent approval', 'completion review'], description: 'Child marks work complete and a parent approves or rejects it.', primaryActors: ['Child User', 'Parent Admin'], entityRefs: ['Household Task', 'Completion Review'], steps: ['Child marks task done', 'Parent reviews', 'Decision is stored', 'Task status updates'], failureModes: ['Parent never reviews the task', 'Child completes task they cannot see'], featureTriggers: ['parent approval of kid-completed tasks', 'task status'], acceptancePattern: 'review-approval' }),
          workflow({ name: 'Reminder planning', type: 'notification', aliases: ['reminder planning', 'email reminder planning', 'basic reminder preferences'], description: 'Store reminder rules safely and keep email mocked until approved.', primaryActors: ['Parent Admin'], entityRefs: ['Reminder Rule', 'Household Task'], steps: ['Choose reminder rule', 'Store reminder-safe content', 'Mock delivery until approved'], failureModes: ['Reminder contains sensitive child detail', 'Live email is assumed without approval'], featureTriggers: ['basic reminder preferences', 'email reminder planning'], acceptancePattern: 'notification' }),
          workflow({ name: 'Dashboard review', type: 'dashboard-view', aliases: ['parent dashboard', 'kid dashboard', 'mobile-friendly layout'], description: 'Show role-specific task views on parent and child dashboards.', primaryActors: ['Parent Admin', 'Child User'], entityRefs: ['Household Task', 'Family Member'], steps: ['Open dashboard', 'Filter records by role', 'Show current task state', 'Show clear empty state or errors'], failureModes: ['Kid sees sibling tasks', 'Dashboard hides awaiting approval tasks'], featureTriggers: ['parent dashboard', 'kid dashboard', 'mobile-friendly layout'], acceptancePattern: 'dashboard-view' })
        ],
        integrations: [
          integration({ name: 'Email Reminder Service', type: 'notification-delivery', aliases: ['email reminder service', 'email reminders', 'email service'], purpose: 'Send approved household reminders after the reminder content and delivery rules are validated.', required: false, trigger: 'Only when the team explicitly approves live reminder delivery.', requirementRefs: ['Reminder Rule'], failureModes: ['Email address missing', 'Reminder exposes child-sensitive detail', 'Delivery is delayed or duplicated'], envVar: 'EMAIL_REMINDER_SERVICE_API_KEY', mockedByDefault: true })
        ],
        risks: [
          risk({ name: 'Child visibility leak', type: 'privacy', description: 'A child sees tasks or household details that belong only to adults or siblings.', appliesToEntities: ['Family Member', 'Household Task'], appliesToActors: ['Child User'], appliesToWorkflows: ['Household setup', 'Dashboard review'], mitigationNow: 'Default every child-facing view to assigned-only and review sample child scenarios before build handoff.', mitigationLater: 'Add stronger audit logs only if the MVP expands beyond local-first sharing.', verification: 'Test a child profile that should see only one task and confirm adult-only tasks remain hidden.' }),
          risk({ name: 'Approval bottleneck', type: 'operational', description: 'Tasks stall because parent review is unclear or too slow.', appliesToEntities: ['Completion Review', 'Household Task'], appliesToActors: ['Parent Admin', 'Co-Parent'], appliesToWorkflows: ['Completion approval'], mitigationNow: 'Define how pending reviews appear on the parent dashboard and what happens when a review is delayed.', mitigationLater: 'Add escalation or batching only after the core workflow proves useful.', verification: 'Create a pending review and confirm the parent dashboard highlights it until a decision is made.' }),
          risk({ name: 'Reminder confusion', type: 'trust', description: 'Reminder timing or content confuses the family or leaks too much detail.', appliesToEntities: ['Reminder Rule'], appliesToActors: ['Parent Admin', 'Child User'], appliesToWorkflows: ['Reminder planning'], mitigationNow: 'Keep reminder content short, store only approved fields, and default live delivery to mocked mode.', mitigationLater: 'Add delivery analytics only if live reminders become part of scope.', verification: 'Review a mock reminder and confirm it contains only the task title, due date, and allowed recipient.' }),
          risk({ name: 'Stale household task data', type: 'operational', description: 'Tasks stay outdated, causing the family to trust the wrong status.', appliesToEntities: ['Household Task'], appliesToActors: ['Parent Admin', 'Co-Parent', 'Child User'], appliesToWorkflows: ['Task assignment', 'Dashboard review'], mitigationNow: 'Require clear task states and timestamps in the dashboard and data model.', mitigationLater: 'Automate stale-task cleanup only after the manual flow proves necessary.', verification: 'Move a task through created, awaiting-approval, and approved states and confirm each state is still visible.' })
        ]
      };
    case 'family-readiness':
      return {
        actors: [
          actor('Parent Organizer', 'organizer', ['parent organizer', 'family organizer', 'parent'], ['Maintain the readiness workspace', 'Review caveats'], ['All readiness records']),
          actor('Trusted Adult', 'trusted-adult', ['co-parent', 'trusted caregiver', 'adult family member'], ['Read assigned readiness materials', 'Confirm role expectations'], ['Shared readiness materials']),
          actor('Household Reviewer', 'reviewer', ['reviewer', 'family reviewer'], ['Check boundary language', 'Confirm information is current'], ['Caveats and role summaries'])
        ],
        entities: [
          entity({ name: 'Readiness Workspace', type: 'workspace', core: true, description: 'Container for the household readiness plan.', fields: [field('workspaceId', 'id', 'Stable readiness workspace identifier.', 'privvy-home-001'), field('householdName', 'string', 'Household label.', 'Nguyen Family'), field('lastReviewDate', 'date', 'Most recent plan review date.', '2026-05-01')], relationships: ['Owns Adult Member records', 'Owns Emergency Contact records'], ownerActors: ['Parent Organizer'], riskTypes: ['Outdated readiness information'], sample: { workspaceId: 'privvy-home-001', householdName: 'Nguyen Family', lastReviewDate: '2026-05-01' } }),
          entity({ name: 'Adult Member', type: 'person', core: true, description: 'Adult role inside the readiness plan.', aliases: ['family member', 'household role'], fields: [field('memberId', 'id', 'Stable adult identifier.', 'adult-rina'), field('displayName', 'string', 'Adult member name.', 'Rina Nguyen'), field('roleSummary', 'string', 'Plain-language role in the plan.', 'Primary organizer'), field('contactNote', 'string', 'How the household reaches this adult.', 'Cell listed in private contact sheet')], relationships: ['Belongs to Readiness Workspace'], ownerActors: ['Parent Organizer'], riskTypes: ['Outdated readiness information'], sample: { memberId: 'adult-rina', displayName: 'Rina Nguyen', roleSummary: 'Primary organizer', contactNote: 'Cell listed in private contact sheet' } }),
          entity({ name: 'Emergency Contact', type: 'contact', core: true, description: 'Important household contact and contact purpose.', fields: [field('contactId', 'id', 'Stable contact identifier.', 'contact-pediatrician'), field('name', 'string', 'Contact name.', 'Dr. Lee Office'), field('relationship', 'string', 'Why this contact matters.', 'Pediatrician office'), field('phone', 'string', 'Primary phone number.', '555-0134'), field('notes', 'string', 'Critical caveat or timing note.', 'Call during office hours for records questions')], relationships: ['Belongs to Readiness Workspace'], ownerActors: ['Parent Organizer'], riskTypes: ['Outdated readiness information'], sample: { contactId: 'contact-pediatrician', name: 'Dr. Lee Office', relationship: 'Pediatrician office', phone: '555-0134', notes: 'Call during office hours for records questions' } }),
          entity({ name: 'Document Reference', type: 'document-reference', core: true, description: 'Reference to a readiness document without copying its contents into the wrong place.', aliases: ['document checklist', 'document link'], fields: [field('documentId', 'id', 'Stable document reference identifier.', 'doc-insurance-card'), field('label', 'string', 'Document label.', 'Insurance card copy'), field('locationHint', 'string', 'Where the household finds it.', 'Locked folder in home office'), field('reviewStatus', 'enum', 'Whether the document reference is current.', 'current'), field('sensitivity', 'enum', 'Sensitivity level for this reference.', 'high')], relationships: ['Belongs to Readiness Workspace'], ownerActors: ['Parent Organizer'], riskTypes: ['Privacy overclaim'], sample: { documentId: 'doc-insurance-card', label: 'Insurance card copy', locationHint: 'Locked folder in home office', reviewStatus: 'current', sensitivity: 'high' } }),
          entity({ name: 'Boundary Note', type: 'boundary', core: true, description: 'Explicit caveat about what the product does not do.', aliases: ['caveat notes', 'emergency-mode boundaries', 'boundary disclaimers'], fields: [field('noteId', 'id', 'Stable caveat identifier.', 'boundary-legal-advice'), field('topic', 'string', 'Boundary topic.', 'No legal advice'), field('statement', 'string', 'Plain-language caveat.', 'This workspace organizes information but does not replace a lawyer or emergency service.'), field('audience', 'string', 'Who must see the caveat.', 'All adults')], relationships: ['Belongs to Readiness Workspace'], ownerActors: ['Parent Organizer', 'Household Reviewer'], riskTypes: ['Boundary overclaim'], sample: { noteId: 'boundary-legal-advice', topic: 'No legal advice', statement: 'This workspace organizes information but does not replace a lawyer or emergency service.', audience: 'All adults' } })
        ],
        workflows: [
          workflow({ name: 'Readiness setup', type: 'workspace-setup', aliases: ['readiness overview', 'household roles'], description: 'Create the family readiness workspace and define adult roles.', primaryActors: ['Parent Organizer'], entityRefs: ['Readiness Workspace', 'Adult Member'], steps: ['Create workspace', 'Name adult roles', 'Record review date'], failureModes: ['Roles are unclear', 'Plan has no review date'], featureTriggers: ['readiness overview', 'household roles'], acceptancePattern: 'workspace-setup' }),
          workflow({ name: 'Contact and document review', type: 'record-create', aliases: ['emergency contact list', 'document checklist'], description: 'Record critical contacts and document references with reviewable notes.', primaryActors: ['Parent Organizer'], entityRefs: ['Emergency Contact', 'Document Reference'], steps: ['Record contact', 'Record document reference', 'Review completeness'], failureModes: ['Critical contact missing', 'Document location is vague'], featureTriggers: ['emergency contact list', 'document checklist'], acceptancePattern: 'record-create' }),
          workflow({ name: 'Boundary review', type: 'review-approval', aliases: ['caveat notes', 'emergency-mode boundaries'], description: 'Keep the product explicit about what it does and does not do.', primaryActors: ['Parent Organizer', 'Household Reviewer'], entityRefs: ['Boundary Note'], steps: ['Write caveat', 'Review caveat', 'Keep caveat visible'], failureModes: ['Language sounds like legal advice', 'Emergency mode overclaims authority'], featureTriggers: ['caveat notes', 'emergency-mode boundaries'], acceptancePattern: 'review-approval' }),
          workflow({ name: 'Adult handoff', type: 'handoff', aliases: ['handoff workflow', 'share roles'], description: 'Share the right readiness context with other adults.', primaryActors: ['Parent Organizer', 'Trusted Adult'], entityRefs: ['Adult Member', 'Boundary Note', 'Document Reference'], steps: ['Choose adult', 'Share role summary', 'Confirm caveat visibility'], failureModes: ['Trusted adult gets incomplete instructions', 'Sensitive document detail is overshared'], featureTriggers: ['handoff workflow'], acceptancePattern: 'handoff' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Boundary overclaim', type: 'legal', description: 'The workspace sounds like legal advice or an emergency response product.', appliesToEntities: ['Boundary Note'], appliesToActors: ['Parent Organizer', 'Household Reviewer'], appliesToWorkflows: ['Boundary review'], mitigationNow: 'Keep explicit no-legal-advice and no-emergency-dispatch caveats in the core workflow.', mitigationLater: 'Only add expert-approved language if regulated use cases are introduced.', verification: 'Read the boundary note aloud and confirm it states the product limits clearly.' }),
          risk({ name: 'Outdated readiness information', type: 'operational', description: 'Contacts or document references become stale and create false confidence.', appliesToEntities: ['Emergency Contact', 'Document Reference', 'Readiness Workspace'], appliesToActors: ['Parent Organizer', 'Trusted Adult'], appliesToWorkflows: ['Readiness setup', 'Contact and document review'], mitigationNow: 'Record a last-review date and keep review status visible.', mitigationLater: 'Add reminders only after the household proves it needs them.', verification: 'Confirm each critical record has a last review signal and a current status.' }),
          risk({ name: 'Privacy overclaim', type: 'privacy', description: 'Sensitive family information is stored or shared more broadly than needed.', appliesToEntities: ['Document Reference', 'Emergency Contact'], appliesToActors: ['Parent Organizer', 'Trusted Adult'], appliesToWorkflows: ['Adult handoff'], mitigationNow: 'Store references and caveats, not unnecessary copies of sensitive documents.', mitigationLater: 'Add stronger sharing controls only if the MVP expands beyond trusted adults.', verification: 'Review a document reference and confirm it points to a location without exposing extra personal detail.' })
        ]
      };
    case 'sdr-sales':
      return {
        actors: [
          actor('SDR', 'seller', ['sdr', 'sales development rep', 'sales rep'], ['Qualify leads', 'Score engagement', 'Prepare handoff'], ['Lead and scoring records']),
          actor('Sales Manager', 'manager', ['sales manager', 'manager'], ['Review qualification consistency', 'Inspect blocked leads'], ['Lead review views']),
          actor('Account Executive', 'downstream-owner', ['account executive', 'ae'], ['Accept or reject qualified handoffs'], ['Qualified handoff packets'])
        ],
        entities: [
          entity({ name: 'Lead', type: 'lead', core: true, description: 'Prospect record under qualification.', fields: [field('leadId', 'id', 'Stable lead identifier.', 'lead-acme'), field('companyName', 'string', 'Prospect company.', 'Acme Manufacturing'), field('contactName', 'string', 'Primary contact.', 'Jordan Kim'), field('stage', 'enum', 'Current pipeline stage.', 'qualified'), field('fitSignal', 'string', 'Primary qualification signal.', 'Multi-location team with active pain')], relationships: ['Owns Engagement Score and Follow-up Activity'], ownerActors: ['SDR'], riskTypes: ['Vague qualification'], sample: { leadId: 'lead-acme', companyName: 'Acme Manufacturing', contactName: 'Jordan Kim', stage: 'qualified', fitSignal: 'Multi-location team with active pain' } }),
          entity({ name: 'Engagement Score', type: 'score', core: true, description: 'Scored engagement signal for a lead.', aliases: ['lead scoring', 'qualification scores'], fields: [field('scoreId', 'id', 'Stable score identifier.', 'score-acme-1'), field('leadId', 'reference', 'Lead under review.', 'lead-acme'), field('score', 'number', 'Current engagement score.', '78'), field('reason', 'string', 'Why the score was assigned.', 'Requested demo after second reply'), field('updatedAt', 'datetime', 'Most recent score update.', '2026-05-01T10:00:00Z')], relationships: ['References Lead'], ownerActors: ['SDR'], riskTypes: ['Inconsistent follow-up'], sample: { scoreId: 'score-acme-1', leadId: 'lead-acme', score: 78, reason: 'Requested demo after second reply', updatedAt: '2026-05-01T10:00:00Z' } }),
          entity({ name: 'Qualification Review', type: 'review', core: true, description: 'Decision record that explains advance, block, or revisit outcomes.', aliases: ['lead qualification criteria', 'blocked-lead review'], fields: [field('reviewId', 'id', 'Stable review identifier.', 'qual-acme-1'), field('leadId', 'reference', 'Lead under review.', 'lead-acme'), field('decision', 'enum', 'Qualification result.', 'advance'), field('advanceSignal', 'string', 'Signal that justified advancement.', 'Confirmed pain and timeline'), field('blockReason', 'string', 'Reason the lead is blocked if not advanced.', 'No active project this quarter')], relationships: ['References Lead'], ownerActors: ['SDR', 'Sales Manager'], riskTypes: ['Vague qualification'], sample: { reviewId: 'qual-acme-1', leadId: 'lead-acme', decision: 'advance', advanceSignal: 'Confirmed pain and timeline', blockReason: '' } }),
          entity({ name: 'Handoff Packet', type: 'handoff', core: true, description: 'Context passed from the SDR to the AE.', aliases: ['rep handoff checklist', 'handoff'], fields: [field('handoffId', 'id', 'Stable handoff identifier.', 'handoff-acme-1'), field('leadId', 'reference', 'Qualified lead.', 'lead-acme'), field('summary', 'string', 'Concise handoff summary.', 'Pain confirmed, multi-site ops, wants pricing call'), field('nextStep', 'string', 'Expected AE action.', 'Book discovery call'), field('acceptedByAe', 'boolean', 'Whether the AE accepted the handoff.', 'true')], relationships: ['References Lead and Qualification Review'], ownerActors: ['SDR', 'Account Executive'], riskTypes: ['Lost handoff context'], sample: { handoffId: 'handoff-acme-1', leadId: 'lead-acme', summary: 'Pain confirmed, multi-site ops, wants pricing call', nextStep: 'Book discovery call', acceptedByAe: true } }),
          entity({ name: 'Follow-up Activity', type: 'activity', core: true, description: 'Documented outreach or review step.', aliases: ['follow-up rules', 'follow-up history'], fields: [field('activityId', 'id', 'Stable activity identifier.', 'followup-acme-3'), field('leadId', 'reference', 'Lead tied to the activity.', 'lead-acme'), field('channel', 'enum', 'Outreach or review channel.', 'email'), field('outcome', 'string', 'Observed outcome.', 'Replied with meeting request'), field('nextActionDate', 'date', 'Required next step date.', '2026-05-03')], relationships: ['References Lead'], ownerActors: ['SDR'], riskTypes: ['Inconsistent follow-up'], sample: { activityId: 'followup-acme-3', leadId: 'lead-acme', channel: 'email', outcome: 'Replied with meeting request', nextActionDate: '2026-05-03' } })
        ],
        workflows: [
          workflow({ name: 'Lead qualification', type: 'threshold-alert', aliases: ['lead qualification criteria', 'qualification'], description: 'Apply explicit advance and block signals to each lead.', primaryActors: ['SDR'], entityRefs: ['Lead', 'Qualification Review'], steps: ['Review lead facts', 'Apply criteria', 'Record advance or block signal'], failureModes: ['Qualification rule is vague', 'Lead is advanced without evidence'], featureTriggers: ['lead qualification criteria', 'blocked-lead review'], acceptancePattern: 'threshold-alert' }),
          workflow({ name: 'Engagement scoring', type: 'threshold-alert', aliases: ['engagement scoring', 'lead scoring'], description: 'Score engagement in a repeatable way.', primaryActors: ['SDR'], entityRefs: ['Lead', 'Engagement Score'], steps: ['Review engagement events', 'Apply score', 'Record reason'], failureModes: ['Score changes without reason', 'No one can explain the threshold'], featureTriggers: ['engagement scoring'], acceptancePattern: 'threshold-alert' }),
          workflow({ name: 'AE handoff', type: 'handoff', aliases: ['rep handoff checklist', 'handoff'], description: 'Pass a qualified lead to an AE with enough context to continue.', primaryActors: ['SDR', 'Account Executive'], entityRefs: ['Lead', 'Handoff Packet', 'Qualification Review'], steps: ['Prepare summary', 'State next step', 'AE accepts or rejects'], failureModes: ['AE gets thin context', 'Lead is handed off without qualification signal'], featureTriggers: ['rep handoff checklist'], acceptancePattern: 'handoff' }),
          workflow({ name: 'Follow-up tracking', type: 'status-transition', aliases: ['follow-up rules', 'pipeline status'], description: 'Keep next actions and pipeline state explicit.', primaryActors: ['SDR', 'Sales Manager'], entityRefs: ['Lead', 'Follow-up Activity'], steps: ['Record follow-up', 'Set next action', 'Update stage'], failureModes: ['Next action date missing', 'Pipeline stage drifts from reality'], featureTriggers: ['follow-up rules', 'pipeline status'], acceptancePattern: 'status-transition' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Vague qualification', type: 'product', description: 'The SDR cannot explain why a lead advanced or was blocked.', appliesToEntities: ['Qualification Review', 'Lead'], appliesToActors: ['SDR', 'Sales Manager'], appliesToWorkflows: ['Lead qualification'], mitigationNow: 'Require at least one explicit advance signal and one explicit block signal in the review record.', mitigationLater: 'Tune the criteria only after several real reviews expose gaps.', verification: 'Inspect one advanced and one blocked lead and confirm both decisions cite a concrete signal.' }),
          risk({ name: 'Lost handoff context', type: 'operational', description: 'The AE receives a lead without the context needed to continue the conversation.', appliesToEntities: ['Handoff Packet'], appliesToActors: ['SDR', 'Account Executive'], appliesToWorkflows: ['AE handoff'], mitigationNow: 'Make the handoff packet include pain, next step, and recent engagement signal.', mitigationLater: 'Add richer CRM sync only if later scope approves it.', verification: 'Read one handoff packet and confirm an AE could run the next call from it.' }),
          risk({ name: 'Inconsistent follow-up', type: 'operational', description: 'Leads stall because follow-up timing is not recorded clearly.', appliesToEntities: ['Follow-up Activity'], appliesToActors: ['SDR', 'Sales Manager'], appliesToWorkflows: ['Follow-up tracking'], mitigationNow: 'Store the next action date and latest outcome with every follow-up.', mitigationLater: 'Automate reminders only after the manual tracking flow is stable.', verification: 'Inspect two follow-up activities and confirm both include a next action date.' })
        ]
      };
    case 'restaurant-ordering':
      return {
        actors: [
          actor('Pickup Customer', 'customer', ['customer', 'pickup customer'], ['Create pickup orders', 'Track ready status'], ['Own order status']),
          actor('Front Counter Staff', 'staff', ['restaurant staff', 'staff'], ['Confirm orders', 'Update pickup status'], ['All orders', 'Menu items']),
          actor('Kitchen Staff', 'kitchen', ['kitchen staff', 'kitchen'], ['Acknowledge and prepare orders'], ['Kitchen queue', 'Order items'])
        ],
        entities: [
          entity({ name: 'Menu Item', type: 'catalog-item', core: true, description: 'Orderable menu item.', aliases: ['menu browsing', 'menu items'], fields: [field('menuItemId', 'id', 'Stable menu item identifier.', 'menu-burger'), field('name', 'string', 'Item name.', 'House Burger'), field('price', 'currency', 'Pickup price.', '12.00'), field('availability', 'enum', 'Whether the item can be ordered.', 'available')], relationships: ['Referenced by Order Item'], ownerActors: ['Front Counter Staff'], riskTypes: ['Unavailable menu item'], sample: { menuItemId: 'menu-burger', name: 'House Burger', price: '12.00', availability: 'available' } }),
          entity({ name: 'Pickup Order', type: 'order', core: true, description: 'Customer pickup order.', aliases: ['order creation', 'orders'], fields: [field('orderId', 'id', 'Stable order identifier.', 'order-204'), field('customerName', 'string', 'Pickup customer name.', 'Lena Brooks'), field('status', 'enum', 'Current order state.', 'ready-for-pickup'), field('createdAt', 'datetime', 'Order creation time.', '2026-05-01T12:15:00Z'), field('pickupEta', 'datetime', 'Expected pickup time.', '2026-05-01T12:35:00Z')], relationships: ['Owns Order Item records', 'Owns Pickup Update records'], ownerActors: ['Pickup Customer', 'Front Counter Staff'], riskTypes: ['Order-state confusion'], sample: { orderId: 'order-204', customerName: 'Lena Brooks', status: 'ready-for-pickup', createdAt: '2026-05-01T12:15:00Z', pickupEta: '2026-05-01T12:35:00Z' } }),
          entity({ name: 'Order Item', type: 'line-item', core: true, description: 'Specific menu item inside an order.', aliases: ['order item'], fields: [field('orderItemId', 'id', 'Stable line item identifier.', 'order-204-item-1'), field('orderId', 'reference', 'Parent order.', 'order-204'), field('menuItemId', 'reference', 'Ordered menu item.', 'menu-burger'), field('quantity', 'number', 'How many the customer ordered.', '2'), field('specialInstructions', 'string', 'Kitchen-safe special note.', 'No pickles')], relationships: ['References Pickup Order and Menu Item'], ownerActors: ['Pickup Customer', 'Front Counter Staff'], riskTypes: ['Kitchen miss'], sample: { orderItemId: 'order-204-item-1', orderId: 'order-204', menuItemId: 'menu-burger', quantity: 2, specialInstructions: 'No pickles' } }),
          entity({ name: 'Kitchen Queue Entry', type: 'queue-entry', core: true, description: 'Kitchen acknowledgment and production record.', aliases: ['kitchen acknowledgment', 'kitchen queue'], fields: [field('queueEntryId', 'id', 'Stable queue identifier.', 'queue-204'), field('orderId', 'reference', 'Order in the kitchen.', 'order-204'), field('acknowledgedBy', 'string', 'Kitchen staff member who accepted it.', 'Ana'), field('cookStatus', 'enum', 'Current kitchen state.', 'in-progress'), field('readyAt', 'datetime', 'When the kitchen marked it ready.', '2026-05-01T12:30:00Z')], relationships: ['References Pickup Order'], ownerActors: ['Kitchen Staff'], riskTypes: ['Kitchen acknowledgment gap'], sample: { queueEntryId: 'queue-204', orderId: 'order-204', acknowledgedBy: 'Ana', cookStatus: 'in-progress', readyAt: null } }),
          entity({ name: 'Pickup Update', type: 'status-update', core: true, description: 'Customer-facing pickup status change.', aliases: ['ready-for-pickup status', 'customer pickup updates', 'order states'], fields: [field('updateId', 'id', 'Stable update identifier.', 'update-204-ready'), field('orderId', 'reference', 'Order receiving the update.', 'order-204'), field('status', 'enum', 'Customer-visible state.', 'ready-for-pickup'), field('message', 'string', 'Safe customer message.', 'Your order is ready for pickup.'), field('sentAt', 'datetime', 'When the update was recorded.', '2026-05-01T12:30:00Z')], relationships: ['References Pickup Order'], ownerActors: ['Front Counter Staff'], riskTypes: ['Order-state confusion'], sample: { updateId: 'update-204-ready', orderId: 'order-204', status: 'ready-for-pickup', message: 'Your order is ready for pickup.', sentAt: '2026-05-01T12:30:00Z' } })
        ],
        workflows: [
          workflow({ name: 'Menu ordering', type: 'record-create', aliases: ['menu browsing', 'order creation'], description: 'Customer creates a pickup order from the menu.', primaryActors: ['Pickup Customer'], entityRefs: ['Menu Item', 'Pickup Order', 'Order Item'], steps: ['Browse menu', 'Create order', 'Add items', 'Submit order'], failureModes: ['Unavailable item selected', 'Order saved without line items'], featureTriggers: ['menu browsing', 'order creation'], acceptancePattern: 'record-create' }),
          workflow({ name: 'Kitchen acknowledgment', type: 'status-transition', aliases: ['kitchen acknowledgment'], description: 'Staff confirms the order and kitchen acknowledges it.', primaryActors: ['Front Counter Staff', 'Kitchen Staff'], entityRefs: ['Pickup Order', 'Kitchen Queue Entry'], steps: ['Confirm order', 'Send to kitchen queue', 'Kitchen acknowledges'], failureModes: ['Kitchen never acknowledges order', 'Order bypasses the queue'], featureTriggers: ['kitchen acknowledgment'], acceptancePattern: 'status-transition' }),
          workflow({ name: 'Pickup status tracking', type: 'status-transition', aliases: ['order states', 'ready-for-pickup status', 'customer pickup updates'], description: 'Track the order from created to acknowledged to ready to picked up.', primaryActors: ['Front Counter Staff', 'Pickup Customer'], entityRefs: ['Pickup Order', 'Pickup Update'], steps: ['Update order state', 'Record customer-facing message', 'Mark picked up'], failureModes: ['Customer sees wrong status', 'Order skips a state'], featureTriggers: ['order states', 'ready-for-pickup status', 'customer pickup updates'], acceptancePattern: 'status-transition' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Order-state confusion', type: 'trust', description: 'Customer or staff cannot tell what state the order is in.', appliesToEntities: ['Pickup Order', 'Pickup Update'], appliesToActors: ['Pickup Customer', 'Front Counter Staff'], appliesToWorkflows: ['Pickup status tracking'], mitigationNow: 'Define the allowed order states explicitly and show them in order history.', mitigationLater: 'Add notifications only if the basic state map proves stable.', verification: 'Trace one order through created, acknowledged, in-progress, ready-for-pickup, and picked-up states.' }),
          risk({ name: 'Kitchen acknowledgment gap', type: 'operational', description: 'The kitchen does not clearly accept or reject an order.', appliesToEntities: ['Kitchen Queue Entry'], appliesToActors: ['Kitchen Staff', 'Front Counter Staff'], appliesToWorkflows: ['Kitchen acknowledgment'], mitigationNow: 'Require a queue acknowledgment record before the order can become in-progress.', mitigationLater: 'Optimize the queue display only after the baseline flow works.', verification: 'Inspect a kitchen queue entry and confirm the acknowledgedBy and cookStatus fields are present.' }),
          risk({ name: 'Kitchen miss', type: 'operational', description: 'Line items or instructions are wrong when the order reaches the kitchen.', appliesToEntities: ['Order Item'], appliesToActors: ['Pickup Customer', 'Kitchen Staff'], appliesToWorkflows: ['Menu ordering', 'Kitchen acknowledgment'], mitigationNow: 'Store quantity and special instructions on each order item, not only in free-form notes.', mitigationLater: 'Add modifier support only if the restaurant actually needs it.', verification: 'Open one order item and confirm quantity and special instructions are both present.' })
        ]
      };
    case 'budget-planner':
      return {
        actors: [
          actor('Budget Manager', 'owner', ['budget manager', 'household budget manager'], ['Record income and expenses', 'Run monthly review'], ['All budget records']),
          actor('Household Partner', 'partner', ['partner', 'household member'], ['Review shared spending summaries'], ['Approved summaries']),
          actor('Budget Reviewer', 'reviewer', ['reviewer', 'family reviewer'], ['Confirm non-advice boundaries stay visible'], ['Monthly review and disclaimer views'])
        ],
        entities: [
          entity({ name: 'Budget Category', type: 'category', core: true, description: 'Spending or income category.', aliases: ['expense categories', 'category tags'], fields: [field('categoryId', 'id', 'Stable category identifier.', 'cat-groceries'), field('name', 'string', 'Category label.', 'Groceries'), field('monthlyLimit', 'currency', 'Optional target amount.', '600.00'), field('categoryType', 'enum', 'Income or expense.', 'expense')], relationships: ['Referenced by Income Entry and Expense Entry'], ownerActors: ['Budget Manager'], riskTypes: ['Threshold mismatch'], sample: { categoryId: 'cat-groceries', name: 'Groceries', monthlyLimit: '600.00', categoryType: 'expense' } }),
          entity({ name: 'Income Entry', type: 'money-in', core: true, description: 'Recorded household income event.', aliases: ['income tracking', 'income entries'], fields: [field('incomeEntryId', 'id', 'Stable income entry identifier.', 'income-paycheck-1'), field('source', 'string', 'Where the income came from.', 'Primary paycheck'), field('amount', 'currency', 'Recorded amount.', '2800.00'), field('receivedOn', 'date', 'Date received.', '2026-05-01'), field('categoryId', 'reference', 'Related category.', 'cat-income-main')], relationships: ['References Budget Category'], ownerActors: ['Budget Manager'], riskTypes: ['Sensitive household finances'], sample: { incomeEntryId: 'income-paycheck-1', source: 'Primary paycheck', amount: '2800.00', receivedOn: '2026-05-01', categoryId: 'cat-income-main' } }),
          entity({ name: 'Expense Entry', type: 'money-out', core: true, description: 'Recorded household expense event.', aliases: ['expense entries'], fields: [field('expenseEntryId', 'id', 'Stable expense identifier.', 'expense-groceries-1'), field('merchant', 'string', 'Where the expense happened.', 'Fresh Market'), field('amount', 'currency', 'Recorded amount.', '142.75'), field('spentOn', 'date', 'Date spent.', '2026-05-02'), field('categoryId', 'reference', 'Related category.', 'cat-groceries')], relationships: ['References Budget Category'], ownerActors: ['Budget Manager'], riskTypes: ['Sensitive household finances'], sample: { expenseEntryId: 'expense-groceries-1', merchant: 'Fresh Market', amount: '142.75', spentOn: '2026-05-02', categoryId: 'cat-groceries' } }),
          entity({ name: 'Alert Rule', type: 'threshold-rule', core: true, description: 'Threshold that triggers a budget alert.', aliases: ['alert thresholds', 'alert rules'], fields: [field('ruleId', 'id', 'Stable alert rule identifier.', 'alert-groceries-80'), field('categoryId', 'reference', 'Category the threshold watches.', 'cat-groceries'), field('thresholdPercent', 'number', 'Percent of budget limit that triggers attention.', '80'), field('message', 'string', 'Neutral budget alert message.', 'Groceries are above 80% of the monthly target.')], relationships: ['References Budget Category'], ownerActors: ['Budget Manager'], riskTypes: ['Threshold mismatch'], sample: { ruleId: 'alert-groceries-80', categoryId: 'cat-groceries', thresholdPercent: 80, message: 'Groceries are above 80% of the monthly target.' } }),
          entity({ name: 'Monthly Review', type: 'review', core: true, description: 'Plain-language monthly spending review summary.', aliases: ['monthly review view', 'monthly summary notes'], fields: [field('reviewId', 'id', 'Stable monthly review identifier.', 'review-2026-05'), field('month', 'string', 'Month under review.', '2026-05'), field('summary', 'string', 'Plain-language summary.', 'Groceries stayed near plan but utilities were higher than expected.'), field('nonAdviceNotice', 'string', 'Boundary note for the review.', 'This planner tracks spending but does not provide financial advice.')], relationships: ['Summarizes Income Entry and Expense Entry'], ownerActors: ['Budget Manager', 'Budget Reviewer'], riskTypes: ['Financial advice overclaim'], sample: { reviewId: 'review-2026-05', month: '2026-05', summary: 'Groceries stayed near plan but utilities were higher than expected.', nonAdviceNotice: 'This planner tracks spending but does not provide financial advice.' } })
        ],
        workflows: [
          workflow({ name: 'Income and expense tracking', type: 'record-create', aliases: ['income tracking', 'shared household access'], description: 'Record income and expenses in shared categories.', primaryActors: ['Budget Manager'], entityRefs: ['Income Entry', 'Expense Entry', 'Budget Category'], steps: ['Record income', 'Record expense', 'Categorize each entry'], failureModes: ['Expense is uncategorized', 'Shared household member sees too much detail'], featureTriggers: ['income tracking', 'shared household access'], acceptancePattern: 'record-create' }),
          workflow({ name: 'Monthly review', type: 'dashboard-view', aliases: ['monthly review view'], description: 'Summarize recent budget activity without sounding like advice.', primaryActors: ['Budget Manager', 'Household Partner'], entityRefs: ['Monthly Review', 'Income Entry', 'Expense Entry'], steps: ['Open review', 'Compare categories', 'Read non-advice note'], failureModes: ['Review looks like financial advice', 'Summary hides missing entries'], featureTriggers: ['monthly review view', 'non-advice disclaimers'], acceptancePattern: 'dashboard-view' }),
          workflow({ name: 'Threshold alerting', type: 'threshold-alert', aliases: ['alert thresholds'], description: 'Warn the household when a category crosses an approved threshold.', primaryActors: ['Budget Manager'], entityRefs: ['Alert Rule', 'Budget Category', 'Expense Entry'], steps: ['Define threshold', 'Compare spend to threshold', 'Record alert state'], failureModes: ['Alert fires on wrong threshold', 'No supporting category data exists'], featureTriggers: ['alert thresholds'], acceptancePattern: 'threshold-alert' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Financial advice overclaim', type: 'legal', description: 'The planner sounds like it is giving financial advice instead of tracking information.', appliesToEntities: ['Monthly Review'], appliesToActors: ['Budget Manager', 'Household Partner'], appliesToWorkflows: ['Monthly review'], mitigationNow: 'Keep a non-advice notice visible in the review and avoid recommendation language.', mitigationLater: 'Get expert review before adding advice-like features.', verification: 'Read one monthly review and confirm it summarizes facts without telling the household what to invest or buy.' }),
          risk({ name: 'Sensitive household finances', type: 'privacy', description: 'Budget details are visible to the wrong person or stored more broadly than necessary.', appliesToEntities: ['Income Entry', 'Expense Entry'], appliesToActors: ['Budget Manager', 'Household Partner'], appliesToWorkflows: ['Income and expense tracking'], mitigationNow: 'Clarify which shared views show summaries versus transaction-level detail.', mitigationLater: 'Add finer access controls only if the shared household flow proves necessary.', verification: 'Confirm the shared household view can be described separately from the full budget-manager view.' }),
          risk({ name: 'Threshold mismatch', type: 'trust', description: 'Alerts fire at the wrong time or without enough context.', appliesToEntities: ['Alert Rule', 'Budget Category'], appliesToActors: ['Budget Manager'], appliesToWorkflows: ['Threshold alerting'], mitigationNow: 'Store the threshold value, category, and plain-language message together.', mitigationLater: 'Tune default thresholds only after real household usage reveals better numbers.', verification: 'Inspect one alert rule and confirm it names the category and threshold percent together.' })
        ]
      };
    case 'clinic-scheduler':
      return {
        actors: [
          actor('Clinic Scheduler', 'scheduler', ['clinic scheduler', 'scheduler', 'front-desk staff'], ['Book appointments', 'Resolve conflicts', 'Prepare reminder-safe messages'], ['Appointments', 'Provider availability']),
          actor('Provider', 'provider', ['provider', 'doctor', 'physician', 'nurse'], ['Offer availability', 'Review appointment load'], ['Own schedule']),
          actor('Practice Manager', 'manager', ['practice manager', 'manager'], ['Review scheduling safety', 'Inspect conflict patterns'], ['Schedule reviews', 'Conflict records'])
        ],
        entities: [
          entity({ name: 'Provider Availability', type: 'availability', core: true, description: 'Available provider time block.', aliases: ['provider availability'], fields: [field('availabilityId', 'id', 'Stable availability identifier.', 'avail-dr-lee-0900'), field('providerName', 'string', 'Provider assigned to the slot.', 'Dr. Lee'), field('startAt', 'datetime', 'Slot start time.', '2026-05-06T09:00:00'), field('endAt', 'datetime', 'Slot end time.', '2026-05-06T09:30:00'), field('slotStatus', 'enum', 'Current slot availability.', 'open')], relationships: ['Referenced by Appointment Request and Appointment'], ownerActors: ['Clinic Scheduler', 'Provider'], riskTypes: ['Double-booking'], sample: { availabilityId: 'avail-dr-lee-0900', providerName: 'Dr. Lee', startAt: '2026-05-06T09:00:00', endAt: '2026-05-06T09:30:00', slotStatus: 'open' } }),
          entity({ name: 'Appointment Request', type: 'request', core: true, description: 'Requested appointment before final booking.', aliases: ['appointment requests'], fields: [field('requestId', 'id', 'Stable request identifier.', 'req-hernandez-1'), field('patientLabel', 'string', 'Minimum-safe patient label.', 'Hernandez family follow-up'), field('requestedDate', 'date', 'Requested appointment date.', '2026-05-06'), field('requestedProvider', 'string', 'Requested provider name.', 'Dr. Lee'), field('requestStatus', 'enum', 'Current request state.', 'pending')], relationships: ['May become Appointment'], ownerActors: ['Clinic Scheduler'], riskTypes: ['Reminder privacy leak'], sample: { requestId: 'req-hernandez-1', patientLabel: 'Hernandez family follow-up', requestedDate: '2026-05-06', requestedProvider: 'Dr. Lee', requestStatus: 'pending' } }),
          entity({ name: 'Appointment', type: 'appointment', core: true, description: 'Confirmed scheduled visit.', aliases: ['schedule review'], fields: [field('appointmentId', 'id', 'Stable appointment identifier.', 'appt-hernandez-1'), field('requestId', 'reference', 'Original request.', 'req-hernandez-1'), field('providerName', 'string', 'Assigned provider.', 'Dr. Lee'), field('startAt', 'datetime', 'Appointment start time.', '2026-05-06T09:00:00'), field('status', 'enum', 'Current appointment state.', 'booked')], relationships: ['References Provider Availability and Appointment Request'], ownerActors: ['Clinic Scheduler', 'Provider'], riskTypes: ['Double-booking'], sample: { appointmentId: 'appt-hernandez-1', requestId: 'req-hernandez-1', providerName: 'Dr. Lee', startAt: '2026-05-06T09:00:00', status: 'booked' } }),
          entity({ name: 'Reminder Plan', type: 'notification-rule', core: true, description: 'Privacy-safe reminder content plan.', aliases: ['reminder planning', 'reminder preferences'], fields: [field('reminderPlanId', 'id', 'Stable reminder plan identifier.', 'reminder-appt-hernandez-1'), field('appointmentId', 'reference', 'Appointment being reminded.', 'appt-hernandez-1'), field('channel', 'enum', 'Approved reminder channel.', 'mock-sms'), field('safeMessage', 'string', 'Message without clinical details.', 'You have an appointment tomorrow at 9:00 AM.'), field('sendAt', 'datetime', 'Planned send time.', '2026-05-05T09:00:00')], relationships: ['References Appointment'], ownerActors: ['Clinic Scheduler'], riskTypes: ['Reminder privacy leak'], sample: { reminderPlanId: 'reminder-appt-hernandez-1', appointmentId: 'appt-hernandez-1', channel: 'mock-sms', safeMessage: 'You have an appointment tomorrow at 9:00 AM.', sendAt: '2026-05-05T09:00:00' } }),
          entity({ name: 'Conflict Record', type: 'conflict', core: true, description: 'Logged scheduling conflict and resolution.', aliases: ['conflict handling', 'conflict states'], fields: [field('conflictId', 'id', 'Stable conflict identifier.', 'conflict-dr-lee-0900'), field('availabilityId', 'reference', 'Conflicting slot.', 'avail-dr-lee-0900'), field('reason', 'string', 'What caused the conflict.', 'Two requests attempted the same slot'), field('resolution', 'string', 'How the conflict was handled.', 'Second request moved to 9:30 AM'), field('resolvedBy', 'string', 'Scheduler or manager who resolved it.', 'Ava')], relationships: ['References Provider Availability and Appointment Request'], ownerActors: ['Clinic Scheduler', 'Practice Manager'], riskTypes: ['Double-booking'], sample: { conflictId: 'conflict-dr-lee-0900', availabilityId: 'avail-dr-lee-0900', reason: 'Two requests attempted the same slot', resolution: 'Second request moved to 9:30 AM', resolvedBy: 'Ava' } })
        ],
        workflows: [
          workflow({ name: 'Availability review', type: 'dashboard-view', aliases: ['provider availability', 'schedule review'], description: 'Review provider slots before booking an appointment.', primaryActors: ['Clinic Scheduler', 'Provider'], entityRefs: ['Provider Availability', 'Appointment'], steps: ['Open availability', 'Review open slots', 'Confirm slot still open'], failureModes: ['Availability is stale', 'Scheduler books without checking slot status'], featureTriggers: ['provider availability', 'schedule review'], acceptancePattern: 'dashboard-view' }),
          workflow({ name: 'Appointment booking', type: 'assignment', aliases: ['appointment requests'], description: 'Convert a request into a confirmed appointment.', primaryActors: ['Clinic Scheduler'], entityRefs: ['Appointment Request', 'Appointment', 'Provider Availability'], steps: ['Review request', 'Choose provider slot', 'Book appointment'], failureModes: ['Slot already taken', 'Request lacks a provider or date'], featureTriggers: ['appointment requests'], acceptancePattern: 'assignment' }),
          workflow({ name: 'Conflict handling', type: 'conflict-resolution', aliases: ['conflict handling'], description: 'Stop double-booking and record the resolution.', primaryActors: ['Clinic Scheduler', 'Practice Manager'], entityRefs: ['Conflict Record', 'Provider Availability', 'Appointment Request'], steps: ['Detect overlap', 'Block duplicate booking', 'Record resolution'], failureModes: ['Second booking silently overwrites the first', 'Conflict is resolved without explanation'], featureTriggers: ['conflict handling'], acceptancePattern: 'conflict-resolution' }),
          workflow({ name: 'Reminder boundary planning', type: 'notification', aliases: ['reminder planning', 'privacy-safe communication boundaries'], description: 'Prepare reminder-safe content without sensitive clinical detail.', primaryActors: ['Clinic Scheduler'], entityRefs: ['Reminder Plan', 'Appointment'], steps: ['Choose reminder channel', 'Draft safe reminder text', 'Store planned send time'], failureModes: ['Message includes clinical detail', 'Reminder assumes a live delivery service'], featureTriggers: ['reminder planning', 'privacy-safe communication boundaries'], acceptancePattern: 'notification' })
        ],
        integrations: [
          integration({ name: 'SMS Reminder Service', type: 'notification-delivery', aliases: ['sms', 'text message', 'twilio'], purpose: 'Send appointment reminders only after privacy-safe wording and live delivery approval exist.', required: false, trigger: 'Only when the team explicitly approves live reminder delivery.', requirementRefs: ['Reminder Plan'], failureModes: ['Reminder channel is unapproved', 'Message leaks sensitive detail', 'Delivery fails or is delayed'], envVar: 'SMS_REMINDER_SERVICE_API_KEY', mockedByDefault: true })
        ],
        risks: [
          risk({ name: 'Double-booking', type: 'operational', description: 'Two patients are assigned to the same provider slot.', appliesToEntities: ['Provider Availability', 'Appointment', 'Conflict Record'], appliesToActors: ['Clinic Scheduler', 'Provider'], appliesToWorkflows: ['Appointment booking', 'Conflict handling'], mitigationNow: 'Treat slot status as authoritative and require a conflict record for every overlap.', mitigationLater: 'Add concurrency controls only after the MVP leaves the local planning flow.', verification: 'Attempt to book the same slot twice and confirm the second booking is blocked with a conflict record.' }),
          risk({ name: 'Reminder privacy leak', type: 'privacy', description: 'Reminder content reveals sensitive clinical information.', appliesToEntities: ['Reminder Plan', 'Appointment Request'], appliesToActors: ['Clinic Scheduler'], appliesToWorkflows: ['Reminder boundary planning'], mitigationNow: 'Store reminder-safe wording separately from clinical notes and review it explicitly.', mitigationLater: 'Get privacy review before adding richer notification channels.', verification: 'Inspect the reminder plan and confirm the message names only date, time, and location-safe details.' }),
          risk({ name: 'Stale provider availability', type: 'operational', description: 'Availability looks current but no longer reflects reality.', appliesToEntities: ['Provider Availability'], appliesToActors: ['Clinic Scheduler', 'Provider'], appliesToWorkflows: ['Availability review'], mitigationNow: 'Keep slotStatus visible and tie bookings to a specific availability record.', mitigationLater: 'Add sync or reconciliation only if later integrations are approved.', verification: 'Inspect one booked appointment and confirm its source availability record is referenced.' })
        ]
      };
    case 'hoa-maintenance':
      return {
        actors: [
          actor('Resident', 'resident', ['resident', 'hoa resident'], ['Submit requests', 'Track request status'], ['Own requests']),
          actor('Board Coordinator', 'board', ['board member', 'hoa board', 'coordinator'], ['Triage requests', 'Assign vendors'], ['All requests', 'Assignments']),
          actor('Vendor', 'vendor', ['vendor', 'maintenance vendor'], ['Receive assignments', 'Update completion status'], ['Assigned work'])
        ],
        entities: [
          entity({ name: 'Maintenance Request', type: 'request', core: true, description: 'Resident-submitted maintenance issue.', aliases: ['request submission', 'requests'], fields: [field('requestId', 'id', 'Stable request identifier.', 'req-334'), field('residentUnit', 'string', 'Resident unit or building label.', 'Building A / Unit 12'), field('issueTitle', 'string', 'Plain-language request summary.', 'Hallway light out'), field('priority', 'enum', 'Severity level.', 'medium'), field('status', 'enum', 'Current request state.', 'triaged')], relationships: ['Owns Vendor Assignment and Status Update'], ownerActors: ['Resident', 'Board Coordinator'], riskTypes: ['Resident visibility gap'], sample: { requestId: 'req-334', residentUnit: 'Building A / Unit 12', issueTitle: 'Hallway light out', priority: 'medium', status: 'triaged' } }),
          entity({ name: 'Vendor Assignment', type: 'assignment', core: true, description: 'Vendor assigned to a maintenance request.', aliases: ['vendor assignment'], fields: [field('assignmentId', 'id', 'Stable assignment identifier.', 'assign-334'), field('requestId', 'reference', 'Request being assigned.', 'req-334'), field('vendorName', 'string', 'Vendor handling the work.', 'BrightFix Electric'), field('assignedAt', 'datetime', 'Assignment time.', '2026-05-02T09:00:00Z'), field('assignmentStatus', 'enum', 'Current assignment state.', 'accepted')], relationships: ['References Maintenance Request'], ownerActors: ['Board Coordinator', 'Vendor'], riskTypes: ['Vendor stall'], sample: { assignmentId: 'assign-334', requestId: 'req-334', vendorName: 'BrightFix Electric', assignedAt: '2026-05-02T09:00:00Z', assignmentStatus: 'accepted' } }),
          entity({ name: 'Status Update', type: 'status-update', core: true, description: 'Resident-visible update on request progress.', aliases: ['status updates', 'status history'], fields: [field('updateId', 'id', 'Stable update identifier.', 'update-334-1'), field('requestId', 'reference', 'Request receiving the update.', 'req-334'), field('status', 'enum', 'Visible request state.', 'vendor-scheduled'), field('message', 'string', 'Resident-friendly progress note.', 'Vendor visit scheduled for Tuesday morning.'), field('updatedAt', 'datetime', 'When the update was recorded.', '2026-05-02T10:15:00Z')], relationships: ['References Maintenance Request'], ownerActors: ['Board Coordinator', 'Vendor'], riskTypes: ['Resident visibility gap'], sample: { updateId: 'update-334-1', requestId: 'req-334', status: 'vendor-scheduled', message: 'Vendor visit scheduled for Tuesday morning.', updatedAt: '2026-05-02T10:15:00Z' } }),
          entity({ name: 'Triage Decision', type: 'review', core: true, description: 'Board triage decision for the request.', aliases: ['triage'], fields: [field('triageId', 'id', 'Stable triage identifier.', 'triage-334'), field('requestId', 'reference', 'Request under triage.', 'req-334'), field('decision', 'enum', 'Current triage decision.', 'assign-vendor'), field('boardNote', 'string', 'Reason for the decision.', 'Electrical issue in shared hallway'), field('targetResponseDate', 'date', 'Expected response date.', '2026-05-04')], relationships: ['References Maintenance Request'], ownerActors: ['Board Coordinator'], riskTypes: ['Request stall'], sample: { triageId: 'triage-334', requestId: 'req-334', decision: 'assign-vendor', boardNote: 'Electrical issue in shared hallway', targetResponseDate: '2026-05-04' } })
        ],
        workflows: [
          workflow({ name: 'Resident submission', type: 'record-create', aliases: ['request submission'], description: 'Resident creates a maintenance request.', primaryActors: ['Resident'], entityRefs: ['Maintenance Request'], steps: ['Describe issue', 'Set priority', 'Submit request'], failureModes: ['Issue lacks enough detail', 'Resident cannot tell the request was submitted'], featureTriggers: ['request submission'], acceptancePattern: 'record-create' }),
          workflow({ name: 'Board triage', type: 'review-approval', aliases: ['triage'], description: 'Board reviews the request and decides next action.', primaryActors: ['Board Coordinator'], entityRefs: ['Maintenance Request', 'Triage Decision'], steps: ['Review request', 'Assign priority', 'Choose next step'], failureModes: ['Request sits untriaged', 'Decision is not visible to residents'], featureTriggers: ['triage'], acceptancePattern: 'review-approval' }),
          workflow({ name: 'Vendor assignment', type: 'assignment', aliases: ['vendor assignment'], description: 'Assign a vendor and record acceptance.', primaryActors: ['Board Coordinator', 'Vendor'], entityRefs: ['Vendor Assignment', 'Maintenance Request'], steps: ['Choose vendor', 'Record assignment', 'Vendor accepts or declines'], failureModes: ['Vendor is assigned without a target date', 'Resident never sees vendor progress'], featureTriggers: ['vendor assignment'], acceptancePattern: 'assignment' }),
          workflow({ name: 'Resident status tracking', type: 'status-transition', aliases: ['status updates'], description: 'Keep request status visible to the resident from submission to close.', primaryActors: ['Resident', 'Board Coordinator'], entityRefs: ['Maintenance Request', 'Status Update'], steps: ['Publish update', 'Show current state', 'Close request'], failureModes: ['Status never changes', 'Resident sees internal-only notes'], featureTriggers: ['status updates'], acceptancePattern: 'status-transition' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Resident visibility gap', type: 'trust', description: 'Residents cannot tell whether anything is happening with their request.', appliesToEntities: ['Maintenance Request', 'Status Update'], appliesToActors: ['Resident'], appliesToWorkflows: ['Resident status tracking'], mitigationNow: 'Make request status history resident-visible in plain language.', mitigationLater: 'Add push notifications only after the core tracking loop works.', verification: 'Read one request and confirm the resident-visible status history explains what happens next.' }),
          risk({ name: 'Vendor stall', type: 'operational', description: 'Vendor work stalls without a visible owner or next date.', appliesToEntities: ['Vendor Assignment'], appliesToActors: ['Board Coordinator', 'Vendor'], appliesToWorkflows: ['Vendor assignment'], mitigationNow: 'Store assignedAt, assignmentStatus, and expected response timing.', mitigationLater: 'Automate escalations only if the board proves it needs them.', verification: 'Inspect one vendor assignment and confirm it includes vendor name, acceptance state, and assignment time.' }),
          risk({ name: 'Request stall', type: 'operational', description: 'Requests sit in triage without a clear next step.', appliesToEntities: ['Triage Decision', 'Maintenance Request'], appliesToActors: ['Board Coordinator'], appliesToWorkflows: ['Board triage'], mitigationNow: 'Require a triage decision and target response date for each request.', mitigationLater: 'Tune priority rules only after a baseline request history exists.', verification: 'Open one triage decision and confirm both the decision and target response date are present.' })
        ]
      };
    case 'school-club':
      return {
        actors: [
          actor('Student Member', 'student', ['student', 'member'], ['Join clubs', 'View events and announcements'], ['Allowed club content']),
          actor('Club Organizer', 'organizer', ['organizer', 'club organizer'], ['Manage membership and events'], ['Club records']),
          actor('Club Advisor', 'advisor', ['advisor', 'teacher advisor'], ['Review permissions and student-facing content'], ['All club oversight views'])
        ],
        entities: [
          entity({ name: 'Club Membership', type: 'membership', core: true, description: 'Student membership record for a club.', aliases: ['membership'], fields: [field('membershipId', 'id', 'Stable membership identifier.', 'clubmember-001'), field('studentName', 'string', 'Student display name.', 'Nora Patel'), field('role', 'enum', 'Member role.', 'member'), field('status', 'enum', 'Membership status.', 'active')], relationships: ['References Club Event attendance and Announcement visibility'], ownerActors: ['Club Organizer', 'Club Advisor'], riskTypes: ['Student privacy boundary'], sample: { membershipId: 'clubmember-001', studentName: 'Nora Patel', role: 'member', status: 'active' } }),
          entity({ name: 'Club Event', type: 'event', core: true, description: 'Planned club event.', aliases: ['events'], fields: [field('eventId', 'id', 'Stable event identifier.', 'event-spring-fair'), field('title', 'string', 'Event title.', 'Spring Fair Booth Shift'), field('startAt', 'datetime', 'Event start time.', '2026-05-10T15:00:00'), field('capacity', 'number', 'Maximum sign-ups.', '12'), field('status', 'enum', 'Current event status.', 'open')], relationships: ['References Club Membership sign-ups'], ownerActors: ['Club Organizer', 'Club Advisor'], riskTypes: ['Capacity confusion'], sample: { eventId: 'event-spring-fair', title: 'Spring Fair Booth Shift', startAt: '2026-05-10T15:00:00', capacity: 12, status: 'open' } }),
          entity({ name: 'Announcement', type: 'announcement', core: true, description: 'Club announcement visible to permitted members.', aliases: ['announcements'], fields: [field('announcementId', 'id', 'Stable announcement identifier.', 'announce-01'), field('title', 'string', 'Announcement title.', 'Poster pickup moved to room 214'), field('audience', 'enum', 'Who can see the announcement.', 'members-only'), field('publishedAt', 'datetime', 'Publish time.', '2026-05-03T12:00:00Z')], relationships: ['Targets Club Membership roles'], ownerActors: ['Club Organizer', 'Club Advisor'], riskTypes: ['Student privacy boundary'], sample: { announcementId: 'announce-01', title: 'Poster pickup moved to room 214', audience: 'members-only', publishedAt: '2026-05-03T12:00:00Z' } }),
          entity({ name: 'Permission Rule', type: 'permission', core: true, description: 'Role-based visibility and action rule.', aliases: ['permissions'], fields: [field('permissionRuleId', 'id', 'Stable rule identifier.', 'perm-member-events'), field('role', 'enum', 'Role the rule applies to.', 'member'), field('resource', 'string', 'Protected resource.', 'event sign-up'), field('accessLevel', 'enum', 'Allowed action.', 'view-and-sign-up')], relationships: ['Applies to Club Membership, Club Event, and Announcement'], ownerActors: ['Club Advisor', 'Club Organizer'], riskTypes: ['Student privacy boundary'], sample: { permissionRuleId: 'perm-member-events', role: 'member', resource: 'event sign-up', accessLevel: 'view-and-sign-up' } })
        ],
        workflows: [
          workflow({ name: 'Membership management', type: 'workspace-setup', aliases: ['membership'], description: 'Manage who belongs to the club and what role they have.', primaryActors: ['Club Organizer', 'Club Advisor'], entityRefs: ['Club Membership', 'Permission Rule'], steps: ['Add member', 'Set role', 'Confirm permission rules'], failureModes: ['Student keeps access after leaving club', 'Role permissions are unclear'], featureTriggers: ['membership', 'permissions'], acceptancePattern: 'workspace-setup' }),
          workflow({ name: 'Event sign-up', type: 'assignment', aliases: ['events'], description: 'Let students sign up for club events while respecting capacity.', primaryActors: ['Student Member', 'Club Organizer'], entityRefs: ['Club Event', 'Club Membership'], steps: ['Open event', 'Check capacity', 'Sign up member'], failureModes: ['Event exceeds capacity', 'Student signs up without active membership'], featureTriggers: ['events'], acceptancePattern: 'assignment' }),
          workflow({ name: 'Announcement publishing', type: 'status-transition', aliases: ['announcements'], description: 'Publish club updates to the right students.', primaryActors: ['Club Organizer', 'Club Advisor'], entityRefs: ['Announcement', 'Permission Rule'], steps: ['Draft announcement', 'Choose audience', 'Publish update'], failureModes: ['Announcement reaches the wrong audience', 'Announcement stays hidden from intended members'], featureTriggers: ['announcements'], acceptancePattern: 'status-transition' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Student privacy boundary', type: 'privacy', description: 'Students can see private club content or actions outside their role.', appliesToEntities: ['Club Membership', 'Announcement', 'Permission Rule'], appliesToActors: ['Student Member'], appliesToWorkflows: ['Membership management', 'Announcement publishing'], mitigationNow: 'Store permission rules explicitly and tie every view to a club role.', mitigationLater: 'Add finer club-level policy tools only if advisors request them.', verification: 'Test a student member and confirm they see only announcements and events approved for members.' }),
          risk({ name: 'Capacity confusion', type: 'operational', description: 'Events overfill or show the wrong availability.', appliesToEntities: ['Club Event'], appliesToActors: ['Student Member', 'Club Organizer'], appliesToWorkflows: ['Event sign-up'], mitigationNow: 'Store capacity on the event record and block sign-up once the limit is reached.', mitigationLater: 'Add waitlists only if real event demand requires them.', verification: 'Fill an event to capacity and confirm the next sign-up attempt is blocked clearly.' })
        ]
      };
    case 'volunteer-manager':
      return {
        actors: [
          actor('Volunteer Organizer', 'organizer', ['organizer', 'event organizer'], ['Create shifts', 'Assign volunteers', 'Track gaps'], ['All event records']),
          actor('Volunteer', 'volunteer', ['volunteer'], ['Claim or accept assignments', 'Check in'], ['Own assignments']),
          actor('Check-In Lead', 'lead', ['check-in lead', 'shift lead'], ['Record attendance', 'Flag no-shows'], ['Check-in records'])
        ],
        entities: [
          entity({ name: 'Volunteer Profile', type: 'person', core: true, description: 'Volunteer identity and role preferences.', aliases: ['volunteer'], fields: [field('volunteerId', 'id', 'Stable volunteer identifier.', 'vol-kai'), field('displayName', 'string', 'Volunteer name.', 'Kai Morgan'), field('skills', 'string', 'Relevant role skills.', 'setup, welcome desk'), field('status', 'enum', 'Current volunteer status.', 'active')], relationships: ['Owns Shift Assignment and Check-In Record'], ownerActors: ['Volunteer Organizer'], riskTypes: ['Coverage gap'], sample: { volunteerId: 'vol-kai', displayName: 'Kai Morgan', skills: 'setup, welcome desk', status: 'active' } }),
          entity({ name: 'Event Shift', type: 'shift', core: true, description: 'Volunteer shift that needs coverage.', aliases: ['shift', 'event'], fields: [field('shiftId', 'id', 'Stable shift identifier.', 'shift-setup-1'), field('title', 'string', 'Shift title.', 'Setup crew'), field('startAt', 'datetime', 'Shift start time.', '2026-05-12T08:00:00'), field('neededCount', 'number', 'How many volunteers are needed.', '4'), field('status', 'enum', 'Current shift status.', 'needs-coverage')], relationships: ['Owns Shift Assignment and Check-In Record'], ownerActors: ['Volunteer Organizer'], riskTypes: ['Coverage gap'], sample: { shiftId: 'shift-setup-1', title: 'Setup crew', startAt: '2026-05-12T08:00:00', neededCount: 4, status: 'needs-coverage' } }),
          entity({ name: 'Shift Assignment', type: 'assignment', core: true, description: 'Volunteer assigned to a shift.', aliases: ['assignment'], fields: [field('assignmentId', 'id', 'Stable assignment identifier.', 'assign-kai-setup-1'), field('shiftId', 'reference', 'Shift being covered.', 'shift-setup-1'), field('volunteerId', 'reference', 'Volunteer assigned.', 'vol-kai'), field('assignmentStatus', 'enum', 'Current assignment state.', 'confirmed')], relationships: ['References Event Shift and Volunteer Profile'], ownerActors: ['Volunteer Organizer', 'Volunteer'], riskTypes: ['Coverage gap'], sample: { assignmentId: 'assign-kai-setup-1', shiftId: 'shift-setup-1', volunteerId: 'vol-kai', assignmentStatus: 'confirmed' } }),
          entity({ name: 'Check-In Record', type: 'attendance', core: true, description: 'Attendance record for a volunteer shift.', aliases: ['check-in', 'checkin'], fields: [field('checkInId', 'id', 'Stable check-in identifier.', 'checkin-kai-setup-1'), field('assignmentId', 'reference', 'Assignment being checked in.', 'assign-kai-setup-1'), field('checkedInAt', 'datetime', 'Actual check-in time.', '2026-05-12T07:55:00'), field('attendanceStatus', 'enum', 'Present, late, or no-show.', 'present')], relationships: ['References Shift Assignment'], ownerActors: ['Check-In Lead'], riskTypes: ['Attendance mismatch'], sample: { checkInId: 'checkin-kai-setup-1', assignmentId: 'assign-kai-setup-1', checkedInAt: '2026-05-12T07:55:00', attendanceStatus: 'present' } })
        ],
        workflows: [
          workflow({ name: 'Shift planning', type: 'workspace-setup', aliases: ['event', 'shift'], description: 'Create shifts and record how many volunteers are needed.', primaryActors: ['Volunteer Organizer'], entityRefs: ['Event Shift'], steps: ['Create shift', 'Set needed count', 'Publish open shift'], failureModes: ['Shift has no needed count', 'Shift timing is unclear'], featureTriggers: ['event', 'shift'], acceptancePattern: 'workspace-setup' }),
          workflow({ name: 'Volunteer assignment', type: 'assignment', aliases: ['assignment'], description: 'Assign volunteers to the shifts that need coverage.', primaryActors: ['Volunteer Organizer', 'Volunteer'], entityRefs: ['Volunteer Profile', 'Event Shift', 'Shift Assignment'], steps: ['Choose volunteer', 'Confirm fit', 'Store assignment'], failureModes: ['Shift exceeds capacity', 'Volunteer assigned to two overlapping shifts'], featureTriggers: ['assignment'], acceptancePattern: 'assignment' }),
          workflow({ name: 'Check-in tracking', type: 'status-transition', aliases: ['check-in', 'checkin'], description: 'Record who actually showed up and who did not.', primaryActors: ['Check-In Lead', 'Volunteer Organizer'], entityRefs: ['Shift Assignment', 'Check-In Record'], steps: ['Open assignment', 'Record arrival', 'Flag no-show'], failureModes: ['Volunteer is present but marked absent', 'No-show is never recorded'], featureTriggers: ['check-in'], acceptancePattern: 'status-transition' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Coverage gap', type: 'operational', description: 'Critical shifts do not have enough volunteers.', appliesToEntities: ['Event Shift', 'Shift Assignment'], appliesToActors: ['Volunteer Organizer'], appliesToWorkflows: ['Shift planning', 'Volunteer assignment'], mitigationNow: 'Store neededCount and assignment status per shift so open gaps stay visible.', mitigationLater: 'Add waitlists or auto-fill logic only after the manual process proves necessary.', verification: 'Inspect one shift and confirm the organizer can tell whether it is fully covered.' }),
          risk({ name: 'Attendance mismatch', type: 'trust', description: 'Check-in records do not match what happened on event day.', appliesToEntities: ['Check-In Record'], appliesToActors: ['Check-In Lead', 'Volunteer Organizer'], appliesToWorkflows: ['Check-in tracking'], mitigationNow: 'Record check-in time and attendance status in the same record.', mitigationLater: 'Add QR or badge systems only after the baseline check-in flow works.', verification: 'Inspect one check-in record and confirm it includes both the timestamp and attendance status.' })
        ]
      };
    case 'inventory':
      return {
        actors: [
          actor('Inventory Manager', 'manager', ['inventory manager', 'stock manager'], ['Track stock', 'Review low-stock alerts', 'Approve adjustments'], ['All stock records']),
          actor('Staff Operator', 'operator', ['staff', 'stock staff'], ['Record adjustments', 'Count stock'], ['Stock counts and assigned tasks']),
          actor('Purchasing Reviewer', 'reviewer', ['buyer', 'purchasing reviewer'], ['Review reorder plans'], ['Reorder plans'])
        ],
        entities: [
          entity({ name: 'Stock Item', type: 'inventory-item', core: true, description: 'Tracked item in the business inventory.', aliases: ['inventory', 'stock', 'product'], fields: [field('stockItemId', 'id', 'Stable stock item identifier.', 'item-blue-mug'), field('name', 'string', 'Item name.', 'Blue Ceramic Mug'), field('quantityOnHand', 'number', 'Current count.', '18'), field('reorderThreshold', 'number', 'Low-stock threshold.', '10'), field('status', 'enum', 'Current stock state.', 'in-stock')], relationships: ['Owns Stock Adjustment and Reorder Plan records'], ownerActors: ['Inventory Manager', 'Staff Operator'], riskTypes: ['Low-stock blind spot'], sample: { stockItemId: 'item-blue-mug', name: 'Blue Ceramic Mug', quantityOnHand: 18, reorderThreshold: 10, status: 'in-stock' } }),
          entity({ name: 'Stock Adjustment', type: 'adjustment', core: true, description: 'Manual inventory adjustment with reason.', aliases: ['adjustment'], fields: [field('adjustmentId', 'id', 'Stable adjustment identifier.', 'adj-blue-mug-1'), field('stockItemId', 'reference', 'Item being adjusted.', 'item-blue-mug'), field('delta', 'number', 'Count change.', '-2'), field('reason', 'string', 'Why the count changed.', 'Damaged during unpacking'), field('recordedAt', 'datetime', 'When the adjustment was recorded.', '2026-05-02T09:30:00Z')], relationships: ['References Stock Item'], ownerActors: ['Staff Operator', 'Inventory Manager'], riskTypes: ['Unexplained adjustment'], sample: { adjustmentId: 'adj-blue-mug-1', stockItemId: 'item-blue-mug', delta: -2, reason: 'Damaged during unpacking', recordedAt: '2026-05-02T09:30:00Z' } }),
          entity({ name: 'Reorder Plan', type: 'reorder', core: true, description: 'Plan for replenishing low-stock items.', aliases: ['purchase plan', 'reorder'], fields: [field('reorderPlanId', 'id', 'Stable reorder plan identifier.', 'reorder-blue-mug'), field('stockItemId', 'reference', 'Item being reordered.', 'item-blue-mug'), field('recommendedQuantity', 'number', 'Suggested reorder quantity.', '24'), field('decisionStatus', 'enum', 'Current reorder decision.', 'needs-review'), field('supplierNote', 'string', 'Relevant supplier note.', 'Preferred vendor ships weekly')], relationships: ['References Stock Item'], ownerActors: ['Inventory Manager', 'Purchasing Reviewer'], riskTypes: ['Low-stock blind spot'], sample: { reorderPlanId: 'reorder-blue-mug', stockItemId: 'item-blue-mug', recommendedQuantity: 24, decisionStatus: 'needs-review', supplierNote: 'Preferred vendor ships weekly' } })
        ],
        workflows: [
          workflow({ name: 'Stock tracking', type: 'dashboard-view', aliases: ['inventory', 'stock'], description: 'See current stock quantity and low-stock risk.', primaryActors: ['Inventory Manager', 'Staff Operator'], entityRefs: ['Stock Item'], steps: ['Open item list', 'Review quantity', 'Check threshold status'], failureModes: ['Count is stale', 'Low stock is not visible'], featureTriggers: ['inventory', 'stock'], acceptancePattern: 'dashboard-view' }),
          workflow({ name: 'Stock adjustment', type: 'record-create', aliases: ['adjustment'], description: 'Record why an item count changed.', primaryActors: ['Staff Operator', 'Inventory Manager'], entityRefs: ['Stock Adjustment', 'Stock Item'], steps: ['Select item', 'Enter delta', 'Record reason'], failureModes: ['Adjustment has no reason', 'Quantity changes without history'], featureTriggers: ['adjustment'], acceptancePattern: 'record-create' }),
          workflow({ name: 'Reorder planning', type: 'threshold-alert', aliases: ['purchase plan', 'reorder threshold'], description: 'Create a reorder plan when stock drops below threshold.', primaryActors: ['Inventory Manager', 'Purchasing Reviewer'], entityRefs: ['Stock Item', 'Reorder Plan'], steps: ['Compare quantity to threshold', 'Recommend reorder quantity', 'Review decision'], failureModes: ['Low-stock item has no plan', 'Reorder suggestion lacks supplier note'], featureTriggers: ['purchase plan', 'reorder threshold'], acceptancePattern: 'threshold-alert' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Low-stock blind spot', type: 'operational', description: 'Items need replenishment but the team cannot see it in time.', appliesToEntities: ['Stock Item', 'Reorder Plan'], appliesToActors: ['Inventory Manager', 'Purchasing Reviewer'], appliesToWorkflows: ['Stock tracking', 'Reorder planning'], mitigationNow: 'Store quantityOnHand and reorderThreshold together on every stock item.', mitigationLater: 'Automate supplier integrations only after the team proves the manual plan is useful.', verification: 'Inspect one low-stock item and confirm the quantity and threshold appear on the same record.' }),
          risk({ name: 'Unexplained adjustment', type: 'trust', description: 'Inventory counts change without a reason, so staff stop trusting the numbers.', appliesToEntities: ['Stock Adjustment'], appliesToActors: ['Staff Operator', 'Inventory Manager'], appliesToWorkflows: ['Stock adjustment'], mitigationNow: 'Require a reason and recordedAt timestamp for every adjustment.', mitigationLater: 'Add approvals only if the baseline adjustment history reveals abuse or confusion.', verification: 'Open one stock adjustment and confirm it includes delta, reason, and recordedAt.' })
        ]
      };
    default:
      return {
        actors: [
          actor('Primary User', 'primary-user', ['user', 'primary user'], ['Complete the main workflow'], ['Core records']),
          actor('Reviewer', 'reviewer', ['reviewer', 'approver'], ['Review and approve sensitive steps'], ['Review records'])
        ],
        entities: [
          entity({
            name: 'Core Record',
            type: 'core-record',
            core: true,
            description: 'Primary business record for the product.',
            aliases: ['record'],
            fields: [
              field('recordId', 'id', 'Stable record identifier.', 'record-001'),
              field('title', 'string', 'Main label for the record.', 'Primary workflow record'),
              field('status', 'enum', 'Current workflow state.', 'active')
            ],
            relationships: ['Referenced by support workflow records'],
            ownerActors: ['Primary User'],
            riskTypes: ['Generic workflow risk'],
            sample: { recordId: 'record-001', title: 'Primary workflow record', status: 'active' }
          }),
          entity({
            name: 'Member Profile',
            type: 'person',
            core: true,
            description: 'Primary or reviewing actor account associated with the workspace.',
            aliases: ['member', 'user profile'],
            fields: [
              field('memberId', 'id', 'Stable member identifier.', 'member-001'),
              field('displayName', 'string', 'Human-readable member name.', 'Alex Reviewer'),
              field('role', 'enum', 'Primary role for this member.', 'primary-user')
            ],
            relationships: ['Owns Core Record entries', 'Acts on Audit Entry records'],
            ownerActors: ['Primary User', 'Reviewer'],
            riskTypes: ['Generic workflow risk'],
            sample: { memberId: 'member-001', displayName: 'Alex Reviewer', role: 'primary-user' }
          }),
          entity({
            name: 'Audit Entry',
            type: 'audit',
            core: true,
            description: 'Immutable record of who changed a Core Record and when, used for review traceability.',
            aliases: ['audit log', 'history'],
            fields: [
              field('entryId', 'id', 'Stable audit identifier.', 'audit-001'),
              field('recordId', 'id', 'Core Record referenced by this audit entry.', 'record-001'),
              field('actorMemberId', 'id', 'Member who performed the action.', 'member-001'),
              field('action', 'enum', 'Action performed.', 'state-change'),
              field('recordedAt', 'datetime', 'Server timestamp the entry was recorded.', '2026-04-30T10:00:00Z')
            ],
            relationships: ['References Core Record', 'References Member Profile'],
            ownerActors: ['Primary User', 'Reviewer'],
            riskTypes: ['Generic workflow risk'],
            sample: { entryId: 'audit-001', recordId: 'record-001', actorMemberId: 'member-001', action: 'state-change', recordedAt: '2026-04-30T10:00:00Z' }
          })
        ],
        workflows: [
          workflow({ name: 'Core workflow', type: 'record-create', aliases: ['workflow', 'core workflow'], description: 'Primary business workflow inferred from the brief.', primaryActors: ['Primary User'], entityRefs: ['Core Record', 'Audit Entry'], steps: ['Create core record', 'Record audit entry', 'Update state', 'Review outcome'], failureModes: ['Core record is missing required details', 'Workflow outcome is not visible', 'Audit entry is not written when state changes'], featureTriggers: ['workflow'], acceptancePattern: 'record-create' })
        ],
        integrations: [],
        risks: [
          risk({ name: 'Generic workflow risk', type: 'product', description: 'The workflow stays vague and no one can tell what should happen next.', appliesToEntities: ['Core Record'], appliesToActors: ['Primary User', 'Reviewer'], appliesToWorkflows: ['Core workflow'], mitigationNow: 'Name the actor, data, and decision points explicitly in the requirements and architecture.', mitigationLater: 'Add more specific guardrails only after the domain becomes clearer.', verification: 'Read one requirement and confirm it names the actor, action, stored data, and failure case.' })
        ]
      };
  }
}

function inferActors(audienceSegments: string[], blueprint: Blueprint) {
  const audience = audienceSegments.join(' ');
  const matched = blueprint.actors.filter((candidate) => containsAny(audience, candidate.aliases));
  return matched.length ? matched : blueprint.actors.slice(0, Math.min(blueprint.actors.length, 3));
}

function inferEntities(sourcePhrases: string[], blueprint: Blueprint) {
  const normalizedSource = sourcePhrases.map(normalize).join(' ');
  const matched = blueprint.entities.filter((candidate) => {
    if (candidate.core) return true;
    return candidate.aliases.some((alias) => normalizedSource.includes(normalize(alias)));
  });
  return matched.length ? matched : blueprint.entities.filter((candidate) => candidate.core);
}

function inferIntegrations(
  sourcePhrases: string[],
  nonGoals: string[],
  constraints: string[],
  blueprint: Blueprint,
  workflows: OntologyWorkflow[]
) {
  const normalizedSource = sourcePhrases.map(normalize).join(' ');
  const normalizedNonGoals = nonGoals.map(normalize).join(' ');
  const normalizedConstraints = constraints.map(normalize).join(' ');

  return blueprint.integrations.filter((candidate) => {
    const blocked =
      candidate.aliases.some((alias) => normalizedNonGoals.includes(normalize(alias))) ||
      normalizedNonGoals.includes(`no ${normalize(candidate.name)}`) ||
      normalizedConstraints.includes(`no ${normalize(candidate.name)}`);
    if (blocked) return false;

    const directMention = candidate.aliases.some((alias) => normalizedSource.includes(normalize(alias)));
    const workflowNeed = workflows.some((workflow) =>
      workflow.entityRefs.some((ref) => candidate.requirementRefs.includes(ref))
    );
    return directMention || workflowNeed;
  });
}

function inferRisks(blueprint: Blueprint, riskFlags: RiskFlag[], entities: OntologyEntity[], workflows: OntologyWorkflow[]) {
  const entityNames = new Set(entities.map((entity) => entity.name));
  const workflowNames = new Set(workflows.map((workflow) => workflow.name));
  return blueprint.risks.filter((candidate) => {
    const linkedEntity = candidate.appliesToEntities.some((name) => entityNames.has(name));
    const linkedWorkflow = candidate.appliesToWorkflows.some((name) => workflowNames.has(name));
    const flagMatch =
      (riskFlags.includes('children') && /child|student/i.test(candidate.name + candidate.description)) ||
      (riskFlags.includes('medical') && /medical|clinical|privacy/i.test(candidate.name + candidate.description)) ||
      (riskFlags.includes('money') && /financial|budget|threshold/i.test(candidate.name + candidate.description)) ||
      (riskFlags.includes('legal') && /legal|boundary/i.test(candidate.name + candidate.description)) ||
      (riskFlags.includes('privacy') && /privacy|visibility|sensitive/i.test(candidate.name + candidate.description));
    return linkedEntity || linkedWorkflow || flagMatch;
  });
}

function getFieldsForPhrase(entity: OntologyEntity, phrase: string) {
  return entity.fields.filter((candidate) => containsAny(phrase, candidate.aliases));
}

function chooseWorkflowForFeature(feature: string, workflows: OntologyWorkflow[]) {
  return (
    workflows.find((candidate) => candidate.featureTriggers.some((trigger) => containsAny(feature, [trigger]))) ||
    workflows.find((candidate) => candidate.aliases.some((alias) => containsAny(feature, [alias]))) ||
    workflows[0]
  );
}

function chooseEntityMatchesForFeature(feature: string, entities: OntologyEntity[], workflowChoice: OntologyWorkflow) {
  const byAlias = entities.filter((candidate) => candidate.aliases.some((alias) => containsAny(feature, [alias])));
  if (byAlias.length) return byAlias;
  const byWorkflow = entities.filter((candidate) => workflowChoice.entityRefs.includes(candidate.name));
  return byWorkflow.length ? byWorkflow : entities.slice(0, 1);
}

function chooseIntegrationsForFeature(feature: string, integrations: OntologyIntegration[], entities: OntologyEntity[]) {
  return integrations.filter((candidate) => {
    const aliasMatch = candidate.aliases.some((alias) => containsAny(feature, [alias]));
    const entityMatch = entities.some((entity) => candidate.requirementRefs.includes(entity.name));
    return aliasMatch || entityMatch;
  });
}

function chooseActorForFeature(feature: string, workflowChoice: OntologyWorkflow, actors: OntologyActor[]) {
  const workflowActor = workflowChoice.primaryActors[0];
  const matched =
    actors.find((candidate) => candidate.name === workflowActor) ||
    actors.find((candidate) => candidate.aliases.some((alias) => containsAny(feature, [alias])));
  return matched || actors[0];
}

function chooseScenarioType(
  feature: string,
  workflowChoice: OntologyWorkflow,
  entities: OntologyEntity[],
  integrations: OntologyIntegration[]
) {
  const featureText = normalize(feature);
  // 1. Feature-text patterns take priority so individual features do not inherit generic workflow fallbacks
  if (integrations.length || /email|sms|notification|alert|remind/.test(featureText)) return 'notification';
  if (/role|permission|visibility|profile/.test(featureText)) return 'role-access';
  if (/dashboard|view|overview/.test(featureText)) return 'dashboard-view';
  if (/approve|confirm|triage/.test(featureText)) return 'review-approval';
  if (/assign|book|schedule|handoff|share/.test(featureText)) return 'assignment';
  if (/state|status|queue|check-in|checkin/.test(featureText)) return 'status-transition';
  if (/threshold|score|priority|rule/.test(featureText)) return 'threshold-alert';
  if (/setup|workspace|membership/.test(featureText)) return 'workspace-setup';
  if (/signup|registration|join/.test(featureText)) return 'assignment';
  if (/handling|manage|management/.test(featureText)) return 'status-transition';
  if (/tracking|history|log/.test(featureText)) return 'status-transition';
  if (/review|inspect/.test(featureText)) return 'dashboard-view';
  if (/create|add|new/.test(featureText)) return 'record-create';
  // 2. Entity-level conflict signal
  if (entities.some((entity) => entity.type === 'conflict')) return 'conflict-resolution';
  // 3. Workflow-level fallback only if no feature-specific pattern matched
  if (workflowChoice.acceptancePattern === 'review-approval' && /review/.test(featureText)) return 'review-approval';
  return workflowChoice.acceptancePattern || 'record-create';
}

function chooseRisksForScenario(
  feature: string,
  scenarioType: string,
  entities: OntologyEntity[],
  workflows: OntologyWorkflow[],
  risks: OntologyRisk[]
) {
  const entityNames = new Set(entities.map((entity) => entity.name));
  const workflowNames = new Set(workflows.map((workflow) => workflow.name));
  const matched = risks.filter((candidate) => {
    const entityMatch = candidate.appliesToEntities.some((name) => entityNames.has(name));
    const workflowMatch = candidate.appliesToWorkflows.some((name) => workflowNames.has(name));
    const typeMatch = normalize(candidate.type) === normalize(scenarioType) || containsAny(feature, [candidate.name]);
    return entityMatch || workflowMatch || typeMatch;
  });
  return matched.length ? matched.slice(0, 2) : risks.slice(0, 2);
}

function renderStoredData(entities: OntologyEntity[], fields: OntologyField[], integrations: OntologyIntegration[]) {
  const entitySummary = entities.map((entity) => entity.name).join(', ');
  const fieldSummary = unique(fields.map((candidate) => candidate.name)).join(', ');
  const integrationSummary = integrations.length
    ? ` Delivery channel assumptions stay in ${integrations.map((candidate) => candidate.name).join(', ')} mock mode until approval.`
    : '';
  return fieldSummary
    ? `${entitySummary} records store ${fieldSummary}.${integrationSummary}`
    : `${entitySummary} records store the state needed for the workflow.${integrationSummary}`;
}

function renderUserAction(feature: string, scenarioType: string, actorName: string, entities: OntologyEntity[]) {
  const mainEntity = entities[0]?.name || 'record';
  const featureLower = feature.toLowerCase();
  // Feature-specific overrides for common must-have features to reduce template repetition
  if (featureLower.includes('creation') || featureLower.includes('create')) {
    return `${actorName} creates a new ${mainEntity} record as part of ${feature}, filling the required fields and saving it.`;
  }
  if (featureLower.includes('assignment') || featureLower.includes('assign')) {
    return `${actorName} assigns an existing ${mainEntity} to the correct owner or role, confirming the link is stored.`;
  }
  if (featureLower.includes('due date') || featureLower.includes('deadline')) {
    return `${actorName} sets or changes a due date on a ${mainEntity}, confirming the date is visible to the assignee.`;
  }
  if (featureLower.includes('priority')) {
    return `${actorName} sets or changes the priority level on a ${mainEntity}, confirming the order is updated.`;
  }
  if (featureLower.includes('status')) {
    return `${actorName} updates the status of a ${mainEntity}, confirming the new state is visible to the right roles.`;
  }
  if (featureLower.includes('dashboard') || featureLower.includes('view')) {
    return `${actorName} opens the ${feature} and inspects current ${mainEntity} records, empty states, and filters.`;
  }
  if (featureLower.includes('reminder') || featureLower.includes('notification')) {
    return `${actorName} configures or reviews the reminder-safe ${feature} rule before any live delivery occurs.`;
  }
  if (featureLower.includes('approval') || featureLower.includes('review')) {
    return `${actorName} reviews ${mainEntity} and records an explicit approve, reject, or triage decision for ${feature}.`;
  }
  switch (scenarioType) {
    case 'workspace-setup':
      return `${actorName} creates or updates the ${mainEntity} configuration for ${feature}.`;
    case 'role-access':
      return `${actorName} opens ${feature} and tries the role-specific action or view tied to ${mainEntity}.`;
    case 'assignment':
      return `${actorName} assigns or schedules ${mainEntity} work while setting the required owner, time, or destination.`;
    case 'review-approval':
      return `${actorName} reviews ${mainEntity} and records an explicit approve, reject, or triage decision.`;
    case 'dashboard-view':
      return `${actorName} opens the ${feature} view to inspect current ${mainEntity} records.`;
    case 'notification':
      return `${actorName} configures or reviews the reminder-safe ${feature} rule before any live delivery occurs.`;
    case 'status-transition':
      return `${actorName} changes the ${mainEntity} state as the workflow progresses through ${feature}.`;
    case 'threshold-alert':
      return `${actorName} records the threshold, score, or rule needed for ${feature}.`;
    case 'conflict-resolution':
      return `${actorName} attempts a conflicting action inside ${feature} and resolves it with a documented outcome.`;
    default:
      return `${actorName} completes the main action for ${feature} using the ${mainEntity} record.`;
  }
}

function renderSystemResponse(
  feature: string,
  scenarioType: string,
  workflowChoice: OntologyWorkflow,
  entities: OntologyEntity[],
  integrations: OntologyIntegration[]
) {
  const mainEntity = entities[0]?.name || 'record';
  const featureLower = feature.toLowerCase();
  if (featureLower.includes('creation') || featureLower.includes('create')) {
    return `The system creates the ${mainEntity} record, assigns defaults, and makes it visible to allowed roles.`;
  }
  if (featureLower.includes('assignment') || featureLower.includes('assign')) {
    return `The system links the ${mainEntity} to the chosen owner and updates the assignee view.`;
  }
  if (featureLower.includes('due date') || featureLower.includes('deadline')) {
    return `The system stores the due date on the ${mainEntity} and shows it in the assignee timeline.`;
  }
  if (featureLower.includes('priority')) {
    return `The system updates the priority field on the ${mainEntity} and re-sorts the relevant lists.`;
  }
  if (featureLower.includes('status')) {
    return `The system records the new status on the ${mainEntity} and notifies the next actor in the workflow.`;
  }
  if (featureLower.includes('dashboard') || featureLower.includes('view')) {
    return `The system renders current ${mainEntity} records, empty states, and role-appropriate filters.`;
  }
  if (featureLower.includes('reminder') || featureLower.includes('notification')) {
    return integrations.length
      ? `The system stores the ${feature} rule locally and keeps ${integrations.map((candidate) => candidate.name).join(', ')} mocked until approved.`
      : `The system stores the ${feature} rule locally and keeps delivery behavior reviewable without a live service.`;
  }
  switch (scenarioType) {
    case 'workspace-setup':
      return `The system stores the ${mainEntity} configuration, applies the workflow defaults, and exposes the right follow-up steps from ${workflowChoice.name}.`;
    case 'role-access':
      return `The system shows only the allowed ${mainEntity} data and blocks unauthorized access with a clear explanation.`;
    case 'assignment':
      return `The system stores the assignment, links it to the right ${mainEntity} record, and shows the next owner what changed.`;
    case 'review-approval':
      return `The system records the decision, updates the ${mainEntity} state, and keeps the reason visible to the next reviewer.`;
    case 'dashboard-view':
      return `The system shows current ${mainEntity} records, empty states, and blockers in a role-appropriate view.`;
    case 'notification':
      return integrations.length
        ? `The system stores the rule locally and keeps ${integrations.map((candidate) => candidate.name).join(', ')} mocked until a live delivery decision is approved.`
        : `The system stores the reminder rule locally and keeps delivery behavior reviewable without a live service.`;
    case 'status-transition':
      return `The system updates the ${mainEntity} state, preserves history, and exposes the new state to the correct actor.`;
    case 'threshold-alert':
      return `The system records the threshold logic, shows why it fired, and ties it back to the ${mainEntity} data.`;
    case 'conflict-resolution':
      return `The system blocks the conflicting action, records the reason, and guides the user into the documented resolution path.`;
    default:
      return `The system stores the ${mainEntity} change and makes the outcome reviewable in ${workflowChoice.name}.`;
  }
}

function renderOutcome(feature: string, scenarioType: string, entities: OntologyEntity[]) {
  const mainEntity = entities[0];
  const sample = mainEntity ? Object.entries(mainEntity.sample).slice(0, 3).map(([key, value]) => `${key}=${value}`).join(', ') : 'sample data';
  const featureLower = feature.toLowerCase();
  if (featureLower.includes('creation') || featureLower.includes('create')) {
    return `A reviewer can prove ${feature} by creating a ${mainEntity?.name || 'record'} with valid data and confirming it appears with ${sample}.`;
  }
  if (featureLower.includes('assignment') || featureLower.includes('assign')) {
    return `A reviewer can prove ${feature} by linking a ${mainEntity?.name || 'record'} to an owner and confirming the assignee sees it with ${sample}.`;
  }
  if (featureLower.includes('due date') || featureLower.includes('deadline')) {
    return `A reviewer can prove ${feature} by setting a date on a ${mainEntity?.name || 'record'} and confirming the timeline shows it with ${sample}.`;
  }
  if (featureLower.includes('priority')) {
    return `A reviewer can prove ${feature} by changing priority on a ${mainEntity?.name || 'record'} and confirming lists re-sort with ${sample}.`;
  }
  if (featureLower.includes('status')) {
    return `A reviewer can prove ${feature} by moving a ${mainEntity?.name || 'record'} through states and confirming the new state is visible with ${sample}.`;
  }
  if (featureLower.includes('dashboard') || featureLower.includes('view')) {
    return `A reviewer can prove ${feature} by loading the view with live and empty records and confirming role-appropriate filters using ${sample}.`;
  }
  if (featureLower.includes('reminder') || featureLower.includes('notification')) {
    return `A reviewer can prove ${feature} by showing a stored reminder rule and a mock delivery-safe message using ${sample}.`;
  }
  switch (scenarioType) {
    case 'role-access':
      return `A reviewer can prove ${feature} with one allowed role and one blocked role using ${sample}.`;
    case 'dashboard-view':
      return `A reviewer can prove ${feature} by loading a view with at least one live record and one empty or blocked state using ${sample}.`;
    case 'notification':
      return `A reviewer can prove ${feature} by showing a stored reminder rule and a mock delivery-safe message using ${sample}.`;
    case 'conflict-resolution':
      return `A reviewer can prove ${feature} by attempting one conflicting action and confirming the system blocks it while preserving ${sample}.`;
    default:
      return `A reviewer can prove ${feature} by executing the workflow once with realistic data and once with a failure path using ${sample}.`;
  }
}

function renderFailureCase(risks: OntologyRisk[], workflowChoice: OntologyWorkflow, entities: OntologyEntity[], feature: string) {
  const riskMessage = risks[0]?.description || 'The workflow fails in a way the user can understand and recover from.';
  const workflowFailures = workflowChoice.failureModes;
  const entityName = entities[0]?.name || 'record';
  const featureLower = feature.toLowerCase();
  // Pick the best failure mode from the workflow based on feature text, not just the first one
  let workflowFailure = workflowFailures[0];
  for (const failure of workflowFailures) {
    const failureLower = failure.toLowerCase();
    if (featureLower.includes('create') || featureLower.includes('add')) {
      if (failureLower.includes('blank') || failureLower.includes('missing') || failureLower.includes('invalid')) {
        workflowFailure = failure;
        break;
      }
    }
    if (featureLower.includes('assign')) {
      if (failureLower.includes('assign') || failureLower.includes('recipient') || failureLower.includes('owner')) {
        workflowFailure = failure;
        break;
      }
    }
    if (featureLower.includes('status') || featureLower.includes('state')) {
      if (failureLower.includes('status') || failureLower.includes('state') || failureLower.includes('wrong')) {
        workflowFailure = failure;
        break;
      }
    }
    if (featureLower.includes('signup') || featureLower.includes('join')) {
      if (failureLower.includes('capacity') || failureLower.includes('membership') || failureLower.includes('overlap')) {
        workflowFailure = failure;
        break;
      }
    }
    if (featureLower.includes('handling') || featureLower.includes('manage')) {
      if (failureLower.includes('record') || failureLower.includes('missing') || failureLower.includes('not')) {
        workflowFailure = failure;
        break;
      }
    }
    if (featureLower.includes('notification') || featureLower.includes('reminder')) {
      if (failureLower.includes('detail') || failureLower.includes('delivery') || failureLower.includes('sensitive')) {
        workflowFailure = failure;
        break;
      }
    }
  }
  if (featureLower.includes('creation') || featureLower.includes('create')) {
    return `Required fields are blank or the ${entityName} is created with invalid data. This blocks ${feature}.`;
  }
  if (featureLower.includes('assignment') || featureLower.includes('assign')) {
    return `The ${entityName} is assigned to a missing or unauthorized recipient. This blocks ${feature}.`;
  }
  if (featureLower.includes('due date') || featureLower.includes('deadline')) {
    return `The due date is missing, past, or not visible to the assignee. This blocks ${feature}.`;
  }
  if (featureLower.includes('priority')) {
    return `The priority is missing or does not affect sort order. This blocks ${feature}.`;
  }
  if (featureLower.includes('status')) {
    return `The status transition is invalid or hidden from the next actor. This blocks ${feature}.`;
  }
  if (featureLower.includes('signup') || featureLower.includes('join')) {
    return `The signup fails because capacity is reached or the required profile information is missing. This blocks ${feature}.`;
  }
  if (featureLower.includes('handling') || featureLower.includes('manage')) {
    return `The handling step fails because the required record is missing or the action is not documented. This blocks ${feature}.`;
  }
  if (featureLower.includes('tracking') || featureLower.includes('history')) {
    return `The tracking step fails because the state change is not recorded or is invisible to the next actor. This blocks ${feature}.`;
  }
  if (featureLower.includes('dashboard') || featureLower.includes('view')) {
    return `The view fails to load or shows data from the wrong role or an empty state that should not be empty. This blocks ${feature}.`;
  }
  if (featureLower.includes('notification') || featureLower.includes('reminder')) {
    return `The notification contains sensitive detail or is delivered to the wrong recipient. This blocks ${feature}.`;
  }
  if (workflowFailure) return `${workflowFailure}. This affects ${entityName} during ${feature}.`;
  return riskMessage;
}

function collectFieldTypes(entities: OntologyEntity[]) {
  const all = entities.flatMap((candidate) => candidate.fields);
  const seen = new Set<string>();
  return all.filter((candidate) => {
    const key = `${candidate.name}:${candidate.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDomainOntology(input: ProjectInput, args: BuildArgs): DomainOntology {
  const blueprint = buildBlueprint(args.domainArchetype);
  const sourcePhrases = unique(args.mustHaves.concat(args.niceToHaves, args.integrations, splitItems(input.problemStatement), splitItems(input.productIdea)));
  const actorTypes = inferActors(args.audienceSegments, blueprint);
  const entityTypes = inferEntities(sourcePhrases, blueprint);
  const workflowTypes = blueprint.workflows.filter(
    (candidate) =>
      candidate.featureTriggers.some((trigger) => sourcePhrases.some((phrase) => containsAny(phrase, [trigger]))) ||
      candidate.entityRefs.some((entityName) => entityTypes.some((entity) => entity.name === entityName)) ||
      candidate.primaryActors.some((actorName) => actorTypes.some((actor) => actor.name === actorName))
  );
  const finalWorkflows = workflowTypes.length ? workflowTypes : blueprint.workflows.slice(0, 1);
  const integrationTypes = inferIntegrations(sourcePhrases, args.nonGoals, args.constraints, blueprint, finalWorkflows);
  const riskTypes = inferRisks(blueprint, args.riskFlags, entityTypes, finalWorkflows);
  const fieldTypes = collectFieldTypes(entityTypes);

  const featureScenarios = args.mustHaves.map((feature) => {
    const workflowChoice = chooseWorkflowForFeature(feature, finalWorkflows);
    const entities = chooseEntityMatchesForFeature(feature, entityTypes, workflowChoice);
    const fields = unique(
      entities.flatMap((entity) => getFieldsForPhrase(entity, feature)).concat(
        workflowChoice.entityRefs.flatMap((entityName) => entityTypes.find((entity) => entity.name === entityName)?.fields || [])
      )
    ).slice(0, 6);
    const integrations = chooseIntegrationsForFeature(feature, integrationTypes, entities);
    const actorChoice = chooseActorForFeature(feature, workflowChoice, actorTypes);
    const scenarioType = chooseScenarioType(feature, workflowChoice, entities, integrations);
    const scenarioRisks = chooseRisksForScenario(feature, scenarioType, entities, [workflowChoice], riskTypes);

    return {
      feature,
      scenarioType,
      actor: actorChoice,
      workflow: workflowChoice,
      entities,
      fields,
      integrations,
      risks: scenarioRisks,
      userAction: renderUserAction(feature, scenarioType, actorChoice.name, entities),
      systemResponse: renderSystemResponse(feature, scenarioType, workflowChoice, entities, integrations),
      storedData: renderStoredData(entities, fields, integrations),
      failureCase: renderFailureCase(scenarioRisks, workflowChoice, entities, feature),
      testableOutcome: renderOutcome(feature, scenarioType, entities)
    };
  });

  return {
    domainType: args.domainArchetype,
    actorTypes,
    workflowTypes: finalWorkflows,
    entityTypes,
    fieldTypes,
    riskTypes,
    integrationTypes,
    acceptanceTestPatterns: ACCEPTANCE_PATTERNS,
    featureScenarios
  };
}

export function findAcceptancePattern(ontology: DomainOntology, key: string) {
  return ontology.acceptanceTestPatterns.find((candidate) => candidate.key === key);
}

export function inferScenarioValues(scenario: OntologyFeatureScenario) {
  const actorExample = scenario.actor.name;
  const mainEntity = scenario.entities[0];
  const sample = mainEntity?.sample || {};
  const samplePairs = Object.entries(sample);
  const summary = samplePairs.slice(0, 3).map(([key, value]) => `${key}=${value}`).join(', ');
  return {
    actorExample,
    entityName: mainEntity?.name || 'record',
    entitySampleSummary: summary || 'realistic local data',
    primaryFailure: scenario.risks[0]?.verification || scenario.failureCase
  };
}

export function fallbackEntityName(feature: string) {
  return titleCase(feature) || 'Core Record';
}
