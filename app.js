// Nạp biến môi trường từ file .env (nếu có)
require('dotenv').config();
// Các biến môi trường cần thiết:
const PORT = Number(process.env.PORT || 9001); // Cổng bạn muốn listener chạy
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "YOUR_GITLAB_SECRET_TOKEN"; // Đặt cùng giá trị với Secret Token trong GitLab

const express = require('express');
const bodyParser = require('body-parser');
// const { exec } = require('child_process'); // Đã thay bằng utils/exec
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = express();

// New architecture (services & utils)
const { Logger } = require('./src/utils/logger');
const { ConfigService } = require('./src/services/ConfigService');
const { DockerService } = require('./src/services/DockerService');
const { SwarmService } = require('./src/services/SwarmService');
const { GitService } = require('./src/services/GitService');
const { Scheduler } = require('./src/services/Scheduler');
const { BuildService } = require('./src/services/BuildService');
const { run } = require('./src/utils/exec');
const { registerConfigController } = require('./src/controllers/ConfigController');
const { registerBuildsController } = require('./src/controllers/BuildsController');
const { registerGitController } = require('./src/controllers/GitController');
const { registerDockerController } = require('./src/controllers/DockerController');
const { registerSwarmController } = require('./src/controllers/SwarmController');
const { registerPullController } = require('./src/controllers/PullController');
const { registerWebhookController } = require('./src/controllers/WebhookController');
const { registerDeployController } = require('./src/controllers/DeployController');
const { SchedulerController } = require('./src/controllers/SchedulerController');

app.use(bodyParser.json());
// Phục vụ file tĩnh cho giao diện cấu hình CI/CD
app.use(express.static(path.join(__dirname, 'public')));

// Đường dẫn lưu trữ dữ liệu cấu hình đơn giản (JSON)
const DATA_DIR = __dirname;
const CONFIG_VERSIONS_DIR = path.join(DATA_DIR, 'config_versions');
const BUILDS_VERSIONS_DIR = path.join(DATA_DIR, 'builds_versions');
fs.mkdirSync(CONFIG_VERSIONS_DIR, { recursive: true });
fs.mkdirSync(BUILDS_VERSIONS_DIR, { recursive: true });

// Initialize services
const logger = new Logger();
logger.register(app);
const configService = new ConfigService({ dataDir: DATA_DIR, logger });
const dockerService = new DockerService({ logger, configService });
const swarmService = new SwarmService({ logger });
const gitService = new GitService({ logger, dockerService, configService });
const scheduler = new Scheduler({ logger, configService, gitService });
const buildService = new BuildService({ logger, configService });
const schedulerController = new SchedulerController({ scheduler, configService });

registerConfigController(app, { configService, scheduler, logger });
registerBuildsController(app, { configService, buildService });
registerGitController(app, { gitService });
registerDockerController(app, { dockerService, configService, swarmService, logger });
registerSwarmController(app, { swarmService, configService });
registerPullController(app, { configService, logger });
registerWebhookController(app, { logger, secret: WEBHOOK_SECRET });
registerDeployController(app, { logger, configService });

// Scheduler API routes
app.get('/api/scheduler/status', (req, res) => schedulerController.getStatus(req, res));
app.post('/api/scheduler/toggle', (req, res) => schedulerController.toggle(req, res));
app.post('/api/scheduler/restart', (req, res) => schedulerController.restart(req, res));


app.listen(PORT, () => {
  console.log(`Webhook Listener đang chạy trên cổng ${PORT}`);
  console.log(`Đảm bảo bạn đã chmod +x auto_deploy.sh`);
});

// Khởi động scheduler sau khi server sẵn sàng
process.nextTick(() => {
  scheduler.restart();
});
