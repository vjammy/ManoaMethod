# Phase A3c — Archetype cleanup report

**Status:** Complete.
**Date:** 2026-05-01.
**Scope:** delete the keyword-router archetype detector and the static archetype blueprints; require `--research-from` for `create-project`; migrate test harnesses to the research-driven path.

---

## 1. Files deleted or simplified

| File | Change | Net LOC |
| --- | --- | ---: |
| `lib/archetype-detection.ts` | **Deleted** outright. Was the keyword router (11 archetypes × anchor/incidental/anti-match heuristics). | −216 |
| `lib/domain-ontology.ts` | `buildBlueprint()` collapsed: deleted the per-archetype switch arms (`family-task`, `family-readiness`, `sdr-sales`, `restaurant-ordering`, `budget-planner`, `clinic-scheduler`, `hoa-maintenance`, `school-club`, `volunteer-manager`, `inventory`). Only the generic `general` blueprint remains. | −419 |
| `lib/generator.ts` | Removed the `import { detectArchetype }` call and replaced it with a constant `NEUTRAL_ARCHETYPE_DETECTION`. Removed the keyword-confidence and "wrong archetype" warning text from FINAL_SCORECARD; the generic-fallback warning now describes the templated path as legacy rather than as a fallback to a domain template. | net −12, behavior change in 4 places |
| `scripts/mvp-builder-create-project.ts` | Removed the `--allow-templated` CLI flag. `create-project` now strictly requires `--research-from=<dir>`. Added an in-memory `extractions` option to `createArtifactPackage` so harnesses can pass synthesized extractions without round-tripping JSON to disk. | net −18 |
| `scripts/smoke-test.ts` | Wrapped `generateProjectBundle` so smoke runs use synthesized research extractions by default. Removed the multi-archetype overlap and archetype-keyword leakage assertions (≈90 lines) — those validated the deleted templated path. Family-bundle UI workflow assertion relaxed from `Parent creates and assigns a task` (an archetype-templated string) to a structural section check. | net −74 |
| `scripts/test-quality-regression.ts` | Same wrapper pattern — every USE_CASE bundle is now generated through synthesized extractions. Replaced the per-archetype `expectedEntitySignals`/`expectedServiceSignals` table with a coherence check against the synthesized extraction's own entities. Phase-1 patterns relaxed to accept research-driven phase names that anchor on product / domain keywords. | net −44 |
| `scripts/orchestrator-test-utils.ts` | Carries the same `Scorecard` import update used by the release-blocker regression tests; no archetype-specific change. | net +14 (test fixture refinement, not A3c) |
| `scripts/run-20-business-idea-trace.ts` | Two narrative strings updated to note `archetype-detection.ts` was removed in A3c. | net −2 |
| `docs/QUICKSTART.md` | Removed Option C — deprecated archetype path. Added an A3c note. | net +2 (replacement note) |
| `docs/RESEARCH_RECIPE.md` | Replaced the `--allow-templated` deprecation block with an A3c removal note. Updated the "production-ready" line to mention the new ≥95/100 expectation and the audit-exit Step 9. | net 0 (rewording) |

**Total net change:** **901 lines deleted, 281 lines added → −620 LOC** across 11 files.

---

## 2. Callers migrated

| Caller | Was | Now |
| --- | --- | --- |
| `scripts/smoke-test.ts` | Called `generateProjectBundle(input)` directly; relied on archetype detection to fan out to family/restaurant/clinic/etc. specific copy | Wrapped to synthesize research extractions per call. Bundle generation still exercised across the same set of briefs, but each bundle now flows through the research-driven path. |
| `scripts/test-quality-regression.ts` | Same pattern as smoke; archetype-specific entity-name assertions per USE_CASE | Wrapped to synthesize extractions; coherence check now validates that at least one synthesized entity name appears across DATA_MODEL.md, FUNCTIONAL_REQUIREMENTS.md, and SYSTEM_OVERVIEW.md. |
| `scripts/orchestrator-test-utils.ts` | Called `createArtifactPackage` without research-from | Unchanged — orchestrator gate/score/recovery tests don't depend on entity vocabulary, only on lifecycle/scorecard structure. The library-level "no extractions = generic baseline" path is sufficient. |
| `scripts/mvp-builder-autoresearch.ts` | Imported `USE_CASES` from test-quality-regression and called `createArtifactPackage` without research-from | Unchanged at the source, but its USE_CASES are now exercised through the migrated test-quality-regression harness; autoresearch produces packages on the generic baseline path which is acceptable for its CI-style aggregate scoring. |

---

## 3. `--allow-templated` decision

**Removed entirely** from the CLI surface. The CLI in `scripts/mvp-builder-create-project.ts:main()` now exits with a clear error if `--research-from` is not supplied. The escape-hatch flag and its messaging are gone.

