/**
 * Tag utility functions
 * Port from src_legacy/utils/tag.js
 */

export interface TagParts {
  numberPart: string;
  textPart: string;
}

/**
 * Tách tag thành phần number và text
 * @example
 * splitTagIntoParts("1.0.75-BETA") => { numberPart: "1.0.75", textPart: "BETA" }
 */
export function splitTagIntoParts(tag: string): TagParts {
  if (!tag) return { numberPart: '', textPart: '' };
  
  const str = String(tag);
  const dashIndex = str.indexOf('-');
  
  if (dashIndex === -1) {
    // Không có dấu gạch ngang
    if (/^\d/.test(str)) {
      return { numberPart: str, textPart: '' };
    } else {
      return { numberPart: '', textPart: str };
    }
  }
  
  return {
    numberPart: str.substring(0, dashIndex),
    textPart: str.substring(dashIndex + 1)
  };
}

/**
 * Tự động tăng phần number của tag
 * @example
 * incrementVersion("1.0.75") => "1.0.76"
 * incrementVersion("1.2") => "1.3"
 */
export function incrementVersion(versionStr: string): string {
  if (!versionStr) return '1.0.0';
  
  const parts = versionStr.split('.');
  if (parts.length === 0) return '1.0.0';
  
  // Tăng phần cuối cùng
  const lastIndex = parts.length - 1;
  const lastPart = parseInt(parts[lastIndex], 10);
  
  if (isNaN(lastPart)) {
    // Nếu không parse được, append .1
    return `${versionStr}.1`;
  }
  
  parts[lastIndex] = String(lastPart + 1);
  return parts.join('.');
}

/**
 * Tạo tag tiếp theo với auto increment (nếu enabled)
 * @param numberPart - Phần số hiện tại (vd: "1.0.75")
 * @param textPart - Phần chữ (vd: "BETA")
 * @param autoIncrement - Có tự động tăng không
 * @param tagPrefix - Prefix cho tag (optional, vd: "RELEASE")
 * @returns Tag mới
 */
export function nextSplitTag(
  numberPart: string,
  textPart: string,
  autoIncrement: boolean = false,
  tagPrefix: string = ''
): string {
  let num = numberPart || '1.0.0';
  let text = textPart || '';
  
  if (autoIncrement) {
    num = incrementVersion(num);
  }
  
  // Xử lý prefix
  if (tagPrefix) {
    // Nếu có prefix, thêm vào trước textPart
    if (text) {
      text = `${tagPrefix}-${text}`;
    } else {
      text = tagPrefix;
    }
  }
  
  if (text) {
    return `${num}-${text}`;
  }
  
  return num;
}

/**
 * Tạo tag từ branch config
 * @param baseNumber - Base version number
 * @param baseText - Base text part
 * @param autoInc - Auto increment
 * @param branchConfig - Branch configuration with tagPrefix
 * @returns Generated tag
 */
export function generateTagForBranch(
  baseNumber: string,
  baseText: string,
  autoInc: boolean,
  branchConfig: { tagPrefix?: string; name?: string }
): string {
  const prefix = branchConfig?.tagPrefix || '';
  return nextSplitTag(baseNumber, baseText, autoInc, prefix);
}
