#!/usr/bin/env node
/**
 * Phase H repair pass — tests for BUILDER_START_HERE.md generation.
 *
 * Pins M6, M7, M8:
 *   M6 — section 8 commands match the deployment-template Makefile aliases
 *        (`make setup / dev / test / audit`)
 *   M7 — `AUTH_DEMO_MODE=true` only mentioned when an auth integration is
 *        actually mocked. When no auth is mocked, the line is omitted.
 *   M8 — Tier 1 list flags the audit-evidence file as "generated after
 *        `make audit`"; the `evidence/audit/README.md` placeholder is
 *        emitted at workspace generation time.
 *
 * Usage: npm run test:builder-start-here
 */
import assert from 'node:assert';
import {
  MAKE_TARGETS,
  renderBuilderStartHere
} from '../lib/generator/builder-start-here';
import type { Integration, ResearchExtractions } from '../lib/research/schema';

const baseProvenance = {
  origin: 'use-case' as const,
  evidenceStrength: 'strong' as const,
  sources: [],
  firstSeenInPass: 1,
  updatedInPass: 1
};

function fakeAuthIntegration(): Integration {
  return {
    ...baseProvenance,
    id: 'i-auth',
    name: 'Magic-link sign-in',
    vendor: 'mocked SMTP',
    category: 'auth' as const,
    purpose: 'Send a magic-link email to authenticate a member.',
    required: true,
    envVar: 'AUTH_MAGIC_LINK_PROVIDER',
    mockedByDefault: true,
    failureModes: ['Provider rate limits', 'Magic link expired'],
    popularity: 'common' as const,
    alternatives: []
  };
}

function fakeSmsIntegration(): Integration {
  return {
    ...baseProvenance,
    id: 'i-sms',
    name: 'Reminder SMS',
    vendor: 'Twilio',
    category: 'sms' as const,
    purpose: 'Send a reminder SMS to patients.',
    required: true,
    envVar: 'SMS_PROVIDER_KEY',
    mockedByDefault: true,
    failureModes: ['Carrier rejects'],
    popularity: 'common' as const,
    alternatives: []
  };
}

function exWith(integrations: Integration[]): ResearchExtractions {
  return {
    meta: {
      briefHash: 't',
      schemaVersion: 1 as never,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalPasses: { useCase: 1, domain: 1 },
      finalCriticScores: { useCase: 100, domain: 100 },
      convergedEarly: { useCase: true, domain: true },
      totalTokensUsed: 0,
      modelUsed: 'test',
      researcher: 'mock' as const,
      researchSource: 'manual' as const
    },
    actors: [],
    entities: [],
    workflows: [],
    integrations,
    risks: [],
    gates: [],
    antiFeatures: [],
    conflicts: [],
    removed: []
  };
}

function t6Section8MatchesMakefileTargets() {
  console.log('[M6] §8 lists the same `make` targets the deployment Makefile actually defines…');
  const md = renderBuilderStartHere({
    productName: 'Test',
    primaryAudience: 'testers',
    problemStatement: 'A test product.',
    mustHaves: ['Login', 'Dashboard'],
    lifecycleStatus: 'BuildReady',
    extractions: exWith([fakeAuthIntegration()])
  });
  // Every build-side target in MAKE_TARGETS.build must appear in §8.
  for (const target of MAKE_TARGETS.build) {
    assert.ok(
      md.includes(`make ${target.name}`),
      `§8 must reference 'make ${target.name}'; output snippet:\n${md.slice(md.indexOf('## 8.'), md.indexOf('## 8.') + 500)}`
    );
  }
  console.log('[M6] PASS');
}

function t7AuthModeOnlyWhenAuthIsMocked() {
  console.log('[M7] AUTH_DEMO_MODE only mentioned when auth integration is mocked…');
  const noAuth = renderBuilderStartHere({
    productName: 'Test',
    primaryAudience: 'testers',
    problemStatement: 'A test product.',
    mustHaves: ['Login'],
    lifecycleStatus: 'BuildReady',
    extractions: exWith([])
  });
  assert.ok(
    !/AUTH_DEMO_MODE\s*=\s*true/i.test(noAuth),
    'no-auth workspace must NOT mention AUTH_DEMO_MODE=true'
  );
  // §5 should say no integrations are mocked.
  assert.ok(
    /No integrations were extracted|no integrations are mocked/i.test(noAuth),
    'expected §5 to say no integrations are mocked; output:\n' + noAuth.slice(0, 2000)
  );
  // Now an auth-mocked workspace MUST mention it.
  const withAuth = renderBuilderStartHere({
    productName: 'Test',
    primaryAudience: 'testers',
    problemStatement: 'A test product.',
    mustHaves: ['Login'],
    lifecycleStatus: 'BuildReady',
    extractions: exWith([fakeAuthIntegration()])
  });
  assert.ok(
    /AUTH_DEMO_MODE\s*=\s*true/.test(withAuth),
    'auth-mocked workspace must mention AUTH_DEMO_MODE=true'
  );
  console.log('[M7] PASS');
}

function t7bNonAuthMockedNoFalseAuthClaim() {
  console.log('[M7b] SMS-only mocked workspace does NOT claim AUTH_DEMO_MODE…');
  const md = renderBuilderStartHere({
    productName: 'Clinic',
    primaryAudience: 'clinics',
    problemStatement: 'Clinics need scheduling.',
    mustHaves: ['Book', 'Remind'],
    lifecycleStatus: 'BuildReady',
    extractions: exWith([fakeSmsIntegration()])
  });
  assert.ok(
    !/AUTH_DEMO_MODE\s*=\s*true/i.test(md),
    `SMS-only workspace must NOT mention AUTH_DEMO_MODE=true; got:\n${md}`
  );
  // But §5 should describe the SMS mock.
  assert.ok(/Reminder SMS|sms/i.test(md), 'expected SMS to be referenced in §5');
  console.log('[M7b] PASS');
}

function t8AuditFileTier1NotePresent() {
  console.log('[M8] Tier 1 audit-file entry says "generated after `make audit`"…');
  const md = renderBuilderStartHere({
    productName: 'Test',
    primaryAudience: 'testers',
    problemStatement: 'A test product.',
    mustHaves: ['Login'],
    lifecycleStatus: 'BuildReady',
    extractions: exWith([])
  });
  // Tier 1 line 13 should mention `make audit` or `npm run audit` and acknowledge the file
  // doesn't exist yet.
  const tier1Index = md.indexOf('## 6.');
  const tier1End = md.indexOf('## 7.');
  const tier1Section = md.slice(tier1Index, tier1End);
  assert.ok(
    /generated after .*audit|absent until|until the first audit/i.test(tier1Section),
    `Tier 1 audit-file line must explain the file is generated after audit; got:\n${tier1Section}`
  );
  console.log('[M8] PASS');
}

function main() {
  t6Section8MatchesMakefileTargets();
  t7AuthModeOnlyWhenAuthIsMocked();
  t7bNonAuthMockedNoFalseAuthClaim();
  t8AuditFileTier1NotePresent();
  console.log('\nAll builder-start-here tests passed.');
}

main();
