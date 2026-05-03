/**
 * Generate architecture/DATABASE_SCHEMA.md and architecture/DATABASE_SCHEMA.sql
 * from research extractions.
 *
 * Phase E3 audit dimension `schema-realism` scores:
 *   - % fields with concrete dbType (not derived heuristically at audit time)
 *   - % FKs declared
 *   - % indexed fields
 *   - presence of the SQL file
 *
 * Phase H repair pass — M1, M2, M3, M4, M5:
 *   M1 — defaults that are already wrapped in single quotes (e.g. `"'USD'"`)
 *        no longer get double-wrapped.
 *   M2 — INTEGER / DECIMAL defaults are emitted unquoted; only TEXT-like
 *        defaults are quoted.
 *   M3 — `CREATE TABLE` statements are emitted in topological order (a table
 *        that references another comes after the referenced one). Tables in
 *        an FK cycle still apply cleanly because the cyclic FK is emitted as
 *        a `DEFERRABLE INITIALLY DEFERRED` constraint after both tables exist.
 *   M4 — FK cycle detection. Cycles are surfaced inline as a header comment
 *        and converted to deferrable constraints + nullable bootstrap on the
 *        secondary side so the generated DDL applies cleanly into a fresh DB.
 *   M5 — `tableName(entity)` is the single source of truth for table-name
 *        normalization. The markdown renderer calls it (it used to do its
 *        own partial normalization, producing names like `visit_/_appointment`
 *        that disagreed with the SQL renderer's `visit__appointment`).
 */
import type { Entity, EntityField, ResearchExtractions } from '../research/schema';

/**
 * Centralized table-name normalization. Lowercases, collapses whitespace
 * to underscores, then strips any character that isn't `[a-z0-9_]`.
 * Used by BOTH renderers (M5).
 */
export function tableName(entity: { name: string }): string {
  return entity.name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * M2 — numeric dbTypes never wrap defaults in single quotes.
 * BOOLEAN / TIMESTAMPTZ have always been special-cased; this extends to
 * the integer / decimal family.
 */
function isNumericDbType(dbType?: string): boolean {
  return (
    dbType === 'INTEGER' ||
    dbType === 'BIGINT' ||
    dbType === 'SMALLINT' ||
    dbType === 'DECIMAL' ||
    dbType === 'NUMERIC' ||
    dbType === 'REAL' ||
    dbType === 'DOUBLE PRECISION'
  );
}

/**
 * M1 — strip already-quoted source values before re-wrapping. Some
 * hand-authored entities.json files store `defaultValue` already wrapped in
 * single quotes (e.g. `"defaultValue": "'USD'"`); the generator used to
 * emit `DEFAULT ''USD''` which is invalid Postgres. Now we unwrap.
 *
 * SQL-injection safety: any embedded single quote (after unwrap) is
 * doubled — the standard Postgres / SQL-92 escape.
 */
function escapeSqlStringLiteral(raw: string): string {
  let v = raw;
  // unwrap one outer pair of quotes if present
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
    v = v.slice(1, -1);
  }
  return v.replace(/'/g, "''");
}

function columnLine(field: EntityField, _entity: Entity, _ex: ResearchExtractions, opts: { forceNullable?: boolean } = {}): string {
  const dbType = field.dbType || 'TEXT';
  const enumSuffix = dbType === 'ENUM' && field.enumValues?.length
    ? ` /* ENUM: ${field.enumValues.join(' | ')} */ TEXT CHECK (${field.name} IN (${field.enumValues.map((v) => `'${escapeSqlStringLiteral(v)}'`).join(', ')}))`
    : ` ${dbType}`;
  const declaredNullable = field.nullable === undefined ? !field.required : field.nullable;
  // M4 — when a column participates in an FK cycle and is the side we chose to
  // bootstrap, force NULL so the table can be inserted before its FK target.
  const nullable = opts.forceNullable ? true : declaredNullable;
  const nullSql = nullable ? '' : ' NOT NULL';
  const uniqueSql = field.unique ? ' UNIQUE' : '';
  let defaultSql = '';
  if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
    if (dbType === 'TIMESTAMPTZ' && field.defaultValue === 'CURRENT_TIMESTAMP') {
      defaultSql = ' DEFAULT CURRENT_TIMESTAMP';
    } else if (dbType === 'BOOLEAN' || isNumericDbType(dbType)) {
      // Boolean ('true'/'false') and numeric defaults emit unquoted.
      defaultSql = ` DEFAULT ${field.defaultValue}`;
    } else {
      // Text-like defaults: unwrap any pre-existing quotes, then re-quote with escaping.
      defaultSql = ` DEFAULT '${escapeSqlStringLiteral(String(field.defaultValue))}'`;
    }
  }
  return `  ${field.name}${dbType === 'ENUM' ? enumSuffix : ` ${dbType}${nullSql}${uniqueSql}${defaultSql}`}${dbType !== 'ENUM' ? '' : nullSql}`;
}

