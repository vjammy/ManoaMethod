import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateProjectBundle } from '../lib/generator';
import { baseProjectInput } from '../lib/templates';
import { buildWorkflowSteps, canApproveForBuild, canExportBuildReady, mapWarningToStep } from '../lib/workflow';
import { createArtifactPackage, loadInput } from './xelera-create-project';
import { runNextPhase } from './xelera-next-phase';
import { runValidate } from './xelera-validate';
import { runStatus } from './xelera-status';
import { parseExitGateResult, parseVerificationEvidenceFiles, parseVerificationRecommendation } from './xelera-package-utils';
import type { ProjectInput } from '../lib/types';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function buildAnsweredInput(overrides: Partial<ProjectInput> = {}): ProjectInput {
  const input = {
    ...baseProjectInput(),
    ...overrides,
    questionnaireAnswers: {
      ...baseProjectInput().questionnaireAnswers,
      ...(overrides.questionnaireAnswers || {})
    }
  };

  if (!Object.keys(input.questionnaireAnswers).length) {
    input.questionnaireAnswers = {
      'north-star':
        'The first release must prove that a vague product request can become a build-ready markdown handoff with real gates and review steps.',
      'primary-workflow':
        'Start a project, choose a profile, fill the brief, answer the questionnaire, review critique, inspect phases and gates, then export the package.',
      'scope-cut':
        'Keep the planning workflow, critique, scorecard, phase gates, zip export, and CLI. Defer persistence and integrations.',
      acceptance:
        'A reviewer should be able to read the package, understand what to build, and identify acceptance proof without extra chat context.',
      'operating-risks':
        'The main risks are shallow input quality, skipped gates, stale artifacts, and overconfidence in an unfinished plan.'
    };

    if (input.track === 'technical') {
      input.questionnaireAnswers['data-boundaries'] =
        'The key boundaries are the project brief, questionnaire answers, generated markdown artifacts, zip export, and CLI input and output files.';
      input.questionnaireAnswers['failure-modes'] =
        'Failure modes include vague briefs, contradictory scope, skipped exit gates, missing test evidence, and unreviewed assumptions.';
      input.questionnaireAnswers['test-proof'] =
        'The builder should run the smoke checks, confirm the phase gates, and verify the exported package contents.';
      if (input.level !== 'beginner') {
        input.questionnaireAnswers['deployment-guardrails'] =
          'Build must pass locally, the package must export cleanly, and release assumptions must stay within local-first constraints.';
      }
      if (input.level === 'advanced') {
        input.questionnaireAnswers.observability =
          'The plan should define what to log, what support issues to watch, and what signals prove the package is being used correctly.';
        input.questionnaireAnswers['scaling-risk'] =
          'The biggest scale risks are large artifact packages, repeated regeneration, and weak boundaries around future integrations.';
      }
    } else {
      input.questionnaireAnswers['customer-pain'] =
        'Teams waste time and money when they start coding without a strong planning package.';
      input.questionnaireAnswers['business-proof'] =
        'The business proof is fewer planning gaps, clearer handoffs, and less implementation churn.';
      if (input.level !== 'beginner') {
        input.questionnaireAnswers['user-segments'] =
          'Primary users are product owners. Secondary users are technical reviewers and delivery teams.';
        input.questionnaireAnswers['stakeholder-workflow'] =
          'Product owners draft the package, reviewers challenge it, and builders use the final artifacts as the source of truth.';
      }
      if (input.level === 'advanced') {
        input.questionnaireAnswers.monetization =
          'The business value comes from faster planning, fewer implementation misfires, and stronger handoffs to expensive engineering resources.';
        input.questionnaireAnswers['adoption-risks'] =
          'Adoption can fail if stakeholders treat the score as approval to skip planning discipline or ignore critique items.';
      }
    }
  }

  return input;
}

function getFile(bundle: ReturnType<typeof generateProjectBundle>, pathName: string) {
  return bundle.files.find((file) => file.path === pathName)?.content || '';
}

