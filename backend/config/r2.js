// config/r2.js
import { S3Client } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_KEY_ID,
    secretAccessKey: process.env.R2_SECRET,
  },
});

console.log("R2_KEY_ID:", process.env.R2_KEY_ID);
console.log("R2_SECRET:", process.env.R2_SECRET);
console.log("R2_ENDPOINT:", process.env.R2_ENDPOINT);
