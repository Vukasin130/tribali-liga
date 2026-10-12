import * as ImagePicker from "expo-image-picker";
import { createUploadTarget } from "./endpoints";

export interface UploadedMedia {
  url: string;
  mediaType: "image" | "video";
}

export async function pickAndUploadMedia(purpose: "story" | "news" | "goal" | "logo" | "avatar"): Promise<UploadedMedia | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Potrebna je dozvola za pristup galeriji da bi otpremio sliku ili video.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 0.85
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const mediaType: "image" | "video" = asset.type === "video" ? "video" : "image";
  const contentType = asset.mimeType || (mediaType === "video" ? "video/mp4" : "image/jpeg");

  const target = await createUploadTarget({ purpose, contentType, sizeBytes: asset.fileSize || 1 });

  // Read the local file (works for both a web blob: URL and a native file:// / content://
  // URI) into a Blob, then PUT it straight to the presigned R2 URL - a plain binary PUT,
  // not multipart form data, since R2 (unlike Cloudinary's upload API) takes the raw body.
  const localFile = await fetch(asset.uri);
  const blob = await localFile.blob();

  const uploadResponse = await fetch(target.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": target.contentType },
    body: blob
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload nije uspeo (${uploadResponse.status})`);
  }

  return { url: target.publicUrl, mediaType };
}
