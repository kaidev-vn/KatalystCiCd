const crypto = require('crypto');

/**
 * WebhookService - Xử lý webhooks từ Git providers (GitLab/GitHub)
 * Thay thế polling bằng event-driven approach để tiết kiệm tài nguyên
 * @class
 */
class WebhookService {
  /**
   * Tạo WebhookService instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.logger - Logger instance
   * @param {Object} deps.gitService - GitService instance
   * @param {Object} deps.jobService - JobService instance
   * @param {Object} deps.queueService - QueueService instance
   * @param {Object} deps.configService - ConfigService instance
   */
  constructor({ logger, gitService, jobService, queueService, configService }) {
    this.logger = logger;
    this.gitService = gitService;
    this.jobService = jobService;
    this.queueService = queueService;
    this.configService = configService;
    
    // Cache để tránh duplicate builds cho cùng commit
    this.processedCommits = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 phút
  }

  /**
   * Verify webhook signature từ GitLab
   * @param {string} payload - Request body (string)
   * @param {string} signature - X-Gitlab-Token header
   * @param {string} secret - Secret token
   * @returns {boolean} True nếu signature hợp lệ
   */
  verifyGitLabSignature(payload, signature, secret) {
    if (!secret) return true; // Skip verification nếu không có secret
    return signature === secret;
  }

  /**
   * Verify webhook signature từ GitHub
   * @param {string} payload - Request body (string)
   * @param {string} signature - X-Hub-Signature-256 header
   * @param {string} secret - Secret token
   * @returns {boolean} True nếu signature hợp lệ
   */
  verifyGitHubSignature(payload, signature, secret) {
    if (!secret || !signature) return false;
    
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    // Timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  /**
   * Xử lý GitLab push webhook
   * @async
   * @param {Object} payload - GitLab webhook payload
   * @param {string} signature - Webhook signature
   * @param {string} secret - Secret token
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleGitLabPush(payload, signature, secret) {
    // Verify signature
    if (!this.verifyGitLabSignature(JSON.stringify(payload), signature, secret)) {
      throw new Error('Invalid webhook signature');
    }

    const {
      ref,
      after: commitHash,
      repository,
      commits = [],
      user_name: userName
    } = payload;

    // Parse branch name (ref = "refs/heads/main" -> branch = "main")
    const branch = ref?.replace('refs/heads/', '') || 'main';
    const repoUrl = repository?.git_http_url || repository?.url;

    this.logger?.send(`[WEBHOOK][GITLAB] 📬 Nhận push event: ${branch} - ${commitHash?.slice(0, 7)}`);
    this.logger?.send(`[WEBHOOK][GITLAB] 👤 User: ${userName}, Commits: ${commits.length}`);

    // Kiểm tra duplicate
    if (this.isCommitProcessed(repoUrl, commitHash)) {
      this.logger?.send(`[WEBHOOK][GITLAB] ⏭️ Commit ${commitHash?.slice(0, 7)} đã được xử lý, bỏ qua`);
      return { success: true, skipped: true, reason: 'duplicate' };
    }

    // Tìm jobs matching với repo này
    const matchingJobs = await this.findMatchingJobs(repoUrl, branch);

    if (matchingJobs.length === 0) {
      this.logger?.send(`[WEBHOOK][GITLAB] ⚠️ Không tìm thấy job nào match với repo: ${repoUrl}, branch: ${branch}`);
      return { success: false, reason: 'no_matching_jobs' };
    }

    // Mark commit as processed
    this.markCommitProcessed(repoUrl, commitHash);

    // Trigger builds cho tất cả matching jobs
    const results = await this.triggerBuilds(matchingJobs, { branch, commitHash, userName });

    return {
      success: true,
      triggeredJobs: results.length,
      results
    };
  }

  /**
   * Xử lý GitHub push webhook
   * @async
   * @param {Object} payload - GitHub webhook payload
   * @param {string} signature - X-Hub-Signature-256 header
   * @param {string} secret - Secret token
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleGitHubPush(payload, signature, secret) {
    // Verify signature
    if (!this.verifyGitHubSignature(JSON.stringify(payload), signature, secret)) {
      throw new Error('Invalid webhook signature');
    }

    const {
      ref,
      after: commitHash,
      repository,
      commits = [],
      pusher
    } = payload;

    const branch = ref?.replace('refs/heads/', '') || 'main';
    const repoUrl = repository?.clone_url || repository?.url;
    const userName = pusher?.name || pusher?.email;

    this.logger?.send(`[WEBHOOK][GITHUB] 📬 Nhận push event: ${branch} - ${commitHash?.slice(0, 7)}`);
    this.logger?.send(`[WEBHOOK][GITHUB] 👤 User: ${userName}, Commits: ${commits.length}`);

    // Kiểm tra duplicate
    if (this.isCommitProcessed(repoUrl, commitHash)) {
      this.logger?.send(`[WEBHOOK][GITHUB] ⏭️ Commit ${commitHash?.slice(0, 7)} đã được xử lý, bỏ qua`);
      return { success: true, skipped: true, reason: 'duplicate' };
    }

    // Tìm jobs matching
    const matchingJobs = await this.findMatchingJobs(repoUrl, branch);

    if (matchingJobs.length === 0) {
      this.logger?.send(`[WEBHOOK][GITHUB] ⚠️ Không tìm thấy job nào match với repo: ${repoUrl}, branch: ${branch}`);
      return { success: false, reason: 'no_matching_jobs' };
    }

    // Mark commit as processed
    this.markCommitProcessed(repoUrl, commitHash);

    // Trigger builds
    const results = await this.triggerBuilds(matchingJobs, { branch, commitHash, userName });

    return {
      success: true,
      triggeredJobs: results.length,
      results
    };
  }

  /**
   * Tìm jobs match với repository URL và branch
   * @async
   * @param {string} repoUrl - Repository URL
   * @param {string} branch - Branch name
   * @returns {Promise<Array<Object>>} Danh sách matching jobs
   */
  async findMatchingJobs(repoUrl, branch) {
    const allJobs = this.jobService.getAllJobs();
    const normalizedRepoUrl = this.normalizeRepoUrl(repoUrl);

    return allJobs.filter(job => {
      if (!job.enabled) return false;

      // Check if job accepts webhooks (triggerMethod: 'webhook' hoặc 'hybrid')
      const triggerMethod = job.schedule?.triggerMethod || 'polling';
      if (triggerMethod === 'polling') {
        this.logger?.send(`[WEBHOOK] Job ${job.name} chỉ dùng polling, skip webhook trigger`);
        return false; // Job này chỉ dùng polling, không accept webhook
      }

      const jobRepoUrl = this.normalizeRepoUrl(job.gitConfig?.repoUrl || '');
      const jobBranch = job.gitConfig?.branch || 'main';

      return jobRepoUrl === normalizedRepoUrl && jobBranch === branch;
    });
  }

  /**
   * Normalize repository URL để so sánh
   * @param {string} url - Repository URL
   * @returns {string} Normalized URL
   */
  normalizeRepoUrl(url) {
    if (!url) return '';
    
    // Remove trailing .git
    let normalized = url.replace(/\.git$/, '');
    
    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, '');
    
    // Remove credentials
    normalized = normalized.replace(/^[^@]+@/, '');
    
    // Lowercase
    return normalized.toLowerCase();
  }

  /**
   * Trigger builds cho danh sách jobs
   * @async
   * @param {Array<Object>} jobs - Danh sách jobs
   * @param {Object} context - Build context (branch, commitHash, userName)
   * @returns {Promise<Array<Object>>} Kết quả trigger builds
   */
  async triggerBuilds(jobs, context) {
    const results = [];

    for (const job of jobs) {
      try {
        this.logger?.send(`[WEBHOOK] 🚀 Trigger build cho job: ${job.name} (${job.id})`);

        // Add job vào queue thay vì chạy trực tiếp
        const queueJobId = this.queueService.addJob({
          jobId: job.id,
          name: job.name,
          priority: 'high', // Webhook builds có priority cao
          estimatedTime: 300000,
          maxRetries: 2,
          metadata: {
            source: 'webhook',
            branch: context.branch,
            commitHash: context.commitHash,
            triggeredBy: context.userName
          }
        });

        results.push({
          jobId: job.id,
          jobName: job.name,
          queueJobId,
          status: 'queued'
        });

        this.logger?.send(`[WEBHOOK] ✅ Job ${job.name} đã được thêm vào queue (${queueJobId})`);
      } catch (error) {
        this.logger?.send(`[WEBHOOK] ❌ Lỗi khi trigger job ${job.name}: ${error.message}`);
        results.push({
          jobId: job.id,
          jobName: job.name,
          status: 'failed',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Kiểm tra commit đã được xử lý chưa
   * @param {string} repoUrl - Repository URL
   * @param {string} commitHash - Commit hash
   * @returns {boolean} True nếu đã xử lý
   */
  isCommitProcessed(repoUrl, commitHash) {
    const key = `${this.normalizeRepoUrl(repoUrl)}:${commitHash}`;
    return this.processedCommits.has(key);
  }

  /**
   * Mark commit đã được xử lý (với TTL)
   * @param {string} repoUrl - Repository URL
   * @param {string} commitHash - Commit hash
   * @returns {void}
   */
  markCommitProcessed(repoUrl, commitHash) {
    const key = `${this.normalizeRepoUrl(repoUrl)}:${commitHash}`;
    this.processedCommits.set(key, Date.now());

    // Auto cleanup sau cacheTimeout
    setTimeout(() => {
      this.processedCommits.delete(key);
    }, this.cacheTimeout);
  }

  /**
   * Cleanup cache commits cũ (gọi định kỳ)
   * @returns {number} Số commits đã cleanup
   */
  cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timestamp] of this.processedCommits.entries()) {
      if (now - timestamp > this.cacheTimeout) {
        this.processedCommits.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger?.send(`[WEBHOOK] 🧹 Cleanup ${cleaned} commits khỏi cache`);
    }

    return cleaned;
  }

  /**
   * Lấy thống kê webhook
   * @returns {Object} Stats
   */
  getStats() {
    return {
      cachedCommits: this.processedCommits.size,
      cacheTimeoutMs: this.cacheTimeout
    };
  }
}

module.exports = { WebhookService };
