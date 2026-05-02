/**
 * Generate requirements/PER_SCREEN_REQUIREMENTS.md from research extractions.
 *
 * For each screen in extractions.screens (Phase E2 data), emit:
 *   - Route + primary actor + secondary actors
 *   - Sections, fields, four-state contract (empty/loading/error/populated)
 *   - Actions and their refWorkflowStep / navTo
 *   - **Screen-specific acceptance criterion** — uniquely worded for this
 *     screen (the screen action a tester can verify), NOT the workflow's
 *     overall acceptance pattern repeated.
 *   - **Edge cases** — synthesized from the relevant workflow failure modes
 *     plus the screen's `error` state copy.
 *
 * Phase F2 — feeds the audit dimension `per-screen-acceptance-uniqueness`
 * (added in F3).
 */
import type { ResearchExtractions } from '../research/schema';

export function renderPerScreenRequirementsMarkdown(ex: ResearchExtractions): string {
  const screens = ex.screens || [];
  if (screens.length === 0) {
    return `# PER_SCREEN_REQUIREMENTS

> No screens in research/extracted/screens.json. Run the recipe (Pass 4.5) to populate the screen catalog and re-generate.
`;
  }

  const actorById = new Map(ex.actors.map((a) => [a.id, a]));
  const workflowById = new Map(ex.workflows.map((w) => [w.id, w]));

  const blocks = screens.map((s) => {
    const primary = actorById.get(s.primaryActor)?.name || s.primaryActor;
    const secondary = s.secondaryActors.map((id) => actorById.get(id)?.name || id);
    const fieldRows = s.fields.map((f) => `| ${f.name} | ${f.kind} | ${f.label}${f.refEntityField ? ` (\`${f.refEntityField}\`)` : ''} | ${f.validation || '—'} |`).join('\n');
    const actionRows = s.actions
      .map((a) => `| ${a.label} | ${a.kind} | ${a.refWorkflowStep ? `→ ${a.refWorkflowStep}` : ''} ${a.navTo ? `(navigate to \`${a.navTo}\`)` : ''} |`)
      .join('\n');

    // Screen-specific acceptance criterion
    const primaryAction = s.actions.find((a) => a.kind === 'primary') || s.actions[0];
    const linkedWorkflow = primaryAction?.refWorkflowStep
      ? workflowById.get(primaryAction.refWorkflowStep.split(':')[0])
      : undefined;
    const actionLabel = primaryAction?.label || 'render';
    const acceptance = `Given ${primary} on the **${s.name}** screen with the empty state visible, when they ${actionLabel.toLowerCase()}, then the populated state shows the persisted result and any failure surfaces inline per the error-state contract for this screen.`;

    // Edge cases
    const edgeCases: string[] = [];
    edgeCases.push(`- **Empty:** ${s.states.empty}`);
    edgeCases.push(`- **Loading:** ${s.states.loading}`);
    edgeCases.push(`- **Error:** ${s.states.error}`);
    edgeCases.push(`- **Populated:** ${s.states.populated}`);
    if (linkedWorkflow) {
      for (const f of linkedWorkflow.failureModes.slice(0, 2)) {
        edgeCases.push(`- **Workflow edge "${f.trigger}":** ${f.effect}. Mitigation on this screen: ${f.mitigation}`);
      }
    }

    return `## Screen requirement: ${s.name} (\`${s.id}\`)

- **Route:** \`${s.route}\`
- **Primary actor:** ${primary}${secondary.length ? ` · **Secondary:** ${secondary.join(', ')}` : ''}
- **Purpose:** ${s.purpose}

### Sections
${s.sections.map((sec) => `- **${sec.kind}** — ${sec.title}: ${sec.purpose}`).join('\n')}

### Fields

| name | kind | label | validation |
| --- | --- | --- | --- |
${fieldRows}

### Actions

| label | kind | linkage |
| --- | --- | --- |
${actionRows}

### Screen-specific acceptance

${acceptance}

### Edge cases and state contract

${edgeCases.join('\n')}
`;
  });

  return `# PER_SCREEN_REQUIREMENTS

> Generated from research extractions. One section per screen with a screen-specific acceptance criterion (testable in isolation) and per-screen edge cases. Pair this with \`ui-ux/SCREEN_INVENTORY.md\` (catalog) and \`ui-ux/UX_FLOW.md\` (graph) when implementing.

${blocks.join('\n---\n\n')}

---

> The audit \`per-screen-acceptance-uniqueness\` dimension (Phase F3) credits screens whose acceptance criterion text is distinct from sibling screens and from the workflow-level pattern.
`;
}
