# Phase H — Fresh-builder validation report

**Date**: 2026-05-03
**Method**: 3 independent fresh-builder agents (zero shared context with this
session) were each pointed at a generated mvp-builder workspace and asked
to build the app from it. Each agent started at `BUILDER_START_HERE.md`
and followed the Tier 1 reading list. Each agent scored the workspace on
six dimensions and reported gaps, contradictions, and stale references.

The three workspaces deliberately span the input-quality range:

| # | Workspace | Input shape | Research source |
|---|---|---|---|
| W1 | Household Budget Planner | Simple SaaS / internal couples-tool, beginner-business profile, no compliance | agent-recipe (hand-authored) |
| W2 | Small Clinic Scheduler | Workflow-heavy multi-actor app, intermediate-technical, HIPAA in scope | agent-recipe (hand-authored) |
| W3 | Yarn Buddy | Sparse founder idea, deliberately one-paragraph brief with vague answers | synthesized (no recipe ran) |

W3 is the honesty test: a founder who skips the research recipe should get
a workspace that visibly says "your input is too thin — go run the recipe"
rather than one that pretends to be demo-ready.

## Headline scores

| Workspace | Builder clarity /20 | Impl. specificity /20 | Mock clarity /15 | Failure-mode /15 | File nav /15 | Demo-readiness honesty /15 | **Total /100** |
|---|---:|---:|---:|---:|---:|---:|---:|
| **W1 Household Budget** | 17 | 15 | 14 | 13 | 9 | 9 | **77** |
| **W2 Small Clinic Scheduler** | 16 | 14 | 9 | 13 | 8 | 9 | **69** |
| **W3 Yarn Buddy (sparse)** | 18 | 6 | 6 | 11 | 14 | 15 | **70** |

**Average: 72 / 100**

### Acceptance-criteria status

| Criterion | Status |
|---|---|
| No archetype/template/category/keyword system introduced | ✅ Held |
| ≥ 2/3 workspaces score ≥ 85/100 | ❌ **0/3** |
| No workspace below 75/100 | ❌ **W2 (69) and W3 (70)** below |
| Builder identifies first 5 files without external explanation | ✅ All 3 agents named the same first 5 files |
| Mocked auth/payment/email/storage concrete enough | ⚠️ Auth ✅; **SMS missing in W2**; nothing else mocked |
| Lifecycle status remains honest | ✅ W3 is `Blocked` and `demoReady=false` from synth; W1/W2 are `DemoReady` |

**Phase G is not yet RC. Two of the three workspaces are below the
75-floor, and zero hit the 85-target. The gaps are not architectural —
they're concrete generator bugs and missing concrete-mock contracts. Each
fix is in the Must-Fix list below; none requires touching the Phase F/G
architecture or reintroducing archetypes.**

## What's working (do not regress)

The agents all called out the same wins:

1. **`BUILDER_START_HERE.md` itself.** Every agent named it the single
   most-useful file. The 9-section structure (build / users / day-1 /
   validation / mocked / Tier 1 / Tier 3 / how-to-run / done) lands as
   intended.
2. **Tier 1 reading list ordering.** All 3 agents converged on the same
   first 5 files: `BUILDER_START_HERE.md`, `workflows.json`, `screens.json`
   or `PER_SCREEN_REQUIREMENTS.md`, `DATABASE_SCHEMA.sql`, `MOCKING_STRATEGY.md`
   or `INTEGRATION_TESTS.md`. The contract is legible.
3. **`ARCHIVE_INDEX.md` + Tier 3 banners.** The W3 agent specifically
   named ARCHIVE_INDEX as a "great noise reducer." The W1 agent didn't
   even need to open it — the in-file Tier 3 banner pattern alone was
   enough.
4. **Lifecycle / audit / banner agreement on the sparse path.** W3 was
   the cleanest validation: `Status: Blocked (structural)` in
   `00_PROJECT_CONTEXT.md`, `demoReady=false` in the audit verdict,
   `Status: **Blocked**` in `BUILDER_START_HERE.md`, all three signals
   pointed the agent back to the recipe instead of letting it build a
   pretend-demo. **The honest-thin-input behavior the spec requires is
   in.**
5. **Failure-mode attribution.** All three agents scored
   "failure-mode usefulness" 11-13/15. The W5 staged matcher + greedy
   single-step assignment landed: failure cases are step-specific,
   actionable, server-side, and not duplicated across unrelated requirements.
