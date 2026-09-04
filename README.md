# Snäckmageddon

Turbaserat artilleri-spel i Worms Armageddon-anda, fast med **afrikanska jättesnäckor**
(Achatina) i stället för maskar. Byggt som en installerbar PWA i ren HTML/Canvas/JavaScript
utan byggsteg eller beroenden.

## Köra

Spelet måste serveras över HTTP (ES-moduler + service worker fungerar inte via `file://`):

```bash
npx serve .          # eller: python3 -m http.server 8080
```

Öppna sedan `http://localhost:8080` (eller den port som skrivs ut). På GitHub Pages
fungerar repot som det är – peka Pages på `main`-branchen, roten.

## Snäckdesign

`design/snails.html` visar fem förslag på hur snäckorna kan se ut, ritade med samma kod
som spelet använder (`js/snails.js`). Vald stil kan bytas i spelmenyn. Standardstilen
sätts i `js/main.js` (`settings.style`).

| id | Stil |
|----|------|
| `cartoon` | Tecknad Worms-stil (standard) |
| `achatina` | Naturtrogen Achatina med koniskt skal |
| `kommando` | Kommandosnäcka med hjälm och bandana |
| `pixel` | Retro 24×16 pixelsprite |
| `flat` | Flat/minimalistisk |

## Spelet

- 2–4 lag, 1–4 snäckor per lag, människa eller dator per lag.
- 45 sekunder per drag, 4 sekunders reträtt efter skott.
- Vapen: Bazooka (vind), Granat (studsar, 3 s), Saltspruta (kort räckvidd), Dynamit.
- Förstörbar terräng, fallskada, vatten som dränker, plötslig död efter 16 drag.
- Tangentbord: ← → / A D gå, ↑ ↓ / W S sikta, mellanslag ladda+skjut, Enter hoppa,
  1–4 / Tab vapen, Esc meny. Touch: knappar på skärmen, dra för att panorera, nyp för zoom.

## Deterministisk simulering

Simuleringen går i fasta steg om 1/60 s, all slump är seedad och all matte i
simuleringen är motoroberoende (`js/dmath.js`). Kollisionsmasken beräknas
analytiskt, aldrig från canvas-pixlar. Varje indata (tangent, touch eller AI)
går genom `game.tick()` och spelas in som `(tick, input)`-par i
`game.recording`. En inspelning kan spelas upp bit för bit med
`Game.fromRecording(canvas, recording)`, även utan webbläsare:

```bash
npm test               # determinismtester i Node, inga beroenden
npm install            # hämtar Playwright för webbläsartesterna
npm run test:browser   # spelar genom riktiga UI:t i Chromium, skärmdumpar i test-results/
```

Webbläsartestet driver simuleringen tick för tick (`window.__manualTick`) och
jämför webbläsarens `stateHash()` med en headless Node-körning på samma seed
(`?seed=1234` i URL:en ger en reproducerbar match). Båda testsviterna körs i
CI vid varje push.

`game.stateHash()` ger en 32-bitars hash av hela speltillståndet och används
för att upptäcka om två körningar glider isär. Det här är grunden för replays,
asynkront multiplayer och serversidig verifiering.

## Struktur

```
index.html            app-skal, meny, HUD
manifest.webmanifest  PWA-manifest
sw.js                 service worker (cache-first, offline)
css/style.css
js/main.js            meny, HUD, input, kamera, PWA-registrering
js/game.js            spellogik: turordning, fysik, vapen, AI, rendering
js/terrain.js         förstörbar terräng (canvas + kollisionsmask)
js/snails.js          snäck-sprites (alla stilar)
js/audio.js           syntetiserade ljudeffekter
js/rng.js             seedad slump, shuffle, tillståndshash
js/dmath.js           motoroberoende sin/cos/atan2
test/                 determinism- och webbläsartester (körs i CI)
design/snails.html    designförslag
icons/                app-ikoner
```
