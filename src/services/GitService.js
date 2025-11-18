const { run } = require('../utils/exec');
const { nextTag, nextTagWithConfig,nextSplitTag, splitTagIntoParts } = require('../utils/tag');

/**
 * GitService - Service quản lý Git operations
 * Hỗ trợ check connection, fetch, pull, và trigger build khi có commit mới
 * @class
 */
class GitService {
  /**
   * Tạo GitService instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.logger - Logger instance
   * @param {Object} deps.dockerService - DockerService instance
   * @param {Object} deps.configService - ConfigService instance
   */
  constructor({ logger, dockerService, configService }) {
    this.logger = logger;
    this.dockerService = dockerService;
    this.configService = configService;
    this._buildPromise = null; // Promise của build hiện tại
    this._currentBranch = null; // Branch đang được build
  }

  /**
   * Kiểm tra kết nối Git repository
   * @async
   * @returns {Promise<Object>} Kết quả kiểm tra
   * @returns {boolean} return.ok - True nếu kết nối thành công
   * @returns {string} return.hash - Commit hash của HEAD
   * @throws {Error} Nếu kết nối thất bại
   */
  async checkConnection() {
    const cfg = this.configService.getConfig();
    const repoUrl = String(cfg.repoUrl || '');
    const provider = String(cfg.provider || 'gitlab').toLowerCase();
    const token = String(cfg.token || '');
    if (!repoUrl) throw new Error('Chưa cấu hình repoUrl');
    const useHttpsAuth = !!token && /^https?:\/\//.test(repoUrl);
    let authConfig = '';
    if (useHttpsAuth) {
      const user = provider === 'github' ? 'x-access-token' : 'oauth2';
      const basic = Buffer.from(`${user}:${token}`).toString('base64');
      authConfig = `-c http.extraHeader=\"Authorization: Basic ${basic}\"`;
    }
    const cmd = `git ${authConfig} ls-remote ${repoUrl} HEAD`;
    this.logger?.send(`[GIT][CHECK] > ${cmd}`);
    const { error, stdout, stderr } = await require('../utils/exec').run(cmd, this.logger);
    if (error) {
      const msg = stderr || error.message;
      throw new Error(`Kiểm tra kết nối thất bại: ${msg}`);
    }
    const line = (stdout || '').trim().split('\n').find(Boolean) || '';
    const hash = line.split('\t')[0] || '';
    return { ok: true, hash };
  }

  /**
   * Kiểm tra commit mới và build nếu có update
   * @async
   * @param {Object} params - Parameters
   * @param {string} params.repoPath - Đường dẫn repo local
   * @param {string} params.branch - Branch name
   * @returns {Promise<Object>} Kết quả build
   * @returns {boolean} return.ok - True nếu thành công
   * @returns {boolean} return.updated - True nếu có commit mới và đã build
   * @returns {string} [return.reason] - Lý do không build (nếu có)
   */
  async checkAndBuild({ repoPath, branch }) {
    if (!repoPath) throw new Error('Chưa cấu hình repoPath');
    
    // Nếu đang có build chạy, bỏ qua build request này
    if (this._buildPromise) {
      this.logger?.send(`[BUILD] Build đang chạy cho branch ${this._currentBranch || 'unknown'}, bỏ qua request mới cho branch ${branch}.`);
      return { ok: true, updated: false, reason: 'build_in_progress' };
    }

    // Lưu thông tin build hiện tại
    this._currentBranch = branch;
    this.logger?.send(`[BUILD] Bắt đầu build cho branch ${branch}, repo: ${repoPath}`);
    
    // Tạo promise mới cho build hiện tại
    this._buildPromise = this._executeBuild({ repoPath, branch });
    
    try {
      const result = await this._buildPromise;
      this.logger?.send(`[BUILD] Hoàn thành build cho branch ${branch}. Kết quả: ${result.updated ? 'thành công' : 'không có thay đổi'}`);
      return result;
    } finally {
      this._buildPromise = null;
      this._currentBranch = null;
    }
  }

