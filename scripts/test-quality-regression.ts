import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProjectBundle as _rawGenerateProjectBundle } from '../lib/generator';
import { baseProjectInput } from '../lib/templates';
import { createArtifactPackage } from './mvp-builder-create-project';
import { runValidate } from './mvp-builder-validate';
import { runOrchestratorRegressionChecks } from './orchestrator-test-utils';
import { synthesizeExtractions } from './synthesize-research-ontology';
import type { ResearchExtractions } from '../lib/research/schema';
import type { ProjectInput } from '../lib/types';

// Phase A3c: every quality-regression USE_CASE is now exercised through the
// research-driven path. Synthesized research extractions populate entities/
// actors/workflows the same way an end-user agent run would; the legacy
// archetype keyword router is gone, so leaving extractions out would render
// the generic 'general' baseline and the assertions below would be moot.
function generateProjectBundle(
  input: ProjectInput,
  options?: { extractions?: ResearchExtractions }
): ReturnType<typeof _rawGenerateProjectBundle> {
  const extractions = options?.extractions ?? synthesizeExtractions(input);
  return _rawGenerateProjectBundle(input, { extractions });
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
      'north-star': 'test',
      'primary-workflow': 'test',
      'scope-cut': 'test',
      acceptance: 'test',
      'operating-risks': 'test'
    };
  }

  return input;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function getFile(bundle: ReturnType<typeof generateProjectBundle>, pathName: string) {
  return bundle.files.find((file) => file.path === pathName)?.content || '';
}

