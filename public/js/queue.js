import { $, fetchJSON } from './utils.js';
import { state } from './state.js';

export async function loadQueueStatus() {
  const { ok, data } = await fetchJSON('/api/queue/status');
  if (!ok) return;
  // Backend trả về: { success, status: { queue, running, completed, failed }, stats }
  state.queueStatus = data.status || data || { queue: [], running: [], completed: [], failed: [] };
  renderQueueStatus();
  renderQueueList();
  renderRunningJobs();
  renderCompletedJobs();
  renderFailedJobs();
  updateQueueStats();
}

export function renderQueueStatus() {
  $('queueLength') && ($('queueLength').textContent = String((state.queueStatus.queue || []).length));
  $('runningJobs') && ($('runningJobs').textContent = String((state.queueStatus.running || []).length));
  $('completedJobs') && ($('completedJobs').textContent = String((state.queueStatus.completed || []).length));
  $('failedJobs') && ($('failedJobs').textContent = String((state.queueStatus.failed || []).length));
  $('avgExecutionTime') && ($('avgExecutionTime').textContent = `${Math.round((state.queueStats.avgExecutionTime || 0))}ms`);
}

export function renderQueueList() {
  const el = $('queueList');
  if (!el) return;
  el.innerHTML = '';
  const list = state.queueStatus.queue || [];
  if (!list.length) { el.innerHTML = '<div class="empty-state">Hàng đợi trống</div>'; return; }
  list.forEach(job => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.innerHTML = `
      <div class="queue-info">
        <span class="name">${job.name}</span>
        <span class="priority tag">${job.priority || 'medium'}</span>
      </div>
      <div class="actions">
        <button class="btn danger small" onclick="cancelQueueJob('${job.id}')">❌ Hủy</button>
      </div>`;
    el.appendChild(div);
  });
}

export function renderRunningJobs() {
  const el = $('runningJobsList');
  if (!el) return;
  el.innerHTML = '';
  const list = state.queueStatus.running || [];
  if (!list.length) { el.innerHTML = '<div class="empty-state">Không có job nào đang chạy</div>'; return; }
  list.forEach(job => {
    const div = document.createElement('div');
    div.className = 'running-job';
    div.innerHTML = `
      <div class="job-info">
        <span class="name">${job.name}</span>
        <span class="status ${job.status}">${job.status}</span>
      </div>
      <div class="actions">
        <button class="btn danger small" onclick="cancelQueueJob('${job.id}')">🛑 Dừng</button>
      </div>`;
    el.appendChild(div);
  });
}

export function renderCompletedJobs() {
  const el = $('completedJobsList');
  if (!el) return;
  el.innerHTML = '';
  const list = state.queueStatus.completed || [];
  if (!list.length) { el.innerHTML = '<div class="empty-state">Chưa có job nào hoàn thành</div>'; return; }
  list.forEach(job => {
    const div = document.createElement('div');
    div.className = 'completed-job';
    div.innerHTML = `
      <div class="job-info">
        <span class="name">${job.name}</span>
        <span class="status success">Thành công</span>
      </div>
      <div class="actions">
        <button class="btn primary small" onclick="retryJob('${job.id}')">🔄 Thử lại</button>
      </div>`;
    el.appendChild(div);
  });
}

export function renderFailedJobs() {
  const el = $('failedJobsList');
  if (!el) return;
  el.innerHTML = '';
  const list = state.queueStatus.failed || [];
  if (!list.length) { el.innerHTML = '<div class="empty-state">Chưa có job nào thất bại</div>'; return; }
  list.forEach(job => {
    const div = document.createElement('div');
    div.className = 'failed-job';
    div.innerHTML = `
      <div class="job-info">
        <span class="name">${job.name}</span>
        <span class="status failed">Thất bại</span>
      </div>
      <div class="actions">
        <button class="btn primary small" onclick="retryJob('${job.id}')">🔄 Thử lại</button>
      </div>`;
    el.appendChild(div);
  });
}

export function updateQueueStats() {
  const completed = state.queueStatus.completed || [];
  const times = completed.map(j => j.duration || 0).filter(n => Number.isFinite(n));
  const avg = times.length ? (times.reduce((a,b) => a+b, 0) / times.length) : 0;
  state.queueStats.avgExecutionTime = avg;
  const el = $('avgExecutionTime'); if (el) el.textContent = `${Math.round(avg)}ms`;
}

export async function addJobToQueue(jobId, priority = 'medium') {
  await fetchJSON('/api/queue/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, priority }) });
  await loadQueueStatus();
}

export async function cancelQueueJob(jobId) {
  await fetchJSON('/api/queue/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) });
  await loadQueueStatus();
}

export async function retryJob(jobId) {
  await fetchJSON('/api/queue/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) });
  await loadQueueStatus();
}

export async function toggleQueueProcessing() {
  const { ok, data } = await fetchJSON('/api/queue/toggle', { method: 'POST' });
  if (ok) {
    state.queueProcessing = !!data?.processing;
    const btn = $('toggleQueueBtn'); if (btn) btn.textContent = state.queueProcessing ? '⏸️ Tạm dừng Queue' : '▶️ Tiếp tục Queue';
    await loadQueueStatus();
  }
}

export async function loadQueueConfig() {
  const { ok, data } = await fetchJSON('/api/queue/stats');
  if (ok && data && data.stats) {
    const maxConcurrentJobs = data.stats.maxConcurrentJobs || 1;
    const resourceThreshold = data.stats.resourceThreshold || 70;
    
    if ($('maxConcurrentJobs')) $('maxConcurrentJobs').value = maxConcurrentJobs;
    if ($('resourceThreshold')) $('resourceThreshold').value = resourceThreshold;
    console.log('Loaded queue config:', data.stats);
    
  }
}

export async function saveQueueConfig() {
  const payload = {
    maxConcurrentJobs: Number($('maxConcurrentJobs')?.value || 1),
    resourceThreshold: Number($('resourceThreshold')?.value || 70),
  };  
  await fetchJSON('/api/queue/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export async function clearQueue() {
  await fetchJSON('/api/queue/clear', { method: 'POST' });
  await loadQueueStatus();
}

export async function runJobImmediate(jobId) {
  await fetchJSON('/api/jobs/run-immediate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) });
  await loadQueueStatus();
}

// Expose needed functions for inline onclick in generated rows
window.cancelQueueJob = cancelQueueJob;
window.retryJob = retryJob;