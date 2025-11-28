import { $, fetchJSON } from './utils.js';
import { state } from './state.js';

export async function initDashboard() {
    console.log('Initializing Dashboard...');
    await refreshDashboard();
    
    // Auto refresh dashboard every 30s
    setInterval(refreshDashboard, 30000);
}

export async function refreshDashboard() {
    // 1. Ensure data is loaded (jobs & build history)
    // We rely on the main app to load jobs, but we can re-fetch history here
    if (!state.jobs || state.jobs.length === 0) {
        try {
            const res = await fetchJSON('/api/jobs');
            if (res.ok) state.jobs = res.data;
        } catch (e) { console.error('Failed to load jobs for dashboard', e); }
    }
    
    try {
        // Fetch latest builds for activity feed
        const res = await fetchJSON('/api/builds?limit=10');
        if (res.ok) state.buildHistory = res.data; // Update local state (or a subset)
    } catch (e) { console.error('Failed to load builds for dashboard', e); }

    // 2. Update Stats Cards
    updateStats();

    // 3. Update Recent Activity Table
    updateActivityTable();

    // 4. Update System Metrics (Mocked for now or fetched if API exists)
    updateSystemMetrics();
    
    // 5. Update Running Jobs Widget
    updateRunningWidget();
}

function updateStats() {
    // Total Jobs
    const totalJobs = state.jobs.length;
    const totalJobsEl = $('dashTotalJobs');
    if (totalJobsEl) totalJobsEl.textContent = totalJobs;

    // Success Rate (based on last 50 builds)
    const recentBuilds = state.buildHistory.slice(0, 50);
    const totalRecent = recentBuilds.length;
    if (totalRecent > 0) {
        const successCount = recentBuilds.filter(b => (b.status || '').toLowerCase() === 'success' || (b.status || '').toLowerCase() === 'completed').length;
        const rate = Math.round((successCount / totalRecent) * 100);
        const rateEl = $('dashSuccessRate');
        if (rateEl) {
            rateEl.textContent = `${rate}%`;
            // Color code
            const icon = rateEl.parentElement.parentElement.querySelector('.stat-icon');
            if (icon) {
                if (rate >= 80) icon.className = 'stat-icon green';
                else if (rate >= 50) icon.className = 'stat-icon orange';
                else icon.className = 'stat-icon purple'; // Use purple for low/bad
            }
        }
    }

    // Queue Size
    // We can check queue from state if available, or fetch
    fetchJSON('/api/queue/status').then(({ ok, data }) => {
        if (ok) {
            // Backend trả về: { success, status: { queue, running, completed, failed }, stats }
            const queueData = data.status || data || {};
            
            const queueEl = $('dashQueueSize');
            if (queueEl) queueEl.textContent = (queueData.queue || []).length;
            
            // Also update running count for sidebar widget
            const runningEl = $('dashRunningCount');
            if (runningEl) runningEl.textContent = (queueData.running || []).length;
            
            updateRunningWidget((queueData.running || []));
        }
    });

    // Avg Duration
    if (totalRecent > 0) {
        const completedBuilds = recentBuilds.filter(b => b.duration);
        if (completedBuilds.length > 0) {
            const totalDuration = completedBuilds.reduce((acc, b) => acc + (b.duration || 0), 0);
            const avg = Math.round(totalDuration / completedBuilds.length);
            const avgEl = $('dashAvgDuration');
            if (avgEl) avgEl.textContent = formatDuration(avg);
        }
    }
}

function updateActivityTable() {
    const tbody = $('dashboardRecentActivity');
    if (!tbody) return;

    const recent = state.buildHistory.slice(0, 5); // Top 5
    
    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center muted">Chưa có hoạt động nào</td></tr>';
        return;
    }

    tbody.innerHTML = recent.map(build => {
        const statusClass = getStatusClass(build.status);
        const statusText = getStatusText(build.status);
        const time = new Date(build.startTime || build.time).toLocaleString('vi-VN');
        const duration = build.duration ? formatDuration(build.duration) : '-';
        
        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${build.jobName || 'Unknown Job'}</div>
                    <div class="muted small" style="font-size: 11px;">${build.commitHash ? build.commitHash.substring(0, 7) : ''}</div>
                </td>
                <td><span class="status ${statusClass}" style="font-size: 11px; padding: 2px 6px;">${statusText}</span></td>
                <td class="muted" style="font-size: 12px;">${time}</td>
                <td class="muted" style="font-size: 12px;">${duration}</td>
            </tr>
        `;
    }).join('');
}

function updateRunningWidget(runningJobs = []) {
    const container = $('dashRunningList');
    if (!container) return;

    if (!runningJobs || runningJobs.length === 0) {
        container.innerHTML = '<div class="empty-state small">Không có job đang chạy</div>';
        return;
    }

    container.innerHTML = runningJobs.map(job => `
        <div class="running-item-mini">
            <div>
                <div style="font-weight: 600;">${job.jobName}</div>
                <div class="muted small">ID: ${job.jobId.substring(0, 8)}...</div>
            </div>
            <div class="status-dot"></div>
        </div>
    `).join('');
}

function updateSystemMetrics() {
    // Mock data simulation for visual effect (since we don't have real OS metrics API yet)
    // In a real app, fetch this from /api/system/metrics
    const cpu = Math.floor(Math.random() * 30) + 10; // 10-40%
    const mem = Math.floor(Math.random() * 40) + 30; // 30-70%
    const disk = 65; // Fixed for now

    setProgressBar('cpuBar', 'cpuValue', cpu);
    setProgressBar('memBar', 'memValue', mem);
    setProgressBar('diskBar', 'diskValue', disk);
    
    // Update status badge based on CPU
    const badge = $('systemStatusBadge');
    if (badge) {
        if (cpu > 80) {
            badge.className = 'badge danger pulse';
            badge.textContent = 'High Load';
        } else {
            badge.className = 'badge success pulse';
            badge.textContent = 'Hoạt động';
        }
    }
}

function setProgressBar(barId, valueId, percent) {
    const bar = $(barId);
    const val = $(valueId);
    if (bar) {
        bar.style.width = `${percent}%`;
        if (percent > 80) bar.style.background = 'var(--danger)';
        else if (percent > 60) bar.style.background = 'var(--warning)';
        else bar.style.background = 'var(--success)';
    }
    if (val) val.textContent = `${percent}%`;
}

// Helpers (duplicated from jobs.js/utils.js if not exported, or just inline)
function getStatusClass(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'success' || s === 'completed') return 'success';
    if (s === 'failed' || s === 'error') return 'failed';
    if (s === 'running' || s === 'active') return 'running';
    if (s === 'queued') return 'pending';
    return 'unknown';
}

function getStatusText(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'success' || s === 'completed') return 'Thành công';
    if (s === 'failed' || s === 'error') return 'Thất bại';
    if (s === 'running') return 'Đang chạy';
    if (s === 'queued') return 'Trong hàng đợi';
    return s;
}

function formatDuration(ms) {
    if (!ms) return '0s';
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

// Expose to window for quick access
window.refreshDashboard = refreshDashboard;

