#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { generateProjectBundle } from '../lib/generator';
import { readExtractions } from '../lib/research/persistence';
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
}) {
  // Hydrate extractions if the caller passed --research-from. Library callers
  // (smoke test, autoresearch, orchestrator harness) may omit it and fall back
  // to the deprecated archetype-templated path; the CLI in main() enforces the
  // research-required check so end users go through the recipe.
  const extractions = options.researchFrom
    ? readExtractions(path.resolve(options.researchFrom))
    : undefined;
  if (options.researchFrom && !extractions) {
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
  const allowTemplatedFlag =
    process.argv.includes('--allow-templated') || (getArg('allow-templated') || '').toLowerCase() === 'true';

  // Phase A3a guardrail: the CLI now requires research extractions by default.
  // Real users get them by running the recipe in docs/RESEARCH_RECIPE.md inside
  // their coding agent (Claude Code, Codex, Kimi, OpenCode) and passing
  // --research-from=<dir>. The harness uses scripts/synthesize-research-
  // ontology.ts as a deterministic bridge. Pass --allow-templated to fall
  // back to the deprecated archetype path during the A3 cutover.
  if (!researchFrom && !allowTemplatedFlag) {
    console.error(
      '[create-project] research extractions are required.\n' +
        '  - Recommended: run the recipe in docs/RESEARCH_RECIPE.md inside your coding agent,\n' +
        '    then pass --research-from=<dir> pointing at the produced research/extracted/.\n' +
        '  - Harness/test: pass --research-from=<dir> after running\n' +
        '    `tsx scripts/synthesize-research-ontology.ts --input=<brief.json> --out=<dir>`.\n' +
        '  - Deprecated escape hatch (archetype templates): --allow-templated. Will be removed in A3c.'
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
