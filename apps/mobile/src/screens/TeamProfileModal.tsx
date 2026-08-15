import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { fetchTeamProfile, removePlayerFromTeam } from "../api/endpoints";
import type { MatchSummary, TeamProfile } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill } from "../components/ui";
import { colors, gradients } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { kitGradientForTeam } from "../components/PitchPlayerCard";
import { useAuth } from "../state/AuthContext";
import { PlayerProfileModal } from "./PlayerProfileModal";
import { PlayerEditorModal } from "./PlayerEditorModal";
import { TeamEditorModal } from "./TeamEditorModal";
import { MatchDetailModal } from "./MatchDetailModal";
import { SponsorStrip } from "../components/SponsorStrip";
import { SponsorSideRail } from "../components/SponsorSideRail";
import { TeamCrest } from "../components/TeamCrest";

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

function RosterAvatar({ avatarUrl, displayName }: { avatarUrl?: string; displayName: string }) {
  const [failed, setFailed] = useState(false);
  if (avatarUrl && !failed) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={styles.playerAvatar}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.playerAvatarFallback}>
      <Text style={styles.playerAvatarFallbackText}>{initialsOf(displayName)}</Text>
    </View>
  );
}

const POSITION_LABEL: Record<string, string> = { golman: "GK", odbrana: "ODB", napad: "NAP" };

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
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showEditTeam, setShowEditTeam] = useState(false);
  const [siblingTeamId, setSiblingTeamId] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("profil");
  const isWide = useIsWideScreen();

  function load() {
    setLoading(true);
    setError("");
    setPhotoFailed(false);
    setTab("profil");
    fetchTeamProfile(teamId)
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam ekipu."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [teamId]);

  function handleRemovePlayer(playerId: string) {
    removePlayerFromTeam(teamId, playerId)
      .then(setProfile)
      .catch(() => undefined);
  }

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
      <View style={[styles.screen, isWide ? styles.screenWide : null]}>
        {isWide ? <SponsorSideRail /> : null}
        <View style={styles.mainColumn}>
          {loading ? <LoadingState label="Ucitavanje ekipe..." /> : null}
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
                  <Text style={styles.heroBadgeText}>Profil ekipe</Text>
                  {isAdmin ? (
                    <TouchableOpacity style={styles.iconButton} onPress={() => setShowEditTeam(true)}>
                      <Ionicons name="pencil-outline" size={16} color="#fff" />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.iconButtonSpacer} />
                  )}
                </View>

                {profile.logoUrl && !photoFailed ? (
                  <Image
                    source={{ uri: profile.logoUrl }}
                    style={styles.crestPhoto}
                    resizeMode="cover"
                    onError={() => setPhotoFailed(true)}
                  />
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

                <View style={styles.pointsBadge}>
                  <Ionicons name="trophy" size={14} color={colors.ink} />
                  <Text style={styles.pointsBadgeText}>
                    {primaryStanding?.points ?? 0} bodova{primaryStanding?.position ? ` - #${primaryStanding.position}` : ""}
                  </Text>
                </View>
              </LinearGradient>

              <View style={styles.body}>
                <View style={styles.quickStatGrid}>
                  <QuickStat icon="calendar-outline" label="utakmica" value={String(primaryStanding?.played ?? 0)} />
                  <QuickStat icon="trending-up-outline" label="pobede" value={String(primaryStanding?.wins ?? 0)} />
                  <QuickStat icon="star-outline" label="bodova" value={String(primaryStanding?.points ?? 0)} />
                  <QuickStat
                    icon="podium-outline"
                    label="plasman"
                    value={primaryStanding?.position ? `#${primaryStanding.position}` : "-"}
                  />
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
                    {profile.teams.length > 1 ? (
                      <View>
                        <SectionHeader icon="layers-outline" label="Isti klub igra i u" />
                        <Card style={styles.teamsCard}>
                          {profile.teams
                            .filter((t) => t.teamId !== teamId)
                            .map((t, index) => (
                              <TouchableOpacity
                                key={t.teamId}
                                style={[styles.teamRow, index > 0 ? styles.teamRowDivider : null]}
                                onPress={() => setSiblingTeamId(t.teamId)}
                              >
                                <TeamCrest teamId={t.teamId} name={t.teamName} size={30} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.teamRowName}>{t.teamName}</Text>
                                  <Text style={styles.teamRowMeta}>{t.competitionName}{t.seasonName ? ` - ${t.seasonName}` : ""}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                              </TouchableOpacity>
                            ))}
                        </Card>
                      </View>
                    ) : null}

                    {profile.nextMatch ? (
                      <Card style={styles.nextMatchCard}>
                        <SectionHeader icon="calendar-outline" label="Naredna utakmica" />
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
                    ) : (
                      <EmptyState message="Nema zakazane naredne utakmice." />
                    )}

                    <View>
                      <View style={styles.rosterHead}>
                        <SectionHeader icon="people-outline" label="Roster - sortirano po fantasy poenima" />
                        {isAdmin ? (
                          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddPlayer(true)}>
                            <Ionicons name="add" size={14} color="#fff" />
                            <Text style={styles.addButtonText}>Igrac</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Card style={styles.rosterCard}>
                        {profile.players.length === 0 ? <EmptyState message="Nema igraca u bazi." /> : null}
                        {profile.players.map((player, index) => (
                          <TouchableOpacity
                            key={player.id}
                            style={[styles.playerRow, index > 0 ? styles.playerRowDivider : null]}
                            onPress={() => setActivePlayerId(player.id)}
                          >
                            <RosterAvatar avatarUrl={player.avatarUrl} displayName={player.displayName} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.playerName}>{player.displayName}</Text>
                            </View>
                            {player.position ? (
                              <View style={styles.positionPill}>
                                <Text style={styles.positionPillText}>{POSITION_LABEL[player.position] || player.position}</Text>
                              </View>
                            ) : null}
                            <Text style={styles.playerPoints}>{player.fantasyPoints}</Text>
                            {isAdmin ? (
                              <TouchableOpacity
                                style={styles.removePlayerButton}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  handleRemovePlayer(player.id);
                                }}
                              >
                                <Ionicons name="close" size={14} color={colors.textMuted} />
                              </TouchableOpacity>
                            ) : null}
                          </TouchableOpacity>
                        ))}
                      </Card>
                    </View>
                  </View>
                ) : null}

                {tab === "stats" ? (
                  <View style={styles.section}>
                    {form.length > 0 ? (
                      <View>
                        <SectionHeader icon="trending-up-outline" label={`Forma (poslednjih ${form.length})`} />
                        <Card style={styles.formTrack}>
                          {form.map(({ match, result }) => (
                            <View key={match.id} style={[styles.formChip, { backgroundColor: RESULT_TONE[result].bg }]}>
                              <Text style={[styles.formChipText, { color: RESULT_TONE[result].fg }]}>{RESULT_LABEL[result]}</Text>
                            </View>
                          ))}
                        </Card>
                      </View>
                    ) : null}

                    <View>
                      <SectionHeader icon="bar-chart-outline" label="Detaljna statistika" />
                      <Card style={styles.statGrid}>
                        <StatTile label="nereseno" value={primaryStanding?.draws ?? 0} />
                        <StatTile label="porazi" value={primaryStanding?.losses ?? 0} />
                        <StatTile
                          label="gol razlika"
                          value={primaryStanding?.goalDifference ?? 0}
                          display={primaryStanding && primaryStanding.goalDifference > 0 ? `+${primaryStanding.goalDifference}` : undefined}
                        />
                      </Card>
                    </View>

                    {otherStandings.length > 0 ? (
                      <View>
                        <SectionHeader icon="podium-outline" label="Ucinak po takmicenjima" />
                        <Card style={styles.standingsCard}>
                          {profile.standings.map((standing, index) => (
                            <View key={standing.id} style={[styles.standingRow, index > 0 ? styles.standingRowDivider : null]}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.standingRowName}>{standing.competitionName || standing.groupName || "Takmicenje"}</Text>
                                <Text style={styles.standingRowMeta}>
                                  {standing.played} mec.  {standing.wins}-{standing.draws}-{standing.losses}  {standing.goalsFor}:{standing.goalsAgainst}
                                </Text>
                              </View>
                              <Text style={styles.standingRowPoints}>{standing.position ? `#${standing.position}` : `${standing.points} b.`}</Text>
                            </View>
                          ))}
                        </Card>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {tab === "utakmice" ? (
                  <View style={styles.section}>
                    <SectionHeader icon="list-outline" label="Rezultati" />
                    <Card style={styles.matchesCard}>
                      {profile.matches.length === 0 ? <EmptyState message="Jos nema odigranih utakmica." /> : null}
                      {profile.matches.slice(0, 10).map((match, index) => {
                        const played = match.status === "finished" || match.homeScore || match.awayScore;
                        const result = played ? resultFor(match, profile.id) : null;
                        return (
                          <TouchableOpacity
                            key={match.id}
                            style={[styles.matchRow, index > 0 ? styles.matchRowDivider : null]}
                            onPress={() => setActiveMatchId(match.id)}
                          >
                            {result ? (
                              <View style={[styles.matchResultTag, { backgroundColor: RESULT_TONE[result].bg }]}>
                                <Text style={[styles.matchResultTagText, { color: RESULT_TONE[result].fg }]}>{RESULT_LABEL[result]}</Text>
                              </View>
                            ) : (
                              <View style={styles.matchResultTagEmpty} />
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={styles.matchTeams} numberOfLines={1}>
                                {match.homeTeamName} {match.homeScore} : {match.awayScore} {match.awayTeamName}
                              </Text>
                              <Text style={styles.matchMeta}>
                                {formatDateTime(match.scheduledAt)}{match.round ? ` - Kolo ${match.round}` : ""}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        );
                      })}
                    </Card>
                  </View>
                ) : null}

                <SponsorStrip />
              </View>
            </ScrollView>
          ) : null}
        </View>
        {isWide ? <SponsorSideRail /> : null}

        {activePlayerId ? <PlayerProfileModal playerId={activePlayerId} onClose={() => setActivePlayerId(null)} /> : null}
        {activeMatchId ? <MatchDetailModal matchId={activeMatchId} onClose={() => setActiveMatchId(null)} /> : null}
        {siblingTeamId ? <TeamProfileModal teamId={siblingTeamId} onClose={() => setSiblingTeamId(null)} /> : null}

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

        {showEditTeam && profile ? (
          <TeamEditorModal
            team={{ id: profile.id, name: profile.name, shortName: profile.shortName, logoUrl: profile.logoUrl }}
            onClose={() => setShowEditTeam(false)}
            onSaved={() => {
              setShowEditTeam(false);
              load();
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function QuickStat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.quickStatTile}>
      <Ionicons name={icon} size={18} color={colors.purple} />
      <Text style={styles.quickStatValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.quickStatLabel}>{label}</Text>
    </View>
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

function SectionHeader({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={15} color={colors.purple} />
      <Text style={styles.sectionLabel}>{label}</Text>
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
    borderBottomRightRadius: 32,
    gap: 4
  },
  // Matches SponsorSideRail's own paddingTop (24), same reasoning as PlayerProfileModal.
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
  // Much bigger than the old 84px badge - same treatment as the player profile's
  // portrait, so a team crest reads with the same weight a player's photo does.
  crestPhoto: {
    width: 168,
    height: 168,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.45)",
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.15)"
  },
  crestFallback: {
    width: 168,
    height: 168,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.45)",
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  crestInitials: { color: "#fff", fontSize: 46, fontWeight: "800" },
  name: { color: "#fff", fontSize: 30, fontWeight: "900", textAlign: "center" },
  metaLine: { color: "rgba(255,255,255,0.82)", fontWeight: "700", textAlign: "center", marginBottom: 4 },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginTop: 10
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
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  sectionLabel: { color: colors.ink, fontWeight: "900", fontSize: 15 },
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
  teamsCard: { gap: 0 },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  teamRowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  teamRowName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  teamRowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  standingsCard: { gap: 0 },
  standingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  standingRowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  standingRowName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  standingRowMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  standingRowPoints: { color: colors.purple, fontWeight: "900", fontSize: 16 },
  rosterHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rosterCard: { gap: 0 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 10
  },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14
  },
  playerRowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  playerAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceMuted },
  playerAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  playerAvatarFallbackText: { color: colors.purple, fontWeight: "800", fontSize: 18 },
  playerName: { color: colors.textPrimary, fontWeight: "700", fontSize: 17 },
  positionPill: { backgroundColor: colors.surfaceMuted, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 9 },
  positionPillText: { color: colors.textMuted, fontWeight: "800", fontSize: 11 },
  playerPoints: { color: colors.purple, fontWeight: "900", fontSize: 20, minWidth: 32, textAlign: "right" },
  removePlayerButton: { padding: 6, marginLeft: 2 },
  matchesCard: { gap: 0 },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10
  },
  matchRowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  matchResultTag: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  matchResultTagEmpty: { width: 22, height: 22 },
  matchResultTagText: { fontWeight: "900", fontSize: 11 },
  matchTeams: { color: colors.textPrimary, fontWeight: "600" },
  matchMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 }
});
