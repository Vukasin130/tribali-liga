import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fetchGeneralSponsors, useAuth, type Sponsor } from "@tribali-liga/mobile/shared";
import { SponsorRail } from "./SponsorRail";
import { VerificationsModal } from "../screens/VerificationsModal";

// Content grows to fill the available width (up to a comfortable reading cap) instead
// of sitting in a fixed phone-width column - individual screens then adapt their own
// layout (grids, larger hero art, etc.) once they detect they have real room to work
// with. Side rails only show once there's enough space left over for them to make sense.
const CONTENT_MAX_WIDTH = 1200;
const CONTENT_MIN_WIDTH = 760;
const RAIL_WIDTH = 160;

export function DesktopShell({ children }: { children: React.ReactNode }) {
  // Percentage heights only resolve if every ancestor up the chain has a settled
  // size, and that chain (SafeAreaProvider -> Expo's web root div) isn't reliable
  // here - so measure the real viewport and size this container in pixels instead
  // of leaning on inherited flex/percentage sizing.
  const { width, height } = useWindowDimensions();
  const { status, user } = useAuth();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [showVerifications, setShowVerifications] = useState(false);

  function reloadSponsors() {
    fetchGeneralSponsors().then(setSponsors).catch(() => undefined);
  }

  useEffect(reloadSponsors, []);

  // Sponsor visibility is a reward for people already inside the app, not something
  // to show a stranger sitting at the login screen - only render the rails once
  // they've actually signed in.
  const showRails = status === "signed-in" && width >= CONTENT_MIN_WIDTH + RAIL_WIDTH * 2;

  // Same full list on both sides - maximizes exposure per sponsor instead of
  // splitting a short list in half and leaving one rail looking empty.
  return (
    <View style={[styles.root, { width, height }]}>
      {showRails ? <SponsorRail sponsors={sponsors} onChanged={reloadSponsors} /> : null}
      <View style={styles.content}>{children}</View>
      {showRails ? <SponsorRail sponsors={sponsors} onChanged={reloadSponsors} /> : null}

      {/* Admin-only, desktop-only entry point - deliberately not part of the shared
          RootNavigator/tab bar, so this never surfaces in the mobile app. */}
      {status === "signed-in" && user?.role === "admin" ? (
        <TouchableOpacity style={styles.adminButton} onPress={() => setShowVerifications(true)}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
          <Text style={styles.adminButtonText}>Verifikacije</Text>
        </TouchableOpacity>
      ) : null}

      {showVerifications ? <VerificationsModal onClose={() => setShowVerifications(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", justifyContent: "center", backgroundColor: colors.background },
  content: { flex: 1, maxWidth: CONTENT_MAX_WIDTH, height: "100%" },
  adminButton: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    shadowColor: "#141414",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 50
  },
  adminButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 }
});
