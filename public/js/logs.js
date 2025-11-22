import { $ } from './utils.js';
import { state } from './state.js';

// Biến toàn cục để quản lý trạng thái scroll
let autoScrollEnabled = true;
let scrollPausedPosition = 0;

// Filter log theo job ID
let currentJobFilter = null;

export function appendLog(text, jobId = null) {
  const logs = $('logs');
  if (!logs) return;
  
  // Kiểm tra filter job
  if (currentJobFilter && jobId !== currentJobFilter) {
    return; // Bỏ qua log không thuộc job được filter
  }
  
  const div = document.createElement('div');
  div.textContent = text;
  div.className = 'new';
  
  // Thêm job ID vào data attribute nếu có
  if (jobId) {
    div.setAttribute('data-job-id', jobId);
  }
  
  logs.appendChild(div);
  
  // Chỉ scroll tự động nếu enabled
  if (autoScrollEnabled) {
    logs.scrollTop = logs.scrollHeight;
  }
}

// Toggle auto scroll
export function toggleAutoScroll() {
  const logs = $('logs');
  if (!logs) return;
  
  autoScrollEnabled = !autoScrollEnabled;
  
  if (autoScrollEnabled) {
    logs.scrollTop = logs.scrollHeight; // Scroll xuống dưới cùng
  } else {
    scrollPausedPosition = logs.scrollTop; // Lưu vị trí hiện tại
  }
  
  // Cập nhật UI
  updateScrollButtonState();
  
  return autoScrollEnabled;
}

// Cập nhật trạng thái nút scroll
export function updateScrollButtonState() {
  const scrollBtn = $('toggleScrollBtn');
  if (scrollBtn) {
    scrollBtn.textContent = autoScrollEnabled ? '⏸️ Tạm dừng Scroll' : '▶️ Tiếp tục Scroll';
    scrollBtn.classList.toggle('paused', !autoScrollEnabled);
  }
}

// Filter log theo job ID
export function filterLogsByJob(jobId) {
  currentJobFilter = jobId;
  const logs = $('logs');
  if (!logs) return;
  
  // Ẩn/hiện log dựa trên filter
  const logItems = logs.querySelectorAll('div[data-job-id]');
  logItems.forEach(item => {
    const itemJobId = item.getAttribute('data-job-id');
    item.style.display = jobId ? (itemJobId === jobId ? '' : 'none') : '';
  });
  
  // Cập nhật UI
  updateFilterButtonState(jobId);
}

// Cập nhật trạng thái nút filter
export function updateFilterButtonState(jobId) {
  const filterBtn = $('toggleFilterBtn');
  if (filterBtn) {
    filterBtn.textContent = jobId ? `🔍 Đang filter Job: ${jobId}` : '🔍 Filter theo Job';
    filterBtn.classList.toggle('active', !!jobId);
  }
}

export function openLogStream(channelId) {
  if (state.es) { try { state.es.close(); } catch (_) {} state.es = null; }
  const url = channelId ? `/api/logs/stream/${encodeURIComponent(channelId)}` : '/api/logs/stream';
  const connect = () => {
    state.es = new EventSource(url);
    state.es.onmessage = (ev) => {
      // Parse message để extract jobId nếu có
      const message = ev.data;
      let jobId = null;
      
      // Kiểm tra nếu message có chứa job ID pattern
      const jobIdMatch = message.match(/\[job:(.+?)\]/);
      if (jobIdMatch) {
        jobId = jobIdMatch[1];
      }
      
      appendLog(message, jobId);
    };
    state.es.onerror = () => {
      appendLog('[SSE] Lỗi kết nối, sẽ thử lại...');
      try { state.es.close(); } catch (_) {}
      setTimeout(connect, 2000);
    };
  };
  connect();
}

// Khởi tạo event listeners cho các nút điều khiển
export function initLogControls() {
  console.log('Initializing log controls...');
  
  const scrollBtn = $('toggleScrollBtn');
  const filterBtn = $('toggleFilterBtn');
  const jobSelector = $('jobSelector');
  
  console.log('Found elements:', { scrollBtn, filterBtn, jobSelector });
  
  if (scrollBtn) {
    console.log('Adding scroll button listener');
    scrollBtn.addEventListener('click', () => {
      console.log('Scroll button clicked');
      toggleAutoScroll();
    });
  } else {
    console.error('Scroll button not found!');
  }
  
  if (filterBtn) {
    console.log('Adding filter button listener');
    filterBtn.addEventListener('click', () => {
      console.log('Filter button clicked');
      const selectedJobId = jobSelector ? jobSelector.value : null;
      filterLogsByJob(selectedJobId);
    });
  } else {
    console.error('Filter button not found!');
  }
  
  if (jobSelector) {
    console.log('Adding job selector listener');
    jobSelector.addEventListener('change', () => {
      console.log('Job selector changed');
      const selectedJobId = jobSelector.value;
      filterLogsByJob(selectedJobId);
    });
  } else {
    console.error('Job selector not found!');
  }
  
  console.log('Log controls initialized');
}