import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateCompetition,
  advanceKnockoutPhase,
  assignCompetitionGroups,
  configureCompetition,
  fetchCompetitionSetup,
  fetchCompetitionTeams,
  fetchSeasonHub,
  generateCompetitionSchedule,
  prepareKnockoutPhase,
  updateTeam
} from "../api/endpoints";
import type { CompetitionSetup, GeneratedMatch, MatchSummary, SeasonHub, Team } from "../api/types";
import { useCompetition } from "../state/CompetitionContext";
import { useAuth } from "../state/AuthContext";
import { MatchDetailModal } from "./MatchDetailModal";
import { TeamProfileModal } from "./TeamProfileModal";
import { LeagueComposerModal } from "./LeagueComposerModal";
import { TeamComposerModal } from "./TeamComposerModal";
import { MatchComposerModal } from "./MatchComposerModal";
import { ScheduleEditorModal } from "./ScheduleEditorModal";
import { LiveMatchAdminModal } from "./LiveMatchAdminModal";

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit" });
}

function dayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayTitle(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Termin nije unet";
  return date.toLocaleDateString("sr-RS", { weekday: "short", day: "2-digit", month: "short" });
}

export function groupMatchesByDay(matches: MatchSummary[]): { key: string; title: string; matches: MatchSummary[] }[] {
  const groups = new Map<string, { key: string; title: string; matches: MatchSummary[] }>();
  matches.forEach((match) => {
    const key = dayKey(match.scheduledAt);
    if (!groups.has(key)) groups.set(key, { key, title: dayTitle(match.scheduledAt), matches: [] });
    groups.get(key)!.matches.push(match);
  });
  return Array.from(groups.values());
}

