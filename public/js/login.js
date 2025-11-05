/**
 * Login Page Script
 * Handles login form submission and password change flow
 */

import { auth } from './auth.js';

const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');
const errorEl = document.getElementById('loginError');

// Check if already logged in
if (auth.isAuthenticated()) {
  const user = auth.getUser();
  if (user && user.mustChangePassword) {
    // Redirect to change password page
    showPasswordChangeModal();
  } else {
    // Redirect to dashboard
    window.location.href = '/';
  }
}

// Handle login form submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  
  if (!username || !password) {
    showError('Please enter both username and password');
    return;
  }
  
  // Disable form during login
  setLoading(true);
  hideError();
  
  try {
    const result = await auth.login(username, password);
    
    // Login successful
    if (result.mustChangePassword) {
      // Show password change modal
      showPasswordChangeModal();
    } else {
      // Redirect to dashboard
      window.location.href = '/';
    }
  } catch (error) {
    showError(error.message || 'Login failed. Please try again.');
    setLoading(false);
  }
});

// Show/hide loading state
function setLoading(loading) {
  loginBtn.disabled = loading;
  btnText.style.display = loading ? 'none' : 'inline';
  btnLoader.style.display = loading ? 'inline' : 'none';
  usernameInput.disabled = loading;
  passwordInput.disabled = loading;
}

// Show error message
function showError(message) {
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

// Hide error message
function hideError() {
  errorEl.style.display = 'none';
}

// Show password change modal (inline implementation)
function showPasswordChangeModal() {
  // Create modal HTML
  const modalHTML = `
    <div id="passwordChangeModal" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.3s;
    ">
      <div style="
        background: white;
        padding: 40px;
        border-radius: 16px;
        max-width: 450px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.4s;
      ">
        <h2 style="margin: 0 0 8px 0; color: #333; font-size: 24px;">
          🔐 Change Password Required
        </h2>
        <p style="margin: 0 0 24px 0; color: #666; font-size: 14px;">
          For security reasons, you must change your password before continuing.
        </p>
        <form id="changePasswordForm">
          <input 
            type="password" 
            id="currentPassword" 
            placeholder="Current Password" 
            required
            style="
              width: 100%;
              padding: 12px 16px;
              margin-bottom: 12px;
              font-size: 15px;
              border: 2px solid #e0e0e0;
              border-radius: 8px;
              box-sizing: border-box;
            "
          >
          <input 
            type="password" 
            id="newPassword" 
            placeholder="New Password (min 8 characters)" 
            required
            minlength="8"
            style="
              width: 100%;
              padding: 12px 16px;
              margin-bottom: 12px;
              font-size: 15px;
              border: 2px solid #e0e0e0;
              border-radius: 8px;
              box-sizing: border-box;
            "
          >
          <input 
            type="password" 
            id="confirmPassword" 
            placeholder="Confirm New Password" 
            required
            minlength="8"
            style="
              width: 100%;
              padding: 12px 16px;
              margin-bottom: 16px;
              font-size: 15px;
              border: 2px solid #e0e0e0;
              border-radius: 8px;
              box-sizing: border-box;
            "
          >
          <button 
            type="submit" 
            id="changePwdBtn"
            style="
              width: 100%;
              padding: 12px;
              font-size: 16px;
              font-weight: 600;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 8px;
              cursor: pointer;
            "
          >
            Change Password
          </button>
          <div id="changePwdError" style="
            color: #e74c3c;
            font-size: 14px;
            margin-top: 12px;
            padding: 12px;
            background: #fee;
            border-radius: 6px;
            display: none;
          "></div>
        </form>
      </div>
    </div>
  `;
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Handle form submission
  const changePasswordForm = document.getElementById('changePasswordForm');
  const changePwdBtn = document.getElementById('changePwdBtn');
  const changePwdError = document.getElementById('changePwdError');
  
  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validate
    if (newPassword !== confirmPassword) {
      changePwdError.textContent = 'New passwords do not match';
      changePwdError.style.display = 'block';
      return;
    }
    
    if (newPassword.length < 8) {
      changePwdError.textContent = 'Password must be at least 8 characters';
      changePwdError.style.display = 'block';
      return;
    }
    
    // Disable form
    changePwdBtn.disabled = true;
    changePwdBtn.textContent = 'Changing...';
    changePwdError.style.display = 'none';
    
    try {
      await auth.changePassword(currentPassword, newPassword, confirmPassword);
      
      // Success! Close modal and redirect
      document.getElementById('passwordChangeModal').remove();
      window.location.href = '/';
    } catch (error) {
      changePwdError.textContent = error.message || 'Failed to change password';
      changePwdError.style.display = 'block';
      changePwdBtn.disabled = false;
      changePwdBtn.textContent = 'Change Password';
    }
  });
}