  /**
   * Thực thi build (internal method)
   * @async
   * @private
   * @param {Object} params - Parameters
   * @param {string} params.repoPath - Đường dẫn repo local
   * @param {string} params.branch - Branch name
   * @returns {Promise<Object>} Kết quả build
   */
  async _executeBuild({ repoPath, branch }) {
    const cfg = this.configService.getConfig();
    const token = cfg?.token;
    const repoUrl = cfg?.repoUrl || '';
    const useHttpsAuth = !!token && /^https?:\/\//.test(String(repoUrl));
    let authConfig = '';
    if (useHttpsAuth) {
      try {
        const basic = Buffer.from(`oauth2:${token}`).toString('base64');
        authConfig = `-c http.extraHeader=\"Authorization: Basic ${basic}\"`;
        this.logger?.send('[GIT] Sử dụng HTTPS với PAT (Authorization: Basic) cho thao tác fetch/pull');
      } catch (e) {
        this.logger?.send(`[GIT][WARN] Không tạo được header Authorization: ${e.message}`);
      }
    }

    const cmds = [
      `git -C "${repoPath}" ${authConfig} fetch origin`,
      `git -C "${repoPath}" ${authConfig} ls-remote --heads origin ${branch}`,
      `git -C "${repoPath}" rev-parse HEAD`,
    ];
    this.logger?.send(`[CHECK] Kiểm tra commit mới cho branch ${branch}`);
    const r0 = await run(cmds[0], this.logger);
    if (r0.error) throw new Error('fetch failed');
    const r1 = await run(cmds[1], this.logger);
    if (r1.error) throw new Error('ls-remote failed');
    const remoteLine = (r1.stdout || '').trim().split('\n').find(Boolean) || '';
    const remoteHash = remoteLine.split('\t')[0] || '';
    this.logger?.send(`[CHECK] Remote ${branch} hash: ${remoteHash || '(không tìm thấy)'}`);
    const r2 = await run(cmds[2], this.logger);
    if (r2.error) throw new Error('rev-parse failed');
    const localHash = (r2.stdout || '').trim();
    this.logger?.send(`[CHECK] Local HEAD hash: ${localHash}`);
    // Nếu remote rỗng hoặc trùng local => không có commit mới
    if (!remoteHash || remoteHash === localHash) {
      this.logger?.send(`[CHECK] Không có commit mới. Bỏ qua pull & build.`);
      return { ok: true, updated: false };
    }

    // Nếu remote trùng với commit đã build trước đó => bỏ qua để tránh build lại cùng commit
    const lastBuilt = String(cfg.lastBuiltCommit || '');
    if (remoteHash && lastBuilt && remoteHash === lastBuilt) {
      this.logger?.send(`[CHECK] Commit ${remoteHash} đã được build trước đó. Bỏ qua.`);
      return { ok: true, updated: false };
    }

    const pullCmd = `git -C "${repoPath}" ${authConfig} pull origin ${branch}`;
    this.logger?.send(`[PULL] > ${pullCmd}`);
    const pullRes = await run(pullCmd, this.logger);
    if (pullRes.error) {
      this.logger?.send('[PULL][WARN] Pull thất bại hoặc phân kỳ branch. Thử reset --hard về origin để đồng bộ build server.');
      const resetCmd = `git -C "${repoPath}" reset --hard origin/${branch}`;
      this.logger?.send(`[RESET] > ${resetCmd}`);
      const resetRes = await run(resetCmd, this.logger);
      if (resetRes.error) {
        this.logger?.send(`[RESET][ERROR] ${resetRes.error.message}`);
        throw new Error('reset failed');
      } else {
        this.logger?.send('[RESET] Đã reset về origin thành công. Tiếp tục quy trình build.');
      }
    }

    // Chọn phương thức build: dockerfile hoặc script
    const dockerCfg = (cfg.docker || {});
    let result = { hadError: false };
    if ((cfg.buildMethod || 'dockerfile') === 'script') {
      const pathLib = require('path');
      const fs = require('fs');
      const projectRoot = pathLib.join(__dirname, '../../');
      let deployPathCandidate = cfg.deployScriptPath || pathLib.join(projectRoot, 'deploy.sh');
      if (!pathLib.isAbsolute(deployPathCandidate)) {
        deployPathCandidate = pathLib.join(projectRoot, deployPathCandidate);
      }
      if (!fs.existsSync(deployPathCandidate)) {
        this.logger?.send(`[DEPLOY][ERROR] deploy.sh không tồn tại tại: ${deployPathCandidate}`);
        throw new Error('deploy.sh not found');
      }
      const toPosix = (p) => {
        if (!p) return p;
        let s = String(p).replace(/\\/g, '/');
        if (/^[A-Za-z]:\//.test(s)) { const drive = s[0].toLowerCase(); s = `/${drive}${s.slice(2)}`; }
        return s;
      };
      // Xác định danh sách CHOICE cần build (cho phép nhiều lựa chọn)
      const choicesArr = (() => {
        const arr = Array.isArray(cfg.deployChoices) ? cfg.deployChoices : [];
        const clean = (arr || []).map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0);
        if (clean.length) return clean;
        const one = Number(cfg.deployChoice || 0);
        return one > 0 ? [one] : [];
      })();
      if (!choicesArr.length) {
        this.logger?.send('[DEPLOY][WARN] Không có CHOICE nào được cấu hình. Script có thể yêu cầu CHOICE.');
      }

      // Xác định nguồn Context để build theo yêu cầu người dùng
      let effectiveContext = repoPath;
      const src = String(cfg.deployContextSource || 'repo');
      if (src === 'config') {
        effectiveContext = dockerCfg.contextPath || repoPath;
      } else if (src === 'custom') {
        effectiveContext = cfg.deployContextCustomPath || dockerCfg.contextPath || repoPath;
      }
      // Sử dụng chính xác đường dẫn Dockerfile mà người dùng cấu hình (không fallback)
      const effectiveDockerfile = dockerCfg.dockerfilePath;
      const posixPath = toPosix(deployPathCandidate);

      // Chạy tuần tự cho từng CHOICE (nếu có)
      for (const ch of (choicesArr.length ? choicesArr : [undefined])) {
        // Tính toán tag cho script build với hệ thống chia 2 phần
        let scriptImageTag = cfg.scriptImageTag || 'latest';
        if (cfg.scriptAutoTagIncrement) {
          // Sử dụng hệ thống tag chia 2 phần mới
          const { numberPart, textPart } = splitTagIntoParts(scriptImageTag);
          this.logger?.send(`[DEPLOY] 🏷️  Tách tag thành: số="${numberPart}", chữ="${textPart}"`);
          
          scriptImageTag = nextSplitTag(numberPart, textPart, true);
          this.logger?.send(`[DEPLOY] 🔄 Auto increment script tag từ "${cfg.scriptImageTag || 'latest'}" thành "${scriptImageTag}"`);
          
          // Cập nhật tag mới vào config
          this.configService.updateConfig({ scriptImageTag });
        }
        
        const env = {
          CONTINUE_BUILD: 'y',
          PUSH_IMAGE: dockerCfg.registryUrl ? 'y' : 'n',
        };
        if (ch) env.CHOICE = String(ch);
        if (scriptImageTag) env.DOCKER_IMAGE_TAG = scriptImageTag;
        if (effectiveDockerfile) env.DOCKERFILE_PATH = toPosix(effectiveDockerfile);
        if (effectiveContext) env.CONTEXT_PATH = toPosix(effectiveContext);
        if (cfg.repoPath) env.REPO_PATH = toPosix(cfg.repoPath);
        env.CONFIG_JSON_PATH = toPosix(pathLib.join(projectRoot, 'config.json'));

        this.logger?.send(`[DEPLOY] 🚀 Chuẩn bị chạy deploy.sh`);
        this.logger?.send(`[DEPLOY] 📁 Script path: ${posixPath}`);
        this.logger?.send(`[DEPLOY] 🏷️  Choice: ${ch ?? 'N/A'}`);
        this.logger?.send(`[DEPLOY] 📂 Context path: ${effectiveContext}`);
        this.logger?.send(`[DEPLOY] 🐳 Dockerfile path: ${effectiveDockerfile}`);
        this.logger?.send(`[DEPLOY] 🏗️  Image tag: ${scriptImageTag || 'N/A'}`);
        this.logger?.send(`[DEPLOY] 🌐 Registry URL: ${dockerCfg.registryUrl || 'N/A'}`);
        
        this.logger?.send(`[DEPLOY] 🔧 Thực thi lệnh: bash "${posixPath}"`);
        const r = await run(`bash "${posixPath}"`, this.logger, { cwd: projectRoot, env });
        
        if (r.error) {
          this.logger?.send(`[DEPLOY][ERROR] ❌ Deploy script thất bại!`);
          this.logger?.send(`[DEPLOY][ERROR] 📝 Error message: ${r.error.message}`);
          if (r.stderr) {
            this.logger?.send(`[DEPLOY][ERROR] 📝 Stderr: ${r.stderr}`);
          }
          if (r.stderr) this.logger?.send(`[DEPLOY][STDERR] ${String(r.stderr).trim()}`);
          try { this.configService.appendBuildRun({ method: 'deploy.sh', env, hadError: true }); } catch (_) {}
          result.hadError = true;
        } else {
          if (r.stdout) this.logger?.send(`[DEPLOY][STDOUT] ${String(r.stdout).trim()}`);
          this.logger?.send('[DEPLOY] Hoàn tất deploy.sh (check-and-build)');
          try { this.configService.appendBuildRun({ method: 'deploy.sh', env, hadError: false }); } catch (_) {}
          // Không đặt hadError=true khi thành công lần này
        }
      }
    } else {
      // build docker sau khi pull
      result = await this.dockerService.buildAndPush({
        dockerfilePath: dockerCfg.dockerfilePath,
        contextPath: dockerCfg.contextPath || repoPath,
        imageName: dockerCfg.imageName || 'app',
        imageTag: dockerCfg.imageTag || 'latest',
        registryUrl: dockerCfg.registryUrl,
        registryUsername: dockerCfg.registryUsername,
        registryPassword: dockerCfg.registryPassword,
        autoTagIncrement: dockerCfg.autoTagIncrement,
        commitHash: remoteHash,
      });
    }

    // Sau khi build thành công, cập nhật commit đã build để tránh trùng lặp
    if (!result.hadError && remoteHash) {
      const newCfg = this.configService.getConfig();
      newCfg.lastBuiltCommit = remoteHash;
      this.configService.setConfig(newCfg);
      this.logger?.send(`[CHECK] Đánh dấu commit đã build: ${remoteHash}`);
    }

    return { ok: true, updated: !result.hadError };
  }

