import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.ts";
import { httpError } from "./errors.ts";
import type { Actor } from "./types.ts";

// Cloudflare R2 speaks the S3 API - "auto" region and the account-specific endpoint are
// R2's own convention, everything else is the standard AWS S3 client. Unlike Cloudinary,
// R2 charges nothing for bandwidth no matter how many times an image is viewed, which is
// exactly the problem this replaces: Cloudinary's free tier got disabled after real
// traffic (not file count - 1MB logos viewed thousands of times) blew past its bandwidth
// quota. R2's free tier has no bandwidth dimension to exceed in the first place.
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey
  }
});

// "logo"/"avatar" behave like the old team-logos bucket (small, image-only, 5MB cap);
// everything else behaves like the old app-media bucket (image or video, 100MB cap).
const SMALL_IMAGE_PURPOSES = new Set(["logo", "avatar"]);
const ALLOWED_PURPOSES = new Set(["story", "news", "goal", "match", "logo", "avatar"]);

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

const MAX_SMALL_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 5 * 60;

interface CreateUploadTargetPayload {
  purpose?: string;
  contentType?: string;
  mimeType?: string;
  sizeBytes?: number;
  size?: number;
}

export interface UploadTarget {
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  maxSizeBytes: number;
}

// Signed direct-upload: the phone PUTs the file bytes straight to R2, never through our
// API - we only hand out a short-lived presigned URL (computed with the secret key, which
// never leaves the server) authorizing this one specific upload.
export async function createUploadTarget(payload: CreateUploadTargetPayload, actor: Actor | null): Promise<UploadTarget> {
  if (!actor?.id) throw httpError(401, "Moras biti ulogovan.");
  const purpose = String(payload.purpose || "story").trim();
  if (!ALLOWED_PURPOSES.has(purpose)) throw httpError(400, "Tip uploada nije validan.");

  const contentType = String(payload.contentType || payload.mimeType || "").trim().toLowerCase();
  if (!ALLOWED_MIME.has(contentType)) throw httpError(400, "Format fajla nije podrzan.");
  const isSmallImage = SMALL_IMAGE_PURPOSES.has(purpose);
  if (isSmallImage && !contentType.startsWith("image/")) throw httpError(400, "Logo mora biti slika.");

  const sizeBytes = Number(payload.sizeBytes || payload.size || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw httpError(400, "Velicina fajla je obavezna.");
  const maxSizeBytes = isSmallImage ? MAX_SMALL_IMAGE_BYTES : MAX_MEDIA_BYTES;
  if (sizeBytes > maxSizeBytes) {
    throw httpError(413, isSmallImage ? "Logo moze imati najvise 5 MB." : "Video/slika moze imati najvise 100 MB.");
  }

  const key = `${purpose}/${actor.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: config.r2.bucketName, Key: key, ContentType: contentType }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );

  return {
    uploadUrl,
    publicUrl: `${config.r2.publicUrl}/${key}`,
    contentType,
    maxSizeBytes
  };
}
