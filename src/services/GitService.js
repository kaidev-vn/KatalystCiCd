const { run } = require('../utils/exec');
const { nextTag, nextTagWithConfig, nextSplitTag, splitTagIntoParts } = require('../utils/tag');
const { pathExists, normalizePathForOS } = require('../utils/file');

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
   * Validate Git repository - kiểm tra repository không bị corrupt
   * @async
   * @private
   * @param {string} repoPath - Đường dẫn repository
   * @throws {Error} Nếu repository bị corrupt hoặc không hợp lệ
   */
  async _validateGitRepository(repoPath) {
    // Kiểm tra thư mục repository tồn tại
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository directory does not exist: ${repoPath}`);
    }

    // Kiểm tra có phải là Git repository
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error(`Not a Git repository: ${repoPath}`);
    }

    // Kiểm tra Git repository integrity
    const integrityCheck = await run(`git -C "${repoPath}" fsck --full --strict`, this.logger);
    if (integrityCheck.error) {
      throw new Error(`Git repository corrupt: ${integrityCheck.stderr || integrityCheck.error.message}`);
    }

    // Kiểm tra object database
    const objectCheck = await run(`git -C "${repoPath}" cat-file -t HEAD`, this.logger);
    if (objectCheck.error) {
      throw new Error(`Git object database corrupt: ${objectCheck.stderr || objectCheck.error.message}`);
    }

    this.logger?.send(`[GIT][VALIDATION] Repository validation passed: ${repoPath}`);
  }

  /**
   * Lấy build history từ storage
   * @async
   * @private
   * @returns {Promise<Array>} Danh sách build history
   */
  async _getBuildHistory() {
    try {
      const fs = require('fs');
      const path = require('path');
      const buildHistoryPath = path.join(__dirname, '../../build-history.json');

      if (fs.existsSync(buildHistoryPath)) {
        const content = fs.readFileSync(buildHistoryPath, 'utf8');
        return JSON.parse(content || '[]');
      }
      return [];
    } catch (error) {
      this.logger?.send(`[GIT][WARN] Không thể đọc build history: ${error.message}`);
      return [];
    }
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

    // VALIDATION: Chỉ kiểm tra repository nếu có build history (tránh check không cần thiết)
    const buildHistory = await this._getBuildHistory();
    if (buildHistory && buildHistory.length > 0) {
      try {
        await this._validateGitRepository(repoPath);
      } catch (error) {
        this.logger?.send(`[GIT][VALIDATION-ERROR] Repository validation failed: ${error.message}`);
        throw new Error(`Git repository corrupt or invalid: ${error.message}`);
      }
    } else {
      this.logger?.send('[GIT][VALIDATION] Build history rỗng, bỏ qua repository validation');
    }
    // Additional validation: Check if commit hash exists locally before building
    // MOVED TO checkNewCommitAndPull METHOD TO CATCH POLLING TRIGGERS

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

    // VALIDATION: Check if commit hash exists locally - AFTER FETCH/PULL
    // Validation này sẽ được thực hiện SAU KHI fetch/pull thành công
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

    // VALIDATION: Check if commit hash exists locally AFTER fetch/pull
    if (remoteHash) {
      try {
        await run(`git -C "${repoPath}" cat-file -t ${remoteHash}`, this.logger);
        this.logger?.send(`[GIT][VALIDATION] Commit ${remoteHash} tồn tại trong repository`);
      } catch (error) {
        throw new Error(`Commit ${remoteHash} không tồn tại trong repository local sau khi fetch - cần manual intervention: ${error.message}`);
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
          try { this.configService.appendBuildRun({ method: 'deploy.sh', env, hadError: true }); } catch (_) { }
          result.hadError = true;
        } else {
          if (r.stdout) this.logger?.send(`[DEPLOY][STDOUT] ${String(r.stdout).trim()}`);
          this.logger?.send('[DEPLOY] Hoàn tất deploy.sh (check-and-build)');
          try { this.configService.appendBuildRun({ method: 'deploy.sh', env, hadError: false }); } catch (_) { }
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
    this.logger?.send(`[GIT][JOB-CHECK][WARN] input  repoPath : ${repoPath}`);
    if (!repoPath) {
      this.logger?.send(`[GIT][JOB-CHECK][WARN] Chưa cấu hình repoPath cho branch ${branch}`);
      return { ok: false, hasNew: false, error: 'repo_not_configured', message: `Chưa cấu hình repoPath cho branch ${branch}` };
    }

    // Kiểm tra xem thư mục repo có tồn tại không
    // Chuẩn hóa đường dẫn cho hệ điều hành hiện tại
    const normalizedRepoPath = normalizePathForOS(repoPath);

    // Kiểm tra xem đường dẫn có tồn tại không
    const exists = await pathExists(normalizedRepoPath);
    if (!exists) {
      this.logger?.send(`[GIT][JOB-CHECK][WARN] Thư mục repo không tồn tại: ${normalizedRepoPath} (original: ${repoPath})`);
      return { ok: false, hasNew: false, error: 'repo_not_exists', message: `Thư mục repo không tồn tại: ${normalizedRepoPath}` };
    }

    // Sử dụng đường dẫn đã chuẩn hóa cho các thao tác tiếp theo
    repoPath = normalizedRepoPath;
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

    // Nếu không tìm thấy branch trên remote, không thể kiểm tra commit mới
    if (!remoteHash) {
      this.logger?.send(`[GIT][JOB-CHECK][WARN] Không tìm thấy branch ${branch} trên remote. Không thể kiểm tra commit mới.`);
      return { ok: false, hasNew: false, error: 'branch_not_found', message: `Không tìm thấy branch ${branch} trên remote` };
    }

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
    } else {
      // Sau khi pull thành công, đảm bảo local branch trỏ chính xác đến commit mới
      // Bằng cách reset hard về commit remoteHash để đảm bảo đồng bộ hoàn toàn
      const resetRes = await run(`git -C "${repoPath}" reset --hard ${remoteHash}`, this.logger);
      if (resetRes.error) {
        this.logger?.send(`[GIT][JOB-RESET][WARN] Reset về commit ${remoteHash} thất bại: ${resetRes.error.message}`);
      } else {
        this.logger?.send(`[GIT][JOB-RESET] Đã reset về commit mới: ${remoteHash}`);
      }
    }

    // After pull/reset, mark updated
    return { ok: true, hasNew: true, remoteHash, localHash, updated: true, commitMessage };
  }

  /**
   * Tạo auth config string cho Git commands
   * @private
   * @param {Object} params - Parameters
   * @param {string} params.token - Git token
   * @param {string} params.provider - Git provider
   * @returns {string} Auth config string
   */
  _getAuthConfig({ token, provider }) {
    if (!token) return '';

    const effectiveProvider = String(provider || 'gitlab').toLowerCase();
    const user = effectiveProvider === 'github' ? 'x-access-token' : 'oauth2';
    const basic = Buffer.from(`${user}:${token}`).toString('base64');
    // Không sử dụng -c option cho ls-remote vì không được hỗ trợ
    return ''; // ls-remote không hỗ trợ -c option, sử dụng auth URL thay thế
  }

  /**
   * Tạo auth URL với token embedded
   * @private
   * @param {Object} params - Parameters
   * @param {string} params.repoUrl - Repository URL
   * @param {string} params.token - Git token
   * @param {string} params.provider - Git provider
   * @returns {string} Auth URL với token embedded
   */
  _getAuthUrl({ repoUrl, token, provider }) {
    if (!token || !/^https?:\/\//.test(String(repoUrl))) {
      return repoUrl;
    }

    try {
      const urlObj = new URL(repoUrl);
      const effectiveProvider = String(provider || 'gitlab').toLowerCase();
      urlObj.username = effectiveProvider === 'github' ? 'x-access-token' : 'oauth2';
      urlObj.password = token;
      return urlObj.toString();
    } catch (e) {
      this.logger?.send(`[GIT][WARN] Không tạo được auth URL: ${e.message}`);
      return repoUrl;
    }
  }

  /**
   * Lấy commit hash mới nhất từ remote repository (không kiểm tra local)
   * Tránh lỗi "bad object" bằng cách không sử dụng local repository
   */
  async getLatestRemoteCommit({ repoUrl, branch, token, provider }) {
    this.logger?.send(`[GIT][REMOTE-ONLY] Lấy commit hash từ remote: ${repoUrl}, branch: ${branch}`);

    // Chuẩn bị auth config
    const authConfig = this._getAuthConfig({ token, provider });
    const authUrl = this._getAuthUrl({ repoUrl, token, provider });

    try {
      // Sử dụng ls-remote để lấy commit hash từ remote mà không cần local repo
      const cmd = `git ls-remote ${authConfig} ${authUrl} ${branch}`;
      this.logger?.send(`[GIT][REMOTE-ONLY] > ${cmd}`);

      const result = await run(cmd, this.logger);
      if (result.error) {
        this.logger?.send(`[GIT][REMOTE-ONLY][ERROR] Lỗi khi lấy remote commit: ${result.stderr}`);
        return { ok: false, error: 'ls_remote_failed', stderr: result.stderr };
      }

      const remoteLine = (result.stdout || '').trim().split('\n').find(Boolean) || '';
      const remoteHash = remoteLine.split('\t')[0] || '';

      if (!remoteHash) {
        this.logger?.send(`[GIT][REMOTE-ONLY] Không tìm thấy commit hash cho branch ${branch}`);
        return { ok: false, error: 'no_commit_found' };
      }

      this.logger?.send(`[GIT][REMOTE-ONLY] Remote commit hash: ${remoteHash}`);
      return { ok: true, remoteHash };

    } catch (error) {
      this.logger?.send(`[GIT][REMOTE-ONLY][ERROR] Exception khi lấy remote commit: ${error.message}`);
      return { ok: false, error: 'exception', message: error.message };
    }
  }

  /**
   * Kiểm tra commit mới bằng cách so sánh với commit đã lưu trong jobs.json
   * Tránh hoàn toàn việc sử dụng local repository để tránh lỗi "bad object"
   */
  async checkNewCommitUsingJobStorage({ repoUrl, branch, token, provider, jobId }) {
    this.logger?.send(`[GIT][JOB-STORAGE] Kiểm tra commit mới cho job ${jobId}, branch: ${branch}`);

    if (!jobId) {
      this.logger?.send('[GIT][JOB-STORAGE][ERROR] Thiếu jobId');
      return { ok: false, error: 'job_id_required' };
    }

    try {
      // Lấy commit hash mới nhất từ remote
      const remoteResult = await this.getLatestRemoteCommit({ repoUrl, branch, token, provider });
      if (!remoteResult.ok) {
        return remoteResult;
      }

      const remoteHash = remoteResult.remoteHash;

      // Đọc jobs.json để lấy commit hash đã build trước đó
      const fs = require('fs');
      const jobsData = JSON.parse(fs.readFileSync('jobs.json', 'utf8'));
      const job = jobsData.find(j => j.id === jobId);

      if (!job) {
        this.logger?.send(`[GIT][JOB-STORAGE][ERROR] Không tìm thấy job với id: ${jobId}`);
        return { ok: false, error: 'job_not_found' };
      }

      const lastCommitHash = job.stats?.lastCommitHash || null;

      this.logger?.send(`[GIT][JOB-STORAGE] Remote: ${remoteHash}, Last built: ${lastCommitHash || '(chưa build)'}`);

      // So sánh commit hash
      if (!lastCommitHash) {
        // Chưa từng build, coi như có commit mới
        this.logger?.send('[GIT][JOB-STORAGE] Chưa từng build, coi như có commit mới');
        return {
          ok: true,
          hasNew: true,
          remoteHash,
          updated: false,
          reason: 'first_build'
        };
      }

      if (remoteHash === lastCommitHash) {
        // Commit trùng nhau, không có commit mới
        this.logger?.send('[GIT][JOB-STORAGE] Không có commit mới');
        return {
          ok: true,
          hasNew: false,
          remoteHash,
          updated: false,
          reason: 'no_new_commit'
        };
      }

      // Có commit mới
      this.logger?.send('[GIT][JOB-STORAGE] Phát hiện commit mới');
      return {
        ok: true,
        hasNew: true,
        remoteHash,
        updated: false,
        reason: 'new_commit_found'
      };

    } catch (error) {
      this.logger?.send(`[GIT][JOB-STORAGE][ERROR] Exception: ${error.message}`);
      return { ok: false, error: 'exception', message: error.message };
    }
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
  async checkMonolithCondition({ repoPath, commitHash, changePaths, repoUrl = '', token = '', provider = 'gitlab' }) {
    if (!repoPath || !commitHash || !Array.isArray(changePaths) || changePaths.length === 0) {
      return { hasRelevantChanges: true, changedFiles: [] };
    }

    try {
      // ========================================
      // ✅ BƯỚC 1: Kiểm tra commit có tồn tại trong local không
      // ========================================
      // const checkCommitCmd = `git -C "${repoPath}" cat-file -t ${commitHash}`;
      // const checkCommitResult = await run(checkCommitCmd, this.logger);

      // if (checkCommitResult.error) {
      //   this.logger?.send(`[GIT][MONOLITH-CHECK] Commit ${commitHash} chưa có trong local, thực hiện FETCH từ remote...`);
        
      //   // ========================================
      //   // ✅ BƯỚC 2: FETCH toàn bộ từ remote về (không thể fetch commit hash trực tiếp)
      //   // ========================================
      //   if (repoUrl) {
      //     const authUrl = this._getAuthUrl({ repoUrl, token, provider });
      //     // ✅ Fetch toàn bộ từ remote (hoặc có thể fetch branch cụ thể nếu biết branch)
      //     // Git không hỗ trợ fetch commit hash trực tiếp, cần fetch branch/refs
      //     const fetchCmd = `git -C "${repoPath}" fetch ${authUrl}`;
      //     this.logger?.send(`[GIT][MONOLITH-CHECK] > git fetch origin (để lấy commit: ${commitHash.substring(0, 8)}...)`);
          
      //     const fetchResult = await run(fetchCmd, this.logger);
          
      //     if (fetchResult.error) {
      //       this.logger?.send(`[GIT][MONOLITH-CHECK] ❌ Không thể fetch từ remote: ${fetchResult.stderr || fetchResult.error.message}`);
      //       // Fallback: cho phép build nếu không fetch được
      //       return { hasRelevantChanges: true, changedFiles: [], error: 'fetch_failed' };
      //     }
          
      //     this.logger?.send(`[GIT][MONOLITH-CHECK] ✅ Đã fetch từ remote thành công`);
          
      //     // Kiểm tra lại xem commit đã có chưa sau khi fetch
      //     const recheckResult = await run(`git -C "${repoPath}" cat-file -t ${commitHash}`, this.logger);
      //     if (recheckResult.error) {
      //       this.logger?.send(`[GIT][MONOLITH-CHECK] ⚠️ Commit ${commitHash} vẫn không tồn tại sau khi fetch. Có thể commit đã bị xóa hoặc force-push.`);
      //       // Fallback: cho phép build để không chặn workflow
      //       return { hasRelevantChanges: true, changedFiles: [], error: 'commit_not_found_after_fetch' };
      //     }
      //   } else {
      //     this.logger?.send(`[GIT][MONOLITH-CHECK] ❌ Không có thông tin repoUrl để fetch commit`);
      //     // Fallback: cho phép build nếu không có repoUrl
      //     return { hasRelevantChanges: true, changedFiles: [], error: 'no_repo_url' };
      //   }
      // } else {
      //   this.logger?.send(`[GIT][MONOLITH-CHECK] ✅ Commit ${commitHash} đã tồn tại trong local`);
      // }

      // ========================================
      // ✅ BƯỚC 3: Lấy danh sách files đã thay đổi
      // ========================================
      // Sử dụng lệnh git diff để lấy danh sách modules đã thay đổi
      // git diff --name-only HEAD^ HEAD | cut -d '/' -f1 | sort -u
      const cmd = `git -C "${repoPath}" diff --name-only ${commitHash}^ ${commitHash} | cut -d '/' -f1 | sort -u`;

      console.log(`git -C "${repoPath}" diff --name-only ${commitHash}^ ${commitHash} | cut -d '/' -f1 | sort -u`);

      const { error, stdout } = await run(cmd, this.logger);

      this.logger?.send(`[GIT][MONOLITH-CHECK] > ${stdout} : ${error}`);
      if (error) {
        this.logger?.send(`[GIT][MONOLITH-CHECK] Lỗi khi lấy danh sách modules: ${error.message}`);
        return { hasRelevantChanges: true, changedFiles: [] }; // Fallback: cho phép build nếu có lỗi
      }

      const changedModules = stdout.trim().split('\n').filter(Boolean);
      this.logger?.send(`[GIT][MONOLITH-CHECK] Modules changed in commit ${commitHash}: ${changedModules.join(', ')}`);

      // Kiểm tra xem có module nào phù hợp với changePaths không
      const hasRelevantChanges = changedModules.some(module => {
        return changePaths.some(path => {
          // Kiểm tra nếu module khớp với đường dẫn được chỉ định
          // Hoặc nếu đường dẫn là prefix của module
          return module === path || module.startsWith(path);
        });
      });

      this.logger?.send(`[GIT][MONOLITH-CHECK] Has relevant changes for monolith: ${hasRelevantChanges}`);
      return { hasRelevantChanges, changedFiles: changedModules };
    } catch (error) {
      this.logger?.send(`[GIT][MONOLITH-CHECK] Lỗi khi kiểm tra monolith condition: ${error.message}`);
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
    monolithConfig = { module: '', changePath: [] },
    doPull = true
  }) {
    // Đầu tiên kiểm tra commit mới như bình thường
    const checkResult = await this.checkNewCommitAndPull({
      repoPath,
      branch,
      repoUrl,
      token,
      provider,
      doPull: false // Không pull ngay, chỉ kiểm tra
    });

    console.log(`[GIT][MONOLITH] checkResult: ${JSON.stringify(checkResult)}`);
    console.log(`[GIT][MONOLITH] monolith: ${monolith}`);
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
          doPull: true
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
      changePaths: changePath
    });
    console.log(`[GIT][MONOLITH] monolithCheck: ${JSON.stringify(monolithCheck)}`);
    // Xử lý trường hợp commit không tồn tại
    if (monolithCheck.error === 'commit_not_found') {
      this.logger?.send(`[GIT][MONOLITH] Commit ${checkResult.remoteHash} không tồn tại, dừng build: ${monolithCheck.errorMessage}`);
      return {
        ok: false,
        hasNew: false,
        remoteHash: checkResult.remoteHash,
        localHash: checkResult.localHash,
        updated: false,
        commitMessage: checkResult.commitMessage,
        error: 'commit_not_found',
        stderr: monolithCheck.errorMessage
      };
    }

    if (!monolithCheck.hasRelevantChanges) {
      this.logger?.send(`[GIT][MONOLITH] Commit ${checkResult.remoteHash} không có thay đổi phù hợp với monolith condition, bỏ qua build`);
      return {
        ok: true,
        hasNew: false, // Đánh dấu là không có commit mới phù hợp
        hasRelevantChanges: false, // Thêm thuộc tính này để JobController có thể kiểm tra
        remoteHash: checkResult.remoteHash,
        localHash: checkResult.localHash,
        updated: false,
        commitMessage: checkResult.commitMessage,
        monolithSkipped: true,
        reason: 'no_relevant_changes_for_monolith'
      };
    }

    this.logger?.send(`[GIT][MONOLITH] Commit ${checkResult.remoteHash} có thay đổi phù hợp với monolith condition, tiếp tục build`);

    if (doPull) {
      // Thực hiện pull nếu được yêu cầu
      const pullResult = await this.checkNewCommitAndPull({
        repoPath,
        branch,
        repoUrl,
        token,
        provider,
        doPull: true
      });
      return { ...pullResult, monolithChecked: true, hasRelevantChanges: true };
    }

    return { ...checkResult, monolithChecked: true, hasRelevantChanges: true };
  }
}

module.exports = { GitService };