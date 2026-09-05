// Rank and seasons. A season is a calendar quarter. The rating is Elo
// (K = 32, start 1000), computed on the server after every finished Snigelpost
// match; this module mirrors the arithmetic for tests and the labels.
import { online } from './supa.js';

export const TIERS = [
  { id: 'slug', min: -Infinity },   // Slemhög
  { id: 'garden', min: 950 },       // Trädgårdssnäcka
  { id: 'warrior', min: 1050 },     // Skalkrigare
  { id: 'master', min: 1150 },      // Saltmästare
  { id: 'giant', min: 1300 },       // Jättesnäcka
];
export function tierFor(rating) {
  let t = TIERS[0];
  for (const x of TIERS) if (rating >= x.min) t = x;
  return t.id;
}
export function elo(rHost, rGuest, winner) {
  const eh = 1 / (1 + Math.pow(10, (rGuest - rHost) / 400));
  const sh = winner === 0 ? 1 : winner === 1 ? 0 : 0.5;
  const d = Math.round(32 * (sh - eh));
  return { host: rHost + d, guest: rGuest - d };
}
export function seasonKey(d = new Date()) { return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; }
export function seasonEnd(d = new Date()) { return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 3, 1)); }
export function daysLeft(d = new Date()) { return Math.ceil((seasonEnd(d) - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86400000); }

export const season = {
  available() { return online.available(); },
  async get() { return online.rpc('snails_season'); },
};
