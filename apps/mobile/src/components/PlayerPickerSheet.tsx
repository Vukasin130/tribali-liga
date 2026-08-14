import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { kitGradientForTeam } from "./PitchPlayerCard";
import { AvailabilityDot } from "./AvailabilityDot";
import type { FantasySeasonPoolPlayer } from "../api/types";

export function PlayerPickerSheet({
  visible,
  slotLabel,
  candidates,
  hasCurrentPlayer,
  isCaptain,
  canBeCaptain,
  onSelect,
  onRemove,
  onSetCaptain,
  onViewProfile,
  onClose
}: {
  visible: boolean;
  slotLabel: string;
  candidates: FantasySeasonPoolPlayer[];
  hasCurrentPlayer: boolean;
  isCaptain: boolean;
  canBeCaptain: boolean;
  onSelect: (player: FantasySeasonPoolPlayer) => void;
  onRemove: () => void;
  onSetCaptain: () => void;
  onViewProfile?: (player: FantasySeasonPoolPlayer) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (visible) setSearch("");
  }, [visible, slotLabel]);

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const query = search.trim().toLowerCase();
    return candidates.filter(
      (player) => player.displayName.toLowerCase().includes(query) || player.teamName.toLowerCase().includes(query)
    );
  }, [candidates, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <View>
              <Text style={styles.title}>Zameni {slotLabel}</Text>
              <Text style={styles.subtitle}>
                Dostupno za izabranu poziciju{onViewProfile ? " · dodirni sliku za profil igraca" : ""}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Zatvori</Text>
            </TouchableOpacity>
          </View>

          {hasCurrentPlayer ? (
            <View style={styles.currentActions}>
              {isCaptain || !canBeCaptain ? null : (
                <TouchableOpacity style={styles.captainRow} onPress={onSetCaptain}>
                  <Text style={styles.captainRowText}>Postavi za kapitena (x2 poena)</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.removeRow} onPress={onRemove}>
                <Text style={styles.removeRowText}>Ukloni igraca sa ove pozicije</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TextInput
            style={styles.searchInput}
            placeholder="Pretrazi igraca ili ekipu"
            placeholderTextColor="#9c9186"
            value={search}
            onChangeText={setSearch}
          />

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? <Text style={styles.empty}>Nema dostupnih igraca.</Text> : null}
            {filtered.map((player) => (
              <PickerRow key={player.id} player={player} onSelect={onSelect} onViewProfile={onViewProfile} />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PickerRow({
  player,
  onSelect,
  onViewProfile
}: {
  player: FantasySeasonPoolPlayer;
  onSelect: (player: FantasySeasonPoolPlayer) => void;
  onViewProfile?: (player: FantasySeasonPoolPlayer) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const move = Number((player.currentPrice - player.basePrice).toFixed(1));

  return (
    <TouchableOpacity style={styles.row} onPress={() => onSelect(player)} activeOpacity={0.75}>
      <TouchableOpacity
        onPress={() => onViewProfile?.(player)}
        disabled={!onViewProfile}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        {player.avatarUrl && !photoFailed ? (
          <View style={styles.face}>
            <Image
              source={{ uri: player.avatarUrl }}
              style={styles.faceImage}
              resizeMode="cover"
              onError={() => setPhotoFailed(true)}
            />
          </View>
        ) : (
          <LinearGradient
            colors={kitGradientForTeam(player.teamId)}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.face}
          >
            <View style={styles.faceHead} />
          </LinearGradient>
        )}
        <AvailabilityDot status={player.matchAvailability} />
      </TouchableOpacity>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{player.displayName}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {player.currentPrice.toFixed(1)} CR - {player.teamName}
        </Text>
        {player.competitionName ? <Text style={styles.rowLeague} numberOfLines={1}>{player.competitionName}</Text> : null}
      </View>
      {move !== 0 ? (
        <View style={[styles.moveBox, move > 0 ? styles.moveBoxUp : styles.moveBoxDown]}>
          <Text style={[styles.moveText, move > 0 ? styles.moveUp : styles.moveDown]}>
            {move > 0 ? "+" : ""}{move.toFixed(1)}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,20,20,0.45)", justifyContent: "flex-end" },
  backdropTap: { ...(StyleSheet.absoluteFillObject as object) },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 24,
    maxHeight: "80%",
    shadowColor: "#141414",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.line,
    alignSelf: "center",
    marginBottom: 12
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  closeButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  closeButtonText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  currentActions: { gap: 8, marginBottom: 10 },
  captainRow: {
    backgroundColor: "rgba(227,178,60,0.22)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  captainRowText: { color: colors.ink, fontWeight: "700", fontSize: 13, textAlign: "center" },
  removeRow: {
    backgroundColor: "rgba(160,24,61,0.1)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  removeRowText: { color: colors.danger, fontWeight: "700", fontSize: 13, textAlign: "center" },
  searchInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 8
  },
  list: { maxHeight: 420 },
  empty: { color: colors.textMuted, textAlign: "center", paddingVertical: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  face: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    overflow: "hidden",
    backgroundColor: "#ece8e0",
    shadowColor: "#141414",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  faceImage: { width: "100%", height: "100%" },
  faceHead: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#f0c7ae", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  rowInfo: { flex: 1 },
  rowName: { color: colors.textPrimary, fontWeight: "700" },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowLeague: { color: colors.purple, fontSize: 11, fontWeight: "700", marginTop: 2 },
  moveBox: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  moveBoxUp: { backgroundColor: "rgba(8,122,74,0.12)" },
  moveBoxDown: { backgroundColor: "rgba(160,24,61,0.1)" },
  moveText: { fontSize: 12, fontWeight: "700" },
  moveUp: { color: colors.success },
  moveDown: { color: colors.danger }
});
