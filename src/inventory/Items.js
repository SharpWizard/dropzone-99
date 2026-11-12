// Item catalogue, loot tables and world loot (spawning, lazy visuals, spatial queries).
import * as THREE from 'three';
import { WEAPONS, weaponMesh, grenadeMesh, builder, gearMat, AMMO_NAMES } from '../weapons/Weapons.js';
import { RNG } from '../utils/math.js';
import { FOOD_KEYS } from '../world/Buildings.js';

export const ITEMS = {
  ammo_556: { name: '5.56mm', type: 'ammo', n: 30, w: 0.5, col: 0x4a7a3a }, ammo_762: { name: '7.62mm', type: 'ammo', n: 30, w: 0.7, col: 0x9a6a2a }, ammo_9mm: { name: '9mm', type: 'ammo', n: 30, w: 0.375, col: 0xb89a2a },
  ammo_12g: { name: '12 Gauge', type: 'ammo', n: 10, w: 1.25, col: 0x9a2a2a }, ammo_338: { name: '.338 Mag', type: 'ammo', n: 10, w: 1, col: 0x3a5a8a },
  scope2: { name: '2x Scope', type: 'scope', zoom: 2, w: 10 }, scope4: { name: '4x Scope', type: 'scope', zoom: 4, w: 15 }, scope8: { name: '8x Scope', type: 'scope', zoom: 8, w: 20 },
  supp: { name: 'Suppressor', type: 'supp', w: 10 },
  helmet1: { name: 'Helmet Lv.1', type: 'helmet', lvl: 1, dur: 80 }, helmet2: { name: 'Helmet Lv.2', type: 'helmet', lvl: 2, dur: 150 }, helmet3: { name: 'Helmet Lv.3', type: 'helmet', lvl: 3, dur: 230 },
  vest1: { name: 'Body Armor Lv.1', type: 'vest', lvl: 1, dur: 200 }, vest2: { name: 'Body Armor Lv.2', type: 'vest', lvl: 2, dur: 220 }, vest3: { name: 'Body Armor Lv.3', type: 'vest', lvl: 3, dur: 250 },
  pack1: { name: 'Backpack Lv.1', type: 'pack', lvl: 1 }, pack2: { name: 'Backpack Lv.2', type: 'pack', lvl: 2 }, pack3: { name: 'Backpack Lv.3', type: 'pack', lvl: 3 },
  bandage: { name: 'Bandage', type: 'heal', n: 5, w: 2, heal: 12, cap: 75, time: 2.6 }, medkit: { name: 'First Aid Kit', type: 'heal', n: 1, w: 10, heal: 75, cap: 75, time: 5 },
  drink: { name: 'Energy Drink', type: 'heal', n: 1, w: 4, boost: 40, time: 3 },
  axe: { name: 'Survival Axe', type: 'melee', dmg: 85, rate: 0.62, w: 0, model: 'survival/axe_free_model' }, knife: { name: 'Combat Knife', type: 'melee', dmg: 58, rate: 0.36, w: 0, model: 'survival/knife_free_model' },
  shovel: { name: 'Shovel', type: 'melee', dmg: 70, rate: 0.55, w: 0, model: 'survival/shovel_free_model' },
  food: { name: 'Food Supply', type: 'heal', n: 1, w: 3, heal: 15, cap: 100, boost: 12, time: 2.4 }, frag: { name: 'Frag Grenade', type: 'throw', n: 1, w: 12 },
};
for (const id in WEAPONS) ITEMS[id] = { name: WEAPONS[id].name, type: 'weapon', w: 0 };
export const ARMOR_RED = [0, 0.3, 0.4, 0.55];
export const itemName = (id) => (ITEMS[id] ? ITEMS[id].name : id);

// weighted loot tables: [id, weight]
const TABLE = {
  1: [['kestrel', 7], ['ravager', 6], ['hornet', 8], ['breacher', 6], ['viper', 10], ['sentry', 2], ['longbow', 0.7], ['ammo_556', 12], ['ammo_762', 11], ['ammo_9mm', 12], ['ammo_12g', 6], ['ammo_338', 2],
    ['bandage', 14], ['medkit', 5], ['drink', 8], ['food', 9], ['frag', 5], ['helmet1', 6], ['helmet2', 2.5], ['vest1', 6], ['vest2', 2.5], ['pack1', 6], ['pack2', 3], ['scope2', 4], ['scope4', 1.5], ['supp', 2]],
  2: [['kestrel', 9], ['ravager', 9], ['hornet', 4], ['breacher', 3], ['sentry', 6], ['longbow', 4], ['ammo_556', 10], ['ammo_762', 12], ['ammo_9mm', 5], ['ammo_338', 6], ['ammo_12g', 3],
    ['bandage', 8], ['medkit', 9], ['drink', 7], ['food', 4], ['frag', 9], ['helmet2', 6], ['helmet3', 3], ['vest2', 6], ['vest3', 3], ['pack2', 5], ['pack3', 3], ['scope4', 5], ['scope8', 2.5], ['scope2', 3], ['supp', 4]],
};
// tier 3: food stalls, pantries and supply crates
TABLE[3] = [['food', 14], ['drink', 4], ['bandage', 3], ['medkit', 1]];
function roll(R, tier) { const t = TABLE[tier] || TABLE[1]; let sum = 0; for (const e of t) sum += e[1]; let r = R.f() * sum; for (const e of t) { r -= e[1]; if (r <= 0) return e[0]; } return t[0][0]; }
export const rollLoot = roll;

