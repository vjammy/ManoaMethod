/**
 * E3a — Implementation contract surface.
 *
 * Walks the research-driven workflow + screen + actor + entity graph once and
 * produces a typed surface (routes, components, testIds, dataInterfaces,
 * flows). This surface is what every downstream builder reads:
 *
 *   - architecture/IMPLEMENTATION_CONTRACT.md       (the canonical contract)
 *   - ui-ux/UI_IMPLEMENTATION_GUIDE.md              (embeds the testid glossary)
 *   - phases/<phase-slug>/PLAYWRIGHT_FLOWS/*.json   (per-actor x workflow flows)
 *
 * Route, component, and testid derivation rules live here in one place so the
 * contract emitted to disk and the runtime expectations stay aligned. There
 * is no network access; this module is pure.
 *
 * Phase E3b (separate work) will rewrite the browser-loop runner to consume
 * the per-phase flow JSONs and the mock-auth contract documented in
 * BROWSER_AUTOMATION_GUIDE.md.
 */

import type {
  Entity,
  EntityField,
  ResearchExtractions,
  Workflow as ResearchWorkflow,
  Screen as ResearchScreen
} from '../research/schema';
import type { Actor, ProjectInput } from '../types';
import { slugify } from '../templates';

// ---- Types ----------------------------------------------------------------

export type RouteEntry = {
  path: string;
  screenName: string;
  component: string;
  primaryUser: string;
};

export type ComponentEntry = {
  name: string;
  screenName: string;
  purpose: string;
};

export type TestIdEntry = {
  id: string;
  screenName: string;
  workflowStep?: string;
  aliases: string[];
};

export type DataInterfaceEntry = {
  entityName: string;
  tsInterface: string;
  storageAdapter: string;
};

export type FlowStep =
  | { kind: 'goto'; url: string; description?: string }
  | { kind: 'click'; testId: string; description?: string }
  | {
      kind: 'fill';
      testId: string;
      valueFromSample?: string;
      literalValue?: string;
      description?: string;
    }
  | { kind: 'assertRoute'; match: string; description?: string }
  | { kind: 'assertText'; testId?: string; text: string; description?: string };

export type FlowSpec = {
  flowId: string;
  actorId: string;
  actorName: string;
  workflowName: string;
  reqIds: string[];
  loginMock: { strategy: 'query-string'; param: 'as'; value: string };
  steps: FlowStep[];
  negativeSteps: FlowStep[];
  rolePermissionSteps: FlowStep[];
  notes?: string;
};

export type ImplementationSurface = {
  routes: RouteEntry[];
  components: ComponentEntry[];
  testIds: TestIdEntry[];
  dataInterfaces: DataInterfaceEntry[];
  flows: FlowSpec[];
  emptyLoadingErrorByRoute: Array<{ path: string; empty: string; loading: string; error: string }>;
};

// ---- Pure helpers ---------------------------------------------------------

/**
 * Derive a stable URL path for a screen name using the rules documented in the
 * E3a spec. Order matters: child task list must be matched before kid +
 * dashboard, list-style screens before generic catch-all, etc.
 */
