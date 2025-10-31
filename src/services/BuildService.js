const { runSeries } = require('../utils/exec');

class BuildService {
  constructor({ logger, configService }) {
    this.logger = logger;
    this.configService = configService;
  }

  list() {
    const builds = this.configService.getBuilds();
    return Array.isArray(builds) ? builds : [];
  }

  add({ name, env, steps }) {
    const list = this.list();
    const id = (() => {
      const ts = Date.now().toString(36);
      const rnd = Math.random().toString(36).slice(2, 8);
      return `${ts}-${rnd}`;
    })();
    const item = {
      id,
      name: name || `Build ${new Date().toISOString()}`,
      env: env || {},
      steps: Array.isArray(steps) ? steps : [],
    };
    list.push(item);
    this.configService.saveBuilds(list);
    this.logger?.send(`[BUILD] Đã thêm build: ${item.name}`);
    return item;
  }

  update(id, { name, env, steps }) {
    const list = this.list();
    const idx = list.findIndex(b => b.id === id);
    if (idx < 0) throw new Error('Không tìm thấy build');
    const it = list[idx];
    if (typeof name !== 'undefined') it.name = name;
    if (typeof env !== 'undefined') it.env = env;
    if (typeof steps !== 'undefined') it.steps = steps;
    this.configService.saveBuilds(list);
    this.logger?.send(`[BUILD] Đã cập nhật build: ${it.name}`);
    return it;
  }

  remove(id) {
    const list = this.list();
    const idx = list.findIndex(b => b.id === id);
    if (idx < 0) return false;
    const [removed] = list.splice(idx, 1);
    this.configService.saveBuilds(list);
    this.logger?.send(`[BUILD] Đã xóa build: ${removed?.name || id}`);
    return true;
  }

  async run(id) {
    const list = this.list();
    const it = list.find(b => b.id === id);
    if (!it) throw new Error('Không tìm thấy build');
    this.logger?.send(`[BUILD] Chạy build: ${it.name}`);
    const cmds = Array.isArray(it.steps) ? it.steps : [];
    const { hadError } = await runSeries(cmds, this.logger, { env: it.env });
    this.logger?.send(`[BUILD] Hoàn tất: ${it.name} (hadError=${hadError})`);
    return { ok: !hadError };
  }
}

module.exports = { BuildService };