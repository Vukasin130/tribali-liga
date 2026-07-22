import React, { createContext, useContext, useEffect, useState } from "react";
import { listCompetitions } from "../api/endpoints";
import type { Competition } from "../api/types";

interface CompetitionContextValue {
  competitions: Competition[];
  competitionId: string;
  setCompetitionId: (id: string) => void;
  loading: boolean;
  error: string;
  reload: () => void;
}

const CompetitionContext = createContext<CompetitionContextValue | null>(null);

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    listCompetitions()
      .then((rows) => {
        setCompetitions(rows);
        // Default to the competition with the most real data rather than just the
        // first row - a freshly-created empty draft league would otherwise silently
        // "win" and make every screen that depends on this context look empty.
        const richest = [...rows].sort((a, b) => (b.teamsCount || 0) - (a.teamsCount || 0))[0];
        setCompetitionId((current) => current || richest?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam takmicenja."))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  return (
    <CompetitionContext.Provider
      value={{
        competitions,
        competitionId,
        setCompetitionId,
        loading,
        error,
        reload: () => setReloadKey((key) => key + 1)
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetition() {
  const context = useContext(CompetitionContext);
  if (!context) throw new Error("useCompetition mora biti unutar CompetitionProvider");
  return context;
}
