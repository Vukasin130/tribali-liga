# Tribali Liga

Ovo je pocetni kod-projekat za fantasy aplikaciju.

## Delovi projekta

- `apps/mobile` - mobilna aplikacija za korisnike
- `apps/desktop` - desktop admin panel za ligu, utakmice i live unos (uvozi ekrane/logiku iz apps/mobile, isti kod i baza)
- `apps/api` - backend API
- `packages/shared` - zajednicka pravila za poene, fantasy tim i promenu cena

## Pokretanje

Prvi put:

```bash
npm install
```

Mobilna aplikacija:

```bash
npm run mobile
```

Desktop admin panel:

```bash
npm run desktop
```

## Sta trenutno postoji

Ovo je kostur projekta. Fokus je da se logika prebaci iz dokumenta u kod koji mozemo siriti:

- fantasy bodovanje
- obracun cene igraca
- slotovi tima
- live/admin tok
- struktura za mobile i desktop aplikaciju
