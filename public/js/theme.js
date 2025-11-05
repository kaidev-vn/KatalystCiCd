import { $ } from './utils.js';

export function applyTheme(theme) {
  const root = document.documentElement;
  const t = theme === 'dark' ? 'dark' : 'light';
  root.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  const toggle = $('themeToggle');
  if (toggle) toggle.textContent = t === 'dark' ? 'Chế độ sáng' : 'Chế độ tối';
}

export function initTheme() {
  const saved = localStorage.getItem('theme');
  applyTheme(saved || 'light');
  const toggle = $('themeToggle');
  if (toggle) {
    toggle.onclick = () => {
      const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      applyTheme(next);
    };
  }
}