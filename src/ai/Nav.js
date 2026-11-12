// Navigation grid (1 m cells over the whole island) with windowed A* path finding.
// Bots plan inside a 128 m window toward their goal and re-plan as they travel.
import { HALF, GRID } from '../world/WorldData.js';

const N = 2048, W = 128, WH = 64;
const gArr = new Float32Array(W * W), fArr = new Float32Array(W * W), parent = new Int32Array(W * W), stamp = new Uint16Array(W * W), closed = new Uint16Array(W * W);
const heap = new Int32Array(W * W * 2);
let stampId = 0;

export class Nav {
  constructor(world, colliders) { this.world = world; this.col = colliders; this.grid = new Uint8Array(N * N); } // 0 free, 1 blocked, 2 water (slow)

  build() {
    const g = this.grid, H = this.world.heights;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const gi = Math.min(GRID - 2, i >> 1), gj = Math.min(GRID - 2, j >> 1), k = gj * GRID + gi; const h = H[k];
      const sl = Math.max(Math.abs(H[k + 1] - h), Math.abs(H[k + GRID] - h)) / 2;
      g[j * N + i] = (h < -2.7 || sl > 1.15 || i < 6 || j < 6 || i > N - 7 || j > N - 7) ? 1 : (h < -0.5 ? 2 : 0);
    }
    for (const b of this.col.boxes) {
      if (b.nav === -1) continue;
      if (b.nav !== 1) {
        if (b.soft) continue;
        const h = this.world.heightAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
        if (!(b.maxY > h + 0.62 && b.minY < h + 1.6)) continue;
        if (b.maxX - b.minX < 0.9 && b.maxZ - b.minZ < 0.9 && b.maxY - b.minY > 4) continue; // tree trunks & poles: handled by sliding
      }
      const e = 0.3; const i0 = Math.max(0, Math.ceil(b.minX - e + HALF - 0.5)), i1 = Math.min(N - 1, Math.floor(b.maxX + e + HALF - 0.5)), j0 = Math.max(0, Math.ceil(b.minZ - e + HALF - 0.5)), j1 = Math.min(N - 1, Math.floor(b.maxZ + e + HALF - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * N + i] = 1;
    }
  }

  cell(x, z) { const i = Math.floor(x + HALF), j = Math.floor(z + HALF); return (i < 0 || j < 0 || i >= N || j >= N) ? 1 : this.grid[j * N + i]; }
  isFree(x, z) { return this.cell(x, z) !== 1; }
  isLandFree(x, z) { return this.cell(x, z) === 0; }

