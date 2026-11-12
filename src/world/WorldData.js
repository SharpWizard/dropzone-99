// Dropzone Island: height field, splat (ground type) map, locations, roads and river.
// Pure data - no rendering. Everything else (terrain mesh, physics, AI, minimap) samples this.
import { clamp, lerp, smoothstep, fbm, ridged, segDist } from '../utils/math.js';

export const WORLD = 2048, HALF = 1024, GRID = 1025, CELL = 2, SPLAT = 1024;
export const WATER_Y = 0;

export const LOCATIONS = [
  { id: 'iron', name: 'IRON CITY', x: 290, z: -170, r: 185, flat: 1 },
  { id: 'base', name: 'RESISTANCE BUNKER', x: 520, z: -520, r: 135, flat: 1 },
  { id: 'green', name: 'GREENFIELD FARMS', x: -200, z: 500, r: 180, flat: 1 },
  { id: 'forest', name: 'ASHWOOD RUINS', x: -540, z: 130, r: 230, flat: 0 },
  { id: 'port', name: 'DEADPORT DOCKS', x: 760, z: 80, r: 135, flat: 1, h: 2.6 },
  { id: 'peak', name: 'EAGLE PEAK FORT', x: -430, z: -480, r: 26, flat: 1, fall: 34 },
  { id: 'river', name: 'CIVILIAN SURVIVAL ZONE', x: -170, z: -190, r: 125, flat: 1, h: 3.4 },
  { id: 'dust', name: 'THE DEAD SECTOR', x: 430, z: 500, r: 190, flat: 0.75 },
  { id: 'steel', name: 'INDUSTRIAL WARZONE', x: 130, z: -600, r: 125, flat: 1 },
  { id: 'last', name: 'LAST HOPE OUTPOST', x: -590, z: 540, r: 95, flat: 1 },
];

export const RIVER = [[-60, -1024], [-60, -520], [-40, -400], [-40, -110], [30, 60], [60, 190], [60, 340], [150, 560], [190, 760], [200, 1024]];
export const BRIDGES = [{ x: -40, z: -190 }, { x: 60, z: 265 }, { x: -60, z: -600 }];
export const BRIDGE_Y = 3.4;

// type: 0 asphalt, 1 dirt track
export const ROADS = [
  { t: 0, p: [[-250, -190], [-90, -190], [10, -190], [120, -182], [290, -170], [420, -150], [540, -90], [660, 20], [740, 70]] },
  { t: 0, p: [[290, -170], [320, -300], [360, -400], [440, -470], [520, -520]] },
  { t: 0, p: [[130, -600], [250, -500], [360, -400]] },
  { t: 0, p: [[130, -600], [10, -600], [-110, -600], [-230, -560]] },
  { t: 1, p: [[-230, -560], [-300, -500], [-340, -420], [-390, -400], [-420, -440], [-430, -470]] },
  { t: 0, p: [[-170, -190], [-260, -120], [-340, -50], [-440, 40], [-520, 120], [-590, 250], [-610, 400], [-590, 540]] },
  { t: 0, p: [[-170, -190], [-200, -40], [-190, 150], [-210, 330], [-200, 500]] },
  { t: 0, p: [[-200, 500], [-110, 400], [-60, 300], [10, 265], [110, 265], [250, 330], [340, 420], [430, 500]] },
  { t: 0, p: [[430, 500], [520, 380], [600, 260], [700, 150], [745, 90]] },
  { t: 0, p: [[-200, 500], [-330, 560], [-460, 570], [-590, 540]] },
  { t: 0, p: [[290, -170], [305, -20], [290, 120], [260, 240], [250, 330]] },
];

export class WorldData {
  constructor() {
    this.heights = new Float32Array(GRID * GRID);
    this.splat = new Uint8Array(SPLAT * SPLAT * 4); // R asphalt, G dirt, B concrete, A vegetation density
    this.locations = LOCATIONS.map(l => ({ ...l }));
    this.footprints = []; // {x0,z0,x1,z1,c} for minimap
    this.lootSpots = [];  // {x,y,z,tier}
    this.vehicleSpots = []; // {x,z,yaw,type}
  }

