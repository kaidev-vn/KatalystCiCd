function $(id) { return document.getElementById(id); }
let CURRENT_CFG = null;

// Tab Management
function switchTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Remove active class from all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab content
  const targetContent = document.getElementById(tabId);
  if (targetContent) {
    targetContent.classList.add('active');
  }
  
  // Add active class to clicked tab button
  const targetBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if (targetBtn) {
    targetBtn.classList.add('active');
  }
  
  // Store active tab in localStorage
  localStorage.setItem('activeTab', tabId);
  
  // Load data for specific tabs
  if (tabId === 'builds-tab') {
    loadBuilds();
    loadBuildHistory();
  }
}

// Build Method Selection
function selectBuildMethod(method) {
  // Update radio button
  document.querySelectorAll('input[name="buildMethod"]').forEach(radio => {
    radio.checked = radio.value === method;
  });
  
  // Show/hide configuration sections
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

// Build History Management
let buildHistory = [];
let selectedBuildId = null;

async function loadBuildHistory() {
  try {
    const response = await fetch('/api/build-history');
    buildHistory = await response.json();
    renderBuildHistory();
  } catch (error) {
    console.error('Error loading build history:', error);
    buildHistory = [];
    renderBuildHistory();
  }
}

function renderBuildHistory() {
  const tbody = document.querySelector('#buildsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (buildHistory.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--muted); padding: 20px;">
          Chưa có lịch sử build nào
        </td>
      </tr>
    `;
    return;
  }
  
  buildHistory.forEach(build => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    row.onclick = () => selectBuildForLogs(build.id);
    
    const statusClass = build.status === 'success' ? 'success' : 
                       build.status === 'failed' ? 'failed' : 'running';
    
    // Format theo đúng cấu trúc table trong HTML
    row.innerHTML = `
      <td>${build.id}</td>
      <td>${new Date(build.startTime).toLocaleString('vi-VN')}</td>
      <td>${build.commit || '-'}</td>
      <td>${build.branch || '-'}</td>
      <td>${build.method || 'dockerfile'}</td>
      <td><span class="status-badge ${statusClass}">${build.status}</span></td>
      <td>${build.duration || '-'}</td>
      <td>
        <button class="btn small outline" onclick="event.stopPropagation(); viewBuildLogs('${build.id}')">📋 Xem logs</button>
      </td>
    `;
    
    tbody.appendChild(row);
  });
}

function selectBuildForLogs(buildId) {
  selectedBuildId = buildId;
  
  // Highlight selected row
  document.querySelectorAll('#buildsTableBody tr').forEach(row => {
    row.classList.remove('selected');
  });
  
  const selectedRow = document.querySelector(`#buildsTableBody tr[onclick*="${buildId}"]`);
  if (selectedRow) {
    selectedRow.classList.add('selected');
  }
  
  // Load logs for selected build
  loadBuildLogs(buildId);
}

async function loadBuildLogs(buildId) {
  const logContainer = document.getElementById('logs');
  if (!logContainer) return;
  
  try {
    const response = await fetch(`/api/build-logs/${buildId}`);
    const logs = await response.text();
    
    // Clear current logs and show build-specific logs
    logContainer.innerHTML = '';
    
    // Split logs into lines and format them
    const logLines = logs.split('\n').filter(line => line.trim());
    logLines.forEach(line => {
      const logDiv = document.createElement('div');
      logDiv.className = 'log-line';
      logDiv.textContent = line;
      logContainer.appendChild(logDiv);
    });
    
    // Update logs title
    const logsTitle = document.getElementById('logsTitle');
    if (logsTitle) {
      logsTitle.textContent = `📋 Build Logs - ID: ${buildId}`;
    }
    
    // Scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
    
  } catch (error) {
    console.error('Error loading build logs:', error);
    appendLog(`[ERROR] Không thể tải logs cho build ${buildId}: ${error.message}`);
  }
}

// Alias for button onclick
function viewBuildLogs(buildId) {
  loadBuildLogs(buildId);
}

function clearBuildLogs() {
  const logContainer = document.getElementById('buildLogOutput');
  if (logContainer) {
    logContainer.innerHTML = '<pre class="log-content">Logs đã được xóa</pre>';
  }
}

function downloadBuildLogs(buildId) {
  const logContent = document.querySelector('#buildLogOutput .log-content');
  if (!logContent) return;
  
  const blob = new Blob([logContent.textContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `build-logs-${buildId}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Filter builds
function filterBuilds() {
  const searchTerm = document.getElementById('buildSearch').value.toLowerCase();
  const statusFilter = document.getElementById('buildStatusFilter').value;
  
  const rows = document.querySelectorAll('#buildsTableBody tr');
  
  rows.forEach(row => {
    if (row.children.length === 1) return; // Skip "no data" row
    
    const buildId = row.children[0].textContent.toLowerCase();
    const buildStatus = row.children[5].textContent.toLowerCase();
    
    const matchesSearch = buildId.includes(searchTerm);
    const matchesStatus = !statusFilter || buildStatus.includes(statusFilter);
    
    row.style.display = matchesSearch && matchesStatus ? '' : 'none';
  });
}

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
  CURRENT_CFG = cfg;
  
  // Add null checks for all DOM elements
  const providerEl = $('provider');
  if (providerEl) providerEl.value = cfg.provider || 'gitlab';
  
  const pollingEl = $('polling');
  if (pollingEl) pollingEl.value = cfg.polling || 30;
  
  const accountEl = $('account');
  if (accountEl) accountEl.value = cfg.account || '';
  
  const tokenEl = $('token');
  if (tokenEl) tokenEl.value = cfg.token || '';
  
  const repoUrlEl = $('repoUrl');
  if (repoUrlEl) repoUrlEl.value = cfg.repoUrl || '';
  
  const repoPathEl = $('repoPath');
  if (repoPathEl) repoPathEl.value = cfg.repoPath || '';
  
  const branchEl = $('branch');
  if (branchEl) branchEl.value = cfg.branch || 'main';
  
  const deployScriptPathEl = $('deployScriptPath');
  if (deployScriptPathEl) deployScriptPathEl.value = cfg.deployScriptPath || '';
  
  // Set radio button for build method
  const buildMethod = cfg.buildMethod || 'dockerfile';
  const buildMethodRadio = document.querySelector(`input[name="buildMethod"][value="${buildMethod}"]`);
  if (buildMethodRadio) {
    buildMethodRadio.checked = true;
    // Trigger the selectBuildMethod function to show correct config section
    selectBuildMethod(buildMethod);
  }
  
  // docker
  const d = cfg.docker || {};
  const dockerfilePathEl = $('dockerfilePath');
  if (dockerfilePathEl) dockerfilePathEl.value = d.dockerfilePath || '';
  
  const contextPathEl = $('contextPath');
  if (contextPathEl) contextPathEl.value = d.contextPath || '';
  
  const imageNameEl = $('imageName');
  if (imageNameEl) imageNameEl.value = d.imageName || '';
  
  // Load split tag configuration for Docker
  const imageTagNumberEl = $('imageTagNumber');
  const imageTagTextEl = $('imageTagText');
  if (d.imageTag) {
    // Tách tag hiện tại thành 2 phần
    const parts = splitTag(d.imageTag);
    if (imageTagNumberEl) imageTagNumberEl.value = parts.number || '1.0.75';
    if (imageTagTextEl) imageTagTextEl.value = parts.text || '';
  } else {
    if (imageTagNumberEl) imageTagNumberEl.value = '1.0.75';
    if (imageTagTextEl) imageTagTextEl.value = '';
  }
  
  const autoTagIncrementEl = $('autoTagIncrement');
  if (autoTagIncrementEl) {
    autoTagIncrementEl.checked = !!d.autoTagIncrement;
  }
  
  // Update preview
  updateTagPreview();
  
  const registryUrlEl = $('registryUrl');
  if (registryUrlEl) registryUrlEl.value = d.registryUrl || '';
  
  const registryUsernameEl = $('registryUsername');
  if (registryUsernameEl) registryUsernameEl.value = d.registryUsername || '';
  
  const registryPasswordEl = $('registryPassword');
  if (registryPasswordEl) registryPasswordEl.value = d.registryPassword || '';

  // Load script build tag configuration
  // Load split tag configuration for Script
  const scriptImageTagNumberEl = $('scriptImageTagNumber');
  const scriptImageTagTextEl = $('scriptImageTagText');
  if (d.scriptImageTag) {
    // Tách tag hiện tại thành 2 phần
    const parts = splitTag(d.scriptImageTag);
    if (scriptImageTagNumberEl) scriptImageTagNumberEl.value = parts.number || '1.0.75';
    if (scriptImageTagTextEl) scriptImageTagTextEl.value = parts.text || '';
  } else {
    if (scriptImageTagNumberEl) scriptImageTagNumberEl.value = '1.0.75';
    if (scriptImageTagTextEl) scriptImageTagTextEl.value = '';
  }
  
  const scriptAutoTagIncrementEl = $('scriptAutoTagIncrement');
  if (scriptAutoTagIncrementEl) {
    scriptAutoTagIncrementEl.checked = !!(d.scriptAutoTagIncrement);
  }
  
  // Update script preview
  updateScriptTagPreview();

  // Hiển thị commit đã build gần nhất (rút gọn 10 ký tự)
  const lb = (cfg.lastBuiltCommit || '').trim();
  const short = lb ? lb.slice(0, 10) : '(chưa có)';
  const el = $('lastBuiltCommit');
  if (el) el.textContent = short;
  // Cập nhật hiển thị Context hiệu lực cho deploy.sh
  updateEffectiveContextInfo();
}

// Tải danh sách CHOICE từ deploy.sh và populate vào các select
function populateDeployChoices(choices) {
  const multiSel = $('deployChoicesMulti');
  const opts = Array.isArray(choices) ? choices : [];
  const buildOptions = (sel) => {
    if (!sel) return;
    sel.innerHTML = '';
    if (!opts.length) {
      const op = document.createElement('option'); op.value = ''; op.textContent = '(Không tìm thấy lựa chọn trong deploy.sh)'; op.disabled = true; op.selected = true; sel.appendChild(op);
      return;
    }
    for (const c of opts) {
      const op = document.createElement('option');
      op.value = String(c.value);
      op.textContent = `${c.value}) ${c.label}`;
      sel.appendChild(op);
    }
  };
  buildOptions(multiSel);
  // Áp dụng các giá trị đã lưu (nếu đã có pendingValues)
  if (multiSel && multiSel.dataset && multiSel.dataset.pendingValues) {
    try {
      const arr = JSON.parse(multiSel.dataset.pendingValues || '[]');
      for (const opt of Array.from(multiSel.options)) {
        opt.selected = arr.includes(String(opt.value));
      }
    } catch(_) {}
    delete multiSel.dataset.pendingValues;
  }
}

async function loadDeployChoices(pathOverride) {
  try {
    const dsp = typeof pathOverride === 'string' && pathOverride.trim() ? pathOverride.trim() : (($('deployScriptPath').value || '').trim());
    let url = '/api/deploy/choices';
    if (dsp) url += `?deployScriptPath=${encodeURIComponent(dsp)}`;
    const res = await fetch(url);
    if (!res.ok) { populateDeployChoices([]); return; }
    const data = await res.json();
    populateDeployChoices(data.choices || []);
  } catch (_) {
    populateDeployChoices([]);
  }
}

async function saveConfig() {
  const payload = {
    provider: $('provider')?.value || '',
    polling: Number($('polling')?.value || 30),
    account: $('account')?.value || '',
    token: $('token')?.value || '',
    repoUrl: $('repoUrl')?.value || '',
    repoPath: $('repoPath')?.value || '',
    branch: $('branch')?.value || 'main',
    deployScriptPath: $('deployScriptPath')?.value || '',
    buildMethod: document.querySelector('input[name="buildMethod"]:checked')?.value || 'dockerfile',
    // Simplified - no more complex deploy choices
    deployChoices: [],
    deployChoice: 0,
    deployContextSource: 'repo',
    deployContextCustomPath: '',
    docker: {
      dockerfilePath: $('dockerfilePath')?.value || '',
      contextPath: $('contextPath')?.value || '',
      imageName: $('imageName')?.value || '',
      imageTag: combineTag($('imageTagNumber')?.value || '1.0.75', $('imageTagText')?.value || ''),
      autoTagIncrement: $('autoTagIncrement')?.checked || false,
      registryUrl: $('registryUrl')?.value || '',
      registryUsername: $('registryUsername')?.value || '',
      registryPassword: $('registryPassword')?.value || '',
    },
    // Script build tag configuration
    scriptImageTag: combineTag($('scriptImageTagNumber')?.value || '1.0.75', $('scriptImageTagText')?.value || ''),
    scriptAutoTagIncrement: $('scriptAutoTagIncrement')?.checked || false,
  };
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  const cfgStatusEl = $('cfgStatus');
  if (cfgStatusEl) {
    cfgStatusEl.textContent = data.ok ? 'Đã lưu cấu hình!' : 'Lưu thất bại';
    setTimeout(() => cfgStatusEl.textContent = '', 2000);
  }
}

function updateEffectiveContextInfo() {
  try {
    const cfg = CURRENT_CFG || {};
    const d = cfg.docker || {};
    const src = ($('deployContextSource')?.value || String(cfg.deployContextSource || 'repo'));
    let effectiveContext = cfg.repoPath || '';
    if (src === 'config') effectiveContext = d.contextPath || cfg.repoPath || '';
    else if (src === 'custom') effectiveContext = ($('deployContextCustomPath')?.value || cfg.deployContextCustomPath || '') || d.contextPath || cfg.repoPath || '';
    const ecEl = $('effectiveContextInfo');
    if (ecEl) ecEl.textContent = effectiveContext || '(chưa có)';
  } catch (_) {}
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

async function runScriptBuild() {
  const config = CURRENT_CFG;
  if (!config) {
    appendLog('[UI] Lỗi: Chưa có cấu hình');
    return;
  }

  if (config.buildMethod !== 'script') {
    appendLog('[UI] Lỗi: Build method phải là "script"');
    return;
  }

  if (!config.deployScriptPath) {
    appendLog('[UI] Lỗi: Chưa cấu hình đường dẫn script');
    return;
  }

  try {
    appendLog('[UI] Đang chạy script build...');
    
    const response = await fetch('/api/run-script', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scriptPath: config.deployScriptPath,
        workingDir: config.repoPath
      })
    });

    const result = await response.json();
    
    if (result.ok) {
      appendLog(`[UI] Script build hoàn tất thành công (Build ID: ${result.buildId})`);
      // Reload build history to show the new build
      await loadBuildHistory();
    } else {
      appendLog(`[UI] Script build thất bại: ${result.error || 'Không rõ'}`);
    }
  } catch (error) {
    appendLog(`[UI] Lỗi khi chạy script build: ${error.message}`);
  }
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
  if (!tbody) return; // Add null check
  
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
  const logsEl = $('logs');
  if (logsEl) logsEl.innerHTML = ''; // Add null check
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
  
  // Add null checks
  if (cfgBox) cfgBox.innerHTML = '';
  if (buildBox) buildBox.innerHTML = '';
  
  const renderItems = (box, list, rollbackFn) => {
    if (!box) return; // Add null check for box parameter
    
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
  
  // Initialize tab event listeners
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) {
        switchTab(tabId);
      }
    });
  });
  
  // Initialize tabs
  const savedTab = localStorage.getItem('activeTab') || 'config-tab';
  switchTab(savedTab);
  
  // Initialize build method selection
  const savedMethod = localStorage.getItem('buildMethod') || 'dockerfile';
  selectBuildMethod(savedMethod);
  
  loadDeployChoices().then(() => loadConfig()).catch(() => loadConfig());
  loadBuilds();
  loadVersions();
  loadBuildHistory();
  
  // Add event listener for auto tag increment checkbox
  const autoTagIncrementEl = $('autoTagIncrement');
  if (autoTagIncrementEl) {
    autoTagIncrementEl.addEventListener('change', (e) => {
      toggleAdvancedTaggingSection(e.target.checked);
    });
  }
  
  // Add event listener for script auto tag increment checkbox
  const scriptAutoTagIncrementEl = $('scriptAutoTagIncrement');
  if (scriptAutoTagIncrementEl) {
    scriptAutoTagIncrementEl.addEventListener('change', (e) => {
      toggleScriptAdvancedTaggingSection(e.target.checked);
    });
  }
  
  // Add null checks for all button event handlers
  const saveCfgBtn = $('saveCfg');
  const checkConnectionBtn = $('checkConnection');
  const startPullBtn = $('startPull');
  const addBuildBtn = $('addBuild');
  const clearLogsBtn = $('clearLogs');
  const copyLogsBtn = $('copyLogs');
  
  if (saveCfgBtn) saveCfgBtn.onclick = saveConfig;
  
  // Add event listener for saveAllConfig button
  const saveAllConfigBtn = $('saveAllConfig');
  if (saveAllConfigBtn) saveAllConfigBtn.onclick = saveConfig;
  if (checkConnectionBtn) checkConnectionBtn.onclick = runCheckConnection;
  if (startPullBtn) startPullBtn.onclick = startPull;
  if (addBuildBtn) addBuildBtn.onclick = addBuild;
  if (clearLogsBtn) clearLogsBtn.onclick = () => { 
    const logsEl = $('logs');
    if (logsEl) logsEl.innerHTML = ''; 
  };
  if (copyLogsBtn) copyLogsBtn.onclick = async () => {
    const logsEl = $('logs');
    if (logsEl) {
      const lines = Array.from(logsEl.children).map(n => n.textContent).join('\n');
      try { await navigator.clipboard.writeText(lines); appendLog('[UI] Đã sao chép log vào clipboard'); } catch {}
    }
  };
  
  // Add null checks for button event handlers
  const saveDockerCfgBtn = $('saveDockerCfg');
  const runDockerBuildBtn = $('runDockerBuild');
  const runScriptBuildBtn = $('runScriptBuild');
  const checkPullBuildBtn = $('checkPullBuild');
  
  if (saveDockerCfgBtn) saveDockerCfgBtn.onclick = saveDockerConfig;
  if (runDockerBuildBtn) runDockerBuildBtn.onclick = runDockerBuild;
  if (runScriptBuildBtn) runScriptBuildBtn.onclick = runScriptBuild;
  if (checkPullBuildBtn) checkPullBuildBtn.onclick = runCheckPullBuild;
  
  // Modal events
  const editCancelBtn = $('editCancel');
  const editCancelTopBtn = $('editCancelTop');
  const modalBackdropEl = $('modalBackdrop');
  const editSaveBtn = $('editSave');
  
  if (editCancelBtn) editCancelBtn.onclick = hideModal;
  if (editCancelTopBtn) editCancelTopBtn.onclick = hideModal;
  if (modalBackdropEl) modalBackdropEl.onclick = hideModal;
  if (editSaveBtn) editSaveBtn.onclick = saveEditedBuild;
  
  // Build method change handlers
  document.querySelectorAll('input[name="buildMethod"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      selectBuildMethod(e.target.value);
      localStorage.setItem('buildMethod', e.target.value);
    });
  });
  
  // Build management buttons
  const buildSearch = document.getElementById('buildSearch');
  const statusFilter = document.getElementById('statusFilter');
  const refreshBuildsBtn = $('refreshBuilds');
  const clearBuildHistoryBtn = $('clearBuildHistory');
  
  if (buildSearch) buildSearch.addEventListener('input', filterBuilds);
  if (statusFilter) statusFilter.addEventListener('change', filterBuilds);
  if (refreshBuildsBtn) refreshBuildsBtn.onclick = refreshBuildHistory;
  if (clearBuildHistoryBtn) clearBuildHistoryBtn.onclick = clearBuildHistory;
  
  // Scheduler event handlers
  const toggleSchedulerBtn = $('toggleScheduler');
  const restartSchedulerBtn = $('restartScheduler');
  
  if (toggleSchedulerBtn) toggleSchedulerBtn.onclick = toggleScheduler;
  if (restartSchedulerBtn) restartSchedulerBtn.onclick = restartScheduler;
  
  // Load scheduler status on page load
  loadSchedulerStatus();
  
  // Refresh scheduler status every 10 seconds
  setInterval(loadSchedulerStatus, 10000);
  
  // Initialize general log stream for realtime logs
  openLogStream();
  
  // Add event listeners for tag input fields
  const imageTagNumberEl = $('imageTagNumber');
  const imageTagTextEl = $('imageTagText');
  const scriptImageTagNumberEl = $('scriptImageTagNumber');
  const scriptImageTagTextEl = $('scriptImageTagText');
  
  if (imageTagNumberEl) imageTagNumberEl.addEventListener('input', updateTagPreview);
  if (imageTagTextEl) imageTagTextEl.addEventListener('input', updateTagPreview);
  if (scriptImageTagNumberEl) scriptImageTagNumberEl.addEventListener('input', updateScriptTagPreview);
  if (scriptImageTagTextEl) scriptImageTagTextEl.addEventListener('input', updateScriptTagPreview);
});

// Modal state
let editingBuildId = null;
function showModal() {
  const modalBackdrop = $('modalBackdrop');
  const modal = $('modal');
  if (modalBackdrop) modalBackdrop.classList.remove('hidden');
  if (modal) modal.classList.remove('hidden');
}

async function runCheckConnection() {
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
    setTimeout(() => {
      if (cfgStatusEl) cfgStatusEl.textContent = '';
    }, 2500);
  } catch (err) {
    const cfgStatusEl = $('cfgStatus');
    if (cfgStatusEl) cfgStatusEl.textContent = `Kết nối thất bại: ${err.message}`;
    appendLog(`[UI][ERROR] ${err.message}`);
  }
}
function hideModal() {
  const modalBackdrop = $('modalBackdrop');
  const modal = $('modal');
  if (modalBackdrop) modalBackdrop.classList.add('hidden');
  if (modal) modal.classList.add('hidden');
  editingBuildId = null;
}
function openEditBuild(b) {
  editingBuildId = b.id;
  const editBuildNameEl = $('editBuildName');
  const editBuildEnvEl = $('editBuildEnv');
  const editBuildStepsEl = $('editBuildSteps');
  
  if (editBuildNameEl) editBuildNameEl.value = b.name || '';
  if (editBuildEnvEl) editBuildEnvEl.value = JSON.stringify(b.env || {});
  if (editBuildStepsEl) editBuildStepsEl.value = Array.isArray(b.steps) ? b.steps.join('\n') : '';
  showModal();
}
async function saveEditedBuild() {
  if (!editingBuildId) return hideModal();
  
  const editBuildNameEl = $('editBuildName');
  const editBuildEnvEl = $('editBuildEnv');
  const editBuildStepsEl = $('editBuildSteps');
  
  if (!editBuildNameEl || !editBuildEnvEl || !editBuildStepsEl) {
    alert('Không tìm thấy các trường cần thiết');
    return;
  }
  
  const name = editBuildNameEl.value.trim();
  const envText = editBuildEnvEl.value.trim();
  let env = {};
  if (envText) {
    try { env = JSON.parse(envText); } catch (e) { alert('ENV không hợp lệ (JSON)'); return; }
  }
  const steps = editBuildStepsEl.value.split('\n').map(s => s.trim()).filter(Boolean);
  await fetch(`/api/builds/${editingBuildId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, env, steps })
  });
  hideModal();
  await loadBuilds();
}

