export default {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : "*",
  credentials: process.env.CORS_CREDENTIALS === "true",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};
