import { Module, Global } from "@nestjs/common";
import { ConfigService } from "./config.service";
import { DatabaseService } from "./database.service";
import { DataStorageService } from "./data-storage.service";
import { ConfigController } from "./config.controller";

@Global()
@Module({
  controllers: [ConfigController],
  providers: [ConfigService, DatabaseService, DataStorageService],
  exports: [ConfigService, DatabaseService, DataStorageService],
})
export class ConfigModule {}