function extractSectionHeadings(content: string) {
  return Array.from(content.matchAll(/^##\s+(.+)$/gm)).map((match) => match[1].trim());
}

function extractBulletValues(content: string, prefix: string) {
  return Array.from(content.matchAll(new RegExp(`- ${prefix}: (.+)`, 'g'))).map((match) => match[1].trim());
}

export const USE_CASES = [
  {
    name: 'Family Task Board',
    key: 'fta',
    input: buildAnsweredInput({
      productName: 'Family Task Board',
      level: 'intermediate',
      track: 'technical',
      productIdea:
        'A shared family task board that helps parents and kids manage chores, reminders, and household responsibilities without overcomplicating visibility rules.',
      targetAudience:
        'Parents, co-parents, caregivers, and children aged 6-14 who need visible but safe task tracking.',
      problemStatement:
        'Household tasks are forgotten, reassigned in conversations, and children do not know what they are responsible for without constant parent reminders.',
      constraints:
        'Keep the first release local-first and markdown-first. Child visibility must be explicit. No cloud auth or payments.',
      mustHaveFeatures:
        'Family task board, child-safe views, parent approval for completion, recurring chores, reminder notes, handoff workflow.',
      dataAndIntegrations:
        'Family members, tasks, completion states, reminder preferences, household roles, and optional local file links.',
      risks:
        'Child visibility could expose too much, parent approval could become a bottleneck, and outdated tasks could create household confusion.',
      successMetrics:
        'A reviewer can see what a child user sees, what a parent controls, and what the handoff workflow looks like without hidden assumptions.',
      nonGoals: 'No external chat, no payment integration, no complex gamification.',
      questionnaireAnswers: {
        'north-star':
          'The first release must prove that a family can assign, complete, and hand off tasks with explicit child visibility and parent controls.',
        'primary-workflow':
          'A parent creates a task, assigns it to a child, the child marks it complete, a parent reviews and approves, and the task moves to done.',
        'data-boundaries':
          'Important boundaries include family members, task visibility per role, completion state, approval state, and reminder content.',
        'scope-cut':
          'Keep family task creation, assignment, completion, and parent approval in v1. Defer gamification, external integrations, and complex recurring logic.',
        acceptance:
          'A skeptical reviewer should be able to identify the minimum child-visible state, the parent approval boundary, and the handoff trigger without extra chat context.',
        'operating-risks':
          'The biggest risks are child visibility mistakes, parent approval bottlenecks, and outdated task lists.',
        'deployment-guardrails':
          'Keep the package local-first and force explicit child-visibility review before anything sounds production ready.',
        'test-proof':
          'Reviewers should capture child-view and parent-approval scenarios with observed results before advancement.'
      }
    })
  },
  {
    name: 'Privvy Family Readiness',
    key: 'pfr',
    input: buildAnsweredInput({
      productName: 'Privvy Family Readiness',
      level: 'advanced',
      track: 'business',
      productIdea:
        'A family readiness workspace that helps households organize emergency contacts, important documents, and clear next steps without overclaiming legal or emergency authority.',
      targetAudience:
        'Parent organizers, co-parents, trusted caregivers, and adult family members responsible for readiness plans.',
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
  },
  {
    name: 'SDR Sales Module',
    key: 'sdr',
    input: buildAnsweredInput({
      productName: 'SDR Sales Module',
      level: 'intermediate',
      track: 'business',
      productIdea:
        'A sales development workspace that helps SDRs qualify leads, score engagement, and hand off qualified prospects to account executives with clear context.',
      targetAudience: 'SDRs, sales managers, and account executives.',
      problemStatement:
        'Lead qualification is inconsistent, rep handoffs lose context, and follow-up rules are vague, which causes pipeline gaps and missed opportunities.',
      constraints:
        'Keep the first release simple and focused on qualification signals, handoff rules, and follow-up tracking.',
      mustHaveFeatures:
        'Lead qualification criteria, engagement scoring, rep handoff checklist, follow-up rules, blocked-lead review, pipeline status.',
      dataAndIntegrations: 'Leads, qualification scores, rep assignments, follow-up history, pipeline stages.',
      risks:
        'Qualification criteria could stay vague, handoffs could lose critical context, and follow-up could become inconsistent.',
      successMetrics:
        'A reviewer can trace qualification signals, handoff content, and follow-up behavior with clear evidence.',
      nonGoals: 'No CRM integration, no automated outreach, no forecasting.',
      questionnaireAnswers: {
        'north-star':
          'The first release must prove that lead qualification, scoring, and rep handoff are explicit and reviewable.',
        'primary-workflow':
          'An SDR reviews a lead, applies qualification criteria, scores engagement, prepares handoff context, and passes qualified leads to an AE.',
        'scope-cut':
          'Keep qualification, scoring, and handoff in v1. Defer CRM integrations, automated outreach, and forecasting.',
        acceptance:
          'A skeptical reviewer should be able to identify the minimum qualification signal, the exact handoff content, and the follow-up rule without hidden assumptions.',
        'operating-risks':
          'The biggest risks are vague qualification criteria, lost handoff context, and inconsistent follow-up.',
        'stakeholder-workflow':
          'SDRs own qualification, sales managers review pipeline health, and AEs accept or reject handoffs.',
        'adoption-risks':
          'SDRs may resist structured qualification, and AEs may distrust handoff quality if context is thin.'
      }
    })
  },
  {
    name: 'Local Restaurant Ordering',
    key: 'lro',
    input: buildAnsweredInput({
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
      risks:
        'Kitchen workflow confusion, pickup delays, and unclear order status could break trust quickly.',
      successMetrics:
        'A reviewer can understand how an order moves from creation to kitchen acknowledgment to pickup and what evidence proves failure handling.',
      nonGoals: 'No delivery, no loyalty program, no marketplace integrations.',
      questionnaireAnswers: {
        'north-star':
          'The release must prove that pickup ordering and kitchen handoff are clear and reviewable.',
        'primary-workflow':
          'A customer places a pickup order, staff confirm it, the kitchen acknowledges it, the order moves to ready state, and the customer picks it up.',
        'scope-cut':
          'Keep pickup ordering, order states, and kitchen handoff in v1. Defer delivery, rewards, and complex integrations.',
        acceptance:
          'A reviewer should be able to trace order states, kitchen responsibility, and pickup communication without hidden assumptions.',
        'operating-risks':
          'The main risks are missed order states, kitchen confusion, and bad pickup updates.',
        'customer-pain':
          'Customers do not know when their order is ready, and staff do not have a clear queue.',
        'business-proof':
          'Fewer missed orders, clearer kitchen workflow, and happier pickup customers.'
      }
    })
  },
  {
    name: 'Household Budget Planner',
    key: 'bud',
    input: buildAnsweredInput({
      productName: 'Household Budget Planner',
      level: 'beginner',
      track: 'business',
      productIdea:
        'A simple household budgeting workspace that helps families track income, spending categories, and monthly review without claiming financial advice.',
      targetAudience:
        'Household budget managers, partners sharing finances, and family members reviewing spending together.',
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
          'The main risks are financial advice overclaim, sensitive budget data exposure, and household conflict over spending.',
        'customer-pain':
          'Households do not know where money goes and miss irregular bills.',
        'business-proof':
          'Clearer spending awareness, fewer missed bills, and better household alignment.'
      }
    })
  },
  {
    name: 'Small Clinic Scheduler',
    key: 'cln',
    input: buildAnsweredInput({
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
          'Reviewers should capture conflict scenarios, reminder wording checks, and observed scheduling outcomes before advancement.',
        'failure-modes':
          'Key failure modes include double-booking, reminder content leaks, missing conflict resolution, and stale provider availability.',
        'observability':
          'The package should define what to log about scheduling changes, what support issues to watch, and what signals show scheduling safety.',
        'scaling-risk':
          'The main scaling risks are large clinic rosters, many concurrent appointments, and future integration drift if boundaries stay vague.'
      }
    })
  },
  {
    name: 'HOA Maintenance Portal',
    key: 'hoa',
    input: buildAnsweredInput({
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
        'operating-risks': 'Request stall risk is main concern.',
        'user-segments': 'Residents submit, board triages, vendors resolve.',
        'stakeholder-workflow':
          'Residents need visibility, board needs control, vendors need clear assignments.'
      }
    })
  },
  {
    name: 'School Club Portal',
    key: 'scl',
    input: buildAnsweredInput({
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
        'operating-risks': 'Student privacy is the main risk.',
        'repo-shape':
          'A simple web app with club pages, event listings, and announcement feeds.',
        'test-proof':
          'Reviewers should verify student visibility rules and event creation flow.'
      }
    })
  },
  {
    name: 'Event Volunteer Manager',
    key: 'vlt',
    input: buildAnsweredInput({
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
        'operating-risks': 'No-show risk is main concern.',
        'customer-pain':
          'Organizers scramble to fill shifts at the last minute and do not know who showed up.',
        'business-proof':
          'Fewer unfilled shifts, clearer attendance records, and less day-of chaos.'
      }
    })
  },
  {
    name: 'Small Business Inventory',
    key: 'inv',
    input: buildAnsweredInput({
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
        'Low-stock thresholds may be unclear, adjustments may not be trustworthy, and the package could drift into irrelevant finance or unrelated domain concerns.',
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
  }
];

async function main() {
  console.log('Running quality regression suite for 10 use cases...\n');

  let failures = 0;

  for (const useCase of USE_CASES) {
    console.log(`Checking ${useCase.name}...`);
    const bundle = generateProjectBundle(useCase.input);
    const allContent = bundle.files.map((file) => file.content).join('\n');
    const phasePlan = bundle.files.find((f) => f.path === 'PHASE_PLAN.md')?.content || '';
    const businessStart = getFile(bundle, 'BUSINESS_USER_START_HERE.md');
    const startHere = getFile(bundle, 'START_HERE.md');
    const readme = getFile(bundle, 'README.md');
    const stepGuide = getFile(bundle, 'STEP_BY_STEP_BUILD_GUIDE.md');
    const moduleMap = getFile(bundle, 'MODULE_MAP.md');
    const promptGuide = getFile(bundle, 'COPY_PASTE_PROMPTS.md');
    const ignoreGuide = getFile(bundle, 'WHAT_TO_IGNORE_FOR_NOW.md');
    const currentStatus = getFile(bundle, 'CURRENT_STATUS.md');
    const finalChecklist = getFile(bundle, 'FINAL_CHECKLIST.md');
    const uiGate = getFile(bundle, 'ui-ux/UI_UX_GATE.md');
    const uiPrompt = getFile(bundle, 'ui-ux/SCREENSHOT_REVIEW_PROMPT.md');
    const recursiveStart = getFile(bundle, 'recursive-test/RECURSIVE_TEST_START_HERE.md');
    const recursivePrompt = getFile(bundle, 'recursive-test/RECURSIVE_TEST_PROMPT.md');
    const scoringRubric = getFile(bundle, 'recursive-test/SCORING_RUBRIC.md');
    const recursiveReport = getFile(bundle, 'recursive-test/RECURSIVE_TEST_REPORT.md');
    const autoImproveProgram = getFile(bundle, 'auto-improve/PROGRAM.md');
    const autoImproveResults = getFile(bundle, 'auto-improve/results.tsv');
    const productNorthStar = getFile(bundle, 'product-strategy/PRODUCT_NORTH_STAR.md');
    const mvpScope = getFile(bundle, 'product-strategy/MVP_SCOPE.md');
    const functionalRequirements = getFile(bundle, 'requirements/FUNCTIONAL_REQUIREMENTS.md');
    const acceptanceCriteria = getFile(bundle, 'requirements/ACCEPTANCE_CRITERIA.md');
    const openQuestions = getFile(bundle, 'requirements/OPEN_QUESTIONS.md');
    const dataClassification = getFile(bundle, 'security-risk/DATA_CLASSIFICATION.md');
    const secretManagement = getFile(bundle, 'security-risk/SECRET_MANAGEMENT.md');
    const externalServices = getFile(bundle, 'integrations/EXTERNAL_SERVICES.md');
    const environmentVariables = getFile(bundle, 'integrations/ENVIRONMENT_VARIABLES.md');
    const mockingStrategy = getFile(bundle, 'integrations/MOCKING_STRATEGY.md');
    const systemOverview = getFile(bundle, 'architecture/SYSTEM_OVERVIEW.md');
    const dataModel = getFile(bundle, 'architecture/DATA_MODEL.md');

    // 1. Domain-correct phase 1 name. Phase A3c: archetype-templated phase names
    //    (e.g. "Sales qualification brief") came from the deleted keyword-router
    //    blueprints. The research-driven path emits phase names anchored in the
    //    product's brief, so checking for product-name or domain-keyword overlap
    //    is the right structural assertion.
    const phase1Name = bundle.phases[0]?.name || '';
    const expectedPhase1Patterns: Record<string, RegExp> = {
      fta: /family|task|child|parent|household/i,
      pfr: /readiness|emergency|legal|boundary|privvy|family/i,
      sdr: /sdr|sales|lead|qualification|prospect|pipeline/i,
      lro: /restaurant|ordering|pickup|menu|kitchen|local/i,
      bud: /budget|income|expense|spending|household/i,
      cln: /clinic|scheduling|patient|provider|appointment/i,
      hoa: /hoa|maintenance|request|resident|vendor/i,
      scl: /school|student|club|membership|portal/i,
      vlt: /volunteer|shift|check-in|event|manager/i,
      inv: /inventory|stock|threshold|adjustment|business/i
    };

    if (!expectedPhase1Patterns[useCase.key].test(phase1Name)) {
      console.error(
        `  FAIL: Phase 1 name "${phase1Name}" does not match expected domain pattern for ${useCase.name}.`
      );
      failures++;
    } else {
      console.log(`  Phase 1 OK: ${phase1Name}`);
    }

    // 2. Non-SDR packages must not contain SDR language
    if (useCase.key !== 'sdr') {
      if (/sales qualification brief/i.test(allContent)) {
        console.error(`  FAIL: ${useCase.name} contains "sales qualification brief".`);
        failures++;
      }
      if (/rep handoff/i.test(allContent)) {
        console.error(`  FAIL: ${useCase.name} contains "rep handoff".`);
        failures++;
      }
      if (/blocked-lead review/i.test(allContent)) {
        console.error(`  FAIL: ${useCase.name} contains "blocked-lead review".`);
        failures++;
      }
    }

    // 3. Non-clinic packages must not contain clinical language
    if (useCase.key !== 'cln') {
      if (/clinical details/i.test(allContent)) {
        console.error(`  FAIL: ${useCase.name} contains "clinical details".`);
        failures++;
      }
      if (/provider availability/i.test(allContent)) {
        console.error(`  FAIL: ${useCase.name} contains "provider availability".`);
        failures++;
      }
      if (/reminder privacy/i.test(allContent)) {
        console.error(`  FAIL: ${useCase.name} contains "reminder privacy".`);
        failures++;
      }
    }

    // 4. No truncated text fragments
    if (/know the\.\.\./i.test(allContent)) {
      console.error(`  FAIL: ${useCase.name} contains truncated "know the...." anchor.`);
      failures++;
    }
    if (/minimum event and\.\.\./i.test(allContent)) {
      console.error(`  FAIL: ${useCase.name} contains truncated "minimum event and...." anchor.`);
      failures++;
    }

    // 5. No score overclaim for blocked packages
    if (bundle.lifecycleStatus === 'Blocked' && bundle.score.total > 80) {
      console.error(
        `  FAIL: Blocked package ${useCase.name} scores ${bundle.score.total}/100, which overclaims readiness.`
      );
      failures++;
    }

    // 6. No generic fake evidence acceptance
    // (This is covered by the validation engine in the main smoke test)

    // 7. Requirements must use the structured actor/action/response/data/failure/outcome format
    if (!/Actor:/i.test(functionalRequirements) || !/User action:/i.test(functionalRequirements) || !/System response:/i.test(functionalRequirements) || !/Stored data:/i.test(functionalRequirements) || !/Failure case:/i.test(functionalRequirements) || !/Testable outcome:/i.test(functionalRequirements)) {
      console.error(`  FAIL: ${useCase.name} functional requirements did not use the structured requirement format.`);
      failures++;
    }
    if (/cannot complete the core workflow without/i.test(functionalRequirements)) {
      console.error(`  FAIL: ${useCase.name} still contains the generic "why it matters" fallback.`);
      failures++;
    }
    if (/system stores the result correctly/i.test(functionalRequirements)) {
      console.error(`  FAIL: ${useCase.name} still contains the generic requirement fallback behavior.`);
      failures++;
    }

    // 8. Acceptance criteria must be concrete Given/When/Then plus negative case and verification
    const givenCount = (acceptanceCriteria.match(/- Given:/g) || []).length;
    const whenCount = (acceptanceCriteria.match(/- When:/g) || []).length;
    const thenCount = (acceptanceCriteria.match(/- Then:/g) || []).length;
    const negativeCount = (acceptanceCriteria.match(/- Negative case:/g) || []).length;
    const verificationCount = (acceptanceCriteria.match(/- Verification method:/g) || []).length;
    if (givenCount === 0 || whenCount === 0 || thenCount === 0 || negativeCount === 0 || verificationCount === 0) {
      console.error(`  FAIL: ${useCase.name} acceptance criteria are missing Given/When/Then, negative case, or verification sections.`);
      failures++;
    }
    if (/can use .* realistic data and see the expected result/i.test(acceptanceCriteria)) {
      console.error(`  FAIL: ${useCase.name} still contains the generic acceptance fallback.`);
      failures++;
    }
    const evidenceLines = extractBulletValues(acceptanceCriteria, 'Evidence required');
    if (evidenceLines.length > 1 && new Set(evidenceLines).size !== evidenceLines.length) {
      console.error(`  FAIL: ${useCase.name} acceptance criteria reuse identical evidence lines.`);
      failures++;
    }

    // 9. Data model and classification must reject fake entities created from fields or integrations
    const dataModelHeadings = extractSectionHeadings(dataModel);
    const fakeEntityPatterns = [
      /Due Dates/i,
      /Reminder Preferences/i,
      /Priority$/i,
      /Task Status$/i,
      /Completion States/i,
      /Email Reminder Service/i,
      /Optional Local File Links/i
    ];
    if (dataModelHeadings.some((heading) => fakeEntityPatterns.some((pattern) => pattern.test(heading)))) {
      console.error(`  FAIL: ${useCase.name} data model still contains fake entities derived from fields or integrations.`);
      failures++;
    }
    if (/##\s+Email Reminder Service/i.test(dataClassification)) {
      console.error(`  FAIL: ${useCase.name} data classification treated an integration like a top-level data entity.`);
      failures++;
    }

    // 10. Integrations must not be invented and architecture must stay product-specific
    if (/## Payments provider/i.test(externalServices) && /(No payment|No billing|No checkout|No payment processing)/i.test(useCase.input.nonGoals)) {
      console.error(`  FAIL: ${useCase.name} invented a payments integration that is explicitly out of scope.`);
      failures++;
    }
    if (/## External API/i.test(externalServices) && !/api/i.test(useCase.input.dataAndIntegrations + useCase.input.mustHaveFeatures + useCase.input.constraints)) {
      console.error(`  FAIL: ${useCase.name} invented a generic external API integration.`);
      failures++;
    }
    if (/guided root docs|phase packets|support folders|the mvp-builder workspace itself/i.test(systemOverview)) {
      console.error(`  FAIL: ${useCase.name} architecture still describes the workspace instead of the product.`);
      failures++;
    }

    // 11. Cross-file coherence: each USE_CASE bundle is generated with synthesized
    //     research extractions, so entity names come from the brief's must-haves
    //     rather than archetype blueprints. Confirm at least one synthesized
    //     entity name appears coherently across data-model, requirements, and
    //     system-overview — without pinning to specific archetype-templated names
    //     that no longer exist after A3c.
    const synthesized = synthesizeExtractions(useCase.input);
    const coherentlyMentioned = synthesized.entities.some((entity) => {
      const pattern = new RegExp(entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return pattern.test(dataModel) && pattern.test(functionalRequirements) && pattern.test(systemOverview);
    });
    if (!coherentlyMentioned && synthesized.entities.length > 0) {
      console.error(`  FAIL: ${useCase.name} did not keep any synthesized entity coherent across requirements, architecture, and data model.`);
      failures++;
    }

    // RC2: synthesized extractions must stamp meta.researchSource = 'synthesized'
    // so the audit's demoReady rule can correctly reject synth output as
    // client/demo-ready material. If this drifts, demoReady=true could leak
    // through for synth workspaces.
    if (synthesized.meta.researchSource !== 'synthesized') {
      console.error(`  FAIL: ${useCase.name} synthesized extractions have meta.researchSource=${synthesized.meta.researchSource}, expected 'synthesized'.`);
      failures++;
    }
    // RC2: synth must NOT populate ideaCritique or competingAlternatives — those
    // are real-recipe-only artifacts. The audit credits them only for
    // researchSource ∈ {agent-recipe, imported-real, manual}.
    if ((synthesized.meta.discovery?.ideaCritique ?? []).length !== 0) {
      console.error(`  FAIL: ${useCase.name} synthesized ideaCritique should be empty (got ${synthesized.meta.discovery?.ideaCritique?.length}).`);
      failures++;
    }
    if ((synthesized.meta.discovery?.competingAlternatives ?? []).length !== 0) {
      console.error(`  FAIL: ${useCase.name} synthesized competingAlternatives should be empty (got ${synthesized.meta.discovery?.competingAlternatives?.length}).`);
      failures++;
    }

    const requiredModuleFiles = [
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
      'architecture/ARCHITECTURE_GATE.md',
      'BUSINESS_USER_START_HERE.md',
      'COPY_PASTE_PROMPTS.md',
      'MODULE_MAP.md',
      'CURRENT_STATUS.md',
      'WHAT_TO_IGNORE_FOR_NOW.md',
      'FINAL_CHECKLIST.md',
      'ui-ux/UI_UX_START_HERE.md',
      'ui-ux/USER_WORKFLOWS.md',
      'ui-ux/SCREEN_INVENTORY.md',
      'ui-ux/UX_REVIEW_CHECKLIST.md',
      'ui-ux/UI_IMPLEMENTATION_GUIDE.md',
      'ui-ux/ACCESSIBILITY_CHECKLIST.md',
      'ui-ux/RESPONSIVE_DESIGN_CHECKLIST.md',
      'ui-ux/SCREENSHOT_REVIEW_PROMPT.md',
      'ui-ux/UI_UX_GATE.md',
      'ui-ux/UI_UX_HANDOFF.md',
      'recursive-test/RECURSIVE_TEST_START_HERE.md',
      'recursive-test/RECURSIVE_TEST_PROMPT.md',
      'recursive-test/SCORING_RUBRIC.md',
      'recursive-test/TEST_CASE_SELECTION_GUIDE.md',
      'recursive-test/ITERATION_LOG.md',
      'recursive-test/FAILURE_TAXONOMY.md',
      'recursive-test/RECURSIVE_TEST_REPORT.md',
      'recursive-test/RECURSIVE_FIX_GUIDE.md',
      'recursive-test/REGRESSION_RECHECK_GUIDE.md',
      'recursive-test/FINAL_QUALITY_GATE.md',
      'auto-improve/PROGRAM.md',
      'auto-improve/QUALITY_RUBRIC.md',
      'auto-improve/SCORECARD.md',
      'auto-improve/RUN_LOOP.md',
      'auto-improve/results.tsv'
    ];
    for (const filePath of requiredModuleFiles) {
      if (!bundle.files.some((file) => file.path === filePath)) {
        console.error(`  FAIL: ${useCase.name} is missing required module file ${filePath}.`);
        failures++;
      }
    }

    if (!/ui-ux\/UI_UX_START_HERE\.md/i.test(startHere) || !/recursive-test\/RECURSIVE_TEST_START_HERE\.md/i.test(startHere)) {
      console.error(`  FAIL: ${useCase.name} START_HERE.md does not reference both new modules.`);
      failures++;
    }
    if (!/Product Goal and Scope/i.test(startHere) || !/What the App Must Do/i.test(startHere)) {
      console.error(`  FAIL: ${useCase.name} START_HERE.md does not explain the Decide support modules clearly.`);
      failures++;
    }
    if (!/do not need to open every folder/i.test(startHere)) {
      console.error(`  FAIL: ${useCase.name} START_HERE.md does not tell users they do not need to open every folder.`);
      failures++;
    }
    if (!/ui-ux\/UI_UX_START_HERE\.md/i.test(readme) || !/recursive-test\/RECURSIVE_TEST_START_HERE\.md/i.test(readme)) {
      console.error(`  FAIL: ${useCase.name} README.md does not reference both new modules.`);
      failures++;
    }
    if (!/Product Goal and Scope/i.test(readme) || !/Technical Plan/i.test(readme)) {
      console.error(`  FAIL: ${useCase.name} README.md does not explain the new Decide/Plan support modules.`);
      failures++;
    }
    if (!/## 1\. Decide/i.test(stepGuide) || !/## 2\. Plan/i.test(stepGuide) || !/## 3\. Design/i.test(stepGuide) || !/## 4\. Build/i.test(stepGuide) || !/## 5\. Test/i.test(stepGuide) || !/## 6\. Handoff/i.test(stepGuide) || !/UI\/UX review timing/i.test(stepGuide) || !/Recursive testing timing/i.test(stepGuide)) {
      console.error(`  FAIL: ${useCase.name} STEP_BY_STEP_BUILD_GUIDE.md does not explain both module workflows.`);
      failures++;
    }
    if (!/Product Goal and Scope/i.test(stepGuide) || !/What the App Must Do/i.test(stepGuide) || !/Private Data and Safety Check/i.test(stepGuide) || !/External Services and Setup/i.test(stepGuide) || !/Technical Plan/i.test(stepGuide)) {
      console.error(`  FAIL: ${useCase.name} STEP_BY_STEP_BUILD_GUIDE.md does not map the new modules into Decide and Plan.`);
      failures++;
    }
    if (!/## Required/i.test(moduleMap) || !/## Recommended/i.test(moduleMap) || !/## Optional/i.test(moduleMap) || !/## Not needed now/i.test(moduleMap)) {
      console.error(`  FAIL: ${useCase.name} MODULE_MAP.md is missing required classifications.`);
      failures++;
    }
    if (!/Product Goal and Scope/i.test(moduleMap) || !/What the App Must Do/i.test(moduleMap) || !/Private Data and Safety Check/i.test(moduleMap) || !/External Services and Setup/i.test(moduleMap) || !/Technical Plan/i.test(moduleMap)) {
      console.error(`  FAIL: ${useCase.name} MODULE_MAP.md is missing the new user-facing module names.`);
      failures++;
    }
    if (!/## 1\. Decide/i.test(promptGuide) || !/## 2\. Plan/i.test(promptGuide) || !/## 3\. Design/i.test(promptGuide) || !/## 4\. Build/i.test(promptGuide) || !/## 5\. Test/i.test(promptGuide) || !/## 6\. Handoff/i.test(promptGuide)) {
      console.error(`  FAIL: ${useCase.name} COPY_PASTE_PROMPTS.md does not include prompts in order.`);
      failures++;
    }
    if (!/Confirm Product Goal and Scope/i.test(promptGuide) || !/Confirm What the App Must Do/i.test(promptGuide) || !/Review Private Data and Safety/i.test(promptGuide) || !/Review External Services and Setup/i.test(promptGuide) || !/Review Technical Plan/i.test(promptGuide)) {
      console.error(`  FAIL: ${useCase.name} COPY_PASTE_PROMPTS.md is missing the new module prompts.`);
      failures++;
    }
    if (!/Safe to ignore right now/i.test(ignoreGuide)) {
      console.error(`  FAIL: ${useCase.name} WHAT_TO_IGNORE_FOR_NOW.md does not tell users what to ignore.`);
      failures++;
    }
    if (!/## Current stage/i.test(currentStatus) || !/## Current gate/i.test(currentStatus) || !/## Next action/i.test(currentStatus)) {
      console.error(`  FAIL: ${useCase.name} CURRENT_STATUS.md is missing required status fields.`);
      failures++;
    }
    if (!/Before you call this project done/i.test(finalChecklist)) {
      console.error(`  FAIL: ${useCase.name} FINAL_CHECKLIST.md is missing the plain-English finish check.`);
      failures++;
    }
    if (!/Screen and Workflow Review/i.test(businessStart)) {
      console.error(`  FAIL: ${useCase.name} beginner-facing docs do not rename UI/UX to Screen and Workflow Review.`);
      failures++;
    }
    if (!/Product Goal and Scope/i.test(businessStart) || !/What the App Must Do/i.test(businessStart) || !/Private Data and Safety Check/i.test(businessStart) || !/External Services and Setup/i.test(businessStart) || !/Technical Plan/i.test(businessStart)) {
      console.error(`  FAIL: ${useCase.name} beginner-facing docs do not use the new beginner module names.`);
      failures++;
    }
    if (!/Improve Until Good Enough Loop/i.test(businessStart) || !/Improve Until Good Enough Loop/i.test(recursiveStart)) {
      console.error(`  FAIL: ${useCase.name} beginner-facing docs do not rename recursive testing correctly.`);
      failures++;
    }
    if (!/For you:/i.test(businessStart) || !/Mostly for the AI agent:/i.test(businessStart)) {
      console.error(`  FAIL: ${useCase.name} beginner-facing docs do not distinguish user files from AI-agent files.`);
      failures++;
    }
    if (!/no screenshots provided for a ui project/i.test(uiGate) || !/## Auto-fail conditions/i.test(uiGate)) {
      console.error(`  FAIL: ${useCase.name} UI_UX_GATE.md is missing required auto-fail rules.`);
      failures++;
    }
    if (!/compare each screenshot/i.test(uiPrompt) || !/score each screen from 0 to 100/i.test(uiPrompt)) {
      console.error(`  FAIL: ${useCase.name} SCREENSHOT_REVIEW_PROMPT.md is missing screenshot scoring requirements.`);
      failures++;
    }
    if (!/score each use case from 0 to 100/i.test(recursivePrompt) || !/overall score >= 90/i.test(recursivePrompt)) {
      console.error(`  FAIL: ${useCase.name} RECURSIVE_TEST_PROMPT.md is missing the recursive scoring loop.`);
      failures++;
    }
    if (!/## Score cap rules/i.test(scoringRubric) || !/max score 69/i.test(scoringRubric)) {
      console.error(`  FAIL: ${useCase.name} SCORING_RUBRIC.md is missing score caps.`);
      failures++;
    }
    if (!/## Per-use-case scores/i.test(recursiveReport)) {
      console.error(`  FAIL: ${useCase.name} RECURSIVE_TEST_REPORT.md is missing per-use-case scores.`);
      failures++;
    }
    if (!/## Editable files/i.test(autoImproveProgram) || !/## Fixed files/i.test(autoImproveProgram)) {
      console.error(`  FAIL: ${useCase.name} auto-improve/PROGRAM.md is missing editable or fixed file boundaries.`);
      failures++;
    }
    if (!/keep the changes and commit them/i.test(autoImproveProgram) || !/discard your own edits/i.test(autoImproveProgram)) {
      console.error(`  FAIL: ${useCase.name} auto-improve/PROGRAM.md is missing keep or discard rules.`);
      failures++;
    }
    if (!/## Simplicity criterion/i.test(autoImproveProgram)) {
      console.error(`  FAIL: ${useCase.name} auto-improve/PROGRAM.md is missing the simplicity criterion.`);
      failures++;
    }
    if (!/Never weaken the rubric/i.test(autoImproveProgram)) {
      console.error(`  FAIL: ${useCase.name} auto-improve/PROGRAM.md does not forbid weakening the rubric or evaluator.`);
      failures++;
    }
    if (!/^timestamp\titeration\toverall_score\thard_cap\tdecision\tcommands_run\tchanged_files\tnotes/i.test(autoImproveResults)) {
      console.error(`  FAIL: ${useCase.name} auto-improve/results.tsv is missing the required header.`);
      failures++;
    }
    if (!/Plain-English product goal/i.test(productNorthStar) || !/What success looks like/i.test(productNorthStar) || !/What failure looks like/i.test(productNorthStar)) {
      console.error(`  FAIL: ${useCase.name} PRODUCT_NORTH_STAR.md is missing required sections.`);
      failures++;
    }
    if (!/Must-have features/i.test(mvpScope) || !/Later features/i.test(mvpScope) || !/Explicit non-goals/i.test(mvpScope)) {
      console.error(`  FAIL: ${useCase.name} MVP_SCOPE.md is missing required scope sections.`);
      failures++;
    }
    if (!/Clear pass\/fail check/i.test(acceptanceCriteria) || !/Evidence required/i.test(acceptanceCriteria)) {
      console.error(`  FAIL: ${useCase.name} ACCEPTANCE_CRITERIA.md is missing required acceptance sections.`);
      failures++;
    }
    if (!/Unresolved assumption/i.test(openQuestions) || !/Priority/i.test(openQuestions)) {
      console.error(`  FAIL: ${useCase.name} OPEN_QUESTIONS.md is missing required open-question fields.`);
      failures++;
    }
    if (!/Data types handled/i.test(dataClassification) || !/Sensitivity level/i.test(dataClassification)) {
      console.error(`  FAIL: ${useCase.name} DATA_CLASSIFICATION.md is missing required fields.`);
      failures++;
    }
    if (!/Expected secrets/i.test(secretManagement) || !/What must never be committed/i.test(secretManagement)) {
      console.error(`  FAIL: ${useCase.name} SECRET_MANAGEMENT.md is missing required fields.`);
      failures++;
    }
    if (!/Variable name/i.test(environmentVariables) || !/Local setup notes/i.test(environmentVariables)) {
      console.error(`  FAIL: ${useCase.name} ENVIRONMENT_VARIABLES.md is missing required fields.`);
      failures++;
    }
    if (!/What to mock before real credentials exist/i.test(mockingStrategy) || !/When to replace mocks with real services/i.test(mockingStrategy)) {
      console.error(`  FAIL: ${useCase.name} MOCKING_STRATEGY.md is missing required fields.`);
      failures++;
    }
    if (!/Simple architecture summary/i.test(systemOverview) || !/What is intentionally not included/i.test(systemOverview)) {
      console.error(`  FAIL: ${useCase.name} SYSTEM_OVERVIEW.md is missing required sections.`);
      failures++;
    }
    if (!/Entities/i.test(dataModel) || !/Sample records/i.test(dataModel)) {
      console.error(`  FAIL: ${useCase.name} DATA_MODEL.md is missing required sections.`);
      failures++;
    }

    console.log('');
  }

  const originalExit = process.exit;
  try {
    process.exit = (((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as typeof process.exit);

    const expectValidateFailure = async (label: string, mutate: (rootDir: string) => void, expectedPattern: RegExp) => {
      const pkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-builder-quality-'));
      const result = await createArtifactPackage({
        input: USE_CASES[0].input,
        outDir: pkgDir,
        zip: false,
        extractions: synthesizeExtractions(USE_CASES[0].input)
      });
      mutate(result.rootDir);
      process.argv = ['node', 'mvp-builder-validate.ts', `--package=${result.rootDir}`];
      try {
        runValidate();
        console.error(`  FAIL: ${label} was not rejected by validate.`);
        failures++;
      } catch (error) {
        if (!expectedPattern.test((error as Error).message)) {
          console.error(`  FAIL: ${label} produced the wrong validation failure: ${(error as Error).message}`);
          failures++;
        }
      }
    };

    await expectValidateFailure(
      'missing product north star',
      (rootDir) => fs.unlinkSync(path.join(rootDir, 'product-strategy', 'PRODUCT_NORTH_STAR.md')),
      /process\.exit:1/
    );

    await expectValidateFailure(
      'missing MVP scope sections',
      (rootDir) =>
        fs.writeFileSync(path.join(rootDir, 'product-strategy', 'MVP_SCOPE.md'), '# MVP_SCOPE\n\n- pending\n', 'utf8'),
      /process\.exit:1/
    );

    await expectValidateFailure(
      'missing acceptance criteria structure',
      (rootDir) =>
        fs.writeFileSync(path.join(rootDir, 'requirements', 'ACCEPTANCE_CRITERIA.md'), '# ACCEPTANCE_CRITERIA\n\n- pending\n', 'utf8'),
      /process\.exit:1/
    );

    await expectValidateFailure(
      'missing security review for sensitive project',
      (rootDir) => fs.unlinkSync(path.join(rootDir, 'security-risk', 'SECURITY_GATE.md')),
      /process\.exit:1/
    );

    await expectValidateFailure(
      'missing integrations for external-service project',
      (rootDir) => {
        const inputPath = path.join(rootDir, 'repo', 'input.json');
        const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        input.dataAndIntegrations = 'Stripe API, webhook events, email service';
        fs.writeFileSync(inputPath, JSON.stringify(input, null, 2), 'utf8');
        fs.unlinkSync(path.join(rootDir, 'integrations', 'INTEGRATION_GATE.md'));
      },
      /process\.exit:1/
    );

    await expectValidateFailure(
      'overbuilt architecture that contradicts MVP',
      (rootDir) =>
        fs.writeFileSync(
          path.join(rootDir, 'architecture', 'SYSTEM_OVERVIEW.md'),
          '# SYSTEM_OVERVIEW\n\n## Simple architecture summary\n- Use microservices, kubernetes, multi-region deployment, and an event bus for the MVP.\n\n## Main components\n- Many services\n\n## Data flow\n- Complex\n\n## User flow\n- Complex\n\n## Integration points\n- Many\n\n## What is intentionally not included\n- Nothing\n',
          'utf8'
        ),
      /process\.exit:1/
    );
  } finally {
    process.exit = originalExit;
  }

  await runOrchestratorRegressionChecks();

  // Summary
  console.log('========================================');
  if (failures === 0) {
    console.log('All quality regression checks passed.');
    process.exit(0);
  } else {
    console.log(`${failures} quality regression check(s) failed.`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
