#!/usr/bin/env node
/**
 * Synthesize a ResearchExtractions document from a brief.
 *
 * This is NOT a substitute for real LLM research. It's a deterministic,
 * brief-derived bridge that produces well-shaped extractions for the harness
 * so we can validate the research-driven generator path without burning
 * agent tokens for the 50-iteration loop.
 *
 * Real-world usage: the agent (Claude Code, Codex, Kimi, OpenCode) follows
 * docs/RESEARCH_RECIPE.md and produces a richer extraction document. The
 * generator consumes either output identically.
 *
 * Output layout (matches lib/research/persistence.ts):
 *   <out>/research/extracted/{meta,actors,entities,workflows,
 *                             integrations,risks,gates,antiFeatures,
 *                             conflicts,_removed}.json
 *   <out>/research/USE_CASE_RESEARCH.md, DOMAIN_RESEARCH.md, CONVERGENCE_LOG.md
 *
 * Usage:
 *   tsx scripts/synthesize-research-ontology.ts --input=brief.json --out=<dir>
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Actor,
  AntiFeature,
  Conflict,
  Entity,
  EntityField,
  Gate,
  Integration,
  ResearchExtractions,
  ResearchMeta,
  Risk,
  SourceRef,
  Workflow,
  WorkflowFailure,
  WorkflowStep
} from '../lib/research/schema';
import { SCHEMA_VERSION, validateExtractions } from '../lib/research/schema';
import type { ProjectInput } from '../lib/types';

function getArg(name: string): string | undefined {
  const exact = process.argv.find((a) => a.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

function slug(s: string, max = 32): string {
  return (s || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'item';
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function splitList(s: string): string[] {
  return (s || '')
    .split(/[,;]|\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

function sentencesOf(s: string): string[] {
  return (s || '').split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
}

function briefSourceRef(input: ProjectInput, quote: string): SourceRef {
  const trimmed = (quote || input.productName).slice(0, 280);
  return {
    url: `brief://${slug(input.productName)}`,
    title: `${input.productName} project brief`,
    publisher: 'mvp-builder',
    publishedAt: undefined,
    quote: trimmed,
    fetchedAt: new Date().toISOString()
  };
}

function domainSourceRef(input: ProjectInput, claim: string): SourceRef {
  return {
    url: `domain://${slug(input.productName)}/general-knowledge`,
    title: `${input.productName} domain knowledge`,
    publisher: 'synthesizer',
    quote: claim.slice(0, 280),
    fetchedAt: new Date().toISOString()
  };
}

function withProvenance<T extends object>(
  base: T,
  args: { id: string; origin: 'use-case' | 'domain' | 'both'; sources: SourceRef[]; pass?: number }
) {
  return {
    ...base,
    id: args.id,
    origin: args.origin,
    evidenceStrength: 'moderate' as const,
    sources: args.sources,
    firstSeenInPass: args.pass ?? 1,
    updatedInPass: args.pass ?? 1
  };
}

// ---------- actors ----------
function deriveActors(input: ProjectInput): Actor[] {
  const audience = splitList(input.targetAudience);
  const candidates = audience.length ? audience : ['Primary User', 'Reviewer'];
  const usedIds = new Set<string>();
  const out: Actor[] = [];
  for (const phrase of candidates.slice(0, 4)) {
    const name = titleCase(phrase.replace(/^(a|an|the)\s+/i, '').replace(/optional\s+/i, '').trim()) || 'Primary User';
    let id = `actor-${slug(name)}`;
    if (usedIds.has(id)) id = `${id}-${out.length + 1}`;
    usedIds.add(id);
    const isReviewer = /review|approve|admin|manager|coordinator|owner/i.test(name);
    const isExternal = /caregiver|guardian|guest|customer|public/i.test(name);
    const type: Actor['type'] = isReviewer ? 'reviewer' : isExternal ? 'external' : out.length === 0 ? 'primary-user' : 'secondary-user';
    const responsibility = `Use ${input.productName} to ${type === 'reviewer' ? `review and approve ${name.toLowerCase()} actions` : `complete the ${name.toLowerCase()} workflow`}.`;
    out.push(
      withProvenance(
        {
          name,
          type,
          responsibilities: [responsibility, `Operate within scope defined for ${name}.`],
          visibility: type === 'primary-user' ? ['Own records', 'Own assignments'] : type === 'reviewer' ? ['All in-scope records'] : ['Limited records per visibility rule'],
          authMode: 'authenticated' as const
        },
        { id, origin: 'use-case', sources: [briefSourceRef(input, `Audience: ${input.targetAudience}`)] }
      )
    );
  }
  if (out.length < 2) {
    out.push(
      withProvenance(
        {
          name: 'Reviewer',
          type: 'reviewer',
          responsibilities: [`Review ${input.productName} records before they are considered final.`],
          visibility: ['All in-scope records'],
          authMode: 'authenticated' as const
        },
        { id: 'actor-reviewer', origin: 'use-case', sources: [briefSourceRef(input, `Reviewer implied by ${input.productName} workflow`)] }
      )
    );
  }
  return out;
}

// ---------- entities ----------
function deriveEntities(input: ProjectInput, actors: Actor[]): Entity[] {
  const features = splitList(input.mustHaveFeatures).slice(0, 6);
  const dataPhrases = splitList(input.dataAndIntegrations).slice(0, 6);
  const seedPhrases = Array.from(new Set([...features, ...dataPhrases]))
    .filter((p) => !/integration|reminder|notification|email|sms|export|dashboard|mobile|view/i.test(p))
    .slice(0, 5);

  const entities: Entity[] = [];
  const usedIds = new Set<string>();
  const productSlug = slug(input.productName, 16);

  function makeEntity(label: string, isCore: boolean, idHint?: string): Entity {
    const name = titleCase(label.replace(/^(create|track|manage|the)\s+/i, '')) || label;
    let id = `entity-${idHint || slug(name)}`;
    if (usedIds.has(id)) id = `${id}-${entities.length + 1}`;
    usedIds.add(id);
    const fields: EntityField[] = [
      { name: `${slug(name).replace(/-/g, '')}Id`, type: 'string', description: `Stable identifier for ${name}.`, required: true, example: `${productSlug}-${slug(name).slice(0, 8)}-001` },
      { name: 'title', type: 'string', description: `Human-readable label for ${name}.`, required: true, example: `Sample ${name}` },
      { name: 'status', type: 'enum', description: `Current ${name} state.`, required: true, enumValues: ['draft', 'active', 'archived'], example: 'active' },
      { name: 'createdAt', type: 'date', description: `When the ${name} record was created.`, required: true, example: new Date().toISOString() }
    ];
    const ownerIds = actors.length ? [actors[0].id] : [];
    const sample: Record<string, unknown> = {};
    for (const f of fields) sample[f.name] = f.example;
    return withProvenance(
      {
        name,
        description: `Domain record representing a ${name.toLowerCase()} in the ${input.productName} workflow.`,
        fields,
        relationships: entities.length ? [`Referenced by ${entities[0].name}`] : [],
        ownerActors: ownerIds,
        riskTypes: ['operational'],
        sample
      },
      { id, origin: 'use-case', sources: [briefSourceRef(input, `Must-haves: ${input.mustHaveFeatures}`)] }
    );
  }

  // First entity: core record from product (e.g., "Family Task Board" -> "Task")
  const productCore = (() => {
    const tokens = input.productName.split(/\s+/).filter((t) => t.length > 2 && !/board|tracker|portal|app|tool|hub|planner|manager|module|coordinator|catalog|module|book/i.test(t));
    return tokens.length ? tokens[tokens.length - 1] : 'Record';
  })();
  entities.push(makeEntity(productCore, true, 'core'));

  // Then up to 4 entities from feature seeds, deduped against productCore
  for (const seed of seedPhrases) {
    if (entities.length >= 5) break;
    const candidate = titleCase(seed.replace(/^(create|track|manage|the)\s+/i, ''));
    if (!candidate || candidate.toLowerCase().includes(productCore.toLowerCase())) continue;
    if (entities.some((e) => e.name.toLowerCase().includes(candidate.toLowerCase()) || candidate.toLowerCase().includes(e.name.toLowerCase()))) continue;
    entities.push(makeEntity(candidate, false));
  }

  // Always add a Member Profile entity to cover actor-side data
  if (!entities.find((e) => /member|profile|account|user/i.test(e.name))) {
    entities.push(
      withProvenance(
        {
          name: 'Member Profile',
          description: `Account record for an actor of ${input.productName} (${actors.map((a) => a.name).join(' / ')}).`,
          fields: [
            { name: 'memberId', type: 'string', description: 'Stable member identifier.', required: true, example: `${productSlug}-mem-001` },
            { name: 'displayName', type: 'string', description: 'Human-readable member name.', required: true, example: 'Avery Reviewer' },
            { name: 'role', type: 'enum', description: 'Primary role for this member.', required: true, enumValues: actors.map((a) => slug(a.name)), example: slug(actors[0]?.name || 'primary-user') },
            { name: 'createdAt', type: 'date', description: 'When the member joined.', required: true, example: new Date().toISOString() }
          ],
          relationships: ['Owns Core Record entries'],
          ownerActors: actors.length ? [actors[0].id] : [],
          riskTypes: ['privacy'],
          sample: { memberId: `${productSlug}-mem-001`, displayName: 'Avery Reviewer', role: slug(actors[0]?.name || 'primary-user'), createdAt: new Date().toISOString() }
        },
        { id: 'entity-member-profile', origin: 'use-case', sources: [briefSourceRef(input, `Audience: ${input.targetAudience}`)] }
      )
    );
  }

  // And an Audit Entry to satisfy the audit-trail expectation
  entities.push(
    withProvenance(
      {
        name: 'Audit Entry',
        description: `Append-only record of who changed what in ${input.productName}.`,
        fields: [
          { name: 'entryId', type: 'string', description: 'Stable audit identifier.', required: true, example: `${productSlug}-audit-001` },
          { name: 'recordRef', type: 'string', description: 'Reference to the changed record.', required: true, example: `${productSlug}-${slug(productCore).slice(0, 8)}-001` },
          { name: 'actorMemberId', type: 'string', description: 'Member who performed the action.', required: true, example: `${productSlug}-mem-001` },
          { name: 'action', type: 'enum', description: 'What changed.', required: true, enumValues: ['create', 'update', 'delete', 'state-change'], example: 'state-change' },
          { name: 'recordedAt', type: 'date', description: 'Server timestamp the entry was recorded.', required: true, example: new Date().toISOString() }
        ],
        relationships: ['References Member Profile', 'References any core record'],
        ownerActors: actors.length ? [actors[0].id] : [],
        riskTypes: ['compliance'],
        sample: { entryId: `${productSlug}-audit-001`, recordRef: `${productSlug}-${slug(productCore).slice(0, 8)}-001`, actorMemberId: `${productSlug}-mem-001`, action: 'state-change', recordedAt: new Date().toISOString() }
      },
      { id: 'entity-audit-entry', origin: 'domain', sources: [domainSourceRef(input, 'Audit-trail entity standard for any reviewable workflow')] }
    )
  );

  return entities;
}

// ---------- workflows ----------
function deriveWorkflows(input: ProjectInput, actors: Actor[], entities: Entity[]): Workflow[] {
  const features = splitList(input.mustHaveFeatures).slice(0, 4);
  const primary = input.questionnaireAnswers['primary-workflow'] || features[0] || `Use ${input.productName}`;
  const primaryActor = actors[0]?.id || 'actor-primary-user';
  const reviewerActor = actors.find((a) => a.type === 'reviewer')?.id || actors[1]?.id || primaryActor;
  const coreEntity = entities[0]?.id || 'entity-core';
  const memberEntity = entities.find((e) => e.id === 'entity-member-profile')?.id || coreEntity;
  const auditEntity = entities.find((e) => e.id === 'entity-audit-entry')?.id || coreEntity;

  const workflows: Workflow[] = [];

  // Workflow 1: primary creation/management
  const wf1Steps: WorkflowStep[] = [
    { order: 1, actor: primaryActor, action: `Open ${input.productName} and authenticate`, systemResponse: 'Show the workspace dashboard scoped to the actor.', preconditions: ['Account exists'] },
    { order: 2, actor: primaryActor, action: `Create a new ${entities[0]?.name || 'record'}`, systemResponse: `Persist the ${entities[0]?.name || 'record'} with required fields and emit an audit entry.`, postconditions: [`${entities[0]?.name || 'record'} appears in the dashboard`] },
    { order: 3, actor: primaryActor, action: `Edit the ${entities[0]?.name || 'record'} title or status`, systemResponse: 'Update the record, write audit entry, and surface change to allowed actors.', branchOn: 'Validation failure' },
    { order: 4, actor: reviewerActor, action: `Review the ${entities[0]?.name || 'record'} before it is considered final`, systemResponse: 'Mark the record reviewed; lock further state changes for this stage.', preconditions: ['Record exists'] },
    { order: 5, actor: primaryActor, action: 'View the dashboard for status', systemResponse: 'Render the current status and last updates with audit metadata.' }
  ];
  workflows.push(
    withProvenance(
      {
        name: titleCase(primary).slice(0, 60) || `${input.productName} core workflow`,
        primaryActor,
        secondaryActors: actors.filter((a) => a.id !== primaryActor).slice(0, 2).map((a) => a.id),
        steps: wf1Steps,
        failureModes: [
          { trigger: 'Required field missing', effect: 'Record save fails and the user is shown a clear validation error.', mitigation: 'Validate required fields client-side before submit; show error inline.' },
          { trigger: 'Reviewer attempts to edit a locked record', effect: 'Lock is preserved and the reviewer is told why the record is locked.', mitigation: 'Surface lock state in the record header and gate writes server-side.' }
        ] as WorkflowFailure[],
        entitiesTouched: [coreEntity, auditEntity],
        acceptancePattern: `Given a ${actors[0]?.name || 'primary user'}, when they create a ${entities[0]?.name || 'record'} and a ${actors.find((a) => a.type === 'reviewer')?.name || 'reviewer'} reviews it, then the dashboard shows the reviewed record and an audit entry exists.`
      },
      { id: 'workflow-primary', origin: 'use-case', sources: [briefSourceRef(input, primary)] }
    )
  );

  // Workflow 2: review / approval (if there is a distinct reviewer)
  if (reviewerActor !== primaryActor) {
    const wf2Steps: WorkflowStep[] = [
      { order: 1, actor: reviewerActor, action: 'Open the review queue', systemResponse: `Show ${entities[0]?.name || 'records'} pending review for the reviewer's scope.` },
      { order: 2, actor: reviewerActor, action: `Open one ${entities[0]?.name || 'record'} for review`, systemResponse: 'Surface the record and prior audit entries.' },
      { order: 3, actor: reviewerActor, action: 'Approve or send back with notes', systemResponse: 'Persist review decision; notify the originator.', branchOn: 'Decision: approve / revise' }
    ];
    workflows.push(
      withProvenance(
        {
          name: `${input.productName} review`,
          primaryActor: reviewerActor,
          secondaryActors: [primaryActor],
          steps: wf2Steps,
          failureModes: [
            { trigger: 'Reviewer disagrees with the change', effect: 'Originator gets a revise-with-notes signal instead of a silent reject.', mitigation: 'Require a notes field for revise decisions.' }
          ] as WorkflowFailure[],
          entitiesTouched: [coreEntity, auditEntity],
          acceptancePattern: `Given a ${actors[0]?.name || 'primary user'} created record, when the reviewer approves with notes, the record state advances and the audit log captures the decision.`
        },
        { id: 'workflow-review', origin: 'use-case', sources: [briefSourceRef(input, `Reviewer in ${input.targetAudience}`)] }
      )
    );
  }

  // Workflow 3: account / member management
  workflows.push(
    withProvenance(
      {
        name: `${input.productName} member management`,
        primaryActor: reviewerActor,
        secondaryActors: [primaryActor],
        steps: [
          { order: 1, actor: reviewerActor, action: 'Invite a member to the workspace', systemResponse: 'Persist Member Profile draft and send invite token.' },
          { order: 2, actor: primaryActor, action: 'Accept invite and complete profile', systemResponse: 'Activate Member Profile and surface scope-appropriate dashboard.' },
          { order: 3, actor: reviewerActor, action: 'Adjust member role', systemResponse: 'Update Member Profile and write audit entry.' }
        ],
        failureModes: [{ trigger: 'Invite token expired', effect: 'Member sees a clear expired-token message.', mitigation: 'Short token TTL + obvious resend path.' }],
        entitiesTouched: [memberEntity, auditEntity],
        acceptancePattern: `Given a workspace, when a reviewer invites a member, the member can accept and appear with the correct role.`
      },
      { id: 'workflow-member-management', origin: 'domain', sources: [domainSourceRef(input, 'Standard role-management workflow for any team workspace')] }
    )
  );

  return workflows;
}

// ---------- integrations / risks / gates / anti-features / conflicts ----------
function deriveIntegrations(input: ProjectInput): Integration[] {
  const integrations: Integration[] = [];
  const dataAndInt = `${input.dataAndIntegrations || ''} ${input.mustHaveFeatures || ''}`.toLowerCase();
  if (/email|reminder|notif/i.test(dataAndInt)) {
    integrations.push(
      withProvenance(
        {
          name: 'Email reminders',
          vendor: 'Generic SMTP / mocked',
          category: 'email' as const,
          purpose: `Send reminders to ${input.productName} members.`,
          required: false,
          envVar: 'SMTP_URL',
          mockedByDefault: true,
          failureModes: ['Provider rate-limits transactional emails', 'Bounce handling not implemented'],
          popularity: 'common' as const,
          alternatives: ['Resend', 'Postmark', 'SES']
        },
        { id: 'integration-email-reminders', origin: 'use-case', sources: [briefSourceRef(input, `Reminder requirement: ${input.dataAndIntegrations}`)] }
      )
    );
  }
  return integrations;
}

function splitRiskClauses(s: string): string[] {
  // Split on sentence terminators OR commas/semicolons that look like list separators between
  // risk clauses (i.e., ", X is", ", Y could", ", Z may"). Keeps clause-level granularity for
  // run-on risk paragraphs that the briefs typically contain.
  return (s || '')
    .split(/(?:[.!?]+\s+)|(?:,\s+(?=[A-Za-z][^,]+(?:\s+(?:are|is|may|could|might|will|can|would)\s+))|;\s*)/)
    .map((p) => p.replace(/^and\s+/i, '').trim())
    .filter((p) => p.length > 12);
}

function deriveRisks(input: ProjectInput, actors: Actor[], entities: Entity[]): Risk[] {
  const risks: Risk[] = [];
  const riskList = splitRiskClauses(input.risks).slice(0, 4);
  const childOrPrivacy = /child|kid|patient|medical|hipaa|coppa|family/i.test(`${input.productName} ${input.targetAudience} ${input.risks}`);
  const actorIds = actors.map((a) => a.id);
  const entityIds = entities.map((e) => e.id);

  for (const [i, sentence] of riskList.entries()) {
    risks.push(
      withProvenance(
        {
          category: childOrPrivacy && i === 0 ? ('privacy' as const) : ('product' as const),
          severity: i === 0 ? ('high' as const) : ('medium' as const),
          description: sentence,
          affectedActors: actorIds.slice(0, 2),
          affectedEntities: entityIds.slice(0, 2),
          mitigation: `Address in early phases: surface as a gate question and verify with at least one acceptance test.`
        },
        { id: `risk-${i + 1}`, origin: 'use-case', sources: [briefSourceRef(input, sentence)] }
      )
    );
  }
  if (childOrPrivacy && !risks.some((r) => r.category === 'privacy')) {
    risks.unshift(
      withProvenance(
        {
          category: 'privacy' as const,
          severity: 'high' as const,
          description: `Privacy-sensitive data flows for ${input.productName} (audience includes vulnerable users).`,
          affectedActors: actorIds,
          affectedEntities: entityIds,
          mitigation: 'Default to least-visibility; explicit opt-in for cross-actor visibility; gate review for any new visibility rule.'
        },
        { id: 'risk-privacy', origin: 'domain', sources: [domainSourceRef(input, 'Privacy is a known concern for products with vulnerable users')] }
      )
    );
  }
  return risks;
}

function deriveGates(input: ProjectInput, risks: Risk[]): Gate[] {
  const gates: Gate[] = [];
  if (risks.find((r) => r.category === 'privacy')) {
    gates.push(
      withProvenance(
        {
          name: 'Privacy review gate',
          rationale: `Visibility rules in ${input.productName} can leak data across actor boundaries; require explicit privacy review before any phase that adds a new visibility rule.`,
          mandatedBy: 'safety' as const,
          mandatedByDetail: 'Audience includes vulnerable users — privacy bugs are not just product bugs.',
          applies: 'always' as const,
          evidenceRequired: ['Visibility-rule diff per phase', 'Test that proves cross-actor leakage is blocked'],
          blockingPhases: ['phase-implementation']
        },
        { id: 'gate-privacy-review', origin: 'domain', sources: [domainSourceRef(input, 'Privacy gate standard for products with vulnerable users')] }
      )
    );
  }
  return gates;
}

function deriveAntiFeatures(input: ProjectInput): AntiFeature[] {
  const items = sentencesOf(input.nonGoals).slice(0, 4);
  return items.map((s, i) => ({
    id: `anti-${i + 1}`,
    description: s,
    rationale: `Non-goal declared in the brief: keep ${input.productName} v1 scoped.`,
    sourcesAgreeing: [briefSourceRef(input, s)]
  }));
}

function deriveConflicts(): Conflict[] {
  return [];
}

// ---------- top-level ----------
export function synthesizeExtractions(input: ProjectInput): ResearchExtractions {
  const actors = deriveActors(input);
  const entities = deriveEntities(input, actors);
  const workflows = deriveWorkflows(input, actors, entities);
  const integrations = deriveIntegrations(input);
  const risks = deriveRisks(input, actors, entities);
  const gates = deriveGates(input, risks);
  const antiFeatures = deriveAntiFeatures(input);
  const conflicts = deriveConflicts();

  const briefHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const meta: ResearchMeta = {
    briefHash,
    schemaVersion: SCHEMA_VERSION,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalPasses: { useCase: 1, domain: 1 },
    finalCriticScores: { useCase: 70, domain: 65 },
    convergedEarly: { useCase: false, domain: false },
    totalTokensUsed: 0,
    modelUsed: 'synthesizer-deterministic',
    researcher: 'mock'
  };

  return {
    meta,
    actors,
    entities,
    workflows,
    integrations,
    risks,
    gates,
    antiFeatures,
    conflicts,
    removed: []
  };
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function writeMarkdown(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function syntheticNarrative(kind: 'use-case' | 'domain', input: ProjectInput, ex: ResearchExtractions): string {
  const lines: string[] = [];
  lines.push(`# ${kind === 'use-case' ? 'USE_CASE' : 'DOMAIN'}_RESEARCH for ${input.productName}`);
  lines.push('');
  lines.push(`> Synthesized deterministically from the project brief. NOT a substitute for real LLM-driven research. See docs/RESEARCH_RECIPE.md for the recipe an agent runs to produce a richer extraction.`);
  lines.push('');
  lines.push(`## Brief excerpt`);
  lines.push(input.productIdea);
  lines.push('');
  lines.push(`## Audience`);
  lines.push(input.targetAudience);
  lines.push('');
  if (kind === 'use-case') {
    lines.push(`## Workflows derived from must-haves`);
    for (const wf of ex.workflows) lines.push(`- ${wf.name}: ${wf.steps.length} steps, ${wf.failureModes.length} failure modes`);
  } else {
    lines.push(`## Domain entities derived from data + integrations`);
    for (const e of ex.entities) lines.push(`- ${e.name}: ${e.fields.length} fields, ${e.relationships.length} relationships`);
  }
  return lines.join('\n') + '\n';
}

function syntheticConvergenceLog(input: ProjectInput, ex: ResearchExtractions): string {
  return `# Research convergence log\n\nBrief hash: \`${ex.meta.briefHash}\`\nMode: synthesized (deterministic)\n\nSee docs/RESEARCH_RECIPE.md for the agent-driven path that produces real research.\n`;
}

export function writeSynthesizedToWorkspace(workspaceRoot: string, input: ProjectInput, ex: ResearchExtractions): void {
  const issues = validateExtractions(ex);
  if (issues.length) {
    const summary = issues.slice(0, 10).map((i) => `  - ${i.path}: ${i.message}`).join('\n');
    throw new Error(`Synthesized extractions failed schema validation (${issues.length} issues):\n${summary}`);
  }
  const root = path.join(workspaceRoot, 'research');
  writeMarkdown(path.join(root, 'USE_CASE_RESEARCH.md'), syntheticNarrative('use-case', input, ex));
  writeMarkdown(path.join(root, 'DOMAIN_RESEARCH.md'), syntheticNarrative('domain', input, ex));
  writeMarkdown(path.join(root, 'CONVERGENCE_LOG.md'), syntheticConvergenceLog(input, ex));
  writeJson(path.join(root, 'extracted', 'meta.json'), ex.meta);
  writeJson(path.join(root, 'extracted', 'actors.json'), ex.actors);
  writeJson(path.join(root, 'extracted', 'entities.json'), ex.entities);
  writeJson(path.join(root, 'extracted', 'workflows.json'), ex.workflows);
  writeJson(path.join(root, 'extracted', 'integrations.json'), ex.integrations);
  writeJson(path.join(root, 'extracted', 'risks.json'), ex.risks);
  writeJson(path.join(root, 'extracted', 'gates.json'), ex.gates);
  writeJson(path.join(root, 'extracted', 'antiFeatures.json'), ex.antiFeatures);
  writeJson(path.join(root, 'extracted', 'conflicts.json'), ex.conflicts);
  writeJson(path.join(root, 'extracted', '_removed.json'), ex.removed);
}

function main() {
  const inputArg = getArg('input');
  const outArg = getArg('out');
  if (!inputArg || !outArg) {
    console.error('Usage: tsx scripts/synthesize-research-ontology.ts --input=brief.json --out=<dir>');
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(path.resolve(inputArg), 'utf8')) as ProjectInput;
  const ex = synthesizeExtractions(input);
  const out = path.resolve(outArg);
  writeSynthesizedToWorkspace(out, input, ex);
  console.log(
    `Synthesized research for "${input.productName}" → ${path.relative(process.cwd(), path.join(out, 'research'))} (actors=${ex.actors.length}, entities=${ex.entities.length}, workflows=${ex.workflows.length}, risks=${ex.risks.length}, gates=${ex.gates.length})`
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    main();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
