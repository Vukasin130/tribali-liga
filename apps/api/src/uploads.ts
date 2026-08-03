import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { config } from "./config.ts";
import { httpError } from "./errors.ts";
import type { Actor } from "./types.ts";

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret
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

interface CreateUploadTargetPayload {
  purpose?: string;
  contentType?: string;
  mimeType?: string;
  sizeBytes?: number;
  size?: number;
}

export interface UploadTarget {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: "image" | "video";
  contentType: string;
  maxSizeBytes: number;
}

// Signed direct-upload: the phone uploads the file bytes straight to Cloudinary, never
// through our API - we only hand out a short-lived signature computed with the secret
// key (which never leaves the server) authorizing this one specific upload.
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

  const resourceType: "image" | "video" = contentType.startsWith("video/") ? "video" : "image";
  const publicId = `${purpose}/${actor.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { timestamp, public_id: publicId };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, config.cloudinary.apiSecret);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/${resourceType}/upload`,
    apiKey: config.cloudinary.apiKey,
    timestamp,
    signature,
    publicId,
    resourceType,
    contentType,
    maxSizeBytes
  };
}
