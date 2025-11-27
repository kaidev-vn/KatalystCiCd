import { Injectable } from "@nestjs/common";
import * as path from "path";
import * as bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { LoggerService } from "../../shared/logger/logger.service";
import { DataStorageService } from "../../config/data-storage.service";
import { ensureDir } from "../../common/utils/file.util";

@Injectable()
export class UserService {
  private usersFile: string;
  private SALT_ROUNDS = 10;
  private initialized = false;

  constructor(
    private readonly logger: LoggerService,
    private readonly storageService: DataStorageService,
  ) {
    this.usersFile = path.join(process.cwd(), "data", "users.json");
    this.ensureUsersFile();
  }

  private async ensureInitialized() {
    // In NestJS, constructor is called on module init.
    // We can use onModuleInit or just await in methods.
    // For simplicity, we ensure file exists in constructor or first call.
    if (!this.initialized) {
      await this.ensureUsersFile();
      this.initialized = true;
    }
  }

  async ensureUsersFile() {
    try {
      await ensureDir(path.dirname(this.usersFile));

      let users: any[] = [];
      let fileExists = false;

      try {
        users = await this.storageService.getData("users");
        if (users && Array.isArray(users)) {
          fileExists = true;
        } else {
          users = [];
        }
      } catch (err) {
        fileExists = false;
        users = [];
      }

      if (!fileExists || users.length === 0) {
        const defaultAdmin = await this.createDefaultAdmin();
        users = [defaultAdmin];
        await this.saveUsers(users);
        this.logger.send("[USER SERVICE] ✅ Created default admin user");
        return;
      }

      if (!users.find((u) => u.username === "admin")) {
        const defaultAdmin = await this.createDefaultAdmin();
        users.push(defaultAdmin);
        await this.saveUsers(users);
        this.logger.send("[USER SERVICE] ✅ Added default admin user");
      }
    } catch (error) {
      this.logger.send(
        `[USER SERVICE] ❌ Error ensuring users file: ${error.message}`,
      );
    }
  }

  async createDefaultAdmin() {
    const hashedPassword = await bcrypt.hash("welcomekalyst", this.SALT_ROUNDS);
    return {
      id: uuidv4(),
      username: "admin",
      email: "admin@cicd.local",
      password: hashedPassword,
      role: "admin",
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLogin: null,
    };
  }

  async getAllUsers() {
    await this.ensureInitialized();
    try {
      const users = await this.storageService.getData("users");
      return users.map((u: any) => {
        const { password, ...userWithoutPassword } = u;
        return userWithoutPassword;
      });
    } catch (error) {
      return [];
    }
  }

  async getUserById(userId: string) {
    try {
      const users = await this.storageService.getData("users");
      const user = users.find((u: any) => u.id === userId);
      if (!user) return null;
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      return null;
    }
  }

  async getUserByUsername(username: string) {
    await this.ensureInitialized();
    try {
      const users = await this.storageService.getData("users");
      return users.find((u: any) => u.username === username) || null;
    } catch (error) {
      return null;
    }
  }

  async saveUsers(users: any[]) {
    await this.storageService.saveData("users", users);
  }

  async createUser(userData: any) {
    await this.ensureInitialized();
    try {
      const users = await this.storageService.getData("users");
      if (users.find((u: any) => u.username === userData.username)) {
        throw new Error("Username already exists");
      }

      const hashedPassword = await bcrypt.hash(
        userData.password,
        this.SALT_ROUNDS,
      );
      const newUser = {
        id: uuidv4(),
        username: userData.username,
        email: userData.email || `${userData.username}@cicd.local`,
        password: hashedPassword,
        role: userData.role || "user",
        mustChangePassword: userData.mustChangePassword !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: null,
      };

      users.push(newUser);
      await this.saveUsers(users);
      this.logger.send(`[USER SERVICE] ✅ Created user: ${newUser.username}`);

      const { password, ...userWithoutPassword } = newUser;
      return userWithoutPassword;
    } catch (error) {
      this.logger.send(
        `[USER SERVICE] ❌ Error creating user: ${error.message}`,
      );
      throw error;
    }
  }

  async updateUser(userId: string, updates: any) {
    try {
      const users = await this.storageService.getData("users");
      const index = users.findIndex((u: any) => u.id === userId);

      if (index === -1) throw new Error("User not found");

      const { password, ...allowedUpdates } = updates;
      users[index] = {
        ...users[index],
        ...allowedUpdates,
        updatedAt: new Date().toISOString(),
      };

      await this.saveUsers(users);
      this.logger.send(
        `[USER SERVICE] ✅ Updated user: ${users[index].username}`,
      );

      const { password: pwd, ...userWithoutPassword } = users[index];
      return userWithoutPassword;
    } catch (error) {
      throw error;
    }
  }

  async deleteUser(userId: string) {
    try {
      const users = await this.storageService.getData("users");
      const user = users.find((u: any) => u.id === userId);
      if (!user) throw new Error("User not found");

      if (user.role === "admin") {
        const adminCount = users.filter((u: any) => u.role === "admin").length;
        if (adminCount === 1)
          throw new Error("Cannot delete the only admin user");
      }

      const filteredUsers = users.filter((u: any) => u.id !== userId);
      await this.saveUsers(filteredUsers);
      this.logger.send(`[USER SERVICE] ✅ Deleted user: ${user.username}`);
      return true;
    } catch (error) {
      throw error;
    }
  }

  async verifyPassword(plain: string, hashed: string) {
    return bcrypt.compare(plain, hashed);
  }

  async changePassword(userId: string, newPass: string) {
    try {
      const users = await this.storageService.getData("users");
      const index = users.findIndex((u: any) => u.id === userId);
      if (index === -1) throw new Error("User not found");

      const hashedPassword = await bcrypt.hash(newPass, this.SALT_ROUNDS);
      users[index].password = hashedPassword;
      users[index].mustChangePassword = false;
      users[index].updatedAt = new Date().toISOString();

      await this.saveUsers(users);
      this.logger.send(
        `[USER SERVICE] ✅ Changed password for user: ${users[index].username}`,
      );
      return true;
    } catch (error) {
      throw error;
    }
  }

  async updateLastLogin(userId: string) {
    try {
      const users = await this.storageService.getData("users");
      const index = users.findIndex((u: any) => u.id === userId);
      if (index !== -1) {
        users[index].lastLogin = new Date().toISOString();
        await this.saveUsers(users);
      }
    } catch (error) {}
  }

  async changeRole(userId: string, newRole: string) {
    const validRoles = ["admin", "user", "viewer"];
    if (!validRoles.includes(newRole)) throw new Error("Invalid role");
    return this.updateUser(userId, { role: newRole });
  }
}
