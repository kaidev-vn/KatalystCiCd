/**
 * Đăng ký Builds Controller routes
 * @param {Object} app - Express app instance
 * @param {Object} deps - Dependencies
 * @param {Object} deps.configService - ConfigService instance
 * @param {Object} deps.buildService - BuildService instance
 * @param {Object} [deps.emailService] - EmailService instance (optional)
 * @returns {void}
 */
function registerBuildsController(app, { configService, buildService, emailService }) {
  /**
   * API Endpoint: Lấy danh sách builds
   * GET /api/builds
   */
  app.get('/api/builds', (req, res) => {
    try { res.json(buildService.list()); } catch (e) { res.json([]); }
  });

  app.post('/api/builds', (req, res) => {
    try {
      const { name, env, steps } = req.body || {};
      const item = buildService.add({ name, env, steps });
      res.json({ ok: true, data: item });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.put('/api/builds/:id', (req, res) => {
    try {
      const id = String(req.params.id);
      const it = buildService.update(id, req.body || {});
      res.json({ ok: true, data: it });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.delete('/api/builds/:id', (req, res) => {
    try {
      const id = String(req.params.id);
      const ok = buildService.remove(id);
      res.json({ ok });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/builds/run/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      const r = await buildService.run(id);

      // Gửi email notify nếu bật
      try {
        const cfg = configService.getConfig();
        const emailCfg = cfg.email || {};
        if (emailService && emailCfg.enableEmailNotify && Array.isArray(emailCfg.notifyEmails) && emailCfg.notifyEmails.length) {
          const statusLabel = r.ok ? 'THÀNH CÔNG' : 'THẤT BẠI';
          const subject = `[CI/CD] Build custom ${statusLabel}`;
          const lines = [
            `Build ID: ${r.buildId}`,
            `Trạng thái: ${statusLabel}`,
            `Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
          ];
          const text = lines.join('\n');
          const html = `<div style="font-family:Arial,sans-serif;line-height:1.6">${lines.map(l => `<div>${l}</div>`).join('')}<hr/><div>CI/CD System</div></div>`;
          await emailService.sendNotificationEmail({ toList: emailCfg.notifyEmails, subject, text, html });
        }
      } catch (_) {}

      res.json({ ok: true, result: r });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Get build versions
  app.get('/api/builds/versions', (req, res) => {
    try {
      const versions = configService.listBuildVersions();
      res.json(versions);
    } catch (e) {
      console.error('Error getting build versions:', e);
      res.status(500).json({ error: 'Failed to get build versions' });
    }
  });

  // New API endpoints for build history and logs
  app.get('/api/build-history', (req, res) => {
    try {
      const history = buildService.getBuildHistory();
      res.json(history);
    } catch (e) {
      console.error('Error getting build history:', e);
      res.status(500).json({ error: 'Failed to get build history' });
    }
  });

  app.delete('/api/build-history', (req, res) => {
    try {
      buildService.clearBuildHistory();
      res.json({ success: true, message: 'Build history cleared successfully' });
    } catch (e) {
      console.error('Error clearing build history:', e);
      res.status(500).json({ success: false, error: 'Failed to clear build history' });
    }
  });

  app.get('/api/build-logs/:buildId', (req, res) => {
    try {
      const buildId = String(req.params.buildId);
      const logs = buildService.getBuildLogs(buildId);
      res.type('text/plain').send(logs);
    } catch (e) {
      console.error('Error getting build logs:', e);
      res.status(404).send('Build logs not found');
    }
  });

  // Run script build
  app.post('/api/run-script', async (req, res) => {
    try {
      const { scriptPath, workingDir } = req.body;
      
      if (!scriptPath) {
        return res.status(400).json({ error: 'Script path is required' });
      }
      
      const result = await buildService.runScript(scriptPath, workingDir);

      // Gửi email notify nếu bật
      try {
        const cfg = configService.getConfig();
        const emailCfg = cfg.email || {};
        if (emailService && emailCfg.enableEmailNotify && Array.isArray(emailCfg.notifyEmails) && emailCfg.notifyEmails.length) {
          const statusLabel = result.ok ? 'THÀNH CÔNG' : 'THẤT BẠI';
          const subject = `[CI/CD] Script build ${statusLabel}`;
          const lines = [
            `Script: ${scriptPath}`,
            `Build ID: ${result.buildId}`,
            `Trạng thái: ${statusLabel}`,
            `Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
          ];
          const text = lines.join('\n');
          const html = `<div style="font-family:Arial,sans-serif;line-height:1.6">${lines.map(l => `<div>${l}</div>`).join('')}<hr/><div>CI/CD System</div></div>`;
          await emailService.sendNotificationEmail({ toList: emailCfg.notifyEmails, subject, text, html });
        }
      } catch (_) {}

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = { registerBuildsController };