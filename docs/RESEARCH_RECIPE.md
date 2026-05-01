# RESEARCH_RECIPE.md

This is the recipe a coding agent (Claude Code, Codex, Kimi, OpenCode) executes
**inside its own LLM context** before invoking `npm run create-project`. It
turns a project brief into a research-grounded JSON ontology that drives
workspace generation. No API key on this side: your agent already has model
access.

The recipe runs 7 distinct passes grouped into 3 phases. Each pass produces
a JSON fragment that fits a slot in the schema (`lib/research/schema.ts`).
The agent's job is to fill those slots accurately, citing the brief or
domain knowledge.

**When the recipe runs, then `create-project` runs.** Without research
extractions, `npm run create-project` exits with an error.

---

## Output layout

By the end of the recipe, write to `<your-research-dir>/research/`:

```
research/
  USE_CASE_RESEARCH.md       (narrative, optional — see pass 7)
  DOMAIN_RESEARCH.md         (narrative, optional — see pass 7)
  CONVERGENCE_LOG.md         (the agent's notes about what it kept/dropped)
  extracted/
    meta.json                (briefHash, schemaVersion, modelUsed, etc.)
    actors.json              (Actor[])
    entities.json            (Entity[])
    workflows.json           (Workflow[])
    integrations.json        (Integration[])
    risks.json               (Risk[])
    gates.json               (Gate[])
    antiFeatures.json        (AntiFeature[])
    conflicts.json           (Conflict[])
    _removed.json            (RemovedItem[])
```

Then run:

```
npm run create-project -- --input=<brief.json> --out=<workspace> --research-from=<your-research-dir>
```

---

## Schema reference

Read [lib/research/schema.ts](../lib/research/schema.ts) for the canonical
TypeScript types. Every JSON file must conform; the validator (run as part
of `create-project`) rejects malformed extractions with a clear error.

Each Actor / Entity / Workflow / Risk / Integration / Gate carries
**provenance**:

```json
{
  "id": "<stable-kebab-case-id>",
  "origin": "use-case" | "domain" | "both",
  "evidenceStrength": "strong" | "moderate" | "weak",
  "sources": [{ "url": "...", "title": "...", "quote": "...", "fetchedAt": "ISO" }],
  "firstSeenInPass": <number>,
  "updatedInPass": <number>
}
```

`origin` is the only thing that needs explanation:
- `use-case` — derived from the brief itself (must-haves, audience, problem, etc.)
- `domain` — derived from your knowledge of the industry (regulatory rules, common workflows)
- `both` — both the brief mentions it AND it's also a domain standard

`sources` should be real where possible (web search, official docs, regulatory pages). When the source is the brief itself, use `url: "brief://<product-slug>"` and `quote: "<the brief sentence that motivated this>"`.

---

## Phase 1 — Discovery (1 pass)

### Pass 1: Industry framing + competitor scan

**Input:** the project brief.
**Goal:** classify the industry, identify regulatory exposure, and list 3–5 real products in the same space whose terminology you'll borrow.

**Output (added to `meta.json` as `discovery`):**

```json
{
  "industry": {
    "name": "<industry name, e.g. 'School volunteer coordination'>",
    "subIndustry": "<optional, e.g. 'K-12'>",
    "regulatoryExposure": ["<e.g. FERPA, COPPA, none>"]
  },
  "competitors": [
    { "name": "<product name>", "url": "<homepage>", "keyTerms": ["<noun>", "<noun>"] }
  ],
  "industryTerminology": ["<term>", "<term>", "..."]
}
```

**Validation rules:**
- `industry.name` must NOT be a generic word ("software", "app", "tool"). It must name a real industry segment.
- `competitors[]` must include real products with checkable URLs. If none exist, leave the array empty rather than inventing.
- `industryTerminology` is the seed of the `domainTokens` enforcement vocabulary downstream — every term here should appear in actual industry usage.

**Use web search if available.** If web is not available, use your training knowledge but mark `evidenceStrength: 'weak'` for items you can't cite.

---

## Phase 2 — Extraction (5 passes, one per category)

### Pass 2: Roles → `actors.json`

**Goal:** every distinct human or system actor the product touches, with responsibilities and visibility scope.

