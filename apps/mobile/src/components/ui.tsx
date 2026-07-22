import React from "react";
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { cardStyle, colors } from "../theme/colors";

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ eyebrow, title, light }: { eyebrow?: string; title: string; light?: boolean }) {
  return (
    <View style={styles.sectionTitle}>
      {eyebrow ? <Text style={[styles.eyebrow, light ? styles.eyebrowLight : null]}>{eyebrow}</Text> : null}
      <Text style={[styles.titleText, light ? styles.titleTextLight : null]}>{title}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary"
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        variant === "primary" ? styles.buttonPrimary : null,
        variant === "ghost" ? styles.buttonGhost : null,
        variant === "danger" ? styles.buttonDanger : null,
        (disabled || loading) ? styles.buttonDisabled : null
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "ghost" ? colors.ink : "#fff"} />
      ) : (
        <Text style={[styles.buttonLabel, variant === "ghost" ? styles.buttonLabelGhost : null]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "live" }) {
  return (
    <View style={[styles.pill, pillTone[tone]]}>
      <Text style={[styles.pillText, pillTextTone[tone]]}>{label}</Text>
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator color={colors.purple} />
      {label ? <Text style={styles.centerStateText}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry}>
          <Text style={styles.retryText}>Pokusaj ponovo</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.centerState}>
      <Text style={styles.centerStateText}>{message}</Text>
    </View>
  );
}

const pillTone: Record<string, ViewStyle> = {
  neutral: { backgroundColor: colors.surfaceMuted },
  success: { backgroundColor: "rgba(8,122,74,0.12)" },
  warning: { backgroundColor: "rgba(149,99,0,0.14)" },
  danger: { backgroundColor: "rgba(160,24,61,0.12)" },
  live: { backgroundColor: colors.live }
};

const pillTextTone: Record<string, { color: string }> = {
  neutral: { color: colors.textMuted },
  success: { color: colors.success },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
  live: { color: "#fff" }
};

const styles = StyleSheet.create({
  card: {
    ...cardStyle,
    padding: 18
  },
  sectionTitle: {
    marginBottom: 10
  },
  eyebrow: {
    color: colors.purple,
    fontWeight: "700",
    marginBottom: 4,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  eyebrowLight: {
    color: colors.aqua
  },
  titleText: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700"
  },
  titleTextLight: {
    color: "#fff"
  },
  button: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonPrimary: {
    backgroundColor: colors.ink
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.line
  },
  buttonDanger: {
    backgroundColor: colors.danger
  },
  buttonDisabled: {
    opacity: 0.45
  },
  buttonLabel: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15
  },
  buttonLabelGhost: {
    color: colors.ink
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  centerState: {
    paddingVertical: 28,
    alignItems: "center",
    gap: 8
  },
  centerStateText: {
    color: colors.textMuted,
    fontWeight: "600",
    textAlign: "center"
  },
  errorBox: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(160,24,61,0.08)",
    gap: 6
  },
  errorText: {
    color: colors.danger,
    fontWeight: "700"
  },
  retryText: {
    color: colors.danger,
    fontWeight: "700",
    textDecorationLine: "underline"
  }
});
