import { query, transaction } from "./db.mjs";

export async function getOwnProfile(user) {
  if (!user) throw httpError(401, "Moras biti ulogovan.");
  const result = await query(
    `select p.id, p.created_at, p.updated_at, p.email, p.display_name, p.avatar_url,
            p.role, p.verification_status, p.verified_player_id,
            pl.display_name as verified_player_name,
            t.id as team_id, t.name as team_name
     from public.profiles p
     left join public.players pl on pl.id = p.verified_player_id
     left join public.teams t on t.id = pl.team_id
     where p.id = $1
     limit 1`,
    [user.id]
  );
  if (!result.rows[0]) throw httpError(404, "Profil nije pronadjen.");
  return normalizeProfile(result.rows[0]);
}

export async function updateOwnProfile(payload, user) {
  if (!user) throw httpError(401, "Moras biti ulogovan.");
  const current = await query("select * from public.profiles where id = $1", [user.id]);
  if (!current.rows[0]) throw httpError(404, "Profil nije pronadjen.");

  const row = current.rows[0];
  const result = await query(
    `update public.profiles set
       display_name = $2,
       avatar_url = $3,
       updated_at = now()
     where id = $1
     returning id, created_at, updated_at, email, display_name, avatar_url,
               role, verification_status, verified_player_id`,
    [
      user.id,
      payload.displayName !== undefined ? requiredText(payload.displayName, "Ime je obavezno.") : row.display_name,
      payload.avatarUrl !== undefined ? String(payload.avatarUrl || "").trim() : row.avatar_url
    ]
  );
  await audit(user, "profile.update", "profile", user.id, {});
  return normalizeProfile(result.rows[0]);
}

export async function listMyVerificationRequests(user) {
  if (!user) throw httpError(401, "Moras biti ulogovan.");
  const result = await query(
    `select vr.*, c.name as city_name, t.name as team_name, p.display_name as matched_player_name
     from public.verification_requests vr
     left join public.cities c on c.id = vr.city_id
     left join public.teams t on t.id = vr.team_id
     left join public.players p on p.id = vr.player_id
     where vr.user_id = $1
     order by vr.created_at desc`,
    [user.id]
  );
  return result.rows.map(normalizeVerificationRequest);
}

export async function createVerificationRequest(payload, user) {
  if (!user) throw httpError(401, "Moras biti ulogovan.");

  const active = await query(
    `select id from public.verification_requests
     where user_id = $1 and status = 'pending'
     limit 1`,
    [user.id]
  );
  if (active.rows[0]) throw httpError(409, "Vec imas zahtev za verifikaciju koji ceka admina.");

  const result = await query(
    `insert into public.verification_requests (user_id, city_id, team_id, player_id, player_name, status)
     values ($1, $2, $3, $4, $5, 'pending')
     returning *`,
    [
      user.id,
      optionalUuid(payload.cityId),
      optionalUuid(payload.teamId),
      optionalUuid(payload.playerId),
      requiredText(payload.playerName || user.displayName, "Ime igraca je obavezno.")
    ]
  );
  await query(
    `update public.profiles set verification_status = 'pending', updated_at = now()
     where id = $1`,
    [user.id]
  );
  await audit(user, "verification.request", "verificationRequest", result.rows[0].id, {});
  return normalizeVerificationRequest(result.rows[0]);
}

export async function listVerificationRequests(filters = {}) {
  const params = [];
  const where = [];
  if (filters.status) {
    params.push(filters.status);
    where.push(`vr.status = $${params.length}`);
  }

  const result = await query(
    `select vr.*, pr.email, pr.display_name, pr.avatar_url,
            c.name as city_name, t.name as team_name, p.display_name as matched_player_name
     from public.verification_requests vr
     left join public.profiles pr on pr.id = vr.user_id
     left join public.cities c on c.id = vr.city_id
     left join public.teams t on t.id = vr.team_id
     left join public.players p on p.id = vr.player_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by case when vr.status = 'pending' then 0 else 1 end, vr.created_at desc`,
    params
  );
  return result.rows.map(normalizeVerificationRequest);
}

