import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { fetchPlayerProfile } from "../api/endpoints";
import type { PlayerMatchStat, PlayerProfile } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill } from "../components/ui";
import { colors, gradients } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { kitGradientForTeam } from "../components/PitchPlayerCard";
import { useAuth } from "../state/AuthContext";
import { PlayerEditorModal } from "./PlayerEditorModal";
import { TeamProfileModal } from "./TeamProfileModal";
import { positionGroupOf } from "../fantasyConstants";
import { SponsorStrip } from "../components/SponsorStrip";
import { SponsorSideRail } from "../components/SponsorSideRail";
import { TeamCrest } from "../components/TeamCrest";

const POSITION_LABELS: Record<string, string> = { golman: "Golman", odbrana: "Odbrana", napad: "Napad" };

type Tab = "profil" | "stats" | "utakmice";
const TABS: { key: Tab; label: string }[] = [
  { key: "profil", label: "Profil" },
  { key: "stats", label: "Stats" },
  { key: "utakmice", label: "Utakmice" }
];

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
  const [tab, setTab] = useState<Tab>("profil");
  const isWide = useIsWideScreen();

  function load() {
    setLoading(true);
    setError("");
    setPhotoFailed(false);
    setTab("profil");
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
  const topSeason = profile?.seasonStats[0];

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
      <View style={[styles.screen, isWide ? styles.screenWide : null]}>
        {isWide ? <SponsorSideRail /> : null}
        <View style={styles.mainColumn}>
          {loading ? <LoadingState label="Ucitavanje igraca..." /> : null}
          {error ? (
            <View style={styles.errorWrap}>
              <ErrorState message={error} onRetry={load} />
            </View>
          ) : null}

          {profile ? (
            <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]} showsVerticalScrollIndicator={false}>
              <LinearGradient colors={gradients.hero} style={[styles.hero, isWide ? styles.heroWide : null]}>
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
                    <View style={styles.iconButtonSpacer} />
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

                <View style={styles.pointsBadge}>
                  <Ionicons name="star" size={14} color={colors.ink} />
                  <Text style={styles.pointsBadgeText}>{topSeason?.fantasyPoints ?? 0} fantasy poena</Text>
                </View>
              </LinearGradient>

              <View style={styles.body}>
                <View style={styles.quickStatGrid}>
                  <QuickStat icon="calendar-outline" label="utakmica" value={topSeason?.appearances ?? 0} />
                  <QuickStat icon="football" label="golovi" value={topSeason?.goals ?? 0} />
                  <QuickStat icon="hand-right-outline" label="asistencije" value={topSeason?.assists ?? 0} />
                  {isGoalkeeper ? (
                    <QuickStat icon="shield-checkmark-outline" label="odbrane" value={topSeason?.saves ?? 0} />
                  ) : (
                    <QuickStat icon="star-outline" label="najbolja utak." value={bestGame} />
                  )}
                </View>

                <View style={styles.tabBar}>
                  {TABS.map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.tabButton, tab === t.key ? styles.tabButtonActive : null]}
                      onPress={() => setTab(t.key)}
                    >
                      <Text style={[styles.tabButtonText, tab === t.key ? styles.tabButtonTextActive : null]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tab === "profil" ? (
                  <View style={styles.section}>
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
                    ) : (
                      <EmptyState message="Nema zakazane naredne utakmice." />
                    )}

                    {profile.teams.length > 0 ? (
                      <View>
                        <Text style={styles.sectionLabel}>{profile.teams.length > 1 ? "Timovi" : "Tim"}</Text>
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
                  </View>
                ) : null}

                {tab === "stats" ? (
                  <View style={styles.section}>
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
                  </View>
                ) : null}

                {tab === "utakmice" ? (
                  <View style={styles.section}>
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
                ) : null}

                <SponsorStrip />
              </View>
            </ScrollView>
          ) : null}
        </View>
        {isWide ? <SponsorSideRail /> : null}

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

function QuickStat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.quickStatTile}>
      <Ionicons name={icon} size={18} color={colors.purple} />
      <Text style={styles.quickStatValue}>{value}</Text>
      <Text style={styles.quickStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenWide: { flexDirection: "row", justifyContent: "center" },
  mainColumn: { flex: 1 },
  errorWrap: { padding: 20, paddingTop: 60 },
  content: { paddingBottom: 60 },
  hero: {
    paddingTop: 54,
    paddingBottom: 26,
    paddingHorizontal: 20,
    alignItems: "center",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32
  },
  // Matches SponsorSideRail's own paddingTop (24) so the "Profil igraca" label lines
  // up horizontally with the "Sponzori" label on the rails beside it, instead of
  // sitting lower under the phone-sized top padding meant for a status bar clearance
  // that a desktop browser window doesn't have.
  heroWide: { paddingTop: 24 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 18 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center"
  },
  iconButtonSpacer: { width: 36, height: 36 },
  heroBadgeText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  // Much bigger than a small avatar badge - a rounded square (not a tight circle) so
  // a real headshot crops safely via resizeMode="cover" without losing the face.
  portraitPhoto: {
    width: 168,
    height: 168,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.45)",
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.15)"
  },
  portraitFallback: {
    width: 168,
    height: 168,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.45)",
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  portraitInitials: { color: "#fff", fontSize: 46, fontWeight: "800" },
  name: { color: "#fff", fontSize: 30, fontWeight: "900", textAlign: "center" },
  teamLine: { color: "rgba(255,255,255,0.82)", fontWeight: "700", marginTop: 4, textAlign: "center" },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginTop: 14
  },
  pointsBadgeText: { color: colors.ink, fontWeight: "800", fontSize: 12 },
  body: { padding: 20, paddingTop: 18, gap: 18 },
  quickStatGrid: { flexDirection: "row", gap: 10 },
  quickStatTile: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 16,
    paddingVertical: 14
  },
  quickStatValue: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  quickStatLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "center" },
  tabBar: { flexDirection: "row", gap: 8 },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  },
  tabButtonActive: { backgroundColor: colors.ink },
  tabButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  tabButtonTextActive: { color: "#fff" },
  section: { gap: 18 },
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
