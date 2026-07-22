import React, { useEffect, useState } from "react";
import {
  createFantasyGameweek,
  createFantasySeason,
  getFantasySeason,
  listCompetitions,
  listFantasySeasons,
  scoreFantasySeasonGameweek,
  syncFantasySeasonPool,
  updateFantasyGameweek,
  updateFantasySeason
} from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Competition, FantasyGameweek, FantasySeason } from "../api/types";
import { ErrorNote, Spinner, StatusPill } from "../components/shared";

const GAMEWEEK_STATUSES = ["draft", "open", "locked", "scoring", "finished"];
const SEASON_STATUSES = ["draft", "active", "finished"];

export function FantasySeasonsAdmin({ onBack }: { onBack: () => void }) {
  const [seasons, setSeasons] = useState<FantasySeason[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  function loadSeasons() {
    setLoading(true);
    setError("");
    Promise.all([listFantasySeasons(), listCompetitions()])
      .then(([seasonRows, competitionRows]) => {
        setSeasons(seasonRows);
        setCompetitions(competitionRows);
        setSelectedId((current) => current || seasonRows[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam fantasy sezone."))
      .finally(() => setLoading(false));
  }

  useEffect(loadSeasons, []);

  return (
    <section className="teams-admin">
      <div className="admin-subnav">
        <button onClick={onBack}>Nazad na admin portal</button>
      </div>

      <div className="teams-admin-head">
        <div>
          <p className="eyebrow">Fantasy pravila</p>
          <h2>Fantasy sezone</h2>
          <p>Jedna fantasy sezona moze da obuhvati vise liga/gradova odjednom - korisnici prave jedan tim iz zajednickog bazena igraca svih izabranih liga.</p>
        </div>
        <div className="teams-actions">
          <button onClick={() => setShowForm((v) => !v)}>Nova fantasy sezona</button>
        </div>
      </div>

      {error ? <ErrorNote message={error} /> : null}

      {showForm ? (
        <NewSeasonForm
          competitions={competitions}
          onCancel={() => setShowForm(false)}
          onCreated={(season) => {
            setShowForm(false);
            setSeasons((previous) => [season, ...previous]);
            setSelectedId(season.id);
          }}
        />
      ) : null}

      {loading ? <Spinner /> : null}

      {!loading && seasons.length === 0 ? <p className="empty-state">Jos nema fantasy sezona.</p> : null}

      {!loading && seasons.length > 0 ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Sve sezone</h2>
          </div>
          {seasons.map((season) => (
            <button
              key={season.id}
              className={`import-table-row ${selectedId === season.id ? "active" : ""}`}
              style={{ gridTemplateColumns: "1.4fr .8fr .8fr", width: "100%", textAlign: "left", cursor: "pointer" }}
              onClick={() => setSelectedId(season.id)}
            >
              <strong>{season.name}</strong>
              <span>{season.competitionsCount ?? 0} liga(e)</span>
              <StatusPill tone={seasonTone(season.status)}>{season.status}</StatusPill>
            </button>
          ))}
        </div>
      ) : null}

      {selectedId ? <SeasonDetail seasonId={selectedId} competitions={competitions} onChanged={loadSeasons} /> : null}
    </section>
  );
}

function NewSeasonForm({
  competitions,
  onCancel,
  onCreated
}: {
  competitions: Competition[];
  onCancel: () => void;
  onCreated: (season: FantasySeason) => void;
}) {
  const [name, setName] = useState("");
  const [gameweekLengthDays, setGameweekLengthDays] = useState(7);
  const [competitionIds, setCompetitionIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleCompetition(id: string) {
    setCompetitionIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!competitionIds.length) {
      setError("Izaberi bar jednu ligu.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const season = await createFantasySeason({ name, gameweekLengthDays, competitionIds, status: "draft" });
      onCreated(season);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fantasy sezona nije sacuvana.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Naziv sezone</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Prolece 2026" />
        </label>
        <label className="field">
          <span>Duzina kola (dana)</span>
          <input
            type="number"
            min={1}
            value={gameweekLengthDays}
            onChange={(e) => setGameweekLengthDays(Number(e.target.value) || 7)}
          />
        </label>
      </div>
      <div className="field">
        <span>Lige koje ucestvuju u sezoni</span>
        <div className="teams-actions" style={{ flexWrap: "wrap" }}>
          {competitions.map((competition) => (
            <label key={competition.id} className="checkbox-pill">
              <input
                type="checkbox"
                checked={competitionIds.includes(competition.id)}
                onChange={() => toggleCompetition(competition.id)}
              />
              {competition.cityName ? `${competition.cityName} - ` : ""}
              {competition.name}
            </label>
          ))}
        </div>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>{submitting ? "Cuvanje..." : "Sacuvaj sezonu"}</button>
      </div>
    </form>
  );
}

function SeasonDetail({
  seasonId,
  competitions,
  onChanged
}: {
  seasonId: string;
  competitions: Competition[];
  onChanged: () => void;
}) {
  const [season, setSeason] = useState<Required<FantasySeason> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [showGwForm, setShowGwForm] = useState(false);
  const [busyGwId, setBusyGwId] = useState("");
  const [editingGwId, setEditingGwId] = useState("");
  const [editingCompetitions, setEditingCompetitions] = useState(false);
  const [pendingCompetitionIds, setPendingCompetitionIds] = useState<string[]>([]);
  const [savingCompetitions, setSavingCompetitions] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    getFantasySeason(seasonId)
      .then((data) => {
        setSeason(data);
        setPendingCompetitionIds(data.competitions.map((c) => c.id));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam sezonu."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [seasonId]);

  async function handleSyncPool() {
    setSyncing(true);
    setSyncResult("");
    setError("");
    try {
      const result = await syncFantasySeasonPool(seasonId);
      setSyncResult(`Sinhronizovano: ${result.available} igraca dostupno, ${result.unavailable} uklonjeno.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sinhronizacija fantasy baze nije uspela.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleStatusChange(status: string) {
    if (!season) return;
    try {
      await updateFantasySeason(season.id, { status });
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Status sezone nije promenjen.");
    }
  }

  async function handleSaveCompetitions() {
    if (!pendingCompetitionIds.length) {
      setError("Sezona mora imati bar jednu ligu.");
      return;
    }
    setSavingCompetitions(true);
    setError("");
    try {
      await updateFantasySeason(seasonId, { competitionIds: pendingCompetitionIds });
      setEditingCompetitions(false);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lige nisu sacuvane.");
    } finally {
      setSavingCompetitions(false);
    }
  }

  async function handleGwStatusChange(gameweekId: string, status: string) {
    setBusyGwId(gameweekId);
    try {
      await updateFantasyGameweek(gameweekId, { status });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Status kola nije promenjen.");
    } finally {
      setBusyGwId("");
    }
  }

  async function handleScore(gameweekId: string) {
    setBusyGwId(gameweekId);
    try {
      const result = await scoreFantasySeasonGameweek(gameweekId);
      setSyncResult(`Bodovano: ${result.updatedPicks} timova, ${result.pricedPlayers} igraca promenilo cenu.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bodovanje kola nije uspelo.");
    } finally {
      setBusyGwId("");
    }
  }

  if (loading) return <Spinner />;
  if (!season) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{season.name}</h2>
        <div className="teams-actions">
          <select value={season.status} onChange={(e) => handleStatusChange(e.target.value)}>
            {SEASON_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button onClick={handleSyncPool} disabled={syncing}>
            {syncing ? "Sinhronizujem..." : "Sinhronizuj fantasy bazu"}
          </button>
        </div>
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {syncResult ? <p className="empty-state">{syncResult}</p> : null}

      <div className="field">
        <span>Lige u ovoj sezoni</span>
        {!editingCompetitions ? (
          <div className="teams-actions" style={{ flexWrap: "wrap" }}>
            {season.competitions.map((c) => (
              <span className="pill" key={c.id}>{c.cityName ? `${c.cityName} - ` : ""}{c.name}</span>
            ))}
            <button onClick={() => setEditingCompetitions(true)}>Izmeni lige</button>
          </div>
        ) : (
          <>
            <div className="teams-actions" style={{ flexWrap: "wrap" }}>
              {competitions.map((competition) => (
                <label key={competition.id} className="checkbox-pill">
                  <input
                    type="checkbox"
                    checked={pendingCompetitionIds.includes(competition.id)}
                    onChange={() =>
                      setPendingCompetitionIds((current) =>
                        current.includes(competition.id)
                          ? current.filter((id) => id !== competition.id)
                          : [...current, competition.id]
                      )
                    }
                  />
                  {competition.cityName ? `${competition.cityName} - ` : ""}
                  {competition.name}
                </label>
              ))}
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => { setEditingCompetitions(false); setPendingCompetitionIds(season.competitions.map((c) => c.id)); }}>
                Otkazi
              </button>
              <button className="primary" onClick={handleSaveCompetitions} disabled={savingCompetitions}>
                {savingCompetitions ? "Cuvanje..." : "Sacuvaj lige"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel-head">
        <h2>Fantasy kola</h2>
        <button className="primary" onClick={() => setShowGwForm((v) => !v)}>Novo kolo</button>
      </div>

      {showGwForm ? (
        <NewGameweekForm
          seasonId={seasonId}
          gameweekLengthDays={season.gameweekLengthDays}
          onCancel={() => setShowGwForm(false)}
          onCreated={() => {
            setShowGwForm(false);
            load();
          }}
        />
      ) : null}

      {season.gameweeks.length === 0 ? <p className="empty-state">Ova sezona jos nema fantasy kola.</p> : null}

      {season.gameweeks.map((gameweek) => (
        <React.Fragment key={gameweek.id}>
          <div className="import-table-row" style={{ gridTemplateColumns: "1.2fr 1fr .8fr 1.4fr" }}>
            <strong>{gameweek.name}</strong>
            <span>Zakljucava se {formatDate(gameweek.locksAt)}</span>
            <StatusPill tone={gameweekTone(gameweek.status)}>{gameweek.status}</StatusPill>
            <div className="teams-actions">
              <select
                value={gameweek.status}
                disabled={busyGwId === gameweek.id}
                onChange={(e) => handleGwStatusChange(gameweek.id, e.target.value)}
              >
                {GAMEWEEK_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <button disabled={busyGwId === gameweek.id} onClick={() => handleScore(gameweek.id)}>
                Boduj kolo
              </button>
              <button onClick={() => setEditingGwId((current) => (current === gameweek.id ? "" : gameweek.id))}>
                {editingGwId === gameweek.id ? "Zatvori" : "Izmeni datume"}
              </button>
            </div>
          </div>
          {editingGwId === gameweek.id ? (
            <EditGameweekDatesForm
              gameweek={gameweek}
              onCancel={() => setEditingGwId("")}
              onSaved={() => {
                setEditingGwId("");
                load();
              }}
            />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function NewGameweekForm({
  seasonId,
  gameweekLengthDays,
  onCancel,
  onCreated
}: {
  seasonId: string;
  gameweekLengthDays: number;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [locksAt, setLocksAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState(() => new Date(Date.now() + gameweekLengthDays * 24 * 3600 * 1000).toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createFantasyGameweek({
        fantasySeasonId: seasonId,
        name,
        startsAt: new Date(startsAt).toISOString(),
        locksAt: new Date(locksAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
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
        <label className="field">
          <span>Kraj kola (za bodovanje)</span>
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
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

function toLocalInputValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 16);
  return date.toISOString().slice(0, 16);
}

function EditGameweekDatesForm({
  gameweek,
  onCancel,
  onSaved
}: {
  gameweek: FantasyGameweek;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(gameweek.startsAt));
  const [locksAt, setLocksAt] = useState(() => toLocalInputValue(gameweek.locksAt));
  const [endsAt, setEndsAt] = useState(() => toLocalInputValue(gameweek.endsAt || gameweek.locksAt));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await updateFantasyGameweek(gameweek.id, {
        startsAt: new Date(startsAt).toISOString(),
        locksAt: new Date(locksAt).toISOString(),
        endsAt: new Date(endsAt).toISOString()
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Datumi kola nisu sacuvani.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Pocetak</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </label>
        <label className="field">
          <span>Zakljucavanje tima</span>
          <input type="datetime-local" value={locksAt} onChange={(e) => setLocksAt(e.target.value)} required />
        </label>
        <label className="field">
          <span>Kraj kola (za bodovanje)</span>
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        </label>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>{submitting ? "Cuvanje..." : "Sacuvaj datume"}</button>
      </div>
    </form>
  );
}

function seasonTone(status: string): string {
  if (status === "active") return "aktivan";
  if (status === "finished") return "provera";
  return "sakriven";
}

function gameweekTone(status: string): string {
  if (status === "open" || status === "finished") return "aktivan";
  if (status === "locked" || status === "scoring") return "provera";
  return "sakriven";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
