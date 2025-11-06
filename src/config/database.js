/**
 * Database Configuration & Connection Manager
 * Hỗ trợ SQLite và PostgreSQL
 */

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { readJson, writeJson, ensureDir } = require('../utils/file');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.pool = null;
    this.config = null;
    this.type = null; // 'sqlite' hoặc 'postgresql'
  }

  /**
   * Kiểm tra xem database đã được setup chưa
   * @returns {boolean}
   */
  isSetup() {
    try {
      const configPath = path.join(process.cwd(), 'data', 'db-config.json');
      if (!fs.existsSync(configPath)) {
        return false;
      }
      
      const config = readJson(configPath);
      return config && config.type && config.initialized === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Lấy database configuration
   * @returns {Object|null}
   */
  getConfig() {
    try {
      const configPath = path.join(process.cwd(), 'data', 'db-config.json');
      return readJson(configPath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Lưu database configuration
   * @param {Object} config - Database configuration
   */
  saveConfig(config) {
    ensureDir(path.join(process.cwd(), 'data'));
    const configPath = path.join(process.cwd(), 'data', 'db-config.json');
    writeJson(configPath, {
      ...config,
      initialized: true,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Khởi tạo SQLite database
   * @param {string} dbPath - Đường dẫn đến file database
   * @returns {Object} - Database instance
   */
  initSQLite(dbPath) {
    try {
      // Ensure directory exists
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : null
      });
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      this.type = 'sqlite';
      this.config = { type: 'sqlite', path: dbPath };
      
      console.log(`[DATABASE] SQLite initialized: ${dbPath}`);
      return { success: true, message: 'SQLite initialized successfully' };
    } catch (error) {
      console.error('[DATABASE] SQLite initialization error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Khởi tạo PostgreSQL connection pool
   * @param {Object} config - PostgreSQL configuration
   * @returns {Object} - Connection status
   */
  async initPostgreSQL(config) {
    try {
      this.pool = new Pool({
        user: config.username,
        host: config.host || 'localhost',
        database: config.database,
        password: config.password,
        port: config.port || 5432,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.type = 'postgresql';
      this.config = { 
        type: 'postgresql', 
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username
        // Don't save password in config for security
      };

      console.log(`[DATABASE] PostgreSQL connected: ${config.host}:${config.port}/${config.database}`);
      return { success: true, message: 'PostgreSQL connected successfully' };
    } catch (error) {
      console.error('[DATABASE] PostgreSQL connection error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Test database connection
   * @param {string} type - Database type ('sqlite' or 'postgresql')
   * @param {Object} config - Database configuration
   * @returns {Promise<Object>}
   */
  async testConnection(type, config) {
    try {
      if (type === 'sqlite') {
        const testDb = new Database(config.path);
        testDb.exec('SELECT 1');
        testDb.close();
        return { success: true, message: 'SQLite connection successful' };
      } else if (type === 'postgresql') {
        const testPool = new Pool({
          user: config.username,
          host: config.host || 'localhost',
          database: config.database,
          password: config.password,
          port: config.port || 5432,
          connectionTimeoutMillis: 5000,
        });

        const client = await testPool.connect();
        await client.query('SELECT 1');
        client.release();
        await testPool.end();

        return { success: true, message: 'PostgreSQL connection successful' };
      } else {
        return { success: false, message: 'Invalid database type' };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Tạo database schema
   * @returns {Promise<Object>}
   */
  async createSchema() {
    const schema = require('../db/schema');
    
    try {
      if (this.type === 'sqlite') {
        this.db.exec(schema.sqlite);
        return { success: true, message: 'Schema created successfully' };
      } else if (this.type === 'postgresql') {
        await this.pool.query(schema.postgresql);
        return { success: true, message: 'Schema created successfully' };
      }
    } catch (error) {
      console.error('[DATABASE] Schema creation error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Execute query (Universal interface)
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>}
   */
  async query(sql, params = []) {
    if (this.type === 'sqlite') {
      const stmt = this.db.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return stmt.all(...params);
      } else {
        return stmt.run(...params);
      }
    } else if (this.type === 'postgresql') {
      const result = await this.pool.query(sql, params);
      return result.rows;
    }
  }

  /**
   * Execute multiple queries in transaction
   * @param {Function} callback - Transaction callback
   * @returns {Promise}
   */
  async transaction(callback) {
    if (this.type === 'sqlite') {
      const transaction = this.db.transaction(callback);
      return transaction();
    } else if (this.type === 'postgresql') {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await callback(client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      this.db.close();
    }
    if (this.pool) {
      await this.pool.end();
    }
  }
}

// Singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;
