import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createFantasyMiniLeague, joinFantasyMiniLeague } from "../api/endpoints";
import type { FantasyMiniLeague } from "../api/types";
import { ApiError } from "../api/client";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { PrimaryButton } from "../components/ui";

export function MiniLeagueModal({
  mode,
  fantasySeasonId,
  onClose,
  onSaved
}: {
  mode: "create" | "join";
  fantasySeasonId: string;
  onClose: () => void;
  onSaved: (miniLeagueId?: string) => void;
}) {
  const isWide = useIsWideScreen();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<FantasyMiniLeague | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Naziv lige je obavezan.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const league = await createFantasyMiniLeague({ fantasySeasonId, name: name.trim() });
      setCreated(league);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Liga nije napravljena.");
    } finally {
      setSaving(false);
    }
  }

  async function handleJoin() {
    if (!code.trim()) {
      setError("Unesi kod lige.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const league = await joinFantasyMiniLeague(code.trim());
      onSaved(league.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pridruzivanje nije uspelo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          {created ? (
            <>
              <Text style={styles.title}>Liga je napravljena!</Text>
              <Text style={styles.subtitle}>Podeli ovaj kod sa drugarima da se pridruze:</Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>{created.inviteCode}</Text>
              </View>
              <PrimaryButton label="Zavrsi" onPress={() => onSaved(created.id)} />
            </>
          ) : (
            <>
              <Text style={styles.title}>{mode === "create" ? "Napravi privatnu ligu" : "Pridruzi se ligi"}</Text>
              <Text style={styles.subtitle}>
                {mode === "create"
                  ? "Napravi zatvorenu ligu i pozovi drugare da se takmicite jedni protiv drugih."
                  : "Unesi kod koji ti je poslao osnivac lige."}
              </Text>

              {mode === "create" ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Naziv lige</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="npr. Drustvo sa posla"
                    placeholderTextColor="#9c9186"
                    value={name}
                    onChangeText={setName}
                    maxLength={60}
                  />
                </View>
              ) : (
                <View style={styles.field}>
                  <Text style={styles.label}>Kod lige</Text>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="npr. AB12CD"
                    placeholderTextColor="#9c9186"
                    value={code}
                    onChangeText={(value) => setCode(value.toUpperCase())}
                    autoCapitalize="characters"
                    maxLength={6}
                  />
                </View>
              )}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                label={saving ? "Cuvanje..." : mode === "create" ? "Napravi ligu" : "Pridruzi se"}
                onPress={mode === "create" ? handleCreate : handleJoin}
                loading={saving}
              />
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Otkazi</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  field: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.line
  },
  codeInput: { textAlign: "center", fontSize: 20, fontWeight: "800", letterSpacing: 4 },
  codeBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary,
    paddingVertical: 28,
    alignItems: "center"
  },
  codeText: { color: colors.ink, fontSize: 34, fontWeight: "800", letterSpacing: 6 },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
