import React, { useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createPlayer, updatePlayer } from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import { colors } from "../theme/colors";
import { PrimaryButton } from "../components/ui";

const POSITIONS = [
  { value: "golman", label: "Golman" },
  { value: "odbrana", label: "Odbrana" },
  { value: "napad", label: "Napad" }
];

export function PlayerEditorModal({
  teamId,
  player,
  onClose,
  onSaved
}: {
  teamId?: string;
  player?: { id: string; displayName: string; position: string; shirtNumber: number | null; avatarUrl: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = Boolean(player);
  const [displayName, setDisplayName] = useState(player?.displayName || "");
  const [position, setPosition] = useState(player?.position || "");
  const [shirtNumber, setShirtNumber] = useState(player?.shirtNumber ? String(player.shirtNumber) : "");
  const [avatarUrl, setAvatarUrl] = useState(player?.avatarUrl || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handlePickPhoto() {
    setError("");
    setUploading(true);
    try {
      const uploaded = await pickAndUploadMedia("avatar");
      if (uploaded) setAvatarUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fotografija nije otpremljena.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setError("Ime igraca je obavezno.");
      return;
    }
    if (!isEditing && !teamId) {
      setError("Ekipa je obavezna.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        displayName: displayName.trim(),
        position,
        shirtNumber: shirtNumber.trim() ? Number(shirtNumber) : null,
        avatarUrl
      };
      if (isEditing && player) {
        await updatePlayer(player.id, payload);
      } else {
        await createPlayer({ teamId: teamId as string, ...payload, shirtNumber: payload.shirtNumber ?? undefined });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Igrac nije sacuvan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{isEditing ? "Izmeni igraca" : "Novi igrac"}</Text>

          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} resizeMode="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>Nema fotografije</Text>
            </View>
          )}
          <TouchableOpacity style={styles.pickButton} onPress={handlePickPhoto} disabled={uploading}>
            <Text style={styles.pickButtonText}>{uploading ? "Otpremanje..." : avatarUrl ? "Promeni fotografiju" : "Dodaj fotografiju"}</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Ime i prezime igraca"
            placeholderTextColor="#9c9186"
            value={displayName}
            onChangeText={setDisplayName}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Pozicija</Text>
            <View style={styles.chipsRow}>
              {POSITIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.chip, position === option.value ? styles.chipActive : null]}
                  onPress={() => setPosition(option.value)}
                >
                  <Text style={[styles.chipText, position === option.value ? styles.chipTextActive : null]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Broj dresa (opciono)</Text>
            <TextInput
              style={styles.input}
              placeholder="npr. 10"
              placeholderTextColor="#9c9186"
              keyboardType="number-pad"
              value={shirtNumber}
              onChangeText={setShirtNumber}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj igraca"} onPress={handleSave} loading={saving} />
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
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  chipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  avatarPreview: { width: 96, height: 96, borderRadius: 48, alignSelf: "center" },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarPlaceholderText: { color: colors.textMuted, fontSize: 11, fontWeight: "600", textAlign: "center", paddingHorizontal: 8 },
  pickButton: { backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  pickButtonText: { color: colors.purple, fontWeight: "700" },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