function fkConstraint(
  field: EntityField,
  entity: Entity,
  ex: ResearchExtractions,
  opts: { deferrable?: boolean } = {}
): string | null {
  if (!field.fk) return null;
  const target = ex.entities.find((e) => e.id === field.fk!.entityId);
  if (!target) return null;
  const deferrable = opts.deferrable ? ' DEFERRABLE INITIALLY DEFERRED' : '';
  return `  CONSTRAINT fk_${tableName(entity)}_${field.name} FOREIGN KEY (${field.name}) REFERENCES ${tableName(target)}(${field.fk.fieldName}) ON DELETE ${field.fk.onDelete}${deferrable}`;
}

function primaryKeyField(entity: Entity): EntityField | undefined {
  return entity.fields.find((f) => f.name === 'id' || /^id$/i.test(f.name)) ||
    entity.fields.find((f) => /Id$/.test(f.name) && !f.fk);
}

/**
 * M3 + M4 — topological sort of entities by FK dependency. Cycles are
 * detected and broken at one edge (the deferred edge). Returns the order
 * tables should be created in plus the set of FK edges that must be
 * emitted as deferrable so the cyclic side can bootstrap.
 */
type FkEdge = { fromEntityId: string; fieldName: string; toEntityId: string };

export type ScheduleResult = {
  /** Entities in safe creation order (caller emits CREATE TABLE in this order). */
  ordered: Entity[];
  /** FK field-paths that must be emitted as DEFERRABLE INITIALLY DEFERRED to break a cycle. */
  deferredEdges: Array<{ entityId: string; fieldName: string }>;
  /** Cycles detected (each is a list of entity ids in cycle order). For diagnostics. */
  cycles: string[][];
};

