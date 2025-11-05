import { $ } from './utils.js';
import { initTheme } from './theme.js';
import { switchTab } from './tabs.js';
import { loadBuildHistory, filterBuilds, refreshBuildHistory, clearBuildHistory, selectBuildMethod, runDockerBuild, runScriptBuild, runCheckPullBuild, startPull, addBuild, loadBuilds, loadVersions, hideModal, saveEditedBuild, runCheckConnection } from './builds.js';
import { loadConfig, loadDeployChoices, saveConfig } from './config.js';
import { loadRawConfigEditor, formatConfigJson, validateConfigJson, saveRawConfigJson, loadConfigVersions } from './raw-config.js';
import { loadSchedulerStatus, toggleScheduler, restartScheduler } from './scheduler.js';
import { openLogStream, appendLog } from './logs.js';
import { loadJobs, showJobModal, hideJobModal, saveJob, searchJobs, toggleBuildMethodConfig, toggleScheduleConfig, useCommonConfig } from './jobs.js';
import { loadQueueStatus, toggleQueueProcessing, saveQueueConfig, clearQueue } from './queue.js';
import { toggleAdvancedTaggingSection, toggleScriptAdvancedTaggingSection, updateTagPreview, updateScriptTagPreview, updateJobTagPreview, updateJobScriptTagPreview } from './tags.js';
import { selectAllServices, deselectAllServices } from './services.js';

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  // Sidebar tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) {
        switchTab(tabId);
        // Lazy load per tab
        if (tabId === 'builds-tab') { loadBuilds(); loadBuildHistory(); }
        if (tabId === 'raw-config-tab') { loadRawConfigEditor(); loadConfigVersions(); }
        if (tabId === 'jobs-tab') { loadJobs(); }
        if (tabId === 'queue-tab') { loadQueueStatus(); }
      }
    });
  });

  // Initialize selected tab and build method
  const savedTab = localStorage.getItem('activeTab') || 'config-tab';
  switchTab(savedTab);
  const savedMethod = localStorage.getItem('buildMethod') || 'dockerfile';
  selectBuildMethod(savedMethod);

  // Initial data
  loadDeployChoices().then(() => loadConfig()).catch(() => loadConfig());
  loadBuilds();
  loadVersions();
  loadBuildHistory();
  loadJobs();
  if (savedTab === 'raw-config-tab') { loadRawConfigEditor(); loadConfigVersions(); }

  // Tagging toggles
  const autoTagIncrementEl = $('autoTagIncrement');
  if (autoTagIncrementEl) autoTagIncrementEl.addEventListener('change', (e) => toggleAdvancedTaggingSection(e.target.checked));
  const scriptAutoTagIncrementEl = $('scriptAutoTagIncrement');
  if (scriptAutoTagIncrementEl) scriptAutoTagIncrementEl.addEventListener('change', (e) => toggleScriptAdvancedTaggingSection(e.target.checked));

  // Job management
  $('createJobBtn') && ($('createJobBtn').onclick = () => showJobModal());
  $('refreshJobsBtn') && ($('refreshJobsBtn').onclick = loadJobs);
  $('jobModalClose') && ($('jobModalClose').onclick = hideJobModal);
  $('saveJob') && ($('saveJob').onclick = saveJob);
  $('cancelJob') && ($('cancelJob').onclick = hideJobModal);
  // Sử dụng cấu hình chung để tự động điền form tạo Job
  $('useCommonConfigBtn') && ($('useCommonConfigBtn').onclick = useCommonConfig);
  $('jobSearch') && ($('jobSearch').oninput = searchJobs);
  $('selectAllServices') && ($('selectAllServices').onclick = selectAllServices);
  $('deselectAllServices') && ($('deselectAllServices').onclick = deselectAllServices);
  const jobAutoCheckbox = $('jobAutoCheck');
  if (jobAutoCheckbox) jobAutoCheckbox.addEventListener('change', (e) => toggleScheduleConfig(e.target.checked));
  document.querySelectorAll('input[name="jobBuildMethod"]').forEach(radio => {
    radio.addEventListener('change', (e) => toggleBuildMethodConfig(e.target.value));
  });
  const jobModal = $('jobModal');
  // Không đóng popup khi bấm ra ngoài nữa; chỉ đóng bằng nút "X" hoặc các nút được chỉ định rõ.
  // Nếu muốn khôi phục hành vi click ra ngoài để đóng, thêm lại handler cho jobModal tại đây.

  // General config and actions
  $('saveCfg') && ($('saveCfg').onclick = saveConfig);
  $('saveAllConfig') && ($('saveAllConfig').onclick = saveConfig);
  $('saveSystemConfig') && ($('saveSystemConfig').onclick = saveConfig);
  $('saveEmailConfig') && ($('saveEmailConfig').onclick = saveConfig);
  const testEmailBtn = $('testEmail');
  if (testEmailBtn) testEmailBtn.onclick = async () => {
    try {
      const toRaw = $('notifyEmails')?.value || '';
      const to = (toRaw || '').split(',').map(s => s.trim()).filter(Boolean)[0] || ($('emailUser')?.value || '');
      const res = await fetch('/api/email/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, subject: 'CI/CD Test Email', text: 'Đây là email test từ hệ thống CI/CD.' }) });
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

  $('checkConnection') && ($('checkConnection').onclick = runCheckConnection);
  $('startPull') && ($('startPull').onclick = startPull);
  $('addBuild') && ($('addBuild').onclick = addBuild);
  const clearLogsBtn = $('clearLogs');
  if (clearLogsBtn) clearLogsBtn.onclick = () => { const logsEl = $('logs'); if (logsEl) logsEl.innerHTML = ''; };
  const copyLogsBtn = $('copyLogs');
  if (copyLogsBtn) copyLogsBtn.onclick = async () => {
    const logsEl = $('logs');
    if (logsEl) {
      const lines = Array.from(logsEl.children).map(n => n.textContent).join('\n');
      try { await navigator.clipboard.writeText(lines); appendLog('[UI] Đã sao chép log vào clipboard'); } catch {}
    }
  };

  // Build actions
  $('saveDockerCfg') && ($('saveDockerCfg').onclick = saveConfig);
  $('runDockerBuild') && ($('runDockerBuild').onclick = runDockerBuild);
  $('runScriptBuild') && ($('runScriptBuild').onclick = runScriptBuild);
  $('checkPullBuild') && ($('checkPullBuild').onclick = runCheckPullBuild);

  // Raw config editor
  $('reloadConfigJson') && ($('reloadConfigJson').onclick = loadRawConfigEditor);
  $('formatConfigJson') && ($('formatConfigJson').onclick = formatConfigJson);
  $('validateConfigJson') && ($('validateConfigJson').onclick = validateConfigJson);
  $('saveConfigJson') && ($('saveConfigJson').onclick = saveRawConfigJson);
  $('loadConfigVersions') && ($('loadConfigVersions').onclick = loadConfigVersions);

  // Modal edit build
  $('editCancel') && ($('editCancel').onclick = hideModal);
  $('editCancelTop') && ($('editCancelTop').onclick = hideModal);
  $('modalBackdrop') && ($('modalBackdrop').onclick = hideModal);
  $('editSave') && ($('editSave').onclick = saveEditedBuild);

  // Build method selection
  document.querySelectorAll('input[name="buildMethod"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      selectBuildMethod(e.target.value);
      localStorage.setItem('buildMethod', e.target.value);
    });
  });

  // Build history table controls
  const buildSearch = document.getElementById('buildSearch');
  const statusFilter = document.getElementById('buildStatusFilter');
  $('refreshBuilds') && ($('refreshBuilds').onclick = refreshBuildHistory);
  $('clearBuildHistory') && ($('clearBuildHistory').onclick = clearBuildHistory);
  if (buildSearch) buildSearch.addEventListener('input', filterBuilds);
  if (statusFilter) statusFilter.addEventListener('change', filterBuilds);

  // Scheduler
  $('toggleScheduler') && ($('toggleScheduler').onclick = toggleScheduler);
  $('restartScheduler') && ($('restartScheduler').onclick = restartScheduler);
  loadSchedulerStatus();
  setInterval(loadSchedulerStatus, 10000);

  // Logs stream
  openLogStream();

  // Tag inputs
  $('imageTagNumber') && ($('imageTagNumber').addEventListener('input', updateTagPreview));
  $('imageTagText') && ($('imageTagText').addEventListener('input', updateTagPreview));
  $('scriptImageTagNumber') && ($('scriptImageTagNumber').addEventListener('input', updateScriptTagPreview));
  $('scriptImageTagText') && ($('scriptImageTagText').addEventListener('input', updateScriptTagPreview));
  $('jobImageTagNumber') && ($('jobImageTagNumber').addEventListener('input', updateJobTagPreview));
  $('jobImageTagText') && ($('jobImageTagText').addEventListener('input', updateJobTagPreview));
  $('jobScriptImageTagNumber') && ($('jobScriptImageTagNumber').addEventListener('input', updateJobScriptTagPreview));
  $('jobScriptImageTagText') && ($('jobScriptImageTagText').addEventListener('input', updateJobScriptTagPreview));

  // Queue
  $('toggleQueueBtn') && ($('toggleQueueBtn').addEventListener('click', toggleQueueProcessing));
  const saveQueueConfigBtn = $('saveQueueConfig') || $('saveQueueConfigBtn');
  if (saveQueueConfigBtn) saveQueueConfigBtn.addEventListener('click', saveQueueConfig);
  $('refreshQueueBtn') && ($('refreshQueueBtn').addEventListener('click', loadQueueStatus));
  $('clearQueueBtn') && ($('clearQueueBtn').addEventListener('click', clearQueue));
  loadQueueStatus();
  setInterval(loadQueueStatus, 5000);
});