// ---------- small procedural item models ----------
const MG = {};
function itemGeo(id) {
  if (MG[id]) return MG[id]; const it = ITEMS[id]; const b = builder();
  if (it.type === 'ammo') { b.box(0.16, 0.08, 0.1, 0, 0.04, 0, it.col).box(0.165, 0.025, 0.105, 0, 0.055, 0, 0x1c1c1c).box(0.05, 0.085, 0.02, 0.03, 0.04, 0.045, 0xc8a84a); }
  else if (id === 'bandage') { b.tube(0.045, 0.07, 0, 0.045, -0.035, 0xe8e4d8).tube(0.047, 0.012, 0, 0.045, -0.006, 0xb83a2a); }
  else if (id === 'medkit') { b.box(0.26, 0.13, 0.18, 0, 0.065, 0, 0xb02a22).box(0.1, 0.135, 0.03, 0, 0.066, 0, 0xf0f0ea).box(0.03, 0.135, 0.1, 0, 0.066, 0, 0xf0f0ea).box(0.08, 0.02, 0.03, 0, 0.14, 0, 0x222222); }
  else if (id === 'drink') { b.tube(0.033, 0.13, 0, 0.033, -0.065, 0x1e62c8).tube(0.034, 0.03, 0, 0.033, -0.01, 0xd8d8d8).tube(0.028, 0.008, 0, 0.033, 0.065, 0xb8b8b8); }
  else if (it.type === 'helmet') { const c = [0, 0x5a5e52, 0x3e4a36, 0x2a2e30][it.lvl]; b.box(0.24, 0.1, 0.27, 0, 0.09, 0, c).box(0.2, 0.06, 0.23, 0, 0.16, 0, c).box(0.26, 0.02, 0.3, 0, 0.045, 0.01, 0x1c1c1c); if (it.lvl > 1) b.box(0.04, 0.12, 0.1, 0.13, 0.07, 0, 0x1c1c1c).box(0.04, 0.12, 0.1, -0.13, 0.07, 0, 0x1c1c1c); if (it.lvl > 2) b.box(0.16, 0.05, 0.05, 0, 0.1, 0.14, 0x111418); }
  else if (it.type === 'vest') { const c = [0, 0x6a6e5a, 0x44503a, 0x2c3034][it.lvl]; b.box(0.38, 0.1, 0.44, 0, 0.05, 0, c).box(0.3, 0.05, 0.14, 0, 0.12, 0.1, 0x22241e).box(0.09, 0.06, 0.12, -0.1, 0.125, -0.1, 0x22241e).box(0.09, 0.06, 0.12, 0.1, 0.125, -0.1, 0x22241e); }
  else if (it.type === 'pack') { const c = [0, 0x6a5e44, 0x3e4a36, 0x30343a][it.lvl]; b.box(0.3 + it.lvl * 0.03, 0.2, 0.42 + it.lvl * 0.04, 0, 0.1, 0, c).box(0.22, 0.08, 0.2, 0, 0.22, 0.05, c).box(0.04, 0.03, 0.4, 0.1, 0.01, 0, 0x1c1c1c).box(0.04, 0.03, 0.4, -0.1, 0.01, 0, 0x1c1c1c); }
  else if (it.type === 'scope') { const L = it.zoom >= 8 ? 0.3 : it.zoom >= 4 ? 0.22 : 0.12; b.tube(0.02, L, 0, 0.03, -L / 2, 0x1b1c1e).tube(0.028, 0.05, 0, 0.03, L / 2, 0x1b1c1e).tube(0.025, 0.04, 0, 0.03, -L / 2 - 0.04, 0x1b1c1e); }
  else if (id === 'supp') { b.tube(0.022, 0.18, 0, 0.022, -0.09, 0x1b1c1e); }
  else b.box(0.15, 0.1, 0.15, 0, 0.05, 0, 0x888888);
  return (MG[id] = b.done());
}
export function itemMesh(G, it) {
  const d = ITEMS[it.id]; let m;
  if (d.type === 'weapon') { m = weaponMesh(G, it.id, it.w ? it.w.scope : 0, it.w ? it.w.supp : false); m.rotation.set(0, it.rot, Math.PI / 2); m.position.y = 0.03; const g = new THREE.Group(); g.add(m); m = g; }
  else if (it.model && G.assets && G.assets.has(it.model)) { const f = G.assets.fitted(it.model, d.type === 'melee' ? { height: it.id === 'knife' ? 0.32 : 0.7 } : { length: 0.36 }); m = new THREE.Group(); if (f) { f.rotation.y = it.rot; if (d.type === 'melee') { f.rotation.z = 0.5; f.position.y = -0.25; } m.add(f); } }
  else if (it.id === 'food' && G.assets) { const keys = FOOD_KEYS.filter(k => G.assets.has(k)); const k = keys.length ? keys[Math.floor(Math.abs(Math.sin(it.rot * 91.7)) * keys.length) % keys.length] : null; const f = k && G.assets.fitted(k, { length: /pizza|pancake|waffle|steak/.test(k) ? 0.3 : 0.2 }); if (f) { f.rotation.y = it.rot; m = new THREE.Group(); m.add(f); } else { m = new THREE.Mesh(itemGeo('drink'), gearMat(G)); const g = new THREE.Group(); g.add(m); m = g; } }
  else if (it.id === 'frag') { m = grenadeMesh(G); m.rotation.y = it.rot; m.position.y = 0.05; const g = new THREE.Group(); g.add(m); m = g; }
  else { m = new THREE.Mesh(itemGeo(it.id), gearMat(G)); m.castShadow = true; m.rotation.y = it.rot; const g = new THREE.Group(); g.add(m); m = g; }
  return m;
}

