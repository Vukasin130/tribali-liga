import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.UFL_DATA_FILE || resolve(__dirname, "../storage/dev-db.json");

const emptyDatabase = () => ({
  users: [],
  cities: [],
  competitions: [],
  teams: [],
  players: [],
  matches: [],
  matchLineups: [],
  matchEvents: [],
  playerMatchStats: [],
  fantasyTeams: [],
  fantasyTeamPicks: [],
  newsPosts: [],
  storyFolders: [],
  stories: [],
  storyViews: [],
  storyLikes: [],
  mediaLinks: [],
  sponsors: [],
  goalPolls: [],
  goalVotes: [],
  sessions: [],
  verificationRequests: [],
  auditLogs: []
});

export const collections = Object.freeze(Object.keys(emptyDatabase()));

const now = () => new Date().toISOString();

export async function readDatabase() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    return { ...emptyDatabase(), ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const db = seedDatabase();
    await writeDatabase(db);
    return db;
  }
}

export async function writeDatabase(db) {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await rename(tmp, DATA_FILE);
}

export async function list(collection) {
  ensureCollection(collection);
  const db = await readDatabase();
  return db[collection];
}

export async function get(collection, id) {
  ensureCollection(collection);
  const db = await readDatabase();
  return db[collection].find((item) => item.id === id) || null;
}

export async function create(collection, payload) {
  ensureCollection(collection);
  const db = await readDatabase();
  const item = {
    id: randomUUID(),
    createdAt: now(),
    updatedAt: now(),
    ...payload
  };
  db[collection].push(item);
  await writeDatabase(db);
  return item;
}

export async function update(collection, id, patch) {
  ensureCollection(collection);
  const db = await readDatabase();
  const index = db[collection].findIndex((item) => item.id === id);
  if (index === -1) return null;
  db[collection][index] = {
    ...db[collection][index],
    ...patch,
    id,
    updatedAt: now()
  };
  await writeDatabase(db);
  return db[collection][index];
}

export async function remove(collection, id) {
  ensureCollection(collection);
  const db = await readDatabase();
  const before = db[collection].length;
  db[collection] = db[collection].filter((item) => item.id !== id);
  await writeDatabase(db);
  return db[collection].length !== before;
}

export async function mutateDatabase(mutator) {
  const db = await readDatabase();
  const result = await mutator(db);
  await writeDatabase(db);
  return result;
}

export function timestamp() {
  return now();
}

function ensureCollection(collection) {
  if (!collections.includes(collection)) {
    const allowed = collections.join(", ");
    const error = new Error(`Unknown collection "${collection}". Allowed: ${allowed}`);
    error.statusCode = 404;
    throw error;
  }
}

function seedDatabase() {
  const timestamp = now();
  const cityId = "city-novi-sad";
  const competitionId = "competition-novo-naselje-s2";
  const adminId = "user-admin";

  return {
    ...emptyDatabase(),
    users: [
      {
        id: adminId,
        createdAt: timestamp,
        updatedAt: timestamp,
        email: "admin@urbanfantasy.rs",
        displayName: "Tribali Liga Admin",
        role: "admin",
        verificationStatus: "approved",
        passwordHash: "",
        passwordSalt: "",
        passwordUpdatedAt: ""
      }
    ],
    cities: [
      {
        id: cityId,
        createdAt: timestamp,
        updatedAt: timestamp,
        name: "Novi Sad",
        slug: "novi-sad",
        isActive: true
      }
    ],
    competitions: [
      {
        id: competitionId,
        createdAt: timestamp,
        updatedAt: timestamp,
        cityId,
        name: "Liga Novo naselje",
        seasonName: "Sezona 2",
        status: "draft"
      }
    ],
    storyFolders: [
      { id: "story-novi-sad", createdAt: timestamp, updatedAt: timestamp, title: "Novi Sad", sortOrder: 1, isActive: true },
      { id: "story-zrenjanin", createdAt: timestamp, updatedAt: timestamp, title: "Zrenjanin", sortOrder: 2, isActive: true },
      { id: "story-gameweek", createdAt: timestamp, updatedAt: timestamp, title: "Gameweek", sortOrder: 3, isActive: true }
    ],
    newsPosts: [
      {
        id: "news-season-start",
        createdAt: timestamp,
        updatedAt: timestamp,
        title: "Fantasy sezona krece u tri grada",
        body: "Novi Sad, Beograd i treci grad ulaze u zajednicki fantasy sistem.",
        mediaUrl: "",
        mediaType: "",
        isPublished: true,
        publishedAt: timestamp
      },
      {
        id: "news-gameweek-preview",
        createdAt: timestamp,
        updatedAt: timestamp,
        title: "Najava kola: Toki Boki brani prvo mesto",
        body: "Najvazniji mecevi i igraci koje treba pratiti ovog vikenda.",
        mediaUrl: "",
        mediaType: "",
        isPublished: true,
        publishedAt: timestamp
      }
    ],
    sponsors: [
      {
        id: "sponsor-weekly",
        createdAt: timestamp,
        updatedAt: timestamp,
        title: "Sportski centar Arena nagradjuje MVP vikenda",
        subtitle: "Kupon za termine i opremu za najbolje igrace.",
        logoUrl: "",
        isActive: true
      }
    ],
    matches: [
      {
        id: "match-demo-final",
        createdAt: timestamp,
        updatedAt: timestamp,
        competitionId,
        homeTeamId: "team-pizzdarija",
        awayTeamId: "team-beton-united",
        phase: "round_of_16",
        scheduledAt: "2026-04-27T18:00:00.000Z",
        venue: "Novo naselje",
        status: "finished",
        homeScore: 5,
        awayScore: 3,
        videoUrl: ""
      }
    ],
    teams: [
      { id: "team-pizzdarija", createdAt: timestamp, updatedAt: timestamp, competitionId, name: "Pizzdarija", shortName: "P", isActive: true },
      { id: "team-beton-united", createdAt: timestamp, updatedAt: timestamp, competitionId, name: "Beton United", shortName: "BU", isActive: true }
    ]
  };
}
