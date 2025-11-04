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

  // System configuration
  const maxConcurrentBuildsEl = $('maxConcurrentBuilds');
  if (maxConcurrentBuildsEl) maxConcurrentBuildsEl.value = (cfg.maxConcurrentBuilds ?? 1);
  const buildTimeoutEl = $('buildTimeout');
  if (buildTimeoutEl) buildTimeoutEl.value = (cfg.buildTimeout ?? 30);
  const logRetentionDaysEl = $('logRetentionDays');
  if (logRetentionDaysEl) logRetentionDaysEl.value = (cfg.logRetentionDays ?? 30);
  const diskSpaceThresholdEl = $('diskSpaceThreshold');
  if (diskSpaceThresholdEl) diskSpaceThresholdEl.value = (cfg.diskSpaceThreshold ?? 80);

  // Email configuration
  const smtpHostEl = $('smtpHost');
  if (smtpHostEl) smtpHostEl.value = cfg.email?.smtpHost ?? '';
  const smtpPortEl = $('smtpPort');
  if (smtpPortEl) smtpPortEl.value = cfg.email?.smtpPort ?? 587;
  const emailUserEl = $('emailUser');
  if (emailUserEl) emailUserEl.value = cfg.email?.emailUser ?? '';
  const emailPasswordEl = $('emailPassword');
  if (emailPasswordEl) emailPasswordEl.value = cfg.email?.emailPassword ?? '';
  const notifyEmailsEl = $('notifyEmails');
  if (notifyEmailsEl) {
    const ne = cfg.email?.notifyEmails;
    notifyEmailsEl.value = Array.isArray(ne) ? ne.join(', ') : (ne ?? '');
  }
  const enableEmailNotifyEl = $('enableEmailNotify');
  if (enableEmailNotifyEl) enableEmailNotifyEl.checked = !!(cfg.email?.enableEmailNotify);
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
    // System configuration
    maxConcurrentBuilds: Number($('maxConcurrentBuilds')?.value || (CURRENT_CFG?.maxConcurrentBuilds ?? 1)),
    buildTimeout: Number($('buildTimeout')?.value || (CURRENT_CFG?.buildTimeout ?? 30)),
    logRetentionDays: Number($('logRetentionDays')?.value || (CURRENT_CFG?.logRetentionDays ?? 30)),
    diskSpaceThreshold: Number($('diskSpaceThreshold')?.value || (CURRENT_CFG?.diskSpaceThreshold ?? 80)),
    // Email configuration
    email: {
      smtpHost: $('smtpHost')?.value || (CURRENT_CFG?.email?.smtpHost ?? ''),
      smtpPort: Number($('smtpPort')?.value || (CURRENT_CFG?.email?.smtpPort ?? 587)),
      emailUser: $('emailUser')?.value || (CURRENT_CFG?.email?.emailUser ?? ''),
      emailPassword: $('emailPassword')?.value || (CURRENT_CFG?.email?.emailPassword ?? ''),
      notifyEmails: $('notifyEmails')?.value || (Array.isArray(CURRENT_CFG?.email?.notifyEmails) ? CURRENT_CFG.email.notifyEmails.join(', ') : (CURRENT_CFG?.email?.notifyEmails ?? '')),
      enableEmailNotify: Boolean($('enableEmailNotify')?.checked ?? (CURRENT_CFG?.email?.enableEmailNotify ?? false)),
    },
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
  loadJobs(); // Load jobs for job management tab
  
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

  // Job Management Event Listeners
  const createJobBtn = $('createJobBtn');
  const refreshJobsBtn = $('refreshJobsBtn');
  const jobModalClose = $('jobModalClose');
  const saveJobBtn = $('saveJob');
  const cancelJobBtn = $('cancelJob');
  const jobSearchInput = $('jobSearch');
  const selectAllServicesBtn = $('selectAllServices');
  const deselectAllServicesBtn = $('deselectAllServices');
  const jobAutoCheckbox = $('jobAutoCheck');

  if (createJobBtn) createJobBtn.onclick = () => showJobModal();
  if (refreshJobsBtn) refreshJobsBtn.onclick = loadJobs;
  if (jobModalClose) jobModalClose.onclick = hideJobModal;
  if (saveJobBtn) saveJobBtn.onclick = saveJob;
  if (cancelJobBtn) cancelJobBtn.onclick = hideJobModal;
  if (jobSearchInput) jobSearchInput.oninput = searchJobs;
  if (selectAllServicesBtn) selectAllServicesBtn.onclick = selectAllServices;
  if (deselectAllServicesBtn) deselectAllServicesBtn.onclick = deselectAllServices;
  if (jobAutoCheckbox) {
    jobAutoCheckbox.addEventListener('change', (e) => {
      toggleScheduleConfig(e.target.checked);
    });
  }

  // Build method radio buttons for job modal
  const jobMethodRadios = document.querySelectorAll('input[name="jobBuildMethod"]');
  jobMethodRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      toggleBuildMethodConfig(e.target.value);
    });
  });

  // Close modal when clicking outside
  const jobModal = $('jobModal');
  if (jobModal) {
    jobModal.addEventListener('click', (e) => {
      if (e.target === jobModal) {
        hideJobModal();
      }
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
  const saveSystemConfigBtn = $('saveSystemConfig');
  if (saveSystemConfigBtn) saveSystemConfigBtn.onclick = saveConfig;
  const saveEmailConfigBtn = $('saveEmailConfig');
  if (saveEmailConfigBtn) saveEmailConfigBtn.onclick = saveConfig;
  const testEmailBtn = $('testEmail');
  if (testEmailBtn) testEmailBtn.onclick = async () => {
    try {
      const toRaw = $('notifyEmails')?.value || '';
      const to = (toRaw || '').split(',').map(s => s.trim()).filter(Boolean)[0] || ($('emailUser')?.value || '');
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: 'CI/CD Test Email', text: 'Đây là email test từ hệ thống CI/CD.' }),
      });
      const data = await res.json();
      const cfgStatusEl = $('cfgStatus');
      if (cfgStatusEl) cfgStatusEl.textContent = data.ok ? 'Gửi email test thành công!' : `Gửi email thất bại: ${data.error || ''}`;
      setTimeout(() => { if (cfgStatusEl) cfgStatusEl.textContent = ''; }, 3000);
    } catch (e) {
      const cfgStatusEl = $('cfgStatus');
      if (cfgStatusEl) cfgStatusEl.textContent = `Gửi email thất bại: ${e.message || e}`;
      setTimeout(() => { if (cfgStatusEl) cfgStatusEl.textContent = ''; }, 3000);
    }
  };
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
  
  // Queue management event listeners
  const toggleQueueBtn = $('toggleQueueBtn');
  const saveQueueConfigBtn = $('saveQueueConfigBtn');
  const refreshQueueBtn = $('refreshQueueBtn');
  
  if (toggleQueueBtn) toggleQueueBtn.addEventListener('click', toggleQueueProcessing);
  if (saveQueueConfigBtn) saveQueueConfigBtn.addEventListener('click', saveQueueConfig);
  if (refreshQueueBtn) refreshQueueBtn.addEventListener('click', loadQueueStatus);
  
  // Load queue status on page load
  loadQueueStatus();
  
  // Add event listeners for job tag configuration
  const jobImageTagNumber = document.getElementById('jobImageTagNumber');
  const jobImageTagText = document.getElementById('jobImageTagText');
  
  if (jobImageTagNumber) {
    jobImageTagNumber.addEventListener('input', updateJobTagPreview);
  }
  if (jobImageTagText) {
    jobImageTagText.addEventListener('input', updateJobTagPreview);
  }
  
  // Add event listeners for Script tag configuration
  const jobScriptImageTagNumber = document.getElementById('jobScriptImageTagNumber');
  const jobScriptImageTagText = document.getElementById('jobScriptImageTagText');
  if (jobScriptImageTagNumber) {
    jobScriptImageTagNumber.addEventListener('input', updateJobScriptTagPreview);
  }
  if (jobScriptImageTagText) {
    jobScriptImageTagText.addEventListener('input', updateJobScriptTagPreview);
  }
  
  // Add event listener for "Use Common Config" button
  const useCommonConfigBtn = document.getElementById('useCommonConfigBtn');
  if (useCommonConfigBtn) {
    useCommonConfigBtn.addEventListener('click', useCommonConfig);
  }
  
  // Refresh queue status every 5 seconds
  setInterval(loadQueueStatus, 5000);
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

