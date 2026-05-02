/**
 * 10-pass research loop driver.
 *
 * Runs use-case and domain research as separate independent loops. Each loop
 * alternates researcher → critic. Loop stops on:
 *   - critic verdict 'converged' (totalScore >= 90, no critical gaps), or
 *   - critic verdict 'stalled' (score improvement < 5 over previous pass), or
 *   - hard cap MAX_PASSES.
 *
 * The driver is provider-agnostic — the same code path works with the
 * Anthropic SDK provider, a Claude Code session provider, or a mock provider
 * for tests.
 */

import { createHash } from 'node:crypto';
import type { ProjectInput } from '../types';
import type { CritiqueResult, ResearchExtractions } from './schema';
import { SCHEMA_VERSION } from './schema';
import type { ResearchProvider } from './providers';
import type { ResearchTopic } from './prompts';

export const MAX_PASSES = 10;
export const MIN_PASSES = 2;
export const CONVERGENCE_THRESHOLD = 90;
export const STALL_DELTA = 5;
export const DEFAULT_TOKEN_CAP = 200_000;

export type PassRecord = {
  pass: number;
  markdown: string;
  critique: CritiqueResult;
  tokensUsed: number;
  durationMs: number;
};

export type TopicResult = {
  topic: ResearchTopic;
  passes: PassRecord[];
  finalMarkdown: string;
  finalScore: number;
  convergedEarly: boolean;
  stalled: boolean;
};

export type LoopResult = {
  briefHash: string;
  startedAt: string;
  completedAt: string;
  useCase: TopicResult;
  domain: TopicResult;
  extractions: ResearchExtractions;
  totalTokensUsed: number;
  /** Set when auditExit was configured. Records the final audit + retry attempts. */
  auditExit?: AuditExitOutcome;
};

/**
 * Result of running the audit callback on a candidate extraction.
 * Designed to mirror the `mvp-builder-quality-audit.ts` AuditResult shape
 * but re-declared here so lib/research/ doesn't depend on scripts/.
 */
export type AuditExitResult = {
  total: number;
  /** 100 when no expert cap applied; lower otherwise. */
  capApplied: number;
  capReasons: string[];
  topFindings: Array<{ severity: 'blocker' | 'warning' | 'info'; dimension: string; message: string }>;
  /**
   * Phase F follow-up: blocking depth-gate failures. Populated by the runner
   * when AuditExitConfig.depthEnforcement is true. Each entry seeds a gap
   * the targeted re-extraction loop will address.
   */
  depthGateBlocking?: Array<{
    dim: string;
    score: number;
    threshold: number;
    upstreamPass: string;
    remediation: string;
  }>;
};

export type AuditExitConfig = {
  /** Audit total must be >= threshold to count as passing. */
  threshold: number;
  /** When true, any expert cap < 100 also fails (cap reasons become retry gaps). */
  respectCaps: boolean;
  /** Number of retry attempts before giving up. Default 2. */
  maxRetries?: number;
  /**
   * Phase F follow-up: when true, depth-gate blocking failures also count as
   * "not yet passing" and feed gap entries into targeted re-extraction.
   * The runner reads research/extracted/risks.json to apply the conditional
   * regulatory-mapping rule.
   */
  depthEnforcement?: boolean;
  /** The actual audit run. Caller wires this to create-project + runAudit. */
  run: (extractions: ResearchExtractions) => Promise<AuditExitResult>;
};

export type AuditExitOutcome = {
  finalAudit: AuditExitResult;
  retries: number;
  passed: boolean;
};

export function hashBrief(brief: ProjectInput): string {
  // Hash only the user-authored fields. Whitespace-normalized so cosmetic
  // edits don't bust the cache.
  const normalized = JSON.stringify(
    {
      productName: brief.productName.trim(),
      productIdea: brief.productIdea.trim().replace(/\s+/g, ' '),
      targetAudience: brief.targetAudience.trim().replace(/\s+/g, ' '),
      problemStatement: brief.problemStatement.trim().replace(/\s+/g, ' '),
      mustHaveFeatures: brief.mustHaveFeatures.trim().replace(/\s+/g, ' '),
      niceToHaveFeatures: brief.niceToHaveFeatures.trim().replace(/\s+/g, ' '),
      dataAndIntegrations: brief.dataAndIntegrations.trim().replace(/\s+/g, ' '),
      constraints: brief.constraints.trim().replace(/\s+/g, ' '),
      nonGoals: brief.nonGoals.trim().replace(/\s+/g, ' ')
    },
    Object.keys({}).sort()
  );
  return createHash('sha256').update(normalized).digest('hex');
}

