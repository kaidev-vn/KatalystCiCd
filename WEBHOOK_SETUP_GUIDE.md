# 🔗 Webhook Setup Guide

> Hướng dẫn chi tiết cấu hình Webhook cho GitLab và GitHub

---

## 📋 Tổng quan

Khi tạo Job với **Trigger Method = Webhook** hoặc **Hybrid**, bạn cần cấu hình webhook trên Git provider để hệ thống nhận được events khi có push mới.

---

## 🎯 Bước 1: Lấy Webhook Configuration

### Trong UI (http://localhost:9001)

1. Vào tab **"Jobs"**
2. Click **"➕ Thêm Job Mới"** hoặc edit job hiện có
3. Chọn **Trigger Method**:
   - ⚡ **Webhook** (recommended)
   - 🛡️ **Hybrid** (webhook + polling fallback)

4. **Webhook Configuration** sẽ tự động hiện ra:
   ```
   ⚙️ Cấu hình Webhook
   ├─ Webhook URL: http://localhost:9001/webhook/gitlab (hoặc /github)
   └─ Secret Token: ••••••••••••••••
   ```

5. Click nút **"📋 Copy"** để copy Webhook URL
6. Click nút **"👁️ Show & Copy"** để xem và copy Secret Token

---

## 🦊 Bước 2A: Setup Webhook trên GitLab

### 2A.1. Vào GitLab Repository Settings

1. Mở GitLab repository của bạn
2. Vào **Settings → Webhooks** (sidebar trái)

### 2A.2. Add Webhook

**URL:**
```
http://your-server.com:9001/webhook/gitlab
```
> ⚠️ Trong production, thay `localhost` bằng domain/IP public của server

**Secret token:**
```
Paste secret token từ UI (đã copy ở bước 1)
```

**Trigger:**
- ✅ Check: **Push events**
- Chọn branch: `main` hoặc branch bạn muốn monitor
- ❌ Uncheck: Merge requests, Issues, v.v. (không cần)

**SSL verification:**
- ✅ Enable (nếu dùng HTTPS)
- ❌ Disable (nếu dùng HTTP hoặc self-signed cert)

### 2A.3. Test Webhook

1. Click **"Add webhook"**
2. Webhook sẽ xuất hiện trong danh sách
3. Click **"Test" → "Push events"**
4. Kiểm tra response:
   - ✅ HTTP 200: Success
   - ❌ HTTP 401: Secret token sai
   - ❌ HTTP 404: URL sai hoặc server không chạy

---

## 🐙 Bước 2B: Setup Webhook trên GitHub

### 2B.1. Vào GitHub Repository Settings

1. Mở GitHub repository của bạn
2. Vào **Settings → Webhooks** (tab trên)
3. Click **"Add webhook"**

### 2B.2. Configure Webhook

**Payload URL:**
```
http://your-server.com:9001/webhook/github
```
> ⚠️ Trong production, thay `localhost` bằng domain/IP public của server

**Content type:**
```
application/json
```

**Secret:**
```
Paste secret token từ UI (đã copy ở bước 1)
```

**Which events would you like to trigger this webhook?**
- 🔘 Select: **Just the push event**

**Active:**
- ✅ Check: **Active**

### 2B.3. Test Webhook

1. Click **"Add webhook"**
2. GitHub sẽ gửi một ping event
3. Kiểm tra **"Recent Deliveries"**:
   - ✅ Green check: Success
   - ❌ Red X: Failed (xem response để debug)

---

## 🔐 Bước 3: Verify Security

### 3.1. Check Webhook Secret

Webhook sử dụng **HMAC-SHA256** signature verification để đảm bảo requests đến từ Git provider hợp lệ.

**GitLab Header:**
```
X-Gitlab-Token: your-secret-token
```

**GitHub Header:**
```
X-Hub-Signature-256: sha256=<hmac-signature>
```

### 3.2. Set WEBHOOK_SECRET

**Development:**
```bash
# File: .env
WEBHOOK_SECRET=YOUR_GITLAB_SECRET_TOKEN
```

