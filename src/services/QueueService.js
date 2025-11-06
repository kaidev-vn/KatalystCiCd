const EventEmitter = require('events');

/**
 * QueueService - Quản lý hàng đợi build jobs để tối ưu hóa tài nguyên
 * Hỗ trợ:
 * - Giới hạn số job chạy đồng thời
 * - Ưu tiên job theo priority (high/medium/low)
 * - Resource monitoring (CPU/Memory)
 * - Sequential/Parallel build modes
 * - Auto retry cho failed jobs
 * @class
 * @extends EventEmitter
 * @fires QueueService#jobQueued
 * @fires QueueService#jobStarted
 * @fires QueueService#jobCompleted
 * @fires QueueService#jobFailed
 * @fires QueueService#jobRetry
 */
class QueueService extends EventEmitter {
  /**
   * Tạo QueueService instance
   * @constructor
   * @param {Object} options - Configuration options
   * @param {Object} options.logger - Logger instance
   * @param {number} [options.maxConcurrentJobs=2] - Số job tối đa chạy đồng thời
   * @param {number} [options.resourceThreshold=80] - Ngưỡng tài nguyên CPU/Memory (%)
   */
  constructor({ logger, maxConcurrentJobs = 2, resourceThreshold = 80 }) {
    super();
    this.logger = logger;
    this.maxConcurrentJobs = maxConcurrentJobs;
    this.resourceThreshold = resourceThreshold; // CPU/Memory threshold %
    
    this.queue = []; // Hàng đợi jobs
    this.runningJobs = new Map(); // Jobs đang chạy
    this.completedJobs = []; // Jobs đã hoàn thành
    this.failedJobs = []; // Jobs thất bại
    
    this.isProcessing = false;
    this.stats = {
      totalQueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      averageExecutionTime: 0
    };
    
    // Bắt đầu xử lý queue
    this.startProcessing();
  }

  /**
   * Thêm job vào hàng đợi theo priority
   * @param {Object} job - Job object
   * @param {string} [job.id] - Job ID (auto-generated nếu không có)
   * @param {string} job.name - Tên job
   * @param {string} [job.priority='medium'] - Priority: 'high', 'medium', hoặc 'low'
   * @param {number} [job.maxRetries=3] - Số lần retry tối đa khi failed
   * @returns {string} Queue job ID
   * @fires QueueService#jobQueued
   */
  addJob(job) {
    const queuedJob = {
      id: job.id || this.generateJobId(),
      ...job,
      priority: job.priority || 'medium',
      queuedAt: new Date(),
      status: 'queued',
      retryCount: 0,
      maxRetries: job.maxRetries || 3
    };

    // Thêm vào queue theo priority
    this.insertByPriority(queuedJob);
    this.stats.totalQueued++;
    
    this.logger?.send(`[QUEUE] Job ${queuedJob.id} đã được thêm vào hàng đợi (Priority: ${queuedJob.priority})`);
    this.emit('jobQueued', queuedJob);
    
    return queuedJob.id;
  }

  /**
   * Chèn job vào queue theo thứ tự priority
   * Priority order: high (3) > medium (2) > low (1)
   * @private
   * @param {Object} job - Job object với priority
   * @returns {void}
   */
  insertByPriority(job) {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const jobPriority = priorityOrder[job.priority] || 2;
    
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const queuePriority = priorityOrder[this.queue[i].priority] || 2;
      if (jobPriority > queuePriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, job);
  }

  /**
   * Bắt đầu xử lý queue (kiểm tra mỗi 5 giây)
   * @returns {void}
   */
  startProcessing() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processQueue();
    
