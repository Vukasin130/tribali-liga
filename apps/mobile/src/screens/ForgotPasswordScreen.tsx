import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { confirmPasswordReset, requestPasswordReset } from "../api/endpoints";
import { PrimaryButton } from "../components/ui";
import { colors } from "../theme/colors";
import type { AuthStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleRequestCode() {
    if (!email.trim()) {
      setError("Unesi email.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await requestPasswordReset(email.trim());
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zahtev nije uspeo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!code.trim() || newPassword.length < 6) {
      setError("Unesi kod iz emaila i novu lozinku (bar 6 karaktera).");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await confirmPasswordReset(email.trim(), code.trim(), newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kod nije tacan ili je istekao.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Zaboravljena lozinka</Text>

          {done ? (
            <>
              <Text style={styles.subtitle}>Lozinka je promenjena. Sad se mozes prijaviti sa novom lozinkom.</Text>
              <PrimaryButton label="Nazad na prijavu" onPress={() => navigation.navigate("Login")} />
            </>
          ) : step === "email" ? (
            <>
              <Text style={styles.subtitle}>Unesi email sa kojim si registrovan - poslacemo ti kod za resetovanje.</Text>
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
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton label={submitting ? "Slanje..." : "Posalji kod"} onPress={handleRequestCode} loading={submitting} />
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>Poslali smo kod na {email}. Unesi ga ispod zajedno sa novom lozinkom.</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Kod iz emaila</Text>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Nova lozinka</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="******"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton label={submitting ? "Cuvanje..." : "Postavi novu lozinku"} onPress={handleConfirm} loading={submitting} />
              <Text style={styles.link} onPress={() => setStep("email")}>Nisam dobio kod, posalji ponovo</Text>
            </>
          )}

          {!done ? (
            <Text style={styles.link} onPress={() => navigation.navigate("Login")}>Nazad na prijavu</Text>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 20, justifyContent: "center" },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
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
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 14 },
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
  link: { color: colors.purple, fontWeight: "700", textAlign: "center", marginTop: 6 }
});
