# 🔧 app.js Auth Integration Guide

## Changes needed in `app.js`

### 1. Import Auth Services & Middleware

Thêm vào phần imports (sau các imports hiện tại):

```javascript
// Auth & User Management
const { UserService } = require('./src/services/UserService');
const { AuthService } = require('./src/services/AuthService');
const { createAuthMiddleware } = require('./src/middleware/auth');
const { requireAdmin } = require('./src/middleware/rbac');
const { registerAuthController } = require('./src/controllers/AuthController');
const { registerUserController } = require('./src/controllers/UserController');
```

### 2. Initialize Services

Thêm sau phần khởi tạo các services hiện tại (sau `const emailService = ...`):

```javascript
// Khởi tạo User & Auth Services
const userService = new UserService({ logger });
const authService = new AuthService({ userService, logger });

// Create auth middleware
const authMiddleware = createAuthMiddleware(authService);
```

### 3. Register Auth Controllers

Thêm sau phần register các controllers hiện tại (trước phần Job routes):

```javascript
// ========================================
// AUTH & USER MANAGEMENT ROUTES
// ========================================

// Auth routes (login, logout, change password)
registerAuthController(app, { authService, userService, authMiddleware });

// User management routes (admin only)
registerUserController(app, { userService, authMiddleware, requireAdmin });
```

### 4. Optional: Protect Existing Routes

**Option A: Không bắt buộc auth (Backward compatible)**
```javascript
// Giữ nguyên tất cả routes hiện tại
// User có thể access mà không cần login
// Để migrate dần dần
```

**Option B: Bắt buộc auth cho tất cả routes**
```javascript
// Thêm authMiddleware vào tất cả API routes
app.use('/api', authMiddleware);

// Hoặc thêm vào từng route cụ thể:
app.get('/api/jobs', authMiddleware, (req, res) => jobController.getAllJobs(req, res));
```

### 5. Add Public Routes Exception

Nếu chọn Option B, exclude auth routes:

```javascript
// Public routes (không cần auth)
const publicRoutes = [
  '/api/auth/login',
  '/api/auth/refresh'
];

// Auth middleware với exception
app.use((req, res, next) => {
  if (publicRoutes.includes(req.path)) {
    return next();
  }
  return authMiddleware(req, res, next);
});
```

---

## Complete Integration Code

```javascript
// At the top of app.js, add imports
const { UserService } = require('./src/services/UserService');
const { AuthService } = require('./src/services/AuthService');
const { createAuthMiddleware } = require('./src/middleware/auth');
const { requireAdmin } = require('./src/middleware/rbac');
const { registerAuthController } = require('./src/controllers/AuthController');
const { registerUserController } = require('./src/controllers/UserController');

// After other service initializations
const userService = new UserService({ logger });
const authService = new AuthService({ userService, logger });
const authMiddleware = createAuthMiddleware(authService);

// Before existing routes, add:
registerAuthController(app, { authService, userService, authMiddleware });
registerUserController(app, { userService, authMiddleware, requireAdmin });
```

---

## Implementation Options

### 🟢 Recommended: Phased Rollout

**Phase 1: Non-breaking (Current)**
```javascript
// Just add auth routes
// Existing routes work without auth
registerAuthController(app, { authService, userService, authMiddleware });
registerUserController(app, { userService, authMiddleware, requireAdmin });
```

**Phase 2: Optional Auth**
```javascript
// Add setting in config.json
{
  "auth": {
    "required": false  // Set to true to enforce
  }
}

// Conditional middleware
if (config.auth?.required) {
  app.use('/api', authMiddleware);
}
```

**Phase 3: Full Enforcement**
```javascript
// Set config.auth.required = true
// All API calls require authentication
// Frontend redirects to login
```

---

## Testing After Integration

```bash
# Start server
npm start

# Test login
curl -X POST http://localhost:9001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"welcomekalyst"}'

# Response should include token and mustChangePassword: true
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "...",
      "username": "admin",
      "role": "admin",
      ...
    },
    "mustChangePassword": true
  }
}

# Test protected route
curl http://localhost:9001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Test admin route
curl http://localhost:9001/api/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Next Steps After Integration

1. ✅ Verify server starts without errors
2. ✅ Test login with default admin credentials
3. ✅ Check that `data/users.json` is created
4. ✅ Test auth middleware on protected routes
5. ➡️ Create frontend login page
6. ➡️ Integrate auth into existing UI

Ready to implement! 🚀
