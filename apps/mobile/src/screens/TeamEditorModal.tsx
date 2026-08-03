import React, { useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { updateTeam } from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import { colors } from "../theme/colors";
import { PrimaryButton } from "../components/ui";
import { kitGradientForTeam } from "../components/PitchPlayerCard";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function TeamEditorModal({
  team,
  onClose,
  onSaved
}: {
  team: { id: string; name: string; shortName: string; logoUrl: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.shortName);
  const [logoUrl, setLogoUrl] = useState(team.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);

  const gradient = kitGradientForTeam(team.id);

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
    if (!name.trim()) {
      setError("Naziv ekipe je obavezan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateTeam(team.id, { name: name.trim(), shortName: shortName.trim(), logoUrl });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ekipa nije sacuvana.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Izmeni ekipu</Text>

          {logoUrl && !photoFailed ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logoPreview}
              resizeMode="cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <LinearGradient colors={gradient} style={styles.logoFallback}>
              <Text style={styles.logoFallbackText}>{initialsOf(name || "?")}</Text>
            </LinearGradient>
          )}
          <TouchableOpacity style={styles.pickButton} onPress={handlePickLogo} disabled={uploading}>
            <Text style={styles.pickButtonText}>{uploading ? "Otpremanje..." : logoUrl ? "Promeni logo" : "Dodaj logo"}</Text>
          </TouchableOpacity>

          <View style={styles.field}>
            <Text style={styles.label}>Naziv ekipe</Text>
            <TextInput
              style={styles.input}
              placeholder="Naziv ekipe"
              placeholderTextColor="#9c9186"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Skraceni naziv (opciono)</Text>
            <TextInput
              style={styles.input}
              placeholder="npr. NNA"
              placeholderTextColor="#9c9186"
              value={shortName}
              onChangeText={setShortName}
              autoCapitalize="characters"
              maxLength={5}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj ekipu"} onPress={handleSave} loading={saving} />
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
  field: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  logoPreview: { width: 96, height: 96, borderRadius: 22, alignSelf: "center" },
  logoFallback: { width: 96, height: 96, borderRadius: 22, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: "#fff", fontSize: 30, fontWeight: "800" },
  pickButton: { backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  pickButtonText: { color: colors.purple, fontWeight: "700" },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
