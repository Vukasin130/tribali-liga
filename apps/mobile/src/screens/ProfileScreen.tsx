import React, { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  deleteAccount,
  fetchAllTeams,
  fetchDiscount,
  fetchDiscountForAdmin,
  fetchMyAvailabilityRequests,
  fetchMyVerificationRequests,
  fetchPlayerProfile,
  fetchProfile,
  fetchTeamPlayers,
  requestVerification,
  setMatchAvailability,
  updateProfile
} from "../api/endpoints";
import { ApiError } from "../api/client";
import type { MatchAvailabilityRequest, Player, PlayerProfile, Profile, Sponsor, Team, VerificationRequest } from "../api/types";
import { Card, ErrorState, LoadingState, Pill, PrimaryButton } from "../components/ui";
import { colors, gradients } from "../theme/colors";
import { useAuth } from "../state/AuthContext";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { kitGradientForTeam } from "../components/PitchPlayerCard";
import { positionGroupOf } from "../fantasyConstants";
import { DiscountEditorModal } from "./DiscountEditorModal";
import { LegalScreen } from "./LegalScreen";
import { NotificationComposerModal } from "./NotificationComposerModal";
import { PlayerProfileModal } from "./PlayerProfileModal";
import { SponsorsManagerModal } from "./SponsorsManagerModal";

export function ProfileScreen() {
  const { user, logout } = useAuth();
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

  const [verifiedPlayer, setVerifiedPlayer] = useState<PlayerProfile | null>(null);
  const [verifiedPlayerPhotoFailed, setVerifiedPlayerPhotoFailed] = useState(false);
  const [showFullPlayerProfile, setShowFullPlayerProfile] = useState(false);

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

  // Once approved, this tab's job shifts from "prove it's you" to "show the real thing" -
  // the same rich profile every other player gets, not a dashes-only teaser.
  useEffect(() => {
    if (profile?.verificationStatus !== "approved" || !profile.verifiedPlayerId) return;
    fetchPlayerProfile(profile.verifiedPlayerId)
      .then(setVerifiedPlayer)
      .catch(() => undefined);
  }, [profile?.verificationStatus, profile?.verifiedPlayerId]);

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

  // Every team in the DB, not scoped to whichever competition happens to be selected
  // elsewhere in the app - a team only needs to exist (via Explore > Ekipe), not be
  // attached to a currently-active league, for someone to claim it here. Matches
  // RegisterScreen's identical "pick your team" step during sign-up. Only fetched once
  // the form is actually opened, same reasoning as there.
  useEffect(() => {
    if (!showVerifyForm || teams.length > 0) return;
    fetchAllTeams()
      .then(setTeams)
      .catch(() => undefined);
  }, [showVerifyForm, teams.length]);

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
  // Admin accounts can independently carry an "approved" verification status without
  // ever seeing the player-profile card below (that branch is admin-only Sponzori/
  // Notifikacije instead) - the account card must only disappear when the rich card is
  // actually the thing replacing it.
  const showsVerifiedPlayerCard = isApprovedPlayer && !isAdmin;
  const name = profile?.displayName ?? user?.displayName ?? "";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, isWide ? styles.contentWide : null]}>
      <View style={styles.header}>
        <Text style={styles.headerKicker}>Profil</Text>
        <Text style={styles.headerTitle}>Nalog</Text>
      </View>

      {error ? <ErrorState message={error} /> : null}

      {showsVerifiedPlayerCard ? null : (
        <Card style={styles.accountCard}>
          <View style={styles.accountTopRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountName}>{name}</Text>
              <Text style={styles.accountEmail}>{profile?.email ?? user?.email}</Text>
            </View>
            <Ionicons name={isAdmin ? "shield-checkmark" : "person-circle-outline"} size={26} color={colors.purple} />
          </View>

          <View style={styles.badgeRow}>
            <Pill
              label={profile?.role === "admin" ? "Administrator" : "Fan"}
              tone={profile?.role === "admin" ? "success" : "neutral"}
            />
            <Pill
              label={verificationLabel(profile?.verificationStatus, pendingRequest)}
              tone={pendingRequest || profile?.verificationStatus === "pending" ? "warning" : "neutral"}
            />
          </View>

          <Text style={styles.label}>Ime i prezime</Text>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholderTextColor={colors.textMuted} />

          {saved ? <Text style={styles.savedText}>Sacuvano.</Text> : null}
          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj izmene"} onPress={handleSave} loading={saving} />
        </Card>
      )}

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
        <VerifiedPlayerCard
          fallbackName={profile?.verifiedPlayerName || name}
          email={profile?.email ?? user?.email ?? ""}
          player={verifiedPlayer}
          photoFailed={verifiedPlayerPhotoFailed}
          onPhotoError={() => setVerifiedPlayerPhotoFailed(true)}
          onOpenFullProfile={() => setShowFullPlayerProfile(true)}
          displayName={displayName}
          onChangeDisplayName={setDisplayName}
          onSave={handleSave}
          saving={saving}
          saved={saved}
        />
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

      {showFullPlayerProfile && profile?.verifiedPlayerId ? (
        <PlayerProfileModal playerId={profile.verifiedPlayerId} onClose={() => setShowFullPlayerProfile(false)} />
      ) : null}
    </ScrollView>
  );
}

function formatMatchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const POSITION_LABELS: Record<string, string> = { golman: "Golman", odbrana: "Odbrana", napad: "Napad" };

// The real thing, not a teaser: same photo/stats a verified player already has on their
// full public profile (see PlayerProfileModal), shown right here instead of a
// dashes-only card - tapping "Ceo profil" opens that exact full profile for the complete
// history (tabs, form, matches). `player` is null only for the one frame before the
// fetch resolves; the name/pill still render immediately from the account record. This
// is also the only account card a verified player sees, so account-name editing lives
// here too (collapsed behind the pencil icon) instead of a separate top card.
function VerifiedPlayerCard({
  fallbackName,
  email,
  player,
  photoFailed,
  onPhotoError,
  onOpenFullProfile,
  displayName,
  onChangeDisplayName,
  onSave,
  saving,
  saved
}: {
  fallbackName: string;
  email: string;
  player: PlayerProfile | null;
  photoFailed: boolean;
  onPhotoError: () => void;
  onOpenFullProfile: () => void;
  displayName: string;
  onChangeDisplayName: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const primaryTeam = player?.teams[0] ?? null;
  const positionGroup = positionGroupOf(player?.position || "");
  const isGoalkeeper = positionGroup === "golman";
  const photoGradient = isGoalkeeper ? (["#4a3a14", "#141414"] as const) : kitGradientForTeam(primaryTeam?.teamId || "");
  const topSeason = player?.seasonStats[0];
  const shownName = player?.displayName || fallbackName;

  return (
    <LinearGradient colors={gradients.hero} style={styles.verifiedCard}>
      <View style={styles.verifiedTopRow}>
        <Pill label="Verified player" tone="success" />
        <View style={styles.verifiedTopRowActions}>
          <TouchableOpacity style={styles.verifiedIconButton} onPress={() => setEditingName((v) => !v)}>
            <Ionicons name="pencil" size={14} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.verifiedOpenHint} onPress={onOpenFullProfile}>
            <Text style={styles.verifiedOpenHintText}>Ceo profil</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {player?.avatarUrl && !photoFailed ? (
        <Image source={{ uri: player.avatarUrl }} style={styles.verifiedPhoto} resizeMode="cover" onError={onPhotoError} />
      ) : (
        <LinearGradient colors={photoGradient} style={styles.verifiedPhotoFallback}>
          <Text style={styles.verifiedPhotoInitials}>{initials(shownName)}</Text>
        </LinearGradient>
      )}

      <Text style={styles.verifiedName}>{shownName}</Text>
      <Text style={styles.verifiedTeam}>
        {primaryTeam?.teamName || "Bez ekipe"}
        {player?.position ? ` - ${POSITION_LABELS[positionGroup] || player.position}` : ""}
      </Text>

      <View style={styles.verifiedStatsRow}>
        <VerifiedStat icon="calendar-outline" label="utakmica" value={String(topSeason?.appearances ?? 0)} />
        <VerifiedStat icon="football" label="golovi" value={String(topSeason?.goals ?? 0)} />
        <VerifiedStat icon="footsteps-outline" label="asistencije" value={String(topSeason?.assists ?? 0)} />
        <VerifiedStat icon="star" label="fantasy poena" value={String(topSeason?.fantasyPoints ?? 0)} />
      </View>

      {player && player.upcomingMatches.length > 0 ? (
        <View style={styles.verifiedMatchSection}>
          <Text style={styles.verifiedMatchSectionTitle}>Naredne utakmice</Text>
          {player.upcomingMatches.map((match) => (
            <View key={`${match.scheduledAt}-${match.homeTeamName}`} style={styles.verifiedMatchRow}>
              <Text style={styles.verifiedMatchTeams} numberOfLines={1}>
                {match.homeTeamName} - {match.awayTeamName}
              </Text>
              <Text style={styles.verifiedMatchMeta}>{formatMatchDate(match.scheduledAt)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {player && player.matchStats.length > 0 ? (
        <View style={styles.verifiedMatchSection}>
          <Text style={styles.verifiedMatchSectionTitle}>Poslednje utakmice</Text>
          {player.matchStats.slice(0, 3).map((match) => (
            <View key={match.matchId} style={styles.verifiedMatchRow}>
              <Text style={styles.verifiedMatchTeams} numberOfLines={1}>
                {match.homeTeamName} {match.score} {match.awayTeamName}
              </Text>
              <Text style={styles.verifiedMatchPoints}>{match.fantasyPoints} pts</Text>
            </View>
          ))}
        </View>
      ) : null}

      {editingName ? (
        <View style={styles.verifiedEditBox}>
          <Text style={styles.verifiedEditLabel}>Ime naloga (za prijavu, ne mora biti isto kao ime igraca)</Text>
          <TextInput
            style={styles.verifiedEditInput}
            value={displayName}
            onChangeText={onChangeDisplayName}
            placeholderTextColor="rgba(255,255,255,0.5)"
          />
          <Text style={styles.verifiedEditEmail}>{email}</Text>
          {saved ? <Text style={styles.verifiedEditSaved}>Sacuvano.</Text> : null}
          <PrimaryButton label={saving ? "Cuvanje..." : "Sacuvaj izmene"} onPress={onSave} loading={saving} />
        </View>
      ) : null}
    </LinearGradient>
  );
}

function VerifiedStat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.verifiedStatTile}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text style={styles.verifiedStatValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.verifiedStatLabel}>{label}</Text>
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
  verifiedCard: { borderRadius: 24, padding: 22, gap: 10, alignItems: "center" },
  verifiedTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  verifiedTopRowActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  verifiedIconButton: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  verifiedOpenHint: { flexDirection: "row", alignItems: "center", gap: 2 },
  verifiedOpenHintText: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "700" },
  verifiedEditBox: { alignSelf: "stretch", marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.16)", gap: 8 },
  verifiedEditLabel: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "600" },
  verifiedEditInput: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    fontWeight: "600"
  },
  verifiedEditEmail: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  verifiedEditSaved: { color: "#fff", fontWeight: "700", textAlign: "center" },
  verifiedMatchSection: { alignSelf: "stretch", marginTop: 14, gap: 6 },
  verifiedMatchSectionTitle: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  verifiedMatchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  verifiedMatchTeams: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "600" },
  verifiedMatchMeta: { color: "rgba(255,255,255,0.68)", fontSize: 12, fontWeight: "600" },
  verifiedMatchPoints: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  verifiedPhoto: { width: 128, height: 128, borderRadius: 24, marginTop: 6 },
  verifiedPhotoFallback: { width: 128, height: 128, borderRadius: 24, marginTop: 6, alignItems: "center", justifyContent: "center" },
  verifiedPhotoInitials: { color: "#fff", fontWeight: "800", fontSize: 34 },
  verifiedName: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 6, textAlign: "center" },
  verifiedTeam: { color: "rgba(255,255,255,0.82)", fontWeight: "600", textAlign: "center" },
  verifiedStatsRow: { flexDirection: "row", alignSelf: "stretch", justifyContent: "space-between", marginTop: 12, gap: 8 },
  verifiedStatTile: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    paddingVertical: 10
  },
  verifiedStatValue: { color: "#fff", fontWeight: "800", fontSize: 16 },
  verifiedStatLabel: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "600", textAlign: "center" },
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
