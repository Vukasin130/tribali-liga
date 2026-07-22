# Urban Fantasy backend architecture

Ovaj fajl opisuje trenutni backend posle prelaska sa prototipa na Supabase bazu.

## Trenutno stanje

- `apps/api` je glavni HTTP API za aplikaciju.
- Supabase/Postgres je glavni izvor podataka za korisnike, takmicenja, ekipe, igrace, utakmice, vesti, storyje, fantasy i verifikacije.
- Supabase Auth se koristi kada su podeseni Supabase kljucevi.
- Supabase Storage se koristi za potpisane upload URL-ove za slike i video.
- Lokalni JSON store ostaje samo kao razvojni fallback ako baza nije podesena.

## Bezbednosna pravila

- Admin nije javna opcija u registraciji.
- Admin se prepoznaje iskljucivo preko unapred zadatog emaila i lozinke iz `.env`.
- Svi admin upisi idu kroz `requireAdmin`.
- Tabele u javnoj semi imaju RLS ukljucen i eksplicitne grantove za Supabase Data API.
- Frontend dobija samo public/publishable Supabase kljuc; service/secret kljucevi se ne salju u browser.
- Upload velikih fajlova ne ide kroz API body, vec preko potpisanog Storage URL-a.
- Auth i write rute imaju rate limit.
- Admin izmene se upisuju u `audit_logs`.

## Glavni entiteti

- `profiles`: fan, verified_player, admin.
- `verification_requests`: zahtev korisnika da bude povezan sa stvarnim igracem.
- `cities`: gradovi.
- `competitions`: lige, turniri i sezone.
- `teams`: ekipe po takmicenju, sa logom, grupom i plasmanom.
- `players`: stvarni igraci povezani sa ekipama.
- `fantasy_player_pool`: aktivna fantasy baza igraca po takmicenju; puni se iz ekipa i igraca tog takmicenja.
- `matches`: utakmice sa statusom scheduled/live/finished.
- `match_lineups`: startnih 5 plus rezerve.
- `match_events`: golovi, asistencije, kartoni, faulovi, korneri, izmene i tok meca.
- `player_match_stats`: ucinak igraca po utakmici.
- `team_standings` i `player_season_stats`: tabele i sezonske liste.
- `gameweeks`, `fantasy_teams`, `fantasy_team_picks`: aktivni fantasy sistem.
- `news_posts`, `story_folders`, `stories`, `story_views`, `story_likes`: News/story sistem.
- `goal_polls`, `goal_poll_options`, `goal_votes`: najlepši gol nedelje.
- `sponsors`, `media_links`: sponzori i snimci/live linkovi.

## Implementirane API oblasti

