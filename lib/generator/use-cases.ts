/**
 * Generate product-strategy/USE_CASES.md from research extractions.
 *
 * One use case per (primary actor × workflow) pair. Each use case spells out:
 *   - Goal (workflow acceptance pattern)
 *   - Actors (primary + secondary)
 *   - Preconditions (workflow.steps[0].preconditions)
 *   - Main flow (workflow.steps narrative)
 *   - Alternative flows (steps with branchOn)
 *   - Postconditions (last step.postconditions or acceptance)
 *   - Why this actor will use it (matching JTBD motivation + expected outcome)
 *
 * Sources: extractions.workflows + extractions.actors + extractions.jobsToBeDone.
 *
 * Phase F2 — feeds the audit dimension `use-case-depth` (added in F3).
 */
import type { ResearchExtractions } from '../research/schema';

export function renderUseCasesMarkdown(ex: ResearchExtractions): string {
  const actorById = new Map(ex.actors.map((a) => [a.id, a]));
  const jtbdByActorId = new Map<string, typeof ex.jobsToBeDone extends (infer T)[] | undefined ? T : never>();
  for (const j of ex.jobsToBeDone || []) {
    if (!jtbdByActorId.has(j.actorId)) jtbdByActorId.set(j.actorId, j as never);
  }

  const blocks: string[] = [];
  for (const wf of ex.workflows) {
    const primaryActor = actorById.get(wf.primaryActor);
    const primaryName = primaryActor?.name || wf.primaryActor;
    const secondaryNames = wf.secondaryActors
      .map((id) => actorById.get(id)?.name || id)
      .filter(Boolean);
    const jtbd = jtbdByActorId.get(wf.primaryActor) as
      | { motivation: string; expectedOutcome: string; currentWorkaround: string; hireForCriteria: string[] }
      | undefined;
    const preconds = wf.steps[0]?.preconditions || [];
    const lastStep = wf.steps[wf.steps.length - 1];
    const postconds = lastStep?.postconditions || [];
    const mainFlow = wf.steps.map((s) => `${s.order}. **${actorById.get(s.actor)?.name || s.actor}** — ${s.action}. _System:_ ${s.systemResponse}`).join('\n');
    const alternatives = wf.steps
      .filter((s) => s.branchOn)
      .map((s) => `- Step ${s.order}: ${s.branchOn}`);
    const failureBlock = wf.failureModes
      .map((f, i) => `${i + 1}. **${f.trigger}** → ${f.effect}\n   - Mitigation: ${f.mitigation}`)
      .join('\n');

    blocks.push(`## Use case: ${wf.name}

**Primary actor:** ${primaryName}${secondaryNames.length ? `\n**Secondary actors:** ${secondaryNames.join(', ')}` : ''}

**Goal:** ${wf.acceptancePattern}

**Why ${primaryName} will use this:**
${jtbd ? `- _Motivation:_ ${jtbd.motivation}\n- _Expected outcome:_ ${jtbd.expectedOutcome}\n- _What they do today instead:_ ${jtbd.currentWorkaround}\n- _Adoption signal:_ ${jtbd.hireForCriteria[0] || '—'}` : `- Motivation derived from actor responsibilities — extend \`jobsToBeDone.json\` to lift this section.`}

**Preconditions:**
${preconds.length ? preconds.map((p) => `- ${p}`).join('\n') : '- (none recorded)'}

**Main flow:**
${mainFlow || '_(no steps recorded)_'}

**Alternative flows / branches:**
${alternatives.length ? alternatives.join('\n') : '- (no branching points recorded)'}

**Failure modes:**
${failureBlock || '_(no failure modes recorded)_'}

**Postconditions:**
${postconds.length ? postconds.map((p) => `- ${p}`).join('\n') : `- ${wf.acceptancePattern}`}
`);
  }

  return `# USE_CASES

> Generated from research extractions. One use case per workflow with primary actor, goal, preconditions, main flow, alternatives, failure modes, and postconditions. The "Why ${`{actor}`} will use this" section is sourced from \`jobsToBeDone.json\` and explains adoption motivation in the actor's voice.

${blocks.join('\n---\n\n')}

---

> The audit \`use-case-depth\` dimension (Phase F3) credits use cases with all of: main flow ≥3 steps, ≥1 alternative flow, ≥1 failure mode, ≥1 postcondition, and a non-empty "Why" block.
`;
}
