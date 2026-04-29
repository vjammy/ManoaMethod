# Best Practices

## Purpose

This document explains the practices Manoa Method is trying to enforce and how the repo implements them.

The useful question is not just "what files are in the package?" The useful question is "what good engineering and product habits are these files protecting?"

## 1. Keep One Source Of Truth

Best practice:

- A project should have one canonical set of planning and execution artifacts.

Why it matters:

- Teams lose time when the brief lives in one place, the scope in another, and the real decisions only in chat.

How Manoa implements it:

- The generated markdown workspace is the source of truth.
- The handoff docs explicitly tell builders not to rely on hidden chat context.
- `repo/manoa-state.json` tracks state in files rather than memory.

## 2. Separate Decision-Making From Execution

Best practice:

- Strategy documents and implementation documents should not be mashed together.

Why it matters:

- Business users need clarity on scope and risk.
- Builders need concrete instructions, boundaries, and tests.

How Manoa implements it:

- Business-oriented guidance lives in files like `BUSINESS_USER_START_HERE.md` and `STEP_BY_STEP_BUILD_GUIDE.md`.
- Execution guidance lives in the phase packets and technical support folders.

## 3. Work In Phases

Best practice:

- Large builds should be broken into ordered phases with explicit transitions.

Why it matters:

- Phase-based work reduces ambiguity, contains scope, and makes review easier.

How Manoa implements it:

- Every package is generated with a sequenced phase plan.
- Each phase gets its own folder, gate pair, test files, and handoff files.

## 4. Require Entry Gates

Best practice:

- A phase should not start unless prerequisites are explicit.

Why it matters:

- Many teams waste time building against unclear requirements or missing dependencies.

How Manoa implements it:

- Every phase includes `ENTRY_GATE.md`.
- The start files and rules repeatedly instruct the builder not to skip entry gates.

## 5. Require Exit Gates

Best practice:

- A phase should not be called done just because code was written.

Why it matters:

- Without an exit gate, "done" usually means "someone stopped working on it."

How Manoa implements it:

- Every phase includes `EXIT_GATE.md`.
- Verification and state progression depend on a real pass/proceed decision.

## 6. Make Evidence Mandatory

Best practice:

- Completion should be backed by concrete evidence, not confidence language.

Why it matters:

- Agent output is not proof.
- Builder optimism is not proof.

How Manoa implements it:

- `EVIDENCE_CHECKLIST.md` and `VERIFICATION_REPORT.md` are required.
- Validation scripts reject placeholder or generic evidence.
- `next-phase` refuses advancement without real evidence files.

## 7. Make Pass And Fail Explicit

Best practice:

- Verification results should use a small, controlled vocabulary.

Why it matters:

- Soft language creates loopholes.

How Manoa implements it:

- The repo expects values like `pass`, `fail`, `pending`, `proceed`, `revise`, and `blocked`.
- Validation scripts check for contradictions between the report body and the selected result.

## 8. Define Scope Cuts Early

Best practice:

- Teams should decide what gets deferred before implementation pressure rises.

Why it matters:

- Most AI-assisted projects fail by trying to do too much too early.

How Manoa implements it:

- The questionnaire asks for scope-cut logic.
- Product strategy files separate MVP scope from out-of-scope items.
- Critique logic flags weak scope discipline.

## 9. Treat Handoff As Productive Work

Best practice:

- Handoff should be planned, not improvised at the end.

Why it matters:

- Work is fragile if the next builder has to reconstruct meaning from diffs and chat logs.

How Manoa implements it:

- Every phase includes `HANDOFF_SUMMARY.md` and `NEXT_PHASE_CONTEXT.md`.
- Root docs like `HANDOFF.md`, `FINAL_HANDOFF.md`, and `CURRENT_STATUS.md` preserve continuity.

## 10. Validate The Documentation System Itself

Best practice:

- If documentation structure matters, it should be testable.

Why it matters:

- Otherwise the process quietly rots while everyone assumes it still works.

How Manoa implements it:

- `npm run validate` checks required files, report fields, evidence quality, and cross-file consistency.
- `npm run status` explains the current lifecycle and next action.
- `npm run gates` and `npm run score` assess repo/package readiness.

## 11. Keep The MVP Smaller Than The Architecture

Best practice:

- Architecture should fit the approved scope, not imagined future complexity.

Why it matters:

- Overbuilding is one of the easiest ways to waste time.

How Manoa implements it:

- Validation checks for architecture that is more complex than the stated MVP.
- The docs repeatedly emphasize local-first, markdown-first behavior and explicit non-goals.

## 12. Preserve Agent Portability

Best practice:

- A process should survive tool changes.

Why it matters:

- Teams switch between Codex, Claude Code, OpenCode, and humans.

How Manoa implements it:

- Agent-specific start files are generated for all supported agents.
- The package itself stays stable while the startup instructions vary by tool.

## Summary

Manoa Method is strongest when it is used as a discipline, not just as a prompt library.

Its best-practice model is:

- clarify first
- gate the work
- prove the result
- preserve the handoff

That is the through-line behind almost every file in the repo.
