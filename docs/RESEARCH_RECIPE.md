# RESEARCH_RECIPE.md

This is the recipe a coding agent (Claude Code, Codex, Kimi, OpenCode) executes
**inside its own LLM context** before invoking `npm run create-project`. It
turns a project brief into a research-grounded JSON ontology that drives
workspace generation. No API key on this side: your agent already has model
access.

**Production depth comes from this recipe.** mvp-builder's synthesizer
(`scripts/synthesize-research-ontology.ts`) is a deterministic regression
fixture only — it is allowed to produce shallow output, and the audit's depth
dimensions (`workflow-step-realism`, `requirement-failure-variance`,
`use-case-depth`, `persona-depth`, etc.) are designed to flag that shallowness.
Real apps that people use day 1 require an agent following the passes below.
Domain packs / archetype routing / per-domain templates are explicitly OUT —
they were tried and removed because they don't generalize. The agent has its
own model context; depth comes from how the agent thinks, not from pre-baked
content.

The recipe runs **9 mandatory passes**. Each pass produces a schema-valid JSON
fragment AND has an explicit depth checklist. Skipping or under-filling a pass
causes the audit to flag the resulting workspace as shallow.

**When the recipe runs, then `create-project` runs.** Without research
extractions, `npm run create-project` exits with an error.

---

## Output layout

By the end of the recipe, write to `<your-research-dir>/research/`:

```
research/
  USE_CASE_RESEARCH.md       (narrative, optional — Pass 0/1/2 rationale)
  DOMAIN_RESEARCH.md         (narrative, optional — industry framing)
  CONVERGENCE_LOG.md         (the agent's notes about what it kept/dropped)
  extracted/
    meta.json                (briefHash, schemaVersion, modelUsed, discovery)
    actors.json              (Actor[] — Pass 1)
    entities.json            (Entity[] — Pass 8 with dbType / fk / pii)
    workflows.json           (Workflow[] — Pass 3)
    screens.json             (Screen[] — Pass 4)
    uxFlow.json              (UxFlowEdge[] — Pass 4)
    testCases.json           (TestCase[] — Pass 6/7)
    jobsToBeDone.json        (JobToBeDone[] — Pass 1)
    integrations.json        (Integration[] — Pass 7)
    risks.json               (Risk[])
    gates.json               (Gate[] — Pass 9 quality gate)
    antiFeatures.json        (AntiFeature[])
    conflicts.json           (Conflict[])
    _removed.json            (RemovedItem[])
```

Then run:

```
npm run create-project -- --input=<brief.json> --out=<workspace> --research-from=<your-research-dir>
```

### Generated artifacts the recipe drives

When the extractions above are populated, the generator emits:

| File | Sourced from | What it contains |
|---|---|---|
| `product-strategy/IDEA_CRITIQUE.md` | `meta.discovery.ideaCritique` (Pass 0) | Honest critique of the brief itself |
| `product-strategy/VALUE_PROPOSITION.md` | `meta.discovery.valueProposition` (Pass 0) | Headline, problem, solution, top 3 outcomes |
| `product-strategy/USER_PERSONAS.md` | `actors.json` + `jobsToBeDone.json` (Pass 1) | One persona per non-external actor with motivation, pain points, adoption signals |
| `product-strategy/USE_CASES.md` | `workflows.json` + `jobsToBeDone.json` (Pass 2/3) | One use case per workflow with main flow, alternatives, failure modes, postconditions, "why they will use this" |
| `product-strategy/SUCCESS_METRICS.md` | `meta.discovery.valueProposition.topThreeOutcomes` + JTBDs + workflow failure modes (Pass 5) | D1/D7/D30 outcomes + per-actor adoption signals + leading indicators |
| `product-strategy/JOBS_TO_BE_DONE.md` | `jobsToBeDone.json` (Pass 1) | Per-actor JTBD spec |
| `requirements/PER_SCREEN_REQUIREMENTS.md` | `screens.json` (Pass 4) | One section per screen with screen-specific acceptance + edge cases |
| `requirements/PERMISSION_MATRIX.md` | `actors.json` × `entities.json` visibility (Pass 1) | Actor × Entity grid with DENY cells |
| `requirements/REGULATORY_NOTES.md` | `gates.json` `mandatedBy: 'regulation'` | Citations + scope |
| `architecture/DATABASE_SCHEMA.md` + `.sql` | `entities.json` field metadata (Pass 8) | Readable schema + executable PostgreSQL DDL |
| `ui-ux/SCREEN_INVENTORY.md` + `screens/<id>.md` | `screens.json` (Pass 4) | Catalog + per-screen specs |
| `ui-ux/UX_FLOW.md` | `uxFlow.json` (Pass 4) | Mermaid state diagram of screen transitions |
| `phases/<slug>/TEST_CASES.md` | `testCases.json` (Pass 6) | Given/When/Then bound to sample data |
| `phases/<slug>/INTEGRATION_TESTS.md` | `workflows.json` + `entities.json` samples (Pass 7) | E2E scenario with fixture block |

These are the agent's deliverables. To lift the depth-bearing audit dimensions
(`use-case-depth`, `persona-depth`, `workflow-step-realism`, etc.) above their
synth caps, fill the JSON files honestly per the passes below.

