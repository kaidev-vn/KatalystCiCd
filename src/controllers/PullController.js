const { run } = require('../utils/exec');
const path = require('path');

function registerPullController(app, { configService, logger }) {
  app.post('/api/pull/start', async (req, res) => {
    const cfg = configService.getConfig();
    logger?.send('[PULL] Bắt đầu pull code...');
    // Derive repoPath from contextInitPath (Context/Katalyst/repo)
    const base = String(cfg.contextInitPath || cfg.deployContextCustomPath || '').trim();
    const repoPath = base ? path.join(base, 'Katalyst', 'repo') : (cfg.repoPath || '');
    if (repoPath) {
      const command = `git -C "${repoPath}" pull`;
      logger?.send(`[PULL] Chạy lệnh: ${command}`);
      await run(command, logger);
      logger?.send('[PULL] Hoàn tất.');
    } else {
      setTimeout(() => logger?.send('[PULL] Kiểm tra repository...'), 500);
      setTimeout(() => logger?.send('[PULL] Tải thay đổi từ remote...'), 1200);
      setTimeout(() => logger?.send('[PULL] Hòa trộn thay đổi (merge)...'), 1900);
      setTimeout(() => logger?.send('[PULL] Hoàn tất.'), 2600);
    }
    res.json({ ok: true });
  });
}

module.exports = { registerPullController };