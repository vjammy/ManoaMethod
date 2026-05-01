#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { generateProjectBundle } from '../lib/generator';
import { readExtractions } from '../lib/research/persistence';
import type { ResearchExtractions } from '../lib/research/schema';
import { baseProjectInput } from '../lib/templates';
import type { ProjectInput } from '../lib/types';

function getArg(name: string) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

function writeFileRecursive(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

export function loadInput(inputPath?: string): ProjectInput {
  if (!inputPath) {
    return baseProjectInput();
  }

  const absolute = path.resolve(inputPath);
  const raw = fs.readFileSync(absolute, 'utf8');
  const parsed = JSON.parse(raw) as Partial<ProjectInput>;
  const base = baseProjectInput();

  return {
    ...base,
    ...parsed,
    questionnaireAnswers: {
      ...base.questionnaireAnswers,
      ...(parsed.questionnaireAnswers || {})
    }
  };
}

async function writeZip(rootDir: string, zipPath: string) {
  const zip = new JSZip();

  function walk(currentDir: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolute = path.join(currentDir, entry.name);
      const relative = path.relative(path.dirname(rootDir), absolute).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        walk(absolute);
      } else {
        zip.file(relative, fs.readFileSync(absolute));
      }
    }
  }

  walk(rootDir);
  const data = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(zipPath, data);
}

export async function createArtifactPackage(options: {
  input: ProjectInput;
  outDir: string;
  zip?: boolean | string;
  researchFrom?: string;
  /** In-memory extractions (smoke/orchestrator harnesses use this to avoid round-tripping JSON to disk). */
  extractions?: ResearchExtractions;
}) {
  // Hydrate extractions if the caller passed --research-from. Library callers
  // may also pass `extractions` in-memory. When neither is supplied we fall
  // back to the legacy generic templated path; archetype keyword routing was
  // removed in A3c, so the templated fallback always renders the 'general'
  // baseline. The CLI in main() enforces --research-from for end users.
  const extractions = options.extractions ?? (options.researchFrom
    ? readExtractions(path.resolve(options.researchFrom))
    : undefined);
  if (options.researchFrom && !options.extractions && !extractions) {
    throw new Error(
      `[create-project] --research-from=${options.researchFrom} did not contain valid research/extracted/*.json. ` +
        `Run the research recipe first (docs/RESEARCH_RECIPE.md) or, in the harness, scripts/synthesize-research-ontology.ts.`
    );
  }
  const bundle = generateProjectBundle(options.input, { extractions: extractions ?? undefined });
  const outDir = path.resolve(options.outDir || bundle.exportRoot);
  const rootDir = path.join(outDir, bundle.exportRoot);

  for (const file of bundle.files) {
    writeFileRecursive(path.join(rootDir, file.path), file.content);
  }

  // Phase B: copy the research/ directory from --research-from into the workspace
  // so the workspace is self-contained. The audit reads research/extracted/ to
  // build its research-token vocabulary; without this copy the audit treats
  // research-grounded workspaces as if they had no research vocabulary at all.
  if (options.researchFrom) {
    const sourceResearch = path.resolve(options.researchFrom, 'research');
    const targetResearch = path.join(rootDir, 'research');
    if (fs.existsSync(sourceResearch) && !fs.existsSync(targetResearch)) {
      copyDirRecursive(sourceResearch, targetResearch);
    }
  }

  let zipPath = '';
  if (options.zip) {
    zipPath =
      typeof options.zip === 'string'
        ? path.resolve(options.zip === 'true' ? path.join(outDir, `${bundle.exportRoot}.zip`) : options.zip)
        : path.join(outDir, `${bundle.exportRoot}.zip`);
    await writeZip(rootDir, zipPath);
  }

  return { bundle, outDir, rootDir, zipPath };
}

async function main() {
  const input = loadInput(getArg('input'));
  const researchFrom = getArg('research-from');

  // Phase A3c: --research-from is required. The legacy --allow-templated escape
  // hatch was removed; archetype keyword routing was deleted with it. Real users
  // get extractions by running docs/RESEARCH_RECIPE.md inside their coding agent
  // (Claude Code, Codex, Kimi, OpenCode); harnesses use
  // scripts/synthesize-research-ontology.ts as a deterministic bridge.
  if (!researchFrom) {
    console.error(
      '[create-project] research extractions are required.\n' +
        '  - Recommended: run the recipe in docs/RESEARCH_RECIPE.md inside your coding agent,\n' +
        '    then pass --research-from=<dir> pointing at the produced research/extracted/.\n' +
        '  - Harness/test: pass --research-from=<dir> after running\n' +
        '    `tsx scripts/synthesize-research-ontology.ts --input=<brief.json> --out=<dir>`.'
    );
    process.exit(1);
  }

  const result = await createArtifactPackage({
    input,
    outDir: getArg('out') || generateProjectBundle(input).exportRoot,
    zip: getArg('zip') || false,
    researchFrom
  });

  console.log(`Created artifact package at ${result.rootDir}`);
  if (result.zipPath) {
    console.log(`Created zip at ${result.zipPath}`);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