export async function reviewVerificationRequest(id, payload, actor) {
  const status = String(payload.status || "").trim();
  if (!["approved", "rejected"].includes(status)) {
    throw httpError(400, "Status mora biti approved ili rejected.");
  }

  const result = await transaction(async (client) => {
    const current = await client.query(
      `select *
       from public.verification_requests
       where id = $1
       for update`,
      [id]
    );
    const request = current.rows[0];
    if (!request) throw httpError(404, "Zahtev za verifikaciju nije pronadjen.");

    const playerId = status === "approved"
      ? optionalUuid(payload.playerId || request.player_id)
      : optionalUuid(payload.playerId || request.player_id);

    if (status === "approved" && !playerId) {
      throw httpError(400, "Za odobravanje mora biti izabran stvarni igrac iz baze.");
    }

    if (playerId) {
      const player = await client.query("select id, team_id from public.players where id = $1", [playerId]);
      if (!player.rows[0]) throw httpError(404, "Izabrani igrac nije pronadjen.");
      request.team_id = payload.teamId ? optionalUuid(payload.teamId) : player.rows[0].team_id;
      request.player_id = playerId;
    }

    const updatedRequest = await client.query(
      `update public.verification_requests set
         status = $2,
         player_id = $3,
         team_id = $4,
         admin_note = $5,
         updated_at = now()
       where id = $1
       returning *`,
      [
        id,
        status,
        request.player_id || null,
        payload.teamId !== undefined ? optionalUuid(payload.teamId) : request.team_id || null,
        String(payload.adminNote || "").trim()
      ]
    );

    await client.query(
      `update public.profiles set
         role = $2,
         verification_status = $3,
         verified_player_id = $4,
         updated_at = now()
       where id = $1`,
      [
        request.user_id,
        status === "approved" ? "verified_player" : "fan",
        status,
        status === "approved" ? request.player_id : null
      ]
    );

    await client.query(
      `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'verificationRequest', $3, $4::jsonb)`,
      [
        actor?.id || null,
        status === "approved" ? "verification.approve" : "verification.reject",
        id,
        JSON.stringify({ userId: request.user_id, playerId: request.player_id || null })
      ]
    );

    return updatedRequest.rows[0];
  });

  return normalizeVerificationRequest(result);
}

export async function getProfileArchive(user) {
  if (!user) throw httpError(401, "Moras biti ulogovan.");
  const [stories, news] = await Promise.all([
    query(
      `select s.id, s.created_at, s.updated_at, s.folder_id, s.title, s.media_url, s.media_type, s.expires_at,
              f.title as folder_title
       from public.stories s
       left join public.story_folders f on f.id = s.folder_id
       where s.created_by_user_id = $1 and s.expires_at <= now()
       order by s.expires_at desc`,
      [user.id]
    ),
    query(
      `select id, created_at, updated_at, title, body, media_url, media_type, is_published, published_at
       from public.news_posts
       where created_by_user_id = $1
       order by coalesce(published_at, created_at) desc`,
      [user.id]
    )
  ]);

  return {
    expiredStories: stories.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      folderId: row.folder_id,
      folderTitle: row.folder_title || "",
      title: row.title || "",
      mediaUrl: row.media_url || "",
      mediaType: row.media_type || "",
      expiresAt: row.expires_at
    })),
    news: news.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      title: row.title,
      body: row.body || "",
      mediaUrl: row.media_url || "",
      mediaType: row.media_type || "",
      isPublished: row.is_published,
      publishedAt: row.published_at || ""
    }))
  };
}

function normalizeProfile(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url || "",
    role: row.role,
    verificationStatus: row.verification_status,
    verifiedPlayerId: row.verified_player_id || "",
    verifiedPlayerName: row.verified_player_name || "",
    teamId: row.team_id || "",
    teamName: row.team_name || ""
  };
}

function normalizeVerificationRequest(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    email: row.email || "",
    displayName: row.display_name || "",
    avatarUrl: row.avatar_url || "",
    cityId: row.city_id || "",
    cityName: row.city_name || "",
    teamId: row.team_id || "",
    teamName: row.team_name || "",
    playerId: row.player_id || "",
    playerName: row.player_name || "",
    matchedPlayerName: row.matched_player_name || "",
    status: row.status,
    adminNote: row.admin_note || ""
  };
}

async function audit(actor, action, entityType, entityId, metadata) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

function optionalUuid(value) {
  const text = String(value || "").trim();
  return text || null;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
