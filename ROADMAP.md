# Snäckmageddon – utvecklingsplan

Uppdaterad 2026-09-04, kväll. Spelet är publikt på https://knackpot.itch.io/snailmageddon
och https://niklaser74.github.io/snails/ (snails.se när DNS:en är på plats).

## Tesen: dra spelet mot asynkront multiplayer

Worms är ett soffspel. Vår snäcka är långsam, och det gör vi till en styrka:
**Snigelpost** – man spelar sitt drag när man hinner, motståndaren får en notis
och svarar när den hinner. Som Wordfeud, fast med bazooka. Det är det som gör
spelet till något man återkommer till varje dag, vilket är förutsättningen för
intäkter. Snigelpost finns nu, med push-notiser. Resten av planen handlar om
att göra det hållbart, roligare och till slut lönsamt.

## Läget per fas

### Fas 1 – Känsla och kärnloop
| Klart | Kvar |
|---|---|
| Kamerapunch vid explosioner | Slow motion vid dödsskott, skal som spricker, slemspår |
| Slemklot, Saltregn, ammunition, lådor | Skalstöt (dash), Snigelhopp (teleport) |
| Guide i första matchen | AI-svårighetsgrader |
| Tester i CI (Node + Playwright) | Terrängteman (trädgårdsland, strand, regnskog) |
| Förhandsbana vid sikte | Inställningar: dragtid, plötslig död, ljud av/på, gamepad |
| | Riktigt ljud: bättre syntes eller inspelade ljud, musik |

### Fas 2 – Snigelpost
| Klart | Kvar |
|---|---|
| Deterministisk simulering, replay, hash | E-postkoppling av kontot (magic link) |
| Anonyma konton, matcher, drag, inbjudan via länk | |
| Motståndarens drag i 3× med hoppa över | Åskådarläge och delbar replay av färdig match |
| Push-notiser (egen Web Push, VAPID i Vault) | Serversidig verifiering av drag (edge-funktion kör simuleringen) |
| Väntläge med automatisk uppdatering, ge upp, revansch, vinst efter tystnad, städjobb | |
| Serier: bäst av 1/3/5 (standard 3), förläng en färdig match till en serie | |

### Fas 3 – Progression och identitet (ej påbörjad)
Profil, kosmetik (intäktsytan), "Dagens skott" med topplista, rank och säsonger.
Förutsätter e-postkoppling, annars försvinner köp när webbläsardata rensas.

### Fas 4 – Distribution
| Klart | Kvar |
|---|---|
| itch.io, publik, butler-push från CI | Poki-inskick (länk och checklista i `docs/store/poki.md`) |
| Poki-SDK-adapter i koden | snails.se: DNS i Cloudflare, custom domain i GitHub Pages |
| Svenska och engelska | Google Play via PWABuilder, App Store via Capacitor (efter fas 3) |
| Mätning i Supabase | |

## Lärdomar från första dagen, som blir arbete

- **Snigelpost delar databas med nissebus.** Det fungerar, men anonyma spelare
  får rollen `authenticated` i hela projektet och triggern för nya användare
  fick ändras. Två policyer i nissebus (`pranks`) släpper in alla inloggade.
  Beslut: täpp till dem nu, flytta Snigelpost till eget projekt när det finns
  spelare som motiverar 10 USD/mån.
- **Regelversion mitt i en match.** När fysiken ändras (ny `RULES_VERSION`) kan
  pågående matcher inte spelas vidare. Innan nästa balansändring behövs en
  strategi: antingen frysa gamla versioner av simuleringen som separata
  filer och välja rätt per match, eller bara ändra regler när inga matcher
  pågår. Det första är rätt på sikt.
- **Inbjudningslänkar delas i chattar.** Utan Open Graph-taggar visas länken
  utan bild och text. Billig och viktig detalj för spridning.
- **Vi ser inga fel i produktion.** Klientfel bör skickas som en händelse i
  mätningen, annars upptäcks buggar först när någon klagar.
- **Ingen ljud-av-knapp.** Första sak folk letar efter på jobbet.

## Tekniska beslut (bekräftade)

1. Deterministisk simulering med fast tidssteg och egen matte – i drift.
2. Indata som händelser, inspelning per drag – i drift.
3. Regelversion per match – i drift, men se lärdomen ovan.
4. Mätning från dag ett – i drift (`snails_daily_metrics`, `snails_retention`).

## Intäkter (oförändrat)

Gratis spel, inget köpbart ger fördel, inga lootboxar. Ordning: portaler
(itch.io klart, Poki nästa) för spelare och små intäkter, sedan kosmetik via
Stripe när e-postkoppling finns, sedan säsongspass och belönad reklam.

## Nästa två veckor

1. ~~**Snigelpost robust**: ge upp, revansch, vinst efter 14 dagars tystnad,
   städjobb, Open Graph-taggar, felrapportering~~ – klart 2026-09-04.
   ~~Serier, bäst av 1/3/5~~ – klart 2026-09-04.
2. **Ljud och inställningar**: ljud av/på i HUD:en, dragtid, plötslig död,
   bättre ljud, slow motion vid dödsskott.
3. **De två sista vapnen och AI-nivåer** (lätt, normal, svår).
4. **E-postkoppling** av kontot, grunden för fas 3 och för att inte tappa
   spelare vid byte av telefon.
5. **snails.se och Poki-inskick** när DNS:en är på plats.
6. **Versionsstrategi för simuleringen** innan nästa regeländring.

Därefter fas 3, med "Dagens skott" först eftersom det är billigast och ger
daglig återkomst utan att kräva kosmetik.

## Risker

- **Worms-varumärket.** Aldrig i namn eller marknadsföring. Genren är fri.
- **Anonyma konton som försvinner.** Tills e-postkoppling finns förlorar en
  spelare sina matcher om webbläsardata rensas. Säg det i gränssnittet.
- **Missbruk av anonym inloggning.** Supabase rekommenderar captcha. Vänta med
  det tills mätningen visar problem, friktionen kostar mer än nyttan i början.
- **Barn spelar.** Rena köpflöden, inga mörka mönster, ingen fri chatt.
