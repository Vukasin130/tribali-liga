// Single, intentional export surface for apps/desktop to depend on. Desktop imports
// everything it needs through this one file rather than reaching into apps/mobile's
// internal folder layout in many places - that internal layout is free to keep changing
// without breaking apps/desktop, as long as this contract stays honored.
export { queryClient } from "./src/api/queryClient";
export { AuthProvider, useAuth } from "./src/state/AuthContext";
export { RootNavigator } from "./src/navigation/RootNavigator";
export { LayoutModeProvider } from "./src/state/LayoutModeContext";
export { AnalyticsProvider } from "./src/analytics";
export { fetchGeneralSponsors, listVerificationRequests, reviewVerificationRequest, searchPlayers } from "./src/api/endpoints";
export type { Player, Sponsor, VerificationRequest } from "./src/api/types";
export { colors } from "./src/theme/colors";
export { SponsorsManagerModal } from "./src/screens/SponsorsManagerModal";
export { Card, EmptyState, ErrorState, LoadingState, Pill, PrimaryButton } from "./src/components/ui";
