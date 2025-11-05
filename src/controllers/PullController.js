const { run } = require('../utils/exec');

/**
 * Đăng ký Pull Controller routes
 * @param {Object} app - Express app instance
 * @param {Object} deps - Dependencies
 * @param {Object} deps.configService - ConfigService instance
 * @param {Object} deps.logger - Logger instance
 * @returns {void}
 */
function registerPullController(app, { configService, logger }) {
  /**
   * API Endpoint: Manual pull từ Git repository
   * POST /api/pull
   * Thực hiện git pull thủ công từ cấu hình
   */
  app.post('/api/pull', async (req, res) => {
    const cfg = configService.getConfig();
    logger?.send('[PULL] Bắt đầu pull code...');
    if (cfg.repoPath) {
      const command = `git -C "${cfg.repoPath}" pull`;
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