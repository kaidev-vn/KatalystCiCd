import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

@Controller("api/users")
@UseGuards(AuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles("admin")
  async getAllUsers() {
    const users = await this.userService.getAllUsers();
    return { success: true, data: users };
  }

  @Get(":id")
  @Roles("admin")
  async getUserById(@Param("id") id: string) {
    const user = await this.userService.getUserById(id);
    if (!user) return { success: false, error: "User not found" };
    return { success: true, data: user };
  }

  @Post()
  @Roles("admin")
  async createUser(@Body() body: any) {
    try {
      const user = await this.userService.createUser(body);
      return { success: true, data: user };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  @Put(":id")
  @Roles("admin")
  async updateUser(@Param("id") id: string, @Body() body: any) {
    try {
      const user = await this.userService.updateUser(id, body);
      return { success: true, data: user };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  @Delete(":id")
  @Roles("admin")
  async deleteUser(@Param("id") id: string) {
    try {
      await this.userService.deleteUser(id);
      return { success: true, message: "User deleted successfully" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  @Put(":id/role")
  @Roles("admin")
  async changeRole(@Param("id") id: string, @Body() body: any) {
    try {
      const user = await this.userService.changeRole(id, body.role);
      return { success: true, data: user };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  @Post(":id/reset-password")
  @Roles("admin")
  async resetPassword(@Param("id") id: string, @Body() body: any) {
    try {
      await this.userService.changePassword(id, body.newPassword);
      return { success: true, message: "Password reset successfully" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}
