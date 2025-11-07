/**
 * Logger - SSE (Server-Sent Events) logger cho realtime log streaming
 * Hỗ trợ multiple channels: mỗi job có log stream riêng
 * @class
 */
class Logger {
  /**
   * Tạo Logger instance
   * @constructor
   */
  constructor() {
    this.channels = new Map(); // Map<channelId, Set<client>>
    this.globalClients = new Set(); // Clients listening to all channels
  }

  /**
   * Đăng ký SSE endpoints vào Express app
   * @param {Object} app - Express app instance
   * @returns {void}
   */
  register(app) {
    // Global log stream (tất cả logs)
    app.get('/api/logs/stream', (req, res) => {
      this._setupSSEConnection(res, this.globalClients);
    });

    // Job-specific log stream
    app.get('/api/logs/stream/:jobId', (req, res) => {
      const jobId = req.params.jobId;
      if (!this.channels.has(jobId)) {
        this.channels.set(jobId, new Set());
      }
      this._setupSSEConnection(res, this.channels.get(jobId));
    });
  }

  /**
   * Thiết lập SSE connection
   * @param {Object} res - Response object
   * @param {Set} clientSet - Client set to add to
   * @private
   */
  _setupSSEConnection(res, clientSet) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: [SSE] Connected at ${new Date().toISOString()}\n\n`);
    
    clientSet.add(res);
    
    res.on('close', () => {
      try { res.end(); } catch (_) {}
      clientSet.delete(res);
      
      // Clean up empty channels
      if (clientSet !== this.globalClients && clientSet.size === 0) {
        const channelId = Array.from(this.channels.entries())
          .find(([_, set]) => set === clientSet)?.[0];
        if (channelId) {
          this.channels.delete(channelId);
        }
      }
    });
  }

  /**
   * Gửi log message tới tất cả connected clients (global)
   * @param {string} text - Log message
   * @returns {void}
   */
  send(text) {
    this._sendToClients(text, this.globalClients);
    // also print to console for local debug
    try { console.log(text); } catch (_) {}
  }

  /**
   * Gửi log message tới channel cụ thể
   * @param {string} channelId - Channel ID (jobId)
   * @param {string} text - Log message
   * @returns {void}
   */
  sendToChannel(channelId, text) {
    this._sendToClients(text, this.globalClients); // Vẫn gửi đến global
    
    if (this.channels.has(channelId)) {
      this._sendToClients(text, this.channels.get(channelId));
    }
    
    // also print to console for local debug
    try { console.log(`[${channelId}] ${text}`); } catch (_) {}
  }

  /**
   * Gửi message tới tập clients cụ thể
   * @param {string} text - Log message
   * @param {Set} clients - Clients set
   * @private
   */
  _sendToClients(text, clients) {
    const data = String(text).replace(/\r?\n/g, ' ');
    for (const client of clients) {
      try { client.write(`data: ${data}\n\n`); } catch (_) {}
    }
  }

  /**
   * Lấy danh sách các channel đang active
   * @returns {Array} Danh sách channel IDs
   */
  getActiveChannels() {
    return Array.from(this.channels.keys());
  }
}

module.exports = { Logger };