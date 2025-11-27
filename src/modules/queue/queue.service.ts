import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { LoggerService } from "../../shared/logger/logger.service";
import * as os from "os";
import { EventEmitter } from "events";

export interface QueueJob {
  id: string;
  jobId?: string; // Reference to actual job ID in JobService
  name: string;
  priority: "high" | "medium" | "low";
  maxRetries?: number;
  retryCount?: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  result?: any;
  error?: any;
  executionTime?: number;
  metadata?: any;
  [key: string]: any;
}

@Injectable()
export class QueueService {
  private queue: QueueJob[] = [];
  private runningJobs = new Map<string, QueueJob>();
  private completedJobs: QueueJob[] = [];
  private failedJobs: QueueJob[] = [];

  private isProcessing = false;
  private queueInterval: NodeJS.Timeout | null = null;

  private maxConcurrentJobs = 2;
  private resourceThreshold = 80;

  public stats = {
    totalQueued: 0,
    totalCompleted: 0,
    totalFailed: 0,
    averageExecutionTime: 0,
  };

  // EventEmitter replacement since NestJS services are not EventEmitters by default
  // We can use a subject or just callback methods if needed, but sticking to simple logic first.
  // Or we can extend EventEmitter if we really want to.
  // Let's keep it simple and maybe use a Subject if we need reactive streams later.
  // For now, we'll just log.

