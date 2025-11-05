# 🔐 Authentication & RBAC Implementation

## 📋 Requirements

1. **Login System** - Username/password authentication
2. **RBAC** - Role-Based Access Control (Admin, User, Viewer)
3. **Default Account** - admin / welcomekalyst
4. **Force Password Change** - After first login
5. **Session Management** - Secure token-based auth
6. **Password Security** - Bcrypt hashing

---

## 🏗️ Architecture

### Backend Components

```
src/
├── middleware/
│   ├── auth.js          # Authentication middleware
│   └── rbac.js          # Role-based access control
├── services/
│   ├── UserService.js   # User CRUD operations
│   └── AuthService.js   # Login, logout, token management
├── controllers/
│   ├── AuthController.js    # /api/auth/*
│   └── UserController.js    # /api/users/*
└── models/
    └── User.js          # User data structure
```

### Frontend Components

```
public/
├── login.html           # Login page
├── js/
│   ├── auth.js         # Auth utilities
│   └── login.js        # Login logic
└── css/
    └── login.css       # Login styling (in styles.css)
```

---

## 🎯 Features

### 1. User Roles

```javascript
const ROLES = {
  ADMIN: 'admin',       // Full access
  USER: 'user',         // Create/edit own jobs
  VIEWER: 'viewer'      // Read-only access
};

const PERMISSIONS = {
  'admin': ['*'],  // All permissions
  'user': [
    'jobs:read', 'jobs:create', 'jobs:update', 'jobs:delete',
    'builds:read', 'queue:read', 'config:read'
  ],
  'viewer': [
    'jobs:read', 'builds:read', 'queue:read', 'config:read'
  ]
};
```

### 2. User Schema

```javascript
{
  id: 'uuid',
  username: 'admin',
  email: 'admin@example.com',
  password: 'bcrypt_hash',
  role: 'admin',
  mustChangePassword: true,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  lastLogin: '2025-01-01T00:00:00Z'
}
```

### 3. Session/Token

```javascript
// JWT Token payload
{
  userId: 'uuid',
  username: 'admin',
  role: 'admin',
  iat: 1234567890,
  exp: 1234567890
}
```

---

## 🔧 Implementation Steps

### Phase 1: Backend Setup

#### Step 1: Install Dependencies
```bash
npm install jsonwebtoken bcryptjs uuid
```

#### Step 2: Create User Service
- User data storage (JSON file)
- CRUD operations
- Password hashing/verification
- Default admin user creation

#### Step 3: Create Auth Service
- Login validation
- JWT token generation
- Token verification
- Session management

#### Step 4: Create Middleware
- Authentication middleware
- RBAC middleware
- Token validation

#### Step 5: Create Controllers
- AuthController (login, logout, change password)
- UserController (list, create, update, delete users)

#### Step 6: Protect Routes
- Apply auth middleware to all API routes
- Apply RBAC middleware based on permissions

---

### Phase 2: Frontend Setup

#### Step 1: Create Login Page
- Beautiful login form
- Error handling
- Remember me option
- Responsive design

#### Step 2: Auth State Management
- Store token in localStorage
- Global auth state
- Auto-logout on token expiry

#### Step 3: Password Change Modal
- Force password change on first login
- Password strength validation
- Confirm password

#### Step 4: Protected Routes
- Check auth before API calls
- Redirect to login if unauthorized
- Show/hide UI based on permissions

---

## 🔒 Security Features

### 1. Password Security
- Bcrypt with salt rounds (10)
- Minimum length: 8 characters
- Password complexity requirements
- Password history (prevent reuse)

### 2. Token Security
- JWT with expiry (8 hours)
- Refresh token mechanism
- Token revocation on logout
- HTTPS only (production)

### 3. Session Security
- Session timeout (8 hours)
- Auto-logout on inactivity
- CSRF protection
- XSS prevention

### 4. Rate Limiting
- Max 5 login attempts per 15 minutes
- Account lockout after failed attempts
- IP-based rate limiting

---

## 📝 API Endpoints

### Authentication
```
POST   /api/auth/login              # Login
POST   /api/auth/logout             # Logout
POST   /api/auth/change-password    # Change password
GET    /api/auth/me                 # Get current user
POST   /api/auth/refresh            # Refresh token
```

### User Management (Admin only)
```
GET    /api/users                   # List all users
POST   /api/users                   # Create user
GET    /api/users/:id               # Get user
PUT    /api/users/:id               # Update user
DELETE /api/users/:id               # Delete user
PUT    /api/users/:id/role          # Change user role
PUT    /api/users/:id/reset         # Reset password
```

---

## 🎨 UI/UX Flow

### 1. Login Flow
```
1. User visits app
2. → Redirect to /login.html
3. Enter username/password
4. → POST /api/auth/login
5. Success → Store token
6. Check mustChangePassword
7. If true → Show change password modal
8. If false → Redirect to dashboard
```

### 2. Password Change Flow
```
1. Show modal "You must change your password"
2. Enter current password
3. Enter new password
4. Confirm new password
5. → POST /api/auth/change-password
6. Success → Update mustChangePassword = false
7. → Redirect to dashboard
```

### 3. Access Control Flow
```
1. User tries to access resource
2. Check token in localStorage
3. If no token → Redirect to login
4. If expired → Redirect to login
5. If valid → Decode token
6. Check user role & permissions
7. Allow/Deny based on RBAC
```

---

## 🧪 Testing Scenarios

### Authentication Tests
- [ ] Login with correct credentials
- [ ] Login with incorrect credentials
- [ ] Login with non-existent user
- [ ] Force password change on first login
- [ ] Token expiry handling
- [ ] Logout functionality

### Authorization Tests
- [ ] Admin can access all routes
- [ ] User can access own resources
- [ ] Viewer can only read
- [ ] Unauthorized access returns 403
- [ ] Unauthenticated access returns 401

### Security Tests
- [ ] Password hashing works
- [ ] Token validation works
- [ ] CSRF protection
- [ ] XSS prevention
- [ ] SQL injection prevention (N/A for JSON storage)

---

## 📊 Default Users

```javascript
[
  {
    id: 'admin-001',
    username: 'admin',
    email: 'admin@cicd.local',
    password: bcrypt.hash('welcomekalyst'),
    role: 'admin',
    mustChangePassword: true,
    createdAt: new Date().toISOString()
  }
]
```

---

## 🚀 Migration Strategy

### Step 1: Add Auth (Non-breaking)
- Deploy auth system
- Login optional (backward compatible)
- Admin can enable "Require Auth" setting

### Step 2: Enforce Auth (Breaking)
- Enable "Require Auth" in config
- All users must login
- Existing sessions remain valid

### Step 3: RBAC Enforcement
- Apply role-based permissions
- Admin assigns roles to users
- UI adapts based on permissions

---

## 🎯 Success Criteria

- [ ] Default admin user works
- [ ] Force password change on first login
- [ ] JWT token authentication working
- [ ] RBAC permissions enforced
- [ ] Login/Logout flows smooth
- [ ] UI shows/hides based on permissions
- [ ] Password hashing secure
- [ ] Session management working
- [ ] Error handling comprehensive
- [ ] Documentation complete

Ready to implement! 🎉
