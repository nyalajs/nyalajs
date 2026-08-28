# @nyalajs/mail

## 1.0.1

### Patch Changes

- Add real SMTP connection/greeting/socket timeouts (`connectionTimeoutMs`, `greetingTimeoutMs`, `socketTimeoutMs` on `MailConfig`, all with sane defaults) to `MailService.connect()`. Previously a slow or unresponsive SMTP server — including nodemailer's own Ethereal preview inbox in development — left `transporter.sendMail()` pending indefinitely, and since `send()` is typically awaited from a user-facing request (a signup sending a verification email, for example), that hung the entire HTTP request with no way for the caller to time out short of the connection itself dying. Reproduced against a real app: a registration request never completed and the process had to be killed to recover.
- Updated dependencies
  - @nyalajs/core@2.3.2
