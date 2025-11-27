import { Module, Global } from "@nestjs/common";
import { BuildService } from "./build.service";
import { DockerService } from "./docker.service";
import { GitService } from "./git.service";
import { ConfigModule } from "../../config/config.module";
import { LoggerModule } from "../../shared/logger/logger.module";
import { BuildsController, BuildHistoryController } from "./builds.controller";

@Global()
@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [BuildsController, BuildHistoryController],
  providers: [BuildService, DockerService, GitService],
  exports: [BuildService, DockerService, GitService],
})
export class BuilderModule {}
