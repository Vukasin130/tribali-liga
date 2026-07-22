import * as ImagePicker from "expo-image-picker";
import { createUploadTarget } from "./endpoints";

const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

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

  const fileResponse = await fetch(asset.uri);
  const blob = await fileResponse.blob();

  const target = await createUploadTarget({ purpose, contentType, sizeBytes: asset.fileSize || blob.size || 1 });

  const uploadResponse = await fetch(target.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      ...(SUPABASE_PUBLISHABLE_KEY ? { apikey: SUPABASE_PUBLISHABLE_KEY } : {})
    },
    body: blob
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload nije uspeo (${uploadResponse.status}).`);
  }

  return { url: target.publicUrl, mediaType };
}
