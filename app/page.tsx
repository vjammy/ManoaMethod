'use client';

import { useMemo, useState } from 'react';
import { generateProjectBundle } from '@/lib/generator';
import { baseProjectInput } from '@/lib/templates';
import { buildWorkflowSteps, canApproveForBuild, canExportBuildReady, mapQuestionToStep } from '@/lib/workflow';
import type { ProjectInput, QuestionnaireItem, WarningItem } from '@/lib/types';
import type { WorkflowStepId } from '@/lib/workflow';

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-200">{props.label}</span>
      {props.multiline ? (
        <textarea
          className="min-h-28 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          disabled={props.disabled}
        />
      ) : (
        <input
          className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          disabled={props.disabled}
        />
      )}
      {props.helper ? <p className="text-xs text-slate-400">{props.helper}</p> : null}
    </label>
  );
}

function StatCard(props: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{props.value}</p>
      <p className="mt-2 text-sm text-slate-400">{props.helper}</p>
    </div>
  );
}

function LifecycleBadge(props: { status: string }) {
  const tone =
    props.status === 'ApprovedForBuild'
      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
      : props.status === 'ReviewReady'
        ? 'bg-sky-500/15 text-sky-200 border-sky-500/40'
        : props.status === 'Blocked'
          ? 'bg-rose-500/15 text-rose-200 border-rose-500/40'
          : 'bg-amber-500/15 text-amber-200 border-amber-500/40';

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{props.status}</span>;
}

function SeverityBadge(props: { severity: string }) {
  const tone =
    props.severity === 'blocker'
      ? 'bg-rose-500/15 text-rose-200 border-rose-500/40'
      : props.severity === 'warning'
        ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
        : 'bg-sky-500/15 text-sky-200 border-sky-500/40';

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{props.severity}</span>;
}

