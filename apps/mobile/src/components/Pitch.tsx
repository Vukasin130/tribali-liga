import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients } from "../theme/colors";
import { PitchPlayerCard } from "./PitchPlayerCard";

export interface PitchSlot {
  slot: string;
  playerId?: string;
  teamId?: string;
  name?: string;
  avatarUrl?: string;
  isCaptain?: boolean;
  statLabel?: string;
}

interface PitchProps {
  goalkeeper: PitchSlot;
  defenders: PitchSlot[];
  attackers: PitchSlot[];
  onSelectSlot?: (slot: string) => void;
  onLongPressSlot?: (slot: string) => void;
  swapSourceSlot?: string | null;
}

const GRASS_STRIPE_COUNT = 8;

// Renders one defensive half of a pitch: halfway line + center-circle arc at the top,
// penalty area / six-yard box / penalty spot near the goal line at the bottom (where the
// goalkeeper sits) - matching the ATT (top) / DEF (middle) / GK (bottom) row order below.
export function Pitch({ goalkeeper, defenders, attackers, onSelectSlot, onLongPressSlot, swapSourceSlot }: PitchProps) {
  return (
    <LinearGradient colors={gradients.pitch} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.field}>
      <View style={styles.grassStripes} pointerEvents="none">
        {Array.from({ length: GRASS_STRIPE_COUNT }).map((_, index) => (
          <View key={index} style={[styles.stripe, index % 2 === 0 ? styles.stripeLight : null]} />
        ))}
      </View>

      <View style={styles.markings} pointerEvents="none">
        <View style={styles.centerArc} />
        <View style={styles.penaltyBox} />
        <View style={styles.sixYardBox} />
        <View style={styles.penaltySpot} />
        <View style={styles.goalMouth} />
      </View>

      <View style={styles.line}>
        {attackers.map((item) => (
          <PitchPlayerCard
            key={item.slot}
            name={item.name}
            teamId={item.teamId}
            avatarUrl={item.avatarUrl}
            isCaptain={item.isCaptain}
            statLabel={item.statLabel}
            emptyLabel="Napad"
            isSwapSource={swapSourceSlot === item.slot}
            onPress={onSelectSlot ? () => onSelectSlot(item.slot) : undefined}
            onLongPress={onLongPressSlot && item.name ? () => onLongPressSlot(item.slot) : undefined}
          />
        ))}
      </View>
      <View style={styles.line}>
        {defenders.map((item) => (
          <PitchPlayerCard
            key={item.slot}
            name={item.name}
            teamId={item.teamId}
            avatarUrl={item.avatarUrl}
            isCaptain={item.isCaptain}
            statLabel={item.statLabel}
            emptyLabel="Odbrana"
            isSwapSource={swapSourceSlot === item.slot}
            onPress={onSelectSlot ? () => onSelectSlot(item.slot) : undefined}
            onLongPress={onLongPressSlot && item.name ? () => onLongPressSlot(item.slot) : undefined}
          />
        ))}
      </View>
      <View style={styles.line}>
        <PitchPlayerCard
          name={goalkeeper.name}
          teamId={goalkeeper.teamId}
          avatarUrl={goalkeeper.avatarUrl}
          isCaptain={goalkeeper.isCaptain}
          isGoalkeeper
          statLabel={goalkeeper.statLabel}
          emptyLabel="Golman"
          isSwapSource={swapSourceSlot === goalkeeper.slot}
          onPress={onSelectSlot ? () => onSelectSlot(goalkeeper.slot) : undefined}
          onLongPress={onLongPressSlot && goalkeeper.name ? () => onLongPressSlot(goalkeeper.slot) : undefined}
        />
      </View>
    </LinearGradient>
  );
}

const LINE_COLOR = "rgba(255,255,255,0.38)";

const styles = StyleSheet.create({
  field: {
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 10,
    gap: 22,
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: LINE_COLOR
  },
  grassStripes: {
    ...(StyleSheet.absoluteFillObject as object),
    flexDirection: "row"
  },
  stripe: { flex: 1 },
  stripeLight: { backgroundColor: "rgba(255,255,255,0.05)" },
  markings: { ...(StyleSheet.absoluteFillObject as object) },
  centerArc: {
    position: "absolute",
    top: -60,
    left: "50%",
    width: 120,
    height: 120,
    marginLeft: -60,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: LINE_COLOR,
    backgroundColor: "transparent"
  },
  penaltyBox: {
    position: "absolute",
    bottom: 0,
    left: "13%",
    right: "13%",
    height: "36%",
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: LINE_COLOR
  },
  sixYardBox: {
    position: "absolute",
    bottom: 0,
    left: "31%",
    right: "31%",
    height: "16%",
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: LINE_COLOR
  },
  penaltySpot: {
    position: "absolute",
    bottom: "22%",
    left: "50%",
    width: 6,
    height: 6,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: LINE_COLOR
  },
  goalMouth: {
    position: "absolute",
    bottom: -3,
    left: "40%",
    right: "40%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.55)"
  },
  line: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start", zIndex: 1 }
});