function updateJobTagPreview() {
  const number = document.getElementById('jobImageTagNumber')?.value || '1.0.0';
  const text = document.getElementById('jobImageTagText')?.value || '';
  const preview = document.getElementById('jobTagPreview');
  if (preview) {
    preview.textContent = combineTag(number, text);
  }
}

function updateJobScriptTagPreview() {
  const number = document.getElementById('jobScriptImageTagNumber')?.value || '1.0.0';
  const text = document.getElementById('jobScriptImageTagText')?.value || '';
  const preview = document.getElementById('jobScriptTagPreview');
  if (preview) {
    preview.textContent = combineTag(number, text);
  }
}

// Hàm sử dụng cấu hình chung để điền vào form job
function useCommonConfig() {
  if (!CURRENT_CFG) {
    alert('Không có cấu hình chung để sử dụng. Vui lòng cấu hình trong tab Cấu hình chung trước.');
    return;
  }

  // Điền thông tin Git
  const jobGitRepoUrlEl = $('jobGitRepoUrl');
  if (jobGitRepoUrlEl) jobGitRepoUrlEl.value = CURRENT_CFG.repoUrl || '';
  
  const jobGitRepoPathEl = $('jobGitRepoPath');
  if (jobGitRepoPathEl) jobGitRepoPathEl.value = CURRENT_CFG.repoPath || '';
  
  const jobGitBranchEl = $('jobGitBranch');
  if (jobGitBranchEl) jobGitBranchEl.value = CURRENT_CFG.branch || 'main';
  
  const jobGitAccountEl = $('jobGitAccount');
  if (jobGitAccountEl) jobGitAccountEl.value = CURRENT_CFG.account || '';
  
  const jobGitTokenEl = $('jobGitToken');
  if (jobGitTokenEl) jobGitTokenEl.value = CURRENT_CFG.token || '';

  // Điền build method
  const buildMethod = CURRENT_CFG.buildMethod || 'dockerfile';
  const jobBuildMethodRadio = document.querySelector(`input[name="jobBuildMethod"][value="${buildMethod}"]`);
  if (jobBuildMethodRadio) {
    jobBuildMethodRadio.checked = true;
    // Trigger để hiển thị đúng config section
    toggleBuildMethodConfig(buildMethod);
  }

  // Điền Docker config nếu có
  const d = CURRENT_CFG.docker || {};
  
  // Docker config
  const jobDockerfilePathEl = $('jobDockerfilePath');
  if (jobDockerfilePathEl) jobDockerfilePathEl.value = d.dockerfilePath || '';
  
  const jobContextPathEl = $('jobContextPath');
  if (jobContextPathEl) jobContextPathEl.value = d.contextPath || '';
  
  const jobImageNameEl = $('jobImageName');
  if (jobImageNameEl) jobImageNameEl.value = d.imageName || '';
  
  // Docker tag config
  const jobImageTagNumberEl = $('jobImageTagNumber');
  const jobImageTagTextEl = $('jobImageTagText');
  if (d.imageTag) {
    const parts = splitTag(d.imageTag);
    if (jobImageTagNumberEl) jobImageTagNumberEl.value = parts.number || '1.0.75';
    if (jobImageTagTextEl) jobImageTagTextEl.value = parts.text || '';
  } else {
    if (jobImageTagNumberEl) jobImageTagNumberEl.value = '1.0.75';
    if (jobImageTagTextEl) jobImageTagTextEl.value = '';
  }
  
  const jobAutoTagIncrementEl = $('jobAutoTagIncrement');
  if (jobAutoTagIncrementEl) {
    jobAutoTagIncrementEl.checked = !!d.autoTagIncrement;
  }
  
  // Docker registry config
  const jobRegistryUrlEl = $('jobRegistryUrl');
  if (jobRegistryUrlEl) jobRegistryUrlEl.value = d.registryUrl || '';
  
  const jobRegistryUsernameEl = $('jobRegistryUsername');
  if (jobRegistryUsernameEl) jobRegistryUsernameEl.value = d.registryUsername || '';
  
  const jobRegistryPasswordEl = $('jobRegistryPassword');
  if (jobRegistryPasswordEl) jobRegistryPasswordEl.value = d.registryPassword || '';

  // Script config
  const jobScriptPathEl = $('jobScriptPath');
  if (jobScriptPathEl) jobScriptPathEl.value = CURRENT_CFG.scriptPath || '';
  
  // Script sử dụng cùng các trường với Docker (jobImageName, jobImageTagNumber, etc.)
  // Nếu có script config riêng, ưu tiên sử dụng
  if (CURRENT_CFG.scriptImageTagNumber && jobImageTagNumberEl) {
    jobImageTagNumberEl.value = CURRENT_CFG.scriptImageTagNumber;
  }
  if (CURRENT_CFG.scriptImageTagText && jobImageTagTextEl) {
    jobImageTagTextEl.value = CURRENT_CFG.scriptImageTagText;
  }
  if (CURRENT_CFG.scriptAutoTagIncrement !== undefined && jobAutoTagIncrementEl) {
    jobAutoTagIncrementEl.checked = !!CURRENT_CFG.scriptAutoTagIncrement;
  }

  // Cập nhật preview
  updateJobTagPreview();
  updateJobScriptTagPreview();
  
  // Hiển thị thông báo thành công
  alert('Đã áp dụng cấu hình chung thành công!');
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

// ===== JOB MANAGEMENT =====
let jobs = [];
let editingJobId = null;

// Load jobs from server
async function loadJobs() {
  try {
    const response = await fetch('/api/jobs');
    if (response.ok) {
      jobs = await response.json();
      renderJobsTable();
      updateJobStats();
    } else {
      console.error('Failed to load jobs');
    }
  } catch (error) {
    console.error('Error loading jobs:', error);
  }
}

// Render jobs table
function renderJobsTable() {
  // Sử dụng đúng selector theo index.html: tbody có id="jobsTableBody"
  const tbody = document.getElementById('jobsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  
  jobs.forEach(job => {
    const method = job?.buildConfig?.method || job?.method || 'dockerfile';
    const methodText = method === 'script' ? '📜 Script' : '🐳 Dockerfile';
    const lastStatus = job?.stats?.lastBuildStatus; // success/failed/running/null
    const lastAt = job?.stats?.lastBuildAt; // ISO datetime or null

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="job-name">${job.name}</div>
        <div class="job-description">${job.description || ''}</div>
      </td>
      <td>
        <span class="tag ${job.enabled ? 'success' : 'muted'}">
          ${job.enabled ? '✅ Kích hoạt' : '❌ Tắt'}
        </span>
      </td>
      <td>${methodText}</td>
      <td>${job.services?.length || 0} services</td>
      <td>
        <div><span class="tag ${getStatusClass(lastStatus)}">${getStatusText(lastStatus)}</span></div>
        <div class="muted">${lastAt ? new Date(lastAt).toLocaleString('vi-VN') : 'Chưa build'}</div>
      </td>
      <td>
        <div class="job-actions-inline">
          <button class="btn small primary" onclick="runJob('${job.id}')">▶️ Chạy</button>
          <button class="btn small outline" onclick="editJob('${job.id}')">✏️ Sửa</button>
          <button class="btn small danger" onclick="deleteJob('${job.id}')">🗑️ Xóa</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Update job statistics
function updateJobStats() {
  const totalJobs = jobs.length;
  const activeJobs = jobs.filter(j => j.enabled).length;
  // Tổng số builds thành công/thất bại (cộng dồn theo thống kê của từng job)
  const successfulBuilds = jobs.reduce((sum, j) => sum + (j.stats?.successfulBuilds || 0), 0);
  const failedBuilds = jobs.reduce((sum, j) => sum + (j.stats?.failedBuilds || 0), 0);
  // Tổng lượt build (cộng dồn): ưu tiên stats.totalBuilds nếu có, fallback = success + fail
  const totalBuilds = jobs.reduce((sum, j) => sum + (j.stats?.totalBuilds || 0), 0) || (successfulBuilds + failedBuilds);

  // Các phần tử thống kê có id đặt trực tiếp trên .stat-number
  const totalEl = document.getElementById('totalJobs');
  const activeEl = document.getElementById('activeJobs');
  const totalBuildsEl = document.getElementById('totalBuilds');
  const successEl = document.getElementById('successfulBuilds');
  const failedEl = document.getElementById('failedBuilds');

  if (totalEl) totalEl.textContent = totalJobs;
  if (activeEl) activeEl.textContent = activeJobs;
  if (totalBuildsEl) totalBuildsEl.textContent = totalBuilds;
  if (successEl) successEl.textContent = successfulBuilds;
  if (failedEl) failedEl.textContent = failedBuilds;
}

// Get status class for styling
function getStatusClass(status) {
  switch (status) {
    case 'success': return 'success';
    case 'failed': return 'danger';
    case 'running': return 'warning';
    default: return 'muted';
  }
}

// Get status text
function getStatusText(status) {
  switch (status) {
    case 'success': return '✅ Thành công';
    case 'failed': return '❌ Thất bại';
    case 'running': return '⏳ Đang chạy';
    default: return '⚪ Chưa chạy';
  }
}

// Show job modal
function showJobModal(jobId = null) {
  editingJobId = jobId;
  const modal = document.getElementById('jobModal');
  const title = document.getElementById('jobModalTitle');
  
  if (jobId) {
    title.textContent = 'Chỉnh sửa Job';
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      populateJobForm(job);
    }
  } else {
    title.textContent = 'Tạo Job mới';
    resetJobForm();
  }
  
  loadServicesForSelection();
  modal.classList.add('show');
}

// Hide job modal
function hideJobModal() {
  const modal = document.getElementById('jobModal');
  modal.classList.remove('show');
  editingJobId = null;
}

// Populate job form with data
function populateJobForm(job) {
  document.getElementById('jobName').value = job.name || '';
  document.getElementById('jobDescription').value = job.description || '';
  document.getElementById('jobEnabled').checked = job.enabled !== false;

  // Git configuration (support both old UI shape and backend shape)
  const git = job.git || job.gitConfig || {};
  document.getElementById('jobGitProvider').value = git.provider || 'gitlab';
  document.getElementById('jobGitAccount').value = git.account || '';
  document.getElementById('jobGitToken').value = git.token || '';
  document.getElementById('jobGitBranch').value = git.branch || 'main';
  document.getElementById('jobGitRepoUrl').value = git.repoUrl || '';
  document.getElementById('jobGitRepoPath').value = git.repoPath || '';

  // Build configuration
  const build = job.build || job.buildConfig || {};
  const buildMethod = build.method || 'dockerfile';
  document.querySelector(`input[name="jobBuildMethod"][value="${buildMethod}"]`).checked = true;
  toggleBuildMethodConfig(buildMethod);
  
  document.getElementById('jobBuildOrder').value = build.buildOrder || build.order || 'parallel';
  
  if (buildMethod === 'script') {
    document.getElementById('jobScriptPath').value = build.scriptPath || '';

    // Handle script tag configuration (UI only; backend doesn't store these under script)
    document.getElementById('jobScriptImageName').value = build.imageName || '';
    const scriptTagNumber = build.imageTagNumber || '1.0.0';
    const scriptTagText = build.imageTagText || '';
    document.getElementById('jobScriptImageTagNumber').value = scriptTagNumber;
    document.getElementById('jobScriptImageTagText').value = scriptTagText;
    updateJobScriptTagPreview();
    
    document.getElementById('jobScriptRegistryUrl').value = build.registryUrl || '';
    document.getElementById('jobScriptRegistryUsername').value = build.registryUsername || '';
    document.getElementById('jobScriptRegistryPassword').value = build.registryPassword || '';
    document.getElementById('jobScriptAutoTagIncrement').checked = build.autoTagIncrement || false;
  } else {
    const d = build.dockerConfig || build;
    document.getElementById('jobDockerfilePath').value = d.dockerfilePath || './Dockerfile';
    document.getElementById('jobContextPath').value = d.contextPath || '.';
    document.getElementById('jobImageName').value = d.imageName || '';
    
    // Handle tag configuration
    let tagNumber = d.imageTagNumber || '1.0.0';
    let tagText = d.imageTagText || '';
    if ((!tagNumber || tagNumber === '1.0.0') && d.imageTag) {
      const parts = splitTag(String(d.imageTag));
      tagNumber = parts.number;
      tagText = parts.text;
    }
    document.getElementById('jobImageTagNumber').value = tagNumber;
    document.getElementById('jobImageTagText').value = tagText;
    updateJobTagPreview();
    
    document.getElementById('jobRegistryUrl').value = d.registryUrl || '';
    document.getElementById('jobRegistryUsername').value = d.registryUsername || '';
    document.getElementById('jobRegistryPassword').value = d.registryPassword || '';
    document.getElementById('jobAutoTagIncrement').checked = d.autoTagIncrement || false;
  }
  
  // Schedule configuration
  document.getElementById('jobAutoCheck').checked = (job.schedule?.autoCheck || false);
  toggleScheduleConfig(job.schedule?.autoCheck || false);
  document.getElementById('jobPolling').value = job.schedule?.polling || 30;
  document.getElementById('jobCron').value = job.schedule?.cron || '';
}

// Reset job form
function resetJobForm() {
  document.getElementById('jobName').value = '';
  document.getElementById('jobDescription').value = '';
  document.getElementById('jobEnabled').checked = true;
  
  // Reset Git configuration
  document.getElementById('jobGitProvider').value = 'gitlab';
  document.getElementById('jobGitAccount').value = '';
  document.getElementById('jobGitToken').value = '';
  document.getElementById('jobGitBranch').value = 'main';
  document.getElementById('jobGitRepoUrl').value = '';
  document.getElementById('jobGitRepoPath').value = '';
  
  // Reset Build configuration
  document.querySelector('input[name="jobBuildMethod"][value="dockerfile"]').checked = true;
  toggleBuildMethodConfig('dockerfile');
  document.getElementById('jobBuildOrder').value = 'parallel';
  
  // Reset Docker config
  document.getElementById('jobDockerfilePath').value = './Dockerfile';
  document.getElementById('jobContextPath').value = '.';
  document.getElementById('jobImageName').value = '';
  
  // Reset tag configuration
  document.getElementById('jobImageTagNumber').value = '1.0.0';
  document.getElementById('jobImageTagText').value = '';
  updateJobTagPreview();
  
  document.getElementById('jobRegistryUrl').value = '';
  document.getElementById('jobRegistryUsername').value = '';
  document.getElementById('jobRegistryPassword').value = '';
  document.getElementById('jobAutoTagIncrement').checked = false;
  
  // Reset Script config
  document.getElementById('jobScriptPath').value = '';
  document.getElementById('jobScriptImageName').value = '';
  document.getElementById('jobScriptImageTagNumber').value = '1';
  document.getElementById('jobScriptImageTagText').value = 'latest';
  document.getElementById('jobScriptRegistryUrl').value = '';
  document.getElementById('jobScriptRegistryUsername').value = '';
  document.getElementById('jobScriptRegistryPassword').value = '';
  document.getElementById('jobScriptAutoTagIncrement').checked = false;
  updateJobScriptTagPreview();
  
  // Reset Schedule configuration
  document.getElementById('jobAutoCheck').checked = false;
  toggleScheduleConfig(false);
  document.getElementById('jobPolling').value = 30;
  document.getElementById('jobCron').value = '';
  
  // Reset services selection
  const checkboxes = document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = false);
}

// Toggle build method configuration
function toggleBuildMethodConfig(method) {
  const scriptConfig = document.getElementById('jobScriptConfig');
  const dockerConfig = document.getElementById('jobDockerConfig');
  const servicesSection = document.getElementById('servicesSection');
  
  if (method === 'script') {
    scriptConfig.style.display = 'block';
    dockerConfig.style.display = 'none';
    if (servicesSection) servicesSection.style.display = 'none';
  } else {
    scriptConfig.style.display = 'none';
    dockerConfig.style.display = 'block';
    if (servicesSection) servicesSection.style.display = 'block';
  }
}

// Toggle schedule configuration
function toggleScheduleConfig(show) {
  const scheduleConfig = document.getElementById('scheduleConfig');
  scheduleConfig.style.display = show ? 'block' : 'none';
}

// Load services for selection
async function loadServicesForSelection() {
  try {
    // Load from current config
    const response = await fetch('/api/config');
    if (response.ok) {
      const config = await response.json();
      const services = config.deployServices || [];
      renderServicesCheckboxes(services);
    }
  } catch (error) {
    console.error('Error loading services:', error);
  }
}

// Render services checkboxes
function renderServicesCheckboxes(services) {
  const container = document.getElementById('servicesCheckboxes');
  container.innerHTML = '';
  
  services.forEach(service => {
    const div = document.createElement('div');
    div.className = 'service-checkbox';
    div.innerHTML = `
      <input type="checkbox" id="service_${service.name}" value="${service.name}">
      <label for="service_${service.name}">${service.name}</label>
    `;
    container.appendChild(div);
  });
}

// Select/Deselect all services
function selectAllServices() {
  const checkboxes = document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = true);
}

function deselectAllServices() {
  const checkboxes = document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = false);
}

// Save job
async function saveJob() {
  try {
    const jobData = {
      name: document.getElementById('jobName').value,
      description: document.getElementById('jobDescription').value,
      enabled: document.getElementById('jobEnabled').checked,
      gitConfig: {
        provider: document.getElementById('jobGitProvider').value,
        account: document.getElementById('jobGitAccount').value,
        token: document.getElementById('jobGitToken').value,
        branch: document.getElementById('jobGitBranch').value,
        repoUrl: document.getElementById('jobGitRepoUrl').value,
        repoPath: document.getElementById('jobGitRepoPath').value
      },
      buildConfig: {
        method: document.querySelector('input[name="jobBuildMethod"]:checked').value,
        buildOrder: document.getElementById('jobBuildOrder').value,
      },
      schedule: {
        autoCheck: document.getElementById('jobAutoCheck').checked,
        polling: parseInt(document.getElementById('jobPolling').value),
        cron: document.getElementById('jobCron').value
      }
    };
    
    // Add build method specific config
    if (jobData.buildConfig.method === 'script') {
      jobData.buildConfig.scriptPath = document.getElementById('jobScriptPath').value;
      // Lưu đầy đủ cấu hình Tag/Registry cho chế độ Script (yêu cầu của người dùng)
      jobData.buildConfig.imageName = document.getElementById('jobScriptImageName').value;
      jobData.buildConfig.imageTagNumber = document.getElementById('jobScriptImageTagNumber').value;
      jobData.buildConfig.imageTagText = document.getElementById('jobScriptImageTagText').value;
      jobData.buildConfig.autoTagIncrement = document.getElementById('jobScriptAutoTagIncrement').checked;
      jobData.buildConfig.registryUrl = document.getElementById('jobScriptRegistryUrl').value;
      jobData.buildConfig.registryUsername = document.getElementById('jobScriptRegistryUsername').value;
      jobData.buildConfig.registryPassword = document.getElementById('jobScriptRegistryPassword').value;
    } else {
      const imageTag = combineTag(
        document.getElementById('jobImageTagNumber').value,
        document.getElementById('jobImageTagText').value
      );
      jobData.buildConfig.dockerConfig = {
        dockerfilePath: document.getElementById('jobDockerfilePath').value,
        contextPath: document.getElementById('jobContextPath').value,
        imageName: document.getElementById('jobImageName').value,
        imageTag,
        registryUrl: document.getElementById('jobRegistryUrl').value,
        registryUsername: document.getElementById('jobRegistryUsername').value,
        registryPassword: document.getElementById('jobRegistryPassword').value,
        autoTagIncrement: document.getElementById('jobAutoTagIncrement').checked,
      };
    }
    
    // Debug: log payload before sending to backend
    try {
      console.log('[UI] saveJob payload:', JSON.stringify(jobData, null, 2));
    } catch (e) {
      console.log('[UI] saveJob payload (stringify failed):', jobData);
    }

    // Get selected services
    const selectedServices = [];
    const checkboxes = document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]:checked');
    checkboxes.forEach(cb => selectedServices.push(cb.value));
    jobData.services = selectedServices;

    console.log('[UI] Selected services:', selectedServices);
    
    // Validate required fields
    if (!jobData.name || !jobData.gitConfig.repoUrl || !jobData.gitConfig.branch) {
      alert('Vui lòng điền đầy đủ các trường bắt buộc (*)');
      return;
    }
    
    const url = editingJobId ? `/api/jobs/${editingJobId}` : '/api/jobs';
    const method = editingJobId ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobData)
    });
    
    if (response.ok) {
      hideJobModal();
      loadJobs();
      alert(editingJobId ? 'Job đã được cập nhật!' : 'Job đã được tạo thành công!');
    } else {
      const error = await response.text();
      alert('Lỗi khi lưu job: ' + error);
    }
  } catch (error) {
    console.error('Error saving job:', error);
    alert('Lỗi khi lưu job: ' + error.message);
  }
}

