# USER_VALIDATION_RUNBOOK

This runbook is the protocol for putting an mvp-builder-built app in front
of real users for the first time. The premise of "day-1 useful" has been
inferred (audit scores, depth grades, fresh-agent W5 build) but **never
measured against real users**. G5 closes that gap.

This runbook is **prep only**. It documents how to recruit, run a 30-min
test session, and synthesize results — it does *not* execute. Recruitment
and the actual test sessions are the user's responsibility (the engineer
running this repo).

The companion file [`USER_VALIDATION_TEMPLATE.md`](USER_VALIDATION_TEMPLATE.md)
is the per-test capture form.

## Why this matters

Up to this point, the validation chain has been:

1. **Audit / depth-grade** — automated quality signal. Tells us the workspace
   has the right structural depth.
2. **W4 manual recipe runs** — three diverse briefs (clinic, pantry, budget)
   all hit demoReady=true with depth-grade in the deep band. Tells us the
   recipe generalizes.
3. **W5 fresh-agent build** — a general-purpose agent with no priming built
   7/7 workflows + 13+ validation behaviors from the workspace. Tells us the
   workspace is a self-contained build prompt.

What's missing: **a real user who has never seen the system, signing in to
the deployed app and trying to do their actual work.** That's the only
signal that proves "day-1 useful" — anything before it is a proxy.

## Who to recruit

Three users, one each, from the W4 personas:

| User type | Signal we're testing | Where to find them |
|---|---|---|
| 1 SDR (sales development rep) | Conference SDR Hub workflows are realistic for the actual job | Sales orgs in Slack groups, LinkedIn outreach to people whose title is "SDR" / "BDR" / "Sales Development" |
| 1 clinic front-desk staff or medical assistant | Clinic Scheduler intake workflow is realistic | Family / friend networks; local clinic admin staff via personal connections |
| 1 pantry coordinator or volunteer | Food Pantry Intake workflow is realistic | Mutual-aid groups, food-bank volunteer rosters via personal connections |

### Don't recruit if

- The user already pays for a competitor in this space (their reactions will
  be filtered through "is this better than X" rather than "does this help me
  do my job"). Different research question; different protocol.
- The user hasn't done this work in the last 30 days. They'll model the work
  from memory rather than concrete current pain. Memory drifts toward
  generic.
- The user is a friend who'll be polite. You want someone who will tell you
  it's bad if it's bad. Family / close friends often give signal too soft to
  act on.
- The user is technical (engineer / PM). They'll critique the *interface*
  rather than try to do the work. Different research question.

### Recruitment checklist

For each candidate before the session:

- [ ] Confirms they did this work at least once in the last 30 days
- [ ] Confirms they don't already pay for a direct competitor
- [ ] Has 45 min on their calendar for the session (30 min test + 15 min
      buffer)
- [ ] Has access to their actual data for the work (e.g., a CSV from the
      last conference for the SDR; a typical patient roster for the clinic
      assistant) — anonymized if needed but real-shape
- [ ] Knows you'll observe and take notes; consents to either screen-share
      recording or note-taking
- [ ] Has a real device (laptop or tablet) — not a phone, since the apps
      mvp-builder builds aren't optimized for phone yet

## The 30-minute test session

### Opening (5 min)

Do **not** demo the app. Do **not** explain the workflows. Open with:

> "I'm going to share a URL and ask you to click around for a few minutes.
> I want you to narrate out loud what you'd try first if I told you this app
> was meant to help you with [their job]. There's no wrong answer — if you
> get stuck, that's a finding, not a failure on your part."

Send the URL via chat (so they can click), don't read it aloud (so they're
forced to read the screen).

Watch for:
- What do they click first?
- What do they ignore?
- Where do they hover to look for affordances that aren't there?
- Do they say "oh, this is a [familiar pattern]" out loud? (good — they're
  pattern-matching)
- Or do they say "I don't know what this is"? (less good — surface mismatch)

### Core flow (15 min)

After they've explored 3-5 minutes, prompt them with the workflow's first
real action:

| Domain | Prompt |
|---|---|
| SDR | "I want you to import a list of conference attendees. Try." |
| Clinic | "I want you to book a new patient for tomorrow morning. Try." |
| Pantry | "I want you to log a distribution to a family that just walked in. Try." |

Watch for:
- **Time to first success**: how long from prompt to "okay, it worked"?
  Target ≤ 5 min. > 10 min is a red flag.
- **Confusion points**: every time they pause, ask "what are you looking
  for right now?" Don't fill silence by explaining.
- **Trust breakers**: anything that makes them say "wait, that doesn't
  look right" or "I wouldn't trust this number." These are the most
  load-bearing observations — the moments where the app fails to earn
  authority over the data.
