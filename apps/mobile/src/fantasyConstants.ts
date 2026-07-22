// Starting XI is position-locked: 1 GK + 2 DEF + 2 ATT. The 5-player bench has no position
// restriction - any player can fill any bench slot. B1 (the 6th player overall) scores at
// full weight; B2-B5 score at half weight. Matches EuroLeague Fantasy's "starting five + sixth
// man at 100%, rest of the bench at 50%" convention.
export const STARTER_SLOTS = [
  { slot: "GK", label: "Golman", position: "golman" as string | null },
  { slot: "DEF1", label: "Odbrana 1", position: "odbrana" as string | null },
  { slot: "DEF2", label: "Odbrana 2", position: "odbrana" as string | null },
  { slot: "ATT1", label: "Napad 1", position: "napad" as string | null },
  { slot: "ATT2", label: "Napad 2", position: "napad" as string | null }
] as const;

export const BENCH_SLOTS = [
  { slot: "B1", label: "Klupa 1", position: null as string | null, weightPercent: 100 },
  { slot: "B2", label: "Klupa 2", position: null as string | null, weightPercent: 50 },
  { slot: "B3", label: "Klupa 3", position: null as string | null, weightPercent: 50 },
  { slot: "B4", label: "Klupa 4", position: null as string | null, weightPercent: 50 },
  { slot: "B5", label: "Klupa 5", position: null as string | null, weightPercent: 50 }
] as const;

export const SLOT_LABELS: Record<string, string> = Object.fromEntries(
  [...STARTER_SLOTS.map((s) => [s.slot, s.label]), ...BENCH_SLOTS.map((s) => [s.slot, s.label])]
);

export const SLOT_POSITION: Record<string, string | null> = Object.fromEntries(
  [...STARTER_SLOTS.map((s) => [s.slot, s.position]), ...BENCH_SLOTS.map((s) => [s.slot, s.position])]
);

export const POSITION_GROUP_LABELS: Record<string, string> = { golman: "golmana", odbrana: "odbranu", napad: "napad" };

export function positionGroupOf(position: string): string {
  const normalized = (position || "").trim().toLowerCase();
  if (normalized === "golman" || normalized === "gk") return "golman";
  if (normalized === "odbrana" || normalized === "def") return "odbrana";
  if (normalized === "napad" || normalized === "att" || normalized === "fwd") return "napad";
  return normalized;
}
