import React, { useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createNews, updateNews } from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import type { NewsItem } from "../api/types";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { PrimaryButton } from "../components/ui";

export function NewsComposerModal({
  existingItem,
  onClose,
  onSaved
}: {
  existingItem?: NewsItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existingItem?.title ?? "");
  const [body, setBody] = useState(existingItem?.body ?? "");
  const [mediaUrl, setMediaUrl] = useState(existingItem?.mediaUrl ?? "");
  const [mediaType, setMediaType] = useState<string>(existingItem?.mediaType ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const isWide = useIsWideScreen();

  async function handlePickMedia() {
    setError("");
    setUploading(true);
    try {
      const uploaded = await pickAndUploadMedia("news");
      if (uploaded) {
        setMediaUrl(uploaded.url);
        setMediaType(uploaded.mediaType);
        setPhotoFailed(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Otpremanje nije uspelo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Naslov je obavezan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (existingItem) {
        await updateNews(existingItem.id, { title: title.trim(), body: body.trim(), mediaUrl, mediaType });
      } else {
        await createNews({ title: title.trim(), body: body.trim(), mediaUrl, mediaType, isPublished: true });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vest nije sacuvana.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.title}>{existingItem ? "Izmeni vest" : "Nova vest"}</Text>

          <TextInput
            style={styles.input}
            placeholder="Naslov"
            placeholderTextColor="#9c9186"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tekst vesti (opciono)"
            placeholderTextColor="#9c9186"
            value={body}
            onChangeText={setBody}
            multiline
          />

          {mediaUrl ? (
            mediaType === "video" ? (
              <View style={styles.mediaPreviewPlaceholder}>
                <Text style={styles.mediaPreviewText}>Video spreman</Text>
              </View>
            ) : !photoFailed ? (
              <Image source={{ uri: mediaUrl }} style={styles.mediaPreview} onError={() => setPhotoFailed(true)} />
            ) : (
              <View style={styles.mediaPreviewPlaceholder}>
                <Text style={styles.mediaPreviewText}>Slika se ne ucitava</Text>
              </View>
            )
          ) : null}

          <TouchableOpacity style={styles.pickButton} onPress={handlePickMedia} disabled={uploading}>
            <Text style={styles.pickButtonText}>{uploading ? "Otpremanje..." : mediaUrl ? "Promeni sliku/video" : "Dodaj sliku ili video"}</Text>
          </TouchableOpacity>
          <Text style={styles.formatHint}>
            Preporucen format: pejzazna (landscape) fotografija 16:9, idealno oko 1600x900px. Ista slika se koristi i kao veliki baner i kao mali kvadratni pregled, zato drzi glavni motiv u centru kadra.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Objavi vest"} onPress={handleSave} loading={saving} />
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Otkazi</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  mediaPreview: { width: "100%", height: 180, borderRadius: 14 },
  mediaPreviewPlaceholder: { width: "100%", height: 100, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  mediaPreviewText: { color: "#fff", fontWeight: "700" },
  pickButton: { backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  pickButtonText: { color: colors.purple, fontWeight: "700" },
  formatHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
