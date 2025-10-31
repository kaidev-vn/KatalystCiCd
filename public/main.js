function $(id) { return document.getElementById(id); }

// Theme toggle
function applyTheme(theme) {
  const root = document.documentElement;
  const t = theme === 'dark' ? 'dark' : 'light';
  root.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  $('themeToggle').textContent = t === 'dark' ? 'Chế độ sáng' : 'Chế độ tối';
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  applyTheme(saved || 'light');
  $('themeToggle').onclick = () => {
    const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
    applyTheme(next);
  };
}

async function loadConfig() {
  const res = await fetch('/api/config');
  const cfg = await res.json();
  $('provider').value = cfg.provider || 'gitlab';
  $('polling').value = cfg.polling || 30;
  $('account').value = cfg.account || '';
  $('token').value = cfg.token || '';
  $('repoUrl').value = cfg.repoUrl || '';
  $('repoPath').value = cfg.repoPath || '';
  $('branch').value = cfg.branch || 'main';
  $('deployScriptPath').value = cfg.deployScriptPath || '';
  $('buildMethod').value = (cfg.buildMethod || 'dockerfile');
  $('autoCheck').checked = !!cfg.autoCheck;
  // docker
  const d = cfg.docker || {};
  $('dockerfilePath').value = d.dockerfilePath || '';
  $('contextPath').value = d.contextPath || '';
  $('imageName').value = d.imageName || '';
  $('imageTag').value = d.imageTag || 'latest';
  $('autoTagIncrement').checked = !!d.autoTagIncrement;
  $('registryUrl').value = d.registryUrl || '';
  $('registryUsername').value = d.registryUsername || '';
  $('registryPassword').value = d.registryPassword || '';
  $('composePath').value = d.composePath || '';
  $('stackName').value = d.stackName || '';
  $('autoDeploySwarm').checked = !!d.autoDeploySwarm;

  // Hiển thị commit đã build gần nhất (rút gọn 10 ký tự)
  const lb = (cfg.lastBuiltCommit || '').trim();
  const short = lb ? lb.slice(0, 10) : '(chưa có)';
  const el = $('lastBuiltCommit');
  if (el) el.textContent = short;
}

async function saveConfig() {
  const payload = {
    provider: $('provider').value,
    polling: Number($('polling').value || 30),
    account: $('account').value,
    token: $('token').value,
    repoUrl: $('repoUrl').value,
    repoPath: $('repoPath').value,
    branch: $('branch').value || 'main',
    deployScriptPath: $('deployScriptPath').value,
    buildMethod: $('buildMethod').value || 'dockerfile',
    autoCheck: $('autoCheck').checked,
    docker: {
      dockerfilePath: $('dockerfilePath').value,
      contextPath: $('contextPath').value,
      imageName: $('imageName').value,
      imageTag: $('imageTag').value || 'latest',
      autoTagIncrement: $('autoTagIncrement').checked,
      registryUrl: $('registryUrl').value,
      registryUsername: $('registryUsername').value,
      registryPassword: $('registryPassword').value,
      composePath: $('composePath').value,
      stackName: $('stackName').value,
      autoDeploySwarm: $('autoDeploySwarm').checked,
    }
  };
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  $('cfgStatus').textContent = data.ok ? 'Đã lưu cấu hình!' : 'Lưu thất bại';
  setTimeout(() => $('cfgStatus').textContent = '', 2000);
}

async function saveDockerConfig() {
  // Tái sử dụng saveConfig vì docker nằm trong cùng cấu hình
  await saveConfig();
}

async function runDockerBuild() {
  const payload = {
    dockerfilePath: $('dockerfilePath').value,
    contextPath: $('contextPath').value,
    imageName: $('imageName').value,
    imageTag: $('imageTag').value || 'latest',
    registryUrl: $('registryUrl').value,
    registryUsername: $('registryUsername').value,
    registryPassword: $('registryPassword').value,
  };
  appendLog(`[UI] Yêu cầu Docker build & push: ${payload.imageName}:${payload.imageTag}`);
  const res = await fetch('/api/docker/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    appendLog('[UI][ERROR] Không thể gửi yêu cầu Docker build');
  }
}

async function runSwarmDeploy() {
  const payload = {
    composePath: $('composePath').value,
    stackName: $('stackName').value,
  };
  appendLog(`[UI] Yêu cầu Swarm deploy stack: ${payload.stackName}`);
  const res = await fetch('/api/swarm/deploy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    appendLog('[UI][ERROR] Không thể gửi yêu cầu Swarm deploy');
  }
}

async function runCheckPullBuild() {
  const branch = $('branch').value || 'main';
  appendLog(`[UI] Kiểm tra commit mới trên branch ${branch}...`);
  const res = await fetch('/api/git/check-and-build', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch })
  });
  if (!res.ok) {
    appendLog('[UI][ERROR] Không thể thực hiện check/pull/build');
  }
  // Sau khi thực hiện, tải lại cấu hình để cập nhật lastBuiltCommit trên UI
  try { await loadConfig(); } catch (_) {}
}

function appendLog(text) {
  const logs = $('logs');
  const div = document.createElement('div');
  div.textContent = text;
  div.className = 'new';
  logs.appendChild(div);
  logs.scrollTop = logs.scrollHeight;
}

let es = null;
function openLogStream(channelId) {
  if (es) { try { es.close(); } catch (_) {} es = null; }
  const url = channelId ? `/api/logs/stream?channel=${encodeURIComponent(channelId)}` : '/api/logs/stream';
  const connect = () => {
    es = new EventSource(url);
    es.onmessage = (ev) => appendLog(ev.data);
    es.onerror = () => {
      appendLog('[SSE] Lỗi kết nối, sẽ thử lại...');
      try { es.close(); } catch (_) {}
      setTimeout(connect, 2000);
    };
  };
  connect();
}

async function startPull() {
  appendLog('[UI] Yêu cầu bắt đầu pull code...');
  await fetch('/api/pull/start', { method: 'POST' });
}

// Build table
function renderBuilds(list) {
  const tbody = $('buildTable');
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
    delBtn.onclick = async () => {
      await fetch(`/api/builds/${b.id}`, { method: 'DELETE' });
      await loadBuilds();
    };
    const editBtn = document.createElement('button'); editBtn.textContent = '✏️ Sửa'; editBtn.className = 'btn outline';
    editBtn.onclick = () => openEditBuild(b);
    const runBtn = document.createElement('button'); runBtn.textContent = '▶️ Run'; runBtn.className = 'btn';
    runBtn.onclick = async () => {
      appendLog(`[UI] Chạy build: ${b.name}`);
      await fetch(`/api/builds/run/${b.id}`, { method: 'POST' });
    };
    tdAct.appendChild(editBtn);
    tdAct.appendChild(runBtn);
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  }
}

function selectBuild(b) {
  $('logs').innerHTML = '';
  const section = $('logsSection');
  if (section) section.style.display = 'block';
  openLogStream(b.id);
}

async function loadBuilds() {
  const res = await fetch('/api/builds');
  const list = await res.json();
  renderBuilds(list);
}

async function loadVersions() {
  const cfgRes = await fetch('/api/config/versions');
  const cfgList = cfgRes.ok ? await cfgRes.json() : [];
  const buildRes = await fetch('/api/builds/versions');
  const buildList = buildRes.ok ? await buildRes.json() : [];
  const cfgBox = $('configVersions');
  const buildBox = $('buildVersions');
  cfgBox.innerHTML = '';
  buildBox.innerHTML = '';
  const renderItems = (box, list, rollbackFn) => {
    const table = document.createElement('table');
    table.className = 'table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>File</th><th>Hành động</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const it of list) {
      const tr = document.createElement('tr');
      const tdFile = document.createElement('td'); tdFile.textContent = it.file; tr.appendChild(tdFile);
      const tdAct = document.createElement('td');
      const btn = document.createElement('button'); btn.className = 'btn small outline'; btn.textContent = 'Rollback';
      btn.onclick = () => rollbackFn(it.file);
      tdAct.appendChild(btn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    box.appendChild(table);
  };
  renderItems(cfgBox, cfgList, async (file) => {
    if (!confirm(`Rollback config về phiên bản ${file}?`)) return;
    await fetch('/api/config/rollback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) });
    await loadConfig();
    appendLog(`[UI] Đã rollback config về phiên bản ${file}`);
  });
  renderItems(buildBox, buildList, async (_file) => {
    // (Tùy chọn) có thể thêm API rollback cho builds nếu cần.
    alert('Hiện chưa hỗ trợ rollback trực tiếp cho builds. Bạn có thể mở file trong thư mục builds_versions và khôi phục thủ công.');
  });
}

async function addBuild() {
  const name = $('buildName').value.trim() || undefined;
  const envText = $('buildEnv').value.trim();
  let env = {};
  if (envText) {
    try { env = JSON.parse(envText); } catch (e) { alert('ENV không hợp lệ (JSON)'); return; }
  }
  const steps = $('buildSteps').value.split('\n').map(s => s.trim()).filter(Boolean);
  const res = await fetch('/api/builds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, env, steps })
  });
  if (res.ok) {
    $('buildName').value = '';
    $('buildEnv').value = '';
    $('buildSteps').value = '';
  }
  await loadBuilds();
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadConfig();
  loadBuilds();
  loadVersions();
  $('saveCfg').onclick = saveConfig;
  $('checkConnection').onclick = runCheckConnection;
  $('startPull').onclick = startPull;
  $('addBuild').onclick = addBuild;
  $('clearLogs').onclick = () => { $('logs').innerHTML = ''; };
  $('copyLogs').onclick = async () => {
    const lines = Array.from($('logs').children).map(n => n.textContent).join('\n');
    try { await navigator.clipboard.writeText(lines); appendLog('[UI] Đã sao chép log vào clipboard'); } catch {}
  };
  $('saveDockerCfg').onclick = saveDockerConfig;
  $('runDockerBuild').onclick = runDockerBuild;
  $('runSwarmDeploy').onclick = runSwarmDeploy;
  $('checkPullBuild').onclick = runCheckPullBuild;
  // Deploy (deploy.sh)
  const runBtn = $('runDeployScript');
  if (runBtn) runBtn.onclick = runDeploy;
  // Modal events
  $('editCancel').onclick = hideModal;
  $('editCancelTop').onclick = hideModal;
  $('modalBackdrop').onclick = hideModal;
  $('editSave').onclick = saveEditedBuild;
});

