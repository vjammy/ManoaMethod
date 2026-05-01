/**
 * Generate product-strategy/JOBS_TO_BE_DONE.md from research extractions.
 * Sources: extractions.jobsToBeDone (one entry per actor by convention).
 *
 * Phase E4 audit dimension `jtbd-coverage` rewards ≥1 JTBD per actor and
 * the presence of a measurable expected outcome (no "feel better" handwaving).
 */
import type { ResearchExtractions } from '../research/schema';

const VAGUE_OUTCOME_PATTERNS = [
  /feel better/i,
  /be more productive/i,
  /save time/i,
  /improve experience/i,
  /increase efficiency/i
];

function isVague(outcome: string): boolean {
  return VAGUE_OUTCOME_PATTERNS.some((p) => p.test(outcome));
}

export function renderJobsToBeDoneMarkdown(ex: ResearchExtractions): string {
  const jtbds = ex.jobsToBeDone ?? [];
  if (jtbds.length === 0) {
    return `# JOBS_TO_BE_DONE

> No jobs-to-be-done were extracted. Run the recipe (extended Pass 2) to populate \`research/extracted/jobsToBeDone.json\` with one JTBD per actor.
`;
  }

  const actorById = new Map(ex.actors.map((a) => [a.id, a]));
  const blocks = jtbds.map((j) => {
    const actor = actorById.get(j.actorId);
    const actorName = actor?.name || j.actorId;
    const vagueWarning = isVague(j.expectedOutcome)
      ? `\n\n> ⚠️ Expected outcome reads as vague. Rewrite with a measurable signal (a count, a state, a stop-condition). The audit \`jtbd-coverage\` dimension flags vague outcomes.`
      : '';
    const hireForBlock = j.hireForCriteria.length
      ? j.hireForCriteria.map((c) => `- ${c}`).join('\n')
      : '_No hire-for criteria recorded._';
    return `### ${actorName} (\`${j.actorId}\`)

- **Situation:** ${j.situation}
- **Motivation:** ${j.motivation}
- **Expected outcome:** ${j.expectedOutcome}${vagueWarning}
- **Current workaround:** ${j.currentWorkaround}

**Hire-for criteria** (what would actually make ${actorName} adopt this product):

${hireForBlock}`;
  });

  // Coverage analysis
  const actorIds = new Set(ex.actors.map((a) => a.id));
  const covered = new Set(jtbds.map((j) => j.actorId));
  const missing = ex.actors.filter((a) => !covered.has(a.id));

  const coverageBlock = missing.length
    ? `\n\n> ⚠️ Missing JTBDs for: ${missing.map((a) => `**${a.name}**`).join(', ')}. Every actor in \`research/extracted/actors.json\` should have at least one JTBD; the audit \`jtbd-coverage\` dimension caps when ≥1 actor is missing.`
    : '';

  return `# JOBS_TO_BE_DONE

> Generated from research extractions. Each JTBD captures the *job* an actor hires this product to do — not what we think they want, but the situation, motivation, and outcome from their point of view. Read alongside \`product-strategy/VALUE_PROPOSITION.md\` and \`requirements/PERMISSION_MATRIX.md\`.${coverageBlock}

## Coverage

- Actors total: ${ex.actors.length}
- Actors with at least one JTBD: ${covered.size}
- Total JTBDs recorded: ${jtbds.length}

## JTBDs

${blocks.join('\n\n')}

## How to use this file

- When designing a new screen or workflow, ask: which JTBD is this serving? If none, scope is drifting.
- When prioritizing must-haves, ask: which JTBDs do we leave broken if we cut this? Those are the load-bearing must-haves.
- When reviewing test outcomes, ask: did the test prove the JTBD's expected outcome, or just that "the thing happened"?
`;
}
