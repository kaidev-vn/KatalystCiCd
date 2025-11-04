class JobScheduler {
  constructor({ logger, jobService, jobController }) {
    this.logger = logger;
    this.jobService = jobService;
    this.jobController = jobController;
    this._timers = new Map();
    this._isRunning = false;
  }

  restart() {
    // Stop all existing timers
    try {
      for (const [, t] of this._timers) {
        clearInterval(t);
      }
      this._timers.clear();
    } catch (_) {}

    const jobs = this.jobService.getAllJobs();
    const enabledJobs = jobs.filter(j => j.enabled && j.schedule && j.schedule.autoCheck);

    if (enabledJobs.length === 0) {
      this.logger?.send('[JOB-SCHEDULER] Không có job nào bật autoCheck.');
      this._isRunning = false;
      return;
    }

    this._isRunning = true;
    for (const job of enabledJobs) {
      this.startJobTimer(job);
    }

    this.logger?.send(`[JOB-SCHEDULER] Đã khởi động cho ${enabledJobs.length} job có autoCheck.`);
  }

  startJobTimer(job) {
    const pollingSec = Math.max(5, Number(job.schedule?.polling || 30));
    const jobId = job.id;

    // Clear old timer if exists
    const old = this._timers.get(jobId);
    if (old) {
      try { clearInterval(old); } catch (_) {}
      this._timers.delete(jobId);
    }

    const intervalId = setInterval(async () => {
      try {
        // Fetch latest job definition each tick to respect updates
        const latestJob = this.jobService.getJobById(jobId) || job;
        if (!latestJob.enabled || !latestJob.schedule?.autoCheck) {
          this.logger?.send(`[JOB-SCHEDULER] Job ${latestJob.name} (${jobId}) đã tắt autoCheck, dừng timer.`);
          clearInterval(intervalId);
          this._timers.delete(jobId);
          return;
        }

        this.logger?.send(`[JOB-SCHEDULER] 🔁 Tự động chạy job: ${latestJob.name} (mỗi ${pollingSec}s)`);
        const buildResult = await this.jobController.executeJobBuild(latestJob);
        // Cập nhật thống kê
        this.jobService.updateJobStats(jobId, buildResult);
      } catch (e) {
        this.logger?.send(`[JOB-SCHEDULER][ERROR] Khi chạy job ${job.name}: ${e.message}`);
      }
    }, pollingSec * 1000);

    this._timers.set(jobId, intervalId);
    this.logger?.send(`[JOB-SCHEDULER] ⏱️ Job ${job.name} sẽ tự chạy mỗi ${pollingSec}s`);
  }

  stop() {
    for (const [, t] of this._timers) {
      try { clearInterval(t); } catch (_) {}
    }
    this._timers.clear();
    this._isRunning = false;
    this.logger?.send('[JOB-SCHEDULER] Đã dừng Job Scheduler.');
  }

  isRunning() { return this._isRunning; }
}

module.exports = { JobScheduler };