function StepStatusBadge(props: { status: string }) {
  const tone =
    props.status === 'Complete'
      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
      : props.status === 'Blocked'
        ? 'bg-rose-500/15 text-rose-200 border-rose-500/40'
        : 'bg-amber-500/15 text-amber-200 border-amber-500/40';

  return <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${tone}`}>{props.status}</span>;
}

function QuestionAnswerCard(props: {
  item: QuestionnaireItem;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{props.item.prompt}</h3>
          <p className="mt-2 text-sm text-slate-400">{props.item.helper}</p>
        </div>
        {props.item.required ? (
          <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">required</span>
        ) : null}
      </div>
      <textarea
        className="mt-4 min-h-28 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function WarningCard(props: { warning: WarningItem; stepTitle: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <SeverityBadge severity={props.warning.severity} />
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-300">
          {props.stepTitle}
        </span>
        <h3 className="text-base font-semibold text-white">{props.warning.title}</h3>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-300">{props.warning.message}</p>
      <p className="mt-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-amber-100">Next action: {props.warning.action}</p>
    </div>
  );
}

const briefFields: Array<{
  key: keyof ProjectInput;
  label: string;
  helper: string;
  multiline?: boolean;
}> = [
  { key: 'productName', label: 'Product name', helper: 'Name the project or working codename.' },
  {
    key: 'productIdea',
    label: 'Raw idea',
    helper: 'Describe the product in a few sentences. The app will critique vagueness.',
    multiline: true
  },
  {
    key: 'targetAudience',
    label: 'Audience',
    helper: 'Who is this for, who buys it, and who uses it day to day?',
    multiline: true
  },
  {
    key: 'problemStatement',
    label: 'Problem',
    helper: 'What pain exists today, and why is it costly or frustrating?',
    multiline: true
  },
  {
    key: 'desiredOutput',
    label: 'Desired output',
    helper: 'What should the final handoff let another builder accomplish?',
    multiline: true
  },
  {
    key: 'mustHaveFeatures',
    label: 'Must-have features',
    helper: 'Use commas or new lines. These drive phase scope and gates.',
    multiline: true
  },
  {
    key: 'niceToHaveFeatures',
    label: 'Nice-to-have features',
    helper: 'Capture later ideas without letting them leak into the MVP.',
    multiline: true
  },
  {
    key: 'nonGoals',
    label: 'Non-goals',
    helper: 'State what the MVP should not include.',
    multiline: true
  },
  {
    key: 'dataAndIntegrations',
    label: 'Data and integrations',
    helper: 'List the information sources, outputs, and integration boundaries.',
    multiline: true
  },
  {
    key: 'risks',
    label: 'Risks',
    helper: 'Note delivery, trust, privacy, support, or operational risks.',
    multiline: true
  },
  {
    key: 'constraints',
    label: 'Constraints',
    helper: 'Budget, time, compliance, architecture, or team limits.',
    multiline: true
  },
  {
    key: 'successMetrics',
    label: 'Success metrics',
    helper: 'How will you know the MVP is working well enough to keep building?',
    multiline: true
  },
  {
    key: 'timeline',
    label: 'Timeline',
    helper: 'Describe the timing pressure or rollout sequence.',
    multiline: true
  },
  {
    key: 'teamContext',
    label: 'Team context',
    helper: 'Who is planning, who is building, and who receives the handoff?',
    multiline: true
  }
];

const stepFileDefaults: Partial<Record<WorkflowStepId, string>> = {
  'project-brief': 'PROJECT_BRIEF.md',
  'mode-selection': 'PROJECT_BRIEF.md',
  'business-questions': 'QUESTIONNAIRE.md',
  'technical-questions': 'QUESTIONNAIRE.md',
  'risk-review': 'PLAN_CRITIQUE.md',
  'phase-plan': 'PHASE_PLAN.md',
  'approval-gate': '00_APPROVAL_GATE.md',
  'export-package': 'STEP_BY_STEP_BUILD_GUIDE.md'
};

function getReviewBucket(warnings: WarningItem[], severity: WarningItem['severity']) {
  return warnings.filter((warning) => warning.severity === severity);
}

export default function Home() {
  const [input, setInput] = useState<ProjectInput>(baseProjectInput());
  const [selectedPath, setSelectedPath] = useState('PROJECT_BRIEF.md');
  const [selectedStep, setSelectedStep] = useState<WorkflowStepId>('project-brief');

  const bundle = useMemo(() => generateProjectBundle(input), [input]);
  const workflowSteps = useMemo(() => buildWorkflowSteps(input, bundle), [input, bundle]);
  const selectedFile = bundle.files.find((file) => file.path === selectedPath) || bundle.files[0];
  const activeStep = workflowSteps.find((step) => step.id === selectedStep) || workflowSteps[0];
  const businessQuestions = bundle.questionnaire.filter((item) => mapQuestionToStep(item) === 'business-questions');
  const technicalQuestions = bundle.questionnaire.filter((item) => mapQuestionToStep(item) === 'technical-questions');
  const riskQuestions = bundle.questionnaire.filter((item) => mapQuestionToStep(item) === 'risk-review');
  const blockers = getReviewBucket(bundle.warnings, 'blocker');
  const warnings = getReviewBucket(bundle.warnings, 'warning');
  const infoItems = getReviewBucket(bundle.warnings, 'info');
  const approvalAllowed = canApproveForBuild(bundle) || bundle.approvedForBuild;
  const buildReadyExportAllowed = canExportBuildReady(bundle);

  function updateField<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function updateQuestionnaireAnswer(id: string, value: string) {
    setInput((current) => ({
      ...current,
      questionnaireAnswers: {
        ...current.questionnaireAnswers,
        [id]: value
      }
    }));
  }

  function loadSample() {
    setInput(baseProjectInput());
    setSelectedPath('PROJECT_BRIEF.md');
    setSelectedStep('project-brief');
  }

  function openStep(stepId: WorkflowStepId) {
    setSelectedStep(stepId);
    const defaultFile = stepFileDefaults[stepId];
    if (defaultFile) setSelectedPath(defaultFile);
  }

  async function downloadZip(kind: 'draft' | 'build-ready') {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      kind === 'draft'
        ? `${bundle.exportRoot}-draft-package.zip`
        : `${bundle.exportRoot}-approved-for-build-package.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const buildReadyReason =
    bundle.blockingWarnings.length > 0
      ? 'Build-ready export is unavailable because blocker warnings still exist. Resolve them in the mapped workflow steps first.'
      : !bundle.approvedForBuild
        ? bundle.lifecycleStatus === 'ReviewReady'
          ? 'The package is review-ready, but a human approval decision has not been recorded yet.'
          : 'The package still needs more planning work before it can move into explicit approval.'
        : bundle.lifecycleStatus !== 'ApprovedForBuild'
          ? 'The package has approval metadata, but it is not in the approved-for-build lifecycle state yet.'
          : 'The package is approved for build and can be exported as the implementation handoff.';

  const approvalReason =
    bundle.blockingWarnings.length > 0
      ? 'Approval is unavailable because blocker warnings still exist in earlier workflow steps.'
      : bundle.lifecycleStatus === 'Draft'
        ? 'Approval is unavailable because the package is still in draft and has not reached review-ready quality.'
        : bundle.lifecycleStatus === 'ReviewReady'
          ? 'Approval can be recorded now if the checklist is complete and the reviewer accepts the package.'
          : 'The package is already marked approved for build.';

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="rounded-[32px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_30%),linear-gradient(135deg,#0f172a,#020617)] p-8 shadow-2xl shadow-slate-950/30">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.35em] text-amber-300">Xelera Method</p>
              <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">
                Turn planning into a gated workflow before anyone starts building.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                The UI now walks through the project brief, questions, risk review, phase plan, approval gate, and export in order so the package feels like a method, not just a generator.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full border border-amber-300/50 bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                onClick={() => downloadZip('draft')}
              >
                Export draft zip
              </button>
              <button
                className={`rounded-full border px-5 py-3 text-sm font-semibold transition ${
                  buildReadyExportAllowed
                    ? 'border-emerald-300/50 bg-emerald-300 text-slate-950 hover:bg-emerald-200'
                    : 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-500'
                }`}
                onClick={() => downloadZip('build-ready')}
                disabled={!buildReadyExportAllowed}
              >
                Export build-ready zip
              </button>
              <button
                className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-500"
                onClick={loadSample}
              >
                Reset sample
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <StatCard
            label="Readiness Score"
            value={`${bundle.score.total}/100`}
            helper={`${bundle.score.rating}. ${bundle.score.blockers.length} blocker(s) currently flagged.`}
          />
          <StatCard label="Lifecycle" value={bundle.lifecycleStatus} helper={buildReadyReason} />
          <StatCard
            label="Workflow"
            value={`${workflowSteps.filter((step) => step.status === 'Complete').length}/${workflowSteps.length}`}
            helper="Each step now carries its own status so users can see where the package needs work."
          />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[0.3fr_0.7fr]">
          <aside className="space-y-6">
            <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Workflow steps</h2>
                  <p className="mt-2 text-sm text-slate-400">Work top to bottom. Each step shows whether it is complete, needs attention, or is blocked.</p>
                </div>
                <LifecycleBadge status={bundle.lifecycleStatus} />
              </div>
              <div className="mt-5 space-y-3">
                {workflowSteps.map((step, index) => (
                  <button
                    key={step.id}
                    className={`w-full rounded-3xl border p-4 text-left transition ${
                      selectedStep === step.id
                        ? 'border-amber-400 bg-amber-300/10'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
                    }`}
                    onClick={() => openStep(step.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-amber-300">Step {index + 1}</p>
                        <h3 className="mt-2 text-sm font-semibold text-white">{step.title}</h3>
                      </div>
                      <StepStatusBadge status={step.status} />
                    </div>
                    <p className="mt-3 text-xs leading-6 text-slate-400">{step.description}</p>
                    <p className="mt-3 text-xs leading-6 text-slate-300">{step.nextAction}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-2xl font-semibold text-white">Review panel</h2>
              <p className="mt-2 text-sm text-slate-400">Structured warnings are mapped to the step where they should be resolved.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Blockers</p>
                  <p className="mt-3 text-2xl font-semibold text-rose-200">{blockers.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Warnings</p>
                  <p className="mt-3 text-2xl font-semibold text-amber-200">{warnings.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Info</p>
                  <p className="mt-3 text-2xl font-semibold text-sky-200">{infoItems.length}</p>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                {[...blockers, ...warnings, ...infoItems].slice(0, 8).map((warning) => {
                  const step = workflowSteps.find((item) => item.warnings.some((candidate) => candidate.id === warning.id));
                  return <WarningCard key={warning.id} warning={warning} stepTitle={step?.title || 'Phase Plan'} />;
                })}
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-300">Current step</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{activeStep.title}</h2>
                  <p className="mt-2 text-sm text-slate-400">{activeStep.description}</p>
                </div>
                <StepStatusBadge status={activeStep.status} />
              </div>
              <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-sm font-semibold text-white">Next action</p>
                <p className="mt-2 text-sm leading-7 text-slate-300">{activeStep.nextAction}</p>
              </div>
            </div>

            {selectedStep === 'project-brief' ? (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
                <h2 className="text-2xl font-semibold text-white">Project Brief</h2>
                <p className="mt-2 text-sm text-slate-400">Capture the brief in enough detail that later phases can stay tied to the actual product and audience.</p>
                <div className="mt-6 grid gap-4">
                  {briefFields.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      helper={field.helper}
                      multiline={field.multiline}
                      value={input[field.key] as string}
                      onChange={(value) => updateField(field.key, value as ProjectInput[typeof field.key])}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {selectedStep === 'mode-selection' ? (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
                <h2 className="text-2xl font-semibold text-white">Mode Selection</h2>
                <p className="mt-2 text-sm text-slate-400">The selected mode changes the wording, depth of critique, gate strictness, and final handoff detail.</p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-slate-200">Experience level</span>
                    <select
                      className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400"
                      value={input.level}
                      onChange={(event) => updateField('level', event.target.value as ProjectInput['level'])}
                    >
                      <option value="beginner">beginner</option>
                      <option value="intermediate">intermediate</option>
                      <option value="advanced">advanced</option>
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-slate-200">Orientation</span>
                    <select
                      className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400"
                      value={input.track}
                      onChange={(event) => updateField('track', event.target.value as ProjectInput['track'])}
                    >
                      <option value="business">business</option>
                      <option value="technical">technical</option>
                    </select>
                  </label>
                </div>
                <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                  <p className="text-sm font-semibold text-white">{bundle.profile.label}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{bundle.profile.description}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <p className="text-sm text-slate-300">Question wording: {bundle.profile.wordingStyle}</p>
                    <p className="text-sm text-slate-300">Critique depth: {bundle.profile.critiqueDepth}</p>
                    <p className="text-sm text-slate-300">Gate strength: {bundle.profile.gateStrength}</p>
                    <p className="text-sm text-slate-300">Handoff detail: {bundle.profile.handoffDetail}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {selectedStep === 'business-questions' ? (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
                <h2 className="text-2xl font-semibold text-white">Business Questions</h2>
                <p className="mt-2 text-sm text-slate-400">These questions shape audience clarity, value, stakeholder workflow, and approval expectations.</p>
                <div className="mt-6 space-y-4">
                  {businessQuestions.map((item) => (
                    <QuestionAnswerCard
                      key={item.id}
                      item={item}
                      value={input.questionnaireAnswers[item.id] || ''}
                      onChange={(value) => updateQuestionnaireAnswer(item.id, value)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {selectedStep === 'technical-questions' ? (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
                <h2 className="text-2xl font-semibold text-white">Technical Questions</h2>
                <p className="mt-2 text-sm text-slate-400">These questions shape boundaries, failure modes, testing proof, deployment expectations, and technical approval confidence.</p>
                <div className="mt-6 space-y-4">
                  {technicalQuestions.map((item) => (
                    <QuestionAnswerCard
                      key={item.id}
                      item={item}
                      value={input.questionnaireAnswers[item.id] || ''}
                      onChange={(value) => updateQuestionnaireAnswer(item.id, value)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {selectedStep === 'risk-review' ? (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
                <h2 className="text-2xl font-semibold text-white">Risk Review</h2>
                <p className="mt-2 text-sm text-slate-400">This is the critique step. It should make it obvious why the package is blocked, draft, or ready for review.</p>
                <div className="mt-6 space-y-4">
                  {riskQuestions.length ? (
                    riskQuestions.map((item) => (
                      <QuestionAnswerCard
                        key={item.id}
                        item={item}
                        value={input.questionnaireAnswers[item.id] || ''}
                        onChange={(value) => updateQuestionnaireAnswer(item.id, value)}
                      />
                    ))
                  ) : null}
                  {bundle.critique.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <SeverityBadge severity={item.severity === 'critical' ? 'blocker' : item.severity === 'important' ? 'warning' : 'info'} />
                        <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-slate-300">{item.detail}</p>
                      <p className="mt-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-amber-100">Follow-up: {item.followUpQuestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedStep === 'phase-plan' ? (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
                <h2 className="text-2xl font-semibold text-white">Phase Plan</h2>
                <p className="mt-2 text-sm text-slate-400">Review the phase sequence, gate logic, and file-level package outputs before asking for approval.</p>
                <div className="mt-5 space-y-4">
                  {bundle.phases.map((phase) => (
                    <div key={phase.slug} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Phase {phase.index}</p>
                          <h3 className="mt-2 text-lg font-semibold text-white">{phase.name}</h3>
                          <p className="mt-3 text-sm leading-7 text-slate-300">{phase.goal}</p>
                        </div>
                        <button
                          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-white transition hover:border-amber-400"
                          onClick={() => setSelectedPath(`phases/${phase.slug}/README.md`)}
                        >
                          Open phase file
                        </button>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl bg-slate-900 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Entry gate</p>
                          <ul className="mt-3 space-y-2 text-sm text-slate-200">
                            {phase.entryCriteria.slice(0, 3).map((item) => (
                              <li key={item}>- {item}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-2xl bg-slate-900 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Exit gate</p>
                          <ul className="mt-3 space-y-2 text-sm text-slate-200">
                            {phase.exitCriteria.slice(0, 3).map((item) => (
                              <li key={item}>- {item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedStep === 'approval-gate' ? (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-white">Approval Gate</h2>
                    <p className="mt-2 text-sm text-slate-400">Approval is separate from completeness. A package can be review-ready before it is approved for build.</p>
                  </div>
                  <LifecycleBadge status={bundle.lifecycleStatus} />
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm font-semibold text-white">Approval availability</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{approvalReason}</p>
                    <p className="mt-4 text-sm font-semibold text-white">Build-ready export</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{buildReadyReason}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm font-semibold text-white">Blocking issues</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-200">
                      {(bundle.blockingWarnings.length ? bundle.blockingWarnings : [{ id: 'none', title: 'None', message: 'No blocker warnings recorded.', action: '' }]).map((warning) => (
                        <li key={warning.id}>- {warning.title === 'None' ? warning.message : `${warning.title}: ${warning.message}`}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                  <p className="text-sm font-semibold text-white">Approval checklist</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-200">
                    <li>- Confirm blocker warnings are resolved or intentionally escalated.</li>
                    <li>- Confirm non-blocking warnings, assumptions, and open questions are visible to reviewers.</li>
                    <li>- Confirm phases and gates still match the brief and selected mode.</li>
                    <li>- Confirm the builder can execute from the package without hidden chat context.</li>
                  </ul>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <span className="text-sm font-semibold text-slate-200">Approval checklist complete</span>
                    <div className="mt-4 flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border border-slate-700 bg-slate-950"
                        checked={input.questionnaireAnswers['approval-checklist-complete'] === 'true'}
                        onChange={(event) =>
                          updateQuestionnaireAnswer('approval-checklist-complete', event.target.checked ? 'true' : 'false')
                        }
                        disabled={!approvalAllowed}
                      />
                      <span className="text-sm text-slate-300">Reviewer confirms the checklist is complete.</span>
                    </div>
                  </label>
                  <label className="block rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <span className="text-sm font-semibold text-slate-200">Approval decision</span>
                    <select
                      className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                      value={input.questionnaireAnswers['approval-decision'] || ''}
                      onChange={(event) => updateQuestionnaireAnswer('approval-decision', event.target.value)}
                      disabled={!approvalAllowed}
                    >
                      <option value="">not recorded</option>
                      <option value="needs-review">needs-review</option>
                      <option value="approved-for-build">approved-for-build</option>
                    </select>
                  </label>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Field
                    label="Approval reviewer"
                    helper="Record who made the decision."
                    value={input.questionnaireAnswers['approval-reviewed-by'] || ''}
                    onChange={(value) => updateQuestionnaireAnswer('approval-reviewed-by', value)}
                  />
                  <Field
                    label="Approval notes"
                    helper="Explain why the package was approved or sent back for review."
                    value={input.questionnaireAnswers['approval-notes'] || ''}
                    onChange={(value) => updateQuestionnaireAnswer('approval-notes', value)}
                    multiline
                  />
                </div>
              </div>
            ) : null}

            {selectedStep === 'export-package' ? (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
                <h2 className="text-2xl font-semibold text-white">Export Package</h2>
                <p className="mt-2 text-sm text-slate-400">Draft export is always available. Build-ready export only opens after explicit approval and zero blocker warnings.</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm font-semibold text-white">Draft package</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">Use this when the package still needs review, clarification, or approval.</p>
                    <button
                      className="mt-4 rounded-full border border-amber-300/50 bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                      onClick={() => downloadZip('draft')}
                    >
                      Export draft zip
                    </button>
                  </div>
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm font-semibold text-white">Build-ready package</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{buildReadyReason}</p>
                    <button
                      className={`mt-4 rounded-full border px-5 py-3 text-sm font-semibold transition ${
                        buildReadyExportAllowed
                          ? 'border-emerald-300/50 bg-emerald-300 text-slate-950 hover:bg-emerald-200'
                          : 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-500'
                      }`}
                      onClick={() => downloadZip('build-ready')}
                      disabled={!buildReadyExportAllowed}
                    >
                      Export build-ready zip
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-2xl font-semibold text-white">Generated package preview</h2>
              <p className="mt-2 text-sm text-slate-400">The markdown package is still the source of truth. The workflow UI helps users earn the package, not replace it.</p>
              <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="max-h-[560px] overflow-auto rounded-3xl border border-slate-800 bg-slate-950/70 p-3">
                  {bundle.files.map((file) => (
                    <button
                      key={file.path}
                      className={`mb-2 w-full rounded-2xl px-3 py-3 text-left text-xs transition ${
                        file.path === selectedPath
                          ? 'bg-amber-300 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                      onClick={() => setSelectedPath(file.path)}
                    >
                      {file.path}
                    </button>
                  ))}
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                  <h3 className="text-lg font-semibold text-white">{selectedFile.path}</h3>
                  <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-900 p-4 text-sm leading-6 text-slate-200">
                    {selectedFile.content}
                  </pre>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
