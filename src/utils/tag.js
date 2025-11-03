/**
 * Tăng tag theo quy tắc mới với hỗ trợ prefix và suffix:
 * - Hỗ trợ cấu hình tag với format: {prefix}{version}{suffix}
 * - Ví dụ: 1.0.75-DAIHY-BETA -> prefix: "1.0.", version: "75", suffix: "-DAIHY-BETA"
 * - Tự động tăng phần version (số) và giữ nguyên prefix + suffix
 * - Bảo toàn số lượng chữ số (leading zeros) nếu có
 */

/**
 * Tăng tag với hệ thống chia 2 phần (số và chữ)
 * @param {string} numberPart - Phần số (vd: "1.0.75")
 * @param {string} textPart - Phần chữ (vd: "DAIHY-BETA")
 * @param {boolean} autoIncrement - Có tự động tăng phần số không
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
 * @param {string} tag - Tag cần tách
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
 * @param {string} current - Tag hiện tại
 * @param {object} options - Cấu hình tag
 * @param {string} options.prefix - Phần prefix (vd: "1.0.")
 * @param {string} options.suffix - Phần suffix (vd: "-DAIHY-BETA")
 * @param {number} options.startVersion - Số version bắt đầu nếu không tìm thấy
 * @param {number} options.versionWidth - Độ rộng của version (padding zeros)
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
 * Parse tag thành prefix, version, suffix
 * @param {string} tag - Tag cần parse
 * @param {string} expectedPrefix - Prefix mong đợi
 * @param {string} expectedSuffix - Suffix mong đợi
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
 * - Nếu tìm thấy chuỗi số cuối cùng trong tag (vd: 1.0.76-DAIHY-BETA -> tăng 76 thành 77), giữ nguyên phần chữ.
 * - Bảo toàn số lượng chữ số (leading zeros) nếu có (vd: build-009 -> build-010).
 * - Nếu không có số nào trong tag hiện tại, fallback: thêm hậu tố thời gian.
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
 * Tạo tag config từ tag hiện tại
 * @param {string} currentTag - Tag hiện tại để phân tích
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