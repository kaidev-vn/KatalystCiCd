import { Injectable } from "@nestjs/common";
import { UserService } from "../users/user.service";
import { LoggerService } from "../../shared/logger/logger.service";
import * as jwt from "jsonwebtoken";

@Injectable()
export class AuthService {
  private JWT_SECRET =
    process.env.JWT_SECRET || "CI-CD-SECRET-KEY-CHANGE-IN-PRODUCTION";
  private TOKEN_EXPIRY = "8h";
  private loginAttempts = new Map<
    string,
    { count: number; lastAttempt: number }
  >();
  private MAX_ATTEMPTS = 5;
  private LOCKOUT_DURATION = 15 * 60 * 1000;

  constructor(
    private readonly userService: UserService,
    private readonly logger: LoggerService,
  ) {}

  async login(username: string, pass: string, ip: string) {
    if (this.isRateLimited(ip)) {
      throw new Error("Too many login attempts");
    }

    const user = await this.userService.getUserByUsername(username);
    if (!user) {
      this.recordFailedAttempt(ip);
      throw new Error("Invalid credentials");
    }

    const isValid = await this.userService.verifyPassword(pass, user.password);
    if (!isValid) {
      this.recordFailedAttempt(ip);
      throw new Error("Invalid credentials");
    }

    this.loginAttempts.delete(ip);
    await this.userService.updateLastLogin(user.id);

    const token = this.generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    this.logger.send(`[AUTH] ✅ User logged in: ${username}`);
    const { password, ...userWithoutPass } = user;
    return {
      token,
      user: userWithoutPass,
      mustChangePassword: user.mustChangePassword,
    };
  }

  generateToken(payload: any) {
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.TOKEN_EXPIRY as jwt.SignOptions["expiresIn"],
    });
  }

  verifyToken(token: string) {
    return jwt.verify(token, this.JWT_SECRET);
  }

  refreshToken(oldToken: string) {
    const decoded: any = jwt.verify(oldToken, this.JWT_SECRET, {
      ignoreExpiration: true,
    });
    return this.generateToken({
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    });
  }

  async changePassword(userId: string, current: string, newPass: string) {
    const user = await this.userService.getUserById(userId);
    const fullUser = await this.userService.getUserByUsername(user.username); // Need password hash

    const isValid = await this.userService.verifyPassword(
      current,
      fullUser.password,
    );
    if (!isValid) throw new Error("Current password incorrect");

    if (newPass.length < 8) throw new Error("Password too short");

    await this.userService.changePassword(userId, newPass);
    this.logger.send(`[AUTH] ✅ Password changed: ${user.username}`);
    return true;
  }

  isRateLimited(ip: string) {
    const attempts = this.loginAttempts.get(ip);
    if (!attempts) return false;
    if (Date.now() - attempts.lastAttempt > this.LOCKOUT_DURATION) {
      this.loginAttempts.delete(ip);
      return false;
    }
    return attempts.count >= this.MAX_ATTEMPTS;
  }

  recordFailedAttempt(ip: string) {
    const attempts = this.loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.loginAttempts.set(ip, attempts);
  }

  async logout(userId: string) {
    this.logger.send(`[AUTH] ✅ User logged out: ${userId}`);
    return true;
  }
}
