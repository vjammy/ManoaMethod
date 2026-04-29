import type { DomainArchetype } from './domain-ontology';
import type { ProjectInput } from './types';

export type ArchetypeDetectionMethod = 'keyword' | 'llm' | 'fallback';

export type ArchetypeDetection = {
  archetype: DomainArchetype;
  confidence: number;
  method: ArchetypeDetectionMethod;
  matchedKeyword?: string;
  rationale: string;
  antiMatched?: string;
  candidateScores: Array<{ archetype: DomainArchetype; score: number; topKeyword?: string }>;
};

type KeywordRule = {
  archetype: DomainArchetype;
  anchors: string[];
  incidentals: string[];
  antiMatch?: string[];
};

const ANCHOR_WEIGHT = 3;
const INCIDENTAL_WEIGHT = 1;

const RULES: KeywordRule[] = [
  {
    archetype: 'family-task',
    anchors: ['task board', 'chore', 'household task', 'family workspace', 'kid chore'],
    incidentals: ['family', 'parent', 'kid', 'household']
  },
  {
    archetype: 'family-readiness',
    anchors: ['family readiness', 'legal vault', 'emergency mode', 'privvy', 'household readiness'],
    incidentals: ['readiness', 'emergency', 'will', 'beneficiary']
  },
  {
    archetype: 'restaurant-ordering',
    anchors: ['restaurant ordering', 'menu ordering', 'pickup ordering', 'order menu', 'online ordering'],
    incidentals: ['restaurant', 'menu', 'order state'],
    antiMatch: ['no ordering', 'not ordering', 'no online order', 'no menu', 'prep list', 'kitchen prep']
  },
  {
    archetype: 'budget-planner',
    anchors: ['household budget', 'budget planner', 'spending plan', 'savings plan'],
    incidentals: ['budget', 'spending', 'savings']
  },
  {
    archetype: 'inventory',
    anchors: ['inventory management', 'stock level', 'cycle count', 'reorder threshold', 'stock adjustment', 'sku'],
    incidentals: ['inventory', 'stock', 'threshold', 'adjustment'],
    antiMatch: ['no inventory', 'not inventory', 'no stock management', 'inventory: out of scope', 'no inventory management']
  },
  {
    archetype: 'clinic-scheduler',
    anchors: ['clinic scheduling', 'appointment scheduling', 'patient scheduler', 'visit scheduling'],
    incidentals: ['clinic', 'patient', 'physician', 'doctor', 'nurse', 'appointment'],
    antiMatch: ['no scheduling', 'not a scheduler', 'no appointment', 'scheduling: out of scope']
  },
  {
    archetype: 'hoa-maintenance',
    anchors: ['hoa', 'homeowners association', 'maintenance request', 'maintenance ticket'],
    incidentals: ['vendor', 'resident'],
    antiMatch: ['not an hoa', 'no maintenance', 'no hoa', 'maintenance: out of scope']
  },
  {
    archetype: 'school-club',
    anchors: ['school club', 'club advisor', 'event sign-up', 'club roster'],
    incidentals: ['advisor', 'club', 'student'],
    antiMatch: ['not a club', 'no club', 'classroom feedback', 'classroom only']
  },
  {
    archetype: 'volunteer-manager',
    anchors: ['volunteer signup', 'shift sign-up', 'volunteer scheduling', 'volunteer roster'],
    incidentals: ['volunteer', 'shift', 'check-in', 'no-show'],
    antiMatch: ['not volunteer', 'paid worker', 'gig marketplace', 'two-sided marketplace']
  },
  {
    archetype: 'sdr-sales',
    anchors: ['sdr', 'sales pipeline', 'lead qualification', 'sales qualification', 'crm pipeline', 'prospecting'],
    incidentals: ['sales rep', 'sales team', 'lead scoring', 'quota']
  }
];

