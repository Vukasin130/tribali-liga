import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MatchSummary, StandingGroup } from "@tribali-liga/mobile/shared";
import {
  Card,
  ErrorState,
  LoadingState,
  Pill,
  PrimaryButton,
  SectionTitle,
  TeamCrest,
  colors,
  fixtureMeta,
  fixtureTime,
  formatShortDate,
  useSeasonsScreenState
} from "@tribali-liga/mobile/shared";
import { DesktopTable, type DesktopTableColumn } from "../components/DesktopTable";

export function SeasonsScreenDesktop() {
  const {
    isAdmin,
    competitions,
    setCompetitionId,
    error,
    pickerOpen,
    setPickerOpen,
    setActiveMatchId,
    setActiveTeamId,
    tab,
    setTab,
    setShowLeagueComposer,
    setShowLeagueEditor,
    setShowTeamComposer,
    setShowMatchComposer,
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
    liveMatches,
    roundNumbers,
    roundMatches,
    roundLabel,
    unroundedMatches,
    modals
  } = useSeasonsScreenState();

  const activeCompetition = hub?.activeCompetition ?? null;
  const standings = hub?.standings ?? [];
  const groupCount = groupPhase?.groupCount || 2;

  const matchColumns: DesktopTableColumn<MatchSummary>[] = [
    {
      key: "when",
      label: "Kolo / Datum",
      width: 170,
      render: (match) => (
        <View>
          <Text style={styles.cellStrong}>{match.round ? `Kolo ${match.round}` : match.phase}</Text>
          <Text style={styles.cellMuted}>{formatShortDate(match.scheduledAt)}</Text>
        </View>
      )
    },
    {
      key: "home",
      label: "Domacin",
      render: (match) => (
        <View style={styles.teamCell}>
          <TeamCrest teamId={match.homeTeamId} name={match.homeTeamName} logoUrl={match.homeTeamLogoUrl} size={24} />
          <Text style={styles.cellStrong} numberOfLines={1}>{match.homeTeamName}</Text>
        </View>
      )
    },
    {
      key: "away",
      label: "Gost",
      render: (match) => (
        <View style={styles.teamCell}>
          <TeamCrest teamId={match.awayTeamId} name={match.awayTeamName} logoUrl={match.awayTeamLogoUrl} size={24} />
          <Text style={styles.cellStrong} numberOfLines={1}>{match.awayTeamName}</Text>
        </View>
      )
    },
    {
      key: "score",
      label: "Rezultat",
      width: 110,
      align: "center",
      render: (match) => (
        <Text style={[styles.cellStrong, match.status === "live" ? styles.liveText : null]}>{fixtureTime(match)}</Text>
      )
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      align: "center",
      render: (match) => <Pill label={fixtureMeta(match)} tone={match.status === "live" ? "live" : "neutral"} />
    }
  ];

  const standingColumns: DesktopTableColumn<StandingGroup["rows"][number]>[] = [
    { key: "rank", label: "#", width: 40, align: "center", render: (row) => <Text style={styles.cellMuted}>{row.position ?? "-"}</Text> },
    {
      key: "team",
      label: "Ekipa",
      render: (row) => (
        <View style={styles.teamCell}>
          <TeamCrest teamId={row.teamId} name={row.teamName} logoUrl={row.logoUrl} size={24} />
          <Text style={styles.cellStrong} numberOfLines={1}>{row.teamName}</Text>
        </View>
      )
    },
    { key: "played", label: "OD", width: 60, align: "center", render: (row) => <Text style={styles.cellMuted}>{row.played}</Text> },
    { key: "wins", label: "P", width: 50, align: "center", render: (row) => <Text style={styles.cellMuted}>{row.wins}</Text> },
    { key: "draws", label: "N", width: 50, align: "center", render: (row) => <Text style={styles.cellMuted}>{row.draws}</Text> },
    { key: "losses", label: "I", width: 50, align: "center", render: (row) => <Text style={styles.cellMuted}>{row.losses}</Text> },
    {
      key: "gd",
      label: "GR",
      width: 60,
      align: "center",
      render: (row) => <Text style={styles.cellMuted}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Text>
    },
    { key: "points", label: "BOD", width: 70, align: "center", render: (row) => <Text style={styles.pointsText}>{row.points}</Text> }
  ];

  return (
    <>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.headerBar}>
          <View>
            <View style={styles.leaguePickerWrap}>
              <PrimaryButton
                variant="ghost"
                label={activeCompetition ? `${activeCompetition.name} - ${activeCompetition.seasonName}` : "Izaberi ligu"}
                onPress={() => setPickerOpen((value) => !value)}
              />
              {pickerOpen ? (
                <View style={styles.leaguePickerPanel}>
                  {competitions.map((competition) => (
                    <PrimaryButton
                      key={competition.id}
                      variant="ghost"
                      label={`${competition.cityName ? `${competition.cityName} - ` : ""}${competition.name} (${competition.seasonName})`}
                      onPress={() => {
                        setCompetitionId(competition.id);
                        setPickerOpen(false);
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          {isAdmin ? (
            <View style={styles.headerActions}>
              {activeCompetition ? <PrimaryButton variant="ghost" label="Izmeni ligu" onPress={() => setShowLeagueEditor(true)} /> : null}
              <PrimaryButton label="Nova liga" onPress={() => setShowLeagueComposer(true)} />
            </View>
          ) : null}
        </View>

        <View style={styles.tabs}>
          <Text style={[styles.tabLabel, tab === "matches" ? styles.tabLabelActive : null]} onPress={() => setTab("matches")}>
            Utakmice
          </Text>
          <Text style={[styles.tabLabel, tab === "table" ? styles.tabLabelActive : null]} onPress={() => setTab("table")}>
            Tabela
          </Text>
        </View>

        {loading ? <LoadingState label="Ucitavanje..." /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={() => hubQuery.refetch()} /> : null}

        {!loading && tab === "matches" ? (
          <>
            {isAdmin && activeCompetition ? (
              <View style={styles.adminGrid}>
                <Card style={styles.adminCard}>
                  <SectionTitle eyebrow="Admin" title="Ekipe u ligi" />
                  {teams.length === 0 ? (
                    <Text style={styles.hint}>Ova liga jos nema ekipe. Dodaj bar dve da bi mogao da zakazujes utakmice.</Text>
                  ) : (
                    <View style={styles.chipsRow}>
                      {teams.map((team) => (
                        <View key={team.id} style={styles.teamChip}>
                          <Text style={styles.teamChipText}>{team.name}</Text>
                          <Text
                            style={styles.chipRemove}
                            onPress={() =>
                              removeTeamMutation.isPending && removeTeamMutation.variables?.id === team.id
                                ? undefined
                                : handleRemoveTeam(team)
                            }
                          >
                            <Ionicons name="close-circle" size={16} color={colors.danger} />
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={styles.adminButtonsRow}>
                    <PrimaryButton variant="ghost" label="Dodaj ekipu" onPress={() => setShowTeamComposer(true)} />
                    <PrimaryButton label="Zakazi utakmicu" onPress={() => setShowMatchComposer(true)} disabled={teams.length < 2} />
                  </View>
                </Card>

                <Card style={styles.adminCard}>
                  <SectionTitle eyebrow="Admin" title="Raspored i takmicenje" />
                  <View style={styles.formRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Datum pocetka (opciono)</Text>
                      <TextInput
                        style={styles.input}
                        value={scheduleStartDate}
                        onChangeText={setScheduleStartDate}
                        placeholder="DD.MM.GGGG"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Razmak (min)</Text>
                      <TextInput
                        style={styles.input}
                        value={scheduleIntervalMinutes}
                        onChangeText={setScheduleIntervalMinutes}
                        placeholder="60"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>

                  {isTournament ? (
                    <>
                      <PrimaryButton
                        label={assignGroupsMutation.isPending ? "Raspoređivanje..." : `1. Rasporedi ekipe u ${groupCount} grupe`}
                        onPress={handleAssignGroups}
                        disabled={teams.length < 2 || tournamentBusy}
                      />
                      <PrimaryButton
                        label={generateGroupStageMutation.isPending ? "Generisanje..." : "2. Generisi raspored grupne faze"}
                        onPress={handleGenerateGroupStage}
                        disabled={teams.length < 2 || tournamentBusy}
                      />
                    </>
                  ) : (
                    <PrimaryButton
                      label={startLeagueMutation.isPending ? "Generisanje rasporeda..." : "Startuj ligu (svako sa svakim)"}
                      onPress={handleStartLeague}
                      disabled={teams.length < 2 || startLeagueMutation.isPending}
                    />
                  )}

                  <View style={styles.knockoutDivider}>
                    <Text style={styles.fieldLabel}>Nokaut faza{isTournament ? "" : " (plej-of)"}</Text>
                  </View>
                  {!isTournament ? (
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Koliko ekipa ide u plej-of</Text>
                      <TextInput
                        style={styles.input}
                        value={leaguePlayoffTeams}
                        onChangeText={setLeaguePlayoffTeams}
                        placeholder="4"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                      />
                    </View>
                  ) : null}
                  <PrimaryButton
                    variant="ghost"
                    label={prepareKnockoutMutation.isPending ? "Pripremanje..." : `Pripremi nokaut rundu (top ${knockoutQualifiers})`}
                    onPress={handlePrepareKnockout}
                    disabled={tournamentBusy}
                  />
                  <PrimaryButton
                    variant="ghost"
                    label={advanceKnockoutMutation.isPending ? "Pripremanje..." : "Sledeca nokaut runda"}
                    onPress={handleAdvanceKnockout}
                    disabled={tournamentBusy}
                  />
                  {championMessage ? <Text style={styles.championText}>🏆 {championMessage}</Text> : null}
                  {!knockoutPhaseConfigured ? (
                    <Text style={styles.hint}>
                      Napomena: nokaut faza ce se prvi put podesiti kad {isTournament ? "generisas raspored grupne faze" : "startujes ligu"}.
                    </Text>
                  ) : null}
                </Card>

                <Card style={[styles.adminCard, styles.liveCard]}>
                  <SectionTitle eyebrow="Matchday" title="Live utakmica" />
                  <Text style={styles.hint}>Roster, izmene, gol-asistencija, kartoni - direktno u bazu.</Text>
                  <PrimaryButton label="Vodi live utakmicu" onPress={() => setShowLiveAdmin(true)} />
                </Card>
              </View>
            ) : null}

            {liveMatches.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle eyebrow="Sada" title="Live utakmice" />
                <View style={styles.liveRow}>
                  {liveMatches.map((match) => (
                    <Text key={match.id} style={styles.liveChip} onPress={() => setActiveMatchId(match.id)}>
                      {match.homeTeamShortName || match.homeTeamName} {match.homeScore} : {match.awayScore} {match.awayTeamShortName || match.awayTeamName}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {roundNumbers.length > 0 ? (
              <View style={styles.roundNav}>
                <Text
                  style={[styles.roundNavArrow, roundIndex <= 0 ? styles.roundNavArrowDisabled : null]}
                  onPress={() => setRoundIndex((index) => Math.max(0, index - 1))}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.ink} />
                </Text>
                <View style={styles.roundNavCenter}>
                  <Text style={styles.roundNavTitle}>{roundLabel}</Text>
                  <Text style={styles.roundNavCopy}>{roundMatches.length} utakmica</Text>
                </View>
                <Text
                  style={[styles.roundNavArrow, roundIndex >= roundNumbers.length - 1 ? styles.roundNavArrowDisabled : null]}
                  onPress={() => setRoundIndex((index) => Math.min(roundNumbers.length - 1, index + 1))}
                >
                  <Ionicons name="chevron-forward" size={20} color={colors.ink} />
                </Text>
              </View>
            ) : null}

            <View style={styles.section}>
              {roundNumbers.length === 0 ? <SectionTitle title="Utakmice" /> : null}
              <DesktopTable
                columns={matchColumns}
                data={roundMatches}
                keyExtractor={(match) => match.id}
                onRowPress={(match) => setActiveMatchId(match.id)}
                emptyMessage={roundNumbers.length > 0 ? "Nema utakmica u ovom kolu." : "Nema zakazanih utakmica."}
              />
            </View>

            {unroundedMatches.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle title="Ostale utakmice (bez kola)" />
                <DesktopTable
                  columns={matchColumns}
                  data={unroundedMatches}
                  keyExtractor={(match) => match.id}
                  onRowPress={(match) => setActiveMatchId(match.id)}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {!loading && tab === "table" ? (
          <View style={styles.section}>
            {standings.length === 0 ? <Text style={styles.hint}>Tabela jos nije dostupna.</Text> : null}
            {standings.map((group) => (
              <View key={group.name} style={styles.section}>
                {group.name && group.name !== "Tabela" ? <Text style={styles.groupName}>{group.name}</Text> : null}
                <DesktopTable
                  columns={standingColumns}
                  data={group.rows}
                  keyExtractor={(row) => row.id}
                  onRowPress={(row) => setActiveTeamId(row.teamId)}
                />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      {modals}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 28, gap: 20, maxWidth: 1200 },
  headerBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  leaguePickerWrap: { position: "relative" },
  leaguePickerPanel: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 6,
    minWidth: 320,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
    gap: 4,
    zIndex: 20,
    shadowColor: "#141414",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  headerActions: { flexDirection: "row", gap: 10 },
  tabs: { flexDirection: "row", gap: 24, borderBottomWidth: 1, borderBottomColor: colors.line },
  tabLabel: { color: colors.textMuted, fontWeight: "600", fontSize: 15, paddingBottom: 10 },
  tabLabelActive: { color: colors.ink, fontWeight: "700", borderBottomWidth: 2, borderBottomColor: colors.ink },
  section: { gap: 10 },
  adminGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  adminCard: { flexBasis: 340, flexGrow: 1, gap: 12 },
  liveCard: { flexBasis: 260 },
  hint: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
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
  chipRemove: { cursor: "pointer" } as never,
  adminButtonsRow: { flexDirection: "row", gap: 10 },
  formRow: { flexDirection: "row", gap: 10 },
  field: { flex: 1, gap: 6 },
  fieldLabel: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.card
  },
  knockoutDivider: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 4 },
  championText: { color: colors.ink, fontWeight: "800", fontSize: 14, textAlign: "center" },
  liveRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  liveChip: {
    backgroundColor: colors.live,
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14
  } as never,
  roundNav: { flexDirection: "row", alignItems: "center", gap: 12 },
  roundNavArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    textAlign: "center",
    textAlignVertical: "center"
  } as never,
  roundNavArrowDisabled: { opacity: 0.35 },
  roundNavCenter: { alignItems: "center" },
  roundNavTitle: { color: colors.ink, fontWeight: "800", fontSize: 18 },
  roundNavCopy: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  teamCell: { flexDirection: "row", alignItems: "center", gap: 8 },
  cellStrong: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  cellMuted: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  liveText: { color: colors.live },
  pointsText: { color: colors.pink, fontWeight: "800", fontSize: 13 },
  groupName: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 }
});
