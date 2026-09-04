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

# Snigelpost

Tabellerna `snails_matches` och `snails_turns` samt RPC-funktionerna
`snails_create_match`, `snails_join_match`, `snails_get_match`,
`snails_my_matches`, `snails_submit_turn` och `snails_delete_match` ligger i
`migrations/20260904150000_snigelpost.sql`. Klienten når bara funktionerna,
aldrig tabellerna. Funktionerna kontrollerar att anroparen är med i matchen,
att det är dennes tur, att dragnumret och startticken stämmer, och att en
match bara kan anslutas en gång.

Spelarna är anonyma Supabase Auth-användare. **Slå på anonym inloggning**:
Authentication → Sign In / Providers → Anonymous → "Allow anonymous sign-ins".
Utan det får menyn texten "Snigelpost är inte tillgängligt just nu".

Eftersom projektet delas med nissebus har dess trigger `handle_new_user` (som
skapar en rad i `profiles` för varje ny användare) ändrats så att den hoppar
över anonyma användare, som saknar e-post. Annars faller anonym inloggning med
"Database error saving new user". Ändringen ligger som migrationen
`handle_new_user_skip_anonymous` i projektet.

Fler funktioner (`migrations/20260904190000_snigelpost_robust.sql`):
- `snails_resign`: ge upp, motståndaren vinner. En öppen inbjudan raderas.
- `snails_claim_timeout`: den som väntar tar hem vinsten när motståndaren varit
  tyst i 14 dagar.
- `snails_rematch`: ny match mot samma motståndare, anroparen börjar. Finns
  redan en pågående match mellan de två returneras den.
- `snails_cleanup`: körs av pg_cron varje natt 04:17 UTC. Raderar inbjudningar
  ingen antagit på 30 dagar och färdiga matcher äldre än 90 dagar.
- Händelsen `error` i `snails_events` är klientfel (max fem per sidladdning).

Serier (`migrations/20260904210000_series.sql`): varje match tillhör en serie i
`snails_series` (bäst av 1, 3 eller 5; standard 3). Serien räknar vinster per
spelare, och när en match är slut skapar `snails_series_after_finish` nästa
match med omvänd startordning tills någon har tillräckligt många vinster.
`snails_create_match` tar `p_best_of` och en `p_config` med `snailsPerTeam`,
`turnTime` (20/30/45/60/90) och `suddenDeath` (0 = aldrig, annars draget då
vattnet börjar stiga); okända värden faller tillbaka på 45 och 16 på alla
enheter; `snails_my_matches` visar bara seriens
aktuella match; `snails_extend_series` förlänger en avgjord serie till bäst av
3 eller 5 om det ännu inte är avgjort på den längden (t.ex. 2–0 i bäst av 3 kan
bli bäst av 5). `snails_rematch` startar en ny serie med samma längd, eller
returnerar den pågående seriens aktuella match. `snails_get_match` returnerar
`series` med ställning sett från anroparen.

Kända begränsningar:
- Servern kör inte simuleringen själv; den litar på klientens hash. Motståndarens
  klient jämför sin egen hash med den sparade och varnar vid avvikelse.
- Ett anonymt konto lever i webbläsarens localStorage. Rensas den försvinner
  kontot och dess matcher. Koppling till e-post kommer senare.

# Push-notiser

Web Push utan tredjepartstjänst. Klienten (`js/push.js`) prenumererar via
service workern och sparar prenumerationen med `snails_save_push`. Efter varje
inskickat drag anropar klienten edge-funktionen `notify-turn`
(`supabase/functions/notify-turn/`), som kontrollerar att anroparen är med i
matchen och skickar en notis till motståndarens enheter. I en serie läggs
ställningen till i texten och länken pekar på seriens aktuella match. Kryptot (RFC 8291
och VAPID) ligger i `webpush.js` och testas i `test/webpush.test.mjs`.

- Publik VAPID-nyckel: `VAPID_PUBLIC_KEY` i `js/config.js`.
- Privat VAPID-nyckel: Supabase Vault, hemligheten `snails_vapid_private`,
  läsbar bara för `service_role` via `snails_vapid_private()`.
- Döda prenumerationer (404/410 från push-tjänsten) tas bort automatiskt.
- iPhone/iPad kräver att spelet är installerat på hemskärmen; spelet visar en
  hjälptext i stället för knappen där.

Ny nyckel vid behov: generera ett P-256-par, lägg den privata som JWK i Vault
med samma namn och den publika i `js/config.js`. Alla befintliga
prenumerationer måste då göras om.
