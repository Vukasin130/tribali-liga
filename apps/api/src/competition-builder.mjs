import { query, transaction } from "./db.mjs";
import { syncFantasyPlayerPool } from "./season-hub.mjs";

const DEFAULT_PHASES = {
  league: [
    { code: "regular", name: "Regularni deo", type: "league", sequence: 1, legs: 1 }
  ],
  tournament: [
    { code: "group", name: "Grupna faza", type: "group", sequence: 1, legs: 1 },
    { code: "knockout", name: "Nokaut faza", type: "knockout", sequence: 2, legs: 1 }
  ],
  hybrid: [
    { code: "regular", name: "Regularni deo", type: "league", sequence: 1, legs: 1 },
    { code: "knockout", name: "Nokaut faza", type: "knockout", sequence: 2, legs: 1 }
  ]
};

export async function getCompetitionSetup(competitionId) {
  const [competition, format, phases, slots, teams, matches] = await Promise.all([
    query(
      `select c.*, city.name as city_name
       from public.competitions c
       left join public.cities city on city.id = c.city_id
       where c.id = $1`,
      [competitionId]
    ),
    query("select * from public.competition_formats where competition_id = $1 limit 1", [competitionId]),
    query(
      `select p.*
       from public.competition_phases p
       where p.competition_id = $1
       order by p.sequence, p.created_at`,
      [competitionId]
    ),
    query(
      `select *
       from public.competition_schedule_slots
       where competition_id = $1
       order by starts_at`,
      [competitionId]
    ),
    query(
      `select t.*, count(p.id)::int as players_count
       from public.teams t
       left join public.players p on p.team_id = t.id and p.is_active = true
       where t.competition_id = $1 and t.is_active = true
       group by t.id
       order by coalesce(t.group_name, ''), t.name`,
      [competitionId]
    ),
    query(
      `select m.*, ht.name as home_team_name, at.name as away_team_name, cp.code as phase_code, cp.name as phase_name
       from public.matches m
       left join public.teams ht on ht.id = m.home_team_id
       left join public.teams at on at.id = m.away_team_id
       left join public.competition_phases cp on cp.id = m.phase_id
       where m.competition_id = $1
       order by m.scheduled_at, m.round, ht.name`,
      [competitionId]
    )
  ]);

  if (!competition.rows[0]) throw httpError(404, "Takmicenje nije pronadjeno.");

  return {
    competition: normalizeCompetition(competition.rows[0]),
    format: format.rows[0] ? normalizeFormat(format.rows[0]) : null,
    phases: phases.rows.map(normalizePhase),
    scheduleSlots: slots.rows.map(normalizeScheduleSlot),
    teams: teams.rows.map(normalizeTeam),
    matches: matches.rows.map(normalizeMatch)
  };
}

