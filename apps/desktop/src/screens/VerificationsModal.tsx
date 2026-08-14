import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  PrimaryButton,
  colors,
  listVerificationRequests,
  reviewVerificationRequest,
  searchPlayers,
  type Player,
  type VerificationRequest
} from "@tribali-liga/mobile/shared";

// Desktop-only by design: reviewing "I'm a verified player" signups is an admin
// chore, not something that needs to fit on a phone screen. This screen lives in
// apps/desktop (not apps/mobile/src/screens) specifically so it can never end up
// wired into the mobile app's own navigation - see DesktopShell.tsx for the only
// entry point into it.
type StatusFilter = "pending" | "approved" | "rejected";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "Na cekanju" },
  { key: "approved", label: "Odobreno" },
  { key: "rejected", label: "Odbijeno" }
];

export function VerificationsModal({ onClose }: { onClose: () => void }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    listVerificationRequests(statusFilter)
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam zahteve."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Verifikacije igraca</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.closeText}>Zatvori</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabsRow}>
          {STATUS_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, statusFilter === tab.key ? styles.tabActive : null]}
              onPress={() => setStatusFilter(tab.key)}
            >
              <Text style={[styles.tabText, statusFilter === tab.key ? styles.tabTextActive : null]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <LoadingState label="Ucitavanje zahteva..." /> : null}
        {error ? <ErrorState message={error} onRetry={load} /> : null}

        {!loading && !error ? (
          <ScrollView contentContainerStyle={styles.content}>
            {requests.length === 0 ? <EmptyState message="Nema zahteva u ovoj kategoriji." /> : null}
            {requests.map((request) => (
              <VerificationRow key={request.id} request={request} onReviewed={load} />
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

function VerificationRow({ request, onReviewed }: { request: VerificationRequest; onReviewed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const alreadyLinked = Boolean(request.playerId);
  const isPending = request.status === "pending";

  async function handleSearch(text: string) {
    setQuery(text);
    setSelectedPlayer(null);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found = await searchPlayers(text.trim());
      setResults(found.slice(0, 8));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleApprove() {
    const playerId = selectedPlayer?.id || request.playerId;
    if (!playerId) {
      setError("Izaberi igraca iz baze pre odobravanja.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await reviewVerificationRequest(request.id, {
        status: "approved",
        playerId,
        teamId: selectedPlayer?.teams[0]?.teamId,
        adminNote: note.trim()
      });
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Odobravanje nije uspelo.");
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError("");
    try {
      await reviewVerificationRequest(request.id, { status: "rejected", adminNote: note.trim() });
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Odbijanje nije uspelo.");
      setBusy(false);
    }
  }

  return (
    <Card style={styles.row}>
      <View style={styles.rowHead}>
        <View style={styles.flex1}>
          <Text style={styles.requesterName}>{request.displayName || request.email}</Text>
          <Text style={styles.requesterEmail}>{request.email}</Text>
        </View>
        <Pill
          label={request.status === "pending" ? "Na cekanju" : request.status === "approved" ? "Odobreno" : "Odbijeno"}
          tone={request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "warning"}
        />
      </View>

      <View style={styles.claimBox}>
        <Text style={styles.claimLabel}>Prijavljuje se kao</Text>
        <Text style={styles.claimValue}>{request.playerName}</Text>
        {request.teamName ? (
          <Text style={styles.claimMeta}>
            {request.teamName}
            {request.cityName ? ` - ${request.cityName}` : ""}
          </Text>
        ) : null}
        {request.matchedPlayerName ? <Text style={styles.matchedText}>Povezano sa: {request.matchedPlayerName}</Text> : null}
      </View>

      {isPending ? (
        <>
          {!alreadyLinked ? (
            <View style={styles.searchBox}>
              <Text style={styles.claimLabel}>Poveži sa igracem iz baze</Text>
              <TextInput
                style={styles.input}
                placeholder="Pretrazi igraca po imenu..."
                placeholderTextColor="#9c9186"
                value={query}
                onChangeText={handleSearch}
              />
              {searching ? <Text style={styles.hintText}>Pretraga...</Text> : null}
              {results.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  style={[styles.resultRow, selectedPlayer?.id === player.id ? styles.resultRowActive : null]}
                  onPress={() => setSelectedPlayer(player)}
                >
                  <Text style={styles.resultText}>
                    {player.displayName}
                    {player.teams[0] ? ` - ${player.teams[0].teamName}` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Napomena (opciono)"
            placeholderTextColor="#9c9186"
            value={note}
            onChangeText={setNote}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actionsRow}>
            <View style={styles.flex1}>
              <PrimaryButton
                label={busy ? "..." : "Odobri"}
                onPress={handleApprove}
                loading={busy}
                disabled={busy || (!alreadyLinked && !selectedPlayer)}
              />
            </View>
            <View style={styles.flex1}>
              <PrimaryButton label={busy ? "..." : "Odbij"} onPress={handleReject} loading={busy} disabled={busy} variant="danger" />
            </View>
          </View>
        </>
      ) : request.adminNote ? (
        <Text style={styles.noteText}>Napomena: {request.adminNote}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 12
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  closeText: { color: colors.purple, fontWeight: "700" },
  tabsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 24, paddingBottom: 12 },
  tab: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceMuted },
  tabActive: { backgroundColor: colors.ink },
  tabText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: "#fff" },
  content: { paddingHorizontal: 24, paddingBottom: 60, gap: 12, maxWidth: 760, width: "100%", alignSelf: "center" },
  row: { gap: 12 },
  rowHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  flex1: { flex: 1 },
  requesterName: { color: colors.ink, fontWeight: "800", fontSize: 15 },
  requesterEmail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  claimBox: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 12, gap: 3 },
  claimLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  claimValue: { color: colors.ink, fontWeight: "800", fontSize: 15 },
  claimMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  matchedText: { color: colors.success, fontWeight: "700", fontSize: 12, marginTop: 4 },
  searchBox: { gap: 8 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  hintText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  resultRow: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.line
  },
  resultRowActive: { borderColor: colors.purple, backgroundColor: "rgba(201,162,39,0.1)" },
  resultText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  errorText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: 10 },
  noteText: { color: colors.textMuted, fontSize: 12, fontWeight: "600", fontStyle: "italic" }
});
