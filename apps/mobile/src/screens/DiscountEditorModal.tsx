import React, { useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { updateDiscount } from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import type { Sponsor } from "../api/types";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { PrimaryButton } from "../components/ui";

// Edits the Profile screen's "partner discount" card - reuses the sponsors table
// (kind='discount') so this is just one more single-record editor next to the
// weekly SponsorEditorModal, not a new content type.
export function DiscountEditorModal({
  discount,
  onClose,
  onSaved
}: {
  discount: Sponsor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(discount?.title ?? "10% popusta kod partnera lige");
  const [subtitle, setSubtitle] = useState(discount?.subtitle ?? "");
  const [targetUrl, setTargetUrl] = useState(discount?.targetUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(discount?.logoUrl ?? "");
  const [isActive, setIsActive] = useState(discount?.isActive !== false);
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
      setError(err instanceof Error ? err.message : "Slika nije otpremljena.");
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
      await updateDiscount({
        id: discount?.id,
        title: title.trim(),
        subtitle: subtitle.trim(),
        logoUrl,
        targetUrl: targetUrl.trim(),
        isActive
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Popust nije sacuvan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.title}>Popust kod partnera</Text>
          <Text style={styles.hint}>
            Prikazuje se kao kartica na Profil ekranu svih korisnika, sa QR/kod slikom ako je dodas.
          </Text>

          <TextInput style={styles.input} placeholder="Naslov, npr. 10% popusta kod partnera lige" placeholderTextColor="#9c9186" value={title} onChangeText={setTitle} />
          <TextInput
            style={styles.input}
            placeholder="Kod za popust ili napomena (opciono)"
            placeholderTextColor="#9c9186"
            value={subtitle}
            onChangeText={setSubtitle}
          />
          <TextInput style={styles.input} placeholder="Link ka partneru (opciono)" placeholderTextColor="#9c9186" value={targetUrl} onChangeText={setTargetUrl} autoCapitalize="none" />

          {logoUrl && !photoFailed ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logoPreview}
              resizeMode="contain"
              onError={() => setPhotoFailed(true)}
            />
          ) : null}
          <TouchableOpacity style={styles.pickButton} onPress={handlePickLogo} disabled={uploading}>
            <Text style={styles.pickButtonText}>{uploading ? "Otpremanje..." : logoUrl ? "Promeni QR/sliku" : "Dodaj QR/sliku (opciono)"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.activeToggle} onPress={() => setIsActive((current) => !current)}>
            <Ionicons name={isActive ? "checkbox" : "square-outline"} size={20} color={isActive ? colors.purple : colors.textMuted} />
            <Text style={styles.activeToggleText}>Aktivan (prikazuje se korisnicima)</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj popust"} onPress={handleSave} loading={saving} />
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
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: -6, marginBottom: 4 },
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
  activeToggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  activeToggleText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