// Edit job
function editJob(jobId) {
  showJobModal(jobId);
}

// Delete job
async function deleteJob(jobId) {
  if (!confirm('Bạn có chắc chắn muốn xóa job này?')) return;
  
  try {
    const response = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    if (response.ok) {
      loadJobs();
      alert('Job đã được xóa!');
    } else {
      const error = await response.text();
      alert('Lỗi khi xóa job: ' + error);
    }
  } catch (error) {
    console.error('Error deleting job:', error);
    alert('Lỗi khi xóa job: ' + error.message);
  }
}

// Run job
async function runJob(jobId) {
  try {
    const response = await fetch(`/api/jobs/${jobId}/run`, { method: 'POST' });
    if (response.ok) {
      alert('Job đã được khởi chạy!');
      loadJobs(); // Refresh to show updated status
    } else {
      const error = await response.text();
      alert('Lỗi khi chạy job: ' + error);
    }
  } catch (error) {
    console.error('Error running job:', error);
    alert('Lỗi khi chạy job: ' + error.message);
  }
}

// Search jobs
function searchJobs() {
  const searchTerm = document.getElementById('jobSearch').value.toLowerCase();
  // Theo cấu trúc mới của bảng jobs, tbody có id="jobsTableBody"
  const rows = document.querySelectorAll('#jobsTableBody tr');
  
  rows.forEach(row => {
    const jobName = row.querySelector('.job-name').textContent.toLowerCase();
    const jobDescription = row.querySelector('.job-description').textContent.toLowerCase();
    const isVisible = jobName.includes(searchTerm) || jobDescription.includes(searchTerm);
    row.style.display = isVisible ? '' : 'none';
  });
}

