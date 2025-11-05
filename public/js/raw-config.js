import { $, fetchJSON } from './utils.js';

export async function loadRawConfigEditor() {
  try {
    const res = await fetch('/api/config/raw');
    const text = await res.text();
    const editor = $('configJsonEditor');
    if (editor) editor.value = text;
    const status = $('configJsonStatus');
    if (status) status.textContent = 'Đã tải config.json';
  } catch (e) {
    const status = $('configJsonStatus');
    if (status) status.textContent = `Lỗi tải: ${e.message || e}`;
  }
}

export function formatConfigJson() {
  const editor = $('configJsonEditor');
  if (!editor) return;
  try {
    const obj = JSON.parse(editor.value);
    editor.value = JSON.stringify(obj, null, 2);
    const status = $('configJsonStatus');
    if (status) status.textContent = 'JSON đã được format';
  } catch (e) {
    const status = $('configJsonStatus');
    if (status) status.textContent = `JSON không hợp lệ: ${e.message || e}`;
  }
}

export function validateConfigJson() {
  const editor = $('configJsonEditor');
  if (!editor) return;
  try {
    JSON.parse(editor.value);
    const status = $('configJsonStatus');
    if (status) status.textContent = 'JSON hợp lệ';
  } catch (e) {
    const status = $('configJsonStatus');
    if (status) status.textContent = `JSON không hợp lệ: ${e.message || e}`;
  }
}

export async function saveRawConfigJson() {
  const editor = $('configJsonEditor');
  if (!editor) return;
  try {
    const body = editor.value;
    const res = await fetch('/api/config/raw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const data = await res.json().catch(() => ({}));
    const status = $('configJsonStatus');
    if (status) status.textContent = data.ok ? 'Đã lưu config.json' : `Lỗi: ${data.error || ''}`;
  } catch (e) {
    const status = $('configJsonStatus');
    if (status) status.textContent = `Lỗi lưu: ${e.message || e}`;
  }
}

export async function loadConfigVersions() {
  const { ok, data } = await fetchJSON('/api/config/versions');
  if (!ok) return;
  renderConfigVersions(data || []);
}

export function renderConfigVersions(list) {
  const ul = $('configVersionsList');
  if (!ul) return;
  ul.innerHTML = '';
  list.forEach(item => {
    const file = typeof item === 'string' ? item : (item?.file || '');
    const li = document.createElement('li');
    li.className = 'config-version-item';
    li.innerHTML = `
      <div class="version-row">
        <span class="file-name">${file}</span>
        <div class="actions">
          <button class="btn small outline" data-file="${file}" data-action="rollback">Khôi phục</button>
          <button class="btn small danger" data-file="${file}" data-action="delete">🗑️ Xóa</button>
        </div>
      </div>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('button[data-file]').forEach(btn => {
    btn.addEventListener('click', () => {
      const file = btn.getAttribute('data-file');
      const action = btn.getAttribute('data-action');
      if (action === 'delete') deleteConfigVersion(file);
      else rollbackConfigVersion(file);
    });
  });
}

export async function rollbackConfigVersion(file) {
  const { ok, data } = await fetchJSON('/api/config/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
  });
  const status = $('configJsonStatus');
  if (status) status.textContent = ok ? 'Đã khôi phục phiên bản' : `Lỗi: ${data?.error || ''}`;
}

export async function deleteConfigVersion(file) {
  try {
    if (!file) return;
    if (!confirm(`Bạn có chắc muốn xóa phiên bản "${file}"? Hành động này không thể hoàn tác.`)) return;
    const { ok, data } = await fetchJSON('/api/config/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    const status = $('configJsonStatus');
    if (status) status.textContent = ok ? 'Đã xoá phiên bản cấu hình' : `Lỗi: ${data?.error || ''}`;
    if (ok) loadConfigVersions();
  } catch (e) {
    const status = $('configJsonStatus');
    if (status) status.textContent = `Lỗi: ${e.message || e}`;
  }
}