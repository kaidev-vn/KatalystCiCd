const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { readJson, writeJson, ensureDir } = require('../utils/file');
const { DataStorageService } = require('./DataStorageService');

/**
 * User Service - Quản lý users với authentication và RBAC
 * @class UserService
 */
class UserService {
  /**
   * @param {Object} options
   * @param {Object} options.logger - Logger instance
   */
  constructor({ logger } = {}) {
    this.logger = logger;
    this.usersFile = path.join(process.cwd(), 'data', 'users.json');
    this.SALT_ROUNDS = 10;
    this._initialized = false;
    
    // Initialize DataStorageService
    this.storageService = new DataStorageService({ logger, dataDir: path.dirname(this.usersFile) });
    
    // Initialize users file với default admin (async, will be called lazily)
    this._initPromise = this.ensureUsersFile();
  }

  /**
   * Ensure service is initialized
   * @private
   */
  async _ensureInitialized() {
    if (!this._initialized) {
      await this._initPromise;
      this._initialized = true;
    }
  }

  /**
   * Ensure users file tồn tại, tạo default admin nếu cần
   * @private
   */
  async ensureUsersFile() {
    try {
      await ensureDir(path.dirname(this.usersFile));
      
      let users = [];
      let fileExists = false;
      
      try {
        users = await this.storageService.getData('users');
        if (users && Array.isArray(users)) {
          fileExists = true;
        } else {
          users = [];
        }
      } catch (err) {
        // File doesn't exist or is invalid
        fileExists = false;
        users = [];
      }

      // If file doesn't exist or no users, create default admin
      if (!fileExists || users.length === 0) {
        const defaultAdmin = await this.createDefaultAdmin();
        users = [defaultAdmin];
        await this.saveUsers(users);
        this.logger?.send('[USER SERVICE] ✅ Created default admin user');
        return;
      }

      // Check if admin exists, nếu không thì tạo
      if (!users.find(u => u.username === 'admin')) {
        const defaultAdmin = await this.createDefaultAdmin();
        users.push(defaultAdmin);
        await this.saveUsers(users);
        this.logger?.send('[USER SERVICE] ✅ Added default admin user');
      }
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error ensuring users file: ${error.message}`);
      // Don't throw, just log - allow server to start
      console.error('[USER SERVICE] Initialization error:', error);
    }
  }

  /**
   * Tạo default admin user
   * @private
   * @returns {Promise<Object>} Admin user object
   */
  async createDefaultAdmin() {
    const hashedPassword = await bcrypt.hash('welcomekalyst', this.SALT_ROUNDS);
    return {
      id: uuidv4(),
      username: 'admin',
      email: 'admin@cicd.local',
      password: hashedPassword,
      role: 'admin',
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLogin: null
    };
  }

  /**
   * Get all users (without passwords)
   * @returns {Promise<Array>} Array of users
   */
  async getAllUsers() {
    await this._ensureInitialized();
    try {
      // Sử dụng DataStorageService để lấy dữ liệu từ database hoặc JSON
      const users = await this.storageService.getData('users');
      // Remove passwords from response
      return users.map(u => {
        const { password, ...userWithoutPassword } = u;
        return userWithoutPassword;
      });
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error getting users: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user by ID (without password)
   * @param {string} userId
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserById(userId) {
    try {
      const users = await this.storageService.getData('users');
      const user = users.find(u => u.id === userId);
      if (!user) return null;
      
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error getting user: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user by username (with password - for authentication)
   * @param {string} username
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserByUsername(username) {
    await this._ensureInitialized();
    try {
      const users = await this.storageService.getData('users');
      return users.find(u => u.username === username) || null;
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error getting user: ${error.message}`);
      return null;
    }
  }

  /**
   * Save users data
   * @private
   */
  async saveUsers(users) {
    await this.storageService.saveData('users', users);
  }

  /**
   * Create new user
   * @param {Object} userData
   * @param {string} userData.username
   * @param {string} userData.email
   * @param {string} userData.password
   * @param {string} userData.role
   * @returns {Promise<Object>} Created user (without password)
   */
  async createUser(userData) {
    await this._ensureInitialized();
    try {
      const users = await this.storageService.getData('users');

      // Check if username exists
      if (users.find(u => u.username === userData.username)) {
        throw new Error('Username already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, this.SALT_ROUNDS);

      const newUser = {
        id: uuidv4(),
        username: userData.username,
        email: userData.email || `${userData.username}@cicd.local`,
        password: hashedPassword,
        role: userData.role || 'user',
        mustChangePassword: userData.mustChangePassword !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: null
      };

      users.push(newUser);
      await this.saveUsers(users);

      this.logger?.send(`[USER SERVICE] ✅ Created user: ${newUser.username}`);

      const { password, ...userWithoutPassword } = newUser;
      return userWithoutPassword;
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error creating user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update user
   * @param {string} userId
   * @param {Object} updates
   * @returns {Promise<Object>} Updated user (without password)
   */
  async updateUser(userId, updates) {
    try {
      const users = await this.storageService.getData('users');
      const index = users.findIndex(u => u.id === userId);

      if (index === -1) {
        throw new Error('User not found');
      }

      // Don't allow direct password update (use changePassword instead)
      const { password, ...allowedUpdates } = updates;

      users[index] = {
        ...users[index],
        ...allowedUpdates,
        updatedAt: new Date().toISOString()
      };

      await this.saveUsers(users);

      this.logger?.send(`[USER SERVICE] ✅ Updated user: ${users[index].username}`);

      const { password: pwd, ...userWithoutPassword } = users[index];
      return userWithoutPassword;
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error updating user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete user
   * @param {string} userId
   * @returns {Promise<boolean>} Success status
   */
  async deleteUser(userId) {
    try {
      const users = await this.storageService.getData('users');
      const user = users.find(u => u.id === userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Prevent deleting admin if it's the only admin
      if (user.role === 'admin') {
        const adminCount = users.filter(u => u.role === 'admin').length;
        if (adminCount === 1) {
          throw new Error('Cannot delete the only admin user');
        }
      }

      const filteredUsers = users.filter(u => u.id !== userId);
      await this.saveUsers(filteredUsers);

      this.logger?.send(`[USER SERVICE] ✅ Deleted user: ${user.username}`);
      return true;
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error deleting user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify password
   * @param {string} plainPassword
   * @param {string} hashedPassword
   * @returns {Promise<boolean>} Match status
   */
  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Change user password
   * @param {string} userId
   * @param {string} newPassword
   * @returns {Promise<boolean>} Success status
   */
  async changePassword(userId, newPassword) {
    try {
      const users = await this.storageService.getData('users');
      const index = users.findIndex(u => u.id === userId);

      if (index === -1) {
        throw new Error('User not found');
      }

      const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

      users[index].password = hashedPassword;
      users[index].mustChangePassword = false;
      users[index].updatedAt = new Date().toISOString();

      await this.saveUsers(users);

      this.logger?.send(`[USER SERVICE] ✅ Changed password for user: ${users[index].username}`);
      return true;
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error changing password: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async updateLastLogin(userId) {
    try {
      const users = await this.storageService.getData('users');
      const index = users.findIndex(u => u.id === userId);

      if (index !== -1) {
        users[index].lastLogin = new Date().toISOString();
        await this.saveUsers(users);
      }
    } catch (error) {
      this.logger?.send(`[USER SERVICE] ❌ Error updating last login: ${error.message}`);
    }
  }

  /**
   * Change user role
   * @param {string} userId
   * @param {string} newRole
   * @returns {Promise<Object>} Updated user
   */
  async changeRole(userId, newRole) {
    const validRoles = ['admin', 'user', 'viewer'];
    if (!validRoles.includes(newRole)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    return this.updateUser(userId, { role: newRole });
  }
}

module.exports = { UserService };
