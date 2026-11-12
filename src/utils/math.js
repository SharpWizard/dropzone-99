// Shared math helpers, seeded RNG and noise.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) { this.r = mulberry32(seed); }
  f() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this.r()); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  sign() { return this.r() < 0.5 ? -1 : 1; }
}

// integer hash -> [0,1)
export function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 2D value noise with optional wrap period (for tileable textures). Returns 0..1
export function vnoise(x, y, seed = 0, period = 0) {
  let xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  let x1 = xi + 1, y1 = yi + 1;
  if (period) {
    xi = ((xi % period) + period) % period; yi = ((yi % period) + period) % period;
    x1 = x1 % period; if (x1 < 0) x1 += period; y1 = y1 % period; if (y1 < 0) y1 += period;
    x1 = (xi + 1) % period; y1 = (yi + 1) % period;
  }
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(x1, yi, seed), c = hash2(xi, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, oct = 5, seed = 0, period = 0, gain = 0.5, lac = 2) {
  let amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x, y, seed + i * 17, period);
    norm += amp; amp *= gain; x *= lac; y *= lac; if (period) period *= lac;
  }
  return sum / norm;
}

export function ridged(x, y, oct = 5, seed = 0) {
  let amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x, y, seed + i * 31) * 2 - 1);
    sum += amp * n * n; norm += amp; amp *= 0.5; x *= 2.03; y *= 2.03;
  }
  return sum / norm;
}

// distance from point to segment, also returns t via out[0]
export function segDist(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  if (out) out[0] = t;
  const cx = ax + dx * t - px, cz = az + dz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

export function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
