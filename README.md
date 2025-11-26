# K-Talyst CI/CD Automation System

Hệ thống CI/CD Self-hosted hiện đại, nhẹ nhàng, được viết bằng Node.js. Hệ thống hỗ trợ quản lý quy trình Build/Deploy tự động cho Docker, Script thuần và Monolith Repositories.

Phiên bản mới nhất đã được tái cấu trúc toàn diện (Refactoring) về Frontend, tích hợp Database và tối ưu hóa hiệu năng.

## 🚀 Tính năng nổi bật

### 1. Dashboard & UI hiện đại
- **Giao diện Glassmorphism**: Thiết kế hiện đại, trong suốt, hỗ trợ Dark Mode/Light Mode.
- **Dashboard Overview**: Theo dõi KPIs hệ thống (Success Rate, Queue Status, CPU/RAM usage giả lập) và hoạt động gần đây.
- **Mobile Responsive**: Tối ưu hiển thị trên mọi thiết bị di động.

### 2. Quản lý Jobs mạnh mẽ
- **Đa phương thức Build**:
  - 🐳 **Dockerfile**: Build & Push Docker image tự động.
  - 📜 **Script**: Tự động sinh `build-script.sh` và thực thi shell script tùy chỉnh.
  - 📦 **JSON Pipeline**: Định nghĩa quy trình build qua file JSON cấu hình.
- **Smart Triggers**:
  - **Polling**: Kiểm tra Git định kỳ.
  - **Webhook**: Trigger build ngay lập tức khi có push event.
  - **Hybrid**: Kết hợp Webhook (chính) và Polling (dự phòng).
- **Monolith Support**: Chỉ trigger build khi có thay đổi trong thư mục/module cụ thể.

### 3. Database & Migration
- **Đa nền tảng DB**: Hỗ trợ **SQLite** (mặc định, zero-config) và **PostgreSQL** (production).
- **Setup Wizard**: Giao diện cài đặt Database và migrate dữ liệu từ JSON cũ sang SQL ngay trên UI.
- **Data Integrity**: Dữ liệu Users, Jobs, History, Config được lưu trữ an toàn trong Database.

### 4. Realtime Logs tối ưu (xterm.js)
- Tích hợp **xterm.js** để render logs.
- **Virtual Scrolling**: Xử lý hàng nghìn dòng log mà không làm đơ trình duyệt.
- **ANSI Colors**: Hiển thị màu sắc log chuẩn terminal.

### 5. Bảo mật & Hệ thống
- **Secret Encryption**: Token và Password được mã hóa AES-256 trước khi lưu vào DB.
- **Build Queue**: Quản lý hàng đợi build có ưu tiên (Priority Queue).
- **Modular Frontend**: Code client-side được chia nhỏ thành ES Modules (`jobs.js`, `builds.js`, `logs.js`...) dễ bảo trì.

---

## 🛠️ Yêu cầu hệ thống

- **Node.js**: v18 trở lên.
- **Git**: Cài đặt sẵn trong PATH.
- **Docker**: Cài đặt sẵn để chạy Docker builds.
- **Database**: 
  - Không cần cài đặt thêm nếu dùng **SQLite**.
  - Cần server PostgreSQL nếu chọn chế độ Postgres.

---

## 📦 Cài đặt & Khởi chạy

1. **Clone & Install Dependencies:**
   ```bash
   git clone <repo-url>
   cd ci-cd-tool
   npm install
   ```

2. **Cấu hình môi trường (Tùy chọn):**
   Tạo file `.env` (xem `.env.example`):
   ```env
   PORT=9001
   ENCRYPTION_KEY=your-32-char-secret-key
   ```

3. **Chạy Server:**
   ```bash
   npm start
   # Hoặc chạy dev mode
   npm run dev
   ```

4. **Truy cập Web Dashboard:**
   - Mở trình duyệt: `http://localhost:9001`
   - **Lần đầu chạy**: Hệ thống sẽ hiển thị **Database Setup Wizard**.
   - Chọn "SQLite" để bắt đầu nhanh, hoặc "PostgreSQL" cho môi trường Production.
   - Hệ thống sẽ tự động migrate dữ liệu cũ (nếu có) vào Database mới.

