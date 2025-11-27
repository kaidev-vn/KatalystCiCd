/**
 * Authentication Controller
 * Handle login, logout, change password, và current user info
 */

/**
 * Register auth routes
 * @param {Object} app - Express app
 * @param {Object} services
 * @param {Object} services.authService - AuthService instance
 * @param {Object} services.userService - UserService instance
 * @param {Function} services.authMiddleware - Auth middleware
 */
function registerAuthController(app, { authService, userService, authMiddleware }) {
  /**
   * POST /api/auth/login
   * Login with username/password
   */
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }

      // Get client IP for rate limiting
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

      // Attempt login
      const result = await authService.login(username, password, ipAddress);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Logout current user
   */
  app.post('/api/auth/logout', authMiddleware, async (req, res) => {
    try {
      await authService.logout(req.user.userId);

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/auth/change-password
   * Change current user's password
   */
  app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          error: 'All password fields are required'
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          error: 'New password and confirm password do not match'
        });
      }

      await authService.changePassword(req.user.userId, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/auth/me
   * Get current user info
   */
  app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
      const user = await userService.getUserById(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/auth/refresh
   * Refresh JWT token
   */
  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token is required'
        });
      }

      const newToken = authService.refreshToken(token);

      res.json({
        success: true,
        data: { token: newToken }
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: error.message
      });
    }
  });
}

module.exports = { registerAuthController };
