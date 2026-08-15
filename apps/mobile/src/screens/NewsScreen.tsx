import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  ImageStyle,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  deleteNews,
  fetchCurrentGoalPoll,
  fetchNews,
  fetchSponsor,
  fetchStories,
  finishGoalPoll,
  listLiveMatches,
  setGoalPollStatus,
  voteGoalPoll
} from "../api/endpoints";
import type { GoalPoll, MatchSummary, NewsFeed, NewsItem, Sponsor, StoryFolder } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill, PrimaryButton, SectionTitle } from "../components/ui";
import { colors } from "../theme/colors";
import { wideContentLarge } from "../theme/layout";
import { InlineVideo } from "../components/InlineVideo";
import { StoryViewerModal } from "./StoryViewerModal";
import { NewsDetailModal } from "./NewsDetailModal";
import { NewsComposerModal } from "./NewsComposerModal";
import { StoryComposerModal } from "./StoryComposerModal";
import { GoalPollComposerModal } from "./GoalPollComposerModal";
import { SponsorEditorModal } from "./SponsorEditorModal";
import { LiveMatchesModal } from "./LiveMatchesModal";
import { useAuth } from "../state/AuthContext";
import { useIsWideScreen } from "../hooks/useIsWideScreen";

// Temporarily off at the user's request (Aug 2026) - the feature and all its code/data
// stay intact, this is the only switch. Nothing else needs to change to bring it back;
// flip this back to true when stories development resumes.
const STORIES_ENABLED = false;

