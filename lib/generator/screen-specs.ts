/**
 * Generate per-screen specifications from research extractions.
 *
 * Output:
 *   ui-ux/screens/<screenId>.md   one detailed spec per Screen
 *   ui-ux/SCREEN_INVENTORY.md     overview list (also rendered by main generator;
 *                                 renderScreenInventoryMarkdown lives here so the
 *                                 same code drives both detailed and overview views)
 *
 * Each screen spec covers: route, primary actor, sections, fields (linked to
 * entity fields), explicit empty/loading/error/populated states, primary and
 * secondary actions (linked to workflow steps), inbound and outbound navigation.
 *
 * Phase E2 audit dimension `screen-depth` scores:
 *   - average sections + fields + actions per screen
 *   - presence of all four states per screen
 *   - inbound/outbound navigation symmetry
 */
import type { ResearchExtractions, Screen } from '../research/schema';

function actorNameById(ex: ResearchExtractions, id: string): string {
  return ex.actors.find((a) => a.id === id)?.name || id;
}

function screenNameById(ex: ResearchExtractions, id: string): string {
  return ex.screens?.find((s) => s.id === id)?.name || id;
}

function entityFieldRef(ex: ResearchExtractions, ref: string | undefined): string {
  if (!ref) return '—';
  const [entityId, fieldName] = ref.split('.');
  const entity = ex.entities.find((e) => e.id === entityId);
  if (!entity) return ref;
  const field = entity.fields.find((f) => f.name === fieldName);
  return field
    ? `${entity.name}.${field.name} (${field.type}${field.required ? ', required' : ''})`
    : `${entity.name}.${fieldName}`;
}

export function renderScreenSpecMarkdown(screen: Screen, ex: ResearchExtractions): string {
  const primaryActorName = actorNameById(ex, screen.primaryActor);
  const secondaryActorNames = screen.secondaryActors
    .map((a) => actorNameById(ex, a))
    .join(', ') || '—';

  const sectionsBlock = screen.sections
    .map((s, i) => `${i + 1}. **${s.title}** (${s.kind}) — ${s.purpose}`)
    .join('\n') || '_No sections specified._';

  const fieldsTable = screen.fields.length
    ? `| Field | Kind | Label | Refers to | Validation | Copy |
| --- | --- | --- | --- | --- | --- |
${screen.fields
  .map(
    (f) =>
      `| \`${f.name}\` | ${f.kind} | ${f.label} | ${entityFieldRef(ex, f.refEntityField)} | ${f.validation || '—'} | ${f.copy || '—'} |`
  )
  .join('\n')}`
    : '_No fields specified._';

  const actionsBlock = screen.actions.length
    ? screen.actions
        .map(
          (a) =>
            `- **${a.label}** (${a.kind})${a.refWorkflowStep ? ` — runs workflow step \`${a.refWorkflowStep}\`` : ''}${a.navTo ? ` → navigates to **${screenNameById(ex, a.navTo)}** (\`${a.navTo}\`)` : ''}`
        )
        .join('\n')
    : '- No actions specified.';

  const navInBlock = screen.navIn.length
    ? screen.navIn
        .map((n) => `- From **${screenNameById(ex, n.screen)}** (\`${n.screen}\`) via "${n.via}"`)
        .join('\n')
    : '- This screen has no inbound navigation (likely an entry point).';

  const navOutBlock = screen.navOut.length
    ? screen.navOut
        .map((n) => `- To **${screenNameById(ex, n.screen)}** (\`${n.screen}\`) via "${n.via}"`)
        .join('\n')
    : '- This screen has no outbound navigation (likely a terminal screen).';

  return `# ${screen.name}

- Screen ID: \`${screen.id}\`
- Route: \`${screen.route}\`
- Primary actor: ${primaryActorName} (\`${screen.primaryActor}\`)
- Secondary actors: ${secondaryActorNames}
- Purpose: ${screen.purpose}

## Sections

${sectionsBlock}

## Fields

${fieldsTable}

## States

- **Empty:** ${screen.states.empty}
- **Loading:** ${screen.states.loading}
- **Error:** ${screen.states.error}
- **Populated:** ${screen.states.populated}

## Actions

${actionsBlock}

## Navigation in

${navInBlock}

## Navigation out

${navOutBlock}

## Implementation notes

- Use the field labels and validation rules verbatim — they trace back to research/extracted/screens.json and downstream tests.
- The empty/loading/error/populated states are non-negotiable: every state must be implemented and reviewable in the UI before this screen ships.
- Outbound navigation must match the actions above; do not introduce hidden navigation that bypasses ${screen.name}.
`;
}

export function renderScreenInventoryMarkdown(ex: ResearchExtractions): string {
  if (!ex.screens || ex.screens.length === 0) {
    return `# SCREEN_INVENTORY

> No screens were extracted. Per-screen specs are not generated.
`;
  }

  const overview = ex.screens
    .map(
      (s) =>
        `| \`${s.id}\` | ${s.name} | \`${s.route}\` | ${actorNameById(ex, s.primaryActor)} | ${s.fields.length} | ${s.actions.length} | [spec](screens/${s.id}.md) |`
    )
    .join('\n');

  return `# SCREEN_INVENTORY

> Generated from research extractions. Each screen below has a dedicated spec under \`ui-ux/screens/<screen-id>.md\` covering sections, fields, states, actions, and navigation. Screen IDs and routes match \`research/extracted/screens.json\`.

## Screen index

| ID | Name | Route | Primary actor | Fields | Actions | Spec |
| --- | --- | --- | --- | ---: | ---: | --- |
${overview}

## Per-screen quick view

${ex.screens
  .map(
    (s) =>
      `### ${s.name}

- Route: \`${s.route}\`
- Primary actor: ${actorNameById(ex, s.primaryActor)}
- Purpose: ${s.purpose}
- Sections: ${s.sections.length} | Fields: ${s.fields.length} | Actions: ${s.actions.length}
- States covered: empty, loading, error, populated
- Spec file: [ui-ux/screens/${s.id}.md](screens/${s.id}.md)`
  )
  .join('\n\n')}
`;
}

export type ScreenInventoryFile = { path: string; content: string };

/** Render every screen spec as a list of {path, content} pairs the generator can emit. */
export function renderAllScreenSpecs(ex: ResearchExtractions): ScreenInventoryFile[] {
  if (!ex.screens || ex.screens.length === 0) return [];
  return ex.screens.map((s) => ({
    path: `ui-ux/screens/${s.id}.md`,
    content: renderScreenSpecMarkdown(s, ex)
  }));
}
