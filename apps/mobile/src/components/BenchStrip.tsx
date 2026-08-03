import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PitchPlayerCard } from "./PitchPlayerCard";

export interface BenchSlot {
  slot: string;
  playerId?: string;
  teamId?: string;
  name?: string;
  avatarUrl?: string;
  position?: string;
  isCaptain?: boolean;
  statLabel?: string;
  weightPercent: number;
}

function isGoalkeeperPosition(position?: string): boolean {
  const normalized = (position || "").trim().toLowerCase();
  return normalized === "golman" || normalized === "gk";
}

// Bench cards reuse the exact same PitchPlayerCard used on the pitch (photo, name, price/points
// pill, captain badge) so the bench doesn't look like a lesser, separate design - only the
// weight-percent corner badge is bench-specific. Bench has no position restriction; the first
// bench slot scores at full weight, the rest at half.
export function BenchStrip({
  slots,
  onSelectSlot,
  onLongPressSlot,
  swapSourceSlot
}: {
  slots: BenchSlot[];
  onSelectSlot?: (slot: string) => void;
  onLongPressSlot?: (slot: string) => void;
  swapSourceSlot?: string | null;
}) {
  return (
    <LinearGradient colors={["#C9A227", "#8A6D1F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.strip}>
      <Text style={styles.label}>Klupa · prvi 100%, ostali 50% bodova</Text>
      <View style={styles.row}>
        {slots.map((item) => (
          <PitchPlayerCard
            key={item.slot}
            name={item.name}
            teamId={item.teamId}
            avatarUrl={item.avatarUrl}
            isCaptain={item.isCaptain}
            isGoalkeeper={isGoalkeeperPosition(item.position)}
            statLabel={item.statLabel}
            emptyLabel="Klupa"
            weightBadge={item.name ? `${item.weightPercent}%` : undefined}
            isSwapSource={swapSourceSlot === item.slot}
            compact
            onPress={onSelectSlot ? () => onSelectSlot(item.slot) : undefined}
            onLongPress={onLongPressSlot && item.name ? () => onLongPressSlot(item.slot) : undefined}
          />
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginTop: 12,
    padding: 8,
    borderRadius: 16,
    shadowColor: "#141414",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5
  },
  label: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", gap: 4, justifyContent: "space-between" }
});
