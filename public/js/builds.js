import { $, fetchJSON } from './utils.js';
import { state } from './state.js';
import { appendLog, openLogStream } from './logs.js';
import { updateJobStats } from './jobs.js';

// Build method selector
export function selectBuildMethod(method) {
  document.querySelectorAll('input[name="buildMethod"]').forEach(radio => {
    radio.checked = radio.value === method;
  });
  const scriptConfig = document.getElementById('script-config');
  const dockerConfig = document.getElementById('dockerfile-config');
  const scriptBuildBtn = document.getElementById('runScriptBuild');
  const dockerBuildBtn = document.getElementById('runDockerBuild');
  if (method === 'script') {
    if (scriptConfig) scriptConfig.style.display = 'block';
    if (dockerConfig) dockerConfig.style.display = 'none';
    if (scriptBuildBtn) scriptBuildBtn.style.display = 'block';
    if (dockerBuildBtn) dockerBuildBtn.style.display = 'none';
  } else {
    if (scriptConfig) scriptConfig.style.display = 'none';
    if (dockerConfig) dockerConfig.style.display = 'block';
    if (scriptBuildBtn) scriptBuildBtn.style.display = 'none';
    if (dockerBuildBtn) dockerBuildBtn.style.display = 'block';
  }
}

// Build history
export async function loadBuildHistory() {
  try {
    const { ok, data } = await fetchJSON('/api/build-history');
    if (!ok) return;
    state.buildHistory = Array.isArray(data) ? data : (data?.history || []);
    renderBuildHistory();
    updateJobStats();
  } catch (e) { console.error(e); }
}

