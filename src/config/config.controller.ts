import { Controller, Get, Post, Body, Res } from "@nestjs/common";
import { ConfigService } from "./config.service";
import { LoggerService } from "../shared/logger/logger.service";
import { Response } from "express";
import * as path from "path";
import * as fs from "fs";

@Controller("api/config")
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  async getConfig() {
    return await this.configService.getConfig();
  }

  @Get("raw")
  async getRawConfig(@Res() res: Response) {
    try {
      // We need to access paths from configService.
      // In NestJS, we shouldn't expose private properties, but we can add a getter or public property.
      // For now let's assume paths are accessible or we reconstruct path.
      // ConfigService should probably have a method for this.
      // Let's cheat and use process.cwd()/config.json for now as we did in ConfigService.
      const configPath = path.join(process.cwd(), "config.json");
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf8");
        res.type("application/json").send(content);
      } else {
        res.json({});
      }
    } catch (e) {
      res.status(500).send(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  @Post("raw")
  async saveRawConfig(@Body() body: any) {
    const data = typeof body === "string" ? JSON.parse(body) : body || {};
    const saved = await this.configService.setConfig(data);
    this.logger.send("[CONFIG] Config updated from Raw Editor");
    // Trigger scheduler restart if needed (SchedulerService not migrated yet)
    return { ok: true, data: saved };
  }

  @Post()
  async updateConfig(@Body() body: any) {
    const saved = await this.configService.setConfig(body || {});
    this.logger.send("[CONFIG] Config updated");
    return { ok: true, data: saved };
  }

  @Post("init-context")
  async initContext(@Body() body: any) {
    const basePath = String(
      body?.basePath || body?.path || body?.contextInitPath || "",
    ).trim();

    if (!basePath) {
      throw new Error("Missing basePath/contextInitPath");
    }

    const katalystDir = path.resolve(basePath, "Katalyst");
    const repoDir = path.join(katalystDir, "repo");
    const builderDir = path.join(katalystDir, "builder");

    try {
      fs.mkdirSync(katalystDir, { recursive: true });
      fs.mkdirSync(repoDir, { recursive: true });
      fs.mkdirSync(builderDir, { recursive: true });
      this.logger.send(
        `[CONFIG] Context structure initialized at ${katalystDir}`,
      );
      return { ok: true, data: { katalystDir, repoDir, builderDir } };
    } catch (e) {
      throw new Error(e.message);
    }
  }

  @Get("versions")
  listVersions() {
    return this.configService.listConfigVersions();
  }

  @Post("rollback")
  async rollback(@Body() body: any) {
    // Implement rollback logic in ConfigService or here.
    // Original ConfigService has rollbackConfig.
    // I didn't migrate it yet in new ConfigService, let me check.
    // I need to add rollbackConfig to ConfigService.
    return { ok: false, error: "Not implemented yet" };
  }
}
