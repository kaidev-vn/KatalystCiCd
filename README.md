# CI/CD Config Panel – Hướng dẫn sử dụng

Tài liệu này hướng dẫn cách cấu hình và vận hành hệ thống CI/CD nhỏ gọn dùng Node.js, hỗ trợ:

- Kiểm tra commit mới trên Git (GitLab/GitHub), tự động pull
- Build Docker image và push lên registry
- Tự động tăng tag sau mỗi lần build (ví dụ 1.0.74 ➜ 1.0.75)
- Lưu phiên bản cấu hình và phiên bản bảng build
- Hiển thị log realtime (SSE)
- Quản lý Jobs (create/update/run), hỗ trợ phương thức Script với tự động tạo build-script.sh và thư mục builder
- Hàng đợi (Queue) để xếp lịch chạy job, kèm Job Scheduler

## 1) Yêu cầu hệ thống

- Node.js 16+ (đã cài đặt)
- Git (có sẵn trong PATH)
- Docker (có sẵn trong PATH)
- Quyền truy cập registry (nếu muốn push image)

## 2) Khởi chạy

1. Cài dependencies (nếu cần):
   - `npm install`
2. Chạy server:
   - `npm start` hoặc `node app.js`
3. Mở giao diện cấu hình:
   - `http://localhost:9001/`

Server sẽ ghi log tiến trình ra console và đồng thời đẩy log lên UI qua SSE (Server-Sent Events).

### Khởi tạo Context Katalyst (tuỳ chọn nhưng khuyến nghị)

Hệ thống hỗ trợ cấu trúc context chuẩn để lưu repo và các script build:

- `Katalyst/repo`: nơi clone/pull repository
- `Katalyst/builder`: nơi sinh script cho từng job

Để khởi tạo nhanh (khi bạn đã có đường dẫn gốc), dùng API:

- POST `/api/config/init-context` với body `{ "basePath": "D:/SOURCE-CODE" }`
- Kết quả: tạo `D:/SOURCE-CODE/Katalyst/{repo,builder}`

Sau đó, trong cấu hình bạn có thể đặt `Context initialization path` = `D:/SOURCE-CODE` để các chức năng tự động dùng đúng context.

## 3) Cấu hình GitLab/GitHub (mục 1 trong UI)

- Provider: gitlab hoặc github (thông tin cơ bản)
- Polling (giây): chu kỳ kiểm tra commit mới. Tối thiểu 5 giây.
- Account, Token: chỉ để tham chiếu (chưa bắt buộc)
- Repo URL: địa chỉ repository (ví dụ: `https://gitlab.com/my-org/my-repo.git`)
- Repo Path: thư mục repo đã clone trên máy chạy CI (ví dụ: `D:/repos/my-repo`)
- Branch: nhánh cần theo dõi (ví dụ: `main`)
- Tự động Check + Pull + Build (checkbox): nếu bật, server sẽ tự kiểm tra và khi có commit mới thì pull và chạy build Docker.

Sau khi nhấn “Lưu cấu hình”, lịch auto-check sẽ khởi động/khởi động lại theo cấu hình mới.

## 4) Docker Build (mục 4 trong UI)

- Dockerfile Path: đường dẫn tới file Dockerfile.
- Context Path: thư mục gốc dùng làm build context cho `docker build`.
  - COPY/ADD trong Dockerfile hoạt động dựa trên Context Path.
  - Luôn thiết lập đúng Context Path (ví dụ thư mục module/service hoặc repo root).
- Image Name: địa chỉ image đầy đủ (ví dụ: `my-registry.com/myproj/myapp`).
- Image Tag: tag ban đầu (ví dụ `1.0.74`).
- Tự động tăng tag sau mỗi lần build: nếu bật, hệ thống sẽ tăng số ở cuối tag (ví dụ `1.0.74` ➜ `1.0.75`) sau build thành công.
- Registry URL/Username/Password: điền nếu muốn `docker push`.

### Giải thích Context Path

Context Path là thư mục mà Docker đóng gói và gửi sang Docker daemon khi build. Các lệnh COPY/ADD sẽ lấy file từ thư mục này (theo đường dẫn tương đối). Hãy tạo `.dockerignore` để loại trừ các thư mục lớn không cần thiết (ví dụ `.git`, `target/`, `build/`, `node_modules/`, `.env`).

## 5) Quản lý Jobs và phương thức Script

Ngoài việc build trực tiếp từ cấu hình Docker, hệ thống cung cấp tab Jobs để bạn tạo/cập nhật/chạy các job tuỳ biến. Đặc biệt, với phương thức build “Script”:

- Ngay khi lưu job, hệ thống tự động tạo thư mục builder cho job tại:
  - `<ContextInitPath>/Katalyst/builder/<job-name-kebab-case>-<job_id>`
- Tự động sinh file `build-script.sh` bên trong, được điền sẵn các biến cấu hình (không chứa thông tin nhạy cảm):

Ví dụ nội dung `build-script.sh` được sinh:

