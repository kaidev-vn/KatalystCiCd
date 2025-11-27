import { Controller, Get, Post, Body } from "@nestjs/common";
import { BuildService } from "./build.service";
import { ConfigService } from "../../config/config.service";

@Controller("api/builds")
export class BuildsController {
  constructor(
    private readonly buildService: BuildService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async getBuilds() {
    return await this.buildService.list();
  }

  @Get("versions")
  async getVersions() {
    return this.configService.listBuildVersions();
  }
}

@Controller("api/build-history")
export class BuildHistoryController {
  constructor(private readonly buildService: BuildService) {}

  @Get()
  async getHistory() {
    return this.buildService.getBuildHistory();
  }
}

