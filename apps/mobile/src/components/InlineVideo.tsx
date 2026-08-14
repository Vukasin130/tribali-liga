import React, { useRef } from "react";
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";

export function InlineVideo({
  uri,
  style,
  autoPlay = false,
  muted = false,
  loop = false,
  controls = true,
  contentFit = "cover",
  showZoomButton = true
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  contentFit?: "cover" | "contain";
  // The native player's own fullscreen icon can end up buried in an overflow menu on a
  // short inline box (little vertical room for the full control bar) - an always-visible
  // button of our own guarantees zooming in is reachable regardless of how much room the
  // native controls have.
  showZoomButton?: boolean;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    if (autoPlay) instance.play();
  });
  const videoViewRef = useRef<VideoView>(null);

  return (
    <View style={[style, styles.wrap]}>
      <VideoView
        ref={videoViewRef}
        player={player}
        // StyleSheet.absoluteFill alone (just top/left/right/bottom: 0) doesn't stretch a
        // replaced element like <video> on web - without an explicit width/height too, it
        // falls back to the browser's intrinsic default video box (300x150).
        style={[StyleSheet.absoluteFill, styles.fill]}
        nativeControls={controls}
        contentFit={contentFit}
        // expo-video's web VideoView only shows a working fullscreen button when this is
        // explicitly true - despite FullscreenOptions.enable being documented as
        // defaulting to true, the web implementation's actual fallback chain
        // (fullscreenOptions?.enable ?? allowsFullscreen) leaves it falsy - and disabled -
        // when neither prop is passed, which is what this component was doing.
        allowsFullscreen
      />
      {showZoomButton ? (
        <TouchableOpacity
          style={styles.zoomButton}
          onPress={() => videoViewRef.current?.enterFullscreen()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="expand-outline" size={16} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  fill: { width: "100%", height: "100%" },
  zoomButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center"
  }
});
