import React, { createContext, useContext, useEffect, useState } from "react";
import { getAuthToken, loadStoredToken, setAuthToken } from "../api/client";
import { fetchSession, login as loginRequest, register as registerRequest, registerPushToken } from "../api/endpoints";
import { registerForPushNotificationsAsync } from "../notifications";
import type { AuthUser } from "../api/types";

interface AuthContextValue {
  user: AuthUser | null;
  status: "checking" | "signed-out" | "signed-in";
  error: string;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; password: string; displayName: string; roleIntent?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await loadStoredToken();
        if (!token) {
          setStatus("signed-out");
          return;
        }
        const sessionUser = await fetchSession();
        setUser(sessionUser);
        setStatus("signed-in");
      } catch {
        await setAuthToken(null);
        setStatus("signed-out");
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    setError("");
    try {
      const session = await loginRequest(email, password);
      await setAuthToken(session.token);
      setUser(session.user);
      setStatus("signed-in");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prijava nije uspela.");
      throw err;
    }
  }

  async function register(payload: { email: string; password: string; displayName: string; roleIntent?: string }) {
    setError("");
    try {
      await registerRequest(payload);
      await login(payload.email, payload.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registracija nije uspela.");
      throw err;
    }
  }

  async function logout() {
    await setAuthToken(null);
    setUser(null);
    setStatus("signed-out");
  }

  function refreshUser(nextUser: AuthUser) {
    setUser(nextUser);
  }

  useEffect(() => {
    if (status !== "signed-in") return;
    registerForPushNotificationsAsync()
      .then((token) => (token ? registerPushToken(token) : undefined))
      .catch(() => undefined);
  }, [status]);

  return (
    <AuthContext.Provider value={{ user, status, error, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth mora biti unutar AuthProvider");
  return context;
}

export { getAuthToken };
