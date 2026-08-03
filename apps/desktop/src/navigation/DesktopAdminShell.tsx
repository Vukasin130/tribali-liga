import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  useAuth,
  CompetitionProvider,
  colors,
  NewsScreen,
  FantasyScreen,
  ExploreScreen,
  ProfileScreen,
  type MainTabParamList
} from "@tribali-liga/mobile/shared";
import { DesktopSidebar } from "../components/DesktopSidebar";
import { SeasonsScreenDesktop } from "../screens/SeasonsScreenDesktop";

const screens: Record<keyof MainTabParamList, React.ComponentType> = {
  News: NewsScreen,
  Fantasy: FantasyScreen,
  Seasons: SeasonsScreenDesktop,
  Explore: ExploreScreen,
  Profile: ProfileScreen
};

export function DesktopAdminShell() {
  const { user, logout } = useAuth();
  // Seasons, not News - that's the primary admin workflow (run a league).
  const [activeTab, setActiveTab] = useState<keyof MainTabParamList>("Seasons");

  const ActiveScreen = screens[activeTab];

  return (
    <CompetitionProvider>
      <View style={styles.root}>
        <DesktopSidebar active={activeTab} onSelect={setActiveTab} onLogout={logout} userName={user?.displayName} />
        <View style={styles.content}>
          <ActiveScreen />
        </View>
      </View>
    </CompetitionProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", height: "100%", backgroundColor: colors.background },
  content: { flex: 1, height: "100%", overflow: "hidden" }
});
