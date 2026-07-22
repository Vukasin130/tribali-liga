import React, { useEffect, useMemo, useState } from "react";
import {
  addMatchEvent,
  createMatch,
  getMatchDetail,
  listCompetitionMatches,
  listCompetitionTeams,
  listCompetitions,
  listLiveMatches,
  listPlayers,
  setMatchLineup,
  setMatchStatus
} from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Competition, Match, MatchDetail, MatchLineupEntry, Player, Team } from "../api/types";
import { ErrorNote, InitialsAvatar, Spinner } from "../components/shared";

type Phase = "match-setup" | "roster" | "live" | "review";
type ActionType = "goal" | "shot_on_target" | "goalkeeper_save" | "yellow_card" | "red_card" | "foul" | "two_minutes";

const actionConfig: Record<ActionType, { label: string }> = {
  goal: { label: "Gol" },
  shot_on_target: { label: "Sut u okvir" },
  goalkeeper_save: { label: "Odbrana" },
  yellow_card: { label: "Zuti karton" },
  red_card: { label: "Crveni karton" },
  foul: { label: "Faul" },
  two_minutes: { label: "2 minuta" }
};

interface RosterPlayer extends Player {
  inRoster: boolean;
  isStarter: boolean;
  isGoalkeeper: boolean;
  isPlaying: boolean;
}

interface PendingGoal {
  scorerId: string;
}

