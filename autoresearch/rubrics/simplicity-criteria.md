# Simplicity Criteria

The MVP Builder is local-first, markdown-first, and intentionally small. The autoresearch program enforces that by treating overbuild as a quality regression, not a feature.

This document describes what counts as "too much" and how the program detects it.

## Core principle

The generator should produce a package that:

- Plans the smallest valuable v1.
- Defers anything that is not required to prove the primary workflow.
- Does **not** invent infrastructure (databases, hosted backends, message buses, multi-region, dashboards) when the input did not ask for them.
- Does **not** push the user toward auth, payments, or analytics services that the MVP Builder explicitly disclaims providing.

A package that adds these things can look impressive but makes the build harder and the handoff longer.

## Detection rules

There are two complementary checks:

### 1. Rubric points (max 5)

In `scoreUseCase`, the simplicity category awards 5 points when both of these hold:

- The architecture file (`architecture/SYSTEM_OVERVIEW.md`) does not mention any of: `microservices`, `kubernetes`, `multi-region`, `background workers`, `hosted backend` — outside of a "no / not / without / avoid" context. (3 pts)
- The auto-improve program (`auto-improve/PROGRAM.md`) includes the phrase "Do not add hosted services, auth, databases, dashboards, background workers". (2 pts)

### 2. Hard cap at 89

If the architecture file mentions any of `microservices | kubernetes | event bus | multi-region | dashboard`, the use case is capped at **89** regardless of rubric score. See [hard-caps.md](hard-caps.md).

The cap fires even if the words appear positively, because the smoke test asserts the simpler shape elsewhere and a positive mention is a signal that the generator drifted.

## Allowed mentions

Mentioning these terms is fine when the context is explicitly "we will not do this":

- "No hosted backend in v1."
- "Kubernetes is not in scope."
- "Avoid microservices for the MVP."

The rubric and cap recognize negative contexts; positive recommendations or assumptions are what trigger the regression.

## What "simple" means in practice

For an MVP Builder-generated package, simple means:

- Local-first: runs from a folder of markdown plus a small script harness.
- Markdown-first: planning, gates, evidence, and handoff are markdown files, not a database.
- Single-process: no event bus, no separate worker tier, no message queue.
- One environment: no multi-region or staging/prod parity discussion in v1.
- No surprise auth / payments / analytics: the MVP Builder does not provide these and should not pretend to.

If a real product needs these, that is a project concern handled by the implementing team — the *plan* should not assume them.

## How this rule interacts with the testing layer

Simplicity does not mean "skip testing." The package must still include:

- `regression-suite/`
- `recursive-test/`
- per-phase `TEST_SCRIPT.md` and `TEST_RESULTS.md`
- a project-wide `REGRESSION_TEST_PLAN.md`

These are markdown artifacts, not infrastructure. They make the package safer without adding deployment surface.

## Why this rule exists

In the MVP Builder's first months, several generator "improvements" added complexity that:

- Made the planning package longer without making it more useful.
- Inserted infrastructure assumptions that did not match the input.
- Pushed beginners toward stacks they could not maintain.
- Implied features (auth, payments, dashboards) that the MVP Builder explicitly disclaims.

The simplicity criteria exist to keep that drift visible and gated.
