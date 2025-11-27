import { Injectable } from "@nestjs/common";
import { Response } from "express";

@Injectable()
export class LoggerService {
  private channels = new Map<string, Set<Response>>();
  private globalClients = new Set<Response>();

  // Buffers for batching
  private buffer = new Map<string, string[]>();
  private globalBuffer: string[] = [];

  // Configuration
  private batchSize = 10;
  private batchTimeout = 100;
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private globalBatchTimer: NodeJS.Timeout | null = null;
  private clientLastActivity = new WeakMap<Response, number>();
  private inactivityTimeout = 30000;

  /**
   * Register a global stream client
   */
  registerGlobalClient(res: Response) {
    this._setupSSEConnection(res, this.globalClients);
  }

  /**
   * Register a job specific stream client
   */
  registerJobClient(res: Response, jobId: string) {
    if (!this.channels.has(jobId)) {
      this.channels.set(jobId, new Set());
    }
    this._setupSSEConnection(res, this.channels.get(jobId));
  }

  private _setupSSEConnection(res: Response, clientSet: Set<Response>) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(`data: [SSE] Connected at ${new Date().toISOString()}\n\n`);
    clientSet.add(res);
    this.clientLastActivity.set(res, Date.now());

    res.on("close", () => {
      try {
        res.end();
      } catch (_) {}
      clientSet.delete(res);
      this.clientLastActivity.delete(res);
      // Clean up empty channels
      if (clientSet !== this.globalClients && clientSet.size === 0) {
        const channelId = Array.from(this.channels.entries()).find(
          ([_, set]) => set === clientSet,
        )?.[0];
        if (channelId) {
          this.channels.delete(channelId);
          this.buffer.delete(channelId);
          if (this.batchTimers.has(channelId)) {
            clearTimeout(this.batchTimers.get(channelId));
            this.batchTimers.delete(channelId);
          }
        }
      }
    });
  }

  /**
   * Send message to all connected clients
   */
  send(text: string) {
    this.globalBuffer.push(text);

    if (this.globalBuffer.length >= this.batchSize) {
      this._flushGlobalBuffer();
      return;
    }

    if (!this.globalBatchTimer) {
      this.globalBatchTimer = setTimeout(() => {
        this._flushGlobalBuffer();
      }, this.batchTimeout);
    }

    try {
      console.log(text);
    } catch (_) {}
  }

  /**
   * Send message to specific channel
   */
  sendToChannel(channelId: string, text: string) {
    const messageWithJobId = `[job:${channelId}] ${text}`;
    this.send(messageWithJobId);

    if (this.channels.has(channelId)) {
      if (!this.buffer.has(channelId)) {
        this.buffer.set(channelId, []);
      }
      this.buffer.get(channelId).push(text);

      if (this.buffer.get(channelId).length >= this.batchSize) {
        this._flushChannelBuffer(channelId);
        return;
      }

      if (!this.batchTimers.has(channelId)) {
        this.batchTimers.set(
          channelId,
          setTimeout(() => {
            this._flushChannelBuffer(channelId);
          }, this.batchTimeout),
        );
      }
    }

    try {
      console.log(`[${channelId}] ${text}`);
    } catch (_) {}
  }

  private _sendToClients(text: string, clients: Set<Response>) {
    const data = String(text).replace(/\r?\n/g, " ");
    const now = Date.now();

    for (const client of clients) {
      try {
        const lastActivity = this.clientLastActivity.get(client);
        if (lastActivity && now - lastActivity > this.inactivityTimeout) {
          try {
            client.end();
          } catch (_) {}
          clients.delete(client);
          this.clientLastActivity.delete(client);
          continue;
        }

        client.write(`data: ${data}\n\n`);
        this.clientLastActivity.set(client, now);
      } catch (_) {
        clients.delete(client);
        this.clientLastActivity.delete(client);
      }
    }
  }

  private _flushGlobalBuffer() {
    if (this.globalBuffer.length === 0) {
      this.globalBatchTimer = null;
      return;
    }

    const messages = this.globalBuffer.join("\n");
    this.globalBuffer = [];

    this._sendToClients(messages, this.globalClients);

    if (this.globalBatchTimer) {
      clearTimeout(this.globalBatchTimer);
      this.globalBatchTimer = null;
    }
  }

  private _flushChannelBuffer(channelId: string) {
    if (
      !this.buffer.has(channelId) ||
      this.buffer.get(channelId).length === 0
    ) {
      this.batchTimers.delete(channelId);
      return;
    }

    const messagesWithJobId = this.buffer
      .get(channelId)
      .map((text) => `[job:${channelId}] ${text}`)
      .join("\n");
    this.buffer.set(channelId, []);

    if (this.channels.has(channelId)) {
      this._sendToClients(messagesWithJobId, this.channels.get(channelId));
    }

    if (this.batchTimers.has(channelId)) {
      clearTimeout(this.batchTimers.get(channelId));
      this.batchTimers.delete(channelId);
    }
  }
}
