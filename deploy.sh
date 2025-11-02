#!/bin/bash

# Xác định đường dẫn file config (có thể override bằng ENV CONFIG_JSON_PATH)
CONFIG_JSON_PATH="${CONFIG_JSON_PATH:-/opt/Ci-Cd/config.json}"

# Đọc cấu hình từ config.json ngay từ đầu
CFG_DOCKERFILE_PATH=""
CFG_CONTEXT_PATH=""
CFG_REPO_PATH=""
if [ -f "$CONFIG_JSON_PATH" ]; then
  if command -v jq >/dev/null 2>&1; then
    CFG_DOCKERFILE_PATH=$(jq -r '.docker.dockerfilePath // empty' "$CONFIG_JSON_PATH")
    CFG_CONTEXT_PATH=$(jq -r '.docker.contextPath // empty' "$CONFIG_JSON_PATH")
    CFG_REPO_PATH=$(jq -r '.repoPath // empty' "$CONFIG_JSON_PATH")
  else
    # Fallback không có jq: dùng grep/sed đơn giản
    CFG_DOCKERFILE_PATH=$(grep -E '"dockerfilePath"\s*:' "$CONFIG_JSON_PATH" | head -1 | sed -E 's/.*"dockerfilePath"\s*:\s*"([^"]*)".*/\1/')
    CFG_CONTEXT_PATH=$(grep -E '"contextPath"\s*:' "$CONFIG_JSON_PATH" | head -1 | sed -E 's/.*"contextPath"\s*:\s*"([^"]*)".*/\1/')
    CFG_REPO_PATH=$(grep -E '"repoPath"\s*:' "$CONFIG_JSON_PATH" | head -1 | sed -E 's/.*"repoPath"\s*:\s*"([^"]*)".*/\1/')
  fi
fi

# Đọc danh sách services từ config.json
echo "=====TECHRES DOCKER BUILDER====="
if [ -f "$CONFIG_JSON_PATH" ]; then
  echo "[CONFIG] Loading services from: $CONFIG_JSON_PATH"
  if command -v jq >/dev/null 2>&1; then
    # Sử dụng jq để đọc services từ config
    SERVICES=$(jq -r '.deployServices // []' "$CONFIG_JSON_PATH")
    if [ "$SERVICES" != "[]" ] && [ "$SERVICES" != "null" ]; then
      echo "$SERVICES" | jq -r 'to_entries[] | "\(.key + 1). \(.value.name) PORT:\(.value.port)"'
    else
      echo "No services found in config. Using default services..."
      # Fallback về danh sách mặc định
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
    fi
  else
    echo "jq not found. Using default services..."
    # Fallback về danh sách mặc định khi không có jq
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
  fi
else
  echo "Config file not found at: $CONFIG_JSON_PATH"
  echo "Using default services..."
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
fi
echo "====================="

if [ -n "$CHOICE" ]; then
  choice="$CHOICE"
  echo "[NON-INTERACTIVE] Choice: $choice"
else
  read -p "Enter your choice (1-13): " choice
fi

# Đọc thông tin service từ config dựa trên choice
if [ -f "$CONFIG_JSON_PATH" ] && command -v jq >/dev/null 2>&1; then
  SERVICES=$(jq -r '.deployServices // []' "$CONFIG_JSON_PATH")
  if [ "$SERVICES" != "[]" ] && [ "$SERVICES" != "null" ]; then
    # Đọc từ config
    SERVICE_INDEX=$((choice - 1))
    DOCKER_IMAGE_NAME=$(echo "$SERVICES" | jq -r ".[$SERVICE_INDEX].imageName // empty")
    DOCKER_IMAGE_PORT=$(echo "$SERVICES" | jq -r ".[$SERVICE_INDEX].port // empty")
    DOCKER_IMAGE_GRPC_PORT=$(echo "$SERVICES" | jq -r ".[$SERVICE_INDEX].grpcPort // empty")
    SERVICE_FILE_NAME=$(echo "$SERVICES" | jq -r ".[$SERVICE_INDEX].serviceFile // empty")
    
    if [ -z "$DOCKER_IMAGE_NAME" ]; then
      echo "Invalid choice or service not found in config"
      exit 1
    fi
  else
    # Fallback về case statement mặc định
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
  fi
else
  # Fallback về case statement mặc định khi không có jq hoặc config
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
fi

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
# Quản lý đường dẫn Dockerfile và Build Context (sử dụng config đã đọc từ đầu)
# -------------------------------------------------------------
echo "[CONFIG] Using config: $CONFIG_JSON_PATH"

