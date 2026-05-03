/**
 * Phase G — Builder handoff simplification.
 *
 * Renders BUILDER_START_HERE.md, the canonical entry point for an implementing
 * coding agent. The pre-G workspace had ~60 top-level markdown files and
 * BUILDER_START_HERE was a thin pointer; the W5 fresh-agent run showed the
 * builder still wasted attention scanning ceremony files. Phase G makes
 * BUILDER_START_HERE the only file a build agent has to read end-to-end.
 *
 * The 9 sections are fixed by spec:
 *   1. What you are building
 *   2. Who uses it
 *   3. Day-1 behaviors that must work
 *   4. Validation behaviors that must be implemented (server-side)
 *   5. What is intentionally mocked
 *   6. Files to read first (Tier 1)
 *   7. Files to skip (Tier 3 — see ARCHIVE_INDEX.md)
 *   8. How to run
 *   9. What done means
 *
 * Pure function — no fs / network. Caller writes the result into the workspace.
 */
import type { ResearchExtractions } from '../research/schema';
import type { LifecycleStatus, ProjectInput } from '../types';

export type BuilderStartHereInput = {
  productName: string;
  primaryAudience: string;
  problemStatement: string;
  mustHaves: string[];
  lifecycleStatus: LifecycleStatus;
  extractions?: ResearchExtractions;
  /** Slug of the first phase, used for the phases/<slug>/ tier-1 references. */
  firstPhaseSlug?: string;
};

const TIER_1_FILES = [
  'PROJECT_BRIEF.md',
  'requirements/PER_SCREEN_REQUIREMENTS.md',
  'requirements/FUNCTIONAL_REQUIREMENTS.md',
  'architecture/DATABASE_SCHEMA.md',
  'architecture/DATABASE_SCHEMA.sql',
  'product-strategy/USE_CASES.md',
  'product-strategy/USER_PERSONAS.md',
  'product-strategy/SUCCESS_METRICS.md',
  'research/extracted/workflows.json',
  'research/extracted/screens.json',
  'research/extracted/testCases.json'
] as const;

function statusBanner(status: LifecycleStatus): string {
  switch (status) {
    case 'DemoReady':
      return 'Status: **Demo-ready** — research-grounded, depth gate passed, all demo artifacts present. The 10-file Tier 1 reading list below is sufficient to scaffold and deploy a runnable demo.';
    case 'BuildReady':
    case 'ApprovedForBuild':
      return 'Status: **Build-ready** — research-grounded with full depth. The 10-file Tier 1 reading list below is sufficient to scaffold the app. Some demo artifacts may still be incomplete; see the audit report for details.';
    case 'ReleaseNotApproved':
      return 'Status: **Build-ready, release not yet approved** — the workspace is implementable but release evidence (operations runbook, rollback plan) is missing. Build the app from the Tier 1 list; collect release evidence before promoting.';
    case 'ResearchIncomplete':
      return 'Status: **Research incomplete** — extractions are missing or thin. Re-run docs/RESEARCH_RECIPE.md before building; otherwise you are inferring what the user wanted.';
    case 'Blocked':
      return 'Status: **Blocked** — schema-validation failure or unresolved critical conflict. Resolve the structural blocker (see 00_PROJECT_CONTEXT.md) before continuing; building now will encode bad decisions.';
    default:
      return `Status: **${status}** — see 00_PROJECT_CONTEXT.md for details. The Tier 1 list below is the canonical build-side reading; everything in ARCHIVE_INDEX.md is review/handoff evidence and is not load-bearing for the build.`;
  }
}

function bullet(items: string[], fallback: string): string {
  if (items.length === 0) return `- ${fallback}`;
  return items.map((item) => `- ${item}`).join('\n');
}

function deriveDay1Behaviors(extractions?: ResearchExtractions): string[] {
  if (!extractions) return [];
  return extractions.workflows.slice(0, 6).map((wf) => {
    const trigger = wf.steps[0]?.action ? wf.steps[0].action.replace(/\.$/, '') : 'starts the workflow';
    const accept = wf.acceptancePattern || 'the workflow completes without losing the actor’s work';
    return `**${wf.name}** — actor ${trigger}; ${accept.toLowerCase().replace(/\.$/, '')}.`;
  });
}

