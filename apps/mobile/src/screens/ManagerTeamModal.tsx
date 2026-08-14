import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { fetchFantasySeasonTeamById } from "../api/endpoints";
import type { FantasySeasonPick, FantasySeasonTeam } from "../api/types";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { Pitch } from "../components/Pitch";
import { BenchStrip } from "../components/BenchStrip";
import { BENCH_SLOTS, STARTER_SLOTS } from "../fantasyConstants";

// Read-only pitch view of another manager's squad for a given round - the leaderboard's
// "click a manager to see their team" drill-down (matches EuroLeague Fantasy's public team pages).
export function ManagerTeamModal({
  fantasyTeamId,
  fantasyGameweekId,
  managerName,
  onClose
}: {
  fantasyTeamId: string;
  fantasyGameweekId?: string;
  managerName?: string;
  onClose: () => void;
}) {
  const [team, setTeam] = useState<FantasySeasonTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isWide = useIsWideScreen();

  function load() {
    setLoading(true);
    setError("");
    fetchFantasySeasonTeamById(fantasyTeamId, fantasyGameweekId)
      .then(setTeam)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam tim."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [fantasyTeamId, fantasyGameweekId]);

  function pickFor(slot: string): FantasySeasonPick | null {
    return team?.picks.find((pick) => pick.slot === slot) ?? null;
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Zatvori</Text>
        </TouchableOpacity>

        {loading ? <LoadingState label="Ucitavanje tima..." /> : null}
        {error ? <ErrorState message={error} onRetry={load} /> : null}

        {team ? (
          <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
            <Text style={styles.eyebrow}>{managerName || "Menadzer"}</Text>
            <Text style={styles.title}>{team.name}</Text>
            <Text style={styles.subtitle}>{team.totalPoints} poena ukupno</Text>

            {team.picks.length === 0 ? (
              <EmptyState message="Ovaj menadzer jos nije sacuvao tim za ovo kolo." />
            ) : (
              <LinearGradient colors={["#D9B24C", "#C9A227", "#8A6D1F"]} style={styles.summaryPanel}>
                <Pitch
                  goalkeeper={{
                    slot: "GK",
                    name: pickFor("GK")?.playerName,
                    teamId: pickFor("GK")?.teamId,
                    avatarUrl: pickFor("GK")?.avatarUrl,
                    isCaptain: pickFor("GK")?.isCaptain,
                    statLabel: pickFor("GK") ? `${pickFor("GK")?.points ?? 0} pts` : undefined
                  }}
                  defenders={STARTER_SLOTS.filter((s) => s.position === "odbrana").map((s) => {
                    const pick = pickFor(s.slot);
                    return {
                      slot: s.slot,
                      name: pick?.playerName,
                      teamId: pick?.teamId,
                      avatarUrl: pick?.avatarUrl,
                      isCaptain: pick?.isCaptain,
                      statLabel: pick ? `${pick.points} pts` : undefined
                    };
                  })}
                  attackers={STARTER_SLOTS.filter((s) => s.position === "napad").map((s) => {
                    const pick = pickFor(s.slot);
                    return {
                      slot: s.slot,
                      name: pick?.playerName,
                      teamId: pick?.teamId,
                      avatarUrl: pick?.avatarUrl,
                      isCaptain: pick?.isCaptain,
                      statLabel: pick ? `${pick.points} pts` : undefined
                    };
                  })}
                />
                <BenchStrip
                  slots={BENCH_SLOTS.map((s) => {
                    const pick = pickFor(s.slot);
                    return {
                      slot: s.slot,
                      teamId: pick?.teamId,
                      name: pick?.playerName,
                      avatarUrl: pick?.avatarUrl,
                      position: pick?.position,
                      isCaptain: pick?.isCaptain,
                      statLabel: pick ? `${pick.points} pts` : undefined,
                      weightPercent: s.weightPercent
                    };
                  })}
                />
              </LinearGradient>
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  closeButton: {
    position: "absolute",
    top: 54,
    right: 18,
    zIndex: 2,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.line
  },
  closeButtonText: { color: colors.ink, fontWeight: "800" },
  content: { padding: 20, paddingTop: 60, gap: 6, paddingBottom: 60 },
  eyebrow: { color: colors.purple, fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  title: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  subtitle: { color: colors.textMuted, fontWeight: "700", marginBottom: 10 },
  summaryPanel: {
    borderRadius: 24,
    padding: 16,
    gap: 4,
    marginTop: 8,
    shadowColor: "#141414",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  }
});
