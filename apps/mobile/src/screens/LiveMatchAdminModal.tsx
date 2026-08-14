import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  addMatchEvent,
  createGeneralSponsor,
  createMatch,
  fetchCompetitionTeams,
  fetchGeneralSponsors,
  fetchMatchDetail,
  fetchSeasonHub,
  fetchTeamPlayers,
  listCompetitions,
  listLiveMatches,
  setMatchLineup,
  setMatchPeriod,
  setMatchStatus,
  updateMatch
} from "../api/endpoints";
import { pickAndUploadMedia } from "../api/upload";
import type { Competition, MatchDetail, MatchSummary, Player, Sponsor, Team } from "../api/types";
import { colors, gradients } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { Card, EmptyState, Pill, PrimaryButton, SectionTitle } from "../components/ui";
import { Pitch, PitchSlot } from "../components/Pitch";
import { computeElapsedMinute, computeElapsedSeconds, formatClock, periodLabel } from "../utils/matchClock";
import { kitGradientForTeam, PitchPlayerCard } from "../components/PitchPlayerCard";
import { LogoBackgroundToggle } from "../components/LogoBackgroundToggle";

type Phase = "setup" | "roster" | "live" | "review";
type ActionType = "goal" | "shot_on_target" | "goalkeeper_save" | "yellow_card" | "red_card" | "foul" | "two_minutes";

const ACTION_CONFIG: { type: ActionType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "goal", label: "Gol", icon: "football" },
  { type: "shot_on_target", label: "Sut u okvir", icon: "disc-outline" },
  { type: "goalkeeper_save", label: "Odbrana", icon: "hand-left-outline" },
  { type: "yellow_card", label: "Zuti karton", icon: "square" },
  { type: "red_card", label: "Crveni karton", icon: "square" },
  { type: "foul", label: "Faul", icon: "warning-outline" },
  { type: "two_minutes", label: "2 minuta", icon: "time-outline" }
];

const EVENT_LABELS: Record<string, string> = {
  goal: "gol",
  shot_on_target: "sut u okvir",
  goalkeeper_save: "odbrana",
  yellow_card: "zuti karton",
  red_card: "crveni karton",
  foul: "faul",
  substitution: "izmena",
  kickoff: "pocetak utakmice",
  halftime: "kraj prvog poluvremena",
  second_half: "pocetak drugog poluvremena",
  fulltime: "kraj utakmice"
};

interface RosterPlayer extends Player {
  // Which side of THIS match the player represents - stamped locally when the
  // roster is loaded (Player itself no longer carries a single team, since a
  // player can be on several teams at once).
  teamId: string;
  inRoster: boolean;
  isStarter: boolean;
  isGoalkeeper: boolean;
  isPlaying: boolean;
}

