// Procedural PBR texture synthesis (albedo + normal) - no external image assets needed.
import * as THREE from 'three';
import { hash2, clamp, lerp, smoothstep, mulberry32 } from '../utils/math.js';

// tileable value noise with independent periods
function tn(x, y, seed, px, py) {
  let xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
  xi = ((xi % px) + px) % px; yi = ((yi % py) + py) % py;
  const x1 = (xi + 1) % px, y1 = (yi + 1) % py;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(x1, yi, seed), c = hash2(xi, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function tf(u, v, px, py, oct, seed) {
  let amp = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * tn(u * px, v * py, seed + i * 13, px, py); n += amp; amp *= 0.5; px *= 2; py *= 2; }
  return s / n;
}

let ANISO = 8;
function finish(tex, srgb, repeatM) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = ANISO;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeatM) tex.repeat.set(1 / repeatM, 1 / repeatM);
  tex.needsUpdate = true;
  return tex;
}

// fn(u,v,o) fills o[0..2]=rgb(0..255) o[3]=height(0..1)
function synth(size, fn, nStrength = 2, repeatM = 0) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size); const d = img.data;
  const H = new Float32Array(size * size); const o = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, o);
    const k = (y * size + x) * 4;
    d[k] = clamp(o[0], 0, 255); d[k + 1] = clamp(o[1], 0, 255); d[k + 2] = clamp(o[2], 0, 255); d[k + 3] = 255;
    H[y * size + x] = o[3];
  }
  ctx.putImageData(img, 0, 0);
  const n = document.createElement('canvas'); n.width = n.height = size;
  const nctx = n.getContext('2d'); const nimg = nctx.createImageData(size, size); const nd = nimg.data;
  const s = nStrength * size / 256;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x + size - 1) % size, xr = (x + 1) % size, yu = (y + size - 1) % size, yd = (y + 1) % size;
    let nx = (H[y * size + xl] - H[y * size + xr]) * s, ny = (H[yd * size + x] - H[yu * size + x]) * s;
    const l = Math.sqrt(nx * nx + ny * ny + 1); const k = (y * size + x) * 4;
    nd[k] = (nx / l * 0.5 + 0.5) * 255; nd[k + 1] = (ny / l * 0.5 + 0.5) * 255; nd[k + 2] = (1 / l * 0.5 + 0.5) * 255; nd[k + 3] = 255;
  }
  nctx.putImageData(nimg, 0, 0);
  return { map: finish(new THREE.CanvasTexture(c), true, repeatM), normalMap: finish(new THREE.CanvasTexture(n), false, repeatM) };
}

const mix3 = (o, a, b, t) => { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); };
const mul = (o, k) => { o[0] *= k; o[1] *= k; o[2] *= k; };

