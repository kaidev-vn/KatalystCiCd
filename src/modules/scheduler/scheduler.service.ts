import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { JobsService } from "../jobs/jobs.service";
import { ConfigService } from "../../config/config.service";
import { QueueService } from "../queue/queue.service";
import { LoggerService } from "../../shared/logger/logger.service";
import { GitService } from "../builder/git.service";

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private lastCheckedCommits: Map<string, string> = new Map(); // jobId -> commitHash

  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
    private readonly logger: LoggerService,
    private readonly gitService: GitService,
  ) {}

  onModuleInit() {
    this.restart();
  }

  onModuleDestroy() {
    this.stopAll();
  }

  async restart() {
    this.stopAll();
    this.isRunning = true;
    this.logger.send("[SCHEDULER] Starting scheduler...");

    const jobs = await this.jobsService.getAllJobs();
    const enabledJobs = jobs.filter(
      (job) => job.enabled && job.schedule.autoCheck,
    );

    this.logger.send(
      `[SCHEDULER] Found ${enabledJobs.length} enabled jobs with autoCheck`,
    );

    for (const job of enabledJobs) {
      this.scheduleJob(job);
    }
  }

  stopAll() {
    this.logger.send("[SCHEDULER] Stopping all schedules");
    this.intervals.forEach((timer) => clearInterval(timer));
    this.intervals.clear();
    this.isRunning = false;
  }

  getStatus() {
    return {
      running: this.isRunning,
      activeJobs: this.intervals.size,
      monitoredJobs: Array.from(this.intervals.keys()),
    };
  }

  private scheduleJob(job: any) {
    if (!job.enabled || !job.schedule.autoCheck) return;

    // Polling
    if (
      job.schedule.triggerMethod === "polling" ||
      job.schedule.triggerMethod === "hybrid"
    ) {
      const pollingInterval = (job.schedule.polling || 30) * 1000;
      if (pollingInterval < 5000) {
        this.logger.send(
          `[SCHEDULER][WARN] Job ${job.name} polling interval too short (${pollingInterval}ms), minimum 5s`,
        );
        return;
      }
      this.logger.send(
        `[SCHEDULER] Scheduling job ${job.name} (polling: ${job.schedule.polling}s)`,
      );

      const timer = setInterval(async () => {
        if (!this.isRunning) return;
        await this.checkJob(job);
      }, pollingInterval);

      this.intervals.set(job.id, timer);
    }

    // Cron logic would go here if supported
  }

  private async checkJob(job: any) {
    try {
      // 1. Retrieve latest job state
      const currentJob = await this.jobsService.getJobById(job.id);
      if (
        !currentJob ||
        !currentJob.enabled ||
        !currentJob.schedule.autoCheck
      ) {
        this.stopJob(job.id);
        return;
      }

      const gc = currentJob.gitConfig || {};
      const repoUrl = gc.repoUrl;
      const token = gc.token;
      const provider = gc.provider || 'gitlab';
      
      if (!repoUrl) {
        this.logger.send(`[SCHEDULER][WARN] Job ${job.name} không có repoUrl, skip`);
        return;
      }

      // 2. Get branches to check (support multi-branch)
      const branchesToCheck: any[] = [];
      if (gc.branch) branchesToCheck.push({ name: gc.branch, enabled: true });
      if (Array.isArray(gc.branches)) {
        gc.branches.forEach((b: any) => {
          if (b.enabled && b.name && !branchesToCheck.find(x => x.name === b.name)) {
            branchesToCheck.push(b);
          }
        });
      }
      if (branchesToCheck.length === 0) {
        branchesToCheck.push({ name: 'main', enabled: true });
      }

      // 3. Check each branch for new commits
      for (const branchConfig of branchesToCheck) {
        const branch = branchConfig.name;
        
        try {
          // Get repo path (build context path)
          const cfg = await this.configService.getConfig();
          let baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '';
          if (!baseContext) {
            baseContext = gc.repoPath ? require('path').dirname(gc.repoPath) : process.cwd();
          }
          
          const path = require('path');
          const katalystRoot = path.join(baseContext, 'Katalyst');
          const repoPath = path.join(katalystRoot, 'repo');
          const repoName = this.extractRepoNameFromUrl(repoUrl);
          const actualRepoPath = path.join(repoPath, repoName);

          this.logger.send(`[SCHEDULER] Checking job ${job.name} on branch ${branch}...`);

          // Check for new commit (lightweight check)
          const checkResult = await this.gitService.checkNewCommitAndPull({
            repoPath: actualRepoPath,
            branch,
            repoUrl,
            token,
            provider,
            doPull: false, // Don't pull yet, just check remote
          });

          if (checkResult.ok && checkResult.hasNew) {
            const remoteHash = checkResult.remoteHash;
            const lastCheckedKey = `${job.id}-${branch}`;
            const lastChecked = this.lastCheckedCommits.get(lastCheckedKey);

            // Only trigger if commit hash is different from last checked
            if (remoteHash && remoteHash !== lastChecked) {
              this.logger.send(
                `[SCHEDULER] ✅ New commit detected for job ${job.name} on branch ${branch}: ${remoteHash}`
              );

              // Add to queue with metadata
              this.queueService.addJob({
                jobId: job.id,
                name: `Auto Build - ${job.name} (${branch})`,
                priority: 'medium',
                metadata: {
                  skipGitCheck: true, // We already checked
                  commitHash: remoteHash,
                  branch: branch,
                  triggeredBy: 'scheduler'
                }
              });

              // Update last checked commit
              this.lastCheckedCommits.set(lastCheckedKey, remoteHash);
              
              // Break after first new commit found (don't check other branches)
              break;
            } else {
              this.logger.send(
                `[SCHEDULER] Job ${job.name} on branch ${branch}: commit ${remoteHash} already checked`
              );
            }
          } else if (checkResult.hasNew === false) {
            this.logger.send(
              `[SCHEDULER] Job ${job.name} on branch ${branch}: no new commits`
            );
          }
        } catch (branchError) {
          this.logger.send(
            `[SCHEDULER][ERROR] Failed to check branch ${branch} for job ${job.name}: ${branchError.message}`
          );
        }
      }
    } catch (error) {
      this.logger.send(
        `[SCHEDULER][ERROR] Error checking job ${job.name}: ${error.message}`,
      );
    }
  }

  private extractRepoNameFromUrl(repoUrl: string): string {
    if (!repoUrl) return 'unknown-repo';
    let name = repoUrl.replace(/\.git$/, '');
    const parts = name.split('/');
    name = parts[parts.length - 1];
    return name.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  private stopJob(jobId: string) {
    if (this.intervals.has(jobId)) {
      clearInterval(this.intervals.get(jobId));
      this.intervals.delete(jobId);
    }
  }
}
