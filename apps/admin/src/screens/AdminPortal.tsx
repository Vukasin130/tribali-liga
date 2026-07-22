import React from "react";
import { useAuth } from "../state/AuthContext";

export function AdminPortal({
  onOpenTeams,
  onOpenImport,
  onOpenLive,
  onOpenContent,
  onOpenLeagues,
  onOpenVerifications,
  onOpenFantasySeasons
}: {
  onOpenTeams: () => void;
  onOpenImport: () => void;
  onOpenLive: () => void;
  onOpenContent: () => void;
  onOpenLeagues: () => void;
  onOpenVerifications: () => void;
  onOpenFantasySeasons: () => void;
}) {
  const { user, logout } = useAuth();

  const adminCards = [
    {
      title: "Import sa sajta",
      text: "Pregled istorije uvoza postojece WordPress baze u novu aplikaciju.",
      meta: "WP -> app",
      action: onOpenImport
    },
    {
      title: "News & stories",
      text: "Dodavanje vesti, story krugova, ankete za gol nedelje i sponzorskih objava.",
      meta: "povezano na API",
      action: onOpenContent
    },
    {
      title: "Lige i sezone",
      text: "Novi Sad, Zrenjanin i ostali gradovi, aktivne sezone, kola i raspored.",
      meta: "povezano na API",
      action: onOpenLeagues
    },
    {
      title: "Ekipe i igraci",
      text: "Dodavanje timova, igraca, cena, fotografija, verifikacija pravih ucesnika lige.",
      meta: "povezano na API",
      action: onOpenTeams
    },
    {
      title: "Verifikacija igraca",
      text: "Zahtevi korisnika da budu povezani sa pravim igracima iz baze.",
      meta: "povezano na API",
      action: onOpenVerifications
    },
    {
      title: "Fantasy sezone",
      text: "Sezona koja obuhvata vise liga/gradova odjednom, zajednicki bazen igraca, kola i cene po formi (0,1 CR po poenu razlike).",
      meta: "100 CR budzet",
      action: onOpenFantasySeasons
    },
    {
      title: "Sponzori i nagrade",
      text: "Top 5 kolo, Top 15 sezona, robne nagrade i pozicije za reklame u aplikaciji.",
      meta: "reward inventory"
    }
  ];

  return (
    <section className="admin-portal">
      <div className="admin-hero">
        <div>
          <p className="eyebrow">Admin komandni centar</p>
          <h2>Upravljanje celom ligom iz jednog mesta</h2>
          <p>Prijavljen kao <strong>{user?.displayName ?? user?.email}</strong>. Admin ne ulazi u korisnicku aplikaciju, nego u poseban sistem napravljen za brz rad pre, tokom i posle utakmice.</p>
        </div>
        <div className="admin-hero-actions">
          <button className="primary" onClick={onOpenLive}>Pokreni live utakmicu</button>
          <button className="ghost" onClick={logout}>Odjava</button>
        </div>
      </div>

      <div className="admin-card-grid">
        {adminCards.map((card) => (
          <article className="admin-card" key={card.title}>
            <span>{card.meta}</span>
            <h3>{card.title}</h3>
            <p>{card.text}</p>
            {card.action ? <button onClick={card.action}>Otvori modul</button> : <button disabled>Uskoro</button>}
          </article>
        ))}
        <article className="admin-card live-card">
          <span>matchday</span>
          <h3>Live utakmice</h3>
          <p>Roster, startnih 4+golman, izmene, gol-asistencija, sut-odbrana, kartoni, faulovi - direktno u bazu.</p>
          <button className="primary" onClick={onOpenLive}>Udji u live admin</button>
        </article>
      </div>
    </section>
  );
}