const GEN = {
  grass(u, v, o) {
    const big = tf(u, v, 4, 4, 3, 1), fine = tf(u, v, 48, 48, 3, 2), blade = tn(u * 200, v * 64, 3, 200, 64), dry = tf(u, v, 7, 7, 3, 5);
    mix3(o, [44, 70, 28], [92, 122, 48], clamp(big * 0.55 + fine * 0.6 - 0.05, 0, 1));
    const dr = smoothstep(0.55, 0.8, dry) * 0.5; o[0] = lerp(o[0], 140, dr); o[1] = lerp(o[1], 132, dr); o[2] = lerp(o[2], 70, dr);
    mul(o, 0.72 + blade * 0.5); o[3] = fine * 0.5 + blade * 0.5;
  },
  dirt(u, v, o) {
    const big = tf(u, v, 5, 5, 4, 11), fine = tf(u, v, 60, 60, 3, 12), peb = tn(u * 90, v * 90, 13, 90, 90);
    mix3(o, [82, 62, 42], [136, 110, 78], clamp(big * 0.7 + fine * 0.45 - 0.05, 0, 1));
    const p = smoothstep(0.78, 0.9, peb); o[0] = lerp(o[0], 150, p * 0.6); o[1] = lerp(o[1], 142, p * 0.6); o[2] = lerp(o[2], 128, p * 0.6);
    o[3] = big * 0.3 + fine * 0.4 + p * 0.5;
  },
  rock(u, v, o) {
    const w = tf(u, v, 6, 6, 3, 21), big = tf(u + w * 0.15, v + w * 0.1, 5, 5, 5, 22), strata = tn((v + w * 0.2) * 22, u * 3, 23, 22, 3);
    const cr = 1 - Math.abs(tf(u, v, 9, 9, 4, 24) * 2 - 1); const crack = smoothstep(0.93, 0.99, cr);
    mix3(o, [78, 76, 72], [150, 144, 132], clamp(big * 0.8 + strata * 0.3 - 0.1, 0, 1));
    const moss = smoothstep(0.62, 0.8, tf(u, v, 8, 8, 3, 25)) * 0.35; o[0] = lerp(o[0], 78, moss); o[1] = lerp(o[1], 92, moss); o[2] = lerp(o[2], 52, moss);
    mul(o, 1 - crack * 0.3); o[3] = big * 0.6 + strata * 0.3 + tn(u * 60, v * 60, 26, 60, 60) * 0.25 - crack * 0.3;
  },
  sand(u, v, o) {
    const big = tf(u, v, 4, 4, 3, 31), fine = tn(u * 180, v * 180, 32, 180, 180), rip = Math.sin((v * 28 + tf(u, v, 6, 6, 2, 33) * 2.2) * Math.PI * 2) * 0.5 + 0.5;
    mix3(o, [176, 156, 112], [214, 198, 156], clamp(big * 0.6 + fine * 0.3 + rip * 0.15, 0, 1)); o[3] = rip * 0.5 + fine * 0.4;
  },
  asphalt(u, v, o) {
    const fine = tn(u * 220, v * 220, 41, 220, 220), mid = tf(u, v, 30, 30, 2, 42), big = tf(u, v, 4, 4, 3, 43);
    const cr = 1 - Math.abs(tf(u, v, 7, 7, 4, 44) * 2 - 1); const crack = smoothstep(0.982, 0.997, cr) * 0.55;
    const g = 44 + fine * 26 + mid * 10 + big * 14; o[0] = g + 2; o[1] = g; o[2] = g - 3; mul(o, 1 - crack * 0.55);
    o[3] = fine * 0.6 + mid * 0.2 - crack * 0.7;
  },
  concrete(u, v, o) {
    const big = tf(u, v, 4, 4, 4, 51), fine = tn(u * 160, v * 160, 52, 160, 160), stain = tf(u, v + tf(u, v, 3, 3, 2, 54) * 0.1, 10, 3, 3, 53);
    const su = Math.abs(((u * 2) % 1) - 0.5), sv = Math.abs(((v * 2) % 1) - 0.5); const seam = smoothstep(0.494, 0.5, Math.max(su, sv));
    const pore = smoothstep(0.86, 0.95, tn(u * 70, v * 70, 55, 70, 70));
    const g = 148 + big * 46 + fine * 16 - stain * 30; o[0] = g; o[1] = g - 2; o[2] = g - 7; mul(o, 1 - seam * 0.35 - pore * 0.22);
    o[3] = fine * 0.3 + big * 0.2 - seam * 0.8 - pore * 0.5;
  },
  brick(u, v, o) {
    const rows = 16, cols = 5; const r = Math.floor(v * rows); const uu = u * cols + (r % 2) * 0.5; const c = Math.floor(uu);
    const fx = uu - c, fy = v * rows - r; const mx = Math.min(fx, 1 - fx) * (1 / cols) * rows * 4.2, my = Math.min(fy, 1 - fy);
    const m = smoothstep(0.0, 0.12, Math.min(mx * 0.25, my)); const hsh = hash2(((c % cols) + cols) % cols, r, 61), h2 = hash2(c, r, 62);
    const fine = tn(u * 150, v * 150, 63, 150, 150), big = tf(u, v, 5, 5, 3, 64);
    const base = [150 + hsh * 50 - 20, 76 + hsh * 26 + h2 * 14, 58 + h2 * 20];
    mul(base, 0.75 + fine * 0.3 + big * 0.2);
    const mort = 150 + fine * 40;
    o[0] = lerp(mort, base[0], m); o[1] = lerp(mort - 4, base[1], m); o[2] = lerp(mort - 10, base[2], m); o[3] = m * (0.75 + fine * 0.25);
  },
  plaster(u, v, o) {
    const big = tf(u, v, 4, 4, 4, 71), fine = tn(u * 130, v * 130, 72, 130, 130), streak = tf(u, v, 24, 2, 3, 73);
    const cr = 1 - Math.abs(tf(u, v, 6, 6, 4, 74) * 2 - 1); const crack = smoothstep(0.972, 0.995, cr);
    const g = 196 + big * 40 + fine * 14 - smoothstep(0.5, 0.9, streak) * 26; o[0] = g; o[1] = g - 2; o[2] = g - 8; mul(o, 1 - crack * 0.14);
    o[3] = fine * 0.35 + big * 0.3 - crack * 0.2;
  },
  wood(u, v, o) {
    const planks = 8; const p = Math.floor(u * planks); const fx = u * planks - p; const hsh = hash2(p, 0, 81);
    const grain = tf(u + hsh * 3, v, 96, 6, 3, 82 + p), knot = smoothstep(0.83, 0.93, tf(u, v + hsh, 14, 9, 2, 83));
    const gap = smoothstep(0.0, 0.05, Math.min(fx, 1 - fx)); const cut = smoothstep(0.0, 0.012, Math.abs(((v + hsh) % 1) - 0.5));
    const g = 0.62 + grain * 0.38 + hsh * 0.16 - knot * 0.3; o[0] = 190 * g; o[1] = 152 * g; o[2] = 110 * g; mul(o, (0.25 + gap * 0.75) * (0.5 + cut * 0.5));
    o[3] = gap * cut * (0.6 + grain * 0.4);
  },
  metal(u, v, o) { // corrugated sheet
    const rib = Math.sin(u * 24 * Math.PI * 2) * 0.5 + 0.5; const fine = tn(u * 140, v * 140, 91, 140, 140), streak = tf(u, v, 30, 3, 3, 92);
    const rust = smoothstep(0.62, 0.85, tf(u, v, 7, 7, 4, 93));
    const g = 168 + rib * 44 + fine * 14 - smoothstep(0.55, 0.9, streak) * 24; o[0] = g; o[1] = g; o[2] = g + 2;
    o[0] = lerp(o[0], 150, rust * 0.55); o[1] = lerp(o[1], 92, rust * 0.55); o[2] = lerp(o[2], 58, rust * 0.55); o[3] = rib * 0.9 + fine * 0.1;
  },
  steel(u, v, o) { // painted plate
    const fine = tn(u * 170, v * 170, 101, 170, 170), big = tf(u, v, 5, 5, 4, 102), scr = smoothstep(0.8, 0.95, tn(u * 6, v * 240, 103, 6, 240)) * 0.5;
    const chip = smoothstep(0.7, 0.82, tf(u, v, 12, 12, 4, 104));
    const g = 200 + big * 30 + fine * 12 - scr * 30; o[0] = g; o[1] = g; o[2] = g;
    o[0] = lerp(o[0], 120, chip * 0.6); o[1] = lerp(o[1], 84, chip * 0.6); o[2] = lerp(o[2], 62, chip * 0.6); o[3] = 0.5 + fine * 0.15 - chip * 0.3 - scr * 0.2;
  },
  container(u, v, o) {
    const t = (u * 14) % 1; const rib = smoothstep(0.1, 0.3, t) - smoothstep(0.6, 0.8, t); const fine = tn(u * 150, v * 150, 111, 150, 150);
    const rust = smoothstep(0.66, 0.86, tf(u, v, 8, 8, 4, 112)), streak = tf(u, v, 40, 2, 3, 113);
    const g = 150 + rib * 62 + fine * 12 - smoothstep(0.5, 0.9, streak) * 22; o[0] = g; o[1] = g; o[2] = g;
    o[0] = lerp(o[0], 132, rust * 0.6); o[1] = lerp(o[1], 80, rust * 0.6); o[2] = lerp(o[2], 52, rust * 0.6); o[3] = rib;
  },
  roof(u, v, o) { // shingles
    const rows = 10; const r = Math.floor(v * rows); const fy = v * rows - r; const uu = u * 12 + (r % 2) * 0.5; const c = Math.floor(uu); const fx = uu - c;
    const hsh = hash2(((c % 12) + 12) % 12, r, 121), fine = tn(u * 150, v * 150, 122, 150, 150);
    const edge = smoothstep(0, 0.06, Math.min(fx, 1 - fx)) * smoothstep(0, 0.1, fy);
    const g = (150 + hsh * 60 + fine * 26) * (0.55 + fy * 0.45); o[0] = g; o[1] = g; o[2] = g; mul(o, 0.4 + edge * 0.6); o[3] = fy * edge;
  },
  camo(u, v, o) {
    const a = tf(u, v, 5, 5, 3, 131), b = tf(u, v, 7, 7, 3, 132), c = tf(u, v, 9, 9, 2, 133);
    let col = [112, 118, 84]; if (a > 0.54) col = [70, 84, 52]; if (b > 0.58) col = [120, 100, 70]; if (c > 0.63) col = [38, 42, 32];
    const wx = Math.sin(u * 256 * Math.PI) * 0.5 + 0.5, wy = Math.sin(v * 256 * Math.PI) * 0.5 + 0.5; const weave = wx * wy;
    o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; mul(o, 0.82 + weave * 0.24 + tn(u * 90, v * 90, 134, 90, 90) * 0.1); o[3] = weave * 0.6 + tf(u, v, 12, 12, 2, 135) * 0.4;
  },
  fabric(u, v, o) {
    const wx = Math.sin(u * 200 * Math.PI) * 0.5 + 0.5, wy = Math.sin(v * 200 * Math.PI) * 0.5 + 0.5; const big = tf(u, v, 6, 6, 3, 141);
    const g = 190 + wx * wy * 40 + big * 24; o[0] = g; o[1] = g; o[2] = g; o[3] = wx * wy * 0.7 + big * 0.3;
  },
  bark(u, v, o) {
    const w = tf(u, v, 6, 3, 3, 151); const ridge = 1 - Math.abs(tf(u + w * 0.08, v, 18, 3, 3, 152) * 2 - 1); const fine = tn(u * 100, v * 100, 153, 100, 100);
    const g = 0.45 + ridge * 0.6 + fine * 0.15; o[0] = 96 * g; o[1] = 76 * g; o[2] = 56 * g; o[3] = ridge * 0.8 + fine * 0.2;
  },
  tire(u, v, o) {
    const t = (u * 24 + Math.abs(v - 0.5) * 6) % 1; const tread = smoothstep(0.15, 0.3, t) - smoothstep(0.7, 0.85, t); const side = smoothstep(0.2, 0.26, Math.abs(v - 0.5));
    const g = 30 + tread * 22 * (1 - side) + side * 8; o[0] = g; o[1] = g; o[2] = g + 1; o[3] = tread * (1 - side);
  },
  waves(u, v, o) {
    const a = tf(u, v, 6, 6, 4, 161), b = tf(u + a * 0.1, v, 14, 14, 3, 162); o[0] = o[1] = o[2] = 128; o[3] = a * 0.65 + b * 0.35;
  },
};