export function routePathForScreen(screenName: string): string {
  const lower = (screenName || '').toLowerCase().trim();
  if (!lower) return '/';

  // Entry / product-name / first-touch screens land at /.
  if (/(^|\b)(entry|landing|home|welcome|splash|start)(\b|$)/.test(lower)) return '/';
  if (/product[- ]?name/.test(lower)) return '/';

  // Specific kid+task variants before the generic kid dashboard rule.
  if (/(child|kid).*(task|chore).*list/.test(lower)) return '/kid/tasks';
  if (/(child|kid)[- ].*(task|chore)s?$/.test(lower)) return '/kid/tasks';
  if (/(child|kid).*dashboard/.test(lower)) return '/kid';
  if (/dashboard/.test(lower)) return '/dashboard';

  // Form / create routes — strip "form" from the slug so "Task Form" → /task/new.
  if (/(form|creat)/.test(lower)) {
    const stripped = lower
      .replace(/\b(create|creation|new)\b/g, '')
      .replace(/\bform\b/g, '')
      .trim();
    const slug = slugify(stripped) || slugify(lower);
    return `/${slug.replace(/^-+|-+$/g, '') || 'item'}/new`;
  }

  // Detail / view → /<slug>/:id.
  if (/(detail|view)/.test(lower)) {
    const stripped = lower.replace(/\b(detail|view)s?\b/g, '').trim();
    const slug = slugify(stripped) || slugify(lower);
    return `/${slug.replace(/^-+|-+$/g, '') || 'item'}/:id`;
  }

  // List / inventory / index / hub → /<slug>.
  if (/(list|inventory|index|hub)/.test(lower)) {
    const slug = slugify(lower);
    return `/${slug}`;
  }

  // Catch-all.
  return `/${slugify(lower) || 'screen'}`;
}

/** PascalCase from screen name + "Screen" suffix. */
export function componentNameForScreen(screenName: string): string {
  const cleaned = (screenName || '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim();
  if (!cleaned) return 'AppScreen';
  const pascal = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  // Avoid double-Screen suffix for screens already named "...Screen".
  if (/screen$/i.test(pascal)) return pascal.replace(/screen$/i, 'Screen');
  return `${pascal}Screen`;
}

/** Compose a stable testid for an action on a screen: <screen-slug>-<action-slug>. */
export function testIdForAction(screenName: string, action: string): string {
  const screen = slugify(screenName);
  const act = slugify(action);
  if (!screen) return act || 'action';
  if (!act) return screen;
  return `${screen}-${act}`;
}

/** Map a research field type to a TypeScript type for the data contract. */
export function deriveTsType(field: EntityField | { type: string; enumValues?: string[] }): string {
  switch (field.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'string'; // ISO-8601 string in transport layer
    case 'enum': {
      const vals = (field as { enumValues?: string[] }).enumValues || [];
      if (!vals.length) return 'string';
      return vals.map((v) => JSON.stringify(v)).join(' | ');
    }
    case 'json':
      return 'Record<string, unknown>';
    case 'binary':
      return 'string';
    case 'reference':
      return 'string';
    default:
      // Permit a few legacy / DB-style strings for robustness.
      switch (String(field.type).toLowerCase()) {
        case 'integer':
        case 'decimal':
        case 'int':
          return 'number';
        case 'uuid':
        case 'text':
        case 'timestamptz':
          return 'string';
        case 'jsonb':
          return 'Record<string, unknown>';
        default:
          return 'string';
      }
  }
}

// ---- Internal helpers -----------------------------------------------------

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'for',
  'with',
  'and',
  'or',
  'in',
  'on',
  'by'
]);

function entitySlug(name: string): string {
  const tokens = name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((tok) => tok && !STOP_WORDS.has(tok));
  const joined = tokens.join('-');
  return joined || slugify(name) || 'entity';
}

function fieldSlug(field: { name: string }): string {
  return slugify(field.name) || 'field';
}

function escapePropertyName(name: string): string {
  // If the property is a valid TS identifier, leave it as-is; otherwise quote.
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return name;
  return JSON.stringify(name);
}

function pascalCase(value: string): string {
  return (value || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('') || 'Entity';
}

function findActorByName(actors: Actor[], name: string): Actor | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return (
    actors.find((a) => a.name.toLowerCase() === lower) ||
    actors.find((a) => a.id.toLowerCase() === lower) ||
    actors.find((a) => slugify(a.name) === slugify(name)) ||
    actors.find(
      (a) => (a.aliases || []).some((al) => al.toLowerCase() === lower)
    )
  );
}

