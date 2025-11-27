import { Injectable } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs";
import { LoggerService } from "../shared/logger/logger.service";
import { DatabaseService } from "./database.service";
import { readJson, writeJson } from "../common/utils/file.util";

@Injectable()
export class DataStorageService {
  private dataDir: string;
  private usingDatabase = false;
  private jsonPaths: Record<string, string>;

  constructor(
    private readonly logger: LoggerService,
    private readonly dbManager: DatabaseService,
  ) {
    // Default data dir to project root/data if not specified via some other means
    // In original code, it was passed in constructor. Here we'll use process.cwd()/data or similar
    this.dataDir = path.join(process.cwd(), "data"); // Default assumption

    this.jsonPaths = {
      config: path.join(process.cwd(), "config.json"), // Matches original app.js logic where DATA_DIR was __dirname (root)
      builds: path.join(process.cwd(), "builds.json"),
      jobs: path.join(process.cwd(), "jobs.json"),
      buildHistory: path.join(process.cwd(), "build-history.json"),
      users: path.join(this.dataDir, "users.json"), // Users was in data/users.json in project structure snapshot? No, wait.
      // Snapshot: data/users.json exists.
      // App.js: DATA_DIR = __dirname. config.json is in root. users.json logic in UserService might differ.
      // Let's follow the file snapshot. config.json is in root. jobs.json is in root.
    };

    // Check storage mode
    this.checkStorageMode();
  }

  checkStorageMode() {
    try {
      const configPath = this.jsonPaths.config;
      if (fs.existsSync(configPath)) {
        const config = readJson(configPath, {});
        this.usingDatabase = !!(config.database && config.database.enabled);
      } else {
        this.usingDatabase = false;
      }

      if (this.usingDatabase) {
        this.logger.send("[STORAGE] Đang sử dụng Database để lưu trữ dữ liệu");
      } else {
        this.logger.send(
          "[STORAGE] Đang sử dụng JSON files để lưu trữ dữ liệu",
        );
      }
    } catch (error) {
      this.logger.send(
        `[STORAGE] Lỗi kiểm tra chế độ lưu trữ: ${error.message}`,
      );
      this.usingDatabase = false;
    }
  }

  async getData(type: string, defaultValue: any = null): Promise<any> {
    if (this.usingDatabase) {
      return await this.getFromDatabase(type);
    } else {
      return this.getFromJson(type, defaultValue);
    }
  }

  async saveData(type: string, data: any): Promise<boolean> {
    if (this.usingDatabase) {
      return await this.saveToDatabase(type, data);
    } else {
      return this.saveToJson(type, data);
    }
  }

  getFromJson(type: string, defaultValue: any): any {
    const filePath = this.jsonPaths[type];
    if (!filePath) {
      throw new Error(`Loại dữ liệu không hợp lệ: ${type}`);
    }
    return readJson(filePath, defaultValue);
  }

  saveToJson(type: string, data: any): boolean {
    const filePath = this.jsonPaths[type];
    if (!filePath) {
      throw new Error(`Loại dữ liệu không hợp lệ: ${type}`);
    }
    return writeJson(filePath, data);
  }

  async getFromDatabase(type: string): Promise<any> {
    try {
      const tableName = this.getTableName(type);
      const result = await this.dbManager.query(
        `SELECT data FROM ${tableName} WHERE id = ?`,
        [1],
      );

      if (result && result.length > 0) {
        return JSON.parse(result[0].data);
      }
      return null;
    } catch (error) {
      this.logger.send(
        `[STORAGE] Lỗi lấy dữ liệu từ database: ${error.message}`,
      );
      return null;
    }
  }

  async saveToDatabase(type: string, data: any): Promise<boolean> {
    try {
      const tableName = this.getTableName(type);
      const jsonData = JSON.stringify(data);

      const existing = await this.dbManager.query(
        `SELECT id FROM ${tableName} WHERE id = ?`,
        [1],
      );

      if (existing && existing.length > 0) {
        await this.dbManager.query(
          `UPDATE ${tableName} SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [jsonData, 1],
        );
      } else {
        await this.dbManager.query(
          `INSERT INTO ${tableName} (id, data) VALUES (?, ?)`,
          [1, jsonData],
        );
      }
      return true;
    } catch (error) {
      this.logger.send(
        `[STORAGE] Lỗi lưu dữ liệu vào database: ${error.message}`,
      );
      return false;
    }
  }

  getTableName(type: string): string {
    const tableMap: Record<string, string> = {
      config: "system_config",
      builds: "builds",
      jobs: "jobs",
      buildHistory: "build_history",
      users: "users",
    };
    return tableMap[type] || type;
  }

  isUsingDatabase(): boolean {
    return this.usingDatabase;
  }
}
