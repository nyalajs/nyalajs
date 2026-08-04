export default {
  driver: process.env.MAIL_DRIVER || "smtp",
  from: {
    name: process.env.MAIL_FROM_NAME || "NyalaJS App",
    address: process.env.MAIL_FROM_ADDRESS || "noreply@example.com",
  },
  smtp: {
    host: process.env.MAIL_HOST || "localhost",
    port: Number(process.env.MAIL_PORT) || 1025,
    secure: process.env.MAIL_SECURE === "true",
    user: process.env.MAIL_USER || undefined,
    pass: process.env.MAIL_PASS || undefined,
  },
};
