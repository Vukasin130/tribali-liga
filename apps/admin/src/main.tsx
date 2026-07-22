import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AuthProvider, useAuth } from "./state/AuthContext";
import { Login } from "./screens/Login";
import { AdminPortal } from "./screens/AdminPortal";
import { TeamsPlayersAdmin } from "./screens/TeamsPlayersAdmin";
import { ImportAdmin } from "./screens/ImportAdmin";
import { LiveAdmin } from "./screens/LiveAdmin";
import { ContentAdmin } from "./screens/ContentAdmin";
import { LeaguesAdmin } from "./screens/LeaguesAdmin";
import { VerificationsAdmin } from "./screens/VerificationsAdmin";
import { FantasySeasonsAdmin } from "./screens/FantasySeasonsAdmin";
import { Spinner } from "./components/shared";

type AdminSection = "dashboard" | "teams" | "import" | "live" | "content" | "leagues" | "verifications" | "fantasySeasons";

function AdminApp() {
  const [adminSection, setAdminSection] = useState<AdminSection>("dashboard");

  return (
    <main className="workspace-shell">
      <section className="workspace-top">
        <div>
          <p className="eyebrow">Tribali Liga</p>
          <h1>Admin portal</h1>
          <p>Ovo vidi administrator: uredjivanje sadrzaja, lige, ekipe, igraci, sponzori i live utakmice.</p>
        </div>
      </section>

      {adminSection === "dashboard" ? (
        <AdminPortal
          onOpenTeams={() => setAdminSection("teams")}
          onOpenImport={() => setAdminSection("import")}
          onOpenLive={() => setAdminSection("live")}
          onOpenContent={() => setAdminSection("content")}
          onOpenLeagues={() => setAdminSection("leagues")}
          onOpenVerifications={() => setAdminSection("verifications")}
          onOpenFantasySeasons={() => setAdminSection("fantasySeasons")}
        />
      ) : adminSection === "fantasySeasons" ? (
        <FantasySeasonsAdmin onBack={() => setAdminSection("dashboard")} />
      ) : adminSection === "teams" ? (
        <TeamsPlayersAdmin onBack={() => setAdminSection("dashboard")} />
      ) : adminSection === "import" ? (
        <ImportAdmin onBack={() => setAdminSection("dashboard")} />
      ) : adminSection === "content" ? (
        <ContentAdmin onBack={() => setAdminSection("dashboard")} />
      ) : adminSection === "leagues" ? (
        <LeaguesAdmin onBack={() => setAdminSection("dashboard")} />
      ) : adminSection === "verifications" ? (
        <VerificationsAdmin onBack={() => setAdminSection("dashboard")} />
      ) : (
        <LiveAdmin onBack={() => setAdminSection("dashboard")} />
      )}
    </main>
  );
}

function Root() {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <main className="login-shell">
        <Spinner label="Proveravam prijavu..." />
      </main>
    );
  }

  if (status === "signed-out") {
    return <Login />;
  }

  return <AdminApp />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <AuthProvider>
    <Root />
  </AuthProvider>
);
