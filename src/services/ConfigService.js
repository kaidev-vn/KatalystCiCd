const path = require('path');
const { readJson, writeJson } = require('../utils/file');

class ConfigService {
  constructor({ dataDir, logger }) {
    this.logger = logger;
    this.paths = {
      CONFIG_PATH: path.join(dataDir, 'config.json'),
      BUILDS_PATH: path.join(dataDir, 'builds.json'),
      HISTORY_PATH: path.join(dataDir, 'builds_history.json'),
      CONFIG_VERSIONS_DIR: path.join(dataDir, 'config_versions'),
      BUILDS_VERSIONS_DIR: path.join(dataDir, 'builds_versions'),
    };
  }

  getDefaultConfig() {
    return {
      provider: 'gitlab',
      account: '',
      token: '',
      polling: 30,
      repoUrl: '',
      repoPath: '',
      branch: 'main',
      deployScriptPath: '',
      buildMethod: 'dockerfile',
      lastBuiltCommit: '',
      autoCheck: false,
      docker: {
        dockerfilePath: '',
        contextPath: '',
        imageName: '',
        imageTag: 'latest',
        autoTagIncrement: false,
        autoDeploySwarm: false,
        registryUrl: '',
        registryUsername: '',
        registryPassword: '',
        composePath: '',
        stackName: '',
      },
    };
  }

  getConfig() {
    return readJson(this.paths.CONFIG_PATH, this.getDefaultConfig());
  }

  setConfig(cfg) {
    // normalize
    const provider = String(cfg.provider || 'gitlab').toLowerCase();
    cfg.provider = ['gitlab', 'github'].includes(provider) ? provider : 'gitlab';
    cfg.account = String(cfg.account || '');
    cfg.token = String(cfg.token || '');
    cfg.polling = Number(cfg.polling || 30);
    cfg.repoUrl = String(cfg.repoUrl || '');
    cfg.repoPath = String(cfg.repoPath || '');
    cfg.branch = String(cfg.branch || 'main');
    cfg.deployScriptPath = String(cfg.deployScriptPath || '');
    const bm = String(cfg.buildMethod || 'dockerfile').toLowerCase();
    cfg.buildMethod = ['dockerfile', 'deploy_sh'].includes(bm) ? bm : 'dockerfile';
    cfg.lastBuiltCommit = String(cfg.lastBuiltCommit || '');
    cfg.autoCheck = Boolean(cfg.autoCheck);
    cfg.docker = {
      dockerfilePath: String(cfg.docker?.dockerfilePath || ''),
      contextPath: String(cfg.docker?.contextPath || ''),
      imageName: String(cfg.docker?.imageName || ''),
      imageTag: String(cfg.docker?.imageTag || 'latest'),
      autoTagIncrement: Boolean(cfg.docker?.autoTagIncrement),
      autoDeploySwarm: Boolean(cfg.docker?.autoDeploySwarm),
      registryUrl: String(cfg.docker?.registryUrl || ''),
      registryUsername: String(cfg.docker?.registryUsername || ''),
      registryPassword: String(cfg.docker?.registryPassword || ''),
      composePath: String(cfg.docker?.composePath || ''),
      stackName: String(cfg.docker?.stackName || ''),
    };
    writeJson(this.paths.CONFIG_PATH, cfg);
    this.saveVersion('config', cfg);
    return cfg;
  }

  listConfigVersions() {
    const fs = require('fs');
    try {
      return fs.readdirSync(this.paths.CONFIG_VERSIONS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ file: f, path: path.join('config_versions', f) }));
    } catch (e) {
      return [];
    }
  }

  rollbackConfig(file) {
    const fs = require('fs');
    const abs = path.join(this.paths.CONFIG_VERSIONS_DIR, path.basename(file));
    const content = JSON.parse(fs.readFileSync(abs, 'utf8'));
    writeJson(this.paths.CONFIG_PATH, content.data);
    if (this.logger) this.logger.send(`[VERSION] Rollback cấu hình về phiên bản ${path.basename(file)}`);
    return content.data;
  }

  getBuilds() {
    return readJson(this.paths.BUILDS_PATH, []);
  }
  saveBuilds(list) {
    writeJson(this.paths.BUILDS_PATH, list);
    this.saveVersion('builds', list);
  }
  // Build run history
  listBuildHistory() {
    return readJson(this.paths.HISTORY_PATH, []);
  }
  appendBuildRun(item) {
    try {
      const fs = require('fs');
      const { timestamp } = require('../utils/file');
      const runItem = { ts: timestamp(), ...(item || {}) };
      let list = [];
      try { list = JSON.parse(fs.readFileSync(this.paths.HISTORY_PATH, 'utf8')); } catch (_) { list = []; }
      list.push(runItem);
      // Cắt bớt nếu quá dài (giữ 500 bản ghi gần nhất)
      if (list.length > 500) list = list.slice(list.length - 500);
      fs.writeFileSync(this.paths.HISTORY_PATH, JSON.stringify(list, null, 2), 'utf8');
      if (this.logger) this.logger.send(`[HISTORY] Lưu bản ghi build (${runItem.method || 'unknown'}) lúc ${runItem.ts}`);
      return runItem;
    } catch (e) {
      // ignore
      return null;
    }
  }
  listBuildVersions() {
    const fs = require('fs');
    try {
      return fs.readdirSync(this.paths.BUILDS_VERSIONS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ file: f, path: path.join('builds_versions', f) }));
    } catch (e) {
      return [];
    }
  }

  saveVersion(kind, data) {
    const fs = require('fs');
    const { timestamp } = require('../utils/file');
    const ts = timestamp();
    const dir = kind === 'config' ? this.paths.CONFIG_VERSIONS_DIR : this.paths.BUILDS_VERSIONS_DIR;
    try {
      fs.writeFileSync(path.join(dir, `${kind}-${ts}.json`), JSON.stringify({ ts, data }, null, 2), 'utf8');
      if (this.logger) this.logger.send(`[VERSION] Lưu phiên bản ${kind} lúc ${ts}`);
    } catch (e) {
      // ignore
    }
  }
}

module.exports = { ConfigService };