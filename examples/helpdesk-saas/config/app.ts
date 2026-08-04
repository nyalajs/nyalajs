export default {
  name: process.env.APP_NAME || "Nyala App",
  env: process.env.NODE_ENV || "development",
  url: process.env.APP_URL || "http://localhost:3000",
};