  /**
   * Simple check for new commits for a specific repoPath/branch and optionally perform pull.
   * This does NOT rely on global configService buildMethod and can be used by JobController.
   *
   * Returns: { ok, hasNew, remoteHash, localHash, updated }
   */
  async checkNewCommitAndPull({ repoPath, branch, repoUrl, token, provider, doPull = true }) {
    if (!repoPath) throw new Error('Chưa cấu hình repoPath');
    
    // Kiểm tra xem thư mục repo có tồn tại không
    try {
      await fs.access(repoPath);
    } catch (error) {
      this.logger?.send(`[GIT][JOB-CHECK][WARN] Thư mục repo không tồn tại: ${repoPath}`);
      return { ok: false, hasNew: false, error: 'repo_not_exists', message: `Thư mục repo không tồn tại: ${repoPath}` };
    }
    const cfg = this.configService.getConfig();
    const effectiveToken = typeof token === 'string' ? token : cfg?.token;
    const effectiveRepoUrl = typeof repoUrl === 'string' ? repoUrl : cfg?.repoUrl || '';
    const effectiveProvider = String(provider || cfg?.provider || 'gitlab').toLowerCase();

    const useHttpsAuth = !!effectiveToken && /^https?:\/\//.test(String(effectiveRepoUrl));
    let authConfig = '';
    let authUrl = effectiveRepoUrl;
    
    if (useHttpsAuth) {
      try {
        // Sử dụng URL với token embedded thay vì header Authorization
        // Định dạng: https://oauth2:TOKEN@gitlab.techres.vn/...
        const urlObj = new URL(effectiveRepoUrl);
        urlObj.username = 'oauth2';
        urlObj.password = effectiveToken;
        authUrl = urlObj.toString();
        this.logger?.send('[GIT] Sử dụng HTTPS với token embedded trong URL cho thao tác fetch/pull');
      } catch (e) {
        this.logger?.send(`[GIT][WARN] Không tạo được URL với token: ${e.message}`);
        // Fallback to header method
        const basic = Buffer.from((effectiveProvider === 'github' ? 'x-access-token' : 'oauth2') + ':' + effectiveToken).toString('base64');
        authConfig = `-c http.extraHeader=\"Authorization: Basic ${basic}\"`;
        this.logger?.send('[GIT] Fallback: Sử dụng HTTPS với PAT (Authorization: Basic)');
      }
    }

    // Fetch and compare remote vs local
    this.logger?.send(`[GIT][JOB-CHECK] Kiểm tra commit mới cho branch ${branch} tại repoPath: ${repoPath}`);
    const r0 = await run(`git -C "${repoPath}" ${authConfig} fetch ${authUrl}`, this.logger);
    if (r0.error) return { ok: false, hasNew: false, error: 'fetch_failed', stderr: r0.stderr };

    const r1 = await run(`git -C "${repoPath}" ${authConfig} ls-remote --heads ${authUrl} ${branch}`, this.logger);
    if (r1.error) return { ok: false, hasNew: false, error: 'ls_remote_failed', stderr: r1.stderr };
    const remoteLine = (r1.stdout || '').trim().split('\n').find(Boolean) || '';
    const remoteHash = remoteLine.split('\t')[0] || '';
    this.logger?.send(`[GIT][JOB-CHECK] Remote ${branch} hash: ${remoteHash || '(không tìm thấy)'}`);

    let commitMessage = '';
    if (remoteHash) {
      const logCmd = `git -C "${repoPath}" log --format=%B -n 1 ${remoteHash}`;
      const logRes = await run(logCmd, this.logger);
      if (!logRes.error) {
        commitMessage = (logRes.stdout || '').trim();
      }
    }

    const r2 = await run(`git -C "${repoPath}" rev-parse HEAD`, this.logger);
    if (r2.error) return { ok: false, hasNew: false, error: 'rev_parse_failed', stderr: r2.stderr };
    const localHash = (r2.stdout || '').trim();
    this.logger?.send(`[GIT][JOB-CHECK] Local HEAD hash: ${localHash}`);

    if (!remoteHash || remoteHash === localHash) {
      this.logger?.send('[GIT][JOB-CHECK] Không có commit mới, bỏ qua pull/build.');
      return { ok: true, hasNew: false, remoteHash, localHash, updated: false, commitMessage };
    }

    if (!doPull) {
      return { ok: true, hasNew: true, remoteHash, localHash, updated: false, commitMessage };
    }

    // Pull changes
    const pullRes = await run(`git -C "${repoPath}" ${authConfig} pull ${authUrl} ${branch}`, this.logger);
    if (pullRes.error) {
      this.logger?.send('[GIT][JOB-PULL][WARN] Pull thất bại hoặc phân kỳ branch. Thử reset --hard về origin để đồng bộ.');
      const resetRes = await run(`git -C "${repoPath}" reset --hard origin/${branch}`, this.logger);
      if (resetRes.error) {
        this.logger?.send(`[GIT][JOB-RESET][ERROR] ${resetRes.error.message}`);
        return { ok: false, hasNew: true, remoteHash, localHash, updated: false, error: 'reset_failed', stderr: resetRes.stderr };
      }
      this.logger?.send('[GIT][JOB-RESET] Đã reset về origin thành công.');
    }

    // After pull/reset, mark updated
    return { ok: true, hasNew: true, remoteHash, localHash, updated: true, commitMessage };
  }
}

module.exports = { GitService };