// Stylised procedural trees. Each tree is ONE flat-shaded, vertex-coloured geometry (trunk + canopy), so a whole
// species draws in a single call per sector. Trunks flare into roots that continue below y = 0, so a tree never
// floats on a slope. Canopies are lighter on top and darker underneath to read well in any light.
import * as THREE from 'three';

const col = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const hash = (x, y, z, s) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.137) * 43758.5453; return v - Math.floor(v); };
const rng = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };

class Mesh {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, ca, cb = ca, cc = ca) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); this.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]); }
  // stacked rings: [{ r, y, x, z, c }] -> tapered, bent tube
  tube(rings, sides, rot = 0) {
    const pt = (R, k) => { const a = k / sides * Math.PI * 2 + rot; return [(R.x || 0) + Math.cos(a) * R.r, R.y, (R.z || 0) + Math.sin(a) * R.r]; };
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) { const A = rings[i], B = rings[i + 1]; const sh = 0.86 + 0.28 * hash(k, i, 0, 3);
      const a = pt(A, k), b = pt(A, k + 1), c = pt(B, k), d = pt(B, k + 1); this.tri(a, c, b, mul(A.c, sh), mul(B.c, sh), mul(A.c, sh)); this.tri(b, c, d, mul(A.c, sh), mul(B.c, sh), mul(B.c, sh)); }
  }
  // faceted leaf mass: deformed icosphere, flattened underneath, light top / dark base
  blob(cx, cy, cz, rx, ry, rz, detail, seed, lo, hi) {
    const g = new THREE.IcosahedronGeometry(1, detail), P = g.attributes.position, v = [];
    for (let i = 0; i < P.count; i++) { let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const k = 0.8 + 0.36 * hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50), seed); if (y < 0) y *= 0.62; v.push([cx + x * rx * k, cy + y * ry * k, cz + z * rz * k, y]); }
    for (let i = 0; i < v.length; i += 3) { const ny = (v[i][3] + v[i + 1][3] + v[i + 2][3]) / 3; const t = Math.min(1, Math.max(0, ny * 0.6 + 0.48 + (hash(i, seed, 1, 7) - 0.5) * 0.3)); const c = mix(lo, hi, t); this.tri(v[i], v[i + 1], v[i + 2], c); }
    g.dispose();
  }
  // one conifer tier: jagged drooping skirt with a dark underside; optional snow on the upper faces
  tier(y, R, H, n, seed, lo, hi, snow, rot) {
    const apex = [0, y + H, 0], inner = [0, y + H * 0.22, 0], ring = [];
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + rot, r = R * (k % 2 ? 0.74 : 1) * (0.9 + 0.2 * hash(k, seed, 2, 5)); ring.push([Math.cos(a) * r, y - (k % 2 ? 0 : H * 0.14), Math.sin(a) * r]); }
    for (let k = 0; k < n; k++) { const a = ring[k], b = ring[(k + 1) % n]; const t = hash(k, seed, 9, 1); let top = mix(lo, hi, 0.45 + t * 0.55), tip = mix(lo, hi, 0.15 + t * 0.3);
      if (snow && t > 0.3) { top = snow; tip = mix(snow, hi, 0.45); }
      this.tri(apex, b, a, top, tip, tip); this.tri(inner, a, b, mul(lo, 0.5), mul(lo, 0.68), mul(lo, 0.68)); }
  }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g; }
}

const BARK = col(0x5a3a26), BARK_D = col(0x3a2418), BIRCH = col(0xe6e2d4), BIRCH_D = col(0x4a463e), SNOW = col(0xf2f6ff);

// broadleaf: flared trunk, a few boughs, clustered canopy
function broad(seed, lod, o) {
  const m = new Mesh(), r = rng(seed), sides = lod ? 5 : 8, det = lod ? 0 : 1; const lo = col(o.lo), hi = col(o.hi), bark = o.birch ? BIRCH : BARK, barkD = o.birch ? BIRCH_D : BARK_D;
  const th = o.trunk, tr = o.radius, lean = (r() - 0.5) * 0.5, lz = (r() - 0.5) * 0.5;
  const rings = [{ r: tr * 2.3, y: -0.9, c: barkD }, { r: tr * 1.75, y: 0.0, c: barkD }, { r: tr * 1.15, y: 0.45, c: bark }, { r: tr, y: th * 0.4, x: lean * 0.3, z: lz * 0.3, c: bark }, { r: tr * 0.8, y: th * 0.75, x: lean * 0.7, z: lz * 0.7, c: bark }, { r: tr * 0.5, y: th + 0.8, x: lean, z: lz, c: bark }];
  if (o.birch) for (const R of rings) if (hash(R.y, seed, 0, 2) > 0.55) R.c = mix(BIRCH, BIRCH_D, 0.55);
  m.tube(rings, sides, r() * 6);
  const n = lod ? Math.min(3, o.blobs) : o.blobs;
  for (let i = 0; i < n; i++) {
    const main = i === 0, a = r() * 6.283 + i * 2.1, d = main ? 0 : o.spread * (0.55 + r() * 0.5), s = main ? 1 : 0.5 + r() * 0.32;
    const cx = lean + Math.cos(a) * d, cz = lz + Math.sin(a) * d, cy = th + o.lift * (main ? 1 : 0.35 + r() * 0.75) + (o.column ? i * o.rise : 0);
    if (!main && !lod && !o.column) m.tube([{ r: tr * 0.42, y: th * 0.72, x: lean * 0.7, z: lz * 0.7, c: bark }, { r: tr * 0.2, y: cy - 0.2, x: cx, z: cz, c: bark }], 4);
    m.blob(cx, cy, cz, o.rx * s, o.ry * s, o.rx * s, det, seed * 7 + i, lo, hi);
  }
  return m.geo();
}