6. **MOCKING_STRATEGY auth contract.** W1 and W2 both quoted the magic-link
   contract verbatim (file path, env var, token TTL, 429-after-3, audit
   shape). It's the gold standard mock spec in the workspace.

## Must-fix before RC

These are concrete bugs the fresh-builder agents hit while building. None
are architectural. Each one is a deterministic generator output that
doesn't match what an implementing agent needs.

### M1 — `DATABASE_SCHEMA.sql` quoted-default bug

**Where**: `lib/generator/database-schema.ts` line 32.
**What**: When `EntityField.defaultValue` is a plain string (e.g. `"USD"`),
the generator emits `DEFAULT 'USD'`. When the source already wraps the
default in single quotes (e.g. `"'USD'"` in iter-05 entities.json), the
generator double-wraps, producing `DEFAULT ''USD''` — invalid Postgres.
Both fresh-builder agents flagged this on inspection; the SQL won't apply.
**Symptom in W1**: `currency TEXT NOT NULL DEFAULT ''USD''`.
**Fix**: Strip leading/trailing single quotes from `field.defaultValue`
before re-wrapping; or trust the JSON to be the canonical raw value.

### M2 — `DATABASE_SCHEMA.sql` quoted-numeric-default for INTEGER

**Where**: `lib/generator/database-schema.ts` line 32 (same path).
**What**: Numeric `defaultValue` strings (e.g. `"30"` for an INTEGER
column) get wrapped in single quotes, emitting
`slotDurationMinutes INTEGER NOT NULL DEFAULT '30'`. Postgres coerces
this in some versions and rejects in others.
**Symptom in W2**: `slotDurationMinutes INTEGER NOT NULL DEFAULT '30'` and
`durationMinutes INTEGER NOT NULL DEFAULT '30'`.
**Fix**: Add an `INTEGER` / `DECIMAL` branch to the dbType switch that
emits the value unquoted.

### M3 — `DATABASE_SCHEMA.sql` foreign-key ordering

**Where**: `lib/generator/database-schema.ts` `renderDatabaseSchemaSql` —
emits tables in `ex.entities` order regardless of dependency.
**What**: When a table A's FK references table B, but B is defined later
in entities.json, `psql -f schema.sql` fails at A's `CREATE TABLE`.
**Symptom in W1**: `household.createdByActorId → member_profile(memberId)`,
but `household` is created before `member_profile`. Both agents (W1 and
W2) flagged the FK ordering as a real builder-blocker.
**Fix**: Topologically sort entities by FK dependency before emit, or
emit all `CREATE TABLE` first and all `ALTER TABLE … ADD CONSTRAINT FK`
after — the second is more robust.

### M4 — Circular FK between `household` and `member_profile` (iter-05)

**What**: `household.createdByActorId` REFERENCES `member_profile(memberId)`,
`member_profile.householdId` REFERENCES `household(householdId)`. Both NOT
NULL. Neither row can be inserted first. Even with M3 fixed, this is
unconstructable without `DEFERRABLE INITIALLY DEFERRED` constraints, a
nullable bootstrap column, or a separate `household_member` join table.
**Where**: This is partly an extractions-quality issue (iter-05's
hand-authored entities.json), and partly a generator issue (no detection
of cycles). The recipe should warn the agent during pass 8 that an
unconstructable cycle exists.
**Fix**: Add a cycle detector to `database-schema.ts` that emits a
`-- WARNING: cycle detected, marking these FKs DEFERRABLE` block and
either drops `NOT NULL` from one side or adds the deferrable clause.

### M5 — `DATABASE_SCHEMA.md` table-name mismatch with `.sql`

**Where**: `lib/generator/database-schema.ts` line 93 (the markdown
renderer).
**What**: The `.md` renders the FK target table name with
`name.toLowerCase().replace(/\s+/g, '_')` — single replace, keeps `/`,
keeps `(`. The `.sql` renderer (line 16) does TWO replaces: whitespace AND
`[^a-z0-9_]`. So a table named "Visit / Appointment" emits as
`visit__appointment` in `.sql` but `visit_/_appointment` in `.md`. Neither
file points at the other consistently.
**Symptom in W2**: `.md` line 25 says `### Visit / Appointment (\`visit__appointment\`)`,
but FK lines further down reference `visit_/_appointment`.
**Fix**: Centralize `tableName(entity)` into a shared helper used by both
renderers. (It already exists at line 15; the `.md` renderer just needs
to call it.)

