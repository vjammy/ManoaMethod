/**
 * Default audit-exit callback factory.
 *
 * Builds an audit run function that:
 *   1. Writes the candidate ResearchExtractions to a temporary research/extracted/
 *      tree
 *   2. Runs create-project against a temp output directory using --research-from
 *   3. Runs the quality audit on the resulting workspace
 *   4. Returns an AuditExitResult shaped for runResearchLoop.auditExit
 *
 * Decoupling: lib/research/ doesn't import from scripts/. This module imports
 * from scripts/ but it's only loaded when the caller wires the auditExit option,
 * so non-audit callers don't pay the import cost.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createArtifactPackage } from '../../scripts/mvp-builder-create-project';
import { runAudit } from '../../scripts/mvp-builder-quality-audit';
import type { ProjectInput } from '../types';
import { evaluateDepthGate } from './depth-gate';
import type { AuditExitConfig, AuditExitResult } from './loop';
import type { ResearchExtractions } from './schema';

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Write the research extractions into <root>/research/extracted/*.json so
 * create-project --research-from can consume them. Mirrors the layout
 * lib/research/persistence.ts uses for full LoopResult writes.
 */
function writeExtractionsToDir(root: string, ex: ResearchExtractions) {
  const out = path.join(root, 'research', 'extracted');
  writeJson(path.join(out, 'meta.json'), ex.meta);
  writeJson(path.join(out, 'actors.json'), ex.actors);
  writeJson(path.join(out, 'entities.json'), ex.entities);
  writeJson(path.join(out, 'workflows.json'), ex.workflows);
  writeJson(path.join(out, 'integrations.json'), ex.integrations);
  writeJson(path.join(out, 'risks.json'), ex.risks);
  writeJson(path.join(out, 'gates.json'), ex.gates);
  writeJson(path.join(out, 'antiFeatures.json'), ex.antiFeatures);
  writeJson(path.join(out, 'conflicts.json'), ex.conflicts);
  writeJson(path.join(out, '_removed.json'), ex.removed);
  // Minimal narrative placeholders so the workspace's research dir is complete.
  fs.writeFileSync(path.join(root, 'research', 'USE_CASE_RESEARCH.md'), '# USE_CASE_RESEARCH\n', 'utf8');
  fs.writeFileSync(path.join(root, 'research', 'DOMAIN_RESEARCH.md'), '# DOMAIN_RESEARCH\n', 'utf8');
  fs.writeFileSync(path.join(root, 'research', 'CONVERGENCE_LOG.md'), '# CONVERGENCE_LOG\n', 'utf8');
}

/**
 * Build the audit callback for a brief. Each invocation of the returned
 * function generates a fresh temp workspace, audits it, returns the result,
 * and then deletes the workspace (kept opt-in via keepArtifacts).
 */
export function buildAuditExitCallback(args: {
  brief: ProjectInput;
  threshold: number;
  respectCaps: boolean;
  /** Phase F follow-up: enforce depth-gate. When true, the run populates
   * AuditExitResult.depthGateBlocking and runResearchLoop treats blocking
   * failures as "not yet passing". */
  depthEnforcement?: boolean;
  /** Defaults to OS temp dir. Set to a stable path when debugging. */
  workdir?: string;
  /** Set true to retain the temp workspaces between calls (debugging). Default false. */
  keepArtifacts?: boolean;
}): AuditExitConfig {
  const root =
    args.workdir ??
    fs.mkdtempSync(path.join(os.tmpdir(), `mvp-audit-exit-${crypto.randomBytes(4).toString('hex')}-`));
  fs.mkdirSync(root, { recursive: true });

  let attempt = 0;

  const run = async (extractions: ResearchExtractions): Promise<AuditExitResult> => {
    attempt += 1;
    const inputDir = path.join(root, `attempt-${attempt}`);
    const outDir = path.join(inputDir, 'out');
    fs.mkdirSync(inputDir, { recursive: true });
    writeExtractionsToDir(inputDir, extractions);

    await createArtifactPackage({
      input: args.brief,
      outDir,
      researchFrom: inputDir
    });

    const workspaceRoot = path.join(outDir, 'mvp-builder-workspace');
    const result = runAudit(workspaceRoot);

    const audit: AuditExitResult = {
      total: result.total,
      capApplied: result.expert?.cap ?? 100,
      capReasons: result.expert?.capReasons ?? [],
      topFindings: result.topFindings.map((f) => ({
        severity: f.severity,
        dimension: f.dimension,
        message: f.message
      }))
    };

    // Phase F follow-up: depth-gate evaluation feeds into the loop's pass
    // decision and into the gap list for targeted re-extraction.
    if (args.depthEnforcement && result.expert) {
      const gate = evaluateDepthGate({
        expertDims: result.expert.dimensions.map((d) => ({ name: d.name, score: d.score, max: d.max })),
        researchSource: result.readiness.researchSource,
        riskCategories: extractions.risks.map((r) => r.category)
      });
      if (gate.blocking.length > 0) {
        audit.depthGateBlocking = gate.blocking.map((b) => ({
          dim: b.dim,
          score: b.score,
          threshold: b.threshold,
          upstreamPass: b.upstreamPass,
          remediation: b.remediation
        }));
      }
    }

    if (!args.keepArtifacts) {
      try {
        fs.rmSync(inputDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup; not fatal
      }
    }

    return audit;
  };

  return {
    threshold: args.threshold,
    respectCaps: args.respectCaps,
    depthEnforcement: args.depthEnforcement,
    run
  };
}
