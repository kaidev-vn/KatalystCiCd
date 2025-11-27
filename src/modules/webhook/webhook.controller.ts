import { Controller, Post, Get, Body, Req, Headers, Res } from "@nestjs/common";
import { WebhookService } from "./webhook.service";
import { Response } from "express";

@Controller("webhook") // Note: Legacy uses /webhook/gitlab not /api/webhook
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post("gitlab")
  async handleGitLab(
    @Body() body: any,
    @Headers("x-gitlab-token") token: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.webhookService.handleGitLabPush(body, token);
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  @Post("github")
  async handleGitHub(
    @Body() body: any,
    @Headers("x-hub-signature-256") signature: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.webhookService.handleGitHubPush(
        body,
        signature,
      );
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  @Get("stats")
  getStats() {
    return this.webhookService.getStats();
  }
}
