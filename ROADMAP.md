# Snäckmageddon – utvecklingsplan

Status: MVP live på https://niklaser74.github.io/snails/ (2026-09-04).
Lokalt hotseat + AI, 4 vapen, förstörbar terräng, 5 snäckstilar, PWA offline.

## Tesen: dra spelet mot asynkront multiplayer

Worms är ett soffspel. Vår snäcka är långsam, och det ska vi göra till en styrka:
**Snigelpost** – man spelar sitt drag när man hinner, motståndaren får en notis
och svarar när den hinner. Som Wordfeud, fast med bazooka. Det passar mobilen,
passar temat, och kräver ingen realtidsnätkod. Det är också det som gör spelet
till något man återkommer till varje dag, vilket är förutsättningen för intäkter.

Allt annat i planen bygger mot det: deterministisk simulering först, sedan
konton och matcher, sedan progression och kosmetik.

## Fas 1 – Känsla och kärnloop (2–3 veckor)

Målet är att en match ska kännas bra att spela klart och vilja spelas igen.

- **Juice.** Kamerazoom mot träffar, kort slow motion vid dödsskott, skal som
  spricker, slemspår efter snäckorna, bättre ljud (fortfarande syntetiserat).
- **Fler vapen.** Slemklot (klibbar fast där det landar, smäller efter 2 s),
  Saltregn (luftanfall över ett valt område), Skalstöt (kort dash som knuffar),
  Hemlig teleport "Snigelhopp". Max 8 vapen totalt, ammunition per match.
- **Lådor.** Hälsolådor och vapenlådor faller ner mellan dragen. Ger anledning
  att röra sig.
- **Terrängteman.** Trädgårdsland (Achatina är faktiskt ett skadedjur där),
  strand, regnskog. Tema = palett + gräsfärg + rekvisita, samma generator.
- **Svårighetsgrader för AI** (lätt: siktar fel med avsikt, svår: dagens AI).
- **Inställningar.** Dragtid, antal vapen, plötslig död på/av. Gamepad-stöd.
- **Tutorial.** Tre steg första gången: gå, sikta, skjut.
- **Testinfrastruktur.** Playwright-skripten från utvecklingen in i repot
  (`test/`), körs i CI vid varje push.

## Fas 2 – Snigelpost, asynkront multiplayer (4–6 veckor)

- **Deterministisk simulering** (görs först, se Tekniska beslut nedan).
- **Konton.** Anonymt konto vid första start, uppgradera med e-post (magic
  link) när man vill spela mot andra. Supabase Auth.
- **Matcher.** Tabell `matches` med seed, regler och en logg av drag (indata
  per tick). Klienten spelar upp motståndarens drag som en replay.
- **Inbjudan via länk.** "Skicka länken till en kompis" är hela onboardingen.
- **Notiser.** Web Push när det är din tur. Det här är den viktigaste
  återkomstmekanismen i hela spelet.
- **Åskådarläge.** Vem som helst med länken kan titta på replayen.

## Fas 3 – Progression och identitet (3–4 veckor)

- **Profil.** Namn, valt lag, statistik (vinster, skott, längsta bazooka).
- **Kosmetik.** Skal, hattar, ögon, slemfärg, segergest. Det här är
  intäktsytan, se nedan. Grundutbudet gratis och upplåsbart.
- **Dagens skott.** Ett delat seed per dag: samma bana för alla, ett skott,
  topplista. Billigt att bygga, ger daglig anledning att öppna appen.
- **Rank och säsonger.** Enkel Elo, säsong på 8 veckor med belöningsskal.

## Fas 4 – Distribution (löpande från fas 1)

- **itch.io** direkt. Gratis, ger första utomstående spelare.
- **Poki och CrazyGames.** Webbspelsportaler med egna spelare och
  annonsintäkter som delas med utvecklaren. Kräver deras SDK och en QA-runda.
- **Google Play** via PWABuilder/TWA. Nästan ingen extra kod.
- **App Store** via Capacitor-omslag när kosmetik finns att sälja.
- **Engelska.** Gör spelet tvåspråkigt före portalerna. Svensk marknad ensam
  är för liten.

