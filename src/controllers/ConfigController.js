function registerConfigController(app, { configService, scheduler, logger }) {
  app.get('/api/config', (req, res) => {
    try {
      const cfg = configService.getConfig();
      res.json(cfg);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
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
}

module.exports = { registerConfigController };