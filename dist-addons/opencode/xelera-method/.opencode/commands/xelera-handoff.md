# /xelera-handoff

## Purpose
Create a compact handoff summary after implementation or review.

## When to use
- After completing a phase
- Before moving to the next phase
- When transferring work to another agent

## Files to read
- Current phase `PHASE_BRIEF.md`
- Current phase `EXIT_GATE.md`
- Current phase `TEST_PLAN.md`
- Current phase `VERIFICATION_REPORT.md`
- `repo/xelera-state.json`

## Files to edit
- Current phase `HANDOFF_SUMMARY.md`
- Current phase `NEXT_PHASE_CONTEXT.md`
- `repo/xelera-state.json`

## What to do
1. Summarize what changed in this phase.
2. List implementation files touched.
3. Record test results.
4. Note remaining risks and assumptions.
5. State whether the exit gate passed.
6. Update `HANDOFF_SUMMARY.md`.
7. Update `NEXT_PHASE_CONTEXT.md` with what the next phase needs.
8. Update `repo/xelera-state.json` with current status.

## What not to do
- Do not create a handoff without verification.
- Do not omit test results.
- Do not claim the exit gate passed if it did not.

## Success criteria
- Handoff summary is complete and honest.
- Next phase context is updated.
- State file reflects current status.
