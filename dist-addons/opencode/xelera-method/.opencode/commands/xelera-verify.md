# /xelera-verify

## Purpose
Review implementation against the current phase brief, entry gate, exit gate, test plan, changed files, manifest, blockers, and verification checklist.

## When to use
- After completing implementation
- Before creating a handoff summary
- When preparing for phase transition

## Files to read
- Current phase `PHASE_BRIEF.md`
- Current phase `ENTRY_GATE.md`
- Current phase `EXIT_GATE.md`
- Current phase `TEST_PLAN.md`
- Current phase `HANDOFF_SUMMARY.md`
- Current phase `EVIDENCE_CHECKLIST.md`
- `repo/manifest.json`
- `repo/xelera-state.json`
- Changed implementation files

## What to do
1. Compare implementation against phase brief and gates.
2. Review test plan execution.
3. Check for unresolved blockers.
4. Complete the evidence checklist.
5. Fill out `VERIFICATION_REPORT.md` with:
   - Implementation summary
   - Files changed
   - Commands run
   - Tests passed/failed
   - Exit gate result
   - Unresolved issues
   - Reviewer recommendation (proceed, revise, blocked)

## What not to do
- Do not approve a phase that fails exit criteria.
- Do not ignore test failures.
- Do not skip the evidence checklist.

## Success criteria
- Verification report is complete.
- Evidence checklist is checked.
- Recommendation is clear and honest.
