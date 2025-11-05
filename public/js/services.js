import { $, fetchJSON } from './utils.js';

export async function loadServicesForSelection() {
  const { ok, data } = await fetchJSON('/api/config');
  const services = data?.deploy?.services || [];
  if (ok) renderServicesCheckboxes(services);
}

export function renderServicesCheckboxes(services) {
  const container = $('servicesCheckboxes');
  if (!container) return;
  container.innerHTML = '';
  services.forEach(service => {
    const id = `svc_${service.name}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'service-item';
    wrapper.innerHTML = `
      <input type="checkbox" id="${id}" data-service="${service.name}" />
      <label for="${id}">${service.name}</label>
    `;
    container.appendChild(wrapper);
  });
}

export function selectAllServices() {
  document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]').forEach(cb => { cb.checked = true; });
}

export function deselectAllServices() {
  document.querySelectorAll('#servicesCheckboxes input[type="checkbox"]').forEach(cb => { cb.checked = false; });
}