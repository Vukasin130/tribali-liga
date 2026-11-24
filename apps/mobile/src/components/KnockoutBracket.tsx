import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { MatchSummary } from "../api/types";
import { colors } from "../theme/colors";
import { TeamCrest } from "./TeamCrest";
import { knockoutStageLabel } from "../screens/useSeasonsScreenState";

// Once a competition reaches its knockout phase, the regular-season table stops being the
// thing to look at - who's still alive in the bracket is. This renders every knockout round
// as its own column (oldest stage first, thanks to competition-builder.ts anchoring round
// numbers to increase as the bracket progresses), so the whole tournament's shape is visible
// at a glance instead of one round-at-a-time like the regular fixture list. The third-place
// match shares its round number with the final but isn't part of the bracket itself, so it
// renders as its own small card underneath rather than inside a stage column.
export function KnockoutBracket({
  matches,
  onOpenMatch,
  onOpenTeam
}: {
  matches: MatchSummary[];
  onOpenMatch: (matchId: string) => void;
  onOpenTeam: (teamId: string) => void;
}) {
  const bracketMatches = matches.filter((match) => match.phase === "knockout");
  const thirdPlaceMatch = matches.find((match) => match.phase === "third_place");

  const stages = new Map<number, MatchSummary[]>();
  for (const match of bracketMatches) {
    const round = match.round ?? 0;
    if (!stages.has(round)) stages.set(round, []);
    stages.get(round)!.push(match);
  }
  const stageRounds = Array.from(stages.keys()).sort((a, b) => a - b);

  if (!stageRounds.length) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {stageRounds.map((round) => {
          const stageMatches = stages.get(round)!.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
          return (
            <View key={round} style={styles.stageColumn}>
              <Text style={styles.stageTitle}>{knockoutStageLabel(stageMatches.length)}</Text>
              <View style={styles.stageMatches}>
                {stageMatches.map((match) => (
                  <BracketMatchCard key={match.id} match={match} onPress={() => onOpenMatch(match.id)} onOpenTeam={onOpenTeam} />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {thirdPlaceMatch ? (
        <View style={styles.thirdPlaceWrap}>
          <Text style={styles.stageTitle}>Utakmica za 3. mesto</Text>
          <BracketMatchCard match={thirdPlaceMatch} onPress={() => onOpenMatch(thirdPlaceMatch.id)} onOpenTeam={onOpenTeam} />
        </View>
      ) : null}
    </View>
  );
}

function BracketMatchCard({
  match,
  onPress,
  onOpenTeam
}: {
  match: MatchSummary;
  onPress: () => void;
  onOpenTeam: (teamId: string) => void;
}) {
  const isFinished = match.status === "finished";
  const homeWon = isFinished && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.awayScore > match.homeScore;

  return (
    <TouchableOpacity style={styles.matchCard} onPress={onPress} activeOpacity={0.85}>
      <BracketTeamRow
        teamId={match.homeTeamId}
        name={match.homeTeamName || "TBD"}
        logoUrl={match.homeTeamLogoUrl}
        score={isFinished ? match.homeScore : null}
        won={homeWon}
        onOpenTeam={onOpenTeam}
      />
      <View style={styles.matchDivider} />
      <BracketTeamRow
        teamId={match.awayTeamId}
        name={match.awayTeamName || "TBD"}
        logoUrl={match.awayTeamLogoUrl}
        score={isFinished ? match.awayScore : null}
        won={awayWon}
        onOpenTeam={onOpenTeam}
      />
      {match.status === "live" ? <Text style={styles.liveTag}>UZIVO</Text> : null}
    </TouchableOpacity>
  );
}

function BracketTeamRow({
  teamId,
  name,
  logoUrl,
  score,
  won,
  onOpenTeam
}: {
  teamId: string;
  name: string;
  logoUrl?: string;
  score: number | null;
  won: boolean;
  onOpenTeam: (teamId: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.teamRow}
      onPress={() => teamId && onOpenTeam(teamId)}
      disabled={!teamId}
      hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
    >
      <TeamCrest teamId={teamId || name} name={name} logoUrl={logoUrl} size={22} />
      <Text style={[styles.teamName, won ? styles.teamNameWon : null]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.teamScore, won ? styles.teamNameWon : null]}>{score !== null ? score : "-"}</Text>
    </TouchableOpacity>
  );
}

const STAGE_WIDTH = 208;

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  scrollContent: { gap: 24, paddingHorizontal: 2, paddingVertical: 4 },
  stageColumn: { width: STAGE_WIDTH, gap: 10 },
  stageTitle: { color: colors.textPrimary, fontWeight: "800", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.4 },
  stageMatches: { gap: 14 },
  matchCard: {
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
    gap: 6,
    shadowColor: "#141414",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1
  },
  matchDivider: { height: 1, backgroundColor: colors.line },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  teamName: { flex: 1, color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  teamNameWon: { color: colors.ink, fontWeight: "800" },
  teamScore: { color: colors.textMuted, fontSize: 12, fontWeight: "700", minWidth: 16, textAlign: "right" },
  liveTag: { color: colors.live, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textAlign: "center" },
  thirdPlaceWrap: { gap: 10, maxWidth: STAGE_WIDTH }
});
