// utils/r2-sdk.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";

const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_KEY_ID,
    secretAccessKey: process.env.R2_SECRET,
  },
});

/**
 * Upload `buffer` to R2 under `key`. `contentType` is optional —
 * when omitted, derived from the key's extension (preserves the
 * old call sites' behaviour exactly).
 */
export async function uploadToR2(buffer, key, contentType) {
  const ct = contentType || mime.lookup(key) || "application/octet-stream";

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: ct,
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
