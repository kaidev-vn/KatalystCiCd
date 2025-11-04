// Nạp biến môi trường từ file .env (nếu có)
require('dotenv').config();
// Các biến môi trường cần thiết:
const PORT = Number(process.env.PORT || 9001); // Cổng bạn muốn listener chạy
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "YOUR_GITLAB_SECRET_TOKEN"; // Đặt cùng giá trị với Secret Token trong GitLab

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
const gitService = new GitService({ logger, dockerService, configService });
const scheduler = new Scheduler({ logger, configService, gitService });
const buildService = new BuildService({ logger, configService });
const schedulerController = new SchedulerController({ scheduler, configService });
const jobController = new JobController({ buildService, logger, configService });
// Khởi tạo JobScheduler sau khi có jobController
const jobScheduler = new JobScheduler({ logger, jobService: jobController.jobService, jobController });
// Truyền jobScheduler vào jobController để auto restart khi cấu hình job thay đổi
jobController.jobScheduler = jobScheduler;
const queueController = new QueueController({ logger, buildService, jobService: jobController.jobService });
const emailService = new EmailService({ configService, logger });

registerConfigController(app, { configService, scheduler, logger });
registerBuildsController(app, { configService, buildService });
registerGitController(app, { gitService });
registerDockerController(app, { dockerService, configService, logger });
registerPullController(app, { configService, logger });
registerWebhookController(app, { logger, secret: WEBHOOK_SECRET });
registerDeployController(app, { logger, configService });
registerEmailController(app, { emailService, logger });

// Job Management Routes
app.get('/api/jobs', (req, res) => jobController.getAllJobs(req, res));
app.get('/api/jobs/enabled', (req, res) => jobController.getEnabledJobs(req, res));
app.get('/api/jobs/:id', (req, res) => jobController.getJobById(req, res));
app.post('/api/jobs', (req, res) => jobController.createJob(req, res));
app.put('/api/jobs/:id', (req, res) => jobController.updateJob(req, res));
app.delete('/api/jobs/:id', (req, res) => jobController.deleteJob(req, res));
app.post('/api/jobs/:id/toggle', (req, res) => jobController.toggleJob(req, res));
app.post('/api/jobs/:id/run', (req, res) => jobController.runJob(req, res));

// Queue Management Routes
app.post('/api/queue/add', (req, res) => queueController.addJobToQueue(req, res));
app.get('/api/queue/status', (req, res) => queueController.getQueueStatus(req, res));
app.get('/api/queue/stats', (req, res) => queueController.getQueueStats(req, res));
app.delete('/api/queue/:jobId', (req, res) => queueController.cancelJob(req, res));
app.put('/api/queue/config', (req, res) => queueController.updateQueueConfig(req, res));
app.post('/api/queue/toggle', (req, res) => queueController.toggleQueueProcessing(req, res));
app.post('/api/jobs/:jobId/run-immediate', (req, res) => queueController.runJobImmediate(req, res));

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
  // Khởi động JobScheduler cho các job có autoCheck
  jobScheduler.restart();
});
