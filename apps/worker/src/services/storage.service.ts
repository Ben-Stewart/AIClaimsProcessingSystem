import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const USE_LOCAL = !env.R2_ACCOUNT_ID;
// Worker runs from apps/worker; uploads are written by the API at apps/api/uploads
const UPLOADS_DIR = path.join(process.cwd(), '..', 'api', 'uploads');

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
};

const s3 = USE_LOCAL
  ? null
  : new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  if (USE_LOCAL) {
    const localPath = path.join(UPLOADS_DIR, key);
    const buffer = fs.readFileSync(localPath);
    const ext = path.extname(key).slice(1).toLowerCase();
    const mime = EXT_TO_MIME[ext] ?? 'application/octet-stream';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
  return getSignedUrl(s3!, command, { expiresIn });
}