// conifer: straight trunk, stacked jagged tiers shrinking to a point
function conifer(seed, lod, o) {
  const m = new Mesh(), r = rng(seed), lo = col(o.lo), hi = col(o.hi), tr = o.radius, H = o.h;
  m.tube([{ r: tr * 2.2, y: -0.9, c: BARK_D }, { r: tr * 1.6, y: 0, c: BARK_D }, { r: tr, y: 0.5, c: BARK }, { r: tr * 0.7, y: H * 0.45, c: BARK }, { r: tr * 0.2, y: H * 0.9, c: BARK }], lod ? 4 : 7);
  const tiers = lod ? Math.ceil(o.tiers * 0.6) : o.tiers, n = lod ? 6 : 10, y0 = o.skirt, span = H - y0;
  for (let i = 0; i < tiers; i++) { const t = i / tiers, y = y0 + span * (1 - Math.pow(1 - t, 1.25)) * 0.94, R = o.r * (1 - t * 0.9) * (0.92 + r() * 0.16), th = span / tiers * (1.75 + t * 0.5);
    m.tier(y, R, th, n, seed * 13 + i, lo, hi, o.snow ? SNOW : null, r() * 6); }
  return m.geo();
}

// Returns { broad, conif, snow }: arrays of { hi, lo, h, w } (metres, base at y = 0).
export function makeTrees() {
  const pack = (fn, seed, o, h, w) => ({ hi: fn(seed, 0, o), lo: fn(seed, 1, o), h, w });
  const oak = { lo: 0x2c7a30, hi: 0x86cc48, trunk: 3.6, radius: 0.34, blobs: 6, spread: 2.3, lift: 2.3, rx: 2.7, ry: 2.1 };
  const linden = { lo: 0x35923a, hi: 0xa8dc58, trunk: 4.4, radius: 0.3, blobs: 4, spread: 1.7, lift: 2.6, rx: 2.9, ry: 2.6 };
  const birch = { lo: 0x4c9a3c, hi: 0xb8e26c, trunk: 4.8, radius: 0.2, blobs: 4, spread: 0.5, lift: 1.3, rx: 1.55, ry: 1.7, column: true, rise: 1.5, birch: true };
  const beech = { lo: 0x236b35, hi: 0x5fb84e, trunk: 3.2, radius: 0.38, blobs: 7, spread: 2.7, lift: 2.0, rx: 2.5, ry: 1.8 };
  const spruce = { lo: 0x1c5632, hi: 0x48a055, h: 12.5, radius: 0.26, tiers: 7, r: 3.1, skirt: 1.7 };
  const fir = { lo: 0x1b5146, hi: 0x3f9482, h: 14, radius: 0.24, tiers: 9, r: 2.3, skirt: 2.4 };
  const young = { lo: 0x256a34, hi: 0x62b556, h: 8.5, radius: 0.2, tiers: 5, r: 2.5, skirt: 1.0 };
  return {
    broad: [pack(broad, 11, oak, 9.4, 7.6), pack(broad, 23, linden, 10.6, 7.2), pack(broad, 37, birch, 12, 3.6), pack(broad, 41, beech, 8.6, 8.2)],
    conif: [pack(conifer, 5, spruce, 12.5, 6.2), pack(conifer, 9, fir, 14, 4.6), pack(conifer, 17, young, 8.5, 5)],
    snow: [pack(conifer, 5, { ...spruce, snow: true }, 12.5, 6.2), pack(conifer, 9, { ...fir, snow: true }, 14, 4.6), pack(conifer, 17, { ...young, snow: true }, 8.5, 5)],
  };
}
