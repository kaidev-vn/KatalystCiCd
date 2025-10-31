#!/bin/bash

echo "=====TECHRES DOCKER BUILDER====="
echo "1. harbor.techres.vn/overatevntech/admin-schedule-service PORT:8009"
echo "2. harbor.techres.vn/overatevntech/admin-service PORT:8088"
echo "3. harbor.techres.vn/overatevntech/aloline-service PORT:8082"
echo "4. harbor.techres.vn/overatevntech/oauth-service PORT:8888"
echo "5. harbor.techres.vn/overatevntech/order-service-process-one PORT:8197"
echo "6. harbor.techres.vn/overatevntech/order-service-process-three PORT:8097"
echo "7. harbor.techres.vn/overatevntech/schedule-service PORT:8008"
echo "8. harbor.techres.vn/overatevntech/supplier-service PORT:8087"
echo "9. harbor.techres.vn/overatevntech/seemt-service PORT:8093"
echo "10. harbor.techres.vn/overatevntech/kafka-restaurant-schedule-service PORT:8100"
echo "11. harbor.techres.vn/overatevntech/kafka-techres-admin-schedule-service PORT:8101"
echo "12. harbor.techres.vn/overatevntech/restaurant-dashboard-service PORT:8095"
echo "13. harbor.techres.vn/overatevntech/springdoc-service PORT:8099"
echo "====================="

if [ -n "$CHOICE" ]; then
  choice="$CHOICE"
  echo "[NON-INTERACTIVE] Choice: $choice"
else
  read -p "Enter your choice (1-13): " choice
fi

case $choice in
    1)
        DOCKER_IMAGE_NAME="java-daihy-admin-schedule"
        DOCKER_IMAGE_PORT="8009"
        DOCKER_IMAGE_GRPC_PORT="9097"
        SERVICE_FILE_NAME="net.techres.admin.schedule.jar"
        ;;
    2)
        DOCKER_IMAGE_NAME="java-daihy-admin"
        DOCKER_IMAGE_PORT="8088"
        DOCKER_IMAGE_GRPC_PORT="9093"
        SERVICE_FILE_NAME="net.techres.admin.api.jar"
        ;;
    3)
        DOCKER_IMAGE_NAME="java-daihy-aloline"
        DOCKER_IMAGE_PORT="8082"
        DOCKER_IMAGE_GRPC_PORT="9098"
        SERVICE_FILE_NAME="net.techres.aloline.jar"
        ;;
    4)
        DOCKER_IMAGE_NAME="java-daihy-oauth"
        DOCKER_IMAGE_PORT="8888"
        DOCKER_IMAGE_GRPC_PORT="1050"
        SERVICE_FILE_NAME="net.techres.oauth.jar"
        ;;
    5)
        DOCKER_IMAGE_NAME="java-daihy-order-process-one"
        DOCKER_IMAGE_PORT="8197"
        DOCKER_IMAGE_GRPC_PORT="9091"
        SERVICE_FILE_NAME="net.techres.order.api.jar"
        ;;
    6)
        DOCKER_IMAGE_NAME="java-daihy-order"
        DOCKER_IMAGE_PORT="8097"
        DOCKER_IMAGE_GRPC_PORT="8105"
        SERVICE_FILE_NAME="net.techres.order.api.jar"
        ;;
    7)
        DOCKER_IMAGE_NAME="java-daihy-shedule"
        DOCKER_IMAGE_PORT="8008"
        DOCKER_IMAGE_GRPC_PORT="8106"
        SERVICE_FILE_NAME="net.techres.schedule.jar"
        ;;
    8)
        DOCKER_IMAGE_NAME="java-daihy-supplier"
        DOCKER_IMAGE_PORT="8087"
        DOCKER_IMAGE_GRPC_PORT="9094"
        SERVICE_FILE_NAME="net.techres.supplier.api.jar"
        ;;
    9)
        DOCKER_IMAGE_NAME="java-daihy-seemt"
        DOCKER_IMAGE_PORT="8093"
        DOCKER_IMAGE_GRPC_PORT="1053"
        SERVICE_FILE_NAME="net.techres.tms.api.jar"
        ;;
    10)
        DOCKER_IMAGE_NAME="java-daihy-kafka-schedule"
        DOCKER_IMAGE_PORT="8100"
        DOCKER_IMAGE_GRPC_PORT="8109"
        SERVICE_FILE_NAME="net.techres.kafka_restaurant_schedule.jar"
        ;;
    11)
        DOCKER_IMAGE_NAME="java-daihy-kafka-techres-admin-schedule"
        DOCKER_IMAGE_PORT="8101"
        DOCKER_IMAGE_GRPC_PORT="9101"
        SERVICE_FILE_NAME="net.techres.kafka_techres_admin_schedule.jar"
        ;;
    12)
        DOCKER_IMAGE_NAME="java-daihy-seemt-dashboard"
        DOCKER_IMAGE_PORT="8011"
        DOCKER_IMAGE_GRPC_PORT="1055"
        SERVICE_FILE_NAME="net.techres.restaurant_dashboard.api.jar"
        ;;
    13)
        DOCKER_IMAGE_NAME="java-daihy-springdoc-service"
        DOCKER_IMAGE_PORT="8099"
        DOCKER_IMAGE_GRPC_PORT="8112"
        SERVICE_FILE_NAME="net.techres.springdoc.jar"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

