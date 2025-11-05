// Simple DOM utilities and fetch helpers
export function $(id) {
  return document.getElementById(id);
}

export async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, data };
}

export function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

export function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}