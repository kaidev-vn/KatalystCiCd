import { $ } from './utils.js';
import { openLogStream, filterLogsByJob } from './logs.js';

/**
 * Quản lý job logs selector và realtime streams
 */
export class JobLogsManager {
  constructor() {
    this.currentJobId = null;
    this.jobs = [];
    this.selector = $('jobSelector');
    
    if (this.selector) {
      this.selector.addEventListener('change', (e) => this.onJobChange(e));
      this.loadJobs();
    }
  }

  /**
   * Tải danh sách jobs từ API
   */
  async loadJobs() {
    try {
      const response = await fetch('/api/jobs');
      if (response.ok) {
        this.jobs = await response.json();
        this.populateJobSelector();
      } else {
        console.error('Failed to load jobs:', response.status);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  /**
   * Điền danh sách jobs vào selector
   */
  populateJobSelector() {
    if (!this.selector) return;
    
    // Giữ option "Tất cả Jobs"
    const allOption = this.selector.querySelector('option[value=""]');
    this.selector.innerHTML = '';
    this.selector.appendChild(allOption);
    
    // Thêm từng job vào selector
    this.jobs.forEach(job => {
      const option = document.createElement('option');
      option.value = job.id;
      option.textContent = `${job.name} (${job.id})`;
      this.selector.appendChild(option);
    });
  }

  /**
   * Xử lý khi người dùng chọn job khác
   */
  onJobChange(event) {
    const jobId = event.target.value;
    this.setCurrentJob(jobId);
  }

  /**
   * Thiết lập job hiện tại và cập nhật log stream
   */
  setCurrentJob(jobId) {
    this.currentJobId = jobId || null;
    
    // Cập nhật tiêu đề logs
    const logsTitle = $('logsTitle');
    if (logsTitle) {
      if (jobId) {
        const job = this.jobs.find(j => j.id === jobId);
        logsTitle.textContent = `📋 Logs - ${job ? job.name : jobId}`;
      } else {
        logsTitle.textContent = '📋 Logs Realtime';
      }
    }
    
    // Áp dụng filter log theo job
    filterLogsByJob(jobId);
    
    // Mở log stream mới
    openLogStream(jobId);
  }

  /**
   * Lấy job ID hiện tại
   */
  getCurrentJobId() {
    return this.currentJobId;
  }

  /**
   * Làm mới danh sách jobs
   */
  async refreshJobs() {
    await this.loadJobs();
  }
}

// Khởi tạo global instance
export const jobLogsManager = new JobLogsManager();