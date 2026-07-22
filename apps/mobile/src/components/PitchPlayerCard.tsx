import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

// Matches the reference design's procedurally-drawn kit portraits (a head
// circle + a colored jersey block per player, no photos) rather than avatar
// images - see apps/admin/public/mobile-prototype.html `.player-card`/`.portrait`.
const KIT_COLORS = ["#e42a38", "#1d66d1", "#18b978", "#f29a22"];
const KIT_COLORS_LIGHT = ["#ff6b74", "#5b9bf5", "#5be3a8", "#ffc266"];
const GK_GRADIENT: readonly [string, string] = ["#4a3a14", "#141414"];

// Default size fits 2 cards per pitch row; compact fits 5 cards in one bench row
// (matches the reference design's own `--player-card-w: 58px` for the compact context).
const CARD_WIDTH = 68;
const CARD_WIDTH_COMPACT = 54;
const PORTRAIT_HEIGHT = 50;
const PORTRAIT_HEIGHT_COMPACT = 38;

export function kitColorForTeam(teamId: string): string {
  let hash = 0;
  for (let i = 0; i < teamId.length; i += 1) hash = (hash * 31 + teamId.charCodeAt(i)) % 97;
  return KIT_COLORS[hash % KIT_COLORS.length];
}

export function kitGradientForTeam(teamId: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < teamId.length; i += 1) hash = (hash * 31 + teamId.charCodeAt(i)) % 97;
  const index = hash % KIT_COLORS.length;
  return [KIT_COLORS_LIGHT[index], KIT_COLORS[index]];
}

export function PitchPlayerCard({
  name,
  teamId,
  avatarUrl,
  isCaptain,
  isGoalkeeper,
  statLabel,
  emptyLabel,
  isSwapSource,
  weightBadge,
  compact,
  onPress,
  onLongPress
}: {
  name?: string;
  teamId?: string;
  avatarUrl?: string;
  isCaptain?: boolean;
  isGoalkeeper?: boolean;
  statLabel?: string;
  emptyLabel?: string;
  isSwapSource?: boolean;
  weightBadge?: string;
  compact?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const width = compact ? CARD_WIDTH_COMPACT : CARD_WIDTH;
  const portraitHeight = compact ? PORTRAIT_HEIGHT_COMPACT : PORTRAIT_HEIGHT;

  if (!name) {
    return (
      <TouchableOpacity style={[styles.emptyCard, { width }]} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.portraitEmpty, { width, height: portraitHeight }]}>
          <Text style={styles.emptyPlus}>+</Text>
          {weightBadge ? (
            <View style={styles.weightBadgeEmpty}>
              <Text style={styles.weightBadgeText}>{weightBadge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.emptyLabel, compact ? styles.textCompact : null]} numberOfLines={1}>
          {emptyLabel || "Izaberi"}
        </Text>
      </TouchableOpacity>
    );
  }

  const gradient = isGoalkeeper ? GK_GRADIENT : kitGradientForTeam(teamId || "");

  return (
    <TouchableOpacity
      style={[styles.card, { width }, isSwapSource ? styles.cardSwapSource : null]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      activeOpacity={0.85}
    >
      <View style={styles.cardInner}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={[styles.portraitPhoto, { height: portraitHeight }]} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={gradient}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={[styles.portrait, { height: portraitHeight }]}
          >
            <View style={styles.headShadow} />
            <View style={styles.head} />
            <View style={styles.shine} />
          </LinearGradient>
        )}
        <Text style={[styles.name, compact ? styles.textCompact : null]} numberOfLines={1}>
          {name}
        </Text>
        {statLabel ? (
          <View style={styles.statPill}>
            <Text style={[styles.statText, compact ? styles.textCompact : null]}>{statLabel}</Text>
          </View>
        ) : null}
      </View>
      {isCaptain ? (
        <View style={styles.captainBadge}>
          <Text style={styles.captainBadgeText}>C</Text>
        </View>
      ) : null}
      {weightBadge ? (
        <View style={styles.weightBadge}>
          <Text style={styles.weightBadgeText}>{weightBadge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
    shadowColor: "#141414",
    shadowOpacity: 0.32,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6
  },
  cardSwapSource: {
    borderWidth: 3,
    borderColor: colors.yellow,
    shadowColor: colors.yellow,
    shadowOpacity: 0.6
  },
  cardInner: { borderRadius: 13, overflow: "hidden", backgroundColor: "#fff" },
  emptyCard: { alignItems: "center" },
  portrait: { width: "100%", alignItems: "center", overflow: "hidden", position: "relative", backgroundColor: "#ece8e0" },
  portraitPhoto: { width: "100%", backgroundColor: "#ece8e0" },
  portraitEmpty: {
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.45)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center"
  },
  shine: {
    position: "absolute",
    top: -18,
    left: -10,
    right: -10,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 20,
    transform: [{ rotate: "-8deg" }]
  },
  emptyPlus: { color: "rgba(255,255,255,0.75)", fontSize: 22, fontWeight: "700", lineHeight: 24 },
  emptyLabel: {
    width: "100%",
    marginTop: 3,
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  },
  headShadow: {
    position: "absolute",
    top: 9,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.18)"
  },
  head: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f0c7ae",
    marginTop: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)"
  },
  captainBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: colors.yellow,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 5
  },
  captainBadgeText: { color: colors.ink, fontWeight: "700", fontSize: 10 },
  weightBadge: {
    position: "absolute",
    top: -6,
    left: -6,
    minWidth: 24,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 5
  },
  weightBadgeEmpty: {
    position: "absolute",
    top: 3,
    left: 3,
    minWidth: 24,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  weightBadgeText: { color: "#fff", fontWeight: "700", fontSize: 9 },
  name: {
    width: "100%",
    backgroundColor: "#fff",
    color: colors.ink,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 3,
    paddingHorizontal: 3
  },
  statPill: {
    width: "100%",
    backgroundColor: "#b8ff36",
    paddingVertical: 3
  },
  statText: { color: "#00371f", fontSize: 10, fontWeight: "700", textAlign: "center" },
  textCompact: { fontSize: 9 }
});