// ===== QUEUE MANAGEMENT =====
let queueStatus = {
  queue: [],
  running: [],
  completed: [],
  failed: []
};
let queueStats = {};
let queueProcessing = true;

// Load queue status
async function loadQueueStatus() {
  try {
    const response = await fetch('/api/queue/status');
    if (response.ok) {
      const data = await response.json();
      queueStatus = data.status;
      queueStats = data.stats;
      renderQueueStatus();
      updateQueueStats();
    }
  } catch (error) {
    console.error('Error loading queue status:', error);
  }
}

// Render queue status
function renderQueueStatus() {
  renderQueueList();
  renderRunningJobs();
  renderCompletedJobs();
  renderFailedJobs();
}

// Render queue list
function renderQueueList() {
  const container = $('queueList');
  if (!container) return;

  if (queueStatus.queue.length === 0) {
    container.innerHTML = '<div class="empty-state">Hàng đợi trống</div>';
    return;
  }

  container.innerHTML = queueStatus.queue.map(job => `
    <div class="job-item">
      <div class="job-info">
        <div class="job-name">${job.name}</div>
        <div class="job-meta">
          <span class="job-status ${job.status}">${getStatusText(job.status)}</span>
          <span class="priority-badge ${job.priority}">${job.priority}</span>
          <span>Thêm vào: ${new Date(job.queuedAt).toLocaleString()}</span>
        </div>
      </div>
      <div class="job-actions">
        <button class="btn danger small" onclick="cancelQueueJob('${job.id}')">❌ Hủy</button>
      </div>
    </div>
  `).join('');
}

