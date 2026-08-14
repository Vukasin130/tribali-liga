import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchFantasySeason,
  fetchFantasySeasonLeaderboard,
  fetchFantasySeasonPlayerPool,
  fetchFantasySeasonTeam,
  listFantasySeasons,
  listMyFantasyMiniLeagues,
  saveFantasySeasonPicks,
  setFantasyPoolPlayerAvailability,
  setFantasyPoolPlayerPrice,
  syncFantasySeasonPool,
  updateFantasySeason
} from "../api/endpoints";
import type {
  FantasyGameweek,
  FantasyMiniLeague,
  FantasySeason,
  FantasySeasonPoolPlayer,
  FantasySeasonTeam,
  LeaderboardEntry
} from "../api/types";
import { MiniLeagueModal } from "./MiniLeagueModal";
import { MiniLeagueDetailModal } from "./MiniLeagueDetailModal";
import { ApiError } from "../api/client";
import { Card, EmptyState, ErrorState, LoadingState, Pill, PrimaryButton, SectionTitle } from "../components/ui";
import { LeaderboardRow } from "../components/LeaderboardRow";
import { colors, gradients } from "../theme/colors";
import { useAuth } from "../state/AuthContext";
import { PlayerProfileModal } from "./PlayerProfileModal";
import { FantasySeasonComposerModal } from "./FantasySeasonComposerModal";
import { Pitch } from "../components/Pitch";
import { BenchStrip } from "../components/BenchStrip";
import { PlayerPickerSheet } from "../components/PlayerPickerSheet";
import { kitColorForTeam } from "../components/PitchPlayerCard";
import { SponsorStrip } from "../components/SponsorStrip";
import { AvailabilityDot } from "../components/AvailabilityDot";
import { BENCH_SLOTS, POSITION_GROUP_LABELS, SLOT_LABELS, SLOT_POSITION, STARTER_SLOTS, positionGroupOf } from "../fantasyConstants";
import { ManagerTeamModal } from "./ManagerTeamModal";
import { useIsWideScreen } from "../hooks/useIsWideScreen";

const DEFAULT_BUDGET_CAP = 100;

type Tab = "team" | "pool" | "leaderboard" | "admin";

function tabLabel(value: Tab): string {
  if (value === "team") return "Moj tim";
  if (value === "pool") return "Igraci";
  if (value === "leaderboard") return "Tabela";
  return "Admin";
}

interface SelectedPick {
  player: FantasySeasonPoolPlayer;
  slot: string;
  isCaptain: boolean;
}

