import { exec, ExecOptions } from "child_process";
import * as fs from "fs";

/**
 * Resolve shell executable path for cross-platform support
 */
export function resolveShell(): string | undefined {
  if (process.platform === "win32") {
    return process.env.ComSpec || "cmd.exe";
  }
  const candidates = [
    process.env.SHELL,
    "/bin/sh",
    "/usr/bin/sh",
    "/bin/bash",
    "/usr/bin/bash",
  ];
  for (const s of candidates) {
    if (!s) continue;
    try {
      if (s.startsWith("/") ? fs.existsSync(s) : true) return s;
    } catch (_) {}
  }
  return undefined;
}

export interface RunResult {
  error: any;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  shell?: string;
  timeout?: number;
}

/**
 * Run a command and stream output via logger
 */
export function run(
  command: string,
  logger: any,
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = exec(
      command,
      {
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, ...(options.env || {}) },
        cwd: options.cwd,
        shell: options.shell || resolveShell(),
        timeout: options.timeout,
      } as ExecOptions,
      (error, stdout, stderr) => {
        resolve({ error, stdout: String(stdout), stderr: String(stderr) });
      },
    );

    child.stdout?.on("data", (data) => {
      const lines = String(data).split("\n").filter(Boolean);
      for (const line of lines) logger?.send(`[CMD] ${line}`);
    });

    child.stderr?.on("data", (data) => {
      const lines = String(data).split("\n").filter(Boolean);
      for (const line of lines) logger?.send(`[CMD][ERR] ${line}`);
    });
  });
}

/**
 * Run multiple commands in series
 */
export async function runSeries(
  commands: string[],
  logger: any,
  options: RunOptions = {},
): Promise<{ hadError: boolean }> {
  let hadError = false;
  for (const cmd of commands) {
    logger?.send(`[RUN] ${cmd}`);
    const { error, stdout, stderr } = await run(cmd, logger, options);
    if (error) {
      hadError = true;
      logger?.send(`[RUN][ERROR] ${error.message}`);
      if (stderr) logger?.send(`[RUN][STDERR] ${stderr.trim()}`);
      break;
    }
    if (stdout) logger?.send(`[RUN][STDOUT] ${stdout.trim()}`);
  }
  return { hadError };
}
