// Re-exported from LayoutModeContext, which is what actually answers this now (an
// explicit flag set by whichever shell - apps/mobile's phone frame vs apps/desktop -
// is hosting the app, not a window-size guess). Kept at this path so every existing
// `import { useIsWideScreen } from "../hooks/useIsWideScreen"` keeps working unchanged.
export { useIsWideScreen } from "../state/LayoutModeContext";
