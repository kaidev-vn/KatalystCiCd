// Toast Notification System
class Toast {
    static show(options) {
        const {
            title = '',
            message = '',
            type = 'info',
            duration = 5000,
            position = 'top-right'
        } = options;

        const container = document.getElementById('toast-container') || this.createContainer();
        const toast = this.createToastElement(title, message, type);
        
        container.appendChild(toast);
        
        // Trigger reflow for animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.hide(toast);
            }, duration);
        }

        return toast;
    }

    static createContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    static createToastElement(title, message, type) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const iconSvg = this.getIconSvg(type);
        const closeSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        
        toast.innerHTML = `
            <div class="toast-icon">${iconSvg}</div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${title}</div>` : ''}
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="Toast.hide(this.parentElement)">${closeSvg}</button>
        `;

        return toast;
    }

    static getIconSvg(type) {
        const icons = {
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };
        
        return icons[type] || icons.info;
    }

    static hide(toast) {
        toast.classList.remove('show');
        toast.classList.add('hide');
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    }

    // Convenience methods
    static success(message, title = 'Thành công', duration = 5000) {
        return this.show({ title, message, type: 'success', duration });
    }

    static error(message, title = 'Lỗi', duration = 7000) {
        return this.show({ title, message, type: 'error', duration });
    }

    static warning(message, title = 'Cảnh báo', duration = 6000) {
        return this.show({ title, message, type: 'warning', duration });
    }

    static info(message, title = 'Thông tin', duration = 5000) {
        return this.show({ title, message, type: 'info', duration });
    }
}

// Global function for easy access
window.showToast = Toast.show.bind(Toast);
window.showSuccessToast = Toast.success.bind(Toast);
window.showErrorToast = Toast.error.bind(Toast);
window.showWarningToast = Toast.warning.bind(Toast);
window.showInfoToast = Toast.info.bind(Toast);