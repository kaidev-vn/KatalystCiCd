import { Module, forwardRef } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { QueueModule } from "../queue/queue.module";
import { BuilderModule } from "../builder/builder.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [
    forwardRef(() => QueueModule),
    BuilderModule,
    EmailModule
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
