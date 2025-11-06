/**
 * Migration Script - Chuyển dữ liệu từ JSON files sang Database
 * Chạy tự động khi database được cấu hình
 */

const fs = require('fs');
const path = require('path');
const { readJson } = require('../utils/file');
const { DatabaseManager } = require('../config/database');

class JSONToDBMigration {
  constructor(logger) {
    this.logger = logger;
    this.dbManager = null;
  }

  /**
   * Khởi tạo database manager
   */
  async initDatabaseManager() {
    try {
      // Đọc config hiện tại
      const configPath = path.join(process.cwd(), 'config.json');
      if (!fs.existsSync(configPath)) {
        throw new Error('config.json not found');
      }

      const config = readJson(configPath);
      
      // Kiểm tra nếu database đã được cấu hình
      if (!config.database || !config.database.enabled) {
        throw new Error('Database not configured in config.json');
      }

      this.dbManager = new DatabaseManager(config.database);
      await this.dbManager.init();
      
      this.logger?.send('[MIGRATION] Database manager initialized');
      return true;
    } catch (error) {
      this.logger?.send(`[MIGRATION] Error initializing database: ${error.message}`);
      return false;
    }
  }

  /**
   * Kiểm tra dữ liệu JSON hiện có
   */
  checkExistingJSONData() {
    const results = {
      hasData: false,
      jobs: 0,
      config: false,
      builds: 0,
      buildHistory: 0
    };

    try {
      // Kiểm tra jobs.json
      const jobsPath = path.join(process.cwd(), 'jobs.json');
      if (fs.existsSync(jobsPath)) {
        const jobs = readJson(jobsPath, []);
        results.jobs = jobs.length;
        results.hasData = results.hasData || jobs.length > 0;
      }

      // Kiểm tra config.json
      const configPath = path.join(process.cwd(), 'config.json');
      if (fs.existsSync(configPath)) {
        results.config = true;
        results.hasData = true;
      }

      // Kiểm tra builds.json
      const buildsPath = path.join(process.cwd(), 'builds.json');
      if (fs.existsSync(buildsPath)) {
        const builds = readJson(buildsPath, []);
        results.builds = builds.length;
        results.hasData = results.hasData || builds.length > 0;
      }

      // Kiểm tra build-history.json
      const buildHistoryPath = path.join(process.cwd(), 'build-history.json');
      if (fs.existsSync(buildHistoryPath)) {
        const buildHistory = readJson(buildHistoryPath, []);
        results.buildHistory = buildHistory.length;
        results.hasData = results.hasData || buildHistory.length > 0;
      }

      return results;
    } catch (error) {
      this.logger?.send(`[MIGRATION] Error checking existing data: ${error.message}`);
      return results;
    }
  }

