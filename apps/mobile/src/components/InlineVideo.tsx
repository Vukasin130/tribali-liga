import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

export function InlineVideo({
  uri,
  style,
  autoPlay = false,
  muted = false,
  loop = false,
  controls = true
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    if (autoPlay) instance.play();
  });

  return <VideoView player={player} style={style} nativeControls={controls} contentFit="cover" />;
}
