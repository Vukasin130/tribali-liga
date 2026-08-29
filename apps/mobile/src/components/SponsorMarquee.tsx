import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchGeneralSponsors } from "../api/endpoints";
import type { Sponsor } from "../api/types";
import { colors } from "../theme/colors";

const LOGO_WIDTH = 96;
const LOGO_HEIGHT = 48;
const GAP = 28;
const SPEED_PX_PER_SEC = 36;

// A continuously auto-scrolling strip of all active sponsor logos - the content is
// rendered twice back to back and slid left by exactly one copy's width on a seamless
// loop, so it reads as an endless conveyor belt rather than a single static banner.
export function SponsorMarquee() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [setWidth, setSetWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    fetchGeneralSponsors().then(setSponsors).catch(() => undefined);
  }, []);

  useEffect(() => {
    animationRef.current?.stop();
    if (setWidth === 0) return;
    translateX.setValue(0);
    animationRef.current = Animated.loop(
      Animated.timing(translateX, {
        toValue: -setWidth,
        duration: (setWidth / SPEED_PX_PER_SEC) * 1000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    animationRef.current.start();
    return () => animationRef.current?.stop();
  }, [setWidth, translateX]);

  if (sponsors.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Nasi sponzori</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.trackInner, { transform: [{ translateX }] }]}>
          <View style={styles.set} onLayout={(e) => setSetWidth(e.nativeEvent.layout.width)}>
            {sponsors.map((sponsor) => (
              <SponsorLogo key={sponsor.id} sponsor={sponsor} />
            ))}
          </View>
          <View style={styles.set}>
            {sponsors.map((sponsor) => (
              <SponsorLogo key={`${sponsor.id}-loop`} sponsor={sponsor} />
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function SponsorLogo({ sponsor }: { sponsor: Sponsor }) {
  const [failed, setFailed] = useState(false);
  if (!sponsor.logoUrl || failed) return null;
  // The logo fills its own card edge to edge - no separate background layer behind
  // it, so each sponsor's own logo background (whatever it is) just is the card.
  return (
    <TouchableOpacity
      style={styles.logoWrap}
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
  // Was overlapping the hero gradient with a negative margin and no label at all -
  // just three logos floating with nothing explaining what they were. Now a proper
  // labeled section sitting in the normal (light) body flow, matching the "Nasi
  // sponzori" treatment used everywhere else sponsors appear (see SponsorStrip).
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8
  },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  track: { height: LOGO_HEIGHT, overflow: "hidden" },
  trackInner: { flexDirection: "row" },
  set: { flexDirection: "row", alignItems: "center", paddingHorizontal: GAP / 2 },
  logoWrap: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    marginHorizontal: GAP / 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
    shadowColor: "#141414",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  logo: { width: "100%", height: "100%" }
});
