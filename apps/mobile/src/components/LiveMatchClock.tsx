import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { computeElapsedSeconds, formatClock, periodLabel } from "../utils/matchClock";

export function LiveMatchClock({
  period,
  periodStartedAt,
  halfLengthMinutes,
  compact
}: {
  period: string;
  periodStartedAt: string;
  halfLengthMinutes: number;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const seconds = computeElapsedSeconds(period, periodStartedAt, halfLengthMinutes, now);

  return (
    <View style={styles.row}>
      <View style={styles.pulse} />
      {compact ? null : <Text style={styles.label}>{periodLabel(period)}</Text>}
      <Text style={[styles.clock, compact ? styles.clockCompact : null]}>{formatClock(seconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", gap: 2 },
  pulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live, marginBottom: 2 },
  label: { color: colors.live, fontWeight: "700", fontSize: 10, textTransform: "uppercase" },
  clock: { color: colors.live, fontWeight: "900", fontSize: 16, fontVariant: ["tabular-nums"] },
  clockCompact: { fontSize: 13 }
});