The library function `createArtifactPackage()` still accepts no `extractions` and no `researchFrom` — that path renders the generic `general` baseline. This is reachable only through internal library callers (smoke / quality-regression / orchestrator-test-utils) and is **not** exposed to end users via the CLI. Since the keyword router was deleted, even this internal path no longer produces archetype-specific output; it produces the same generic baseline regardless of brief content. CI and user-facing docs do not depend on it.

**Why removed (not retained as a hidden flag):** the only thing `--allow-templated` ever bought users was archetype-templated copy. With archetype templates deleted, the flag would have routed to identical generic output as just running without it — a misleading affordance. Cleanest to remove.

---

## 4. Behavior intentionally removed

- The 11-archetype keyword router (`detectArchetype()` returning `family-task`, `sdr-sales`, etc.).
- Anti-match veto keywords (e.g. `"no inventory"` rejecting the inventory archetype).
- Per-archetype actor / entity / workflow / risk / integration blueprints in `lib/domain-ontology.ts`.
- "Domain archetype detection" section in FINAL_SCORECARD.md.
- "Archetype low-confidence" warning when keyword-routing picked an archetype with `confidence < 0.4`.
- "Archetype: wrong" semantic-fit warning copy.
- Cross-archetype overlap assertions in smoke-test (e.g. "family vs restaurant phase plans should differ").
- Per-archetype `expectedPhase1Patterns` / `expectedEntitySignals` / `expectedServiceSignals` in test-quality-regression.
- The deprecated `--allow-templated` CLI flag.

---

## 5. Behavior preserved

- The research-driven generation path (`create-project --research-from=<dir>`).
- ResearchExtractions schema validation (`lib/research/schema.ts`).
- The research-token enforcement pack (`lib/generator/research-token-pack.ts`).
- Permission-matrix generation (`lib/generator/permission-matrix.ts`).
- Regulatory-notes generation (`lib/generator/regulatory-notes.ts`).
- The expert rubric (Phase D — `research-depth`, `edge-case-coverage`, `role-permission-matrix`, `regulatory-mapping`, `realistic-sample-data`).
- Audit-exit behavior (`lib/research/audit-exit-runner.ts`, `lib/research/loop.ts`).
- The synthesizer (`scripts/synthesize-research-ontology.ts`) — used by harnesses to produce deterministic extractions from briefs.
- The `DomainArchetype` type alias (kept so existing code branches in `generator.ts` still typecheck; those branches are now dead code because every workspace runs as `'general'`).

---

## 6. Before / after validation table

| Check | Before A3c | After A3c |
| --- | --- | --- |
| `npm run typecheck` | pass | **pass** |
| `npm run smoke` | pass (relied on archetype-templated assertions) | **pass** (research-driven path; archetype-keyword assertions removed) |
| `npm run build` | pass | **pass** |
| `npm run test:quality-regression` | pass (relied on archetype-templated entity names) | **pass** (synthesized-extraction coherence check) |
| `npm run test:audit-exit` | pass | **pass** |
| `npm run test:audit-exit-e2e` | pass (E1: 99/100 first attempt) | **pass** (E1: 99/100 first attempt) |
| `npm run test:release-blocker-regression` | pass | **pass** |
| SDR synthesizer audit (`npm run audit -- --package=…sdr…`) | 99/100 production-ready, research-grounded | **99/100 production-ready, research-grounded** (no expert cap) |

---

## 7. Remaining deprecated / legacy references

The following references survive and are intentionally retained:

- `lib/generator.ts` archetype-specific code branches (`if (context.domainArchetype === 'family-task') …` and `switch (context.domainArchetype)`). These are now **dead code** because `domainArchetype` is always `'general'`. They are kept so the existing type narrowing through the `DomainArchetype` union doesn't error, and so a future targeted cleanup can remove them without entangling the A3c diff. Roughly ≈3,000 lines of code in `generator.ts` are now unreachable; deleting them is a follow-up task tracked separately.
- `lib/types.ts:ArchetypeDetectionSummary` — kept as the bundle-surface type. Always populated with the constant `NEUTRAL_ARCHETYPE_DETECTION` value; the manifest still emits it for backward compatibility with consumers that read `repo/manifest.json#archetypeDetection`.
- Historical reports under `docs/` (`PHASE_B_*`, `PHASE_D_*`, `A4_REAL_RECIPE_EXECUTION_REPORT.md`, `RESEARCH_DRIVEN_PLAN.md`) keep their original archetype mentions. They are historical narrative, not user-facing copy.

---

## 8. Recommendation for release-candidate rebaseline

Proceed to release-candidate rebaseline. The research-driven path is the only path the CLI exposes; the audit-exit criterion is documented and tested; SDR synthesizer audit confirms production-ready quality; both audit-exit unit and end-to-end tests pass. The follow-up deletion of the dead archetype branches in `lib/generator.ts` is not on the release-blocker path — those branches are unreachable and harmless as dead code.
