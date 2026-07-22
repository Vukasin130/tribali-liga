import { randomUUID } from "node:crypto";
import { hasDatabase } from "./db.mjs";
import {
  createNewsPostDb,
  createStoryDb,
  createStoryFolderDb,
  deleteNewsPostDb,
  deleteStoryDb,
  deleteStoryFolderDb,
  getActiveSponsorDb,
  getStoryStatsDb,
  listActiveStoriesDb,
  listPublishedNewsDb,
  listStoryFoldersDb,
  markStoryViewedDb,
  toggleStoryLikeDb,
  updateNewsPostDb,
  updateSponsorDb,
  updateStoryFolderDb
} from "./content-db.mjs";
import { mutateDatabase, timestamp } from "./store.mjs";

const STORY_TTL_MS = 72 * 60 * 60 * 1000;

export async function listPublishedNews() {
  if (hasDatabase()) return listPublishedNewsDb();
  return mutateDatabase((db) => {
    const items = db.newsPosts
      .filter((item) => item.isPublished !== false)
      .sort((a, b) => getTime(b.publishedAt || b.createdAt) - getTime(a.publishedAt || a.createdAt));
    return { featured: items.slice(0, 5), latest: items.slice(5, 8), all: items };
  });
}

export async function createNewsPost(payload, actor) {
  if (hasDatabase()) return createNewsPostDb(payload, actor);
  return mutateDatabase((db) => {
    const item = {
      id: randomUUID(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      title: requiredText(payload.title, "Naslov vesti je obavezan."),
      body: String(payload.body || payload.copy || "").trim(),
      mediaUrl: String(payload.mediaUrl || "").trim(),
      mediaType: String(payload.mediaType || "").trim(),
      isPublished: payload.isPublished !== false,
      publishedAt: payload.isPublished === false ? "" : timestamp(),
      createdByUserId: actor.id
    };
    db.newsPosts.unshift(item);
    audit(db, actor, "news.create", "newsPost", item.id, { title: item.title });
    return item;
  });
}

export async function updateNewsPost(id, payload, actor) {
  if (hasDatabase()) return updateNewsPostDb(id, payload, actor);
  return mutateDatabase((db) => {
    const item = findById(db.newsPosts, id, "Vest nije pronadjena.");
    if (payload.title !== undefined) item.title = requiredText(payload.title, "Naslov vesti je obavezan.");
    if (payload.body !== undefined || payload.copy !== undefined) item.body = String(payload.body ?? payload.copy ?? "").trim();
    if (payload.mediaUrl !== undefined) item.mediaUrl = String(payload.mediaUrl || "").trim();
    if (payload.mediaType !== undefined) item.mediaType = String(payload.mediaType || "").trim();
    if (payload.isPublished !== undefined) {
      item.isPublished = Boolean(payload.isPublished);
      if (item.isPublished && !item.publishedAt) item.publishedAt = timestamp();
    }
    item.updatedAt = timestamp();
    audit(db, actor, "news.update", "newsPost", item.id, { title: item.title });
    return item;
  });
}

export async function deleteNewsPost(id, actor) {
  if (hasDatabase()) return deleteNewsPostDb(id, actor);
  return mutateDatabase((db) => {
    const before = db.newsPosts.length;
    db.newsPosts = db.newsPosts.filter((item) => item.id !== id);
    if (before === db.newsPosts.length) throw httpError(404, "Vest nije pronadjena.");
    audit(db, actor, "news.delete", "newsPost", id, {});
    return { deleted: true };
  });
}

export async function listStoryFolders() {
  if (hasDatabase()) return listStoryFoldersDb();
  return mutateDatabase((db) => db.storyFolders
    .filter((folder) => folder.isActive !== false)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)));
}

export async function listActiveStories() {
  if (hasDatabase()) return listActiveStoriesDb();
  return mutateDatabase((db) => {
    const nowMs = Date.now();
    const folders = db.storyFolders
      .filter((folder) => folder.isActive !== false)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    const stories = db.stories
      .filter((story) => getTime(story.expiresAt) > nowMs)
      .sort((a, b) => getTime(a.createdAt) - getTime(b.createdAt));
    return folders
      .map((folder) => ({
        ...folder,
        stories: stories.filter((story) => story.folderId === folder.id)
      }))
      .filter((folder) => folder.stories.length > 0);
  });
}

export async function createStoryFolder(payload, actor) {
  if (hasDatabase()) return createStoryFolderDb(payload, actor);
  return mutateDatabase((db) => {
    const item = {
      id: slugId("story", payload.title),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      title: requiredText(payload.title, "Naziv story rubrike je obavezan."),
      logoUrl: String(payload.logoUrl || "").trim(),
      sortOrder: Number(payload.sortOrder || db.storyFolders.length + 1),
      isActive: true
    };
    if (db.storyFolders.some((folder) => folder.id === item.id)) item.id = randomUUID();
    db.storyFolders.push(item);
    audit(db, actor, "storyFolder.create", "storyFolder", item.id, { title: item.title });
    return item;
  });
}

export async function updateStoryFolder(id, payload, actor) {
  if (hasDatabase()) return updateStoryFolderDb(id, payload, actor);
  return mutateDatabase((db) => {
    const item = findById(db.storyFolders, id, "Story rubrika nije pronadjena.");
    if (payload.title !== undefined) item.title = requiredText(payload.title, "Naziv story rubrike je obavezan.");
    if (payload.logoUrl !== undefined) item.logoUrl = String(payload.logoUrl || "").trim();
    if (payload.sortOrder !== undefined) item.sortOrder = Number(payload.sortOrder || 0);
    if (payload.isActive !== undefined) item.isActive = Boolean(payload.isActive);
    item.updatedAt = timestamp();
    audit(db, actor, "storyFolder.update", "storyFolder", item.id, { title: item.title });
    return item;
  });
}