---

## Schema reference

Read [lib/research/schema.ts](../lib/research/schema.ts) for the canonical
TypeScript types. Every JSON file must conform; the validator (run as part
of `create-project`) rejects malformed extractions with a clear error.

Each Actor / Entity / Workflow / Risk / Integration / Gate carries
**provenance**:

```json
{
  "id": "<stable-kebab-case-id>",
  "origin": "use-case" | "domain" | "both",
  "evidenceStrength": "strong" | "moderate" | "weak",
  "sources": [{ "url": "...", "title": "...", "quote": "...", "fetchedAt": "ISO" }],
  "firstSeenInPass": <number>,
  "updatedInPass": <number>
}
```

`origin` rules:
- `use-case` — derived from the brief (must-haves, audience, problem)
- `domain` — derived from your knowledge of the industry
- `both` — both the brief mentions it AND it's a domain standard

`sources` should be real where possible. When the source is the brief itself,
use `url: "brief://<product-slug>"` and `quote: "<the brief sentence>"`.

---

## Pass 0 — Discovery and back-and-forth

**Goal:** challenge the brief itself before any extraction. Restate the idea,
identify what's unclear, and define what "good" means for the MVP. The agent
plays both sides of a discovery conversation: ask the questions a product
manager would ask, and answer them based on brief + domain knowledge.

**Mandatory deliverables:**
1. **Restate the business idea** in 2-3 sentences in the agent's own words.
   If the restatement reveals ambiguity, document the assumption you're
   choosing and why.
2. **Identify unclear assumptions** in the brief. List 5-10 assumptions
   you're making (about audience, scale, regulatory exposure, channel mix,
   data sensitivity, ...). For each, note: "What if this assumption is
   wrong?"
3. **Ask and answer** the critical product questions internally when user
   input is sparse:
   - Who is the buyer (decides to pay/adopt)?
   - Who is the user (operates the system day to day)?
   - Who is the admin/operator?
   - Who is the edge actor (caregiver, observer, regulator, third-party)?
   - What is the smallest customer outcome the MVP must produce?
   - What is the cost of getting this wrong (privacy leak, financial loss,
     embarrassment, regulatory penalty)?
4. **Define what "good" means for the MVP** — observable, behavioral, post-
   shipping. Not "users are happy"; instead "X% of new accounts complete
   workflow Y within first 7 days, with audit entries proving each step."

**Output (added to `meta.json` as `discovery`):**

```json
{
  "valueProposition": {
    "headline": "<audience-specific outcome — not 'better experience'>",
    "oneLineProblem": "<one sentence>",
    "oneLineSolution": "<one sentence>",
    "topThreeOutcomes": ["<observable post-shipping signal>", "...", "..."]
  },
  "whyNow": {
    "driver": "<what changed in the world that makes this worth shipping now>",
    "recentChange": "<the recent event/regulation/technology that opens this window>",
    "risksIfDelayed": "<what would actually slip if we delay 6 months>"
  },
  "ideaCritique": [
    { "weakSpot": "<a real risk in the brief>", "mitigation": "<concrete plan or 'accept and document'>" }
  ],
  "competingAlternatives": [
    { "name": "<actual product, library, or 'paper + spreadsheet'>", "whyInsufficient": "<concrete gap>" }
  ],
  "industry": {
    "name": "<industry segment>",
    "subIndustry": "<optional>",
    "regulatoryExposure": ["<e.g. FERPA, COPPA, HIPAA, none>"]
  },
  "competitors": [
    { "name": "<product>", "url": "<homepage>", "keyTerms": ["<noun>", "<noun>"] }
  ],
  "industryTerminology": ["<term>", "<term>", "..."]
}
```

