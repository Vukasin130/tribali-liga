// Single, intentional export surface for apps/desktop to depend on. Desktop imports
// everything it needs through this one file rather than reaching into apps/mobile's
// internal folder layout in many places - that internal layout is free to keep changing
// without breaking apps/desktop, as long as this contract stays honored.
export { colors, cardStyle, gradients } from "./src/theme/colors";
export { Card, SectionTitle, PrimaryButton, Pill, LoadingState, ErrorState, EmptyState } from "./src/components/ui";
export { TeamCrest } from "./src/components/TeamCrest";
export { useAuth, AuthProvider } from "./src/state/AuthContext";
export { CompetitionProvider } from "./src/state/CompetitionContext";
export { useSeasonsScreenState, fixtureMeta, fixtureTime, formatShortDate } from "./src/screens/useSeasonsScreenState";
export { NewsScreen } from "./src/screens/NewsScreen";
export { FantasyScreen } from "./src/screens/FantasyScreen";
export { ExploreScreen } from "./src/screens/ExploreScreen";
export { ProfileScreen } from "./src/screens/ProfileScreen";
export type { MainTabParamList } from "./src/navigation/types";
export { queryClient } from "./src/api/queryClient";
export type * from "./src/api/types";
