# Technical Builder Workflow

## Who This Is For

This guide is for engineers, technical PMs, and AI-assisted builders working directly in the repo or in a generated Manoa workspace.

## The Main Rule

Treat the markdown package as executable planning state.

Do not treat it as optional background reading. The method depends on the builder following the package structure rather than improvising from memory.

## Builder Priorities

Your priorities are:

- preserve scope discipline
- keep implementation inside the current phase
- produce real test evidence
- keep state, reports, and handoff aligned

## The Minimal Builder Loop

1. Read the root context files.
2. Open the current phase packet.
3. Confirm the entry gate.
4. Implement only the current phase.
5. Run the current phase test script.
6. Fill test results and verification.
7. Run validation and status.
8. Advance only if the evidence supports pass/proceed.

## Files To Read First

In a generated workspace, start with:

1. `START_HERE.md`
2. `CURRENT_STATUS.md`
3. `00_PROJECT_CONTEXT.md`
4. `01_CONTEXT_RULES.md`
5. `PROJECT_BRIEF.md`
6. `PHASE_PLAN.md`
7. the current phase folder

Then read the agent-specific start file if you are operating through Codex, Claude Code, or OpenCode.

## The Technical Meaning Of The Phase Packet

Each phase packet gives you:

- purpose
- prerequisites
- implementation scope
- expected outputs
- verification rules
- evidence requirements
- continuity requirements

If you skip the packet and just start coding, you are bypassing the method.

## Technical Guardrails

### Stay inside the phase

Do not implement future-phase ideas because they feel adjacent.

### Do not treat file creation as proof

The existence of files does not mean the work passed.

### Prefer concrete evidence

Good evidence:

- command output
- changed files
- report files
- screenshots
- test results

Bad evidence:

- generic summaries
- unverified claims
- empty templates

### Keep lifecycle state consistent

The repo expects consistency across:

- `repo/manoa-state.json`
- `repo/manifest.json`
- current status and final reports

### Respect local-first constraints

This repo is opinionated about not inventing hosted complexity without approval. Do not casually add:

- auth
- databases
- hosted backends
- paid integrations

unless the scope explicitly changed.

## Commands You Will Use Most

Install and sanity check:

```bash
npm install
npm run typecheck
npm run build
```

Generate a package:

```bash
npm run create-project -- --input=examples/family-task-app.json --out=.tmp-family-task-app --zip=true
```

Inspect package status:

```bash
npm run status -- --package=.tmp-family-task-app/manoa-method-workspace
```

Validate package integrity:

```bash
npm run validate -- --package=.tmp-family-task-app/manoa-method-workspace
```

Advance a phase after verification:

```bash
npm run next-phase -- --package=.tmp-family-task-app/manoa-method-workspace --evidence=phases/phase-01/VERIFICATION_REPORT.md
```

Run orchestrator checks:

```bash
npm run orchestrate
npm run score
npm run gates
npm run recover
```

## When To Use The Orchestrator

Use the orchestrator when you want a repo-level assessment of:

- command coverage
- gate health
- evidence quality
- score and cap logic
- recovery direction

Do not confuse orchestrator output with implementation output. It evaluates repo and package health. It does not replace the actual phase build.

## What A Strong Technical Handoff Looks Like

A strong handoff tells the next builder:

- what changed
- what was verified
- what still hurts
- what remains deferred
- what to read next

The best technical handoff reduces guesswork rather than narrating effort.

## Failure Patterns To Avoid

- building across multiple phases at once
- changing state files without corresponding evidence
- writing pass/proceed while tests are still pending
- leaving generic verification prose
- silently changing scope in code without changing the docs

## Definition Of Done For A Phase

A phase is only done when:

- the phase deliverables exist
- the exit gate is satisfied
- test results are recorded
- verification result and recommendation are valid
- evidence files are real
- handoff and next-phase context are updated

That is a higher bar than "the code compiles," and that is intentional.
