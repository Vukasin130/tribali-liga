import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createFantasySeason, listCompetitions, updateFantasySeason } from "../api/endpoints";
import type { Competition, FantasySeason } from "../api/types";
import { colors } from "../theme/colors";
import { PrimaryButton } from "../components/ui";

export function FantasySeasonComposerModal({
  season,
  onClose,
  onSaved
}: {
  season?: FantasySeason;
  onClose: () => void;
  onSaved: (season: FantasySeason) => void;
}) {
  const isEditing = Boolean(season);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [name, setName] = useState(season?.name || "");
  const [gameweekLengthDays, setGameweekLengthDays] = useState(String(season?.gameweekLengthDays || 7));
  const [competitionIds, setCompetitionIds] = useState<string[]>(season?.competitions?.map((c) => c.id) || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listCompetitions()
      .then(setCompetitions)
      .catch(() => undefined);
  }, []);

  function toggleCompetition(id: string) {
    setCompetitionIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Naziv sezone je obavezan.");
      return;
    }
    if (competitionIds.length === 0) {
      setError("Izaberi bar jednu ligu.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        gameweekLengthDays: Number(gameweekLengthDays) || 7,
        competitionIds
      };
      const saved =
        isEditing && season
          ? await updateFantasySeason(season.id, payload)
          : await createFantasySeason({ ...payload, status: "draft" });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fantasy sezona nije sacuvana.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{isEditing ? "Izmeni fantasy sezonu" : "Nova fantasy sezona"}</Text>
          <Text style={styles.subtitle}>
            Jedna fantasy sezona moze da obuhvati vise liga odjednom - korisnici prave jedan tim iz zajednickog bazena igraca svih izabranih liga.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Naziv sezone (npr. Prolece 2026)"
            placeholderTextColor="#9c9186"
            value={name}
            onChangeText={setName}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Duzina kola (dana)</Text>
            <TextInput
              style={styles.input}
              placeholder="7"
              placeholderTextColor="#9c9186"
              keyboardType="number-pad"
              value={gameweekLengthDays}
              onChangeText={setGameweekLengthDays}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Lige koje ucestvuju u sezoni</Text>
            <View style={styles.chipsRow}>
              {competitions.map((competition) => (
                <TouchableOpacity
                  key={competition.id}
                  style={[styles.chip, competitionIds.includes(competition.id) ? styles.chipActive : null]}
                  onPress={() => toggleCompetition(competition.id)}
                >
                  <Text style={[styles.chipText, competitionIds.includes(competition.id) ? styles.chipTextActive : null]}>
                    {competition.cityName ? `${competition.cityName} - ` : ""}
                    {competition.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj sezonu"} onPress={handleSave} loading={saving} />
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
  subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 4 },
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
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
