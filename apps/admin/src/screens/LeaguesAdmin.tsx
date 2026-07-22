import React, { useEffect, useMemo, useState } from "react";
import {
  cloneCompetitionTeams,
  configureCompetition,
  createCity,
  createCompetition,
  createGameweek,
  listCities,
  listCompetitions,
  listGameweeks,
  scoreGameweek,
  syncFantasyPool,
  updateGameweek
} from "../api/endpoints";
import { ApiError } from "../api/client";
import type { City, Competition, Gameweek } from "../api/types";
import { ErrorNote, Spinner, StatusPill } from "../components/shared";

const GAMEWEEK_STATUSES = ["draft", "open", "locked", "scoring", "finished"];

interface LeagueGroup {
  key: string;
  name: string;
  cityId: string;
  cityName: string;
  seasons: Competition[];
}

function groupIntoLeagues(competitions: Competition[]): LeagueGroup[] {
  const groups = new Map<string, LeagueGroup>();
  for (const competition of competitions) {
    const key = `${competition.cityId}::${competition.name.trim().toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, { key, name: competition.name, cityId: competition.cityId, cityName: competition.cityName, seasons: [] });
    }
    groups.get(key)!.seasons.push(competition);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function LeaguesAdmin({ onBack }: { onBack: () => void }) {
  const [cities, setCities] = useState<City[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAddCity, setShowAddCity] = useState(false);
  const [showNewLeague, setShowNewLeague] = useState(false);
  const [addingSeasonForKey, setAddingSeasonForKey] = useState("");

  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [gwLoading, setGwLoading] = useState(false);
  const [gwError, setGwError] = useState("");
  const [showGameweekForm, setShowGameweekForm] = useState(false);
  const [busyGameweekId, setBusyGameweekId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");

  function loadAll() {
    setLoading(true);
    setError("");
    Promise.all([listCities(), listCompetitions()])
      .then(([cityRows, competitionRows]) => {
        setCities(cityRows);
        setCompetitions(competitionRows);
        setCompetitionId((current) => current || competitionRows[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam takmicenja."))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, []);

  const leagueGroups = useMemo(() => groupIntoLeagues(competitions), [competitions]);
  const selectedCompetition = competitions.find((c) => c.id === competitionId) || null;

  function withCityName(competition: Competition): Competition {
    if (competition.cityName) return competition;
    const city = cities.find((c) => c.id === competition.cityId);
    return city ? { ...competition, cityName: city.name, citySlug: city.slug } : competition;
  }

  function loadGameweeks() {
    if (!competitionId) return;
    setGwLoading(true);
    setGwError("");
    listGameweeks(competitionId)
      .then(setGameweeks)
      .catch((err) => setGwError(err instanceof Error ? err.message : "Ne mogu da ucitam kola."))
      .finally(() => setGwLoading(false));
  }

  useEffect(loadGameweeks, [competitionId]);

  async function handleStatusChange(gameweek: Gameweek, status: string) {
    setBusyGameweekId(gameweek.id);
    try {
      await updateGameweek(gameweek.id, { status });
      loadGameweeks();
    } catch (err) {
      setGwError(err instanceof ApiError ? err.message : "Status kola nije promenjen.");
    } finally {
      setBusyGameweekId("");
    }
  }

  async function handleScore(gameweek: Gameweek) {
    setBusyGameweekId(gameweek.id);
    try {
      await scoreGameweek(gameweek.id);
      loadGameweeks();
    } catch (err) {
      setGwError(err instanceof ApiError ? err.message : "Bodovanje kola nije uspelo.");
    } finally {
      setBusyGameweekId("");
    }
  }

  async function handleSyncFantasyPool() {
    if (!competitionId) return;
    setSyncing(true);
    setSyncResult("");
    setError("");
    try {
      const result = await syncFantasyPool(competitionId);
      setSyncResult(`Sinhronizovano: ${result.available} igraca dostupno, ${result.unavailable} uklonjeno.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sinhronizacija fantasy baze nije uspela.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="teams-admin">
      <div className="admin-subnav">
        <button onClick={onBack}>Nazad na admin portal</button>
      </div>

      <div className="teams-admin-head">
        <div>
          <p className="eyebrow">Lige i sezone</p>
          <h2>Gradovi, lige i sezone</h2>
          <p>Svaka liga ostaje ista iz sezone u sezonu - samo joj dodajes nove sezone kad krenu, po zelji preneseš i ekipe.</p>
        </div>
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {loading ? <Spinner /> : null}

      {!loading ? (
        <>
          <div className="panel">
            <div className="panel-head">
              <h2>Gradovi</h2>
              <button className="primary" onClick={() => setShowAddCity((v) => !v)}>
                {showAddCity ? "Otkazi" : "Novi grad"}
              </button>
            </div>
            {showAddCity ? (
              <NewCityForm
                onCancel={() => setShowAddCity(false)}
                onCreated={(city) => {
                  setShowAddCity(false);
                  setCities((previous) => [...previous, city].sort((a, b) => a.name.localeCompare(b.name)));
                }}
              />
            ) : null}
            <div className="teams-actions" style={{ flexWrap: "wrap" }}>
              {cities.map((city) => (
                <span className="pill" key={city.id}>{city.name}</span>
              ))}
              {cities.length === 0 ? <p className="empty-state">Jos nema gradova.</p> : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Lige</h2>
              <button className="primary" onClick={() => setShowNewLeague((v) => !v)}>
                {showNewLeague ? "Otkazi" : "Nova liga"}
              </button>
            </div>

            {showNewLeague ? (
              <NewLeagueForm
                cities={cities}
                onCancel={() => setShowNewLeague(false)}
                onCreated={(competition) => {
                  setShowNewLeague(false);
                  setCompetitions((previous) => [...previous, withCityName(competition)]);
                  setCompetitionId(competition.id);
                }}
              />
            ) : null}

            {leagueGroups.length === 0 ? <p className="empty-state">Jos nema ni jedne lige.</p> : null}

            {leagueGroups.map((league) => (
              <div key={league.key} className="league-group">
                <div className="panel-head">
                  <div>
                    <strong>{league.name}</strong>
                    <span className="muted"> - {league.cityName}</span>
                  </div>
                  <button onClick={() => setAddingSeasonForKey((current) => (current === league.key ? "" : league.key))}>
                    {addingSeasonForKey === league.key ? "Otkazi" : "Dodaj sezonu"}
                  </button>
                </div>

                {addingSeasonForKey === league.key ? (
                  <NewSeasonForm
                    league={league}
                    onCancel={() => setAddingSeasonForKey("")}
                    onCreated={(competition) => {
                      setAddingSeasonForKey("");
                      setCompetitions((previous) => [...previous, withCityName(competition)]);
                      setCompetitionId(competition.id);
                    }}
                  />
                ) : null}

                {league.seasons.map((season) => (
                  <button
                    key={season.id}
                    className={`import-table-row ${competitionId === season.id ? "active" : ""}`}
                    style={{ gridTemplateColumns: "1fr .8fr .8fr .8fr", width: "100%", textAlign: "left", cursor: "pointer" }}
                    onClick={() => setCompetitionId(season.id)}
                  >
                    <span>{season.seasonName}</span>
                    <span>{season.teamsCount} ekipa</span>
                    <span>{season.matchesCount} utakmica</span>
                    <StatusPill tone={competitionTone(season.status)}>{season.status}</StatusPill>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {!loading && selectedCompetition ? (
        <div className="panel">
          <div className="panel-head">
            <h2>
              Kola - {selectedCompetition.name} ({selectedCompetition.seasonName})
            </h2>
            <div className="teams-actions">
              <button onClick={handleSyncFantasyPool} disabled={syncing}>
                {syncing ? "Sinhronizujem..." : "Sinhronizuj fantasy bazu"}
              </button>
              <button className="primary" onClick={() => setShowGameweekForm((v) => !v)}>Novo kolo</button>
            </div>
          </div>

          {syncResult ? <p className="empty-state">{syncResult}</p> : null}

          {showGameweekForm ? (
            <NewGameweekForm
              competitionId={competitionId}
              onCancel={() => setShowGameweekForm(false)}
              onCreated={() => {
                setShowGameweekForm(false);
                loadGameweeks();
              }}
            />
          ) : null}

          {gwLoading ? <Spinner /> : null}
          {gwError ? <ErrorNote message={gwError} /> : null}
          {!gwLoading && gameweeks.length === 0 ? <p className="empty-state">Ovo takmicenje jos nema kola.</p> : null}

          {gameweeks.map((gameweek) => (
            <div className="import-table-row" key={gameweek.id} style={{ gridTemplateColumns: "1.2fr 1fr .8fr 1.4fr" }}>
              <strong>{gameweek.name}</strong>
              <span>Zakljucava se {formatDate(gameweek.locksAt)}</span>
              <StatusPill tone={statusTone(gameweek.status)}>{gameweek.status}</StatusPill>
              <div className="teams-actions">
                <select
                  value={gameweek.status}
                  disabled={busyGameweekId === gameweek.id}
                  onChange={(e) => handleStatusChange(gameweek, e.target.value)}
                >
                  {GAMEWEEK_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <button disabled={busyGameweekId === gameweek.id} onClick={() => handleScore(gameweek)}>
                  Boduj kolo
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function statusTone(status: string): string {
  if (status === "open" || status === "finished") return "aktivan";
  if (status === "locked" || status === "scoring") return "provera";
  return "sakriven";
}

function competitionTone(status: string): string {
  if (status === "active") return "aktivan";
  if (status === "finished") return "provera";
  return "sakriven";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function NewCityForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (city: City) => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const city = await createCity({ name: name.trim() });
      onCreated(city);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Grad nije sacuvan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Naziv grada</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="npr. Backa Palanka" />
        </label>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>{submitting ? "Cuvanje..." : "Sacuvaj grad"}</button>
      </div>
    </form>
  );
}

function NewLeagueForm({
  cities,
  onCancel,
  onCreated
}: {
  cities: City[];
  onCancel: () => void;
  onCreated: (competition: Competition) => void;
}) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [name, setName] = useState("");
  const [firstSeasonName, setFirstSeasonName] = useState("Sezona 1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const competition = await createCompetition({
        cityId: cityId || undefined,
        name: name.trim(),
        seasonName: firstSeasonName.trim() || "Sezona 1",
        status: "active"
      });
      await configureCompetition(competition.id, { formatType: "league" });
      onCreated(competition);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Liga nije sacuvana.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Naziv lige</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="npr. Prva liga Novi Sad" />
        </label>
        <label className="field">
          <span>Grad</span>
          <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prva sezona</span>
          <input value={firstSeasonName} onChange={(e) => setFirstSeasonName(e.target.value)} required />
        </label>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>{submitting ? "Cuvanje..." : "Napravi ligu"}</button>
      </div>
    </form>
  );
}

function NewSeasonForm({
  league,
  onCancel,
  onCreated
}: {
  league: LeagueGroup;
  onCancel: () => void;
  onCreated: (competition: Competition) => void;
}) {
  const [seasonName, setSeasonName] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const competition = await createCompetition({
        cityId: league.cityId || undefined,
        name: league.name,
        seasonName: seasonName.trim(),
        status: "active"
      });
      await configureCompetition(competition.id, { formatType: "league" });
      if (copyFromId) {
        setCloning(true);
        const cloned = await cloneCompetitionTeams(competition.id, { sourceCompetitionId: copyFromId, includePlayers: true, syncFantasy: false });
        onCreated({ ...competition, teamsCount: cloned.teams.length });
      } else {
        onCreated(competition);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sezona nije sacuvana.");
    } finally {
      setSubmitting(false);
      setCloning(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Naziv sezone</span>
          <input value={seasonName} onChange={(e) => setSeasonName(e.target.value)} required autoFocus placeholder="npr. Sezona 2" />
        </label>
        <label className="field">
          <span>Prenesi ekipe iz (opciono)</span>
          <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}>
            <option value="">Ne prenosi, krenu prazno</option>
            {league.seasons.map((season) => (
              <option key={season.id} value={season.id}>{season.seasonName} ({season.teamsCount} ekipa)</option>
            ))}
          </select>
        </label>
      </div>
      {cloning ? <p className="empty-state">Prenosim ekipe i igrace, ovo moze potrajati pola minuta...</p> : null}
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>
          {cloning ? "Prenosim ekipe..." : submitting ? "Cuvanje..." : "Sacuvaj sezonu"}
        </button>
      </div>
    </form>
  );
}

function NewGameweekForm({
  competitionId,
  onCancel,
  onCreated
}: {
  competitionId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [locksAt, setLocksAt] = useState(() => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createGameweek({
        competitionId,
        name,
        startsAt: new Date(startsAt).toISOString(),
        locksAt: new Date(locksAt).toISOString(),
        status: "open"
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kolo nije sacuvano.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Naziv kola</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Kolo 1" />
        </label>
        <label className="field">
          <span>Pocetak</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </label>
        <label className="field">
          <span>Zakljucavanje tima</span>
          <input type="datetime-local" value={locksAt} onChange={(e) => setLocksAt(e.target.value)} required />
        </label>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>{submitting ? "Cuvanje..." : "Sacuvaj kolo"}</button>
      </div>
    </form>
  );
}
