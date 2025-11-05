import { $, fetchJSON } from './utils.js';

export async function loadServicesForSelection() {
  const { ok, data } = await fetchJSON('/api/config');
  if (!ok) return;
  // Backend ConfigService exposes services under top-level key `deployServices`
  const services = Array.isArray(data?.deployServices)
    ? data.deployServices
    : (Array.isArray(data?.deploy?.services) ? data.deploy.services : []);
  renderServicesCheckboxes(services);
}

export function renderServicesCheckboxes(services) {
  const container = $('servicesCheckboxes');
  if (!container) return;
  container.innerHTML = '';
  services.forEach(service => {
    const name = service?.name || '';
    if (!name) return;
    const id = `svc_${name.replace(/[^a-z0-9_-]+/gi, '_')}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'service-item';
    wrapper.innerHTML = `
      <input type="checkbox" id="${id}" data-service="${name}" />
      <label for="${id}">${name}</label>
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