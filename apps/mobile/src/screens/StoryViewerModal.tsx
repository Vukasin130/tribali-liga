import React, { useEffect, useRef, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { deleteStory, fetchStoryStats, markStoryViewed, toggleStoryLike } from "../api/endpoints";
import type { StoryFolder, StoryStats } from "../api/types";
import { colors } from "../theme/colors";
import { useIsWideScreen } from "../hooks/useIsWideScreen";

function StoryVideo({
  uri,
  paused,
  onProgress,
  onFinish
}: {
  uri: string;
  paused: boolean;
  onProgress: (ratio: number) => void;
  onFinish: () => void;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.timeUpdateEventInterval = 0.25;
  });

  useEffect(() => {
    // Started here (post-mount) rather than in the useVideoPlayer setup callback,
    // since on web the setup callback can fire before VideoView has mounted a
    // <video> element for the player to control, silently no-oping play().
    player.play();
    const timeSub = player.addListener("timeUpdate", (payload: { currentTime: number }) => {
      const duration = player.duration || 0;
      if (duration > 0) onProgress(Math.min(1, payload.currentTime / duration));
    });
    const endSub = player.addListener("playToEnd", () => onFinish());
    return () => {
      timeSub.remove();
      endSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  return <VideoView player={player} style={styles.media} contentFit="cover" nativeControls={false} />;
}

const STORY_DURATION_MS = 5000;

export function StoryViewerModal({
  folders,
  startFolderIndex,
  onClose,
  isAdmin,
  onDeleted
}: {
  folders: StoryFolder[];
  startFolderIndex: number;
  onClose: () => void;
  isAdmin?: boolean;
  onDeleted?: () => void;
}) {
  const [folderIndex, setFolderIndex] = useState(startFolderIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<StoryStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const isWide = useIsWideScreen();

  const folder = folders[folderIndex];
  const story = folder?.stories[storyIndex];

  useEffect(() => {
    setStoryIndex(0);
    setProgress(0);
  }, [folderIndex]);

  useEffect(() => {
    if (!story) return;
    setProgress(0);
    setShowStats(false);
    setStats(null);
    setPhotoFailed(false);
    if (!seenRef.current.has(story.id)) {
      seenRef.current.add(story.id);
      markStoryViewed(story.id).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderIndex, storyIndex]);

  useEffect(() => {
    if (!story || story.mediaType === "video") return;

    const startedAt = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (showStats) return;
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(1, elapsed / STORY_DURATION_MS);
      setProgress(ratio);
      if (ratio >= 1) advance(1);
    }, 60);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderIndex, storyIndex, showStats]);

  function advance(direction: 1 | -1) {
    if (!folder) return;
    const nextStoryIndex = storyIndex + direction;
    if (nextStoryIndex >= 0 && nextStoryIndex < folder.stories.length) {
      setStoryIndex(nextStoryIndex);
      return;
    }
    const nextFolderIndex = folderIndex + direction;
    if (nextFolderIndex >= 0 && nextFolderIndex < folders.length) {
      setFolderIndex(nextFolderIndex);
      setStoryIndex(direction === 1 ? 0 : (folders[nextFolderIndex]?.stories.length ?? 1) - 1);
      return;
    }
    onClose();
  }

  async function handleLike() {
    if (!story) return;
    try {
      const result = await toggleStoryLike(story.id);
      setLiked((previous) => ({ ...previous, [story.id]: result.liked }));
    } catch {
      // ignore - like is a non-critical action
    }
  }

  async function handleShowStats() {
    if (!story) return;
    setShowStats(true);
    setStatsLoading(true);
    try {
      const data = await fetchStoryStats(story.id);
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }

  async function handleDelete() {
    if (!story) return;
    setDeleting(true);
    try {
      await deleteStory(story.id);
      onDeleted?.();
      onClose();
    } catch {
      setDeleting(false);
    }
  }

  if (!folder || !story) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
      <View style={[styles.screen, isWide ? styles.screenWide : null]}>
        <View style={styles.progressRow}>
          {folder.stories.map((item, index) => (
            <View key={item.id} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: index < storyIndex ? "100%" : index === storyIndex ? `${progress * 100}%` : "0%" }
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.mediaWrap}>
          {story.mediaType === "video" ? (
            <StoryVideo key={story.id} uri={story.mediaUrl} paused={showStats} onProgress={setProgress} onFinish={() => advance(1)} />
          ) : !photoFailed ? (
            <Image
              source={{ uri: story.mediaUrl }}
              style={styles.media}
              resizeMode="cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <View style={[styles.media, styles.mediaFallback]}>
              <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.4)" />
            </View>
          )}
        </View>

        <View style={styles.tapZones}>
          <TouchableOpacity style={styles.tapZone} onPress={() => advance(-1)} />
          <TouchableOpacity style={styles.tapZone} onPress={() => advance(1)} />
        </View>

        <View style={styles.header}>
          <Text style={styles.folderTitle}>{folder.title}</Text>
          <View style={styles.headerActions}>
            {isAdmin ? (
              <>
                <TouchableOpacity onPress={handleShowStats} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="stats-chart-outline" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} disabled={deleting} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeButton}>Zatvori</Text>
            </TouchableOpacity>
          </View>
        </View>

        {story.title ? (
          <View style={styles.captionBox}>
            <Text style={styles.caption}>{story.title}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <TouchableOpacity style={styles.likeButton} onPress={handleLike}>
            <Text style={styles.likeIcon}>{liked[story.id] ? "♥" : "♡"}</Text>
            <Text style={styles.likeLabel}>{liked[story.id] ? "Svidja mi se" : "Svidja mi se"}</Text>
          </TouchableOpacity>
        </View>

        {showStats ? (
          <View style={styles.statsOverlay}>
            <View style={styles.statsPanel}>
              <View style={styles.statsPanelHead}>
                <Text style={styles.statsPanelTitle}>Statistika storija</Text>
                <TouchableOpacity onPress={() => setShowStats(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={20} color={colors.ink} />
                </TouchableOpacity>
              </View>
              {statsLoading ? (
                <Text style={styles.statsMeta}>Ucitavanje...</Text>
              ) : (
                <>
                  <View style={styles.statsCountsRow}>
                    <View style={styles.statsCountBox}>
                      <Text style={styles.statsCountNumber}>{stats?.views.length ?? 0}</Text>
                      <Text style={styles.statsCountLabel}>Pregleda</Text>
                    </View>
                    <View style={styles.statsCountBox}>
                      <Text style={styles.statsCountNumber}>{stats?.likes.length ?? 0}</Text>
                      <Text style={styles.statsCountLabel}>Lajkova</Text>
                    </View>
                  </View>
                  <ScrollView style={styles.statsList}>
                    {(stats?.views ?? []).map((entry) => (
                      <Text key={entry.id} style={styles.statsListItem}>
                        {entry.displayName || entry.email || "Korisnik"}
                      </Text>
                    ))}
                    {stats && stats.views.length === 0 ? <Text style={styles.statsMeta}>Jos niko nije pogledao.</Text> : null}
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        ) : null}
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000", alignItems: "center" },
  screen: { flex: 1, width: "100%", backgroundColor: "#000" },
  screenWide: { width: 420, maxWidth: "100%" },
  progressRow: { flexDirection: "row", gap: 4, paddingTop: 54, paddingHorizontal: 10 },
  progressTrack: { flex: 1, height: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#fff" },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14
  },
  folderTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  closeButton: { color: "#fff", fontWeight: "800", opacity: 0.8 },
  statsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  statsPanel: { width: "100%", maxHeight: "70%", backgroundColor: "#fff", borderRadius: 20, padding: 18, gap: 12 },
  statsPanelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statsPanelTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  statsMeta: { color: colors.textMuted, fontWeight: "600" },
  statsCountsRow: { flexDirection: "row", gap: 12 },
  statsCountBox: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  statsCountNumber: { color: colors.ink, fontWeight: "900", fontSize: 22 },
  statsCountLabel: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  statsList: { maxHeight: 180 },
  statsListItem: { color: colors.textPrimary, fontWeight: "600", fontSize: 13, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  mediaWrap: { flex: 1, marginTop: 10 },
  media: { flex: 1, width: "100%" },
  mediaFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#141414" },
  captionBox: { position: "absolute", left: 14, right: 14, bottom: 90 },
  caption: { color: "#fff", fontWeight: "700", fontSize: 15, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 },
  tapZones: { position: "absolute", top: 90, bottom: 70, left: 0, right: 0, flexDirection: "row" },
  tapZone: { flex: 1 },
  footer: { paddingHorizontal: 14, paddingBottom: 30, paddingTop: 8, alignItems: "flex-start" },
  likeButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  likeIcon: { color: "#fff", fontSize: 18 },
  likeLabel: { color: "#fff", fontWeight: "700", fontSize: 13 }
});