// Render running jobs
function renderRunningJobs() {
  const container = $('runningJobsList');
  if (!container) return;

  if (queueStatus.running.length === 0) {
    container.innerHTML = '<div class="empty-state">Không có job nào đang chạy</div>';
    return;
  }

  container.innerHTML = queueStatus.running.map(job => `
    <div class="job-item">
      <div class="job-info">
        <div class="job-name">${job.name}</div>
        <div class="job-meta">
          <span class="job-status ${job.status}">${getStatusText(job.status)}</span>
          <span>Bắt đầu: ${new Date(job.startedAt).toLocaleString()}</span>
        </div>
        ${job.progress ? `
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${job.progress}%"></div>
          </div>
          <small>${job.progress}% hoàn thành</small>
        ` : ''}
      </div>
      <div class="job-actions">
        <button class="btn danger small" onclick="cancelQueueJob('${job.id}')">🛑 Dừng</button>
      </div>
    </div>
  `).join('');
}

// Render completed jobs
function renderCompletedJobs() {
  const container = $('completedJobsList');
  if (!container) return;

  if (queueStatus.completed.length === 0) {
    container.innerHTML = '<div class="empty-state">Chưa có job nào hoàn thành</div>';
    return;
  }

  container.innerHTML = queueStatus.completed.map(job => `
    <div class="job-item">
      <div class="job-info">
        <div class="job-name">${job.name}</div>
        <div class="job-meta">
          <span class="job-status ${job.status}">${getStatusText(job.status)}</span>
          <span>Hoàn thành: ${new Date(job.completedAt).toLocaleString()}</span>
          <span class="execution-time">${job.executionTime}ms</span>
        </div>
      </div>
    </div>
  `).join('');
}