// Global exports to keep backward compatibility with inline HTML handlers
window.selectBuildMethod = selectBuildMethod;
window.runDockerBuild = runDockerBuild;
window.runScriptBuild = runScriptBuild;
window.runCheckPullBuild = runCheckPullBuild;
window.runCheckConnection = runCheckConnection;
window.refreshBuilds = refreshBuildHistory;
window.clearBuildHistory = clearBuildHistory;
window.showJobModal = showJobModal;
window.hideJobModal = hideJobModal;
window.saveJob = saveJob;
window.toggleBuildMethodConfig = toggleBuildMethodConfig;
window.toggleScheduleConfig = toggleScheduleConfig;
window.toggleAdvancedTaggingSection = toggleAdvancedTaggingSection;
window.toggleScriptAdvancedTaggingSection = toggleScriptAdvancedTaggingSection;
window.updateTagPreview = updateTagPreview;
window.updateScriptTagPreview = updateScriptTagPreview;
window.updateJobTagPreview = updateJobTagPreview;
window.updateJobScriptTagPreview = updateJobScriptTagPreview;
window.toggleScheduler = toggleScheduler;
window.restartScheduler = restartScheduler;
window.loadRawConfigEditor = loadRawConfigEditor;
window.formatConfigJson = formatConfigJson;
window.validateConfigJson = validateConfigJson;
window.saveRawConfigJson = saveRawConfigJson;
window.loadConfigVersions = loadConfigVersions;
window.selectAllServices = selectAllServices;
window.deselectAllServices = deselectAllServices;