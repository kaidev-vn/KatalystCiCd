class Scheduler {
  constructor({ logger, configService, gitService }) {
    this.logger = logger;
    this.configService = configService;
    this.gitService = gitService;
    this._timer = null;
  }

  restart() {
    try { if (this._timer) clearInterval(this._timer); } catch (_) {}
    const cfg = this.configService.getConfig();
    if (!cfg.autoCheck) {
      this.logger?.send('[SCHEDULER] autoCheck đang tắt.');
      return;
    }
    const polling = Number(cfg.polling || 30);
    this.logger?.send(`[SCHEDULER] Bật autoCheck mỗi ${polling}s.`);
    this._timer = setInterval(async () => {
      try {
        const current = this.configService.getConfig();
        if (!current.repoPath) return;
        await this.gitService.checkAndBuild({ repoPath: current.repoPath, branch: current.branch || 'main' });
      } catch (e) {
        this.logger?.send(`[SCHEDULER][ERROR] ${e.message}`);
      }
    }, Math.max(5, polling) * 1000);
  }
}

module.exports = { Scheduler };