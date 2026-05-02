/**
 * Generate product-strategy/USER_PERSONAS.md from research extractions.
 *
 * One persona per primary-user / reviewer / operator actor. Each persona:
 *   - Role and responsibilities (Actor.responsibilities)
 *   - Why they will use it (JTBD.motivation + JTBD.expectedOutcome)
 *   - Pain points (derived from JTBD.currentWorkaround + workflow failure modes)
 *   - Adoption signals (JTBD.hireForCriteria)
 *   - Visibility scope (Actor.visibility)
 *
 * Phase F2 — feeds the audit dimension `persona-depth` (added in F3).
 */
import type { ResearchExtractions } from '../research/schema';

export function renderUserPersonasMarkdown(ex: ResearchExtractions): string {
  const jtbdByActorId = new Map<string, { motivation: string; expectedOutcome: string; currentWorkaround: string; hireForCriteria: string[]; situation: string }>();
  for (const j of ex.jobsToBeDone || []) {
    if (!jtbdByActorId.has(j.actorId)) {
      jtbdByActorId.set(j.actorId, {
        motivation: j.motivation,
        expectedOutcome: j.expectedOutcome,
        currentWorkaround: j.currentWorkaround,
        hireForCriteria: j.hireForCriteria,
        situation: j.situation
      });
    }
  }

  const personaActors = ex.actors.filter((a) => a.type !== 'external');
  const blocks = personaActors.map((a) => {
    const jtbd = jtbdByActorId.get(a.id);
    const failuresMentioningActor = ex.workflows
      .flatMap((w) => w.failureModes.map((f) => ({ wf: w.name, ...f })))
      .filter((f) => /(privacy|consent|leak|conflict|unauthorized|missed|wrong|bounce|error)/i.test(f.trigger))
      .slice(0, 3);

    const painPoints: string[] = [];
    if (jtbd?.currentWorkaround) {
      painPoints.push(`Today they fall back to: ${jtbd.currentWorkaround}`);
    }
    for (const f of failuresMentioningActor) {
      painPoints.push(`When **${f.trigger}** happens in ${f.wf}, the consequence is: ${f.effect}`);
    }

    return `## ${a.name} (\`${a.id}\`)

**Role:** ${a.type}${a.authMode ? ` · auth: ${a.authMode}` : ''}

### Responsibilities
${a.responsibilities.map((r) => `- ${r}`).join('\n')}

### Why they will use it
${jtbd ? `**Situation:** ${jtbd.situation}\n\n**Motivation:** ${jtbd.motivation}\n\n**Expected outcome:** ${jtbd.expectedOutcome}` : `- (No JTBD recorded for this actor — extend \`jobsToBeDone.json\` to populate.)`}

### Pain points
${painPoints.length ? painPoints.map((p) => `- ${p}`).join('\n') : '- (No pain points derivable from research.)'}

### Adoption signals (what would actually make them use this product)
${jtbd?.hireForCriteria?.length ? jtbd.hireForCriteria.map((h) => `- ${h}`).join('\n') : '- (None recorded.)'}

### Visibility scope
${a.visibility.map((v) => `- ${v}`).join('\n')}
`;
  });

  return `# USER_PERSONAS

> Generated from research extractions. One persona per primary-user / reviewer / operator actor. The "Why they will use it" section is sourced from \`jobsToBeDone.json\` and explains adoption motivation. The "Pain points" section is derived from the actor's current workaround plus relevant workflow failure modes.

${blocks.join('\n---\n\n')}

---

> The audit \`persona-depth\` dimension (Phase F3) credits personas that cover responsibilities, motivation, expected outcome, ≥1 pain point, ≥2 adoption signals, and a visibility scope.
`;
}