async function runOneTopic(
  topic: ResearchTopic,
  brief: ProjectInput,
  provider: ResearchProvider,
  maxPasses: number,
  tokenBudgetRemaining: { value: number }
): Promise<TopicResult> {
  const passes: PassRecord[] = [];
  let previousResearch: string | undefined;
  let previousCritique: CritiqueResult | undefined;
  let convergedEarly = false;
  let stalled = false;

  for (let pass = 1; pass <= maxPasses; pass++) {
    if (tokenBudgetRemaining.value <= 0) {
      stalled = true;
      break;
    }
    const passStart = Date.now();
    const research = await provider.runResearchPass({
      topic,
      pass,
      totalPasses: maxPasses,
      brief,
      previousResearch,
      previousCritique
    });

    const critique = await provider.runCritiquePass({
      topic,
      pass,
      totalPasses: maxPasses,
      brief,
      passOutput: research.markdown,
      previousScore: previousCritique?.totalScore
    });

    const totalTokens = research.tokensUsed + critique.tokensUsed;
    tokenBudgetRemaining.value -= totalTokens;

    passes.push({
      pass,
      markdown: research.markdown,
      critique: critique.critique,
      tokensUsed: totalTokens,
      durationMs: Date.now() - passStart
    });

    // L1: even if pass 1 reports 'converged', force a confirmation pass. The second
    // pass uses the critic's gaps as scope and can either stay at the same score
    // (true convergence) or surface what pass 1 missed.
    const aboveThreshold =
      critique.critique.verdict === 'converged' || critique.critique.totalScore >= CONVERGENCE_THRESHOLD;
    if (aboveThreshold && pass >= MIN_PASSES) {
      convergedEarly = true;
      break;
    }
    if (critique.critique.verdict === 'stalled' && pass >= MIN_PASSES) {
      stalled = true;
      break;
    }

    previousResearch = research.markdown;
    previousCritique = critique.critique;
  }

  const best = [...passes].sort((a, b) => b.critique.totalScore - a.critique.totalScore)[0]!;
  return {
    topic,
    passes,
    finalMarkdown: best.markdown,
    finalScore: best.critique.totalScore,
    convergedEarly,
    stalled
  };
}

export async function runResearchLoop(args: {
  brief: ProjectInput;
  provider: ResearchProvider;
  maxPasses?: number;
  maxTotalTokens?: number;
  /** When provided, gates loop completion on the audit result. See AuditExitConfig. */
  auditExit?: AuditExitConfig;
}): Promise<LoopResult> {
  const startedAt = new Date().toISOString();
  const briefHash = hashBrief(args.brief);
  const cap = args.maxPasses ?? MAX_PASSES;
  // Token budget shared across both topics; mutated as passes run so a runaway
  // researcher in one topic can't deplete budget for the other before alarm.
  const tokenBudgetRemaining = { value: args.maxTotalTokens ?? DEFAULT_TOKEN_CAP };

  // Run both topics in parallel — they're independent.
  const [useCase, domain] = await Promise.all([
    runOneTopic('use-case', args.brief, args.provider, cap, tokenBudgetRemaining),
    runOneTopic('domain', args.brief, args.provider, cap, tokenBudgetRemaining)
  ]);

  const totalPassTokens =
    useCase.passes.reduce((s, p) => s + p.tokensUsed, 0) +
    domain.passes.reduce((s, p) => s + p.tokensUsed, 0);

  // RC2: stamp explicit researchSource so downstream demoReady checks don't
  // have to infer from the legacy `researcher` field. Mock provider stays
  // 'synthesized' (test fixtures); real LLM providers are 'agent-recipe'.
  const researchSource: 'synthesized' | 'agent-recipe' =
    args.provider.name === 'mock' ? 'synthesized' : 'agent-recipe';

  // Helper: produce structured extractions from current narratives.
  const extractOnce = async () =>
    args.provider.runExtraction({
      brief: args.brief,
      useCaseResearch: useCase.finalMarkdown,
      domainResearch: domain.finalMarkdown,
      meta: {
        briefHash,
        schemaVersion: SCHEMA_VERSION,
        startedAt,
        completedAt: new Date().toISOString(),
        totalPasses: { useCase: useCase.passes.length, domain: domain.passes.length },
        finalCriticScores: { useCase: useCase.finalScore, domain: domain.finalScore },
        convergedEarly: { useCase: useCase.convergedEarly, domain: domain.convergedEarly },
        totalTokensUsed: totalPassTokens,
        modelUsed: args.provider.name === 'mock' ? 'mock' : 'claude-sonnet-4-6',
        researcher: args.provider.name,
        researchSource
      }
    });

  let extractionRun = await extractOnce();
  let extractionTokens = extractionRun.tokensUsed;
  let auditExitOutcome: AuditExitOutcome | undefined;

  // Audit-exit: gate the loop on the audit result. If the audit fails the
  // threshold or applies an expert cap, feed audit findings back as critic
  // gaps and request one targeted research pass + re-extraction.
  if (args.auditExit) {
    const maxRetries = args.auditExit.maxRetries ?? 2;
    let retries = 0;
    let audit = await args.auditExit.run(extractionRun.extractions);

    while (
      retries < maxRetries &&
      !auditPassed(audit, args.auditExit.threshold, args.auditExit.respectCaps, args.auditExit.depthEnforcement)
    ) {
      retries += 1;
      const targetedGaps = auditFindingsAsGaps(audit);

      // Run ONE targeted research pass per topic with audit findings as critic
      // gaps. Re-extracting after gives the loop a chance to incorporate the
      // researcher's response to the audit's specific complaints.
      const [extraUseCase, extraDomain] = await Promise.all([
        runTargetedTopicPass('use-case', args.brief, args.provider, useCase, targetedGaps, tokenBudgetRemaining),
        runTargetedTopicPass('domain', args.brief, args.provider, domain, targetedGaps, tokenBudgetRemaining)
      ]);
      if (extraUseCase) {
        useCase.passes.push(extraUseCase);
        if (extraUseCase.critique.totalScore > useCase.finalScore) {
          useCase.finalScore = extraUseCase.critique.totalScore;
          useCase.finalMarkdown = extraUseCase.markdown;
        }
      }
      if (extraDomain) {
        domain.passes.push(extraDomain);
        if (extraDomain.critique.totalScore > domain.finalScore) {
          domain.finalScore = extraDomain.critique.totalScore;
          domain.finalMarkdown = extraDomain.markdown;
        }
      }

      extractionRun = await extractOnce();
      extractionTokens += extractionRun.tokensUsed;
      audit = await args.auditExit.run(extractionRun.extractions);
    }

    auditExitOutcome = {
      finalAudit: audit,
      retries,
      passed: auditPassed(audit, args.auditExit.threshold, args.auditExit.respectCaps, args.auditExit.depthEnforcement)
    };
  }

  return {
    briefHash,
    startedAt,
    completedAt: new Date().toISOString(),
    useCase,
    domain,
    extractions: extractionRun.extractions,
    totalTokensUsed: totalPassTokens + extractionTokens,
    auditExit: auditExitOutcome
  };
}

