const path = require('path');
const fs = require('fs');
const { run } = require('../utils/exec');

function toPosix(p) {
  if (!p) return p;
  // Chuyển đường dẫn Windows sang dạng POSIX để bash đọc được
  let s = p.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(s)) {
    const drive = s[0].toLowerCase();
    s = `/${drive}${s.slice(2)}`; // C:\path -> /c/path
  }
  return s;
}

/**
 * Đăng ký Deploy Controller routes
 * @param {Object} app - Express app instance
 * @param {Object} deps - Dependencies
 * @param {Object} deps.logger - Logger instance
 * @param {Object} deps.configService - ConfigService instance
 * @returns {void}
 */
function registerDeployController(app, { logger, configService }) {
  // Liệt kê các lựa chọn (CHOICE) dựa theo nội dung deploy.sh
  app.get('/api/deploy/choices', (req, res) => {
    try {
      const pathLib = require('path');
      const fs = require('fs');
      const projectRoot = pathLib.join(__dirname, '../../');
      const cfg = (typeof configService?.getConfig === 'function') ? configService.getConfig() : {};
      
      // Ưu tiên đọc từ config.deployServices trước
      if (Array.isArray(cfg.deployServices) && cfg.deployServices.length > 0) {
        const choices = cfg.deployServices.map((service, index) => ({
          value: index + 1,
          label: service.name || `Service ${index + 1}`
        }));
        return res.json({ ok: true, choices });
      }
      
      // Fallback: parse từ deploy.sh file
      let deployPathCandidate = (req.query?.deployScriptPath) || cfg.deployScriptPath || pathLib.join(projectRoot, 'deploy.sh');
      if (!pathLib.isAbsolute(deployPathCandidate)) deployPathCandidate = pathLib.join(projectRoot, deployPathCandidate);
      if (!fs.existsSync(deployPathCandidate)) {
        return res.status(404).json({ ok: false, error: 'deploy.sh not found', path: deployPathCandidate });
      }
      const content = fs.readFileSync(deployPathCandidate, 'utf8');
      const lines = String(content).split(/\r?\n/);
      const choices = [];
      const regex = /^\s*echo\s+["']\s*(\d+)\.\s*(.+?)["']\s*$/;
      for (const ln of lines) {
        const m = ln.match(regex);
        if (m) {
          const value = Number(m[1]);
          const label = m[2].trim();
          choices.push({ value, label });
        }
      }
      return res.json({ ok: true, choices });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * API Endpoint: Chạy deploy script
   * POST /api/deploy
   * Thực thi deploy.sh với các CHOICE được cấu hình
   */
  app.post('/api/deploy', async (req, res) => {
    const {
      choice,
      imageTag,
      push,
      continueBuild = true,
      dockerfilePath,
      contextPath,
      repoPath,
      configJsonPath,
      deployScriptPath
    } = req.body || {};

    // Xác định đường dẫn deploy.sh
    const projectRoot = path.join(__dirname, '../../');
    const cfg = (typeof configService?.getConfig === 'function') ? configService.getConfig() : {};
    let deployPathCandidate = deployScriptPath || cfg.deployScriptPath || path.join(projectRoot, 'deploy.sh');
    // Cho phép đường dẫn tương đối (so với project root)
    if (!path.isAbsolute(deployPathCandidate)) {
      deployPathCandidate = path.join(projectRoot, deployPathCandidate);
    }
    const deployPath = deployPathCandidate;

    if (!fs.existsSync(deployPath)) {
      return res.status(404).json({ ok: false, error: 'deploy.sh not found', path: deployPath });
    }

    // Chuẩn bị ENV cho deploy.sh (script đã hỗ trợ non-interactive)
    const env = {
      CHOICE: choice != null ? String(choice) : undefined,
      DOCKER_IMAGE_TAG: imageTag || undefined,
      CONTINUE_BUILD: continueBuild ? 'y' : 'n',
      PUSH_IMAGE: push ? 'y' : 'n'
    };

    const dcfg = cfg?.docker || {};
    if (dockerfilePath) env.DOCKERFILE_PATH = toPosix(dockerfilePath); else if (dcfg.dockerfilePath) env.DOCKERFILE_PATH = toPosix(dcfg.dockerfilePath);
    if (contextPath) env.CONTEXT_PATH = toPosix(contextPath); else if (dcfg.contextPath) env.CONTEXT_PATH = toPosix(dcfg.contextPath);
    if (repoPath) env.REPO_PATH = toPosix(repoPath); else if (cfg.repoPath) env.REPO_PATH = toPosix(cfg.repoPath);

    // Ưu tiên CONFIG_JSON_PATH truyền vào, nếu không dùng file config.json của project
    const cfgPath = toPosix(configJsonPath || path.join(projectRoot, 'config.json'));
    env.CONFIG_JSON_PATH = cfgPath;

    logger?.send('[DEPLOY] Bắt đầu chạy deploy.sh ...');
    logger?.send(`[DEPLOY] Script: ${deployPath}`);
    logger?.send(`[DEPLOY] ENV: ${JSON.stringify(env, null, 2)}`);

    // Lưu ý: cần bash/sh có sẵn trên hệ thống (Git Bash/WSL). Nếu không có, lệnh sẽ fail.
    const posixDeployPath = toPosix(deployPath);
    // CWD: chạy tại thư mục chứa script để tương thích với các script sử dụng đường dẫn tương đối
    const scriptDir = path.dirname(deployPath);
    const { error, stdout, stderr } = await run(`bash "${posixDeployPath}"`, logger, { cwd: scriptDir, env });

    if (error) {
      logger?.send(`[DEPLOY][ERROR] ${error.message}`);
      if (stderr) logger?.send(`[DEPLOY][STDERR] ${stderr.trim()}`);
      try { configService?.appendBuildRun({ method: 'deploy.sh', env, hadError: true }); } catch (_) {}
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (stdout) logger?.send(`[DEPLOY][STDOUT] ${stdout.trim()}`);
    logger?.send('[DEPLOY] Hoàn tất deploy.sh');
    try { configService?.appendBuildRun({ method: 'deploy.sh', env, hadError: false }); } catch (_) {}
    return res.json({ ok: true });
  });
}

module.exports = { registerDeployController };