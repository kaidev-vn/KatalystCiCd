import { $, fetchJSON } from './utils.js';

export async function loadSchedulerStatus() {
  const { ok, data } = await fetchJSON('/api/scheduler/status');
  if (ok && data) updateSchedulerUI(data);
}

export function updateSchedulerUI(status) {
  const toggleBtn = $('toggleScheduler');
  const restartBtn = $('restartScheduler');
  const schedulerStatusEl = $('schedulerStatus');
  if (toggleBtn) toggleBtn.textContent = status?.running ? '⏸️ Tạm dừng Scheduler' : '▶️ Tiếp tục Scheduler';
  if (restartBtn) restartBtn.textContent = '🔄 Khởi động lại';
  if (schedulerStatusEl) schedulerStatusEl.textContent = status?.running ? 'Đang chạy' : 'Tạm dừng';
}

export async function toggleScheduler() {
  const { ok } = await fetchJSON('/api/scheduler/toggle', { method: 'POST' });
  if (ok) await loadSchedulerStatus();
}

export async function restartScheduler() {
  const { ok } = await fetchJSON('/api/scheduler/restart', { method: 'POST' });
  if (ok) await loadSchedulerStatus();
}