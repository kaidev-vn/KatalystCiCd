import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Res,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { QueueService } from "../queue/queue.service";
import { Response } from "express";

@Controller("api/jobs")
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly queueService: QueueService,
  ) {}

  @Get()
  async getAllJobs() {
    return await this.jobsService.getAllJobs();
  }

  @Get("enabled")
  async getEnabledJobs() {
    const jobs = await this.jobsService.getAllJobs();
    return jobs.filter((job) => job.enabled && job.schedule.autoCheck);
  }

  @Get(":id")
  async getJobById(@Param("id") id: string) {
    const job = await this.jobsService.getJobById(id);
    if (!job) {
      return null;
    }
    return job;
  }

  @Post()
  async createJob(@Body() jobData: any) {
    const newJob = await this.jobsService.createJob(jobData);
    
    // Tạo file build-script.sh hoặc JSON pipeline nếu cần
    try {
      await this.jobsService.ensureJobScript(newJob);
    } catch (e) {
      console.warn(`[JOB][WARN] Không thể tạo file script sau khi tạo job: ${e.message}`);
    }
    
    // ✅ Restart scheduler để nhận job mới (via JobsService)
    try {
      await this.jobsService.restartScheduler();
    } catch (e) {
      console.warn(`[JOB][WARN] Không thể restart scheduler: ${e.message}`);
    }
    
    return newJob;
  }

  @Put(":id")
  async updateJob(@Param("id") id: string, @Body() updateData: any) {
    const updatedJob = await this.jobsService.updateJob(id, updateData);
    
    // Cập nhật file build-script.sh hoặc JSON pipeline nếu cần
    try {
      await this.jobsService.ensureJobScript(updatedJob);
    } catch (e) {
      console.warn(`[JOB][WARN] Không thể cập nhật file script sau khi update job: ${e.message}`);
    }
    
    // ✅ Restart scheduler để áp dụng thay đổi (via JobsService)
    try {
      await this.jobsService.restartScheduler();
    } catch (e) {
      console.warn(`[JOB][WARN] Không thể restart scheduler: ${e.message}`);
    }
    
    return updatedJob;
  }

  @Delete(":id")
  async deleteJob(@Param("id") id: string) {
    const result = await this.jobsService.deleteJob(id);
    
    // ✅ Restart scheduler để remove job đã xóa (via JobsService)
    try {
      await this.jobsService.restartScheduler();
    } catch (e) {
      console.warn(`[JOB][WARN] Không thể restart scheduler: ${e.message}`);
    }
    
    return result;
  }

  @Post(":id/toggle")
  async toggleJob(@Param("id") id: string) {
    const updatedJob = await this.jobsService.toggleJob(id);
    
    // ✅ Restart scheduler để áp dụng trạng thái mới (via JobsService)
    try {
      await this.jobsService.restartScheduler();
    } catch (e) {
      console.warn(`[JOB][WARN] Không thể restart scheduler: ${e.message}`);
    }
    
    return updatedJob;
  }

  @Post(":id/run")
  async runJob(@Param("id") id: string, @Body() body: any) {
    const job = await this.jobsService.getJobById(id);
    if (!job) {
      throw new Error("Job not found");
    }

    const queueId = this.queueService.addJob({
      jobId: job.id,
      name: `Manual Build - ${job.name}`,
      priority: "high", // Manual runs usually high priority
      metadata: body, // Pass extra params like specific branch etc
    });

    return { success: true, message: "Job queued", queueId };
  }
}
