const { QueueService } = require('../services/QueueService');

/**
 * QueueController - API endpoints cho quản lý queue system
 * Quản lý hàng đợi build jobs, giới hạn concurrent builds, và resource monitoring
 * @class
 */
class QueueController {
  /**
   * Tạo QueueController instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.logger - Logger instance để log events
   * @param {Object} deps.buildService - Service quản lý build operations
   * @param {Object} deps.jobService - Service quản lý jobs
   * @param {Object} deps.jobController - Controller xử lý job execution
   * @param {Object} deps.configService - ConfigService instance
   */
  constructor({ logger, buildService, jobService, jobController, configService }) {
    this.logger = logger;
    this.buildService = buildService;
    this.jobService = jobService;
    this.jobController = jobController;
    this.configService = configService;
    
    // Khởi tạo QueueService với cấu hình từ config.json
    this.queueService = new QueueService({
      logger: this.logger,
      configService: this.configService // Truyền configService để lấy cấu hình từ config.json
    });

    // Inject job executor
    this.queueService.setJobExecutor(this.executeJob.bind(this));
    
    // Lắng nghe events từ queue
    this.setupQueueEventListeners();
  }

  /**
   * Thiết lập event listeners cho queue để log các sự kiện
   * @private
   * @returns {void}
   */
  setupQueueEventListeners() {
    this.queueService.on('jobStarted', (job) => {
      this.logger?.send(`[QUEUE] Job ${job.name} bắt đầu thực thi`);
    });

    this.queueService.on('jobCompleted', (job) => {
      this.logger?.send(`[QUEUE] Job ${job.name} hoàn thành thành công`);
    });

    this.queueService.on('jobFailed', (job) => {
      this.logger?.send(`[QUEUE] Job ${job.name} thất bại: ${job.error}`);
    });

    this.queueService.on('jobRetry', (job) => {
      this.logger?.send(`[QUEUE] Job ${job.name} đang thử lại (${job.retryCount}/${job.maxRetries})`);
    });
  }

  /**
   * Thực thi job logic - lấy job từ JobService và chạy build
   * @async
   * @param {Object} queueJob - Queue job object
   * @param {string} queueJob.jobId - ID của job cần thực thi
   * @param {string} queueJob.name - Tên của job
   * @returns {Promise<Object>} Kết quả execution
   * @returns {boolean} return.success - True nếu thành công
   * @returns {string} return.jobId - ID của job đã thực thi
   * @returns {Object} return.buildResult - Chi tiết kết quả build
   * @returns {string} return.message - Thông báo kết quả
   * @throws {Error} Nếu job không tồn tại hoặc execution failed
   */
  async executeJob(queueJob) {
    try {
      // Lấy thông tin job từ JobService
      const job = await this.jobService.getJobById(queueJob.jobId);
      if (!job) {
        throw new Error(`Job ${queueJob.jobId} không tồn tại`);
      }

      // Uỷ quyền cho JobController để tránh trùng lặp và đảm bảo kiểm tra commit mới
      const buildResult = await this.jobController.executeJobBuild(job, queueJob.metadata);
      // Cập nhật thống kê job sau khi hoàn thành
      try { this.jobService.updateJobStats(queueJob.jobId, buildResult); } catch (_) {}
      
      return {
        success: true,
        jobId: job.id,
        buildResult: buildResult,
        message: 'Job executed successfully'
      };
    } catch (error) {
      throw new Error(`Job execution failed: ${error.message}`);
    }
  }

