import type { ViewStyle } from "react-native";

// A modal/screen's content on a wide desktop browser shouldn't stretch edge-to-edge
// like a phone screen, and fixed-height cover images shouldn't stretch into thin crop
// strips either. Spread into a contentContainerStyle/style array gated behind
// useIsWideScreen() - see apps/mobile/src/hooks/useIsWideScreen.ts.
export const wideContent: ViewStyle = {
  maxWidth: 640,
  alignSelf: "center",
  width: "100%"
};

export const wideContentLarge: ViewStyle = {
  maxWidth: 900,
  alignSelf: "center",
  width: "100%"
};
