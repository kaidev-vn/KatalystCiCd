/**
 * Tăng tag theo quy tắc:
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

module.exports = { nextTag };