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
   * @param {Object} [deps.gitService] - GitService instance (optional)
   */
  constructor({ logger, jobService, jobController, queueService, gitService }) {
    this.logger = logger;
    this.jobService = jobService;
    this.jobController = jobController;
    this.queueService = queueService;
    this.gitService = gitService; // Lưu gitService để kiểm tra commit
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

        // Kiểm tra nếu job đang chạy thì không thêm vào queue để tránh spam
        if (this.jobService.isJobRunning(jobId)) {
          this.logger?.send(`[JOB-SCHEDULER] Job ${latestJob.name} (${jobId}) đang chạy, bỏ qua polling cycle này`);
          return;
        }

        let shouldRun = true;
        let hasNewCommit = false;
        let latestCommitHash = null;
        let latestBranchWithCommit = null;
        
        // Kiểm tra commit mới trước khi thêm vào queue - hỗ trợ multi-branch
        if (latestJob.gitConfig?.repoUrl && this.gitService) {
          try {
            // Tạo danh sách branches để kiểm tra (main branch + additional branches)
            const branchesToProcess = [];
            const gc = latestJob.gitConfig;
            
            // Thêm main branch nếu có
            if (gc.branch) {
              branchesToProcess.push(gc.branch);
            }
            
            // Thêm các branches từ mảng branches nếu có
            if (gc.branches && Array.isArray(gc.branches)) {
              for (const branchConfig of gc.branches) {
                if (branchConfig.enabled && branchConfig.name) {
                  branchesToProcess.push(branchConfig.name);
                }
              }
            }
            
            // Kiểm tra từng branch
            for (const branch of branchesToProcess) {
              try {
                // Luôn sử dụng repoPath chính từ cấp root cho tất cả các branch
                // Sử dụng phương thức mới hỗ trợ monolith condition
                const branchHasNewCommit = await this.gitService.checkNewCommitAndPullWithMonolith({
                  repoPath: gc.repoPath,
                  branch: branch,
                  repoUrl: gc.repoUrl,
                  token: gc.token,
                  provider: gc.provider,
                  monolith: latestJob.monolith,
                  monolithConfig: latestJob.monolithConfig || { module: '', changePath: [] },
                  doPull: false // Chỉ kiểm tra, không pull ngay
                });
                
                // Xử lý trường hợp thư mục repo không tồn tại
                if (branchHasNewCommit && branchHasNewCommit.error === 'repo_not_exists') {
                  this.logger?.send(`[JOB-SCHEDULER][WARN] Thư mục repo không tồn tại cho branch ${branch}, bỏ qua kiểm tra commit`);
                  continue; // Bỏ qua branch này nhưng tiếp tục kiểm tra các branch khác
                }
                
                // Xử lý trường hợp commit không tồn tại - dừng kiểm tra và không chạy job
                if (branchHasNewCommit && branchHasNewCommit.ok === false && branchHasNewCommit.error === 'commit_not_found') {
                  this.logger?.send(`[JOB-SCHEDULER][ERROR] Commit không tồn tại trên branch ${branch} cho job ${latestJob.name}, dừng polling`);
                  shouldRun = false;
                  break; // Dừng kiểm tra các branch khác
                }
                
                if (branchHasNewCommit && branchHasNewCommit.hasNew) {
                  hasNewCommit = true;
                  latestCommitHash = branchHasNewCommit.remoteHash; // Sửa: luôn lấy remoteHash
                  latestBranchWithCommit = branch;
                  this.logger?.send(`[JOB-SCHEDULER] Có commit mới trên branch ${branch} cho job ${latestJob.name}: ${latestCommitHash}`);
                  break; // Chỉ cần một branch có commit mới là đủ
                }
              } catch (branchError) {
                this.logger?.send(`[JOB-SCHEDULER][WARN] Lỗi kiểm tra commit trên branch ${branch}: ${branchError.message}`);
              }
            }
            
            if (!hasNewCommit) {
              this.logger?.send(`[JOB-SCHEDULER] Không có commit mới trên bất kỳ branch nào cho job ${latestJob.name}, bỏ qua polling cycle này`);
              shouldRun = false;
            }
          } catch (error) {
            this.logger?.send(`[JOB-SCHEDULER][WARN] Lỗi kiểm tra commit mới: ${error.message}, không chạy job`);
            shouldRun = false;
          }
        }
        
        // Kiểm tra xem commit có nên được build không (tránh rebuild commit đã thất bại) - hỗ trợ multi-branch
        if (shouldRun && latestJob.gitConfig?.repoUrl) {
          try {
            // Tạo danh sách branches để kiểm tra (main branch + additional branches)
            const branchesToProcess = [];
            const gc = latestJob.gitConfig;
            
            // Thêm main branch nếu có
            if (gc.branch) {
              branchesToProcess.push(gc.branch);
            }
            
            // Thêm các branches từ mảng branches nếu có
            if (gc.branches && Array.isArray(gc.branches)) {
              for (const branchConfig of gc.branches) {
                if (branchConfig.enabled && branchConfig.name) {
                  branchesToProcess.push(branchConfig.name);
                }
              }
            }
            
            let shouldBuildAnyBranch = false;
            
            // Kiểm tra từng branch - chỉ kiểm tra branch có commit mới
            if (hasNewCommit && latestBranchWithCommit && latestCommitHash) {
              try {
                const jobWithBranch = { 
                  ...latestJob, 
                  gitConfig: { ...gc, branch: latestBranchWithCommit },
                  repoPath: latestJob.repoPath // Đảm bảo repoPath được truyền đúng cách
                };
                const shouldBuildResult = await this.jobService.shouldBuildCommit(jobWithBranch.id, latestCommitHash);
                console.log('shouldBuildResult', shouldBuildResult);
                
                if (shouldBuildResult.shouldBuild) {
                  shouldBuildAnyBranch = true;
                  this.logger?.send(`[JOB-SCHEDULER] Commit ${shouldBuildResult.commitHash} trên branch ${latestBranchWithCommit} cần được build`);
                } else {
                  this.logger?.send(`[JOB-SCHEDULER] Commit ${shouldBuildResult.commitHash} trên branch ${latestBranchWithCommit} đã được build trước đó (status: ${shouldBuildResult.reason})`);
                }
              } catch (branchError) {
                this.logger?.send(`[JOB-SCHEDULER][WARN] Lỗi kiểm tra lịch sử build trên branch ${latestBranchWithCommit}: ${branchError.message}`);
              }
            } else {
              // Nếu không có commit mới, không cần kiểm tra build history
              shouldBuildAnyBranch = false;
            }
            
            if (!shouldBuildAnyBranch) {
              this.logger?.send(`[JOB-SCHEDULER] Tất cả commits trên các branches đã được build trước đó, bỏ qua polling cycle này`);
              shouldRun = false;
            }
          } catch (error) {
            this.logger?.send(`[JOB-SCHEDULER][WARN] Lỗi kiểm tra lịch sử build: ${error.message}, tiếp tục chạy job`);
            // Vẫn chạy job nếu có lỗi kiểm tra lịch sử
          }
        }
        
        if (!shouldRun) {
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
              triggerMethod: latestTriggerMethod,
              skipGitCheck: true, // Bỏ qua kiểm tra git khi job được trigger từ polling
              commitHash: latestCommitHash,
              branch: latestBranchWithCommit
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