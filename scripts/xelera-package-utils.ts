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

const DEFAULT_SCAFFOLD_EVIDENCE_BASENAMES = new Set([
  'VERIFICATION_REPORT.md',
  'EVIDENCE_CHECKLIST.md',
  'HANDOFF_SUMMARY.md',
  'NEXT_PHASE_CONTEXT.md'
]);

type EvidenceAssessment = {
  issues: string[];
  meaningfulFiles: string[];
  meaningfulNonScaffoldFiles: string[];
};

function isScaffoldEvidenceFile(evidencePath: string) {
  return DEFAULT_SCAFFOLD_EVIDENCE_BASENAMES.has(path.basename(evidencePath));
}

function countJsonSignals(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (/^(pending|todo|tbd|none|n\/a)$/i.test(trimmed)) return 0;
    return trimmed.length >= 8 ? 1 : 0;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return 1;
  if (Array.isArray(value)) return value.reduce((total, item) => total + countJsonSignals(item), 0);
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce((total, [key, child]) => total + (key ? 1 : 0) + countJsonSignals(child), 0);
  }
  return 0;
}

function stripEvidenceBoilerplate(content: string) {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, '\n');
  const filteredLines = withoutComments
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .filter((line) => !/^```/.test(line))
    .filter((line) => !/^[-*]\s+\[[ xX]?\]\s+/.test(line))
    .filter((line) => !/^[-*]\s*$/.test(line))
    .filter((line) => !/^[-*]\s+(pending|todo|tbd|none|n\/a)$/i.test(line))
    .filter((line) => !/^selected\s+(result|recommendation):/i.test(line))
    .filter((line) => !/^allowed:/i.test(line))
    .filter((line) => !/^rules?:/i.test(line))
    .filter((line) => !/^evidence means /i.test(line))
    .filter((line) => !/^list the evidence files you actually reviewed/i.test(line))
    .filter((line) => !/^replace `?pending`?/i.test(line))
    .filter((line) => !/^do not select `?pass \+ proceed`?/i.test(line))
    .filter((line) => !/^pending completion of all sections above/i.test(line))
    .filter((line) => !/^(phase outcome|implementation files changed|tests run|exit gate status|remaining blockers or warnings|assumptions that still need confirmation|summary|warnings|defects found|follow-up actions|final decision|files reviewed|files changed|commands run|evidence files):\s*$/i.test(line));

  return filteredLines.join(' ');
}

function hasMeaningfulEvidenceContent(filePath: string, content: string) {
  const baseName = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (baseName === 'EVIDENCE_CHECKLIST.md') {
    return (content.match(/\[[xX]\]/g) || []).length >= 2;
  }

  if (baseName === 'HANDOFF_SUMMARY.md') {
    const completedLines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^-\s+[^:]+:\s+\S+/.test(line))
      .filter((line) => !/:\s*$/.test(line));
    return completedLines.length >= 2;
  }

  if (baseName === 'NEXT_PHASE_CONTEXT.md') {
    const inheritSection = content.split(/## What the next phase should inherit/i)[1]?.split(/\n##\s+/)[0] || '';
    const inheritBullets = inheritSection
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter(Boolean)
      .filter((line) => !/no additional context was generated/i.test(line));
    return inheritBullets.length >= 1 && inheritBullets.join(' ').length >= 40;
  }

  if (baseName === 'VERIFICATION_REPORT.md') {
    const hasCompletedDecision = /##\s*result:\s*(pass|fail)/i.test(content) && /##\s*recommendation:\s*(proceed|revise|blocked)/i.test(content);
    const usefulBullets = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter(Boolean)
      .filter((line) => !/^(pending|-|pass|fail|proceed|revise|blocked)$/i.test(line))
      .filter((line) => !looksLikeMarkdownComment(line))
      .filter((line) => !looksLikeInstructionalEvidenceText(line));
    return hasCompletedDecision && usefulBullets.length >= 2;
  }

  if (extension === '.json') {
    try {
      return countJsonSignals(JSON.parse(content)) >= 3;
    } catch {
      return false;
    }
  }

  const stripped = stripEvidenceBoilerplate(content);
  const tokens = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return stripped.length >= 40 && tokens.length >= 6;
}

export function assessEvidenceFilesForApproval(packageRoot: string, evidenceFiles: string[]): EvidenceAssessment {
  const issues: string[] = [];
  const meaningfulFiles: string[] = [];
  const meaningfulNonScaffoldFiles: string[] = [];

  for (const evidenceFile of evidenceFiles) {
    const absoluteEvidencePath = path.join(packageRoot, evidenceFile);
    if (!fileExists(absoluteEvidencePath)) {
      issues.push(`Evidence file "${evidenceFile}" does not exist on disk. Add the file or update ## evidence files to list a real file path.`);
      continue;
    }

    const content = readTextFile(absoluteEvidencePath);
    if (!hasMeaningfulEvidenceContent(absoluteEvidencePath, content)) {
      issues.push(
        `Evidence file "${evidenceFile}" does not contain enough completed content yet. Add real notes, results, or proof instead of headings, comments, empty checklists, or template placeholders.`
      );
      continue;
    }

    meaningfulFiles.push(evidenceFile);
    if (!isScaffoldEvidenceFile(evidenceFile)) {
      meaningfulNonScaffoldFiles.push(evidenceFile);
    }
  }

  if (meaningfulFiles.length === 0) {
    issues.push('No listed evidence files contain meaningful completed content yet. Add real evidence before selecting pass + proceed.');
  }

  return {
    issues,
    meaningfulFiles,
    meaningfulNonScaffoldFiles
  };
}
