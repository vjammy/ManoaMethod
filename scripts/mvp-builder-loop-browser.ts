#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { fileExists, getArg, readTextFile, resolvePackageRoot } from './mvp-builder-package-utils';
import type { FlowSpec, FlowStep } from '../lib/generator/implementation-contract';

type RuntimeTarget = {
  url: string;
  startCommand: string;
  smokeRoutes: string[];
  startTimeoutMs: number;
};

type EntityFixture = {
  entityName: string;
  reqIds: string[];
  /** E1: Map REQ-ID → actor slug parsed from "REQ-3 (child-user)" annotations. */
  reqActorIds: Record<string, string>;
  happyPath: Record<string, unknown> | null;
  negativePath: Record<string, unknown> | null;
  /** E2: Multi-category samples parsed from "### Sample <category>: <id>" blocks. Empty arrays when the entity uses the legacy 1+1 form. */
  samples: {
    happy: ParsedSample[];
    negative: ParsedSample[];
    boundary: ParsedSample[];
    rolePermission: ParsedSample[];
  };
};

type ParsedSample = {
  id: string;
  actorId?: string;
  reason?: string;
  note?: string;
  data: Record<string, unknown> | null;
};

type RequirementRecord = {
  reqId: string;
  title: string;
  entityName: string;
  happyPathSummary: string;
};

type ReqCoverageResult = {
  reqId: string;
  entityName: string;
  status: 'covered' | 'partially-covered' | 'uncovered';
  evidencePaths: string[];
  notes: string[];
  consoleErrors: string[];
  textMatches: string[];
  testResultsVerified: boolean;
};

// E3b: New per-actor flow-runner shapes. The runner consumes the
// `phases/<slug>/PLAYWRIGHT_FLOWS/<flowId>.json` files E3a emits, drives one
// browser context per flow with mock-auth, and aggregates console errors and
// failed network requests per flow.
type LoadedFlow = FlowSpec & { phaseSlug: string; absolutePath: string };

type FlowStepResult = {
  index: number;
  kind: FlowStep['kind'];
  passed: boolean;
  detail: string;
};

type FlowExecutionResult = {
  flowId: string;
  phaseSlug: string;
  actorId: string;
  workflowName: string;
  reqIds: string[];
  status: 'passed' | 'failed' | 'skipped-not-built';
  happySteps: FlowStepResult[];
  negativeSteps: FlowStepResult[];
  rolePermissionSteps: FlowStepResult[];
  consoleErrors: string[];
  failedRequests: string[];
  screenshotPaths: string[];
  notes: string[];
};

type SkipReason = 'no-runtime' | 'no-playwright' | 'runtime-down' | null;

type BrowserLoopOutcome = {
  startedAt: string;
  finishedAt: string;
  baseUrl: string;
  startSucceeded: boolean;
  probePassed: boolean;
  probeNotes: string[];
  totalRequirements: number;
  coveredRequirements: number;
  partiallyCoveredRequirements: number;
  uncoveredRequirements: number;
  reqResults: ReqCoverageResult[];
  outcomeScore: number;
  legacyScore: number;
  evidenceDir: string;
  evidenceReportPath: string;
  playwrightAvailable: boolean;
  playwrightInstallHint?: string;
  verifiedReqIds: string[];
  // E3b additions
  flowResults: FlowExecutionResult[];
  totalFlows: number;
  flowsExecuted: number;
  totalSteps: number;
  passedSteps: number;
  totalConsoleErrors: number;
  totalFailedRequests: number;
  skipReason: SkipReason;
};

