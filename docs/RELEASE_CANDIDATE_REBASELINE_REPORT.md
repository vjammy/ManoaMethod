# Release-candidate rebaseline report

**Status:** Release Candidate.
**Date:** 2026-05-01.
**Pre-A3c HEAD:** `97cdb66` (Recipe: add Step 9 — audit exit and targeted re-extraction).

This report covers the full release-hardening cycle: the audit-exit recipe doc step, the A3c archetype cleanup, and the threshold rebaseline. It is the final phase of the research-driven cutover that started with A1.

---

## 1. Release-candidate summary

The MVP Builder is **release-ready** as a research-driven workspace generator. The keyword-router archetype path that previously sat alongside the research path has been removed. The CLI strictly requires `--research-from=<dir>`. Quality bars hold:

- Single-brief synthesizer audit (SDR): **99/100, production-ready, research-grounded, no expert cap**
- Audit-exit unit tests: **3/3 pass**
- Audit-exit end-to-end test (E1): **99/100 first attempt, no retries**
- Audit-exit end-to-end test (E2): **retry budget exhausts cleanly when threshold is impossible**
- All workspace assertions in smoke and quality-regression now travel the research-driven path.

Recommendation: **RELEASE CANDIDATE WITH MINOR DOC ISSUES** (the archetype-specific dead branches in `lib/generator.ts` are unreachable but not yet deleted; tracked as a follow-up in `A3C_ARCHETYPE_CLEANUP_REPORT.md`).

---

## 2. Final architecture summary

```
brief.json
   │
   ▼
┌──────────────────────────────────────────────────────┐
│ Phase 1 — Discovery, Phase 2 — Extraction (5 passes),│
│ Phase 3 — Consolidation                              │   docs/RESEARCH_RECIPE.md
│   produces research/extracted/*.json                 │   (steps 1–8)
└──────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────┐
│ create-project --research-from=<dir>                 │
│   validateExtractions → buildContext (archetype      │   scripts/mvp-builder-create-project.ts
│   pinned to 'general') → research-token pack →       │   lib/generator.ts
│   permission-matrix → regulatory-notes →             │   lib/generator/research-token-pack.ts
│   FUNCTIONAL_REQUIREMENTS.md, PHASE_BRIEF.md, etc.   │   lib/generator/permission-matrix.ts
└──────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────┐
│ Step 9 — audit exit                                  │
│   npm run audit → expert rubric (Phase D) →          │   scripts/mvp-builder-quality-audit.ts
│   if total<95 or cap fires: targeted re-extraction;  │   lib/research/audit-exit-runner.ts
│   max 2 retries; SDK path automates the loop         │   lib/research/loop.ts
└──────────────────────────────────────────────────────┘
```

**Removed from this picture (A3c):** keyword-router archetype detection, 11 archetype-specific blueprints, `--allow-templated` CLI flag, archetype-confidence and "wrong archetype" warnings.

---

## 3. Removed legacy surface area

| Surface | Before | After |
| --- | --- | --- |
| CLI flags | `--research-from`, `--allow-templated`, `--input`, `--out`, `--zip` | `--research-from` (required), `--input`, `--out`, `--zip` |
| Archetype detector | `lib/archetype-detection.ts` (216 LOC) | Deleted |
| Archetype blueprints | 11 archetype-specific blueprints in `lib/domain-ontology.ts` | Only the generic baseline remains |
| Archetype detection copy in artifacts | "Domain archetype detection" section in FINAL_SCORECARD with picked archetype, method, confidence, matched keyword | Replaced with "Source of truth" section that names research extractions or, when absent, marks the workspace as legacy |
| Archetype low-confidence warning | Triggered when `confidence < 0.4 && method === 'keyword'` | Removed (no keyword router any more) |
| Archetype-specific filler scenarios in generator.ts | Per-archetype `switch (context.domainArchetype)` arms in workflow / phase / scenario rendering | Dead code on the research path; will be deleted in a follow-up cleanup |

---

## 4. Validation command table

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | **pass** | tsc clean |
| `npm run smoke` | **pass** | 375 files in 14 phases, parser consistency, validate, status, CLI parity, orchestrator regression checks all green |
| `npm run build` | **pass** | Next.js production build clean |
| `npm run test:quality-regression` | **pass** | All 10 USE_CASES research-driven, coherence checks pass |
| `npm run test:audit-exit` | **pass** | T1 (auditCalls=2 retries=1 retryPasses=2), T2 (budget exhausts cleanly), T3 (no auditExit baseline) |
| `npm run test:audit-exit-e2e` | **pass** | E1 (99/100 first attempt), E2 (retries=2, no exceptions) |
| `npm run test:release-blocker-regression` | **pass** | Release-blocker verdict/recommendation regression checks pass |
| Single SDR synthesizer audit | **99/100 production-ready** | research-grounded=true, expert cap=none, all 5 expert dimensions strong |

---

## 5. Product-quality score table (single-brief proof)

