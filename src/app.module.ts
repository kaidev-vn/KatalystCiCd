import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ConfigModule } from "./config/config.module";
import { LoggerModule } from "./shared/logger/logger.module";
import { QueueModule } from "./modules/queue/queue.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { BuilderModule } from "./modules/builder/builder.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { RepositoryModule } from "./modules/repository/repository.module";
import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { WebhookModule } from "./modules/webhook/webhook.module";
import { DeployModule } from "./modules/deploy/deploy.module";

@Module({
  imports: [
    LoggerModule,
    ConfigModule,
    QueueModule,
    JobsModule,
    BuilderModule,
    SchedulerModule,
    RepositoryModule,
    UsersModule,
    AuthModule,
    WebhookModule,
    DeployModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
