import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../state/AuthContext";
import { PrimaryButton } from "../components/ui";
import { colors } from "../theme/colors";
import type { AuthStackParamList } from "../navigation/types";
import { LegalScreen } from "./LegalScreen";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;
type RoleChoice = "fan" | "verified_player";

export function RegisterScreen({ navigation }: Props) {
  const { register, error } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleChoice>("fan");
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalScreen, setLegalScreen] = useState<"privacy" | "terms" | null>(null);

  async function handleRegister() {
    setSubmitting(true);
    try {
      await register({ email: email.trim(), password, displayName: displayName.trim(), roleIntent: role });
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
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Tribali Liga</Text>
          <Text style={styles.title}>Napravi nalog</Text>
          <Text style={styles.subtitle}>Prati ligu, gradi fantasy tim i glasaj za gol nedelje.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Ime i prezime</Text>
            <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="npr. Vukasin Simon" placeholderTextColor={colors.textMuted} />
          </View>

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
              placeholder="minimum 6 karaktera"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Tip korisnika</Text>
            <TouchableOpacity
              style={[styles.roleCard, role === "fan" ? styles.roleCardActive : null]}
              onPress={() => setRole("fan")}
            >
              <Text style={styles.roleTitle}>Obican korisnik</Text>
              <Text style={styles.roleText}>Prati ligu, pravi fantasy tim, glasa i ulazi u privatne lige.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleCard, role === "verified_player" ? styles.roleCardActive : null]}
              onPress={() => setRole("verified_player")}
            >
              <Text style={styles.roleTitle}>Verifikovani igrac</Text>
              <Text style={styles.roleText}>Za stvarne ucesnike lige koji povezuju nalog sa svojim profilom.</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.termsRow} onPress={() => setAcceptedTerms((value) => !value)}>
            <View style={[styles.checkbox, acceptedTerms ? styles.checkboxChecked : null]}>
              {acceptedTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.termsText}>
              Prihvatam{" "}
              <Text style={styles.termsLink} onPress={() => setLegalScreen("terms")}>Uslove koriscenja</Text>
              {" "}i{" "}
              <Text style={styles.termsLink} onPress={() => setLegalScreen("privacy")}>Politiku privatnosti</Text>
            </Text>
          </TouchableOpacity>

          <PrimaryButton
            label={submitting ? "Kreiranje..." : "Napravi nalog"}
            onPress={handleRegister}
            loading={submitting}
            disabled={!acceptedTerms || !displayName.trim() || !email.trim() || password.length < 6}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Vec imas nalog?</Text>
            <Text style={styles.footerLink} onPress={() => navigation.navigate("Login")}>
              Prijavi se
            </Text>
          </View>
        </View>
      </ScrollView>

      {legalScreen ? <LegalScreen kind={legalScreen} onClose={() => setLegalScreen(null)} /> : null}
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
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
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
  eyebrow: { color: colors.purple, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
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
  roleCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    marginTop: 8,
    gap: 3
  },
  roleCardActive: { borderColor: colors.purple, backgroundColor: "rgba(201,162,39,0.06)" },
  roleTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  roleText: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  error: { color: colors.danger, fontWeight: "600" },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1
  },
  checkboxChecked: { backgroundColor: colors.purple, borderColor: colors.purple },
  checkboxMark: { color: "#fff", fontWeight: "700", fontSize: 14 },
  termsText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  termsLink: { color: colors.purple, fontWeight: "700" },
  footerRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 4 },
  footerText: { color: colors.textMuted },
  footerLink: { color: colors.purple, fontWeight: "700" }
});
