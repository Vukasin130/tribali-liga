import React, { useMemo, useState, useEffect } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { fetchMatchDetail, submitMatchPrediction, updateMatch } from "../api/endpoints";
import type { MatchDetail, MatchPlayerStat } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill, PrimaryButton } from "../components/ui";
import { colors, gradients } from "../theme/colors";
import { kitGradientForTeam } from "../components/PitchPlayerCard";
import { useAuth } from "../state/AuthContext";

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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusLabel(status: string): string {
  if (status === "finished") return "Odigrano";
  if (status === "live") return "U toku";
  if (status === "postponed") return "Odlozeno";
  if (status === "cancelled") return "Otkazano";
  return "Zakazano";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

const STAT_ROWS: { label: string; field: "goals" | "assists" | "shots" | "saves" | "yellowCards" | "redCards" }[] = [
  { label: "Golovi", field: "goals" },
  { label: "Asistencije", field: "assists" },
  { label: "Sutevi", field: "shots" },
  { label: "Odbrane", field: "saves" },
  { label: "Zuti kartoni", field: "yellowCards" },
  { label: "Crveni kartoni", field: "redCards" }
];

const PLAYER_STAT_FIELDS: { label: string; field: "goals" | "assists" | "shots" | "saves" | "yellowCards" | "redCards" }[] = [
  { label: "G", field: "goals" },
  { label: "A", field: "assists" },
  { label: "S", field: "shots" },
  { label: "OD", field: "saves" }
];

type Tab = "detalji" | "sastavi" | "igraci";

export function MatchDetailModal({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState("");
  const [round, setRound] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState("");
  const [tab, setTab] = useState<Tab>("detalji");
  const [playersSide, setPlayersSide] = useState<"home" | "away">("home");

  function load() {
    setLoading(true);
    setError("");
    fetchMatchDetail(matchId)
      .then((data) => {
        setDetail(data);
        setDate(formatDateInput(data.scheduledAt));
        setTime(formatTimeInput(data.scheduledAt));
        setVenue(data.venue || "");
        setRound(data.round ? String(data.round) : "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam utakmicu."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [matchId]);

  useEffect(() => {
    if (detail?.status !== "live") return;
    // Poll for score/event updates while the match is live - the admin's live-scoring
    // panel writes straight to the DB with no push notice to fans watching this screen.
    const interval = setInterval(() => {
      fetchMatchDetail(matchId)
        .then(setDetail)
        .catch(() => undefined);
    }, 15000);
    return () => clearInterval(interval);
  }, [matchId, detail?.status]);

  async function handleSaveMatch() {
    if (!detail) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const payload: Parameters<typeof updateMatch>[1] = {};
      if (date && time) {
        const scheduledAt = new Date(`${date}T${time}:00`);
        if (!Number.isNaN(scheduledAt.getTime())) payload.scheduledAt = scheduledAt.toISOString();
      }
      payload.venue = venue.trim();
      if (round.trim()) payload.round = Number(round);
      const updated = await updateMatch(detail.id, payload);
      setDetail((previous) => (previous ? { ...previous, ...updated } : previous));
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
      setDetail(updated);
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
  const scorerText = (items: typeof events) =>
    items.length ? items.map((event) => `${event.playerName || event.teamName || "Gol"} ${event.minute}'`).join(", ") : "Strelci nisu uneti";

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

  const sidePlayerStats = useMemo(() => {
    if (!detail) return [];
    const teamId = playersSide === "home" ? detail.homeTeamId : detail.awayTeamId;
    return [...playerStats].filter((stat) => stat.teamId === teamId).sort((a, b) => b.fantasyPoints - a.fantasyPoints);
  }, [playerStats, playersSide, detail]);

  const homeGradient = detail ? kitGradientForTeam(detail.homeTeamId) : (["#4a3a14", "#141414"] as const);
  const awayGradient = detail ? kitGradientForTeam(detail.awayTeamId) : (["#4a3a14", "#141414"] as const);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {loading ? <LoadingState label="Ucitavanje utakmice..." /> : null}
        {error ? (
          <View style={styles.errorWrap}>
            <ErrorState message={error} onRetry={load} />
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
                <View style={styles.heroTeam}>
                  <LinearGradient colors={homeGradient} style={styles.heroCrest}>
                    <Text style={styles.heroCrestText}>{initialsOf(detail.homeTeamName)}</Text>
                  </LinearGradient>
                  <Text style={styles.heroTeamName} numberOfLines={2}>{detail.homeTeamName}</Text>
                </View>
                <View style={styles.heroCenter}>
                  <Text style={styles.heroScore}>
                    {isPlayed || isLive ? `${detail.homeScore} : ${detail.awayScore}` : formatTimeInput(detail.scheduledAt) || "vs"}
                  </Text>
                  <Pill label={statusLabel(detail.status)} tone={isLive ? "live" : isPlayed ? "success" : "neutral"} />
                </View>
                <View style={styles.heroTeam}>
                  <LinearGradient colors={awayGradient} style={styles.heroCrest}>
                    <Text style={styles.heroCrestText}>{initialsOf(detail.awayTeamName)}</Text>
                  </LinearGradient>
                  <Text style={styles.heroTeamName} numberOfLines={2}>{detail.awayTeamName}</Text>
                </View>
              </View>
              <Text style={styles.heroMeta}>
                {formatDateTime(detail.scheduledAt)}
                {detail.venue ? ` - ${detail.venue}` : ""}
              </Text>
            </LinearGradient>

            <View style={styles.body}>
              <View style={styles.tabRow}>
                {(["detalji", "sastavi", "igraci"] as Tab[]).map((t) => (
                  <TouchableOpacity key={t} style={[styles.tabButton, tab === t ? styles.tabButtonActive : null]} onPress={() => setTab(t)}>
                    <Text style={[styles.tabButtonText, tab === t ? styles.tabButtonTextActive : null]}>
                      {t === "detalji" ? "Detalji" : t === "sastavi" ? "Sastavi" : "Igraci"}
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
                        <Text style={styles.goalsText}>{scorerText(homeGoals)}</Text>
                      </View>
                      <View style={styles.goalsRow}>
                        <Text style={styles.goalsTeam} numberOfLines={1}>{detail.awayTeamName}</Text>
                        <Text style={styles.goalsText}>{scorerText(awayGoals)}</Text>
                      </View>
                    </Card>
                  ) : null}

                  <View>
                    <Text style={styles.sectionLabel}>Tok meca</Text>
                    {events.length === 0 ? (
                      <EmptyState message={isPlayed ? "Dogadjaji jos nisu uneti u zapisnik." : "Dogadjaji ce se prikazati kada utakmica pocne."} />
                    ) : (
                      events.map((event) => (
                        <View key={event.id} style={styles.timelineRow}>
                          <Text style={styles.timelineMinute}>{event.minute}'</Text>
                          <Text style={styles.timelineText}>{event.text || describeEvent(event)}</Text>
                        </View>
                      ))
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
                        <TextInput style={[styles.adminInput, styles.flex1]} placeholder="GGGG-MM-DD" placeholderTextColor="#9c9186" value={date} onChangeText={setDate} />
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
                  <LineupColumn title={detail.homeTeamShortName || detail.homeTeamName} lineup={homeLineup} />
                  <LineupColumn title={detail.awayTeamShortName || detail.awayTeamName} lineup={awayLineup} />
                </View>
              ) : null}

              {tab === "igraci" ? (
                <View>
                  <View style={styles.sideSwitch}>
                    <TouchableOpacity
                      style={[styles.sideButton, playersSide === "home" ? styles.sideButtonActive : null]}
                      onPress={() => setPlayersSide("home")}
                    >
                      <Text style={[styles.sideButtonText, playersSide === "home" ? styles.sideButtonTextActive : null]} numberOfLines={1}>
                        {detail.homeTeamShortName || detail.homeTeamName}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sideButton, playersSide === "away" ? styles.sideButtonActive : null]}
                      onPress={() => setPlayersSide("away")}
                    >
                      <Text style={[styles.sideButtonText, playersSide === "away" ? styles.sideButtonTextActive : null]} numberOfLines={1}>
                        {detail.awayTeamShortName || detail.awayTeamName}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {sidePlayerStats.length === 0 ? (
                    <EmptyState message="Statistika za ovaj tim jos nije uneta." />
                  ) : (
                    sidePlayerStats.map((stat) => <PlayerStatRow key={stat.id} stat={stat} />)
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>
        ) : null}
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

function PlayerStatRow({ stat }: { stat: MatchPlayerStat }) {
  return (
    <View style={styles.playerStatRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.playerStatName} numberOfLines={1}>{stat.playerName}</Text>
        <Text style={styles.playerStatPosition}>{stat.position || "igrac"}</Text>
      </View>
      <View style={styles.playerStatGrid}>
        {PLAYER_STAT_FIELDS.map((field) => (
          <View key={field.field} style={styles.playerStatCell}>
            <Text style={styles.playerStatCellValue}>{stat[field.field]}</Text>
            <Text style={styles.playerStatCellLabel}>{field.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.playerStatPoints}>{stat.fantasyPoints}</Text>
    </View>
  );
}

function describeEvent(event: MatchDetail["events"][number]): string {
  const label = EVENT_LABELS[event.type] ?? event.type;
  return event.playerName ? `${event.playerName} - ${label}` : label;
}

const EVENT_LABELS: Record<string, string> = {
  goal: "gol",
  assist: "asistencija",
  yellow_card: "zuti karton",
  red_card: "crveni karton",
  substitution: "izmena",
  goalkeeper_save: "odbrana",
  shot_on_target: "sut u okvir",
  two_minutes: "2 minuta",
  foul: "faul",
  kickoff: "pocetak",
  halftime: "poluvreme",
  fulltime: "kraj"
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

function LineupColumn({ title, lineup }: { title: string; lineup: MatchDetail["lineups"] }) {
  const starters = lineup.filter((entry) => entry.isStarter);
  const bench = lineup.filter((entry) => !entry.isStarter);
  return (
    <Card style={styles.lineupColumn}>
      <Text style={styles.lineupTitle}>{title}</Text>
      {starters.length === 0 ? <EmptyState message="Sastav nije unet." /> : null}
      {starters.map((entry) => (
        <View key={entry.id} style={styles.lineupPlayerRow}>
          {entry.shirtNumber ? <Text style={styles.lineupShirt}>{entry.shirtNumber}</Text> : null}
          <Text style={styles.lineupPlayer} numberOfLines={1}>{entry.playerName}</Text>
          {entry.isGoalkeeper ? <Pill label="GK" tone="neutral" /> : null}
        </View>
      ))}
      {bench.length > 0 ? (
        <>
          <Text style={styles.lineupBenchLabel}>Klupa</Text>
          {bench.map((entry) => (
            <View key={entry.id} style={styles.lineupPlayerRow}>
              {entry.shirtNumber ? <Text style={styles.lineupShirt}>{entry.shirtNumber}</Text> : null}
              <Text style={styles.lineupPlayerBench} numberOfLines={1}>{entry.playerName}</Text>
            </View>
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
  heroCrest: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
  heroCrestText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  heroTeamName: { color: "#fff", fontWeight: "800", fontSize: 12, textAlign: "center" },
  heroCenter: { width: 110, alignItems: "center", gap: 6 },
  heroScore: { color: "#fff", fontWeight: "900", fontSize: 28 },
  heroMeta: { color: "rgba(255,255,255,0.8)", fontWeight: "600", fontSize: 12, textAlign: "center" },
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
  goalsText: { color: colors.textMuted, fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" },
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
  sideSwitch: { flexDirection: "row", gap: 8, marginBottom: 12 },
  sideButton: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: "center", backgroundColor: colors.surfaceMuted },
  sideButtonActive: { backgroundColor: colors.ink },
  sideButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  sideButtonTextActive: { color: "#fff" },
  playerStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
    marginBottom: 8
  },
  playerStatName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  playerStatPosition: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  playerStatGrid: { flexDirection: "row", gap: 8 },
  playerStatCell: { width: 24, alignItems: "center" },
  playerStatCellValue: { color: colors.ink, fontWeight: "800", fontSize: 12 },
  playerStatCellLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "700", marginTop: 1 },
  playerStatPoints: { color: colors.purple, fontWeight: "900", fontSize: 15, width: 28, textAlign: "right" },
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
