import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

export type MatchAvailability = "unknown" | "playing" | "not_playing";

// Small status dot for a player's next match: red = confirmed NOT playing, orange =
// hasn't answered yet (default), green = confirmed playing - lets fantasy managers see
// at a glance whether picking someone is safe.
export function AvailabilityDot({ status, size = 12 }: { status: MatchAvailability; size?: number }) {
  const color = status === "playing" ? colors.success : status === "not_playing" ? colors.danger : colors.warning;
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color }
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    borderWidth: 2,
    borderColor: "#fff"
  }
});
