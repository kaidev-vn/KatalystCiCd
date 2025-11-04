const { QueueService } = require('../services/QueueService');

/**
 * QueueController - API endpoints cho quản lý queue system
 */
class QueueController {
  constructor({ logger, buildService, jobService, jobController }) {
    this.logger = logger;
    this.buildService = buildService;
    this.jobService = jobService;
    this.jobController = jobController;
    
    // Khởi tạo QueueService với cấu hình tối ưu cho máy yếu
    this.queueService = new QueueService({
      logger: this.logger,
      maxConcurrentJobs: 1, // Chỉ chạy 1 job đồng thời cho máy yếu
      resourceThreshold: 70  // Dừng khi CPU/Memory > 70%
    });

    // Inject job executor
    this.queueService.setJobExecutor(this.executeJob.bind(this));
    
    // Lắng nghe events từ queue
    this.setupQueueEventListeners();
  }

  /**
   * Thiết lập event listeners cho queue
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
   * Thực thi job logic
   */
  async executeJob(queueJob) {
    try {
      // Lấy thông tin job từ JobService
      const job = await this.jobService.getJobById(queueJob.jobId);
      if (!job) {
        throw new Error(`Job ${queueJob.jobId} không tồn tại`);
      }

      // Uỷ quyền cho JobController để tránh trùng lặp và đảm bảo kiểm tra commit mới
      const buildResult = await this.jobController.executeJobBuild(job);
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
   * Thực hiện build cho job
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
   * Build một service đơn lẻ
   */
  async buildSingleService(job, service) {
    // Deprecated: logic moved to JobController.executeJobBuild
    return await this.jobController.executeJobBuild(job);
  }

  /**
   * Build Docker image (placeholder - cần inject DockerService)
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
   * API: Thêm job vào queue
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
   * API: Lấy trạng thái queue
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
   * API: Lấy thống kê queue
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
   * API: Hủy job trong queue
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
   * API: Cập nhật cấu hình queue
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
   * API: Dừng/Khởi động queue processing
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
   * API: Chạy job ngay lập tức (bypass queue)
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