interface PendingGoal {
  scorerId: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function defaultDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidLineup(players: RosterPlayer[], teamId: string): boolean {
  if (!teamId) return false;
  const starters = players.filter((player) => player.teamId === teamId && player.inRoster && player.isStarter);
  const goalkeepers = starters.filter((player) => player.isGoalkeeper);
  const outfield = starters.filter((player) => !player.isGoalkeeper);
  return goalkeepers.length === 1 && outfield.length === 4;
}

function describeEvent(event: MatchDetail["events"][number]): string {
  if (event.text) return event.text;
  const label = EVENT_LABELS[event.type] ?? event.type;
  return event.playerName ? `${event.playerName} - ${label}` : label;
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `${points}`;
}

function phaseLabel(status: string): string {
  if (status === "scheduled") return "ZAKAZANO";
  if (status === "live") return "LIVE";
  if (status === "finished") return "ZAVRSENO";
  return status.toUpperCase();
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function groupMatchesByRound(matches: MatchSummary[]): { key: string; title: string; matches: MatchSummary[] }[] {
  const groups = new Map<string, { key: string; title: string; matches: MatchSummary[] }>();
  matches.forEach((match) => {
    const key = match.round !== null && match.round !== undefined ? String(match.round) : "none";
    const title = match.round !== null && match.round !== undefined ? `Kolo ${match.round}` : match.phase || "Ostalo";
    if (!groups.has(key)) groups.set(key, { key, title, matches: [] });
    groups.get(key)!.matches.push(match);
  });
  return Array.from(groups.values()).sort((a, b) => {
    const roundA = Number(a.key);
    const roundB = Number(b.key);
    if (Number.isNaN(roundA) || Number.isNaN(roundB)) return a.key.localeCompare(b.key);
    return roundA - roundB;
  });
}

function formatMatchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function buildPitchSlots(teamId: string, starters: RosterPlayer[], pointsByPlayer?: Map<string, number>) {
  const toSlot = (player: RosterPlayer): PitchSlot => ({
    slot: player.id,
    teamId,
    name: player.displayName,
    avatarUrl: player.avatarUrl,
    statLabel: pointsByPlayer ? `${pointsByPlayer.get(player.id) ?? 0} pts` : undefined
  });
  const keeper = starters.find((player) => player.isGoalkeeper);
  const outfield = starters.filter((player) => !player.isGoalkeeper);
  const defenders = outfield.filter((player) => player.position !== "napad");
  const attackers = outfield.filter((player) => player.position === "napad");
  return {
    goalkeeper: keeper ? toSlot(keeper) : ({ slot: `${teamId}-gk-empty` } as PitchSlot),
    defenders: defenders.map(toSlot),
    attackers: attackers.map(toSlot)
  };
}

export function LiveMatchAdminModal({
  initialCompetitionId,
  onClose,
  onChanged
}: {
  initialCompetitionId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [changed, setChanged] = useState(false);

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState(initialCompetitionId || "");
  const [teams, setTeams] = useState<Team[]>([]);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState("19:00");

  const [liveMatches, setLiveMatches] = useState<MatchSummary[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<MatchSummary[]>([]);
  const [setupError, setSetupError] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  const [matchDetail, setMatchDetail] = useState<MatchDetail | null>(null);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [substituteOutId, setSubstituteOutId] = useState<string | null>(null);
  const [pendingGoal, setPendingGoal] = useState<PendingGoal | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  // No "current minute" is ever stored locally - it's derived every second from
  // matchDetail.period/periodStartedAt, the same values the server stamped when
  // the admin pressed kickoff/halftime/second-half. `nowTick` just forces a
  // re-render each second so the derived value visibly counts up.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (matchDetail?.status !== "live") return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [matchDetail?.status]);
  const matchSeconds = matchDetail
    ? computeElapsedSeconds(matchDetail.period, matchDetail.periodStartedAt, matchDetail.halfLengthMinutes, nowTick)
    : 0;
  const matchMinute = Math.floor(matchSeconds / 60);

  useEffect(() => {
    fetchGeneralSponsors().then(setSponsors).catch(() => undefined);
  }, []);

  useEffect(() => {
    listCompetitions()
      .then((rows) => {
        setCompetitions(rows);
        if (!competitionId && rows.length > 0) setCompetitionId(rows[0].id);
      })
      .catch((err) => setSetupError(err instanceof Error ? err.message : "Ne mogu da ucitam takmicenja."));
    listLiveMatches()
      .then(setLiveMatches)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!competitionId) {
      setTeams([]);
      setScheduledMatches([]);
      return;
    }
    fetchCompetitionTeams(competitionId)
      .then((rows) => {
        setTeams(rows);
        setHomeTeamId(rows[0]?.id ?? "");
        setAwayTeamId(rows[1]?.id ?? "");
      })
      .catch((err) => setSetupError(err instanceof Error ? err.message : "Ne mogu da ucitam ekipe."));
    fetchSeasonHub(competitionId)
      .then((hub) => setScheduledMatches(hub.matches.filter((match) => match.status === "scheduled")))
      .catch(() => setScheduledMatches([]));
  }, [competitionId]);

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  // Validate against matchDetail's actual home/away teams, not the ad-hoc-match
  // form fields above - those only reflect the create-new-match picker and are
  // stale (or plain wrong) once a match is resumed from the schedule instead of
  // freshly created here.
  const canStart = useMemo(
    () =>
      matchDetail
        ? [matchDetail.homeTeamId, matchDetail.awayTeamId].every((teamId) => isValidLineup(players, teamId))
        : false,
    [players, matchDetail]
  );

  async function loadRosterForMatch(match: MatchDetail) {
    const [homePlayers, awayPlayers] = await Promise.all([
      fetchTeamPlayers(match.homeTeamId),
      fetchTeamPlayers(match.awayTeamId)
    ]);
    const lineupByPlayer = new Map(match.lineups.map((entry) => [entry.playerId, entry]));

    const taggedHome = homePlayers.map((player) => ({ player, teamId: match.homeTeamId }));
    const taggedAway = awayPlayers.map((player) => ({ player, teamId: match.awayTeamId }));
    const teamsWithSavedLineup = new Set(match.lineups.map((entry) => entry.teamId));
    const roster: RosterPlayer[] = [...taggedHome, ...taggedAway].map(({ player, teamId }) => {
      const lineupEntry = lineupByPlayer.get(player.id);
      const guessedGoalkeeper = /gk|golman/i.test(player.position || "");
      return {
        ...player,
        teamId,
        inRoster: true,
        isStarter: lineupEntry?.isStarter ?? false,
        isGoalkeeper: lineupEntry?.isGoalkeeper ?? guessedGoalkeeper,
        isPlaying: lineupEntry?.isStarter ?? false
      };
    });

    // For whichever team(s) have no saved lineup yet, pre-pick a valid starting
    // five (1 goalkeeper + 4 outfield) from position data so "Start utakmice"
    // works immediately without having to tap every player by hand. Checked per
    // team, not per match - a match can have one team's lineup already saved
    // (e.g. admin left mid-setup) while the other still needs a default.
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (teamsWithSavedLineup.has(teamId)) continue;
      const teamPlayers = roster.filter((player) => player.teamId === teamId);
      const keeper = teamPlayers.find((player) => player.isGoalkeeper);
      if (keeper) keeper.isStarter = true;
      teamPlayers
        .filter((player) => !player.isGoalkeeper)
        .slice(0, 4)
        .forEach((player) => {
          player.isStarter = true;
        });
    }

    setPlayers(roster);
    setSelectedPlayerId(roster[0]?.id ?? "");
  }

  async function handleCreateMatch() {
    if (!competitionId || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
      setSetupError("Izaberi takmicenje i dve razlicite ekipe.");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setSetupError("Datum ili vreme nisu ispravni.");
      return;
    }
    setSetupBusy(true);
    setSetupError("");
    try {
      const match = await createMatch({ competitionId, homeTeamId, awayTeamId, scheduledAt: scheduledAt.toISOString() });
      setMatchDetail(match);
      await loadRosterForMatch(match);
      setPhase(match.status === "live" ? "live" : "roster");
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Utakmica nije kreirana.");
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleResumeMatch(match: MatchSummary) {
    setSetupBusy(true);
    setSetupError("");
    try {
      const detail = await fetchMatchDetail(match.id);
      setMatchDetail(detail);
      await loadRosterForMatch(detail);
      setPhase(detail.status === "finished" ? "review" : detail.status === "live" ? "live" : "roster");
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Utakmica nije ucitana.");
    } finally {
      setSetupBusy(false);
    }
  }

  // Roster phase: tap a bench card to send a player into the pitch (respecting
  // the 1 GK + 4 outfield capacity per team), tap a pitch card to send them
  // back to the bench. This makes an invalid lineup structurally impossible -
  // the UI itself never lets a team end up with the wrong number of starters.
  function addToStarters(playerId: string) {
    setPlayers((previous) => {
      const player = previous.find((item) => item.id === playerId);
      if (!player) return previous;
      const teamStarters = previous.filter((item) => item.teamId === player.teamId && item.isStarter);
      if (player.isGoalkeeper) {
        if (teamStarters.some((item) => item.isGoalkeeper)) return previous;
      } else if (teamStarters.filter((item) => !item.isGoalkeeper).length >= 4) {
        return previous;
      }
      return previous.map((item) => (item.id === playerId ? { ...item, isStarter: true } : item));
    });
  }

  function removeFromStarters(playerId: string) {
    setPlayers((previous) => previous.map((item) => (item.id === playerId ? { ...item, isStarter: false } : item)));
  }

  function toggleBenchGoalkeeper(playerId: string) {
    setPlayers((previous) =>
      previous.map((item) => (item.id === playerId && !item.isStarter ? { ...item, isGoalkeeper: !item.isGoalkeeper } : item))
    );
  }

  // A team's roster in the DB is everyone who's ever played for them - not everyone
  // shows up to every match. Excluding a player here just keeps them out of today's
  // squad (inRoster: false, so they never land in the lineup sent to setMatchLineup
  // and never appear as a bench option once the match goes live); it's reversible
  // right up until kickoff via the "Nema danas" list below the bench.
  function excludePlayer(playerId: string) {
    setPlayers((previous) =>
      previous.map((item) => (item.id === playerId ? { ...item, inRoster: false, isStarter: false } : item))
    );
  }

  function includePlayer(playerId: string) {
    setPlayers((previous) => previous.map((item) => (item.id === playerId ? { ...item, inRoster: true } : item)));
  }

  async function startMatch() {
    if (!matchDetail || !canStart) return;
    setActionBusy(true);
    setActionError("");
    try {
      const squad = players.filter((player) => player.inRoster);
      await setMatchLineup(
        matchDetail.id,
        squad.map((player) => ({
          playerId: player.id,
          teamId: player.teamId,
          isStarter: player.isStarter,
          isGoalkeeper: player.isGoalkeeper,
          shirtNumber: player.shirtNumber ?? undefined
        }))
      );
      await setMatchStatus(matchDetail.id, "live");
      const kickedOff = await setMatchPeriod(matchDetail.id, "first_half");
      setMatchDetail(kickedOff);
      setPlayers((previous) => previous.map((player) => ({ ...player, isPlaying: player.isStarter })));
      setChanged(true);
      setPhase("live");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Utakmica nije pokrenuta.");
    } finally {
      setActionBusy(false);
    }
  }

  async function advancePeriod(period: "halftime" | "second_half") {
    if (!matchDetail) return;
    setActionBusy(true);
    setActionError("");
    try {
      const updated = await setMatchPeriod(matchDetail.id, period);
      setMatchDetail(updated);
      setChanged(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Faza utakmice nije promenjena.");
    } finally {
      setActionBusy(false);
    }
  }

  async function assignSponsor(sponsorId: string) {
    if (!matchDetail) return;
    try {
      const updated = await updateMatch(matchDetail.id, { sponsorId });
      setMatchDetail(updated);
      setChanged(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Sponzor nije dodeljen.");
    }
  }

  async function createAndAssignSponsor(payload: { title: string; logoUrl?: string; targetUrl?: string; logoBackground?: "light" | "dark" }) {
    const created = await createGeneralSponsor(payload);
    setSponsors((previous) => [...previous, created]);
    await assignSponsor(created.id);
  }

  // Tapping a field player both selects him (for goal/card actions) and arms him
  // for substitution in one tap - the very next bench tap on his teammate swaps
  // them immediately. No separate "confirm substitution" step: tap field player,
  // tap bench player, done. Tapping a different field player just re-arms to him.
  function handlePlayerClick(player: RosterPlayer, mode: "playing" | "bench") {
    if (mode === "playing") {
      setSelectedPlayerId(player.id);
      setSubstituteOutId(player.id);
      return;
    }
    if (substituteOutId) {
      const out = players.find((item) => item.id === substituteOutId);
      if (out && out.teamId === player.teamId) {
        void makeSubstitution(substituteOutId, player.id);
        return;
      }
    }
    setSelectedPlayerId(player.id);
  }

  function cancelSubstitution() {
    setSubstituteOutId(null);
  }

  async function makeSubstitution(outId: string, inId: string) {
    if (!matchDetail) return;
    const out = players.find((player) => player.id === outId);
    const incoming = players.find((player) => player.id === inId);
    if (!out || !incoming || out.teamId !== incoming.teamId || out.id === incoming.id) return;

    const nextPlayers = players.map((player) => {
      if (player.id === out.id) return { ...player, isPlaying: false, isStarter: false };
      if (player.id === incoming.id) return { ...player, isPlaying: true, isStarter: true, inRoster: true };
      return player;
    });

    setActionBusy(true);
    setActionError("");
    try {
      const squad = nextPlayers.filter((player) => player.inRoster);
      await setMatchLineup(
        matchDetail.id,
        squad.map((player) => ({
          playerId: player.id,
          teamId: player.teamId,
          isStarter: player.isStarter,
          isGoalkeeper: player.isGoalkeeper,
          shirtNumber: player.shirtNumber ?? undefined
        }))
      );
      const result = await addMatchEvent(matchDetail.id, {
        type: "substitution",
        minute: matchMinute,
        teamId: out.teamId,
        playerId: incoming.id,
        relatedPlayerId: out.id,
        text: `${out.displayName} izasao, ${incoming.displayName} usao`
      });
      setMatchDetail(result.match);
      setPlayers(nextPlayers);
      setSelectedPlayerId(incoming.id);
      setSubstituteOutId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Izmena nije uspela.");
    } finally {
      setActionBusy(false);
    }
  }

  async function applyAction(type: ActionType) {
    if (!matchDetail || !selectedPlayer || !selectedPlayer.isPlaying) return;

    if (type === "goal") {
      setPendingGoal({ scorerId: selectedPlayer.id });
      return;
    }

    setActionBusy(true);
    setActionError("");
    try {
      const result = await addMatchEvent(matchDetail.id, {
        type,
        minute: matchMinute,
        teamId: selectedPlayer.teamId,
        playerId: selectedPlayer.id
      });
      setMatchDetail(result.match);
      setChanged(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Dogadjaj nije sacuvan.");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmGoal(assistantId: string | null) {
    if (!matchDetail || !pendingGoal) return;
    const scorer = players.find((player) => player.id === pendingGoal.scorerId);
    if (!scorer) {
      setPendingGoal(null);
      return;
    }

    setActionBusy(true);
    setActionError("");
    try {
      const result = await addMatchEvent(matchDetail.id, {
        type: "goal",
        minute: matchMinute,
        teamId: scorer.teamId,
        playerId: scorer.id,
        relatedPlayerId: assistantId ?? undefined
      });
      setMatchDetail(result.match);
      setChanged(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gol nije sacuvan.");
    } finally {
      setActionBusy(false);
      setPendingGoal(null);
    }
  }

  async function finishMatch() {
    if (!matchDetail) return;
    setActionBusy(true);
    setActionError("");
    try {
      const updated = await setMatchStatus(matchDetail.id, "finished");
      setMatchDetail(updated);
      setChanged(true);
      setPhase("review");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Utakmica nije zavrsena.");
    } finally {
      setActionBusy(false);
    }
  }

  function resetToSetup() {
    setMatchDetail(null);
    setPlayers([]);
    setPhase("setup");
    setPendingGoal(null);
    setSubstituteOutId(null);
    setActionError("");
    listLiveMatches().then(setLiveMatches).catch(() => undefined);
    if (competitionId) {
      fetchSeasonHub(competitionId)
        .then((hub) => setScheduledMatches(hub.matches.filter((match) => match.status === "scheduled")))
        .catch(() => undefined);
    }
  }

  function handleClose() {
    if (changed) onChanged();
    onClose();
  }

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      <View style={styles.screen}>
        {phase === "setup" ? (
          <SetupPhase
            competitions={competitions}
            competitionId={competitionId}
            onCompetitionChange={setCompetitionId}
            teams={teams}
            homeTeamId={homeTeamId}
            awayTeamId={awayTeamId}
            onHomeTeamChange={setHomeTeamId}
            onAwayTeamChange={setAwayTeamId}
            date={date}
            onDateChange={setDate}
            time={time}
            onTimeChange={setTime}
            onSubmit={handleCreateMatch}
            busy={setupBusy}
            error={setupError}
            liveMatches={liveMatches}
            scheduledMatches={scheduledMatches}
            onResume={handleResumeMatch}
            onClose={handleClose}
          />
        ) : null}

        {phase !== "setup" && !matchDetail ? <EmptyState message="Ucitavanje utakmice..." /> : null}

        {phase === "roster" && matchDetail ? (
          <RosterPhase
            matchDetail={matchDetail}
            players={players}
            onAddToStarters={addToStarters}
            onRemoveFromStarters={removeFromStarters}
            onToggleGoalkeeper={toggleBenchGoalkeeper}
            onExcludePlayer={excludePlayer}
            onIncludePlayer={includePlayer}
            canStart={canStart}
            onStart={startMatch}
            busy={actionBusy}
            error={actionError}
            onBack={resetToSetup}
            sponsors={sponsors}
            onAssignSponsor={assignSponsor}
            onCreateSponsor={createAndAssignSponsor}
          />
        ) : null}

        {phase === "live" && matchDetail ? (
          <LivePhase
            matchDetail={matchDetail}
            players={players}
            matchMinute={matchMinute}
            matchSeconds={matchSeconds}
            onAdvancePeriod={advancePeriod}
            selectedPlayer={selectedPlayer}
            selectedPlayerId={selectedPlayerId}
            substituteOutId={substituteOutId}
            onPlayerClick={handlePlayerClick}
            onCancelSubstitution={cancelSubstitution}
            onAction={applyAction}
            pendingGoal={pendingGoal}
            onConfirmGoal={confirmGoal}
            onFinish={finishMatch}
            onNewMatch={resetToSetup}
            busy={actionBusy}
            error={actionError}
          />
        ) : null}

        {phase === "review" && matchDetail ? <ReviewPhase matchDetail={matchDetail} onNewMatch={resetToSetup} onClose={handleClose} /> : null}
      </View>
    </Modal>
  );
}

function MatchHero({
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  homeTeamId,
  awayTeamId,
  status,
  eyebrow,
  onBack
}: {
  homeTeamName: string;
  awayTeamName: string;
  homeScore?: number;
  awayScore?: number;
  homeTeamId: string;
  awayTeamId: string;
  status?: string;
  eyebrow: string;
  onBack?: () => void;
}) {
  const showScore = homeScore !== undefined && awayScore !== undefined;
  return (
    <LinearGradient colors={gradients.hero} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.hero}>
      <View style={styles.heroTopRow}>
        {onBack ? (
          <TouchableOpacity style={styles.iconButton} onPress={onBack}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButtonSpacer} />
        )}
        <Text style={styles.heroEyebrow}>{eyebrow}</Text>
        <View style={styles.iconButtonSpacer} />
      </View>
      <View style={styles.heroTeamsRow}>
        <View style={styles.heroTeam}>
          <LinearGradient colors={kitGradientForTeam(homeTeamId)} style={styles.heroCrest}>
            <Text style={styles.heroCrestText}>{initialsOf(homeTeamName)}</Text>
          </LinearGradient>
          <Text style={styles.heroTeamName} numberOfLines={2}>{homeTeamName}</Text>
        </View>
        <View style={styles.heroCenter}>
          {showScore ? (
            <Text style={styles.heroScore}>{homeScore} : {awayScore}</Text>
          ) : (
            <Text style={styles.heroVs}>vs</Text>
          )}
          {status ? <Pill label={phaseLabel(status)} tone={status === "live" ? "live" : "neutral"} /> : null}
        </View>
        <View style={styles.heroTeam}>
          <LinearGradient colors={kitGradientForTeam(awayTeamId)} style={styles.heroCrest}>
            <Text style={styles.heroCrestText}>{initialsOf(awayTeamName)}</Text>
          </LinearGradient>
          <Text style={styles.heroTeamName} numberOfLines={2}>{awayTeamName}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function SetupPhase({
  competitions,
  competitionId,
  onCompetitionChange,
  teams,
  homeTeamId,
  awayTeamId,
  onHomeTeamChange,
  onAwayTeamChange,
  date,
  onDateChange,
  time,
  onTimeChange,
  onSubmit,
  busy,
  error,
  liveMatches,
  scheduledMatches,
  onResume,
  onClose
}: {
  competitions: Competition[];
  competitionId: string;
  onCompetitionChange: (id: string) => void;
  teams: Team[];
  homeTeamId: string;
  awayTeamId: string;
  onHomeTeamChange: (id: string) => void;
  onAwayTeamChange: (id: string) => void;
  date: string;
  onDateChange: (value: string) => void;
  time: string;
  onTimeChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string;
  liveMatches: MatchSummary[];
  scheduledMatches: MatchSummary[];
  onResume: (match: MatchSummary) => void;
  onClose: () => void;
}) {
  const isWide = useIsWideScreen();
  return (
    <View style={styles.screen}>
      <LinearGradient colors={gradients.hero} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.setupHero}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity style={styles.iconButton} onPress={onClose}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.heroEyebrow}>Admin</Text>
          <View style={styles.iconButtonSpacer} />
        </View>
        <Text style={styles.setupHeroTitle}>Live utakmica</Text>
        <Text style={styles.setupHeroSubtitle}>Pokreni iz rasporeda, nastavi live mec, ili napravi vanrednu utakmicu.</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
        {liveMatches.length > 0 ? (
          <View style={styles.field}>
            <Text style={styles.label}>Live utakmice u toku</Text>
            {liveMatches.map((match) => (
              <MatchResumeRow key={match.id} match={match} tone="live" onPress={() => onResume(match)} />
            ))}
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Takmicenje</Text>
          <View style={styles.chipsRow}>
            {competitions.map((competition) => (
              <TouchableOpacity
                key={competition.id}
                style={[styles.chip, competitionId === competition.id ? styles.chipActive : null]}
                onPress={() => onCompetitionChange(competition.id)}
              >
                <Text style={[styles.chipText, competitionId === competition.id ? styles.chipTextActive : null]}>{competition.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Zakazane utakmice{scheduledMatches.length > 0 ? ` (ukupno ${scheduledMatches.length})` : ""}
          </Text>
          {scheduledMatches.length === 0 ? (
            <Text style={styles.hintText}>Ovo takmicenje jos nema zakazanih utakmica koje cekaju start.</Text>
          ) : (
            groupMatchesByRound(scheduledMatches).map((group) => (
              <View key={group.key} style={styles.roundGroup}>
                <Text style={styles.roundGroupTitle}>{group.title}</Text>
                {group.matches.map((match) => (
                  <MatchResumeRow key={match.id} match={match} tone="scheduled" onPress={() => onResume(match)} />
                ))}
              </View>
            ))
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Ili napravi vanrednu utakmicu</Text>
          <Text style={styles.hintText}>Domacin</Text>
          <View style={styles.chipsRow}>
            {teams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[styles.chip, homeTeamId === team.id ? styles.chipActive : null]}
                onPress={() => onHomeTeamChange(team.id)}
              >
                <Text style={[styles.chipText, homeTeamId === team.id ? styles.chipTextActive : null]}>{team.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hintText}>Gost</Text>
          <View style={styles.chipsRow}>
            {teams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[styles.chip, awayTeamId === team.id ? styles.chipActive : null]}
                onPress={() => onAwayTeamChange(team.id)}
              >
                <Text style={[styles.chipText, awayTeamId === team.id ? styles.chipTextActive : null]}>{team.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>Datum</Text>
              <TextInput style={styles.input} placeholder="GGGG-MM-DD" placeholderTextColor="#9c9186" value={date} onChangeText={onDateChange} />
            </View>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>Vreme</Text>
              <TextInput style={styles.input} placeholder="HH:mm" placeholderTextColor="#9c9186" value={time} onChangeText={onTimeChange} />
            </View>
          </View>
          {teams.length < 2 ? <Text style={styles.errorText}>Ovo takmicenje nema dve ekipe. Dodaj ekipe pre nego sto pokrenes mec.</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton
            label={busy ? "Kreiranje..." : "Kreiraj utakmicu i podesi roster"}
            onPress={onSubmit}
            loading={busy}
            disabled={teams.length < 2}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function MatchResumeRow({ match, tone, onPress }: { match: MatchSummary; tone: "live" | "scheduled"; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.resumeRow} onPress={onPress}>
      <View style={styles.resumeCrests}>
        <LinearGradient colors={kitGradientForTeam(match.homeTeamId)} style={styles.resumeCrest}>
          <Text style={styles.resumeCrestText}>{initialsOf(match.homeTeamName)}</Text>
        </LinearGradient>
        <LinearGradient colors={kitGradientForTeam(match.awayTeamId)} style={styles.resumeCrest}>
          <Text style={styles.resumeCrestText}>{initialsOf(match.awayTeamName)}</Text>
        </LinearGradient>
      </View>
      <View style={styles.flex1}>
        <Text style={styles.resumeTitle}>{match.homeTeamName} vs {match.awayTeamName}</Text>
        <Text style={styles.resumeMeta}>
          {tone === "live" ? `${match.homeScore} : ${match.awayScore}` : formatMatchDate(match.scheduledAt)}
          {match.competitionName ? ` · ${match.competitionName}` : ""}
        </Text>
      </View>
      {tone === "live" ? <Pill label="LIVE" tone="live" /> : <Ionicons name="play-circle-outline" size={26} color={colors.purple} />}
    </TouchableOpacity>
  );
}

function RosterPhase({
  matchDetail,
  players,
  onAddToStarters,
  onRemoveFromStarters,
  onToggleGoalkeeper,
  onExcludePlayer,
  onIncludePlayer,
  canStart,
  onStart,
  busy,
  error,
  onBack,
  sponsors,
  onAssignSponsor,
  onCreateSponsor
}: {
  matchDetail: MatchDetail;
  players: RosterPlayer[];
  onAddToStarters: (playerId: string) => void;
  onRemoveFromStarters: (playerId: string) => void;
  onToggleGoalkeeper: (playerId: string) => void;
  onExcludePlayer: (playerId: string) => void;
  onIncludePlayer: (playerId: string) => void;
  canStart: boolean;
  onStart: () => void;
  busy: boolean;
  error: string;
  onBack: () => void;
  sponsors: Sponsor[];
  onAssignSponsor: (sponsorId: string) => void;
  onCreateSponsor: (payload: { title: string; logoUrl?: string; targetUrl?: string }) => Promise<void>;
}) {
  const isWide = useIsWideScreen();
  const sides: { teamId: string; name: string }[] = [
    { teamId: matchDetail.homeTeamId, name: matchDetail.homeTeamName },
    { teamId: matchDetail.awayTeamId, name: matchDetail.awayTeamName }
  ];

  return (
    <View style={styles.screen}>
      <MatchHero
        eyebrow="Postava"
        homeTeamName={matchDetail.homeTeamName}
        awayTeamName={matchDetail.awayTeamName}
        homeTeamId={matchDetail.homeTeamId}
        awayTeamId={matchDetail.awayTeamId}
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
        <Text style={styles.hintText}>Dodirni igraca na klupi da ga uvedes u postavu · dodirni igraca na terenu da ga vratis na klupu.</Text>

        {sides.map((side) => {
          const allTeamPlayers = players.filter((player) => player.teamId === side.teamId);
          const teamPlayers = allTeamPlayers.filter((player) => player.inRoster);
          const excludedPlayers = allTeamPlayers.filter((player) => !player.inRoster);
          const starters = teamPlayers.filter((player) => player.isStarter);
          const bench = teamPlayers.filter((player) => !player.isStarter);
          const keeperCount = starters.filter((player) => player.isGoalkeeper).length;
          const outfieldCount = starters.length - keeperCount;
          const teamValid = keeperCount === 1 && outfieldCount === 4;
          const pitchSlots = buildPitchSlots(side.teamId, starters);

          if (allTeamPlayers.length === 0) {
            return (
              <Card key={side.teamId} style={styles.rosterCard}>
                <SectionTitle title={side.name} />
                <EmptyState message="Ova ekipa nema igrace u bazi." />
              </Card>
            );
          }

          return (
            <View key={side.teamId} style={styles.teamBlock}>
              <View style={styles.teamBlockHeader}>
                <LinearGradient colors={kitGradientForTeam(side.teamId)} style={styles.teamDot} />
                <Text style={styles.teamBlockName}>{side.name}</Text>
                <Pill label={`${outfieldCount}/4 + ${keeperCount}/1 GK`} tone={teamValid ? "success" : "warning"} />
              </View>

              <Pitch
                goalkeeper={pitchSlots.goalkeeper}
                defenders={pitchSlots.defenders}
                attackers={pitchSlots.attackers}
                onSelectSlot={onRemoveFromStarters}
              />

              <LinearGradient colors={["#C9A227", "#8A6D1F"]} style={styles.benchPanel}>
                <Text style={styles.benchLabel}>Klupa ({bench.length})</Text>
                {bench.length === 0 ? (
                  <Text style={styles.benchEmptyText}>
                    {starters.length > 0 ? "Svi igraci su u postavi." : "Nema dostupnih igraca."}
                  </Text>
                ) : (
                  <View style={styles.benchGrid}>
                    {bench.map((player) => (
                      <View key={player.id} style={styles.benchCardWrap}>
                        <PitchPlayerCard
                          name={player.displayName}
                          teamId={player.teamId}
                          avatarUrl={player.avatarUrl}
                          isGoalkeeper={player.isGoalkeeper}
                          weightBadge={player.isGoalkeeper ? "GK" : undefined}
                          compact
                          onPress={() => onAddToStarters(player.id)}
                          onLongPress={() => onToggleGoalkeeper(player.id)}
                        />
                        <TouchableOpacity
                          style={styles.benchRemoveBadge}
                          onPress={() => onExcludePlayer(player.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close" size={12} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.benchHint}>Drzi pritisnuto na klupi da oznacis/skines golmana - X uklanja igraca koji danas nije prisutan.</Text>
              </LinearGradient>

              {excludedPlayers.length > 0 ? (
                <View style={styles.excludedWrap}>
                  <Text style={styles.excludedLabel}>Nema danas ({excludedPlayers.length})</Text>
                  <View style={styles.chipsRow}>
                    {excludedPlayers.map((player) => (
                      <TouchableOpacity key={player.id} style={styles.chip} onPress={() => onIncludePlayer(player.id)}>
                        <Text style={styles.chipText}>+ {player.displayName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        <SponsorPicker
          sponsors={sponsors}
          selectedSponsorId={matchDetail.sponsorId || ""}
          onAssign={onAssignSponsor}
          onCreate={onCreateSponsor}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton label={busy ? "Pokretanje..." : "Start utakmice"} onPress={onStart} loading={busy} disabled={!canStart} />
      </ScrollView>
    </View>
  );
}

function SponsorChip({ sponsor, active, onPress }: { sponsor: Sponsor; active: boolean; onPress: () => void }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const dark = sponsor.logoBackground === "dark";
  return (
    <TouchableOpacity style={[styles.chip, styles.sponsorChip, active ? styles.chipActive : null]} onPress={onPress}>
      {sponsor.logoUrl && !photoFailed ? (
        <Image
          source={{ uri: sponsor.logoUrl }}
          style={[styles.sponsorChipLogo, dark ? styles.sponsorChipLogoDark : null]}
          resizeMode="contain"
          onError={() => setPhotoFailed(true)}
        />
      ) : null}
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{sponsor.title}</Text>
    </TouchableOpacity>
  );
}

function SponsorPicker({
  sponsors,
  selectedSponsorId,
  onAssign,
  onCreate
}: {
  sponsors: Sponsor[];
  selectedSponsorId: string;
  onAssign: (sponsorId: string) => void;
  onCreate: (payload: { title: string; logoUrl?: string; targetUrl?: string; logoBackground?: "light" | "dark" }) => Promise<void>;
}) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [title, setTitle] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoBackground, setLogoBackground] = useState<"light" | "dark">("light");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickError, setPickError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);

  async function handlePickLogo() {
    setPickError("");
    setUploading(true);
    try {
      const uploaded = await pickAndUploadMedia("logo");
      if (uploaded) {
        setLogoUrl(uploaded.url);
        setPhotoFailed(false);
      }
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "Logo nije otpremljen.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreate({ title: title.trim(), logoUrl: logoUrl || undefined, targetUrl: targetUrl.trim() || undefined, logoBackground });
      setTitle("");
      setTargetUrl("");
      setLogoUrl("");
      setLogoBackground("light");
      setShowNewForm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Sponzor utakmice</Text>
      {sponsors.length === 0 ? (
        <Text style={styles.hintText}>Jos nema aktivnih sponzora - dodaj ih ispod ili iz sekcije Sponzori.</Text>
      ) : (
        <View style={styles.chipsRow}>
          {sponsors.map((sponsor) => (
            <SponsorChip
              key={sponsor.id}
              sponsor={sponsor}
              active={selectedSponsorId === sponsor.id}
              onPress={() => onAssign(sponsor.id)}
            />
          ))}
        </View>
      )}
      {!showNewForm ? (
        <TouchableOpacity onPress={() => setShowNewForm(true)}>
          <Text style={styles.linkText}>+ Novi sponzor</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.newForm}>
          <TextInput style={styles.input} placeholder="Naziv sponzora" placeholderTextColor="#9c9186" value={title} onChangeText={setTitle} />
          <TextInput
            style={styles.input}
            placeholder="Link (opciono)"
            placeholderTextColor="#9c9186"
            value={targetUrl}
            onChangeText={setTargetUrl}
            autoCapitalize="none"
          />
          {logoUrl && !photoFailed ? (
            <Image
              source={{ uri: logoUrl }}
              style={[styles.sponsorLogoPreview, logoBackground === "dark" ? styles.sponsorLogoPreviewDark : null]}
              resizeMode="contain"
              onError={() => setPhotoFailed(true)}
            />
          ) : null}
          <TouchableOpacity style={styles.secondaryButton} onPress={handlePickLogo} disabled={uploading}>
            <Text style={styles.secondaryButtonText}>{uploading ? "Otpremanje..." : logoUrl ? "Promeni logo" : "Dodaj logo"}</Text>
          </TouchableOpacity>
          {logoUrl ? <LogoBackgroundToggle value={logoBackground} onChange={setLogoBackground} /> : null}
          {pickError ? <Text style={styles.errorText}>{pickError}</Text> : null}
          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj sponzora"} onPress={handleCreate} loading={saving} disabled={!title.trim() || !logoUrl} />
        </View>
      )}
    </View>
  );
}

function LivePhase({
  matchDetail,
  players,
  matchMinute,
  matchSeconds,
  onAdvancePeriod,
  selectedPlayer,
  selectedPlayerId,
  substituteOutId,
  onPlayerClick,
  onCancelSubstitution,
  onAction,
  pendingGoal,
  onConfirmGoal,
  onFinish,
  onNewMatch,
  busy,
  error
}: {
  matchDetail: MatchDetail;
  players: RosterPlayer[];
  matchMinute: number;
  matchSeconds: number;
  onAdvancePeriod: (period: "halftime" | "second_half") => void;
  selectedPlayer: RosterPlayer | null;
  selectedPlayerId: string;
  substituteOutId: string | null;
  onPlayerClick: (player: RosterPlayer, mode: "playing" | "bench") => void;
  onCancelSubstitution: () => void;
  onAction: (type: ActionType) => void;
  pendingGoal: PendingGoal | null;
  onConfirmGoal: (assistantId: string | null) => void;
  onFinish: () => void;
  onNewMatch: () => void;
  busy: boolean;
  error: string;
}) {
  const isWide = useIsWideScreen();
  const sides: { teamId: string; name: string }[] = [
    { teamId: matchDetail.homeTeamId, name: matchDetail.homeTeamName },
    { teamId: matchDetail.awayTeamId, name: matchDetail.awayTeamName }
  ];
  const pointsByPlayer = new Map(matchDetail.playerStats.map((stat) => [stat.playerId, stat.fantasyPoints]));
  const events = [...matchDetail.events].sort((a, b) => b.minute - a.minute);
  const scorer = pendingGoal ? players.find((player) => player.id === pendingGoal.scorerId) ?? null : null;
  const assistCandidates = scorer
    ? players.filter((player) => player.teamId === scorer.teamId && player.id !== scorer.id && player.inRoster && player.isPlaying)
    : [];

  return (
    <View style={styles.screen}>
      <MatchHero
        eyebrow="Live admin"
        homeTeamName={matchDetail.homeTeamName}
        awayTeamName={matchDetail.awayTeamName}
        homeScore={matchDetail.homeScore}
        awayScore={matchDetail.awayScore}
        homeTeamId={matchDetail.homeTeamId}
        awayTeamId={matchDetail.awayTeamId}
        status={matchDetail.status}
      />
      <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
        <View style={styles.clockRow}>
          <View style={styles.clockCenter}>
            <View style={styles.clockLiveRow}>
              {matchDetail.period === "first_half" || matchDetail.period === "second_half" ? <View style={styles.livePulse} /> : null}
              <Text style={styles.clockLabel}>{periodLabel(matchDetail.period)}</Text>
            </View>
            <Text style={styles.clockValue}>{formatClock(matchSeconds)}</Text>
          </View>
          {matchDetail.period === "first_half" ? (
            <TouchableOpacity style={styles.periodButton} onPress={() => onAdvancePeriod("halftime")} disabled={busy}>
              <Ionicons name="pause" size={14} color="#fff" />
              <Text style={styles.periodButtonText}>Poluvreme</Text>
            </TouchableOpacity>
          ) : null}
          {matchDetail.period === "halftime" ? (
            <TouchableOpacity style={styles.periodButton} onPress={() => onAdvancePeriod("second_half")} disabled={busy}>
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={styles.periodButtonText}>Pusti 2. poluvreme</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {sides.map((side) => {
          const playing = players.filter((player) => player.teamId === side.teamId && player.inRoster && player.isPlaying);
          const bench = players.filter((player) => player.teamId === side.teamId && player.inRoster && !player.isPlaying);
          const pitchSlots = buildPitchSlots(side.teamId, playing, pointsByPlayer);
          return (
            <View key={side.teamId} style={styles.teamBlock}>
              <View style={styles.teamBlockHeader}>
                <LinearGradient colors={kitGradientForTeam(side.teamId)} style={styles.teamDot} />
                <Text style={styles.teamBlockName}>{side.name}</Text>
              </View>

              <Pitch
                goalkeeper={pitchSlots.goalkeeper}
                defenders={pitchSlots.defenders}
                attackers={pitchSlots.attackers}
                swapSourceSlot={substituteOutId}
                onSelectSlot={(slot) => {
                  const player = players.find((item) => item.id === slot);
                  if (player) onPlayerClick(player, "playing");
                }}
              />

              <LinearGradient colors={["#C9A227", "#8A6D1F"]} style={styles.benchPanel}>
                <Text style={styles.benchLabel}>Klupa ({bench.length})</Text>
                {bench.length === 0 ? (
                  <Text style={styles.benchEmptyText}>Nema igraca na klupi.</Text>
                ) : (
                  <View style={styles.benchGrid}>
                    {bench.map((player) => (
                      <PitchPlayerCard
                        key={player.id}
                        name={player.displayName}
                        teamId={player.teamId}
                        avatarUrl={player.avatarUrl}
                        isGoalkeeper={player.isGoalkeeper}
                        statLabel={`${pointsByPlayer.get(player.id) ?? 0} pts`}
                        isSwapSource={selectedPlayerId === player.id}
                        compact
                        onPress={() => onPlayerClick(player, "bench")}
                      />
                    ))}
                  </View>
                )}
              </LinearGradient>
            </View>
          );
        })}

        <Card style={styles.selectedCard}>
          <Text style={styles.label}>Izabran igrac</Text>
          {selectedPlayer ? (
            <View style={styles.selectedPlayerRow}>
              <PitchPlayerCard
                name={selectedPlayer.displayName}
                teamId={selectedPlayer.teamId}
                avatarUrl={selectedPlayer.avatarUrl}
                isGoalkeeper={selectedPlayer.isGoalkeeper}
                statLabel={`${pointsByPlayer.get(selectedPlayer.id) ?? 0} pts`}
              />
              <View style={styles.flex1}>
                <Text style={styles.selectedPlayerName}>{selectedPlayer.displayName}</Text>
                <Text style={styles.hintText}>{selectedPlayer.isPlaying ? "U igri" : "Na klupi - izaberi igraca u igri za akciju"}</Text>
              </View>
            </View>
          ) : (
            <EmptyState message="Dodirni igraca na terenu da mu dodelis akciju." />
          )}

          {substituteOutId ? (
            <View style={styles.substitutionBanner}>
              <Ionicons name="swap-horizontal" size={16} color={colors.ink} />
              <Text style={styles.substitutionBannerText}>Zamena spremna - dodirni igraca na klupi da ga zameni</Text>
              <TouchableOpacity onPress={onCancelSubstitution}>
                <Text style={styles.substitutionBannerCancel}>Otkazi</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.actionsGrid}>
            {ACTION_CONFIG.map((action) => (
              <TouchableOpacity
                key={action.type}
                style={[styles.actionButton, action.type === "goal" ? styles.actionButtonPrimary : null]}
                onPress={() => onAction(action.type)}
                disabled={busy || !selectedPlayer?.isPlaying}
              >
                <Ionicons
                  name={action.icon}
                  size={15}
                  color={action.type === "goal" ? "#fff" : action.type === "yellow_card" ? colors.warning : action.type === "red_card" ? colors.danger : colors.textPrimary}
                />
                <Text style={[styles.actionButtonText, action.type === "goal" ? styles.actionButtonTextPrimary : null]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {pendingGoal && scorer ? (
            <View style={styles.assistBox}>
              <Text style={styles.assistTitle}>Ko je asistirao za gol: {scorer.displayName}</Text>
              <View style={styles.chipsRow}>
                {assistCandidates.map((player) => (
                  <TouchableOpacity key={player.id} style={styles.chip} onPress={() => onConfirmGoal(player.id)} disabled={busy}>
                    <Text style={styles.chipText}>{player.displayName}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.chip} onPress={() => onConfirmGoal(null)} disabled={busy}>
                  <Text style={styles.chipText}>Bez asistencije</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PrimaryButton label={busy ? "..." : "Kraj utakmice"} onPress={onFinish} loading={busy} variant="danger" />
        </Card>

        <Card style={styles.rosterCard}>
          <SectionTitle title="Live dogadjaji" />
          {events.length === 0 ? <EmptyState message="Jos nema dogadjaja." /> : null}
          {events.slice(0, 10).map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <Text style={styles.eventMinute}>{event.minute}'</Text>
              <Text style={styles.eventText}>{describeEvent(event)}</Text>
              <Text style={styles.eventPoints}>{event.fantasyPointsDelta ? formatPoints(event.fantasyPointsDelta) : "-"}</Text>
            </View>
          ))}
        </Card>

        <TouchableOpacity style={styles.cancelButton} onPress={onNewMatch}>
          <Text style={styles.cancelButtonText}>Nova utakmica</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ReviewPhase({ matchDetail, onNewMatch, onClose }: { matchDetail: MatchDetail; onNewMatch: () => void; onClose: () => void }) {
  const isWide = useIsWideScreen();
  const topPerformer = [...matchDetail.playerStats].sort((a, b) => b.fantasyPoints - a.fantasyPoints)[0];
  const events = [...matchDetail.events].sort((a, b) => b.minute - a.minute);
  return (
    <View style={styles.screen}>
      <MatchHero
        eyebrow="Finalni zapisnik"
        homeTeamName={matchDetail.homeTeamName}
        awayTeamName={matchDetail.awayTeamName}
        homeScore={matchDetail.homeScore}
        awayScore={matchDetail.awayScore}
        homeTeamId={matchDetail.homeTeamId}
        awayTeamId={matchDetail.awayTeamId}
        status={matchDetail.status}
        onBack={onClose}
      />
      <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
        <Card style={styles.rosterCard}>
          <Text style={styles.hintText}>Najvise fantazi poena u mecu</Text>
          <Text style={styles.selectedPlayerName}>
            {topPerformer ? `${topPerformer.playerName} - ${topPerformer.fantasyPoints} pts` : "-"}
          </Text>
        </Card>
        <Card style={styles.rosterCard}>
          <SectionTitle title="Live dogadjaji" />
          {events.length === 0 ? <EmptyState message="Nema dogadjaja." /> : null}
          {events.map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <Text style={styles.eventMinute}>{event.minute}'</Text>
              <Text style={styles.eventText}>{describeEvent(event)}</Text>
              <Text style={styles.eventPoints}>{event.fantasyPointsDelta ? formatPoints(event.fantasyPointsDelta) : "-"}</Text>
            </View>
          ))}
        </Card>
        <PrimaryButton label="Nova utakmica" onPress={onNewMatch} />
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelButtonText}>Zatvori</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 18, gap: 16, paddingBottom: 60 },
  hero: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 14,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28
  },
  setupHero: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 22,
    gap: 6,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28
  },
  setupHeroTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 6 },
  setupHeroSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  iconButtonSpacer: { width: 34, height: 34 },
  heroEyebrow: { color: "rgba(255,255,255,0.8)", fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  heroTeamsRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  heroTeam: { flex: 1, alignItems: "center", gap: 6 },
  heroCrest: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
  heroCrestText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  heroTeamName: { color: "#fff", fontWeight: "800", fontSize: 12, textAlign: "center" },
  heroCenter: { width: 100, alignItems: "center", gap: 6 },
  heroScore: { color: "#fff", fontWeight: "900", fontSize: 26 },
  heroVs: { color: "rgba(255,255,255,0.7)", fontWeight: "700", fontSize: 16 },
  field: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  hintText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  substitutionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.yellow,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  substitutionBannerText: { flex: 1, color: colors.ink, fontWeight: "700", fontSize: 12 },
  substitutionBannerCancel: { color: colors.danger, fontWeight: "800", fontSize: 12 },
  errorText: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  row: { flexDirection: "row", gap: 12 },
  flex1: { flex: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  chipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  sponsorChip: { flexDirection: "row", alignItems: "center", gap: 8 },
  sponsorChipLogo: { width: 20, height: 20, borderRadius: 5, backgroundColor: "#fff" },
  sponsorChipLogoDark: { backgroundColor: colors.ink },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  resumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 8,
    shadowColor: "#141414",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  resumeCrests: { flexDirection: "row" },
  resumeCrest: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
    marginRight: -10
  },
  resumeCrestText: { color: "#fff", fontWeight: "800", fontSize: 10 },
  roundGroup: { gap: 6, marginBottom: 10 },
  roundGroupTitle: { color: colors.ink, fontWeight: "800", fontSize: 13 },
  resumeMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  resumeTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" },
  rosterCard: { gap: 10 },
  selectedCard: { gap: 12 },
  teamBlock: { gap: 10 },
  teamBlockHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamDot: { width: 14, height: 14, borderRadius: 4 },
  teamBlockName: { flex: 1, color: colors.ink, fontWeight: "800", fontSize: 15 },
  benchPanel: {
    borderRadius: 16,
    padding: 10,
    gap: 8,
    shadowColor: "#141414",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  benchLabel: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  benchEmptyText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  benchGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  benchHint: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "600" },
  benchCardWrap: { position: "relative" },
  benchRemoveBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 6
  },
  excludedWrap: { gap: 8, marginTop: 4 },
  excludedLabel: { color: colors.textMuted, fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  clockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18
  },
  clockCenter: { alignItems: "flex-start", gap: 4 },
  clockLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  clockLiveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  clockValue: { color: "#fff", fontWeight: "900", fontSize: 36, fontVariant: ["tabular-nums"] },
  periodButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.purple
  },
  periodButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  linkText: { color: colors.purple, fontWeight: "700", fontSize: 13 },
  newForm: { gap: 10, backgroundColor: colors.surfaceMuted, borderRadius: 16, padding: 12 },
  sponsorLogoPreview: { width: 64, height: 64, borderRadius: 12, alignSelf: "center", backgroundColor: "#fff" },
  sponsorLogoPreviewDark: { backgroundColor: colors.ink },
  selectedPlayerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  selectedPlayerName: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  actionButtonPrimary: { backgroundColor: colors.purple, borderColor: colors.purple },
  actionButtonText: { color: colors.textPrimary, fontWeight: "700", fontSize: 12 },
  actionButtonTextPrimary: { color: "#fff" },
  assistBox: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  assistTitle: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#fff"
  },
  secondaryButtonText: { color: colors.purple, fontWeight: "700", fontSize: 13 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  eventText: { flex: 1, color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  eventMinute: {
    color: "#fff",
    backgroundColor: colors.purple,
    fontWeight: "800",
    fontSize: 11,
    width: 32,
    height: 24,
    borderRadius: 8,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden"
  },
  eventPoints: { color: colors.textMuted, fontWeight: "700", fontSize: 12 }
});
