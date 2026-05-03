#!/usr/bin/env node
/**
 * Phase H repair pass — tests for the SQL DDL generator.
 *
 * Pins the M1-M5 fixes:
 *   M1 — already-quoted defaults (e.g. `"'USD'"`) are unwrapped, not double-wrapped
 *   M2 — INTEGER / DECIMAL defaults emit unquoted
 *   M3 — CREATE TABLE statements respect topological FK order
 *   M4 — FK cycles are detected, broken via DEFERRABLE INITIALLY DEFERRED, and the
 *        bootstrap-side column is forced nullable
 *   M5 — `tableName()` is the single source of truth used by both .sql and .md
 *        renderers (no `visit_/_appointment` vs `visit__appointment` mismatch)
 *
 * Usage: npm run test:database-schema
 */
import assert from 'node:assert';
import {
  renderDatabaseSchemaMarkdown,
  renderDatabaseSchemaSql,
  scheduleEntities,
  tableName
} from '../lib/generator/database-schema';
import type { Entity, EntityField, ResearchExtractions } from '../lib/research/schema';

const baseProvenance = {
  origin: 'use-case' as const,
  evidenceStrength: 'strong' as const,
  sources: [],
  firstSeenInPass: 1,
  updatedInPass: 1
};

function field(partial: Partial<EntityField> & { name: string }): EntityField {
  return {
    type: 'string',
    description: 'test field',
    required: true,
    example: '',
    ...partial
  } as EntityField;
}

function entity(partial: Partial<Entity> & { id: string; name: string; fields: EntityField[] }): Entity {
  return {
    ...baseProvenance,
    id: partial.id,
    name: partial.name,
    description: partial.description ?? '',
    fields: partial.fields,
    relationships: partial.relationships ?? [],
    ownerActors: partial.ownerActors ?? [],
    riskTypes: partial.riskTypes ?? [],
    sample: partial.sample ?? {}
  };
}

function ex(entities: Entity[]): ResearchExtractions {
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
    entities,
    workflows: [],
    integrations: [],
    risks: [],
    gates: [],
    antiFeatures: [],
    conflicts: [],
    removed: []
  };
}

function t1AlreadyQuotedDefaults() {
  console.log('[M1] already-quoted string default is unwrapped before re-quoting…');
  const e = entity({
    id: 'e-h',
    name: 'Household',
    fields: [
      field({ name: 'householdId', dbType: 'TEXT', required: true, unique: true }),
      // Source value already wrapped in quotes — must NOT become DEFAULT ''USD''.
      field({ name: 'currency', dbType: 'TEXT', required: true, defaultValue: "'USD'" }),
      field({ name: 'note', dbType: 'TEXT', required: false, defaultValue: "rich's payment" }) // embedded apostrophe
    ]
  });
  const sql = renderDatabaseSchemaSql(ex([e]));
  assert.ok(sql.includes(`DEFAULT 'USD'`), `expected DEFAULT 'USD' (single-wrapped), got:\n${sql}`);
  assert.ok(!/DEFAULT ''USD''/.test(sql), `must not double-wrap: still saw DEFAULT ''USD''`);
  // Embedded apostrophe must be doubled per SQL-92.
  assert.ok(/DEFAULT 'rich''s payment'/.test(sql), `embedded apostrophe must be escaped, got:\n${sql}`);
  console.log('[M1] PASS');
}

function t2NumericDefaultsUnquoted() {
  console.log('[M2] INTEGER / DECIMAL / BOOLEAN defaults emit unquoted…');
  const e = entity({
    id: 'e-s',
    name: 'Slot',
    fields: [
      field({ name: 'slotId', dbType: 'TEXT', required: true, unique: true }),
      field({ name: 'durationMinutes', dbType: 'INTEGER', required: true, defaultValue: '30' }),
      field({ name: 'priceCents', dbType: 'DECIMAL', required: true, defaultValue: '0' }),
      field({ name: 'isPublic', dbType: 'BOOLEAN', required: true, defaultValue: 'false' })
    ]
  });
  const sql = renderDatabaseSchemaSql(ex([e]));
  assert.ok(/durationMinutes INTEGER NOT NULL DEFAULT 30\b/.test(sql), `INTEGER default must be unquoted; got:\n${sql}`);
  assert.ok(/priceCents DECIMAL NOT NULL DEFAULT 0\b/.test(sql), `DECIMAL default must be unquoted; got:\n${sql}`);
  assert.ok(/isPublic BOOLEAN NOT NULL DEFAULT false\b/.test(sql), `BOOLEAN default must be unquoted; got:\n${sql}`);
  assert.ok(!/DEFAULT '30'/.test(sql), `INTEGER must not be quoted; saw DEFAULT '30'`);
  console.log('[M2] PASS');
}