// Render failed jobs
function renderFailedJobs() {
  const container = $('failedJobsList');
  if (!container) return;

  if (queueStatus.failed.length === 0) {
    container.innerHTML = '<div class="empty-state">Chưa có job nào thất bại</div>';
    return;
  }

  container.innerHTML = queueStatus.failed.map(job => `
    <div class="job-item">
      <div class="job-info">
        <div class="job-name">${job.name}</div>
        <div class="job-meta">
          <span class="job-status ${job.status}">${getStatusText(job.status)}</span>
          <span>Thất bại: ${new Date(job.failedAt).toLocaleString()}</span>
          <span>Lỗi: ${job.error}</span>
        </div>
      </div>
      <div class="job-actions">
        <button class="btn primary small" onclick="retryJob('${job.id}')">🔄 Thử lại</button>
      </div>
    </div>
  `).join('');
}

// Update queue statistics
function updateQueueStats() {
  if (!queueStats) return;

  const elements = {
    queueLength: $('queueLength'),
    runningJobs: $('runningJobs'),
    completedJobs: $('completedJobs'),
    failedJobs: $('failedJobs'),
    avgExecutionTime: $('avgExecutionTime')
  };

  if (elements.queueLength) elements.queueLength.textContent = queueStats.queueLength || 0;
  if (elements.runningJobs) elements.runningJobs.textContent = queueStats.runningJobs || 0;
  if (elements.completedJobs) elements.completedJobs.textContent = queueStats.totalCompleted || 0;
  if (elements.failedJobs) elements.failedJobs.textContent = queueStats.totalFailed || 0;
  if (elements.avgExecutionTime) elements.avgExecutionTime.textContent = `${queueStats.averageExecutionTime || 0}ms`;
}