# Ưu tiên theo thứ tự: ENV > config.docker > mặc định từ config
DOCKERFILE_PATH="${DOCKERFILE_PATH:-${CFG_DOCKERFILE_PATH}}"
# Nếu vẫn rỗng, fallback về đường dẫn mặc định tương đối với CONFIG_JSON_PATH
if [ -z "$DOCKERFILE_PATH" ]; then
  CONFIG_DIR=$(dirname "$CONFIG_JSON_PATH")
  DOCKERFILE_PATH="${CONFIG_DIR}/Dockerfile"
fi

# Nếu có REPO_PATH từ ENV (ứng dụng truyền vào), dùng trước khi fallback sang config
CONTEXT_PATH_DEFAULT="${CFG_CONTEXT_PATH:-${CFG_REPO_PATH}}"
# Nếu vẫn rỗng, fallback về đường dẫn mặc định tương đối với CONFIG_JSON_PATH
if [ -z "$CONTEXT_PATH_DEFAULT" ]; then
  CONFIG_DIR=$(dirname "$CONFIG_JSON_PATH")
  CONTEXT_PATH_DEFAULT="${CONFIG_DIR}/../run_java/docker-build-app/system/"
fi
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

# if [ ! -f "techres.config.properties" ]; then
#     echo "techres.config.properties not found"
#     exit 1
# fi

# if [ ! -f "docker-compose.yml" ]; then
#     echo "docker-compose.yml not found"
#     exit 1
# fi

# Không kiểm tra Dockerfile trong thư mục hiện tại vì dùng Dockerfile bên ngoài (DOCKERFILE_PATH)
# if [ ! -f "Dockerfile" ]; then
#     echo "Dockerfile not found"
#     exit 1
# fi

# if [ ! -f "build.sh" ]; then
#     echo "build.sh not found"
#     exit 1
# fi



rm -rf ${DOCKER_IMAGE_NAME}
mkdir -p ${DOCKER_IMAGE_NAME}

# Copy các file cần thiết từ context path (bỏ qua JAR file vì sẽ build trong Dockerfile)
# cp ${SERVICE_FILE_NAME} ${DOCKER_IMAGE_NAME}/service-file.jar
if [ -f "${CONTEXT_PATH}/techres.config.properties" ]; then
  cp "${CONTEXT_PATH}/techres.config.properties" ${DOCKER_IMAGE_NAME}/
else
  echo "WARNING: techres.config.properties not found in context path"
fi

if [ -f "${CONTEXT_PATH}/docker-compose.yml" ]; then
  cp "${CONTEXT_PATH}/docker-compose.yml" ${DOCKER_IMAGE_NAME}/
else
  echo "WARNING: docker-compose.yml not found in context path"
fi

if [ -f "${CONTEXT_PATH}/Dockerfile" ]; then
  cp "${CONTEXT_PATH}/Dockerfile" ${DOCKER_IMAGE_NAME}/
else
  echo "WARNING: Dockerfile not found in context path"
fi

if [ -f "${CONTEXT_PATH}/build.sh" ]; then
  cp "${CONTEXT_PATH}/build.sh" ${DOCKER_IMAGE_NAME}/
else
  echo "WARNING: build.sh not found in context path"
fi

cd ${DOCKER_IMAGE_NAME}

# Thay thế parameters trong docker-compose.yml nếu file tồn tại
if [ -f "docker-compose.yml" ]; then
  sed -i "s|PARAM_DOCKER_IMAGE_NAME|${DOCKER_IMAGE_NAME}|g" docker-compose.yml
  sed -i "s|PARAM_DOCKER_IMAGE_TAG|${DOCKER_IMAGE_TAG}|g" docker-compose.yml
  sed -i "s|PARAM_DOCKER_IMAGE_PORT|${DOCKER_IMAGE_PORT}|g" docker-compose.yml
  sed -i "s|PARAM_DOCKER_IMAGE_GRPC_PORT|${DOCKER_IMAGE_GRPC_PORT}|g" docker-compose.yml
else
  echo "WARNING: docker-compose.yml not available for parameter replacement"
fi
# No need to replace SERVICE_FILE in Dockerfile as we're using a fixed filename
echo "[DOCKER BUILD] Using Dockerfile: ${DOCKERFILE_PATH}"
echo "[DOCKER BUILD] Using Context: ${CONTEXT_PATH}"
docker build --no-cache \
  -f "${DOCKERFILE_PATH}" \
  --build-arg BUILD_CONTEXT_PATH="${CONTEXT_PATH}" \
  -t "${DOCKER_IMAGE}" \
  "${CONTEXT_PATH}"

