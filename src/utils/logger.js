/**
 * Logger - SSE (Server-Sent Events) logger cho realtime log streaming
 * Broadcast logs tới tất cả connected clients qua HTTP SSE endpoint
 * @class
 */
class Logger {
  /**
   * Tạo Logger instance
   * @constructor
   */
  constructor() {
    this.clients = new Set();
  }

  /**
   * Đăng ký SSE endpoint vào Express app
   * @param {Object} app - Express app instance
   * @returns {void}
   */
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

  /**
   * Gửi log message tới tất cả connected clients
   * @param {string} text - Log message
   * @returns {void}
   */
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