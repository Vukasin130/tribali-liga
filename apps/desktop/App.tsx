import "react-native-gesture-handler";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, AuthProvider, LayoutModeProvider, RootNavigator } from "@tribali-liga/mobile/shared";
import { DesktopShell } from "./src/components/DesktopShell";

// This project's only purpose is to run apps/mobile's own screens/navigation
// full-screen in a desktop browser - same components, same styling, same data,
// just without the phone-frame mockup apps/mobile itself uses on web. DesktopShell
// pins that content to its intended width and fills the freed-up side space with
// sponsor logos instead of stretching everything across the whole monitor.
// LayoutModeProvider tells every screen it's the wide desktop variant unconditionally -
// this app's whole purpose is the desktop experience, not a live width measurement.
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <LayoutModeProvider isWide>
            <DesktopShell>
              <RootNavigator />
            </DesktopShell>
          </LayoutModeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
