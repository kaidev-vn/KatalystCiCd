/**
 * Đăng ký Email Controller routes
 * @param {Object} app - Express app instance
 * @param {Object} deps - Dependencies
 * @param {Object} deps.emailService - EmailService instance
 * @param {Object} deps.logger - Logger instance
 * @returns {void}
 */
function registerEmailController(app, { emailService, logger }) {
  /**
   * API Endpoint: Test SMTP connection
   * POST /api/email/test
   * Gửi test email để kiểm tra cấu hình SMTP
   */
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