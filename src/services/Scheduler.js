class Scheduler {
  constructor({ logger, configService, gitService }) {
    this.logger = logger;
    this.configService = configService;
    this.gitService = gitService;
    this._timer = null;
    this._isRunning = false;
  }

  restart() {
    try { if (this._timer) clearInterval(this._timer); } catch (_) {}
    this._isRunning = false;
    
    const cfg = this.configService.getConfig();
    if (!cfg.autoCheck) {
      this.logger?.send('[SCHEDULER] autoCheck đang tắt.');
      return;
    }
    
    const polling = Number(cfg.polling || 30);
    const buildMethod = cfg.buildMethod || 'dockerfile';
    const branch = cfg.branch || 'main';
    const repoPath = cfg.repoPath || 'chưa cấu hình';
    const contextPath = cfg.docker?.contextPath || cfg.repoPath || 'chưa cấu hình';
    
    // Log chi tiết cấu hình scheduler
    this.logger?.send(`[SCHEDULER] ✅ Bạn đã cấu hình Nhánh Build: ${branch}, Thời gian check commit: ${polling}s tại context path: ${contextPath}, Phương thức build: ${buildMethod} (tại repo path: ${repoPath})`);
    this.logger?.send(`[SCHEDULER] 🚀 Scheduler đã được khởi động và sẽ tự động kiểm tra commit mới mỗi ${polling} giây.`);
    
    this._isRunning = true;
    this._timer = setInterval(async () => {
      try {
        const current = this.configService.getConfig();
        if (!current.autoCheck) {
          this.logger?.send('[SCHEDULER] autoCheck đã bị tắt, dừng scheduler.');
          this.stop();
          return;
        }
        if (!current.repoPath) {
          this.logger?.send('[SCHEDULER][WARN] Không có repoPath, bỏ qua lần check này.');
          return;
        }
        
        this.logger?.send(`[SCHEDULER] 🔍 Đang thực hiện check commit cho nhánh: ${current.branch || 'main'} tại repo: ${current.repoPath} với phương thức build: ${current.buildMethod || 'dockerfile'}`);
        await this.gitService.checkAndBuild({ 
          repoPath: current.repoPath, 
          branch: current.branch || 'main' 
        });
      } catch (e) {
        this.logger?.send(`[SCHEDULER][ERROR] ${e.message}`);
      }
    }, Math.max(5, polling) * 1000);
  }

  stop() {
    try { 
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    } catch (_) {}
    this._isRunning = false;
    this.logger?.send('[SCHEDULER] Đã dừng scheduler.');
  }

  isRunning() {
    return this._isRunning;
  }

  getStatus() {
    const cfg = this.configService.getConfig();
    return {
      isRunning: this._isRunning,
      autoCheck: cfg.autoCheck || false,
      polling: cfg.polling || 30,
      buildMethod: cfg.buildMethod || 'dockerfile',
      repoPath: cfg.repoPath || null
    };
  }
}

module.exports = { Scheduler };