export async function configureCompetition(competitionId, payload, actor) {
  const formatType = validFormatType(payload.formatType || payload.type || "league");
  const phases = Array.isArray(payload.phases) && payload.phases.length
    ? payload.phases
    : DEFAULT_PHASES[formatType];

  const result = await transaction(async (client) => {
    await ensureCompetition(client, competitionId);
    const formatResult = await client.query(
      `insert into public.competition_formats (competition_id, format_type, teams_count, settings)
       values ($1, $2, $3, $4::jsonb)
       on conflict (competition_id) do update set
         format_type = excluded.format_type,
         teams_count = excluded.teams_count,
         settings = excluded.settings,
         updated_at = now()
       returning *`,
      [
        competitionId,
        formatType,
        integerOrNull(payload.teamsCount),
        JSON.stringify(payload.settings || {})
      ]
    );

    const savedPhases = [];
    for (let index = 0; index < phases.length; index += 1) {
      const phase = phases[index];
      const saved = await client.query(
        `insert into public.competition_phases
           (competition_id, code, name, type, sequence, group_count, teams_per_group,
            qualifiers_per_group, best_third_count, legs, starts_at, ends_at, settings)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
         on conflict (competition_id, code) do update set
           name = excluded.name,
           type = excluded.type,
           sequence = excluded.sequence,
           group_count = excluded.group_count,
           teams_per_group = excluded.teams_per_group,
           qualifiers_per_group = excluded.qualifiers_per_group,
           best_third_count = excluded.best_third_count,
           legs = excluded.legs,
           starts_at = excluded.starts_at,
           ends_at = excluded.ends_at,
           settings = excluded.settings,
           updated_at = now()
         returning *`,
        [
          competitionId,
          requiredText(phase.code || slugify(phase.name), "Kod faze je obavezan."),
          requiredText(phase.name, "Naziv faze je obavezan."),
          validPhaseType(phase.type || "group"),
          integerOrNull(phase.sequence) || index + 1,
          integerOrNull(phase.groupCount),
          integerOrNull(phase.teamsPerGroup),
          integerOrNull(phase.qualifiersPerGroup),
          integerOrNull(phase.bestThirdCount) || 0,
          integerOrNull(phase.legs) || 1,
          phase.startsAt || null,
          phase.endsAt || null,
          JSON.stringify(phase.settings || {})
        ]
      );
      savedPhases.push(saved.rows[0]);
      await upsertPhaseRules(client, saved.rows[0].id, phase.rules || []);
    }

    await client.query(
      `update public.competitions set
         kind = $2,
         format_summary = $3,
         updated_at = now()
       where id = $1`,
      [competitionId, formatType, buildFormatSummary(formatType, savedPhases)]
    );

    await auditWithClient(client, actor, "competition.configure", "competition", competitionId, {
      formatType,
      phases: savedPhases.map((phase) => phase.code)
    });

    return { format: formatResult.rows[0], phases: savedPhases };
  });

  return {
    format: normalizeFormat(result.format),
    phases: result.phases.map(normalizePhase)
  };
}

export async function addTeamsToCompetition(competitionId, payload, actor) {
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  if (!teams.length) throw httpError(400, "Moras dodati bar jednu ekipu.");

  const result = await transaction(async (client) => {
    await ensureCompetition(client, competitionId);
    const inserted = [];
    for (const team of teams) {
      const saved = await client.query(
        `insert into public.teams
           (competition_id, name, short_name, logo_url, group_name, placement, is_active, source_team_id)
         values ($1, $2, $3, $4, $5, $6, true, $7)
         returning *`,
        [
          competitionId,
          requiredText(team.name, "Naziv ekipe je obavezan."),
          String(team.shortName || "").trim(),
          String(team.logoUrl || "").trim(),
          String(team.groupName || "").trim(),
          String(team.placement || "").trim(),
          team.sourceTeamId || null
        ]
      );
      inserted.push(saved.rows[0]);
    }
    await auditWithClient(client, actor, "competition.teams.add", "competition", competitionId, { count: inserted.length });
    return inserted;
  });

  const fantasyPool = payload.syncFantasy === false ? null : await syncFantasyPlayerPool(competitionId, actor);

  return {
    teams: result.map(normalizeTeam),
    fantasyPool
  };
}

