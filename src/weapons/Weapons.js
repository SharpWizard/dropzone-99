// Weapon definitions (original designs) and procedural weapon models.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// dmg: per bullet. spread in degrees [hip, ads]. recoil [vertical, horizontal] degrees per shot. range [falloffStart, falloffEnd, minMult]
export const WEAPONS = {
  kestrel: { id: 'kestrel', name: 'KESTREL-556', cls: 'AR', slot: 'primary', ammo: '556', mag: 30, rpm: 720, dmg: 26, modes: ['AUTO', 'BURST', 'SINGLE'], reload: 2.2, recoil: [0.62, 0.3], spread: [2.4, 0.28], range: [70, 320, 0.6], hear: 300, pellets: 1, hold: 'rifle', snd: 'ar', scopes: true, supp: true },
  ravager: { id: 'ravager', name: 'RAVAGER-762', cls: 'AR', slot: 'primary', ammo: '762', mag: 30, rpm: 600, dmg: 35, modes: ['AUTO', 'SINGLE'], reload: 2.6, recoil: [0.95, 0.46], spread: [2.8, 0.34], range: [60, 300, 0.62], hear: 330, pellets: 1, hold: 'rifle', snd: 'ak', scopes: true, supp: true },
  hornet: { id: 'hornet', name: 'HORNET-9', cls: 'SMG', slot: 'primary', ammo: '9mm', mag: 32, rpm: 920, dmg: 18, modes: ['AUTO', 'SINGLE'], reload: 1.9, recoil: [0.42, 0.3], spread: [1.9, 0.5], range: [25, 120, 0.45], hear: 220, pellets: 1, hold: 'rifle', snd: 'smg', scopes: true, supp: true },
  sentry: { id: 'sentry', name: 'SENTRY DMR', cls: 'DMR', slot: 'primary', ammo: '762', mag: 10, rpm: 300, dmg: 54, modes: ['SINGLE'], reload: 2.7, recoil: [1.5, 0.4], spread: [3.2, 0.1], range: [150, 500, 0.75], hear: 360, pellets: 1, hold: 'rifle', snd: 'dmr', scopes: true, supp: true, baseScope: 4 },
  longbow: { id: 'longbow', name: 'LONGBOW-338', cls: 'SNIPER', slot: 'primary', ammo: '338', mag: 5, rpm: 40, dmg: 108, modes: ['SINGLE'], reload: 3.4, recoil: [3.4, 0.5], spread: [5, 0.03], range: [300, 800, 0.85], hear: 420, pellets: 1, hold: 'rifle', snd: 'sniper', scopes: true, supp: true, baseScope: 4, bolt: true },
  breacher: { id: 'breacher', name: 'BREACHER-12', cls: 'SHOTGUN', slot: 'primary', ammo: '12g', mag: 6, rpm: 78, dmg: 15, modes: ['SINGLE'], reload: 3.1, recoil: [3.2, 0.9], spread: [4.4, 3.4], range: [12, 45, 0.15], hear: 300, pellets: 9, hold: 'rifle', snd: 'shotgun', scopes: false, supp: false },
  viper: { id: 'viper', name: 'VIPER P9', cls: 'PISTOL', slot: 'sidearm', ammo: '9mm', mag: 15, rpm: 420, dmg: 23, modes: ['SINGLE'], reload: 1.6, recoil: [1.1, 0.4], spread: [2.2, 0.6], range: [20, 80, 0.4], hear: 200, pellets: 1, hold: 'pistol', snd: 'pistol', scopes: false, supp: true },
};
export const AMMO_NAMES = { '556': '5.56mm', '762': '7.62mm', '9mm': '9mm', '12g': '12 Gauge', '338': '.338 Mag' };

const GEOS = {}; let MAT = null;
export function gearMat(G) { if (!MAT) MAT = G.gfx.std({ vertexColors: true, roughness: 0.48, metalness: 0.6 }); return MAT; }
export function builder() {
  const parts = [];
  const add = (g, color) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g); };
  return {
    box(w, h, d, x, y, z, color, rx = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); add(g, color); return this; },
    tube(r, len, x, y, z, color, r2, seg = 10) { const g = new THREE.CylinderGeometry(r2 === undefined ? r : r2, r, len, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z + len / 2); add(g, color); return this; },
    done() { const g = mergeGeometries(parts); g.computeBoundingSphere(); return g; },
  };
}
const BLK = 0x1b1c1e, GUN = 0x2a2c30, TAN = 0x8a7550, WOOD = 0x6a4326, OD = 0x3c4232, STEEL = 0x55585c;

