import type { ProjectInput } from './types';

// Phase A3c (final hardening): the archetype keyword router was deleted.
// DomainArchetype is now a single-member union. The type alias stays only so
// existing call sites (e.g. ProjectContext.domainArchetype, manifest fields)
// don't have to change shape; the compiler will flag any remaining dead
// branch that still references a removed archetype literal as a "never"
// comparison, which is exactly the cleanup signal we want.
export type DomainArchetype = 'general';

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
  if (!value) return [];
  // Paren/bracket-aware splitter: respects "(parens)" and "[brackets]", accepts
  // ; , and \n as separators, and falls back to "Foo. Bar. Baz." sentence-style
  // splits when the source clearly is a list. Ported from origin/main commit
  // 568685a as a generic improvement for any code that processes brief lists.
  const items: string[] = [];
  let buf = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  for (const ch of value) {
    if (ch === '(' || ch === '[') {
      if (ch === '(') parenDepth++;
      else bracketDepth++;
      buf += ch;
      continue;
    }
    if (ch === ')' || ch === ']') {
      if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else bracketDepth = Math.max(0, bracketDepth - 1);
      buf += ch;
      continue;
    }
    const isSeparator =
      (ch === '\n' || ch === ';' || ch === ',') && parenDepth === 0 && bracketDepth === 0;
    if (isSeparator) {
      const trimmed = buf.trim();
      if (trimmed) items.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) items.push(tail);
  if (items.length === 1) {
    const clauses = items[0].split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
    if (clauses.length >= 4 && clauses.every((part) => part.length <= 80)) {
      return clauses.map((part) => part.replace(/\.$/, '').trim()).filter(Boolean);
    }
  }
  return items;
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

// Phase A3c: archetype-specific blueprints (family-task, sdr-sales, restaurant-
// ordering, clinic-scheduler, inventory, etc.) were deleted. The keyword router
// that routed briefs to those blueprints was deleted at the same time. The only
// remaining blueprint is 'general' — used as a generic baseline when no research
// extractions are present. Research extractions populate entities/actors/
// workflows directly through lib/generator/research-token-pack.ts and the
// research-driven code paths in generator.ts.
function buildBlueprint(_domainType: DomainArchetype): Blueprint {
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
  // E1: Feature-text alias matches win over workflow.primaryActors[0]. Without
  // this flip every feature inherits the same workflow-default actor and the
  // generated REQs all attribute to one role even when the brief names many.
  const featureMatch = actors.find((candidate) =>
    candidate.aliases.some((alias) => containsAny(feature, [alias]))
  );
  if (featureMatch) return featureMatch;
  const workflowActor = workflowChoice.primaryActors[0];
  const workflowMatch = actors.find((candidate) => candidate.name === workflowActor);
  return workflowMatch || actors[0];
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
