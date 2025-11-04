const nodemailer = require('nodemailer');

class EmailService {
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
}

module.exports = { EmailService };