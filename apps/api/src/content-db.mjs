import { query } from "./db.mjs";

const STORY_TTL_MS = 72 * 60 * 60 * 1000;

export async function listPublishedNewsDb() {
  const result = await query(
    `select id, created_at, updated_at, title, body, media_url, media_type, is_published, published_at, created_by_user_id
     from public.news_posts
     where is_published = true
     order by coalesce(published_at, created_at) desc`
  );
  const items = result.rows.map(normalizeNews);
  return { featured: items.slice(0, 5), latest: items.slice(5, 8), all: items };
}

export async function createNewsPostDb(payload, actor) {
  const result = await query(
    `insert into public.news_posts (title, body, media_url, media_type, is_published, published_at, created_by_user_id)
     values ($1, $2, $3, $4, $5, case when $5 then now() else null end, $6)
     returning id, created_at, updated_at, title, body, media_url, media_type, is_published, published_at, created_by_user_id`,
    [
      requiredText(payload.title, "Naslov vesti je obavezan."),
      String(payload.body || payload.copy || "").trim(),
      String(payload.mediaUrl || "").trim(),
      mediaTypeOrNull(payload.mediaType),
      payload.isPublished !== false,
      actor.id
    ]
  );
  await audit(actor, "news.create", "newsPost", result.rows[0].id, { title: result.rows[0].title });
  return normalizeNews(result.rows[0]);
}

export async function updateNewsPostDb(id, payload, actor) {
  const existing = await query("select * from public.news_posts where id = $1", [id]);
  if (!existing.rows[0]) throw httpError(404, "Vest nije pronadjena.");

  const current = existing.rows[0];
  const next = {
    title: payload.title !== undefined ? requiredText(payload.title, "Naslov vesti je obavezan.") : current.title,
    body: payload.body !== undefined || payload.copy !== undefined ? String(payload.body ?? payload.copy ?? "").trim() : current.body,
    mediaUrl: payload.mediaUrl !== undefined ? String(payload.mediaUrl || "").trim() : current.media_url,
    mediaType: payload.mediaType !== undefined ? mediaTypeOrNull(payload.mediaType) : current.media_type,
    isPublished: payload.isPublished !== undefined ? Boolean(payload.isPublished) : current.is_published,
    publishedAt: current.published_at
  };

  const result = await query(
    `update public.news_posts set
       title = $2,
       body = $3,
       media_url = $4,
       media_type = $5,
       is_published = $6,
       published_at = case when $6 and $7::timestamptz is null then now() else $7::timestamptz end,
       updated_at = now()
     where id = $1
     returning id, created_at, updated_at, title, body, media_url, media_type, is_published, published_at, created_by_user_id`,
    [id, next.title, next.body, next.mediaUrl, next.mediaType, next.isPublished, next.publishedAt]
  );
  await audit(actor, "news.update", "newsPost", id, { title: result.rows[0].title });
  return normalizeNews(result.rows[0]);
}

export async function deleteNewsPostDb(id, actor) {
  const result = await query("delete from public.news_posts where id = $1 returning id", [id]);
  if (!result.rows[0]) throw httpError(404, "Vest nije pronadjena.");
  await audit(actor, "news.delete", "newsPost", id, {});
  return { deleted: true };
}

export async function listStoryFoldersDb() {
  const result = await query(
    `select id, created_at, updated_at, title, logo_url, sort_order, is_active
     from public.story_folders
     where is_active = true
     order by sort_order, created_at`
  );
  return result.rows.map(normalizeStoryFolder);
}

export async function listActiveStoriesDb() {
  const result = await query(
    `select
       f.id as folder_id, f.created_at as folder_created_at, f.updated_at as folder_updated_at,
       f.title as folder_title, f.logo_url as folder_logo_url, f.sort_order, f.is_active,
       s.id as story_id, s.created_at as story_created_at, s.updated_at as story_updated_at,
       s.title as story_title, s.media_url, s.media_type, s.expires_at, s.created_by_user_id
     from public.story_folders f
     join public.stories s on s.folder_id = f.id
     where f.is_active = true and s.expires_at > now()
     order by f.sort_order, s.created_at`
  );

  const folders = new Map();
  for (const row of result.rows) {
    if (!folders.has(row.folder_id)) {
      folders.set(row.folder_id, {
        id: row.folder_id,
        createdAt: row.folder_created_at,
        updatedAt: row.folder_updated_at,
        title: row.folder_title,
        logoUrl: row.folder_logo_url || "",
        sortOrder: row.sort_order,
        isActive: row.is_active,
        stories: []
      });
    }
    folders.get(row.folder_id).stories.push(normalizeStory(row));
  }
  return [...folders.values()];
}

