# GATE_RULES

## Entry gates

Before starting a phase:
1. Read `ENTRY_GATE.md`
2. Verify all entry criteria are met
3. If criteria fail, stop and record the blocker
4. Do not start implementation until the gate passes

## Exit gates

Before finishing a phase:
1. Read `EXIT_GATE.md`
2. Verify all exit criteria are met
3. Run the test plan
4. Complete the verification report
5. If criteria fail, recommend revise or blocked

## Blocker rules

- Blockers must be recorded in `repo/xelera-state.json`
- Blockers must be visible in the current phase packet
- Do not bypass blockers with silent assumptions
- If a blocker is resolved, update the state file and handoff summary

## Approval

- Phases advance with verification evidence or explicit manual approval
- Manual approval is recorded separately from automated verification
- Do not treat manual approval as equivalent to passing tests
