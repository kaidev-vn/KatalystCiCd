const path = require('path');

function resolveRepoPath(cfg) {
  try {
    const base = String(cfg.contextInitPath || cfg.deployContextCustomPath || '').trim();
    if (base) return path.join(base, 'Katalyst', 'repo');
    // Fallback to legacy config or cwd/repo
    return cfg.repoPath || path.join(process.cwd(), 'repo');
  } catch (_) {
    return cfg.repoPath || path.join(process.cwd(), 'repo');
  }
}

function registerGitController(app, { gitService }) {
  app.post('/api/git/check-connection', async (_req, res) => {
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
      const repoPath = resolveRepoPath(cfg);
      const result = await gitService.checkAndBuild({ repoPath, branch });
      res.json({ ok: true, result });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerGitController };