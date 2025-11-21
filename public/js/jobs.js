import { $, fetchJSON } from './utils.js';
import { state } from './state.js';
import { loadServicesForSelection, selectAllServices, deselectAllServices } from './services.js';
import { updateJobTagPreview, updateJobScriptTagPreview } from './tags.js';

// Helper to split a tag like "1.0.75-BETA" into number/text parts
function splitTagLocal(tag) {
  const parts = String(tag || '').split('-');
  const number = parts[0] || '';
  const text = parts.slice(1).join('-') || '';
  return { number, text };
}

// Apply common config from global state to the Job form
export function useCommonConfig() {
  const cfg = state.CURRENT_CFG;
  if (!cfg) {
    showErrorToast('Không có cấu hình chung để sử dụng. Vui lòng vào tab Cấu hình chung để lưu cấu hình trước.');
    return;
  }

  // Git
  $('jobGitProvider') && ($('jobGitProvider').value = cfg.provider || 'gitlab');
  $('jobGitAccount') && ($('jobGitAccount').value = cfg.account || '');
  $('jobGitToken') && ($('jobGitToken').value = cfg.token || '');
  $('jobGitBranch') && ($('jobGitBranch').value = cfg.branch || 'main');
  $('jobGitRepoUrl') && ($('jobGitRepoUrl').value = cfg.repoUrl || '');

  // Build method
  const buildMethod = cfg.buildMethod || 'dockerfile';
  const jobMethodScript = document.getElementById('jobMethodScript');
  const jobMethodDocker = document.getElementById('jobMethodDocker');
  const jobMethodJson = document.getElementById('jobMethodJson');
  if (jobMethodScript) jobMethodScript.checked = buildMethod === 'script';
  if (jobMethodDocker) jobMethodDocker.checked = buildMethod === 'dockerfile';
  if (jobMethodJson) jobMethodJson.checked = buildMethod === 'jsonfile';
  toggleBuildMethodConfig(buildMethod);

  // Docker config
  const d = cfg.docker || {};
  $('jobDockerfilePath') && ($('jobDockerfilePath').value = d.dockerfilePath || '');
  $('jobContextPath') && ($('jobContextPath').value = d.contextPath || '');
  $('jobImageName') && ($('jobImageName').value = d.imageName || '');
  const parts = splitTagLocal(d.imageTag || '');
  $('jobImageTagNumber') && ($('jobImageTagNumber').value = parts.number || '');
  $('jobImageTagText') && ($('jobImageTagText').value = parts.text || '');
  const autoIncEl = $('jobAutoTagIncrement'); if (autoIncEl) autoIncEl.checked = !!d.autoTagIncrement;
  $('jobRegistryUrl') && ($('jobRegistryUrl').value = d.registryUrl || '');
  $('jobRegistryUsername') && ($('jobRegistryUsername').value = d.registryUsername || '');
  $('jobRegistryPassword') && ($('jobRegistryPassword').value = d.registryPassword || '');

  // Script config mirrors Docker fields for image/tag/registry
  $('jobScriptImageName') && ($('jobScriptImageName').value = d.imageName || '');
  $('jobScriptImageTagNumber') && ($('jobScriptImageTagNumber').value = parts.number || '');
  $('jobScriptImageTagText') && ($('jobScriptImageTagText').value = parts.text || '');
  const autoIncScriptEl = $('jobScriptAutoTagIncrement'); if (autoIncScriptEl) autoIncScriptEl.checked = !!d.autoTagIncrement;
  $('jobScriptRegistryUrl') && ($('jobScriptRegistryUrl').value = d.registryUrl || '');
  $('jobScriptRegistryUsername') && ($('jobScriptRegistryUsername').value = d.registryUsername || '');
  $('jobScriptRegistryPassword') && ($('jobScriptRegistryPassword').value = d.registryPassword || '');

  // Update tag previews
  updateJobTagPreview();
  updateJobScriptTagPreview();

  showSuccessToast('Đã áp dụng cấu hình chung vào form Job.');
}

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

