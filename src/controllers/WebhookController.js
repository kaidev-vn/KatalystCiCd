/**
 * Đăng ký Webhook Controller routes
 * @param {Object} app - Express app instance
 * @param {Object} deps - Dependencies
 * @param {Object} deps.logger - Logger instance
 * @param {string} deps.secret - Webhook secret token
 * @param {Object} [deps.webhookService] - WebhookService instance (optional)
 * @returns {void}
 */
function registerWebhookController(app, { logger, secret, webhookService }) {
  /**
   * API Endpoint: Webhook receiver từ GitLab
   * POST /webhook/gitlab
   * Nhận push events từ GitLab và trigger build tự động
   */
  app.post('/webhook/gitlab', async (req, res) => {
    try {
      const gitlabToken = req.headers['x-gitlab-token'] || req.headers['X-Gitlab-Token'];
      const event = req.body;

      logger?.send(`[WEBHOOK][GITLAB] 📬 Nhận webhook event từ GitLab`);

      if (webhookService) {
        // Sử dụng WebhookService mới (recommended)
        const result = await webhookService.handleGitLabPush(event, gitlabToken, secret);
        
        if (result.success) {
          if (result.skipped) {
            return res.status(200).json({ 
              status: 'skipped', 
              reason: result.reason,
              message: 'Event đã được xử lý trước đó'
            });
          }
          
          return res.status(200).json({ 
            status: 'success', 
            triggeredJobs: result.triggeredJobs,
            results: result.results
          });
        } else {
          return res.status(200).json({ 
            status: 'no_action', 
            reason: result.reason 
          });
        }
      } else {
        // Legacy fallback - chỉ verify token
        const hasSecret = !!secret;
        if (hasSecret) {
          if (!gitlabToken || String(gitlabToken) !== String(secret)) {
            return res.status(401).json({ ok: false, error: 'Invalid token' });
          }
        }
        
        logger?.send('[WEBHOOK] Nhận sự kiện webhook (legacy mode)');
        return res.json({ ok: true });
      }
    } catch (e) {
      logger?.send(`[WEBHOOK][ERROR] ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * API Endpoint: Webhook receiver từ GitHub
   * POST /webhook/github
   * Nhận push events từ GitHub và trigger build tự động
   */
  app.post('/webhook/github', async (req, res) => {
    try {
      const githubSignature = req.headers['x-hub-signature-256'];
      const event = req.body;

      logger?.send(`[WEBHOOK][GITHUB] 📬 Nhận webhook event từ GitHub`);

      if (webhookService) {
        const result = await webhookService.handleGitHubPush(event, githubSignature, secret);
        
        if (result.success) {
          if (result.skipped) {
            return res.status(200).json({ 
              status: 'skipped', 
              reason: result.reason,
              message: 'Event đã được xử lý trước đó'
            });
          }
          
          return res.status(200).json({ 
            status: 'success', 
            triggeredJobs: result.triggeredJobs,
            results: result.results
          });
        } else {
          return res.status(200).json({ 
            status: 'no_action', 
            reason: result.reason 
          });
        }
      } else {
        logger?.send('[WEBHOOK][GITHUB] Nhận event (WebhookService chưa được khởi tạo)');
        return res.json({ ok: true, message: 'Event received but not processed' });
      }
    } catch (e) {
      logger?.send(`[WEBHOOK][ERROR] ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * API Endpoint: Lấy webhook stats
   * GET /api/webhook/stats
   */
  app.get('/api/webhook/stats', (req, res) => {
    if (webhookService) {
      const stats = webhookService.getStats();
      res.json({ success: true, stats });
    } else {
      res.json({ success: false, message: 'WebhookService not initialized' });
    }
  });
}

module.exports = { registerWebhookController };