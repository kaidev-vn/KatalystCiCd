/**
 * Đăng ký Docker Controller routes
 * @param {Object} app - Express app instance
 * @param {Object} deps - Dependencies
 * @param {Object} deps.dockerService - DockerService instance
 * @param {Object} deps.configService - ConfigService instance
 * @param {Object} deps.logger - Logger instance
 * @returns {void}
 */
function registerDockerController(app, { dockerService, configService, logger }) {
  /**
   * API Endpoint: Build Docker image từ config hiện tại
   * POST /api/docker/build
   */
  app.post('/api/docker/build', async (req, res) => {
    try {
      const r = await dockerService.buildAndPush(req.body || {});
      res.json({ ok: true, result: r });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerDockerController };