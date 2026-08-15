import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Real, shipped-app safety net: EXPO_PUBLIC_API_BASE_URL is meant to always be set (via
// apps/mobile/.env for local dev, via EAS environment variables for cloud builds - see
// `eas env:list`), but if it's ever missing for any reason (misconfigured build,
// forgotten env var on a new EAS project, etc.), falling back to the device's own
// loopback address is a guaranteed-broken app for every single real install - nothing
// ever listens on 127.0.0.1 on a phone. Falling back to the real production API instead
// means a misconfigured build still works, rather than failing "network request failed"
// for 100% of everyone who installs it. (Local dev always has its own explicit .env
// override, so this fallback only ever applies when nothing else set it - i.e. exactly
// the scenario that broke the first internal testing build.)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://tribali-liga.onrender.com";
const TOKEN_KEY = "uf_mobile_token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;

// expo-secure-store has no real web implementation (its web module is an empty
// stub), so every call rejects there. Native (iOS/Android) always uses the
// real Keychain/Keystore-backed SecureStore; web falls back to localStorage
// purely so this app is also usable via `expo start --web` for testing.
async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return window.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function storageDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function loadStoredToken(): Promise<string | null> {
  try {
    authToken = await storageGet(TOKEN_KEY);
  } catch {
    authToken = null;
  }
  return authToken;
}

export async function setAuthToken(token: string | null) {
  authToken = token;
  try {
    if (token) await storageSet(TOKEN_KEY, token);
    else await storageDelete(TOKEN_KEY);
  } catch {
    // best-effort persistence - in-memory authToken is already updated either way
  }
}

export function getAuthToken() {
  return authToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const envelope = await response.json().catch(() => null);

  if (!response.ok || !envelope || envelope.ok === false) {
    throw new ApiError(response.status, envelope?.error || "Zahtev nije uspeo.");
  }

  return envelope.data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) });
}
