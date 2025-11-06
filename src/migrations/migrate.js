/**
 * Data Migration Script
 * Migrate từ JSON files sang Database (SQLite/PostgreSQL)
 */

const path = require('path');
const fs = require('fs');
const { readJson } = require('../utils/file');

class DataMigration {
  constructor(dbManager) {
    this.dbManager = dbManager;
  }

  /**
   * Kiểm tra xem có dữ liệu JSON để migrate không
   * @returns {Object}
   */
  checkExistingData() {
    const dataDir = path.join(process.cwd(), 'data');
    const results = {
      hasData: false,
      users: 0,
      jobs: 0,
      config: false
    };

    try {
      // Check users.json
      const usersPath = path.join(dataDir, 'users.json');
      if (fs.existsSync(usersPath)) {
        const users = readJson(usersPath) || [];
        results.users = users.length;
        results.hasData = results.hasData || users.length > 0;
      }

      // Check jobs.json
      const jobsPath = path.join(dataDir, 'jobs.json');
      if (fs.existsSync(jobsPath)) {
        const jobs = readJson(jobsPath) || [];
        results.jobs = jobs.length;
        results.hasData = results.hasData || jobs.length > 0;
      }

      // Check config.json
      const configPath = path.join(dataDir, 'config.json');
      if (fs.existsSync(configPath)) {
        results.config = true;
        results.hasData = true;
      }

      return results;
    } catch (error) {
      console.error('[MIGRATION] Error checking existing data:', error);
      return results;
    }
  }

