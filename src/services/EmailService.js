const nodemailer = require('nodemailer');

/**
 * EmailService - Service gửi email notifications
 * Hỗ trợ gửi email thông báo build success/failure qua SMTP
 * @class
 */
class EmailService {
  /**
   * Tạo EmailService instance
   * @constructor
   * @param {Object} deps - Dependencies
   * @param {Object} deps.configService - ConfigService instance
   * @param {Object} deps.logger - Logger instance
   */
  constructor({ configService, logger }) {
    this.configService = configService;
    this.logger = logger;
  }

  async sendTestEmail({ to, subject = 'CI/CD Test Email', text = 'This is a test email from CI/CD system.' }) {
    const cfg = this.configService.getConfig();
    const email = cfg.email || {};
    const { smtpHost, smtpPort, emailUser, emailPassword } = email;
    if (!smtpHost || !smtpPort || !emailUser || !emailPassword) {
      const error = 'Thiếu cấu hình SMTP: vui lòng điền đầy đủ SMTP Host, Port, Email người gửi và Mật khẩu.';
      return { ok: false, error };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: Number(smtpPort) === 465,
        auth: { user: emailUser, pass: emailPassword },
      });
      const info = await transporter.sendMail({
        from: emailUser,
        to,
        subject,
        text,
      });
      this.logger?.send?.(`[EMAIL] Đã gửi email test tới ${to}, messageId=${info.messageId}`);
      return { ok: true, info };
    } catch (e) {
      this.logger?.send?.(`[EMAIL] Gửi email lỗi: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }

  /**
   * Gửi email thông báo (dùng cho thông báo build hoàn thành/thất bại)
   * Nếu không truyền toList, sẽ lấy từ config.email.notifyEmails khi enableEmailNotify=true
   */
  async sendNotificationEmail({ toList, subject, text, html }) {
    const cfg = this.configService.getConfig();
    const emailCfg = cfg.email || {};
    const { smtpHost, smtpPort, emailUser, emailPassword, notifyEmails, enableEmailNotify } = emailCfg;

    if (!enableEmailNotify) {
      this.logger?.send?.('[EMAIL] Email notify đang tắt (enableEmailNotify=false), bỏ qua gửi email.');
      return { ok: false, error: 'Email notify disabled' };
    }

    const recipients = Array.isArray(toList) && toList.length > 0 ? toList : (Array.isArray(notifyEmails) ? notifyEmails : []);
    if (!recipients || recipients.length === 0) {
      const error = 'Không có danh sách người nhận (notifyEmails rỗng)';
      this.logger?.send?.(`[EMAIL] ${error}`);
      return { ok: false, error };
    }

    if (!smtpHost || !smtpPort || !emailUser || !emailPassword) {
      const error = 'Thiếu cấu hình SMTP: vui lòng điền đầy đủ SMTP Host, Port, Email người gửi và Mật khẩu.';
      this.logger?.send?.(`[EMAIL] ${error}`);
      return { ok: false, error };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: Number(smtpPort) === 465,
        auth: { user: emailUser, pass: emailPassword },
      });
      const mailOptions = {
        from: emailUser,
        to: recipients.join(','),
        subject: subject || '[CI/CD] Notification',
        text: text || undefined,
        html: html || undefined,
      };
      const info = await transporter.sendMail(mailOptions);
      this.logger?.send?.(`[EMAIL] Đã gửi email notify tới ${recipients.join(', ')}, messageId=${info.messageId}`);
      return { ok: true, info };
    } catch (e) {
      this.logger?.send?.(`[EMAIL] Gửi email notify lỗi: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }
}

module.exports = { EmailService };