    // Kiểm tra queue mỗi 5 giây
    this.queueInterval = setInterval(() => {
      this.processQueue();
    }, 5000);
  }

  /**
   * Dừng xử lý queue
   * @returns {void}
   */
  stopProcessing() {
    this.isProcessing = false;
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
  }

  /**
   * Xử lý queue - lấy job tiếp theo và thực thi
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async processQueue() {
    if (!this.isProcessing || this.queue.length === 0) return;
    
    // Kiểm tra tài nguyên hệ thống
    const systemLoad = await this.checkSystemLoad();
    if (systemLoad > this.resourceThreshold) {
      this.logger?.send(`[QUEUE] Tài nguyên hệ thống cao (${systemLoad}%), tạm dừng xử lý queue`);
      return;
    }

    // Kiểm tra số job đang chạy
    if (this.runningJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    // Lấy job tiếp theo từ queue
    const job = this.queue.shift();
    if (!job) return;

    // Bắt đầu chạy job
    await this.executeJob(job);
  }

  /**
   * Thực thi job
   * @async
   * @private
   * @param {Object} job - Queue job object
   * @fires QueueService#jobStarted
   * @fires QueueService#jobCompleted
   * @fires QueueService#jobFailed
   * @fires QueueService#jobRetry
   * @returns {Promise<void>}
   */
  async executeJob(job) {
    job.status = 'running';
    job.startedAt = new Date();
    this.runningJobs.set(job.id, job);
    
    // Đánh dấu job đang chạy trong JobService để tạm dừng polling
    if (this.jobService && job.jobId) {
      this.jobService.markJobAsRunning(job.jobId);
    }
    
    this.logger?.send(`[QUEUE] Bắt đầu thực thi job ${job.id}`);
    this.emit('jobStarted', job);

    try {
      // Thực thi job (gọi buildService hoặc service tương ứng)
      const result = await this.runJobLogic(job);
      
      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;
      job.executionTime = job.completedAt - job.startedAt;
      
      this.runningJobs.delete(job.id);
      this.completedJobs.push(job);
      this.stats.totalCompleted++;
      this.updateAverageExecutionTime();
      
      // Đánh dấu job đã hoàn thành trong JobService để resume polling
      if (this.jobService && job.jobId) {
        this.jobService.markJobAsCompleted(job.jobId);
      }
      
      this.logger?.send(`[QUEUE] Job ${job.id} hoàn thành thành công (${job.executionTime}ms)`);
      this.emit('jobCompleted', job);
      
    } catch (error) {
      job.status = 'failed';
      job.failedAt = new Date();
      job.error = error.message;
      job.retryCount++;
      
      this.runningJobs.delete(job.id);
      
      // Retry logic
      if (job.retryCount < job.maxRetries) {
        job.status = 'queued';
        this.insertByPriority(job);
        this.logger?.send(`[QUEUE] Job ${job.id} thất bại, thử lại lần ${job.retryCount}/${job.maxRetries}`);
        this.emit('jobRetry', job);
      } else {
        this.failedJobs.push(job);
        this.stats.totalFailed++;
        this.logger?.send(`[QUEUE] Job ${job.id} thất bại hoàn toàn: ${error.message}`);
        this.emit('jobFailed', job);
      }
    }

    // Tiếp tục xử lý queue
    setTimeout(() => this.processQueue(), 1000);
  }

  /**
   * Logic thực thi job (sẽ được override hoặc inject)
   */
  async runJobLogic(job) {
    // Placeholder - sẽ được inject buildService hoặc service khác
    if (this.jobExecutor) {
      return await this.jobExecutor(job);
    }
    
    // Mô phỏng thời gian thực thi
    await new Promise(resolve => setTimeout(resolve, job.estimatedTime || 5000));
    return { success: true, message: 'Job completed successfully' };
  }

  /**
   * Inject job executor
   */
  setJobExecutor(executor) {
    this.jobExecutor = executor;
  }

  /**
   * Kiểm tra tải hệ thống
   */
  async checkSystemLoad() {
    try {
      const os = require('os');
      const cpuUsage = await this.getCPUUsage();
      const memUsage = (1 - (os.freemem() / os.totalmem())) * 100;
      
      return Math.max(cpuUsage, memUsage);
    } catch (error) {
      return 0; // Nếu không thể kiểm tra, cho phép tiếp tục
    }
  }

  /**
   * Lấy CPU usage
   */
  getCPUUsage() {
    return new Promise((resolve) => {
      const os = require('os');
      const cpus = os.cpus();
      
      let totalIdle = 0;
      let totalTick = 0;
      
      cpus.forEach(cpu => {
        for (let type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });
      
      setTimeout(() => {
        let totalIdle2 = 0;
        let totalTick2 = 0;
        
        const cpus2 = os.cpus();
        cpus2.forEach(cpu => {
          for (let type in cpu.times) {
            totalTick2 += cpu.times[type];
          }
          totalIdle2 += cpu.times.idle;
        });
        
        const idle = totalIdle2 - totalIdle;
        const total = totalTick2 - totalTick;
        const usage = 100 - ~~(100 * idle / total);
        
        resolve(usage);
      }, 1000);
    });
  }

  /**
   * Cập nhật thời gian thực thi trung bình
   */
  updateAverageExecutionTime() {
    if (this.completedJobs.length === 0) return;
    
    const totalTime = this.completedJobs.reduce((sum, job) => sum + (job.executionTime || 0), 0);
    this.stats.averageExecutionTime = Math.round(totalTime / this.completedJobs.length);
  }

  /**
   * Lấy thống kê queue
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      runningJobs: this.runningJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      resourceThreshold: this.resourceThreshold
    };
  }

  /**
   * Lấy trạng thái queue
   */
  getQueueStatus() {
    return {
      queue: this.queue.map(job => ({
        id: job.id,
        name: job.name,
        priority: job.priority,
        status: job.status,
        queuedAt: job.queuedAt
      })),
      running: Array.from(this.runningJobs.values()).map(job => ({
        id: job.id,
        name: job.name,
        status: job.status,
        startedAt: job.startedAt,
        progress: job.progress || 0
      })),
      completed: this.completedJobs.slice(-10), // 10 jobs gần nhất
      failed: this.failedJobs.slice(-10)
    };
  }

  /**
   * Hủy job
   */
  cancelJob(jobId) {
    // Xóa khỏi queue
    const queueIndex = this.queue.findIndex(job => job.id === jobId);
    if (queueIndex !== -1) {
      const job = this.queue.splice(queueIndex, 1)[0];
      job.status = 'cancelled';
      this.emit('jobCancelled', job);
      return true;
    }

    // Hủy job đang chạy (cần implement logic hủy cụ thể)
    if (this.runningJobs.has(jobId)) {
      const job = this.runningJobs.get(jobId);
      job.status = 'cancelled';
      this.runningJobs.delete(jobId);
      this.emit('jobCancelled', job);
      return true;
    }

    return false;
  }

  /**
   * Tạo job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cập nhật cấu hình
   */
  updateConfig({ maxConcurrentJobs, resourceThreshold }) {
    if (maxConcurrentJobs !== undefined) {
      this.maxConcurrentJobs = maxConcurrentJobs;
    }
    if (resourceThreshold !== undefined) {
      this.resourceThreshold = resourceThreshold;
    }
    
    this.logger?.send(`[QUEUE] Cập nhật cấu hình: maxConcurrentJobs=${this.maxConcurrentJobs}, resourceThreshold=${this.resourceThreshold}%`);
  }
}

module.exports = { QueueService };