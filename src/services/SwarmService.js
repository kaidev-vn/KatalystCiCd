const { run } = require('../utils/exec');

class SwarmService {
  constructor({ logger }) {
    this.logger = logger;
  }

  async deploy({ composePath, stackName }) {
    if (!composePath || !stackName) throw new Error('Thiếu composePath hoặc stackName');
    const cmd = `docker stack deploy -c "${composePath}" ${stackName}`;
    this.logger?.send(`[SWARM] Deploy stack: ${stackName}`);
    const r = await run(cmd, this.logger);
    if (r.error) throw new Error(r.stderr || r.error.message);
    return { ok: true };
  }
}

module.exports = { SwarmService };