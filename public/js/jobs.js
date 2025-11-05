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
    tr.innerHTML = `
      <td>${job.name}</td>
      <td><span class="status ${getStatusClass(lastBuildStatus)}">${getStatusText(lastBuildStatus)}</span></td>
      <td>${job.method === 'dockerfile' ? 'Dockerfile' : 'Script'}</td>
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
  $('jobGitProvider') && ($('jobGitProvider').value = job.git?.provider || 'gitlab');
  $('jobGitAccount') && ($('jobGitAccount').value = job.git?.account || '');
  $('jobGitToken') && ($('jobGitToken').value = job.git?.token || '');
  $('jobGitBranch') && ($('jobGitBranch').value = job.git?.branch || '');
  $('jobGitRepoUrl') && ($('jobGitRepoUrl').value = job.git?.repoUrl || '');
  $('jobGitRepoPath') && ($('jobGitRepoPath').value = job.git?.repoPath || '');

  // Method
  const isScript = job.method === 'script';
  const scriptRadio = document.getElementById('jobMethodScript');
  const dockerRadio = document.getElementById('jobMethodDocker');
  if (scriptRadio) scriptRadio.checked = isScript;
  if (dockerRadio) dockerRadio.checked = !isScript;
  toggleBuildMethodConfig(job.method);

  // Docker config
  $('jobDockerfilePath') && ($('jobDockerfilePath').value = job.docker?.dockerfilePath || './Dockerfile');
  $('jobContextPath') && ($('jobContextPath').value = job.docker?.contextPath || '.');
  $('jobImageName') && ($('jobImageName').value = job.docker?.imageName || '');

  $('jobImageTagNumber') && ($('jobImageTagNumber').value = job.docker?.tag?.number || '');
  $('jobImageTagText') && ($('jobImageTagText').value = job.docker?.tag?.text || '');
  const autoIncEl = $('jobAutoTagIncrement'); if (autoIncEl) autoIncEl.checked = !!job.docker?.tag?.autoIncrement;

  $('jobRegistryUrl') && ($('jobRegistryUrl').value = job.docker?.registry?.url || '');
  $('jobRegistryUsername') && ($('jobRegistryUsername').value = job.docker?.registry?.username || '');
  $('jobRegistryPassword') && ($('jobRegistryPassword').value = job.docker?.registry?.password || '');

  // Script config
  $('jobScriptPath') && ($('jobScriptPath').value = job.script?.path || '');
  $('jobScriptImageName') && ($('jobScriptImageName').value = job.script?.imageName || '');
  $('jobScriptImageTagNumber') && ($('jobScriptImageTagNumber').value = job.script?.tag?.number || '');
  $('jobScriptImageTagText') && ($('jobScriptImageTagText').value = job.script?.tag?.text || '');
  const autoIncScriptEl = $('jobScriptAutoTagIncrement'); if (autoIncScriptEl) autoIncScriptEl.checked = !!job.script?.tag?.autoIncrement;
  $('jobScriptRegistryUrl') && ($('jobScriptRegistryUrl').value = job.script?.registry?.url || '');
  $('jobScriptRegistryUsername') && ($('jobScriptRegistryUsername').value = job.script?.registry?.username || '');
  $('jobScriptRegistryPassword') && ($('jobScriptRegistryPassword').value = job.script?.registry?.password || '');

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
  ['jobName','jobDescription','jobGitAccount','jobGitToken','jobGitBranch','jobGitRepoUrl','jobGitRepoPath','jobDockerfilePath','jobContextPath','jobImageName','jobImageTagNumber','jobImageTagText','jobRegistryUrl','jobRegistryUsername','jobRegistryPassword','jobScriptPath','jobScriptImageName','jobScriptImageTagNumber','jobScriptImageTagText','jobScriptRegistryUrl','jobScriptRegistryUsername','jobScriptRegistryPassword','jobPolling','jobCron'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const enabledEl = $('jobEnabled'); if (enabledEl) enabledEl.checked = true;
  const dockerRadio = document.getElementById('jobMethodDocker'); if (dockerRadio) dockerRadio.checked = true;
  toggleBuildMethodConfig('dockerfile');
  document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]').forEach(cb => { cb.checked = false; });
}

export function toggleBuildMethodConfig(method) {
  const scriptCfg = $('jobScriptConfig');
  const dockerCfg = $('jobDockerConfig');
  if (method === 'script') {
    if (scriptCfg) scriptCfg.style.display = 'block';
    if (dockerCfg) dockerCfg.style.display = 'none';
  } else {
    if (scriptCfg) scriptCfg.style.display = 'none';
    if (dockerCfg) dockerCfg.style.display = 'block';
  }
}

export function toggleScheduleConfig(show) {
  const sec = $('scheduleConfig');
  if (sec) sec.style.display = show ? 'block' : 'none';
}

export async function saveJob() {
  const id = state.editingJobId;
  const payload = {
    id,
    name: $('jobName')?.value || '',
    description: $('jobDescription')?.value || '',
    enabled: !!$('jobEnabled')?.checked,
    method: document.querySelector('input[name="jobBuildMethod"]:checked')?.value || 'dockerfile',
    git: {
      provider: $('jobGitProvider')?.value || 'gitlab',
      account: $('jobGitAccount')?.value || '',
      token: $('jobGitToken')?.value || '',
      branch: $('jobGitBranch')?.value || 'main',
      repoUrl: $('jobGitRepoUrl')?.value || '',
      repoPath: $('jobGitRepoPath')?.value || '',
    },
    docker: {
      dockerfilePath: $('jobDockerfilePath')?.value || './Dockerfile',
      contextPath: $('jobContextPath')?.value || '.',
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
      path: $('jobScriptPath')?.value || '',
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