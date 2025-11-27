import { Module } from "@nestjs/common";
import { WebhookController } from "./webhook.controller";
import { WebhookService } from "./webhook.service";
import { JobsModule } from "../jobs/jobs.module";
import { QueueModule } from "../queue/queue.module";
import { LoggerModule } from "../../shared/logger/logger.module";

@Module({
  imports: [JobsModule, QueueModule, LoggerModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
