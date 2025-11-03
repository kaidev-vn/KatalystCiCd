# CI/CD Config Panel – Hướng dẫn sử dụng

Tài liệu này hướng dẫn cách cấu hình và vận hành hệ thống CI/CD nhỏ gọn dùng Node.js, hỗ trợ:

- Kiểm tra commit mới trên Git (GitLab/GitHub), tự động pull
- Build Docker image và push lên registry
- Tự động tăng tag sau mỗi lần build (ví dụ 1.0.74 ➜ 1.0.75)
- Lưu phiên bản cấu hình và phiên bản bảng build
- Hiển thị log realtime (SSE)

## 1) Yêu cầu hệ thống

- Node.js 16+ (đã cài đặt)
- Git (có sẵn trong PATH)
- Docker (có sẵn trong PATH)
- Quyền truy cập registry (nếu muốn push image)

## 2) Khởi chạy

1. Cài dependencies (nếu cần):
   - `npm install`
2. Chạy server:
   - `node app.js`
3. Mở giao diện cấu hình:
   - `http://localhost:9001/`

Server sẽ ghi log tiến trình ra console và đồng thời đẩy log lên UI qua SSE (Server-Sent Events).

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

## 5) Quy trình build Java: “build JAR trước, rồi build Docker”

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

## 6) Auto tag increment (tăng tag tự động)

- Khi bật, hệ thống sẽ tìm số cuối cùng trong tag và tăng +1 sau mỗi build thành công.
- Ví dụ: `1.0.74` ➜ `1.0.75`, `v1.0.74-BETA` ➜ `v1.0.75-BETA`.
- Nếu tag không chứa số, hệ thống sẽ thêm `.1` vào cuối.
- Tag mới sẽ được ghi vào `config.json` để dùng cho lần build sau.

## 7) Phiên bản cấu hình và builds

- Hệ thống lưu snapshot vào các thư mục:
  - `config_versions/` (lịch sử cấu hình)
  - `builds_versions/` (lịch sử bảng build)
- API hỗ trợ:
  - GET `/api/config/versions` – liệt kê snapshot cấu hình
  - POST `/api/config/rollback` – khôi phục cấu hình theo snapshot
  - GET `/api/builds/versions` – liệt kê snapshot builds

## 8) API chính (tham khảo)

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

## 9) Log realtime (SSE)

- UI kết nối `/api/logs/stream` để hiển thị log theo thời gian thực.
- Nếu thấy lỗi `net::ERR_ABORTED` trong preview, đó thường là reconnect SSE, hệ thống sẽ tự nối lại.

## 11) Bảo mật

- `config.json` hiện đang lưu Registry Password ở dạng plain text để thuận tiện cho demo. Trong môi trường thật:
  - Cân nhắc dùng biến môi trường hoặc vault (Vault/KeyVault/Parameter Store)
  - Mã hoá hoặc không lưu mật khẩu lâu dài trong file.
- Quyền truy cập repo/registry cần được cấp phù hợp.

## 10) .dockerignore gợi ý

Tạo file `.dockerignore` trong Context Path để giảm dung lượng context và tăng tốc build:

```
.git
node_modules
target
build
.env
.DS_Store
```

## 11) Khắc phục sự cố (Troubleshooting)

- `docker` hoặc `git` không chạy: kiểm tra PATH hệ thống.
- Lỗi quyền: chạy terminal với quyền phù hợp (Administrator nếu cần trên Windows).
- Registry login lỗi: kiểm tra URL/username/password, mạng và firewall.
- Không thấy file khi COPY trong Dockerfile: kiểm tra Context Path và `.dockerignore`.
- Không có commit mới: hệ thống sẽ bỏ qua pull/build để tiết kiệm thời gian.

## 12) Vận hành production (gợi ý)

- Chạy server bằng PM2/NSSM/Windows Service để tự khởi động khi máy chủ reboot.
- Giới hạn tần suất polling để tránh quá tải repo/registry.
- Gắn nhãn/tag theo chuẩn (ví dụ `MAJOR.MINOR.PATCH` hoặc theo commit hash) để truy vết dễ hơn.

---

Nếu bạn cần bổ sung “Run Steps trước Docker build” cho Java (Cách B), hoặc muốn mình thêm “Force redeploy” (deploy kể cả khi không có commit mới), vui lòng phản hồi để mình cập nhật thêm chức năng.