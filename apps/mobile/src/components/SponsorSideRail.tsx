import React, { useEffect, useState } from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { fetchGeneralSponsors } from "../api/endpoints";
import type { Sponsor } from "../api/types";
import { colors } from "../theme/colors";

const RAIL_WIDTH = 160;
const MIN_CONTENT_WIDTH = 760;

// apps/desktop's DesktopShell already puts a sponsor rail down each side of the app -
// but a full-screen Modal (every *Modal.tsx screen, including this one's caller) paints
// over the whole viewport and hides those rails while it's open, leaving wide desktop
// windows looking mostly empty around a narrow centered card. This is the same rail
// treatment, read-only (no admin edit-on-tap - that's already reachable from the
// screens underneath), meant to be dropped in as a sibling of a modal's own
// ScrollView so the gutters don't go bare just because a modal is on top.
export function SponsorSideRail() {
  const { width } = useWindowDimensions();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    fetchGeneralSponsors().then(setSponsors).catch(() => undefined);
  }, []);

  if (width < MIN_CONTENT_WIDTH + RAIL_WIDTH * 2 || sponsors.length === 0) return null;

  return (
    <View style={styles.rail}>
      <Text style={styles.label}>Sponzori</Text>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {sponsors.map((sponsor) => (
          <RailTile key={sponsor.id} sponsor={sponsor} />
        ))}
      </ScrollView>
    </View>
  );
}

function RailTile({ sponsor }: { sponsor: Sponsor }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
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
  // Same paddingTop as DesktopShell's own rail (and apps/desktop/SponsorRail.tsx) so
  // the "Sponzori" label lines up with where it sits on every other screen, instead
  // of a modal's own hero pushing its top row further down than the rails expect.
  rail: { width: RAIL_WIDTH, alignItems: "center", paddingTop: 24 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 },
  list: { alignItems: "center", gap: 14, paddingBottom: 40 },
  tile: {
    width: 96,
    height: 96,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
    shadowColor: "#141414",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  logo: { width: "100%", height: "100%" }
});
