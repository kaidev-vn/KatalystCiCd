const fs = require('fs');
const path = require('path');

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

module.exports = { ensureDir, readJson, writeJson, timestamp };