function t3FkOrderingTopological() {
  console.log('[M3] CREATE TABLE statements respect topological FK order…');
  // member_profile is referenced first in the array, but household has an FK to member_profile.
  // Without topo-sort, household would be CREATEd before member_profile and psql -f fails.
  // With topo-sort, member_profile comes first.
  const memberProfile = entity({
    id: 'e-m',
    name: 'Member Profile',
    fields: [
      field({ name: 'memberId', dbType: 'TEXT', required: true, unique: true }),
      field({ name: 'name', dbType: 'TEXT' })
    ]
  });
  const household = entity({
    id: 'e-h',
    name: 'Household',
    fields: [
      field({ name: 'householdId', dbType: 'TEXT', required: true, unique: true }),
      field({
        name: 'createdByActorId',
        dbType: 'TEXT',
        required: true,
        type: 'reference',
        fk: { entityId: 'e-m', fieldName: 'memberId', onDelete: 'RESTRICT' }
      })
    ]
  });
  // Pass entities in WRONG order — household first.
  const sql = renderDatabaseSchemaSql(ex([household, memberProfile]));
  const idxMember = sql.indexOf('CREATE TABLE member_profile');
  const idxHousehold = sql.indexOf('CREATE TABLE household');
  assert.ok(idxMember >= 0 && idxHousehold >= 0, 'expected both CREATE TABLE statements');
  assert.ok(idxMember < idxHousehold, `member_profile must be created before household; got member@${idxMember}, household@${idxHousehold}`);
  console.log('[M3] PASS');
}

function t4CyclicFkDetection() {
  console.log('[M4] FK cycles detected; cyclic FK marked DEFERRABLE; bootstrap column nullable…');
  // household.createdByActorId → member_profile(memberId)
  // member_profile.householdId  → household(householdId)
  const memberProfile = entity({
    id: 'e-m',
    name: 'Member Profile',
    fields: [
      field({ name: 'memberId', dbType: 'TEXT', required: true, unique: true }),
      field({
        name: 'householdId',
        dbType: 'TEXT',
        required: true,
        type: 'reference',
        fk: { entityId: 'e-h', fieldName: 'householdId', onDelete: 'CASCADE' }
      })
    ]
  });
  const household = entity({
    id: 'e-h',
    name: 'Household',
    fields: [
      field({ name: 'householdId', dbType: 'TEXT', required: true, unique: true }),
      field({
        name: 'createdByActorId',
        dbType: 'TEXT',
        required: true,
        type: 'reference',
        fk: { entityId: 'e-m', fieldName: 'memberId', onDelete: 'RESTRICT' }
      })
    ]
  });
  const schedule = scheduleEntities(ex([household, memberProfile]));
  assert.ok(schedule.cycles.length >= 1, `expected ≥1 cycle, got ${schedule.cycles.length}`);
  assert.ok(schedule.deferredEdges.length >= 1, 'expected at least one deferred FK edge');
  const sql = renderDatabaseSchemaSql(ex([household, memberProfile]));
  assert.ok(/FK CYCLES DETECTED/i.test(sql), 'expected FK CYCLES DETECTED comment in SQL header');
  assert.ok(/DEFERRABLE INITIALLY DEFERRED/.test(sql), 'expected at least one DEFERRABLE INITIALLY DEFERRED constraint');
  // The deferred-side column must be nullable (no ` NOT NULL` on that line).
  // We don't pin which side gets deferred (depends on visit order), but at least one
  // of the FK columns must lose its NOT NULL.
  const householdLine = sql.split('\n').find((l) => /createdByActorId TEXT/.test(l)) || '';
  const memberLine = sql.split('\n').find((l) => /householdId TEXT/.test(l) && !/UNIQUE/.test(l)) || '';
  const oneIsNullable = !/NOT NULL/.test(householdLine) || !/NOT NULL/.test(memberLine);
  assert.ok(
    oneIsNullable,
    `expected at least one cycle-bootstrap column to drop NOT NULL.\n  householdLine: ${householdLine}\n  memberLine: ${memberLine}`
  );
  console.log(`[M4] PASS — cycles=${schedule.cycles.length}, deferredEdges=${schedule.deferredEdges.length}`);
}

