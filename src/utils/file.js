const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch (_) {}
}

function readJson(filePath, defaultValue) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    // Nếu file không tồn tại hoặc lỗi parse, trả về default
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  try {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

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

module.exports = { readJson, writeJson, timestamp };