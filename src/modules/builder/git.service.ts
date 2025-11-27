import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { LoggerService } from "../../shared/logger/logger.service";
import { DockerService } from "./docker.service";
import { run } from "../../common/utils/exec.util";
import { pathExists, normalizePathForOS } from "../../common/utils/file.util";
import * as path from "path";
import * as fs from "fs";

@Injectable()
export class GitService {
  private _buildPromise: Promise<any> | null = null;
  private _currentBranch: string | null = null;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly dockerService: DockerService,
  ) {}

  async checkConnection() {
    const cfg = await this.configService.getConfig();
    const repoUrl = String(cfg.repoUrl || "");
    const provider = String(cfg.provider || "gitlab").toLowerCase();
    const token = String(cfg.token || "");
    if (!repoUrl) throw new Error("RepoUrl not configured");

    const useHttpsAuth = !!token && /^https?:\/\//.test(repoUrl);
    let authConfig = "";
    if (useHttpsAuth) {
      const user = provider === "github" ? "x-access-token" : "oauth2";
      const basic = Buffer.from(`${user}:${token}`).toString("base64");
      authConfig = `-c http.extraHeader="Authorization: Basic ${basic}"`;
    }
    const cmd = `git ${authConfig} ls-remote ${repoUrl} HEAD`;
    const { error, stdout, stderr } = await run(cmd, this.logger);
    if (error) {
      const msg = stderr || error.message;
      throw new Error(`Connection check failed: ${msg}`);
    }
    const line = (stdout || "").trim().split("\n").find(Boolean) || "";
    const hash = line.split("\t")[0] || "";
    return { ok: true, hash };
  }

  // ... (implement other methods like checkNewCommitAndPull, etc.)
  // Due to length, I'll implement core methods needed for now.

  async checkNewCommitAndPull({
    repoPath,
    branch,
    repoUrl,
    token,
    provider,
    doPull = true,
  }: any) {
    if (!repoPath) {
      return { ok: false, hasNew: false, error: "repo_not_configured" };
    }

    const normalizedRepoPath = normalizePathForOS(repoPath);
    const exists = await pathExists(normalizedRepoPath);
    if (!exists) {
      return { ok: false, hasNew: false, error: "repo_not_exists" };
    }

    repoPath = normalizedRepoPath;
    const cfg = await this.configService.getConfig();
    const effectiveToken = typeof token === "string" ? token : cfg?.token;
    const effectiveRepoUrl =
      typeof repoUrl === "string" ? repoUrl : cfg?.repoUrl || "";
    const effectiveProvider = String(
      provider || cfg?.provider || "gitlab",
    ).toLowerCase();

    const useHttpsAuth =
      !!effectiveToken && /^https?:\/\//.test(String(effectiveRepoUrl));
    let authConfig = "";
    let authUrl = effectiveRepoUrl;

    if (useHttpsAuth) {
      try {
        const urlObj = new URL(effectiveRepoUrl);
        urlObj.username = "oauth2";
        urlObj.password = effectiveToken;
        authUrl = urlObj.toString();
      } catch (e) {
        const basic = Buffer.from(
          (effectiveProvider === "github" ? "x-access-token" : "oauth2") +
            ":" +
            effectiveToken,
        ).toString("base64");
        authConfig = `-c http.extraHeader="Authorization: Basic ${basic}"`;
      }
    }

    const r0 = await run(
      `git -C "${repoPath}" ${authConfig} fetch ${authUrl}`,
      this.logger,
    );
    if (r0.error)
      return {
        ok: false,
        hasNew: false,
        error: "fetch_failed",
        stderr: r0.stderr,
      };

    const r1 = await run(
      `git -C "${repoPath}" ${authConfig} ls-remote --heads ${authUrl} ${branch}`,
      this.logger,
    );
    if (r1.error)
      return {
        ok: false,
        hasNew: false,
        error: "ls_remote_failed",
        stderr: r1.stderr,
      };

    const remoteLine = (r1.stdout || "").trim().split("\n").find(Boolean) || "";
    const remoteHash = remoteLine.split("\t")[0] || "";

    if (!remoteHash) {
      return { ok: false, hasNew: false, error: "branch_not_found" };
    }

    let commitMessage = "";
    if (remoteHash) {
      const logCmd = `git -C "${repoPath}" log --format=%B -n 1 ${remoteHash}`;
      const logRes = await run(logCmd, this.logger);
      if (!logRes.error) {
        commitMessage = (logRes.stdout || "").trim();
      }
    }

    const r2 = await run(`git -C "${repoPath}" rev-parse HEAD`, this.logger);
    if (r2.error)
      return {
        ok: false,
        hasNew: false,
        error: "rev_parse_failed",
        stderr: r2.stderr,
      };
    const localHash = (r2.stdout || "").trim();

    if (!remoteHash || remoteHash === localHash) {
      return {
        ok: true,
        hasNew: false,
        remoteHash,
        localHash,
        updated: false,
        commitMessage,
      };
    }

    if (!doPull) {
      return {
        ok: true,
        hasNew: true,
        remoteHash,
        localHash,
        updated: false,
        commitMessage,
      };
    }

    const pullRes = await run(
      `git -C "${repoPath}" ${authConfig} pull ${authUrl} ${branch}`,
      this.logger,
    );
    if (pullRes.error) {
      const resetRes = await run(
        `git -C "${repoPath}" reset --hard origin/${branch}`,
        this.logger,
      );
      if (resetRes.error) {
        return {
          ok: false,
          hasNew: true,
          remoteHash,
          localHash,
          updated: false,
          error: "reset_failed",
          stderr: resetRes.stderr,
        };
      }
    } else {
      await run(`git -C "${repoPath}" reset --hard ${remoteHash}`, this.logger);
    }

    return {
      ok: true,
      hasNew: true,
      remoteHash,
      localHash,
      updated: true,
      commitMessage,
    };
  }
}
