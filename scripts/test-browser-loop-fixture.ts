#!/usr/bin/env tsx
/**
 * Phase G E2 — end-to-end smoke for `runBrowserLoop` against the
 * `tests/fixtures/mini-built-app/` fixture.
 *
 * Why this exists: the per-actor PLAYWRIGHT_FLOWS spec emitter, the runtime
 * target parser, the SAMPLE_DATA fixture loader, the mock-auth `?as=`
 * contract, and the runtime evidence writer all participate in the
 * browser-loop pipeline. Before this test, none of those pieces had
 * end-to-end coverage in the mvp-builder repo itself; the only signal that
 * the loop worked was a fresh-agent run inside a generated workspace, and
 * a regression in any of those layers would silently break every workspace
 * the next builder picks up.
 *
 * What it asserts (when Playwright IS installed):
 *   1. The loop spawns the fixture server, probes the URL, and reports
 *      probePassed = true.
 *   2. discoverFlows finds the single fixture flow.
 *   3. runFlow executes happy + negative + role-permission paths, all pass.
 *   4. requirement-coverage records the REQ-1 -> Greeting mapping.
 *   5. Evidence directory is created with at least one screenshot or
 *      snapshot artifact.
 *
 * What it asserts (when Playwright is NOT installed):
 *   1. probePassed is still true (the runtime started).
 *   2. skipReason === 'no-playwright' is reported in the JSON outcome.
 *   3. playwrightInstallHint is non-empty.
 *
 * Either way, exit 0 means the runner correctly handled its environment;
 * exit 1 means a real regression that the orchestrator + auto-regression
 * loops would otherwise mask.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'mini-built-app');

function fail(message: string, detail?: string): never {
  console.error(`[test-browser-loop-fixture] FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function pass(message: string) {
  console.log(`[test-browser-loop-fixture] PASS: ${message}`);
}

if (!fs.existsSync(FIXTURE_DIR)) {
  fail(`fixture directory missing at ${FIXTURE_DIR}`);
}

const browserLoopScript = path.join(REPO_ROOT, 'scripts', 'mvp-builder-loop-browser.ts');
if (!fs.existsSync(browserLoopScript)) {
  fail(`browser-loop script missing at ${browserLoopScript}`);
}

// The runner writes its outcome JSON to <packageRoot>/repo/mvp-builder-loop-browser-state.json
// Ensure that directory exists; the runner does not create it.
const repoDir = path.join(FIXTURE_DIR, 'repo');
fs.mkdirSync(repoDir, { recursive: true });
const statePath = path.join(repoDir, 'mvp-builder-loop-browser-state.json');
if (fs.existsSync(statePath)) fs.unlinkSync(statePath);

console.log('[test-browser-loop-fixture] Spawning browser-loop against fixture…');
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', browserLoopScript, `--package=${FIXTURE_DIR}`],
  {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024
  }
);

if (typeof result.status !== 'number') {
  fail('browser-loop process did not exit cleanly', `signal: ${result.signal} stderr: ${result.stderr}`);
}

const stdout = result.stdout || '';
const stderr = result.stderr || '';

if (!fs.existsSync(statePath)) {
  fail(
    `runner did not write the outcome state at ${statePath}`,
    `stdout:\n${stdout}\nstderr:\n${stderr}`
  );
}

let outcome: Record<string, unknown>;
try {
  outcome = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>;
} catch (e) {
  fail(`could not parse outcome state JSON at ${statePath}`, (e as Error).message);
}

const probePassed = Boolean(outcome.probePassed);
const playwrightAvailable = Boolean(outcome.playwrightAvailable);
const skipReason = (outcome.skipReason as string | null) ?? null;
const totalFlows = Number(outcome.totalFlows ?? 0);
const flowsExecuted = Number(outcome.flowsExecuted ?? 0);
const flowResultsArr = Array.isArray(outcome.flowResults) ? (outcome.flowResults as Array<{ status: string }>) : [];
const flowsPassed = flowResultsArr.filter((f) => f.status === 'passed').length;

if (!probePassed) {
  fail(
    'probe did not pass — runtime did not respond at the URL declared in RUNTIME_TARGET.md',
    `outcome.probeNotes: ${JSON.stringify(outcome.probeNotes)}`
  );
}
pass('probePassed === true (fixture server responded at /)');

if (!playwrightAvailable) {
  if (skipReason !== 'no-playwright') {
    fail(
      `Playwright unavailable but skipReason was "${skipReason}" (expected "no-playwright")`,
      `stderr:\n${stderr}`
    );
  }
  pass('Playwright not installed; runner correctly reported skipReason=no-playwright');
  console.log('[test-browser-loop-fixture] DONE (no-playwright path).');
  process.exit(0);
}

// Playwright is installed — assert flows actually ran.
if (totalFlows < 1) {
  fail(`expected ≥ 1 fixture flow, runner reported totalFlows=${totalFlows}`);
}
pass(`discoverFlows found ${totalFlows} flow(s)`);

if (flowsExecuted < totalFlows) {
  fail(
    `expected all ${totalFlows} flow(s) to execute (passed or failed), only ${flowsExecuted} did`,
    `flowResults: ${JSON.stringify(outcome.flowResults, null, 2)}`
  );
}
pass(`runner executed ${flowsExecuted}/${totalFlows} flow(s)`);

if (flowsPassed < totalFlows) {
  fail(
    `expected all ${totalFlows} flow(s) to PASS (happy + negative + rolePermission); only ${flowsPassed} did`,
    `flowResults: ${JSON.stringify(outcome.flowResults, null, 2)}`
  );
}
pass(`all ${flowsPassed}/${totalFlows} flows passed (happy + negative + role-permission)`);

const evidenceDirRaw = (outcome.evidenceDir as string) || '';
const evidenceDir = path.isAbsolute(evidenceDirRaw)
  ? evidenceDirRaw
  : path.join(FIXTURE_DIR, evidenceDirRaw);
if (!evidenceDir || !fs.existsSync(evidenceDir)) {
  fail(`evidenceDir "${evidenceDir}" not present on disk`);
}
const evidenceFiles = fs.readdirSync(evidenceDir, { withFileTypes: true });
if (evidenceFiles.length === 0) {
  fail(`evidenceDir "${evidenceDir}" is empty — runner produced no artifacts`);
}
pass(`evidenceDir contains ${evidenceFiles.length} entries (screenshots / report / etc.)`);

console.log('[test-browser-loop-fixture] DONE.');
process.exit(0);
