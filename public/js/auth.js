/**
 * Authentication Utility Module
 * Handles token storage, API calls, and authentication state
 */

const TOKEN_KEY = 'ci-cd-token';
const USER_KEY = 'ci-cd-user';

export const auth = {
  /**
   * Save token to localStorage
   */
  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  
  /**
   * Get token from localStorage
   */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  
  /**
   * Remove token from localStorage
   */
  removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.getToken();
  },
  
  /**
   * Save user info to localStorage
   */
  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  
  /**
   * Get user info from localStorage
   */
  getUser() {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },
  
  /**
   * Login with username/password
   */
  async login(username, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error);
    }
    
    this.setToken(data.data.token);
    this.setUser(data.data.user);
    
    return data.data;
  },
  
  /**
   * Logout current user
   */
  async logout() {
    const token = this.getToken();
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    this.removeToken();
    window.location.href = '/login.html';
  },
  
  /**
   * Change password
   */
  async changePassword(currentPassword, newPassword, confirmPassword) {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error);
    }
    
    // Update user mustChangePassword flag
    const user = this.getUser();
    if (user) {
      user.mustChangePassword = false;
      this.setUser(user);
    }
    
    return data;
  },
  
  /**
   * Get current user info from server
   */
  async getCurrentUser() {
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${this.getToken()}` }
    });
    
    if (response.status === 401) {
      this.removeToken();
      window.location.href = '/login.html';
      return null;
    }
    
    const data = await response.json();
    if (data.success) {
      this.setUser(data.data);
      return data.data;
    }
    
    return null;
  },
  
  /**
   * Check if user has specific role
   */
  hasRole(role) {
    const user = this.getUser();
    return user && user.role === role;
  },
  
  /**
   * Check if user is admin
   */
  isAdmin() {
    return this.hasRole('admin');
  },
  
  /**
   * Refresh token
   */
  async refreshToken() {
    const token = this.getToken();
    if (!token) return false;
    
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const data = await response.json();
      if (data.success) {
        this.setToken(data.data.token);
        return true;
      }
    } catch (error) {
      console.error('Token refresh error:', error);
    }
    
    return false;
  }
};

// Global fetch interceptor to auto-attach token and handle 401
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [url, options = {}] = args;
  
  // Skip token attachment for login endpoint
  if (url.startsWith('/api') && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
    const token = auth.getToken();
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }
  }
  
  return originalFetch(url, options).then(async response => {
    // Handle 401 Unauthorized (except for login page)
    if (response.status === 401 && !url.includes('/auth/login')) {
      // Try to refresh token first
      const refreshed = await auth.refreshToken();
      
      if (refreshed) {
        // Retry the original request with new token
        if (url.startsWith('/api')) {
          options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${auth.getToken()}`
          };
          return originalFetch(url, options);
        }
      } else {
        // Refresh failed, redirect to login
        auth.removeToken();
        window.location.href = '/login.html';
      }
    }
    
    return response;
  });
};

// Export as default for convenience
export default auth;