- **Off-script attempts**: when they try to do something the workflow
  doesn't handle. "I want to upload an Excel file, not a CSV" → was that a
  researched failure mode?

If they get totally stuck, give *one* hint, then make a note: "needed hint
at step X". Don't rescue them through the whole flow.

### Day-2 wishes (5 min)

> "Imagine you used this for one workday. What would you want next session
> that we don't have today?"

The answer is more interesting than "what's missing right now" — it
anchors on actual job-to-be-done rather than UI critique. Look for:
- Features the workspace didn't research (legitimate gap)
- Features the workspace researched but the build didn't surface (build
  gap, not research gap)
- Features the user thinks they need but actually have alternatives for
  in their existing toolchain (don't build these; cheaper to do nothing)

### Day-1 trust (5 min)

> "Did anything in this 20 minutes make you stop trusting the data? Even
> for a second?"

This is the hardest signal to capture and the most important. If a real
user can't trust the audit log, the territory check, the consent gate,
the opt-out propagation — the app fails day-1 regardless of how
beautifully it renders.

Look for:
- "I clicked X and the count didn't update — did it save?"
- "It said Y but I'm not sure where Y came from"
- "It let me do Z that I shouldn't be allowed to do"
- "It blocked me from Z and I think I should be allowed"

## After the session

Within 30 min of the call, fill out the `USER_VALIDATION_TEMPLATE.md` for
that user. Memory degrades fast; don't trust yourself to remember
quotes verbatim by tomorrow.

After all 3 sessions, fill out the synthesis section.

## Synthesis: cross-user pattern analysis

After 3 sessions, look for:

### Convergent findings (2 of 3 or 3 of 3 hit the same thing)

These are **act-on-it findings**. Examples:
- All 3 users confused by the same UI affordance → fix the UI
- All 3 users hit the same trust-breaker → fix the trust signal
- All 3 users wanted the same day-2 feature → it's a real gap

### Divergent findings (1 of 3)

These are **interesting but not yet actionable**. They might be:
- A persona-specific need (the SDR's request for "outreach AI assist"
  doesn't apply to the pantry coordinator)
- An idiosyncratic preference
- A leading indicator of a trend (note + revisit after the next 3 sessions)

### Surprises

Things you didn't predict. These are the most valuable. Examples:
- "I thought territory conflict would be a relief, but the SDR found it
  paternalistic — they expected to be trusted."
- "The pantry volunteer asked if the consent toggle was a guilt trip.
  Hadn't predicted the affective load."

### What it tells us about the recipe

The recipe (research + build) is supposed to encode the *work*. If a real
user finds the workflow shape unfamiliar, the recipe missed the work. Look
at the workflow.json against the user's actual day:
- Does the order match? (recipe has triage → research → outreach; user
  does triage → outreach → research because they triage on call quality)
- Does the granularity match? (recipe has 6-step intake; user expected
  3-step "drag in, click 'go', look at problems")
- Does the failure modeling match? (recipe handles CSV delimiter; user's
  actual problem is duplicate emails across conferences)

## Privacy and consent

Anonymize all data in capture forms. Real names, real emails, real company
names → pseudonyms before saving the form. Do not record the screen-share
unless the user explicitly consents in writing (chat message during the
call is fine).

If the user provides feedback that contains identifiable third parties (a
specific patient name, a specific donor name), **redact before saving**.

## Don't ship one fix per finding

The temptation after a real user test is to fix every confusion immediately.
Resist it. Wait for the synthesis pass. Single-user findings that don't
appear in 2 of 3 are not yet actionable — fixing them risks chasing
idiosyncrasies and missing the cross-user signal.

After synthesis, ship the convergent fixes. Document the divergent ones.
Re-run the recipe / build recipe on briefs that surfaced patterns the
recipe missed.

## When to do this

The protocol is meant for **first contact** — the first time a build hits
real users. Repeat it:
- Per **major brief** (don't extrapolate from SDR validation to a clinic
  app; clinics are a different work shape).
- Per **major build pivot** (if the build recipe changes, the runtime
  experience may change; revalidate).
- **Not** per minor change. A bug fix doesn't need a 3-user validation.

## Bare minimum

If recruitment falls through and you can only get one user, do it. One real
user beats zero. Note it as N=1 in the synthesis and weight findings
appropriately ("one user said X" is weaker than "all three users said X" —
respect that in any decision based on it).

## See also

- `docs/USER_VALIDATION_TEMPLATE.md` — per-test capture form.
- `docs/PHASE_F_FOLLOWUP_REPORT.md` — W5 fresh-agent build, the closest
  prior signal to "real user" (a fresh agent acting like a builder
  reading the workspace cold).
- `docs/RESEARCH_RECIPE.md` — the recipe that encodes the work.
- `docs/BUILD_RECIPE.md` — the recipe that encodes the build.
