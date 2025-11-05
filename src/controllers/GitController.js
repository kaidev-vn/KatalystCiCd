/**
 * Đăng ký Git Controller routes
 * @param {Object} app - Express app instance
 * @param {Object} deps - Dependencies
 * @param {Object} deps.gitService - GitService instance
 * @returns {void}
 */
function registerGitController(app, { gitService }) {
  /**
   * API Endpoint: Test Git connection
   * POST /api/git/test
   * Kiểm tra kết nối tới Git repository
   */
  app.post('/api/git/test', async (req, res) => {
    try {
      const result = await gitService.checkConnection();
      res.json({ ok: true, result });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
  app.post('/api/git/check-and-build', async (req, res) => {
    try {
      const branch = String(req.body?.branch || 'main');
      const cfg = gitService.configService.getConfig();
      const repoPath = cfg.repoPath || '';
      const result = await gitService.checkAndBuild({ repoPath, branch });
      res.json({ ok: true, result });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerGitController };