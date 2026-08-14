import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchAnalyticsOverview } from "../api/endpoints";
import type { AnalyticsDailyCount, AnalyticsOverview } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill, SectionTitle } from "../components/ui";
import { colors } from "../theme/colors";

// Every number on this screen comes straight from data the app already stores
// (accounts, votes, views, likes, predictions, fantasy teams) - there's no separate
// click/screen-view/session tracking system yet, so "time on app" and raw click counts
// aren't here. This is the fast first pass; true event tracking is a later phase.

function formatShortDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("sr-RS", { day: "numeric", month: "short" });
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("sr-RS", { day: "numeric", month: "short", year: "numeric" });
}

function TrendBars({ data, color }: { data: AnalyticsDailyCount[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <View>
      <View style={styles.trendRow}>
        {data.map((d) => (
          <View key={d.day} style={styles.trendBarTrack}>
            <View style={[styles.trendBarFill, { height: `${Math.max(3, (d.count / max) * 100)}%`, backgroundColor: color }]} />
          </View>
        ))}
      </View>
      <View style={styles.trendAxisRow}>
        <Text style={styles.trendAxisLabel}>{data[0] ? formatShortDay(data[0].day) : ""}</Text>
        <Text style={styles.trendAxisLabel}>{data[data.length - 1] ? formatShortDay(data[data.length - 1].day) : ""}</Text>
      </View>
    </View>
  );
}

function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function StatisticsScreen() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = React.useCallback(async () => {
    setError("");
    try {
      setData(await fetchAnalyticsOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ne mogu da ucitam statistiku.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <LoadingState label="Ucitavanje statistike..." />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <ErrorState message={error || "Nema podataka."} onRetry={load} />
        </View>
      </View>
    );
  }

  const totalEngagement =
    data.engagement.storyViews.total + data.engagement.storyLikes.total + data.engagement.goalVotes.total + data.engagement.matchPredictions.total;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerKicker}>Admin</Text>
        <Text style={styles.headerTitle}>Statistika</Text>
        <Text style={styles.headerSubtitle}>Nalozi, aktivnost i angazovanje - mobilna i desktop aplikacija dele iste podatke.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          <Card style={styles.gridCard}>
            <SectionTitle eyebrow="Nalozi" title="Ukupno registrovanih" />
            <View style={styles.tileRow}>
              <StatTile value={data.users.total} label="ukupno" />
              <StatTile value={data.users.newLast7Days} label="poslednjih 7 dana" />
              <StatTile value={data.users.newLast30Days} label="poslednjih 30 dana" />
            </View>
            <View style={styles.tileRow}>
              <StatTile value={data.users.fans} label="navijaci" />
              <StatTile value={data.users.verifiedPlayers} label="verifikovani igraci" />
              <StatTile value={data.users.admins} label="admini" />
            </View>
          </Card>

          <Card style={styles.gridCard}>
            <SectionTitle eyebrow="Fantasy" title="Ucesce u fantasy igri" />
            <View style={styles.tileRow}>
              <StatTile value={data.fantasy.totalTeams} label="fantasy timova" />
              <StatTile value={data.fantasy.newLast30Days} label="novih timova (30d)" />
            </View>
          </Card>

          <Card style={styles.gridCard}>
            <SectionTitle eyebrow="Fantasy" title="Privatne lige korisnika" />
            <View style={styles.tileRow}>
              <StatTile value={data.miniLeagues.total} label="privatnih liga" />
              <StatTile value={data.miniLeagues.newLast30Days} label="novih (30d)" />
              <StatTile value={data.miniLeagues.totalMemberships} label="ukupno clanstava" />
            </View>
          </Card>

          <Card style={styles.gridCard}>
            <SectionTitle eyebrow="Sadrzaj" title="Objavljeni sadrzaj" />
            <View style={styles.tileRow}>
              <StatTile value={`${data.content.newsPublished}/${data.content.newsTotal}`} label="objavljene vesti" />
              <StatTile value={data.content.storiesTotal} label="priloga (stories)" />
              <StatTile value={data.content.goalPollsTotal} label="anketa gola" />
            </View>
          </Card>

          <Card style={styles.gridCard}>
            <SectionTitle eyebrow="Angazovanje" title="Ukupne akcije korisnika" />
            <View style={styles.tileRow}>
              <StatTile value={totalEngagement} label="ukupno akcija" />
              <StatTile value={data.engagement.storyViews.total} label="pregleda priloga" />
              <StatTile value={data.engagement.storyLikes.total} label="lajkova priloga" />
            </View>
            <View style={styles.tileRow}>
              <StatTile value={data.engagement.goalVotes.total} label="glasova za gol" />
              <StatTile value={data.engagement.matchPredictions.total} label="predikcija rezultata" />
              <StatTile value={data.adminActivity.last7Days} label="admin akcija (7d)" />
            </View>
          </Card>
        </View>

        <Card style={styles.wideCard}>
          <SectionTitle eyebrow="Trend" title="Nove registracije (30 dana)" />
          {data.registrationsPerDay.some((d) => d.count > 0) ? (
            <TrendBars data={data.registrationsPerDay} color={colors.purple} />
          ) : (
            <EmptyState message="Nema registracija u poslednjih 30 dana." />
          )}
        </Card>

        <Card style={styles.wideCard}>
          <SectionTitle eyebrow="Trend" title="Aktivnost korisnika (30 dana)" />
          <Text style={styles.hint}>Pregledi priloga, glasovi za gol i predikcije rezultata, zajedno po danu.</Text>
          {data.activityPerDay.some((d) => d.count > 0) ? (
            <TrendBars data={data.activityPerDay} color={colors.aqua} />
          ) : (
            <EmptyState message="Nema zabelezene aktivnosti u poslednjih 30 dana." />
          )}
        </Card>

        <Card style={styles.wideCard}>
          <SectionTitle eyebrow="Verifikacija" title="Status zahteva za verifikaciju" />
          <View style={styles.pillRow}>
            <Pill label={`Neobradjeno: ${data.verification.none}`} tone="neutral" />
            <Pill label={`Na cekanju: ${data.verification.pending}`} tone="warning" />
            <Pill label={`Odobreno: ${data.verification.approved}`} tone="success" />
            <Pill label={`Odbijeno: ${data.verification.rejected}`} tone="danger" />
          </View>
        </Card>

        <Card style={styles.wideCard}>
          <SectionTitle eyebrow="Fantasy" title="Sve privatne lige" />
          <Text style={styles.hint}>
            Zatvorene lige koje su korisnici sami napravili - admin nema ulogu u njima, ovde su samo za uvid.
          </Text>
          {data.miniLeagues.list.length === 0 ? (
            <EmptyState message="Korisnici jos nisu napravili nijednu privatnu ligu." />
          ) : (
            <View style={styles.miniLeagueTable}>
              <View style={[styles.miniLeagueRow, styles.miniLeagueHeaderRow]}>
                <Text style={[styles.miniLeagueCellName, styles.miniLeagueHeaderText]}>Naziv</Text>
                <Text style={[styles.miniLeagueCell, styles.miniLeagueHeaderText]}>Sezona</Text>
                <Text style={[styles.miniLeagueCell, styles.miniLeagueHeaderText]}>Osnivac</Text>
                <Text style={[styles.miniLeagueCellNarrow, styles.miniLeagueHeaderText]}>Clanova</Text>
                <Text style={[styles.miniLeagueCellNarrow, styles.miniLeagueHeaderText]}>Kod</Text>
                <Text style={[styles.miniLeagueCell, styles.miniLeagueHeaderText]}>Napravljena</Text>
              </View>
              {data.miniLeagues.list.map((league) => (
                <View key={league.id} style={styles.miniLeagueRow}>
                  <Text style={[styles.miniLeagueCellName, styles.miniLeagueText]} numberOfLines={1}>
                    {league.name}
                  </Text>
                  <Text style={[styles.miniLeagueCell, styles.miniLeagueTextMuted]} numberOfLines={1}>
                    {league.seasonName}
                  </Text>
                  <Text style={[styles.miniLeagueCell, styles.miniLeagueTextMuted]} numberOfLines={1}>
                    {league.creatorName}
                  </Text>
                  <Text style={[styles.miniLeagueCellNarrow, styles.miniLeagueText]}>{league.memberCount}</Text>
                  <Text style={[styles.miniLeagueCellNarrow, styles.miniLeagueCode]}>{league.inviteCode}</Text>
                  <Text style={[styles.miniLeagueCell, styles.miniLeagueTextMuted]}>{formatDate(league.createdAt)}</Text>
                </View>
              ))}
              {data.miniLeagues.list.length >= 200 ? (
                <Text style={styles.hint}>Prikazano poslednjih 200 liga.</Text>
              ) : null}
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: 40, paddingHorizontal: 32, paddingBottom: 16 },
  headerKicker: { color: colors.purple, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  headerTitle: { color: colors.ink, fontSize: 26, fontWeight: "700", marginTop: 2 },
  headerSubtitle: { color: colors.textMuted, marginTop: 4, fontSize: 13 },
  content: { paddingHorizontal: 32, paddingBottom: 48, gap: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  gridCard: { flexBasis: 420, flexGrow: 1, gap: 12 },
  wideCard: { gap: 12 },
  tileRow: { flexDirection: "row", gap: 10 },
  statTile: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    gap: 3
  },
  statValue: { color: colors.textPrimary, fontWeight: "800", fontSize: 19 },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600", textAlign: "center" },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: -6 },
  trendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 120,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 8
  },
  trendBarTrack: { flex: 1, height: "100%", justifyContent: "flex-end" },
  trendBarFill: { width: "100%", borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 3 },
  trendAxisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  trendAxisLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  miniLeagueTable: { gap: 2 },
  miniLeagueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  miniLeagueHeaderRow: { borderBottomColor: colors.ink, borderBottomWidth: 1.5 },
  miniLeagueHeaderText: { color: colors.textMuted, fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  miniLeagueCellName: { flex: 2, minWidth: 120 },
  miniLeagueCell: { flex: 1.4, minWidth: 90 },
  miniLeagueCellNarrow: { flex: 0.7, minWidth: 60 },
  miniLeagueText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  miniLeagueTextMuted: { color: colors.textMuted, fontSize: 13 },
  miniLeagueCode: { color: colors.pink, fontWeight: "800", fontSize: 12, letterSpacing: 1 }
});
