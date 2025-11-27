import { Controller, Get } from "@nestjs/common";
import { DeployService } from "./deploy.service";

@Controller("api/deploy")
export class DeployController {
  constructor(private readonly deployService: DeployService) {}

  @Get("choices")
  async getChoices() {
    return await this.deployService.getDeployChoices();
  }
}