export function LiveAdmin({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("match-setup");

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => new Date().toISOString().slice(0, 16));

  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [setupError, setSetupError] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  const [matchDetail, setMatchDetail] = useState<MatchDetail | null>(null);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const [matchMinute, setMatchMinute] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [substituteOutId, setSubstituteOutId] = useState<string | null>(null);
  const [pendingGoal, setPendingGoal] = useState<PendingGoal | null>(null);

  useEffect(() => {
    listCompetitions()
      .then((rows) => {
        setCompetitions(rows);
        if (rows.length > 0) setCompetitionId(rows[0].id);
      })
      .catch((err) => setSetupError(err instanceof Error ? err.message : "Ne mogu da ucitam takmicenja."));
    listLiveMatches()
      .then(setLiveMatches)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!competitionId) {
      setTeams([]);
      setScheduledMatches([]);
      return;
    }
    listCompetitionTeams(competitionId)
      .then((rows) => {
        setTeams(rows);
        setHomeTeamId(rows[0]?.id ?? "");
        setAwayTeamId(rows[1]?.id ?? "");
      })
      .catch((err) => setSetupError(err instanceof Error ? err.message : "Ne mogu da ucitam ekipe."));
    listCompetitionMatches(competitionId)
      .then((rows) => setScheduledMatches(rows.filter((match) => match.status === "scheduled")))
      .catch(() => setScheduledMatches([]));
  }, [competitionId]);

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const canStart = useMemo(
    () => [homeTeamId, awayTeamId].every((teamId) => isValidLineup(players, teamId)),
    [players, homeTeamId, awayTeamId]
  );

  async function loadRosterForMatch(match: MatchDetail) {
    const [homePlayers, awayPlayers] = await Promise.all([
      listPlayers({ teamId: match.homeTeamId }),
      listPlayers({ teamId: match.awayTeamId })
    ]);
    const lineupByPlayer = new Map<string, MatchLineupEntry>(match.lineups.map((entry) => [entry.playerId, entry]));

    const roster: RosterPlayer[] = [...homePlayers, ...awayPlayers].map((player) => {
      const lineupEntry = lineupByPlayer.get(player.id);
      const guessedGoalkeeper = /gk|golman/i.test(player.position || "");
      return {
        ...player,
        inRoster: lineupEntry ? true : match.lineups.length === 0,
        isStarter: lineupEntry?.isStarter ?? false,
        isGoalkeeper: lineupEntry?.isGoalkeeper ?? guessedGoalkeeper,
        isPlaying: lineupEntry?.isStarter ?? false
      };
    });
    setPlayers(roster);
    setSelectedPlayerId(roster[0]?.id ?? "");
  }

  async function handleCreateMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!competitionId || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
      setSetupError("Izaberi takmicenje i dve razlicite ekipe.");
      return;
    }
    setSetupBusy(true);
    setSetupError("");
    try {
      const match = await createMatch({
        competitionId,
        homeTeamId,
        awayTeamId,
        scheduledAt: new Date(scheduledAt).toISOString()
      });
      setMatchDetail(match);
      await loadRosterForMatch(match);
      setPhase(match.status === "live" ? "live" : "roster");
    } catch (err) {
      setSetupError(err instanceof ApiError ? err.message : "Utakmica nije kreirana.");
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleResumeMatch(match: Match) {
    setSetupBusy(true);
    setSetupError("");
    try {
      const detail = await getMatchDetail(match.id);
      setMatchDetail(detail);
      await loadRosterForMatch(detail);
      setMatchMinute(0);
      setPhase(detail.status === "finished" ? "review" : detail.status === "live" ? "live" : "roster");
    } catch (err) {
      setSetupError(err instanceof ApiError ? err.message : "Utakmica nije ucitana.");
    } finally {
      setSetupBusy(false);
    }
  }

  function toggleRosterFlag(playerId: string, field: "inRoster" | "isStarter" | "isGoalkeeper") {
    setPlayers((previous) =>
      previous.map((player) => {
        if (player.id !== playerId) return player;
        if (field === "inRoster") {
          const inRoster = !player.inRoster;
          return { ...player, inRoster, isStarter: inRoster ? player.isStarter : false };
        }
        if (field === "isStarter") {
          const isStarter = !player.isStarter;
          return { ...player, inRoster: player.inRoster || isStarter, isStarter };
        }
        return { ...player, isGoalkeeper: !player.isGoalkeeper };
      })
    );
  }

  async function startMatch() {
    if (!matchDetail || !canStart) return;
    setActionBusy(true);
    setActionError("");
    try {
      const squad = players.filter((player) => player.inRoster);
      await setMatchLineup(
        matchDetail.id,
        squad.map((player) => ({
          playerId: player.id,
          teamId: player.teamId,
          isStarter: player.isStarter,
          isGoalkeeper: player.isGoalkeeper,
          shirtNumber: player.shirtNumber ?? undefined
        }))
      );
      const updated = await setMatchStatus(matchDetail.id, "live");
      setMatchDetail(updated);
      setPlayers((previous) => previous.map((player) => ({ ...player, isPlaying: player.isStarter })));
      setMatchMinute(0);
      setPhase("live");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Utakmica nije pokrenuta.");
    } finally {
      setActionBusy(false);
    }
  }

  function handlePlayerClick(player: RosterPlayer, mode: "playing" | "bench") {
    if (mode === "playing") {
      setSelectedPlayerId(player.id);
      setSubstituteOutId(player.id);
      return;
    }
    if (substituteOutId) {
      const out = players.find((item) => item.id === substituteOutId);
      if (out && out.teamId === player.teamId) {
        void makeSubstitution(substituteOutId, player.id);
        return;
      }
    }
    setSelectedPlayerId(player.id);
  }

  async function makeSubstitution(outId: string, inId: string) {
    if (!matchDetail) return;
    const out = players.find((player) => player.id === outId);
    const incoming = players.find((player) => player.id === inId);
    if (!out || !incoming || out.teamId !== incoming.teamId || out.id === incoming.id) return;

    const nextPlayers = players.map((player) => {
      if (player.id === out.id) return { ...player, isPlaying: false, isStarter: false };
      if (player.id === incoming.id) return { ...player, isPlaying: true, isStarter: true, inRoster: true };
      return player;
    });

    setActionBusy(true);
    setActionError("");
    try {
      const squad = nextPlayers.filter((player) => player.inRoster);
      await setMatchLineup(
        matchDetail.id,
        squad.map((player) => ({
          playerId: player.id,
          teamId: player.teamId,
          isStarter: player.isStarter,
          isGoalkeeper: player.isGoalkeeper,
          shirtNumber: player.shirtNumber ?? undefined
        }))
      );
      const result = await addMatchEvent(matchDetail.id, {
        type: "substitution",
        minute: matchMinute,
        teamId: out.teamId,
        playerId: incoming.id,
        relatedPlayerId: out.id,
        text: `${out.displayName} izasao, ${incoming.displayName} usao`
      });
      setMatchDetail(result.match);
      setPlayers(nextPlayers);
      setSelectedPlayerId(incoming.id);
      setSubstituteOutId(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Izmena nije uspela.");
    } finally {
      setActionBusy(false);
    }
  }

  async function applyAction(type: ActionType) {
    if (!matchDetail || !selectedPlayer || !selectedPlayer.isPlaying) return;

    if (type === "goal") {
      setPendingGoal({ scorerId: selectedPlayer.id });
      return;
    }

    setActionBusy(true);
    setActionError("");
    try {
      const result = await addMatchEvent(matchDetail.id, {
        type,
        minute: matchMinute,
        teamId: selectedPlayer.teamId,
        playerId: selectedPlayer.id
      });
      setMatchDetail(result.match);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Dogadjaj nije sacuvan.");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmGoal(assistantId: string | null) {
    if (!matchDetail || !pendingGoal) return;
    const scorer = players.find((player) => player.id === pendingGoal.scorerId);
    if (!scorer) {
      setPendingGoal(null);
      return;
    }

    setActionBusy(true);
    setActionError("");
    try {
      const result = await addMatchEvent(matchDetail.id, {
        type: "goal",
        minute: matchMinute,
        teamId: scorer.teamId,
        playerId: scorer.id,
        relatedPlayerId: assistantId ?? undefined
      });
      setMatchDetail(result.match);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Gol nije sacuvan.");
    } finally {
      setActionBusy(false);
      setPendingGoal(null);
    }
  }

  async function finishMatch() {
    if (!matchDetail) return;
    setActionBusy(true);
    setActionError("");
    try {
      const updated = await setMatchStatus(matchDetail.id, "finished");
      setMatchDetail(updated);
      setPhase("review");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Utakmica nije zavrsena.");
    } finally {
      setActionBusy(false);
    }
  }

  function resetToSetup() {
    setMatchDetail(null);
    setPlayers([]);
    setPhase("match-setup");
    setPendingGoal(null);
    setSubstituteOutId(null);
    listLiveMatches().then(setLiveMatches).catch(() => undefined);
    if (competitionId) {
      listCompetitionMatches(competitionId)
        .then((rows) => setScheduledMatches(rows.filter((match) => match.status === "scheduled")))
        .catch(() => undefined);
    }
  }

  if (phase === "match-setup") {
    return (
      <MatchSetupView
        onBack={onBack}
        competitions={competitions}
        competitionId={competitionId}
        onCompetitionChange={setCompetitionId}
        teams={teams}
        homeTeamId={homeTeamId}
        awayTeamId={awayTeamId}
        onHomeTeamChange={setHomeTeamId}
        onAwayTeamChange={setAwayTeamId}
        scheduledAt={scheduledAt}
        onScheduledAtChange={setScheduledAt}
        onSubmit={handleCreateMatch}
        busy={setupBusy}
        error={setupError}
        liveMatches={liveMatches}
        scheduledMatches={scheduledMatches}
        onResume={handleResumeMatch}
      />
    );
  }

  if (!matchDetail) return <Spinner label="Ucitavanje utakmice..." />;

  return (
    <main className="shell">
      <section className="match-header">
        <div>
          <p className="eyebrow">Admin live</p>
          <h1>
            {matchDetail.homeTeamName} vs {matchDetail.awayTeamName}
          </h1>
          <p>Roster, izmene, dogadjaji i finalni zapisnik - povezano na pravi API.</p>
        </div>
        <div className="score-card">
          <span>{matchDetail.homeScore}</span>
          <small>:</small>
          <span>{matchDetail.awayScore}</span>
          <em>{getPhaseLabel(matchDetail.status)}</em>
        </div>
      </section>

      {actionError ? <ErrorNote message={actionError} /> : null}

      {phase === "roster" ? (
        <>
          <section className="control-bar">
            <button onClick={resetToSetup}>Nazad na izbor meca</button>
          </section>
          <RosterView
            players={players}
            homeTeamId={matchDetail.homeTeamId}
            awayTeamId={matchDetail.awayTeamId}
            homeTeamName={matchDetail.homeTeamName}
            awayTeamName={matchDetail.awayTeamName}
            onToggle={toggleRosterFlag}
            canStart={canStart}
            onStart={startMatch}
            busy={actionBusy}
          />
        </>
      ) : (
        <>
          <section className="control-bar">
            <ClockControls minute={matchMinute} onChange={setMatchMinute} disabled={phase !== "live"} />
            <button onClick={resetToSetup}>Nova utakmica</button>
          </section>

          <section className="live-grid">
            <CourtView
              players={players}
              homeTeamId={matchDetail.homeTeamId}
              awayTeamId={matchDetail.awayTeamId}
              homeTeamName={matchDetail.homeTeamName}
              awayTeamName={matchDetail.awayTeamName}
              selectedPlayerId={selectedPlayerId}
              substituteOutId={substituteOutId}
              onPlayerClick={handlePlayerClick}
              playerStats={matchDetail.playerStats}
            />
            <aside className="live-panel">
              <div className="selected-box">
                <span>Izabran igrac</span>
                <strong>{selectedPlayer?.displayName ?? "-"}</strong>
                <b>{findFantasyPoints(matchDetail, selectedPlayer?.id)} pts</b>
              </div>

              {phase === "live" && (
                <>
                  <div className="actions">
                    {(Object.keys(actionConfig) as ActionType[]).map((type) => (
                      <button
                        key={type}
                        className={type === "goal" ? "primary" : ""}
                        onClick={() => applyAction(type)}
                        disabled={actionBusy || !selectedPlayer?.isPlaying}
                      >
                        {actionConfig[type].label}
                      </button>
                    ))}
                  </div>

                  {pendingGoal ? (
                    <AssistPicker
                      scorer={players.find((player) => player.id === pendingGoal.scorerId) ?? null}
                      players={players}
                      onChoose={confirmGoal}
                      busy={actionBusy}
                    />
                  ) : null}

                  <div className="actions secondary">
                    <button onClick={() => selectedPlayer && setSubstituteOutId(selectedPlayer.id)} disabled={actionBusy}>
                      Zameni
                    </button>
                    <button onClick={() => setMatchMinute((minute) => Math.min(60, minute + 1))}>+1 min</button>
                    <button className="primary" onClick={finishMatch} disabled={actionBusy}>
                      Kraj
                    </button>
                  </div>
                </>
              )}

              <EventLog events={matchDetail.events} />
            </aside>
          </section>
        </>
      )}

      {phase === "review" ? (
        <ReviewReport matchDetail={matchDetail} onNewMatch={resetToSetup} />
      ) : null}
    </main>
  );
}

function MatchSetupView({
  onBack,
  competitions,
  competitionId,
  onCompetitionChange,
  teams,
  homeTeamId,
  awayTeamId,
  onHomeTeamChange,
  onAwayTeamChange,
  scheduledAt,
  onScheduledAtChange,
  onSubmit,
  busy,
  error,
  liveMatches,
  scheduledMatches,
  onResume
}: {
  onBack: () => void;
  competitions: Competition[];
  competitionId: string;
  onCompetitionChange: (id: string) => void;
  teams: Team[];
  homeTeamId: string;
  awayTeamId: string;
  onHomeTeamChange: (id: string) => void;
  onAwayTeamChange: (id: string) => void;
  scheduledAt: string;
  onScheduledAtChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  error: string;
  liveMatches: Match[];
  scheduledMatches: Match[];
  onResume: (match: Match) => void;
}) {
  return (
    <section className="match-setup">
      <div className="admin-subnav">
        <button onClick={onBack}>Nazad na admin portal</button>
      </div>

      <div className="teams-admin-head">
        <div>
          <p className="eyebrow">Live utakmica</p>
          <h2>Pokreni utakmicu iz rasporeda, nastavi live mec, ili napravi vanrednu utakmicu</h2>
          <p>Sve akcije idu direktno u pravu bazu - rezultat i poeni se racunaju automatski.</p>
        </div>
      </div>

      {liveMatches.length > 0 ? (
        <div className="live-resume-list">
          <h3>Live utakmice u toku</h3>
          {liveMatches.map((match) => (
            <button key={match.id} className="team-row-button" onClick={() => onResume(match)}>
              <span>{match.competitionName}</span>
              <strong>
                {match.homeTeamName} {match.homeScore} : {match.awayScore} {match.awayTeamName}
              </strong>
              <small>Nastavi live unos</small>
            </button>
          ))}
        </div>
      ) : null}

      <div className="live-resume-list">
        <h3>Zakazane utakmice - pokreni direktno iz rasporeda</h3>
        {scheduledMatches.length === 0 ? (
          <p className="empty-state">Ovo takmicenje jos nema zakazanih utakmica koje cekaju start.</p>
        ) : (
          [...scheduledMatches]
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
            .slice(0, 20)
            .map((match) => (
              <button key={match.id} className="team-row-button" onClick={() => onResume(match)}>
                <span>{match.round ? `Kolo ${match.round}` : match.phase} - {formatMatchDate(match.scheduledAt)}</span>
                <strong>{match.homeTeamName} vs {match.awayTeamName}</strong>
                <small>Pokreni utakmicu</small>
              </button>
            ))
        )}
        {scheduledMatches.length > 20 ? <p className="empty-state">...i jos {scheduledMatches.length - 20} zakazanih.</p> : null}
      </div>

      <h3>Ili napravi vanrednu (neplaniranu) utakmicu</h3>
      <form className="inline-form match-setup-form" onSubmit={onSubmit}>
        <div className="form-row">
          <label className="field">
            <span>Takmicenje</span>
            <select value={competitionId} onChange={(e) => onCompetitionChange(e.target.value)} required>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {competition.cityName ? `${competition.cityName} - ` : ""}
                  {competition.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Domacin</span>
            <select value={homeTeamId} onChange={(e) => onHomeTeamChange(e.target.value)} required>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Gost</span>
            <select value={awayTeamId} onChange={(e) => onAwayTeamChange(e.target.value)} required>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Termin</span>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => onScheduledAtChange(e.target.value)} required />
          </label>
        </div>
        {error ? <ErrorNote message={error} /> : null}
        <div className="form-actions">
          <button className="primary" type="submit" disabled={busy || teams.length < 2}>
            {busy ? "Kreiranje..." : "Kreiraj utakmicu i podesi roster"}
          </button>
        </div>
        {teams.length < 2 ? <p className="empty-state">Ovo takmicenje nema dve ekipe. Dodaj ekipe u "Ekipe i igraci".</p> : null}
      </form>
    </section>
  );
}

function RosterView({
  players,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  onToggle,
  canStart,
  onStart,
  busy
}: {
  players: RosterPlayer[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  onToggle: (playerId: string, field: "inRoster" | "isStarter" | "isGoalkeeper") => void;
  canStart: boolean;
  onStart: () => void;
  busy: boolean;
}) {
  const sides: Array<{ teamId: string; name: string }> = [
    { teamId: homeTeamId, name: homeTeamName },
    { teamId: awayTeamId, name: awayTeamName }
  ];

  return (
    <section className="roster-grid">
      {sides.map((side) => {
        const teamPlayers = players.filter((player) => player.teamId === side.teamId);
        const starters = teamPlayers.filter((player) => player.inRoster && player.isStarter).length;
        const goalkeepers = teamPlayers.filter((player) => player.inRoster && player.isStarter && player.isGoalkeeper).length;

        return (
          <div className="panel" key={side.teamId}>
            <div className="panel-head">
              <h2>{side.name}</h2>
              <span>4+GK {starters}/5 - GK {goalkeepers}</span>
            </div>
            <div className="roster-list">
              {teamPlayers.length === 0 ? <p className="empty-state">Ova ekipa nema igrace u bazi.</p> : null}
              {teamPlayers.map((player) => (
                <div className={`roster-row ${player.inRoster ? "" : "muted"}`} key={player.id}>
                  <InitialsAvatar name={player.displayName} tone={side.teamId === homeTeamId ? "home" : "away"} />
                  <div>
                    <strong>{player.displayName}</strong>
                    <span>{player.isGoalkeeper ? "golman" : player.position || "igrac"}</span>
                  </div>
                  <label><input type="checkbox" checked={player.inRoster} onChange={() => onToggle(player.id, "inRoster")} /> roster</label>
                  <label><input type="checkbox" checked={player.isStarter} onChange={() => onToggle(player.id, "isStarter")} /> start</label>
                  <label><input type="checkbox" checked={player.isGoalkeeper} onChange={() => onToggle(player.id, "isGoalkeeper")} /> GK</label>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="start-bar">
        <div>
          <strong>{canStart ? "Spremno za start" : "Proveri startne postave"}</strong>
          <span>Za svaki tim treba tacno 4 igraca + golman.</span>
        </div>
        <button className="primary" onClick={onStart} disabled={!canStart || busy}>
          {busy ? "Pokretanje..." : "Start utakmice"}
        </button>
      </div>
    </section>
  );
}

function ClockControls({ minute, disabled, onChange }: { minute: number; disabled: boolean; onChange: (minute: number) => void }) {
  return (
    <div className="clock-controls">
      <button onClick={() => onChange(Math.max(0, minute - 1))} disabled={disabled || minute === 0}>-</button>
      <div>
        <span>Minut</span>
        <strong>{minute}'</strong>
      </div>
      <button onClick={() => onChange(Math.min(60, minute + 1))} disabled={disabled}>+</button>
      <button onClick={() => onChange(20)} disabled={disabled}>20'</button>
      <button onClick={() => onChange(40)} disabled={disabled}>40'</button>
    </div>
  );
}

function CourtView({
  players,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  selectedPlayerId,
  substituteOutId,
  onPlayerClick,
  playerStats
}: {
  players: RosterPlayer[];
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  selectedPlayerId: string;
  substituteOutId: string | null;
  onPlayerClick: (player: RosterPlayer, mode: "playing" | "bench") => void;
  playerStats: MatchDetail["playerStats"];
}) {
  const sides: Array<{ teamId: string; name: string; tone: "home" | "away" }> = [
    { teamId: homeTeamId, name: homeTeamName, tone: "home" },
    { teamId: awayTeamId, name: awayTeamName, tone: "away" }
  ];
  const pointsByPlayer = new Map(playerStats.map((stat) => [stat.playerId, stat.fantasyPoints]));

  return (
    <section className="court">
      {sides.map((side) => {
        const playing = players.filter((player) => player.teamId === side.teamId && player.inRoster && player.isPlaying);
        const bench = players.filter((player) => player.teamId === side.teamId && player.inRoster && !player.isPlaying);

        return (
          <div className="team-court" key={side.teamId}>
            <h2>{side.name}</h2>
            <p>U igri</p>
            <div className="chips">
              {playing.map((player) => (
                <PlayerChip
                  key={player.id}
                  player={player}
                  tone={side.tone}
                  points={pointsByPlayer.get(player.id) ?? 0}
                  active={selectedPlayerId === player.id || substituteOutId === player.id}
                  mode="playing"
                  onClick={onPlayerClick}
                />
              ))}
            </div>
            <p>Klupa</p>
            <div className="chips">
              {bench.map((player) => (
                <PlayerChip
                  key={player.id}
                  player={player}
                  tone={side.tone}
                  points={pointsByPlayer.get(player.id) ?? 0}
                  active={selectedPlayerId === player.id}
                  mode="bench"
                  onClick={onPlayerClick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function PlayerChip({
  player,
  tone,
  points,
  active,
  mode,
  onClick
}: {
  player: RosterPlayer;
  tone: "home" | "away";
  points: number;
  active: boolean;
  mode: "playing" | "bench";
  onClick: (player: RosterPlayer, mode: "playing" | "bench") => void;
}) {
  return (
    <button className={`player-chip ${active ? "active" : ""} ${mode}`} onClick={() => onClick(player, mode)}>
      <InitialsAvatar name={player.displayName} tone={tone} />
      <span>{player.displayName}</span>
      <b>{points} pts</b>
    </button>
  );
}

function AssistPicker({
  scorer,
  players,
  onChoose,
  busy
}: {
  scorer: RosterPlayer | null;
  players: RosterPlayer[];
  onChoose: (assistantId: string | null) => void;
  busy: boolean;
}) {
  if (!scorer) return null;
  const candidates = players.filter(
    (player) => player.teamId === scorer.teamId && player.id !== scorer.id && player.inRoster && player.isPlaying
  );

  return (
    <div className="assist-picker">
      <strong>Ko je asistirao za gol: {scorer.displayName}</strong>
      <div>
        {candidates.map((player) => (
          <button key={player.id} onClick={() => onChoose(player.id)} disabled={busy}>{player.displayName}</button>
        ))}
        <button className="ghost" onClick={() => onChoose(null)} disabled={busy}>Bez asistencije</button>
      </div>
    </div>
  );
}

function EventLog({ events }: { events: MatchDetail["events"] }) {
  const sorted = [...events].sort((a, b) => b.minute - a.minute);
  return (
    <div className="event-log">
      <h2>Live dogadjaji</h2>
      {sorted.length === 0 ? <p>Jos nema dogadjaja.</p> : null}
      {sorted.slice(0, 10).map((event) => (
        <div className="event-row" key={event.id}>
          <span>
            <em>{event.minute}'</em>
            {describeEvent(event)}
          </span>
          <b>{event.fantasyPointsDelta !== 0 ? formatPoints(event.fantasyPointsDelta) : "-"}</b>
        </div>
      ))}
    </div>
  );
}

function ReviewReport({ matchDetail, onNewMatch }: { matchDetail: MatchDetail; onNewMatch: () => void }) {
  const topPerformer = [...matchDetail.playerStats].sort((a, b) => b.fantasyPoints - a.fantasyPoints)[0];
  return (
    <div className="final-report">
      <h2>Finalni zapisnik</h2>
      <div className="report-score">{matchDetail.homeScore} : {matchDetail.awayScore}</div>
      <div className="report-card">
        <span>Najvise fantazi poena u mecu</span>
        <strong>{topPerformer ? `${topPerformer.playerName} - ${topPerformer.fantasyPoints} pts` : "-"}</strong>
      </div>
      <EventLog events={matchDetail.events} />
      <div className="actions secondary">
        <button className="primary" onClick={onNewMatch}>Nova utakmica</button>
      </div>
    </div>
  );
}

function isValidLineup(players: RosterPlayer[], teamId: string): boolean {
  if (!teamId) return false;
  const starters = players.filter((player) => player.teamId === teamId && player.inRoster && player.isStarter);
  const goalkeepers = starters.filter((player) => player.isGoalkeeper);
  const outfield = starters.filter((player) => !player.isGoalkeeper);
  return goalkeepers.length === 1 && outfield.length === 4;
}

function findFantasyPoints(matchDetail: MatchDetail, playerId?: string): number {
  if (!playerId) return 0;
  return matchDetail.playerStats.find((stat) => stat.playerId === playerId)?.fantasyPoints ?? 0;
}

function describeEvent(event: MatchDetail["events"][number]): string {
  const label = actionConfig[event.type as ActionType]?.label ?? event.type;
  if (event.text) return event.text;
  if (event.playerName) return `${event.playerName} - ${label}`;
  return label;
}

function formatMatchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sr-RS", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `${points}`;
}

function getPhaseLabel(status: string): string {
  if (status === "scheduled") return "ZAKAZANO";
  if (status === "live") return "LIVE";
  if (status === "finished") return "ZAVRSENO";
  return status.toUpperCase();
}
