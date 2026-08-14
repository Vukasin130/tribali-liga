import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  deleteAccount,
  fetchCompetitionTeams,
  fetchDiscount,
  fetchDiscountForAdmin,
  fetchMyAvailabilityRequests,
  fetchMyVerificationRequests,
  fetchProfile,
  fetchTeamPlayers,
  requestVerification,
  setMatchAvailability,
  updateProfile
} from "../api/endpoints";
import { ApiError } from "../api/client";
import type { MatchAvailabilityRequest, Player, Profile, Sponsor, Team, VerificationRequest } from "../api/types";
import { Card, ErrorState, LoadingState, Pill, PrimaryButton } from "../components/ui";
import { colors } from "../theme/colors";
import { useAuth } from "../state/AuthContext";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { useCompetition } from "../state/CompetitionContext";
import { DiscountEditorModal } from "./DiscountEditorModal";
import { LegalScreen } from "./LegalScreen";
import { NotificationComposerModal } from "./NotificationComposerModal";
import { SponsorsManagerModal } from "./SponsorsManagerModal";

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const { competitionId } = useCompetition();
  const isWide = useIsWideScreen();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [legalScreen, setLegalScreen] = useState<"privacy" | "terms" | null>(null);
  const [showNotificationComposer, setShowNotificationComposer] = useState(false);
  const [showSponsorsManager, setShowSponsorsManager] = useState(false);
  const [discount, setDiscount] = useState<Sponsor | null>(null);
  const [showDiscountEditor, setShowDiscountEditor] = useState(false);

  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [teamPlayersLoading, setTeamPlayersLoading] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [availabilityRequests, setAvailabilityRequests] = useState<MatchAvailabilityRequest[]>([]);
  const [respondingMatchId, setRespondingMatchId] = useState("");
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetchProfile()
      .then((data) => {
        setProfile(data);
        setDisplayName(data.displayName);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam profil."))
      .finally(() => setLoading(false));

    fetchMyVerificationRequests()
      .then(setRequests)
      .catch(() => undefined);

    fetchMyAvailabilityRequests()
      .then(setAvailabilityRequests)
      .catch(() => undefined);
  }, []);

  // Admin sees the record even while it's turned off (so they can re-enable it without
  // retyping everything); everyone else only sees it once it's actually active.
  function loadDiscount() {
    const loader = profile?.role === "admin" ? fetchDiscountForAdmin : fetchDiscount;
    loader().then(setDiscount).catch(() => undefined);
  }

  useEffect(loadDiscount, [profile?.role]);

  async function handleRespondAvailability(matchId: string, status: "playing" | "not_playing") {
    setRespondingMatchId(matchId);
    try {
      const updated = await setMatchAvailability(matchId, status);
      setAvailabilityRequests((previous) => previous.map((item) => (item.matchId === matchId ? { ...item, status: updated.status, respondedAt: updated.respondedAt } : item)));
    } catch {
      // Silent - the request stays in the list so the player can just try again.
    } finally {
      setRespondingMatchId("");
    }
  }

  useEffect(() => {
    if (!competitionId) return;
    fetchCompetitionTeams(competitionId)
      .then(setTeams)
      .catch(() => undefined);
  }, [competitionId]);

  useEffect(() => {
    if (!teamId) {
      setTeamPlayers([]);
      setPlayerId("");
      return;
    }
    setTeamPlayersLoading(true);
    setPlayerId("");
    fetchTeamPlayers(teamId)
      .then(setTeamPlayers)
      .catch(() => setTeamPlayers([]))
      .finally(() => setTeamPlayersLoading(false));
  }, [teamId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateProfile({ displayName });
      setProfile(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cuvanje nije uspelo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) {
      setDeleteError("Unesi lozinku.");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount(deletePassword);
      await logout();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Nalog nije obrisan.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRequestVerification() {
    const selectedPlayer = teamPlayers.find((player) => player.id === playerId);
    if (!selectedPlayer) return;
    setVerifySubmitting(true);
    setVerifyError("");
    try {
      const request = await requestVerification({
        teamId: teamId || undefined,
        playerId: selectedPlayer.id,
        playerName: selectedPlayer.displayName
      });
      setRequests((previous) => [request, ...previous]);
      setShowVerifyForm(false);
      const refreshedProfile = await fetchProfile();
      setProfile(refreshedProfile);
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : "Zahtev nije poslat.");
    } finally {
      setVerifySubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <LoadingState label="Ucitavanje profila..." />
      </View>
    );
  }

  const isAdmin = profile?.role === "admin";
  const pendingRequest = requests.find((request) => request.status === "pending");
  const canRequestVerification = profile?.verificationStatus === "none" && !pendingRequest;
  const isApprovedPlayer = profile?.verificationStatus === "approved";
  const name = profile?.displayName ?? user?.displayName ?? "";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, isWide ? styles.contentWide : null]}>
      <View style={styles.header}>
        <Text style={styles.headerKicker}>Profil</Text>
        <Text style={styles.headerTitle}>Nalog</Text>
      </View>

      {error ? <ErrorState message={error} /> : null}

      <Card style={styles.accountCard}>
        <View style={styles.accountTopRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{name}</Text>
            <Text style={styles.accountEmail}>{profile?.email ?? user?.email}</Text>
          </View>
          <Ionicons
            name={profile?.role === "admin" ? "shield-checkmark" : isApprovedPlayer ? "checkmark-circle" : "person-circle-outline"}
            size={26}
            color={colors.purple}
          />
        </View>

        <View style={styles.badgeRow}>
          <Pill
            label={profile?.role === "admin" ? "Administrator" : "Fan"}
            tone={profile?.role === "admin" ? "success" : "neutral"}
          />
          <Pill
            label={verificationLabel(profile?.verificationStatus, pendingRequest)}
            tone={isApprovedPlayer ? "success" : pendingRequest || profile?.verificationStatus === "pending" ? "warning" : "neutral"}
          />
        </View>

        <Text style={styles.label}>Ime i prezime</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholderTextColor={colors.textMuted} />

        {saved ? <Text style={styles.savedText}>Sacuvano.</Text> : null}
        <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj izmene"} onPress={handleSave} loading={saving} />
      </Card>

      {isAdmin ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Sponzori</Text>
          <Text style={styles.helperText}>
            Upravljaj sponzorima koji se prikazuju kao traka logoa kroz aplikaciju.
          </Text>
          <PrimaryButton label="Otvori sponzore" onPress={() => setShowSponsorsManager(true)} />
        </Card>
      ) : null}

      {isAdmin ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Notifikacije</Text>
          <Text style={styles.helperText}>
            Posalji push notifikaciju svim korisnicima koji su dozvolili notifikacije (npr. najava novog kola, rezultat, vazna vest).
          </Text>
          <PrimaryButton label="Posalji notifikaciju" onPress={() => setShowNotificationComposer(true)} />
        </Card>
      ) : isApprovedPlayer ? (
        <LinearGradient colors={["#141414", "#C9A227", "#8A6D1F"]} style={styles.verifiedCard}>
          <Pill label="Verified player" tone="success" />
          <Text style={styles.verifiedName}>{profile?.verifiedPlayerName || name}</Text>
          <Text style={styles.verifiedTeam}>{profile?.teamName}</Text>
          <View style={styles.metricsGrid}>
            <MetricBox label="Golovi" value="-" />
            <MetricBox label="MVP" value="-" />
            <MetricBox label="F pts" value="-" />
            <MetricBox label="Owned" value="-" />
          </View>
        </LinearGradient>
      ) : (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Verifikacija igraca</Text>
          <Text style={styles.helperText}>
            Ako stvarno igras u ligi, posalji zahtev da admin poveze tvoj nalog sa pravim igracem - dobices oznaku verifikovanog igraca.
          </Text>

          <View style={styles.claimTracker}>
            <ClaimStep label="Izaberi igraca" done={Boolean(pendingRequest) || canRequestVerification === false} />
            <View style={styles.claimTrackerLine} />
            <ClaimStep label="Admin provera" done={Boolean(pendingRequest)} active={Boolean(pendingRequest)} />
            <View style={styles.claimTrackerLine} />
            <ClaimStep label="Verified" done={false} />
          </View>

          {canRequestVerification ? (
            showVerifyForm ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.label}>Ekipa</Text>
                <View style={styles.teamPicker}>
                  {teams.map((team) => (
                    <TouchableOpacity
                      key={team.id}
                      style={[styles.teamChip, teamId === team.id ? styles.teamChipActive : null]}
                      onPress={() => setTeamId(team.id)}
                    >
                      <Text style={[styles.teamChipText, teamId === team.id ? styles.teamChipTextActive : null]} numberOfLines={1}>
                        {team.name || team.shortName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {teamId ? (
                  <>
                    <Text style={styles.label}>Igrac</Text>
                    {teamPlayersLoading ? (
                      <Text style={styles.helperText}>Ucitavanje igraca...</Text>
                    ) : teamPlayers.length === 0 ? (
                      <Text style={styles.helperText}>Ova ekipa jos nema igrace u bazi.</Text>
                    ) : (
                      <View style={styles.teamPicker}>
                        {teamPlayers.map((player) => (
                          <TouchableOpacity
                            key={player.id}
                            style={[styles.teamChip, playerId === player.id ? styles.teamChipActive : null]}
                            onPress={() => setPlayerId(player.id)}
                          >
                            <Text style={[styles.teamChipText, playerId === player.id ? styles.teamChipTextActive : null]} numberOfLines={1}>
                              {player.displayName}
                              {player.shirtNumber ? ` (${player.shirtNumber})` : ""}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                ) : null}
                {verifyError ? <Text style={styles.errorText}>{verifyError}</Text> : null}
                <PrimaryButton
                  label={verifySubmitting ? "Slanje..." : "Posalji zahtev"}
                  onPress={handleRequestVerification}
                  loading={verifySubmitting}
                  disabled={!playerId}
                />
              </View>
            ) : (
              <PrimaryButton label="Povezi igracki profil" variant="ghost" onPress={() => setShowVerifyForm(true)} />
            )
          ) : pendingRequest ? (
            <Text style={styles.value}>Zahtev je poslat i ceka pregled admina.</Text>
          ) : null}
        </Card>
      )}

      {isApprovedPlayer && availabilityRequests.length > 0 ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Da li igras?</Text>
          <Text style={styles.helperText}>
            Javi se pre utakmice da fantazi menadzeri znaju da li da te stavljaju u tim.
          </Text>
          {availabilityRequests.map((request) => (
            <View key={request.id} style={styles.availabilityRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.availabilityMatch}>
                  {request.homeTeamName} - {request.awayTeamName}
                </Text>
                <Text style={styles.helperText}>{formatMatchDate(request.scheduledAt)}</Text>
              </View>
              {request.status === "unknown" ? (
                <View style={styles.availabilityButtons}>
                  <TouchableOpacity
                    style={[styles.availabilityButton, styles.availabilityButtonYes]}
                    disabled={respondingMatchId === request.matchId}
                    onPress={() => handleRespondAvailability(request.matchId, "playing")}
                  >
                    <Text style={styles.availabilityButtonYesText}>Igram</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.availabilityButton, styles.availabilityButtonNo]}
                    disabled={respondingMatchId === request.matchId}
                    onPress={() => handleRespondAvailability(request.matchId, "not_playing")}
                  >
                    <Text style={styles.availabilityButtonNoText}>Ne igram</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Pill
                  label={request.status === "playing" ? "Igras" : "Ne igras"}
                  tone={request.status === "playing" ? "success" : "danger"}
                />
              )}
            </View>
          ))}
        </Card>
      ) : null}

      {isAdmin ? (
        <Card style={styles.card}>
          <View style={styles.sponsorRow}>
            <Ionicons name="qr-code-outline" size={22} color={colors.purple} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{discount?.title || "Popust kod partnera"}</Text>
              <Text style={styles.helperText}>
                {discount?.subtitle || "Jos nije podeseno - dodaj naslov, kod i po zelji QR sliku."}
              </Text>
            </View>
            <Pill label={discount?.isActive === false ? "Neaktivan" : discount ? "Aktivan" : "Prazan"} tone={discount?.isActive === false ? "neutral" : discount ? "success" : "neutral"} />
          </View>
          <PrimaryButton label={discount ? "Uredi popust" : "Podesi popust"} variant="ghost" onPress={() => setShowDiscountEditor(true)} />
        </Card>
      ) : discount ? (
        <Card style={styles.card}>
          <View style={styles.sponsorRow}>
            <Ionicons name="qr-code-outline" size={22} color={colors.purple} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{discount.title}</Text>
              {discount.subtitle ? <Text style={styles.helperText}>{discount.subtitle}</Text> : null}
            </View>
          </View>
        </Card>
      ) : null}

      <PrimaryButton label="Odjava" onPress={logout} variant="danger" />

      {showDeleteAccount ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Obrisi nalog</Text>
          <Text style={styles.helperText}>
            Ovo trajno brise tvoj nalog i sve podatke vezane za njega. Unesi lozinku da potvrdis.
          </Text>
          <TextInput
            style={styles.input}
            value={deletePassword}
            onChangeText={setDeletePassword}
            placeholder="Lozinka"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />
          {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}
          <PrimaryButton
            label={deleting ? "Brisanje..." : "Potvrdi brisanje naloga"}
            onPress={handleDeleteAccount}
            loading={deleting}
            variant="danger"
          />
          <Text style={styles.legalLink} onPress={() => { setShowDeleteAccount(false); setDeletePassword(""); setDeleteError(""); }}>
            Otkazi
          </Text>
        </Card>
      ) : (
        <Text style={styles.deleteAccountLink} onPress={() => setShowDeleteAccount(true)}>
          Obrisi nalog
        </Text>
      )}

      <View style={styles.legalRow}>
        <Text style={styles.legalLink} onPress={() => setLegalScreen("terms")}>Uslovi koriscenja</Text>
        <Text style={styles.legalDivider}>•</Text>
        <Text style={styles.legalLink} onPress={() => setLegalScreen("privacy")}>Politika privatnosti</Text>
      </View>

      {legalScreen ? <LegalScreen kind={legalScreen} onClose={() => setLegalScreen(null)} /> : null}
      {showNotificationComposer ? <NotificationComposerModal onClose={() => setShowNotificationComposer(false)} /> : null}
      {showSponsorsManager ? (
        <SponsorsManagerModal onClose={() => setShowSponsorsManager(false)} onChanged={() => undefined} />
      ) : null}
      {showDiscountEditor ? (
        <DiscountEditorModal
          discount={discount}
          onClose={() => setShowDiscountEditor(false)}
          onSaved={() => {
            setShowDiscountEditor(false);
            loadDiscount();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function formatMatchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ClaimStep({ label, done, active }: { label: string; done: boolean; active?: boolean }) {
  return (
    <View style={styles.claimStep}>
      <View style={[styles.claimStepDot, done ? styles.claimStepDotDone : null, active ? styles.claimStepDotActive : null]} />
      <Text style={styles.claimStepLabel}>{label}</Text>
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function verificationLabel(status?: string, pendingRequest?: VerificationRequest): string {
  if (status === "approved") return "Verifikovan igrac";
  if (pendingRequest || status === "pending") return "Verifikacija na cekanju";
  return "Nije verifikovan";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingTop: 58, gap: 14, paddingBottom: 40 },
  contentWide: { maxWidth: 640, alignSelf: "center", width: "100%", paddingTop: 48, gap: 18 },
  header: {},
  headerKicker: { color: colors.purple, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  headerTitle: { color: colors.ink, fontSize: 26, fontWeight: "700" },
  accountCard: { gap: 8 },
  accountTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.purple, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  accountInfo: { flex: 1 },
  accountName: { color: colors.textPrimary, fontWeight: "700", fontSize: 17 },
  accountEmail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  cardTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 16 },
  card: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, marginTop: 8 },
  value: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  helperText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  availabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  availabilityMatch: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  availabilityButtons: { flexDirection: "row", gap: 8 },
  availabilityButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  availabilityButtonYes: { backgroundColor: "rgba(8,122,74,0.1)", borderColor: colors.success },
  availabilityButtonYesText: { color: colors.success, fontWeight: "700", fontSize: 12 },
  availabilityButtonNo: { backgroundColor: "rgba(160,24,61,0.1)", borderColor: colors.danger },
  availabilityButtonNoText: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15
  },
  badgeRow: { flexDirection: "row", gap: 8, marginVertical: 4 },
  savedText: { color: colors.success, fontWeight: "700", textAlign: "center" },
  errorText: { color: colors.danger, fontWeight: "700" },
  teamPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  teamChip: {
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: "100%",
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  teamChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  teamChipText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  teamChipTextActive: { color: "#fff" },
  verifiedCard: { borderRadius: 20, padding: 18, gap: 8 },
  verifiedName: { color: "#fff", fontSize: 22, fontWeight: "700", marginTop: 4 },
  verifiedTeam: { color: "rgba(255,255,255,0.82)", fontWeight: "600" },
  metricsGrid: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  metricBox: { alignItems: "center" },
  metricValue: { color: "#fff", fontWeight: "700", fontSize: 18 },
  metricLabel: { color: "rgba(255,255,255,0.72)", fontSize: 11, marginTop: 2 },
  claimTracker: { flexDirection: "row", alignItems: "center", marginVertical: 6 },
  claimStep: { alignItems: "center", gap: 4, width: 74 },
  claimStepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.line },
  claimStepDotDone: { backgroundColor: colors.aqua },
  claimStepDotActive: { backgroundColor: colors.purple },
  claimStepLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "600", textAlign: "center" },
  claimTrackerLine: { flex: 1, height: 1, backgroundColor: colors.line, marginBottom: 16 },
  sponsorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  legalRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 4 },
  legalLink: { color: colors.textMuted, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  legalDivider: { color: colors.textMuted, fontSize: 12 },
  deleteAccountLink: { color: colors.danger, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 2 }
});
