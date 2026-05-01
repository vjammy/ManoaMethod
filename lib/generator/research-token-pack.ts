/**
 * ResearchTokenPack — flat enrichment vocabulary derived from a
 * ResearchExtractions document.
 *
 * Phase B uses this in two places:
 *   1. The generator interpolates these tokens into artifact renderers
 *      (PHASE_BRIEF, TEST_SCRIPT, ACCEPTANCE_CRITERIA, handoff docs)
 *      where today's templates emit generic copy that ignores the
 *      research even when it's present.
 *   2. The audit scores artifact "domain vocabulary" against the union
 *      of brief tokens + research tokens, so a workspace that uses the
 *      research richly is credited for it.
 *
 * NO new LLM calls. This is purely a derivation from already-extracted
 * research data.
 */
import type { ResearchExtractions } from '../research/schema';

export type CategorizedTokens = {
  actorNames: string[];
  actorAliases: string[];
  entityNames: string[];
  entityAliases: string[];
  fieldNames: string[];
  workflowNames: string[];
  workflowSteps: string[];
  riskCategories: string[];
  regulatoryCitations: string[];
  gateNames: string[];
  antiFeatureSummaries: string[];
  sampleIds: string[];
  sampleValues: string[];
};

export type ResearchTokenPack = {
  /** Empty when extractions are absent. */
  present: boolean;
  /** Categorized tokens for templated interpolation. */
  categorized: CategorizedTokens;
  /** Flat vocabulary used by the audit's domain-vocabulary check. */
  flat: string[];
  /** Brief-derived tokens for backward compat with the existing audit. */
  briefTokens: string[];
};

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'into', 'their', 'have', 'will', 'should', 'must',
  'plan', 'phase', 'phases', 'review', 'workspace', 'package', 'project', 'product',
  'system', 'application', 'feature', 'features', 'process', 'workflow', 'requirement',
  'requirements', 'gate', 'gates', 'before', 'after', 'while', 'these', 'those', 'there',
  'where', 'which', 'because', 'when', 'they', 'work', 'used', 'each', 'about', 'mode',
  'role', 'roles', 'task', 'tasks', 'data', 'view', 'list', 'item', 'items', 'name',
  'names', 'mvp-builder', 'mvpbuilder', 'codex', 'claude', 'opencode'
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

export function deriveBriefTokens(productName: string, brief: string): string[] {
  return uniq(tokenize(`${productName} ${brief}`));
}

export function buildResearchTokenPack(
  extractions: ResearchExtractions | undefined,
  briefTokens: string[]
): ResearchTokenPack {
  if (!extractions) {
    return {
      present: false,
      categorized: emptyCategorized(),
      flat: [],
      briefTokens
    };
  }

  const actorNames = extractions.actors.map((a) => a.name);
  const actorAliases: string[] = []; // SchemaActor in lib/research/schema.ts has no aliases field; left empty.

  const entityNames = extractions.entities.map((e) => e.name);
  const entityAliases: string[] = []; // schema has no aliases on Entity in v0.2; harmless to leave empty.
  const fieldNames = uniq(
    extractions.entities.flatMap((e) => e.fields.map((f) => f.name))
  );

  const workflowNames = extractions.workflows.map((w) => w.name);
  // workflow step "actions" become tokens too — they capture verbs like "Import", "Enroll", "Qualify"
  const workflowSteps = extractions.workflows.flatMap((w) =>
    w.steps.map((s) => s.action.split(/\s+/).slice(0, 2).join(' '))
  );

  const riskCategories = uniq(extractions.risks.map((r) => r.category));
  // Pull regulatory citation strings out of risk mitigations + gate mandatedByDetail
  const regulatoryCitations = uniq(
    extractions.gates
      .map((g) => g.mandatedByDetail)
      .filter(Boolean)
      .flatMap(extractCitations)
  );

  const gateNames = extractions.gates.map((g) => g.name);
  const antiFeatureSummaries = extractions.antiFeatures.map((a) => a.description.slice(0, 80));

  // Sample IDs: pull every entity sample's ID-like values
  const sampleIds = uniq(
    extractions.entities.flatMap((e) => {
      const sample = e.sample as Record<string, unknown>;
      return Object.values(sample).filter((v): v is string => typeof v === 'string' && /[a-z]+-[a-z0-9]+/i.test(v));
    })
  );
  const sampleValues = uniq(
    extractions.entities.flatMap((e) => {
      const sample = e.sample as Record<string, unknown>;
      return Object.values(sample).filter((v): v is string => typeof v === 'string' && v.length >= 4 && v.length <= 40);
    })
  );

  const categorized: CategorizedTokens = {
    actorNames,
    actorAliases,
    entityNames,
    entityAliases,
    fieldNames,
    workflowNames,
    workflowSteps,
    riskCategories,
    regulatoryCitations,
    gateNames,
    antiFeatureSummaries,
    sampleIds,
    sampleValues
  };

  const flat = uniq(
    [
      ...actorNames,
      ...actorAliases,
      ...entityNames,
      ...entityAliases,
      ...fieldNames,
      ...workflowNames,
      ...riskCategories,
      ...regulatoryCitations,
      ...gateNames,
      ...sampleIds
    ]
      .flatMap((t) => t.split(/\s+/))
      .map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, ''))
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
  );

  return {
    present: true,
    categorized,
    flat,
    briefTokens
  };
}