export async function cloneCompetitionTeams(competitionId, payload, actor) {
  const sourceCompetitionId = requiredText(payload.sourceCompetitionId, "Izvorno takmicenje je obavezno.");
  const includePlayers = payload.includePlayers !== false;
  const sourceTeamIds = Array.isArray(payload.sourceTeamIds) ? payload.sourceTeamIds.filter(Boolean) : [];

  const result = await transaction(async (client) => {
    await ensureCompetition(client, competitionId);
    await ensureCompetition(client, sourceCompetitionId);

    const params = [sourceCompetitionId];
    let teamFilter = "";
    if (sourceTeamIds.length) {
      params.push(sourceTeamIds);
      teamFilter = "and id = any($2::uuid[])";
    }
    const sourceTeams = await client.query(
      `select *
       from public.teams
       where competition_id = $1 and is_active = true ${teamFilter}
       order by coalesce(group_name, ''), name`,
      params
    );
    if (!sourceTeams.rows.length) throw httpError(400, "Izvorno takmicenje nema ekipe za kopiranje.");

    const cloned = [];
    const teamMap = new Map();
    for (const team of sourceTeams.rows) {
      const saved = await client.query(
        `insert into public.teams
           (competition_id, name, short_name, logo_url, group_name, placement, is_active, source_team_id)
         values ($1, $2, $3, $4, $5, '', true, $6)
         returning *`,
        [competitionId, team.name, team.short_name, team.logo_url, payload.keepGroups ? team.group_name : "", team.id]
      );
      cloned.push(saved.rows[0]);
      teamMap.set(team.id, saved.rows[0].id);
    }

    let playersCount = 0;
    if (includePlayers) {
      const sourcePlayers = await client.query(
        `select p.*
         from public.players p
         join public.teams t on t.id = p.team_id
         where t.competition_id = $1 and p.is_active = true
           ${sourceTeamIds.length ? "and t.id = any($2::uuid[])" : ""}
         order by p.display_name`,
        sourceTeamIds.length ? [sourceCompetitionId, sourceTeamIds] : [sourceCompetitionId]
      );
      for (const player of sourcePlayers.rows) {
        const newTeamId = teamMap.get(player.team_id);
        if (!newTeamId) continue;
        await client.query(
          `insert into public.players
             (team_id, display_name, position, shirt_number, avatar_url, is_active, legacy_source, legacy_id)
           values ($1, $2, $3, $4, $5, true, 'cloned-player', $6)`,
          [newTeamId, player.display_name, player.position, player.shirt_number, player.avatar_url, `${competitionId}:${player.id}`]
        );
        playersCount += 1;
      }
    }

    await auditWithClient(client, actor, "competition.teams.clone", "competition", competitionId, {
      sourceCompetitionId,
      teams: cloned.length,
      players: playersCount
    });

    return { teams: cloned, playersCount };
  });

  const fantasyPool = includePlayers && payload.syncFantasy !== false
    ? await syncFantasyPlayerPool(competitionId, actor)
    : null;

  return {
    teams: result.teams.map(normalizeTeam),
    playersCount: result.playersCount,
    fantasyPool
  };
}

export async function assignCompetitionGroups(competitionId, payload, actor) {
  const groupNames = Array.isArray(payload.groupNames) && payload.groupNames.length
    ? payload.groupNames.map((name) => String(name || "").trim()).filter(Boolean)
    : buildGroupNames(integerOrNull(payload.groupCount) || 1);
  if (!groupNames.length) throw httpError(400, "Mora postojati bar jedna grupa.");

  const result = await transaction(async (client) => {
    const teams = await client.query(
      `select *
       from public.teams
       where competition_id = $1 and is_active = true
       order by name`,
      [competitionId]
    );
    if (!teams.rows.length) throw httpError(400, "Takmicenje nema ekipe.");

    const seeded = Array.isArray(payload.seeds) && payload.seeds.length
      ? payload.seeds
      : teams.rows.map((team) => team.id);

    const updates = [];
    for (let index = 0; index < seeded.length; index += 1) {
      const teamId = seeded[index];
      const groupName = groupNames[index % groupNames.length];
      const updated = await client.query(
        `update public.teams set group_name = $2, updated_at = now()
         where id = $1 and competition_id = $3
         returning *`,
        [teamId, groupName, competitionId]
      );
      if (updated.rows[0]) updates.push(updated.rows[0]);
    }

    await auditWithClient(client, actor, "competition.groups.assign", "competition", competitionId, {
      groups: groupNames
    });
    return updates;
  });

  return result.map(normalizeTeam);
}

