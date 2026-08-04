export default {
  driver: process.env.STORAGE_DRIVER || "local",
  local: {
    root: process.env.STORAGE_LOCAL_ROOT || "./storage",
    publicUrl: process.env.STORAGE_PUBLIC_URL || "/storage",
  },
  s3: {
    bucket: process.env.AWS_S3_BUCKET || "",
    region: process.env.AWS_REGION || "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
};
