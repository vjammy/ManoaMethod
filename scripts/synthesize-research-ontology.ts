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
  DbType,
  DiscoveryArtifacts,
  Entity,
  EntityField,
  ForeignKey,
  Gate,
  Integration,
  JobToBeDone,
  ResearchExtractions,
  ResearchMeta,
  Risk,
  Screen,
  ScreenAction,
  ScreenField,
  ScreenSection,
  SourceRef,
  TestCase,
  UxFlowEdge,
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

/**
 * Pick a short, verb+noun workflow name. Replaces the prior
 * `titleCase(primary-workflow-answer).slice(0, 60)` which produced ugly
 * sentence-fragment names like "Sales Development Reps And Their Managers.
 * Sets Up The Works" for briefs that put the whole flow in the questionnaire.
 *
 * Strategy: pick a verb based on must-have feature keywords, then append the
 * core entity name. Falls back to "Manage <Entity>".
 */
function pickPrimaryVerb(input: ProjectInput): string {
  const features = (input.mustHaveFeatures || '').toLowerCase();
  // Order matters — earliest match wins. Specific verbs first, generic last.
  if (/\bqualif/i.test(features)) return 'Qualify';
  if (/\bschedul|book|reserve|appointment\b/.test(features)) return 'Schedule';
  if (/\bimport|intake|onboard\b/.test(features)) return 'Import';
  if (/\bcapture|enroll|register\b/.test(features)) return 'Capture';
  if (/\bfollow[\s-]?up|outreach|call|email\b/.test(features)) return 'Follow up on';
  if (/\b(track|log|record|monitor|inventor)\b/.test(features)) return 'Track';
  if (/\b(plan|coordinate|organi[sz]e)\b/.test(features)) return 'Plan';
  if (/\b(approve|review|moderat)\b/.test(features)) return 'Manage';
  if (/\b(assign|allocate|dispatch)\b/.test(features)) return 'Assign';
  return 'Manage';
}

function deriveWorkflowName(
  intent: 'primary' | 'review' | 'members',
  input: ProjectInput,
  entityName: string
): string {
  if (intent === 'review') return `Review ${entityName}`;
  if (intent === 'members') return 'Manage members';
  const verb = pickPrimaryVerb(input);
  return `${verb} ${entityName}`;
}

