/**
 * Generate requirements/REGULATORY_NOTES.md from a ResearchExtractions
 * document. Deterministic; no LLM judge.
 *
 * Sources of regulatory citations:
 *   - gates[].mandatedBy === 'regulation' or 'industry-standard'
 *   - gates[].mandatedByDetail (parsed for citation patterns)
 *   - risks[] with category 'compliance' | 'privacy' | 'legal'
 *
 * Pulls citation strings (HIPAA, GDPR, CAN-SPAM, CPRA, FERPA, COPPA, etc.) and
 * maps each one to:
 *   - the gates that depend on it
 *   - the risks that flag it
 *   - the entities it applies to
 *   - REQ-Ns derived from owning workflows
 *
 * The audit's regulatory-mapping dimension scores:
 *   - File exists when any regulation is cited in research
 *   - Each citation appears in REGULATORY_NOTES, security-risk docs, and
 *     at least one TEST_SCRIPT.md
 *   - Each citation maps to ≥1 specific REQ ID
 */
import type { ResearchExtractions } from '../research/schema';

// Citation regex stays conservative: match the well-known regulation name and
// at most one short legal section reference (Art. N, §N.NN). Long parenthetical
// extensions are NOT matched — those produce noise like grabbing whole
// sentences as a single "citation."
const CITATION_PATTERN =
  /\b(GDPR(?:\s+Art\.?\s*\d+)?|CAN-SPAM(?:\s+Act)?|HIPAA(?:\s+[A-Z][a-z]+\s+Rule)?(?:\s+§\d[\d.]*)?|CPRA(?:\s+§\d[\d.]*)?|CCPA|FERPA|PCI(?:\s+DSS)?|SOC\s*2|TCPA|CASL|COPPA)\b/gi;

/**
 * Phase H M9 — clamp a string at a sentence/clause boundary that does not
 * exceed `cap` characters. Prefers `; ` (the join separator used here),
 * then `. `, then `, `; if no suitable boundary exists in the cap window,
 * truncates at the last whitespace; never cuts a word in half.
 *
 * If the input fits inside `cap`, it is returned unchanged. The returned
 * string ends with `…` only when truncation actually shortened it.
 *
 * Exported for direct testing.
 */
export function clampAtSentenceBoundary(input: string, cap: number): string {
  if (!input || input.length <= cap) return input;
  const candidates = ['; ', '. ', ', '];
  for (const sep of candidates) {
    const idx = input.lastIndexOf(sep, cap);
    if (idx > 0) {
      const truncated = input.slice(0, idx + (sep === ', ' ? 0 : 1));
      return `${truncated}…`;
    }
  }
  // No clause boundary in the cap window — fall back to whitespace.
  const wsIdx = input.lastIndexOf(' ', cap);
  if (wsIdx > 0) return `${input.slice(0, wsIdx)}…`;
  // No whitespace either — return full string up to cap with ellipsis. We
  // never mid-word truncate, so cap a few chars short of the boundary.
  return `${input.slice(0, Math.max(0, cap - 1))}…`;
}

export type RegulatoryEntry = {
  citation: string;
  appearsInGates: string[];
  appearsInRisks: string[];
  appliesToEntities: string[];
  appliesToReqs: string[];
  enforcement: string;
};