function findActorByIdOrName(
  actors: Actor[],
  idOrName: string,
  extractions?: ResearchExtractions
): Actor | undefined {
  if (!idOrName) return undefined;
  const direct = actors.find((a) => a.id === idOrName);
  if (direct) return direct;
  // Research workflows reference actors by their extraction id (e.g.
  // "actor-parent-or-household-admin"). The resolved context actor list keys
  // off `slugify(actor.type || actor.name)` and so loses that id; resolve via
  // the extractions table to recover the human name first, then match by name.
  if (extractions?.actors) {
    const ex = extractions.actors.find((a) => a.id === idOrName);
    if (ex) {
      const byName = findActorByName(actors, ex.name);
      if (byName) return byName;
      // Final fallback: build a synthetic Actor record so the flow can still emit.
      return {
        id: idOrName,
        name: ex.name,
        role: ex.type,
        aliases: []
      };
    }
  }
  return findActorByName(actors, idOrName);
}

function pickPrimaryEntity(
  workflow: ResearchWorkflow,
  entities: Entity[]
): Entity | undefined {
  const touched = workflow.entitiesTouched || [];
  for (const id of touched) {
    const found = entities.find((e) => e.id === id);
    if (found) return found;
  }
  return entities[0];
}

function pickHappyTitleSample(entity: Entity): { id: string; title: string } | undefined {
  const samples = entity.samples?.happy?.[0] || undefined;
  if (samples) {
    const titleField =
      entity.fields.find((f) => /name|title|label/i.test(f.name)) || entity.fields[0];
    const value = titleField ? samples.data[titleField.name] : undefined;
    if (typeof value === 'string' && value) {
      return { id: samples.id, title: value };
    }
    const ex = titleField?.example || '';
    if (ex) return { id: samples.id, title: ex };
  }
  // Fall back to entity.sample (single-sample legacy form).
  if (entity.sample && typeof entity.sample === 'object') {
    const titleField =
      entity.fields.find((f) => /name|title|label/i.test(f.name)) || entity.fields[0];
    const v = titleField ? (entity.sample as Record<string, unknown>)[titleField.name] : undefined;
    if (typeof v === 'string' && v) return { id: 'sample-001', title: v };
    if (titleField?.example) return { id: 'sample-001', title: titleField.example };
  }
  return undefined;
}

function topThreeFillFields(entity: Entity): EntityField[] {
  const candidates = entity.fields.filter(
    (f) => f.type === 'string' || f.type === 'date' || f.type === 'enum'
  );
  return candidates.slice(0, 3);
}

function firstMatchingScreenRoute(
  workflow: ResearchWorkflow,
  routes: RouteEntry[],
  fallbackScreens: GenericScreen[]
): { route: string; screenName: string } {
  // Prefer screens whose name appears in workflow.steps action / failure / acceptancePattern text.
  const haystack = [
    workflow.acceptancePattern || '',
    ...(workflow.steps || []).map((s) => `${s.action} ${s.systemResponse}`)
  ]
    .join(' ')
    .toLowerCase();
  for (const route of routes) {
    if (haystack.includes(route.screenName.toLowerCase())) {
      return { route: route.path, screenName: route.screenName };
    }
  }
  // Fall back to the first non-/ route (skip entry).
  const nonEntry = routes.find((r) => r.path !== '/');
  if (nonEntry) return { route: nonEntry.path, screenName: nonEntry.screenName };
  if (routes[0]) return { route: routes[0].path, screenName: routes[0].screenName };
  if (fallbackScreens[0]) {
    return {
      route: routePathForScreen(fallbackScreens[0].name),
      screenName: fallbackScreens[0].name
    };
  }
  return { route: '/', screenName: 'Entry' };
}

// ---- Generic screen shape -------------------------------------------------

type GenericScreen = {
  name: string;
  primaryUser?: string;
  purpose?: string;
  emptyState?: string;
  loadingState?: string;
  errorState?: string;
};

function toGenericScreens(
  researchScreens: ResearchScreen[] | undefined,
  fallbackScreens: GenericScreen[],
  actors: Actor[],
  extractions?: ResearchExtractions
): GenericScreen[] {
  if (researchScreens && researchScreens.length) {
    return researchScreens.map((s) => {
      const actor = findActorByIdOrName(actors, s.primaryActor, extractions);
      return {
        name: s.name,
        primaryUser: actor?.name || s.primaryActor,
        purpose: s.purpose,
        emptyState: s.states?.empty,
        loadingState: s.states?.loading,
        errorState: s.states?.error
      };
    });
  }
  return fallbackScreens;
}

