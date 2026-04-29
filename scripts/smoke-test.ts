import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateProjectBundle } from '../lib/generator';
import { baseProjectInput } from '../lib/templates';
import { buildWorkflowSteps, canApproveForBuild, canExportBuildReady, mapWarningToStep } from '../lib/workflow';
import { createArtifactPackage, loadInput } from './manoa-create-project';
import { runNextPhase } from './manoa-next-phase';
import { runValidate } from './manoa-validate';
import { runStatus } from './manoa-status';
import { parseExitGateResult, parseVerificationEvidenceFiles, parseVerificationRecommendation } from './manoa-package-utils';
import { runOrchestratorRegressionChecks } from './orchestrator-test-utils';
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
  const scorecard = getFile(bundle, 'SCORECARD.md');
  const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
  const manifest = JSON.parse(getFile(bundle, 'repo/manifest.json'));
  const state = JSON.parse(getFile(bundle, 'repo/manoa-state.json'));
  const workflowSteps = buildWorkflowSteps(sample, bundle);

  assert(bundle.phases.length >= 10, `Expected at least 10 phases, received ${bundle.phases.length}`);
  assert(bundle.files.some((file) => file.path === 'README.md'), 'Missing package README.md');
  assert(bundle.files.some((file) => file.path === 'BUSINESS_USER_START_HERE.md'), 'Missing BUSINESS_USER_START_HERE.md');
  assert(bundle.files.some((file) => file.path === 'CURRENT_STATUS.md'), 'Missing CURRENT_STATUS.md');
  assert(bundle.files.some((file) => file.path === 'COPY_PASTE_PROMPTS.md'), 'Missing COPY_PASTE_PROMPTS.md');
  assert(bundle.files.some((file) => file.path === 'MODULE_MAP.md'), 'Missing MODULE_MAP.md');
  assert(bundle.files.some((file) => file.path === 'WHAT_TO_IGNORE_FOR_NOW.md'), 'Missing WHAT_TO_IGNORE_FOR_NOW.md');
  assert(bundle.files.some((file) => file.path === 'FINAL_CHECKLIST.md'), 'Missing FINAL_CHECKLIST.md');
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
  assert(bundle.files.some((file) => file.path === 'TESTING_STRATEGY.md'), 'Missing TESTING_STRATEGY.md');
  assert(bundle.files.some((file) => file.path === 'REGRESSION_TEST_PLAN.md'), 'Missing REGRESSION_TEST_PLAN.md');
  assert(bundle.files.some((file) => file.path === 'TEST_SCRIPT_INDEX.md'), 'Missing TEST_SCRIPT_INDEX.md');
  assert(bundle.files.some((file) => file.path === 'auto-improve/PROGRAM.md'), 'Missing auto-improve/PROGRAM.md');
  assert(bundle.files.some((file) => file.path === 'auto-improve/QUALITY_RUBRIC.md'), 'Missing auto-improve/QUALITY_RUBRIC.md');
  assert(bundle.files.some((file) => file.path === 'auto-improve/SCORECARD.md'), 'Missing auto-improve/SCORECARD.md');
  assert(bundle.files.some((file) => file.path === 'auto-improve/RUN_LOOP.md'), 'Missing auto-improve/RUN_LOOP.md');
  assert(bundle.files.some((file) => file.path === 'auto-improve/results.tsv'), 'Missing auto-improve/results.tsv');
  assert(bundle.files.some((file) => file.path === 'ui-ux/UI_UX_START_HERE.md'), 'Missing ui-ux/UI_UX_START_HERE.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/USER_WORKFLOWS.md'), 'Missing ui-ux/USER_WORKFLOWS.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/SCREEN_INVENTORY.md'), 'Missing ui-ux/SCREEN_INVENTORY.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/UX_REVIEW_CHECKLIST.md'), 'Missing ui-ux/UX_REVIEW_CHECKLIST.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/UI_IMPLEMENTATION_GUIDE.md'), 'Missing ui-ux/UI_IMPLEMENTATION_GUIDE.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/ACCESSIBILITY_CHECKLIST.md'), 'Missing ui-ux/ACCESSIBILITY_CHECKLIST.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/RESPONSIVE_DESIGN_CHECKLIST.md'), 'Missing ui-ux/RESPONSIVE_DESIGN_CHECKLIST.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/SCREENSHOT_REVIEW_PROMPT.md'), 'Missing ui-ux/SCREENSHOT_REVIEW_PROMPT.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/UI_UX_GATE.md'), 'Missing ui-ux/UI_UX_GATE.md');
  assert(bundle.files.some((file) => file.path === 'ui-ux/UI_UX_HANDOFF.md'), 'Missing ui-ux/UI_UX_HANDOFF.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/RECURSIVE_TEST_START_HERE.md'), 'Missing recursive-test/RECURSIVE_TEST_START_HERE.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/RECURSIVE_TEST_PROMPT.md'), 'Missing recursive-test/RECURSIVE_TEST_PROMPT.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/SCORING_RUBRIC.md'), 'Missing recursive-test/SCORING_RUBRIC.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/TEST_CASE_SELECTION_GUIDE.md'), 'Missing recursive-test/TEST_CASE_SELECTION_GUIDE.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/ITERATION_LOG.md'), 'Missing recursive-test/ITERATION_LOG.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/FAILURE_TAXONOMY.md'), 'Missing recursive-test/FAILURE_TAXONOMY.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/RECURSIVE_TEST_REPORT.md'), 'Missing recursive-test/RECURSIVE_TEST_REPORT.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/RECURSIVE_FIX_GUIDE.md'), 'Missing recursive-test/RECURSIVE_FIX_GUIDE.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/REGRESSION_RECHECK_GUIDE.md'), 'Missing recursive-test/REGRESSION_RECHECK_GUIDE.md');
  assert(bundle.files.some((file) => file.path === 'recursive-test/FINAL_QUALITY_GATE.md'), 'Missing recursive-test/FINAL_QUALITY_GATE.md');
  assert(bundle.files.some((file) => file.path === 'ORCHESTRATOR_GUIDE.md'), 'Missing ORCHESTRATOR_GUIDE.md');
  const requiredHighPriorityModuleFiles = [
    'product-strategy/PRODUCT_STRATEGY_START_HERE.md',
    'product-strategy/PRODUCT_NORTH_STAR.md',
    'product-strategy/TARGET_USERS.md',
    'product-strategy/MVP_SCOPE.md',
    'product-strategy/OUT_OF_SCOPE.md',
    'product-strategy/SUCCESS_METRICS.md',
    'product-strategy/TRADEOFF_LOG.md',
    'product-strategy/PRODUCT_STRATEGY_GATE.md',
    'requirements/REQUIREMENTS_START_HERE.md',
    'requirements/FUNCTIONAL_REQUIREMENTS.md',
    'requirements/NON_FUNCTIONAL_REQUIREMENTS.md',
    'requirements/ACCEPTANCE_CRITERIA.md',
    'requirements/OPEN_QUESTIONS.md',
    'requirements/REQUIREMENTS_RISK_REVIEW.md',
    'requirements/REQUIREMENTS_GATE.md',
    'security-risk/SECURITY_START_HERE.md',
    'security-risk/DATA_CLASSIFICATION.md',
    'security-risk/SECRET_MANAGEMENT.md',
    'security-risk/PRIVACY_RISK_REVIEW.md',
    'security-risk/AUTHORIZATION_REVIEW.md',
    'security-risk/DEPENDENCY_RISK_CHECKLIST.md',
    'security-risk/SECURITY_GATE.md',
    'integrations/INTEGRATION_START_HERE.md',
    'integrations/EXTERNAL_SERVICES.md',
    'integrations/API_KEYS_AND_SECRETS.md',
    'integrations/ENVIRONMENT_VARIABLES.md',
    'integrations/WEBHOOKS.md',
    'integrations/FAILURE_MODES.md',
    'integrations/MOCKING_STRATEGY.md',
    'integrations/INTEGRATION_TEST_PLAN.md',
    'integrations/INTEGRATION_GATE.md',
    'architecture/ARCHITECTURE_START_HERE.md',
    'architecture/SYSTEM_OVERVIEW.md',
    'architecture/DATA_MODEL.md',
    'architecture/API_CONTRACTS.md',
    'architecture/STATE_MANAGEMENT.md',
    'architecture/ARCHITECTURE_DECISIONS.md',
    'architecture/ARCHITECTURE_GATE.md'
  ];
  for (const filePath of requiredHighPriorityModuleFiles) {
    assert(bundle.files.some((file) => file.path === filePath), `Missing required high-priority module file ${filePath}`);
  }
  assert(bundle.files.some((file) => file.path === 'regression-suite/README.md'), 'Missing regression-suite/README.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/RUN_REGRESSION.md'), 'Missing regression-suite/RUN_REGRESSION.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/REGRESSION_CHECKLIST.md'), 'Missing regression-suite/REGRESSION_CHECKLIST.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/REGRESSION_RESULTS_TEMPLATE.md'), 'Missing regression-suite/REGRESSION_RESULTS_TEMPLATE.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/README.md'), 'Missing regression-suite/scripts/README.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/run-all.md'), 'Missing regression-suite/scripts/run-all.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/run-regression.ts'), 'Missing regression-suite/scripts/run-regression.ts');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/artifact-integrity.md'), 'Missing regression-suite/scripts/artifact-integrity.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/gate-consistency.md'), 'Missing regression-suite/scripts/gate-consistency.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/evidence-quality.md'), 'Missing regression-suite/scripts/evidence-quality.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/handoff-continuity.md'), 'Missing regression-suite/scripts/handoff-continuity.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/agent-rules.md'), 'Missing regression-suite/scripts/agent-rules.md');
  assert(bundle.files.some((file) => file.path === 'regression-suite/scripts/local-first.md'), 'Missing regression-suite/scripts/local-first.md');
  assert(bundle.files.some((file) => file.path === 'repo/manoa-state.json'), 'Missing repo/manoa-state.json');
  assert(fs.existsSync(familySamplePath), 'Missing examples/family-task-app.json');
  assert(fs.existsSync(path.resolve('docs/NOVICE_GUIDE.md')), 'Missing docs/NOVICE_GUIDE.md');
  assert(fs.existsSync(path.resolve('docs/QUICKSTART.md')), 'Missing docs/QUICKSTART.md');
  assert(fs.existsSync(path.resolve('docs/GLOSSARY.md')), 'Missing docs/GLOSSARY.md');
  assert(fs.existsSync(path.resolve('docs/TROUBLESHOOTING.md')), 'Missing docs/TROUBLESHOOTING.md');
  assert(fs.existsSync(path.resolve('docs/EXAMPLE_FAMILY_TASK_APP.md')), 'Missing docs/EXAMPLE_FAMILY_TASK_APP.md');
  assert(fs.existsSync(path.resolve('docs/ORCHESTRATOR.md')), 'Missing docs/ORCHESTRATOR.md');
  assert(fs.existsSync(path.resolve('autoresearch/MANOA_AUTORESEARCH_PROGRAM.md')), 'Missing autoresearch/MANOA_AUTORESEARCH_PROGRAM.md');
  assert(fs.existsSync(path.resolve('autoresearch/README.md')), 'Missing autoresearch/README.md');
  assert(fs.existsSync(path.resolve('autoresearch/results.tsv')), 'Missing autoresearch/results.tsv');
  assert(fs.existsSync(path.resolve('autoresearch/benchmarks/10-use-case-benchmark.md')), 'Missing autoresearch benchmark file');
  assert(fs.existsSync(path.resolve('autoresearch/rubrics/quality-score-rubric.md')), 'Missing autoresearch quality rubric');
  assert(fs.existsSync(path.resolve('autoresearch/rubrics/hard-caps.md')), 'Missing autoresearch hard caps');
  assert(fs.existsSync(path.resolve('autoresearch/rubrics/simplicity-criteria.md')), 'Missing autoresearch simplicity criteria');
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
  const businessStart = getFile(bundle, 'BUSINESS_USER_START_HERE.md');
  const currentStatus = getFile(bundle, 'CURRENT_STATUS.md');
  const promptGuide = getFile(bundle, 'COPY_PASTE_PROMPTS.md');
  const moduleMap = getFile(bundle, 'MODULE_MAP.md');
  const ignoreGuide = getFile(bundle, 'WHAT_TO_IGNORE_FOR_NOW.md');
  const finalChecklist = getFile(bundle, 'FINAL_CHECKLIST.md');
  const uiStart = getFile(bundle, 'ui-ux/UI_UX_START_HERE.md');
  const uiScreenshotPrompt = getFile(bundle, 'ui-ux/SCREENSHOT_REVIEW_PROMPT.md');
  const uiGate = getFile(bundle, 'ui-ux/UI_UX_GATE.md');
  const recursiveStart = getFile(bundle, 'recursive-test/RECURSIVE_TEST_START_HERE.md');
  const recursivePrompt = getFile(bundle, 'recursive-test/RECURSIVE_TEST_PROMPT.md');
  const recursiveRubric = getFile(bundle, 'recursive-test/SCORING_RUBRIC.md');
  const recursiveReport = getFile(bundle, 'recursive-test/RECURSIVE_TEST_REPORT.md');
  const autoImproveProgram = getFile(bundle, 'auto-improve/PROGRAM.md');
  const autoImproveResults = getFile(bundle, 'auto-improve/results.tsv');
  const phaseBrief = getFile(bundle, 'phases/phase-01/PHASE_BRIEF.md');
  const verifyPrompt = getFile(bundle, 'phases/phase-01/VERIFY_PROMPT.md');
  const generatedReadme = getFile(bundle, 'README.md');
  const productNorthStar = getFile(bundle, 'product-strategy/PRODUCT_NORTH_STAR.md');
  const mvpScope = getFile(bundle, 'product-strategy/MVP_SCOPE.md');
  const acceptanceCriteria = getFile(bundle, 'requirements/ACCEPTANCE_CRITERIA.md');
  const openQuestions = getFile(bundle, 'requirements/OPEN_QUESTIONS.md');
  const dataClassification = getFile(bundle, 'security-risk/DATA_CLASSIFICATION.md');
  const secretManagement = getFile(bundle, 'security-risk/SECRET_MANAGEMENT.md');
  const environmentVariables = getFile(bundle, 'integrations/ENVIRONMENT_VARIABLES.md');
  const mockingStrategy = getFile(bundle, 'integrations/MOCKING_STRATEGY.md');
  const systemOverview = getFile(bundle, 'architecture/SYSTEM_OVERVIEW.md');
  const dataModel = getFile(bundle, 'architecture/DATA_MODEL.md');
  assert(
    /technical product owners/i.test(phasePlan) || /AI-assisted builders/i.test(phasePlan),
    'Generated phases did not include project-specific audience terms.'
  );
  assert(
    /Primary audience: Technical product owners/i.test(handoff),
    'Handoff output did not reflect the sample project language.'
  );
  assert(/## What this package is/.test(startHere), 'START_HERE.md missing package explanation.');
  assert(/do not need to open every folder/i.test(startHere), 'START_HERE.md should tell the user not to open every folder.');
  assert(/## Commands to know/.test(startHere), 'START_HERE.md missing command guidance.');
  assert(/Entry gate:/.test(startHere) && /Exit gate:/.test(startHere), 'START_HERE.md missing gate definitions.');
  assert(/## Package status/.test(guide), 'Final guide did not include package status.');
  assert(/## Assumptions and open questions/.test(guide), 'Final guide did not include assumptions and open questions.');
  assert(/## 1\. Decide/.test(guide) && /## 2\. Plan/.test(guide) && /## 3\. Design/.test(guide) && /## 4\. Build/.test(guide) && /## 5\. Test/.test(guide) && /## 6\. Handoff/.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should use Decide / Plan / Design / Build / Test / Handoff.');
  assert(/Product Goal and Scope/i.test(guide) && /What the App Must Do/i.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should fold the new Decide support modules into Decide.');
  assert(/Private Data and Safety Check/i.test(guide) && /External Services and Setup/i.test(guide) && /Technical Plan/i.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should fold the new Plan support modules into Plan.');
  assert(/Screen and Workflow Review/i.test(businessStart), 'Beginner-facing docs should describe UI/UX as Screen and Workflow Review.');
  assert(/Improve Until Good Enough Loop/i.test(businessStart), 'Beginner-facing docs should describe recursive testing as Improve Until Good Enough Loop.');
  assert(/For you:/i.test(businessStart) && /Mostly for the AI agent:/i.test(businessStart), 'BUSINESS_USER_START_HERE.md should distinguish user files from AI-agent files.');
  assert(/Product Goal and Scope/i.test(businessStart) && /What the App Must Do/i.test(businessStart) && /Private Data and Safety Check/i.test(businessStart) && /External Services and Setup/i.test(businessStart) && /Technical Plan/i.test(businessStart), 'BUSINESS_USER_START_HERE.md should use the beginner-friendly names for the new modules.');
  assert(/## Required/.test(moduleMap) && /## Recommended/.test(moduleMap) && /## Optional/.test(moduleMap) && /## Not needed now/.test(moduleMap), 'MODULE_MAP.md should include Required / Recommended / Optional / Not needed now.');
  assert(/Product Goal and Scope/i.test(moduleMap) && /What the App Must Do/i.test(moduleMap) && /Private Data and Safety Check/i.test(moduleMap) && /External Services and Setup/i.test(moduleMap) && /Technical Plan/i.test(moduleMap), 'MODULE_MAP.md should include the new user-facing module names.');
  assert(/## 1\. Decide/.test(promptGuide) && /## 2\. Plan/.test(promptGuide) && /## 3\. Design/.test(promptGuide) && /## 4\. Build/.test(promptGuide) && /## 5\. Test/.test(promptGuide) && /## 6\. Handoff/.test(promptGuide), 'COPY_PASTE_PROMPTS.md should include prompts in order.');
  assert(/Confirm Product Goal and Scope/i.test(promptGuide) && /Confirm What the App Must Do/i.test(promptGuide) && /Review Private Data and Safety/i.test(promptGuide) && /Review External Services and Setup/i.test(promptGuide) && /Review Technical Plan/i.test(promptGuide), 'COPY_PASTE_PROMPTS.md should include the new module prompts.');
  assert(/Safe to ignore right now/i.test(ignoreGuide), 'WHAT_TO_IGNORE_FOR_NOW.md should tell users what they can ignore for now.');
  assert(/## Current stage/.test(currentStatus) && /## Current gate/.test(currentStatus) && /## Next action/.test(currentStatus), 'CURRENT_STATUS.md should show the current stage, gate, and next action.');
  assert(/Before you call this project done/i.test(finalChecklist), 'FINAL_CHECKLIST.md should be plain-English and business-user friendly.');
  assert(/ui-ux\/UI_UX_START_HERE\.md/i.test(startHere), 'START_HERE.md should reference the UI/UX module.');
  assert(/recursive-test\/RECURSIVE_TEST_START_HERE\.md/i.test(startHere), 'START_HERE.md should reference the recursive test module.');
  assert(/UI\/UX review timing/i.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should explain UI/UX timing.');
  assert(/Recursive testing timing/i.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should explain recursive testing timing.');
  assert(/do not need to open every folder/i.test(generatedReadme), 'Generated README.md should still tell business users they do not need to open every folder.');
  assert(/detailed support folders as guardrails/i.test(generatedReadme), 'Generated README.md should explain the role of the detailed support folders.');
  assert(/ui-ux\/UI_UX_START_HERE\.md/i.test(generatedReadme), 'Generated README.md should reference the UI/UX module.');
  assert(/recursive-test\/RECURSIVE_TEST_START_HERE\.md/i.test(generatedReadme), 'Generated README.md should reference the recursive test module.');
  assert(/Plain-English product goal/i.test(productNorthStar) && /What success looks like/i.test(productNorthStar) && /What failure looks like/i.test(productNorthStar), 'Product strategy must include the required north-star sections.');
  assert(/Must-have features/i.test(mvpScope) && /Should-have features/i.test(mvpScope) && /Later features/i.test(mvpScope) && /Explicit non-goals/i.test(mvpScope), 'Product strategy must include MVP scope sections.');
  assert(/Clear pass\/fail check/i.test(acceptanceCriteria) && /Evidence required/i.test(acceptanceCriteria), 'Requirements must include acceptance criteria evidence.');
  assert(/Unresolved assumption/i.test(openQuestions) && /Priority/i.test(openQuestions), 'Requirements must include open questions with priority.');
  assert(/Data types handled/i.test(dataClassification) && /Sensitivity level/i.test(dataClassification), 'Security module must include data classification.');
  assert(/Expected secrets/i.test(secretManagement) && /What must never be committed/i.test(secretManagement), 'Security module must include secret management.');
  assert(/Variable name/i.test(environmentVariables) && /Local setup notes/i.test(environmentVariables), 'Integrations module must include environment variables.');
  assert(/What to mock before real credentials exist/i.test(mockingStrategy) && /When to replace mocks with real services/i.test(mockingStrategy), 'Integrations module must include mocking strategy.');
  assert(/Simple architecture summary/i.test(systemOverview) && /What is intentionally not included/i.test(systemOverview), 'Architecture module must include system overview.');
  assert(/Entities/i.test(dataModel) && /Sample records/i.test(dataModel), 'Architecture module must include a data model.');
  assert(/\/product-strategy\//i.test(phaseBrief) && /\/requirements\//i.test(phaseBrief), 'Relevant phase briefs should reference product strategy and requirements support folders.');
  assert(/\/product-strategy\//i.test(verifyPrompt) || /\/requirements\//i.test(verifyPrompt), 'Relevant verify prompts should reference supporting modules when the phase changes scope or requirements.');
  assert(/screenshot/i.test(uiStart) && /Codex, Claude Code, Kimi, or GLM/i.test(uiStart), 'UI_UX_START_HERE.md should include screenshot and multi-agent guidance.');
  assert(/compare each screenshot/i.test(uiScreenshotPrompt) && /score each screen from 0 to 100/i.test(uiScreenshotPrompt), 'SCREENSHOT_REVIEW_PROMPT.md should require evidence-backed screenshot scoring.');
  assert(/## Auto-fail conditions/i.test(uiGate) && /no screenshots provided for a ui project/i.test(uiGate), 'UI_UX_GATE.md should include required auto-fail conditions.');
  assert(/Default target score/i.test(recursiveStart) && /90\/100/i.test(recursiveStart), 'RECURSIVE_TEST_START_HERE.md should include the default 90/100 target.');
  assert(/Improve Until Good Enough Loop/i.test(recursiveStart), 'RECURSIVE_TEST_START_HERE.md should include the beginner-friendly recursive testing name.');
  assert(/score each use case from 0 to 100/i.test(recursivePrompt), 'RECURSIVE_TEST_PROMPT.md should include 0-100 per-use-case scoring.');
  assert(/overall score >= 90/i.test(recursivePrompt), 'RECURSIVE_TEST_PROMPT.md should include loop-until-target behavior.');
  assert(/5 iterations/i.test(recursiveStart) || /max iterations/i.test(recursivePrompt), 'Recursive testing module should include max iteration guidance.');
  assert(/## Score cap rules/i.test(recursiveRubric) && /max score 69/i.test(recursiveRubric), 'SCORING_RUBRIC.md should include score caps.');
  assert(/## Per-use-case scores/i.test(recursiveReport), 'RECURSIVE_TEST_REPORT.md should include per-use-case scores.');
  assert(/## Editable files/i.test(autoImproveProgram) && /## Fixed files/i.test(autoImproveProgram), 'auto-improve/PROGRAM.md must define editable and fixed file boundaries.');
  assert(/keep the changes and commit them/i.test(autoImproveProgram) && /discard your own edits/i.test(autoImproveProgram), 'auto-improve/PROGRAM.md must include keep and discard rules.');
  assert(/## Simplicity criterion/i.test(autoImproveProgram), 'auto-improve/PROGRAM.md must include the simplicity criterion.');
  assert(/Never weaken the rubric/i.test(autoImproveProgram), 'auto-improve/PROGRAM.md must forbid weakening the rubric or evaluator.');
  assert(/^timestamp\titeration\toverall_score\thard_cap\tdecision\tcommands_run\tchanged_files\tnotes/i.test(autoImproveResults), 'auto-improve/results.tsv must include the required header.');
  assert(/What prompt to paste/i.test(guide) && /What file gets updated/i.test(guide) && /What evidence is required/i.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should include the required beginner stage details.');
  assert(bundle.lifecycleStatus === 'Blocked', `Expected sample bundle lifecycle status to be Blocked, received ${bundle.lifecycleStatus}`);
  assert(bundle.score.total < 72, `Blocked package score should stay below build-ready threshold, received ${bundle.score.total}.`);
  assert(bundle.score.rating !== 'Build ready' && bundle.score.rating !== 'Strong handoff', 'Blocked package should not claim build readiness.');
  assert(!/## Rating\s+Build ready/i.test(scorecard), 'Blocked package SCORECARD should not say Build ready.');
  assert(/blocked until/i.test(scorecard), 'Blocked package SCORECARD should explain that blockers cap readiness.');
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
  assert(manifest.rating === bundle.score.rating, 'Manifest rating should match the bundle score rating.');
  assert(manifest.approvalRequired === true, 'Manifest approvalRequired should be true.');
  assert(manifest.approvedForBuild === false, 'Sample package should not be approved for build.');
  assert(state.currentPhase === 1, `Expected manoa-state currentPhase to be 1, received ${state.currentPhase}`);
  assert(Array.isArray(state.unresolvedBlockers), 'manoa-state unresolvedBlockers list is missing.');
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
  const familyUiStart = getFile(familyBundle, 'ui-ux/UI_UX_START_HERE.md');
  const familyWorkflows = getFile(familyBundle, 'ui-ux/USER_WORKFLOWS.md');
  assert(/Family Task Board/i.test(familyProjectBrief), 'Family sample brief should reference Family Task Board.');
  assert(/\[START_HERE\.md\]\(START_HERE\.md\)/.test(familyRootReadme), 'Family sample README should link to START_HERE.md.');
  assert(/\[QUICKSTART\.md\]\(QUICKSTART\.md\)/.test(familyRootReadme), 'Family sample README should link to QUICKSTART.md.');
  assert(/\[TROUBLESHOOTING\.md\]\(TROUBLESHOOTING\.md\)/.test(familyRootReadme), 'Family sample README should link to TROUBLESHOOTING.md.');
  assert(/manoa-method-workspace/.test(familyQuickstart), 'Family sample QUICKSTART should use the actual export root folder name.');
  assert(!/PATH_TO_THIS_PACKAGE/.test(familyQuickstart), 'Family sample QUICKSTART should not use PATH_TO_THIS_PACKAGE.');
  assert(/blocked/i.test(familyTroubleshooting) && /validate/i.test(familyTroubleshooting), 'Family sample TROUBLESHOOTING should explain blocked and validate failures.');
  assert(/kid|child|parent/i.test(familyProjectBrief), 'Family sample brief should reference the family roles.');
  assert(/Open these files first/i.test(familyStartHere), 'Family sample START_HERE should tell beginners what to open first.');
  assert(/QUICKSTART\.md/.test(familyStartHere), 'Family sample START_HERE should point beginners to QUICKSTART.md.');
  assert(!/PATH_TO_THIS_PACKAGE/.test(familyStartHere), 'Family sample START_HERE should not use PATH_TO_THIS_PACKAGE.');
  assert(/What to paste into Codex/i.test(familyCodexStart), 'Family sample CODEX_START_HERE should clearly say what to paste into Codex.');
  assert(/part of the core package/i.test(familyUiStart), 'UI projects should receive full UI/UX guidance.');
  assert(/Parent creates and assigns a task/i.test(familyWorkflows), 'UI workflow generation should be project-specific for UI projects.');
  assert(/## What you should do now/i.test(familyPhaseBrief), 'Family sample PHASE_BRIEF should include a clear next action.');
  assert(/## Out of scope for this phase/i.test(familyPhaseBrief), 'Family sample PHASE_BRIEF should include an out-of-scope section.');
  assert(/## What evidence means/i.test(familyVerifyPrompt), 'Family sample VERIFY_PROMPT should explain what evidence means.');
  assert(/## result: pending/.test(familyVerificationReport) && /## recommendation: pending/.test(familyVerificationReport), 'Family sample VERIFICATION_REPORT should keep required parser headers.');
  const familyGeneratedText = familyBundle.files.map((file) => file.content).join('\n');
  assert(!/Generated from current input/i.test(familyGeneratedText), 'Family sample package should not use "Generated from current input".');
  assert(!/Needs user confirmation/i.test(familyGeneratedText), 'Family sample package should not use "Needs user confirmation".');

  const nonUiBundle = generateProjectBundle(
    buildAnsweredInput({
      productName: 'Operations Audit Playbook',
      level: 'intermediate',
      track: 'business',
      productIdea: 'A markdown-first internal audit playbook that helps an operations team review process gaps and hand off remediation work without building a user-facing application.',
      targetAudience: 'Operations managers, internal reviewers, and team leads.',
      problemStatement: 'Audit notes are scattered and teams lose the remediation trail between review cycles.',
      constraints: 'Keep everything local-first, markdown-first, and documentation-driven. No web app, dashboard, or portal in v1.',
      desiredOutput: 'A structured audit playbook package with gates, handoffs, evidence checklists, and recursive quality review instructions.',
      mustHaveFeatures: 'Audit checklist, remediation workflow, evidence capture, handoff notes, regression checks, recursive quality loop.',
      dataAndIntegrations: 'Markdown files, local evidence files, and JSON state only.',
      risks: 'Reviewers may skip evidence, remediation may drift, and the package may become generic.',
      successMetrics: 'A reviewer can run the audit package end to end without a user-facing interface.',
      nonGoals: 'No hosted app, no dashboard, no database, no auth.',
      questionnaireAnswers: {
        'north-star': 'The first release must prove that an internal audit package can be created, reviewed, and handed off without a UI.',
        'primary-workflow': 'A reviewer opens the audit package, completes the checklist, records evidence, hands off remediation items, and closes the audit loop.',
        'scope-cut': 'Keep the audit package and remediation workflow in v1. Defer any user-facing software.',
        acceptance: 'A reviewer should be able to complete the audit package without extra chat context or a live interface.',
        'operating-risks': 'The main risks are skipped evidence, vague remediation actions, and generic templates.'
      }
    })
  );
  const nonUiStart = getFile(nonUiBundle, 'ui-ux/UI_UX_START_HERE.md');
  assert(/lightweight screen and workflow review placeholder/i.test(nonUiStart), 'Non-UI projects should still receive lightweight UI/UX guidance.');
  assert(/not clearly ui-driven today/i.test(nonUiStart), 'Non-UI UI_UX_START_HERE.md should explain optional status.');
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
      `phases/${phase.slug}/TEST_SCRIPT.md`,
      `phases/${phase.slug}/TEST_RESULTS.md`,
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

    const testScript = getFile(bundle, `phases/${phase.slug}/TEST_SCRIPT.md`);
    assert(/## Commands or manual procedures/.test(testScript), `TEST_SCRIPT.md missing commands section for ${phase.slug}`);
    assert(/## Pass\/fail criteria/.test(testScript), `TEST_SCRIPT.md missing pass/fail criteria for ${phase.slug}`);
    assert(/## Failure handling/.test(testScript), `TEST_SCRIPT.md missing failure handling for ${phase.slug}`);
    assert(/## Evidence recording/.test(testScript), `TEST_SCRIPT.md missing evidence recording for ${phase.slug}`);

    const testResults = getFile(bundle, `phases/${phase.slug}/TEST_RESULTS.md`);
    assert(/## Final result: pending/.test(testResults), `TEST_RESULTS.md should default to pending for ${phase.slug}`);
    assert(/## Recommendation: pending/.test(testResults), `TEST_RESULTS.md recommendation should default to pending for ${phase.slug}`);
    assert(!/## Final result: pass/.test(testResults), `TEST_RESULTS.md should NOT default to pass for ${phase.slug}`);
    assert(!/## Final result: fail/.test(testResults), `TEST_RESULTS.md should NOT default to fail for ${phase.slug}`);

    const exitGate = getFile(bundle, `phases/${phase.slug}/EXIT_GATE.md`);
    assert(/## Concrete expected outputs/.test(exitGate), `EXIT_GATE.md missing concrete expected outputs for ${phase.slug}`);
    assert(/## Failure or blocker conditions/.test(exitGate), `EXIT_GATE.md missing failure or blocker conditions for ${phase.slug}`);
    assert(/## Regression or continuity checks/.test(exitGate), `EXIT_GATE.md missing regression or continuity checks for ${phase.slug}`);
    const quickExitGate = getFile(bundle, `gates/gate-${String(phase.index).padStart(2, '0')}-exit.md`);
    assert(/## Concrete expected outputs/.test(quickExitGate), `Quick exit gate missing concrete expected outputs for ${phase.slug}`);
    assert(/## Failure or blocker conditions/.test(quickExitGate), `Quick exit gate missing blocker conditions for ${phase.slug}`);
    assert(/## final decision/.test(verificationReport), `VERIFICATION_REPORT.md missing final decision for ${phase.slug}`);
    assert(/Selected result: pending/.test(verificationReport), `VERIFICATION_REPORT.md missing backward-compatible Selected result for ${phase.slug}`);
    assert(/Selected recommendation: pending/.test(verificationReport), `VERIFICATION_REPORT.md missing backward-compatible Selected recommendation for ${phase.slug}`);
  }

  // Verify AGENTS.md includes Core Agent Operating Rules
  const agentsMd = getFile(bundle, 'AGENTS.md');
  assert(/## Core Agent Operating Rules/.test(agentsMd), 'AGENTS.md missing Core Agent Operating Rules heading.');
  assert(/1\. Don't assume\. Don't hide confusion\. Surface tradeoffs\./.test(agentsMd), 'AGENTS.md missing rule 1.');
  assert(/2\. Minimum code that solves the problem\. Nothing speculative\./.test(agentsMd), 'AGENTS.md missing rule 2.');
  assert(/3\. Touch only what you must\. Clean up only your own mess\./.test(agentsMd), 'AGENTS.md missing rule 3.');
  assert(/4\. Define success criteria\. Loop until verified\./.test(agentsMd), 'AGENTS.md missing rule 4.');

  // Verify TESTING_STRATEGY.md is project-specific
  const testingStrategy = getFile(bundle, 'TESTING_STRATEGY.md');
  assert(/What testing means for this project/.test(testingStrategy), 'TESTING_STRATEGY.md missing what-testing-means section.');
  assert(/Types of tests expected/.test(testingStrategy), 'TESTING_STRATEGY.md missing types of tests section.');
  assert(/What must be tested after every phase/.test(testingStrategy), 'TESTING_STRATEGY.md missing after-every-phase section.');
  assert(/What must be tested before moving to the next phase/.test(testingStrategy), 'TESTING_STRATEGY.md missing before-next-phase section.');
  assert(/What must be tested before final package handoff/.test(testingStrategy), 'TESTING_STRATEGY.md missing before-final-handoff section.');
  assert(/How to record evidence/.test(testingStrategy), 'TESTING_STRATEGY.md missing evidence recording section.');
  assert(/What counts as unacceptable evidence/.test(testingStrategy), 'TESTING_STRATEGY.md missing unacceptable evidence section.');
  assert(/How to handle failed tests/.test(testingStrategy), 'TESTING_STRATEGY.md missing failure handling section.');

  // Verify REGRESSION_TEST_PLAN.md
  const regressionTestPlan = getFile(bundle, 'REGRESSION_TEST_PLAN.md');
  assert(/Project-wide regression checklist/.test(regressionTestPlan), 'REGRESSION_TEST_PLAN.md missing project-wide checklist.');
  assert(/Artifact completeness/.test(regressionTestPlan), 'REGRESSION_TEST_PLAN.md missing artifact completeness.');
  assert(/Agent operating rules/.test(regressionTestPlan), 'REGRESSION_TEST_PLAN.md missing agent operating rules.');
  assert(/Gate consistency/.test(regressionTestPlan), 'REGRESSION_TEST_PLAN.md missing gate consistency.');
  assert(/Evidence quality/.test(regressionTestPlan), 'REGRESSION_TEST_PLAN.md missing evidence quality.');
  assert(/Handoff continuity/.test(regressionTestPlan), 'REGRESSION_TEST_PLAN.md missing handoff continuity.');
  assert(/Local-first/.test(regressionTestPlan), 'REGRESSION_TEST_PLAN.md missing local-first checks.');

  // Verify TEST_SCRIPT_INDEX.md references every phase
  const testScriptIndex = getFile(bundle, 'TEST_SCRIPT_INDEX.md');
  assert(/Generated phase test scripts/.test(testScriptIndex), 'TEST_SCRIPT_INDEX.md missing phase scripts listing.');
  for (const phase of bundle.phases) {
    assert(new RegExp(`phases/${phase.slug}/TEST_SCRIPT\\.md`).test(testScriptIndex), `TEST_SCRIPT_INDEX.md missing reference to ${phase.slug}/TEST_SCRIPT.md.`);
  }
  assert(/Regression suite/.test(testScriptIndex), 'TEST_SCRIPT_INDEX.md missing regression suite section.');

  // Verify step-by-step guide mentions testing before verification
  assert(/TEST_SCRIPT\.md/.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should mention TEST_SCRIPT.md.');
  assert(/TEST_RESULTS\.md/.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should mention TEST_RESULTS.md.');
  assert(/regression-suite/.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should reference regression-suite.');
  assert(/## 1\. Decide/.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should include Decide stage.');
  assert(/## 6\. Handoff/.test(guide), 'STEP_BY_STEP_BUILD_GUIDE.md should include Handoff stage.');

  // Verify START_HERE.md mentions testing
  assert(/TEST_SCRIPT\.md/.test(startHere), 'START_HERE.md should mention TEST_SCRIPT.md.');
  assert(/TEST_RESULTS\.md/.test(startHere), 'START_HERE.md should mention TEST_RESULTS.md.');

  // Verify regression suite files are project-specific
  const regressionReadme = getFile(bundle, 'regression-suite/README.md');
  assert(new RegExp(sample.productName).test(regressionReadme), 'regression-suite/README.md should reference the product name.');
  const regressionRun = getFile(bundle, 'regression-suite/RUN_REGRESSION.md');
  assert(/When to run this suite/.test(regressionRun), 'regression-suite/RUN_REGRESSION.md missing when-to-run section.');
  const regressionChecklist = getFile(bundle, 'regression-suite/REGRESSION_CHECKLIST.md');
  assert(/Agent operating rules/.test(regressionChecklist), 'regression-suite/REGRESSION_CHECKLIST.md missing agent rules section.');
  assert(/1\. Don't assume/.test(regressionChecklist), 'regression-suite/REGRESSION_CHECKLIST.md missing rule 1 in checklist.');
  const regressionResults = getFile(bundle, 'regression-suite/REGRESSION_RESULTS_TEMPLATE.md');
  assert(/Overall result: pending/.test(regressionResults), 'REGRESSION_RESULTS_TEMPLATE.md should default to pending.');
  assert(!/Overall result: pass/.test(regressionResults), 'REGRESSION_RESULTS_TEMPLATE.md should not default to pass.');

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

  const familyFixture = generateProjectBundle(familySample);
  const privvyFixture = generateProjectBundle(
    buildAnsweredInput({
      productName: 'Privvy Family Readiness',
      level: 'advanced',
      track: 'business',
      productIdea:
        'A family readiness workspace that helps households organize emergency contacts, important documents, and clear next steps without overclaiming legal or emergency authority.',
      targetAudience: 'Parent organizers, co-parents, trusted caregivers, and adult family members responsible for readiness plans.',
      problemStatement:
        'Families keep critical readiness information scattered across conversations and files, which causes confusion, outdated guidance, and unsafe assumptions during stressful moments.',
      constraints:
        'Keep the first release local-first and markdown-first. Avoid legal advice, avoid emergency-response overclaiming, and keep sensitive family information explicit and reviewable.',
      mustHaveFeatures:
        'Readiness overview, emergency contact list, document checklist, household roles, caveat notes, emergency-mode boundaries, handoff workflow.',
      dataAndIntegrations:
        'Family members, emergency contacts, document references, readiness notes, boundary disclaimers, and optional document links.',
      risks:
        'Emergency mode could overclaim authority, the package could sound like legal advice, privacy matters, and outdated family information could create false confidence.',
      successMetrics:
        'A reviewer can see what the product helps with, what it explicitly does not do, and what family readiness caveats must stay visible.',
      nonGoals:
        'No legal advice, no emergency dispatch integration, no cloud backend, no automatic document filing.',
      questionnaireAnswers: {
        'north-star':
          'The first release must help a family organize readiness information while clearly stating the limits of the tool.',
        'primary-workflow':
          'A parent organizer sets up the family readiness workspace, records key contacts and documents, reviews emergency notes, and shares clear role expectations with other adults.',
        'scope-cut':
          'Keep household readiness notes, boundary disclaimers, and family-role summaries in v1. Defer outside integrations and anything that looks like legal decision-making.',
        acceptance:
          'A skeptical reviewer should be able to see the emergency boundaries, the legal caveats, and the core family workflow without hidden assumptions.',
        'operating-risks':
          'The biggest risks are emergency overclaiming, privacy mistakes, and stale family information.'
      }
    })
  );
  const restaurantFixture = generateProjectBundle(
    buildAnsweredInput({
      productName: 'Local Restaurant Ordering',
      level: 'beginner',
      track: 'business',
      productIdea:
        'A pickup-first ordering app for a local restaurant that keeps customer ordering, kitchen acknowledgment, and pickup updates simple.',
      targetAudience: 'Restaurant staff, kitchen staff, and pickup customers.',
      problemStatement:
        'Phone orders and ad hoc messaging cause missed items, unclear order state, and customer confusion around pickup timing.',
      constraints:
        'Keep the first release focused on pickup, not delivery. Keep the workflow simple for staff and customers.',
      mustHaveFeatures:
        'Menu browsing, order creation, order states, kitchen acknowledgment, ready-for-pickup status, customer pickup updates.',
      dataAndIntegrations: 'Menu items, orders, order states, kitchen queue, pickup timestamps.',
      risks: 'Kitchen workflow confusion, pickup delays, and unclear order status could break trust quickly.',
      successMetrics:
        'A reviewer can understand how an order moves from creation to kitchen acknowledgment to pickup and what evidence proves failure handling.',
      nonGoals: 'No delivery, no loyalty program, no marketplace integrations.',
      questionnaireAnswers: {
        'north-star': 'The release must prove that pickup ordering and kitchen handoff are clear and reviewable.',
        'primary-workflow':
          'A customer places a pickup order, staff confirm it, the kitchen acknowledges it, the order moves to ready state, and the customer picks it up.',
        'scope-cut': 'Keep pickup ordering, order states, and kitchen handoff in v1. Defer delivery, rewards, and complex integrations.',
        acceptance:
          'A reviewer should be able to trace order states, kitchen responsibility, and pickup communication without hidden assumptions.',
        'operating-risks': 'The main risks are missed order states, kitchen confusion, and bad pickup updates.'
      }
    })
  );
  const clinicFixture = generateProjectBundle(
    buildAnsweredInput({
      productName: 'Small Clinic Scheduler',
      level: 'advanced',
      track: 'technical',
      productIdea:
        'A clinic scheduling workspace that helps staff manage provider availability, patient appointments, reminder rules, and conflict handling.',
      targetAudience: 'Clinic schedulers, providers, front-desk staff, and practice managers.',
      problemStatement:
        'Small clinics often manage schedules through fragmented tools, which causes double-bookings, reminder mistakes, and privacy-sensitive communication issues.',
      constraints:
        'Keep the first release local-first. Make provider availability, reminder wording, and privacy boundaries explicit. Avoid unsupported clinical claims.',
      mustHaveFeatures:
        'Provider availability, appointment requests, conflict handling, reminder planning, schedule review, privacy-safe communication boundaries.',
      dataAndIntegrations:
        'Providers, appointment slots, appointment requests, reminder preferences, conflict states, clinic schedule notes.',
      risks:
        'Reminder content may expose sensitive details, provider conflicts could be mishandled, and privacy boundaries could stay vague.',
      successMetrics:
        'A reviewer can understand provider conflict rules, reminder limits, and what evidence proves scheduling safety.',
      nonGoals: 'No billing, no insurance integrations, no full EHR system.',
      questionnaireAnswers: {
        'north-star':
          'The first release must make provider availability, reminder boundaries, and conflict handling explicit and reviewable.',
        'primary-workflow':
          'A scheduler reviews provider availability, books or adjusts appointments, resolves conflicts, and prepares reminder content with privacy limits.',
        'data-boundaries':
          'Important boundaries include provider calendars, appointment requests, reminder fields, conflict states, and privacy-sensitive scheduling notes.',
        'scope-cut':
          'Keep provider availability, conflict handling, and reminder boundaries in v1. Defer billing, insurance, and deeper patient record features.',
        acceptance:
          'A skeptical reviewer should be able to confirm reminder privacy rules, provider conflict handling, and explicit deferrals.',
        'operating-risks':
          'The biggest risks are sensitive reminder wording, provider double-booking, and hidden privacy assumptions.',
        'deployment-guardrails':
          'Keep the package local-first and force explicit privacy review before anything sounds production ready.',
        'test-proof':
          'Reviewers should capture conflict scenarios, reminder wording checks, and observed scheduling outcomes before advancement.'
      }
    })
  );
  const inventoryFixture = generateProjectBundle(
    buildAnsweredInput({
      productName: 'Small Business Inventory',
      level: 'intermediate',
      track: 'technical',
      productIdea:
        'An inventory planning workspace for a small business that tracks stock states, thresholds, and adjustments without adding unnecessary ERP complexity.',
      targetAudience: 'Store managers, stock operators, and owners reviewing low-stock decisions.',
      problemStatement:
        'Small businesses often track inventory inconsistently, which causes stock surprises, unclear adjustments, and reactive ordering.',
      constraints:
        'Keep the first release simple, local-first, and focused on stock-state clarity, low-stock thresholds, and adjustment review.',
      mustHaveFeatures:
        'Inventory items, stock states, low-stock thresholds, adjustment notes, review workflow, purchase-plan deferrals.',
      dataAndIntegrations:
        'Inventory items, stock counts, threshold values, adjustment history, purchase-plan notes.',
      risks:
        'Low-stock thresholds may be unclear, adjustments may not be trustworthy, and the package could drift into irrelevant finance or clinic concerns.',
      successMetrics:
        'A reviewer can trace low-stock, adjustment, and deferred purchase planning behavior with clear evidence.',
      nonGoals: 'No accounting suite, no POS integrations, no warehouse robotics.',
      questionnaireAnswers: {
        'north-star':
          'The first release must make stock states, low-stock thresholds, and adjustments explicit enough to guide implementation.',
        'primary-workflow':
          'A manager reviews stock states, records adjustments, checks low-stock items, and decides what purchase planning stays deferred.',
        'data-boundaries':
          'Important boundaries include item records, threshold fields, adjustment history, and low-stock review notes.',
        'scope-cut':
          'Keep stock states, thresholds, and adjustment review in v1. Defer accounting, vendor automation, and multi-location complexity.',
        acceptance:
          'A reviewer should be able to trace inventory state changes and understand which purchase behaviors are deferred.',
        'operating-risks':
          'The biggest risks are unclear thresholds, weak adjustment trust, and over-promising unsupported inventory features.',
        'deployment-guardrails':
          'Keep the artifacts local-first and require explicit notes when repo targets are assumptions.',
        'test-proof':
          'Reviewers should capture low-stock and adjustment scenarios with observed results before advancement.'
      }
    })
  );

  const budgetFixture = generateProjectBundle(
    buildAnsweredInput({
      productName: 'Household Budget Planner',
      level: 'beginner',
      track: 'business',
      productIdea:
        'A simple household budgeting workspace that helps families track income, spending categories, and monthly review without claiming financial advice.',
      targetAudience: 'Household budget managers, partners sharing finances, and family members reviewing spending together.',
      problemStatement:
        'Households lose track of spending patterns, forget irregular bills, and struggle to align on financial priorities without a shared review tool.',
      constraints:
        'Keep the first release local-first and focused on tracking and review, not financial advice or investment guidance.',
      mustHaveFeatures:
        'Income tracking, expense categories, monthly review view, shared household access, alert thresholds, non-advice disclaimers.',
      dataAndIntegrations: 'Income entries, expense entries, category tags, monthly summary notes, alert rules.',
      risks:
        'The product could be mistaken for financial advice, budget data could be sensitive, and shared access could create conflict.',
      successMetrics:
        'A reviewer can trace income, expense categories, monthly review flow, and alert behavior with clear evidence.',
      nonGoals: 'No investment advice, no bank integrations, no tax filing help.',
      questionnaireAnswers: {
        'north-star':
          'The release must make income, expenses, categories, and monthly review explicit enough for a household to use.',
        'primary-workflow':
          'A budget manager enters income and expenses, reviews categories monthly, sets alert thresholds, and shares summaries with household members.',
        'scope-cut':
          'Keep income tracking, expense categories, monthly review, and alerts in v1. Defer bank integrations, investment features, and tax help.',
        acceptance:
          'A reviewer should be able to trace budget categories, alert thresholds, and monthly review behavior without hidden assumptions.',
        'operating-risks':
          'The main risks are financial advice overclaim, sensitive budget data exposure, and household conflict over spending.'
      }
    })
  );
  const hoaFixture = generateProjectBundle(
    buildAnsweredInput({
      productName: 'HOA Maintenance Portal',
      level: 'intermediate',
      track: 'business',
      productIdea: 'A maintenance request portal for homeowners associations.',
      targetAudience: 'HOA residents, board members, and vendors.',
      problemStatement: 'Maintenance requests are lost and residents do not know status.',
      constraints: 'Simple and local-first.',
      mustHaveFeatures: 'Request submission, triage, vendor assignment, status updates.',
      dataAndIntegrations: 'Requests, residents, vendors, status history.',
      risks: 'Requests may stall without resident visibility.',
      successMetrics: 'Residents can track request status.',
      nonGoals: 'No payment processing.',
      questionnaireAnswers: {
        'north-star': 'Prove request tracking works.',
        'primary-workflow':
          'Resident submits request, board triages, vendor handles, resident gets updates.',
        'scope-cut': 'Keep request tracking. Defer payments.',
        acceptance: 'A reviewer should understand the request flow.',
        'operating-risks': 'Request stall risk is main concern.'
      }
    })
  );
  const schoolFixture = generateProjectBundle(
    buildAnsweredInput({
      productName: 'School Club Portal',
      level: 'beginner',
      track: 'technical',
      productIdea: 'A portal for school clubs to manage membership and events.',
      targetAudience: 'Students, advisors, and club organizers.',
      problemStatement: 'Club information is scattered and events are poorly communicated.',
      constraints: 'Student-privacy first.',
      mustHaveFeatures: 'Membership, events, announcements, permissions.',
      dataAndIntegrations: 'Students, clubs, events, announcements.',
      risks: 'Student privacy must be protected.',
      successMetrics: 'Students can find club info and events.',
      nonGoals: 'No grades integration.',
      questionnaireAnswers: {
        'north-star': 'Prove club info is accessible.',
        'primary-workflow': 'Student joins club, sees events, gets announcements.',
        'scope-cut': 'Keep membership and events. Defer grades.',
        acceptance: 'A reviewer should see the club workflow.',
        'operating-risks': 'Student privacy is the main risk.'
      }
    })
  );
  const volunteerFixture = generateProjectBundle(
    buildAnsweredInput({
      productName: 'Event Volunteer Manager',
      level: 'beginner',
      track: 'business',
      productIdea: 'A volunteer coordination tool for events.',
      targetAudience: 'Event organizers and volunteers.',
      problemStatement: 'Volunteer shifts are hard to fill and no-shows create gaps.',
      constraints: 'Simple check-in flow.',
      mustHaveFeatures: 'Shift setup, volunteer signup, check-in, no-show handling.',
      dataAndIntegrations: 'Shifts, volunteers, signups, check-ins.',
      risks: 'No-shows and shift gaps.',
      successMetrics: 'Organizers can fill shifts and handle no-shows.',
      nonGoals: 'No payment to volunteers.',
      questionnaireAnswers: {
        'north-star': 'Prove shift coordination works.',
        'primary-workflow': 'Organizer creates shifts, volunteers sign up, check in on day.',
        'scope-cut': 'Keep shift coordination. Defer payments.',
        acceptance: 'A reviewer should see the volunteer flow.',
        'operating-risks': 'No-show risk is main concern.'
      }
    })
  );

  const fixtureBundles = [
    familyFixture,
    privvyFixture,
    restaurantFixture,
    clinicFixture,
    inventoryFixture,
    budgetFixture,
    hoaFixture,
    schoolFixture,
    volunteerFixture
  ];
  const normalizedPhaseTokens = (bundleToInspect: ReturnType<typeof generateProjectBundle>) =>
    new Set(
      bundleToInspect.phases
        .flatMap((phase) =>
          phase.name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((token) => token.length >= 5)
        )
    );
  const overlapRatio = (left: ReturnType<typeof generateProjectBundle>, right: ReturnType<typeof generateProjectBundle>) => {
    const leftTokens = normalizedPhaseTokens(left);
    const rightTokens = normalizedPhaseTokens(right);
    const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
    const union = new Set([...Array.from(leftTokens), ...Array.from(rightTokens)]).size || 1;
    return intersection / union;
  };

  for (const fixture of fixtureBundles) {
    assert(
      fixture.phases.every((phase) => !/checkpoint\s+[01]/i.test(phase.name)),
      `${fixture.files.find((file) => file.path === 'PROJECT_BRIEF.md')?.content || 'bundle'} should not generate synthetic checkpoint phase names.`
    );
    assert(
      fixture.phases.every((phase) => !/package review checkpoint/i.test(phase.name)),
      'No phase should use synthetic package review checkpoint padding.'
    );
    const firstPrompt = getFile(fixture, `phases/${fixture.phases[0].slug}/CODEX_BUILD_PROMPT.md`);
    assert(
      !/List the exact repo files you plan to change before editing anything\./i.test(firstPrompt) ||
        /If exact targets are unknown, propose likely areas and label them as assumptions\./i.test(firstPrompt),
      'Planning-phase prompts should not demand invented implementation files.'
    );
    const finalPhase = fixture.phases[fixture.phases.length - 1];
    const finalPrompt = getFile(fixture, `phases/${finalPhase.slug}/CODEX_BUILD_PROMPT.md`);
    const finalNextContext = getFile(fixture, `phases/${finalPhase.slug}/NEXT_PHASE_CONTEXT.md`);
    assert(!/No next phase\. This is the final phase\./i.test(finalNextContext), 'Final NEXT_PHASE_CONTEXT should be a recap, not generic next-phase filler.');
    assert(/## Final package summary|## Final release caveats/i.test(finalNextContext), 'Final NEXT_PHASE_CONTEXT should include a final recap or caveats.');
    assert(!/package review checkpoint/i.test(getFile(fixture, 'PHASE_PLAN.md')), 'PHASE_PLAN.md should not include synthetic checkpoint padding.');

    for (const phase of fixture.phases) {
      const exitGateText = getFile(fixture, `phases/${phase.slug}/EXIT_GATE.md`);
      const testPlanText = getFile(fixture, `phases/${phase.slug}/TEST_PLAN.md`);
      const handoffText = getFile(fixture, `phases/${phase.slug}/HANDOFF_SUMMARY.md`);
      assert(/## Concrete expected outputs/.test(exitGateText), `Exit gate should include concrete expected outputs for ${phase.slug}.`);
      assert(/## Failure or blocker conditions/.test(exitGateText), `Exit gate should include failure conditions for ${phase.slug}.`);
      assert(/## Scope guard/.test(exitGateText), `Exit gate should include scope guard rules for ${phase.slug}.`);
      assert(/## Scenario 1/.test(testPlanText), `TEST_PLAN.md should include a scenario for ${phase.slug}.`);
      assert(/## Expected result/.test(testPlanText), `TEST_PLAN.md should include expected result for ${phase.slug}.`);
      assert(/## Failure condition/.test(testPlanText), `TEST_PLAN.md should include failure condition for ${phase.slug}.`);
      assert(/## Evidence to capture/.test(testPlanText), `TEST_PLAN.md should include evidence to capture for ${phase.slug}.`);
      assert(!/Use the current acceptance anchor as proof guidance/i.test(testPlanText), `TEST_PLAN.md should not contain truncated generic anchor text for ${phase.slug}.`);
      assert(!/Verify that the phase output still matches/i.test(testPlanText), `TEST_PLAN.md should not contain generic workflow filler for ${phase.slug}.`);
      assert(!/Re-check the highest risk focus/i.test(testPlanText), `TEST_PLAN.md should not contain generic risk filler for ${phase.slug}.`);
      assert(/## Completion update/.test(handoffText), `HANDOFF_SUMMARY.md should be pre-populated with a completion update section for ${phase.slug}.`);
      assert(/## Expected outputs from this phase/.test(handoffText), `HANDOFF_SUMMARY.md should include expected outputs for ${phase.slug}.`);
    }
  }

  assert(
    overlapRatio(familyFixture, restaurantFixture) < 0.7 &&
      overlapRatio(privvyFixture, clinicFixture) < 0.7 &&
      overlapRatio(restaurantFixture, inventoryFixture) < 0.7,
    'Phase plans across contrasting domains are still too similar.'
  );
  assert(
    /child visibility|parent control/i.test(getFile(familyFixture, 'PHASE_PLAN.md')),
    'Family task domain should generate child-visibility-specific phases.'
  );
  assert(
    /emergency|legal boundary/i.test(getFile(privvyFixture, 'PHASE_PLAN.md')),
    'Family readiness domain should generate emergency or legal boundary phases.'
  );
  assert(
    /order states|kitchen handoff|pickup/i.test(getFile(restaurantFixture, 'PHASE_PLAN.md')),
    'Restaurant ordering domain should generate order-state or kitchen workflow phases.'
  );
  assert(
    /provider availability|reminder|privacy/i.test(getFile(clinicFixture, 'PHASE_PLAN.md')),
    'Clinic scheduler domain should generate provider, reminder, or privacy phases.'
  );
  assert(
    /stock states|thresholds|adjustment/i.test(getFile(inventoryFixture, 'PHASE_PLAN.md')),
    'Inventory domain should generate stock-state-specific phases.'
  );
  assert(
    /child users only see allowed items|parent or admin control boundaries/i.test(getFile(familyFixture, 'phases/phase-01/EVIDENCE_CHECKLIST.md')) ||
      /child users only see allowed items|parent or admin control boundaries/i.test(
        fixtureBundles.flatMap((fixture) => fixture.files.map((file) => file.content)).join('\n')
      ),
    'Sensitive child-domain inputs should generate risk-specific evidence requirements.'
  );
  assert(
    /avoid sensitive clinic details|provider scheduling conflicts/i.test(fixtureBundles.flatMap((fixture) => fixture.files.map((file) => file.content)).join('\n')),
    'Sensitive clinic-domain inputs should generate risk-specific checks.'
  );
  assert(
    /budget categories|income|expense|monthly review/i.test(getFile(budgetFixture, 'PHASE_PLAN.md')),
    'Budget planner domain should generate budget-specific phases.'
  );
  assert(
    /request triage|vendor|resident|status update/i.test(getFile(hoaFixture, 'PHASE_PLAN.md')),
    'HOA maintenance domain should generate HOA-specific phases.'
  );
  assert(
    /student role|event sign-up|membership|permission/i.test(getFile(schoolFixture, 'PHASE_PLAN.md')),
    'School club domain should generate school-club-specific phases.'
  );
  assert(
    /shift coverage|no-show|check-in|volunteer/i.test(getFile(volunteerFixture, 'PHASE_PLAN.md')),
    'Event volunteer domain should generate volunteer-specific phases.'
  );
  assert(
    !/legal advice|emergency authority/i.test(getFile(inventoryFixture, 'PHASE_PLAN.md')),
    'Non-sensitive inventory input should not inherit irrelevant legal or emergency phases.'
  );

  // Regression: non-SDR packages must not contain SDR-specific language
  const nonSdrFixtures = [
    { name: 'Restaurant', fixture: restaurantFixture },
    { name: 'Budget', fixture: budgetFixture },
    { name: 'Clinic', fixture: clinicFixture },
    { name: 'HOA', fixture: hoaFixture },
    { name: 'School', fixture: schoolFixture },
    { name: 'Volunteer', fixture: volunteerFixture },
    { name: 'Inventory', fixture: inventoryFixture }
  ];
  for (const { name, fixture } of nonSdrFixtures) {
    const allContent = fixture.files.map((file) => file.content).join('\n');
    assert(
      !/sales qualification brief/i.test(allContent),
      `${name} package should not contain sales qualification brief.`
    );
    assert(
      !/rep handoff/i.test(allContent),
      `${name} package should not contain rep handoff language.`
    );
    assert(
      !/blocked-lead review/i.test(allContent),
      `${name} package should not contain blocked-lead review language.`
    );
  }

  // Regression: budget must not contain clinical leakage
  const budgetContent = budgetFixture.files.map((file) => file.content).join('\n');
  assert(!/clinical details/i.test(budgetContent), 'Budget planner should not contain clinical details.');
  assert(!/provider availability/i.test(budgetContent), 'Budget planner should not contain provider availability language.');
  assert(!/reminder privacy/i.test(budgetContent), 'Budget planner should not contain reminder privacy language.');

  // Regression: no truncated acceptance anchors
  for (const fixture of fixtureBundles) {
    const allContent = fixture.files.map((file) => file.content).join('\n');
    assert(
      !/know the\.\.\./i.test(allContent),
      'Generated files should not contain truncated acceptance anchors ending in know the....'
    );
    assert(
      !/minimum event and\.\.\./i.test(allContent),
      'Generated files should not contain truncated acceptance anchors ending in minimum event and....'
    );
    // No sentence should end with "..." (ellipsis at end of line after text)
    const lines = allContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.endsWith('...') && trimmed.length > 3 && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        assert(false, `Generated file contains truncated text ending in "...": ${trimmed.substring(0, 80)}`);
      }
    }
  }

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

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
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
  assert(fs.existsSync(path.join(cliResult.rootDir, 'repo', 'manoa-state.json')), 'CLI output is missing repo/manoa-state.json.');

  // Test next-phase behavior
  const testPkgDir = cliResult.rootDir;

  // Clear blocked phases for next-phase tests
  const testStatePath = path.join(testPkgDir, 'repo', 'manoa-state.json');
  const testState = JSON.parse(fs.readFileSync(testStatePath, 'utf8'));
  testState.blockedPhases = [];
  fs.writeFileSync(testStatePath, JSON.stringify(testState, null, 2));

  // Test: next-phase without approval/evidence should fail
  try {
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${testPkgDir}`];
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

  function replaceReportSection(content: string, heading: string, body: string) {
    return content.replace(new RegExp(`## ${heading}[\\s\\S]*?(?=\\n##\\s+|$)`, 'i'), `## ${heading}\n${body}\n`);
  }

  // Test: next-phase with blocked evidence should fail
  const blockedReportPath = path.join(testPkgDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  const blockedReport = updateReport(fs.readFileSync(blockedReportPath, 'utf8'), 'fail', 'blocked');
  fs.writeFileSync(blockedReportPath, blockedReport);
  try {
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
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
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
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
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
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
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
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
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance with inconsistent result/recommendation');
  } catch (e) {
    assert(
      (e as Error).message.includes('inconsistent'),
      `next-phase error message should mention inconsistency, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase rejects generic fake evidence even when the report says pass + proceed
  const genericEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const genericEvidenceResult = await createArtifactPackage({ input: sample, outDir: genericEvidencePkg, zip: false });
  const genericEvidenceStatePath = path.join(genericEvidenceResult.rootDir, 'repo', 'manoa-state.json');
  const genericEvidenceState = JSON.parse(fs.readFileSync(genericEvidenceStatePath, 'utf8'));
  genericEvidenceState.blockedPhases = [];
  fs.writeFileSync(genericEvidenceStatePath, JSON.stringify(genericEvidenceState, null, 2));
  const genericEvidenceFile = path.join(genericEvidenceResult.rootDir, 'notes', 'generic-evidence.md');
  fs.mkdirSync(path.dirname(genericEvidenceFile), { recursive: true });
  fs.writeFileSync(genericEvidenceFile, 'I reviewed the work and it looks good. No issues. Ready to proceed.\n', 'utf8');
  const genericEvidenceReportPath = path.join(genericEvidenceResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let genericEvidenceReport = updateReport(fs.readFileSync(genericEvidenceReportPath, 'utf8'), 'pass', 'proceed');
  genericEvidenceReport = replaceEvidenceSection(genericEvidenceReport, ['- notes/generic-evidence.md']);
  fs.writeFileSync(genericEvidenceReportPath, genericEvidenceReport);
  try {
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${genericEvidenceResult.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
    runNextPhase();
    assert(false, 'next-phase should reject generic fake evidence');
  } catch (e) {
    assert(/generic|concrete proof/i.test((e as Error).message), `next-phase should explain generic evidence rejection, got: ${(e as Error).message}`);
  }

  // Test: next-phase rejects pass/proceed headers when the report body still says the phase is blocked
  const contradictionPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const contradictionResult = await createArtifactPackage({ input: sample, outDir: contradictionPkg, zip: false });
  const contradictionStatePath = path.join(contradictionResult.rootDir, 'repo', 'manoa-state.json');
  const contradictionState = JSON.parse(fs.readFileSync(contradictionStatePath, 'utf8'));
  contradictionState.blockedPhases = [];
  fs.writeFileSync(contradictionStatePath, JSON.stringify(contradictionState, null, 2));
  const contradictionEvidenceFile = path.join(contradictionResult.rootDir, 'notes', 'scenario-proof.md');
  fs.mkdirSync(path.dirname(contradictionEvidenceFile), { recursive: true });
  fs.writeFileSync(
    contradictionEvidenceFile,
    'Scenario checked: reviewed the task assignment flow and parent approval boundary.\nObserved result: the phase notes name the role boundary and the blocker list stayed empty.\nDecision made: keep reminder delivery deferred to a later phase.\n',
    'utf8'
  );
  const contradictionReportPath = path.join(contradictionResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let contradictionReport = updateReport(fs.readFileSync(contradictionReportPath, 'utf8'), 'pass', 'proceed');
  contradictionReport = replaceEvidenceSection(contradictionReport, ['- notes/scenario-proof.md']);
  contradictionReport = replaceReportSection(contradictionReport, 'summary', '- The package is blocked until the role rules are clarified.');
  contradictionReport = replaceReportSection(contradictionReport, 'final decision', 'Do not advance. The phase is not ready.');
  fs.writeFileSync(contradictionReportPath, contradictionReport);
  try {
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${contradictionResult.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
    runNextPhase();
    assert(false, 'next-phase should reject header/body contradictions');
  } catch (e) {
    assert(/headers say pass\/proceed/i.test((e as Error).message), `next-phase should explain header/body contradictions, got: ${(e as Error).message}`);
  }

  // Test: next-phase accepts meaningful evidence with command output
  const commandEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const commandEvidenceResult = await createArtifactPackage({ input: sample, outDir: commandEvidencePkg, zip: false });
  const commandEvidenceStatePath = path.join(commandEvidenceResult.rootDir, 'repo', 'manoa-state.json');
  const commandEvidenceState = JSON.parse(fs.readFileSync(commandEvidenceStatePath, 'utf8'));
  commandEvidenceState.blockedPhases = [];
  fs.writeFileSync(commandEvidenceStatePath, JSON.stringify(commandEvidenceState, null, 2));
  const commandEvidenceFile = path.join(commandEvidenceResult.rootDir, 'notes', 'command-proof.md');
  fs.mkdirSync(path.dirname(commandEvidenceFile), { recursive: true });
  fs.writeFileSync(
    commandEvidenceFile,
    'Command run: `npm run typecheck`\nObserved result: PASS, no TypeScript errors in lib/generator.ts or scripts/manoa-package-utils.ts.\nChanged files: lib/generator.ts, scripts/manoa-package-utils.ts.\nDecision made: keep implementation-file assumptions out of planning phases.\n',
    'utf8'
  );
  const commandEvidenceReportPath = path.join(commandEvidenceResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let commandEvidenceReport = updateReport(fs.readFileSync(commandEvidenceReportPath, 'utf8'), 'pass', 'proceed');
  commandEvidenceReport = replaceEvidenceSection(commandEvidenceReport, ['- notes/command-proof.md']);
  fs.writeFileSync(commandEvidenceReportPath, commandEvidenceReport);
  process.argv = ['node', 'manoa-next-phase.ts', `--package=${commandEvidenceResult.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
  runNextPhase();
  const commandEvidenceAdvancedState = JSON.parse(fs.readFileSync(path.join(commandEvidenceResult.rootDir, 'repo', 'manoa-state.json'), 'utf8'));
  assert(commandEvidenceAdvancedState.currentPhase === 2, 'next-phase should accept meaningful evidence with command output.');

  // Test: next-phase accepts meaningful evidence with a concrete scenario and observed result
  const scenarioEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const scenarioEvidenceResult = await createArtifactPackage({ input: familySample, outDir: scenarioEvidencePkg, zip: false });
  const scenarioEvidenceStatePath = path.join(scenarioEvidenceResult.rootDir, 'repo', 'manoa-state.json');
  const scenarioEvidenceState = JSON.parse(fs.readFileSync(scenarioEvidenceStatePath, 'utf8'));
  scenarioEvidenceState.blockedPhases = [];
  fs.writeFileSync(scenarioEvidenceStatePath, JSON.stringify(scenarioEvidenceState, null, 2));
  const scenarioEvidenceFile = path.join(scenarioEvidenceResult.rootDir, 'notes', 'scenario-proof.md');
  fs.mkdirSync(path.dirname(scenarioEvidenceFile), { recursive: true });
  fs.writeFileSync(
    scenarioEvidenceFile,
    'Scenario checked: kid dashboard task visibility after parent assignment.\nObserved result: the phase packet says child users only see assigned or shared tasks, and parent approval remains explicit.\nArtifact reviewed: phases/phase-01/PHASE_BRIEF.md.\nBlocker found: none.\n',
    'utf8'
  );
  const scenarioEvidenceReportPath = path.join(scenarioEvidenceResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let scenarioEvidenceReport = updateReport(fs.readFileSync(scenarioEvidenceReportPath, 'utf8'), 'pass', 'proceed');
  scenarioEvidenceReport = replaceEvidenceSection(scenarioEvidenceReport, ['- notes/scenario-proof.md']);
  fs.writeFileSync(scenarioEvidenceReportPath, scenarioEvidenceReport);
  process.argv = ['node', 'manoa-next-phase.ts', `--package=${scenarioEvidenceResult.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
  runNextPhase();
  const scenarioEvidenceAdvancedState = JSON.parse(fs.readFileSync(path.join(scenarioEvidenceResult.rootDir, 'repo', 'manoa-state.json'), 'utf8'));
  assert(scenarioEvidenceAdvancedState.currentPhase === 2, 'next-phase should accept meaningful scenario evidence.');

  // Test: next-phase with proceed evidence should succeed
  const proceedReport = updateReport(fs.readFileSync(blockedReportPath, 'utf8'), 'pass', 'proceed');
  fs.writeFileSync(blockedReportPath, proceedReport.replace(/- pending/, '- repo/manifest.json'));
  process.argv = ['node', 'manoa-next-phase.ts', `--package=${testPkgDir}`, `--evidence=phases/phase-01/VERIFICATION_REPORT.md`, '--handoff=Smoke test handoff'];
  runNextPhase();

  const updatedState = JSON.parse(fs.readFileSync(path.join(testPkgDir, 'repo', 'manoa-state.json'), 'utf8'));
  assert(updatedState.currentPhase === 2, `Expected currentPhase to advance to 2, received ${updatedState.currentPhase}`);
  assert(updatedState.completedPhases.includes('phase-01'), 'Expected phase-01 to be in completedPhases');
  assert(updatedState.phaseEvidence['phase-01'].approvedToProceed === true, 'Expected phase-01 to be approved to proceed');
  assert(updatedState.phaseEvidence['phase-01'].reviewerRecommendation === 'proceed', 'Expected reviewer recommendation to be proceed');
  assert(updatedState.lastHandoffSummary === 'Smoke test handoff', 'Expected handoff summary to be recorded');

  // Test: next-phase with manual approval should succeed
  const testPkgDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const cliResult2 = await createArtifactPackage({
    input: sample,
    outDir: testPkgDir2,
    zip: false
  });
  // Clear blocked phases for manual approval test
  const testStatePath2 = path.join(cliResult2.rootDir, 'repo', 'manoa-state.json');
  const testState2 = JSON.parse(fs.readFileSync(testStatePath2, 'utf8'));
  testState2.blockedPhases = [];
  fs.writeFileSync(testStatePath2, JSON.stringify(testState2, null, 2));
  process.argv = ['node', 'manoa-next-phase.ts', `--package=${cliResult2.rootDir}`, '--approve=true', '--handoff=Manual approval test'];
  runNextPhase();
  const manualState = JSON.parse(fs.readFileSync(path.join(cliResult2.rootDir, 'repo', 'manoa-state.json'), 'utf8'));
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
  const missingEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
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
    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultMissing.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should catch missing evidence file');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for missing evidence');
    }

    // Test: validate catches pass+proceed with only pending evidence placeholder
    const noListedEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultNoEvidence = await createArtifactPackage({ input: sample, outDir: noListedEvidencePkg, zip: false });
    const noEvidenceReportPath = path.join(cliResultNoEvidence.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let noEvidenceReport = updateReport(fs.readFileSync(noEvidenceReportPath, 'utf8'), 'pass', 'proceed');
    fs.writeFileSync(noEvidenceReportPath, noEvidenceReport);

    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultNoEvidence.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject pending-only evidence placeholder');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 when only pending evidence is listed');
    }

    // Test: validate rejects report sections that still contain only comments or placeholders
    const commentOnlyEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultCommentOnly = await createArtifactPackage({ input: sample, outDir: commentOnlyEvidencePkg, zip: false });
    const commentOnlyReportPath = path.join(cliResultCommentOnly.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let commentOnlyReport = updateReport(fs.readFileSync(commentOnlyReportPath, 'utf8'), 'pass', 'proceed');
    commentOnlyReport = replaceEvidenceSection(commentOnlyReport, ['- <!-- reviewed later -->', '- pending']);
    fs.writeFileSync(commentOnlyReportPath, commentOnlyReport);

    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultCommentOnly.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject comment-only evidence entries');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 when evidence entries are only comments or placeholders');
    }

    // Test: validate rejects scaffold-only evidence files with template content
    const scaffoldOnlyEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultScaffoldOnly = await createArtifactPackage({ input: sample, outDir: scaffoldOnlyEvidencePkg, zip: false });
    const scaffoldOnlyReportPath = path.join(cliResultScaffoldOnly.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let scaffoldOnlyReport = updateReport(fs.readFileSync(scaffoldOnlyReportPath, 'utf8'), 'pass', 'proceed');
    scaffoldOnlyReport = replaceEvidenceSection(scaffoldOnlyReport, [
      '- phases/phase-01/EVIDENCE_CHECKLIST.md',
      '- phases/phase-01/HANDOFF_SUMMARY.md'
    ]);
    fs.writeFileSync(scaffoldOnlyReportPath, scaffoldOnlyReport);

    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultScaffoldOnly.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject scaffold-only evidence files that still contain template content');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for scaffold-only evidence');
    }

    // Test: validate rejects listed evidence files that contain only comments
    const commentFileEvidencePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultCommentFile = await createArtifactPackage({ input: sample, outDir: commentFileEvidencePkg, zip: false });
    const commentFilePath = path.join(cliResultCommentFile.rootDir, 'notes', 'comment-only.md');
    fs.mkdirSync(path.dirname(commentFilePath), { recursive: true });
    fs.writeFileSync(commentFilePath, '<!-- comment only -->\n## Placeholder\n- [ ] not done\n', 'utf8');
    const commentFileReportPath = path.join(cliResultCommentFile.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let commentFileReport = updateReport(fs.readFileSync(commentFileReportPath, 'utf8'), 'pass', 'proceed');
    commentFileReport = replaceEvidenceSection(commentFileReport, ['- notes/comment-only.md']);
    fs.writeFileSync(commentFileReportPath, commentFileReport);

    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultCommentFile.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject evidence files that contain only comments or template text');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for comment-only evidence files');
    }

    // Test: validate rejects generic fake evidence
    const genericValidatePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const genericValidateResult = await createArtifactPackage({ input: sample, outDir: genericValidatePkg, zip: false });
    const genericValidateEvidencePath = path.join(genericValidateResult.rootDir, 'notes', 'generic-evidence.md');
    fs.mkdirSync(path.dirname(genericValidateEvidencePath), { recursive: true });
    fs.writeFileSync(genericValidateEvidencePath, 'I reviewed the work and it looks good. No issues. Ready to proceed.\n', 'utf8');
    const genericValidateReportPath = path.join(genericValidateResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let genericValidateReport = updateReport(fs.readFileSync(genericValidateReportPath, 'utf8'), 'pass', 'proceed');
    genericValidateReport = replaceEvidenceSection(genericValidateReport, ['- notes/generic-evidence.md']);
    fs.writeFileSync(genericValidateReportPath, genericValidateReport);
    process.argv = ['node', 'manoa-validate.ts', `--package=${genericValidateResult.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject generic fake evidence');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for generic fake evidence');
    }

    // Test: validate rejects pass/proceed headers when the body still says blocked
    const contradictionValidatePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const contradictionValidateResult = await createArtifactPackage({ input: sample, outDir: contradictionValidatePkg, zip: false });
    const contradictionValidateEvidencePath = path.join(contradictionValidateResult.rootDir, 'notes', 'scenario-proof.md');
    fs.mkdirSync(path.dirname(contradictionValidateEvidencePath), { recursive: true });
    fs.writeFileSync(
      contradictionValidateEvidencePath,
      'Scenario checked: reviewed the planning workflow and the scope cut.\nObserved result: the phase brief names the current v1 scope and the blocking warning list stayed empty.\nDecision made: keep integrations deferred.\n',
      'utf8'
    );
    const contradictionValidateReportPath = path.join(contradictionValidateResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let contradictionValidateReport = updateReport(fs.readFileSync(contradictionValidateReportPath, 'utf8'), 'pass', 'proceed');
    contradictionValidateReport = replaceEvidenceSection(contradictionValidateReport, ['- notes/scenario-proof.md']);
    contradictionValidateReport = replaceReportSection(contradictionValidateReport, 'summary', '- The phase is blocked because the scope is not ready.');
    contradictionValidateReport = replaceReportSection(contradictionValidateReport, 'final decision', 'Do not advance. The package is not ready.');
    fs.writeFileSync(contradictionValidateReportPath, contradictionValidateReport);
    process.argv = ['node', 'manoa-validate.ts', `--package=${contradictionValidateResult.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject header/body contradictions');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for report contradictions');
    }

    // Test: validate accepts meaningful evidence with command output
    const commandValidatePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const commandValidateResult = await createArtifactPackage({ input: sample, outDir: commandValidatePkg, zip: false });
    const commandValidateEvidencePath = path.join(commandValidateResult.rootDir, 'notes', 'command-proof.md');
    fs.mkdirSync(path.dirname(commandValidateEvidencePath), { recursive: true });
    fs.writeFileSync(
      commandValidateEvidencePath,
      'Command run: `npm run smoke`\nObserved result: PASS, the package validated and the lifecycle remained Blocked until blocker warnings are resolved.\nChanged files reviewed: repo/manifest.json and phases/phase-01/PHASE_BRIEF.md.\nDecision made: keep approval metadata pending until review.\n',
      'utf8'
    );
    const commandValidateReportPath = path.join(commandValidateResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let commandValidateReport = updateReport(fs.readFileSync(commandValidateReportPath, 'utf8'), 'pass', 'proceed');
    commandValidateReport = replaceEvidenceSection(commandValidateReport, ['- notes/command-proof.md']);
    fs.writeFileSync(commandValidateReportPath, commandValidateReport);
    const commandValidateResultsPath = path.join(commandValidateResult.rootDir, 'phases', 'phase-01', 'TEST_RESULTS.md');
    fs.writeFileSync(
      commandValidateResultsPath,
      fs.readFileSync(commandValidateResultsPath, 'utf8')
        .replace(/## Final result: pending/, '## Final result: pass')
        .replace(/## Commands run\n-/, '## Commands run\n- npm run smoke')
        .replace(/## Notes\n-/, '## Notes\n- Smoke test passed with no TypeScript errors.')
    );
    process.argv = ['node', 'manoa-validate.ts', `--package=${commandValidateResult.rootDir}`];
    runValidate();

    // Test: validate accepts meaningful evidence with a concrete scenario and observed result
    const scenarioValidatePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const scenarioValidateResult = await createArtifactPackage({ input: familySample, outDir: scenarioValidatePkg, zip: false });
    const scenarioValidateEvidencePath = path.join(scenarioValidateResult.rootDir, 'notes', 'scenario-proof.md');
    fs.mkdirSync(path.dirname(scenarioValidateEvidencePath), { recursive: true });
    fs.writeFileSync(
      scenarioValidateEvidencePath,
      'Scenario checked: parent assigns a task and verifies what the kid dashboard can see.\nObserved result: the package states that child users only see assigned or shared tasks, and parent approval still controls completion review.\nArtifact reviewed: phases/phase-01/PHASE_BRIEF.md.\nDecision made: reminder email delivery remains deferred.\n',
      'utf8'
    );
    const scenarioValidateReportPath = path.join(scenarioValidateResult.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let scenarioValidateReport = updateReport(fs.readFileSync(scenarioValidateReportPath, 'utf8'), 'pass', 'proceed');
    scenarioValidateReport = replaceEvidenceSection(scenarioValidateReport, ['- notes/scenario-proof.md']);
    fs.writeFileSync(scenarioValidateReportPath, scenarioValidateReport);
    const scenarioValidateResultsPath = path.join(scenarioValidateResult.rootDir, 'phases', 'phase-01', 'TEST_RESULTS.md');
    fs.writeFileSync(
      scenarioValidateResultsPath,
      fs.readFileSync(scenarioValidateResultsPath, 'utf8')
        .replace(/## Final result: pending/, '## Final result: pass')
        .replace(/## Manual checks completed\n-/, '## Manual checks completed\n- Verified child-visible task rules in PHASE_BRIEF.md')
        .replace(/## Notes\n-/, '## Notes\n- Parent approval boundary is explicit and kid dashboard scope is correct.')
    );
    process.argv = ['node', 'manoa-validate.ts', `--package=${scenarioValidateResult.rootDir}`];
    runValidate();

    // Test: validate rejects missing root testing files
    const missingTestingFilesPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultMissingTesting = await createArtifactPackage({ input: sample, outDir: missingTestingFilesPkg, zip: false });
    fs.unlinkSync(path.join(cliResultMissingTesting.rootDir, 'TESTING_STRATEGY.md'));
    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultMissingTesting.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject missing root testing files');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for missing root testing files');
    }

    // Test: validate rejects missing phase TEST_SCRIPT.md
    const missingTestScriptPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultMissingScript = await createArtifactPackage({ input: sample, outDir: missingTestScriptPkg, zip: false });
    fs.unlinkSync(path.join(cliResultMissingScript.rootDir, 'phases', 'phase-01', 'TEST_SCRIPT.md'));
    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultMissingScript.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject missing phase TEST_SCRIPT.md');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for missing TEST_SCRIPT.md');
    }

    // Test: validate rejects missing phase TEST_RESULTS.md
    const missingTestResultsPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultMissingResults = await createArtifactPackage({ input: sample, outDir: missingTestResultsPkg, zip: false });
    fs.unlinkSync(path.join(cliResultMissingResults.rootDir, 'phases', 'phase-01', 'TEST_RESULTS.md'));
    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultMissingResults.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject missing phase TEST_RESULTS.md');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for missing TEST_RESULTS.md');
    }

    // Test: validate rejects TEST_RESULTS.md defaulting to pass
    const defaultPassResultsPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultDefaultPass = await createArtifactPackage({ input: sample, outDir: defaultPassResultsPkg, zip: false });
    const defaultPassResultsPath = path.join(cliResultDefaultPass.rootDir, 'phases', 'phase-01', 'TEST_RESULTS.md');
    let defaultPassResults = fs.readFileSync(defaultPassResultsPath, 'utf8');
    defaultPassResults = defaultPassResults.replace(/## Final result: pending/, '## Final result: pass');
    fs.writeFileSync(defaultPassResultsPath, defaultPassResults);
    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultDefaultPass.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject TEST_RESULTS.md defaulting to pass');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for TEST_RESULTS.md defaulting to pass');
    }

    // Test: validate rejects generic fake test evidence in TEST_RESULTS.md
    const genericTestResultsPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultGenericResults = await createArtifactPackage({ input: sample, outDir: genericTestResultsPkg, zip: false });
    const genericTestResultsPath = path.join(cliResultGenericResults.rootDir, 'phases', 'phase-01', 'TEST_RESULTS.md');
    let genericTestResults = fs.readFileSync(genericTestResultsPath, 'utf8');
    genericTestResults = genericTestResults.replace(/## Notes\n-/, '## Notes\n- Looks good. No issues found.');
    fs.writeFileSync(genericTestResultsPath, genericTestResults);
    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultGenericResults.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject generic fake test evidence');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for generic fake test evidence');
    }

    // Test: validate rejects verification pass while TEST_RESULTS.md is pending
    const verifyPassTestsPendingPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultVerifyPassTestsPending = await createArtifactPackage({ input: sample, outDir: verifyPassTestsPendingPkg, zip: false });
    const verifyPassTestsPendingReportPath = path.join(cliResultVerifyPassTestsPending.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
    let verifyPassTestsPendingReport = updateReport(fs.readFileSync(verifyPassTestsPendingReportPath, 'utf8'), 'pass', 'proceed');
    verifyPassTestsPendingReport = verifyPassTestsPendingReport.replace(/- pending/, '- repo/manifest.json');
    fs.writeFileSync(verifyPassTestsPendingReportPath, verifyPassTestsPendingReport);
    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultVerifyPassTestsPending.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject verification pass while TEST_RESULTS.md is pending');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 when verification pass conflicts with pending test results');
    }

    // Test: validate rejects regression results defaulting to pass
    const regressionDefaultPassPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultRegressionDefaultPass = await createArtifactPackage({ input: sample, outDir: regressionDefaultPassPkg, zip: false });
    const regressionDefaultPassPath = path.join(cliResultRegressionDefaultPass.rootDir, 'regression-suite', 'REGRESSION_RESULTS_TEMPLATE.md');
    let regressionDefaultPassContent = fs.readFileSync(regressionDefaultPassPath, 'utf8');
    regressionDefaultPassContent = regressionDefaultPassContent.replace(/## Overall result: pending/, '## Overall result: pass');
    fs.writeFileSync(regressionDefaultPassPath, regressionDefaultPassContent);
    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultRegressionDefaultPass.rootDir}`];
    try {
      runValidate();
      assert(false, 'validate should reject regression results defaulting to pass');
    } catch (e) {
      assert((e as Error).message === 'process.exit:1', 'validate should exit with code 1 for regression results defaulting to pass');
    }

    // Test: validate catches malformed state
    const malformedPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
    const cliResultMalformed = await createArtifactPackage({ input: sample, outDir: malformedPkg, zip: false });
    const malformedStatePath = path.join(cliResultMalformed.rootDir, 'repo', 'manoa-state.json');
    const malformedState = JSON.parse(fs.readFileSync(malformedStatePath, 'utf8'));
    malformedState.currentPhase = 999;
    fs.writeFileSync(malformedStatePath, JSON.stringify(malformedState, null, 2));

    process.argv = ['node', 'manoa-validate.ts', `--package=${cliResultMalformed.rootDir}`];
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
  const noListedEvidenceAdvancePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const cliResultNoListedAdvance = await createArtifactPackage({ input: sample, outDir: noListedEvidenceAdvancePkg, zip: false });
  const noListedAdvanceStatePath = path.join(cliResultNoListedAdvance.rootDir, 'repo', 'manoa-state.json');
  const noListedAdvanceState = JSON.parse(fs.readFileSync(noListedAdvanceStatePath, 'utf8'));
  noListedAdvanceState.blockedPhases = [];
  fs.writeFileSync(noListedAdvanceStatePath, JSON.stringify(noListedAdvanceState, null, 2));
  const noListedAdvanceReportPath = path.join(cliResultNoListedAdvance.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let noListedAdvanceReport = updateReport(fs.readFileSync(noListedAdvanceReportPath, 'utf8'), 'pass', 'proceed');
  fs.writeFileSync(noListedAdvanceReportPath, noListedAdvanceReport);
  try {
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${cliResultNoListedAdvance.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
    runNextPhase();
    assert(false, 'next-phase should refuse to advance when the report does not list evidence files');
  } catch (e) {
    assert(
      (e as Error).message.includes('does not list any evidence files'),
      `next-phase error should mention missing report evidence files, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase rejects scaffold-only evidence files with template content
  const scaffoldOnlyAdvancePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const cliResultScaffoldOnlyAdvance = await createArtifactPackage({ input: sample, outDir: scaffoldOnlyAdvancePkg, zip: false });
  const scaffoldOnlyAdvanceStatePath = path.join(cliResultScaffoldOnlyAdvance.rootDir, 'repo', 'manoa-state.json');
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
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${cliResultScaffoldOnlyAdvance.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
    runNextPhase();
    assert(false, 'next-phase should reject scaffold-only evidence files that still contain template content');
  } catch (e) {
    assert(
      (e as Error).message.includes('EVIDENCE_CHECKLIST.md') || (e as Error).message.includes('HANDOFF_SUMMARY.md'),
      `next-phase should name scaffold evidence files that need more content, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase rejects listed evidence files that contain only comments
  const commentFileAdvancePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const cliResultCommentFileAdvance = await createArtifactPackage({ input: sample, outDir: commentFileAdvancePkg, zip: false });
  const commentFileAdvanceStatePath = path.join(cliResultCommentFileAdvance.rootDir, 'repo', 'manoa-state.json');
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
    process.argv = ['node', 'manoa-next-phase.ts', `--package=${cliResultCommentFileAdvance.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
    runNextPhase();
    assert(false, 'next-phase should reject evidence files that contain only comments or template text');
  } catch (e) {
    assert(
      (e as Error).message.includes('notes/comment-only.md'),
      `next-phase should name the bad evidence file, got: ${(e as Error).message}`
    );
  }

  // Test: next-phase accepts pass+proceed when the report lists a real existing evidence file
  const realEvidenceAdvancePkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
  const cliResultRealEvidenceAdvance = await createArtifactPackage({ input: sample, outDir: realEvidenceAdvancePkg, zip: false });
  const realEvidenceStatePath = path.join(cliResultRealEvidenceAdvance.rootDir, 'repo', 'manoa-state.json');
  const realEvidenceState = JSON.parse(fs.readFileSync(realEvidenceStatePath, 'utf8'));
  realEvidenceState.blockedPhases = [];
  fs.writeFileSync(realEvidenceStatePath, JSON.stringify(realEvidenceState, null, 2));
  const realEvidenceReportPath = path.join(cliResultRealEvidenceAdvance.rootDir, 'phases', 'phase-01', 'VERIFICATION_REPORT.md');
  let realEvidenceReport = updateReport(fs.readFileSync(realEvidenceReportPath, 'utf8'), 'pass', 'proceed');
  realEvidenceReport = realEvidenceReport.replace(/- pending/, '- repo/manifest.json');
  fs.writeFileSync(realEvidenceReportPath, realEvidenceReport);
  process.argv = ['node', 'manoa-next-phase.ts', `--package=${cliResultRealEvidenceAdvance.rootDir}`, '--evidence=phases/phase-01/VERIFICATION_REPORT.md'];
  runNextPhase();
  const realEvidenceAdvancedState = JSON.parse(fs.readFileSync(path.join(cliResultRealEvidenceAdvance.rootDir, 'repo', 'manoa-state.json'), 'utf8'));
  assert(realEvidenceAdvancedState.currentPhase === 2, 'next-phase should accept real listed evidence files that exist on disk');

  function captureStatusOutput(packagePath: string) {
    process.argv = ['node', 'manoa-status.ts', `--package=${packagePath}`];
    const logs: string[] = [];
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    runStatus();
    console.log = originalLog;
    return logs.join('\n');
  }

  function runValidateWithoutFailure(packagePath: string) {
    process.argv = ['node', 'manoa-validate.ts', `--package=${packagePath}`];
    runValidate();
  }

  // Test: fresh package shows scaffold evidence separately from report-listed evidence
  const freshStatusPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
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
  const blockedVerifiedPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
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
  const noEvidenceStatusPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
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
  const citedEvidenceStatusPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
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
  const missingEvidenceStatusPkg = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-'));
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
  const manualStatusStatePath = path.join(cliResult2.rootDir, 'repo', 'manoa-state.json');
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
  const familyPkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manoa-smoke-family-'));
  const familyCliResult = await createArtifactPackage({ input: familySample, outDir: familyPkgDir, zip: false });
  runValidateWithoutFailure(familyCliResult.rootDir);
  const familyStatusOutput = captureStatusOutput(familyCliResult.rootDir);
  assert(/Manoa Method Package Status/.test(familyStatusOutput), 'Family sample status should render successfully.');
  assert(/Family Task Board/i.test(familyStatusOutput), 'Family sample status should reference Family Task Board.');
  assert(/Current phase:/i.test(familyStatusOutput), 'Family sample status should show the current phase.');

  await runOrchestratorRegressionChecks();

  console.log(
    `Smoke test passed with ${bundle.files.length} files in ${bundle.phases.length} phases and verified Codex, Claude Code, and OpenCode packets, verification files, state files, lifecycle, warnings, next-phase behavior, parser consistency, validate, status, CLI parity, and the orchestrator repo-scan/gate/score/recovery loop.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
