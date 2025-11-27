import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { LoggerService } from "../../shared/logger/logger.service";

@Injectable()
export class DeployService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async getDeployChoices() {
    const config = await this.configService.getConfig();
    return config.deployChoices || [];
  }

  // Add other deploy related methods if needed
}