export async function createStoryFolderDb(payload, actor) {
  const result = await query(
    `insert into public.story_folders (title, logo_url, sort_order, is_active)
     values ($1, $2, $3, true)
     returning id, created_at, updated_at, title, logo_url, sort_order, is_active`,
    [
      requiredText(payload.title, "Naziv story rubrike je obavezan."),
      String(payload.logoUrl || "").trim(),
      Number(payload.sortOrder || 0)
    ]
  );
  await audit(actor, "storyFolder.create", "storyFolder", result.rows[0].id, { title: result.rows[0].title });
  return normalizeStoryFolder(result.rows[0]);
}

export async function updateStoryFolderDb(id, payload, actor) {
  const existing = await query("select * from public.story_folders where id = $1", [id]);
  if (!existing.rows[0]) throw httpError(404, "Story rubrika nije pronadjena.");

  const current = existing.rows[0];
  const result = await query(
    `update public.story_folders set
       title = $2,
       logo_url = $3,
       sort_order = $4,
       is_active = $5,
       updated_at = now()
     where id = $1
     returning id, created_at, updated_at, title, logo_url, sort_order, is_active`,
    [
      id,
      payload.title !== undefined ? requiredText(payload.title, "Naziv story rubrike je obavezan.") : current.title,
      payload.logoUrl !== undefined ? String(payload.logoUrl || "").trim() : current.logo_url,
      payload.sortOrder !== undefined ? Number(payload.sortOrder || 0) : current.sort_order,
      payload.isActive !== undefined ? Boolean(payload.isActive) : current.is_active
    ]
  );
  await audit(actor, "storyFolder.update", "storyFolder", id, { title: result.rows[0].title });
  return normalizeStoryFolder(result.rows[0]);
}

export async function deleteStoryFolderDb(id, actor) {
  const result = await query(
    `update public.story_folders set is_active = false, updated_at = now()
     where id = $1
     returning id, title`,
    [id]
  );
  if (!result.rows[0]) throw httpError(404, "Story rubrika nije pronadjena.");
  await audit(actor, "storyFolder.delete", "storyFolder", id, { title: result.rows[0].title });
  return { deleted: true };
}

export async function createStoryDb(payload, actor) {
  const folder = await query("select id from public.story_folders where id = $1 and is_active = true", [payload.folderId]);
  if (!folder.rows[0]) throw httpError(404, "Story rubrika nije pronadjena.");

  const result = await query(
    `insert into public.stories (folder_id, title, media_url, media_type, expires_at, created_by_user_id)
     values ($1, $2, $3, $4, $5, $6)
     returning id, created_at, updated_at, folder_id, title, media_url, media_type, expires_at, created_by_user_id`,
    [
      String(payload.folderId),
      String(payload.title || "").trim(),
      requiredText(payload.mediaUrl, "Story mora imati sliku ili video."),
      payload.mediaType === "video" ? "video" : "image",
      payload.expiresAt || new Date(Date.now() + STORY_TTL_MS).toISOString(),
      actor.id
    ]
  );
  await audit(actor, "story.create", "story", result.rows[0].id, { folderId: payload.folderId });
  return normalizeStory(result.rows[0]);
}

export async function deleteStoryDb(id, actor) {
  const result = await query("delete from public.stories where id = $1 returning id", [id]);
  if (!result.rows[0]) throw httpError(404, "Story nije pronadjen.");
  await audit(actor, "story.delete", "story", id, {});
  return { deleted: true };
}

export async function markStoryViewedDb(storyId, user) {
  const story = await query("select id from public.stories where id = $1", [storyId]);
  if (!story.rows[0]) throw httpError(404, "Story nije pronadjen.");
  if (!user?.id) return { anonymous: true, storyId };

  const result = await query(
    `insert into public.story_views (story_id, user_id, viewed_at)
     values ($1, $2, now())
     on conflict (story_id, user_id) do update set viewed_at = now()
     returning id, created_at, story_id, user_id, viewed_at`,
    [storyId, user.id]
  );
  return normalizeStoryView(result.rows[0]);
}

export async function toggleStoryLikeDb(storyId, user) {
  if (!user) throw httpError(401, "Moras biti ulogovan za like.");
  const existing = await query("select id from public.story_likes where story_id = $1 and user_id = $2", [storyId, user.id]);
  if (existing.rows[0]) {
    await query("delete from public.story_likes where id = $1", [existing.rows[0].id]);
    const count = await likeCount(storyId);
    return { liked: false, count };
  }

  await query("insert into public.story_likes (story_id, user_id) values ($1, $2)", [storyId, user.id]);
  const count = await likeCount(storyId);
  return { liked: true, count };
}

