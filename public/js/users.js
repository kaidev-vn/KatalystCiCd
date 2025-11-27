
import { auth } from './auth.js';

export const userManager = {
  initialized: false,

  init() {
    console.log('[Users] Initializing...');
    if (!auth.isAdmin()) {
      console.warn('[Users] Not admin, skipping init');
      return;
    }
    
    if (!this.initialized) {
      console.log('[Users] Binding events');
      this.bindEvents();
      this.initialized = true;
    }

    // Initial load if tab is active
    const tab = document.getElementById('users-tab');
    if (tab && tab.classList.contains('active')) {
      console.log('[Users] Tab active on init, loading users');
      this.loadUsers();
    } else {
      console.log('[Users] Tab not active on init');
    }
  },

  bindEvents() {
    // Tab switch listener handled globally in main.js/app.js, but we can hook into it if needed
    // For now, we rely on loadUsers being called when needed
    
    // Explicitly listen for tab clicks as a backup
    document.querySelectorAll('[data-tab="users-tab"]').forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('[Users] Tab clicked, loading users...');
        this.loadUsers();
      });
    });

    document.getElementById('addUserBtn')?.addEventListener('click', () => {
      this.openModal();
    });

    document.getElementById('userModalClose')?.addEventListener('click', () => {
      this.closeModal();
    });
    
    document.getElementById('cancelUserBtn')?.addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('saveUserBtn')?.addEventListener('click', () => {
      this.saveUser();
    });

    document.getElementById('modalUserRole')?.addEventListener('change', (e) => {
      this.updatePermissionsInfo(e.target.value);
    });

    // Explicitly listen for tab clicks to ensure data loads
    const tabBtn = document.querySelector('[data-tab="users-tab"]');
    if (tabBtn) {
      tabBtn.addEventListener('click', () => {
        // Short timeout to allow UI to switch first
        setTimeout(() => this.loadUsers(), 50);
      });
    }
  },

  async loadUsers() {
    console.log('[Users] Loading users...');
    try {
      // Add timestamp to prevent caching
      const response = await fetch(`/api/users?t=${Date.now()}`);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to load users: ${response.status} ${errText}`);
      }
      
      const result = await response.json();
      if (result.success) {
        console.log('[Users] Loaded', result.data.length, 'users');
        this.renderUsers(result.data);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      // Show toast error
      if (typeof window.showErrorToast === 'function') {
        window.showErrorToast('Failed to load users: ' + error.message);
      }
    }
  },

  renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = users.map(user => `
      <tr>
        <td>
          <div class="user-name-cell">
            <span class="font-medium">${this.escapeHtml(user.username)}</span>
          </div>
        </td>
        <td>${this.escapeHtml(user.email || '-')}</td>
        <td>
          <span class="status-badge ${this.getRoleBadgeClass(user.role)}">
            ${user.role.toUpperCase()}
          </span>
        </td>
        <td class="text-muted text-sm">
          ${new Date(user.created_at).toLocaleDateString()}
        </td>
        <td>
          <div class="action-group">
            <button class="btn-icon primary" onclick="window.userManager.editUser('${user.id}')" title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            ${user.username !== 'admin' ? `
            <button class="btn-icon danger" onclick="window.userManager.deleteUser('${user.id}', '${user.username}')" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  getRoleBadgeClass(role) {
    switch(role) {
      case 'admin': return 'running'; // Orange/Warning color usually stands out
      case 'user': return 'success'; // Green
      case 'viewer': return 'info'; // Blue
      default: return 'secondary';
    }
  },

  openModal(userId = null) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const form = document.getElementById('userForm');
    const passwordRequired = document.getElementById('passwordRequired');
    const passwordHint = document.getElementById('passwordHint');

    // Reset form
    form.reset();
    document.getElementById('userId').value = '';

    if (userId) {
      title.textContent = 'Chỉnh sửa người dùng';
      passwordRequired.style.display = 'none';
      passwordHint.style.display = 'block';
      this.loadUserDetails(userId);
    } else {
      title.textContent = 'Thêm người dùng';
      passwordRequired.style.display = 'inline';
      passwordHint.style.display = 'none';
      // Default permissions view
      this.updatePermissionsInfo('user');
    }

    modal.classList.add('show');
  },

  closeModal() {
    document.getElementById('userModal').classList.remove('show');
  },

  async loadUserDetails(userId) {
    try {
      const response = await fetch(`/api/users/${userId}`);
      const result = await response.json();
      
      if (result.success) {
        const user = result.data;
        document.getElementById('userId').value = user.id;
        document.getElementById('userUsername').value = user.username;
        document.getElementById('userEmail').value = user.email || '';
        document.getElementById('modalUserRole').value = user.role;
        
        this.updatePermissionsInfo(user.role);
      }
    } catch (error) {
      console.error('Error loading user details:', error);
      if (typeof window.showErrorToast === 'function') window.showErrorToast('Error loading user details');
    }
  },

  async saveUser() {
    const userId = document.getElementById('userId').value;
    const username = document.getElementById('userUsername').value;
    const email = document.getElementById('userEmail').value;
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('modalUserRole').value;

    if (!username) {
      if (typeof window.showErrorToast === 'function') window.showErrorToast('Username is required');
      return;
    }

    if (!userId && !password) {
      if (typeof window.showErrorToast === 'function') window.showErrorToast('Password is required for new users');
      return;
    }

    const data = { username, email, role };
    console.log('[Users] Saving user data:', data);

    // For CREATE, password is required and handled by createUser
    if (!userId) {
      data.password = password;
    }

    try {
      // Basic info update
      const url = userId ? `/api/users/${userId}` : '/api/users';
      const method = userId ? 'PUT' : 'POST';
      
      console.log(`[Users] Sending ${method} to ${url}`);

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (!result.success) {
        if (typeof window.showErrorToast === 'function') window.showErrorToast(result.error || 'Failed to save user');
        return;
      }

      // Explicitly handle role update if in edit mode
      // This ensures we use the specific role update endpoint if the general update didn't cover it
      // or if there's specific logic attached to role changes in the backend
      if (userId) {
        try {
          await fetch(`/api/users/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
          });
        } catch (roleError) {
          console.error('Error updating role explicitly:', roleError);
        }
      }

      // If EDIT mode and password is provided, call reset-password endpoint
      if (userId && password) {
        try {
          const pwdResponse = await fetch(`/api/users/${userId}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword: password })
          });
          const pwdResult = await pwdResponse.json();
          if (!pwdResult.success) {
            if (typeof window.showWarningToast === 'function') window.showWarningToast('User saved but password update failed: ' + pwdResult.error);
          }
        } catch (pwdError) {
          console.error('Error updating password:', pwdError);
          if (typeof window.showWarningToast === 'function') window.showWarningToast('User saved but password update failed');
        }
      }

      if (typeof window.showSuccessToast === 'function') window.showSuccessToast(userId ? 'User updated successfully' : 'User created successfully');
      this.closeModal();
      this.loadUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      if (typeof window.showErrorToast === 'function') window.showErrorToast('Error saving user: ' + error.message);
    }
  },

  async deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        if (typeof window.showSuccessToast === 'function') window.showSuccessToast('User deleted successfully');
        this.loadUsers();
      } else {
        if (typeof window.showErrorToast === 'function') window.showErrorToast(result.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      if (typeof window.showErrorToast === 'function') window.showErrorToast('Error deleting user');
    }
  },

  // Helper to show permissions based on role (frontend simulation of "specify permissions")
  updatePermissionsInfo(role) {
    const infoBox = document.getElementById('rolePermissionsInfo');
    let permissions = [];
    
    switch(role) {
      case 'admin':
        permissions = ['Full Access', 'Manage Users', 'Manage Database', 'All Job Operations'];
        break;
      case 'user':
        permissions = ['Create/Edit Jobs', 'Run Builds', 'View Logs', 'Manage Queue'];
        break;
      case 'viewer':
        permissions = ['View Jobs', 'View Builds', 'View Logs', 'Read Only Access'];
        break;
    }

    infoBox.innerHTML = `
      <ul style="margin: 0; padding-left: 20px;">
        ${permissions.map(p => `<li>${p}</li>`).join('')}
      </ul>
    `;
  },

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },
  
  // Expose edit/delete to window for onclick handlers
  editUser(id) {
    this.openModal(id);
  }
};

// Expose to window for global access
window.userManager = userManager;


// Auto-init if loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => userManager.init());
} else {
  userManager.init();
}

