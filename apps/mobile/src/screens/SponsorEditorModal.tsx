import React, { useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { updateSponsor } from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import type { Sponsor } from "../api/types";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { PrimaryButton } from "../components/ui";

export function SponsorEditorModal({
  sponsor,
  onClose,
  onSaved
}: {
  sponsor: Sponsor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(sponsor?.title ?? "");
  const [subtitle, setSubtitle] = useState(sponsor?.subtitle ?? "");
  const [targetUrl, setTargetUrl] = useState(sponsor?.targetUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(sponsor?.logoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const isWide = useIsWideScreen();

  async function handlePickLogo() {
    setError("");
    setUploading(true);
    try {
      const uploaded = await pickAndUploadMedia("logo");
      if (uploaded) {
        setLogoUrl(uploaded.url);
        setPhotoFailed(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo nije otpremljen.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Naziv sponzora je obavezan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateSponsor({ id: sponsor?.id, title: title.trim(), subtitle: subtitle.trim(), logoUrl, targetUrl: targetUrl.trim(), isActive: true });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sponzor nije sacuvan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.title}>Sponzor</Text>

          <TextInput style={styles.input} placeholder="Naziv sponzora" placeholderTextColor="#9c9186" value={title} onChangeText={setTitle} />
          <TextInput style={styles.input} placeholder="Podnaslov (opciono)" placeholderTextColor="#9c9186" value={subtitle} onChangeText={setSubtitle} />
          <TextInput style={styles.input} placeholder="Link ka sponzoru (opciono)" placeholderTextColor="#9c9186" value={targetUrl} onChangeText={setTargetUrl} autoCapitalize="none" />

          {logoUrl && !photoFailed ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logoPreview}
              resizeMode="contain"
              onError={() => setPhotoFailed(true)}
            />
          ) : null}
          <TouchableOpacity style={styles.pickButton} onPress={handlePickLogo} disabled={uploading}>
            <Text style={styles.pickButtonText}>{uploading ? "Otpremanje..." : logoUrl ? "Promeni logo" : "Dodaj logo"}</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj sponzora"} onPress={handleSave} loading={saving} />
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
  logoPreview: { width: 96, height: 96, borderRadius: 16, alignSelf: "center", backgroundColor: colors.surfaceMuted },
  pickButton: { backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  pickButtonText: { color: colors.purple, fontWeight: "700" },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