function auditPassed(
  audit: AuditExitResult,
  threshold: number,
  respectCaps: boolean,
  depthEnforcement?: boolean
): boolean {
  if (audit.total < threshold) return false;
  if (respectCaps && audit.capApplied < 100) return false;
  // Phase F follow-up: depth-gate blocking failures count as "not yet passing"
  // when enforcement is on. The runner populates depthGateBlocking; we just
  // observe it here.
  if (depthEnforcement && audit.depthGateBlocking && audit.depthGateBlocking.length > 0) return false;
  return true;
}

function auditFindingsAsGaps(audit: AuditExitResult): CritiqueResult['gaps'] {
  const gaps: CritiqueResult['gaps'] = [];
  for (const reason of audit.capReasons) {
    gaps.push({
      area: 'audit-cap',
      severity: 'critical',
      instruction: `Address audit cap to lift score above the gating threshold: ${reason}`
    });
  }
  for (const f of audit.topFindings) {
    if (f.severity === 'info') continue;
    gaps.push({
      area: `audit-${f.dimension}`,
      severity: f.severity === 'blocker' ? 'critical' : 'important',
      instruction: f.message
    });
  }
  // Phase F follow-up: depth-gate failures map to upstream-pass gaps so the
  // targeted re-extraction loop knows where to apply the fix.
  for (const f of audit.depthGateBlocking ?? []) {
    gaps.push({
      area: `depth-${f.dim}`,
      severity: 'critical',
      instruction: `Depth gate: ${f.dim}=${f.score} (need ≥${f.threshold}). Fix in ${f.upstreamPass}: ${f.remediation}`
    });
  }
  return gaps;
}

async function runTargetedTopicPass(
  topic: ResearchTopic,
  brief: ProjectInput,
  provider: ResearchProvider,
  current: TopicResult,
  auditGaps: CritiqueResult['gaps'],
  tokenBudgetRemaining: { value: number }
): Promise<PassRecord | null> {
  if (tokenBudgetRemaining.value <= 0) return null;
  const passNumber = current.passes.length + 1;
  // Synthetic critique to feed the targeted pass: previous score (use the topic's
  // final score) + audit gaps converted into critic gaps. The researcher
  // prompt will treat these gaps as scope.
  const syntheticCritique: CritiqueResult = {
    pass: passNumber - 1,
    topic,
    scores: {
      coverage: 50,
      citationDensity: 50,
      specificity: 50,
      recency: 50,
      internalConsistency: 50,
      briefAlignment: 50
    },
    totalScore: current.finalScore,
    verdict: 'continue',
    gaps: auditGaps,
    redactionsRequired: []
  };

  const passStart = Date.now();
  const research = await provider.runResearchPass({
    topic,
    pass: passNumber,
    totalPasses: passNumber,
    brief,
    previousResearch: current.finalMarkdown,
    previousCritique: syntheticCritique
  });
  const critique = await provider.runCritiquePass({
    topic,
    pass: passNumber,
    totalPasses: passNumber,
    brief,
    passOutput: research.markdown,
    previousScore: current.finalScore
  });
  const totalTokens = research.tokensUsed + critique.tokensUsed;
  tokenBudgetRemaining.value -= totalTokens;

  return {
    pass: passNumber,
    markdown: research.markdown,
    critique: critique.critique,
    tokensUsed: totalTokens,
    durationMs: Date.now() - passStart
  };
}
