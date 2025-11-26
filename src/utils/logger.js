/**
 * Logger - SSE (Server-Sent Events) logger cho realtime log streaming
<<<<<<< HEAD
 * Hỗ trợ multiple channels: mỗi job có log stream riêng
=======
 * Broadcast logs tới tất cả connected clients qua HTTP SSE endpoint
>>>>>>> a189f18cc311807f434b036cdb8e0cc846930226
 * Với cơ chế batching và rate limiting để tránh overload client
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
    
    // Buffer để nhóm log messages trước khi gửi
    this.buffer = new Map(); // Map<channelId, Array<message>>
    this.globalBuffer = []; // Buffer cho global messages
    
    // Cấu hình batching và rate limiting
    this.batchSize = 10; // Số message tối đa trong một batch
    this.batchTimeout = 100; // Thời gian delay trước khi gửi batch (ms)
    this.batchTimers = new Map(); // Map<channelId, timer>
    this.globalBatchTimer = null;
    
    // Theo dõi clients hoạt động
    this.clientLastActivity = new WeakMap(); // WeakMap<client, timestamp>
    this.inactivityTimeout = 30000; // 30 seconds không hoạt động
  }

  /**
<<<<<<< HEAD
   * Đăng ký SSE endpoints vào Express app
=======
   * Đăng ký SSE endpoint vào Express app
>>>>>>> a189f18cc311807f434b036cdb8e0cc846930226
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
    this.clientLastActivity.set(res, Date.now());
    
    res.on('close', () => {
      try { res.end(); } catch (_) {}
      clientSet.delete(res);
      this.clientLastActivity.delete(res);
      
      // Clean up empty channels
      if (clientSet !== this.globalClients && clientSet.size === 0) {
        const channelId = Array.from(this.channels.entries())
          .find(([_, set]) => set === clientSet)?.[0];
        if (channelId) {
          this.channels.delete(channelId);
          // Clean up buffer và timer cho channel này
          this.buffer.delete(channelId);
          this.batchTimers.delete(channelId);
        }
      }
    });
  }

  /**
   * Gửi log message tới tất cả connected clients (global)
   * Với cơ chế batching để tránh overload client
   * @param {string} text - Log message
   * @returns {void}
   */
  send(text) {
    // Thêm vào global buffer
    this.globalBuffer.push(text);
    
    // Nếu buffer đạt kích thước batch, gửi ngay lập tức
    if (this.globalBuffer.length >= this.batchSize) {
      this._flushGlobalBuffer();
      return;
    }
    
    // Nếu chưa có timer, thiết lập timer để gửi batch sau khoảng thời gian delay
    if (!this.globalBatchTimer) {
      this.globalBatchTimer = setTimeout(() => {
        this._flushGlobalBuffer();
      }, this.batchTimeout);
    }
    
    // also print to console for local debug
    try { console.log(text); } catch (_) {}
  }

  /**
   * Gửi log message tới channel cụ thể
   * Với cơ chế batching để tránh overload client
   * @param {string} channelId - Channel ID (jobId)
   * @param {string} text - Log message
   * @returns {void}
   */
  sendToChannel(channelId, text) {
    // Gửi đến global (với batching) - thêm jobId vào message để client có thể filter
    const messageWithJobId = `[job:${channelId}] ${text}`;
    this.send(messageWithJobId);
    
    // Xử lý channel cụ thể với batching
    if (this.channels.has(channelId)) {
      // Thêm vào channel buffer
      if (!this.buffer.has(channelId)) {
        this.buffer.set(channelId, []);
      }
      this.buffer.get(channelId).push(text);
      
      // Nếu buffer đạt kích thước batch, gửi ngay lập tức
      if (this.buffer.get(channelId).length >= this.batchSize) {
        this._flushChannelBuffer(channelId);
        return;
      }
      
      // Nếu chưa có timer, thiết lập timer để gửi batch sau khoảng thời gian delay
      if (!this.batchTimers.has(channelId)) {
        this.batchTimers.set(channelId, setTimeout(() => {
          this._flushChannelBuffer(channelId);
        }, this.batchTimeout));
      }
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
    const now = Date.now();
    
    for (const client of clients) {
      try {
        // Kiểm tra client có còn hoạt động không
        const lastActivity = this.clientLastActivity.get(client);
        if (lastActivity && (now - lastActivity) > this.inactivityTimeout) {
          // Client không hoạt động, đóng connection
          try { client.end(); } catch (_) {}
          clients.delete(client);
          this.clientLastActivity.delete(client);
          continue;
        }
        
        client.write(`data: ${data}\n\n`);
        this.clientLastActivity.set(client, now);
      } catch (_) {
        // Nếu có lỗi khi gửi, xóa client khỏi danh sách
        clients.delete(client);
        this.clientLastActivity.delete(client);
      }
    }
  }

  /**
   * Flush global buffer - gửi tất cả messages trong global buffer
   * @private
   */
  _flushGlobalBuffer() {
    if (this.globalBuffer.length === 0) {
      this.globalBatchTimer = null;
      return;
    }
    
    const messages = this.globalBuffer.join('\n');
    this.globalBuffer = [];
    
    // Gửi messages dưới dạng batch
    this._sendToClients(messages, this.globalClients);
    
    // Clear timer
    if (this.globalBatchTimer) {
      clearTimeout(this.globalBatchTimer);
      this.globalBatchTimer = null;
    }
  }
  
  /**
   * Flush channel buffer - gửi tất cả messages trong channel buffer
   * @param {string} channelId - Channel ID
   * @private
   */
  _flushChannelBuffer(channelId) {
    if (!this.buffer.has(channelId) || this.buffer.get(channelId).length === 0) {
      this.batchTimers.delete(channelId);
      return;
    }
    
    // Thêm jobId vào từng message trong batch
    const messagesWithJobId = this.buffer.get(channelId)
      .map(text => `[job:${channelId}] ${text}`)
      .join('\n');
    this.buffer.set(channelId, []);
    
    // Gửi messages dưới dạng batch
    if (this.channels.has(channelId)) {
      this._sendToClients(messagesWithJobId, this.channels.get(channelId));
    }
    
    // Clear timer
    if (this.batchTimers.has(channelId)) {
      clearTimeout(this.batchTimers.get(channelId));
      this.batchTimers.delete(channelId);
    }
  }
  
  /**
   * Lấy danh sách các channel đang active
   * @returns {Array} Danh sách channel IDs
   */
  getActiveChannels() {
    return Array.from(this.channels.keys());
  }
  
  /**
   * Cấu hình batch size và timeout
   * @param {number} batchSize - Số message tối đa trong batch
   * @param {number} batchTimeout - Thời gian delay trước khi gửi batch (ms)
   */
  setBatchConfig(batchSize, batchTimeout) {
    this.batchSize = Math.max(1, batchSize);
    this.batchTimeout = Math.max(10, batchTimeout);
  }
}

module.exports = { Logger };