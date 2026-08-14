import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { addClubToCompetition, createTeam, fetchClubs } from "../api/endpoints";
import type { Club, Team } from "../api/types";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { PrimaryButton } from "../components/ui";

export function TeamComposerModal({
  competitionId,
  existingTeamNames,
  onClose,
  onSaved
}: {
  // Absent when opened from Explore's standalone "Nova ekipa" entry point, instead of
  // from within a league's own team list - in that mode this is purely a club/roster
  // registration (no competition to add it to yet), so the "pick an existing club to
  // add here" half of this screen doesn't apply and is skipped entirely.
  competitionId?: string;
  existingTeamNames?: string[];
  onClose: () => void;
  onSaved: (team: Team) => void;
}) {
  const standalone = !competitionId;
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(!standalone);
  const [addingClubId, setAddingClubId] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isWide = useIsWideScreen();

  useEffect(() => {
    if (standalone) return;
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
  }, [standalone]);

  const existingNamesLower = useMemo(() => new Set((existingTeamNames ?? []).map((n) => n.trim().toLowerCase())), [existingTeamNames]);
  const pickableClubs = clubs.filter((club) => !existingNamesLower.has(club.name.trim().toLowerCase()));

  async function handleAddClub(club: Club) {
    if (!competitionId) return;
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
        name: name.trim(),
        shortName: shortName.trim() || undefined
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
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.title}>{standalone ? "Nova ekipa" : "Dodaj ekipu"}</Text>
          {standalone ? (
            <Text style={styles.hint}>
              Ekipa se cuva u bazi kao klub - kasnije je dodajes u ligu iz uredjivanja te lige, sa svim igracima.
            </Text>
          ) : null}

          {!standalone ? (
            <>
              <Text style={styles.label}>Postojeci klubovi iz baze</Text>
              {clubsLoading ? (
                <ActivityIndicator color={colors.purple} />
              ) : pickableClubs.length === 0 ? (
                <Text style={styles.hint}>
                  {clubs.length === 0
                    ? "Baza jos nema nijedan klub - napravi ga iz Explore > Ekipe > Nova ekipa, pa se vrati ovde."
                    : "Svi poznati klubovi su vec u ovoj ligi."}
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

              <Text style={styles.footerHint}>
                Ne vidis klub koji trazis? Napravi ga iz Explore {"›"} Ekipe {"›"} Nova ekipa, pa se vrati ovde.
              </Text>
            </>
          ) : (
            <View style={styles.newForm}>
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
              {error ? <Text style={styles.error}>{error}</Text> : null}
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
  footerHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
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
