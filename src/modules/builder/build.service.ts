import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { LoggerService } from "../../shared/logger/logger.service";
import { DockerService } from "./docker.service";
import { GitService } from "./git.service";
import { run, resolveShell } from "../../common/utils/exec.util";
import * as path from "path";
import * as fs from "fs";
import { ScriptBuildStrategy } from "./strategies/script.strategy";
import { DockerBuildStrategy } from "./strategies/docker.strategy";
import { PipelineBuildStrategy } from "./strategies/pipeline.strategy";
import { BuildContext, HistoryManager } from "./strategies/build-strategy.interface";

@Injectable()
export class BuildService implements HistoryManager {
  private buildLogsDir: string;
  private buildHistoryFile: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly dockerService: DockerService,
    private readonly gitService: GitService,
    private readonly scriptStrategy: ScriptBuildStrategy,
    private readonly dockerStrategy: DockerBuildStrategy,
    private readonly pipelineStrategy: PipelineBuildStrategy,
  ) {
    this.buildLogsDir = path.join(process.cwd(), "build-logs");
    this.buildHistoryFile = path.join(process.cwd(), "build-history.json");
    if (!fs.existsSync(this.buildLogsDir)) {
      fs.mkdirSync(this.buildLogsDir, { recursive: true });
    }
  }

  async executeJobBuild(job: any, metadata: any = {}): Promise<any> {
    this.logger.send(`[JOB] job: ${JSON.stringify(job.name)}`);

    try {
      console.log(`[JOB] Starting build for job: ${job.name} (${job.id})`);

      const gc = job.gitConfig || {};
      const cfg = await this.configService.getConfig();

      const branchesToProcess = [];
      if (gc.branch) branchesToProcess.push({ name: gc.branch, enabled: true });
      if (Array.isArray(gc.branches)) {
        gc.branches.forEach((b: any) => {
          if (b.enabled && b.name) branchesToProcess.push(b);
        });
      }
      if (branchesToProcess.length === 0)
        branchesToProcess.push({ name: "main", enabled: true });

      let baseContext =
        cfg.contextInitPath || cfg.deployContextCustomPath || "";
      if (!baseContext) {
        const legacyRepoPath = cfg.repoPath || gc.repoPath || "";
        baseContext = legacyRepoPath
          ? path.dirname(legacyRepoPath)
          : process.cwd();
      }

      const katalystRoot = path.join(baseContext, "Katalyst");
      const repoPath = path.join(katalystRoot, "repo");
      const builderRoot = path.join(katalystRoot, "builder");

      fs.mkdirSync(repoPath, { recursive: true });
      fs.mkdirSync(builderRoot, { recursive: true });

      let jobBuilderDir = "";
      if ((job.buildConfig?.method || "dockerfile") === "script") {
        const safeName = String(job.name || "")
          .replace(/[^a-z0-9_-]+/gi, "-")
          .toLowerCase();
        jobBuilderDir = path.join(builderRoot, `${safeName}-${job.id}`);
        try {
          fs.mkdirSync(jobBuilderDir, { recursive: true });
        } catch (_) {}
      }

      const repoUrl = gc.repoUrl;
      const token = gc.token;
      const provider = gc.provider || "gitlab";

      let actualRepoPath = "";
      let hasNewCommit = false;
      let lastCommitHash: string | null = null;

      if (metadata.skipGitCheck) {
        hasNewCommit = true;
        lastCommitHash = metadata.commitHash;
        actualRepoPath = path.join(
          repoPath,
          this._extractRepoNameFromUrl(repoUrl),
        );

        const pullResult = await this.gitService.checkNewCommitAndPull({
          repoPath: actualRepoPath,
          branch: metadata.branch || gc.branch,
          repoUrl,
          token,
          provider,
          doPull: true,
        });

        if (!pullResult.ok) throw new Error(`Pull failed: ${pullResult.error}`);
      } else {
        for (const branchConfig of branchesToProcess) {
          const branch = branchConfig.name;
          actualRepoPath = path.join(
            repoPath,
            this._extractRepoNameFromUrl(repoUrl),
          );

          if (!fs.existsSync(path.join(actualRepoPath, ".git"))) {
            fs.mkdirSync(actualRepoPath, { recursive: true });
            await run(`git clone ${repoUrl} "${actualRepoPath}"`, this.logger);
          }

          const check = await this.gitService.checkNewCommitAndPull({
            repoPath: actualRepoPath,
            branch,
            repoUrl,
            token,
            provider,
            doPull: true,
          });

          if (check.ok && check.hasNew) {
            hasNewCommit = true;
            lastCommitHash = check.remoteHash;
            break;
          }
        }
      }

      if (!hasNewCommit) {
        return { success: true, status: "skipped", message: "No new commit" };
      }

      const context: BuildContext = {
        job,
        repoPath: actualRepoPath,
        commitHash: lastCommitHash,
        jobBuilderDir,
        buildLogsDir: this.buildLogsDir,
        env: {},
      };

      let buildResult;
      if (job.buildConfig.method === "script") {
        const r = await this.scriptStrategy.execute(context, this);
        buildResult = {
          buildId: r.buildId,
          status: r.status,
          message: r.message,
        };
      } else if (job.buildConfig.method === "dockerfile") {
        const r = await this.dockerStrategy.execute(context, this);
        buildResult = {
          buildId: r.buildId,
          status: r.status,
          message: r.message,
        };
      } else if (job.buildConfig.method === "jsonfile") {
        const r = await this.pipelineStrategy.execute(context, this);
        buildResult = {
          buildId: r.buildId,
          status: r.ok ? "completed" : "failed",
          message: r.ok ? "Pipeline completed" : "Pipeline failed",
        };
      } else {
          throw new Error(`Unknown build method: ${job.buildConfig.method}`);
      }

      return {
        success: buildResult.status === "completed",
        buildId: buildResult.buildId,
        status: buildResult.status,
        message: buildResult.message,
        commitHash: lastCommitHash,
      };
    } catch (error) {
      this.logger.send(`[JOB] Build failed: ${error.message}`);
      return { success: false, status: "failed", message: error.message };
    }
  }

  private _extractRepoNameFromUrl(repoUrl: string): string {
    if (!repoUrl) return "unknown-repo";
    let name = repoUrl.replace(/\.git$/, "");
    const parts = name.split("/");
    name = parts[parts.length - 1];
    return name.replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  getBuildHistory(): any[] {
    try {
      if (fs.existsSync(this.buildHistoryFile)) {
        const data = fs.readFileSync(this.buildHistoryFile, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Error reading build history:", error);
    }
    return [];
  }

  addHistory(buildRecord: any) {
    this.addBuildHistory(buildRecord);
  }

  updateHistory(buildId: string, updates: any) {
    this.updateBuildHistory(buildId, updates);
  }

  addBuildHistory(buildRecord: any) {
    const history = this.getBuildHistory();
    history.unshift(buildRecord);
    if (history.length > 100) history.splice(100);
    this.saveBuildHistory(history);
  }

  updateBuildHistory(buildId: string, updates: any) {
    const history = this.getBuildHistory();
    const index = history.findIndex((build: any) => build.id === buildId);
    if (index !== -1) {
      history[index] = { ...history[index], ...updates };
      this.saveBuildHistory(history);
    }
  }

  saveBuildHistory(history: any[]) {
    try {
      fs.writeFileSync(this.buildHistoryFile, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error("Error saving build history:", error);
    }
  }

  async list() {
    try {
      const buildsPath = path.join(process.cwd(), "builds.json");
      if (fs.existsSync(buildsPath)) {
        const content = fs.readFileSync(buildsPath, "utf8");
        return JSON.parse(content);
      }
    } catch (e) {
      console.error("Error reading builds.json", e);
    }
    return [];
  }
}
