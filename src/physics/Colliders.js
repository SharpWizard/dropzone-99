// Static collision world: axis-aligned boxes in a spatial hash + the terrain height field.
// Provides ground queries, circle-vs-box movement resolution and ray casts.
import { WATER_Y } from '../world/WorldData.js';

const CS = 8; // hash cell size (m)
export const MAT = { CONCRETE: 0, WOOD: 1, METAL: 2, DIRT: 3, GLASS: 4, FLESH: 5, WATER: 6 };

export class Colliders {
  constructor(world) {
    this.world = world;
    this.boxes = [];
    this.hash = new Map();
    this._stamp = 0;
    this.hit = { dist: 0, nx: 0, ny: 1, nz: 0, mat: 0, box: null, x: 0, y: 0, z: 0 };
  }

  _key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); }

  // flags: mat (impact type). opts.soft => no movement collision (bullets only) ; opts.nobullet => bullets pass
  add(minX, minY, minZ, maxX, maxY, maxZ, mat = 0, opts = null) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, mat, stamp: 0, soft: !!(opts && opts.soft), nobullet: !!(opts && opts.nobullet), nav: (opts && opts.nav) || 0, dead: false };
    this.boxes.push(b);
    const i0 = Math.floor(minX / CS), i1 = Math.floor(maxX / CS), j0 = Math.floor(minZ / CS), j1 = Math.floor(maxZ / CS);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this._key(i, j); let a = this.hash.get(k); if (!a) this.hash.set(k, a = []); a.push(b);
    }
    return b;
  }

  // ground height under a point: terrain or the top of any box that the feet can reach (step height)
  groundAt(x, z, y, step = 0.55, r = 0.22) {
    let g = this.world.heightAt(x, z);
    const a = this.hash.get(this._key(Math.floor(x / CS), Math.floor(z / CS)));
    if (a) for (let n = 0; n < a.length; n++) {
      const b = a[n];
      if (b.soft || b.dead) continue;
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r && b.maxY > g && b.maxY <= y + step) g = b.maxY;
    }
    return g;
  }

  // lowest ceiling above y (for jump head bumps); returns Infinity when open sky
  ceilingAt(x, z, y) {
    let c = Infinity;
    const a = this.hash.get(this._key(Math.floor(x / CS), Math.floor(z / CS)));
    if (a) for (let n = 0; n < a.length; n++) {
      const b = a[n];
      if (b.soft || b.dead) continue;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.minY >= y && b.minY < c) c = b.minY;
    }
    return c;
  }

  // push a vertical cylinder (pos.x/z at feet height y) out of boxes. Returns true if touched anything.
  resolve(pos, y, radius, height, step = 0.55) {
    let touched = false;
    for (let iter = 0; iter < 2; iter++) {
      const i0 = Math.floor((pos.x - radius) / CS), i1 = Math.floor((pos.x + radius) / CS);
      const j0 = Math.floor((pos.z - radius) / CS), j1 = Math.floor((pos.z + radius) / CS);
      const stamp = ++this._stamp;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = this.hash.get(this._key(i, j)); if (!a) continue;
        for (let n = 0; n < a.length; n++) {
          const b = a[n];
          if (b.stamp === stamp || b.soft || b.dead) continue; b.stamp = stamp;
          if (b.maxY <= y + step || b.minY >= y + height) continue;
          const cx = pos.x < b.minX ? b.minX : pos.x > b.maxX ? b.maxX : pos.x;
          const cz = pos.z < b.minZ ? b.minZ : pos.z > b.maxZ ? b.maxZ : pos.z;
          let dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius) continue;
          touched = true;
          if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (radius - d) / d; pos.x += dx * p; pos.z += dz * p; }
          else { // centre inside the box: exit through the nearest face
            const l = pos.x - b.minX, r = b.maxX - pos.x, n2 = pos.z - b.minZ, f = b.maxZ - pos.z, m = Math.min(l, r, n2, f);
            if (m === l) pos.x = b.minX - radius; else if (m === r) pos.x = b.maxX + radius; else if (m === n2) pos.z = b.minZ - radius; else pos.z = b.maxZ + radius;
          }
        }
      }
    }
    return touched;
  }

  // true if a cylinder at this spot would overlap a blocking box
  blocked(x, z, y, radius, height) {
    const i0 = Math.floor((x - radius) / CS), i1 = Math.floor((x + radius) / CS), j0 = Math.floor((z - radius) / CS), j1 = Math.floor((z + radius) / CS);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.hash.get(this._key(i, j)); if (!a) continue;
      for (let n = 0; n < a.length; n++) {
        const b = a[n]; if (b.soft || b.dead) continue;
        if (b.maxY <= y + 0.55 || b.minY >= y + height) continue;
        if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) return true;
      }
    }
    return false;
  }

  // Ray cast against boxes + terrain (+ water plane if wantWater). Returns this.hit or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, terrainStep = 2, wantWater = false) {
    const hit = this.hit; let best = maxDist; let found = false;
    if (dx === 0) dx = 1e-9; if (dy === 0) dy = 1e-9; if (dz === 0) dz = 1e-9;
    // --- boxes: 2D DDA through hash cells
    let cx = Math.floor(ox / CS), cz = Math.floor(oz / CS);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(CS / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CS / dz) : Infinity;
    let tmx = dx !== 0 ? ((dx > 0 ? (cx + 1) * CS - ox : ox - cx * CS)) / Math.abs(dx) : Infinity;
    let tmz = dz !== 0 ? ((dz > 0 ? (cz + 1) * CS - oz : oz - cz * CS)) / Math.abs(dz) : Infinity;
    const stamp = ++this._stamp;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let t = 0, guard = 0;
    while (t <= best && guard++ < 400) {
      const a = this.hash.get(this._key(cx, cz));
      if (a) for (let n = 0; n < a.length; n++) {
        const b = a[n];
        if (b.stamp === stamp || b.nobullet || b.dead) continue; b.stamp = stamp;
        let t1 = (b.minX - ox) * ix, t2 = (b.maxX - ox) * ix; let tn = Math.min(t1, t2), tf = Math.max(t1, t2); let axis = 0;
        t1 = (b.minY - oy) * iy; t2 = (b.maxY - oy) * iy; const tyn = Math.min(t1, t2), tyf = Math.max(t1, t2);
        if (tyn > tn) { tn = tyn; axis = 1; } if (tyf < tf) tf = tyf;
        t1 = (b.minZ - oz) * iz; t2 = (b.maxZ - oz) * iz; const tzn = Math.min(t1, t2), tzf = Math.max(t1, t2);
        if (tzn > tn) { tn = tzn; axis = 2; } if (tzf < tf) tf = tzf;
        if (tn <= tf && tn > 0 && tn < best) {
          best = tn; found = true; hit.box = b; hit.mat = b.mat;
          hit.nx = axis === 0 ? (dx > 0 ? -1 : 1) : 0; hit.ny = axis === 1 ? (dy > 0 ? -1 : 1) : 0; hit.nz = axis === 2 ? (dz > 0 ? -1 : 1) : 0;
        }
      }
      if (tmx < tmz) { t = tmx; tmx += tdx; cx += sx; } else { t = tmz; tmz += tdz; cz += sz; }
    }
    // --- terrain: fixed-step march + bisection
    const W = this.world;
    let pt = 0, ph = oy - W.heightAt(ox, oz);
    if (ph >= 0) {
      for (let s = terrainStep; pt < best; s = Math.min(s * 1.04, 8)) {
        const nt = Math.min(pt + s, best);
        const h = oy + dy * nt - W.heightAt(ox + dx * nt, oz + dz * nt);
        if (h < 0) {
          let a = pt, b2 = nt;
          for (let k = 0; k < 6; k++) { const m = (a + b2) / 2; if (oy + dy * m - W.heightAt(ox + dx * m, oz + dz * m) < 0) b2 = m; else a = m; }
          best = a; found = true; hit.box = null; hit.mat = MAT.DIRT;
          const e = 0.8, px = ox + dx * a, pz = oz + dz * a;
          const gx = W.heightAt(px - e, pz) - W.heightAt(px + e, pz), gz = W.heightAt(px, pz - e) - W.heightAt(px, pz + e), l = Math.hypot(gx, 2 * e, gz);
          hit.nx = gx / l; hit.ny = 2 * e / l; hit.nz = gz / l;
          break;
        }
        if (nt >= best) break;
        pt = nt; ph = h;
      }
    }
    if (wantWater && dy < 0 && oy > WATER_Y) {
      const tw = (WATER_Y - oy) / dy;
      if (tw < best) { best = tw; found = true; hit.box = null; hit.mat = MAT.WATER; hit.nx = 0; hit.ny = 1; hit.nz = 0; }
    }
    if (!found) return null;
    hit.dist = best; hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    return hit;
  }

  // line of sight between two points (coarse terrain step)
  los(ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dy = by - ay, dz = bz - az; const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.01) return true;
    dx /= d; dy /= d; dz /= d;
    return !this.raycast(ax, ay, az, dx || 1e-9, dy || 1e-9, dz || 1e-9, d - 0.3, 4);
  }
}