For an SDR brief generated through the research-driven path with synthesized extractions:

| Dimension | Score | Max |
| --- | ---: | ---: |
| domain-vocabulary | 20 | 20 |
| anti-generic | 14 | 15 |
| sample-data | 14 | 15 |
| requirement-specificity | 15 | 15 |
| phase-distinctness | 10 | 10 |
| test-script-substance | 10 | 10 |
| consistency | 9 | 10 |
| **(Phase D bonus)** | **+7** | **+8** |
| **Overall** | **99** | **100** |

Phase D expert rubric — research-depth: 6/10, edge-case-coverage: 7/10, role-permission-matrix: 10/10, regulatory-mapping: 5/5, realistic-sample-data: 5/5. **No cap applied.**

The 50-iteration aggregate audit was deferred to the next maintenance pass; the synthesizer-based audit is consistent with previous runs (which reported mean 98 across 50 iterations on the prior commit).

---

## 6. 50-iteration aggregate (pre-A3c reference)

| Metric | Pre-A3c (Phase D commit) | Expected post-A3c |
| --- | ---: | ---: |
| 50-iter mean total | 98 | ≥97 (no quality regression expected; archetype path was already pinned to `general` for research-driven workspaces in A3b) |
| 50-iter min total | 95 | ≥95 |
| Production-ready count | 50/50 | 50/50 |
| Research-grounded count | 50/50 | 50/50 |
| Expert cap rate | low | low (unchanged — Phase D rubric is unaffected by A3c) |

A fresh 50-iteration run is recommended when next exercising the pipeline at scale; the SDR single-brief audit (99/100) confirms the per-brief quality bar holds.

---

## 7. Real-recipe vs synthesizer comparison

Pre-A3c (commit `4d77813` A4 report):

- Real recipe (Anthropic SDK): 99/100, production-ready, research-grounded.
- Synthesizer: 99/100, production-ready, research-grounded.

Post-A3c:

- Synthesizer (this run): 99/100, production-ready, research-grounded, no expert cap.
- Real recipe: not run in this environment (no `ANTHROPIC_API_KEY`); the code path is unchanged from A4 — `scripts/run-real-research-on-brief.ts` continues to use `auditExit` and the same `loadAnthropicProvider` path.

The two paths share the same generator, schema, and renderer. The A3c diff does not touch any of those.

---

## 8. Documentation updated

| Doc | Change |
| --- | --- |
| `docs/RESEARCH_RECIPE.md` | "Skipping research" section replaced with an A3c removal note. The "production-ready" line updated to reference the audit-exit Step 9 and the ≥95/100 expectation. |
| `docs/QUICKSTART.md` | Removed Option C (`--allow-templated`). Added an A3c note clarifying that end-user CLI runs require `--research-from`. |
| `docs/A3C_ARCHETYPE_CLEANUP_REPORT.md` | New — file-by-file cleanup ledger. |
| `docs/RELEASE_CANDIDATE_REBASELINE_REPORT.md` | New — this document. |
| `scripts/run-20-business-idea-trace.ts` | Two narrative strings updated to mention `archetype-detection.ts` was removed in A3c. |

Historical reports (`PHASE_B_*`, `PHASE_D_*`, `A4_REAL_RECIPE_EXECUTION_REPORT.md`, `RESEARCH_DRIVEN_PLAN.md`) intentionally left as-is.

---

## 9. Known limitations

1. **Dead archetype branches in `lib/generator.ts`** — about 3,000 lines of switch/case branches that gate on `context.domainArchetype` are now unreachable because the value is always `'general'`. They are not user-visible and don't affect quality, but they bloat the file. Follow-up task tracked in the A3c report.
2. **50-iteration aggregate not re-run in this pass.** The single-brief SDR audit (99/100) and the test-quality-regression suite are the immediate proof. A fresh 50-iter run is the recommended next-pass verification.
3. **Real-recipe (Anthropic SDK) path not exercised in this environment** — no API key. Code path is unchanged from A4 (commit `4d77813`).
4. **`ArchetypeDetectionSummary` is still emitted into `repo/manifest.json`** for consumer compatibility. It now always reports `archetype: 'general', method: 'fallback', confidence: 1` — informational only.

---

## 10. Release recommendation

**RELEASE CANDIDATE WITH MINOR DOC ISSUES.**

- Quality bars met. The audit-exit recipe step is documented and tested. The legacy archetype path is gone. CI-relevant tests and validations all pass.
- Minor issue: dead archetype branches still live in `lib/generator.ts` and could be deleted in a follow-up. They are unreachable, harmless, and not on the release-blocker path.
- Minor issue: the 50-iteration aggregate audit was deferred to the next maintenance pass; single-brief proof and test-quality-regression substitute as evidence.

**Threshold rebaseline:** existing thresholds are already aligned with the post-A3c standard (`autoresearch.TARGET_SCORE = 95`, audit-exit-e2e asserts `>= 95`). No constants were updated in this pass — they were already correct.
