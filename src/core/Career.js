// Saved progress across matches (localStorage): lifetime points, kills, rescues, caches, drops, bounties and the
// locations ever discovered. Points raise your rank; ranks unlock a better starting loadout.
const KEY = 'dz.career';
export const RANKS = [
  [0, 'RECRUIT', null], [600, 'SCOUT', 'Start with bandages'], [1800, 'RANGER', 'Start with a VIPER P9 pistol'], [4000, 'SPECIALIST', 'Start with a survival axe'],
  [7500, 'VETERAN', 'Start with a Lv.1 helmet and vest'], [12000, 'ELITE', 'Start with a Lv.1 backpack and first aid kit'], [20000, 'LEGEND', 'Start with a KESTREL-556 rifle'],
];

export class Career {
  constructor(G) { this.G = G; this.d = { points: 0, kills: 0, rescues: 0, caches: 0, drops: 0, bounties: 0, matches: 0, wins: 0, best: 0, seen: [] }; try { Object.assign(this.d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* fresh */ } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { /* storage blocked */ } }
  add(k, n) { this.d[k] = (this.d[k] || 0) + n; this.save(); }
  discover(id) { if (!this.d.seen.includes(id)) { this.d.seen.push(id); this.save(); } }
  rankIndex(pts = this.d.points) { let i = 0; for (let k = 0; k < RANKS.length; k++) if (pts >= RANKS[k][0]) i = k; return i; }
  rank() { return RANKS[this.rankIndex()][1]; }
  next() { const i = this.rankIndex(); return RANKS[i + 1] || null; }

  // starting kit from the unlocked ranks
  applyLoadout(P) {
    const r = this.rankIndex();
    if (r >= 1) P.bag.bandage = (P.bag.bandage || 0) + 4;
    if (r >= 2) { P.weapons[2] = { id: 'viper', ammo: 15, scope: 0, supp: false, mode: 0 }; P.bag.ammo_9mm = (P.bag.ammo_9mm || 0) + 45; }
    if (r >= 3) P.meleeItem = 'axe';
    if (r >= 4) { P.helmet.lvl = 1; P.helmet.dur = 80; P.vest.lvl = 1; P.vest.dur = 200; }
    if (r >= 5) { P.pack = Math.max(P.pack, 1); P.bag.medkit = (P.bag.medkit || 0) + 1; }
    if (r >= 6) { P.weapons[0] = { id: 'kestrel', ammo: 30, scope: 0, supp: false, mode: 0 }; P.bag.ammo_556 = (P.bag.ammo_556 || 0) + 90; }
    if (P.weapons[0] || P.weapons[2]) { P._wkey = ''; if (P.cur < 0) for (const i of [0, 2]) if (P.weapons[i]) { P.switchTo(i, true); break; } }
  }

  // end of match: bank the match
  bank(result) {
    const before = this.rankIndex(); this.d.points += Math.max(0, result.points || 0); this.d.kills += result.kills || 0; this.d.matches++; if (result.win) this.d.wins++; this.d.best = Math.max(this.d.best, result.points || 0); this.save();
    const after = this.rankIndex(); return after > before ? RANKS[after] : null;
  }

  summary() { const n = this.next(); return { rank: this.rank(), points: this.d.points, next: n ? n[0] - this.d.points + ' pts to ' + n[1] + (n[2] ? ' · ' + n[2] : '') : 'max rank', seen: this.d.seen.length }; }
}
