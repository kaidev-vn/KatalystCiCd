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
    return await this.jobsService.createJob(jobData);
  }

  @Put(":id")
  async updateJob(@Param("id") id: string, @Body() updateData: any) {
    return await this.jobsService.updateJob(id, updateData);
  }

  @Delete(":id")
  async deleteJob(@Param("id") id: string) {
    return await this.jobsService.deleteJob(id);
  }

  @Post(":id/toggle")
  async toggleJob(@Param("id") id: string) {
    return await this.jobsService.toggleJob(id);
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
