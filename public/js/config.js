import { $, fetchJSON } from './utils.js';
import { state } from './state.js';

export function populateDeployChoices(choices) {
  const select = $('deployChoices');
  if (!select) return;
  select.innerHTML = '';
  for (const ch of (choices || [])) {
    const opt = document.createElement('option');
    opt.value = ch.value; opt.textContent = ch.label || ch.value;
    select.appendChild(opt);
  }
}

export async function loadDeployChoices(pathOverride) {
  try {
    const url = '/api/deploy/choices' + (pathOverride ? `?path=${encodeURIComponent(pathOverride)}` : '');
    const { ok, data } = await fetchJSON(url);
    if (ok) populateDeployChoices(data || []);
  } catch (_) {}
}

export async function loadConfig() {
  try {
    const { ok, data } = await fetchJSON('/api/config');
    if (!ok || !data) return;
    state.CURRENT_CFG = data;
    // Populate Git/general fields
    $('provider')?.setAttribute('value', data.provider || 'gitlab');
    const providerEl = $('provider'); if (providerEl) providerEl.value = data.provider || 'gitlab';
    const pollingEl = $('polling'); if (pollingEl) pollingEl.value = data.polling || '';
    $('account')?.setAttribute('value', data.account || ''); const accountEl = $('account'); if (accountEl) accountEl.value = data.account || '';
    const tokenEl = $('token'); if (tokenEl) tokenEl.value = data.token || '';
    const repoUrlEl = $('repoUrl'); if (repoUrlEl) repoUrlEl.value = data.repoUrl || '';
    const repoPathEl = $('repoPath'); if (repoPathEl) repoPathEl.value = data.repoPath || '';
    const contextInitEl = $('contextInitPath'); if (contextInitEl) contextInitEl.value = data.contextInitPath || '';
    const branchEl = $('branch'); if (branchEl) branchEl.value = data.branch || '';

    // Email config (align keys with backend ConfigService)
    $('smtpHost') && ($('smtpHost').value = data.email?.smtpHost || '');
    $('smtpPort') && ($('smtpPort').value = data.email?.smtpPort || '');
    $('emailUser') && ($('emailUser').value = data.email?.emailUser || '');
    $('emailPassword') && ($('emailPassword').value = data.email?.emailPassword || '');
    $('notifyEmails') && ($('notifyEmails').value = (data.email?.notifyEmails || []).join(', '));
    const enableEmailEl = $('enableEmailNotify'); if (enableEmailEl) enableEmailEl.checked = !!data.email?.enableEmailNotify;

    // System config (đọc từ các khoá top-level theo chuẩn backend ConfigService)
    $('maxConcurrentBuilds') && ($('maxConcurrentBuilds').value = String(data.maxConcurrentBuilds ?? '1'));
    $('buildTimeout') && ($('buildTimeout').value = String(data.buildTimeout ?? '30'));
    $('logRetentionDays') && ($('logRetentionDays').value = String(data.logRetentionDays ?? '30'));
    $('diskSpaceThreshold') && ($('diskSpaceThreshold').value = String(data.diskSpaceThreshold ?? '80'));
  } catch (e) {
    console.error(e);
  }
}

export async function saveConfig() {
  try {
    const payload = {
      provider: $('provider')?.value || 'gitlab',
      polling: Number($('polling')?.value || 0) || undefined,
      account: $('account')?.value || '',
      token: $('token')?.value || '',
      repoUrl: $('repoUrl')?.value || '',
      repoPath: $('repoPath')?.value || '',
      contextInitPath: $('contextInitPath')?.value || '',
      branch: $('branch')?.value || '',
      // Email config payload must match backend keys
      email: {
        smtpHost: $('smtpHost')?.value || '',
        smtpPort: Number($('smtpPort')?.value || 0) || undefined,
        emailUser: $('emailUser')?.value || '',
        emailPassword: $('emailPassword')?.value || '',
        enableEmailNotify: !!$('enableEmailNotify')?.checked,
        notifyEmails: ($('notifyEmails')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
      },
      // System config: gửi đúng theo khoá top-level backend mong đợi
      maxConcurrentBuilds: Number($('maxConcurrentBuilds')?.value || 1),
      buildTimeout: Number($('buildTimeout')?.value || 30),
      logRetentionDays: Number($('logRetentionDays')?.value || 30),
      diskSpaceThreshold: Number($('diskSpaceThreshold')?.value || 80),
    };
    const { ok, data } = await fetchJSON('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const cfgStatusEl = $('cfgStatus');
    if (cfgStatusEl) cfgStatusEl.textContent = ok ? 'Đã lưu cấu hình' : `Lỗi lưu: ${data?.error || ''}`;
    // After saving config, optionally initialize context directory structure
    const basePath = $('contextInitPath')?.value?.trim();
    if (ok && basePath) {
      try {
        const initRes = await fetchJSON('/api/config/init-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ basePath }),
        });
        if (cfgStatusEl) cfgStatusEl.textContent = initRes.ok
          ? 'Đã lưu cấu hình và khởi tạo Context (Katalyst/repo, Katalyst/builder)'
          : `Đã lưu cấu hình, nhưng khởi tạo Context thất bại: ${initRes.data?.error || ''}`;
      } catch (e) {
        if (cfgStatusEl) cfgStatusEl.textContent = `Đã lưu cấu hình, nhưng khởi tạo Context thất bại: ${e.message || e}`;
      }
    }
    setTimeout(() => { if (cfgStatusEl) cfgStatusEl.textContent = ''; }, 3000);
  } catch (e) {
    const cfgStatusEl = $('cfgStatus');
    if (cfgStatusEl) cfgStatusEl.textContent = `Lỗi: ${e.message || e}`;
    setTimeout(() => { if (cfgStatusEl) cfgStatusEl.textContent = ''; }, 3000);
  }
}