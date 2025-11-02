class SchedulerController {
  constructor({ scheduler, configService }) {
    this.scheduler = scheduler;
    this.configService = configService;
  }

  // GET /api/scheduler/status - Lấy trạng thái scheduler
  getStatus(req, res) {
    try {
      const status = this.scheduler.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /api/scheduler/toggle - Bật/tắt scheduler
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

  // POST /api/scheduler/restart - Khởi động lại scheduler
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