function deriveWorkflows(input: ProjectInput, actors: Actor[], entities: Entity[]): Workflow[] {
  const features = splitList(input.mustHaveFeatures).slice(0, 4);
  const primary = input.questionnaireAnswers['primary-workflow'] || features[0] || `Use ${input.productName}`;
  const primaryActor = actors[0]?.id || 'actor-primary-user';
  const reviewerActor = actors.find((a) => a.type === 'reviewer')?.id || actors[1]?.id || primaryActor;
  const coreEntity = entities[0]?.id || 'entity-core';
  const coreEntityName = entities[0]?.name || 'Record';
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
        name: deriveWorkflowName('primary', input, coreEntityName),
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
          name: deriveWorkflowName('review', input, coreEntityName),
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
        name: deriveWorkflowName('members', input, coreEntityName),
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
// ---------- screens (Phase E2) ----------

function deriveScreens(
  input: ProjectInput,
  actors: Actor[],
  entities: Entity[],
  workflows: Workflow[]
): Screen[] {
  const out: Screen[] = [];
  const primaryActor = actors[0]?.id || 'actor-primary-user';
  const primaryEntity = entities[0];

  // Entry screen — sign-in / orient
  out.push(
    withProvenance(
      {
        name: `${input.productName} entry`,
        route: '/',
        primaryActor,
        secondaryActors: actors.filter((a) => a.id !== primaryActor).map((a) => a.id),
        purpose: `Authenticate and orient the user before any ${input.productName} workflow begins.`,
        sections: [
          { kind: 'header', title: 'Welcome', purpose: `Restate the value of ${input.productName} in one sentence.` },
          { kind: 'form', title: 'Sign in', purpose: 'Capture credentials or magic-link request.' },
          { kind: 'navigation', title: 'Continue', purpose: 'Route the authenticated user to the dashboard.' }
        ] as ScreenSection[],
        fields: [
          { name: 'email', kind: 'input', label: 'Work email', validation: 'required, email format', copy: 'We use this only to send the sign-in link.' },
          { name: 'continueButton', kind: 'action', label: 'Continue', copy: 'Sign in to continue.' }
        ] as ScreenField[],
        states: {
          empty: 'Show the welcome message, single email field, and one continue button.',
          loading: 'Disable the continue button and show "Sending sign-in link…".',
          error: 'Show the email field with the validation error inline; keep the form usable.',
          populated: 'On success, redirect to the dashboard.'
        },
        actions: [
          { label: 'Continue', kind: 'primary', navTo: 'screen-dashboard' }
        ] as ScreenAction[],
        navIn: [],
        navOut: [{ screen: 'screen-dashboard', via: 'Continue' }]
      },
      {
        id: 'screen-entry',
        origin: 'use-case',
        sources: [briefSourceRef(input, `Entry experience for ${input.productName}`)]
      }
    )
  );

  // Dashboard screen — single source of "what's next"
  out.push(
    withProvenance(
      {
        name: `${input.productName} dashboard`,
        route: '/dashboard',
        primaryActor,
        secondaryActors: actors.filter((a) => a.id !== primaryActor).map((a) => a.id),
        purpose: `Single screen the actor lands on; surfaces the next action and recent ${primaryEntity?.name || 'records'}.`,
        sections: [
          { kind: 'header', title: 'Greeting and next action', purpose: 'Tell the actor what to do next.' },
          { kind: 'list', title: `Recent ${primaryEntity?.name || 'records'}`, purpose: `Show the latest ${primaryEntity?.name || 'records'} owned by the actor.` },
          { kind: 'summary', title: 'Status summary', purpose: 'Show counts grouped by status enum.' }
        ] as ScreenSection[],
        fields: primaryEntity
          ? primaryEntity.fields.slice(0, 4).map((f) => ({
              name: f.name,
              kind: 'display' as const,
              label: titleCase(f.name),
              refEntityField: `${primaryEntity.id}.${f.name}`,
              copy: f.description
            })) as ScreenField[]
          : [],
        states: {
          empty: `No ${primaryEntity?.name || 'records'} yet — show a primary call to create the first one.`,
          loading: 'Skeleton rows for the recent list; counts show "—".',
          error: 'Show a banner with the failure reason; keep the create action usable.',
          populated: `Show recent ${primaryEntity?.name || 'records'} sorted by most recent, plus per-status counts.`
        },
        actions: [
          { label: `Create ${primaryEntity?.name || 'record'}`, kind: 'primary', navTo: 'screen-create' },
          { label: `Open ${primaryEntity?.name || 'record'}`, kind: 'navigation', navTo: 'screen-detail' }
        ] as ScreenAction[],
        navIn: [{ screen: 'screen-entry', via: 'Continue' }],
        navOut: [
          { screen: 'screen-create', via: `Create ${primaryEntity?.name || 'record'}` },
          { screen: 'screen-detail', via: `Open ${primaryEntity?.name || 'record'}` }
        ]
      },
      {
        id: 'screen-dashboard',
        origin: 'use-case',
        sources: [briefSourceRef(input, `Dashboard for ${input.productName}`)]
      }
    )
  );

  // One screen per workflow (the "do the workflow" surface)
  for (let i = 0; i < workflows.length; i += 1) {
    const wf = workflows[i];
    const wfActor = wf.primaryActor || primaryActor;
    const wfEntityId = wf.entitiesTouched[0];
    const wfEntity = wfEntityId ? entities.find((e) => e.id === wfEntityId) : primaryEntity;
    const inputStep = wf.steps.find((s) => /\b(create|edit|enroll|capture|log|update|qualify|approve|review|set|mark)\b/i.test(s.action));
    const screenId = `screen-${slug(wf.name).slice(0, 24) || `workflow-${i + 1}`}-${i + 1}`;
    const fields: ScreenField[] = wfEntity
      ? wfEntity.fields.slice(0, 6).map((f) => ({
          name: f.name,
          kind: 'input' as const,
          label: titleCase(f.name),
          refEntityField: `${wfEntity.id}.${f.name}`,
          validation: f.required ? 'required' : 'optional',
          copy: f.description
        }))
      : [];
    if (inputStep) {
      fields.push({
        name: 'submit',
        kind: 'action',
        label: inputStep.action.length > 40 ? `${inputStep.action.slice(0, 37)}…` : inputStep.action,
        copy: inputStep.systemResponse
      });
    }
    out.push(
      withProvenance(
        {
          name: `${wf.name} screen`,
          route: `/${slug(wf.name).slice(0, 24)}`,
          primaryActor: wfActor,
          secondaryActors: wf.secondaryActors,
          purpose: `Surface where the actor performs ${wf.name}. ${wf.acceptancePattern}`,
          sections: [
            { kind: 'header', title: wf.name, purpose: 'Title plus a one-line intent.' },
            { kind: 'form', title: 'Inputs', purpose: `Capture the fields required to advance ${wf.name}.` },
            { kind: 'detail', title: 'Outcome', purpose: 'Show the system response after the action.' },
            { kind: 'navigation', title: 'Next', purpose: 'Either return to dashboard or proceed to detail.' }
          ] as ScreenSection[],
          fields,
          states: {
            empty: `Show the form pre-populated only with safe defaults from research; ${primaryEntity?.name || 'record'} not yet created.`,
            loading: 'Disable the primary action while the system response is in flight.',
            error: wf.failureModes[0]
              ? `Surface the trigger "${wf.failureModes[0].trigger}" inline with the researched mitigation message.`
              : 'Show a clear validation banner naming the failing field.',
            populated: 'Show the persisted record with the resulting state and a link to the detail screen.'
          },
          actions: [
            { label: inputStep ? inputStep.action.slice(0, 40) : `Run ${wf.name}`, kind: 'primary', refWorkflowStep: inputStep ? `${wf.id}:${inputStep.order}` : `${wf.id}:1`, navTo: 'screen-detail' },
            { label: 'Back to dashboard', kind: 'secondary', navTo: 'screen-dashboard' }
          ] as ScreenAction[],
          navIn: [{ screen: 'screen-dashboard', via: 'Open workflow' }],
          navOut: [
            { screen: 'screen-detail', via: inputStep ? inputStep.action.slice(0, 40) : 'Continue' },
            { screen: 'screen-dashboard', via: 'Back to dashboard' }
          ]
        },
        {
          id: screenId,
          origin: 'use-case',
          sources: [briefSourceRef(input, `Screen for ${wf.name}`)]
        }
      )
    );
  }

  // One detail screen per primary entity (capped at 3 to keep scope honest)
  for (const e of entities.slice(0, 3)) {
    const fields: ScreenField[] = e.fields.slice(0, 8).map((f) => ({
      name: f.name,
      kind: 'display' as const,
      label: titleCase(f.name),
      refEntityField: `${e.id}.${f.name}`,
      copy: f.description
    }));
    out.push(
      withProvenance(
        {
          name: `${e.name} detail`,
          route: `/${slug(e.name)}/:id`,
          primaryActor,
          secondaryActors: actors.filter((a) => a.id !== primaryActor).map((a) => a.id),
          purpose: `Show one ${e.name} record with all fields visible and history of edits.`,
          sections: [
            { kind: 'header', title: 'Record header', purpose: `Show ${e.name} title and current state.` },
            { kind: 'detail', title: 'Fields', purpose: 'Read-only view of the entity fields.' },
            { kind: 'list', title: 'Audit history', purpose: 'Show recent changes from Audit Entry records.' }
          ] as ScreenSection[],
          fields,
          states: {
            empty: `Record not found — show a "Back to dashboard" link and the requested ID.`,
            loading: 'Skeleton rows for fields and audit history.',
            error: 'Show the failure reason inline; offer a retry.',
            populated: 'Show all fields with their values and the last 5 audit entries.'
          },
          actions: [
            { label: 'Edit', kind: 'primary', navTo: 'screen-dashboard' },
            { label: 'Back to dashboard', kind: 'secondary', navTo: 'screen-dashboard' }
          ] as ScreenAction[],
          navIn: [{ screen: 'screen-dashboard', via: `Open ${e.name}` }],
          navOut: [{ screen: 'screen-dashboard', via: 'Back to dashboard' }]
        },
        {
          id: `screen-detail-${slug(e.name)}`,
          origin: 'use-case',
          sources: [briefSourceRef(input, `Detail for ${e.name}`)]
        }
      )
    );
  }

  // Map any navTo: 'screen-detail' / 'screen-create' literal refs to actual screen ids when present.
  const detailScreen = out.find((s) => s.id.startsWith('screen-detail-'));
  const firstWorkflowScreen = out.find((s) => s.id !== 'screen-entry' && s.id !== 'screen-dashboard' && !s.id.startsWith('screen-detail-'));

  for (const s of out) {
    for (const a of s.actions) {
      if (a.navTo === 'screen-create' && firstWorkflowScreen) a.navTo = firstWorkflowScreen.id;
      if (a.navTo === 'screen-detail' && detailScreen) a.navTo = detailScreen.id;
    }
    for (const n of s.navOut) {
      if (n.screen === 'screen-create' && firstWorkflowScreen) n.screen = firstWorkflowScreen.id;
      if (n.screen === 'screen-detail' && detailScreen) n.screen = detailScreen.id;
    }
  }

  // Populate navIn[] from every other screen's navOut so the audit credits symmetry.
  // We rebuild navIn for each screen as: ∀ s', for each entry in s'.navOut targeting s, add {screen: s'.id, via}.
  for (const s of out) {
    const incoming: typeof s.navIn = [];
    for (const other of out) {
      if (other.id === s.id) continue;
      for (const n of other.navOut) {
        if (n.screen === s.id) {
          incoming.push({ screen: other.id, via: n.via });
        }
      }
    }
    s.navIn = incoming;
  }

  return out;
}

// ---------- discovery + JTBD (Phase E4) ----------

function deriveDiscovery(input: ProjectInput): DiscoveryArtifacts {
  // Lightweight templated stubs from the brief. Real-recipe runs (an LLM agent
  // executing docs/RESEARCH_RECIPE.md Pass 0) populate richer ideaCritique
  // and competingAlternatives — synth deliberately leaves those mostly empty.
  const problem = (input.problemStatement || `Users struggle to ${input.productIdea?.slice(0, 80) || 'accomplish the workflow'}`).trim();
  const solution = `${input.productName} provides a researched, role-aware workflow that ${input.mustHaveFeatures?.split(/[,;]/)[0]?.trim() || 'covers the must-have feature'}.`;
  const audienceParts = splitList(input.targetAudience).slice(0, 2);
  const headline = `${input.productName} for ${audienceParts.join(' and ') || 'the brief audience'}: cut friction in the v1 must-have flow without bolting on speculative scope.`;
  const outcomes = splitList(input.successMetrics).slice(0, 3).filter(Boolean);
  const fallbackOutcomes = [
    `Audience completes the must-have flow on the first attempt.`,
    `Reviewers can confirm correctness without hidden chat context.`,
    `No silent failures: every researched failure mode is surfaced to the user.`
  ];
  return {
    valueProposition: {
      headline,
      oneLineProblem: problem.length > 200 ? `${problem.slice(0, 197)}…` : problem,
      oneLineSolution: solution.length > 200 ? `${solution.slice(0, 197)}…` : solution,
      topThreeOutcomes: (outcomes.length ? outcomes : fallbackOutcomes).slice(0, 3)
    },
    whyNow: {
      driver: `Users articulated this need in the brief; existing tools don't cover the must-have flow end-to-end.`,
      recentChange: `Brief assembled at ${new Date().toISOString().slice(0, 10)}; the must-have list is current and prioritized.`,
      risksIfDelayed: `If the must-have flow ships late, ${audienceParts[0] || 'the primary audience'} continues a manual workaround that has no audit trail and no role boundaries.`
    },
    // Synthesizer leaves ideaCritique empty by design — only an LLM that has
    // genuinely critiqued the brief (Pass 0 in the recipe) should fill these.
    // The audit dimension `idea-clarity` only credits non-empty critique
    // when researcher !== 'mock'.
    ideaCritique: [],
    competingAlternatives: []
  };
}

function deriveJtbd(input: ProjectInput, actors: Actor[]): JobToBeDone[] {
  const out: JobToBeDone[] = [];
  for (const a of actors) {
    const responsibility = a.responsibilities[0] || `Use ${input.productName}`;
    const jtbd = withProvenance(
      {
        actorId: a.id,
        situation: `When ${a.name.toLowerCase()} needs to ${responsibility.replace(/^(Use|Operate)\s+/i, '').replace(/\.$/, '').toLowerCase()}`,
        motivation: `I want to complete the ${input.productName} workflow I'm responsible for without losing context across sessions or relying on hidden chat history.`,
        expectedOutcome: `So that the persisted state is reviewable, my role boundary is respected, and a reviewer can trust the audit trail.`,
        currentWorkaround: `Manual spreadsheets, ad-hoc scripts, or chat threads — none of which produce a consistent audit entry or enforce visibility scope.`,
        hireForCriteria: [
          `Workflow completes in fewer steps than the manual workaround.`,
          `Visibility scope is enforced; ${a.name} never sees data from other actors' scope unintentionally.`,
          `Every action that mutates state writes an audit entry that survives session boundaries.`
        ]
      },
      {
        id: `jtbd-${slug(a.name)}`,
        origin: 'use-case' as const,
        sources: [briefSourceRef(input, `Audience: ${input.targetAudience}`)]
      }
    );
    out.push(jtbd);
  }
  return out;
}

// ---------- DB types + FKs (Phase E3) ----------

function inferDbType(field: EntityField): DbType {
  const name = field.name.toLowerCase();
  if (field.type === 'enum') return 'ENUM';
  if (field.type === 'boolean') return 'BOOLEAN';
  if (field.type === 'json') return 'JSONB';
  if (field.type === 'date') return 'TIMESTAMPTZ';
  if (/(^id$|Id$|_id$|ref$|Ref$)/.test(field.name)) return 'UUID';
  if (/(^|_)at$|At$/.test(field.name)) return 'TIMESTAMPTZ';
  if (/^date|Date$/.test(field.name)) return 'DATE';
  if (/(amount|price|total|decimal|cost|fee|rate|balance|salary)/i.test(name)) return 'DECIMAL';
  if (/(count|quantity|qty|rank|order|number|num|index|version)/i.test(name)) return 'INTEGER';
  if (/(active|enabled|flag|is[A-Z]|has[A-Z]|deleted|locked|verified|published)/.test(field.name)) return 'BOOLEAN';
  return 'TEXT';
}

function applyDbMetadata(entities: Entity[]): void {
  // Build a map of "<entityId>-<idFieldName>" → entityId for FK resolution.
  const entityIdFieldMap = new Map<string, { entityId: string; fieldName: string }>();
  for (const e of entities) {
    const idField = e.fields.find((f) => f.name === 'id' || /Id$/.test(f.name) || /^id$/.test(f.name));
    if (idField) {
      entityIdFieldMap.set(idField.name.toLowerCase(), { entityId: e.id, fieldName: idField.name });
      // also map the entity name singular slug → id field, e.g. "lead" matches "leadId"
      entityIdFieldMap.set(slug(e.name), { entityId: e.id, fieldName: idField.name });
    }
  }

  for (const e of entities) {
    for (const field of e.fields) {
      // dbType
      field.dbType = inferDbType(field);
      // nullable + required
      field.nullable = !field.required;
      // indexed: id-like fields and FKs are indexed; explicit status fields too
      if (/(^id$|Id$|_id$|ref$|Ref$)/.test(field.name) || field.name === 'status') {
        field.indexed = true;
      }
      // unique: PK id + email
      if (field.name === 'id' || field.name === `${slug(e.name).replace(/-/g, '')}Id` || /email/i.test(field.name)) {
        field.unique = true;
      }
      // FK detection: explicit references first; else by *Id name match
      if (field.references) {
        const target = entities.find((x) => x.id === field.references);
        if (target) {
          const tIdField = target.fields.find((f) => f.name === 'id' || /Id$/.test(f.name)) || target.fields[0];
          field.fk = { entityId: target.id, fieldName: tIdField?.name || 'id', onDelete: 'RESTRICT' };
          field.indexed = true;
        }
      } else if (/Id$/.test(field.name) && field.name !== `${slug(e.name).replace(/-/g, '')}Id`) {
        // e.g. "leadId" on Touch → look for entity whose id field is leadId or whose name is "lead"
        const baseName = field.name.replace(/Id$/, '').toLowerCase();
        const target = entities.find((x) => slug(x.name) === baseName || slug(x.name).startsWith(baseName));
        if (target) {
          const tIdField = target.fields.find((f) => f.name === 'id' || /Id$/.test(f.name)) || target.fields[0];
          field.fk = { entityId: target.id, fieldName: tIdField?.name || 'id', onDelete: 'RESTRICT' };
          field.indexed = true;
          field.references = target.id;
        }
      }
      // defaults: status -> first enum value, *At -> CURRENT_TIMESTAMP, booleans -> false
      if (field.name === 'status' && field.enumValues?.length) {
        field.defaultValue = field.enumValues[0];
      } else if (field.dbType === 'TIMESTAMPTZ' && /(^|_|At$)/.test(field.name) && field.required) {
        field.defaultValue = 'CURRENT_TIMESTAMP';
      } else if (field.dbType === 'BOOLEAN') {
        field.defaultValue = 'false';
      }
    }
  }
}

// ---------- test cases (Phase E3) ----------

function deriveTestCases(
  input: ProjectInput,
  entities: Entity[],
  workflows: Workflow[]
): TestCase[] {
  const out: TestCase[] = [];
  const entityById = new Map(entities.map((e) => [e.id, e]));

  for (const wf of workflows) {
    const primaryEntity = wf.entitiesTouched[0] ? entityById.get(wf.entitiesTouched[0]) : entities[0];
    const sampleId = primaryEntity ? String((primaryEntity.sample as Record<string, unknown>)[Object.keys(primaryEntity.sample)[0]] || `${slug(primaryEntity.name)}-001`) : 'sample-001';
    // Happy-path
    out.push(
      withProvenance(
        {
          workflowId: wf.id,
          scenario: 'happy-path' as const,
          given: `An authenticated ${primaryEntity?.name || 'record'} owner has the SAMPLE_DATA.md happy-path record loaded (\`${sampleId}\`).`,
          when: `The actor runs ${wf.name} end-to-end as researched.`,
          then: wf.acceptancePattern,
          testDataRefs: [sampleId]
        },
        {
          id: `test-${slug(wf.id)}-happy`,
          origin: 'use-case' as const,
          sources: [briefSourceRef(input, `Acceptance for ${wf.name}`)]
        }
      )
    );
    // One failure-mode test per researched failure mode
    for (const fm of wf.failureModes) {
      out.push(
        withProvenance(
          {
            workflowId: wf.id,
            scenario: 'failure-mode' as const,
            given: `An authenticated ${primaryEntity?.name || 'record'} owner has SAMPLE_DATA.md negative-path record loaded for ${primaryEntity?.name || 'the entity'}, with the field that triggers "${fm.trigger}" set to the failing value.`,
            when: `The actor attempts ${wf.name}.`,
            then: `The system surfaces "${fm.trigger}" to the actor and applies the researched mitigation: ${fm.mitigation}. No silent state change.`,
            testDataRefs: [`negative-${sampleId}`],
            expectedFailureRef: fm.trigger
          },
          {
            id: `test-${slug(wf.id)}-fail-${slug(fm.trigger).slice(0, 16)}`,
            origin: 'domain' as const,
            sources: [domainSourceRef(input, `Failure mode "${fm.trigger}" for ${wf.name}`)]
          }
        )
      );
    }
    // Edge case: enum boundary on the primary entity (covers state-machine transitions)
    if (primaryEntity) {
      const enumField = primaryEntity.fields.find((f) => f.type === 'enum' && Array.isArray(f.enumValues) && f.enumValues.length > 1);
      if (enumField) {
        const lastValue = enumField.enumValues![enumField.enumValues!.length - 1];
        out.push(
          withProvenance(
            {
              workflowId: wf.id,
              scenario: 'edge-case' as const,
              given: `An authenticated owner has the SAMPLE_DATA.md variant record where ${primaryEntity.name}.${enumField.name} = "${lastValue}".`,
              when: `The actor attempts ${wf.name} on a ${primaryEntity.name} already in state "${lastValue}".`,
              then: `The system either advances the state machine according to research or refuses with a researched mitigation; behavior must be deterministic.`,
              testDataRefs: [`variant-${sampleId}-${lastValue}`]
            },
            {
              id: `test-${slug(wf.id)}-edge-${slug(enumField.name)}-${slug(lastValue)}`.slice(0, 60),
              origin: 'domain' as const,
              sources: [domainSourceRef(input, `Enum boundary on ${primaryEntity.name}.${enumField.name}`)]
            }
          )
        );
      }
    }
  }
  return out;
}

function deriveUxFlow(screens: Screen[]): UxFlowEdge[] {
  const edges: UxFlowEdge[] = [];
  for (const s of screens) {
    for (const out of s.navOut) {
      edges.push({
        fromScreen: s.id,
        toScreen: out.screen,
        viaAction: out.via
      });
    }
  }
  return edges;
}

export function synthesizeExtractions(input: ProjectInput): ResearchExtractions {
  const actors = deriveActors(input);
  const entities = deriveEntities(input, actors);
  // Phase E3: enrich entity fields with DB-level metadata (dbType, FK, indexes, defaults).
  applyDbMetadata(entities);
  const workflows = deriveWorkflows(input, actors, entities);
  const integrations = deriveIntegrations(input);
  const risks = deriveRisks(input, actors, entities);
  const gates = deriveGates(input, risks);
  const antiFeatures = deriveAntiFeatures(input);
  const conflicts = deriveConflicts();
  const screens = deriveScreens(input, actors, entities, workflows);
  const uxFlow = deriveUxFlow(screens);
  const testCases = deriveTestCases(input, entities, workflows);
  const jobsToBeDone = deriveJtbd(input, actors);
  const discovery = deriveDiscovery(input);

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
    researcher: 'mock',
    researchSource: 'synthesized',
    discovery
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
    removed: [],
    screens,
    uxFlow,
    testCases,
    jobsToBeDone
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
  // Phase E2: optional screens + uxFlow.
  writeJson(path.join(root, 'extracted', 'screens.json'), ex.screens ?? []);
  writeJson(path.join(root, 'extracted', 'uxFlow.json'), ex.uxFlow ?? []);
  // Phase E3: optional test cases.
  writeJson(path.join(root, 'extracted', 'testCases.json'), ex.testCases ?? []);
  // Phase E4: optional JTBD (discovery lives on meta.json).
  writeJson(path.join(root, 'extracted', 'jobsToBeDone.json'), ex.jobsToBeDone ?? []);
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
