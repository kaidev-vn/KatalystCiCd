import { Controller, Post, Body, Req, UseGuards, Get } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { UserService } from "../users/user.service";
import { AuthGuard } from "./auth.guard";

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post("login")
  async login(@Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const { username, password } = body;
    if (!username || !password)
      return { success: false, error: "Missing credentials" };

    try {
      const result = await this.authService.login(username, password, ip);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  async logout(@Req() req: any) {
    await this.authService.logout(req.user.userId);
    return { success: true, message: "Logged out" };
  }

  @Post("refresh")
  async refresh(@Body() body: any) {
    try {
      const token = this.authService.refreshToken(body.token);
      return { success: true, data: { token } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async me(@Req() req: any) {
    const user = await this.userService.getUserById(req.user.userId);
    if (!user) return { success: false, error: "User not found" };
    return { success: true, data: user };
  }

  @Post("change-password")
  @UseGuards(AuthGuard)
  async changePassword(@Body() body: any, @Req() req: any) {
    try {
      const { currentPassword, newPassword } = body;
      await this.authService.changePassword(
        req.user.userId,
        currentPassword,
        newPassword,
      );
      return { success: true, message: "Password changed" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}
