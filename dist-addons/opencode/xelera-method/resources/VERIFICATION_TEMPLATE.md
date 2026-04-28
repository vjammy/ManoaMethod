# VERIFICATION_TEMPLATE

## When to verify

After completing implementation for a phase, before creating the handoff summary.

## Verification report

Fill out `VERIFICATION_REPORT.md`:

```markdown
# VERIFICATION_REPORT

## Phase name
[Name]

## Implementation summary
- [Summary]

## Files changed
- [File 1]
- [File 2]

## Commands run
- [Command 1]
- [Command 2]

## Tests passed
- [Test 1]

## Tests failed
- [Test 2] — [Reason]

## Exit gate result
Selected result: pass

## Unresolved issues
- [Issue 1]

## Reviewer recommendation
Selected recommendation: proceed
```

## Evidence checklist

Check all items in `EVIDENCE_CHECKLIST.md`:

- [ ] Required files reviewed
- [ ] Required commands run
- [ ] Expected artifacts produced
- [ ] Exit criteria confirmed
- [ ] Blockers reviewed
- [ ] Known limitations recorded
- [ ] Handoff summary completed
- [ ] Next phase context updated

## Recommendation rules

- **proceed**: exit gate passes, tests pass, no unresolved blockers
- **revise**: exit gate fails or tests fail, but work can be corrected
- **blocked**: fundamental blockers prevent phase completion

## Advancing

Use `/xelera-next` with evidence:
```bash
npm run next-phase -- --package=./output --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

Or with manual approval:
```bash
npm run next-phase -- --package=./output --approve=true
```
