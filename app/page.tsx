'use client';
import { useMemo, useState } from 'react';
import { baseProjectInput } from '@/lib/templates';
import { generateProjectFiles } from '@/lib/generator';
import { scoreProject } from '@/lib/scoring';
import type { ProjectInput } from '@/lib/types';

function Field(props: { label: string; value: string; onChange: (value: string) => void; multi?: boolean }) {
  return <label className="block space-y-2">
    <span className="font-semibold">{props.label}</span>
    {props.multi
      ? <textarea className="min-h-24 w-full rounded-xl border p-3" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      : <input className="w-full rounded-xl border p-3" value={props.value} onChange={(e) => props.onChange(e.target.value)} />}
  </label>;
}

export default function Home() {
  const [input, setInput] = useState<ProjectInput>(baseProjectInput());
  const [path, setPath] = useState('generated-artifacts/PROJECT_BRIEF.md');
  const files = useMemo(() => generateProjectFiles(input), [input]);
  const score = useMemo(() => scoreProject(input), [input]);
  const selected = files.find((f) => f.path === path) || files[0];
  const update = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => setInput((current) => ({ ...current, [key]: value }));

  async function downloadZip() {
    const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'xelera-handoff.zip';
    link.click();
    URL.revokeObjectURL(url);
  }

  return <main className="min-h-screen bg-slate-50 p-6">
    <section className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-3xl bg-slate-950 p-8 text-white">
        <h1 className="text-5xl font-black">Xelera Method</h1>
        <p className="mt-3 text-slate-300">Plan first. Gate hard. Then build.</p>
        <button className="mt-5 rounded-xl bg-white px-5 py-3 font-bold text-slate-950" onClick={downloadZip}>Export handoff zip</button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <aside className="space-y-4 rounded-3xl bg-white p-5 shadow">
          <div className="rounded-2xl bg-blue-50 p-4">
            <p className="text-sm font-semibold">Build readiness</p>
            <p className="text-4xl font-black">{score.total}/100</p>
            <p className="font-bold">{score.rating}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select className="rounded-xl border p-3" value={input.level} onChange={(e) => update('level', e.target.value as ProjectInput['level'])}>
              <option value="beginner">beginner</option><option value="intermediate">intermediate</option><option value="advanced">advanced</option>
            </select>
            <select className="rounded-xl border p-3" value={input.track} onChange={(e) => update('track', e.target.value as ProjectInput['track'])}>
              <option value="business">business</option><option value="technical">technical</option>
            </select>
          </div>
          <Field label="Product name" value={input.productName} onChange={(v) => update('productName', v)} />
          <Field label="One-line idea" value={input.oneLineIdea} onChange={(v) => update('oneLineIdea', v)} multi />
          <Field label="Target users" value={input.targetUsers} onChange={(v) => update('targetUsers', v)} multi />
          <Field label="Primary outcome" value={input.primaryOutcome} onChange={(v) => update('primaryOutcome', v)} multi />
          <Field label="Must-have features" value={input.mustHaveFeatures} onChange={(v) => update('mustHaveFeatures', v)} multi />
          <Field label="Nice-to-have features" value={input.niceToHaveFeatures} onChange={(v) => update('niceToHaveFeatures', v)} multi />
          <Field label="Data and integrations" value={input.dataAndIntegrations} onChange={(v) => update('dataAndIntegrations', v)} multi />
          <Field label="Risks" value={input.risks} onChange={(v) => update('risks', v)} multi />
          <Field label="Constraints" value={input.constraints} onChange={(v) => update('constraints', v)} multi />
        </aside>
        <section className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="rounded-3xl bg-white p-4 shadow">
            {files.map((file) => <button key={file.path} className={`mb-2 w-full rounded-xl p-3 text-left text-xs ${file.path === path ? 'bg-slate-950 text-white' : 'bg-slate-100'}`} onClick={() => setPath(file.path)}>{file.path}</button>)}
          </div>
          <div className="rounded-3xl bg-white p-5 shadow">
            <h2 className="mb-4 text-xl font-black">{selected.path}</h2>
            <pre className="max-h-[760px] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-100 p-4 text-sm">{selected.content}</pre>
          </div>
        </section>
      </div>
    </section>
  </main>;
}