Auth i profil:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/session`
- `POST /auth/logout`
- `GET /profile`
- `PATCH /profile`
- `GET /profile/archive`
- `GET /profile/verifications`
- `POST /profile/verifications`
- `GET /admin/verifications`
- `PATCH /admin/verifications/:id`

Sportski podaci:

- `GET /cities`
- `GET /competitions`
- `GET /competitions/:id`
- `GET /competitions/:id/teams`
- `GET /competitions/:id/standings`
- `GET /competitions/:id/leaders?category=goals|assists|saves|mvp`
- `GET /teams/:id`
- `GET /players`
- `GET /players/:id`
- `POST /admin/competitions`
- `PATCH /admin/competitions/:id`
- `POST /admin/teams`
- `PATCH /admin/teams/:id`
- `POST /admin/players`
- `PATCH /admin/players/:id`

Competition builder:

- `GET /competitions/:id/setup` - kompletan pregled takmicenja: format, faze, termini, ekipe i mecevi.
- `PUT /admin/competitions/:id/configure` - admin podesava format takmicenja, faze i pravila prolaza.
- `POST /admin/competitions/:id/teams` - admin dodaje ekipe u takmicenje.
- `POST /admin/competitions/:id/clone-teams` - admin kopira ekipe i igrace iz stare lige/sezone u novo takmicenje.
- `POST /admin/competitions/:id/sync-fantasy-pool` - admin rucno osvezava fantasy bazu igraca za takmicenje.
- `POST /admin/competitions/:id/activate` - admin aktivira sezonu, pravi gameweek-ove iz rasporeda i puni fantasy bazu igraca.
- `PUT /admin/competitions/:id/groups` - admin rasporedjuje ekipe po grupama.
- `PUT /admin/competitions/:id/schedule-slots` - admin unosi termine, teren i lokaciju.
- `POST /admin/competitions/:id/generate-schedule` - sistem generise raspored regularne/grupne faze.
- `POST /admin/competitions/:id/prepare-knockout` - sistem priprema nokaut parove iz tabele i dodaje mec za trece mesto ako je ukljucen.

News, story i sponzori:

- `GET /news`
- `POST /admin/news`
- `PATCH /admin/news/:id`
- `DELETE /admin/news/:id`
- `GET /stories/folders`
- `GET /stories`
- `POST /admin/story-folders`
- `PATCH /admin/story-folders/:id`
- `DELETE /admin/story-folders/:id`
- `POST /admin/stories`
- `DELETE /admin/stories/:id`
- `POST /stories/:id/view`
- `POST /stories/:id/like`
- `GET /admin/stories/:id/stats`
- `GET /sponsor`
- `PATCH /admin/sponsor`

Utakmice, live i media:

- `GET /matches/live`
- `GET /matches/:id`
- `POST /admin/matches`
- `PATCH /admin/matches/:id/status`
- `PUT /admin/matches/:id/lineup`
- `POST /admin/matches/:id/events`
- `PATCH /admin/matches/:id/media`
- `GET /live/overview`
- `GET /realtime/config`

Fantasy:

- `GET /seasons` - centralni prikaz aktivne sezone: takmicenja, kola, utakmice, tabela, lideri i fantasy igraci.
- `GET /seasons/:id` - isti prikaz za konkretno takmicenje.
- `GET /gameweeks`
- `POST /admin/gameweeks`
- `PUT /admin/gameweeks/:id/matches`
- `POST /admin/gameweeks/:id/score`
- `GET /fantasy/player-pool?competitionId=:id`
- `GET /fantasy/team`
- `PUT /fantasy/picks`
- `GET /fantasy/leaderboard`

Najlepsi gol:

- `GET /goal-poll`
- `GET /goal-polls/:id`
- `POST /goal-polls/:id/vote`
- `POST /admin/goal-polls`
- `PATCH /admin/goal-polls/:id`
- `PATCH /admin/goal-polls/:id/status`
- `POST /admin/goal-polls/:id/finish`
- `GET /admin/goal-polls/:id/stats`

Storage:

- `POST /uploads/signed-url`

## Uvezeni istorijski podaci

U Supabase su uvezeni FLM CSV podaci:

- takmicenja
- ekipe
- igraci
- utakmice
- sastavi
- dogadjaji
- tabele
- statistika igraca
- media linkovi

## Tok za novu sezonu

1. Admin napravi takmicenje kroz `POST /admin/competitions`.
2. Admin podesi format kroz `PUT /admin/competitions/:id/configure`.
3. Admin doda ekipe ili klonira ekipe i igrace iz stare baze.
4. Backend automatski osvezava `fantasy_player_pool`, a admin moze rucno da pokrene sync ako menja roster.
5. Admin rasporedi grupe/termine i generise raspored.
6. Admin aktivira sezonu kroz `/admin/competitions/:id/activate`.
7. Seasons, Fantasy izbor igraca i profili koriste isti skup ekipa, igraca, utakmica i kola.

Poznata ogranicenja importovanih podataka:

- deo starih CSV redova nema kompletne veze ka igracu ili mecu;
- istorijski podaci se prikazuju kao arhiva/statistika, ne kao aktivni fantasy skor nove sezone;
- plasmani tipa "sampion", "trece mesto", "7. mesto" moraju se dopuniti preko `teams.placement` kada stari izvor nema eksplicitan podatak.

## Sta je jos posao pre produkcije

- Dovrsiti frontend povezivanje na nove API rute, posebno profile ekipa/igraca, verifikacije i match detail tabove.
- Dovrsiti admin ekrane za competition builder: format, faze, pravila prolaza, kloniranje stare sezone, grupe, termini i generisanje rasporeda.
- Dodati migracioni fajl iz trenutne Supabase seme kada se stabilizuje model.
- Dodati automatizovane testove za najbitnije tokove umesto samo direktnih skripti.
- U produkciji prebaciti API iza ozbiljnog hostinga, HTTPS-a i centralnog logovanja.
