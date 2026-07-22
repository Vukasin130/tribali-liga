import React, { useEffect, useState } from "react";
import { listPlayers, listVerificationRequests, reviewVerificationRequest } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Player, VerificationRequest } from "../api/types";
import { ErrorNote, Spinner, StatusPill } from "../components/shared";

export function VerificationsAdmin({ onBack }: { onBack: () => void }) {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState("");
  const [playersByTeam, setPlayersByTeam] = useState<Record<string, Player[]>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [busyId, setBusyId] = useState("");

  function load() {
    setLoading(true);
    setError("");
    listVerificationRequests(showAll ? undefined : "pending")
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Ne mogu da ucitam zahteve."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [showAll]);

  async function openApprove(request: VerificationRequest) {
    setExpandedId(request.id);
    setSelectedPlayerId(request.playerId || "");
    if (request.teamId && !playersByTeam[request.teamId]) {
      const players = await listPlayers({ teamId: request.teamId });
      setPlayersByTeam((previous) => ({ ...previous, [request.teamId]: players }));
    }
  }

  async function approve(request: VerificationRequest) {
    if (!selectedPlayerId) return;
    setBusyId(request.id);
    try {
      await reviewVerificationRequest(request.id, { status: "approved", playerId: selectedPlayerId, teamId: request.teamId || undefined });
      setExpandedId("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zahtev nije odobren.");
    } finally {
      setBusyId("");
    }
  }

  async function reject(request: VerificationRequest) {
    setBusyId(request.id);
    try {
      await reviewVerificationRequest(request.id, { status: "rejected" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zahtev nije odbijen.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="teams-admin">
      <div className="admin-subnav">
        <button onClick={onBack}>Nazad na admin portal</button>
      </div>

      <div className="teams-admin-head">
        <div>
          <p className="eyebrow">Verifikacija igraca</p>
          <h2>Zahtevi korisnika da budu povezani sa pravim igracem</h2>
          <p>Odobravanje daje korisniku oznaku verifikovanog igraca i povezuje profil sa pravim statistikama.</p>
        </div>
        <div className="teams-actions">
          <button onClick={() => setShowAll((v) => !v)}>{showAll ? "Prikazi samo na cekanju" : "Prikazi sve"}</button>
        </div>
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {loading ? <Spinner /> : null}
      {!loading && requests.length === 0 ? <p className="empty-state">Nema zahteva.</p> : null}

      {requests.map((request) => (
        <div className="panel" key={request.id} style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <h2>{request.displayName || request.email}</h2>
            <StatusPill tone={request.status === "approved" ? "aktivan" : request.status === "rejected" ? "sakriven" : "provera"}>
              {request.status}
            </StatusPill>
          </div>
          <p>
            Trazi da bude: <strong>{request.playerName}</strong>
            {request.teamName ? ` - ${request.teamName}` : " - ekipa nije izabrana"}
          </p>

          {request.status === "pending" ? (
            expandedId === request.id ? (
              <div className="form-row">
                <label className="field">
                  <span>Pravi igrac iz baze</span>
                  <select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}>
                    <option value="">Izaberi igraca</option>
                    {(playersByTeam[request.teamId] ?? []).map((player) => (
                      <option key={player.id} value={player.id}>{player.displayName}</option>
                    ))}
                  </select>
                </label>
                <div className="form-actions">
                  <button type="button" onClick={() => setExpandedId("")}>Otkazi</button>
                  <button className="primary" disabled={!selectedPlayerId || busyId === request.id} onClick={() => approve(request)}>
                    Potvrdi odobrenje
                  </button>
                </div>
              </div>
            ) : (
              <div className="teams-actions">
                <button
                  className="primary"
                  disabled={!request.teamId || busyId === request.id}
                  onClick={() => openApprove(request)}
                >
                  Odobri
                </button>
                <button disabled={busyId === request.id} onClick={() => reject(request)}>Odbij</button>
              </div>
            )
          ) : null}
        </div>
      ))}
    </section>
  );
}
