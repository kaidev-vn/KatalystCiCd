const { runSeries, resolveShell } = require('../utils/exec');
const fs = require('fs');
const path = require('path');

/**
 * Derive repo path từ contextInitPath
 * @private
 * @param {Object} cfg - Config object
 * @param {string} [cfg.contextInitPath] - Context init path
 * @param {string} [cfg.deployContextCustomPath] - Custom context path
 * @param {string} [cfg.repoPath] - Legacy repo path
 * @returns {string|null} Repo path hoặc null
 */
function deriveRepoPath(cfg) {
  try {
    const base = (cfg?.contextInitPath || cfg?.deployContextCustomPath || '');
    if (base) return path.join(base, 'Katalyst', 'repo');
    return cfg?.repoPath || null; // legacy fallback
  } catch (_) {
    return cfg?.repoPath || null;
  }
}

/**
 * Convert Windows path sang POSIX path (for Git Bash/WSL)
 * @private
 * @param {string} p - Windows path (e.g. D:\path\to\file)
 * @returns {string} POSIX path (e.g. /d/path/to/file)
 */
function toPosix(p) {
  if (!p) return p;
  let s = String(p).replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(s)) {
    const drive = s[0].toLowerCase(); s = `/${drive}${s.slice(2)}`;
  }
  return s;
}

/**
 * BuildService - Service quản lý build operations
 * Hỗ trợ nhiều build methods: custom build steps, script execution, JSON pipeline
 * @class
 */
class BuildService {
  /**
   * Tạo BuildService instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.logger - Logger instance
   * @param {Object} deps.configService - ConfigService instance
   */
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

  /**
   * Lấy danh sách builds
   * @returns {Array<Object>} Danh sách builds
   */
  list() {
    const builds = this.configService.getBuilds();
    return Array.isArray(builds) ? builds : [];
  }

  /**
   * Thêm build mới
   * @param {Object} params - Build parameters
   * @param {string} [params.name] - Tên build
   * @param {Object} [params.env] - Environment variables
   * @param {Array<string>} [params.steps] - Danh sách commands
   * @returns {Object} Build object đã tạo
   */
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

  /**
   * Cập nhật build
   * @param {string} id - Build ID
   * @param {Object} params - Build parameters cần update
   * @param {string} [params.name] - Tên build
   * @param {Object} [params.env] - Environment variables
   * @param {Array<string>} [params.steps] - Danh sách commands
   * @returns {Object} Build object đã cập nhật
   * @throws {Error} Nếu build không tìm thấy
   */
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

  /**
   * Xóa build
   * @param {string} id - Build ID
   * @returns {boolean} True nếu xóa thành công
   */
  remove(id) {
    const list = this.list();
    const idx = list.findIndex(b => b.id === id);
    if (idx < 0) return false;
    const [removed] = list.splice(idx, 1);
    this.configService.saveBuilds(list);
    this.logger?.send(`[BUILD] Đã xóa build: ${removed?.name || id}`);
    return true;
  }

  /**
   * Chạy build
   * @async
   * @param {string} id - Build ID
   * @returns {Promise<Object>} Kết quả build
   * @returns {boolean} return.ok - True nếu không có lỗi
   * @returns {string} return.buildId - Build instance ID
   * @throws {Error} Nếu build không tìm thấy hoặc thực thi failed
   */
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

