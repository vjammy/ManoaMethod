#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runOrchestrate } from './xelera-orchestrate';
import { runScore } from './xelera-score';
import { runGates } from './xelera-gates';
import { runRecover } from './xelera-recover';

export function runCli() {
  const command = process.argv[2];

  if (command === 'orchestrate') {
    runOrchestrate();
    return;
  }
  if (command === 'score') {
    runScore();
    return;
  }
  if (command === 'gates') {
    runGates();
    return;
  }
  if (command === 'recover') {
    runRecover();
    return;
  }

  console.log('Usage: xelera <orchestrate|score|gates|recover> [--repo=path] [--package=path]');
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    runCli();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
