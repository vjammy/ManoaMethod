# RUN_REGRESSION

Procedure for running the regression suite. Apply to either a generated package or the MVP Builder source repo.

## When to run
- Before a major commit that touches `lib/generator.ts`, `lib/orchestrator/`, or any `scripts/mvp-builder-*.ts`.
- Before requesting a phase advance.
- Before recording an approval decision.
- After picking up a fresh clone, to verify the workspace is healthy.

## Steps

1. **Bootstrap commands** (once per checkout):
   - `npm install`
   - Confirm `node --version` is 20 or higher.

2. **Static checks**:
   - `npm run typecheck`
   - `npm run build`

3. **Smoke and regression** (fast):
   - `npm run smoke`
   - `npm run test:quality-regression`
   - `npm run test:release-blocker-regression`

4. **Repo-level regression suite** (this script):
   - `npm run regression`

5. **Per-package regression** (if validating a generated package):
   - `npm run regression -- --package=<package-root>`

6. **Record results** in `REGRESSION_RESULTS_TEMPLATE.md` (copy the file and fill it out).

## Pass / fail rules

- A run **passes** only when every command above exits 0 and no check is recorded as `FAIL` in the results template.
- The release gate is allowed to surface `BUILD PASS / RELEASE NOT APPROVED` (the canonical approval-only failure mode); this is **not** a regression. Multiple gate failures, or release-gate failures for any reason other than canonical approval blockers, are real failures.
- Do not mark the suite as passing if any check is left as `pending`.

## Where to record results
Copy `REGRESSION_RESULTS_TEMPLATE.md` to a dated file under `regression-suite/results/` (or include the filled template in the relevant phase verification report) and commit the result alongside the change that triggered the run.
