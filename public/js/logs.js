import { $ } from './utils.js';
import { state } from './state.js';

export function appendLog(text) {
  const logs = $('logs');
  if (!logs) return;
  const div = document.createElement('div');
  div.textContent = text;
  div.className = 'new';
  logs.appendChild(div);
  logs.scrollTop = logs.scrollHeight;
}

export function openLogStream(channelId) {
  if (state.es) { try { state.es.close(); } catch (_) {} state.es = null; }
  const url = channelId ? `/api/logs/stream?channel=${encodeURIComponent(channelId)}` : '/api/logs/stream';
  const connect = () => {
    state.es = new EventSource(url);
    state.es.onmessage = (ev) => appendLog(ev.data);
    state.es.onerror = () => {
      appendLog('[SSE] Lỗi kết nối, sẽ thử lại...');
      try { state.es.close(); } catch (_) {}
      setTimeout(connect, 2000);
    };
  };
  connect();
}