---

## 🏗️ Cấu trúc Source Code (Developer Guide)

Sau khi Refactor, cấu trúc Frontend đã được module hóa:

```
public/
├── js/
│   ├── app.js          # Entry point chính, điều phối các modules
│   ├── jobs.js         # Logic quản lý Jobs (CRUD, Render Table)
│   ├── builds.js       # Logic lịch sử Build
│   ├── logs.js         # Xử lý xterm.js và SSE stream
│   ├── dashboard.js    # Logic trang Dashboard Overview
│   ├── database.js     # Logic Setup Wizard & DB Management
│   ├── queue.js        # Quản lý hàng đợi
│   ├── services.js     # Quản lý Services selection
│   ├── state.js        # Quản lý trạng thái Global (State management)
│   └── ...
├── main.js             # (Legacy/Fallback) Code cũ, đang dần loại bỏ
└── index.html          # Single Page Application
```

### Backend Service (Node.js)

- **`src/config/database.js`**: `DatabaseManager` xử lý kết nối đa năng (SQLite/PG).
- **`src/controllers/JobController.js`**: Xử lý logic build, trigger pipelines.
- **`src/services/GitService.js`**: Xử lý git operations, monolith checking.
- **`src/utils/secrets.js`**: Quản lý mã hóa/giải mã dữ liệu nhạy cảm.

---

## 📖 Hướng dẫn sử dụng nhanh

### 1. Tạo Job mới
1. Vào tab **Quản lý Jobs** -> **Tạo Job mới**.
2. Điền thông tin Git (Repo URL, Token, Branch).
3. Chọn phương thức Build:
   - **Dockerfile**: Chọn đường dẫn Dockerfile và Image Name.
   - **Script**: Hệ thống sẽ tự tạo script mẫu.
4. Cấu hình Trigger (Polling hoặc Webhook).
5. Nếu là Monolith: Check vào "Monolith" và điền đường dẫn cần theo dõi (ví dụ: `packages/backend/*`).

### 2. Cấu hình Webhook (Khuyên dùng)
Thay vì để hệ thống Polling liên tục:
1. Chọn Trigger Method là **Webhook** hoặc **Hybrid** trong Job.
2. Copy **Webhook URL** và **Secret Token** hiển thị trên UI.
3. Vào GitLab/GitHub -> Settings -> Webhooks -> Dán URL và Secret -> Chọn trigger "Push events".

### 3. Xem Logs
- Vào tab **Quản lý Builds** hoặc click vào icon "Terminal" ở bất kỳ Job nào.
- Log sẽ hiển thị realtime. Sử dụng các nút điều khiển để Tạm dừng cuộn, Copy hoặc Clear log.

---

## 🔐 Cơ chế bảo mật

- **Encryption**: Mọi Git Token, Registry Password, API Key đều được mã hóa trước khi lưu vào DB (cột bắt đầu bằng `enc_`).
- **Middleware Check**: Middleware kiểm tra trạng thái Database trước khi cho phép gọi API nghiệp vụ.
- **Legacy JSON Backup**: Khi migrate sang DB, các file JSON cũ sẽ được backup (đổi tên thành `.bak`).

---

## ⚠️ Troubleshooting

- **Lỗi Database chưa init**: Truy cập trang chủ, Wizard sẽ tự hiện ra. Nếu không, vào tab "Cấu hình chung" -> "Database".
- **Lỗi xung đột UI**: Hãy chắc chắn bạn đã Hard Reload trình duyệt (`Ctrl + F5`) để xóa cache file JS cũ sau khi update server.
- **Log không hiện**: Kiểm tra kết nối SSE (`/api/logs/stream`) trong Network tab.

---

## 🔮 Roadmap

- [ ] Thêm phân quyền User (Role-based: Admin, Developer, Viewer).
- [ ] Tích hợp Slack/Telegram Notification (bên cạnh Email).
- [ ] Support Kubernetes Deployment (Helm Charts) trực tiếp từ UI.
