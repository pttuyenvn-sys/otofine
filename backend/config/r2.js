// config/r2.js
import { S3Client } from "@aws-sdk/client-s3";

const r2Enabled = Boolean(
  process.env.R2_ENDPOINT &&
    process.env.R2_KEY_ID &&
    process.env.R2_SECRET &&
    process.env.R2_BUCKET,
);

export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_KEY_ID,
    secretAccessKey: process.env.R2_SECRET,
  },
});

console.info("[r2] storage", {
  enabled: r2Enabled,
  endpoint: process.env.R2_ENDPOINT || null,
  bucket: process.env.R2_BUCKET || null,
  public_url_set: Boolean(process.env.R2_PUBLIC_URL),
});
