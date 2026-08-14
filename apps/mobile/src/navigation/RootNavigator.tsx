import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../state/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { ForgotPasswordScreen } from "../screens/ForgotPasswordScreen";
import { NewsScreen } from "../screens/NewsScreen";
import { FantasyScreen } from "../screens/FantasyScreen";
import { SeasonsScreen } from "../screens/SeasonsScreen";
import { ExploreScreen } from "../screens/ExploreScreen";
import { StatisticsScreen } from "../screens/StatisticsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { CompetitionProvider } from "../state/CompetitionContext";
import { LoadingState } from "../components/ui";
import { colors } from "../theme/colors";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import type { AuthStackParamList, MainTabParamList } from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: "#ffffff",
    primary: colors.ink,
    border: colors.line,
    text: colors.ink
  }
};

const tabIconName: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  News: "newspaper-outline",
  Fantasy: "shirt-outline",
  Seasons: "trophy-outline",
  Explore: "search-outline",
  Statistics: "bar-chart-outline",
  Profile: "person-outline"
};

function TabIcon({ name, focused }: { name: keyof typeof Ionicons.glyphMap; focused: boolean }) {
  return (
    <View>
      <Ionicons name={name} size={24} color={focused ? colors.ink : "rgba(20,20,20,0.55)"} />
    </View>
  );
}

function MainTabNavigator() {
  const { user } = useAuth();
  const isWide = useIsWideScreen();
  // Statistics is deliberately not just hidden but absent as a route - it never exists
  // on mobile (isWide is hardcoded false there) or for non-admins, not just tucked away.
  const showStatistics = isWide && user?.role === "admin";

  return (
    <CompetitionProvider>
      <MainTabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: "rgba(255,255,255,0.98)",
            borderTopColor: colors.line,
            height: 82,
            paddingTop: 8
          },
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: "rgba(20,20,20,0.55)",
          tabBarLabelStyle: { fontWeight: "600", fontSize: 11 },
          tabBarIcon: ({ focused }) => <TabIcon name={tabIconName[route.name as keyof MainTabParamList]} focused={focused} />
        })}
      >
        <MainTabs.Screen name="News" component={NewsScreen} options={{ title: "News" }} />
        <MainTabs.Screen name="Fantasy" component={FantasyScreen} options={{ title: "Fantasy" }} />
        <MainTabs.Screen name="Seasons" component={SeasonsScreen} options={{ title: "Seasons" }} />
        <MainTabs.Screen name="Explore" component={ExploreScreen} options={{ title: "Explore" }} />
        {showStatistics ? (
          <MainTabs.Screen name="Statistics" component={StatisticsScreen} options={{ title: "Statistika" }} />
        ) : null}
        <MainTabs.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
      </MainTabs.Navigator>
    </CompetitionProvider>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const { status } = useAuth();

  return (
    <NavigationContainer theme={navigationTheme}>
      {status === "checking" ? (
        <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
          <LoadingState label="Proveravam prijavu..." />
        </View>
      ) : status === "signed-out" ? (
        <AuthNavigator />
      ) : (
        <MainTabNavigator />
      )}
    </NavigationContainer>
  );
}
