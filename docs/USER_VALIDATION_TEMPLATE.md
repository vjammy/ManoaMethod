# USER_VALIDATION_TEMPLATE

Per-test capture form. Fill out **within 30 minutes** of each session. Memory
degrades fast.

Anonymize before saving — see `USER_VALIDATION_RUNBOOK.md` privacy section.

---

## Session metadata

- **Session ID**: `<YYYY-MM-DD-<role-slug>-NN>` (e.g. `2026-05-15-sdr-01`)
- **Date**: `<YYYY-MM-DD>`
- **Duration**: `<actual minutes>`
- **Brief / app under test**: `<one of: Conference SDR Hub | Small Clinic Scheduler | Food Pantry Intake | …>`
- **Deploy URL tested**: `<https://...>`
- **Build commit / SHA**: `<git rev-parse HEAD>`
- **Recording consented**: `<yes | no>`

## User context (anonymized)

- **Role pseudonym**: `<e.g. SDR-A>` (do not record real name)
- **Years in role**: `<int>`
- **Did this work in the last 30 days**: `<yes | no | dates>`
- **Currently uses competitor**: `<no | yes — but didn't talk about it during session>`
- **Device used**: `<laptop / tablet — model+OS unimportant unless rendered weirdly>`
- **Browser**: `<Chrome / Safari / Firefox / …>`

## Opening (5 min — what they tried first, unprompted)

- **First click**: `<what element they clicked first>`
- **First confusion**: `<the first time they hesitated>`
- **First "oh, this is X"**: `<what familiar pattern did they reach for, if any>`
- **Verbatim quote**: `<one sentence they said in this phase that captured the experience>`

## Core flow (15 min — running the prompted workflow)

### Time-to-first-success
- **Prompt given**: `<copy/paste the prompt — e.g. "import a list of conference attendees">`
- **Time to first success**: `<MM:SS>` (success = the user said "okay it worked" or completed the workflow's terminal step)
- **Hints given**: `<count + summary>` (every hint > 0 is a finding)

### Confusion points

For each confusion, capture:

| # | Step / screen | What confused | What they tried | Resolved? |
|---|---|---|---|---|
| 1 | `<screen name>` | `<what>` | `<what they did to recover>` | `<yes/no>` |
| 2 | … | … | … | … |
| 3 | … | … | … | … |

### Trust breakers

Each moment they said something like "wait, that doesn't look right":

| # | Step / screen | What broke trust | Recovered? |
|---|---|---|---|
| 1 | `<screen>` | `<exact thing — quote if possible>` | `<yes / no — and how>` |

### Off-script attempts

Times they tried something the workflow doesn't handle:

- `<tried X — was it a researched failure mode? yes/no/partial>`
- `<…>`

## Day-2 wishes (5 min)

Verbatim quotes:

- > `"<wish 1>"`
- > `"<wish 2>"`
- > `"<wish 3>"`

For each, classify:
- `[recipe-gap]` — the recipe didn't research this; would need a new pass
- `[build-gap]` — the recipe researched it but the build didn't surface it
- `[noise]` — the user has alternatives in their existing toolchain
- `[unclear]` — needs follow-up

## Day-1 trust (5 min)

> "Did anything make you stop trusting the data?"

Verbatim:

- > `"<answer 1>"`
- > `"<answer 2>"`

For each, classify:
- `[fixable-now]` — small UI / messaging fix
- `[design-gap]` — needs research-level rethink (workflow shape)
- `[unfixable]` — inherent to the data we have

## Demographic context (optional, only if user volunteered)

- **Org size**: `<small clinic / regional sales team / mutual-aid network>`
- **Tools they currently use**: `<spreadsheet / shared doc / paper / specific SaaS>`
- **Frequency of this work**: `<daily / weekly / per-event>`

## Researcher notes

Things you observed that the user didn't say out loud:

- `<observation 1 — body language, hesitation patterns, eye-tracking guess>`
- `<observation 2>`

## What this user told us about the recipe

The work-shape claim the workspace makes vs. the user's actual day:

| Claim | Recipe says | User does | Match? |
|---|---|---|---|
| Order of steps | `<recipe sequence>` | `<user sequence>` | `<exact / close / different>` |
| Failure modes | `<recipe handles>` | `<user mentioned>` | `<covered / partial / missed>` |
| Persona role | `<recipe persona>` | `<user role>` | `<match / off>` |

## Action items from THIS session

(Convergent findings come from synthesis; this section is just for items
that are obviously fixable from this single session — typo, broken link,
wrong copy. Don't ship workflow changes based on N=1.)

- `[ ]` `<action>`
- `[ ]` `<action>`

---

## Synthesis (fill out after all 3 sessions)

| Finding | SDR | Clinic | Pantry | Convergence |
|---|---|---|---|---|
| `<finding 1>` | `<y/n>` | `<y/n>` | `<y/n>` | `<3/3 | 2/3 | 1/3>` |
| `<finding 2>` | … | … | … | … |
| `<finding 3>` | … | … | … | … |

### Cross-user convergent findings (act on these)

1. `<finding>` — observed in `<user list>`. **Fix**: `<what to change in
   recipe / build / workspace>`.
2. `<finding>` — …

### Divergent findings (note, don't act yet)

1. `<finding>` — only seen in `<user>`. **Decision**: park for next round.
2. `<finding>` — …

### Surprises (most valuable signal)

1. `<thing we didn't predict>` — implication: `<what to investigate>`.

### What this round told us about the recipe

- `<recipe-shape claim>` — `<confirmed / refuted / partial>` by `<users>`.
- `<recipe-shape claim>` — …

### Decisions

- **Ship**: `<convergent fixes — list with owners + ETA>`
- **Investigate**: `<divergent + surprising findings — list with research questions>`
- **Park**: `<things heard but explicitly not acting on — with reason>`

### Next round

- Trigger: `<what would cause us to do another N=3 round>`
- Personas to add: `<roles we didn't recruit this time but want next>`
- Briefs to add: `<workspaces we want to validate next time>`
