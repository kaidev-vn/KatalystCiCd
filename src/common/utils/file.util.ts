import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Ensure directory exists (recursive mkdir)
 */
export function ensureDir(p: string): void {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (_) {}
}

/**
 * Read JSON file and parse into object
 */
export function readJson(filePath: string, defaultValue: any = null): any {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Write object to JSON file (with pretty format)
 */
export function writeJson(filePath: string, data: any): boolean {
  try {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Create timestamp string (yyyyMMdd-HHmmss)
 */
export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return os.platform() === "win32";
}

/**
 * Check if path exists
 */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Normalize path for OS
 */
export function normalizePathForOS(linuxPath: string): string {
  if (isWindows()) {
    return linuxPath.replace(/^\//, "C:\\").replace(/\//g, "\\");
  }
  return linuxPath;
}
