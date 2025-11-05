// Basic tab switching. Loading logic will be handled by app.js
export function switchTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  // Remove active class from all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  // Show selected tab content
  const targetContent = document.getElementById(tabId);
  if (targetContent) {
    targetContent.classList.add('active');
  }
  // Add active class to clicked tab button
  const targetBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if (targetBtn) {
    targetBtn.classList.add('active');
  }
  // Store active tab in localStorage
  localStorage.setItem('activeTab', tabId);
}

// Preserve compatibility with any inline handlers
// (Some buttons in legacy HTML may call switchTab directly)
window.switchTab = switchTab;