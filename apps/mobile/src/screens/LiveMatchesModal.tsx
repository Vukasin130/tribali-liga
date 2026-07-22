import React, { useCallback, useEffect, useState } from "react";
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { listLiveMatches } from "../api/endpoints";
import type { MatchSummary } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill } from "../components/ui";
import { colors } from "../theme/colors";
import { MatchDetailModal } from "./MatchDetailModal";

export function LiveMatchesModal({ onClose }: { onClose: () => void }) {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError("");
    listLiveMatches()
      .then(setMatches)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam live utakmice."))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      listLiveMatches()
        .then(setMatches)
        .catch(() => undefined);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Live utakmice</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.closeText}>Zatvori</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <LoadingState label="Ucitavanje utakmica..." />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.purple} />}
          >
            {error ? <ErrorState message={error} onRetry={load} /> : null}
            {!error && matches.length === 0 ? <EmptyState message="Trenutno nema live utakmica." /> : null}
            {matches.map((match) => (
              <TouchableOpacity key={match.id} onPress={() => setActiveMatchId(match.id)}>
                <Card style={styles.matchCard}>
                  <View style={styles.matchCardHead}>
                    <Pill label="LIVE" tone="live" />
                    {match.competitionName ? <Text style={styles.matchMeta}>{match.competitionName}</Text> : null}
                  </View>
                  <View style={styles.matchRow}>
                    <Text style={styles.matchTeam} numberOfLines={1}>{match.homeTeamShortName || match.homeTeamName}</Text>
                    <Text style={styles.matchScore}>{match.homeScore} : {match.awayScore}</Text>
                    <Text style={styles.matchTeam} numberOfLines={1}>{match.awayTeamShortName || match.awayTeamName}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {activeMatchId ? <MatchDetailModal matchId={activeMatchId} onClose={() => setActiveMatchId(null)} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 10
  },
  headerTitle: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  closeText: { color: colors.purple, fontWeight: "700" },
  content: { padding: 20, paddingTop: 6, gap: 12, paddingBottom: 60 },
  matchCard: { gap: 10 },
  matchCardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  matchMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  matchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  matchTeam: { flex: 1, color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  matchScore: { color: colors.ink, fontWeight: "900", fontSize: 20, marginHorizontal: 8 }
});
