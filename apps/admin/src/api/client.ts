const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://127.0.0.1:8787";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = localStorage.getItem("uf_admin_token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("uf_admin_token", token);
  else localStorage.removeItem("uf_admin_token");
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

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