export function FantasyScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isWide = useIsWideScreen();
  const [tab, setTab] = useState<Tab>("team");

  const [season, setSeason] = useState<Required<FantasySeason> | null>(null);
  const [gameweek, setGameweek] = useState<FantasyGameweek | null>(null);
  const [team, setTeam] = useState<FantasySeasonTeam | null>(null);
  const [pool, setPool] = useState<FantasySeasonPoolPlayer[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardScope, setLeaderboardScope] = useState<string>("season");
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [myMiniLeagues, setMyMiniLeagues] = useState<FantasyMiniLeague[]>([]);
  const [miniLeagueModal, setMiniLeagueModal] = useState<"create" | "join" | null>(null);
  const [viewingMiniLeagueId, setViewingMiniLeagueId] = useState<string | null>(null);
  const [viewingTeam, setViewingTeam] = useState<{ fantasyTeamId: string; gameweekId?: string; managerName: string } | null>(null);
  const [selected, setSelected] = useState<SelectedPick[]>([]);
  const [search, setSearch] = useState("");
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);
  const [swapSourceSlot, setSwapSourceSlot] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [allSeasons, setAllSeasons] = useState<FantasySeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [showSeasonComposer, setShowSeasonComposer] = useState(false);
  const [editSeasonComposer, setEditSeasonComposer] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [confirmingFinishSeason, setConfirmingFinishSeason] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [showAllPool, setShowAllPool] = useState(false);
  const [availabilitySavingId, setAvailabilitySavingId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const seasons = await listFantasySeasons();
      setAllSeasons(seasons);
      const activeSeasonSummary =
        (selectedSeasonId ? seasons.find((item) => item.id === selectedSeasonId) : null) ??
        seasons.find((item) => item.status === "active") ??
        seasons[0] ??
        null;
      if (!activeSeasonSummary) {
        setSeason(null);
        setGameweek(null);
        setTeam(null);
        setPool([]);
        setLeaderboard([]);
        setSelected([]);
        return;
      }

      const seasonData = await fetchFantasySeason(activeSeasonSummary.id);
      setSeason(seasonData);
      const activeGameweek =
        seasonData.gameweeks.find((gw) => gw.status === "open" || gw.status === "draft") ?? seasonData.gameweeks[0] ?? null;
      setGameweek(activeGameweek);

      const [teamData, poolData] = await Promise.all([
        // Admin also gets a "Moj tim" tab (a personal test/preview team) so they
        // can see the pitch-builder experience themselves, not just via a fan's phone.
        fetchFantasySeasonTeam(seasonData.id, activeGameweek?.id).catch(() => null),
        // Admin always gets the full pool (accepted + excluded) so the status
        // checklist and the "prikazi iskljucene" toggle both work off one
        // already-loaded list instead of a round-trip per toggle.
        fetchFantasySeasonPlayerPool(seasonData.id, undefined, !isAdmin)
      ]);

      setTeam(teamData);
      setPool(poolData);

      if (teamData && activeGameweek) {
        const existingForGameweek = teamData.picks.filter((pick) => pick.fantasyGameweekId === activeGameweek.id);
        const source =
          existingForGameweek.length > 0
            ? existingForGameweek.map((pick) => ({ playerId: pick.playerId, slot: pick.slot, isCaptain: pick.isCaptain }))
            : (teamData.transferWindow?.previousPicks ?? []).map((pick) => ({ ...pick, isCaptain: false }));
        const restored: SelectedPick[] = source
          .map((pick) => {
            const player = poolData.find((item) => item.playerId === pick.playerId);
            if (!player) return null;
            return { player, slot: pick.slot, isCaptain: pick.isCaptain };
          })
          .filter((item): item is SelectedPick => item !== null);
        setSelected(restored);
      } else {
        setSelected([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ne mogu da ucitam fantasy podatke.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSeasonId, isAdmin]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!season) {
      setLeaderboard([]);
      return;
    }
    setLeaderboardLoading(true);
    const gameweekId = leaderboardScope === "season" ? undefined : leaderboardScope;
    fetchFantasySeasonLeaderboard(season.id, gameweekId)
      .then(setLeaderboard)
      .catch(() => setLeaderboard([]))
      .finally(() => setLeaderboardLoading(false));
  }, [season, leaderboardScope]);

  const loadMyMiniLeagues = useCallback(() => {
    if (!season) {
      setMyMiniLeagues([]);
      return;
    }
    listMyFantasyMiniLeagues(season.id)
      .then(setMyMiniLeagues)
      .catch(() => setMyMiniLeagues([]));
  }, [season]);

  useEffect(() => {
    loadMyMiniLeagues();
  }, [loadMyMiniLeagues]);

  function handleMiniLeagueSaved(openId?: string) {
    setMiniLeagueModal(null);
    loadMyMiniLeagues();
    if (openId) setViewingMiniLeagueId(openId);
  }

  function handleMiniLeagueChanged() {
    loadMyMiniLeagues();
  }

  async function handleSyncPool() {
    if (!season) return;
    setSyncing(true);
    setSyncMessage("");
    setAdminError("");
    try {
      const result = await syncFantasySeasonPool(season.id);
      setSyncMessage(`Sinhronizovano: ${result.available} igraca dostupno, ${result.unavailable} uklonjeno.`);
    } catch (err) {
      setAdminError(err instanceof ApiError ? err.message : "Sinhronizacija fantasy baze nije uspela.");
    } finally {
      setSyncing(false);
    }
  }

  function startEditPrice(player: FantasySeasonPoolPlayer) {
    setEditingPriceId(player.playerId);
    setPriceDraft(player.currentPrice.toFixed(1));
  }

  async function handleSavePrice(playerId: string) {
    if (!season) return;
    const price = Number(priceDraft.replace(",", "."));
    if (!Number.isFinite(price) || price < 4 || price > 13) {
      setAdminError("Cena mora biti broj izmedju 4 i 13.");
      return;
    }
    setPriceSaving(true);
    setAdminError("");
    try {
      const updated = await setFantasyPoolPlayerPrice(season.id, playerId, price, true);
      setPool((previous) => previous.map((item) => (item.playerId === playerId ? updated : item)));
      setEditingPriceId("");
    } catch (err) {
      setAdminError(err instanceof ApiError ? err.message : "Cena nije sacuvana.");
    } finally {
      setPriceSaving(false);
    }
  }

  async function handleUnlockPrice(playerId: string) {
    if (!season) return;
    setAdminError("");
    try {
      const current = pool.find((item) => item.playerId === playerId);
      const updated = await setFantasyPoolPlayerPrice(season.id, playerId, current?.currentPrice ?? 5, false);
      setPool((previous) => previous.map((item) => (item.playerId === playerId ? updated : item)));
    } catch (err) {
      setAdminError(err instanceof ApiError ? err.message : "Cena nije otkljucana.");
    }
  }

  async function handleToggleAvailability(player: FantasySeasonPoolPlayer) {
    if (!season) return;
    setAvailabilitySavingId(player.playerId);
    setAdminError("");
    try {
      const updated = await setFantasyPoolPlayerAvailability(season.id, player.playerId, !player.isAvailable);
      setPool((previous) => previous.map((item) => (item.playerId === player.playerId ? updated : item)));
    } catch (err) {
      setAdminError(err instanceof ApiError ? err.message : "Status igraca nije promenjen.");
    } finally {
      setAvailabilitySavingId("");
    }
  }

  async function handleSeasonStatusChange(status: string) {
    if (!season) return;
    setAdminError("");
    try {
      await updateFantasySeason(season.id, { status });
      setConfirmingFinishSeason(false);
      load();
    } catch (err) {
      setAdminError(err instanceof ApiError ? err.message : "Status sezone nije promenjen.");
    }
  }

  function pickFor(slot: string): SelectedPick | null {
    return selected.find((pick) => pick.slot === slot) ?? null;
  }

  // Not a flat constant: the server shifts a team's cap by the same amount their owned
  // players' prices move each round (see scoreFantasySeasonGameweek), so a manager's
  // unchanged squad never reads as over budget just because it got more valuable.
  const budgetCap = team?.budgetCap ?? DEFAULT_BUDGET_CAP;
  const spent = useMemo(() => selected.reduce((sum, pick) => sum + pick.player.currentPrice, 0), [selected]);
  const remaining = budgetCap - spent;
  const hasCaptain = selected.some((pick) => pick.isCaptain);

  const transferWindow = team?.transferWindow ?? null;
  const hasPlayedByPlayerId = useMemo(() => {
    const map = new Map<string, boolean>();
    (team?.picks ?? []).forEach((pick) => {
      if (!gameweek || pick.fantasyGameweekId === gameweek.id) map.set(pick.playerId, pick.hasPlayed);
    });
    return map;
  }, [team, gameweek]);
  const transfersUsed = useMemo(() => {
    if (!transferWindow) return 0;
    const previousIds = new Set(transferWindow.previousPicks.map((pick) => pick.playerId));
    return selected.filter((pick) => !previousIds.has(pick.player.playerId)).length;
  }, [selected, transferWindow]);
  const transfersRemaining =
    transferWindow && !transferWindow.isUnlimited ? Math.max(0, transferWindow.transfersAllowed - transfersUsed) : null;

  // Prices + a manual transfer window are only meaningful while the round hasn't started yet.
  // Once it starts (reposition or fully locked), the panel automatically switches to showing
  // points instead of price/budget - no separate manual toggle needed.
  const isRoundOpen = !transferWindow || transferWindow.phase === "open";
  const roundPoints = useMemo(() => {
    if (!team || !gameweek) return 0;
    return team.picks.filter((pick) => pick.fantasyGameweekId === gameweek.id).reduce((sum, pick) => sum + pick.points, 0);
  }, [team, gameweek]);

  const pickedPlayerIds = useMemo(() => new Set(selected.map((pick) => pick.player.playerId)), [selected]);
  const pickerCandidates = useMemo(() => {
    const available = pool.filter((player) => !pickedPlayerIds.has(player.playerId));
    const expectedPosition = pickerSlot ? SLOT_POSITION[pickerSlot] : null;
    if (!expectedPosition) return available;
    return available.filter((player) => positionGroupOf(player.position) === expectedPosition);
  }, [pool, pickedPlayerIds, pickerSlot]);

  function statLabelFor(pick: SelectedPick | null): string {
    if (!pick) return "";
    const played = transferWindow?.phase === "reposition" && hasPlayedByPlayerId.get(pick.player.playerId) ? " 🔒" : "";
    if (!isRoundOpen) {
      const savedPoints = team?.picks.find((item) => item.playerId === pick.player.playerId && item.slot === pick.slot)?.points;
      return `${savedPoints ?? 0} pts${played}`;
    }
    return `${pick.player.currentPrice.toFixed(1)} CR${played}`;
  }

  function assignSlot(slot: string, player: FantasySeasonPoolPlayer) {
    setSaveError("");
    const expectedPosition = SLOT_POSITION[slot];
    if (expectedPosition && positionGroupOf(player.position) !== expectedPosition) {
      setSaveError(`Na ovu poziciju moze samo igrac koji igra na poziciji: ${POSITION_GROUP_LABELS[expectedPosition]}.`);
      return;
    }
    const current = pickFor(slot);
    const budgetAvailable = remaining + (current?.player.currentPrice ?? 0);
    if (player.currentPrice > budgetAvailable) {
      setSaveError("Nemas dovoljno budzeta za ovog igraca.");
      return;
    }
    const isStarterSlot = STARTER_SLOTS.some((s) => s.slot === slot);
    setSelected((previous) => {
      const withoutSlot = previous.filter((pick) => pick.slot !== slot);
      const hadCaptainElsewhere = withoutSlot.some((pick) => pick.isCaptain);
      const isCaptain = current?.isCaptain ?? (isStarterSlot && !hadCaptainElsewhere && withoutSlot.length === 0);
      return [...withoutSlot, { player, slot, isCaptain }];
    });
    setPickerSlot(null);
  }

  function removeSlot(slot: string) {
    setSelected((previous) => previous.filter((pick) => pick.slot !== slot));
    setPickerSlot(null);
  }

  function setCaptainForSlot(slot: string) {
    setSelected((previous) => previous.map((pick) => ({ ...pick, isCaptain: pick.slot === slot })));
    setPickerSlot(null);
  }

  function handleSlotLongPress(slot: string) {
    setSaveError("");
    setSwapSourceSlot((current) => (current === slot ? null : slot));
  }

  function handleSwap(sourceSlot: string, targetSlot: string) {
    const sourcePick = pickFor(sourceSlot);
    const targetPick = pickFor(targetSlot);
    if (!sourcePick || !targetPick) {
      setSaveError("Zamena je moguca samo izmedju dva popunjena mesta.");
      setSwapSourceSlot(null);
      return;
    }
    if (transferWindow?.phase === "reposition") {
      const sourcePlayed = hasPlayedByPlayerId.get(sourcePick.player.playerId);
      const targetPlayed = hasPlayedByPlayerId.get(targetPick.player.playerId);
      if (sourcePlayed || targetPlayed) {
        setSaveError("Jedan od ova dva igraca je vec odigrao mec ovog kola i ne moze da promeni poziciju.");
        setSwapSourceSlot(null);
        return;
      }
    }
    const sourceRequired = SLOT_POSITION[sourceSlot];
    const targetRequired = SLOT_POSITION[targetSlot];
    const sourcePlayerPosition = positionGroupOf(sourcePick.player.position);
    const targetPlayerPosition = positionGroupOf(targetPick.player.position);
    const eligible =
      (!targetRequired || targetRequired === sourcePlayerPosition) &&
      (!sourceRequired || sourceRequired === targetPlayerPosition);
    if (!eligible) {
      setSaveError("Igraci moraju biti iste pozicije da bi zamenili mesta.");
      setSwapSourceSlot(null);
      return;
    }
    setSelected((previous) =>
      previous.map((pick) => {
        if (pick.slot === sourceSlot) return { ...pick, slot: targetSlot };
        if (pick.slot === targetSlot) return { ...pick, slot: sourceSlot };
        return pick;
      })
    );
    setSwapSourceSlot(null);
  }

  function handleSlotPress(slot: string) {
    if (swapSourceSlot) {
      if (swapSourceSlot === slot) {
        setSwapSourceSlot(null);
      } else {
        handleSwap(swapSourceSlot, slot);
      }
      return;
    }
    if (transferWindow?.phase === "reposition") {
      setSaveError("Ovo kolo je vec pocelo - mozes samo da rasporedis vec izabrane igrace (drzi pritisnuto da zamenis mesto), bez novih transfera.");
      return;
    }
    if (transferWindow?.phase === "locked") {
      setSaveError("Ovo kolo je zakljucano.");
      return;
    }
    setPickerSlot(slot);
  }

  async function handleSave() {
    if (!season || !gameweek) return;
    const totalSlots = STARTER_SLOTS.length + BENCH_SLOTS.length;
    if (selected.length < totalSlots) {
      setSaveError(`Tim mora imati svih ${totalSlots} igraca (popunio si ${selected.length}).`);
      return;
    }
    if (!selected.some((pick) => pick.isCaptain)) {
      setSaveError("Izaberi kapitena.");
      return;
    }
    if (spent > budgetCap) {
      setSaveError(`Tim prelazi budzet od ${budgetCap.toFixed(1)} CR.`);
      return;
    }
    if (transfersRemaining !== null && transfersUsed > (transferWindow?.transfersAllowed ?? 0)) {
      setSaveError(`Dozvoljeno je najvise ${transferWindow?.transfersAllowed} transfera ovog kola.`);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const updated = await saveFantasySeasonPicks({
        fantasySeasonId: season.id,
        fantasyGameweekId: gameweek.id,
        picks: selected.map((pick) => ({ playerId: pick.player.playerId, slot: pick.slot, isCaptain: pick.isCaptain }))
      });
      setTeam(updated);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Cuvanje tima nije uspelo.");
    } finally {
      setSaving(false);
    }
  }

  const filteredPool = useMemo(() => {
    const base = isAdmin && !showAllPool ? pool.filter((player) => player.isAvailable) : pool;
    if (!search.trim()) return base;
    const query = search.trim().toLowerCase();
    return base.filter(
      (player) => player.displayName.toLowerCase().includes(query) || player.teamName.toLowerCase().includes(query)
    );
  }, [pool, search, isAdmin, showAllPool]);

  const acceptedPoolCount = useMemo(() => pool.filter((player) => player.isAvailable).length, [pool]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <LoadingState label="Ucitavanje fantasy tima..." />
      </View>
    );
  }

  if (!season) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerKicker}>Fantasy</Text>
          <Text style={styles.headerTitle}>Fantasy sezona</Text>
        </View>
        <View style={styles.content}>
          <EmptyState
            message={
              isAdmin
                ? isWide
                  ? "Jos nema fantasy sezone. Napravi je da bi korisnici mogli da prave svoje timove."
                  : "Fantasy sezona se pokrece samo sa desktop verzije."
                : "Admin jos nije pokrenuo fantasy sezonu. Vrati se kasnije."
            }
          />
          {isAdmin && isWide ? (
            <PrimaryButton label="Napravi fantasy sezonu" onPress={() => setShowSeasonComposer(true)} />
          ) : null}
        </View>

        {showSeasonComposer ? (
          <FantasySeasonComposerModal
            onClose={() => setShowSeasonComposer(false)}
            onSaved={(saved) => {
              setShowSeasonComposer(false);
              setSelectedSeasonId(saved.id);
            }}
          />
        ) : null}
      </View>
    );
  }

  const activePickerSlot = pickerSlot;
  const activePickerPick = activePickerSlot ? pickFor(activePickerSlot) : null;

  const leaguesLinked = (season.competitions ?? []).length > 0;
  // Matches the backend's own activation guard (assertSeasonReadyToActivate) - at
  // least one player actually accepted into the pool, not just synced-but-untouched.
  const playersSynced = acceptedPoolCount > 0;
  // Deliberately NOT part of allReady: gameweeks only ever get generated for an
  // already-active season (see runFantasyGameweekSweep), so requiring them before
  // activation would make "Pokreni sezonu" permanently unclickable. They're purely
  // informational here - a consequence of activating, not a precondition for it.
  const gameweeksReady = (season.gameweeks ?? []).length > 0;
  const allReady = leaguesLinked && playersSynced;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerKicker}>Fantasy</Text>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>{isAdmin ? (season?.name ?? "Fantasy") : (team?.name ?? "Fantasy")}</Text>
          <Pill label={seasonStatusLabel(season.status)} tone={seasonStatusTone(season.status)} />
        </View>
        {gameweek ? <Text style={styles.headerSubtitle}>{gameweek.name}</Text> : null}
      </View>

      <View style={styles.tabs}>
        {(isAdmin && isWide
          ? (["team", "pool", "leaderboard", "admin"] as Tab[])
          : (["team", "pool", "leaderboard"] as Tab[])
        ).map((value) => {
          const locked = !isAdmin && (value === "team" || value === "pool");
          return (
            <TouchableOpacity key={value} style={[styles.tabButton, tab === value ? styles.tabButtonActive : null]} onPress={() => setTab(value)}>
              {locked ? (
                <Ionicons name="lock-closed" size={11} color={tab === value ? "#fff" : colors.textMuted} />
              ) : null}
              <Text style={[styles.tabButtonText, tab === value ? styles.tabButtonTextActive : null]}>{tabLabel(value)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, isWide ? styles.contentWide : null]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
      >
        {error ? <ErrorState message={error} onRetry={load} /> : null}

        {tab === "team" && !isAdmin ? (
          <LockedComingSoonCard
            title="Moj tim uskoro stize"
            copy="Pravljenje fantasy tima ce biti dostupno cim zvanicna baza ekipa i igraca bude spremna za novu sezonu."
          />
        ) : null}

        {tab === "team" && isAdmin && !gameweek ? (
          <EmptyState message="Sezona uskoro pocinje. Vrati se kada admin otvori prvo kolo." />
        ) : null}

        {tab === "team" && isAdmin && gameweek ? (
          <View style={[styles.section, isWide ? styles.teamSectionWide : null]}>
            {isAdmin ? (
              <View style={styles.hintCard}>
                <Text style={styles.hintTitle}>Tvoj probni tim</Text>
                <Text style={styles.hintText}>
                  Ovo je tvoj licni test tim kao admin - ne ucestvuje u tabeli. Koristi ga da uvek vidis kako izgleda i funkcionise "Moj tim" ekran koji fanovi koriste.
                </Text>
              </View>
            ) : null}
            <View style={styles.statusRow}>
              <View style={styles.statusPill}>
                <Text style={styles.statusValue}>{team?.totalPoints ?? 0}</Text>
                <Text style={styles.statusLabel}>poena</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusValue}>
                  {isRoundOpen ? (transfersRemaining === null ? "∞" : transfersRemaining) : "Zatvoreno"}
                </Text>
                <Text style={styles.statusLabel}>transferi</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusValue}>{isRoundOpen ? `${remaining.toFixed(1)}/${budgetCap.toFixed(1)}` : roundPoints}</Text>
                <Text style={styles.statusLabel}>{isRoundOpen ? "budzet (CR)" : "poena ovog kola"}</Text>
              </View>
            </View>

            <LinearGradient colors={["#D9B24C", "#C9A227", "#8A6D1F"]} style={styles.summaryPanel}>
              <Pitch
                goalkeeper={{
                  slot: "GK",
                  name: pickFor("GK")?.player.displayName,
                  teamId: pickFor("GK")?.player.teamId,
                  avatarUrl: pickFor("GK")?.player.avatarUrl,
                  isCaptain: pickFor("GK")?.isCaptain,
                  statLabel: statLabelFor(pickFor("GK"))
                }}
                defenders={STARTER_SLOTS.filter((s) => s.position === "odbrana").map((s) => {
                  const pick = pickFor(s.slot);
                  return {
                    slot: s.slot,
                    name: pick?.player.displayName,
                    teamId: pick?.player.teamId,
                    avatarUrl: pick?.player.avatarUrl,
                    isCaptain: pick?.isCaptain,
                    statLabel: statLabelFor(pick)
                  };
                })}
                attackers={STARTER_SLOTS.filter((s) => s.position === "napad").map((s) => {
                  const pick = pickFor(s.slot);
                  return {
                    slot: s.slot,
                    name: pick?.player.displayName,
                    teamId: pick?.player.teamId,
                    avatarUrl: pick?.player.avatarUrl,
                    isCaptain: pick?.isCaptain,
                    statLabel: statLabelFor(pick)
                  };
                })}
                onSelectSlot={handleSlotPress}
                onLongPressSlot={handleSlotLongPress}
                swapSourceSlot={swapSourceSlot}
              />

              <BenchStrip
                slots={BENCH_SLOTS.map((s) => {
                  const pick = pickFor(s.slot);
                  return {
                    slot: s.slot,
                    teamId: pick?.player.teamId,
                    name: pick?.player.displayName,
                    avatarUrl: pick?.player.avatarUrl,
                    position: pick?.player.position,
                    isCaptain: pick?.isCaptain,
                    statLabel: statLabelFor(pick),
                    weightPercent: s.weightPercent
                  };
                })}
                onSelectSlot={handleSlotPress}
                onLongPressSlot={handleSlotLongPress}
                swapSourceSlot={swapSourceSlot}
              />
            </LinearGradient>

            <SponsorStrip />

            {transferWindow?.phase === "reposition" ? (
              <View style={styles.hintCard}>
                <Text style={styles.hintTitle}>Raspored igraca</Text>
                <Text style={styles.hintText}>
                  Drzi pritisnuto da zamenis mesto igracu (klupa/teren) - osim igraca koji je vec odigrao mec ovog kola (oznaceno sa 🔒).
                </Text>
              </View>
            ) : transferWindow?.phase === "locked" ? (
              <View style={styles.hintCard}>
                <Text style={styles.hintTitle}>Kolo je zavrseno</Text>
                <Text style={styles.hintText}>Tim se vise ne moze menjati za ovo kolo.</Text>
              </View>
            ) : (
              <View style={styles.hintCard}>
                <Text style={styles.hintTitle}>Klikni na poziciju</Text>
                <Text style={styles.hintText}>
                  Dodirni bilo kog igraca na terenu ili klupi da otvoris listu kandidata za tu poziciju. Drzi pritisnuto da zamenis mesto sa drugim igracem (mora biti ista pozicija).
                </Text>
              </View>
            )}

            {!hasCaptain && selected.length === STARTER_SLOTS.length + BENCH_SLOTS.length ? (
              <Text style={styles.captainHint}>Moras izabrati kapitena pre cuvanja tima.</Text>
            ) : null}
            {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

            <PrimaryButton
              label={saving ? "Cuvanje..." : `Sacuvaj tim (${selected.length}/${STARTER_SLOTS.length + BENCH_SLOTS.length})`}
              onPress={handleSave}
              loading={saving}
              disabled={
                selected.length < STARTER_SLOTS.length + BENCH_SLOTS.length ||
                spent > budgetCap ||
                !hasCaptain ||
                transferWindow?.phase === "locked"
              }
            />
          </View>
        ) : null}

        {tab === "pool" && !isAdmin ? (
          <LockedComingSoonCard
            title="Igraci uskoro stizu"
            copy="Lista igraca ce biti dostupna cim zvanicna baza ekipa i igraca bude spremna za novu sezonu."
          />
        ) : null}

        {tab === "pool" && isAdmin ? (
          <View style={styles.section}>
            <TextInput
              style={styles.searchInput}
              placeholder="Pretrazi igraca ili ekipu"
              placeholderTextColor="#9c9186"
              value={search}
              onChangeText={setSearch}
            />
            {isAdmin ? (
              <TouchableOpacity style={styles.poolFilterToggle} onPress={() => setShowAllPool((current) => !current)}>
                <Ionicons name={showAllPool ? "checkbox" : "square-outline"} size={18} color={colors.purple} />
                <Text style={styles.poolFilterToggleText}>Prikazi i iskljucene igrace (za pregled pre pocetka sezone)</Text>
              </TouchableOpacity>
            ) : null}
            {filteredPool.length === 0 ? <EmptyState message="Nema igraca u fantasy bazi za ovo takmicenje." /> : null}
            <View style={isWide ? styles.poolGrid : undefined}>
            {filteredPool.map((player) => (
              <Card
                key={player.id}
                style={[styles.poolCard, isWide ? styles.poolCardWide : null, !player.isAvailable ? styles.poolCardExcluded : null]}
              >
                <TouchableOpacity style={styles.pickInfo} onPress={() => setActivePlayerId(player.playerId)}>
                  <View style={styles.poolRowTop}>
                    <View>
                      <PoolAvatar avatarUrl={player.avatarUrl} teamId={player.teamId} />
                      <AvailabilityDot status={player.matchAvailability} />
                    </View>
                    <View style={styles.pickInfo}>
                      <Text style={styles.pickName}>{player.displayName}</Text>
                      <Text style={styles.pickMeta}>
                        {player.teamName} - {player.position || "igrac"}
                      </Text>
                      {player.competitionName ? <Text style={styles.pickLeague}>{player.competitionName}</Text> : null}
                      {!player.isAvailable ? <Text style={styles.poolExcludedLabel}>Iskljucen iz fantazija</Text> : null}
                    </View>
                  </View>
                </TouchableOpacity>
                {isAdmin && editingPriceId === player.playerId ? (
                  <View style={styles.priceEditRow}>
                    <TextInput
                      style={styles.priceEditInput}
                      value={priceDraft}
                      onChangeText={setPriceDraft}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                    <TouchableOpacity onPress={() => handleSavePrice(player.playerId)} disabled={priceSaving}>
                      <Text style={styles.priceEditSave}>{priceSaving ? "..." : "OK"}</Text>
                    </TouchableOpacity>
                    {player.isPriceLocked ? (
                      <TouchableOpacity onPress={() => handleUnlockPrice(player.playerId)}>
                        <Text style={styles.priceEditUnlock}>Otkljucaj</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : isAdmin ? (
                  <TouchableOpacity style={styles.priceAdminWrap} onPress={() => startEditPrice(player)}>
                    {player.isPriceLocked ? <Text style={styles.priceLockIcon}>🔒</Text> : null}
                    <Text style={styles.pickPrice}>{player.currentPrice.toFixed(1)} CR</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.pickPrice}>{player.currentPrice.toFixed(1)} CR</Text>
                )}
                {isAdmin ? (
                  <TouchableOpacity
                    style={styles.poolAvailabilityButton}
                    disabled={availabilitySavingId === player.playerId}
                    onPress={() => handleToggleAvailability(player)}
                  >
                    <Ionicons
                      name={player.isAvailable ? "close-circle-outline" : "checkmark-circle-outline"}
                      size={22}
                      color={player.isAvailable ? colors.danger : colors.success}
                    />
                  </TouchableOpacity>
                ) : null}
              </Card>
            ))}
            </View>
          </View>
        ) : null}

        {tab === "leaderboard" && !gameweek ? (
          <View style={styles.section}>
            <EmptyState message="Sezona uskoro pocinje. Tabela se otvara kada admin otvori prvo kolo." />
          </View>
        ) : null}

        {tab === "leaderboard" && gameweek ? (
          <View style={[styles.section, isWide ? styles.teamSectionWide : null]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
              <TouchableOpacity
                style={[styles.scopeChip, leaderboardScope === "season" ? styles.scopeChipActive : null]}
                onPress={() => setLeaderboardScope("season")}
              >
                <Text style={[styles.scopeChipText, leaderboardScope === "season" ? styles.scopeChipTextActive : null]}>
                  Sezona
                </Text>
              </TouchableOpacity>
              {[...(season?.gameweeks ?? [])]
                // Only rounds that have actually kicked off (locked) or finished show up
                // here - a still-"open" future round has no picks/scores yet, so listing
                // it in advance just gives an empty-looking table with nothing to show.
                .filter((gw) => gw.status !== "open")
                .reverse()
                .map((gw) => (
                <TouchableOpacity
                  key={gw.id}
                  style={[styles.scopeChip, leaderboardScope === gw.id ? styles.scopeChipActive : null]}
                  onPress={() => setLeaderboardScope(gw.id)}
                >
                  <Text style={[styles.scopeChipText, leaderboardScope === gw.id ? styles.scopeChipTextActive : null]}>
                    {gw.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.prizeHint}>
              {leaderboardScope === "season"
                ? "Najboljih 15 na kraju sezone osvaja nagrade."
                : "Najboljih 5 ovog kola osvaja nagrade."}
            </Text>

            {leaderboardLoading ? <LoadingState label="Ucitavanje tabele..." /> : null}
            {!leaderboardLoading && leaderboard.length === 0 ? (
              <EmptyState message="Tabela fantasy menadzera jos nije dostupna." />
            ) : null}
            {!leaderboardLoading &&
              leaderboard.map((entry) => (
                <LeaderboardRow
                  key={entry.fantasyTeamId}
                  entry={entry}
                  showTotalPoints={leaderboardScope === "season"}
                  prizeThreshold={leaderboardScope === "season" ? 15 : 5}
                  onPress={() =>
                    setViewingTeam({
                      fantasyTeamId: entry.fantasyTeamId,
                      gameweekId: leaderboardScope === "season" ? gameweek?.id : leaderboardScope,
                      managerName: entry.managerName
                    })
                  }
                />
              ))}

            <LinearGradient colors={gradients.hero} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.privateHero}>
              <View style={styles.privateHeroHeader}>
                <View style={styles.privateHeroIcon}>
                  <Ionicons name="lock-closed" size={16} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.privateEyebrow}>PRIVATNE LIGE</Text>
                  <Text style={styles.privateTitle}>Igraj samo sa drugarima</Text>
                </View>
              </View>
              <Text style={styles.privateSubtitle}>
                Napravi zatvorenu ligu ili se pridruzi kodom - rangira samo vas, bez admina i bez uticaja na zvanicnu tabelu.
              </Text>

              <View style={styles.privateActionsRow}>
                <TouchableOpacity style={styles.privateActionButton} onPress={() => setMiniLeagueModal("create")}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.ink} />
                  <Text style={styles.privateActionButtonText}>Napravi ligu</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.privateActionButton, styles.privateActionButtonGhost]}
                  onPress={() => setMiniLeagueModal("join")}
                >
                  <Ionicons name="key-outline" size={18} color="#fff" />
                  <Text style={[styles.privateActionButtonText, styles.privateActionButtonTextGhost]}>Pridruzi se kodom</Text>
                </TouchableOpacity>
              </View>

              {myMiniLeagues.length === 0 ? (
                <Text style={styles.privateEmptyText}>Jos uvek nisi u nijednoj privatnoj ligi.</Text>
              ) : (
                <View style={styles.privateListWrap}>
                  {myMiniLeagues.map((league) => (
                    <TouchableOpacity
                      key={league.id}
                      style={styles.privateLeagueRow}
                      activeOpacity={0.8}
                      onPress={() => setViewingMiniLeagueId(league.id)}
                    >
                      <View style={styles.privateLeagueBadge}>
                        <Ionicons name="shield-half-outline" size={16} color={colors.ink} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.privateLeagueName}>{league.name}</Text>
                        <Text style={styles.privateLeagueMeta}>
                          {league.memberCount} {league.memberCount === 1 ? "clan" : "clanova"}
                          {league.isCreator ? " - osnivac si" : ""}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </LinearGradient>

            <View style={{ marginTop: 8 }}>
              <SponsorStrip />
            </View>
          </View>
        ) : null}

        {miniLeagueModal && season ? (
          <MiniLeagueModal
            mode={miniLeagueModal}
            fantasySeasonId={season.id}
            onClose={() => setMiniLeagueModal(null)}
            onSaved={handleMiniLeagueSaved}
          />
        ) : null}

        {viewingMiniLeagueId ? (
          <MiniLeagueDetailModal
            miniLeagueId={viewingMiniLeagueId}
            gameweeks={season?.gameweeks ?? []}
            onClose={() => setViewingMiniLeagueId(null)}
            onChanged={handleMiniLeagueChanged}
            onSelectTeam={(fantasyTeamId, gameweekId, managerName) => setViewingTeam({ fantasyTeamId, gameweekId, managerName })}
          />
        ) : null}

        {tab === "admin" && isAdmin && isWide ? (
          <View style={[styles.section, isWide ? styles.adminGridWide : null]}>
            <Card style={[styles.adminCard, isWide ? styles.adminCardWide : null]}>
              <SectionTitle eyebrow={season.name} title="Podesavanja sezone" />
              <View style={styles.chipsRow}>
                {(season.competitions ?? []).map((competition) => (
                  <Pill key={competition.id} label={`${competition.cityName ? competition.cityName + " - " : ""}${competition.name}`} />
                ))}
              </View>

              <View style={styles.adminButtonsRow}>
                <TouchableOpacity style={styles.adminActionButton} onPress={() => setEditSeasonComposer(true)}>
                  <Text style={styles.adminActionButtonText}>Izmeni lige</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adminActionButtonPrimary, syncing ? styles.adminActionButtonDisabled : null]}
                  onPress={handleSyncPool}
                  disabled={syncing}
                >
                  <Text style={styles.adminActionButtonPrimaryText}>{syncing ? "Sinhronizujem..." : "Sinhronizuj fantasy bazu"}</Text>
                </TouchableOpacity>
              </View>

              {adminError ? <Text style={styles.saveError}>{adminError}</Text> : null}
              {syncMessage ? <Text style={styles.syncMessage}>{syncMessage}</Text> : null}
            </Card>

            <Card style={[styles.adminCard, isWide ? styles.adminCardWide : null]}>
              <SectionTitle eyebrow="Pregled" title="Status sezone" />
              <View style={styles.statusDashboardBadgeRow}>
                <Pill label={seasonStatusLabel(season.status)} tone={seasonStatusTone(season.status)} />
                <Text style={styles.statusDashboardBadgeHint}>
                  {season.status === "active"
                    ? "Fantasy je pokrenut - korisnici mogu da prave i menjaju svoje timove."
                    : season.status === "finished"
                    ? "Sezona je zavrsena. Rezultati i tabela ostaju vidljivi korisnicima."
                    : "Fantasy JOS NIJE pokrenut. Korisnici ne mogu da prave timove dok ne pritisnes \"Pokreni sezonu\" ispod."}
                </Text>
              </View>

              <View style={styles.checklistRow}>
                <Ionicons
                  name={leaguesLinked ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={leaguesLinked ? colors.success : colors.textMuted}
                />
                <Text style={styles.checklistText}>
                  Lige povezane: {(season.competitions ?? []).length}
                </Text>
              </View>
              <View style={styles.checklistRow}>
                <Ionicons
                  name={playersSynced ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={playersSynced ? colors.success : colors.textMuted}
                />
                <Text style={styles.checklistText}>
                  Igraci u bazi: {acceptedPoolCount} prihvaceno od {pool.length} ukupno
                </Text>
              </View>
              <View style={styles.checklistRow}>
                <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
                <Text style={styles.checklistText}>
                  {gameweeksReady
                    ? `Fantasy kola generisana: ${(season.gameweeks ?? []).length}`
                    : "Fantasy kola: pojavljuju se automatski nakon pokretanja sezone"}
                </Text>
              </View>

              {season.status !== "active" ? (
                <TouchableOpacity
                  style={[styles.adminActionButtonPrimary, !allReady ? styles.adminActionButtonDisabled : null]}
                  onPress={() => handleSeasonStatusChange("active")}
                  disabled={!allReady}
                >
                  <Text style={styles.adminActionButtonPrimaryText}>Pokreni sezonu</Text>
                </TouchableOpacity>
              ) : confirmingFinishSeason ? (
                <View style={styles.deleteConfirmBox}>
                  <Text style={styles.deleteConfirmText}>
                    Zavrsiti sezonu "{season.name}"? Korisnici vise nece moci da menjaju timove - tabela i rezultati ostaju vidljivi.
                  </Text>
                  <View style={styles.deleteConfirmRow}>
                    <TouchableOpacity style={styles.deleteConfirmCancel} onPress={() => setConfirmingFinishSeason(false)}>
                      <Text style={styles.adminActionButtonText}>Otkazi</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteConfirmButton} onPress={() => handleSeasonStatusChange("finished")}>
                      <Text style={styles.adminActionButtonPrimaryText}>Da, zavrsi sezonu</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.adminActionButton} onPress={() => setConfirmingFinishSeason(true)}>
                  <Text style={styles.adminActionButtonText}>Zavrsi sezonu</Text>
                </TouchableOpacity>
              )}
              {!allReady && season.status !== "active" ? (
                <Text style={styles.adminCardHint}>Zavrsi sve korake iznad da bi mogao da pokrenes sezonu.</Text>
              ) : null}
            </Card>

            <Card style={[styles.adminCard, isWide ? styles.adminCardWide : null]}>
              <SectionTitle eyebrow="Raspored" title="Fantasy kola" />
              <Text style={styles.adminCardHint}>
                Kola su nedelje ponedeljak-nedelja i potpuno su automatska - otvaraju se, zakljucavaju (na pocetku prve utakmice te nedelje) i boduju se same, na osnovu rasporeda povezanih liga. Nema rucne akcije.
              </Text>

              {(season.gameweeks ?? []).length === 0 ? <EmptyState message="Ova sezona jos nema fantasy kola - pojavice se cim povezane lige dobiju raspored utakmica." /> : null}

              {(season.gameweeks ?? []).map((gw) => (
                <View key={gw.id} style={styles.gwRow}>
                  <View style={styles.pickInfo}>
                    <Text style={styles.pickName}>{gw.name}</Text>
                    <Text style={styles.pickMeta}>Zakljucava se {formatGwDate(gw.locksAt)}</Text>
                  </View>
                  <Pill label={gameweekStatusLabel(gw.status)} tone={gameweekStatusTone(gw.status)} />
                </View>
              ))}
            </Card>

            <Card style={[styles.adminCard, styles.adminCardCompact]}>
              <SectionTitle eyebrow="Admin" title="Sve sezone" />
              {allSeasons.length > 1 ? (
                <View style={styles.chipsRow}>
                  {allSeasons.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.seasonChip, item.id === season.id ? styles.seasonChipActive : null]}
                      onPress={() => setSelectedSeasonId(item.id)}
                    >
                      <Text style={[styles.seasonChipText, item.id === season.id ? styles.seasonChipTextActive : null]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <TouchableOpacity style={styles.adminActionButton} onPress={() => setShowSeasonComposer(true)}>
                <Text style={styles.adminActionButtonText}>Nova fantasy sezona</Text>
              </TouchableOpacity>
            </Card>
          </View>
        ) : null}
      </ScrollView>

      {showSeasonComposer ? (
        <FantasySeasonComposerModal
          onClose={() => setShowSeasonComposer(false)}
          onSaved={(saved) => {
            setShowSeasonComposer(false);
            setSelectedSeasonId(saved.id);
          }}
        />
      ) : null}

      {editSeasonComposer ? (
        <FantasySeasonComposerModal
          season={season}
          onClose={() => setEditSeasonComposer(false)}
          onSaved={() => {
            setEditSeasonComposer(false);
            load();
          }}
        />
      ) : null}

      <PlayerPickerSheet
        visible={activePickerSlot !== null}
        slotLabel={activePickerSlot ? SLOT_LABELS[activePickerSlot] || activePickerSlot : ""}
        candidates={pickerCandidates}
        hasCurrentPlayer={Boolean(activePickerPick)}
        isCaptain={Boolean(activePickerPick?.isCaptain)}
        canBeCaptain={activePickerSlot !== null && STARTER_SLOTS.some((s) => s.slot === activePickerSlot)}
        onSelect={(player) => activePickerSlot && assignSlot(activePickerSlot, player)}
        onRemove={() => activePickerSlot && removeSlot(activePickerSlot)}
        onSetCaptain={() => activePickerSlot && setCaptainForSlot(activePickerSlot)}
        onViewProfile={(player) => setActivePlayerId(player.playerId)}
        onClose={() => setPickerSlot(null)}
      />

      {activePlayerId ? <PlayerProfileModal playerId={activePlayerId} onClose={() => setActivePlayerId(null)} /> : null}

      {viewingTeam ? (
        <ManagerTeamModal
          fantasyTeamId={viewingTeam.fantasyTeamId}
          fantasyGameweekId={viewingTeam.gameweekId}
          managerName={viewingTeam.managerName}
          onClose={() => setViewingTeam(null)}
        />
      ) : null}
    </View>
  );
}

// Same "locked, coming soon" treatment as the Gol nedelje card on News - the tab stays
// visible (with a lock icon) so fans know the feature exists, but the real screen only
// works once there's a real team/player database to build a fantasy squad from.
function LockedComingSoonCard({ title, copy }: { title: string; copy: string }) {
  return (
    <Card style={styles.lockedCard}>
      <View style={styles.lockedHead}>
        <SectionTitle eyebrow="Fantasy" title={title} />
        <Pill label="Uskoro" tone="warning" />
      </View>
      <View style={styles.lockedBody}>
        <View style={styles.lockedIconWrap}>
          <Ionicons name="lock-closed" size={18} color={colors.purple} />
        </View>
        <Text style={styles.lockedCopy}>{copy}</Text>
      </View>
    </Card>
  );
}

function PoolAvatar({ avatarUrl, teamId }: { avatarUrl?: string; teamId: string }) {
  const [failed, setFailed] = useState(false);
  if (avatarUrl && !failed) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={styles.poolFace}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <View style={[styles.poolFace, { backgroundColor: kitColorForTeam(teamId) }]} />;
}

function seasonStatusLabel(status: string): string {
  if (status === "active") return "Aktivna";
  if (status === "finished") return "Zavrsena";
  return "Priprema";
}

function seasonStatusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "active") return "success";
  if (status === "finished") return "neutral";
  return "warning";
}

function gameweekStatusLabel(status: string): string {
  if (status === "open") return "Otvoreno";
  if (status === "locked") return "Zakljucano";
  if (status === "finished") return "Zavrseno";
  return status;
}

function gameweekStatusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "open") return "success";
  if (status === "finished") return "neutral";
  return "warning";
}

function formatGwDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 10 },
  headerKicker: { color: colors.purple, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  headerTitle: { color: colors.ink, fontSize: 24, fontWeight: "700", flexShrink: 1 },
  headerSubtitle: { color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  statusDashboardBadgeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDashboardBadgeHint: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checklistText: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 18, marginBottom: 8 },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  },
  tabButtonActive: { backgroundColor: colors.ink },
  tabButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  tabButtonTextActive: { color: "#fff" },
  content: { paddingHorizontal: 18, paddingBottom: 40, gap: 12 },
  contentWide: { paddingHorizontal: 32, gap: 20 },
  section: { gap: 10 },
  teamSectionWide: { maxWidth: 560, alignSelf: "center", width: "100%" },
  poolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  poolCardWide: { width: 380 },
  adminGridWide: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 },
  adminCardWide: { flexBasis: 420, flexGrow: 1 },
  // Deliberately smaller than the other admin cards - switching seasons or creating a
  // new one is a rare, secondary action next to the season you're actively running,
  // and shouldn't visually compete with it for attention.
  adminCardCompact: { flexBasis: 260, flexGrow: 0, width: 260 },
  statusRow: { flexDirection: "row", gap: 8 },
  statusPill: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#141414",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  statusValue: { color: colors.textPrimary, fontWeight: "800", fontSize: 17 },
  statusLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 3 },
  summaryPanel: {
    borderRadius: 24,
    padding: 16,
    gap: 4,
    shadowColor: "#141414",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  hintCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#141414",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  hintTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  hintText: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  lockedCard: { gap: 10 },
  lockedHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  lockedBody: { flexDirection: "row", alignItems: "center", gap: 12 },
  lockedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  lockedCopy: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  pickInfo: { flex: 1 },
  pickName: { color: colors.textPrimary, fontWeight: "700" },
  pickMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  pickLeague: { color: colors.purple, fontSize: 11, fontWeight: "700", marginTop: 2 },
  pickPrice: { color: colors.pink, fontWeight: "700" },
  priceAdminWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  priceLockIcon: { fontSize: 11 },
  priceEditRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  priceEditInput: {
    width: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: colors.textPrimary,
    fontWeight: "700",
    textAlign: "center"
  },
  priceEditSave: { color: colors.purple, fontWeight: "800", fontSize: 13 },
  priceEditUnlock: { color: colors.textMuted, fontWeight: "700", fontSize: 11 },
  saveError: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  captainHint: { color: colors.warning, fontWeight: "700", textAlign: "center", fontSize: 12 },
  searchInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  poolFilterToggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  poolFilterToggleText: { color: colors.textMuted, fontWeight: "600", fontSize: 12, flex: 1 },
  poolCard: { flexDirection: "row", alignItems: "center", gap: 10 },
  poolCardExcluded: { opacity: 0.55, borderWidth: 1, borderColor: colors.danger },
  poolExcludedLabel: { color: colors.danger, fontSize: 11, fontWeight: "700", marginTop: 2 },
  poolAvailabilityButton: { paddingLeft: 6 },
  poolRowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  poolFace: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    overflow: "hidden",
    backgroundColor: "#ece8e0",
    shadowColor: "#141414",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  scopeRow: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  scopeChip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  scopeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  scopeChipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  scopeChipTextActive: { color: "#fff" },
  prizeHint: { color: colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "center", marginBottom: 4 },
  privateHero: {
    borderRadius: 22,
    padding: 18,
    marginTop: 18,
    gap: 14
  },
  privateHeroHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  privateHeroIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  privateEyebrow: { color: colors.primary, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  privateTitle: { color: "#fff", fontWeight: "800", fontSize: 18, marginTop: 2 },
  privateSubtitle: { color: colors.textOnDarkMuted, fontSize: 13, lineHeight: 19 },
  privateActionsRow: { flexDirection: "row", gap: 10 },
  privateActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12
  },
  privateActionButtonGhost: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)"
  },
  privateActionButtonText: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  privateActionButtonTextGhost: { color: "#fff" },
  privateEmptyText: { color: colors.textOnDarkMuted, fontSize: 13, fontStyle: "italic" },
  privateListWrap: { gap: 8 },
  privateLeagueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  privateLeagueBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  privateLeagueName: { color: "#fff", fontWeight: "700", fontSize: 14 },
  privateLeagueMeta: { color: colors.textOnDarkMuted, fontSize: 12, marginTop: 2 },
  adminCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 10
  },
  adminCardHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  seasonChip: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  seasonChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  seasonChipText: { color: colors.textPrimary, fontWeight: "700", fontSize: 12 },
  seasonChipTextActive: { color: "#fff" },
  adminButtonsRow: { flexDirection: "row", gap: 8 },
  adminActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  adminActionButtonText: { color: colors.textPrimary, fontWeight: "700", fontSize: 12 },
  adminActionButtonPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.purple
  },
  adminActionButtonPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  adminActionButtonDisabled: { opacity: 0.5 },
  deleteConfirmBox: {
    backgroundColor: "rgba(160,24,61,0.08)",
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  deleteConfirmText: { color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  deleteConfirmRow: { flexDirection: "row", gap: 10 },
  deleteConfirmCancel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  },
  deleteConfirmButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.danger
  },
  syncMessage: { color: colors.purple, fontWeight: "700", fontSize: 12, textAlign: "center" },
  gwRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line
  }
});
