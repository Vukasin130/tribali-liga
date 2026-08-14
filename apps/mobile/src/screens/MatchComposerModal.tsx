import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createMatch } from "../api/endpoints";
import type { MatchDetail, Team } from "../api/types";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { PrimaryButton } from "../components/ui";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function defaultDate(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultTime(): string {
  return "19:00";
}

export function MatchComposerModal({
  competitionId,
  teams,
  onClose,
  onSaved
}: {
  competitionId: string;
  teams: Team[];
  onClose: () => void;
  onSaved: (match: MatchDetail) => void;
}) {
  const [homeTeamId, setHomeTeamId] = useState(teams[0]?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState(teams[1]?.id ?? "");
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState(defaultTime());
  const [venue, setVenue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isWide = useIsWideScreen();

  async function handleSave() {
    if (!homeTeamId || !awayTeamId) {
      setError("Izaberi obe ekipe.");
      return;
    }
    if (homeTeamId === awayTeamId) {
      setError("Domacin i gost moraju biti razlicite ekipe.");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError("Datum ili vreme nisu ispravni.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const match = await createMatch({
        competitionId,
        homeTeamId,
        awayTeamId,
        scheduledAt: scheduledAt.toISOString(),
        venue: venue.trim() || undefined
      });
      onSaved(match);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Utakmica nije zakazana.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.title}>Zakazi utakmicu</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Domacin</Text>
            <View style={styles.chipsRow}>
              {teams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[styles.chip, homeTeamId === team.id ? styles.chipActive : null]}
                  onPress={() => setHomeTeamId(team.id)}
                >
                  <Text style={[styles.chipText, homeTeamId === team.id ? styles.chipTextActive : null]}>{team.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Gost</Text>
            <View style={styles.chipsRow}>
              {teams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[styles.chip, awayTeamId === team.id ? styles.chipActive : null]}
                  onPress={() => setAwayTeamId(team.id)}
                >
                  <Text style={[styles.chipText, awayTeamId === team.id ? styles.chipTextActive : null]}>{team.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>Datum</Text>
              <TextInput style={styles.input} placeholder="GGGG-MM-DD" placeholderTextColor="#9c9186" value={date} onChangeText={setDate} />
            </View>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>Vreme</Text>
              <TextInput style={styles.input} placeholder="HH:mm" placeholderTextColor="#9c9186" value={time} onChangeText={setTime} />
            </View>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Teren / lokacija (opciono)"
            placeholderTextColor="#9c9186"
            value={venue}
            onChangeText={setVenue}
          />

          {teams.length < 2 ? <Text style={styles.error}>Ova liga jos nema dve ekipe. Prvo dodaj bar dve ekipe.</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Zakazivanje..." : "Zakazi utakmicu"} onPress={handleSave} loading={saving} disabled={teams.length < 2} />
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
  content: { padding: 20, paddingTop: 60, gap: 14, paddingBottom: 60 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  field: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  chipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  row: { flexDirection: "row", gap: 12 },
  flex1: { flex: 1 },
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
