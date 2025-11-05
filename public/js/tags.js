import { $ } from './utils.js';

export function toggleAdvancedTaggingSection(show) {
  const sec = document.getElementById('advanced-tagging');
  if (sec) sec.style.display = show ? 'block' : 'none';
}

export function toggleScriptAdvancedTaggingSection(show) {
  const sec = document.getElementById('script-advanced-tagging');
  if (sec) sec.style.display = show ? 'block' : 'none';
}

function splitTag(tag) {
  const parts = String(tag || '').split('-');
  const number = parts[0] || '';
  const text = parts.slice(1).join('-') || '';
  return { number, text };
}

function combineTag(number, text) {
  const n = String(number || '').trim();
  const t = String(text || '').trim();
  return t ? `${n}-${t}` : n;
}

export function updateTagPreview() {
  const number = $('imageTagNumber')?.value || '';
  const text = $('imageTagText')?.value || '';
  const preview = $('tagPreview');
  if (preview) preview.textContent = combineTag(number, text);
}

export function updateScriptTagPreview() {
  const number = $('scriptImageTagNumber')?.value || '';
  const text = $('scriptImageTagText')?.value || '';
  const preview = $('scriptTagPreview');
  if (preview) preview.textContent = combineTag(number, text);
}

export function updateJobTagPreview() {
  const number = $('jobImageTagNumber')?.value || '';
  const text = $('jobImageTagText')?.value || '';
  const preview = $('jobTagPreview');
  if (preview) preview.textContent = combineTag(number, text);
}

export function updateJobScriptTagPreview() {
  const number = $('jobScriptImageTagNumber')?.value || '';
  const text = $('jobScriptImageTagText')?.value || '';
  const preview = $('jobScriptTagPreview');
  if (preview) preview.textContent = combineTag(number, text);
}