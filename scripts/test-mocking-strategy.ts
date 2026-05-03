#!/usr/bin/env node
/**
 * Phase H M10 — per-category mock contracts in MOCKING_STRATEGY.md.
 *
 * Pre-H, only `category === 'auth'` got a concrete demo-safe contract.
 * Post-H, every category in {auth, sms, email, payment, storage,
 * observability, llm, generic-other} has a contract that names the file
 * paths, env var, audit-event shape, and how to test the mock.
 *
 * Usage: npm run test:mocking-strategy
 */
import assert from 'node:assert';
import {
  renderIntegrationMockContract,
  renderMockingStrategy
} from '../lib/generator/mocking-strategy';
import type { Integration, IntegrationCategory, ResearchExtractions } from '../lib/research/schema';

const baseProvenance = {
  origin: 'use-case' as const,
  evidenceStrength: 'strong' as const,
  sources: [],
  firstSeenInPass: 1,
  updatedInPass: 1
};

function makeIntegration(category: IntegrationCategory, name: string, envVar: string): Integration {
  return {
    ...baseProvenance,
    id: `i-${category}`,
    name,
    vendor: 'TestVendor',
    category,
    purpose: `Test ${category} integration`,
    required: true,
    envVar,
    mockedByDefault: true,
    failureModes: ['Test failure 1', 'Test failure 2'],
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

function assertConcreteContract(category: IntegrationCategory, contract: string) {
  // Every contract must name file paths, an env var, an audit event shape,
  // and a test command. These are the load-bearing parts a builder needs.
  assert.ok(/\.tmp\/|tests\/fixtures\//.test(contract), `[${category}] missing file-system path`);
  assert.ok(/audit log|audit-event|`{type:|`\{type:/i.test(contract), `[${category}] missing audit-event shape`);
  assert.ok(/(curl|make|npx|npm)/i.test(contract), `[${category}] missing test command`);
  assert.ok(/swap|real provider/i.test(contract), `[${category}] missing real-provider swap section`);
  assert.ok(/Failure modes/i.test(contract), `[${category}] missing failure-modes section`);
}

function t1AuthContract() {
  console.log('[T1] auth contract is concrete…');
  const c = renderIntegrationMockContract({ integration: makeIntegration('auth', 'Magic-link sign-in', 'AUTH_PROVIDER') });
  assertConcreteContract('auth', c);
  // Auth-specific check: AUTH_DEMO_MODE shortcut.
  assert.ok(/AUTH_DEMO_MODE/.test(c), 'auth contract must mention AUTH_DEMO_MODE shortcut');
  console.log('[T1] PASS');
}

function t2SmsContract() {
  console.log('[T2] sms contract is concrete (Phase H gap from W2 fresh builder)…');
  const c = renderIntegrationMockContract({ integration: makeIntegration('sms', 'Reminder SMS', 'SMS_PROVIDER_KEY') });
  assertConcreteContract('sms', c);
  // SMS-specific check: must mention sha256-based recipient hashing (no PII in logs).
  assert.ok(/sha256|sha\(.*to.*\)|toSha256/i.test(c), 'sms contract must mention sha256 recipient hashing');
  // Must mention SMS_DEMO_MODE shortcut.
  assert.ok(/SMS_DEMO_MODE/.test(c), 'sms contract must include SMS_DEMO_MODE shortcut');
  // Must mention HIPAA / privacy concern when swapping in real provider.
  assert.ok(/HIPAA|privacy|BAA|DPA/.test(c), 'sms contract must flag HIPAA/privacy concern for real-provider swap');
  console.log('[T2] PASS');
}

function t3EmailContract() {
  console.log('[T3] email contract is concrete…');
  const c = renderIntegrationMockContract({ integration: makeIntegration('email', 'Welcome email', 'EMAIL_PROVIDER_KEY') });
  assertConcreteContract('email', c);
  assert.ok(/\.eml/.test(c), 'email contract must produce .eml files');
  assert.ok(/EMAIL_DEMO_MODE/.test(c), 'email contract must include EMAIL_DEMO_MODE');
  console.log('[T3] PASS');
}

function t4PaymentContract() {
  console.log('[T4] payment contract is concrete…');
  const c = renderIntegrationMockContract({ integration: makeIntegration('payment', 'Stripe checkout', 'PSP_KEY') });
  assertConcreteContract('payment', c);
  assert.ok(/PAYMENT_DEMO_MODE/.test(c), 'payment contract must include PAYMENT_DEMO_MODE');
  assert.ok(/mock_pm_/.test(c), 'payment contract must define mock_pm_ token convention');
  // Critical safety check.
  assert.ok(/Never.*real card|never.*production|Never commit real card/i.test(c), 'payment contract must include do-not-ship-mock-to-prod guard');
  console.log('[T4] PASS');
}

function t5StorageContract() {
  console.log('[T5] storage contract is concrete…');
  const c = renderIntegrationMockContract({ integration: makeIntegration('storage', 'Blob store', 'STORAGE_KEY') });
  assertConcreteContract('storage', c);
  assert.ok(/STORAGE_DEMO_MODE/.test(c), 'storage contract must include STORAGE_DEMO_MODE');
  assert.ok(/sha256/i.test(c), 'storage contract must dedupe by content sha256');
  console.log('[T5] PASS');
}

function t6GenericOtherContract() {
  console.log('[T6] generic "other" contract is concrete…');
  const c = renderIntegrationMockContract({ integration: makeIntegration('other', 'Custom thing', 'CUSTOM_KEY') });
  assertConcreteContract('other', c);
  // Generic contract uses fixtures dir.
  assert.ok(/tests\/fixtures\//.test(c), 'generic contract must use tests/fixtures/');
  console.log('[T6] PASS');
}

function t7FullStrategyDocAssemblesAllSections() {
  console.log('[T7] MOCKING_STRATEGY.md assembles per-integration contracts…');
  const md = renderMockingStrategy({
    productName: 'TestApp',
    primaryFeature: 'patient scheduling',
    primaryAudience: 'clinics',
    ontologyEntityNames: ['Patient', 'Visit'],
    fallbackBullets: [],
    extractions: exWith([
      makeIntegration('auth', 'Magic-link sign-in', 'AUTH_PROVIDER'),
      makeIntegration('sms', 'Reminder SMS', 'SMS_PROVIDER_KEY')
    ])
  });
  // Each category should get its own H2 heading.
  const authHeading = md.match(/## .*auth.* — demo-safe mock contract/i);
  const smsHeading = md.match(/## .*sms.* — demo-safe mock contract/i);
  assert.ok(authHeading, `expected auth H2 heading; got first 4kB:\n${md.slice(0, 4000)}`);
  assert.ok(smsHeading, 'expected sms H2 heading');
  // Both must show their env vars.
  assert.ok(md.includes('AUTH_PROVIDER'), 'expected AUTH_PROVIDER env var in doc');
  assert.ok(md.includes('SMS_PROVIDER_KEY'), 'expected SMS_PROVIDER_KEY env var in doc');
  console.log('[T7] PASS');
}

function t8NoIntegrationsHonest() {
  console.log('[T8] no integrations → honest "no contracts" message, not invented mock…');
  const md = renderMockingStrategy({
    productName: 'YarnBuddy',
    primaryFeature: 'tracking yarn',
    primaryAudience: 'knitters',
    ontologyEntityNames: ['Yarn'],
    fallbackBullets: ['All external API calls', 'Webhook payloads'],
    extractions: exWith([])
  });
  assert.ok(/No integrations declared|did not declare any external integrations/i.test(md), 'expected explicit "no integrations declared" message');
  // Must NOT invent fake auth/SMS mocks when none exist.
  assert.ok(!/AUTH_DEMO_MODE\s*=\s*true/.test(md), 'must not fabricate AUTH_DEMO_MODE for empty workspace');
  assert.ok(!/SMS_DEMO_MODE/.test(md), 'must not fabricate SMS_DEMO_MODE for empty workspace');
  console.log('[T8] PASS');
}

function main() {
  t1AuthContract();
  t2SmsContract();
  t3EmailContract();
  t4PaymentContract();
  t5StorageContract();
  t6GenericOtherContract();
  t7FullStrategyDocAssemblesAllSections();
  t8NoIntegrationsHonest();
  console.log('\nAll mocking-strategy tests passed.');
}

main();
