const { exec } = require('child_process');
const fs = require('fs');

/**
 * Resolve shell executable path cho cross-platform support
 * Tìm shell phù hợp cho Windows (cmd.exe/powershell) hoặc Unix (/bin/sh, /bin/bash)
 * @returns {string|undefined} Shell path hoặc undefined để dùng default
 */
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

/**
 * Chạy một command và stream output qua logger
 * @param {string} command - Command cần chạy
 * @param {Object} [logger] - Logger instance với method send()
 * @param {Object} [options={}] - Execution options
 * @param {Object} [options.env] - Environment variables override
 * @param {string} [options.cwd] - Working directory
 * @param {string} [options.shell] - Shell executable path
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @returns {Promise<Object>} Execution result
 * @returns {Error|null} return.error - Error object nếu có lỗi
 * @returns {string} return.stdout - Standard output
 * @returns {string} return.stderr - Standard error output
 */
function run(command, logger, options = {}) {
  return new Promise((resolve) => {
    const child = exec(command, {
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...(options.env || {}) },
      cwd: options.cwd,
      shell: options.shell || resolveShell(),
      timeout: typeof options.timeout === 'number' ? options.timeout : undefined
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

/**
 * Chạy nhiều commands tuần tự (serial execution)
 * Dừng ngay khi có command failed
 * @async
 * @param {Array<string>} commands - Danh sách commands
 * @param {Object} [logger] - Logger instance
 * @param {Object} [options={}] - Execution options (same as run())
 * @returns {Promise<Object>} Execution result
 * @returns {boolean} return.hadError - True nếu có command nào failed
 */
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