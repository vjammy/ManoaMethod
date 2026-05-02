/**
 * Domain pack registry + category detection.
 *
 * `detectCategory` scores a brief against every pack's matchKeywords, then
 * returns the winning CategoryId. Falls back to `general` when no pack scores
 * meaningfully.
 *
 * `getPack` returns the curated DomainPack for a category. The synthesizer
 * uses the pack to layer realistic actors / entities / workflows / JTBDs on
 * top of brief-derived noun-phrase extraction.
 */
import type { ProjectInput } from '../../types';
import type { CategoryId, DomainPack } from './types';
import { sales } from './sales';
import { household } from './household';
import { scheduling } from './scheduling';
import { education } from './education';
import { healthcare } from './healthcare';
import { ledgerFinance } from './ledger-finance';
import { volunteer } from './volunteer';
import { inventory } from './inventory';
import { hospitality } from './hospitality';
import { fitness } from './fitness';
import { community } from './community';
import { general } from './general';

export type { DomainPack, CategoryId, ActorArchetype, EntityArchetype, FieldArchetype, WorkflowArchetype, WorkflowStepArchetype, WorkflowFailureArchetype, JtbdSeed, IntegrationHint, SuccessMetricSeed, CompetingAlternativeSeed, IdeaCritiqueSeed } from './types';

const ALL_PACKS: DomainPack[] = [
  sales,
  household,
  scheduling,
  education,
  healthcare,
  ledgerFinance,
  volunteer,
  inventory,
  hospitality,
  fitness,
  community,
  general
];

const PACK_BY_ID = new Map<CategoryId, DomainPack>(ALL_PACKS.map((p) => [p.id, p]));

export function getPack(id: CategoryId): DomainPack {
  return PACK_BY_ID.get(id) || general;
}

export function listPacks(): DomainPack[] {
  return [...ALL_PACKS];
}

/**
 * Detect the best-fit category for a brief.
 *
 * Scoring: each pack scores `+2` for every keyword it matches in the
 * concatenated text of (productName + productIdea + targetAudience +
 * mustHaveFeatures + niceToHaveFeatures + dataAndIntegrations + nonGoals).
 * Audience-specific keywords score +1 if they appear only in targetAudience.
 *
 * `general` is the tiebreaker. If the top non-general pack scores less than
 * 2 (i.e. only one weak keyword match), returns `general`.
 */
export function detectCategory(input: ProjectInput): CategoryId {
  const generalText = [
    input.productName,
    input.productIdea,
    input.mustHaveFeatures,
    input.niceToHaveFeatures,
    input.dataAndIntegrations,
    input.nonGoals,
    input.problemStatement
  ]
    .filter((s): s is string => typeof s === 'string')
    .join(' ')
    .toLowerCase();
  const audienceText = (input.targetAudience || '').toLowerCase();

  const scores = new Map<CategoryId, number>();
  for (const pack of ALL_PACKS) {
    if (pack.id === 'general') continue;
    let score = 0;
    for (const kw of pack.matchKeywords) {
      const needle = kw.toLowerCase();
      // Word-boundary match in general text counts +2; substring fallback +1.
      const wordRe = new RegExp(`(^|[^a-z0-9])${escapeRegex(needle)}([^a-z0-9]|$)`);
      if (wordRe.test(generalText)) {
        score += 2;
      } else if (generalText.includes(needle)) {
        score += 1;
      }
    }
    if (pack.matchAudience) {
      for (const aud of pack.matchAudience) {
        if (audienceText.includes(aud.toLowerCase())) score += 1;
      }
    }
    if (score > 0) scores.set(pack.id, score);
  }

  if (scores.size === 0) return 'general';

  let best: { id: CategoryId; score: number } = { id: 'general', score: 0 };
  for (const [id, score] of scores.entries()) {
    if (score > best.score) best = { id, score };
  }
  return best.score >= 2 ? best.id : 'general';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
