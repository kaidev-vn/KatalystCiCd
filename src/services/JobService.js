const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { QueueService } = require('./QueueService');
const { getSecretManager } = require('../utils/secrets');
const { DataStorageService } = require('./DataStorageService');

/**
 * JobService - Service quản lý jobs (CRUD operations)
 * Lưu trữ jobs vào file JSON và cung cấp các phương thức để tạo, đọc, cập nhật, xóa jobs
 * @class
 */
class JobService {
  /**
   * Tạo JobService instance
   * @constructor
   * @param {Object} logger - Logger instance
   * @param {Object} [jobController] - JobController instance (optional)
   */
  constructor(logger, jobController) {
    this.logger = logger;
    this.jobController = jobController;
    this.jobsFile = path.join(__dirname, '../../jobs.json');
    this.secretManager = getSecretManager();
    this.storageService = new DataStorageService({ logger, dataDir: path.dirname(this.jobsFile) });
    this.ensureJobsFile();
    
    // Track running jobs to prevent polling spam
    this.runningJobs = new Set();
    
    // Initialize queue service for weaker machines
    this.queueService = new QueueService({
      maxConcurrentJobs: 1, // Chỉ chạy 1 job cùng lúc cho máy yếu
      resourceThreshold: 70, // Dừng queue nếu CPU/Memory > 70%
      logger: this.logger
    });
    
    // Inject job executor nếu có jobController
    if (this.jobController) {
      this.queueService.setJobExecutor(this._jobExecutor.bind(this));
    }
  }

