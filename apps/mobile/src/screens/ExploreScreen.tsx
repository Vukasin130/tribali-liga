import React, { useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { fetchClubs, fetchCompetitionStandings, fetchLeaders, fetchPlayers } from "../api/endpoints";
import type { Club, LeaderEntry, Player, StandingGroup } from "../api/types";
import { EmptyState, ErrorState, LoadingState, Pill } from "../components/ui";
import { StandingsTable } from "../components/StandingsTable";
import { colors } from "../theme/colors";
import { useCompetition } from "../state/CompetitionContext";
import { TeamProfileModal } from "./TeamProfileModal";
import { PlayerProfileModal } from "./PlayerProfileModal";
import { TeamComposerModal } from "./TeamComposerModal";
import { SponsorStrip } from "../components/SponsorStrip";
import { TeamCrest } from "../components/TeamCrest";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { useAuth } from "../state/AuthContext";

type Section = "home" | "players" | "teams" | "stats";
type StatCategory = "table" | "goals" | "assists" | "saves" | "mvp";

const STAT_TABS: { key: StatCategory; label: string }[] = [
  { key: "table", label: "Tabela" },
  { key: "goals", label: "Golovi" },
  { key: "assists", label: "Asist." },
  { key: "saves", label: "Odbrane" },
  { key: "mvp", label: "MVP" }
];

export function ExploreScreen() {
  // Only the list of leagues comes from the shared app-wide context - the actual selected
  // league for stats is kept local to this screen so picking one here doesn't change what
  // Seasons/Profile/etc. show elsewhere in the app.
  const { competitions } = useCompetition();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isWide = useIsWideScreen();
  const [section, setSection] = useState<Section>("home");
  const [search, setSearch] = useState("");
  const [statCategory, setStatCategory] = useState<StatCategory>("table");
  const [statsCompetitionId, setStatsCompetitionId] = useState("");
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [showTeamComposer, setShowTeamComposer] = useState(false);

  useEffect(() => {
    if (statsCompetitionId || competitions.length === 0) return;
    const richest = [...competitions].sort((a, b) => (b.teamsCount || 0) - (a.teamsCount || 0))[0];
    setStatsCompetitionId(richest?.id || competitions[0].id);
  }, [competitions, statsCompetitionId]);

  // Igraci/Ekipe show the complete historical database - no league/season selection needed.
  const playersQuery = useQuery({
    queryKey: ["players"],
    queryFn: () => fetchPlayers(),
    enabled: section === "players"
  });
  const clubsQuery = useQuery({
    queryKey: ["clubs"],
    queryFn: () => fetchClubs(),
    enabled: section === "teams"
  });
  const leadersQuery = useQuery({
    queryKey: ["leaders", statsCompetitionId, statCategory],
    queryFn: () => fetchLeaders(statsCompetitionId, statCategory as "goals" | "assists" | "saves" | "mvp"),
    enabled: section === "stats" && statCategory !== "table" && Boolean(statsCompetitionId)
  });
  const standingsQuery = useQuery({
    queryKey: ["standings", statsCompetitionId],
    queryFn: () => fetchCompetitionStandings(statsCompetitionId),
    enabled: section === "stats" && statCategory === "table" && Boolean(statsCompetitionId)
  });

  const players: Player[] = playersQuery.data ?? [];
  const clubs: Club[] = clubsQuery.data ?? [];
  const leaders: LeaderEntry[] = leadersQuery.data?.leaders ?? [];
  const standings: StandingGroup[] = standingsQuery.data ?? [];

  const loading =
    (section === "players" && playersQuery.isLoading) ||
    (section === "teams" && clubsQuery.isLoading) ||
    (section === "stats" && statCategory === "table" && standingsQuery.isLoading) ||
    (section === "stats" && statCategory !== "table" && leadersQuery.isLoading);

  const activeError =
    section === "players"
      ? playersQuery.error
      : section === "teams"
        ? clubsQuery.error
        : section === "stats"
          ? (statCategory === "table" ? standingsQuery.error : leadersQuery.error)
          : null;
  const fallbackErrorMessage =
    section === "players" ? "Ne mogu da ucitam igrace." : section === "teams" ? "Ne mogu da ucitam ekipe." : "Ne mogu da ucitam statistiku.";
  const error = activeError ? (activeError instanceof Error ? activeError.message : fallbackErrorMessage) : "";

  const filteredPlayers = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.trim().toLowerCase();
    return players.filter(
      (p) => p.displayName.toLowerCase().includes(q) || p.teams.some((t) => t.teamName.toLowerCase().includes(q))
    );
  }, [players, search]);

  const filteredClubs = useMemo(() => {
    if (!search.trim()) return clubs;
    const q = search.trim().toLowerCase();
    return clubs.filter((c) => c.name.toLowerCase().includes(q));
  }, [clubs, search]);

  if (section === "home") {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.homeContent, isWide ? styles.homeContentWide : null]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Explore</Text>
          <Text style={styles.headerSubtitle}>Izaberi sta trazis, pa otvori detaljnu pretragu.</Text>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionCardWrap} onPress={() => { setSection("players"); setSearch(""); }}>
            <LinearGradient colors={["#141414", "#C9A227"]} style={styles.actionCard}>
              <Ionicons name="people" size={26} color="#fff" />
              <Text style={styles.actionCardTitle}>Igraci</Text>
              <Text style={styles.actionCardText}>Pretraga profila, cena i statistika.</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCardWrap} onPress={() => { setSection("teams"); setSearch(""); }}>
            <LinearGradient colors={["#D9B24C", "#0b6b49"]} style={styles.actionCard}>
              <Ionicons name="shield" size={26} color="#fff" />
              <Text style={styles.actionCardTitle}>Ekipe</Text>
              <Text style={styles.actionCardText}>Timovi, rosteri i osnovni podaci.</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => setSection("stats")}>
          <LinearGradient colors={["#141414", "#8A6D1F"]} style={styles.statsPanel}>
            <Text style={styles.actionCardTitle}>Statistika</Text>
            <Text style={styles.actionCardText}>Najbolji strelci, asistenti, golmani i MVP igraci lige.</Text>
          </LinearGradient>
        </TouchableOpacity>

        <SponsorStrip />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.searchHeader}>
        <TouchableOpacity onPress={() => setSection("home")} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.searchTitle}>
          {section === "players" ? "Igraci" : section === "teams" ? "Ekipe" : "Statistika"}
        </Text>
      </View>

      {section !== "stats" ? (
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={section === "players" ? "Pretrazi igraca..." : "Pretrazi ekipu..."}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      ) : (
        <>
          {competitions.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leagueScroll} contentContainerStyle={styles.leagueRow}>
              {competitions.map((competition) => (
                <TouchableOpacity
                  key={competition.id}
                  style={[styles.leagueChip, statsCompetitionId === competition.id ? styles.leagueChipActive : null]}
                  onPress={() => setStatsCompetitionId(competition.id)}
                >
                  <Text
                    style={[styles.leagueChipText, statsCompetitionId === competition.id ? styles.leagueChipTextActive : null]}
                    numberOfLines={1}
                  >
                    {competition.cityName ? `${competition.cityName} - ` : ""}{competition.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.statTabs}>
            {STAT_TABS.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.statTab, statCategory === item.key ? styles.statTabActive : null]}
                onPress={() => setStatCategory(item.key)}
              >
                <Text style={[styles.statTabText, statCategory === item.key ? styles.statTabTextActive : null]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {loading ? <LoadingState label="Ucitavanje..." /> : null}
      {error ? <ErrorState message={error} /> : null}

      {!loading && section === "players" ? (
        <ScrollView contentContainerStyle={[styles.listContent, isWide ? styles.listContentWide : null]}>
          {filteredPlayers.length === 0 ? <EmptyState message="Nema rezultata." /> : null}
          <View style={isWide ? styles.searchGrid : undefined}>
            {filteredPlayers.map((player, index) => (
              <TouchableOpacity
                key={player.id}
                style={[styles.searchRow, isWide ? styles.searchRowWide : null]}
                onPress={() => setActivePlayerId(player.id)}
              >
                <Text style={styles.searchRank}>{index + 1}</Text>
                <PlayerAvatar photoUrl={player.avatarUrl} name={player.displayName} />
                <View style={styles.searchInfo}>
                  <Text style={styles.searchName}>{player.displayName}</Text>
                  <Text style={styles.searchMeta}>
                    {player.teams[0]?.teamName || "bez ekipe"} - {player.position || "igrac"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {!loading && section === "teams" ? (
        <ScrollView contentContainerStyle={[styles.listContent, isWide ? styles.listContentWide : null]}>
          {filteredClubs.length === 0 ? <EmptyState message="Nema rezultata." /> : null}
          <View style={isWide ? styles.searchGrid : undefined}>
            {filteredClubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                style={[styles.searchRow, isWide ? styles.searchRowWide : null]}
                onPress={() => setActiveTeamId(club.teams[0]?.teamId ?? null)}
                disabled={club.teams.length === 0}
              >
                <TeamCrest teamId={club.id} name={club.name} logoUrl={club.logoUrl} size={46} />
                <View style={styles.searchInfo}>
                  <Text style={styles.searchName}>{club.name}</Text>
                  <Text style={styles.searchMeta}>
                    {club.activePlayersCount} {club.activePlayersCount === 1 ? "igrac" : "igraca"}
                    {club.competitionsCount > 1 ? ` - ${club.competitionsCount} liga` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {isAdmin ? (
            <TouchableOpacity style={styles.addTeamButton} onPress={() => setShowTeamComposer(true)}>
              <Ionicons name="add-circle-outline" size={18} color={colors.purple} />
              <Text style={styles.addTeamButtonText}>Nova ekipa</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : null}

      {!loading && section === "stats" && statCategory === "table" ? (
        <ScrollView contentContainerStyle={[styles.listContent, isWide ? styles.listContentWide : null]}>
          {standings.length === 0 ? <EmptyState message="Tabela jos nije dostupna." /> : null}
          <View style={isWide ? styles.standingsGridWide : undefined}>
            {standings.map((group) => (
              <View key={group.name} style={isWide ? styles.standingsGridItem : undefined}>
                <StandingsTable groupName={group.name} rows={group.rows} onTeamPress={setActiveTeamId} />
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {!loading && section === "stats" && statCategory !== "table" ? (
        <ScrollView contentContainerStyle={[styles.listContent, isWide ? styles.listContentWide : null]}>
          {leaders.length === 0 ? <EmptyState message="Nema podataka za ovu kategoriju." /> : null}
          <View style={isWide ? styles.searchGrid : undefined}>
            {leaders.map((leader) => (
              <TouchableOpacity
                key={leader.playerId}
                style={[styles.leaderRow, isWide ? styles.searchRowWide : null]}
                onPress={() => setActivePlayerId(leader.playerId)}
              >
                <View style={styles.leaderAvatarWrap}>
                  <PlayerAvatar photoUrl={leader.avatarUrl} name={leader.playerName} />
                  <View style={styles.leaderMedal}>
                    <Text style={styles.leaderMedalText}>{leader.rank}</Text>
                  </View>
                </View>
                <View style={styles.searchInfo}>
                  <Text style={styles.searchName}>{leader.playerName}</Text>
                  <Text style={styles.searchMeta}>{leader.teamName}</Text>
                </View>
                <Pill label={String(leader.value)} tone="success" />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {activeTeamId ? <TeamProfileModal teamId={activeTeamId} onClose={() => setActiveTeamId(null)} /> : null}
      {activePlayerId ? <PlayerProfileModal playerId={activePlayerId} onClose={() => setActivePlayerId(null)} /> : null}
      {showTeamComposer ? (
        <TeamComposerModal
          onClose={() => setShowTeamComposer(false)}
          onSaved={() => {
            setShowTeamComposer(false);
            clubsQuery.refetch();
          }}
        />
      ) : null}
    </View>
  );
}

function PlayerAvatar({ photoUrl, name, size = 56 }: { photoUrl?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (photoUrl && !failed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.searchAvatarPhoto, shape]}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[styles.searchAvatar, shape]}>
      <Text style={styles.searchAvatarText}>{initials(name)}</Text>
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  homeContent: { padding: 18, paddingTop: 60, gap: 16, paddingBottom: 40 },
  homeContentWide: { paddingHorizontal: 32, gap: 24 },
  header: { gap: 4 },
  headerTitle: { color: colors.ink, fontSize: 32, fontWeight: "700" },
  headerSubtitle: { color: colors.textMuted, fontSize: 14 },
  leagueScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 48, marginTop: 14 },
  leagueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingRight: 8,
    marginHorizontal: 18
  },
  leagueChip: {
    flexShrink: 0,
    flexGrow: 0,
    alignSelf: "flex-start",
    maxWidth: 220,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  leagueChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  leagueChipText: { flexShrink: 1, color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  leagueChipTextActive: { color: "#fff" },
  actionGrid: { flexDirection: "row", gap: 12 },
  actionCardWrap: { flex: 1 },
  actionCard: { borderRadius: 22, padding: 18, gap: 8, minHeight: 140, justifyContent: "flex-end" },
  actionCardTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  actionCardText: { color: "rgba(255,255,255,0.82)", fontSize: 12, lineHeight: 17 },
  statsPanel: { borderRadius: 22, padding: 20, gap: 8 },
  searchHeader: { flexDirection: "row", alignItems: "center", paddingTop: 58, paddingHorizontal: 12, gap: 6 },
  backButton: { padding: 6 },
  searchTitle: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  // outlineStyle: "none" is a react-native-web-only value (@types/react-native's own
  // TextStyle only knows the native solid/dotted/dashed outline feature, not the web
  // CSS keyword - "as any" bridges that) - without it, focusing this input draws the
  // browser's own default focus ring, a solid black rectangle spanning the full width
  // of the search bar, since no border was ever styled in to mask it.
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, outlineStyle: "none" as any },
  statTabs: { flexDirection: "row", gap: 8, marginHorizontal: 18, marginTop: 14 },
  statTab: { flex: 1, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: "center" },
  statTabActive: { backgroundColor: colors.ink },
  statTabText: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  statTabTextActive: { color: "#fff" },
  listContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 40, gap: 4 },
  listContentWide: { paddingHorizontal: 32, paddingTop: 20 },
  searchGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  addTeamButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line
  },
  addTeamButtonText: { color: colors.purple, fontWeight: "700", fontSize: 13 },
  standingsGridWide: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  standingsGridItem: { width: 480 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  searchRowWide: {
    width: 360,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  searchRank: { width: 20, color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  searchAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.purple, alignItems: "center", justifyContent: "center" },
  searchAvatarPhoto: { backgroundColor: "rgba(20,20,20,0.06)" },
  searchAvatarSquare: { borderRadius: 12, backgroundColor: colors.aqua },
  searchAvatarText: { color: "#fff", fontWeight: "700" },
  searchInfo: { flex: 1 },
  searchName: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  searchMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  // The rank badge rides on the photo's own corner instead of sitting as a separate
  // same-size circle next to it - keeps the player's photo the biggest, clearest
  // thing in the row instead of splitting attention between two equal circles.
  leaderAvatarWrap: { position: "relative" },
  leaderMedal: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.yellow,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: "center",
    justifyContent: "center"
  },
  leaderMedalText: { color: colors.ink, fontWeight: "700", fontSize: 11 }
});
