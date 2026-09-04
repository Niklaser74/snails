# Mätning

Spelet räknar ett fåtal händelser i en Supabase-tabell (`public.snails_events`, i det delade projektet knackpot-portal).
Klienten är `js/analytics.js`, nycklarna ligger i `js/config.js`.

## Vad som skickas

| Händelse | Egenskaper |
|---|---|
| `app_open` | `installed` (körs som installerad app), `touch`, `w`, `h` |
| `match_start` | `teams`, `per`, `humans`, `style` |
| `match_end` | `turns`, `durationSec`, `winner` (`human`/`ai`/`draw`), `weapons` (skott per vapen) |
| `match_abandon` | `turns`, `durationSec` |
| `tutorial_done`, `tutorial_skip` | `step` |

Dessutom ett slumpat anonymt klient-id (localStorage), ett sessions-id per
sidladdning, appversion och språk. Inga namn, inga IP-adresser i tabellen,
inga cookies. Mätningen är av på localhost, med `?noanalytics` i adressen och
när webbläsaren skickar Do Not Track eller Global Privacy Control.

## Läsa av

I Supabase Studio, SQL Editor:

```sql
select * from snails_daily_metrics limit 30;   -- per dag: öppningar, unika, startade/avslutade matcher
select * from snails_retention limit 30;       -- kohorter: andel som kom tillbaka dag 1 och dag 7
select * from snails_weapon_usage;             -- skott per vapen
```

Vyerna går bara att läsa med dashboardens rättigheter. Anonyma klienter kan
bara lägga till rader, aldrig läsa, ändra eller ta bort (RLS).

## Sätta upp

1. Kör `supabase/migrations/20260904120000_events.sql` i projektet (SQL Editor
   eller `supabase db push`).
2. Fyll i `SUPABASE_URL` och `SUPABASE_KEY` (publishable key) i `js/config.js`.
