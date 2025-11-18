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
   * @param {Object} [configService] - ConfigService instance (optional)
   */
  constructor(logger, jobController, configService) {
    this.logger = logger;
    this.jobController = jobController;
    this.configService = configService;
    this.jobsFile = path.join(__dirname, '../../jobs.json');
    this.secretManager = getSecretManager();
    this.storageService = new DataStorageService({ logger, dataDir: path.dirname(this.jobsFile) });
    this.ensureJobsFile();
    
    // Track running jobs to prevent polling spam
    this.runningJobs = new Set();
    
    // Lấy cấu hình từ configService nếu có, nếu không dùng giá trị mặc định
    const config = this.configService ? this.configService.getConfig() : {};
    const maxConcurrentJobs = config.maxConcurrentBuilds || 1;
    const resourceThreshold = config.resourceThreshold || 70;
    
    // Initialize queue service với cấu hình từ config.json
    this.queueService = new QueueService({
      maxConcurrentJobs: maxConcurrentJobs,
      resourceThreshold: resourceThreshold,
      logger: this.logger,
      configService: this.configService
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
      
      // Gọi executeJobBuild từ jobController với metadata từ queue job
      return await this.jobController.executeJobBuild(job, queueJob.metadata);
      
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
    
    // Nếu là phương thức jsonfile và không có jsonPipelinePath, tạo đường dẫn tự động
    let jsonPipelinePath = jobData.buildConfig?.jsonPipelinePath || '';
    if (jobData.buildConfig?.method === 'jsonfile' && !jsonPipelinePath) {
      let repoName = 'project';
      
      // DEBUG: Log để xem payload nhận được
      console.log('[DEBUG] createJob payload:', {
        method: jobData.buildConfig?.method,
        jsonPipelinePath: jobData.buildConfig?.jsonPipelinePath,
        repoUrl: jobData.gitConfig?.repoUrl,
        hasRepoUrl: !!jobData.gitConfig?.repoUrl,
        repoUrlType: typeof jobData.gitConfig?.repoUrl
      });
      
      // Nếu có repoUrl hợp lệ (không empty), cố gắng extract tên repo
      if (jobData.gitConfig?.repoUrl && jobData.gitConfig.repoUrl.trim() !== '') {
        const extractedName = this._extractRepoName(jobData.gitConfig.repoUrl);
        console.log('[DEBUG] Extracted repo name:', extractedName);
        if (extractedName && extractedName !== 'unknown-repo') {
          repoName = extractedName;
        }
      }
      
      // Sử dụng configService đã được inject từ constructor
      const cfg = this.configService ? this.configService.getConfig() : {};
      const baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '/opt';
      const pipelineDir = path.join(baseContext, 'Katalyst', 'pipeline');
      jsonPipelinePath = path.join(pipelineDir, `${repoName}_pipeline.json`);
      
      console.log('[DEBUG] Generated jsonPipelinePath:', jsonPipelinePath);
    }
    
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
        branches: (jobData.gitConfig?.branches || [
          {
            name: jobData.gitConfig?.branch || 'main',
            tagPrefix: 'RELEASE',
            enabled: true
          }
        ]).map(branchConfig => ({
          ...branchConfig,
          // Tạo repoPath riêng cho mỗi branch nếu chưa có
          repoPath: branchConfig.repoPath || this._generateBranchRepoPath(jobData.gitConfig?.repoUrl, branchConfig.name)
        }))
      },
      
      // Build Configuration
      buildConfig: (() => {
        const method = jobData.buildConfig?.method || 'dockerfile';
        const base = {
          method,
          scriptPath: jobData.buildConfig?.scriptPath || '',
          jsonPipelinePath: jsonPipelinePath, // Sử dụng đường dẫn đã xác định
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

    // Tự động tạo repoPath nếu bị thiếu (đảm bảo tính nhất quán)
    this._ensureRepoPath(newJob);
    
    jobs.push(newJob);
    this.saveJobs(jobs);
    
    // Tự động tạo pipeline folder và file mẫu khi tạo job mới
    this._ensurePipelineFolder(newJob);
    
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

    // Merge dữ liệu cập nhật
    const updatedJob = {
      ...jobs[jobIndex],
      ...updateData,
      id: jobId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };

    // Tự động tạo repoPath nếu bị thiếu
    this._ensureRepoPath(updatedJob);

    jobs[jobIndex] = updatedJob;
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
    // Sử dụng configService đã được inject từ constructor
    const cfg = this.configService ? this.configService.getConfig() : {};
    
    // Lấy base context từ config - ưu tiên contextInitPath từ config.json
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
    
    // Tạo đường dẫn theo định dạng: baseContext/Katalyst/repo/repo-name
    // Nếu baseContext là D:\SOURCE-CODE, kết quả sẽ là D:\SOURCE-CODE\Katalyst\repo\repo-name
    return path.join(baseContext, 'Katalyst', 'repo', repoName);
  }

  /**
   * Tự động tạo repoPath riêng cho từng branch
   * @private
   * @param {string} repoUrl - Repository URL
   * @param {string} branchName - Tên branch
   * @returns {string} Đường dẫn repository riêng cho branch
   */
  _generateBranchRepoPath(repoUrl, branchName) {
    // Sử dụng configService đã được inject từ constructor
    const cfg = this.configService ? this.configService.getConfig() : {};
    
    // Lấy base context từ config - ưu tiên contextInitPath từ config.json
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
    
    // Tạo đường dẫn theo định dạng: baseContext/Katalyst/repo/repo-name/branch-name
    // Nếu baseContext là D:\SOURCE-CODE, kết quả sẽ là D:\SOURCE-CODE\Katalyst\repo\repo-name\branch-name
    return path.join(baseContext, 'Katalyst', 'repo', repoName, branchName);
  }

  /**
   * Đảm bảo job có repoPath hợp lệ, tự động tạo nếu bị thiếu
   * @private
   * @param {Object} job - Job object
   * @returns {void}
   */
  _ensureRepoPath(job) {
    const gc = job.gitConfig || {};
    
    // Chỉ xử lý nếu job có gitConfig và repoUrl
    if (!gc.repoUrl) {
      return;
    }
    
    // Nếu repoPath đã tồn tại, không cần làm gì
    if (gc.repoPath) {
      return;
    }
    
    // Tự động tạo repoPath dựa trên repoUrl
    const repoPath = this._generateRepoPath(gc.repoUrl);
    
    // Cập nhật job với repoPath mới
    job.gitConfig = {
      ...gc,
      repoPath: repoPath
    };
    
    this.logger?.send(`[JOB-SERVICE] Đã tự động tạo repoPath: ${repoPath}`);
  }

  /**
   * Tự động tạo pipeline folder và file pipeline.json dựa trên tên repository
   * @private
   * @param {Object} job - Job object
   * @returns {void}
   */
  _ensurePipelineFolder(job) {
    try {
      // Sử dụng configService đã được inject từ constructor
      const cfg = this.configService ? this.configService.getConfig() : {};
      
      const baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '/opt';
      const pipelineDir = path.join(baseContext, 'Katalyst', 'pipeline');
      
      // Tạo thư mục pipeline nếu chưa tồn tại
      if (!fs.existsSync(pipelineDir)) {
        fs.mkdirSync(pipelineDir, { recursive: true });
        this.logger?.send(`[JOB-SERVICE] Đã tạo thư mục pipeline: ${pipelineDir}`);
      }
      
      // Tạo file project_pipeline.json mẫu nếu chưa tồn tại
      const defaultPipelineFile = path.join(pipelineDir, 'project_pipeline.json');
      if (!fs.existsSync(defaultPipelineFile)) {
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
        
        fs.writeFileSync(defaultPipelineFile, JSON.stringify(samplePipeline, null, 2));
        this.logger?.send(`[JOB-SERVICE] Đã tạo file pipeline mẫu: ${defaultPipelineFile}`);
      }
      
      // Nếu job sử dụng phương thức jsonfile và có repoUrl, tạo file pipeline riêng
      if (job.buildConfig?.method === 'jsonfile' && job.gitConfig?.repoUrl) {
        const repoName = this._extractRepoName(job.gitConfig.repoUrl);
        if (repoName && repoName !== 'unknown-repo') {
          const repoPipelineFile = path.join(pipelineDir, `${repoName}_pipeline.json`);
          
          // Chỉ tạo file mới nếu chưa tồn tại
          if (!fs.existsSync(repoPipelineFile)) {
            const repoPipeline = {
            "pipeline_name": `${repoName} Build Pipeline`,
            "version": "1.0.0",
            "description": `Pipeline build tự động cho ${repoName}`,
            "working_directory": "${REPO_PATH}",
              "environment_vars": {
                "BUILD_VERSION": "1.0.0",
                "DEPLOY_ENV": "production",
                "PROJECT_NAME": repoName
              },
              "check_commit": true,
              "branch": job.gitConfig.branch || 'main',
              "repo_url": job.gitConfig.repoUrl,
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
            
            fs.writeFileSync(repoPipelineFile, JSON.stringify(repoPipeline, null, 2));
            this.logger?.send(`[JOB-SERVICE] Đã tạo file pipeline cho repository: ${repoPipelineFile}`);
            
            // Trả về đường dẫn file pipeline đã tạo để sử dụng trong job
            return repoPipelineFile;
          }
        }
      }
    } catch (error) {
      this.logger?.send(`[JOB-SERVICE][WARN] Không thể tạo pipeline folder: ${error.message}`);
    }
  }

  /**
   * Trích xuất tên repository từ URL
   * @private
   * @param {string} repoUrl - Repository URL
   * @returns {string} Tên repository
   */
  _extractRepoName(repoUrl) {
    if (!repoUrl || repoUrl.trim() === '') return 'unknown-repo';
    
    try {
      // Xử lý các định dạng URL khác nhau
      let urlToParse = repoUrl;
      
      // Nếu là SSH URL (git@github.com:user/repo.git)
      if (repoUrl.includes('@') && repoUrl.includes(':')) {
        const parts = repoUrl.split(':');
        if (parts.length > 1) {
          urlToParse = parts[1];
        }
      }
      
      // Nếu là HTTPS URL (https://github.com/user/repo.git)
      const urlParts = urlToParse.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      
      // Loại bỏ .git extension nếu có
      const repoName = lastPart.replace('.git', '');
      
      return repoName || 'unknown-repo';
    } catch (e) {
      this.logger?.send(`[JOB-SERVICE] Không thể trích xuất tên repo từ URL: ${repoUrl}`);
      return 'unknown-repo';
    }
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
   * @param {string} [buildResult.commitHash] - Commit hash của build
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
      lastBuildStatus: buildResult.success ? 'success' : 'failed',
      lastCommitHash: buildResult.commitHash || job.stats?.lastCommitHash || null
    };

    return this.updateJob(jobId, { stats });
  }

  /**
   * Kiểm tra xem commit đã được build trước đó chưa và có thất bại không
   * @param {string} jobId - Job ID
   * @param {string} commitHash - Commit hash cần kiểm tra
   * @returns {Object} Kết quả kiểm tra
   * @returns {boolean} shouldBuild - Có nên build commit này không
   * @returns {string} reason - Lý do
   */
  shouldBuildCommit(jobId, commitHash) {
    const job = this.getJobById(jobId);
    if (!job) {
      return { shouldBuild: false, reason: 'Job not found', commitHash: null };
    }

    // Nếu không có commit hash, luôn build (cho các trường hợp không dùng git)
    if (!commitHash) {
      return { shouldBuild: true, reason: 'No commit hash provided', commitHash: null };
    }

    // Lấy lịch sử build từ build service
    const buildHistory = this.getBuildHistoryForJob(jobId);
    
    // Tìm build gần nhất với commit hash này
    const buildsForCommit = buildHistory.filter(build => 
      build.commitHash === commitHash && build.jobId === jobId
    );

    // Nếu commit này chưa từng được build, build nó
    if (buildsForCommit.length === 0) {
      return { shouldBuild: true, reason: 'New commit, never built before', commitHash };
    }

    // Nếu commit này đã build thành công trước đó, không build lại
    const successfulBuild = buildsForCommit.find(build => build.status === 'success');
    if (successfulBuild) {
      return { 
        shouldBuild: false, 
        reason: 'Commit already built successfully before',
        commitHash 
      };
    }

    // Nếu commit này đang build (running), không build lại
    const runningBuild = buildsForCommit.find(build => build.status === 'running');
    if (runningBuild) {
      return { 
        shouldBuild: false, 
        reason: 'Commit is currently being built',
        commitHash 
      };
    }

    // Nếu commit này đã thất bại trước đó, không build lại (để tránh build liên tục)
    const failedBuild = buildsForCommit.find(build => build.status === 'failed');
    if (failedBuild) {
      return { 
        shouldBuild: false, 
        reason: 'Commit failed before, not rebuilding to avoid infinite loop',
        commitHash 
      };
    }

    // Mặc định build nếu không xác định được trạng thái
    return { shouldBuild: true, reason: 'Unknown build status, proceeding with build', commitHash };
  }

  /**
   * Lấy lịch sử build cho job cụ thể
   * @private
   * @param {string} jobId - Job ID
   * @returns {Array<Object>} Danh sách build history
   */
  getBuildHistoryForJob(jobId) {
    try {
      const buildHistoryFile = path.join(process.cwd(), 'build-history.json');
      if (!fs.existsSync(buildHistoryFile)) {
        return [];
      }
      
      const data = fs.readFileSync(buildHistoryFile, 'utf8');
      const history = JSON.parse(data);
      
      // Lọc chỉ các build của job này
      return history.filter(build => build.jobId === jobId);
    } catch (error) {
      console.error('Error reading build history:', error);
      return [];
    }
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
    
    try {
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
    } catch (error) {
      console.error(`Error decrypting job secrets for job ${jobId}:`, error);
      // Trả về job không có secrets thay vì throw error
      return {
        ...job,
        gitConfig: {
          ...job.gitConfig,
          token: '' // Empty string nếu không decrypt được
        },
        buildConfig: {
          ...job.buildConfig,
          dockerConfig: {
            ...job.buildConfig?.dockerConfig,
            registryPassword: '' // Empty string nếu không decrypt được
          },
          registryPassword: '' // Empty string nếu không decrypt được
        }
      };
    }
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