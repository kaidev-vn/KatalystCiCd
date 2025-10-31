const { exec } = require('child_process');

function run(command, logger, options = {}) {
  return new Promise((resolve) => {
    const child = exec(command, { maxBuffer: 10 * 1024 * 1024, env: { ...process.env, ...(options.env || {}) }, cwd: options.cwd }, (error, stdout, stderr) => {
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

module.exports = { run, runSeries };