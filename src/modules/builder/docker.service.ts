import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { LoggerService } from "../../shared/logger/logger.service";
import { runSeries } from "../../common/utils/exec.util";
import { splitTagIntoParts, nextSplitTag } from "../../common/utils/tag.util";

@Injectable()
export class DockerService {
  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  async buildAndPush(params: any): Promise<any> {
    const cfg = await this.configService.getConfig();
    const p = { ...cfg.docker, ...(params || {}) };
    const updateConfigTag =
      params && typeof params.updateConfigTag === "boolean"
        ? params.updateConfigTag
        : true;

    let tagToUse: string;
    if (p.autoTagIncrement) {
      const currentTag = p.imageTag || cfg.docker?.imageTag || "latest";
      const { numberPart, textPart } = splitTagIntoParts(currentTag);
      this.logger.send(
        `[DOCKER] 🏷️  Splitting tag: number="${numberPart}", text="${textPart}"`,
      );

      tagToUse = nextSplitTag(numberPart, textPart, true);
      this.logger.send(
        `[DOCKER] 🔄 Auto increment tag from "${currentTag}" to "${tagToUse}"`,
      );
    } else {
      tagToUse = p.imageTag || cfg.docker?.imageTag || "latest";
    }

    const image = `${p.imageName}:${tagToUse}`;
    this.logger.send(`[DOCKER] Starting build image: ${image}`);
    const cmds: string[] = [];
    if (p.registryUrl && p.registryUsername && p.registryPassword) {
      cmds.push(
        `docker login ${p.registryUrl} -u ${p.registryUsername} -p ${p.registryPassword}`,
      );
    }
    const buildCmd = p.dockerfilePath
      ? `docker build -f "${p.dockerfilePath}" -t ${image} "${p.contextPath || "."}"`
      : `docker build -t ${image} "${p.contextPath || "."}"`;
    cmds.push(buildCmd);
    if (p.registryUrl) cmds.push(`docker push ${image}`);

    const { hadError } = await runSeries(cmds, this.logger);
    this.logger.send(`[DOCKER] Build & push completed for ${image}`);

    if (p.autoTagIncrement && !hadError && updateConfigTag) {
      const newCfg = await this.configService.getConfig();
      if (!newCfg.docker) newCfg.docker = {};
      newCfg.docker.imageTag = tagToUse;
      await this.configService.setConfig(newCfg);
      this.logger.send(`[DOCKER] Updated imageTag in config to ${tagToUse}`);
    }

    // TODO: Save build history (needs BuildService or similar mechanism to save run)
    // In original code, configService.appendBuildRun was used.
    // configService in my migration doesn't have appendBuildRun exposed yet or migrated fully.
    // I should verify configService migration.

    return { image, tagToUse, hadError };
  }
}