```
#!/usr/bin/env bash

# Auto-generated build script for job: <JOB_NAME> (<JOB_ID>)
# Context root: <KatalystRoot>
# Created at: <ISO-Timestamp>

# Git
BRANCH="<branch>"
REPO_URL="<repoUrl>"
REPO_PATH="<.../Katalyst/repo>"

# Docker Build Config
CONTEXT_PATH="<docker.contextPath | repo>"
DOCKERFILE_PATH="<docker.dockerfilePath>"
IMAGE_NAME="<imageName>"
IMAGE_TAG_NUMBER="<imageTagNumber>"
IMAGE_TAG_TEXT="<imageTagText>"
IMAGE_TAG="<imageTag | latest>"
AUTO_TAG_INCREMENT="<true|false>"
REGISTRY_URL="<registryUrl>"

# Job Info
JOB_ID="<jobId>"
JOB_NAME="<jobName>"
KATALYST_ROOT="<.../Katalyst>"
JOB_BUILDER_DIR="<.../Katalyst/builder/<job>-<id>>"

echo "[BUILD-SCRIPT] Job: $JOB_NAME ($JOB_ID)"
echo "[BUILD-SCRIPT] Context: $CONTEXT_PATH"
echo "[BUILD-SCRIPT] Dockerfile: $DOCKERFILE_PATH"
echo "[BUILD-SCRIPT] Image: $IMAGE_NAME:$IMAGE_TAG"
echo "[BUILD-SCRIPT] Registry: $REGISTRY_URL"

# TODO: Thêm lệnh build của bạn bên dưới
# Ví dụ:
# docker build -f "$DOCKERFILE_PATH" -t "$IMAGE_NAME:$IMAGE_TAG" "$CONTEXT_PATH"
# docker push "$IMAGE_NAME:$IMAGE_TAG"

# Lưu ý bảo mật: KHÔNG ghi thông tin đăng nhập trong file .sh.
# Hãy export REGISTRY_USERNAME/REGISTRY_PASSWORD từ môi trường hoặc dùng credential store.
# Ví dụ (chỉ tham khảo, tránh commit mật khẩu):
# echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" -u "$REGISTRY_USERNAME" --password-stdin
```

Ngoài ra, đường dẫn script `scriptPath` của job sẽ được cập nhật trỏ tới file vừa sinh. Khi bạn chỉnh sửa thông tin job (ví dụ image/tag/context), nội dung `build-script.sh` cũng sẽ được cập nhật tương ứng để phản ánh cấu hình mới.

Ghi chú vận hành trên Windows:
- Nếu chạy `.sh` trên Windows, cần Git Bash hoặc WSL; hệ thống sẽ gọi `bash "<script>"` cho .sh.
- Nếu script là `.ps1`, hệ thống sẽ dùng PowerShell (`-ExecutionPolicy Bypass`).
- Nếu `.bat`/`.cmd`, hệ thống gọi trực tiếp.

Thư mục làm việc (working directory) khi chạy script:
- Ưu tiên: `workingDir` truyền vào ➜ `ContextInitPath/Katalyst/repo` ➜ `thư mục chứa script` ➜ `process.cwd()`.
- Hệ thống sẽ log cảnh báo nếu thư mục không tồn tại và tự động fallback.

## 6) Quy trình build Java: “build JAR trước, rồi build Docker”

Bạn có 2 lựa chọn:

### A) Docker multi-stage (khuyến nghị)

- Build JAR ngay trong Dockerfile, sau đó copy JAR vào image runtime.
- Ví dụ Maven (Java 17):

```
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
```

- Ví dụ Gradle (Java 17):

```
FROM gradle:8.5-jdk17 AS builder
WORKDIR /app
COPY . .
RUN gradle clean build -x test

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
```

- Ưu điểm: đơn giản, reproducible; chỉ cần hệ thống chạy tính năng “Check + Pull + Build” là đủ.

### B) Build JAR trên host rồi mới build Docker

- Dùng “Steps” (bảng Build) để chạy `mvn/gradle` tạo JAR trước, sau đó Dockerfile chỉ COPY JAR đã build sẵn.
- Hiện hệ thống chưa kích hoạt nút “Run Steps” trong pipeline tự động; nếu bạn muốn, có thể yêu cầu bổ sung. Khi đó quy trình sẽ: “Run Steps ➜ Docker build ➜ push ➜ (tuỳ chọn) deploy”.

## 7) Auto tag increment (tăng tag tự động)

- Khi bật, hệ thống sẽ tìm số cuối cùng trong tag và tăng +1 sau mỗi build thành công.
- Ví dụ: `1.0.74` ➜ `1.0.75`, `v1.0.74-BETA` ➜ `v1.0.75-BETA`.
- Nếu tag không chứa số, hệ thống sẽ thêm `.1` vào cuối.
- Tag mới sẽ được ghi vào `config.json` để dùng cho lần build sau.

## 8) Reset cấu hình (demo/làm sạch)

Bạn có thể đặt lại toàn bộ `config.json` về rỗng để xoá thông tin nhạy cảm và bắt đầu cấu hình mới. Khi cấu hình rỗng:
- Hầu hết tính năng sẽ chờ bạn nhập lại giá trị tối thiểu (provider, repoUrl, branch, contextInitPath, Docker image…)
- Các job Script vẫn được sinh thư mục/script nhưng biến sẽ trống cho tới khi bạn cập nhật.

