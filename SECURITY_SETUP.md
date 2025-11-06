# 🔐 Security Setup Guide

## Encryption Key Setup

### **1. Generate Encryption Key**

**QUAN TRỌNG:** Bạn PHẢI tạo một encryption key duy nhất cho production!

```bash
# Generate 32-byte (256-bit) encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Output example:**
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

---

### **2. Tạo file .env**

Tạo file `.env` trong thư mục root của project:

```bash
# Copy from example
cp .env.example .env

# Or create manually
touch .env
```

---

### **3. Thêm Encryption Key vào .env**

Mở file `.env` và thêm:

```env
# Server Configuration
PORT=9001
NODE_ENV=production

# Webhook Secret
WEBHOOK_SECRET=your_webhook_secret_here

# Encryption Key (REQUIRED - DO NOT SHARE!)
ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**⚠️ CẢNH BÁO:**
- **KHÔNG commit** file `.env` vào Git
- Encryption key phải là **64 hex characters** (32 bytes)
- Mỗi môi trường (dev/staging/prod) nên dùng key riêng

---

### **4. Kiểm tra .gitignore**

Đảm bảo file `.env` được ignore:

```bash
# Check .gitignore
cat .gitignore | grep .env

# Should contain:
# .env
# .env.local
# .env.*.local
```

---

## Webhook Secret Setup

### **1. Generate Webhook Secret**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### **2. Thêm vào .env**

```env
WEBHOOK_SECRET=your_generated_webhook_secret_here
```

### **3. Configure trong GitLab/GitHub**

**GitLab:**
1. Vào `Settings → Webhooks`
2. Nhập Webhook URL: `http://your-server:9001/webhook/gitlab`
3. Nhập Secret Token (từ .env)
4. Check "Push events"
5. Click "Add webhook"

**GitHub:**
1. Vào `Settings → Webhooks → Add webhook`
2. Payload URL: `http://your-server:9001/webhook/github`
3. Content type: `application/json`
4. Secret: (từ .env)
5. Select "Just the push event"
6. Click "Add webhook"

---

## What Gets Encrypted?

### **Trong Job Configuration:**

1. ✅ **Git Tokens** - Access tokens cho GitLab/GitHub
2. ✅ **Registry Passwords** - Docker registry passwords
3. ✅ **Script Registry Passwords** - Registry passwords cho script builds

### **Encryption Format:**

```
Plain text: my-secret-password
Encrypted: 3a4f5b6c7d8e9f0a1b2c3d4e5f67890a:abcdef1234567890abcdef1234567890abcdef12345678
            ↑ IV (32 hex chars)               ↑ Encrypted data (hex)
```

---

## Migration - Encrypt Existing Data

Nếu bạn đã có jobs với plain text passwords, chúng sẽ tự động được encrypt khi:

1. **Update job** - Khi bạn edit và save job
2. **Create new job** - Mọi job mới đều được encrypt

### **Manual Migration Script** (Optional)

Nếu muốn encrypt tất cả jobs hiện có:

```javascript
// scripts/encrypt-jobs.js
const fs = require('fs');
const path = require('path');
const { getSecretManager } = require('../src/utils/secrets');

async function encryptExistingJobs() {
  const secretManager = getSecretManager();
  const jobsFile = path.join(__dirname, '../jobs.json');
  
  // Read jobs
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  
  // Encrypt each job
  const encryptedJobs = jobs.map(job => {
    // Only encrypt if not already encrypted
    if (!secretManager.isEncrypted(job.gitConfig?.token)) {
      job.gitConfig.token = secretManager.encrypt(job.gitConfig?.token || '');
    }
    
    if (job.buildConfig?.dockerConfig?.registryPassword) {
      if (!secretManager.isEncrypted(job.buildConfig.dockerConfig.registryPassword)) {
        job.buildConfig.dockerConfig.registryPassword = 
          secretManager.encrypt(job.buildConfig.dockerConfig.registryPassword);
      }
    }
    
    if (job.buildConfig?.registryPassword) {
      if (!secretManager.isEncrypted(job.buildConfig.registryPassword)) {
        job.buildConfig.registryPassword = 
          secretManager.encrypt(job.buildConfig.registryPassword);
      }
    }
    
    return job;
  });
  
  // Backup original
  fs.writeFileSync(jobsFile + '.backup', JSON.stringify(jobs, null, 2));
  
  // Save encrypted
  fs.writeFileSync(jobsFile, JSON.stringify(encryptedJobs, null, 2));
  
  console.log('✅ Encrypted', encryptedJobs.length, 'jobs');
  console.log('📦 Backup saved to jobs.json.backup');
}

encryptExistingJobs().catch(console.error);
```

**Chạy migration:**

```bash
node scripts/encrypt-jobs.js
```

---

## Troubleshooting

### **Lỗi: "ENCRYPTION_KEY not set"**

```
[SecretManager] ENCRYPTION_KEY not set in .env - Using default key
```

**Giải pháp:**
1. Tạo file `.env` nếu chưa có
2. Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. Thêm vào `.env`: `ENCRYPTION_KEY=your_key_here`
4. Restart server

---

### **Lỗi: "Invalid ENCRYPTION_KEY format"**

```
[SecretManager] ENCRYPTION_KEY must be 32 bytes (64 hex characters)
```

**Giải pháp:**
- Key phải đúng 64 ký tự hex (0-9, a-f)
- Re-generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

### **Lỗi: "Decryption error"**

Có thể xảy ra nếu:
1. **Key changed** - Đã đổi ENCRYPTION_KEY sau khi encrypt
2. **Data corrupted** - File jobs.json bị sửa thủ công

**Giải pháp:**
1. Restore từ backup: `cp jobs.json.backup jobs.json`
2. Hoặc re-create jobs với key mới

---

## Best Practices

### **✅ DO:**

1. **Generate unique key** cho mỗi môi trường
2. **Store key securely** - Dùng secret manager (AWS Secrets Manager, Azure Key Vault)
3. **Rotate keys** định kỳ (6-12 tháng)
4. **Backup encrypted data** trước khi migrate
5. **Test decryption** sau khi setup

### **❌ DON'T:**

1. **Commit .env** vào Git
2. **Share key** qua email/chat
3. **Hardcode key** trong source code
4. **Use same key** cho dev và production
5. **Store key** plain text trên server (dùng env vars)

---

## Key Rotation

Nếu cần đổi encryption key:

### **1. Decrypt với key cũ**

```bash
# Set old key
export ENCRYPTION_KEY=old_key_here

# Run decrypt script
node scripts/decrypt-jobs.js
```

### **2. Encrypt với key mới**

```bash
# Set new key
export ENCRYPTION_KEY=new_key_here

# Run encrypt script
node scripts/encrypt-jobs.js
```

### **3. Update .env**

```env
ENCRYPTION_KEY=new_key_here
```

### **4. Restart application**

```bash
npm restart
```

---

## Security Checklist

- [ ] ENCRYPTION_KEY được generate và set trong `.env`
- [ ] File `.env` được add vào `.gitignore`
- [ ] WEBHOOK_SECRET được set
- [ ] Jobs mới được encrypt tự động
- [ ] Backup jobs.json trước khi migrate
- [ ] Test job execution với encrypted data
- [ ] Key được store secure (không commit vào Git)
- [ ] Team members có access key qua secure channel

---

**📚 Related Documentation:**
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [AES-256-CBC Encryption](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard)
- [Environment Variables Best Practices](https://12factor.net/config)

---

*Last Updated: 2025-11-06*  
*Version: 1.0.0*