  /**
   * Migrate users từ JSON sang database
   * @returns {Promise<Object>}
   */
  async migrateUsers() {
    try {
      const usersPath = path.join(process.cwd(), 'data', 'users.json');
      if (!fs.existsSync(usersPath)) {
        return { success: true, count: 0, message: 'No users to migrate' };
      }

      const users = readJson(usersPath) || [];
      if (users.length === 0) {
        return { success: true, count: 0, message: 'No users to migrate' };
      }

      let migratedCount = 0;
      const dbType = this.dbManager.type;

      for (const user of users) {
        try {
          if (dbType === 'sqlite') {
            const stmt = this.dbManager.db.prepare(`
              INSERT OR REPLACE INTO users (id, username, password, role, must_change_password, created_at, last_login)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
              user.id,
              user.username,
              user.password,
              user.role,
              user.mustChangePassword ? 1 : 0,
              user.createdAt || new Date().toISOString(),
              user.lastLogin || null
            );
          } else if (dbType === 'postgresql') {
            await this.dbManager.pool.query(`
              INSERT INTO users (id, username, password, role, must_change_password, created_at, last_login)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (id) DO UPDATE SET
                password = EXCLUDED.password,
                role = EXCLUDED.role,
                must_change_password = EXCLUDED.must_change_password,
                last_login = EXCLUDED.last_login
            `, [
              user.id,
              user.username,
              user.password,
              user.role,
              user.mustChangePassword || false,
              user.createdAt || new Date().toISOString(),
              user.lastLogin || null
            ]);
          }
          migratedCount++;
        } catch (error) {
          console.error(`[MIGRATION] Error migrating user ${user.username}:`, error);
        }
      }

      return {
        success: true,
        count: migratedCount,
        message: `Migrated ${migratedCount} users successfully`
      };
    } catch (error) {
      console.error('[MIGRATION] Users migration error:', error);
      return { success: false, count: 0, message: error.message };
    }
  }

  /**
   * Migrate jobs từ JSON sang database
   * @returns {Promise<Object>}
   */
  async migrateJobs() {
    try {
      const jobsPath = path.join(process.cwd(), 'data', 'jobs.json');
      if (!fs.existsSync(jobsPath)) {
        return { success: true, count: 0, message: 'No jobs to migrate' };
      }

      const jobs = readJson(jobsPath) || [];
      if (jobs.length === 0) {
        return { success: true, count: 0, message: 'No jobs to migrate' };
      }

      let migratedCount = 0;
      const dbType = this.dbManager.type;

      for (const job of jobs) {
        try {
          const services = Array.isArray(job.services) ? JSON.stringify(job.services) : (job.services || '[]');
          
          if (dbType === 'sqlite') {
            // Insert job
            const jobStmt = this.dbManager.db.prepare(`
              INSERT OR REPLACE INTO jobs (
                id, name, enabled, git_provider, git_repo_url, git_branch,
                git_username, git_password, docker_enabled, docker_registry,
                docker_image_name, docker_tag, schedule_auto_check,
                schedule_trigger_method, schedule_interval, services, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            jobStmt.run(
              job.id,
              job.name,
              job.enabled ? 1 : 0,
              job.git?.provider || 'gitlab',
              job.git?.repoUrl || '',
              job.git?.branch || 'main',
              job.git?.credentials?.username || null,
              job.git?.credentials?.password || null,
              job.docker?.enabled ? 1 : 0,
              job.docker?.registry || null,
              job.docker?.imageName || null,
              job.docker?.tag || 'latest',
              job.schedule?.autoCheck ? 1 : 0,
              job.schedule?.triggerMethod || 'polling',
              job.schedule?.interval || 300000,
              services,
              job.createdAt || new Date().toISOString()
            );

            // Insert job stats
            if (job.stats) {
              const statsStmt = this.dbManager.db.prepare(`
                INSERT OR REPLACE INTO job_stats (
                  job_id, total_runs, success_count, failure_count,
                  last_run, last_commit, triggered_by_polling,
                  triggered_by_webhook, triggered_by_manual
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              
              statsStmt.run(
                job.id,
                job.stats.totalRuns || 0,
                job.stats.successCount || 0,
                job.stats.failureCount || 0,
                job.stats.lastRun || null,
                job.stats.lastCommit || null,
                job.stats.triggeredBy?.polling || 0,
                job.stats.triggeredBy?.webhook || 0,
                job.stats.triggeredBy?.manual || 0
              );
            }
          } else if (dbType === 'postgresql') {
            // Insert job
            await this.dbManager.pool.query(`
              INSERT INTO jobs (
                id, name, enabled, git_provider, git_repo_url, git_branch,
                git_username, git_password, docker_enabled, docker_registry,
                docker_image_name, docker_tag, schedule_auto_check,
                schedule_trigger_method, schedule_interval, services, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                enabled = EXCLUDED.enabled,
                git_provider = EXCLUDED.git_provider,
                git_repo_url = EXCLUDED.git_repo_url,
                git_branch = EXCLUDED.git_branch
            `, [
              job.id,
              job.name,
              job.enabled || false,
              job.git?.provider || 'gitlab',
              job.git?.repoUrl || '',
              job.git?.branch || 'main',
              job.git?.credentials?.username || null,
              job.git?.credentials?.password || null,
              job.docker?.enabled || false,
              job.docker?.registry || null,
              job.docker?.imageName || null,
              job.docker?.tag || 'latest',
              job.schedule?.autoCheck || false,
              job.schedule?.triggerMethod || 'polling',
              job.schedule?.interval || 300000,
              services,
              job.createdAt || new Date().toISOString()
            ]);

            // Insert job stats
            if (job.stats) {
              await this.dbManager.pool.query(`
                INSERT INTO job_stats (
                  job_id, total_runs, success_count, failure_count,
                  last_run, last_commit, triggered_by_polling,
                  triggered_by_webhook, triggered_by_manual
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (job_id) DO UPDATE SET
                  total_runs = EXCLUDED.total_runs,
                  success_count = EXCLUDED.success_count,
                  failure_count = EXCLUDED.failure_count,
                  last_run = EXCLUDED.last_run,
                  last_commit = EXCLUDED.last_commit
              `, [
                job.id,
                job.stats.totalRuns || 0,
                job.stats.successCount || 0,
                job.stats.failureCount || 0,
                job.stats.lastRun || null,
                job.stats.lastCommit || null,
                job.stats.triggeredBy?.polling || 0,
                job.stats.triggeredBy?.webhook || 0,
                job.stats.triggeredBy?.manual || 0
              ]);
            }
          }
          
          migratedCount++;
        } catch (error) {
          console.error(`[MIGRATION] Error migrating job ${job.name}:`, error);
        }
      }

      return {
        success: true,
        count: migratedCount,
        message: `Migrated ${migratedCount} jobs successfully`
      };
    } catch (error) {
      console.error('[MIGRATION] Jobs migration error:', error);
      return { success: false, count: 0, message: error.message };
    }
  }

  /**
   * Migrate config từ JSON sang database
   * @returns {Promise<Object>}
   */
  async migrateConfig() {
    try {
      const configPath = path.join(process.cwd(), 'data', 'config.json');
      if (!fs.existsSync(configPath)) {
        return { success: true, count: 0, message: 'No config to migrate' };
      }

      const config = readJson(configPath);
      if (!config) {
        return { success: true, count: 0, message: 'No config to migrate' };
      }

      let migratedCount = 0;
      const dbType = this.dbManager.type;

      // Flatten config object to key-value pairs
      const flattenConfig = (obj, prefix = '') => {
        const pairs = [];
        for (const [key, value] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            pairs.push(...flattenConfig(value, fullKey));
          } else {
            pairs.push([fullKey, JSON.stringify(value)]);
          }
        }
        return pairs;
      };

      const configPairs = flattenConfig(config);

      for (const [key, value] of configPairs) {
        try {
          if (dbType === 'sqlite') {
            const stmt = this.dbManager.db.prepare(`
              INSERT OR REPLACE INTO config (key, value, updated_at)
              VALUES (?, ?, ?)
            `);
            stmt.run(key, value, new Date().toISOString());
          } else if (dbType === 'postgresql') {
            await this.dbManager.pool.query(`
              INSERT INTO config (key, value, updated_at)
              VALUES ($1, $2, $3)
              ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = EXCLUDED.updated_at
            `, [key, value, new Date().toISOString()]);
          }
          migratedCount++;
        } catch (error) {
          console.error(`[MIGRATION] Error migrating config key ${key}:`, error);
        }
      }

      return {
        success: true,
        count: migratedCount,
        message: `Migrated ${migratedCount} config entries successfully`
      };
    } catch (error) {
      console.error('[MIGRATION] Config migration error:', error);
      return { success: false, count: 0, message: error.message };
    }
  }

  /**
   * Migrate tất cả dữ liệu
   * @returns {Promise<Object>}
   */
  async migrateAll() {
    console.log('[MIGRATION] Starting full data migration...');
    
    const results = {
      success: true,
      users: null,
      jobs: null,
      config: null,
      errors: []
    };

    try {
      // Migrate users
      results.users = await this.migrateUsers();
      if (!results.users.success) {
        results.errors.push(`Users: ${results.users.message}`);
      }

      // Migrate jobs
      results.jobs = await this.migrateJobs();
      if (!results.jobs.success) {
        results.errors.push(`Jobs: ${results.jobs.message}`);
      }

      // Migrate config
      results.config = await this.migrateConfig();
      if (!results.config.success) {
        results.errors.push(`Config: ${results.config.message}`);
      }

      results.success = results.errors.length === 0;
      
      console.log('[MIGRATION] Migration completed:', {
        users: results.users.count,
        jobs: results.jobs.count,
        config: results.config.count,
        success: results.success
      });

      return results;
    } catch (error) {
      console.error('[MIGRATION] Migration failed:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Backup JSON files trước khi migrate
   * @returns {Object}
   */
  backupJsonFiles() {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      const backupDir = path.join(dataDir, 'backup-' + Date.now());
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const filesToBackup = ['users.json', 'jobs.json', 'config.json'];
      let backedUpCount = 0;

      for (const file of filesToBackup) {
        const source = path.join(dataDir, file);
        if (fs.existsSync(source)) {
          const dest = path.join(backupDir, file);
          fs.copyFileSync(source, dest);
          backedUpCount++;
        }
      }

      return {
        success: true,
        count: backedUpCount,
        backupDir,
        message: `Backed up ${backedUpCount} files to ${backupDir}`
      };
    } catch (error) {
      console.error('[MIGRATION] Backup error:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = DataMigration;
