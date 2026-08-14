import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createGoalPoll } from "../api/endpoints";
import type { GoalPollOptionInput } from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { PrimaryButton } from "../components/ui";

export function GoalPollComposerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const isWide = useIsWideScreen();
  const [title, setTitle] = useState("Glasaj za gol kola");
  const [options, setOptions] = useState<GoalPollOptionInput[]>([
    { title: "", videoUrl: "" },
    { title: "", videoUrl: "" }
  ]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateOption(index: number, field: "title" | "videoUrl", value: string) {
    setOptions((previous) => previous.map((option, i) => (i === index ? { ...option, [field]: value } : option)));
  }

  async function handlePickVideo(index: number) {
    setError("");
    setUploadingIndex(index);
    try {
      const uploaded = await pickAndUploadMedia("goal");
      if (uploaded) updateOption(index, "videoUrl", uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video nije otpremljen.");
    } finally {
      setUploadingIndex(null);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Naslov ankete je obavezan.");
      return;
    }
    if (options.some((option) => !option.title.trim() || !option.videoUrl)) {
      setError("Svaka opcija mora imati naziv i video.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createGoalPoll({ title: title.trim(), status: "open", options });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anketa nije sacuvana.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.title}>Nova anketa - gol nedelje</Text>

          <TextInput
            style={styles.input}
            placeholder="Naslov ankete"
            placeholderTextColor="#9c9186"
            value={title}
            onChangeText={setTitle}
          />

          {options.map((option, index) => (
            <View key={index} style={styles.optionCard}>
              <Text style={styles.optionLabel}>Opcija {index + 1}</Text>
              <TextInput
                style={styles.input}
                placeholder="Naziv/opis gola"
                placeholderTextColor="#9c9186"
                value={option.title}
                onChangeText={(value) => updateOption(index, "title", value)}
              />
              <TouchableOpacity style={styles.pickButton} onPress={() => handlePickVideo(index)} disabled={uploadingIndex === index}>
                <Text style={styles.pickButtonText}>
                  {uploadingIndex === index ? "Otpremanje..." : option.videoUrl ? "Video spreman - promeni" : "Dodaj video gola"}
                </Text>
              </TouchableOpacity>
              {options.length > 2 ? (
                <TouchableOpacity onPress={() => setOptions((previous) => previous.filter((_, i) => i !== index))}>
                  <Text style={styles.removeOption}>Ukloni opciju</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          <TouchableOpacity
            style={styles.addOptionButton}
            onPress={() => setOptions((previous) => [...previous, { title: "", videoUrl: "" }])}
          >
            <Text style={styles.addOptionButtonText}>Dodaj opciju</Text>
          </TouchableOpacity>

          <Text style={styles.videoHint}>
            Preporuka za video: snimi ga horizontalno (vodoravno), u formatu 16:9, minimalno 1280x720. Na desktop
            verziji sajta se video prikazuje preko cele sirine ekrana - vertikalni ("portret") snimci bivaju iseceni
            sa strane da bi popunili taj prostor, dok horizontalni snimci staju ceo bez sečenja.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Pokreni anketu"} onPress={handleSave} loading={saving} />
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
  optionCard: { backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: 12, gap: 8 },
  optionLabel: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  pickButton: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  pickButtonText: { color: colors.purple, fontWeight: "700", fontSize: 13 },
  removeOption: { color: colors.danger, fontWeight: "700", fontSize: 12, textAlign: "right" },
  addOptionButton: { alignItems: "center", paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.line, borderStyle: "dashed" },
  addOptionButtonText: { color: colors.purple, fontWeight: "700" },
  videoHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
