const JobService = require('../services/JobService');
const { BuildService } = require('../services/BuildService');

class JobController {
  constructor({ buildService, logger, configService, jobScheduler, gitService, queueService, emailService }) {
    this.jobService = new JobService(logger);
    this.buildService = buildService;
    this.logger = logger;
    this.configService = configService;
    this.jobScheduler = jobScheduler; // Optional, sẽ dùng để restart lịch theo job
    this.gitService = gitService; // Dùng để kiểm tra commit mới trước khi build
    this.queueService = queueService; // Optional: sẽ được gán trong app.js nếu chưa có ở thời điểm khởi tạo
    this.emailService = emailService; // Optional: gửi email khi build xong
  }

  // GET /api/jobs - Get all jobs
  async getAllJobs(req, res) {
    try {
      const jobs = this.jobService.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error('Error getting jobs:', error);
      res.status(500).json({ error: 'Failed to get jobs' });
    }
  }

  // GET /api/jobs/:id - Get job by ID
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

  // POST /api/jobs - Create new job
  async createJob(req, res) {
    try {
      const jobData = req.body;
      // Debug: log incoming payload to help diagnose validation issues reported by user
      try {
        console.log('[JobController] Incoming createJob payload:', JSON.stringify(jobData, null, 2));
      } catch (e) {
        console.log('[JobController] Incoming createJob payload (stringify failed):', jobData);
      }

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
      // Restart job scheduler để áp dụng job mới
      try { this.jobScheduler?.restart(); } catch (_) {}
      res.status(201).json(newJob);
    } catch (error) {
      console.error('Error creating job:', error);
      res.status(500).json({ error: 'Failed to create job' });
    }
  }

  // PUT /api/jobs/:id - Update job
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