const CELL = 12;
export class Loot {
  constructor(G) { this.G = G; this.items = []; this.hash = new Map(); this.group = new THREE.Group(); this.group.name = 'loot'; G.gfx.scene.add(this.group); this.visible = new Set(); this._t = 0;
    this.glowMat = new THREE.SpriteMaterial({ map: G.T.glow, color: 0xffd9a0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }); this.glowHi = this.glowMat.clone(); this.glowHi.color.set(0x8fd0ff); }
  _key(x, z) { return (Math.floor(x / CELL) + 512) * 2048 + Math.floor(z / CELL) + 512; }
  clear() { for (const it of this.visible) this.group.remove(it.mesh); this.items.length = 0; this.hash.clear(); this.visible.clear(); }

  add(id, n, x, y, z, w = null) {
    const it = { id, n: n || ITEMS[id].n || 1, x, y, z, w, rot: Math.random() * 6.28, mesh: null, alive: true, model: ITEMS[id].model || null };
    this.items.push(it); const k = this._key(x, z); let a = this.hash.get(k); if (!a) this.hash.set(k, a = []); a.push(it); return it;
  }
  // drop near a position, snapped to the floor
  drop(id, n, x, y, z, w = null) { const a = Math.random() * 6.28, r = 0.5 + Math.random() * 0.7; const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; const gy = this.G.colliders.groundAt(px, pz, y + 0.4); return this.add(id, n, px, gy, pz, w); }
  remove(it) { it.alive = false; if (it.mesh) { this.group.remove(it.mesh); this.visible.delete(it); it.mesh = null; } const a = this.hash.get(this._key(it.x, it.z)); if (a) { const i = a.indexOf(it); if (i >= 0) a.splice(i, 1); } }

  spawnAll(seed) {
    const R = new RNG(seed); const W = this.G.world;
    for (const s of W.lootSpots) {
      if (R.f() > (s.tier === 2 ? 0.62 : 0.4)) continue;
      const id = roll(R, s.tier); const d = ITEMS[id];
      if (d.type === 'weapon') { const def = WEAPONS[id]; this.add(id, 1, s.x, s.y, s.z, { ammo: def.mag, scope: 0, supp: false, mode: 0 }); const n = R.int(1, 2); for (let i = 0; i < n; i++) this.add('ammo_' + def.ammo, 0, s.x + R.range(-0.45, 0.45), s.y, s.z + R.range(-0.45, 0.45)); }
      else this.add(id, 0, s.x, s.y, s.z);
    }
    this.spawnFloating(R);
    // scattered field loot so open country is not empty
    for (let i = 0; i < 260; i++) { const x = R.range(-900, 900), z = R.range(-900, 900); if (!this.G.nav.isLandFree(x, z)) continue; const y = W.heightAt(x, z); const id = roll(R, 1); const d = ITEMS[id]; if (d.type === 'weapon') { this.add(id, 1, x, y, z, { ammo: WEAPONS[id].mag, scope: 0, supp: false, mode: 0 }); this.add('ammo_' + WEAPONS[id].ammo, 0, x + 0.4, y, z + 0.2); } else this.add(id, 0, x, y, z); }
  }

