const fs = require('fs');
const path = require('path');

/**
 * Đăng ký Config Controller routes
 * @param {Object} app - Express app instance
 * @param {Object} deps - Dependencies
 * @param {Object} deps.configService - ConfigService instance
 * @param {Object} deps.scheduler - Scheduler instance
 * @param {Object} deps.logger - Logger instance
 * @returns {void}
 */
function registerConfigController(app, { configService, scheduler, logger }) {
  /**
   * API Endpoint: Lấy cấu hình hiện tại
   * GET /api/config
   */
  app.get('/api/config', (req, res) => {
    try {
      const cfg = configService.getConfig();
      res.json(cfg);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Raw config endpoints for editor (text-based)
  app.get('/api/config/raw', (req, res) => {
    try {
      const content = fs.readFileSync(configService.paths.CONFIG_PATH, 'utf8');
      res.type('application/json').send(content);
    } catch (e) {
      res.status(500).send(JSON.stringify({ ok: false, error: e.message }));
    }
  });

  app.post('/api/config/raw', (req, res) => {
    try {
      // Body may already be parsed to object by express.json middleware
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const saved = configService.setConfig(data);
      try { scheduler?.restart?.(); } catch (_) {}
      logger?.send('[CONFIG] Đã lưu config.json từ Raw Editor');
      res.json({ ok: true, data: saved });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/config', (req, res) => {
    try {
      const saved = configService.setConfig(req.body || {});
      try { scheduler?.restart?.(); } catch (_) {}
      logger?.send('[CONFIG] Đã cập nhật cấu hình');
      res.json({ ok: true, data: saved });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Initialize context directory structure: Katalyst/{repo,builder}
  app.post('/api/config/init-context', (req, res) => {
    try {
      const basePath = String(
        req.body?.basePath || req.body?.path || req.body?.contextInitPath || ''
      ).trim();
      if (!basePath) return res.status(400).json({ ok: false, error: 'Thiếu tham số basePath/contextInitPath' });
      const katalystDir = path.resolve(basePath, 'Katalyst');
      const repoDir = path.join(katalystDir, 'repo');
      const builderDir = path.join(katalystDir, 'builder');
      fs.mkdirSync(katalystDir, { recursive: true });
      fs.mkdirSync(repoDir, { recursive: true });
      fs.mkdirSync(builderDir, { recursive: true });
      logger?.send(`[CONFIG] Đã khởi tạo cấu trúc context tại ${katalystDir}`);
      res.json({ ok: true, data: { katalystDir, repoDir, builderDir } });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/config/versions', (req, res) => {
    try {
      res.json(configService.listConfigVersions());
    } catch (e) {
      res.json([]);
    }
  });

  app.post('/api/config/rollback', (req, res) => {
    const file = String(req.body?.file || '');
    if (!file) return res.status(400).json({ ok: false, error: 'Thiếu tham số file' });
    try {
      const data = configService.rollbackConfig(file);
      res.json({ ok: true, data });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Delete a specific config version file
  app.post('/api/config/delete', (req, res) => {
    const file = String(req.body?.file || '');
    if (!file) return res.status(400).json({ ok: false, error: 'Thiếu tham số file' });
    try {
      const abs = path.join(configService.paths.CONFIG_VERSIONS_DIR, path.basename(file));
      fs.unlinkSync(abs);
      logger?.send(`[VERSION] Xoá phiên bản cấu hình ${path.basename(file)}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerConfigController };