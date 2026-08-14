import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme/colors";

// Lets an admin tell the app which tile background a sponsor logo was designed
// against, so the rendering side (SponsorStrip/SponsorMarquee/SponsorRail) can match
// it instead of always forcing a white card behind every logo - which looks broken
// for any logo that has its own dark/black background baked in.
export function LogoBackgroundToggle({
  value,
  onChange
}: {
  value: "light" | "dark";
  onChange: (value: "light" | "dark") => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Pozadina iza loga</Text>
      <View style={styles.options}>
        <Option label="Svetla" active={value !== "dark"} onPress={() => onChange("light")} />
        <Option label="Tamna" active={value === "dark"} onPress={() => onChange("dark")} />
      </View>
    </View>
  );
}

function Option({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.option, active ? styles.optionActive : null]} onPress={onPress}>
      <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3 },
  options: { flexDirection: "row", gap: 8 },
  option: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  optionActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  optionText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  optionTextActive: { color: "#fff" }
});
