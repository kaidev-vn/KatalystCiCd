const JobService = require('../services/JobService');
const { BuildService } = require('../services/BuildService');

class JobController {
  constructor({ buildService, logger, configService }) {
    this.jobService = new JobService(logger);
    this.buildService = buildService;
    this.logger = logger;
    this.configService = configService;
  }

  // GET /api/jobs - Get all jobs
  async getAllJobs(req, res) {
    try {
      const jobs = this.jobService.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error('Error getting jobs:', error);
      res.status(500).json({ error: 'Failed to get jobs' });
    }
  }

  // GET /api/jobs/:id - Get job by ID
  async getJobById(req, res) {
    try {
      const { id } = req.params;
      const job = this.jobService.getJobById(id);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      
      res.json(job);
    } catch (error) {
      console.error('Error getting job:', error);
      res.status(500).json({ error: 'Failed to get job' });
    }
  }

  // POST /api/jobs - Create new job
  async createJob(req, res) {
    try {
      const jobData = req.body;
      
      // Validate job data
      const validationErrors = this.jobService.validateJobData(jobData);
      if (validationErrors.length > 0) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: validationErrors 
        });
      }

      const newJob = this.jobService.createJob(jobData);
      res.status(201).json(newJob);
    } catch (error) {
      console.error('Error creating job:', error);
      res.status(500).json({ error: 'Failed to create job' });
    }
  }

  // PUT /api/jobs/:id - Update job
  async updateJob(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Validate job data if provided
      if (Object.keys(updateData).length > 0) {
        const validationErrors = this.jobService.validateJobData({
          ...this.jobService.getJobById(id),
          ...updateData
        });
        
        if (validationErrors.length > 0) {
          return res.status(400).json({ 
            error: 'Validation failed', 
            details: validationErrors 
          });
        }
      }

      const updatedJob = this.jobService.updateJob(id, updateData);
      res.json(updatedJob);
    } catch (error) {
      console.error('Error updating job:', error);
      if (error.message === 'Job not found') {
        res.status(404).json({ error: 'Job not found' });
      } else {
        res.status(500).json({ error: 'Failed to update job' });
      }
    }
  }

  // DELETE /api/jobs/:id - Delete job
  async deleteJob(req, res) {
    try {
      const { id } = req.params;
      this.jobService.deleteJob(id);
      res.json({ message: 'Job deleted successfully' });
    } catch (error) {
      console.error('Error deleting job:', error);
      if (error.message === 'Job not found') {
        res.status(404).json({ error: 'Job not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete job' });
      }
    }
  }

  // POST /api/jobs/:id/toggle - Toggle job enabled status
  async toggleJob(req, res) {
    try {
      const { id } = req.params;
      const updatedJob = this.jobService.toggleJob(id);
      res.json(updatedJob);
    } catch (error) {
      console.error('Error toggling job:', error);
      if (error.message === 'Job not found') {
        res.status(404).json({ error: 'Job not found' });
      } else {
        res.status(500).json({ error: 'Failed to toggle job' });
      }
    }
  }

  // POST /api/jobs/:id/run - Run job build
  async runJob(req, res) {
    try {
      const { id } = req.params;
      const job = this.jobService.getJobById(id);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      if (!job.enabled) {
        return res.status(400).json({ error: 'Job is disabled' });
      }

      // Start build process
      const buildResult = await this.executeJobBuild(job);
      
      // Update job statistics
      this.jobService.updateJobStats(id, buildResult);
      
      res.json({
        message: 'Job build started',
        jobId: id,
        buildId: buildResult.buildId,
        status: buildResult.status
      });
    } catch (error) {
      console.error('Error running job:', error);
      res.status(500).json({ error: 'Failed to run job' });
    }
  }

  // Execute job build (internal method)
  async executeJobBuild(job) {
    try {
      console.log(`[JOB] Starting build for job: ${job.name} (${job.id})`);
      
      // Determine build method and execute
      let buildResult;
      
      if (job.buildConfig.method === 'script') {
        buildResult = await this.buildService.runScript(
          job.buildConfig.scriptPath,
          job.gitConfig.repoPath
        );
      } else if (job.buildConfig.method === 'dockerfile') {
        // For dockerfile builds, we'll need to implement docker build logic
        buildResult = await this.executeDockerBuild(job);
      } else {
        throw new Error(`Unsupported build method: ${job.buildConfig.method}`);
      }

      console.log(`[JOB] Build completed for job: ${job.name}, Status: ${buildResult.status}`);
      
      return {
        success: buildResult.status === 'completed',
        buildId: buildResult.buildId,
        status: buildResult.status,
        message: buildResult.message || 'Build completed'
      };
    } catch (error) {
      console.error(`[JOB] Build failed for job: ${job.name}`, error);
      
      return {
        success: false,
        buildId: null,
        status: 'failed',
        message: error.message
      };
    }
  }

  // Execute Docker build (placeholder for now)
  async executeDockerBuild(job) {
    // This will be implemented when we integrate with DockerService
    console.log(`[JOB] Docker build not yet implemented for job: ${job.name}`);
    
    return {
      buildId: `docker-${Date.now()}`,
      status: 'pending',
      message: 'Docker build not yet implemented'
    };
  }

  // GET /api/jobs/enabled - Get enabled jobs for scheduler
  async getEnabledJobs(req, res) {
    try {
      const enabledJobs = this.jobService.getEnabledJobs();
      res.json(enabledJobs);
    } catch (error) {
      console.error('Error getting enabled jobs:', error);
      res.status(500).json({ error: 'Failed to get enabled jobs' });
    }
  }
}

module.exports = JobController;