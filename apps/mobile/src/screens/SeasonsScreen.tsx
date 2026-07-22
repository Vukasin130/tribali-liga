import React, { useCallback, useEffect, useState } from "react";
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
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
import { Card, EmptyState, ErrorState, LoadingState, Pill, SectionTitle } from "../components/ui";
import { colors } from "../theme/colors";
import { useCompetition } from "../state/CompetitionContext";
import { useAuth } from "../state/AuthContext";
import { MatchDetailModal } from "./MatchDetailModal";
import { TeamProfileModal } from "./TeamProfileModal";
import { LeagueComposerModal } from "./LeagueComposerModal";
import { TeamComposerModal } from "./TeamComposerModal";
import { MatchComposerModal } from "./MatchComposerModal";
import { ScheduleEditorModal } from "./ScheduleEditorModal";

export function SeasonsScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { competitions, competitionId, setCompetitionId, reload: reloadCompetitions } = useCompetition();
  const [hub, setHub] = useState<SeasonHub | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [tab, setTab] = useState<"matches" | "table">("matches");
  const [showLeagueComposer, setShowLeagueComposer] = useState(false);
  const [showLeagueEditor, setShowLeagueEditor] = useState(false);
  const [showTeamComposer, setShowTeamComposer] = useState(false);
  const [showMatchComposer, setShowMatchComposer] = useState(false);
  const [startingLeague, setStartingLeague] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<GeneratedMatch[] | null>(null);
  const [setup, setSetup] = useState<CompetitionSetup | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [championMessage, setChampionMessage] = useState("");
  const [tournamentBusyAction, setTournamentBusyAction] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState("60");
  const [leaguePlayoffTeams, setLeaguePlayoffTeams] = useState("4");

  const load = useCallback(() => {
    if (!competitionId) return;
    setError("");
    fetchSeasonHub(competitionId)
      .then(setHub)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam podatke lige."))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [competitionId]);

  const loadTeams = useCallback(() => {
    if (!competitionId || !isAdmin) return;
    fetchCompetitionTeams(competitionId)
      .then(setTeams)
      .catch(() => setTeams([]));
  }, [competitionId, isAdmin]);

  const [removingTeamId, setRemovingTeamId] = useState("");

  async function handleRemoveTeam(team: Team) {
    setRemovingTeamId(team.id);
    try {
      await updateTeam(team.id, { isActive: false });
      setTeams((previous) => previous.filter((item) => item.id !== team.id));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ekipa nije uklonjena.");
    } finally {
      setRemovingTeamId("");
    }
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

  async function handleStartLeague() {
    if (!competitionId) return;
    setStartingLeague(true);
    setError("");
    try {
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
      setScheduleDraft(enrichMatchNames(generated));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liga nije pokrenuta.");
    } finally {
      setStartingLeague(false);
    }
  }

  const isTournament = hub?.activeCompetition?.kind === "tournament";

  const loadSetup = useCallback(() => {
    if (!competitionId || !isAdmin) {
      setSetup(null);
      return;
    }
    fetchCompetitionSetup(competitionId)
      .then(setSetup)
      .catch(() => setSetup(null));
  }, [competitionId, isAdmin]);

  const groupPhase = setup?.phases.find((phase) => phase.type === "group");
  const knockoutPhaseConfigured = Boolean(setup?.phases.some((phase) => phase.type === "knockout"));
  const knockoutQualifiers = isTournament
    ? (groupPhase?.groupCount || 2) * (groupPhase?.qualifiersPerGroup || 2)
    : Number(leaguePlayoffTeams) || 4;

  async function handleAssignGroups() {
    if (!competitionId) return;
    setTournamentBusyAction("groups");
    setError("");
    try {
      await assignCompetitionGroups(competitionId, { groupCount: groupPhase?.groupCount || 2 });
      loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grupe nisu rasporedjene.");
    } finally {
      setTournamentBusyAction("");
    }
  }

  async function handleGenerateGroupStage() {
    if (!competitionId) return;
    setTournamentBusyAction("group-schedule");
    setError("");
    try {
      const startAt = parseScheduleStartDate();
      const intervalMinutes = parseScheduleIntervalMinutes();
      const generated = await generateCompetitionSchedule(competitionId, { phaseCode: "group", legs: 1, startAt, intervalMinutes });
      await activateCompetition(competitionId);
      setScheduleDraft(enrichMatchNames(generated));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Raspored grupne faze nije napravljen.");
    } finally {
      setTournamentBusyAction("");
    }
  }

  async function handlePrepareKnockout() {
    if (!competitionId) return;
    setTournamentBusyAction("knockout");
    setError("");
    setChampionMessage("");
    try {
      const result = await prepareKnockoutPhase(competitionId, {
        phaseCode: "knockout",
        qualifiersCount: knockoutQualifiers,
        includeThirdPlace: false
      });
      setScheduleDraft(enrichMatchNames(result.matches));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nokaut runda nije pripremljena.");
    } finally {
      setTournamentBusyAction("");
    }
  }

  async function handleAdvanceKnockout() {
    if (!competitionId) return;
    setTournamentBusyAction("advance");
    setError("");
    setChampionMessage("");
    try {
      const result = await advanceKnockoutPhase(competitionId, { phaseCode: "knockout" });
      if (result.champion) {
        setChampionMessage(`${result.champion.teamName} je pobednik turnira!`);
      } else {
        setScheduleDraft(enrichMatchNames(result.matches));
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sledeca runda nije pripremljena.");
    } finally {
      setTournamentBusyAction("");
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    loadSetup();
  }, [loadSetup]);

  const liveMatches = (hub?.matches ?? []).filter((match) => match.status === "live");

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

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={["rgba(20,20,20,0.98)", "rgba(92,69,26,0.96)", "rgba(201,162,39,0.94)"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.hero}
      >
        <TouchableOpacity style={styles.leagueToggle} onPress={() => setPickerOpen(true)}>
          <View>
            <Text style={styles.leagueToggleLabel}>Aktivne lige</Text>
            <Text style={styles.leagueToggleValue}>{hub?.activeCompetition?.name ?? "Izaberi ligu"}</Text>
          </View>
          <Text style={styles.leagueToggleChevron}>⌄</Text>
        </TouchableOpacity>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>{hub?.activeCompetition?.seasonName ?? "Sezona"}</Text>
          {isAdmin ? (
            <View style={styles.heroButtonsRow}>
              {hub?.activeCompetition ? (
                <TouchableOpacity style={styles.editLeagueButton} onPress={() => setShowLeagueEditor(true)}>
                  <Ionicons name="pencil-outline" size={16} color="#fff" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.newLeagueButton} onPress={() => setShowLeagueComposer(true)}>
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={styles.newLeagueButtonText}>Nova liga</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabButton, tab === "matches" ? styles.tabButtonActive : null]} onPress={() => setTab("matches")}>
          <Text style={[styles.tabButtonText, tab === "matches" ? styles.tabButtonTextActive : null]}>Utakmice</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "table" ? styles.tabButtonActive : null]} onPress={() => setTab("table")}>
          <Text style={[styles.tabButtonText, tab === "table" ? styles.tabButtonTextActive : null]}>Tabela</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState label="Ucitavanje..." />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.purple} />}
        >
          {error ? <ErrorState message={error} onRetry={load} /> : null}

          {tab === "matches" ? (
            <>
              {isAdmin && competitionId ? (
                <Card style={styles.adminTeamsCard}>
                  <SectionTitle eyebrow="Admin" title="Ekipe u ligi" />
                  {teams.length === 0 ? (
                    <Text style={styles.adminHint}>Ova liga jos nema ekipe. Dodaj bar dve da bi mogao da zakazujes utakmice.</Text>
                  ) : (
                    <View style={styles.chipsRow}>
                      {teams.map((team) => (
                        <View key={team.id} style={styles.teamChip}>
                          <Text style={styles.teamChipText}>{team.name}</Text>
                          <TouchableOpacity
                            onPress={() => handleRemoveTeam(team)}
                            disabled={removingTeamId === team.id}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={styles.adminButtonsRow}>
                    <TouchableOpacity style={styles.adminActionButton} onPress={() => setShowTeamComposer(true)}>
                      <Text style={styles.adminActionButtonText}>Dodaj ekipu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.adminActionButtonPrimary, teams.length < 2 ? styles.adminActionButtonDisabled : null]}
                      onPress={() => setShowMatchComposer(true)}
                      disabled={teams.length < 2}
                    >
                      <Text style={styles.adminActionButtonPrimaryText}>Zakazi utakmicu</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.startDateField}>
                    <Text style={styles.startDateLabel}>Datum pocetka (opciono)</Text>
                    <TextInput
                      style={styles.startDateInput}
                      value={scheduleStartDate}
                      onChangeText={setScheduleStartDate}
                      placeholder="DD.MM.GGGG, npr. 01.09.2026"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={styles.adminHint}>Ako ostavis prazno, raspored krece od danasnjeg datuma.</Text>
                  </View>

                  <View style={styles.startDateField}>
                    <Text style={styles.startDateLabel}>Razmak izmedju utakmica (minuti)</Text>
                    <TextInput
                      style={styles.startDateInput}
                      value={scheduleIntervalMinutes}
                      onChangeText={setScheduleIntervalMinutes}
                      placeholder="60"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.adminHint}>Koliko minuta razmaka izmedju uzastopnih termina kad se generise raspored.</Text>
                  </View>

                  {isTournament ? (
                    <>
                      <TouchableOpacity
                        style={[styles.startLeagueButton, teams.length < 2 || tournamentBusyAction ? styles.adminActionButtonDisabled : null]}
                        onPress={handleAssignGroups}
                        disabled={teams.length < 2 || !!tournamentBusyAction}
                      >
                        <Ionicons name="grid-outline" size={16} color="#fff" />
                        <Text style={styles.startLeagueButtonText}>
                          {tournamentBusyAction === "groups" ? "Raspoređivanje..." : `1. Rasporedi ekipe u ${groupPhase?.groupCount || 2} grupe`}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.startLeagueButton, teams.length < 2 || tournamentBusyAction ? styles.adminActionButtonDisabled : null]}
                        onPress={handleGenerateGroupStage}
                        disabled={teams.length < 2 || !!tournamentBusyAction}
                      >
                        <Ionicons name="shuffle-outline" size={16} color="#fff" />
                        <Text style={styles.startLeagueButtonText}>
                          {tournamentBusyAction === "group-schedule" ? "Generisanje..." : "2. Generisi raspored grupne faze"}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.startLeagueButton, teams.length < 2 || startingLeague ? styles.adminActionButtonDisabled : null]}
                        onPress={handleStartLeague}
                        disabled={teams.length < 2 || startingLeague}
                      >
                        <Ionicons name="shuffle-outline" size={16} color="#fff" />
                        <Text style={styles.startLeagueButtonText}>
                          {startingLeague ? "Generisanje rasporeda..." : "Startuj ligu (svako sa svakim)"}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.adminHint}>
                        Ovo automatski generise raspored gde svaka ekipa igra sa svakom po jednom, razvrstan po kolima. Ako vec postoji raspored, zamenice ga novim.
                      </Text>
                    </>
                  )}

                  <View style={styles.knockoutDivider}>
                    <Text style={styles.startDateLabel}>Nokaut faza{isTournament ? "" : " (plej-of)"}</Text>
                  </View>

                  {!isTournament ? (
                    <View style={styles.startDateField}>
                      <Text style={styles.startDateLabel}>Koliko ekipa ide u plej-of</Text>
                      <TextInput
                        style={styles.startDateInput}
                        value={leaguePlayoffTeams}
                        onChangeText={setLeaguePlayoffTeams}
                        placeholder="4"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.adminHint}>Top N ekipa iz tabele regularnog dela ulazi u nokaut rundu.</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.startLeagueButton, tournamentBusyAction ? styles.adminActionButtonDisabled : null]}
                    onPress={handlePrepareKnockout}
                    disabled={!!tournamentBusyAction}
                  >
                    <Ionicons name="trophy-outline" size={16} color="#fff" />
                    <Text style={styles.startLeagueButtonText}>
                      {tournamentBusyAction === "knockout"
                        ? "Pripremanje..."
                        : `Pripremi nokaut rundu (top ${knockoutQualifiers} iz tabele)`}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.startLeagueButton, tournamentBusyAction ? styles.adminActionButtonDisabled : null]}
                    onPress={handleAdvanceKnockout}
                    disabled={!!tournamentBusyAction}
                  >
                    <Ionicons name="arrow-forward-circle-outline" size={16} color="#fff" />
                    <Text style={styles.startLeagueButtonText}>
                      {tournamentBusyAction === "advance" ? "Pripremanje..." : "Sledeca nokaut runda (iz pobednika)"}
                    </Text>
                  </TouchableOpacity>
                  {championMessage ? <Text style={styles.championText}>🏆 {championMessage}</Text> : null}
                  <Text style={styles.adminHint}>
                    {isTournament
                      ? "Prvo rasporedi grupe i generisi raspored grupne faze. Zatim ovde pripremi prvu nokaut rundu (npr. polufinala) iz tabele grupa - kad se sve utakmice runde odigraju i unesu rezultati, priprema sledecu rundu automatski iz pobednika, dok ne ostane samo jedan sampion."
                      : `Kad odigras dovoljno kola, ovo pravi nokaut/plej-of rundu iz top ${knockoutQualifiers} ekipa tabele regularnog dela (ne racunaju se rezultati nokaut faze u tu tabelu). Kad se runda odigra, priprema sledecu iz pobednika, dok ne ostane samo jedan sampion.`}
                  </Text>
                  {!knockoutPhaseConfigured ? (
                    <Text style={styles.adminHint}>
                      Napomena: nokaut faza ce se prvi put podesiti kad {isTournament ? "generisas raspored grupne faze" : "startujes ligu"}.
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              {liveMatches.length > 0 ? (
                <View style={styles.section}>
                  <SectionTitle eyebrow="Sada" title="Live utakmice" />
                  {liveMatches.map((match) => (
                    <TouchableOpacity key={match.id} onPress={() => setActiveMatchId(match.id)}>
                      <Card style={styles.matchCard}>
                        <Pill label="LIVE" tone="live" />
                        <View style={styles.matchRow}>
                          <Text style={styles.matchTeam}>{match.homeTeamShortName || match.homeTeamName}</Text>
                          <Text style={styles.matchScore}>{match.homeScore} : {match.awayScore}</Text>
                          <Text style={styles.matchTeam}>{match.awayTeamShortName || match.awayTeamName}</Text>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {roundNumbers.length > 0 ? (
                <View style={styles.roundNav}>
                  <TouchableOpacity
                    style={[styles.circleButton, roundIndex <= 0 ? styles.circleButtonDisabled : null]}
                    onPress={() => setRoundIndex((index) => Math.max(0, index - 1))}
                    disabled={roundIndex <= 0}
                  >
                    <Ionicons name="chevron-back" size={22} color={colors.ink} />
                  </TouchableOpacity>
                  <View style={styles.roundNavCenter}>
                    <Text style={styles.roundNavTitle}>{roundLabel}</Text>
                    <Text style={styles.roundNavCopy}>
                      {roundMatches.length} {roundMatches.length === 1 ? "utakmica" : "utakmica"}
                      {roundMatches[0]?.scheduledAt ? ` - ${formatShortDate(roundMatches[0].scheduledAt)}` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.circleButton, roundIndex >= roundNumbers.length - 1 ? styles.circleButtonDisabled : null]}
                    onPress={() => setRoundIndex((index) => Math.min(roundNumbers.length - 1, index + 1))}
                    disabled={roundIndex >= roundNumbers.length - 1}
                  >
                    <Ionicons name="chevron-forward" size={22} color={colors.ink} />
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.section}>
                {roundNumbers.length === 0 ? <SectionTitle title="Utakmice" /> : null}
                {roundDayGroups.length === 0 ? (
                  <EmptyState
                    message={roundNumbers.length > 0 ? "Nema utakmica u ovom kolu." : "Nema zakazanih utakmica."}
                  />
                ) : null}
                {roundDayGroups.map((group) => (
                  <View key={group.key} style={styles.dayGroup}>
                    <Text style={styles.dayTitle}>{group.title}</Text>
                    {group.matches.map((match) => (
                      <TouchableOpacity key={match.id} onPress={() => setActiveMatchId(match.id)}>
                        <FixtureCard match={match} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>

              {unroundedDayGroups.length > 0 ? (
                <View style={styles.section}>
                  <SectionTitle title="Ostale utakmice (bez kola)" />
                  {unroundedDayGroups.map((group) => (
                    <View key={group.key} style={styles.dayGroup}>
                      <Text style={styles.dayTitle}>{group.title}</Text>
                      {group.matches.map((match) => (
                        <TouchableOpacity key={match.id} onPress={() => setActiveMatchId(match.id)}>
                          <FixtureCard match={match} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.section}>
              {(hub?.standings ?? []).length === 0 ? <EmptyState message="Tabela jos nije dostupna." /> : null}
              {(hub?.standings ?? []).map((group) => (
                <Card key={group.name} style={styles.standingsCard}>
                  {group.name && group.name !== "Tabela" ? <Text style={styles.groupName}>{group.name}</Text> : null}
                  <View style={styles.standingsHead}>
                    <Text style={[styles.standingsHeadText, styles.standingsRank]}>#</Text>
                    <Text style={[styles.standingsHeadText, styles.standingsName]}>Ekipa</Text>
                    <Text style={styles.standingsHeadText}>OD</Text>
                    <Text style={styles.standingsHeadText}>GR</Text>
                    <Text style={styles.standingsHeadText}>BOD</Text>
                  </View>
                  {group.rows.map((row, index) => (
                    <TouchableOpacity key={row.id} style={styles.standingsRow} onPress={() => setActiveTeamId(row.teamId)}>
                      <Text style={styles.standingsRank}>{row.position ?? index + 1}</Text>
                      <Text style={styles.standingsName} numberOfLines={1}>{row.teamShortName || row.teamName}</Text>
                      <Text style={styles.standingsCell}>{row.played}</Text>
                      <Text style={styles.standingsCell}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Text>
                      <Text style={styles.standingsPoints}>{row.points}</Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Izaberi ligu</Text>
            <ScrollView>
              {competitions.map((competition) => (
                <TouchableOpacity
                  key={competition.id}
                  style={styles.modalOption}
                  onPress={() => {
                    setCompetitionId(competition.id);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalOptionCity}>{competition.cityName}</Text>
                  <Text style={styles.modalOptionName}>{competition.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

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
            load();
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
            loadTeams();
            load();
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
            load();
          }}
        />
      ) : null}

      {scheduleDraft ? (
        <ScheduleEditorModal
          matches={scheduleDraft}
          onClose={() => setScheduleDraft(null)}
          onSaved={() => load()}
        />
      ) : null}
    </View>
  );
}

function formatShortDate(value: string): string {
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

function groupMatchesByDay(matches: MatchSummary[]): { key: string; title: string; matches: MatchSummary[] }[] {
  const groups = new Map<string, { key: string; title: string; matches: MatchSummary[] }>();
  matches.forEach((match) => {
    const key = dayKey(match.scheduledAt);
    if (!groups.has(key)) groups.set(key, { key, title: dayTitle(match.scheduledAt), matches: [] });
    groups.get(key)!.matches.push(match);
  });
  return Array.from(groups.values());
}

function fixtureTime(match: MatchSummary): string {
  if (match.status === "finished") return `${match.homeScore} : ${match.awayScore}`;
  if (match.status === "live") return "LIVE";
  const date = new Date(match.scheduledAt);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" });
}

function fixtureMeta(match: MatchSummary): string {
  if (match.status === "finished") return "Odigrano";
  if (match.status === "live") return "Uzivo";
  return "Zakazano";
}

function FixtureCard({ match }: { match: MatchSummary }) {
  return (
    <View style={styles.fixtureCard}>
      <View style={styles.fixtureTeam}>
        <Text style={styles.fixtureTeamName} numberOfLines={2}>{match.homeTeamName || "Domacin"}</Text>
        <Text style={styles.fixtureTeamLabel}>Domacin</Text>
      </View>
      <View style={styles.fixtureCenter}>
        <View style={[styles.fixtureAccent, match.status === "live" ? styles.fixtureAccentLive : null]} />
        <Text style={[styles.fixtureTime, match.status === "live" ? styles.fixtureTimeLive : null]}>{fixtureTime(match)}</Text>
        <Text style={styles.fixtureMeta}>{fixtureMeta(match)}</Text>
      </View>
      <View style={styles.fixtureTeam}>
        <Text style={styles.fixtureTeamName} numberOfLines={2}>{match.awayTeamName || "Gost"}</Text>
        <Text style={styles.fixtureTeamLabel}>Gost</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 22,
    gap: 14,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28
  },
  leagueToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  leagueToggleLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  leagueToggleValue: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 2 },
  leagueToggleChevron: { color: "#fff", fontSize: 18 },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "700" },
  heroTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroButtonsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  editLeagueButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center"
  },
  newLeagueButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  newLeagueButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  tabs: { flexDirection: "row", paddingHorizontal: 20, marginTop: 14, gap: 22, borderBottomWidth: 1, borderBottomColor: colors.line },
  tabButton: { paddingBottom: 10 },
  tabButtonActive: { borderBottomWidth: 2, borderBottomColor: colors.ink },
  tabButtonText: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },
  tabButtonTextActive: { color: colors.ink, fontWeight: "700" },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 40, gap: 18 },
  section: { gap: 10 },
  adminTeamsCard: { gap: 12 },
  adminHint: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  startDateField: { gap: 6, marginBottom: 4 },
  startDateLabel: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  startDateInput: {
    borderWidth: 1,
    borderColor: "rgba(20,20,20,0.16)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: "#fff"
  },
  knockoutDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
    marginTop: 4
  },
  championText: { color: colors.ink, fontWeight: "800", fontSize: 14, textAlign: "center" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  teamChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  teamChipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 12 },
  adminButtonsRow: { flexDirection: "row", gap: 10 },
  adminActionButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#fff"
  },
  adminActionButtonText: { color: colors.purple, fontWeight: "700", fontSize: 13 },
  adminActionButtonPrimary: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, backgroundColor: colors.purple },
  adminActionButtonPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  adminActionButtonDisabled: { opacity: 0.4 },
  startLeagueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.ink
  },
  startLeagueButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  roundNav: { flexDirection: "row", alignItems: "center", gap: 10 },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#141414",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  circleButtonDisabled: { opacity: 0.35 },
  roundNavCenter: { flex: 1, alignItems: "center" },
  roundNavTitle: { color: colors.ink, fontWeight: "800", fontSize: 20 },
  roundNavCopy: { color: colors.textMuted, fontWeight: "600", fontSize: 12, marginTop: 2 },
  dayGroup: { gap: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  dayTitle: { color: colors.ink, fontWeight: "800", fontSize: 17 },
  fixtureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#fff",
    shadowColor: "#141414",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  fixtureTeam: { flex: 1, gap: 3 },
  fixtureTeamName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  fixtureTeamLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
  fixtureCenter: { width: 76, alignItems: "center", gap: 3 },
  fixtureAccent: { width: 30, height: 3, borderRadius: 999, backgroundColor: colors.aqua, marginBottom: 2 },
  fixtureAccentLive: { backgroundColor: colors.live },
  fixtureTime: { color: "#141414", fontWeight: "800", fontSize: 18 },
  fixtureTimeLive: { color: colors.live },
  fixtureMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
  matchCard: { gap: 10 },
  matchCardCompact: { gap: 6 },
  matchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  matchTeam: { flex: 1, color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  matchTeamCompact: { flex: 1, color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  matchScore: { color: colors.pink, fontWeight: "700", fontSize: 22, marginHorizontal: 10 },
  matchScoreCompact: { color: colors.pink, fontWeight: "700", fontSize: 15, marginHorizontal: 10 },
  matchVs: { color: colors.textMuted, fontWeight: "600", marginHorizontal: 8 },
  matchDate: { color: colors.textMuted, fontSize: 12 },
  standingsCard: { gap: 8 },
  groupName: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  standingsHead: { flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  standingsHeadText: { flex: 1, color: colors.textMuted, fontWeight: "700", fontSize: 11, textAlign: "center" },
  standingsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  standingsRank: { width: 28, color: colors.textMuted, fontWeight: "700", textAlign: "center" },
  standingsName: { flex: 2, color: colors.textPrimary, fontWeight: "600" },
  standingsCell: { flex: 1, color: colors.textMuted, textAlign: "center", fontWeight: "600" },
  standingsPoints: { flex: 1, color: colors.pink, textAlign: "center", fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,10,10,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "70%" },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
  modalOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalOptionCity: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  modalOptionName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" }
});