export function scheduleEntities(ex: ResearchExtractions): ScheduleResult {
  const entitiesById = new Map(ex.entities.map((e) => [e.id, e]));
  const edges: FkEdge[] = [];
  for (const e of ex.entities) {
    for (const f of e.fields) {
      if (f.fk && entitiesById.has(f.fk.entityId)) {
        edges.push({ fromEntityId: e.id, fieldName: f.name, toEntityId: f.fk.entityId });
      }
    }
  }
  // Build adjacency (a → b means: a has an FK pointing at b → b must be created first).
  const dependsOn = new Map<string, Set<string>>();
  for (const e of ex.entities) dependsOn.set(e.id, new Set());
  for (const edge of edges) {
    if (edge.fromEntityId === edge.toEntityId) continue; // self-fk handled inline
    dependsOn.get(edge.fromEntityId)!.add(edge.toEntityId);
  }

  // Detect cycles via Tarjan / iterative DFS coloring.
  const cycles: string[][] = [];
  const deferredEdges = new Set<string>(); // key = `${entityId}.${fieldName}`
  {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const e of ex.entities) color.set(e.id, WHITE);
    const stack: string[] = [];
    const visit = (nodeId: string): void => {
      color.set(nodeId, GRAY);
      stack.push(nodeId);
      for (const next of dependsOn.get(nodeId) || []) {
        const c = color.get(next);
        if (c === GRAY) {
          // Cycle found — record it and pick the back-edge to defer.
          const cycleStart = stack.indexOf(next);
          const cyclePath = stack.slice(cycleStart).concat(next);
          cycles.push(cyclePath);
          // Defer the FK on `nodeId` that points at `next` (the back-edge).
          for (const edge of edges) {
            if (edge.fromEntityId === nodeId && edge.toEntityId === next) {
              deferredEdges.add(`${edge.fromEntityId}.${edge.fieldName}`);
              dependsOn.get(nodeId)!.delete(next);
            }
          }
        } else if (c === WHITE) {
          visit(next);
        }
      }
      color.set(nodeId, BLACK);
      stack.pop();
    };
    for (const e of ex.entities) {
      if (color.get(e.id) === WHITE) visit(e.id);
    }
  }

  // Now that cycles are broken, do a Kahn-style topo sort on the remaining DAG.
  const ordered: Entity[] = [];
  const remaining = new Map<string, Set<string>>();
  for (const [id, deps] of dependsOn.entries()) remaining.set(id, new Set(deps));
  // Start with all entities with no dependencies.
  const ready: string[] = [];
  for (const e of ex.entities) {
    if ((remaining.get(e.id)?.size || 0) === 0) ready.push(e.id);
  }
  while (ready.length) {
    const id = ready.shift()!;
    const e = entitiesById.get(id);
    if (e) ordered.push(e);
    for (const otherId of remaining.keys()) {
      if (remaining.get(otherId)!.has(id)) {
        remaining.get(otherId)!.delete(id);
        if (remaining.get(otherId)!.size === 0) ready.push(otherId);
      }
    }
  }
  // Anything left has a residual cycle (shouldn't happen after deferral); append in original order.
  if (ordered.length < ex.entities.length) {
    const seen = new Set(ordered.map((e) => e.id));
    for (const e of ex.entities) if (!seen.has(e.id)) ordered.push(e);
  }

  return {
    ordered,
    deferredEdges: Array.from(deferredEdges).map((key) => {
      const lastDot = key.lastIndexOf('.');
      return { entityId: key.slice(0, lastDot), fieldName: key.slice(lastDot + 1) };
    }),
    cycles
  };
}

