import { Module, Global } from "@nestjs/common";
import { BuildService } from "./build.service";
import { DockerService } from "./docker.service";
import { GitService } from "./git.service";
import { ConfigModule } from "../../config/config.module";
import { LoggerModule } from "../../shared/logger/logger.module";
import { BuildsController, BuildHistoryController } from "./builds.controller";
import { ScriptBuildStrategy } from "./strategies/script.strategy";
import { DockerBuildStrategy } from "./strategies/docker.strategy";
import { PipelineBuildStrategy } from "./strategies/pipeline.strategy";

@Global()
@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [BuildsController, BuildHistoryController],
  providers: [
    BuildService,
    DockerService,
    GitService,
    ScriptBuildStrategy,
    DockerBuildStrategy,
    PipelineBuildStrategy,
  ],
  exports: [
    BuildService,
    DockerService,
    GitService,
    ScriptBuildStrategy,
    DockerBuildStrategy,
    PipelineBuildStrategy,
  ],
})
export class BuilderModule {}
