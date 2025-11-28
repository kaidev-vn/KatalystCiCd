/**
 * CI/CD Application Entry Point
 * 
 * Hệ thống CI/CD tự động với các tính năng:
 * - Auto-check Git repository theo chu kỳ (polling)
 * - Build Docker images với nhiều phương thức (dockerfile/script/jsonfile)
 * - Queue system để quản lý concurrent builds
 * - Job scheduler với cron-like scheduling
 * - Realtime log streaming qua SSE
 * - Email notifications
 * - Webhook support (GitLab/GitHub)
 * 
 * @module app
 * @requires express
 * @requires dotenv
 */

// Nạp biến môi trường từ file .env (nếu có)
require('dotenv').config();

// Các biến môi trường cần thiết:
/** @const {number} PORT - Cổng server (default: 9001) */
const PORT = Number(process.env.PORT || 9001);

/** @const {string} WEBHOOK_SECRET - Secret token cho GitLab webhook */
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "YOUR_GITLAB_SECRET_TOKEN";

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();

// New architecture (services & utils)
const { Logger } = require('./src_legacy/utils/logger');
const { ConfigService } = require('./src_legacy/services/ConfigService');
const { DataStorageService } = require('./src_legacy/services/DataStorageService');

const { DockerService } = require('./src_legacy/services/DockerService');
const { GitService } = require('./src_legacy/services/GitService');
const { Scheduler } = require('./src_legacy/services/Scheduler');
const { BuildService } = require('./src_legacy/services/BuildService');
const { registerConfigController } = require('./src_legacy/controllers/ConfigController');
const { registerBuildsController } = require('./src_legacy/controllers/BuildsController');
const { registerGitController } = require('./src_legacy/controllers/GitController');
const { registerDockerController } = require('./src_legacy/controllers/DockerController');
const { registerPullController } = require('./src_legacy/controllers/PullController');
const { registerWebhookController } = require('./src_legacy/controllers/WebhookController');
const { registerDeployController } = require('./src_legacy/controllers/DeployController');
const { SchedulerController } = require('./src_legacy/controllers/SchedulerController');
const JobController = require('./src_legacy/controllers/JobController');
const { JobScheduler } = require('./src_legacy/services/JobScheduler');
const QueueController = require('./src_legacy/controllers/QueueController');
const { RepositoryController } = require('./src_legacy/controllers/RepositoryController');
const { EmailService } = require('./src_legacy/services/EmailService');
const { registerEmailController } = require('./src_legacy/controllers/EmailController');
const { WebhookService } = require('./src_legacy/services/WebhookService');

// Database Manager
const dbManager = require('./src_legacy/config/database');
const { registerDatabaseController } = require('./src_legacy/controllers/DatabaseController');

// Auth & User Management
const { UserService } = require('./src_legacy/services/UserService');
const { AuthService } = require('./src_legacy/services/AuthService');
const { createAuthMiddleware } = require('./src_legacy/middleware/auth');
const { requireAdmin } = require('./src_legacy/middleware/rbac');
const { registerAuthController } = require('./src_legacy/controllers/AuthController');
const { registerUserController } = require('./src_legacy/controllers/UserController');

app.use(bodyParser.json());

// Phục vụ file tĩnh cho giao diện cấu hình CI/CD
app.use(express.static(path.join(__dirname, 'public')));

// Đường dẫn lưu trữ dữ liệu cấu hình đơn giản (JSON)
const DATA_DIR = __dirname;
const CONFIG_VERSIONS_DIR = path.join(DATA_DIR, 'config_versions');
const BUILDS_VERSIONS_DIR = path.join(DATA_DIR, 'builds_versions');
fs.mkdirSync(CONFIG_VERSIONS_DIR, { recursive: true });
fs.mkdirSync(BUILDS_VERSIONS_DIR, { recursive: true });

// ========================================
// Initialize Services (Dependency Injection)
// ========================================

const logger = new Logger();
logger.register(app);

const configService = new ConfigService({ dataDir: DATA_DIR, logger , dbManager });
const dataStorageService = new DataStorageService({ dataDir: DATA_DIR, logger , dbManager })
const dockerService = new DockerService({ logger, configService });
const gitService = new GitService({ logger, dockerService, configService });
const scheduler = new Scheduler({ logger, configService, gitService });
const buildService = new BuildService({ logger, configService, dockerService });
const schedulerController = new SchedulerController({ scheduler, configService });

