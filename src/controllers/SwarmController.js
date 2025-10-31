function registerSwarmController(app, { swarmService, configService }) {
  app.post('/api/swarm/deploy', async (req, res) => {
    try {
      const { composePath, stackName } = req.body || {};
      const r = await swarmService.deploy({ composePath, stackName });
      res.json({ ok: true, result: r });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerSwarmController };