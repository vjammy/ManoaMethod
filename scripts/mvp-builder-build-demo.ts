#!/usr/bin/env tsx
/**
 * Phase 8: Static demo generator.
 *
 * Reads a mvp-builder workspace and emits a self-contained static HTML demo
 * plus a Playwright smoke spec. In batch mode it also emits a portfolio
 * index page.
 *
 * Usage:
 *   tsx scripts/mvp-builder-build-demo.ts --package=<workspace> --out=<dir>
 *   tsx scripts/mvp-builder-build-demo.ts --packages=<root> --out=<dir>
 *
 * Constraints:
 * - No new dependencies, no external HTML resources, vanilla JS.
 * - Generated output is deterministic so re-running on the same input yields
 *   byte-identical files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliArgs {
  packagePath?: string;
  packagesDir?: string;
  outDir: string;
}

interface RouteEntry {
  route: string;
  screen: string;
  component: string;
  primaryUser: string;
}

interface TestIdEntry {
  id: string;
  screen: string;
  workflowStep: string;
  aliases: string;
}

interface RequirementEntry {
  reqId: string;
  title: string;
  actor: string;
  actorId: string;
  userAction: string;
  failureCase: string;
}

interface EntitySample {
  entityName: string;
  entityId: string;
  usedByRequirements: string;
  happyJson: string | null;
}

interface ScreenInventoryEntry {
  name: string;
  route: string;
  primaryActor: string;
  purpose: string;
}

interface WorkflowEntry {
  name: string;
  targetUser: string;
  happyPath: string[];
}

interface ManifestSnapshot {
  productName: string;
  lifecycleStatus: string;
  researchSource: string;
  phaseCount: number | string;
  readinessScore: number | string;
}

interface WorkspaceSnapshot {
  manifest: ManifestSnapshot;
  productIdea: string;
  problemStatement: string;
  targetAudience: string;
  routes: RouteEntry[];
  testIds: TestIdEntry[];
  requirements: RequirementEntry[];
  entities: EntitySample[];
  screens: ScreenInventoryEntry[];
  workflows: WorkflowEntry[];
  actorIds: string[];
}

interface BuildResult {
  slug: string;
  productName: string;
  manifest: ManifestSnapshot;
  outDir: string;
  relativeIndex: string;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): CliArgs {
  const args: { [key: string]: string } = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      args[raw.slice(2)] = 'true';
    } else {
      args[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  const packagePath = args['package'];
  const packagesDir = args['packages'];
  const outDir = args['out'];
  if (!outDir) {
    throw new Error('--out=<dir> is required.');
  }
  if (!packagePath && !packagesDir) {
    throw new Error('Pass --package=<workspace> or --packages=<root>.');
  }
  if (packagePath && packagesDir) {
    throw new Error('Pass either --package or --packages, not both.');
  }
  return { packagePath, packagesDir, outDir };
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readTextFile(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

// ---------------------------------------------------------------------------
// HTML escape
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\u003c');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-') || 'demo';
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseManifest(workspace: string): ManifestSnapshot {
  const repoDir = path.join(workspace, 'repo');
  const manifestPath = path.join(repoDir, 'manifest.json');
  const inputPath = path.join(repoDir, 'input.json');
  let manifest: Record<string, unknown> = {};
  let input: Record<string, unknown> = {};
  if (fileExists(manifestPath)) {
    try {
      manifest = JSON.parse(readTextFile(manifestPath));
    } catch {
      manifest = {};
    }
  }
  if (fileExists(inputPath)) {
    try {
      input = JSON.parse(readTextFile(inputPath));
    } catch {
      input = {};
    }
  }
  // Product name: prefer input.productName; fall back to packageSummary or
  // workspace folder name.
  const productName =
    (typeof input.productName === 'string' && input.productName.trim()) ||
    (typeof manifest.packageSummary === 'string' &&
      String(manifest.packageSummary).split(' package')[0].trim()) ||
    'MVP Builder Demo';
  return {
    productName,
    lifecycleStatus:
      (typeof manifest.lifecycleStatus === 'string' && manifest.lifecycleStatus) || 'unknown',
    researchSource:
      (typeof manifest.researchSource === 'string' && manifest.researchSource) || 'unknown',
    phaseCount: (typeof manifest.phaseCount === 'number' && manifest.phaseCount) || 0,
    readinessScore: (typeof manifest.readinessScore === 'number' && manifest.readinessScore) || 0
  };
}

function parseInputJson(workspace: string): {
  productIdea: string;
  problemStatement: string;
  targetAudience: string;
} {
  const inputPath = path.join(workspace, 'repo', 'input.json');
  if (!fileExists(inputPath)) {
    return { productIdea: '', problemStatement: '', targetAudience: '' };
  }
  try {
    const input = JSON.parse(readTextFile(inputPath)) as Record<string, unknown>;
    return {
      productIdea: typeof input.productIdea === 'string' ? input.productIdea : '',
      problemStatement: typeof input.problemStatement === 'string' ? input.problemStatement : '',
      targetAudience: typeof input.targetAudience === 'string' ? input.targetAudience : ''
    };
  } catch {
    return { productIdea: '', problemStatement: '', targetAudience: '' };
  }
}

function extractTableRows(
  content: string,
  headingRegex: RegExp
): string[][] {
  const headingMatch = content.match(headingRegex);
  if (!headingMatch) return [];
  const startIdx = (headingMatch.index ?? 0) + headingMatch[0].length;
  const tail = content.slice(startIdx);
  // A markdown table ends at the next blank-line-followed-by-non-pipe or next
  // section heading. Iterate line by line, collect pipe rows after the
  // separator row.
  const lines = tail.split(/\r?\n/);
  const rows: string[][] = [];
  let inTable = false;
  let sawSeparator = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      inTable = true;
      // Separator row like `| --- | --- |`
      if (/^\|\s*:?-{3,}/.test(trimmed)) {
        sawSeparator = true;
        continue;
      }
      if (!sawSeparator) {
        continue; // header row, skip
      }
      const cells = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      rows.push(cells);
      continue;
    }
    if (inTable) break;
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) break;
  }
  return rows;
}

function stripBackticks(s: string): string {
  return s.replace(/^`+|`+$/g, '').trim();
}

function parseRoutes(workspace: string): RouteEntry[] {
  const filePath = path.join(workspace, 'architecture', 'IMPLEMENTATION_CONTRACT.md');
  if (!fileExists(filePath)) return [];
  const content = readTextFile(filePath);
  const rows = extractTableRows(content, /##\s+Route map\s*\n/);
  const routes = rows
    .filter((r) => r.length >= 4)
    .map((r) => ({
      route: stripBackticks(r[0]),
      screen: r[1],
      component: stripBackticks(r[2]),
      primaryUser: r[3]
    }))
    .filter((r) => r.route && r.component);
  // Deterministic order: by route string.
  return routes.slice().sort((a, b) => a.route.localeCompare(b.route));
}

function parseTestIds(workspace: string): TestIdEntry[] {
  const filePath = path.join(workspace, 'architecture', 'IMPLEMENTATION_CONTRACT.md');
  if (!fileExists(filePath)) return [];
  const content = readTextFile(filePath);
  const rows = extractTableRows(content, /##\s+Test ID glossary\s*\n/);
  const entries = rows
    .filter((r) => r.length >= 4)
    .map((r) => ({
      id: stripBackticks(r[0]),
      screen: r[1],
      workflowStep: r[2],
      aliases: r[3]
    }))
    .filter((r) => r.id);
  return entries.slice().sort((a, b) => a.id.localeCompare(b.id));
}

function parseRequirements(workspace: string): RequirementEntry[] {
  const filePath = path.join(workspace, 'requirements', 'FUNCTIONAL_REQUIREMENTS.md');
  if (!fileExists(filePath)) return [];
  const content = readTextFile(filePath);
  const blockRegex = /##\s+Requirement\s+(\d+)\s*:\s*([^\n]+)\n([\s\S]*?)(?=\n##\s+Requirement\s+\d+:|\n##\s+\w|\n#\s+|$)/g;
  const out: RequirementEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(content))) {
    const reqNum = m[1];
    const title = m[2].trim();
    const body = m[3];
    const actor = (body.match(/^-\s*Actor:\s*([^\n]+)/m)?.[1] || '').trim();
    const actorId = (body.match(/^-\s*Actor ID:\s*([^\n]+)/m)?.[1] || '').trim();
    const userAction = (body.match(/^-\s*User action:\s*([^\n]+)/m)?.[1] || '').trim();
    const failureCase = (body.match(/^-\s*Failure case:\s*([^\n]+)/m)?.[1] || '').trim();
    out.push({
      reqId: `REQ-${reqNum}`,
      title,
      actor,
      actorId,
      userAction,
      failureCase
    });
  }
  return out.slice().sort((a, b) => {
    const an = Number.parseInt(a.reqId.replace('REQ-', ''), 10);
    const bn = Number.parseInt(b.reqId.replace('REQ-', ''), 10);
    return an - bn;
  });
}

function parseActorsFromRequirements(workspace: string): string[] {
  const filePath = path.join(workspace, 'requirements', 'FUNCTIONAL_REQUIREMENTS.md');
  if (!fileExists(filePath)) return [];
  const content = readTextFile(filePath);
  // Actor IDs appear in the "## Actors" section as `(`actor-id`, ...)`.
  const actorsSection = content.split(/##\s+Actors/i)[1]?.split(/\n##\s+/)[0] || '';
  const matches = Array.from(actorsSection.matchAll(/\(`([^`]+)`/g));
  const ids = matches.map((m) => m[1]).filter((id) => id.startsWith('actor-'));
  return Array.from(new Set(ids));
}

function parseEntities(workspace: string): EntitySample[] {
  const filePath = path.join(workspace, 'SAMPLE_DATA.md');
  if (!fileExists(filePath)) return [];
  const content = readTextFile(filePath);
  const sections = content.split(/\n## /).slice(1);
  const out: EntitySample[] = [];
  for (const section of sections) {
    const headerLine = section.split('\n')[0].trim();
    if (
      !headerLine ||
      /^What this/i.test(headerLine) ||
      /^How to use/i.test(headerLine) ||
      /^Foreign keys/i.test(headerLine)
    ) {
      continue;
    }
    // Header looks like: "Task (`entity-core`)"
    const nameMatch = headerLine.match(/^([^(`]+?)\s*\(`([^`]+)`\)/);
    let entityName = headerLine;
    let entityId = '';
    if (nameMatch) {
      entityName = nameMatch[1].trim();
      entityId = nameMatch[2].trim();
    }
    const usedByMatch = section.match(/Used by requirements:\s*([^\n]+)/i);
    const usedByRequirements = (usedByMatch?.[1] || '').trim();
    // First, prefer a "### Sample happy:" subsection; if absent, take the
    // first ```json block in the section.
    let happyJson: string | null = null;
    const sampleMatch = section.match(
      /###\s+Sample\s+happy[^\n]*\n([\s\S]*?)(?=\n###\s|\n##\s|\n#\s|$)/i
    );
    if (sampleMatch) {
      const inner = sampleMatch[1];
      const json = inner.match(/```json\n([\s\S]*?)\n```/);
      if (json) happyJson = json[1].trim();
    }
    if (!happyJson) {
      const json = section.match(/```json\n([\s\S]*?)\n```/);
      if (json) happyJson = json[1].trim();
    }
    out.push({
      entityName,
      entityId,
      usedByRequirements,
      happyJson
    });
  }
  // Sort by entityName for determinism.
  return out.slice().sort((a, b) => a.entityName.localeCompare(b.entityName));
}

function parseScreens(workspace: string): ScreenInventoryEntry[] {
  const filePath = path.join(workspace, 'ui-ux', 'SCREEN_INVENTORY.md');
  if (!fileExists(filePath)) return [];
  const content = readTextFile(filePath);
  // Per-screen quick view entries start with "### <Name>" then bullets.
  const sectionStart = content.indexOf('## Per-screen quick view');
  if (sectionStart === -1) {
    // Fall back to the table at the top.
    const rows = extractTableRows(content, /##\s+Screen index\s*\n/);
    return rows
      .filter((r) => r.length >= 4)
      .map((r) => ({
        name: r[1],
        route: stripBackticks(r[2]),
        primaryActor: r[3],
        purpose: ''
      }))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const tail = content.slice(sectionStart);
  const blocks = tail.split(/\n###\s+/).slice(1);
  const out: ScreenInventoryEntry[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const name = lines[0].trim();
    const route = stripBackticks(
      (block.match(/^-\s*Route:\s*([^\n]+)/m)?.[1] || '').trim()
    );
    const primaryActor = (block.match(/^-\s*Primary actor:\s*([^\n]+)/m)?.[1] || '').trim();
    const purpose = (block.match(/^-\s*Purpose:\s*([^\n]+)/m)?.[1] || '').trim();
    out.push({ name, route, primaryActor, purpose });
  }
  return out.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function parseWorkflows(workspace: string): WorkflowEntry[] {
  const filePath = path.join(workspace, 'ui-ux', 'USER_WORKFLOWS.md');
  if (!fileExists(filePath)) return [];
  const content = readTextFile(filePath);
  const blocks = content.split(/\n##\s+/).slice(1);
  const out: WorkflowEntry[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const name = lines[0].trim();
    const targetUser = (block.match(/^-\s*Target user:\s*([^\n]+)/m)?.[1] || '').trim();
    // Capture the "Happy path:" bullet list.
    const happyMatch = block.match(/^-\s*Happy path:\s*\n([\s\S]*?)(?=\n-\s*\w+:\s*|\n##\s|\n#\s|$)/m);
    const happyBlock = happyMatch?.[1] || '';
    const happyPath = happyBlock
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter(Boolean);
    out.push({ name, targetUser, happyPath });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Workspace snapshot
// ---------------------------------------------------------------------------

function loadWorkspace(workspace: string): WorkspaceSnapshot {
  const manifest = parseManifest(workspace);
  const inputBits = parseInputJson(workspace);
  const routes = parseRoutes(workspace);
  const testIds = parseTestIds(workspace);
  const requirements = parseRequirements(workspace);
  const entities = parseEntities(workspace);
  const screens = parseScreens(workspace);
  const workflows = parseWorkflows(workspace);
  // Actor IDs: prefer the IMPLEMENTATION_CONTRACT mock-auth list; fall back to
  // requirements; fall back to per-actor flow specs.
  const contractPath = path.join(workspace, 'architecture', 'IMPLEMENTATION_CONTRACT.md');
  let contractActorIds: string[] = [];
  if (fileExists(contractPath)) {
    const content = readTextFile(contractPath);
    const mockAuthSection = content.split(/##\s+Mock auth/i)[1]?.split(/\n##\s+/)[0] || '';
    const matches = Array.from(mockAuthSection.matchAll(/`([^`]+)`/g));
    contractActorIds = matches
      .map((m) => m[1])
      .filter((id) => id === 'primary-user' || id === 'secondary-user' || id.startsWith('actor-'));
  }
  const reqActorIds = requirements
    .map((r) => r.actorId)
    .filter((id) => id && id.length > 0);
  const merged = Array.from(new Set([...contractActorIds, ...reqActorIds]));
  const fallbackFromActors = parseActorsFromRequirements(workspace);
  const actorIds =
    merged.length > 0 ? merged : fallbackFromActors.length ? fallbackFromActors : ['default-user'];
  return {
    manifest,
    productIdea: inputBits.productIdea,
    problemStatement: inputBits.problemStatement,
    targetAudience: inputBits.targetAudience,
    routes,
    testIds,
    requirements,
    entities,
    screens,
    workflows,
    actorIds
  };
}

// ---------------------------------------------------------------------------
// Top-3 testid selection per screen
// ---------------------------------------------------------------------------

function topTestIdsForScreen(testIds: TestIdEntry[], screenName: string): TestIdEntry[] {
  if (!screenName) return [];
  const norm = (s: string) => s.toLowerCase().trim();
  const target = norm(screenName);
  const matches = testIds.filter((t) => norm(t.screen) === target);
  return matches.slice(0, 3);
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function renderHtml(snapshot: WorkspaceSnapshot): string {
  const {
    manifest,
    productIdea,
    problemStatement,
    targetAudience,
    routes,
    testIds,
    requirements,
    entities,
    screens,
    workflows,
    actorIds
  } = snapshot;

  const firstActor = actorIds[0];

  // Workflows pane.
  const workflowsHtml = workflows.length
    ? workflows
        .map((w) => {
          const bullets = w.happyPath.length
            ? `<ul>${w.happyPath.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
            : '<p class="muted">No happy-path bullets recorded.</p>';
          return `<article class="card" data-testid="workflow-card">
  <h3>${escapeHtml(w.name)}</h3>
  <p class="muted">Target user: ${escapeHtml(w.targetUser || 'unspecified')}</p>
  ${bullets}
</article>`;
        })
        .join('\n')
    : '<p class="muted">No workflows captured for this workspace.</p>';

  // Requirements pane.
  const requirementsHtml = requirements.length
    ? `<table class="data-table" data-testid="requirements-table">
  <thead>
    <tr>
      <th>REQ-ID</th>
      <th>Title</th>
      <th>Actor</th>
      <th>Actor ID</th>
      <th>User action</th>
      <th>Failure case</th>
    </tr>
  </thead>
  <tbody>
${requirements
  .map(
    (r) => `    <tr data-testid="row-${escapeHtml(r.reqId.toLowerCase())}">
      <td>${escapeHtml(r.reqId)}</td>
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.actor)}</td>
      <td>${escapeHtml(r.actorId)}</td>
      <td>${escapeHtml(r.userAction)}</td>
      <td>${escapeHtml(r.failureCase)}</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : '<p class="muted">No functional requirements captured.</p>';

  // Data pane.
  const dataHtml = entities.length
    ? entities
        .map((e) => {
          const json = e.happyJson
            ? `<pre data-testid="entity-sample">${escapeHtml(e.happyJson)}</pre>`
            : '<p class="muted">No happy-path sample available.</p>';
          return `<article class="card" data-testid="entity-card">
  <h3>${escapeHtml(e.entityName)}</h3>
  <p class="muted">Used by requirements: ${escapeHtml(e.usedByRequirements || 'none')}</p>
  ${json}
</article>`;
        })
        .join('\n')
    : '<p class="muted">No entity samples captured.</p>';

  // Screens pane.
  const screenPurposeMap = new Map<string, string>();
  for (const s of screens) screenPurposeMap.set(s.name, s.purpose);
  const screensHtml = routes.length
    ? routes
        .map((route) => {
          const top = topTestIdsForScreen(testIds, route.screen);
          const testIdsHtml = top.length
            ? `<ul>${top.map((t) => `<li><code>${escapeHtml(t.id)}</code> — ${escapeHtml(t.aliases || t.workflowStep || '')}</li>`).join('')}</ul>`
            : '<p class="muted">No testids assigned to this screen.</p>';
          const purpose = screenPurposeMap.get(route.screen) || '';
          return `<article class="card" data-testid="screen-card">
  <h3>${escapeHtml(route.screen)}</h3>
  <p class="muted">Route: <code>${escapeHtml(route.route)}</code></p>
  <p class="muted">Component: <code>${escapeHtml(route.component)}</code></p>
  <p class="muted">Primary user: ${escapeHtml(route.primaryUser)}</p>
  ${purpose ? `<p>${escapeHtml(purpose)}</p>` : ''}
  ${testIdsHtml}
</article>`;
        })
        .join('\n')
    : '<p class="muted">No routes captured.</p>';

  // Readiness pane.
  const readinessHtml = `<dl class="readiness" data-testid="readiness-list">
  <dt>readinessScore</dt><dd>${escapeHtml(String(manifest.readinessScore))}</dd>
  <dt>lifecycleStatus</dt><dd>${escapeHtml(String(manifest.lifecycleStatus))}</dd>
  <dt>researchSource</dt><dd>${escapeHtml(String(manifest.researchSource))}</dd>
  <dt>phaseCount</dt><dd>${escapeHtml(String(manifest.phaseCount))}</dd>
</dl>
<p class="banner" data-testid="readiness-banner">Static demo. No real database, no real auth. The mock-auth dropdown changes the <code>?as=&lt;actorId&gt;</code> query string only.</p>`;

  // Mock-auth dropdown.
  const actorOptions = actorIds
    .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`)
    .join('\n');

  // The product-name title intentionally lives in <h1 data-testid="app-title">.
  const productName = manifest.productName;

  // Inline styling: dark theme, no externals.
  const css = `
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: #0d1117;
  color: #e6edf3;
  line-height: 1.5;
}
header {
  padding: 24px 32px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
}
header h1 { margin: 0 0 6px 0; font-size: 22px; }
header p { margin: 0; color: #8b949e; font-size: 14px; }
.banner {
  background: #1f2933;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 10px 14px;
  margin: 16px 32px;
  font-size: 13px;
  color: #c9d1d9;
}
.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 32px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
}
.controls label { font-size: 13px; color: #8b949e; }
.controls select {
  background: #0d1117;
  color: #e6edf3;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 0 32px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
}
.tabs button {
  background: transparent;
  color: #8b949e;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 14px;
}
.tabs button.active {
  color: #e6edf3;
  border-bottom-color: #58a6ff;
}
.pane { display: none; padding: 24px 32px; }
.pane.active { display: block; }
.card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 14px 18px;
  margin-bottom: 12px;
}
.card h3 { margin: 0 0 6px 0; font-size: 16px; }
.muted { color: #8b949e; font-size: 13px; margin: 4px 0; }
ul { margin: 6px 0 0 18px; padding: 0; }
li { margin: 2px 0; font-size: 13px; }
code { background: #0d1117; border: 1px solid #30363d; border-radius: 3px; padding: 1px 4px; font-size: 12px; }
pre {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 10px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th, .data-table td {
  text-align: left;
  vertical-align: top;
  padding: 6px 8px;
  border-bottom: 1px solid #30363d;
}
.data-table th { color: #8b949e; font-weight: 600; }
dl.readiness { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; max-width: 500px; }
dl.readiness dt { color: #8b949e; }
dl.readiness dd { margin: 0; }
`.trim();

  // Inline JS for tab switching and ?as= sync.
  const js = `
(function () {
  function getQueryActor() {
    var m = window.location.search.match(/[?&]as=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setQueryActor(id) {
    var url = new URL(window.location.href);
    url.searchParams.set('as', id);
    window.history.replaceState({}, '', url.toString());
  }
  function activate(name) {
    var tabs = document.querySelectorAll('.tabs button');
    var panes = document.querySelectorAll('.pane');
    tabs.forEach(function (t) {
      if (t.getAttribute('data-tab') === name) t.classList.add('active');
      else t.classList.remove('active');
    });
    panes.forEach(function (p) {
      if (p.getAttribute('data-pane') === name) p.classList.add('active');
      else p.classList.remove('active');
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.tabs button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activate(btn.getAttribute('data-tab'));
      });
    });
    activate('workflows');
    var sel = document.querySelector('[data-testid="mock-auth-select"]');
    if (sel) {
      var initial = getQueryActor();
      if (initial) {
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === initial) { sel.value = initial; break; }
        }
      } else {
        setQueryActor(sel.value);
      }
      sel.addEventListener('change', function () { setQueryActor(sel.value); });
    }
  });
})();
`.trim();

  const head = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(productName)} demo</title>
  <style>
${css}
  </style>
</head>`;

  const body = `<body>
  <header>
    <h1 data-testid="app-title">${escapeHtml(productName)}</h1>
    <p>${escapeHtml(productIdea || problemStatement || targetAudience || 'Static workspace demo.')}</p>
  </header>
  <div data-testid="demo-caveat" class="banner">Static demo, no real DB or auth.</div>
  <div class="controls">
    <label for="mock-auth-select">Mock auth (sets <code>?as=&lt;actorId&gt;</code>):</label>
    <select id="mock-auth-select" data-testid="mock-auth-select">
${actorOptions}
    </select>
  </div>
  <nav class="tabs" role="tablist">
    <button data-testid="tab-workflows" data-tab="workflows" role="tab">Workflows</button>
    <button data-testid="tab-requirements" data-tab="requirements" role="tab">Requirements</button>
    <button data-testid="tab-data" data-tab="data" role="tab">Data</button>
    <button data-testid="tab-screens" data-tab="screens" role="tab">Screens</button>
    <button data-testid="tab-readiness" data-tab="readiness" role="tab">Readiness</button>
  </nav>
  <section class="pane" data-testid="pane-workflows" data-pane="workflows" role="tabpanel">
${workflowsHtml}
  </section>
  <section class="pane" data-testid="pane-requirements" data-pane="requirements" role="tabpanel">
${requirementsHtml}
  </section>
  <section class="pane" data-testid="pane-data" data-pane="data" role="tabpanel">
${dataHtml}
  </section>
  <section class="pane" data-testid="pane-screens" data-pane="screens" role="tabpanel">
${screensHtml}
  </section>
  <section class="pane" data-testid="pane-readiness" data-pane="readiness" role="tabpanel">
${readinessHtml}
  </section>
  <script>
${js}
  </script>
</body>
</html>`;

  // Suppress unused linter complaints.
  void firstActor;
  return `${head}\n${body}\n`;
}

// ---------------------------------------------------------------------------
// Playwright spec
// ---------------------------------------------------------------------------

function renderSpec(snapshot: WorkspaceSnapshot, slug: string): string {
  const productName = snapshot.manifest.productName;
  const firstActor = snapshot.actorIds[0] || 'default-user';
  // Top 3 happy-path tokens. Use deterministic pulls from happy paths and
  // requirements user actions.
  const tokens: string[] = [];
  for (const w of snapshot.workflows) {
    for (const b of w.happyPath) {
      const t = b.split(/[.;]/)[0].trim();
      if (t && t.length > 4 && t.length < 80 && !tokens.includes(t)) tokens.push(t);
      if (tokens.length >= 3) break;
    }
    if (tokens.length >= 3) break;
  }
  if (tokens.length < 3) {
    for (const r of snapshot.requirements) {
      if (r.userAction && !tokens.includes(r.userAction)) tokens.push(r.userAction);
      if (tokens.length >= 3) break;
    }
  }
  // Fallback if a workspace is missing both workflows and requirements.
  while (tokens.length < 3) {
    const seed = ['Demo placeholder ' + tokens.length];
    tokens.push(seed[0]);
  }
  const tokenLines = tokens
    .slice(0, 3)
    .map((t) => `    expect(body).toContain('${escapeJsString(t)}');`)
    .join('\n');

  const productNameJs = escapeJsString(productName);
  const firstActorJs = escapeJsString(firstActor);

  return `// Smoke spec for ${productName} static demo. Run: npx playwright test ${slug}.spec.ts
import { test, expect } from '@playwright/test';

const URL = process.env.DEMO_URL || 'file://' + require('path').resolve(__dirname, 'index.html');

test.describe('${productNameJs} demo smoke', () => {
  test('app title contains product name', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('app-title')).toContainText('${productNameJs}');
  });

  test('demo caveat is visible', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('demo-caveat')).toBeVisible();
  });

  test('mock-auth defaults to first actor', async ({ page }) => {
    await page.goto(URL);
    const select = page.getByTestId('mock-auth-select');
    await expect(select).toHaveValue('${firstActorJs}');
  });

  test('top 3 happy-path tokens render', async ({ page }) => {
    await page.goto(URL);
    const body = await page.content();
${tokenLines}
  });

  test('all 5 tabs are clickable', async ({ page }) => {
    await page.goto(URL);
    for (const tab of ['Workflows', 'Requirements', 'Data', 'Screens', 'Readiness']) {
      await page.getByTestId(\`tab-\${tab.toLowerCase()}\`).click();
      await expect(page.getByTestId(\`pane-\${tab.toLowerCase()}\`)).toBeVisible();
    }
  });
});
`;
}

// ---------------------------------------------------------------------------
// Portfolio index
// ---------------------------------------------------------------------------

function renderPortfolio(results: BuildResult[]): string {
  const sorted = results.slice().sort((a, b) => a.slug.localeCompare(b.slug));
  const rows = sorted
    .map(
      (r) => `      <tr>
        <td><a href="${escapeHtml(r.relativeIndex)}">${escapeHtml(r.slug)}</a></td>
        <td>${escapeHtml(r.productName)}</td>
        <td>${escapeHtml(String(r.manifest.lifecycleStatus))}</td>
        <td>${escapeHtml(String(r.manifest.researchSource))}</td>
        <td>${escapeHtml(String(r.manifest.readinessScore))}</td>
      </tr>`
    )
    .join('\n');
  const css = `
body { margin: 0; font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; }
header { padding: 24px 32px; border-bottom: 1px solid #30363d; background: #161b22; }
header h1 { margin: 0; font-size: 22px; }
main { padding: 24px 32px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #30363d; vertical-align: top; }
th { color: #8b949e; }
a { color: #58a6ff; text-decoration: none; }
a:hover { text-decoration: underline; }
`.trim();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MVP Builder demo portfolio</title>
  <style>
${css}
  </style>
</head>
<body>
  <header>
    <h1 data-testid="portfolio-title">MVP Builder demo portfolio</h1>
  </header>
  <main>
    <table data-testid="portfolio-table">
      <thead>
        <tr>
          <th>Slug</th>
          <th>Product</th>
          <th>Lifecycle</th>
          <th>Research source</th>
          <th>Readiness</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Build pipeline
// ---------------------------------------------------------------------------

function buildSingle(workspace: string, outDir: string): BuildResult {
  if (!dirExists(workspace)) {
    throw new Error(`Workspace not found: ${workspace}`);
  }
  const snapshot = loadWorkspace(workspace);
  const slug = slugify(snapshot.manifest.productName);
  ensureDir(outDir);
  const indexPath = path.join(outDir, 'index.html');
  const specPath = path.join(outDir, `${slug}.spec.ts`);
  fs.writeFileSync(indexPath, renderHtml(snapshot), 'utf8');
  fs.writeFileSync(specPath, renderSpec(snapshot, slug), 'utf8');
  return {
    slug,
    productName: snapshot.manifest.productName,
    manifest: snapshot.manifest,
    outDir,
    relativeIndex: 'index.html'
  };
}

function discoverWorkspaces(root: string): { key: string; workspace: string }[] {
  if (!dirExists(root)) {
    throw new Error(`Packages root not found: ${root}`);
  }
  const out: { key: string; workspace: string }[] = [];
  const entries = fs.readdirSync(root).sort();
  for (const entry of entries) {
    const childDir = path.join(root, entry);
    if (!dirExists(childDir)) continue;
    // Two layouts:
    //   <root>/<key>/mvp-builder-workspace/...
    //   <root>/<key>/...               (treated as workspace itself if it has repo/manifest.json)
    const nested = path.join(childDir, 'mvp-builder-workspace');
    if (dirExists(nested) && fileExists(path.join(nested, 'repo', 'manifest.json'))) {
      out.push({ key: entry, workspace: nested });
      continue;
    }
    if (fileExists(path.join(childDir, 'repo', 'manifest.json'))) {
      out.push({ key: entry, workspace: childDir });
    }
  }
  return out;
}

function buildBatch(packagesRoot: string, outDir: string): BuildResult[] {
  const found = discoverWorkspaces(packagesRoot);
  if (!found.length) {
    throw new Error(`No workspaces discovered under ${packagesRoot}.`);
  }
  ensureDir(outDir);
  const results: BuildResult[] = [];
  for (const { key, workspace } of found) {
    const subOut = path.join(outDir, key);
    const built = buildSingle(workspace, subOut);
    results.push({
      ...built,
      relativeIndex: `${key}/index.html`
    });
  }
  // Portfolio index.
  const portfolioPath = path.join(outDir, 'index.html');
  fs.writeFileSync(portfolioPath, renderPortfolio(results), 'utf8');
  return results;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv);
  if (args.packagePath) {
    const result = buildSingle(args.packagePath, args.outDir);
    console.log(`build-demo: wrote ${path.join(result.outDir, 'index.html')}`);
    console.log(`build-demo: wrote ${path.join(result.outDir, `${result.slug}.spec.ts`)}`);
    return;
  }
  if (args.packagesDir) {
    const results = buildBatch(args.packagesDir, args.outDir);
    console.log(`build-demo: emitted ${results.length} demo(s) and a portfolio index in ${args.outDir}`);
    for (const r of results) {
      console.log(`  - ${r.slug} -> ${r.relativeIndex}`);
    }
    return;
  }
  throw new Error('No mode selected.');
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`build-demo failed: ${message}`);
  process.exitCode = 1;
}
