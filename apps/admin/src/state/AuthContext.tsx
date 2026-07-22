import React, { createContext, useContext, useEffect, useState } from "react";
import { fetchSession, login as loginRequest } from "../api/endpoints";
import { getAuthToken, setAuthToken } from "../api/client";
import type { AuthUser } from "../api/types";

interface AuthContextValue {
  user: AuthUser | null;
  status: "checking" | "signed-out" | "signed-in";
  error: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAuthToken()) {
      setStatus("signed-out");
      return;
    }
    fetchSession()
      .then((sessionUser) => {
        setUser(sessionUser);
        setStatus("signed-in");
      })
      .catch(() => {
        setAuthToken(null);
        setStatus("signed-out");
      });
  }, []);

  async function login(email: string, password: string) {
    setError("");
    try {
      const session = await loginRequest(email, password);
      setAuthToken(session.token);
      setUser(session.user);
      setStatus("signed-in");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prijava nije uspela.");
      throw err;
    }
  }

  function logout() {
    setAuthToken(null);
    setUser(null);
    setStatus("signed-out");
  }

  return (
    <AuthContext.Provider value={{ user, status, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth mora biti unutar AuthProvider");
  return context;
}
