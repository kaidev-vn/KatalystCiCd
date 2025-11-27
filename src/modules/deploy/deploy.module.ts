import { Module } from "@nestjs/common";
import { DeployController } from "./deploy.controller";
import { DeployService } from "./deploy.service";
import { ConfigModule } from "../../config/config.module";
import { LoggerModule } from "../../shared/logger/logger.module";

@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [DeployController],
  providers: [DeployService],
  exports: [DeployService],
})
export class DeployModule {}

