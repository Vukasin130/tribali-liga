import React, { useEffect, useState } from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchGeneralSponsors } from "../api/endpoints";
import type { Sponsor } from "../api/types";
import { colors } from "../theme/colors";
import { useAuth } from "../state/AuthContext";
import { SponsorsManagerModal } from "../screens/SponsorsManagerModal";

// A logo-only strip of all active "general" sponsors (kind='general') - distinct
// from the single weekly "goal of the week" banner and the per-match sponsor
// window, this is meant to be dropped into any screen so every partner gets
// visibility, not just whichever one match/week owns the other slots.
export function SponsorStrip() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showManager, setShowManager] = useState(false);

  function load() {
    fetchGeneralSponsors()
      .then(setSponsors)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }

  useEffect(load, []);

  if (!loaded || (sponsors.length === 0 && !isAdmin)) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Nasi sponzori</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {sponsors.map((sponsor) => (
          <SponsorTile key={sponsor.id} sponsor={sponsor} />
        ))}
        {isAdmin ? (
          <TouchableOpacity style={[styles.tile, styles.addTile]} onPress={() => setShowManager(true)}>
            <Ionicons name="add" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {showManager ? (
        <SponsorsManagerModal
          onClose={() => setShowManager(false)}
          onChanged={load}
        />
      ) : null}
    </View>
  );
}

function SponsorTile({ sponsor }: { sponsor: Sponsor }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // The logo image fills the tile edge to edge, cropped to it - there's no separate
  // background layer behind it, so whatever background the logo itself has (black,
  // white, transparent, brand color) just is the tile. Nothing to mismatch.
  return (
    <TouchableOpacity
      style={styles.tile}
      activeOpacity={sponsor.targetUrl ? 0.7 : 1}
      onPress={() => {
        if (sponsor.targetUrl) Linking.openURL(sponsor.targetUrl).catch(() => undefined);
      }}
    >
      <Image source={{ uri: sponsor.logoUrl }} style={styles.logo} resizeMode="cover" onError={() => setFailed(true)} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  row: { flexDirection: "row", gap: 10 },
  tile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden"
  },
  addTile: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted, borderStyle: "dashed" },
  logo: { width: "100%", height: "100%" }
});