// ========================================
// Tự động tạo folder pipeline khi khởi động
// ========================================

// Tạo thư mục pipeline và file project_pipeline.json mẫu
try {
  const cfg = configService.getConfig();
  const baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '/opt';
  const pipelineDir = path.join(baseContext, 'Katalyst', 'pipeline');
  
  // Tạo thư mục pipeline nếu chưa tồn tại
  if (!fs.existsSync(pipelineDir)) {
    fs.mkdirSync(pipelineDir, { recursive: true });
    logger.send(`[STARTUP] Đã tạo thư mục pipeline: ${pipelineDir}`);
  }
  
  // Tạo file project_pipeline.json mẫu nếu chưa tồn tại
  const pipelineFile = path.join(pipelineDir, 'project_pipeline.json');
  if (!fs.existsSync(pipelineFile)) {
    const samplePipeline = {
      "pipeline_name": "Sample Build Pipeline",
      "version": "1.0.0",
      "description": "Mẫu pipeline build tự động",
      "working_directory": "${REPO_PATH}",
      "environment_vars": {
        "BUILD_VERSION": "1.0.0",
        "DEPLOY_ENV": "production"
      },
      "check_commit": true,
      "branch": "main",
      "repo_url": "",
      "steps": [
        {
          "step_order": 1,
          "step_id": "clean_build",
          "step_name": "Clean and Build",
          "step_exec": "mvn clean package -DskipTests",
          "timeout_seconds": 300,
          "on_fail": "stop",
          "shell": "bash"
        },
        {
          "step_order": 2,
          "step_id": "docker_build",
          "step_name": "Build Docker Image",
          "step_exec": "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .",
          "timeout_seconds": 600,
          "on_fail": "stop",
          "shell": "bash"
        },
        {
          "step_order": 3,
          "step_id": "docker_push",
          "step_name": "Push to Registry",
          "step_exec": "docker push ${IMAGE_NAME}:${IMAGE_TAG}",
          "timeout_seconds": 300,
          "on_fail": "continue",
          "shell": "bash"
        }
      ]
    };
    
    fs.writeFileSync(pipelineFile, JSON.stringify(samplePipeline, null, 2));
    logger.send(`[STARTUP] Đã tạo file pipeline mẫu: ${pipelineFile}`);
  }
} catch (error) {
  logger.send(`[STARTUP][WARN] Không thể tạo pipeline folder: ${error.message}`);
}

// Khởi tạo EmailService sớm để truyền vào JobController
const emailService = new EmailService({ configService, logger });

// Khởi tạo User & Auth Services
const userService = new UserService({ logger });
const authService = new AuthService({ userService, logger });
const authMiddleware = createAuthMiddleware(authService);

// Khởi tạo JobController với gitService (queueService sẽ gán sau)
const jobController = new JobController({ buildService, logger, configService, gitService, emailService });

// Khởi tạo QueueController và truyền jobController để uỷ quyền thực thi
const queueController = new QueueController({ logger, buildService, jobService: jobController.jobService, jobController, configService });

// Gán queueService cho JobController để endpoint /api/jobs/:id/run thêm vào hàng đợi
jobController.queueService = queueController.queueService;

// Khởi tạo JobScheduler sau khi đã có queueService
const jobScheduler = new JobScheduler({ logger, jobService: jobController.jobService, jobController, queueService: queueController.queueService, gitService });

// Truyền jobScheduler vào jobController để auto restart khi cấu hình job thay đổi
jobController.jobScheduler = jobScheduler;

// Khởi tạo WebhookService để xử lý webhooks từ GitLab/GitHub
const webhookService = new WebhookService({ 
  logger, 
  gitService, 
  jobService: jobController.jobService, 
  queueService: queueController.queueService,
  configService 
});

// Khởi tạo RepositoryController cho quản lý repository
const repositoryController = new RepositoryController({ logger });

// ========================================
// Register Controllers (Route Handlers)
// ========================================

registerConfigController(app, { configService, scheduler, logger });
registerBuildsController(app, { configService, buildService, emailService });
registerGitController(app, { gitService });
registerDockerController(app, { dockerService, configService, logger });
registerPullController(app, { configService, logger });
registerWebhookController(app, { logger, secret: WEBHOOK_SECRET, webhookService });
registerDeployController(app, { logger, configService });
registerEmailController(app, { emailService, logger });

// ========================================
// DATABASE SETUP ROUTES (Public - no auth required)
// ========================================
registerDatabaseController(app, dbManager);

