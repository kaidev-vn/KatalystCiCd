/**
 * Tag Utility Functions - Quản lý Docker image tags với auto-increment
 * 
 * Hỗ trợ nhiều format tags:
 * - Simple: "75" -> "76"
 * - Semantic: "1.0.75" -> "1.0.76"
 * - With suffix: "1.0.75-DAIHY-BETA" -> "1.0.76-DAIHY-BETA"
 * - Leading zeros: "build-009" -> "build-010"
 * - Custom prefix/suffix với config
 * 
 * @module utils/tag
 */

/**
 * Tăng tag với hệ thống chia 2 phần (số và chữ)
 * @param {string} numberPart - Phần số (vd: "1.0.75")
 * @param {string} textPart - Phần chữ (vd: "DAIHY-BETA")
 * @param {boolean} [autoIncrement=false] - Có tự động tăng phần số không
 * @returns {string} Tag mới (vd: "1.0.76-DAIHY-BETA")
 * @example
 * nextSplitTag("1.0.75", "BETA", true) // "1.0.76-BETA"
 */
function nextSplitTag(numberPart, textPart, autoIncrement = false) {
  let newNumberPart = numberPart || '1.0.75';
  
  if (autoIncrement) {
    // Tìm số cuối cùng trong phần số và tăng lên
    const match = newNumberPart.match(/(\d+)(?!.*\d)/);
    if (match) {
      const numStr = match[1];
      const width = numStr.length;
      const num = parseInt(numStr, 10) + 1;
      const nextNumStr = String(num).padStart(width, '0');
      const prefix = newNumberPart.slice(0, match.index);
      const suffix = newNumberPart.slice(match.index + numStr.length);
      newNumberPart = `${prefix}${nextNumStr}${suffix}`;
    }
  }
  
  // Nối 2 phần lại
  if (!textPart) return newNumberPart;
  return `${newNumberPart}-${textPart}`;
}

/**
 * Tách tag thành 2 phần (số và chữ)
 * @param {string} tag - Tag cần tách (vd: "1.0.75-BETA")
 * @returns {Object} Object chứa numberPart và textPart
 * @returns {string} return.numberPart - Phần số
 * @returns {string} return.textPart - Phần chữ
 * @example
 * splitTagIntoParts("1.0.75-BETA") // { numberPart: "1.0.75", textPart: "BETA" }
 */
function splitTagIntoParts(tag) {
  if (!tag || tag === 'latest') {
    return { numberPart: '1.0.75', textPart: '' };
  }
  
  // Tìm dấu gạch ngang cuối cùng để tách
  const lastDashIndex = tag.lastIndexOf('-');
  if (lastDashIndex === -1) {
    // Không có dấu gạch ngang, coi toàn bộ là phần số
    return { numberPart: tag, textPart: '' };
  }
  
  const numberPart = tag.substring(0, lastDashIndex);
  const textPart = tag.substring(lastDashIndex + 1);
  
  return { numberPart, textPart };
}

/**
 * Tăng tag với cấu hình prefix và suffix
 * @param {string} current - Tag hiện tại (vd: "v1.0.75-beta")
 * @param {Object} [options={}] - Cấu hình tag
 * @param {string} [options.prefix=''] - Phần prefix (vd: "v1.0.")
 * @param {string} [options.suffix=''] - Phần suffix (vd: "-beta")
 * @param {number} [options.startVersion=1] - Số version bắt đầu nếu không tìm thấy
 * @param {number} [options.versionWidth=0] - Độ rộng của version (padding zeros)
 * @returns {string} Tag mới
 * @example
 * nextTagWithConfig("v1.0.5-beta", {prefix: "v1.0.", suffix: "-beta"}) // "v1.0.6-beta"
 */
function nextTagWithConfig(current, options = {}) {
  const { prefix = '', suffix = '', startVersion = 1, versionWidth = 0 } = options;
  
  if (!current || current === 'latest') {
    // Nếu không có tag hiện tại, tạo tag mới với startVersion
    const versionStr = versionWidth > 0 ? String(startVersion).padStart(versionWidth, '0') : String(startVersion);
    return `${prefix}${versionStr}${suffix}`;
  }
  
  // Tách tag hiện tại thành prefix, version, suffix
  const parsed = parseTag(current, prefix, suffix);
  
  if (parsed.version !== null) {
    // Tăng version lên 1
    const newVersion = parsed.version + 1;
    const versionStr = versionWidth > 0 ? String(newVersion).padStart(versionWidth, '0') : String(newVersion);
    return `${prefix}${versionStr}${suffix}`;
  }
  
  // Fallback: sử dụng logic cũ nếu không parse được
  return nextTag(current);
}