// All the "Seasons" screen's data-fetching, mutations and derived state, shared verbatim
// between the mobile screen (apps/mobile) and the desktop layout (apps/desktop) - each
// renders its own JSX from this same hook's return value, so there is exactly one copy
// of the logic and one source of truth for the data.
export function useSeasonsScreenState() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const {
    competitions,
    competitionId,
    setCompetitionId,
    reload: reloadCompetitions,
    loading: competitionsLoading
  } = useCompetition();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [tab, setTab] = useState<"matches" | "table">("matches");
  const [showLeagueComposer, setShowLeagueComposer] = useState(false);
  const [showLeagueEditor, setShowLeagueEditor] = useState(false);
  const [showTeamComposer, setShowTeamComposer] = useState(false);
  const [showMatchComposer, setShowMatchComposer] = useState(false);
  const [showLiveAdmin, setShowLiveAdmin] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<GeneratedMatch[] | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [championMessage, setChampionMessage] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState("60");
  const [leaguePlayoffTeams, setLeaguePlayoffTeams] = useState("4");

  const hubQuery = useQuery({
    queryKey: ["seasonHub", competitionId],
    queryFn: () => fetchSeasonHub(competitionId),
    enabled: Boolean(competitionId)
  });
  const hub: SeasonHub | null = hubQuery.data ?? null;
  // While the competitions list itself is still loading, or a league is selected and
  // its hub data hasn't arrived yet, show the loading state rather than briefly
  // flashing an empty screen. But once the competitions list has genuinely loaded and
  // there is no competition to select (a fresh install with no leagues yet), that is
  // not "still loading" - stop spinning and let the empty state render instead.
  const loading = competitionsLoading || (Boolean(competitionId) && hubQuery.isLoading);

  useEffect(() => {
    if (hubQuery.isSuccess) setError("");
    else if (hubQuery.error) setError(hubQuery.error instanceof Error ? hubQuery.error.message : "Ne mogu da ucitam podatke lige.");
  }, [hubQuery.isSuccess, hubQuery.error]);

  const teamsQuery = useQuery({
    queryKey: ["competitionTeams", competitionId],
    queryFn: () => fetchCompetitionTeams(competitionId),
    enabled: Boolean(competitionId) && isAdmin
  });
  const teams: Team[] = teamsQuery.data ?? [];

  const setupQuery = useQuery({
    queryKey: ["competitionSetup", competitionId],
    queryFn: () => fetchCompetitionSetup(competitionId),
    enabled: Boolean(competitionId) && isAdmin
  });
  // Original clears setup immediately (not just leaves it stale) once the enabling
  // condition no longer holds - match that instead of showing cached data from before.
  const setup: CompetitionSetup | null = competitionId && isAdmin ? (setupQuery.data ?? null) : null;

  const removeTeamMutation = useMutation({
    mutationFn: (team: Team) => updateTeam(team.id, { isActive: false }),
    onMutate: () => setError(""),
    onSuccess: (_data, team) => {
      queryClient.setQueryData<Team[]>(["competitionTeams", competitionId], (previous) =>
        (previous ?? []).filter((item) => item.id !== team.id)
      );
      queryClient.invalidateQueries({ queryKey: ["seasonHub", competitionId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Ekipa nije uklonjena.")
  });

  function handleRemoveTeam(team: Team) {
    removeTeamMutation.mutate(team);
  }

  function enrichMatchNames(matches: GeneratedMatch[]): GeneratedMatch[] {
    const byId = new Map(teams.map((team) => [team.id, team.name]));
    return matches.map((match) => ({
      ...match,
      homeTeamName: match.homeTeamName || byId.get(match.homeTeamId) || "?",
      awayTeamName: match.awayTeamName || byId.get(match.awayTeamId) || "?"
    }));
  }

  function parseScheduleStartDate(): string | undefined {
    const raw = scheduleStartDate.trim();
    if (!raw) return undefined;
    const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) {
      throw new Error("Datum pocetka mora biti u formatu DD.MM.GGGG (npr. 01.09.2026).");
    }
    const [, day, month, year] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), 18, 0, 0);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Datum pocetka nije validan.");
    }
    return date.toISOString();
  }

  function parseScheduleIntervalMinutes(): number | undefined {
    const raw = scheduleIntervalMinutes.trim();
    if (!raw) return undefined;
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error("Razmak izmedju utakmica mora biti broj minuta veci od 0.");
    }
    return minutes;
  }

  const startLeagueMutation = useMutation({
    mutationFn: async () => {
      if (!competitionId) throw new Error("Liga nije izabrana.");
      const startAt = parseScheduleStartDate();
      const intervalMinutes = parseScheduleIntervalMinutes();
      await configureCompetition(competitionId, {
        formatType: "league",
        phases: [
          { code: "regular", name: "Regularni deo", type: "league", sequence: 1, legs: 1 },
          { code: "knockout", name: "Nokaut faza", type: "knockout", sequence: 2, legs: 1 }
        ]
      });
      const generated = await generateCompetitionSchedule(competitionId, { phaseCode: "regular", legs: 1, startAt, intervalMinutes });
      await activateCompetition(competitionId);
      return generated;
    },
    onMutate: () => setError(""),
    onSuccess: (generated) => {
      setScheduleDraft(enrichMatchNames(generated));
      queryClient.invalidateQueries({ queryKey: ["seasonHub", competitionId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Liga nije pokrenuta.")
  });

  function handleStartLeague() {
    startLeagueMutation.mutate();
  }

  const isTournament = hub?.activeCompetition?.kind === "tournament";

  const groupPhase = setup?.phases.find((phase) => phase.type === "group");
  const knockoutPhaseConfigured = Boolean(setup?.phases.some((phase) => phase.type === "knockout"));
  const knockoutQualifiers = isTournament
    ? (groupPhase?.groupCount || 2) * (groupPhase?.qualifiersPerGroup || 2)
    : Number(leaguePlayoffTeams) || 4;

  const assignGroupsMutation = useMutation({
    mutationFn: () => {
      if (!competitionId) throw new Error("Liga nije izabrana.");
      return assignCompetitionGroups(competitionId, { groupCount: groupPhase?.groupCount || 2 });
    },
    onMutate: () => setError(""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["competitionTeams", competitionId] }),
    onError: (err) => setError(err instanceof Error ? err.message : "Grupe nisu rasporedjene.")
  });

  function handleAssignGroups() {
    assignGroupsMutation.mutate();
  }

  const generateGroupStageMutation = useMutation({
    mutationFn: async () => {
      if (!competitionId) throw new Error("Liga nije izabrana.");
      const startAt = parseScheduleStartDate();
      const intervalMinutes = parseScheduleIntervalMinutes();
      const generated = await generateCompetitionSchedule(competitionId, { phaseCode: "group", legs: 1, startAt, intervalMinutes });
      await activateCompetition(competitionId);
      return generated;
    },
    onMutate: () => setError(""),
    onSuccess: (generated) => {
      setScheduleDraft(enrichMatchNames(generated));
      queryClient.invalidateQueries({ queryKey: ["seasonHub", competitionId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Raspored grupne faze nije napravljen.")
  });

  function handleGenerateGroupStage() {
    generateGroupStageMutation.mutate();
  }

  const prepareKnockoutMutation = useMutation({
    mutationFn: () => {
      if (!competitionId) throw new Error("Liga nije izabrana.");
      return prepareKnockoutPhase(competitionId, {
        phaseCode: "knockout",
        qualifiersCount: knockoutQualifiers,
        includeThirdPlace: false
      });
    },
    onMutate: () => {
      setError("");
      setChampionMessage("");
    },
    onSuccess: (result) => setScheduleDraft(enrichMatchNames(result.matches)),
    onError: (err) => setError(err instanceof Error ? err.message : "Nokaut runda nije pripremljena.")
  });

  function handlePrepareKnockout() {
    prepareKnockoutMutation.mutate();
  }

  const advanceKnockoutMutation = useMutation({
    mutationFn: () => {
      if (!competitionId) throw new Error("Liga nije izabrana.");
      return advanceKnockoutPhase(competitionId, { phaseCode: "knockout" });
    },
    onMutate: () => {
      setError("");
      setChampionMessage("");
    },
    onSuccess: (result) => {
      if (result.champion) {
        setChampionMessage(`${result.champion.teamName} je pobednik turnira!`);
      } else {
        setScheduleDraft(enrichMatchNames(result.matches));
      }
      queryClient.invalidateQueries({ queryKey: ["seasonHub", competitionId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Sledeca runda nije pripremljena.")
  });

  function handleAdvanceKnockout() {
    advanceKnockoutMutation.mutate();
  }

  const tournamentBusy =
    assignGroupsMutation.isPending ||
    generateGroupStageMutation.isPending ||
    prepareKnockoutMutation.isPending ||
    advanceKnockoutMutation.isPending;

  // Group by the match's own round number rather than gameweekId - imported/legacy
  // matches and ad-hoc "Zakazi utakmicu" matches often never get bucketed into a
  // gameweek, but round is always populated once a schedule (robin or manual) exists.
  const allMatches = hub?.matches ?? [];
  const roundNumbers = Array.from(
    new Set(allMatches.map((match) => match.round).filter((round): round is number => round !== null && round !== undefined))
  ).sort((a, b) => a - b);
  const unroundedMatches = allMatches
    .filter((match) => match.round === null || match.round === undefined)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  useEffect(() => {
    if (!roundNumbers.length) {
      setRoundIndex(0);
      return;
    }
    const firstUnfinished = roundNumbers.findIndex((round) =>
      allMatches.some((match) => match.round === round && match.status !== "finished")
    );
    setRoundIndex(firstUnfinished >= 0 ? firstUnfinished : roundNumbers.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub?.activeCompetition?.id, roundNumbers.length]);

  const activeRound = roundNumbers[roundIndex];
  const roundMatches = (roundNumbers.length ? allMatches.filter((match) => match.round === activeRound) : allMatches).sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
  const roundLabel = roundMatches[0]?.gameweekName || (activeRound !== undefined ? `Kolo ${activeRound}` : "Utakmice");
  const roundDayGroups = groupMatchesByDay(roundMatches);
  const unroundedDayGroups = groupMatchesByDay(unroundedMatches);

  // Shared by both the mobile and desktop layouts, unchanged either way.
  const modals = (
    <>
      {activeMatchId ? <MatchDetailModal matchId={activeMatchId} onClose={() => setActiveMatchId(null)} /> : null}
      {activeTeamId ? <TeamProfileModal teamId={activeTeamId} onClose={() => setActiveTeamId(null)} /> : null}

      {showLeagueComposer ? (
        <LeagueComposerModal
          onClose={() => setShowLeagueComposer(false)}
          onSaved={(competition) => {
            setShowLeagueComposer(false);
            reloadCompetitions();
            setCompetitionId(competition.id);
          }}
        />
      ) : null}

      {showLeagueEditor && hub?.activeCompetition ? (
        <LeagueComposerModal
          competition={hub.activeCompetition}
          onClose={() => setShowLeagueEditor(false)}
          onSaved={() => {
            setShowLeagueEditor(false);
            reloadCompetitions();
            hubQuery.refetch();
          }}
          onDeleted={() => {
            setShowLeagueEditor(false);
            setCompetitionId("");
            reloadCompetitions();
          }}
        />
      ) : null}

      {showTeamComposer ? (
        <TeamComposerModal
          competitionId={competitionId}
          existingTeamNames={teams.map((team) => team.name)}
          onClose={() => setShowTeamComposer(false)}
          onSaved={() => {
            setShowTeamComposer(false);
            teamsQuery.refetch();
            hubQuery.refetch();
          }}
        />
      ) : null}

      {showMatchComposer ? (
        <MatchComposerModal
          competitionId={competitionId}
          teams={teams}
          onClose={() => setShowMatchComposer(false)}
          onSaved={() => {
            setShowMatchComposer(false);
            hubQuery.refetch();
          }}
        />
      ) : null}

      {scheduleDraft ? (
        <ScheduleEditorModal
          matches={scheduleDraft}
          onClose={() => setScheduleDraft(null)}
          onSaved={() => hubQuery.refetch()}
        />
      ) : null}

      {showLiveAdmin ? (
        <LiveMatchAdminModal
          initialCompetitionId={competitionId}
          onClose={() => setShowLiveAdmin(false)}
          onChanged={() => {
            hubQuery.refetch();
            teamsQuery.refetch();
          }}
        />
      ) : null}
    </>
  );

  return {
    isAdmin,
    competitions,
    competitionId,
    setCompetitionId,
    error,
    pickerOpen,
    setPickerOpen,
    activeMatchId,
    setActiveMatchId,
    activeTeamId,
    setActiveTeamId,
    tab,
    setTab,
    showLeagueComposer,
    setShowLeagueComposer,
    showLeagueEditor,
    setShowLeagueEditor,
    showTeamComposer,
    setShowTeamComposer,
    showMatchComposer,
    setShowMatchComposer,
    showLiveAdmin,
    setShowLiveAdmin,
    roundIndex,
    setRoundIndex,
    championMessage,
    scheduleStartDate,
    setScheduleStartDate,
    scheduleIntervalMinutes,
    setScheduleIntervalMinutes,
    leaguePlayoffTeams,
    setLeaguePlayoffTeams,
    hub,
    loading,
    hubQuery,
    teams,
    teamsQuery,
    setup,
    removeTeamMutation,
    handleRemoveTeam,
    startLeagueMutation,
    handleStartLeague,
    isTournament,
    groupPhase,
    knockoutPhaseConfigured,
    knockoutQualifiers,
    assignGroupsMutation,
    handleAssignGroups,
    generateGroupStageMutation,
    handleGenerateGroupStage,
    prepareKnockoutMutation,
    handlePrepareKnockout,
    advanceKnockoutMutation,
    handleAdvanceKnockout,
    tournamentBusy,
    roundNumbers,
    unroundedMatches,
    roundMatches,
    roundLabel,
    roundDayGroups,
    unroundedDayGroups,
    modals
  };
}
