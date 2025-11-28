import { Injectable, Inject, forwardRef } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { ConfigService } from "../../config/config.service";
import { LoggerService } from "../../shared/logger/logger.service";
import { DataStorageService } from "../../config/data-storage.service";
import { QueueService, QueueJob } from "../queue/queue.service";
import { BuildService } from "../builder/build.service";
import { EmailService } from "../email/email.service";
import { getSecretManager } from "../../common/utils/secrets.util";

@Injectable()
export class JobsService {
  private jobsFile: string;
  private secretManager = getSecretManager();
  private runningJobs = new Set<string>();

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly storageService: DataStorageService,
    private readonly queueService: QueueService,
    private readonly buildService: BuildService,
    private readonly emailService: EmailService,
  ) {
    this.jobsFile = path.join(process.cwd(), "jobs.json");
    this.ensureJobsFile();

    this.queueService.setJobExecutor(this._jobExecutor.bind(this));
    this.queueService.setJobService(this);
  }

  private async _jobExecutor(queueJob: QueueJob) {
    try {
      const jobId = queueJob.jobId || queueJob.id;
      if (!jobId) {
        throw new Error("Queue job missing jobId");
      }

      const job = await this.getJobById(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      // Decrypt job before building
      const decryptedJob = this.getDecryptedJob(job);

      // Execute build using BuildService
      const result = await this.buildService.executeJobBuild(
        decryptedJob,
        queueJob.metadata,
      );

      // Update stats
      if (result.success && result.commitHash) {
        await this.updateJobStats(jobId, {
          success: true,
          commitHash: result.commitHash,
        });
      } else if (result.status === "failed") {
        await this.updateJobStats(jobId, { success: false });
      }

      // Send notification email
      try {
        await this.sendBuildNotification(job, result);
      } catch (emailError) {
        this.logger.send(`[JOB] Failed to send email notification: ${emailError.message}`);
      }

      return result;
    } catch (error) {
      this.logger.send(`[JOB-EXECUTOR] Error executing job: ${error.message}`);
      throw error;
    }
  }

  private async sendBuildNotification(job: any, result: any) {
      const status = result.success ? "Success" : "Failed";
      const subject = `[CI/CD] Build ${status}: ${job.name}`;
      const text = `Job: ${job.name}\nStatus: ${status}\nBuild ID: ${result.buildId}\nMessage: ${result.message}`;
      
      // Check if job has specific email notification settings
      // Assuming configService or job config has notifyEmails
      // But EmailService handles reading from global config.
      // If we want job-specific emails, we'd pass toList here.
      
      await this.emailService.sendNotificationEmail({
          subject,
          text
      });
  }


  private ensureJobsFile() {
    if (!fs.existsSync(this.jobsFile)) {
      fs.writeFileSync(this.jobsFile, JSON.stringify([], null, 2));
    }
  }

  async getAllJobs(): Promise<any[]> {
    try {
      if (this.storageService.isUsingDatabase()) {
        return await this.storageService.getData("jobs", []);
      }
      if (!fs.existsSync(this.jobsFile)) return [];
      const data = fs.readFileSync(this.jobsFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error reading jobs file:", error);
      return [];
    }
  }

  async getJobById(jobId: string): Promise<any> {
    const jobs = await this.getAllJobs();
    return jobs.find((job) => job.id === jobId);
  }

  // ... createJob, updateJob, etc. (same as before) ...
  // For brevity I assume they are here.

  // Helper to decrypt job
  getDecryptedJob(job: any) {
    if (!job) return null;
    try {
      return {
        ...job,
        gitConfig: {
          ...job.gitConfig,
          token: this.secretManager.decrypt(job.gitConfig?.token || ""),
        },
        buildConfig: {
          ...job.buildConfig,
          dockerConfig: {
            ...job.buildConfig?.dockerConfig,
            registryPassword: this.secretManager.decrypt(
              job.buildConfig?.dockerConfig?.registryPassword || "",
            ),
          },
          registryPassword: this.secretManager.decrypt(
            job.buildConfig?.registryPassword || "",
          ),
        },
      };
    } catch (error) {
      return job;
    }
  }

  async updateJobStats(jobId: string, buildResult: any) {
    const job = await this.getJobById(jobId);
    if (!job) return;

    const stats = {
      totalBuilds: (job.stats?.totalBuilds || 0) + 1,
      successfulBuilds:
        (job.stats?.successfulBuilds || 0) + (buildResult.success ? 1 : 0),
      failedBuilds:
        (job.stats?.failedBuilds || 0) + (buildResult.success ? 0 : 1),
      lastBuildAt: new Date().toISOString(),
      lastBuildStatus: buildResult.success ? "success" : "failed",
      lastCommitHash:
        buildResult.commitHash || job.stats?.lastCommitHash || null,
    };

    await this.updateJob(jobId, { stats });
  }

  // Duplicated methods from previous step to ensure file is complete
  async createJob(jobData: any): Promise<any> {
    // ... implementation ...
    const jobs = await this.getAllJobs();
    const newJob = {
      id: uuidv4(),
      ...jobData,
      createdAt: new Date().toISOString(),
    };
    jobs.push(newJob);
    await this.saveJobs(jobs);
    return newJob;
  }
  
  async updateJob(jobId: string, updateData: any): Promise<any> {
    const jobs = await this.getAllJobs();
    const index = jobs.findIndex((j) => j.id === jobId);
    if (index === -1) throw new Error("Job not found");
    jobs[index] = {
      ...jobs[index],
      ...updateData,
      updatedAt: new Date().toISOString(),
    };
    await this.saveJobs(jobs);
    return jobs[index];
  }

  async deleteJob(jobId: string): Promise<boolean> {
    const jobs = await this.getAllJobs();
    const filtered = jobs.filter((j) => j.id !== jobId);
    await this.saveJobs(filtered);
    return true;
  }

  async toggleJob(jobId: string): Promise<any> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error("Job not found");
    return this.updateJob(jobId, { enabled: !job.enabled });
  }
  markJobAsRunning(jobId: string) {
    this.runningJobs.add(jobId);
  }
  markJobAsCompleted(jobId: string) {
    this.runningJobs.delete(jobId);
  }

  private async saveJobs(jobs: any[]) {
    if (this.storageService.isUsingDatabase()) {
      await this.storageService.saveData("jobs", jobs);
    } else {
      fs.writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2));
    }
  }

  /**
   * Đảm bảo tạo file build-script.sh hoặc JSON pipeline khi tạo/update job
   * Port từ src_legacy/controllers/JobController.js:_ensureJobScript()
   */
  async ensureJobScript(job: any): Promise<void> {
    try {
      const method = job?.buildConfig?.method || 'dockerfile';
      
      // Chỉ xử lý cho phương thức script và jsonfile
      if (method !== 'script' && method !== 'jsonfile') return;

      const cfg = await this.configService.getConfig();
      const gc = job.gitConfig || {};
      
      // Xác định base context: <contextInitPath>/Katalyst
      let baseContext = cfg.contextInitPath || cfg.deployContextCustomPath || '';
      if (!baseContext) {
        const legacyRepoPath = cfg.repoPath || gc.repoPath || '';
        baseContext = legacyRepoPath ? path.dirname(legacyRepoPath) : process.cwd();
      }

      if (typeof baseContext !== 'string') {
        baseContext = process.cwd();
      }

      const katalystRoot = path.join(baseContext, 'Katalyst');
      const repoRootPath = path.join(katalystRoot, 'repo');
      const builderRoot = path.join(katalystRoot, 'builder');
      
      try {
        fs.mkdirSync(repoRootPath, { recursive: true });
        fs.mkdirSync(builderRoot, { recursive: true });
      } catch (e) {
        throw new Error(`Không thể tạo thư mục context tại ${katalystRoot}: ${e.message}`);
      }

      // Xác định đường dẫn repository thực tế
      const actualRepoPath = await this.ensureRepoReady({
        repoPath: repoRootPath,
        branch: gc.branch,
        repoUrl: gc.repoUrl,
        token: gc.token,
        provider: gc.provider
      });

      // Tự động cập nhật repoPath vào job configuration
      if (actualRepoPath && (!gc.repoPath || gc.repoPath !== actualRepoPath)) {
        const updated = {
          ...job,
          gitConfig: {
            ...job.gitConfig,
            repoPath: actualRepoPath
          }
        };
        try {
          await this.updateJob(job.id, updated);
        } catch (_) {}
      }

      const safeName = String(job.name || '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
      const jobBuilderDir = path.join(builderRoot, `${safeName}-${job.id}`);
      try {
        fs.mkdirSync(jobBuilderDir, { recursive: true });
      } catch (_) {}

      // XỬ LÝ CHO SCRIPT METHOD
      if (method === 'script') {
        await this.createBuildScript(job, jobBuilderDir, katalystRoot, actualRepoPath);
      }

      // XỬ LÝ CHO JSONFILE METHOD
      if (method === 'jsonfile') {
        await this.createJsonPipeline(job, jobBuilderDir, katalystRoot, actualRepoPath);
      }

    } catch (error) {
      // Không làm thất bại thao tác lưu job nếu lỗi tạo script
      this.logger.send(`[JOB][SCRIPT] Lỗi khi chuẩn bị script cho job ${job?.name || ''}: ${error.message}`);
    }
  }

  /**
   * Tạo file build-script.sh cho job
   */
  private async createBuildScript(
    job: any,
    jobBuilderDir: string,
    katalystRoot: string,
    actualRepoPath: string
  ): Promise<void> {
    const defaultScriptPath = path.join(jobBuilderDir, 'build-script.sh');
    const bc = job.buildConfig || {};
    const dc = bc.dockerConfig || {};
    const gc = job.gitConfig || {};

    // Biến cấu hình
    const imageName = bc.imageName || dc.imageName || '';
    const tagNumber = bc.imageTagNumber || '';
    const tagText = bc.imageTagText || '';
    const autoInc = !!(bc.autoTagIncrement || dc.autoTagIncrement);
    const registryUrl = bc.registryUrl || dc.registryUrl || '';
    const dockerfilePath = dc.dockerfilePath || '';
    const contextPath = dc.contextPath || actualRepoPath;

    // Tạo IMAGE_TAG từ number/text
    const imageTag = (() => {
      if (bc.imageTagNumber) {
        return bc.imageTagText ? `${bc.imageTagNumber}-${bc.imageTagText}` : `${bc.imageTagNumber}`;
      }
      return dc.imageTag || 'latest';
    })();

    // Nội dung script mẫu
    const scriptContent = `#!/usr/bin/env bash\n\n` +
      `# Auto-generated build script for job: ${job.name} (${job.id})\n` +
      `# Context root: ${katalystRoot}\n` +
      `# Created at: ${new Date().toISOString()}\n\n` +
      `# Git\n` +
      `BRANCH="${gc.branch || 'main'}"\n` +
      `REPO_URL="${gc.repoUrl || ''}"\n` +
      `REPO_PATH="${actualRepoPath}"\n\n` +
      `# Docker Build Config\n` +
      `CONTEXT_PATH="${contextPath}"\n` +
      `DOCKERFILE_PATH="${dockerfilePath}"\n` +
      `IMAGE_NAME="${imageName}"\n` +
      `IMAGE_TAG_NUMBER="${tagNumber}"\n` +
      `IMAGE_TAG_TEXT="${tagText}"\n` +
      `IMAGE_TAG="${imageTag}"\n` +
      `AUTO_TAG_INCREMENT="${autoInc ? 'true' : 'false'}"\n` +
      `REGISTRY_URL="${registryUrl}"\n\n` +
      `# Job Info\n` +
      `JOB_ID="${job.id}"\n` +
      `JOB_NAME="${job.name}"\n` +
      `KATALYST_ROOT="${katalystRoot}"\n` +
      `JOB_BUILDER_DIR="${jobBuilderDir}"\n\n` +
      `echo "[BUILD-SCRIPT] Job: $JOB_NAME ($JOB_ID)"\n` +
      `echo "[BUILD-SCRIPT] Context: $CONTEXT_PATH"\n` +
      `echo "[BUILD-SCRIPT] Dockerfile: $DOCKERFILE_PATH"\n` +
      `echo "[BUILD-SCRIPT] Image: $IMAGE_NAME:$IMAGE_TAG"\n` +
      `echo "[BUILD-SCRIPT] Registry: $REGISTRY_URL"\n\n` +
      `# TODO: Add your build commands below\n` +
      `# Example:\n` +
      `# docker build -f "$DOCKERFILE_PATH" -t "$IMAGE_NAME:$IMAGE_TAG" "$CONTEXT_PATH"\n` +
      `# # For docker registry login, export REGISTRY_USERNAME and REGISTRY_PASSWORD in your environment or use a credential store.\n` +
      `# # Example (avoid committing secrets to files):\n` +
      `# # echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" -u "$REGISTRY_USERNAME" --password-stdin\n` +
      `# docker push "$IMAGE_NAME:$IMAGE_TAG"\n`;

    try {
      if (!fs.existsSync(defaultScriptPath)) {
        // File chưa tồn tại, tạo mới
        fs.writeFileSync(defaultScriptPath, scriptContent, { encoding: 'utf8' });
        this.logger.send(`[JOB][SCRIPT] ✅ Đã tạo build-script.sh tại: ${defaultScriptPath}`);
      } else {
        // File đã tồn tại, chỉ cập nhật env vars nếu cần
        const existingContent = fs.readFileSync(defaultScriptPath, 'utf8');
        const hasEnvVars = existingContent.includes('IMAGE_NAME=') ||
                          existingContent.includes('IMAGE_TAG=') ||
                          existingContent.includes('REGISTRY_URL=');

        if (!hasEnvVars) {
          const envSection = scriptContent.split('# TODO: Add your build commands below')[0];
          const updatedContent = envSection + '\n\n' + existingContent;
          fs.writeFileSync(defaultScriptPath, updatedContent, { encoding: 'utf8' });
          this.logger.send(`[JOB][SCRIPT] ✅ Đã cập nhật env vars trong build-script.sh`);
        }
      }

      // Cập nhật scriptPath vào job config
      if (!bc.scriptPath || bc.scriptPath !== defaultScriptPath) {
        const updated = {
          ...job,
          buildConfig: {
            ...job.buildConfig,
            scriptPath: defaultScriptPath
          }
        };
        try {
          await this.updateJob(job.id, updated);
        } catch (_) {}
      }
    } catch (e) {
      throw new Error(`Không thể xử lý file script: ${defaultScriptPath}: ${e.message}`);
    }
  }

  /**
   * Tạo file JSON pipeline mẫu cho job
   */
  private async createJsonPipeline(
    job: any,
    jobBuilderDir: string,
    katalystRoot: string,
    actualRepoPath: string
  ): Promise<void> {
    const bc = job.buildConfig || {};
    const gc = job.gitConfig || {};
    
    // Nếu đã có jsonPipelinePath và file tồn tại, không làm gì
    if (bc.jsonPipelinePath && fs.existsSync(bc.jsonPipelinePath)) {
      this.logger.send(`[JOB][PIPELINE] File pipeline đã tồn tại: ${bc.jsonPipelinePath}`);
      return;
    }

    // Tạo file pipeline mẫu
    const pipelineFileName = `pipeline-${job.id}.json`;
    const pipelinePath = path.join(jobBuilderDir, pipelineFileName);

    const pipelineContent = {
      pipeline_name: `${job.name} Pipeline`,
      version: "1.0.0",
      description: `Auto-generated pipeline for job: ${job.name}`,
      working_directory: actualRepoPath || katalystRoot,
      environment_vars: {
        BUILD_VERSION: "1.0.0",
        DEPLOY_ENV: "production",
        BRANCH: gc.branch || "main",
        REPO_URL: gc.repoUrl || ""
      },
      check_commit: false,
      branch: gc.branch || "main",
      repo_url: gc.repoUrl || "",
      steps: [
        {
          step_order: 1,
          step_id: "setup",
          step_name: "Setup Environment",
          step_exec: "echo 'Setting up build environment...'",
          timeout_seconds: 60,
          on_fail: "stop",
          shell: "bash"
        },
        {
          step_order: 2,
          step_id: "build",
          step_name: "Build Application",
          step_exec: "echo 'TODO: Add your build commands here'",
          timeout_seconds: 300,
          on_fail: "stop",
          shell: "bash"
        },
        {
          step_order: 3,
          step_id: "deploy",
          step_name: "Deploy",
          step_exec: "echo 'TODO: Add your deploy commands here'",
          timeout_seconds: 300,
          on_fail: "continue",
          shell: "bash"
        }
      ]
    };

    try {
      fs.writeFileSync(pipelinePath, JSON.stringify(pipelineContent, null, 2), { encoding: 'utf8' });
      this.logger.send(`[JOB][PIPELINE] ✅ Đã tạo JSON pipeline tại: ${pipelinePath}`);

      // Cập nhật jsonPipelinePath vào job config
      if (!bc.jsonPipelinePath || bc.jsonPipelinePath !== pipelinePath) {
        const updated = {
          ...job,
          buildConfig: {
            ...job.buildConfig,
            jsonPipelinePath: pipelinePath
          }
        };
        try {
          await this.updateJob(job.id, updated);
        } catch (_) {}
      }
    } catch (e) {
      throw new Error(`Không thể tạo file pipeline: ${pipelinePath}: ${e.message}`);
    }
  }

  /**
   * Đảm bảo repository đã sẵn sàng (clone nếu cần)
   * Port từ src_legacy/controllers/JobController.js:_ensureRepoReady()
   */
  private async ensureRepoReady(params: {
    repoPath: string;
    branch: string;
    repoUrl: string;
    token: string;
    provider: string;
  }): Promise<string> {
    try {
      const { repoPath, branch, repoUrl, token, provider } = params;
      
      // Tạo thư mục con dựa trên tên repository
      const repoName = this.extractRepoNameFromUrl(repoUrl);
      const repoSubPath = path.join(repoPath, repoName);
      const gitDir = path.join(repoSubPath, '.git');

      if (!fs.existsSync(gitDir)) {
        // Clone repository nếu chưa tồn tại
        fs.mkdirSync(repoSubPath, { recursive: true });
        
        const useHttpsAuth = !!token && /^https?:\/\//.test(String(repoUrl));
        let authConfig = '';
        
        if (useHttpsAuth) {
          try {
            const user = String(provider || 'gitlab').toLowerCase() === 'github' ? 'x-access-token' : 'oauth2';
            const basic = Buffer.from(`${user}:${token}`).toString('base64');
            authConfig = `-c http.extraHeader="Authorization: Basic ${basic}"`;
          } catch (e) {
            this.logger.send(`[GIT][WARN] Không tạo được header Authorization: ${e.message}`);
          }
        }

        const cmd = `git ${authConfig} clone ${repoUrl} "${repoSubPath}" -b ${branch}`;
        this.logger.send(`[GIT][CLONE] > git clone ...`);
        
        const { run } = require('../../common/utils/exec.util');
        const result = await run(cmd, this.logger);
        
        if (result.error) {
          this.logger.send(`[GIT][CLONE][ERROR] ${result.error.message}`);
          throw new Error('git clone failed');
        }
        
        this.logger.send(`[GIT][CLONE] ✅ Clone thành công`);
      }

      return repoSubPath;
    } catch (error) {
      this.logger.send(`[GIT][ERROR] ensureRepoReady failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Trích xuất tên repo từ URL
   */
  private extractRepoNameFromUrl(repoUrl: string): string {
    if (!repoUrl) return 'unknown-repo';
    let name = repoUrl.replace(/\.git$/, '');
    const parts = name.split('/');
    name = parts[parts.length - 1];
    return name.replace(/[^a-zA-Z0-9_-]/g, '-');
  }
}
