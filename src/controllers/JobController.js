const JobService = require('../services/JobService');
const { BuildService } = require('../services/BuildService');
const path = require('path');
const fs = require('fs');
const { run } = require('../utils/exec');

/**
 * JobController - Controller quản lý jobs (CI/CD jobs)
 * Xử lý CRUD operations, job execution, và script generation
 * @class
 */
class JobController {
  /**
   * Tạo JobController instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.buildService - BuildService instance
   * @param {Object} deps.logger - Logger instance
   * @param {Object} deps.configService - ConfigService instance
   * @param {Object} [deps.jobScheduler] - JobScheduler instance (optional)
   * @param {Object} deps.gitService - GitService instance
   * @param {Object} [deps.queueService] - QueueService instance (optional, sẽ được gán sau)
   * @param {Object} [deps.emailService] - EmailService instance (optional)
   */
  constructor({ buildService, logger, configService, jobScheduler, gitService, queueService, emailService }) {
    this.jobService = new JobService(logger, null, configService);
    this.buildService = buildService;
    this.logger = logger;
    this.configService = configService;
    this.jobScheduler = jobScheduler; // Optional, sẽ dùng để restart lịch theo job
    this.gitService = gitService; // Dùng để kiểm tra commit mới trước khi build
    this.queueService = queueService; // Optional: sẽ được gán trong app.js nếu chưa có ở thời điểm khởi tạo
    this.emailService = emailService; // Optional: gửi email khi build xong
  }

  /**
   * API Endpoint: Lấy tất cả jobs
   * GET /api/jobs
   * @async
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async getAllJobs(req, res) {
    try {
      const jobs = this.jobService.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error('Error getting jobs:', error);
      res.status(500).json({ error: 'Failed to get jobs' });
    }
  }

  /**
   * API Endpoint: Lấy job theo ID
   * GET /api/jobs/:id
   * @async
   * @param {Object} req - Express request
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.id - Job ID
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async getJobById(req, res) {
    try {
      const { id } = req.params;
      const job = this.jobService.getJobById(id);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      
      res.json(job);
    } catch (error) {
      console.error('Error getting job:', error);
      res.status(500).json({ error: 'Failed to get job' });
    }
  }

  /**
   * API Endpoint: Tạo job mới
   * POST /api/jobs
   * @async
   * @param {Object} req - Express request
   * @param {Object} req.body - Job data
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async createJob(req, res) {
    try {
      const jobData = req.body;
      // Normalize payload to support both legacy (git/build) and new (gitConfig/buildConfig) schemas
      const normalized = this.normalizeJobPayload(jobData);
      
      // Validate job data
      const validationErrors = this.jobService.validateJobData(normalized);
      if (validationErrors.length > 0) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: validationErrors 
        });
      }

      const newJob = this.jobService.createJob(normalized);
      // Sau khi tạo job, nếu là phương thức script, chuẩn bị thư mục builder và file build-script.sh
      try {
        await this._ensureJobScript(newJob);
      } catch (e) {
        this.logger?.send?.(`[JOB][WARN] Không thể tạo file script sau khi lưu job: ${e.message}`);
      }
      // Restart job scheduler để áp dụng job mới
      try { this.jobScheduler?.restart(); } catch (_) {}
      res.status(201).json(newJob);
    } catch (error) {
      console.error('Error creating job:', error);
      res.status(500).json({ error: 'Failed to create job' });
    }
  }

  /**
   * API Endpoint: Cập nhật job
   * PUT /api/jobs/:id
   * @async
   * @param {Object} req - Express request
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.id - Job ID
   * @param {Object} req.body - Update data
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async updateJob(req, res) {
    try {
      const { id } = req.params;
      const updateData = this.normalizeJobPayload(req.body || {});
      
      // Validate job data if provided
      if (Object.keys(updateData).length > 0) {
        const validationErrors = this.jobService.validateJobData({
          ...this.jobService.getJobById(id),
          ...updateData
        });
        
        if (validationErrors.length > 0) {
          return res.status(400).json({ 
            error: 'Validation failed', 
            details: validationErrors 
          });
        }
      }

      const updatedJob = this.jobService.updateJob(id, updateData);
      // Sau khi cập nhật job, nếu là phương thức script, đảm bảo thư mục và file script được tạo/cập nhật
      try {
        await this._ensureJobScript(updatedJob);
      } catch (e) {
        this.logger?.send?.(`[JOB][WARN] Không thể tạo/cập nhật file script sau khi cập nhật job: ${e.message}`);
      }
      // Restart job scheduler để cập nhật lịch
      try { this.jobScheduler?.restart(); } catch (_) {}
      res.json(updatedJob);
    } catch (error) {
      console.error('Error updating job:', error);
      if (error.message === 'Job not found') {
        res.status(404).json({ error: 'Job not found' });
      } else {
        res.status(500).json({ error: 'Failed to update job' });
      }
    }
  }

  /**
   * Normalize job payload từ UI về schema chuẩn
   * Hỗ trợ cả legacy (git/build) và new (gitConfig/buildConfig) schemas
   * @param {Object} data - Raw job data từ UI
   * @returns {Object} Normalized job object
   */
  normalizeJobPayload(data) {
    const d = { ...(data || {}) };

    // Normalize git config
    const legacyGit = d.git || {};
    const gitConfig = d.gitConfig || {
      provider: legacyGit.provider || d.provider || 'gitlab',
      account: legacyGit.account || d.account || '',
      token: legacyGit.token || d.token || '',
      branch: legacyGit.branch || d.branch || 'main',
      repoUrl: legacyGit.repoUrl || d.repoUrl || '',
      repoPath: legacyGit.repoPath || d.repoPath || '',
      // Multiple branches configuration
      branches: d.gitConfig?.branches || [
        {
          name: legacyGit.branch || d.branch || 'main',
          tagPrefix: 'RELEASE',
          enabled: true
        }
      ]
    };
    // Trim strings
    ['provider','account','token','branch','repoUrl','repoPath'].forEach(k => {
      if (typeof gitConfig[k] === 'string') gitConfig[k] = gitConfig[k].trim();
    });

    // Normalize build config
    const legacyBuild = d.build || {};
    const dockerUI = d.docker || {};
    const scriptUI = d.script || {};
    // docker config might be nested or flat in legacy
    const legacyDockerConfig = legacyBuild.dockerConfig || {
      dockerfilePath: legacyBuild.dockerfilePath || dockerUI.dockerfilePath || d.dockerfilePath || '',
      contextPath: legacyBuild.contextPath || dockerUI.contextPath || d.contextPath || '',
      imageName: legacyBuild.imageName || dockerUI.imageName || d.imageName || '',
      imageTag: (function() {
        if (legacyBuild.imageTag) return legacyBuild.imageTag;
        const num = dockerUI.tag?.number || '';
        const txt = dockerUI.tag?.text || '';
        if (!num && !txt) return d.imageTag || '';
        return txt ? `${num}-${txt}` : num;
      })(),
      autoTagIncrement: !!(legacyBuild.autoTagIncrement || dockerUI.tag?.autoIncrement || d.autoTagIncrement),
      registryUrl: legacyBuild.registryUrl || dockerUI.registry?.url || d.registryUrl || '',
      registryUsername: legacyBuild.registryUsername || dockerUI.registry?.username || d.registryUsername || '',
      registryPassword: legacyBuild.registryPassword || dockerUI.registry?.password || d.registryPassword || ''
    };

    // Build config: preserve script-specific fields sent from UI
    const buildMethod = (d.buildConfig?.method || legacyBuild.method || d.method || 'dockerfile');
    const buildConfig = d.buildConfig || {
      method: buildMethod,
      scriptPath: legacyBuild.scriptPath || d.scriptPath || d.buildConfig?.scriptPath || '',
      buildOrder: legacyBuild.buildOrder || d.buildOrder || d.buildConfig?.buildOrder || 'parallel',
      dockerConfig: legacyDockerConfig
    };
    // If method is script, ensure we keep script tag/registry fields
    if (buildMethod === 'script') {
      buildConfig.imageName = d.buildConfig?.imageName || legacyBuild.imageName || scriptUI.imageName || d.imageName || '';
      buildConfig.imageTagNumber = d.buildConfig?.imageTagNumber || legacyBuild.imageTagNumber || scriptUI.tag?.number || d.imageTagNumber || '';
      buildConfig.imageTagText = d.buildConfig?.imageTagText || legacyBuild.imageTagText || scriptUI.tag?.text || d.imageTagText || '';
      buildConfig.autoTagIncrement = !!(d.buildConfig?.autoTagIncrement || legacyBuild.autoTagIncrement || scriptUI.tag?.autoIncrement || d.autoTagIncrement);
      buildConfig.registryUrl = d.buildConfig?.registryUrl || legacyBuild.registryUrl || scriptUI.registry?.url || d.registryUrl || '';
      buildConfig.registryUsername = d.buildConfig?.registryUsername || legacyBuild.registryUsername || scriptUI.registry?.username || d.registryUsername || '';
      buildConfig.registryPassword = d.buildConfig?.registryPassword || legacyBuild.registryPassword || scriptUI.registry?.password || d.registryPassword || '';
    }

    // If method is jsonfile, bring over jsonPipelinePath from various possible UI fields
    if (buildMethod === 'jsonfile') {
      buildConfig.jsonPipelinePath = d.buildConfig?.jsonPipelinePath || d.jsonPipelinePath || d.jobJsonPipelinePath || '';
    }

    // Normalize services
    let services = Array.isArray(d.services) ? d.services : (Array.isArray(d.selectedServices) ? d.selectedServices : []);

    // Normalize schedule
    const schedule = d.schedule || {
      triggerMethod: d.triggerMethod || d.schedule?.triggerMethod || 'polling', // 'polling', 'webhook', 'hybrid'
      autoCheck: !!d.autoCheck,
      polling: typeof d.polling === 'number' ? d.polling : 30,
      cron: d.cron || ''
    };

    // Normalize monolith config
    const monolith = !!d.monolith;
    const monolithConfig = d.monolithConfig || {
      module: d.monolithModule || '',
      changePath: Array.isArray(d.monolithChangePath) ? d.monolithChangePath : []
    };

    return {
      id: d.id,
      name: d.name,
      description: d.description,
      enabled: d.enabled !== false,
      gitConfig,
      buildConfig,
      services,
      schedule,
      monolith,
      monolithConfig
    };
  }

