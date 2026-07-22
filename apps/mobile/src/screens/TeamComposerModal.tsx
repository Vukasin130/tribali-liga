import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createTeam, fetchCompetitionTeams } from "../api/endpoints";
import type { Team } from "../api/types";
import { colors } from "../theme/colors";
import { PrimaryButton } from "../components/ui";
import { useCompetition } from "../state/CompetitionContext";

interface KnownTeam {
  name: string;
  shortName: string;
}

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
  const { competitions } = useCompetition();
  const [knownTeams, setKnownTeams] = useState<KnownTeam[]>([]);
  const [knownLoading, setKnownLoading] = useState(true);
  const [addingExistingName, setAddingExistingName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setKnownLoading(true);
    Promise.all(competitions.map((competition) => fetchCompetitionTeams(competition.id).catch(() => [])))
      .then((rows) => {
        if (cancelled) return;
        const byName = new Map<string, KnownTeam>();
        rows.flat().forEach((team) => {
          const key = team.name.trim().toLowerCase();
          if (!key || byName.has(key)) return;
          byName.set(key, { name: team.name, shortName: team.shortName || "" });
        });
        setKnownTeams(Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .finally(() => {
        if (!cancelled) setKnownLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitions.length]);

  const existingNamesLower = useMemo(() => new Set(existingTeamNames.map((n) => n.trim().toLowerCase())), [existingTeamNames]);
  const pickableTeams = knownTeams.filter((team) => !existingNamesLower.has(team.name.trim().toLowerCase()));

  async function handleAddExisting(team: KnownTeam) {
    setAddingExistingName(team.name);
    setError("");
    try {
      const created = await createTeam({ competitionId, name: team.name, shortName: team.shortName || undefined });
      onSaved(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ekipa nije dodata.");
    } finally {
      setAddingExistingName("");
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

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Dodaj ekipu</Text>

          <Text style={styles.label}>Postojece ekipe iz baze</Text>
          {knownLoading ? (
            <ActivityIndicator color={colors.purple} />
          ) : pickableTeams.length === 0 ? (
            <Text style={styles.hint}>
              {knownTeams.length === 0 ? "Baza jos nema nijednu ekipu." : "Sve poznate ekipe su vec u ovoj ligi."}
            </Text>
          ) : (
            <View style={styles.chipsRow}>
              {pickableTeams.map((team) => (
                <TouchableOpacity
                  key={team.name}
                  style={styles.chip}
                  onPress={() => handleAddExisting(team)}
                  disabled={!!addingExistingName}
                >
                  {addingExistingName === team.name ? (
                    <ActivityIndicator color={colors.purple} size="small" />
                  ) : (
                    <Text style={styles.chipText}>{team.name}</Text>
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
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 40,
    alignItems: "center"
  },
  chipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
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
