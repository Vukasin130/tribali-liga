import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getPool, hasDatabase } from "./db.ts";

let prismaClient: PrismaClient | null = null;

export function hasPrismaDatabase(): boolean {
  return hasDatabase();
}

export function getPrismaClient(): PrismaClient | null {
  const pool = getPool();
  if (!pool) return null;
  if (!prismaClient) {
    prismaClient = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  return prismaClient;
}