function deriveValidationBehaviors(extractions?: ResearchExtractions): string[] {
  if (!extractions) return [];
  const lines = new Set<string>();
  // Workflow-level failure modes — these are server-side validation requirements.
  for (const wf of extractions.workflows) {
    for (const fm of wf.failureModes.slice(0, 2)) {
      const trigger = fm.trigger.replace(/\.$/, '');
      const mitigation = fm.mitigation.replace(/\.$/, '');
      lines.add(`On **${trigger.toLowerCase()}** — ${mitigation.toLowerCase()}. Enforce server-side, not just in the form.`);
    }
  }
  // Screen-level error states (only the negative side; the happy path is implied by the workflow).
  if (extractions.screens) {
    for (const screen of extractions.screens) {
      const err = screen.states?.error;
      if (typeof err === 'string' && err.trim()) {
        lines.add(`Screen **${screen.name}**: ${err.replace(/\.$/, '').toLowerCase()}.`);
      }
    }
  }
  return Array.from(lines).slice(0, 12);
}

function deriveMockedBehaviors(extractions?: ResearchExtractions): { mocked: string[]; required: string[] } {
  const mocked: string[] = [];
  const required: string[] = [];
  if (!extractions) return { mocked, required };
  for (const integ of extractions.integrations) {
    if (integ.mockedByDefault) {
      mocked.push(
        `**${integ.name}** (${integ.category}) — ${integ.purpose} See \`integrations/MOCKING_STRATEGY.md\` for the demo-safe mock contract; swap to a real provider (\`${integ.envVar}\`) before promoting.`
      );
    } else if (integ.required) {
      required.push(`**${integ.name}** (${integ.category}) — real credential required (\`${integ.envVar}\`).`);
    }
  }
  return { mocked, required };
}

function tier1List(input: BuilderStartHereInput, hasResearch: boolean, hasScreens: boolean, hasDb: boolean): string {
  const phaseSuffix = input.firstPhaseSlug ? input.firstPhaseSlug : 'phase-01';
  const lines: string[] = [];
  lines.push('1. **PROJECT_BRIEF.md** — the product brief, must-have scope, and non-goals.');
  if (hasResearch) {
    lines.push('2. **product-strategy/USE_CASES.md** — 2-4 use cases per persona with happy / edge / failure / recovery paths.');
    lines.push('3. **product-strategy/USER_PERSONAS.md** — actor-level personas with JTBDs.');
    lines.push('4. **product-strategy/SUCCESS_METRICS.md** — the D1/D7/D30 signals that say the demo worked.');
  } else {
    lines.push('2. **product-strategy/MVP_SCOPE.md** — templated scope (no research extractions; re-run RESEARCH_RECIPE for personas/use-cases).');
    lines.push('3. **product-strategy/SUCCESS_METRICS.md** — templated success metrics; refine after research.');
    lines.push('4. *(USE_CASES.md / USER_PERSONAS.md emit only when research extractions exist.)*');
  }
  lines.push('5. **requirements/FUNCTIONAL_REQUIREMENTS.md** — every Requirement N maps 1:1 to a workflow step. Each carries actor, action, system response, stored data, failure case, testable outcome.');
  if (hasScreens) {
    lines.push('6. **requirements/PER_SCREEN_REQUIREMENTS.md** — empty / loading / error / populated state contract per screen. Mandatory checklist for every page component.');
    lines.push('7. **research/extracted/screens.json** — machine-readable screen state (sections, fields, actions). Easier to iterate over than the markdown.');
  } else {
    lines.push('6. *(PER_SCREEN_REQUIREMENTS.md / screens.json emit only when research declares screens; fall back to ui-ux/SCREEN_INVENTORY.md.)*');
    lines.push('7. **ui-ux/SCREEN_INVENTORY.md** — templated screen list.');
  }
  lines.push('8. **research/extracted/workflows.json** — workflows in dependency order. Build one route group + one page + one server action per `workflow.id`.');
  if (hasDb) {
    lines.push('9. **architecture/DATABASE_SCHEMA.md** — readable index of tables, columns, FKs, PII flags.');
    lines.push('10. **architecture/DATABASE_SCHEMA.sql** — Postgres-correct DDL. Drizzle / Prisma / direct SQL all consume it.');
  } else {
    lines.push('9. *(DATABASE_SCHEMA.md / .sql emit only when entity fields carry dbType metadata. Use research/extracted/entities.json for now.)*');
    lines.push('10. **research/extracted/entities.json** — entity / field shape; promote to a real DDL during build.');
  }
  lines.push('11. **research/extracted/testCases.json** — test cases per persona × workflow × screen. Generate Playwright suites from this.');
  lines.push(`12. **phases/${phaseSuffix}/INTEGRATION_TESTS.md** + **phases/${phaseSuffix}/TEST_CASES.md** — happy-path + failure-mode integration tests for the first phase.`);
  lines.push('13. **evidence/audit/QUALITY_AUDIT-*.md** — the audit report with depth-grade and demo-readiness verdict. Read it after `npm run audit` completes.');
  return lines.join('\n');
}

