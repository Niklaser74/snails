// Platform adapter: the game runs on our own site, on itch.io and (with their
// SDK) on Poki. Everything platform-specific goes through this object so the
// rest of the code never checks where it is running.
//
//   platform.id              'web' | 'itch' | 'poki'
//   platform.init()          resolves when the platform is ready (Poki SDK loaded)
//   platform.loaded()        tell the platform the game is ready to play
//   platform.gameplayStart() a match starts / resumes
//   platform.gameplayStop()  a match ends or the player leaves it
//   platform.commercialBreak(onPause, onResume)  resolves after the ad (or immediately)
//   platform.allowExternalLinks  false on portals that forbid links out of the game
//   platform.useServiceWorker    false when hosted inside a portal iframe

function detect() {
  if (typeof location === 'undefined') return 'web';
  const forced = new URLSearchParams(location.search).get('platform');
  if (forced === 'poki' || forced === 'itch' || forced === 'web') return forced;
  const h = location.hostname;
  if (h.endsWith('.itch.zone') || h.endsWith('.itch.io')) return 'itch';
  if (h.endsWith('.poki.com') || h.endsWith('.poki-gdn.com') || h.endsWith('poki.dev')) return 'poki';
  return 'web';
}

const noop = {
  id: 'web',
  allowExternalLinks: true,
  useServiceWorker: true,
  async init() {},
  loaded() {},
  gameplayStart() {},
  gameplayStop() {},
  async commercialBreak() {},
  async rewardedBreak() { return false; },
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}

const poki = {
  ...noop,
  id: 'poki',
  allowExternalLinks: false,
  useServiceWorker: false,
  sdk: null,
  async init() {
    try {
      await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
      this.sdk = window.PokiSDK;
      if (new URLSearchParams(location.search).get('pokidebug')) this.sdk.setDebug(true);
      await this.sdk.init();
    } catch {
      this.sdk = null; // ad blocker or offline: the game must still work
    }
  },
  loaded() { this.sdk?.gameLoadingFinished(); },
  gameplayStart() { this.sdk?.gameplayStart(); },
  gameplayStop() { this.sdk?.gameplayStop(); },
  async commercialBreak(onPause, onResume) {
    if (!this.sdk) return;
    try {
      await this.sdk.commercialBreak(onPause);
    } finally {
      onResume?.();
    }
  },
  async rewardedBreak(onPause, onResume) {
    if (!this.sdk) return false;
    try {
      return await this.sdk.rewardedBreak(onPause);
    } catch {
      return false;
    } finally {
      onResume?.();
    }
  },
};

const itch = {
  ...noop,
  id: 'itch',
  allowExternalLinks: true,
  useServiceWorker: false, // itch serves the game from a sandboxed CDN origin per upload
};

export const platform = { web: noop, itch, poki }[detect()];
