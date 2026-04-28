# PHASE_PACKET_TEMPLATE

## Structure

```
phases/phase-XX/
  PHASE_BRIEF.md
  ENTRY_GATE.md
  EXIT_GATE.md
  TEST_PLAN.md
  OPENCODE_BUILD_PROMPT.md
  VERIFY_PROMPT.md
  VERIFICATION_REPORT.md
  EVIDENCE_CHECKLIST.md
  HANDOFF_SUMMARY.md
  NEXT_PHASE_CONTEXT.md
```

## PHASE_BRIEF.md

- Phase name and goal
- Why this phase exists
- Files to give the coding AI
- Output to expect
- Project-specific anchors
- Assumptions and open questions

## ENTRY_GATE.md

- Phase name
- Entry criteria
- What to do if the gate fails

## EXIT_GATE.md

- Phase name
- Exit criteria
- Required evidence

## TEST_PLAN.md

- Tests to run
- Expected output
- Pass/fail criteria

## OPENCODE_BUILD_PROMPT.md

- Files to give OpenCode
- Prompt to paste
- Expected output
- Tests to run
- Files that should change
- Handoff summary to request

## VERIFY_PROMPT.md

- Files to provide
- Prompt for review
- Expected output

## VERIFICATION_REPORT.md

- Phase name
- Implementation summary
- Files changed
- Commands run
- Tests passed/failed
- Exit gate result
- Unresolved issues
- Reviewer recommendation

## EVIDENCE_CHECKLIST.md

- Required files reviewed
- Required commands run
- Expected artifacts produced
- Exit criteria confirmed
- Known limitations recorded
- Handoff summary completed
- Next phase context updated

## HANDOFF_SUMMARY.md

- Phase outcome
- Implementation files changed
- Tests run
- Exit gate status
- Remaining blockers or warnings
- Assumptions that still need confirmation

## NEXT_PHASE_CONTEXT.md

- Current phase
- Next phase
- What the next phase should inherit
- What the next builder should request
```
