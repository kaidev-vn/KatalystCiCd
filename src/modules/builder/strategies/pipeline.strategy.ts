import { Injectable } from "@nestjs/common";
import { IBuildStrategy, BuildContext, HistoryManager } from "./build-strategy.interface";
import { GitService } from "../git.service";
import { LoggerService } from "../../../shared/logger/logger.service";
import { run, resolveShell } from "../../../common/utils/exec.util";
import * as path from "path";
import * as fs from "fs";

@Injectable()
export class PipelineBuildStrategy implements IBuildStrategy {
  constructor(
    private readonly gitService: GitService,
    private readonly logger: LoggerService
  ) {}

  async execute(context: BuildContext, historyManager: HistoryManager): Promise<any> {
    const { job, repoPath, commitHash, buildLogsDir, env: envOverrides } = context;
    const filePath = job.buildConfig.jsonPipelinePath;

    const buildId = `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = new Date().toISOString();

    historyManager.addHistory({
      id: buildId,
      name: `JSON Pipeline: ${path.basename(filePath)}`,
      method: "jsonfile",
      status: "running",
      startTime,
      scriptPath: filePath,
      commitHash: commitHash || null,
      jobId: job.id || null,
    });

    const logFile = path.join(buildLogsDir, `${buildId}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "w" });
    const buildLogger = {
      send: (message: string) => {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        logStream.write(logLine);
        this.logger.send(message);
      },
    };

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Pipeline JSON not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, "utf8");
      let spec;
      try {
        spec = JSON.parse(raw);
      } catch (e) {
        throw new Error(`JSON parse error: ${e.message}`);
      }

      const pipelineName = spec.pipeline_name || path.basename(filePath);
      let workingDir = spec.working_directory;
      if (
        !workingDir &&
        repoPath
      ) {
        workingDir = repoPath;
      }
      if (!workingDir) {
        workingDir = process.cwd();
      }

      const envMap = spec.environment_vars || {};
      const steps = Array.isArray(spec.steps) ? spec.steps.slice() : [];

      const checkCommit = spec.check_commit === true;
      const branch = spec.branch || "main";
      const repoUrl = spec.repo_url;

      if (checkCommit && repoUrl) {
        buildLogger.send(
          `[PIPELINE] Checking new commit for branch: ${branch}, repo: ${repoUrl}`,
        );
        try {
          const checkResult = await this.gitService.checkNewCommitAndPull({
            repoPath: workingDir,
            branch: branch,
            repoUrl: repoUrl,
            doPull: false,
          });

          if (!checkResult.ok) {
            buildLogger.send(
              `[PIPELINE][WARN] Commit check failed: ${checkResult.error}`,
            );
          } else if (!checkResult.hasNew) {
            buildLogger.send(`[PIPELINE] No new commit. Stopping pipeline.`);
            const endTime = new Date().toISOString();
            const duration = this.calculateDuration(startTime, endTime);
            historyManager.updateHistory(buildId, {
              status: "skipped",
              endTime,
              duration,
              reason: "no_new_commit",
            });
            logStream.end();
            return {
              ok: true,
              buildId,
              skipped: true,
              reason: "no_new_commit",
            };
          } else {
            buildLogger.send(
              `[PIPELINE] New commit detected: ${checkResult.remoteHash}. Continuing.`,
            );
          }
        } catch (error) {
          buildLogger.send(
            `[PIPELINE][ERROR] Commit check error: ${error.message}`,
          );
        }
      }

      steps.sort(
        (a: any, b: any) =>
          Number(a.step_order || 0) - Number(b.step_order || 0),
      );

      const baseEnv: any = { ...process.env, ...(envOverrides || {}) };
      if (!("REPO_PATH" in baseEnv)) {
        baseEnv.REPO_PATH = workingDir;
      }

      const resolvedEnv = { ...baseEnv };
      for (const [k, v] of Object.entries(envMap)) {
        let val = String(v);
        val = val.replace(/\$\{([^}]+)\}/g, (_, name) => {
          const repl = resolvedEnv[name] ?? "";
          return String(repl);
        });
        resolvedEnv[k] = val;
      }

      buildLogger.send(`[PIPELINE] Start: ${pipelineName}`);
      buildLogger.send(`[PIPELINE] Working dir: ${workingDir}`);

      const defaultShell = resolveShell();
      let hadError = false;
      let failureReason = "";

      try {
        if (!fs.existsSync(workingDir))
          fs.mkdirSync(workingDir, { recursive: true });
      } catch (e) {
        buildLogger.send(
          `[PIPELINE][WARN] Cannot create working dir: ${workingDir} (${e.message})`,
        );
      }

      for (const step of steps) {
        const name =
          step.step_name || step.step_id || `Step ${step.step_order}`;
        const cmd = step.step_exec;
        const timeoutMs =
          typeof step.timeout_seconds === "number"
            ? step.timeout_seconds * 1000
            : undefined;
        const ignoreFailure =
          !!step.ignore_failure ||
          String(step.on_fail || "").toLowerCase() === "continue";
        const stepShell = step.shell || defaultShell;

        buildLogger.send(`[STEP ${step.step_order ?? "?"}] ${name}`);
        buildLogger.send(`[STEP][EXEC] ${cmd}`);

        const { error, stdout, stderr } = await run(cmd, buildLogger, {
          env: resolvedEnv,
          cwd: workingDir,
          shell: stepShell,
          timeout: timeoutMs,
        });

        if (stdout) buildLogger.send(`[STEP][STDOUT] ${stdout.trim()}`);
        if (stderr) buildLogger.send(`[STEP][STDERR] ${stderr.trim()}`);
        if (error) {
          hadError = true;
          const msg = error.message || "unknown error";
          failureReason = `Step '${name}' failed: ${msg}`;
          buildLogger.send(`[STEP][ERROR] ${msg}`);
          if (!ignoreFailure) {
            buildLogger.send(`[PIPELINE] Stop due to error in step: ${name}`);
            break;
          } else {
            buildLogger.send(`[PIPELINE] Ignoring failure and continuing`);
          }
        }
      }

      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      historyManager.updateHistory(buildId, {
        status: hadError ? "failed" : "success",
        endTime,
        duration,
        commitHash: commitHash || null,
        jobId: job.id || null,
      });

      buildLogger.send(
        `[PIPELINE] Completed: ${pipelineName} (hadError=${hadError})`,
      );
      logStream.end();
      return { ok: !hadError, buildId, failureReason };
    } catch (error) {
      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      historyManager.updateHistory(buildId, {
        status: "failed",
        endTime,
        duration,
        error: error.message,
        commitHash: commitHash || null,
        jobId: job.id || null,
      });
      buildLogger.send(`[PIPELINE] Error: ${error.message}`);
      logStream.end();
      throw error;
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

