export default {
    name: process.env.APP_NAME || "Nyala CMS",
    env: process.env.NODE_ENV || "development",
    url: process.env.APP_URL || "http://localhost:3000",
    debug: process.env.NODE_ENV !== "production",
};