export async function deleteStoryFolder(id, actor) {
  if (hasDatabase()) return deleteStoryFolderDb(id, actor);
  return mutateDatabase((db) => {
    const item = findById(db.storyFolders, id, "Story rubrika nije pronadjena.");
    item.isActive = false;
    item.updatedAt = timestamp();
    audit(db, actor, "storyFolder.delete", "storyFolder", item.id, { title: item.title });
    return { deleted: true };
  });
}

export async function createStory(payload, actor) {
  if (hasDatabase()) return createStoryDb(payload, actor);
  return mutateDatabase((db) => {
    findById(db.storyFolders, payload.folderId, "Story rubrika nije pronadjena.");
    const createdAt = timestamp();
    const item = {
      id: randomUUID(),
      createdAt,
      updatedAt: createdAt,
      folderId: String(payload.folderId),
      title: String(payload.title || "").trim(),
      mediaUrl: requiredText(payload.mediaUrl, "Story mora imati sliku ili video."),
      mediaType: payload.mediaType === "video" ? "video" : "image",
      expiresAt: payload.expiresAt || new Date(Date.now() + STORY_TTL_MS).toISOString(),
      createdByUserId: actor.id
    };
    db.stories.unshift(item);
    audit(db, actor, "story.create", "story", item.id, { folderId: item.folderId });
    return item;
  });
}

export async function deleteStory(id, actor) {
  if (hasDatabase()) return deleteStoryDb(id, actor);
  return mutateDatabase((db) => {
    const before = db.stories.length;
    db.stories = db.stories.filter((story) => story.id !== id);
    if (before === db.stories.length) throw httpError(404, "Story nije pronadjen.");
    audit(db, actor, "story.delete", "story", id, {});
    return { deleted: true };
  });
}

export async function markStoryViewed(storyId, user) {
  if (hasDatabase()) return markStoryViewedDb(storyId, user);
  return mutateDatabase((db) => {
    findById(db.stories, storyId, "Story nije pronadjen.");
    const userId = user?.id || "anonymous";
    const existing = db.storyViews.find((view) => view.storyId === storyId && view.userId === userId);
    if (existing) {
      existing.viewedAt = timestamp();
      existing.updatedAt = timestamp();
      return existing;
    }
    const item = { id: randomUUID(), createdAt: timestamp(), updatedAt: timestamp(), storyId, userId, viewedAt: timestamp() };
    db.storyViews.push(item);
    return item;
  });
}

export async function toggleStoryLike(storyId, user) {
  if (hasDatabase()) return toggleStoryLikeDb(storyId, user);
  if (!user) throw httpError(401, "Moras biti ulogovan za like.");
  return mutateDatabase((db) => {
    findById(db.stories, storyId, "Story nije pronadjen.");
    const existingIndex = db.storyLikes.findIndex((like) => like.storyId === storyId && like.userId === user.id);
    if (existingIndex >= 0) {
      db.storyLikes.splice(existingIndex, 1);
      return { liked: false, count: db.storyLikes.filter((like) => like.storyId === storyId).length };
    }
    db.storyLikes.push({ id: randomUUID(), createdAt: timestamp(), updatedAt: timestamp(), storyId, userId: user.id });
    return { liked: true, count: db.storyLikes.filter((like) => like.storyId === storyId).length };
  });
}

export async function getStoryStats(storyId) {
  if (hasDatabase()) return getStoryStatsDb(storyId);
  return mutateDatabase((db) => ({
    storyId,
    views: db.storyViews.filter((view) => view.storyId === storyId),
    likes: db.storyLikes.filter((like) => like.storyId === storyId)
  }));
}

export async function getActiveSponsor() {
  if (hasDatabase()) return getActiveSponsorDb();
  return mutateDatabase((db) => db.sponsors.find((item) => item.isActive !== false) || null);
}

export async function updateSponsor(payload, actor) {
  if (hasDatabase()) return updateSponsorDb(payload, actor);
  return mutateDatabase((db) => {
    let item = db.sponsors.find((sponsor) => sponsor.id === (payload.id || "sponsor-weekly"));
    if (!item) {
      item = { id: payload.id || "sponsor-weekly", createdAt: timestamp(), updatedAt: timestamp() };
      db.sponsors.push(item);
    }
    item.title = requiredText(payload.title, "Naslov sponzora je obavezan.");
    item.subtitle = String(payload.subtitle || "").trim();
    item.logoUrl = String(payload.logoUrl || "").trim();
    item.isActive = payload.isActive !== false;
    item.updatedAt = timestamp();
    audit(db, actor, "sponsor.update", "sponsor", item.id, { title: item.title });
    return item;
  });
}

function findById(items, id, message) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw httpError(404, message);
  return item;
}

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

function audit(db, actor, action, entityType, entityId, metadata) {
  db.auditLogs.push({
    id: randomUUID(),
    createdAt: timestamp(),
    updatedAt: timestamp(),
    actorUserId: actor.id,
    action,
    entityType,
    entityId,
    metadata
  });
}

function getTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function slugId(prefix, value) {
  const slug = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${slug || randomUUID()}`;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