function extractCitations(text: string): string[] {
  // Match "GDPR Art. 17", "CAN-SPAM Act 15 USC §7704", "CPRA §1798.105", "HIPAA Privacy Rule §164.502", "FERPA"
  const pattern = /\b(GDPR(?:\s+Art\.?\s*\d+)?|CAN-SPAM|HIPAA(?:\s+[A-Z][a-z]+\s+Rule)?(?:\s+§\d[\d.]*)?|CPRA(?:\s+§\d[\d.]*)?|CCPA|FERPA|PCI(?:\s+DSS)?|SOC\s*2|TCPA|CASL|COPPA)\b/gi;
  return Array.from(new Set((text.match(pattern) || []).map((m) => m.trim())));
}

function emptyCategorized(): CategorizedTokens {
  return {
    actorNames: [],
    actorAliases: [],
    entityNames: [],
    entityAliases: [],
    fieldNames: [],
    workflowNames: [],
    workflowSteps: [],
    riskCategories: [],
    regulatoryCitations: [],
    gateNames: [],
    antiFeatureSummaries: [],
    sampleIds: [],
    sampleValues: []
  };
}

/**
 * Filter a research-derived list down to only the entries relevant to a
 * phase, given the phase's owned requirementIds. Each REQ corresponds to
 * one workflow step (per buildFunctionalRequirementsFromResearch flattening),
 * so we map REQ-N back to its workflow + step. Used by phase-specific
 * artifact renderers.
 */
export function selectPhaseRelevant(
  extractions: ResearchExtractions | undefined,
  requirementIds: string[] | undefined
): {
  actors: string[];
  entities: string[];
  workflows: string[];
  risks: string[];
  gates: string[];
} {
  if (!extractions || !requirementIds || requirementIds.length === 0) {
    return { actors: [], entities: [], workflows: [], risks: [], gates: [] };
  }

  // Flatten workflows × steps in the SAME order as buildFunctionalRequirementsFromResearch
  // so REQ-N maps to step N-1.
  type Flat = { workflow: typeof extractions.workflows[number]; stepIdx: number };
  const flat: Flat[] = [];
  for (const wf of extractions.workflows) {
    for (let i = 0; i < wf.steps.length; i += 1) {
      flat.push({ workflow: wf, stepIdx: i });
    }
  }

  const reqNumbers = requirementIds
    .map((id) => Number.parseInt(String(id).replace(/^REQ-/i, ''), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const ownedWorkflows = new Set<string>();
  const ownedActors = new Set<string>();
  const ownedEntities = new Set<string>();
  for (const num of reqNumbers) {
    const slot = flat[num - 1];
    if (!slot) continue;
    ownedWorkflows.add(slot.workflow.name);
    const actor = extractions.actors.find((a) => a.id === slot.workflow.steps[slot.stepIdx].actor);
    if (actor) ownedActors.add(actor.name);
    for (const entityId of slot.workflow.entitiesTouched) {
      const entity = extractions.entities.find((e) => e.id === entityId);
      if (entity) ownedEntities.add(entity.name);
    }
  }

  // Risks/gates that affect any of the owned actors or entities
  const risks = extractions.risks
    .filter((r) =>
      r.affectedActors.some((a) => extractions.actors.find((x) => x.id === a && ownedActors.has(x.name))) ||
      r.affectedEntities.some((e) => extractions.entities.find((x) => x.id === e && ownedEntities.has(x.name)))
    )
    .map((r) => `${r.category}: ${r.description.slice(0, 100)}`);

  const gates = extractions.gates
    .filter((g) => g.blockingPhases.length === 0 || g.blockingPhases.some((p) => /implementation|release/.test(p)))
    .map((g) => g.name);

  return {
    actors: Array.from(ownedActors),
    entities: Array.from(ownedEntities),
    workflows: Array.from(ownedWorkflows),
    risks,
    gates
  };
}
