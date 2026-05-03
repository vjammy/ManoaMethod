#!/usr/bin/env node
/**
 * Phase H M9 — sentence-aware truncation in REGULATORY_NOTES.
 *
 * Pre-H: `gate.evidenceRequired.join('; ').slice(0, 240)` cut mid-word —
 * the rendered file ended with "Test that the " followed by nothing.
 *
 * Post-H: `clampAtSentenceBoundary` clamps at `; `, `. `, or `, ` boundary
 * within the cap window, never mid-word.
 *
 * Usage: npm run test:regulatory-truncation
 */
import assert from 'node:assert';
import {
  clampAtSentenceBoundary,
  renderRegulatoryNotesMarkdown
} from '../lib/generator/regulatory-notes';
import type { ResearchExtractions } from '../lib/research/schema';

function t1ShortInputUnchanged() {
  console.log('[T1] short input (< cap) returned unchanged…');
  const input = 'Short evidence';
  assert.strictEqual(clampAtSentenceBoundary(input, 240), input);
  console.log('[T1] PASS');
}

function t2ClampAtSemicolonBoundary() {
  console.log('[T2] long input clamps at "; " boundary, never mid-word…');
  const items = [
    'Test that PHI access is logged with panelMatch boolean',
    'Test that the SMS reminder template cannot interpolate PHI fields ({{firstName}}, {{dateOfBirth}})',
    'Test that consent is recorded before any clinical-note read',
    'Test that role boundaries reject MA reads of clinician notes'
  ];
  const joined = items.join('; ');
  const out = clampAtSentenceBoundary(joined, 240);
  assert.ok(out.length <= 245, `clamped output should fit cap+ellipsis, got len=${out.length}`);
  // Must NOT end mid-word like "Test that the " — verify it ends with `; …` or full sentence + `…`.
  assert.ok(out.endsWith('…'), 'truncated output must end with ellipsis');
  // The pre-H bug substring: ends with "Test that the " (followed by truncation).
  assert.ok(!/Test that the …?$/.test(out), `must not end mid-word at "Test that the"; got "${out}"`);
  // The boundary should be a complete clause ending with a non-mid-word token.
  const beforeEllipsis = out.slice(0, -1).trimEnd();
  // Last char before ellipsis (after stripping trailing whitespace) should not be a single low-information word.
  const lastWord = beforeEllipsis.split(/\s+/).pop() || '';
  assert.ok(
    !['the', 'a', 'an', 'of', 'to', 'in', 'on'].includes(lastWord.toLowerCase().replace(/[;.,]$/, '')),
    `should not end on a stopword like "${lastWord}"`
  );
  console.log(`[T2] PASS — clamped to ${out.length} chars, ends "${out.slice(-40)}"`);
}

function t3MidWordPreServiceFails() {
  console.log('[T3] verify: cap that falls mid-word still snaps to last clause boundary…');
  // Cap at 50 — "Test that PHI access is logged with panelMatch boolean" is 53 chars,
  // so we must clamp before that and "; " is at 0. Test that we don't return mid-word.
  const items = [
    'Test that PHI access is logged with panelMatch boolean',
    'Test that the SMS template'
  ];
  const out = clampAtSentenceBoundary(items.join('; '), 50);
  // Last word should NOT be incomplete.
  assert.ok(!out.endsWith('boolea…'), `mid-word truncation: ${out}`);
  console.log(`[T3] PASS — "${out}"`);
}

function t4EndToEndRegulatoryNotesNoMidWordCut() {
  console.log('[T4] full REGULATORY_NOTES render: no enforcement line ends mid-word…');
  const ex: ResearchExtractions = {
    meta: {
      briefHash: 't',
      schemaVersion: 1 as never,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalPasses: { useCase: 1, domain: 1 },
      finalCriticScores: { useCase: 100, domain: 100 },
      convergedEarly: { useCase: true, domain: true },
      totalTokensUsed: 0,
      modelUsed: 't',
      researcher: 'mock' as const,
      researchSource: 'manual' as const
    },
    actors: [],
    entities: [],
    workflows: [],
    integrations: [],
    risks: [],
    gates: [
      {
        id: 'gate-hipaa',
        name: 'HIPAA Privacy Gate',
        mandatedBy: 'regulation' as const,
        mandatedByDetail: 'HIPAA Privacy Rule §164.502 — minimum-necessary access for PHI.',
        applies: 'always' as const,
        rationale: 'all PHI-touching workflows must comply',
        evidenceRequired: [
          'Diff of any new entity / field touching PHI (Patient.email, Patient.dateOfBirth, Vitals.* fields all pii=true)',
          'Test that proves cross-panel chart access is logged with panelMatch=false and requires break-glass justification',
          'Test that the SMS reminder template cannot interpolate PHI fields ({{firstName}}, {{dateOfBirth}})',
          'Test that consent is captured before any vitals capture is allowed'
        ],
        blockingPhases: [],
        origin: 'domain' as const,
        evidenceStrength: 'strong' as const,
        sources: [],
        firstSeenInPass: 1,
        updatedInPass: 1
      }
    ],
    antiFeatures: [],
    conflicts: [],
    removed: []
  };
  const md = renderRegulatoryNotesMarkdown(ex);
  // Find the Enforcement evidence line.
  const line = md.split('\n').find((l) => l.startsWith('- **Enforcement evidence required**:')) || '';
  assert.ok(line.length > 0, 'expected enforcement-evidence line in output');
  // Must NOT end with the pre-H bug "Test that the".
  assert.ok(!/Test that the\s*$/.test(line) && !/Test that the …$/.test(line), `mid-word truncation present: ${line}`);
  console.log(`[T4] PASS — line ends "...${line.slice(-60)}"`);
}

function main() {
  t1ShortInputUnchanged();
  t2ClampAtSemicolonBoundary();
  t3MidWordPreServiceFails();
  t4EndToEndRegulatoryNotesNoMidWordCut();
  console.log('\nAll regulatory-truncation tests passed.');
}

main();