export function renderBuilderStartHere(input: BuilderStartHereInput): string {
  const ex = input.extractions;
  const hasResearch = Boolean(ex);
  const hasScreens = hasResearch && Boolean(ex!.screens && ex!.screens.length);
  const hasDb = hasResearch && ex!.entities.some((e) => e.fields.some((f) => f.dbType));
  const day1 = deriveDay1Behaviors(ex);
  const validation = deriveValidationBehaviors(ex);
  const mocking = deriveMockedBehaviors(ex);
  const personas = (ex?.actors || []).slice(0, 4).map((a) => `${a.name} (${a.type})`);

  return `# BUILDER_START_HERE

> This is the entry point for an implementing coding agent. Read this file end-to-end before opening anything else. The 9 sections below carry the only context you need to build, validate, and stop.

${statusBanner(input.lifecycleStatus)}

---

## 1. What you are building

${input.productName} — ${input.problemStatement}

Must-have scope:
${bullet(input.mustHaves, 'see PROJECT_BRIEF.md for the must-have list')}

Out-of-scope items live in \`product-strategy/OUT_OF_SCOPE.md\`. If you find yourself reaching for a feature outside the must-have list, stop and check that file first.

---

## 2. Who uses it

Primary audience: ${input.primaryAudience}

${personas.length ? `Researched personas:\n${bullet(personas, 'no personas extracted')}\n\nFull persona detail (motivation, JTBDs, adoption signals) lives in \`product-strategy/USER_PERSONAS.md\`.` : 'Personas were not extracted by research; use the primary audience above as the working assumption.'}

---

## 3. Day-1 behaviors that must work

A real user opening the demo on day 1 must be able to complete each of these flows without hitting a dead-end:

${bullet(day1, 'Day-1 behaviors are derived from research workflows; none were extracted, so refer to PROJECT_BRIEF.md for must-have scope.')}

Build one route group + one page + one server action per workflow ID in the order they appear in \`research/extracted/workflows.json\`. The dependency graph is implicit in that order.

---

## 4. Validation behaviors that must be implemented (server-side)

These are the failure-mode rules a real builder must enforce at the API / server-action layer. The UI alone is not enough — a malicious or buggy client can bypass form-only validation.

${bullet(validation, 'Validation behaviors are derived from workflow failure modes; none were extracted. Open requirements/FUNCTIONAL_REQUIREMENTS.md and read each "Failure case" line; promote each to a server-side guard.')}

Cross-reference with \`requirements/PER_SCREEN_REQUIREMENTS.md\` for the per-screen empty / loading / error / populated states. Every state-changing route must also write the audit entry the workspace declares (entity fields with eventType enumValues).

---

## 5. What is intentionally mocked

These integrations are mocked by default for the demo. Do not block on real-provider setup; the workspace is designed to run end-to-end without live credentials.

${bullet(mocking.mocked, 'No integrations are mocked by default — the workspace expects every integration to use real credentials.')}

${mocking.required.length ? `### Real credentials required for these (no demo-safe mock):\n${bullet(mocking.required, '')}` : ''}

