import type { ProjectInput } from './types';

export type SemanticFitVerdict = 'high' | 'low' | 'critical';

export type SemanticFit = {
  score: number;
  verdict: SemanticFitVerdict;
  inputTokenCount: number;
  outputTokenCount: number;
  overlapTokenCount: number;
  overlapTokens: string[];
  inputOnlyTokens: string[];
  outputOnlyTokens: string[];
};

const STOPWORDS = new Set<string>([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'these', 'those',
  'will', 'should', 'shall', 'must', 'have', 'been', 'when', 'then', 'than', 'them',
  'they', 'their', 'what', 'where', 'while', 'about', 'over', 'under', 'into',
  'each', 'every', 'some', 'such', 'also', 'only', 'just', 'very', 'more', 'less',
  'after', 'before', 'because', 'between', 'across', 'within',
  'phase', 'phases', 'requirement', 'requirements', 'workflow', 'workflows',
  'system', 'systems', 'user', 'users', 'actor', 'actors', 'record', 'records',
  'data', 'field', 'fields', 'related', 'related entities', 'entities', 'pending',
  'note', 'notes', 'value', 'values', 'item', 'items', 'name', 'names',
  'plan', 'plans', 'gate', 'gates', 'review', 'reviewer', 'review:',
  'mvp', 'builder', 'package', 'workspace', 'project', 'release',
  'first', 'second', 'third', 'next', 'last', 'right', 'wrong'
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  if (!text) return tokens;
  for (const raw of text.toLowerCase().split(/[^a-z0-9-]+/)) {
    if (raw.length < 4) continue;
    if (STOPWORDS.has(raw)) continue;
    if (/^\d+$/.test(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

function inputCorpus(input: ProjectInput): string {
  return [
    input.productName,
    input.productIdea,
    input.targetAudience,
    input.mustHaveFeatures,
    input.niceToHaveFeatures,
    input.dataAndIntegrations,
    input.problemStatement,
    input.questionnaireAnswers?.['primary-workflow'] ?? '',
    input.successMetrics
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Classify the fit using the Jaccard score plus a confidence signal that callers
 * supply (defaults to 1). Phase A3c removed the archetype keyword router, so
 * the second argument is now always `1` from generator.ts; the threshold logic
 * is retained because external callers can still pass a lower confidence to
 * widen the `critical` / `low` bands when scoring against research-grounded
 * extractions of varying depth.
 */
function classify(score: number, confidence: number): SemanticFitVerdict {
  if (score < 0.10 && confidence < 0.4) return 'critical';
  if (score < 0.13 && confidence < 0.6) return 'low';
  return 'high';
}

export function computeSemanticFit(
  input: ProjectInput,
  generatedRequirementsBody: string,
  confidence: number = 1
): SemanticFit {
  const inputTokens = tokenize(inputCorpus(input));
  const outputTokens = tokenize(generatedRequirementsBody);

  const overlap = new Set<string>();
  for (const tok of inputTokens) {
    if (outputTokens.has(tok)) overlap.add(tok);
  }

  const union = new Set<string>([...inputTokens, ...outputTokens]);
  const score = union.size === 0 ? 0 : overlap.size / union.size;

  const inputOnly = [...inputTokens].filter((t) => !outputTokens.has(t)).slice(0, 30);
  const outputOnly = [...outputTokens].filter((t) => !inputTokens.has(t)).slice(0, 30);

  return {
    score: Math.round(score * 10000) / 10000,
    verdict: classify(score, confidence),
    inputTokenCount: inputTokens.size,
    outputTokenCount: outputTokens.size,
    overlapTokenCount: overlap.size,
    overlapTokens: [...overlap].sort().slice(0, 30),
    inputOnlyTokens: inputOnly,
    outputOnlyTokens: outputOnly
  };
}
