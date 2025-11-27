import { Module, Global, forwardRef } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { QueueController } from "./queue.controller";
import { JobsModule } from "../jobs/jobs.module";

@Global()
@Module({
  imports: [forwardRef(() => JobsModule)],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
