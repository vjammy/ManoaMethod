# MVP Builder Methodology

## What MVP Builder Is

MVP Builder is a markdown-first project planning and execution discipline for AI-assisted builds.

It is designed for situations where a team has:

- a rough set of requirements
- one or more AI coding tools
- a need to move quickly without losing clarity

The method turns that rough input into a local workspace that contains:

- a project brief
- a scoped phase plan
- entry and exit gates
- testing and verification files
- evidence requirements
- handoff records

The goal is not just to generate documentation. The goal is to create a build system that another person or agent can trust without needing hidden chat context.

## The Core Promise

MVP Builder tries to make every important question explicit before or during the build:

- What are we trying to build?
- Who is it for?
- What is in scope for this release?
- What is explicitly out of scope?
- What must be true before work starts?
- What must be proven before the phase can advance?
- What evidence supports the claim that the phase passed?
- What does the next builder need to know?

## The Working Philosophy

The repo consistently applies these ideas:

1. Slow down before coding.
2. Keep the plan in files, not in memory.
3. Work one phase at a time.
4. Require proof before progression.
5. Preserve handoff quality as a first-class concern.

## The Six-Stage User Journey

For business users and mixed teams, the method is explained as:

1. Decide
2. Plan
3. Design
4. Build
5. Test
6. Handoff

This is the plain-English layer used in [STEP_BY_STEP_BUILD_GUIDE.md](../STEP_BY_STEP_BUILD_GUIDE.md).

## The Eight-Step Workflow Model

Inside the app and generator logic, the workflow is modeled as:

1. Project brief
2. Mode selection
3. Business questions
4. Technical questions
5. Risk review
6. Phase plan
7. Approval gate
8. Export package

This is the package-generation layer that turns user input into a build-ready workspace.

## The Phase Model

The generated package is phase-based. Each phase is meant to be small enough to reason about and strict enough to verify.

Every phase packet includes:

- `PHASE_BRIEF.md`
- `ENTRY_GATE.md`
- agent build prompt
- `TEST_PLAN.md`
- `TEST_SCRIPT.md`
- `TEST_RESULTS.md`
- `VERIFY_PROMPT.md`
- `EVIDENCE_CHECKLIST.md`
- `VERIFICATION_REPORT.md`
- `EXIT_GATE.md`
- `HANDOFF_SUMMARY.md`
- `NEXT_PHASE_CONTEXT.md`

Each file has a job:

- the brief explains the purpose of the phase
- the entry gate says when it is safe to start
- the test files say how to verify the work
- the evidence checklist says what proof must exist
- the verification report records the decision
- the handoff files preserve continuity

## The Gate Model

MVP Builder treats advancement as something that must be earned, not assumed.

At the phase level:

- the entry gate protects the start of the phase
- the exit gate protects the end of the phase

At the repo or package level, the orchestrator checks:

- entry gate
- implementation gate
- test gate
- regression gate
- evidence gate
- security gate
- release gate
- exit gate

This is important because many projects fail not from one large mistake, but from a pattern of small unverified assumptions.

## The Evidence Model

Evidence is central to the method.

In MVP Builder, a claim like "the phase passed" is not enough. The method expects concrete proof such as:

- changed files
- test output
- screenshots for UI work
- validation logs
- regression results
- report files

The method is intentionally skeptical of vague proof such as:

- "looks good"
- "everything passes"
- "ready to proceed"

If the evidence is generic, missing, contradictory, or not on disk, the phase should not advance.

## The Handoff Model

The method assumes that different people or tools may touch the project over time.

Because of that, it tries to leave behind:

- enough context for the next builder
- enough truth about what changed
- enough honesty about what is still deferred

The handoff is not a status theater document. It is supposed to be operationally useful.

## The Lifecycle States

The package lifecycle is explicitly tracked:

- `Draft`
- `Blocked`
- `ReviewReady`
- `ApprovedForBuild`

This prevents a common failure mode where a project "sounds done" but has no formal readiness signal.

## Why This Method Exists

Most AI-assisted projects break in one or more of these ways:

- the brief is too vague
- requirements are trapped in chat history
- scope keeps expanding
- testing is generic
- phases are marked done without proof
- the next builder cannot tell what actually happened

MVP Builder exists to make those failure modes visible early, not after a broken handoff.

## What MVP Builder Is Not

MVP Builder is not:

- a hosted product platform
- a replacement for product judgment
- a guarantee that the resulting software is safe to ship
- a substitute for real review

It is a discipline and documentation system that improves the odds of a clean build and a trustworthy handoff.