**Production:**
```bash
# Set environment variable
export WEBHOOK_SECRET="your-super-secret-token-here"

# Hoặc trong Docker
docker run -e WEBHOOK_SECRET="your-secret" ...
```

**Recommendation:**
- Dùng token dài ít nhất 32 ký tự
- Random, không dễ đoán
- Khác nhau cho mỗi environment (dev/staging/prod)

---

## 📊 Bước 4: Monitor Webhook Activity

### 4.1. Check Logs

```bash
# Xem realtime logs
curl http://localhost:9001/api/logs/stream

# Webhook logs sẽ hiển thị:
[WEBHOOK] Received GitLab push: repo/project, branch: main, commit: abc123
[WEBHOOK] Matched 2 jobs for this push
[WEBHOOK] ✅ Job "Build Frontend" triggered successfully
```

### 4.2. API Webhook Stats

```bash
GET http://localhost:9001/api/webhook/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalReceived": 45,
    "totalTriggered": 42,
    "byProvider": {
      "gitlab": 30,
      "github": 15
    },
    "recent": [
      {
        "provider": "gitlab",
        "repo": "group/project",
        "branch": "main",
        "commit": "abc123def456",
        "timestamp": "2025-11-05T10:30:00Z"
      }
    ]
  }
}
```

---

## 🔍 Troubleshooting

### ❌ Webhook không trigger build

**1. Check Job Configuration:**
```bash
GET /api/jobs/:jobId
```
Verify:
- `schedule.triggerMethod` = `"webhook"` hoặc `"hybrid"`
- `git.repoUrl` match với webhook repo
- `git.branch` match với push branch

**2. Check Logs:**
```bash
# Webhook có nhận được request không?
grep "WEBHOOK" logs.txt

# Có match được job nào không?
grep "Matched.*jobs" logs.txt
```

**3. Common Issues:**

| Issue | Cause | Fix |
|-------|-------|-----|
| HTTP 401 Unauthorized | Secret token sai | Re-check secret trong UI và Git provider |
| HTTP 404 Not Found | URL sai | Copy lại URL từ UI |
| Received nhưng không trigger | Repo URL không match | Check `git.repoUrl` format (có/không có .git) |
| Trigger nhưng không build | Job disabled | Enable job trong UI |

---

## 🚀 Advanced Configuration

### Webhook với Reverse Proxy (Nginx)

```nginx
# nginx.conf
server {
    listen 80;
    server_name ci.yourdomain.com;

    location /webhook/ {
        proxy_pass http://localhost:9001/webhook/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Webhook URL:**
```
https://ci.yourdomain.com/webhook/gitlab
```

### Webhook với HTTPS (Let's Encrypt)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d ci.yourdomain.com

# Auto-renew
sudo certbot renew --dry-run
```

### Multiple Environments

```bash
# Development
WEBHOOK_SECRET=dev-secret-123

# Staging
WEBHOOK_SECRET=staging-secret-456

# Production
WEBHOOK_SECRET=prod-secret-789-very-long-and-random
```

---

## ✅ Verification Checklist

Sau khi setup xong, verify:

- [ ] Webhook URL đã được thêm vào GitLab/GitHub
- [ ] Secret token match giữa UI và Git provider
- [ ] Test webhook thành công (HTTP 200)
- [ ] Push code test → webhook trigger → build chạy
- [ ] Check logs: webhook received và job triggered
- [ ] Check API stats: `totalReceived` tăng

---

## 📚 Resources

- **GitLab Webhooks**: https://docs.gitlab.com/ee/user/project/integrations/webhooks.html
- **GitHub Webhooks**: https://docs.github.com/en/webhooks
- **HMAC Security**: https://en.wikipedia.org/wiki/HMAC

---

## 🎉 Success!

Bây giờ mỗi khi push code, GitLab/GitHub sẽ tự động gọi webhook, hệ thống nhận event và trigger build ngay lập tức!

**Benefits:**
- ⚡ **Instant builds** (< 1 giây thay vì đợi polling)
- 🎯 **Zero overhead** (không tốn CPU/memory khi không có push)
- 📊 **Scalable** (nhiều repos không ảnh hưởng performance)
