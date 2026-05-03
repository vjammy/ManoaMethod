# REAL_LLM_VALIDATION_RUNBOOK

This runbook describes how to validate the autoresearch loop + audit-as-exit-
criterion + depth-gate against a **live Claude API**, end to end. The wiring
is type-checked and tested with mocks (W2/W3/W4 in
`docs/PHASE_F_FOLLOWUP_REPORT.md`); a real run is the final piece of
validation that requires `ANTHROPIC_API_KEY` in the environment.

The script that runs the validation is
[`scripts/run-real-research-validation.ts`](../scripts/run-real-research-validation.ts).

## Why this is gated

Claude Code's OAuth doesn't work against the Anthropic SDK (validated in
A4 — see `audit_exit_criterion` memory). The validation has to run with a
raw API key the user supplies. Cost-bounded: each run is capped at
`--token-cap=300000` and `--max-passes=10`, so a single SDR-style run is
typically under $10 with Sonnet.

## Prerequisites

1. `ANTHROPIC_API_KEY` set in the environment (do **not** commit; do **not**
   echo it; do **not** put it in a config file the validator will scan).
2. A reasonable rate-limit budget on the key (the loop spawns ≥7 sequential
   model calls; throughput-limited keys may need `--max-passes=4` instead of
   the default 10 to fit within rate-limit windows).
3. The repo's typecheck and smoke tests pass before running (the script
   imports `lib/research/loop.ts` and friends — no point running on a broken
   tree).

### How to set the key securely

Use a temporary, scoped key — not your main account key. On Windows
PowerShell:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
npx tsx scripts/run-real-research-validation.ts --input=examples/sdr-sales-module.json
```

On bash:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/run-real-research-validation.ts --input=examples/sdr-sales-module.json
```

After the run, **rotate the key** (Anthropic console → settings → API keys
→ revoke).

## Recommended first brief

Start with `examples/sdr-sales-module.json` (matches W4 iter-09 baseline at
`.tmp/recipe-validation/out/mvp-builder-workspace`). The W4 manual run on
this brief produced:
- Total: 100/100
- Depth grade: 28/30 (deep)
- demoReady: true
- Depth-gate: passed (no advisories after G2)

The live run should land within shouting distance of these numbers — see
"Expected ranges" below.

## Running it

```bash
npx tsx scripts/run-real-research-validation.ts \
  --input=examples/sdr-sales-module.json \
  --threshold=95 \
  --max-retries=2 \
  --max-passes=10 \
  --enforce-depth=true \
  --respect-caps=true
```

Optional flags:
- `--out=<dir>` — where to write outputs. Default: `.tmp/real-llm-validation-<brief-slug>`.
- `--token-cap=300000` — soft budget for the loop.

## Outputs

```
<out>/
  research/
    USE_CASE_RESEARCH.md       (narrative)
    DOMAIN_RESEARCH.md         (narrative)
    CONVERGENCE_LOG.md         (the agent's notes)
    extracted/*.json           (the schema-valid extractions)
  RUN_SUMMARY.md               (passes / scores / tokens / durations)
  REPORT.json                  (structured trace — the G4 deliverable)
  REPORT.md                    (human-readable rendering of REPORT.json)
```

`REPORT.json` is the canonical artifact. It contains:
- `totalPasses` — sum of use-case + domain passes (typically 7-12)
- `auditRetries` — number of audit-driven re-extraction passes
- `finalAudit` — `{ total, cap, passed }`
- `finalDepthGateBlocking` — depth-gate failures present at the end of the
  run (should be empty if `passed=true`)
- `baselineComparison` — when a W4 baseline package exists for the brief
  slug, the baseline's audit total + depth grade for side-by-side comparison

## Expected ranges

For the SDR brief on Claude Sonnet 4.6:

