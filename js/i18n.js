// UI strings in Swedish and English. The simulation never produces text: it
// emits { key, ...params } objects and the UI formats them here.
export const LANGS = { sv: 'Svenska', en: 'English' };

const dict = {
  sv: {
    'app.name': 'Snäckmageddon',
    'app.tagline': 'Turbaserat artilleri med afrikanska jättesnäckor. Långsamma. Skalade. Dödliga.',
    'menu.teams': 'Lag', 'menu.per': 'Snäckor per lag', 'menu.style': 'Snäckstil', 'menu.lang': 'Språk',
    'menu.start': 'Starta match', 'menu.design': 'Snäckdesign', 'menu.help': 'Så spelar du', 'menu.install': 'Installera app',
    'menu.offline': 'Spelet är sparat för offline-spel.', 'menu.human': 'Människa', 'menu.ai': 'Dator',
    'menu.teamName': 'Lagnamn', 'menu.player': 'Spelare',
    'menu.turnTime': 'Dragtid', 'menu.sudden': 'Plötslig död', 'menu.volume': 'Ljudvolym', 'menu.seconds': '{n} s',
    'menu.suddenOff': 'Aldrig', 'menu.suddenAfter': 'Efter {n} drag',
    'team.0': 'Slemligan', 'team.1': 'Skalbaggarna', 'team.2': 'Salta Hundar', 'team.3': 'Turbosniglarna',
    'help.title': 'Så spelar du',
    'help.1': '<b>Gå:</b> ← → eller A/D. Snäckor är långsamma, men kan <b>hoppa</b> med Enter/⤴.',
    'help.2': '<b>Sikta:</b> ↑ ↓ eller W/S. <b>Skjut:</b> håll in mellanslag för att ladda kraft, släpp för att skjuta. En prickad bana visar vart skottet tar vägen.',
    'help.3': '<b>Vapen:</b> 1–6 eller Tab. Bazooka påverkas av vinden. Granaten studsar och smäller efter 3 s. Saltsprutan gör kort, spridd skada (salt är snäckors värsta fiende). Dynamit läggs vid fötterna – kryp iväg!',
    'help.4': '<b>Slemklot</b> klibbar fast där det landar, även på en snäcka, och smäller efter 2 s. <b>Saltregn</b> siktas med en markör: ← → flyttar markören, skjut släpper fem saltkristaller från himlen. Dynamit, slemklot och saltregn har begränsad ammunition (siffran på knappen).',
    'help.5': '<b>Lådor</b> faller ner mellan dragen. Gå fram till en landad låda för att plocka upp den: hälsolådor ger +35, vapenlådor extra ammunition. Lådor i en explosion smäller själva.',
    'help.6': '<b>Turordning:</b> 45 sekunder per drag (ändras i menyn). Efter skottet får du 4 sekunder att retirera. Ett dödande skott visas i slow motion.',
    'help.7': '<b>Kamera:</b> dra med musen/fingret för att panorera, scrolla eller nyp för att zooma. <b>Plötslig död:</b> efter 16 drag börjar vattnet stiga (ändras i menyn). <b>Ljud:</b> 🔊 i spelet stänger av, volymen ställs i menyn.',
    'help.close': 'Stäng', 'help.guide': 'Visa guiden igen',
    'go.title': 'Matchen är slut', 'go.again': 'Spela igen', 'go.menu': 'Till menyn', 'go.win': '{name} vinner!', 'go.draw': 'Oavgjort!',
    'hud.wind': 'Vind', 'hud.ai': '(dator)', 'hud.fire': 'SKJUT',
    'aria.left': 'Vänster', 'aria.right': 'Höger', 'aria.jump': 'Hoppa', 'aria.up': 'Sikta upp', 'aria.down': 'Sikta ner', 'aria.menu': 'Meny', 'aria.mute': 'Ljud av', 'aria.unmute': 'Ljud på',
    'msg.turn': '{team} – {name}', 'msg.sudden': 'Vattnet stiger! {team}: {name}',
    'msg.crateHealth': 'En hälsolåda faller!', 'msg.crateWeapon': 'En vapenlåda faller!',
    'msg.cracked': '{name} sprack!', 'msg.drowned': '{name} drunknade!', 'msg.splash': 'Plums!',
    'msg.heal': '{name} +35 hälsa', 'msg.found': '{name} hittade {weapon}!',
    'msg.win': '{name} vinner!', 'msg.draw': 'Oavgjort – alla snäckor är borta',
    'weapon.bazooka': 'Bazooka', 'weapon.granat': 'Granat', 'weapon.salt': 'Saltspruta', 'weapon.dynamit': 'Dynamit',
    'weapon.slem': 'Slemklot', 'weapon.saltregn': 'Saltregn',
    'style.cartoon': 'Tecknad (Worms-stil)', 'style.achatina': 'Naturtrogen Achatina', 'style.kommando': 'Kommandosnäcka',
    'style.pixel': 'Retro pixel', 'style.flat': 'Flat / minimalistisk',
    'tut.step': 'Steg {n} av 4',
    'tut.1': 'Gå med ← → eller knapparna nere till vänster. Snäckor är långsamma, Enter/⤴ hoppar.',
    'tut.2': 'Sikta med ↑ ↓. Den prickade banan visar vart skottet tar vägen.',
    'tut.3': 'Håll in mellanslag eller SKJUT för att ladda kraft, släpp för att skjuta.',
    'tut.4': 'Snyggt! Efter skottet har du 4 sekunder att krypa i skydd. Vapen byter du med 1–6 eller knapparna till höger. Lycka till!',
    'tut.skip': 'Hoppa över', 'tut.done': 'Klart',
    'online.title': 'Snigelpost', 'online.blurb': 'Spela mot en kompis i egen takt. Skapa en match, skicka länken, spela ditt drag när du hinner.',
    'online.name': 'Ditt namn', 'online.defaultName': 'Snäcka', 'online.create': 'Skapa match', 'online.copy': 'Kopiera länk', 'online.copied': 'Kopierad!',
    'online.share': 'Dela', 'online.refresh': 'Uppdatera', 'online.replaying': 'Motståndarens drag', 'online.skip': 'Hoppa över',
    'online.yourTurn': 'Din tur', 'online.theirTurn': 'Väntar på {name}', 'online.open': 'Väntar på att någon ansluter',
    'online.finished': 'Klar', 'online.won': 'Du vann!', 'online.lost': 'Du förlorade', 'online.draw': 'Oavgjort',
    'online.vs': 'mot {name}', 'online.none': 'Inga matcher ännu. Skapa en och skicka länken till en kompis.',
    'online.inviteTitle': 'Bjud in en motståndare', 'online.inviteText': 'Skicka länken till en kompis. Du kan spela ditt första drag redan nu.',
    'online.sending': 'Skickar ditt drag…', 'online.sent': 'Ditt drag är skickat.', 'online.waitText': 'Du får en ny tur när {name} har spelat. Sidan uppdateras automatiskt.',
    'online.error': 'Något gick fel: {msg}', 'online.rules': 'Matchen spelas med en annan regelversion och kan inte öppnas.',
    'online.desync': 'Varning: matchen gick inte att återskapa exakt. Har ni olika versioner av spelet?',
    'online.play': 'Spela', 'online.show': 'Visa', 'online.delete': 'Ta bort', 'online.loading': 'Hämtar…',
    'online.disabled': 'Snigelpost är inte tillgängligt just nu (anonym inloggning måste vara påslagen).',
    'online.retry': 'Skicka igen', 'online.playTurn': 'Spela draget',
    'online.pushBtn': 'Meddela mig när det är min tur', 'online.pushOn': 'Notiser är på för den här enheten.',
    'online.resign': 'Ge upp', 'online.resignConfirm': 'Säker? Tryck igen så vinner motståndaren.', 'online.resigned': 'Du gav upp.',
    'online.rematch': 'Revansch', 'online.rematchMade': 'Revanschmatch skapad. Du börjar.',
    'online.silent': '{name} har inte spelat på {days} dagar.', 'online.claim': 'Ta hem vinsten',
    'online.claimed': 'Du tog hem vinsten.', 'online.accountHint': 'Kontot finns bara i den här webbläsaren. Rensar du webbdata försvinner dina matcher.',
    'online.bestOf': 'Serie', 'online.bestOf1': 'En match', 'online.bestOf3': 'Bäst av 3', 'online.bestOf5': 'Bäst av 5',
    'online.score': 'Ställning {me}–{them} · {label} · match {no}', 'online.next': 'Nästa match',
    'online.extend3': 'Utöka till bäst av 3', 'online.extend5': 'Utöka till bäst av 5',
    'online.seriesWon': 'Du vann serien {me}–{them}!', 'online.seriesLost': 'Du förlorade serien {me}–{them}.',
    'online.matchWon': 'Du vann matchen. Ställning {me}–{them}.', 'online.matchLost': 'Du förlorade matchen. Ställning {me}–{them}.',
    'online.pushIos': 'Notiser på iPhone och iPad kräver att spelet installeras: Dela → Lägg till på hemskärmen.',
    'online.pushDenied': 'Notiser är blockerade i webbläsaren.', 'online.pushFail': 'Kunde inte slå på notiser.',
  },
  en: {
    'app.name': 'Snailmageddon',
    'app.tagline': 'Turn-based artillery with giant African land snails. Slow. Shelled. Deadly.',
    'menu.teams': 'Teams', 'menu.per': 'Snails per team', 'menu.style': 'Snail style', 'menu.lang': 'Language',
    'menu.start': 'Start match', 'menu.design': 'Snail designs', 'menu.help': 'How to play', 'menu.install': 'Install app',
    'menu.offline': 'The game is saved for offline play.', 'menu.human': 'Human', 'menu.ai': 'Computer',
    'menu.teamName': 'Team name', 'menu.player': 'Player',
    'menu.turnTime': 'Turn time', 'menu.sudden': 'Sudden death', 'menu.volume': 'Sound volume', 'menu.seconds': '{n} s',
    'menu.suddenOff': 'Never', 'menu.suddenAfter': 'After {n} turns',
    'team.0': 'Slime Gang', 'team.1': 'Shell Shockers', 'team.2': 'Salty Dogs', 'team.3': 'Turbo Snails',
    'help.title': 'How to play',
    'help.1': '<b>Walk:</b> ← → or A/D. Snails are slow, but they can <b>jump</b> with Enter/⤴.',
    'help.2': '<b>Aim:</b> ↑ ↓ or W/S. <b>Shoot:</b> hold Space to charge power, release to fire. A dotted path shows where the shot will go.',
    'help.3': '<b>Weapons:</b> 1–6 or Tab. The bazooka is affected by wind. The grenade bounces and blows after 3 s. The salt shaker does short, spread damage (salt is a snail\'s worst enemy). Dynamite is placed at your feet – crawl away!',
    'help.4': '<b>Slime ball</b> sticks where it lands, even on a snail, and blows after 2 s. <b>Salt rain</b> is aimed with a marker: ← → move the marker, fire drops five salt crystals from the sky. Dynamite, slime ball and salt rain have limited ammo (the number on the button).',
    'help.5': '<b>Crates</b> drop between turns. Walk up to a landed crate to pick it up: health crates give +35, weapon crates extra ammo. Crates caught in an explosion blow up.',
    'help.6': '<b>Turns:</b> 45 seconds each (change it in the menu). After firing you get 4 seconds to retreat. A kill shot is shown in slow motion.',
    'help.7': '<b>Camera:</b> drag with the mouse/finger to pan, scroll or pinch to zoom. <b>Sudden death:</b> after 16 turns the water starts rising (change it in the menu). <b>Sound:</b> 🔊 in the game mutes, the volume is set in the menu.',
    'help.close': 'Close', 'help.guide': 'Show the guide again',
    'go.title': 'Match over', 'go.again': 'Play again', 'go.menu': 'Back to menu', 'go.win': '{name} wins!', 'go.draw': 'Draw!',
    'hud.wind': 'Wind', 'hud.ai': '(computer)', 'hud.fire': 'FIRE',
    'aria.left': 'Left', 'aria.right': 'Right', 'aria.jump': 'Jump', 'aria.up': 'Aim up', 'aria.down': 'Aim down', 'aria.menu': 'Menu', 'aria.mute': 'Sound off', 'aria.unmute': 'Sound on',
    'msg.turn': '{team} – {name}', 'msg.sudden': 'The water is rising! {team}: {name}',
    'msg.crateHealth': 'A health crate is falling!', 'msg.crateWeapon': 'A weapon crate is falling!',
    'msg.cracked': '{name} cracked!', 'msg.drowned': '{name} drowned!', 'msg.splash': 'Splash!',
    'msg.heal': '{name} +35 health', 'msg.found': '{name} found {weapon}!',
    'msg.win': '{name} wins!', 'msg.draw': 'Draw – all snails are gone',
    'weapon.bazooka': 'Bazooka', 'weapon.granat': 'Grenade', 'weapon.salt': 'Salt shaker', 'weapon.dynamit': 'Dynamite',
    'weapon.slem': 'Slime ball', 'weapon.saltregn': 'Salt rain',
    'style.cartoon': 'Cartoon (Worms style)', 'style.achatina': 'Realistic Achatina', 'style.kommando': 'Commando snail',
    'style.pixel': 'Retro pixel', 'style.flat': 'Flat / minimal',
    'tut.step': 'Step {n} of 4',
    'tut.1': 'Walk with ← → or the buttons bottom left. Snails are slow, Enter/⤴ jumps.',
    'tut.2': 'Aim with ↑ ↓. The dotted path shows where the shot will go.',
    'tut.3': 'Hold Space or FIRE to charge power, release to shoot.',
    'tut.4': 'Nice! After a shot you get 4 seconds to crawl to cover. Switch weapons with 1–6 or the buttons on the right. Good luck!',
    'tut.skip': 'Skip', 'tut.done': 'Done',
    'online.title': 'Snail Mail', 'online.blurb': 'Play a friend at your own pace. Create a match, send the link, play your turn whenever you have a minute.',
    'online.name': 'Your name', 'online.defaultName': 'Snail', 'online.create': 'Create match', 'online.copy': 'Copy link', 'online.copied': 'Copied!',
    'online.share': 'Share', 'online.refresh': 'Refresh', 'online.replaying': "Opponent's turn", 'online.skip': 'Skip',
    'online.yourTurn': 'Your turn', 'online.theirTurn': 'Waiting for {name}', 'online.open': 'Waiting for someone to join',
    'online.finished': 'Finished', 'online.won': 'You won!', 'online.lost': 'You lost', 'online.draw': 'Draw',
    'online.vs': 'vs {name}', 'online.none': 'No matches yet. Create one and send the link to a friend.',
    'online.inviteTitle': 'Invite an opponent', 'online.inviteText': 'Send the link to a friend. You can play your first turn right away.',
    'online.sending': 'Sending your turn…', 'online.sent': 'Your turn has been sent.', 'online.waitText': 'You get a new turn once {name} has played. This page refreshes by itself.',
    'online.error': 'Something went wrong: {msg}', 'online.rules': 'This match uses a different rules version and cannot be opened.',
    'online.desync': 'Warning: the match could not be reproduced exactly. Are you on different versions of the game?',
    'online.play': 'Play', 'online.show': 'Show', 'online.delete': 'Delete', 'online.loading': 'Loading…',
    'online.disabled': 'Snail Mail is not available right now (anonymous sign-in must be enabled).',
    'online.retry': 'Send again', 'online.playTurn': 'Play your turn',
    'online.pushBtn': "Notify me when it's my turn", 'online.pushOn': 'Notifications are on for this device.',
    'online.resign': 'Give up', 'online.resignConfirm': 'Sure? Press again and your opponent wins.', 'online.resigned': 'You gave up.',
    'online.rematch': 'Rematch', 'online.rematchMade': 'Rematch created. You go first.',
    'online.silent': '{name} has not played for {days} days.', 'online.claim': 'Claim the win',
    'online.claimed': 'You claimed the win.', 'online.accountHint': 'Your account lives in this browser only. Clearing site data removes your matches.',
    'online.bestOf': 'Series', 'online.bestOf1': 'Single match', 'online.bestOf3': 'Best of 3', 'online.bestOf5': 'Best of 5',
    'online.score': 'Score {me}–{them} · {label} · match {no}', 'online.next': 'Next match',
    'online.extend3': 'Extend to best of 3', 'online.extend5': 'Extend to best of 5',
    'online.seriesWon': 'You won the series {me}–{them}!', 'online.seriesLost': 'You lost the series {me}–{them}.',
    'online.matchWon': 'You won the match. Score {me}–{them}.', 'online.matchLost': 'You lost the match. Score {me}–{them}.',
    'online.pushIos': 'On iPhone and iPad, notifications require installing the game: Share → Add to Home Screen.',
    'online.pushDenied': 'Notifications are blocked in the browser.', 'online.pushFail': 'Could not turn on notifications.',
  },
};

let lang = 'sv';

export function detectLang() {
  const n = ((typeof navigator !== 'undefined' && navigator.language) || 'sv').toLowerCase();
  return n.startsWith('sv') ? 'sv' : 'en';
}
export function setLang(l) {
  lang = dict[l] ? l : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
export function getLang() { return lang; }

// t('msg.found', { name: 'Sniglinda', weapon: 'slem' }) – a `weapon` param is
// itself translated, everything else is inserted as is.
export function t(key, params) {
  let s = dict[lang][key] ?? dict.sv[key] ?? key;
  if (params) {
    for (const k of Object.keys(params)) {
      const v = k === 'weapon' ? t('weapon.' + params[k]) : params[k];
      s = s.split(`{${k}}`).join(v);
    }
  }
  return s;
}

// Format a message from the simulation: a string passes through, an object is a key with params.
export function fmt(m) {
  if (!m) return '';
  return typeof m === 'string' ? m : t(m.key, m);
}

// Translate every element carrying data-i18n / data-i18n-html / data-i18n-aria / data-i18n-title.
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
