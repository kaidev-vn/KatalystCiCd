import { Module, Global } from "@nestjs/common";
import { EmailService } from "./email.service";
import { EmailController } from "./email.controller";
import { ConfigModule } from "../../config/config.module";
import { LoggerModule } from "../../shared/logger/logger.module";

@Global()
@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}

