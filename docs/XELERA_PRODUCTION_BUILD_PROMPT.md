# XELERA_PRODUCTION_BUILD_PROMPT

Use this prompt when the goal is a complete end-to-end production build through Xelera Method, not only package generation or a thin-slice MVP.

```text
You are building this project using Xelera Method in full production mode.

This is not a planning-only run.
This is not a thin-slice MVP run.
This is not a documentation exercise.

Your job is to complete the entire end-to-end Xelera lifecycle and produce a production-ready application, with all required implementation, testing, gates, handoffs, release artifacts, and final state progression completed honestly.

Core rule:
Do not fake implementation, tests, scores, gates, deployment readiness, phase completion, or evidence.
If something cannot be completed, mark it blocked with the exact reason and stop claiming production readiness.

Primary objective:
Build the full application end to end and advance it through the full Xelera Method lifecycle until all required phases are completed and the final release gate passes.

Success is only true if all of the following are true:
1. The real application is fully implemented for the agreed production scope.
2. All required Xelera phases are actually completed, not merely generated.
3. repo/xelera-state.json reflects final lifecycle completion rather than an early planning phase.
4. All required gates pass with real evidence.
5. Tests, regression, security, and release-readiness checks are run and recorded.
6. Final reports, state files, scorecards, and final handoff files all agree.
7. The final recommendation is supported by actual evidence.

Build target:
Production application, not MVP.

Execution rules:
- Read the repo and package state first.
- Use existing Xelera Method structure as the source of truth.
- Touch only what is necessary.
- Preserve unrelated local changes.
- Do not overwrite unrelated worktree changes.
- Do not fake command results.
- Do not leave placeholder reports claiming pass.
- Do not stop after creating a runnable thin slice.
- Do not stop after reaching a high score if required phases are still incomplete.
- Do not mark the build complete unless final lifecycle state, release gate, and handoff are done.

Required delivery standard:
The finished project must be a complete build through the Xelera lifecycle, including:
- planning artifacts
- implementation artifacts
- production architecture
- persistence or data-layer strategy if required
- auth or permissions if required by the product
- real integration strategy where needed
- deployment plan
- environment variable documentation
- test coverage
- regression coverage
- security review
- observability or operations runbook
- rollback or recovery plan
- release handoff
- final operational documentation

Phase enforcement:
For every Xelera phase:
1. Read the phase brief and gates.
2. Implement the actual work required for that phase.
3. Produce real evidence files.
4. Run the required commands.
5. Update verification reports honestly.
6. Update handoff files.
7. Advance the phase state properly.
8. Re-check status before moving on.

You must not merely fill the files.
You must make phase progression real.

Required lifecycle behavior:
- If currentPhase is phase-01, do not leave it there after implementation is done.
- Advance phases only when evidence is real.
- Keep CURRENT_STATUS.md, repo/xelera-state.json, verification reports, and final reports synchronized.
- If there is a contradiction between state and reality, fix the contradiction before continuing.
- Do not allow a final report to say pass while the state file still shows an early phase.

Required production artifacts:
Create and maintain these if missing:
- BUILD_TARGET.md
- APP_OBJECTIVE.md
- PRODUCTION_SCOPE.md
- DEPLOYMENT_PLAN.md
- ENVIRONMENT_SETUP.md
- PRODUCTION_READINESS_CHECKLIST.md
- OPERATIONS_RUNBOOK.md
- INCIDENT_RESPONSE_GUIDE.md
- ROLLBACK_PLAN.md
- DATA_MODEL.md
- SECURITY_REVIEW.md
- PERFORMANCE_PLAN.md
- RELEASE_CHECKLIST.md
- PRODUCTION_GATE.md
- FINAL_RELEASE_REPORT.md
- FINAL_HANDOFF.md
- FINAL_GATE_REPORT.md
- FINAL_SCORECARD.md
- FINAL_RECOVERY_SUMMARY.md
- FINAL_DEPLOYMENT_STATUS.md

Required implementation standard:
Build the actual production-scope app, not a demo shell.

That means:
- complete user-facing workflows
- complete business logic
- complete state or data flow
- complete role or permission handling where applicable
- robust validation and error handling
- meaningful empty states and failure states
- non-placeholder UI for all primary workflows
- production-like configuration and deployment documentation
- support for restart, recovery, and maintenance

Required testing standard:
Add and run real tests for:
- unit behavior
- integration behavior
- user workflow coverage
- regression protection
- failure-path behavior
- validation or error handling
- permissions or role boundaries if applicable
- persistence behavior
- release-critical flows

Required evidence standard:
Every major claim must point to one or more of:
- source files
- command output
- test results
- build output
- screenshots if relevant
- deployment config
- reports
- runbooks
- phase handoff artifacts

Generic prose is not evidence.
A completed checkbox is not evidence.
A PASS header without supporting proof is not evidence.

Required gates:
You must run and document:
- entry gate
- implementation gate
- test gate
- regression gate
- evidence gate
- security gate
- release gate
- exit gate

Production release gate must fail if any of these are missing:
- complete implementation for agreed scope
- documented deployment path
- documented environment configuration
- passing build
- passing tests
- passing regression
- documented operational handoff
- documented rollback plan
- synchronized final state and reports

Scoring rules:
A high score is not enough by itself.
Cap the score if lifecycle completion is incomplete.

Apply these caps:
- if app is only a runnable MVP: max 84
- if required phases are not completed: max 84
- if release gate is not passed: max 79
- if production docs are missing: max 79
- if final state contradicts reports: max 59
- if evidence is fake or generic: max 49

Auto-improvement loop:
If production readiness is not achieved:
1. identify exact failed criteria
2. identify the blocking phase or gate
3. create a recovery plan
4. apply targeted fixes
5. rerun commands
6. rerun gates
7. update state
8. rescore
9. repeat until complete or safely blocked

Stop conditions:
Stop only if one of these is true:
- full production lifecycle is complete
- required external dependency blocks completion
- a critical failure repeats twice with no safe path forward
- further changes would violate the requested architecture or repo safety
- the environment makes required production validation impossible

Required commands:
Run all repo-relevant commands and any app-specific commands needed for production validation.

At minimum run and record:
- npm run typecheck
- npm run build
- npm run test
- npm run smoke
- npm run test:quality-regression
- npm run score
- npm run gates
- npm run status
- npm run validate

If the project has deployment, integration, migration, or e2e commands, run those too.

Required final outputs:
Produce:
- FINAL_RELEASE_REPORT.md
- FINAL_HANDOFF.md
- FINAL_SCORECARD.md
- FINAL_GATE_REPORT.md
- FINAL_RECOVERY_SUMMARY.md
- FINAL_DEPLOYMENT_STATUS.md

Final report must include:
- what was fully built
- what phases were completed
- final lifecycle state
- gates passed or failed
- commands run
- test summary
- deployment or readiness summary
- remaining risks
- exact blockers if not production-ready
- final recommendation: PASS, CONDITIONAL PASS, or FAIL UNTIL FIXED

Most important rule:
Do not confuse “generated Xelera package” with “finished Xelera build.”
Do not confuse “runnable app” with “production-ready app.”
Do not stop until the complete Xelera lifecycle has been executed honestly.
```
