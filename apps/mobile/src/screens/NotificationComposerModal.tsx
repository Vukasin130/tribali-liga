import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { sendAdminNotification } from "../api/endpoints";
import { colors } from "../theme/colors";
import { wideContent } from "../theme/layout";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { PrimaryButton } from "../components/ui";

export function NotificationComposerModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ recipients: number; sent: number } | null>(null);
  const isWide = useIsWideScreen();

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      setError("Naslov i poruka su obavezni.");
      return;
    }
    setSending(true);
    setError("");
    setResult(null);
    try {
      const response = await sendAdminNotification(title.trim(), body.trim());
      setResult(response);
      setTitle("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notifikacija nije poslata.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, isWide ? wideContent : null]}>
          <Text style={styles.title}>Posalji notifikaciju</Text>
          <Text style={styles.subtitle}>Poruka ide svim korisnicima koji su dozvolili notifikacije na svom telefonu.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Naslov</Text>
            <TextInput
              style={styles.input}
              placeholder="npr. Novo kolo je otvoreno!"
              placeholderTextColor="#9c9186"
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Poruka</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Kratak tekst notifikacije..."
              placeholderTextColor="#9c9186"
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={200}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {result ? (
            <Text style={styles.success}>
              Poslato {result.sent} od {result.recipients} korisnika koji imaju ukljucene notifikacije.
            </Text>
          ) : null}

          <PrimaryButton label={sending ? "Slanje..." : "Posalji svima"} onPress={handleSend} loading={sending} />
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Zatvori</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontWeight: "600", marginBottom: 4 },
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
  textArea: { minHeight: 90, textAlignVertical: "top" },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  success: { color: colors.success, fontWeight: "700", textAlign: "center" },
  cancelButton: { alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: colors.textMuted, fontWeight: "700" }
});