  // Convert legacy payload shape to new standardized shape
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
      repoPath: legacyGit.repoPath || d.repoPath || ''
    };
    // Trim strings
    ['provider','account','token','branch','repoUrl','repoPath'].forEach(k => {
      if (typeof gitConfig[k] === 'string') gitConfig[k] = gitConfig[k].trim();
    });

    // Normalize build config
    const legacyBuild = d.build || {};
    // docker config might be nested or flat in legacy
    const legacyDockerConfig = legacyBuild.dockerConfig || {
      dockerfilePath: legacyBuild.dockerfilePath || d.dockerfilePath || '',
      contextPath: legacyBuild.contextPath || d.contextPath || '',
      imageName: legacyBuild.imageName || d.imageName || '',
      imageTag: legacyBuild.imageTag || d.imageTag || '',
      autoTagIncrement: !!(legacyBuild.autoTagIncrement || d.autoTagIncrement),
      registryUrl: legacyBuild.registryUrl || d.registryUrl || '',
      registryUsername: legacyBuild.registryUsername || d.registryUsername || '',
      registryPassword: legacyBuild.registryPassword || d.registryPassword || ''
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
      buildConfig.imageName = d.buildConfig?.imageName || legacyBuild.imageName || d.imageName || '';
      buildConfig.imageTagNumber = d.buildConfig?.imageTagNumber || legacyBuild.imageTagNumber || d.imageTagNumber || '';
      buildConfig.imageTagText = d.buildConfig?.imageTagText || legacyBuild.imageTagText || d.imageTagText || '';
      buildConfig.autoTagIncrement = !!(d.buildConfig?.autoTagIncrement || legacyBuild.autoTagIncrement || d.autoTagIncrement);
      buildConfig.registryUrl = d.buildConfig?.registryUrl || legacyBuild.registryUrl || d.registryUrl || '';
      buildConfig.registryUsername = d.buildConfig?.registryUsername || legacyBuild.registryUsername || d.registryUsername || '';
      buildConfig.registryPassword = d.buildConfig?.registryPassword || legacyBuild.registryPassword || d.registryPassword || '';
    }

    // Normalize services
    let services = Array.isArray(d.services) ? d.services : (Array.isArray(d.selectedServices) ? d.selectedServices : []);

    // Normalize schedule
    const schedule = d.schedule || {
      autoCheck: !!d.autoCheck,
      polling: typeof d.polling === 'number' ? d.polling : 30,
      cron: d.cron || ''
    };

    return {
      id: d.id,
      name: d.name,
      description: d.description,
      enabled: d.enabled !== false,
      gitConfig,
      buildConfig,
      services,
      schedule
    };
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
  async executeJobBuild(job) {
    try {
      console.log(`[JOB] Starting build for job: ${job.name} (${job.id})`);
      
      // Kiểm tra commit mới trước khi build để đáp ứng yêu cầu "phải có commit mới thì mới build"
      const gc = job.gitConfig || {};
      const repoPath = gc.repoPath;
      const branch = gc.branch || 'main';
      const repoUrl = gc.repoUrl;
      const token = gc.token;
      const provider = gc.provider || 'gitlab';

      if (this.gitService && repoPath) {
        const check = await this.gitService.checkNewCommitAndPull({
          repoPath,
          branch,
          repoUrl,
          token,
          provider,
          doPull: true
        });
        if (!check.ok) {
          throw new Error(`Kiểm tra/pull commit thất bại: ${check.error || 'unknown'}`);
        }
        if (!check.hasNew) {
          this.logger?.send(`[JOB] Không có commit mới cho job ${job.name} (${branch}). Bỏ qua build.`);
          return {
            success: true,
            buildId: `skip-${Date.now()}`,
            status: 'skipped',
            message: 'No new commit, build skipped'
          };
        }
        this.logger?.send(`[JOB] Phát hiện commit mới: ${check.remoteHash}. Tiến hành build.`);
        // Lưu commit hash gần nhất để truyền xuống tầng build nếu cần
        this.lastCommitHash = check.remoteHash;
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
        const imageTag = nextSplitTag(tagNumber || '1.0.75', tagText || '', autoInc);
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
        env.CONTEXT_PATH = dc.contextPath || job.gitConfig.repoPath || '';


        const r = await this.buildService.runScript(
          bc.scriptPath,
          job.gitConfig.repoPath,
          env
        );

        // Chuẩn hóa kết quả để phù hợp với hệ thống thống kê
        buildResult = {
          buildId: r?.buildId || `script-${Date.now()}`,
          status: r?.ok ? 'completed' : 'failed',
          message: r?.ok ? 'Script build completed' : 'Script build failed'
        };

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
          await this._notifyBuildResult(job, { buildId: null, status: 'failed', message: error.message });
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
    if (!emailCfg.enableEmailNotify) return; // không gửi nếu tắt

    const recipients = Array.isArray(emailCfg.notifyEmails) ? emailCfg.notifyEmails : [];
    if (!recipients.length) return;

    const statusLabel = buildResult.status === 'completed' ? 'THÀNH CÔNG' : (buildResult.status === 'failed' ? 'THẤT BẠI' : buildResult.status);
    const subject = `[CI/CD] Job "${job.name}" ${statusLabel}`;

    // Thu thập thông tin thêm
    const gc = job.gitConfig || {};
    const bc = job.buildConfig || {};
    const method = bc.method || 'dockerfile';
    const commitHash = this.lastCommitHash || '';
    const timeStr = new Date().toLocaleString();

    const lines = [
      `Job: ${job.name}`,
      `Trạng thái: ${statusLabel}`,
      `Phương thức build: ${method}`,
      commitHash ? `Commit: ${commitHash}` : undefined,
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
    const ctxPath = dc.contextPath || job.gitConfig?.repoPath || '.';
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
      const updated = {
        ...job,
        buildConfig: {
          ...job.buildConfig,
          dockerConfig: {
            ...dc,
            imageTag: r.tagToUse
          }
        }
      };
      try { this.jobService.updateJob(job.id, updated); } catch (_) {}
    }

    return result;
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