function build(id) {
  const b = builder(); let fore, mag, muzzle, scopeAt = [0.06, 0.095, 0.1];
  if (id === 'kestrel') {
    b.box(0.046, 0.078, 0.27, 0, 0.036, 0.085, GUN).box(0.05, 0.056, 0.27, 0, 0.04, 0.345, BLK).box(0.02, 0.014, 0.5, 0, 0.082, 0.22, STEEL).tube(0.0115, 0.2, 0, 0.042, 0.47, STEEL).tube(0.016, 0.055, 0, 0.042, 0.66, BLK)
      .box(0.036, 0.05, 0.22, 0, 0.03, -0.16, BLK).box(0.044, 0.125, 0.035, 0, 0.005, -0.275, BLK).box(0.034, 0.105, 0.045, 0, -0.055, -0.012, BLK, 0.3).box(0.03, 0.17, 0.062, 0, -0.085, 0.125, STEEL, -0.16)
      .box(0.012, 0.045, 0.012, 0, 0.105, 0.46, BLK).box(0.03, 0.035, 0.03, 0, 0.1, 0.0, BLK).box(0.008, 0.03, 0.07, 0.026, 0.045, 0.1, STEEL).box(0.012, 0.04, 0.04, 0, -0.02, 0.05, BLK).box(0.054, 0.02, 0.2, 0, 0.012, 0.345, GUN);
    fore = [0.02, -0.005, 0.36]; mag = [0, -0.12, 0.13]; muzzle = [0, 0.042, 0.72];
  } else if (id === 'ravager') {
    b.box(0.046, 0.07, 0.3, 0, 0.035, 0.09, GUN).box(0.05, 0.05, 0.2, 0, 0.03, 0.34, WOOD).box(0.04, 0.03, 0.2, 0, 0.072, 0.34, WOOD).tube(0.012, 0.3, 0, 0.04, 0.42, STEEL).tube(0.009, 0.2, 0, 0.068, 0.42, STEEL).tube(0.017, 0.05, 0, 0.04, 0.72, BLK)
      .box(0.04, 0.07, 0.24, 0, 0.015, -0.17, WOOD, -0.08).box(0.044, 0.12, 0.03, 0, -0.01, -0.295, BLK).box(0.034, 0.1, 0.045, 0, -0.05, -0.012, WOOD, 0.3)
      .box(0.03, 0.12, 0.062, 0, -0.06, 0.13, STEEL, -0.2).box(0.03, 0.1, 0.06, 0, -0.15, 0.165, STEEL, -0.55).box(0.012, 0.05, 0.014, 0, 0.09, 0.66, BLK).box(0.03, 0.022, 0.05, 0, 0.08, 0.2, BLK).box(0.012, 0.04, 0.04, 0, -0.02, 0.05, BLK);
    fore = [0.02, -0.008, 0.34]; mag = [0, -0.13, 0.15]; muzzle = [0, 0.04, 0.78];
  } else if (id === 'hornet') {
    b.box(0.048, 0.085, 0.3, 0, 0.04, 0.09, GUN).box(0.044, 0.05, 0.1, 0, 0.03, 0.28, BLK).tube(0.012, 0.09, 0, 0.045, 0.3, STEEL).tube(0.018, 0.04, 0, 0.045, 0.38, BLK)
      .box(0.036, 0.11, 0.05, 0, -0.055, 0.0, BLK, 0.18).box(0.028, 0.2, 0.042, 0, -0.17, 0.02, STEEL, 0.1).box(0.01, 0.012, 0.22, 0.022, 0.06, -0.16, STEEL).box(0.01, 0.012, 0.22, -0.022, 0.06, -0.16, STEEL).box(0.05, 0.09, 0.02, 0, 0.03, -0.275, BLK)
      .box(0.02, 0.014, 0.26, 0, 0.09, 0.1, STEEL).box(0.03, 0.06, 0.04, 0, -0.01, 0.25, BLK).box(0.012, 0.04, 0.04, 0, -0.02, 0.06, BLK);
    fore = [0.015, -0.03, 0.26]; mag = [0, -0.2, 0.03]; muzzle = [0, 0.045, 0.43]; scopeAt = [0.06, 0.103, 0.06];
  } else if (id === 'sentry') {
    b.box(0.048, 0.07, 0.34, 0, 0.035, 0.1, GUN).box(0.052, 0.055, 0.32, 0, 0.025, 0.4, TAN).tube(0.013, 0.32, 0, 0.045, 0.5, STEEL).tube(0.018, 0.07, 0, 0.045, 0.82, BLK)
      .box(0.044, 0.085, 0.3, 0, 0.012, -0.2, TAN, -0.06).box(0.046, 0.13, 0.03, 0, -0.01, -0.355, BLK).box(0.036, 0.1, 0.045, 0, -0.05, -0.02, TAN, 0.35).box(0.032, 0.11, 0.07, 0, -0.06, 0.14, STEEL, -0.08)
      .box(0.02, 0.014, 0.4, 0, 0.078, 0.14, STEEL).box(0.04, 0.03, 0.14, 0, 0.045, -0.2, BLK).box(0.012, 0.04, 0.04, 0, -0.02, 0.05, BLK);
    fore = [0.02, -0.012, 0.42]; mag = [0, -0.1, 0.14]; muzzle = [0, 0.045, 0.9];
  } else if (id === 'longbow') {
    b.box(0.05, 0.075, 0.36, 0, 0.035, 0.1, OD).box(0.054, 0.06, 0.34, 0, 0.02, 0.42, OD).tube(0.015, 0.5, 0, 0.05, 0.45, STEEL, 0.012).tube(0.022, 0.09, 0, 0.05, 0.95, BLK)
      .box(0.048, 0.1, 0.34, 0, 0.005, -0.23, OD, -0.05).box(0.05, 0.14, 0.03, 0, -0.01, -0.405, BLK).box(0.04, 0.035, 0.16, 0, 0.068, -0.2, BLK).box(0.038, 0.11, 0.05, 0, -0.055, -0.02, OD, 0.4)
      .box(0.034, 0.07, 0.09, 0, -0.04, 0.14, STEEL).tube(0.008, 0.06, -0.05, 0.05, 0.02, STEEL).box(0.018, 0.018, 0.018, -0.085, 0.045, 0.05, BLK).box(0.012, 0.012, 0.3, 0.03, -0.02, 0.44, BLK).box(0.012, 0.012, 0.3, -0.03, -0.02, 0.44, BLK).box(0.012, 0.04, 0.04, 0, -0.02, 0.05, BLK);
    fore = [0.02, -0.02, 0.4]; mag = [0, -0.08, 0.14]; muzzle = [0, 0.05, 1.05]; scopeAt = [0.08, 0.1, 0.12];
  } else if (id === 'breacher') {
    b.box(0.05, 0.075, 0.28, 0, 0.035, 0.08, GUN).tube(0.014, 0.5, 0, 0.055, 0.2, STEEL).tube(0.014, 0.42, 0, 0.022, 0.2, STEEL).box(0.052, 0.05, 0.16, 0, 0.022, 0.38, WOOD)
      .box(0.042, 0.075, 0.28, 0, 0.008, -0.2, WOOD, -0.1).box(0.044, 0.12, 0.03, 0, -0.02, -0.345, BLK).box(0.036, 0.09, 0.05, 0, -0.045, -0.03, WOOD, 0.45).box(0.01, 0.02, 0.01, 0, 0.078, 0.68, STEEL).box(0.012, 0.04, 0.04, 0, -0.02, 0.05, BLK);
    fore = [0.02, -0.01, 0.38]; mag = [0, 0.0, 0.3]; muzzle = [0, 0.055, 0.72];
  } else { // viper pistol
    b.box(0.03, 0.036, 0.19, 0, 0.045, 0.065, GUN).box(0.028, 0.03, 0.15, 0, 0.012, 0.055, BLK).box(0.03, 0.11, 0.045, 0, -0.05, -0.005, BLK, 0.22).tube(0.007, 0.02, 0, 0.045, 0.16, STEEL).box(0.006, 0.012, 0.006, 0, 0.068, 0.15, BLK).box(0.02, 0.012, 0.008, 0, 0.068, -0.02, BLK).box(0.008, 0.03, 0.05, 0, -0.012, 0.055, BLK);
    fore = [0.035, -0.03, 0.0]; mag = [0, -0.12, 0.0]; muzzle = [0, 0.045, 0.19];
  }
  return { geo: b.done(), fore, mag, muzzle, scopeAt };
}