export async function getStoryStatsDb(storyId) {
  const views = await query(
    `select v.id, v.created_at, v.story_id, v.user_id, v.viewed_at, p.display_name, p.email
     from public.story_views v
     left join public.profiles p on p.id = v.user_id
     where v.story_id = $1
     order by v.viewed_at desc`,
    [storyId]
  );
  const likes = await query(
    `select l.id, l.created_at, l.story_id, l.user_id, p.display_name, p.email
     from public.story_likes l
     left join public.profiles p on p.id = l.user_id
     where l.story_id = $1
     order by l.created_at desc`,
    [storyId]
  );
  return {
    storyId,
    views: views.rows.map(normalizeStoryView),
    likes: likes.rows.map(normalizeStoryLike)
  };
}

export async function getActiveSponsorDb() {
  const result = await query(
    `select id, created_at, updated_at, title, subtitle, logo_url, target_url, is_active
     from public.sponsors
     where is_active = true
     order by updated_at desc
     limit 1`
  );
  return result.rows[0] ? normalizeSponsor(result.rows[0]) : null;
}

export async function updateSponsorDb(payload, actor) {
  let id = payload.id;
  if (!id) {
    const existing = await query("select id from public.sponsors order by updated_at desc limit 1");
    id = existing.rows[0]?.id;
  }

  const result = id
    ? await query(
        `update public.sponsors set title = $2, subtitle = $3, logo_url = $4, target_url = $5, is_active = $6, updated_at = now()
         where id = $1
         returning id, created_at, updated_at, title, subtitle, logo_url, target_url, is_active`,
        [
          id,
          requiredText(payload.title, "Naslov sponzora je obavezan."),
          String(payload.subtitle || "").trim(),
          String(payload.logoUrl || "").trim(),
          String(payload.targetUrl || "").trim(),
          payload.isActive !== false
        ]
      )
    : await query(
        `insert into public.sponsors (title, subtitle, logo_url, target_url, is_active)
         values ($1, $2, $3, $4, $5)
         returning id, created_at, updated_at, title, subtitle, logo_url, target_url, is_active`,
        [
          requiredText(payload.title, "Naslov sponzora je obavezan."),
          String(payload.subtitle || "").trim(),
          String(payload.logoUrl || "").trim(),
          String(payload.targetUrl || "").trim(),
          payload.isActive !== false
        ]
      );

  await audit(actor, "sponsor.update", "sponsor", result.rows[0].id, { title: result.rows[0].title });
  return normalizeSponsor(result.rows[0]);
}

async function likeCount(storyId) {
  const result = await query("select count(*)::int as count from public.story_likes where story_id = $1", [storyId]);
  return result.rows[0].count;
}

async function audit(actor, action, entityType, entityId, metadata) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function normalizeNews(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    body: row.body || "",
    mediaUrl: row.media_url || "",
    mediaType: row.media_type || "",
    isPublished: row.is_published,
    publishedAt: row.published_at || "",
    createdByUserId: row.created_by_user_id || ""
  };
}

function normalizeStoryFolder(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    logoUrl: row.logo_url || "",
    sortOrder: row.sort_order,
    isActive: row.is_active
  };
}

function normalizeStory(row) {
  return {
    id: row.story_id || row.id,
    createdAt: row.story_created_at || row.created_at,
    updatedAt: row.story_updated_at || row.updated_at,
    folderId: row.folder_id,
    title: row.story_title ?? row.title ?? "",
    mediaUrl: row.media_url || "",
    mediaType: row.media_type || "",
    expiresAt: row.expires_at,
    createdByUserId: row.created_by_user_id || ""
  };
}

function normalizeStoryView(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    storyId: row.story_id,
    userId: row.user_id,
    viewedAt: row.viewed_at,
    displayName: row.display_name || "",
    email: row.email || ""
  };
}

function normalizeStoryLike(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    storyId: row.story_id,
    userId: row.user_id,
    displayName: row.display_name || "",
    email: row.email || ""
  };
}

function normalizeSponsor(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    subtitle: row.subtitle || "",
    logoUrl: row.logo_url || "",
    targetUrl: row.target_url || "",
    isActive: row.is_active
  };
}

function mediaTypeOrNull(value) {
  return ["image", "video", "youtube", "link"].includes(value) ? value : null;
}

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