// Add job to queue
async function addJobToQueue(jobId, priority = 'medium') {
  try {
    const response = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, priority })
    });

    const result = await response.json();
    if (result.success) {
      appendLog(`[QUEUE] Job đã được thêm vào hàng đợi: ${result.queueJobId}`);
      loadQueueStatus();
    } else {
      appendLog(`[QUEUE][ERROR] Lỗi thêm job vào queue: ${result.error}`);
    }
  } catch (error) {
    console.error('Error adding job to queue:', error);
    appendLog(`[QUEUE][ERROR] Lỗi thêm job vào queue: ${error.message}`);
  }
}

// Cancel queue job
async function cancelQueueJob(jobId) {
  if (!confirm('Bạn có chắc chắn muốn hủy job này?')) return;

  try {
    const response = await fetch(`/api/queue/${jobId}`, {
      method: 'DELETE'
    });

    const result = await response.json();
    if (result.success) {
      appendLog(`[QUEUE] Job đã được hủy: ${jobId}`);
      loadQueueStatus();
    } else {
      appendLog(`[QUEUE][ERROR] Lỗi hủy job: ${result.error}`);
    }
  } catch (error) {
    console.error('Error cancelling job:', error);
    appendLog(`[QUEUE][ERROR] Lỗi hủy job: ${error.message}`);
  }
}

