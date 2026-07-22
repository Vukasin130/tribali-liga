import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../state/AuthContext";
import { PrimaryButton } from "../components/ui";
import { colors } from "../theme/colors";
import type { AuthStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.glowAqua} />
      <View style={styles.glowPink} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.spacer} />
        <View style={styles.card}>
          <LinearGradient colors={["#D9B24C", "#C9A227", "#8A6D1F"]} style={styles.logoRing}>
            <View style={styles.logoInner}>
              <Image source={require("../../assets/icon.png")} style={styles.logoImage} resizeMode="cover" />
            </View>
          </LinearGradient>
          <Text style={styles.title}>Ulaz u Tribali Liga</Text>
          <Text style={styles.subtitle}>Prijavi se da pratis fantasy tim, live utakmice i vesti lige.</Text>

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
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton label={submitting ? "Prijava..." : "Udji u aplikaciju"} onPress={handleLogin} loading={submitting} />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Nemas nalog?</Text>
            <Text style={styles.footerLink} onPress={() => navigation.navigate("Register")}>
              Napravi nalog
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  glowAqua: {
    position: "absolute",
    top: -80,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.aqua,
    opacity: 0.16
  },
  glowPink: {
    position: "absolute",
    bottom: -80,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.pink,
    opacity: 0.14
  },
  content: { flexGrow: 1, padding: 20, justifyContent: "flex-end" },
  spacer: { flex: 1, minHeight: 60 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 24,
    gap: 14,
    shadowColor: "#141414",
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4
  },
  logoRing: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  logoInner: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#141414", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImage: { width: 44, height: 44 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginBottom: 4 },
  field: { gap: 6 },
  label: { color: colors.softInk, fontWeight: "600", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.line
  },
  error: { color: colors.danger, fontWeight: "600" },
  footerRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 4 },
  footerText: { color: colors.textMuted },
  footerLink: { color: colors.purple, fontWeight: "700" }
});
