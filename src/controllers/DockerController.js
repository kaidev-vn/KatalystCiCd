function registerDockerController(app, { dockerService, configService, logger }) {
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