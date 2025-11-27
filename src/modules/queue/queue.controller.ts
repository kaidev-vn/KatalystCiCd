import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { QueueService } from "./queue.service";
import { JobsService } from "../jobs/jobs.service";
import { LoggerService } from "../../shared/logger/logger.service";

@Controller("api/queue")
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    @Inject(forwardRef(() => JobsService))
    private readonly jobsService: JobsService,
    private readonly logger: LoggerService,
  ) {}

  @Post("add")
  async addJobToQueue(@Body() body: any) {
    const { jobId, priority = "medium", estimatedTime } = body;
    if (!jobId) {
      return { error: "Job ID is required" };
    }

    const job = await this.jobsService.getJobById(jobId);
    if (!job) {
      return { error: "Job not found" };
    }

    // Commit check logic skipped for now or needs to be implemented in JobsService
    // For simplicity, just add to queue

    const queueJobId = this.queueService.addJob({
      jobId: jobId,
      name: job.name,
      priority: priority,
      // estimatedTime: estimatedTime || 300000,
      maxRetries: 2,
    });

    return {
      success: true,
      queueJobId: queueJobId,
      message: "Job added to queue successfully",
    };
  }

  @Get("status")
  getQueueStatus() {
    const status = this.queueService.getQueueStatus();
    const stats = this.queueService.getStats();
    return {
      success: true,
      status: status,
      stats: stats,
    };
  }

  @Get("stats")
  getQueueStats() {
    const stats = this.queueService.getStats();
    return { success: true, stats: stats };
  }

  @Delete(":jobId")
  cancelJob(@Param("jobId") jobId: string) {
    const cancelled = this.queueService.cancelJob(jobId);
    if (cancelled) {
      return { success: true, message: "Job cancelled successfully" };
    } else {
      return { error: "Job not found in queue" };
    }
  }

  @Post("config")
  updateQueueConfig(@Body() body: any) {
    const { maxConcurrentJobs, resourceThreshold } = body;
    this.queueService.updateConfig({
      maxConcurrentJobs,
      resourceThreshold,
    });
    return {
      success: true,
      message: "Queue configuration updated successfully",
    };
  }

  @Post("toggle")
  toggleQueueProcessing(@Body() body: any) {
    const { action } = body;
    if (action === "start") {
      this.queueService.startProcessing();
      return { success: true, message: "Queue processing started" };
    } else if (action === "stop") {
      this.queueService.stopProcessing();
      return { success: true, message: "Queue processing stopped" };
    } else {
      return { error: "Invalid action" };
    }
  }
}
