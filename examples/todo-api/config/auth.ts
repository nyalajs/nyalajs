/**
 * Authentication Configuration
 */

export default {
    jwt: {
        secret: process.env.JWT_SECRET || "change-me-in-production",
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
        algorithm: "HS256",
    },
    password: {
        saltRounds: 10,
        minLength: 8,
    },
};
