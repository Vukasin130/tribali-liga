import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { fetchTeamProfile } from "../api/endpoints";
import type { MatchSummary, TeamProfile } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill } from "../components/ui";
import { colors, gradients } from "../theme/colors";
import { kitGradientForTeam } from "../components/PitchPlayerCard";
import { useAuth } from "../state/AuthContext";
import { PlayerProfileModal } from "./PlayerProfileModal";
import { PlayerEditorModal } from "./PlayerEditorModal";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Result = "W" | "D" | "L";

function resultFor(match: MatchSummary, teamId: string): Result {
  const isHome = match.homeTeamId === teamId;
  const own = isHome ? match.homeScore : match.awayScore;
  const other = isHome ? match.awayScore : match.homeScore;
  if (own > other) return "W";
  if (own < other) return "L";
  return "D";
}

const RESULT_LABEL: Record<Result, string> = { W: "P", D: "N", L: "I" };
const RESULT_TONE: Record<Result, { bg: string; fg: string }> = {
  W: { bg: "rgba(8,122,74,0.14)", fg: colors.success },
  D: { bg: colors.surfaceMuted, fg: colors.textMuted },
  L: { bg: "rgba(160,24,61,0.12)", fg: colors.danger }
};

export function TeamProfileModal({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    fetchTeamProfile(teamId)
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam ekipu."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [teamId]);

  const primaryStanding = profile?.standings[0] ?? null;
  const otherStandings = profile?.standings.slice(1) ?? [];

  const form = useMemo(() => {
    if (!profile) return [];
    const played = profile.matches.filter((m) => m.status === "finished" || (m.homeScore || m.awayScore));
    return played.slice(0, 5).reverse().map((match) => ({ match, result: resultFor(match, profile.id) }));
  }, [profile]);

  const gradient = kitGradientForTeam(teamId);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {loading ? <LoadingState label="Ucitavanje ekipe..." /> : null}
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
                <Text style={styles.heroBadgeText}>Profil ekipe</Text>
                {isAdmin ? (
                  <TouchableOpacity style={styles.iconButton} onPress={() => setShowAddPlayer(true)}>
                    <Ionicons name="person-add-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.iconButton} />
                )}
              </View>

              {profile.logoUrl ? (
                <Image source={{ uri: profile.logoUrl }} style={styles.crestPhoto} resizeMode="cover" />
              ) : (
                <LinearGradient colors={gradient} style={styles.crestFallback}>
                  <Text style={styles.crestInitials}>{initialsOf(profile.name)}</Text>
                </LinearGradient>
              )}

              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.metaLine}>
                {[profile.city?.name, profile.competition?.name].filter(Boolean).join(" - ")}
              </Text>
              {profile.achievement ? <Pill label={profile.achievement} tone="warning" /> : null}
            </LinearGradient>

            <View style={styles.body}>
              <Card style={styles.scoreCard}>
                <View style={styles.scoreRow}>
                  <View style={styles.scoreMain}>
                    <Text style={styles.scoreValue}>{primaryStanding?.played ?? 0}</Text>
                    <Text style={styles.scoreLabel}>utakmica</Text>
                  </View>
                  <View style={styles.scoreDivider} />
                  <View style={styles.scoreMain}>
                    <Text style={styles.scoreValue}>{primaryStanding?.points ?? 0}</Text>
                    <Text style={styles.scoreLabel}>bodova</Text>
                  </View>
                  {primaryStanding?.position ? (
                    <>
                      <View style={styles.scoreDivider} />
                      <View style={styles.scoreMain}>
                        <Text style={styles.scoreValue}>#{primaryStanding.position}</Text>
                        <Text style={styles.scoreLabel}>plasman</Text>
                      </View>
                    </>
                  ) : null}
                </View>

                <View style={styles.statGrid}>
                  <StatTile label="pobede" value={primaryStanding?.wins ?? 0} />
                  <StatTile label="nereseno" value={primaryStanding?.draws ?? 0} />
                  <StatTile label="porazi" value={primaryStanding?.losses ?? 0} />
                  <StatTile
                    label="gol razlika"
                    value={primaryStanding?.goalDifference ?? 0}
                    display={primaryStanding && primaryStanding.goalDifference > 0 ? `+${primaryStanding.goalDifference}` : undefined}
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
                    {profile.nextMatch.round ? <Pill label={`K${profile.nextMatch.round}`} tone="neutral" /> : null}
                  </View>
                </Card>
              ) : null}

              {form.length > 0 ? (
                <View>
                  <Text style={styles.sectionLabel}>Forma (poslednjih {form.length})</Text>
                  <View style={styles.formTrack}>
                    {form.map(({ match, result }) => (
                      <View key={match.id} style={[styles.formChip, { backgroundColor: RESULT_TONE[result].bg }]}>
                        <Text style={[styles.formChipText, { color: RESULT_TONE[result].fg }]}>{RESULT_LABEL[result]}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {otherStandings.length > 0 ? (
                <View>
                  <Text style={styles.sectionLabel}>Ucinak po takmicenjima</Text>
                  {profile.standings.map((standing) => (
                    <Card key={standing.id} style={styles.standingRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.standingRowName}>{standing.competitionName || standing.groupName || "Takmicenje"}</Text>
                        <Text style={styles.standingRowMeta}>
                          {standing.played} mec.  {standing.wins}-{standing.draws}-{standing.losses}  {standing.goalsFor}:{standing.goalsAgainst}
                        </Text>
                      </View>
                      <Text style={styles.standingRowPoints}>{standing.position ? `#${standing.position}` : `${standing.points} b.`}</Text>
                    </Card>
                  ))}
                </View>
              ) : null}

              <View>
                <View style={styles.rosterHead}>
                  <Text style={styles.sectionLabel}>Roster - sortirano po fantasy poenima</Text>
                </View>
                {profile.players.length === 0 ? <EmptyState message="Nema igraca u bazi." /> : null}
                {profile.players.map((player, index) => (
                  <TouchableOpacity key={player.id} style={styles.playerRow} onPress={() => setActivePlayerId(player.id)}>
                    <Text style={styles.playerRank}>{index + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.playerName}>{player.displayName}</Text>
                      <Text style={styles.playerMeta}>
                        {player.position || "igrac"}
                        {player.shirtNumber ? ` - ${player.shirtNumber}` : ""} - {player.appearances} mec.  {player.goals} gol.  {player.assists} as.
                      </Text>
                    </View>
                    <Text style={styles.playerPoints}>{player.fantasyPoints}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View>
                <Text style={styles.sectionLabel}>Rezultati</Text>
                {profile.matches.length === 0 ? <EmptyState message="Jos nema odigranih utakmica." /> : null}
                {profile.matches.slice(0, 10).map((match) => {
                  const played = match.status === "finished" || match.homeScore || match.awayScore;
                  const result = played ? resultFor(match, profile.id) : null;
                  return (
                    <View key={match.id} style={styles.matchRow}>
                      {result ? (
                        <View style={[styles.matchResultTag, { backgroundColor: RESULT_TONE[result].bg }]}>
                          <Text style={[styles.matchResultTagText, { color: RESULT_TONE[result].fg }]}>{RESULT_LABEL[result]}</Text>
                        </View>
                      ) : (
                        <View style={styles.matchResultTagEmpty} />
                      )}
                      <Text style={styles.matchTeams} numberOfLines={1}>
                        {match.homeTeamName} {match.homeScore} : {match.awayScore} {match.awayTeamName}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        ) : null}

        {activePlayerId ? <PlayerProfileModal playerId={activePlayerId} onClose={() => setActivePlayerId(null)} /> : null}

        {showAddPlayer ? (
          <PlayerEditorModal
            teamId={teamId}
            onClose={() => setShowAddPlayer(false)}
            onSaved={() => {
              setShowAddPlayer(false);
              load();
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function StatTile({ label, value, display }: { label: string; value: number; display?: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statTileValue}>{display ?? value}</Text>
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
    borderBottomRightRadius: 32,
    gap: 4
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
  crestPhoto: {
    width: 84,
    height: 84,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.15)"
  },
  crestFallback: {
    width: 84,
    height: 84,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  crestInitials: { color: "#fff", fontSize: 26, fontWeight: "800" },
  name: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center" },
  metaLine: { color: "rgba(255,255,255,0.82)", fontWeight: "700", textAlign: "center", marginBottom: 4 },
  body: { padding: 20, paddingTop: 16, gap: 18 },
  scoreCard: { gap: 14 },
  scoreRow: { flexDirection: "row", alignItems: "center" },
  scoreMain: { flex: 1, alignItems: "center" },
  scoreDivider: { width: 1, height: 40, backgroundColor: colors.line },
  scoreValue: { color: colors.ink, fontSize: 26, fontWeight: "900" },
  scoreLabel: { color: colors.textMuted, fontWeight: "700", fontSize: 12, marginTop: 2 },
  statGrid: { flexDirection: "row", gap: 8 },
  statTile: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingVertical: 10
  },
  statTileValue: { color: colors.purple, fontSize: 17, fontWeight: "900" },
  statTileLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 2, textAlign: "center" },
  sectionLabel: { color: colors.ink, fontWeight: "900", fontSize: 15, marginBottom: 10 },
  nextMatchCard: { gap: 8 },
  nextMatchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nextMatchTeams: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  nextMatchMeta: { color: colors.textMuted, fontWeight: "600", fontSize: 12, marginTop: 2 },
  formTrack: { flexDirection: "row", gap: 8 },
  formChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 10
  },
  formChipText: { fontWeight: "900", fontSize: 14 },
  standingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  standingRowName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  standingRowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  standingRowPoints: { color: colors.purple, fontWeight: "900", fontSize: 16 },
  rosterHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 10
  },
  playerRank: { color: colors.textMuted, fontWeight: "800", fontSize: 12, width: 18, textAlign: "center" },
  playerName: { color: colors.textPrimary, fontWeight: "700" },
  playerMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  playerPoints: { color: colors.purple, fontWeight: "900", fontSize: 16 },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 9
  },
  matchResultTag: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  matchResultTagEmpty: { width: 22, height: 22 },
  matchResultTagText: { fontWeight: "900", fontSize: 11 },
  matchTeams: { color: colors.textPrimary, fontWeight: "600", flex: 1 }
});
