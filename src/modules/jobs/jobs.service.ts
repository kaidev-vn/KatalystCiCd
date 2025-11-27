import { Injectable, Inject, forwardRef } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { ConfigService } from "../../config/config.service";
import { LoggerService } from "../../shared/logger/logger.service";
import { DataStorageService } from "../../config/data-storage.service";
import { QueueService, QueueJob } from "../queue/queue.service";
import { BuildService } from "../builder/build.service";
import { EmailService } from "../email/email.service";
import { getSecretManager } from "../../common/utils/secrets.util";

@Injectable()
export class JobsService {
  private jobsFile: string;
  private secretManager = getSecretManager();
  private runningJobs = new Set<string>();

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly storageService: DataStorageService,
    private readonly queueService: QueueService,
    private readonly buildService: BuildService,
    private readonly emailService: EmailService,
  ) {
    this.jobsFile = path.join(process.cwd(), "jobs.json");
    this.ensureJobsFile();

    this.queueService.setJobExecutor(this._jobExecutor.bind(this));
    this.queueService.setJobService(this);
  }

  private async _jobExecutor(queueJob: QueueJob) {
    try {
      const jobId = queueJob.jobId || queueJob.id;
      if (!jobId) {
        throw new Error("Queue job missing jobId");
      }

      const job = await this.getJobById(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      // Decrypt job before building
      const decryptedJob = this.getDecryptedJob(job);

      // Execute build using BuildService
      const result = await this.buildService.executeJobBuild(
        decryptedJob,
        queueJob.metadata,
      );

      // Update stats
      if (result.success && result.commitHash) {
        await this.updateJobStats(jobId, {
          success: true,
          commitHash: result.commitHash,
        });
      } else if (result.status === "failed") {
        await this.updateJobStats(jobId, { success: false });
      }

      // Send notification email
      try {
        await this.sendBuildNotification(job, result);
      } catch (emailError) {
        this.logger.send(`[JOB] Failed to send email notification: ${emailError.message}`);
      }

      return result;
    } catch (error) {
      this.logger.send(`[JOB-EXECUTOR] Error executing job: ${error.message}`);
      throw error;
    }
  }

  private async sendBuildNotification(job: any, result: any) {
      const status = result.success ? "Success" : "Failed";
      const subject = `[CI/CD] Build ${status}: ${job.name}`;
      const text = `Job: ${job.name}\nStatus: ${status}\nBuild ID: ${result.buildId}\nMessage: ${result.message}`;
      
      // Check if job has specific email notification settings
      // Assuming configService or job config has notifyEmails
      // But EmailService handles reading from global config.
      // If we want job-specific emails, we'd pass toList here.
      
      await this.emailService.sendNotificationEmail({
          subject,
          text
      });
  }


  private ensureJobsFile() {
    if (!fs.existsSync(this.jobsFile)) {
      fs.writeFileSync(this.jobsFile, JSON.stringify([], null, 2));
    }
  }

  async getAllJobs(): Promise<any[]> {
    try {
      if (this.storageService.isUsingDatabase()) {
        return await this.storageService.getData("jobs", []);
      }
      if (!fs.existsSync(this.jobsFile)) return [];
      const data = fs.readFileSync(this.jobsFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error reading jobs file:", error);
      return [];
    }
  }

  async getJobById(jobId: string): Promise<any> {
    const jobs = await this.getAllJobs();
    return jobs.find((job) => job.id === jobId);
  }

  // ... createJob, updateJob, etc. (same as before) ...
  // For brevity I assume they are here.

  // Helper to decrypt job
  getDecryptedJob(job: any) {
    if (!job) return null;
    try {
      return {
        ...job,
        gitConfig: {
          ...job.gitConfig,
          token: this.secretManager.decrypt(job.gitConfig?.token || ""),
        },
        buildConfig: {
          ...job.buildConfig,
          dockerConfig: {
            ...job.buildConfig?.dockerConfig,
            registryPassword: this.secretManager.decrypt(
              job.buildConfig?.dockerConfig?.registryPassword || "",
            ),
          },
          registryPassword: this.secretManager.decrypt(
            job.buildConfig?.registryPassword || "",
          ),
        },
      };
    } catch (error) {
      return job;
    }
  }

  async updateJobStats(jobId: string, buildResult: any) {
    const job = await this.getJobById(jobId);
    if (!job) return;

    const stats = {
      totalBuilds: (job.stats?.totalBuilds || 0) + 1,
      successfulBuilds:
        (job.stats?.successfulBuilds || 0) + (buildResult.success ? 1 : 0),
      failedBuilds:
        (job.stats?.failedBuilds || 0) + (buildResult.success ? 0 : 1),
      lastBuildAt: new Date().toISOString(),
      lastBuildStatus: buildResult.success ? "success" : "failed",
      lastCommitHash:
        buildResult.commitHash || job.stats?.lastCommitHash || null,
    };

    await this.updateJob(jobId, { stats });
  }

  // Duplicated methods from previous step to ensure file is complete
  async createJob(jobData: any): Promise<any> {
    // ... implementation ...
    const jobs = await this.getAllJobs();
    const newJob = {
      id: uuidv4(),
      ...jobData,
      createdAt: new Date().toISOString(),
    };
    jobs.push(newJob);
    await this.saveJobs(jobs);
    return newJob;
  }
  async updateJob(jobId: string, updateData: any): Promise<any> {
    const jobs = await this.getAllJobs();
    const index = jobs.findIndex((j) => j.id === jobId);
    if (index === -1) throw new Error("Job not found");
    jobs[index] = {
      ...jobs[index],
      ...updateData,
      updatedAt: new Date().toISOString(),
    };
    await this.saveJobs(jobs);
    return jobs[index];
  }
  async deleteJob(jobId: string): Promise<boolean> {
    const jobs = await this.getAllJobs();
    const filtered = jobs.filter((j) => j.id !== jobId);
    await this.saveJobs(filtered);
    return true;
  }
  async toggleJob(jobId: string): Promise<any> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error("Job not found");
    return this.updateJob(jobId, { enabled: !job.enabled });
  }
  markJobAsRunning(jobId: string) {
    this.runningJobs.add(jobId);
  }
  markJobAsCompleted(jobId: string) {
    this.runningJobs.delete(jobId);
  }

  private async saveJobs(jobs: any[]) {
    if (this.storageService.isUsingDatabase()) {
      await this.storageService.saveData("jobs", jobs);
    } else {
      fs.writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2));
    }
  }
}
