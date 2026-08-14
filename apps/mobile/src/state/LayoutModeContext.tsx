import React, { createContext, useContext } from "react";

const LayoutModeContext = createContext(false);

// Whether the app is rendering inside the wide desktop shell (apps/desktop) rather than
// the phone-only mobile app (native, or its own web build's phone-frame preview). This
// used to be guessed per-screen via useWindowDimensions() + a width threshold, which
// breaks the moment apps/mobile's web preview is opened in an actual wide browser
// window: WebShell (apps/mobile/App.tsx) visually constrains the content to a fixed
// phone-frame regardless of window size, but useWindowDimensions() still reports the
// real (wide) browser size - so every screen thought it was in the wide desktop layout
// even while squeezed into a narrow phone frame. The two shells know definitively which
// mode they are, so they provide it explicitly here instead of every screen re-guessing
// it from a measurement that doesn't reflect what's actually on screen.
export function LayoutModeProvider({ isWide, children }: { isWide: boolean; children: React.ReactNode }) {
  return <LayoutModeContext.Provider value={isWide}>{children}</LayoutModeContext.Provider>;
}

export function useIsWideScreen(): boolean {
  return useContext(LayoutModeContext);
}
