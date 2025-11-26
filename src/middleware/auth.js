/**
 * Authentication Middleware
 * Verify JWT token và attach user info vào request
 */

/**
 * Create auth middleware with authService dependency
 * @param {Object} authService - AuthService instance
 * @returns {Function} Express middleware function
 */
function createAuthMiddleware(authService) {
  /**
   * Auth middleware function
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  return async function authMiddleware(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'No authorization token provided',
          code: 'NO_TOKEN'
        });
      }

      // Extract token from "Bearer <token>"
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Invalid authorization format',
          code: 'INVALID_FORMAT'
        });
      }

      // Verify token
      try {
        const decoded = authService.verifyToken(token);
        
        // Attach user info to request
        req.user = {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role
        };

        next();
      } catch (error) {
        if (error.message === 'Token expired') {
          return res.status(401).json({
            success: false,
            error: 'Token has expired',
            code: 'TOKEN_EXPIRED'
          });
        }

        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
    } catch (error) {
      console.error('[AUTH MIDDLEWARE] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Authentication error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Optional auth middleware - doesn't fail if no token, but attaches user if present
 * @param {Object} authService - AuthService instance
 * @returns {Function} Express middleware function
 */
function createOptionalAuthMiddleware(authService) {
  return async function optionalAuthMiddleware(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (authHeader) {
        const token = authHeader.startsWith('Bearer ')
          ? authHeader.substring(7)
          : authHeader;

        try {
          const decoded = authService.verifyToken(token);
          req.user = {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role
          };
        } catch (error) {
          // Ignore errors, just don't attach user
        }
      }

      next();
    } catch (error) {
      // Continue without auth
      next();
    }
  };
}

module.exports = {
  createAuthMiddleware,
  createOptionalAuthMiddleware
};
