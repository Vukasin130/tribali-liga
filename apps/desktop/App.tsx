import React from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, AuthProvider, useAuth, LoadingState, colors } from "@tribali-liga/mobile/shared";
import { DesktopAdminShell } from "./src/navigation/DesktopAdminShell";
import { DesktopLogin } from "./src/screens/DesktopLogin";

// No phone-frame, no width detection - this whole project's only purpose is the
// desktop admin experience, so it always renders full-screen.
function AppShell() {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
        <LoadingState label="Proveravam prijavu..." />
      </View>
    );
  }

  if (status === "signed-out") {
    return <DesktopLogin />;
  }

  return <DesktopAdminShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