// ---- Surface builder ------------------------------------------------------

export type BuildSurfaceArgs = {
  input: ProjectInput;
  context: {
    actors: Actor[];
    primaryActor: Actor;
    extractions?: ResearchExtractions;
    primaryAudience: string;
  };
  screens: GenericScreen[];
  workflows: Array<{
    name: string;
    targetUser: string;
    requiredScreens?: string[];
  }>;
};

/**
 * Build the implementation surface from the research-driven graph when
 * available, falling back to the templated screens / workflows the legacy
 * generator path produces. Always emits a non-empty surface so downstream
 * artifact rendering is unconditional.
 */
export function buildImplementationSurface(args: BuildSurfaceArgs): ImplementationSurface {
  const { context } = args;
  const extractions = context.extractions;

  const actors = context.actors;
  const screens = toGenericScreens(extractions?.screens, args.screens, actors, extractions);

  // ---- Routes + Components -------------------------------------------------
  const seenPaths = new Set<string>();
  const routes: RouteEntry[] = [];
  const components: ComponentEntry[] = [];
  for (const screen of screens) {
    const path = routePathForScreen(screen.name);
    const component = componentNameForScreen(screen.name);
    const primaryUser =
      screen.primaryUser || context.primaryActor.name || context.primaryAudience;
    if (!seenPaths.has(path)) {
      seenPaths.add(path);
      routes.push({ path, screenName: screen.name, component, primaryUser });
    }
    components.push({
      name: component,
      screenName: screen.name,
      purpose: screen.purpose || `Implements ${screen.name}.`
    });
  }

  // ---- Test IDs ------------------------------------------------------------
  const testIdMap = new Map<string, TestIdEntry>();
  const upsertTestId = (entry: TestIdEntry) => {
    const existing = testIdMap.get(entry.id);
    if (existing) {
      const aliases = new Set([...(existing.aliases || []), ...(entry.aliases || [])]);
      existing.aliases = Array.from(aliases);
      return;
    }
    testIdMap.set(entry.id, { ...entry, aliases: [...(entry.aliases || [])] });
  };

  // 1) Per screen: a primary <screen>-primary action testid plus per-action testids.
  for (const screen of screens) {
    upsertTestId({
      id: testIdForAction(screen.name, 'primary'),
      screenName: screen.name,
      aliases: ['primary action']
    });
  }
  if (extractions?.screens) {
    for (const s of extractions.screens) {
      for (const action of s.actions || []) {
        const id = testIdForAction(s.name, action.label);
        upsertTestId({
          id,
          screenName: s.name,
          workflowStep: action.refWorkflowStep,
          aliases: [action.label]
        });
      }
    }
  }

  // 2) Per entity field: <entity-slug>-<field-slug> + <entity-slug>-submit.
  const entities = extractions?.entities || [];
  for (const entity of entities) {
    const eslug = entitySlug(entity.name);
    for (const field of entity.fields) {
      const id = `${eslug}-${fieldSlug(field)}`;
      upsertTestId({
        id,
        screenName: `${entity.name} form`,
        aliases: [`${entity.name}.${field.name}`]
      });
    }
    upsertTestId({
      id: `${eslug}-submit`,
      screenName: `${entity.name} form`,
      aliases: [`Submit ${entity.name}`]
    });
  }

  // 3) Mock auth standard testids.
  upsertTestId({
    id: 'permission-denied',
    screenName: '(global)',
    aliases: ['Role gate denial']
  });
  upsertTestId({
    id: 'form-error',
    screenName: '(global)',
    aliases: ['Form-level validation error']
  });

  // ---- Data interfaces -----------------------------------------------------
  const dataInterfaces: DataInterfaceEntry[] = entities.map((entity) => {
    const ifaceName = pascalCase(entity.name);
    const lines: string[] = [];
    lines.push(`export interface ${ifaceName} {`);
    lines.push(`  id: string;`);
    for (const field of entity.fields) {
      const optional = field.required ? '' : '?';
      const ts = deriveTsType(field);
      lines.push(`  ${escapePropertyName(field.name)}${optional}: ${ts};`);
    }
    lines.push(`}`);
    const tsInterface = lines.join('\n');
    const storageAdapter = `export interface ${ifaceName}StorageAdapter {
  list(): Promise<${ifaceName}[]>;
  get(id: string): Promise<${ifaceName} | null>;
  create(input: Omit<${ifaceName}, 'id'>): Promise<${ifaceName}>;
  update(id: string, patch: Partial<${ifaceName}>): Promise<${ifaceName}>;
  remove(id: string): Promise<void>;
}`;
    return { entityName: entity.name, tsInterface, storageAdapter };
  });

  // ---- Flows ---------------------------------------------------------------
  const flows: FlowSpec[] = [];
  const workflowsForFlows = extractions?.workflows || [];
  for (const wf of workflowsForFlows) {
    // Resolve the primary entity once.
    const primaryEntity = pickPrimaryEntity(wf, entities);
    const eslug = primaryEntity ? entitySlug(primaryEntity.name) : 'entity';
    const fillFields = primaryEntity ? topThreeFillFields(primaryEntity) : [];
    const happySample = primaryEntity ? pickHappyTitleSample(primaryEntity) : undefined;
    const { route: gotoRoute } = firstMatchingScreenRoute(wf, routes, screens);

    // Resolve actors that own this workflow. Primary first, then secondaries.
    const actorIds = [wf.primaryActor, ...(wf.secondaryActors || [])].filter(
      (id, idx, arr) => id && arr.indexOf(id) === idx
    );
    const resolvedActors: Actor[] = [];
    for (const id of actorIds) {
      const actor = findActorByIdOrName(actors, id, extractions);
      if (actor && !resolvedActors.some((a) => a.id === actor.id)) {
        resolvedActors.push(actor);
      }
    }
    if (!resolvedActors.length) resolvedActors.push(context.primaryActor);

    for (const actor of resolvedActors) {
      const flowId = `${slugify(actor.id || actor.name)}-${slugify(wf.name)}`;

      const happySteps: FlowStep[] = [
        {
          kind: 'goto',
          url: gotoRoute,
          description: `Navigate to ${gotoRoute} as ${actor.name}.`
        }
      ];
      const negativeSteps: FlowStep[] = [
        {
          kind: 'goto',
          url: gotoRoute,
          description: `Navigate to ${gotoRoute} as ${actor.name} for the negative path.`
        }
      ];
      const rolePermissionSteps: FlowStep[] = [
        {
          kind: 'goto',
          url: gotoRoute,
          description: `Navigate to ${gotoRoute} as ${actor.name} to verify role gating.`
        }
      ];

      // Fill steps share happy + roleGate; negative deliberately omits one
      // required field if available, otherwise mirrors happy.
      if (primaryEntity && fillFields.length) {
        const happySampleId = happySample?.id || 'sample-001';
        for (const field of fillFields) {
          const testId = `${eslug}-${fieldSlug(field)}`;
          happySteps.push({
            kind: 'fill',
            testId,
            valueFromSample: `${primaryEntity.name}.${happySampleId}.${field.name}`,
            description: `Populate ${primaryEntity.name}.${field.name}.`
          });
          rolePermissionSteps.push({
            kind: 'fill',
            testId,
            valueFromSample: `${primaryEntity.name}.${happySampleId}.${field.name}`,
            description: `Populate ${primaryEntity.name}.${field.name} (role-permission attempt).`
          });
        }
        // Negative path: skip the first required field to trigger form-error.
        const requiredFirst = fillFields.find((f) => f.required) || fillFields[0];
        for (const field of fillFields) {
          if (field === requiredFirst) continue;
          const testId = `${eslug}-${fieldSlug(field)}`;
          negativeSteps.push({
            kind: 'fill',
            testId,
            valueFromSample: `${primaryEntity.name}.${happySampleId}.${field.name}`,
            description: `Populate ${primaryEntity.name}.${field.name} (negative path).`
          });
        }
      }

      // Submit click.
      const submitId = `${eslug}-submit`;
      happySteps.push({
        kind: 'click',
        testId: submitId,
        description: `Submit the ${primaryEntity?.name || 'form'} action.`
      });
      negativeSteps.push({
        kind: 'click',
        testId: submitId,
        description: `Submit incomplete ${primaryEntity?.name || 'form'} to trigger validation.`
      });
      rolePermissionSteps.push({
        kind: 'click',
        testId: submitId,
        description: `Submit ${primaryEntity?.name || 'form'} as a non-authorized actor.`
      });

      // Final asserts.
      happySteps.push({
        kind: 'assertText',
        text: happySample?.title || `${actor.name} completed ${wf.name}`,
        description: 'Happy-path success indicator.'
      });
      negativeSteps.push({
        kind: 'assertText',
        testId: 'form-error',
        text: 'required',
        description: 'Form-level validation surfaces a required-field error.'
      });
      rolePermissionSteps.push({
        kind: 'assertText',
        testId: 'permission-denied',
        text: 'permission',
        description: 'Permission gate denies the unauthorized actor.'
      });

      flows.push({
        flowId,
        actorId: actor.id,
        actorName: actor.name,
        workflowName: wf.name,
        // E3a defers REQ-ID resolution to the per-phase loop in the generator;
        // that loop knows phase.requirementIds and intersects with this set.
        // We carry the workflow id as a reqIds seed for downstream consumption.
        reqIds: [],
        loginMock: { strategy: 'query-string', param: 'as', value: actor.id },
        steps: happySteps,
        negativeSteps,
        rolePermissionSteps,
        notes:
          (wf.failureModes && wf.failureModes.length
            ? `Failure modes considered: ${wf.failureModes.map((f) => f.trigger).join('; ')}.`
            : undefined)
      });
    }
  }

  // Empty / loading / error states per route.
  const emptyLoadingErrorByRoute: ImplementationSurface['emptyLoadingErrorByRoute'] = routes.map(
    (route) => {
      const screen = screens.find((s) => s.name === route.screenName);
      return {
        path: route.path,
        empty: screen?.emptyState || 'Explain why the screen has no data yet and how to recover.',
        loading: screen?.loadingState || 'Show loading without collapsing layout.',
        error: screen?.errorState || 'Tell the user what blocked the action and how to retry.'
      };
    }
  );

  return {
    routes,
    components,
    testIds: Array.from(testIdMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    dataInterfaces,
    flows,
    emptyLoadingErrorByRoute
  };
}

// ---- Renderers ------------------------------------------------------------

export function renderTestIdGlossaryTable(surface: ImplementationSurface): string {
  if (!surface.testIds.length) return '_No testids derived._';
  const rows = surface.testIds
    .map(
      (entry) =>
        `| \`${entry.id}\` | ${entry.screenName} | ${entry.workflowStep || '—'} | ${
          (entry.aliases || []).join(', ') || '—'
        } |`
    )
    .join('\n');
  return `| Test ID | Screen | Workflow step | Aliases |
| --- | --- | --- | --- |
${rows}`;
}

function renderRouteTable(surface: ImplementationSurface): string {
  if (!surface.routes.length) return '_No routes derived._';
  const rows = surface.routes
    .map(
      (r) =>
        `| \`${r.path}\` | ${r.screenName} | \`${r.component}\` | ${r.primaryUser} |`
    )
    .join('\n');
  return `| Route | Screen | Component | Primary user |
| --- | --- | --- | --- |
${rows}`;
}

function renderComponentTable(surface: ImplementationSurface): string {
  if (!surface.components.length) return '_No components derived._';
  const rows = surface.components
    .map((c) => `| \`${c.name}\` | ${c.screenName} | ${c.purpose} |`)
    .join('\n');
  return `| Component | Screen | Purpose |
| --- | --- | --- |
${rows}`;
}

function renderDataContract(surface: ImplementationSurface): string {
  if (!surface.dataInterfaces.length) {
    return '_No data interfaces derived (no entities in extractions)._';
  }
  return surface.dataInterfaces
    .map(
      (entry) =>
        `### ${entry.entityName}

\`\`\`ts
${entry.tsInterface}
\`\`\`

**Storage adapter contract**

\`\`\`ts
${entry.storageAdapter}
\`\`\`
`
    )
    .join('\n');
}

function renderFlowIndex(surface: ImplementationSurface): string {
  if (!surface.flows.length) {
    return '_No per-actor flows derived (no research workflows)._';
  }
  return surface.flows
    .map(
      (flow) =>
        `- **${flow.flowId}** — ${flow.actorName} on "${flow.workflowName}". JSON written under \`phases/<phase-slug>/PLAYWRIGHT_FLOWS/${flow.flowId}.json\` for every phase whose REQ-IDs touch this workflow.`
    )
    .join('\n');
}

function renderEmptyLoadingError(surface: ImplementationSurface): string {
  if (!surface.emptyLoadingErrorByRoute.length) {
    return '_No routes derived; nothing to enumerate._';
  }
  return surface.emptyLoadingErrorByRoute
    .map(
      (entry) =>
        `- \`${entry.path}\`
  - Empty: ${entry.empty}
  - Loading: ${entry.loading}
  - Error: ${entry.error}`
    )
    .join('\n');
}

function renderMockAuthSection(surface: ImplementationSurface): string {
  // Recognized actor IDs come from flow loginMock values plus any actor with
  // ≥ 1 flow; keep the union deduped for stability.
  const actorIds = Array.from(
    new Set(surface.flows.map((f) => f.loginMock.value))
  );
  if (!actorIds.length) {
    return `## Mock auth

The browser runner authenticates by appending \`?as=<actorId>\` to the URL. The application MUST read this parameter at boot, hydrate the session as if that actor signed in, and apply the matching role gate.

Recognized actor IDs are derived per-project. This workspace did not derive any flows, so no actor IDs are listed here.

The application MUST surface \`data-testid="permission-denied"\` when an actor attempts an action they cannot perform, and \`data-testid="form-error"\` when a submission fails validation.`;
  }
  const list = actorIds.map((id) => `- \`${id}\``).join('\n');
  return `## Mock auth

The browser runner authenticates by appending \`?as=<actorId>\` to the URL. The application MUST read this parameter at boot, hydrate the session as if that actor signed in, and apply the matching role gate.

Recognized actor IDs:
${list}

The application MUST surface \`data-testid="permission-denied"\` when an actor attempts an action they cannot perform, and \`data-testid="form-error"\` when a submission fails validation.`;
}

export function renderImplementationContractMarkdown(surface: ImplementationSurface): string {
  return `# IMPLEMENTATION_CONTRACT

> Single source of truth for routes, components, test IDs, data interfaces, and per-actor Playwright flows. Every downstream builder (agent prompts, demo generator, browser-loop runner) reads this file. If you change a route, component, or testid, change it here first.

${renderMockAuthSection(surface)}

## Route map

${renderRouteTable(surface)}

## Component map

${renderComponentTable(surface)}

## Data contract

${renderDataContract(surface)}

## Test ID glossary

${renderTestIdGlossaryTable(surface)}

## Per-actor flow specs

${renderFlowIndex(surface)}

## Empty / loading / error states

${renderEmptyLoadingError(surface)}
`;
}

/** Pretty-print a flow spec as JSON for emission under PLAYWRIGHT_FLOWS/. */
export function serializeFlowSpec(flow: FlowSpec): string {
  return JSON.stringify(flow, null, 2);
}
