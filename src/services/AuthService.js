const jwt = require('jsonwebtoken');

/**
 * Authentication Service - Handle JWT tokens và login/logout
 * @class AuthService
 */
class AuthService {
  /**
   * @param {Object} options
   * @param {Object} options.userService - UserService instance
   * @param {Object} options.logger - Logger instance
   */
  constructor({ userService, logger } = {}) {
    this.userService = userService;
    this.logger = logger;
    
    // JWT Secret (trong production nên dùng env variable)
    this.JWT_SECRET = process.env.JWT_SECRET || 'CI-CD-SECRET-KEY-CHANGE-IN-PRODUCTION';
    this.TOKEN_EXPIRY = '8h'; // Token expires in 8 hours
    
    // Rate limiting (simple in-memory store)
    this.loginAttempts = new Map(); // IP -> {count, lastAttempt}
    this.MAX_ATTEMPTS = 5;
    this.LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Login user with username/password
   * @param {string} username
   * @param {string} password
   * @param {string} ipAddress - For rate limiting
   * @returns {Promise<Object>} { token, user, mustChangePassword }
   */
  async login(username, password, ipAddress = 'unknown') {
    try {
      // Check rate limiting
      if (this.isRateLimited(ipAddress)) {
        throw new Error('Too many login attempts. Please try again later.');
      }

      // Get user by username
      const user = await this.userService.getUserByUsername(username);
      if (!user) {
        this.recordFailedAttempt(ipAddress);
        throw new Error('Invalid username or password');
      }

      // Verify password
      console.log(user.password);
      
      const isValidPassword = await this.userService.verifyPassword(password, user.password);
      if (!isValidPassword) {
        this.recordFailedAttempt(ipAddress);
        throw new Error('Invalid username or password');
      }

      // Reset failed attempts on successful login
      this.loginAttempts.delete(ipAddress);

      // Update last login
      await this.userService.updateLastLogin(user.id);

      // Generate JWT token
      const token = this.generateToken({
        userId: user.id,
        username: user.username,
        role: user.role
      });

      this.logger?.send(`[AUTH] ✅ User logged in: ${username}`);

      // Return token và user info (without password)
      const { password: pwd, ...userWithoutPassword } = user;

      return {
        token,
        user: userWithoutPassword,
        mustChangePassword: user.mustChangePassword
      };
    } catch (error) {
      this.logger?.send(`[AUTH] ❌ Login failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate JWT token
   * @param {Object} payload
   * @param {string} payload.userId
   * @param {string} payload.username
   * @param {string} payload.role
   * @returns {string} JWT token
   */
  generateToken(payload) {
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.TOKEN_EXPIRY
    });
  }

  /**
   * Verify and decode JWT token
   * @param {string} token
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid or expired
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Change user password
   * @param {string} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<boolean>} Success status
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get user
      const user = await this.userService.getUserByUsername(
        (await this.userService.getUserById(userId))?.username
      );

      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await this.userService.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      this.validatePassword(newPassword);

      // Change password
      await this.userService.changePassword(userId, newPassword);

      this.logger?.send(`[AUTH] ✅ Password changed for user: ${user.username}`);
      return true;
    } catch (error) {
      this.logger?.send(`[AUTH] ❌ Password change failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate password strength
   * @param {string} password
   * @throws {Error} If password doesn't meet requirements
   */
  validatePassword(password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Optional: Add more complexity requirements
    // if (!/[A-Z]/.test(password)) {
    //   throw new Error('Password must contain at least one uppercase letter');
    // }
    // if (!/[a-z]/.test(password)) {
    //   throw new Error('Password must contain at least one lowercase letter');
    // }
    // if (!/[0-9]/.test(password)) {
    //   throw new Error('Password must contain at least one number');
    // }
  }

  /**
   * Check if IP is rate limited
   * @param {string} ipAddress
   * @returns {boolean}
   */
  isRateLimited(ipAddress) {
    const attempts = this.loginAttempts.get(ipAddress);
    if (!attempts) return false;

    const now = Date.now();
    const timeSinceLastAttempt = now - attempts.lastAttempt;

    // Reset if lockout duration has passed
    if (timeSinceLastAttempt > this.LOCKOUT_DURATION) {
      this.loginAttempts.delete(ipAddress);
      return false;
    }

    // Check if max attempts exceeded
    return attempts.count >= this.MAX_ATTEMPTS;
  }

  /**
   * Record failed login attempt
   * @param {string} ipAddress
   */
  recordFailedAttempt(ipAddress) {
    const attempts = this.loginAttempts.get(ipAddress) || { count: 0, lastAttempt: 0 };
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    this.loginAttempts.set(ipAddress, attempts);

    if (attempts.count >= this.MAX_ATTEMPTS) {
      this.logger?.send(`[AUTH] ⚠️ IP ${ipAddress} locked out after ${attempts.count} failed attempts`);
    }
  }

  /**
   * Logout user (client-side token removal, server-side could implement token blacklist)
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async logout(userId) {
    this.logger?.send(`[AUTH] ✅ User logged out: ${userId}`);
    // In a more advanced implementation, add token to blacklist
    return true;
  }

  /**
   * Refresh token (generate new token with extended expiry)
   * @param {string} oldToken
   * @returns {string} New token
   */
  refreshToken(oldToken) {
    try {
      // Verify old token (even if expired)
      const decoded = jwt.verify(oldToken, this.JWT_SECRET, { ignoreExpiration: true });

      // Generate new token with same payload
      return this.generateToken({
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role
      });
    } catch (error) {
      throw new Error('Invalid token for refresh');
    }
  }
}

module.exports = { AuthService };
