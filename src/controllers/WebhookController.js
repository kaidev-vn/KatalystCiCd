function registerWebhookController(app, { logger, secret }) {
  app.post('/api/webhook', (req, res) => {
    try {
      const gitlabToken = req.headers['x-gitlab-token'] || req.headers['X-Gitlab-Token'];
      const hasSecret = !!secret;
      if (hasSecret) {
        if (!gitlabToken || String(gitlabToken) !== String(secret)) {
          return res.status(401).json({ ok: false, error: 'Invalid token' });
        }
      }
      logger?.send('[WEBHOOK] Nhận sự kiện webhook');
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerWebhookController };