import { $, fetchJSON } from './utils.js';
import { state } from './state.js';
import { loadServicesForSelection, selectAllServices, deselectAllServices } from './services.js';

export async function loadJobs() {
  try {
    const { ok, data } = await fetchJSON('/api/jobs');
    if (!ok) return;
    state.jobs = data || [];
    renderJobsTable();
    updateJobStats();
  } catch (e) { console.error(e); }
}

export function renderJobsTable() {
  const tbody = $('jobsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!state.jobs.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = 6; td.textContent = 'Không có job nào'; tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  state.jobs.forEach(job => {
    const tr = document.createElement('tr');
    const lastBuildStatus = job?.stats?.lastStatus || 'N/A';
    const method = job?.method || job?.buildConfig?.method || 'dockerfile';
    const methodLabel = method === 'dockerfile' ? 'Dockerfile' : (method === 'script' ? 'Script' : (method === 'jsonfile' ? 'JSON Pipeline' : String(method)));
    tr.innerHTML = `
      <td>${job.name}</td>
      <td><span class="status ${getStatusClass(lastBuildStatus)}">${getStatusText(lastBuildStatus)}</span></td>
      <td>${methodLabel}</td>
      <td>${(job.services || []).length}</td>
      <td>${job.stats?.lastBuildTime ? new Date(job.stats.lastBuildTime).toLocaleString() : '-'}</td>
      <td>
        <button class="btn small primary" onclick="runJob('${job.id}')">▶️ Chạy</button>
        <button class="btn small outline" onclick="editJob('${job.id}')">✏️ Sửa</button>
        <button class="btn small danger" onclick="deleteJob('${job.id}')">🗑️ Xóa</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

export function updateJobStats() {
  const totalJobsEl = $('totalJobs');
  const activeJobsEl = $('activeJobs');
  const totalBuildsEl = $('totalBuilds');
  const successfulEl = $('successfulBuilds');
  const failedEl = $('failedBuilds');
  const totalJobs = state.jobs.length;
  const activeJobs = state.jobs.filter(j => j.enabled).length;
  const totalBuilds = state.buildHistory.length;
  const successful = state.buildHistory.filter(b => (b.status || '').toLowerCase() === 'success').length;
  const failed = state.buildHistory.filter(b => (b.status || '').toLowerCase() === 'failed').length;
  if (totalJobsEl) totalJobsEl.textContent = String(totalJobs);
  if (activeJobsEl) activeJobsEl.textContent = String(activeJobs);
  if (totalBuildsEl) totalBuildsEl.textContent = String(totalBuilds);
  if (successfulEl) successfulEl.textContent = String(successful);
  if (failedEl) failedEl.textContent = String(failed);
}

export function getStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'success') return 'success';
  if (s === 'failed') return 'failed';
  if (s === 'running') return 'running';
  return 'unknown';
}

export function getStatusText(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'success') return 'Thành công';
  if (s === 'failed') return 'Thất bại';
  if (s === 'running') return 'Đang chạy';
  return 'Không rõ';
}

export function showJobModal(jobId = null) {
  state.editingJobId = jobId;
  const modal = $('jobModal');
  if (modal) modal.style.display = 'block';
  if (jobId) {
    const job = state.jobs.find(j => j.id === jobId);
    if (job) populateJobForm(job);
  } else {
    resetJobForm();
  }
  loadServicesForSelection();
}

export function hideJobModal() {
  const modal = $('jobModal');
  if (modal) modal.style.display = 'none';
}

export function populateJobForm(job) {
  $('jobName') && ($('jobName').value = job.name || '');
  $('jobDescription') && ($('jobDescription').value = job.description || '');
  const enabledEl = $('jobEnabled'); if (enabledEl) enabledEl.checked = !!job.enabled;

  // Git
  const gc = job.gitConfig || job.git || {};
  $('jobGitProvider') && ($('jobGitProvider').value = gc.provider || 'gitlab');
  $('jobGitAccount') && ($('jobGitAccount').value = gc.account || '');
  $('jobGitToken') && ($('jobGitToken').value = gc.token || '');
  $('jobGitBranch') && ($('jobGitBranch').value = gc.branch || '');
  $('jobGitRepoUrl') && ($('jobGitRepoUrl').value = gc.repoUrl || '');

  // Method
  const method = job.method || job.buildConfig?.method || 'dockerfile';
  const scriptRadio = document.getElementById('jobMethodScript');
  const dockerRadio = document.getElementById('jobMethodDocker');
  const jsonRadio = document.getElementById('jobMethodJson');
  if (scriptRadio) scriptRadio.checked = method === 'script';
  if (dockerRadio) dockerRadio.checked = method === 'dockerfile';
  if (jsonRadio) jsonRadio.checked = method === 'jsonfile';
  toggleBuildMethodConfig(method);

  // Docker config
  // Nếu để trống, backend sẽ tự dùng Context/Katalyst/repo làm context và Dockerfile mặc định trong repo
  const dc = (job.buildConfig && job.buildConfig.dockerConfig) ? job.buildConfig.dockerConfig : (job.docker || {});
  $('jobDockerfilePath') && ($('jobDockerfilePath').value = dc.dockerfilePath || '');
  $('jobContextPath') && ($('jobContextPath').value = dc.contextPath || '');
  $('jobImageName') && ($('jobImageName').value = dc.imageName || '');

  // imageTag có thể là một chuỗi đầy đủ; nếu có, tách về number/text để hiển thị
  let tagNumber = job.buildConfig?.imageTagNumber || '';
  let tagText = job.buildConfig?.imageTagText || '';
  if ((!tagNumber && !tagText) && dc.imageTag) {
    const parts = String(dc.imageTag).split('-');
    tagNumber = parts[0] || '';
    tagText = parts.slice(1).join('-') || '';
  }
  $('jobImageTagNumber') && ($('jobImageTagNumber').value = tagNumber);
  $('jobImageTagText') && ($('jobImageTagText').value = tagText);
  const autoIncEl = $('jobAutoTagIncrement'); if (autoIncEl) autoIncEl.checked = !!(dc.autoTagIncrement || job.buildConfig?.autoTagIncrement);

  $('jobRegistryUrl') && ($('jobRegistryUrl').value = dc.registryUrl || '');
  $('jobRegistryUsername') && ($('jobRegistryUsername').value = dc.registryUsername || '');
  $('jobRegistryPassword') && ($('jobRegistryPassword').value = dc.registryPassword || '');

  // Script config (không còn nhập thủ công script path)
  $('jobScriptImageName') && ($('jobScriptImageName').value = job.buildConfig?.imageName || '');
  $('jobScriptImageTagNumber') && ($('jobScriptImageTagNumber').value = job.buildConfig?.imageTagNumber || '');
  $('jobScriptImageTagText') && ($('jobScriptImageTagText').value = job.buildConfig?.imageTagText || '');
  const autoIncScriptEl = $('jobScriptAutoTagIncrement'); if (autoIncScriptEl) autoIncScriptEl.checked = !!job.buildConfig?.autoTagIncrement;
  $('jobScriptRegistryUrl') && ($('jobScriptRegistryUrl').value = job.buildConfig?.registryUrl || '');
  $('jobScriptRegistryUsername') && ($('jobScriptRegistryUsername').value = job.buildConfig?.registryUsername || '');
  $('jobScriptRegistryPassword') && ($('jobScriptRegistryPassword').value = job.buildConfig?.registryPassword || '');

  // JSON Pipeline config
  $('jobJsonPipelinePath') && ($('jobJsonPipelinePath').value = job.buildConfig?.jsonPipelinePath || job.jsonPipelinePath || '');

  // Schedule
  const autoCheckEl = $('jobAutoCheck'); if (autoCheckEl) autoCheckEl.checked = !!job.schedule?.autoCheck;
  toggleScheduleConfig(!!job.schedule?.autoCheck);
  $('jobPolling') && ($('jobPolling').value = job.schedule?.polling || '30');
  $('jobCron') && ($('jobCron').value = job.schedule?.cron || '');

  // Services selections
  setTimeout(() => { // wait services rendered
    document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]').forEach(cb => {
      cb.checked = (job.services || []).includes(cb.getAttribute('data-service'));
    });
  }, 150);
}

export function resetJobForm() {
  ['jobName','jobDescription','jobGitAccount','jobGitToken','jobGitBranch','jobGitRepoUrl','jobDockerfilePath','jobContextPath','jobImageName','jobImageTagNumber','jobImageTagText','jobRegistryUrl','jobRegistryUsername','jobRegistryPassword','jobScriptImageName','jobScriptImageTagNumber','jobScriptImageTagText','jobScriptRegistryUrl','jobScriptRegistryUsername','jobScriptRegistryPassword','jobJsonPipelinePath','jobPolling','jobCron'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const enabledEl = $('jobEnabled'); if (enabledEl) enabledEl.checked = true;
  const dockerRadio = document.getElementById('jobMethodDocker'); if (dockerRadio) dockerRadio.checked = true;
  toggleBuildMethodConfig('dockerfile');
  document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]').forEach(cb => { cb.checked = false; });
}

export function toggleBuildMethodConfig(method) {
  const scriptCfg = $('jobScriptConfig');
  const dockerCfg = $('jobDockerConfig');
  const jsonCfg = $('jobJsonConfig');
  const servicesSec = $('servicesSection');
  if (method === 'script') {
    if (scriptCfg) scriptCfg.style.display = 'block';
    if (dockerCfg) dockerCfg.style.display = 'none';
    if (jsonCfg) jsonCfg.style.display = 'none';
    if (servicesSec) servicesSec.style.display = 'none';
  } else {
    if (scriptCfg) scriptCfg.style.display = 'none';
    if (dockerCfg) dockerCfg.style.display = method === 'dockerfile' ? 'block' : 'none';
    if (jsonCfg) jsonCfg.style.display = method === 'jsonfile' ? 'block' : 'none';
    if (servicesSec) servicesSec.style.display = method === 'dockerfile' ? 'block' : 'none';
  }
}

export function toggleScheduleConfig(show) {
  const sec = $('scheduleConfig');
  if (sec) sec.style.display = show ? 'block' : 'none';
}

export async function saveJob() {
  const id = state.editingJobId;
  const selectedMethod = document.querySelector('input[name="jobBuildMethod"]:checked')?.value || 'dockerfile';
  const buildOrder = $('jobBuildOrder')?.value || 'parallel';
  const dockerConfig = {
    dockerfilePath: $('jobDockerfilePath')?.value || '',
    contextPath: $('jobContextPath')?.value || '',
    imageName: $('jobImageName')?.value || '',
    imageTag: (function() {
      const num = $('jobImageTagNumber')?.value || '';
      const txt = $('jobImageTagText')?.value || '';
      if (!num && !txt) return '';
      return txt ? `${num}-${txt}` : num;
    })(),
    autoTagIncrement: !!$('jobAutoTagIncrement')?.checked,
    registryUrl: $('jobRegistryUrl')?.value || '',
    registryUsername: $('jobRegistryUsername')?.value || '',
    registryPassword: $('jobRegistryPassword')?.value || ''
  };
  const buildConfig = {
    method: selectedMethod,
    buildOrder,
    dockerConfig,
    scriptPath: ''
  };
  if (selectedMethod === 'script') {
    buildConfig.imageName = $('jobScriptImageName')?.value || '';
    buildConfig.imageTagNumber = $('jobScriptImageTagNumber')?.value || '';
    buildConfig.imageTagText = $('jobScriptImageTagText')?.value || '';
    buildConfig.autoTagIncrement = !!$('jobScriptAutoTagIncrement')?.checked;
    buildConfig.registryUrl = $('jobScriptRegistryUrl')?.value || '';
    buildConfig.registryUsername = $('jobScriptRegistryUsername')?.value || '';
    buildConfig.registryPassword = $('jobScriptRegistryPassword')?.value || '';
  }
  if (selectedMethod === 'jsonfile') {
    buildConfig.jsonPipelinePath = $('jobJsonPipelinePath')?.value || '';
  }
  const payload = {
    id,
    name: $('jobName')?.value || '',
    description: $('jobDescription')?.value || '',
    enabled: !!$('jobEnabled')?.checked,
    method: selectedMethod,
    git: {
      provider: $('jobGitProvider')?.value || 'gitlab',
      account: $('jobGitAccount')?.value || '',
      token: $('jobGitToken')?.value || '',
      branch: $('jobGitBranch')?.value || 'main',
      repoUrl: $('jobGitRepoUrl')?.value || '',
      // repoPath sẽ được xác định tự động dựa trên cấu hình contextInitPath (Context/Katalyst/repo)
    },
    buildConfig,
    docker: {
      // Nếu để trống, backend sẽ tự áp dụng: context = Context/Katalyst/repo; docker build sẽ dùng Dockerfile mặc định trong repo
      dockerfilePath: $('jobDockerfilePath')?.value || '',
      contextPath: $('jobContextPath')?.value || '',
      imageName: $('jobImageName')?.value || '',
      tag: {
        number: $('jobImageTagNumber')?.value || '',
        text: $('jobImageTagText')?.value || '',
        autoIncrement: !!$('jobAutoTagIncrement')?.checked,
      },
      registry: {
        url: $('jobRegistryUrl')?.value || '',
        username: $('jobRegistryUsername')?.value || '',
        password: $('jobRegistryPassword')?.value || '',
      },
    },
    script: {
      // path không còn nhập tay; hệ thống sẽ dùng build.sh trong thư mục builder theo tên job + job_id
      imageName: $('jobScriptImageName')?.value || '',
      tag: {
        number: $('jobScriptImageTagNumber')?.value || '',
        text: $('jobScriptImageTagText')?.value || '',
        autoIncrement: !!$('jobScriptAutoTagIncrement')?.checked,
      },
      registry: {
        url: $('jobScriptRegistryUrl')?.value || '',
        username: $('jobScriptRegistryUsername')?.value || '',
        password: $('jobScriptRegistryPassword')?.value || '',
      },
    },
    schedule: {
      autoCheck: !!$('jobAutoCheck')?.checked,
      polling: Number($('jobPolling')?.value || 30),
      cron: $('jobCron')?.value || '',
    },
    services: Array.from(document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]:checked')).map(cb => cb.getAttribute('data-service')),
  };
  const url = id ? `/api/jobs/${id}` : '/api/jobs';
  const method = id ? 'PUT' : 'POST';
  const { ok } = await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (ok) {
    hideJobModal();
    await loadJobs();
  }
}

export function editJob(jobId) {
  showJobModal(jobId);
}

export async function deleteJob(jobId) {
  const { ok } = await fetchJSON(`/api/jobs/${jobId}`, { method: 'DELETE' });
  if (ok) await loadJobs();
}

export async function runJob(jobId) {
  const { ok } = await fetchJSON(`/api/jobs/run/${jobId}`, { method: 'POST' });
  if (ok) {
    await loadJobs();
    await loadJobRelatedQueue();
  }
}

async function loadJobRelatedQueue() {
  try { const { loadQueueStatus } = await import('./queue.js'); await loadQueueStatus(); } catch (_) {}
}

export function searchJobs() {
  const term = $('jobSearch')?.value?.toLowerCase() || '';
  document.querySelectorAll('#jobsTableBody tr').forEach(tr => {
    const name = tr.children?.[0]?.textContent?.toLowerCase() || '';
    tr.style.display = name.includes(term) ? '' : 'none';
  });
}

// Expose for inline onclick in generated rows
window.runJob = runJob;
window.editJob = editJob;
window.deleteJob = deleteJob;

// Điền nhanh form Job từ cấu hình chung hiện tại
export function useCommonConfig() {
  const cfg = state.CURRENT_CFG || {};
  const selectedMethod = document.querySelector('input[name="jobBuildMethod"]:checked')?.value || 'dockerfile';

  // Git (nếu người dùng đang tạo job mới, có thể dùng provider/account/token/branch/repoUrl chung)
  $('jobGitProvider') && ($('jobGitProvider').value = cfg.provider || 'gitlab');
  $('jobGitAccount') && ($('jobGitAccount').value = cfg.account || '');
  $('jobGitToken') && ($('jobGitToken').value = cfg.token || '');
  $('jobGitBranch') && ($('jobGitBranch').value = cfg.branch || 'main');
  $('jobGitRepoUrl') && ($('jobGitRepoUrl').value = cfg.repoUrl || '');

  // Docker common config
  const dc = cfg.docker || {};
  $('jobDockerfilePath') && ($('jobDockerfilePath').value = dc.dockerfilePath || '');
  $('jobContextPath') && ($('jobContextPath').value = dc.contextPath || '');
  // Image name: ưu tiên điền nếu có
  if (selectedMethod === 'dockerfile') {
    $('jobImageName') && ($('jobImageName').value = dc.imageName || '');
    // Tag: tách number/text nếu là chuỗi đầy đủ
    const tag = dc.imageTag || '';
    let num = '', txt = '';
    if (tag) {
      const parts = String(tag).split('-');
      num = parts[0] || '';
      txt = parts.slice(1).join('-') || '';
    }
    $('jobImageTagNumber') && ($('jobImageTagNumber').value = num);
    $('jobImageTagText') && ($('jobImageTagText').value = txt);
    const autoIncEl = $('jobAutoTagIncrement'); if (autoIncEl) autoIncEl.checked = !!dc.autoTagIncrement;
    $('jobRegistryUrl') && ($('jobRegistryUrl').value = dc.registryUrl || '');
    $('jobRegistryUsername') && ($('jobRegistryUsername').value = dc.registryUsername || '');
    $('jobRegistryPassword') && ($('jobRegistryPassword').value = dc.registryPassword || '');
    // Cập nhật hiển thị tag preview nếu hàm global có
    try { window.updateJobTagPreview && window.updateJobTagPreview(); } catch (_) {}
  }

  if (selectedMethod === 'script') {
    // Dùng chung imageName/tag/registry từ cấu hình docker
    $('jobScriptImageName') && ($('jobScriptImageName').value = dc.imageName || '');
    const tag = dc.imageTag || '';
    let num = '', txt = '';
    if (tag) {
      const parts = String(tag).split('-');
      num = parts[0] || '';
      txt = parts.slice(1).join('-') || '';
    }
    $('jobScriptImageTagNumber') && ($('jobScriptImageTagNumber').value = num);
    $('jobScriptImageTagText') && ($('jobScriptImageTagText').value = txt);
    const autoIncEl = $('jobScriptAutoTagIncrement'); if (autoIncEl) autoIncEl.checked = !!dc.autoTagIncrement;
    $('jobScriptRegistryUrl') && ($('jobScriptRegistryUrl').value = dc.registryUrl || '');
    $('jobScriptRegistryUsername') && ($('jobScriptRegistryUsername').value = dc.registryUsername || '');
    $('jobScriptRegistryPassword') && ($('jobScriptRegistryPassword').value = dc.registryPassword || '');
    try { window.updateJobScriptTagPreview && window.updateJobScriptTagPreview(); } catch (_) {}
  }

  // JSON pipeline: không có cấu hình chung để auto điền. Người dùng nhập đường dẫn file thủ công.
}