export function deriveRegulatoryEntries(extractions: ResearchExtractions): RegulatoryEntry[] {
  // Index workflows × steps to map entities -> REQ-Ns (matches the
  // buildFunctionalRequirementsFromResearch flattening in lib/generator.ts).
  const flatSteps: Array<{ workflow: typeof extractions.workflows[number]; stepIdx: number }> = [];
  for (const wf of extractions.workflows) {
    for (let i = 0; i < wf.steps.length; i += 1) flatSteps.push({ workflow: wf, stepIdx: i });
  }
  const entityToReqs = new Map<string, string[]>();
  flatSteps.forEach((slot, idx) => {
    const reqId = `REQ-${idx + 1}`;
    for (const entityId of slot.workflow.entitiesTouched) {
      const entity = extractions.entities.find((e) => e.id === entityId);
      if (!entity) continue;
      if (!entityToReqs.has(entity.name)) entityToReqs.set(entity.name, []);
      entityToReqs.get(entity.name)!.push(reqId);
    }
  });

  // Collect citations from gates and risks.
  const citationMap = new Map<string, RegulatoryEntry>();
  const ensure = (citation: string): RegulatoryEntry => {
    if (!citationMap.has(citation)) {
      citationMap.set(citation, {
        citation,
        appearsInGates: [],
        appearsInRisks: [],
        appliesToEntities: [],
        appliesToReqs: [],
        enforcement: ''
      });
    }
    return citationMap.get(citation)!;
  };

  for (const gate of extractions.gates) {
    if (gate.mandatedBy !== 'regulation' && gate.mandatedBy !== 'industry-standard') continue;
    const detail = `${gate.name} ${gate.mandatedByDetail || ''}`;
    const matches = detail.match(CITATION_PATTERN) || [];
    const distinct = Array.from(new Set(matches.map((m) => m.trim())));
    for (const citation of distinct) {
      const entry = ensure(citation);
      if (!entry.appearsInGates.includes(gate.name)) entry.appearsInGates.push(gate.name);
      if (!entry.enforcement) {
        // Phase H M9 — sentence-aware truncation. The pre-H code did
        // `.slice(0, 240)` which cut mid-word ("Test that the " ←). Now we
        // emit the full evidence list when it fits in 480 chars (the audit
        // dim doesn't penalize length); otherwise we truncate at the last
        // `; ` boundary before the cap so the closing sentence is intact.
        entry.enforcement = clampAtSentenceBoundary(gate.evidenceRequired.join('; '), 480);
      }
    }
  }

  for (const risk of extractions.risks) {
    if (risk.category !== 'compliance' && risk.category !== 'privacy' && risk.category !== 'legal') continue;
    const matches = `${risk.description} ${risk.mitigation}`.match(CITATION_PATTERN) || [];
    const distinct = Array.from(new Set(matches.map((m) => m.trim())));
    for (const citation of distinct) {
      const entry = ensure(citation);
      if (!entry.appearsInRisks.includes(risk.description.slice(0, 80))) {
        entry.appearsInRisks.push(risk.description.slice(0, 80));
      }
      // Map affected entities → REQs
      for (const entityId of risk.affectedEntities) {
        const entity = extractions.entities.find((e) => e.id === entityId);
        if (!entity) continue;
        if (!entry.appliesToEntities.includes(entity.name)) entry.appliesToEntities.push(entity.name);
        for (const r of entityToReqs.get(entity.name) || []) {
          if (!entry.appliesToReqs.includes(r)) entry.appliesToReqs.push(r);
        }
      }
    }
  }

  // Backfill: for citations only in gates (no risk), still try to map entities via gate name keywords.
  for (const entry of citationMap.values()) {
    if (entry.appliesToEntities.length === 0) {
      // Heuristic: gate names that mention "data privacy", "PII" map to entities with PII fields.
      const gateNames = entry.appearsInGates.join(' ').toLowerCase();
      if (/(privacy|pii|data|erasure|forgotten)/i.test(gateNames)) {
        for (const e of extractions.entities) {
          const hasPii = e.fields.some((f) => f.pii || f.sensitive);
          if (hasPii) {
            entry.appliesToEntities.push(e.name);
            for (const r of entityToReqs.get(e.name) || []) {
              if (!entry.appliesToReqs.includes(r)) entry.appliesToReqs.push(r);
            }
          }
        }
      }
    }
  }

  return Array.from(citationMap.values()).sort((a, b) => a.citation.localeCompare(b.citation));
}

export function renderRegulatoryNotesMarkdown(extractions: ResearchExtractions): string {
  const entries = deriveRegulatoryEntries(extractions);
  if (entries.length === 0) {
    return `# REGULATORY_NOTES

> Research extractions did not surface any regulatory or industry-standard citations for this domain. If this is wrong, the research recipe may have under-extracted; revisit \`research/extracted/gates.json\` and \`research/extracted/risks.json\`.

This file is intentionally short when there are no in-scope regulations. The audit treats an empty file as acceptable for domains where no regulation applies (e.g., internal-only personal productivity tooling).
`;
  }

  const lines: string[] = [];
  lines.push('# REGULATORY_NOTES');
  lines.push('');
  lines.push('> Generated from `research/extracted/gates.json` (regulation-mandated gates) and `research/extracted/risks.json` (compliance / privacy / legal risks). Each citation lists the gates and risks it triggers, the entities it applies to, and the specific REQ IDs that must include compliance evidence.');
  lines.push('');
  lines.push(`## Citations summary (${entries.length})`);
  lines.push('');
  lines.push('| Citation | Gates | Risks | Entities | REQs |');
  lines.push('| --- | ---: | ---: | --- | --- |');
  for (const e of entries) {
    lines.push(
      `| ${e.citation} | ${e.appearsInGates.length} | ${e.appearsInRisks.length} | ${e.appliesToEntities.join(', ') || '—'} | ${e.appliesToReqs.join(', ') || '—'} |`
    );
  }
  lines.push('');
  for (const e of entries) {
    lines.push(`## ${e.citation}`);
    lines.push('');
    if (e.appearsInGates.length) lines.push(`- **Mandates these gates**: ${e.appearsInGates.join(', ')}`);
    if (e.appearsInRisks.length) lines.push(`- **Linked risks**: ${e.appearsInRisks.join(' | ')}`);
    if (e.appliesToEntities.length) lines.push(`- **Applies to entities**: ${e.appliesToEntities.join(', ')}`);
    if (e.appliesToReqs.length) lines.push(`- **Specific REQ IDs**: ${e.appliesToReqs.join(', ')}`);
    if (e.enforcement) lines.push(`- **Enforcement evidence required**: ${e.enforcement}`);
    lines.push('');
    lines.push(`Tests for any REQ in this list must include at least one assertion that verifies ${e.citation} compliance — e.g. an opt-out flow, a data-erasure flow, a consent record, or a sender-authentication check, depending on the regulation.`);
    lines.push('');
  }
  return lines.join('\n');
}
