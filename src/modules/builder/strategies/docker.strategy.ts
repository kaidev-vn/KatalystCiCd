import { Injectable } from "@nestjs/common";
import { IBuildStrategy, BuildContext, HistoryManager } from "./build-strategy.interface";
import { DockerService } from "../docker.service";
import { LoggerService } from "../../../shared/logger/logger.service";
import { nextSplitTag, splitTagIntoParts } from "../../../common/utils/tag.util";

@Injectable()
export class DockerBuildStrategy implements IBuildStrategy {
  constructor(
    private readonly dockerService: DockerService,
    private readonly logger: LoggerService
  ) {}

  async execute(context: BuildContext, historyManager: HistoryManager): Promise<any> {
    const { job, repoPath, commitHash, branchConfig } = context;
    
    const dc = job.buildConfig.dockerConfig || {};
    const bc = job.buildConfig || {};
    
    // Handle tag with auto-increment and branch prefix
    let imageTag = dc.imageTag || 'latest';
    let shouldUpdateTag = false;
    
    // Nếu có imageTagNumber thì dùng split tag logic
    if (bc.imageTagNumber) {
      const tagNumber = bc.imageTagNumber;
      const tagText = bc.imageTagText || '';
      const autoInc = !!(bc.autoTagIncrement || dc.autoTagIncrement);
      const tagPrefix = branchConfig?.tagPrefix || '';
      
      // Generate tag với prefix và auto increment
      imageTag = nextSplitTag(tagNumber, tagText, autoInc, tagPrefix);
      shouldUpdateTag = autoInc; // Chỉ update nếu auto increment
      
      this.logger.send(`[DOCKER] Generated tag: ${imageTag} (autoInc: ${autoInc}, prefix: ${tagPrefix})`);
    }
    
    const params = {
      dockerfilePath: dc.dockerfilePath,
      contextPath: dc.contextPath || repoPath,
      imageName: dc.imageName || bc.imageName,
      imageTag: imageTag,
      registryUrl: dc.registryUrl,
      registryUsername: dc.registryUsername,
      registryPassword: dc.registryPassword,
      autoTagIncrement: dc.autoTagIncrement,
      commitHash: commitHash,
    };

    const buildId = `docker-${Date.now()}`;
    const startTime = new Date().toISOString();
    
    // Add to build history
    historyManager.addHistory({
      id: buildId,
      name: `Docker: ${params.imageName}:${params.imageTag}`,
      method: "docker",
      status: "running",
      startTime,
      commitHash,
      jobId: job.id,
      jobName: job.name,
    });
    
    try {
      const r = await this.dockerService.buildAndPush(params);
      
      const endTime = new Date().toISOString();
      historyManager.updateHistory(buildId, {
        status: r.hadError ? "failed" : "success",
        endTime,
      });
      
      // Nếu build thành công và auto-increment, update tag trong job
      if (!r.hadError && shouldUpdateTag) {
        const parts = splitTagIntoParts(imageTag);
        this.logger.send(`[DOCKER] Auto-increment tag: ${parts.numberPart} (will be saved to job config)`);
        // Return updated tag để JobService có thể update
        return {
          buildId,
          status: "completed",
          message: "Docker build completed",
          updatedTag: {
            numberPart: parts.numberPart,
            textPart: parts.textPart
          }
        };
      }
      
      return {
        buildId,
        status: r.hadError ? "failed" : "completed",
        message: r.hadError ? "Docker build failed" : "Docker build completed",
      };
    } catch (error) {
      const endTime = new Date().toISOString();
      historyManager.updateHistory(buildId, {
        status: "failed",
        endTime,
        error: error.message
      });
      throw error;
    }
  }
}

