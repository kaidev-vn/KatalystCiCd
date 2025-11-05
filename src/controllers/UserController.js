/**
 * User Management Controller (Admin only)
 * Handle user CRUD operations
 */

/**
 * Register user management routes
 * @param {Object} app - Express app
 * @param {Object} services
 * @param {Object} services.userService - UserService instance
 * @param {Function} services.authMiddleware - Auth middleware
 * @param {Function} services.requireAdmin - RBAC middleware for admin
 */
function registerUserController(app, { userService, authMiddleware, requireAdmin }) {
  /**
   * GET /api/users
   * List all users (admin only)
   */
  app.get('/api/users', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const users = await userService.getAllUsers();
      res.json({ success: true, data: users });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/users/:id
   * Get user by ID (admin only)
   */
  app.get('/api/users/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const user = await userService.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/users
   * Create new user (admin only)
   */
  app.post('/api/users', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { username, email, password, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }

      const user = await userService.createUser({ username, email, password, role });
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/users/:id
   * Update user (admin only)
   */
  app.put('/api/users/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const user = await userService.updateUser(req.params.id, req.body);
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/users/:id
   * Delete user (admin only)
   */
  app.delete('/api/users/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      await userService.deleteUser(req.params.id);
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/users/:id/role
   * Change user role (admin only)
   */
  app.put('/api/users/:id/role', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!role) {
        return res.status(400).json({ success: false, error: 'Role is required' });
      }
      const user = await userService.changeRole(req.params.id, role);
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/users/:id/reset-password
   * Reset user password (admin only)
   */
  app.post('/api/users/:id/reset-password', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword) {
        return res.status(400).json({ success: false, error: 'New password is required' });
      }
      await userService.changePassword(req.params.id, newPassword);
      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerUserController };
