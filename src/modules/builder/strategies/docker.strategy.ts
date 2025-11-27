import { Injectable } from "@nestjs/common";
import { IBuildStrategy, BuildContext, HistoryManager } from "./build-strategy.interface";
import { DockerService } from "../docker.service";
import { LoggerService } from "../../../shared/logger/logger.service";

@Injectable()
export class DockerBuildStrategy implements IBuildStrategy {
  constructor(
    private readonly dockerService: DockerService,
    private readonly logger: LoggerService
  ) {}

  async execute(context: BuildContext, historyManager: HistoryManager): Promise<any> {
    const { job, repoPath, commitHash } = context;
    
    const dc = job.buildConfig.dockerConfig || {};
    const params = {
      dockerfilePath: dc.dockerfilePath,
      contextPath: dc.contextPath || repoPath,
      imageName: dc.imageName,
      imageTag: dc.imageTag,
      registryUrl: dc.registryUrl,
      registryUsername: dc.registryUsername,
      registryPassword: dc.registryPassword,
      autoTagIncrement: dc.autoTagIncrement,
      commitHash: commitHash,
    };

    // Docker build in original code didn't explicitly create a build history entry in executeJobBuild
    // EXCEPT that DockerService might log things. 
    // Original executeJobBuild just called dockerService.buildAndPush and returned result.
    // It didn't seem to add to build-history.json for Docker builds in the same way script/json did.
    // However, uniformity is good. Let's check if we should add history.
    // The original code returned { buildId: `docker-${Date.now()}` ... }
    // But didn't call addBuildHistory.
    // Only runScript and runPipelineFile called addBuildHistory.
    // We should probably add it for Docker too for consistency, but strictly following migration:
    // The user asked to refactor into strategies. 
    // I will NOT add history if it wasn't there, or maybe I should?
    // Let's stick to original behavior but maybe improve it later.
    // Wait, if I don't add history, it won't show up in build history UI.
    // Does Docker build not show up in history?
    // Checking original BuildService...
    // It returns a buildResult object.
    // JobsService calls updateJobStats.
    // It seems Docker builds were NOT recorded in build-history.json in the legacy code provided in snippets?
    // Let's look at BuildService again.
    // Lines 152-172 in attached file:
    // const r = await this.dockerService.buildAndPush(params);
    // buildResult = { buildId: ..., status: ... }
    // No addBuildHistory call.
    
    // I will implement execute to just call dockerService.
    
    const r = await this.dockerService.buildAndPush(params);
    
    return {
      buildId: `docker-${Date.now()}`,
      status: r.hadError ? "failed" : "completed",
      message: r.hadError ? "Docker build failed" : "Docker build completed",
    };
  }
}

