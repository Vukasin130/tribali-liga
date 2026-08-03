import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, type MainTabParamList } from "@tribali-liga/mobile/shared";

const navItems: { key: keyof MainTabParamList; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "Seasons", label: "Sezone", icon: "trophy-outline" },
  { key: "Fantasy", label: "Fantasy", icon: "shirt-outline" },
  { key: "News", label: "Vesti", icon: "newspaper-outline" },
  { key: "Explore", label: "Explore", icon: "search-outline" },
  { key: "Profile", label: "Profil", icon: "person-outline" }
];

export function DesktopSidebar({
  active,
  onSelect,
  onLogout,
  userName
}: {
  active: keyof MainTabParamList;
  onSelect: (key: keyof MainTabParamList) => void;
  onLogout: () => void;
  userName?: string;
}) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>Tribali Liga</Text>
        <Text style={styles.brandSubtitle}>Desktop</Text>
      </View>

      <View style={styles.nav}>
        {navItems.map((item) => (
          <NavRow key={item.key} item={item} isActive={active === item.key} onPress={() => onSelect(item.key)} />
        ))}
      </View>

      <View style={styles.footer}>
        {userName ? <Text style={styles.userName} numberOfLines={1}>{userName}</Text> : null}
        <Pressable style={styles.logoutRow} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Odjava</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NavRow({
  item,
  isActive,
  onPress
}: {
  item: { key: keyof MainTabParamList; label: string; icon: keyof typeof Ionicons.glyphMap };
  isActive: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={[styles.navRow, isActive ? styles.navRowActive : hovered ? styles.navRowHovered : null]}
    >
      <Ionicons name={item.icon} size={19} color={isActive ? colors.textOnDark : colors.ink} />
      <Text style={[styles.navLabel, isActive ? styles.navLabelActive : null]}>{item.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    height: "100%",
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderRightColor: colors.line,
    paddingVertical: 20,
    paddingHorizontal: 14,
    justifyContent: "space-between"
  },
  brand: { paddingHorizontal: 8, marginBottom: 24 },
  brandTitle: { color: colors.ink, fontWeight: "800", fontSize: 18 },
  brandSubtitle: { color: colors.textMuted, fontWeight: "700", fontSize: 11, textTransform: "uppercase", marginTop: 2 },
  nav: { gap: 4, flex: 1 },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12
  },
  navRowHovered: { backgroundColor: colors.surfaceMuted },
  navRowActive: { backgroundColor: colors.ink },
  navLabel: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  navLabelActive: { color: colors.textOnDark },
  footer: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  userName: { color: colors.textMuted, fontWeight: "600", fontSize: 12, paddingHorizontal: 8 },
  logoutRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 8 },
  logoutText: { color: colors.danger, fontWeight: "700", fontSize: 13 }
});