  /**
   * Job executor function cho QueueService
   * @private
   * @param {Object} queueJob - Queue job object
   * @returns {Promise<Object>} Build result
   */
  async _jobExecutor(queueJob) {
    try {
      // Lấy job thực tế từ jobId trong queue job
      const jobId = queueJob.jobId || queueJob.id;
      if (!jobId) {
        throw new Error('Queue job missing jobId');
      }
      
      const job = this.getJobById(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }
      
      // Gọi executeJobBuild từ jobController
      return await this.jobController.executeJobBuild(job);
      
    } catch (error) {
      this.logger?.send(`[JOB-EXECUTOR] Lỗi thực thi job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Đảm bảo file jobs.json tồn tại
   * @private
   * @returns {void}
   */
  ensureJobsFile() {
    if (!fs.existsSync(this.jobsFile)) {
      fs.writeFileSync(this.jobsFile, JSON.stringify([], null, 2));
    }
  }

  /**
   * Lấy tất cả jobs
   * @returns {Array<Object>} Danh sách jobs
   */
  getAllJobs() {
    try {
      if (this.storageService.isUsingDatabase()) {
        return this.storageService.getData('jobs', []);
      }
      const data = fs.readFileSync(this.jobsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading jobs file:', error);
      return [];
    }
  }

  /**
   * Lấy job theo ID
   * @param {string} jobId - Job ID
   * @returns {Object|undefined} Job object hoặc undefined nếu không tìm thấy
   */
  getJobById(jobId) {
    const jobs = this.getAllJobs();
    return jobs.find(job => job.id === jobId);
  }

  /**
   * Tạo job mới
   * @param {Object} jobData - Job data
   * @param {string} jobData.name - Tên job
   * @param {string} [jobData.description] - Mô tả job
   * @param {boolean} [jobData.enabled=true] - Job có enabled không
   * @param {Object} jobData.gitConfig - Cấu hình Git
   * @param {string} jobData.gitConfig.provider - Git provider (gitlab/github)
   * @param {string} jobData.gitConfig.repoUrl - Repository URL
   * @param {string} jobData.gitConfig.branch - Branch name
   * @param {Object} jobData.buildConfig - Cấu hình build
   * @param {string} jobData.buildConfig.method - Build method (dockerfile/script/jsonfile)
   * @param {Array<Object>} [jobData.services] - Danh sách services cần build
   * @param {Object} [jobData.schedule] - Cấu hình schedule
   * @returns {Object} Job object đã tạo
   */
  createJob(jobData) {
    const jobs = this.getAllJobs();
    
    const newJob = {
      id: uuidv4(),
      name: jobData.name,
      description: jobData.description || '',
      enabled: jobData.enabled !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // Git Configuration (encrypt sensitive data)
      gitConfig: {
        provider: jobData.gitConfig?.provider || 'gitlab',
        account: jobData.gitConfig?.account || '',
        token: this.secretManager.encrypt(jobData.gitConfig?.token || ''), // ✅ Encrypted
        repoUrl: jobData.gitConfig?.repoUrl || '',
        repoPath: jobData.gitConfig?.repoPath || this._generateRepoPath(jobData.gitConfig?.repoUrl),
        branch: jobData.gitConfig?.branch || 'main',
        // Multiple branches configuration
        branches: jobData.gitConfig?.branches || [
          {
            name: jobData.gitConfig?.branch || 'main',
            tagPrefix: 'RELEASE',
            enabled: true
          }
        ]
      },
      
      // Build Configuration
      buildConfig: (() => {
        const method = jobData.buildConfig?.method || 'dockerfile';
        const base = {
          method,
          scriptPath: jobData.buildConfig?.scriptPath || '',
          jsonPipelinePath: jobData.buildConfig?.jsonPipelinePath || '',
          buildOrder: jobData.buildConfig?.buildOrder || 'parallel',
          dockerConfig: jobData.buildConfig?.dockerConfig ? {
            dockerfilePath: jobData.buildConfig.dockerConfig.dockerfilePath || '',
            contextPath: jobData.buildConfig.dockerConfig.contextPath || '',
            imageName: jobData.buildConfig.dockerConfig.imageName || '',
            imageTag: jobData.buildConfig.dockerConfig.imageTag || '',
            autoTagIncrement: jobData.buildConfig.dockerConfig.autoTagIncrement || false,
            registryUrl: jobData.buildConfig.dockerConfig.registryUrl || '',
            registryUsername: jobData.buildConfig.dockerConfig.registryUsername || '',
            registryPassword: this.secretManager.encrypt(jobData.buildConfig.dockerConfig.registryPassword || '') // ✅ Encrypted
          } : {
            dockerfilePath: '',
            contextPath: '',
            imageName: '',
            imageTag: '',
            autoTagIncrement: false,
            registryUrl: '',
            registryUsername: '',
            registryPassword: ''
          }
        };
        // Preserve script-specific tagging/registry fields when method is script (encrypt password)
        if (method === 'script') {
          base.imageName = jobData.buildConfig?.imageName || '';
          base.imageTagNumber = jobData.buildConfig?.imageTagNumber || '';
          base.imageTagText = jobData.buildConfig?.imageTagText || '';
          base.autoTagIncrement = !!jobData.buildConfig?.autoTagIncrement;
          base.registryUrl = jobData.buildConfig?.registryUrl || '';
          base.registryUsername = jobData.buildConfig?.registryUsername || '';
          base.registryPassword = this.secretManager.encrypt(jobData.buildConfig?.registryPassword || ''); // ✅ Encrypted
        }
        return base;
      })(),
      
      // Services to build
      services: jobData.services || [],
      
      // Scheduling with flexible trigger method
      schedule: {
        // Trigger method: 'polling', 'webhook', hoặc 'hybrid'
        triggerMethod: jobData.schedule?.triggerMethod || 'polling',
        autoCheck: jobData.schedule?.autoCheck || false,
        polling: jobData.schedule?.polling || 30,
        cron: jobData.schedule?.cron || ''
      },
      
      // Statistics
      stats: {
        totalBuilds: 0,
        successfulBuilds: 0,
        failedBuilds: 0,
        lastBuildAt: null,
        lastBuildStatus: null,
        triggeredBy: null // 'polling', 'webhook', 'manual'
      }
    };

    jobs.push(newJob);
    this.saveJobs(jobs);
    
    return newJob;
  }

  /**
   * Cập nhật job
   * @param {string} jobId - Job ID
   * @param {Object} updateData - Data cần update
   * @returns {Object} Job object đã cập nhật
   * @throws {Error} Nếu job không tồn tại
   */
  updateJob(jobId, updateData) {
    const jobs = this.getAllJobs();
    const jobIndex = jobs.findIndex(job => job.id === jobId);
    
    if (jobIndex === -1) {
      throw new Error('Job not found');
    }

    // Update job data
    jobs[jobIndex] = {
      ...jobs[jobIndex],
      ...updateData,
      id: jobId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };

    this.saveJobs(jobs);
    return jobs[jobIndex];
  }

  /**
   * Xóa job
   * @param {string} jobId - Job ID
   * @returns {boolean} True nếu xóa thành công
   * @throws {Error} Nếu job không tồn tại
   */
  deleteJob(jobId) {
    const jobs = this.getAllJobs();
    const filteredJobs = jobs.filter(job => job.id !== jobId);
    
    if (filteredJobs.length === jobs.length) {
      throw new Error('Job not found');
    }

    this.saveJobs(filteredJobs);
    return true;
  }

  /**
   * Toggle job enabled status
   * @param {string} jobId - Job ID
   * @returns {Object} Job object đã cập nhật
   * @throws {Error} Nếu job không tồn tại
   */
  toggleJob(jobId) {
    const job = this.getJobById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    return this.updateJob(jobId, { enabled: !job.enabled });
  }

  /**
   * Đánh dấu job đang chạy
   * @param {string} jobId - Job ID
   * @returns {boolean} True nếu thành công
   */
  markJobAsRunning(jobId) {
    if (this.isJobRunning(jobId)) {
      return false; // Job đã đang chạy
    }
    this.runningJobs.add(jobId);
    this.logger?.send(`[JOB-SERVICE] Job ${jobId} đang chạy, tạm dừng polling`);
    return true;
  }

  /**
   * Đánh dấu job đã hoàn thành
   * @param {string} jobId - Job ID
   * @returns {boolean} True nếu thành công
   */
  markJobAsCompleted(jobId) {
    if (!this.isJobRunning(jobId)) {
      return false; // Job không đang chạy
    }
    this.runningJobs.delete(jobId);
    this.logger?.send(`[JOB-SERVICE] Job ${jobId} đã hoàn thành, resume polling`);
    return true;
  }

  /**
   * Tự động tạo repoPath dựa trên repoUrl và context path
   * @private
   * @param {string} repoUrl - Repository URL
   * @returns {string} Đường dẫn repository tự động tạo
   */
  _generateRepoPath(repoUrl) {
    const { ConfigService } = require('./ConfigService');
    const configService = new ConfigService();
    const cfg = configService.getConfig();
    
    // Lấy base context từ config
    const baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '/opt';
    
    // Trích xuất tên repository từ URL
    let repoName = 'unknown-repo';
    if (repoUrl) {
      try {
        const urlParts = repoUrl.split('/');
        repoName = urlParts[urlParts.length - 1].replace('.git', '');
      } catch (e) {
        this.logger?.send(`[JOB-SERVICE] Không thể trích xuất tên repo từ URL: ${repoUrl}`);
      }
    }
    
    // Tạo đường dẫn: baseContext/Katalyst/repo/repo-name
    return path.join(baseContext, 'Katalyst', 'repo', repoName);
  }

  /**
   * Kiểm tra job có đang chạy không
   * @param {string} jobId - Job ID
   * @returns {boolean} True nếu job đang chạy
   */
  isJobRunning(jobId) {
    return this.runningJobs.has(jobId);
  }

  /**
   * Cập nhật thống kê job sau khi build
   * @param {string} jobId - Job ID
   * @param {Object} buildResult - Kết quả build
   * @param {boolean} buildResult.success - Build có thành công không
   * @returns {Object} Job object đã cập nhật
   * @throws {Error} Nếu job không tồn tại
   */
  updateJobStats(jobId, buildResult) {
    const job = this.getJobById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    const stats = {
      totalBuilds: job.stats.totalBuilds + 1,
      successfulBuilds: job.stats.successfulBuilds + (buildResult.success ? 1 : 0),
      failedBuilds: job.stats.failedBuilds + (buildResult.success ? 0 : 1),
      lastBuildAt: new Date().toISOString(),
      lastBuildStatus: buildResult.success ? 'success' : 'failed'
    };

    return this.updateJob(jobId, { stats });
  }

  /**
   * Lấy danh sách jobs đã enabled và có autoCheck
   * @returns {Array<Object>} Danh sách enabled jobs
   */
  getEnabledJobs() {
    return this.getAllJobs().filter(job => job.enabled && job.schedule.autoCheck);
  }

  /**
   * Lưu danh sách jobs vào file
   * @private
   * @param {Array<Object>} jobs - Danh sách jobs
   * @returns {void}
   * @throws {Error} Nếu không thể ghi file
   */
  saveJobs(jobs) {
    try {
      if (this.storageService.isUsingDatabase()) {
        this.storageService.saveData('jobs', jobs);
      } else {
        fs.writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2));
      }
    } catch (error) {
      console.error('Error saving jobs file:', error);
      throw error;
    }
  }

  /**
   * Validate job data trước khi tạo/cập nhật
   * @param {Object} jobData - Job data cần validate
   * @returns {Array<string>} Danh sách lỗi validation (rỗng nếu valid)
   */
  validateJobData(jobData) {
    const errors = [];

    if (!jobData.name || jobData.name.trim() === '') {
      errors.push('Job name is required');
    }

    // Validate trigger method
    const triggerMethod = jobData.schedule?.triggerMethod || 'polling';
    const validTriggerMethods = ['polling', 'webhook', 'hybrid'];
    if (!validTriggerMethods.includes(triggerMethod)) {
      errors.push(`Invalid trigger method. Must be one of: ${validTriggerMethods.join(', ')}`);
    }

    // Validate polling config nếu dùng polling hoặc hybrid
    if (triggerMethod === 'polling' || triggerMethod === 'hybrid') {
      if (jobData.schedule?.autoCheck) {
        const polling = Number(jobData.schedule?.polling || 30);
        if (polling < 5) {
          errors.push('Polling interval must be at least 5 seconds');
        }
      }
    }

    // Với phương thức jsonfile, cho phép bỏ qua git repo/branch vì pipeline tự xử lý checkout
    if ((jobData.buildConfig?.method || 'dockerfile') !== 'jsonfile') {
      if (!jobData.gitConfig?.repoUrl) {
        errors.push('Repository URL is required');
      }
      if (!jobData.gitConfig?.branch) {
        errors.push('Branch is required');
      }
    } else {
      if (!jobData.buildConfig?.jsonPipelinePath) {
        errors.push('Pipeline JSON file path is required for jsonfile build method');
      }
    }

    // Với phương thức build script, đường dẫn script có thể được tạo tự động trong thư mục builder.
    // Không bắt buộc người dùng phải nhập scriptPath.

    // Với phương thức dockerfile, Dockerfile có thể được dùng mặc định ở root của context.
    // Không bắt buộc người dùng phải nhập dockerfilePath.

    // Services selection is only required for dockerfile builds.
    // For script builds, services are optional.
    if (jobData.buildConfig?.method === 'dockerfile') {
      if (!jobData.services || jobData.services.length === 0) {
        errors.push('At least one service must be selected for dockerfile build method');
      }
    }

    return errors;
  }
  
  /**
   * Lấy job với secrets đã được decrypt (để sử dụng trong build process)
   * ⚠️ CẢNH BÁO: Phương thức này trả về plain text passwords/tokens - CHỈ dùng khi cần thiết!
   * @param {string} jobId - Job ID
   * @returns {Object|null} Job object với secrets đã decrypt
   */
  getDecryptedJob(jobId) {
    const job = this.getJobById(jobId);
    if (!job) return null;
    
    return {
      ...job,
      gitConfig: {
        ...job.gitConfig,
        token: this.secretManager.decrypt(job.gitConfig?.token || '') // ✅ Decrypt
      },
      buildConfig: {
        ...job.buildConfig,
        dockerConfig: {
          ...job.buildConfig?.dockerConfig,
          registryPassword: this.secretManager.decrypt(job.buildConfig?.dockerConfig?.registryPassword || '') // ✅ Decrypt
        },
        // Script config
        registryPassword: this.secretManager.decrypt(job.buildConfig?.registryPassword || '') // ✅ Decrypt
      }
    };
  }
  
  /**
   * Lấy trigger method của job
   * @param {string} jobId - Job ID
   * @returns {string} Trigger method ('polling', 'webhook', 'hybrid')
   */
  getTriggerMethod(jobId) {
    const job = this.getJobById(jobId);
    return job?.schedule?.triggerMethod || 'polling';
  }
  
  /**
   * Check xem job có accept polling trigger không
   * @param {string} jobId - Job ID
   * @returns {boolean} True nếu accept polling
   */
  acceptsPolling(jobId) {
    const method = this.getTriggerMethod(jobId);
    return method === 'polling' || method === 'hybrid';
  }
  
  /**
   * Check xem job có accept webhook trigger không
   * @param {string} jobId - Job ID
   * @returns {boolean} True nếu accept webhook
   */
  acceptsWebhook(jobId) {
    const method = this.getTriggerMethod(jobId);
    return method === 'webhook' || method === 'hybrid';
  }
}

module.exports = JobService;