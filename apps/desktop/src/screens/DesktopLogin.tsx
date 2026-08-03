import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, PrimaryButton, useAuth } from "@tribali-liga/mobile/shared";

export function DesktopLogin() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch {
      // surfaced via useAuth().error
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>Tribali Liga - Desktop</Text>
        <Text style={styles.subtitle}>Admin prijava</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="ime@primer.rs"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            onSubmitEditing={handleLogin}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Lozinka</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="******"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            onSubmitEditing={handleLogin}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton label={submitting ? "Prijava..." : "Uloguj se"} onPress={handleLogin} loading={submitting} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    gap: 14,
    shadowColor: "#141414",
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  field: { gap: 6 },
  label: { color: colors.softInk, fontWeight: "600", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.line
  },
  error: { color: colors.danger, fontWeight: "600" }
});