For the concrete mock contract (file paths, env-var shortcuts, demo-safe magic-link behavior) see \`integrations/MOCKING_STRATEGY.md\`.

---

## 6. Files to read first (Tier 1)

These are the load-bearing files for the build. Read them in this order; everything else can be deferred or skipped.

${tier1List(input, hasResearch, hasScreens, hasDb)}

The build recipe (\`docs/BUILD_RECIPE.md\` in the mvp-builder repo, or the deployment template's BUILD_LOG.md if present) defines the 9 mandatory build passes. Follow it.

---

## 7. Files to skip (Tier 3)

The workspace top level contains ~60 files. Most are review / handoff / release / recovery evidence used by the mvp-builder lifecycle. They are NOT load-bearing for the build. Skipping them is correct; deleting them would break the package validator.

The full Tier 3 catalog lives in **\`ARCHIVE_INDEX.md\`** at the workspace root. Each Tier 3 file also carries a top-of-file banner that says it is not load-bearing for an implementing agent.

If a top-level filename matches one of these patterns it is almost certainly Tier 3:
- \`FINAL_*\` (release/handoff snapshots)
- \`*HANDOFF*\` (lifecycle handoff prompts)
- \`*GATE*\` / \`*CHECKLIST*\` (release / production gates)
- \`OPERATIONS_*\`, \`INCIDENT_*\`, \`ROLLBACK_*\`, \`DEPLOYMENT_PLAN*\` (operational runbooks; only relevant once deployed)
- \`recursive-test/*\`, \`auto-improve/*\` (improvement-loop ceremony)

---

## 8. How to run

1. From the deployment template at \`architecture/DEPLOYMENT_TEMPLATE/\` (or the directory the build recipe creates):
   \`\`\`bash
   make setup       # install deps, set up local Postgres, apply migrations
   make dev         # run Next.js + worker locally on http://localhost:3000
   make test        # run Playwright suites generated from research/extracted/testCases.json
   \`\`\`
2. Demo-safe mock auth: set \`AUTH_DEMO_MODE=true\` in \`.env.local\` to skip the magic-link round-trip and sign in directly via the role-switcher. See \`integrations/MOCKING_STRATEGY.md\`.
3. Before promoting: \`make audit\` (delegates to \`npm run audit -- --enforce-depth\` against the workspace) and confirm the depth gate passes.

If the deployment template does not yet exist (no \`architecture/DATABASE_SCHEMA.sql\`), the build recipe's first pass is to create it. Follow \`docs/BUILD_RECIPE.md\` from B1 onward.

---

## 9. What done means

A build is "done" when **all** of the following are true:

1. Every workflow in \`research/extracted/workflows.json\` has a working route group + page + server action. A user can complete each one without errors.
2. Every server-side validation behavior in section 4 is enforced and unit-tested (form-only validation does not count).
3. Every screen's empty / loading / error / populated states from \`PER_SCREEN_REQUIREMENTS.md\` render correctly.
4. \`make test\` passes locally; the generated Playwright suites cover the test cases in \`research/extracted/testCases.json\`.
5. \`npm run audit -- --package=<workspace> --enforce-depth\` exits 0.
6. The deployment-template README's "Deploy" section has been executed and the deployed URL responds to the smoke routes.
7. \`BUILD_LOG.md\` records the stack chosen, every blocker surfaced, and every deviation from the workspace spec.

If any of those is false, the build is not done; surface the gap as a blocker before declaring success. Optimistic "demo works on my machine" sign-off is exactly the failure mode this workspace is designed to prevent.
`;
}