  // straight-line walkability check on the grid
  line(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.45);
    for (let i = 1; i <= n; i++) { const t = i / n; if (this.cell(ax + (bx - ax) * t, az + (bz - az) * t) === 1) return false; }
    return true;
  }

  nearestFree(x, z, maxR = 12, out = { x: 0, z: 0 }) {
    if (this.isFree(x, z)) { out.x = x; out.z = z; return out; }
    for (let r = 1; r <= maxR; r++) for (let a = 0; a < 8 + r * 2; a++) { const an = a / (8 + r * 2) * Math.PI * 2, px = x + Math.cos(an) * r, pz = z + Math.sin(an) * r; if (this.isFree(px, pz)) { out.x = px; out.z = pz; return out; } }
    return null;
  }

  randomFree(x, z, r, rng, out = { x: 0, z: 0 }, landOnly = true) {
    for (let k = 0; k < 14; k++) { const a = rng.f() * Math.PI * 2, d = Math.sqrt(rng.f()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (landOnly ? this.isLandFree(px, pz) : this.isFree(px, pz)) { out.x = px; out.z = pz; return out; } }
    return null;
  }

  // A* inside a window centred on the start. Fills `out` with [x,z,...] waypoints (world coords).
  // Returns true when the real goal was reached, false for a partial / best-effort path.
  findPath(sx, sz, tx, tz, out) {
    out.length = 0; const g = this.grid;
    const s = this.nearestFree(sx, sz, 6); if (!s) return false; const sxx = s.x, szz = s.z;
    const dx = tx - sxx, dz = tz - szz; const dist = Math.hypot(dx, dz); let partial = false;
    if (dist > WH - 8) { const k = (WH - 8) / dist; tx = sxx + dx * k; tz = szz + dz * k; partial = true; }
    const t = this.nearestFree(tx, tz, 10); if (!t) return false; tx = t.x; tz = t.z;
    const oi = Math.floor(sxx + HALF) - WH, oj = Math.floor(szz + HALF) - WH;
    const si = WH, sj = WH, ti = Math.floor(tx + HALF) - oi, tj = Math.floor(tz + HALF) - oj;
    if (ti < 0 || tj < 0 || ti >= W || tj >= W) return false;
    if (++stampId > 65000) { stamp.fill(0); closed.fill(0); stampId = 1; }
    const id = stampId; let hn = 0; const start = sj * W + si, goal = tj * W + ti;
    const push = (n) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (fArr[heap[p]] <= fArr[n]) break; heap[i] = heap[p]; i = p; } heap[i] = n; };
    const pop = () => { const top = heap[0], last = heap[--hn]; let i = 0; while (true) { let c = i * 2 + 1; if (c >= hn) break; if (c + 1 < hn && fArr[heap[c + 1]] < fArr[heap[c]]) c++; if (fArr[heap[c]] >= fArr[last]) break; heap[i] = heap[c]; i = c; } heap[i] = last; return top; };
    const hfn = (i, j) => { const a = Math.abs(i - ti), b = Math.abs(j - tj); return (a + b) - 0.5858 * Math.min(a, b); };
    gArr[start] = 0; fArr[start] = hfn(si, sj); parent[start] = -1; stamp[start] = id; push(start);
    let best = start, bestH = hfn(si, sj), found = false, iter = 0;
    while (hn > 0 && iter++ < 7000 && hn < W * W * 2 - 8) {
      const cur = pop(); if (closed[cur] === id) continue; closed[cur] = id;
      if (cur === goal) { found = true; best = cur; break; }
      const ci = cur % W, cj = (cur / W) | 0; const h = hfn(ci, cj); if (h < bestH) { bestH = h; best = cur; }
      for (let d = 0; d < 8; d++) {
        const di = d === 0 || d === 4 || d === 5 ? 1 : d === 1 || d === 6 || d === 7 ? -1 : 0, dj = d === 2 || d === 4 || d === 6 ? 1 : d === 3 || d === 5 || d === 7 ? -1 : 0;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue;
        const gi = oi + ni, gj = oj + nj; if (gi < 0 || gj < 0 || gi >= N || gj >= N) continue;
        const c = g[gj * N + gi]; if (c === 1) continue;
        if (d > 3 && (g[gj * N + (oi + ci)] === 1 || g[(oj + cj) * N + gi] === 1)) continue; // no corner cutting
        const n = nj * W + ni; if (closed[n] === id) continue;
        const ng = gArr[cur] + (d > 3 ? 1.4142 : 1) * (c === 2 ? 3 : 1);
        if (stamp[n] !== id || ng < gArr[n]) { stamp[n] = id; gArr[n] = ng; fArr[n] = ng + hfn(ni, nj) * 1.05; parent[n] = cur; push(n); }
      }
    }
    const raw = []; for (let n = best; n !== -1; n = parent[n]) raw.push(n);
    raw.reverse(); if (raw.length < 2) return false;
    const px = (n) => (n % W) + oi - HALF + 0.5, pz = (n) => ((n / W) | 0) + oj - HALF + 0.5;
    let anchor = 0;
    while (anchor < raw.length - 1) { // string pulling
      let far = anchor + 1;
      for (let k = Math.min(raw.length - 1, anchor + 40); k > anchor + 1; k--) { if (this.line(px(raw[anchor]), pz(raw[anchor]), px(raw[k]), pz(raw[k]))) { far = k; break; } }
      out.push(px(raw[far]), pz(raw[far])); anchor = far;
    }
    return found && !partial;
  }
}
