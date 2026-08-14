import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Card } from "./ui";
import { colors } from "../theme/colors";
import type { LeaderboardEntry } from "../api/types";

export function LeaderboardRow({
  entry,
  showTotalPoints,
  prizeThreshold,
  onPress
}: {
  entry: LeaderboardEntry;
  showTotalPoints: boolean;
  prizeThreshold?: number;
  onPress: () => void;
}) {
  const isPrizeRank = prizeThreshold !== undefined && entry.rank <= prizeThreshold;
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
      <Card style={[styles.row, isPrizeRank ? styles.rowPrize : null]}>
        <View style={[styles.rankBadge, isPrizeRank ? styles.rankBadgePrize : null]}>
          <Text style={[styles.rankText, isPrizeRank ? styles.rankTextPrize : null]}>{medal || entry.rank}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{entry.name}</Text>
          <Text style={styles.meta}>{entry.managerName}</Text>
        </View>
        <View style={styles.pointsCol}>
          <Text style={styles.points}>{(showTotalPoints ? entry.totalPoints : entry.points) ?? 0} pts</Text>
          {isPrizeRank ? <Text style={styles.prizeBadge}>🏆 Nagrada</Text> : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowPrize: { borderWidth: 1.5, borderColor: colors.yellow, backgroundColor: "rgba(227,178,60,0.08)" },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  rankBadgePrize: { backgroundColor: colors.yellow },
  rankText: { color: colors.textMuted, fontWeight: "900", fontSize: 13 },
  rankTextPrize: { color: colors.ink },
  info: { flex: 1 },
  name: { color: colors.textPrimary, fontWeight: "700" },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  pointsCol: { alignItems: "flex-end", gap: 2 },
  points: { color: colors.pink, fontWeight: "700" },
  prizeBadge: { color: colors.warning, fontSize: 10, fontWeight: "700" }
});
