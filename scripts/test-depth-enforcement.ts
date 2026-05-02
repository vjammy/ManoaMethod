#!/usr/bin/env node
/**
 * Tests for the depth-gate enforcement (Phase F follow-up).
 *
 * Three pure-function cases against evaluateDepthGate (no fs):
 *  T1 — Synth fails: only "always blocking" rules apply; non-synth-only rules
 *       (idea-clarity, use-case-depth, persona-depth) are NOT in blocking even
 *       when low.
 *  T2 — Agent-recipe full depth passes: all 6 F3 dims at 5, idea-clarity=5,
 *       no compliance risks → passed=true.
 *  T3 — Compliance risk + low regulatory-mapping fails: when riskCategories
 *       includes 'compliance', regulatory-mapping=2 must be blocking.
 *
 * Plus E1: end-to-end CLI run against a real workspace verifying exit code.
 *
 * Usage: npm run test:depth-enforcement
 */
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDepthGate } from '../lib/research/depth-gate';
import type { DepthGateInput } from '../lib/research/depth-gate';

function deepF3Dims(scores: Partial<Record<string, number>>) {
  // Default 5/5 unless overridden
  const all = {
    'workflow-step-realism': 5,
    'requirement-failure-variance': 5,
    'entity-field-richness': 5,
    'per-screen-acceptance-uniqueness': 5,
    'use-case-depth': 5,
    'persona-depth': 5,
    'idea-clarity': 5,
    'regulatory-mapping': 5,
    ...scores
  };
  return Object.entries(all).map(([name, score]) => ({ name, score: score as number, max: name === 'idea-clarity' || name === 'regulatory-mapping' ? 5 : 5 }));
}

function t1SynthFailsOnTemplatedCrud() {
  console.log('[T1] Synth — only "always blocking" rules fire (workflow-step-realism + entity-field-richness)…');
  const input: DepthGateInput = {
    expertDims: deepF3Dims({
      'workflow-step-realism': 3, // blocking
      'entity-field-richness': 2, // blocking
      'idea-clarity': 1,           // would-be blocking on agent-recipe; NOT on synth
      'use-case-depth': 1,         // ditto
      'persona-depth': 1           // ditto
    }),
    researchSource: 'synthesized',
    riskCategories: []
  };
  const result = evaluateDepthGate(input);
  const blockingDims = result.blocking.map((b) => b.dim).sort();
  assert.deepStrictEqual(
    blockingDims,
    ['entity-field-richness', 'workflow-step-realism'],
    `synth should ONLY have always-blocking rules in blocking, got: ${blockingDims.join(',')}`
  );
  assert.strictEqual(result.passed, false, 'synth with low always-blocking rules must fail');
  console.log(`[T1] PASS — blocking=${blockingDims.join(',')}, passed=false`);
}

function t2AgentRecipeFullDepthPasses() {
  console.log('[T2] Agent-recipe with all dims at full → passed=true…');
  const input: DepthGateInput = {
    expertDims: deepF3Dims({}), // all defaults to 5
    researchSource: 'agent-recipe',
    riskCategories: [] // no compliance/privacy risk
  };
  const result = evaluateDepthGate(input);
  assert.strictEqual(result.passed, true, `agent-recipe full depth must pass, blocking=${result.blocking.map((b) => b.dim).join(',')}`);
  assert.strictEqual(result.blocking.length, 0, 'no blocking failures expected');
  console.log(`[T2] PASS — passed=true, blocking=[], advisory=${result.advisory.length}`);
}

function t3CompliancePresentLowRegulatoryFails() {
  console.log('[T3] Compliance risk + low regulatory-mapping → blocking includes regulatory-mapping…');
  const input: DepthGateInput = {
    expertDims: deepF3Dims({
      'regulatory-mapping': 2 // < 3 → blocking when compliance risk present
    }),
    researchSource: 'agent-recipe',
    riskCategories: ['compliance', 'operational']
  };
  const result = evaluateDepthGate(input);
  const regBlock = result.blocking.find((b) => b.dim === 'regulatory-mapping');
  assert.ok(regBlock, `regulatory-mapping should be blocking when compliance risk + score<3, got blocking=${result.blocking.map((b) => b.dim).join(',')}`);
  assert.strictEqual(regBlock.score, 2);
  assert.strictEqual(regBlock.threshold, 3);
  // Without compliance risk, the same low score should NOT block
  const inputNoRisk: DepthGateInput = { ...input, riskCategories: ['operational'] };
  const resultNoRisk = evaluateDepthGate(inputNoRisk);
  const regBlockNoRisk = resultNoRisk.blocking.find((b) => b.dim === 'regulatory-mapping');
  assert.ok(!regBlockNoRisk, 'regulatory-mapping should NOT block without compliance/privacy risk');
  console.log(`[T3] PASS — regulatory-mapping blocking when compliance risk present, not otherwise`);
}

function t4AdvisoryDimsDoNotBlock() {
  console.log('[T4] Low requirement-failure-variance + low per-screen-acceptance → advisory only, passed=true…');
  const input: DepthGateInput = {
    expertDims: deepF3Dims({
      'requirement-failure-variance': 1,
      'per-screen-acceptance-uniqueness': 2
    }),
    researchSource: 'agent-recipe',
    riskCategories: []
  };
  const result = evaluateDepthGate(input);
  assert.strictEqual(result.passed, true, 'advisory-only failures must not fail the gate');
  assert.strictEqual(result.advisory.length, 2, `expected 2 advisory entries, got ${result.advisory.length}`);
  console.log(`[T4] PASS — passed=true, advisory=2`);
}

function e1EndToEndCliExitCodes() {
  console.log('[E1] End-to-end: --enforce-depth on synth iter-09 (exit=1) and agent-recipe (exit=0)…');
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(__filename), '..');
  const synthWs = path.join(repoRoot, '.tmp', 'loop-50', 'iter-09-sdr-sales-module', 'out', 'mvp-builder-workspace');
  const recipeWs = path.join(repoRoot, '.tmp', 'recipe-validation', 'out', 'mvp-builder-workspace');
  // Synth path → expected exit=1
  const synth = spawnSync(
    'npx',
    ['tsx', 'scripts/mvp-builder-quality-audit.ts', `--package=${synthWs}`, '--enforce-depth'],
    { cwd: repoRoot, encoding: 'utf8', shell: true }
  );
  assert.strictEqual(synth.status, 1, `synth iter-09 with --enforce-depth must exit 1, got ${synth.status}`);
  assert.match(synth.stdout, /Depth gate FAILED/, 'expected "Depth gate FAILED" in synth stdout');
  // Recipe path → expected exit=0
  const recipe = spawnSync(
    'npx',
    ['tsx', 'scripts/mvp-builder-quality-audit.ts', `--package=${recipeWs}`, '--enforce-depth'],
    { cwd: repoRoot, encoding: 'utf8', shell: true }
  );
  assert.strictEqual(recipe.status, 0, `agent-recipe with --enforce-depth must exit 0, got ${recipe.status}`);
  assert.match(recipe.stdout, /Depth gate passed/, 'expected "Depth gate passed" in recipe stdout');
  console.log(`[E1] PASS — synth exit=1, recipe exit=0`);
}

function main() {
  t1SynthFailsOnTemplatedCrud();
  t2AgentRecipeFullDepthPasses();
  t3CompliancePresentLowRegulatoryFails();
  t4AdvisoryDimsDoNotBlock();
  e1EndToEndCliExitCodes();
  console.log('\nAll depth-enforcement tests passed.');
}

main();