function parseRuntimeTarget(packageRoot: string): RuntimeTarget {
  const filePath = path.join(packageRoot, 'RUNTIME_TARGET.md');
  if (!fileExists(filePath)) {
    throw new Error(
      'RUNTIME_TARGET.md not found in package root. Generate the workspace with the latest MVP Builder or add it manually.'
    );
  }
  const content = readTextFile(filePath);
  const url = (content.match(/Base URL:\s*([^\n]+)/i)?.[1] || '').trim();
  const command = (content.match(/Command:\s*([^\n]+)/i)?.[1] || '').trim();
  const timeoutMatch = content.match(/under\s+(\d+)\s+seconds/i);
  const startTimeoutMs = timeoutMatch ? Number.parseInt(timeoutMatch[1], 10) * 1000 : 60000;
  const routesSection = content.split(/##\s+Smoke routes/i)[1]?.split(/\n##\s+/)[0] || '';
  const smokeRoutes = routesSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
  if (!url) throw new Error('RUNTIME_TARGET.md is missing a Base URL line.');
  if (!command) throw new Error('RUNTIME_TARGET.md is missing a Command line.');
  return {
    url,
    startCommand: command,
    smokeRoutes: smokeRoutes.length ? smokeRoutes : ['/'],
    startTimeoutMs
  };
}

function parseEntityFixtures(packageRoot: string): EntityFixture[] {
  const filePath = path.join(packageRoot, 'SAMPLE_DATA.md');
  if (!fileExists(filePath)) return [];
  const content = readTextFile(filePath);
  const sections = content.split(/\n## /).slice(1);
  const fixtures: EntityFixture[] = [];
  for (const section of sections) {
    const headerLine = section.split('\n')[0].trim();
    if (!headerLine || /^What this/i.test(headerLine) || /^How to use/i.test(headerLine) || /^Naming/i.test(headerLine) || /^Update/i.test(headerLine) || /^What this file is NOT/i.test(headerLine)) {
      continue;
    }
    const entityName = headerLine.trim();
    const reqLineMatch = section.match(/Used by requirements:\s*([^\n]+)/i);
    // E1: accept "REQ-N" and "REQ-N (actor-id)" annotations, capturing both ID
    // and optional actor for downstream consumers (the actor mapping is
    // surfaced explicitly in the new EntityFixture.reqActorIds map).
    const reqLineRaw = reqLineMatch?.[1] || '';
    const reqMatches = Array.from(reqLineRaw.matchAll(/REQ-(\d+)(?:\s*\(([^)]+)\))?/gi));
    const reqIds = reqMatches.map((m) => `REQ-${m[1]}`.toUpperCase());
    const reqActorIds: Record<string, string> = {};
    for (const m of reqMatches) {
      const reqId = `REQ-${m[1]}`.toUpperCase();
      if (m[2]) reqActorIds[reqId] = m[2].trim();
    }
    const jsonBlocks = Array.from(section.matchAll(/```json\n([\s\S]*?)\n```/g)).map((match) => match[1]);
    const safeParse = (raw: string | undefined) => {
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    };
    // E2: Walk "### Sample <category>: <id>" subsections. Each subsection
    // captures optional Actor / Reason / Note metadata lines and the JSON
    // payload that follows. Categories normalize to happy / negative /
    // boundary / rolePermission.
    const samples: EntityFixture['samples'] = { happy: [], negative: [], boundary: [], rolePermission: [] };
    const sampleSections = Array.from(
      section.matchAll(
        /###\s+Sample\s+(happy|negative|boundary|role-permission)\s*:\s*([^\n—]+?)(?:\s+—\s+([^\n]+))?\n([\s\S]*?)(?=\n###\s+Sample\s+(?:happy|negative|boundary|role-permission)\s*:|\n##\s|\n#\s|$)/gi
      )
    );
    for (const match of sampleSections) {
      const categoryRaw = match[1].toLowerCase();
      const id = match[2].trim();
      const body = match[4] || '';
      const actorMatch = body.match(/-\s*Actor:\s*([^\n]+)/i);
      const reasonMatch = body.match(/-\s*Reason:\s*([^\n]+)/i);
      const noteMatch = body.match(/-\s*Note:\s*([^\n]+)/i);
      const jsonMatch = body.match(/```json\n([\s\S]*?)\n```/);
      const data = safeParse(jsonMatch?.[1]);
      const sample: ParsedSample = {
        id,
        actorId: actorMatch?.[1]?.trim(),
        reason: reasonMatch?.[1]?.trim(),
        note: noteMatch?.[1]?.trim(),
        data
      };
      const key: keyof EntityFixture['samples'] =
        categoryRaw === 'role-permission'
          ? 'rolePermission'
          : (categoryRaw as 'happy' | 'negative' | 'boundary');
      samples[key].push(sample);
    }
    // Legacy fallback: if no "### Sample" headings exist, treat the first two
    // ```json blocks as happy / negative for back-compat with workspaces that
    // predate E2.
    let happyPath: Record<string, unknown> | null = null;
    let negativePath: Record<string, unknown> | null = null;
    if (samples.happy.length || samples.negative.length) {
      happyPath = samples.happy[0]?.data || null;
      negativePath = samples.negative[0]?.data || null;
    } else {
      happyPath = safeParse(jsonBlocks[0]);
      negativePath = safeParse(jsonBlocks[1]);
    }
    fixtures.push({
      entityName,
      reqIds,
      reqActorIds,
      happyPath,
      negativePath,
      samples
    });
  }
  return fixtures;
}

function loadVerifiedReqIds(packageRoot: string): Set<string> {
  const verified = new Set<string>();
  const phasesDir = path.join(packageRoot, 'phases');
  if (!fileExists(phasesDir)) return verified;
  const phaseSlugs = fs.readdirSync(phasesDir).filter((entry) => /^phase-\d+$/.test(entry));
  for (const slug of phaseSlugs) {
    const resultsPath = path.join(phasesDir, slug, 'TEST_RESULTS.md');
    if (!fileExists(resultsPath)) continue;
    const content = readTextFile(resultsPath);
    const finalResult = (content.match(/##\s*Final result:\s*(.+)/i)?.[1] || '').trim().toLowerCase();
    if (finalResult !== 'pass' && finalResult !== 'passed') continue;
    // Look for "Scenario evidence: REQ-N" markers with at least one non-template line of body content.
    const sectionMatcher = /Scenario evidence:\s*(REQ-\d+)([\s\S]*?)(?=Scenario evidence:|\n##\s|$)/gi;
    let sectionMatch: RegExpExecArray | null;
    while ((sectionMatch = sectionMatcher.exec(content)) !== null) {
      const reqId = sectionMatch[1].toUpperCase();
      const body = sectionMatch[2] || '';
      const meaningfulLines = body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && line !== '-' && line.toLowerCase() !== 'pending' && !/^allowed:/i.test(line));
      if (meaningfulLines.length >= 1) verified.add(reqId);
    }
  }
  return verified;
}

function parseRequirementRecords(packageRoot: string): RequirementRecord[] {
  const acceptancePath = path.join(packageRoot, 'requirements', 'ACCEPTANCE_CRITERIA.md');
  if (!fileExists(acceptancePath)) return [];
  const content = readTextFile(acceptancePath);
  const blocks = content.split(/\n## /).slice(1);
  const records: RequirementRecord[] = [];
  for (const block of blocks) {
    const headerLine = block.split('\n')[0].trim();
    const titleMatch = headerLine.match(/^\d+\.\s+(.+)$/);
    const title = titleMatch?.[1]?.trim() || headerLine;
    const reqIdMatch = block.match(/Requirement ID:\s*(REQ-\d+)/i);
    if (!reqIdMatch) continue;
    const reqId = reqIdMatch[1].toUpperCase();
    const sampleDataLineMatch = block.match(/Sample data:\s*see SAMPLE_DATA\.md\s+"([^"]+)"\s+section/i);
    const entityName = sampleDataLineMatch?.[1]?.trim() || '';
    const happyPathMatch = block.match(/Inline reference:\s*([^\n]+)/i);
    const happyPathSummary = happyPathMatch?.[1]?.trim() || '';
    records.push({ reqId, title, entityName, happyPathSummary });
  }
  return records;
}

function probeBaseUrl(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number | null; error?: string }> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      resolve({ ok: false, status: null, error: 'Invalid URL.' });
      return;
    }
    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.request(
      {
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}` || '/',
        timeout: timeoutMs
      },
      (response) => {
        const status = response.statusCode || null;
        response.resume();
        resolve({ ok: status !== null && status >= 200 && status < 400, status });
      }
    );
    request.on('error', (error) => resolve({ ok: false, status: null, error: error.message }));
    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
      resolve({ ok: false, status: null, error: 'timeout' });
    });
    request.end();
  });
}

async function waitForUrl(url: string, totalTimeoutMs: number, pollIntervalMs = 1000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < totalTimeoutMs) {
    const result = await probeBaseUrl(url, 3000);
    if (result.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

function spawnRuntime(target: RuntimeTarget, packageRoot: string): ChildProcess {
  const isWindows = process.platform === 'win32';
  return spawn(target.startCommand, {
    cwd: packageRoot,
    shell: isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh',
    stdio: 'ignore',
    detached: !isWindows
  });
}

function killRuntime(child: ChildProcess) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    // ignore
  }
}

async function loadPlaywright(): Promise<{ chromium: any } | null> {
  try {
    // Indirect dynamic import so TypeScript does not require @types/playwright
    // and so Playwright stays an optional peer dependency.
    const dynamicImport = new Function('mod', 'return import(mod)') as (mod: string) => Promise<unknown>;
    const mod = (await dynamicImport('playwright')) as { chromium?: any } | undefined;
    if (mod && mod.chromium) return { chromium: mod.chromium };
    return null;
  } catch {
    return null;
  }
}

function uniqueStringValues(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const values: string[] = [];
  for (const value of Object.values(payload)) {
    if (typeof value === 'string' && value.trim().length >= 3) values.push(value.trim());
    if (typeof value === 'number') values.push(String(value));
  }
  return Array.from(new Set(values));
}

// ---- E3b: Flow discovery, mock-auth, sample resolution ---------------------

/**
 * Walk `phases/phase-*\/PLAYWRIGHT_FLOWS/*.json`, JSON.parse each file, and
 * return the union as `LoadedFlow[]`. Malformed files are warned about and
 * skipped so a single bad file does not abort the runner.
 */
function discoverFlows(packageRoot: string): LoadedFlow[] {
  const flows: LoadedFlow[] = [];
  const phasesDir = path.join(packageRoot, 'phases');
  if (!fileExists(phasesDir)) return flows;
  const phaseSlugs = fs.readdirSync(phasesDir).filter((entry) => /^phase-\d+$/.test(entry));
  for (const slug of phaseSlugs) {
    const flowDir = path.join(phasesDir, slug, 'PLAYWRIGHT_FLOWS');
    if (!fileExists(flowDir)) continue;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(flowDir).filter((name) => name.toLowerCase().endsWith('.json'));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolutePath = path.join(flowDir, entry);
      try {
        const raw = fs.readFileSync(absolutePath, 'utf8');
        const parsed = JSON.parse(raw) as FlowSpec;
        if (!parsed || typeof parsed !== 'object' || !parsed.flowId || !Array.isArray(parsed.steps)) {
          console.warn(`Skipping malformed flow file (missing required fields): ${absolutePath}`);
          continue;
        }
        flows.push({
          ...parsed,
          phaseSlug: slug,
          absolutePath,
          // Defensive: tolerate older flow JSONs missing optional arrays.
          negativeSteps: Array.isArray(parsed.negativeSteps) ? parsed.negativeSteps : [],
          rolePermissionSteps: Array.isArray(parsed.rolePermissionSteps) ? parsed.rolePermissionSteps : [],
          reqIds: Array.isArray(parsed.reqIds) ? parsed.reqIds : []
        });
      } catch (error) {
        console.warn(`Skipping malformed flow file (parse error): ${absolutePath} — ${(error as Error).message}`);
      }
    }
  }
  return flows;
}

/**
 * Append `?<param>=<value>` to a URL when not already present. The mock-auth
 * contract documented in BROWSER_AUTOMATION_GUIDE.md uses `?as=<actorId>` so
 * the application can hydrate the session as the chosen actor.
 */
export function applyMockAuth(
  url: string,
  login: { strategy: 'query-string'; param: string; value: string }
): string {
  if (!login || !login.param || login.value === undefined || login.value === null) return url;
  // url is typically a path like "/dashboard"; URL.parse can't handle bare
  // paths, so do the work manually with care for existing query strings and
  // hash fragments.
  const hashIdx = url.indexOf('#');
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
  const beforeHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const queryIdx = beforeHash.indexOf('?');
  const path = queryIdx >= 0 ? beforeHash.slice(0, queryIdx) : beforeHash;
  const query = queryIdx >= 0 ? beforeHash.slice(queryIdx + 1) : '';
  const params = new URLSearchParams(query);
  if (params.has(login.param)) return url;
  params.append(login.param, String(login.value));
  return `${path}?${params.toString()}${hash}`;
}

/**
 * Parse `EntityName.sampleId.field` and look up the value across all four E2
 * sample categories (happy / negative / boundary / rolePermission). Falls back
 * to the legacy `happyPath` / `negativePath` payloads when the multi-category
 * arrays are empty. Returns `null` when the reference cannot be resolved.
 */
export function resolveSampleValue(reference: string, fixtures: EntityFixture[]): string | null {
  if (!reference || typeof reference !== 'string') return null;
  const parts = reference.split('.');
  if (parts.length < 3) return null;
  const entityName = parts[0];
  const sampleId = parts[1];
  const field = parts.slice(2).join('.');
  const fixture = fixtures.find((f) => f.entityName === entityName);
  if (!fixture) return null;
  const candidates: Array<Record<string, unknown> | null> = [];
  for (const sample of fixture.samples.happy) {
    if (sample.id === sampleId) candidates.push(sample.data);
  }
  for (const sample of fixture.samples.negative) {
    if (sample.id === sampleId) candidates.push(sample.data);
  }
  for (const sample of fixture.samples.boundary) {
    if (sample.id === sampleId) candidates.push(sample.data);
  }
  for (const sample of fixture.samples.rolePermission) {
    if (sample.id === sampleId) candidates.push(sample.data);
  }
  // Legacy single-sample fallback: try happyPath / negativePath when the
  // multi-category arrays are empty.
  if (!candidates.length) {
    if (fixture.happyPath) candidates.push(fixture.happyPath);
    if (fixture.negativePath) candidates.push(fixture.negativePath);
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = (candidate as Record<string, unknown>)[field];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return null;
}

function joinUrl(baseUrl: string, suffix: string): string {
  if (!suffix) return baseUrl;
  if (/^https?:\/\//i.test(suffix)) return suffix;
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${trimmedBase}${trimmedSuffix}`;
}

async function executeFlowSteps(args: {
  page: any;
  baseUrl: string;
  steps: FlowStep[];
  fixtures: EntityFixture[];
  login: FlowSpec['loginMock'];
  evidenceDir: string;
  flowId: string;
  phase: string;
  category: 'happy' | 'negative' | 'rolePermission';
  screenshotPaths: string[];
}): Promise<FlowStepResult[]> {
  const { page, baseUrl, steps, fixtures, login, evidenceDir, flowId, phase, category, screenshotPaths } = args;
  const results: FlowStepResult[] = [];
  const flowDir = path.join(evidenceDir, phase, flowId);
  fs.mkdirSync(flowDir, { recursive: true });

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    let passed = false;
    let detail = '';
    try {
      switch (step.kind) {
        case 'goto': {
          const targetPath = applyMockAuth(step.url, login);
          const fullUrl = joinUrl(baseUrl, targetPath);
          const response = await page.goto(fullUrl, { waitUntil: 'load', timeout: 30000 });
          const status = response?.status?.() ?? null;
          if (status !== null && status >= 400) {
            detail = `goto ${fullUrl} returned HTTP ${status}.`;
            passed = false;
          } else {
            detail = `Loaded ${fullUrl} (status ${status ?? 'unknown'}).`;
            passed = true;
          }
          break;
        }
        case 'click': {
          const locator = page.getByTestId(step.testId);
          await locator.first().click({ timeout: 10000 });
          detail = `Clicked testid="${step.testId}".`;
          passed = true;
          break;
        }
        case 'fill': {
          let value = step.literalValue ?? '';
          if (!value && step.valueFromSample) {
            const resolved = resolveSampleValue(step.valueFromSample, fixtures);
            if (resolved !== null) value = resolved;
          }
          const locator = page.getByTestId(step.testId);
          await locator.first().fill(value, { timeout: 10000 });
          detail = `Filled testid="${step.testId}" with "${value.slice(0, 60)}".`;
          passed = true;
          break;
        }
        case 'assertRoute': {
          const currentUrl: string = page.url();
          const matched = currentUrl.includes(step.match);
          detail = matched
            ? `Current URL "${currentUrl}" contains "${step.match}".`
            : `Current URL "${currentUrl}" does not contain "${step.match}".`;
          passed = matched;
          break;
        }
        case 'assertText': {
          const html = (await page.content().catch(() => '')) || '';
          const stripped = html.replace(/<[^>]*>/g, ' ').toLowerCase();
          const needle = (step.text || '').toLowerCase();
          let matched = needle ? stripped.includes(needle) : false;
          if (!matched && step.testId) {
            const locator = page.getByTestId(step.testId);
            const count = await locator.count().catch(() => 0);
            if (count > 0) {
              matched = true;
              detail = `Text "${step.text}" not found, but testid="${step.testId}" exists on the page.`;
            }
          }
          if (!detail) {
            detail = matched
              ? `Page contains text "${step.text}".`
              : `Page does not contain text "${step.text}".`;
          }
          passed = matched;
          break;
        }
        default: {
          detail = `Unknown step kind: ${(step as { kind?: string }).kind || 'unknown'}.`;
          passed = false;
        }
      }
    } catch (error) {
      detail = `Error executing ${step.kind}: ${(error as Error).message}`.slice(0, 500);
      passed = false;
    }

    // Snapshot per step. Encode category into the filename so the three step
    // arrays do not collide when they share an index.
    const screenshotPath = path.join(flowDir, `${category}-step-${String(i + 1).padStart(2, '0')}.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshotPaths.push(path.relative(evidenceDir, screenshotPath).replace(/\\/g, '/'));
    } catch {
      // Screenshot failure shouldn't abort the step.
    }

    results.push({
      index: i,
      kind: step.kind,
      passed,
      detail
    });
  }

  return results;
}

async function runFlows(args: {
  browser: any;
  baseUrl: string;
  flows: LoadedFlow[];
  fixtures: EntityFixture[];
  evidenceDir: string;
}): Promise<FlowExecutionResult[]> {
  const { browser, baseUrl, flows, fixtures, evidenceDir } = args;
  const results: FlowExecutionResult[] = [];

  for (const flow of flows) {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const screenshotPaths: string[] = [];
    const notes: string[] = [];

    let context: any = null;
    let page: any = null;
    let status: FlowExecutionResult['status'] = 'failed';
    let happySteps: FlowStepResult[] = [];
    let negativeSteps: FlowStepResult[] = [];
    let rolePermissionSteps: FlowStepResult[] = [];

    try {
      context = await browser.newContext();
      page = await context.newPage();

      page.on('console', (message: any) => {
        try {
          if (message.type() === 'error') consoleErrors.push(String(message.text()).slice(0, 500));
        } catch {
          // ignore listener errors
        }
      });
      page.on('pageerror', (error: any) => {
        consoleErrors.push(String(error?.message || error).slice(0, 500));
      });
      page.on('requestfailed', (request: any) => {
        try {
          const failure = request.failure?.();
          failedRequests.push(`${request.url()} (${failure?.errorText || 'failed'})`.slice(0, 500));
        } catch {
          // ignore
        }
      });
      page.on('response', (response: any) => {
        try {
          const code = response.status?.();
          if (typeof code === 'number' && code >= 400) {
            failedRequests.push(`${response.url()} → HTTP ${code}`.slice(0, 500));
          }
        } catch {
          // ignore
        }
      });

      // Probe the first goto step. If 404, mark the flow as skipped-not-built
      // and move on without running steps. This keeps unbuilt phases from
      // poisoning the cleanliness penalty.
      const firstGoto = flow.steps.find((s) => s.kind === 'goto') as
        | Extract<FlowStep, { kind: 'goto' }>
        | undefined;
      if (firstGoto) {
        const probeUrl = joinUrl(baseUrl, applyMockAuth(firstGoto.url, flow.loginMock));
        const probe = await probeBaseUrl(probeUrl, 5000);
        if (probe.status === 404) {
          status = 'skipped-not-built';
          notes.push(`First goto ${probeUrl} returned 404. Flow skipped — feature is not built yet.`);
          results.push({
            flowId: flow.flowId,
            phaseSlug: flow.phaseSlug,
            actorId: flow.actorId,
            workflowName: flow.workflowName,
            reqIds: flow.reqIds,
            status,
            happySteps: [],
            negativeSteps: [],
            rolePermissionSteps: [],
            consoleErrors,
            failedRequests,
            screenshotPaths,
            notes
          });
          continue;
        }
      }

      happySteps = await executeFlowSteps({
        page,
        baseUrl,
        steps: flow.steps,
        fixtures,
        login: flow.loginMock,
        evidenceDir,
        flowId: flow.flowId,
        phase: flow.phaseSlug,
        category: 'happy',
        screenshotPaths
      });
      negativeSteps = await executeFlowSteps({
        page,
        baseUrl,
        steps: flow.negativeSteps,
        fixtures,
        login: flow.loginMock,
        evidenceDir,
        flowId: flow.flowId,
        phase: flow.phaseSlug,
        category: 'negative',
        screenshotPaths
      });
      rolePermissionSteps = await executeFlowSteps({
        page,
        baseUrl,
        steps: flow.rolePermissionSteps,
        fixtures,
        login: flow.loginMock,
        evidenceDir,
        flowId: flow.flowId,
        phase: flow.phaseSlug,
        category: 'rolePermission',
        screenshotPaths
      });

      const allSteps = [...happySteps, ...negativeSteps, ...rolePermissionSteps];
      const anyFailed = allSteps.some((s) => !s.passed);
      status = anyFailed ? 'failed' : 'passed';
    } catch (error) {
      notes.push(`Flow execution error: ${(error as Error).message}`.slice(0, 500));
      status = 'failed';
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }

    results.push({
      flowId: flow.flowId,
      phaseSlug: flow.phaseSlug,
      actorId: flow.actorId,
      workflowName: flow.workflowName,
      reqIds: flow.reqIds,
      status,
      happySteps,
      negativeSteps,
      rolePermissionSteps,
      consoleErrors,
      failedRequests,
      screenshotPaths,
      notes
    });
  }

  return results;
}

// ---- Legacy fallback (kept for workspaces without flow files) --------------

async function runReqCoverage(args: {
  page: any;
  baseUrl: string;
  fixtures: EntityFixture[];
  requirements: RequirementRecord[];
  evidenceDir: string;
  verifiedReqs: Set<string>;
}): Promise<ReqCoverageResult[]> {
  const { page, baseUrl, fixtures, requirements, evidenceDir, verifiedReqs } = args;
  const results: ReqCoverageResult[] = [];
  const fixtureByEntity = new Map(fixtures.map((fixture) => [fixture.entityName, fixture]));

  const consoleErrors: string[] = [];
  page.on('console', (message: any) => {
    if (message.type() === 'error') consoleErrors.push(String(message.text()).slice(0, 500));
  });
  page.on('pageerror', (error: any) => {
    consoleErrors.push(String(error?.message || error).slice(0, 500));
  });

  // Land on base URL once and capture the rendered text/screenshot
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  const baseSnapshotPath = path.join(evidenceDir, 'base-url.png');
  await page.screenshot({ path: baseSnapshotPath, fullPage: true }).catch(() => {});
  const baseText = (await page.content().catch(() => ''))?.toLowerCase() || '';

  for (const requirement of requirements) {
    const fixture = fixtureByEntity.get(requirement.entityName);
    const evidencePaths = [path.relative(evidenceDir, baseSnapshotPath).replace(/\\/g, '/')];
    const notes: string[] = [];
    const errorsBefore = consoleErrors.length;
    const textMatches: string[] = [];

    const testResultsVerified = verifiedReqs.has(requirement.reqId);

    if (!fixture || !fixture.happyPath) {
      notes.push('No SAMPLE_DATA.md fixture matched this requirement.');
      results.push({
        reqId: requirement.reqId,
        entityName: requirement.entityName,
        status: 'uncovered',
        evidencePaths,
        notes,
        consoleErrors: [],
        textMatches,
        testResultsVerified
      });
      continue;
    }

    const tokens = uniqueStringValues(fixture.happyPath);
    if (requirement.entityName) tokens.unshift(requirement.entityName);
    for (const token of tokens) {
      if (token && baseText.includes(token.toLowerCase())) textMatches.push(token);
    }

    let status: ReqCoverageResult['status'];
    if (textMatches.length >= 2 && testResultsVerified) {
      status = 'covered';
      notes.push('Entity name and a happy-path field rendered on the page AND TEST_RESULTS.md records pass evidence for this REQ.');
    } else if (textMatches.length >= 2 && !testResultsVerified) {
      status = 'partially-covered';
      notes.push('Tokens render on the page but TEST_RESULTS.md does not record pass evidence for this REQ. Run TEST_SCRIPT.md and paste the happy-path + negative-path observations under "Scenario evidence: ' + requirement.reqId + '" in the owning phase TEST_RESULTS.md to upgrade to covered.');
    } else if (textMatches.length === 1) {
      status = 'partially-covered';
      notes.push('Only one happy-path token appeared on the rendered page. Drive the actual workflow to fully cover this requirement.');
    } else {
      status = 'uncovered';
      notes.push('No happy-path tokens were found on the base URL render. Either the route is wrong or the feature is not built yet.');
    }

    if (consoleErrors.length > errorsBefore) {
      notes.push('Console errors fired during this scenario; see consoleErrors below.');
    }

    results.push({
      reqId: requirement.reqId,
      entityName: requirement.entityName,
      status,
      evidencePaths,
      notes,
      consoleErrors: consoleErrors.slice(errorsBefore),
      textMatches,
      testResultsVerified
    });
  }

  return results;
}

// ---- Promote per-flow results into ReqCoverageResult -----------------------

function promoteFlowResultsToReqCoverage(
  flowResults: FlowExecutionResult[],
  requirements: RequirementRecord[],
  verifiedReqs: Set<string>
): ReqCoverageResult[] {
  // Per the spec: "one per flowResult.reqIds[i]". Multiple flows can touch the
  // same REQ; merge into a single per-REQ record so auto-regression's grouper
  // does not see duplicates.
  const reqMap = new Map<string, ReqCoverageResult>();
  const requirementByReq = new Map(requirements.map((r) => [r.reqId, r]));

  for (const flow of flowResults) {
    if (!flow.reqIds.length) continue;
    const happyOk = flow.happySteps.length > 0 && flow.happySteps.every((s) => s.passed);
    const happyAny = flow.happySteps.some((s) => s.passed);
    const negativeOk = flow.negativeSteps.length > 0 && flow.negativeSteps.every((s) => s.passed);
    const isSkipped = flow.status === 'skipped-not-built';
    const isPassed = flow.status === 'passed';

    for (const reqId of flow.reqIds) {
      const existing = reqMap.get(reqId);
      const requirement = requirementByReq.get(reqId);
      const entityName = requirement?.entityName || existing?.entityName || '';
      const testResultsVerified = verifiedReqs.has(reqId);
      const evidencePaths = (flow.screenshotPaths || []).slice(0, 4);
      const notes: string[] = [];
      let status: ReqCoverageResult['status'];
      if (isSkipped) {
        status = 'uncovered';
        notes.push(`Flow ${flow.flowId} (${flow.workflowName}) returned 404 on first goto — feature not built yet.`);
      } else if (isPassed && happyOk && negativeOk) {
        status = 'covered';
        notes.push(`Flow ${flow.flowId} executed happy + negative steps successfully.`);
      } else if (happyAny || negativeOk) {
        status = 'partially-covered';
        notes.push(`Flow ${flow.flowId} executed but at least one step failed (happyOk=${happyOk}, negativeOk=${negativeOk}).`);
      } else {
        status = 'uncovered';
        notes.push(`Flow ${flow.flowId} failed before any happy-path step passed.`);
      }
      if (flow.consoleErrors.length) {
        notes.push(`Console errors during flow: ${flow.consoleErrors.length}.`);
      }
      if (flow.failedRequests.length) {
        notes.push(`Failed network requests during flow: ${flow.failedRequests.length}.`);
      }

      if (!existing) {
        reqMap.set(reqId, {
          reqId,
          entityName,
          status,
          evidencePaths,
          notes,
          consoleErrors: flow.consoleErrors.slice(0, 10),
          textMatches: [],
          testResultsVerified
        });
      } else {
        // Merge: prefer the better status (covered > partially-covered > uncovered).
        const rank: Record<ReqCoverageResult['status'], number> = {
          covered: 2,
          'partially-covered': 1,
          uncovered: 0
        };
        if (rank[status] > rank[existing.status]) existing.status = status;
        existing.evidencePaths = [...existing.evidencePaths, ...evidencePaths].slice(0, 8);
        existing.notes = [...existing.notes, ...notes];
        existing.consoleErrors = [...existing.consoleErrors, ...flow.consoleErrors].slice(0, 20);
      }
    }
  }

  // Backfill REQs that were declared in ACCEPTANCE_CRITERIA.md but had no flow
  // touch them, so auto-regression sees the full ledger.
  for (const requirement of requirements) {
    if (reqMap.has(requirement.reqId)) continue;
    reqMap.set(requirement.reqId, {
      reqId: requirement.reqId,
      entityName: requirement.entityName,
      status: 'uncovered',
      evidencePaths: [],
      notes: ['No flow file referenced this REQ-ID. Either no workflow covers it or the flow generator did not annotate reqIds yet.'],
      consoleErrors: [],
      textMatches: [],
      testResultsVerified: verifiedReqs.has(requirement.reqId)
    });
  }

  return Array.from(reqMap.values());
}

// ---- Score formulas --------------------------------------------------------

function calculateOutcomeScore(args: {
  probePassed: boolean;
  flows: FlowExecutionResult[];
  totalReqs: number;
  coveredReqs: number;
  partiallyCovered: number;
}): number {
  const { probePassed, flows, totalReqs, coveredReqs, partiallyCovered } = args;
  const probePoints = probePassed ? 20 : 0;
  let flowsExecutedPoints = 0;
  let stepsPassedPoints = 0;
  let coveragePoints = 0;
  let cleanlinessPoints = 10;
  if (flows.length) {
    const executed = flows.filter((f) => f.status === 'passed' || f.status === 'failed').length;
    flowsExecutedPoints = Math.round((executed / flows.length) * 20);
    const allSteps = flows.flatMap((f) => [...f.happySteps, ...f.negativeSteps, ...f.rolePermissionSteps]);
    const passed = allSteps.filter((s) => s.passed).length;
    stepsPassedPoints = allSteps.length ? Math.round((passed / allSteps.length) * 30) : 0;
    // REQ coverage: REQs whose flows ran ≥1 happy + ≥1 negative step successfully.
    const reqWithHappy = new Set<string>();
    const reqWithNegative = new Set<string>();
    for (const f of flows) {
      if (f.status !== 'passed' && f.status !== 'failed') continue;
      const happyOk = f.happySteps.some((s) => s.passed);
      const negativeOk = f.negativeSteps.some((s) => s.passed);
      for (const r of f.reqIds) {
        if (happyOk) reqWithHappy.add(r);
        if (negativeOk) reqWithNegative.add(r);
      }
    }
    let bothCovered = 0;
    reqWithHappy.forEach((r) => {
      if (reqWithNegative.has(r)) bothCovered += 1;
    });
    const denom = totalReqs > 0 ? totalReqs : Math.max(reqWithHappy.size, 1);
    coveragePoints = Math.round((bothCovered / denom) * 20);
    const consoleCount = flows.reduce((s, f) => s + f.consoleErrors.length, 0);
    const failedRequestCount = flows.reduce((s, f) => s + f.failedRequests.length, 0);
    cleanlinessPoints = Math.max(
      0,
      10 - Math.min(10, consoleCount * 2) - Math.min(10, failedRequestCount * 2)
    );
  } else if (totalReqs > 0) {
    // Legacy fallback when no flow files exist.
    const ratio = (coveredReqs + partiallyCovered * 0.5) / totalReqs;
    coveragePoints = Math.round(ratio * 50);
    cleanlinessPoints = 0;
  }
  return Math.min(
    100,
    probePoints + flowsExecutedPoints + stepsPassedPoints + coveragePoints + cleanlinessPoints
  );
}

function calculateLegacyScore(
  probePassed: boolean,
  totalReqs: number,
  coveredReqs: number,
  partiallyCovered: number
): number {
  const probePoints = probePassed ? 30 : 0;
  if (totalReqs === 0) return Math.min(100, probePoints + 70);
  const coverageRatio = (coveredReqs + partiallyCovered * 0.5) / totalReqs;
  return Math.min(100, Math.round(probePoints + coverageRatio * 70));
}

function renderEvidenceReport(outcome: BrowserLoopOutcome): string {
  const lines: string[] = [];
  lines.push(`# Browser-driven loop evidence — score ${outcome.outcomeScore}/100 (legacy ${outcome.legacyScore}/100)`);
  lines.push('');
  lines.push(`- Started at: ${outcome.startedAt}`);
  lines.push(`- Finished at: ${outcome.finishedAt}`);
  lines.push(`- Base URL: ${outcome.baseUrl}`);
  lines.push(`- Runtime started: ${outcome.startSucceeded ? 'yes' : 'no'}`);
  lines.push(`- HTTP probe passed: ${outcome.probePassed ? 'yes' : 'no'}`);
  lines.push(`- Playwright available: ${outcome.playwrightAvailable ? 'yes' : 'no'}`);
  lines.push(`- Skip reason: ${outcome.skipReason || 'none'}`);
  if (!outcome.playwrightAvailable && outcome.playwrightInstallHint) {
    lines.push(`- Install hint: ${outcome.playwrightInstallHint}`);
  }
  lines.push('');
  lines.push('## Score breakdown (E3b)');
  lines.push(`- Probe (max 20)`);
  lines.push(`- Flows executed (max 20)`);
  lines.push(`- Steps passed (max 30)`);
  lines.push(`- Coverage (max 20)`);
  lines.push(`- Cleanliness (max 10): -2 per console error, -2 per failed request, capped at 10.`);
  lines.push('');
  lines.push('## Flow summary');
  lines.push(`- Total flow files: ${outcome.totalFlows}`);
  lines.push(`- Flows executed: ${outcome.flowsExecuted}`);
  lines.push(`- Steps passed: ${outcome.passedSteps}/${outcome.totalSteps}`);
  lines.push(`- Console errors across flows: ${outcome.totalConsoleErrors}`);
  lines.push(`- Failed network requests across flows: ${outcome.totalFailedRequests}`);
  lines.push('');
  if (outcome.flowResults.length) {
    lines.push('## Per-flow results');
    lines.push('| Flow | Phase | Actor | Workflow | Status | Happy | Negative | Role | Console | Failed reqs |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const flow of outcome.flowResults) {
      const happy = `${flow.happySteps.filter((s) => s.passed).length}/${flow.happySteps.length}`;
      const negative = `${flow.negativeSteps.filter((s) => s.passed).length}/${flow.negativeSteps.length}`;
      const role = `${flow.rolePermissionSteps.filter((s) => s.passed).length}/${flow.rolePermissionSteps.length}`;
      lines.push(
        `| ${flow.flowId} | ${flow.phaseSlug} | ${flow.actorId} | ${flow.workflowName} | ${flow.status} | ${happy} | ${negative} | ${role} | ${flow.consoleErrors.length} | ${flow.failedRequests.length} |`
      );
    }
    lines.push('');
  }
  lines.push('## Per-requirement results');
  if (outcome.reqResults.length === 0) {
    if (outcome.totalRequirements === 0) {
      lines.push('No requirement records were parsed from requirements/ACCEPTANCE_CRITERIA.md.');
    } else {
      lines.push(`${outcome.totalRequirements} requirement record(s) were parsed but no scenarios ran. Likely cause: the runtime did not start, or Playwright is not installed. Resolve the probe notes above and re-run \`npm run loop:browser\`.`);
    }
    lines.push('');
  } else {
    lines.push('| REQ-ID | Entity | Status | TEST_RESULTS.md verified | Console errors | Notes |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const result of outcome.reqResults) {
      lines.push(
        `| ${result.reqId} | ${result.entityName || '_unknown_'} | ${result.status} | ${result.testResultsVerified ? 'yes' : 'no'} | ${result.consoleErrors.length} | ${result.notes.join(' ').replace(/\|/g, '\\|')} |`
      );
    }
    lines.push('');
  }
  lines.push(`## TEST_RESULTS.md verification summary`);
  lines.push(`- REQs verified by phase TEST_RESULTS.md: ${outcome.verifiedReqIds.length}/${outcome.totalRequirements}`);
  if (outcome.verifiedReqIds.length) {
    lines.push(`- Verified: ${outcome.verifiedReqIds.join(', ')}`);
  } else {
    lines.push('- No REQs are verified by TEST_RESULTS.md yet. Run TEST_SCRIPT.md and paste evidence under "Scenario evidence: REQ-N" in the owning phase TEST_RESULTS.md.');
  }
  lines.push('');
  lines.push('## Probe notes');
  for (const note of outcome.probeNotes) lines.push(`- ${note}`);
  lines.push('');
  lines.push('## Evidence directory');
  lines.push(`- ${outcome.evidenceDir}`);
  lines.push('');
  lines.push('## What this evidence proves');
  lines.push('- Probe portion: the runtime started and the base URL responded.');
  lines.push('- Flow portion: each per-actor flow file was loaded, mock-auth was applied, happy + negative + role-permission steps were executed in order, and console errors and failed network requests were captured.');
  lines.push('- Coverage portion: each REQ-ID is mapped to whichever flow(s) reference it; both happy and negative steps must pass for full coverage credit.');
  return `${lines.join('\n')}\n`;
}

export async function runBrowserLoop(): Promise<BrowserLoopOutcome> {
  const packageRoot = resolvePackageRoot(getArg('package'));
  const target = parseRuntimeTarget(packageRoot);
  const fixtures = parseEntityFixtures(packageRoot);
  const requirements = parseRequirementRecords(packageRoot);
  const verifiedReqs = loadVerifiedReqIds(packageRoot);
  const flows = discoverFlows(packageRoot);
  const startedAt = new Date().toISOString();
  const evidenceDir = path.join(packageRoot, 'evidence', 'runtime', 'browser', startedAt.replace(/[:.]/g, '-'));
  fs.mkdirSync(evidenceDir, { recursive: true });
  const probeNotes: string[] = [];
  let startSucceeded = false;
  let probePassed = false;
  let runtime: ChildProcess | null = null;
  let skipReason: SkipReason = null;
  let flowResults: FlowExecutionResult[] = [];
  let reqResults: ReqCoverageResult[] = [];

  const noUrl = (target.url || '').toLowerCase() === 'none';
  if (noUrl) {
    skipReason = 'no-runtime';
    probeNotes.push('RUNTIME_TARGET.md says Base URL: none. Skipping browser loop because there is no web runtime.');
  } else {
    runtime = spawnRuntime(target, packageRoot);
    runtime.on('error', (error) => probeNotes.push(`Runtime spawn error: ${error.message}`));
    startSucceeded = await waitForUrl(target.url, target.startTimeoutMs);
    if (!startSucceeded) {
      probeNotes.push(`Runtime did not respond at ${target.url} within ${target.startTimeoutMs}ms.`);
      skipReason = 'runtime-down';
    }
  }

  const playwright = startSucceeded ? await loadPlaywright() : null;
  const playwrightAvailable = playwright !== null;
  if (startSucceeded && !playwrightAvailable) {
    skipReason = 'no-playwright';
    probeNotes.push('Playwright is not installed in this package. Install it with `npm install --save-dev playwright` and run `npx playwright install chromium`.');
  }

  if (startSucceeded && playwright) {
    const browser = await playwright.chromium.launch({ headless: true }).catch((error: Error) => {
      probeNotes.push(`Playwright launch failed: ${error.message}`);
      return null;
    });
    if (browser) {
      try {
        if (flows.length) {
          // E3b: prefer the flow path when flow files exist.
          flowResults = await runFlows({
            browser,
            baseUrl: target.url,
            flows,
            fixtures,
            evidenceDir
          });
          // Promote per-flow outcomes into ReqCoverageResult records so
          // auto-regression's rework prompts still fire.
          reqResults = promoteFlowResultsToReqCoverage(flowResults, requirements, verifiedReqs);
          probePassed =
            flowResults.length > 0 &&
            flowResults.some((f) => f.status === 'passed' || f.status === 'failed');
          if (!flowResults.length) probePassed = true;
        } else {
          // No flow files — fall back to legacy probe-and-token coverage.
          const context = await browser.newContext();
          const page = await context.newPage();
          try {
            reqResults = await runReqCoverage({
              page,
              baseUrl: target.url,
              fixtures,
              requirements,
              evidenceDir,
              verifiedReqs
            });
            probePassed = reqResults.length > 0 && reqResults.some((result) => result.status !== 'uncovered');
            if (reqResults.length === 0) probePassed = true;
          } finally {
            await context.close().catch(() => {});
          }
        }
      } catch (error) {
        probeNotes.push(`Browser run failed: ${(error as Error).message}`);
      } finally {
        await browser.close().catch(() => {});
      }
    }
  }

  if (runtime) killRuntime(runtime);

  const finishedAt = new Date().toISOString();
  const coveredRequirements = reqResults.filter((result) => result.status === 'covered').length;
  const partiallyCoveredRequirements = reqResults.filter((result) => result.status === 'partially-covered').length;
  const uncoveredRequirements = reqResults.filter((result) => result.status === 'uncovered').length;

  // Aggregate flow-level metrics for BrowserLoopOutcome.
  const totalFlows = flows.length;
  const flowsExecuted = flowResults.filter((f) => f.status === 'passed' || f.status === 'failed').length;
  const allFlowSteps = flowResults.flatMap((f) => [...f.happySteps, ...f.negativeSteps, ...f.rolePermissionSteps]);
  const totalSteps = allFlowSteps.length;
  const passedSteps = allFlowSteps.filter((s) => s.passed).length;
  const totalConsoleErrors = flowResults.reduce((acc, f) => acc + f.consoleErrors.length, 0);
  const totalFailedRequests = flowResults.reduce((acc, f) => acc + f.failedRequests.length, 0);

  const outcomeScore = skipReason
    ? 0
    : calculateOutcomeScore({
        probePassed,
        flows: flowResults,
        totalReqs: requirements.length,
        coveredReqs: coveredRequirements,
        partiallyCovered: partiallyCoveredRequirements
      });

  const legacyScore = skipReason
    ? 0
    : calculateLegacyScore(
        probePassed,
        requirements.length,
        coveredRequirements,
        partiallyCoveredRequirements
      );

  const outcome: BrowserLoopOutcome = {
    startedAt,
    finishedAt,
    baseUrl: target.url,
    startSucceeded,
    probePassed,
    probeNotes,
    totalRequirements: requirements.length,
    coveredRequirements,
    partiallyCoveredRequirements,
    uncoveredRequirements,
    reqResults,
    outcomeScore,
    legacyScore,
    evidenceDir: path.relative(packageRoot, evidenceDir).replace(/\\/g, '/'),
    evidenceReportPath: '',
    playwrightAvailable,
    playwrightInstallHint: playwrightAvailable ? undefined : 'npm install --save-dev playwright && npx playwright install chromium',
    verifiedReqIds: Array.from(verifiedReqs).sort(),
    flowResults,
    totalFlows,
    flowsExecuted,
    totalSteps,
    passedSteps,
    totalConsoleErrors,
    totalFailedRequests,
    skipReason
  };

  const reportPath = path.join(evidenceDir, 'BROWSER_LOOP_REPORT.md');
  fs.writeFileSync(reportPath, renderEvidenceReport(outcome), 'utf8');
  outcome.evidenceReportPath = path.relative(packageRoot, reportPath).replace(/\\/g, '/');

  fs.writeFileSync(
    path.join(packageRoot, 'repo', 'mvp-builder-loop-browser-state.json'),
    `${JSON.stringify(outcome, null, 2)}\n`,
    'utf8'
  );

  if (skipReason) {
    console.log(`Browser loop SKIPPED (${skipReason}). Score 0/100. legacyScore=${legacyScore}/100. totalFlows=${totalFlows}.`);
  } else {
    console.log(
      `Browser loop score: ${outcome.outcomeScore}/100 (legacy=${legacyScore}/100, probe=${probePassed ? 'pass' : 'fail'}, flows=${flowsExecuted}/${totalFlows}, steps=${passedSteps}/${totalSteps}, console=${totalConsoleErrors}, failedReq=${totalFailedRequests}).`
    );
  }
  console.log(`Evidence: ${outcome.evidenceReportPath}`);
  if (!playwrightAvailable && startSucceeded) {
    console.log('Playwright not installed. Score reflects probe-only because the browser layer was unavailable.');
  }

  return outcome;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runBrowserLoop()
    .then((outcome) => {
      const targetScore = Number.parseInt(getArg('target') || '90', 10);
      const strict = process.argv.includes('--strict');
      // Skip-clean modes:
      // - no-runtime: exit 0 (nothing to run, never strict).
      // - no-playwright: exit 0; exit 1 with --strict.
      // - runtime-down: exit 0; exit 1 with --strict.
      // - per-flow skipped-not-built: counted in the score; normal target check.
      if (outcome.skipReason === 'no-runtime') {
        process.exitCode = 0;
        return;
      }
      if (outcome.skipReason === 'no-playwright' || outcome.skipReason === 'runtime-down') {
        process.exitCode = strict ? 1 : 0;
        return;
      }
      process.exitCode = outcome.outcomeScore >= targetScore ? 0 : 1;
    })
    .catch((error) => {
      console.error((error as Error).message);
      process.exit(1);
    });
}
