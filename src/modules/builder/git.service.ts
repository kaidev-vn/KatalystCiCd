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

  /**
   * Kiểm tra xem commit có chứa thay đổi phù hợp với monolith condition không
   * @async
   * @param {Object} params - Parameters
   * @param {string} params.repoPath - Đường dẫn repo local
   * @param {string} params.commitHash - Commit hash để kiểm tra
   * @param {Array<string>} params.changePaths - Danh sách đường dẫn cần kiểm tra
   * @returns {Promise<Object>} Kết quả kiểm tra
   * @returns {boolean} return.hasRelevantChanges - True nếu có thay đổi phù hợp
   * @returns {Array<string>} return.changedFiles - Danh sách files đã thay đổi
   */
  async checkMonolithCondition({
    repoPath,
    commitHash,
    changePaths,
  }: {
    repoPath: string;
    commitHash: string;
    changePaths: string[];
  }) {
    if (
      !repoPath ||
      !commitHash ||
      !Array.isArray(changePaths) ||
      changePaths.length === 0
    ) {
      return { hasRelevantChanges: true, changedFiles: [] };
    }

    try {
      // Lấy danh sách files đã thay đổi
      // Sử dụng lệnh git diff để lấy danh sách modules đã thay đổi
      // git diff --name-only HEAD^ HEAD | cut -d '/' -f1 | sort -u
      const cmd = `git -C "${repoPath}" diff --name-only HEAD^ HEAD | cut -d '/' -f1 | sort -u`;

      const { error, stdout } = await run(cmd, this.logger);

      this.logger.send(
        `[GIT][MONOLITH-CHECK] > ${stdout} : ${error || "ok"}`,
      );
      if (error) {
        this.logger.send(
          `[GIT][MONOLITH-CHECK] Lỗi khi lấy danh sách modules: ${error.message}`,
        );
        return { hasRelevantChanges: true, changedFiles: [] }; // Fallback: cho phép build nếu có lỗi
      }

      const changedModules = stdout.trim().split("\n").filter(Boolean);
      this.logger.send(
        `[GIT][MONOLITH-CHECK] Modules changed in commit ${commitHash}: ${changedModules.join(", ")}`,
      );

      // Kiểm tra xem có module nào phù hợp với changePaths không
      const hasRelevantChanges = changedModules.some((module) => {
        return changePaths.some((path) => {
          // Kiểm tra nếu module khớp với đường dẫn được chỉ định
          // Hoặc nếu đường dẫn là prefix của module
          return module === path || module.startsWith(path);
        });
      });

      this.logger.send(
        `[GIT][MONOLITH-CHECK] Has relevant changes for monolith: ${hasRelevantChanges}`,
      );
      return { hasRelevantChanges, changedFiles: changedModules };
    } catch (error) {
      this.logger.send(
        `[GIT][MONOLITH-CHECK] Lỗi khi kiểm tra monolith condition: ${error.message}`,
      );
      throw error; // Re-throw lỗi để xử lý ở cấp cao hơn
    }
  }

  /**
   * Kiểm tra commit mới với monolith condition
   * @async
   * @param {Object} params - Parameters
   * @param {string} params.repoPath - Đường dẫn repo local
   * @param {string} params.branch - Branch name
   * @param {string} params.repoUrl - Repository URL
   * @param {string} params.token - Git token
   * @param {string} params.provider - Git provider
   * @param {boolean} params.monolith - Có phải monolith job không
   * @param {Object} params.monolithConfig - Cấu hình monolith
   * @param {string} params.monolithConfig.module - Tên module
   * @param {Array<string>} params.monolithConfig.changePath - Danh sách đường dẫn cần kiểm tra
   * @param {boolean} params.doPull - Có thực hiện pull không
   * @returns {Promise<Object>} Kết quả kiểm tra
   */
  async checkNewCommitAndPullWithMonolith({
    repoPath,
    branch,
    repoUrl,
    token,
    provider,
    monolith = false,
    monolithConfig = { module: "", changePath: [] },
    doPull = true,
  }: any) {
    // Đầu tiên kiểm tra commit mới như bình thường
    const checkResult = await this.checkNewCommitAndPull({
      repoPath,
      branch,
      repoUrl,
      token,
      provider,
      doPull: false,
    });

    if (!checkResult.ok || !checkResult.hasNew) {
      return checkResult;
    }

    // Nếu không phải monolith job, trả về kết quả bình thường
    if (!monolith) {
      if (doPull) {
        // Thực hiện pull nếu được yêu cầu
        const pullResult = await this.checkNewCommitAndPull({
          repoPath,
          branch,
          repoUrl,
          token,
          provider,
          doPull: true,
        });
        return pullResult;
      }
      return checkResult;
    }

    // Kiểm tra monolith condition
    const { changePath = [] } = monolithConfig;
    let monolithCheck;

    monolithCheck = await this.checkMonolithCondition({
      repoPath,
      commitHash: checkResult.remoteHash,
      changePaths: changePath,
    });

    // Xử lý trường hợp commit không tồn tại
    if (monolithCheck.error === "commit_not_found") {
      this.logger.send(
        `[GIT][MONOLITH] Commit ${checkResult.remoteHash} không tồn tại, dừng build: ${monolithCheck.errorMessage}`,
      );
      return {
        ok: false,
        hasNew: false,
        remoteHash: checkResult.remoteHash,
        localHash: checkResult.localHash,
        updated: false,
        commitMessage: checkResult.commitMessage,
        error: "commit_not_found",
        stderr: monolithCheck.errorMessage,
      };
    }

    if (!monolithCheck.hasRelevantChanges) {
      this.logger.send(
        `[GIT][MONOLITH] Commit ${checkResult.remoteHash} không có thay đổi phù hợp với monolith condition, bỏ qua build`,
      );
      return {
        ok: true,
        hasNew: false, // Đánh dấu là không có commit mới phù hợp
        hasRelevantChanges: false, // Thêm thuộc tính này để có thể kiểm tra
        remoteHash: checkResult.remoteHash,
        localHash: checkResult.localHash,
        updated: false,
        commitMessage: checkResult.commitMessage,
        monolithSkipped: true,
        reason: "no_relevant_changes_for_monolith",
      };
    }

    this.logger.send(
      `[GIT][MONOLITH] Commit ${checkResult.remoteHash} có thay đổi phù hợp với monolith condition, tiếp tục build`,
    );

    if (doPull) {
      // Thực hiện pull nếu được yêu cầu
      const pullResult = await this.checkNewCommitAndPull({
        repoPath,
        branch,
        repoUrl,
        token,
        provider,
        doPull: true,
      });
      return { ...pullResult, monolithChecked: true, hasRelevantChanges: true };
    }

    return { ...checkResult, monolithChecked: true, hasRelevantChanges: true };
  }
}
