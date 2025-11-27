import { Injectable } from "@nestjs/common";
import * as Database from "better-sqlite3";
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
import { readJson, writeJson, ensureDir } from "../common/utils/file.util";

@Injectable()
export class DatabaseService {
  private db: any = null;
  private pool: Pool | null = null;
  private config: any = null;
  public type: "sqlite" | "postgresql" | null = null;

  constructor() {}

  isSetup(): boolean {
    try {
      const configPath = path.join(process.cwd(), "data", "db-config.json");
      if (!fs.existsSync(configPath)) {
        return false;
      }

      const config = readJson(configPath);
      return config && config.type && config.initialized === true;
    } catch (error) {
      return false;
    }
  }

  getConfig(): any {
    try {
      const configPath = path.join(process.cwd(), "data", "db-config.json");
      return readJson(configPath);
    } catch (error) {
      return null;
    }
  }

  saveConfig(config: any): void {
    ensureDir(path.join(process.cwd(), "data"));
    const configPath = path.join(process.cwd(), "data", "db-config.json");
    writeJson(configPath, {
      ...config,
      initialized: true,
      createdAt: new Date().toISOString(),
    });
  }

  initSQLite(dbPath: string): any {
    try {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(dbPath, {
        verbose: process.env.NODE_ENV === "development" ? console.log : null,
      });

      this.db.pragma("foreign_keys = ON");

      this.type = "sqlite";
      this.config = { type: "sqlite", path: dbPath };

      console.log(`[DATABASE] SQLite initialized: ${dbPath}`);
      return { success: true, message: "SQLite initialized successfully" };
    } catch (error) {
      console.error("[DATABASE] SQLite initialization error:", error);
      return { success: false, message: error.message };
    }
  }

  async initPostgreSQL(config: any): Promise<any> {
    try {
      this.pool = new Pool({
        user: config.username,
        host: config.host || "localhost",
        database: config.database,
        password: config.password,
        port: config.port || 5432,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      const client = await this.pool.connect();
      await client.query("SELECT NOW()");
      client.release();

      this.type = "postgresql";
      this.config = {
        type: "postgresql",
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
      };

      console.log(
        `[DATABASE] PostgreSQL connected: ${config.host}:${config.port}/${config.database}`,
      );
      return { success: true, message: "PostgreSQL connected successfully" };
    } catch (error) {
      console.error("[DATABASE] PostgreSQL connection error:", error);
      return { success: false, message: error.message };
    }
  }

  async query(sql: string, params: any[] = []): Promise<any> {
    if (this.type === "sqlite") {
      const stmt = this.db.prepare(sql);
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        return stmt.all(...params);
      } else {
        return stmt.run(...params);
      }
    } else if (this.type === "postgresql") {
      const result = await this.pool.query(sql, params);
      return result.rows;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
    if (this.pool) {
      await this.pool.end();
    }
  }
}