  /**
   * Thực hiện build cho job (deprecated - kept for backward compatibility)
   * @deprecated Sử dụng jobController.executeJobBuild() thay thế
   * @async
   * @param {Object} job - Job object
   * @param {Object} queueJob - Queue job object
   * @returns {Promise<Array>} Danh sách kết quả build
   */
  async runJobBuild(job, queueJob) {
    // Delegate to jobController for unified logic (kept for backward compatibility)
    return await this.jobController.executeJobBuild(job);
    
    // Build theo thứ tự (sequential) hoặc song song (parallel)
    if (job.buildConfig.buildOrder === 'sequential') {
      // Build tuần tự từng service
      for (const service of job.services) {
        this.logger?.send(`[BUILD] Building service: ${service.name}`);
        const result = await this.buildSingleService(job, service);
        results.push(result);
        
        // Cập nhật progress
        const progress = Math.round((results.length / job.services.length) * 100);
        queueJob.progress = progress;
      }
    } else {
      // Build song song (chỉ khi máy đủ mạnh)
      const buildPromises = job.services.map(service => 
        this.buildSingleService(job, service)
      );
      const parallelResults = await Promise.allSettled(buildPromises);
      
      parallelResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            service: job.services[index].name,
            success: false,
            error: result.reason.message
          });
        }
      });
    }

    return results;
  }

  /**
   * Build một service đơn lẻ (deprecated)
   * @deprecated Logic đã chuyển sang JobController.executeJobBuild
   * @async
   * @param {Object} job - Job object
   * @param {Object} service - Service object
   * @returns {Promise<Object>} Kết quả build
   */
  async buildSingleService(job, service) {
    // Deprecated: logic moved to JobController.executeJobBuild
    return await this.jobController.executeJobBuild(job);
  }

  /**
   * Build Docker image (placeholder)
   * @async
   * @param {Object} config - Docker build configuration
   * @param {string} config.imageName - Tên Docker image
   * @param {string} config.tag - Tag của image
   * @returns {Promise<Object>} Kết quả build
   */
  async buildDockerImage(config) {
    // Placeholder - sẽ được thay thế bằng DockerService thực tế
    return {
      imageName: config.imageName,
      tag: config.tag,
      built: true
    };
  }

  /**
   * API Endpoint: Thêm job vào queue
   * POST /api/queue/add
   * @async
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.jobId - ID của job cần thêm vào queue
   * @param {string} [req.body.priority='medium'] - Priority (high/medium/low)
   * @param {number} [req.body.estimatedTime] - Thời gian ước tính (ms)
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   * @example
   * POST /api/queue/add
   * Body: { "jobId": "abc-123", "priority": "high", "estimatedTime": 300000 }
   */
  async addJobToQueue(req, res) {
    try {
      const { jobId, priority = 'medium', estimatedTime } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
      }

      // Kiểm tra job tồn tại
      const job = await this.jobService.getJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Kiểm tra commit mới trước khi thêm vào queue
      const shouldCheckCommit = job.gitConfig?.repoUrl && job.gitConfig?.branch;
      if (shouldCheckCommit) {
        try {
          // Lấy commit hash hiện tại từ repository
          const currentCommitHash = await this.jobController.getCurrentCommitHash(job);
          
          if (currentCommitHash) {
            // Kiểm tra xem commit này đã được build thành công chưa
            const shouldBuildResult = this.jobService.shouldBuildCommit(jobId, currentCommitHash);
            
            if (!shouldBuildResult.shouldBuild) {
              this.logger?.send(`[QUEUE] Job ${job.name} skipped - commit ${currentCommitHash} already built successfully: ${shouldBuildResult.reason}`);
              return res.json({
                success: true,
                skipped: true,
                message: `Job skipped - commit ${currentCommitHash.substring(0, 8)} already built successfully`,
                reason: shouldBuildResult.reason
              });
            }
            
            this.logger?.send(`[QUEUE] Job ${job.name} will build new commit: ${currentCommitHash.substring(0, 8)}`);
          }
        } catch (error) {
          // Nếu có lỗi khi kiểm tra commit, vẫn tiếp tục thêm vào queue nhưng log cảnh báo
          this.logger?.send(`[QUEUE][WARN] Commit check failed for job ${job.name}: ${error.message}. Adding to queue anyway.`);
        }
      }

      // Thêm vào queue
      const queueJobId = this.queueService.addJob({
        jobId: jobId,
        name: job.name,
        priority: priority,
        estimatedTime: estimatedTime || 300000, // 5 phút mặc định
        maxRetries: 2
      });

      res.json({
        success: true,
        queueJobId: queueJobId,
        message: 'Job added to queue successfully'
      });
    } catch (error) {
      this.logger?.send(`[QUEUE][ERROR] Add job to queue failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * API Endpoint: Lấy trạng thái queue
   * GET /api/queue/status
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   * @example
   * GET /api/queue/status
   * Response: { "success": true, "status": {...}, "stats": {...} }
   */
  async getQueueStatus(req, res) {
    try {
      const status = this.queueService.getQueueStatus();
      const stats = this.queueService.getStats();
      
      res.json({
        success: true,
        status: status,
        stats: stats
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * API Endpoint: Lấy thống kê queue
   * GET /api/queue/stats
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async getQueueStats(req, res) {
    try {
      const stats = this.queueService.getStats();
      res.json({ success: true, stats: stats });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * API Endpoint: Hủy job trong queue
   * DELETE /api/queue/:jobId
   * @async
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.jobId - ID của job cần hủy
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async cancelJob(req, res) {
    try {
      const { jobId } = req.params;
      const cancelled = this.queueService.cancelJob(jobId);
      
      if (cancelled) {
        res.json({ success: true, message: 'Job cancelled successfully' });
      } else {
        res.status(404).json({ error: 'Job not found in queue' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * API Endpoint: Cập nhật cấu hình queue
   * PUT /api/queue/config
   * @async
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {number} [req.body.maxConcurrentJobs] - Số job tối đa chạy đồng thời
   * @param {number} [req.body.resourceThreshold] - Ngưỡng tài nguyên (%)
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async updateQueueConfig(req, res) {
    try {
      const { maxConcurrentJobs, resourceThreshold } = req.body;
      
      this.queueService.updateConfig({
        maxConcurrentJobs: maxConcurrentJobs,
        resourceThreshold: resourceThreshold
      });

      res.json({
        success: true,
        message: 'Queue configuration updated successfully'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * API Endpoint: Dừng/Khởi động queue processing
   * POST /api/queue/toggle
   * @async
   * @param {Object} req - Express request object
   * @param {Object} req.body - Request body
   * @param {string} req.body.action - Action cần thực hiện ('start' hoặc 'stop')
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async toggleQueueProcessing(req, res) {
    try {
      const { action } = req.body; // 'start' hoặc 'stop'
      
      if (action === 'start') {
        this.queueService.startProcessing();
        res.json({ success: true, message: 'Queue processing started' });
      } else if (action === 'stop') {
        this.queueService.stopProcessing();
        res.json({ success: true, message: 'Queue processing stopped' });
      } else {
        res.status(400).json({ error: 'Invalid action. Use "start" or "stop"' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * API Endpoint: Chạy job ngay lập tức (bypass queue)
   * POST /api/jobs/:jobId/run-immediate
   * @async
   * @param {Object} req - Express request object
   * @param {Object} req.params - URL parameters
   * @param {string} req.params.jobId - ID của job cần chạy
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  async runJobImmediate(req, res) {
    try {
      const { jobId } = req.params;
      
      // Lấy thông tin job
      const job = await this.jobService.getJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Thực thi ngay lập tức
      const queueJob = {
        jobId: jobId,
        name: job.name,
        progress: 0
      };

      const result = await this.executeJob(queueJob);
      
      res.json({
        success: true,
        result: result,
        message: 'Job executed immediately'
      });
    } catch (error) {
      this.logger?.send(`[QUEUE][ERROR] Immediate job execution failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = QueueController;