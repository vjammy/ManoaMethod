# SECURITY_REVIEW

## Scope
This review covers the MVP Builder source repo itself: the generator (`lib/generator.ts`), the orchestrator (`lib/orchestrator/`), the CLI scripts (`scripts/`), and the Next.js UI under `app/`. It does **not** cover generated downstream packages — each generated package gets its own `SECURITY_REVIEW.md` produced by the generator and is reviewed in isolation.

## Product risk context
- Local-first runtime: the MVP Builder runs from a developer workstation with Node 20+ and `tsx`. There is no hosted backend, no database, no auth provider, and no paid SaaS dependency in the approved scope.
- Inputs are markdown / JSON files written by the developer or extracted from `examples/`. Outputs are markdown / JSON files written under the workspace root or a temp dir.
- Operator-supplied inputs can flow into generated artifacts; the operator is the sole consumer of those artifacts.

## Review areas

### Secret handling
- The repo does not request, store, or transmit secrets in any code path.
- No credential, API key, or token is read from the environment at runtime; the only env vars the orchestrator reads are paths (`MVP_BUILDER_REPORT_ROOT`) and `INIT_CWD`.
- `autoresearch/results.tsv` and per-run reports under `orchestrator/runs/` may contain command stdout/stderr; reviewers should redact secrets before sharing externally.

### Filesystem writes
- All writes are confined to the repo root, the workspace root passed via `--package=<dir>`, the OS temp dir (for tests), and `.tmp/` (gitignored).
- No writes target absolute paths outside the workspace.

### Command execution
- `runProjectCommands` (`lib/orchestrator/commands.ts`) only spawns commands whose names match `^[a-z0-9:-]+$` (enforced by `runOrchestratorRegressionChecks`). Operator-supplied scripts are validated by name shape before spawn.
- Spawned commands run with `shell: process.platform === 'win32'`. On Windows the deprecation warning DEP0190 surfaces; arguments are static `npm run <name>` invocations rather than operator-controlled strings, so the shell-mode use is bounded.

### Release evidence authenticity
- Release evidence is rendered into FINAL_* markdown reports by `scripts/mvp-builder-finalize-repo-release.ts`. The release gate (`lib/orchestrator/gates.ts:274`) refuses to pass while `FINAL_RELEASE_REPORT.md` is a generated pending shell, so a release cannot be silently approved without explicit content.
- `manifest.approvedForBuild` and `lifecycleStatus=ApprovedForBuild` must be set explicitly — there is no automated path that can promote the lifecycle without a recorded approval decision.

### Orchestrator gate coverage and release-blocker semantics
- The orchestrator distinguishes BUILD_READY from RELEASE_READY. A package can score 96/100 with verdict `PASS WITH RELEASE BLOCKER` and recommendation `BUILD PASS / RELEASE NOT APPROVED` when the only failing gate is the release gate failing for the canonical approval-only criteria. This is enforced by `scripts/test-release-blocker-regression.ts`.
- Multiple gate failures, or release-gate failures for any reason other than the canonical approval-only set (`Lifecycle state is synchronized`, `Final reports are repo-specific`), keep the verdict at `FAIL`.

## Security release checks
- No hosted auth or database assumptions are required for the approved scope.
- Secret-handling guidance is encoded in this file and in generated packages' `security-risk/SECRET_MANAGEMENT.md`.
- Release docs (FINAL_*) do not claim hosted capabilities the build does not actually support; the release gate enforces this by refusing pending shells.

## Known caveats
- The repo's `regression-suite/` dev docs are tracked but `regression-suite/results/` runs are operator-authored and are not auto-validated.
- Operator can still bypass next-phase by hand-editing `repo/mvp-builder-state.json`. The exit gate detects bypassed approvals and triggers the 69-point hard cap; it does not prevent the edit.

## Result
Pass for the approved local-first scope. Re-review is required when adding any hosted runtime, paid SaaS dependency, auth provider, or external API call.
