const { run, runSeries } = require('../utils/exec');
const { nextTag, nextTagWithConfig, nextSplitTag, splitTagIntoParts } = require('../utils/tag');

class DockerService {
  constructor({ logger, configService }) {
    this.logger = logger;
    this.configService = configService;
  }

  async buildAndPush(params) {
    const cfg = this.configService.getConfig();
    const p = { ...cfg.docker, ...(params || {}) };
    
    let tagToUse;
    if (p.autoTagIncrement) {
      // Sử dụng hệ thống tag chia 2 phần mới
      const currentTag = cfg.docker?.imageTag || p.imageTag || 'latest';
      const { numberPart, textPart } = splitTagIntoParts(currentTag);
      this.logger?.send(`[DOCKER] 🏷️  Tách tag thành: số="${numberPart}", chữ="${textPart}"`);
      
      tagToUse = nextSplitTag(numberPart, textPart, true);
      this.logger?.send(`[DOCKER] 🔄 Auto increment tag từ "${currentTag}" thành "${tagToUse}"`);
    } else {
      tagToUse = p.imageTag || cfg.docker?.imageTag || 'latest';
    }
    
    const image = `${p.imageName}:${tagToUse}`;
    this.logger?.send(`[DOCKER] Bắt đầu build image: ${image}`);
    const cmds = [];
    if (p.registryUrl && p.registryUsername && p.registryPassword) {
      cmds.push(`docker login ${p.registryUrl} -u ${p.registryUsername} -p ${p.registryPassword}`);
    }
    const buildCmd = p.dockerfilePath
      ? `docker build -f "${p.dockerfilePath}" -t ${image} "${p.contextPath || '.'}"`
      : `docker build -t ${image} "${p.contextPath || '.'}"`;
    cmds.push(buildCmd);
    if (p.registryUrl) cmds.push(`docker push ${image}`);

    const { hadError } = await runSeries(cmds, this.logger);
    this.logger?.send(`[DOCKER] Hoàn tất build & push cho ${image}`);

    if (p.autoTagIncrement && !hadError) {
      const newCfg = this.configService.getConfig();
      if (!newCfg.docker) newCfg.docker = {};
      newCfg.docker.imageTag = tagToUse;
      this.configService.setConfig(newCfg);
      this.logger?.send(`[DOCKER] Đã cập nhật imageTag trong config thành ${tagToUse}`);
    }

    // Lưu lịch sử build
    try {
      this.configService.appendBuildRun({
        method: 'dockerfile',
        image,
        tag: tagToUse,
        contextPath: p.contextPath || '.',
        dockerfilePath: p.dockerfilePath || '',
        hadError,
        commitHash: p.commitHash || '',
      });
    } catch (_) {}

    return { image, tagToUse, hadError };
  }
}

module.exports = { DockerService };