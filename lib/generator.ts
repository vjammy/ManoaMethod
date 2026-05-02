import { reconcileScoreWithLifecycle, scoreProject, withSemanticFit } from './scoring';
import { computeSemanticFit, type SemanticFit } from './semantic-fit';

// Phase A3c: the keyword-router archetype detector (formerly lib/archetype-detection.ts)
// is removed. Research extractions are the only source of truth for domain. Anything
// that runs without extractions falls through to the 'general' archetype with no
// keyword inference. ArchetypeDetection is retained as a stable shape for manifests
// and scorecards that historically surfaced it; values are now constant.
type ArchetypeDetectionMethod = 'fallback';
type ArchetypeDetection = {
  archetype: DomainArchetype;
  confidence: number;
  method: ArchetypeDetectionMethod;
  matchedKeyword?: string;
  rationale: string;
  antiMatched?: string;
  candidateScores: Array<{ archetype: DomainArchetype; score: number; topKeyword?: string }>;
};
const NEUTRAL_ARCHETYPE_DETECTION: ArchetypeDetection = {
  archetype: 'general',
  confidence: 1,
  method: 'fallback',
  rationale: 'Archetype keyword router removed (A3c). All workspaces use the general archetype; research extractions drive entities, actors, workflows when present.',
  candidateScores: []
};
import type { ResearchExtractions } from './research/schema';
import { getResearchSource } from './research/schema';
import {
  buildResearchTokenPack,
  deriveBriefTokens,
  selectPhaseRelevant,
  type ResearchTokenPack
} from './generator/research-token-pack';
import { renderPermissionMatrixMarkdown } from './generator/permission-matrix';
import { renderRegulatoryNotesMarkdown } from './generator/regulatory-notes';
import { renderAllScreenSpecs, renderScreenInventoryMarkdown } from './generator/screen-specs';
import { renderUxFlowMarkdown } from './generator/ux-flow';
import { renderDatabaseSchemaMarkdown, renderDatabaseSchemaSql } from './generator/database-schema';
import { renderPhaseTestCasesMarkdown } from './generator/test-cases';
import { renderValuePropositionMarkdown } from './generator/value-proposition';
import { renderIdeaCritiqueMarkdown } from './generator/idea-critique';
import { renderJobsToBeDoneMarkdown } from './generator/jobs-to-be-done';
import { renderUseCasesMarkdown } from './generator/use-cases';
import { renderUserPersonasMarkdown } from './generator/user-personas';
import { renderSuccessMetricsMarkdown } from './generator/success-metrics';
import { renderPerScreenRequirementsMarkdown } from './generator/per-screen-requirements';
import { renderPhaseIntegrationTestsMarkdown } from './generator/integration-tests';
import { buildQuestionPrompts, CORE_AGENT_OPERATING_RULES, getProfileConfig, slugify } from './templates';
import {
  buildDomainOntology,
  fallbackEntityName,
  findAcceptancePattern,
  inferScenarioValues,
  type DomainArchetype,
  type DomainOntology,
  type OntologyFeatureScenario,
  type RiskFlag
} from './domain-ontology';
import type {
  CritiqueItem,
  GeneratedFile,
  LifecycleStatus,
  PhasePlan,
  ProfileConfig,
  ProjectBundle,
  ProjectInput,
  QuestionnaireItem,
  WarningItem,
  WarningSeverity,
  MvpBuilderState
} from './types';

type PhaseBlueprint = {
  tag:
    | 'brief'
    | 'audience'
    | 'workflow'
    | 'scope'
    | 'business-value'
    | 'stakeholders'
    | 'operations'
    | 'data'
    | 'architecture'
    | 'testing'
    | 'deployment'
    | 'security'
    | 'observability'
    | 'handoff'
    | 'rollout'
    | 'scaling'
    | 'permissions'
    | 'emergency'
    | 'qualification'
    | 'ordering'
    | 'budgeting'
    | 'scheduling'
    | 'maintenance'
    | 'events'
    | 'inventory'
    | 'review';
  name: string;
  rationale: string;
  primaryInputs: string[];
  confirmationPrompts: string[];
  phaseType: PhasePlan['phaseType'];
  outputs?: string[];
  repoTargets?: string[];
};

type ProjectContext = {
  profile: ProfileConfig;
  mustHaves: string[];
  niceToHaves: string[];
  nonGoals: string[];
  constraints: string[];
  risks: string[];
  integrations: string[];
  audienceSegments: string[];
  keywords: string[];
  answers: Record<string, string>;
  primaryAudience: string;
  primaryFeature: string;
  secondaryFeature: string;
  outputAnchor: string;
  workflowAnchor: string;
  riskAnchor: string;
  acceptanceAnchor: string;
  inferredAssumptions: string[];
  domainArchetype: DomainArchetype;
  archetypeDetection: ArchetypeDetection;
  domainSignals: string[];
  riskFlags: RiskFlag[];
  uiRelevant: boolean;
  ontology: DomainOntology;
  extractions?: ResearchExtractions;
  /** Phase B — flat enrichment vocabulary derived from extractions. Empty pack when extractions are absent. */
  tokenPack: ResearchTokenPack;
};

type AgentName = 'Codex' | 'Claude Code' | 'OpenCode';
const DEFAULT_EXPORT_ROOT = 'mvp-builder-workspace';

function ensureTrailingNewline(value: string) {
  return `${value.trim()}\n`;
}

function splitItems(value: string) {
  if (!value) return [];
  // Paren/bracket-aware splitter: respects "(parens)" and "[brackets]", accepts
  // ; , and \n as separators, and falls back to "Foo. Bar. Baz." sentence-style
  // splits when the source clearly is a list. Ported from origin/main commit
  // 568685a as a generic improvement for any code that processes brief lists.
  const items: string[] = [];
  let buf = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  for (const ch of value) {
    if (ch === '(' || ch === '[') {
      if (ch === '(') parenDepth++;
      else bracketDepth++;
      buf += ch;
      continue;
    }
    if (ch === ')' || ch === ']') {
      if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else bracketDepth = Math.max(0, bracketDepth - 1);
      buf += ch;
      continue;
    }
    const isSeparator =
      (ch === '\n' || ch === ';' || ch === ',') && parenDepth === 0 && bracketDepth === 0;
    if (isSeparator) {
      const trimmed = buf.trim();
      if (trimmed) items.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) items.push(tail);
  if (items.length === 1) {
    const clauses = items[0].split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
    if (clauses.length >= 4 && clauses.every((part) => part.length <= 80)) {
      return clauses.map((part) => part.replace(/\.$/, '').trim()).filter(Boolean);
    }
  }
  return items;
}

// Extract a bounded head-noun phrase for role / audience labels. Ported from
// origin/main commits 568685a + d289170: cuts at relative-clause/conjunction
// boundaries, strips leading articles, capitalizes the first letter, caps at
// `maxWords`. Used to keep phase / role titles readable when audience text is
// long-winded.
function extractRoleHead(value: string, fallback: string, maxWords = 4): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return fallback;
  const head = trimmed.split(/\s+(?:and|or|who|that|which|where|when)\s+/i)[0].trim();
  const stripped = head
    .replace(/^[\s,;:.\-]+|[\s,;:.\-]+$/g, '')
    .replace(/^(?:a|an|the)\s+/i, '');
  const words = stripped.split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
  if (!words) return fallback;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function listToBullets(items: string[], fallback: string) {
  const finalItems = items.length ? items : [fallback];
  return finalItems.map((item) => `- ${item}`).join('\n');
}

function truncateText(value: string, _maxWords: number) {
  return value.trim();
}

// Phase A3c (final hardening): the cross-domain echo sanitizer was archetype-
// driven — it muted medical / SDR terminology for all archetypes other than
// clinic-scheduler / sdr-sales. With the keyword router gone, archetype is
// always 'general' and the sanitizer would have wiped legitimate domain
// terminology out of every research-grounded workspace. Function and caller
// removed; the research-token pack (lib/generator/research-token-pack.ts)
// now governs which domain vocabulary appears in generated artifacts.

function normalizeTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function getDomainFillerNames(
  _domainArchetype: ProjectContext['domainArchetype'],
  input: ProjectInput
): Array<{ tag: PhaseBlueprint['tag']; name: string; rationale: string; phaseType: PhasePlan['phaseType'] }> {
  const base = input.productName;
  return [
    { tag: 'review', name: `${base} Workflow Edge Case Review`, rationale: `Test the core workflow against at least one realistic failure path to confirm the plan handles friction, not just the happy path.`, phaseType: 'verification' },
    { tag: 'review', name: `${base} Scope Drift Check`, rationale: `Re-read the current plan against the original brief to confirm no unjustified expansion or silent deferral has occurred.`, phaseType: 'verification' },
    { tag: 'review', name: `${base} Evidence Quality Audit`, rationale: `Verify that evidence files name actual files, scenarios, or decisions instead of placeholder claims.`, phaseType: 'verification' }
  ];
}

function getPhaseTypeSpecificChecks(
  phase: PhasePlan,
  context: ProjectContext,
  input: ProjectInput
): Array<{ check: string; pass: string; fail: string; artifact: string; goodLooks: string; failureLooks: string; evidence: string; regressionRisk: string; domainScenario: string }> {
  const checks: Array<{ check: string; pass: string; fail: string; artifact: string; goodLooks: string; failureLooks: string; evidence: string; regressionRisk: string; domainScenario: string }> = [];

  const domainName = input.productName;
  const audience = context.primaryAudience;
  const feature = context.primaryFeature;
  const slug = phase.slug;

  if (phase.phaseType === 'planning') {
    checks.push({
      check: `Inspect PHASE_BRIEF.md and confirm the planning output names concrete ${feature} decisions rather than restating the product idea.`,
      pass: `The brief names at least three specific decisions, scope cuts, or constraints for ${domainName}.`,
      fail: `The brief restates the product idea without naming what gets built, deferred, or ruled out.`,
      artifact: `phases/${slug}/PHASE_BRIEF.md`,
      goodLooks: `A short list of v1 scope decisions with clear deferrals and non-goals.`,
      failureLooks: `Generic sentences like "plan the product" without naming features or boundaries.`,
      evidence: `Copy the exact decision bullets into TEST_RESULTS.md.`,
      regressionRisk: `If planning stays generic, later phases build on vague assumptions and rework risk rises.`,
      domainScenario: `A reviewer asks: "If I remove the product name, could this brief apply to any project?" The answer must be no.`
    });
  }

  if (phase.phaseType === 'design') {
    checks.push({
      check: `Inspect the design artifact and confirm it maps a realistic ${audience} workflow with at least one failure path.`,
      pass: `The design names states, transitions, and error handling that ${audience} would actually encounter.`,
      fail: `The design shows only a happy path or uses generic labels like "user does action" without naming the action.`,
      artifact: `phases/${slug}/PHASE_BRIEF.md and any workflow notes`,
      goodLooks: `A state map or flow with specific states, decision points, and what happens when something goes wrong.`,
      failureLooks: `A single linear list of steps with no branches, errors, or role-specific behavior.`,
      evidence: `Paste the state names or flow summary into TEST_RESULTS.md.`,
      regressionRisk: `If design skips failure paths, implementation will miss edge cases and support load will spike.`,
      domainScenario: `A reviewer asks: "What happens when ${feature} fails or ${audience} makes a mistake?" The design must answer this.`
    });
  }

  if (phase.phaseType === 'implementation') {
    checks.push({
      check: `Run the build and confirm changed files are listed in HANDOFF_SUMMARY.md with observed results.`,
      pass: `Build passes and HANDOFF_SUMMARY.md names the files changed and why.`,
      fail: `Build fails, or handoff is blank, or files are changed without being recorded.`,
      artifact: `repo files and phases/${slug}/HANDOFF_SUMMARY.md`,
      goodLooks: `A build log showing PASS and a handoff listing each changed file with a one-line reason.`,
      failureLooks: `A build error or a handoff that says "updated files" without naming them.`,
      evidence: `Copy build output and the changed-files list into TEST_RESULTS.md.`,
      regressionRisk: `If implementation changes are not tracked, rollback and debugging become impossible.`,
      domainScenario: `A reviewer asks: "If this change breaks ${feature}, which file should I revert first?" The handoff must name it.`
    });
  }

  if (phase.phaseType === 'verification') {
    checks.push({
      check: `Inspect TEST_PLAN.md and confirm the verification scenarios are specific to ${domainName} and not generic boilerplate.`,
      pass: `Scenarios name real ${feature} behavior, ${audience} actions, and observable pass/fail criteria.`,
      fail: `Scenarios are copy-paste templates that could apply to any project.`,
      artifact: `phases/${slug}/TEST_PLAN.md`,
      goodLooks: `A scenario like "${audience} attempts ${feature} with invalid input and sees error X."`,
      failureLooks: `A scenario like "Test the feature and confirm it works."`,
      evidence: `Paste the scenario text and your observed result into TEST_RESULTS.md.`,
      regressionRisk: `If verification is generic, bugs slip through because no one tested the actual domain behavior.`,
      domainScenario: `A reviewer asks: "Show me the test that would catch a broken ${feature} workflow." The plan must name it.`
    });
  }

  if (phase.phaseType === 'finalization' || phase.phaseType === 'handoff') {
    checks.push({
      check: `Inspect the final handoff package and confirm it includes release caveats, known blockers, and next-builder guidance.`,
      pass: `The handoff warns about what is not finished, what could break, and what the next builder should do first.`,
      fail: `The handoff claims the project is "complete" without caveats or next-step guidance.`,
      artifact: `phases/${slug}/HANDOFF_SUMMARY.md and NEXT_PHASE_CONTEXT.md`,
      goodLooks: `A candid list of what works, what is deferred, and what the next builder must confirm before coding.`,
      failureLooks: `A single sentence like "Project is ready" with no context about risks or next steps.`,
      evidence: `Copy the caveat list and next-builder instructions into TEST_RESULTS.md.`,
      regressionRisk: `If the handoff hides gaps, the next builder starts with false confidence and introduces defects.`,
      domainScenario: `A reviewer asks: "If I pick this up in six months, what will confuse me first?" The handoff must answer this.`
    });
  }

  // Phase A3c (final hardening): the six archetype-specific phase-type checks
  // (restaurant order states, SDR qualification, inventory thresholds, family-
  // readiness emergency boundaries, family-task child permissions, clinic
  // reminder privacy) lived under unreachable `context.domainArchetype === '…'`
  // gates. The risk-flag-driven checks below — money / privacy / sensitive-data
  // / children / medical / legal / emergency — already cover the same review
  // angles for any brief that names those concerns, regardless of archetype.

  if (context.riskFlags.includes('money')) {
    checks.push({
      check: `Confirm the output includes a clear disclaimer that ${domainName} is not financial advice and does not provide investment guidance.`,
      pass: `A boundary disclaimer is visible and specific to the domain.`,
      fail: `The output includes budgeting tips, spending recommendations, or implied authority.`,
      artifact: `phases/${slug}/PHASE_BRIEF.md or boundary notes`,
      goodLooks: `A statement: "This tool tracks spending for awareness only. It does not provide financial advice."`,
      failureLooks: `Language like "save 20% on groceries" or "you should invest the surplus."`,
      evidence: `Copy the disclaimer into TEST_RESULTS.md.`,
      regressionRisk: `Implied financial advice creates legal exposure and user harm.`,
      domainScenario: `A user asks: "Should I buy this stock?" The product must not answer that question.`
    });
  }

  if (context.riskFlags.includes('privacy') || context.riskFlags.includes('sensitive-data')) {
    checks.push({
      check: `Confirm the output names which roles can see which data and what is minimized or hidden.`,
      pass: `A visibility matrix or list defines data access per role.`,
      fail: `The output says "data is secure" without defining who sees what.`,
      artifact: `phases/${slug}/PHASE_BRIEF.md or data notes`,
      goodLooks: `A table mapping each role to the data fields they can read, write, or never see.`,
      failureLooks: `A generic claim like "we take privacy seriously."`,
      evidence: `Paste the visibility matrix into TEST_RESULTS.md.`,
      regressionRisk: `Undocumented visibility rules cause data leaks and compliance failures.`,
      domainScenario: `An auditor asks: "Show me who can see personal phone numbers." The matrix must answer this.`
    });
  }

  return checks;
}

function getPhaseTestProcedures(
  phase: PhasePlan,
  input: ProjectInput,
  context: ProjectContext
): Array<{ cmd: string; expected: string; proof: string; artifact: string; goodLooks: string; failureLooks: string; evidence: string; regressionRisk: string; reviewerQuestion: string }> {
  const workflow = context.ontology.workflowTypes[0];
  const entity = context.ontology.entityTypes[0];
  const domainScenario = getPhaseTypeSpecificChecks(phase, context, input)[0];
  const baseArtifact = `phases/${phase.slug}/PHASE_BRIEF.md`;

  if (phase.phaseType === 'implementation') {
    return [
      {
        cmd: 'npm run typecheck',
        expected: 'PASS: no TypeScript errors.',
        proof: 'Type safety for the current implementation remains intact.',
        artifact: 'Terminal output plus the changed implementation files for this phase.',
        goodLooks: 'Typecheck passes after the phase changes and the changed files are listed in HANDOFF_SUMMARY.md.',
        failureLooks: 'Type errors appear, or the build changed code without naming the files that caused it.',
        evidence: 'Paste the exact typecheck result and changed-file list into TEST_RESULTS.md.',
        regressionRisk: 'Skipping typecheck lets the current phase break unrelated modules silently.',
        reviewerQuestion: `Which changed file would you inspect first if ${context.primaryFeature} broke after this phase?`
      },
      {
        cmd: 'npm run build',
        expected: 'PASS: production build completes.',
        proof: 'The generated implementation still compiles for release.',
        artifact: 'Build output and HANDOFF_SUMMARY.md.',
        goodLooks: 'Build passes and any warnings are explained in the handoff.',
        failureLooks: 'Build fails, or the handoff claims success without build evidence.',
        evidence: 'Paste the build summary plus any warnings into TEST_RESULTS.md.',
        regressionRisk: 'A passing local edit can still ship a broken build if this step is skipped.',
        reviewerQuestion: `What release-blocking error would stop ${input.productName} from moving forward right now?`
      },
      {
        cmd: 'npm run smoke',
        expected: 'PASS: smoke tests pass.',
        proof: 'Package generation and core scaffolding still behave correctly.',
        artifact: 'Smoke-test output and VERIFICATION_REPORT.md.',
        goodLooks: 'Smoke passes and the verification report references the result explicitly.',
        failureLooks: 'Smoke fails, or the report stays generic about what was tested.',
        evidence: 'Paste the smoke result and any affected package path into TEST_RESULTS.md.',
        regressionRisk: 'Implementation changes can corrupt package generation even when the local feature looks correct.',
        reviewerQuestion: `If this phase accidentally broke package generation, where would the smoke output reveal it first?`
      }
    ];
  }

  if (phase.phaseType === 'planning') {
    return [
      {
        cmd: `Inspect ${baseArtifact} against PROJECT_BRIEF.md and PRODUCT_NORTH_STAR.md.`,
        expected: `The phase names concrete scope cuts, decisions, and constraints for ${input.productName}.`,
        proof: 'The plan stays product-specific and does not drift into generic planning language.',
        artifact: `${baseArtifact}, PROJECT_BRIEF.md, product-strategy/PRODUCT_NORTH_STAR.md`,
        goodLooks: `Three or more explicit decisions that narrow ${workflow?.name || context.primaryFeature} for v1.`,
        failureLooks: 'The artifact mostly restates the product idea or uses placeholders like "review the plan."',
        evidence: 'Copy the decision bullets and the source file path into TEST_RESULTS.md.',
        regressionRisk: 'Weak planning language causes later phases to rebuild the product scope from scratch.',
        reviewerQuestion: domainScenario?.domainScenario || `Could this planning output still apply if the product name changed?`
      },
      {
        cmd: `Inspect phases/${phase.slug}/HANDOFF_SUMMARY.md for phase-specific pending fields and expected deliverables.`,
        expected: 'The prefilled handoff names what this planning phase should decide, defer, and prove before moving on.',
        proof: 'The next builder receives useful planning carry-forward context rather than a blank scaffold.',
        artifact: `phases/${phase.slug}/HANDOFF_SUMMARY.md`,
        goodLooks: 'Expected outputs, decisions, evidence, and next-phase risks are all phase-specific.',
        failureLooks: 'The handoff reads like a generic template with no planning-specific guidance.',
        evidence: 'Paste one expected deliverable line and one next-phase risk line into TEST_RESULTS.md.',
        regressionRisk: 'If planning handoff context stays vague, design and implementation phases start from hidden assumptions.',
        reviewerQuestion: `What decision from ${phase.name} would most damage the next phase if it were left undocumented?`
      }
    ];
  }

  if (phase.phaseType === 'design') {
    return [
      {
        cmd: `Inspect ${baseArtifact}, TEST_PLAN.md, and any workflow notes for a realistic ${workflow?.name || context.primaryFeature} flow.`,
        expected: `The design output names states, transitions, and at least one failure path for ${context.primaryAudience}.`,
        proof: 'The design is detailed enough to guide implementation and review.',
        artifact: `${baseArtifact}, phases/${phase.slug}/TEST_PLAN.md`,
        goodLooks: `Named workflow states or steps tied to ${entity?.name || context.primaryFeature}, including a failure path.`,
        failureLooks: 'Only a happy path is described, or the flow uses generic labels with no domain behavior.',
        evidence: 'Paste the workflow states or step sequence into TEST_RESULTS.md.',
        regressionRisk: 'A vague design phase leaks ambiguity into implementation and verification.',
        reviewerQuestion: domainScenario?.domainScenario || `What happens when ${context.primaryAudience} makes a mistake in this workflow?`
      },
      {
        cmd: `Inspect phases/${phase.slug}/NEXT_PHASE_CONTEXT.md for concrete next-phase risks and deliverables.`,
        expected: 'The next-phase context tells the next builder what decisions, evidence, and blockers must carry forward.',
        proof: 'Design-to-build handoff depth is strong enough that the next phase does not need hidden chat context.',
        artifact: `phases/${phase.slug}/NEXT_PHASE_CONTEXT.md`,
        goodLooks: 'It names expected deliverables, evidence to paste, and specific risks if the design is incomplete.',
        failureLooks: 'It says only "continue to next phase" without naming what is missing or what must be preserved.',
        evidence: 'Paste one deliverable line and one carry-forward risk into TEST_RESULTS.md.',
        regressionRisk: 'Without explicit design carry-forward notes, implementation invents behavior or fields.',
        reviewerQuestion: `Which design choice here would force rework if the next builder guessed wrong?`
      }
    ];
  }

  if (phase.phaseType === 'verification') {
    return [
      {
        cmd: `Inspect phases/${phase.slug}/TEST_PLAN.md and TEST_SCRIPT.md together.`,
        expected: `The verification package names concrete domain checks for ${workflow?.name || context.primaryFeature}, not generic review steps.`,
        proof: 'Verification protects against the real domain regressions the phase is supposed to catch.',
        artifact: `phases/${phase.slug}/TEST_PLAN.md and phases/${phase.slug}/TEST_SCRIPT.md`,
        goodLooks: 'Artifacts to inspect, pass/fail signals, evidence, and domain reviewer questions are all explicit.',
        failureLooks: 'Generic checks like "review for completeness" appear without domain context.',
        evidence: 'Paste one domain-specific test line and the artifact inspected into TEST_RESULTS.md.',
        regressionRisk: 'Generic verification lets broken workflows pass because no one tested the real use case.',
        reviewerQuestion: domainScenario?.domainScenario || `What exact broken workflow should this verification phase catch before release?`
      },
      {
        cmd: `Compare EXIT_GATE.md, VERIFICATION_REPORT.md, and TEST_RESULTS.md.`,
        expected: 'Every exit criterion is traceable to a real test result or inspection note.',
        proof: 'Phase closure is evidence-backed rather than assertion-backed.',
        artifact: `phases/${phase.slug}/EXIT_GATE.md, phases/${phase.slug}/VERIFICATION_REPORT.md, phases/${phase.slug}/TEST_RESULTS.md`,
        goodLooks: 'The same criteria appear across the gate, report, and results with explicit evidence.',
        failureLooks: 'The report says pass while the results or gate notes stay generic or pending.',
        evidence: 'Paste the matching exit criterion and its proof line into TEST_RESULTS.md.',
        regressionRisk: 'A weak verification trace lets unresolved failures slip into later phases.',
        reviewerQuestion: `Which exit criterion would fail first if the underlying evidence were missing?`
      }
    ];
  }

  return [
    {
      cmd: `Inspect phases/${phase.slug}/HANDOFF_SUMMARY.md and NEXT_PHASE_CONTEXT.md together.`,
      expected: `The handoff explains what ${phase.name} should produce, what remains unfinished, and what the next phase inherits.`,
      proof: 'The phase closes with honest, actionable guidance rather than completion theater.',
      artifact: `phases/${phase.slug}/HANDOFF_SUMMARY.md and phases/${phase.slug}/NEXT_PHASE_CONTEXT.md`,
      goodLooks: 'Deliverables, decisions, evidence, and next-phase risks are all visible and specific.',
      failureLooks: 'The handoff implies the work is done without saying what was actually checked or still blocked.',
      evidence: 'Paste one deliverable line, one evidence line, and one carry-forward risk into TEST_RESULTS.md.',
      regressionRisk: 'A shallow handoff makes the next builder repeat work or trust unfinished output.',
      reviewerQuestion: domainScenario?.domainScenario || `If the next builder opens only the handoff files, what must they understand immediately?`
    }
  ];
}

function getDomainTestScenarios(
  _domainArchetype: ProjectContext['domainArchetype'],
  riskFlags: ProjectContext['riskFlags']
): string[] {
  const scenarios: string[] = [
    'The core workflow is tested end-to-end with realistic inputs.',
    'A failure path is exercised and the system handles it gracefully.',
    'Role boundaries are tested to confirm users see only what they should.'
  ];

  if (riskFlags.includes('children')) {
    scenarios.push('Child visibility is tested: a child user sees only allowed content and cannot access parent-only features.');
  }
  if (riskFlags.includes('medical')) {
    scenarios.push('Privacy check: no sensitive clinical details appear in reminders or notifications.');
  }
  if (riskFlags.includes('legal') || riskFlags.includes('emergency')) {
    scenarios.push('Boundary check: the product clearly states what it does NOT provide (legal advice, emergency dispatch, etc.).');
  }
  if (riskFlags.includes('money')) {
    scenarios.push('Financial boundary check: the product does not present financial advice or investment guidance.');
  }
  if (riskFlags.includes('privacy') || riskFlags.includes('sensitive-data')) {
    scenarios.push('Data minimization check: only necessary data is collected and visible roles are enforced.');
  }

  return scenarios;
}

function detectRiskFlags(input: ProjectInput): ProjectContext['riskFlags'] {
  const source = [
    input.productName,
    input.productIdea,
    input.targetAudience,
    input.problemStatement,
    input.constraints,
    input.risks,
    input.mustHaveFeatures,
    input.dataAndIntegrations
  ]
    .join(' ')
    .toLowerCase();

  const flags: ProjectContext['riskFlags'] = [];
  if (/(kid|kids|child|children|parent|family)/i.test(source)) flags.push('children');
  // Medical flag: require at least 2 medical keywords or explicit healthcare context to avoid false positives
  const medicalTerms = ['clinic', 'medical', 'patient', 'healthcare', 'physician', 'doctor', 'nurse', 'health record', 'diagnosis', 'treatment', 'medication', 'hipaa'];
  const medicalMatches = medicalTerms.filter((term) => source.includes(term)).length;
  if (medicalMatches >= 2 || /healthcare|medical|hipaa/.test(source)) flags.push('medical');
  if (/(legal|law|compliance|attorney|vault)/i.test(source)) flags.push('legal');
  if (/(emergency|urgent|disaster|readiness)/i.test(source)) flags.push('emergency');
  if (/(privacy|permission|visibility|sensitive|confidential)/i.test(source)) flags.push('privacy');
  if (/(budget|money|financial|finance|spend|payment)/i.test(source)) flags.push('money');
  if (/(pii|sensitive data|personal data|protected data|reminder content)/i.test(source)) flags.push('sensitive-data');
  return unique(flags);
}

// Phase A3c (final hardening): archetype detection was deleted in A3c. The
// `domainArchetype` parameter is retained on this signature only so the
// existing call site can be removed without churn; the archetype-driven early
// return is gone. UI relevance is now decided purely from brief content.

function detectUiRelevance(input: ProjectInput, _domainArchetype: ProjectContext['domainArchetype']) {
  const source = [
    input.productName,
    input.productIdea,
    input.targetAudience,
    input.problemStatement,
    input.desiredOutput,
    input.mustHaveFeatures,
    input.teamContext
  ]
    .join(' ')
    .toLowerCase();

  const structuralUiSignals = [
    /\bscreen\b/,
    /\bdashboard\b/,
    /\bform\b/,
    /\bwebsite\b/,
    /\bweb app\b/,
    /\bportal\b/,
    /\badmin panel\b/,
    /\blanding page\b/,
    /\bmobile\b/,
    /\bresponsive\b/,
    /\binternal tool\b/,
    /\bapp\b/
  ];
  const softUiSignals = [/\bui\b/, /\bux\b/, /\buser-facing\b/, /\bcustomer-facing\b/];
  const nonUiSignals = [
    /\bcli\b/,
    /\bcommand line\b/,
    /\bmarkdown package\b/,
    /\bplaybook\b/,
    /\bpolicy\b/,
    /\bgenerator\b/,
    /\btemplate\b/,
    /\bartifact package\b/,
    /\bno web app\b/,
    /\bno dashboard\b/,
    /\bno portal\b/,
    /\bwithout a user-facing application\b/
  ];
  const structuralMatchCount = structuralUiSignals.filter((pattern) => pattern.test(source)).length;
  const softMatchCount = softUiSignals.filter((pattern) => pattern.test(source)).length;
  const nonUiMatchCount = nonUiSignals.filter((pattern) => pattern.test(source)).length;

  if (structuralMatchCount === 0 && softMatchCount === 0) return false;
  if (nonUiMatchCount >= 2 && structuralMatchCount === 0) return false;
  return true;
}

function getDomainSignals(input: ProjectInput, riskFlags: ProjectContext['riskFlags']) {
  const source = [
    input.productName,
    input.productIdea,
    input.targetAudience,
    input.problemStatement,
    input.mustHaveFeatures,
    input.constraints,
    input.risks
  ].join(' ');
  const tokens = extractKeywords(input);
  const extras = riskFlags.map((flag) => flag.replace('-', ' '));
  return unique(tokens.concat(extras).concat(normalizeTokens(source).filter((token) => token.length >= 5))).slice(0, 18);
}

function extractKeywords(input: ProjectInput) {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'that',
    'with',
    'from',
    'into',
    'this',
    'will',
    'have',
    'your',
    'their',
    'then',
    'than',
    'what',
    'when',
    'where',
    'must',
    'should',
    'using',
    'before',
    'after',
    'build',
    'ready',
    'first',
    'product',
    'project',
    'users',
    'teams'
  ]);

  const source = [
    input.productName,
    input.productIdea,
    input.targetAudience,
    input.problemStatement,
    input.desiredOutput,
    input.mustHaveFeatures
  ].join(' ');

  const counts = new Map<string, number>();
  for (const token of normalizeTokens(source)) {
    if (token.length < 4 || stopWords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function findContradictions(input: ProjectInput) {
  const mustHaves = input.mustHaveFeatures.toLowerCase();
  const nonGoals = input.nonGoals.toLowerCase();
  const contradictions: Array<{ topic: string; message: string }> = [];

  const topics = ['auth', 'payment', 'database', 'collaboration', 'integration', 'storage'];
  for (const topic of topics) {
    if (mustHaves.includes(topic) && nonGoals.includes(topic)) {
      contradictions.push({
        topic,
        message: `The current scope says ${topic} is both required and out of scope.`
      });
    }
  }

  if (input.desiredOutput.toLowerCase().includes('zip') && !input.mustHaveFeatures.toLowerCase().includes('zip')) {
    contradictions.push({
      topic: 'zip-export',
      message: 'The desired output expects an exported package, but must-have scope does not mention export or zip behavior.'
    });
  }

  return contradictions;
}

function buildContext(input: ProjectInput, extractions?: ResearchExtractions): ProjectContext {
  const profile = getProfileConfig(input);
  const mustHaves = splitItems(input.mustHaveFeatures);
  const niceToHaves = splitItems(input.niceToHaveFeatures);
  const nonGoals = splitItems(input.nonGoals);
  const constraints = splitItems(input.constraints);
  const risks = splitItems(input.risks);
  const integrations = splitItems(input.dataAndIntegrations);
  const audienceSegments = splitItems(input.targetAudience);
  const answers = input.questionnaireAnswers;
  const keywords = extractKeywords(input);
  const riskFlags = detectRiskFlags(input);
  // Phase A3c: archetype detection is removed. Every workspace uses the 'general'
  // archetype; research extractions (when present) populate entities/actors/workflows
  // through the research-token pack and the research-driven code paths below. The
  // archetypeDetection field stays in ProjectContext for manifest stability but is
  // a constant value.
  const archetypeDetection: ArchetypeDetection = NEUTRAL_ARCHETYPE_DETECTION;
  const domainArchetype = archetypeDetection.archetype;
  const domainSignals = getDomainSignals(input, riskFlags);
  const uiRelevant = detectUiRelevance(input, domainArchetype);
  const ontology = buildDomainOntology(input, {
    domainArchetype,
    riskFlags,
    audienceSegments,
    mustHaves,
    niceToHaves,
    integrations,
    nonGoals,
    constraints
  });

  const inferredAssumptions: string[] = [];
  if (!integrations.length) {
    inferredAssumptions.push('Inferred assumption: the first release does not depend on external integrations beyond local file generation.');
  }
  if (!nonGoals.length) {
    inferredAssumptions.push('Please review and confirm: non-goals are not yet explicit, so scope drift risk remains high.');
  }
  if (profile.key.endsWith('technical') && !answers['data-boundaries']) {
    inferredAssumptions.push('Please review and confirm: the data and interface boundaries are still being inferred from the brief rather than from an explicit answer.');
  }
  if (profile.key.startsWith('advanced') && profile.key.endsWith('business') && !answers.monetization) {
    inferredAssumptions.push('Please review and confirm: the business value and operating model are inferred rather than explicitly justified.');
  }

  // Phase B: build the enrichment token vocabulary once per context. Used by
  // artifact renderers to inject brief- and research-derived names into copy
  // that today emits generic placeholders.
  const briefText = [
    input.productIdea,
    input.targetAudience,
    input.problemStatement,
    input.mustHaveFeatures,
    input.dataAndIntegrations,
    input.risks,
    input.successMetrics
  ]
    .filter(Boolean)
    .join(' ');
  const briefTokens = deriveBriefTokens(input.productName, briefText);
  const tokenPack = buildResearchTokenPack(extractions, briefTokens);

  return {
    profile,
    mustHaves,
    niceToHaves,
    nonGoals,
    constraints,
    risks,
    integrations,
    audienceSegments,
    keywords,
    answers,
    primaryAudience: extractRoleHead(audienceSegments[0] || '', 'the primary target user'),
    primaryFeature: mustHaves[0] || truncateText(input.desiredOutput, 8) || input.productName,
    secondaryFeature: mustHaves[1] || truncateText(input.productIdea, 8),
    outputAnchor: truncateText(input.desiredOutput || input.productIdea, 10),
    workflowAnchor: truncateText(answers['primary-workflow'] || input.desiredOutput, 12),
    riskAnchor: truncateText(answers['operating-risks'] || input.risks, 12),
    acceptanceAnchor: truncateText(answers.acceptance || input.successMetrics, 12),
    inferredAssumptions,
    domainArchetype,
    archetypeDetection,
    domainSignals,
    riskFlags,
    uiRelevant,
    ontology,
    extractions,
    tokenPack
  };
}

function buildQuestionnaire(input: ProjectInput): QuestionnaireItem[] {
  return buildQuestionPrompts(getProfileConfig(input));
}

function containsAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function titleCase(value: string) {
  return value
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeEntityName(value: string) {
  return titleCase(value.replace(/\b(optional|local|file|notes?|preferences?)\b/gi, '').trim()) || 'Core Record';
}

function collectCoreEntities(input: ProjectInput, context: ProjectContext) {
  const ontologyEntities = context.ontology.entityTypes.map((entity) => entity.name);
  if (ontologyEntities.length) return ontologyEntities.slice(0, 6);
  const raw = context.integrations.length ? context.integrations : context.mustHaves;
  return unique(raw.map(normalizeEntityName).filter(Boolean)).slice(0, 5);
}

function inferSensitivityLevel(context: ProjectContext) {
  if (
    context.riskFlags.includes('medical') ||
    context.riskFlags.includes('legal') ||
    context.riskFlags.includes('sensitive-data')
  ) {
    return 'High';
  }
  if (
    context.riskFlags.includes('children') ||
    context.riskFlags.includes('privacy') ||
    context.riskFlags.includes('money')
  ) {
    return 'Medium';
  }
  return 'Low';
}

function inferExternalServices(input: ProjectInput, context: ProjectContext) {
  if (context.ontology.integrationTypes.length) {
    return context.ontology.integrationTypes.map((service) => ({
      name: service.name,
      purpose: service.purpose,
      required: service.required,
      trigger: service.trigger
    }));
  }

  const source = [
    input.productIdea,
    input.mustHaveFeatures,
    input.dataAndIntegrations,
    input.desiredOutput,
    input.constraints,
    ...Object.values(input.questionnaireAnswers)
  ].join(' ');

  const nonGoalsLower = input.nonGoals.toLowerCase();

  const services: Array<{ name: string; purpose: string; required: boolean; trigger: string }> = [];
  const addService = (name: string, purpose: string, trigger: string, required = true) => {
    if (!services.some((service) => service.name === name)) {
      services.push({ name, purpose, trigger, required });
    }
  };

  if (/(stripe|payment|checkout|billing)/i.test(source) && !/no payment|no billing|no checkout/i.test(nonGoalsLower)) {
    addService('Payments provider', 'Handle charges, subscriptions, or checkout events.', 'When payment flow is approved.');
  }
  if (/(email|sendgrid|resend|mailgun|smtp)/i.test(source) && !/no email|no mail/i.test(nonGoalsLower)) {
    addService('Email service', 'Send notifications, confirmations, or reminders.', 'When outbound email is part of the workflow.');
  }
  if (/(oauth|google|microsoft|github|login|sso)/i.test(source) && !/no oauth|no sso|no login/i.test(nonGoalsLower)) {
    addService('Identity provider', 'Handle delegated sign-in or account linking.', 'When external identity is explicitly required.');
  }
  if (/(webhook|callback|event source)/i.test(source) && !/no webhook/i.test(nonGoalsLower)) {
    addService('Webhook source', 'Deliver external event notifications into the app.', 'When outside systems push events.');
  }
  if (/(calendar|google calendar|outlook calendar)/i.test(source) && !/no calendar/i.test(nonGoalsLower)) {
    addService('Calendar integration', 'Sync events or appointments with an external calendar.', 'When calendar sync is explicitly required.');
  }
  if (/(sms|twilio|text message)/i.test(source) && !/no sms|no text/i.test(nonGoalsLower)) {
    addService('SMS service', 'Send text message notifications.', 'When SMS delivery is part of the workflow.');
  }
  if (/(storage|upload|blob|s3|drive|dropbox)/i.test(source) && !/no storage|no upload/i.test(nonGoalsLower)) {
    addService('File storage service', 'Store uploaded files or generated exports.', 'When files must live outside the local workspace.');
  }
  if (/(database|postgres|mysql|mongodb|redis)/i.test(source) && !/no database/i.test(nonGoalsLower)) {
    addService('Data store', 'Persist shared records outside local markdown artifacts.', 'Only if the MVP is explicitly allowed to move beyond local-first behavior.');
  }

  // Only add generic "External API" if the user explicitly mentioned APIs or integrations
  if (/(external api|third-party api|api integration)/i.test(source) && !/no api|no integration/i.test(nonGoalsLower)) {
    addService('External API', 'Read from or write to another product service.', 'When the workflow depends on outside data or actions.');
  }

  if (!services.length) {
    addService(
      'No live external service approved yet',
      'Keep the MVP runnable with local files, local mocks, and markdown-first artifacts until a real dependency is approved.',
      'Stay in this mode unless a later scope decision explicitly adds a service.',
      false
    );
  }

  return services.slice(0, 5);
}

function needsSecurityModule(input: ProjectInput, context: ProjectContext) {
  const source = [
    input.productName,
    input.productIdea,
    input.problemStatement,
    input.mustHaveFeatures,
    input.dataAndIntegrations,
    input.risks,
    input.targetAudience
  ].join(' ');
  return containsAny(source, [
    /private|privacy|sensitive|permission|role|account|family|medical|health|financial|money|legal|student|child/i,
    /records?|contacts?|documents?|scheduling|budget|resident|volunteer/i
  ]);
}

function needsIntegrationModule(input: ProjectInput, context: ProjectContext) {
  const services = inferExternalServices(input, context);
  return services.some((service) => service.required && service.name !== 'No live external service approved yet');
}

function needsArchitectureModule(input: ProjectInput, context: ProjectContext) {
  return (
    input.track === 'technical' ||
    context.mustHaves.length >= 4 ||
    context.integrations.length >= 3 ||
    context.audienceSegments.length >= 2 ||
    context.riskFlags.length >= 2 ||
    needsIntegrationModule(input, context)
  );
}

function getFriendlyModuleEntries(input: ProjectInput, context: ProjectContext) {
  return [
    {
      name: 'Product Goal and Scope',
      folder: '/product-strategy/',
      status: 'Required',
      reason: 'Prevents the build from drifting away from the real MVP.'
    },
    {
      name: 'What the App Must Do',
      folder: '/requirements/',
      status: 'Required',
      reason: 'Turns the idea into build-ready requirements and acceptance checks.'
    },
    {
      name: 'Private Data and Safety Check',
      folder: '/security-risk/',
      status: needsSecurityModule(input, context) ? 'Required' : 'Recommended',
      reason: needsSecurityModule(input, context)
        ? 'This project touches sensitive roles, private data, trust boundaries, or regulated-style risk.'
        : 'Keep it ready so privacy, secret handling, and risky dependencies are not guessed later.'
    },
    {
      name: 'External Services and Setup',
      folder: '/integrations/',
      status: needsIntegrationModule(input, context) ? 'Required' : 'Optional',
      reason: needsIntegrationModule(input, context)
        ? 'The workflow depends on outside services, APIs, credentials, or setup details.'
        : 'The folder is generated now, but the MVP should stay runnable with local mocks unless scope changes.'
    },
    {
      name: 'Technical Plan',
      folder: '/architecture/',
      status: needsArchitectureModule(input, context) ? 'Required' : 'Recommended',
      reason: needsArchitectureModule(input, context)
        ? 'This project has enough moving parts that architecture, state, and boundaries must be explicit.'
        : 'A lightweight technical plan still helps the AI avoid accidental overengineering.'
    },
    {
      name: 'Screen and Workflow Review',
      folder: '/ui-ux/',
      status: context.uiRelevant ? 'Required' : 'Recommended',
      reason: context.uiRelevant
        ? 'The project includes screens, forms, dashboards, or workflow states that need screenshot review.'
        : 'Keep it on standby in case interface work appears later.'
    },
    {
      name: 'Retest Previous Problems',
      folder: '/regression-suite/',
      status: 'Required',
      reason: 'Protects earlier wins and stops regressions from sneaking through.'
    },
    {
      name: 'Improve Until Good Enough Loop',
      folder: '/recursive-test/',
      status: 'Required',
      reason: 'Pushes the package from barely working to evidence-backed quality after major build milestones.'
    }
  ] as const;
}

function getPhaseSupportModules(phase: PhasePlan, input: ProjectInput, context: ProjectContext) {
  const source = `${phase.name} ${phase.goal} ${phase.focusSummary} ${phase.reviewChecklist.join(' ')} ${phase.scopeGuards.join(' ')}`.toLowerCase();
  const modules: Array<{ folder: string; reason: string }> = [];
  const addModule = (folder: string, reason: string) => {
    if (!modules.some((module) => module.folder === folder)) modules.push({ folder, reason });
  };

  if (phase.phaseType === 'planning' || /(scope|brief|north star|value|rollout|handoff|mvp)/i.test(source)) {
    addModule('/product-strategy/', 'This phase affects product goal, MVP scope, tradeoffs, or explicit non-goals.');
    addModule('/requirements/', 'This phase depends on clear acceptance checks and explicit open questions.');
  }

  if (phase.phaseType === 'design' || /(workflow|state|requirement|acceptance|user flow|qualification|ordering|inventory|maintenance|schedule)/i.test(source)) {
    addModule('/requirements/', 'This phase changes or clarifies the workflow, requirements, or acceptance criteria.');
  }

  if (
    needsSecurityModule(input, context) &&
    (/(privacy|permission|role|secret|sensitive|child|student|patient|safety|risk|visibility|authorization)/i.test(source) ||
      context.riskFlags.length > 0 && phase.phaseType === 'verification')
  ) {
    addModule('/security-risk/', 'This phase touches private data, permissions, secret handling, or trust boundaries.');
  }

  if (
    (needsIntegrationModule(input, context) || context.integrations.length > 0) &&
    (/(integration|api|external|service|webhook|environment|delivery|notification|calendar|storage|payment|email)/i.test(source) ||
      phase.phaseType === 'implementation')
  ) {
    addModule('/integrations/', 'This phase adds or relies on external services, environment setup, mocks, or failure handling.');
  }

  if (
    needsArchitectureModule(input, context) &&
    (/(architecture|state|data|entity|contract|repo|boundary|component|system|workflow)/i.test(source) ||
      phase.phaseType === 'design' ||
      phase.phaseType === 'implementation')
  ) {
    addModule('/architecture/', 'This phase changes system boundaries, state handling, data shape, or technical structure.');
  }

  return modules;
}

function renderSupportModuleLines(modules: Array<{ folder: string; reason: string }>, fallback: string) {
  if (!modules.length) return `- ${fallback}`;
  return modules.map((module) => `- ${module.folder} ${module.reason}`).join('\n');
}

function buildProductStrategyStartHere(input: ProjectInput, context: ProjectContext) {
  return `# PRODUCT_STRATEGY_START_HERE

## What this folder is for
Use this folder to stop the build from solving the wrong problem. It gives the AI agent a clear product goal, a real MVP boundary, and a visible out-of-scope list.

## Beginner shortcut
- In the beginner journey, this folder supports Decide.
- You usually do not need to open every file here.
- Start with PRODUCT_NORTH_STAR.md, MVP_SCOPE.md, and PRODUCT_STRATEGY_GATE.md if product direction feels fuzzy.

## What the AI agent should read first
1. PRODUCT_NORTH_STAR.md
2. TARGET_USERS.md
3. MVP_SCOPE.md
4. OUT_OF_SCOPE.md
5. SUCCESS_METRICS.md
6. PRODUCT_STRATEGY_GATE.md

## Current product anchor
- Product: ${input.productName}
- Target user: ${context.primaryAudience}
- Main problem: ${input.problemStatement}
- Primary feature focus: ${context.primaryFeature}
`;
}

function buildProductNorthStar(input: ProjectInput, context: ProjectContext) {
  const mainWorkflow = context.ontology.workflowTypes[0];
  return `# PRODUCT_NORTH_STAR

## Plain-English product goal
${input.questionnaireAnswers['north-star'] || input.productIdea}

## Target user
${context.primaryAudience}

## Main problem
${input.problemStatement}

## Desired outcome
- A working ${input.productName} that proves the core workflow for ${context.primaryAudience}.
- The first release proves the ${mainWorkflow?.name || 'core workflow'} using the same actors, entities, and boundaries named throughout the package.
- The first release stays inside the approved MVP and does not add speculative features.

## What success looks like
${listToBullets(
  splitItems(input.successMetrics).concat([
    `${context.primaryAudience} can follow the core workflow without hidden decisions.`,
    `The AI stays inside the approved MVP instead of guessing new product scope.`
  ]),
  'Success means the product goal, audience, and MVP are explicit.'
)}

## What failure looks like
${listToBullets(
  context.risks.concat([
    'The target user is still vague.',
    'The phase plan contradicts the product goal or MVP scope.',
    'The package quietly adds future features before the first release is proven.'
  ]),
  'Failure means the product direction is still unclear.'
)}
`;
}

function buildTargetUsers(input: ProjectInput, context: ProjectContext) {
  const actors = context.ontology.actorTypes;
  const primaryActor = actors[0];
  const secondaryUsers = actors.slice(1).map((actor) => actor.name);
  return `# TARGET_USERS

## Primary target user
- ${primaryActor?.name || context.primaryAudience}
- Why they matter first: ${input.problemStatement}

## Secondary users
${listToBullets(
  secondaryUsers.map((user) => `${user} — may influence adoption, review handoffs, or approve scope changes.`),
  'No secondary user was explicitly named yet. Add one if another role can block adoption or approval.'
)}

## Jobs to be done
${listToBullets(
  [
    `Complete the main workflow: ${context.ontology.workflowTypes[0]?.description || context.workflowAnchor}.`,
    `Get the desired outcome: ${context.outputAnchor}.`,
    `Avoid the main risk: ${context.riskAnchor}.`
  ],
  'Jobs to be done still need clarification.'
)}

## What would confuse or frustrate them
${listToBullets(
  context.risks.slice(0, 4).map((risk) => sentenceCase(risk)),
  'Confusion points are not explicit yet.'
)}
`;
}

function buildMvpScope(input: ProjectInput, context: ProjectContext) {
  return `# MVP_SCOPE

## Must-have features
${listToBullets(context.mustHaves, 'Must-have features still need confirmation.')}

## Should-have features
${listToBullets(context.niceToHaves.slice(0, 5), 'No should-have items are approved yet.')}

## Later features
${listToBullets(
  context.niceToHaves.slice(5).concat([
    'Anything that depends on a hosted UI, database, or auth.',
    'Any workflow that cannot be proven with the current local-first MVP.'
  ]),
  'Later features should be recorded here before they are discussed in build phases.'
)}

## Explicit non-goals
${listToBullets(
  context.nonGoals.concat([
    'Do not weaken gates, validation, recursive testing, local-first behavior, or markdown-first behavior.'
  ]),
  'Explicit non-goals must be recorded before the package is considered build-ready.'
)}
`;
}

function buildOutOfScope(input: ProjectInput, context: ProjectContext) {
  const serviceNames = inferExternalServices(input, context)
    .filter((service) => service.required && service.name !== 'No live external service approved yet')
    .map((service) => service.name);
  return `# OUT_OF_SCOPE

## Features not to build yet
${listToBullets(
  context.nonGoals.concat(context.niceToHaves.slice(0, 4)),
  'Record delayed features here so the AI does not treat them as implied requirements.'
)}

## Architecture not to add yet
${listToBullets(
  [
    'No hosted UI.',
    'No database.',
    'No auth.',
    'No microservices, event buses, or extra infrastructure unless the MVP proves they are necessary.'
  ],
  'Do not add architecture complexity that the MVP has not earned.'
)}

## Integrations not to add yet
${listToBullets(
  serviceNames.length
    ? serviceNames.map((name) => `${name} is deferred until the product scope explicitly requires it.`)
    : ['No live external services are approved yet beyond local mocks and local files.'],
  'No integrations are approved yet.'
)}

## Reasons these items are out of scope
${listToBullets(
  [
    'Keep the first release small enough to validate quickly.',
    'Protect local-first and markdown-first behavior.',
    'Reduce rework from speculative architecture or setup.',
    'Keep beginner-facing guidance simple while the AI uses deeper folders as guardrails.'
  ],
  'Reasons must be stated explicitly so future builders do not guess.'
)}
`;
}

function buildSuccessMetrics(input: ProjectInput, context: ProjectContext) {
  return `# SUCCESS_METRICS

## Business success criteria
${listToBullets(
  splitItems(input.successMetrics).concat([
    'The project remains inside the approved MVP and out-of-scope list.',
    'The handoff is strong enough that a new builder can continue without hidden chat context.'
  ]),
  'Business success criteria need to be written in observable terms.'
)}

## User success criteria
${listToBullets(
  [
    `${context.primaryAudience} can complete the core workflow without guessing what happens next.`,
    'The product outcome is understandable in plain English.',
    'Important trust or safety boundaries stay visible to the user.'
  ],
  'User success criteria still need clarification.'
)}

## Build success criteria
${listToBullets(
  [
    'Generated phases, gates, and handoffs stay consistent with the product goal.',
    'The AI does not add hidden scope, unapproved services, or unnecessary architecture.',
    'All required support folders are generated and internally consistent.'
  ],
  'Build success criteria still need to be defined.'
)}

## Test success criteria
${listToBullets(
  [
    'Deterministic validation passes.',
    'Quality-regression checks pass.',
    'Phase evidence, regression evidence, and recursive quality evidence all agree.'
  ],
  'Test success criteria still need clarification.'
)}
`;
}

function buildTradeoffLog(input: ProjectInput, context: ProjectContext) {
  return `# TRADEOFF_LOG

## Current tradeoffs
- Keep the first release centered on ${context.primaryFeature} instead of adding optional extras too early.
- Prefer local files, markdown artifacts, and mocks over hosted infrastructure.
- Favor explicit safety, scope, and acceptance checks over faster but ambiguous build velocity.

## Deferred tradeoffs to revisit later
${listToBullets(
  context.niceToHaves.slice(0, 4).map((item) => `Revisit ${item} only after the MVP proves the main workflow.`),
  'Add later tradeoffs here when a real scope decision is made.'
)}
`;
}

function buildProductStrategyGate() {
  return `# PRODUCT_STRATEGY_GATE

## Entry criteria
- Product brief exists.
- Target audience is named.
- Must-have scope and non-goals are recorded.

## Required evidence
- PRODUCT_NORTH_STAR.md completed.
- MVP_SCOPE.md completed.
- OUT_OF_SCOPE.md completed.
- SUCCESS_METRICS.md completed.

## Pass criteria
- Product goal is plain English and consistent with the phase plan.
- Target user is specific enough to guide the build.
- MVP scope, later scope, and non-goals are all explicit.
- Success criteria are visible and reviewable.

## Revise criteria
- Product goal is understandable but still too broad.
- Scope categories exist but have contradictions or weak deferrals.
- Success criteria need sharper wording or evidence.

## Auto-fail conditions
- Target user unclear.
- MVP scope unclear.
- No out-of-scope list.
- Success criteria missing.
- Product goal contradicts phase plan.
`;
}

function buildRequirementsStartHere(input: ProjectInput, context: ProjectContext) {
  return `# REQUIREMENTS_START_HERE

## What this folder is for
This folder turns the idea into build-ready requirements. It is the guardrail that keeps "sounds good" from becoming "no one knows what to build."

## Beginner shortcut
- In the beginner journey, this folder supports Decide.
- Most business users only need the friendly summary in the main guide plus the copy-paste prompts.
- Open this folder directly only when requirements, edge cases, or acceptance checks feel weak.

## Read in this order
1. FUNCTIONAL_REQUIREMENTS.md
2. NON_FUNCTIONAL_REQUIREMENTS.md
3. ACCEPTANCE_CRITERIA.md
4. OPEN_QUESTIONS.md
5. REQUIREMENTS_GATE.md
`;
}

const FALLBACK_REQUIREMENTS_BANNER = `> ⚠️ DEPRECATED PATH. Generated via the archetype-template fallback. Research extractions are required for production-ready output. Run the recipe in docs/RESEARCH_RECIPE.md (in your coding agent) or scripts/synthesize-research-ontology.ts (harness only) and regenerate with \`--research-from=<dir>\`. The archetype path will be removed once A3c completes.\n\n`;

function buildFunctionalRequirements(input: ProjectInput, context: ProjectContext) {
  if (context.extractions) {
    return buildFunctionalRequirementsFromResearch(input, context.extractions);
  }
  const scenarios: OntologyFeatureScenario[] = context.ontology.featureScenarios.length
    ? context.ontology.featureScenarios
    : [
        {
          feature: context.primaryFeature,
          scenarioType: 'record-create',
          actor: { name: context.primaryAudience, type: 'primary-user', aliases: [], responsibilities: [], visibility: [] },
          workflow: context.ontology.workflowTypes[0],
          entities: [],
          fields: [],
          integrations: [],
          risks: [],
          userAction: `The user completes ${context.primaryFeature}.`,
          systemResponse: `The system keeps the ${context.primaryFeature} workflow reviewable.`,
          storedData: `Core data for ${fallbackEntityName(context.primaryFeature)} is stored locally.`,
          failureCase: context.risks[0] || 'The workflow fails clearly instead of silently.',
          testableOutcome: `A reviewer can execute ${context.primaryFeature} with realistic data and confirm the outcome.`
        }
      ];
  return `# FUNCTIONAL_REQUIREMENTS

${FALLBACK_REQUIREMENTS_BANNER}${scenarios
    .map(
      (scenario, index) => `## Requirement ${index + 1}: ${sentenceCase(scenario.feature)}

- Actor: ${scenario.actor.name}
- User action: ${scenario.userAction}
- System response: ${scenario.systemResponse}
- Stored data: ${scenario.storedData}
- Failure case: ${scenario.failureCase}
- Testable outcome: ${scenario.testableOutcome}
- Related workflow: ${scenario.workflow?.name || 'Core workflow'}
- Related entities: ${(scenario.entities || []).map((entity) => entity.name).join(', ') || fallbackEntityName(scenario.feature)}`
    )
    .join('\n\n')}
`;
}

/**
 * Phase G G2 issue 4: pick the failureMode whose trigger shares the most
 * content-bearing tokens with the step's branchOn / systemResponse. Returns
 * undefined if no failureMode shares ≥ 1 meaningful keyword (3+ chars,
 * non-stopword) — caller then emits a workflow-level pointer instead of
 * fabricating a join.
 */
function matchFailureModeForStep(
  step: { branchOn?: string; systemResponse: string; action: string; order: number },
  failureModes: ReadonlyArray<{ trigger: string; effect: string; mitigation: string }>
): { trigger: string; effect: string; mitigation: string } | undefined {
  if (!failureModes.length) return undefined;
  const stepText = [step.branchOn || '', step.systemResponse || '', step.action || '']
    .join(' ')
    .toLowerCase();
  if (!stepText.trim()) return undefined;
  const STOP = new Set([
    'and', 'the', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'what',
    'will', 'have', 'been', 'were', 'are', 'is', 'a', 'an', 'of', 'to', 'in',
    'on', 'or', 'as', 'by', 'be', 'at', 'it', 'if', 'so', 'no', 'not'
  ]);
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !STOP.has(t))
    );
  const stepTokens = tokenize(stepText);
  if (stepTokens.size === 0) return undefined;
  let best: { fm: typeof failureModes[number]; overlap: number } | undefined;
  for (const fm of failureModes) {
    const fmTokens = tokenize(fm.trigger);
    let overlap = 0;
    for (const t of fmTokens) if (stepTokens.has(t)) overlap += 1;
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { fm, overlap };
  }
  return best?.fm;
}

function buildFunctionalRequirementsFromResearch(input: ProjectInput, ex: ResearchExtractions) {
  const actorById = new Map(ex.actors.map((a) => [a.id, a]));
  const entityById = new Map(ex.entities.map((e) => [e.id, e]));

  // Flatten workflows × steps into one requirements list, but use the legacy
  // `Requirement N:` heading format and a flat REQ-N counter so every downstream
  // consumer (audit, phase plan REQ refs, traceability matrix) sees one ID space.
  type FlatReq = {
    title: string;
    workflow: { name: string; acceptancePattern: string; sources: typeof ex.workflows[number]['sources']; failureModes: typeof ex.workflows[number]['failureModes'] };
    actor: ReturnType<typeof actorById.get>;
    entities: typeof ex.entities;
    step: typeof ex.workflows[number]['steps'][number];
  };
  const flat: FlatReq[] = [];
  for (const wf of ex.workflows) {
    for (const step of wf.steps) {
      const actor = actorById.get(step.actor);
      const entities = wf.entitiesTouched.map((id) => entityById.get(id)).filter(Boolean) as typeof ex.entities;
      flat.push({ title: sentenceCase(step.action), workflow: wf, actor, entities, step });
    }
  }

  const requirements = flat.map((r, i) => {
    const reqNum = i + 1;
    const sourceList = r.workflow.sources
      .slice(0, 2)
      .map((s) => `[${s.title}](${s.url})`)
      .join('; ');
    // Phase G G2 issue 4: derive per-step failure from `step.branchOn` first.
    // If branchOn (or systemResponse) shares meaningful keywords with one of
    // the workflow's failure-mode triggers, attach THAT specific failure to
    // the requirement; otherwise emit a workflow-level pointer instead of
    // rotating through unrelated failures. Pre-G2 code rotated by step index
    // modulo, which produced join-spam (e.g. delimiter check listed under
    // "resolve flagged rows") because most workflows have 5-7 steps but only
    // 2-3 failure modes.
    const fmList = r.workflow.failureModes;
    const fm = matchFailureModeForStep(r.step, fmList);
    const failureNote = fm
      ? `On ${fm.trigger.toLowerCase()}, ${fm.mitigation.toLowerCase()}.`
      : fmList.length
        ? `No step-specific failure mode researched for this action; see workflow-level failures for "${r.workflow.name}" (${fmList.length} mode${fmList.length === 1 ? '' : 's'}).`
        : 'Failure surfaces clearly to the actor; no silent state.';
    return `## Requirement ${reqNum}: ${r.title}

- Actor: ${r.actor ? r.actor.name : r.step.actor}
- User action: ${r.step.action}
- System response: ${r.step.systemResponse}
- Stored data: ${r.entities.map((e) => `${e.name} (${e.fields.slice(0, 4).map((f) => f.name).join(', ')})`).join('; ') || 'See research/extracted/entities.json'}
- Failure case: ${failureNote}
- Testable outcome: ${r.workflow.acceptancePattern}
- Related workflow: ${r.workflow.name}
- Related entities: ${r.entities.map((e) => e.name).join(', ') || '—'}
- Sourced from: ${sourceList || 'research extractions'}`;
  });

  const conflictsBlock = ex.conflicts.length
    ? `\n\n## Outstanding conflicts with the brief\n\n${ex.conflicts
        .map(
          (c) =>
            `- **${c.severity}** (${c.field}): brief says "${c.briefAssertion}"; research finding: "${c.researchFinding}". Resolution status: \`${c.resolution}\`.`
        )
        .join('\n')}`
    : '';

  const antiBlock = ex.antiFeatures.length
    ? `\n\n## Anti-features (deliberately out of scope)\n\n${ex.antiFeatures
        .map((a) => `- ${a.description} (${a.rationale})`)
        .join('\n')}`
    : '';

  return `# FUNCTIONAL_REQUIREMENTS

> Generated from research extractions (research/extracted/). Every requirement traces to a researched workflow step with cited sources. See research/USE_CASE_RESEARCH.md and research/DOMAIN_RESEARCH.md for the supporting narratives.

## Actors

${ex.actors.map((a) => `- **${a.name}** (\`${a.id}\`, ${a.type}) — ${a.responsibilities.join('; ')}`).join('\n')}

## Entities

${ex.entities.map((e) => `- **${e.name}** (\`${e.id}\`) — ${e.description} Owners: ${e.ownerActors.join(', ')}.`).join('\n')}

${requirements.join('\n\n')}${antiBlock}${conflictsBlock}
`;
}

function buildNonFunctionalRequirementsFromResearch(input: ProjectInput, ex: ResearchExtractions) {
  const groupedRisks = ex.risks.reduce<Record<string, typeof ex.risks>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});
  const riskLines = Object.entries(groupedRisks)
    .map(
      ([cat, items]) =>
        `### ${cat[0].toUpperCase() + cat.slice(1)}\n\n${items
          .map((r) => `- **${r.severity}** — ${r.description} Mitigation: ${r.mitigation}.`)
          .join('\n')}`
    )
    .join('\n\n');

  const gateLines = ex.gates
    .map(
      (g) =>
        `### ${g.name}\n\n- Mandated by: ${g.mandatedBy} — ${g.mandatedByDetail}\n- Applies: ${g.applies}${g.appliesIf ? ` (if ${g.appliesIf})` : ''}\n- Evidence required:\n${g.evidenceRequired.map((e) => `  - ${e}`).join('\n')}\n- Blocks phases: ${g.blockingPhases.join(', ') || '—'}`
    )
    .join('\n\n');

  const integrationLines = ex.integrations
    .map(
      (i) =>
        `- **${i.name}** (${i.vendor}, ${i.category}, popularity: ${i.popularity}) — ${i.purpose} | env: \`${i.envVar}\` | mocked-by-default: ${i.mockedByDefault} | failure modes: ${i.failureModes.join('; ')}`
    )
    .join('\n');

  return `# NON_FUNCTIONAL_REQUIREMENTS

> Generated from research extractions. Every risk and gate traces to cited primary sources.

## Risks

${riskLines}

## Hard gates the industry expects

${gateLines}

## Integrations

${integrationLines || '- None researched.'}
`;
}

function buildNonFunctionalRequirements(input: ProjectInput, context: ProjectContext) {
  if (context.extractions) {
    return buildNonFunctionalRequirementsFromResearch(input, context.extractions);
  }
  return `# NON_FUNCTIONAL_REQUIREMENTS

## Performance expectations
- The core workflow should feel responsive enough for ${context.primaryAudience} to complete the main task without waiting on unnecessary infrastructure.

## Reliability expectations
- The package should remain usable with local files, deterministic validation, and phase-by-phase recovery.

## Privacy expectations
- Private data and visibility rules must be explicit before implementation.

## Usability expectations
- Beginner-facing guidance stays simple, step-by-step, and plain English.

## Accessibility expectations
- If the project has screens, forms, or dashboards, accessibility review remains part of Screen and Workflow Review.

## Maintainability expectations
- Markdown files remain the source of truth.
- Architecture stays proportional to the MVP.
- Future integrations or advanced infrastructure must be deferred until explicitly approved.
`;
}

function buildAcceptanceCriteria(input: ProjectInput, context: ProjectContext, phases?: PhasePlan[]) {
  if (context.extractions) {
    return buildAcceptanceCriteriaFromResearch(input, context.extractions, phases);
  }
  const scenarios: OntologyFeatureScenario[] = context.ontology.featureScenarios.length
    ? context.ontology.featureScenarios
    : [
        {
          feature: context.primaryFeature,
          scenarioType: 'record-create',
          actor: { name: context.primaryAudience, type: 'primary-user', aliases: [], responsibilities: [], visibility: [] },
          workflow: context.ontology.workflowTypes[0],
          entities: [],
          fields: [],
          integrations: [],
          risks: [],
          userAction: `The user runs ${context.primaryFeature}.`,
          systemResponse: `The system records the expected result for ${context.primaryFeature}.`,
          storedData: `Core data for ${fallbackEntityName(context.primaryFeature)} is stored locally.`,
          failureCase: `The system rejects invalid or unauthorized ${context.primaryFeature} actions.`,
          testableOutcome: `A reviewer can prove ${context.primaryFeature} with realistic data.`
        }
      ];

  return `# ACCEPTANCE_CRITERIA

${scenarios
    .map(
      (safeScenario, index) => {
        const pattern = findAcceptancePattern(context.ontology, safeScenario.scenarioType);
        const values = inferScenarioValues(safeScenario);
        const entityName = values?.entityName || fallbackEntityName(safeScenario.feature);
        const sampleSummary = values?.entitySampleSummary || 'realistic local data';
        const phaseSlug = phases && phases.length
          ? getRequirementPhaseSlug(index, phases)
          : `phase-${String(Math.min(index + 1, 9)).padStart(2, '0')}`;
        return `## ${index + 1}. ${sentenceCase(safeScenario.feature)}

- Requirement ID: REQ-${index + 1}
- Clear pass/fail check: ${safeScenario.testableOutcome}
- Given: ${values?.actorExample || context.primaryAudience} has ${entityName} data prepared with ${sampleSummary}.
- When: ${safeScenario.userAction}
- Then: ${safeScenario.systemResponse}
- Negative case: ${safeScenario.failureCase}
- Verification method: ${pattern?.verificationMethod || 'Verify the stored record, resulting state, and visible outcome together.'}
- Test or manual verification method: ${pattern?.verificationMethod || 'Verify the stored record, resulting state, and visible outcome together.'}
- Sample data: see SAMPLE_DATA.md "${entityName}" section. Inline reference: ${sampleSummary}.
- Evidence required: Capture one happy-path observation and one negative-path observation for ${safeScenario.feature} that mention ${entityName} data such as ${sampleSummary}.
- Related files: FUNCTIONAL_REQUIREMENTS.md, SAMPLE_DATA.md, phases/${phaseSlug}/PHASE_BRIEF.md, phases/${phaseSlug}/TEST_SCRIPT.md`;
      }
    )
    .join('\n\n')}
`;
}

function buildAcceptanceCriteriaFromResearch(
  input: ProjectInput,
  ex: ResearchExtractions,
  phases?: PhasePlan[]
) {
  const actorById = new Map(ex.actors.map((a) => [a.id, a]));
  const entityById = new Map(ex.entities.map((e) => [e.id, e]));

  type Flat = {
    workflow: typeof ex.workflows[number];
    step: typeof ex.workflows[number]['steps'][number];
  };
  const flat: Flat[] = [];
  for (const wf of ex.workflows) {
    for (const step of wf.steps) flat.push({ workflow: wf, step });
  }

  const blocks = flat.map((f, i) => {
    const reqId = `REQ-${i + 1}`;
    const actor = actorById.get(f.step.actor);
    const actorName = actor?.name || f.step.actor;
    const entityNames = f.workflow.entitiesTouched
      .map((eid) => entityById.get(eid)?.name)
      .filter(Boolean) as string[];
    const primaryEntity = entityNames[0] || 'the relevant entity';
    const failure = f.workflow.failureModes[0];
    const phaseSlug = phases && phases.length
      ? getRequirementPhaseSlug(i, phases)
      : `phase-${String(Math.min(i + 1, 9)).padStart(2, '0')}`;
    const branchLine = f.step.branchOn ? `\n- Branch decision: ${f.step.branchOn}` : '';
    const preconditionLine = f.step.preconditions?.length
      ? `\n- Preconditions: ${f.step.preconditions.join('; ')}`
      : '';
    const postconditionLine = f.step.postconditions?.length
      ? `\n- Postconditions: ${f.step.postconditions.join('; ')}`
      : '';
    return `## ${i + 1}. ${sentenceCase(f.step.action)}

- Requirement ID: ${reqId}
- Workflow: ${f.workflow.name}
- Actor: ${actorName}
- Clear pass/fail check: ${f.workflow.acceptancePattern}
- Given: ${actorName} has ${primaryEntity} data prepared from SAMPLE_DATA.md "${primaryEntity}" section.
- When: ${f.step.action}
- Then: ${f.step.systemResponse}${branchLine}${preconditionLine}${postconditionLine}
- Negative case: ${failure ? `${failure.trigger} → expect: ${failure.mitigation}` : 'Invalid input or unauthorized actor must be rejected with a visible reason.'}
- Verification method: Run the step with the happy-path SAMPLE_DATA.md record, then re-run with the negative-case input. Inspect persisted state, audit entry, and the actor's visibility scope.
- Test or manual verification method: Run the step with the happy-path SAMPLE_DATA.md record, then re-run with the negative-case input. Inspect persisted state, audit entry, and the actor's visibility scope.
- Sample data: SAMPLE_DATA.md "${primaryEntity}" section
- Evidence required: For ${reqId} (${f.workflow.name} → ${f.step.action.toLowerCase()}), capture one happy-path observation showing ${primaryEntity} state after the step, plus one negative-path observation proving the trigger "${failure?.trigger || 'invalid input'}" was rejected with the researched mitigation.
- Related files: FUNCTIONAL_REQUIREMENTS.md (${reqId}), SAMPLE_DATA.md, phases/${phaseSlug}/PHASE_BRIEF.md, phases/${phaseSlug}/TEST_SCRIPT.md`;
  });

  return `# ACCEPTANCE_CRITERIA

> Generated from research extractions. Each acceptance criterion below is one workflow step rendered as a Given/When/Then block, with the workflow's acceptance pattern as the pass criterion and the workflow's first failure mode as the negative case.

${blocks.join('\n\n')}
`;
}

function buildOpenQuestions(input: ProjectInput, context: ProjectContext) {
  const questions = [
    context.answers['scope-cut'] ? '' : 'Which features stay in v1 if time is cut in half?',
    context.answers.acceptance ? '' : 'What exact evidence should prove the package is ready to build?',
    needsIntegrationModule(input, context) && !context.answers['data-boundaries']
      ? 'Which external boundaries, APIs, or data handoffs must be explicit before coding?'
      : '',
    needsSecurityModule(input, context)
      ? 'Which private-data, visibility, or permission decisions still need a human answer?'
      : ''
  ].filter(Boolean);

  return `# OPEN_QUESTIONS

${(questions.length ? questions : ['No blocking open questions were inferred at generation time. Keep this file updated when uncertainty appears.'])
    .map(
      (question, index) => `## Question ${index + 1}

- Unresolved assumption: ${question}
- Owner: Product owner or reviewer
- Priority: ${index === 0 ? 'P0' : 'P1'}
- Impact if unanswered: The AI may guess and build the wrong thing.
- When it must be answered: Before the affected phase moves from Plan to Build.`
    )
    .join('\n\n')}
`;
}

function buildRequirementsRiskReview(input: ProjectInput, context: ProjectContext) {
  return `# REQUIREMENTS_RISK_REVIEW

## Current requirement risks
${listToBullets(
  [
    'Generic requirements that could apply to any project.',
    'Acceptance criteria that cannot be tested with real evidence.',
    'Open questions that silently block build work.',
    'Requirements drifting away from the product goal and scope.'
  ].concat(context.risks.slice(0, 3)),
  'Requirement risks still need to be documented.'
)}
`;
}

function buildRequirementsGate() {
  return `# REQUIREMENTS_GATE

## Entry criteria
- Product strategy exists.
- Core workflow is named.
- Must-have features are listed.

## Required evidence
- FUNCTIONAL_REQUIREMENTS.md completed.
- NON_FUNCTIONAL_REQUIREMENTS.md completed.
- ACCEPTANCE_CRITERIA.md completed.
- OPEN_QUESTIONS.md reviewed.

## Pass criteria
- Core workflows have numbered requirements.
- Acceptance criteria are testable.
- Open questions are visible with owners and priorities.
- Requirements do not contradict product strategy.

## Revise criteria
- Requirements exist but still rely on generic language.
- Acceptance checks need sharper evidence rules.
- Open questions are present but not prioritized clearly enough.

## Auto-fail conditions
- Core workflow lacks acceptance criteria.
- Open P0 question blocks build.
- Requirements are generic.
- Acceptance criteria cannot be tested.
- Requirements contradict product strategy.
`;
}

function buildSecurityStartHere(input: ProjectInput, context: ProjectContext) {
  return `# SECURITY_START_HERE

## What this folder is for
This folder keeps the build honest about private data, secrets, permissions, risky dependencies, and situations that need expert review.

## Important note
- This folder does not provide legal advice.
- If risk stays high or unclear, flag it and request expert review instead of guessing.

## Read in this order
1. DATA_CLASSIFICATION.md
2. SECRET_MANAGEMENT.md
3. PRIVACY_RISK_REVIEW.md
4. AUTHORIZATION_REVIEW.md
5. SECURITY_GATE.md
`;
}

function buildDataClassification(input: ProjectInput, context: ProjectContext) {
  const entities = context.ontology.entityTypes;

  return `# DATA_CLASSIFICATION

${entities
    .map(
      (entity) => `## ${entity.name}

- Data types handled: ${entity.fields.map((field) => `${field.name} (${field.type})`).join(', ')}.
- Sensitivity level: ${entity.riskTypes.some((risk) => /privacy|legal|medical/i.test(risk)) ? 'High' : inferSensitivityLevel(context)}
- Where data is stored: Local markdown and JSON artifacts unless later scope explicitly approves something else.
- Who can access it: ${entity.ownerActors.join(', ') || context.primaryAudience}
- Retention notes: Keep only what is needed for the current workflow and review period.
- Risk notes: ${context.ontology.riskTypes.filter((risk) => entity.riskTypes.includes(risk.name)).map((risk) => risk.description).join(' ') || context.risks[0] || 'Review visibility, minimization, and stale-data risk before implementation.'}`
    )
    .join('\n\n')}
`;
}

function buildSecretManagement(input: ProjectInput, context: ProjectContext) {
  const services = inferExternalServices(input, context).filter((service) => service.required && service.name !== 'No live external service approved yet');
  return `# SECRET_MANAGEMENT

## Expected secrets
${listToBullets(
  services.length
    ? services.map((service) => `${service.name} credential or token, if and only if that service is approved for the MVP.`)
    : ['No live secrets are expected for the current MVP. Use local mocks until a real service is approved.'],
  'No secrets are expected yet.'
)}

## Where secrets should live
- Local environment files that are gitignored.
- OS-level secret storage or secure local tooling if available.

## What must never be committed
- API keys
- Tokens
- Passwords
- Real customer or private-data exports

## Local development handling
- Use placeholder values and local mocks whenever possible.

## Deployment handling if applicable
- Only document deployment secret handling if a later approved phase adds a real external service.
`;
}

function buildPrivacyRiskReview(input: ProjectInput, context: ProjectContext) {
  const expertReview = needsSecurityModule(input, context)
    ? 'Expert review is needed if legal, medical, child, financial, or other sensitive handling remains unclear.'
    : 'Expert review is optional unless later scope introduces sensitive or regulated data.';
  const privacyRisks = context.ontology.riskTypes.filter((risk) => /privacy|legal|boundary/i.test(risk.type) || /privacy|child|sensitive|visible|leak/i.test(risk.description));
  const productRisks = context.ontology.riskTypes.filter((risk) => !privacyRisks.includes(risk));

  return `# PRIVACY_RISK_REVIEW

## Private data risks
${listToBullets(
  privacyRisks.length
    ? privacyRisks.slice(0, 4).map((risk) => `${risk.name}: ${risk.description} Affected records: ${risk.appliesToEntities.join(', ') || 'core records'}.`)
    : ['No privacy-specific risks were inferred. Review whether any data could leak to the wrong role.'],
  'No private-data risk was inferred yet, but this should still be reviewed.'
)}

## Product risks (not privacy, but affect trust)
${listToBullets(productRisks.slice(0, 3).map((risk) => `${risk.name}: ${risk.description}`), 'No additional product risks recorded.')}

## User consent risks
- Make sure the product does not imply data collection or sharing that the user never approved.

## Data minimization notes
- Collect only the data needed for the MVP workflow.
- Keep sensitive detail out of screenshots, reminders, and exported examples when possible.

## Deletion/export considerations
- If users can add sensitive records later, plan how those records can be deleted or exported without guesswork.

## When expert review is needed
- ${expertReview}
- This file is not legal advice.
`;
}

function buildAuthorizationReview(input: ProjectInput, context: ProjectContext) {
  const roles = context.ontology.actorTypes.length
    ? context.ontology.actorTypes
    : [{ name: context.primaryAudience, responsibilities: ['Complete the main workflow'], visibility: ['Core workflow data'] }];
  return `# AUTHORIZATION_REVIEW

## User roles
${listToBullets(roles.map((role) => `${role.name}: ${role.responsibilities.join(', ')}`), 'Primary user role still needs confirmation.')}

## Permissions
${listToBullets(
  roles.map((role, index) => `${role.name}: ${index === 0 ? role.visibility.join(', ') || 'Full workflow visibility needed for the main task.' : role.visibility.join(', ') || 'Only the minimum visibility and actions needed for this role.'}`),
  'Permissions need to be defined before build work starts.'
)}

## Forbidden access patterns
- A user can see or change data meant for a different role without an explicit reason.
- The app stores more sensitive data than the workflow requires.
- Secret values or credentials become visible in repo files or screenshots.

## Role-based test cases
${listToBullets(
  [
    `Confirm ${roles[0]?.name || context.primaryAudience} can complete the intended workflow.`,
    `Confirm secondary roles cannot access restricted data or actions.`,
    'Confirm stale or hidden records do not leak through exports, prompts, or screenshots.'
  ],
  'Role-based tests must be added before sign-off.'
)}
`;
}

function buildDependencyRiskChecklist() {
  return `# DEPENDENCY_RISK_CHECKLIST

## New dependency review
- Explain why the dependency is needed for the MVP.

## Package risk
- Prefer mature, actively maintained packages with a narrow purpose.

## Maintenance risk
- Avoid dependencies that would be hard to replace or audit.

## License awareness
- Check that the license is compatible with the project.

## Avoid unnecessary dependencies
- Prefer built-in platform features or existing repo dependencies when they already solve the need.
`;
}

function buildSecurityGate() {
  return `# SECURITY_GATE

## Entry criteria
- Data types are listed.
- Expected roles are listed.
- Secret-handling expectations are written down.

## Required evidence
- DATA_CLASSIFICATION.md completed.
- SECRET_MANAGEMENT.md completed.
- PRIVACY_RISK_REVIEW.md completed.
- AUTHORIZATION_REVIEW.md completed.

## Pass criteria
- Sensitive handling is proportionate to the project.
- Secret storage rules are explicit.
- Role and visibility boundaries are reviewable.
- Risky dependencies are justified or deferred.

## Revise criteria
- Risk areas are identified but not actionable yet.
- Role or retention notes need sharper wording.
- A dependency or permission path still needs review.

## Auto-fail conditions
- Secrets committed to repo.
- Private data stored without clear purpose.
- Roles or permissions unclear.
- Sensitive project has no privacy review.
- Unnecessary risky dependency added.
`;
}

function buildIntegrationStartHere(input: ProjectInput, context: ProjectContext) {
  return `# INTEGRATION_START_HERE

## What this folder is for
This folder makes external services, keys, webhooks, mocks, and failure behavior explicit before coding depends on them.

## Beginner shortcut
- In the beginner journey, this folder supports Plan.
- If the MVP is still local-only, the folder should clearly say that and define mocks instead of real services.

## Read in this order
1. EXTERNAL_SERVICES.md
2. API_KEYS_AND_SECRETS.md
3. ENVIRONMENT_VARIABLES.md
4. MOCKING_STRATEGY.md
5. INTEGRATION_TEST_PLAN.md
6. INTEGRATION_GATE.md
`;
}

function buildExternalServices(input: ProjectInput, context: ProjectContext) {
  const services = inferExternalServices(input, context);
  return `# EXTERNAL_SERVICES

${services
    .map(
      (service) => `## ${service.name}

- Purpose: ${service.purpose}
- Required or optional: ${service.required ? 'Required only if this service is explicitly approved for the MVP.' : 'Optional and currently deferred.'}
- When needed: ${service.trigger}
- Triggering requirements: ${context.ontology.integrationTypes.find((candidate) => candidate.name === service.name)?.requirementRefs.join(', ') || 'No live requirement yet.'}
- Local mock approach: Use local JSON, file-based stubs, and deterministic test fixtures before live credentials exist.
- Failure behavior: ${(context.ontology.integrationTypes.find((candidate) => candidate.name === service.name)?.failureModes || ['The app should fail clearly, preserve local work, and avoid blocking the full package when the live service is unavailable.']).join(' ')}`
    )
    .join('\n\n')}
`;
}

function buildApiKeysAndSecrets(input: ProjectInput, context: ProjectContext) {
  const services = inferExternalServices(input, context);
  return `# API_KEYS_AND_SECRETS

${services
    .map(
      (service) => `## ${service.name}

- Expected keys: ${service.name === 'No live external service approved yet' ? 'None approved yet.' : `${context.ontology.integrationTypes.find((candidate) => candidate.name === service.name)?.envVar || `${slugify(service.name).toUpperCase().replace(/-/g, '_')}_API_KEY`} or similar placeholder`}
- Who provides them: Product owner or system owner for the approved service.
- Where they are configured: Local environment file or secure local secret store.
- Placeholder names: ${context.ontology.integrationTypes.find((candidate) => candidate.name === service.name)?.envVar || `${slugify(service.name).toUpperCase().replace(/-/g, '_')}_API_KEY`}
- What not to commit: Real secrets, real customer exports, or copied dashboard screenshots with credentials.`
    )
    .join('\n\n')}
`;
}

function buildEnvironmentVariables(input: ProjectInput, context: ProjectContext) {
  const services = inferExternalServices(input, context);
  const variableRows = services.map((service) => ({
    name: context.ontology.integrationTypes.find((candidate) => candidate.name === service.name)?.envVar || `${slugify(service.name).toUpperCase().replace(/-/g, '_')}_API_KEY`,
    purpose: service.purpose,
    required: service.required && service.name !== 'No live external service approved yet'
  }));
  return `# ENVIRONMENT_VARIABLES

${variableRows
    .map(
      (row) => `## ${row.name}

- Variable name: ${row.name}
- Purpose: ${row.purpose}
- Required or optional: ${row.required ? 'Required when the approved live service is enabled.' : 'Optional placeholder only.'}
- Example placeholder: ${row.required ? `${row.name}=replace_me_locally` : `${row.name}=not_used_in_v1`}
- Local setup notes: Keep values in a gitignored local environment file and pair them with mocks for tests.`
    )
    .join('\n\n')}
`;
}

function buildWebhooks(input: ProjectInput, context: ProjectContext) {
  const hasWebhook = inferExternalServices(input, context).some((service) => /webhook/i.test(service.name));
  return `# WEBHOOKS

## Webhook source
- ${hasWebhook ? 'Approved external webhook source should be named here before implementation starts.' : 'No webhook source is approved for the current MVP.'}

## Event type
- ${hasWebhook ? 'Record exact event names before coding.' : 'No event type is approved yet.'}

## Endpoint purpose
- ${hasWebhook ? 'Document what the webhook endpoint changes, validates, or triggers.' : 'No webhook endpoint should be built yet.'}

## Retry/failure behavior
- Webhook failures must be idempotent, observable, and safe to retry.

## Local test notes
- Use captured payload samples or local mock payload files before any live webhook is connected.
`;
}

function buildIntegrationFailureModes(input: ProjectInput, context: ProjectContext) {
  const services = context.ontology.integrationTypes;
  const serviceNames = services.map((s) => s.name).join(', ') || 'any external service';

  return `# FAILURE_MODES

## Integration failure modes to plan for
${listToBullets(
  services.flatMap((service) => service.failureModes.map((failure) => `${service.name}: ${failure}`)),
  'No live service failure mode is approved yet because the MVP still runs locally.'
)}

## Local fallback behavior
- If the external service is unavailable, the app must keep working with local mocks.
- If credentials are missing, show a clear message instead of crashing.
- If a retry storm happens, back off and preserve local state.
`;
}

function buildMockingStrategy(input: ProjectInput, context: ProjectContext) {
  return `# MOCKING_STRATEGY

## What to mock before real credentials exist
${listToBullets(
  context.ontology.integrationTypes.length
    ? context.ontology.integrationTypes.map((service) => `${service.name} behavior, including ${service.failureModes[0] || 'service outages'}.`)
    : ['All external API calls', 'Webhook payloads', 'Background notifications or delivery receipts'],
  'No live integration is approved yet.'
)}

## Mock data
- Use project-specific sample records that match ${context.primaryFeature}, ${context.primaryAudience}, and the ontology entities: ${context.ontology.entityTypes.map((entity) => entity.name).join(', ')}.

## Local test behavior
- Local tests should pass without internet access, live credentials, or hidden setup steps.

## When to replace mocks with real services
- Only after Product Goal and Scope, What the App Must Do, and the related gate all explicitly approve the live dependency.
`;
}

function buildIntegrationTestPlan(input: ProjectInput, context: ProjectContext) {
  return `# INTEGRATION_TEST_PLAN

## Local tests
- Confirm the app still runs with local files and no live credentials when mocks are active.

## Mocked tests
- Exercise success, timeout, invalid-response, and partial-failure paths with deterministic fixtures.

## Live integration checks if applicable
- Only run after the service, keys, and environment variables are approved and documented.

## Failure-mode tests
- Prove the app fails clearly and safely when a dependency is missing, slow, or unavailable.
`;
}

function buildIntegrationGate() {
  return `# INTEGRATION_GATE

## Entry criteria
- External service expectations are written down.
- Key and environment variable placeholders are documented.
- A local mock path exists.

## Required evidence
- EXTERNAL_SERVICES.md completed.
- API_KEYS_AND_SECRETS.md completed.
- ENVIRONMENT_VARIABLES.md completed.
- MOCKING_STRATEGY.md completed.
- INTEGRATION_TEST_PLAN.md completed.

## Pass criteria
- Required services, setup, and failure behavior are explicit.
- The MVP can still run locally when live services are unavailable.
- Mock strategy is defined before live credentials are required.

## Revise criteria
- Service list exists but setup is still incomplete.
- Mocks exist but do not yet cover failure modes.
- Webhook behavior or environment setup needs clarification.

## Auto-fail conditions
- Required API key is unclear.
- Environment variables undocumented.
- App cannot run without unavailable external service.
- No mock strategy.
- Webhook failure behavior unclear.
`;
}

function buildArchitectureStartHere(input: ProjectInput, context: ProjectContext) {
  return `# ARCHITECTURE_START_HERE

## What this folder is for
This folder creates the minimum technical plan needed to build safely without overengineering the MVP.

## Beginner shortcut
- In the beginner journey, this folder supports Plan as Technical Plan.
- The AI agent should use the detailed files here as guardrails.
- Business users usually only need the summary in the step-by-step guide unless the build keeps guessing technical structure.

## Read in this order
1. SYSTEM_OVERVIEW.md
2. DATA_MODEL.md
3. API_CONTRACTS.md
4. STATE_MANAGEMENT.md
5. ARCHITECTURE_DECISIONS.md
6. ARCHITECTURE_GATE.md
`;
}

function buildSystemOverview(input: ProjectInput, context: ProjectContext) {
  const services = inferExternalServices(input, context).filter((s) => s.name !== 'No live external service approved yet');
  const workflows = context.ontology.workflowTypes;
  const entities = context.ontology.entityTypes;
  const components = unique(
    workflows.slice(0, 4).map((workflow) => `${workflow.name} workflow`) .concat(entities.slice(0, 4).map((entity) => `${entity.name} records`))
  );

  return `# SYSTEM_OVERVIEW

## Simple architecture summary
- ${input.productName} is a local-first, markdown-first app.
- The core workflow is: ${workflows[0]?.description || context.workflowAnchor}.
- The main output is: ${context.outputAnchor}.

## Main components
${listToBullets(components, 'Main components still need to be listed.')}

## Data flow
1. ${context.ontology.actorTypes[0]?.name || context.primaryAudience} starts the workflow in ${workflows[0]?.name || 'the core flow'}.
2. The system stores ${entities.map((entity) => entity.name).join(', ')} records in local markdown and JSON files.
3. ${context.ontology.actorTypes.slice(1).map((actor) => actor.name).join(', ') || 'Secondary roles'} see only the entity fields and states their role requires.
4. Any integration stays mocked until the related requirement and gate explicitly approve live behavior.

## User flow
- Decide -> Plan -> Design -> Build -> Test -> Handoff.

## Integration points
${listToBullets(
  services.map((service) => `${service.name}: ${service.purpose}`),
  'No live external integration points are approved yet. The MVP runs with local files and mocks.'
)}

## What is intentionally not included
${listToBullets(
  [
    'No hosted backend or database.',
    'No external auth or identity provider.',
    'No SaaS dependencies unless explicitly approved.',
    'No speculative distributed architecture beyond what the MVP needs.'
  ],
  'Intentional exclusions must be visible here.'
)}
`;
}

function buildDataModel(input: ProjectInput, context: ProjectContext) {
  if (context.extractions) {
    return buildDataModelFromResearch(input, context.extractions);
  }
  const entities = context.ontology.entityTypes;

  return `# DATA_MODEL

${entities
    .map(
      (entity) => `## ${entity.name}

- Entities: ${entity.name}
- Purpose: ${entity.description}
- Fields: ${entity.fields.map((field) => `${field.name} (${field.type})`).join(', ')}
- Relationships: ${entity.relationships.join('; ')}
- Validation rules: ${entity.fields.slice(0, 3).map((field) => `${field.name} is required for ${entity.name.toLowerCase()} records`).join('; ')}.
- Sample records: ${JSON.stringify(entity.sample)}
- Risks: ${context.ontology.riskTypes.filter((risk) => entity.riskTypes.includes(risk.name)).map((risk) => risk.description).join(' ') || 'Missing validation, unclear ownership, or hidden state changes can break later phases.'}`
    )
    .join('\n\n')}
`;
}

function buildDataModelFromResearch(input: ProjectInput, ex: ResearchExtractions) {
  const actorById = new Map(ex.actors.map((a) => [a.id, a]));
  const entityById = new Map(ex.entities.map((e) => [e.id, e]));
  const risksByEntity = new Map<string, typeof ex.risks>();
  for (const r of ex.risks) {
    for (const eid of r.affectedEntities) {
      const list = risksByEntity.get(eid) || [];
      list.push(r);
      risksByEntity.set(eid, list);
    }
  }

  const renderEntity = (e: typeof ex.entities[number]) => {
    const ownerNames = e.ownerActors
      .map((aid) => actorById.get(aid)?.name)
      .filter(Boolean)
      .join(', ') || '—';
    const fieldHeader = '| Field | Type | Required | PII | Sensitive | References |\n| --- | --- | --- | --- | --- | --- |';
    const fieldRows = e.fields
      .map((f) => {
        const typeCell = f.type === 'enum' && f.enumValues?.length
          ? `enum(${f.enumValues.join(', ')})`
          : f.type;
        const refCell = f.references
          ? (entityById.get(f.references)?.name || f.references)
          : '—';
        return `| \`${f.name}\` | ${typeCell} | ${f.required ? 'yes' : 'no'} | ${f.pii ? 'yes' : '—'} | ${f.sensitive ? 'yes' : '—'} | ${refCell} |`;
      })
      .join('\n');
    const relationshipsBlock = e.relationships.length
      ? e.relationships.map((r) => `- ${r}`).join('\n')
      : '- No declared relationships.';
    const riskBlock = (risksByEntity.get(e.id) || [])
      .map((r) => `- **${r.severity}** (${r.category}): ${r.description} Mitigation: ${r.mitigation}.`)
      .join('\n') || '- No specific risks tied to this entity in research.';
    const fieldDescriptions = e.fields
      .filter((f) => f.description && f.description.trim())
      .slice(0, 6)
      .map((f) => `- \`${f.name}\` — ${f.description}${f.example ? ` Example: \`${f.example}\`.` : ''}`)
      .join('\n');
    const validationLines = e.fields
      .filter((f) => f.required)
      .slice(0, 6)
      .map((f) => `- \`${f.name}\` is required for ${e.name.toLowerCase()} records.`)
      .concat(
        e.fields
          .filter((f) => f.type === 'enum' && Array.isArray(f.enumValues) && f.enumValues.length)
          .slice(0, 4)
          .map((f) => `- \`${f.name}\` must be one of ${f.enumValues!.map((v) => `\`${v}\``).join(', ')}.`)
      );
    const validationBlock = validationLines.length
      ? validationLines.join('\n')
      : '- No additional validation rules surfaced from research.';
    const sampleJson = JSON.stringify(e.sample, null, 2);

    return `## ${e.name} (\`${e.id}\`)

- Purpose: ${e.description}
- Owner actors: ${ownerNames}
- Risk types: ${e.riskTypes.join(', ') || '—'}

### Fields

${fieldHeader}
${fieldRows}

${fieldDescriptions ? `### Field notes\n\n${fieldDescriptions}\n` : ''}
### Relationships

${relationshipsBlock}

### Validation rules

${validationBlock}

### Risks tied to this entity

${riskBlock}

### Sample records

\`\`\`json
${sampleJson}
\`\`\``;
  };

  const hasDbMetadata = ex.entities.some((e) => e.fields.some((f) => f.dbType));
  const ddlLink = hasDbMetadata
    ? '\n\n> **Companion files**: this narrative is paired with `architecture/DATABASE_SCHEMA.md` (table summaries) and `architecture/DATABASE_SCHEMA.sql` (executable PostgreSQL DDL). Use the DDL to bootstrap the database; come back here for the why behind each entity.'
    : '';
  return `# DATA_MODEL

> Generated from research extractions. Each entity below maps to one record in \`research/extracted/entities.json\`. Field-level types, owners, references, and risks are surfaced from the same source so downstream artifacts (SAMPLE_DATA.md, ACCEPTANCE_CRITERIA.md, phase TEST_SCRIPT.md) reuse the same vocabulary.${ddlLink}

## Entities

${ex.entities.map((e) => `- **${e.name}** (\`${e.id}\`) — ${e.description}`).join('\n')}

${ex.entities.map(renderEntity).join('\n\n')}
`;
}

function buildApiContracts(input: ProjectInput, context: ProjectContext) {
  if (context.extractions) {
    return buildApiContractsFromResearch(input, context.extractions);
  }
  const mainWorkflow = context.ontology.workflowTypes[0];
  const mainEntities = context.ontology.entityTypes.slice(0, 3).map((entity) => entity.name).join(', ');
  return `# API_CONTRACTS

## Primary workflow boundaries
- Workflow boundary: ${mainWorkflow?.name || 'Core workflow'}
- Inputs: ${(mainWorkflow?.entityRefs || []).join(', ') || mainEntities}
- Outputs: state changes on ${mainEntities}
- Errors: ${mainWorkflow?.failureModes.join('; ') || 'missing required context, contradictory scope, invalid verification values, or weak evidence'}
- Authorization notes: keep role boundaries explicit for ${context.ontology.actorTypes.map((actor) => actor.name).join(', ')}
- Test expectations: each boundary must be covered by a happy path and a negative path using the same entities named in DATA_MODEL.md

## Future live-service boundaries
- Do not add live API contracts until the integration folder explicitly approves them.
`;
}

function inferHttpMethodForStep(action: string): 'POST' | 'PATCH' | 'DELETE' | 'GET' {
  const a = action.toLowerCase();
  if (/\b(create|add|import|enroll|register|submit|capture|log|record)\b/.test(a)) return 'POST';
  if (/\b(delete|remove|cancel|archive|revoke|unenroll|unsubscribe)\b/.test(a)) return 'DELETE';
  if (/\b(view|read|inspect|list|browse|review|open|search|filter|see|surface|show)\b/.test(a)) return 'GET';
  if (/\b(update|edit|change|set|mark|approve|reject|qualify|disqualify|advance|move|assign|reassign|apply|enrich|complete)\b/.test(a)) return 'PATCH';
  return 'PATCH';
}

function deriveActionSlug(action: string): string {
  return action
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .split('-')
    .slice(0, 4)
    .join('-') || 'action';
}

function entitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildApiContractsFromResearch(input: ProjectInput, ex: ResearchExtractions) {
  const actorById = new Map(ex.actors.map((a) => [a.id, a]));
  const entityById = new Map(ex.entities.map((e) => [e.id, e]));

  type Endpoint = {
    method: 'POST' | 'PATCH' | 'DELETE' | 'GET';
    path: string;
    workflowName: string;
    actorName: string;
    action: string;
    systemResponse: string;
    primaryEntity?: string;
    branchOn?: string;
    failureModes: string[];
  };

  const endpoints: Endpoint[] = [];
  for (const wf of ex.workflows) {
    const primaryEntityId = wf.entitiesTouched[0];
    const primaryEntity = primaryEntityId ? entityById.get(primaryEntityId) : undefined;
    const entityPath = primaryEntity ? entitySlug(primaryEntity.name) : 'records';
    for (const step of wf.steps) {
      const method = inferHttpMethodForStep(step.action);
      const actorName = actorById.get(step.actor)?.name || step.actor;
      const slug = deriveActionSlug(step.action);
      const path =
        method === 'POST'
          ? `/${entityPath}`
          : method === 'GET'
            ? `/${entityPath}`
            : method === 'DELETE'
              ? `/${entityPath}/{id}`
              : `/${entityPath}/{id}/${slug}`;
      endpoints.push({
        method,
        path,
        workflowName: wf.name,
        actorName,
        action: step.action,
        systemResponse: step.systemResponse,
        primaryEntity: primaryEntity?.name,
        branchOn: step.branchOn,
        failureModes: wf.failureModes.slice(0, 2).map((f) => `${f.trigger} → ${f.mitigation}`)
      });
    }
  }

  const overviewRows = endpoints
    .map(
      (e) =>
        `| ${e.method} | \`${e.path}\` | ${e.actorName} | ${e.workflowName} | ${e.primaryEntity || '—'} |`
    )
    .join('\n');

  const detailBlocks = endpoints
    .map(
      (e, i) => `### ${i + 1}. ${e.method} ${e.path}

- Workflow: ${e.workflowName}
- Caller: ${e.actorName}
- Intent: ${e.action}
- System response: ${e.systemResponse}
- Primary entity: ${e.primaryEntity || '—'}${e.branchOn ? `\n- Decision branch: ${e.branchOn}` : ''}
- Authorization: scope check against caller's actor visibility (see requirements/PERMISSION_MATRIX.md)
- Common failure handling: ${e.failureModes.length ? e.failureModes.join(' | ') : 'Surface validation errors inline; never silent.'}`
    )
    .join('\n\n');

  return `# API_CONTRACTS

> Generated from research extractions. Each endpoint below corresponds to one workflow step that mutates or reads an entity. Method is inferred from the verb of the step action; path is grounded in the entity it touches. Permissions follow PERMISSION_MATRIX.md.

## Endpoint summary

| Method | Path | Caller | Workflow | Primary entity |
| --- | --- | --- | --- | --- |
${overviewRows}

## Endpoint detail

${detailBlocks}

## Cross-cutting

- Every endpoint must enforce visibility according to the actor's row in \`requirements/PERMISSION_MATRIX.md\`.
- Every mutation endpoint must emit an audit entry (see Audit Entry-style entities in DATA_MODEL.md).
- Live external integrations stay mocked until \`requirements/NON_FUNCTIONAL_REQUIREMENTS.md\` explicitly approves the integration's \`required: true\` flag.

## Conventions

- IDs are entity-native (use \`{id}\` for the primary entity of the endpoint).
- Success responses include the mutated record plus its updated state machine value.
- Failures return \`4xx\` for validation/visibility issues, \`409\` for conflicts that match a researched failureMode, and \`5xx\` only for genuine infrastructure problems.
`;
}

function buildStateManagement(input: ProjectInput, context: ProjectContext) {
  const entities = context.ontology.entityTypes;
  return `# STATE_MANAGEMENT

## Client state
- Current workflow step, current actor view, filters, and user-visible progress notes for ${entities.slice(0, 3).map((entity) => entity.name).join(', ')}.

## Server state
- Local markdown and JSON records that keep ${context.ontology.workflowTypes[0]?.name || 'the workflow'} resumable.

## Persisted state
- ${entities.map((entity) => entity.name).join(', ')} records plus repo/mvp-builder-state.json and evidence files.

## Loading/error states
- Pending verification, blocked phase, missing evidence, failed validation, revise-needed states, and domain-specific workflow blockers must stay visible.

## Reset behavior
- If a phase fails, return to the current phase packet, update evidence, and do not silently advance.
`;
}

function buildArchitectureDecisions(input: ProjectInput, context: ProjectContext) {
  const today = new Date().toISOString().slice(0, 10);
  const mainWorkflow = context.ontology.workflowTypes[0];
  const mainEntities = context.ontology.entityTypes.slice(0, 3).map((entity) => entity.name).join(', ');
  const mainIntegration = context.ontology.integrationTypes[0];
  return `# ARCHITECTURE_DECISIONS

## Decision 1
- Decision: Keep ${input.productName} local-first and markdown-first.
- Reason: The MVP must prove ${mainWorkflow?.name || 'the core workflow'} without hosted backends, databases, or SaaS dependencies. This keeps setup simple and prevents scope creep.
- Alternatives considered: Hosted backend with database, cloud-based workflow, third-party SaaS from day one.
- Tradeoff: Less automation now in exchange for lower setup complexity and clearer guardrails.
- Date: ${today}
- Owner: Product owner and technical reviewer

## Decision 2
- Decision: Store data in local markdown and JSON files, not a database.
- Reason: The project constraints explicitly rule out database dependencies for the first release. Local files make ${mainEntities} reviewable, versionable, and easy to verify.
- Alternatives considered: SQLite for local storage, JSON-only storage, no persistence at all.
- Tradeoff: Simpler now, but may need migration if scale grows beyond local files later.
- Date: ${today}
- Owner: Product owner and technical reviewer

## Decision 3
- Decision: Role boundaries and visibility rules are enforced directly around ${mainEntities}, not via speculative external services.
- Reason: ${mainIntegration ? `${mainIntegration.name} stays mocked until approved, so actor boundaries must be explicit in the product logic.` : 'No external identity provider or hosted permissions system is approved for the MVP, so the product logic must make boundaries explicit.'}
- Alternatives considered: OAuth integration, custom auth service, no roles at all.
- Tradeoff: Less security depth now, but avoids hidden auth complexity.
- Date: ${today}
- Owner: Product owner and technical reviewer
`;
}

function buildArchitectureGate() {
  return `# ARCHITECTURE_GATE

## Entry criteria
- Product strategy and requirements exist.
- Main components and data entities are named.
- State and boundary assumptions are visible.

## Required evidence
- SYSTEM_OVERVIEW.md completed.
- DATA_MODEL.md completed.
- API_CONTRACTS.md completed.
- STATE_MANAGEMENT.md completed.
- ARCHITECTURE_DECISIONS.md completed.

## Pass criteria
- Technical plan is clear enough to build without hidden assumptions.
- Architecture stays proportional to the MVP.
- Data, state, and boundary decisions do not contradict scope.

## Revise criteria
- System plan exists but still hides key boundaries or risks.
- State handling or validation rules need sharper wording.
- Some technical decisions are still speculative.

## Auto-fail conditions
- Architecture is more complex than MVP requires.
- Data model missing for data-heavy project.
- Unclear API boundaries.
- No state handling for core workflow.
- Architecture contradicts product scope.
`;
}

function normalizeIdPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function mapCritiqueSeverityToWarningSeverity(severity: CritiqueItem['severity']): WarningSeverity {
  if (severity === 'critical') return 'blocker';
  if (severity === 'important') return 'warning';
  return 'info';
}

function createWarning(warning: WarningItem): WarningItem {
  return warning;
}

function dedupeWarnings(warnings: WarningItem[]) {
  const byId = new Map<string, WarningItem>();
  const severityRank: Record<WarningSeverity, number> = { info: 1, warning: 2, blocker: 3 };

  for (const warning of warnings) {
    const existing = byId.get(warning.id);
    if (!existing) {
      byId.set(warning.id, warning);
      continue;
    }

    const merged: WarningItem =
      severityRank[warning.severity] > severityRank[existing.severity]
        ? { ...warning, openQuestion: warning.openQuestion || existing.openQuestion, assumption: warning.assumption || existing.assumption }
        : {
            ...existing,
            openQuestion: existing.openQuestion || warning.openQuestion,
            assumption: existing.assumption || warning.assumption
          };
    byId.set(warning.id, merged);
  }

  return Array.from(byId.values());
}

function getCriticalQuestionIds(profile: ProfileConfig) {
  const base = ['north-star', 'primary-workflow', 'scope-cut', 'acceptance', 'operating-risks'];
  if (profile.key.endsWith('technical')) base.push('data-boundaries');
  if (profile.key === 'advanced-technical') {
    base.push('observability', 'scaling-risk');
  }
  if (profile.key === 'advanced-business') {
    base.push('monetization', 'adoption-risks');
  }
  if (profile.key === 'beginner-business') {
    base.push('customer-pain', 'business-proof');
  }
  if (profile.key === 'beginner-technical') {
    base.push('repo-shape', 'test-proof');
  }
  if (profile.key === 'intermediate-business') {
    base.push('user-segments', 'stakeholder-workflow');
  }
  if (profile.key === 'intermediate-technical') {
    base.push('deployment-guardrails', 'test-proof');
  }
  return Array.from(new Set(base));
}

function getMissingCriticalAnswers(input: ProjectInput, questionnaire: QuestionnaireItem[], context: ProjectContext) {
  const criticalIds = new Set(getCriticalQuestionIds(context.profile));
  return questionnaire
    .filter((item) => criticalIds.has(item.id))
    .filter((item) => !(input.questionnaireAnswers[item.id] || '').trim())
    .map((item) => item.prompt);
}

function getWeakAnswerWarnings(input: ProjectInput, questionnaire: QuestionnaireItem[], context: ProjectContext) {
  const warnings: WarningItem[] = [];

  if (wordCount(input.productIdea) < 16) {
    warnings.push(
      createWarning({
        id: 'weak-product-idea',
        severity: 'warning',
        title: 'Product idea is still thin',
        message: `The product idea for ${input.productName} is still short enough that later package details may rely on inference.`,
        action: 'Add more concrete user and outcome detail to the brief before review.',
        source: 'brief',
        openQuestion: 'What exact change should this product create for the user between project start and successful completion?'
      })
    );
  }
  if (wordCount(input.problemStatement) < 16) {
    warnings.push(
      createWarning({
        id: 'weak-problem-statement',
        severity: 'warning',
        title: 'Problem consequence is weak',
        message: `The problem statement does not yet fully explain why ${context.primaryAudience} feels the pain strongly enough to prioritize this work.`,
        action: 'Clarify the consequence and urgency of the problem in the brief.',
        source: 'brief',
        openQuestion: `What specifically breaks today for ${context.primaryAudience}, and what is the cost of leaving it unresolved?`
      })
    );
  }
  if (context.mustHaves.length < 4) {
    warnings.push(
      createWarning({
        id: 'narrow-must-have-scope',
        severity: 'info',
        title: 'Must-have scope is still narrow',
        message: `The must-have scope for ${input.productName} is still narrow, so later phases may under-specify acceptance criteria.`,
        action: 'Confirm whether the must-have list is intentionally minimal or still incomplete.',
        source: 'generator'
      })
    );
  }

  for (const item of questionnaire) {
    const answer = (input.questionnaireAnswers[item.id] || '').trim();
    if (!answer) continue;
    if (wordCount(answer) < 8) {
      warnings.push(
        createWarning({
          id: `weak-answer-${normalizeIdPart(item.id)}`,
          severity: 'warning',
          title: `Answer is still short: ${item.intent}`,
          message: `The answer for "${item.prompt}" is short enough that later package details may still be inferred.`,
          action: 'Expand the answer with more concrete evidence, examples, or scope detail.',
          source: 'questionnaire',
          openQuestion: item.prompt
        })
      );
    }
  }

  return warnings;
}

function buildWarnings(
  input: ProjectInput,
  questionnaire: QuestionnaireItem[],
  critique: CritiqueItem[],
  context: ProjectContext,
  score: ReturnType<typeof scoreProject>
) {
  const missingCriticalAnswers = getMissingCriticalAnswers(input, questionnaire, context);
  const warnings: WarningItem[] = [];

  for (const missing of missingCriticalAnswers) {
    warnings.push(
      createWarning({
        id: `missing-critical-${normalizeIdPart(missing)}`,
        severity: 'blocker',
        title: 'Critical answer missing',
        message: `A critical planning answer is still missing: ${missing}`,
        action: 'Answer this question before treating the package as ready for formal review.',
        source: 'questionnaire',
        openQuestion: missing
      })
    );
  }

  for (const critiqueItem of critique) {
    warnings.push(
      createWarning({
        id: `critique-${normalizeIdPart(critiqueItem.title)}`,
        severity: mapCritiqueSeverityToWarningSeverity(critiqueItem.severity),
        title: critiqueItem.title,
        message: critiqueItem.detail,
        action: critiqueItem.followUpQuestion,
        source: 'critique',
        openQuestion: critiqueItem.followUpQuestion,
        assumption: critiqueItem.signal === 'inferred-assumption' ? critiqueItem.detail : undefined
      })
    );
  }

  warnings.push(...getWeakAnswerWarnings(input, questionnaire, context));

  for (const blocker of score.blockers) {
    warnings.push(
      createWarning({
        id: `score-blocker-${normalizeIdPart(blocker)}`,
        severity: 'blocker',
        title: 'Readiness blocker',
        message: blocker,
        action: 'Resolve this blocker before treating the package as build-capable.',
        source: 'score'
      })
    );
  }

  for (const category of score.categories) {
    if (category.score === category.max) continue;
    warnings.push(
      createWarning({
        id: `score-category-${normalizeIdPart(category.key)}`,
        severity: category.score <= Math.floor(category.max / 2) ? 'warning' : 'info',
        title: `${category.label} needs attention`,
        message: category.reasonsLost[0] || `${category.label} lost points.`,
        action: category.improvements[0] || 'Improve this category before final review.',
        source: 'score'
      })
    );
  }

  const approvalDecision = (input.questionnaireAnswers['approval-decision'] || '').trim();
  const approvalChecklistComplete = (input.questionnaireAnswers['approval-checklist-complete'] || '').trim().toLowerCase();
  if (!approvalDecision) {
    warnings.push(
      createWarning({
        id: 'approval-decision-missing',
        severity: 'info',
        title: 'Approval decision not recorded',
        message: 'The package has not yet recorded a human approval decision.',
        action: 'Use the approval gate to record whether the package is ready for build or still under review.',
        source: 'approval',
        openQuestion: 'Who is responsible for approving this package for build, and what decision did they make?'
      })
    );
  }
  if (approvalChecklistComplete !== 'true') {
    warnings.push(
      createWarning({
        id: 'approval-checklist-incomplete',
        severity: 'info',
        title: 'Approval checklist not complete',
        message: 'The human approval checklist has not been marked complete yet.',
        action: 'Review the approval gate checklist before treating the package as build-ready.',
        source: 'approval',
        openQuestion: 'Has a reviewer confirmed that blockers, warnings, assumptions, and phase gates have been checked?'
      })
    );
  }

  return dedupeWarnings(warnings);
}

function buildAssumptionsAndOpenQuestions(warnings: WarningItem[], context: ProjectContext) {
  const assumptions = Array.from(
    new Set(
      context.inferredAssumptions.concat(warnings.map((warning) => warning.assumption).filter(Boolean) as string[])
    )
  );

  const openQuestions = Array.from(
    new Set(warnings.map((warning) => warning.openQuestion).filter(Boolean) as string[])
  );

  return { assumptions, openQuestions };
}

function deriveLifecycleStatus(options: {
  warnings: WarningItem[];
  scoreTotal: number;
  approvedForBuild: boolean;
  buildReady?: boolean;
}) {
  // Phase G G2 issue 3: reserve `Blocked` for genuine structural failures
  // (schema-validation severity > 'note', unresolved critical conflicts)
  // surfaced by the research extraction pipeline. Critique/questionnaire/score
  // blockers stay visible as warnings but no longer trigger the Blocked banner
  // when the workspace has agent-recipe research and a clean schema — that
  // case becomes BuildReady.
  const hasStructuralBlocker = options.warnings.some(
    (warning) => warning.severity === 'blocker' && warning.source === 'schema'
  );
  if (hasStructuralBlocker) return 'Blocked' as LifecycleStatus;
  const reviewReady =
    options.scoreTotal >= 88 && options.warnings.every((warning) => warning.severity === 'info');
  if (reviewReady && options.approvedForBuild) return 'ApprovedForBuild' as LifecycleStatus;
  if (options.buildReady) return 'BuildReady' as LifecycleStatus;
  if (options.warnings.some((warning) => warning.severity === 'blocker')) return 'Blocked' as LifecycleStatus;
  if (reviewReady) return 'ReviewReady' as LifecycleStatus;
  return 'Draft' as LifecycleStatus;
}

/**
 * Phase G G2 issue 3: a workspace is "BuildReady" when it has agent-recipe
 * research extractions, the schema is intact (no critical conflicts), and the
 * artifacts a coding agent needs to build (workflows, screens, entities) are
 * present. Synth and legacy-templated paths never reach BuildReady.
 */
function computeBuildReadyFlag(context: ProjectContext): boolean {
  const ex = context.extractions;
  if (!ex) return false;
  const source = getResearchSource(ex.meta);
  if (source !== 'agent-recipe' && source !== 'imported-real') return false;
  const hasWorkflows = ex.workflows.length >= 1;
  const hasScreens = Boolean(ex.screens && ex.screens.length >= 1);
  const hasEntities = ex.entities.length >= 1;
  if (!hasWorkflows || !hasScreens || !hasEntities) return false;
  // Reserve Blocked for actual unresolved conflicts at severity > 'note'.
  const hasCriticalConflict = ex.conflicts.some(
    (c) => (c.severity === 'critical' || c.severity === 'important') && c.resolution === 'pending'
  );
  if (hasCriticalConflict) return false;
  return true;
}

function getApprovalFlags(input: ProjectInput) {
  const approvalDecision = (input.questionnaireAnswers['approval-decision'] || '').trim().toLowerCase();
  const approvalChecked = (input.questionnaireAnswers['approval-checklist-complete'] || '').trim().toLowerCase();
  const approvedForBuild =
    approvalDecision === 'approvedforbuild' ||
    approvalDecision === 'approved-for-build' ||
    (approvalDecision === 'approved' && approvalChecked === 'true');

  return {
    approvalRequired: true,
    approvedForBuild
  };
}

function getLifecycleSummary(status: LifecycleStatus) {
  switch (status) {
    case 'ApprovedForBuild':
      return 'The package has explicit approval metadata and can be treated as approved for build execution.';
    case 'BuildReady':
      return 'The package has agent-recipe research, a validated schema, and full requirement / persona / use-case depth. A coding agent can build from it without re-deciding the spec; explicit human approval (ApprovedForBuild) is still a separate step.';
    case 'ReviewReady':
      return 'The package is complete enough for formal human review, but it is not yet explicitly approved for build execution.';
    case 'Blocked':
      return 'The package is blocked by structural problems (schema-validation failures or unresolved critical conflicts). Critique and questionnaire warnings alone no longer trigger this state.';
    case 'InRework':
      return 'A previously approved phase has been reopened. The current phase has a recorded gate failure and an active REWORK_PROMPT that must be resolved before advancing.';
    default:
      return 'The package is still in draft form. It can be exported for review, but it should not be treated as build-approved.';
  }
}

function buildCritique(input: ProjectInput, questionnaire: QuestionnaireItem[], context: ProjectContext): CritiqueItem[] {
  const critique: CritiqueItem[] = [];
  const contradictions = findContradictions(input);

  if (wordCount(input.productIdea) < 12) {
    critique.push({
      severity: 'critical',
      title: 'Product idea is still too abstract',
      detail: `Please review and confirm: the current idea statement is too thin to drive project-specific phases for ${input.productName}.`,
      followUpQuestion: 'What exact change should this product create for the user between project start and successful completion?',
      signal: 'needs-user-confirmation'
    });
  }

  if (wordCount(input.problemStatement) < 12 || !/(because|causes|creates|delays|costs|blocks|slows)/i.test(input.problemStatement)) {
    critique.push({
      severity: 'critical',
      title: 'Problem statement lacks consequence',
      detail: `Please review and confirm: the brief names the problem, but it does not clearly describe why ${context.primaryAudience} feels the pain strongly enough to justify this build.`,
      followUpQuestion: `What specifically breaks today for ${context.primaryAudience}, and what is the cost of leaving it unresolved?`,
      signal: 'needs-user-confirmation'
    });
  }

  if (context.audienceSegments.length < 2 && !input.questionnaireAnswers['user-segments']) {
    critique.push({
      severity: 'important',
      title: 'Audience is not prioritized enough',
      detail: `Based on your answers so far: the brief references ${context.primaryAudience}, but it does not clearly separate the primary audience from secondary reviewers or stakeholders.`,
      followUpQuestion: 'Which audience matters first, and who else only needs to review or approve the handoff?',
      signal: 'generated-from-current-input'
    });
  }

  if (!input.questionnaireAnswers['scope-cut'] || !/(defer|cut|remove|later|future|keep)/i.test(input.questionnaireAnswers['scope-cut'])) {
    critique.push({
      severity: 'important',
      title: 'Scope-cut logic is weak',
      detail: `Please review and confirm: the current package does not yet show what gets removed if ${input.productName} has less time than expected.`,
      followUpQuestion: 'If the schedule tightens, which capabilities stay in v1 and which are explicitly deferred?',
      signal: 'needs-user-confirmation'
    });
  }

  if (context.profile.key.endsWith('technical') && !input.questionnaireAnswers['data-boundaries']) {
    critique.push({
      severity: context.profile.key === 'advanced-technical' ? 'critical' : 'important',
      title: 'Technical boundaries are still inferred',
      detail: `Inferred assumption: the generator is inferring data, API, or integration boundaries for ${input.productName} from the brief instead of from an explicit technical answer.`,
      followUpQuestion: 'Which entities, interfaces, integrations, or file boundaries must be explicit before coding begins?',
      signal: 'inferred-assumption'
    });
  }

  if (context.profile.key === 'advanced-business' && !input.questionnaireAnswers.monetization) {
    critique.push({
      severity: 'important',
      title: 'Business value proof is still inferred',
      detail: `Inferred assumption: the package can describe ${input.productName}, but it cannot yet justify the business value, operating leverage, or monetization logic with confidence.`,
      followUpQuestion: 'How does this MVP create measurable business value, revenue potential, or operating leverage?',
      signal: 'inferred-assumption'
    });
  }

  if (context.profile.key === 'advanced-technical' && !input.questionnaireAnswers.observability) {
    critique.push({
      severity: 'important',
      title: 'Observability gates are not explicit',
      detail: `Please review and confirm: advanced technical mode expects launch visibility, but the package does not yet say how ${input.productName} should be monitored or supported after release.`,
      followUpQuestion: 'What observability or support signals should exist before the build is called handoff-ready?',
      signal: 'needs-user-confirmation'
    });
  }

  for (const contradiction of contradictions) {
    critique.push({
      severity: 'critical',
      title: `Scope contradiction: ${contradiction.topic}`,
      detail: `Based on your answers so far: ${contradiction.message}`,
      followUpQuestion: `Which version is correct for ${contradiction.topic}: required in v1 or explicitly out of scope?`,
      signal: 'generated-from-current-input'
    });
  }

  for (const question of questionnaire) {
    if (!(input.questionnaireAnswers[question.id] || '').trim()) {
      critique.push({
        severity: 'important',
        title: `Questionnaire answer missing: ${sentenceCase(question.id.replace(/-/g, ' '))}`,
        detail: `Please review and confirm: ${question.intent} is still missing, so later phases are being partially inferred.`,
        followUpQuestion: question.prompt,
        signal: 'needs-user-confirmation'
      });
    }
  }

  return critique;
}

function createBlueprint(
  tag: PhaseBlueprint['tag'],
  name: string,
  rationale: string,
  primaryInputs: string[],
  confirmationPrompts: string[],
  phaseType: PhasePlan['phaseType'],
  outputs: string[] = [],
  repoTargets: string[] = []
): PhaseBlueprint {
  return { tag, name, rationale, primaryInputs, confirmationPrompts, phaseType, outputs, repoTargets };
}

function getRiskTriggeredBlueprints(input: ProjectInput, context: ProjectContext): PhaseBlueprint[] {
  const blueprints: PhaseBlueprint[] = [];

  if (
    context.riskFlags.includes('children') &&
    /(kid|kids|child|children|parent|family|student|school|minor)/i.test(
      `${input.productName} ${input.productIdea}`
    )
  ) {
    blueprints.push(
      createBlueprint(
        'permissions',
        `${input.productName} child visibility and parent control rules`,
        `Lock the child-visible actions, parent approval boundaries, and shared household access rules before later phases can over-assume permissions.`,
        [input.constraints, input.risks, context.answers['data-boundaries'] || '', input.mustHaveFeatures],
        ['Can a child user see only allowed tasks and actions, and are parent control boundaries explicit?'],
        'design',
        ['Child-visible rules list', 'Parent and co-parent control boundary notes'],
        ['Role matrix in markdown', 'Visibility notes in phase artifacts']
      )
    );
  }

  if (
    context.riskFlags.includes('medical') &&
    /(clinic|medical|patient|healthcare|physician|doctor|nurse)/i.test(
      `${input.productName} ${input.productIdea}`
    )
  ) {
    blueprints.push(
      createBlueprint(
        'scheduling',
        `${input.productName} provider availability, reminder, and privacy checks`,
        `Make provider scheduling conflicts, reminder wording, and privacy-sensitive content reviewable before implementation work claims the flow is safe.`,
        [input.risks, input.constraints, context.answers['operating-risks'] || '', context.answers['primary-workflow'] || ''],
        ['What reminder content must stay non-sensitive, and which scheduling conflicts are handled now versus deferred?'],
        'design',
        ['Provider availability rules', 'Reminder privacy boundary notes'],
        ['Scheduling rule notes', 'Reminder content checklist']
      )
    );
  }

  if (context.riskFlags.includes('legal') || context.riskFlags.includes('emergency')) {
    blueprints.push(
      createBlueprint(
        'emergency',
        `${input.productName} emergency claims and legal boundary review`,
        `Convert legal, emergency, and trust boundaries into explicit do-not-overclaim rules before the handoff sounds more authoritative than the product really is.`,
        [input.risks, input.constraints, context.answers.acceptance || '', context.answers['operating-risks'] || ''],
        ['Does the package clearly say what emergency or legal help the product does not provide?'],
        'verification',
        ['Boundary disclaimers', 'Deferred legal or emergency decisions'],
        ['Boundary language in brief and gates']
      )
    );
  }

  if (context.riskFlags.includes('money')) {
    // Phase A3c (final hardening): the budget-planner archetype branch was deleted;
    // the cost / spending-review framing applies to any money-flagged brief.
    blueprints.push(
      createBlueprint(
        'budgeting',
        `${input.productName} cost boundaries and spending review limits`,
        `Make cost boundaries, spending review limits, and purchase decision rules explicit so the plan does not overclaim financial authority.`,
        [input.risks, input.constraints, context.answers.acceptance || '', input.mustHaveFeatures],
        ['Where must the product stop at cost tracking and avoid presenting financial advice or purchase authority?'],
        'design',
        ['Cost boundary notes', 'Purchase decision review rules'],
        ['Cost and spending policy notes']
      )
    );
  }

  if (context.riskFlags.includes('privacy') || context.riskFlags.includes('sensitive-data')) {
    blueprints.push(
      createBlueprint(
        'security',
        `${input.productName} privacy, visibility, and data minimization checks`,
        `Require the plan to prove what data is visible to which role, what must stay hidden, and what should be minimized or deferred.`,
        [input.constraints, input.risks, input.dataAndIntegrations, context.answers['data-boundaries'] || ''],
        ['Which visibility, disclaimer, or data minimization rules must be proven before implementation?'],
        'verification',
        ['Visibility rule checklist', 'Data minimization notes'],
        ['Role or data boundary notes']
      )
    );
  }

  return blueprints;
}

function getDomainBlueprints(input: ProjectInput, context: ProjectContext): PhaseBlueprint[] {
  // Phase A3c (final hardening): the per-archetype blueprint switch (10 cases:
  // family-task, family-readiness, sdr-sales, restaurant-ordering, budget-
  // planner, clinic-scheduler, hoa-maintenance, school-club, volunteer-manager,
  // inventory) was deleted with the keyword router. Domain-specific phase
  // shapes now come from research extractions (entities, workflows, gates) via
  // research-token pack and the renderers in lib/generator/. The generic
  // blueprint set below is the fallback when extractions are absent.
  return [
    createBlueprint('brief', `${input.productName} brief and planning guardrails`, `Lock the problem, audience, constraints, and output expectations for ${input.productName} before build work starts.`, [input.productIdea, input.problemStatement, input.desiredOutput], ['Is the brief specific enough to survive without chat history?'], 'planning', ['Updated brief summary']),
    createBlueprint('audience', `${context.primaryAudience} user, customer, and stakeholder map`, `Clarify who ${input.productName} serves first and who else influences approval or rollout.`, [input.targetAudience, context.answers['user-segments'] || '', context.answers['stakeholder-workflow'] || ''], ['Which audience matters first, and which stakeholders only review or approve?'], 'planning', ['Audience priority notes']),
    createBlueprint('workflow', `${input.productName} workflow and failure-path plan`, `Map the core path, support path, and failure path for ${context.primaryAudience}.`, [context.answers['primary-workflow'] || input.desiredOutput, context.answers['failure-modes'] || context.answers['customer-pain'] || ''], ['Where does the workflow fail, stall, or create support load?'], 'design', ['Workflow and failure-path notes']),
    createBlueprint('scope', `MVP scope and non-goals for ${context.primaryFeature}`, `Protect the first release by separating ${context.primaryFeature} from later ideas and optional extras.`, [input.mustHaveFeatures, input.nonGoals, context.answers['scope-cut'] || ''], ['If time shrinks, what stays in v1 and what moves out?'], 'planning', ['Scope cut and deferral list'])
  ];
}

function getTrackBlueprints(input: ProjectInput, context: ProjectContext): PhaseBlueprint[] {
  if (input.track === 'business') {
    return [
      createBlueprint('business-value', `Business value proof for ${input.productName}`, `Make the user value, business value, and success metrics explicit for ${input.productName}.`, [input.successMetrics, context.answers['business-proof'] || context.answers.acceptance || '', context.answers.monetization || ''], ['What business proof should exist before this handoff is called build-ready?'], 'planning', ['Business value proof notes']),
      createBlueprint('stakeholders', `Stakeholder and adoption gates for ${context.primaryAudience}`, `Document how stakeholders, reviewers, and adopters influence scope, launch, or acceptance.`, [context.answers['stakeholder-workflow'] || '', context.answers['adoption-risks'] || '', input.teamContext], ['Who can block adoption even if the implementation works?'], 'design', ['Stakeholder approval path']),
      createBlueprint('operations', `Operational guardrails and rollout risks for ${input.productName}`, `Turn trust, support, and rollout risks into explicit business-side gates.`, [input.risks, context.answers['operating-risks'] || '', input.constraints], ['Which operating risk should stop launch readiness?'], 'verification', ['Rollout risk checks'])
    ];
  }

  return [
    createBlueprint('data', `Data boundaries and integrations for ${context.primaryFeature}`, `Define the data, files, and interfaces that ${input.productName} must create, store, or exchange.`, [input.dataAndIntegrations, context.answers['data-boundaries'] || '', input.constraints], ['Which entities, inputs, outputs, or APIs must be explicit before coding?'], 'design', ['Data boundary notes']),
    createBlueprint('architecture', `Architecture and repo structure for ${input.productName}`, `Translate the current plan into implementation structure, ownership, and repo-level boundaries.`, [context.answers['repo-shape'] || '', input.teamContext, input.mustHaveFeatures], ['What repo, file, or module structure should the next builder expect?'], 'implementation', ['Repo map assumptions'], ['src/features/', 'src/lib/', 'tests/']),
    createBlueprint('testing', `Testing and review gates for ${context.primaryFeature}`, `Make testability, review evidence, and regression risk explicit before build handoff.`, [context.answers['test-proof'] || context.answers.acceptance || '', input.successMetrics, context.answers['failure-modes'] || ''], ['What should be tested or reviewed first before trusting the implementation?'], 'verification', ['Verification scenarios'])
  ];
}

function getLevelBlueprints(input: ProjectInput, context: ProjectContext): PhaseBlueprint[] {
  if (input.level === 'beginner') {
    return [
      createBlueprint(
        input.track === 'business' ? 'testing' : 'deployment',
        input.track === 'business'
          ? `Simple acceptance and review checklist for ${input.productName}`
          : `Build order and release checklist for ${input.productName}`,
        input.track === 'business'
          ? `Create an approachable proof checklist so a non-technical reviewer can decide whether the package is ready.`
          : `Create a beginner-friendly repo, testing, and release order for the next technical builder.`,
        [input.successMetrics, context.answers.acceptance || '', input.timeline, context.answers['deployment-guardrails'] || ''],
        [input.track === 'business' ? 'Could a non-technical reviewer understand what success looks like?' : 'What should the next technical builder do first, second, and third?'],
        'verification',
        ['Beginner-friendly proof checklist']
      )
    ];
  }

  if (input.level === 'intermediate') {
    return input.track === 'technical'
      ? [
          createBlueprint('deployment', `Deployment and release guardrails for ${input.productName}`, `Turn delivery assumptions into concrete environment, release, and rollback gates.`, [context.answers['deployment-guardrails'] || '', input.constraints, input.timeline], ['What release assumption would create rework if it stays vague?'], 'implementation', ['Release guardrails'], ['package.json', 'README.md', 'docs/'])
        ]
      : [];
  }

  return input.track === 'business'
    ? [
        createBlueprint('rollout', `Operating model, monetization, and adoption proof for ${input.productName}`, `Stress-test the operating model and business proof before implementation creates sunk cost.`, [context.answers.monetization || '', context.answers['adoption-risks'] || '', input.successMetrics], ['What evidence proves the business case, not just the feature idea?'], 'verification', ['Operating model proof'])
      ]
    : [
        createBlueprint('security', `Security and failure-mode gates for ${context.primaryFeature}`, `Convert hidden complexity, failure states, and trust risks into explicit technical gates.`, [context.answers['failure-modes'] || '', context.answers['operating-risks'] || '', input.constraints], ['Which failure modes or trust risks would force a design change if unresolved?'], 'verification', ['Failure-mode review']),
        createBlueprint('observability', `Observability and support readiness for ${input.productName}`, `Make sure launch and support risks are visible before implementation begins.`, [context.answers.observability || '', input.risks, input.teamContext], ['What should be monitored, logged, or reviewed once the product is in use?'], 'verification', ['Support and observability notes']),
        createBlueprint('scaling', `Scalability and architecture stress points for ${input.productName}`, `Identify the scale, concurrency, or architecture assumptions most likely to cause rework later.`, [context.answers['scaling-risk'] || '', input.constraints, input.dataAndIntegrations], ['Which scale or concurrency assumptions need confirmation now instead of after implementation?'], 'design', ['Stress-point list'])
      ];
}

function buildPhaseBlueprints(input: ProjectInput, context: ProjectContext, critique: CritiqueItem[]): PhaseBlueprint[] {
  const phases = unique(
    [
      ...getDomainBlueprints(input, context),
      ...getTrackBlueprints(input, context),
      ...getRiskTriggeredBlueprints(input, context),
      ...getLevelBlueprints(input, context),
      createBlueprint('rollout', `Readiness and rollout checks for ${input.productName}`, `Confirm that the current package is ready to leave planning and enter disciplined implementation.`, [input.timeline, input.constraints, input.successMetrics], ['What must be true before the next builder should start implementation?'], 'verification', ['Readiness checklist']),
      createBlueprint('handoff', `Final handoff package for ${input.productName}`, `Package the work so another builder can execute it without relying on hidden chat context.`, [input.desiredOutput, input.teamContext, context.acceptanceAnchor], ['What would a new builder still need clarified before they can begin?'], 'finalization', ['Final handoff recap'])
    ].map((phase) => JSON.stringify(phase))
  ).map((value) => JSON.parse(value) as PhaseBlueprint);

  if (critique.length > 6) {
    phases.splice(
      Math.max(1, phases.length - 1),
      0,
      createBlueprint(
        'scope',
        `Unresolved blockers and decision review for ${input.productName}`,
        `Document the specific blockers, open decisions, and remaining assumptions that must stay visible before final handoff.`,
        critique.map((item) => item.title),
        ['Which critique items must be resolved before handoff?'],
        'verification',
        ['Blocker review list']
      )
    );
  }

  // Enforce minimum phase count from profile config
  const minCount = context.profile.minimumPhaseCount;
  const fillerTemplates: Array<{ tag: PhaseBlueprint['tag']; nameTemplate: string; rationaleTemplate: string; phaseType: PhasePlan['phaseType'] }> = [
    {
      tag: 'scope',
      nameTemplate: `${input.productName} scope boundary check`,
      rationaleTemplate: `Review the current plan against the original brief to confirm scope discipline, catch drift, and record any justified expansions or cuts.`,
      phaseType: 'verification'
    },
    {
      tag: 'workflow',
      nameTemplate: `${input.productName} workflow edge-case walkthrough`,
      rationaleTemplate: `Walk through the core workflow and at least one failure path to confirm the plan handles realistic friction instead of only the happy path.`,
      phaseType: 'design'
    },
    {
      tag: 'testing',
      nameTemplate: `${input.productName} evidence readiness check`,
      rationaleTemplate: `Confirm that the plan includes concrete checks, observable proof, and clear failure criteria before implementation begins.`,
      phaseType: 'verification'
    },
    {
      tag: 'architecture',
      nameTemplate: `${input.productName} implementation target alignment`,
      rationaleTemplate: `Translate the planning outputs into implementation-ready assumptions, file targets, or explicit deferrals so the next builder knows where to start.`,
      phaseType: 'design'
    },
    {
      tag: 'data',
      nameTemplate: `${input.productName} data boundary alignment`,
      rationaleTemplate: `Make the data entities, interfaces, and integration touchpoints explicit so hidden assumptions do not become expensive surprises later.`,
      phaseType: 'design'
    },
    {
      tag: 'security',
      nameTemplate: `${input.productName} trust and safety boundary check`,
      rationaleTemplate: `Review the plan for trust risks, privacy boundaries, and safety constraints that should block implementation if left unresolved.`,
      phaseType: 'verification'
    }
  ];

  // Prefer domain-specific review phases first so minimum-count padding still matches the product language.
  const domainFillers = getDomainFillerNames(context.domainArchetype, input);
  let fillerIdx = 0;
  while (phases.length < minCount && fillerIdx < domainFillers.length) {
    const filler = domainFillers[fillerIdx];
    phases.splice(
      phases.length - 1,
      0,
      createBlueprint(
        filler.tag,
        filler.name,
        filler.rationale,
        [input.mustHaveFeatures, input.constraints, input.successMetrics],
        [`Does this ${filler.phaseType} review add enough clarity to protect the first release?`],
        filler.phaseType,
        [`${filler.name} review notes`]
      )
    );
    fillerIdx++;
  }

  // Last resort: add neutral but still phase-purpose-specific fillers only if domain-specific reviews were not enough.
  let fillerIndex = 0;
  while (phases.length < minCount && fillerIndex < fillerTemplates.length) {
    const template = fillerTemplates[fillerIndex];
    const existingTags = new Set(phases.map((p) => p.tag));
    if (!existingTags.has(template.tag)) {
      phases.splice(
        phases.length - 1,
        0,
        createBlueprint(
          template.tag,
          template.nameTemplate,
          template.rationaleTemplate,
          [input.mustHaveFeatures, input.constraints, input.successMetrics],
          [`Does this ${template.phaseType} review add enough clarity to protect the first release?`],
          template.phaseType,
          [`${template.tag} review notes`]
        )
      );
    }
    fillerIndex++;
  }

  // Absolute last resort: only if domain fillers are exhausted and still below minimum
  let absoluteLastIdx = 1;
  while (phases.length < minCount) {
    phases.splice(
      phases.length - 1,
      0,
      createBlueprint(
        'review',
        `${input.productName} cross-phase consistency check ${absoluteLastIdx}`,
        `Verify that earlier phase outputs still align with the project brief, scope cut, and acceptance criteria before the package is considered deep enough.`,
        [input.productIdea, input.problemStatement],
        [`Is consistency check ${absoluteLastIdx} necessary for this package?`],
        'verification',
        [`Consistency check ${absoluteLastIdx} notes`]
      )
    );
    absoluteLastIdx++;
  }

  return phases.slice(0, 15);
}

function buildPhaseEntryCriteria(index: number, blueprint: PhaseBlueprint, input: ProjectInput, context: ProjectContext) {
  if (index === 1) {
    return [
      'Project brief exists.',
      'User profile selected.',
      'Business or technical orientation selected.',
      'Initial problem statement captured.',
      'Target user or customer captured.',
      'Known constraints captured.',
      'Output expectations captured.'
    ];
  }

  return [
    'Previous phase handoff complete.',
    'Previous exit gate passed.',
    'Unresolved blockers documented.',
    'Scope changes recorded.',
    `The source material for "${blueprint.name}" is present in the package.`,
    blueprint.phaseType === 'implementation'
      ? 'Known repo targets are listed or explicitly marked as assumptions before editing starts.'
      : `The planning evidence needed for ${blueprint.name} is visible before this phase starts.`
  ];
}

function getPhaseSpecificNouns(blueprint: PhaseBlueprint, context: ProjectContext, input: ProjectInput) {
  return unique(
    normalizeTokens(`${blueprint.name} ${blueprint.rationale} ${context.primaryFeature} ${context.primaryAudience} ${input.productName}`)
      .filter((token) => token.length >= 5)
      .slice(0, 8)
  );
}

function getRiskChecksForPhase(blueprint: PhaseBlueprint, context: ProjectContext, input: ProjectInput) {
  const checks: string[] = [];
  // Phase A3c (final hardening): archetype-disjuncts dropped — the regex over the
  // brief already covers any child- or medical-relevant product, regardless of
  // whether a (now-removed) archetype label would have matched.
  const isChildDomain = /(kid|kids|child|children|parent|family|student|school|minor)/i.test(
    `${input.productName} ${input.productIdea}`
  );
  if (context.riskFlags.includes('children') && isChildDomain) {
    checks.push('Prove child users only see allowed items and parent or admin control boundaries stay explicit.');
  }
  const isMedicalDomain = /(clinic|medical|patient|healthcare|physician|doctor|nurse)/i.test(
    `${input.productName} ${input.productIdea}`
  );
  if (context.riskFlags.includes('medical') && isMedicalDomain) {
    checks.push('Prove reminder wording and scheduling artifacts avoid sensitive clinical details unless the package explicitly supports them.');
  }
  if (context.riskFlags.includes('legal') || context.riskFlags.includes('emergency')) {
    checks.push('Prove the phase does not overclaim legal, emergency, or authority boundaries.');
  }
  if (context.riskFlags.includes('money')) {
    checks.push('Prove the package avoids financial-advice claims unless that scope is explicitly intended.');
  }
  if (context.riskFlags.includes('privacy') || context.riskFlags.includes('sensitive-data')) {
    checks.push('Prove visibility rules, data minimization, and disclaimer language are reviewable in this phase.');
  }
  return checks;
}

function buildPhaseExitCriteria(
  blueprint: PhaseBlueprint,
  context: ProjectContext,
  input: ProjectInput,
  nouns: string[],
  expectedOutputs: string[],
  evidenceExamples: string[],
  failureConditions: string[]
) {
  return [
    `The phase output explicitly covers ${nouns.slice(0, 3).join(', ')} and stays tied to ${context.primaryAudience}.`,
    `The expected output exists and is reviewable: ${expectedOutputs[0] || `phase deliverable for ${blueprint.name}`}.`,
    `The reviewer can point to evidence such as ${evidenceExamples[0] || 'changed files, command output, or a checked scenario'} instead of generic claims.`,
    `Any unresolved assumption, blocker, or deferred decision for ${input.productName} is written down before the phase closes.`,
    `The phase would fail if ${failureConditions[0] || 'the output stayed generic, contradicted the scope, or lacked proof'}.`
  ].concat(getRiskChecksForPhase(blueprint, context, input));
}

function getRepoTargetsForPhase(blueprint: PhaseBlueprint, context: ProjectContext) {
  if (blueprint.repoTargets?.length) return blueprint.repoTargets;
  if (blueprint.phaseType === 'implementation') {
    return ['repo/README.md', 'repo/manifest.json', 'phases/current-phase artifacts', 'Likely app or src areas to confirm as assumptions'];
  }
  return [`phases/current-phase markdown artifacts for ${context.primaryFeature}`];
}

function buildTestingRequirements(
  blueprint: PhaseBlueprint,
  context: ProjectContext,
  input: ProjectInput,
  expectedOutputs: string[],
  failureConditions: string[],
  evidenceExamples: string[]
) {
  const base = [
    `Scenario: review whether ${expectedOutputs[0] || blueprint.name} covers the phase goal without generic filler.`,
    `Expected result: the output names the concrete ${context.primaryFeature} decisions, states, or boundaries that this phase owns.`,
    `Failure condition: ${failureConditions[0] || 'the deliverable stays generic, contradictory, or unsupported by evidence'}.`,
    `Evidence to capture: ${evidenceExamples[0] || 'changed files, command output, scenario notes, or observed results'}.`
  ];

  if (blueprint.phaseType === 'implementation') {
    base.splice(1, 0, 'Inspection method: run the relevant command, inspect the touched files, and record observed results or blockers.');
  } else {
    base.splice(1, 0, 'Inspection method: review the markdown outputs, compare them to the brief, and record specific decisions, edge cases, or blockers.');
  }

  return base.concat(getRiskChecksForPhase(blueprint, context, input));
}

function buildPhaseContent(
  blueprint: PhaseBlueprint,
  index: number,
  input: ProjectInput,
  context: ProjectContext,
  critique: CritiqueItem[]
): PhasePlan {
  const nouns = getPhaseSpecificNouns(blueprint, context, input);
  const generatedFromInput = Array.from(
    new Set(
      blueprint.primaryInputs
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => `Based on your answers so far: ${truncateText(item, 18)}`)
    )
  ).slice(0, 4);

  const needsConfirmation = Array.from(
    new Set(
      blueprint.confirmationPrompts.map((item) => `Please review and confirm: ${item}`)
    )
  );

  const inferredAssumptions = Array.from(
    new Set(
      context.inferredAssumptions.concat(
        critique
          .slice(0, 2)
          .map((item) => `${item.signal === 'inferred-assumption' ? 'Inferred assumption' : 'Please review and confirm'}: ${item.followUpQuestion}`)
      )
    )
  ).slice(0, 4);

  const businessSpecific =
    input.track === 'business'
      ? `Keep the business-side validation anchored to ${context.profile.businessFocus}.`
      : `Translate business expectations into engineering-ready proof for ${context.primaryAudience}.`;

  const technicalSpecific =
    input.track === 'technical'
      ? `Use ${context.profile.technicalFocus} to decide whether the package is implementation-ready.`
      : `Only add technical detail when it protects the business outcome or reduces delivery risk.`;

  const entryCriteria = buildPhaseEntryCriteria(index, blueprint, input, context);
  const expectedOutputs = unique(
    (blueprint.outputs || []).concat([
      blueprint.phaseType === 'implementation'
        ? `A repo-aware implementation or repo-target assumption list for ${blueprint.name}`
        : `A concrete markdown deliverable for ${blueprint.name}`,
      `${context.primaryAudience}-specific decisions for ${context.primaryFeature}`,
      `Documented blockers, deferrals, or follow-up decisions for ${input.productName}`
    ])
  );
  const evidenceExamples = unique(
    [
      `Changed file paths tied to ${blueprint.name}`,
      blueprint.phaseType === 'implementation'
        ? 'Command output with an observed result or failure'
        : `A scenario note showing what was reviewed and what was observed about ${context.primaryFeature}`,
      `A decision note naming the specific ${context.primaryFeature} choice made in this phase`,
      `A blocker or risk note tied to ${context.domainSignals[0] || input.productName}`
    ].concat(getRiskChecksForPhase(blueprint, context, input))
  );
  const isChildDomain = /(kid|kids|child|children|parent|family|student|school|minor)/i.test(
    `${input.productName} ${input.productIdea}`
  );
  const isMedicalDomain = /(clinic|medical|patient|healthcare|physician|doctor|nurse)/i.test(
    `${input.productName} ${input.productIdea}`
  );
  const failureConditions = unique(
    [
      `the output stays generic instead of naming ${nouns.slice(0, 3).join(', ')}`,
      'the review claims pass or proceed without concrete proof',
      `the deliverable contradicts the stated scope, risk boundaries, or non-goals for ${input.productName}`
    ].concat(
      context.riskFlags.includes('children') && isChildDomain ? ['child visibility or parent-control rules stay ambiguous'] : [],
      context.riskFlags.includes('medical') && isMedicalDomain ? ['sensitive reminder or provider-availability rules stay vague'] : [],
      context.riskFlags.includes('legal') || context.riskFlags.includes('emergency') ? ['the package sounds more authoritative than its stated legal or emergency boundary'] : [],
      context.riskFlags.includes('money') ? ['the package implies financial advice without explicit scope'] : []
    )
  );
  const scopeGuards = unique([
    `Do not add work outside ${blueprint.name}.`,
    `Do not expand beyond ${context.primaryFeature} or the current v1 scope cut.`,
    context.nonGoals.length
      ? `Do not pull deferred items into this phase: ${context.nonGoals.slice(0, 3).join(', ')}.`
      : 'Do not convert optional ideas into current-phase requirements.'
  ]);
  const continuityChecks = unique([
    `Confirm earlier phase outputs still align with ${context.workflowAnchor}.`,
    `Confirm the handoff still matches ${context.acceptanceAnchor}.`,
    `Record any regression, contradiction, or stale assumption as a blocker.`
  ]);
  const exitCriteria = buildPhaseExitCriteria(blueprint, context, input, nouns, expectedOutputs, evidenceExamples, failureConditions);
  const reviewChecklist = unique([
    `Review the output against the phase goal for ${blueprint.name}.`,
    `Check that ${nouns.slice(0, 3).join(', ')} are named directly instead of implied.`,
    `Check that at least one evidence file proves a concrete scenario, command result, or decision.`,
    `Check that deferred scope and blockers remain visible.`
  ].concat(getRiskChecksForPhase(blueprint, context, input)));
  const riskFocus = [
    `Based on your answers so far: ${truncateText(input.risks, 18)}`,
    `Based on your answers so far: ${truncateText(context.riskAnchor, 18)}`
  ];
  const nextActions = [
    `Carry forward the concrete decisions from "${blueprint.name}" instead of rephrasing them generically.`,
    `Preserve the evidence trail for ${context.primaryFeature}, including any blocker, deferral, or observed result.`,
    `Do not revisit already-locked scope unless this phase found a contradiction that must be surfaced.`
  ];

  return {
    index,
    slug: `phase-${String(index).padStart(2, '0')}`,
    name: blueprint.name,
    phaseType: blueprint.phaseType,
    goal: blueprint.rationale,
    focusSummary: `This phase is shaped by ${context.primaryAudience}, ${context.primaryFeature}, and the selected mode ${context.profile.label}.`,
    riskFocus,
    generatedFromInput,
    needsConfirmation,
    inferredAssumptions,
    nextActions,
    domainSignals: unique(context.domainSignals.concat(nouns)).slice(0, 10),
    entryCriteria,
    implementationChecklist: [
      `Review the project brief, questionnaire answers, and critique before editing "${blueprint.name}".`,
      `Apply ${context.profile.label} guidance: ${context.profile.planningExpectation}`,
      `Keep this phase anchored to these current inputs: ${unique(context.keywords.concat(nouns)).slice(0, 5).join(', ') || input.productName}.`,
      `Use ${context.primaryFeature}, ${context.outputAnchor}, and ${nouns.slice(0, 3).join(', ')} as the main decision anchors, not generic planning filler.`,
      businessSpecific,
      technicalSpecific,
      blueprint.phaseType === 'implementation'
        ? `If exact repo targets are unknown, propose likely areas such as ${getRepoTargetsForPhase(blueprint, context).join(', ')} and label them as assumptions instead of facts.`
        : `Focus on planning outputs, decisions, and evidence notes for ${blueprint.name}; do not invent implementation files.`,
      'Do not hardcode final AI prompts. Instead, ask the coding AI to draft implementation or review prompts from this phase output.'
    ],
    businessAcceptanceCriteria: [
      `A stakeholder can explain how "${blueprint.name}" supports ${input.productName} for ${context.primaryAudience}.`,
      `The business outcome still lines up with ${truncateText(input.successMetrics, 16)}.`,
      `The phase protects the stated non-goals and constraints instead of expanding scope.`
    ],
    technicalAcceptanceCriteria: [
      `The implementation implications connect back to ${context.primaryFeature} and ${context.secondaryFeature}.`,
      `The package is explicit enough about ${context.profile.technicalFocus}.`,
      `Any unresolved technical boundary is labelled rather than presented as settled fact.`
    ],
    testingRequirements: buildTestingRequirements(blueprint, context, input, expectedOutputs, failureConditions, evidenceExamples),
    exitCriteria,
    expectedOutputs,
    reviewChecklist,
    evidenceExamples,
    failureConditions,
    scopeGuards,
    continuityChecks,
    repoTargets: getRepoTargetsForPhase(blueprint, context),
    implementationPromptPlaceholder:
      `Ask your coding AI to draft an implementation prompt for "${blueprint.name}" using this package's constraints, must-have scope, and acceptance criteria.`,
    reviewPromptPlaceholder:
      `Ask your coding AI to draft a review or testing prompt for "${blueprint.name}" using the current risks, failure paths, and exit criteria.`,
    requirementIds: []
  };
}

function buildPhasePlan(input: ProjectInput, context: ProjectContext, critique: CritiqueItem[]) {
  const phases = buildPhaseBlueprints(input, context, critique).map((blueprint, index) =>
    buildPhaseContent(blueprint, index + 1, input, context, critique)
  );
  assignRequirementsToPhases(phases, context.ontology.featureScenarios);
  return phases;
}

function assignRequirementsToPhases(phases: PhasePlan[], scenarios: OntologyFeatureScenario[]) {
  phases.forEach((phase) => {
    phase.requirementIds = [];
  });
  if (!scenarios.length || !phases.length) return;

  const ownerPhases = phases.filter(
    (phase) => phase.phaseType === 'implementation' || phase.phaseType === 'design'
  );
  const verificationPhases = phases.filter((phase) => phase.phaseType === 'verification');
  const eligible = ownerPhases.length
    ? ownerPhases
    : phases.filter((phase) => phase.phaseType !== 'planning' && phase.phaseType !== 'finalization');
  const distributionTargets = eligible.length ? eligible : phases;

  scenarios.forEach((_, idx) => {
    const reqId = `REQ-${idx + 1}`;
    const target = distributionTargets[idx % distributionTargets.length];
    target.requirementIds = (target.requirementIds || []).concat(reqId);
  });

  if (verificationPhases.length) {
    const allReqIds = scenarios.map((_, idx) => `REQ-${idx + 1}`);
    verificationPhases.forEach((phase) => {
      phase.requirementIds = unique((phase.requirementIds || []).concat(allReqIds));
    });
  }
}

function getRequirementPhaseSlug(reqIndex: number, phases: PhasePlan[]): string {
  const reqId = `REQ-${reqIndex + 1}`;
  const owner = phases.find((phase) => (phase.requirementIds || []).includes(reqId));
  if (owner) return owner.slug;
  return phases[Math.min(reqIndex, phases.length - 1)]?.slug || 'phase-01';
}

function renderQuestionnaireMarkdown(questionnaire: QuestionnaireItem[], input: ProjectInput) {
  return questionnaire
    .map((item, index) => {
      const answer = input.questionnaireAnswers[item.id] || 'Please review and confirm: no answer provided yet.';
      return `## ${index + 1}. ${item.prompt}

Intent: ${item.intent}

Helper:
${item.helper}

Answer:
${answer}
`;
    })
    .join('\n');
}

function renderCritiqueMarkdown(critique: CritiqueItem[]) {
  if (!critique.length) {
    return '- Based on your answers so far: no major critique items are open right now.\n- Please review and confirm: keep validating assumptions as the package changes.';
  }

  return critique
    .map(
      (item, index) => `## ${index + 1}. ${item.title}

Severity: ${item.severity}

Signal:
${item.signal}

Why this matters:
${item.detail}

Follow-up question:
${item.followUpQuestion}
`
    )
    .join('\n');
}

function renderPhasePlanMarkdown(phases: PhasePlan[]) {
  return phases
    .map(
      (phase) => `## ${phase.index}. ${phase.name}

- Goal: ${phase.goal}
- Phase type: ${phase.phaseType}
- Focus summary: ${phase.focusSummary}
- Gate file pair: /gates/gate-${String(phase.index).padStart(2, '0')}-entry.md and /gates/gate-${String(phase.index).padStart(2, '0')}-exit.md
- Phase folder: /phases/${phase.slug}/
- Requirement IDs: ${(phase.requirementIds && phase.requirementIds.length) ? phase.requirementIds.join(', ') : 'none'}
`
    )
    .join('\n');
}

function renderScorecardMarkdown(bundle: ProjectBundle) {
  const { score } = bundle;

  return `# SCORECARD

## Package status
${bundle.lifecycleStatus}

| Category | Score |
| --- | ---: |
${score.categories.map((category) => `| ${category.label} | ${category.score}/${category.max} |`).join('\n')}
| **Total** | **${score.total}/100** |

## Rating
${score.rating}

## Lifecycle explanation
${bundle.lifecycleStatus === 'Blocked'
    ? 'This package is blocked until the listed blockers are resolved. The score and rating are intentionally capped so the package cannot look build-ready while blocked.'
    : bundle.lifecycleStatus === 'Draft'
      ? 'This package is still in Draft, so the score cannot overclaim readiness beyond "Needs work" until review conditions are met.'
      : bundle.lifecycleStatus === 'ReviewReady'
        ? 'This package is review-ready, which means it may be strong but is not yet explicitly approved for build.'
        : 'This package is approved for build, and the score is allowed to reflect that status.'}

## Blockers
${score.blockers.length ? score.blockers.map((item) => `- ${item}`).join('\n') : '- No blocking issues detected.'}

## Unresolved warnings
${bundle.unresolvedWarnings.length ? bundle.unresolvedWarnings.map((item) => `- [${item.severity}] ${item.title}: ${item.message}`).join('\n') : '- No unresolved warnings recorded.'}

## Why points were lost
${score.categories
  .map((category) => {
    const losses = category.reasonsLost.length ? category.reasonsLost.map((item) => `- ${item}`).join('\n') : '- No points lost in this category.';
    return `### ${category.label}\n${losses}`;
  })
  .join('\n\n')}

## What must improve before build handoff
${score.recommendations.map((item) => `- ${item}`).join('\n')}

## Score adjustments
${score.adjustments.length ? score.adjustments.map((item) => `- ${item}`).join('\n') : '- No lifecycle-based score adjustments were needed.'}
`;
}

function renderPhaseMarkdown(phase: PhasePlan) {
  return `# ${phase.name}

## Phase goal
${phase.goal}

## Focus summary
${phase.focusSummary}

## Based on the project information provided
${listToBullets(phase.generatedFromInput, 'Based on your answers so far: no direct source signals were captured.')}

## Please review and confirm
${listToBullets(phase.needsConfirmation, 'Please review and confirm: no explicit confirmation items were captured.')}

## Inferred assumptions
${listToBullets(phase.inferredAssumptions, 'Inferred assumption: no explicit assumptions were recorded.')}

## Assumptions and open questions
${listToBullets(
  phase.inferredAssumptions.concat(phase.needsConfirmation),
  'Please review and confirm: no open assumptions or questions were recorded.'
)}

## Risk focus
${listToBullets(phase.riskFocus, 'Based on your answers so far: no phase-specific risk focus was captured.')}

## Entry criteria
${phase.entryCriteria.map((item) => `- ${item}`).join('\n')}

## Implementation checklist
${phase.implementationChecklist.map((item) => `- ${item}`).join('\n')}

## Business acceptance criteria
${phase.businessAcceptanceCriteria.map((item) => `- ${item}`).join('\n')}

## Technical acceptance criteria
${phase.technicalAcceptanceCriteria.map((item) => `- ${item}`).join('\n')}

## Testing requirements
${phase.testingRequirements.map((item) => `- ${item}`).join('\n')}

## Exit gate criteria
${phase.exitCriteria.map((item) => `- ${item}`).join('\n')}

## Next actions
${listToBullets(phase.nextActions, 'Please review and confirm: no next actions were generated.')}

## AI implementation prompt placeholder
${phase.implementationPromptPlaceholder}

## AI review or testing prompt placeholder
${phase.reviewPromptPlaceholder}
`;
}

function formatWarningLine(warning: WarningItem) {
  return `[${warning.severity}] ${warning.title}: ${warning.message}`;
}

function inferImplementationFileHints(phase: PhasePlan) {
  if (phase.phaseType !== 'implementation') {
    return [`Planning artifacts and markdown evidence tied to ${phase.name}, not speculative implementation files.`];
  }

  if (phase.repoTargets.length) {
    return phase.repoTargets;
  }

  const signature = `${phase.slug} ${phase.name}`.toLowerCase();
  if (/brief|audience|stakeholder|workflow|handoff/.test(signature)) {
    return ['Product documentation, planning notes, and implementation README or docs that define the workflow clearly.'];
  }
  if (/data|architecture|api|integration/.test(signature)) {
    return ['Core application modules, data models, API handlers, and integration boundary files that implement the phase scope.'];
  }
  if (/testing|test/.test(signature)) {
    return ['Automated test files, smoke checks, fixtures, and validation scripts that prove the phase behavior.'];
  }
  if (/deployment|rollout/.test(signature)) {
    return ['Build scripts, environment configuration, deployment instructions, and release-related files touched by this phase.'];
  }
  if (/security|observability|scal/.test(signature)) {
    return ['Security-sensitive modules, logging or instrumentation files, and reliability guardrail code required for this phase.'];
  }

  return ['The implementation repo files needed to satisfy this phase goal, plus the phase packet files that record proof and handoff context.'];
}

function buildAgentPrompt(
  agentName: AgentName,
  phase: PhasePlan,
  input: ProjectInput,
  context: ProjectContext
) {
  const implementationHints = inferImplementationFileHints(phase);
  const includeAgents = agentName === 'OpenCode';
  const phaseWorkMode =
    phase.phaseType === 'planning' || phase.phaseType === 'design'
      ? 'planning outputs and explicit decisions'
      : phase.phaseType === 'implementation'
        ? 'repo-aware implementation work'
        : phase.phaseType === 'finalization'
          ? 'final handoff cleanup and release caveats'
          : 'verification evidence and review notes';
  const requiredOutputLines =
    phase.phaseType === 'implementation'
      ? `1. Restate the phase goal and entry gate in your own words.
2. List the exact repo files you plan to change before editing anything. If exact targets are unknown, propose likely areas and label them as assumptions.
3. Complete only the implementation work required for this phase.
4. Run or describe the checks from TEST_PLAN.md and report observed results.
5. Return a short handoff summary with changed files, test results, remaining risks, and whether the exit gate now passes.
6. Draft updated text for HANDOFF_SUMMARY.md and NEXT_PHASE_CONTEXT.md.`
      : phase.phaseType === 'finalization'
        ? `1. Restate the final phase goal and the release caveats in your own words.
2. Summarize the completed package outputs and the blockers or caveats that still matter.
3. Update only the markdown handoff, recap, and verification files required for this phase.
4. Run or describe the review checks from TEST_PLAN.md and report observed results.
5. Return a short final recap that another builder or reviewer can trust without chat history.`
        : `1. Restate the phase goal and entry gate in your own words.
2. Produce the planning outputs, decisions, open questions, and evidence notes required for this phase.
3. Do not invent repo file changes unless the phase packet names them. If likely implementation areas matter, label them as assumptions rather than facts.
4. Run or describe the inspection or review checks from TEST_PLAN.md and report observed results.
5. Return a short handoff summary with the decisions made, evidence captured, remaining risks, and whether the exit gate now passes.
6. Draft updated text for HANDOFF_SUMMARY.md and NEXT_PHASE_CONTEXT.md.`;
  const expectedOutputLines =
    phase.phaseType === 'implementation'
      ? [
          'A concise restatement of the phase goal and entry gate.',
          'A list of repo files changed for this phase, or clearly labelled repo-target assumptions.',
          'Completed implementation work for this phase only.',
          'Test output or a clear note explaining what could not be tested.',
          `A short handoff summary suitable for phases/${phase.slug}/HANDOFF_SUMMARY.md.`
        ]
      : [
          'A concise restatement of the phase goal and entry gate.',
          `The expected outputs for ${phase.name} with concrete decisions, scenarios, and blockers.`,
          'Evidence notes tied to reviewed files, commands, or observed results.',
          'A clear note explaining what could not be verified yet.',
          `A short handoff summary suitable for phases/${phase.slug}/HANDOFF_SUMMARY.md.`
        ];

  return `# ${agentName.toUpperCase()} BUILD PROMPT

## What this file is for
Use this file when you want ${agentName} to work on this phase.

## Files to give ${agentName}
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- ${includeAgents ? 'AGENTS.md\n- ' : ''}PROJECT_BRIEF.md
- PHASE_PLAN.md
- SCORECARD.md
- 00_APPROVAL_GATE.md
- phases/${phase.slug}/PHASE_BRIEF.md
- phases/${phase.slug}/ENTRY_GATE.md
- phases/${phase.slug}/TEST_PLAN.md
- phases/${phase.slug}/HANDOFF_SUMMARY.md
- phases/${phase.slug}/NEXT_PHASE_CONTEXT.md
- repo/manifest.json
- repo/mvp-builder-state.json
${agentName === 'OpenCode' ? `- OPENCODE_START_HERE.md
- phases/${phase.slug}/OPENCODE_BUILD_PROMPT.md
` : ''}

## What you should do now
1. Give ${agentName} the files listed above.
2. Paste the prompt below into ${agentName}.
3. Ask ${agentName} to work only on this phase.
4. Review the result before filling out verification files.

## Prompt to paste
\`\`\`text
You are taking over phase ${String(phase.index).padStart(2, '0')} for ${input.productName}.

Read the provided markdown files as the full source of truth. Do not rely on hidden chat context. First confirm the entry gate, then implement only the work required for "${phase.name}".

Phase goal:
${phase.goal}

Primary audience:
${context.primaryAudience}

Must-have anchor:
${context.primaryFeature}

Constraints that still matter:
${context.constraints.join('; ') || 'Keep the work local-first, markdown-first, and within the current MVP scope.'}

Phase work mode:
${phaseWorkMode}

Required output from you:
${requiredOutputLines}

Do not jump ahead to later phases. If the phase packet is missing information, call it out explicitly before coding.
\`\`\`

## Expected output
${expectedOutputLines.map((line) => `- ${line}`).join('\n')}

## Tests to run
${listToBullets(phase.testingRequirements, 'Run the smallest test or smoke proof that demonstrates this phase now works.')}

## Files that should change
${listToBullets(
  implementationHints.concat([
    `phases/${phase.slug}/HANDOFF_SUMMARY.md`,
    `phases/${phase.slug}/NEXT_PHASE_CONTEXT.md`,
    `phases/${phase.slug}/VERIFICATION_REPORT.md`
  ]),
  phase.phaseType === 'implementation'
    ? 'The repo files required for this phase and the phase packet markdown should be updated.'
    : 'The phase packet markdown and evidence artifacts should be updated; do not fabricate implementation files.'
)}

## Handoff summary to request before moving on
- What changed for ${phase.name}
- Which implementation files changed
- Which tests ran and what passed or failed
- Which risks or assumptions remain open
- Whether the exit gate passed
- What the next phase needs to know
`;
}

function renderPhaseResearchContext(phase: PhasePlan, context: ProjectContext): string {
  if (!context.tokenPack.present) return '';
  const relevant = selectPhaseRelevant(context.extractions, phase.requirementIds);
  const lines: string[] = [];
  lines.push('## Research context for this phase');
  lines.push('');
  if (relevant.actors.length) {
    lines.push(`- **Actors involved**: ${relevant.actors.join(', ')}`);
  }
  if (relevant.entities.length) {
    lines.push(`- **Entities touched**: ${relevant.entities.join(', ')}`);
  }
  if (relevant.workflows.length) {
    lines.push(`- **Workflows owned**: ${relevant.workflows.join('; ')}`);
  }
  if (relevant.risks.length) {
    lines.push(`- **Risks that apply**: ${relevant.risks.slice(0, 3).join(' | ')}`);
  }
  if (relevant.gates.length) {
    lines.push(`- **Gates that block this phase type**: ${relevant.gates.join(', ')}`);
  }
  // Always emit the regulatory citations section if any exist — relevant to almost every phase.
  if (context.tokenPack.categorized.regulatoryCitations.length) {
    lines.push(`- **Regulatory citations to honor**: ${context.tokenPack.categorized.regulatoryCitations.join(', ')}`);
  }
  // If this phase has no owned reqs, surface global research context so the agent still has the vocabulary.
  if (!relevant.actors.length && !relevant.entities.length) {
    const globalActors = context.tokenPack.categorized.actorNames.slice(0, 4).join(', ');
    const globalEntities = context.tokenPack.categorized.entityNames.slice(0, 5).join(', ');
    if (globalActors) lines.push(`- **Global actor vocabulary**: ${globalActors}`);
    if (globalEntities) lines.push(`- **Global entity vocabulary**: ${globalEntities}`);
  }
  lines.push('');
  lines.push('Use these names verbatim when writing requirements, code, or tests for this phase. Do NOT introduce alternate names ("the user", "the system", "the record") — those break traceability against research/extracted/.');
  lines.push('');

  // Phase E1: surface the actual workflow acceptance patterns + failure modes for the
  // workflows this phase owns, so the agent doesn't have to chase research/extracted/workflows.json.
  if (context.extractions) {
    const ex = context.extractions;
    const flat: Array<{ wf: typeof ex.workflows[number]; step: typeof ex.workflows[number]['steps'][number] }> = [];
    for (const wf of ex.workflows) for (const step of wf.steps) flat.push({ wf, step });
    const reqNums = (phase.requirementIds || [])
      .map((id) => Number.parseInt(String(id).replace(/^REQ-/i, ''), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const ownedWf = new Map<string, typeof ex.workflows[number]>();
    for (const n of reqNums) {
      const slot = flat[n - 1];
      if (slot) ownedWf.set(slot.wf.id, slot.wf);
    }
    if (ownedWf.size) {
      lines.push('### Acceptance patterns for owned workflows');
      lines.push('');
      for (const wf of ownedWf.values()) {
        lines.push(`- **${wf.name}** — Pass criterion: ${wf.acceptancePattern}`);
      }
      lines.push('');
      const failureLines: string[] = [];
      for (const wf of ownedWf.values()) {
        for (const fm of wf.failureModes.slice(0, 2)) {
          failureLines.push(`- *${wf.name}* → on **${fm.trigger}**: effect — ${fm.effect}; required mitigation — ${fm.mitigation}`);
        }
      }
      if (failureLines.length) {
        lines.push('### Failure modes this phase must defend against');
        lines.push('');
        lines.push(...failureLines);
        lines.push('');
      }
      // Risks that affect this phase's owned actors/entities (richer than the name list above).
      const ownedActorIds = new Set<string>();
      const ownedEntityIds = new Set<string>();
      for (const wf of ownedWf.values()) {
        for (const step of wf.steps) ownedActorIds.add(step.actor);
        for (const eid of wf.entitiesTouched) ownedEntityIds.add(eid);
      }
      const phaseRisks = ex.risks.filter(
        (r) =>
          r.affectedActors.some((a) => ownedActorIds.has(a)) ||
          r.affectedEntities.some((e) => ownedEntityIds.has(e))
      );
      if (phaseRisks.length) {
        lines.push('### Risks tied to this phase\'s actors and entities');
        lines.push('');
        for (const r of phaseRisks.slice(0, 4)) {
          lines.push(`- **${r.severity}** (${r.category}): ${r.description} Mitigation: ${r.mitigation}.`);
        }
        lines.push('');
      }
      // Gates that block this phase type, with the cited evidence.
      const phaseGates = ex.gates.filter(
        (g) => g.blockingPhases.length === 0 || g.blockingPhases.some((p) => phase.phaseType.includes(p) || p.includes(phase.phaseType))
      );
      if (phaseGates.length) {
        lines.push('### Gates that block this phase');
        lines.push('');
        for (const g of phaseGates.slice(0, 3)) {
          lines.push(`- **${g.name}** (${g.mandatedBy}: ${g.mandatedByDetail}) — required evidence: ${g.evidenceRequired.slice(0, 3).join('; ') || 'none specified'}.`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function buildPhaseBrief(
  phase: PhasePlan,
  input: ProjectInput,
  context: ProjectContext,
  assumptionsAndQuestions: { assumptions: string[]; openQuestions: string[] },
  nextPhase?: PhasePlan
) {
  const supportModules = getPhaseSupportModules(phase, input, context);
  const outOfScope = [
    nextPhase
      ? `Do not start "${nextPhase.name}" in this phase. Finish and verify ${phase.name} first.`
      : 'Do not reopen earlier phases unless verification found a blocker that must be fixed before final handoff.',
    context.nonGoals.length
      ? `Project non-goals still stay out of scope here: ${context.nonGoals.slice(0, 3).join(', ')}.`
      : `Do not add unrelated later-phase work outside the goal for ${phase.name}.`,
    context.niceToHaves.length
      ? `Defer optional ideas like ${context.niceToHaves.slice(0, 2).join(' and ')} unless this phase explicitly asks you to plan them.`
      : `If new ideas appear during this phase, record them for later instead of building them now.`
  ];

  return `# PHASE_BRIEF

## What this file is for
This file explains the current phase in plain language. Read it before you ask a coding agent to do any work for this phase.

## Phase
${phase.name}

## Goal
${phase.goal}

## Why this phase exists
${phase.focusSummary}

${renderPhaseResearchContext(phase, context)}## Phase type
${phase.phaseType}

## What you should do now
1. Read the goal and open questions below.
2. Check ENTRY_GATE.md before starting work.
3. Review related support folders only if they are listed below.
4. ${context.uiRelevant ? 'If this phase touches interface work, open /ui-ux/UI_UX_START_HERE.md and the related UI/UX files before building screens.' : 'If interface work appears in this phase unexpectedly, stop and activate the lightweight /ui-ux/ module first.'}
5. Give this file and the matching build prompt to your coding agent.
6. Do not move to the next phase yet. Verification happens after the work is reviewed.

## Related support folders for this phase
${renderSupportModuleLines(supportModules, 'No extra support folder is required beyond the current phase packet unless new scope, data, or integration risk appears.')}

## Files to give Codex or Claude Code for this phase
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- AGENTS.md
- PROJECT_BRIEF.md
- PHASE_PLAN.md
- phases/${phase.slug}/PHASE_BRIEF.md
- phases/${phase.slug}/ENTRY_GATE.md
- phases/${phase.slug}/CODEX_BUILD_PROMPT.md or phases/${phase.slug}/CLAUDE_BUILD_PROMPT.md
- phases/${phase.slug}/TEST_PLAN.md
- phases/${phase.slug}/HANDOFF_SUMMARY.md
- phases/${phase.slug}/NEXT_PHASE_CONTEXT.md
- repo/manifest.json
- repo/mvp-builder-state.json

## Files to give OpenCode specifically
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- AGENTS.md
- OPENCODE_START_HERE.md
- phases/${phase.slug}/PHASE_BRIEF.md
- phases/${phase.slug}/ENTRY_GATE.md
- phases/${phase.slug}/TEST_PLAN.md
- phases/${phase.slug}/OPENCODE_BUILD_PROMPT.md
${phase.index > 1 ? `- phases/phase-${String(phase.index - 1).padStart(2, '0')}/HANDOFF_SUMMARY.md` : '- No previous phase handoff summary is required for phase 1.'}

## Output to expect
${phase.expectedOutputs.map((item) => `- ${item}`).join('\n')}

## This phase is ready only when
- The work matches the goal above.
- The entry gate was respected.
- The exit gate can be reviewed with real evidence.
- The next builder could understand what happened without hidden chat context.

## Out of scope for this phase
${unique(outOfScope.concat(phase.scopeGuards)).map((item) => `- ${item}`).join('\n')}

## Evidence expected
${phase.evidenceExamples.map((item) => `- ${item}`).join('\n')}
- ${context.uiRelevant ? 'UI screenshots and screenshot review notes for any screen changed in this phase.' : 'If a UI was introduced in this phase, add screenshots and UI review notes before closing it.'}
${supportModules.length ? supportModules.map((module) => `- Evidence from ${module.folder} if this phase changes that area.`).join('\n') : ''}

## Failure or blocker conditions
${phase.failureConditions.map((item) => `- ${item}`).join('\n')}

## Project-specific anchors
- Product: ${input.productName}
- Audience: ${context.primaryAudience}
- Must-have focus: ${context.primaryFeature}
- Workflow anchor: ${context.workflowAnchor}
- Acceptance anchor: ${context.acceptanceAnchor}

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions.slice(0, 5), 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(phase.needsConfirmation.concat(assumptionsAndQuestions.openQuestions.slice(0, 4)), 'Please review and confirm: no open questions recorded.')}
`;
}

function buildPhaseEntryGate(phase: PhasePlan) {
  return `# ENTRY_GATE

## What this file is for
This file tells you whether the phase is ready to start. Do not begin the phase until these checks are true.

## Phase
${phase.name}

## This phase can start when
${phase.entryCriteria.map((item) => `- ${item}`).join('\n')}

## What you should do now
- Read each line below.
- If every line is true, you can start the phase.
- If any line is false or unclear, stop and fix that first.

## What to do if the gate fails
- Stop implementation for this phase.
- Record the blocker in repo/mvp-builder-state.json so the package still shows the truth.
- Update phases/${phase.slug}/HANDOFF_SUMMARY.md with what is missing.
- Do not move to the next phase yet.
`;
}

function buildPhaseExitGate(phase: PhasePlan, context: ProjectContext) {
  return `# EXIT_GATE

## What this file is for
This file tells you what must be true before the phase can be called complete. The checks below are intentionally phase-specific so a reviewer can tell the difference between real proof and filler.

## Phase
${phase.name}

## This phase is ready only when
${phase.exitCriteria.map((item) => `- ${item}`).join('\n')}

## Concrete expected outputs
${phase.expectedOutputs.map((item) => `- ${item}`).join('\n')}

## What must be reviewed
${phase.reviewChecklist.map((item) => `- ${item}`).join('\n')}

## Evidence to gather before closing the phase
${phase.evidenceExamples.map((item) => `- ${item}`).join('\n')}

## Failure or blocker conditions
${phase.failureConditions.map((item) => `- ${item}`).join('\n')}

## Regression or continuity checks
${phase.continuityChecks.map((item) => `- ${item}`).join('\n')}

## Scope guard
${phase.scopeGuards.map((item) => `- ${item}`).join('\n')}

## What you should do next
1. Review the completed work against this checklist.
2. Open VERIFY_PROMPT.md and EVIDENCE_CHECKLIST.md.
3. ${phase.phaseType === 'implementation' && context.uiRelevant ? 'If interface work changed, review screenshots and UI_UX_GATE.md before broader testing.' : 'If interface work unexpectedly appeared, add UI/UX review before broader testing.'}
4. Fill out VERIFICATION_REPORT.md.
5. Do not move to the next phase yet unless verification says the phase can proceed.
`;
}

function buildPhaseTestPlan(phase: PhasePlan, input?: ProjectInput, context?: ProjectContext) {
  const researchBlock = (() => {
    if (!context || !context.extractions) return '';
    const ex = context.extractions;
    // Map REQ-N owned by this phase → workflow + step using the same flatten as buildFunctionalRequirementsFromResearch
    const flat: Array<{ wf: typeof ex.workflows[number]; step: typeof ex.workflows[number]['steps'][number] }> = [];
    for (const wf of ex.workflows) for (const step of wf.steps) flat.push({ wf, step });
    const reqNums = (phase.requirementIds || [])
      .map((id) => Number.parseInt(String(id).replace(/^REQ-/i, ''), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const owned = reqNums
      .map((n) => flat[n - 1])
      .filter((s): s is typeof flat[number] => Boolean(s));
    if (!owned.length) return '';

    // Group by workflow so failure modes appear once per workflow rather than per step
    const wfMap = new Map<string, { wf: typeof ex.workflows[number]; reqIds: string[] }>();
    owned.forEach((entry, idx) => {
      const reqId = `REQ-${reqNums[idx]}`;
      const existing = wfMap.get(entry.wf.id);
      if (existing) existing.reqIds.push(reqId);
      else wfMap.set(entry.wf.id, { wf: entry.wf, reqIds: [reqId] });
    });

    const happyBlocks = Array.from(wfMap.values()).map((entry, i) => {
      const entityById = new Map(ex.entities.map((e) => [e.id, e]));
      const primary = entry.wf.entitiesTouched[0]
        ? entityById.get(entry.wf.entitiesTouched[0])?.name
        : undefined;
      return `### Happy-path scenario ${i + 1} — ${entry.wf.name}
- Covers requirements: ${entry.reqIds.join(', ')}
- Sample data: SAMPLE_DATA.md "${primary || 'primary entity'}" section, happy-path sample
- Acceptance pattern: ${entry.wf.acceptancePattern}
- Pass criterion: persisted state matches the acceptance pattern; an audit entry exists; the actor's visibility scope is respected.
- Where to record: phases/${phase.slug}/TEST_RESULTS.md`;
    });

    const failureBlocks: string[] = [];
    let fIdx = 1;
    for (const entry of wfMap.values()) {
      for (const fm of entry.wf.failureModes) {
        failureBlocks.push(`### Failure-mode scenario ${fIdx} — ${entry.wf.name}: ${fm.trigger}
- Trigger condition: ${fm.trigger}
- Expected effect (must not happen silently): ${fm.effect}
- Required mitigation in build: ${fm.mitigation}
- Pass criterion: the system surfaces the trigger to the actor and applies the mitigation; no silent state change.
- Sample data: SAMPLE_DATA.md negative-path sample for the entity touched by ${entry.wf.name}
- Where to record: phases/${phase.slug}/TEST_RESULTS.md`);
        fIdx += 1;
      }
    }

    return `## Research-driven scenario tests
The phase owns ${phase.requirementIds?.length || 0} requirement(s). Each happy-path scenario below maps to a workflow this phase is responsible for; each failure-mode scenario maps to a researched \`workflow.failureModes\` entry. Use SAMPLE_DATA.md as the source of test inputs.

${happyBlocks.join('\n\n')}

${failureBlocks.length ? failureBlocks.join('\n\n') : '_No failure modes researched for this phase’s workflows._'}

`;
  })();

  return `# TEST_PLAN

${researchBlock}## Scenario 1
${phase.testingRequirements[0] || `Review whether ${phase.name} produced the concrete output this phase promised.`}

## Steps or inspection method
${phase.testingRequirements.slice(1, 2).map((item) => `- ${item}`).join('\n') || '- Review the relevant artifacts, compare them to the phase goal, and record observed results.'}

## Expected result
- ${phase.expectedOutputs[0] || `The deliverable for ${phase.name} is concrete, phase-specific, and reviewable.`}

## Failure condition
- ${phase.failureConditions[0] || 'The output stays generic, contradictory, or unsupported by evidence.'}

## Evidence to capture
${phase.evidenceExamples.map((item) => `- ${item}`).join('\n')}

## Regression or continuity check
${phase.continuityChecks.map((item) => `- ${item}`).join('\n')}
`;
}

function buildPhaseHandoffSummary(phase: PhasePlan, input: ProjectInput, context: ProjectContext) {
  const supportModules = getPhaseSupportModules(phase, input, context);
  const nextPhaseRisk =
    phase.phaseType === 'planning'
      ? 'Design and implementation will guess scope, role boundaries, or workflow states.'
      : phase.phaseType === 'design'
        ? 'Implementation will invent missing states, fields, or edge-case behavior.'
        : phase.phaseType === 'implementation'
          ? 'Verification will not know which changed files, tests, or caveats to trust.'
          : phase.phaseType === 'verification'
            ? 'The next phase will treat unproven work as complete.'
            : 'The next builder will inherit an incomplete handoff and repeat work.';
  return `# HANDOFF_SUMMARY

## What this file is for
Use this file to leave a short summary for the next person or agent. The prefilled sections below show what this phase should produce and what risks it protects against. Replace the "pending" items with real outcomes before advancing.

## Phase goal
${phase.goal}

## Expected outputs from this phase
${phase.expectedOutputs.map((item) => `- ${item}`).join('\n')}
- Phase-type expectation: ${phase.phaseType} work for ${phase.name} should leave evidence that another builder can inspect without hidden chat context.

## Decisions that should be captured before moving on
${phase.reviewChecklist.slice(0, 4).map((item) => `- ${item}`).join('\n')}
- What changed in this phase compared to the previous plan
- Which assumptions were confirmed and which remain open
- Whether the scope stayed within the original v1 cut
- Which deliverable from this phase is ready for the next builder to trust as source of truth

## Likely files or artifacts touched
${phase.repoTargets.map((item) => `- ${item}`).join('\n')}

## Evidence that should be pasted here by the user or agent
${phase.evidenceExamples.map((item) => `- ${item}`).join('\n')}
- Screenshots or command output if this phase involved implementation
- Specific file paths and line numbers for any changes made
- Observed test results or inspection notes
- One sentence naming the exact artifact inspected first and what it proved

## Risks to carry forward
${phase.riskFocus.map((item) => `- ${item}`).join('\n')}

## Related support folders if this phase changed them
${renderSupportModuleLines(supportModules, 'No extra support folder needs carry-forward notes unless the phase changed scope, safety, integrations, or architecture.')}

## Next-phase risks if this phase is incomplete
- If decisions above are not recorded, the next phase will rebuild on hidden assumptions.
- If evidence is missing, the next builder cannot verify what was actually checked.
- If blockers are not documented, they will reappear later as expensive surprises.
- ${nextPhaseRisk}

## Blockers to record if they appear
${phase.failureConditions.map((item) => `- ${item}`).join('\n')}

## Examples of acceptable completion notes
- "Locked order states to created, acknowledged, in-progress, ready, picked-up, cancelled. Decision: no partial-pickup in v1."
- "Confirmed child users cannot view parent dashboard. Evidence: role matrix in PHASE_BRIEF.md lines 45-52."
- "Build passed. Changed files: src/orders.ts, src/kitchen-queue.ts. No new blockers."
- "Deferring multi-location support per scope cut. Documented in NEXT_PHASE_CONTEXT.md."
- "Reviewed Appointment Request and Reminder Plan fields against privacy-safe wording. Evidence: DATA_MODEL.md plus reminder note in PHASE_BRIEF.md."
- "Verified the phase deliverables are complete enough for ${phase.phaseType === 'verification' ? 'phase closure' : 'the next builder to continue without guessing'}."

## Completion update
- Phase outcome: ${phase.goal}
- Files or artifacts actually changed: ${phase.repoTargets.join(', ') || 'No repo targets defined yet'}
- Checks run and observed result: Review the exit criteria and evidence examples above
- Exit gate status: Entry criteria listed in ENTRY_GATE.md; exit criteria listed in EXIT_GATE.md
- Remaining blockers or warnings: ${phase.failureConditions.slice(0, 2).join('; ') || 'No specific blockers recorded yet'}
- Assumptions that still need confirmation: ${phase.inferredAssumptions.slice(0, 2).join('; ') || 'No inferred assumptions recorded yet'}
`;
}

function buildNextPhaseContext(phase: PhasePlan, nextPhase: PhasePlan | undefined, input: ProjectInput, context: ProjectContext) {
  const supportModules = getPhaseSupportModules(phase, input, context);
  const nextPhaseRisk =
    phase.phaseType === 'planning'
      ? 'The next phase will design around unstated scope cuts or hidden approval rules.'
      : phase.phaseType === 'design'
        ? 'The next phase will code missing workflow states, entities, or failure handling by guesswork.'
        : phase.phaseType === 'implementation'
          ? 'The next phase will verify the wrong files or miss important caveats from the current build.'
          : phase.phaseType === 'verification'
            ? 'The next phase will assume the work is proven even if the evidence is incomplete.'
            : 'The next builder will repeat discovery because the current phase did not leave enough context.';
  return `# NEXT_PHASE_CONTEXT

## What this file is for
This file helps the next phase start with the right context instead of guessing what happened earlier. It lists what the current phase should have produced, what must carry forward, and what risks appear if the current phase is incomplete.

## Current phase
${phase.name}

## ${nextPhase ? 'Next phase' : 'Final package recap'}
${nextPhase ? nextPhase.name : `This is the final phase for ${phase.name}.`}

## Expected deliverables from the current phase
${phase.expectedOutputs.map((item) => `- ${item}`).join('\n')}
- Current-phase completion bar: the deliverables above should exist in real files, notes, or test output before ${nextPhase ? nextPhase.name : 'final handoff'} begins.

## Decisions that should be captured before moving on
${phase.reviewChecklist.slice(0, 4).map((item) => `- ${item}`).join('\n')}
- Concrete scope cuts or deferrals made in this phase
- Any change to the original plan and why it was justified
- Which file or artifact now represents the latest source of truth for this phase

## Evidence that should be pasted by the user or agent
${phase.evidenceExamples.map((item) => `- ${item}`).join('\n')}
- Specific file paths, line numbers, or command output
- Screenshot references if UI or visual work was involved
- Observed test results with pass/fail status
- A short note that says what was inspected first and what conclusion it supported

## What the next phase should inherit
${listToBullets(phase.nextActions.concat(phase.reviewChecklist.slice(0, 2)), 'No additional context was generated for the next phase.')}

## What not to revisit
${phase.scopeGuards.map((item) => `- ${item}`).join('\n')}

## Unresolved assumptions
${phase.inferredAssumptions.map((item) => `- ${item}`).join('\n')}

## Risks or decisions to preserve
${phase.riskFocus.concat(phase.failureConditions.slice(0, 2)).map((item) => `- ${item}`).join('\n')}

## Support folders to carry forward only if touched
${renderSupportModuleLines(supportModules, 'No extra support folder needs carry-forward notes unless the phase changed scope, safety, integrations, or architecture.')}

## Next-phase risks if this phase is incomplete
- If deliverables above are missing, ${nextPhase ? nextPhase.name : 'the final handoff'} will be built on vague or hidden assumptions.
- If evidence is not recorded, the next builder cannot verify what was actually checked or decided.
- If blockers are not documented, they will resurface later as expensive rework.
- ${nextPhaseRisk}

## Concrete examples of acceptable completion notes
- "Phase locked the state machine to 5 states. Evidence: states.md lines 12-28. No blockers."
- "Confirmed budget thresholds per household discussion. Evidence: threshold table in PHASE_BRIEF.md."
- "Build passed. Changed files: src/components/OrderList.tsx, src/lib/kitchen.ts. Tests: 3 passed, 0 failed."
- "Blocked: cannot define data retention rules until compliance review completes. Documented in VERIFICATION_REPORT.md."
- "Expected deliverables complete: role matrix, order-state map, and exit-gate notes. Evidence pasted in TEST_RESULTS.md."
- "Decision captured before moving on: live reminder delivery stays mocked in v1. Risk if skipped: privacy-safe wording could drift."

${nextPhase
    ? `## What the next builder should request
- A short recap of what changed in this phase
- The files or artifacts touched, with specific paths
- The checks that passed or failed, with observed results
- Any blocker or warning that still matters before ${nextPhase.name}
- Confirmation that the expected deliverables for ${phase.name} are complete and reviewable`
    : `## Final release caveats
${phase.failureConditions.map((item) => `- ${item}`).join('\n')}

## Final package summary
${phase.expectedOutputs.map((item) => `- ${item}`).join('\n')}`}
`;
}

function buildVerifyPrompt(
  phase: PhasePlan,
  bundle: ProjectBundle,
  input: ProjectInput
) {
  const context = buildContext(input);
  const supportModules = getPhaseSupportModules(phase, input, context);
  const fileList = [
    `phases/${phase.slug}/PHASE_BRIEF.md`,
    `phases/${phase.slug}/ENTRY_GATE.md`,
    `phases/${phase.slug}/EXIT_GATE.md`,
    `phases/${phase.slug}/TEST_PLAN.md`,
    `phases/${phase.slug}/HANDOFF_SUMMARY.md`,
    `phases/${phase.slug}/VERIFICATION_REPORT.md`,
    `phases/${phase.slug}/EVIDENCE_CHECKLIST.md`,
    `repo/manifest.json`,
    `repo/mvp-builder-state.json`
  ].join('\n- ');

  return `# VERIFY_PROMPT for ${phase.name}

## What this file is for
Use this file to review whether ${input.productName} phase ${String(phase.index).padStart(2, '0')} (${phase.name}) is really ready to close. This prompt works with Codex, Claude Code, or OpenCode.

## What you should do now
1. Review the files listed below.
2. Check whether the phase goal and gates were met.
3. Use the results to fill out VERIFICATION_REPORT.md.
4. If you are unsure, leave the result or recommendation as pending.

## Files to inspect
- ${fileList}
- All changed implementation files for this phase
${context.uiRelevant ? '- /ui-ux/UI_UX_GATE.md\n- /ui-ux/SCREEN_INVENTORY.md\n- /ui-ux/USER_WORKFLOWS.md\n- Screenshot evidence for any changed UI screen' : '- If this phase introduced UI, inspect the lightweight /ui-ux/ files and screenshot evidence before passing.'}
${supportModules.length ? supportModules.map((module) => `- ${module.folder} because ${module.reason.toLowerCase()}`).join('\n') : ''}

## What evidence means
Evidence means files or notes that prove what was checked, what was observed, what changed, and what decision was made. Useful evidence usually includes changed files, command output, scenario results, specific artifacts reviewed, or blockers tied to this phase.

## Functional checks
- [ ] The phase work satisfies the goal: ${phase.goal}
- [ ] Entry gate criteria are met
- [ ] Exit gate criteria are met
- [ ] TEST_PLAN.md scenarios were reviewed and the observed result is recorded
- [ ] No new blockers were introduced

## Scope checks
- [ ] Work stays within ${phase.name} scope
- [ ] No unrelated phases were modified
- [ ] Must-have scope was not expanded without justification
- [ ] Non-goals and constraints are respected

## Local-first constraint checks
- [ ] No external service dependencies were added without explicit justification
- [ ] No auth, payments, database, or cloud backend requirements were introduced
- [ ] All files remain local and markdown-based

## UI and screenshot checks
- [ ] ${context.uiRelevant ? 'Changed interface screens match USER_WORKFLOWS.md and SCREEN_INVENTORY.md' : 'If UI work exists, the team activated the UI/UX module and documented the screens.'}
- [ ] ${context.uiRelevant ? 'Screenshot review happened before final testing' : 'If UI work exists, screenshot evidence was captured before passing.'}
- [ ] ${context.uiRelevant ? 'Core empty, loading, and error states exist for changed UI flows' : 'If UI work exists, empty, loading, and error states were reviewed.'}

## Markdown-first constraint checks
- [ ] All handoff files are readable markdown
- [ ] No binary or proprietary formats are required for review
- [ ] State and evidence are recorded in markdown or JSON, not hidden in chat history

## Agent-readability checks
- [ ] File names and headings are clear and consistent
- [ ] Cross-references between phase files are accurate
- [ ] The next builder can understand context without chat history

## Novice-user clarity checks
- [ ] Language is plain enough for a non-expert reviewer
- [ ] Technical jargon is explained or linked
- [ ] Checklists are concrete and actionable

## Regression risks
${phase.continuityChecks.map((item) => `- [ ] ${item}`).join('\n')}

## Final decision rules
- Set result to "pass" only if all functional checks, scope checks, and constraint checks pass.
- Set result to "fail" if any functional check or constraint check fails.
- Set recommendation to "proceed" only if result is "pass" and no unresolved blockers remain.
- Set recommendation to "revise" if result is "pass" but minor issues need cleanup.
- Set recommendation to "blocked" if result is "fail" or a critical blocker remains.

## Expected output
- A completed phases/${phase.slug}/VERIFICATION_REPORT.md
- A checked phases/${phase.slug}/EVIDENCE_CHECKLIST.md
- A clear recommendation: proceed, revise, or blocked
- ${context.uiRelevant ? 'A UI review outcome that is consistent with /ui-ux/UI_UX_GATE.md' : 'If UI work appeared, a lightweight UI review outcome before pass.'}
`;
}

function buildVerificationReport(phase: PhasePlan, input: ProjectInput) {
  const context = buildContext(input);
  const supportModules = getPhaseSupportModules(phase, input, context);
  return `# VERIFICATION_REPORT for ${phase.name}

## What this file is for
Use this file to record the review result for the current phase. Keep the required headers exactly as written so the package can read them correctly.

## What you should do now
- Fill in the sections below after reviewing the phase.
- If you are unsure, leave result or recommendation as pending.
- Do not select pass + proceed unless you can list real evidence files.
- Make the final decision sentence match the structured result and recommendation.

## result: pending
Allowed: pass | fail | pending

Selected result: pending

## recommendation: pending
Allowed: proceed | revise | blocked | pending

Selected recommendation: pending

## summary
-

## files reviewed
- phases/${phase.slug}/PHASE_BRIEF.md
- phases/${phase.slug}/ENTRY_GATE.md
- phases/${phase.slug}/EXIT_GATE.md
- phases/${phase.slug}/TEST_PLAN.md
- phases/${phase.slug}/HANDOFF_SUMMARY.md
- phases/${phase.slug}/EVIDENCE_CHECKLIST.md
- repo/manifest.json
- repo/mvp-builder-state.json
${supportModules.map((module) => `- ${module.folder}`).join('\n')}

## files changed
-

## commands run
-

## evidence files
Evidence means the files or notes that prove the phase was checked. List the evidence files you actually reviewed before selecting \`pass + proceed\`.

- pending
${context.uiRelevant ? 'Optional UI evidence note: if this phase changed interface work, replace `pending` with ui-ux/UI_UX_GATE.md and any screenshot evidence files.' : 'Optional UI evidence note: if this phase unexpectedly added a user-facing interface, replace `pending` with ui-ux/UI_UX_GATE.md and screenshot evidence files.'}

Rules:
- Replace \`pending\` with real evidence file paths.
- Do not select \`pass + proceed\` until the listed files exist and support the decision.

## warnings
-

## defects found
-

## follow-up actions
-

## final decision
Pending completion of all sections above. Update result and recommendation before marking complete.
`;
}

function buildEvidenceChecklist(phase: PhasePlan, input: ProjectInput) {
  const context = buildContext(input);
  const supportModules = getPhaseSupportModules(phase, input, context);
  return `# EVIDENCE_CHECKLIST for ${phase.name}

## What this file is for
Use this file to make sure the phase review includes enough proof before you try to advance.

## What evidence means
Evidence means the files or notes that prove the phase was checked. Real evidence is usually a combination of reviewed files, test output or scenario results, observed outcomes, decisions made, blockers found, and a completed handoff summary.

## What you should do now
- Check the items that are truly complete.
- Use this checklist while filling out VERIFICATION_REPORT.md.
- If key items are still missing, do not move to the next phase yet.

## Required evidence
- [ ] VERIFICATION_REPORT.md completed with result and recommendation
- [ ] HANDOFF_SUMMARY.md completion update filled with actual phase outcome
- [ ] At least one evidence file names a concrete scenario, command output, changed file, observed result, decision, or blocker
- [ ] The evidence references ${phase.domainSignals.slice(0, 3).join(', ') || 'the actual phase-specific nouns'} instead of generic filler
- [ ] ${context.uiRelevant ? 'Any changed interface work includes screenshot evidence plus a UI/UX review outcome' : 'If interface work was added, screenshot evidence and UI/UX review were added before passing'}
${supportModules.length ? supportModules.map((module) => `- [ ] ${module.folder} was reviewed if this phase touched ${module.reason.toLowerCase()}`).join('\n') : ''}

## Commands expected to run
${phase.phaseType === 'implementation'
    ? `- [ ] Phase-specific tests from TEST_PLAN.md
- [ ] Lint or typecheck if applicable
- [ ] Smoke test or regression check
- [ ] Build verification if build files exist`
    : `- [ ] Inspection or review steps from TEST_PLAN.md
- [ ] Scenario checks or artifact review notes
- [ ] Regression or continuity review if this phase depends on earlier outputs
- [ ] Explicit note if a command was not relevant for this planning phase`}

## Files expected to change
- [ ] phases/${phase.slug}/HANDOFF_SUMMARY.md
- [ ] phases/${phase.slug}/VERIFICATION_REPORT.md
- [ ] phases/${phase.slug}/NEXT_PHASE_CONTEXT.md
${phase.repoTargets.map((item) => `- [ ] ${item}`).join('\n')}

## Acceptable evidence
${phase.evidenceExamples.map((item) => `- ${item}`).join('\n')}
- Markdown verification report with explicit result and recommendation

## Unacceptable evidence
- Vague claims without file references
- Generic phrases like "looks good", "reviewed", "complete", or "ready to proceed" without concrete proof
- Chat history or informal notes
- Untested code
- Missing verification report
- Pending or incomplete recommendation

## Manual checks
- [ ] Reviewer read the phase brief and exit gate
- [ ] Reviewer inspected changed files
- [ ] Reviewer confirmed no scope creep
- [ ] Reviewer confirmed local-first and markdown-first constraints still hold
`;
}

function buildRootAgentStart(
  agentName: AgentName,
  input: ProjectInput,
  bundle: ProjectBundle,
  context: ProjectContext
) {
  const promptFile =
    agentName === 'Codex'
      ? 'CODEX_HANDOFF_PROMPT.md'
      : agentName === 'Claude Code'
        ? 'CLAUDE_HANDOFF_PROMPT.md'
        : 'OPENCODE_HANDOFF_PROMPT.md';
  const usageFile =
    agentName === 'Codex'
      ? '02_HOW_TO_USE_WITH_CODEX.md'
      : agentName === 'Claude Code'
        ? '03_HOW_TO_USE_WITH_CLAUDE_CODE.md'
        : '04_HOW_TO_USE_WITH_OPENCODE.md';
  const startFile =
    agentName === 'Codex' ? 'CODEX_START_HERE.md' : agentName === 'Claude Code' ? 'CLAUDE_START_HERE.md' : 'OPENCODE_START_HERE.md';

  return `# ${agentName.toUpperCase()} START HERE

## What this file is for
Open this file first if you want to use ${agentName} on this package. This file is mainly for the AI-agent working session, not for the novice business user overview.

## Package
${input.productName}

## Current package status
${bundle.lifecycleStatus}

## What this status means
${
  bundle.lifecycleStatus === 'Blocked'
    ? 'This package is still usable, but it is not ready to advance. Work the current phase, resolve the listed blockers, and only move forward after status and verification agree.'
    : bundle.lifecycleStatus === 'Draft'
      ? 'This package is usable for planning work, but it is not yet ready for formal approval or phase advancement.'
      : bundle.lifecycleStatus === 'ReviewReady'
        ? 'This package is ready for formal approval review, but it is not yet approved for build execution.'
        : 'This package has explicit approval metadata and is ready for build execution.'
}

## Read these first
1. BUSINESS_USER_START_HERE.md
2. CURRENT_STATUS.md
3. START_HERE.md
4. 00_PROJECT_CONTEXT.md
5. PROJECT_BRIEF.md
6. PHASE_PLAN.md

## Optional support files
1. 01_CONTEXT_RULES.md
2. ${usageFile}
3. 00_APPROVAL_GATE.md
4. repo/manifest.json
5. repo/mvp-builder-state.json
${agentName === 'OpenCode' ? `6. AGENTS.md
` : ''}

## Start with phase
Phase ${String(bundle.phases[0]?.index || 1).padStart(2, '0')} - ${bundle.phases[0]?.name || 'Initial phase'}

## What to paste into ${agentName}
Open COPY_PASTE_PROMPTS.md first if the user wants the simplified ordered prompts. Then open ${promptFile} and paste its prompt into ${agentName}. Give ${agentName} the files listed in that prompt.

## What you should do next
1. Open the current phase folder.
2. Give ${agentName} the matching phase files.
3. ${context.uiRelevant ? 'Open /ui-ux/UI_UX_START_HERE.md before building any interface screens and keep Screen and Workflow Review active during UI work.' : 'Use the lightweight /ui-ux/ folder only if a future phase adds a real interface.'}
4. Ask ${agentName} to stay inside the current phase only.
5. Run the Improve Until Good Enough Loop from /recursive-test/ only after a major build milestone. It improves quality; it does not replace normal regression tests.
6. Stop and verify before trying to advance.

## Expected result
- ${agentName} should restate the current phase, confirm the gate, work only within the current phase scope, run tests, and return a short handoff summary before you continue.

## Product-specific anchors
- Audience: ${context.primaryAudience}
- Must-have focus: ${context.primaryFeature}
- Desired output: ${context.outputAnchor}
`;
}

function buildPackageStartHere(bundle: ProjectBundle, input: ProjectInput) {
  const firstPhase = bundle.phases[0];
  const packageFolder = `./${bundle.exportRoot}`;
  const context = buildContext(input);
  const moduleEntries = getFriendlyModuleEntries(input, context);
  return `# START_HERE

## What this package is
This is a local, markdown-first MVP Builder workspace. It helps you plan, verify, hand off, and resume work without depending on hidden chat history.

## Important beginner note
You do not need to open every folder. Start with these three files and the current phase only.

## Open these files first
1. CURRENT_STATUS.md — see what stage you are in and what to do next.
2. STEP_BY_STEP_BUILD_GUIDE.md — follow Decide -> Plan -> Design -> Build -> Test -> Handoff.
3. COPY_PASTE_PROMPTS.md — copy the right prompt for your current stage.

## Current phase
Phase ${String(firstPhase?.index || 1).padStart(2, '0')} - ${firstPhase?.name || 'Initial phase'}

## Current package status
${bundle.lifecycleStatus}

## What the status means
${
  bundle.lifecycleStatus === 'Blocked'
    ? 'Blocked means the package still has planning blockers. You can still work the current phase, but do not advance until the blockers are resolved and status no longer shows blocked.'
    : bundle.lifecycleStatus === 'Draft'
      ? 'Draft means the package is still being shaped and should not be treated as build-ready yet.'
      : bundle.lifecycleStatus === 'ReviewReady'
        ? 'ReviewReady means the package is ready for human approval review, but not yet approved for build.'
        : 'ApprovedForBuild means the package has explicit approval metadata and no remaining blockers.'
}

## Key terms
- Entry gate: the checklist that must be true before you start work in a phase.
- Exit gate: the checklist that must be true before you call the phase complete.
- Evidence: the real files, test output, or notes you reviewed to justify your result and recommendation.
- Screen and Workflow Review: the beginner-friendly name for the UI/UX module.
- Improve Until Good Enough Loop: the beginner-friendly name for recursive testing.

## Simple workflow
1. Open CURRENT_STATUS.md.
2. Follow the next action in STEP_BY_STEP_BUILD_GUIDE.md.
3. Copy the matching prompt from COPY_PASTE_PROMPTS.md.
4. Work one phase at a time.
5. Run or follow TEST_SCRIPT.md before completing verification.
6. Record test results in TEST_RESULTS.md.
7. Run status and validate before trying to advance.
8. Run next-phase only after the report says pass + proceed and the package is no longer blocked.

## Extra modules you may need later
- Screen and Workflow Review (ui-ux/UI_UX_START_HERE.md): use before or during any interface work.
- Improve Until Good Enough Loop (recursive-test/RECURSIVE_TEST_START_HERE.md): use after a major build milestone when quality still needs pushing.
- ORCHESTRATOR_GUIDE.md: use when you want the local orchestrator to check gates, run commands, score the repo, and write recovery prompts.

## What you should do next
Open CURRENT_STATUS.md for the next action, then open STEP_BY_STEP_BUILD_GUIDE.md and COPY_PASTE_PROMPTS.md. If the package is blocked, fix the blocker before trying to advance.

## Friendly module names inside Decide and Plan
${moduleEntries
    .filter((entry) => ['Product Goal and Scope', 'What the App Must Do', 'Private Data and Safety Check', 'External Services and Setup', 'Technical Plan'].includes(entry.name))
    .map((entry) => `- ${entry.name}: ${entry.folder}`)
    .join('\n')}

## Commands to know
- From the folder that contains this workspace:
  - Check status: npm run status -- --package=${packageFolder}
  - Validate package files: npm run validate -- --package=${packageFolder}
  - Advance after verification: npm run next-phase -- --package=${packageFolder} --evidence=${packageFolder}/phases/${firstPhase?.slug || 'phase-01'}/VERIFICATION_REPORT.md
- If you are already inside this workspace folder:
  - Check status: npm run status -- --package=.
  - Validate package files: npm run validate -- --package=.
  - Advance after verification: npm run next-phase -- --package=. --evidence=phases/${firstPhase?.slug || 'phase-01'}/VERIFICATION_REPORT.md

QUICKSTART.md includes the same commands in one place.

## Resume and handoff
- Yes, you can resume later. repo/mvp-builder-state.json records the current phase and evidence details.
- Yes, you can hand off between Codex, Claude Code, and OpenCode. Use the same markdown files as the source of truth and start with the matching *_START_HERE.md file.

## Files for you vs files for the AI agent
- Business-user files: BUSINESS_USER_START_HERE.md, CURRENT_STATUS.md, STEP_BY_STEP_BUILD_GUIDE.md, COPY_PASTE_PROMPTS.md, MODULE_MAP.md, WHAT_TO_IGNORE_FOR_NOW.md, FINAL_CHECKLIST.md, ORCHESTRATOR_GUIDE.md
- Shared files: PROJECT_BRIEF.md, PHASE_PLAN.md, TESTING_STRATEGY.md, REGRESSION_TEST_PLAN.md, current phase files
- AI-agent files: CODEX_START_HERE.md, CLAUDE_START_HERE.md, OPENCODE_START_HERE.md, build prompt files, handoff prompt files
`;
}

function buildRootReadme(bundle: ProjectBundle, input: ProjectInput) {
  const context = buildContext(input);
  const moduleEntries = getFriendlyModuleEntries(input, context);
  return `# ${input.productName}

## What this package is
This is a local MVP Builder workspace. It is a markdown package that helps you plan the work, check each phase, record evidence, and hand the project between Codex, Claude Code, and OpenCode without relying on hidden chat history.

## Business-user shortcut
- Open BUSINESS_USER_START_HERE.md first.
- You do not need to open every folder.
- Use MODULE_MAP.md and WHAT_TO_IGNORE_FOR_NOW.md to stay focused on the current step.
- The AI agent uses the detailed support folders as guardrails. Most business users should stay in the guided journey.

## Open these files first
- [BUSINESS_USER_START_HERE.md](BUSINESS_USER_START_HERE.md)
- [START_HERE.md](START_HERE.md)
- [QUICKSTART.md](QUICKSTART.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [CURRENT_STATUS.md](CURRENT_STATUS.md)

## Main planning files
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md)
- [PHASE_PLAN.md](PHASE_PLAN.md)
- [00_APPROVAL_GATE.md](00_APPROVAL_GATE.md)
- [STEP_BY_STEP_BUILD_GUIDE.md](STEP_BY_STEP_BUILD_GUIDE.md)
- [COPY_PASTE_PROMPTS.md](COPY_PASTE_PROMPTS.md)
- [MODULE_MAP.md](MODULE_MAP.md)
- [FINAL_CHECKLIST.md](FINAL_CHECKLIST.md)
- [ORCHESTRATOR_GUIDE.md](ORCHESTRATOR_GUIDE.md)

## Decide and Plan support folders
- /product-strategy/ = Product Goal and Scope
- /requirements/ = What the App Must Do
- /security-risk/ = Private Data and Safety Check
- /integrations/ = External Services and Setup
- /architecture/ = Technical Plan

## Quality modules
- [ui-ux/UI_UX_START_HERE.md](ui-ux/UI_UX_START_HERE.md)${context.uiRelevant ? ' for Screen and Workflow Review before and during interface work.' : ' for lightweight future Screen and Workflow Review if a user-facing experience is added later.'}
- [recursive-test/RECURSIVE_TEST_START_HERE.md](recursive-test/RECURSIVE_TEST_START_HERE.md) for the Improve Until Good Enough Loop after major build completion.
- [ORCHESTRATOR_GUIDE.md](ORCHESTRATOR_GUIDE.md) for local orchestration, scoring, gate checks, and recovery prompts.

## Agent start files
- [CODEX_START_HERE.md](CODEX_START_HERE.md)
- [CLAUDE_START_HERE.md](CLAUDE_START_HERE.md)
- [OPENCODE_START_HERE.md](OPENCODE_START_HERE.md)

## Current package status
${bundle.lifecycleStatus}

## What you should do next
1. Read BUSINESS_USER_START_HERE.md for the big picture in plain English.
2. Open QUICKSTART.md for the exact commands.
3. ${context.uiRelevant ? 'Open the Screen and Workflow Review module before interface implementation and review screenshots before final testing.' : 'Keep the Screen and Workflow Review module available if a later phase adds interface work.'}
4. Open the current phase files before asking an agent to do any work.
`;
}

function buildOrchestratorGuide(bundle: ProjectBundle, input: ProjectInput) {
  const firstPhase = bundle.phases[0];
  return `# ORCHESTRATOR_GUIDE

## What this does
The MVP Builder Orchestrator is the local run loop that reads this workspace, checks phase evidence, runs local commands, writes prompt packets for focused agents, scores the repo from 0 to 100, and writes recovery guidance when a gate fails.

## What this does not do
- It does not call hosted agent APIs in v1.
- It does not fake agent execution.
- It does not replace human review.
- It does not add auth, a database, or a hosted backend.

## What it reads
- README.md
- START_HERE.md
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- SCORECARD.md
- CURRENT_STATUS.md
- TESTING_STRATEGY.md
- REGRESSION_TEST_PLAN.md
- the current phase folder

## Commands
- Dry run from the repo root: npm run orchestrate:dry-run
- Full loop from the repo root: npm run orchestrate -- --package=./${bundle.exportRoot} --target-score=95 --max-rounds=5
- Score only: npm run score -- --package=./${bundle.exportRoot}
- Gates only: npm run gates -- --package=./${bundle.exportRoot}
- Recovery only: npm run recover -- --package=./${bundle.exportRoot}

## What dry run means
- Dry run reads the package, writes reports, and checks command availability.
- Dry run does not execute the real build or test commands.
- A dry run can still pass structural gates while scoring below a full release-ready result.

## How scoring works
- The orchestrator scores objective fit, functional correctness, test and regression coverage, gate enforcement, artifact usefulness, beginner usability, handoff and recovery quality, and local-first compliance.
- Hard caps apply when tests are not run, build fails, fake evidence appears, pass headers contradict blocked body text, gates are bypassed, or the repo cannot build.

## How to read the verdict
- PASS = strong enough to proceed with confidence.
- CONDITIONAL PASS = useful and mostly healthy, but still needs follow-up.
- NEEDS FIXES = not blocked everywhere, but not good enough to treat as complete.
- FAIL = a gate failed or a hard cap sharply lowered the score.

## How gates work
- Entry gate checks whether the package is usable and phase 1 does not require a prior handoff.
- Build gate checks local commands and captured output.
- Evidence gate rejects fake or generic evidence and contradictory verification reports.
- Exit gate checks handoff quality, lifecycle consistency, and phase continuity.

## Recovery behavior
If a gate fails, the orchestrator writes:
- orchestrator/reports/RECOVERY_PLAN.md
- orchestrator/reports/NEXT_AGENT_PROMPT.md

## Where to inspect reports
- orchestrator/reports/OBJECTIVE_CRITERIA.md
- orchestrator/reports/OBJECTIVE_SCORECARD.md
- orchestrator/reports/GATE_RESULTS.md
- orchestrator/reports/TEST_RESULTS.md
- orchestrator/reports/FINAL_ORCHESTRATOR_REPORT.md
- orchestrator/runs/

## Best starting point
Start with Phase ${String(firstPhase?.index || 1).padStart(2, '0')} and keep the orchestrator reports beside your normal phase workflow.
`;
}

function buildBusinessUserStartHere(bundle: ProjectBundle, input: ProjectInput) {
  const context = buildContext(input);
  const firstPhase = bundle.phases[0];

  return `# BUSINESS_USER_START_HERE

## Open this first
If you are a business user, this is the first file to open.

## Good news
- You do not need to open every folder.
- You do not need to read every markdown file.
- You only need the guided files for the current step.
- The guided files are meant to stay in plain English.

## What to open in order
1. CURRENT_STATUS.md — see where you are and what to do next.
2. STEP_BY_STEP_BUILD_GUIDE.md — follow the six stages.
3. COPY_PASTE_PROMPTS.md — copy the right prompt for each stage.
4. MODULE_MAP.md — if you want to understand the folder structure.
5. WHAT_TO_IGNORE_FOR_NOW.md — if you feel overwhelmed.

## What these files are for
- For you: BUSINESS_USER_START_HERE.md, CURRENT_STATUS.md, STEP_BY_STEP_BUILD_GUIDE.md, COPY_PASTE_PROMPTS.md, WHAT_TO_IGNORE_FOR_NOW.md, FINAL_CHECKLIST.md, ORCHESTRATOR_GUIDE.md
- For both you and the AI agent: PROJECT_BRIEF.md, PHASE_PLAN.md, TESTING_STRATEGY.md, the current phase folder
- Mostly for the AI agent: CODEX_START_HERE.md, CLAUDE_START_HERE.md, OPENCODE_START_HERE.md, agent handoff prompts

## Answers to the common beginner questions
1. What do I open first?
- Open CURRENT_STATUS.md.

2. What do I do next?
- Follow the next action in CURRENT_STATUS.md and paste the matching prompt from COPY_PASTE_PROMPTS.md.

3. What should I ignore for now?
- Most folders outside the current phase and deep agent files. WHAT_TO_IGNORE_FOR_NOW.md spells this out.

4. Which files are for me vs. which files are for the AI agent?
- MODULE_MAP.md and the list above separate business-user files from agent-facing files.

5. When do I use Screen and Workflow Review?
- Use it before or during any screen, form, dashboard, portal, or other interface work.

6. When do I use the Improve Until Good Enough Loop?
- Use it after a major build milestone when normal testing passes but quality still needs to be pushed higher.

7. When do I stop and fix something?
- Stop when a gate fails, a required file is still pending, evidence is missing, screenshots are missing for UI work, tests fail, or the recommendation says revise or blocked.

8. When can I safely continue?
- Continue only when the current gate says pass, the recommendation says proceed, the evidence is real, and CURRENT_STATUS.md shows no blocker that still applies.

9. How do I know the project is done?
- The final checklist is complete, the final handoff is ready, the required tests pass, and the package can explain what was built and what remains deferred.

10. What score or gate result means pass or fail?
- Pass means the phase result is pass and the recommendation is proceed.
- Fail means the phase result is fail, blocked, revise, or still pending.
- The Improve Until Good Enough Loop targets 90/100 by default and does not allow PASS below that final gate.

## Current starting point
- Current phase: Phase ${String(firstPhase?.index || 1).padStart(2, '0')} - ${firstPhase?.name || 'Initial phase'}
- Current package status: ${bundle.lifecycleStatus}
- Primary audience: ${context.primaryAudience}
- Main focus: ${context.primaryFeature}

## Plain-English names used in this package
- Product Goal and Scope = Product strategy support folder used during Decide
- What the App Must Do = Requirements support folder used during Decide
- Private Data and Safety Check = Security-related checks used during Plan
- External Services and Setup = Integration-related checks used during Plan
- Technical Plan = Architecture support folder used during Plan
- Screen and Workflow Review = UI/UX module
- Improve Until Good Enough Loop = Recursive Test module
- Retest Previous Problems = Regression suite
`;
}

/**
 * Phase G G2 issue 2: builder-targeted entry point. BUSINESS_USER_START_HERE
 * is for human reviewers; this file is for an implementing coding agent.
 * Points at the actually-load-bearing files for building the app, in the order
 * an agent reads them: brief → personas → use-cases → workflows → screens →
 * schema → tests.
 */
function buildBuilderStartHere(bundle: ProjectBundle, input: ProjectInput, context: ProjectContext) {
  const hasResearch = Boolean(context.extractions);
  const hasScreens = hasResearch && Boolean(context.extractions!.screens && context.extractions!.screens.length);
  const hasDb = hasResearch && context.extractions!.entities.some((e) => e.fields.some((f) => f.dbType));
  const buildReadyLine =
    bundle.lifecycleStatus === 'BuildReady' || bundle.lifecycleStatus === 'ApprovedForBuild'
      ? 'This workspace is **BuildReady**. The 10 files below are sufficient to scaffold and deploy the app.'
      : `This workspace is in **${bundle.lifecycleStatus}** state. Read the 10 files below; if blockers exist they are listed in 00_PROJECT_CONTEXT.md.`;
  return `# BUILDER_START_HERE

## Who this file is for
You are a coding agent (Claude Code, Codex, OpenCode, Kimi, GLM) that has been pointed at this workspace and asked to build a runnable web app. This file tells you the 10 load-bearing files to open, in order.

## Status
${buildReadyLine}

## Read these in order

1. **PROJECT_BRIEF.md** — one-paragraph product brief and the must-have scope.
2. **product-strategy/USE_CASES.md** — 2-4 use cases per persona with happy / edge / failure / recovery paths.${hasResearch ? '' : ' *(generated only when research extractions exist — fall back to product-strategy/MVP_SCOPE.md.)*'}
3. **product-strategy/USER_PERSONAS.md** — actor-level personas with JTBDs.${hasResearch ? '' : ' *(same caveat.)*'}
4. **research/extracted/workflows.json** — workflows in dependency order. Build one route group + one page + one server action per workflow.id.${hasResearch ? '' : ' *(only present in research-driven workspaces.)*'}
5. **research/extracted/screens.json** — screen-level state contracts (sections, fields, actions).${hasScreens ? '' : ' *(emitted when research includes screens; fall back to ui-ux/SCREEN_INVENTORY.md.)*'}
6. **requirements/PER_SCREEN_REQUIREMENTS.md** — empty / loading / error / populated state contract per screen. Mandatory for every page component.${hasScreens ? '' : ' *(emitted when screens are researched.)*'}
7. **architecture/DATABASE_SCHEMA.sql** — Postgres-correct DDL. Drizzle / Prisma / direct SQL all consume it.${hasDb ? '' : ' *(only emitted when entity fields carry dbType metadata.)*'}
8. **architecture/DATABASE_SCHEMA.md** — readable index of tables, columns, FK relationships, PII flags.${hasDb ? '' : ' *(same caveat.)*'}
9. **research/extracted/testCases.json** — test cases per persona × workflow × screen. Generate Playwright suites from this.${hasResearch ? '' : ''}
10. **phases/<slug>/INTEGRATION_TESTS.md** — happy-path + failure-mode integration tests per phase.

## Then read the build recipe
Open \`docs/BUILD_RECIPE.md\` for the 9 mandatory build passes (stack pick → schema migration → auth wiring → workflow scaffolding → per-screen implementation → server-side validation enforcement → audit-log wiring → smoke + e2e tests → deploy + production smoke).

## What you can ignore
The top level of this workspace contains 60+ files for ceremony, gating, recovery, scoring, and human-review purposes. None of them are required to build the app. See \`archive/INDEX.md\` for the catalog. The 10 files above plus \`docs/BUILD_RECIPE.md\` are sufficient.

## Validation rules to enforce server-side (not just in UI)
The recipe-generated workspace declares validation behaviors a real builder must enforce at the API / server-action layer (the UI alone is not enough — a malicious client can bypass). See PER_SCREEN_REQUIREMENTS.md for the canonical list per screen. Common patterns:
- Minimum-length checks on free-text inputs (e.g. 20-char minimum on research notes)
- Domain reject patterns (malformed email / URL → reject)
- Opt-out keyword scans on inbound text
- Territory / ownership conflict blocks at write time
- Consent-gate enforcement before persistence

## Audit log wiring
Every state-changing route must write the audit entry the workspace declares (see entity entries with eventType enumValues). Server-side, not client-side.

## Project anchors
- Product: ${input.productName}
- Primary audience: ${context.primaryAudience}
- Problem statement: ${input.problemStatement}
- Must-have scope: ${context.mustHaves.join(', ') || 'see PROJECT_BRIEF.md'}
`;
}

/**
 * Phase G G2 issue 1: catalog the ceremony / gate / recovery / scoring files
 * at the workspace top level so a builder agent can skip them. Files
 * themselves still live at top level (smoke-test asserts their paths) — this
 * file is the index that points away from the noise.
 */
function buildArchiveIndex(bundle: ProjectBundle) {
  return `# archive — ceremony files index

## What this file is for
The workspace top level contains 60+ files. Many of them are ceremony, gating, recovery, or scoring artifacts that are required for the mvp-builder lifecycle but are NOT load-bearing for an implementing coding agent. This file lists them so you can skip them.

## How to use this index
- Coding agent that needs to BUILD the app: open \`BUILDER_START_HERE.md\` for the 10 canonical files. Skip everything in the lists below.
- Human reviewer that needs to APPROVE the package: open \`BUSINESS_USER_START_HERE.md\` and \`00_APPROVAL_GATE.md\`. The lists below are the underlying evidence files.

## Final / handoff reports (snapshot at lifecycle close)
- FINAL_RELEASE_REPORT.md
- FINAL_HANDOFF.md
- FINAL_GATE_REPORT.md
- FINAL_SCORECARD.md
- FINAL_RECOVERY_SUMMARY.md
- FINAL_DEPLOYMENT_STATUS.md

## Approval / gating
- 00_APPROVAL_GATE.md
- HANDOFF.md
- PRODUCTION_GATE.md
- RELEASE_CHECKLIST.md
- PRODUCTION_READINESS_CHECKLIST.md

## Recursive testing / improvement loop
- recursive-test/* (all files)
- auto-improve/* (all files)

## Operational runbooks (only relevant once deployed)
- OPERATIONS_RUNBOOK.md
- INCIDENT_RESPONSE_GUIDE.md
- ROLLBACK_PLAN.md
- DEPLOYMENT_PLAN.md
- ENVIRONMENT_SETUP.md

## Beginner-business companion files
- CURRENT_STATUS.md
- COPY_PASTE_PROMPTS.md
- MODULE_MAP.md
- WHAT_TO_IGNORE_FOR_NOW.md
- STEP_BY_STEP_BUILD_GUIDE.md
- ORCHESTRATOR_GUIDE.md
- TROUBLESHOOTING.md

## Why these are not deleted
The mvp-builder validator and smoke test assert these paths exist. They are evidence files for the lifecycle audit. Skipping them is correct for build agents; deleting them would break the validator.

## Lifecycle at archive time
${bundle.lifecycleStatus}
`;
}

function buildModuleMap(input: ProjectInput, context: ProjectContext) {
  const moduleEntries = getFriendlyModuleEntries(input, context);
  const byStatus = (status: string) => moduleEntries.filter((entry) => entry.status === status);
  return `# MODULE_MAP

## How to use this file
Use this map when you want to know what is required now, what is helpful later, and what you can safely ignore for now.

## Required
${byStatus('Required').map((entry) => `- ${entry.name} (${entry.folder}): ${entry.reason}`).join('\n')}

## Recommended
${byStatus('Recommended').map((entry) => `- ${entry.name} (${entry.folder}): ${entry.reason}`).join('\n') || '- No recommended-only modules were inferred.'}

## Optional
${byStatus('Optional').map((entry) => `- ${entry.name} (${entry.folder}): ${entry.reason}`).join('\n') || '- No optional modules were inferred.'}

## Not needed now
- Hosted UI: specifically out of scope for the current MVP.
- Database: specifically out of scope for the current MVP.
- Auth: specifically out of scope for the current MVP.
- Analytics, deployment, operations, demo, and compliance modules: not needed now.
- Past or future phase folders you are not currently working.

## Guided files first
- BUSINESS_USER_START_HERE.md: first file for a novice business user
- CURRENT_STATUS.md: current stage, gate, next action, blockers, and score target
- STEP_BY_STEP_BUILD_GUIDE.md: the full guided workflow from Decide to Handoff
- COPY_PASTE_PROMPTS.md: main prompts in order
- START_HERE.md: package overview and command references
- WHAT_TO_IGNORE_FOR_NOW.md: helps reduce overwhelm
- FINAL_CHECKLIST.md: plain-English done check
- PROJECT_BRIEF.md and PHASE_PLAN.md: shared context for both you and the AI agent

## File audience guide
- Business-user first: BUSINESS_USER_START_HERE.md, CURRENT_STATUS.md, STEP_BY_STEP_BUILD_GUIDE.md, COPY_PASTE_PROMPTS.md, MODULE_MAP.md, WHAT_TO_IGNORE_FOR_NOW.md, FINAL_CHECKLIST.md
- Shared with the AI agent: PROJECT_BRIEF.md, PHASE_PLAN.md, TESTING_STRATEGY.md, current phase packet, the Decide and Plan support folders when relevant, Screen and Workflow Review files, Improve Until Good Enough Loop files
- AI-agent first: CODEX_START_HERE.md, CLAUDE_START_HERE.md, OPENCODE_START_HERE.md, phase build prompts, agent handoff prompts
`;
}

function buildWhatToIgnoreForNow(bundle: ProjectBundle, input: ProjectInput, context: ProjectContext) {
  const laterPhases = bundle.phases.slice(1).map((phase) => `- phases/${phase.slug}/ until Phase ${String(phase.index).padStart(2, '0')} becomes current`).join('\n');

  return `# WHAT_TO_IGNORE_FOR_NOW

## Why this file exists
Novice users often assume they need to open everything. You do not.

## Safe to ignore right now
- Most folders outside the current phase
- The deeper Decide and Plan support folders unless the guide or prompt tells you to use them
- Deep regression-suite scripts until you are testing
- Agent-specific prompt files until you are about to paste one into an AI tool
- repo/manifest.json and repo/mvp-builder-state.json unless someone asks for technical debugging
${context.uiRelevant ? '- Screen and Workflow Review details that are not needed for the current build step once the current UI question is answered' : '- The full Screen and Workflow Review folder unless a real interface appears'}
- The Improve Until Good Enough Loop until a major build milestone is complete

## Usually ignore these until later
${laterPhases || '- No later phases exist yet.'}

## Open these instead
1. CURRENT_STATUS.md
2. STEP_BY_STEP_BUILD_GUIDE.md
3. COPY_PASTE_PROMPTS.md
4. PROJECT_BRIEF.md
5. The current phase folder

## Stop ignoring these when
- Product direction is fuzzy or the MVP keeps growing
- Then open /product-strategy/ and /requirements/.
- A phase touches private data, safety, external services, or technical boundaries
- Then open /security-risk/, /integrations/, or /architecture/ as directed by the phase packet.
- A screen, form, dashboard, or workflow needs review
${context.uiRelevant ? '- Then open ui-ux/UI_UX_START_HERE.md for Screen and Workflow Review.' : '- Then open ui-ux/UI_UX_START_HERE.md and activate Screen and Workflow Review.'}
- A major build milestone is complete and quality still feels shaky
- Then open recursive-test/RECURSIVE_TEST_START_HERE.md for the Improve Until Good Enough Loop.
- A test fails or a gate says blocked
- Then open the exact gate, test, or verification file named in CURRENT_STATUS.md or status output.
`;
}

function buildCurrentStatus(bundle: ProjectBundle, input: ProjectInput, context: ProjectContext) {
  const firstPhase = bundle.phases[0];
  const blockerLines = bundle.blockingWarnings.slice(0, 5).map((warning) => `- ${warning.title}: ${warning.message}`).join('\n');

  return `# CURRENT_STATUS

## Current stage
- Decide

## Current phase
- Phase ${String(firstPhase?.index || 1).padStart(2, '0')} - ${firstPhase?.name || 'Initial phase'}

## Current gate
- Entry gate for the current phase

## Next action
- Read PROJECT_BRIEF.md and STEP_BY_STEP_BUILD_GUIDE.md, then paste the Decide prompt from COPY_PASTE_PROMPTS.md.
- In Decide, confirm Product Goal and Scope plus What the App Must Do before trying to plan the build.

## Known blockers
${blockerLines || '- No blocking warnings recorded at generation time.'}

## Quality score target
- Package readiness target: clear pass + proceed evidence for each phase
- Improve Until Good Enough Loop target after major build completion: 90/100

## Screen and Workflow Review
- ${context.uiRelevant ? 'Expected during design and interface build work.' : 'Not needed now unless interface work appears.'}

## Decide and Plan support folders
- Decide uses Product Goal and Scope plus What the App Must Do.
- Plan uses Technical Plan, Private Data and Safety Check, and External Services and Setup only when relevant.

## Improve Until Good Enough Loop
- Has recursive testing run yet? No
- Run it only after a major build milestone and after normal testing plus Retest Previous Problems.

## Safe continue rule
- Continue only when the current gate is satisfied, required evidence exists, and the recommendation is proceed.

## Safe stop rule
- Stop when a test fails, a gate says blocked, a key file still says pending, or evidence is weak.

## Helpful command
- Check live package status any time with \`npm run status -- --package=.\`
`;
}

function buildCopyPastePrompts(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  const firstPhase = bundle.phases[0];

  return `# COPY_PASTE_PROMPTS

## How to use this file
These are the main prompts in order. Use them so you do not have to hunt through folders.

## 1. Decide
\`\`\`text
Read BUSINESS_USER_START_HERE.md, CURRENT_STATUS.md, PROJECT_BRIEF.md, QUESTIONNAIRE.md, and PLAN_CRITIQUE.md.
Tell me in plain English:
1. what this project is trying to do
2. what I should decide now
3. what I can ignore for now
4. whether the idea is clear enough to continue
5. what blockers or unanswered questions must be fixed first
\`\`\`

### Confirm Product Goal and Scope
\`\`\`text
Read product-strategy/PRODUCT_NORTH_STAR.md, product-strategy/MVP_SCOPE.md, product-strategy/OUT_OF_SCOPE.md, and product-strategy/PRODUCT_STRATEGY_GATE.md.
Use evidence from those files only.
Tell me:
1. the plain-English product goal
2. who the target user is
3. what stays in the MVP
4. what is explicitly out of scope
5. whether the evidence is strong enough to continue
Refuse to proceed if the target user, MVP scope, out-of-scope list, or success criteria are missing or contradictory.
\`\`\`

### Confirm What the App Must Do
\`\`\`text
Read requirements/FUNCTIONAL_REQUIREMENTS.md, requirements/NON_FUNCTIONAL_REQUIREMENTS.md, requirements/ACCEPTANCE_CRITERIA.md, and requirements/REQUIREMENTS_GATE.md.
Use evidence from those files only.
Tell me:
1. the core workflow requirements
2. the important non-functional expectations
3. the acceptance checks that must pass
4. the open questions blocking build work
5. whether the requirements are clear enough to continue
Refuse to proceed if acceptance criteria are missing, generic, contradictory, or not testable.
\`\`\`

## 2. Plan
\`\`\`text
Read PROJECT_BRIEF.md, PHASE_PLAN.md, SCORECARD.md, and 00_APPROVAL_GATE.md.
Turn this into a simple plan for a novice business user:
1. what happens first
2. what happens next
3. where I must stop for approval or evidence
4. what counts as pass or fail
5. what the next safe action is
\`\`\`

### Review Technical Plan
\`\`\`text
Read architecture/SYSTEM_OVERVIEW.md, architecture/DATA_MODEL.md, architecture/API_CONTRACTS.md, architecture/STATE_MANAGEMENT.md, and architecture/ARCHITECTURE_GATE.md.
Use evidence from those files only.
Summarize the technical plan in plain English and tell me whether it is small enough for the MVP.
Refuse to proceed if API boundaries are unclear, state handling is missing, the data model is missing for a data-heavy project, or the architecture is more complex than the MVP requires.
\`\`\`

### Review Private Data and Safety
\`\`\`text
Read security-risk/DATA_CLASSIFICATION.md, security-risk/SECRET_MANAGEMENT.md, security-risk/PRIVACY_RISK_REVIEW.md, security-risk/AUTHORIZATION_REVIEW.md, and security-risk/SECURITY_GATE.md.
Use evidence from those files only.
Tell me the main private-data, secret, permission, and dependency risks in plain English.
Refuse to proceed if roles are unclear, private data has no clear purpose, secrets are not handled safely, or expert review is clearly needed and not flagged.
\`\`\`

### Review External Services and Setup
\`\`\`text
Read integrations/EXTERNAL_SERVICES.md, integrations/API_KEYS_AND_SECRETS.md, integrations/ENVIRONMENT_VARIABLES.md, integrations/MOCKING_STRATEGY.md, integrations/INTEGRATION_TEST_PLAN.md, and integrations/INTEGRATION_GATE.md.
Use evidence from those files only.
Tell me which outside services are truly required now, what can stay mocked, and what setup a builder needs.
Refuse to proceed if required services are unclear, environment variables are undocumented, the app cannot run locally without an unavailable service, or mock strategy is missing.
\`\`\`

## 3. Design
\`\`\`text
Read the current phase folder, especially PHASE_BRIEF.md and TEST_PLAN.md.
${context.uiRelevant ? 'Also read ui-ux/UI_UX_START_HERE.md, USER_WORKFLOWS.md, and SCREEN_INVENTORY.md for Screen and Workflow Review.' : 'If interface work appears, also activate ui-ux/UI_UX_START_HERE.md for Screen and Workflow Review.'}
Restate the design in plain English, list the user workflow, list missing states or risks, and tell me what must be true before building starts.
\`\`\`

## 4. Build
\`\`\`text
Read ${firstPhase ? `phases/${firstPhase.slug}/PHASE_BRIEF.md` : 'the current phase PHASE_BRIEF.md'}, ${firstPhase ? `phases/${firstPhase.slug}/TEST_PLAN.md` : 'the current phase TEST_PLAN.md'}, and ${firstPhase ? `phases/${firstPhase.slug}/CODEX_BUILD_PROMPT.md` : 'the current phase build prompt'}.
Implement only the current phase scope.
Do not skip gates, do not expand scope, and tell me which files changed.
\`\`\`

## 5. Test
\`\`\`text
Read TESTING_STRATEGY.md, ${firstPhase ? `phases/${firstPhase.slug}/TEST_SCRIPT.md` : 'the current phase TEST_SCRIPT.md'}, ${firstPhase ? `phases/${firstPhase.slug}/TEST_RESULTS.md` : 'the current phase TEST_RESULTS.md'}, and regression-suite/RUN_REGRESSION.md.
${context.uiRelevant ? 'If UI changed, also run Screen and Workflow Review with ui-ux/SCREENSHOT_REVIEW_PROMPT.md and ui-ux/UI_UX_GATE.md.' : 'If UI appeared, also activate Screen and Workflow Review.'}
Tell me what passed, what failed, what evidence exists, when I must stop, and when I can safely continue.
\`\`\`

## 6. Handoff
\`\`\`text
Read VERIFICATION_REPORT.md, EVIDENCE_CHECKLIST.md, HANDOFF_SUMMARY.md, NEXT_PHASE_CONTEXT.md, CURRENT_STATUS.md, and FINAL_CHECKLIST.md.
Tell me:
1. whether this phase is pass or fail
2. whether the recommendation is proceed, revise, or blocked
3. what the next person needs to know
4. whether the package is ready to continue
5. whether the project is done or still has deferred work
\`\`\`

## 7. Improve Until Good Enough Loop
\`\`\`text
After a major build milestone, read recursive-test/RECURSIVE_TEST_START_HERE.md, recursive-test/RECURSIVE_TEST_PROMPT.md, recursive-test/SCORING_RUBRIC.md, and recursive-test/RECURSIVE_TEST_REPORT.md.
Run the Improve Until Good Enough Loop.
Score each use case from 0 to 100, fix root causes, rerun tests, and stop only when the overall score is at least 90 or a clear blocker remains.
\`\`\`
`;
}

function buildFinalChecklist(bundle: ProjectBundle, input: ProjectInput, context: ProjectContext) {
  return `# FINAL_CHECKLIST

## Before you call this project done
- [ ] I know what the app is supposed to do.
- [ ] Product Goal and Scope and What the App Must Do are still consistent with the final result.
- [ ] The current phase says pass.
- [ ] The recommendation says proceed.
- [ ] The evidence files are real and not still pending.
- [ ] The tests were actually run and recorded.
- [ ] Retest Previous Problems was run.
- [ ] ${context.uiRelevant ? 'Screen and Workflow Review was completed for UI work.' : 'If UI was added, Screen and Workflow Review was completed.'}
- [ ] The Improve Until Good Enough Loop was run if major quality improvements were needed.
- [ ] I can explain which files are for me and which are for the AI agent.
- [ ] I can explain what was deferred on purpose.
- [ ] I know the next safe step.

## Done means
- The package is understandable by a new person.
- The gates and evidence agree.
- The project can continue without hidden chat context.
- The handoff is honest about what is complete, what is deferred, and what still needs care.

## Do not call it done if
- A key file still says pending.
- A gate says blocked or revise.
- Test evidence is weak or missing.
- The package feels understandable only if someone explains it in chat.
`;
}

function buildPackageQuickstart(bundle: ProjectBundle, input: ProjectInput) {
  const firstPhase = bundle.phases[0];
  const packageFolder = `./${bundle.exportRoot}`;
  const context = buildContext(input);

  return `# QUICKSTART

## What this file is for
Use this file when you want the shortest path from package creation to phase work.

## If you are in the folder that contains this workspace
- Check status: \`npm run status -- --package=${packageFolder}\`
- Validate the package: \`npm run validate -- --package=${packageFolder}\`
- Advance after verification: \`npm run next-phase -- --package=${packageFolder} --evidence=${packageFolder}/phases/${firstPhase?.slug || 'phase-01'}/VERIFICATION_REPORT.md\`

## If you are already inside this workspace folder
- Check status: \`npm run status -- --package=.\`
- Validate the package: \`npm run validate -- --package=.\`
- Advance after verification: \`npm run next-phase -- --package=. --evidence=phases/${firstPhase?.slug || 'phase-01'}/VERIFICATION_REPORT.md\`

## Open these files first
1. START_HERE.md
2. CURRENT_STATUS.md
3. PROJECT_BRIEF.md
4. PHASE_PLAN.md

## What you should do next
1. Read the current phase brief.
2. ${context.uiRelevant ? 'If you are building UI, define workflows and screens before writing interface code and capture screenshots during the build.' : 'If a future phase adds UI, stop and use the UI/UX folder before coding it.'}
3. Give the matching phase files to your coding agent.
4. Use recursive testing only after a major build milestone, not as a substitute for phase verification or regression testing.
5. Stop and fill out verification before trying to advance.
`;
}

function buildPackageTroubleshooting() {
  return `# TROUBLESHOOTING

## What this file is for
Use this file when status, validate, or next-phase gives you a result you do not understand.

## Common status words
- pending: the review is not finished yet.
- pass: the phase review says the work met the checks.
- fail: the phase review says something important is still wrong.
- proceed: the reviewer says the phase can move forward.
- revise: the phase mostly works, but you should fix issues before moving on.
- blocked: the package or phase still has an issue that must be resolved before advancement.

## What "blocked" means
Blocked does not mean the package is useless. It means you should stop trying to advance, review the blocker, and fix or document it first.

## If validate fails
- Read the exact file name in the error message.
- Fix the missing file, malformed report value, or weak evidence it names.
- Run validate again after saving the file.

## If next-phase refuses to advance
- Check VERIFICATION_REPORT.md.
- Make sure result is \`pass\`.
- Make sure recommendation is \`proceed\`.
- Make sure ## evidence files lists real files with meaningful content.
- Make sure status no longer says the package is blocked.

## If evidence is the problem
- Evidence means the files or notes that prove the phase was really checked.
- Default template files with empty checklists or placeholder text do not count yet.
- Comment-only files do not count.
- Add real notes, test output, changed file references, or completed handoff details before selecting \`pass + proceed\`.
`;
}

function buildStepByStepGuide(
  bundle: ProjectBundle,
  input: ProjectInput,
  context: ProjectContext,
  statusSummary: string,
  assumptionsAndQuestions: { assumptions: string[]; openQuestions: string[] },
  modeGuideIntro: string
) {
  const firstPhase = bundle.phases[0];
  const phasePath = `phases/${firstPhase?.slug || 'phase-01'}`;

  return `# STEP_BY_STEP_BUILD_GUIDE

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## What this guide is for
This is the main guided workflow for a novice business user. Follow these six stages in order. You do not need to open every folder.

## Important note about the extra folders
- The AI agent uses /product-strategy/, /requirements/, /security-risk/, /integrations/, and /architecture/ as guardrails.
- You do not need to open every one of those folders by default.
- In the beginner journey, they are grouped into Decide and Plan.

## Mode-specific guidance
${modeGuideIntro}

## Before you start
- Open CURRENT_STATUS.md to see the current stage and next action.
- Open COPY_PASTE_PROMPTS.md so you can paste the right prompt without hunting for files.
- Open WHAT_TO_IGNORE_FOR_NOW.md so you stay focused on the current step.

## 1. Decide
### What this stage means
Decide whether the idea is clear enough to move forward and what should stay in the first version.

### What the user does
- Read BUSINESS_USER_START_HERE.md, PROJECT_BRIEF.md, QUESTIONNAIRE.md, and PLAN_CRITIQUE.md.
- Confirm what the app must do, what it must not do, and what still feels unclear.
- Confirm Product Goal and Scope in /product-strategy/.
- Confirm What the App Must Do in /requirements/.

### What prompt to paste
- Use the Decide prompt in COPY_PASTE_PROMPTS.md.

### What file gets updated
- PROJECT_BRIEF.md
- QUESTIONNAIRE.md
- PLAN_CRITIQUE.md if follow-up questions are answered
- /product-strategy/ files
- /requirements/ files

### What evidence is required
- Clear answers to the key project questions
- No hidden assumptions about scope or audience
- A visible MVP scope and out-of-scope list
- Acceptance criteria that can actually be tested

### When to stop
- Stop if the idea is still vague, blockers are unresolved, or the first version keeps expanding.

### When to continue
- Continue when the project goal, audience, scope cut, and biggest risks are understandable in plain English.

## 2. Plan
### What this stage means
Turn the idea into a realistic path with phases, gates, and clear pass or fail decisions.

### What the user does
- Read PHASE_PLAN.md, SCORECARD.md, and 00_APPROVAL_GATE.md.
- Confirm the order of work, the main gates, and what would block progress.
- Use Technical Plan in /architecture/ to make sure the build path is simple enough for the MVP.
- Use Private Data and Safety Check in /security-risk/ if the project touches private data, roles, trust, or permissions.
- Use External Services and Setup in /integrations/ if the project needs outside services, API keys, webhooks, or mocks.

### What prompt to paste
- Use the Plan prompt in COPY_PASTE_PROMPTS.md.

### What file gets updated
- PHASE_PLAN.md
- SCORECARD.md
- 00_APPROVAL_GATE.md
- /architecture/ files when technical boundaries need clarification
- /security-risk/ files when data, roles, or secrets matter
- /integrations/ files when external services or setup matter

### What evidence is required
- A phase order that makes sense
- Blockers and risks named clearly
- Pass or fail logic that is visible
- Technical plan stays smaller than the MVP
- Safety and integration setup are explicit when relevant

### When to stop
- Stop if the plan skips gates, hides risks, or asks the team to build before the problem is understood.

### When to continue
- Continue when the phase order, gate logic, and next safe step are clear.

## 3. Design
### What this stage means
Describe how the product should work before building the current phase.

### What the user does
- Read ${phasePath}/PHASE_BRIEF.md and ${phasePath}/TEST_PLAN.md.
- ${context.uiRelevant ? 'Use Screen and Workflow Review by opening ui-ux/UI_UX_START_HERE.md, USER_WORKFLOWS.md, and SCREEN_INVENTORY.md.' : 'If screens or forms appear, activate Screen and Workflow Review before continuing.'}

### What prompt to paste
- Use the Design prompt in COPY_PASTE_PROMPTS.md.

### What file gets updated
- ${phasePath}/PHASE_BRIEF.md
- ${phasePath}/TEST_PLAN.md
${context.uiRelevant ? `- ui-ux/USER_WORKFLOWS.md
- ui-ux/SCREEN_INVENTORY.md` : `- ui-ux/USER_WORKFLOWS.md only if interface work appears
- ui-ux/SCREEN_INVENTORY.md only if interface work appears`}

### What evidence is required
- A workflow that makes sense
- Clear states, edge cases, and success conditions
- ${context.uiRelevant ? 'Screen and workflow evidence for user-facing work' : 'A clear reason if no interface review is needed yet'}

### When to stop
- Stop if the workflow is confusing, the screens are missing key states, or the build would require guessing.

### When to continue
- Continue when the design is concrete enough that the builder can work without hidden chat context.

## 4. Build
### What this stage means
Implement only the current phase scope.

### What the user does
- Give the current phase packet to the AI agent.
- Keep the work inside the phase boundary.
- Make sure changed files are captured in the handoff.

### What prompt to paste
- Use the Build prompt in COPY_PASTE_PROMPTS.md or the current phase build prompt file.

### What file gets updated
- ${phasePath}/CODEX_BUILD_PROMPT.md, ${phasePath}/CLAUDE_BUILD_PROMPT.md, or ${phasePath}/OPENCODE_BUILD_PROMPT.md
- ${phasePath}/HANDOFF_SUMMARY.md
- The actual repo files being changed

### What evidence is required
- Real changed files
- A build or implementation result tied to the current phase
- A handoff that says what changed

### When to stop
- Stop if the AI agent expands scope, skips required files, or changes things outside the current phase without justification.

### When to continue
- Continue when the current phase deliverables exist and the work can be tested.

## 5. Test
### What this stage means
Prove the work actually works and is safe to move forward.

### What the user does
- Run or follow ${phasePath}/TEST_SCRIPT.md.
- Record results in ${phasePath}/TEST_RESULTS.md.
- Run Retest Previous Problems from regression-suite/RUN_REGRESSION.md.
- ${context.uiRelevant ? 'If UI changed, run Screen and Workflow Review with screenshots and complete ui-ux/UI_UX_GATE.md.' : 'If UI appeared, stop and run Screen and Workflow Review before broader testing.'}
- After a major build milestone, run the Improve Until Good Enough Loop from recursive-test/ only if quality still needs to be pushed higher.

### What prompt to paste
- Use the Test prompt in COPY_PASTE_PROMPTS.md.

### What file gets updated
- ${phasePath}/TEST_RESULTS.md
- ${phasePath}/VERIFICATION_REPORT.md
- ${phasePath}/EVIDENCE_CHECKLIST.md
- regression-suite/REGRESSION_RESULTS_TEMPLATE.md
${context.uiRelevant ? '- ui-ux/UI_UX_HANDOFF.md and ui-ux/UI_UX_GATE.md' : '- ui-ux/UI_UX_HANDOFF.md and ui-ux/UI_UX_GATE.md if interface work appears'}
- recursive-test/ITERATION_LOG.md and recursive-test/RECURSIVE_TEST_REPORT.md when recursive testing runs

### What evidence is required
- Real test results
- Real file references
- Screenshot evidence for UI work
- Regression evidence
- A clear gate decision

### When to stop
- Stop if tests fail, evidence is weak, screenshots are missing for UI work, or the recommendation says revise or blocked.

### When to continue
- Continue when tests pass, evidence is real, the phase result is pass, and the recommendation is proceed.

## 6. Handoff
### What this stage means
Package the truth so another person or AI agent can continue safely.

### What the user does
- Read VERIFICATION_REPORT.md, HANDOFF_SUMMARY.md, NEXT_PHASE_CONTEXT.md, CURRENT_STATUS.md, and FINAL_CHECKLIST.md.
- Make sure the next builder can see what passed, what failed, what is deferred, and what to do next.

### What prompt to paste
- Use the Handoff prompt in COPY_PASTE_PROMPTS.md.

### What file gets updated
- ${phasePath}/HANDOFF_SUMMARY.md
- ${phasePath}/NEXT_PHASE_CONTEXT.md
- FINAL_CHECKLIST.md
- CURRENT_STATUS.md if you are manually maintaining the beginner summary

### What evidence is required
- Final recommendation
- Honest list of remaining blockers or deferrals
- Clear next action for the next builder

### When to stop
- Stop if the handoff hides risk, skips evidence, or says the project is done when key work is still pending.

### When to continue
- Continue to the next phase only when the current handoff is complete. Call the project done only when FINAL_CHECKLIST.md is honestly complete.

## UI/UX review timing
- Use Screen and Workflow Review before and during interface implementation.
- Run screenshot review before broader testing.
- Do not skip UI_UX_GATE.md for UI work.

## Recursive testing timing
- Run the Improve Until Good Enough Loop after a major build completion or other major milestone.
- Use /recursive-test/ as a quality-improvement loop after normal phase testing and Retest Previous Problems.
- Do not treat recursive testing as a single command or as a replacement for the regression suite.

## How to know pass or fail
- Safe pass: TEST_RESULTS.md is complete, VERIFICATION_REPORT.md says result = pass, recommendation = proceed, and the evidence files are real.
- Safe fail: result = fail, recommendation = revise or blocked, evidence is missing, or the tests were not actually run.

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions, 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(assumptionsAndQuestions.openQuestions, 'Please review and confirm: no open questions recorded.')}

## Unresolved warnings
${listToBullets(bundle.unresolvedWarnings.map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`), 'No unresolved warnings recorded.')}

## Status meaning
- Draft: export is allowed for planning review, but the package is not yet ready for human build approval.
- Blocked: export is allowed for diagnosis and review, but blocker warnings prevent a build-ready package.
- ReviewReady: the package is complete enough for human approval review, but it is not yet approved for build.
- ApprovedForBuild: the package has explicit approval metadata and can be treated as build-approved.
`;
}

type UiWorkflow = {
  name: string;
  targetUser: string;
  goal: string;
  startPoint: string;
  happyPath: string[];
  edgeCases: string[];
  failureCases: string[];
  requiredScreens: string[];
  successCriteria: string;
  businessRisk: string;
};

type UiScreen = {
  name: string;
  purpose: string;
  primaryUser: string;
  primaryAction: string;
  secondaryActions: string[];
  requiredData: string[];
  emptyState: string;
  loadingState: string;
  errorState: string;
  mobileConsiderations: string;
  accessibilityConsiderations: string;
  implementationNotes: string;
};

function getUiWorkflowSet(input: ProjectInput, context: ProjectContext): UiWorkflow[] {
  if (!context.uiRelevant) {
    return [
      {
        name: 'Optional future interface review',
        targetUser: context.primaryAudience,
        goal: `Recognize when ${input.productName} later grows a user-facing surface that needs UI/UX planning.`,
        startPoint: `A future phase adds a dashboard, form, workflow UI, website, or internal tool for ${input.productName}.`,
        happyPath: [
          'Notice that users will interact with screens instead of only markdown artifacts or CLI flows.',
          'Open UI_UX_START_HERE.md before building the interface.',
          'Create workflows and screens before implementation starts.'
        ],
        edgeCases: [
          'A small admin page seems trivial, but still needs error states and access clarity.',
          'A one-off settings page later becomes a recurring workflow for multiple roles.'
        ],
        failureCases: [
          'An interface is built without documenting the user flow first.',
          'Screens are added during a later phase with no screenshot review or mobile check.'
        ],
        requiredScreens: ['No current screens required. Add this list when a UI is introduced.'],
        successCriteria: 'The team pauses before UI implementation and creates project-specific workflows and screens first.',
        businessRisk: 'If a UI is added late without this module, the project can ship confusing screens that contradict the markdown workflow.'
      }
    ];
  }

  // Phase A3c (final hardening): the per-archetype UI workflow set
  // (family-task and restaurant-ordering arms) was deleted with the keyword
  // router. The fallback workflow shape below works for any product; UI copy
  // that needs to be domain-aware should pull from research extractions
  // (workflows[].name / steps / failureModes) rather than from baked-in arms.
  return [
    {
      name: `${sentenceCase(context.primaryFeature)} primary workflow`,
      targetUser: context.primaryAudience,
      goal: `Complete the main ${input.productName} workflow without needing hidden chat context or side-channel explanation.`,
      startPoint: `User opens the first screen for ${input.productName}.`,
      happyPath: [
        `User understands the first decision on the page and starts the ${context.primaryFeature} workflow.`,
        'User completes the minimum required inputs with clear guidance.',
        'System confirms the action and shows the next useful step.'
      ],
      edgeCases: [
        `The user arrives with incomplete information for ${context.primaryFeature}.`,
        'The user returns mid-process and needs to resume safely.'
      ],
      failureCases: [
        'The primary call to action is ambiguous.',
        'The workflow ends without a clear success confirmation.'
      ],
      requiredScreens: ['Entry screen', 'Primary workflow screen', 'Confirmation state'],
      successCriteria: `A first-time ${context.primaryAudience} user can complete the primary workflow on the first attempt.`,
      businessRisk: 'If the main flow is confusing, the project fails at the exact moment it is supposed to prove value.'
    },
    {
      name: 'Status, review, or admin follow-through',
      targetUser: context.primaryAudience,
      goal: `Review outcomes, exceptions, and next actions after the main ${context.primaryFeature} step.`,
      startPoint: 'User returns after the first action is submitted.',
      happyPath: [
        'User sees the current state clearly.',
        'User can inspect details without hunting through the interface.',
        'User knows whether to continue, revise, or wait.'
      ],
      edgeCases: ['Important data is missing.', 'A pending review or approval step exists.'],
      failureCases: ['Status copy is generic.', 'Recovery actions are hidden below the fold.'],
      requiredScreens: ['Dashboard or status screen', 'Detail or review screen', 'Error or exception state'],
      successCriteria: 'Users can diagnose the next step from the screen itself.',
      businessRisk: 'If review state is unclear, teams create manual side workflows and the product stops being trusted.'
    }
  ];
}


function getUiScreens(input: ProjectInput, context: ProjectContext, workflows: UiWorkflow[]): UiScreen[] {
  if (!context.uiRelevant) {
    return [
      {
        name: 'No current UI required',
        purpose: `${input.productName} does not currently require a user-facing interface module beyond this reminder.`,
        primaryUser: context.primaryAudience,
        primaryAction: 'Re-open this module if a future phase adds screens, forms, dashboards, or mobile layouts.',
        secondaryActions: ['Record the future UI trigger in the current phase handoff.'],
        requiredData: ['Project brief', 'Phase plan', 'New UI requirement once it exists'],
        emptyState: 'No UI work is planned yet.',
        loadingState: 'Not applicable until a UI is introduced.',
        errorState: 'The team starts UI work without reopening this module.',
        mobileConsiderations: 'Not applicable today. Reassess when a user-facing flow is added.',
        accessibilityConsiderations: 'Not applicable today. Reassess when real screens exist.',
        implementationNotes: 'Keep the folder in every package so teams know UI/UX review becomes mandatory once interface work appears.'
      }
    ];
  }

  const baseScreens: UiScreen[] = [
    {
      name: `${input.productName} entry screen`,
      purpose: `Orient ${context.primaryAudience} and make the first step obvious.`,
      primaryUser: context.primaryAudience,
      primaryAction: `Start the ${workflows[0]?.name.toLowerCase() || context.primaryFeature} workflow`,
      secondaryActions: ['Review status summary', 'Open help or onboarding cues'],
      requiredData: ['Headline that explains value', 'Current state summary', 'Primary call to action'],
      emptyState: 'Explain what is missing and how to begin.',
      loadingState: 'Skeleton or progress message that preserves layout.',
      errorState: 'Clear retry path with plain-language explanation.',
      mobileConsiderations: 'Primary call to action must stay visible without requiring horizontal scroll.',
      accessibilityConsiderations: 'Logical heading order, focusable primary action, and descriptive button text.',
      implementationNotes: 'Do not overload the entry screen with secondary settings or advanced controls.'
    }
  ];

  const workflowScreens = Array.from(new Set(workflows.flatMap((workflow) => workflow.requiredScreens))).slice(0, 5);
  for (const screenName of workflowScreens) {
    if (baseScreens.some((screen) => screen.name.toLowerCase() === screenName.toLowerCase())) continue;
    baseScreens.push({
      name: screenName,
      purpose: `Support the ${screenName.toLowerCase()} step inside ${input.productName}.`,
      primaryUser: context.primaryAudience,
      primaryAction: `Complete the key action for ${screenName.toLowerCase()}.`,
      secondaryActions: ['Review supporting details', 'Back out safely without losing context'],
      requiredData: [`Data needed to complete ${screenName.toLowerCase()}`, 'Current status', 'Next-step guidance'],
      emptyState: `Explain why ${screenName.toLowerCase()} has no data yet and what to do next.`,
      loadingState: `Show that ${screenName.toLowerCase()} is loading without collapsing the layout.`,
      errorState: `Tell the user what blocked ${screenName.toLowerCase()} and how to recover.`,
      mobileConsiderations: 'Stack content vertically, keep labels visible, and avoid side-by-side controls that collapse poorly.',
      accessibilityConsiderations: 'Use semantic landmarks, explicit labels, and visible focus states for all interactive controls.',
      implementationNotes: `Keep ${screenName.toLowerCase()} scoped to the workflow. Do not add speculative analytics or advanced settings in v1.`
    });
  }

  return baseScreens;
}

function renderUiWorkflowMarkdown(workflow: UiWorkflow) {
  return `## ${workflow.name}

- Workflow name: ${workflow.name}
- Target user: ${workflow.targetUser}
- User goal: ${workflow.goal}
- Start point: ${workflow.startPoint}
- Happy path:
${workflow.happyPath.map((item) => `  - ${item}`).join('\n')}
- Edge cases:
${workflow.edgeCases.map((item) => `  - ${item}`).join('\n')}
- Failure cases:
${workflow.failureCases.map((item) => `  - ${item}`).join('\n')}
- Required screens: ${workflow.requiredScreens.join(', ')}
- Success criteria: ${workflow.successCriteria}
- Business risk if the workflow is confusing: ${workflow.businessRisk}
`;
}

function renderUiScreenMarkdown(screen: UiScreen) {
  return `## ${screen.name}

- Screen name: ${screen.name}
- Purpose: ${screen.purpose}
- Primary user: ${screen.primaryUser}
- Primary action: ${screen.primaryAction}
- Secondary actions: ${screen.secondaryActions.join('; ')}
- Required data: ${screen.requiredData.join('; ')}
- Empty state: ${screen.emptyState}
- Loading state: ${screen.loadingState}
- Error state: ${screen.errorState}
- Mobile considerations: ${screen.mobileConsiderations}
- Accessibility considerations: ${screen.accessibilityConsiderations}
- Implementation notes: ${screen.implementationNotes}
`;
}

function buildUiUxStartHere(input: ProjectInput, context: ProjectContext, workflows: UiWorkflow[]) {
  if (!context.uiRelevant) {
    return `# UI_UX_START_HERE

## What this module is
This is a lightweight Screen and Workflow Review placeholder for ${input.productName}. It is the beginner-friendly name for the UI/UX module. Keep it in the package so future interface work does not start blindly.

## When to use it
Use the full UI/UX workflow only if a later phase adds a screen, form, dashboard, website, app, portal, admin tool, or other user-facing experience.

## How it fits into the build
- Current status: optional for now because the project is not clearly UI-driven today.
- Future rule: if any interface work appears, pause implementation and complete this folder before continuing.

## What order to open files in
1. UI_UX_START_HERE.md
2. USER_WORKFLOWS.md
3. SCREEN_INVENTORY.md
4. UI_UX_GATE.md
5. UI_UX_HANDOFF.md

## How to use it with Codex, Claude Code, Kimi, or GLM
- Give the agent this folder plus PROJECT_BRIEF.md and the current phase packet.
- Ask the agent to convert the future UI request into workflows, screens, and review criteria before it writes interface code.

## Screenshot collection
- Not required yet.
- The moment a real interface exists, capture desktop and mobile screenshots before broader testing.

## When to stop and revise
- Stop immediately if interface work starts without workflows, screens, empty states, loading states, and error states being documented first.
`;
  }

  return `# UI_UX_START_HERE

## What this module is
This module helps you design and review the ${input.productName} interface before the build drifts into guesswork. The beginner-friendly name for this module is Screen and Workflow Review. It is markdown-first and works with screenshots, plain-language notes, and simple wireframe descriptions instead of requiring Figma.

## When to use it
Use this folder before UI implementation starts, during UI build work, and again before final testing. Because ${input.productName} has a user-facing workflow for ${context.primaryAudience}, this module is part of the core package, not an optional extra.

## How it fits into the build
1. Define workflows in USER_WORKFLOWS.md.
2. Turn those workflows into screens in SCREEN_INVENTORY.md.
3. Build only the screens needed for the current phase.
4. Capture screenshots after each meaningful UI change.
5. Run screenshot critique and complete UI_UX_GATE.md before broader testing.

## What order to open files in
1. UI_UX_START_HERE.md
2. USER_WORKFLOWS.md
3. SCREEN_INVENTORY.md
4. UX_REVIEW_CHECKLIST.md
5. UI_IMPLEMENTATION_GUIDE.md
6. ACCESSIBILITY_CHECKLIST.md
7. RESPONSIVE_DESIGN_CHECKLIST.md
8. SCREENSHOT_REVIEW_PROMPT.md
9. UI_UX_GATE.md
10. UI_UX_HANDOFF.md

## How to use it with Codex, Claude Code, Kimi, or GLM
- Give the agent this folder, PROJECT_BRIEF.md, PHASE_PLAN.md, and the current phase packet.
- Ask the agent to restate the workflow before it writes UI code.
- Require the agent to name missing states, accessibility risks, and responsive tradeoffs instead of silently guessing.

## How to collect screenshots during the build
- Capture at least one screenshot for every core screen listed in SCREEN_INVENTORY.md.
- Capture desktop and mobile versions for the most important workflow screens.
- Capture empty, loading, and error states for core flows.
- Name screenshot files clearly so they can be cited during review.

## When to stop and revise the UI before continuing
- Stop if the primary workflow in ${workflows[0]?.name || context.primaryFeature} cannot be completed cleanly.
- Stop if screenshots show unclear primary actions, broken mobile layout, or missing error states.
- Stop if the interface contradicts the business workflow documented elsewhere in the package.
`;
}

function buildUxReviewChecklist(context: ProjectContext) {
  return `# UX_REVIEW_CHECKLIST

## Clarity
- [ ] Every primary screen explains what the user can do here in one fast scan.
- [ ] Every primary screen has exactly one obvious primary action above the fold.
- [ ] The screen title, helper copy, and button labels all describe the same task.

## Workflow completion
- [ ] The user can complete the main ${context.primaryFeature} workflow without hidden steps or side-channel instructions.
- [ ] Every workflow has a visible success confirmation and a clear next step.
- [ ] If the workflow pauses for review, approval, or waiting, the UI explains who acts next and what the user should expect.

## Screen hierarchy
- [ ] Visual hierarchy makes the primary decision obvious before secondary actions.
- [ ] Supporting detail does not visually compete with the primary action.
- [ ] Important warnings or blockers are visible before the user submits.

## Call-to-action clarity
- [ ] Primary buttons use action language, not vague labels like "Continue" when the outcome is unclear.
- [ ] Destructive actions are visually distinct from safe actions.
- [ ] Secondary actions do not outshine the primary path.

## Form usability
- [ ] Required fields are obvious before submission.
- [ ] Inputs are grouped in the order users naturally think about the task.
- [ ] Validation messages explain what to fix, not just that something failed.

## Copy and labels
- [ ] Labels use business-user language instead of internal implementation jargon.
- [ ] Empty state copy explains what is missing and how to recover.
- [ ] Error copy explains cause, impact, and next step in plain language.

## Navigation
- [ ] Users can tell where they are in the workflow.
- [ ] Back, cancel, and close actions behave predictably.
- [ ] Navigation does not hide required work behind ambiguous menu labels.

## Errors and validation
- [ ] Core flows show inline validation before the user loses work.
- [ ] Error states preserve enough context for the user to recover.
- [ ] The same error is not described differently on different screens.

## Empty and loading states
- [ ] Every core screen has an intentional empty state, loading state, and error state.
- [ ] Loading placeholders preserve layout and do not make content jump.
- [ ] Empty states tell the user what to do next instead of dead-ending.

## Trust and safety
- [ ] Sensitive or high-risk actions are clearly labeled before commitment.
- [ ] The UI does not imply guarantees the system cannot actually provide.
- [ ] Risk-heavy workflows surface warnings early enough for users to act on them.

## Mobile layout
- [ ] Core actions remain visible and tappable on small screens.
- [ ] Forms, tables, and cards do not require horizontal scrolling for basic use.
- [ ] Sticky UI elements do not cover primary actions or validation messages.

## Accessibility
- [ ] Keyboard-only users can reach and operate every core control.
- [ ] Focus states are always visible.
- [ ] Screen structure uses semantic headings, labels, and landmarks.

## Business-user readability
- [ ] A novice business user can explain what each primary screen does after one read.
- [ ] The UI avoids unnecessary shorthand, acronyms, and engineering-first labels.
- [ ] Success and failure states are understandable without developer translation.

## Developer implementation readiness
- [ ] Each screen is specific enough that an agent can build it without inventing missing states.
- [ ] Reusable components are obvious from the screen definitions.
- [ ] Any unresolved tradeoff is named explicitly instead of being left implicit.
`;
}

function buildUiImplementationGuide(input: ProjectInput, context: ProjectContext, screens: UiScreen[]) {
  return `# UI_IMPLEMENTATION_GUIDE

## Recommended component structure
- Start with page shells or route-level screens that match SCREEN_INVENTORY.md.
- Extract shared components only after two screens clearly need the same pattern.
- Prefer reusable building blocks such as page header, primary action bar, form section, status card, alert, empty state, loading shell, and error panel.

## Page and screen order
- Build the entry screen first so navigation and the first decision are clear.
- Build the main workflow screens next.
- Build confirmation, empty, loading, and error states before polishing edge UI.
- Current expected screen sequence: ${screens.map((screen) => screen.name).join(' -> ')}.

## Reusable components
- Primary action button with disabled, loading, and destructive variants.
- Form field wrapper with label, helper text, validation message, and accessibility hook-up.
- Status banner for pass, warning, blocked, and info states.
- Empty state block with explanation plus next action.
- Responsive detail container that can collapse from table-like layout to stacked cards.

## Layout guidance
- Keep one obvious content column for the main decision path.
- Put secondary metadata in side panels only if it remains readable on mobile.
- Use spacing and heading levels to separate "do now" actions from background context.

## State handling
- Explicitly implement empty, loading, success, validation error, and system error states for every core screen.
- Preserve user input when validation fails unless doing so would be unsafe.
- If a workflow pauses, explain the current state and next responsible actor on-screen.

## Validation behavior
- Validate required fields early enough to prevent silent failure.
- Put the validation message next to the field and summarize at the top when multiple fields fail.
- Use business-language validation copy, not raw schema or backend jargon.

## Accessibility requirements
- Use semantic HTML first.
- Ensure all controls have visible labels and keyboard access.
- Keep focus order aligned with visual order.
- Announce important errors and status changes clearly.

## Screenshot expectations
- Capture screenshots for each core screen plus core empty, loading, and error states.
- Capture mobile screenshots for the highest-risk workflow screens.
- Keep screenshot filenames traceable to screen names so reviews can cite evidence.

## What not to build yet
- Do not add speculative analytics panels, advanced settings, permission matrices, or power-user modes unless a current phase explicitly requires them.
- Do not build alternate workflows that are not backed by USER_WORKFLOWS.md.
- Do not over-componentize patterns that appear only once.

## How to avoid overbuilding
- ${CORE_AGENT_OPERATING_RULES.split('\n').slice(2).join('\n- ')}
- If a screen detail is unclear, surface the tradeoff instead of inventing more product.
- Build only the minimum code that proves the current screen and workflow.
`;
}

function buildAccessibilityChecklist() {
  return `# ACCESSIBILITY_CHECKLIST

## Keyboard navigation
- [ ] Every interactive element can be reached and used with the keyboard alone.
- [ ] Tab order follows the visual reading order.
- [ ] No important action is mouse-only.

## Visible focus states
- [ ] Buttons, links, inputs, tabs, and custom controls all show a clear focus indicator.
- [ ] Focus is still visible against busy backgrounds or accent colors.

## Contrast
- [ ] Body text passes readable contrast against its background.
- [ ] Placeholder text and disabled text are still legible enough for their purpose.
- [ ] Error and success colors are not the only way meaning is conveyed.

## Labels
- [ ] Every input has a visible label.
- [ ] Icon-only controls have accessible names.
- [ ] Grouped choices have clear fieldset-style context.

## Form errors
- [ ] Error messages explain what the user must change.
- [ ] Error messages appear near the field and can also be found quickly at the top if needed.
- [ ] Submitting with errors moves focus to a useful recovery point.

## Semantic HTML
- [ ] Pages use meaningful headings in order.
- [ ] Buttons are buttons and links are links.
- [ ] Lists, tables, dialogs, and forms use the right semantic structure.

## Screen reader basics
- [ ] Important page regions are identifiable.
- [ ] Dynamic status changes are announced when needed.
- [ ] Decorative images or icons do not create noise.

## Button and link clarity
- [ ] Action text says what happens next.
- [ ] Adjacent buttons are easy to distinguish.
- [ ] Link text makes sense out of context.

## Modal behavior
- [ ] Focus moves into the modal when it opens.
- [ ] Focus is trapped inside the modal until it closes.
- [ ] Focus returns to a sensible place after close.

## Tables
- [ ] Column headers are clear and associated with data.
- [ ] Dense tables have a mobile fallback if they become unreadable.
- [ ] Sort or filter controls remain understandable to screen readers.

## Mobile touch targets
- [ ] Tap targets are large enough to use without precision clicking.
- [ ] Inputs and buttons have enough spacing to avoid accidental taps.
- [ ] Sticky elements do not cover the active field or important errors.
`;
}

function buildResponsiveChecklist() {
  return `# RESPONSIVE_DESIGN_CHECKLIST

## Desktop
- [ ] Primary workflow reads clearly at common laptop widths.
- [ ] Important summaries and calls to action appear without awkward empty space.

## Tablet
- [ ] Layout still preserves workflow order when columns collapse.
- [ ] Navigation and side panels do not trap key actions below the fold.

## Mobile
- [ ] Main tasks can be completed with one thumb and vertical scrolling only.
- [ ] Forms remain readable without pinch zoom.

## Small mobile
- [ ] Long labels wrap cleanly.
- [ ] Sticky headers, footers, and banners do not cover buttons or errors.

## Navigation collapse
- [ ] Collapsed navigation still makes the current location obvious.
- [ ] Opening navigation does not hide critical workflow controls.

## Form layouts
- [ ] Two-column forms collapse to one column when width gets tight.
- [ ] Validation messages remain attached to the right field after collapse.

## Table and card behavior
- [ ] Wide tables have a deliberate mobile fallback such as stacked cards or priority columns.
- [ ] Dense information remains scannable after layout collapse.

## Overflow
- [ ] No core screen requires horizontal scrolling for normal use.
- [ ] Long text, tags, and buttons do not break containers.

## Touch targets
- [ ] Interactive controls remain large and well-spaced on touch devices.
- [ ] Dropdowns, date pickers, and segmented controls remain operable on mobile.

## Sticky headers and footers
- [ ] Sticky UI helps orientation without blocking content.
- [ ] Sticky action bars do not hide validation messages or modal controls.

## Modal behavior
- [ ] Dialogs fit on smaller screens and still allow scrolling to all content.
- [ ] Close actions remain visible even on short viewports.

## Screenshot evidence
- [ ] Keep at least one desktop screenshot, one tablet screenshot, and one mobile screenshot for core flows.
- [ ] Save screenshot evidence before declaring the UI ready for broader testing.
`;
}

function buildScreenshotReviewPrompt(input: ProjectInput, context: ProjectContext) {
  return `# SCREENSHOT_REVIEW_PROMPT

Paste the prompt below into Codex, Claude, Kimi, GLM, or ChatGPT after uploading the latest UI screenshots.

\`\`\`text
You are reviewing the UI for ${input.productName}.

Required files to compare against:
- /ui-ux/USER_WORKFLOWS.md
- /ui-ux/SCREEN_INVENTORY.md
- /ui-ux/UX_REVIEW_CHECKLIST.md
- /ui-ux/ACCESSIBILITY_CHECKLIST.md
- /ui-ux/RESPONSIVE_DESIGN_CHECKLIST.md

Your job:
1. Inspect every screenshot carefully.
2. Compare each screenshot against the documented workflows and expected screens.
3. Identify usability failures with evidence tied to what is visible in the screenshots.
4. Identify visual hierarchy problems with evidence.
5. Identify missing empty, loading, or error states for core flows.
6. Identify accessibility risks with evidence.
7. Identify confusing copy or labels with evidence.
8. Score each screen from 0 to 100.
9. Separate must-fix issues from nice-to-have improvements.
10. Produce a final UI/UX gate decision: PASS, PASS WITH MINOR ISSUES, REVISE, or BLOCKED.

Rules:
- Do not give vibe-based feedback.
- Every finding must cite screenshot evidence and the relevant workflow or screen expectation.
- If a documented workflow cannot be verified from the screenshots, call that out explicitly.
- If mobile behavior cannot be verified, say so explicitly.
- Prefer concrete fixes over abstract design opinions.

Required output format:
1. Screen-by-screen review with score (0-100) and evidence.
2. Cross-workflow findings tied to USER_WORKFLOWS.md.
3. Accessibility risks.
4. Missing states.
5. Must-fix issues.
6. Nice-to-have improvements.
7. Final gate decision with reasoning.
\`\`\`
`;
}

function buildUiUxGate(context: ProjectContext) {
  return `# UI_UX_GATE

## Entry criteria
- The current phase includes real UI work or prepares for it.
- USER_WORKFLOWS.md and SCREEN_INVENTORY.md reflect the current build.
- Screenshots exist for the core workflow screens${context.uiRelevant ? ', including mobile views for high-risk screens' : ''}.

## Required evidence
- Completed workflow review against USER_WORKFLOWS.md
- Completed screen review against SCREEN_INVENTORY.md
- Screenshot critique notes with cited evidence
- Accessibility check notes
- Responsive check notes

## Required screenshots
- Primary workflow start screen
- Primary workflow action screen
- Primary workflow success or confirmation screen
- Empty state for a core screen
- Error or validation state for a core screen
- Mobile screenshots for the highest-risk workflow screens

## Required workflow demos
- Demonstrate the primary workflow end to end
- Demonstrate at least one failure or recovery path
- Demonstrate the status, confirmation, or follow-through step after the main action

## Required accessibility checks
- Keyboard navigation
- Visible focus states
- Labels and validation clarity
- Semantic structure for the primary workflow

## Required mobile checks
- Primary flow works on mobile
- Layout does not break on small mobile
- Touch targets remain usable

## Auto-fail conditions
- Primary workflow cannot be completed
- No screenshots provided for a UI project
- Form errors are unclear
- Mobile layout is broken
- Primary action is ambiguous
- UI contradicts the business workflow
- Empty, error, or loading states are missing for core flows

## Pass conditions
- Core workflows are complete and understandable
- Primary actions are obvious on major screens
- Screenshot evidence covers desktop and mobile where needed
- Accessibility and responsive checks do not reveal critical blockers

## Revise conditions
- Workflow is mostly complete but key screens still have clarity, state, or hierarchy issues
- Accessibility or mobile problems are fixable without changing the product direction
- Screenshot evidence exists but shows must-fix confusion
`;
}

function buildUiUxHandoff() {
  return `# UI_UX_HANDOFF

## Screens completed
- pending

## Screens pending
- pending

## Workflows verified
- pending

## Screenshots reviewed
- pending

## Known UX issues
- pending

## Accessibility issues
- pending

## Mobile issues
- pending

## Implementation risks
- pending

## Final recommendation
- PASS
- PASS WITH MINOR ISSUES
- REVISE
- BLOCKED
`;
}

function buildRecursiveStartHere() {
  return `# RECURSIVE_TEST_START_HERE

## What recursive testing is
Recursive testing is a quality-improvement loop, not a one-time test command. The beginner-friendly name for this module is Improve Until Good Enough Loop. The agent reads a test case set, scores the outputs, fixes root causes, reruns tests, and repeats until the required quality threshold is reached or a clear blocker stops progress.

## When to use it
- After a major build is complete
- After a large generator or template change
- After a major phase when normal verification passes but output quality still needs hard scrutiny

## Who should run it
- Codex, Claude Code, Kimi, or GLM
- A technical reviewer supervising a quality pass

## What files it needs
- This folder
- The generated project artifacts
- Any attached use-case or swarm test-case file
- The regression suite and test scripts already generated by MVP Builder

## Default target score
- 90/100

## Default max iterations
- 5 iterations unless the user explicitly changes it

## What to do if it cannot reach the target
- Stop at the max iteration count
- Produce a blocker report with root causes, failed use cases, and the highest score reached
- Do not declare PASS

## How this differs from normal regression testing
- Normal regression testing checks whether known behaviors still work.
- Recursive testing scores quality, fixes weaknesses, reruns the system, and repeats until quality is high enough or blocked.
`;
}

function buildRecursivePrompt() {
  return `# RECURSIVE_TEST_PROMPT

\`\`\`text
You are running MVP Builder recursive testing.

Required behavior:
1. Inspect the repository.
2. Read available test cases.
3. If mvp_builder_kimi_1050_swarm_test_cases.md exists, use it.
4. If no test case file exists, create a smaller but rigorous test suite from the generated project artifacts.
5. Test all 10 use cases if available.
6. Generate outputs for each use case.
7. Evaluate each output with evidence.
8. Score each use case from 0 to 100.
9. Score the overall system from 0 to 100.
10. Identify root causes, not just symptoms.
11. Fix the code or templates.
12. Rerun the relevant tests.
13. Repeat until overall score >= 90 or max iterations is reached.

Scoring must include:
- usefulness of generated outputs
- project-specific quality
- absence of generic filler
- correctness of phase plans
- correctness of gate criteria
- usefulness of test scripts
- usefulness of regression suite
- quality of step-by-step documentation
- beginner readability
- agent handoff quality
- verification evidence quality
- UI/UX guidance quality, if applicable
- recursive testing readiness

Rules:
- Do not give shallow scores.
- Every score must cite evidence and actual file references.
- Do not claim a fix worked until you rerun the relevant test or generation path.
- Fix root causes in templates or generator logic when possible.
- Keep recursive testing local-first and markdown-first.

Required outputs for every iteration:
- test cases used
- commands run
- files inspected
- files changed
- score per use case
- overall score
- root causes
- fixes made
- remaining blockers

Required final output:
- final recursive test report
- iteration log updates
- score caps applied
- final recommendation
\`\`\`
`;
}

function buildScoringRubric() {
  return `# SCORING_RUBRIC

## 100-point rubric
- 15 points: project-specific generated outputs
- 10 points: phase and gate quality
- 10 points: verification and evidence quality
- 10 points: test script quality
- 10 points: regression suite quality
- 10 points: step-by-step documentation quality
- 10 points: agent handoff quality
- 10 points: beginner usability
- 5 points: UI/UX module quality, if applicable
- 5 points: recursive testing readiness
- 5 points: code or template maintainability

## Score cap rules
- If generated artifacts are mostly generic, max score 69.
- If tests are fake or not runnable, max score 74.
- If the system says PASS while body says BLOCKED, max score 60.
- If handoffs are blank templates, max score 70.
- If phase plans do not match the use case domain, max score 72.
- If regression suite is missing, max score 78.
- If step-by-step guide is unusable by a novice, max score 80.
- If no evidence files are produced, max score 65.
- If build or typecheck fails, max score 75.
- If core generated output is missing, max score 59.

## Scoring discipline
- Apply caps before announcing the final score.
- Document every cap that was triggered.
- Do not average away critical failures.
`;
}

function buildTestCaseSelectionGuide() {
  return `# TEST_CASE_SELECTION_GUIDE

- Use all attached test cases when possible.
- Use representative samples only if the full suite is too large for one pass.
- Always include 10 diverse use cases when testing generator quality.
- Include business-heavy, technical-heavy, beginner, intermediate, and advanced scenarios.
- Include UI and non-UI projects.
- Include edge cases.
- Include intentionally vague briefs.
- Include high-risk domains that need stronger gates.
- Include projects with integrations.
- Include projects with multiple user personas.
`;
}

function buildIterationLog() {
  return `# ITERATION_LOG

## Iteration template
- Iteration number: pending
- Date and time: pending
- Test cases used: pending
- Commands run: pending
- Files inspected: pending
- Files changed: pending
- Score before: pending
- Score after: pending
- Issues found: pending
- Fixes made: pending
- Remaining blockers: pending
- Decision: continue | stop passed | stop blocked
`;
}

function buildFailureTaxonomy() {
  const failures = [
    ['generic artifacts', 'Outputs could fit any project instead of the current domain.', 'A phase brief reads like generic SaaS planning text.', 'High', 'Weak domain grounding in generator templates.', 'Inject project-specific anchors, workflows, and risk terms into templates.'],
    ['fake evidence', 'Evidence claims review happened but cites no real files or commands.', 'Verification says pass with only “looks good”.', 'Critical', 'Review templates allow vague proof.', 'Tighten evidence requirements and reject generic notes.'],
    ['shallow test scripts', 'Test scripts exist but do not prove meaningful behavior.', 'A script says “review the app” with no pass criteria.', 'High', 'Template not forcing concrete checks.', 'Add deterministic steps, expected results, and failure conditions.'],
    ['non-runnable regression suite', 'Regression files exist but cannot actually be used.', 'RUN_REGRESSION.md references missing scripts.', 'Critical', 'Artifact completeness without usability checks.', 'Add missing scripts and smoke assertions for usability.'],
    ['blank handoffs', 'Handoff files remain template-only.', 'Completion update still says pending update everywhere.', 'High', 'No enforcement on handoff population.', 'Require real completion data before pass decisions.'],
    ['phase or domain mismatch', 'Phase plan does not fit the use case.', 'A restaurant project gets healthcare-oriented gates.', 'Critical', 'Cross-domain template leakage.', 'Strengthen domain detection and sanitize cross-domain echoes.'],
    ['contradictory PASS or BLOCKED language', 'Structured result and narrative disagree.', 'Header says pass while final decision says blocked.', 'Critical', 'Weak consistency checks.', 'Add validation and score caps for contradictions.'],
    ['weak beginner instructions', 'Novice users cannot follow the package.', 'Step guide assumes engineering context without explanation.', 'High', 'Templates optimized only for experts.', 'Add plain-language steps and explicit next actions.'],
    ['missing UI or UX checks', 'UI projects skip workflow and screenshot review.', 'Screens exist but no UI_UX_GATE evidence exists.', 'High', 'Testing flow ignores interface quality.', 'Wire UI/UX module into build and test flow.'],
    ['missing accessibility checks', 'UI review never checks keyboard, focus, or labels.', 'A form ships without label review.', 'High', 'Accessibility treated as optional.', 'Add accessibility checklist and gate requirements.'],
    ['missing recursive testing instructions', 'Quality loop is suggested but not operationalized.', 'A prompt says “improve quality” with no score loop.', 'High', 'Recursive testing left vague.', 'Add scoring rubric, iteration log, caps, and final gate.'],
    ['overbuilt architecture', 'Artifacts recommend architecture beyond the stated MVP.', 'A local package suddenly assumes hosted backend services.', 'High', 'Speculative implementation drift.', 'Reassert local-first scope and cut speculative work.'],
    ['missing local-first constraint', 'Generated output starts assuming hosted dependencies.', 'Templates mention accounts or cloud services without need.', 'Critical', 'Constraint not repeated enough in prompts.', 'Add stronger local-first checks to guides and gates.'],
    ['missing markdown-first constraint', 'Core workflow depends on tools outside markdown artifacts.', 'Critical decisions live only in chat history.', 'Critical', 'Workflow instructions are too loose.', 'Re-center markdown artifacts as the source of truth.'],
    ['unclear success criteria', 'Outputs do not say what “good” looks like.', 'A gate says “ready” with no measurable condition.', 'High', 'Weak acceptance language.', 'Add observable pass criteria and evidence expectations.'],
    ['no screenshot evidence for UI project', 'Interface exists but screenshot review never happened.', 'Desktop build is discussed with no screenshots attached.', 'High', 'UI testing path lacks evidence enforcement.', 'Require screenshot evidence before UI pass.'],
    ['no final gate decision', 'Final report never states a usable recommendation.', 'Report ends with notes but no pass/fail judgment.', 'High', 'Template missing explicit close-out section.', 'Add mandatory final recommendation section.']
  ];

  return `# FAILURE_TAXONOMY

${failures
  .map(
    ([name, definition, example, severity, rootCause, fix]) => `## ${name}

- Definition: ${definition}
- Example: ${example}
- Severity: ${severity}
- Likely root cause: ${rootCause}
- Recommended fix: ${fix}
`
  )
  .join('\n')}
`;
}

function buildRecursiveReport() {
  return `# RECURSIVE_TEST_REPORT

## Overall score
- pending

## Per-use-case scores
- pending

## Scoring methodology
- pending

## Score caps applied
- pending

## Iterations completed
- pending

## Files changed
- pending

## Commands run
- pending

## Regression results
- pending

## Unresolved issues
- pending

## Final recommendation
- PASS
- PASS WITH MINOR ISSUES
- FAIL UNTIL FIXED
- BLOCKED
`;
}

function buildRecursiveFixGuide() {
  return `# RECURSIVE_FIX_GUIDE

- Fix root causes, not only generated examples.
- Update templates if generated artifacts are weak.
- Update generator logic if outputs are domain-mismatched.
- Update scoring if bad outputs pass.
- Update tests if regressions were not caught.
- Do not overbuild.
- Do not add unrelated architecture.
- Touch only files required for the issue.
- Rerun relevant tests after every fix.
`;
}

function buildRegressionRecheckGuide() {
  return `# REGRESSION_RECHECK_GUIDE

- Identify the minimum regression set by mapping changed files to affected generators, templates, and artifacts.
- Rerun all 10 use cases when validating broad generator quality changes.
- Compare old and new scores instead of trusting a single new score in isolation.
- Prevent false improvement by checking whether weak cases were skipped or scored more loosely.
- Confirm new fixes do not weaken previously passing behavior, especially gates, evidence rules, and beginner guidance.
`;
}

function buildFinalQualityGate() {
  return `# FINAL_QUALITY_GATE

## Pass requires
- score >= 90/100
- no critical blockers
- all required commands pass
- regression suite exists and is usable
- test scripts are meaningful
- step-by-step documentation is beginner-usable
- generated outputs are project-specific
- evidence is real, not fake
- handoffs are populated
- UI/UX module passes if the project has UI
- recursive test report is complete

## Auto-fail conditions
- score below 90
- fake evidence
- generic generated outputs
- PASS or BLOCKED contradiction
- missing regression suite
- missing test scripts
- missing final report
- no actual files inspected
- no actual commands run
- no iteration log
- core build or typecheck failure
`;
}

function buildAutoImproveProgram(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  return `# PROGRAM

## Purpose
Use this folder to improve the generated project package for ${input.productName} without changing the evaluator to make scores look better.

## Editable files
- Root planning and handoff files such as PROJECT_BRIEF.md, PHASE_PLAN.md, HANDOFF.md, STEP_BY_STEP_BUILD_GUIDE.md, SCORECARD.md, TESTING_STRATEGY.md, and REGRESSION_TEST_PLAN.md
- Product modules under product-strategy/, requirements/, security-risk/, integrations/, architecture/, ui-ux/, and recursive-test/
- Phase packets under phases/
- auto-improve/SCORECARD.md when recording a new run
- auto-improve/results.tsv only by appending a new row after a completed run

## Fixed files
- auto-improve/PROGRAM.md
- auto-improve/QUALITY_RUBRIC.md
- auto-improve/RUN_LOOP.md
- auto-improve/results.tsv header row
- The current evaluator rules, regression suite, and gate files unless the human owner explicitly approves evaluator changes outside the scoring loop

## Non-negotiable rule
Never weaken the rubric, scorecard format, evaluator logic, regression checks, or fixed files to get a better score. Improve the package itself instead.

## Validation commands
1. Run the real repo checks that already exist for the project.
2. Re-run the package checks named in TESTING_STRATEGY.md and REGRESSION_TEST_PLAN.md.
3. Re-check the current phase TEST_PLAN.md, TEST_SCRIPT.md, TEST_RESULTS.md, and VERIFICATION_REPORT.md.
4. Record the exact commands and observed results in auto-improve/SCORECARD.md.

## Scoring rules
- Score with auto-improve/QUALITY_RUBRIC.md.
- Use evidence from actual files, commands, and observed outputs.
- Apply hard caps before finalizing the score.
- Use the overall score as the primary metric, but also watch the weakest category and the weakest use case.

## Keep or discard loop
1. Capture a baseline score before editing.
2. Edit only the allowed files.
3. Run validation again.
4. If the score improves and no required check regresses, keep the changes and commit them.
5. If the score stays flat, drops, or creates regressions, discard your own edits and return to the last known good state.
6. Record every run in auto-improve/results.tsv.

## Simplicity criterion
- Prefer the smallest change that makes the package more specific, useful, readable, or executable.
- Do not add hosted services, auth, databases, dashboards, background workers, or speculative architecture.
- If a change adds complexity without improving the score evidence, cut it.

## Stop conditions
- Stop when the package reaches at least 90/100 with no triggered hard cap.
- Stop if further changes only add bloat or move score between categories without improving the weakest real problem.
- Stop and escalate if the only apparent path to a higher score is weakening the evaluator.

## Current package context
- Profile: ${bundle.profile.label}
- Current lifecycle: ${bundle.lifecycleStatus}
- Primary audience: ${context.primaryAudience}
- Primary feature focus: ${context.primaryFeature}
`;
}

function buildAutoImproveQualityRubric() {
  return `# QUALITY_RUBRIC

## 100-point score
- 20 points: Use-case specificity
- 15 points: Phase usefulness
- 10 points: Beginner clarity
- 15 points: Agent executability
- 15 points: Verification strength
- 10 points: Regression and test coverage
- 10 points: Handoff quality
- 5 points: Simplicity and no overbuilding

## Hard caps
- Mostly generic artifacts: max 59
- Fake or non-runnable test scripts: max 69
- Pass or proceed header but blocked body: max 64
- Wrong domain archetype: max 71
- Blank or template-shaped handoff: max 74
- Beginner cannot tell what to do next: max 79
- No regression suite: max 84
- Useful but bloated or overbuilt: max 89

## Scoring discipline
- Score the real output, not the intent.
- Cite file evidence for every category.
- Apply the lowest triggered cap to the final score.
- Never change this rubric inside the improvement loop.
`;
}

function buildAutoImproveScorecard() {
  return `# SCORECARD

## Run metadata
- Date: pending
- Iteration: pending
- Editor: pending

## Category scores
- Use-case specificity (20): pending
- Phase usefulness (15): pending
- Beginner clarity (10): pending
- Agent executability (15): pending
- Verification strength (15): pending
- Regression and test coverage (10): pending
- Handoff quality (10): pending
- Simplicity and no overbuilding (5): pending

## Hard caps triggered
- pending

## Overall score
- pending / 100

## Evidence
- Commands run: pending
- Files reviewed: pending
- Weakest artifact: pending
- Best improvement this run: pending

## Decision
- keep | discard | escalate
`;
}

function buildAutoImproveRunLoop() {
  return `# RUN_LOOP

1. Read PROGRAM.md and QUALITY_RUBRIC.md first.
2. Score the current package before editing.
3. Identify the single weakest artifact or weakest use case.
4. Make the smallest change that improves specificity, usability, clarity, executability, verification, or handoff quality.
5. Run the relevant validation and regression checks again.
6. Re-score the package with evidence.
7. Keep the change only if the score improves without new regressions.
8. Append the run to results.tsv.
9. Repeat until score >= 90 and no hard cap applies.

## Reminder
- Do not edit fixed evaluator files.
- Do not weaken gates or rubrics.
- Do not overbuild to chase points.
`;
}

function buildRootAgentPrompt(
  agentName: AgentName,
  input: ProjectInput,
  bundle: ProjectBundle,
  context: ProjectContext
) {
  const firstPhase = bundle.phases[0];
  const buildPromptFile =
    agentName === 'Codex'
      ? 'CODEX_BUILD_PROMPT.md'
      : agentName === 'Claude Code'
        ? 'CLAUDE_BUILD_PROMPT.md'
        : 'OPENCODE_BUILD_PROMPT.md';
  return `# ${agentName.toUpperCase()} HANDOFF PROMPT

## What this file is for
Paste this into ${agentName} with the listed files attached or opened.

## Files to give ${agentName}
- 00_PROJECT_CONTEXT.md
- 01_CONTEXT_RULES.md
- ${agentName === 'OpenCode' ? 'AGENTS.md\n- ' : ''}00_APPROVAL_GATE.md
- PROJECT_BRIEF.md
- QUESTIONNAIRE.md
- PLAN_CRITIQUE.md
- PHASE_PLAN.md
- SCORECARD.md
- ui-ux/UI_UX_START_HERE.md
- recursive-test/RECURSIVE_TEST_START_HERE.md
- phases/${firstPhase.slug}/PHASE_BRIEF.md
- phases/${firstPhase.slug}/ENTRY_GATE.md
- phases/${firstPhase.slug}/${buildPromptFile}
- phases/${firstPhase.slug}/TEST_PLAN.md
- repo/manifest.json
- repo/mvp-builder-state.json

## Prompt
\`\`\`text
You are starting work on ${input.productName} using the MVP Builder package.

Treat the provided markdown files as the full source of truth. Do not rely on hidden chat context. Work only on the current phase, confirm the gate before coding, and stop if the package says the phase is blocked.

Current package status: ${bundle.lifecycleStatus}
Current phase: ${firstPhase.name}
Primary audience: ${context.primaryAudience}
Primary feature: ${context.primaryFeature}

Please:
1. Restate the project goal and the current phase goal.
2. Confirm the entry gate and call out any blocker immediately.
3. ${context.uiRelevant ? 'If the current phase touches interface work, use the UI/UX module before building screens and call out any missing screenshots or states.' : 'If interface work appears later, stop and activate the lightweight UI/UX module before building it.'}
${firstPhase.phaseType === 'implementation'
    ? `4. Identify the exact repo files you expect to change. If exact targets are unknown, propose likely areas and label them as assumptions.
5. Complete only the current phase implementation work.
6. Run or describe the required tests.
7. If this is a major build milestone, recommend whether recursive testing should run next.
8. Return a short handoff summary and suggested text for repo/mvp-builder-state.json updates.`
    : `4. Produce the planning outputs, decisions, open questions, and evidence notes required for this phase.
5. Do not invent implementation file changes unless the phase packet names them. If likely repo areas matter, label them as assumptions.
6. Run or describe the required inspection or review checks.
7. Return a short handoff summary and suggested text for repo/mvp-builder-state.json updates.`}
\`\`\`
`;
}

function buildRootContext(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  const isBuildReady = bundle.lifecycleStatus === 'BuildReady' || bundle.lifecycleStatus === 'ApprovedForBuild';
  const nextSteps = isBuildReady
    ? `- A coding agent can build directly from this package — open BUILDER_START_HERE.md for the canonical 10 load-bearing files.
- Status banner is informational; review-time critique items live in PROJECT_BRIEF.md but do not block a build pass.
- If you want a human-readable tour first, open BUSINESS_USER_START_HERE.md.`
    : `- Read this file first to understand the project.
- Then open 01_CONTEXT_RULES.md and the current phase files.
- If blockers are listed below, do not assume the package is ready to advance.`;
  const blockerSection = isBuildReady
    ? `## Review notes (non-blocking)
${listToBullets(bundle.blockingWarnings.map((warning) => formatWarningLine(warning)), 'No review notes recorded.')}

These are critique / questionnaire items surfaced for a human reviewer. They do not prevent a coding agent from building from the workspace; the BuildReady banner is set because the research extractions, schema, and depth artifacts are intact. See \`docs/BUILD_RECIPE.md\` for the build pass.`
    : `## Current blockers
${listToBullets(bundle.blockingWarnings.map((warning) => formatWarningLine(warning)), 'No blocker warnings recorded.')}`;
  return `# 00_PROJECT_CONTEXT

## What this file is for
This file gives the short version of the project so a new reader can understand the package quickly.

## Project
${input.productName}

## Current package status
${bundle.lifecycleStatus}

## What this package is for
This is a local, markdown-first planning and gating package for AI-assisted builds in Codex, Claude Code, and OpenCode.

## What you should do next
${nextSteps}

## Project-specific anchors
- Product idea: ${input.productIdea}
- Primary audience: ${context.primaryAudience}
- Problem statement: ${input.problemStatement}
- Desired output: ${input.desiredOutput}
- Must-have scope: ${context.mustHaves.join(', ') || 'Please review and confirm'}

${blockerSection}

## Current phase
${bundle.phases[0]?.name || 'Phase 1'}
`;
}

function buildContextRules() {
  return `# 01_CONTEXT_RULES

## What this file is for
This file explains the working rules for the package. Use it when you are unsure how to behave inside the workspace.

## Rules
- Treat markdown files in this package as the source of truth.
- Do not rely on hidden chat history.
- Work one phase at a time.
- Confirm the entry gate before implementation.
- Update the handoff summary before moving to the next phase.
- Keep prompts and context packets small enough to copy and paste cleanly.
- If a required answer is missing, stop and surface the blocker instead of inventing certainty.

## What you should do next
- Follow these rules while working in every phase.
- If a file seems unclear, trust the package files over memory.
- Stop and verify before moving to the next phase.

## Supported agent workflows
- Codex
- Claude Code
- OpenCode
`;
}

function buildHowToUseWithAgent(agentName: AgentName) {
  const promptFile =
    agentName === 'Codex'
      ? 'CODEX_HANDOFF_PROMPT.md'
      : agentName === 'Claude Code'
        ? 'CLAUDE_HANDOFF_PROMPT.md'
        : 'OPENCODE_HANDOFF_PROMPT.md';
  const startFile =
    agentName === 'Codex' ? 'CODEX_START_HERE.md' : agentName === 'Claude Code' ? 'CLAUDE_START_HERE.md' : 'OPENCODE_START_HERE.md';
  const heading =
    agentName === 'Codex'
      ? '02_HOW_TO_USE_WITH_CODEX'
      : agentName === 'Claude Code'
        ? '03_HOW_TO_USE_WITH_CLAUDE_CODE'
        : '04_HOW_TO_USE_WITH_OPENCODE';
  return `# ${heading}

## What this file is for
Use this file if you want a short workflow for ${agentName}.

## Start
1. Open ${startFile}.
2. Gather the files listed there.
3. Paste the contents of ${promptFile} into ${agentName}.
4. Attach or open the current phase packet files.
5. Ask for a handoff summary before moving to the next phase.

## For each phase
- Give ${agentName} the current phase folder files only, plus the root context files${agentName === 'OpenCode' ? ', AGENTS.md, and the OpenCode start file' : ''}.
- If the phase includes UI work, also give ${agentName} the /ui-ux/ files and require screenshot-based critique before final testing.
- Keep the context packet small.
- Do not include unrelated earlier phase files unless the current phase explicitly depends on them.
- Use /recursive-test/ only after a major build milestone. It is a quality-improvement loop, not a substitute for normal verification.
- After the phase completes, update repo/mvp-builder-state.json and the phase handoff summary.
`;
}

function buildAgentsMd() {
  return `# AGENTS

${CORE_AGENT_OPERATING_RULES}

## MVP Builder agent rules
- Work one phase at a time.
- Read the current phase packet before editing anything.
- Do not skip entry gates.
- Do not bypass blockers.
- Do not silently mark phases complete.
- Run the phase test plan.
- Write or update the handoff summary before moving on.
- Do not modify future phase files unless explicitly instructed.

## Supported local agent workflows
- Codex
- Claude Code
- OpenCode
`;
}

function buildMvpBuilderState(bundle: ProjectBundle): MvpBuilderState {
  const phaseEvidence = Object.fromEntries(
    bundle.phases.map((phase) => [
      phase.slug,
      {
        testsRun: [],
        changedFiles: [],
        verificationReportPath: `phases/${phase.slug}/VERIFICATION_REPORT.md`,
        exitGateReviewed: false,
        approvedToProceed: false,
        knownIssues: [],
        reviewerRecommendation: '',
        evidenceFiles: [
          `phases/${phase.slug}/VERIFICATION_REPORT.md`,
          `phases/${phase.slug}/EVIDENCE_CHECKLIST.md`,
          `phases/${phase.slug}/HANDOFF_SUMMARY.md`
        ]
      }
    ])
  );

  return {
    currentPhase: bundle.phases[0]?.index || 1,
    lifecycleStatus: bundle.lifecycleStatus,
    completedPhases: [],
    blockedPhases: bundle.blockingWarnings.length ? [bundle.phases[0]?.slug || 'phase-01'] : [],
    unresolvedBlockers: bundle.blockingWarnings.map((warning) => ({
      id: warning.id,
      title: warning.title,
      message: warning.message,
      action: warning.action
    })),
    lastHandoffSummary: 'No phase handoff has been recorded yet.',
    phaseEvidence
  };
}

function buildPhaseTestScript(phase: PhasePlan, input: ProjectInput, context: ProjectContext) {
  const commands = getPhaseTestProcedures(phase, input, context);
  const specificChecks = getPhaseTypeSpecificChecks(phase, context, input);
  const requirementScenarios = getPhaseRequirementScenarios(phase, context);
  const executableBlock = getExecutableTestBlockForPhase(phase);

  const requirementSection = requirementScenarios.length
    ? `## Requirement-driven scenario tests
These scenarios exist because the phase owns the listed REQ-IDs from requirements/ACCEPTANCE_CRITERIA.md. Use the matching entity sample in SAMPLE_DATA.md as input. Each scenario must be exercised once with the happy-path sample and once with the negative-path sample before this phase can pass.

${requirementScenarios.map((entry, i) => {
      const scenario = entry.scenario;
      const values = inferScenarioValues(scenario);
      const entityName = values?.entityName || fallbackEntityName(scenario.feature);
      const sampleSummary = values?.entitySampleSummary || 'realistic local data';
      const pattern = findAcceptancePattern(context.ontology, scenario.scenarioType);
      return `### Scenario ${i + 1} — ${entry.reqId}: ${sentenceCase(scenario.feature)}
Requirement: ${entry.reqId} (see requirements/ACCEPTANCE_CRITERIA.md)
Sample data file: SAMPLE_DATA.md, "${entityName}" section
Happy-path input summary: ${sampleSummary}
Actor: ${values?.actorExample || scenario.actor.name}
Given: ${values?.actorExample || scenario.actor.name} has ${entityName} data prepared with ${sampleSummary}.
When: ${scenario.userAction}
Then: ${scenario.systemResponse}
Negative case to also exercise: ${scenario.failureCase}
Verification method: ${pattern?.verificationMethod || 'Verify the stored record, resulting state, and visible outcome together.'}
Pass criteria: Both the happy-path and negative-path runs produce the expected stored records, role-appropriate visibility, and reviewer-readable outcome.
Fail criteria: The happy path is blocked by valid input, OR the negative path is accepted, OR the outcome is not reviewable.
Evidence to capture: One observation from the happy run and one from the negative run, naming the entity sample fields used (e.g. ${sampleSummary}).
Where to record: phases/${phase.slug}/TEST_RESULTS.md under "Scenario evidence: ${entry.reqId}".
Regression risk if skipped: ${(scenario.risks[0]?.verification || scenario.failureCase)} would not be caught before release.`;
    }).join('\n\n')}`
    : `## Requirement-driven scenario tests
This phase has no requirement IDs assigned in PHASE_PLAN.md, so no acceptance scenarios are exercised here. If this is wrong, update PHASE_PLAN.md to add a "Requirement IDs:" line for this phase and re-run \`npm run create-project\` (or hand-edit the phase plan). Always exercise the relevant happy-path and negative-path samples from SAMPLE_DATA.md when implementation phases borrow requirements from later phases.`;

  // Research-driven failure-mode coverage block: maps phase's owned REQs → workflows → workflow.failureModes,
  // and emits one explicit failure-mode test per researched failure mode using the workflow's acceptance pattern.
  const researchScenarioSection = (() => {
    if (!context.extractions) return '';
    const ex = context.extractions;
    const flat: Array<{ wf: typeof ex.workflows[number]; step: typeof ex.workflows[number]['steps'][number] }> = [];
    for (const wf of ex.workflows) for (const step of wf.steps) flat.push({ wf, step });
    const reqNums = (phase.requirementIds || [])
      .map((id) => Number.parseInt(String(id).replace(/^REQ-/i, ''), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const ownedWorkflows = new Map<string, typeof ex.workflows[number]>();
    for (const n of reqNums) {
      const slot = flat[n - 1];
      if (slot && !ownedWorkflows.has(slot.wf.id)) ownedWorkflows.set(slot.wf.id, slot.wf);
    }
    if (ownedWorkflows.size === 0) return '';

    const entityById = new Map(ex.entities.map((e) => [e.id, e]));
    const actorById = new Map(ex.actors.map((a) => [a.id, a]));

    const blocks: string[] = [];
    let idx = 1;
    for (const wf of ownedWorkflows.values()) {
      const primary = wf.entitiesTouched[0] ? entityById.get(wf.entitiesTouched[0]) : undefined;
      const sampleHint = primary
        ? Object.entries(primary.sample)
            .slice(0, 3)
            .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(', ')
        : 'happy-path sample from SAMPLE_DATA.md';
      const actor = actorById.get(wf.primaryActor)?.name || wf.primaryActor;

      blocks.push(`### Research scenario ${idx} — ${wf.name} (happy path)
Workflow: ${wf.name}
Acceptance pattern: ${wf.acceptancePattern}
Actor: ${actor}
Given: ${actor} prepares ${primary?.name || 'the touched entity'} with sample fields ${sampleHint}.
When: the workflow runs end-to-end as researched.
Then: every step's systemResponse occurs, an audit entry is written, and the actor's visibility scope is preserved.
Pass criteria: persisted state matches the acceptance pattern; the next-step queue (if applicable) advances correctly.
Fail criteria: any researched step's systemResponse is silently skipped, OR the audit entry is missing, OR the visibility scope leaks.
Where to record: phases/${phase.slug}/TEST_RESULTS.md`);
      idx += 1;

      for (const fm of wf.failureModes) {
        blocks.push(`### Research scenario ${idx} — ${wf.name} failure: ${fm.trigger}
Workflow: ${wf.name}
Trigger: ${fm.trigger}
Expected effect (must not happen silently): ${fm.effect}
Required mitigation in implementation: ${fm.mitigation}
Sample data: SAMPLE_DATA.md negative-path sample for ${primary?.name || 'the touched entity'}, with the field that triggers "${fm.trigger}" set to the failing value.
Pass criteria: the system surfaces the trigger to the actor, applies the researched mitigation, and writes an audit entry naming the failure.
Fail criteria: the system accepts the failing input silently, OR applies a different mitigation than researched, OR exposes a different actor's data.
Where to record: phases/${phase.slug}/TEST_RESULTS.md`);
        idx += 1;
      }
    }
    if (!blocks.length) return '';
    return `\n\n## Research-driven failure-mode coverage
These scenarios are derived directly from the workflows this phase owns and their researched \`failureModes\` (see research/extracted/workflows.json). Every failure mode must be exercised at least once; a missed failure mode is treated as a regression risk.

${blocks.join('\n\n')}`;
  })();

  // Phase B: surface research-derived vocabulary at the top of the test script so
  // the agent uses the actual entity names, sample IDs, and regulatory citations
  // when writing test commands instead of falling back to "the user" / "the system".
  const researchVocabBlock = (() => {
    if (!context.tokenPack.present) return '';
    const phaseRelevant = selectPhaseRelevant(context.extractions, phase.requirementIds);
    const tp = context.tokenPack.categorized;
    const lines: string[] = ['## Research vocabulary to use in this test script'];
    if (phaseRelevant.actors.length) lines.push(`- Actors: ${phaseRelevant.actors.join(', ')}`);
    if (phaseRelevant.entities.length) lines.push(`- Entities: ${phaseRelevant.entities.join(', ')}`);
    if (tp.sampleIds.length) lines.push(`- Sample IDs (use these in inputs): ${tp.sampleIds.slice(0, 8).join(', ')}`);
    if (phaseRelevant.workflows.length) lines.push(`- Workflows owned by this phase: ${phaseRelevant.workflows.join('; ')}`);
    if (tp.regulatoryCitations.length) lines.push(`- Regulatory citations to check against: ${tp.regulatoryCitations.join(', ')}`);
    if (phaseRelevant.risks.length) lines.push(`- Risks to verify: ${phaseRelevant.risks.slice(0, 2).join(' | ')}`);
    if (lines.length === 1) return '';
    lines.push('');
    lines.push('Every test step below should reference one of these by name. Generic phrases like "the user", "the system", or "the record" are not acceptable.');
    lines.push('');
    return lines.join('\n');
  })();

  return `# TEST_SCRIPT for ${phase.name}

## What this file is for
This file provides the concrete test steps for ${phase.name}. Run or follow these steps before completing VERIFICATION_REPORT.md.

## Phase
${phase.name}

${researchVocabBlock}## Phase requirement coverage
- Phase type: ${phase.phaseType}
- Requirement IDs owned by this phase: ${(phase.requirementIds && phase.requirementIds.length) ? phase.requirementIds.join(', ') : 'none'}
- Sample data source: SAMPLE_DATA.md (root of workspace)
- Acceptance criteria source: requirements/ACCEPTANCE_CRITERIA.md

## Commands or manual procedures
${commands.map((c, i) => `### Step ${i + 1}
Command or action: ${c.cmd}
Expected result: ${c.expected}
What this proves: ${c.proof}
Artifact to inspect: ${c.artifact}
What good output looks like: ${c.goodLooks}
What failure looks like: ${c.failureLooks}
Evidence that must exist: ${c.evidence}
Regression risk this protects against: ${c.regressionRisk}
Domain-specific reviewer question: ${c.reviewerQuestion}
Where to record: phases/${phase.slug}/TEST_RESULTS.md
What to do if this fails: Record the failure in TEST_RESULTS.md and revise the phase before advancing.`).join('\n\n')}

${requirementSection}${researchScenarioSection}

## Manual review checks
${specificChecks.map((c, i) => `### Manual check ${i + 1}
Check: ${c.check}
Pass criteria: ${c.pass}
Fail criteria: ${c.fail}
Artifact to inspect: ${c.artifact}
What good output looks like: ${c.goodLooks}
What failure looks like: ${c.failureLooks}
Evidence to capture: ${c.evidence}
Regression risk if skipped: ${c.regressionRisk}
Domain-specific reviewer question: ${c.domainScenario}
Where to record: phases/${phase.slug}/TEST_RESULTS.md`).join('\n\n')}

## Phase-specific exit gate tests
${phase.exitCriteria.map((c, i) => `### Exit gate check ${i + 1}
Check: ${c}
Pass criteria: The criterion is demonstrably met with evidence.
Fail criteria: The criterion is not met or has no supporting evidence.
Where to record: phases/${phase.slug}/VERIFICATION_REPORT.md`).join('\n\n')}

## Executable verification
The MVP Builder loop runner extracts shell commands from the fenced bash block below and runs each one in the package root. Add safe, deterministic commands that prove this phase works. The runner skips destructive commands automatically. Commands below are tuned for ${phase.phaseType} phases.

\`\`\`bash
${executableBlock}
\`\`\`

If this phase produces or depends on a running application, also append \`npm run probe -- --package=.\` to the block above so the loop has runtime evidence.

## Pass/fail criteria
- PASS: All commands or manual procedures succeed, all manual checks pass, every requirement-driven scenario produces happy-path and negative-path evidence, and exit gate criteria are met.
- FAIL: Any command, manual check, requirement scenario, or exit gate criterion fails or lacks evidence.

## Failure handling
- Record the specific failure in TEST_RESULTS.md, naming the failing REQ-ID and the entity sample used.
- Do not advance to the next phase.
- Revise the phase work and re-run this script.
- If the failure cannot be resolved, record it as a blocker in HANDOFF_SUMMARY.md and VERIFICATION_REPORT.md.

## Evidence recording
- Record all results in phases/${phase.slug}/TEST_RESULTS.md.
- For each REQ-ID exercised above, paste the happy-path and negative-path observation under a "Scenario evidence: REQ-XX" heading.
- Attach or reference real command output, scenario notes, or changed file paths.
- Do not fabricate or pre-fill results.
`;
}

function buildSampleData(input: ProjectInput, context: ProjectContext, phases: PhasePlan[]) {
  if (context.extractions) {
    return buildSampleDataFromResearch(input, context.extractions, phases);
  }
  const entities = context.ontology.entityTypes;
  const scenarios = context.ontology.featureScenarios;
  const reqIndexByEntity = new Map<string, number[]>();
  scenarios.forEach((scenario, idx) => {
    const main = scenario.entities[0];
    if (!main) return;
    const list = reqIndexByEntity.get(main.name) || [];
    list.push(idx);
    reqIndexByEntity.set(main.name, list);
  });

  const renderEntityBlock = (entity: typeof entities[number]) => {
    const sampleJson = JSON.stringify(entity.sample, null, 2);
    const negativeSample = { ...entity.sample } as Record<string, string | number | boolean | null>;
    const firstStringField = entity.fields.find((field) => field.type === 'string');
    const firstIdField = entity.fields.find((field) => field.type === 'id');
    if (firstStringField) negativeSample[firstStringField.name] = '';
    if (firstIdField) negativeSample[firstIdField.name] = null;
    const negativeJson = JSON.stringify(negativeSample, null, 2);
    const reqIds = (reqIndexByEntity.get(entity.name) || []).map((idx) => `REQ-${idx + 1}`);
    const reqLine = reqIds.length ? reqIds.join(', ') : 'No direct requirement reference yet.';
    const owningPhases = unique(
      (reqIndexByEntity.get(entity.name) || []).map((idx) => getRequirementPhaseSlug(idx, phases))
    );
    const phasesLine = owningPhases.length ? owningPhases.join(', ') : 'no phase has assigned this entity yet';

    return `## ${entity.name}

- Purpose: ${entity.description}
- Used by requirements: ${reqLine}
- Owning phases: ${phasesLine}
- Validation rules: ${entity.fields.slice(0, 3).map((field) => `${field.name} is required`).join('; ') || 'none recorded'}.
- Risks if sample is misused: ${context.ontology.riskTypes.filter((risk) => entity.riskTypes.includes(risk.name)).map((risk) => risk.description).join(' ') || 'data leakage, missing validation, or stale records.'}

### Happy-path sample (use as the realistic input in tests)
\`\`\`json
${sampleJson}
\`\`\`

### Negative-path sample (use to prove the system rejects invalid input)
\`\`\`json
${negativeJson}
\`\`\`
`;
  };

  return `# SAMPLE_DATA for ${input.productName}

## What this file is for
This is the single source of truth for sample data used by tests and demos in this package. Every TEST_SCRIPT.md, ACCEPTANCE_CRITERIA.md, and demo prompt should reference these records instead of inventing values.

## How to use this file
- For each requirement, find the entity it touches (see "Used by requirements" below).
- Copy the happy-path sample into your test as the realistic input.
- Copy the negative-path sample to prove the system rejects invalid or unauthorized data.
- Do not edit this file mid-test. If a sample is wrong, revise here and re-run the affected tests.

## Naming and traceability
- Each entity below maps to one or more REQ-IDs declared in requirements/ACCEPTANCE_CRITERIA.md and FUNCTIONAL_REQUIREMENTS.md.
- The "Owning phases" line tells you which phase folder owns the test for this entity.

${entities.map(renderEntityBlock).join('\n')}

## What this file is NOT
- Not a production seed file.
- Not a substitute for live integration data once a service is approved.
- Not a place to store secrets, real personal data, or production identifiers.

## Update rules
- Add a new section here when you introduce a new entity in DATA_MODEL.md.
- Keep field names identical to DATA_MODEL.md.
- Keep at least one happy-path and one negative-path sample per entity.
`;
}

function buildSampleDataFromResearch(
  input: ProjectInput,
  ex: ResearchExtractions,
  phases: PhasePlan[]
) {
  const actorById = new Map(ex.actors.map((a) => [a.id, a]));
  const entityById = new Map(ex.entities.map((e) => [e.id, e]));

  // Map REQ-N → entity primary touched. REQ-N flattening matches buildFunctionalRequirementsFromResearch.
  const reqIndexByEntityId = new Map<string, number[]>();
  let reqIdx = 0;
  for (const wf of ex.workflows) {
    for (let s = 0; s < wf.steps.length; s += 1) {
      const primary = wf.entitiesTouched[0];
      if (primary) {
        const list = reqIndexByEntityId.get(primary) || [];
        list.push(reqIdx);
        reqIndexByEntityId.set(primary, list);
      }
      reqIdx += 1;
    }
  }

  const renderBlock = (e: typeof ex.entities[number]) => {
    const reqIds = (reqIndexByEntityId.get(e.id) || []).map((idx) => `REQ-${idx + 1}`);
    const reqLine = reqIds.length ? reqIds.join(', ') : 'No direct requirement reference yet.';
    const owningPhases = unique(
      (reqIndexByEntityId.get(e.id) || []).map((idx) => getRequirementPhaseSlug(idx, phases))
    );
    const phasesLine = owningPhases.length ? owningPhases.join(', ') : 'no phase has assigned this entity yet';
    const ownerNames = e.ownerActors
      .map((aid) => actorById.get(aid)?.name)
      .filter(Boolean)
      .join(', ') || '—';

    // Happy-path: as researched
    const happy = e.sample as Record<string, unknown>;
    const happyJson = JSON.stringify(happy, null, 2);

    // Variant records: cycle each enum field through its values to give the agent
    // realistic boundary records for state-machine tests.
    const enumFields = e.fields.filter((f) => f.type === 'enum' && Array.isArray(f.enumValues) && f.enumValues.length > 1);
    const variants: Record<string, unknown>[] = [];
    for (const enumField of enumFields.slice(0, 2)) {
      const currentValue = happy[enumField.name];
      const altValue = (enumField.enumValues || []).find((v) => v !== currentValue);
      if (altValue === undefined) continue;
      const variant: Record<string, unknown> = { ...happy };
      // mutate the id-like field to make the record distinct
      const idField = e.fields.find((f) => /^id$|Id$/.test(f.name)) || e.fields[0];
      if (idField) {
        const baseId = String(happy[idField.name] ?? `${entitySlug(e.name)}-001`);
        variant[idField.name] = `${baseId}-${altValue}`;
      }
      variant[enumField.name] = altValue;
      variants.push(variant);
    }

    // Negative-path: blank out the first required string-like field; null-out the first id field
    const negative: Record<string, unknown> = { ...happy };
    const firstRequiredString = e.fields.find((f) => f.required && f.type === 'string' && !f.references);
    const firstIdField = e.fields.find((f) => /^id$|Id$/.test(f.name) && !f.references);
    if (firstRequiredString) negative[firstRequiredString.name] = '';
    if (firstIdField && firstIdField.required) negative[firstIdField.name] = null;
    const negativeJson = JSON.stringify(negative, null, 2);

    // FK cross-link list
    const fks = e.fields
      .filter((f) => f.references)
      .map((f) => {
        const target = entityById.get(f.references!);
        return target
          ? `\`${f.name}\` → ${target.name} (\`${target.id}\`).`
          : `\`${f.name}\` → \`${f.references}\`.`;
      });

    const variantsBlock = variants.length
      ? variants
          .map(
            (v, i) => `### Variant ${i + 1} sample (use to test enum/state branching)
\`\`\`json
${JSON.stringify(v, null, 2)}
\`\`\``
          )
          .join('\n\n')
      : '';

    return `## ${e.name} (\`${e.id}\`)

- Purpose: ${e.description}
- Owner actors: ${ownerNames}
- Used by requirements: ${reqLine}
- Owning phases: ${phasesLine}
- Foreign keys: ${fks.length ? fks.join(' ') : 'none declared'}
- Validation rules: ${e.fields.filter((f) => f.required).slice(0, 4).map((f) => `\`${f.name}\` is required`).join('; ') || 'none recorded'}.

### Happy-path sample (use as the realistic input in tests)
\`\`\`json
${happyJson}
\`\`\`
${variantsBlock ? `\n${variantsBlock}\n` : ''}
### Negative-path sample (use to prove the system rejects invalid input)
\`\`\`json
${negativeJson}
\`\`\`
`;
  };

  return `# SAMPLE_DATA for ${input.productName}

> Generated from research extractions. Each entity below maps directly to one record in \`research/extracted/entities.json\`. Variant samples cycle the entity's enum fields so tests can prove state-machine transitions; the negative-path sample blanks a required field so the rejection path can be exercised.

## How to use this file
- For each requirement, find the entity it touches (see "Used by requirements").
- Copy the happy-path sample into your test as the realistic input.
- Use the variant samples to exercise enum / state-machine branches.
- Copy the negative-path sample to prove the system rejects invalid input.
- Do not edit this file mid-test. If a sample is wrong, revise here and re-run the affected tests.

## Foreign keys at a glance
${ex.entities
    .flatMap((e) =>
      e.fields
        .filter((f) => f.references)
        .map((f) => `- ${e.name}.\`${f.name}\` → ${entityById.get(f.references!)?.name || f.references}`)
    )
    .join('\n') || '- None declared in research extractions.'}

${ex.entities.map(renderBlock).join('\n')}

## What this file is NOT
- Not a production seed file.
- Not a substitute for live integration data once a service is approved.
- Not a place to store secrets, real personal data, or production identifiers.
`;
}

function getPhaseRequirementScenarios(phase: PhasePlan, context: ProjectContext) {
  const reqIds = phase.requirementIds || [];
  if (!reqIds.length) return [] as Array<{ reqId: string; index: number; scenario: OntologyFeatureScenario }>;
  return reqIds
    .map((reqId) => {
      const match = reqId.match(/^REQ-(\d+)$/i);
      if (!match) return null;
      const idx = Number.parseInt(match[1], 10) - 1;
      const scenario = context.ontology.featureScenarios[idx];
      if (!scenario) return null;
      return { reqId, index: idx, scenario };
    })
    .filter((entry): entry is { reqId: string; index: number; scenario: OntologyFeatureScenario } => entry !== null);
}

function getExecutableTestBlockForPhase(phase: PhasePlan): string {
  if (phase.phaseType === 'implementation') {
    return `npm run typecheck
npm run build
npm run smoke
npm run validate -- --package=.`;
  }
  if (phase.phaseType === 'verification') {
    return `npm run typecheck
npm run validate -- --package=.
npm run traceability -- --package=.`;
  }
  if (phase.phaseType === 'finalization') {
    return `npm run typecheck
npm run validate -- --package=.
npm run traceability -- --package=.
npm run status -- --package=.`;
  }
  return `npm run typecheck
npm run validate -- --package=.`;
}

function buildPhaseTestResults(phase: PhasePlan) {
  return `# TEST_RESULTS for ${phase.name}

## What this file is for
Record the test results for this phase here. Do not pre-fill with passing results.

## Date
pending

## Phase name
${phase.name}

## Tester/agent
pending

## Commands run
-

## Manual checks completed
-

## Failures found
-

## Fixes applied
-

## Evidence files reviewed
-

## Final result: pending
Allowed: pending | pass | fail

## Recommendation: pending
Allowed: pending | proceed | revise | block

## Notes
-
`;
}

function buildTestingStrategy(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  const isTechnical = input.track === 'technical';
  const isBeginner = input.level === 'beginner';

  const domainScenarios = getDomainTestScenarios(context.domainArchetype, context.riskFlags);

  return `# TESTING_STRATEGY for ${input.productName}

## What testing means for this project
Testing means verifying that every generated artifact is project-specific, every gate is consistent, every evidence file is real, and every handoff preserves context. This is a ${context.profile.label} project for ${context.primaryAudience}.

## Project-specific test scenarios
${domainScenarios.length ? domainScenarios.map((s) => `- ${s}`).join('\n') : '- No domain-specific scenarios were inferred. Add scenarios based on the must-have features and risk flags.'}

## Types of tests expected

### Smoke tests
- Confirm BUSINESS_USER_START_HERE.md, CURRENT_STATUS.md, COPY_PASTE_PROMPTS.md, MODULE_MAP.md, WHAT_TO_IGNORE_FOR_NOW.md, and FINAL_CHECKLIST.md exist.
- Confirm every required root file exists.
- Confirm every required phase file exists.
- Confirm AGENTS.md includes the Core Agent Operating Rules.
- Confirm generated packages can be created, validated, and advanced.
- Confirm /product-strategy/, /requirements/, /security-risk/, /integrations/, and /architecture/ are generated.
- Confirm /ui-ux/ and /recursive-test/ are generated.

### Regression tests
- Confirm artifact completeness after each phase.
- Confirm gate consistency across phases.
- Confirm no contradictions between scorecard, lifecycle, gates, and recommendations.

### Gate verification tests
- Confirm entry gates match phase dependencies.
- Confirm exit gates include measurable success criteria.
- Confirm Phase 1 does not require impossible prior-phase evidence.
- Confirm later phases reference prior handoff and exit evidence.

### UI and screenshot tests
- ${context.uiRelevant ? 'Confirm /ui-ux/ exists and is used before and during UI implementation.' : 'Confirm the lightweight /ui-ux/ guidance still exists for future interface work.'}
- Confirm screenshot review guidance exists.
- Confirm UI_UX_GATE.md includes auto-fail conditions.
- Confirm accessibility and responsive checks exist for UI projects.

### Recursive quality-loop tests
- Confirm /recursive-test/ exists.
- Confirm recursive test prompt includes 0-100 scoring, loop-until-target behavior, default 90/100 target, and max iteration guidance.
- Confirm recursive testing references test scripts, regression suite, step-by-step documentation, handoff quality, and generated artifact usefulness.
- Confirm recursive testing is described as a quality-improvement loop, not a replacement for regression testing.

### Artifact quality tests
- Confirm every phase deliverable references ${context.primaryFeature}.
- Confirm no phase output is generic boilerplate.
- Confirm handoff summaries are not blank templates.
- Confirm Product Goal and Scope includes MVP scope and out-of-scope decisions.
- Confirm What the App Must Do includes acceptance criteria and open questions.
- Confirm Private Data and Safety Check includes data classification and secret handling.
- Confirm External Services and Setup includes environment variables and mocking strategy.
- Confirm Technical Plan includes a system overview and data model.

### Prompt quality tests
- Confirm build prompts reference the phase goal and entry gate.
- Confirm handoff prompts include current phase context.

### Handoff continuity tests
- Confirm NEXT_PHASE_CONTEXT.md reflects the current phase.
- Confirm Codex and Claude handoff prompts include relevant phase context.
- Confirm the next agent can understand what changed, passed, failed, and remains risky.

${isBeginner ? `### Beginner-readability tests
- Confirm language is plain and jargon is explained.
- Confirm checklists are concrete and actionable.
- Confirm step-by-step guidance is present.` : ''}

## What must be tested after every phase
- Phase deliverables match the phase goal.
- Entry gate criteria were checked.
- Exit gate criteria are met.
- TEST_SCRIPT.md was followed.
- TEST_RESULTS.md was recorded.
- VERIFICATION_REPORT.md was completed.

## What must be tested before moving to the next phase
- All TEST_SCRIPT.md steps pass or failures are explicitly accepted.
- TEST_RESULTS.md has a final result (pass or fail).
- VERIFICATION_REPORT.md has a result and recommendation.
- EVIDENCE_CHECKLIST.md items are checked.
- No contradictions between test results, verification report, and gate status.

## What must be tested before final package handoff
- All phase-specific tests pass.
- The full regression suite from /regression-suite/ passes.
- ${context.uiRelevant ? 'The UI/UX gate passes with screenshot evidence.' : 'If UI was introduced later, the UI/UX gate was run before final handoff.'}
- The recursive quality loop has been run after major build completion when quality risk remains high.
- All TEST_RESULTS.md files are complete.
- No gates, scorecards, verification reports, or recommendations contradict each other.
- Handoff files include real project context.

## How to record evidence
- Use TEST_RESULTS.md in each phase folder.
- Use /regression-suite/REGRESSION_RESULTS_TEMPLATE.md for regression runs.
- Use /ui-ux/UI_UX_HANDOFF.md plus screenshot notes for UI evidence.
- Use /recursive-test/ITERATION_LOG.md and /recursive-test/RECURSIVE_TEST_REPORT.md for recursive quality evidence.
- Reference real file paths, command output, scenario notes, or decision records.

## What counts as unacceptable evidence
- Vague claims without file references.
- Generic phrases like "looks good" or "reviewed".
- Chat history or informal notes.
- Placeholder or template text that was not updated.
- Fabricated command output.
- TEST_RESULTS.md that defaults to pass.

## How to handle failed tests
- Record the specific failure in TEST_RESULTS.md.
- Do not advance to the next phase.
- Revise the phase work and re-run the test.
- If the failure cannot be resolved, record it as a blocker.
- Document the failure in VERIFICATION_REPORT.md and HANDOFF_SUMMARY.md.
`;
}

function buildRegressionTestPlan(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  const phaseSlugs = bundle.phases.map((p) => p.slug);

  return `# REGRESSION_TEST_PLAN for ${input.productName}

## Project-wide regression checklist

### Artifact completeness
- [ ] Required root files exist: BUSINESS_USER_START_HERE.md, CURRENT_STATUS.md, COPY_PASTE_PROMPTS.md, MODULE_MAP.md, WHAT_TO_IGNORE_FOR_NOW.md, FINAL_CHECKLIST.md, START_HERE.md, PROJECT_BRIEF.md, PHASE_PLAN.md, SCORECARD.md, TESTING_STRATEGY.md, REGRESSION_TEST_PLAN.md, TEST_SCRIPT_INDEX.md, AGENTS.md
- [ ] /product-strategy/ exists with all required files.
- [ ] /requirements/ exists with all required files.
- [ ] /security-risk/ exists with all required files.
- [ ] /integrations/ exists with all required files.
- [ ] /architecture/ exists with all required files.
- [ ] /ui-ux/ exists with all required files.
- [ ] /recursive-test/ exists with all required files.
- [ ] Required phase files exist in every phase folder: PHASE_BRIEF.md, ENTRY_GATE.md, EXIT_GATE.md, TEST_PLAN.md, TEST_SCRIPT.md, TEST_RESULTS.md, VERIFICATION_REPORT.md, EVIDENCE_CHECKLIST.md, HANDOFF_SUMMARY.md, NEXT_PHASE_CONTEXT.md
- [ ] No phase is missing TEST_PLAN.md, TEST_SCRIPT.md, or TEST_RESULTS.md.
- [ ] Regression suite exists at /regression-suite/README.md.

### Agent operating rules
- [ ] Every generated AGENTS.md includes all 4 Core Agent Operating Rules exactly.

### Gate consistency
- [ ] Entry gates match phase dependencies.
- [ ] Exit gates include measurable success criteria.
- [ ] Phase 1 does not require impossible prior-phase evidence.
- [ ] Later phases correctly reference prior handoff and exit evidence.
- [ ] Gate status, scorecard, lifecycle status, and recommendation do not contradict each other.

### Evidence quality
- [ ] Evidence files exist where required.
- [ ] Evidence is specific to ${context.primaryFeature}, not generic.
- [ ] No fake command output is accepted.
- [ ] No report says "pass/proceed" while the body says blocked, failed, pending, or unverified.
- [ ] TEST_RESULTS.md does not default to pass.
- [ ] Product strategy, requirements, security, integrations, and architecture files all contain their required sections.

### Testing workflow
- [ ] Every phase has a test plan (TEST_PLAN.md).
- [ ] Every phase has a test script or manual test procedure (TEST_SCRIPT.md).
- [ ] Every phase has a test results template (TEST_RESULTS.md).
- [ ] The step-by-step guide tells the user to test before verification.
- [ ] The next-phase flow requires test evidence before proceeding.
- [ ] START_HERE.md, STEP_BY_STEP_BUILD_GUIDE.md, and README.md all reference the UI/UX and recursive testing modules.
- [ ] Beginner-facing docs clearly separate business-user files from AI-agent files.

### UI and recursive quality checks
- [ ] UI files include screenshot review guidance.
- [ ] UI_UX_GATE.md includes auto-fail conditions.
- [ ] RECURSIVE_TEST_PROMPT.md includes 0-100 scoring, loop-until-target behavior, and the default 90/100 target.
- [ ] SCORING_RUBRIC.md includes score caps.
- [ ] RECURSIVE_TEST_REPORT.md includes per-use-case scores.
- [ ] Non-UI projects still receive lightweight UI/UX guidance.

### Handoff continuity
- [ ] NEXT_PHASE_CONTEXT.md reflects the current phase.
- [ ] Codex and Claude handoff prompts include relevant phase context.
- [ ] Handoff files are not blank templates.
- [ ] The next agent can understand what changed, passed, failed, and remains risky.

### Local-first and markdown-first constraints
- [ ] Generated package does not require hosted services.
- [ ] Generated package does not require database/auth/SaaS infrastructure unless the project explicitly needs it.
- [ ] Core workflow remains file-based and local.
- [ ] Markdown artifacts remain the source of truth.
- [ ] Architecture does not contradict the MVP scope or the out-of-scope list.

${context.profile.key.endsWith('business') ? `### Business validation
- [ ] Business acceptance criteria reference ${context.primaryAudience}.
- [ ] Business value proof is project-specific.
- [ ] Stakeholder workflows are named explicitly.` : `### Technical validation
- [ ] Technical acceptance criteria reference ${context.primaryFeature}.
- [ ] Data boundaries and interfaces are explicit.
- [ ] Implementation targets are named or labelled as assumptions.`}

${input.level === 'beginner' ? `### Beginner usability
- [ ] Language is plain and jargon is explained.
- [ ] Checklists are concrete and actionable.
- [ ] Step-by-step guidance is present in every phase.` : ''}

## Reusable tests that should be run after every phase
1. Confirm every phase folder has all required files.
2. Confirm TEST_RESULTS.md is not pre-filled with pass.
3. Confirm VERIFICATION_REPORT.md result and recommendation are consistent.
4. Confirm no phase test result defaults to pass.
5. Confirm handoff summaries are updated.
6. Confirm UI/UX or recursive-test references were not removed from root guidance files.

## Tests for generated artifact completeness
- Confirm all ${phaseSlugs.length} phase folders exist.
- Confirm each phase folder has at least 10 files.
- Confirm /ui-ux/ contains the required 10 files.
- Confirm /recursive-test/ contains the required 10 files.

## Tests for gate consistency
- Confirm gates/gate-01-entry.md does not mention prior phase handoff.
- Confirm gates/gate-02-entry.md mentions previous phase handoff.

## Tests for evidence/report consistency
- Confirm SCORECARD.md does not say pass while VERIFICATION_REPORT.md says blocked.
- Confirm no report body contradicts its header.
- Confirm recursive-test/FINAL_QUALITY_GATE.md does not allow PASS below 90/100.

## Tests for no fake or placeholder evidence
- Confirm no generated file contains fabricated command output.
- Confirm TEST_RESULTS.md files default to pending.

## Tests for beginner usability where applicable
${input.level === 'beginner' ? '- Confirm every phase folder includes plain-language step guidance.' : '- Beginner usability checks not applicable for this user level.'}

## Tests for agent handoff quality
- Confirm CODEX_START_HERE.md, CLAUDE_START_HERE.md, and OPENCODE_START_HERE.md exist.
- Confirm handoff prompts reference the first phase by name.
- Confirm agent start files explain when to use UI/UX review and recursive testing.

## Tests for local-only execution
- Confirm no generated file requires a network connection.
- Confirm no generated file references hosted services for core workflow.
`;
}

function buildBuildTarget(input: ProjectInput, context: ProjectContext) {
  return `# BUILD_TARGET

## Current default target
Review and confirm the build target before implementation starts.

- Planning package only: generate the MVP Builder workspace and keep implementation deferred.
- Runnable MVP: build the smallest honest local-first application that proves the core workflow.
- Production application: complete the full implementation lifecycle, release documentation, operational handoff, and final state progression.

## Recommended target for this package
- Recommended starting point: Runnable MVP unless the sponsor explicitly approves production scope, production support expectations, and the extra delivery time that comes with them.
- Upgrade to production mode only when deployment, operations, rollback, observability, and support ownership are all expected outcomes.

## Signals that production mode is required
- The team expects a complete end-to-end release rather than a thin slice.
- The product must support real users, production incidents, and operational handoff.
- The project needs a deployment plan, environment setup guide, rollback plan, and release gate.
- The final score must represent full lifecycle completion, not only package quality or MVP functionality.

## Current product context
- Product: ${input.productName}
- Audience: ${context.primaryAudience}
- Primary workflow: ${context.workflowAnchor}
- Constraints: ${context.constraints.join('; ') || 'Review and confirm constraints before choosing the target.'}

## Decision record
- Selected target: review and confirm
- Approved by: pending
- Date: pending
- Notes: Do not claim production readiness until the production gate, release checklist, and final lifecycle state are complete.
`;
}

function buildProductionScope(input: ProjectInput, context: ProjectContext) {
  return `# PRODUCTION_SCOPE

## What production means for this project
Production mode means the team is committing to a complete, supportable release for ${input.productName}, not only a runnable demo or thin-slice workflow proof.

## In scope for production mode
${listToBullets(
  [
    `Complete implementation of the primary workflow: ${context.workflowAnchor}`,
    `Real validation, error handling, and recovery behavior for the main user-facing paths`,
    `A documented persistence strategy that matches the actual architecture and constraints`,
    `Role or permission boundaries where the product requires them`,
    `A deployment plan, environment setup guide, and release checklist`,
    `Operational handoff, rollback guidance, and production-readiness verification`
  ],
  'Review and confirm what complete production scope means for this app.'
)}

## Still out of scope unless explicitly approved
${listToBullets(context.nonGoals, 'No additional out-of-scope items are recorded yet.')}

## Production-specific completion checks
- The application must be fully implemented for the approved scope.
- The MVP Builder lifecycle must be advanced phase by phase instead of staying in an early planning phase.
- The release gate must pass with real evidence.
- Final reports, scorecards, and state files must agree.

## Approval notes
- Production scope approved: pending
- Approver: pending
- Scope caveats: pending
`;
}

function buildDeploymentPlan(input: ProjectInput, context: ProjectContext) {
  return `# DEPLOYMENT_PLAN

## Release objective
Explain how ${input.productName} will move from local development into its intended release environment.

## Intended runtime
- Deployment model: review and confirm
- Hosting target: review and confirm
- Build artifact: review and confirm
- Data or file storage approach: review and confirm

## Environment flow
1. Development: local-first setup for builders and reviewers.
2. Staging or pre-release validation: review and confirm whether this exists.
3. Production release: only after production gate and release checklist both pass.

## Deployment steps
- Build the application with the exact production command set.
- Verify environment variables from ENVIRONMENT_SETUP.md.
- Run regression, smoke, and release-critical checks.
- Record deployment output and final status in FINAL_DEPLOYMENT_STATUS.md.

## Risks to address before release
${listToBullets(context.risks, 'Record the major release risks before production deployment starts.')}

## Ownership
- Release owner: pending
- Rollback owner: pending
- On-call or incident contact: pending
`;
}

function buildEnvironmentSetup(input: ProjectInput, context: ProjectContext) {
  return `# ENVIRONMENT_SETUP

## Purpose
Document every environment dependency needed to build, test, deploy, and support ${input.productName}.

## Required environment variables
- Name: pending
  Purpose: pending
  Required or optional: pending
  Example placeholder: pending
  Secret or non-secret: pending
  Local setup notes: pending

## Local prerequisites
${listToBullets(
  [
    'Node.js version and package manager choice',
    'Any local file, storage, or runtime dependency',
    'Any mock service required before real integrations exist'
  ],
  'Record local prerequisites before implementation starts.'
)}

## Production environment notes
- Runtime environment: pending
- Secret management approach: pending
- Logging and monitoring integration points: pending
- Backup or restore dependencies: pending

## Validation rule
If this file is incomplete, the production gate must fail.
`;
}

function buildProductionReadinessChecklist() {
  return `# PRODUCTION_READINESS_CHECKLIST

- [ ] BUILD_TARGET.md explicitly says the project is in production mode.
- [ ] PRODUCTION_SCOPE.md is approved and still matches the implemented scope.
- [ ] DEPLOYMENT_PLAN.md is complete and current.
- [ ] ENVIRONMENT_SETUP.md lists the required environment configuration.
- [ ] SECURITY_REVIEW.md is complete.
- [ ] PERFORMANCE_PLAN.md is complete.
- [ ] OPERATIONS_RUNBOOK.md is complete.
- [ ] INCIDENT_RESPONSE_GUIDE.md is complete.
- [ ] ROLLBACK_PLAN.md is complete.
- [ ] RELEASE_CHECKLIST.md is complete.
- [ ] Required build, test, regression, and smoke commands have been run.
- [ ] Final lifecycle state has advanced beyond planning-only phases.
- [ ] FINAL_RELEASE_REPORT.md and FINAL_GATE_REPORT.md match the actual state of the repo.
`;
}

function buildOperationsRunbook(input: ProjectInput, context: ProjectContext) {
  return `# OPERATIONS_RUNBOOK

## Service overview
- Product: ${input.productName}
- Main workflow: ${context.workflowAnchor}
- Intended operators or support owners: review and confirm

## Daily or regular checks
- Confirm the latest release status.
- Confirm logs, alerts, or error summaries are healthy.
- Confirm critical workflows still pass the smoke and regression checks.

## Operational commands
- Build command: pending
- Start or serve command: pending
- Health-check command: pending
- Log inspection command: pending
- Rollback trigger command: pending

## Common failure modes
${listToBullets(context.risks, 'Add realistic operational failure modes before release.')}

## Escalation path
- First responder: pending
- Escalation contact: pending
- Incident communication channel: pending
`;
}

function buildIncidentResponseGuide(input: ProjectInput) {
  return `# INCIDENT_RESPONSE_GUIDE

## Goal
Define what the team should do when ${input.productName} fails in a production context.

## Initial response steps
1. Confirm whether the incident is real and currently active.
2. Identify the affected workflow, user role, or release.
3. Record the first observed symptom and the time it started.
4. Decide whether to mitigate in place or roll back.

## Severity guide
- Critical: users cannot complete the core workflow or sensitive data is at risk.
- Important: major workflow degradation with a workaround.
- Minor: limited degradation without major user impact.

## Required incident evidence
- Relevant command output
- Logs or screenshots
- Affected release or commit reference
- User-visible impact summary
- Decision taken: mitigate, hotfix, or rollback

## Post-incident follow-up
- Update FINAL_RECOVERY_SUMMARY.md or the relevant handoff file.
- Update the runbook if the failure mode was missing.
- Add regression coverage if the bug could recur.
`;
}

function buildRollbackPlan(input: ProjectInput) {
  return `# ROLLBACK_PLAN

## Purpose
Explain how to safely back out a bad release of ${input.productName}.

## Rollback triggers
- Production smoke test fails after release.
- A critical workflow is broken for real users.
- Security, privacy, or data-integrity risk is discovered.
- Release artifacts or environment configuration are inconsistent.

## Rollback steps
1. Identify the last known good release.
2. Stop or isolate the failing release path if needed.
3. Restore the previous release or artifact.
4. Re-run smoke and release-critical checks.
5. Record the outcome in FINAL_DEPLOYMENT_STATUS.md and FINAL_RECOVERY_SUMMARY.md.

## Preconditions
- The previous good release must be identifiable.
- The deployment plan must describe how to restore a prior build.
- The release owner and rollback owner must be known.

## Ownership
- Rollback owner: pending
- Validation owner after rollback: pending
`;
}

function buildSecurityReview(input: ProjectInput, context: ProjectContext) {
  return `# SECURITY_REVIEW

## Product risk context
- Product: ${input.productName}
- Sensitive workflows or data: ${context.riskAnchor}

## Review areas
- Authentication and authorization boundaries: review and confirm
- Data exposure risks: review and confirm
- Secrets handling: review and confirm
- Logging or audit needs: review and confirm
- Dependency and supply-chain review: review and confirm

## Security release checks
- Sensitive data handling matches DATA_CLASSIFICATION.md.
- Secrets handling matches SECRET_MANAGEMENT.md and ENVIRONMENT_SETUP.md.
- Role boundaries are tested if the product requires them.
- Known security caveats are recorded before release.

## Result
- Status: pending
- Reviewer: pending
- Date: pending
- Blocking issues: pending
`;
}

function buildPerformancePlan(input: ProjectInput, context: ProjectContext) {
  return `# PERFORMANCE_PLAN

## Goal
Define what acceptable performance means for ${input.productName}.

## Critical paths
${listToBullets(
  [
    context.workflowAnchor,
    `Initial load for the main user-facing workflow`,
    `Save, update, or transition actions in the core flow`
  ],
  'Record the critical performance paths before release.'
)}

## Expected checks
- Build size or startup time review
- Main workflow responsiveness review
- Error-path and degraded-state behavior review
- Performance regression notes for future releases

## Constraints
${listToBullets(context.constraints, 'Record the performance-relevant constraints for this project.')}

## Result tracking
- Baseline recorded: pending
- Observed risks: pending
- Follow-up needed before release: pending
`;
}

function buildReleaseChecklist() {
  return `# RELEASE_CHECKLIST

- [ ] Production scope is approved.
- [ ] Required implementation is complete.
- [ ] Final build command passed.
- [ ] Test command passed.
- [ ] Smoke command passed.
- [ ] Regression command passed.
- [ ] Security review is complete.
- [ ] Performance plan has been reviewed.
- [ ] Deployment plan is complete.
- [ ] Environment setup is complete.
- [ ] Operations runbook is complete.
- [ ] Incident response guide is complete.
- [ ] Rollback plan is complete.
- [ ] Final lifecycle state is correct.
- [ ] Final handoff and release reports are complete.
`;
}

function buildProductionGate() {
  return `# PRODUCTION_GATE

## This gate passes only when
- The selected build target is explicitly production.
- The full implementation is complete for the approved scope.
- The application has passed build, test, smoke, and regression checks.
- Deployment, environment, rollback, and operations documents are complete.
- Final lifecycle state and final reports agree.

## This gate must fail when
- The project is only a runnable MVP.
- Required phases were never advanced.
- The release checklist is incomplete.
- Evidence is generic, missing, or contradictory.
- Final state files still say the project is in an early planning phase.

## Required evidence
- PRODUCTION_READINESS_CHECKLIST.md
- RELEASE_CHECKLIST.md
- FINAL_RELEASE_REPORT.md
- FINAL_GATE_REPORT.md
- FINAL_DEPLOYMENT_STATUS.md
`;
}

function buildFinalReleaseReport() {
  return `# FINAL_RELEASE_REPORT

## Release summary
- Release target: pending
- Scope delivered: pending
- Final lifecycle state: pending
- Final recommendation: pending

## Commands run
- pending

## Test summary
- pending

## Release risks or caveats
- pending

## Evidence files
- pending
`;
}

function buildFinalHandoff() {
  return `# FINAL_HANDOFF

## What was delivered
- pending

## What the next owner must know
- pending

## Operations handoff
- pending

## Remaining risks
- pending
`;
}

function buildFinalGateReport() {
  return `# FINAL_GATE_REPORT

## Entry gate
- pending

## Implementation gate
- pending

## Test gate
- pending

## Regression gate
- pending

## Security gate
- pending

## Release gate
- pending

## Exit gate
- pending
`;
}

function buildFinalScorecard(bundle?: ProjectBundle, extractions?: ResearchExtractions) {
  if (!bundle) {
    return `# FINAL_SCORECARD

## Final score
- pending

## Category breakdown
- pending

## Hard caps
- pending
`;
  }
  const det = bundle.archetypeDetection;
  const fit = bundle.semanticFit;
  const categoryLines = bundle.score.categories
    .map((c) => `| ${c.label} | ${c.bucket} | ${c.score}/${c.max} |`)
    .join('\n');
  const adjustmentLines =
    bundle.score.adjustments.length === 0
      ? '- none'
      : bundle.score.adjustments.map((a) => `- ${a}`).join('\n');
  // RC2: classify the workspace's research source so the scorecard can call
  // out demo/client-readiness honestly. Synth is structurally strong but
  // cannot stand in for real product judgment.
  const inferredSource: 'synthesized' | 'agent-recipe' | 'imported-real' | 'manual' | 'unknown' = (() => {
    const meta = extractions?.meta;
    if (!meta) return bundle.hasResearchExtractions ? 'manual' : 'unknown';
    if (meta.researchSource) return meta.researchSource;
    if (meta.researcher === 'mock') return 'synthesized';
    if (meta.researcher === 'anthropic-sdk' || meta.researcher === 'claude-code-session') return 'agent-recipe';
    return 'manual';
  })();
  const demoReadinessBlock =
    inferredSource === 'synthesized'
      ? `## Demo / client readiness

- **Production-ready (structural):** depends on quality audit total ≥ 85
- **Research-grounded:** ${bundle.hasResearchExtractions ? 'yes' : 'no'}
- **Demo / client-ready:** **no — research source is synthesized**

Synthesized research is a deterministic regression harness. It proves the schema,
generator, audit, and file-emission paths work, but it does not produce real
product judgment (idea critique, competing alternatives, market risk). To unlock
client/demo readiness, run docs/RESEARCH_RECIPE.md inside an LLM agent and
regenerate with \`--research-from=<dir>\`. The audit's \`demoReady\` flag
remains \`false\` for synthesized output regardless of headline score.
`
      : inferredSource === 'agent-recipe' || inferredSource === 'imported-real'
        ? `## Demo / client readiness

- **Production-ready (structural):** depends on quality audit total ≥ 85
- **Research-grounded:** ${bundle.hasResearchExtractions ? 'yes' : 'no'}
- **Research source:** ${inferredSource}
- **Demo / client-ready:** \`true\` only when audit ≥ 95, no expert cap fires, idea critique + competing alternatives + screens + DB schema + test cases all populated.

Run \`npm run audit\` to surface the final demoReady verdict and any reasons it is currently \`false\`.
`
        : `## Demo / client readiness

- **Production-ready (structural):** depends on quality audit total ≥ 85
- **Research-grounded:** ${bundle.hasResearchExtractions ? 'yes' : 'no'}
- **Research source:** unknown / manual fixture — do not promote to client demo without verifying provenance.

Set \`meta.researchSource\` explicitly in research/extracted/meta.json so this scorecard reflects intent.
`;
  return `# FINAL_SCORECARD

## Headline

- Build readiness: **${bundle.score.buildReadiness}/100**
- Product fit: **${bundle.score.productFit}/100**
- Combined: **${bundle.score.total}/100**
- Rating: **${bundle.score.rating}**
- Lifecycle: ${bundle.lifecycleStatus}

## Why two scores

Build readiness measures whether the workspace is structurally complete and well-formed (problem framing, audience clarity, workflow detail, constraints, implementation readiness, handoff completeness). Product fit measures whether the workspace actually describes the right product (risk coverage, acceptance quality, testability, semantic fit between brief and generated requirements).${bundle.hasResearchExtractions ? '' : ' High build readiness with low product fit means the workspace looks polished but the brief lacked research extractions to ground entities, actors, and workflows.'}

${bundle.hasResearchExtractions
    ? `## Source of truth

This workspace was generated from research extractions in \`research/extracted/\`. Entities, actors, workflows, and requirements come from the research. Run \`npm run audit\` to verify the extractions hold up against the expert rubric and audit-exit criteria (see docs/RESEARCH_RECIPE.md).`
    : `## Source of truth

This workspace was generated **without research extractions** via the legacy templated path. The supported path is to run docs/RESEARCH_RECIPE.md inside your coding agent and regenerate with \`--research-from=<dir>\`. Without research, requirements and sample data use a generic baseline.

## Semantic fit between brief and generated requirements

- Jaccard score: **${fit.score.toFixed(2)}** (${fit.verdict})
- Input tokens: ${fit.inputTokenCount}
- Output tokens: ${fit.outputTokenCount}
- Overlap tokens: ${fit.overlapTokenCount}

- \`high\` — overlap is healthy; the generic baseline mostly tracks the brief.
- \`low\` — overlap is weak; produce research extractions before treating the package as build-capable.
- \`critical\` — overlap is far below threshold; do not build from this workspace.`}

## Category breakdown

| Category | Bucket | Score |
|---|---|---|
${categoryLines}

## Score adjustments applied

${adjustmentLines}

## Hard caps in effect

- Build readiness capped at 71 if lifecycle is Blocked.
- Product fit capped at 71 if semantic-fit verdict is \`low\`.
- Product fit capped at 30 if semantic-fit verdict is \`critical\`.
- "Strong handoff" rating requires build readiness ≥ 88, product fit ≥ 88, and zero blockers.

${demoReadinessBlock}`;
}

function buildFinalRecoverySummary() {
  return `# FINAL_RECOVERY_SUMMARY

## Recovery actions taken
- pending

## Remaining blockers
- pending

## Recommended next steps
- pending
`;
}

function buildFinalDeploymentStatus() {
  return `# FINAL_DEPLOYMENT_STATUS

## Deployment state
- pending

## Environment used
- pending

## Rollback readiness
- pending

## Evidence
- pending
`;
}

function buildTestScriptIndex(bundle: ProjectBundle) {
  const phaseEntries = bundle.phases.map((phase) => ({
    slug: phase.slug,
    name: phase.name,
    index: phase.index,
    scriptPath: `phases/${phase.slug}/TEST_SCRIPT.md`,
    resultsPath: `phases/${phase.slug}/TEST_RESULTS.md`
  }));

  return `# TEST_SCRIPT_INDEX for ${bundle.phases[0]?.name ? bundle.files[0]?.content.split('\n')[0] : 'project'}

## What this file is for
This file lists all generated phase test scripts, when to run each, and what each proves.

## Shared inputs for every phase test script
- Acceptance criteria: requirements/ACCEPTANCE_CRITERIA.md (each criterion is tagged with REQ-IDs)
- Sample data fixtures: SAMPLE_DATA.md (happy-path and negative-path samples per entity)
- Requirement-to-phase matrix: regenerate with \`npm run traceability -- --package=.\` and inspect repo/TRACEABILITY.md

## Automated regression entry points
- \`npm run loop -- --package=.\` runs the HTTP probe + TEST_SCRIPT.md bash blocks.
- \`npm run loop:browser -- --package=.\` drives Playwright against RUNTIME_TARGET.md, exercises every REQ-ID with SAMPLE_DATA.md fixtures, and scores requirement coverage.
- \`npm run auto-regression -- --package=.\` is the step-9 wrapper: build → loop → loop:browser, iterating until the combined score meets the target. Fix prompts land in \`evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_*.md\`.

## Generated phase test scripts
${phaseEntries.map((entry) => `### Phase ${String(entry.index).padStart(2, '0')}: ${entry.name}
- Script: ${entry.scriptPath}
- Requirement IDs owned: ${(bundle.phases[entry.index - 1].requirementIds || []).join(', ') || 'none'}
- When to run: After completing phase ${String(entry.index).padStart(2, '0')} implementation and before VERIFICATION_REPORT.md.
- What it proves: Phase deliverables meet the exit gate criteria, and every owned REQ-ID is exercised with happy-path and negative-path samples from SAMPLE_DATA.md.
- Where to paste results: ${entry.resultsPath}
- Gate supported: Entry gate at gates/gate-${String(entry.index).padStart(2, '0')}-entry.md, exit gate at gates/gate-${String(entry.index).padStart(2, '0')}-exit.md`).join('\n\n')}

## Regression suite
- Script: /regression-suite/RUN_REGRESSION.md
- When to run: After every major phase, before next-phase, before final handoff, before committing production code.
- What it proves: Artifact completeness, gate consistency, evidence quality, handoff continuity, and local-first constraints.
- Where to paste results: /regression-suite/REGRESSION_RESULTS_TEMPLATE.md

## UI/UX review workflow
- Script: /ui-ux/SCREENSHOT_REVIEW_PROMPT.md and /ui-ux/UI_UX_GATE.md
- When to run: Before final testing for any UI work, and after meaningful interface changes.
- What it proves: Screens, workflows, states, accessibility, and responsive behavior are reviewable with evidence.
- Where to paste results: /ui-ux/UI_UX_HANDOFF.md

## Recursive quality workflow
- Script: /recursive-test/RECURSIVE_TEST_PROMPT.md
- When to run: After a major build milestone or after broad generator changes.
- What it proves: Quality has been scored, root causes were fixed, regressions were rechecked, and final readiness is evidence-backed.
- Where to paste results: /recursive-test/ITERATION_LOG.md and /recursive-test/RECURSIVE_TEST_REPORT.md

## When to run the full regression suite
1. After every major phase.
2. Before running next-phase.
3. Before creating a final handoff package.
4. Before asking another agent to continue the work.
5. Before committing or pushing production code, if the project includes code.
6. Whenever a phase fails verification and is revised.
7. After major build completion, run recursive testing if quality still needs to be pushed higher.
`;
}

function buildRegressionSuiteReadme(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  return `# Regression Suite for ${input.productName}

## What this suite is for
This is a reusable regression suite designed to run later in the project, especially before major commits, before handoff, before production deployment, or after future phases.

This suite is a living project asset. It is generated from your project brief, mode, user level, and phase list. It is not generic filler.

## How to use
1. Read RUN_REGRESSION.md for the full procedure.
2. Follow each script in /regression-suite/scripts/ in order.
3. Record results in REGRESSION_RESULTS_TEMPLATE.md.
4. Do not mark the suite as passing unless every check is verified.

## What this suite covers
- Artifact completeness
- Agent operating rules
- Gate consistency
- Evidence quality
- Testing workflow
- UI/UX module integrity
- Recursive testing readiness
- Handoff continuity
- Local-first and markdown-first constraints
- Project-specific quality

## Profile
- Mode: ${context.profile.label}
- Product: ${input.productName}
- Audience: ${context.primaryAudience}
- Phases: ${bundle.phases.length}
`;
}

function buildRegressionRun(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  return `# RUN_REGRESSION

## What this file is for
Follow this file to run the full regression suite for ${input.productName}.

## When to run this suite
1. After every major phase.
2. Before running next-phase.
3. Before creating a final handoff package.
4. Before asking another agent to continue the work.
5. Before committing or pushing production code, if the project includes code.
6. Whenever a phase fails verification and is revised.

## Procedure
1. Open /regression-suite/REGRESSION_CHECKLIST.md and work through every item.
2. Run the automated regression script: \`npx tsx regression-suite/scripts/run-regression.ts .\`
3. For each remaining script in /regression-suite/scripts/, follow the procedure and record results.
4. If the project has UI, review /ui-ux/UI_UX_GATE.md and screenshot evidence before calling testing complete.
5. Record overall results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md.
6. If any check fails, do not proceed. Record the failure and revise.

## Scripts to run in order
1. /regression-suite/scripts/run-regression.ts (automated)
2. /regression-suite/scripts/artifact-integrity.md
3. /regression-suite/scripts/gate-consistency.md
4. /regression-suite/scripts/evidence-quality.md
5. /regression-suite/scripts/handoff-continuity.md
6. /regression-suite/scripts/agent-rules.md
7. /regression-suite/scripts/local-first.md

## Pass criteria
- Every script passes without unresolved failures.
- REGRESSION_RESULTS_TEMPLATE.md records pass for all checks.
- No contradictions exist between any two result files.
- Recursive testing is used later for quality improvement, not as a substitute for this suite.

## Failure handling
- Record the specific failure in REGRESSION_RESULTS_TEMPLATE.md.
- Do not proceed to next phase or handoff.
- Revise the relevant artifacts and re-run the suite.
`;
}

function buildRegressionChecklist(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  const phaseNames = bundle.phases.map((p) => p.name);

  return `# REGRESSION_CHECKLIST for ${input.productName}

## Artifact completeness
- [ ] Required root files exist (START_HERE.md, PROJECT_BRIEF.md, PHASE_PLAN.md, SCORECARD.md, TESTING_STRATEGY.md, REGRESSION_TEST_PLAN.md, TEST_SCRIPT_INDEX.md, AGENTS.md)
- [ ] /ui-ux/ exists with all 10 required files.
- [ ] /recursive-test/ exists with all 10 required files.
- [ ] Required phase files exist in every phase folder (PHASE_BRIEF.md, ENTRY_GATE.md, EXIT_GATE.md, TEST_PLAN.md, TEST_SCRIPT.md, TEST_RESULTS.md, VERIFICATION_REPORT.md, EVIDENCE_CHECKLIST.md, HANDOFF_SUMMARY.md, NEXT_PHASE_CONTEXT.md)
- [ ] Every phase has gate, test, verification, evidence, and handoff artifacts.
- [ ] No phase is missing TEST_PLAN.md, TEST_SCRIPT.md, or TEST_RESULTS.md.
${phaseNames.map((n) => `- [ ] Phase "${n}" folder has all required files.`).join('\n')}

## Agent operating rules
- [ ] Every generated AGENTS.md includes these exact rules:
  1. Don't assume. Don't hide confusion. Surface tradeoffs.
  2. Minimum code that solves the problem. Nothing speculative.
  3. Touch only what you must. Clean up only your own mess.
  4. Define success criteria. Loop until verified.
- [ ] Codex and Claude entry files do not contradict the operating rules.

## Gate consistency
- [ ] Entry gates match phase dependencies.
- [ ] Exit gates include measurable success criteria.
- [ ] Phase 1 does not require impossible prior-phase evidence.
- [ ] Later phases correctly reference prior handoff and exit evidence.
- [ ] Gate status, scorecard, lifecycle status, and recommendation do not contradict each other.

## Evidence quality
- [ ] Evidence files exist where required.
- [ ] Evidence is specific, not generic.
- [ ] No fake command output is accepted.
- [ ] No report says "pass/proceed" while the body says blocked, failed, pending, or unverified.
- [ ] TEST_RESULTS.md does not default to pass.

## Testing workflow
- [ ] Every phase has a test plan.
- [ ] Every phase has a test script or manual test procedure.
- [ ] Every phase has a test results template.
- [ ] The step-by-step guide tells the user to test before verification.
- [ ] The next-phase flow requires test evidence before proceeding.

## Handoff continuity
- [ ] NEXT_PHASE_CONTEXT.md reflects the current phase.
- [ ] Codex and Claude handoff prompts include relevant phase context.
- [ ] Handoff files are not blank templates.
- [ ] The next agent can understand what changed, passed, failed, and remains risky.

## Local-first and markdown-first constraints
- [ ] Generated package does not require hosted services.
- [ ] Generated package does not require database/auth/SaaS infrastructure unless the project explicitly needs it.
- [ ] Core workflow remains file-based and local.
- [ ] Markdown artifacts remain the source of truth.

${context.profile.key.endsWith('business') ? `## Business validation
- [ ] Business checks reference ${context.primaryAudience}.
- [ ] Business value proof is project-specific.
- [ ] Stakeholder workflows are named.` : `## Technical validation
- [ ] Technical checks reference ${context.primaryFeature}.
- [ ] Data boundaries and interfaces are explicit.
- [ ] Implementation targets are named or labelled as assumptions.`}

${input.level === 'beginner' ? `## Beginner usability
- [ ] Language is plain and jargon is explained.
- [ ] Checklists are concrete and actionable.
- [ ] Step-by-step guidance is present.` : ''}
`;
}

function buildRegressionResultsTemplate(input: ProjectInput) {
  return `# REGRESSION_RESULTS for ${input.productName}

## What this file is for
Record the results of running the regression suite here. Do not pre-fill with passing results.

## Date
pending

## Runner
pending

## Suite version
Generated with project package.

## Scripts run
- [ ] artifact-integrity
- [ ] gate-consistency
- [ ] evidence-quality
- [ ] handoff-continuity
- [ ] agent-rules
- [ ] local-first

## Results
- artifact-integrity: pending
- gate-consistency: pending
- evidence-quality: pending
- handoff-continuity: pending
- agent-rules: pending
- local-first: pending

## Failures found
-

## Fixes applied
-

## Evidence files reviewed
-

## Overall result: pending
Allowed: pending | pass | fail

## Recommendation: pending
Allowed: pending | proceed | revise | block

## Notes
-
`;
}

function buildRegressionScriptsReadme() {
  return `# Regression Scripts

## What this folder is for
Each file in this folder is a focused regression check. Follow the procedures in order and record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md.

## Scripts
- artifact-integrity.md: Confirm all required files exist in the package.
- gate-consistency.md: Confirm gates are consistent across phases.
- evidence-quality.md: Confirm evidence is real and specific.
- handoff-continuity.md: Confirm handoff files preserve context.
- agent-rules.md: Confirm AGENTS.md includes the Core Agent Operating Rules.
- local-first.md: Confirm the package stays local-first and markdown-first.
`;
}

function buildArtifactIntegrityScript(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  const phaseSlugs = bundle.phases.map((p) => p.slug);
  const rootFiles = [
    'BUSINESS_USER_START_HERE.md', 'CURRENT_STATUS.md', 'COPY_PASTE_PROMPTS.md', 'MODULE_MAP.md',
    'WHAT_TO_IGNORE_FOR_NOW.md', 'FINAL_CHECKLIST.md', 'START_HERE.md', 'PROJECT_BRIEF.md', 'PHASE_PLAN.md', 'SCORECARD.md',
    'TESTING_STRATEGY.md', 'REGRESSION_TEST_PLAN.md', 'TEST_SCRIPT_INDEX.md',
    'AGENTS.md', 'QUICKSTART.md', 'TROUBLESHOOTING.md',
    '00_PROJECT_CONTEXT.md', '01_CONTEXT_RULES.md', '00_APPROVAL_GATE.md',
    'CODEX_START_HERE.md', 'CLAUDE_START_HERE.md', 'OPENCODE_START_HERE.md',
    'CODEX_HANDOFF_PROMPT.md', 'CLAUDE_HANDOFF_PROMPT.md', 'OPENCODE_HANDOFF_PROMPT.md',
    'auto-improve/PROGRAM.md', 'auto-improve/QUALITY_RUBRIC.md', 'auto-improve/SCORECARD.md', 'auto-improve/RUN_LOOP.md', 'auto-improve/results.tsv',
    'HANDOFF.md', 'STEP_BY_STEP_BUILD_GUIDE.md', 'QUESTIONNAIRE.md', 'PLAN_CRITIQUE.md'
  ];
  const phaseFiles = [
    'PHASE_BRIEF.md', 'ENTRY_GATE.md', 'EXIT_GATE.md', 'TEST_PLAN.md',
    'TEST_SCRIPT.md', 'TEST_RESULTS.md', 'VERIFICATION_REPORT.md',
    'EVIDENCE_CHECKLIST.md', 'HANDOFF_SUMMARY.md', 'NEXT_PHASE_CONTEXT.md',
    'CODEX_BUILD_PROMPT.md', 'CLAUDE_BUILD_PROMPT.md', 'OPENCODE_BUILD_PROMPT.md',
    'VERIFY_PROMPT.md', 'README.md'
  ];

  return `# artifact-integrity

## Purpose
Confirm that every required root file, phase file, and regression suite file exists on disk for ${input.productName}. Missing files break the package contract and make handoff impossible.

## When to run
- After generating the package.
- After any phase that creates or deletes files.
- Before handoff to another agent.
- Before committing the package to version control.

## Inputs
- Package root folder containing the generated workspace.
- This script as the checklist.

## Step-by-step checks

### Step 1: Check root files
Confirm these root files exist:
${rootFiles.map((f) => `- [ ] ${f}`).join('\n')}

### Step 2: Check phase folders
Confirm all ${phaseSlugs.length} phase folders exist:
${phaseSlugs.map((s) => `- [ ] ${s}/`).join('\n')}

### Step 3: Check phase files
Confirm every phase folder contains these files:
${phaseFiles.map((f) => `- [ ] ${f}`).join('\n')}

### Step 4: Check regression suite
- [ ] /regression-suite/README.md exists.
- [ ] /regression-suite/RUN_REGRESSION.md exists.
- [ ] /regression-suite/REGRESSION_CHECKLIST.md exists.
- [ ] /regression-suite/REGRESSION_RESULTS_TEMPLATE.md exists.
- [ ] /regression-suite/scripts/ exists.

### Step 5: Check repo files
- [ ] repo/manifest.json exists.
- [ ] repo/mvp-builder-state.json exists.
- [ ] repo/input.json exists.

## Pass criteria
Every checkbox above is checked and every file is non-empty.

## Fail criteria
Any required file or folder is missing, or any required file is empty.

## Evidence to capture
- List of missing files, if any.
- Screenshot or file listing showing the package root and phases/ folder contents.

## Output location
Record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md under the artifact-integrity section.

## Stop conditions
Stop immediately if any required file is missing. Do not proceed to other regression scripts until the package is regenerated or the missing files are restored.
`;
}

function buildGateConsistencyScript(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  return `# gate-consistency

## Purpose
Confirm that entry gates, exit gates, scorecard, verification reports, and test results do not contradict each other for ${input.productName}. Contradictions mean a phase could advance on false pretenses.

## When to run
- After filling out any VERIFICATION_REPORT.md.
- After updating TEST_RESULTS.md.
- Before running next-phase.
- After changing lifecycle status or scorecard.

## Inputs
- All gate files in gates/.
- All phase VERIFICATION_REPORT.md files.
- All phase TEST_RESULTS.md files.
- SCORECARD.md.
- repo/manifest.json and repo/mvp-builder-state.json.

## Step-by-step checks

### Step 1: Phase 1 entry gate sanity
- [ ] gates/gate-01-entry.md does not mention prior phase handoff.
- [ ] gates/gate-01-entry.md checks that the project brief exists.

### Step 2: Later phase entry gates
${bundle.phases.slice(1).map((p) => `- [ ] gates/gate-${String(p.index).padStart(2, '0')}-entry.md mentions previous phase handoff.`).join('\n')}

### Step 3: Exit gates have measurable criteria
${bundle.phases.map((p) => `- [ ] gates/gate-${String(p.index).padStart(2, '0')}-exit.md has concrete expected outputs for ${p.name}.`).join('\n')}

### Step 4: No gate/status contradictions
- [ ] SCORECARD.md does not claim Build ready while the package is Blocked.
- [ ] No VERIFICATION_REPORT.md says pass while the body mentions blocked, failed, or pending.
- [ ] No VERIFICATION_REPORT.md says proceed while the final decision says not ready.
- [ ] No VERIFICATION_REPORT.md says pass while TEST_RESULTS.md is still pending.
- [ ] No VERIFICATION_REPORT.md says pass while TEST_RESULTS.md says fail.
- [ ] TEST_RESULTS.md does not default to pass.

### Step 5: Later phases reference prior evidence
${bundle.phases.slice(1).map((p) => `- [ ] phases/${p.slug}/ENTRY_GATE.md references previous phase completion.`).join('\n')}

## Pass criteria
Every check above passes and no contradictions exist between any two files.

## Fail criteria
Any gate contradicts another gate, the scorecard, a verification report, or a test result.

## Evidence to capture
- File paths of any contradicting pair.
- The exact contradictory sentences copied from each file.
- Which file should be treated as the source of truth.

## Output location
Record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md under the gate-consistency section.

## Stop conditions
Stop immediately if any contradiction is found. Do not run next-phase until the contradiction is resolved and the conflicting files are updated.
`;
}

function buildEvidenceQualityScript(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  return `# evidence-quality

## Purpose
Confirm that every piece of evidence is real, specific to ${input.productName}, and not fabricated. Fake or generic evidence breaks trust in the entire package.

## When to run
- After filling out any VERIFICATION_REPORT.md or TEST_RESULTS.md.
- Before running next-phase.
- Before handoff to another agent.
- Whenever a verification report claims pass + proceed.

## Inputs
- All phase EVIDENCE_CHECKLIST.md files.
- All phase TEST_RESULTS.md files.
- All phase VERIFICATION_REPORT.md files.
- Any external notes or command-output files referenced as evidence.

## Step-by-step checks

### Step 1: Evidence files exist where required
${bundle.phases.map((p) => `- [ ] phases/${p.slug}/EVIDENCE_CHECKLIST.md exists and has a Required evidence section.`).join('\n')}

### Step 2: Evidence is specific
${bundle.phases.slice(0, 5).map((p) => `- [ ] phases/${p.slug}/EVIDENCE_CHECKLIST.md references ${context.primaryFeature} or ${p.name}, not just generic text.`).join('\n')}

### Step 3: No fake command output
- [ ] No TEST_RESULTS.md contains fabricated command output.
- [ ] No VERIFICATION_REPORT.md contains fabricated command output.

### Step 4: No report contradictions
- [ ] No VERIFICATION_REPORT.md says pass + proceed while evidence files section says pending.
- [ ] No TEST_RESULTS.md defaults to pass.
- [ ] No TEST_RESULTS.md contains generic phrases like "looks good" or "no issues found".

### Step 5: TEST_RESULTS.md defaults to pending
${bundle.phases.map((p) => `- [ ] phases/${p.slug}/TEST_RESULTS.md has "Final result: pending" and "Recommendation: pending".`).join('\n')}

### Step 6: Regression results are not pre-filled
- [ ] REGRESSION_RESULTS_TEMPLATE.md does not default to pass.

## Pass criteria
Every check above passes and every evidence file contains concrete, project-specific content.

## Fail criteria
Any evidence is missing, generic, fabricated, contradictory, or defaults to pass without real execution.

## Evidence to capture
- Copy of the generic or fake sentence found.
- File path where it was found.
- What concrete replacement should say.

## Output location
Record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md under the evidence-quality section.

## Stop conditions
Stop immediately if any evidence is found to be generic or fabricated. Do not proceed until the evidence is replaced with concrete, recorded results.
`;
}

function buildHandoffContinuityScript(input: ProjectInput, bundle: ProjectBundle, context: ProjectContext) {
  return `# handoff-continuity

## Purpose
Confirm that handoff files preserve enough real context for the next agent to continue ${input.productName} without guessing what happened in earlier phases.

## When to run
- After completing any phase.
- Before handing off to a different agent.
- Before asking another human or AI to resume work.
- Before creating a final export package.

## Inputs
- All phase NEXT_PHASE_CONTEXT.md files.
- All phase HANDOFF_SUMMARY.md files.
- Root agent start files (CODEX_START_HERE.md, CLAUDE_START_HERE.md, OPENCODE_START_HERE.md).
- Root handoff prompts (CODEX_HANDOFF_PROMPT.md, CLAUDE_HANDOFF_PROMPT.md, OPENCODE_HANDOFF_PROMPT.md).

## Step-by-step checks

### Step 1: NEXT_PHASE_CONTEXT reflects current phase
${bundle.phases.map((p) => `- [ ] phases/${p.slug}/NEXT_PHASE_CONTEXT.md names ${p.name} as the current phase.`).join('\n')}

### Step 2: Handoff prompts include phase context
- [ ] CODEX_HANDOFF_PROMPT.md references the first phase by name.
- [ ] CLAUDE_HANDOFF_PROMPT.md references the first phase by name.
- [ ] OPENCODE_HANDOFF_PROMPT.md references the first phase by name.

### Step 3: Handoff summaries are not blank
${bundle.phases.map((p) => `- [ ] phases/${p.slug}/HANDOFF_SUMMARY.md has expected outputs and a completion update section.`).join('\n')}

### Step 4: Context survives agent switch
- [ ] A new agent reading CODEX_START_HERE.md could identify the current phase.
- [ ] A new agent reading CLAUDE_START_HERE.md could identify the current phase.
- [ ] A new agent reading OPENCODE_START_HERE.md could identify the current phase.

### Step 5: Test results are carried forward
- [ ] Every completed phase has TEST_RESULTS.md filled with actual results, not left as pending.
- [ ] Every completed phase has VERIFICATION_REPORT.md completed before NEXT_PHASE_CONTEXT.md was written.

## Pass criteria
Every check above passes and a new reader can reconstruct the project state without chat history.

## Fail criteria
Any handoff file is blank, generic, missing phase context, or left as a template with no real updates.

## Evidence to capture
- File path of the incomplete handoff file.
- What specific context is missing (phase name, decisions, test results, blockers).
- The sentence or section that should have been updated.

## Output location
Record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md under the handoff-continuity section.

## Stop conditions
Stop immediately if any handoff file is still a blank template. Do not hand off until the missing context is written.
`;
}

function buildAgentRulesScript(input: ProjectInput) {
  return `# agent-rules

## Purpose
Confirm that AGENTS.md includes the 4 Core Agent Operating Rules exactly and that no agent file contradicts them. The rules exist to prevent silent scope creep and unchecked assumptions.

## When to run
- After generating the package.
- After editing AGENTS.md or any agent start file.
- Before handoff to a new agent.
- After any phase where an agent might have modified agent-facing files.

## Inputs
- AGENTS.md in the package root.
- CODEX_START_HERE.md, CLAUDE_START_HERE.md, OPENCODE_START_HERE.md.
- CODEX_HANDOFF_PROMPT.md, CLAUDE_HANDOFF_PROMPT.md, OPENCODE_HANDOFF_PROMPT.md.
- At least one phase CODEX_BUILD_PROMPT.md and CLAUDE_BUILD_PROMPT.md.

## Step-by-step checks

### Step 1: AGENTS.md exists
- [ ] AGENTS.md exists in the package root.

### Step 2: Core Agent Operating Rules are present exactly
- [ ] AGENTS.md contains "## Core Agent Operating Rules"
- [ ] AGENTS.md contains "1. Don't assume. Don't hide confusion. Surface tradeoffs."
- [ ] AGENTS.md contains "2. Minimum code that solves the problem. Nothing speculative."
- [ ] AGENTS.md contains "3. Touch only what you must. Clean up only your own mess."
- [ ] AGENTS.md contains "4. Define success criteria. Loop until verified."

### Step 3: Agent entry files do not contradict rules
- [ ] CODEX_START_HERE.md does not contradict the operating rules.
- [ ] CLAUDE_START_HERE.md does not contradict the operating rules.
- [ ] OPENCODE_START_HERE.md does not contradict the operating rules.
- [ ] CODEX_HANDOFF_PROMPT.md does not contradict the operating rules.
- [ ] CLAUDE_HANDOFF_PROMPT.md does not contradict the operating rules.
- [ ] OPENCODE_HANDOFF_PROMPT.md does not contradict the operating rules.

### Step 4: Phase build prompts reinforce rules when appropriate
- [ ] At least one phase CODEX_BUILD_PROMPT.md mentions testing or verification.
- [ ] At least one phase CLAUDE_BUILD_PROMPT.md mentions testing or verification.
- [ ] At least one phase OPENCODE_BUILD_PROMPT.md mentions testing or verification.

## Pass criteria
All 4 operating rules are present exactly in AGENTS.md and no agent file contradicts them.

## Fail criteria
Any rule is missing, paraphrased, or contradicted by an agent-facing file.

## Evidence to capture
- Exact text of any missing or paraphrased rule.
- File path and sentence that contradicts a rule.
- Whether the contradiction is explicit instruction or implicit assumption.

## Output location
Record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md under the agent-rules section.

## Stop conditions
Stop immediately if any Core Agent Operating Rule is missing or contradicted. Do not proceed with agent handoff until AGENTS.md is corrected.
`;
}

function buildRunnableRegressionScript() {
  return `#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

const CHECKS = {
  pass: 0,
  fail: 0,
  issues: [] as string[]
};

function check(name: string, condition: boolean, message: string) {
  if (condition) {
    CHECKS.pass++;
  } else {
    CHECKS.fail++;
    CHECKS.issues.push(\`FAIL: \${name}: \${message}\`);
  }
}

function fileExists(packageRoot: string, filePath: string) {
  return fs.existsSync(path.join(packageRoot, filePath));
}

function readFile(packageRoot: string, filePath: string) {
  const fullPath = path.join(packageRoot, filePath);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function runRegression(packageRoot: string) {
  console.log(\`Running regression suite on \${packageRoot}...\\n\`);

  check(
    'Root files exist',
    fileExists(packageRoot, 'BUSINESS_USER_START_HERE.md') &&
      fileExists(packageRoot, 'CURRENT_STATUS.md') &&
      fileExists(packageRoot, 'COPY_PASTE_PROMPTS.md') &&
      fileExists(packageRoot, 'MODULE_MAP.md') &&
      fileExists(packageRoot, 'WHAT_TO_IGNORE_FOR_NOW.md') &&
      fileExists(packageRoot, 'FINAL_CHECKLIST.md') &&
      fileExists(packageRoot, 'START_HERE.md') &&
      fileExists(packageRoot, 'PROJECT_BRIEF.md') &&
      fileExists(packageRoot, 'PHASE_PLAN.md') &&
      fileExists(packageRoot, 'SCORECARD.md') &&
      fileExists(packageRoot, 'TESTING_STRATEGY.md') &&
      fileExists(packageRoot, 'REGRESSION_TEST_PLAN.md') &&
      fileExists(packageRoot, 'TEST_SCRIPT_INDEX.md') &&
      fileExists(packageRoot, 'AGENTS.md') &&
      fileExists(packageRoot, 'ui-ux/UI_UX_START_HERE.md') &&
      fileExists(packageRoot, 'recursive-test/RECURSIVE_TEST_START_HERE.md'),
    'Missing required root files'
  );

  check('UI/UX module files exist', fileExists(packageRoot, 'ui-ux/UI_UX_GATE.md') && fileExists(packageRoot, 'ui-ux/SCREENSHOT_REVIEW_PROMPT.md'), 'Missing required UI/UX files');
  check('Recursive test module files exist', fileExists(packageRoot, 'recursive-test/RECURSIVE_TEST_PROMPT.md') && fileExists(packageRoot, 'recursive-test/FINAL_QUALITY_GATE.md'), 'Missing required recursive test files');
  check(
    'Auto-improve files exist',
    fileExists(packageRoot, 'auto-improve/PROGRAM.md') &&
      fileExists(packageRoot, 'auto-improve/QUALITY_RUBRIC.md') &&
      fileExists(packageRoot, 'auto-improve/SCORECARD.md') &&
      fileExists(packageRoot, 'auto-improve/RUN_LOOP.md') &&
      fileExists(packageRoot, 'auto-improve/results.tsv'),
    'Missing required auto-improve files'
  );

  const agentsMd = readFile(packageRoot, 'AGENTS.md');
  check(
    'AGENTS.md includes Core Agent Operating Rules',
    /## Core Agent Operating Rules/.test(agentsMd) &&
      /Don't assume/.test(agentsMd) &&
      /Minimum code/.test(agentsMd) &&
      /Touch only what you must/.test(agentsMd) &&
      /Define success criteria/.test(agentsMd),
    'AGENTS.md missing Core Agent Operating Rules'
  );

  const manifest = JSON.parse(readFile(packageRoot, 'repo/manifest.json') || '{}');
  const phaseCount = manifest.phaseCount || 0;
  check(
    'Manifest has phase count',
    phaseCount >= 10,
    \`Phase count \${phaseCount} is below minimum of 10\`
  );

  for (let i = 1; i <= phaseCount; i++) {
    const slug = \`phase-\${String(i).padStart(2, '0')}\`;
    const phaseFolder = \`phases/\${slug}\`;

    check(\`Phase \${slug} has PHASE_BRIEF.md\`, fileExists(packageRoot, \`\${phaseFolder}/PHASE_BRIEF.md\`), \`Missing \${phaseFolder}/PHASE_BRIEF.md\`);
    check(\`Phase \${slug} has ENTRY_GATE.md\`, fileExists(packageRoot, \`\${phaseFolder}/ENTRY_GATE.md\`), \`Missing \${phaseFolder}/ENTRY_GATE.md\`);
    check(\`Phase \${slug} has EXIT_GATE.md\`, fileExists(packageRoot, \`\${phaseFolder}/EXIT_GATE.md\`), \`Missing \${phaseFolder}/EXIT_GATE.md\`);
    check(\`Phase \${slug} has TEST_PLAN.md\`, fileExists(packageRoot, \`\${phaseFolder}/TEST_PLAN.md\`), \`Missing \${phaseFolder}/TEST_PLAN.md\`);
    check(\`Phase \${slug} has TEST_SCRIPT.md\`, fileExists(packageRoot, \`\${phaseFolder}/TEST_SCRIPT.md\`), \`Missing \${phaseFolder}/TEST_SCRIPT.md\`);
    check(\`Phase \${slug} has TEST_RESULTS.md\`, fileExists(packageRoot, \`\${phaseFolder}/TEST_RESULTS.md\`), \`Missing \${phaseFolder}/TEST_RESULTS.md\`);
    check(\`Phase \${slug} has VERIFICATION_REPORT.md\`, fileExists(packageRoot, \`\${phaseFolder}/VERIFICATION_REPORT.md\`), \`Missing \${phaseFolder}/VERIFICATION_REPORT.md\`);
    check(\`Phase \${slug} has EVIDENCE_CHECKLIST.md\`, fileExists(packageRoot, \`\${phaseFolder}/EVIDENCE_CHECKLIST.md\`), \`Missing \${phaseFolder}/EVIDENCE_CHECKLIST.md\`);
    check(\`Phase \${slug} has HANDOFF_SUMMARY.md\`, fileExists(packageRoot, \`\${phaseFolder}/HANDOFF_SUMMARY.md\`), \`Missing \${phaseFolder}/HANDOFF_SUMMARY.md\`);
    check(\`Phase \${slug} has NEXT_PHASE_CONTEXT.md\`, fileExists(packageRoot, \`\${phaseFolder}/NEXT_PHASE_CONTEXT.md\`), \`Missing \${phaseFolder}/NEXT_PHASE_CONTEXT.md\`);

    const testResults = readFile(packageRoot, \`\${phaseFolder}/TEST_RESULTS.md\`);
    check(\`Phase \${slug} TEST_RESULTS.md defaults to pending\`, /## Final result: pending/.test(testResults), 'TEST_RESULTS.md does not default to pending');

    const verificationReport = readFile(packageRoot, \`\${phaseFolder}/VERIFICATION_REPORT.md\`);
    check(\`Phase \${slug} VERIFICATION_REPORT.md has result field\`, /## result: pending/.test(verificationReport), 'VERIFICATION_REPORT.md missing result field');
    check(\`Phase \${slug} VERIFICATION_REPORT.md has recommendation field\`, /## recommendation: pending/.test(verificationReport), 'VERIFICATION_REPORT.md missing recommendation field');
  }

  const gate01Entry = readFile(packageRoot, 'gates/gate-01-entry.md');
  check('Phase 1 entry gate does not require prior handoff', !/prior phase handoff/i.test(gate01Entry), 'Phase 1 entry gate incorrectly mentions prior phase handoff');

  if (phaseCount >= 2) {
    const gate02Entry = readFile(packageRoot, 'gates/gate-02-entry.md');
    check('Phase 2 entry gate requires prior handoff', /Previous phase handoff complete/.test(gate02Entry), 'Phase 2 entry gate missing prior handoff requirement');
  }

  check('Regression suite README exists', fileExists(packageRoot, 'regression-suite/README.md'), 'Missing regression-suite/README.md');
  check('Regression suite RUN_REGRESSION.md exists', fileExists(packageRoot, 'regression-suite/RUN_REGRESSION.md'), 'Missing regression-suite/RUN_REGRESSION.md');

  const startHere = readFile(packageRoot, 'START_HERE.md');
  const businessStart = readFile(packageRoot, 'BUSINESS_USER_START_HERE.md');
  const stepGuide = readFile(packageRoot, 'STEP_BY_STEP_BUILD_GUIDE.md');
  const readme = readFile(packageRoot, 'README.md');
  const promptGuide = readFile(packageRoot, 'COPY_PASTE_PROMPTS.md');
  const moduleMap = readFile(packageRoot, 'MODULE_MAP.md');
  const uiGate = readFile(packageRoot, 'ui-ux/UI_UX_GATE.md');
  const recursivePrompt = readFile(packageRoot, 'recursive-test/RECURSIVE_TEST_PROMPT.md');
  const scoringRubric = readFile(packageRoot, 'recursive-test/SCORING_RUBRIC.md');
  const autoImproveProgram = readFile(packageRoot, 'auto-improve/PROGRAM.md');
  const autoImproveResults = readFile(packageRoot, 'auto-improve/results.tsv');
  check('Root docs reference UI/UX module', startHere.includes('ui-ux/UI_UX_START_HERE.md') && readme.includes('ui-ux/UI_UX_START_HERE.md') && /UI\\/UX/i.test(stepGuide), 'Root docs do not consistently reference UI/UX module');
  check('Root docs reference recursive test module', startHere.includes('recursive-test/RECURSIVE_TEST_START_HERE.md') && readme.includes('recursive-test/RECURSIVE_TEST_START_HERE.md') && /recursive testing/i.test(stepGuide), 'Root docs do not consistently reference recursive test module');
  check('START_HERE tells users not to open every folder', /do not need to open every folder/i.test(startHere), 'START_HERE.md should tell the user not to open every folder');
  check('Business-user docs use beginner-friendly module names', /Screen and Workflow Review/i.test(businessStart) && /Improve Until Good Enough Loop/i.test(businessStart), 'Beginner-facing docs are missing friendly module names');
  check('Step guide includes Decide Plan Design Build Test Handoff', /## 1\. Decide/i.test(stepGuide) && /## 2\. Plan/i.test(stepGuide) && /## 3\. Design/i.test(stepGuide) && /## 4\. Build/i.test(stepGuide) && /## 5\. Test/i.test(stepGuide) && /## 6\. Handoff/i.test(stepGuide), 'Step guide is missing the required stage order');
  check('Module map includes required classifications', /## Required/i.test(moduleMap) && /## Recommended/i.test(moduleMap) && /## Optional/i.test(moduleMap) && /## Not needed now/i.test(moduleMap), 'MODULE_MAP.md is missing the required classifications');
  check('Copy and paste prompts are in order', /## 1\. Decide/i.test(promptGuide) && /## 2\. Plan/i.test(promptGuide) && /## 3\. Design/i.test(promptGuide) && /## 4\. Build/i.test(promptGuide) && /## 5\. Test/i.test(promptGuide) && /## 6\. Handoff/i.test(promptGuide), 'COPY_PASTE_PROMPTS.md is missing ordered prompts');
  check('UI gate includes auto-fail conditions', /## Auto-fail conditions/i.test(uiGate) && /no screenshots provided for a ui project/i.test(uiGate), 'UI gate is missing required auto-fail conditions');
  check('Recursive prompt includes scoring loop', /score each use case from 0 to 100/i.test(recursivePrompt) && /overall score >= 90/i.test(recursivePrompt), 'Recursive prompt is missing the scoring loop requirements');
  check('Scoring rubric includes score caps', /## Score cap rules/i.test(scoringRubric) && /max score 69/i.test(scoringRubric), 'Scoring rubric is missing score caps');
  check('Auto-improve program defines file boundaries', /## Editable files/i.test(autoImproveProgram) && /## Fixed files/i.test(autoImproveProgram), 'auto-improve/PROGRAM.md is missing editable or fixed file boundaries');
  check('Auto-improve program defines keep or discard rules', /keep the changes and commit them/i.test(autoImproveProgram) && /discard your own edits/i.test(autoImproveProgram), 'auto-improve/PROGRAM.md is missing keep or discard rules');
  check('Auto-improve program includes simplicity criterion', /## Simplicity criterion/i.test(autoImproveProgram), 'auto-improve/PROGRAM.md is missing the simplicity criterion');
  check('Auto-improve program forbids evaluator weakening', /Never weaken the rubric/i.test(autoImproveProgram), 'auto-improve/PROGRAM.md must forbid weakening the rubric or evaluator');
  check('Auto-improve results header exists', /^timestamp\titeration\toverall_score\thard_cap\tdecision\tcommands_run\tchanged_files\tnotes/i.test(autoImproveResults), 'auto-improve/results.tsv is missing the required header');

  const scorecard = readFile(packageRoot, 'SCORECARD.md');
  const lifecycle = manifest.lifecycleStatus;
  if (lifecycle === 'Blocked') {
    check('Blocked package scorecard does not claim Build ready', !/## Rating\s+Build ready/i.test(scorecard), 'Blocked package SCORECARD says Build ready');
  }

  console.log(\`\\n========================================\`);
  console.log(\`  Regression Suite Results\`);
  console.log(\`========================================\`);
  console.log(\`Passed: \${CHECKS.pass}\`);
  console.log(\`Failed: \${CHECKS.fail}\`);
  console.log(\`Total:  \${CHECKS.pass + CHECKS.fail}\`);
  console.log(\`========================================\`);

  if (CHECKS.issues.length > 0) {
    console.log('\\nIssues:');
    for (const issue of CHECKS.issues) {
      console.log(\`  \${issue}\`);
    }
    process.exit(1);
  } else {
    console.log('\\nAll regression checks passed.');
  }
}

const packageRoot = process.argv[2];
if (!packageRoot) {
  console.error('Usage: tsx run-regression.ts <package-root>');
  process.exit(1);
}

runRegression(path.resolve(packageRoot));
`;
}

function buildLocalFirstScript(input: ProjectInput, context: ProjectContext) {
  return `# local-first

## Purpose
Confirm the generated package for ${input.productName} stays local-first and markdown-first. Hosted dependencies, database requirements, or SaaS workflows in the planning layer break the core design contract.

## When to run
- After generating the package.
- After any phase that adds new files or references external services.
- Before committing the package.
- Before final handoff.

## Inputs
- Every generated markdown file in the package.
- Any JSON config or state files.
- The step-by-step guide and quickstart documents.

## Step-by-step checks

### Step 1: No hosted service requirements
- [ ] No generated file requires a network connection for core workflow.
- [ ] No generated file references a SaaS dashboard, hosted auth, or cloud backend for the planning workflow.
- [ ] No phase prompt or build instruction asks the agent to sign up for a service.

### Step 2: No database/auth/SaaS requirements
- [ ] Core workflow does not require a database unless the project explicitly needs it.
- [ ] Core workflow does not require authentication unless the project explicitly needs it.
- [ ] Core workflow does not require a SaaS platform unless the project explicitly needs it.
- [ ] If the project needs auth, database, or SaaS, the requirement is clearly scoped to the product, not the planning workflow.

### Step 3: Markdown is the source of truth
- [ ] All handoff files are readable markdown.
- [ ] No binary or proprietary formats are required for review.
- [ ] State and evidence are recorded in markdown or JSON, not hidden in chat history.
- [ ] No evidence file is stored in a non-text format.

### Step 4: File-based workflow
- [ ] The package can be used entirely from local files.
- [ ] The step-by-step guide does not require signing up for a service.
- [ ] CLI commands reference local paths, not hosted URLs.
- [ ] The package can be zipped and moved to another machine without loss of function.

## Pass criteria
Every check above passes and the package requires no external service to operate as a planning layer.

## Fail criteria
Any core workflow requires hosted services, database, auth, or SaaS infrastructure without explicit project justification.

## Evidence to capture
- File path and sentence that references a hosted service.
- Whether the reference is in the planning workflow or correctly scoped to the product domain.
- Recommended replacement text that keeps the workflow local.

## Output location
Record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md under the local-first section.

## Stop conditions
Stop immediately if the planning workflow itself requires a hosted service. Product-specific requirements are acceptable only if clearly scoped and justified.
- Recommended replacement text that keeps the workflow local.

## Output location
Record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md under the local-first section.

## Stop conditions
Stop immediately if the planning workflow itself requires a hosted service. Product-specific requirements are acceptable only if clearly scoped and justified.
`;
}

function resolveRuntimeTarget(input: ProjectInput): { url: string; startCommand: string; smokeRoutes: string[]; startTimeoutMs: number } {
  const url = (input.runtimeUrl && input.runtimeUrl.trim()) || 'http://localhost:3000';
  const startCommand = (input.runtimeStartCommand && input.runtimeStartCommand.trim()) || 'npm run dev';
  const smokeRoutes = (input.runtimeSmokeRoutes && input.runtimeSmokeRoutes.length ? input.runtimeSmokeRoutes : ['/']).filter(
    (route) => typeof route === 'string' && route.trim().length > 0
  );
  const startTimeoutMs =
    typeof input.runtimeStartTimeoutMs === 'number' && input.runtimeStartTimeoutMs > 0
      ? input.runtimeStartTimeoutMs
      : 60000;
  return { url, startCommand, smokeRoutes, startTimeoutMs };
}

function buildRuntimeTarget(input: ProjectInput, context: ProjectContext) {
  const target = resolveRuntimeTarget(input);
  const port = (() => {
    try {
      const parsed = new URL(target.url);
      return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    } catch {
      return 'unknown';
    }
  })();
  return `# RUNTIME_TARGET

## What this file is for
This file declares where the application runs once started. It is the contract used by:

- a user who wants to test the running app immediately
- the mvp-builder probe script that captures HTTP evidence
- the mvp-builder convergence loop that scores outcomes
- any agent (Codex, Claude Code, OpenCode, or one with chrome-devtools / Playwright tools) that needs to verify the running application

If this file is wrong, every outcome-based check downstream is wrong. Keep it accurate.

## URL
- Base URL: ${target.url}
- Port: ${port}

## Start command
- Command: ${target.startCommand}
- Working directory: the package or repo root that owns the application
- Expected startup time: under ${Math.round(target.startTimeoutMs / 1000)} seconds before the URL responds

## Smoke routes
A successful runtime probe must receive a 2xx or 3xx response from each of these routes within the start timeout:

${target.smokeRoutes.map((route) => `- ${route}`).join('\n')}

## How a user can test it manually
1. Open a terminal in the project root.
2. Run \`${target.startCommand}\`.
3. Open ${target.url} in a browser.
4. Confirm the smoke routes load without errors.
5. Stop the process when done.

## How an automated probe should test it
1. Spawn the start command as a child process.
2. Poll the base URL and each smoke route until 2xx/3xx or timeout.
3. Record HTTP status, response headers, and a body snapshot to evidence/runtime/probe-<timestamp>.md.
4. Kill the child process before exit.
5. Write a single pass/fail outcome line that downstream scoring can consume.

## What changes if the application is not a web app
If ${context.profile.label} produces a CLI, library, or batch process, replace the URL with a structured success signal (a generated file path, a CLI exit code, or a JSON output schema) and document it here. The probe script will skip URL polling when this file says \`Base URL: none\`.

## Owners
- Update this file whenever the start command or port changes.
- Keep RUNTIME_TARGET.md in sync with ENVIRONMENT_SETUP.md and BUILD_TARGET.md.
`;
}

function buildBrowserAutomationGuide(input: ProjectInput, _context: ProjectContext) {
  const target = resolveRuntimeTarget(input);
  return `# BROWSER_AUTOMATION_GUIDE

## What this file is for
This file tells an AI coding agent how to drive a real browser against the running application during the convergence loop. It exists because keyword-based scoring cannot tell whether the UI works; only running the UI can.

## When to use browser automation
- Phase has any UI deliverable.
- A previous probe captured HTTP 200 but the page rendered an error.
- A regression introduced a visible defect that smoke-test routes did not catch.
- The acceptance criteria mention a screen, a flow, or a user action.

If the project has no UI, skip this guide.

## Tooling options for the agent
The agent should pick whichever option is already available in its harness. Both are valid.

### Option A: Chrome DevTools MCP
- Best for agents that already have an MCP client connected (for example a Claude Code session with the chrome-devtools MCP server installed).
- The agent calls navigate, fill, click, take_snapshot, and list_console_messages tools directly.
- Evidence: a snapshot text, console messages, and network requests captured per assertion.

### Option B: Playwright
- Best for agents that can install dependencies inside the project being built.
- Add Playwright as a devDependency in the *project*, not in MVP Builder itself.
- Use the chromium browser by default; install other browsers only if the project explicitly needs them.
- Evidence: screenshots saved under evidence/runtime/screenshots/ and a single Playwright report per run.

## Mandatory assertion checklist for any UI verification
Run all of these against ${target.url} and the routes listed in RUNTIME_TARGET.md:

1. The base URL responds with status 200 (or the documented expected status).
2. The page contains a non-empty title.
3. No uncaught console errors are present after first paint.
4. Each documented user action (the must-have features in PROJECT_BRIEF.md) reaches a visible success state.
5. After every state change, capture either a snapshot or a screenshot as evidence.

## What the agent must NOT do
- Do not stub the browser layer to fake a pass.
- Do not skip console-error checks.
- Do not click through error states without recording them.
- Do not hardcode a wait-time longer than RUNTIME_TARGET.md startTimeout.

## Where to write evidence
- \`evidence/runtime/screenshots/<phase>-<timestamp>.png\` for screenshots.
- \`evidence/runtime/snapshots/<phase>-<timestamp>.txt\` for accessibility/DOM snapshots.
- \`evidence/runtime/console/<phase>-<timestamp>.log\` for browser console messages.
- A one-line outcome under the matching \`phases/phase-XX/VERIFICATION_REPORT.md\` evidence files section.

## How this plugs into the convergence loop
\`npm run loop\` reads the latest probe outcome plus any browser-automation evidence in evidence/runtime/. If the loop finds a UI failure with no browser evidence, it writes a fix prompt that names this guide and asks the agent to run a real browser pass before the next iteration.

## Automated browser coverage: \`npm run loop:browser\`
- Drives Playwright (chromium, headless) against the URL declared in RUNTIME_TARGET.md.
- Walks every requirement in requirements/ACCEPTANCE_CRITERIA.md, looks up the matching entity in SAMPLE_DATA.md, and checks that the happy-path tokens render on the page.
- Captures full-page screenshots and console errors per scenario into \`evidence/runtime/browser/<timestamp>/\`.
- Scores 0-100 as: probe (max 30) + requirement coverage (max 70).
- Playwright is loaded via dynamic import. If it is not installed, the score reflects probe-only and the report includes the install hint.
- Install command: \`npm install --save-dev playwright && npx playwright install chromium\`.

## Full auto-regression: \`npm run auto-regression\`
- Step 9 of the meta-method workflow. Runs build, then \`npm run loop\` (HTTP + TEST_SCRIPT.md), then \`npm run loop:browser\`, combines into a single 0-100 score, and iterates up to \`--max-iterations\` (default 3) until the target (default 90) is met.
- Each failing iteration writes \`evidence/runtime/AUTO_REGRESSION_FIX_PROMPT_iteration-NN.md\` with a concrete punch list of failing REQ-IDs, console errors, and uncovered scenarios.

## Why two options instead of one
Forcing Playwright as a hard dependency would bloat MVP Builder itself with browser binaries. Forcing chrome-devtools MCP would exclude agents that do not have it. Documenting both keeps the harness portable, and the assertion checklist above is identical regardless of tooling.
`;
}

function buildRunAllScript(bundle: ProjectBundle) {
  return `# run-all

## What this file is for
Run all regression scripts in order. Record results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md.

## Procedure
1. Follow /regression-suite/scripts/artifact-integrity.md.
2. Follow /regression-suite/scripts/gate-consistency.md.
3. Follow /regression-suite/scripts/evidence-quality.md.
4. Follow /regression-suite/scripts/handoff-continuity.md.
5. Follow /regression-suite/scripts/agent-rules.md.
6. Follow /regression-suite/scripts/local-first.md.
7. Record overall results in /regression-suite/REGRESSION_RESULTS_TEMPLATE.md.

## Pass criteria
All 6 scripts pass without unresolved failures.

## Failure handling
Record the failure, do not proceed to next phase or handoff, revise and re-run.
`;
}

function createGeneratedFiles(bundle: ProjectBundle, input: ProjectInput, context: ProjectContext): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const add = (path: string, content: string) => {
    files.push({ path, content: ensureTrailingNewline(content) });
  };
  const assumptionsAndQuestions = buildAssumptionsAndOpenQuestions(bundle.warnings, context);
  const statusSummary = getLifecycleSummary(bundle.lifecycleStatus);
  const blockingWarningLines = bundle.blockingWarnings.map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`);
  const nonBlockingWarningLines = bundle.warnings
    .filter((warning) => warning.severity !== 'blocker')
    .map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`);
  const modeGuideIntro =
    context.profile.key === 'beginner-business'
      ? 'Simple checklist: read the brief, answer the open questions, confirm the customer problem, and only then move into phase work.'
      : context.profile.key === 'beginner-technical'
        ? 'Simple technical checklist: confirm the brief, repo expectations, and first tests before trusting the handoff.'
        : context.profile.key === 'advanced-technical'
          ? 'Technical review note: treat unresolved architecture, observability, and failure-mode questions as blockers until they are explicit.'
          : context.profile.key === 'advanced-business'
            ? 'Executive review note: treat unresolved business value, adoption, and operating-model questions as blockers until they are explicit.'
            : 'Review the brief, close the open questions, and then work the package in phase order.';
  const mvpBuilderState = buildMvpBuilderState(bundle);
  const uiWorkflows = getUiWorkflowSet(input, context);
  const uiScreens = getUiScreens(input, context, uiWorkflows);

  add('README.md', buildRootReadme(bundle, input));
  add('BUSINESS_USER_START_HERE.md', buildBusinessUserStartHere(bundle, input));
  // Phase G G2 issues 1 & 2: builder-targeted entry point + archive index.
  // BUSINESS_USER_START_HERE points at human-review files. BUILDER_START_HERE
  // points at the canonical 10 load-bearing files for an implementing agent.
  // archive/INDEX.md catalogs the ceremony files at the top level so a builder
  // knows what to skip when scanning the workspace.
  add('BUILDER_START_HERE.md', buildBuilderStartHere(bundle, input, context));
  add('archive/INDEX.md', buildArchiveIndex(bundle));
  add('CURRENT_STATUS.md', buildCurrentStatus(bundle, input, context));
  add('COPY_PASTE_PROMPTS.md', buildCopyPastePrompts(input, bundle, context));
  add('MODULE_MAP.md', buildModuleMap(input, context));
  add('WHAT_TO_IGNORE_FOR_NOW.md', buildWhatToIgnoreForNow(bundle, input, context));
  add('FINAL_CHECKLIST.md', buildFinalChecklist(bundle, input, context));
  add('ORCHESTRATOR_GUIDE.md', buildOrchestratorGuide(bundle, input));
  add('BUILD_TARGET.md', buildBuildTarget(input, context));
  add('RUNTIME_TARGET.md', buildRuntimeTarget(input, context));
  add('BROWSER_AUTOMATION_GUIDE.md', buildBrowserAutomationGuide(input, context));
  add('PRODUCTION_SCOPE.md', buildProductionScope(input, context));
  add('DEPLOYMENT_PLAN.md', buildDeploymentPlan(input, context));
  add('ENVIRONMENT_SETUP.md', buildEnvironmentSetup(input, context));
  add('PRODUCTION_READINESS_CHECKLIST.md', buildProductionReadinessChecklist());
  add('OPERATIONS_RUNBOOK.md', buildOperationsRunbook(input, context));
  add('INCIDENT_RESPONSE_GUIDE.md', buildIncidentResponseGuide(input));
  add('ROLLBACK_PLAN.md', buildRollbackPlan(input));
  add('SECURITY_REVIEW.md', buildSecurityReview(input, context));
  add('PERFORMANCE_PLAN.md', buildPerformancePlan(input, context));
  add('RELEASE_CHECKLIST.md', buildReleaseChecklist());
  add('PRODUCTION_GATE.md', buildProductionGate());
  add('FINAL_RELEASE_REPORT.md', buildFinalReleaseReport());
  add('FINAL_HANDOFF.md', buildFinalHandoff());
  add('FINAL_GATE_REPORT.md', buildFinalGateReport());
  add('FINAL_SCORECARD.md', buildFinalScorecard(bundle, context.extractions));
  add('FINAL_RECOVERY_SUMMARY.md', buildFinalRecoverySummary());
  add('FINAL_DEPLOYMENT_STATUS.md', buildFinalDeploymentStatus());
  add('QUICKSTART.md', buildPackageQuickstart(bundle, input));
  add('TROUBLESHOOTING.md', buildPackageTroubleshooting());
  add('START_HERE.md', buildPackageStartHere(bundle, input));
  add('00_PROJECT_CONTEXT.md', buildRootContext(input, bundle, context));
  add('01_CONTEXT_RULES.md', buildContextRules());
  add('02_HOW_TO_USE_WITH_CODEX.md', buildHowToUseWithAgent('Codex'));
  add('03_HOW_TO_USE_WITH_CLAUDE_CODE.md', buildHowToUseWithAgent('Claude Code'));
  add('04_HOW_TO_USE_WITH_OPENCODE.md', buildHowToUseWithAgent('OpenCode'));
  add('AGENTS.md', buildAgentsMd());
  add('TESTING_STRATEGY.md', buildTestingStrategy(input, bundle, context));
  add('REGRESSION_TEST_PLAN.md', buildRegressionTestPlan(input, bundle, context));
  add('TEST_SCRIPT_INDEX.md', buildTestScriptIndex(bundle));
  add('auto-improve/PROGRAM.md', buildAutoImproveProgram(input, bundle, context));
  add('auto-improve/QUALITY_RUBRIC.md', buildAutoImproveQualityRubric());
  add('auto-improve/SCORECARD.md', buildAutoImproveScorecard());
  add('auto-improve/RUN_LOOP.md', buildAutoImproveRunLoop());
  add(
    'auto-improve/results.tsv',
    'timestamp\titeration\toverall_score\thard_cap\tdecision\tcommands_run\tchanged_files\tnotes'
  );
  add('product-strategy/PRODUCT_STRATEGY_START_HERE.md', buildProductStrategyStartHere(input, context));
  add('product-strategy/PRODUCT_NORTH_STAR.md', buildProductNorthStar(input, context));
  add('product-strategy/TARGET_USERS.md', buildTargetUsers(input, context));
  add('product-strategy/MVP_SCOPE.md', buildMvpScope(input, context));
  add('product-strategy/OUT_OF_SCOPE.md', buildOutOfScope(input, context));
  add('product-strategy/SUCCESS_METRICS.md', buildSuccessMetrics(input, context));
  add('product-strategy/TRADEOFF_LOG.md', buildTradeoffLog(input, context));
  add('product-strategy/PRODUCT_STRATEGY_GATE.md', buildProductStrategyGate());
  add('requirements/REQUIREMENTS_START_HERE.md', buildRequirementsStartHere(input, context));
  add('requirements/FUNCTIONAL_REQUIREMENTS.md', buildFunctionalRequirements(input, context));
  add('requirements/NON_FUNCTIONAL_REQUIREMENTS.md', buildNonFunctionalRequirements(input, context));
  add('requirements/ACCEPTANCE_CRITERIA.md', buildAcceptanceCriteria(input, context, bundle.phases));
  add('SAMPLE_DATA.md', buildSampleData(input, context, bundle.phases));
  // Phase D: emit research-driven matrix and regulatory notes when extractions
  // are present. Audit's expert dimensions (role-permission-matrix and
  // regulatory-mapping) score these directly.
  if (context.extractions) {
    add('requirements/PERMISSION_MATRIX.md', renderPermissionMatrixMarkdown(context.extractions));
    add('requirements/REGULATORY_NOTES.md', renderRegulatoryNotesMarkdown(context.extractions));
    // Phase E2: per-screen specs + UX flow when the recipe extracted screens.
    if (context.extractions.screens && context.extractions.screens.length) {
      add('ui-ux/SCREEN_INVENTORY.md', renderScreenInventoryMarkdown(context.extractions));
      add('ui-ux/UX_FLOW.md', renderUxFlowMarkdown(context.extractions));
      for (const file of renderAllScreenSpecs(context.extractions)) {
        add(file.path, file.content);
      }
    }
    // Phase E3: full DDL + readable schema doc when entity fields carry dbType metadata.
    const hasDbMetadata = context.extractions.entities.some((e) => e.fields.some((f) => f.dbType));
    if (hasDbMetadata) {
      add('architecture/DATABASE_SCHEMA.md', renderDatabaseSchemaMarkdown(context.extractions));
      add('architecture/DATABASE_SCHEMA.sql', renderDatabaseSchemaSql(context.extractions));
    }
    // Phase E4: product-strategy artifacts when discovery / JTBD are populated.
    if (context.extractions.meta.discovery) {
      add('product-strategy/VALUE_PROPOSITION.md', renderValuePropositionMarkdown(context.extractions));
      add('product-strategy/IDEA_CRITIQUE.md', renderIdeaCritiqueMarkdown(context.extractions));
      // Phase F2: success metrics from discovery outcomes + workflow leading indicators.
      add('product-strategy/SUCCESS_METRICS.md', renderSuccessMetricsMarkdown(context.extractions, input));
    }
    if (context.extractions.jobsToBeDone && context.extractions.jobsToBeDone.length) {
      add('product-strategy/JOBS_TO_BE_DONE.md', renderJobsToBeDoneMarkdown(context.extractions));
    }
    // Phase F2: comprehensive-depth artifacts.
    // Use cases require workflows; personas require actors + JTBDs (we'll still
    // emit a thin personas file even without JTBDs).
    if (context.extractions.workflows.length > 0) {
      add('product-strategy/USE_CASES.md', renderUseCasesMarkdown(context.extractions));
    }
    if (context.extractions.actors.length > 0) {
      add('product-strategy/USER_PERSONAS.md', renderUserPersonasMarkdown(context.extractions));
    }
    if (context.extractions.screens && context.extractions.screens.length > 0) {
      add('requirements/PER_SCREEN_REQUIREMENTS.md', renderPerScreenRequirementsMarkdown(context.extractions));
    }
  }
  add('requirements/OPEN_QUESTIONS.md', buildOpenQuestions(input, context));
  add('requirements/REQUIREMENTS_RISK_REVIEW.md', buildRequirementsRiskReview(input, context));
  add('requirements/REQUIREMENTS_GATE.md', buildRequirementsGate());
  add('security-risk/SECURITY_START_HERE.md', buildSecurityStartHere(input, context));
  add('security-risk/DATA_CLASSIFICATION.md', buildDataClassification(input, context));
  add('security-risk/SECRET_MANAGEMENT.md', buildSecretManagement(input, context));
  add('security-risk/PRIVACY_RISK_REVIEW.md', buildPrivacyRiskReview(input, context));
  add('security-risk/AUTHORIZATION_REVIEW.md', buildAuthorizationReview(input, context));
  add('security-risk/DEPENDENCY_RISK_CHECKLIST.md', buildDependencyRiskChecklist());
  add('security-risk/SECURITY_GATE.md', buildSecurityGate());
  add('integrations/INTEGRATION_START_HERE.md', buildIntegrationStartHere(input, context));
  add('integrations/EXTERNAL_SERVICES.md', buildExternalServices(input, context));
  add('integrations/API_KEYS_AND_SECRETS.md', buildApiKeysAndSecrets(input, context));
  add('integrations/ENVIRONMENT_VARIABLES.md', buildEnvironmentVariables(input, context));
  add('integrations/WEBHOOKS.md', buildWebhooks(input, context));
  add('integrations/FAILURE_MODES.md', buildIntegrationFailureModes(input, context));
  add('integrations/MOCKING_STRATEGY.md', buildMockingStrategy(input, context));
  add('integrations/INTEGRATION_TEST_PLAN.md', buildIntegrationTestPlan(input, context));
  add('integrations/INTEGRATION_GATE.md', buildIntegrationGate());
  add('architecture/ARCHITECTURE_START_HERE.md', buildArchitectureStartHere(input, context));
  add('architecture/SYSTEM_OVERVIEW.md', buildSystemOverview(input, context));
  add('architecture/DATA_MODEL.md', buildDataModel(input, context));
  add('architecture/API_CONTRACTS.md', buildApiContracts(input, context));
  add('architecture/STATE_MANAGEMENT.md', buildStateManagement(input, context));
  add('architecture/ARCHITECTURE_DECISIONS.md', buildArchitectureDecisions(input, context));
  add('architecture/ARCHITECTURE_GATE.md', buildArchitectureGate());
  add('ui-ux/UI_UX_START_HERE.md', buildUiUxStartHere(input, context, uiWorkflows));
  add('ui-ux/USER_WORKFLOWS.md', `# USER_WORKFLOWS\n\n${uiWorkflows.map(renderUiWorkflowMarkdown).join('\n')}`);
  // Phase E2: when research extractions include screens, the per-screen specs
  // and a research-driven SCREEN_INVENTORY.md are already emitted above. Skip
  // the templated inventory in that case so it doesn't overwrite the richer one.
  if (!(context.extractions?.screens && context.extractions.screens.length)) {
    add('ui-ux/SCREEN_INVENTORY.md', `# SCREEN_INVENTORY\n\n${uiScreens.map(renderUiScreenMarkdown).join('\n')}`);
  }
  add('ui-ux/UX_REVIEW_CHECKLIST.md', buildUxReviewChecklist(context));
  add('ui-ux/UI_IMPLEMENTATION_GUIDE.md', buildUiImplementationGuide(input, context, uiScreens));
  add('ui-ux/ACCESSIBILITY_CHECKLIST.md', buildAccessibilityChecklist());
  add('ui-ux/RESPONSIVE_DESIGN_CHECKLIST.md', buildResponsiveChecklist());
  add('ui-ux/SCREENSHOT_REVIEW_PROMPT.md', buildScreenshotReviewPrompt(input, context));
  add('ui-ux/UI_UX_GATE.md', buildUiUxGate(context));
  add('ui-ux/UI_UX_HANDOFF.md', buildUiUxHandoff());
  add('recursive-test/RECURSIVE_TEST_START_HERE.md', buildRecursiveStartHere());
  add('recursive-test/RECURSIVE_TEST_PROMPT.md', buildRecursivePrompt());
  add('recursive-test/SCORING_RUBRIC.md', buildScoringRubric());
  add('recursive-test/TEST_CASE_SELECTION_GUIDE.md', buildTestCaseSelectionGuide());
  add('recursive-test/ITERATION_LOG.md', buildIterationLog());
  add('recursive-test/FAILURE_TAXONOMY.md', buildFailureTaxonomy());
  add('recursive-test/RECURSIVE_TEST_REPORT.md', buildRecursiveReport());
  add('recursive-test/RECURSIVE_FIX_GUIDE.md', buildRecursiveFixGuide());
  add('recursive-test/REGRESSION_RECHECK_GUIDE.md', buildRegressionRecheckGuide());
  add('recursive-test/FINAL_QUALITY_GATE.md', buildFinalQualityGate());
  add('CODEX_START_HERE.md', buildRootAgentStart('Codex', input, bundle, context));
  add('CLAUDE_START_HERE.md', buildRootAgentStart('Claude Code', input, bundle, context));
  add('OPENCODE_START_HERE.md', buildRootAgentStart('OpenCode', input, bundle, context));
  add('CODEX_HANDOFF_PROMPT.md', buildRootAgentPrompt('Codex', input, bundle, context));
  add('CLAUDE_HANDOFF_PROMPT.md', buildRootAgentPrompt('Claude Code', input, bundle, context));
  add('OPENCODE_HANDOFF_PROMPT.md', buildRootAgentPrompt('OpenCode', input, bundle, context));

  add(
    'PROJECT_BRIEF.md',
    `# PROJECT_BRIEF

## Product
${input.productName}

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## Selected profile
${bundle.profile.label}

## Profile behavior
- Question wording: ${bundle.profile.wordingStyle}
- Critique depth: ${bundle.profile.critiqueDepth}
- Planning expectation: ${bundle.profile.planningExpectation}
- Technical detail level: ${bundle.profile.technicalDepth}
- Gate strength: ${bundle.profile.gateStrength}
- Handoff detail: ${bundle.profile.handoffDetail}

## Based on the project information provided
- Product idea: ${input.productIdea}
- Audience: ${input.targetAudience}
- Problem: ${input.problemStatement}
- Desired output: ${input.desiredOutput}
- Must-have scope: ${context.mustHaves.join(', ') || 'Please review and confirm'}

## Please review and confirm
${listToBullets(
  bundle.critique
    .filter((item) => item.signal === 'needs-user-confirmation')
    .slice(0, 5)
    .map((item) => item.followUpQuestion),
  'Please review and confirm: no open confirmation questions are recorded.'
)}

## Inferred assumptions
${listToBullets(context.inferredAssumptions, 'Inferred assumption: none recorded.')}

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions, 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(assumptionsAndQuestions.openQuestions, 'Please review and confirm: no open questions recorded.')}

## Warning summary
### Blocking issues
${listToBullets(blockingWarningLines, 'No blocker warnings recorded.')}

### Non-blocking warnings
${listToBullets(nonBlockingWarningLines, 'No non-blocking warnings recorded.')}

## Constraints
${listToBullets(context.constraints, 'Please review and confirm: constraints are not yet explicit.')}

## Risks currently shaping the plan
${listToBullets(context.risks, 'Please review and confirm: risk list is still empty.')}
`
  );

  add(
    'PHASE_PLAN.md',
    `# PHASE_PLAN

## Package status
${bundle.lifecycleStatus}

${statusSummary}

This package contains ${bundle.phases.length} phases for ${input.productName}.

${renderPhasePlanMarkdown(bundle.phases)}

## Risks and open questions affecting sequencing
${listToBullets(
  assumptionsAndQuestions.openQuestions.slice(0, 6).concat(context.risks.slice(0, 3).map((item) => `Based on your answers so far: ${item}`)),
  'Please review and confirm: no sequencing questions recorded.'
)}
`
  );

  add('SCORECARD.md', renderScorecardMarkdown(bundle));

  add(
    '00_APPROVAL_GATE.md',
    `# 00_APPROVAL_GATE

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## Blocking issues
${listToBullets(blockingWarningLines, 'No blocker warnings recorded.')}

## Non-blocking warnings
${listToBullets(nonBlockingWarningLines, 'No non-blocking warnings recorded.')}

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions, 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(assumptionsAndQuestions.openQuestions, 'Please review and confirm: no open questions recorded.')}

## Human approval checklist
- Confirm the package status still matches the actual planning state.
- Confirm blocker warnings are resolved or intentionally escalated outside this package.
- Confirm non-blocking warnings, assumptions, and open questions are visible to reviewers.
- Confirm the phase plan, gates, and scorecard reflect the actual brief and questionnaire answers.
- Confirm the next builder can work from this package without hidden chat context.

## Approval decision section
- Approval required: ${bundle.approvalRequired ? 'Yes' : 'No'}
- Approved for build: ${bundle.approvedForBuild ? 'Yes' : 'No'}
- Recorded approval decision: ${(input.questionnaireAnswers['approval-decision'] || `Package is ${bundle.lifecycleStatus.toLowerCase()} with a readiness score of ${bundle.score.total}/100`)}.
- Recorded approver: ${(input.questionnaireAnswers['approval-reviewed-by'] || `Product owner or assigned reviewer for ${input.productName}`)}
- Recorded approval notes: ${(input.questionnaireAnswers['approval-notes'] || `Current rating: ${bundle.score.rating}. ${bundle.score.blockers.length > 0 ? 'Blockers: ' + bundle.score.blockers.join('; ') + '.' : 'No blockers recorded.'}`)}
`
  );

  add(
    'HANDOFF.md',
    `# HANDOFF

## Build objective
${input.desiredOutput}

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## Current mode
${bundle.profile.label}

## Based on the project information provided
- Primary audience: ${context.primaryAudience}
- Primary feature focus: ${context.primaryFeature}
- Workflow anchor: ${context.workflowAnchor}
- Acceptance anchor: ${context.acceptanceAnchor}

## Please review and confirm
${listToBullets(
  Array.from(new Set(bundle.critique.map((item) => item.followUpQuestion))).slice(0, 5),
  'Please review and confirm: no open follow-up questions are recorded.'
)}

## Inferred assumptions
${listToBullets(context.inferredAssumptions, 'Inferred assumption: none recorded.')}

## Assumptions and open questions
### Assumptions
${listToBullets(assumptionsAndQuestions.assumptions, 'Inferred assumption: none recorded.')}

### Open questions
${listToBullets(assumptionsAndQuestions.openQuestions, 'Please review and confirm: no open questions recorded.')}

## Unresolved warnings
${listToBullets(bundle.unresolvedWarnings.map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`), 'No unresolved warnings recorded.')}

## Status meaning
- Draft: export is allowed for planning review, but the package still needs more work before formal approval review.
- Blocked: only fires for structural failures (schema-validation severity > 'note' or unresolved critical conflicts). Diagnosis and review are still possible.
- ReviewReady: the package is complete enough for human approval review, but it is not yet approved for build.
- BuildReady: the workspace has agent-recipe research, a clean schema, and full requirement / persona / use-case depth — a coding agent can build from it. Human approval (ApprovedForBuild) is still a separate step.
- ApprovedForBuild: the package contains explicit approval metadata and can be treated as build-approved.

## What the builder should read first
1. 00_PROJECT_CONTEXT.md
2. 01_CONTEXT_RULES.md
3. 00_APPROVAL_GATE.md
4. PROJECT_BRIEF.md
5. PHASE_PLAN.md
6. CODEX_START_HERE.md, CLAUDE_START_HERE.md, or OPENCODE_START_HERE.md
7. /phases in sequence

## Rules for the builder
- Use markdown files in this package as the source of truth.
- Do not rely on chat history.
- Do not skip entry or exit gates.
- Do not hardcode final AI prompts in package files. Ask the coding AI to draft prompts when needed.
- Keep the MVP inside the stated must-have scope, non-goals, and constraints.

## Current readiness
${bundle.score.total}/100 - ${bundle.score.rating}

## Recommended next step
Review the open confirmation items, then start phase 1 with the current brief and constraints.
`
  );

  add('STEP_BY_STEP_BUILD_GUIDE.md', buildStepByStepGuide(bundle, input, context, statusSummary, assumptionsAndQuestions, modeGuideIntro));

  add(
    'QUESTIONNAIRE.md',
    `# QUESTIONNAIRE

Profile: ${bundle.profile.label}

${renderQuestionnaireMarkdown(bundle.questionnaire, input)}
`
  );

  add(
    'PLAN_CRITIQUE.md',
    `# PLAN_CRITIQUE

${renderCritiqueMarkdown(bundle.critique)}
`
  );

  add(
    'repo/README.md',
    `# ${input.productName}

Generated by MVP Builder.

## Package status
${bundle.lifecycleStatus}

${statusSummary}

## What this repo package is for
This directory is a local, markdown-first planning and handoff package for AI-assisted builds in Codex, Claude Code, and OpenCode. Its purpose is to help another builder implement ${input.productName} without depending on hidden chat context.

## Based on the project information provided
${listToBullets(context.mustHaves.map((item) => `Based on your answers so far: ${item}`), 'Based on your answers so far: must-have features were not listed.')}

## Please review and confirm
${listToBullets(bundle.critique.map((item) => item.followUpQuestion).slice(0, 4), 'Please review and confirm: no open questions are listed.')}

## Non-goals
${listToBullets(context.nonGoals.map((item) => `Based on your answers so far: ${item}`), 'Please review and confirm: non-goals are not yet explicit.')}

## Data and integrations
${listToBullets(context.integrations.map((item) => `Based on your answers so far: ${item}`), 'Inferred assumption: the first release is mostly local and markdown-first.')}

## Unresolved warnings
${listToBullets(bundle.unresolvedWarnings.map((warning) => `[${warning.severity}] ${warning.title}: ${warning.message}`), 'No unresolved warnings recorded.')}
`
  );

  add('repo/input.json', JSON.stringify(input, null, 2));
  add('repo/mvp-builder-state.json', JSON.stringify(mvpBuilderState, null, 2));

  add(
    'repo/manifest.json',
    JSON.stringify(
      {
        exportRoot: bundle.exportRoot,
        profile: bundle.profile.key,
        readinessScore: bundle.score.total,
        buildReadiness: bundle.score.buildReadiness,
        productFit: bundle.score.productFit,
        rating: bundle.score.rating,
        archetypeDetection: bundle.archetypeDetection,
        semanticFit: {
          score: bundle.semanticFit.score,
          verdict: bundle.semanticFit.verdict,
          inputTokenCount: bundle.semanticFit.inputTokenCount,
          outputTokenCount: bundle.semanticFit.outputTokenCount,
          overlapTokenCount: bundle.semanticFit.overlapTokenCount
        },
        scoreAdjustments: bundle.score.adjustments,
        lifecycleStatus: bundle.lifecycleStatus,
        phaseCount: bundle.phases.length,
        primaryAudience: context.primaryAudience,
        primaryFeature: context.primaryFeature,
        supportedAgents: ['codex', 'claude-code', 'opencode'],
        generatedArtifacts: [
          'CODEX_START_HERE.md',
          'CLAUDE_START_HERE.md',
          'OPENCODE_START_HERE.md',
          'CODEX_HANDOFF_PROMPT.md',
          'CLAUDE_HANDOFF_PROMPT.md',
          'OPENCODE_HANDOFF_PROMPT.md',
          'AGENTS.md',
          'auto-improve/PROGRAM.md',
          'auto-improve/QUALITY_RUBRIC.md',
          'auto-improve/SCORECARD.md',
          'auto-improve/RUN_LOOP.md'
        ],
        packageSummary: `${input.productName} package for Codex, Claude Code, and OpenCode.`,
        warningCounts: bundle.warningCounts,
        blockingWarnings: bundle.blockingWarnings.map((warning) => ({
          id: warning.id,
          title: warning.title,
          message: warning.message,
          action: warning.action
        })),
        approvalRequired: bundle.approvalRequired,
        approvedForBuild: bundle.approvedForBuild,
        unresolvedWarnings: bundle.unresolvedWarnings,
        currentPhase: mvpBuilderState.currentPhase,
        completedPhases: mvpBuilderState.completedPhases,
        blockedPhases: mvpBuilderState.blockedPhases
      },
      null,
      2
    )
  );

  bundle.phases.forEach((phase) => {
    const gateNumber = String(phase.index).padStart(2, '0');
    const nextPhase = bundle.phases[phase.index];
    add(`phases/${phase.slug}/README.md`, renderPhaseMarkdown(phase));
    add(`phases/${phase.slug}/PHASE_BRIEF.md`, buildPhaseBrief(phase, input, context, assumptionsAndQuestions, nextPhase));
    add(`phases/${phase.slug}/ENTRY_GATE.md`, buildPhaseEntryGate(phase));
    add(`phases/${phase.slug}/CODEX_BUILD_PROMPT.md`, buildAgentPrompt('Codex', phase, input, context));
    add(`phases/${phase.slug}/CLAUDE_BUILD_PROMPT.md`, buildAgentPrompt('Claude Code', phase, input, context));
    add(`phases/${phase.slug}/OPENCODE_BUILD_PROMPT.md`, buildAgentPrompt('OpenCode', phase, input, context));
    add(`phases/${phase.slug}/VERIFY_PROMPT.md`, buildVerifyPrompt(phase, bundle, input));
    add(`phases/${phase.slug}/VERIFICATION_REPORT.md`, buildVerificationReport(phase, input));
    add(`phases/${phase.slug}/EVIDENCE_CHECKLIST.md`, buildEvidenceChecklist(phase, input));
    add(`phases/${phase.slug}/EXIT_GATE.md`, buildPhaseExitGate(phase, context));
    add(`phases/${phase.slug}/TEST_PLAN.md`, buildPhaseTestPlan(phase, input, context));
    // Phase E3: emit grounded TEST_CASES.md per phase when research has test cases.
    if (context.extractions?.testCases && context.extractions.testCases.length) {
      add(`phases/${phase.slug}/TEST_CASES.md`, renderPhaseTestCasesMarkdown(phase, context.extractions));
    }
    // Phase F2: per-phase end-to-end integration tests with realistic fixture data.
    if (context.extractions && context.extractions.workflows.length > 0) {
      add(
        `phases/${phase.slug}/INTEGRATION_TESTS.md`,
        renderPhaseIntegrationTestsMarkdown({ slug: phase.slug, name: phase.name, goal: phase.goal }, context.extractions, input)
      );
    }
    add(`phases/${phase.slug}/TEST_SCRIPT.md`, buildPhaseTestScript(phase, input, context));
    add(`phases/${phase.slug}/TEST_RESULTS.md`, buildPhaseTestResults(phase));
    add(`phases/${phase.slug}/HANDOFF_SUMMARY.md`, buildPhaseHandoffSummary(phase, input, context));
    add(`phases/${phase.slug}/NEXT_PHASE_CONTEXT.md`, buildNextPhaseContext(phase, nextPhase, input, context));
    add(
      `gates/gate-${gateNumber}-entry.md`,
      `# Gate ${gateNumber} Entry

## What this file is for
This is the short entry checklist for the phase. Use it when you want a quick gate-only view.

## Phase
${phase.name}

## This phase can start when
${phase.entryCriteria.map((item) => `- ${item}`).join('\n')}

## What you should do next
- If every line is true, the phase can start.
- If any line is false or unclear, stop and fix it first.
`
    );
    add(
      `gates/gate-${gateNumber}-exit.md`,
      `# Gate ${gateNumber} Exit

## What this file is for
This is the short exit checklist for the phase. Use it when you want a quick gate-only view before closing the phase.

## Phase
${phase.name}

## This phase is ready only when
${phase.exitCriteria.map((item) => `- ${item}`).join('\n')}

## Concrete expected outputs
${phase.expectedOutputs.map((item) => `- ${item}`).join('\n')}

## Required evidence
${phase.evidenceExamples.map((item) => `- ${item}`).join('\n')}

## Failure or blocker conditions
${phase.failureConditions.map((item) => `- ${item}`).join('\n')}

## What you should do next
- Review this checklist before calling the phase complete.
- Fill out VERIFICATION_REPORT.md before trying to advance.
`
    );
  });

  add('regression-suite/README.md', buildRegressionSuiteReadme(input, bundle, context));
  add('regression-suite/RUN_REGRESSION.md', buildRegressionRun(input, bundle, context));
  add('regression-suite/REGRESSION_CHECKLIST.md', buildRegressionChecklist(input, bundle, context));
  add('regression-suite/REGRESSION_RESULTS_TEMPLATE.md', buildRegressionResultsTemplate(input));
  add('regression-suite/scripts/README.md', buildRegressionScriptsReadme());
  add('regression-suite/scripts/run-all.md', buildRunAllScript(bundle));
  add('regression-suite/scripts/artifact-integrity.md', buildArtifactIntegrityScript(input, bundle, context));
  add('regression-suite/scripts/gate-consistency.md', buildGateConsistencyScript(input, bundle, context));
  add('regression-suite/scripts/evidence-quality.md', buildEvidenceQualityScript(input, bundle, context));
  add('regression-suite/scripts/handoff-continuity.md', buildHandoffContinuityScript(input, bundle, context));
  add('regression-suite/scripts/agent-rules.md', buildAgentRulesScript(input));
  add('regression-suite/scripts/local-first.md', buildLocalFirstScript(input, context));
  add('regression-suite/scripts/run-regression.ts', buildRunnableRegressionScript());

  return files;
}

export function generateProjectBundle(
  input: ProjectInput,
  options: { extractions?: ResearchExtractions } = {}
): ProjectBundle {
  const profile = getProfileConfig(input);
  const questionnaire = buildQuestionnaire(input);
  const context = buildContext(input, options.extractions);
  const critique = buildCritique(input, questionnaire, context);
  const phases = buildPhasePlan(input, context, critique);
  const baseScore = scoreProject(input, questionnaire, critique);

  // Compute semantic fit between the brief and the requirements body the generator
  // would render. We do this before warnings are built so a critical drift can become
  // a blocker that influences lifecycle.
  const requirementsBody = buildFunctionalRequirements(input, context);
  const semanticFit = computeSemanticFit(input, requirementsBody, context.archetypeDetection.confidence);
  const rawScore = withSemanticFit(baseScore, semanticFit);

  const warnings = buildWarnings(input, questionnaire, critique, context, rawScore);
  if (semanticFit.verdict !== 'high') {
    const severity = semanticFit.verdict === 'critical' ? 'blocker' : 'warning';
    const id = `semantic-fit-${semanticFit.verdict}`;
    if (!warnings.some((w) => w.id === id)) {
      warnings.push({
        id,
        severity,
        title:
          semanticFit.verdict === 'critical'
            ? 'Generated requirements describe a different product'
            : 'Generated requirements drift from brief',
        message: `Semantic fit between the brief and the generated FUNCTIONAL_REQUIREMENTS.md is ${semanticFit.score.toFixed(2)} (Jaccard token overlap).`,
        action: context.extractions
          ? 'Re-run the research recipe to produce richer extractions, then regenerate the workspace.'
          : 'Run docs/RESEARCH_RECIPE.md to produce research extractions before regenerating; templated generation is the deprecated path.',
        source: 'generator',
        openQuestion: 'Are the brief and the generated requirements describing the same product?',
        assumption: context.extractions
          ? 'Research extractions are present; low semantic fit indicates thin extractions or a brief mismatch.'
          : 'No research extractions are present; the workspace falls back to the generic templated path.'
      });
    }
  }
  // Phase A3c: warn when generation runs without research extractions. The
  // research-driven path is the supported path; the templated path is legacy
  // and produces a generic, low-quality baseline.
  if (!context.extractions) {
    const id = 'archetype-general-fallback';
    if (!warnings.some((w) => w.id === id)) {
      warnings.push({
        id,
        severity: 'info',
        title: 'Generated without research extractions (legacy templated path)',
        message:
          'No research extractions were provided. Generated requirements, entities, and sample data use the generic baseline rather than domain-specific terms.',
        action:
          'Run docs/RESEARCH_RECIPE.md inside your coding agent to produce research extractions, then regenerate with --research-from=<dir>.',
        source: 'generator',
        openQuestion: 'Is the generic baseline acceptable, or should research extractions be produced first?',
        assumption: 'Research extractions are the supported source of truth for entities, actors, and workflows.'
      });
    }
  }

  const { approvalRequired, approvedForBuild } = getApprovalFlags(input);
  const buildReady = computeBuildReadyFlag(context);
  const lifecycleStatus = deriveLifecycleStatus({
    warnings,
    scoreTotal: rawScore.total,
    approvedForBuild,
    buildReady
  });
  const score = reconcileScoreWithLifecycle(rawScore, lifecycleStatus, warnings, semanticFit);
  const warningCounts: Record<WarningSeverity, number> = {
    info: warnings.filter((warning) => warning.severity === 'info').length,
    warning: warnings.filter((warning) => warning.severity === 'warning').length,
    blocker: warnings.filter((warning) => warning.severity === 'blocker').length
  };
  const blockingWarnings = warnings.filter((warning) => warning.severity === 'blocker');
  const unresolvedWarnings = warnings.filter((warning) => warning.severity !== 'info' || lifecycleStatus !== 'ApprovedForBuild').slice(0, 12);
  const bundle: ProjectBundle = {
    exportRoot: DEFAULT_EXPORT_ROOT,
    profile,
    questionnaire,
    critique,
    warnings,
    phases,
    score,
    lifecycleStatus,
    unresolvedWarnings,
    warningCounts,
    blockingWarnings,
    approvalRequired,
    approvedForBuild,
    files: [],
    archetypeDetection: context.archetypeDetection,
    semanticFit,
    hasResearchExtractions: Boolean(context.extractions)
  };

  bundle.files = createGeneratedFiles(bundle, input, context);
  return bundle;
}

export function generateProjectFiles(input: ProjectInput) {
  return generateProjectBundle(input).files;
}