function t5TableNameConsistencyAcrossSqlAndMd() {
  console.log('[M5] table-name normalization agrees between .sql and .md…');
  const visit = entity({
    id: 'e-v',
    name: 'Visit / Appointment', // contains slash + spaces
    fields: [
      field({ name: 'visitId', dbType: 'TEXT', required: true, unique: true }),
      field({
        name: 'patientMrn',
        dbType: 'TEXT',
        type: 'reference',
        fk: { entityId: 'e-p', fieldName: 'mrn', onDelete: 'RESTRICT' }
      })
    ]
  });
  const patient = entity({
    id: 'e-p',
    name: 'Patient',
    fields: [field({ name: 'mrn', dbType: 'TEXT', required: true, unique: true })]
  });
  const x = ex([visit, patient]);
  const sql = renderDatabaseSchemaSql(x);
  const md = renderDatabaseSchemaMarkdown(x);
  // Centralized helper produces this exact name.
  const expected = tableName(visit);
  assert.strictEqual(expected, 'visit__appointment', `expected canonical 'visit__appointment', got '${expected}'`);
  assert.ok(sql.includes(`CREATE TABLE ${expected}`), `SQL must use canonical name; got:\n${sql}`);
  // The markdown must reference the SAME canonical name everywhere.
  assert.ok(md.includes(`(\`${expected}\`)`), 'MD heading must use canonical name in backticks');
  // Critically: the broken `visit_/_appointment` form must NOT appear anywhere.
  assert.ok(!/visit_\/_appointment/.test(sql), `SQL must not contain visit_/_appointment`);
  assert.ok(!/visit_\/_appointment/.test(md), `MD must not contain visit_/_appointment`);
  console.log(`[M5] PASS — canonical name="${expected}"`);
}

function t6OrderedListInMarkdownFollowsSqlOrder() {
  console.log('[M5b] markdown table list matches SQL CREATE TABLE order…');
  const memberProfile = entity({
    id: 'e-m',
    name: 'Member Profile',
    fields: [field({ name: 'memberId', dbType: 'TEXT', required: true, unique: true })]
  });
  const household = entity({
    id: 'e-h',
    name: 'Household',
    fields: [
      field({ name: 'householdId', dbType: 'TEXT', required: true, unique: true }),
      field({
        name: 'createdByActorId',
        dbType: 'TEXT',
        type: 'reference',
        fk: { entityId: 'e-m', fieldName: 'memberId', onDelete: 'RESTRICT' }
      })
    ]
  });
  const x = ex([household, memberProfile]);
  const md = renderDatabaseSchemaMarkdown(x);
  const idxMemberMd = md.indexOf('### Member Profile');
  const idxHouseholdMd = md.indexOf('### Household');
  assert.ok(idxMemberMd >= 0 && idxHouseholdMd >= 0, 'expected both headings in MD');
  assert.ok(idxMemberMd < idxHouseholdMd, 'MD must list Member Profile before Household to match SQL FK order');
  console.log('[M5b] PASS');
}

function main() {
  t1AlreadyQuotedDefaults();
  t2NumericDefaultsUnquoted();
  t3FkOrderingTopological();
  t4CyclicFkDetection();
  t5TableNameConsistencyAcrossSqlAndMd();
  t6OrderedListInMarkdownFollowsSqlOrder();
  console.log('\nAll database-schema tests passed.');
}

main();
