import { Controller, Get, Post, Body } from "@nestjs/common";
import { SchedulerService } from "./scheduler.service";

@Controller("api/scheduler")
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get("status")
  getStatus() {
    const status = this.schedulerService.getStatus();
    return {
      success: true,
      running: status.running,
      activeJobs: status.activeJobs,
      monitoredJobs: status.monitoredJobs,
    };
  }

  @Post("start")
  async start() {
    await this.schedulerService.restart();
    return { success: true, message: "Scheduler started" };
  }

  @Post("stop")
  stop() {
    this.schedulerService.stopAll();
    return { success: true, message: "Scheduler stopped" };
  }
}