| Metric | Expected | Red flag |
|---|---|---|
| Total passes | 7-12 | < 5 (loop bailed early) or > 14 (gap-feedback isn't converging) |
| Audit retries | 0-2 | > 2 *with* `passed=false` (recipe didn't transmit) |
| Final audit total | ≥ 95 | < 90 |
| Final depth grade | 24-30/30 | < 20/30 |
| Tokens used | 150k-280k | > 295k (hitting the cap means the loop ran longer than expected) |
| Schema valid | yes | no (any schema-validation failure is a serious regression) |
| First-pass audit total | ≥ 90 | < 85 (the recipe's first-shot output is weaker than synth) |

Compare against W4 manual baseline values via `baselineComparison` in
`REPORT.json`.

## Red flags

### Depth-gate failures NOT decreasing across retries

If `auditRetries > 0` and `finalAudit.passed = false`, look at the depth-gate
failures the loop fed back as gaps. If the live model produced the same
depth-gate failures across retries 0, 1, 2, the gap-feedback wording isn't
actionable — the model can't translate "workflow-step-realism = 2" into a
concrete edit. Fix candidates:

1. Sharpen the gap-feedback in `lib/research/loop.ts`'s `auditFindingsAsGaps`
   to point at concrete step-level edits ("rewrite step 3's action to use
   the actor's domain verb").
2. Add example-grounded remediation in `lib/research/depth-gate.ts` rule
   definitions — "current value 2/5; reach 4/5 by … <example transformation
   from synth-shaped step to deep step>".
3. Reconsider `--respect-caps=true` — caps compound across retries; a
   stubborn cap on `idea-clarity` will drag the total below threshold even
   if everything else is fine.

### Schema validation fails

If `schemaValid: false`, the live model produced JSON that doesn't match
`lib/research/schema.ts` shapes. Look at `VALIDATION_ISSUES.json`:

- `path: "actors[0].id"` and similar — the model omitted a required field.
  Tighten the prompt template in the matching `lib/research/providers.ts`
  or `lib/research/passes/*` to include "id is required (kebab-case,
  domain-prefixed)".
- `path: "workflows[2].steps[5].action"` — model used a reserved word or
  mismatched a string enum. Add the enum hint to the prompt.

### Token cap hit

If `tokensUsed >= --token-cap`, the loop ran longer than expected. Check
RUN_SUMMARY.md for the per-pass token usage. A common cause: the model
keeps producing diff-style edits to a long workflow JSON, and each pass
re-includes the full prior context. Fix: surface only the gap-feedback
delta to the next pass, not the whole prior extraction blob.

### Loop bailed before audit threshold

If `totalPasses < 5`, the use-case or domain loop converged too early. Look
at RUN_SUMMARY.md "## Use-case loop" and "## Domain loop" sections — if
`finalScore` is low and `passes.length` is short, the loop is exiting on a
plateau detector that's too aggressive. Tune `lib/research/loop.ts`'s
plateau threshold.

## Comparing to W4 baseline

The script auto-detects the W4 baseline when the input brief slug matches:

| Brief slug fragment | Baseline package |
|---|---|
| `conference-sdr` / `sdr-sales` | `.tmp/recipe-validation/out/mvp-builder-workspace` |
| `clinic` | `.tmp/w4-clinic/out/mvp-builder-workspace` |
| `pantry` | `.tmp/w4-pantry/out/mvp-builder-workspace` |
| `budget` | `.tmp/w4-budget/out/mvp-builder-workspace` |

The W4 baseline is a manual extraction the recipe author wrote by hand. It
represents the upper bound of what the recipe *can* produce; the live model
should land in the 70-95% range of the baseline depth.

If live total < baseline total - 5, investigate. If live total > baseline
total, that's *also* worth looking at — the manual baseline may have
underused the recipe's full depth.

## Follow-up: per-retry trace

The current `AuditExitOutcome` exposes:
- `finalAudit` — last audit result
- `retries` — count of retry attempts
- `passed` — whether the threshold was met

It does **not** currently expose a per-retry history (depth-gate failures at
retry 0, 1, 2 separately). This makes the "depth-gate failures NOT decreasing"
red-flag check above a heuristic based on the *final* state, not a real
trend. A cleaner check requires `lib/research/loop.ts` to surface a
`retryHistory: AuditExitResult[]` on `AuditExitOutcome`. This is a small
change — append each pre-retry audit result to a list as the targeted-pass
loop runs. It's deferred from this G4 prep to keep the prep-only deliverable
tight; do it the first time a real-LLM run produces unclear retry behavior.

## What to do after the run

1. Inspect `REPORT.md` end-to-end. Note any red flags.
2. Open `<out>/research/extracted/workflows.json` and read the live model's
   workflow output. Compare to the W4 baseline at the matching path. The
   shape should match; the wording will differ; the depth should be
   comparable.
3. If `finalAudit.passed=true` and `finalDepthGateBlocking.length === 0`,
   the loop is validated end-to-end. Update `audit_exit_criterion` memory
   with the run timestamp and any observations.
4. If anything red-flags, debug per the "Red flags" section above before
   rerunning.
5. **Rotate the API key.**

## When to rerun

The validation isn't a one-shot — the recipe + gap-feedback + depth-gate
evolve over time. Rerun the validation:
- After any change to `lib/research/loop.ts` (the autoresearch loop itself).
- After any change to `lib/research/depth-gate.ts` rule thresholds or
  remediation wording.
- After any change to `scripts/mvp-builder-quality-audit.ts` expert dim
  scoring (especially F3 depth dims).
- Before each release tag that bundles the recipe path as a documented
  feature.

The cost is real — do it deliberately, on briefs that exercise distinct
parts of the recipe (compliance / non-compliance, persona-heavy /
workflow-heavy / integration-heavy).

## See also

- `scripts/run-real-research-validation.ts` — the script.
- `lib/research/audit-exit-runner.ts` — the audit-as-exit-criterion wiring.
- `lib/research/depth-gate.ts` — the depth thresholds the runbook above
  expects to be cleared.
- `docs/PHASE_F_FOLLOWUP_REPORT.md` — W2/W3/W4 mock + manual validation
  context.
- `audit_exit_criterion` memory — committed-state context for the
  audit-as-exit-criterion wiring.