## Fas 5 – Bara om det tar fart

- Realtidslobby (Supabase Realtime), turneringar, baneditor med delning,
  Discord Activity.

## Tekniska beslut som ska tas nu

1. **Deterministisk simulering.** Fast tidssteg (60 Hz), seedad slump,
   separat slumpgenerator för rendering (skakning, eldflammor) så att den inte
   rör simuleringen. Simuleringen ska kunna köras utan canvas i Node.
   Det ger: små replays (bara indata), serversidig verifiering av resultat,
   delbara höjdpunkter och möjlighet att testa fysiken automatiskt.
2. **Indata som händelser.** Spelaren producerar en ström av `(tick, input)`,
   simuleringen konsumerar den. Lokal spelare, AI och replay blir samma sak.
3. **Regelversion i matchen.** Varje match sparar `rulesVersion` så gamla
   replays fortsätter fungera när balansen ändras.
4. **Mätning från dag ett.** Integritetsvänlig analys (t.ex. Plausible eller
   en egen räknare i Supabase): startade matcher, avslutade matcher, drag per
   match, återkomst dag 1/7. Utan det går det inte att fatta intäktsbeslut.

## Intäkter

Grundregel: spelet är gratis, inget som köps ger fördel i matchen, inga
lootboxar. Det håller spelet rättvist, undviker konsumenträttsproblem i EU och
är det som fungerar bäst för ett spel man spelar med vänner.

| Modell | När | Insats | Bedömning |
|---|---|---|---|
| Annonsdelning via portaler (Poki, CrazyGames) | Fas 1–2 | SDK + QA | Första kronorna, noll egen infrastruktur. |
| Kosmetik (skal, hattar, slem) via Stripe på webben | Fas 3 | Konton + butik | Huvudintäkten. Ingen butiksavgift på webben. |
| Samma kosmetik via Play/App Store | Fas 4 | IAP-integration | 15–30 % avgift, men når fler. |
| Snäckpass, säsongsprenumeration | Fas 3+ | Säsongsinnehåll | Stabil intäkt om det finns återkommande spelare. |
| Belönad reklam (se en annons, få en låda) | Fas 3 | Annons-SDK | Bra komplement, aldrig tvingande. |
| Betala vad du vill på itch.io | Fas 1 | Ingen | Symboliskt, men ger tidiga signaler. |

Rekommenderad ordning: portaler först för spelare och små intäkter, sedan
kosmetik när Snigelpost och konton finns. Kosmetik utan återkommande spelare
säljer inte, så fas 2 måste komma före fas 3.

Räkneexempel med försiktiga antaganden, inte prognos:

| Aktiva spelare/mån | Annonser via portal | Kosmetik (2 % köper, 60 kr) |
|---|---|---|
| 1 000 | 100–300 kr | 1 200 kr |
| 10 000 | 1 000–3 000 kr | 12 000 kr |
| 100 000 | 10 000–30 000 kr | 120 000 kr |

## Risker

- **Worms-IP.** Använd aldrig "Worms" i namn eller marknadsföring, ha egen
  grafik och egna vapennamn. Genren är fri, varumärket är det inte.
- **Ingen återkomst.** Utan Snigelpost och notiser är spelet en engångsgrej.
- **Barn spelar.** Håll köpflöden tydliga, inga mörka mönster, ingen chatt
  utan moderering. Anonyma konton som standard minimerar persondata (GDPR).
- **Fysiken ändras med multiplayer.** Deterministisk simulering först,
  annars byggs alla matcher om senare.

## Nästa två veckor

1. ~~Deterministisk simulering och indata-händelser~~ – klart 2026-09-04.
2. ~~Testerna in i repot och CI~~ – klart 2026-09-04 (Node + Playwright).
3. ~~Två nya vapen och lådor~~ – klart 2026-09-04 (Slemklot, Saltregn, ammunition, lådor).
4. ~~Tutorial och engelsk översättning av all text~~ – klart 2026-09-04.
5. ~~Mätning på plats~~ – klart 2026-09-04 (Supabase, se `supabase/README.md`).
6. Ladda upp på itch.io och skicka in till Poki.