export async function showJobModal(jobId = null) {
  state.editingJobId = jobId;
  const modal = $('jobModal');
  
  // Ensure global config is loaded before showing modal
  if (!window.globalConfig) {
    try {
      const { loadConfig } = await import('./config.js');
      await loadConfig();
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }
  
  if (modal) {
    modal.style.display = 'block';
    modal.classList.add('show');
    
    // Thêm event listener để ngăn click ra ngoài đóng modal
    modal.addEventListener('click', handleModalClick);
  }
  
  if (jobId) {
    const job = state.jobs.find(j => j.id === jobId);
    if (job) populateJobForm(job);
  } else {
    resetJobForm();
    // Set default trigger method to 'polling' with visual state
    setTimeout(() => toggleTriggerMethodConfig('polling'), 50);
  }
  loadServicesForSelection();
}

function handleModalClick(e) {
  // Chỉ đóng modal nếu click vào backdrop (phần tử modal chính)
  if (e.target.id === 'jobModal') {
    // KHÔNG làm gì cả - ngăn đóng modal khi click ra ngoài
    e.stopPropagation();
  }
}

export function hideJobModal() {
  const modal = $('jobModal');
  
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
    
    // Xóa event listener
    modal.removeEventListener('click', handleModalClick);
  }
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
  const dockerCfg = job.docker?.dockerfilePath || job.docker?.contextPath || job.docker?.imageName
    ? {
        dockerfilePath: job.docker?.dockerfilePath,
        contextPath: job.docker?.contextPath,
        imageName: job.docker?.imageName,
        imageTag: (job.docker?.tag?.number || job.docker?.tag?.text) ? `${job.docker?.tag?.number || ''}${job.docker?.tag?.text ? '-' + job.docker?.tag?.text : ''}` : '',
        autoTagIncrement: !!job.docker?.tag?.autoIncrement,
        registryUrl: job.docker?.registry?.url,
        registryUsername: job.docker?.registry?.username,
        registryPassword: job.docker?.registry?.password,
      }
    : (job.buildConfig?.dockerConfig || {});

  $('jobDockerfilePath') && ($('jobDockerfilePath').value = dockerCfg.dockerfilePath || '');
  $('jobContextPath') && ($('jobContextPath').value = dockerCfg.contextPath || '');
  $('jobImageName') && ($('jobImageName').value = dockerCfg.imageName || '');

  const dockerTagParts = splitTagLocal(dockerCfg.imageTag || '');
  $('jobImageTagNumber') && ($('jobImageTagNumber').value = dockerTagParts.number || '');
  $('jobImageTagText') && ($('jobImageTagText').value = dockerTagParts.text || '');
  const autoIncEl = $('jobAutoTagIncrement'); if (autoIncEl) autoIncEl.checked = !!dockerCfg.autoTagIncrement;

  $('jobRegistryUrl') && ($('jobRegistryUrl').value = dockerCfg.registryUrl || '');
  $('jobRegistryUsername') && ($('jobRegistryUsername').value = dockerCfg.registryUsername || '');
  $('jobRegistryPassword') && ($('jobRegistryPassword').value = dockerCfg.registryPassword || '');

  // Script config (không còn nhập thủ công script path)
  // Trong file jobs.json, cấu hình script được lưu trong buildConfig: imageName, imageTagNumber, imageTagText, autoTagIncrement, registry*
  $('jobScriptImageName') && ($('jobScriptImageName').value = (job.script?.imageName || job.buildConfig?.imageName || ''));
  $('jobScriptImageTagNumber') && ($('jobScriptImageTagNumber').value = (job.script?.tag?.number || job.buildConfig?.imageTagNumber || ''));
  $('jobScriptImageTagText') && ($('jobScriptImageTagText').value = (job.script?.tag?.text || job.buildConfig?.imageTagText || ''));
  const autoIncScriptEl = $('jobScriptAutoTagIncrement'); if (autoIncScriptEl) autoIncScriptEl.checked = !!(job.script?.tag?.autoIncrement || job.buildConfig?.autoTagIncrement);
  $('jobScriptRegistryUrl') && ($('jobScriptRegistryUrl').value = (job.script?.registry?.url || job.buildConfig?.registryUrl || ''));
  $('jobScriptRegistryUsername') && ($('jobScriptRegistryUsername').value = (job.script?.registry?.username || job.buildConfig?.registryUsername || ''));
  $('jobScriptRegistryPassword') && ($('jobScriptRegistryPassword').value = (job.script?.registry?.password || job.buildConfig?.registryPassword || ''));

  // JSON Pipeline config
  $('jobJsonPipelinePath') && ($('jobJsonPipelinePath').value = job.buildConfig?.jsonPipelinePath || job.jsonPipelinePath || '');

  // Schedule - Trigger Method
  const triggerMethod = job.schedule?.triggerMethod || 'polling';
  const pollingRadio = document.getElementById('jobTriggerPolling');
  const webhookRadio = document.getElementById('jobTriggerWebhook');
  const hybridRadio = document.getElementById('jobTriggerHybrid');
  if (pollingRadio) pollingRadio.checked = triggerMethod === 'polling';
  if (webhookRadio) webhookRadio.checked = triggerMethod === 'webhook';
  if (hybridRadio) hybridRadio.checked = triggerMethod === 'hybrid';
  
  // Set initial 'selected' state for trigger method labels
  setTimeout(() => toggleTriggerMethodConfig(triggerMethod), 50);

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

  // Monolith configuration
  const monolithEl = $('jobMonolith');
  if (monolithEl) {
    monolithEl.checked = !!job.monolith;
    toggleMonolithConfig(!!job.monolith);
  }
  
  const monolithModuleEl = $('jobMonolithModule');
  if (monolithModuleEl) {
    monolithModuleEl.value = job.monolithConfig?.module || '';
  }
  
  const monolithChangePathEl = $('jobMonolithChangePath');
  if (monolithChangePathEl) {
    monolithChangePathEl.value = Array.isArray(job.monolithConfig?.changePath) 
      ? JSON.stringify(job.monolithConfig.changePath, null, 2)
      : '';
  }
}

export function resetJobForm() {
  ['jobName','jobDescription','jobGitAccount','jobGitToken','jobGitBranch','jobGitRepoUrl','jobDockerfilePath','jobContextPath','jobImageName','jobImageTagNumber','jobImageTagText','jobRegistryUrl','jobRegistryUsername','jobRegistryPassword','jobScriptImageName','jobScriptImageTagNumber','jobScriptImageTagText','jobScriptRegistryUrl','jobScriptRegistryUsername','jobScriptRegistryPassword','jobJsonPipelinePath','jobPolling','jobCron','jobMonolithModule','jobMonolithChangePath'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const enabledEl = $('jobEnabled'); if (enabledEl) enabledEl.checked = true;
  const dockerRadio = document.getElementById('jobMethodDocker'); if (dockerRadio) dockerRadio.checked = true;
  toggleBuildMethodConfig('dockerfile');
  
  // Reset trigger method to polling
  const pollingRadio = document.getElementById('jobTriggerPolling');
  if (pollingRadio) pollingRadio.checked = true;
  toggleTriggerMethodConfig('polling');
  
  // Reset monolith config
  const monolithEl = $('jobMonolith'); if (monolithEl) monolithEl.checked = false;
  toggleMonolithConfig(false);
  
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

export function toggleMonolithConfig(show) {
  const monolithConfig = $('monolithConfig');
  if (monolithConfig) {
    monolithConfig.style.display = show ? 'block' : 'none';
  }
}

export function toggleTriggerMethodConfig(method) {
  const autoCheckGroup = $('autoCheckGroup');
  const autoCheckEl = $('jobAutoCheck');
  const scheduleConfig = $('scheduleConfig');
  const hint = $('triggerMethodHint');
  const webhookConfigInfo = $('webhookConfigInfo');
  
  // Update visual state of trigger method options
  const pollingLabel = $('triggerPollingLabel');
  const webhookLabel = $('triggerWebhookLabel');
  const hybridLabel = $('triggerHybridLabel');
  
  // Remove 'selected' class from all
  if (pollingLabel) pollingLabel.classList.remove('selected');
  if (webhookLabel) webhookLabel.classList.remove('selected');
  if (hybridLabel) hybridLabel.classList.remove('selected');
  
  // Add 'selected' class to active option
  if (method === 'webhook') {
    if (webhookLabel) webhookLabel.classList.add('selected');
    // Webhook: Không cần polling
    if (autoCheckGroup) autoCheckGroup.style.display = 'none';
    if (scheduleConfig) scheduleConfig.style.display = 'none';
    if (autoCheckEl) autoCheckEl.checked = false;
    if (hint) hint.textContent = '⚡ Webhook mode: Nhận events trực tiếp từ GitLab/GitHub. Zero overhead, instant builds!';
    if (webhookConfigInfo) webhookConfigInfo.style.display = 'block';
    updateWebhookUrl();
  } else if (method === 'hybrid') {
    if (hybridLabel) hybridLabel.classList.add('selected');
    // Hybrid: Webhook primary + Polling fallback
    if (autoCheckGroup) autoCheckGroup.style.display = 'block';
    if (hint) hint.textContent = '🛡️ Hybrid mode: Webhook (instant) + Polling fallback. Khuyến nghị polling 300-600s.';
    if (webhookConfigInfo) webhookConfigInfo.style.display = 'block';
    updateWebhookUrl();
    // Show schedule config if autoCheck is checked
    if (autoCheckEl && autoCheckEl.checked) {
      if (scheduleConfig) scheduleConfig.style.display = 'block';
    }
  } else {
    if (pollingLabel) pollingLabel.classList.add('selected');
    // Polling: Traditional mode
    if (autoCheckGroup) autoCheckGroup.style.display = 'block';
    if (hint) hint.textContent = '📡 Polling mode: Check Git repository theo chu kỳ. Simple nhưng tốn tài nguyên.';
    if (webhookConfigInfo) webhookConfigInfo.style.display = 'none';
    // Show schedule config if autoCheck is checked
    if (autoCheckEl && autoCheckEl.checked) {
      if (scheduleConfig) scheduleConfig.style.display = 'block';
    }
  }
}

// Update webhook URL based on selected Git provider
export function updateWebhookUrl() {
  const gitProvider = $('jobGitProvider')?.value || 'gitlab';
  const webhookUrlDisplay = $('webhookUrlDisplay');
  const gitlabInstructions = $('gitlabInstructions');
  const githubInstructions = $('githubInstructions');
  
  // Get current server URL (in production, this should be your public domain)
  const serverUrl = window.location.origin;
  const webhookPath = gitProvider === 'github' ? '/webhook/github' : '/webhook/gitlab';
  const fullWebhookUrl = `${serverUrl}${webhookPath}`;
  
  if (webhookUrlDisplay) {
    webhookUrlDisplay.value = fullWebhookUrl;
  }
  
  // Show appropriate instructions
  if (gitlabInstructions && githubInstructions) {
    if (gitProvider === 'github') {
      gitlabInstructions.style.display = 'none';
      githubInstructions.style.display = 'block';
    } else {
      gitlabInstructions.style.display = 'block';
      githubInstructions.style.display = 'none';
    }
  }
}

// Copy webhook URL to clipboard
export function copyWebhookUrl() {
  const webhookUrlDisplay = $('webhookUrlDisplay');
  if (webhookUrlDisplay) {
    webhookUrlDisplay.select();
    document.execCommand('copy');
    showSuccessToast('✅ Webhook URL đã được copy vào clipboard!');
  }
}

// Show webhook secret (fetch from API)
export async function showWebhookSecret() {
  const webhookSecretDisplay = $('webhookSecretDisplay');
  if (webhookSecretDisplay) {
    try {
      const { ok, data } = await fetchJSON('/api/webhook/config');
      if (ok && data?.secret) {
        webhookSecretDisplay.value = data.secret;
        webhookSecretDisplay.type = 'text';
        setTimeout(() => {
          if (confirm('⚠️ Secret token đang hiển thị!\n\nẤn OK để copy vào clipboard, Cancel để ẩn lại.')) {
            webhookSecretDisplay.select();
            document.execCommand('copy');
            showSuccessToast('✅ Secret token đã được copy!');
          }
          webhookSecretDisplay.type = 'password';
          webhookSecretDisplay.value = '••••••••••••••••';
        }, 100);
      } else {
        showErrorToast('❌ Không thể lấy webhook secret. Vui lòng kiểm tra file .env hoặc app.js');
      }
    } catch (error) {
      console.error('Error fetching webhook config:', error);
      showErrorToast('❌ Lỗi khi lấy webhook config: ' + error.message);
    }
  }
}

/**
 * Validate job form before saving
 * @returns {Array<string>} Array of error messages (empty if valid)
 */
export function validateJobForm() {
  const errors = [];
  const method = document.querySelector('input[name="jobBuildMethod"]:checked')?.value || 'dockerfile';
  const triggerMethod = document.querySelector('input[name="jobTriggerMethod"]:checked')?.value || 'polling';
  
  // 1. Job name (required)
  const jobName = $('jobName')?.value?.trim();
  if (!jobName) {
    errors.push('❌ Tên job là bắt buộc');
  }
  
  // 2. Git configuration (required except for jsonfile method)
  if (method !== 'jsonfile') {
    const repoUrl = $('jobGitRepoUrl')?.value?.trim();
    const branch = $('jobGitBranch')?.value?.trim();
    const token = $('jobGitToken')?.value?.trim();
    
    if (!repoUrl) {
      errors.push('❌ Repository URL là bắt buộc');
    }
    if (!branch) {
      errors.push('❌ Branch là bắt buộc');
    }
    if (!token) {
      errors.push('⚠️ Access Token khuyến nghị để clone private repository');
    }
  }
  
  // 3. Build method specific validation
  if (method === 'dockerfile') {
    // Services selection (required)
    const selectedServices = document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]:checked');
    if (selectedServices.length === 0) {
      errors.push('❌ Phải chọn ít nhất 1 service để build');
    }
    
    // Image name (required)
    const imageName = $('jobImageName')?.value?.trim();
    if (!imageName) {
      errors.push('❌ Image Name là bắt buộc cho Docker build');
    }
  } else if (method === 'script') {
    // Image name (required for script builds)
    const scriptImageName = $('jobScriptImageName')?.value?.trim();
    if (!scriptImageName) {
      errors.push('❌ Image Name là bắt buộc cho Script build');
    }
  } else if (method === 'jsonfile') {
    // JSON Pipeline path - if not provided, leave empty for backend to auto-generate
    const pipelinePath = $('jobJsonPipelinePath')?.value?.trim();
    if (!pipelinePath) {
      // Leave empty to allow backend to auto-generate repository-specific path
      if ($('jobJsonPipelinePath')) $('jobJsonPipelinePath').value = '';
    }
  }
  
  // 4. Trigger method validation
  if ((triggerMethod === 'polling' || triggerMethod === 'hybrid') && $('jobAutoCheck')?.checked) {
    const polling = Number($('jobPolling')?.value || 0);
    
    if (polling < 5) {
      errors.push('❌ Polling interval phải >= 5 giây');
    }
    
    if (triggerMethod === 'hybrid' && polling < 60) {
      errors.push('⚠️ Hybrid mode khuyến nghị polling >= 60 giây (tốt nhất 300-600s)');
    }
    
    if (triggerMethod === 'polling' && polling < 30) {
      errors.push('⚠️ Polling mode khuyến nghị interval >= 30 giây để tránh rate limit');
    }
  }
  
  return errors;
}

export async function saveJob() {
  // Validate form first
  const validationErrors = validateJobForm();
  
  if (validationErrors.length > 0) {
    const errorMessage = '❌ Lỗi validation:\n\n' + validationErrors.join('\n');
    showErrorToast(errorMessage);
    return;
  }
  
  const id = state.editingJobId;
  const selectedMethod = document.querySelector('input[name="jobBuildMethod"]:checked')?.value || 'dockerfile';
  const buildOrder = $('jobBuildOrder')?.value || 'parallel';
  
  // ✅ Clean payload structure - Only send gitConfig and buildConfig (no duplicates)
  const payload = {
    // ❌ Don't send id when creating new job (backend will generate)
    ...(id ? { id } : {}),
    
    name: ($('jobName')?.value || '').trim(),
    description: ($('jobDescription')?.value || '').trim(),
    enabled: !!$('jobEnabled')?.checked,
    
    // ✅ Use gitConfig (not git)
    gitConfig: {
      provider: $('jobGitProvider')?.value || 'gitlab',
      account: ($('jobGitAccount')?.value || '').trim(),
      token: ($('jobGitToken')?.value || '').trim(),
      branch: ($('jobGitBranch')?.value || '').trim() || 'main',
      // For jsonfile method, only send repoUrl if it's not empty
      repoUrl: selectedMethod === 'jsonfile' ? 
        (($('jobGitRepoUrl')?.value || '').trim() || undefined) : 
        ($('jobGitRepoUrl')?.value || '').trim()
      // repoPath will be auto-generated: {contextInitPath}/Katalyst/repo
    },
    
    // ✅ Use buildConfig only (no separate docker/script objects)
    buildConfig: (() => {
      const config = {
        method: selectedMethod,
        buildOrder: buildOrder
      };
      
      // Add method-specific configuration
      if (selectedMethod === 'dockerfile') {
        config.dockerConfig = {
          dockerfilePath: ($('jobDockerfilePath')?.value || '').trim(),
          contextPath: ($('jobContextPath')?.value || '').trim(),
          imageName: ($('jobImageName')?.value || '').trim(),
          imageTag: (() => {
            const num = ($('jobImageTagNumber')?.value || '').trim();
            const txt = ($('jobImageTagText')?.value || '').trim();
            return txt ? `${num}-${txt}` : num;
          })(),
          autoTagIncrement: !!$('jobAutoTagIncrement')?.checked,
          registryUrl: ($('jobRegistryUrl')?.value || '').trim(),
          registryUsername: ($('jobRegistryUsername')?.value || '').trim(),
          registryPassword: $('jobRegistryPassword')?.value || ''
        };
      } else if (selectedMethod === 'script') {
        // Script-specific fields in buildConfig (not separate script object)
        config.imageName = ($('jobScriptImageName')?.value || '').trim();
        config.imageTagNumber = ($('jobScriptImageTagNumber')?.value || '').trim();
        config.imageTagText = ($('jobScriptImageTagText')?.value || '').trim();
        config.autoTagIncrement = !!$('jobScriptAutoTagIncrement')?.checked;
        config.registryUrl = ($('jobScriptRegistryUrl')?.value || '').trim();
        config.registryUsername = ($('jobScriptRegistryUsername')?.value || '').trim();
        config.registryPassword = $('jobScriptRegistryPassword')?.value || '';
        // scriptPath will be auto-generated by backend
      } else if (selectedMethod === 'jsonfile') {
        config.jsonPipelinePath = ($('jobJsonPipelinePath')?.value || '').trim();
      }
      
      return config;
    })(),
    
    schedule: {
      triggerMethod: document.querySelector('input[name="jobTriggerMethod"]:checked')?.value || 'polling',
      autoCheck: !!$('jobAutoCheck')?.checked,
      polling: Number($('jobPolling')?.value || 30),
      cron: ($('jobCron')?.value || '').trim()
    },
    
    services: Array.from(
      document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]:checked')
    ).map(cb => cb.getAttribute('data-service')),
    
    // Monolith configuration
    monolith: !!$('jobMonolith')?.checked,
    monolithConfig: {
      module: ($('jobMonolithModule')?.value || '').trim(),
      changePath: (() => {
        try {
          const changePathValue = ($('jobMonolithChangePath')?.value || '').trim();
          if (!changePathValue) return [];
          return JSON.parse(changePathValue);
        } catch (e) {
          console.error('Invalid monolith changePath JSON:', e);
          return [];
        }
      })()
    }
  };
  const url = id ? `/api/jobs/${id}` : '/api/jobs';
  const method = id ? 'PUT' : 'POST';
  const res = await fetchJSON(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res.ok) {
    hideJobModal();
    await loadJobs();
  } else {
    // Show validation errors from server to help user adjust inputs
    const msg = res?.data?.error || 'Không thể lưu Job. Vui lòng kiểm tra lại các trường bắt buộc.';
    showErrorToast(msg + (res?.data?.details ? `\n- ${res.data.details.join('\n- ')}` : ''));
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
  const { ok } = await fetchJSON(`/api/jobs/${jobId}/run`, { method: 'POST' });
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

// Expose for inline onclick/onchange in generated rows and form
window.runJob = runJob;
window.editJob = editJob;
window.deleteJob = deleteJob;
window.toggleTriggerMethodConfig = toggleTriggerMethodConfig;
window.toggleScheduleConfig = toggleScheduleConfig;
window.updateWebhookUrl = updateWebhookUrl;
window.copyWebhookUrl = copyWebhookUrl;
window.showWebhookSecret = showWebhookSecret;
