/**
 * Domain pack archetypes (Phase F1).
 *
 * A DomainPack is a curated bundle of actor / entity / workflow / JTBD seeds
 * for a category (sales, healthcare, education, ...). The synthesizer threads
 * the pack into deriveActors / deriveEntities / deriveWorkflows / deriveScreens
 * / deriveTestCases / deriveDiscovery so the resulting research extractions
 * carry domain-realistic content instead of templated noun-phrase chunks.
 *
 * Packs are READ-ONLY data; the synthesizer never mutates them. Packs reference
 * each other by `idHint` (kebab-case slug); the synthesizer materializes those
 * into final IDs (`actor-<idHint>`, `entity-<idHint>`, ...).
 */
import type { Actor, DbType, FkAction, IntegrationCategory } from '../schema';

export type CategoryId =
  | 'sales'
  | 'healthcare'
  | 'education'
  | 'hospitality'
  | 'fitness'
  | 'household'
  | 'scheduling'
  | 'volunteer'
  | 'inventory'
  | 'ledger-finance'
  | 'community'
  | 'general';

export interface JtbdSeed {
  situation: string;          // "When <triggering condition>"
  motivation: string;         // "I want to <action>"
  expectedOutcome: string;    // "So that <measurable post-condition>"
  currentWorkaround: string;  // what they do today without this product
  hireForCriteria: string[];  // adoption signals
}

export interface ActorArchetype {
  idHint: string;                 // 'sdr', 'manager'
  name: string;                   // 'Sales Development Rep'
  type: Actor['type'];
  responsibilities: string[];     // 2-4 concrete verbs
  visibility: string[];           // what they CAN see
  authMode?: Actor['authMode'];
  jtbdSeeds: JtbdSeed[];          // ≥1 per actor
  personaPainPoints?: string[];   // Phase F2 personas
  personaMotivations?: string[];  // Phase F2 personas
  personaSuccessSignals?: string[];
}

export interface FieldArchetype {
  name: string;
  dbType: DbType;
  unique?: boolean;
  indexed?: boolean;
  required?: boolean;
  enumValues?: string[];
  defaultValue?: string;
  fkHint?: { entityIdHint: string; fieldName: string; onDelete?: FkAction };
  sample: string | number | boolean;
  pii?: boolean;
  sensitive?: boolean;
  description: string;
}

export interface EntityArchetype {
  idHint: string;
  name: string;
  description: string;
  ownerActorIdHints: string[];
  fields: FieldArchetype[];
  riskTypes?: string[];
  /** Negative-path sample value override. Defaults to a degenerate variant of `sample`. */
  negativeSample?: Record<string, string | number | boolean>;
}

export interface WorkflowStepArchetype {
  actorIdHint: string;
  action: string;
  systemResponse: string;
  branchOn?: string;
  preconditions?: string[];
  postconditions?: string[];
}

export interface WorkflowFailureArchetype {
  trigger: string;
  effect: string;
  mitigation: string;
}

export interface WorkflowArchetype {
  idHint: string;
  name: string;
  primaryActorIdHint: string;
  secondaryActorIdHints?: string[];
  steps: WorkflowStepArchetype[];           // ≥5 steps for primary
  failureModes: WorkflowFailureArchetype[]; // ≥2 per workflow
  /** Acceptance pattern in Given/When/Then form. */
  acceptancePattern: string;
}

export interface IntegrationHint {
  name: string;
  vendor: string;
  category: IntegrationCategory;
  envVar: string;
  required?: boolean;
  purpose: string;
}

export interface SuccessMetricSeed {
  metric: string;
  target: string;
  cadence: 'D1' | 'D7' | 'D30' | 'leading';
}

export interface CompetingAlternativeSeed {
  name: string;
  whyInsufficient: string;
}

export interface IdeaCritiqueSeed {
  weakSpot: string;
  mitigation: string;
}

export interface DomainPack {
  id: CategoryId;
  /** Display name shown in industry framing. */
  name: string;
  /** Lowercase keywords used by detectCategory for matching. */
  matchKeywords: string[];
  /** Optional audience phrases that strongly indicate this category. */
  matchAudience?: string[];
  /** Optional industry sub-name (`SDR / outbound sales`). */
  industryName?: string;
  /** Industry-standard terminology that should appear in artifacts. */
  industryTerminology?: string[];
  actorArchetypes: ActorArchetype[];
  entityArchetypes: EntityArchetype[];
  workflowArchetypes: WorkflowArchetype[];
  integrationHints?: IntegrationHint[];
  regulatoryHints?: string[];
  successMetricSeeds?: SuccessMetricSeed[];
  competingAlternatives?: CompetingAlternativeSeed[];
  ideaCritiqueSeeds?: IdeaCritiqueSeed[];
}
