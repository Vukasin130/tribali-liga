import { httpError } from "./errors.ts";

export function requiredText(value: unknown, message: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

export function optionalUuid(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}
