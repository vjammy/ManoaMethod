#!/usr/bin/env node
/**
 * Phase G W5 — tests for the per-step failure-case matching used by
 * buildFunctionalRequirementsFromResearch.
 *
 * Pre-G the generator rotated workflow-level failureModes by step index, which
 * produced "join-spam": failure cases that had nothing to do with the
 * requirement they sat under (e.g. a delimiter-detection failure listed under
 * "resolve flagged rows"). The independent fresh-builder validation flagged
 * this as the highest-friction generator artifact in the workspace.
 *
 * Post-G, matchFailureModeForStepDetailed picks failure modes by Jaccard
 * token overlap against `step.branchOn` first, then `step.systemResponse`,
 * then falls back to a generic step-aware pointer. These tests pin that
 * behavior end-to-end:
 *
 *   T1 — pure-function: branchOn match wins over systemResponse match.
 *   T2 — pure-function: systemResponse match used when branchOn is empty.
 *   T3 — pure-function: no overlap → undefined (generic fallback path).
 *   T4 — generator integration: cross-workflow no-irrelevant-spam check on
 *        a synthetic 2-workflow extraction. Asserts no two requirements from
 *        different workflows share the same Failure-case line, and that every
 *        non-fallback failure-case shares ≥ 1 keyword with the step's action /
 *        branchOn / systemResponse.
 *   T5 — recipe-validation workspace: regenerate FUNCTIONAL_REQUIREMENTS.md
 *        from the agent-recipe extractions and assert
 *        requirement-failure-variance ≥ 4/5 from the audit.
 *
 * Usage: npm run test:functional-requirements-failures
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateProjectBundle,
  jaccard,
  matchFailureModeForStepDetailed,
  tokenizeForFailureMatch
} from '../lib/generator';
import { readExtractions } from '../lib/research/persistence';
import { baseProjectInput } from '../lib/templates';
import type { ProjectInput } from '../lib/types';
import type {
  Actor,
  Entity,
  ResearchExtractions,
  Workflow
} from '../lib/research/schema';
import { runAudit } from './mvp-builder-quality-audit';
import { createArtifactPackage } from './mvp-builder-create-project';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function t1BranchOnBeatsSystemResponse() {
  console.log('[T1] branchOn match wins over systemResponse match…');
  const failureModes = [
    { trigger: 'CSV header is missing required columns', effect: 'rows ignored', mitigation: 'show header-mismatch error' },
    { trigger: 'Magic link expired before user clicked', effect: 'sign-in fails', mitigation: 'offer to resend' }
  ];
  const step = {
    order: 1,
    actor: 'sdr',
    action: 'Open the imported file.',
    systemResponse: 'The system shows a magic-link prompt to confirm session.',
    branchOn: 'CSV header has missing required columns?'
  };
  const m = matchFailureModeForStepDetailed(step, failureModes);
  assert.ok(m, 'expected a failure-mode match');
  assert.strictEqual(m!.matchedOn, 'branchOn', `expected match on branchOn, got ${m!.matchedOn}`);
  assert.match(m!.failureMode.trigger, /CSV header/i, 'expected the CSV-header trigger to win');
  console.log(`[T1] PASS — matchedOn=branchOn, score=${m!.score.toFixed(2)}`);
}

function t2SystemResponseUsedWhenBranchOnEmpty() {
  console.log('[T2] systemResponse used when branchOn is empty/whitespace…');
  const failureModes = [
    { trigger: 'Email provider rate limits exceed quota', effect: 'sends fail', mitigation: 'queue for retry' },
    { trigger: 'Territory conflict at import', effect: 'lead double-owned', mitigation: 'block and prompt to resolve' }
  ];
  const step = {
    order: 2,
    actor: 'sdr',
    action: 'Send the outreach email batch.',
    systemResponse: 'The provider accepts the email batch and returns delivery receipts.',
    branchOn: ''
  };
  const m = matchFailureModeForStepDetailed(step, failureModes);
  assert.ok(m, 'expected a failure-mode match');
  assert.strictEqual(m!.matchedOn, 'systemResponse', `expected match on systemResponse, got ${m!.matchedOn}`);
  assert.match(m!.failureMode.trigger, /Email provider/i, 'expected the email-provider trigger to win');
  console.log(`[T2] PASS — matchedOn=systemResponse, score=${m!.score.toFixed(2)}`);
}

function t3NoOverlapReturnsUndefined() {
  console.log('[T3] No keyword overlap → undefined (caller emits generic fallback)…');
  const failureModes = [
    { trigger: 'Webhook signature verification fails', effect: 'event dropped', mitigation: 'retry with manual replay' }
  ];
  const step = {
    order: 1,
    actor: 'sdr',
    action: 'Paste research notes into the lead detail panel.',
    systemResponse: 'The lead detail panel saves and stamps an audit event.',
    branchOn: 'Notes shorter than 20 characters?'
  };
  const m = matchFailureModeForStepDetailed(step, failureModes);
  assert.strictEqual(m, undefined, 'expected no match — webhook trigger has nothing in common with notes/lead vocabulary');
  // Sanity-check the helpers themselves.
  const a = tokenizeForFailureMatch('CSV header missing columns');
  const b = tokenizeForFailureMatch('header columns missing in CSV');
  assert.ok(jaccard(a, b) > 0.5, `expected jaccard > 0.5 on near-identical strings, got ${jaccard(a, b)}`);
  console.log('[T3] PASS — no fabricated match');
}

function buildSyntheticExtractions(): ResearchExtractions {
  const baseProvenance = {
    origin: 'use-case' as const,
    evidenceStrength: 'strong' as const,
    sources: [],
    firstSeenInPass: 1,
    updatedInPass: 1
  };
  const actors: Actor[] = [
    { ...baseProvenance, id: 'actor-sdr', name: 'SDR', type: 'primary-user' as const, responsibilities: ['Import leads', 'Send outreach'], visibility: ['leads', 'outreach'], authMode: 'magic-link' as const }
  ];
  const entities: Entity[] = [
    {
      ...baseProvenance,
      id: 'entity-lead',
      name: 'Lead',
      description: 'Lead record',
      fields: [
        { name: 'id', type: 'string' as const, description: 'lead id', required: true, example: 'lead-1', dbType: 'UUID' as const },
        { name: 'email', type: 'string' as const, description: 'contact email', required: true, example: 'a@b.com', dbType: 'TEXT' as const, pii: true },
        { name: 'fullName', type: 'string' as const, description: 'full name', required: true, example: 'A B', dbType: 'TEXT' as const, pii: true }
      ],
      relationships: [],
      ownerActors: ['actor-sdr'],
      riskTypes: ['privacy'],
      sample: { id: 'l1', email: 'a@b.com', fullName: 'A B' }
    }
  ];
  // Workflow A: import. Failures are CSV-related.
  const wfImport: Workflow = {
    ...baseProvenance,
    id: 'wf-import',
    name: 'Import leads from a CSV',
    primaryActor: 'actor-sdr',
    secondaryActors: [],
    entitiesTouched: ['entity-lead'],
    acceptancePattern: 'Imported file lands as Lead rows with no silent drops.',
    steps: [
      { order: 1, actor: 'actor-sdr', action: 'Upload the CSV file.', systemResponse: 'System parses the CSV and counts rows.', branchOn: 'File exceeds 5 MB limit?' },
      { order: 2, actor: 'actor-sdr', action: 'Confirm the column mapping.', systemResponse: 'System validates the header columns against the schema.', branchOn: 'Header missing required columns?' },
      { order: 3, actor: 'actor-sdr', action: 'Resolve flagged rows.', systemResponse: 'System stores accepted rows as Lead records.', branchOn: 'Encoding is not UTF-8?' }
    ],
    failureModes: [
      { trigger: 'File exceeds 5 MB limit', effect: 'upload rejected', mitigation: 'show size cap and ask for a smaller file' },
      { trigger: 'Header missing required columns (fullName, email, company, title)', effect: 'rows cannot be mapped', mitigation: 'show header diff and the canonical header' },
      { trigger: 'Encoding not UTF-8 (mojibake in names)', effect: 'names corrupted', mitigation: 'reject the file and ask for UTF-8 export' }
    ]
  };
  // Workflow B: outreach. Failures are email-related — totally disjoint from CSV.
  const wfOutreach: Workflow = {
    ...baseProvenance,
    id: 'wf-outreach',
    name: 'Send outreach to a Lead',
    primaryActor: 'actor-sdr',
    secondaryActors: [],
    entitiesTouched: ['entity-lead'],
    acceptancePattern: 'Outreach email lands and the system stamps an audit event.',
    steps: [
      { order: 1, actor: 'actor-sdr', action: 'Draft an outreach email.', systemResponse: 'System renders a preview using the Lead fields.', branchOn: 'Lead has opted out via reply keyword?' },
      { order: 2, actor: 'actor-sdr', action: 'Send the outreach email.', systemResponse: 'Email provider accepts the message and returns a receipt.', branchOn: 'Provider rate limit exceeded?' },
      { order: 3, actor: 'actor-sdr', action: 'Log the follow-up note.', systemResponse: 'System stores the note and updates the Lead state to contacted.', branchOn: 'Magic link for sign-in expired?' }
    ],
    failureModes: [
      { trigger: 'Lead has opted out via reply keyword', effect: 'send blocked', mitigation: 'block send and propagate opt-out to all leads with that email' },
      { trigger: 'Email provider rate limits exceed quota', effect: 'sends queued', mitigation: 'queue and retry with exponential backoff' },
      { trigger: 'Magic link expired before user clicked', effect: 'sign-in fails', mitigation: 'offer to resend the magic link' }
    ]
  };
  return {
    meta: {
      briefHash: 'test-hash',
      schemaVersion: 1 as never,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalPasses: { useCase: 1, domain: 1 },
      finalCriticScores: { useCase: 100, domain: 100 },
      convergedEarly: { useCase: true, domain: true },
      totalTokensUsed: 0,
      modelUsed: 'fixture',
      researcher: 'mock' as const,
      researchSource: 'manual' as const
    },
    actors,
    entities,
    workflows: [wfImport, wfOutreach],
    integrations: [],
    risks: [],
    gates: [],
    antiFeatures: [],
    conflicts: [],
    removed: []
  };
}

function t4NoIrrelevantCrossWorkflowSpam() {
  console.log('[T4] Generator integration — no cross-workflow Failure-case spam…');
  const ex = buildSyntheticExtractions();
  const input: ProjectInput = {
    ...baseProjectInput(),
    productName: 'Lead Hub',
    productIdea: 'A test fixture for failure-case matching.',
    questionnaireAnswers: {}
  };
  const bundle = generateProjectBundle(input, { extractions: ex });
  const fr = bundle.files.find((f) => f.path === 'requirements/FUNCTIONAL_REQUIREMENTS.md');
  assert.ok(fr, 'expected FUNCTIONAL_REQUIREMENTS.md in bundle');
  const text = fr!.content;

  // Parse the requirements: split by `## Requirement N:` headers and pull the
  // step-level fields we need to verify the matching.
  const reqBlocks = text.split(/\n## Requirement \d+:\s+/).slice(1);
  assert.ok(reqBlocks.length >= 6, `expected ≥6 requirements (3 import steps + 3 outreach steps), got ${reqBlocks.length}`);

  type ParsedReq = {
    title: string;
    actionLine: string;
    sysResponse: string;
    failureCase: string;
    workflowName: string;
  };
  const parsed: ParsedReq[] = reqBlocks.map((block) => {
    const titleMatch = block.match(/^([^\n]+)\n/);
    const actionMatch = block.match(/- User action:\s*([^\n]+)/);
    const sysMatch = block.match(/- System response:\s*([^\n]+)/);
    const failMatch = block.match(/- Failure case:\s*([^\n]+)/);
    const wfMatch = block.match(/- Related workflow:\s*([^\n]+)/);
    return {
      title: titleMatch?.[1]?.trim() || '',
      actionLine: actionMatch?.[1]?.trim() || '',
      sysResponse: sysMatch?.[1]?.trim() || '',
      failureCase: failMatch?.[1]?.trim() || '',
      workflowName: wfMatch?.[1]?.trim() || ''
    };
  });

  // (a) No two requirements from DIFFERENT workflows share the same Failure-case line.
  const seen = new Map<string, string>(); // failure → workflow name
  for (const req of parsed) {
    if (!req.failureCase) continue;
    if (req.failureCase.startsWith('No step-specific failure mode')) continue; // generic fallback is allowed to repeat
    const prior = seen.get(req.failureCase);
    if (prior && prior !== req.workflowName) {
      assert.fail(`Failure-case repeated across workflows ("${prior}" and "${req.workflowName}"): ${req.failureCase}`);
    }
    seen.set(req.failureCase, req.workflowName);
  }
  console.log(`[T4a] PASS — ${parsed.length} requirements, ${seen.size} unique failure lines, no cross-workflow spam`);

  // (b) Every non-fallback failure shares ≥1 keyword with the step text.
  // Look up branchOn from the original extractions because the rendered
  // requirement omits it — but the staged matcher prefers branchOn first.
  const stepByAction = new Map<string, string>();
  for (const wf of ex.workflows) {
    for (const step of wf.steps) {
      stepByAction.set(step.action.replace(/\.$/, '').trim().toLowerCase(), step.branchOn || '');
    }
  }
  for (const req of parsed) {
    if (!req.failureCase) continue;
    if (req.failureCase.startsWith('No step-specific failure mode')) continue;
    if (req.failureCase.startsWith('Failure surfaces clearly')) continue;
    const branchOn = stepByAction.get(req.actionLine.replace(/\.$/, '').trim().toLowerCase()) || '';
    const stepTokens = tokenizeForFailureMatch(`${req.actionLine} ${req.sysResponse} ${req.title} ${branchOn}`);
    const failureTokens = tokenizeForFailureMatch(req.failureCase);
    let overlap = 0;
    for (const t of failureTokens) if (stepTokens.has(t)) overlap += 1;
    assert.ok(
      overlap >= 1,
      `Failure case has zero keyword overlap with the step it sits under.\n  Step: ${req.actionLine} | ${req.sysResponse}\n  branchOn: ${branchOn}\n  Failure: ${req.failureCase}`
    );
  }
  console.log('[T4b] PASS — every non-fallback failure shares ≥1 keyword with its step (action / systemResponse / branchOn)');
}

function t5RecipeValidationVarianceAtLeastFour() {
  console.log('[T5] recipe-validation workspace — requirement-failure-variance ≥ 4/5…');
  const recipeRoot = path.resolve(REPO_ROOT, '.tmp', 'recipe-validation');
  if (!fs.existsSync(path.join(recipeRoot, 'research', 'extracted', 'workflows.json'))) {
    console.log('[T5] SKIP — .tmp/recipe-validation/research/extracted/ not present (run the recipe first)');
    return;
  }
  const ex = readExtractions(recipeRoot);
  if (!ex) {
    console.log('[T5] SKIP — readExtractions returned undefined');
    return;
  }
  // Generate a fresh workspace into a tempdir and audit it.
  const briefPath = path.join(recipeRoot, 'brief.json');
  const briefRaw = fs.readFileSync(briefPath, 'utf8');
  const briefParsed = JSON.parse(briefRaw) as Partial<ProjectInput>;
  const input: ProjectInput = {
    ...baseProjectInput(),
    ...briefParsed,
    questionnaireAnswers: {
      ...baseProjectInput().questionnaireAnswers,
      ...(briefParsed.questionnaireAnswers || {})
    }
  };
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-g-w5-'));
  try {
    void (async () => {})();
    // createArtifactPackage is async because of the optional zip path; we don't zip here.
    return (async () => {
      const result = await createArtifactPackage({
        input,
        outDir: tmpOut,
        researchFrom: recipeRoot
      });
      const audit = runAudit(result.rootDir);
      const dim = audit.expert?.dimensions.find((d) => d.name === 'requirement-failure-variance');
      assert.ok(dim, 'expected requirement-failure-variance dim in audit.expert');
      assert.ok(
        dim!.score >= 4,
        `requirement-failure-variance must be ≥ 4/5 on the recipe-validation workspace, got ${dim!.score}/5\n  evidence: ${dim!.evidence.join(' | ')}`
      );
      console.log(`[T5] PASS — requirement-failure-variance = ${dim!.score}/5 (evidence: ${dim!.evidence.join(' | ')})`);
    })();
  } finally {
    // Best-effort cleanup; tempdir cleanup runs after the async promise resolves below.
    setTimeout(() => {
      try {
        fs.rmSync(tmpOut, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }, 5_000);
  }
}

async function main() {
  t1BranchOnBeatsSystemResponse();
  t2SystemResponseUsedWhenBranchOnEmpty();
  t3NoOverlapReturnsUndefined();
  t4NoIrrelevantCrossWorkflowSpam();
  await t5RecipeValidationVarianceAtLeastFour();
  console.log('\nAll functional-requirements failure-case tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
