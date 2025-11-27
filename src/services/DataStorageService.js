/**
 * DataStorageService - Service quản lý lưu trữ dữ liệu tự động
 * Tự động chuyển đổi giữa JSON files và Database dựa trên cấu hình
 * @class
 */

const fs = require('fs');
const { DatabaseManager } = require('../config/database');
const { readJson, writeJson } = require('../utils/file');
const JSONToDBMigration = require('../migrations/migrate-to-db');
const path = require('path');

class DataStorageService {
  /**
   * Tạo DataStorageService instance
   * @constructor
   * @param {Object} options - Options
   * @param {Object} options.logger - Logger instance
   * @param {string} options.dataDir - Data directory path
   */
  constructor({ logger, dataDir ,dbManager}) {
    this.logger = logger;
    this.dataDir = dataDir;
    this.usingDatabase = false;
    this.migrationRun = false;
    this.migrationService = new JSONToDBMigration({ logger });
    
    // Đường dẫn các file JSON mặc định
    this.jsonPaths = {
      config: path.join(dataDir, 'config.json'),
      builds: path.join(dataDir, 'builds.json'),
      jobs: path.join(dataDir, 'jobs.json'),
      buildHistory: path.join(dataDir, 'build-history.json'),
      users: path.join(dataDir, 'users.json')
    };
    
    // Kiểm tra và cập nhật trạng thái
    this.checkStorageMode();
  }

  /**
   * Kiểm tra chế độ lưu trữ hiện tại
   */
  checkStorageMode() {
    try {
      // Đọc config để kiểm tra database setup
      const configPath = path.join(this.dataDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const config = readJson(configPath, {});
        this.usingDatabase = !!(config.database && config.database.enabled);
      } else {
        this.usingDatabase = false;
      }
      
      if (this.usingDatabase) {
        this.logger?.send('[STORAGE] Đang sử dụng Database để lưu trữ dữ liệu');
      } else {
        this.logger?.send('[STORAGE] Đang sử dụng JSON files để lưu trữ dữ liệu');
      }
    } catch (error) {
      this.logger?.send(`[STORAGE] Lỗi kiểm tra chế độ lưu trữ: ${error.message}`);
      this.usingDatabase = false;
    }
  }

  /**
   * Lấy dữ liệu - tự động chọn nguồn dữ liệu
   * @param {string} type - Loại dữ liệu ('config', 'builds', 'jobs', 'buildHistory')
   * @param {any} defaultValue - Giá trị mặc định nếu không tìm thấy
   * @returns {Promise<any>}
   */
  async getData(type, defaultValue = null) {
    if (this.usingDatabase) {
      return await this.getFromDatabase(type);
    } else {
      return this.getFromJson(type, defaultValue);
    }
  }

  /**
   * Lưu dữ liệu - tự động chọn đích lưu trữ
   * @param {string} type - Loại dữ liệu
   * @param {any} data - Dữ liệu cần lưu
   * @returns {Promise<boolean>}
   */
  async saveData(type, data) {
    if (this.usingDatabase) {
      return await this.saveToDatabase(type, data);
    } else {
      return this.saveToJson(type, data);
    }
  }

  /**
   * Lấy dữ liệu từ JSON file
   * @param {string} type - Loại dữ liệu
   * @param {any} defaultValue - Giá trị mặc định
   * @returns {any}
   */
  getFromJson(type, defaultValue) {
    const filePath = this.jsonPaths[type];
    if (!filePath) {
      throw new Error(`Loại dữ liệu không hợp lệ: ${type}`);
    }
    
    return readJson(filePath, defaultValue);
  }

  /**
   * Lưu dữ liệu vào JSON file
   * @param {string} type - Loại dữ liệu
   * @param {any} data - Dữ liệu cần lưu
   * @returns {boolean}
   */
  saveToJson(type, data) {
    const filePath = this.jsonPaths[type];
    if (!filePath) {
      throw new Error(`Loại dữ liệu không hợp lệ: ${type}`);
    }
    
    const success = writeJson(filePath, data);
    if (!success) {
      throw new Error(`Failed to write data to ${filePath}`);
    }
    return true;
  }

  /**
   * Lấy dữ liệu từ Database
   * @param {string} type - Loại dữ liệu
   * @returns {Promise<any>}
   */
  async getFromDatabase(type) {
    try {
      const tableName = this.getTableName(type);
      const result = await dbManager.query(`SELECT data FROM ${tableName} WHERE id = ?`, [1]);
      
      if (result && result.length > 0) {
        return JSON.parse(result[0].data);
      }
      
      return null;
    } catch (error) {
      this.logger?.send(`[STORAGE] Lỗi lấy dữ liệu từ database: ${error.message}`);
      return null;
    }
  }

  /**
   * Lưu dữ liệu vào Database
   * @param {string} type - Loại dữ liệu
   * @param {any} data - Dữ liệu cần lưu
   * @returns {Promise<boolean>}
   */
  async saveToDatabase(type, data) {
    try {
      const tableName = this.getTableName(type);
      const jsonData = JSON.stringify(data);
      
      // Kiểm tra xem bản ghi đã tồn tại chưa
      const existing = await dbManager.query(`SELECT id FROM ${tableName} WHERE id = ?`, [1]);
      
      if (existing && existing.length > 0) {
        // Update existing record
        await dbManager.query(`UPDATE ${tableName} SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
          [jsonData, 1]);
      } else {
        // Insert new record
        await dbManager.query(`INSERT INTO ${tableName} (id, data) VALUES (?, ?)`, [1, jsonData]);
      }
      
      return true;
    } catch (error) {
      this.logger?.send(`[STORAGE] Lỗi lưu dữ liệu vào database: ${error.message}`);
      return false;
    }
  }

  /**
   * Chuyển đổi dữ liệu từ JSON sang Database
   * @returns {Promise<boolean>}
   */
  async migrateToDatabase() {
    if (!dbManager.isSetup()) {
      return false;
    }

    try {
      this.logger?.send('[STORAGE] Bắt đầu chuyển đổi dữ liệu từ JSON sang Database...');
      
      // Migrate từng loại dữ liệu
      const types = ['config', 'builds', 'jobs', 'buildHistory'];
      
      for (const type of types) {
        const jsonData = this.getFromJson(type, null);
        if (jsonData !== null) {
          await this.saveToDatabase(type, jsonData);
          this.logger?.send(`[STORAGE] Đã chuyển đổi ${type} sang Database`);
        }
      }
      
      this.usingDatabase = true;
      this.logger?.send('[STORAGE] Chuyển đổi dữ liệu hoàn tất!');
      return true;
      
    } catch (error) {
      this.logger?.send(`[STORAGE] Lỗi chuyển đổi dữ liệu: ${error.message}`);
      return false;
    }
  }

  /**
   * Lấy tên table tương ứng với loại dữ liệu
   * @param {string} type - Loại dữ liệu
   * @returns {string}
   */
  getTableName(type) {
    const tableMap = {
      config: 'system_config',
      builds: 'builds',
      jobs: 'jobs',
      buildHistory: 'build_history',
      users: 'users'
    };
    
    return tableMap[type] || type;
  }

  /**
   * Kiểm tra xem đang sử dụng database không
   * @returns {boolean}
   */
  isUsingDatabase() {
    return this.usingDatabase;
  }

  /**
   * Cập nhật trạng thái lưu trữ (gọi khi database được setup)
   */
  updateStorageMode() {
    this.checkStorageMode();
  }
}

module.exports = { DataStorageService };