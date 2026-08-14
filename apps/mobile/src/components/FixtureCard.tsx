import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { MatchSummary } from "../api/types";
import { colors } from "../theme/colors";
import { TeamCrest } from "./TeamCrest";
import { LiveMatchClock } from "./LiveMatchClock";

function fixtureTime(match: MatchSummary): string {
  if (match.status === "finished") return `${match.homeScore} : ${match.awayScore}`;
  if (match.status === "live") return "LIVE";
  const date = new Date(match.scheduledAt);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });
}

function fixtureMeta(match: MatchSummary): string {
  if (match.status === "finished") return "Odigrano";
  if (match.status === "live") return "Uzivo";
  return "Zakazano";
}

// The one fixture-card look used everywhere a match is listed - scheduled, live, or
// finished - so a live match never looks like a different, lesser kind of card: same
// crests/names/labels, the only difference is the center column swapping the scheduled
// kickoff time for a ticking LiveMatchClock while status === "live".
export function FixtureCard({
  match,
  onOpenMatch,
  onOpenTeam,
  wide
}: {
  match: MatchSummary;
  onOpenMatch: () => void;
  onOpenTeam: (teamId: string) => void;
  wide?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.fixtureCard, wide ? styles.fixtureCardWide : null]} onPress={onOpenMatch} activeOpacity={0.85}>
      <FixtureTeam teamId={match.homeTeamId} name={match.homeTeamName || "Domacin"} logoUrl={match.homeTeamLogoUrl} label="Domacin" onPress={onOpenTeam} />
      <View style={styles.fixtureCenter}>
        <View style={[styles.fixtureAccent, match.status === "live" ? styles.fixtureAccentLive : null]} />
        {match.status === "live" ? (
          <LiveMatchClock period={match.period} periodStartedAt={match.periodStartedAt} halfLengthMinutes={match.halfLengthMinutes} compact />
        ) : (
          <Text style={styles.fixtureTime}>{fixtureTime(match)}</Text>
        )}
        <Text style={styles.fixtureMeta}>{fixtureMeta(match)}</Text>
      </View>
      <FixtureTeam teamId={match.awayTeamId} name={match.awayTeamName || "Gost"} logoUrl={match.awayTeamLogoUrl} label="Gost" onPress={onOpenTeam} />
    </TouchableOpacity>
  );
}

function FixtureTeam({
  teamId,
  name,
  logoUrl,
  label,
  onPress
}: {
  teamId: string;
  name: string;
  logoUrl?: string;
  label: string;
  onPress: (teamId: string) => void;
}) {
  const content = (
    <>
      <TeamCrest teamId={teamId || name} name={name} logoUrl={logoUrl} size={30} />
      <Text style={styles.fixtureTeamName} numberOfLines={2}>{name}</Text>
      <Text style={styles.fixtureTeamLabel}>{label}</Text>
    </>
  );
  if (!teamId) return <View style={styles.fixtureTeam}>{content}</View>;
  return (
    <TouchableOpacity style={styles.fixtureTeam} onPress={() => onPress(teamId)}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fixtureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#fff",
    shadowColor: "#141414",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  fixtureCardWide: { width: 360 },
  fixtureTeam: { flex: 1, gap: 4, alignItems: "center" },
  fixtureTeamName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13, textAlign: "center" },
  fixtureTeamLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
  fixtureCenter: { width: 76, alignItems: "center", gap: 3 },
  fixtureAccent: { width: 30, height: 3, borderRadius: 999, backgroundColor: colors.aqua, marginBottom: 2 },
  fixtureAccentLive: { backgroundColor: colors.live },
  fixtureTime: { color: "#141414", fontWeight: "800", fontSize: 18 },
  fixtureMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "500" }
});