if [ -z "$DOCKER_IMAGE_TAG" ]; then
  read -p "Enter image tag: " DOCKER_IMAGE_TAG
else
  echo "[NON-INTERACTIVE] Image tag: $DOCKER_IMAGE_TAG"
fi

DOCKER_IMAGE="harbor.techres.vn/daihy/${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}"
SERVICE_FILE="/app/service/${SERVICE_FILE_NAME}"

echo "=====DOCKER IMAGE REVIEW====="
echo "Docker image: harbor.techres.vn/daihy/${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}"
echo "- PORT: ${DOCKER_IMAGE_PORT}"
echo "- GRPC PORT: ${DOCKER_IMAGE_GRPC_PORT}"
echo "- SERVICE FILE: ${SERVICE_FILE_NAME}"
echo "====================="
if [ -z "$CONTINUE_BUILD" ]; then
  read -p "Continue to build this image? (y/n): " CONTINUE_BUILD
else
  echo "[NON-INTERACTIVE] Continue build: $CONTINUE_BUILD"
fi

if [ "${CONTINUE_BUILD}" != "y" ]; then
    echo "Build canceled"
    exit 0
fi

# -------------------------------------------------------------
# Quản lý đường dẫn Dockerfile và Build Context (đọc từ config, có thể override)
# -------------------------------------------------------------
# 1) Xác định đường dẫn file config (có thể override bằng ENV CONFIG_JSON_PATH)
CONFIG_JSON_PATH="${CONFIG_JSON_PATH:-/opt/Ci-Cd/config.json}"

# 2) Đọc cấu hình từ config.json nếu tồn tại
CFG_DOCKERFILE_PATH=""
CFG_CONTEXT_PATH=""
CFG_REPO_PATH=""
if [ -f "$CONFIG_JSON_PATH" ]; then
  echo "[CONFIG] Using config: $CONFIG_JSON_PATH"
  if command -v jq >/dev/null 2>&1; then
    CFG_DOCKERFILE_PATH=$(jq -r '.docker.dockerfilePath // empty' "$CONFIG_JSON_PATH")
    CFG_CONTEXT_PATH=$(jq -r '.docker.contextPath // empty' "$CONFIG_JSON_PATH")
    CFG_REPO_PATH=$(jq -r '.repoPath // empty' "$CONFIG_JSON_PATH")
  else
    # Fallback không có jq: dùng grep/sed đơn giản (không hoàn hảo nhưng đủ cho trường hợp cơ bản)
    CFG_DOCKERFILE_PATH=$(grep -E '"dockerfilePath"\s*:' "$CONFIG_JSON_PATH" | head -1 | sed -E 's/.*"dockerfilePath"\s*:\s*"([^"]*)".*/\1/')
    CFG_CONTEXT_PATH=$(grep -E '"contextPath"\s*:' "$CONFIG_JSON_PATH" | head -1 | sed -E 's/.*"contextPath"\s*:\s*"([^"]*)".*/\1/')
    CFG_REPO_PATH=$(grep -E '"repoPath"\s*:' "$CONFIG_JSON_PATH" | head -1 | sed -E 's/.*"repoPath"\s*:\s*"([^"]*)".*/\1/')
  fi
fi

# 3) Ưu tiên theo thứ tự: ENV > config.docker > config.repoPath (đối với context) > mặc định
DOCKERFILE_PATH="${DOCKERFILE_PATH:-${CFG_DOCKERFILE_PATH:-/opt/Ci-Cd/DockerFile-Build}}"
# Nếu có REPO_PATH từ ENV (ứng dụng truyền vào), dùng trước khi fallback sang config
CONTEXT_PATH_DEFAULT="${CFG_CONTEXT_PATH:-${CFG_REPO_PATH:-/opt/run_java/docker-build-app/system/}}"
CONTEXT_PATH="${CONTEXT_PATH:-${REPO_PATH:-$CONTEXT_PATH_DEFAULT}}"

