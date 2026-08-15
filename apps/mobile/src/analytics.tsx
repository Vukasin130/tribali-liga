import React from "react";
import PostHog, { PostHogProvider } from "posthog-react-native";

// Real product analytics (screen views, retention, funnels) for both this app and
// apps/desktop's web build - one PostHog project covers both, which plain web
// analytics tools (Plausible, GA4-via-Firebase) can't do without separate setups.
// Keyed off env vars so a missing key degrades to a harmless no-op instead of
// crashing - local dev and any deploy that hasn't set these yet just won't send
// events, same as before this existed.
const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || "";
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

export const analyticsEnabled = Boolean(API_KEY);

let client: PostHog | null = null;
if (analyticsEnabled) {
  client = new PostHog(API_KEY, { host: HOST });
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  // Passing the already-constructed `client` (rather than apiKey+options, which would
  // make the provider construct its own second instance) so this provider and the
  // trackScreen/identify/reset helpers below - called from outside the React tree, in
  // RootNavigator and AuthContext - always operate on the exact same client.
  if (!analyticsEnabled || !client) return <>{children}</>;
  return (
    <PostHogProvider client={client} autocapture>
      {children}
    </PostHogProvider>
  );
}

// JSON-safe subset only - matches what every call site here actually passes (ids,
// emails, role strings) without pulling in PostHog's own internal property type.
type AnalyticsProps = Record<string, string | number | boolean | null>;

// react-navigation v7 dropped PostHog's automatic screen-capture support, so this is
// called manually from RootNavigator's NavigationContainer onStateChange - covers the
// 6 main tabs and the auth screens. Deeper views (player/team/match profiles etc.) are
// full-screen Modals living outside React Navigation's own state, so they aren't
// captured by this alone - a real gap, noted rather than silently missed.
export function trackScreen(routeName: string, params?: AnalyticsProps) {
  if (!client) return;
  client.screen(routeName, params);
}

export function identifyAnalyticsUser(userId: string, traits?: AnalyticsProps) {
  if (!client) return;
  client.identify(userId, traits);
}

export function resetAnalyticsUser() {
  if (!client) return;
  client.reset();
}

export function trackEvent(name: string, properties?: AnalyticsProps) {
  if (!client) return;
  client.capture(name, properties);
}
