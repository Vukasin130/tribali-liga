import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase.mjs";

const BUCKETS = {
  story: "app-media",
  news: "app-media",
  goal: "app-media",
  match: "app-media",
  logo: "team-logos",
  avatar: "team-logos"
};

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov"
};

export async function createUploadTarget(payload, actor) {
  if (!actor?.id) throw httpError(401, "Moras biti ulogovan.");
  const purpose = String(payload.purpose || "story").trim();
  const bucket = BUCKETS[purpose];
  if (!bucket) throw httpError(400, "Tip uploada nije validan.");

  const contentType = String(payload.contentType || payload.mimeType || "").trim().toLowerCase();
  if (!ALLOWED_MIME.has(contentType)) throw httpError(400, "Format fajla nije podrzan.");
  if (bucket === "team-logos" && !contentType.startsWith("image/")) throw httpError(400, "Logo mora biti slika.");

  const sizeBytes = Number(payload.sizeBytes || payload.size || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw httpError(400, "Velicina fajla je obavezna.");
  if (bucket === "team-logos" && sizeBytes > 5 * 1024 * 1024) throw httpError(413, "Logo moze imati najvise 5 MB.");
  if (bucket === "app-media" && sizeBytes > 100 * 1024 * 1024) throw httpError(413, "Video/slika moze imati najvise 100 MB.");

  const extension = EXTENSIONS[contentType];
  const path = `${purpose}/${actor.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
  const storage = supabaseAdmin().storage.from(bucket);
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error) throw httpError(error.statusCode || 500, error.message || "Upload link nije napravljen.");

  return {
    bucket,
    path,
    signedUrl: data.signedUrl,
    token: data.token,
    publicUrl: storage.getPublicUrl(path).data.publicUrl,
    contentType,
    maxSizeBytes: bucket === "team-logos" ? 5 * 1024 * 1024 : 100 * 1024 * 1024
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