### M6 — `BUILDER_START_HERE.md` §8 says `make setup/dev/test/audit`; Makefile has different targets

**Where**: `lib/generator/builder-start-here.ts` section 8 hardcodes the
make commands; the deployment template's `Makefile` (G3) declares
`install / migrate / seed / deploy / smoke / rollback`.
**What**: A fresh agent runs `make setup` per BUILDER_START_HERE and gets
"no rule to make target." Both contradictory templates ship in the same
workspace.
**Fix**: Either rewrite the deployment-template Makefile to use the
`setup / dev / test / audit` aliases (with the existing targets as
internal helpers), or rewrite BUILDER_START_HERE §8 to list the actual
deployment-template targets. The second is cheaper. The Makefile is the
source of truth — `BUILDER_START_HERE` should describe it, not invent
its own vocabulary.

### M7 — `BUILDER_START_HERE.md` §5 vs §8 contradict on auth mocking when there are no integrations

**Where**: `lib/generator/builder-start-here.ts` — §5 emits "No integrations
are mocked by default" when `mocking.mocked` is empty, but §8 unconditionally
emits "Demo-safe mock auth: set `AUTH_DEMO_MODE=true` in `.env.local`…"
**Symptom in W3**: §5 says "every integration uses real credentials,"
§8 step 2 still says to set `AUTH_DEMO_MODE=true`. Both can't be true.
**Fix**: Make §8 step 2 conditional on `mocking.mocked.some(m => m.category === 'auth')`.
Drop the line entirely when there's no mocked auth integration.

### M8 — `BUILDER_START_HERE.md` Tier 1 item 13 references a directory that doesn't exist yet

