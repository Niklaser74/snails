// UI strings in Swedish and English. The simulation never produces text: it
// emits { key, ...params } objects and the UI formats them here.
export const LANGS = { sv: 'Svenska', en: 'English' };

const dict = {
  sv: {
    'app.tagline': 'Turbaserat artilleri med afrikanska jättesnäckor. Långsamma. Skalade. Dödliga.',
    'menu.teams': 'Lag', 'menu.per': 'Snäckor per lag', 'menu.style': 'Snäckstil', 'menu.lang': 'Språk',
    'menu.start': 'Starta match', 'menu.design': 'Snäckdesign', 'menu.help': 'Så spelar du', 'menu.install': 'Installera app',
    'menu.offline': 'Spelet är sparat för offline-spel.', 'menu.human': 'Människa', 'menu.ai': 'Dator',
    'menu.teamName': 'Lagnamn', 'menu.player': 'Spelare',
    'team.0': 'Slemligan', 'team.1': 'Skalbaggarna', 'team.2': 'Salta Hundar', 'team.3': 'Turbosniglarna',
    'help.title': 'Så spelar du',
    'help.1': '<b>Gå:</b> ← → eller A/D. Snäckor är långsamma, men kan <b>hoppa</b> med Enter/⤴.',
    'help.2': '<b>Sikta:</b> ↑ ↓ eller W/S. <b>Skjut:</b> håll in mellanslag för att ladda kraft, släpp för att skjuta. En prickad bana visar vart skottet tar vägen.',
    'help.3': '<b>Vapen:</b> 1–6 eller Tab. Bazooka påverkas av vinden. Granaten studsar och smäller efter 3 s. Saltsprutan gör kort, spridd skada (salt är snäckors värsta fiende). Dynamit läggs vid fötterna – kryp iväg!',
    'help.4': '<b>Slemklot</b> klibbar fast där det landar, även på en snäcka, och smäller efter 2 s. <b>Saltregn</b> siktas med en markör: ← → flyttar markören, skjut släpper fem saltkristaller från himlen. Dynamit, slemklot och saltregn har begränsad ammunition (siffran på knappen).',
    'help.5': '<b>Lådor</b> faller ner mellan dragen. Gå fram till en landad låda för att plocka upp den: hälsolådor ger +35, vapenlådor extra ammunition. Lådor i en explosion smäller själva.',
    'help.6': '<b>Turordning:</b> 45 sekunder per drag. Efter skottet får du 4 sekunder att retirera.',
    'help.7': '<b>Kamera:</b> dra med musen/fingret för att panorera, scrolla eller nyp för att zooma. <b>Plötslig död:</b> efter 16 drag börjar vattnet stiga.',
    'help.close': 'Stäng', 'help.guide': 'Visa guiden igen',
    'go.title': 'Matchen är slut', 'go.again': 'Spela igen', 'go.menu': 'Till menyn', 'go.win': '{name} vinner!', 'go.draw': 'Oavgjort!',
    'hud.wind': 'Vind', 'hud.ai': '(dator)', 'hud.fire': 'SKJUT',
    'aria.left': 'Vänster', 'aria.right': 'Höger', 'aria.jump': 'Hoppa', 'aria.up': 'Sikta upp', 'aria.down': 'Sikta ner', 'aria.menu': 'Meny',
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
  },
  en: {
    'app.tagline': 'Turn-based artillery with giant African land snails. Slow. Shelled. Deadly.',
    'menu.teams': 'Teams', 'menu.per': 'Snails per team', 'menu.style': 'Snail style', 'menu.lang': 'Language',
    'menu.start': 'Start match', 'menu.design': 'Snail designs', 'menu.help': 'How to play', 'menu.install': 'Install app',
    'menu.offline': 'The game is saved for offline play.', 'menu.human': 'Human', 'menu.ai': 'Computer',
    'menu.teamName': 'Team name', 'menu.player': 'Player',
    'team.0': 'Slime Gang', 'team.1': 'Shell Shockers', 'team.2': 'Salty Dogs', 'team.3': 'Turbo Snails',
    'help.title': 'How to play',
    'help.1': '<b>Walk:</b> ← → or A/D. Snails are slow, but they can <b>jump</b> with Enter/⤴.',
    'help.2': '<b>Aim:</b> ↑ ↓ or W/S. <b>Shoot:</b> hold Space to charge power, release to fire. A dotted path shows where the shot will go.',
    'help.3': '<b>Weapons:</b> 1–6 or Tab. The bazooka is affected by wind. The grenade bounces and blows after 3 s. The salt shaker does short, spread damage (salt is a snail\'s worst enemy). Dynamite is placed at your feet – crawl away!',
    'help.4': '<b>Slime ball</b> sticks where it lands, even on a snail, and blows after 2 s. <b>Salt rain</b> is aimed with a marker: ← → move the marker, fire drops five salt crystals from the sky. Dynamite, slime ball and salt rain have limited ammo (the number on the button).',
    'help.5': '<b>Crates</b> drop between turns. Walk up to a landed crate to pick it up: health crates give +35, weapon crates extra ammo. Crates caught in an explosion blow up.',
    'help.6': '<b>Turns:</b> 45 seconds each. After firing you get 4 seconds to retreat.',
    'help.7': '<b>Camera:</b> drag with the mouse/finger to pan, scroll or pinch to zoom. <b>Sudden death:</b> after 16 turns the water starts rising.',
    'help.close': 'Close', 'help.guide': 'Show the guide again',
    'go.title': 'Match over', 'go.again': 'Play again', 'go.menu': 'Back to menu', 'go.win': '{name} wins!', 'go.draw': 'Draw!',
    'hud.wind': 'Wind', 'hud.ai': '(computer)', 'hud.fire': 'FIRE',
    'aria.left': 'Left', 'aria.right': 'Right', 'aria.jump': 'Jump', 'aria.up': 'Aim up', 'aria.down': 'Aim down', 'aria.menu': 'Menu',
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
