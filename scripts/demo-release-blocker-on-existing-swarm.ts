#!/usr/bin/env tsx
/**
 * Re-aggregates the existing .tmp/swarm-builds/ output using the new
 * release-blocker semantics so the before/after fix can be inspected without
 * re-running the full 20-app build.
 *
 * Reads each app's GATE_RESULTS.md to recover the per-app gate status and the
 * release-gate failed criteria, then prints the corrected verdict and
 * recommendation each app would receive under the fixed logic.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computeReleaseBlocker,
  computeVerdict,
  qualifiedRecommendation
} from '../lib/orchestrator/score';
import type { GateResult } from '../lib/orchestrator/types';

const SWARM_ROOT = path.resolve(__dirname, '..', '.tmp', 'swarm-builds');

type AppOutcome = {
  appId: string;
  finalScore: number;
  oldVerdict: string;
  oldRecommendation: string;
  newVerdict: string;
  newRecommendation: string;
};

function parseGateResults(filePath: string): GateResult[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = content.split(/^## /gm).slice(1);
  const gates: GateResult[] = [];
  for (const section of sections) {
    const headerLine = section.split(/\r?\n/)[0]?.trim();
    if (!headerLine) continue;
    const gateName = headerLine.toLowerCase().trim() as GateResult['gate'];
    const statusMatch = section.match(/-\s*Status:\s*(pass|fail)/i);
    if (!statusMatch) continue;
    const checks: GateResult['checks'] = [];
    const failedCriteria: string[] = [];
    const checkLines = section
      .split(/\r?\n/)
      .filter((line) => /^-\s+(PASS|FAIL):/i.test(line));
    for (const line of checkLines) {
      const match = line.match(/-\s+(PASS|FAIL):\s+([^-]+)\s+-\s+(.*)$/i);
      if (!match) continue;
      const passed = match[1].toUpperCase() === 'PASS';
      const label = match[2].trim();
      const detail = match[3].trim();
      checks.push({ label, passed, detail });
      if (!passed) failedCriteria.push(label);
    }
    gates.push({
      gate: gateName,
      status: statusMatch[1].toLowerCase() as 'pass' | 'fail',
      summary: '',
      checks,
      failedCriteria
    });
  }
  return gates;
}

function findApps() {
  return fs
    .readdirSync(SWARM_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('app-'))
    .map((entry) => entry.name)
    .sort();
}

function readScore(appDir: string) {
  const summaryPath = path.join(appDir, 'swarm-app-summary.json');
  if (!fs.existsSync(summaryPath)) return { finalScore: 0, oldVerdict: 'UNKNOWN', oldRecommendation: 'UNKNOWN' };
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  return {
    finalScore: summary.finalScore as number,
    oldVerdict: summary.scoreBreakdown?.verdict ?? 'UNKNOWN',
    oldRecommendation: summary.recommendation ?? 'UNKNOWN'
  };
}

function main() {
  const apps = findApps();
  const outcomes: AppOutcome[] = [];
  for (const appName of apps) {
    const appDir = path.join(SWARM_ROOT, appName);
    const gateResultsPath = path.join(appDir, 'orchestrator', 'reports', 'GATE_RESULTS.md');
    if (!fs.existsSync(gateResultsPath)) continue;
    const gates = parseGateResults(gateResultsPath);
    const { finalScore, oldVerdict, oldRecommendation } = readScore(appDir);
    const releaseBlocker = computeReleaseBlocker(gates);
    const newVerdict = computeVerdict(finalScore, gates, releaseBlocker);
    const newRecommendation = qualifiedRecommendation(
      { verdict: newVerdict, cappedTotal: finalScore, releaseBlocker },
      gates
    );
    outcomes.push({
      appId: appName,
      finalScore,
      oldVerdict,
      oldRecommendation,
      newVerdict,
      newRecommendation
    });
  }
  console.log(
    `${'app'.padEnd(8)} ${'score'.padEnd(6)} ${'old verdict'.padEnd(28)} ${'old rec'.padEnd(28)} ${'new verdict'.padEnd(28)} new rec`
  );
  for (const o of outcomes) {
    console.log(
      `${o.appId.padEnd(8)} ${String(o.finalScore).padEnd(6)} ${o.oldVerdict.padEnd(28)} ${o.oldRecommendation.padEnd(28)} ${o.newVerdict.padEnd(28)} ${o.newRecommendation}`
    );
  }
  const allReleaseBlocked = outcomes.every((o) => o.newRecommendation === 'BUILD PASS / RELEASE NOT APPROVED');
  console.log('\nAggregate after fix:');
  console.log(`- All ${outcomes.length} apps share new recommendation 'BUILD PASS / RELEASE NOT APPROVED': ${allReleaseBlocked}`);
}

main();
