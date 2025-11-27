import { Controller, Get, Query, Res } from "@nestjs/common";
import { LoggerService } from "../../shared/logger/logger.service";
import { Response } from "express";
import * as fs from "fs";
import * as path from "path";

@Controller("api/repository")
export class RepositoryController {
  constructor(private readonly logger: LoggerService) {}

  @Get("structure")
  async getRepositoryStructure(
    @Query("repoPath") repoPath: string,
    @Res() res: Response,
  ) {
    try {
      if (!repoPath) {
        return res.status(400).json({
          error: "Repository path is required",
          message: "Please provide repository path",
        });
      }

      try {
        await fs.promises.access(repoPath);
      } catch (error) {
        return res.status(404).json({
          error: "Repository path not found",
          message: `Path '${repoPath}' does not exist`,
        });
      }

      const stats = await fs.promises.stat(repoPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({
          error: "Path is not a directory",
          message: `'${repoPath}' is not a directory`,
        });
      }

      const items = await fs.promises.readdir(repoPath, {
        withFileTypes: true,
      });

      const structure = await Promise.all(
        items.map(async (item) => {
          const fullPath = path.join(repoPath, item.name);
          try {
            const stats = await fs.promises.stat(fullPath);
            return {
              name: item.name,
              path: fullPath,
              type: stats.isDirectory() ? "directory" : "file",
              size: stats.size,
              modified: stats.mtime,
              extension: stats.isDirectory()
                ? ""
                : path.extname(item.name).toLowerCase(),
            };
          } catch (e) {
            return null;
          }
        }),
      );

      const validStructure = structure
        .filter(Boolean)
        .sort((a: any, b: any) => {
          if (a.type === "directory" && b.type !== "directory") return -1;
          if (a.type !== "directory" && b.type === "directory") return 1;
          return a.name.localeCompare(b.name);
        });

      res.json({
        success: true,
        data: {
          path: repoPath,
          items: validStructure,
          parent: path.dirname(repoPath),
        },
      });
    } catch (error) {
      this.logger.send(
        `[REPO][ERROR] Get repository structure failed: ${error.message}`,
      );
      res.status(500).json({
        error: "Failed to read repository",
        message: "Cannot read repository",
        details: error.message,
      });
    }
  }

  @Get("file")
  async getFileContent(
    @Query("filePath") filePath: string,
    @Res() res: Response,
  ) {
    try {
      if (!filePath) {
        return res.status(400).json({ error: "File path is required" });
      }

      try {
        await fs.promises.access(filePath);
      } catch (error) {
        return res.status(404).json({ error: "File not found" });
      }

      const stats = await fs.promises.stat(filePath);
      if (stats.isDirectory()) {
        return res.status(400).json({ error: "Path is a directory" });
      }

      if (stats.size > 2 * 1024 * 1024) {
        return res
          .status(400)
          .json({ error: "File too large", message: "Limit 2MB" });
      }

      const content = await fs.promises.readFile(filePath, "utf8");

      res.json({
        success: true,
        data: {
          path: filePath,
          name: path.basename(filePath),
          content: content,
          size: stats.size,
          modified: stats.mtime,
          encoding: "utf8",
        },
      });
    } catch (error) {
      this.logger.send(
        `[REPO][ERROR] Get file content failed: ${error.message}`,
      );
      res
        .status(500)
        .json({ error: "Failed to read file", details: error.message });
    }
  }

  @Get("search")
  async searchFiles(
    @Query("repoPath") repoPath: string,
    @Query("query") query: string,
    @Query("fileType") fileType: string = "all",
    @Res() res: Response,
  ) {
    try {
      if (!repoPath || !query) {
        return res
          .status(400)
          .json({ error: "Repository path and query are required" });
      }

      try {
        await fs.promises.access(repoPath);
      } catch (error) {
        return res.status(404).json({ error: "Repository path not found" });
      }

      const results = await this._searchFilesRecursive(
        repoPath,
        query,
        fileType,
      );

      res.json({
        success: true,
        data: {
          path: repoPath,
          query: query,
          results: results,
          count: results.length,
        },
      });
    } catch (error) {
      this.logger.send(`[REPO][ERROR] Search files failed: ${error.message}`);
      res.status(500).json({ error: "Search failed", details: error.message });
    }
  }

  async _searchFilesRecursive(
    dirPath: string,
    query: string,
    fileType: string,
  ): Promise<any[]> {
    const results = [];

    try {
      const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (
          item.name.startsWith(".") ||
          item.name === "node_modules" ||
          item.name === "dist" ||
          item.name === "build"
        ) {
          continue;
        }

        try {
          const stats = await fs.promises.stat(fullPath);

          if (stats.isDirectory()) {
            const subResults = await this._searchFilesRecursive(
              fullPath,
              query,
              fileType,
            );
            results.push(...subResults);

            if (
              (fileType === "all" || fileType === "directory") &&
              item.name.toLowerCase().includes(query.toLowerCase())
            ) {
              results.push({
                name: item.name,
                path: fullPath,
                type: "directory",
                size: stats.size,
                modified: stats.mtime,
              });
            }
          } else {
            if (
              (fileType === "all" || fileType === "file") &&
              item.name.toLowerCase().includes(query.toLowerCase())
            ) {
              results.push({
                name: item.name,
                path: fullPath,
                type: "file",
                size: stats.size,
                modified: stats.mtime,
                extension: path.extname(item.name).toLowerCase(),
              });
            }
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {}

    return results;
  }
}
