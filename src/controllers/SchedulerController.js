/**
 * SchedulerController - Controller quản lý main scheduler
 * Cung cấp API để start/stop/restart scheduler
 * @class
 */
class SchedulerController {
  /**
   * Tạo SchedulerController instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.scheduler - Scheduler instance
   * @param {Object} deps.configService - ConfigService instance
   */
  constructor({ scheduler, configService }) {
    this.scheduler = scheduler;
    this.configService = configService;
  }

  /**
   * API Endpoint: Lấy status của scheduler
   * GET /api/scheduler/status
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {void}
   */
  getStatus(req, res) {
    try {
      const status = this.scheduler.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API Endpoint: Toggle scheduler (start/stop)
   * POST /api/scheduler/toggle
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {void}
   */
  toggle(req, res) {
    try {
      const { autoCheck } = req.body;
      
      if (typeof autoCheck !== 'boolean') {
        return res.status(400).json({ 
          success: false, 
          error: 'autoCheck phải là boolean (true/false)' 
        });
      }

      // Cập nhật config
      const cfg = this.configService.getConfig();
      cfg.autoCheck = autoCheck;
      this.configService.setConfig(cfg);

      // Restart scheduler để áp dụng thay đổi
      this.scheduler.restart();

      const status = this.scheduler.getStatus();
      res.json({ 
        success: true, 
        message: autoCheck ? 'Đã bật scheduler' : 'Đã tắt scheduler',
        data: status 
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API Endpoint: Restart scheduler
   * POST /api/scheduler/restart
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @returns {void}
   */
  restart(req, res) {
    try {
      this.scheduler.restart();
      const status = this.scheduler.getStatus();
      res.json({ 
        success: true, 
        message: 'Đã khởi động lại scheduler',
        data: status 
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = { SchedulerController };