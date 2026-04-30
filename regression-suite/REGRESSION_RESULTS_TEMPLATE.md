# REGRESSION_RESULTS

Copy this file to `regression-suite/results/<YYYY-MM-DD>-<short-description>.md` (or attach to the relevant phase verification report) and fill out every section before committing.

## Run metadata
- Date: pending
- Operator: pending
- Branch / commit: pending
- Trigger (commit, PR, phase advance, release): pending

## Static checks
- npm run typecheck: pending
- npm run build: pending

## Smoke / quality
- npm run smoke: pending
- npm run test:quality-regression: pending
- npm run test:release-blocker-regression: pending

## Repo-level regression
- npm run regression: pending
- Output passed / failed counts: pending

## Orchestrator gate coherence
- entry gate: pending
- implementation gate: pending
- test gate: pending
- regression gate: pending
- evidence gate: pending
- security gate: pending
- release gate: pending
- exit gate: pending
- Verdict: pending
- Recommendation: pending
- Verdict ↔ Recommendation agreement check: pending

## Release-approval semantics
- Did the release gate fail? pending
- If yes, list each failed criterion: pending
- All failed criteria are canonical approval blockers? pending
- Verdict matches `PASS WITH RELEASE BLOCKER` when applicable? pending

## Local-first / markdown-first guarantees
- No new hosted-backend dependency: pending
- No new database / auth provider / SaaS dependency: pending
- All new artifacts are markdown or code: pending

## Final result: pending
Allowed: pass | fail | pending. Do not select `pass` until every line above is filled in with a real result.

## Notes / follow-ups
- pending