export async function upsertScheduleSlots(competitionId, payload, actor) {
  const slots = Array.isArray(payload.slots) ? payload.slots : [];
  if (!slots.length) throw httpError(400, "Moras uneti bar jedan termin.");

  const result = await transaction(async (client) => {
    await ensureCompetition(client, competitionId);
    if (payload.replace === true) {
      await client.query("delete from public.competition_schedule_slots where competition_id = $1 and is_reserved = false", [competitionId]);
    }

    const saved = [];
    for (const slot of slots) {
      const row = await client.query(
        `insert into public.competition_schedule_slots (competition_id, starts_at, venue, pitch, label)
         values ($1, $2, $3, $4, $5)
         returning *`,
        [
          competitionId,
          requiredText(slot.startsAt, "Termin mora imati datum i vreme."),
          String(slot.venue || "").trim(),
          String(slot.pitch || "").trim(),
          String(slot.label || "").trim()
        ]
      );
      saved.push(row.rows[0]);
    }

    await auditWithClient(client, actor, "competition.slots.upsert", "competition", competitionId, { count: saved.length });
    return saved;
  });

  return result.map(normalizeScheduleSlot);
}

export async function generateCompetitionSchedule(competitionId, payload, actor) {
  const phaseCode = String(payload.phaseCode || payload.phase || "regular").trim();
  const mode = String(payload.mode || "replace").trim();
  const legs = integerOrNull(payload.legs) || 1;
  const intervalMinutes = integerOrNull(payload.intervalMinutes) || 60;
  const startAt = payload.startAt || new Date().toISOString();
  const venue = String(payload.venue || "").trim();

  const result = await transaction(async (client) => {
    const phase = await getPhaseByCode(client, competitionId, phaseCode);
    const teams = await loadTeamsForPhase(client, competitionId, phase);
    if (teams.length < 2) throw httpError(400, "Za raspored su potrebne bar dve ekipe.");

    if (mode === "replace") {
      await client.query(
        `delete from public.matches
         where competition_id = $1 and coalesce(phase_id::text, '') = coalesce($2::text, '') and status = 'scheduled'`,
        [competitionId, phase.id]
      );
    }

    const pairings = buildRoundRobin(teams, legs);
    const slots = await loadUsableSlots(client, competitionId, pairings.length, startAt, intervalMinutes, venue, pairings);
    const matches = [];

    for (let index = 0; index < pairings.length; index += 1) {
      const pairing = pairings[index];
      const slot = slots[index];
      const saved = await client.query(
        `insert into public.matches
           (competition_id, phase_id, home_team_id, away_team_id, phase, group_name, round, scheduled_at, venue, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled')
         returning *`,
        [
          competitionId,
          phase.id,
          pairing.home.id,
          pairing.away.id,
          phase.type,
          pairing.groupName || "",
          pairing.round,
          slot.startsAt,
          slot.venue || venue
        ]
      );
      matches.push(saved.rows[0]);

      if (slot.id) {
        await client.query("update public.competition_schedule_slots set is_reserved = true where id = $1", [slot.id]);
      }
    }

    await auditWithClient(client, actor, "competition.schedule.generate", "competition", competitionId, {
      phaseCode,
      matches: matches.length
    });

    return matches;
  });

  return result.map(normalizeMatch);
}

