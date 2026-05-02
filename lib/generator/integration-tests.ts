/**
 * Generate phases/<slug>/INTEGRATION_TESTS.md from research extractions.
 *
 * For a phase, emit one or more end-to-end integration test scenarios that
 * exercise a workflow with realistic fixture data. Each scenario includes:
 *   - Goal (workflow.acceptancePattern)
 *   - Fixture data block (JSON-shaped from entity samples)
 *   - Step-by-step interaction (workflow.steps)
 *   - Expected post-conditions
 *   - Failure-mode scenarios (one per workflow.failureModes)
 *
 * The agent that downstreams the workspace should be able to paste the
 * fixture block into a seed script and the steps into a Playwright /
 * supertest scenario.
 *
 * Phase F2.
 */
import type { ProjectInput } from '../types';
import type { ResearchExtractions } from '../research/schema';

interface Phase {
  slug: string;
  name?: string;
  goal?: string;
}

export function renderPhaseIntegrationTestsMarkdown(phase: Phase, ex: ResearchExtractions, input: ProjectInput): string {
  // Pick the workflow most relevant for the phase. Use a heuristic: the
  // workflow whose name shares the most tokens with the phase goal/name.
  const phaseTokens = tokenize(`${phase.name || ''} ${phase.goal || ''} ${phase.slug}`);
  const workflows = ex.workflows;
  const ranked = workflows
    .map((w) => ({
      wf: w,
      score: phaseTokens.size === 0 ? 0 : Array.from(phaseTokens).filter((t) => w.name.toLowerCase().includes(t)).length
    }))
    .sort((a, b) => b.score - a.score);
  const targetWorkflows = ranked.length === 0 ? [] : ranked[0].score > 0 ? [ranked[0].wf] : workflows.slice(0, 1);

  const entityById = new Map(ex.entities.map((e) => [e.id, e]));
  const actorById = new Map(ex.actors.map((a) => [a.id, a]));

  if (targetWorkflows.length === 0) {
    return `# INTEGRATION_TESTS — ${phase.name || phase.slug}

> No workflow available to exercise this phase end-to-end. Add workflows to \`research/extracted/workflows.json\` and re-generate.
`;
  }

  const scenarioBlocks = targetWorkflows.map((wf) => {
    const primaryActor = actorById.get(wf.primaryActor)?.name || wf.primaryActor;
    const touchedEntityIds = wf.entitiesTouched;
    const fixtureLines = touchedEntityIds
      .map((id) => entityById.get(id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .map((e) => `### Fixture: ${e.name} (\`${e.id}\`)\n\n\`\`\`json\n${JSON.stringify(e.sample, null, 2)}\n\`\`\``)
      .join('\n\n');

    const happyPathSteps = wf.steps
      .map((s) => `${s.order}. **${actorById.get(s.actor)?.name || s.actor}** → ${s.action}\n   - Expected: ${s.systemResponse}${s.branchOn ? `\n   - Branch: ${s.branchOn}` : ''}`)
      .join('\n');

    const failureScenarios = wf.failureModes
      .map((f, i) => `### Failure scenario ${i + 1}: ${f.trigger}

**Setup:** Same as happy path, but with the field that triggers \`${f.trigger}\` set to a failing value.

**Expected:** The system surfaces the trigger and applies the mitigation: ${f.mitigation}.

**Effect if mitigation absent:** ${f.effect}

**Test data:** Use the negative-path sample for the primary entity (\`negative-${touchedEntityIds[0] || 'sample'}\`).`)
      .join('\n\n');

    return `## Integration scenario: ${wf.name}

**Primary actor:** ${primaryActor}

**Goal (acceptance pattern):**
> ${wf.acceptancePattern}

### Fixture data

Seed the following before running the scenario.

${fixtureLines || '_No entities touched._'}

### Happy-path interaction

${happyPathSteps}

### Expected post-conditions

- ${wf.acceptancePattern}
- Audit Entry written for every state-changing step.
- No silent failures (every researched failure mode is surfaced when triggered).

### Failure scenarios

${failureScenarios || '_No failure modes recorded._'}
`;
  });

  return `# INTEGRATION_TESTS — ${phase.name || phase.slug}

> End-to-end integration tests for **${phase.name || phase.slug}**. Each scenario walks one workflow with realistic fixture data so the implementing agent can paste the fixture into a seed script and the steps into a Playwright / supertest scenario without further translation.

${scenarioBlocks.join('\n---\n\n')}

---

> See \`phases/${phase.slug}/TEST_CASES.md\` for the unit-level Given/When/Then cases generated from \`research/extracted/testCases.json\`. This file is for end-to-end orchestration of those cases against seeded data.
`;
}

function tokenize(s: string): Set<string> {
  return new Set(
    (s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !COMMON.has(t))
  );
}

const COMMON = new Set([
  'the', 'and', 'with', 'that', 'this', 'phase', 'plan', 'build', 'work', 'task', 'name', 'make', 'data', 'goal'
]);
