import React from "react";
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { MatchSummary } from "../api/types";
import { Card, EmptyState, ErrorState, LoadingState, Pill, SectionTitle } from "../components/ui";
import { StandingsTable } from "../components/StandingsTable";
import { TeamCrest } from "../components/TeamCrest";
import { SponsorStrip } from "../components/SponsorStrip";
import { colors } from "../theme/colors";
import { useSeasonsScreenState, fixtureMeta, fixtureTime, formatShortDate } from "./useSeasonsScreenState";

export function SeasonsScreen() {
  const {
    isAdmin,
    competitions,
    setCompetitionId,
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
    roundDayGroups,
    unroundedDayGroups,
    error,
    modals
  } = useSeasonsScreenState();

  return (
    <>
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
            refreshControl={<RefreshControl refreshing={hubQuery.isRefetching} onRefresh={() => hubQuery.refetch()} tintColor={colors.purple} />}
          >
            {error ? <ErrorState message={error} onRetry={() => hubQuery.refetch()} /> : null}

            {tab === "matches" ? (
              <>
                {isAdmin && hub?.activeCompetition ? (
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
                              disabled={removeTeamMutation.isPending && removeTeamMutation.variables?.id === team.id}
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

                    <TouchableOpacity style={styles.liveAdminButton} onPress={() => setShowLiveAdmin(true)}>
                      <Ionicons name="radio-outline" size={16} color="#fff" />
                      <Text style={styles.liveAdminButtonText}>Vodi live utakmicu</Text>
                    </TouchableOpacity>

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
                          style={[styles.startLeagueButton, teams.length < 2 || tournamentBusy ? styles.adminActionButtonDisabled : null]}
                          onPress={handleAssignGroups}
                          disabled={teams.length < 2 || tournamentBusy}
                        >
                          <Ionicons name="grid-outline" size={16} color="#fff" />
                          <Text style={styles.startLeagueButtonText}>
                            {assignGroupsMutation.isPending ? "Raspoređivanje..." : `1. Rasporedi ekipe u ${groupPhase?.groupCount || 2} grupe`}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.startLeagueButton, teams.length < 2 || tournamentBusy ? styles.adminActionButtonDisabled : null]}
                          onPress={handleGenerateGroupStage}
                          disabled={teams.length < 2 || tournamentBusy}
                        >
                          <Ionicons name="shuffle-outline" size={16} color="#fff" />
                          <Text style={styles.startLeagueButtonText}>
                            {generateGroupStageMutation.isPending ? "Generisanje..." : "2. Generisi raspored grupne faze"}
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.startLeagueButton, teams.length < 2 || startLeagueMutation.isPending ? styles.adminActionButtonDisabled : null]}
                          onPress={handleStartLeague}
                          disabled={teams.length < 2 || startLeagueMutation.isPending}
                        >
                          <Ionicons name="shuffle-outline" size={16} color="#fff" />
                          <Text style={styles.startLeagueButtonText}>
                            {startLeagueMutation.isPending ? "Generisanje rasporeda..." : "Startuj ligu (svako sa svakim)"}
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
                      style={[styles.startLeagueButton, tournamentBusy ? styles.adminActionButtonDisabled : null]}
                      onPress={handlePrepareKnockout}
                      disabled={tournamentBusy}
                    >
                      <Ionicons name="trophy-outline" size={16} color="#fff" />
                      <Text style={styles.startLeagueButtonText}>
                        {prepareKnockoutMutation.isPending
                          ? "Pripremanje..."
                          : `Pripremi nokaut rundu (top ${knockoutQualifiers} iz tabele)`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.startLeagueButton, tournamentBusy ? styles.adminActionButtonDisabled : null]}
                      onPress={handleAdvanceKnockout}
                      disabled={tournamentBusy}
                    >
                      <Ionicons name="arrow-forward-circle-outline" size={16} color="#fff" />
                      <Text style={styles.startLeagueButtonText}>
                        {advanceKnockoutMutation.isPending ? "Pripremanje..." : "Sledeca nokaut runda (iz pobednika)"}
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
                        <FixtureCard
                          key={match.id}
                          match={match}
                          onOpenMatch={() => setActiveMatchId(match.id)}
                          onOpenTeam={setActiveTeamId}
                        />
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
                          <FixtureCard
                            key={match.id}
                            match={match}
                            onOpenMatch={() => setActiveMatchId(match.id)}
                            onOpenTeam={setActiveTeamId}
                          />
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
                  <StandingsTable key={group.name} groupName={group.name} rows={group.rows} onTeamPress={setActiveTeamId} />
                ))}
              </View>
            )}

            <View style={styles.section}>
              <SponsorStrip />
            </View>
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
      </View>
      {modals}
    </>
  );
}

function FixtureCard({
  match,
  onOpenMatch,
  onOpenTeam
}: {
  match: MatchSummary;
  onOpenMatch: () => void;
  onOpenTeam: (teamId: string) => void;
}) {
  return (
    <TouchableOpacity style={styles.fixtureCard} onPress={onOpenMatch} activeOpacity={0.85}>
      <FixtureTeam teamId={match.homeTeamId} name={match.homeTeamName || "Domacin"} logoUrl={match.homeTeamLogoUrl} label="Domacin" onPress={onOpenTeam} />
      <View style={styles.fixtureCenter}>
        <View style={[styles.fixtureAccent, match.status === "live" ? styles.fixtureAccentLive : null]} />
        <Text style={[styles.fixtureTime, match.status === "live" ? styles.fixtureTimeLive : null]}>{fixtureTime(match)}</Text>
        <Text style={styles.fixtureMeta}>{fixtureMeta(match)}</Text>
      </View>
      <FixtureTeam teamId={match.awayTeamId} name={match.awayTeamName || "Gost"} logoUrl={match.awayTeamLogoUrl} label="Gost" onPress={onOpenTeam} />
    </TouchableOpacity>
  );
}

function FixtureTeam({
  teamId,
  name,
  logoUrl,
  label,
  onPress
}: {
  teamId: string;
  name: string;
  logoUrl?: string;
  label: string;
  onPress: (teamId: string) => void;
}) {
  const content = (
    <>
      <TeamCrest teamId={teamId || name} name={name} logoUrl={logoUrl} size={30} />
      <Text style={styles.fixtureTeamName} numberOfLines={2}>{name}</Text>
      <Text style={styles.fixtureTeamLabel}>{label}</Text>
    </>
  );
  if (!teamId) return <View style={styles.fixtureTeam}>{content}</View>;
  return (
    <TouchableOpacity style={styles.fixtureTeam} onPress={() => onPress(teamId)}>
      {content}
    </TouchableOpacity>
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
  liveAdminButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.live
  },
  liveAdminButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
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
  fixtureTeam: { flex: 1, gap: 4, alignItems: "center" },
  fixtureTeamName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13, textAlign: "center" },
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,10,10,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "70%" },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
  modalOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalOptionCity: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  modalOptionName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" }
});
