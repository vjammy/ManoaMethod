# Research-driven generation — design plan (v2)

**Status:** proposed, not implemented.
**Author:** generated from a working session against the 50-iteration loop.
**Trigger:** the audit's `Research-grounded: 0/50` finding. The framework was
passing because it was internally consistent, not because it understood the
real domain deeply.

The pipeline today is **brief → archetype keyword match → templated artifacts**.
The 11-archetype router (`lib/archetype-detection.ts`) and the hand-coded
blueprints in `lib/domain-ontology.ts` are the source of generic output. This
plan replaces both with a research-driven path: **brief → research → ontology
built per-brief → workspace.** No archetype switch. No general fallback.

---

## What gets deleted, repurposed, kept

| File / module | Status | Why |
| --- | --- | --- |
| `lib/archetype-detection.ts` | **delete** | The keyword router is exactly the thing we don't want. |
| `lib/domain-ontology.ts` (the 11 blueprints + general fallback) | **delete** | They are the templates that produce generic output. |
| `lib/domain-ontology.ts` (`Actor`, `Entity`, `Workflow`, `Risk` type defs) | **keep, promote** | These become the research output schema. |
| `lib/research/loop.ts`, `providers.ts`, `prompts.ts`, `schema.ts`, `persistence.ts` | **keep, expand** | Already does most of what we need. |
| `lib/generator.ts` (ontology resolution) | **rewrite that branch** | Stops calling `buildBlueprint(archetype)`; consumes research-built ontology directly. Rendering downstream of ontology is mostly unchanged. |
| `lib/scoring.ts`, `lib/semantic-fit.ts` | **keep, rebaseline thresholds** | Same dimensions; baseline shifts because research-grounded becomes the default. |
| `scripts/mvp-builder-quality-audit.ts` | **keep, extend** | New dimensions for research depth. |

## New pipeline

```
brief.json
  ↓
[1] Brief Doctor (sanity check on the brief itself)         ← NEW
  ↓
[2] Domain Research (lib/research, expanded to ~10 passes)
       — outputs ontology AND domain tokens
       — replaces archetype router + blueprint step entirely
  ↓
[3] Token-Constrained Generator
       — consumes research ontology directly
       — every artifact must contain ≥3 domain tokens
  ↓
[4] Quality Gate (audit promoted from informational to gating)
  ↓
[5] Expert Rubric audit (≥90 = production-ready)
```

There is no "general fallback" because there is no archetype to fail to match.

## Research-as-ontology — the central piece

Research output schema becomes the ontology shape. One JSON document per
workspace at `repo/research-ontology.json`:

```ts
{
  industry:           { name, subIndustry, naicsLike }
  roles:              Actor[]
  entities:           Entity[]
  workflows:          Workflow[]              // ≥5 steps each, with decision points
  edgeCases:          EdgeCase[]              // domain-specific failure modes
  regulatory:         RegulatoryNote[]        // HIPAA/FERPA/COPPA/PCI when applicable
  realisticSampleIds: { entity → idPattern }  // "MRN-XXXXXX", "INV-YYYY-NNNN"
  domainTokens:       string[]                // enforcement vocabulary
  sources:            { each entry tagged llm | brief | curated | web }
  freshnessAt:        ISO timestamp
  briefHash:          sha256
}
```

How it's built (in `lib/research/loop.ts`, expanded):

1. **Industry framing** — Claude is given the brief; returns industry, sub-industry, applicable regulations.
2. **Role extraction** — every distinct actor implied by the brief, with responsibilities and scope.
3. **Entity extraction** — every distinct data record, fields, sample values in domain conventions.
4. **Workflow extraction** — for each must-have feature, a workflow with ≥5 steps and decision points.
5. **Edge-case enumeration** — domain-specific failure modes per workflow.
6. **Regulatory mapping** — link applicable rules to specific entities and workflows.
7. **Sample-data realism** — generate domain-conventional IDs and sample records.
8. **Token consolidation** — `domainTokens[]` = union of brief tokens + role/entity/workflow names + regulation names.
9. **Self-critique** — Claude reviews its own output against the brief; flags entries with no brief-token co-occurrence as suspect.
10. **Schema validation** — strict JSON-schema check; one repair pass on failure.

Anti-hallucination: every role/entity/workflow must have ≥1 alias or token that
appears in the brief, **or** be tagged `source: llm-only` and surfaced in the
audit. Pure-LLM tokens are allowed but counted separately.

## How the generator changes

Today: `generator.ts` calls `buildBlueprint(archetype)` and then renders.
Tomorrow: it calls `loadResearchOntology(workspace)` and then renders.

- Drop the `switch (domainType)` in `buildBlueprint` and the function itself.
- Replace `inferActors`, `inferEntities`, `inferIntegrations` with passthrough reads from the research ontology.
- Templates that referenced archetype-specific copy are rewritten to interpolate from the ontology.
- Sample data generation reads `research.realisticSampleIds` and `research.entities[].sample` directly.

## Audit / gate changes

The audit's `domain-vocabulary` dimension previously measured token overlap
between brief and templated output. With research, the right measure becomes:

- **brief-token coverage** — % of brief tokens that landed in artifacts (adaptive to brief length)
- **research-token coverage** — % of `research.domainTokens` that landed in artifacts
- **research-only-token leakage** — count of artifacts using only tokens that don't appear in the brief (signal of research drift)

Quality gate (new `lib/quality-gate.ts`):

