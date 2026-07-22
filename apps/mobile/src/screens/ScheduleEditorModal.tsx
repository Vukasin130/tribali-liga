import React, { useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { updateMatch } from "../api/endpoints";
import type { GeneratedMatch } from "../api/types";
import { colors } from "../theme/colors";
import { Card } from "../components/ui";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface Draft {
  date: string;
  time: string;
  saved: boolean;
}

export function ScheduleEditorModal({
  matches,
  onClose,
  onSaved
}: {
  matches: GeneratedMatch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const initial: Record<string, Draft> = {};
    matches.forEach((match) => {
      initial[match.id] = { date: formatDate(match.scheduledAt), time: formatTime(match.scheduledAt), saved: false };
    });
    return initial;
  });

  const rounds = useMemo(() => {
    const byRound = new Map<number, GeneratedMatch[]>();
    matches.forEach((match) => {
      const round = match.round ?? 0;
      const list = byRound.get(round) ?? [];
      list.push(match);
      byRound.set(round, list);
    });
    return Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]);
  }, [matches]);

  function updateDraft(matchId: string, field: "date" | "time", value: string) {
    setDrafts((previous) => ({ ...previous, [matchId]: { ...previous[matchId], [field]: value, saved: false } }));
  }

  async function handleSaveMatch(matchId: string) {
    const draft = drafts[matchId];
    if (!draft?.date || !draft?.time) {
      setError("Unesi datum i vreme za ovu utakmicu.");
      return;
    }
    const scheduledAt = new Date(`${draft.date}T${draft.time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError("Datum ili vreme nisu ispravni.");
      return;
    }
    setSavingId(matchId);
    setError("");
    try {
      await updateMatch(matchId, { scheduledAt: scheduledAt.toISOString() });
      setDrafts((previous) => ({ ...previous, [matchId]: { ...previous[matchId], saved: true } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Termin nije sacuvan.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Raspored po kolima</Text>
          <Text style={styles.hint}>
            Aplikacija je vec izracunala ko sa kim igra u svakom kolu. Svaka utakmica ima svoj dan i vreme - ne moraju sve utakmice istog kola da budu istog dana.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {rounds.map(([round, list]) => (
            <Card key={round} style={styles.roundCard}>
              <Text style={styles.roundTitle}>Kolo {round}</Text>

              {list.map((match) => {
                const draft = drafts[match.id];
                return (
                  <View key={match.id} style={styles.matchBlock}>
                    <Text style={styles.matchTeams}>{match.homeTeamName} vs {match.awayTeamName}</Text>
                    <View style={styles.draftRow}>
                      <View style={styles.draftField}>
                        <TextInput
                          style={styles.input}
                          placeholder="GGGG-MM-DD"
                          placeholderTextColor="#9c9186"
                          value={draft?.date ?? ""}
                          onChangeText={(value) => updateDraft(match.id, "date", value)}
                        />
                      </View>
                      <View style={styles.draftField}>
                        <TextInput
                          style={styles.input}
                          placeholder="HH:mm"
                          placeholderTextColor="#9c9186"
                          value={draft?.time ?? ""}
                          onChangeText={(value) => updateDraft(match.id, "time", value)}
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.saveButton, draft?.saved ? styles.saveButtonSaved : null]}
                        onPress={() => handleSaveMatch(match.id)}
                        disabled={savingId === match.id}
                      >
                        <Text style={styles.saveButtonText}>
                          {savingId === match.id ? "..." : draft?.saved ? "Sacuvano" : "Sacuvaj"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </Card>
          ))}

          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => {
              onSaved();
              onClose();
            }}
          >
            <Text style={styles.doneButtonText}>Gotovo</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 60, gap: 14, paddingBottom: 60 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  roundCard: { gap: 12 },
  roundTitle: { color: colors.purple, fontWeight: "800", fontSize: 15, textTransform: "uppercase" },
  matchBlock: { gap: 6, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  matchTeams: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  draftRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  draftField: { flex: 1 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 13
  },
  saveButton: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.purple },
  saveButtonSaved: { backgroundColor: colors.success },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  doneButton: { alignItems: "center", paddingVertical: 14, borderRadius: 16, backgroundColor: colors.ink, marginTop: 10 },
  doneButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 }
});
