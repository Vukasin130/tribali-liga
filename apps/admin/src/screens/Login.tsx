import React, { useState } from "react";
import { useAuth } from "../state/AuthContext";

export function Login() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      // error is surfaced via useAuth().error
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Tribali Liga</p>
        <h1>Admin prijava</h1>
        <p className="login-sub">Uloguj se admin nalogom da bi upravljao ligama, ekipama i live utakmicama.</p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@urbanfantasy.rs"
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span>Lozinka</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Prijava u toku..." : "Prijavi se"}
        </button>
      </form>
    </main>
  );
}
