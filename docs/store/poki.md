# Poki – inskick och checklista

Poki tar in spel via https://developers.poki.com/ (Submit your game). De spelar
igenom spelet själva och ger feedback innan det läggs ut. Räkna med några
veckors ledtid och en QA-runda.

**Länk att skicka in:** https://snails.se/?platform=poki
(SDK:n laddas bara i det läget, spelet fungerar utan den om reklam blockeras.)

## Vad som redan är på plats i koden

- Poki SDK bakom `js/platform.js`: `init` → `gameLoadingFinished`,
  `gameplayStart` vid matchstart, `gameplayStop` vid matchslut och avbrott,
  `commercialBreak` innan en ny match (ljudet tystas under reklamen).
  Testläge: lägg till `&pokidebug=1` i adressen.
- Inga externa länkar när spelet körs på Poki (designsidan och installera-knappen
  döljs), ingen service worker, inga inloggningar, inga cookies.
- Spelet startar direkt från menyn, fungerar i iframe, i mobil landscape och
  portrait, och kräver inget tangentbord (touchknappar).
- Engelska väljs automatiskt utanför Sverige.

## Att göra före inskick

1. Skapa ett utvecklarkonto på developers.poki.com.
2. Skicka in länken ovan, med texten från `itch.md` (engelska delen) och
   `banner-1280x720.png` samt skärmdumparna.
3. Om Poki vill ha `rewardedBreak`: adaptern har stöd, bra kandidat är
   "se en annons, få en extra låda" i menyn. Inte byggt ännu.

## Pokis vanligaste krav, avstämt mot spelet

| Krav | Läge |
|---|---|
| Laddar på under 5 s | Ja, ~125 kB utan externa beroenden |
| Fungerar utan SDK/ads (adblock) | Ja, SDK-fel sväljs |
| Inga länkar ut, ingen inloggning | Ja i Poki-läget |
| `gameplayStart/Stop` på rätt ställen | Ja |
| `commercialBreak` bara vid naturliga pauser | Ja, mellan matcher |
| Ljud av under reklam | Ja |
| Mobilvänligt | Ja, touchkontroller och layout testade i CI |
| Engelska | Ja |
