import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { StandingRow } from "../api/types";
import { Card } from "./ui";
import { TeamCrest } from "./TeamCrest";
import { colors } from "../theme/colors";

export function StandingsTable({
  groupName,
  rows,
  onTeamPress,
  highlightTeamId
}: {
  groupName?: string;
  rows: StandingRow[];
  onTeamPress: (teamId: string) => void;
  highlightTeamId?: string;
}) {
  return (
    <Card style={styles.card}>
      {groupName && groupName !== "Tabela" ? <Text style={styles.groupName}>{groupName}</Text> : null}
      <View style={styles.head}>
        <Text style={[styles.headText, styles.rankCol]}>#</Text>
        <Text style={[styles.headText, styles.teamCol]}>Ekipa</Text>
        <Text style={styles.headText}>OD</Text>
        <Text style={styles.headText}>GR</Text>
        <Text style={styles.headText}>BOD</Text>
      </View>
      {rows.map((row, index) => (
        <TouchableOpacity
          key={row.id}
          style={[styles.row, row.teamId === highlightTeamId ? styles.rowHighlight : null]}
          onPress={() => onTeamPress(row.teamId)}
        >
          <Text style={[styles.rank, styles.rankCol]}>{row.position ?? index + 1}</Text>
          <View style={[styles.teamCol, styles.teamCell]}>
            <TeamCrest teamId={row.teamId} name={row.teamName} logoUrl={row.logoUrl} size={26} />
            <Text style={styles.teamName} numberOfLines={1}>{row.teamName}</Text>
          </View>
          <Text style={styles.cell}>{row.played}</Text>
          <Text style={styles.cell}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Text>
          <Text style={styles.points}>{row.points}</Text>
        </TouchableOpacity>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  groupName: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  head: { flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  headText: { flex: 1, color: colors.textMuted, fontWeight: "700", fontSize: 11, textAlign: "center" },
  rankCol: { width: 28, flex: 0 },
  teamCol: { flex: 3 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  rowHighlight: { backgroundColor: colors.surfaceMuted },
  rank: { color: colors.textMuted, fontWeight: "700", textAlign: "center" },
  teamCell: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 6 },
  teamName: { flex: 1, color: colors.textPrimary, fontWeight: "600" },
  cell: { flex: 1, color: colors.textMuted, textAlign: "center", fontWeight: "600" },
  points: { flex: 1, color: colors.pink, textAlign: "center", fontWeight: "700" }
});
