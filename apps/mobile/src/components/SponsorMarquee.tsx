import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Linking, StyleSheet, TouchableOpacity, View } from "react-native";
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
      <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
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
  );
}

function SponsorLogo({ sponsor }: { sponsor: Sponsor }) {
  const [failed, setFailed] = useState(false);
  if (!sponsor.logoUrl || failed) return null;
  // Each logo gets its own card instead of one shared bar behind all of them - the
  // strip can be scrolling several sponsors at once, and a single shared background
  // can't be right for both a white-background logo and a black-background one at
  // the same time.
  const dark = sponsor.logoBackground === "dark";
  return (
    <TouchableOpacity
      style={[styles.logoWrap, dark ? styles.logoWrapDark : null]}
      activeOpacity={sponsor.targetUrl ? 0.7 : 1}
      onPress={() => {
        if (sponsor.targetUrl) Linking.openURL(sponsor.targetUrl).catch(() => undefined);
      }}
    >
      <Image source={{ uri: sponsor.logoUrl }} style={styles.logo} resizeMode="contain" onError={() => setFailed(true)} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: LOGO_HEIGHT,
    marginHorizontal: 20,
    marginTop: -14,
    overflow: "hidden"
  },
  track: { flexDirection: "row" },
  set: { flexDirection: "row", alignItems: "center", paddingHorizontal: GAP / 2 },
  logoWrap: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    marginHorizontal: GAP / 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 8,
    shadowColor: "#141414",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  logoWrapDark: { backgroundColor: colors.ink, borderColor: colors.ink },
  logo: { width: "100%", height: "100%" }
});
