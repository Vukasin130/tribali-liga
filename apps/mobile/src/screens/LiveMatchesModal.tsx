import React, { useState } from "react";
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { listLiveMatches } from "../api/endpoints";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";
import { FixtureCard } from "../components/FixtureCard";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { MatchDetailModal } from "./MatchDetailModal";
import { TeamProfileModal } from "./TeamProfileModal";

export function LiveMatchesModal({ onClose }: { onClose: () => void }) {
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const isWide = useIsWideScreen();

  const {
    data: matches = [],
    isLoading: loading,
    isRefetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ["liveMatches"],
    queryFn: () => listLiveMatches(),
    refetchInterval: 15_000
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : "Ne mogu da ucitam live utakmice.") : "";

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
            contentContainerStyle={[styles.content, isWide ? wideContent : null]}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.purple} />}
          >
            {error ? <ErrorState message={error} onRetry={() => refetch()} /> : null}
            {!error && matches.length === 0 ? <EmptyState message="Trenutno nema live utakmica." /> : null}
            {matches.map((match) => (
              <View key={match.id} style={styles.matchCardWrap}>
                {match.competitionName ? <Text style={styles.matchMeta}>{match.competitionName}</Text> : null}
                <FixtureCard
                  match={match}
                  wide={isWide}
                  onOpenMatch={() => setActiveMatchId(match.id)}
                  onOpenTeam={setActiveTeamId}
                />
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {activeMatchId ? <MatchDetailModal matchId={activeMatchId} onClose={() => setActiveMatchId(null)} /> : null}
      {activeTeamId ? <TeamProfileModal teamId={activeTeamId} onClose={() => setActiveTeamId(null)} /> : null}
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
  matchCardWrap: { gap: 6 },
  matchMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600" }
});