/**
 * Parse tag thành các thành phần prefix, version, suffix
 * @param {string} tag - Tag cần parse
 * @param {string} [expectedPrefix=''] - Prefix mong đợi
 * @param {string} [expectedSuffix=''] - Suffix mong đợi
 * @returns {Object} Parsed tag components
 * @returns {string} return.prefix - Prefix phần
 * @returns {number|null} return.version - Version number (null nếu không parse được)
 * @returns {string} return.suffix - Suffix phần
 * @returns {number} [return.versionWidth] - Độ rộng của version string
 */
function parseTag(tag, expectedPrefix = '', expectedSuffix = '') {
  if (!tag) return { prefix: '', version: null, suffix: '' };
  
  let workingTag = tag;
  let actualPrefix = '';
  let actualSuffix = '';
  
  // Tách prefix nếu có
  if (expectedPrefix && workingTag.startsWith(expectedPrefix)) {
    actualPrefix = expectedPrefix;
    workingTag = workingTag.slice(expectedPrefix.length);
  }
  
  // Tách suffix nếu có
  if (expectedSuffix && workingTag.endsWith(expectedSuffix)) {
    actualSuffix = expectedSuffix;
    workingTag = workingTag.slice(0, -expectedSuffix.length);
  }
  
  // Phần còn lại phải là version (số)
  const versionMatch = workingTag.match(/^(\d+)$/);
  if (versionMatch) {
    return {
      prefix: actualPrefix,
      version: parseInt(versionMatch[1], 10),
      suffix: actualSuffix,
      versionWidth: versionMatch[1].length
    };
  }
  
  // Nếu không parse được theo cấu hình, thử tìm số cuối cùng
  const lastNumberMatch = tag.match(/(\d+)(?!.*\d)/);
  if (lastNumberMatch) {
    const numberStr = lastNumberMatch[1];
    const numberIndex = lastNumberMatch.index;
    return {
      prefix: tag.slice(0, numberIndex),
      version: parseInt(numberStr, 10),
      suffix: tag.slice(numberIndex + numberStr.length),
      versionWidth: numberStr.length
    };
  }
  
  return { prefix: tag, version: null, suffix: '' };
}

/**
 * Tăng tag theo quy tắc cũ (backward compatibility):
 * - Tìm số cuối cùng trong tag và tăng lên 1
 * - Bảo toàn leading zeros (vd: build-009 -> build-010)
 * - Giữ nguyên tất cả ký tự khác
 * @param {string} current - Tag hiện tại
 * @returns {string} Tag mới
 * @example
 * nextTag("1.0.75-BETA") // "1.0.76-BETA"
 * nextTag("build-009") // "build-010"
 */
function nextTag(current) {
  const s = String(current || 'latest');
  // Tìm chuỗi số CUỐI CÙNG trong tag
  const match = s.match(/(\d+)(?!.*\d)/);
  if (match) {
    const numStr = match[1];
    const width = numStr.length;
    const num = parseInt(numStr, 10) + 1;
    const nextNumStr = String(num).padStart(width, '0');
    // Thay thế CHỈ chuỗi số cuối cùng
    const prefix = s.slice(0, match.index);
    const suffix = s.slice(match.index + numStr.length);
    return `${prefix}${nextNumStr}${suffix}`;
  }
  // Nếu không có số: thêm hậu tố thời gian để đảm bảo duy nhất
  const ts = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 12);
  return `${s}-${ts}`;
}

/**
 * Tạo tag config từ tag hiện tại (auto-detect format)
 * @param {string} currentTag - Tag hiện tại để phân tích
 * @returns {Object} Tag config object
 * @returns {string} return.prefix - Auto-detected prefix
 * @returns {string} return.suffix - Auto-detected suffix
 * @returns {number} return.startVersion - Detected version number
 * @returns {number} return.versionWidth - Detected version width
 */
function createTagConfigFromCurrent(currentTag) {
  if (!currentTag || currentTag === 'latest') {
    return {
      prefix: '1.0.',
      suffix: '-BETA',
      startVersion: 1,
      versionWidth: 2
    };
  }
  
  const parsed = parseTag(currentTag);
  return {
    prefix: parsed.prefix || '',
    suffix: parsed.suffix || '',
    startVersion: parsed.version || 1,
    versionWidth: parsed.versionWidth || 0
  };
}

module.exports = { 
  nextTag, 
  nextTagWithConfig, 
  parseTag, 
  createTagConfigFromCurrent,
  nextSplitTag,
  splitTagIntoParts
};