export async function prepareKnockoutPhase(competitionId, payload, actor) {
  const phaseCode = String(payload.phaseCode || "knockout").trim();
  const qualifiersCount = integerOrNull(payload.qualifiersCount) || integerOrNull(payload.teamsCount) || 8;
  const includeThirdPlace = payload.includeThirdPlace !== false;
  const startAt = payload.startAt || new Date().toISOString();
  const intervalMinutes = integerOrNull(payload.intervalMinutes) || 60;
  const venue = String(payload.venue || "").trim();

  const result = await transaction(async (client) => {
    const phase = await getPhaseByCode(client, competitionId, phaseCode);
    const qualifiers = await selectQualifiers(client, competitionId, qualifiersCount);
    if (qualifiers.length < 2) throw httpError(400, "Nema dovoljno ekipa za nokaut fazu.");

    await client.query(
      `delete from public.matches
       where competition_id = $1 and phase_id = $2 and status = 'scheduled'`,
      [competitionId, phase.id]
    );

    const firstRound = pairSeeds(qualifiers);
    const slotsNeeded = firstRound.length + (includeThirdPlace ? 1 : 0);
    const slots = await loadUsableSlots(client, competitionId, slotsNeeded, startAt, intervalMinutes, venue);
    const matches = [];

    for (let index = 0; index < firstRound.length; index += 1) {
      const [home, away] = firstRound[index];
      const saved = await client.query(
        `insert into public.matches
           (competition_id, phase_id, home_team_id, away_team_id, phase, round, scheduled_at, venue, status)
         values ($1, $2, $3, $4, 'knockout', $5, $6, $7, 'scheduled')
         returning *`,
        [competitionId, phase.id, home.team_id, away.team_id, knockoutRoundNumber(qualifiers.length), slots[index].startsAt, slots[index].venue || venue]
      );
      matches.push(saved.rows[0]);
    }

    if (includeThirdPlace) {
      const slot = slots[firstRound.length];
      const third = await client.query(
        `insert into public.matches
           (competition_id, phase_id, phase, round, scheduled_at, venue, status)
         values ($1, $2, 'third_place', 3, $3, $4, 'scheduled')
         returning *`,
        [competitionId, phase.id, slot.startsAt, slot.venue || venue]
      );
      matches.push(third.rows[0]);
    }

    await auditWithClient(client, actor, "competition.knockout.prepare", "competition", competitionId, {
      qualifiers: qualifiers.length,
      matches: matches.length,
      includeThirdPlace
    });

    return { qualifiers, matches };
  });

  return {
    qualifiers: result.qualifiers.map(normalizeQualifier),
    matches: result.matches.map(normalizeMatch)
  };
}

