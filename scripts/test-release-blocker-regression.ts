#!/usr/bin/env tsx
import { runReleaseBlockerVerdictRegressionChecks } from './orchestrator-test-utils';

async function main() {
  await runReleaseBlockerVerdictRegressionChecks();
  console.log('Release-blocker verdict/recommendation regression checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
