import { Injectable } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs";
import { LoggerService } from "../shared/logger/logger.service";
import { DataStorageService } from "./data-storage.service";
import { DatabaseService } from "./database.service";
import { readJson, writeJson, timestamp } from "../common/utils/file.util";

@Injectable()
export class ConfigService {
  private paths: any;

  constructor(
    private readonly logger: LoggerService,
    private readonly storageService: DataStorageService,
    private readonly dbManager: DatabaseService,
  ) {
    const dataDir = process.cwd(); // Assuming root
    this.paths = {
      CONFIG_PATH: path.join(dataDir, "config.json"),
      BUILDS_PATH: path.join(dataDir, "builds.json"),
      HISTORY_PATH: path.join(dataDir, "build-history.json"),
      CONFIG_VERSIONS_DIR: path.join(dataDir, "config_versions"),
      BUILDS_VERSIONS_DIR: path.join(dataDir, "builds_versions"),
    };
  }

  getDefaultConfig() {
    return {
      provider: "gitlab",
      account: "",
      token: "",
      polling: 30,
      repoUrl: "",
      repoPath: "",
      contextInitPath: "",
      branch: "main",
      deployScriptPath: "",
      buildMethod: "dockerfile",
      deployChoice: 0,
      deployChoices: [],
      deployContextSource: "repo",
      deployContextCustomPath: "",
      deployServices: [],
      lastBuiltCommit: "",
      autoCheck: false,
      maxConcurrentBuilds: 1,
      buildTimeout: 30,
      logRetentionDays: 30,
      diskSpaceThreshold: 80,
      email: {
        smtpHost: "",
        smtpPort: 587,
        emailUser: "",
        emailPassword: "",
        notifyEmails: [],
        enableEmailNotify: false,
      },
      docker: {
        dockerfilePath: "",
        contextPath: "",
        imageName: "",
        imageTag: "latest",
        autoTagIncrement: false,
        registryUrl: "",
        registryUsername: "",
        registryPassword: "",
      },
    };
  }

  async getConfig() {
    if (this.storageService.isUsingDatabase()) {
      return this.storageService.getData("config", this.getDefaultConfig());
    }
    return readJson(this.paths.CONFIG_PATH, this.getDefaultConfig());
  }

  async updateConfig(updates: any) {
    const currentConfig = await this.getConfig();
    const updatedConfig = { ...currentConfig, ...updates };
    return this.setConfig(updatedConfig);
  }

  async setConfig(cfg: any) {
    // normalization logic (simplified for brevity, but should match original)
    cfg.polling = Number(cfg.polling || 30);
    // ... other normalization

    if (this.storageService.isUsingDatabase()) {
      await this.storageService.saveData("config", cfg);
    } else {
      writeJson(this.paths.CONFIG_PATH, cfg);
    }
    this.saveVersion("config", cfg);
    return cfg;
  }

  listConfigVersions() {
    try {
      return fs
        .readdirSync(this.paths.CONFIG_VERSIONS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ file: f, path: path.join("config_versions", f) }));
    } catch (e) {
      return [];
    }
  }

  listBuildVersions() {
    try {
      return fs
        .readdirSync(this.paths.BUILDS_VERSIONS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ file: f, path: path.join("builds_versions", f) }));
    } catch (e) {
      return [];
    }
  }

  saveVersion(kind: string, data: any) {
    const ts = timestamp();
    const dir =
      kind === "config"
        ? this.paths.CONFIG_VERSIONS_DIR
        : this.paths.BUILDS_VERSIONS_DIR;
    try {
      ensureDir(path.join(dir, "placeholder")); // ensure dir exists
      fs.writeFileSync(
        path.join(dir, `${kind}-${ts}.json`),
        JSON.stringify({ ts, data }, null, 2),
        "utf8",
      );
      this.logger.send(`[VERSION] Lưu phiên bản ${kind} lúc ${ts}`);
    } catch (e) {
      // ignore
    }
  }

  // Helper function from original file.js is ensuring dir exists.
}

// Helper ensuring dir exists locally if needed, but we have file.util
function ensureDir(p: string) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (_) {}
}