// Retry failed job
async function retryJob(jobId) {
  try {
    // Tìm job gốc và thêm lại vào queue
    const job = queueStatus.failed.find(j => j.id === jobId);
    if (job && job.jobId) {
      await addJobToQueue(job.jobId, 'high'); // Ưu tiên cao cho retry
    }
  } catch (error) {
    console.error('Error retrying job:', error);
    appendLog(`[QUEUE][ERROR] Lỗi thử lại job: ${error.message}`);
  }
}

// Toggle queue processing
async function toggleQueueProcessing() {
  try {
    const action = queueProcessing ? 'stop' : 'start';
    const response = await fetch('/api/queue/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });

    const result = await response.json();
    if (result.success) {
      queueProcessing = !queueProcessing;
      const btn = $('toggleQueueBtn');
      if (btn) {
        btn.textContent = queueProcessing ? '⏸️ Tạm dừng Queue' : '▶️ Khởi động Queue';
        btn.className = queueProcessing ? 'btn primary' : 'btn success';
      }
      appendLog(`[QUEUE] Queue đã được ${queueProcessing ? 'khởi động' : 'tạm dừng'}`);
    }
  } catch (error) {
    console.error('Error toggling queue:', error);
    appendLog(`[QUEUE][ERROR] Lỗi toggle queue: ${error.message}`);
  }
}

// Save queue configuration
async function saveQueueConfig() {
  try {
    const maxConcurrentJobs = parseInt($('maxConcurrentJobs').value);
    const resourceThreshold = parseInt($('resourceThreshold').value);

    const response = await fetch('/api/queue/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxConcurrentJobs, resourceThreshold })
    });

    const result = await response.json();
    if (result.success) {
      appendLog('[QUEUE] Cấu hình queue đã được lưu');
    } else {
      appendLog(`[QUEUE][ERROR] Lỗi lưu cấu hình: ${result.error}`);
    }
  } catch (error) {
    console.error('Error saving queue config:', error);
    appendLog(`[QUEUE][ERROR] Lỗi lưu cấu hình queue: ${error.message}`);
  }
}

// Run job immediately (bypass queue)
async function runJobImmediate(jobId) {
  try {
    const response = await fetch(`/api/jobs/${jobId}/run-immediate`, {
      method: 'POST'
    });

    const result = await response.json();
    if (result.success) {
      appendLog(`[QUEUE] Job đã được chạy ngay lập tức: ${jobId}`);
    } else {
      appendLog(`[QUEUE][ERROR] Lỗi chạy job ngay: ${result.error}`);
    }
  } catch (error) {
    console.error('Error running job immediately:', error);
    appendLog(`[QUEUE][ERROR] Lỗi chạy job ngay: ${error.message}`);
  }
}