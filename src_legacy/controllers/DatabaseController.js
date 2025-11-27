/**
 * Database Setup Controller
 * Quản lý database initialization và migration
 */

const DataMigration = require('../migrations/migrate');

/**
 * Register database setup routes
 * @param {Object} app - Express app
 * @param {Object} dbManager - Database manager instance
 */
function registerDatabaseController(app, dbManager) {
  /**
   * Check database setup status
   * GET /api/database/status
   */
  app.get('/api/database/status', (req, res) => {
    try {
      const isSetup = dbManager.isSetup();
      const config = dbManager.getConfig();
      
      res.json({
        success: true,
        isSetup,
        type: config?.type || null,
        config: config ? {
          type: config.type,
          ...(config.type === 'sqlite' && { path: config.path }),
          ...(config.type === 'postgresql' && {
            host: config.host,
            port: config.port,
            database: config.database
          })
        } : null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * Check existing JSON data
   * GET /api/database/check-data
   */
  app.get('/api/database/check-data', (req, res) => {
    try {
      const migration = new DataMigration(dbManager);
      const dataCheck = migration.checkExistingData();
      
      res.json({
        success: true,
        ...dataCheck
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * Test database connection
   * POST /api/database/test-connection
   */
  app.post('/api/database/test-connection', async (req, res) => {
    try {
      const { type, config } = req.body;

      if (!type || !config) {
        return res.status(400).json({
          success: false,
          message: 'Missing database type or configuration'
        });
      }

      const result = await dbManager.testConnection(type, config);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * Initialize database
   * POST /api/database/initialize
   */
  app.post('/api/database/initialize', async (req, res) => {
    try {
      const { type, config, migrateData } = req.body;

      if (!type || !config) {
        return res.status(400).json({
          success: false,
          message: 'Missing database type or configuration'
        });
      }

      // Check if already initialized
      if (dbManager.isSetup()) {
        return res.status(400).json({
          success: false,
          message: 'Database already initialized'
        });
      }

      let initResult;

      // Initialize database connection
      if (type === 'sqlite') {
        initResult = dbManager.initSQLite(config.path);
      } else if (type === 'postgresql') {
        initResult = await dbManager.initPostgreSQL(config);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid database type'
        });
      }

      if (!initResult.success) {
        return res.status(500).json(initResult);
      }

      // Create schema
      const schemaResult = await dbManager.createSchema();
      if (!schemaResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create schema: ' + schemaResult.message
        });
      }

      // Migrate data if requested
      let migrationResults = null;
      if (migrateData) {
        const migration = new DataMigration(dbManager);
        
        // Backup JSON files first
        const backupResult = migration.backupJsonFiles();
        console.log('[DATABASE SETUP] Backup result:', backupResult);

        migrationResults = await migration.migrateAll();
      }

      // Save configuration
      dbManager.saveConfig(dbManager.config);

      res.json({
        success: true,
        message: 'Database initialized successfully',
        type: dbManager.type,
        migration: migrationResults
      });
    } catch (error) {
      console.error('[DATABASE SETUP] Initialization error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * Migrate data from JSON to database
   * POST /api/database/migrate
   */
  app.post('/api/database/migrate', async (req, res) => {
    try {
      if (!dbManager.isSetup()) {
        return res.status(400).json({
          success: false,
          message: 'Database not initialized'
        });
      }

      const migration = new DataMigration(dbManager);
      
      // Backup first
      const backupResult = migration.backupJsonFiles();
      console.log('[MIGRATION] Backup result:', backupResult);

      // Migrate
      const results = await migration.migrateAll();
      
      res.json({
        success: results.success,
        backup: backupResult,
        migration: results
      });
    } catch (error) {
      console.error('[MIGRATION] Error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * Reset database (for development/testing)
   * POST /api/database/reset
   */
  app.post('/api/database/reset', async (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          message: 'Reset not allowed in production'
        });
      }

      // Close current connection
      await dbManager.close();

      // Delete config
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'data', 'db-config.json');
      
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      res.json({
        success: true,
        message: 'Database reset successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });
}

module.exports = { registerDatabaseController };