export function NewsScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isWide = useIsWideScreen();

  const [news, setNews] = useState<NewsFeed | null>(null);
  const [stories, setStories] = useState<StoryFolder[]>([]);
  const [poll, setPoll] = useState<GoalPoll | null>(null);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [liveMatches, setLiveMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeStoryFolder, setActiveStoryFolder] = useState<number | null>(null);
  const [activeNewsItem, setActiveNewsItem] = useState<NewsItem | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [newsSlide, setNewsSlide] = useState(0);
  const [showNewsComposer, setShowNewsComposer] = useState(false);
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [editingNewsItem, setEditingNewsItem] = useState<NewsItem | null>(null);
  const [showGoalPollComposer, setShowGoalPollComposer] = useState(false);
  const [showSponsorEditor, setShowSponsorEditor] = useState(false);
  const [pollActionLoading, setPollActionLoading] = useState(false);
  const [showLiveMatches, setShowLiveMatches] = useState(false);
  const newsScrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (liveMatches.length === 0) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [liveMatches.length, pulseAnim]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [newsFeed, storyFolders, currentPoll, sponsorData, live] = await Promise.all([
        fetchNews(),
        STORIES_ENABLED ? fetchStories().catch(() => []) : Promise.resolve([]),
        fetchCurrentGoalPoll().catch(() => null),
        fetchSponsor().catch(() => null),
        listLiveMatches().catch(() => [])
      ]);
      setNews(newsFeed);
      setStories(storyFolders);
      setPoll(currentPoll);
      setSponsor(sponsorData);
      setLiveMatches(live);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ne mogu da ucitam vesti.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const featuredCount = news?.featured.length ?? 0;

  useEffect(() => {
    if (featuredCount <= 1 || !carouselWidth) return;
    const timer = setInterval(() => {
      setNewsSlide((prev) => {
        const next = (prev + 1) % featuredCount;
        newsScrollRef.current?.scrollTo({ x: next * carouselWidth, animated: true });
        return next;
      });
    }, 5500);
    return () => clearInterval(timer);
  }, [featuredCount, carouselWidth]);

  function goToNewsSlide(index: number) {
    if (!featuredCount || !carouselWidth) return;
    const clamped = (index + featuredCount) % featuredCount;
    setNewsSlide(clamped);
    newsScrollRef.current?.scrollTo({ x: clamped * carouselWidth, animated: true });
  }

  function handleNewsScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!carouselWidth) return;
    setNewsSlide(Math.round(event.nativeEvent.contentOffset.x / carouselWidth));
  }

  async function handleVote(optionId: string) {
    if (!poll) return;
    try {
      const updated = await voteGoalPoll(poll.id, optionId);
      setPoll(updated);
    } catch {
      // silently ignore - poll UI will just not update
    }
  }

  async function handleDeleteNews(id: string) {
    try {
      await deleteNews(id);
      load();
    } catch {
      // ignore - user can retry from the list
    }
  }

  async function handleClosePoll() {
    if (!poll) return;
    setPollActionLoading(true);
    try {
      const updated = await setGoalPollStatus(poll.id, "closed");
      setPoll(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anketa nije zatvorena.");
    } finally {
      setPollActionLoading(false);
    }
  }

  async function handleReopenPoll() {
    if (!poll) return;
    setPollActionLoading(true);
    try {
      const updated = await setGoalPollStatus(poll.id, "open");
      setPoll(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anketa nije ponovo otvorena.");
    } finally {
      setPollActionLoading(false);
    }
  }

  async function handleFinishPoll(winnerOptionId?: string) {
    if (!poll) return;
    setPollActionLoading(true);
    try {
      const updated = await finishGoalPoll(poll.id, winnerOptionId);
      setPoll(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anketa nije zavrsena.");
    } finally {
      setPollActionLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <LoadingState label="Ucitavanje vesti..." />
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, isWide ? [styles.contentWide, wideContentLarge] : null]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.purple} />}
    >
      <View style={[styles.brandRow, isWide ? styles.brandRowWide : null]}>
        <View style={styles.brandLeft}>
          <Image
            source={require("../../assets/icon.png")}
            style={[styles.brandMark, isWide ? styles.brandMarkWide : null]}
            resizeMode="cover"
          />
          <View>
            {isWide ? (
              <Text style={[styles.brandName, styles.brandNameWide]}>Tribali Liga</Text>
            ) : (
              <>
                <Text style={styles.brandName}>Tribali</Text>
                <Text style={styles.brandName}>Liga</Text>
              </>
            )}
          </View>
        </View>
        <TouchableOpacity style={[styles.liveChip, isWide ? styles.liveChipWide : null]} onPress={() => setShowLiveMatches(true)}>
          {liveMatches.length > 0 ? <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} /> : null}
          <Ionicons name="notifications-outline" size={isWide ? 18 : 14} color={colors.ink} />
          <Text style={[styles.liveChipText, isWide ? styles.liveChipTextWide : null]}>Live</Text>
        </TouchableOpacity>
      </View>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {STORIES_ENABLED && !isWide && (stories.length > 0 || isAdmin) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRow}>
          {isAdmin ? (
            <TouchableOpacity style={styles.storyBubble} onPress={() => setShowStoryComposer(true)}>
              <View style={styles.storyRingAdd}>
                <View style={styles.storyRingInner}>
                  <Ionicons name="add" size={22} color={colors.purple} />
                </View>
              </View>
              <Text style={styles.storyLabel} numberOfLines={1}>Dodaj</Text>
            </TouchableOpacity>
          ) : null}
          {stories.map((folder, index) => (
            <TouchableOpacity key={folder.id} style={styles.storyBubble} onPress={() => setActiveStoryFolder(index)}>
              <LinearGradient colors={["#D9B24C", "#C9A227", "#8A6D1F"]} style={styles.storyRing}>
                <View style={styles.storyRingInner}>
                  <StoryLogo logoUrl={folder.logoUrl} title={folder.title} />
                </View>
              </LinearGradient>
              <Text style={styles.storyLabel} numberOfLines={1}>{folder.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {isAdmin ? (
        <TouchableOpacity style={styles.adminAddNewsButton} onPress={() => setShowNewsComposer(true)}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.adminAddNewsButtonText}>Nova vest</Text>
        </TouchableOpacity>
      ) : null}

      {news && news.featured.length > 0 ? (
        <View
          style={styles.carouselWrap}
          onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
        >
          {carouselWidth > 0 ? (
            <ScrollView
              ref={newsScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleNewsScrollEnd}
            >
              {news.featured.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={{ width: carouselWidth }}
                  activeOpacity={0.92}
                  onPress={() => setActiveNewsItem(item)}
                >
                  <View style={styles.heroCard}>
                    <HeroImage mediaUrl={item.mediaUrl} style={isWide ? styles.heroImageWide : styles.heroImage} />
                    <View style={styles.heroTextBlock}>
                      <Text style={styles.heroDate}>{formatDate(item.publishedAt)}</Text>
                      <Text style={[styles.heroTitle, isWide ? styles.heroTitleWide : null]} numberOfLines={2}>{item.title}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          {featuredCount > 1 ? (
            <>
              <TouchableOpacity
                style={[styles.carouselArrow, styles.carouselArrowLeft]}
                onPress={() => goToNewsSlide(newsSlide - 1)}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.carouselArrow, styles.carouselArrowRight]}
                onPress={() => goToNewsSlide(newsSlide + 1)}
              >
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={styles.carouselDots} pointerEvents="none">
                {news.featured.map((_, index) => (
                  <View key={index} style={[styles.dot, index === newsSlide ? styles.dotActive : null]} />
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {news && news.all.length === 0 ? <EmptyState message="Jos nema objavljenih vesti." /> : null}

      {news && news.latest.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Ostale vesti" />
          <View style={isWide ? styles.newsGrid : undefined}>
            {news.latest.map((item) =>
              isWide ? (
                <TouchableOpacity key={item.id} style={styles.newsGridItem} onPress={() => setActiveNewsItem(item)}>
                  <View style={styles.newsCard}>
                    <NewsThumb mediaUrl={item.mediaUrl} style={styles.newsCardThumb} />
                    <View style={styles.newsCardText}>
                      <Text style={[styles.newsTitleCompact, styles.newsCardTitle]} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.newsMeta}>{formatDate(item.publishedAt)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity key={item.id} onPress={() => setActiveNewsItem(item)}>
                  <View style={styles.newsRow}>
                    <View style={styles.newsRowText}>
                      <Text style={styles.newsTitleCompact} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.newsMeta}>{formatDate(item.publishedAt)}</Text>
                    </View>
                    <NewsThumb mediaUrl={item.mediaUrl} style={styles.newsRowThumb} />
                  </View>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      ) : null}

      {sponsor || isAdmin ? (
        <Card style={styles.sponsorCard}>
          <Text style={styles.sponsorEyebrow}>Sponzor najlepseg gola nedelje</Text>
          {sponsor?.logoUrl ? (
            <TouchableOpacity
              activeOpacity={sponsor.targetUrl ? 0.8 : 1}
              onPress={() => {
                if (sponsor.targetUrl) Linking.openURL(sponsor.targetUrl).catch(() => undefined);
              }}
            >
              <SponsorLogo logoUrl={sponsor.logoUrl} />
            </TouchableOpacity>
          ) : (
            <Text style={styles.pollCopy}>Jos nema podesenog sponzora.</Text>
          )}
          {isAdmin ? (
            <TouchableOpacity style={styles.adminActionButton} onPress={() => setShowSponsorEditor(true)}>
              <Text style={styles.adminActionButtonText}>{sponsor ? "Izmeni sponzora" : "Dodaj sponzora"}</Text>
            </TouchableOpacity>
          ) : null}
        </Card>
      ) : null}

      {poll ? (
        <Card style={styles.pollCard}>
          {poll.status === "closed" ? (
            <GoalPollResult poll={poll} isWide={isWide} />
          ) : (
            <SectionTitle
              eyebrow={poll.status === "tiebreak" ? "Nereseno" : "Glasaj"}
              title={poll.status === "tiebreak" ? "Neresen rezultat" : poll.title}
            />
          )}
          {poll.status === "tiebreak" ? (
            <Text style={styles.pollCopy}>Izjednaceno je vise kandidata. Admin bira konacnog pobednika.</Text>
          ) : poll.status === "open" && poll.copy ? (
            <Text style={styles.pollCopy}>{poll.copy}</Text>
          ) : null}
          {(poll.status === "open" ? poll.options : poll.status === "tiebreak" ? topTiedOptions(poll.options) : []).map((option) => (
            <View key={option.id} style={styles.pollOption}>
              {option.videoUrl ? (
                <PollClipVideo uri={option.videoUrl} isWide={isWide} variant="compact" style={styles.pollOptionVideo} />
              ) : null}
              <View style={styles.pollOptionHead}>
                <Text style={styles.pollOptionName}>{option.title}</Text>
                <Text style={styles.pollOptionPercent}>{option.percent}%</Text>
              </View>
              <View style={styles.pollBarTrack}>
                <View style={[styles.pollBarFill, { width: `${Math.max(4, option.percent)}%` }]} />
              </View>
              {poll.status === "open" ? (
                <PrimaryButton
                  label={poll.userVote === option.id ? "Glasano - ukloni glas" : "Glasaj"}
                  variant={poll.userVote === option.id ? "danger" : "ghost"}
                  onPress={() => handleVote(option.id)}
                />
              ) : null}
              {poll.status === "tiebreak" && isAdmin ? (
                <TouchableOpacity
                  style={styles.adminActionButtonPrimary}
                  onPress={() => handleFinishPoll(option.id)}
                  disabled={pollActionLoading}
                >
                  <Text style={styles.adminActionButtonPrimaryText}>
                    {pollActionLoading ? "Sacekaj..." : `Proglasi "${option.title}" pobednikom`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          <Text style={styles.pollTotal}>{poll.totalVotes} glasova ukupno</Text>

          {isAdmin ? (
            <View style={styles.adminPollActions}>
              {poll.status === "open" ? (
                <TouchableOpacity style={styles.adminActionButton} onPress={handleClosePoll} disabled={pollActionLoading}>
                  <Text style={styles.adminActionButtonText}>{pollActionLoading ? "Sacekaj..." : "Zatvori glasanje"}</Text>
                </TouchableOpacity>
              ) : null}
              {poll.status !== "open" && poll.status !== "closed" ? (
                <TouchableOpacity style={styles.adminActionButton} onPress={handleReopenPoll} disabled={pollActionLoading}>
                  <Text style={styles.adminActionButtonText}>{pollActionLoading ? "Sacekaj..." : "Ponovo otvori"}</Text>
                </TouchableOpacity>
              ) : null}
              {poll.status === "open" ? (
                <TouchableOpacity style={styles.adminActionButtonPrimary} onPress={() => handleFinishPoll()} disabled={pollActionLoading}>
                  <Text style={styles.adminActionButtonPrimaryText}>{pollActionLoading ? "Sacekaj..." : "Zavrsi i proglasi pobednika"}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.adminActionButton} onPress={() => setShowGoalPollComposer(true)}>
                <Text style={styles.adminActionButtonText}>Nova anketa</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Card>
      ) : isAdmin ? (
        <Card style={styles.pollCard}>
          <SectionTitle eyebrow="Gol nedelje" title="Trenutno nema aktivne ankete" />
          <TouchableOpacity style={styles.adminActionButtonPrimary} onPress={() => setShowGoalPollComposer(true)}>
            <Text style={styles.adminActionButtonPrimaryText}>Pokreni novu anketu</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        <Card style={styles.pollCard}>
          <View style={styles.pollComingSoonHead}>
            <SectionTitle eyebrow="Gol nedelje" title="Glasanje uskoro pocinje" />
            <Pill label="Uskoro" tone="warning" />
          </View>
          <View style={styles.pollComingSoonBody}>
            <View style={styles.pollComingSoonIconWrap}>
              <Ionicons name="lock-closed" size={18} color={colors.purple} />
            </View>
            <Text style={styles.pollComingSoonCopy}>
              Anketa za najlepsi gol kola uskoro krece - prati ovaj prostor da ne propustis pocetak glasanja.
            </Text>
          </View>
        </Card>
      )}
    </ScrollView>

    {activeStoryFolder !== null ? (
      <StoryViewerModal
        folders={stories}
        startFolderIndex={activeStoryFolder}
        onClose={() => setActiveStoryFolder(null)}
        isAdmin={isAdmin}
        onDeleted={() => { setActiveStoryFolder(null); load(); }}
      />
    ) : null}

    {showLiveMatches ? <LiveMatchesModal onClose={() => setShowLiveMatches(false)} /> : null}

    {activeNewsItem ? (
      <NewsDetailModal
        item={activeNewsItem}
        onClose={() => setActiveNewsItem(null)}
        onEdit={isAdmin ? () => { setEditingNewsItem(activeNewsItem); setActiveNewsItem(null); } : undefined}
        onDelete={isAdmin ? () => handleDeleteNews(activeNewsItem.id) : undefined}
      />
    ) : null}

    {showNewsComposer ? (
      <NewsComposerModal
        onClose={() => setShowNewsComposer(false)}
        onSaved={() => { setShowNewsComposer(false); load(); }}
      />
    ) : null}

    {editingNewsItem ? (
      <NewsComposerModal
        existingItem={editingNewsItem}
        onClose={() => setEditingNewsItem(null)}
        onSaved={() => { setEditingNewsItem(null); load(); }}
      />
    ) : null}

    {showStoryComposer ? (
      <StoryComposerModal
        onClose={() => setShowStoryComposer(false)}
        onSaved={() => { setShowStoryComposer(false); load(); }}
      />
    ) : null}

    {showGoalPollComposer ? (
      <GoalPollComposerModal
        onClose={() => setShowGoalPollComposer(false)}
        onSaved={() => { setShowGoalPollComposer(false); load(); }}
      />
    ) : null}

    {showSponsorEditor ? (
      <SponsorEditorModal
        sponsor={sponsor}
        onClose={() => setShowSponsorEditor(false)}
        onSaved={() => { setShowSponsorEditor(false); load(); }}
      />
    ) : null}
    </>
  );
}

function StoryLogo({ logoUrl, title }: { logoUrl?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return <Image source={{ uri: logoUrl }} style={styles.storyImage} onError={() => setFailed(true)} />;
  }
  return (
    <View style={styles.storyPlaceholder}>
      <Text style={styles.storyPlaceholderText}>{title.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function HeroImage({ mediaUrl, style }: { mediaUrl?: string; style: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState(false);
  if (mediaUrl && !failed) {
    return <Image source={{ uri: mediaUrl }} style={style} onError={() => setFailed(true)} />;
  }
  return <LinearGradient colors={["#141414", "#C9A227", "#8A6D1F"]} style={style} />;
}

function NewsThumb({ mediaUrl, style }: { mediaUrl?: string; style: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState(false);
  if (mediaUrl && !failed) {
    return <Image source={{ uri: mediaUrl }} style={style} onError={() => setFailed(true)} />;
  }
  return <View style={[style, styles.newsRowThumbPlaceholder]} />;
}

function SponsorLogo({ logoUrl }: { logoUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // The box is a fixed size regardless of which sponsor/logo is set - the logo
  // scales to fit inside it (resizeMode="contain", never cropped or distorted)
  // instead of the box resizing itself to match each logo's own aspect ratio,
  // which used to make the whole card grow or shrink every time the sponsor logo
  // changed.
  return (
    <Image
      source={{ uri: logoUrl }}
      style={styles.sponsorLogo}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

function PollClipVideo({
  uri,
  isWide,
  variant = "hero",
  style
}: {
  uri: string;
  isWide: boolean;
  variant?: "hero" | "compact";
  style?: StyleProp<ViewStyle>;
}) {
  // Goal clips can be portrait (phone-recorded) or landscape (drone/broadcast), in any mix.
  // Sizing the box to the clip's own measured aspect ratio (via aspectRatio) sounds ideal,
  // but expo-video's native VideoView doesn't reliably respect RN's aspectRatio style - on
  // a real device this produced a collapsed, mostly-black column instead of a properly
  // shaped box. A fixed-size box with contentFit="cover" sidesteps that entirely: the box
  // shape never depends on the clip's own ratio, so there's no layout to get wrong,
  // just a fixed banner that crops whatever doesn't fit instead of corrupting the layout.
  const idealHeight = variant === "hero" ? 320 : 160;
  const wideHeight = variant === "hero" ? 520 : 360;
  return (
    <InlineVideo
      uri={uri}
      controls
      contentFit="cover"
      style={[style, { width: "100%", height: isWide ? wideHeight : idealHeight }]}
    />
  );
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("sr-RS", { day: "numeric", month: "short" });
}

function topTiedOptions(options: GoalPoll["options"]): GoalPoll["options"] {
  if (!options.length) return [];
  const topVotes = Math.max(...options.map((option) => option.votes));
  return options.filter((option) => option.votes === topVotes);
}

function GoalPollResult({ poll, isWide }: { poll: GoalPoll; isWide: boolean }) {
  const winner = poll.options.find((option) => option.isWinner) ?? [...poll.options].sort((a, b) => b.percent - a.percent)[0];
  if (!winner) {
    return <SectionTitle eyebrow="Rezultati" title="Anketa je zavrsena" />;
  }
  return (
    <View>
      {winner.videoUrl ? (
        <PollClipVideo key={winner.id} uri={winner.videoUrl} isWide={isWide} style={styles.winnerVideo} />
      ) : null}
      <View style={styles.winnerBanner}>
        <View style={styles.winnerTrophy}>
          <Ionicons name="trophy" size={20} color={colors.yellow} />
        </View>
        <View style={styles.winnerTextBlock}>
          <Text style={styles.winnerEyebrow}>Pobednik najlepseg gola nedelje</Text>
          <Text style={styles.winnerName}>{winner.title}</Text>
          <Text style={styles.winnerMeta}>{winner.votes}/{poll.totalVotes} glasova ({winner.percent}%)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingTop: 58, gap: 16, paddingBottom: 40 },
  contentWide: { paddingHorizontal: 32, paddingTop: 32, gap: 24 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandRowWide: { paddingVertical: 8, marginBottom: 4 },
  adminAddNewsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.purple,
    borderRadius: 14,
    paddingVertical: 12
  },
  adminAddNewsButtonText: { color: "#fff", fontWeight: "700" },
  brandLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#141414" },
  brandMarkWide: { width: 68, height: 68, borderRadius: 34 },
  brandName: { color: colors.ink, fontWeight: "700", fontSize: 14, lineHeight: 16 },
  brandNameWide: { fontSize: 30, lineHeight: 34 },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12
  },
  liveChipWide: { paddingVertical: 12, paddingHorizontal: 20, gap: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveChipText: { color: colors.ink, fontWeight: "600", fontSize: 12 },
  liveChipTextWide: { fontSize: 15 },
  storiesRow: { flexDirection: "row", gap: 14, paddingRight: 8 },
  storyBubble: { alignItems: "center", width: 70 },
  storyRing: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center", padding: 3 },
  storyRingAdd: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.purple
  },
  storyRingInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  storyImage: { width: 54, height: 54, borderRadius: 27 },
  storyPlaceholder: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.purple, alignItems: "center", justifyContent: "center" },
  storyPlaceholderText: { color: "#fff", fontWeight: "700" },
  storyLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: "600" },
  section: { gap: 10 },
  pollCard: { gap: 10 },
  pollCopy: { color: colors.textMuted },
  pollOption: { gap: 6 },
  // Most goal clips are shot portrait on a phone - sizing the box to that shape (and
  // never cropping) instead of forcing a wide, short strip avoids both the "goal is
  // cut off" crop and the "huge empty margins" look a fixed wide box produces.
  pollOptionVideo: { borderRadius: 14, backgroundColor: "#000", marginBottom: 2 },
  pollOptionHead: { flexDirection: "row", justifyContent: "space-between" },
  pollOptionName: { color: colors.textPrimary, fontWeight: "700" },
  pollOptionPercent: { color: colors.pink, fontWeight: "700" },
  pollBarTrack: { height: 8, borderRadius: 999, backgroundColor: colors.surfaceMuted, overflow: "hidden" },
  pollBarFill: { height: 8, borderRadius: 999, backgroundColor: colors.purple },
  pollTotal: { color: colors.textMuted, fontWeight: "600", textAlign: "center" },
  adminPollActions: { gap: 8, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  adminActionButton: {
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted
  },
  adminActionButtonText: { color: colors.purple, fontWeight: "700", fontSize: 13 },
  adminActionButtonPrimary: { alignItems: "center", paddingVertical: 12, borderRadius: 14, backgroundColor: colors.purple },
  adminActionButtonPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  pollComingSoonHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  pollComingSoonBody: { flexDirection: "row", alignItems: "center", gap: 12 },
  pollComingSoonIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  pollComingSoonCopy: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  sponsorCard: { gap: 10 },
  sponsorEyebrow: { color: colors.textMuted, fontWeight: "700", fontSize: 11, textTransform: "uppercase" },
  sponsorLogo: { width: "100%", height: 140, alignSelf: "center" },
  carouselWrap: {
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "#141414",
    shadowColor: "#141414",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  carouselArrow: {
    position: "absolute",
    top: "38%",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center"
  },
  carouselArrowLeft: { left: 10 },
  carouselArrowRight: { right: 10 },
  carouselDots: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.42)" },
  dotActive: { width: 20, backgroundColor: "#fff" },
  heroCard: { backgroundColor: "#141414" },
  heroImage: { width: "100%", height: 190 },
  heroImageWide: { width: "100%", height: 440 },
  heroTextBlock: { padding: 16, gap: 6 },
  heroDate: { color: colors.aqua, fontWeight: "700", fontSize: 12 },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  heroTitleWide: { fontSize: 32 },
  winnerVideo: { borderRadius: 16, marginBottom: 10, backgroundColor: "#000" },
  winnerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(227,178,60,0.14)",
    borderRadius: 16,
    padding: 12
  },
  winnerTrophy: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(227,178,60,0.24)",
    alignItems: "center",
    justifyContent: "center"
  },
  winnerTextBlock: { flex: 1 },
  winnerEyebrow: { color: colors.purple, fontWeight: "700", fontSize: 11, textTransform: "uppercase" },
  winnerName: { color: colors.ink, fontWeight: "700", fontSize: 16, marginTop: 2 },
  winnerMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  newsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14
  },
  newsRowText: { flex: 1, gap: 4 },
  newsTitleCompact: { color: colors.textPrimary, fontWeight: "700", fontSize: 14, lineHeight: 18 },
  newsMeta: { color: colors.textMuted, fontSize: 12 },
  newsRowThumb: { width: 64, height: 64, borderRadius: 12 },
  newsRowThumbPlaceholder: { backgroundColor: colors.surfaceMuted },
  // flex: 1 (not a fixed width) so the row's 3 cards always stretch to share the
  // full available width evenly, flush with both edges, instead of sitting at a
  // fixed size with leftover space on the right when the container is wider.
  newsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  newsGridItem: { flex: 1, minWidth: 260 },
  newsCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden"
  },
  newsCardThumb: { width: "100%", height: 170 },
  newsCardText: { padding: 14, gap: 6 },
  // Reserves space for a full 2 lines regardless of whether this particular title
  // actually wraps to 2 lines - otherwise a short one-line title makes its card
  // shorter than its neighbors and the row's bottom edges fall out of alignment.
  newsCardTitle: { height: 36 }
});