  generate() {
    const H = this.heights;
    const base = (x, z) => {
      const d = Math.sqrt(x * x + z * z) / 900;
      const cn = fbm(x * 0.0025 + 5.3, z * 0.0025 + 9.1, 4, 11) * 0.36 - 0.18;
      const m = smoothstep(1.03, 0.80, d + cn);
      let hills = fbm(x * 0.004, z * 0.004, 5, 3);
      hills = Math.pow(hills, 1.5) * 52;
      const detail = (fbm(x * 0.021, z * 0.021, 3, 7) - 0.5) * 3.2;
      let land = 4.5 + hills + detail;
      // Dust Valley: flat arid basin
      const dd = Math.hypot(x - 430, z - 500);
      const dw = smoothstep(300, 150, dd) * 0.8;
      land = lerp(land, 7 + (fbm(x * 0.012, z * 0.012, 3, 40) - 0.5) * 5, dw);
      // Eagle Peak
      const pd2 = (x + 430) * (x + 430) + (z + 480) * (z + 480);
      if (pd2 < 520 * 520) {
        const g = Math.exp(-pd2 / (2 * 150 * 150));
        land += g * (135 + ridged(x * 0.007, z * 0.007, 5, 21) * 80 * (1 - g * 0.6));
      }
      return lerp(-24, land, m);
    };
    for (let j = 0; j < GRID; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < GRID; i++) H[j * GRID + i] = base(-HALF + i * CELL, z);
    }
    // location flattening
    for (const L of this.locations) {
      if (L.h === undefined) L.h = Math.max(4, this.heightAt(L.x, L.z));
      if (!L.flat) continue;
      const fall = L.fall || 75;
      this._eachCell(L.x, L.z, L.r + fall, (i, j, x, z) => {
        const d = Math.hypot(x - L.x, z - L.z);
        const w = smoothstep(L.r + fall, L.r, d) * L.flat;
        const k = j * GRID + i;
        const tgt = L.flat < 1 ? L.h + (H[k] - L.h) * 0.25 : L.h;
        H[k] = lerp(H[k], tgt, w);
      });
    }
    // Deadport quay: hard drop into the sea on the east edge
    this._eachCell(830, 80, 260, (i, j, x, z) => {
      if (Math.abs(z - 80) < 150 && x > 836) { const k = j * GRID + i; H[k] = Math.min(H[k], lerp(2.6, -9, smoothstep(836, 842, x))); }
    });
    for (const b of BRIDGES) {
      this._eachCell(b.x, b.z, 70, (i, j, x, z) => {
        const w = smoothstep(70, 40, Math.hypot(x - b.x, z - b.z)); const k = j * GRID + i;
        H[k] = lerp(H[k], BRIDGE_Y - 0.25, w);
      });
    }
    // default vegetation density
    const S = this.splat;
    for (let k = 0; k < SPLAT * SPLAT; k++) S[k * 4 + 3] = 255;
    this._roads();
    this._river();
    // dust valley dirt + beaches kill vegetation
    for (let j = 0; j < SPLAT; j++) for (let i = 0; i < SPLAT; i++) {
      const x = -HALF + i * 2, z = -HALF + j * 2, k = (j * SPLAT + i) * 4;
      const dd = Math.hypot(x - 430, z - 500);
      if (dd < 320) {
        const w = smoothstep(300, 170, dd) * (0.55 + 0.45 * fbm(x * 0.02, z * 0.02, 3, 77));
        S[k + 1] = Math.max(S[k + 1], w * 255);
        S[k + 3] = Math.min(S[k + 3], 255 * (1 - w * 0.85));
      }
      const h = H[j * GRID + i];
      if (h < 1.6) S[k + 3] = 0;
    }
  }

  _eachCell(cx, cz, r, fn) {
    const i0 = clamp(Math.floor((cx - r + HALF) / CELL), 0, GRID - 1), i1 = clamp(Math.ceil((cx + r + HALF) / CELL), 0, GRID - 1);
    const j0 = clamp(Math.floor((cz - r + HALF) / CELL), 0, GRID - 1), j1 = clamp(Math.ceil((cz + r + HALF) / CELL), 0, GRID - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j, -HALF + i * CELL, -HALF + j * CELL);
  }

  _roads() {
    const H = this.heights, S = this.splat;
    const rd = new Float32Array(GRID * GRID).fill(99), rh = new Float32Array(GRID * GRID), rt = new Uint8Array(GRID * GRID);
    for (const road of ROADS) {
      const pts = [];
      for (let s = 0; s < road.p.length - 1; s++) {
        const [ax, az] = road.p[s], [bx, bz] = road.p[s + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
        for (let q = 0; q < n; q++) { const t = q / n; pts.push([lerp(ax, bx, t), lerp(az, bz, t)]); }
      }
      pts.push(road.p[road.p.length - 1]);
      const hs = pts.map(p => this.heightAt(p[0], p[1]));
      const sm = hs.map((_, i) => { let a = 0, c = 0; for (let k = -14; k <= 14; k++) { const q = i + k; if (q >= 0 && q < hs.length) { a += hs[q]; c++; } } return a / c; });
      const R = road.t ? 9 : 13;
      pts.forEach((p, idx) => {
        this._eachCell(p[0], p[1], R, (i, j, x, z) => {
          const d = Math.hypot(x - p[0], z - p[1]); const k = j * GRID + i;
          if (d < rd[k]) { rd[k] = d; rh[k] = sm[idx]; rt[k] = road.t; }
        });
      });
    }
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const k = j * GRID + i; const d = rd[k]; if (d > 20) continue;
      const dirt = rt[k] === 1;
      const w = 1 - smoothstep(dirt ? 3 : 4.5, dirt ? 9 : 13, d);
      H[k] = lerp(H[k], rh[k], w);
      if (i < SPLAT && j < SPLAT) {
        const sk = (j * SPLAT + i) * 4;
        const pw = 1 - smoothstep(dirt ? 1.4 : 3.2, dirt ? 3 : 4.6, d);
        S[sk + (dirt ? 1 : 0)] = Math.max(S[sk + (dirt ? 1 : 0)], pw * 255);
        if (!dirt) S[sk + 1] = Math.max(S[sk + 1], (1 - smoothstep(4.4, 7, d)) * 150); // dirt shoulder
        S[sk + 3] = Math.min(S[sk + 3], smoothstep(4, 9, d) * 255);
      }
    }
  }

  _river() {
    const H = this.heights, S = this.splat, out = [0];
    for (let j = 0; j < GRID; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < GRID; i++) {
        const x = -HALF + i * CELL;
        if (x < -150 || x > 290) continue;
        let d = 1e9;
        for (let s = 0; s < RIVER.length - 1; s++) {
          const a = RIVER[s], b = RIVER[s + 1];
          if (z < Math.min(a[1], b[1]) - 60 || z > Math.max(a[1], b[1]) + 60) continue;
          d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1], out));
        }
        if (d > 46) continue;
        d += (fbm(x * 0.03, z * 0.03, 2, 91) - 0.5) * 8;
        const k = j * GRID + i;
        const bed = -2.3 + smoothstep(4, 15, d) * 1.2;
        const carved = lerp(bed, H[k], smoothstep(13, 34, d));
        if (carved < H[k]) H[k] = carved;
        if (i < SPLAT && j < SPLAT && H[k] < 1.2) { const sk = (j * SPLAT + i) * 4; S[sk] = 0; S[sk + 3] = 0; S[sk + 1] = Math.max(S[sk + 1], 120); }
      }
    }
  }

  heightAt(x, z) {
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    if (fx < 0) fx = 0; else if (fx > GRID - 1.001) fx = GRID - 1.001;
    if (fz < 0) fz = 0; else if (fz > GRID - 1.001) fz = GRID - 1.001;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * GRID + i, H = this.heights;
    const a = H[k], b = H[k + 1], c = H[k + GRID], d = H[k + GRID + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  normalAt(x, z, out) {
    const e = 1.5;
    const dx = this.heightAt(x - e, z) - this.heightAt(x + e, z), dz = this.heightAt(x, z - e) - this.heightAt(x, z + e);
    const l = Math.hypot(dx, 2 * e, dz);
    out.x = dx / l; out.y = 2 * e / l; out.z = dz / l; return out;
  }

  slopeAt(x, z) {
    const e = 1.5;
    return Math.hypot(this.heightAt(x - e, z) - this.heightAt(x + e, z), this.heightAt(x, z - e) - this.heightAt(x, z + e)) / (2 * e);
  }

  splatAt(x, z, ch) {
    const i = clamp(Math.round((x + HALF) / 2), 0, SPLAT - 1), j = clamp(Math.round((z + HALF) / 2), 0, SPLAT - 1);
    return this.splat[(j * SPLAT + i) * 4 + ch];
  }

  // ground material for footsteps / impacts / vehicle grip
  surfaceAt(x, z) {
    const h = this.heightAt(x, z);
    if (h < WATER_Y - 0.15) return 'water';
    const i = clamp(Math.round((x + HALF) / 2), 0, SPLAT - 1), j = clamp(Math.round((z + HALF) / 2), 0, SPLAT - 1), k = (j * SPLAT + i) * 4, S = this.splat;
    if (S[k] > 110) return 'road';
    if (S[k + 2] > 110) return 'concrete';
    if (S[k + 1] > 120) return 'dirt';
    if (h < 1.7) return 'sand';
    if (this.slopeAt(x, z) > 0.8) return 'rock';
    return 'grass';
  }

  // painting helpers used by location builders (ch: 0 asphalt, 1 dirt, 2 concrete, 3 vegetation)
  paintRect(ch, x0, z0, x1, z1, value, feather = 2) {
    const S = this.splat;
    const i0 = clamp(Math.floor((x0 - feather + HALF) / 2), 0, SPLAT - 1), i1 = clamp(Math.ceil((x1 + feather + HALF) / 2), 0, SPLAT - 1);
    const j0 = clamp(Math.floor((z0 - feather + HALF) / 2), 0, SPLAT - 1), j1 = clamp(Math.ceil((z1 + feather + HALF) / 2), 0, SPLAT - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -HALF + i * 2, z = -HALF + j * 2;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const w = 1 - clamp(Math.hypot(dx, dz) / Math.max(feather, 0.01), 0, 1);
      if (w <= 0) continue;
      const k = (j * SPLAT + i) * 4 + ch;
      if (ch === 3) S[k] = Math.min(S[k], lerp(255, value, w)); else S[k] = Math.max(S[k], value * w);
    }
  }
  paintCircle(ch, cx, cz, r, value, feather = 6) { this.paintRect(ch, cx - r * 0.7, cz - r * 0.7, cx + r * 0.7, cz + r * 0.7, value, r * 0.3 + feather); }

  flattenRect(x0, z0, x1, z1, h, feather = 6) {
    const H = this.heights;
    this._eachCell((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + feather + 2, (i, j, x, z) => {
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const w = 1 - smoothstep(0, feather, Math.hypot(dx, dz));
      if (w > 0) { const k = j * GRID + i; H[k] = lerp(H[k], h, w); }
    });
  }

  locationAt(x, z) {
    let best = null, bd = 1e9;
    for (const L of this.locations) { const d = Math.hypot(x - L.x, z - L.z) - L.r; if (d < bd) { bd = d; best = L; } }
    return bd < 40 ? best : null;
  }

  isLand(x, z) { return Math.abs(x) < HALF - 10 && Math.abs(z) < HALF - 10 && this.heightAt(x, z) > 0.6; }
}