  near(x, z, r, out) {
    out.length = 0; const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.hash.get((i + 512) * 2048 + j + 512); if (a) for (const it of a) { const dx = it.x - x, dz = it.z - z; if (dx * dx + dz * dz < r * r) out.push(it); } }
    return out;
  }
  nearest(x, y, z, r, filter) { let best = null, bd = r * r; const tmp = this.near(x, z, r, this._tmp || (this._tmp = [])); for (const it of tmp) { if (Math.abs(it.y - y) > 1.6) continue; if (filter && !filter(it)) continue; const d = (it.x - x) ** 2 + (it.z - z) ** 2; if (d < bd) { bd = d; best = it; } } return best; }

  // floating pickups (supplies and pistols hovering above the ground): bob, spin, pulse - every frame for the visible ones
  _float(t) { for (const it of this.visible) { if (!it.float || !it.mesh) continue; const ph = it.rot * 3.1; it.mesh.position.y = it.y + Math.sin(t * 2.1 + ph) * 0.12; it.mesh.rotation.y = t * 1.3 + ph; if (it.halo) { const k = 0.85 + Math.sin(t * 4 + ph) * 0.15; it.halo.scale.setScalar(it.haloS * k); } } }
  // scatter floating supplies and a few pistols across the island (towns, woods, open ground)
  spawnFloating(R) {
    const G = this.G, W = G.world; const SUP = [['medkit', 'survival/first_aid_kit_free_model', 4], ['bandage', 'survival/first_aid_kit_free_model_b', 6], ['drink', 'survival/water_bottle_free_model', 5], ['food', 'survival/can_free_model', 5], ['food', 'survival/can_red_free_model', 3],
      ['axe', null, 1.6], ['knife', null, 1.6], ['shovel', null, 1]]; let sum = 0; for (const s of SUP) sum += s[2];
    const place = (near) => { for (let k = 0; k < 12; k++) { const L = near ? R.pick(W.locations) : null; const x = L ? L.x + R.range(-L.r, L.r) * 0.85 : R.range(-880, 880), z = L ? L.z + R.range(-L.r, L.r) * 0.85 : R.range(-880, 880); if (!G.nav.isLandFree(x, z)) continue; const gy = G.colliders.groundAt(x, z, W.heightAt(x, z) + 0.5); if (gy < 1) continue; return [x, gy + 1.15, z]; } return null; };
    let n = 0; for (let i = 0; i < 170; i++) { const p = place(i % 2 === 0); if (!p) continue; let r = R.f() * sum, pick = SUP[0]; for (const s of SUP) { r -= s[2]; if (r <= 0) { pick = s; break; } }
      const it = this.add(pick[0], 0, p[0], p[1], p[2]); it.float = true; if (pick[1]) it.model = pick[1]; n++; }
    for (let i = 0; i < 28; i++) { const p = place(i % 3 !== 0); if (!p) continue; const it = this.add('viper', 1, p[0], p[1], p[2], { ammo: WEAPONS.viper.mag, scope: 0, supp: false, mode: 0 }); it.float = true; this.add('ammo_9mm', 0, p[0] + 0.4, p[1] - 1.1, p[2]); n++; }
    return n;
  }

  update(px, py, pz) {
    this._float(performance.now() / 1000);
    if (this._t++ % 15) return; const R = 58; const list = this.near(px, pz, R, this._tmp2 || (this._tmp2 = []));
    for (const it of this.visible) { const dx = it.x - px, dz = it.z - pz; if (dx * dx + dz * dz > (R + 8) * (R + 8)) { this.group.remove(it.mesh); it.mesh = null; this.visible.delete(it); } }
    for (const it of list) if (!it.mesh && it.alive) {
      const m = it.mesh = itemMesh(this.G, it); m.position.set(it.x, it.y, it.z); if (it.float) m.scale.setScalar(1.3);
      const d = ITEMS[it.id]; const s = new THREE.Sprite(d.type === 'weapon' || (d.lvl || 0) >= 2 || it.id === 'medkit' || it.id === 'scope8' || it.id === 'scope4' ? this.glowHi : this.glowMat); s.scale.setScalar(d.type === 'weapon' ? 0.9 : 0.5); s.position.y = 0.1; m.add(s); if (it.float) { const h = new THREE.Sprite(d.type === 'weapon' || d.type === 'melee' ? this.glowHi : this.glowMat); it.haloS = 1.1; h.scale.setScalar(1.1); m.add(h); it.halo = h; }
      this.group.add(m); this.visible.add(it);
    }
  }
}
export { AMMO_NAMES };
