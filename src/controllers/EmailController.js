function registerEmailController(app, { emailService, logger }) {
  app.post('/api/email/test', async (req, res) => {
    try {
      const { to, subject, text } = req.body || {};
      const result = await emailService.sendTestEmail({ to, subject, text });
      if (result.ok) return res.json({ ok: true, info: result.info });
      return res.status(400).json({ ok: false, error: result.error || 'Unknown error' });
    } catch (e) {
      logger?.send?.(`[EMAIL] Lỗi API test email: ${e.message}`);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerEmailController };