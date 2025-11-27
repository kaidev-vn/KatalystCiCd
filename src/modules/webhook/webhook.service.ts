import { Injectable } from "@nestjs/common";
import { LoggerService } from "../../shared/logger/logger.service";
import { JobsService } from "../jobs/jobs.service";
import { QueueService } from "../queue/queue.service";
import * as crypto from "crypto";

@Injectable()
export class WebhookService {
  private WEBHOOK_SECRET =
    process.env.WEBHOOK_SECRET || "YOUR_GITLAB_SECRET_TOKEN";
  private stats = {
    totalEvents: 0,
    triggeredBuilds: 0,
    lastEventAt: null,
  };

  constructor(
    private readonly logger: LoggerService,
    private readonly jobsService: JobsService,
    private readonly queueService: QueueService,
  ) {}

  async handleGitLabPush(event: any, token: string) {
    this.stats.totalEvents++;
    this.stats.lastEventAt = new Date().toISOString();

    if (token !== this.WEBHOOK_SECRET) {
      throw new Error("Invalid GitLab token");
    }

    const repoUrl = event.project?.git_http_url || event.project?.http_url;
    const branch = event.ref?.replace("refs/heads/", "");
    const commitHash = event.checkout_sha || event.after;

    if (!repoUrl || !branch) {
      return { success: false, reason: "missing_info" };
    }

    return await this.triggerJobsForEvent(repoUrl, branch, commitHash);
  }

  async handleGitHubPush(event: any, signature: string) {
    this.stats.totalEvents++;
    this.stats.lastEventAt = new Date().toISOString();

    // Verify signature if secret provided
    if (
      this.WEBHOOK_SECRET &&
      this.WEBHOOK_SECRET !== "YOUR_GITLAB_SECRET_TOKEN"
    ) {
      if (!signature) throw new Error("Missing GitHub signature");
      const hmac = crypto.createHmac("sha256", this.WEBHOOK_SECRET);
      const digest =
        "sha256=" + hmac.update(JSON.stringify(event)).digest("hex");
      if (signature !== digest) throw new Error("Invalid GitHub signature");
    }

    const repoUrl = event.repository?.clone_url || event.repository?.html_url;
    const branch = event.ref?.replace("refs/heads/", "");
    const commitHash = event.after;

    if (!repoUrl || !branch) {
      return { success: false, reason: "missing_info" };
    }

    return await this.triggerJobsForEvent(repoUrl, branch, commitHash);
  }

  async triggerJobsForEvent(
    repoUrl: string,
    branch: string,
    commitHash: string,
  ) {
    this.logger.send(
      `[WEBHOOK] Processing event for ${repoUrl} on branch ${branch} (${commitHash})`,
    );

    const jobs = await this.jobsService.getAllJobs();
    const matchedJobs = jobs.filter((job) => {
      if (!job.enabled) return false;
      if (
        !job.schedule ||
        (job.schedule.triggerMethod !== "webhook" &&
          job.schedule.triggerMethod !== "hybrid")
      )
        return false;

      const jobRepoUrl = job.gitConfig?.repoUrl;
      const jobBranch = job.gitConfig?.branch || "main";

      // Simple match
      if (!jobRepoUrl) return false;
      // Normalize URLs for comparison (ignore .git suffix)
      const normalize = (u: string) =>
        u.replace(/\.git$/, "").replace(/\/$/, "");
      return (
        normalize(jobRepoUrl) === normalize(repoUrl) && jobBranch === branch
      );
    });

    if (matchedJobs.length === 0) {
      this.logger.send(`[WEBHOOK] No matching jobs found`);
      return { success: true, triggeredJobs: 0, results: [] };
    }

    const results = [];
    for (const job of matchedJobs) {
      this.logger.send(`[WEBHOOK] Triggering job ${job.name}`);
      const queueId = this.queueService.addJob({
        jobId: job.id,
        name: `Webhook Build - ${job.name}`,
        priority: "high",
        metadata: {
          commitHash: commitHash,
          skipGitCheck: true, // Since we have the commit hash from webhook
          branch: branch,
        },
      });
      results.push({ jobId: job.id, queueId });
      this.stats.triggeredBuilds++;
    }

    return { success: true, triggeredJobs: matchedJobs.length, results };
  }

  getStats() {
    return this.stats;
  }
}