async function main() {
  const sample = buildAnsweredInput(loadInput(path.resolve('examples/sample-project.json')));
  const familySamplePath = path.resolve('examples/family-task-app.json');
  const familySample = loadInput(familySamplePath);
  const bundle = generateProjectBundle(sample);
  const guide = getFile(bundle, 'STEP_BY_STEP_BUILD_GUIDE.md');
  const handoff = getFile(bundle, 'HANDOFF.md');
  const approvalGate = getFile(bundle, '00_APPROVAL_GATE.md');
  const startHere = getFile(bundle, 'START_HERE.md');
  const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
  const manifest = JSON.parse(getFile(bundle, 'repo/manifest.json'));
  const state = JSON.parse(getFile(bundle, 'repo/xelera-state.json'));
  const workflowSteps = buildWorkflowSteps(sample, bundle);

  assert(bundle.phases.length >= 10, `Expected at least 10 phases, received ${bundle.phases.length}`);
  assert(bundle.files.some((file) => file.path === 'README.md'), 'Missing package README.md');
  assert(bundle.files.some((file) => file.path === 'QUICKSTART.md'), 'Missing package QUICKSTART.md');
  assert(bundle.files.some((file) => file.path === 'TROUBLESHOOTING.md'), 'Missing package TROUBLESHOOTING.md');
  assert(bundle.files.some((file) => file.path === 'START_HERE.md'), 'Missing START_HERE.md');
  assert(bundle.files.some((file) => file.path === 'PROJECT_BRIEF.md'), 'Missing PROJECT_BRIEF.md');
  assert(bundle.files.some((file) => file.path === 'SCORECARD.md'), 'Missing SCORECARD.md');
  assert(bundle.files.some((file) => file.path === '00_APPROVAL_GATE.md'), 'Missing 00_APPROVAL_GATE.md');
  assert(bundle.files.some((file) => file.path === 'CODEX_START_HERE.md'), 'Missing CODEX_START_HERE.md');
  assert(bundle.files.some((file) => file.path === 'CLAUDE_START_HERE.md'), 'Missing CLAUDE_START_HERE.md');
  assert(bundle.files.some((file) => file.path === 'OPENCODE_START_HERE.md'), 'Missing OPENCODE_START_HERE.md');
  assert(bundle.files.some((file) => file.path === 'CODEX_HANDOFF_PROMPT.md'), 'Missing CODEX_HANDOFF_PROMPT.md');
  assert(bundle.files.some((file) => file.path === 'CLAUDE_HANDOFF_PROMPT.md'), 'Missing CLAUDE_HANDOFF_PROMPT.md');
  assert(bundle.files.some((file) => file.path === 'OPENCODE_HANDOFF_PROMPT.md'), 'Missing OPENCODE_HANDOFF_PROMPT.md');
  assert(bundle.files.some((file) => file.path === '00_PROJECT_CONTEXT.md'), 'Missing 00_PROJECT_CONTEXT.md');
  assert(bundle.files.some((file) => file.path === '01_CONTEXT_RULES.md'), 'Missing 01_CONTEXT_RULES.md');
  assert(bundle.files.some((file) => file.path === '02_HOW_TO_USE_WITH_CODEX.md'), 'Missing 02_HOW_TO_USE_WITH_CODEX.md');
  assert(bundle.files.some((file) => file.path === '03_HOW_TO_USE_WITH_CLAUDE_CODE.md'), 'Missing 03_HOW_TO_USE_WITH_CLAUDE_CODE.md');
  assert(bundle.files.some((file) => file.path === '04_HOW_TO_USE_WITH_OPENCODE.md'), 'Missing 04_HOW_TO_USE_WITH_OPENCODE.md');
  assert(bundle.files.some((file) => file.path === 'AGENTS.md'), 'Missing AGENTS.md');
  assert(bundle.files.some((file) => file.path === 'repo/xelera-state.json'), 'Missing repo/xelera-state.json');
  assert(fs.existsSync(familySamplePath), 'Missing examples/family-task-app.json');
  assert(fs.existsSync(path.resolve('docs/NOVICE_GUIDE.md')), 'Missing docs/NOVICE_GUIDE.md');
  assert(fs.existsSync(path.resolve('docs/QUICKSTART.md')), 'Missing docs/QUICKSTART.md');
  assert(fs.existsSync(path.resolve('docs/GLOSSARY.md')), 'Missing docs/GLOSSARY.md');
  assert(fs.existsSync(path.resolve('docs/TROUBLESHOOTING.md')), 'Missing docs/TROUBLESHOOTING.md');
  assert(fs.existsSync(path.resolve('docs/EXAMPLE_FAMILY_TASK_APP.md')), 'Missing docs/EXAMPLE_FAMILY_TASK_APP.md');
  assert(/family-task-app\.json/i.test(readme) || /Family Task Board/i.test(readme), 'README.md should reference the family task app example.');

  assert(
    manifest.supportedAgents.includes('codex') &&
      manifest.supportedAgents.includes('claude-code') &&
      manifest.supportedAgents.includes('opencode'),
    'Manifest supportedAgents must include codex, claude-code, and opencode.'
  );

  const gate01 = getFile(bundle, 'gates/gate-01-entry.md');
  const gate02 = getFile(bundle, 'gates/gate-02-entry.md');
  assert(!/prior phase handoff/i.test(gate01), 'Phase 1 gate incorrectly mentions prior phase handoff.');
  assert(/Project brief exists\./.test(gate01), 'Phase 1 gate did not include the required brief check.');
  assert(/Previous phase handoff complete\./.test(gate02), 'Phase 2 gate did not include previous phase handoff.');

  const phasePlan = getFile(bundle, 'PHASE_PLAN.md');
  assert(
    /technical product owners/i.test(phasePlan) || /AI-assisted builders/i.test(phasePlan),
    'Generated phases did not include project-specific audience terms.'
  );
  assert(
    /Primary audience: Technical product owners/i.test(handoff),
    'Handoff output did not reflect the sample project language.'
  );
  assert(/## What this package is/.test(startHere), 'START_HERE.md missing package explanation.');
  assert(/## Commands to know/.test(startHere), 'START_HERE.md missing command guidance.');
  assert(/Entry gate:/.test(startHere) && /Exit gate:/.test(startHere), 'START_HERE.md missing gate definitions.');
  assert(/## Package status/.test(guide), 'Final guide did not include package status.');
  assert(/## Assumptions and open questions/.test(guide), 'Final guide did not include assumptions and open questions.');
  assert(
    /Which entities, interfaces, integrations, or file boundaries must be explicit before coding begins\?/i.test(guide),
    'Missing critical answer warning did not appear in the final guide.'
  );
  assert(bundle.lifecycleStatus === 'Blocked', `Expected sample bundle lifecycle status to be Blocked, received ${bundle.lifecycleStatus}`);
  assert(/## Approval decision section/.test(approvalGate), 'Approval gate file did not include the approval decision section.');
  assert(
    /## Blocking issues/.test(approvalGate) && /## Non-blocking warnings/.test(approvalGate),
    'Approval gate file did not include blocker and warning sections.'
  );

  const warningIds = bundle.warnings.map((warning) => warning.id);
  assert(new Set(warningIds).size === warningIds.length, 'Duplicate warnings were not removed.');
  assert(
    manifest.warningCounts.blocker === bundle.warningCounts.blocker &&
      manifest.warningCounts.warning === bundle.warningCounts.warning &&
      manifest.warningCounts.info === bundle.warningCounts.info,
    'Manifest warning severity counts do not match the bundle.'
  );
  assert(Array.isArray(manifest.blockingWarnings), 'Manifest blocking warning list is missing.');
  assert(manifest.lifecycleStatus === bundle.lifecycleStatus, 'Manifest lifecycle status does not match the bundle.');
  assert(manifest.approvalRequired === true, 'Manifest approvalRequired should be true.');
  assert(manifest.approvedForBuild === false, 'Sample package should not be approved for build.');
  assert(state.currentPhase === 1, `Expected xelera-state currentPhase to be 1, received ${state.currentPhase}`);
  assert(Array.isArray(state.unresolvedBlockers), 'xelera-state unresolvedBlockers list is missing.');
  assert(workflowSteps.length === 8, `Expected 8 workflow steps, received ${workflowSteps.length}`);
  assert(
    workflowSteps.some((step) => step.id === 'approval-gate' && step.status === 'Blocked'),
    'Approval gate step should be blocked for the sample package.'
  );
  assert(
    workflowSteps.some((step) => step.id === 'export-package' && step.status === 'Needs attention'),
    'Export package step should remain available for draft export while build-ready export is unavailable.'
  );
  const technicalBoundaryWarning = bundle.warnings.find((warning) => /data boundaries|interfaces|integrations/i.test(warning.message));
  assert(technicalBoundaryWarning, 'Expected a technical boundary warning in the sample package.');
  assert(
    technicalBoundaryWarning && mapWarningToStep(technicalBoundaryWarning) === 'technical-questions',
    'Technical boundary warning did not map to the technical questions step.'
  );
  assert(canApproveForBuild(bundle) === false, 'Approval should be unavailable when blockers exist.');
  assert(canExportBuildReady(bundle) === false, 'Build-ready export should be unavailable for the blocked sample bundle.');

  const familyBundle = generateProjectBundle(familySample);
  assert(familyBundle.phases.length >= 10, `Expected family sample to generate at least 10 phases, received ${familyBundle.phases.length}`);
  assert(familyBundle.files.some((file) => file.path === 'START_HERE.md'), 'Family sample package missing START_HERE.md');
  assert(familyBundle.files.some((file) => file.path === 'CODEX_START_HERE.md'), 'Family sample package missing CODEX_START_HERE.md');
  assert(familyBundle.files.some((file) => file.path === 'phases/phase-01/PHASE_BRIEF.md'), 'Family sample package missing phase brief');
  assert(familyBundle.files.some((file) => file.path === 'phases/phase-01/VERIFICATION_REPORT.md'), 'Family sample package missing verification report');
  const familyProjectBrief = getFile(familyBundle, 'PROJECT_BRIEF.md');
  const familyRootReadme = getFile(familyBundle, 'README.md');
  const familyQuickstart = getFile(familyBundle, 'QUICKSTART.md');
  const familyTroubleshooting = getFile(familyBundle, 'TROUBLESHOOTING.md');
  const familyStartHere = getFile(familyBundle, 'START_HERE.md');
  const familyCodexStart = getFile(familyBundle, 'CODEX_START_HERE.md');
  const familyPhaseBrief = getFile(familyBundle, 'phases/phase-01/PHASE_BRIEF.md');
  const familyVerifyPrompt = getFile(familyBundle, 'phases/phase-01/VERIFY_PROMPT.md');
  const familyVerificationReport = getFile(familyBundle, 'phases/phase-01/VERIFICATION_REPORT.md');
  assert(/Family Task Board/i.test(familyProjectBrief), 'Family sample brief should reference Family Task Board.');
  assert(/\[START_HERE\.md\]\(START_HERE\.md\)/.test(familyRootReadme), 'Family sample README should link to START_HERE.md.');
  assert(/\[QUICKSTART\.md\]\(QUICKSTART\.md\)/.test(familyRootReadme), 'Family sample README should link to QUICKSTART.md.');
  assert(/\[TROUBLESHOOTING\.md\]\(TROUBLESHOOTING\.md\)/.test(familyRootReadme), 'Family sample README should link to TROUBLESHOOTING.md.');
  assert(/xelera-method-workspace/.test(familyQuickstart), 'Family sample QUICKSTART should use the actual export root folder name.');
  assert(!/PATH_TO_THIS_PACKAGE/.test(familyQuickstart), 'Family sample QUICKSTART should not use PATH_TO_THIS_PACKAGE.');
  assert(/blocked/i.test(familyTroubleshooting) && /validate/i.test(familyTroubleshooting), 'Family sample TROUBLESHOOTING should explain blocked and validate failures.');
  assert(/kid|child|parent/i.test(familyProjectBrief), 'Family sample brief should reference the family roles.');
  assert(/Open these files first/i.test(familyStartHere), 'Family sample START_HERE should tell beginners what to open first.');
  assert(/QUICKSTART\.md/.test(familyStartHere), 'Family sample START_HERE should point beginners to QUICKSTART.md.');
  assert(!/PATH_TO_THIS_PACKAGE/.test(familyStartHere), 'Family sample START_HERE should not use PATH_TO_THIS_PACKAGE.');
  assert(/What to paste into Codex/i.test(familyCodexStart), 'Family sample CODEX_START_HERE should clearly say what to paste into Codex.');
  assert(/## What you should do now/i.test(familyPhaseBrief), 'Family sample PHASE_BRIEF should include a clear next action.');
  assert(/## Out of scope for this phase/i.test(familyPhaseBrief), 'Family sample PHASE_BRIEF should include an out-of-scope section.');
  assert(/## What evidence means/i.test(familyVerifyPrompt), 'Family sample VERIFY_PROMPT should explain what evidence means.');
  assert(/## result: pending/.test(familyVerificationReport) && /## recommendation: pending/.test(familyVerificationReport), 'Family sample VERIFICATION_REPORT should keep required parser headers.');
  const familyGeneratedText = familyBundle.files.map((file) => file.content).join('\n');
  assert(!/Generated from current input/i.test(familyGeneratedText), 'Family sample package should not use "Generated from current input".');
  assert(!/Needs user confirmation/i.test(familyGeneratedText), 'Family sample package should not use "Needs user confirmation".');
  assert(/Based on your answers so far/i.test(familyGeneratedText), 'Family sample package should use beginner-friendly "Based on your answers so far" wording.');
  assert(/Please review and confirm/i.test(familyGeneratedText), 'Family sample package should use beginner-friendly "Please review and confirm" wording.');

  for (const phase of bundle.phases) {
    const requiredPhasePacketFiles = [
      `phases/${phase.slug}/PHASE_BRIEF.md`,
      `phases/${phase.slug}/ENTRY_GATE.md`,
      `phases/${phase.slug}/CODEX_BUILD_PROMPT.md`,
      `phases/${phase.slug}/CLAUDE_BUILD_PROMPT.md`,
      `phases/${phase.slug}/OPENCODE_BUILD_PROMPT.md`,
      `phases/${phase.slug}/VERIFY_PROMPT.md`,
      `phases/${phase.slug}/VERIFICATION_REPORT.md`,
      `phases/${phase.slug}/EVIDENCE_CHECKLIST.md`,
      `phases/${phase.slug}/EXIT_GATE.md`,
      `phases/${phase.slug}/TEST_PLAN.md`,
      `phases/${phase.slug}/HANDOFF_SUMMARY.md`,
      `phases/${phase.slug}/NEXT_PHASE_CONTEXT.md`
    ];
    for (const filePath of requiredPhasePacketFiles) {
      assert(bundle.files.some((file) => file.path === filePath), `Missing phase packet file: ${filePath}`);
    }

    // Task 1: verify improved template structure
    const verifyPrompt = getFile(bundle, `phases/${phase.slug}/VERIFY_PROMPT.md`);
    assert(/## What this file is for/.test(verifyPrompt), `VERIFY_PROMPT.md missing file-purpose section for ${phase.slug}`);
    assert(/## Functional checks/.test(verifyPrompt), `VERIFY_PROMPT.md missing Functional checks for ${phase.slug}`);
    assert(/## Scope checks/.test(verifyPrompt), `VERIFY_PROMPT.md missing Scope checks for ${phase.slug}`);
    assert(/## Local-first constraint checks/.test(verifyPrompt), `VERIFY_PROMPT.md missing Local-first checks for ${phase.slug}`);
    assert(/## Markdown-first constraint checks/.test(verifyPrompt), `VERIFY_PROMPT.md missing Markdown-first checks for ${phase.slug}`);
    assert(/## Agent-readability checks/.test(verifyPrompt), `VERIFY_PROMPT.md missing Agent-readability checks for ${phase.slug}`);
    assert(/## Novice-user clarity checks/.test(verifyPrompt), `VERIFY_PROMPT.md missing Novice-user clarity checks for ${phase.slug}`);
    assert(/## Regression risks/.test(verifyPrompt), `VERIFY_PROMPT.md missing Regression risks for ${phase.slug}`);
    assert(/## Final decision rules/.test(verifyPrompt), `VERIFY_PROMPT.md missing Final decision rules for ${phase.slug}`);

    const evidenceChecklist = getFile(bundle, `phases/${phase.slug}/EVIDENCE_CHECKLIST.md`);
    assert(/## Required evidence/.test(evidenceChecklist), `EVIDENCE_CHECKLIST.md missing Required evidence for ${phase.slug}`);
    assert(/## Commands expected to run/.test(evidenceChecklist), `EVIDENCE_CHECKLIST.md missing Commands expected to run for ${phase.slug}`);
    assert(/## Files expected to change/.test(evidenceChecklist), `EVIDENCE_CHECKLIST.md missing Files expected to change for ${phase.slug}`);
    assert(/## Acceptable evidence/.test(evidenceChecklist), `EVIDENCE_CHECKLIST.md missing Acceptable evidence for ${phase.slug}`);
    assert(/## Unacceptable evidence/.test(evidenceChecklist), `EVIDENCE_CHECKLIST.md missing Unacceptable evidence for ${phase.slug}`);
    assert(/## Manual checks/.test(evidenceChecklist), `EVIDENCE_CHECKLIST.md missing Manual checks for ${phase.slug}`);

    const verificationReport = getFile(bundle, `phases/${phase.slug}/VERIFICATION_REPORT.md`);
    assert(/## result: pending/.test(verificationReport), `VERIFICATION_REPORT.md missing result field for ${phase.slug}`);
    assert(/Allowed: pass \| fail \| pending/.test(verificationReport), `VERIFICATION_REPORT.md missing result allowed values for ${phase.slug}`);
    assert(/## recommendation: pending/.test(verificationReport), `VERIFICATION_REPORT.md missing recommendation field for ${phase.slug}`);
    assert(
      /Allowed: proceed \| revise \| blocked \| pending/.test(verificationReport),
      `VERIFICATION_REPORT.md missing recommendation allowed values for ${phase.slug}`
    );
    assert(/## files reviewed/.test(verificationReport), `VERIFICATION_REPORT.md missing files reviewed for ${phase.slug}`);
    assert(/## files changed/.test(verificationReport), `VERIFICATION_REPORT.md missing files changed for ${phase.slug}`);
    assert(/## commands run/.test(verificationReport), `VERIFICATION_REPORT.md missing commands run for ${phase.slug}`);
    assert(/## evidence files/.test(verificationReport), `VERIFICATION_REPORT.md missing evidence files for ${phase.slug}`);
    assert(
      /List the evidence files you actually reviewed before selecting `pass \+ proceed`\./.test(verificationReport),
      `VERIFICATION_REPORT.md missing evidence instructions for ${phase.slug}`
    );
    assert(/- pending/.test(verificationReport), `VERIFICATION_REPORT.md missing pending evidence placeholder for ${phase.slug}`);
    assert(/## warnings/.test(verificationReport), `VERIFICATION_REPORT.md missing warnings for ${phase.slug}`);
    assert(/## defects found/.test(verificationReport), `VERIFICATION_REPORT.md missing defects found for ${phase.slug}`);
    assert(/## follow-up actions/.test(verificationReport), `VERIFICATION_REPORT.md missing follow-up actions for ${phase.slug}`);
    const phaseBrief = getFile(bundle, `phases/${phase.slug}/PHASE_BRIEF.md`);
    assert(/## Out of scope for this phase/.test(phaseBrief), `PHASE_BRIEF.md missing out-of-scope section for ${phase.slug}`);
    const exitGate = getFile(bundle, `phases/${phase.slug}/EXIT_GATE.md`);
    assert(/Existing functionality and previously completed phase outputs still work/i.test(exitGate), `EXIT_GATE.md missing regression check for ${phase.slug}`);
    const quickExitGate = getFile(bundle, `gates/gate-${String(phase.index).padStart(2, '0')}-exit.md`);
    assert(/Existing functionality and previously completed phase outputs still work/i.test(quickExitGate), `Quick exit gate missing regression check for ${phase.slug}`);
    assert(/## final decision/.test(verificationReport), `VERIFICATION_REPORT.md missing final decision for ${phase.slug}`);
    assert(/Selected result: pending/.test(verificationReport), `VERIFICATION_REPORT.md missing backward-compatible Selected result for ${phase.slug}`);
    assert(/Selected recommendation: pending/.test(verificationReport), `VERIFICATION_REPORT.md missing backward-compatible Selected recommendation for ${phase.slug}`);
  }

  const beginnerBusiness = generateProjectBundle(
    buildAnsweredInput({ level: 'beginner', track: 'business', productName: 'Mode Test BB' })
  );
  const advancedTechnical = generateProjectBundle(
    buildAnsweredInput({ level: 'advanced', track: 'technical', productName: 'Mode Test AT' })
  );

  assert(
    beginnerBusiness.questionnaire.length !== advancedTechnical.questionnaire.length,
    'Modes should produce different questionnaire depth.'
  );
  assert(
    beginnerBusiness.phases.some((phase) => /business value|acceptance/i.test(phase.name)) &&
      advancedTechnical.phases.some((phase) => /security|observability|scalability/i.test(phase.name)),
    'Modes did not create meaningfully different phase guidance.'
  );
  const beginnerGuide = getFile(beginnerBusiness, 'STEP_BY_STEP_BUILD_GUIDE.md');
  const advancedPhase = getFile(advancedTechnical, 'phases/phase-01/README.md');
  assert(/simple|checklist|step-by-step/i.test(beginnerGuide), 'Beginner/business output did not stay simpler and more guided.');
  assert(
    /security|observability|failure modes|architecture/i.test(advancedPhase),
    'Advanced/technical output did not stay deeper and more technical.'
  );

  const verboseGeneric = buildAnsweredInput({
    productName: 'Generic Plan',
    productIdea:
      'Platform solution synergy platform solution synergy platform solution synergy platform solution synergy.',
    problemStatement:
      'This is a generic problem statement that mentions generic improvement but not why it matters or for whom.',
    targetAudience: 'Everyone, everyone, everyone.',
    constraints: 'Keep things flexible.',
    risks: 'General risk.',
    successMetrics: 'Success means success.',
    questionnaireAnswers: {
      'north-star': 'Do something useful.',
      'primary-workflow': 'Users use the product.',
      'scope-cut': 'Keep everything.',
      acceptance: 'Looks good.',
      'operating-risks': 'Some risks exist.'
    }
  });
  const genericBundle = generateProjectBundle(verboseGeneric);
  assert(bundle.score.total > genericBundle.score.total, 'Scorecard still appears to reward verbosity more than specificity.');
  assert(
    genericBundle.warningCounts.blocker > 0 && genericBundle.lifecycleStatus === 'Blocked',
    'Missing critical answers should reduce readiness and create a blocked lifecycle status.'
  );
  const genericGuide = getFile(genericBundle, 'STEP_BY_STEP_BUILD_GUIDE.md');
  assert(
    /critical planning answer is still missing|Please review and confirm/i.test(genericGuide),
    'Missing critical answers did not appear in the final guide.'
  );

  const reviewReadyBundle = generateProjectBundle(
    buildAnsweredInput({
      level: 'advanced',
      track: 'technical',
      productName: 'Review Ready AT',
      targetAudience:
        'Technical product owners, engineering leads, and AI-assisted builders shipping internal planning tools.',
      constraints:
        'Keep the MVP local-first, markdown-first, deterministic, and inside the current Next.js plus CLI stack with no auth or payments.',
      risks:
        'The main risks are stale planning artifacts, skipped gates, misunderstood acceptance criteria, and false confidence in inferred assumptions.',
      successMetrics:
        'A reviewer should be able to inspect the package, trace every phase back to the brief, and approve it for build without relying on hidden chat context.',
      questionnaireAnswers: {
        'north-star':
          'The release must prove that a planner can create a trustworthy, build-review-ready markdown package without hidden chat context.',
        'primary-workflow':
          'Start a project, choose the advanced technical mode, complete the brief, answer the full questionnaire, review the critique, inspect each gate, and export the package for human approval.',
        'data-boundaries':
          'Explicit boundaries include the project brief inputs, questionnaire responses, generated markdown artifacts, zip export contents, and CLI package files that mirror the UI output.',
        'failure-modes':
          'Key failure modes are contradictory scope, weak phase exits, skipped review evidence, missing ownership, and unlabeled assumptions that slip into implementation.',
        observability:
          'The package should define what to log during export, what review signals matter, and what patterns show downstream builders misunderstood the plan.',
        'scaling-risk':
          'The main scaling risks are artifact sprawl, repeated regeneration, and future integration drift if package boundaries stay vague.',
        'scope-cut':
          'Keep planning, critique, lifecycle status, approval gate, scorecard, phases, gates, and export parity. Defer persistence, auth, payments, and external AI integrations.',
        acceptance:
          'A skeptical reviewer should be able to audit the package, trace every phase to the brief, and identify all unresolved assumptions before approving the build.',
        'operating-risks':
          'The main operating risks are skipped gates, stale package exports, overconfidence in inferred content, and unreviewed blocker warnings.',
        'deployment-guardrails':
          'Typecheck, smoke, build, and create-project must pass, and the exported package must preserve lifecycle state and warning metadata.',
        'test-proof':
          'The reviewer should run smoke coverage, inspect manifest warning counts, verify the approval gate file, and compare CLI output against the shared UI generator.',
        'approval-decision': '',
        'approval-checklist-complete': ''
      }
    })
  );
  assert(
    reviewReadyBundle.lifecycleStatus === 'ReviewReady',
    `Expected a complete advanced technical package to become ReviewReady, received ${reviewReadyBundle.lifecycleStatus}`
  );
  const reviewReadySteps = buildWorkflowSteps(
    buildAnsweredInput({
      level: 'advanced',
      track: 'technical',
      productName: 'Review Ready AT',
      targetAudience:
        'Technical product owners, engineering leads, and AI-assisted builders shipping internal planning tools.',
      constraints:
        'Keep the MVP local-first, markdown-first, deterministic, and inside the current Next.js plus CLI stack with no auth or payments.',
      risks:
        'The main risks are stale planning artifacts, skipped gates, misunderstood acceptance criteria, and false confidence in inferred assumptions.',
      successMetrics:
        'A reviewer should be able to inspect the package, trace every phase back to the brief, and approve it for build without relying on hidden chat context.',
      questionnaireAnswers: {
        'north-star':
          'The release must prove that a planner can create a trustworthy, build-review-ready markdown package without hidden chat context.',
        'primary-workflow':
          'Start a project, choose the advanced technical mode, complete the brief, answer the full questionnaire, review the critique, inspect each gate, and export the package for human approval.',
        'data-boundaries':
          'Explicit boundaries include the project brief inputs, questionnaire responses, generated markdown artifacts, zip export contents, and CLI package files that mirror the UI output.',
        'failure-modes':
          'Key failure modes are contradictory scope, weak phase exits, skipped review evidence, missing ownership, and unlabeled assumptions that slip into implementation.',
        observability:
          'The package should define what to log during export, what review signals matter, and what patterns show downstream builders misunderstood the plan.',
        'scaling-risk':
          'The main scaling risks are artifact sprawl, repeated regeneration, and future integration drift if package boundaries stay vague.',
        'scope-cut':
          'Keep planning, critique, lifecycle status, approval gate, scorecard, phases, gates, and export parity. Defer persistence, auth, payments, and external AI integrations.',
        acceptance:
          'A skeptical reviewer should be able to audit the package, trace every phase to the brief, and identify all unresolved assumptions before approving the build.',
        'operating-risks':
          'The main operating risks are skipped gates, stale package exports, overconfidence in inferred content, and unreviewed blocker warnings.',
        'deployment-guardrails':
          'Typecheck, smoke, build, and create-project must pass, and the exported package must preserve lifecycle state and warning metadata.',
        'test-proof':
          'The reviewer should run smoke coverage, inspect manifest warning counts, verify the approval gate file, and compare CLI output against the shared UI generator.',
        'approval-decision': '',
        'approval-checklist-complete': ''
      }
    }),
    reviewReadyBundle
  );
  assert(canApproveForBuild(reviewReadyBundle) === true, 'Approval should be available for a review-ready package.');
  assert(canExportBuildReady(reviewReadyBundle) === false, 'Build-ready export should remain unavailable until explicit approval exists.');
  assert(
    reviewReadySteps.some((step) => step.id === 'approval-gate' && step.status === 'Needs attention'),
    'Approval gate should need attention, not be complete, for a review-ready package without approval.'
  );

  const approvedInput = buildAnsweredInput({
    level: 'advanced',
    track: 'technical',
    productName: 'Approved AT',
    targetAudience:
      'Technical product owners, engineering leads, and AI-assisted builders shipping internal planning tools.',
    constraints:
      'Keep the MVP local-first, markdown-first, deterministic, and inside the current Next.js plus CLI stack with no auth or payments.',
    risks:
      'The main risks are stale planning artifacts, skipped gates, misunderstood acceptance criteria, and false confidence in inferred assumptions.',
    successMetrics:
      'A reviewer should be able to inspect the package, trace every phase back to the brief, and approve it for build without relying on hidden chat context.',
    questionnaireAnswers: {
      'north-star':
        'The release must prove that a planner can create a trustworthy, build-review-ready markdown package without hidden chat context.',
      'primary-workflow':
        'Start a project, choose the advanced technical mode, complete the brief, answer the full questionnaire, review the critique, inspect each gate, and export the package for human approval.',
      'data-boundaries':
        'Explicit boundaries include the project brief inputs, questionnaire responses, generated markdown artifacts, zip export contents, and CLI package files that mirror the UI output.',
      'failure-modes':
        'Key failure modes are contradictory scope, weak phase exits, skipped review evidence, missing ownership, and unlabeled assumptions that slip into implementation.',
      observability:
        'The package should define what to log during export, what review signals matter, and what patterns show downstream builders misunderstood the plan.',
      'scaling-risk':
        'The main scaling risks are artifact sprawl, repeated regeneration, and future integration drift if package boundaries stay vague.',
      'scope-cut':
        'Keep planning, critique, lifecycle status, approval gate, scorecard, phases, gates, and export parity. Defer persistence, auth, payments, and external AI integrations.',
      acceptance:
        'A skeptical reviewer should be able to audit the package, trace every phase to the brief, and identify all unresolved assumptions before approving the build.',
      'operating-risks':
        'The main operating risks are skipped gates, stale package exports, overconfidence in inferred content, and unreviewed blocker warnings.',
      'deployment-guardrails':
        'Typecheck, smoke, build, and create-project must pass, and the exported package must preserve lifecycle state and warning metadata.',
      'test-proof':
        'The reviewer should run smoke coverage, inspect manifest warning counts, verify the approval gate file, and compare CLI output against the shared UI generator.',
      'approval-decision': 'approved-for-build',
      'approval-checklist-complete': 'true',
      'approval-reviewed-by': 'Smoke Test Reviewer',
      'approval-notes': 'All blocker warnings cleared and approval checklist completed.'
    }
  });
  const approvedForBuildBundle = generateProjectBundle(approvedInput);
  assert(
    approvedForBuildBundle.lifecycleStatus === 'ApprovedForBuild',
    `Expected explicit approval to produce ApprovedForBuild, received ${approvedForBuildBundle.lifecycleStatus}`
  );
  assert(canExportBuildReady(approvedForBuildBundle) === true, 'Build-ready export should be available once the bundle is approved for build.');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const cliResult = await createArtifactPackage({
    input: sample,
    outDir: tempDir,
    zip: true
  });
  const cliBrief = fs.readFileSync(path.join(cliResult.rootDir, 'PROJECT_BRIEF.md'), 'utf8');
  const uiBrief = getFile(bundle, 'PROJECT_BRIEF.md');
  assert(cliBrief === uiBrief, 'CLI artifact output diverged from shared generator output.');
  const cliGuide = fs.readFileSync(path.join(cliResult.rootDir, 'STEP_BY_STEP_BUILD_GUIDE.md'), 'utf8');
  assert(cliGuide === guide, 'CLI final guide output diverged from shared generator output.');
  assert(fs.existsSync(cliResult.zipPath), 'CLI zip output was not created.');
  assert(fs.existsSync(path.join(cliResult.rootDir, 'CODEX_START_HERE.md')), 'CLI output is missing CODEX_START_HERE.md.');
  assert(fs.existsSync(path.join(cliResult.rootDir, 'CLAUDE_START_HERE.md')), 'CLI output is missing CLAUDE_START_HERE.md.');
  assert(fs.existsSync(path.join(cliResult.rootDir, 'OPENCODE_START_HERE.md')), 'CLI output is missing OPENCODE_START_HERE.md.');
  assert(fs.existsSync(path.join(cliResult.rootDir, 'repo', 'xelera-state.json')), 'CLI output is missing repo/xelera-state.json.');

  // Test next-phase behavior
  const testPkgDir = cliResult.rootDir;

  // Clear blocked phases for next-phase tests
  const testStatePath = path.join(testPkgDir, 'repo', 'xelera-state.json');
  const testState = JSON.parse(fs.readFileSync(testStatePath, 'utf8'));
  testState.blockedPhases = [];
  fs.writeFileSync(testStatePath, JSON.stringify(testState, null, 2));

  // Test: next-phase without approval/evidence should fail
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${testPkgDir}`];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance without approval/evidence');
  } catch (e) {
    assert(
      (e as Error).message.includes('requires either --approve=true or --evidence='),
      `next-phase error message should mention approval or evidence requirement, got: ${(e as Error).message}`
    );
  }

  // Helper to update both new headers and legacy lines in a verification report
  function updateReport(content: string, result: string, recommendation: string) {
    return content
      .replace(/## result: .+/, `## result: ${result}`)
      .replace(/Selected result: .+/, `Selected result: ${result}`)
      .replace(/## recommendation: .+/, `## recommendation: ${recommendation}`)
      .replace(/Selected recommendation: .+/, `Selected recommendation: ${recommendation}`);
  }

  function replaceEvidenceSection(content: string, bulletLines: string[]) {
    const bullets = bulletLines.join('\n');
    return content.replace(
      /## evidence files[\s\S]*?## warnings/i,
      `## evidence files\nEvidence means the files or notes that prove the phase was checked. List the evidence files you actually reviewed before selecting \`pass + proceed\`.\n\n${bullets}\n\nRules:\n- Replace \`pending\` with real evidence file paths.\n- Do not select \`pass + proceed\` until the listed files exist and support the decision.\n\n## warnings`
    );
  }

  // Test: next-phase with blocked evidence should fail
  const blockedReportPath = path.join(testPkgDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  const blockedReport = updateReport(fs.readFileSync(blockedReportPath, 'utf8'), 'fail', 'blocked');
  fs.writeFileSync(blockedReportPath, blockedReport);
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance with blocked evidence');
  } catch (e) {
    assert(
      (e as Error).message.includes('verification recommends blocked'),
      'next-phase error message should mention blocked recommendation'
    );
  }

  // Test: next-phase with revise evidence should fail
  const reviseReport = updateReport(fs.readFileSync(blockedReportPath, 'utf8'), 'fail', 'revise');
  fs.writeFileSync(blockedReportPath, reviseReport);
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance with revise evidence');
  } catch (e) {
    assert(
      (e as Error).message.includes('verification recommends revise'),
      'next-phase error message should mention revise recommendation'
    );
  }

  // Test: next-phase with pending recommendation should fail
  const pendingRecReport = updateReport(fs.readFileSync(blockedReportPath, 'utf8'), 'pass', 'pending');
  fs.writeFileSync(blockedReportPath, pendingRecReport);
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance with pending recommendation');
  } catch (e) {
    assert(
      (e as Error).message.includes('pending'),
      `next-phase error message should mention pending recommendation, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase with pending result should fail
  const pendingResultReport = updateReport(fs.readFileSync(blockedReportPath, 'utf8'), 'pending', 'proceed');
  fs.writeFileSync(blockedReportPath, pendingResultReport);
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance with pending result');
  } catch (e) {
    assert(
      (e as Error).message.includes('pending'),
      `next-phase error message should mention pending result, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase with inconsistent fail+proceed should fail
  const inconsistentReport = updateReport(fs.readFileSync(blockedReportPath, 'utf8'), 'fail', 'proceed');
  fs.writeFileSync(blockedReportPath, inconsistentReport);
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance with inconsistent result/recommendation');
  } catch (e) {
    assert(
      (e as Error).message.includes('inconsistent'),
      `next-phase error message should mention inconsistency, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase with proceed evidence should succeed
  const proceedReport = updateReport(fs.readFileSync(blockedReportPath, 'utf8'), 'pass', 'proceed');
  fs.writeFileSync(blockedReportPath, proceedReport.replace(/- pending/, '- repo/manifest.json'));
  process.argv = ['node', 'xelera-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`, '--handoff=Smoke test handoff'];
  runNextPhase();

  const updatedState = JSON.parse(fs.readFileSync(path.join(testPkgDir, 'repo', 'xelera-state.json'), 'utf8'));
  assert(updatedState.currentPhase === 2, `Expected currentPhase to advance to 2, received ${updatedState.currentPhase}`);
  assert(updatedState.completedPhases.includes('phase-01'), 'Expected phase-01 to be in completedPhases');
  assert(updatedState.phaseEvidence['phase-01'].approvedToProceed === true, 'Expected phase-01 to be approved to proceed');
  assert(updatedState.phaseEvidence['phase-01'].reviewerRecommendation === 'proceed', 'Expected reviewer recommendation to be proceed');
  assert(updatedState.lastHandoffSummary === 'Smoke test handoff', 'Expected handoff summary to be recorded');

  // Test: next-phase with manual approval should succeed
  const testPkgDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const cliResult2 = await createArtifactPackage({
    input: sample,
    outDir: testPkgDir2,
    zip: false
  });
  // Clear blocked phases for manual approval test
  const testStatePath2 = path.join(cliResult2.rootDir, 'repo', 'xelera-state.json');
  const testState2 = JSON.parse(fs.readFileSync(testStatePath2, 'utf8'));
  testState2.blockedPhases = [];
  fs.writeFileSync(testStatePath2, JSON.stringify(testState2, null, 2));
  process.argv = ['node', 'xelera-next-phase.ts', `--package=${cliResult2.rootDir}`, '--approve=true', '--handoff=Manual approval test'];
  runNextPhase();
  const manualState = JSON.parse(fs.readFileSync(path.join(cliResult2.rootDir, 'repo', 'xelera-state.json'), 'utf8'));
  assert(manualState.currentPhase === 2, `Expected currentPhase to advance to 2 with manual approval, received ${manualState.currentPhase}`);
  assert(manualState.phaseEvidence['phase-01'].manualApproval === true, 'Expected manualApproval to be recorded');
  assert(manualState.phaseEvidence['phase-01'].approvedToProceed === true, 'Expected approvedToProceed to be true with manual approval');

  // Test: parser reads new headers
  assert(parseExitGateResult('## result: pass') === 'pass', 'Parser should read new result header: pass');
  assert(parseExitGateResult('## result: fail') === 'fail', 'Parser should read new result header: fail');
  assert(parseVerificationRecommendation('## recommendation: proceed') === 'proceed', 'Parser should read new recommendation header: proceed');
  assert(parseVerificationRecommendation('## recommendation: revise') === 'revise', 'Parser should read new recommendation header: revise');

  // Test: parser falls back to legacy lines
  assert(parseExitGateResult('Selected result: pass') === 'pass', 'Parser should fallback to legacy result line');
  assert(parseVerificationRecommendation('Selected recommendation: blocked') === 'blocked', 'Parser should fallback to legacy recommendation line');

  // Test: new header takes priority over legacy
  assert(parseExitGateResult('## result: fail\nSelected result: pass') === 'fail', 'New header should take priority over legacy');
  assert(parseVerificationRecommendation('## recommendation: blocked\nSelected recommendation: proceed') === 'blocked', 'New header should take priority over legacy');

  // Test: parser rejects invalid values
  try {
    parseExitGateResult('## result: maybe');
    assert(false, 'Parser should throw on invalid result');
  } catch (e) {
    assert((e as Error).message.includes('maybe'), 'Error should mention invalid result value');
  }
  try {
    parseVerificationRecommendation('## recommendation: yes');
    assert(false, 'Parser should throw on invalid recommendation');
  } catch (e) {
    assert((e as Error).message.includes('yes'), 'Error should mention invalid recommendation value');
  }

  // Test: evidence parser ignores placeholders and comments
  assert(parseVerificationEvidenceFiles('## evidence files\n- pending\n') .length === 0, 'Evidence parser should ignore pending placeholder');
  assert(
    parseVerificationEvidenceFiles('## evidence files\n- <!-- comment -->\n- pending\n').length === 0,
    'Evidence parser should ignore markdown comments in evidence files'
  );
  assert(
    parseVerificationEvidenceFiles('## evidence files\n- repo/manifest.json\n').includes('repo/manifest.json'),
    'Evidence parser should keep real evidence file paths'
  );

  // Test: validate catches missing evidence file on disk
  const missingEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const cliResultMissing = await createArtifactPackage({ input: sample, outDir: missingEvidencePkg, zip: false });
  const missingReportPath = path.join(cliResultMissing.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let missingReportContent = updateReport(fs.readFileSync(missingReportPath, 'utf8'), 'pass', 'proceed');
  missingReportContent = missingReportContent.replace(
    'phases/phase-01/VERIFICATION_REPORT.md',
    'fake-evidence-file-that-does-not-exist.md'
  );
  fs.writeFileSync(missingReportPath, missingReportContent);

  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    throw new Error(`process.exit:${code}`);
  }) as typeof process.exit;

  try {
    process.argv = ['node', 'xelera-validate.ts', `--package=${cliResultMissing.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should catch missing evidence file');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for missing evidence');
    }

    // Test: validate catches pass+proceed with only pending evidence placeholder
    const noListedEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
    const cliResultNoEvidence = await createArtifactPackage({ input: sample, outDir: noListedEvidencePkg, zip: false });
    const noEvidenceReportPath = path.join(cliResultNoEvidence.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let noEvidenceReport = updateReport(fs.readFileSync(noEvidenceReportPath, 'utf8'), 'pass', 'proceed');
    fs.writeFileSync(noEvidenceReportPath, noEvidenceReport);

    process.argv = ['node', 'xelera-validate.ts', `--package=${cliResultNoEvidence.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject pending-only evidence placeholder');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 when only pending evidence is listed');
    }

    // Test: validate rejects report sections that still contain only comments or placeholders
    const commentOnlyEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
    const cliResultCommentOnly = await createArtifactPackage({ input: sample, outDir: commentOnlyEvidencePkg, zip: false });
    const commentOnlyReportPath = path.join(cliResultCommentOnly.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let commentOnlyReport = updateReport(fs.readFileSync(commentOnlyReportPath, 'utf8'), 'pass', 'proceed');
    commentOnlyReport = replaceEvidenceSection(commentOnlyReport, ['- <!-- reviewed later -->', '- pending']);
    fs.writeFileSync(commentOnlyReportPath, commentOnlyReport);

    process.argv = ['node', 'xelera-validate.ts', `--package=${cliResultCommentOnly.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject comment-only evidence entries');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 when evidence entries are only comments or placeholders');
    }

    // Test: validate rejects scaffold-only evidence files with template content
    const scaffoldOnlyEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
    const cliResultScaffoldOnly = await createArtifactPackage({ input: sample, outDir: scaffoldOnlyEvidencePkg, zip: false });
    const scaffoldOnlyReportPath = path.join(cliResultScaffoldOnly.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let scaffoldOnlyReport = updateReport(fs.readFileSync(scaffoldOnlyReportPath, 'utf8'), 'pass', 'proceed');
    scaffoldOnlyReport = replaceEvidenceSection(scaffoldOnlyReport, [
      '- phases/phase-01/EVIDENCE_CHECKLIST.md',
      '- phases/phase-01/HANDOFF_SUMMARY.md'
    ]);
    fs.writeFileSync(scaffoldOnlyReportPath, scaffoldOnlyReport);

    process.argv = ['node', 'xelera-validate.ts', `--package=${cliResultScaffoldOnly.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject scaffold-only evidence files that still contain template content');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for scaffold-only evidence');
    }

    // Test: validate rejects listed evidence files that contain only comments
    const commentFileEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
    const cliResultCommentFile = await createArtifactPackage({ input: sample, outDir: commentFileEvidencePkg, zip: false });
    const commentFilePath = path.join(cliResultCommentFile.rootDir, 'notes', 'comment-only.md');
    fs.mkdirSync(path.dirname(commentFilePath), { recursive: true });
    fs.writeFileSync(commentFilePath, '<!-- comment only -->\n## Placeholder\n- [ ] not done\n', 'utf8');
    const commentFileReportPath = path.join(cliResultCommentFile.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let commentFileReport = updateReport(fs.readFileSync(commentFileReportPath, 'utf8'), 'pass', 'proceed');
    commentFileReport = replaceEvidenceSection(commentFileReport, ['- notes/comment-only.md']);
    fs.writeFileSync(commentFileReportPath, commentFileReport);

    process.argv = ['node', 'xelera-validate.ts', `--package=${cliResultCommentFile.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject evidence files that contain only comments or template text');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for comment-only evidence files');
    }

    // Test: validate catches malformed state
    const malformedPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
    const cliResultMalformed = await createArtifactPackage({ input: sample, outDir: malformedPkg, zip: false });
    const malformedStatePath = path.join(cliResultMalformed.rootDir, 'repo', 'xelera-state.json');
    const malformedState = JSON.parse(fs.readFileSync(malformedStatePath, 'utf8'));
    malformedState.currentPhase = 999;
    fs.writeFileSync(malformedStatePath, JSON.stringify(malformedState, null, 2));

    process.argv = ['node', 'xelera-validate.ts', `--package=${cliResultMalformed.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should catch malformed state');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for malformed state');
    }
  } finally {
    process.exit = originalExit;
  }

  // Test: next-phase with pass+proceed but only pending evidence should fail
  const noListedEvidenceAdvancePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const cliResultNoListedAdvance = await createArtifactPackage({ input: sample, outDir: noListedEvidenceAdvancePkg, zip: false });
  const noListedAdvanceStatePath = path.join(cliResultNoListedAdvance.rootDir, 'repo', 'xelera-state.json');
  const noListedAdvanceState = JSON.parse(fs.readFileSync(noListedAdvanceStatePath, 'utf8'));
  noListedAdvanceState.blockedPhases = [];
  fs.writeFileSync(noListedAdvanceStatePath, JSON.stringify(noListedAdvanceState, null, 2));
  const noListedAdvanceReportPath = path.join(cliResultNoListedAdvance.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let noListedAdvanceReport = updateReport(fs.readFileSync(noListedAdvanceReportPath, 'utf8'), 'pass', 'proceed');
  fs.writeFileSync(noListedAdvanceReportPath, noListedAdvanceReport);
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${cliResultNoListedAdvance.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance when the report does not list evidence files');
  } catch (e) {
    assert(
      (e as Error).message.includes('does not list any evidence files'),
      `next-phase error should mention missing report evidence files, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase rejects scaffold-only evidence files with template content
  const scaffoldOnlyAdvancePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const cliResultScaffoldOnlyAdvance = await createArtifactPackage({ input: sample, outDir: scaffoldOnlyAdvancePkg, zip: false });
  const scaffoldOnlyAdvanceStatePath = path.join(cliResultScaffoldOnlyAdvance.rootDir, 'repo', 'xelera-state.json');
  const scaffoldOnlyAdvanceState = JSON.parse(fs.readFileSync(scaffoldOnlyAdvanceStatePath, 'utf8'));
  scaffoldOnlyAdvanceState.blockedPhases = [];
  fs.writeFileSync(scaffoldOnlyAdvanceStatePath, JSON.stringify(scaffoldOnlyAdvanceState, null, 2));
  const scaffoldOnlyAdvanceReportPath = path.join(cliResultScaffoldOnlyAdvance.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let scaffoldOnlyAdvanceReport = updateReport(fs.readFileSync(scaffoldOnlyAdvanceReportPath, 'utf8'), 'pass', 'proceed');
  scaffoldOnlyAdvanceReport = replaceEvidenceSection(scaffoldOnlyAdvanceReport, [
    '- phases/phase-01/EVIDENCE_CHECKLIST.md',
    '- phases/phase-01/HANDOFF_SUMMARY.md'
  ]);
  fs.writeFileSync(scaffoldOnlyAdvanceReportPath, scaffoldOnlyAdvanceReport);
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${cliResultScaffoldOnlyAdvance.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
    runNextPhase();
    assert(false, 'next-phase should reject scaffold-only evidence files that still contain template content');
  } catch (e) {
    assert(
      (e as Error).message.includes('EVIDENCE_CHECKLIST.md') || (e as Error).message.includes('HANDOFF_SUMMARY.md'),
      `next-phase should name scaffold evidence files that need more content, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase rejects listed evidence files that contain only comments
  const commentFileAdvancePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const cliResultCommentFileAdvance = await createArtifactPackage({ input: sample, outDir: commentFileAdvancePkg, zip: false });
  const commentFileAdvanceStatePath = path.join(cliResultCommentFileAdvance.rootDir, 'repo', 'xelera-state.json');
  const commentFileAdvanceState = JSON.parse(fs.readFileSync(commentFileAdvanceStatePath, 'utf8'));
  commentFileAdvanceState.blockedPhases = [];
  fs.writeFileSync(commentFileAdvanceStatePath, JSON.stringify(commentFileAdvanceState, null, 2));
  const commentOnlyAdvanceFilePath = path.join(cliResultCommentFileAdvance.rootDir, 'notes', 'comment-only.md');
  fs.mkdirSync(path.dirname(commentOnlyAdvanceFilePath), { recursive: true });
  fs.writeFileSync(commentOnlyAdvanceFilePath, '<!-- comment only -->\n## Placeholder\n- [ ] not done\n', 'utf8');
  const commentFileAdvanceReportPath = path.join(cliResultCommentFileAdvance.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let commentFileAdvanceReport = updateReport(fs.readFileSync(commentFileAdvanceReportPath, 'utf8'), 'pass', 'proceed');
  commentFileAdvanceReport = replaceEvidenceSection(commentFileAdvanceReport, ['- notes/comment-only.md']);
  fs.writeFileSync(commentFileAdvanceReportPath, commentFileAdvanceReport);
  try {
    process.argv = ['node', 'xelera-next-phase.ts', `--package=${cliResultCommentFileAdvance.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
    runNextPhase();
    assert(false, 'next-phase should reject evidence files that contain only comments or template text');
  } catch (e) {
    assert(
      (e as Error).message.includes('notes/comment-only.md'),
      `next-phase should name the bad evidence file, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase accepts pass+proceed when the report lists a real existing evidence file
  const realEvidenceAdvancePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const cliResultRealEvidenceAdvance = await createArtifactPackage({ input: sample, outDir: realEvidenceAdvancePkg, zip: false });
  const realEvidenceStatePath = path.join(cliResultRealEvidenceAdvance.rootDir, 'repo', 'xelera-state.json');
  const realEvidenceState = JSON.parse(fs.readFileSync(realEvidenceStatePath, 'utf8'));
  realEvidenceState.blockedPhases = [];
  fs.writeFileSync(realEvidenceStatePath, JSON.stringify(realEvidenceState, null, 2));
  const realEvidenceReportPath = path.join(cliResultRealEvidenceAdvance.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let realEvidenceReport = updateReport(fs.readFileSync(realEvidenceReportPath, 'utf8'), 'pass', 'proceed');
  realEvidenceReport = realEvidenceReport.replace(/- pending/, '- repo/manifest.json');
  fs.writeFileSync(realEvidenceReportPath, realEvidenceReport);
  process.argv = ['node', 'xelera-next-phase.ts', `--package=${cliResultRealEvidenceAdvance.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
  runNextPhase();
  const realEvidenceAdvancedState = JSON.parse(fs.readFileSync(path.join(cliResultRealEvidenceAdvance.rootDir, 'repo', 'xelera-state.json'), 'utf8'));
  assert(realEvidenceAdvancedState.currentPhase === 2, 'next-phase should accept real listed evidence files that exist on disk');

  function captureStatusOutput(packagePath: string) {
    process.argv = ['node', 'xelera-status.ts', `--package=${packagePath}`];
    const logs: string[] = [];
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    runStatus();
    console.log = originalLog;
    return logs.join('\n');
  }

  function runValidateWithoutFailure(packagePath: string) {
    process.argv = ['node', 'xelera-validate.ts', `--package=${packagePath}`];
    runValidate();
  }

  // Test: fresh package shows scaffold evidence separately from report-listed evidence
  const freshStatusPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const freshStatusResult = await createArtifactPackage({ input: sample, outDir: freshStatusPkg, zip: false });
  const originalLog = console.log;
  const freshStatusOutput = captureStatusOutput(freshStatusResult.rootDir);
  assert(/Evidence scaffold files on disk:/i.test(freshStatusOutput), 'Fresh status should show scaffold evidence separately.');
  assert(/Evidence listed in verification report:/i.test(freshStatusOutput), 'Fresh status should show report-listed evidence separately.');
  assert(/Evidence listed in verification report:\s+none yet/i.test(freshStatusOutput), 'Fresh status should show that no real evidence has been listed yet.');
  assert(
    /Evidence readiness:\s+Not ready: scaffold files exist, but the verification report does not list any evidence files yet\./i.test(
      freshStatusOutput
    ),
    'Fresh status should clearly show that no real evidence has been listed yet.'
  );

  // Test: status explains that verification can pass while lifecycle blockers still stop advancement
  const blockedVerifiedPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const blockedVerifiedResult = await createArtifactPackage({ input: sample, outDir: blockedVerifiedPkg, zip: false });
  const blockedVerifiedReportPath = path.join(blockedVerifiedResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let blockedVerifiedReport = updateReport(fs.readFileSync(blockedVerifiedReportPath, 'utf8'), 'pass', 'proceed');
  blockedVerifiedReport = blockedVerifiedReport.replace(/- pending/, '- repo/manifest.json');
  fs.writeFileSync(blockedVerifiedReportPath, blockedVerifiedReport);
  const blockedVerifiedStatusOutput = captureStatusOutput(blockedVerifiedResult.rootDir);
  assert(
    /Verification is complete, but the package is still blocked\./i.test(blockedVerifiedStatusOutput),
    'Status should explain that pass + proceed evidence is not enough while blockers remain.'
  );

  // Test: status clearly reports when no evidence files are listed in the verification report
  const noEvidenceStatusPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const noEvidenceStatusResult = await createArtifactPackage({ input: sample, outDir: noEvidenceStatusPkg, zip: false });
  const noEvidenceStatusReportPath = path.join(noEvidenceStatusResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let noEvidenceStatusReport = fs.readFileSync(noEvidenceStatusReportPath, 'utf8');
  noEvidenceStatusReport = noEvidenceStatusReport.replace(
    /## evidence files[\s\S]*?## warnings/i,
    '## evidence files\nList the evidence files you actually reviewed before selecting `pass + proceed`.\n\n- pending\n\nRules:\n- Replace `pending` with real evidence file paths.\n- Do not select `pass + proceed` until the listed files exist and support the decision.\n\n## warnings'
  );
  fs.writeFileSync(noEvidenceStatusReportPath, noEvidenceStatusReport);
  const noEvidenceStatusOutput = captureStatusOutput(noEvidenceStatusResult.rootDir);
  assert(/Evidence listed in verification report:\s+none yet/i.test(noEvidenceStatusOutput), 'Status should say when no evidence files are listed in the report.');
  assert(
    /Evidence readiness:\s+Not ready: scaffold files exist, but the verification report does not list any evidence files yet\./i.test(
      noEvidenceStatusOutput
    ),
    'Status should explain when scaffold files exist but the report does not list evidence.'
  );

  // Test: status clearly reports when listed evidence files exist
  const citedEvidenceStatusPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const citedEvidenceStatusResult = await createArtifactPackage({ input: sample, outDir: citedEvidenceStatusPkg, zip: false });
  const citedEvidenceReportPath = path.join(citedEvidenceStatusResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let citedEvidenceReport = fs.readFileSync(citedEvidenceReportPath, 'utf8');
  citedEvidenceReport = citedEvidenceReport.replace(/- pending/, '- repo/manifest.json');
  fs.writeFileSync(citedEvidenceReportPath, citedEvidenceReport);
  const citedEvidenceStatusOutput = captureStatusOutput(citedEvidenceStatusResult.rootDir);
  assert(
    /Evidence listed in verification report:\s+1 of 1 listed file\(s\) present/i.test(citedEvidenceStatusOutput),
    'Status should clearly report when listed evidence files exist on disk.'
  );

  // Test: status clearly reports when a listed evidence file is missing
  const missingEvidenceStatusPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-'));
  const missingEvidenceStatusResult = await createArtifactPackage({ input: sample, outDir: missingEvidenceStatusPkg, zip: false });
  const missingEvidenceStatusReportPath = path.join(missingEvidenceStatusResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let missingEvidenceStatusReport = fs.readFileSync(missingEvidenceStatusReportPath, 'utf8');
  missingEvidenceStatusReport = missingEvidenceStatusReport.replace(/- pending/, '- fake-evidence-file-that-does-not-exist.md');
  fs.writeFileSync(missingEvidenceStatusReportPath, missingEvidenceStatusReport);
  const missingEvidenceStatusOutput = captureStatusOutput(missingEvidenceStatusResult.rootDir);
  assert(
    /Evidence listed in verification report:\s+0 of 1 listed file\(s\) present/i.test(missingEvidenceStatusOutput),
    'Status should show how many listed evidence files still exist.'
  );
  assert(
    /Missing listed evidence files:\s+fake-evidence-file-that-does-not-exist\.md/i.test(missingEvidenceStatusOutput),
    'Status should name listed evidence files that are missing on disk.'
  );

  // Test: status displays next action guidance
  const statusOutput = captureStatusOutput(testPkgDir);
  assert(/Next Recommended Action/.test(statusOutput), 'Status should show Next Recommended Action section');
  assert(
    /Complete the verification/.test(statusOutput) ||
    /Advance to the next phase/.test(statusOutput) ||
    /next-phase/.test(statusOutput) ||
    /resolve/.test(statusOutput),
    'Status should suggest a concrete next action'
  );

  // Test: manual approval is visible in status
  // Rewind current phase to 1 so status shows the manually approved phase
  const manualStatusStatePath = path.join(cliResult2.rootDir, 'repo', 'xelera-state.json');
  const manualStatusState = JSON.parse(fs.readFileSync(manualStatusStatePath, 'utf8'));
  const savedCurrentPhase = manualStatusState.currentPhase;
  manualStatusState.currentPhase = 1;
  fs.writeFileSync(manualStatusStatePath, JSON.stringify(manualStatusState, null, 2));

  const manualStatusOutput = captureStatusOutput(cliResult2.rootDir);
  assert(/Manual approval:\s*Yes/.test(manualStatusOutput), 'Status should show manual approval as Yes');
  assert(/manually approved/.test(manualStatusOutput), 'Status should mention manual approval in next action');

  // Restore phase
  manualStatusState.currentPhase = savedCurrentPhase;
  fs.writeFileSync(manualStatusStatePath, JSON.stringify(manualStatusState, null, 2));

  // Test: family example can be generated, validated, and inspected with status immediately after creation
  const familyPkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xelera-smoke-family-'));
  const familyCliResult = await createArtifactPackage({ input: familySample, outDir: familyPkgDir, zip: false });
  runValidateWithoutFailure(familyCliResult.rootDir);
  const familyStatusOutput = captureStatusOutput(familyCliResult.rootDir);
  assert(/Xelera Method Package Status/.test(familyStatusOutput), 'Family sample status should render successfully.');
  assert(/Family Task Board/i.test(familyStatusOutput), 'Family sample status should reference Family Task Board.');
  assert(/Current phase:/i.test(familyStatusOutput), 'Family sample status should show the current phase.');

  console.log(
    `Smoke test passed with ${bundle.files.length} files in ${bundle.phases.length} phases and verified Codex, Claude Code, and OpenCode packets, verification files, state files, lifecycle, warnings, next-phase behavior, parser consistency, validate, status, and CLI parity.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
