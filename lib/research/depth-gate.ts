/**
 * Depth-gate enforcement (Phase F follow-up).
 *
 * Pure function — no fs / network / process. Reusable from CLI, audit-exit
 * runner, and tests. Decides whether the workspace's depth dims clear
 * source-aware thresholds and which upstream recipe pass owns each fix.
 *
 * Rules (mirrors the agent-recipe `gate-mvp-quality` and the validation
 * report's release-blocker recommendations):
 *
 * Always blocking (any source):
 *   - workflow-step-realism < 4  (Pass 3 — workflows: replace templated CRUD)
 *   - entity-field-richness < 3  (Pass 8 — entities: ≥6 fields, enum/fk flags)
 *
 * Blocking only when researchSource ∈ {agent-recipe, imported-real, manual}:
 *   - idea-clarity < 4           (Pass 0 — discovery: 3+ critique entries)
 *   - use-case-depth < 4         (Pass 2/3 — use cases + workflows)
 *   - persona-depth < 4          (Pass 1 — personas + JTBDs)
 *
 * Conditionally blocking when risks include 'compliance' or 'privacy':
 *   - regulatory-mapping < 3     (Pass 0/9 — gates: cite regs in mandatedByDetail)
 *
 * Advisory only (warn, don't block):
 *   - requirement-failure-variance < 3
 *   - per-screen-acceptance-uniqueness < 3
 */

export type ResearchSourceLite = 'synthesized' | 'agent-recipe' | 'imported-real' | 'manual';

export type DepthGateInput = {
  expertDims: Array<{ name: string; score: number; max: number }>;
  researchSource: ResearchSourceLite;
  /** Risk categories from research/extracted/risks.json. */
  riskCategories: string[];
};

export type DepthGateFailure = {
  dim: string;
  score: number;
  threshold: number;
  /** Recipe pass that owns the fix, e.g. 'Pass 3 (workflows)'. */
  upstreamPass: string;
  /** One-line remediation hint. */
  remediation: string;
};

export type DepthGateResult = {
  /** Failures that should fail the build (exit 1). */
  blocking: DepthGateFailure[];
  /** Failures that should warn but not block. */
  advisory: DepthGateFailure[];
  /** Convenience: true iff blocking[].length === 0. */
  passed: boolean;
};

type RuleDef = {
  dim: string;
  threshold: number;
  upstreamPass: string;
  remediation: string;
  /** When this rule fires. */
  appliesWhen: (source: ResearchSourceLite, riskCategories: string[]) => boolean;
  severity: 'blocking' | 'advisory';
};