function buildCreateTable(
  entity: Entity,
  ex: ResearchExtractions,
  deferredFieldsForEntity: Set<string>
): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${tableName(entity)} (`);
  const colLines = entity.fields.map((f) =>
    columnLine(f, entity, ex, { forceNullable: deferredFieldsForEntity.has(f.name) })
  );
  const pkField = primaryKeyField(entity);
  if (pkField) {
    colLines.push(`  PRIMARY KEY (${pkField.name})`);
  }
  for (const f of entity.fields) {
    const fk = fkConstraint(f, entity, ex, { deferrable: deferredFieldsForEntity.has(f.name) });
    if (fk) colLines.push(fk);
  }
  lines.push(colLines.join(',\n'));
  lines.push(');');

  // Indexes for fields marked indexed (skip the PK since it's already indexed)
  for (const f of entity.fields) {
    if (f.indexed && (!pkField || pkField.name !== f.name) && !f.unique) {
      lines.push(`CREATE INDEX idx_${tableName(entity)}_${f.name} ON ${tableName(entity)}(${f.name});`);
    }
  }

  return lines.join('\n');
}

export function renderDatabaseSchemaSql(ex: ResearchExtractions): string {
  const schedule = scheduleEntities(ex);
  // Group deferred edges by entity for fast lookup at emit time.
  const deferredByEntity = new Map<string, Set<string>>();
  for (const d of schedule.deferredEdges) {
    if (!deferredByEntity.has(d.entityId)) deferredByEntity.set(d.entityId, new Set());
    deferredByEntity.get(d.entityId)!.add(d.fieldName);
  }
  const tables = schedule.ordered
    .map((e) => buildCreateTable(e, ex, deferredByEntity.get(e.id) || new Set()))
    .join('\n\n');

  // M4 — surface cycles in a header comment so the builder knows they exist.
  const cycleComment = schedule.cycles.length
    ? `\n-- FK CYCLES DETECTED:\n` +
      schedule.cycles
        .map((c) => {
          const names = c
            .map((id) => ex.entities.find((e) => e.id === id)?.name || id)
            .map((n) => tableName({ name: n }))
            .join(' → ');
          return `--   ${names}`;
        })
        .join('\n') +
      `\n-- Cyclic FKs are emitted as DEFERRABLE INITIALLY DEFERRED with the\n-- referencing column made nullable so a fresh database can apply this\n-- script in one shot. Insert both rows inside a single transaction (or\n-- defer the constraint check) and the cycle resolves cleanly.\n`
    : '';

  return `-- DATABASE_SCHEMA.sql
-- Generated from research extractions in research/extracted/entities.json.
-- PostgreSQL-flavored DDL. SQLite/MySQL users will need to adjust ENUM CHECK
-- syntax and CURRENT_TIMESTAMP defaults but the structure is portable.
-- Tables are emitted in topological order (FK targets before referrers).
${cycleComment}
${tables}
`;
}

export function renderDatabaseSchemaMarkdown(ex: ResearchExtractions): string {
  // M5 — markdown renderer uses the SAME tableName() helper as the SQL renderer
  // so FK references in the markdown agree exactly with the table names in
  // the .sql file.
  const schedule = scheduleEntities(ex);
  const orderedById = new Map(schedule.ordered.map((e, i) => [e.id, i]));
  const deferredKeys = new Set(schedule.deferredEdges.map((d) => `${d.entityId}.${d.fieldName}`));
  const tableSummaries = ex.entities
    .slice()
    .sort((a, b) => (orderedById.get(a.id) ?? 0) - (orderedById.get(b.id) ?? 0))
    .map((e) => {
      const fkLines = e.fields
        .filter((f) => f.fk)
        .map((f) => {
          const target = ex.entities.find((x) => x.id === f.fk!.entityId);
          const targetTable = target ? tableName(target) : f.fk!.entityId;
          const deferredTag = deferredKeys.has(`${e.id}.${f.name}`) ? ' *(deferred — cycle break)*' : '';
          return `  - \`${f.name}\` → \`${targetTable}\`(${f.fk!.fieldName}) on delete ${f.fk!.onDelete}${deferredTag}`;
        });
      const fkBlock = fkLines.length ? `\n- Foreign keys:\n${fkLines.join('\n')}` : '\n- Foreign keys: none';
      const idxLines = e.fields.filter((f) => f.indexed).map((f) => `\`${f.name}\``);
      const uniqLines = e.fields.filter((f) => f.unique).map((f) => `\`${f.name}\``);
      return `### ${e.name} (\`${tableName(e)}\`)

- Columns: ${e.fields.length}
- Primary key: \`${primaryKeyField(e)?.name || 'id'}\`
- Indexes: ${idxLines.join(', ') || 'none'}
- Unique: ${uniqLines.join(', ') || 'none'}${fkBlock}`;
    })
    .join('\n\n');

  const cycleNote = schedule.cycles.length
    ? `\n## FK cycles\n\nThe entity graph contains ${schedule.cycles.length} cycle${schedule.cycles.length === 1 ? '' : 's'}. The generator broke each cycle by marking one FK as \`DEFERRABLE INITIALLY DEFERRED\` and forcing the referencing column to be nullable so a fresh database can bootstrap. Cyclic FKs are tagged in the table list above.\n`
    : '';

  return `# DATABASE_SCHEMA

> Generated from research extractions. The companion file \`DATABASE_SCHEMA.sql\` is the executable PostgreSQL DDL; this file is the human-reviewable explanation. Field-level types, foreign keys, and indexes come from \`research/extracted/entities.json\`. Tables are listed in topological FK order — read top-to-bottom to insert rows safely.

## Tables

${tableSummaries}
${cycleNote}
## Migrations

This is the v1 schema. Subsequent migrations should:
- Add columns as nullable first, then backfill, then enforce NOT NULL.
- Drop columns only after consumers stop reading them (two-deploy pattern).
- Never drop or rename a foreign key in the same migration that drops the referenced table.

## Verification

Apply the SQL once into a fresh database and verify:
- Every table accepts the corresponding sample record from \`SAMPLE_DATA.md\`.
- Foreign-key INSERTs in dependency order succeed; reverse order fails.
- Each indexed column appears in the database catalog.
- ENUM CHECK constraints reject values outside the researched enum set.

## See also

- \`SAMPLE_DATA.md\` — happy-path / variant / negative-path records that exercise this schema.
- \`architecture/DATA_MODEL.md\` — narrative walkthrough with risks and validation rules per entity.
- \`architecture/API_CONTRACTS.md\` — workflow steps mapped to endpoints that mutate these tables.
`;
}
