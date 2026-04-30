# REGRESSION_CHECKLIST

Use this checklist on every regression run. Mark each item explicitly.

## Static checks
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` exits 0.

## Smoke / quality
- [ ] `npm run smoke` exits 0 with no skipped assertions.
- [ ] `npm run test:quality-regression` exits 0 with no skipped use cases.
- [ ] `npm run test:release-blocker-regression` exits 0 (verifies BUILD PASS / RELEASE NOT APPROVED semantics).

## Regression-suite docs
- [ ] `regression-suite/README.md` exists and is repo-specific (not a pending shell).
- [ ] `regression-suite/RUN_REGRESSION.md` exists and is repo-specific.
- [ ] `regression-suite/REGRESSION_CHECKLIST.md` exists (this file).
- [ ] `regression-suite/REGRESSION_RESULTS_TEMPLATE.md` exists.
- [ ] `regression-suite/scripts/run-regression.ts` exists.

## Repo-level regression
- [ ] `npm run regression` exits 0.
- [ ] Output reports zero `FAIL` lines.

## Orchestrator gate coherence
- [ ] `npm run gates` runs and writes `orchestrator/reports/GATE_RESULTS.md`.
- [ ] `npm run score` runs and writes `orchestrator/reports/OBJECTIVE_SCORECARD.md`.
- [ ] Verdict and Recommendation in `OBJECTIVE_SCORECARD.md` agree (PASS↔PASS, PASS WITH RELEASE BLOCKER↔BUILD PASS / RELEASE NOT APPROVED, FAIL↔FAIL).

## Release-approval semantics
- [ ] If release gate fails, the only failed criteria are in the canonical `RELEASE_APPROVAL_BLOCKER_LABELS` set (`Lifecycle state is synchronized`, `Final reports are repo-specific`).
- [ ] When release gate fails for the canonical reasons, scorecard verdict is `PASS WITH RELEASE BLOCKER` and recommendation is `BUILD PASS / RELEASE NOT APPROVED`. Both must agree; neither may be plain `PASS`.
- [ ] Multi-gate failures or release-gate failures for non-approval reasons must keep verdict `FAIL`.

## Local-first / markdown-first guarantees
- [ ] No new dependency on a hosted backend, database, auth provider, or paid SaaS in this change.
- [ ] All new artifacts are markdown or code under existing directories (no binary assets, no opaque blobs).
- [ ] `autoresearch/results.tsv` (when present) starts with the canonical header row and is append-only.
