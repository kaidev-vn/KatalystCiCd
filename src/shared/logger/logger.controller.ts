import { Controller, Get, Param, Res } from "@nestjs/common";
import { Response } from "express";
import { LoggerService } from "./logger.service";

@Controller("api/logs")
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Get("stream")
  streamGlobalLogs(@Res() res: Response) {
    this.loggerService.registerGlobalClient(res);
  }

  @Get("stream/:jobId")
  streamJobLogs(@Param("jobId") jobId: string, @Res() res: Response) {
    this.loggerService.registerJobClient(res, jobId);
  }
}
