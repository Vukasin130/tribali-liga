import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createFantasyGameweek } from "../api/endpoints";
import type { FantasyGameweek } from "../api/types";
import { colors } from "../theme/colors";
import { PrimaryButton } from "../components/ui";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTimeInput(date: Date): string {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeInput(text: string, label: string): string {
  const match = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`${label} mora biti u formatu DD.MM.GGGG HH:mm (npr. 01.09.2026 18:00).`);
  }
  const [, day, month, year, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} nije validan datum.`);
  }
  return date.toISOString();
}

export function FantasyGameweekComposerModal({
  fantasySeasonId,
  gameweekLengthDays,
  onClose,
  onSaved
}: {
  fantasySeasonId: string;
  gameweekLengthDays: number;
  onClose: () => void;
  onSaved: (gameweek: FantasyGameweek) => void;
}) {
  const now = new Date();
  const defaultEnd = new Date(now.getTime() + (gameweekLengthDays || 7) * 24 * 60 * 60 * 1000);

  const [name, setName] = useState("");
  const [startsAtText, setStartsAtText] = useState(formatDateTimeInput(now));
  const [locksAtText, setLocksAtText] = useState(formatDateTimeInput(now));
  const [endsAtText, setEndsAtText] = useState(formatDateTimeInput(defaultEnd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) {
      setError("Naziv kola je obavezan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const startsAt = parseDateTimeInput(startsAtText, "Pocetak");
      const locksAt = parseDateTimeInput(locksAtText, "Zakljucavanje tima");
      const endsAt = parseDateTimeInput(endsAtText, "Kraj kola");
      const gameweek = await createFantasyGameweek({
        fantasySeasonId,
        name: name.trim(),
        startsAt,
        locksAt,
        endsAt,
        status: "open"
      });
      onSaved(gameweek);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kolo nije sacuvano.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Novo fantasy kolo</Text>

          <TextInput
            style={styles.input}
            placeholder="Naziv kola (npr. Kolo 1)"
            placeholderTextColor="#9c9186"
            value={name}
            onChangeText={setName}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Pocetak</Text>
            <TextInput
              style={styles.input}
              placeholder="DD.MM.GGGG HH:mm"
              placeholderTextColor="#9c9186"
              value={startsAtText}
              onChangeText={setStartsAtText}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Zakljucavanje tima</Text>
            <TextInput
              style={styles.input}
              placeholder="DD.MM.GGGG HH:mm"
              placeholderTextColor="#9c9186"
              value={locksAtText}
              onChangeText={setLocksAtText}
            />
            <Text style={styles.hint}>Nakon ovog trenutka korisnici vise ne mogu da menjaju tim za ovo kolo.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Kraj kola (za bodovanje)</Text>
            <TextInput
              style={styles.input}
              placeholder="DD.MM.GGGG HH:mm"
              placeholderTextColor="#9c9186"
              value={endsAtText}
              onChangeText={setEndsAtText}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj kolo"} onPress={handleSave} loading={saving} />
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
  hint: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
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
