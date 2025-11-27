import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { EmailService } from "./email.service";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

@Controller("api/email")
@UseGuards(AuthGuard, RolesGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post("test")
  @Roles("admin")
  async sendTestEmail(@Body() body: { to: string }) {
    return await this.emailService.sendTestEmail({ to: body.to });
  }
}

