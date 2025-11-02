const { runSeries } = require('../utils/exec');
const fs = require('fs');
const path = require('path');

class BuildService {
  constructor({ logger, configService }) {
    this.logger = logger;
    this.configService = configService;
    this.buildHistoryFile = path.join(process.cwd(), 'build-history.json');
    this.buildLogsDir = path.join(process.cwd(), 'build-logs');
    
    // Ensure build logs directory exists
    if (!fs.existsSync(this.buildLogsDir)) {
      fs.mkdirSync(this.buildLogsDir, { recursive: true });
    }
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
    
    const buildId = `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = new Date().toISOString();
    
    // Record build start in history
    this.addBuildHistory({
      id: buildId,
      name: it.name,
      method: 'custom',
      status: 'running',
      startTime: startTime
    });
    
    this.logger?.send(`[BUILD] Chạy build: ${it.name} (ID: ${buildId})`);
    
    // Create log file for this build
    const logFile = path.join(this.buildLogsDir, `${buildId}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });
    
    // Custom logger for this build
    const buildLogger = {
      send: (message) => {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        logStream.write(logLine);
        this.logger?.send(message); // Also send to main logger
      }
    };
    
    try {
      const cmds = Array.isArray(it.steps) ? it.steps : [];
      const { hadError } = await runSeries(cmds, buildLogger, { env: it.env });
      
      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      
      // Update build history with result
      this.updateBuildHistory(buildId, {
        status: hadError ? 'failed' : 'success',
        endTime: endTime,
        duration: duration
      });
      
      buildLogger.send(`[BUILD] Hoàn tất: ${it.name} (hadError=${hadError})`);
      logStream.end();
      
      return { ok: !hadError, buildId };
    } catch (error) {
      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      
      this.updateBuildHistory(buildId, {
        status: 'failed',
        endTime: endTime,
        duration: duration,
        error: error.message
      });
      
      buildLogger.send(`[BUILD] Lỗi: ${error.message}`);
      logStream.end();
      
      throw error;
    }
  }

  async runScript(scriptPath, workingDir = null) {
    const config = this.configService.getConfig();
    const buildId = `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = new Date().toISOString();
    
    // Record script build start in history
    this.addBuildHistory({
      id: buildId,
      name: `Script Build: ${path.basename(scriptPath)}`,
      method: 'script',
      status: 'running',
      startTime: startTime,
      scriptPath: scriptPath
    });
    
    this.logger?.send(`[SCRIPT BUILD] Chạy script: ${scriptPath} (ID: ${buildId})`);
    
    // Create log file for this build
    const logFile = path.join(this.buildLogsDir, `${buildId}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });
    
    // Custom logger for this build
    const buildLogger = {
      send: (message) => {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        logStream.write(logLine);
        this.logger?.send(message); // Also send to main logger
      }
    };
    
    try {
      // Determine working directory
      const cwd = workingDir || config.repoPath || process.cwd();
      
      // Make script executable (for Unix-like systems)
      const makeExecutableCmd = process.platform === 'win32' ? null : `chmod +x "${scriptPath}"`;
      
      // Execute script
      const scriptCmd = process.platform === 'win32' 
        ? `bash "${scriptPath}"` 
        : `"${scriptPath}"`;
      
      const commands = makeExecutableCmd ? [makeExecutableCmd, scriptCmd] : [scriptCmd];
      
      buildLogger.send(`[SCRIPT BUILD] Thực thi script tại: ${cwd}`);
      buildLogger.send(`[SCRIPT BUILD] Lệnh: ${scriptCmd}`);
      
      const { hadError } = await runSeries(commands, buildLogger, { 
        env: process.env,
        cwd: cwd
      });
      
      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      
      // Update build history with result
      this.updateBuildHistory(buildId, {
        status: hadError ? 'failed' : 'success',
        endTime: endTime,
        duration: duration
      });
      
      buildLogger.send(`[SCRIPT BUILD] Hoàn tất: ${scriptPath} (hadError=${hadError})`);
      logStream.end();
      
      return { ok: !hadError, buildId };
    } catch (error) {
      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      
      this.updateBuildHistory(buildId, {
        status: 'failed',
        endTime: endTime,
        duration: duration,
        error: error.message
      });
      
      buildLogger.send(`[SCRIPT BUILD] Lỗi: ${error.message}`);
      logStream.end();
      
      throw error;
    }
  }

  // Build History Management
  getBuildHistory() {
    try {
      if (fs.existsSync(this.buildHistoryFile)) {
        const data = fs.readFileSync(this.buildHistoryFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error reading build history:', error);
    }
    return [];
  }

  addBuildHistory(buildRecord) {
    const history = this.getBuildHistory();
    history.unshift(buildRecord); // Add to beginning
    
    // Keep only last 100 builds
    if (history.length > 100) {
      history.splice(100);
    }
    
    this.saveBuildHistory(history);
  }

  updateBuildHistory(buildId, updates) {
    const history = this.getBuildHistory();
    const index = history.findIndex(build => build.id === buildId);
    
    if (index !== -1) {
      history[index] = { ...history[index], ...updates };
      this.saveBuildHistory(history);
    }
  }

  saveBuildHistory(history) {
    try {
      fs.writeFileSync(this.buildHistoryFile, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Error saving build history:', error);
    }
  }

  // Build Logs Management
  getBuildLogs(buildId) {
    const logFile = path.join(this.buildLogsDir, `${buildId}.log`);
    
    if (fs.existsSync(logFile)) {
      return fs.readFileSync(logFile, 'utf8');
    }
    
    throw new Error(`Build logs not found for ID: ${buildId}`);
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

module.exports = { BuildService };