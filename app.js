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
const { Logger } = require('./src/utils/logger');
const { ConfigService } = require('./src/services/ConfigService');
const { DockerService } = require('./src/services/DockerService');
const { GitService } = require('./src/services/GitService');
const { Scheduler } = require('./src/services/Scheduler');
const { BuildService } = require('./src/services/BuildService');
const { registerConfigController } = require('./src/controllers/ConfigController');
const { registerBuildsController } = require('./src/controllers/BuildsController');
const { registerGitController } = require('./src/controllers/GitController');
const { registerDockerController } = require('./src/controllers/DockerController');
const { registerPullController } = require('./src/controllers/PullController');
const { registerWebhookController } = require('./src/controllers/WebhookController');
const { registerDeployController } = require('./src/controllers/DeployController');
const { SchedulerController } = require('./src/controllers/SchedulerController');
const JobController = require('./src/controllers/JobController');
const { JobScheduler } = require('./src/services/JobScheduler');
const QueueController = require('./src/controllers/QueueController');
const { EmailService } = require('./src/services/EmailService');
const { registerEmailController } = require('./src/controllers/EmailController');
const { WebhookService } = require('./src/services/WebhookService');

// Auth & User Management
const { UserService } = require('./src/services/UserService');
const { AuthService } = require('./src/services/AuthService');
const { createAuthMiddleware } = require('./src/middleware/auth');
const { requireAdmin } = require('./src/middleware/rbac');
const { registerAuthController } = require('./src/controllers/AuthController');
const { registerUserController } = require('./src/controllers/UserController');

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

const configService = new ConfigService({ dataDir: DATA_DIR, logger });
const dockerService = new DockerService({ logger, configService });
const gitService = new GitService({ logger, dockerService, configService });
const scheduler = new Scheduler({ logger, configService, gitService });
const buildService = new BuildService({ logger, configService });
const schedulerController = new SchedulerController({ scheduler, configService });

// Khởi tạo EmailService sớm để truyền vào JobController
const emailService = new EmailService({ configService, logger });

// Khởi tạo User & Auth Services
const userService = new UserService({ logger });
const authService = new AuthService({ userService, logger });
const authMiddleware = createAuthMiddleware(authService);

// Khởi tạo JobController với gitService (queueService sẽ gán sau)
const jobController = new JobController({ buildService, logger, configService, gitService, emailService });

// Khởi tạo QueueController và truyền jobController để uỷ quyền thực thi
const queueController = new QueueController({ logger, buildService, jobService: jobController.jobService, jobController });

// Gán queueService cho JobController để endpoint /api/jobs/:id/run thêm vào hàng đợi
jobController.queueService = queueController.queueService;

// Khởi tạo JobScheduler sau khi đã có queueService
const jobScheduler = new JobScheduler({ logger, jobService: jobController.jobService, jobController, queueService: queueController.queueService });

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
app.put('/api/queue/config', (req, res) => queueController.updateQueueConfig(req, res));
app.post('/api/queue/toggle', (req, res) => queueController.toggleQueueProcessing(req, res));
app.post('/api/jobs/:jobId/run-immediate', (req, res) => queueController.runJobImmediate(req, res));

// ========================================
// Scheduler API Routes
// ========================================

app.get('/api/scheduler/status', (req, res) => schedulerController.getStatus(req, res));
app.post('/api/scheduler/toggle', (req, res) => schedulerController.toggle(req, res));
app.post('/api/scheduler/restart', (req, res) => schedulerController.restart(req, res));

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
