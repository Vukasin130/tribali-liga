import React from "react";

export function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const cleanTone = tone.replace(/\s+/g, "-");
  return <span className={`status-pill ${cleanTone}`}>{children}</span>;
}

export function InitialsAvatar({ name, tone }: { name: string; tone: "home" | "away" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
  return <span className={`avatar ${tone}`}>{initials}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return <div className="inline-loading">{label ?? "Ucitavanje..."}</div>;
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="form-error">{message}</div>;
}
