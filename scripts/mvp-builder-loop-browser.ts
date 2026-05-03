#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { fileExists, getArg, readTextFile, resolvePackageRoot } from './mvp-builder-package-utils';

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
  evidenceDir: string;
  evidenceReportPath: string;
  playwrightAvailable: boolean;
  playwrightInstallHint?: string;
  verifiedReqIds: string[];
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

function calculateOutcomeScore(probePassed: boolean, totalReqs: number, coveredReqs: number, partiallyCovered: number) {
  const probePoints = probePassed ? 30 : 0;
  if (totalReqs === 0) return Math.min(100, probePoints + 70);
  const coverageRatio = (coveredReqs + partiallyCovered * 0.5) / totalReqs;
  return Math.min(100, Math.round(probePoints + coverageRatio * 70));
}

function renderEvidenceReport(outcome: BrowserLoopOutcome): string {
  const lines: string[] = [];
  lines.push(`# Browser-driven loop evidence — score ${outcome.outcomeScore}/100`);
  lines.push('');
  lines.push(`- Started at: ${outcome.startedAt}`);
  lines.push(`- Finished at: ${outcome.finishedAt}`);
  lines.push(`- Base URL: ${outcome.baseUrl}`);
  lines.push(`- Runtime started: ${outcome.startSucceeded ? 'yes' : 'no'}`);
  lines.push(`- HTTP probe passed: ${outcome.probePassed ? 'yes' : 'no'}`);
  lines.push(`- Playwright available: ${outcome.playwrightAvailable ? 'yes' : 'no'}`);
  if (!outcome.playwrightAvailable && outcome.playwrightInstallHint) {
    lines.push(`- Install hint: ${outcome.playwrightInstallHint}`);
  }
  lines.push('');
  lines.push('## Score breakdown');
  lines.push(`- Probe (max 30): ${outcome.probePassed ? 30 : 0}`);
  lines.push(`- Requirement coverage (max 70): based on ${outcome.coveredRequirements} fully covered + ${outcome.partiallyCoveredRequirements} partially covered out of ${outcome.totalRequirements}.`);
  lines.push('');
  lines.push('## Per-requirement results');
  if (outcome.reqResults.length === 0) {
    if (outcome.totalRequirements === 0) {
      lines.push('No requirement records were parsed from requirements/ACCEPTANCE_CRITERIA.md.');
    } else {
      lines.push(`${outcome.totalRequirements} requirement record(s) were parsed but no scenarios ran. Likely cause: the runtime did not start, or Playwright is not installed. Resolve the probe notes above and re-run \`npm run loop:browser\`.`);
    }
    lines.push('');
  } else {
    lines.push('| REQ-ID | Entity | Status | TEST_RESULTS.md verified | Text matches | Console errors | Notes |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const result of outcome.reqResults) {
      lines.push(
        `| ${result.reqId} | ${result.entityName || '_unknown_'} | ${result.status} | ${result.testResultsVerified ? 'yes' : 'no'} | ${result.textMatches.join(', ').replace(/\|/g, '\\|') || '_none_'} | ${result.consoleErrors.length} | ${result.notes.join(' ').replace(/\|/g, '\\|')} |`
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
  lines.push('- Coverage portion: each REQ-ID from requirements/ACCEPTANCE_CRITERIA.md has been visited and the rendered DOM searched for the matching SAMPLE_DATA.md fixture tokens.');
  lines.push('- Limitations: this is a content-presence probe, not a full Playwright flow. Use TEST_SCRIPT.md "Requirement-driven scenario tests" sections to drive richer interactions.');
  return `${lines.join('\n')}\n`;
}

export async function runBrowserLoop(): Promise<BrowserLoopOutcome> {
  const packageRoot = resolvePackageRoot(getArg('package'));
  const target = parseRuntimeTarget(packageRoot);
  const fixtures = parseEntityFixtures(packageRoot);
  const requirements = parseRequirementRecords(packageRoot);
  const verifiedReqs = loadVerifiedReqIds(packageRoot);
  const startedAt = new Date().toISOString();
  const evidenceDir = path.join(packageRoot, 'evidence', 'runtime', 'browser', startedAt.replace(/[:.]/g, '-'));
  fs.mkdirSync(evidenceDir, { recursive: true });
  const probeNotes: string[] = [];
  let startSucceeded = false;
  let probePassed = false;
  let runtime: ChildProcess | null = null;

  if ((target.url || '').toLowerCase() === 'none') {
    probeNotes.push('RUNTIME_TARGET.md says Base URL: none. Skipping browser loop because there is no web runtime.');
  } else {
    runtime = spawnRuntime(target, packageRoot);
    runtime.on('error', (error) => probeNotes.push(`Runtime spawn error: ${error.message}`));
    startSucceeded = await waitForUrl(target.url, target.startTimeoutMs);
    if (!startSucceeded) probeNotes.push(`Runtime did not respond at ${target.url} within ${target.startTimeoutMs}ms.`);
  }

  const playwright = startSucceeded ? await loadPlaywright() : null;
  const playwrightAvailable = playwright !== null;
  let reqResults: ReqCoverageResult[] = [];

  if (startSucceeded && playwright) {
    const browser = await playwright.chromium.launch({ headless: true }).catch((error: Error) => {
      probeNotes.push(`Playwright launch failed: ${error.message}`);
      return null;
    });
    if (browser) {
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
        if (reqResults.length === 0) {
          // No requirements: still a probe success if the page rendered
          probePassed = true;
        }
      } catch (error) {
        probeNotes.push(`Browser run failed: ${(error as Error).message}`);
      } finally {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      }
    }
  } else if (startSucceeded && !playwright) {
    probeNotes.push('Playwright is not installed in this package. Install it with `npm install --save-dev playwright` and run `npx playwright install chromium`.');
  }

  if (runtime) killRuntime(runtime);

  const finishedAt = new Date().toISOString();
  const coveredRequirements = reqResults.filter((result) => result.status === 'covered').length;
  const partiallyCoveredRequirements = reqResults.filter((result) => result.status === 'partially-covered').length;
  const uncoveredRequirements = reqResults.filter((result) => result.status === 'uncovered').length;
  const outcomeScore = calculateOutcomeScore(probePassed, requirements.length, coveredRequirements, partiallyCoveredRequirements);

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
    evidenceDir: path.relative(packageRoot, evidenceDir).replace(/\\/g, '/'),
    evidenceReportPath: '',
    playwrightAvailable,
    playwrightInstallHint: playwrightAvailable ? undefined : 'npm install --save-dev playwright && npx playwright install chromium',
    verifiedReqIds: Array.from(verifiedReqs).sort()
  };

  const reportPath = path.join(evidenceDir, 'BROWSER_LOOP_REPORT.md');
  fs.writeFileSync(reportPath, renderEvidenceReport(outcome), 'utf8');
  outcome.evidenceReportPath = path.relative(packageRoot, reportPath).replace(/\\/g, '/');

  fs.writeFileSync(
    path.join(packageRoot, 'repo', 'mvp-builder-loop-browser-state.json'),
    `${JSON.stringify(outcome, null, 2)}\n`,
    'utf8'
  );

  console.log(`Browser loop score: ${outcome.outcomeScore}/100 (probe=${probePassed ? 'pass' : 'fail'}, covered=${coveredRequirements}/${requirements.length})`);
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
      const target = Number.parseInt(getArg('target') || '90', 10);
      process.exitCode = outcome.outcomeScore >= target ? 0 : 1;
    })
    .catch((error) => {
      console.error((error as Error).message);
      process.exit(1);
    });
}