// Modal state
let editingBuildId = null;
function showModal() {
  $('modalBackdrop').classList.remove('hidden');
  $('modal').classList.remove('hidden');
}

async function runCheckConnection() {
  appendLog('[UI] Kiểm tra kết nối tới repository...');
  try {
    const res = await fetch('/api/git/check-connection', { method: 'POST' });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: 'Lỗi không xác định' }));
      $('cfgStatus').textContent = `Kết nối thất bại: ${e.error || ''}`;
      appendLog(`[UI][ERROR] Kết nối thất bại: ${e.error || ''}`);
      return;
    }
    const data = await res.json();
    $('cfgStatus').textContent = 'Kết nối thành công!';
    appendLog(`[UI] Kết nối thành công. HEAD hash: ${data?.result?.hash || '(N/A)'}`);
    setTimeout(() => $('cfgStatus').textContent = '', 2500);
  } catch (err) {
    $('cfgStatus').textContent = `Kết nối thất bại: ${err.message}`;
    appendLog(`[UI][ERROR] ${err.message}`);
  }
}
function hideModal() {
  $('modalBackdrop').classList.add('hidden');
  $('modal').classList.add('hidden');
  editingBuildId = null;
}
function openEditBuild(b) {
  editingBuildId = b.id;
  $('editBuildName').value = b.name || '';
  $('editBuildEnv').value = JSON.stringify(b.env || {});
  $('editBuildSteps').value = Array.isArray(b.steps) ? b.steps.join('\n') : '';
  showModal();
}
async function saveEditedBuild() {
  if (!editingBuildId) return hideModal();
  const name = $('editBuildName').value.trim();
  const envText = $('editBuildEnv').value.trim();
  let env = {};
  if (envText) {
    try { env = JSON.parse(envText); } catch (e) { alert('ENV không hợp lệ (JSON)'); return; }
  }
  const steps = $('editBuildSteps').value.split('\n').map(s => s.trim()).filter(Boolean);
  await fetch(`/api/builds/${editingBuildId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, env, steps })
  });
  hideModal();
  await loadBuilds();
}

// Deploy (deploy.sh)
async function runDeploy() {
  const payload = {
    choice: Number(($('deployChoice').value || '').trim() || 0) || undefined,
    imageTag: ($('deployImageTag').value || '').trim() || undefined,
    push: $('deployPush').checked,
    continueBuild: $('deployContinue').checked,
    dockerfilePath: ($('deployDockerfilePath').value || '').trim() || undefined,
    contextPath: ($('deployContextPath').value || '').trim() || undefined,
    repoPath: ($('deployRepoPath').value || '').trim() || undefined,
    configJsonPath: ($('deployConfigJsonPath').value || '').trim() || undefined,
  };
  const dsp = ($('deployScriptPathOverride').value || '').trim();
  if (dsp) payload.deployScriptPath = dsp;
  appendLog(`[UI] Chạy deploy.sh (choice=${payload.choice ?? 'N/A'}, tag=${payload.imageTag ?? 'N/A'})...`);
  const res = await fetch('/api/deploy/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    appendLog('[UI][ERROR] Không thể chạy deploy.sh');
    try { const err = await res.json(); appendLog(`[UI][ERROR] ${err.error || ''}`); } catch {}
  } else {
    appendLog('[UI] Deploy đã được gửi. Theo dõi log ở panel bên trên.');
  }
}