cd ..
rm -rf ${DOCKER_IMAGE_NAME}

# -------------------------------------------------------------
# Docker Swarm Deploy (tự động)
# -------------------------------------------------------------
echo "=====DOCKER SWARM DEPLOY====="
  
  # Xác định thông tin Swarm từ config hoặc service info
  STACK_NAME="${DOCKER_IMAGE_NAME}-stack"
  HEALTH_CHECK_PORT="${DOCKER_IMAGE_PORT}"
  # Fix constraint syntax - cần quotes đúng cách
  DOCKER_SWARM_NODE_CONSTRAINTS="${DOCKER_SWARM_NODE_CONSTRAINTS:-node.labels.purpose==api}"
  TEMPLATE_FILE="${TEMPLATE_FILE:-docker-compose.yml}"
  
  # Xác định đường dẫn template file từ context path
  TEMPLATE_PATH="${CONTEXT_PATH}/${TEMPLATE_FILE}"
  
  # Kiểm tra template file tồn tại trong context path
  if [ ! -f "${TEMPLATE_PATH}" ]; then
    echo "Template file not found: ${TEMPLATE_PATH}"
    echo "Skipping Swarm deployment"
  else
    echo "Stack Name: ${STACK_NAME}"
    echo "Health Check Port: ${HEALTH_CHECK_PORT}"
    echo "Node Constraints: ${DOCKER_SWARM_NODE_CONSTRAINTS}"
    echo "Template: ${TEMPLATE_PATH}"
    
    # Pull image để đảm bảo nó có trên các node
    echo "Pulling image for Swarm nodes..."
    docker pull ${DOCKER_IMAGE}
    
    # Chuẩn bị file deploy
    DEPLOY_DIR="${DOCKER_IMAGE_NAME}-deploy"
    mkdir -p "${DEPLOY_DIR}"
    cp "${TEMPLATE_PATH}" "${DEPLOY_DIR}/docker-compose.yml"
    cd "${DEPLOY_DIR}"
    
    # Thay thế các tham số trong file đã copy
    sed -i "s|PARAM_DOCKER_SERVICE_NAME|${DOCKER_IMAGE_NAME}|g" docker-compose.yml
    sed -i "s|PARAM_DOCKER_IMAGE_NAME|${DOCKER_IMAGE_NAME}|g" docker-compose.yml
    sed -i "s|PARAM_DOCKER_IMAGE_TAG|${DOCKER_IMAGE_TAG}|g" docker-compose.yml
    sed -i "s|PARAM_DOCKER_IMAGE_PORT|${DOCKER_IMAGE_PORT}|g" docker-compose.yml
    sed -i "s|PARAM_DOCKER_IMAGE_GRPC_PORT|${DOCKER_IMAGE_GRPC_PORT}|g" docker-compose.yml
    sed -i "s|PARAM_HEALTH_CHECK_PORT|${HEALTH_CHECK_PORT}|g" docker-compose.yml
    
    # Fix constraint syntax - thay thế và sửa constraints
    echo "Original constraint value: ${DOCKER_SWARM_NODE_CONSTRAINTS}"
    # Thay thế constraint parameter với giá trị đã format đúng
    sed -i "s|PARAM_DOCKER_SWARM_NODE_CONSTRAINTS|${DOCKER_SWARM_NODE_CONSTRAINTS}|g" docker-compose.yml
    
    # Debug: hiển thị file trước khi fix
    echo "Docker-compose.yml before constraint fix:"
    grep -A5 -B5 "constraint" docker-compose.yml || echo "No constraints found"
    
    # Fix constraint syntax - loại bỏ tất cả spaces quanh operators
    sed -i 's/ == /==/g' docker-compose.yml
    sed -i 's/ != /!=/g' docker-compose.yml
    sed -i 's/== /==/g' docker-compose.yml
    sed -i 's/ ==/==/g' docker-compose.yml
    sed -i 's/!= /!=/g' docker-compose.yml
    sed -i 's/ !=/!=/g' docker-compose.yml
    
    # Debug: hiển thị file sau khi fix
    echo "Docker-compose.yml after constraint fix:"
    grep -A5 -B5 "constraint" docker-compose.yml || echo "No constraints found"
    
    # Loại bỏ unsupported options cho Swarm mode
    sed -i '/build:/d' docker-compose.yml
    sed -i '/context:/d' docker-compose.yml
    sed -i '/dockerfile:/d' docker-compose.yml
    
    echo "Deploying stack: ${STACK_NAME}"
    echo "Using compose file:"
    cat docker-compose.yml
    echo "====================="
    
    # Validate compose file trước khi deploy
    echo "Validating compose file..."
    # Thử docker compose trước (phiên bản mới), fallback về docker-compose
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
      COMPOSE_CMD="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
      COMPOSE_CMD="docker-compose"
    else
      echo "WARNING: Neither 'docker compose' nor 'docker-compose' found. Skipping validation."
      COMPOSE_CMD=""
    fi
    
    if [ -n "$COMPOSE_CMD" ]; then
      if ! $COMPOSE_CMD -f docker-compose.yml config >/dev/null 2>&1; then
        echo "ERROR: Invalid docker-compose.yml file"
        $COMPOSE_CMD -f docker-compose.yml config
        exit 1
      fi
      echo "Compose file validation passed"
    fi
    
    # Kiểm tra và remove stack cũ nếu tồn tại để tránh port conflicts
    echo "Checking for existing stack: ${STACK_NAME}"
    if docker stack ls --format "table {{.Name}}" | grep -q "^${STACK_NAME}$"; then
      echo "Found existing stack ${STACK_NAME}, removing it first..."
      docker stack rm ${STACK_NAME}
      echo "Waiting for stack removal to complete..."
      sleep 10
      # Đợi cho đến khi stack thực sự bị xóa
      while docker stack ls --format "table {{.Name}}" | grep -q "^${STACK_NAME}$"; do
        echo "Still waiting for stack removal..."
        sleep 5
      done
      echo "Stack ${STACK_NAME} removed successfully"
    else
      echo "No existing stack found"
    fi
    
    # Triển khai Stack
    echo "Executing: docker stack deploy --compose-file docker-compose.yml ${STACK_NAME} --with-registry-auth"
    DEPLOY_OUTPUT=$(docker stack deploy --compose-file docker-compose.yml "${STACK_NAME}" --with-registry-auth 2>&1)
    DEPLOY_EXIT_CODE=$?
    
    echo "Deploy command output:"
    echo "$DEPLOY_OUTPUT"
    
    # Kiểm tra xem có lỗi thực sự không (bỏ qua warnings)
    if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
      # Kiểm tra xem có service creation errors không
      if echo "$DEPLOY_OUTPUT" | grep -q "failed to create service"; then
        echo "Stack deployment failed: Service creation error detected"
        echo "Error details: $DEPLOY_OUTPUT"
        echo "Troubleshooting steps:"
        echo "1. Check constraint syntax: docker node ls --format 'table {{.Hostname}}\t{{.Labels}}'"
        echo "2. Check if nodes have required labels: docker node update --label-add purpose=api <node-name>"
        echo "3. Check stack status: docker stack ps ${STACK_NAME}"
        echo "4. Check service logs: docker service logs ${STACK_NAME}_${DOCKER_IMAGE_NAME}"
      else
        echo "Stack deployed successfully: ${STACK_NAME}"
        echo "Note: Background task warnings are normal"
        echo "Check status with: docker stack ps ${STACK_NAME}"
        echo "Check services with: docker stack services ${STACK_NAME}"
      fi
    else
      echo "Stack deployment failed with exit code: $DEPLOY_EXIT_CODE"
      echo "Error output: $DEPLOY_OUTPUT"
      echo "Troubleshooting steps:"
      echo "1. Check if Docker Swarm is initialized: docker node ls"
      echo "2. Check if image exists: docker images | grep ${DOCKER_IMAGE_NAME}"
      echo "3. Check stack status: docker stack ps ${STACK_NAME}"
    fi
    
    cd ..
    rm -rf "${DEPLOY_DIR}"
  fi
  
  echo "=====SWARM DEPLOY COMPLETED====="

# -------------------------------------------------------------
# Push image to registry (sau khi deploy Swarm)
# -------------------------------------------------------------
if [ -z "$PUSH_IMAGE" ]; then
  read -p "Push image to registry? (y/n): " PUSH_IMAGE
else
  echo "[NON-INTERACTIVE] Push image: $PUSH_IMAGE"
fi

if [ "${PUSH_IMAGE}" = "y" ]; then
    echo "Pushing image to registry..."
    docker push ${DOCKER_IMAGE}
    echo "Image pushed successfully!"
fi