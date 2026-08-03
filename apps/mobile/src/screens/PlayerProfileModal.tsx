import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { fetchPlayerProfile } from "../api/endpoints";
import type { PlayerMatchStat, PlayerProfile } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill } from "../components/ui";
import { colors, gradients } from "../theme/colors";
import { kitGradientForTeam } from "../components/PitchPlayerCard";
import { useAuth } from "../state/AuthContext";
import { PlayerEditorModal } from "./PlayerEditorModal";
import { TeamProfileModal } from "./TeamProfileModal";
import { positionGroupOf } from "../fantasyConstants";
import { SponsorStrip } from "../components/SponsorStrip";
import { TeamCrest } from "../components/TeamCrest";

const POSITION_LABELS: Record<string, string> = { golman: "Golman", odbrana: "Odbrana", napad: "Napad" };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PlayerProfileModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    setPhotoFailed(false);
    fetchPlayerProfile(playerId)
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam igraca."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [playerId]);

  const primaryTeam = profile?.teams[0] ?? null;
  const positionGroup = positionGroupOf(profile?.position || "");
  const isGoalkeeper = positionGroup === "golman";
  const gradient = isGoalkeeper ? (["#4a3a14", "#141414"] as const) : kitGradientForTeam(primaryTeam?.teamId || "");

  const bestGame = useMemo(() => {
    if (!profile || profile.matchStats.length === 0) return 0;
    return Math.max(...profile.matchStats.map((m) => m.fantasyPoints));
  }, [profile]);

  const form = useMemo(() => {
    if (!profile) return [];
    return [...profile.matchStats].slice(0, 5).reverse();
  }, [profile]);

  const activeCompetitionIds = useMemo(
    () => new Set((profile?.teams ?? []).map((t) => t.competitionId)),
    [profile]
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {loading ? <LoadingState label="Ucitavanje igraca..." /> : null}
        {error ? (
          <View style={styles.errorWrap}>
            <ErrorState message={error} onRetry={load} />
          </View>
        ) : null}

        {profile ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={gradients.hero} style={styles.hero}>
              <View style={styles.heroTopRow}>
                <TouchableOpacity style={styles.iconButton} onPress={onClose}>
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.heroBadgeText}>Profil igraca</Text>
                {isAdmin ? (
                  <TouchableOpacity style={styles.iconButton} onPress={() => setShowEditor(true)}>
                    <Ionicons name="create-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.iconButton} />
                )}
              </View>

              {profile.avatarUrl && !photoFailed ? (
                <Image
                  source={{ uri: profile.avatarUrl }}
                  style={styles.portraitPhoto}
                  resizeMode="cover"
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                <LinearGradient colors={gradient} style={styles.portraitFallback}>
                  <Text style={styles.portraitInitials}>{initialsOf(profile.displayName)}</Text>
                </LinearGradient>
              )}

              <Text style={styles.name}>{profile.displayName}</Text>
              <Text style={styles.teamLine}>
                {primaryTeam?.teamName || "Bez ekipe"}
                {profile.position ? ` - ${POSITION_LABELS[positionGroup] || profile.position}` : ""}
                {profile.shirtNumber ? ` - broj ${profile.shirtNumber}` : ""}
              </Text>
            </LinearGradient>

            <View style={styles.body}>
              <Card style={styles.scoreCard}>
                <View style={styles.scoreRow}>
                  <View style={styles.scoreMain}>
                    <Text style={styles.scoreValue}>{profile.seasonStats[0]?.fantasyPoints ?? 0}</Text>
                    <Text style={styles.scoreLabel}>fantasy poena</Text>
                  </View>
                  <View style={styles.scoreDivider} />
                  <View style={styles.scoreMain}>
                    <Text style={styles.scoreValue}>{profile.seasonStats[0]?.appearances ?? 0}</Text>
                    <Text style={styles.scoreLabel}>utakmica</Text>
                  </View>
                </View>

                <View style={styles.statGrid}>
                  <StatTile label="golovi" value={profile.seasonStats[0]?.goals ?? 0} />
                  <StatTile label="asistencije" value={profile.seasonStats[0]?.assists ?? 0} />
                  <StatTile
                    label={isGoalkeeper ? "odbrane" : "najbolja utakmica"}
                    value={isGoalkeeper ? profile.seasonStats[0]?.saves ?? 0 : bestGame}
                  />
                </View>
              </Card>

              {profile.nextMatch ? (
                <Card style={styles.nextMatchCard}>
                  <Text style={styles.sectionLabel}>Naredna utakmica</Text>
                  <View style={styles.nextMatchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nextMatchTeams}>
                        {profile.nextMatch.homeTeamName} vs {profile.nextMatch.awayTeamName}
                      </Text>
                      <Text style={styles.nextMatchMeta}>
                        {formatDateTime(profile.nextMatch.scheduledAt)}
                        {profile.nextMatch.venue ? ` - ${profile.nextMatch.venue}` : ""}
                      </Text>
                    </View>
                    <Pill label="?" tone="neutral" />
                  </View>
                </Card>
              ) : null}

              {form.length > 0 ? (
                <View>
                  <Text style={styles.sectionLabel}>Forma (poslednjih 5)</Text>
                  <View style={styles.formTrack}>
                    {form.map((match, index) => (
                      <View key={match.matchId} style={styles.formRound}>
                        <Text style={styles.formRoundValue}>{match.fantasyPoints}</Text>
                        <Text style={styles.formRoundLabel}>K{index + 1}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {profile.teams.length > 1 ? (
                <View>
                  <Text style={styles.sectionLabel}>Timovi</Text>
                  <Card style={styles.teamsCard}>
                    {profile.teams.map((team, index) => (
                      <TouchableOpacity
                        key={team.teamId}
                        style={[styles.teamRow, index > 0 ? styles.teamRowDivider : null]}
                        onPress={() => setActiveTeamId(team.teamId)}
                      >
                        <TeamCrest teamId={team.teamId} name={team.teamName} size={30} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.teamRowName}>{team.teamName}</Text>
                          <Text style={styles.teamRowMeta}>{team.competitionName}{team.seasonName ? ` - ${team.seasonName}` : ""}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </Card>
                </View>
              ) : null}

              <View>
                <Text style={styles.sectionLabel}>Takmicenja</Text>
                {profile.seasonStats.length === 0 ? <EmptyState message="Jos nema statistike." /> : null}
                {profile.seasonStats.map((stat) => (
                  <Card key={`${stat.competitionId}-${stat.teamId}`} style={styles.seasonRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.seasonRowTitle}>
                        <Text style={styles.seasonRowName}>{stat.competitionName}</Text>
                        {activeCompetitionIds.has(stat.competitionId) ? <Pill label="Aktivna" tone="success" /> : null}
                      </View>
                      <Text style={styles.seasonRowMeta}>
                        {stat.teamName} - {stat.appearances} mec.  {stat.goals} gol.  {stat.assists} as.
                      </Text>
                    </View>
                    <Text style={styles.seasonRowPoints}>{stat.fantasyPoints}</Text>
                  </Card>
                ))}
              </View>

              <View>
                <Text style={styles.sectionLabel}>Poslednji mecevi</Text>
                {profile.matchStats.length === 0 ? <EmptyState message="Jos nema odigranih meceva." /> : null}
                {profile.matchStats.slice(0, 8).map((match: PlayerMatchStat) => (
                  <View key={match.matchId} style={styles.matchRow}>
                    <Text style={styles.matchTeams} numberOfLines={1}>
                      {match.homeTeamName} {match.score} {match.awayTeamName}
                    </Text>
                    <Text style={styles.matchPoints}>{match.fantasyPoints} pts</Text>
                  </View>
                ))}
              </View>

              <SponsorStrip />
            </View>
          </ScrollView>
        ) : null}

        {showEditor && profile ? (
          <PlayerEditorModal
            player={{
              id: profile.id,
              displayName: profile.displayName,
              position: profile.position,
              shirtNumber: profile.shirtNumber,
              avatarUrl: profile.avatarUrl
            }}
            onClose={() => setShowEditor(false)}
            onSaved={() => {
              setShowEditor(false);
              load();
            }}
          />
        ) : null}

        {activeTeamId ? <TeamProfileModal teamId={activeTeamId} onClose={() => setActiveTeamId(null)} /> : null}
      </View>
    </Modal>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  errorWrap: { padding: 20, paddingTop: 60 },
  content: { paddingBottom: 60 },
  hero: {
    paddingTop: 54,
    paddingBottom: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 14 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center"
  },
  heroBadgeText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  portraitPhoto: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.15)"
  },
  portraitFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  portraitInitials: { color: "#fff", fontSize: 28, fontWeight: "800" },
  name: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center" },
  teamLine: { color: "rgba(255,255,255,0.82)", fontWeight: "700", marginTop: 4, textAlign: "center" },
  body: { padding: 20, paddingTop: 16, gap: 18 },
  scoreCard: { gap: 14 },
  scoreRow: { flexDirection: "row", alignItems: "center" },
  scoreMain: { flex: 1, alignItems: "center" },
  scoreDivider: { width: 1, height: 40, backgroundColor: colors.line },
  scoreValue: { color: colors.ink, fontSize: 30, fontWeight: "900" },
  scoreLabel: { color: colors.textMuted, fontWeight: "700", fontSize: 12, marginTop: 2 },
  statGrid: { flexDirection: "row", gap: 10 },
  statTile: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingVertical: 10
  },
  statTileValue: { color: colors.purple, fontSize: 18, fontWeight: "900" },
  statTileLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2, textAlign: "center" },
  sectionLabel: { color: colors.ink, fontWeight: "900", fontSize: 15, marginBottom: 10 },
  nextMatchCard: { gap: 8 },
  nextMatchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nextMatchTeams: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  nextMatchMeta: { color: colors.textMuted, fontWeight: "600", fontSize: 12, marginTop: 2 },
  formTrack: { flexDirection: "row", gap: 8 },
  formRound: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingVertical: 10
  },
  formRoundValue: { color: colors.ink, fontWeight: "900", fontSize: 15 },
  formRoundLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  teamsCard: { gap: 0 },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  teamRowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  teamRowName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  teamRowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  seasonRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  seasonRowTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  seasonRowName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  seasonRowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  seasonRowPoints: { color: colors.purple, fontWeight: "900", fontSize: 18 },
  matchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 9
  },
  matchTeams: { color: colors.textPrimary, fontWeight: "600", flex: 1 },
  matchPoints: { color: colors.purple, fontWeight: "800" }
});