function scopeGeo(zoom) {
  const b = builder(); const L = zoom >= 8 ? 0.3 : zoom >= 4 ? 0.22 : 0.1, r = zoom >= 8 ? 0.021 : 0.017;
  b.tube(r, L, 0, 0.04, 0, BLK).tube(r * 1.45, 0.05, 0, 0.04, L, BLK).tube(r * 1.25, 0.04, 0, 0.04, -0.04, BLK).tube(r * 1.3, 0.004, 0, 0.04, L + 0.046, 0x3a5a7a).box(0.016, 0.03, 0.02, 0, 0.012, 0.03, STEEL).box(0.016, 0.03, 0.02, 0, 0.012, L - 0.03, STEEL).tube(0.008, 0.02, 0, 0.065, L * 0.5, BLK);
  return b.done();
}

// GLB replacements from the Ultimate Guns Pack. len: metres, gz/gy: grip position as a fraction of length (from the stock) / height,
// my: barrel height fraction, fz: fore-end grip as a fraction of length ahead of the grip
// Muzzle direction per model, checked by eye side-on: these files have the stock at +Z, so they are turned around.
const GUN_FLIP = new Set(['weapons/scifi_ar_a', 'weapons/scifi_ar_d', 'weapons/scifi_ar_e', 'weapons/scifi_grenade_launcher', 'weapons/scifi_pistol_a', 'weapons/scifi_pistol_b', 'weapons/scifi_smg', 'weapons/scifi_sniper']);
export const GUN_GLB = {
  kestrel: { keys: ['weapons/scifi_ar_a', 'weapons/scifi_ar_c', 'weapons/scifi_ar_e'], len: 0.9, gz: 0.4, gy: 0.5, my: 0.6, fz: 0.3,  },
  ravager: { keys: ['weapons/scifi_ar_b', 'weapons/scifi_ar_d', 'weapons/rifle_q'], len: 0.95, gz: 0.4, gy: 0.5, my: 0.6, fz: 0.3,  },
  hornet: { keys: ['weapons/scifi_smg'], len: 0.66, gz: 0.42, gy: 0.5, my: 0.6, fz: 0.3,  },
  sentry: { keys: ['weapons/capacitor_rifle'], len: 1.12, gz: 0.36, gy: 0.5, my: 0.6, fz: 0.27,  },
  longbow: { keys: ['weapons/scifi_sniper'], len: 1.25, gz: 0.34, gy: 0.5, my: 0.6, fz: 0.26,  },
  breacher: { keys: ['weapons/scifi_grenade_launcher'], len: 0.95, gz: 0.36, gy: 0.5, my: 0.6, fz: 0.32,  },
  viper: { keys: ['weapons/scifi_pistol_a', 'weapons/scifi_pistol_b', 'weapons/pistol_q'], len: 0.24, gz: 0.25, gy: 0.5, my: 0.6, fz: 0.0,  },
};
// Find a gun model's grip from its own geometry: the pistol grip is the lowest-hanging part in the rear 70 % of the
// gun, the fore-end is the front of the body. Results are cached per model.
const GRIPS = new Map();
function gripOf(f, key) {
  if (GRIPS.has(key)) return GRIPS.get(key);
  f.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(f); const z0 = box.min.z, L = box.max.z - z0, y0 = box.min.y, H = box.max.y - y0;
  const bins = 24, low = new Array(bins).fill(Infinity), high = new Array(bins).fill(-Infinity), v = new THREE.Vector3();
  f.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i += 2) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); const k = Math.min(bins - 1, Math.max(0, Math.floor((v.z - z0) / L * bins))); if (v.y < low[k]) low[k] = v.y; if (v.y > high[k]) high[k] = v.y; } });
  // body line = median of the column tops; anything well below it is a grip / magazine
  const tops = high.filter(isFinite).sort((p, q) => p - q), top = tops[Math.floor(tops.length / 2)];
  let gi = -1, gl = Infinity; for (let k = Math.floor(bins * 0.05); k < Math.floor(bins * 0.72); k++) if (low[k] < gl) { gl = low[k]; gi = k; }
  // grip is the rearmost column that hangs nearly as low as the lowest point (magazines sit in front of it)
  for (let k = Math.floor(bins * 0.05); k <= gi; k++) if (low[k] < gl + H * 0.12) { gi = k; break; }
  const g = { gz: (gi + 0.5) / bins, gripY: (Math.min(top - H * 0.12, low[gi] + H * 0.55) - y0) / H, bodyY: (top - H * 0.18 - y0) / H, my: (top - H * 0.12 - y0) / H };
  // fore-end: first column ahead of the grip area that does not hang down (the hand-guard)
  g.fz = Math.min(0.92, g.gz + 0.32);
  GRIPS.set(key, g); return g;
}

