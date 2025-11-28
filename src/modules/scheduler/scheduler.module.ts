import { Module } from "@nestjs/common";
import { SchedulerService } from "./scheduler.service";
import { SchedulerController } from "./scheduler.controller";
import { JobsModule } from "../jobs/jobs.module";
import { QueueModule } from "../queue/queue.module";
import { ConfigModule } from "../../config/config.module";
import { BuilderModule } from "../builder/builder.module";

@Module({
  imports: [JobsModule, QueueModule, ConfigModule, BuilderModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
