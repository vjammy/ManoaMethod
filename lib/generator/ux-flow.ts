/**
 * Generate ui-ux/UX_FLOW.md from research extractions.
 *
 * Outputs a Mermaid state-machine diagram of screens plus an explicit edge
 * table. UX flow edges come from `extractions.uxFlow`, falling back to each
 * screen's `navOut` array if `uxFlow` is empty.
 *
 * Phase E2 audit dimension `screen-depth` rewards UX flow presence and
 * symmetry between navIn and navOut on each screen.
 */
import type { ResearchExtractions, Screen, UxFlowEdge } from '../research/schema';

function screenNameById(screens: Screen[], id: string): string {
  return screens.find((s) => s.id === id)?.name || id;
}

function mermaidId(id: string): string {
  // Mermaid state-machine ids must not contain hyphens for some renderers; replace.
  return id.replace(/[^A-Za-z0-9]/g, '_');
}

function buildEdges(ex: ResearchExtractions): UxFlowEdge[] {
  if (ex.uxFlow && ex.uxFlow.length > 0) return ex.uxFlow;
  if (!ex.screens) return [];
  const out: UxFlowEdge[] = [];
  for (const s of ex.screens) {
    for (const n of s.navOut) {
      out.push({ fromScreen: s.id, toScreen: n.screen, viaAction: n.via });
    }
  }
  return out;
}

export function renderUxFlowMarkdown(ex: ResearchExtractions): string {
  if (!ex.screens || ex.screens.length === 0) {
    return `# UX_FLOW

> No screens were extracted. UX flow is not generated.
`;
  }

  const screens = ex.screens;
  const edges = buildEdges(ex);

  const mermaidStates = screens
    .map((s) => `  ${mermaidId(s.id)} : ${s.name}`)
    .join('\n');

  const mermaidEdges = edges.length
    ? edges
        .map((e) => `  ${mermaidId(e.fromScreen)} --> ${mermaidId(e.toScreen)} : ${e.viaAction.replace(/[\n\r]/g, ' ').slice(0, 40)}`)
        .join('\n')
    : '  %% no navigation edges discovered';

  const tableRows = edges.length
    ? edges
        .map(
          (e) =>
            `| ${screenNameById(screens, e.fromScreen)} (\`${e.fromScreen}\`) | ${screenNameById(screens, e.toScreen)} (\`${e.toScreen}\`) | ${e.viaAction} | ${e.condition || '—'} |`
        )
        .join('\n')
    : '_No edges._';

  const orphans = screens
    .filter((s) => !edges.some((e) => e.toScreen === s.id) && !edges.some((e) => e.fromScreen === s.id))
    .map((s) => `- \`${s.id}\` (${s.name})`)
    .join('\n');
  const sources = screens
    .filter((s) => !edges.some((e) => e.toScreen === s.id))
    .map((s) => `- \`${s.id}\` (${s.name})`)
    .join('\n');
  const sinks = screens
    .filter((s) => !edges.some((e) => e.fromScreen === s.id))
    .map((s) => `- \`${s.id}\` (${s.name})`)
    .join('\n');

  return `# UX_FLOW

> Generated from research extractions. Every node is one screen in \`ui-ux/SCREEN_INVENTORY.md\`; every edge is one navigation path described in \`research/extracted/uxFlow.json\` (or, when missing, derived from each screen's \`navOut\` array).

## State diagram

\`\`\`mermaid
stateDiagram-v2
${mermaidStates}
${mermaidEdges}
\`\`\`

## Edge table

| From | To | Via | Condition |
| --- | --- | --- | --- |
${tableRows}

## Topology summary

- Total screens: ${screens.length}
- Total edges: ${edges.length}

### Source screens (no inbound edges — entry points)

${sources || '_None — every screen has an inbound edge. This is a problem if there is no entry point._'}

### Sink screens (no outbound edges — terminal states)

${sinks || '_None — every screen leads somewhere else. This is normal for an interactive app._'}

### Orphan screens (no edges at all — unreachable)

${orphans || '_None._'}
`;
}
