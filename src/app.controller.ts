import { Controller, Get, Res, Param } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root(@Res() res: any) {
    return res.sendFile("index.html", { root: "./public" });
  }
}
