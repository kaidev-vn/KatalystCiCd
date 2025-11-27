const fs = require('fs').promises;
const path = require('path');

/**
 * RepositoryController - API endpoints cho quản lý repository và source code
 * Hiển thị cấu trúc thư mục và nội dung file trong repository
 * @class
 */
class RepositoryController {
  /**
   * Tạo RepositoryController instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.logger - Logger instance
   */
  constructor({ logger }) {
    this.logger = logger;
  }

  /**
   * Lấy danh sách file và folder trong repository path
   * @async
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async getRepositoryStructure(req, res) {
    try {
      const { repoPath } = req.query;
      
      if (!repoPath) {
        return res.status(400).json({ 
          error: 'Repository path is required',
          message: 'Vui lòng cung cấp đường dẫn repository'
        });
      }

      // Kiểm tra path có tồn tại không
      try {
        await fs.access(repoPath);
      } catch (error) {
        return res.status(404).json({ 
          error: 'Repository path not found',
          message: `Đường dẫn '${repoPath}' không tồn tại`
        });
      }

      const stats = await fs.stat(repoPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ 
          error: 'Path is not a directory',
          message: `'${repoPath}' không phải là thư mục`
        });
      }

      // Đọc nội dung thư mục
      const items = await fs.readdir(repoPath, { withFileTypes: true });
      
      const structure = await Promise.all(
        items.map(async (item) => {
          const fullPath = path.join(repoPath, item.name);
          const stats = await fs.stat(fullPath);
          
          return {
            name: item.name,
            path: fullPath,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime,
            extension: stats.isDirectory() ? '' : path.extname(item.name).toLowerCase()
          };
        })
      );

      // Sắp xếp: thư mục trước, file sau
      structure.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

      res.json({
        success: true,
        data: {
          path: repoPath,
          items: structure,
          parent: path.dirname(repoPath)
        }
      });

    } catch (error) {
      this.logger?.send(`[REPO][ERROR] Get repository structure failed: ${error.message}`);
      res.status(500).json({ 
        error: 'Failed to read repository',
        message: 'Không thể đọc repository',
        details: error.message
      });
    }
  }

  /**
   * Đọc nội dung file source code
   * @async
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async getFileContent(req, res) {
    try {
      const { filePath } = req.query;
      
      if (!filePath) {
        return res.status(400).json({ 
          error: 'File path is required',
          message: 'Vui lòng cung cấp đường dẫn file'
        });
      }

      // Kiểm tra path có tồn tại không
      try {
        await fs.access(filePath);
      } catch (error) {
        return res.status(404).json({ 
          error: 'File not found',
          message: `File '${filePath}' không tồn tại`
        });
      }

      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        return res.status(400).json({ 
          error: 'Path is a directory',
          message: `'${filePath}' là thư mục, không phải file`
        });
      }

      // Kiểm tra kích thước file (giới hạn 2MB)
      if (stats.size > 2 * 1024 * 1024) {
        return res.status(400).json({ 
          error: 'File too large',
          message: 'File quá lớn để hiển thị (giới hạn 2MB)'
        });
      }

      // Đọc nội dung file
      const content = await fs.readFile(filePath, 'utf8');
      
      res.json({
        success: true,
        data: {
          path: filePath,
          name: path.basename(filePath),
          content: content,
          size: stats.size,
          modified: stats.mtime,
          encoding: 'utf8'
        }
      });

    } catch (error) {
      this.logger?.send(`[REPO][ERROR] Get file content failed: ${error.message}`);
      res.status(500).json({ 
        error: 'Failed to read file',
        message: 'Không thể đọc file',
        details: error.message
      });
    }
  }

  /**
   * Tìm kiếm file trong repository
   * @async
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {Promise<void>}
   */
  async searchFiles(req, res) {
    try {
      const { repoPath, query, fileType = 'all' } = req.query;
      
      if (!repoPath || !query) {
        return res.status(400).json({ 
          error: 'Repository path and search query are required',
          message: 'Vui lòng cung cấp đường dẫn repository và từ khóa tìm kiếm'
        });
      }

      // Kiểm tra path có tồn tại không
      try {
        await fs.access(repoPath);
      } catch (error) {
        return res.status(404).json({ 
          error: 'Repository path not found',
          message: `Đường dẫn '${repoPath}' không tồn tại`
        });
      }

      const results = await this._searchFilesRecursive(repoPath, query, fileType);
      
      res.json({
        success: true,
        data: {
          path: repoPath,
          query: query,
          results: results,
          count: results.length
        }
      });

    } catch (error) {
      this.logger?.send(`[REPO][ERROR] Search files failed: ${error.message}`);
      res.status(500).json({ 
        error: 'Search failed',
        message: 'Tìm kiếm thất bại',
        details: error.message
      });
    }
  }

  /**
   * Tìm kiếm đệ quy trong thư mục
   * @private
   * @param {string} dirPath - Đường dẫn thư mục
   * @param {string} query - Từ khóa tìm kiếm
   * @param {string} fileType - Loại file ('all', 'file', 'directory')
   * @returns {Promise<Array>} - Danh sách kết quả
   */
  async _searchFilesRecursive(dirPath, query, fileType) {
    const results = [];
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        
        // Bỏ qua các thư mục hệ thống
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist' || item.name === 'build') {
          continue;
        }

        try {
          const stats = await fs.stat(fullPath);
          
          if (stats.isDirectory()) {
            // Tìm kiếm trong thư mục con
            const subResults = await this._searchFilesRecursive(fullPath, query, fileType);
            results.push(...subResults);
            
            // Thêm thư mục nếu phù hợp
            if ((fileType === 'all' || fileType === 'directory') && 
                item.name.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                name: item.name,
                path: fullPath,
                type: 'directory',
                size: stats.size,
                modified: stats.mtime
              });
            }
          } else {
            // Kiểm tra file
            if ((fileType === 'all' || fileType === 'file') && 
                item.name.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                name: item.name,
                path: fullPath,
                type: 'file',
                size: stats.size,
                modified: stats.mtime,
                extension: path.extname(item.name).toLowerCase()
              });
            }
          }
        } catch (error) {
          // Bỏ qua lỗi permission
          continue;
        }
      }
    } catch (error) {
      // Bỏ qua lỗi permission
    }
    
    return results;
  }
}

module.exports = { RepositoryController };