const RULES: RuleDef[] = [
  // Always blocking
  {
    dim: 'workflow-step-realism',
    threshold: 4,
    upstreamPass: 'Pass 3 (workflows)',
    remediation: 'Replace templated CRUD verbs ("Create a new X", "Edit X title") with concrete domain verbs the actor would actually say.',
    appliesWhen: () => true,
    severity: 'blocking'
  },
  {
    dim: 'entity-field-richness',
    threshold: 3,
    upstreamPass: 'Pass 8 (DB schema alignment)',
    remediation: 'Lift mean fields/entity to ≥6 with at least one enum/fk/indexed flag per entity.',
    appliesWhen: () => true,
    severity: 'blocking'
  },
  // Agent-recipe-only blocking
  {
    dim: 'idea-clarity',
    threshold: 4,
    upstreamPass: 'Pass 0 (discovery)',
    remediation: 'Provide 3-5 honest ideaCritique entries with concrete weakSpot + mitigation; non-generic headline; ≥1 competing alternative.',
    appliesWhen: (source) => source !== 'synthesized',
    severity: 'blocking'
  },
  {
    dim: 'use-case-depth',
    threshold: 4,
    upstreamPass: 'Pass 2/3 (use cases + workflows)',
    remediation: 'Each use case in USE_CASES.md needs main flow + alternatives + failure modes + "Why this actor will use this" section.',
    appliesWhen: (source) => source !== 'synthesized',
    severity: 'blocking'
  },
  {
    dim: 'persona-depth',
    threshold: 4,
    upstreamPass: 'Pass 1 (personas + JTBDs)',
    remediation: 'Each persona needs motivation + pain points + ≥2 adoption signals + visibility scope; sourced from rich JTBDs.',
    appliesWhen: (source) => source !== 'synthesized',
    severity: 'blocking'
  },
  // Conditionally blocking — when compliance/privacy risks present
  {
    dim: 'regulatory-mapping',
    threshold: 3,
    upstreamPass: 'Pass 0 + Pass 9 (discovery + gates)',
    remediation: 'Cite real regs in gate.mandatedByDetail (HIPAA §X, GDPR Art. N, CAN-SPAM Section 5(a)). Risks reference the gate via mandatedGate.',
    appliesWhen: (_, risks) => risks.includes('compliance') || risks.includes('privacy'),
    severity: 'blocking'
  },
  // Advisory only
  {
    dim: 'requirement-failure-variance',
    threshold: 3,
    upstreamPass: 'Pass 3 (workflows) — more failure modes per workflow',
    remediation: 'Add ≥1 failure mode per workflow step (vs the current ≤2 per workflow that get rotated by index).',
    appliesWhen: () => true,
    severity: 'advisory'
  },
  {
    dim: 'per-screen-acceptance-uniqueness',
    threshold: 3,
    upstreamPass: 'Pass 4 (screens)',
    remediation: 'Make each screen.purpose unique across siblings; avoid repeating the workflow-level acceptance pattern.',
    appliesWhen: () => true,
    severity: 'advisory'
  },
  // Phase G G1 — initially advisory; only fires when build/manifest.json
  // exists (the audit dim returns undefined otherwise, so the rule never has
  // a dim to evaluate). Graduates to blocking once enough builds calibrate
  // the thresholds.
  {
    dim: 'build-recipe-coverage',
    threshold: 4,
    upstreamPass: 'docs/BUILD_RECIPE.md (B1–B9)',
    remediation: 'Run all 9 build passes; ensure every workflow.id has a deployed route, validation runs server-side, and audit events are wired.',
    appliesWhen: () => true,
    severity: 'advisory'
  }
];

export function evaluateDepthGate(input: DepthGateInput): DepthGateResult {
  const dimByName = new Map(input.expertDims.map((d) => [d.name, d]));
  const blocking: DepthGateFailure[] = [];
  const advisory: DepthGateFailure[] = [];
  for (const rule of RULES) {
    if (!rule.appliesWhen(input.researchSource, input.riskCategories)) continue;
    const dim = dimByName.get(rule.dim);
    if (!dim) continue; // dim not present → can't evaluate (e.g. screens missing)
    if (dim.score >= rule.threshold) continue;
    const failure: DepthGateFailure = {
      dim: rule.dim,
      score: dim.score,
      threshold: rule.threshold,
      upstreamPass: rule.upstreamPass,
      remediation: rule.remediation
    };
    if (rule.severity === 'blocking') blocking.push(failure);
    else advisory.push(failure);
  }
  return { blocking, advisory, passed: blocking.length === 0 };
}

/** Format a depth-gate result as console text. Used by CLI + audit-exit-runner. */
export function formatDepthGateReport(result: DepthGateResult): string {
  const lines: string[] = [];
  if (result.blocking.length > 0) {
    lines.push(`Depth gate FAILED (${result.blocking.length} blocking, ${result.advisory.length} advisory):`);
  } else if (result.advisory.length > 0) {
    lines.push(`Depth gate passed with ${result.advisory.length} advisory warning(s):`);
  } else {
    lines.push('Depth gate passed.');
    return lines.join('\n');
  }
  for (const b of result.blocking) {
    lines.push(`  [BLOCK] ${b.dim} = ${b.score} (need ≥ ${b.threshold}) — fix in ${b.upstreamPass}`);
    lines.push(`          ${b.remediation}`);
  }
  for (const a of result.advisory) {
    lines.push(`  [warn]  ${a.dim} = ${a.score} (advisory; ≥ ${a.threshold} preferred) — ${a.upstreamPass}`);
  }
  return lines.join('\n');
}