// Middleware: Check if database is setup (except for essential routes)
app.use((req, res, next) => {
  // Skip check for:
  // 1. Database API routes
  // 2. Auth API routes (login/logout - cần cho user login để vào dashboard setup DB)
  // 3. Static files and pages
  if (req.path.startsWith('/api/database') || 
      req.path.startsWith('/api/auth') ||  // ✅ Allow auth routes
      req.path === '/db-setup.html' || 
      req.path === '/js/db-setup.js' ||
      req.path === '/js/database.js' ||
      req.path === '/' ||
      req.path === '/index.html' ||
      req.path === '/login.html' ||
      req.path.startsWith('/asset/') ||
      req.path.startsWith('/js/') ||
      req.path === '/styles.css') {
    return next();
  }

  // Check if database is setup - block other API calls
  /* if (!dbManager.isSetup() && req.path.startsWith('/api/')) {
    return res.status(503).json({
      success: false,
      message: 'Database not initialized. Please setup database in Dashboard → Database tab.',
      setupRequired: true
    });
  } */

  next();
});

// ========================================
// AUTH & USER MANAGEMENT ROUTES
// ========================================

// Auth routes (login, logout, change password)
registerAuthController(app, { authService, userService, authMiddleware });

// User management routes (admin only)
registerUserController(app, { userService, authMiddleware, requireAdmin });

// ========================================
// Job Management Routes
// ========================================

app.get('/api/jobs', (req, res) => jobController.getAllJobs(req, res));
app.get('/api/jobs/enabled', (req, res) => jobController.getEnabledJobs(req, res));
app.get('/api/jobs/:id', (req, res) => jobController.getJobById(req, res));
app.post('/api/jobs', (req, res) => jobController.createJob(req, res));
app.put('/api/jobs/:id', (req, res) => jobController.updateJob(req, res));
app.delete('/api/jobs/:id', (req, res) => jobController.deleteJob(req, res));
app.post('/api/jobs/:id/toggle', (req, res) => jobController.toggleJob(req, res));
app.post('/api/jobs/:id/run', (req, res) => jobController.runJob(req, res));

// ========================================
// Queue Management Routes
// ========================================

app.post('/api/queue/add', (req, res) => queueController.addJobToQueue(req, res));
app.get('/api/queue/status', (req, res) => queueController.getQueueStatus(req, res));
app.get('/api/queue/stats', (req, res) => queueController.getQueueStats(req, res));
app.delete('/api/queue/:jobId', (req, res) => queueController.cancelJob(req, res));
app.post('/api/queue/config', (req, res) => queueController.updateQueueConfig(req, res));
app.post('/api/queue/toggle', (req, res) => queueController.toggleQueueProcessing(req, res));
app.post('/api/jobs/:jobId/run-immediate', (req, res) => queueController.runJobImmediate(req, res));

// ========================================
// Scheduler API Routes
// ========================================

app.get('/api/scheduler/status', (req, res) => schedulerController.getStatus(req, res));
app.post('/api/scheduler/toggle', (req, res) => schedulerController.toggle(req, res));
app.post('/api/scheduler/restart', (req, res) => schedulerController.restart(req, res));

// ========================================
// Repository Management Routes
// ========================================

app.get('/api/repository/structure', (req, res) => repositoryController.getRepositoryStructure(req, res));
app.get('/api/repository/file', (req, res) => repositoryController.getFileContent(req, res));
app.get('/api/repository/search', (req, res) => repositoryController.searchFiles(req, res));

/**
 * API Endpoint: Get webhook configuration
 * GET /api/webhook/config
 */
app.get('/api/webhook/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        secret: WEBHOOK_SECRET,
        endpoints: {
          gitlab: '/webhook/gitlab',
          github: '/webhook/github'
        },
        fullUrls: {
          gitlab: `${req.protocol}://${req.get('host')}/webhook/gitlab`,
          github: `${req.protocol}://${req.get('host')}/webhook/github`
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// Start Server
// ========================================

app.listen(PORT, () => {
  console.log(`✅ CI/CD Server đang chạy tại http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`📡 Log Stream: http://localhost:${PORT}/api/logs/stream`);
  console.log(`🔐 Webhook Secret: ${WEBHOOK_SECRET}`);
});

// Khởi động scheduler sau khi server sẵn sàng
process.nextTick(() => {
  scheduler.restart();
  // Khởi động JobScheduler cho các job có autoCheck
  jobScheduler.restart();
});
