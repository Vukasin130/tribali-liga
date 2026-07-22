import { createUploadTarget } from "./endpoints";

const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || "";

export interface UploadedMedia {
  url: string;
  mediaType: "image" | "video";
}

export async function uploadMediaFile(file: File, purpose: "story" | "news" | "goal" | "logo"): Promise<UploadedMedia> {
  const target = await createUploadTarget({ purpose, contentType: file.type, sizeBytes: file.size });

  const response = await fetch(target.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      ...(SUPABASE_PUBLISHABLE_KEY ? { apikey: SUPABASE_PUBLISHABLE_KEY } : {})
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(`Upload nije uspeo (${response.status}).`);
  }

  return {
    url: target.publicUrl,
    mediaType: file.type.startsWith("video/") ? "video" : "image"
  };
}