  /**
   * Migrate jobs từ JSON sang database
   */
  async migrateJobs() {
    try {
      const jobsPath = path.join(process.cwd(), 'jobs.json');
      if (!fs.existsSync(jobsPath)) {
        return { success: true, count: 0, message: 'No jobs.json found' };
      }

      const jobs = readJson(jobsPath, []);
      if (jobs.length === 0) {
        return { success: true, count: 0, message: 'No jobs to migrate' };
      }

      let migratedCount = 0;

      for (const job of jobs) {
        try {
          // Chuẩn bị dữ liệu cho database
          const jobData = {
            id: job.id,
            name: job.name,
            description: job.description || '',
            enabled: job.enabled !== false,
            created_at: job.createdAt || new Date().toISOString(),
            updated_at: job.updatedAt || new Date().toISOString(),
            
            // Git config
            git_provider: job.gitConfig?.provider || 'gitlab',
            git_account: job.gitConfig?.account || '',
            git_token: job.gitConfig?.token || '',
            git_repo_url: job.gitConfig?.repoUrl || '',
            git_repo_path: job.gitConfig?.repoPath || '',
            git_branch: job.gitConfig?.branch || 'main',
            
            // Build config
            build_method: job.buildConfig?.method || 'dockerfile',
            script_path: job.buildConfig?.scriptPath || '',
            json_pipeline_path: job.buildConfig?.jsonPipelinePath || '',
            build_order: job.buildConfig?.buildOrder || 'parallel',
            
            // Docker config
            dockerfile_path: job.buildConfig?.dockerConfig?.dockerfilePath || '',
            context_path: job.buildConfig?.dockerConfig?.contextPath || '',
            image_name: job.buildConfig?.dockerConfig?.imageName || '',
            image_tag: job.buildConfig?.dockerConfig?.imageTag || '',
            auto_tag_increment: job.buildConfig?.dockerConfig?.autoTagIncrement || false,
            registry_url: job.buildConfig?.dockerConfig?.registryUrl || '',
            registry_username: job.buildConfig?.dockerConfig?.registryUsername || '',
            registry_password: job.buildConfig?.dockerConfig?.registryPassword || '',
            
            // Script-specific fields
            script_image_name: job.buildConfig?.imageName || '',
            script_image_tag_number: job.buildConfig?.imageTagNumber || '',
            script_image_tag_text: job.buildConfig?.imageTagText || '',
            script_auto_tag_increment: job.buildConfig?.autoTagIncrement || false,
            script_registry_url: job.buildConfig?.registryUrl || '',
            script_registry_username: job.buildConfig?.registryUsername || '',
            script_registry_password: job.buildConfig?.registryPassword || '',
            
            // Services
            services: JSON.stringify(job.services || []),
            
            // Schedule
            trigger_method: job.schedule?.triggerMethod || 'polling',
            auto_check: job.schedule?.autoCheck || false,
            polling_interval: job.schedule?.polling || 30,
            cron_expression: job.schedule?.cron || '',
            
            // Stats
            total_builds: job.stats?.totalBuilds || 0,
            successful_builds: job.stats?.successfulBuilds || 0,
            failed_builds: job.stats?.failedBuilds || 0,
            last_build_at: job.stats?.lastBuildAt || null,
            last_build_status: job.stats?.lastBuildStatus || null,
            last_triggered_by: job.stats?.triggeredBy || null
          };

          // Insert vào database
          if (this.dbManager.type === 'sqlite') {
            const stmt = this.dbManager.db.prepare(`
              INSERT OR REPLACE INTO jobs (
                id, name, description, enabled, created_at, updated_at,
                git_provider, git_account, git_token, git_repo_url, git_repo_path, git_branch,
                build_method, script_path, json_pipeline_path, build_order,
                dockerfile_path, context_path, image_name, image_tag, auto_tag_increment,
                registry_url, registry_username, registry_password,
                script_image_name, script_image_tag_number, script_image_tag_text,
                script_auto_tag_increment, script_registry_url, script_registry_username,
                script_registry_password, services,
                trigger_method, auto_check, polling_interval, cron_expression,
                total_builds, successful_builds, failed_builds, last_build_at,
                last_build_status, last_triggered_by
              ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
            `);
            
            stmt.run(...Object.values(jobData));
          } else if (this.dbManager.type === 'postgresql') {
            await this.dbManager.pool.query(`
              INSERT INTO jobs (
                id, name, description, enabled, created_at, updated_at,
                git_provider, git_account, git_token, git_repo_url, git_repo_path, git_branch,
                build_method, script_path, json_pipeline_path, build_order,
                dockerfile_path, context_path, image_name, image_tag, auto_tag_increment,
                registry_url, registry_username, registry_password,
                script_image_name, script_image_tag_number, script_image_tag_text,
                script_auto_tag_increment, script_registry_url, script_registry_username,
                script_registry_password, services,
                trigger_method, auto_check, polling_interval, cron_expression,
                total_builds, successful_builds, failed_builds, last_build_at,
                last_build_status, last_triggered_by
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42
              )
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                enabled = EXCLUDED.enabled,
                updated_at = EXCLUDED.updated_at,
                git_provider = EXCLUDED.git_provider,
                git_account = EXCLUDED.git_account,
                git_token = EXCLUDED.git_token,
                git_repo_url = EXCLUDED.git_repo_url,
                git_repo_path = EXCLUDED.git_repo_path,
                git_branch = EXCLUDED.git_branch,
                build_method = EXCLUDED.build_method,
                script_path = EXCLUDED.script_path,
                json_pipeline_path = EXCLUDED.json_pipeline_path,
                build_order = EXCLUDED.build_order,
                dockerfile_path = EXCLUDED.dockerfile_path,
                context_path = EXCLUDED.context_path,
                image_name = EXCLUDED.image_name,
                image_tag = EXCLUDED.image_tag,
                auto_tag_increment = EXCLUDED.auto_tag_increment,
                registry_url = EXCLUDED.registry_url,
                registry_username = EXCLUDED.registry_username,
                registry_password = EXCLUDED.registry_password,
                script_image_name = EXCLUDED.script_image_name,
                script_image_tag_number = EXCLUDED.script_image_tag_number,
                script_image_tag_text = EXCLUDED.script_image_tag_text,
                script_auto_tag_increment = EXCLUDED.script_auto_tag_increment,
                script_registry_url = EXCLUDED.script_registry_url,
                script_registry_username = EXCLUDED.script_registry_username,
                script_registry_password = EXCLUDED.script_registry_password,
                services = EXCLUDED.services,
                trigger_method = EXCLUDED.trigger_method,
                auto_check = EXCLUDED.auto_check,
                polling_interval = EXCLUDED.polling_interval,
                cron_expression = EXCLUDED.cron_expression,
                total_builds = EXCLUDED.total_builds,
                successful_builds = EXCLUDED.successful_builds,
                failed_builds = EXCLUDED.failed_builds,
                last_build_at = EXCLUDED.last_build_at,
                last_build_status = EXCLUDED.last_build_status,
                last_triggered_by = EXCLUDED.last_triggered_by
            `, Object.values(jobData));
          }

          migratedCount++;
          this.logger?.send(`[MIGRATION] Migrated job: ${job.name}`);
        } catch (error) {
          this.logger?.send(`[MIGRATION] Error migrating job ${job.name}: ${error.message}`);
        }
      }

      return {
        success: true,
        count: migratedCount,
        message: `Migrated ${migratedCount} jobs successfully`
      };
    } catch (error) {
      this.logger?.send(`[MIGRATION] Jobs migration error: ${error.message}`);
      return { success: false, count: 0, message: error.message };
    }
  }

  /**
   * Migrate config từ JSON sang database
   */
  async migrateConfig() {
    try {
      const configPath = path.join(process.cwd(), 'config.json');
      if (!fs.existsSync(configPath)) {
        return { success: true, count: 0, message: 'No config.json found' };
      }

      const config = readJson(configPath, {});
      
      if (this.dbManager.type === 'sqlite') {
        const stmt = this.dbManager.db.prepare(`
          INSERT OR REPLACE INTO config (id, data, updated_at)
          VALUES (?, ?, ?)
        `);
        stmt.run('main_config', JSON.stringify(config), new Date().toISOString());
      } else if (this.dbManager.type === 'postgresql') {
        await this.dbManager.pool.query(`
          INSERT INTO config (id, data, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `, ['main_config', JSON.stringify(config), new Date().toISOString()]);
      }

      this.logger?.send('[MIGRATION] Migrated config');
      return { success: true, count: 1, message: 'Config migrated successfully' };
    } catch (error) {
      this.logger?.send(`[MIGRATION] Config migration error: ${error.message}`);
      return { success: false, count: 0, message: error.message };
    }
  }

  /**
   * Migrate builds từ JSON sang database
   */
  async migrateBuilds() {
    try {
      const buildsPath = path.join(process.cwd(), 'builds.json');
      if (!fs.existsSync(buildsPath)) {
        return { success: true, count: 0, message: 'No builds.json found' };
      }

      const builds = readJson(buildsPath, []);
      if (builds.length === 0) {
        return { success: true, count: 0, message: 'No builds to migrate' };
      }

      let migratedCount = 0;

      for (const build of builds) {
        try {
          const buildData = {
            id: build.id,
            job_id: build.jobId,
            status: build.status,
            start_time: build.startTime,
            end_time: build.endTime,
            duration: build.duration,
            triggered_by: build.triggeredBy,
            commit_hash: build.commitHash,
            commit_message: build.commitMessage,
            commit_author: build.commitAuthor,
            branch: build.branch,
            image_name: build.imageName,
            image_tag: build.imageTag,
            log_file: build.logFile,
            error_message: build.errorMessage,
            created_at: build.createdAt || new Date().toISOString()
          };

          if (this.dbManager.type === 'sqlite') {
            const stmt = this.dbManager.db.prepare(`
              INSERT OR REPLACE INTO builds (
                id, job_id, status, start_time, end_time, duration,
                triggered_by, commit_hash, commit_message, commit_author,
                branch, image_name, image_tag, log_file, error_message, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(...Object.values(buildData));
          } else if (this.dbManager.type === 'postgresql') {
            await this.dbManager.pool.query(`
              INSERT INTO builds (
                id, job_id, status, start_time, end_time, duration,
                triggered_by, commit_hash, commit_message, commit_author,
                branch, image_name, image_tag, log_file, error_message, created_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
              )
              ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                end_time = EXCLUDED.end_time,
                duration = EXCLUDED.duration,
                error_message = EXCLUDED.error_message
            `, Object.values(buildData));
          }

          migratedCount++;
          this.logger?.send(`[MIGRATION] Migrated build: ${build.id}`);
        } catch (error) {
          this.logger?.send(`[MIGRATION] Error migrating build ${build.id}: ${error.message}`);
        }
      }

      return {
        success: true,
        count: migratedCount,
        message: `Migrated ${migratedCount} builds successfully`
      };
    } catch (error) {
      this.logger?.send(`[MIGRATION] Builds migration error: ${error.message}`);
      return { success: false, count: 0, message: error.message };
    }
  }

  /**
   * Chạy toàn bộ quá trình migration
   */
  async runMigration() {
    try {
      this.logger?.send('[MIGRATION] Starting data migration from JSON to Database');
      
      // Kiểm tra dữ liệu hiện có
      const dataCheck = this.checkExistingJSONData();
      if (!dataCheck.hasData) {
        this.logger?.send('[MIGRATION] No JSON data found to migrate');
        return { success: true, message: 'No data to migrate' };
      }

      this.logger?.send(`[MIGRATION] Found data: ${dataCheck.jobs} jobs, ${dataCheck.builds} builds, ${dataCheck.buildHistory} build history`);

      // Khởi tạo database
      const dbInitialized = await this.initDatabaseManager();
      if (!dbInitialized) {
        throw new Error('Failed to initialize database');
      }

      // Chạy migrations
      const results = {};
      
      if (dataCheck.config) {
        results.config = await this.migrateConfig();
      }
      
      if (dataCheck.jobs > 0) {
        results.jobs = await this.migrateJobs();
      }
      
      if (dataCheck.builds > 0) {
        results.builds = await this.migrateBuilds();
      }

      this.logger?.send('[MIGRATION] Migration completed successfully');
      return {
        success: true,
        results,
        message: 'Migration completed successfully'
      };
    } catch (error) {
      this.logger?.send(`[MIGRATION] Migration failed: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = JSONToDBMigration;