| Dimension | Threshold | If miss |
| --- | --- | --- |
| Research-ontology present | required | gate **fails** |
| Research schema valid | required | gate **fails** |
| Brief-token coverage | ≥ 70% | gate **fails** |
| Research-only-token leakage | ≤ 15% | warning |
| Other audit dimensions | (as today, with rebaselined thresholds) | per-dimension gate |

`manifest.json.lifecycleStatus = Blocked` when any required gate fails.

## The 90+ "expert-deep" rubric (research-aware)

40 expert points layered on top of the existing 60 (single 100-pt scale):

| Expert dimension | Pts | Heuristic |
| --- | ---: | --- |
| Research depth | 10 | research-ontology has ≥3 entities, ≥2 roles, ≥3 workflows, each workflow ≥5 steps |
| Edge-case coverage | 10 | each REQ has ≥1 failure mode tied to `research.edgeCases` (not "invalid input") |
| Role-permission matrix | 10 | generated `requirements/PERMISSION_MATRIX.md` is actor × entity × action, ≥80% cells filled |
| Realistic sample data | 5 | sample IDs follow `research.realisticSampleIds` patterns |
| Regulatory mapping | 5 | non-empty `requirements/REGULATORY_NOTES.md` linking each in-scope rule to specific REQs |

A workspace can no longer reach 90+ by being structurally polished but generic.

## Trade-offs

**Costs we accept**
- Every fresh `create-project` requires LLM access. No air-gapped path.
- Cold runs cost ~$0.10–$0.50 and take 30–90s.
- Research output varies run-to-run unless cached or temperature-pinned.

**Mitigations**
- Workspace-local cache `repo/research-cache/<briefHash>.json` + user-level `~/.mvp-builder/cache/`.
- `temperature=0` and pinned model id for reproducibility.
- `--mock-research` flag for CI/dev: structurally-valid stub, manifest marked `Blocked`. This is the *only* fallback.

**Costs we eliminate**
- ~700 lines of hand-maintained archetype blueprints
- ~150 lines of keyword/anti-keyword rules
- The `general` fallback failure mode + 11 special cases that drift over time
- The "domain blends in archetype templates that don't know about it" problem (e.g., the SDR brief that scored low because the SDR template didn't blend brief-specific tokens)

## Migration phases

Each phase ends with a 50-iteration re-run and before/after numbers in the commit message.

| Phase | Scope | Effort | Target |
| --- | --- | --- | --- |
| **A1** | Expand `lib/research/schema.ts` to full ontology shape; expand `lib/research/loop.ts` to 10 passes; add cache + `temperature=0` | 2 days | Research output ≥3 entities, ≥5 workflow steps for any brief |
| **A2** | Generator reads `research-ontology.json` directly. `--research-driven` flag bypasses archetype path. | 1–2 days | One brief generates a workable workspace via research only |
| **A3** | Delete `lib/archetype-detection.ts` and the blueprints in `lib/domain-ontology.ts`. Research-driven becomes the only path; `--mock-research` is the sole fallback. | 1 day | Repo loses ~850 lines |
| **B** | Token enforcement (`lib/generator/token-enforcer.ts`): post-gen scan, regen pass, violation tracking | 2–3 days | Brief-token coverage ≥70%, research-only leakage <15% |
| **C** | Quality-gate promotion (`lib/quality-gate.ts`): missing research ontology → `Blocked` | 1 day | Cookie-cutter outputs hard-fail |
| **D** | Expert rubric (research-depth, permission matrix, regulatory notes); generate `requirements/PERMISSION_MATRIX.md` and `requirements/REGULATORY_NOTES.md` | 3–5 days | Median ≥90, ≥80% production-ready |
| **E** | Brief Doctor: pre-flight check that flags too-thin briefs before research $$ | 0.5 day | Mentorship-style "only 4 must-haves" briefs are refused up front |

## Risks specific to "no archetype"

1. **First-run determinism** — same brief, two runs, two ontologies if cache misses. *Mitigation:* pin model + `temperature=0`; `--reuse-cache=<path>` for CI runs.
2. **Hallucinated roles/entities** — research invents a "Compliance Officer" the brief never mentioned. *Mitigation:* every research entity must have ≥1 brief alias OR be tagged `source: llm-only` and surfaced.
3. **API-down failures** — no archetype fallback to lean on. *Mitigation:* cache first; on cold miss without API, fail fast with a clear error rather than producing a templated lie.
4. **Audit threshold drift** — current thresholds were tuned to templated output. *Mitigation:* re-baseline against the first research-driven 50-iter run before promoting gates.
5. **Token-enforcement loops** — research produces tokens the generator can't naturally insert; regen passes loop forever. *Mitigation:* cap regen at 1 pass per artifact, then file a `genericness-violation` and let the gate fail.

## Open decisions

1. **Cutover style** — delete archetype code in this PR (Phase A3) or keep behind `--legacy-archetype` for one release while research is validated?
2. **Cold-start UX** — when API is unreachable and cache is empty, hard-fail with an instructive error, or generate the `--mock-research` stub with a red banner?
3. **Knowledge packs** — without archetypes, do curated packs still earn their keep as research *seeds* (head-start the LLM on common domains), or drop them entirely?
4. **Provider** — Anthropic only, or pluggable provider interface from the start?
5. **Cache layering** — workspace-local only, user-level only, or both with workspace-local taking priority?
6. **Cost cap** — per-run dollar ceiling? Aborts research and falls back to `--mock-research` if exceeded.
7. **Audit threshold rebaseline** — re-tune all gate thresholds against the first 50-iter research-driven run, or keep current and let the score distribution shift naturally?
