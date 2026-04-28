# /xelera-next

## Purpose
Move to the next phase only when exit criteria, verification evidence, and handoff requirements are satisfied.

## When to use
- After completing verification and handoff
- When the current phase is truly done

## Files to read
- Current phase `VERIFICATION_REPORT.md`
- Current phase `EVIDENCE_CHECKLIST.md`
- Current phase `HANDOFF_SUMMARY.md`
- `repo/xelera-state.json`
- `repo/manifest.json`

## What to do
1. Verify the current phase has a completed handoff summary.
2. Verify verification evidence exists.
3. Check that the verification recommendation is `proceed`.
4. Check that the exit gate result is `pass`.
5. If evidence is insufficient, require `--approve=true` for manual override.
6. Update `repo/xelera-state.json` with the new current phase.
7. Record the phase transition in completedPhases.

## What not to do
- Do not advance without evidence or approval.
- Do not advance if verification says `revise` or `blocked`.
- Do not skip the handoff summary.

## Success criteria
- Phase advances only with valid evidence or explicit manual approval.
- State file is updated correctly.
- Previous phase is recorded as complete.

## CLI usage
```bash
npm run next-phase -- --package=./output --evidence=phases/phase-01/VERIFICATION_REPORT.md --handoff="Phase complete."
# or
npm run next-phase -- --package=./output --approve=true --handoff="Manual approval."
```
