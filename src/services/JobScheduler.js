/**
 * JobScheduler - Tự động chạy jobs theo lịch (polling)
 * Kiểm tra các jobs có autoCheck enabled và chạy theo chu kỳ polling
 * @class
 */
class JobScheduler {
  /**
   * Tạo JobScheduler instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.logger - Logger instance
   * @param {Object} deps.jobService - JobService instance
   * @param {Object} deps.jobController - JobController instance
   * @param {Object} deps.queueService - QueueService instance
   */
  constructor({ logger, jobService, jobController, queueService }) {
    this.logger = logger;
    this.jobService = jobService;
    this.jobController = jobController;
    this.queueService = queueService;
    this._timers = new Map();
    this._isRunning = false;
  }

  /**
   * Restart scheduler - dừng tất cả timers và khởi động lại cho enabled jobs
   * @returns {void}
   */
  restart() {
    // Stop all existing timers
    try {
      for (const [, t] of this._timers) {
        clearInterval(t);
      }
      this._timers.clear();
    } catch (_) {}

    const jobs = this.jobService.getAllJobs();
    // Chỉ poll jobs có trigger method là 'polling' hoặc 'hybrid' và có autoCheck enabled
    const enabledJobs = jobs.filter(j => {
      if (!j.enabled || !j.schedule || !j.schedule.autoCheck) return false;
      const triggerMethod = j.schedule.triggerMethod || 'polling';
      return triggerMethod === 'polling' || triggerMethod === 'hybrid';
    });

    if (enabledJobs.length === 0) {
      this.logger?.send('[JOB-SCHEDULER] Không có job nào bật polling autoCheck.');
      this._isRunning = false;
      return;
    }

    this._isRunning = true;
    for (const job of enabledJobs) {
      this.startJobTimer(job);
    }

    this.logger?.send(`[JOB-SCHEDULER] Đã khởi động polling cho ${enabledJobs.length} job (triggerMethod: polling/hybrid).`);
  }

  /**
   * Khởi động timer cho một job cụ thể
   * @param {Object} job - Job object
   * @param {string} job.id - Job ID
   * @param {string} job.name - Job name
   * @param {Object} job.schedule - Schedule config
   * @param {boolean} job.schedule.autoCheck - AutoCheck enabled
   * @param {number} job.schedule.polling - Polling interval (seconds)
   * @returns {void}
   */
  startJobTimer(job) {
    const pollingSec = Math.max(5, Number(job.schedule?.polling || 30));
    const jobId = job.id;
    const triggerMethod = job.schedule?.triggerMethod || 'polling';

    // Clear old timer if exists
    const old = this._timers.get(jobId);
    if (old) {
      try { clearInterval(old); } catch (_) {}
      this._timers.delete(jobId);
    }

    const intervalId = setInterval(async () => {
      try {
        // Fetch latest job definition each tick to respect updates
        const latestJob = this.jobService.getJobById(jobId);
        // If job has been deleted, stop timer
        if (!latestJob) {
          this.logger?.send?.(`[JOB-SCHEDULER] Job ${job.name} (${jobId}) đã bị xoá. Dừng timer.`);
          clearInterval(intervalId);
          this._timers.delete(jobId);
          return;
        }

        // Check if job still accepts polling
        const latestTriggerMethod = latestJob.schedule?.triggerMethod || 'polling';
        if (latestTriggerMethod === 'webhook') {
          this.logger?.send(`[JOB-SCHEDULER] Job ${latestJob.name} (${jobId}) đã chuyển sang webhook-only, dừng polling.`);
          clearInterval(intervalId);
          this._timers.delete(jobId);
          return;
        }

        if (!latestJob.enabled || !latestJob.schedule?.autoCheck) {
          this.logger?.send(`[JOB-SCHEDULER] Job ${latestJob.name} (${jobId}) đã tắt autoCheck, dừng timer.`);
          clearInterval(intervalId);
          this._timers.delete(jobId);
          return;
        }

        this.logger?.send(`[JOB-SCHEDULER] 🔁 Thêm job vào hàng đợi (polling): ${latestJob.name} (mỗi ${pollingSec}s)`);
        try {
          this.queueService?.addJob({
            jobId: jobId,
            name: latestJob.name,
            priority: 'medium',
            estimatedTime: 300000,
            maxRetries: 1,
            metadata: {
              source: 'polling',
              triggerMethod: latestTriggerMethod
            }
          });
        } catch (e) {
          // Nếu không có queueService, fallback chạy trực tiếp (không khuyến nghị)
          this.logger?.send(`[JOB-SCHEDULER][WARN] QueueService không sẵn sàng, chạy trực tiếp.`);
          const buildResult = await this.jobController.executeJobBuild(latestJob);
          this.jobService.updateJobStats(jobId, buildResult);
        }
      } catch (e) {
        this.logger?.send(`[JOB-SCHEDULER][ERROR] Khi chạy job ${job.name}: ${e.message}`);
      }
    }, pollingSec * 1000);

    this._timers.set(jobId, intervalId);
    this.logger?.send(`[JOB-SCHEDULER] ⏱️ Job ${job.name} (${triggerMethod}) sẽ poll mỗi ${pollingSec}s`);
  }

  /**
   * Dừng scheduler - clear tất cả timers
   * @returns {void}
   */
  stop() {
    for (const [, t] of this._timers) {
      try { clearInterval(t); } catch (_) {}
    }
    this._timers.clear();
    this._isRunning = false;
    this.logger?.send('[JOB-SCHEDULER] Đã dừng Job Scheduler.');
  }

  /**
   * Kiểm tra scheduler có đang chạy không
   * @returns {boolean} True nếu đang chạy
   */
  isRunning() { return this._isRunning; }
}

module.exports = { JobScheduler };