import fs from 'node:fs';
import path from 'node:path';
import type { XeleraState } from '../lib/types';

export function getArg(name: string) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return exact ? exact.slice(name.length + 3) : undefined;
}

export function resolvePackageRoot(explicitPath?: string) {
  const base = path.resolve(explicitPath || process.cwd());
  if (fs.existsSync(path.join(base, 'repo', 'manifest.json'))) return base;

  const children = fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const child of children) {
    const candidate = path.join(base, child.name);
    if (fs.existsSync(path.join(candidate, 'repo', 'manifest.json'))) return candidate;
  }

  throw new Error(`Could not find a generated Xelera package under ${base}`);
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function writeJsonFile(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readState(packageRoot: string) {
  return readJsonFile<XeleraState>(path.join(packageRoot, 'repo', 'xelera-state.json'));
}

export function getPhaseSlug(phaseNumber: number) {
  return `phase-${String(phaseNumber).padStart(2, '0')}`;
}

export function resolveEvidencePath(packageRoot: string, evidenceArg: string) {
  return path.resolve(packageRoot, evidenceArg);
}

export function fileExists(filePath: string) {
  return fs.existsSync(filePath);
}

export function readTextFile(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

const ALLOWED_RESULTS = new Set(['pass', 'fail', 'pending']);
const ALLOWED_RECOMMENDATIONS = new Set(['proceed', 'revise', 'blocked', 'pending']);

export function parseExitGateResult(reportContent: string): 'pass' | 'fail' | 'pending' {
  const headerMatch = reportContent.match(/##\s*result:\s*(.+)/i);
  const legacyMatch = reportContent.match(/Selected\s+result:\s*(.+)/i);
  const raw = (headerMatch?.[1] ?? legacyMatch?.[1])?.trim().toLowerCase();

  if (!raw) {
    throw new Error('Missing verification result. Expected ## result: pass|fail|pending or Selected result: pass|fail|pending.');
  }
  if (!ALLOWED_RESULTS.has(raw)) {
    throw new Error(`Invalid verification result "${raw}". Expected one of: pass, fail, pending.`);
  }
  return raw as 'pass' | 'fail' | 'pending';
}

export function parseVerificationRecommendation(reportContent: string): 'proceed' | 'revise' | 'blocked' | 'pending' {
  const headerMatch = reportContent.match(/##\s*recommendation:\s*(.+)/i);
  const legacyMatch = reportContent.match(/Selected\s+recommendation:\s*(.+)/i);
  const raw = (headerMatch?.[1] ?? legacyMatch?.[1])?.trim().toLowerCase();

  if (!raw) {
    throw new Error('Missing verification recommendation. Expected ## recommendation: proceed|revise|blocked|pending or Selected recommendation: proceed|revise|blocked|pending.');
  }
  if (!ALLOWED_RECOMMENDATIONS.has(raw)) {
    throw new Error(`Invalid verification recommendation "${raw}". Expected one of: proceed, revise, blocked, pending.`);
  }
  return raw as 'proceed' | 'revise' | 'blocked' | 'pending';
}

export function parseVerificationBullets(reportContent: string, heading: string) {
  const section = reportContent.split(new RegExp(`## ${heading}`, 'i'))[1] || '';
  const untilNextHeading = section.split(/\n##\s+/)[0] || '';
  return untilNextHeading
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(
      (line) =>
        line &&
        line !== 'pass' &&
        line !== 'fail' &&
        line !== 'pending' &&
        line !== 'proceed' &&
        line !== 'revise' &&
        line !== 'blocked'
    );
}

function normalizeEvidenceCandidate(line: string) {
  return line.trim().replace(/^`|`$/g, '');
}

function looksLikeMarkdownComment(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('<!--') && trimmed.endsWith('-->');
}

function looksLikeInstructionalEvidenceText(line: string) {
  return /^(replace\s+`?pending`?\s+with|do not select|list the evidence files)/i.test(line.trim());
}

export function parseVerificationEvidenceFiles(reportContent: string) {
  return parseVerificationBullets(reportContent, 'evidence files')
    .map(normalizeEvidenceCandidate)
    .filter((line) => !looksLikeMarkdownComment(line))
    .filter((line) => !looksLikeInstructionalEvidenceText(line))
    .filter((line) => line.toLowerCase() !== 'pending');
}
