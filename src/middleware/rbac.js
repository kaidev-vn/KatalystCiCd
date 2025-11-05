/**
 * Role-Based Access Control (RBAC) Middleware
 * Check if user has permission to access resource based on role
 */

/**
 * Role definitions và permissions
 */
const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
};

const PERMISSIONS = {
  admin: ['*'], // All permissions
  user: [
    'jobs:read', 'jobs:create', 'jobs:update', 'jobs:delete',
    'builds:read', 'builds:create',
    'queue:read', 'queue:manage',
    'config:read',
    'git:read',
    'docker:read',
    'email:read'
  ],
  viewer: [
    'jobs:read',
    'builds:read',
    'queue:read',
    'config:read',
    'git:read',
    'docker:read',
    'email:read'
  ]
};

/**
 * Check if user has permission
 * @param {string} userRole - User's role
 * @param {string} requiredPermission - Required permission (e.g., 'jobs:create')
 * @returns {boolean}
 */
function hasPermission(userRole, requiredPermission) {
  const rolePermissions = PERMISSIONS[userRole] || [];
  
  // Admin has all permissions
  if (rolePermissions.includes('*')) {
    return true;
  }

  // Check if role has specific permission
  return rolePermissions.includes(requiredPermission);
}

/**
 * Create RBAC middleware that requires specific permission
 * @param {string} requiredPermission - Permission string (e.g., 'jobs:create')
 * @returns {Function} Express middleware
 */
function requirePermission(requiredPermission) {
  return function rbacMiddleware(req, res, next) {
    // Auth middleware should have already attached req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
    }

    const { role } = req.user;

    if (!hasPermission(role, requiredPermission)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: requiredPermission,
        userRole: role
      });
    }

    next();
  };
}

/**
 * Create RBAC middleware that requires specific role
 * @param {string|Array<string>} allowedRoles - Role(s) allowed to access
 * @returns {Function} Express middleware
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return function rbacMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
    }

    const { role } = req.user;

    if (!roles.includes(role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: roles,
        userRole: role
      });
    }

    next();
  };
}

/**
 * Middleware that allows only admin
 */
const requireAdmin = requireRole(ROLES.ADMIN);

/**
 * Middleware that allows admin and user (not viewer)
 */
const requireUser = requireRole([ROLES.ADMIN, ROLES.USER]);

/**
 * Check if user can modify resource (must be owner or admin)
 * @param {string} resourceUserId - User ID của resource owner
 * @param {Object} currentUser - Current logged in user
 * @returns {boolean}
 */
function canModifyResource(resourceUserId, currentUser) {
  // Admin can modify anything
  if (currentUser.role === ROLES.ADMIN) {
    return true;
  }

  // User can only modify their own resources
  return currentUser.userId === resourceUserId;
}

module.exports = {
  ROLES,
  PERMISSIONS,
  hasPermission,
  requirePermission,
  requireRole,
  requireAdmin,
  requireUser,
  canModifyResource
};