// Scheduler Management Functions
async function loadSchedulerStatus() {
  try {
    const response = await fetch('/api/scheduler/status');
    const result = await response.json();
    
    if (result.success) {
      const status = result.data;
      updateSchedulerUI(status);
    } else {
      console.error('Failed to load scheduler status:', result.error);
    }
  } catch (error) {
    console.error('Error loading scheduler status:', error);
  }
}

function updateSchedulerUI(status) {
  const statusEl = $('schedulerStatus');
  const buildMethodEl = $('schedulerBuildMethod');
  const pollingEl = $('schedulerPolling');
  const toggleBtn = $('toggleScheduler');
  
  if (statusEl) {
    statusEl.textContent = status.isRunning ? 'Đang chạy' : 'Đã dừng';
    statusEl.className = `status-badge ${status.isRunning ? 'running' : 'stopped'}`;
  }
  
  if (buildMethodEl) {
    buildMethodEl.textContent = status.buildMethod === 'script' ? 'Script' : 'Dockerfile';
  }
  
  if (pollingEl) {
    pollingEl.textContent = `${status.polling}s`;
  }
  
  if (toggleBtn) {
    toggleBtn.textContent = status.isRunning ? 'Tắt Scheduler' : 'Bật Scheduler';
  }
}

async function toggleScheduler() {
  try {
    const statusResponse = await fetch('/api/scheduler/status');
    const statusResult = await statusResponse.json();
    
    if (!statusResult.success) {
      alert('Không thể lấy trạng thái scheduler');
      return;
    }
    
    const currentStatus = statusResult.data.isRunning;
    const newStatus = !currentStatus;
    
    const response = await fetch('/api/scheduler/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoCheck: newStatus })
    });
    
    const result = await response.json();
    
    if (result.success) {
      updateSchedulerUI(result.data);
      appendLog(`[UI] ${result.message}`);
    } else {
      alert(`Lỗi: ${result.error}`);
    }
  } catch (error) {
    alert(`Lỗi khi toggle scheduler: ${error.message}`);
  }
}