function glbWeapon(G, id, scope, supp) {
  const c = GUN_GLB[id], def = WEAPONS[id]; const key = c.keys[Math.floor(Math.random() * c.keys.length)]; const f = G.assets.fitted(key, { length: c.len, flip: GUN_FLIP.has(key) }); if (!f) return null;
  const sz = f.userData.size, L = sz.z, H = sz.y; const g = gripOf(f, key);
  // the grip point sits at the mount origin (right hand); model length runs along +Z towards the muzzle
  f.position.set(0, -H * g.gripY, L * (0.5 - g.gz)); const grp = new THREE.Group(); grp.add(f);
  const muzzle = new THREE.Vector3(0, H * (g.my - g.gripY), L * (1 - g.gz));
  const zoom = scope || def.baseScope || 0;
  if (zoom) { const k2 = 'scope' + zoom; if (!GEOS[k2]) GEOS[k2] = scopeGeo(zoom); const sc = new THREE.Mesh(GEOS[k2], gearMat(G)); sc.position.set(0, H * (1 - g.gripY) - 0.012, L * (0.12 - g.gz + 0.2)); sc.castShadow = true; grp.add(sc); }
  if (supp) { if (!GEOS.supp) GEOS.supp = builder().tube(0.021, 0.17, 0, 0, 0, 0x1b1c1e).done(); const sp = new THREE.Mesh(GEOS.supp, gearMat(G)); sp.position.copy(muzzle).z -= 0.02; grp.add(sp); muzzle.z += 0.15; }
  grp.userData = { fore: new THREE.Vector3(0.015, H * (g.bodyY - g.gripY) - 0.03, L * (g.fz - g.gz)), magPos: new THREE.Vector3(0, -H * 0.35, L * 0.08), muzzle, id };
  return grp;
}