echo "[PATHS] Dockerfile path: ${DOCKERFILE_PATH}"
echo "[PATHS] Build context: ${CONTEXT_PATH}"

# Kiểm tra sự tồn tại của Dockerfile và Context
if [ ! -f "${DOCKERFILE_PATH}" ]; then
    echo "Dockerfile not found at: ${DOCKERFILE_PATH}"
    exit 1
fi
if [ ! -d "${CONTEXT_PATH}" ]; then
    echo "Build context directory not found: ${CONTEXT_PATH}"
    exit 1
fi

# Hiển thị nhanh nội dung context và kiểm tra pom.xml
echo "=== CONTEXT OVERVIEW (${CONTEXT_PATH}) ==="
ls -la "${CONTEXT_PATH}" | head -50 || true
echo "=== SEARCH pom.xml in context ==="
FOUND_POM=$(find "${CONTEXT_PATH}" -name "pom.xml" -type f | head -1)
if [ -z "${FOUND_POM}" ]; then
  echo "WARNING: No pom.xml found in context. Maven build inside Docker will fail."
else
  echo "Found pom.xml: ${FOUND_POM}"
fi

# Bỏ qua kiểm tra file JAR vì sẽ được build trong Dockerfile
# if [ ! -f "${SERVICE_FILE_NAME}" ]; then
#     echo "${SERVICE_FILE_NAME} not found"
#     exit 1
# fi

if [ ! -f "techres.config.properties" ]; then
    echo "techres.config.properties not found"
    exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
    echo "docker-compose.yml not found"
    exit 1
fi

# Không kiểm tra Dockerfile trong thư mục hiện tại vì dùng Dockerfile bên ngoài (DOCKERFILE_PATH)
# if [ ! -f "Dockerfile" ]; then
#     echo "Dockerfile not found"
#     exit 1
# fi

if [ ! -f "build.sh" ]; then
    echo "build.sh not found"
    exit 1
fi



rm -rf ${DOCKER_IMAGE_NAME}
mkdir -p ${DOCKER_IMAGE_NAME}

# Copy các file cần thiết (bỏ qua JAR file vì sẽ build trong Dockerfile)
# cp ${SERVICE_FILE_NAME} ${DOCKER_IMAGE_NAME}/service-file.jar
cp techres.config.properties ${DOCKER_IMAGE_NAME}/
cp docker-compose.yml ${DOCKER_IMAGE_NAME}/
cp Dockerfile ${DOCKER_IMAGE_NAME}/
cp build.sh ${DOCKER_IMAGE_NAME}/

cd ${DOCKER_IMAGE_NAME}

sed -i "s|PARAM_DOCKER_IMAGE_NAME|${DOCKER_IMAGE_NAME}|g" docker-compose.yml
sed -i "s|PARAM_DOCKER_IMAGE_TAG|${DOCKER_IMAGE_TAG}|g" docker-compose.yml
sed -i "s|PARAM_DOCKER_IMAGE_PORT|${DOCKER_IMAGE_PORT}|g" docker-compose.yml
sed -i "s|PARAM_DOCKER_IMAGE_GRPC_PORT|${DOCKER_IMAGE_GRPC_PORT}|g" docker-compose.yml
# No need to replace SERVICE_FILE in Dockerfile as we're using a fixed filename
echo "[DOCKER BUILD] Using Dockerfile: ${DOCKERFILE_PATH}"
echo "[DOCKER BUILD] Using Context: ${CONTEXT_PATH}"
docker build --no-cache \
  -f "${DOCKERFILE_PATH}" \
  --build-arg BUILD_CONTEXT_PATH="${CONTEXT_PATH}" \
  -t "${DOCKER_IMAGE}" \
  "${CONTEXT_PATH}"

if [ -z "$PUSH_IMAGE" ]; then
  read -p "Push image to registry? (y/n): " PUSH_IMAGE
else
  echo "[NON-INTERACTIVE] Push image: $PUSH_IMAGE"
fi

if [ "${PUSH_IMAGE}" = "y" ]; then
    docker push ${DOCKER_IMAGE}
fi

cd ..
rm -rf ${DOCKER_IMAGE_NAME}