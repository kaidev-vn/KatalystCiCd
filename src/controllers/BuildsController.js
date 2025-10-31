function registerBuildsController(app, { configService, buildService }) {
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
      res.json({ ok: true, result: r });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerBuildsController };