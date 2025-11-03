const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { QueueService } = require('./QueueService');

class JobService {
  constructor(logger) {
    this.logger = logger;
    this.jobsFile = path.join(__dirname, '../../jobs.json');
    this.ensureJobsFile();
    
    // Initialize queue service for weaker machines
    this.queueService = new QueueService({
      maxConcurrentJobs: 1, // Chỉ chạy 1 job cùng lúc cho máy yếu
      resourceThreshold: 70, // Dừng queue nếu CPU/Memory > 70%
      logger: this.logger
    });
  }

  ensureJobsFile() {
    if (!fs.existsSync(this.jobsFile)) {
      fs.writeFileSync(this.jobsFile, JSON.stringify([], null, 2));
    }
  }

  // Get all jobs
  getAllJobs() {
    try {
      const data = fs.readFileSync(this.jobsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading jobs file:', error);
      return [];
    }
  }

  // Get job by ID
  getJobById(jobId) {
    const jobs = this.getAllJobs();
    return jobs.find(job => job.id === jobId);
  }

  // Create new job
  createJob(jobData) {
    const jobs = this.getAllJobs();
    
    const newJob = {
      id: uuidv4(),
      name: jobData.name,
      description: jobData.description || '',
      enabled: jobData.enabled !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // Git Configuration
      gitConfig: {
        provider: jobData.gitConfig?.provider || 'gitlab',
        account: jobData.gitConfig?.account || '',
        token: jobData.gitConfig?.token || '',
        repoUrl: jobData.gitConfig?.repoUrl || '',
        repoPath: jobData.gitConfig?.repoPath || '',
        branch: jobData.gitConfig?.branch || 'main'
      },
      
      // Build Configuration
      buildConfig: {
        method: jobData.buildConfig?.method || 'dockerfile',
        scriptPath: jobData.buildConfig?.scriptPath || '',
        buildOrder: jobData.buildConfig?.buildOrder || 'parallel', // parallel/sequential
        dockerConfig: jobData.buildConfig?.dockerConfig || {
          dockerfilePath: '',
          contextPath: '',
          imageName: '',
          imageTag: '',
          autoTagIncrement: false,
          registryUrl: '',
          registryUsername: '',
          registryPassword: ''
        }
      },
      
      // Services to build
      services: jobData.services || [],
      
      // Scheduling
      schedule: {
        autoCheck: jobData.schedule?.autoCheck || false,
        polling: jobData.schedule?.polling || 30,
        cron: jobData.schedule?.cron || ''
      },
      
      // Statistics
      stats: {
        totalBuilds: 0,
        successfulBuilds: 0,
        failedBuilds: 0,
        lastBuildAt: null,
        lastBuildStatus: null
      }
    };

    jobs.push(newJob);
    this.saveJobs(jobs);
    
    return newJob;
  }

  // Update job
  updateJob(jobId, updateData) {
    const jobs = this.getAllJobs();
    const jobIndex = jobs.findIndex(job => job.id === jobId);
    
    if (jobIndex === -1) {
      throw new Error('Job not found');
    }

    // Update job data
    jobs[jobIndex] = {
      ...jobs[jobIndex],
      ...updateData,
      id: jobId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };

    this.saveJobs(jobs);
    return jobs[jobIndex];
  }

  // Delete job
  deleteJob(jobId) {
    const jobs = this.getAllJobs();
    const filteredJobs = jobs.filter(job => job.id !== jobId);
    
    if (filteredJobs.length === jobs.length) {
      throw new Error('Job not found');
    }

    this.saveJobs(filteredJobs);
    return true;
  }

  // Toggle job enabled status
  toggleJob(jobId) {
    const job = this.getJobById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    return this.updateJob(jobId, { enabled: !job.enabled });
  }

  // Update job statistics
  updateJobStats(jobId, buildResult) {
    const job = this.getJobById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    const stats = {
      totalBuilds: job.stats.totalBuilds + 1,
      successfulBuilds: job.stats.successfulBuilds + (buildResult.success ? 1 : 0),
      failedBuilds: job.stats.failedBuilds + (buildResult.success ? 0 : 1),
      lastBuildAt: new Date().toISOString(),
      lastBuildStatus: buildResult.success ? 'success' : 'failed'
    };

    return this.updateJob(jobId, { stats });
  }

  // Get enabled jobs for scheduler
  getEnabledJobs() {
    return this.getAllJobs().filter(job => job.enabled && job.schedule.autoCheck);
  }

  // Save jobs to file
  saveJobs(jobs) {
    try {
      fs.writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2));
    } catch (error) {
      console.error('Error saving jobs file:', error);
      throw error;
    }
  }

  // Validate job data
  validateJobData(jobData) {
    const errors = [];

    if (!jobData.name || jobData.name.trim() === '') {
      errors.push('Job name is required');
    }

    if (!jobData.gitConfig?.repoUrl) {
      errors.push('Repository URL is required');
    }

    if (!jobData.gitConfig?.branch) {
      errors.push('Branch is required');
    }

    if (jobData.buildConfig?.method === 'script' && !jobData.buildConfig?.scriptPath) {
      errors.push('Script path is required for script build method');
    }

    if (jobData.buildConfig?.method === 'dockerfile' && !jobData.buildConfig?.dockerConfig?.dockerfilePath) {
      errors.push('Dockerfile path is required for dockerfile build method');
    }

    if (!jobData.services || jobData.services.length === 0) {
      errors.push('At least one service must be selected');
    }

    return errors;
  }
}

module.exports = JobService;