export function renderBuildHistory() {
  const tbody = $('buildsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!state.buildHistory.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 8; td.textContent = 'Không có lịch sử';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }
  for (const build of state.buildHistory) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${build.id}</td>
      <td>${new Date(build.timestamp || Date.now()).toLocaleString()}</td>
      <td>${build.commit || '-'}</td>
      <td>${build.branch || '-'}</td>
      <td>${build.method || '-'}</td>
      <td>${build.status || '-'}</td>
      <td>${build.duration || '-'}</td>
      <td>
        <button class="btn small outline" onclick="event.stopPropagation(); viewBuildLogs('${build.id}')">📋 Xem logs</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

export function selectBuildForLogs(buildId) {
  state.selectedBuildId = buildId;
  const titleEl = $('logsTitle');
  if (titleEl) titleEl.textContent = `📋 Logs cho Build #${buildId}`;
}

export async function loadBuildLogs(buildId) {
  try {
    const res = await fetch(`/api/build-history/${encodeURIComponent(buildId)}/logs`);
    const text = await res.text();
    const logsEl = $('logs');
    if (logsEl) logsEl.textContent = '';
    text.split('\n').forEach(line => appendLog(line));
  } catch (e) { appendLog(`[UI][ERROR] ${e.message || e}`); }
}

export function viewBuildLogs(buildId) {
  selectBuildForLogs(buildId);
  loadBuildLogs(buildId);
  openLogStream(buildId);
}

export function clearBuildLogs() {
  const logsEl = $('logs');
  if (logsEl) logsEl.innerHTML = '';
}

export async function downloadBuildLogs(buildId) {
  try {
    const res = await fetch(`/api/build-history/${encodeURIComponent(buildId)}/logs/download`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `build-${buildId}-logs.txt`; a.click();
    URL.revokeObjectURL(url);
  } catch (e) { appendLog(`[UI][ERROR] ${e.message || e}`); }
}

export function filterBuilds() {
  const searchTerm = document.getElementById('buildSearch')?.value?.toLowerCase() || '';
  const statusFilter = document.getElementById('buildStatusFilter')?.value || '';
  const rows = document.querySelectorAll('#buildsTableBody tr');
  rows.forEach(row => {
    if (row.children.length === 1) return;
    const buildId = row.children[0].textContent.toLowerCase();
    const buildStatus = row.children[5].textContent.toLowerCase();
    const matchesSearch = buildId.includes(searchTerm);
    const matchesStatus = !statusFilter || buildStatus.includes(statusFilter);
    row.style.display = matchesSearch && matchesStatus ? '' : 'none';
  });
}

export async function refreshBuildHistory() {
  await loadBuildHistory();
}

export async function clearBuildHistory() {
  try {
    const res = await fetch('/api/build-history', { method: 'DELETE' });
    if (!res.ok) throw new Error('Xóa lịch sử thất bại');
    state.buildHistory = [];
    renderBuildHistory();
    updateJobStats();
  } catch (e) { appendLog(`[UI][ERROR] ${e.message || e}`); }
}

// Build Actions
export async function runDockerBuild() {
  appendLog('[UI] Bắt đầu Build Docker...');
  try {
    const res = await fetch('/api/build/docker', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    appendLog(data?.ok ? '[UI] Build Docker đã bắt đầu.' : `[UI][ERROR] ${data?.error || 'Không rõ lỗi'}`);
    await loadBuildHistory();
  } catch (e) { appendLog(`[UI][ERROR] ${e.message || e}`); }
}

export async function runCheckPullBuild() {
  appendLog('[UI] Chạy Manual Pipeline: Check + Pull + Build...');
  try {
    const res = await fetch('/api/build/manual', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    appendLog(data?.ok ? '[UI] Manual pipeline đã bắt đầu.' : `[UI][ERROR] ${data?.error || 'Không rõ lỗi'}`);
    await loadBuildHistory();
  } catch (e) { appendLog(`[UI][ERROR] ${e.message || e}`); }
}

export async function runScriptBuild() {
  appendLog('[UI] Chạy Script build...');
  try {
    // Allow scriptPath to be set via CURRENT_CFG
    const scriptPath = state.CURRENT_CFG?.script?.path || '';
    const workingDir = state.CURRENT_CFG?.script?.workingDirectory || '';
    const body = JSON.stringify({ scriptPath, workingDirectory: workingDir });
    const res = await fetch('/api/run-script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const data = await res.json().catch(() => ({}));
    appendLog(data?.ok ? '[UI] Script build đã bắt đầu.' : `[UI][ERROR] ${data?.error || 'Không rõ lỗi'}`);
    await loadBuildHistory();
  } catch (e) { appendLog(`[UI][ERROR] ${e.message || e}`); }
}

export async function startPull() {
  appendLog('[UI] Bắt đầu pull code...');
  try {
    const res = await fetch('/api/git/pull', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    appendLog(data?.ok ? '[UI] Pull code thành công.' : `[UI][ERROR] ${data?.error || 'Không rõ lỗi'}`);
  } catch (e) { appendLog(`[UI][ERROR] ${e.message || e}`); }
}

// Build list (modal)
export function renderBuilds(list) {
  const tbody = $('buildTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const b of list) {
    const tr = document.createElement('tr');
    const tdSelect = document.createElement('td');
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'selectedBuild'; radio.value = b.id;
    radio.onchange = () => selectBuild(b);
    tdSelect.appendChild(radio);
    tr.appendChild(tdSelect);
    const tdName = document.createElement('td'); tdName.textContent = b.name; tr.appendChild(tdName);
    const tdSteps = document.createElement('td');
    const stepsCount = Array.isArray(b.steps) ? b.steps.length : 0;
    tdSteps.innerHTML = `<span class="tag">${stepsCount}</span>`;
    tr.appendChild(tdSteps);
    const tdEnv = document.createElement('td'); tdEnv.textContent = JSON.stringify(b.env || {}); tr.appendChild(tdEnv);
    const tdAct = document.createElement('td');
    const delBtn = document.createElement('button'); delBtn.textContent = '🗑 Xóa'; delBtn.className = 'btn secondary';
    delBtn.onclick = async () => { await fetch(`/api/builds/${b.id}`, { method: 'DELETE' }); await loadBuilds(); };
    const editBtn = document.createElement('button'); editBtn.textContent = '✏️ Sửa'; editBtn.className = 'btn outline';
    editBtn.onclick = () => openEditBuild(b);
    const runBtn = document.createElement('button'); runBtn.textContent = '▶️ Run'; runBtn.className = 'btn';
    runBtn.onclick = async () => { appendLog(`[UI] Chạy build: ${b.name}`); await fetch(`/api/builds/run/${b.id}`, { method: 'POST' }); };
    tdAct.appendChild(editBtn); tdAct.appendChild(runBtn); tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  }
}

export function selectBuild(b) {
  state.editingBuildId = b?.id || null;
}

export async function loadBuilds() {
  const { ok, data } = await fetchJSON('/api/builds');
  if (ok) renderBuilds(data || []);
}

export async function loadVersions() {
  const { ok, data } = await fetchJSON('/api/config/versions');
  if (ok) {
    const lastBuiltCommitEl = $('lastBuiltCommit');
    if (lastBuiltCommitEl) lastBuiltCommitEl.textContent = data?.lastBuiltCommit || '(chưa có)';
  }
}

export async function addBuild() {
  showModal();
}

// Edit build modal
export let editingBuildId = null;
export function showModal() {
  const modalBackdrop = $('modalBackdrop');
  const modal = $('modal');
  if (modalBackdrop) modalBackdrop.classList.remove('hidden');
  if (modal) modal.classList.remove('hidden');
}

export function hideModal() {
  const modalBackdrop = $('modalBackdrop');
  const modal = $('modal');
  if (modalBackdrop) modalBackdrop.classList.add('hidden');
  if (modal) modal.classList.add('hidden');
}

export function openEditBuild(b) {
  editingBuildId = b?.id || null;
  $('editBuildName') && ($('editBuildName').value = b?.name || '');
  $('editBuildEnv') && ($('editBuildEnv').value = JSON.stringify(b?.env || {}));
  $('editBuildSteps') && ($('editBuildSteps').value = (b?.steps || []).join('\n'));
  showModal();
}

export async function saveEditedBuild() {
  const name = $('editBuildName')?.value || '';
  let env = {}; try { env = JSON.parse($('editBuildEnv')?.value || '{}'); } catch (_) {}
  const steps = ($('editBuildSteps')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!editingBuildId) return hideModal();
  await fetch(`/api/builds/${editingBuildId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, env, steps }) });
  hideModal();
  await loadBuilds();
}

export async function runCheckConnection() {
  appendLog('[UI] Kiểm tra kết nối tới repository...');
  try {
    const res = await fetch('/api/git/check-connection', { method: 'POST' });
    const cfgStatusEl = $('cfgStatus');
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: 'Lỗi không xác định' }));
      if (cfgStatusEl) cfgStatusEl.textContent = `Kết nối thất bại: ${e.error || ''}`;
      appendLog(`[UI][ERROR] Kết nối thất bại: ${e.error || ''}`);
      return;
    }
    const data = await res.json();
    if (cfgStatusEl) cfgStatusEl.textContent = 'Kết nối thành công!';
    appendLog(`[UI] Kết nối thành công. HEAD hash: ${data?.result?.hash || '(N/A)'}`);
    setTimeout(() => { if (cfgStatusEl) cfgStatusEl.textContent = ''; }, 2500);
  } catch (err) {
    const cfgStatusEl = $('cfgStatus');
    if (cfgStatusEl) cfgStatusEl.textContent = `Kết nối thất bại: ${err.message}`;
    appendLog(`[UI][ERROR] ${err.message}`);
  }
}

// Expose needed functions for inline onclick in generated rows
window.viewBuildLogs = viewBuildLogs;