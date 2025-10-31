const { run } = require('../utils/exec');

class GitService {
  constructor({ logger, dockerService, configService }) {
    this.logger = logger;
    this.dockerService = dockerService;
    this.configService = configService;
    this._building = false; // tránh chạy build trùng lặp
  }

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

  async checkAndBuild({ repoPath, branch }) {
    if (!repoPath) throw new Error('Chưa cấu hình repoPath');
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

    // Guard: nếu đang build thì bỏ qua lượt này
    if (this._building) {
      this.logger?.send('[CHECK] Bỏ qua vì một phiên build đang chạy.');
      return { ok: true, updated: false, reason: 'building_in_progress' };
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
    this._building = true;
    await run(pullCmd, this.logger);

    // build docker sau khi pull
    const dockerCfg = (cfg.docker || {});
    const result = await this.dockerService.buildAndPush({
      dockerfilePath: dockerCfg.dockerfilePath,
      contextPath: dockerCfg.contextPath || repoPath,
      imageName: dockerCfg.imageName || 'app',
      imageTag: dockerCfg.imageTag || 'latest',
      registryUrl: dockerCfg.registryUrl,
      registryUsername: dockerCfg.registryUsername,
      registryPassword: dockerCfg.registryPassword,
      autoTagIncrement: dockerCfg.autoTagIncrement,
    });

    // auto deploy swarm nếu bật
    if (dockerCfg.autoDeploySwarm && !result.hadError && dockerCfg.composePath && dockerCfg.stackName) {
      const { SwarmService } = require('./SwarmService');
      const swarm = new SwarmService({ logger: this.logger });
      await swarm.deploy({ composePath: dockerCfg.composePath, stackName: dockerCfg.stackName });
    } else if (dockerCfg.autoDeploySwarm && !dockerCfg.composePath) {
      this.logger?.send('[SWARM][WARN] autoDeploySwarm bật nhưng thiếu composePath');
    } else if (dockerCfg.autoDeploySwarm && !dockerCfg.stackName) {
      this.logger?.send('[SWARM][WARN] autoDeploySwarm bật nhưng thiếu stackName');
    }

    // Sau khi build thành công, cập nhật commit đã build để tránh trùng lặp
    try {
      if (!result.hadError && remoteHash) {
        const newCfg = this.configService.getConfig();
        newCfg.lastBuiltCommit = remoteHash;
        this.configService.setConfig(newCfg);
        this.logger?.send(`[CHECK] Đánh dấu commit đã build: ${remoteHash}`);
      }
    } finally {
      this._building = false;
    }

    return { ok: true, updated: !result.hadError };
  }
}

module.exports = { GitService };