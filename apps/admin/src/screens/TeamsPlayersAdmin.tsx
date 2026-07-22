import React, { useEffect, useState } from "react";
import {
  createPlayer,
  createTeam,
  listCompetitions,
  listCompetitionTeams,
  listPlayers,
  updatePlayer
} from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Competition, Player, Team } from "../api/types";
import { ErrorNote, Spinner, StatusPill } from "../components/shared";

const POSITIONS = [
  { value: "golman", label: "Golman" },
  { value: "odbrana", label: "Odbrana" },
  { value: "napad", label: "Napad" }
];

export function TeamsPlayersAdmin({ onBack }: { onBack: () => void }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionsError, setCompetitionsError] = useState("");
  const [competitionId, setCompetitionId] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const [players, setPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState("");

  const [showTeamForm, setShowTeamForm] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState("");

  useEffect(() => {
    listCompetitions()
      .then((rows) => {
        setCompetitions(rows);
        if (rows.length > 0) setCompetitionId(rows[0].id);
      })
      .catch((err) => setCompetitionsError(err instanceof Error ? err.message : "Ne mogu da ucitam takmicenja."));
  }, []);

  useEffect(() => {
    if (!competitionId) {
      setTeams([]);
      return;
    }
    setTeamsLoading(true);
    setTeamsError("");
    listCompetitionTeams(competitionId)
      .then((rows) => {
        setTeams(rows);
        setSelectedTeamId(rows[0]?.id ?? "");
      })
      .catch((err) => setTeamsError(err instanceof Error ? err.message : "Ne mogu da ucitam ekipe."))
      .finally(() => setTeamsLoading(false));
  }, [competitionId]);

  useEffect(() => {
    if (!selectedTeamId) {
      setPlayers([]);
      return;
    }
    setPlayersLoading(true);
    setPlayersError("");
    listPlayers({ teamId: selectedTeamId })
      .then(setPlayers)
      .catch((err) => setPlayersError(err instanceof Error ? err.message : "Ne mogu da ucitam igrace."))
      .finally(() => setPlayersLoading(false));
  }, [selectedTeamId]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;

  async function refreshTeams() {
    const rows = await listCompetitionTeams(competitionId);
    setTeams(rows);
  }

  async function refreshPlayers() {
    if (!selectedTeamId) return;
    const rows = await listPlayers({ teamId: selectedTeamId });
    setPlayers(rows);
  }

  return (
    <section className="teams-admin">
      <div className="admin-subnav">
        <button onClick={onBack}>Nazad na admin portal</button>
      </div>

      <div className="teams-admin-head">
        <div>
          <p className="eyebrow">Ekipe i igraci</p>
          <h2>Roster, cene i verifikacija igraca</h2>
          <p>Ovo je baza za fantasy, live utakmice i profile verifikovanih igraca.</p>
        </div>
        <div className="teams-actions">
          <label className="field inline-select">
            <span>Takmicenje</span>
            <select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {competition.cityName ? `${competition.cityName} - ` : ""}
                  {competition.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setShowTeamForm((value) => !value)} disabled={!competitionId}>
            Dodaj ekipu
          </button>
          <button className="primary" onClick={() => setShowPlayerForm((value) => !value)} disabled={!selectedTeamId}>
            Dodaj igraca
          </button>
        </div>
      </div>

      {competitionsError ? <ErrorNote message={competitionsError} /> : null}

      {showTeamForm ? (
        <NewTeamForm
          competitionId={competitionId}
          onCancel={() => setShowTeamForm(false)}
          onCreated={async () => {
            setShowTeamForm(false);
            await refreshTeams();
          }}
        />
      ) : null}

      {showPlayerForm && selectedTeam ? (
        <NewPlayerForm
          teamId={selectedTeam.id}
          onCancel={() => setShowPlayerForm(false)}
          onCreated={async () => {
            setShowPlayerForm(false);
            await refreshPlayers();
            await refreshTeams();
          }}
        />
      ) : null}

      <div className="teams-admin-grid">
        <aside className="team-list-panel">
          <div className="panel-head">
            <h2>Aktivne ekipe</h2>
            <span>{teams.length} ekipe</span>
          </div>
          {teamsLoading ? <Spinner /> : null}
          {teamsError ? <ErrorNote message={teamsError} /> : null}
          {!teamsLoading && !teamsError && teams.length === 0 ? (
            <p className="empty-state">Ovo takmicenje jos nema ekipe. Dodaj prvu ekipu.</p>
          ) : null}
          {teams.map((team) => (
            <button
              className={`team-row-button ${selectedTeamId === team.id ? "active" : ""}`}
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
            >
              <span>{team.groupName || "bez grupe"}</span>
              <strong>{team.name}</strong>
              <small>
                {team.playersCount} igraca
                {team.standing ? ` - ${team.standing.points} bod.` : ""}
              </small>
            </button>
          ))}
        </aside>

        <section className="players-panel">
          {selectedTeam ? (
            <>
              <div className="players-panel-head">
                <div>
                  <span>{selectedTeam.groupName || "Bez grupe"}</span>
                  <h2>{selectedTeam.name}</h2>
                </div>
                <div className="team-kpis">
                  <b>{players.length}</b>
                  <span>igraca u prikazu</span>
                </div>
              </div>

              {playersLoading ? <Spinner /> : null}
              {playersError ? <ErrorNote message={playersError} /> : null}

              {!playersLoading && !playersError ? (
                <div className="player-table">
                  <div className="player-table-head players-row-compact players-row-editable">
                    <span>Igrac</span>
                    <span>Pozicija</span>
                    <span>Broj dresa</span>
                    <span>Status</span>
                    <span></span>
                  </div>
                  {players.length === 0 ? <p className="empty-state">Ova ekipa jos nema igrace.</p> : null}
                  {players.map((player) =>
                    editingPlayerId === player.id ? (
                      <EditPlayerForm
                        key={player.id}
                        player={player}
                        onCancel={() => setEditingPlayerId("")}
                        onSaved={async () => {
                          setEditingPlayerId("");
                          await refreshPlayers();
                        }}
                      />
                    ) : (
                      <div className="player-table-row players-row-compact players-row-editable" key={player.id}>
                        <strong>{player.displayName}</strong>
                        <span>{POSITIONS.find((p) => p.value === player.position)?.label || player.position || "-"}</span>
                        <b>{player.shirtNumber ?? "-"}</b>
                        <StatusPill tone={player.isActive ? "aktivan" : "sakriven"}>
                          {player.isActive ? "aktivan" : "neaktivan"}
                        </StatusPill>
                        <button className="link-button" onClick={() => setEditingPlayerId(player.id)}>
                          Izmeni
                        </button>
                      </div>
                    )
                  )}
                </div>
              ) : null}

              <div className="teams-note">
                <strong>Kako ovo kasnije radi:</strong>
                admin unosi pocetnu cenu, igrac se povezuje sa korisnickim nalogom, a sistem posle svakog kola menja cenu samo na osnovu ucinka.
              </div>
            </>
          ) : (
            <p className="empty-state">Izaberi ekipu da vidis igrace.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function NewTeamForm({
  competitionId,
  onCancel,
  onCreated
}: {
  competitionId: string;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createTeam({ competitionId, name, shortName: shortName || undefined, groupName: groupName || undefined });
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ekipa nije dodata.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Naziv ekipe</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Skraceni naziv</span>
          <input value={shortName} onChange={(e) => setShortName(e.target.value)} />
        </label>
        <label className="field">
          <span>Grupa</span>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
        </label>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Cuvanje..." : "Sacuvaj ekipu"}
        </button>
      </div>
    </form>
  );
}

function NewPlayerForm({
  teamId,
  onCancel,
  onCreated
}: {
  teamId: string;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createPlayer({
        teamId,
        displayName,
        position: position || undefined,
        shirtNumber: shirtNumber ? Number(shirtNumber) : undefined
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Igrac nije dodat.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Ime i prezime</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Pozicija</span>
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">Izaberi poziciju</option>
            {POSITIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Broj dresa</span>
          <input type="number" value={shirtNumber} onChange={(e) => setShirtNumber(e.target.value)} />
        </label>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Cuvanje..." : "Sacuvaj igraca"}
        </button>
      </div>
    </form>
  );
}

function EditPlayerForm({
  player,
  onCancel,
  onSaved
}: {
  player: Player;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(player.displayName);
  const [position, setPosition] = useState(player.position || "");
  const [shirtNumber, setShirtNumber] = useState(player.shirtNumber != null ? String(player.shirtNumber) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await updatePlayer(player.id, {
        displayName,
        position: position || undefined,
        shirtNumber: shirtNumber ? Number(shirtNumber) : undefined
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Igrac nije sacuvan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form player-edit-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span>Ime i prezime</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Pozicija</span>
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">Izaberi poziciju</option>
            {POSITIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Broj dresa</span>
          <input type="number" value={shirtNumber} onChange={(e) => setShirtNumber(e.target.value)} />
        </label>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Otkazi</button>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Cuvanje..." : "Sacuvaj izmene"}
        </button>
      </div>
    </form>
  );
}
