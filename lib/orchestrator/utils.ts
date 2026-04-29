import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set(['.git', '.next', 'node_modules', '.temp', 'dist-addons']);

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function resolveOrchestratorRoot(repoRoot: string) {
  return process.env.XELERA_REPORT_ROOT
    ? path.resolve(process.env.XELERA_REPORT_ROOT)
    : path.join(repoRoot, 'orchestrator');
}

export function writeFile(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content.trimEnd() + '\n', 'utf8');
}

export function readFileSafe(filePath: string) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

export function readJsonSafe<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function listFilesRecursive(root: string, base = root): string[] {
  if (!fs.existsSync(root)) return [];
  const items = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const item of items) {
    const absolute = path.join(root, item.name);
    if (item.isDirectory()) {
      if (IGNORED_DIRS.has(item.name)) continue;
      files.push(...listFilesRecursive(absolute, base));
      continue;
    }
    files.push(path.relative(base, absolute).replace(/\\/g, '/'));
  }

  return files;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function sanitizeHeading(value: string) {
  return value.replace(/[<>]/g, '').trim();
}

export function getNowRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function firstMatch(content: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return '';
}

export function extractBullets(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function hasMeaningfulText(content: string) {
  const normalized = content.toLowerCase();
  if (!normalized.trim()) return false;
  if (/^\s*#?[a-z0-9 _-]+\s*-?\s*pending\s*$/im.test(content.trim())) return false;
  return !/(^|\n)\s*-\s*(pending|todo|tbd)\s*$/im.test(content);
}

export function ratio(part: number, total: number) {
  if (total <= 0) return 0;
  return part / total;
}

export function summarizeList(items: string[], fallback: string) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`;
}
