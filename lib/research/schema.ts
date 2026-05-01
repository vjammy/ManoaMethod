/**
 * Research extraction schema (v0.2).
 *
 * The 10-pass research loop produces two markdown narratives plus a set of
 * structured JSON files under <workspace>/research/extracted/. These types are
 * the contract between the loop and the generator.
 *
 * If you change the shape, bump SCHEMA_VERSION and update the validator.
 */

export const SCHEMA_VERSION = '0.2' as const;

export type EvidenceStrength = 'strong' | 'moderate' | 'weak';
export type Popularity = 'dominant' | 'common' | 'niche';
export type ResearchOrigin = 'use-case' | 'domain' | 'both';

export type SourceRef = {
  url: string;
  title: string;
  publisher?: string;
  publishedAt?: string;
  quote: string;
  fetchedAt: string;
};

type WithProvenance = {
  id: string;
  origin: ResearchOrigin;
  evidenceStrength: EvidenceStrength;
  sources: SourceRef[];
  firstSeenInPass: number;
  updatedInPass: number;
};

export type Actor = WithProvenance & {
  name: string;
  type: 'primary-user' | 'secondary-user' | 'operator' | 'reviewer' | 'external';
  responsibilities: string[];
  visibility: string[];
  authMode?: 'authenticated' | 'magic-link' | 'kiosk' | 'public';
};

export type DbType =
  | 'UUID'
  | 'TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'TIMESTAMPTZ'
  | 'DATE'
  | 'JSONB'
  | 'ENUM';

export type FkAction = 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';

export type ForeignKey = {
  entityId: string;
  fieldName: string;
  onDelete: FkAction;
};

export type EntityField = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'date' | 'json' | 'binary' | 'reference';
  description: string;
  required: boolean;
  pii?: boolean;
  sensitive?: boolean;
  enumValues?: string[];
  references?: string;
  example: string;
  /** Phase E3: DB-level metadata. Optional so existing extractions remain valid. */
  dbType?: DbType;
  nullable?: boolean;
  defaultValue?: string;
  indexed?: boolean;
  unique?: boolean;
  fk?: ForeignKey;
};

export type Entity = WithProvenance & {
  name: string;
  description: string;
  fields: EntityField[];
  relationships: string[];
  ownerActors: string[];
  riskTypes: string[];
  sample: Record<string, unknown>;
};

export type WorkflowStep = {
  order: number;
  actor: string;
  action: string;
  systemResponse: string;
  preconditions?: string[];
  postconditions?: string[];
  branchOn?: string;
};

export type WorkflowFailure = {
  trigger: string;
  effect: string;
  mitigation: string;
};

export type Workflow = WithProvenance & {
  name: string;
  primaryActor: string;
  secondaryActors: string[];
  steps: WorkflowStep[];
  failureModes: WorkflowFailure[];
  entitiesTouched: string[];
  acceptancePattern: string;
};

export type IntegrationCategory =
  | 'payment'
  | 'auth'
  | 'identity'
  | 'email'
  | 'sms'
  | 'storage'
  | 'observability'
  | 'ehr'
  | 'wms'
  | 'erp'
  | 'llm'
  | 'other';

export type Integration = WithProvenance & {
  name: string;
  vendor: string;
  category: IntegrationCategory;
  purpose: string;
  required: boolean;
  envVar: string;
  mockedByDefault: boolean;
  failureModes: string[];
  popularity: Popularity;
  alternatives: string[];
};

export type RiskCategory =
  | 'compliance'
  | 'security'
  | 'privacy'
  | 'safety'
  | 'financial'
  | 'operational'
  | 'adoption'
  | 'integration'
  | 'product'
  | 'legal';

export type Risk = WithProvenance & {
  category: RiskCategory;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedActors: string[];
  affectedEntities: string[];
  mitigation: string;
  mandatedGate?: string;
};

export type Gate = WithProvenance & {
  name: string;
  rationale: string;
  mandatedBy: 'regulation' | 'industry-standard' | 'safety' | 'product';
  mandatedByDetail: string;
  applies: 'always' | 'conditional';
  appliesIf?: string;
  evidenceRequired: string[];
  blockingPhases: string[];
};

export type AntiFeature = {
  id: string;
  description: string;
  rationale: string;
  sourcesAgreeing: SourceRef[];
};

