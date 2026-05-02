/**
 * Generate product-strategy/SUCCESS_METRICS.md from research extractions.
 *
 * Pulls D1/D7/D30 adoption signals from:
 *   - meta.discovery.valueProposition.topThreeOutcomes (pack-seeded outcomes when synth)
 *   - JTBD.hireForCriteria (per-actor adoption signals)
 *   - Workflow failureModes (leading indicators — failures that should NOT happen)
 *
 * Phase F2.
 */
import type { ProjectInput } from '../types';
import type { ResearchExtractions } from '../research/schema';

export function renderSuccessMetricsMarkdown(ex: ResearchExtractions, input: ProjectInput): string {
  const outcomes = ex.meta.discovery?.valueProposition?.topThreeOutcomes || [];
  const actorById = new Map(ex.actors.map((a) => [a.id, a]));

  const adoptionByActor = (ex.jobsToBeDone || []).map((j) => {
    const actor = actorById.get(j.actorId);
    return {
      actor: actor?.name || j.actorId,
      hireFor: j.hireForCriteria
    };
  });

  const leadingIndicators = ex.workflows.map((w) => ({
    workflow: w.name,
    failures: w.failureModes.map((f) => ({ trigger: f.trigger, mitigation: f.mitigation }))
  }));

  const successList = outcomes.length
    ? outcomes.map((o, i) => `${i + 1}. ${o}`).join('\n')
    : `_(No top-three outcomes recorded in research/extracted/meta.json.)_`;

  const adoptionBlocks = adoptionByActor.map((entry) => {
    if (!entry.hireFor.length) return `### ${entry.actor}\n- (No adoption signals recorded.)`;
    return `### ${entry.actor}\n${entry.hireFor.map((h) => `- ${h}`).join('\n')}`;
  });

  const leadingBlocks = leadingIndicators.map((entry) => {
    if (!entry.failures.length) return `### ${entry.workflow}\n- (No failure modes recorded.)`;
    return `### ${entry.workflow}\n${entry.failures.map((f) => `- **Detect** "${f.trigger}" → **Act:** ${f.mitigation}`).join('\n')}`;
  });

  return `# SUCCESS_METRICS

> Generated from research extractions. The metrics below are the observable signals that prove ${input.productName} is working for its users — not internal feelings, vague satisfaction, or vanity counts.

## North-star outcomes (D7 / D30)

${successList}

## Per-actor adoption signals (D1 / D7)

These are the things each actor would actually be willing to "hire" the product for. Sourced from \`research/extracted/jobsToBeDone.json\`.

${adoptionBlocks.length ? adoptionBlocks.join('\n\n') : '_(No JTBDs recorded — extend `jobsToBeDone.json`.)_'}

## Leading indicators (per workflow)

These are the failure modes that should be detected and acted on quickly — measure detection latency and action rate, not just prevalence.

${leadingBlocks.length ? leadingBlocks.join('\n\n') : '_(No workflow failure modes recorded.)_'}

## What we are NOT measuring

- Vanity metrics (signups without activation, total page views).
- Internal feelings ("user satisfaction" without a behavioral correlate).
- Anything not derivable from the persisted state of \`research/extracted/*.json\` artifacts.

> This file is read alongside \`product-strategy/USE_CASES.md\` and \`product-strategy/USER_PERSONAS.md\` during phase planning to ensure each phase advances at least one north-star outcome or one leading indicator.
`;
}
