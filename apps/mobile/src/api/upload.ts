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

  const form = new FormData();
  // React Native's fetch/FormData accepts this {uri, name, type} shape directly - no
  // need to fetch()+blob() the local file first like a browser would.
  form.append("file", {
    uri: asset.uri,
    name: `upload.${contentType.split("/")[1] || "jpg"}`,
    type: contentType
  } as unknown as Blob);
  form.append("api_key", target.apiKey);
  form.append("timestamp", String(target.timestamp));
  form.append("signature", target.signature);
  form.append("public_id", target.publicId);

  const uploadResponse = await fetch(target.uploadUrl, { method: "POST", body: form });
  const data = await uploadResponse.json().catch(() => null);

  if (!uploadResponse.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || `Upload nije uspeo (${uploadResponse.status})`);
  }

  return { url: data.secure_url as string, mediaType };
}
