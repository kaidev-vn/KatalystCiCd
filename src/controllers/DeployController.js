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

function registerDeployController(app, { logger }) {
  // Chạy deploy.sh với tham số truyền vào từ frontend
  app.post('/api/deploy/run', async (req, res) => {
    const {
      choice,
      imageTag,
      push,
      continueBuild = true,
      dockerfilePath,
      contextPath,
      repoPath,
      configJsonPath
    } = req.body || {};

    // Xác định đường dẫn deploy.sh tại project root
    const projectRoot = path.join(__dirname, '../../');
    const deployPath = path.join(projectRoot, 'deploy.sh');

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

    if (dockerfilePath) env.DOCKERFILE_PATH = toPosix(dockerfilePath);
    if (contextPath) env.CONTEXT_PATH = toPosix(contextPath);
    if (repoPath) env.REPO_PATH = toPosix(repoPath);

    // Ưu tiên CONFIG_JSON_PATH truyền vào, nếu không dùng file config.json của project
    const cfgPath = toPosix(configJsonPath || path.join(projectRoot, 'config.json'));
    env.CONFIG_JSON_PATH = cfgPath;

    logger?.send('[DEPLOY] Bắt đầu chạy deploy.sh ...');
    logger?.send(`[DEPLOY] ENV: ${JSON.stringify(env, null, 2)}`);

    // Lưu ý: cần bash/sh có sẵn trên hệ thống (Git Bash/WSL). Nếu không có, lệnh sẽ fail.
    const { error, stdout, stderr } = await run(`bash "${deployPath}"`, logger, { cwd: projectRoot, env });

    if (error) {
      logger?.send(`[DEPLOY][ERROR] ${error.message}`);
      if (stderr) logger?.send(`[DEPLOY][STDERR] ${stderr.trim()}`);
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (stdout) logger?.send(`[DEPLOY][STDOUT] ${stdout.trim()}`);
    logger?.send('[DEPLOY] Hoàn tất deploy.sh');
    return res.json({ ok: true });
  });
}

module.exports = { registerDeployController };