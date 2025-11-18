const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Đảm bảo thư mục chứa file tồn tại (recursive mkdir)
 * @private
 * @param {string} p - File path
 * @returns {void}
 */
function ensureDir(p) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch (_) {}
}

/**
 * Đọc file JSON và parse thành object
 * @param {string} filePath - Đường dẫn file JSON
 * @param {*} defaultValue - Giá trị mặc định nếu file không tồn tại hoặc parse failed
 * @returns {*} Parsed object hoặc defaultValue
 */
function readJson(filePath, defaultValue) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    // Nếu file không tồn tại hoặc lỗi parse, trả về default
    return defaultValue;
  }
}

/**
 * Ghi object ra file JSON (với pretty format)
 * @param {string} filePath - Đường dẫn file JSON
 * @param {*} data - Data cần ghi (sẽ được JSON.stringify)
 * @returns {boolean} True nếu ghi thành công
 */
function writeJson(filePath, data) {
  try {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tạo timestamp string (yyyyMMdd-HHmmss)
 * @returns {string} Timestamp string (vd: "20231105-143025")
 */
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;
}

/**
 * Kiểm tra xem hệ thống đang chạy trên Windows hay Linux/Unix
 * @returns {boolean} True nếu đang chạy trên Windows
 */
function isWindows() {
  return os.platform() === 'win32';
}

/**
 * Kiểm tra xem đường dẫn có tồn tại và có thể truy cập được không
 * @param {string} path - Đường dẫn cần kiểm tra
 * @returns {Promise<boolean>} True nếu đường dẫn tồn tại và có thể truy cập
 */
async function pathExists(path) {
  try {
    await fs.promises.access(path);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Chuyển đổi đường dẫn Linux sang Windows format nếu cần thiết
 * @param {string} linuxPath - Đường dẫn Linux format
 * @returns {string} Đường dẫn phù hợp với hệ điều hành hiện tại
 */
function normalizePathForOS(linuxPath) {
  if (isWindows()) {
    // Trên Windows, chuyển đổi đường dẫn Linux sang Windows format
    // Ví dụ: /opt/Katalyst/repo/system -> C:\opt\Katalyst\repo\system
    const windowsPath = linuxPath
      .replace(/^\//, 'C:\\') // Thay / đầu bằng C:\
      .replace(/\//g, '\\'); // Thay tất cả / bằng \
    
    return windowsPath;
  }
  
  // Trên Linux/Unix, giữ nguyên đường dẫn
  return linuxPath;
}

module.exports = { 
  ensureDir, 
  readJson, 
  writeJson, 
  timestamp,
  isWindows,
  pathExists,
  normalizePathForOS 
};
