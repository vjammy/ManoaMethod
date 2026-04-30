# Regression Suite for the MVP Builder Repo

This is the repo-level regression suite for the MVP Builder development source. It is intentionally separate from the per-package regression suite that the generator emits at `regression-suite/` inside each generated package.

## What this suite is for
The MVP Builder generator emits a fresh `regression-suite/` inside every generated package. The orchestrator's regression gate (lib/orchestrator/gates.ts:147) requires the four canonical dev docs to be present at the workspace root. This directory holds the tracked, repo-specific versions used when the orchestrator scans the MVP Builder source tree itself rather than a generated package.

## How to use
- For a *generated package*, run `npm run regression -- --package=<package-root>` and follow `<package-root>/regression-suite/RUN_REGRESSION.md`.
- For the MVP Builder *source repo*, run `npm run regression` from this directory; it auto-targets the bundled example package so the script does not require manual setup.
- Open `RUN_REGRESSION.md` for the canonical procedure, `REGRESSION_CHECKLIST.md` for the audit list, and `REGRESSION_RESULTS_TEMPLATE.md` for recording results.

## What this suite covers
- Repo-level artifact completeness (regression-suite docs, security review, release docs).
- Orchestrator gate coherence (entry, implementation, test, regression, evidence, security, release, exit).
- Release approval semantics — the release gate is allowed to fail with `BUILD PASS / RELEASE NOT APPROVED` until manual production approval is recorded; this is enforced by the release-blocker regression checks (`scripts/test-release-blocker-regression.ts`).
- Local-first / markdown-first guarantees.

## Profile
- Mode: source repo (not a generated package).
- Product: MVP Builder.
- Target audience: developers extending the generator, orchestrator, or scoring logic.
- Phases: tracked phases live in `phases/` after `npm run finalize:release`.