async function restartScheduler() {
  try {
    const response = await fetch('/api/scheduler/restart', {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success) {
      updateSchedulerUI(result.data);
      appendLog(`[UI] ${result.message}`);
    } else {
      alert(`Lỗi: ${result.error}`);
    }
  } catch (error) {
    alert(`Lỗi khi restart scheduler: ${error.message}`);
  }
}

// Function to toggle advanced tagging section visibility
function toggleAdvancedTaggingSection(show) {
  const section = $('advancedTaggingSection');
  if (section) {
    section.style.display = show ? 'block' : 'none';
  }
}

// Function to toggle script advanced tagging section visibility
function toggleScriptAdvancedTaggingSection(show) {
  const section = $('scriptAdvancedTaggingSection');
  if (section) {
    section.style.display = show ? 'block' : 'none';
  }
}

// Helper functions for split tag system
function splitTag(tag) {
  if (!tag || tag === 'latest') {
    return { number: '1.0.75', text: '' };
  }
  
  // Tìm dấu gạch ngang cuối cùng để tách
  const lastDashIndex = tag.lastIndexOf('-');
  if (lastDashIndex === -1) {
    // Không có dấu gạch ngang, coi toàn bộ là phần số
    return { number: tag, text: '' };
  }
  
  const number = tag.substring(0, lastDashIndex);
  const text = tag.substring(lastDashIndex + 1);
  
  return { number, text };
}

function combineTag(number, text) {
  if (!number) number = '1.0.75';
  if (!text) return number;
  return `${number}-${text}`;
}

function updateTagPreview() {
  const number = $('imageTagNumber')?.value || '1.0.75';
  const text = $('imageTagText')?.value || '';
  const preview = $('finalTagPreview');
  if (preview) {
    preview.textContent = combineTag(number, text);
  }
}

function updateScriptTagPreview() {
  const number = $('scriptImageTagNumber')?.value || '1.0.75';
  const text = $('scriptImageTagText')?.value || '';
  const preview = $('scriptFinalTagPreview');
  if (preview) {
    preview.textContent = combineTag(number, text);
  }
}

// Build history management functions
async function refreshBuildHistory() {
  try {
    appendLog('[UI] Đang làm mới lịch sử builds...');
    await loadBuildHistory();
    appendLog('[UI] Đã làm mới lịch sử builds thành công');
  } catch (error) {
    console.error('Error refreshing build history:', error);
    appendLog(`[UI][ERROR] Lỗi khi làm mới lịch sử builds: ${error.message}`);
  }
}

async function clearBuildHistory() {
  if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử builds? Hành động này không thể hoàn tác.')) {
    return;
  }
  
  try {
    appendLog('[UI] Đang xóa lịch sử builds...');
    const response = await fetch('/api/build-history', {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      buildHistory = [];
      renderBuildHistory();
      appendLog('[UI] Đã xóa lịch sử builds thành công');
    } else {
      appendLog(`[UI][ERROR] Lỗi khi xóa lịch sử builds: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error clearing build history:', error);
    appendLog(`[UI][ERROR] Lỗi khi xóa lịch sử builds: ${error.message}`);
  }
}

// Phần chạy deploy.sh thủ công đã được loại bỏ theo yêu cầu. Giữ lại API tải choice.