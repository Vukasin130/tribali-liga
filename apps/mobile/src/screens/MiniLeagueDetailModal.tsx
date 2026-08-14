import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  disbandFantasyMiniLeague,
  fetchFantasyMiniLeague,
  fetchFantasyMiniLeagueLeaderboard,
  leaveFantasyMiniLeague
} from "../api/endpoints";
import type { FantasyGameweek, FantasyMiniLeague, LeaderboardEntry } from "../api/types";
import { ApiError } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";
import { LeaderboardRow } from "../components/LeaderboardRow";
import { colors, gradients } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";

export function MiniLeagueDetailModal({
  miniLeagueId,
  gameweeks,
  onClose,
  onChanged,
  onSelectTeam
}: {
  miniLeagueId: string;
  gameweeks: FantasyGameweek[];
  onClose: () => void;
  onChanged: () => void;
  onSelectTeam: (fantasyTeamId: string, gameweekId: string | undefined, managerName: string) => void;
}) {
  const isWide = useIsWideScreen();
  const [league, setLeague] = useState<FantasyMiniLeague | null>(null);
  const [scope, setScope] = useState("season");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFantasyMiniLeague(miniLeagueId)
      .then(setLeague)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam ligu."))
      .finally(() => setLoading(false));
  }, [miniLeagueId]);

  useEffect(() => {
    setLeaderboardLoading(true);
    const gameweekId = scope === "season" ? undefined : scope;
    fetchFantasyMiniLeagueLeaderboard(miniLeagueId, gameweekId)
      .then(setLeaderboard)
      .catch(() => setLeaderboard([]))
      .finally(() => setLeaderboardLoading(false));
  }, [miniLeagueId, scope]);

  async function handleLeaveOrDisband() {
    if (!league) return;
    if (!confirmingAction) {
      setConfirmingAction(true);
      return;
    }
    setActing(true);
    setActionError("");
    try {
      if (league.isCreator) {
        await disbandFantasyMiniLeague(league.id);
      } else {
        await leaveFantasyMiniLeague(league.id);
      }
      onChanged();
      onClose();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Akcija nije uspela.");
      setActing(false);
      setConfirmingAction(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {loading ? <LoadingState label="Ucitavanje lige..." /> : null}
        {error ? (
          <View style={styles.errorWrap}>
            <ErrorState message={error} />
          </View>
        ) : null}

        {league ? (
          <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={gradients.hero} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.hero}>
              <View style={styles.heroTopRow}>
                <TouchableOpacity style={styles.iconButton} onPress={onClose}>
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.heroBadgeText}>Privatna liga</Text>
                <TouchableOpacity style={[styles.iconButton, styles.iconButtonDanger]} onPress={handleLeaveOrDisband} disabled={acting}>
                  <Ionicons name={league.isCreator ? "trash-outline" : "exit-outline"} size={16} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.crest}>
                <Ionicons name="shield-half-outline" size={30} color={colors.ink} />
              </View>

              <Text style={styles.name}>{league.name}</Text>
              <Text style={styles.metaLine}>
                {league.memberCount} {league.memberCount === 1 ? "clan" : "clanova"}
                {league.isCreator ? " - ti si osnivac" : ""}
              </Text>

              {league.isCreator ? (
                <View style={styles.codeChip}>
                  <Text style={styles.codeChipLabel}>KOD ZA POZIVANJE</Text>
                  <Text style={styles.codeChipValue}>{league.inviteCode}</Text>
                </View>
              ) : null}
            </LinearGradient>

            <View style={styles.body}>
              {confirmingAction ? (
                <Text style={styles.confirmHint}>
                  {league.isCreator
                    ? "Ovo trajno raspusta ligu za sve clanove. Pritisni ikonicu ponovo da potvrdis."
                    : "Napustices ovu ligu. Pritisni ikonicu ponovo da potvrdis."}
                </Text>
              ) : null}
              {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
                <TouchableOpacity
                  style={[styles.scopeChip, scope === "season" ? styles.scopeChipActive : null]}
                  onPress={() => setScope("season")}
                >
                  <Text style={[styles.scopeChipText, scope === "season" ? styles.scopeChipTextActive : null]}>Sezona</Text>
                </TouchableOpacity>
                {[...gameweeks].reverse().map((gw) => (
                  <TouchableOpacity
                    key={gw.id}
                    style={[styles.scopeChip, scope === gw.id ? styles.scopeChipActive : null]}
                    onPress={() => setScope(gw.id)}
                  >
                    <Text style={[styles.scopeChipText, scope === gw.id ? styles.scopeChipTextActive : null]}>{gw.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {leaderboardLoading ? <LoadingState label="Ucitavanje tabele..." /> : null}
              {!leaderboardLoading && leaderboard.length === 0 ? (
                <EmptyState message="Niko iz lige jos nije odigrao ovo kolo." />
              ) : null}
              {!leaderboardLoading &&
                leaderboard.map((entry) => (
                  <LeaderboardRow
                    key={entry.fantasyTeamId}
                    entry={entry}
                    showTotalPoints={scope === "season"}
                    onPress={() => onSelectTeam(entry.fantasyTeamId, scope === "season" ? undefined : scope, entry.managerName)}
                  />
                ))}
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
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
  iconButtonDanger: { backgroundColor: "rgba(160,24,61,0.35)" },
  heroBadgeText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  crest: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10
  },
  name: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center" },
  metaLine: { color: "rgba(255,255,255,0.82)", fontWeight: "700", textAlign: "center", marginBottom: 4 },
  codeChip: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center"
  },
  codeChipLabel: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  codeChipValue: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 4, marginTop: 2 },
  body: { padding: 20, paddingTop: 16, gap: 10 },
  confirmHint: { color: colors.danger, fontSize: 12, fontWeight: "700", textAlign: "center" },
  actionError: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  scopeRow: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  scopeChip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  scopeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  scopeChipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  scopeChipTextActive: { color: "#fff" }
});
