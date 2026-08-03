import React, { useState, useEffect } from "react";
import { Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCompetitionStandings, fetchLeaders, fetchMatchDetail, submitMatchPrediction, updateMatch } from "../api/endpoints";
import type { LeaderEntry, MatchDetail, StandingGroup } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill, PrimaryButton } from "../components/ui";
import { colors, gradients } from "../theme/colors";
import { TeamCrest } from "../components/TeamCrest";
import { StandingsTable } from "../components/StandingsTable";
import { useAuth } from "../state/AuthContext";
import { computeElapsedSeconds, formatClock, periodLabel } from "../utils/matchClock";
import { TeamProfileModal } from "./TeamProfileModal";
import { PlayerProfileModal } from "./PlayerProfileModal";

type LeaderCategory = "goals" | "assists" | "saves" | "mvp";

const LEADER_SECTIONS: { key: LeaderCategory; label: string; icon: keyof typeof Ionicons.glyphMap; unit: string }[] = [
  { key: "goals", label: "Najbolji strelac", icon: "football", unit: "gol." },
  { key: "assists", label: "Najbolji asistent", icon: "footsteps-outline", unit: "as." },
  { key: "saves", label: "Najbolji golman", icon: "hand-left-outline", unit: "odbr." },
  { key: "mvp", label: "MVP lige", icon: "trophy", unit: "poena" }
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Accepts both GGGG-MM-DD (the field's placeholder) and DD.MM.GGGG (the format
// most people actually type without thinking) - typing the "wrong" one used to
// silently drop the date change while still reporting "saved".
function parseDateInput(value: string): { year: number; month: number; day: number } | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const srb = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(trimmed);
  if (srb) return { year: Number(srb[3]), month: Number(srb[2]), day: Number(srb[1]) };
  return null;
}

function parseTimeInput(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function statusLabel(status: string): string {
  if (status === "finished") return "Odigrano";
  if (status === "live") return "U toku";
  if (status === "postponed") return "Odlozeno";
  if (status === "cancelled") return "Otkazano";
  return "Zakazano";
}

const STAT_ROWS: { label: string; field: "goals" | "assists" | "shots" | "saves" | "yellowCards" | "redCards" }[] = [
  { label: "Golovi", field: "goals" },
  { label: "Asistencije", field: "assists" },
  { label: "Sutevi", field: "shots" },
  { label: "Odbrane", field: "saves" },
  { label: "Zuti kartoni", field: "yellowCards" },
  { label: "Crveni kartoni", field: "redCards" }
];

type Tab = "detalji" | "sastavi" | "tabela";

export function MatchDetailModal({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState("");
  const [round, setRound] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState("");
  const [tab, setTab] = useState<Tab>("detalji");
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [formInitializedFor, setFormInitializedFor] = useState("");
  const [sponsorPhotoFailed, setSponsorPhotoFailed] = useState(false);

  const {
    data: detail,
    isLoading: loading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ["matchDetail", matchId],
    queryFn: () => fetchMatchDetail(matchId),
    // Poll for score/event updates while the match is live - the admin's live-scoring
    // panel writes straight to the DB with no push notice to fans watching this screen.
    refetchInterval: (query) => (query.state.data?.status === "live" ? 15000 : false)
  });
  const error = queryError ? (queryError instanceof Error ? queryError.message : "Ne mogu da ucitam utakmicu.") : "";

  // The admin's date/time/venue/round form fields are only ever initialized from the
  // fetched match once per matchId - never re-synced on the 15s live poll, so an
  // in-progress edit isn't clobbered by a background refetch.
  useEffect(() => {
    if (!detail || formInitializedFor === matchId) return;
    setDate(formatDateInput(detail.scheduledAt));
    setTime(formatTimeInput(detail.scheduledAt));
    setVenue(detail.venue || "");
    setRound(detail.round ? String(detail.round) : "");
    setSponsorPhotoFailed(false);
    setFormInitializedFor(matchId);
  }, [detail, matchId, formInitializedFor]);

  // The live minute is never fetched - it's derived every second from the same
  // period/periodStartedAt the admin's clock uses, so it keeps ticking smoothly
  // between the 15s score/event polls above instead of jumping in steps.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (detail?.status !== "live") return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [detail?.status]);
  const liveSeconds = detail ? computeElapsedSeconds(detail.period, detail.periodStartedAt, detail.halfLengthMinutes, nowTick) : 0;

  async function handleSaveMatch() {
    if (!detail) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const payload: Parameters<typeof updateMatch>[1] = {};
      if (date.trim() || time.trim()) {
        const parsedDate = parseDateInput(date);
        const parsedTime = parseTimeInput(time);
        if (!parsedDate || !parsedTime) {
          setSaveMessage("Datum ili vreme nisu u ispravnom formatu - upisi npr. 2026-08-31 ili 31.08.2026, i 18:00.");
          setSaving(false);
          return;
        }
        const scheduledAt = new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day, parsedTime.hour, parsedTime.minute);
        const valid =
          !Number.isNaN(scheduledAt.getTime()) &&
          parsedDate.month >= 1 && parsedDate.month <= 12 &&
          parsedDate.day >= 1 && parsedDate.day <= 31 &&
          parsedTime.hour <= 23 && parsedTime.minute <= 59;
        if (!valid) {
          setSaveMessage("Datum ili vreme nisu ispravni.");
          setSaving(false);
          return;
        }
        payload.scheduledAt = scheduledAt.toISOString();
      }
      payload.venue = venue.trim();
      if (round.trim()) payload.round = Number(round);
      const updated = await updateMatch(detail.id, payload);
      queryClient.setQueryData<MatchDetail>(["matchDetail", matchId], (previous) =>
        previous ? { ...previous, ...updated } : previous
      );
      setDate(formatDateInput(updated.scheduledAt));
      setTime(formatTimeInput(updated.scheduledAt));
      setSaveMessage("Termin je sacuvan.");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Termin nije sacuvan.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePredict(pick: "home" | "draw" | "away") {
    if (!detail || predicting) return;
    if (!user) {
      setPredictError("Prijavi se da bi glasao za ishod.");
      return;
    }
    setPredicting(true);
    setPredictError("");
    try {
      const updated = await submitMatchPrediction(detail.id, pick);
      queryClient.setQueryData(["matchDetail", matchId], updated);
    } catch (err) {
      setPredictError(err instanceof Error ? err.message : "Glas nije sacuvan.");
    } finally {
      setPredicting(false);
    }
  }

  const homeLineup = detail?.lineups.filter((entry) => entry.teamId === detail.homeTeamId) ?? [];
  const awayLineup = detail?.lineups.filter((entry) => entry.teamId === detail.awayTeamId) ?? [];
  const events = detail ? [...detail.events].sort((a, b) => a.minute - b.minute) : [];
  const isPlayed = detail?.status === "finished";
  const isLive = detail?.status === "live";
  const isScheduled = detail?.status === "scheduled";

  const homeGoals = detail ? events.filter((event) => event.type === "goal" && event.teamId === detail.homeTeamId) : [];
  const awayGoals = detail ? events.filter((event) => event.type === "goal" && event.teamId === detail.awayTeamId) : [];

  const predictions = detail?.predictions ?? {
    home: 0,
    draw: 0,
    away: 0,
    total: 0,
    homePercent: 0,
    drawPercent: 0,
    awayPercent: 0,
    userPick: "" as const
  };

  const playerStats = detail?.playerStats ?? [];
  const sumStat = (teamId: string, field: (typeof STAT_ROWS)[number]["field"]) =>
    playerStats.filter((stat) => stat.teamId === teamId).reduce((total, stat) => total + Number(stat[field] || 0), 0);

  const competitionId = detail?.competitionId;
  const tabelaQuery = useQuery({
    queryKey: ["matchTabela", competitionId],
    queryFn: async () => {
      const [standingsData, ...leaderResponses] = await Promise.all([
        fetchCompetitionStandings(competitionId as string),
        ...LEADER_SECTIONS.map((section) => fetchLeaders(competitionId as string, section.key))
      ]);
      const nextLeaders: Partial<Record<LeaderCategory, LeaderEntry[]>> = {};
      leaderResponses.forEach((response, index) => {
        nextLeaders[LEADER_SECTIONS[index].key] = response.leaders;
      });
      return { standings: standingsData, leaders: nextLeaders };
    },
    enabled: tab === "tabela" && Boolean(competitionId)
  });
  const tabelaLoading = tabelaQuery.isLoading;
  const standings: StandingGroup[] = tabelaQuery.data?.standings ?? [];
  const leaders: Partial<Record<LeaderCategory, LeaderEntry[]>> = tabelaQuery.data?.leaders ?? {};

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {loading ? <LoadingState label="Ucitavanje utakmice..." /> : null}
        {error ? (
          <View style={styles.errorWrap}>
            <ErrorState message={error} onRetry={() => refetch()} />
          </View>
        ) : null}

        {detail ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={gradients.hero} style={styles.hero}>
              <View style={styles.heroTopRow}>
                <TouchableOpacity style={styles.iconButton} onPress={onClose}>
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.heroBadgeText}>
                  {detail.gameweekName || (detail.round ? `Kolo ${detail.round}` : "Utakmica")}
                </Text>
                <View style={styles.iconButton} />
              </View>

              <View style={styles.heroTeamsRow}>
                <TouchableOpacity style={styles.heroTeam} onPress={() => setActiveTeamId(detail.homeTeamId)}>
                  <TeamCrest teamId={detail.homeTeamId} name={detail.homeTeamName} logoUrl={detail.homeTeamLogoUrl} size={52} />
                  <Text style={styles.heroTeamName} numberOfLines={2}>{detail.homeTeamName}</Text>
                </TouchableOpacity>
                <View style={styles.heroCenter}>
                  <Text style={styles.heroScore}>
                    {isPlayed || isLive ? `${detail.homeScore} : ${detail.awayScore}` : formatTimeInput(detail.scheduledAt) || "vs"}
                  </Text>
                  {isLive ? (
                    <View style={styles.liveClockBox}>
                      <View style={styles.liveClockRow}>
                        <View style={styles.livePulse} />
                        <Text style={styles.liveClockLabel}>{periodLabel(detail.period)}</Text>
                      </View>
                      <Text style={styles.liveClockText}>{formatClock(liveSeconds)}</Text>
                    </View>
                  ) : (
                    <Pill label={statusLabel(detail.status)} tone={isPlayed ? "success" : "neutral"} />
                  )}
                </View>
                <TouchableOpacity style={styles.heroTeam} onPress={() => setActiveTeamId(detail.awayTeamId)}>
                  <TeamCrest teamId={detail.awayTeamId} name={detail.awayTeamName} logoUrl={detail.awayTeamLogoUrl} size={52} />
                  <Text style={styles.heroTeamName} numberOfLines={2}>{detail.awayTeamName}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.heroMeta}>
                {formatDateTime(detail.scheduledAt)}
                {detail.venue ? ` - ${detail.venue}` : ""}
              </Text>
            </LinearGradient>

            {detail.sponsor?.logoUrl && !sponsorPhotoFailed ? (
              <TouchableOpacity
                style={styles.sponsorWindow}
                activeOpacity={detail.sponsor.targetUrl ? 0.8 : 1}
                onPress={() => {
                  if (detail.sponsor?.targetUrl) Linking.openURL(detail.sponsor.targetUrl).catch(() => undefined);
                }}
              >
                <Image
                  source={{ uri: detail.sponsor.logoUrl }}
                  style={styles.sponsorWindowLogo}
                  resizeMode="cover"
                  onError={() => setSponsorPhotoFailed(true)}
                />
              </TouchableOpacity>
            ) : null}

            <View style={styles.body}>
              <View style={styles.tabRow}>
                {(["detalji", "sastavi", "tabela"] as Tab[]).map((t) => (
                  <TouchableOpacity key={t} style={[styles.tabButton, tab === t ? styles.tabButtonActive : null]} onPress={() => setTab(t)}>
                    <Text style={[styles.tabButtonText, tab === t ? styles.tabButtonTextActive : null]}>
                      {t === "detalji" ? "Detalji" : t === "sastavi" ? "Sastavi" : "Tabela"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {tab === "detalji" ? (
                <>
                  <View style={styles.infoGrid}>
                    <InfoBox label="Datum" value={formatDateTime(detail.scheduledAt)} />
                    <InfoBox label="Faza" value={detail.gameweekName || detail.phaseName || `Kolo ${detail.round || "-"}`} />
                    <InfoBox label="Status" value={statusLabel(detail.status)} />
                    {detail.venue ? <InfoBox label="Teren" value={detail.venue} /> : null}
                  </View>

                  {isPlayed || isLive ? (
                    <Card style={styles.goalsCard}>
                      <Text style={styles.sectionLabel}>Strelci</Text>
                      <View style={styles.goalsRow}>
                        <Text style={styles.goalsTeam} numberOfLines={1}>{detail.homeTeamName}</Text>
                        <ScorersList goals={homeGoals} onPlayerPress={setActivePlayerId} />
                      </View>
                      <View style={styles.goalsRow}>
                        <Text style={styles.goalsTeam} numberOfLines={1}>{detail.awayTeamName}</Text>
                        <ScorersList goals={awayGoals} onPlayerPress={setActivePlayerId} />
                      </View>
                    </Card>
                  ) : null}

                  <View>
                    <Text style={styles.sectionLabel}>Tok meca</Text>
                    {events.length === 0 ? (
                      <EmptyState message={isPlayed ? "Dogadjaji jos nisu uneti u zapisnik." : "Dogadjaji ce se prikazati kada utakmica pocne."} />
                    ) : (
                      events.map((event) => {
                        const Wrapper = event.playerId ? TouchableOpacity : View;
                        const wrapperProps = event.playerId ? { onPress: () => setActivePlayerId(event.playerId as string) } : {};
                        return event.type === "goal" ? (
                          <Wrapper key={event.id} style={styles.goalMomentRow} {...wrapperProps}>
                            <View style={styles.goalMomentIcon}>
                              <Ionicons name="football" size={18} color="#fff" />
                            </View>
                            <View style={styles.flex1}>
                              <Text style={styles.goalMomentText}>{event.text || describeEvent(event)}</Text>
                              <Text style={styles.goalMomentScore}>{event.scoreHome} : {event.scoreAway}</Text>
                            </View>
                            <Text style={styles.timelineMinute}>{event.minute}'</Text>
                          </Wrapper>
                        ) : (
                          <Wrapper key={event.id} style={styles.timelineRow} {...wrapperProps}>
                            <Text style={styles.timelineMinute}>{event.minute}'</Text>
                            <Ionicons name={EVENT_ICONS[event.type] ?? "ellipse-outline"} size={14} color={colors.textMuted} />
                            <Text style={styles.timelineText}>{event.text || describeEvent(event)}</Text>
                          </Wrapper>
                        );
                      })
                    )}
                  </View>

                  {playerStats.length > 0 ? (
                    <View>
                      <Text style={styles.sectionLabel}>Statistika meca</Text>
                      <Card style={{ gap: 10 }}>
                        {STAT_ROWS.map((row) => {
                          const left = sumStat(detail.homeTeamId, row.field);
                          const right = sumStat(detail.awayTeamId, row.field);
                          const total = left + right;
                          const share = total ? Math.max(8, Math.min(92, Math.round((left / total) * 100))) : 50;
                          return (
                            <View key={row.field} style={styles.statRow}>
                              <Text style={styles.statNumber}>{left}</Text>
                              <View style={styles.statMiddle}>
                                <Text style={styles.statLabel}>{row.label}</Text>
                                <View style={styles.statTrack}>
                                  <View style={[styles.statTrackFill, { width: `${share}%` }]} />
                                </View>
                              </View>
                              <Text style={styles.statNumber}>{right}</Text>
                            </View>
                          );
                        })}
                      </Card>
                    </View>
                  ) : null}

                  {isScheduled ? (
                    <Card style={{ gap: 10 }}>
                      <Text style={styles.sectionLabel}>Ko pobedjuje?</Text>
                      <Text style={styles.flowCopy}>
                        Glasaj za ishod pre pocetka utakmice.{predictions.total ? ` ${predictions.total} glas${predictions.total === 1 ? "" : "ova"}.` : ""}
                      </Text>
                      <View style={styles.predictRow}>
                        <PredictOption
                          label="1"
                          sub={detail.homeTeamShortName || detail.homeTeamName}
                          percent={predictions.homePercent}
                          active={predictions.userPick === "home"}
                          disabled={predicting}
                          onPress={() => handlePredict("home")}
                        />
                        <PredictOption
                          label="X"
                          sub="Nereseno"
                          percent={predictions.drawPercent}
                          active={predictions.userPick === "draw"}
                          disabled={predicting}
                          onPress={() => handlePredict("draw")}
                        />
                        <PredictOption
                          label="2"
                          sub={detail.awayTeamShortName || detail.awayTeamName}
                          percent={predictions.awayPercent}
                          active={predictions.userPick === "away"}
                          disabled={predicting}
                          onPress={() => handlePredict("away")}
                        />
                      </View>
                      {predictError ? <Text style={styles.adminMessage}>{predictError}</Text> : null}
                    </Card>
                  ) : null}

                  {isAdmin ? (
                    <Card style={{ gap: 10 }}>
                      <Text style={styles.sectionLabel}>Admin - termin utakmice</Text>
                      <View style={styles.adminRow}>
                        <TextInput style={[styles.adminInput, styles.flex1]} placeholder="DD.MM.GGGG" placeholderTextColor="#9c9186" value={date} onChangeText={setDate} />
                        <TextInput style={[styles.adminInput, styles.flex1]} placeholder="HH:mm" placeholderTextColor="#9c9186" value={time} onChangeText={setTime} />
                      </View>
                      <View style={styles.adminRow}>
                        <TextInput style={[styles.adminInput, styles.flex1]} placeholder="Teren / lokacija" placeholderTextColor="#9c9186" value={venue} onChangeText={setVenue} />
                        <TextInput
                          style={[styles.adminInput, styles.roundInput]}
                          placeholder="Kolo"
                          placeholderTextColor="#9c9186"
                          keyboardType="number-pad"
                          value={round}
                          onChangeText={setRound}
                        />
                      </View>
                      {saveMessage ? <Text style={styles.adminMessage}>{saveMessage}</Text> : null}
                      <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj termin"} onPress={handleSaveMatch} loading={saving} />
                    </Card>
                  ) : null}
                </>
              ) : null}

              {tab === "sastavi" ? (
                <View style={styles.lineupsRow}>
                  <LineupColumn
                    title={detail.homeTeamShortName || detail.homeTeamName}
                    lineup={homeLineup}
                    onTeamPress={() => setActiveTeamId(detail.homeTeamId)}
                    onPlayerPress={setActivePlayerId}
                  />
                  <LineupColumn
                    title={detail.awayTeamShortName || detail.awayTeamName}
                    lineup={awayLineup}
                    onTeamPress={() => setActiveTeamId(detail.awayTeamId)}
                    onPlayerPress={setActivePlayerId}
                  />
                </View>
              ) : null}

              {tab === "tabela" ? (
                <View style={{ gap: 16 }}>
                  {tabelaLoading ? <LoadingState label="Ucitavanje tabele..." /> : null}
                  {!tabelaLoading && standings.length === 0 ? <EmptyState message="Tabela jos nije dostupna." /> : null}
                  {standings.map((group) => (
                    <StandingsTable key={group.name} groupName={group.name} rows={group.rows} onTeamPress={setActiveTeamId} />
                  ))}

                  {!tabelaLoading
                    ? LEADER_SECTIONS.map((section) => {
                        const entries = (leaders[section.key] ?? []).slice(0, 3);
                        if (entries.length === 0) return null;
                        return (
                          <View key={section.key}>
                            <View style={styles.sectionHeader}>
                              <Ionicons name={section.icon} size={15} color={colors.purple} />
                              <Text style={styles.sectionLabel}>{section.label}</Text>
                            </View>
                            <Card style={styles.leadersCard}>
                              {entries.map((entry, index) => (
                                <TouchableOpacity
                                  key={entry.playerId}
                                  style={[styles.leaderRow, index > 0 ? styles.leaderRowDivider : null]}
                                  onPress={() => setActivePlayerId(entry.playerId)}
                                >
                                  <Text style={styles.leaderRank}>{entry.rank}</Text>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.leaderName} numberOfLines={1}>{entry.playerName}</Text>
                                    <Text style={styles.leaderTeam} numberOfLines={1}>{entry.teamShortName || entry.teamName}</Text>
                                  </View>
                                  <Text style={styles.leaderValue}>{entry.value} {section.unit}</Text>
                                </TouchableOpacity>
                              ))}
                            </Card>
                          </View>
                        );
                      })
                    : null}
                </View>
              ) : null}
            </View>
          </ScrollView>
        ) : null}

        {activeTeamId ? <TeamProfileModal teamId={activeTeamId} onClose={() => setActiveTeamId(null)} /> : null}
        {activePlayerId ? <PlayerProfileModal playerId={activePlayerId} onClose={() => setActivePlayerId(null)} /> : null}
      </View>
    </Modal>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ScorersList({ goals, onPlayerPress }: { goals: MatchDetail["events"]; onPlayerPress: (playerId: string) => void }) {
  if (goals.length === 0) return <Text style={styles.goalsText}>Strelci nisu uneti</Text>;
  return (
    <View style={styles.scorersWrap}>
      {goals.map((event, index) => (
        <React.Fragment key={event.id}>
          {index > 0 ? <Text style={styles.goalsText}>, </Text> : null}
          {event.playerId ? (
            <TouchableOpacity onPress={() => onPlayerPress(event.playerId as string)}>
              <Text style={styles.scorerLink}>{event.playerName || "Gol"} {event.minute}'</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.goalsText}>{event.playerName || event.teamName || "Gol"} {event.minute}'</Text>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function describeEvent(event: MatchDetail["events"][number]): string {
  const label = EVENT_LABELS[event.type] ?? event.type;
  return event.playerName ? `${event.playerName} - ${label}` : label;
}

const EVENT_LABELS: Record<string, string> = {
  goal: "Gol",
  assist: "Asistencija",
  yellow_card: "Zuti karton",
  red_card: "Crveni karton",
  substitution: "Izmena",
  goalkeeper_save: "Odbrana",
  shot_on_target: "Sut u okvir",
  two_minutes: "2 minuta",
  foul: "Faul",
  kickoff: "Pocetak utakmice",
  halftime: "Kraj prvog poluvremena",
  second_half: "Pocetak drugog poluvremena",
  fulltime: "Kraj utakmice"
};

const EVENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  yellow_card: "square",
  red_card: "square",
  substitution: "swap-horizontal",
  goalkeeper_save: "hand-left-outline",
  shot_on_target: "disc-outline",
  two_minutes: "time-outline",
  foul: "warning-outline",
  kickoff: "play-circle-outline",
  halftime: "pause-circle-outline",
  second_half: "play-circle-outline",
  fulltime: "flag-outline"
};

function PredictOption({
  label,
  sub,
  percent,
  active,
  disabled,
  onPress
}: {
  label: string;
  sub: string;
  percent: number;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.predictOption, active ? styles.predictOptionActive : null]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.predictLabel, active ? styles.predictLabelActive : null]}>{label}</Text>
      <Text style={[styles.predictSub, active ? styles.predictSubActive : null]} numberOfLines={1}>
        {sub}
      </Text>
      <View style={styles.predictTrack}>
        <View style={[styles.predictTrackFill, { width: `${percent}%` }, active ? styles.predictTrackFillActive : null]} />
      </View>
      <Text style={[styles.predictPercent, active ? styles.predictPercentActive : null]}>{percent}%</Text>
    </TouchableOpacity>
  );
}

function LineupColumn({
  title,
  lineup,
  onTeamPress,
  onPlayerPress
}: {
  title: string;
  lineup: MatchDetail["lineups"];
  onTeamPress: () => void;
  onPlayerPress: (playerId: string) => void;
}) {
  const starters = lineup.filter((entry) => entry.isStarter);
  const bench = lineup.filter((entry) => !entry.isStarter);
  return (
    <Card style={styles.lineupColumn}>
      <TouchableOpacity onPress={onTeamPress}>
        <Text style={styles.lineupTitle}>{title}</Text>
      </TouchableOpacity>
      {starters.length === 0 ? <EmptyState message="Sastav nije unet." /> : null}
      {starters.map((entry) => (
        <TouchableOpacity key={entry.id} style={styles.lineupPlayerRow} onPress={() => onPlayerPress(entry.playerId)}>
          {entry.shirtNumber ? <Text style={styles.lineupShirt}>{entry.shirtNumber}</Text> : null}
          <Text style={styles.lineupPlayer} numberOfLines={1}>{entry.playerName}</Text>
          {entry.isGoalkeeper ? <Pill label="GK" tone="neutral" /> : null}
        </TouchableOpacity>
      ))}
      {bench.length > 0 ? (
        <>
          <Text style={styles.lineupBenchLabel}>Klupa</Text>
          {bench.map((entry) => (
            <TouchableOpacity key={entry.id} style={styles.lineupPlayerRow} onPress={() => onPlayerPress(entry.playerId)}>
              {entry.shirtNumber ? <Text style={styles.lineupShirt}>{entry.shirtNumber}</Text> : null}
              <Text style={styles.lineupPlayerBench} numberOfLines={1}>{entry.playerName}</Text>
            </TouchableOpacity>
          ))}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  errorWrap: { padding: 20, paddingTop: 60 },
  content: { paddingBottom: 60 },
  hero: {
    paddingTop: 54,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    gap: 6
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 10 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center"
  },
  heroBadgeText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  heroTeamsRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  heroTeam: { flex: 1, alignItems: "center", gap: 6 },
  heroTeamName: { color: "#fff", fontWeight: "800", fontSize: 12, textAlign: "center" },
  heroCenter: { width: 110, alignItems: "center", gap: 6 },
  heroScore: { color: "#fff", fontWeight: "900", fontSize: 28 },
  heroMeta: { color: "rgba(255,255,255,0.8)", fontWeight: "600", fontSize: 12, textAlign: "center" },
  liveClockBox: { alignItems: "center", gap: 2 },
  liveClockRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  livePulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
  liveClockLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "700", fontSize: 10, textTransform: "uppercase" },
  liveClockText: { color: "#fff", fontWeight: "900", fontSize: 20, fontVariant: ["tabular-nums"] },
  sponsorWindow: {
    marginHorizontal: 20,
    marginTop: -14,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    shadowColor: "#141414",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  sponsorWindowLogo: { width: "100%", height: "100%" },
  goalMomentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(201,162,39,0.1)",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.3)",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8
  },
  goalMomentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center"
  },
  goalMomentText: { color: colors.ink, fontWeight: "800", fontSize: 13 },
  goalMomentScore: { color: colors.textMuted, fontWeight: "700", fontSize: 11, marginTop: 1 },
  body: { padding: 20, paddingTop: 16, gap: 16 },
  tabRow: { flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 4, gap: 4 },
  tabButton: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center" },
  tabButtonActive: { backgroundColor: "#fff", shadowColor: "#141414", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  tabButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  tabButtonTextActive: { color: colors.ink },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  infoBox: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10
  },
  infoLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 4 },
  infoValue: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  sectionLabel: { color: colors.ink, fontWeight: "900", fontSize: 15, marginBottom: 10 },
  goalsCard: { gap: 8 },
  goalsRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  goalsTeam: { color: colors.ink, fontWeight: "800", fontSize: 12, flexShrink: 0, maxWidth: "35%" },
  goalsText: { color: colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "right" },
  scorersWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" },
  scorerLink: { color: colors.purple, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  flowCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  timelineRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8
  },
  timelineMinute: {
    color: "#fff",
    backgroundColor: colors.purple,
    fontWeight: "800",
    fontSize: 11,
    width: 36,
    height: 28,
    borderRadius: 10,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden"
  },
  timelineText: { flex: 1, color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statNumber: { width: 24, color: colors.ink, fontWeight: "800", fontSize: 12, textAlign: "center" },
  statMiddle: { flex: 1, gap: 4 },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", textAlign: "center" },
  statTrack: { height: 8, borderRadius: 999, backgroundColor: colors.surfaceMuted, overflow: "hidden" },
  statTrackFill: { height: 8, borderRadius: 999, backgroundColor: colors.purple },
  predictRow: { flexDirection: "row", gap: 8 },
  predictOption: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 6
  },
  predictOptionActive: { backgroundColor: "rgba(201,162,39,0.08)", borderColor: colors.purple },
  predictLabel: { color: colors.ink, fontWeight: "900", fontSize: 16 },
  predictLabelActive: { color: colors.purple },
  predictSub: { color: colors.textMuted, fontSize: 11, fontWeight: "700", textAlign: "center" },
  predictSubActive: { color: colors.purple },
  predictTrack: { width: "100%", height: 6, borderRadius: 999, backgroundColor: colors.line, overflow: "hidden" },
  predictTrackFill: { height: 6, borderRadius: 999, backgroundColor: colors.textMuted },
  predictTrackFillActive: { backgroundColor: colors.purple },
  predictPercent: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  predictPercentActive: { color: colors.purple },
  lineupsRow: { flexDirection: "row", gap: 12 },
  lineupColumn: { flex: 1, gap: 6 },
  lineupTitle: { color: colors.purple, fontWeight: "800", fontSize: 12, marginBottom: 4, textTransform: "uppercase" },
  lineupPlayerRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  lineupShirt: { width: 18, color: colors.textMuted, fontWeight: "800", fontSize: 11 },
  lineupPlayer: { flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  lineupPlayerBench: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  lineupBenchLabel: { color: colors.textMuted, fontWeight: "800", fontSize: 10, textTransform: "uppercase", marginTop: 8, marginBottom: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  leadersCard: { gap: 0 },
  leaderRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  leaderRowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  leaderRank: { width: 18, color: colors.textMuted, fontWeight: "800", fontSize: 12, textAlign: "center" },
  leaderName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  leaderTeam: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  leaderValue: { color: colors.purple, fontWeight: "900", fontSize: 13 },
  adminRow: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  roundInput: { width: 80 },
  adminInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 13
  },
  adminMessage: { color: colors.purple, fontWeight: "700", fontSize: 12, textAlign: "center" }
});
