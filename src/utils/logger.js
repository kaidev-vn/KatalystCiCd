class Logger {
  constructor() {
    this.clients = new Set();
  }

  register(app) {
    app.get('/api/logs/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(`data: [SSE] Connected at ${new Date().toISOString()}\n\n`);
      this.clients.add(res);
      req.on('close', () => {
        try { res.end(); } catch (_) {}
        this.clients.delete(res);
      });
    });
  }

  send(text) {
    const data = String(text).replace(/\r?\n/g, ' ');
    for (const client of this.clients) {
      try { client.write(`data: ${data}\n\n`); } catch (_) {}
    }
    // also print to console for local debug
    try { console.log(text); } catch (_) {}
  }
}

module.exports = { Logger };