export type Conflict = {
  id: string;
  field: 'brief' | 'must-haves' | 'non-goals' | 'constraints' | 'risks' | 'integrations';
  briefAssertion: string;
  researchFinding: string;
  severity: 'critical' | 'important' | 'note';
  resolution: 'pending' | 'brief-wins' | 'research-wins' | 'ambiguous';
  sources: SourceRef[];
};

// ---------- screens (Phase E2) ----------

export type ScreenSectionKind = 'header' | 'list' | 'form' | 'detail' | 'summary' | 'navigation';

export type ScreenSection = {
  kind: ScreenSectionKind;
  title: string;
  purpose: string;
};

export type ScreenFieldKind = 'input' | 'display' | 'action';

export type ScreenField = {
  name: string;
  kind: ScreenFieldKind;
  label: string;
  refEntityField?: string;     // "<entityId>.<fieldName>" reference to lib data model
  validation?: string;
  copy?: string;
};

export type ScreenStates = {
  empty: string;
  loading: string;
  error: string;
  populated: string;
};

export type ScreenActionKind = 'primary' | 'secondary' | 'destructive' | 'navigation';

export type ScreenAction = {
  label: string;
  kind: ScreenActionKind;
  refWorkflowStep?: string;    // "<workflowId>:<stepOrder>"
  navTo?: string;              // screen id
};

export type ScreenNavRef = {
  screen: string;              // screen id
  via: string;                 // action label or workflow step
};

export type Screen = WithProvenance & {
  name: string;
  route: string;
  primaryActor: string;        // actor id
  secondaryActors: string[];   // actor ids
  purpose: string;
  sections: ScreenSection[];
  fields: ScreenField[];
  states: ScreenStates;
  actions: ScreenAction[];
  navIn: ScreenNavRef[];
  navOut: ScreenNavRef[];
};

export type TestScenarioKind = 'happy-path' | 'edge-case' | 'failure-mode';

export type TestCase = WithProvenance & {
  workflowId: string;
  scenario: TestScenarioKind;
  given: string;
  when: string;
  then: string;
  testDataRefs: string[];          // entity sample IDs referenced by this test
  expectedFailureRef?: string;     // the workflow.failureModes[].trigger this case proves
};

export type UxFlowEdge = {
  fromScreen: string;          // screen id
  toScreen: string;            // screen id
  viaAction: string;           // action label or workflow step
  condition?: string;          // optional guard / branch description
};

export type RemovedItem = {
  itemType: 'actor' | 'entity' | 'workflow' | 'integration' | 'risk' | 'gate' | 'anti-feature';
  itemId: string;
  removedInPass: number;
  reason: string;
};

export type ValueProposition = {
  headline: string;
  oneLineProblem: string;
  oneLineSolution: string;
  topThreeOutcomes: string[];
};

export type WhyNow = {
  driver: string;
  recentChange: string;
  risksIfDelayed: string;
};

export type IdeaCritiquePoint = {
  weakSpot: string;
  mitigation: string;
};

export type CompetingAlternative = {
  name: string;
  whyInsufficient: string;
};

export type DiscoveryArtifacts = {
  valueProposition?: ValueProposition;
  whyNow?: WhyNow;
  ideaCritique?: IdeaCritiquePoint[];
  competingAlternatives?: CompetingAlternative[];
};

export type JobToBeDone = WithProvenance & {
  actorId: string;
  situation: string;          // when X happens
  motivation: string;         // I want to Y
  expectedOutcome: string;    // so that Z
  currentWorkaround: string;
  hireForCriteria: string[];  // what would make them adopt this product
};

export type ResearchMeta = {
  briefHash: string;
  schemaVersion: typeof SCHEMA_VERSION;
  startedAt: string;
  completedAt: string;
  totalPasses: { useCase: number; domain: number };
  finalCriticScores: { useCase: number; domain: number };
  convergedEarly: { useCase: boolean; domain: boolean };
  totalTokensUsed: number;
  modelUsed: string;
  researcher: 'anthropic-sdk' | 'claude-code-session' | 'mock';
  /** Phase E4: optional product-strategy artifacts surfaced before phase work begins. */
  discovery?: DiscoveryArtifacts;
};

export type CritiqueResult = {
  pass: number;
  topic: 'use-case' | 'domain';
  scores: {
    coverage: number;
    citationDensity: number;
    specificity: number;
    recency: number;
    internalConsistency: number;
    briefAlignment: number;
  };
  totalScore: number;
  verdict: 'converged' | 'continue' | 'stalled';
  gaps: Array<{
    area: string;
    severity: 'critical' | 'important' | 'minor';
    instruction: string;
  }>;
  redactionsRequired: SourceRef[];
};

export type ResearchExtractions = {
  meta: ResearchMeta;
  actors: Actor[];
  entities: Entity[];
  workflows: Workflow[];
  integrations: Integration[];
  risks: Risk[];
  gates: Gate[];
  antiFeatures: AntiFeature[];
  conflicts: Conflict[];
  removed: RemovedItem[];
  /** Phase E2: optional screen catalog. Generated into ui-ux/screens/*.md when present. */
  screens?: Screen[];
  /** Phase E2: optional UX-flow edges between screens. Generated into ui-ux/UX_FLOW.md. */
  uxFlow?: UxFlowEdge[];
  /** Phase E3: optional concrete test cases bound to workflow + sample data. */
  testCases?: TestCase[];
  /** Phase E4: optional jobs-to-be-done per actor. */
  jobsToBeDone?: JobToBeDone[];
};

// ---------- validators ----------

export type ValidationIssue = { path: string; message: string };

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

function pushIfBad(issues: ValidationIssue[], cond: boolean, path: string, message: string) {
  if (!cond) issues.push({ path, message });
}

function validateSource(source: unknown, path: string, issues: ValidationIssue[]) {
  if (!source || typeof source !== 'object') {
    issues.push({ path, message: 'expected object' });
    return;
  }
  const s = source as Record<string, unknown>;
  pushIfBad(issues, isString(s.url), `${path}.url`, 'required non-empty string');
  pushIfBad(issues, isString(s.title), `${path}.title`, 'required non-empty string');
  pushIfBad(issues, isString(s.quote), `${path}.quote`, 'required non-empty string');
  pushIfBad(issues, isString(s.fetchedAt), `${path}.fetchedAt`, 'required ISO timestamp');
}

function validateProvenance(item: Record<string, unknown>, path: string, issues: ValidationIssue[]) {
  pushIfBad(issues, isString(item.id), `${path}.id`, 'required');
  pushIfBad(
    issues,
    item.origin === 'use-case' || item.origin === 'domain' || item.origin === 'both',
    `${path}.origin`,
    'must be use-case|domain|both'
  );
  pushIfBad(
    issues,
    item.evidenceStrength === 'strong' ||
      item.evidenceStrength === 'moderate' ||
      item.evidenceStrength === 'weak',
    `${path}.evidenceStrength`,
    'must be strong|moderate|weak'
  );
  pushIfBad(issues, Array.isArray(item.sources), `${path}.sources`, 'must be array');
  if (Array.isArray(item.sources)) {
    item.sources.forEach((src, i) => validateSource(src, `${path}.sources[${i}]`, issues));
  }
  pushIfBad(issues, isNumber(item.firstSeenInPass), `${path}.firstSeenInPass`, 'must be number');
  pushIfBad(issues, isNumber(item.updatedInPass), `${path}.updatedInPass`, 'must be number');
}

export function validateExtractions(data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!data || typeof data !== 'object') {
    issues.push({ path: '', message: 'expected object' });
    return issues;
  }
  const d = data as ResearchExtractions;

  // meta
  pushIfBad(issues, !!d.meta, 'meta', 'required');
  if (d.meta) {
    pushIfBad(issues, d.meta.schemaVersion === SCHEMA_VERSION, 'meta.schemaVersion', `must equal "${SCHEMA_VERSION}"`);
    pushIfBad(issues, isString(d.meta.briefHash), 'meta.briefHash', 'required');
  }

  for (const [key, list] of Object.entries({
    actors: d.actors,
    entities: d.entities,
    workflows: d.workflows,
    integrations: d.integrations,
    risks: d.risks,
    gates: d.gates
  })) {
    if (!Array.isArray(list)) {
      issues.push({ path: key, message: 'must be array' });
      continue;
    }
    list.forEach((item, i) => validateProvenance(item as Record<string, unknown>, `${key}[${i}]`, issues));
  }

  // referential integrity
  const actorIds = new Set((d.actors ?? []).map((a) => a.id));
  const entityIds = new Set((d.entities ?? []).map((e) => e.id));
  const gateIds = new Set((d.gates ?? []).map((g) => g.id));

  // Phase E4: optional jobs-to-be-done reference actor IDs.
  if (Array.isArray(d.jobsToBeDone)) {
    d.jobsToBeDone.forEach((j, i) => {
      validateProvenance(j as unknown as Record<string, unknown>, `jobsToBeDone[${i}]`, issues);
      pushIfBad(issues, actorIds.has(j.actorId), `jobsToBeDone[${i}].actorId`, `unknown actor "${j.actorId}"`);
    });
  }

  // Phase E3: optional test cases reference workflow IDs.
  if (Array.isArray(d.testCases)) {
    const wfIds = new Set((d.workflows ?? []).map((w) => w.id));
    d.testCases.forEach((t, i) => {
      validateProvenance(t as unknown as Record<string, unknown>, `testCases[${i}]`, issues);
      pushIfBad(issues, wfIds.has(t.workflowId), `testCases[${i}].workflowId`, `unknown workflow "${t.workflowId}"`);
      pushIfBad(
        issues,
        t.scenario === 'happy-path' || t.scenario === 'edge-case' || t.scenario === 'failure-mode',
        `testCases[${i}].scenario`,
        'must be happy-path|edge-case|failure-mode'
      );
    });
  }

  // Phase E2: optional screens carry provenance and reference actor IDs.
  if (Array.isArray(d.screens)) {
    d.screens.forEach((s, i) => {
      validateProvenance(s as unknown as Record<string, unknown>, `screens[${i}]`, issues);
      pushIfBad(issues, actorIds.has(s.primaryActor), `screens[${i}].primaryActor`, `unknown actor "${s.primaryActor}"`);
      (s.secondaryActors ?? []).forEach((aid, j) => {
        pushIfBad(issues, actorIds.has(aid), `screens[${i}].secondaryActors[${j}]`, `unknown actor "${aid}"`);
      });
    });
    const screenIds = new Set(d.screens.map((s) => s.id));
    if (Array.isArray(d.uxFlow)) {
      d.uxFlow.forEach((e, i) => {
        pushIfBad(issues, screenIds.has(e.fromScreen), `uxFlow[${i}].fromScreen`, `unknown screen "${e.fromScreen}"`);
        pushIfBad(issues, screenIds.has(e.toScreen), `uxFlow[${i}].toScreen`, `unknown screen "${e.toScreen}"`);
      });
    }
  }

  (d.entities ?? []).forEach((entity, i) => {
    entity.ownerActors.forEach((aid, j) => {
      pushIfBad(issues, actorIds.has(aid), `entities[${i}].ownerActors[${j}]`, `unknown actor "${aid}"`);
    });
  });
  (d.workflows ?? []).forEach((wf, i) => {
    pushIfBad(issues, actorIds.has(wf.primaryActor), `workflows[${i}].primaryActor`, `unknown actor "${wf.primaryActor}"`);
    wf.secondaryActors.forEach((aid, j) => {
      pushIfBad(issues, actorIds.has(aid), `workflows[${i}].secondaryActors[${j}]`, `unknown actor "${aid}"`);
    });
    wf.entitiesTouched.forEach((eid, j) => {
      pushIfBad(issues, entityIds.has(eid), `workflows[${i}].entitiesTouched[${j}]`, `unknown entity "${eid}"`);
    });
    wf.steps.forEach((step, j) => {
      pushIfBad(issues, actorIds.has(step.actor), `workflows[${i}].steps[${j}].actor`, `unknown actor "${step.actor}"`);
    });
  });
  (d.risks ?? []).forEach((risk, i) => {
    risk.affectedActors.forEach((aid, j) => {
      pushIfBad(issues, actorIds.has(aid), `risks[${i}].affectedActors[${j}]`, `unknown actor "${aid}"`);
    });
    risk.affectedEntities.forEach((eid, j) => {
      pushIfBad(issues, entityIds.has(eid), `risks[${i}].affectedEntities[${j}]`, `unknown entity "${eid}"`);
    });
    if (risk.mandatedGate) {
      pushIfBad(issues, gateIds.has(risk.mandatedGate), `risks[${i}].mandatedGate`, `unknown gate "${risk.mandatedGate}"`);
    }
  });

  // conflicts must be resolved before downstream consumption
  (d.conflicts ?? []).forEach((c, i) => {
    pushIfBad(
      issues,
      c.severity === 'note' || c.resolution !== 'pending',
      `conflicts[${i}].resolution`,
      `non-note conflict still pending; mark as brief-wins, research-wins, or ambiguous before generating`
    );
  });

  return issues;
}

export function isExtractionsValid(data: unknown): data is ResearchExtractions {
  return validateExtractions(data).length === 0;
}
