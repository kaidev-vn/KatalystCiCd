/**
 * Tag Utility Functions
 */

export function splitTagIntoParts(tag: string) {
  if (!tag || tag === "latest") {
    return { numberPart: "1.0.75", textPart: "" };
  }

  const lastDashIndex = tag.lastIndexOf("-");
  if (lastDashIndex === -1) {
    return { numberPart: tag, textPart: "" };
  }

  const numberPart = tag.substring(0, lastDashIndex);
  const textPart = tag.substring(lastDashIndex + 1);

  return { numberPart, textPart };
}

export function nextSplitTag(
  numberPart: string,
  textPart: string,
  autoIncrement = false,
): string {
  let newNumberPart = numberPart || "1.0.75";

  if (autoIncrement) {
    const match = newNumberPart.match(/(\d+)(?!.*\d)/);
    if (match) {
      const numStr = match[1];
      const width = numStr.length;
      const num = parseInt(numStr, 10) + 1;
      const nextNumStr = String(num).padStart(width, "0");
      const prefix = newNumberPart.slice(0, match.index);
      const suffix = newNumberPart.slice(match.index + numStr.length);
      newNumberPart = `${prefix}${nextNumStr}${suffix}`;
    }
  }

  if (!textPart) return newNumberPart;
  return `${newNumberPart}-${textPart}`;
}

export function parseTag(
  tag: string,
  expectedPrefix = "",
  expectedSuffix = "",
) {
  if (!tag) return { prefix: "", version: null, suffix: "", versionWidth: 0 };

  let workingTag = tag;
  let actualPrefix = "";
  let actualSuffix = "";

  if (expectedPrefix && workingTag.startsWith(expectedPrefix)) {
    actualPrefix = expectedPrefix;
    workingTag = workingTag.slice(expectedPrefix.length);
  }

  if (expectedSuffix && workingTag.endsWith(expectedSuffix)) {
    actualSuffix = expectedSuffix;
    workingTag = workingTag.slice(0, -expectedSuffix.length);
  }

  const versionMatch = workingTag.match(/^(\d+)$/);
  if (versionMatch) {
    return {
      prefix: actualPrefix,
      version: parseInt(versionMatch[1], 10),
      suffix: actualSuffix,
      versionWidth: versionMatch[1].length,
    };
  }

  const lastNumberMatch = tag.match(/(\d+)(?!.*\d)/);
  if (lastNumberMatch) {
    const numberStr = lastNumberMatch[1];
    const numberIndex = lastNumberMatch.index || 0;
    return {
      prefix: tag.slice(0, numberIndex),
      version: parseInt(numberStr, 10),
      suffix: tag.slice(numberIndex + numberStr.length),
      versionWidth: numberStr.length,
    };
  }

  return { prefix: tag, version: null, suffix: "", versionWidth: 0 };
}

export function nextTag(current: string): string {
  const s = String(current || "latest");
  const match = s.match(/(\d+)(?!.*\d)/);
  if (match) {
    const numStr = match[1];
    const width = numStr.length;
    const num = parseInt(numStr, 10) + 1;
    const nextNumStr = String(num).padStart(width, "0");
    const prefix = s.slice(0, match.index);
    const suffix = s.slice(match.index + numStr.length);
    return `${prefix}${nextNumStr}${suffix}`;
  }
  const ts = new Date()
    .toISOString()
    .replace(/[-:TZ]/g, "")
    .slice(0, 12);
  return `${s}-${ts}`;
}

export function nextTagWithConfig(current: string, options: any = {}): string {
  const {
    prefix = "",
    suffix = "",
    startVersion = 1,
    versionWidth = 0,
  } = options;

  if (!current || current === "latest") {
    const versionStr =
      versionWidth > 0
        ? String(startVersion).padStart(versionWidth, "0")
        : String(startVersion);
    return `${prefix}${versionStr}${suffix}`;
  }

  const parsed = parseTag(current, prefix, suffix);

  if (parsed.version !== null) {
    const newVersion = (parsed.version || 0) + 1;
    const versionStr =
      versionWidth > 0
        ? String(newVersion).padStart(versionWidth, "0")
        : String(newVersion);
    return `${prefix}${versionStr}${suffix}`;
  }

  return nextTag(current);
}

export function createTagConfigFromCurrent(currentTag: string) {
  if (!currentTag || currentTag === "latest") {
    return {
      prefix: "1.0.",
      suffix: "-BETA",
      startVersion: 1,
      versionWidth: 2,
    };
  }

  const parsed = parseTag(currentTag);
  return {
    prefix: parsed.prefix || "",
    suffix: parsed.suffix || "",
    startVersion: parsed.version || 1,
    versionWidth: parsed.versionWidth || 0,
  };
}
