const JobService = require('../services/JobService');
const { BuildService } = require('../services/BuildService');

class JobController {
  constructor({ buildService, logger, configService, jobScheduler }) {
    this.jobService = new JobService(logger);
    this.buildService = buildService;
    this.logger = logger;
    this.configService = configService;
    this.jobScheduler = jobScheduler; // Optional, sẽ dùng để restart lịch theo job
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

    const buildConfig = d.buildConfig || {
      method: legacyBuild.method || d.method || 'dockerfile',
      scriptPath: legacyBuild.scriptPath || d.scriptPath || '',
      buildOrder: legacyBuild.buildOrder || d.buildOrder || 'parallel',
      dockerConfig: legacyDockerConfig
    };

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

      // Start build process
      const buildResult = await this.executeJobBuild(job);
      
      // Update job statistics
      this.jobService.updateJobStats(id, buildResult);
      
      res.json({
        message: 'Job build started',
        jobId: id,
        buildId: buildResult.buildId,
        status: buildResult.status
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

        buildResult = await this.buildService.runScript(
          bc.scriptPath,
          job.gitConfig.repoPath,
          env
        );
      } else if (job.buildConfig.method === 'dockerfile') {
        // For dockerfile builds, we'll need to implement docker build logic
        buildResult = await this.executeDockerBuild(job);
      } else {
        throw new Error(`Unsupported build method: ${job.buildConfig.method}`);
      }

      console.log(`[JOB] Build completed for job: ${job.name}, Status: ${buildResult.status}`);
      
      return {
        success: buildResult.status === 'completed',
        buildId: buildResult.buildId,
        status: buildResult.status,
        message: buildResult.message || 'Build completed'
      };
    } catch (error) {
      console.error(`[JOB] Build failed for job: ${job.name}`, error);
      
      return {
        success: false,
        buildId: null,
        status: 'failed',
        message: error.message
      };
    }
  }

  // Execute Docker build (placeholder for now)
  async executeDockerBuild(job) {
    // This will be implemented when we integrate with DockerService
    console.log(`[JOB] Docker build not yet implemented for job: ${job.name}`);
    
    return {
      buildId: `docker-${Date.now()}`,
      status: 'pending',
      message: 'Docker build not yet implemented'
    };
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