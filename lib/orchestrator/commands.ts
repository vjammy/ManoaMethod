import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CommandResult, RepoState } from './types';
import { writeFile } from './utils';

const REQUIRED = ['typecheck', 'smoke', 'build', 'test:quality-regression'] as const;
// Phase G E1 — `loop:browser` runs the per-actor PLAYWRIGHT_FLOWS specs the
// generator emits at `phases/<slug>/PLAYWRIGHT_FLOWS/*.json`. It is OPTIONAL
// because Playwright is dynamically imported and the runner skips with
// `skipReason='no-playwright'` when not installed in the built app. Wiring it
// into the orchestrator means the gate engine at minimum *records* the
// browser-loop output as evidence; recovery prompts can cite the result.
const OPTIONAL = ['test', 'lint', 'validate', 'regression', 'loop:browser'] as const;

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runScript(repoRoot: string, script: string) {
  if (!/^[a-z0-9:-]+$/i.test(script)) {
    throw new Error(`Refusing to run unsafe script name: ${script}`);
  }

  const result = spawnSync(npmCommand(), ['run', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    // npm.cmd still requires shell mediation on Windows in this environment.
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      MVP_BUILDER_REPORT_ROOT: path.join(path.dirname(commandsRootForScript(repoRoot, script)), 'nested-orchestrator')
    }
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function createResult(
  repoState: RepoState,
  name: string,
  required: boolean,
  commandsRoot: string,
  dryRun: boolean
): CommandResult {
  const detected = Boolean(repoState.packageScripts[name]);
  const command = `npm run ${name}`;
  const outputPath = path.join(commandsRoot, `${name.replace(/[:/]/g, '-')}.md`);

  if (!detected) {
    const result: CommandResult = {
      name,
      command,
      required,
      detected,
      status: 'missing',
      exitCode: null,
      stdout: '',
      stderr: '',
      outputPath
    };
    writeFile(outputPath, `# ${name}\n\n- Command: \`${command}\`\n- Status: missing\n- Required: ${required ? 'yes' : 'no'}\n`);
    return result;
  }

  if (dryRun) {
    const result: CommandResult = {
      name,
      command,
      required,
      detected,
      status: 'skipped',
      exitCode: null,
      stdout: '',
      stderr: '',
      outputPath
    };
    writeFile(outputPath, `# ${name}\n\n- Command: \`${command}\`\n- Status: skipped (dry run)\n- Required: ${required ? 'yes' : 'no'}\n`);
    return result;
  }

  const execution = runScript(repoState.repoRoot, name);
  const status = execution.exitCode === 0 ? 'passed' : 'failed';
  const result: CommandResult = {
    name,
    command,
    required,
    detected,
    status,
    exitCode: execution.exitCode,
    stdout: execution.stdout,
    stderr: execution.stderr,
    outputPath
  };

  writeFile(
    outputPath,
    `# ${name}

- Command: \`${command}\`
- Status: ${status}
- Exit code: ${execution.exitCode ?? 'none'}
- Required: ${required ? 'yes' : 'no'}

\`\`\`text
${(execution.stdout + (execution.stderr ? `\n${execution.stderr}` : '')).trim() || '(no output)'}
\`\`\`
`
  );

  return result;
}

function commandsRootForScript(repoRoot: string, script: string) {
  return path.join(repoRoot, 'orchestrator', 'nested-command-context', script.replace(/[:/]/g, '-'));
}

export function runProjectCommands(
  repoState: RepoState,
  commandsRoot: string,
  dryRun: boolean
) {
  const all = [...REQUIRED.map((name) => ({ name, required: true })), ...OPTIONAL.map((name) => ({ name, required: false }))];
  return all.map((item) => createResult(repoState, item.name, item.required, commandsRoot, dryRun));
}