For each actor:
- Reuse the brief's audience phrasing where possible. Don't rename "Parent" to "Guardian" unless the brief uses that word.
- `responsibilities[]`: 2–4 concrete actions, each starting with a verb.
- `visibility[]`: what this actor CAN see. The complement (what they CAN'T) lives in entity scope rules.
- `authMode`: `'authenticated'` for password/SSO, `'magic-link'`, `'kiosk'`, or `'public'`.
- `type`: `'primary-user' | 'secondary-user' | 'operator' | 'reviewer' | 'external'`.

**Validation rules:**
- ≥ 2 actors. A product with only one actor is almost always a thin brief.
- IDs are kebab-case and stable: `actor-parent-admin`, `actor-co-parent`, etc.
- Every actor has ≥ 1 source (brief evidence or domain reasoning).

### Pass 3: Entities → `entities.json`

**Goal:** every distinct data record the system stores, with realistic fields and at least one sample.

For each entity:
- Name in title case, singular: `Family Workspace`, `Household Task`, `Audit Entry`.
- `fields[]`: 3–8 fields per entity. Use real domain conventions for IDs (`MRN-XXXXXX`, `INV-2026-0042`, `acct-…`). Avoid `record-001`-style placeholders unless you genuinely have nothing better.
- Mark `pii: true` and `sensitive: true` where applicable. The downstream privacy gate keys off this.
- `relationships[]`: 1–4 relationships expressed in plain English (`Owns Household Task records`).
- `ownerActors[]`: must reference actor IDs from Pass 2.
- `riskTypes[]`: high-level tags like `privacy`, `compliance`, `operational` — these get expanded in Pass 5.
- `sample`: a realistic example record. The audit specifically flags `record-001`-style placeholders.

**Validation rules:**
- ≥ 3 entities. Two entities almost never represent a workable product.
- Every entity owner references a known actor ID.
- `sample` keys match `fields[].name` exactly.

### Pass 4: Workflows → `workflows.json`

**Goal:** for each must-have feature, a workflow with concrete steps and decision branches.

For each workflow:
- `steps[]`: ≥ 5 steps for the primary workflow, ≥ 3 for secondary. Each step has `actor` (must reference an actor ID), `action`, `systemResponse`, optional `branchOn` ("Validation failure", "Decision: approve / revise"), `preconditions`, `postconditions`.
- `failureModes[]`: ≥ 2 per workflow. Each is `{ trigger, effect, mitigation }`. **Do NOT use "invalid input" or "user error" as the only failure mode.** Tie failures to specific domain situations.
- `entitiesTouched[]`: must reference entity IDs.
- `acceptancePattern`: one sentence in Given/When/Then form that a tester can execute.

**Validation rules:**
- ≥ 1 workflow per must-have feature. Brief lists 5 must-haves → ≥ 5 workflows minimum (some may be combined with rationale in `_removed.json`).
- Every step's `actor` is in `actors.json`.
- Every `entitiesTouched` is in `entities.json`.
- `failureModes[].mitigation` is concrete, not "handle gracefully".

### Pass 5: Risks → `risks.json`

**Goal:** structured risks tied to specific entities, actors, and workflows. This is what feeds the security/privacy gates downstream.

For each risk:
- `category`: `'compliance' | 'security' | 'privacy' | 'safety' | 'financial' | 'operational' | 'adoption' | 'integration' | 'product' | 'legal'`.
- `severity`: `'critical' | 'high' | 'medium' | 'low'`.
- `description`: one sentence naming the bad outcome.
- `affectedActors[]`, `affectedEntities[]`: must reference IDs from Pass 2/3.
- `mitigation`: concrete action — "encrypt at rest", "rate-limit signups", not "implement security".
- `mandatedGate`: optional reference to a gate ID from Pass 6.

**Validation rules:**
- For audiences containing children, patients, or vulnerable users: ≥ 1 `privacy` risk with `severity: 'high'` or `'critical'`.
- For products mentioning payments, financial data, or PCI scope: ≥ 1 `compliance` risk.
- For products handling medical data: HIPAA mention required.
- For products handling K-12 student data: FERPA mention required.

### Pass 6: Gates + Anti-features → `gates.json`, `antiFeatures.json`

**Goal:** the explicit checkpoints that stop a phase from advancing without proof.

For each gate:
- `name`: short title.
- `mandatedBy`: `'regulation' | 'industry-standard' | 'safety' | 'product'`.
- `mandatedByDetail`: cite the rule. "HIPAA Privacy Rule §164.502", or "Industry standard for class booking apps that take payment".
- `evidenceRequired[]`: 2–4 specific artifacts the team must produce.
- `blockingPhases[]`: which phase types this gate blocks (`'phase-implementation'`, `'phase-release'`, etc.).

For anti-features (deliberately out of scope):
- Restate the brief's non-goals. Add domain-standard non-goals the brief implies (e.g. "no real-time chat" for a task management app even if not stated).
- Each anti-feature has a `rationale`. "Out of scope for v1" is acceptable; "Not relevant" is not.

### Pass 7: Integrations + narratives → `integrations.json` + `USE_CASE_RESEARCH.md` + `DOMAIN_RESEARCH.md`

**Integrations (`integrations.json`):**
- Only list integrations the brief mentions or that domain standards require. Don't pad.
- Each integration: `name`, `vendor`, `category` (`'payment' | 'auth' | 'identity' | 'email' | 'sms' | 'storage' | 'observability' | 'ehr' | 'wms' | 'erp' | 'llm' | 'other'`), `purpose`, `required`, `envVar`, `mockedByDefault`, `failureModes[]`, `popularity` (`'dominant' | 'common' | 'niche'`), `alternatives[]`.

**Narratives (optional but recommended):**
- `USE_CASE_RESEARCH.md`: 200–500 words on how the brief's audience actually does this work today (pre-product). What's the manual process? Where does it break? Where do they go for help?
- `DOMAIN_RESEARCH.md`: 200–500 words on the industry. Standards, regulations, common pitfalls, words used by experts.

These narratives don't drive generation directly but help reviewers verify your extraction quality. The audit consumes the JSON; humans read the markdown.

---

## Phase 3 — Consolidation (1 pass)

### Pass 8: Self-critique + conflict resolution → `conflicts.json`, `_removed.json`, `meta.json`

**Self-critique** — read your own output and ask:

1. **Brief alignment:** Does every actor, entity, and workflow trace either to the brief OR to industry-standard knowledge tagged `origin: 'domain'`? List any with no traceable source as `RemovedItem` entries with `reason: "no brief or domain evidence"`.
2. **Hallucination check:** Do entity names appear in your own training data for this industry? If `Lead` appears in your output for a SDR product, that's correct. If `Cardinal Witness` appears in a Family Task Board, that's hallucinated — remove it.
3. **Brief contradictions:** Does your output contradict the brief? E.g. brief says "no payments in v1" but you added a Payment entity. Move these to `conflicts.json` with `resolution: 'pending'`. Mark `resolution: 'brief-wins'` if the brief is intentional, or `'research-wins'` if domain practice insists.
4. **Coverage:** Does every must-have feature have at least one workflow? Every actor have at least one workflow? Every workflow touch at least one entity?

**Resolve conflicts.** The validator rejects extractions with `conflicts[].resolution: 'pending'` for severity > 'note'. Make a call. Document why in the resolution field.

**Final `meta.json`:**

```json
{
  "briefHash": "<sha256 of the brief JSON>",
  "schemaVersion": "0.2",
  "startedAt": "<ISO at start>",
  "completedAt": "<ISO at end>",
  "totalPasses": { "useCase": 4, "domain": 4 },
  "finalCriticScores": { "useCase": <self-rated 0-100>, "domain": <self-rated 0-100> },
  "convergedEarly": { "useCase": false, "domain": false },
  "totalTokensUsed": <approximate>,
  "modelUsed": "<your model id>",
  "researcher": "claude-code-session" | "anthropic-sdk" | "mock"
}
```

If `finalCriticScores.useCase < 70` or `finalCriticScores.domain < 65`, surface a warning to the user before invoking `create-project`. The brief may be too thin to research properly; suggest improvements first.

---

## Worked partial example — for an SDR brief

A fragment to set the depth bar. Don't copy this; produce equivalent depth for your own brief.

**`actors.json` excerpt:**

```json
[
  {
    "id": "actor-sdr",
    "name": "Sales Development Rep",
    "type": "primary-user",
    "responsibilities": [
      "Source leads from conferences and email lists",
      "Run multi-touch outbound cadences",
      "Qualify leads and hand off to AEs"
    ],
    "visibility": ["own assigned leads", "own activity history"],
    "authMode": "authenticated",
    "origin": "use-case",
    "evidenceStrength": "strong",
    "sources": [
      { "url": "brief://sdr-sales-module", "title": "SDR brief", "quote": "salespeople who go to conferences, who get email lists, and then research is done in the company", "fetchedAt": "2026-04-30T15:00:00Z" }
    ],
    "firstSeenInPass": 2,
    "updatedInPass": 2
  }
]
```

**`workflows.json` excerpt (one workflow, abbreviated):**

```json
{
  "id": "workflow-cadence-execution",
  "name": "Outbound cadence execution",
  "primaryActor": "actor-sdr",
  "secondaryActors": ["actor-ae"],
  "steps": [
    { "order": 1, "actor": "actor-sdr", "action": "Import a lead list from a conference event", "systemResponse": "Persist Lead records, deduplicate against existing accounts, flag conflicts." },
    { "order": 2, "actor": "actor-sdr", "action": "Enrich each lead with researched company context", "systemResponse": "Persist enrichment to Lead.fitSignal; update activity timeline." },
    { "order": 3, "actor": "actor-sdr", "action": "Apply a cadence (sequence of touches)", "systemResponse": "Schedule touches; show next-step queue ordered by due time.", "branchOn": "Cadence type: cold / warm" },
    { "order": 4, "actor": "actor-sdr", "action": "Log a touch outcome (replied, no-reply, bounced, opt-out)", "systemResponse": "Update Lead state; update Cadence progression; trigger next touch or unenroll." },
    { "order": 5, "actor": "actor-sdr", "action": "Qualify or disqualify a Lead based on advance/block signals", "systemResponse": "Move qualified leads to AE queue; surface disqualification reason on Lead." }
  ],
  "failureModes": [
    { "trigger": "Lead opts out via reply", "effect": "If we keep emailing, we trigger CAN-SPAM exposure and damage sender reputation", "mitigation": "Detect 'unsubscribe' / 'remove' in replies; auto-suppress in <5 minutes; surface to SDR" },
    { "trigger": "Imported list overlaps with existing AE-owned accounts", "effect": "Two reps email the same prospect; embarrassment and possible AE territory conflict", "mitigation": "On import, dedupe against ownership graph; route conflicts to manager queue, not auto-import" }
  ],
  "entitiesTouched": ["entity-lead", "entity-cadence", "entity-touch", "entity-audit-entry"],
  "acceptancePattern": "Given an SDR with a fresh conference list, when they import 50 leads, apply a cadence, and log replies, then the next-step queue advances correctly and a single audit entry exists per touch.",
  "origin": "use-case",
  "evidenceStrength": "strong",
  "sources": [
    { "url": "brief://sdr-sales-module", "title": "SDR brief", "quote": "...", "fetchedAt": "2026-04-30T15:00:00Z" },
    { "url": "https://example-sales-blog.com/sdr-cadence-anatomy", "title": "Anatomy of a B2B cadence", "quote": "...", "fetchedAt": "2026-04-30T15:00:00Z" }
  ],
  "firstSeenInPass": 4,
  "updatedInPass": 4
}
```

Notice:
- Step actions are concrete verbs with named entities, not "user does the workflow".
- Failure modes name specific domain pitfalls (CAN-SPAM, territory conflict), not "validation error".
- Sources include both the brief and an outside reference.
- IDs are stable kebab-case and cross-reference correctly.

---

## How `create-project` consumes this

```bash
npm run create-project -- \
  --input=brief.json \
  --out=./mvp-builder-out \
  --research-from=./your-research-dir
```

The generator:
1. Validates `<research-from>/research/extracted/*.json` against the schema.
2. Pins the legacy archetype tag to `general` (research is the source of truth).
3. Builds requirements as `## Requirement N:` (one per workflow step), citing your sources.
4. Generates `SAMPLE_DATA.md` from `entities.json`.
5. Generates non-functional requirements from `risks.json` and `gates.json`.
6. Anti-features go into `requirements/FUNCTIONAL_REQUIREMENTS.md` as a deliberately-out-of-scope section.
7. The audit (`npm run audit`) detects research-grounded=true via the absence of the deprecated `Generated WITHOUT research extractions` banner.

Workspaces produced via this recipe land in the `production-ready` rating
(≥85/100) when the recipe is followed properly. Workspaces produced via
the deprecated `--allow-templated` path stay in `workable` (≤84/100) and
will fail Phase C's quality gate once it lands.

---

## Common mistakes

- **Padding for the sake of counts.** Don't list 6 entities if the brief only justifies 4. Use `_removed.json` to record entities you considered and rejected with reasons.
- **Generic verbs in workflow steps.** "User does the thing" is uselessas a workflow step. Use the verb the actor actually says ("Import a lead list", "Approve a refund", "Mark a chore complete").
- **Placeholder IDs in samples.** `record-001`, `user-1`, `id-abc` — replace with domain-conventional IDs (`acct-acme-001`, `MRN-484823`, `INV-2026-0042`). The audit specifically flags this.
- **Missing referential integrity.** Every `ownerActors`, `affectedActors`, `entitiesTouched`, `step.actor` must reference an ID that exists. The validator rejects orphan refs.
- **Conflicts left pending.** The validator refuses extractions with unresolved conflicts above `severity: 'note'`. Make a call and document it.

---

## Skipping research (deprecated, not recommended)

```bash
npm run create-project -- --input=brief.json --out=... --allow-templated
```

This bypasses research and uses the legacy archetype-templated path. The
manifest is marked `lifecycleStatus: Blocked`, the requirements file
carries a deprecated banner, and the audit caps the score below 85.
This escape hatch will be removed in Phase A3c.
