// Tribali Liga brand: black + gold crest, warm ivory app shell with gold gradient
// accents (replaces the earlier purple/pink/aqua "Urban Fantasy" palette).
export const colors = {
  background: "#f7f4ee",
  surface: "rgba(255,255,255,0.94)",
  surfaceMuted: "#f1ece0",
  card: "#ffffff",
  ink: "#141414",
  softInk: "rgba(20,20,20,0.64)",
  line: "rgba(20,20,20,0.13)",
  cardBorder: "rgba(20,20,20,0.08)",
  aqua: "#D9B24C",
  pink: "#8A6D1F",
  purple: "#C9A227",
  yellow: "#E3B23C",
  primary: "#C9A227",
  primaryDark: "#141414",
  accent: "#D9B24C",
  accentPink: "#8A6D1F",
  textOnDark: "#ffffff",
  textOnDarkMuted: "rgba(255,255,255,0.78)",
  textPrimary: "#141414",
  textMuted: "rgba(20,20,20,0.64)",
  border: "rgba(20,20,20,0.08)",
  danger: "#a0183d",
  success: "#087a4a",
  warning: "#956300",
  live: "#ff2a45"
};

export const gradients = {
  brand: ["#D9B24C", "#C9A227", "#8A6D1F"] as const,
  hero: ["#141414", "#5c451a", "#C9A227"] as const,
  pitch: ["#118b58", "#0b6b49"] as const
};

// Canonical card recipe used everywhere in the reference design.
export const cardStyle = {
  borderRadius: 20,
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  shadowColor: "#141414",
  shadowOpacity: 0.08,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
  elevation: 2
} as const;
