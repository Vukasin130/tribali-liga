import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { kitGradientForTeam } from "./PitchPlayerCard";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function TeamCrest({ teamId, name, logoUrl, size = 32 }: { teamId: string; name: string; logoUrl?: string; size?: number }) {
  const gradient = kitGradientForTeam(teamId);
  const style = { width: size, height: size, borderRadius: size * 0.28 };
  const [photoFailed, setPhotoFailed] = useState(false);
  if (logoUrl && !photoFailed) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={[styles.photo, style]}
        resizeMode="cover"
        onError={() => setPhotoFailed(true)}
      />
    );
  }
  return (
    <LinearGradient colors={gradient} style={[styles.fallback, style]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initialsOf(name || "?")}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: "rgba(20,20,20,0.06)" },
  fallback: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontWeight: "800" }
});