**Where**: `lib/generator/builder-start-here.ts` Tier 1 list, item 13
(`evidence/audit/QUALITY_AUDIT-*.md`).
**What**: All three fresh-builder agents glob'd this and found nothing.
The directory is created on first audit run (`npm run audit` populates
it). A first-time builder reading the workspace cold sees a missing file
in their first reading list.
**Fix**: Either (a) add a hint inline ("Generated by `npm run audit`;
empty until the first audit runs"), or (b) emit a placeholder
`evidence/audit/README.md` at generation time so the directory exists
with explanation. (a) is simpler and already half-true in the file's
own copy — just promote that to the Tier 1 list line.

### M9 — `requirements/REGULATORY_NOTES.md` enforcement evidence truncated mid-word

**Where**: `lib/generator/regulatory-notes.ts` line 84 —
`entry.enforcement = gate.evidenceRequired.join('; ').slice(0, 240);`
**What**: The 240-char hard cut chops the third evidence sentence in the
middle. W2 saw `Test that the` followed by nothing — actual content was
"Test that the SMS reminder template cannot interpolate PHI fields…"
**Fix**: Either remove the `.slice(0, 240)` (let the full evidence list
through) or truncate to the last `; ` boundary before 240. Removing the
slice is safer and more useful to a builder.

### M10 — Missing concrete mock contract for SMS / email reminders when integration is mocked

**Where**: `lib/generator.ts` `buildMockingStrategy` only emits the
magic-link contract for `category === 'auth'`. SMS, email, payment, etc.
mockedByDefault integrations get the generic "use mocks" copy without a
concrete file-system / env-var / audit-event-shape spec.
**Symptom in W2**: SMS reminders are a Day-1 flow (booking confirmation,
no-show outreach). The integration is declared `mockedByDefault: true`,
but `MOCKING_STRATEGY.md` has no concrete SMS contract, no template for
where mock SMS bodies are written, no env var name for the real provider,
no audit event shape. The fresh-builder agent had to invent the contract.
**Fix**: Generalize the magic-link contract pattern into an integration-
category dispatch. For each `category` of mocked integration, emit a
concrete contract:
- `sms` → mock body to `.tmp/sms/<sha256>.txt`, log to console with
  `[sms mock]` prefix, env var = the integration's `envVar` field, audit
  event `{type: 'sms.sent', to, sha256, ts}`.
- `email` → similar pattern, `.tmp/emails/<sha256>.txt`.
- `payment` → no auto-mock; require explicit blocker surface.
- `storage` → `.tmp/blobs/<sha256>.bin` filesystem stand-in.
- `webhook` → captured payload fixtures in `tests/fixtures/webhooks/`.
This is the same shape M1-M3 of the magic-link contract, just templated
per category.

### M11 — `00_PROJECT_CONTEXT.md` and `PROJECT_BRIEF.md` carry blocker warnings even on DemoReady workspaces

**Where**: `lib/generator.ts` — `buildRootContext` and the brief renderer
emit `bundle.blockingWarnings` regardless of lifecycle. On DemoReady the
header text changes (`Review notes (non-blocking)`) but `PROJECT_BRIEF.md`
still lists `[blocker]` items as if they were real blockers.
**Symptom in W1**: PROJECT_BRIEF lists 4 blockers and 13 open questions;
the workspace is `DemoReady`. Confusing.
**Fix**: When lifecycle is `DemoReady` or `BuildReady`, downgrade
`[blocker]` lines to `[review note]` in the brief, or move them to a
collapsed "Open review notes" section so the headline of the brief is
the actual brief, not blocker copy.

### M12 — Persona "Why" boilerplate when extractions are thin

**Where**: `lib/generator/user-personas.ts` /
`lib/generator/use-cases.ts` (and possibly the synth's persona builder).
**What**: When the synth produces personas without rich JTBDs, the
generator emits "complete the [WorkflowName] workflow I'm responsible
for" as the persona's motivation. This is a tautology, not a motivation.
**Symptom in W3**: every persona's "Why" is the same boilerplate.
**Fix**: When the JTBD is missing or trivially-derived from a workflow
name, emit "Motivation not extracted by research; re-run the recipe to
populate JTBDs" instead of the boilerplate. Honesty over filler. Note
this is also covered by W3's lifecycle = `Blocked`; the
extra signal here is to make the persona file itself say so.

## Nice to have

These improve the experience but don't block RC.

### N1 — Reduce `FUNCTIONAL_REQUIREMENTS.md` filler rows

W1, W2, and W3 all flagged that 5-7 of 10-16 requirements end with
"no dedicated researched failure mode applies; route to the workflow-
level mitigations…" That's the W5 step-aware fallback doing its job —
honest, but still verbose. A reader skims past 50% of the doc.
**Possible fix**: When a workflow has every-step matched, omit the
fallback lines. When the fallback is needed, batch the affected REQ IDs
into a single "REQ-2, REQ-4, REQ-7 share workflow-level mitigations" note
at the bottom of each workflow's group.

### N2 — Make `START_HERE.md` smaller / point to BUILDER_START_HERE

W2 agent noted that `START_HERE.md` competes with `BUILDER_START_HERE.md`
by name — a cold colleague might open the wrong one first. `START_HERE`
is for the package-level lifecycle (point at PHASE_PLAN.md, etc.); a
build agent doesn't need it. **Fix**: prepend a one-liner at the top of
`START_HERE.md` saying "If you are a coding agent assigned to BUILD this
app, open BUILDER_START_HERE.md instead."

### N3 — Tier 3 banner on `START_HERE.md`?

W2 agent suggested `START_HERE.md` should also carry the Tier 3 banner.
This is a judgment call — `START_HERE.md` IS used by the lifecycle
workflow (gate review, phase advance) so it isn't strictly Tier 3. But
the name confusion is real. N2 (the inline pointer) is the safer fix.

### N4 — `regulatory-mapping` per-REQ specificity

W2 agent: "Every REQ-1..REQ-16 is tagged with the same three HIPAA
citations; flat tag, not 'for REQ-3 (slot pick), the HIPAA evidence is
X'." The mapping is structurally correct (citation-to-REQ exists) but
not implementer-actionable per-REQ. **Fix**: in
`regulatory-notes.ts`, instead of one list of REQ IDs per citation,
emit a per-REQ block that names the specific evidence assertion for
that REQ. (M9 partially fixes this by un-truncating the evidence; this
goes further by attributing evidence per REQ.)

### N5 — Top-level file count

W3 agent praised `ARCHIVE_INDEX.md` ("great noise reducer") but W1 and
W2 still felt 60 top-level files was loud. Phase G's design choice was
not to physically move Tier 3 files (validators expect them at root).
The Tier 3 banner makes the noise self-labeling, which is the right
trade-off, but a future phase could investigate whether the validators
can be moved to `repo/manifest.json`-driven path checks so Tier 3 files
can physically move under `archive/`.

### N6 — Empty phase TEST_CASES.md

W1 noted that `phases/phase-01/TEST_CASES.md` is an empty stub ("This
phase owns no requirements"). It's listed in Tier 1 but reading it
yields nothing.
**Fix**: Either don't emit the file when it would be empty, or emit a
real first-phase TEST_CASES from the testCases.json applicable to phase 1.
The latter is the right call — testCases.json is keyed to workflowId and
the phase-to-workflow mapping is already known.

## Validation suite results

All commands run after the 3 fresh-builder agents finished and before
this report.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run smoke` | ✅ 428 files / 14 phases |
| `npm run test:quality-regression` | ✅ 10/10 PASS |
| `npm run regression --package=.tmp/recipe-validation-iter-02/...` | ✅ 164/164 PASS |
| `npm run test:depth-enforcement` | ✅ 5/5 PASS |
| `npm run test:research-source-readiness` | ✅ 4/4 PASS |
| `npm run test:functional-requirements-failures` | ✅ 5/5 PASS |
| `npm run audit -- --package=.tmp/recipe-validation-iter-05/... --enforce-depth` | ✅ 100/100, depth 30/30 (deep), demoReady=true |
| `npm run audit -- --package=.tmp/recipe-validation-iter-02/... --enforce-depth` | ✅ 100/100, depth 30/30 (deep), demoReady=true |
| `npm run audit -- --package=.tmp/phase-h/yarn-buddy/... --enforce-depth` | ✅ exit 1 — depth gate FAILED on workflow-step-realism=3 (synth correctly capped) |

**loop-50 was not re-run** because no generator behavior changed in this
phase (this is a validation pass over the existing Phase G generator). The
last loop-50 (committed under Phase G W7) reports 50/50 all-green; the
findings here would not appear in that aggregate because the synth
corpus does not exercise W2's hand-authored hand-coded SQL paths or W1's
brief-blocker-vs-DemoReady contradiction.

## Per-workspace verbatim summaries

The full fresh-builder reports below are the raw evidence for the scores.

### W1 — Household Budget Planner — fresh-builder report

> **Verdict (77/100):** "BUILDER_START_HERE is the star. Friction is real
> but localized: a stale Tier 1 reference, two SQL bugs, an empty
> TEST_CASES stub, and the blocker-vs-DemoReady contradiction. None are
> show-stoppers; all are fixable in under an hour by the workspace
> generator."
>
> **Top friction**: `DEFAULT ''USD''` in DDL; circular FK between
> `household` and `member_profile`; `evidence/audit/` directory missing
> (Tier 1 item 13); PROJECT_BRIEF lists 4 blockers while the workspace
> is `DemoReady`.

### W2 — Small Clinic Scheduler — fresh-builder report

> **Verdict (69/100):** "Workspace mostly transmits intent. The biggest
> gaps are: SQL won't apply cleanly out of the box, `make` commands
> don't match, regulatory mapping is shallow text not implementer-
> actionable, and the SMS mock contract is missing."
>
> **Top friction**: `visit__appointment` table-name mismatch between
> `.sql` and `.md`; `DEFAULT '30'` for INTEGER columns; FK ordering
> (`member_profile` referenced before defined); `BUILDER_START_HERE.md`
> §8 says `make setup/dev/test/audit` but Makefile has
> `install/migrate/seed/deploy/smoke/rollback`; SMS mocking contract
> entirely missing despite Day-1 use; REGULATORY_NOTES sentence
> truncated mid-word at 240 chars.

### W3 — Yarn Buddy (sparse synth) — fresh-builder report

> **Verdict (70/100):** "The workspace did exactly what it should: refuse
> to pretend a sparse one-paragraph brief produced a buildable spec, and
> route the builder back to running the recipe. The remaining 30 points
> lost are about the quality of the domain modeling that did get
> generated (generic Buddy/Reviewer template instead of yarn/project)
> and one internal contradiction about mocked auth."
>
> **Top friction**: §5 says "no integrations mocked" but §8 still says
> "set `AUTH_DEMO_MODE=true`" — internal contradiction; entity ids like
> `entity-see-what-i-have` and `entity-manual-entry` are token-extraction
> artifacts from the brief, not real entities; persona "Why" is generic
> "complete the workflow I'm responsible for" boilerplate.
>
> **Honesty test PASSED**: `BUILDER_START_HERE.md` says
> `Status: **Blocked**`; `00_PROJECT_CONTEXT.md` says
> `Status: Blocked (structural)` with 10 explicit blockers; the audit
> says `demoReady=false`. All three signals agree.

## Recommended sequence to reach RC

1. **M1, M2, M3** (DDL bugs) — single PR to `lib/generator/database-schema.ts`.
   Estimated 1-2 hours. Required because no fresh-builder workspace can
   apply its own DDL today.
2. **M5** (md/sql table-name mismatch) — same PR.
3. **M6, M7, M8** (`BUILDER_START_HERE.md` mismatches) — second PR to
   `lib/generator/builder-start-here.ts` and the deployment-template
   Makefile. Estimated 1 hour.
4. **M9** (REGULATORY_NOTES truncation) — one-line fix in
   `lib/generator/regulatory-notes.ts`. 5 minutes.
5. **M10** (concrete contracts for non-auth mocked integrations) — most
   work, ~3-4 hours, generalizes the magic-link pattern. This is the
   only one that touches Phase G's design surface.
6. **M11** (DemoReady brief shouldn't carry [blocker] lines) — small fix
   in `buildPackageStartHere` / `buildProjectBrief`. 30 minutes.
7. **M4, M12** — extractions-quality issues; can wait for the next
   research-recipe pass if iter-05's hand-authored entities.json is
   updated.

After M1-M11 land, re-run all 3 fresh-builder agents on the same workspaces
and confirm scores ≥ 85 on W1 and W2, ≥ 75 on W3. **W3's ceiling is the
sparse-input ceiling; it should not be expected to reach 85 because the
input itself is too thin** — that is the workspace honestly doing its job.

## What this phase deliberately did NOT change

- No archetype detection, category packs, keyword routers, domain
  templates, or allow-templated shortcuts were introduced.
- Phase F depth gate, Phase G lifecycle states, `BUILDER_START_HERE`
  9-section structure, `ARCHIVE_INDEX`, Tier 3 banners, magic-link
  mock contract, and W5 staged-greedy failure-mode matching are all
  preserved.
- Synth path is still capped (depth gate FAILS on synth as designed; W3
  audit returns demoReady=false; W3 lifecycle is Blocked).
- The `lib/generator/builder-start-here.ts` module API, the
  `LifecycleStatus` type, and `computeDemoReadyFlag` semantics are
  unchanged.

## Risks if M1-M11 are skipped

| Skipped fix | Real-world consequence |
|---|---|
| M1 / M2 | A real builder runs `psql -f architecture/DATABASE_SCHEMA.sql` and gets a syntax / type error on minute one. Loses trust in the rest of the workspace. |
| M3 / M4 | Even if M1/M2 are fixed, the schema can't bootstrap. Builder has to invent migration order. |
| M5 | Builder gets reports / metrics off the wrong table-name; runtime data not where the audit expects it. |
| M6 | `make setup` fails; builder loses 10 min figuring out the actual targets. |
| M7 | On a no-mocking workspace, the builder follows the §8 step-2 advice and either ships a half-mocked auth flow or wastes 30 min figuring out why `AUTH_DEMO_MODE` doesn't exist. |
| M8 | Tier 1 reading list points at a missing file; minor but breaks the "follow the list" promise. |
| M9 | Regulatory enforcement evidence is unusable; builder has to re-research HIPAA evidence from scratch. |
| M10 | Builder either invents an SMS mock contract that doesn't match the audit shape, or skips it entirely (silently disabling a Day-1 flow). |
| M11 | Builder reads a "[blocker]" line and stops, despite the workspace being DemoReady. Wastes 15 min reconciling. |

## Conclusion

Phase G's architecture is sound. The validation found zero architectural
defects: lifecycle/audit/banner agreement is held, the Tier 1/Tier 3
contract is legible, the magic-link mock contract is the right shape,
synth is honestly capped. **The defects are templating-layer bugs and
missing per-category mock contracts — concrete, localized, and cheap to
fix.**

Phase G should not be promoted to RC until M1-M11 land and the
fresh-builder rerun lifts at least W1 and W2 above 85/100. Average
score with M1-M11 fixed should land in the high 80s on agent-recipe
workspaces.
