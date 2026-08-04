export default {
  driver: process.env.SESSION_DRIVER || "cookie",
  secret: process.env.SESSION_SECRET || "change-me-in-production",
  maxAge: Number(process.env.SESSION_MAX_AGE) || 86_400, // 1 day in seconds
  secure: process.env.NODE_ENV === "production",
};
