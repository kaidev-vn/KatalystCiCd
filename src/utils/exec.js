const { exec } = require('child_process');
const fs = require('fs');

function resolveShell() {
  // Cross-platform shell resolution to avoid ENOENT (/bin/sh not found)
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'cmd.exe';
  }
  const candidates = [
    process.env.SHELL,
    '/bin/sh',
    '/usr/bin/sh',
    '/bin/bash',
    '/usr/bin/bash',
  ];
  for (const s of candidates) {
    if (!s) continue;
    try {
      // If it's an absolute path, prefer existence check; if it's a command name (like 'bash'), skip fs check
      if (s.startsWith('/') ? fs.existsSync(s) : true) return s;
    } catch (_) {}
  }
  // Fallback: let Node decide (may still work if a default shell exists)
  return undefined;
}

function run(command, logger, options = {}) {
  return new Promise((resolve) => {
    const child = exec(command, {
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...(options.env || {}) },
      cwd: options.cwd,
      shell: options.shell || resolveShell()
    }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
    child.stdout?.on('data', (data) => {
      const lines = String(data).split('\n').filter(Boolean);
      for (const line of lines) logger?.send(`[CMD] ${line}`);
    });
    child.stderr?.on('data', (data) => {
      const lines = String(data).split('\n').filter(Boolean);
      for (const line of lines) logger?.send(`[CMD][ERR] ${line}`);
    });
  });
}

async function runSeries(commands, logger, options = {}) {
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

module.exports = { run, runSeries, resolveShell };