export async function advanceKnockoutPhase(competitionId, payload, actor) {
  const phaseCode = String(payload.phaseCode || "knockout").trim();
  const includeThirdPlace = payload.includeThirdPlace === true;
  const intervalMinutes = integerOrNull(payload.intervalMinutes) || 60;
  const venue = String(payload.venue || "").trim();

  const result = await transaction(async (client) => {
    const phase = await getPhaseByCode(client, competitionId, phaseCode);

    const currentRoundResult = await client.query(
      `select min(round) as round
       from public.matches
       where competition_id = $1 and phase_id = $2 and phase = 'knockout'`,
      [competitionId, phase.id]
    );
    const currentRound = currentRoundResult.rows[0]?.round;
    if (!currentRound) throw httpError(400, "Nema pripremljene nokaut runde. Prvo pripremi prvu rundu.");

    const currentMatches = await client.query(
      `select * from public.matches
       where competition_id = $1 and phase_id = $2 and phase = 'knockout' and round = $3
       order by created_at`,
      [competitionId, phase.id, currentRound]
    );
    if (currentMatches.rows.length < 2 && currentRound > 2) {
      throw httpError(400, "Trenutna nokaut runda nema dovoljno mečeva.");
    }
    if (currentMatches.rows.some((match) => match.status !== "finished")) {
      throw httpError(400, "Sve utakmice trenutne runde moraju biti odigrane pre pripreme sledece runde.");
    }

    const winners = [];
    for (const match of currentMatches.rows) {
      const homeScore = Number(match.home_score || 0);
      const awayScore = Number(match.away_score || 0);
      if (homeScore === awayScore) {
        throw httpError(400, "Nokaut mec ne moze biti nereseno - unesi konacan rezultat pre pripreme sledece runde.");
      }
      const winnerId = homeScore > awayScore ? match.home_team_id : match.away_team_id;
      if (winnerId) winners.push(winnerId);
    }

    if (winners.length <= 1) {
      let champion = null;
      if (winners.length === 1) {
        const teamRow = await client.query("select id, name from public.teams where id = $1", [winners[0]]);
        champion = teamRow.rows[0] ? { teamId: teamRow.rows[0].id, teamName: teamRow.rows[0].name } : null;
      }
      await auditWithClient(client, actor, "competition.knockout.advance", "competition", competitionId, {
        fromRound: currentRound,
        champion: champion?.teamId || null
      });
      return { champion, matches: [] };
    }

    const nextRound = knockoutRoundNumber(winners.length);
    await client.query(
      `delete from public.matches
       where competition_id = $1 and phase_id = $2 and phase = 'knockout' and round = $3 and status = 'scheduled'`,
      [competitionId, phase.id, nextRound]
    );

    const pairs = [];
    for (let index = 0; index + 1 < winners.length; index += 2) {
      pairs.push([winners[index], winners[index + 1]]);
    }

    const startAt = payload.startAt || new Date().toISOString();
    const slots = await loadUsableSlots(client, competitionId, pairs.length, startAt, intervalMinutes, venue);
    const matches = [];
    for (let index = 0; index < pairs.length; index += 1) {
      const [homeId, awayId] = pairs[index];
      const saved = await client.query(
        `insert into public.matches
           (competition_id, phase_id, home_team_id, away_team_id, phase, round, scheduled_at, venue, status)
         values ($1, $2, $3, $4, 'knockout', $5, $6, $7, 'scheduled')
         returning *`,
        [competitionId, phase.id, homeId, awayId, nextRound, slots[index].startsAt, slots[index].venue || venue]
      );
      matches.push(saved.rows[0]);
    }

    if (includeThirdPlace && nextRound === 2) {
      const losers = currentMatches.rows
        .map((match) => {
          const homeScore = Number(match.home_score || 0);
          const awayScore = Number(match.away_score || 0);
          return homeScore > awayScore ? match.away_team_id : match.home_team_id;
        })
        .filter(Boolean);
      if (losers.length === 2) {
        const slot = await loadUsableSlots(client, competitionId, 1, startAt, intervalMinutes, venue);
        const third = await client.query(
          `insert into public.matches
             (competition_id, phase_id, home_team_id, away_team_id, phase, round, scheduled_at, venue, status)
           values ($1, $2, $3, $4, 'third_place', 3, $5, $6, 'scheduled')
           returning *`,
          [competitionId, phase.id, losers[0], losers[1], slot[0].startsAt, slot[0].venue || venue]
        );
        matches.push(third.rows[0]);
      }
    }

    await auditWithClient(client, actor, "competition.knockout.advance", "competition", competitionId, {
      fromRound: currentRound,
      toRound: nextRound,
      matches: matches.length
    });

    return { champion: null, matches };
  });

  return {
    champion: result.champion,
    matches: result.matches.map(normalizeMatch)
  };
}

async function upsertPhaseRules(client, phaseId, rules) {
  await client.query("delete from public.competition_phase_rules where phase_id = $1", [phaseId]);
  for (const rule of rules) {
    await client.query(
      `insert into public.competition_phase_rules (phase_id, rule_type, config)
       values ($1, $2, $3::jsonb)`,
      [phaseId, requiredText(rule.type || rule.ruleType, "Tip pravila je obavezan."), JSON.stringify(rule.config || {})]
    );
  }
}

async function ensureCompetition(client, competitionId) {
  const result = await client.query("select * from public.competitions where id = $1", [competitionId]);
  if (!result.rows[0]) throw httpError(404, "Takmicenje nije pronadjeno.");
  return result.rows[0];
}

async function getPhaseByCode(client, competitionId, code) {
  const result = await client.query(
    `select *
     from public.competition_phases
     where competition_id = $1 and code = $2
     limit 1`,
    [competitionId, code]
  );
  if (result.rows[0]) return result.rows[0];
  throw httpError(404, "Faza takmicenja nije pronadjena. Prvo podesi format takmicenja.");
}

async function loadTeamsForPhase(client, competitionId, phase) {
  const rows = await client.query(
    `select *
     from public.teams
     where competition_id = $1 and is_active = true
     order by coalesce(group_name, ''), name`,
    [competitionId]
  );
  if (phase.type === "group") {
    const grouped = rows.rows.filter((team) => team.group_name);
    return grouped.length ? grouped : rows.rows;
  }
  return rows.rows;
}

