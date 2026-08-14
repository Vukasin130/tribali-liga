import React, { useState } from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, useAuth, SponsorsManagerModal, type Sponsor } from "@tribali-liga/mobile/shared";

export function SponsorRail({ sponsors, onChanged }: { sponsors: Sponsor[]; onChanged: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [editing, setEditing] = useState<Sponsor | "new" | null>(null);

  if (sponsors.length === 0 && !isAdmin) return <View style={styles.rail} />;

  return (
    <View style={styles.rail}>
      <Text style={styles.label}>Sponzori</Text>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {isAdmin ? (
          <TouchableOpacity style={[styles.tile, styles.addTile]} onPress={() => setEditing("new")}>
            <Ionicons name="add" size={26} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
        {sponsors.map((sponsor) => (
          <SponsorTile
            key={sponsor.id}
            sponsor={sponsor}
            isAdmin={isAdmin}
            onPress={() => (isAdmin ? setEditing(sponsor) : undefined)}
          />
        ))}
      </ScrollView>

      {editing ? (
        <SponsorsManagerModal
          initialEditing={editing}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      ) : null}
    </View>
  );
}

function SponsorTile({ sponsor, isAdmin, onPress }: { sponsor: Sponsor; isAdmin: boolean; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <TouchableOpacity
      style={styles.tile}
      activeOpacity={0.7}
      onPress={() => {
        if (isAdmin) {
          onPress();
        } else if (sponsor.targetUrl) {
          Linking.openURL(sponsor.targetUrl).catch(() => undefined);
        }
      }}
    >
      <Image source={{ uri: sponsor.logoUrl }} style={styles.logo} resizeMode="contain" onError={() => setFailed(true)} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  rail: { width: 160, height: "100%", alignItems: "center", paddingTop: 24 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 },
  list: { alignItems: "center", gap: 14, paddingBottom: 40 },
  tile: {
    width: 96,
    height: 96,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    shadowColor: "#141414",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  addTile: { backgroundColor: colors.surfaceMuted, borderStyle: "dashed" },
  logo: { width: "100%", height: "100%" }
});