function tokenizedSource(input: ProjectInput): string {
  return [
    input.productName,
    input.productIdea,
    input.targetAudience,
    input.mustHaveFeatures,
    input.niceToHaveFeatures,
    input.dataAndIntegrations,
    input.problemStatement,
    input.risks
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function antiMatchSource(input: ProjectInput): string {
  return [input.nonGoals, input.constraints, input.productIdea, input.problemStatement]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function findFirstMatch(haystack: string, needles: string[]): string | undefined {
  for (const needle of needles) {
    if (haystack.includes(needle.toLowerCase())) return needle;
  }
  return undefined;
}

type RuleScore = {
  archetype: DomainArchetype;
  score: number;
  topKeyword?: string;
  antiMatched?: string;
};

function scoreRule(rule: KeywordRule, source: string, antiSource: string): RuleScore {
  const veto = rule.antiMatch ? findFirstMatch(antiSource, rule.antiMatch) : undefined;
  if (veto) {
    return { archetype: rule.archetype, score: 0, antiMatched: veto };
  }

  let anchorScore = 0;
  let incidentalScore = 0;
  let topKeyword: string | undefined;
  for (const anchor of rule.anchors) {
    if (source.includes(anchor.toLowerCase())) {
      anchorScore += ANCHOR_WEIGHT;
      if (!topKeyword) topKeyword = anchor;
    }
  }
  // Incidentals only count when at least one anchor has matched. This prevents an
  // archetype from being picked on incidentals alone (e.g. "vendor" or "resident"
  // pulling unrelated products into hoa-maintenance).
  if (anchorScore > 0) {
    for (const incidental of rule.incidentals) {
      if (source.includes(incidental.toLowerCase())) {
        incidentalScore += INCIDENTAL_WEIGHT;
      }
    }
  }
  return { archetype: rule.archetype, score: anchorScore + incidentalScore, topKeyword };
}

export function detectArchetype(input: ProjectInput): ArchetypeDetection {
  const source = tokenizedSource(input);
  const antiSource = antiMatchSource(input);

  const scored = RULES.map((rule) => scoreRule(rule, source, antiSource));
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const runnerUp = sorted[1];

  const candidateScores = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ archetype, score, topKeyword }) => ({ archetype, score, topKeyword }));

  if (!winner || winner.score === 0) {
    const antiVetoed = scored.find((entry) => entry.antiMatched);
    return {
      archetype: 'general',
      confidence: 0.5,
      method: 'fallback',
      rationale: antiVetoed
        ? `No archetype scored above 0; ${antiVetoed.archetype} was vetoed by anti-match keyword "${antiVetoed.antiMatched}". Falling back to general.`
        : 'No archetype keywords matched the brief. Falling back to general.',
      antiMatched: antiVetoed?.antiMatched,
      candidateScores
    };
  }

  const margin = runnerUp ? winner.score - runnerUp.score : winner.score;
  const denom = Math.max(winner.score, ANCHOR_WEIGHT + INCIDENTAL_WEIGHT);
  const confidence = Math.max(0, Math.min(1, margin / denom));

  return {
    archetype: winner.archetype,
    confidence,
    method: 'keyword',
    matchedKeyword: winner.topKeyword,
    rationale:
      runnerUp && runnerUp.score > 0
        ? `Picked ${winner.archetype} (score ${winner.score}) over ${runnerUp.archetype} (score ${runnerUp.score}) on keyword "${winner.topKeyword}".`
        : `Picked ${winner.archetype} (score ${winner.score}) on keyword "${winner.topKeyword}". No competing archetypes scored.`,
    candidateScores
  };
}

/**
 * Stub for an LLM-verified archetype check. Wired through `MVP_BUILDER_LLM_ARCHETYPE=1`
 * in a follow-up; default code path stays synchronous and offline.
 */
export async function verifyWithLLM(_input: ProjectInput, candidate: ArchetypeDetection): Promise<ArchetypeDetection> {
  return { ...candidate, method: 'llm' };
}
