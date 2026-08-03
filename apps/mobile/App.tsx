import "react-native-gesture-handler";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./src/api/queryClient";
import { AuthProvider } from "./src/state/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

// On web, the app is designed phone-only - always render it inside a fixed-width
// phone-shaped frame instead of stretching across the full browser window, regardless
// of how wide/tall that window actually is. The desktop admin experience lives in the
// separate apps/desktop project (imports this app's screens/logic, never the reverse).
function WebShell({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View style={webStyles.backdrop}>
      <View style={webStyles.notch} />
      <View style={webStyles.phoneFrame}>{children}</View>
    </View>
  );
}

function AppContent() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <WebShell>
            <StatusBar style="light" />
            <RootNavigator />
          </WebShell>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return <AppContent />;
}

const webStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0c0c0c"
  },
  phoneFrame: {
    width: 412,
    maxWidth: "100%",
    height: "100%",
    maxHeight: 915,
    overflow: "hidden",
    borderRadius: 44,
    borderWidth: 12,
    borderColor: "#111",
    backgroundColor: "#f7f4ee",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 24
  },
  notch: {
    position: "absolute",
    top: 22,
    width: 120,
    height: 26,
    borderRadius: 16,
    backgroundColor: "#111",
    zIndex: 10
  }
});
