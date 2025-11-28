import { Injectable } from "@nestjs/common";
import { IBuildStrategy, BuildContext, HistoryManager } from "./build-strategy.interface";
import { LoggerService } from "../../../shared/logger/logger.service";
import { runSeries, resolveShell } from "../../../common/utils/exec.util";
import { nextSplitTag, splitTagIntoParts } from "../../../common/utils/tag.util";
import * as path from "path";
import * as fs from "fs";

@Injectable()
export class ScriptBuildStrategy implements IBuildStrategy {
  constructor(private readonly logger: LoggerService) {}

  async execute(context: BuildContext, historyManager: HistoryManager): Promise<any> {
    const { job, repoPath, commitHash, jobBuilderDir, buildLogsDir, env: envOverrides, branchConfig } = context;
    
    const buildId = `script-${Date.now()}`;
    const startTime = new Date().toISOString();
    const scriptPath = job.buildConfig.scriptPath || path.join(jobBuilderDir, "build-script.sh");

    // Prepare full environment variables (port from src_legacy)
    const bc = job.buildConfig || {};
    const dc = bc.dockerConfig || {};
    const gc = job.gitConfig || {};
    
    const imageName = bc.imageName || dc.imageName || '';
    const tagNumber = bc.imageTagNumber || '';
    const tagText = bc.imageTagText || '';
    const autoInc = !!(bc.autoTagIncrement || dc.autoTagIncrement);
    const tagPrefix = branchConfig?.tagPrefix || '';
    
    // Generate tag with auto-increment and prefix
    const imageTag = nextSplitTag(tagNumber || '1.0.0', tagText || '', autoInc, tagPrefix);
    const registryUrl = bc.registryUrl || dc.registryUrl || '';
    const registryUsername = bc.registryUsername || dc.registryUsername || '';
    const registryPassword = bc.registryPassword || dc.registryPassword || '';

    // Build complete environment object
    const scriptEnv = {
      // Image & Tag info
      IMAGE_NAME: imageName,
      IMAGE_TAG_NUMBER: tagNumber || '',
      IMAGE_TAG_TEXT: tagText || '',
      IMAGE_TAG: imageTag,
      AUTO_TAG_INCREMENT: String(autoInc),
      
      // Registry info
      REGISTRY_URL: registryUrl,
      REGISTRY_USERNAME: registryUsername,
      REGISTRY_PASSWORD: registryPassword,
      
      // Docker config
      DOCKERFILE_PATH: dc.dockerfilePath || '',
      CONTEXT_PATH: dc.contextPath || repoPath || '',
      DOCKER_IMAGE_TAG: imageTag, // Compat with legacy scripts
      
      // Git info
      BRANCH: gc.branch || 'main',
      REPO_URL: gc.repoUrl || '',
      REPO_PATH: repoPath,
      COMMIT_HASH: commitHash || '',
      
      // Job info
      JOB_ID: job.id,
      JOB_NAME: job.name,
      JOB_BUILDER_DIR: jobBuilderDir,
      
      // Merge with any env overrides
      ...envOverrides
    };

    historyManager.addHistory({
      id: buildId,
      name: `Script: ${path.basename(scriptPath)}`,
      method: "script",
      status: "running",
      startTime,
      scriptPath,
      commitHash,
      jobId: job.id,
      jobName: job.name,
    });

    const logFile = path.join(buildLogsDir, `${buildId}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "w" });
    const buildLogger = {
      send: (msg: string) => {
        logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
        this.logger.send(msg);
      },
    };

    try {
      // Check if script exists
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script file not found: ${scriptPath}`);
      }

      let cwd = repoPath || path.dirname(scriptPath) || process.cwd();
      if (fs.existsSync(repoPath)) {
         cwd = repoPath;
      }

      let scriptCmd;
      if (process.platform === "win32") {
        if (scriptPath.endsWith(".ps1"))
          scriptCmd = `powershell -File "${scriptPath}"`;
        else scriptCmd = `"${scriptPath}"`;
      } else {
        scriptCmd = `"${scriptPath}"`;
      }

      buildLogger.send(`[SCRIPT] Running: ${scriptCmd}`);
      buildLogger.send(`[SCRIPT] CWD: ${cwd}`);
      buildLogger.send(`[SCRIPT] IMAGE_TAG: ${imageTag}`);

      const { hadError } = await runSeries([scriptCmd], buildLogger, {
        env: { ...process.env, ...scriptEnv },
        cwd,
      });

      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      historyManager.updateHistory(buildId, {
        status: hadError ? "failed" : "success",
        endTime,
        duration,
      });

      logStream.end();
      
      return {
        buildId,
        status: hadError ? "failed" : "completed",
        message: hadError ? "Script build failed" : "Script build completed",
      };
    } catch (e) {
      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      historyManager.updateHistory(buildId, { 
          status: "failed", 
          endTime, 
          duration,
          error: e.message 
      });
      logStream.end();
      throw e;
    }
  }

  private calculateDuration(startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

