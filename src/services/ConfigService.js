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
      // Lựa chọn cho deploy.sh (hỗ trợ nhiều lựa chọn)
      deployChoice: 0, // giữ để tương thích ngược
      deployChoices: [],
      // Chọn nguồn context khi chạy deploy.sh tự động
      // repo: dùng repoPath; config: dùng docker.contextPath; custom: dùng deployContextCustomPath
      deployContextSource: 'repo',
      deployContextCustomPath: '',
      deploySwarmEnabled: false,
      deploySwarmNodeConstraints: 'node.labels.purpose == api',
      deploySwarmTemplate: 'docker-compose.yml',
      deployServices: [
        {
          name: "harbor.techres.vn/overatevntech/admin-schedule-service",
          imageName: "java-daihy-admin-schedule",
          port: "8009",
          grpcPort: "9097",
          serviceFile: "net.techres.admin.schedule.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/admin-service",
          imageName: "java-daihy-admin",
          port: "8088",
          grpcPort: "9093",
          serviceFile: "net.techres.admin.api.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/aloline-service",
          imageName: "java-daihy-aloline",
          port: "8082",
          grpcPort: "9098",
          serviceFile: "net.techres.aloline.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/oauth-service",
          imageName: "java-daihy-oauth",
          port: "8888",
          grpcPort: "1050",
          serviceFile: "net.techres.oauth.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/order-service-process-one",
          imageName: "java-daihy-order-process-one",
          port: "8197",
          grpcPort: "9091",
          serviceFile: "net.techres.order.api.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/order-service-process-three",
          imageName: "java-daihy-order",
          port: "8097",
          grpcPort: "8105",
          serviceFile: "net.techres.order.api.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/schedule-service",
          imageName: "java-daihy-shedule",
          port: "8008",
          grpcPort: "8106",
          serviceFile: "net.techres.schedule.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/supplier-service",
          imageName: "java-daihy-supplier",
          port: "8087",
          grpcPort: "9094",
          serviceFile: "net.techres.supplier.api.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/seemt-service",
          imageName: "java-daihy-seemt",
          port: "8093",
          grpcPort: "1053",
          serviceFile: "net.techres.tms.api.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/kafka-restaurant-schedule-service",
          imageName: "java-daihy-kafka-schedule",
          port: "8100",
          grpcPort: "8109",
          serviceFile: "net.techres.kafka_restaurant_schedule.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/kafka-techres-admin-schedule-service",
          imageName: "java-daihy-kafka-techres-admin-schedule",
          port: "8101",
          grpcPort: "9101",
          serviceFile: "net.techres.kafka_techres_admin_schedule.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/restaurant-dashboard-service",
          imageName: "java-daihy-seemt-dashboard",
          port: "8095",
          grpcPort: "1055",
          serviceFile: "net.techres.restaurant_dashboard.api.jar"
        },
        {
          name: "harbor.techres.vn/overatevntech/springdoc-service",
          imageName: "java-daihy-springdoc-service",
          port: "8099",
          grpcPort: "8112",
          serviceFile: "net.techres.springdoc.jar"
        }
      ],
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
    cfg.deployChoice = Number(cfg.deployChoice || 0);
    // Chuẩn hóa deployChoices (mảng số nguyên duy nhất > 0)
    const arr = Array.isArray(cfg.deployChoices) ? cfg.deployChoices : [];
    const set = new Set((arr || []).map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0));
    cfg.deployChoices = Array.from(set);
    const dcs = String(cfg.deployContextSource || 'repo').toLowerCase();
    cfg.deployContextSource = ['repo', 'config', 'custom'].includes(dcs) ? dcs : 'repo';
    cfg.deployContextCustomPath = String(cfg.deployContextCustomPath || '');
    cfg.deployServices = Array.isArray(cfg.deployServices) ? cfg.deployServices : this.getDefaultConfig().deployServices;
    cfg.deploySwarmEnabled = Boolean(cfg.deploySwarmEnabled);
    cfg.deploySwarmNodeConstraints = String(cfg.deploySwarmNodeConstraints || 'node.labels.purpose == api');
    cfg.deploySwarmTemplate = String(cfg.deploySwarmTemplate || 'docker-compose.yml');
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