  private jobExecutor: ((job: QueueJob) => Promise<any>) | null = null;
  private jobService: any = null; // To be injected or set

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.init();
  }

  async init() {
    const config = await this.configService.getConfig();
    this.maxConcurrentJobs = config.maxConcurrentBuilds || 2;
    this.resourceThreshold = config.resourceThreshold || 80;

    this.startProcessing();
  }

  setJobService(service: any) {
    this.jobService = service;
  }

  addJob(job: Partial<QueueJob>): string {
    const queuedJob: QueueJob = {
      id: job.id || this.generateJobId(),
      name: job.name || "Unnamed Job",
      priority: job.priority || "medium",
      status: "queued",
      queuedAt: new Date(),
      retryCount: 0,
      maxRetries: job.maxRetries || 3,
      ...job,
    };

    this.insertByPriority(queuedJob);
    this.stats.totalQueued++;

    // this.logger.send(`[QUEUE] Job ${queuedJob.id} added to queue (Priority: ${queuedJob.priority})`);

    return queuedJob.id;
  }

  private insertByPriority(job: QueueJob) {
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

  startProcessing() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processQueue();

    this.queueInterval = setInterval(() => {
      this.processQueue();
    }, 5000);
  }

  stopProcessing() {
    this.isProcessing = false;
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
  }

  async processQueue() {
    if (!this.isProcessing || this.queue.length === 0) return;

    const systemOverloaded = await this.checkSystemLoad();
    if (systemOverloaded) {
      this.logger.send(
        `[QUEUE] System overloaded (${this.resourceThreshold}%), pausing queue`,
      );
      return;
    }

    if (this.runningJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.executeJob(job);
  }

  async executeJob(job: QueueJob) {
    job.status = "running";
    job.startedAt = new Date();
    this.runningJobs.set(job.id, job);

    if (this.jobService && job.jobId) {
      this.jobService.markJobAsRunning(job.jobId);
    }

    this.logger.send(`[QUEUE] Starting execution of job ${job.id}`);

    try {
      const result = await this.runJobLogic(job);

      job.status = "completed";
      job.completedAt = new Date();
      job.result = result;
      job.executionTime = job.completedAt.getTime() - job.startedAt.getTime();

      this.runningJobs.delete(job.id);
      this.completedJobs.push(job);
      this.stats.totalCompleted++;
      this.updateAverageExecutionTime();

      if (this.jobService && job.jobId) {
        this.jobService.markJobAsCompleted(job.jobId);
      }

      this.logger.send(
        `[QUEUE] Job ${job.id} completed successfully (${job.executionTime}ms)`,
      );
    } catch (error) {
      job.status = "failed";
      job.failedAt = new Date();
      job.error = error.message;
      job.retryCount = (job.retryCount || 0) + 1;

      this.runningJobs.delete(job.id);

      if (job.retryCount < (job.maxRetries || 3)) {
        job.status = "queued";
        this.insertByPriority(job);
        this.logger.send(
          `[QUEUE] Job ${job.id} failed, retrying ${job.retryCount}/${job.maxRetries}`,
        );
      } else {
        this.failedJobs.push(job);
        this.stats.totalFailed++;
        this.logger.send(
          `[QUEUE] Job ${job.id} failed completely: ${error.message}`,
        );
      }
    }

    setTimeout(() => this.processQueue(), 1000);
  }

  async runJobLogic(job: QueueJob): Promise<any> {
    if (this.jobExecutor) {
      return await this.jobExecutor(job);
    }
    // Simulation
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return {
      success: true,
      message: "Job completed successfully (simulation)",
    };
  }

  setJobExecutor(executor: (job: QueueJob) => Promise<any>) {
    this.jobExecutor = executor;
  }

  async checkSystemLoad(): Promise<boolean> {
    try {
      const cpuUsage = await this.getCPUUsage();
      const memUsage = (1 - os.freemem() / os.totalmem()) * 100;
      return Math.max(cpuUsage, memUsage) > this.resourceThreshold;
    } catch (error) {
      return false;
    }
  }

  getCPUUsage(): Promise<number> {
    return new Promise((resolve) => {
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      cpus.forEach((cpu) => {
        for (let type in cpu.times) {
          totalTick += (cpu.times as any)[type];
        }
        totalIdle += cpu.times.idle;
      });

      setTimeout(() => {
        let totalIdle2 = 0;
        let totalTick2 = 0;
        const cpus2 = os.cpus();

        cpus2.forEach((cpu) => {
          for (let type in cpu.times) {
            totalTick2 += (cpu.times as any)[type];
          }
          totalIdle2 += cpu.times.idle;
        });

        const idle = totalIdle2 - totalIdle;
        const total = totalTick2 - totalTick;
        const usage = 100 - ~~((100 * idle) / total);

        resolve(usage);
      }, 1000);
    });
  }

  updateAverageExecutionTime() {
    if (this.completedJobs.length === 0) return;
    const totalTime = this.completedJobs.reduce(
      (sum, job) => sum + (job.executionTime || 0),
      0,
    );
    this.stats.averageExecutionTime = Math.round(
      totalTime / this.completedJobs.length,
    );
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      runningJobs: this.runningJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      resourceThreshold: this.resourceThreshold,
    };
  }

  getQueueStatus() {
    return {
      queue: this.queue.map((job) => ({
        id: job.id,
        name: job.name,
        priority: job.priority,
        status: job.status,
        queuedAt: job.queuedAt,
      })),
      running: Array.from(this.runningJobs.values()).map((job) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        startedAt: job.startedAt,
        progress: job.progress || 0,
      })),
      completed: this.completedJobs.slice(-10),
      failed: this.failedJobs.slice(-10),
    };
  }

  cancelJob(jobId: string): boolean {
    const queueIndex = this.queue.findIndex((job) => job.id === jobId);
    if (queueIndex !== -1) {
      const job = this.queue.splice(queueIndex, 1)[0];
      job.status = "cancelled";
      return true;
    }

    if (this.runningJobs.has(jobId)) {
      const job = this.runningJobs.get(jobId);
      if (job) {
        job.status = "cancelled";
        this.runningJobs.delete(jobId);
        return true;
      }
    }

    return false;
  }

  generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updateConfig({
    maxConcurrentJobs,
    resourceThreshold,
  }: {
    maxConcurrentJobs?: number;
    resourceThreshold?: number;
  }) {
    if (maxConcurrentJobs !== undefined) {
      this.maxConcurrentJobs = maxConcurrentJobs;
      this.configService.updateConfig({
        maxConcurrentBuilds: maxConcurrentJobs,
      });
    }
    if (resourceThreshold !== undefined) {
      this.resourceThreshold = resourceThreshold;
      this.configService.updateConfig({ resourceThreshold: resourceThreshold });
    }
    this.logger.send(
      `[QUEUE] Config updated: maxConcurrentJobs=${this.maxConcurrentJobs}, resourceThreshold=${this.resourceThreshold}%`,
    );
  }
}