  /**
   * Đảm bảo tạo thư mục builder cho job và file build-script.sh chứa các biến cấu hình.
   * Thực thi khi lưu job (create/update) để người dùng có sẵn script mặc định.
   */
  async _ensureJobScript(job) {
    try {
      const method = job?.buildConfig?.method || 'dockerfile';
      if (method !== 'script') return; // Chỉ xử lý cho phương thức script

      const cfg = this.configService.getConfig();
      // Xác định base context: <contextInitPath>/Katalyst
      let baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '';
      const gc = job.gitConfig || {};
      if (!baseContext) {
        // Fallback nếu chưa cấu hình
        const legacyRepoPath = cfg.repoPath || gc.repoPath || '';
        baseContext = legacyRepoPath ? path.dirname(legacyRepoPath) : process.cwd();
      }

      // Đảm bảo baseContext không undefined
      if (typeof baseContext !== 'string') {
        baseContext = process.cwd();
      }
      const katalystRoot = path.join(baseContext, 'Katalyst');
      const repoRootPath = path.join(katalystRoot, 'repo');
      const builderRoot = path.join(katalystRoot, 'builder');
      try {
        fs.mkdirSync(repoRootPath, { recursive: true });
        fs.mkdirSync(builderRoot, { recursive: true });
      } catch (e) {
        throw new Error(`Không thể tạo thư mục context tại ${katalystRoot}: ${e.message}`);
      }

      // Xác định đường dẫn repository thực tế (có thể là subdirectory)
      const actualRepoPath = await this._ensureRepoReady({ 
        repoPath: repoRootPath, 
        branch: gc.branch, 
        repoUrl: gc.repoUrl, 
        token: gc.token, 
        provider: gc.provider 
      });

      // Tự động cập nhật repoPath vào job configuration nếu chưa có hoặc khác
      if (actualRepoPath && (!gc.repoPath || gc.repoPath !== actualRepoPath)) {
        const updated = {
          ...job,
          gitConfig: {
            ...job.gitConfig,
            repoPath: actualRepoPath
          }
        };
        try { this.jobService.updateJob(job.id, updated); } catch (_) {}
      }

      const safeName = String(job.name || '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
      const jobBuilderDir = path.join(builderRoot, `${safeName}-${job.id}`);
      try { fs.mkdirSync(jobBuilderDir, { recursive: true }); } catch (_) {}

      // Xác định đường dẫn script mặc định nếu chưa có
      const defaultScriptPath = path.join(jobBuilderDir, 'build-script.sh');
      const bc = job.buildConfig || {};
      const dc = bc.dockerConfig || {};

      // Biến cấu hình
      const imageName = bc.imageName || dc.imageName || '';
      const tagNumber = bc.imageTagNumber || '';
      const tagText = bc.imageTagText || '';
      const autoInc = !!(bc.autoTagIncrement || dc.autoTagIncrement);
      const registryUrl = bc.registryUrl || dc.registryUrl || '';
      const dockerfilePath = dc.dockerfilePath || '';
      // contextPath ưu tiên theo cấu hình docker, nếu không có thì dùng actualRepoPath
      const contextPath = dc.contextPath || actualRepoPath;

      // Tạo IMAGE_TAG từ number/text (không tự tăng khi lưu)
      const imageTag = (() => {
        if (bc.imageTagNumber) {
          return bc.imageTagText ? `${bc.imageTagNumber}-${bc.imageTagText}` : `${bc.imageTagNumber}`;
        }
        return dc.imageTag || 'latest';
      })();

      // Nội dung script mẫu
      const scriptContent = `#!/usr/bin/env bash\n\n` +
        `# Auto-generated build script for job: ${job.name} (${job.id})\n` +
        `# Context root: ${katalystRoot}\n` +
        `# Created at: ${new Date().toISOString()}\n\n` +
        `# Git\n` +
        `BRANCH="${gc.branch || 'main'}"\n` +
        `REPO_URL="${gc.repoUrl || ''}"\n` +
        `REPO_PATH="${actualRepoPath}"\n\n` +
        `# Docker Build Config\n` +
        `CONTEXT_PATH="${contextPath}"\n` +
        `DOCKERFILE_PATH="${dockerfilePath}"\n` +
        `IMAGE_NAME="${imageName}"\n` +
        `IMAGE_TAG_NUMBER="${tagNumber}"\n` +
        `IMAGE_TAG_TEXT="${tagText}"\n` +
        `IMAGE_TAG="${imageTag}"\n` +
        `AUTO_TAG_INCREMENT="${autoInc ? 'true' : 'false'}"\n` +
        `REGISTRY_URL="${registryUrl}"\n\n` +
        `# Job Info\n` +
        `JOB_ID="${job.id}"\n` +
        `JOB_NAME="${job.name}"\n` +
        `KATALYST_ROOT="${katalystRoot}"\n` +
        `JOB_BUILDER_DIR="${jobBuilderDir}"\n\n` +
        `echo "[BUILD-SCRIPT] Job: $JOB_NAME ($JOB_ID)"\n` +
        `echo "[BUILD-SCRIPT] Context: $CONTEXT_PATH"\n` +
        `echo "[BUILD-SCRIPT] Dockerfile: $DOCKERFILE_PATH"\n` +
        `echo "[BUILD-SCRIPT] Image: $IMAGE_NAME:$IMAGE_TAG"\n` +
        `echo "[BUILD-SCRIPT] Registry: $REGISTRY_URL"\n\n` +
        `# TODO: Add your build commands below\n` +
        `# Example:\n` +
        `# docker build -f "$DOCKERFILE_PATH" -t "$IMAGE_NAME:$IMAGE_TAG" "$CONTEXT_PATH"\n` +
        `# # For docker registry login, export REGISTRY_USERNAME and REGISTRY_PASSWORD in your environment or use a credential store.\n` +
        `# # Example (avoid committing secrets to files):\n` +
        `# # echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" -u "$REGISTRY_USERNAME" --password-stdin\n` +
        `# docker push "$IMAGE_NAME:$IMAGE_TAG"\n`;

      // Chỉ ghi file script nếu chưa tồn tại; nếu đã tồn tại, giữ nguyên nội dung và chỉ cập nhật các biến môi trường
      try {
        if (!fs.existsSync(defaultScriptPath)) {
          // File chưa tồn tại, tạo mới với nội dung mẫu
          fs.writeFileSync(defaultScriptPath, scriptContent, { encoding: 'utf8' });
        } else {
          // File đã tồn tại, chỉ cập nhật các biến môi trường ở phần đầu nếu cần
          // (giữ nguyên các logic build custom của người dùng)
          const existingContent = fs.readFileSync(defaultScriptPath, 'utf8');
          
          // Kiểm tra nếu file đã có các biến môi trường cơ bản
          const hasEnvVars = existingContent.includes('IMAGE_NAME=') || 
                            existingContent.includes('IMAGE_TAG=') ||
                            existingContent.includes('REGISTRY_URL=');
          
          if (!hasEnvVars) {
            // Thêm các biến môi trường vào đầu file nếu chưa có
            const envSection = scriptContent.split('# TODO: Add your build commands below')[0];
            const updatedContent = envSection + '\n\n' + existingContent;
            fs.writeFileSync(defaultScriptPath, updatedContent, { encoding: 'utf8' });
          }
          // Nếu đã có biến môi trường, giữ nguyên toàn bộ file
        }
      } catch (e) {
        throw new Error(`Không thể xử lý file script: ${defaultScriptPath}: ${e.message}`);
      }

      // Cập nhật đường dẫn script trong job nếu chưa có hoặc khác với mặc định
      if (!bc.scriptPath || bc.scriptPath !== defaultScriptPath) {
        const updated = {
          ...job,
          buildConfig: {
            ...job.buildConfig,
            scriptPath: defaultScriptPath
          }
        };
        try { this.jobService.updateJob(job.id, updated); } catch (_) {}
      }
    } catch (error) {
      // Không làm thất bại thao tác lưu job nếu lỗi tạo script; chỉ log cảnh báo
      this.logger?.send?.(`[JOB][SCRIPT] Lỗi khi chuẩn bị script cho job ${job?.name || ''}: ${error.message}`);
    }
  }

  // DELETE /api/jobs/:id - Delete job
  async deleteJob(req, res) {
    try {
      const { id } = req.params;
      this.jobService.deleteJob(id);
      try { this.jobScheduler?.restart(); } catch (_) {}
      res.json({ message: 'Job deleted successfully' });
    } catch (error) {
      console.error('Error deleting job:', error);
      if (error.message === 'Job not found') {
        res.status(404).json({ error: 'Job not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete job' });
      }
    }
  }

  // POST /api/jobs/:id/toggle - Toggle job enabled status
  async toggleJob(req, res) {
    try {
      const { id } = req.params;
      const updatedJob = this.jobService.toggleJob(id);
      try { this.jobScheduler?.restart(); } catch (_) {}
      res.json(updatedJob);
    } catch (error) {
      console.error('Error toggling job:', error);
      if (error.message === 'Job not found') {
        res.status(404).json({ error: 'Job not found' });
      } else {
        res.status(500).json({ error: 'Failed to toggle job' });
      }
    }
  }

  // POST /api/jobs/:id/run - Run job build
  async runJob(req, res) {
    try {
      const { id } = req.params;
      const job = this.jobService.getJobById(id);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      if (!job.enabled) {
        return res.status(400).json({ error: 'Job is disabled' });
      }

      // Thay vì chạy ngay, thêm vào Queue để đảm bảo chỉ 1 job chạy tại một thời điểm
      if (!this.queueService) {
        this.logger?.send('[JOB] QueueService chưa sẵn sàng, chạy trực tiếp (không khuyến nghị).');
        const buildResult = await this.executeJobBuild(job);
        this.jobService.updateJobStats(id, buildResult);
        return res.json({
          message: 'Job build executed directly',
          jobId: id,
          buildId: buildResult.buildId,
          status: buildResult.status
        });
      }

      const queueJobId = this.queueService.addJob({
        jobId: id,
        name: job.name,
        priority: 'high',
        estimatedTime: 300000, // 5 phút mặc định
        maxRetries: 1
      });

      res.json({
        message: 'Job đã được thêm vào hàng đợi',
        jobId: id,
        queueJobId,
        status: 'queued'
      });
    } catch (error) {
      console.error('Error running job:', error);
      res.status(500).json({ error: 'Failed to run job' });
    }
  }

  // Execute job build (internal method)
  async executeJobBuild(job, metadata = {}) {

      this.logger?.send(`[JOB] job: ${JSON.stringify(job)}`);


    try {
      console.log(`[JOB] Starting build for job: ${job.name} (${job.id})`);
      
      // ✅ Decrypt job secrets trước khi sử dụng
      const decryptedJob = this.jobService.getDecryptedJob(job.id);
      if (!decryptedJob) {
        throw new Error('Job not found or failed to decrypt');
      }
      
      // Sử dụng decryptedJob thay vì job để có plain text passwords/tokens
      job = decryptedJob;
      
      // Kiểm tra commit mới trước khi build để đáp ứng yêu cầu "phải có commit mới thì mới build"
      const gc = job.gitConfig || {};
      const cfg = this.configService.getConfig();
      
      // Xác định danh sách branches cần xử lý
      const branchesToProcess = [];
      
      // Thêm branch chính nếu có
      if (gc.branch) {
        branchesToProcess.push({
          name: gc.branch,
          tagPrefix: gc.tagPrefix || '',
          enabled: true
        });
      }
      
      // Thêm các branch phụ từ mảng branches
      if (Array.isArray(gc.branches)) {
        gc.branches.forEach(branchConfig => {
          if (branchConfig.enabled && branchConfig.name) {
            branchesToProcess.push(branchConfig);
          }
        });
      }
      
      // Nếu không có branch nào, sử dụng branch mặc định
      if (branchesToProcess.length === 0) {
        branchesToProcess.push({
          name: 'main',
          tagPrefix: '',
          enabled: true
        });
      }
            
      // Nếu phương thức là jsonfile, bỏ qua chuẩn bị repo & kiểm tra commit (pipeline tự xử lý)
      // Ngược lại, chuẩn bị context và repo như bình thường
      let repoPath = '';
      let builderRoot = '';
      let jobBuilderDir = '';
      let actualRepoPath = '';
      if ((job.buildConfig?.method || 'dockerfile') !== 'jsonfile') {
        // Xác định base context theo cấu hình: <contextInitPath>/Katalyst
        let baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '';
        if (!baseContext) {
          // Fallback: nếu chưa cấu hình, suy ra từ repoPath cũ hoặc dùng cwd
          const legacyRepoPath = cfg.repoPath || gc.repoPath || '';
          baseContext = legacyRepoPath ? path.dirname(legacyRepoPath) : process.cwd();
          this.logger?.send?.(`[JOB][WARN] Chưa cấu hình contextInitPath. Fallback baseContext=${baseContext}`);
        }
        const katalystRoot = path.join(baseContext, 'Katalyst');
        repoPath = path.join(katalystRoot, 'repo');
        builderRoot = path.join(katalystRoot, 'builder');
        try {
          fs.mkdirSync(repoPath, { recursive: true });
          fs.mkdirSync(builderRoot, { recursive: true });
        } catch (e) {
          this.logger?.send?.(`[JOB][ERROR] Không thể tạo thư mục context tại ${katalystRoot}: ${e.message}`);
          throw e;
        }

        // Nếu phương thức là script, tạo sẵn thư mục builder cho job ngay từ đầu
        // để đảm bảo thư mục tồn tại kể cả khi không có commit mới (skip build)
        if ((job.buildConfig?.method || 'dockerfile') === 'script') {
          const safeName = String(job.name || '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
          jobBuilderDir = path.join(builderRoot, `${safeName}-${job.id}`);
          try { fs.mkdirSync(jobBuilderDir, { recursive: true }); } catch (_) {}
        }

        const repoUrl = gc.repoUrl;
        const token = gc.token;
        const provider = gc.provider || 'gitlab';

        // Xử lý từng branch
        let hasNewCommit = false;
        let lastCommitHash = null;
        
        // Kiểm tra nếu có metadata skipGitCheck thì bỏ qua kiểm tra commit
        if (metadata.skipGitCheck) {
          this.logger?.send(`[JOB] Skip Git check (polling trigger), using commit hash from metadata: ${metadata.commitHash}`);
          hasNewCommit = true;
          lastCommitHash = metadata.commitHash;
          // Đảm bảo actualRepoPath được khởi tạo ngay cả khi skip Git check
          actualRepoPath = await this._ensureRepoReady({ repoPath, branch: metadata.branch || gc.branch, repoUrl, token, provider });
          this.logger?.send(`[JOB] Build triggered by polling for branch ${metadata.branch} with commit: ${metadata.commitHash}`);
        } else {
          // Thực hiện kiểm tra commit thông thường
          for (const branchConfig of branchesToProcess) {
            const branch = branchConfig.name;
            
            // Đảm bảo repo đã được clone/init trước khi kiểm tra commit
            actualRepoPath = await this._ensureRepoReady({ repoPath, branch, repoUrl, token, provider });

            this.logger?.send(`[JOB] Kiểm tra commit mới cho branch ${branch} tại ${actualRepoPath}`);

            if (this.gitService && actualRepoPath) {
              const check = await this.gitService.checkNewCommitAndPull({
                repoPath: actualRepoPath,
                branch,
                repoUrl,
                token,
                provider,
                doPull: true
              });
              if (!check.ok) {
                console.log(`[JOB] Failed to check/pull commit for branch ${branch}: ${check.error}`);
                continue;
              }
              if (check.hasNew) {
                hasNewCommit = true;
                lastCommitHash = check.remoteHash;
                this.logger?.send(`[JOB] Phát hiện commit mới trên branch ${branch}: ${check.remoteHash}`);
                break; // Chỉ cần một commit mới để trigger build
              }
            }
          }
          
          if (!hasNewCommit) {
            this.logger?.send(`[JOB] Không có commit mới cho job ${job.name} trên các branches: ${branchesToProcess.map(b => b.name).join(', ')}. Bỏ qua build.`);
            return {
              success: true,
              buildId: `skip-${Date.now()}`,
              status: 'skipped',
              message: 'No new commit on any branch, build skipped'
            };
          }
        }
        
        this.logger?.send(`[JOB] Build method: ${job.buildConfig.method}`);
        this.logger?.send(`[JOB] Tiến hành build với commit mới: ${lastCommitHash}`);
        // Lưu commit hash gần nhất để truyền xuống tầng build nếu cần
        this.lastCommitHash = lastCommitHash;
      } 
      // Determine build method and execute
      let buildResult;
      if (job.buildConfig.method === 'script') {
        // Chuẩn bị biến môi trường cho script từ cấu hình tag/registry
        const bc = job.buildConfig || {};
        const dc = bc.dockerConfig || {};
        const imageName = bc.imageName || dc.imageName || '';
        const tagNumber = bc.imageTagNumber || (dc.imageTag ? require('../utils/tag').splitTagIntoParts(dc.imageTag).numberPart : '');
        const tagText = bc.imageTagText || (dc.imageTag ? require('../utils/tag').splitTagIntoParts(dc.imageTag).textPart : '');
        const autoInc = !!(bc.autoTagIncrement || dc.autoTagIncrement);
        const { nextSplitTag } = require('../utils/tag');
        const imageTag = nextSplitTag(tagNumber || '1.0.0', tagText || '', autoInc);
        const registryUrl = bc.registryUrl || dc.registryUrl || '';
        const registryUsername = bc.registryUsername || dc.registryUsername || '';
        const registryPassword = bc.registryPassword || dc.registryPassword || '';

        const env = {
          IMAGE_NAME: imageName,
          IMAGE_TAG_NUMBER: tagNumber || '',
          IMAGE_TAG_TEXT: tagText || '',
          IMAGE_TAG: imageTag,
          AUTO_TAG_INCREMENT: String(autoInc),
          REGISTRY_URL: registryUrl,
          REGISTRY_USERNAME: registryUsername,
          REGISTRY_PASSWORD: registryPassword
        };

        // Compat variables expected by existing deploy.sh scripts
        env.DOCKER_IMAGE_TAG = env.IMAGE_TAG;
        env.DOCKERFILE_PATH = dc.dockerfilePath || '';
        env.CONTEXT_PATH = dc.contextPath || repoPath || '';

        // Thư mục builder cho job đã được tạo sẵn ở bước chuẩn bị.
        // Nếu vì lý do nào đó chưa tạo được, thử tạo lại tại đây.
         this.logger?.send(`[JOB] jobBuilderDir: ${jobBuilderDir}`);

        if (!jobBuilderDir) {
          const safeName = String(job.name || '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
          jobBuilderDir = path.join(builderRoot, `${safeName}-${job.id}`);
          try { fs.mkdirSync(jobBuilderDir, { recursive: true }); } catch (_) {}
        }
        const scriptPath = bc.scriptPath || path.join(jobBuilderDir, 'build-script.sh');

        this.logger?.send(`[JOB] scriptPath: ${scriptPath}`);
        console.log(`[DEBUG] scriptPath được xác định: ${scriptPath}`);
        console.log(`[DEBUG] Đã đến được điểm xác định scriptPath`);

        // // Đảm bảo script có quyền thực thi trên Unix-like systems
        // if (process.platform !== 'win32' && fs.existsSync(scriptPath)) {
        //   try {
        //     fs.chmodSync(scriptPath, '755'); // Make executable on Unix
        //     console.log(`[SCRIPT] Đã set quyền thực thi cho script: ${scriptPath}`);
        //   } catch (error) {
        //     console.log(`[SCRIPT] Lỗi khi set quyền thực thi: ${error.message}`);
        //   }
        // }
        console.log(`[SCRIPT] Bắt đầu thực thi script: ${scriptPath}`);
        console.log(`[SCRIPT] Working directory: ${actualRepoPath}`);
        
        // Kiểm tra script path có tồn tại không
        const fs = require('fs');
        const scriptExists = fs.existsSync(scriptPath);
        console.log(`[SCRIPT] Kiểm tra script path: ${scriptPath}, tồn tại: ${scriptExists}`);
        
        if (!scriptExists) {
          console.error(`[SCRIPT] Lỗi: Script path không tồn tại: ${scriptPath}`);
          return {
            success: false,
            buildId: `script-${Date.now()}`,
            status: 'failed',
            message: `Script path không tồn tại: ${scriptPath}`
          };
        }
        
        let r;
        try {
          r = await this.buildService.runScript(
            scriptPath,
            actualRepoPath,
            env,
            job, // jobInfo
            lastCommitHash || null // commitHash
          );
        } catch (error) {
          console.error(`[SCRIPT] Lỗi khi thực thi script: ${error.message}`);
          r = { ok: false, error: error.message };
        }

        // Chuẩn hóa kết quả để phù hợp với hệ thống thống kê
        buildResult = {
          buildId: r?.buildId || `script-${Date.now()}`,
          status: r?.ok ? 'completed' : 'failed',
          message: r?.ok ? 'Script build completed' : 'Script build failed'
        };
        this.logger?.send(`[JOB] buildResult: ${JSON.stringify(buildResult)}`);
        // Nếu auto-increment, cập nhật lại tagNumber trong job để lần sau hiển thị đúng
        if (r?.ok && autoInc) {
          const { splitTagIntoParts } = require('../utils/tag');
          const parts = splitTagIntoParts(imageTag);
          const updated = {
            ...job,
            buildConfig: {
              ...job.buildConfig,
              imageTagNumber: parts.numberPart,
              imageTagText: parts.textPart
            }
          };
          try { this.jobService.updateJob(job.id, updated); } catch (_) {}
        }
      } else if (job.buildConfig.method === 'dockerfile') {
        // For dockerfile builds, we'll need to implement docker build logic
        buildResult = await this.executeDockerBuild(job, (this.lastCommitHash || null));
      } else if (job.buildConfig.method === 'jsonfile') {
        const pipelinePath = job.buildConfig?.jsonPipelinePath || '';
        if (!pipelinePath) throw new Error('jsonPipelinePath is required for jsonfile build method');
        
        // Kiểm tra commit hash trước khi chạy pipeline (chỉ chạy nếu commit mới hoặc chưa từng build thành công)
        const shouldCheckCommit = job.buildConfig?.checkCommit !== false;
        let currentCommitHash = null; // Khai báo biến ở phạm vi rộng hơn
        
        // Đọc file pipeline để kiểm tra cấu hình check_commit
        let pipelineCheckCommit = false;
        try {
          const fs = require('fs');
          const pipelineContent = fs.readFileSync(pipelinePath, 'utf8');
          const pipelineSpec = JSON.parse(pipelineContent);
          pipelineCheckCommit = pipelineSpec.check_commit === true;
        } catch (error) {
          console.log(`[JOB] Failed to read pipeline file for commit check: ${error.message}`);
        }
        
        // Chỉ kiểm tra commit nếu được cấu hình ở job HOẶC trong pipeline
        const shouldPerformCommitCheck = shouldCheckCommit || pipelineCheckCommit;
        
        if (shouldPerformCommitCheck && job.gitConfig?.repoUrl) {
          const GitService = require('../services/GitService');
          const gitService = new GitService({ logger: this.logger, configService: this.configService, dockerService: this.dockerService });
          
          let hasNewCommit = false;
          
          // Kiểm tra từng branch trong danh sách
          for (const branchConfig of branchesToProcess) {
            const branch = branchConfig.name;
            
            // Lấy commit hash hiện tại từ remote
            const commitCheckResult = await gitService.checkNewCommitAndPull({
              repoUrl: job.gitConfig.repoUrl,
              branch: branch,
              repoPath: job.gitConfig.repoPath || '',
              token: job.gitConfig.token || '',
              provider: job.gitConfig.provider || 'github'
            });
            
            if (!commitCheckResult.ok) {
              console.log(`[JOB] Failed to check commit for job: ${job.name}, branch: ${branch}, error: ${commitCheckResult.error}`);
              continue; // Tiếp tục với branch khác nếu có lỗi
            } else if (commitCheckResult.hasNew) {
              console.log(`[JOB] New commit found for job: ${job.name}, branch: ${branch}, commit: ${commitCheckResult.remoteHash}`);
              this.lastCommitHash = commitCheckResult.remoteHash;
              currentCommitHash = commitCheckResult.remoteHash;
              hasNewCommit = true;
              break; // Chỉ cần một commit mới để trigger build
            } else {
              // Không có commit mới, kiểm tra xem commit hiện tại đã từng build thành công chưa
              currentCommitHash = commitCheckResult.remoteHash;
              if (currentCommitHash) {
                // Kiểm tra xem commit này đã từng build thành công chưa
                const shouldBuild = await this.jobService.shouldBuildCommit(job.id, currentCommitHash);
                if (!shouldBuild.shouldBuild) {
                  console.log(`[JOB] Commit ${currentCommitHash} already built successfully for job: ${job.name}, branch: ${branch}, skipping pipeline execution. Reason: ${shouldBuild.reason}`);
                  // Tiếp tục kiểm tra các branch khác
                  continue;
                }
                console.log(`[JOB] Commit ${currentCommitHash} needs to be built for job: ${job.name}, branch: ${branch}`);
                this.lastCommitHash = currentCommitHash;
                hasNewCommit = true; // Cần build vì commit chưa được build thành công
                break;
              }
            }
          }
          
          // Nếu không có commit mới hoặc commit cần build trên bất kỳ branch nào
          if (!hasNewCommit && currentCommitHash) {
            console.log(`[JOB] No new commits or commits needing build found for any branch in job: ${job.name}`);
            return {
              success: true,
              buildId: `skip-${Date.now()}`,
              status: 'skipped',
              message: 'No new commits or commits needing build found on any branch, pipeline skipped',
              commitHash: currentCommitHash
            };
          }
        } else if (shouldPerformCommitCheck && !job.gitConfig?.repoUrl) {
          console.log(`[JOB][WARN] Cấu hình check_commit=true nhưng thiếu repo_url. Bỏ qua kiểm tra commit cho job: ${job.name}`);
        }
        
        const envOverrides = {}; // có thể truyền thêm env từ job nếu cần
        const r = await this.buildService.runPipelineFile(pipelinePath, envOverrides, job, currentCommitHash);
        buildResult = {
          ...r,
          buildId: r?.buildId || `json-${Date.now()}`,
          status: r?.ok ? 'completed' : 'failed',
          message: r?.ok ? 'JSON pipeline completed' : 'JSON pipeline failed'
        };
      } else {
        throw new Error(`Unsupported build method: ${job.buildConfig.method}`);
      }

      console.log(`[JOB] Build completed for job: ${job.name}, Status: ${buildResult.status}`);

      // Gửi email thông báo nếu cấu hình cho phép (chỉ gửi cho completed/failed)
      try {
        if (this.emailService && ['completed', 'failed'].includes(buildResult.status)) {
          await this._notifyBuildResult(job, buildResult);
        }
      } catch (e) {
        this.logger?.send?.(`[JOB][EMAIL] Lỗi gửi email notify: ${e.message}`);
      }
      
      // Lưu commit hash vào jobs.json sau khi build thành công
      if (buildResult.status === 'completed' && this.lastCommitHash) {
        try {
          this.jobService.updateJobStats(job.id, {
            success: true,
            commitHash: this.lastCommitHash
          });
          console.log(`[JOB] Đã lưu commit hash ${this.lastCommitHash} vào jobs.json cho job ${job.name}`);
        } catch (error) {
          console.error(`[JOB] Lỗi khi lưu commit hash: ${error.message}`);
        }
      }
      
      return {
        success: buildResult.status === 'completed',
        buildId: buildResult.buildId,
        status: buildResult.status,
        message: buildResult.message || 'Build completed'
      };
    } catch (error) {
      console.error(`[JOB] Build failed for job: ${job.name}`, error);
      // Gửi email thất bại
      try {
        if (this.emailService) {
          await this._notifyBuildResult(job, { buildId: null, status: 'failed', message: error.message, failureReason: error.message });
        }
      } catch (e) {
        this.logger?.send?.(`[JOB][EMAIL] Lỗi gửi email notify khi thất bại: ${e.message}`);
      }
      
      return {
        success: false,
        buildId: null,
        status: 'failed',
        message: error.message
      };
    }
  }

  /**
   * Gửi email thông báo kết quả build
   */
  async _notifyBuildResult(job, buildResult) {
    const cfg = this.configService.getConfig();
    const emailCfg = cfg.email || {};
    if (!emailCfg.enableEmailNotify) return;

    const recipients = Array.isArray(emailCfg.notifyEmails) ? emailCfg.notifyEmails : [];
    if (!recipients.length) return;

    const statusLabel = buildResult.status === 'completed' ? 'THÀNH CÔNG' : (buildResult.status === 'failed' ? 'THẤT BẠI' : buildResult.status);
    const subject = `[CI/CD] Job "${job.name}" ${statusLabel}`;

    // Thu thập thông tin thêm
    const gc = job.gitConfig || {};
    const bc = job.buildConfig || {};
    const method = bc.method || 'dockerfile';
    const commitInfo = buildResult.commitInfo || {};

    const timeStr = new Date().toLocaleString(
      'vi-VN',{ timeZone:'Asia/Ho_Chi_Minh'}
    );

    const lines = [
      `Job: ${job.name}`,
      `Trạng thái: ${statusLabel}`,
      `Phương thức build: ${method}`,
      commitInfo.hash ? `Commit: ${commitInfo.hash}` : undefined,
      commitInfo.message ? `Commit Message: ${commitInfo.message}` : undefined,
      buildResult.failureReason ? `Lý do thất bại: ${buildResult.failureReason}` : undefined,
      gc.branch ? `Branch: ${gc.branch}` : undefined,
      gc.repoUrl ? `Repo: ${gc.repoUrl}` : undefined,
      `Thời gian: ${timeStr}`,
      buildResult.message ? `Thông điệp: ${buildResult.message}` : undefined,
    ].filter(Boolean);

    const text = lines.join('\n');
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6">${lines.map(l => `<div>${l}</div>`).join('')}<hr/><div>CI/CD System</div></div>`;

    return await this.emailService.sendNotificationEmail({ toList: recipients, subject, text, html });
  }

  // Execute Docker build (placeholder for now)
  async executeDockerBuild(job, commitHash = null) {
    // Build Docker image sử dụng cấu hình từ job (không dùng config.json)
    const { DockerService } = require('../services/DockerService');
    const dockerService = new DockerService({ logger: this.logger, configService: this.configService });

    const dc = (job.buildConfig && job.buildConfig.dockerConfig) ? job.buildConfig.dockerConfig : {};
    // Ưu tiên dùng Context/Katalyst/repo làm context mặc định nếu không cấu hình
    const cfg = this.configService.getConfig();
    const baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '';
    const repoPathDefault = baseContext ? path.join(baseContext, 'Katalyst', 'repo') : (job.gitConfig?.repoPath || '.');
    const ctxPath = dc.contextPath || repoPathDefault;
    const params = {
      dockerfilePath: dc.dockerfilePath || '',
      contextPath: ctxPath,
      imageName: dc.imageName || 'app',
      imageTag: dc.imageTag || 'latest',
      registryUrl: dc.registryUrl || '',
      registryUsername: dc.registryUsername || '',
      registryPassword: dc.registryPassword || '',
      autoTagIncrement: !!dc.autoTagIncrement,
      commitHash: commitHash || '',
      updateConfigTag: false // Không cập nhật config.json khi build theo job
    };

    const r = await dockerService.buildAndPush(params);

    // Chuẩn hóa kết quả
    const result = {
      buildId: `docker-${Date.now()}`,
      status: r.hadError ? 'failed' : 'completed',
      message: r.hadError ? 'Docker build failed' : 'Docker build completed'
    };

    // Nếu auto-increment và build thành công, cập nhật lại tag trong job
    if (!r.hadError && dc.autoTagIncrement) {
      const { splitTagIntoParts } = require('../utils/tag');
      const parts = splitTagIntoParts(r.tagToUse || dc.imageTag || 'latest');
      const updated = {
        ...job,
        buildConfig: {
          ...job.buildConfig,
          dockerConfig: {
            ...dc,
            imageTag: r.tagToUse
          },
          imageTagNumber: parts.numberPart,
          imageTagText: parts.textPart
        }
      };
      try { this.jobService.updateJob(job.id, updated); } catch (_) {}
    }

    return result;
  }

  /**
   * Đảm bảo repo tại repoPath đã sẵn sàng (clone hoặc init nếu cần)
   */
  async _ensureRepoReady({ repoPath, branch, repoUrl, token, provider }) {
    try {
      // Tạo thư mục con dựa trên tên repository từ URL
      const repoName = this._extractRepoNameFromUrl(repoUrl);
      const repoSubPath = path.join(repoPath, repoName);
      const gitDir = path.join(repoSubPath, '.git');
      
      const useHttpsAuth = !!token && /^https?:\/\//.test(String(repoUrl));
      let authConfig = '';
      if (useHttpsAuth) {
        try {
          const user = String(provider || 'gitlab').toLowerCase() === 'github' ? 'x-access-token' : 'oauth2';
          const basic = Buffer.from(`${user}:${token}`).toString('base64');
          authConfig = `-c http.extraHeader=\"Authorization: Basic ${basic}\"`;
        } catch (e) {
          this.logger?.send?.(`[GIT][WARN] Không tạo được header Authorization cho clone: ${e.message}`);
        }
      }

      if (!fs.existsSync(gitDir)) {
        // Nếu thư mục rỗng hoặc chưa là repo git, tiến hành clone/init
        const exists = fs.existsSync(repoSubPath);
        if (!exists) {
          // Clone vào thư mục con
          fs.mkdirSync(repoSubPath, { recursive: true });
          const cmd = `git ${authConfig} clone ${repoUrl} "${repoSubPath}" -b ${branch}`;
          this.logger?.send?.(`[GIT][CLONE] > ${cmd}`);
          const r = await run(cmd, this.logger);
          if (r.error) {
            this.logger?.send?.(`[GIT][CLONE][ERROR] ${r.error.message}`);
            throw new Error('git clone failed');
          }
          return repoSubPath; // Trả về đường dẫn thực tế
        }
        // Nếu thư mục đã tồn tại nhưng không phải repo, init và fetch
        const cmds = [
          `git -C "${repoSubPath}" init`,
          `git -C "${repoSubPath}" remote add origin ${repoUrl}`,
          `git -C "${repoSubPath}" ${authConfig} fetch origin`,
          `git -C "${repoSubPath}" checkout -b ${branch} || git -C "${repoSubPath}" checkout ${branch}`,
          `git -C "${repoSubPath}" reset --hard origin/${branch}`,
        ];
        for (const c of cmds) {
          this.logger?.send?.(`[GIT][INIT] > ${c}`);
          const r = await run(c, this.logger);
          if (r.error) {
            this.logger?.send?.(`[GIT][INIT][ERROR] ${r.error.message}`);
            throw new Error('git init/fetch/reset failed');
          }
        }
      }
      
      return repoSubPath; // Trả về đường dẫn thực tế
    } catch (e) {
      throw e;
    }
  }

   /**
    * Trích xuất tên repository từ URL Git
    * Ví dụ: https://github.com/user/my-repo.git → my-repo
    */
   _extractRepoNameFromUrl(repoUrl) {
     if (!repoUrl) return 'unknown-repo';
     
     // Loại bỏ .git ở cuối nếu có
     let name = repoUrl.replace(/\.git$/, '');
     
     // Trích xuất phần cuối cùng của URL
     const parts = name.split('/');
     name = parts[parts.length - 1];
     
     // Loại bỏ các ký tự không hợp lệ cho tên thư mục
     name = name.replace(/[^a-zA-Z0-9_-]/g, '-');
     
     return name || 'unknown-repo';
   }

  /**
   * Lấy commit hash hiện tại từ repository của job
   * @param {Object} job - Job object
   * @returns {Promise<string|null>} Commit hash hoặc null nếu không thể lấy
   */
  async getCurrentCommitHash(job) {
    try {
      const gc = job.gitConfig || {};
      if (!gc.repoUrl || !gc.branch) {
        return null;
      }

      // Lấy đường dẫn repo thực tế
      const cfg = this.configService.getConfig();
      const baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '';
      const repoPathDefault = baseContext ? path.join(baseContext, 'Katalyst', 'repo') : (gc.repoPath || '.');
      
      // Đảm bảo repo đã sẵn sàng
      const actualRepoPath = await this._ensureRepoReady({
        repoPath: repoPathDefault,
        branch: gc.branch,
        repoUrl: gc.repoUrl,
        token: gc.token || '',
        provider: gc.provider || 'github'
      });

      if (!actualRepoPath) {
        return null;
      }

      // Lấy commit hash hiện tại từ remote
      const GitService = require('../services/GitService');
      const gitService = new GitService({ logger: this.logger, configService: this.configService, dockerService: this.dockerService });
      
      const commitCheckResult = await gitService.checkNewCommitAndPull({
        repoUrl: gc.repoUrl,
        branch: gc.branch,
        repoPath: actualRepoPath,
        token: gc.token || '',
        provider: gc.provider || 'github',
        doPull: false // Chỉ kiểm tra, không pull
      });

      if (commitCheckResult.ok && commitCheckResult.remoteHash) {
        return commitCheckResult.remoteHash;
      }

      return null;
    } catch (error) {
      console.error(`Error getting current commit hash for job ${job.name}:`, error);
      return null;
    }
  }

  // GET /api/jobs/enabled - Get enabled jobs for scheduler
  async getEnabledJobs(req, res) {
    try {
      const enabledJobs = this.jobService.getEnabledJobs();
      res.json(enabledJobs);
    } catch (error) {
      console.error('Error getting enabled jobs:', error);
      res.status(500).json({ error: 'Failed to get enabled jobs' });
    }
  }
}

module.exports = JobController;