function bleed(ctx, size, r, g, b) {
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 8) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  ctx.putImageData(img, 0, 0);
}
function cardTex(c) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; t.needsUpdate = true; return t;
}

function leafCard(size, hue) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const R = mulberry32(7 + hue);
  for (let i = 0; i < 520; i++) {
    const a = R() * Math.PI * 2, rad = Math.sqrt(R()) * size * 0.47; const px = size / 2 + Math.cos(a) * rad, py = size / 2 + Math.sin(a) * rad;
    const l = size * (0.028 + R() * 0.03); const depth = i / 520; const g = 40 + depth * 62 + R() * 20;
    x.save(); x.translate(px, py); x.rotate(R() * Math.PI * 2);
    x.fillStyle = `rgb(${(g * (0.5 + hue * 0.3)) | 0},${g | 0},${(g * 0.3) | 0})`;
    x.beginPath(); x.ellipse(0, 0, l, l * 0.42, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(190,220,120,0.25)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-l, 0); x.lineTo(l, 0); x.stroke(); x.restore();
  }
  bleed(x, size, 44, 74, 26); return cardTex(c);
}
function pineCard(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const R = mulberry32(99);
  for (let i = 0; i < 420; i++) {
    const px = R() * size, len = size * (0.5 + R() * 0.5), y0 = R() * size * 0.35; const g = 30 + (i / 420) * 60 + R() * 26;
    x.strokeStyle = `rgb(${(g * 0.42) | 0},${g | 0},${(g * 0.4) | 0})`; x.lineWidth = 2 + R() * 3.5;
    for (const ox of [-size, 0, size]) { x.beginPath(); x.moveTo(px + ox, y0); x.lineTo(px + ox + (R() - 0.5) * 10, Math.min(size, y0 + len)); x.stroke(); }
  }
  x.fillStyle = 'rgb(20,44,24)'; x.globalCompositeOperation = 'destination-over'; x.fillRect(0, 0, size, size * 0.42); x.globalCompositeOperation = 'source-over';
  bleed(x, size, 22, 54, 24); const t = cardTex(c); t.wrapS = THREE.RepeatWrapping; return t;
}
function grassCard(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const R = mulberry32(5);
  for (let i = 0; i < 46; i++) {
    const bx = size * (0.04 + R() * 0.92), h = size * (0.35 + R() * 0.62), lean = (R() - 0.5) * size * 0.55, w = size * (0.012 + R() * 0.014);
    const g = 96 + R() * 60, dry = R() < 0.18 ? 0.5 : 0; const grad = x.createLinearGradient(0, size, 0, size - h);
    grad.addColorStop(0, `rgb(${(g * 0.36) | 0},${(g * 0.58) | 0},${(g * 0.2) | 0})`); grad.addColorStop(1, `rgb(${(g * (0.72 + dry * 0.5)) | 0},${(g * (1 - dry * 0.1)) | 0},${(g * 0.36) | 0})`);
    x.fillStyle = grad; x.beginPath(); x.moveTo(bx - w, size); x.quadraticCurveTo(bx - w * 0.5 + lean * 0.35, size - h * 0.6, bx + lean, size - h); x.quadraticCurveTo(bx + w * 0.5 + lean * 0.35, size - h * 0.6, bx + w, size); x.fill();
  }
  bleed(x, size, 70, 108, 40); return cardTex(c);
}
function puff(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const R = mulberry32(3);
  for (let i = 0; i < 26; i++) {
    const a = R() * 6.283, r = R() * size * 0.2, pr = size * (0.14 + R() * 0.16); const px = size / 2 + Math.cos(a) * r, py = size / 2 + Math.sin(a) * r;
    const g = x.createRadialGradient(px, py, 0, px, py, pr); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}
function flash(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const R = mulberry32(11);
  x.translate(size / 2, size / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, size * 0.3); g.addColorStop(0, 'rgba(255,255,235,1)'); g.addColorStop(0.4, 'rgba(255,200,90,0.8)'); g.addColorStop(1, 'rgba(255,120,20,0)');
  x.fillStyle = g; x.fillRect(-size / 2, -size / 2, size, size);
  for (let i = 0; i < 7; i++) {
    x.rotate(Math.PI * 2 / 7 + R() * 0.3); const l = size * (0.3 + R() * 0.18);
    const gr = x.createLinearGradient(0, 0, l, 0); gr.addColorStop(0, 'rgba(255,240,190,0.95)'); gr.addColorStop(1, 'rgba(255,140,30,0)');
    x.fillStyle = gr; x.beginPath(); x.moveTo(0, -size * 0.045); x.lineTo(l, 0); x.lineTo(0, size * 0.045); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
function glow(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}
function bulletHole(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const R = mulberry32(21);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); g.addColorStop(0, 'rgba(8,8,8,1)'); g.addColorStop(0.28, 'rgba(14,12,10,0.95)'); g.addColorStop(0.5, 'rgba(40,36,30,0.45)'); g.addColorStop(1, 'rgba(60,54,46,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size); x.strokeStyle = 'rgba(10,10,10,0.6)'; x.lineWidth = 1;
  for (let i = 0; i < 9; i++) { const a = R() * 6.283, l = size * (0.2 + R() * 0.25); x.beginPath(); x.moveTo(size / 2, size / 2); x.lineTo(size / 2 + Math.cos(a) * l, size / 2 + Math.sin(a) * l); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}

// Build everything. Async so the boot screen can update between textures.
export async function buildTextures(quality, maxAniso, onProgress) {
  ANISO = Math.min(maxAniso, quality >= 2 ? 16 : 8);
  const S = quality >= 2 ? 1024 : 512; // procedural surface textures (higher = sharper close up)
  const T = {};
  // [name, normalStrength, metres per tile]
  const list = [['grass', 2.2, 0], ['dirt', 2.6, 0], ['rock', 3.6, 0], ['sand', 1.4, 0], ['asphalt', 2.2, 0], ['concrete', 1.0, 4],
    ['brick', 3, 2.4], ['plaster', 1.6, 3.5], ['wood', 2.4, 2], ['metal', 3.2, 2.2], ['steel', 1.4, 2.5], ['container', 3.4, 2.6],
    ['roof', 3.2, 2.6], ['camo', 1.6, 0], ['fabric', 1.8, 1.2], ['bark', 3.6, 0], ['tire', 2.5, 0], ['waves', 3.2, 0]];
  let i = 0;
  for (const [name, ns, rep] of list) {
    T[name] = synth(name === 'waves' || name === 'tire' || name === 'camo' ? Math.min(S, 512) : S, GEN[name], ns, rep);
    onProgress && onProgress(++i / list.length, name);
    await new Promise(r => setTimeout(r, 0));
  }
  const C = quality >= 2 ? 512 : 256; T.leaf = leafCard(C, 0); T.leaf2 = leafCard(C, 0.55); T.pine = pineCard(C); T.grassCard = grassCard(C / 2);
  T.puff = puff(128); T.flash = flash(128); T.glow = glow(64); T.hole = bulletHole(64);
  return T;
}
