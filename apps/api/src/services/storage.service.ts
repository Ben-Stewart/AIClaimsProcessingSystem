import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const USE_LOCAL = !env.S3_REGION;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (USE_LOCAL) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('[storage] S3 not configured — using local disk storage at', UPLOADS_DIR);
}

const s3 = USE_LOCAL
  ? null
  : new S3Client({
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
      },
    });

export async function uploadFile(
  file: Express.Multer.File,
  claimId: string,
): Promise<string> {
  const ext = file.originalname.split('.').pop();
  const key = `claims/${claimId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  if (USE_LOCAL) {
    const localPath = path.join(UPLOADS_DIR, key);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, file.buffer);
    return key;
  }

  await s3!.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
        claimId,
      },
    }),
  );

  return key;
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  if (USE_LOCAL) {
    return `/local-uploads/${key}`;
  }

  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(s3!, command, { expiresIn });
}

export async function deleteFile(key: string): Promise<void> {
  if (USE_LOCAL) {
    const localPath = path.join(UPLOADS_DIR, key);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    return;
  }

  await s3!.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    }),
  );
}
