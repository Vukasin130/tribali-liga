import React, { useEffect, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createStory, createStoryFolder, fetchStoryFolders } from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import type { StoryFolder } from "../api/types";
import { colors } from "../theme/colors";
import { PrimaryButton } from "../components/ui";

export function StoryComposerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [folders, setFolders] = useState<StoryFolder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [title, setTitle] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video" | "">("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    fetchStoryFolders()
      .then((rows) => {
        setFolders(rows);
        setFolderId((current) => current || rows[0]?.id || "");
      })
      .catch(() => undefined);
  }, []);

  async function handleAddFolder() {
    if (!newFolderTitle.trim()) return;
    try {
      const folder = await createStoryFolder({ title: newFolderTitle.trim() });
      setFolders((previous) => [...previous, folder]);
      setFolderId(folder.id);
      setNewFolderTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rubrika nije sacuvana.");
    }
  }

  async function handlePickMedia() {
    setError("");
    setUploading(true);
    try {
      const uploaded = await pickAndUploadMedia("story");
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
    if (!folderId) {
      setError("Izaberi ili napravi rubriku.");
      return;
    }
    if (!mediaUrl) {
      setError("Dodaj sliku ili video.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createStory({ folderId, title: title.trim(), mediaUrl, mediaType: mediaType || "image" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Story nije sacuvan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Novi story</Text>

          <Text style={styles.label}>Rubrika</Text>
          <View style={styles.folderRow}>
            {folders.map((folder) => (
              <TouchableOpacity
                key={folder.id}
                style={[styles.folderChip, folderId === folder.id ? styles.folderChipActive : null]}
                onPress={() => setFolderId(folder.id)}
              >
                <Text style={[styles.folderChipText, folderId === folder.id ? styles.folderChipTextActive : null]}>{folder.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.newFolderRow}>
            <TextInput
              style={[styles.input, styles.newFolderInput]}
              placeholder="Nova rubrika"
              placeholderTextColor="#9c9186"
              value={newFolderTitle}
              onChangeText={setNewFolderTitle}
            />
            <TouchableOpacity style={styles.addFolderButton} onPress={handleAddFolder}>
              <Text style={styles.addFolderButtonText}>Dodaj</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Naslov (opciono)"
            placeholderTextColor="#9c9186"
            value={title}
            onChangeText={setTitle}
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Objavi story"} onPress={handleSave} loading={saving} />
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
  content: { padding: 20, paddingTop: 60, gap: 10, paddingBottom: 60 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, marginTop: 4 },
  folderRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  folderChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  folderChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  folderChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  folderChipTextActive: { color: "#fff" },
  newFolderRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  newFolderInput: { flex: 1 },
  addFolderButton: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  addFolderButtonText: { color: colors.purple, fontWeight: "700" },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  mediaPreview: { width: "100%", height: 180, borderRadius: 14 },
  mediaPreviewPlaceholder: { width: "100%", height: 100, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  mediaPreviewText: { color: "#fff", fontWeight: "700" },
  pickButton: { backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  pickButtonText: { color: colors.purple, fontWeight: "700" },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