export function weaponMesh(G, id, scope = 0, supp = false) {
  if (G.assets && GUN_GLB[id] && GUN_GLB[id].keys.some(k => G.assets.has(k))) { const g = glbWeapon(G, id, scope, supp); if (g) return g; }
  if (!MAT) MAT = G.gfx.std({ vertexColors: true, roughness: 0.48, metalness: 0.6 });
  if (!GEOS[id]) GEOS[id] = build(id); const d = GEOS[id]; const def = WEAPONS[id];
  const grp = new THREE.Group(); const m = new THREE.Mesh(d.geo, MAT); m.castShadow = true; grp.add(m);
  const zoom = scope || def.baseScope || 0;
  if (zoom) { const key = 'scope' + zoom; if (!GEOS[key]) GEOS[key] = scopeGeo(zoom); const s = new THREE.Mesh(GEOS[key], MAT); s.position.set(0, d.scopeAt[1] - 0.012, d.scopeAt[2] - 0.05); s.castShadow = true; grp.add(s); }
  const muzzle = new THREE.Vector3(...d.muzzle);
  if (supp) { if (!GEOS.supp) GEOS.supp = builder().tube(0.021, 0.17, 0, 0, 0, BLK).done(); const s = new THREE.Mesh(GEOS.supp, MAT); s.position.copy(muzzle).z -= 0.03; grp.add(s); muzzle.z += 0.14; }
  grp.userData = { fore: new THREE.Vector3(...d.fore), magPos: new THREE.Vector3(...d.mag), muzzle, id };
  return grp;
}

let GREN = null;
export function grenadeMesh(G) {
  if (!MAT) MAT = G.gfx.std({ vertexColors: true, roughness: 0.48, metalness: 0.6 });
  if (!GREN) { const b = builder(); const s = new THREE.SphereGeometry(0.045, 10, 8); s.scale(1, 1.25, 1); const n = s.toNonIndexed(); const c = new Float32Array(n.attributes.position.count * 3); const col = new THREE.Color(0x3a4a2c); for (let i = 0; i < c.length; i += 3) { c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; } n.setAttribute('color', new THREE.BufferAttribute(c, 3));
    b.box(0.025, 0.03, 0.025, 0, 0.065, 0, STEEL).box(0.012, 0.07, 0.03, 0.03, 0.03, 0, STEEL); GREN = mergeGeometries([n, b.done()]); }
  const m = new THREE.Mesh(GREN, MAT); m.castShadow = true; return m;
}