  /**
   * Chạy build script
   * @async
   * @param {string} scriptPath - Đường dẫn tới script file
   * @param {string|null} [workingDir=null] - Working directory
   * @param {Object} [envOverrides={}] - Environment variables override
   * @returns {Promise<Object>} Kết quả build
   * @returns {boolean} return.ok - True nếu không có lỗi
   * @returns {string} return.buildId - Build instance ID
   * @throws {Error} Nếu script failed
   */
  async runScript(scriptPath, workingDir = null, envOverrides = {}) {
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
      // Determine working directory (ensure it exists to avoid ENOENT from spawn)
      let cwd = workingDir || deriveRepoPath(config) || path.dirname(scriptPath) || process.cwd();
      if (!cwd || !fs.existsSync(cwd)) {
        const scriptDir = path.dirname(scriptPath);
        if (scriptDir && fs.existsSync(scriptDir)) {
          buildLogger.send(`[SCRIPT BUILD] Cảnh báo: Thư mục làm việc không tồn tại: ${cwd}. Fallback sang: ${scriptDir}`);
          cwd = scriptDir;
        } else {
          buildLogger.send(`[SCRIPT BUILD] Cảnh báo: Thư mục làm việc không tồn tại: ${cwd}. Fallback sang: ${process.cwd()}`);
          cwd = process.cwd();
        }
      }

      // Make script executable (for Unix-like systems)
      const makeExecutableCmd = process.platform === 'win32' ? null : `chmod +x "${scriptPath}"`;

      // Execute script (detect script type on Windows)
      let scriptCmd;
      if (process.platform === 'win32') {
        const ext = path.extname(scriptPath).toLowerCase();
        if (ext === '.ps1') {
          scriptCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
        } else if (ext === '.bat' || ext === '.cmd') {
          scriptCmd = `"${scriptPath}"`;
        } else {
          // Default to bash for .sh or no extension; requires Git Bash/WSL installed
          scriptCmd = `bash "${scriptPath}"`;
        }
      } else {
        scriptCmd = `"${scriptPath}"`;
      }

      const commands = makeExecutableCmd ? [makeExecutableCmd, scriptCmd] : [scriptCmd];

      buildLogger.send(`[SCRIPT BUILD] Thực thi script tại: ${cwd}`);
      buildLogger.send(`[SCRIPT BUILD] Đường dẫn script: ${scriptPath}`);
      buildLogger.send(`[SCRIPT BUILD] Lệnh: ${scriptCmd}`);
      buildLogger.send(`[SCRIPT BUILD] Working directory: ${cwd}`);

      const { hadError } = await runSeries(commands, buildLogger, {
        env: { ...process.env, ...(envOverrides || {}) },
        cwd: cwd,
        shell: resolveShell()
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

  /**
   * Chạy pipeline từ file JSON mô tả các bước cần thực thi.
   * JSON format:
   * {
   *   pipeline_name: string,
   *   version: number|string,
   *   working_directory: string,
   *   environment_vars: { [key: string]: string },
   *   check_commit: boolean, // Kiểm tra commit mới trước khi chạy
   *   branch: string, // Branch để kiểm tra commit (nếu check_commit=true)
   *   repo_url: string, // URL repo để kiểm tra commit (nếu check_commit=true)
   *   steps: Array<{
   *     step_order: number,
   *     step_id?: string,
   *     step_name?: string,
   *     step_exec: string,
   *     timeout_seconds?: number,
   *     on_fail?: 'stop'|'continue',
   *     ignore_failure?: boolean,
   *     shell?: string
   *   }>
   * }
   * @param {string} filePath - Đường dẫn tới file pipeline JSON
   * @param {Object} [envOverrides] - Environment variables override
   * @param {Object} [jobInfo] - Thông tin job (optional)
   * @returns {Promise<Object>} Kết quả thực thi pipeline
   */
  async runPipelineFile(filePath, envOverrides = {}, jobInfo = null) {
    const { run, resolveShell } = require('../utils/exec');
    const buildId = `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = new Date().toISOString();

    // Record build start
    this.addBuildHistory({
      id: buildId,
      name: `JSON Pipeline: ${path.basename(filePath)}`,
      method: 'jsonfile',
      status: 'running',
      startTime,
      scriptPath: filePath
    });

    // Create log file
    const logFile = path.join(this.buildLogsDir, `${buildId}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });
    const buildLogger = {
      send: (message) => {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        logStream.write(logLine);
        this.logger?.send(message);
      }
    };

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Pipeline JSON không tồn tại: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      let spec;
      try { spec = JSON.parse(raw); } catch (e) { throw new Error(`Lỗi parse JSON: ${e.message}`); }

      const pipelineName = spec.pipeline_name || path.basename(filePath);
      
      // Ưu tiên sử dụng job-specific repoPath nếu có, sau đó đến working_directory từ spec, rồi derive từ config
      let workingDir = spec.working_directory;
      if (!workingDir && jobInfo && jobInfo.gitConfig && jobInfo.gitConfig.repoPath) {
        workingDir = jobInfo.gitConfig.repoPath;
      }
      if (!workingDir) {
        workingDir = deriveRepoPath(this.configService.getConfig()) || process.cwd();
      }
      const envMap = spec.environment_vars || {};
      const steps = Array.isArray(spec.steps) ? spec.steps.slice() : [];
      
      // Kiểm tra commit mới nếu được cấu hình
      const checkCommit = spec.check_commit === true;
      const branch = spec.branch || 'main';
      const repoUrl = spec.repo_url;
      
      if (checkCommit && repoUrl) {
        buildLogger.send(`[PIPELINE] Kiểm tra commit mới cho branch: ${branch}, repo: ${repoUrl}`);
        
        try {
          // Sử dụng GitService để kiểm tra commit mới
          const GitService = require('./GitService');
          const gitService = new GitService({
            logger: buildLogger,
            configService: this.configService
          });
          
          const checkResult = await gitService.checkNewCommitAndPull({
            repoPath: workingDir,
            branch: branch,
            repoUrl: repoUrl,
            doPull: false // Chỉ kiểm tra, không pull
          });
          
          if (!checkResult.ok) {
            buildLogger.send(`[PIPELINE][WARN] Kiểm tra commit thất bại: ${checkResult.error}`);
          } else if (!checkResult.hasNew) {
            buildLogger.send(`[PIPELINE] Không có commit mới. Dừng pipeline.`);
            
            // Cập nhật build history để đánh dấu đã skip
            const endTime = new Date().toISOString();
            const duration = this.calculateDuration(startTime, endTime);
            this.updateBuildHistory(buildId, {
              status: 'skipped',
              endTime: endTime,
              duration: duration,
              reason: 'no_new_commit'
            });
            
            buildLogger.send(`[PIPELINE] Pipeline đã được skip do không có commit mới.`);
            logStream.end();
            return { ok: true, buildId, skipped: true, reason: 'no_new_commit' };
          } else {
            buildLogger.send(`[PIPELINE] Phát hiện commit mới: ${checkResult.remoteHash}. Tiếp tục chạy pipeline.`);
            commitInfo = { hash: checkResult.remoteHash, message: checkResult.commitMessage };
          }
        } catch (error) {
          buildLogger.send(`[PIPELINE][ERROR] Lỗi kiểm tra commit: ${error.message}`);
          // Vẫn tiếp tục chạy pipeline nếu có lỗi kiểm tra commit
        }
      } else if (checkCommit && !repoUrl) {
        buildLogger.send(`[PIPELINE][WARN] Cấu hình check_commit=true nhưng thiếu repo_url. Bỏ qua kiểm tra commit.`);
      }
      // Sort by step_order if provided
      steps.sort((a, b) => (Number(a.step_order || 0) - Number(b.step_order || 0)));
      // Prepare environment: merge process.env, overrides, and pipeline env
      // Also resolve simple ${VAR} templates within envMap using current env values
      const baseEnv = { ...process.env, ...(envOverrides || {}) };
      // If REPO_PATH not provided, inject derived path for convenience in scripts
      const derivedRepo = deriveRepoPath(this.configService.getConfig());
      if (derivedRepo && !('REPO_PATH' in baseEnv)) {
        baseEnv.REPO_PATH = toPosix(derivedRepo);
      }
      const resolvedEnv = { ...baseEnv };
      for (const [k, v] of Object.entries(envMap)) {
        let val = String(v);
        val = val.replace(/\$\{([^}]+)\}/g, (_, name) => {
          const repl = resolvedEnv[name] ?? '';
          return String(repl);
        });
        resolvedEnv[k] = val;
      }

      buildLogger.send(`[PIPELINE] Bắt đầu: ${pipelineName}`);
      buildLogger.send(`[PIPELINE] Working dir: ${workingDir}`);
      const defaultShell = resolveShell();
      let hadError = false;
      let failureReason = '';
      let commitInfo = {};

      // Ensure working directory exists
      try {
        if (!fs.existsSync(workingDir)) fs.mkdirSync(workingDir, { recursive: true });
      } catch (e) {
        buildLogger.send(`[PIPELINE][WARN] Không tạo được working directory: ${workingDir} (${e.message})`);
      }

      for (const step of steps) {
        const name = step.step_name || step.step_id || `Step ${step.step_order}`;
        const cmd = step.step_exec;
        const timeoutMs = typeof step.timeout_seconds === 'number' ? step.timeout_seconds * 1000 : undefined;
        const ignoreFailure = !!step.ignore_failure || String(step.on_fail || '').toLowerCase() === 'continue';
        const stepShell = step.shell || defaultShell;

        buildLogger.send(`[STEP ${step.step_order ?? '?'}] ${name}`);
        buildLogger.send(`[STEP][EXEC] ${cmd}`);

        const { error, stdout, stderr } = await run(cmd, buildLogger, {
          env: resolvedEnv,
          cwd: workingDir,
          shell: stepShell,
          timeout: timeoutMs
        });

        if (stdout) buildLogger.send(`[STEP][STDOUT] ${stdout.trim()}`);
        if (stderr) buildLogger.send(`[STEP][STDERR] ${stderr.trim()}`);
        if (error) {
          hadError = true;
          const code = error.code || '';
          const sig = error.signal || '';
          const msg = error.message || 'unknown error';
          failureReason = `Step '${name}' failed with code ${code}: ${msg}`;
          buildLogger.send(`[STEP][ERROR] code=${code} signal=${sig} message=${msg}`);
          if (!ignoreFailure) {
            buildLogger.send(`[PIPELINE] Dừng do lỗi ở step: ${name}`);
            break;
          } else {
            buildLogger.send(`[PIPELINE] Bỏ qua lỗi và tiếp tục theo cấu hình step`);
          }
        }
      }

      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      this.updateBuildHistory(buildId, {
        status: hadError ? 'failed' : 'success',
        endTime,
        duration
      });
      buildLogger.send(`[PIPELINE] Hoàn tất: ${pipelineName} (hadError=${hadError})`);
      logStream.end();
      return { ok: !hadError, buildId, failureReason, commitInfo };
    } catch (error) {
      const endTime = new Date().toISOString();
      const duration = this.calculateDuration(startTime, endTime);
      this.updateBuildHistory(buildId, {
        status: 'failed',
        endTime,
        duration,
        error: error.message
      });
      buildLogger.send(`[PIPELINE] Lỗi: ${error.message}`);
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

  clearBuildHistory() {
    try {
      // Clear the history array and save empty array to file
      this.saveBuildHistory([]);

      // Optionally, also clear all log files
      if (fs.existsSync(this.buildLogsDir)) {
        const logFiles = fs.readdirSync(this.buildLogsDir);
        logFiles.forEach(file => {
          if (file.endsWith('.log')) {
            const filePath = path.join(this.buildLogsDir, file);
            fs.unlinkSync(filePath);
          }
        });
      }

      console.log('Build history and logs cleared successfully');
    } catch (error) {
      console.error('Error clearing build history:', error);
      throw error;
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