function mondayForRound(startAt, round) {
  const date = new Date(startAt);
  if (!Number.isFinite(date.getTime())) throw httpError(400, "Pocetak rasporeda nije validan.");
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 + (Math.max(1, Number(round) || 1) - 1) * 7);
  date.setHours(18, 0, 0, 0);
  return date;
}

async function loadUsableSlots(client, competitionId, count, startAt, intervalMinutes, venue, pairings = []) {
  const existing = await client.query(
    `select *
     from public.competition_schedule_slots
     where competition_id = $1 and is_reserved = false
     order by starts_at
     limit $2`,
    [competitionId, count]
  );

  const slots = existing.rows.map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    venue: row.venue || venue
  }));

  const roundCounters = new Map();
  let nextTime = new Date(startAt).getTime();
  if (!Number.isFinite(nextTime)) throw httpError(400, "Pocetak rasporeda nije validan.");
  while (slots.length < count) {
    const pairing = pairings[slots.length];
    const round = pairing?.round || 1;
    const roundIndex = roundCounters.get(round) || 0;
    roundCounters.set(round, roundIndex + 1);
    const weekStart = mondayForRound(startAt, round).getTime();
    slots.push({
      id: "",
      startsAt: new Date(weekStart + roundIndex * intervalMinutes * 60 * 1000).toISOString(),
      venue
    });
    nextTime += intervalMinutes * 60 * 1000;
  }
  return slots;
}

function buildRoundRobin(teams, legs) {
  const groups = groupTeamsForSchedule(teams);
  const pairings = [];
  for (const [groupName, groupTeams] of groups.entries()) {
    const rounds = roundRobinGroup(groupTeams);
    for (let leg = 1; leg <= legs; leg += 1) {
      for (const round of rounds) {
        for (const match of round.matches) {
          pairings.push({
            round: round.round + ((leg - 1) * rounds.length),
            groupName,
            home: leg % 2 === 1 ? match.home : match.away,
            away: leg % 2 === 1 ? match.away : match.home
          });
        }
      }
    }
  }
  return pairings.sort((a, b) => a.round - b.round || a.groupName.localeCompare(b.groupName));
}

function groupTeamsForSchedule(teams) {
  const hasGroups = teams.some((team) => team.group_name);
  const groups = new Map();
  for (const team of teams) {
    const key = hasGroups ? team.group_name || "Bez grupe" : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(team);
  }
  return groups;
}

function roundRobinGroup(groupTeams) {
  const teams = [...groupTeams];
  if (teams.length % 2 === 1) teams.push(null);
  const rounds = [];
  const half = teams.length / 2;
  const rotating = teams.slice(1);
  const fixed = teams[0];

  for (let roundIndex = 0; roundIndex < teams.length - 1; roundIndex += 1) {
    const roundTeams = [fixed, ...rotating];
    const matches = [];
    for (let index = 0; index < half; index += 1) {
      const home = roundTeams[index];
      const away = roundTeams[roundTeams.length - 1 - index];
      if (home && away) {
        matches.push(roundIndex % 2 === 0 ? { home, away } : { home: away, away: home });
      }
    }
    rounds.push({ round: roundIndex + 1, matches });
    rotating.unshift(rotating.pop());
  }
  return rounds;
}

async function selectQualifiers(client, competitionId, count) {
  const standings = await client.query(
    `select s.*, t.name as team_name
     from public.team_standings s
     left join public.teams t on t.id = s.team_id
     where s.competition_id = $1
     order by coalesce(s.group_name, ''), coalesce(s.position, 999), s.points desc, s.goal_difference desc, s.goals_for desc`,
    [competitionId]
  );

  const grouped = new Map();
  for (const row of standings.rows) {
    const group = row.group_name || "Tabela";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(row);
  }

  const qualifiers = [];
  const groups = [...grouped.values()];
  let cursor = 0;
  while (qualifiers.length < count && groups.some((group) => group[cursor])) {
    for (const group of groups) {
      if (group[cursor] && qualifiers.length < count) qualifiers.push(group[cursor]);
    }
    cursor += 1;
  }
  return qualifiers;
}