## 9) Phiên bản cấu hình và builds

- Hệ thống lưu snapshot vào các thư mục:
  - `config_versions/` (lịch sử cấu hình)
  - `builds_versions/` (lịch sử bảng build)
- API hỗ trợ:
  - GET `/api/config/versions` – liệt kê snapshot cấu hình
  - POST `/api/config/rollback` – khôi phục cấu hình theo snapshot
  - GET `/api/builds/versions` – liệt kê snapshot builds

## 10) API chính (tham khảo)

- Cấu hình:
  - GET `/api/config`
  - POST `/api/config`
  - GET `/api/config/versions`
  - POST `/api/config/rollback`
- Bảng Build:
  - GET `/api/builds`
  - POST `/api/builds`
  - PUT `/api/builds/:id`
  - DELETE `/api/builds/:id`
  - GET `/api/builds/versions`
- Docker:
  - POST `/api/docker/build` – build & (tuỳ chọn) push
- Git:
  - POST `/api/git/check-and-build` – check commit mới ➜ pull ➜ build & push
  - POST `/api/pull/start` – mô phỏng hoặc thực thi pull
- Log realtime:
  - GET `/api/logs/stream` – SSE stream

- Jobs:
  - GET `/api/jobs` – liệt kê tất cả jobs
  - GET `/api/jobs/enabled` – liệt kê jobs đang bật
  - GET `/api/jobs/:id` – xem chi tiết
  - POST `/api/jobs` – tạo job
  - PUT `/api/jobs/:id` – cập nhật job
  - DELETE `/api/jobs/:id` – xoá job
  - POST `/api/jobs/:id/toggle` – bật/tắt job
  - POST `/api/jobs/:id/run` – đưa job vào hàng đợi chạy

- Queue (Hàng đợi):
  - POST `/api/queue/add` – thêm job vào queue
  - GET `/api/queue/status` – xem trạng thái hàng đợi
  - GET `/api/queue/stats` – thống kê
  - DELETE `/api/queue/:jobId` – huỷ job trong queue
  - PUT `/api/queue/config` – cập nhật cấu hình queue
  - POST `/api/queue/toggle` – bật/tắt xử lý queue
  - POST `/api/jobs/:jobId/run-immediate` – chạy job ngay lập tức (bỏ qua thứ tự)

- Job Scheduler:
  - GET `/api/scheduler/status` – trạng thái scheduler
  - POST `/api/scheduler/toggle` – bật/tắt scheduler
  - POST `/api/scheduler/restart` – khởi động lại scheduler

## 11) Log realtime (SSE)

- UI kết nối `/api/logs/stream` để hiển thị log theo thời gian thực.
- Nếu thấy lỗi `net::ERR_ABORTED` trong preview, đó thường là reconnect SSE, hệ thống sẽ tự nối lại.

## 12) Múi giờ thông báo (Email)

Các thông báo thời gian trong email đã được định dạng theo locale Việt Nam và timezone Việt Nam:
- Locale: `vi-VN`
- Timezone: `Asia/Ho_Chi_Minh`

## 13) Bảo mật

- `config.json` có thể lưu thông tin nhạy cảm (token, mật khẩu). Trong môi trường thật:
  - Cân nhắc dùng biến môi trường hoặc vault (Vault/KeyVault/Parameter Store)
  - Mã hoá hoặc không lưu mật khẩu lâu dài trong file.
- Auto-generated `build-script.sh` KHÔNG chứa thông tin đăng nhập; hãy truyền qua biến môi trường hoặc credential store.
- Quyền truy cập repo/registry cần được cấp phù hợp.

## 14) .dockerignore gợi ý

Tạo file `.dockerignore` trong Context Path để giảm dung lượng context và tăng tốc build:

```
.git
node_modules
target
build
.env
.DS_Store
```

## 15) Khắc phục sự cố (Troubleshooting)

- `docker` hoặc `git` không chạy: kiểm tra PATH hệ thống.
- Lỗi quyền: chạy terminal với quyền phù hợp (Administrator nếu cần trên Windows).
- Registry login lỗi: kiểm tra URL/username/password, mạng và firewall.
- Không thấy file khi COPY trong Dockerfile: kiểm tra Context Path và `.dockerignore`.
- Không có commit mới: hệ thống sẽ bỏ qua pull/build để tiết kiệm thời gian.

## 16) Vận hành production (gợi ý)

- Chạy server bằng PM2/NSSM/Windows Service để tự khởi động khi máy chủ reboot.
- Giới hạn tần suất polling để tránh quá tải repo/registry.
- Gắn nhãn/tag theo chuẩn (ví dụ `MAJOR.MINOR.PATCH` hoặc theo commit hash) để truy vết dễ hơn.

---

Nếu bạn cần bổ sung “Run Steps trước Docker build” cho Java (Cách B), hoặc muốn mình thêm “Force redeploy” (deploy kể cả khi không có commit mới), vui lòng phản hồi để mình cập nhật thêm chức năng.