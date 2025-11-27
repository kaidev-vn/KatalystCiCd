import { Injectable } from "@nestjs/common";
import { IBuildStrategy, BuildContext, HistoryManager } from "./build-strategy.interface";
import { LoggerService } from "../../../shared/logger/logger.service";
import { runSeries, resolveShell } from "../../../common/utils/exec.util";
import * as path from "path";
import * as fs from "fs";

@Injectable()
export class ScriptBuildStrategy implements IBuildStrategy {
  constructor(private readonly logger: LoggerService) {}

  async execute(context: BuildContext, historyManager: HistoryManager): Promise<any> {
    const { job, repoPath, commitHash, jobBuilderDir, buildLogsDir, env: envOverrides } = context;
    
    const buildId = `script-${Date.now()}`;
    const startTime = new Date().toISOString();
    const scriptPath = job.buildConfig.scriptPath || path.join(jobBuilderDir, "build-script.sh");

    historyManager.addHistory({
      id: buildId,
      name: `Script: ${path.basename(scriptPath)}`,
      method: "script",
      status: "running",
      startTime,
      scriptPath,
      commitHash,
      jobId: job.id,
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
      let cwd = path.dirname(scriptPath) || process.cwd();
      // If scriptPath is absolute or relative, verify it exists.
      // If it's just a name, we assume it's in jobBuilderDir?
      // Original logic:
      // let cwd = workingDir || path.dirname(scriptPath) || process.cwd();
      // In original executeJobBuild:
      // const scriptPath = job.buildConfig.scriptPath || path.join(jobBuilderDir, 'build-script.sh');
      
      // We should use repoPath as CWD if not specified otherwise?
      // Original logic used path.dirname(scriptPath).
      // Let's stick to that for now, but allow overrides if context suggests.
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

      const { hadError } = await runSeries([scriptCmd], buildLogger, {
        env: { ...process.env, ...envOverrides },
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

