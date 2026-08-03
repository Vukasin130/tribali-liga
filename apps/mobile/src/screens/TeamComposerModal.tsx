import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { addClubToCompetition, createTeam, fetchClubs } from "../api/endpoints";
import type { Club, Team } from "../api/types";
import { colors } from "../theme/colors";
import { PrimaryButton } from "../components/ui";

export function TeamComposerModal({
  competitionId,
  existingTeamNames,
  onClose,
  onSaved
}: {
  competitionId: string;
  existingTeamNames: string[];
  onClose: () => void;
  onSaved: (team: Team) => void;
}) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [addingClubId, setAddingClubId] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setClubsLoading(true);
    fetchClubs()
      .then((rows) => {
        if (!cancelled) setClubs(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setClubsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const existingNamesLower = useMemo(() => new Set(existingTeamNames.map((n) => n.trim().toLowerCase())), [existingTeamNames]);
  const pickableClubs = clubs.filter((club) => !existingNamesLower.has(club.name.trim().toLowerCase()));

  async function handleAddClub(club: Club) {
    setAddingClubId(club.id);
    setError("");
    try {
      const result = await addClubToCompetition(competitionId, { clubId: club.id, includePlayers: true });
      onSaved(result.team);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ekipa nije dodata.");
    } finally {
      setAddingClubId("");
    }
  }

  async function handleSaveNew() {
    if (!name.trim()) {
      setError("Naziv ekipe je obavezan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const team = await createTeam({
        competitionId,
        name: name.trim(),
        shortName: shortName.trim() || undefined,
        groupName: groupName.trim() || undefined
      });
      onSaved(team);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ekipa nije sacuvana.");
    } finally {
      setSaving(false);
    }
  }

  function clubMeta(club: Club): string {
    const parts: string[] = [];
    if (club.competitionsCount > 0) {
      parts.push(`igrala u ${club.competitionsCount} ${club.competitionsCount === 1 ? "ligi" : "liga"}`);
    }
    parts.push(`${club.activePlayersCount} ${club.activePlayersCount === 1 ? "igrac" : "igraca"} u bazi`);
    return parts.join(" · ");
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Dodaj ekipu</Text>

          <Text style={styles.label}>Postojeci klubovi iz baze</Text>
          {clubsLoading ? (
            <ActivityIndicator color={colors.purple} />
          ) : pickableClubs.length === 0 ? (
            <Text style={styles.hint}>
              {clubs.length === 0 ? "Baza jos nema nijedan klub." : "Svi poznati klubovi su vec u ovoj ligi."}
            </Text>
          ) : (
            <View style={styles.clubList}>
              {pickableClubs.map((club) => (
                <TouchableOpacity
                  key={club.id}
                  style={styles.clubRow}
                  onPress={() => handleAddClub(club)}
                  disabled={!!addingClubId}
                >
                  <View style={styles.flex1}>
                    <Text style={styles.clubName}>{club.name}</Text>
                    <Text style={styles.clubMeta}>{clubMeta(club)}</Text>
                  </View>
                  {addingClubId === club.id ? (
                    <ActivityIndicator color={colors.purple} size="small" />
                  ) : (
                    <Text style={styles.clubAddText}>Dodaj sa igracima</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!showNewForm ? (
            <TouchableOpacity style={styles.newTeamToggle} onPress={() => setShowNewForm(true)}>
              <Text style={styles.newTeamToggleText}>+ Ovo je nova ekipa koje jos nema u bazi</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.newForm}>
              <Text style={styles.label}>Nova ekipa</Text>
              <TextInput
                style={styles.input}
                placeholder="Naziv ekipe"
                placeholderTextColor="#9c9186"
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={styles.input}
                placeholder="Skraceni naziv (opciono, npr. NNS)"
                placeholderTextColor="#9c9186"
                value={shortName}
                onChangeText={setShortName}
              />
              <TextInput
                style={styles.input}
                placeholder="Grupa (opciono)"
                placeholderTextColor="#9c9186"
                value={groupName}
                onChangeText={setGroupName}
              />
              <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj novu ekipu"} onPress={handleSaveNew} loading={saving} />
            </View>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Zatvori</Text>
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
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  hint: { color: colors.textMuted, fontSize: 13 },
  flex1: { flex: 1 },
  clubList: { gap: 8 },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  clubName: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  clubMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  clubAddText: { color: colors.purple, fontWeight: "700", fontSize: 12 },
  newTeamToggle: { paddingVertical: 10 },
  newTeamToggleText: { color: colors.purple, fontWeight: "700", textAlign: "center" },
  newForm: { gap: 12, backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: 14 },
  input: {
    backgroundColor: "#fff",
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