**Validation rules:**
- `valueProposition.headline` must NOT contain generic phrases ("better
  experience", "streamline", "improved efficiency").
- `topThreeOutcomes[]` must be observable post-shipping — not internal
  feelings, not vague satisfaction.
- `ideaCritique[]` should have **3–5 entries**. Synth runs leave this empty
  by design — only an LLM agent can honestly critique a brief.
- `competingAlternatives[]` must include at least one real product or the
  cheapest option ("paper + spreadsheet"), with a concrete gap.
- `industry.name` must NOT be a generic word ("software", "app", "tool").
  It must name a real industry segment.

---

## Pass 1 — Actor and persona research

**Goal:** every distinct human or system actor the product touches, plus a
rich persona-level understanding of WHY they would use it.

**Mandatory deliverables:**
- **3–5 actors** in `actors.json`. A product with 1-2 actors is almost always
  a thin brief — push back and add the implied roles (observers, admins,
  external regulators, caregivers, dependents).
- For each actor, **at least one JTBD** in `jobsToBeDone.json` covering:
  - **role** (what title/relationship they hold)
  - **motivation** (in their voice — "I want to ...")
  - **current workflow** (what they do today before this product exists)
  - **pain points** (what's broken about today's workflow)
  - **trust concerns** (privacy, accuracy, control they expect)
  - **adoption trigger** (what would make them sign up the first time)
  - **return reason** (what would make them come back daily/weekly)
  - **abandonment risk** (what would make them stop using it)

**Actor schema (`actors.json`):**

```json
[
  {
    "id": "actor-<role-slug>",
    "name": "<role title>",
    "type": "primary-user" | "secondary-user" | "operator" | "reviewer" | "external",
    "responsibilities": ["<verb> <object>", "..."],
    "visibility": ["<scope they CAN see>", "..."],
    "authMode": "authenticated" | "magic-link" | "kiosk" | "public",
    "origin": "use-case" | "domain" | "both",
    "evidenceStrength": "strong" | "moderate" | "weak",
    "sources": [...],
    "firstSeenInPass": 1,
    "updatedInPass": 1
  }
]
```

**JTBD schema (`jobsToBeDone.json`):**

```json
[
  {
    "id": "jtbd-<actor-slug>-<short-tag>",
    "actorId": "<actor id from actors.json>",
    "situation": "When <triggering condition for this actor>",
    "motivation": "I want to <action they want to take>",
    "expectedOutcome": "So that <measurable post-condition>",
    "currentWorkaround": "<what they do today without this product>",
    "hireForCriteria": ["<adoption signal 1>", "<return reason 2>", "<adoption signal 3>"]
  }
]
```

**Validation rules:**
- ≥ 3 actors (5 is better) — at minimum primary-user + reviewer.
- Every actor has ≥ 1 JTBD.
- JTBD `expectedOutcome` is measurable. "Feel better" / "be more productive" /
  "save time" are flagged generic. Use specific, observable signals (counts,
  states, latencies).
- IDs are stable kebab-case (`actor-parent`, `jtbd-parent-plan-week`).
- Every actor has ≥ 1 source (brief evidence or domain reasoning).

The audit dimensions `jtbd-coverage` (max 5) and `persona-depth` (max 5)
both score this pass. `persona-depth` reads `product-strategy/USER_PERSONAS.md`
which is generated from the JTBD entries above.

---

## Pass 2 — Use-case exploration

**Goal:** for each persona, define multiple distinct use cases. The MVP
cannot be centered on one generic dashboard flow.

**Mandatory deliverables:**
- For each persona (Pass 1), define **2–4 use cases**.
- Each use case includes: happy path, edge path, failure path, and recovery
  path.
- Use cases drive `workflows.json` (Pass 3) and `USE_CASES.md` (generated).

**Use cases are not a separate JSON file — they materialize as `workflows.json`
in Pass 3.** This pass is the agent's planning step: enumerate the use cases
mentally before mapping each to a workflow.

For each use case, the agent records (in `CONVERGENCE_LOG.md` or per-pass
notes):

```
Use case: <short name>
Persona: <actor id>
Trigger: <when does this happen>
Happy path: <what success looks like>
Edge path: <unusual but valid scenario>
Failure path: <what breaks and how the user notices>
Recovery path: <how the user gets back on track>
```

**Validation rules:**
- The number of workflows produced in Pass 3 should be ≥ number of personas
  × 2 (with bundling allowed if the same workflow serves multiple personas
  with different scope).
- The audit dimension `multi-use-case coverage` (Phase F equivalent of
  `use-case-depth`) reads `product-strategy/USE_CASES.md` and credits cases
  with all four paths represented.

---

## Pass 3 — Workflow mapping

**Goal:** convert each use case into concrete workflow steps. Workflows are
the spine of the generated workspace — every requirement, screen, and test
case traces back here.

**Mandatory deliverables per workflow (`workflows.json`):**

```json
{
  "id": "workflow-<short-slug>",
  "name": "<verb-noun, e.g. 'Outbound cadence execution'>",
  "primaryActor": "<actor id>",
  "secondaryActors": ["<actor id>", "..."],
  "steps": [
    {
      "order": 1,
      "actor": "<actor id>",
      "action": "<concrete user action with named entity>",
      "systemResponse": "<what the system persists / shows / triggers>",
      "preconditions": ["<entry-point precondition>"],
      "postconditions": ["<state after this step>"],
      "branchOn": "<optional decision criterion>"
    }
  ],
  "failureModes": [
    { "trigger": "<domain-specific bad event>", "effect": "<concrete consequence>", "mitigation": "<concrete remedy>" }
  ],
  "entitiesTouched": ["<entity id>", "..."],
  "acceptancePattern": "Given <precondition>, when <action>, then <verifiable post-condition>.",
  "origin": "use-case" | "domain" | "both",
  "evidenceStrength": "strong" | "moderate" | "weak",
  "sources": [...],
  "firstSeenInPass": 3,
  "updatedInPass": 3
}
```

Each step must have:
- **entry point** — captured by `preconditions`
- **user action** — concrete verb + named entity, NOT "user does the thing"
- **system response** — what gets persisted / surfaced / triggered
- **data created/updated** — implicit via `entitiesTouched` and field-level
  references in step text
- **validation** — captured by failure modes' triggers
- **failure states** — `failureModes[]`
- **completion criteria** — `acceptancePattern` + `postconditions` on the
  last step

**Validation rules:**
- Primary workflow has **≥ 5 steps**; secondary workflows ≥ 3.
- **≥ 2 failure modes per workflow**, each with a domain-specific trigger.
  "Invalid input" / "user error" / "validation failure" alone are flagged
  generic by the audit `edge-case-coverage` and `workflow-step-realism`
  dimensions.
- **≥ 1 `branchOn` decision point** in the workflow set (the audit's
  `research-depth` dim credits decision points).
- Every step's `actor` is an ID in `actors.json`.
- Every `entitiesTouched` ID exists in `entities.json`.
- Failure modes have `mitigation` that names a concrete remedy, not "handle
  gracefully".

The audit dimension `workflow-step-realism` (max 5) flags templated CRUD
verbs ("Create a new X", "Edit the X title or status", "View status"). Use
the verb the actor actually says: "Import a lead list from a conference
event", "Mark a chore complete", "Approve a refund".

---

## Pass 4 — Screen requirements and UX flow

**Goal:** define every screen needed for the workflows, with a complete
state contract and per-screen acceptance criterion.

**Mandatory deliverables per screen (`screens.json`):**

```json
{
  "id": "screen-<short-slug>",
  "name": "<title-case display name>",
  "route": "/path/with/:params",
  "primaryActor": "<actor id>",
  "secondaryActors": ["<actor id>", "..."],
  "purpose": "<one sentence explaining why this screen exists>",
  "sections": [
    { "kind": "header" | "list" | "form" | "detail" | "summary" | "navigation", "title": "<section title>", "purpose": "<why this section>" }
  ],
  "fields": [
    { "name": "<field>", "kind": "input" | "display" | "action", "label": "<label>", "refEntityField": "<entityId>.<fieldName>", "validation": "<rule>", "copy": "<microcopy>" }
  ],
  "states": {
    "empty": "<what shows before any data exists>",
    "loading": "<what shows while data is being fetched>",
    "error": "<what shows when fetch/save fails>",
    "populated": "<what shows in the normal state>"
  },
  "actions": [
    { "label": "<button copy>", "kind": "primary" | "secondary" | "destructive" | "navigation", "refWorkflowStep": "<workflowId>:<stepOrder>", "navTo": "<screenId>" }
  ],
  "navIn": [{ "screen": "<screenId>", "via": "<action>" }],
  "navOut": [{ "screen": "<screenId>", "via": "<action>" }]
}
```

**Mandatory deliverables per screen (in `requirements/PER_SCREEN_REQUIREMENTS.md`,
auto-generated from above):**
- **target persona** (primary actor)
- **purpose** (the workflow step it serves)
- **fields** (input + display + action)
- **actions** with their workflow-step linkage
- **empty / loading / error / populated** state contract — all four required
- **permissions** (visibility scope from `actors.json`)
- **acceptance checks** (a screen-specific Given/When/Then that a tester can
  execute on this screen alone, not the workflow's overall acceptance pattern
  repeated)

**UX flow (`uxFlow.json`):** the directed graph of screen transitions. Every
non-entry screen has at least one inbound edge; every non-terminal screen has
at least one outbound edge.

```json
{
  "fromScreen": "<screenId>",
  "toScreen": "<screenId>",
  "viaAction": "<action label or workflow step>",
  "condition": "<optional guard>"
}
```

**Validation rules:**
- ≥ 1 entry / authentication screen.
- ≥ 1 dashboard or list screen per primary actor.
- ≥ 1 detail screen per primary entity.
- ≥ 1 screen per workflow that takes user input.
- All four states (empty/loading/error/populated) must be non-empty strings.
- Every action's `refWorkflowStep` resolves to a real `workflowId:stepOrder`.
- Every action's `navTo` resolves to an existing screen ID.
- Inbound and outbound nav must be symmetric — the audit `screen-depth` dim
  credits symmetry.
- Per-screen acceptance criteria must be **distinct from each other** —
  duplicating the workflow's overall pattern across all screens is flagged
  by `per-screen-acceptance-uniqueness`.

---

## Pass 5 — Success metrics and quality bar

**Goal:** define the measurable signals that prove the MVP is working for
real users, plus the explicit shallow/generic markers that would make us
fail.

**Mandatory deliverables (added to `meta.json` and surfaced in
`product-strategy/SUCCESS_METRICS.md`):**

For the product as a whole:
- **D1 success** — what happens within the first session that proves the
  product is on track (e.g. "first action completed within 5 min of signup")
- **D7 success** — what happens within the first week (e.g. "≥80% of new
  households log at least one chore completion by day 7")
- **D30 success** — what happens within the first month (e.g. "60% of users
  return weekly")

For each persona:
- **Adoption signal** — what would actually make this persona "hire" the
  product (sourced from `jobsToBeDone[].hireForCriteria`)
- **Return reason** — what makes them come back next week
- **Abandonment risk** — what would make them stop

For each workflow:
- **Leading indicator** — the failure mode the system MUST detect and act on
  quickly (failure trigger + detection latency target + action target)

**Anti-metrics — what would make the MVP feel generic/shallow:**
- A single dashboard that does everything (vs. distinct screens per use case)
- Every requirement sharing the same failure case
- Sample data with placeholder IDs (`record-001`, `user-1`)
- Acceptance patterns that repeat the workflow at the screen level
- All actor responsibilities phrased as "Use product to ..."

**Validation rules:**
- `valueProposition.topThreeOutcomes[]` is the canonical list (set in Pass 0).
  Pass 5 expands it with cadence (D1/D7/D30) and per-persona signals.
- The audit dimension `idea-clarity` requires 3 outcomes; `persona-depth`
  requires adoption signals; `multi-use-case coverage` requires diverse
  workflows.

---

## Pass 6 — Test data and regression suite

**Goal:** simulate realistic test data and build comprehensive test scenarios
covering every persona × workflow × screen.

**Mandatory deliverables:**

For every entity in `entities.json`:
- **Happy-path sample** — a realistic record with domain-conventional IDs
  (`acct-acme-001`, `MRN-484823`, `lead-acme-2026-001`), real-looking names,
  realistic timestamps. Stored in `entity.sample` and emitted into
  `SAMPLE_DATA.md`.
- **Negative-path sample** — `negative-<id>` variant with the field that
  triggers a known failure mode set to a failing value.
- **Variant samples** for enum-state-machine boundaries — `variant-<id>-<enumValue>`
  for each interesting enum boundary.

For every workflow in `workflows.json`:
- **Per persona** — a test scenario for each actor that touches the workflow,
  using their persona-specific entry point.
- **Per workflow** — happy path + one test per researched failure mode +
  edge cases for enum boundaries.
- **Per screen** — at minimum a "screen renders correctly with sample data"
  smoke for each of empty / loading / error / populated states.

**Test case schema (`testCases.json`):**

```json
{
  "id": "test-<workflow-slug>-<scenario-tag>",
  "workflowId": "<workflow id>",
  "scenario": "happy-path" | "edge-case" | "failure-mode",
  "given": "An authenticated <persona> has <sample record loaded>",
  "when": "The actor runs <action>",
  "then": "<system surfaces specific post-condition>",
  "testDataRefs": ["<sample id>", "..."],
  "expectedFailureRef": "<workflow.failureModes[].trigger>",
  "origin": "use-case" | "domain" | "both",
  "evidenceStrength": "strong" | "moderate" | "weak",
  "sources": [...],
  "firstSeenInPass": 6,
  "updatedInPass": 6
}
```

**Add to the regression suite.** The generated workspace's
`regression-suite/scripts/run-regression.ts` reads `testCases.json` and
should expand to cover every persona × workflow × screen scenario captured
above. If a test doesn't yet exist for a (persona × workflow × screen)
triple, log it as a `RemovedItem` with `reason: "deferred to phase N"`
rather than dropping it silently.

**Validation rules:**
- Every researched `failureModes[]` entry has at least one matching test case.
- Every workflow has at least one `happy-path` case.
- `testDataRefs[]` is never empty for happy-path or failure-mode cases.
- Sample IDs are domain-conventional, not `record-001`-style placeholders.
  The audit dimension `realistic-sample-data` (max 5) caps when ≥30% are
  generic.

The audit dimension `test-case-grounding` (max 10) scores ref grounding,
failure-mode coverage, and per-workflow happy-path presence.

---

## Pass 7 — Integration and test plan

**Goal:** define end-to-end integration tests with realistic fixture data,
audit expectations, and persona-specific scenarios.

**Mandatory deliverables (per phase, materialized into
`phases/<slug>/INTEGRATION_TESTS.md` by the generator):**

For each phase, identify the workflow(s) the phase advances and emit:
- **Goal** — the workflow's `acceptancePattern`
- **Fixture data** — JSON-shaped seeds from `entity.sample` that the
  implementing agent can paste into a seed script
- **Persona-specific test** — at least one scenario per persona that touches
  this workflow
- **Happy-path interaction** — step-by-step from `workflow.steps`
- **Failure scenarios** — one per researched failure mode, using the
  negative-path sample
- **Recovery scenario** — what the user does to get back to the happy path
  after a failure
- **Audit expectations** — what should appear in the audit log after each
  state-changing step

**Validation rules:**
- Every workflow assigned to a phase has an INTEGRATION_TESTS.md scenario.
- Fixture data references real `entity.sample` values, not placeholders.
- Persona-specific tests use the persona's authMode and visibility scope.

---

## Pass 8 — Database schema alignment

**Goal:** ensure the DB schema matches the actors / entities / workflows
defined in passes 1–4.

**Mandatory deliverables in `entities.json` field metadata:**

For every field on every entity:
- **`dbType`**: `'UUID' | 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' |
  'TIMESTAMPTZ' | 'DATE' | 'JSONB' | 'ENUM'`. Drives DDL generation.
- **`nullable`**: defaults to `!required` if omitted.
- **`defaultValue`**: SQL default for the column (`'CURRENT_TIMESTAMP'`,
  `'false'`, an enum value).
- **`indexed`**: `true` for id-like fields, foreign keys, status fields,
  hot-query fields.
- **`unique`**: `true` for primary keys, email-like fields, etc.
- **`fk`**: `{ entityId, fieldName, onDelete: 'CASCADE'|'RESTRICT'|'SET NULL'|'NO ACTION' }`
  whenever the field references another entity. Required for cross-entity
  references.
- **`pii`** / **`sensitive`**: `true` where applicable. The downstream
  privacy gate keys off these.

**Mandatory schema alignment checks:**
1. Every workflow's `entitiesTouched[]` references an entity that has all
   the fields the workflow's steps imply. (E.g. if step 2 says "Decrement
   capacity", the entity must have a `capacityRemaining` field.)
2. Every screen's `fields[].refEntityField` resolves to a real
   `<entityId>.<fieldName>`.
3. Every `fk.entityId` references an existing entity.
4. Every `pii: true` field has at least one risk in `risks.json` covering
   it OR an explicit decision in `_removed.json` saying privacy review
   accepted.

When `dbType` is present on enough fields, the generator emits
`architecture/DATABASE_SCHEMA.sql` (executable PostgreSQL DDL) and
`architecture/DATABASE_SCHEMA.md` (human-readable companion). Run the DDL
through PostgreSQL locally to verify it loads without errors before treating
the recipe as done.

The audit dimensions `schema-realism` (max 10) and `entity-field-richness`
(max 5) score this pass. Mean fields per entity should be ≥6, with ≥1
enum/fk/indexed flag per entity.

---

## Pass 9 — Quality gate (autoresearch exit)

**Goal:** the recipe is not done when 8 passes finish. It's done when the
generated workspace passes the quality gate that's tied to the success
metrics defined in Pass 5.

**Mandatory deliverables:**

Add a gate to `gates.json`:

```json
{
  "id": "gate-mvp-quality",
  "name": "MVP quality gate (research-grounded)",
  "rationale": "Hold the workspace to the success metrics defined in Pass 5 and ensure the regression suite passes before any phase is treated as ready.",
  "mandatedBy": "product",
  "mandatedByDetail": "Pass 5 success metrics + Pass 6 regression suite",
  "applies": "always",
  "evidenceRequired": [
    "Audit total ≥ 95",
    "All 6 Phase F depth dimensions ≥ 3/5",
    "Regression suite passes 100% on the generated workspace",
    "Every Pass 5 D1/D7/D30 metric is measurable on the generated artifacts",
    "Every researched failure mode has a matching test case"
  ],
  "blockingPhases": ["phase-implementation", "phase-release"]
}
```

**Run the loop:**

1. Generate the workspace.

   ```bash
   npm run create-project -- --input=<brief.json> --out=<workspace> --research-from=<your-research-dir>
   ```

2. Run the audit.

   ```bash
   npm run audit -- --package=<workspace>/mvp-builder-workspace
   ```

3. Run the regression suite.

   ```bash
   npm run regression -- --package=<workspace>/mvp-builder-workspace
   ```

4. **Read the result.** The audit prints `total/100`, the rating, and per-
   dimension scores. The regression suite prints pass/fail per check.

### Default exit bar

The recipe is considered done only when **all** of the following hold:

- `total >= 95` on the audit
- `Cap applied: none` on the expert rubric
- All Phase F depth dims ≥ 3/5: `workflow-step-realism`, `requirement-failure-variance`,
  `entity-field-richness`, `per-screen-acceptance-uniqueness`, `use-case-depth`,
  `persona-depth`
- Workspace remains `production-ready` and `research-grounded`
- Regression suite passes 100% (`run-regression.ts` returns 0 failures)

Below the bar → **targeted re-extraction**. Do not rerun the full 9-pass
loop. For each blocker / capped dim, identify which upstream pass owns the
fix:

| Audit signal | Upstream pass to redo | What to add |
| --- | --- | --- |
| `research-depth < 4/10` | Pass 3 (workflows) | More workflow steps with `branchOn` decision points |
| `edge-case-coverage` (≥40% generic triggers) | Pass 3 (failureModes) | Domain-specific triggers, not "invalid input" |
| `role-permission-matrix` (no DENY cells) | Pass 1 (visibility) | Explicit visibility lists with non-overlapping ownership |
| `regulatory-mapping < 2/5` | Pass 0 + add gates | Cite real regs in `mandatedByDetail` (HIPAA §X, GDPR Art. N) |
| `realistic-sample-data` (placeholder IDs) | Pass 6 / Pass 8 | Domain-conventional IDs |
| `workflow-step-realism < 3/5` | Pass 3 | Replace templated CRUD verbs with domain verbs |
| `requirement-failure-variance < 3/5` | Pass 3 (more failure modes) + ensure rotation | More failure modes per workflow |
| `entity-field-richness < 3/5` | Pass 8 | More fields per entity, with enum/fk/indexed flags |
| `per-screen-acceptance-uniqueness < 3/5` | Pass 4 | Distinct screen-specific acceptance per screen |
| `use-case-depth < 3/5` | Pass 2 + Pass 3 | More use cases per persona, all four paths |
| `persona-depth < 3/5` | Pass 1 (JTBDs) | Real motivations + pain points + adoption signals |
| `idea-clarity < 3/5` | Pass 0 | Honest critique with 3+ entries |

Edit only the JSON file the targeted pass owns, regenerate the workspace,
re-audit + re-regression. Each retry should change exactly the dimensions
the audit flagged.

### Retry budget

**Maximum 2 retries by default.** A run that needs more than 2 retries
usually has a thin brief — surface a warning to the user and stop. The fix
after 2 retries doesn't come from running the recipe again; it comes from
the user adding detail to the brief or accepting that the MVP scope is
under-specified.

If the third retry would still be required, write the audit findings to
`research/AUDIT_RETRY_EXHAUSTED.md` so the human knows where the gap is.

---

## Self-critique and conflict resolution (final)

Before treating the recipe as done, read your own output and ask:

1. **Brief alignment:** Does every actor, entity, and workflow trace either
   to the brief OR to industry-standard knowledge tagged `origin: 'domain'`?
   List any with no traceable source as `RemovedItem` entries with
   `reason: "no brief or domain evidence"`.
2. **Hallucination check:** Do entity names appear in your own training data
   for this industry? If `Lead` appears for an SDR product, that's correct.
   If `Cardinal Witness` appears in a Family Task Board, that's hallucinated
   — remove it.
3. **Brief contradictions:** Does your output contradict the brief? E.g.
   brief says "no payments in v1" but you added a Payment entity. Move
   these to `conflicts.json` with `resolution: 'pending'`. Mark
   `resolution: 'brief-wins'` if the brief is intentional, or
   `'research-wins'` if domain practice insists.
4. **Coverage:** Does every must-have feature have at least one workflow?
   Every actor have at least one workflow? Every workflow touch at least
   one entity? Every workflow have at least one test case? Every screen
   have a per-screen acceptance criterion that's distinct from siblings?

**Resolve conflicts.** The validator rejects extractions with
`conflicts[].resolution: 'pending'` for severity > 'note'. Make a call.
Document why in the resolution field.

**Final `meta.json`:**

```json
{
  "briefHash": "<sha256 of the brief JSON>",
  "schemaVersion": "0.2",
  "startedAt": "<ISO at start>",
  "completedAt": "<ISO at end>",
  "totalPasses": { "useCase": 9, "domain": 9 },
  "finalCriticScores": { "useCase": <self-rated 0-100>, "domain": <self-rated 0-100> },
  "convergedEarly": { "useCase": false, "domain": false },
  "totalTokensUsed": <approximate>,
  "modelUsed": "<your model id>",
  "researcher": "claude-code-session" | "anthropic-sdk" | "mock",
  "researchSource": "agent-recipe",
  "discovery": { /* Pass 0 output */ }
}
```

If `finalCriticScores.useCase < 70` or `finalCriticScores.domain < 65`,
surface a warning to the user before invoking `create-project`. The brief
may be too thin to research properly; suggest improvements first.

---

## Why no domain packs / archetype routing

mvp-builder previously had `lib/archetype-detection.ts` that keyword-routed
briefs into pre-baked templates (SDR, family-task, scheduling, ...). Phase
A3c removed it because:
- You can't pre-bake every domain; coverage gaps cause silent fallbacks to
  generic templates.
- Per-domain templates ossify. When the agent's training data is richer
  than the template, the template downgrades the output.
- The agent (Claude / Codex / Kimi) has its own model context and can do
  domain reasoning better than a static keyword router.

A short-lived Phase F1 added domain packs back under a different name. They
were reverted for the same reasons. **The recipe above replaces them.** The
agent does the domain reasoning per-brief; the audit catches when the agent
took shortcuts.

If you find yourself wanting to add per-domain templates to make a brief
"work better," the right move is instead to:
1. Strengthen the relevant pass (usually Pass 0 or Pass 1) with explicit
   prompts.
2. Add an audit dimension that catches the laziness the templates were
   masking.
3. Re-run the recipe — the agent will produce richer output without
   templates.

---

## How `create-project` consumes this

```bash
npm run create-project -- \
  --input=brief.json \
  --out=./mvp-builder-out \
  --research-from=./your-research-dir
```

The generator:
1. Validates `<research-from>/research/extracted/*.json` against the schema.
2. Pins the legacy archetype tag to `general` (research is the source of
   truth).
3. Builds requirements as `## Requirement N:` (one per workflow step),
   citing your sources, with failure modes rotated by step index.
4. Generates `SAMPLE_DATA.md` from `entities.json`.
5. Generates non-functional requirements from `risks.json` and `gates.json`.
6. Anti-features go into `requirements/FUNCTIONAL_REQUIREMENTS.md` as a
   deliberately-out-of-scope section.
7. Emits the comprehensive-depth artifacts listed at the top: USE_CASES,
   USER_PERSONAS, SUCCESS_METRICS, PER_SCREEN_REQUIREMENTS, INTEGRATION_TESTS.
8. The audit (`npm run audit`) detects research-grounded=true via the absence
   of the deprecated `Generated WITHOUT research extractions` banner.

Workspaces produced via this recipe should land in the `production-ready`
rating (≥95/100) when the recipe is followed properly. The legacy
`--allow-templated` keyword-router path was removed in Phase A3c and is
explicitly NOT coming back.

---

## Worked partial example — for an SDR brief

A fragment to set the depth bar. Don't copy this; produce equivalent depth
for your own brief.

**`actors.json` excerpt (Pass 1):**

```json
[
  {
    "id": "actor-sdr",
    "name": "Sales Development Rep",
    "type": "primary-user",
    "responsibilities": [
      "Source leads from conferences and email lists",
      "Run multi-touch outbound cadences",
      "Qualify leads and hand off to AEs"
    ],
    "visibility": ["own assigned leads", "own activity history"],
    "authMode": "authenticated",
    "origin": "use-case",
    "evidenceStrength": "strong",
    "sources": [
      { "url": "brief://sdr-sales-module", "title": "SDR brief", "quote": "salespeople who go to conferences, who get email lists, and then research is done in the company", "fetchedAt": "2026-04-30T15:00:00Z" }
    ],
    "firstSeenInPass": 1,
    "updatedInPass": 1
  }
]
```

**`jobsToBeDone.json` excerpt (Pass 1):**

```json
{
  "id": "jtbd-sdr-fresh-list",
  "actorId": "actor-sdr",
  "situation": "When a fresh conference lead list arrives in the morning",
  "motivation": "I want to import, dedupe, and enroll the new leads in the right cadence",
  "expectedOutcome": "So that every new lead has a first touch within 24 hours and no overlap with AE-owned accounts",
  "currentWorkaround": "Spreadsheet uploads with manual VLOOKUP against the AE territory list",
  "hireForCriteria": [
    "Time from list-receipt to first-touch <2 hours",
    "Zero duplicate-email collisions per import batch",
    "Audit trail for every cadence enrollment decision"
  ]
}
```

**`workflows.json` excerpt (Pass 3):**

```json
{
  "id": "workflow-cadence-execution",
  "name": "Outbound cadence execution",
  "primaryActor": "actor-sdr",
  "secondaryActors": ["actor-ae"],
  "steps": [
    { "order": 1, "actor": "actor-sdr", "action": "Import a lead list from a conference event", "systemResponse": "Persist Lead records, deduplicate against existing accounts, flag conflicts." },
    { "order": 2, "actor": "actor-sdr", "action": "Enrich each lead with researched company context", "systemResponse": "Persist enrichment to Lead.fitSignal; update activity timeline." },
    { "order": 3, "actor": "actor-sdr", "action": "Apply a cadence (sequence of touches)", "systemResponse": "Schedule touches; show next-step queue ordered by due time.", "branchOn": "Cadence type: cold / warm" },
    { "order": 4, "actor": "actor-sdr", "action": "Log a touch outcome (replied, no-reply, bounced, opt-out)", "systemResponse": "Update Lead state; update Cadence progression; trigger next touch or unenroll." },
    { "order": 5, "actor": "actor-sdr", "action": "Qualify or disqualify a Lead based on advance/block signals", "systemResponse": "Move qualified leads to AE queue; surface disqualification reason on Lead." }
  ],
  "failureModes": [
    { "trigger": "Lead opts out via reply", "effect": "If we keep emailing, we trigger CAN-SPAM exposure and damage sender reputation", "mitigation": "Detect 'unsubscribe' / 'remove' in replies; auto-suppress in <5 minutes; surface to SDR" },
    { "trigger": "Imported list overlaps with existing AE-owned accounts", "effect": "Two reps email the same prospect; embarrassment and possible AE territory conflict", "mitigation": "On import, dedupe against ownership graph; route conflicts to manager queue, not auto-import" }
  ],
  "entitiesTouched": ["entity-lead", "entity-cadence", "entity-touch", "entity-audit-entry"],
  "acceptancePattern": "Given an SDR with a fresh conference list, when they import 50 leads, apply a cadence, and log replies, then the next-step queue advances correctly and a single audit entry exists per touch.",
  "origin": "use-case",
  "evidenceStrength": "strong",
  "sources": [...],
  "firstSeenInPass": 3,
  "updatedInPass": 3
}
```

Notice:
- Step actions are concrete verbs with named entities, not "user does the
  workflow".
- Failure modes name specific domain pitfalls (CAN-SPAM, territory conflict),
  not "validation error".
- Sources include both the brief and (where available) outside references.
- IDs are stable kebab-case and cross-reference correctly.

---

## Common mistakes

- **Padding for the sake of counts.** Don't list 6 entities if the brief
  only justifies 4. Use `_removed.json` to record entities you considered
  and rejected with reasons.
- **Generic verbs in workflow steps.** "User does the thing" is useless as
  a workflow step. Use the verb the actor actually says ("Import a lead
  list", "Approve a refund", "Mark a chore complete").
- **Placeholder IDs in samples.** `record-001`, `user-1`, `id-abc` — replace
  with domain-conventional IDs (`acct-acme-001`, `MRN-484823`,
  `INV-2026-0042`). The audit specifically flags this.
- **Missing referential integrity.** Every `ownerActors`, `affectedActors`,
  `entitiesTouched`, `step.actor` must reference an ID that exists. The
  validator rejects orphan refs.
- **Conflicts left pending.** The validator refuses extractions with
  unresolved conflicts above `severity: 'note'`. Make a call and document it.
- **Relying on templates.** mvp-builder does not ship per-domain templates.
  Synth output is intentionally shallow. If a real-build looks templated,
  the agent (you) didn't do the recipe properly.

---

## Skipping research (removed in Phase A3c)

The legacy `--allow-templated` flag and the keyword-router archetype
detection (`lib/archetype-detection.ts`) were removed in Phase A3c.
`create-project` now requires `--research-from=<dir>`. Library callers
(smoke tests, regression harnesses) can still call `createArtifactPackage`
without extractions; that path renders the generic baseline only and is not
exposed to end users via the CLI.

A short-lived Phase F1 attempted to add domain packs in
`lib/research/domain-packs/`. They were reverted because they reintroduced
the same archetype-routing pattern under a different name. **Production
quality lives in this recipe, not in templates.**
