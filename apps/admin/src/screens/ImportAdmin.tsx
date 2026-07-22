import React from "react";
import { StatusPill } from "../components/shared";

const importRows = [
  {
    source: "wp_flm_igraci",
    target: "Igraci / profili",
    status: "uvezeno",
    note: "567 igraca sa imenom, prezimenom, tim_id, brojem dresa, pozicijom, golman statusom i fotografijom."
  },
  {
    source: "wp_flm_utakmice",
    target: "Sezone / utakmice",
    status: "uvezeno",
    note: "195 utakmica, 4 lige, kola, rezultati, status, vreme i formacija."
  },
  {
    source: "wp_flm_dogadjaji_utakmice",
    target: "Live dogadjaji / fantasy live",
    status: "uvezeno",
    note: "10.389 dogadjaja: golovi, sutevi, odbrane, faulovi, izmene, kartoni, 2 minuta i tok utakmice."
  },
  {
    source: "wp_flm_utakmica_sastav",
    target: "Roster utakmice",
    status: "uvezeno",
    note: "2.213 zapisa sastava sa statusima teren i rezerva."
  },
  {
    source: "wp_flm_statistika_igraca",
    target: "Statistika po mecu",
    status: "uvezeno",
    note: "1.736 redova po utakmici: golovi, asistencije, sutevi, odbrane, kartoni, faulovi, poeni."
  },
  {
    source: "wp_flm_sezonska_statistika_igraca",
    target: "Pocetne fantasy cene",
    status: "uvezeno",
    note: "500 sezonskih redova, dovoljno za prvi algoritam vrednosti igraca."
  },
  {
    source: "Tabela timova",
    target: "Nazivi ekipa",
    status: "fali",
    note: "Imamo tim_id, ali jos nemamo tabelu sa nazivima timova. Treba naci gde WordPress cuva timove."
  }
];

const neededExports = [
  "Pronaci tabelu ili WordPress post type gde su nazivi timova",
  "Po potrebi izvesti WordPress news/posts za rubriku News",
  "Izvesti sponzore ako ih plugin cuva odvojeno",
  "Odrediti kako prazni dogadjaji u wp_flm_dogadjaji_utakmice uticu na live istoriju"
];

export function ImportAdmin({ onBack }: { onBack: () => void }) {
  return (
    <section className="import-admin">
      <div className="admin-subnav">
        <button onClick={onBack}>Nazad na admin portal</button>
      </div>

      <div className="import-head">
        <div>
          <p className="eyebrow">Istorija uvoza sa postojeceg sajta</p>
          <h2>Mapa podataka: WordPress u novu aplikaciju</h2>
          <p>Ovo je zapisnik jednokratnog uvoza (scripts/import-*.mjs) - nije live upit ka bazi.</p>
        </div>
        <div className="import-score">
          <strong>6/7</strong>
          <span>FLM tabela uvezeno</span>
        </div>
      </div>

      <div className="import-grid">
        <section className="import-table">
          <div className="import-table-head">
            <span>Izvor</span>
            <span>Nova aplikacija</span>
            <span>Status</span>
            <span>Napomena</span>
          </div>
          {importRows.map((row) => (
            <div className="import-table-row" key={row.source}>
              <strong>{row.source}</strong>
              <span>{row.target}</span>
              <StatusPill tone={row.status}>{row.status}</StatusPill>
              <p>{row.note}</p>
            </div>
          ))}
        </section>

        <aside className="export-checklist">
          <h3>Sta jos fali</h3>
          {neededExports.map((item) => (
            <label key={item}>
              <input type="checkbox" readOnly />
              <span>{item}</span>
            </label>
          ))}
          <div className="teams-note">
            <strong>Najbolji put:</strong> Kinsta backup ili phpMyAdmin SQL export. Ako to nemas, iz WordPress admina trazimo export iz samog plugin-a ili pravimo mali privremeni export plugin.
          </div>
        </aside>
      </div>
    </section>
  );
}
