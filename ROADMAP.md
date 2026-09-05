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
| Kamerapunch vid explosioner, slow motion vid dödsskott | |
| Skal som spricker med skadan, skalbitar vid död, slemspår efter kryp | |
| Slemklot, Saltregn, ammunition, lådor | |
| Skalstöt (knuff) och Snigelhopp (teleport), åtta vapen totalt | |
| Guide i första matchen | |
| AI-nivåer: lätt, normal, svår | |
| Tester i CI (Node + Playwright) | |
| Terrängteman: trädgårdsland, strand, regnskog, slumpat ur fröet eller valt i menyn | |
| Förhandsbana vid sikte | |
| Inställningar: dragtid, plötslig död, ljud av/på; handkontroll (Gamepad API) | |
| Lagrat ljud: mastervolym, ljud av/på i HUD:en, lager av brus och toner | Inspelade ljud och musik |
| Regler i menyn: dragtid, plötslig död; slow motion vid dödsskott | |

### Fas 2 – Snigelpost
| Klart | Kvar |
|---|---|
| Deterministisk simulering, replay, hash | |
| E-postkoppling av kontot, inloggningslänk på andra enheter | |
| Anonyma konton, matcher, drag, inbjudan via länk | |
| Motståndarens drag i 3× med hoppa över | Åskådarläge och delbar replay av färdig match |
| Push-notiser (egen Web Push, VAPID i Vault) | Serversidig verifiering av drag (edge-funktion kör simuleringen) |
| Väntläge med automatisk uppdatering, ge upp, revansch, vinst efter tystnad, städjobb | |
| Serier: bäst av 1/3/5 (standard 3), förläng en färdig match till en serie | |

### Fas 3 – Progression och identitet
| Klart | Kvar |
|---|---|
| Dagens skott: samma bana och vapen för alla per dag, ett skott, topplista, bästa försöket räknas | Betalning för premiumkosmetik (guldskal, cylinder) |
| Profil: namn, statistik, skalmönster och hattar; låses upp med vinster och Dagens skott; syns för motståndaren | |
| Rank (Elo per kvartalssäsong, fem nivåer) och säsongspoäng för Dagens skott, topplistor i menyn | |
| Säsongsbelöningar: lagerkrans och konfettiskal till topp tre, märken i profilen, delas ut av pg_cron vid kvartalsskiftet | |
| Betalning: Stripe Checkout via edge-funktioner, webhook ger köpet, kräver e-postkopplat konto | Stripe-konto, produkter och hemligheter (se `supabase/README.md`) |
| E-postkoppling (fas 2) som grund | |
| | Serversidig verifiering av dagens skott (inspelningen sparas redan) |

### Fas 4 – Distribution
| Klart | Kvar |
|---|---|
| itch.io, publik, butler-push från CI | Poki-inskick: kontot och formuläret är ditt (allt förberett i `docs/store/poki.md`) |
| Poki-bygge: zip från release-flödet, Poki-läge utan länkar ut, konton eller köp | |
| Poki-SDK-adapter i koden | snails.se: DNS i Cloudflare, custom domain i GitHub Pages |
| Svenska och engelska | App Store via Capacitor |
| Google Play via Bubblewrap: manifest, assetlinks, integritetspolicy, Play-läge utan Stripe, twa-manifest och guide i `docs/store/google-play.md` | Play-konto, signering och uppladdning (ditt) |
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
2. ~~**Ljud och inställningar**: ljud av/på i HUD:en, dragtid, plötslig död,
   bättre ljud, slow motion vid dödsskott.~~ – klart 2026-09-04.
3. ~~**De två sista vapnen och AI-nivåer** (lätt, normal, svår).~~ – klart 2026-09-04.
   Regelversionen höjdes till 3 (nya vapen ändrar hashen); databasen var tom, så
   inga matcher gick förlorade.
4. ~~**E-postkoppling** av kontot, grunden för fas 3 och för att inte tappa
   spelare vid byte av telefon.~~ – klart 2026-09-04 (kräver Redirect URLs i
   Supabase, se `supabase/README.md`).
5. **snails.se och Poki-inskick** när DNS:en är på plats.
6. ~~**Versionsstrategi för simuleringen** innan nästa regeländring.~~ – klart
   2026-09-04, se `docs/REGELVERSIONER.md`: spelet kör aktuell + föregående
   version, facit-inspelningar i testerna, solnedgång på servern.

~~Därefter fas 3, med "Dagens skott" först eftersom det är billigast och ger
daglig återkomst utan att kräva kosmetik.~~ Dagens skott klart 2026-09-05. Profil och kosmetik klart 2026-09-05; två
premiumsaker ligger låsta som "kommer snart" tills betalning finns (Stripe
eller butikernas köp, kräver e-postkopplat konto).
Rank och säsonger klart 2026-09-05. Betalningsflödet klart 2026-09-05, väntar
på Stripe-konto och nycklar. Säsongsbelöningar klart 2026-09-05. Fas 3 är
därmed byggd; kvar är Stripe-nycklarna och det som ligger i fas 1 och 4.

## Risker

- **Worms-varumärket.** Aldrig i namn eller marknadsföring. Genren är fri.
- **Anonyma konton som försvinner.** En spelare som inte kopplat e-post
  förlorar sina matcher om webbläsardata rensas. Gränssnittet säger det och
  erbjuder kopplingen.
- **Missbruk av anonym inloggning.** Supabase rekommenderar captcha. Vänta med
  det tills mätningen visar problem, friktionen kostar mer än nyttan i början.
- **Barn spelar.** Rena köpflöden, inga mörka mönster, ingen fri chatt.