function pairSeeds(qualifiers) {
  const pairs = [];
  let left = 0;
  let right = qualifiers.length - 1;
  while (left < right) {
    pairs.push([qualifiers[left], qualifiers[right]]);
    left += 1;
    right -= 1;
  }
  return pairs;
}

function knockoutRoundNumber(count) {
  if (count >= 16) return 16;
  if (count >= 8) return 8;
  if (count >= 4) return 4;
  return 2;
}

function buildGroupNames(count) {
  return Array.from({ length: count }, (_, index) => `Grupa ${String.fromCharCode(65 + index)}`);
}

function buildFormatSummary(formatType, phases) {
  const labels = {
    league: "Liga",
    tournament: "Turnir",
    hybrid: "Liga + nokaut"
  };
  return `${labels[formatType] || formatType}: ${phases.map((phase) => phase.name).join(" -> ")}`;
}

function normalizeCompetition(row) {
  return {
    id: row.id,
    cityId: row.city_id || "",
    cityName: row.city_name || "",
    name: row.name,
    seasonName: row.season_name,
    kind: row.kind,
    status: row.status,
    formatSummary: row.format_summary || "",
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || ""
  };
}

function normalizeFormat(row) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    formatType: row.format_type,
    teamsCount: row.teams_count,
    settings: row.settings || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizePhase(row) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    code: row.code,
    name: row.name,
    type: row.type,
    sequence: row.sequence,
    groupCount: row.group_count,
    teamsPerGroup: row.teams_per_group,
    qualifiersPerGroup: row.qualifiers_per_group,
    bestThirdCount: row.best_third_count,
    legs: row.legs,
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    settings: row.settings || {}
  };
}

function normalizeScheduleSlot(row) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    startsAt: row.starts_at,
    venue: row.venue || "",
    pitch: row.pitch || "",
    label: row.label || "",
    isReserved: row.is_reserved
  };
}

function normalizeTeam(row) {
  return {
    id: row.id,
    competitionId: row.competition_id || "",
    name: row.name,
    shortName: row.short_name || "",
    logoUrl: row.logo_url || "",
    groupName: row.group_name || "",
    placement: row.placement || "",
    isActive: row.is_active,
    sourceTeamId: row.source_team_id || "",
    playersCount: Number(row.players_count || 0)
  };
}

function normalizeMatch(row) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    phaseId: row.phase_id || "",
    phaseCode: row.phase_code || "",
    phaseName: row.phase_name || "",
    phase: row.phase,
    groupName: row.group_name || "",
    round: row.round,
    scheduledAt: row.scheduled_at,
    venue: row.venue || "",
    status: row.status,
    homeTeamId: row.home_team_id || "",
    awayTeamId: row.away_team_id || "",
    homeTeamName: row.home_team_name || "",
    awayTeamName: row.away_team_name || "",
    homeScore: Number(row.home_score || 0),
    awayScore: Number(row.away_score || 0)
  };
}

function normalizeQualifier(row) {
  return {
    teamId: row.team_id,
    teamName: row.team_name || "",
    groupName: row.group_name || "",
    position: row.position,
    points: row.points,
    goalDifference: row.goal_difference
  };
}

async function auditWithClient(client, actor, action, entityType, entityId, metadata) {
  await client.query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function validFormatType(value) {
  const type = String(value || "").trim();
  if (!["league", "tournament", "hybrid"].includes(type)) throw httpError(400, "Format takmicenja nije validan.");
  return type;
}

function validPhaseType(value) {
  const type = String(value || "").trim();
  if (!["league", "group", "knockout", "classification", "third_place"].includes(type)) {
    throw httpError(400, "Tip faze nije validan.");
  }
  return type;
}

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "phase";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
