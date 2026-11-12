// Procedural architecture: enterable buildings with windows, doors, interiors, stairs and furniture,
// plus industrial/military structures and street props. All geometry goes through a GeoBatch.
const T = 0.25; // wall thickness
export const BASE = 0.14; // ground-floor height above terrain

// Wall with openings. axis 'x': runs along x at z=c. ops: [{p,w,s,h,glass,door}] (s/h relative to y0)
export function wallRun(b, mat, col, axis, c, a0, a1, y0, y1, ops = [], trim = 0xd8d4c8, R = null, th = T, lin = null) {
  const bx = (u0, u1, ya, yb, m = mat, cl = col, t = th, opt = null) => { if (u1 - u0 < 0.01 || yb - ya < 0.01) return; if (axis === 'x') b.box(m, u0, ya, c - t / 2, u1, yb, c + t / 2, cl, opt); else b.box(m, c - t / 2, ya, u0, c + t / 2, yb, u1, cl, opt);
    if (lin && m === mat && t === th) { const f0 = c + lin.side * t / 2, f1 = f0 + lin.side * 0.022, lo = Math.min(f0, f1), hi = Math.max(f0, f1); // painted lining + skirting board
      if (axis === 'x') b.box('paint', u0, ya, lo, u1, yb, hi, lin.col, { c: false }); else b.box('paint', lo, ya, u0, hi, yb, u1, lin.col, { c: false });
      if (ya <= y0 + 0.001) { const s1 = f0 + lin.side * 0.04, a = Math.min(f0, s1), z = Math.max(f0, s1); if (axis === 'x') b.box('stairwood', u0, ya, a, u1, ya + 0.11, z, 0xe9e4d8, { c: false }); else b.box('stairwood', a, ya, u0, z, ya + 0.11, u1, 0xe9e4d8, { c: false }); } } };
  ops = ops.filter(o => o.p - o.w / 2 > a0 + 0.2 && o.p + o.w / 2 < a1 - 0.2).sort((p, q) => p.p - q.p);
  let cur = a0; const NC = { c: false };
  for (const o of ops) {
    const u0 = o.p - o.w / 2, u1 = o.p + o.w / 2, oh = Math.min(o.h, y1 - y0);
    bx(cur, u0, y0, y1);
    if (o.s > 0) bx(u0, u1, y0, y0 + o.s);
    bx(u0, u1, y0 + oh, y1);
    // frame
    const f = 0.07, tt = th + 0.08;
    bx(u0, u0 + f, y0 + o.s, y0 + oh, 'wood', trim, tt, NC); bx(u1 - f, u1, y0 + o.s, y0 + oh, 'wood', trim, tt, NC); bx(u0, u1, y0 + oh - f, y0 + oh, 'wood', trim, tt, NC);
    if (o.s > 0) bx(u0 - 0.06, u1 + 0.06, y0 + o.s - 0.06, y0 + o.s + 0.03, 'concrete', trim, th + 0.22, NC);
    if (o.glass) {
      const lv = Math.sin(o.p * 12.9898 + c * 78.233 + y0 * 37.719 + a0 * 3.1) * 43758.5453, lit = lv - Math.floor(lv) < 0.46;
      if (!R || R.f() > 0.22) bx(u0 + f, u1 - f, y0 + o.s + 0.03, y0 + oh - f, lit ? 'glassLit' : 'glass', lit ? [0xffffff, 0xffe9c4, 0xfff4dc, 0xd6e6ff][Math.floor((lv - Math.floor(lv)) * 8.6) % 4] : 0xffffff, 0.03, NC);
      if (o.w > 0.9) bx(o.p - 0.025, o.p + 0.025, y0 + o.s, y0 + oh, 'wood', trim, 0.07, NC);
      if (oh - o.s > 1) bx(u0, u1, y0 + (o.s + oh) / 2 - 0.025, y0 + (o.s + oh) / 2 + 0.025, 'wood', trim, 0.07, NC);
    }
    if (o.door && (!R || R.f() > 0.15)) { // door leaf swung open
      const ang = (R ? R.range(1.2, 2.0) : 1.6), dw = o.w - 0.1, cx = u0 + Math.cos(ang) * dw / 2, cz = Math.sin(ang) * dw / 2 * (o.inward ? -1 : 1);
      if (axis === 'x') b.boxR('wood', cx, y0 + oh / 2, c + cz, dw, oh - 0.05, 0.05, -ang * (o.inward ? -1 : 1), o.doorCol || 0x6e5038);
      else b.boxR('wood', c + cz, y0 + oh / 2, cx, 0.05, oh - 0.05, dw, ang * (o.inward ? -1 : 1), o.doorCol || 0x6e5038);
    }
    cur = u1;
  }
  bx(cur, a1, y0, y1);
}

export function slab(b, mat, col, x0, z0, x1, z1, y0, y1, hole = null, opt = null) {
  opt = { bottom: true, ...(opt || {}) }; // ceilings must be visible from below
  if (!hole) { b.box(mat, x0, y0, z0, x1, y1, z1, col, opt); return; }
  b.box(mat, x0, y0, z0, x1, y1, hole.z0, col, opt); b.box(mat, x0, y0, hole.z1, x1, y1, z1, col, opt);
  b.box(mat, x0, y0, hole.z0, hole.x0, y1, hole.z1, col, opt); b.box(mat, hole.x1, y0, hole.z0, x1, y1, hole.z1, col, opt);
}

// Straight flight of solid steps along +x (dir=1) or -x (dir=-1), starting at x.
export function stairs(b, x, y, z0, z1, rise, dir = 1, mat = 'concrete', col = 0x8f8d88, alongZ = false, rail = null) {
  const n = Math.round(rise / 0.25), sh = rise / n, run = 0.3; const NC = { c: false };
  for (let i = 0; i < n; i++) {
    const a = x + dir * i * run, c = x + dir * (i + 1) * run, lo = Math.min(a, c), hi = Math.max(a, c), top = y + (i + 1) * sh;
    if (alongZ) b.box(mat, z0, y, lo, z1, top, hi, col); else b.box(mat, lo, y, z0, hi, top, z1, col);
    if (rail && !alongZ) { // tread cap with a small overhang toward the walker
      b.box('stairwood', lo - (dir > 0 ? 0.03 : 0), top, z0, hi + (dir < 0 ? 0.03 : 0), top + 0.035, z1, 0xb98d5e, NC);
      const rz = rail === 'z1' ? z1 - 0.06 : z0 + 0.01; b.box('stairwood', lo, top + 0.9, rz, hi, top + 0.96, rz + 0.05, 0x5a4634, NC);
      if (i % 2 === 0) b.box('steel', (lo + hi) / 2 - 0.02, top, rz + 0.005, (lo + hi) / 2 + 0.02, top + 0.9, rz + 0.045, 0x2e3033, NC);
    }
  }
  return n * run;
}

// ---------- furniture ----------
export const F = {
  table(b, x, y, z, R, col = 0x8a6a48) { if (b.prop('office/table', x, y, z, x + 1.5, y + 0.78, z + 0.85)) { b.box(null, x, y + 0.6, z, x + 1.5, y + 0.78, z + 0.85, 0, { mat: 1 }); b.loot(x + 0.75, y + 0.8, z + 0.42, 1); return; } b.box('wood', x, y + 0.72, z, x + 1.5, y + 0.78, z + 0.85, col); for (const [dx, dz] of [[0.05, 0.05], [1.39, 0.05], [0.05, 0.74], [1.39, 0.74]]) b.box('wood', x + dx, y, z + dz, x + dx + 0.06, y + 0.72, z + dz + 0.06, col, { c: false }); b.loot(x + 0.75, y + 0.8, z + 0.42, 1); },
  chair(b, x, y, z, col = 0x77583c) { if (b.prop('office/chair', x - 0.03, y, z - 0.03, x + 0.5, y + 0.92, z + 0.5, { uniform: 1 })) return; b.box('wood', x, y + 0.42, z, x + 0.44, y + 0.47, z + 0.44, col, { c: false }); b.box('wood', x, y + 0.47, z, x + 0.44, y + 0.95, z + 0.05, col, { c: false }); for (const [dx, dz] of [[0, 0], [0.39, 0], [0, 0.39], [0.39, 0.39]]) b.box('wood', x + dx, y, z + dz, x + dx + 0.05, y + 0.42, z + dz + 0.05, col, { c: false }); },
  bed(b, x, y, z, R, ax = true) { const L = 2.05, W = 0.95, c = R.pick([0x7a8898, 0x8c6e5e, 0x6f7f62, 0x9a9484]); const X = ax ? L : W, Z = ax ? W : L;
    b.box('wood', x, y, z, x + X, y + 0.3, z + Z, 0x6b5138); b.box('fabric', x + 0.04, y + 0.3, z + 0.04, x + X - 0.04, y + 0.48, z + Z - 0.04, c, { c: false });
    if (ax) { b.box('fabric', x + 0.1, y + 0.48, z + 0.15, x + 0.55, y + 0.58, z + Z - 0.15, 0xdcd8cc, { c: false }); b.box('wood', x - 0.05, y, z, x, y + 0.9, z + Z, 0x6b5138, { c: false }); }
    else { b.box('fabric', x + 0.15, y + 0.48, z + 0.1, x + X - 0.15, y + 0.58, z + 0.55, 0xdcd8cc, { c: false }); b.box('wood', x, y, z - 0.05, x + X, y + 0.9, z, 0x6b5138, { c: false }); } },
  bunk(b, x, y, z, R) { F.bed(b, x, y, z, R, true); b.box('steel', x, y + 1.25, z, x + 2.05, y + 1.32, z + 0.95, 0x4a5246, { c: false }); b.box('fabric', x + 0.04, y + 1.32, z + 0.04, x + 2.01, y + 1.46, z + 0.91, 0x6f7f62, { c: false });
    for (const [dx, dz] of [[0, 0], [2.0, 0], [0, 0.9], [2.0, 0.9]]) b.box('steel', x + dx, y, z + dz, x + dx + 0.05, y + 1.7, z + dz + 0.05, 0x3c4238, { c: false }); },
  sofa(b, x, y, z, R, ax = true) { { const X0 = ax ? 1.95 : 0.85, Z0 = ax ? 0.85 : 1.95; if (b.prop(R.pick(['office/couch_medium', 'office/couch_wide', 'office/couch_medium']), x, y, z, x + X0, y + 0.85, z + Z0)) { b.box(null, x, y, z, x + X0, y + 0.42, z + Z0, 0, { mat: 3 }); return; } } const c = R.pick([0x6a4a3c, 0x4e5c6a, 0x5c6248, 0x7c6a58]); const L = 1.95, W = 0.85; const X = ax ? L : W, Z = ax ? W : L;
    b.box('fabric', x, y, z, x + X, y + 0.42, z + Z, c); if (ax) { b.box('fabric', x, y + 0.42, z, x + X, y + 0.85, z + 0.22, c, { c: false }); b.box('fabric', x, y + 0.42, z, x + 0.2, y + 0.62, z + Z, c, { c: false }); b.box('fabric', x + X - 0.2, y + 0.42, z, x + X, y + 0.62, z + Z, c, { c: false }); }
    else { b.box('fabric', x, y + 0.42, z, x + 0.22, y + 0.85, z + Z, c, { c: false }); b.box('fabric', x, y + 0.42, z, x + X, y + 0.62, z + 0.2, c, { c: false }); b.box('fabric', x, y + 0.42, z + Z - 0.2, x + X, y + 0.62, z + Z, c, { c: false }); } },
  shelf(b, x, y, z, R, ax = true, mat = 'wood', col = 0x7a5e42) { { const X0 = ax ? 1.3 : 0.38, Z0 = ax ? 0.38 : 1.3; if (b.prop('office/medium_book_shelf', x, y, z, x + X0, y + 1.9, z + Z0)) { b.box(null, x, y, z, x + X0, y + 1.9, z + Z0, 0, { mat: 1 }); b.loot(x + X0 / 2 + (ax ? 0 : 0.5), y + 0.05, z + Z0 / 2 + (ax ? 0.5 : 0), 1); return; } } const L = 1.3, D = 0.38; const X = ax ? L : D, Z = ax ? D : L;
    b.box(null, x, y, z, x + X, y + 1.9, z + Z, 0, { mat: 1 });
    for (let s = 0; s < 5; s++) b.box(mat, x, y + s * 0.46, z, x + X, y + s * 0.46 + 0.04, z + Z, col, { c: false });
    if (ax) { b.box(mat, x, y, z, x + 0.04, y + 1.9, z + Z, col, { c: false }); b.box(mat, x + X - 0.04, y, z, x + X, y + 1.9, z + Z, col, { c: false }); b.box(mat, x, y, z, x + X, y + 1.9, z + 0.03, col, { c: false, shade: 0.8 }); }
    else { b.box(mat, x, y, z, x + X, y + 1.9, z + 0.04, col, { c: false }); b.box(mat, x, y, z + Z - 0.04, x + X, y + 1.9, z + Z, col, { c: false }); b.box(mat, x, y, z, x + 0.03, y + 1.9, z + Z, col, { c: false, shade: 0.8 }); }
    for (let s = 0; s < 4; s++) if (R.chance(0.7)) { const u = R.range(0.1, 0.7); const c = R.pick([0x8a3a2e, 0x2e5a8a, 0xb8a060, 0x4a6a48, 0xc8c4b8]); if (ax) b.box('steel', x + u, y + s * 0.46 + 0.04, z + 0.06, x + u + R.range(0.15, 0.4), y + s * 0.46 + R.range(0.2, 0.38), z + Z - 0.06, c, { c: false }); else b.box('steel', x + 0.06, y + s * 0.46 + 0.04, z + u, x + X - 0.06, y + s * 0.46 + R.range(0.2, 0.38), z + u + R.range(0.15, 0.4), c, { c: false }); }
    b.loot(x + X / 2, y + 0.98, z + Z / 2, 1); },
  locker(b, x, y, z, n = 3, ax = true) { for (let i = 0; i < n; i++) { const X = ax ? x + i * 0.52 : x, Z = ax ? z : z + i * 0.52; b.box('steel', X, y, Z, X + 0.5, y + 1.9, Z + 0.5, i % 2 ? 0x5a6658 : 0x54604f); b.box('steel', X + (ax ? 0.2 : 0.5), y + 1.0, Z + (ax ? 0.5 : 0.2), X + (ax ? 0.3 : 0.52), y + 1.15, Z + (ax ? 0.52 : 0.3), 0x202020, { c: false }); } },
  crate(b, x, y, z, s = 0.9, col = 0x86694a) { b.box('wood', x, y, z, x + s, y + s, z + s, col); const e = 0.05; for (const [a, c] of [[0, 0], [s - 0.09, 0], [0, s - 0.09], [s - 0.09, s - 0.09]]) b.box('wood', x + a - e * 0.3, y, z + c - e * 0.3, x + a + 0.09 + e * 0.3, y + s + 0.01, z + c + 0.09 + e * 0.3, col, { c: false, shade: 0.75 }); },
  ammoBox(b, x, y, z) { b.box('steel', x, y, z, x + 0.75, y + 0.38, z + 0.42, 0x4c5a3c); b.box('steel', x - 0.01, y + 0.3, z - 0.01, x + 0.76, y + 0.33, z + 0.43, 0x2c3424, { c: false }); b.loot(x + 0.38, y + 0.42, z + 0.2, 2); },
  desk(b, x, y, z, R) { if (b.prop('office/desk_3', x, y, z, x + 1.4, y + 0.77, z + 0.7)) { b.box(null, x, y + 0.6, z, x + 1.4, y + 0.77, z + 0.7, 0, { mat: 1 }); b.prop('office/computer_screen', x + 0.45, y + 0.77, z + 0.08, x + 1.0, y + 1.18, z + 0.3); b.prop('office/keyboard_2', x + 0.5, y + 0.77, z + 0.36, x + 0.95, y + 0.8, z + 0.52); b.prop('office/office_chair', x + 0.45, y, z + 0.8, x + 1.0, y + 1.05, z + 1.35, { uniform: 1 }); return; } b.box('wood', x, y + 0.72, z, x + 1.4, y + 0.77, z + 0.7, 0x6e5a48); b.box('wood', x, y, z, x + 0.45, y + 0.72, z + 0.7, 0x645040, { c: false }); b.box('wood', x + 1.34, y, z, x + 1.4, y + 0.72, z + 0.7, 0x645040, { c: false });
    b.box('steel', x + 0.5, y + 0.84, z + 0.12, x + 1.05, y + 1.2, z + 0.16, 0x161616, { c: false }); b.box('steel', x + 0.72, y + 0.77, z + 0.1, x + 0.82, y + 0.86, z + 0.2, 0x222222, { c: false }); },
  counter(b, x, y, z, len = 2.2, ax = true) { const X = ax ? len : 0.62, Z = ax ? 0.62 : len; b.box('plaster', x, y, z, x + X, y + 0.88, z + Z, 0xe2ded2); b.box('steel', x - 0.02, y + 0.88, z - 0.02, x + X + 0.02, y + 0.92, z + Z + 0.02, 0x9a9a98, { c: false }); },
  fridge(b, x, y, z) { if (b.prop('office/vending_machine', x, y, z, x + 0.8, y + 1.85, z + 0.7)) { b.box(null, x, y, z, x + 0.8, y + 1.85, z + 0.7, 0, { mat: 2 }); return; } b.box('steel', x, y, z, x + 0.7, y + 1.8, z + 0.68, 0xe6e6e2); b.box('steel', x + 0.05, y + 1.15, z + 0.68, x + 0.09, y + 1.6, z + 0.71, 0x777777, { c: false }); },
  barrel(b, x, y, z, col = 0x3c5a7a) { if (b.prop('urban/barrel', x - 0.32, y, z - 0.32, x + 0.32, y + 0.92, z + 0.32, { out: 1, uniform: 1 })) { b.box(null, x - 0.27, y, z - 0.27, x + 0.27, y + 0.9, z + 0.27, 0, { mat: 2 }); return; } b.cyl('steel', x, y, z, 0.3, 0.9, col, 10, { c: true }); b.cyl('steel', x, y + 0.3, z, 0.315, 0.03, col, 10, { cap: false }); b.cyl('steel', x, y + 0.6, z, 0.315, 0.03, col, 10, { cap: false }); },
};

// furniture models (CC0 house / prop packs): key list and height per item type
const MODELS = {
  bed: { keys: ['house/bed_king_free_model', 'house/bed_single_free_model', 'props/bed_free_model'], h: 0.95 },
  sofa: { keys: ['house/couch_medium_free_model', 'house/l_couch_free_model', 'props/couch_free_model'], h: 0.9 },
  shelf: { keys: ['props/bookshelf_free_model'], h: 1.95 },
  locker: { keys: ['props/dresser_free_model'], h: 1.2 },
  desk: { keys: ['props/desk_free_model'], h: 0.8 },
  counter: { keys: ['house/kitchen_sink_free_model', 'props/stove_free_model', 'house/kitchen_fridge_free_model'], h: 0.95 },
};
function furnish(b, R, x0, z0, x1, z1, y, kind) {
  const w = x1 - x0, d = z1 - z0; if (w < 2.4 || d < 2.4) { b.loot((x0 + x1) / 2, y + 0.05, (z0 + z1) / 2, 1); return; }
  // (the imported whole-room kits were removed: they brought their own dark floor slab and wall pieces that covered the building's floor)
  const corners = [[x0 + 0.1, z0 + 0.1, 0], [x1 - 0.1, z0 + 0.1, 1], [x0 + 0.1, z1 - 0.1, 2], [x1 - 0.1, z1 - 0.1, 3]];
  const order = corners.sort(() => R.f() - 0.5);
  const items = kind === 'mil' ? ['bunk', 'locker', 'ammo', 'crate', 'desk'] : kind === 'office' ? ['desk', 'shelf', 'locker', 'sofa'] : kind === 'store' ? ['shelf', 'shelf', 'counter', 'crate'] : ['bed', 'sofa', 'shelf', 'counter'];
  let n = Math.min(4, Math.max(2, Math.floor(w * d / 9)));
  for (let i = 0; i < n; i++) {
    const [cx, cz, q] = order[i]; const it = items[i % items.length]; const left = q % 2 === 0, top = q < 2; const ax = R.chance(0.5);
    const sz = { bed: ax ? [2.05, 0.95] : [0.95, 2.05], bunk: [2.05, 0.95], sofa: ax ? [1.95, 0.85] : [0.85, 1.95], shelf: ax ? [1.3, 0.38] : [0.38, 1.3], locker: ax ? [1.56, 0.5] : [0.5, 1.56], crate: [0.9, 0.9], ammo: [0.75, 0.42], desk: [1.4, 0.7], counter: ax ? [2.2, 0.62] : [0.62, 2.2] }[it];
    if (sz[0] > w * 0.6 || sz[1] > d * 0.6) continue;
    const x = left ? cx : cx - sz[0], z = top ? cz : cz - sz[1];
    const M = MODELS[it]; if (M && M.keys.length) { const key = R.pick(M.keys); if (b.prop(key, x, y, z, x + sz[0], y + M.h, z + sz[1], { uniform: 1 })) { b.loot(x + sz[0] / 2, y + M.h + 0.05, z + sz[1] / 2, 1); continue; } }
    if (it === 'bed') F.bed(b, x, y, z, R, ax); else if (it === 'bunk') F.bunk(b, x, y, z, R); else if (it === 'sofa') F.sofa(b, x, y, z, R, ax); else if (it === 'shelf') F.shelf(b, x, y, z, R, ax);
    else if (it === 'locker') F.locker(b, x, y, z, 3, ax); else if (it === 'crate') { F.crate(b, x, y, z); b.loot(x + 0.45, y + 0.95, z + 0.45, 1); } else if (it === 'ammo') F.ammoBox(b, x, y, z); else if (it === 'desk') { F.desk(b, x, y, z, R); b.loot(x + 1.1, y + 0.8, z + 0.4, 1); } else if (it === 'counter') { F.counter(b, x, y, z, 2.2, ax); b.loot(x + sz[0] / 2, y + 0.95, z + sz[1] / 2, 1); }
  }
  if (w > 4.5 && d > 4.5) { const tx = (x0 + x1) / 2 - 0.75 + R.range(-0.4, 0.4), tz = (z0 + z1) / 2 - 0.42 + R.range(-0.4, 0.4); F.table(b, tx, y, tz, R); F.chair(b, tx + 0.2, y, tz - 0.5); F.chair(b, tx + 0.9, y, tz + 0.9); }
  if (kind !== 'mil' && w > 5.5 && d > 5.5 && R.chance(0.35)) { // feature piece on the free wall
    const k = R.pick(kind === 'store' ? [['cafe/coffee_machine', 0.9, 1.0, 0.6], ['cafe/can_fridge', 0.8, 1.9, 0.7], ['cafe/cash_register', 0.6, 0.5, 0.5]] : [['cafe/electric_oven', 0.8, 0.95, 0.7], ['cafe/dishwasher', 0.7, 0.9, 0.65], ['cafe/guitar_amp', 0.7, 0.7, 0.4], ['cafe/bass_speakers', 0.8, 1.3, 0.6], ['cafe/pool_table', 2.4, 0.85, 1.3], ['cafe/drum_set', 1.6, 1.3, 1.4]]);
    const fx = (x0 + x1) / 2 - k[1] / 2 + R.range(-0.6, 0.6), fz = k[0] === 'cafe/pool_table' || k[0] === 'cafe/drum_set' ? (z0 + z1) / 2 + 1.4 : z1 - k[3] - 0.08;
    if (b.prop(k[0], fx, y, fz, fx + k[1], y + k[2], fz + k[3])) b.box(null, fx, y, fz, fx + k[1], y + Math.min(k[2], 1.2), fz + k[3], 0, { mat: 1 });
  }
  if (kind !== 'mil') {
    const c = order[3]; const px = c[2] % 2 === 0 ? c[0] : c[0] - 0.55, pz = c[2] < 2 ? c[1] : c[1] - 0.55;
    if (kind === 'home' && R.chance(0.6)) b.prop(R.pick(['house/houseplant_free_model', 'house/lamp_free_model', 'props/desk_lamp_free_model']), px, y, pz, px + 0.55, y + 1.4, pz + 0.55, { uniform: 1 });
    if (R.chance(0.7)) b.prop(R.pick(['office/houseplant_2', 'office/potted_plant', 'office/plant_white_pot', 'office/light_floor', kind === 'office' ? 'office/water_cooler' : 'office/houseplant_2', kind === 'store' ? 'office/cardboard_boxes' : 'office/trashcan']), px, y, pz, px + 0.55, y + 1.25, pz + 0.55, { uniform: 1 });
    if (w > 4 && d > 4 && R.chance(0.6)) b.prop(R.chance(0.5) ? 'office/rug' : 'office/rug_round', (x0 + x1) / 2 - 1.3, y, (z0 + z1) / 2 - 0.9, (x0 + x1) / 2 + 1.3, y + 0.025, (z0 + z1) / 2 + 0.9);
  }
  b.loot(R.range(x0 + 0.8, x1 - 0.8), y + 0.05, R.range(z0 + 0.8, z1 - 0.8), kind === 'mil' ? 2 : 1);
}

// ---------- detailed interiors (Ultimate House Interior pack + Household Props + Food pack, CC0) ----------
// Every room gets a role (living room, kitchen, bedroom, bathroom, study, shop, storeroom, office). Furniture stands
// against the walls facing into the room, door openings and the stair landing stay clear, and small items (lamps,
// food, books) sit on top of the furniture. Sizes are real metres; models keep their proportions.
export const FOOD_KEYS = ['apple_green', 'banana', 'bread', 'broccoli', 'carrot', 'cheeseburger', 'chicken_leg', 'croissant', 'cupcake', 'donut', 'eggplant', 'fries', 'hotdog', 'pancakes_stack', 'pepper_green', 'pizza', 'pumpkin', 'soda', 'steak', 'tomato', 'turnip', 'waffle', 'bottle', 'ketchup_bottle', 'lettuce', 'avocado'].map(n => 'food/' + n.replace(/((?:_b)*)$/, '_free_model$1'));
const FOOD_MEAL = ['cheeseburger', 'pizza', 'steak', 'pancakes_stack', 'waffle', 'fries', 'hotdog', 'chicken_leg', 'croissant', 'donut', 'cupcake'].map(n => 'food/' + n.replace(/((?:_b)*)$/, '_free_model$1'));
const FOOD_SHOP_BOTTLES = ['bottle', 'sauce_bottle', 'old_bottle', 'champagne_bottle', 'hand_wash_bottle', 'baby_bottle'].map(n => 'bottles/' + n + '_free_model');
const FOOD_SHOP_BASE = ['apple_green', 'banana', 'bread', 'broccoli', 'carrot', 'eggplant', 'pepper_green', 'tomato', 'lettuce', 'avocado', 'soda', 'bottle', 'bottle_b', 'ketchup_bottle', 'turnip', 'croissant', 'chocolate_bar', 'donut'].map(n => 'food/' + n.replace(/((?:_b)*)$/, '_free_model$1'));
const FOOD_SHOP = [...FOOD_SHOP_BASE, ...FOOD_SHOP_BASE.slice(0, 6), ...FOOD_SHOP_BOTTLES];
const BOTTLE = (n) => 'bottles/' + n + '_free_model', RETRO = ['macintosh_classic', 'computer_90s', 'computer_generic_2000s'].map(n => 'retro/' + n + '_free_model');
const RETRO_TURN = 1; // the retro computer models face -x: one quarter turn so they face the room like everything else
const BOTTLES_KITCHEN = ['bottle', 'sauce_bottle', 'old_bottle', 'champagne_bottle'].map(BOTTLE);
const H_ = (n) => 'house/' + n.replace(/((?:_b)*)$/, '_free_model$1'), P_ = (n) => 'props/' + n.replace(/((?:_b)*)$/, '_free_model$1');
// [key, size, axis] - size is the width along the wall ('w'), or the height ('h')
const KIT = {
  couch: [[H_('couch_medium'), 2.2], [H_('couch_large'), 2.5], [P_('couch'), 1.8]], armchair: [[P_('armchair'), 0.8], [P_('rocking_chair'), 0.7]],
  bookcase: [[H_('shelf_large'), 1.7], [P_('bookshelf'), 1.1]], fireplace: [[H_('fireplace'), 1.8]], sideboard: [[H_('drawer'), 1.5], [H_('drawer_b'), 1.9], [H_('drawer_b_b_b_b'), 1.5]],
  floorlamp: [[H_('light_stand'), 1.75, 'h'], [P_('lamp_with_shade'), 1.5, 'h']], plant: [[H_('houseplant_b_b'), 0.7], [H_('houseplant_b_b_b_b'), 0.65], [H_('houseplant_b'), 1.0, 'h'], [H_('houseplant_b_b_b'), 0.6], [H_('cactus'), 0.9, 'h']],
  clock: [[P_('grandfathers_clock'), 1.95, 'h']], tv: [['cafe/speaker', 0.6], ['cafe/bass_speakers', 0.8]],
  fridge: [[H_('kitchen_fridge'), 0.8], [P_('refrigirator'), 1.9, 'h']], oven: [[H_('oven'), 0.72], [P_('stove'), 0.9, 'h']], sink: [[H_('kitchen_sink'), 0.68]], counter: [[H_('drawer'), 1.4], [H_('drawer_b_b_b_b'), 1.4]],
  washer: [[H_('washing_machine'), 0.75]], bin: [[H_('trashcan_small'), 0.4], [H_('trashcan_small_b'), 0.42], [P_('trash_bin'), 0.45, 'h']],
  bedD: [[H_('bed_king'), 1.8], [P_('bed'), 1.5]], bedS: [[H_('bed_single'), 1.1]], nightstand: [[H_('night_stand'), 0.5], [H_('night_stand_b'), 0.5]], dresser: [[H_('drawer_b_b_b'), 1.3], [P_('dresser'), 1.1]],
  coatrack: [[P_('coat_rack'), 1.75, 'h']], tub: [[H_('bathtub'), 0.8]], toilet: [[P_('toilet'), 0.82, 'h']], basin: [[P_('bathroom_sink'), 0.62]], towel: [[H_('towel_rack'), 0.7]],
  treadmill: [[P_('treadmill'), 0.75]], safe: [[P_('safe'), 0.5]], ladder: [[P_('ladder'), 1.1]],
};
const ROLE = {
  living: { wall: [['couch', 1, 'mid'], ['fireplace', 0.35, 'mid'], ['bookcase', 0.8], ['sideboard', 0.7], ['armchair', 0.7], ['floorlamp', 0.8, 'end'], ['plant', 0.9, 'end'], ['clock', 0.3], ['tv', 0.5], ['plant', 0.5, 'end']], centre: 'lounge', art: 2 },
  kitchen: { wall: [['fridge', 1, 'end'], ['oven', 1], ['sink', 1], ['counter', 1], ['counter', 0.7], ['washer', 0.5], ['bin', 0.9, 'end'], ['plant', 0.4, 'end']], centre: 'dining', art: 1, food: 1 },
  studio: { wall: [['couch', 1, 'mid'], ['fridge', 1, 'end'], ['oven', 0.9], ['counter', 0.9], ['bookcase', 0.6], ['floorlamp', 0.7, 'end'], ['plant', 0.8, 'end'], ['bin', 0.6, 'end']], centre: 'dining', art: 1, food: 1 },
  bedroom: { wall: [['bedD', 1, 'mid', 'nightstands'], ['dresser', 0.9], ['bookcase', 0.4], ['coatrack', 0.6, 'end'], ['armchair', 0.4], ['plant', 0.8, 'end'], ['treadmill', 0.15]], centre: 'rug', art: 2 },
  kids: { wall: [['bedS', 1, 'end', 'nightstand'], ['bedS', 0.8, 'end', 'nightstand'], ['dresser', 0.8], ['bookcase', 0.6], ['plant', 0.5, 'end']], centre: 'rug', art: 1 },
  bath: { wall: [['tub', 1, 'end'], ['toilet', 1, 'end'], ['basin', 1], ['washer', 0.7], ['bin', 0.8, 'end'], ['towel', 0.9], ['plant', 0.4, 'end']], centre: null, art: 0 },
  study: { wall: [['desk', 1, 'mid'], ['bookcase', 1], ['bookcase', 0.6], ['armchair', 0.8], ['floorlamp', 0.8, 'end'], ['safe', 0.3, 'end'], ['plant', 0.8, 'end'], ['clock', 0.3]], centre: 'rug', art: 2 },
  shop: { wall: [['shopshelf', 1], ['shopshelf', 1], ['shopshelf', 0.9], ['till', 1, 'mid'], ['drinks', 0.9, 'end'], ['shopshelf', 0.7], ['plant', 0.5, 'end']], centre: 'gondola', art: 0 },
  storage: { wall: [['shopshelf', 1], ['crates', 1, 'end'], ['crates', 0.9, 'end'], ['shopshelf', 0.7], ['ladder', 0.5], ['crates', 0.6, 'end']], centre: 'pallet', art: 0 },
  office: { wall: [['desk', 1], ['desk', 0.9], ['bookcase', 0.8], ['filer', 0.8, 'end'], ['cooler', 0.6, 'end'], ['plant', 0.9, 'end'], ['desk', 0.5], ['printer', 0.5, 'end']], centre: 'meeting', art: 1 },
};

function furnishRoom(b, R, x0, z0, x1, z1, y, ctx) {
  const A = b.props && b.props.G && b.props.G.assets; const role = ROLE[ctx.role]; if (!A || !role) return furnish(b, R, x0, z0, x1, z1, y, ctx.kind);
  const used = (ctx.keep || []).filter(k => k[2] > x0 && k[0] < x1 && k[3] > z0 && k[1] < z1).map(k => [...k, 9]);
  const ok = (a0, c0, a1, c1) => { if (a0 < x0 - 0.01 || c0 < z0 - 0.01 || a1 > x1 + 0.01 || c1 > z1 + 0.01) return false; for (const u of used) if (a0 < u[2] && a1 > u[0] && c0 < u[3] && c1 > u[1]) return false; return true; };
  // model size scaled to the requested width / height
  const dims = (spec) => { const st = A.static(spec[0]); if (!st) return null; const s = spec[2] === 'h' ? spec[1] / st.size.y : spec[1] / st.size.x; return [st.size.x * s, st.size.y * s, st.size.z * s]; };
  const pick = (name) => { const list = KIT[name].filter(s => A.has(s[0])); return list.length ? R.pick(list) : null; };
  const YAW = { N: 0, S: 2, W: 1, E: 3 };
  // model box on wall `wl` at offset u along it (W along the wall, D into the room)
  const rectOn = (wl, u, W, D, gap = 0.04) => wl === 'N' ? [u, z0 + gap, u + W, z0 + gap + D] : wl === 'S' ? [u, z1 - gap - D, u + W, z1 - gap] : wl === 'W' ? [x0 + gap, u, x0 + gap + D, u + W] : [x1 - gap - D, u, x1 - gap, u + W];
  const model = (key, r, y0, H, wl) => b.prop(key, r[0], y0, r[1], r[2], y0 + H, r[3], { yaw: YAW[wl], fixed: 1 });
  const walls = ['N', 'S', 'W', 'E'].filter(wl => !(wl === 'N' && ctx.openN)); const span = (wl) => wl === 'N' || wl === 'S' ? [x0, x1] : [z0, z1];
  // find a free slot for a W x D item; pos: 'mid' (prefer wall centre), 'end' (prefer corners), else anywhere
  const slot = (W, D, pos, front = 0.55, only) => {
    const ws = (only ? [only] : walls.slice().sort(() => R.f() - 0.5)); const tries = [];
    for (const wl of ws) { const [a, c] = span(wl), L = c - a; if (W > L - 0.2) continue; const mid = (a + c) / 2 - W / 2;
      const us = []; for (let u = a + 0.12; u + W <= c - 0.12; u += 0.25) us.push(u);
      if (pos === 'mid') us.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid)); else if (pos === 'end') us.sort((p, q) => Math.min(p - a, c - p - W) - Math.min(q - a, c - q - W)); else us.sort(() => R.f() - 0.5);
      for (const u of us.slice(0, 40)) tries.push([wl, u]); }
    for (const [wl, u] of tries) { const r = rectOn(wl, u, W, D), f = rectOn(wl, u, W, D + front); if (ok(f[0], f[1], f[2], f[3])) return { wl, r, f }; }
    return null; };
  const claim = (s, H) => { used.push([...s.r, H]); used.push([...s.f, 0.01]); };
  const onTop = (key, r, top, size, axis = 'w', yawQ = null) => { const st = A.has(key) && A.static(key); if (!st) return; const sc = axis === 'h' ? size / st.size.y : size / Math.max(st.size.x, st.size.z); const w = st.size.x * sc, d = st.size.z * sc, cx = (r[0] + r[2]) / 2 + R.range(-0.15, 0.15) * (r[2] - r[0] - w), cz = (r[1] + r[3]) / 2 + R.range(-0.15, 0.15) * (r[3] - r[1] - d);
    const yq = yawQ === null ? R.int(0, 3) : yawQ, odd = yq % 2; const ww = odd ? d : w, dd = odd ? w : d; b.prop(key, cx - ww / 2, top, cz - dd / 2, cx + ww / 2, top + st.size.y * sc, cz + dd / 2, { yaw: yq, fixed: 1 }); };
  const food = (r, top, n = 1, list = FOOD_MEAL) => { for (let i = 0; i < n; i++) { const k = R.pick(list); const st = A.has(k) && A.static(k); if (!st) continue; const sz = /pizza|pancake|waffle|steak/.test(k) ? 0.3 : /champagne/.test(k) ? 0.34 : /bottles\//.test(k) ? 0.26 : /bottle|soda|ketchup/.test(k) ? 0.24 : 0.17; onTop(k, r, top, sz, /bottle|soda|ketchup|carrot|turnip|eggplant/.test(k) ? 'h' : 'w'); } };
  const placeKit = (name, pos, extra) => {
    const spec = pick(name); if (!spec) return null; const dm = dims(spec); if (!dm) return null; const [W, H, D] = dm; const s = slot(W, D + (extra === 'nightstands' ? 0 : 0), pos); if (!s) return null;
    if (extra === 'nightstands' || extra === 'nightstand') { // bed: nightstands on one or both sides, lamp on each
      const ns = pick('nightstand'), nd = ns && dims(ns); if (nd) for (const side of extra === 'nightstands' ? [-1, 1] : [R.chance(0.5) ? -1 : 1]) {
        const along = s.wl === 'N' || s.wl === 'S'; const u0 = along ? (side < 0 ? s.r[0] - nd[0] - 0.05 : s.r[2] + 0.05) : (side < 0 ? s.r[1] - nd[0] - 0.05 : s.r[3] + 0.05); const r2 = rectOn(s.wl, u0, nd[0], nd[2]);
        if (ok(r2[0], r2[1], r2[2], r2[3])) { model(ns[0], r2, y, nd[1], s.wl); used.push([...r2, nd[1]]); onTop(R.chance(0.7) ? H_('table_lamp') : P_('alarm_clock'), r2, y + nd[1], R.chance(0.7) ? 0.42 : 0.14, 'h'); } } }
    model(spec[0], s.r, y, H, s.wl); claim(s, H); return { ...s, H, W, D };
  };
  for (const [name, p, pos, extra] of role.wall) { if (!R.chance(p)) continue; let it = null;
    if (name === 'desk') { const s = slot(1.4, 0.7, pos, 1.0); if (s) { deskAt(b, R, s, y); claim(s, 0.8); b.loot((s.r[0] + s.r[2]) / 2, y + 0.8, (s.r[1] + s.r[3]) / 2, 1); } continue; }
    if (name === 'shopshelf') { const s = slot(1.6, 0.42, pos, 0.9); if (s) { shopShelf(b, R, s, y, food); claim(s, 1.9); } continue; }
    if (name === 'till') { const s = slot(2.2, 0.62, pos, 0.9); if (s) { const along = s.wl === 'N' || s.wl === 'S'; F.counter(b, s.r[0], y, s.r[1], 2.2, along); claim(s, 0.92); b.prop('cafe/cash_register', (s.r[0] + s.r[2]) / 2 - 0.25, y + 0.92, (s.r[1] + s.r[3]) / 2 - 0.22, (s.r[0] + s.r[2]) / 2 + 0.25, y + 1.3, (s.r[1] + s.r[3]) / 2 + 0.22, { yaw: YAW[s.wl], fixed: 1 }); food(s.r, y + 0.92, 2, FOOD_SHOP); } continue; }
    if (name === 'drinks') { const s = slot(0.8, 0.7, pos, 0.8); if (s) { b.prop('cafe/can_fridge', s.r[0], y, s.r[1], s.r[2], y + 1.9, s.r[3], { yaw: YAW[s.wl], fixed: 1 }); b.box(null, s.r[0], y, s.r[1], s.r[2], y + 1.9, s.r[3], 0, { mat: 2 }); claim(s, 1.9); } continue; }
    if (name === 'crates') { const s = slot(1.0, 1.0, pos, 0.4); if (s) { F.crate(b, s.r[0] + 0.05, y, s.r[1] + 0.05, 0.9); if (R.chance(0.6)) F.crate(b, s.r[0] + 0.15, y + 0.9, s.r[1] + 0.15, 0.7); else food([s.r[0], s.r[1], s.r[2], s.r[3]], y + 0.9, 3, FOOD_SHOP); claim(s, 1.6); b.loot((s.r[0] + s.r[2]) / 2, y + 0.05, (s.r[1] + s.r[3]) / 2 + 0.6, 1); } continue; }
    if (name === 'filer' || name === 'cooler' || name === 'printer') { const k = { filer: ['office/file_cabinet', 0.5, 1.3, 0.6], cooler: ['office/water_cooler', 0.4, 1.3, 0.4], printer: ['office/office_printer_u002f_copier', 0.9, 1.1, 0.6] }[name]; const s = slot(k[1], k[3], pos, 0.5); if (s) { b.prop(k[0], s.r[0], y, s.r[1], s.r[2], y + k[2], s.r[3], { yaw: YAW[s.wl], fixed: 1 }); b.box(null, s.r[0], y, s.r[1], s.r[2], y + k[2], s.r[3], 0, { mat: 2 }); claim(s, k[2]); } continue; }
    it = placeKit(name, pos, extra); if (!it) continue;
    if (it.H > 0.5) b.box(null, it.r[0] + 0.05, y, it.r[1] + 0.05, it.r[2] - 0.05, y + Math.min(it.H, 1.9), it.r[3] - 0.05, 0, { mat: /fridge|oven|washer|tub/.test(name) ? 2 : 1 });
    if (name === 'sideboard' || name === 'dresser') { const r0 = R.f(); if (r0 < 0.18 && A.has(RETRO[0])) onTop(R.pick(RETRO), it.r, y + it.H, 0.42, 'w', (YAW[it.wl] + RETRO_TURN) % 4); else if (r0 < 0.32) onTop(ctx.role === 'kids' ? BOTTLE('baby_bottle') : R.pick([BOTTLE('old_bottle'), BOTTLE('champagne_bottle')]), it.r, y + it.H, 0.3, 'h'); else onTop(R.chance(0.5) ? H_('table_lamp') : R.pick([P_('flowers'), P_('globe'), P_('books'), P_('trophy')]), it.r, y + it.H, R.chance(0.5) ? 0.42 : 0.3, 'h'); b.loot((it.r[0] + it.r[2]) / 2, y + it.H + 0.02, (it.r[1] + it.r[3]) / 2, 1); }
    if (name === 'counter') { if (role.food && R.chance(0.7)) food(it.r, y + it.H, R.int(1, 3), FOOD_SHOP_BASE); if (R.chance(0.6)) food(it.r, y + it.H, R.int(1, 2), BOTTLES_KITCHEN); if (R.chance(0.5)) onTop(R.pick(['cafe/kitchen_microwave', 'cafe/coffee_machine', P_('fruit_bowl'), 'food/cooking_pot_free_model']), it.r, y + it.H, 0.45); }
    if (name === 'basin' && R.chance(0.8)) onTop(BOTTLE('hand_wash_bottle'), it.r, y + it.H, 0.2, 'h');
    if (name === 'fireplace' && R.chance(0.6)) onTop(P_('candlestick'), it.r, y + it.H, 0.3, 'h');
    if (name === 'bedD' || name === 'bedS') b.loot((it.r[0] + it.r[2]) / 2, y + it.H * 0.6, (it.r[1] + it.r[3]) / 2, 1);
    // pictures on the wall above low furniture
    if (role.art && it.H < 1.2 && (name === 'couch' || name === 'bedD' || name === 'sideboard' || name === 'fireplace') && R.chance(0.75)) { const art = R.pick(['office/wall_art_02', 'office/wall_art_03', 'office/wall_art_05']); const aw = Math.min(0.62, it.W * 0.4), r = rectOn(it.wl, (it.wl === 'N' || it.wl === 'S' ? (it.r[0] + it.r[2]) / 2 : (it.r[1] + it.r[3]) / 2) - aw / 2, aw, 0.05, 0.005);
      b.prop(art, r[0], y + 1.25, r[1], r[2], y + 1.25 + aw * 1.65, r[3], { yaw: YAW[it.wl], fixed: 1 }); }
  }
  // centre pieces
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 + (ctx.openN ? 0.4 : 0), W = x1 - x0, D = z1 - z0;
  const centre = (w, d) => { for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.8, 0.6], [-0.8, -0.6]]) { const a = cx + dx - w / 2, c = cz + dz - d / 2; if (ok(a, c, a + w, c + d)) return [a, c, a + w, c + d]; } return null; };
  const rug = (w, d) => { const k = R.chance(0.5) ? H_('rug') : H_('round_rug'); const st = A.has(k) && A.static(k); if (!st) return; const round = /round/.test(k); const rw = round ? Math.min(w, d) : w, rd = round ? rw : d; b.prop(k, cx - rw / 2, y, cz - rd / 2, cx + rw / 2, y + 0.02, cz + rd / 2, { yaw: round ? 0 : (rw > rd) === (st.size.x > st.size.z) ? 0 : 1, fixed: 1 }); };
  if (role.centre === 'lounge' && W > 3.6 && D > 3.6) { rug(Math.min(2.6, W - 1.6), Math.min(1.9, D - 1.6)); const r = centre(1.1, 0.6); if (r) { if (!b.prop('cafe/coffee_table', r[0], y, r[1], r[2], y + 0.45, r[3], { fixed: 1 })) F.table(b, r[0], y, r[1], R); used.push([...r, 0.45]); b.box(null, r[0], y, r[1], r[2], y + 0.4, r[3], 0, { mat: 1 }); onTop(R.pick([P_('cup_of_tea'), P_('books'), P_('fruit_bowl'), P_('flowers'), P_('headphones')]), r, y + 0.45, 0.22); if (R.chance(0.5)) food(r, y + 0.45, 1); b.loot(cx + 0.6, y + 0.48, cz, 1); } }
  else if (role.centre === 'dining' && W > 3.2 && D > 3.2) { const ts = R.chance(0.5) ? H_('table_round_small') : H_('table_round_small_b'); const r = centre(1.15, 1.15); if (r && A.has(ts)) { b.prop(ts, r[0], y, r[1], r[2], y + 0.76, r[3], { fixed: 1 }); b.box(null, r[0] + 0.1, y + 0.55, r[1] + 0.1, r[2] - 0.1, y + 0.76, r[3] - 0.1, 0, { mat: 1 }); used.push([...r, 0.76]);
      const ch = R.chance(0.5) ? H_('chair') : H_('chair_b'); const st = A.has(ch) && A.static(ch); if (st) { const s = 1.0 / st.size.y, cw = st.size.x * s, cd = st.size.z * s; const mx = (r[0] + r[2]) / 2, mz = (r[1] + r[3]) / 2;
        for (const [ox, oz, yaw] of [[0, -0.85, 0], [0, 0.85, 2], [-0.85, 0, 1], [0.85, 0, 3]]) { if (!R.chance(0.8)) continue; const odd = yaw % 2, X = odd ? cd : cw, Z = odd ? cw : cd, a = mx + ox - X / 2, c = mz + oz - Z / 2; if (!ok(a, c, a + X, c + Z)) continue; b.prop(ch, a, y, c, a + X, y + 1.0, c + Z, { yaw, fixed: 1 }); used.push([a, c, a + X, c + Z, 1]); } }
      food(r, y + 0.76, R.int(1, 3)); if (R.chance(0.6)) onTop('food/plate_square_free_model', r, y + 0.76, 0.3); if (R.chance(0.5)) food(r, y + 0.76, 1, BOTTLES_KITCHEN); b.loot(cx, y + 0.8, cz, 1); } }
  else if (role.centre === 'rug' && W > 3.4 && D > 3.4) rug(Math.min(2.0, W - 1.4), Math.min(1.5, D - 1.4));
  else if (role.centre === 'gondola' && W > 5 && D > 4.4) { const r = centre(2.4, 0.9); if (r) { for (const side of [0, 1]) shopShelf(b, R, { wl: side ? 'S' : 'N', r: side ? [r[0], (r[1] + r[3]) / 2, r[2], r[3]] : [r[0], r[1], r[2], (r[1] + r[3]) / 2] }, y, food, 1.35); used.push([...r, 1.4]); } }
  else if (role.centre === 'pallet' && W > 4 && D > 4) { const r = centre(1.2, 1.2); if (r) { F.crate(b, r[0] + 0.1, y, r[1] + 0.1, 1.0); food(r, y + 1.0, 4, FOOD_SHOP); b.loot(r[2] + 0.3, y + 0.05, r[1], 1); used.push([...r, 1.2]); } }
  else if (role.centre === 'meeting' && W > 4.6 && D > 4.6) { const r = centre(1.5, 0.85); if (r) { F.table(b, r[0], y, r[1], R); F.chair(b, r[0] + 0.5, y, r[1] - 0.55); F.chair(b, r[0] + 0.5, y, r[3] + 0.1); used.push([...r, 0.8]); } }
  // one or two plants / bins in leftover corners, and loot on the floor
  if (ctx.role !== 'bath' && R.chance(0.6)) { const spec = pick('plant'), dm = spec && dims(spec); if (dm) { const s = slot(dm[0], dm[2], 'end', 0.1); if (s) { model(spec[0], s.r, y, dm[1], s.wl); claim(s, dm[1]); } } }
  b.loot(R.range(x0 + 0.8, x1 - 0.8), y + 0.05, R.range(z0 + 0.8, z1 - 0.8), 1);
}

// shop shelving: four boards with groceries on each level (s: {wl, r})
function shopShelf(b, R, s, y, food, Hh = 1.9) {
  const [a0, c0, a1, c1] = s.r, along = s.wl === 'N' || s.wl === 'S'; const lv = Hh > 1.5 ? [0.08, 0.5, 0.92, 1.34, 1.76] : [0.08, 0.5, 0.92, 1.3];
  b.box(null, a0, y, c0, a1, y + Hh, c1, 0, { mat: 1 });
  for (const h of lv) b.box('wood', a0, y + h - 0.04, c0, a1, y + h, c1, 0xd8d2c4, { c: false });
  const back = s.wl === 'N' ? [a0, c0, a1, c0 + 0.03] : s.wl === 'S' ? [a0, c1 - 0.03, a1, c1] : s.wl === 'W' ? [a0, c0, a0 + 0.03, c1] : [a1 - 0.03, c0, a1, c1];
  b.box('wood', back[0], y, back[1], back[2], y + Hh, back[3], 0xbdb5a5, { c: false });
  for (const e of along ? [[a0, a0 + 0.04], [a1 - 0.04, a1]] : [[c0, c0 + 0.04], [c1 - 0.04, c1]]) if (along) b.box('wood', e[0], y, c0, e[1], y + Hh, c1, 0xbdb5a5, { c: false }); else b.box('wood', a0, y, e[0], a1, y + Hh, e[1], 0xbdb5a5, { c: false });
  const L = along ? a1 - a0 : c1 - c0; for (const h of lv.slice(0, -1)) { const n = Math.max(2, Math.floor(L / 0.32)); for (let i = 0; i < n; i++) { if (R.chance(0.2)) continue; const u = (i + 0.5) / n * L - 0.12; const r = along ? [a0 + u, c0 + 0.06, a0 + u + 0.24, c1 - 0.06] : [a0 + 0.06, c0 + u, a1 - 0.06, c0 + u + 0.24]; food(r, y + h, 1, FOOD_SHOP); } }
  b.loot((a0 + a1) / 2, y + 0.94, (c0 + c1) / 2, 1);
}
function deskAt(b, R, s, y) {
  const [a0, c0, a1, c1] = s.r, YAW = { N: 0, S: 2, W: 1, E: 3 }[s.wl];
  if (!b.prop('office/desk_3', a0, y, c0, a1, y + 0.77, c1, { yaw: YAW, fixed: 1 })) { b.box('wood', a0, y + 0.72, c0, a1, y + 0.77, c1, 0x6e5a48); }
  b.box(null, a0, y + 0.6, c0, a1, y + 0.77, c1, 0, { mat: 1 });
  const mx = (a0 + a1) / 2, mz = (c0 + c1) / 2; const along = s.wl === 'N' || s.wl === 'S';
  const sx = along ? 0.55 : 0.22, sz = along ? 0.22 : 0.55; const px = s.wl === 'W' ? a0 + 0.12 : s.wl === 'E' ? a1 - 0.34 : mx - sx / 2, pz = s.wl === 'N' ? c0 + 0.12 : s.wl === 'S' ? c1 - 0.34 : mz - sz / 2;
  const rk = R.chance(0.35) && b.props && b.props.has(RETRO[0]) ? R.pick(RETRO) : null; if (rk) { const cx2 = (a0 + a1) / 2, cz2 = (c0 + c1) / 2; b.prop(rk, cx2 - 0.27, y + 0.77, cz2 - 0.27, cx2 + 0.27, y + 1.25, cz2 + 0.27, { yaw: (YAW + RETRO_TURN) % 4, fixed: 1, uniform: 1 }); }
  else b.prop(R.chance(0.6) ? 'office/computer_screen' : 'office/laptop_u002f_macbook_pro', px, y + 0.77, pz, px + sx, y + 1.18, pz + sz, { yaw: YAW, fixed: 1 });
  if (R.chance(0.6)) { const k = R.pick(['props/desk_lamp_free_model', 'props/mug_with_office_tool_free_model', 'props/books_free_model', 'props/globe_free_model', 'props/cup_of_tea_free_model']); const lx = along ? a0 + 0.12 : mx - 0.1, lz = along ? mz - 0.1 : c0 + 0.12; b.prop(k, lx, y + 0.77, lz, lx + 0.2, y + 1.05, lz + 0.2, { uniform: 1 }); }
  const out = { N: [0, 0.75], S: [0, -0.75], W: [0.75, 0], E: [-0.75, 0] }[s.wl]; b.prop('office/office_chair', mx + out[0] - 0.28, y, mz + out[1] - 0.28, mx + out[0] + 0.28, y + 1.05, mz + out[1] + 0.28, { yaw: (YAW + 2) % 4, fixed: 1 });
}

function mark(b, x0, z0, x1, z1, color, apron = 2) {
  const ax = b.wx(x0, z0), bx = b.wx(x1, z1), az = b.wz(x0, z0), bz = b.wz(x1, z1);
  const r = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  b.world.paintRect(3, r[0] - 1.5, r[1] - 1.5, r[2] + 1.5, r[3] + 1.5, 0, 3);
  if (apron) b.world.paintRect(apron, r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1, 150, 2.5);
  b.world.footprints.push({ x0: r[0], z0: r[1], x1: r[2], z1: r[3], c: color });
}

// Generic enterable building. o: {w,d,floors,fh,wall,color,trim,roof,roofMat,roofColor,doors,winEvery,winW,winH,R,kind,roofAccess,floorMat,floorColor,parapet,rise}
export function building(b, o) {
  const R = o.R, w = o.w, d = o.d, fl = o.floors || 1, fh = o.fh || 3, wm = o.wall || 'plaster', wc = o.color || 0xffffff, tc = o.trim || 0xe2ded2;
  const doors = o.doors || ['S'], winW = o.winW || 1.2, sill = o.sill === undefined ? 0.95 : o.sill, head = o.head || 2.2, every = o.winEvery || 3.2;
  mark(b, 0, 0, w, d, o.mapColor || '#8f8a80', o.apron === undefined ? 2 : o.apron);
  b.box('concrete', -0.25, -2.2, -0.25, w + 0.25, BASE, d + 0.25, 0x8c8a84);
  const INT = o.kind === 'mil' ? 0xcdd2c6 : [0xf1ece0, 0xe4ebef, 0xe7eee0, 0xf3e6da, 0xeeeae6][Math.floor(Math.abs(Math.sin(w * 12.9898 + d * 78.233)) * 4.999)];
  const tiled = o.floorMat === 'concrete' && o.interior !== false; const FLOOR = tiled ? 'tile' : (o.floorMat || 'parquet'), FCOL = tiled ? (o.kind === 'mil' ? 0xc9cdc2 : 0xe6e1d6) : o.floorColor || (o.kind === 'mil' ? 0x9a8f7c : [0xc9a274, 0xb98f62, 0xd2b085][Math.floor(Math.abs(Math.sin(w * 3.7 + d * 9.1)) * 2.999)]);
  b.box(FLOOR, T, BASE, T, w - T, BASE + 0.02, d - T, FCOL, { c: false });
  if (doors.includes('S')) b.box('concrete', w / 2 - 1.2, -0.5, d + 0.25, w / 2 + 1.2, BASE - 0.02, d + 1.0, 0x8c8a84);
  if (doors.includes('N')) b.box('concrete', w / 2 - 1.2, -0.5, -1.0, w / 2 + 1.2, BASE - 0.02, -0.25, 0x8c8a84);
  if (doors.includes('E')) b.box('concrete', w + 0.25, -0.5, d / 2 - 1.2, w + 1.0, BASE - 0.02, d / 2 + 1.2, 0x8c8a84);
  if (doors.includes('W')) b.box('concrete', -1.0, -0.5, d / 2 - 1.2, -0.25, BASE - 0.02, d / 2 + 1.2, 0x8c8a84);
  const multi = fl > 1 || o.roofAccess; const sx = 1.7, RUN = 3.6; const lanes = [[T + 0.05, T + 1.2], [T + 1.3, T + 2.45]];
  const holeFor = (f) => { const ln = lanes[f % 2]; return { x0: sx, x1: sx + RUN, z0: ln[0], z1: ln[1] }; };
  const NC = { c: false };
  for (let f = 0; f < fl; f++) {
    const y0 = BASE + f * fh, y1 = y0 + fh;
    const mk = (len, side) => {
      const n = Math.max(1, Math.floor((len - 1.2) / every)); const ops = [];
      for (let i = 0; i < n; i++) { const p = (i + 0.5) / n * len; ops.push({ p, w: winW, s: sill, h: head, glass: true }); }
      if (f === 0 && doors.includes(side)) { const m = ops[Math.floor(n / 2)]; m.p = len / 2; m.w = 1.4; m.s = 0; m.h = 2.15; m.glass = false; m.door = true; m.inward = side === 'N' || side === 'W'; m.doorCol = o.doorColor; }
      return ops;
    };
    const LN = o.interior === false ? null : { side: 1, col: INT }, LP = LN && { side: -1, col: INT };
    wallRun(b, wm, wc, 'x', T / 2, 0, w, y0, y1, mk(w, 'N'), tc, R, T, LN); wallRun(b, wm, wc, 'x', d - T / 2, 0, w, y0, y1, mk(w, 'S'), tc, R, T, LP);
    wallRun(b, wm, wc, 'z', T / 2, T, d - T, y0, y1, mk(d, 'W').map(q => ({ ...q, p: q.p })), tc, R, T, LN); wallRun(b, wm, wc, 'z', w - T / 2, T, d - T, y0, y1, mk(d, 'E'), tc, R, T, LP);
    // floor band + plinth for facade depth
    b.box(wm, -0.05, y1 - 0.16, -0.05, w + 0.05, y1 - 0.02, d + 0.05, tc, NC);
    if (f === 0) { // plinth: a thin band around the OUTSIDE of the walls only (a solid block here used to bury the ground floor), broken at the doors
      const P = (x0, z0, x1, z1) => b.box('concrete', x0, BASE, z0, x1, BASE + 0.45, z1, 0x77746e, NC);
      const run = (side, len, put) => { if (doors.includes(side)) { put(0, len / 2 - 0.75); put(len / 2 + 0.75, len); } else put(0, len); };
      run('N', w, (a, c) => P(a - 0.04, -0.04, c + 0.04, 0)); run('S', w, (a, c) => P(a - 0.04, d, c + 0.04, d + 0.04));
      run('W', d, (a, c) => P(-0.04, a, 0, c)); run('E', d, (a, c) => P(w, a, w + 0.04, c)); }
    if (f > 0) { const H = holeFor(f - 1); slab(b, 'concrete', 0x9a978f, T, T, w - T, d - T, y0 - 0.2, y0, H);
      if (o.interior !== false) { slab(b, FLOOR, FCOL, T, T, w - T, d - T, y0, y0 + 0.02, H, NC); slab(b, 'paint', 0xf4f1ea, T, T, w - T, d - T, y0 - 0.215, y0 - 0.2, H, NC);
        if ((f - 1) % 2 === 1) { const rz = H.z1 + 0.03; b.box('stairwood', H.x0, y0 + 0.9, rz, H.x1, y0 + 0.96, rz + 0.05, 0x5a4634, NC); for (let u = H.x0; u <= H.x1 + 0.01; u += 0.6) b.box('steel', u - 0.02, y0, rz + 0.005, u + 0.02, y0 + 0.9, rz + 0.045, 0x2e3033, NC); } } }
    // ceiling lamps (glow after dusk)
    if (o.interior !== false) { const zc0 = (T + 2.75 + d - T) / 2, cy = y1 - (f < fl - 1 ? 0.215 : o.roof === 'gable' ? 0.12 : 0.235); for (const lx of (w > 8.5 ? [w * 0.24, w * 0.78] : [w * 0.5])) { b.box('steel', lx - 0.015, cy - 0.16, zc0 - 0.015, lx + 0.015, cy, zc0 + 0.015, 0x2a2a2a, NC); b.box('glassLit', lx - 0.2, cy - 0.3, zc0 - 0.2, lx + 0.2, cy - 0.16, zc0 + 0.2, 0xfff4dc, { c: false, bottom: true }); } }
    // interior partition (behind the stair lanes)
    const zMin = multi ? T + 2.75 : T; let px = null, pzDoor = 0;
    if (o.interior !== false && w > 8.5) {
      px = Math.round(w * R.range(0.4, 0.6)); const zc = (zMin + d - T) / 2 + R.range(-1, 1); pzDoor = zc;
      wallRun(b, 'paint', INT, 'z', px, zMin, d - T, y0, y1 - (f > 0 || fl > 1 ? 0 : 0), [{ p: zc, w: 1.3, s: 0, h: 2.15 }], tc, R, 0.14);
    }
    if (o.interior !== false) {
      // rooms: role per floor and side; door openings and the stair landing are kept clear
      const keep = [];
      if (f === 0) { if (doors.includes('S')) keep.push([w / 2 - 1.0, d - T - 1.5, w / 2 + 1.0, d]); if (doors.includes('N')) keep.push([w / 2 - 1.0, 0, w / 2 + 1.0, T + 1.5]); if (doors.includes('E')) keep.push([w - T - 1.5, d / 2 - 1.0, w, d / 2 + 1.0]); if (doors.includes('W')) keep.push([0, d / 2 - 1.0, T + 1.5, d / 2 + 1.0]); }
      if (px) keep.push([px - 1.3, pzDoor - 1.0, px + 1.3, pzDoor + 1.0]);
      if (multi) keep.push([0, zMin - 0.1, w, zMin + 0.9]);
      const K = o.kind, two = !!px, alt = R.chance(0.5);
      const roles = K === 'mil' ? null : K === 'store' ? (f === 0 ? (two ? ['shop', 'storage'] : ['shop']) : (two ? ['living', 'kitchen'] : ['studio'])) : K === 'office' ? ['office', 'office']
        : f === 0 ? (two ? ['living', 'kitchen'] : ['studio']) : (two ? [R.chance(0.3) ? 'kids' : 'bedroom', R.pick(['bath', 'study', 'bedroom', 'bath'])] : [R.pick(['bedroom', 'bedroom', 'kids', 'study'])]);
      if (roles && alt && roles.length === 2 && K !== 'store') roles.reverse();
      const ctx = (role) => ({ role, kind: K, keep, openN: multi, f });
      if (!roles) { if (px) { furnish(b, R, T, zMin, px - 0.07, d - T, y0 + 0.02, o.kind); furnish(b, R, px + 0.07, zMin, w - T, d - T, y0 + 0.02, o.kind); } else furnish(b, R, T, zMin, w - T, d - T, y0 + 0.02, o.kind); }
      else if (px) { furnishRoom(b, R, T, zMin, px - 0.07, d - T, y0 + 0.02, ctx(roles[0])); furnishRoom(b, R, px + 0.07, zMin, w - T, d - T, y0 + 0.02, ctx(roles[1])); }
      else furnishRoom(b, R, T, zMin, w - T, d - T, y0 + 0.02, ctx(roles[0]));
    }
    if (f < fl - 1 || o.roofAccess) { const ln = lanes[f % 2]; stairs(b, f % 2 === 0 ? sx : sx + RUN, y0, ln[0], ln[1], fh, f % 2 === 0 ? 1 : -1, 'concrete', 0x8f8d88, false, o.interior === false ? null : 'z1'); }
    if (o.balcony && f > 0 && R.chance(0.7)) { const bxp = w * R.pick([0.25, 0.75]); b.box('concrete', bxp - 1.3, y0 - 0.12, d, bxp + 1.3, y0, d + 1.1, 0x99968e, { bottom: true }); b.box('steel', bxp - 1.3, y0, d + 1.04, bxp + 1.3, y0 + 0.95, d + 1.1, 0x3a3a3a, { c: false }); b.box('steel', bxp - 1.3, y0, d, bxp - 1.24, y0 + 0.95, d + 1.1, 0x3a3a3a, NC); b.box('steel', bxp + 1.24, y0, d, bxp + 1.3, y0 + 0.95, d + 1.1, 0x3a3a3a, NC); }
  }
  const top = BASE + fl * fh;
  if (o.roof === 'gable') {
    b.box('paint', T, top - 0.12, T, w - T, top, d - T, 0xf4f1ea, { bottom: true });
    b.gable(o.roofMat || 'roof', wm, 0, 0, w, d, top, o.rise || Math.min(w, d) * 0.32, w >= d ? 'x' : 'z', o.roofColor || 0x7a4a3c, wc);
    if (o.chimney !== false) { const cx = w * 0.72, cz = d * 0.4; b.box('brick', cx, top, cz, cx + 0.7, top + (o.rise || Math.min(w, d) * 0.32) + 0.9, cz + 0.7, 0xb0a090); }
  } else {
    slab(b, 'concrete', 0x8b8880, 0, 0, w, d, top - 0.22, top, o.roofAccess ? holeFor(fl - 1) : null);
    if (o.interior !== false) slab(b, 'paint', 0xf4f1ea, T, T, w - T, d - T, top - 0.235, top - 0.22, o.roofAccess ? holeFor(fl - 1) : null, { c: false });
    const ph = o.parapet === undefined ? 0.75 : o.parapet;
    if (ph) { b.box(wm, 0, top, 0, w, top + ph, 0.22, wc); b.box(wm, 0, top, d - 0.22, w, top + ph, d, wc); b.box(wm, 0, top, 0.22, 0.22, top + ph, d - 0.22, wc); b.box(wm, w - 0.22, top, 0.22, w, top + ph, d - 0.22, wc);
      b.box('concrete', -0.06, top + ph, -0.06, w + 0.06, top + ph + 0.07, 0.28, tc, NC); b.box('concrete', -0.06, top + ph, d - 0.28, w + 0.06, top + ph + 0.07, d + 0.06, tc, NC); }
    if (o.roofProps !== false && w > 8) { const ax = w * R.range(0.5, 0.8), az = d * R.range(0.3, 0.7); b.box('steel', ax, top, az, ax + 1.4, top + 0.9, az + 1.0, 0x9aa0a0); b.cyl('steel', ax + 0.7, top + 0.9, az + 0.5, 0.35, 0.08, 0x303030, 10);
      if (R.chance(0.5)) { const tx = w * 0.2, tz = d * 0.6; b.cyl('metal', tx, top + 0.9, tz, 0.9, 1.6, 0xa8a49a, 12, { c: true }); for (const [u, v] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.box('steel', tx + u - 0.05, top, tz + v - 0.05, tx + u + 0.05, top + 0.9, tz + v + 0.05, 0x444444, NC); }
      if (o.roofAccess) b.loot(w * 0.5, top + 0.05, d * 0.7, 2); }
  }
  if (o.porch) { b.box('wood', w / 2 - 2.2, BASE - 0.04, d, w / 2 + 2.2, BASE + 0.04, d + 1.8, 0x7a6248); b.box('wood', w / 2 - 2.3, BASE + 2.3, d, w / 2 + 2.3, BASE + 2.42, d + 2.0, o.roofColor || 0x7a4a3c, { c: false, bottom: true }); for (const u of [-2.1, 2.0]) b.box('wood', w / 2 + u, BASE, d + 1.65, w / 2 + u + 0.12, BASE + 2.3, d + 1.77, 0xd8d2c4, NC); }
  if (o.awning) { b.quad('fabric', [1, BASE + 2.5, d], [w - 1, BASE + 2.5, d], [w - 1, BASE + 2.15, d + 1.3], [1, BASE + 2.15, d + 1.3], o.awning, true); }
}

// Large open hall (warehouse / hangar / barn / factory). Big door openings, optional mezzanine.
export function hall(b, o) {
  const R = o.R, w = o.w, d = o.d, h = o.h || 6, wm = o.wall || 'metal', wc = o.color || 0xb0b4b0, NC = { c: false };
  mark(b, 0, 0, w, d, o.mapColor || '#7d8288');
  b.box('concrete', -0.3, -2.2, -0.3, w + 0.3, BASE, d + 0.3, 0x8a8882);
  const dw = o.doorW || 4.2, dh = Math.min(h - 0.8, o.doorH || 3.8);
  const bigDoor = (len) => [{ p: len / 2, w: dw, s: 0, h: dh }];
  const wins = (len, yv) => { const n = Math.max(1, Math.floor(len / 5)); const a = []; for (let i = 0; i < n; i++) a.push({ p: (i + 0.5) / n * len, w: 1.6, s: yv, h: yv + 0.9, glass: true }); return a; };
  const base = o.baseMat ? 1.2 : 0;
  const side = (axis, c, a0, a1, ops) => { if (base) { wallRun(b, o.baseMat, o.baseColor || 0xa8a29a, axis, c, a0, a1, BASE, BASE + base, ops.filter(q => q.s === 0).map(q => ({ ...q, h: 9 })), 0x555555, R); wallRun(b, wm, wc, axis, c, a0, a1, BASE + base, BASE + h, ops.map(q => ({ ...q, s: Math.max(0, q.s - base), h: q.h - base })), 0x555555, R); } else wallRun(b, wm, wc, axis, c, a0, a1, BASE, BASE + h, ops, 0x555555, R); };
  const D = o.doors || ['S'];
  side('x', T / 2, 0, w, D.includes('N') ? bigDoor(w) : wins(w, h - 1.8)); side('x', d - T / 2, 0, w, D.includes('S') ? bigDoor(w) : wins(w, h - 1.8));
  side('z', T / 2, T, d - T, D.includes('W') ? bigDoor(d) : wins(d, h - 1.8)); side('z', w - T / 2, T, d - T, D.includes('E') ? bigDoor(d) : wins(d, h - 1.8));
  const top = BASE + h; const rise = o.rise || Math.min(w, d) * 0.16;
  // steel frame + trusses
  const nb = Math.max(2, Math.round((w >= d ? w : d) / 6));
  for (let i = 0; i <= nb; i++) { const p = i / nb * ((w >= d ? w : d) - 0.6) + 0.3; if (w >= d) { b.box('steel', p - 0.08, BASE, T, p + 0.08, top, T + 0.16, 0x4a4e52, NC); b.box('steel', p - 0.08, BASE, d - T - 0.16, p + 0.08, top, d - T, 0x4a4e52, NC); b.box('steel', p - 0.06, top - 0.3, T, p + 0.06, top - 0.1, d - T, 0x4a4e52, NC); } else { b.box('steel', T, BASE, p - 0.08, T + 0.16, top, p + 0.08, 0x4a4e52, NC); b.box('steel', w - T - 0.16, BASE, p - 0.08, w - T, top, p + 0.08, 0x4a4e52, NC); b.box('steel', T, top - 0.3, p - 0.06, w - T, top - 0.1, p + 0.06, 0x4a4e52, NC); } }
  if (o.roof === 'flat') { b.box('concrete', 0, top - 0.2, 0, w, top, d, 0x85827a, { bottom: true }); }
  else { b.gable(o.roofMat || 'metal', wm, 0, 0, w, d, top, rise, w >= d ? 'z' : 'x', o.roofColor || 0x8a8f94, wc, 0.5);
    // inner roof skin so the hall is closed from inside
    if (w >= d) { b.quad(o.roofMat || 'metal', [0, top, d], [0, top + rise, d / 2], [w, top + rise, d / 2], [w, top, d], 0x70757a); b.quad(o.roofMat || 'metal', [w, top, 0], [w, top + rise, d / 2], [0, top + rise, d / 2], [0, top, 0], 0x70757a); }
    else { b.quad(o.roofMat || 'metal', [0, top, 0], [w / 2, top + rise, 0], [w / 2, top + rise, d], [0, top, d], 0x70757a); b.quad(o.roofMat || 'metal', [w, top, d], [w / 2, top + rise, d], [w / 2, top + rise, 0], [w, top, 0], 0x70757a); } }
  // contents
  const y = BASE; const fill = o.fill || 'storage';
  if (fill === 'storage' || fill === 'factory') {
    const rows = Math.floor((d - 6) / 4);
    for (let r = 0; r < rows; r++) for (let x = 2; x < w - 4; x += 3.2) { if (Math.abs(x + 1 - w / 2) < dw / 2 + 0.6 && D.some(s => s === 'N' || s === 'S')) continue; if (R.chance(0.35)) continue; const z = 3 + r * 4;
      if (R.chance(0.5)) { F.crate(b, x, y, z, 1.1); if (R.chance(0.5)) F.crate(b, x + 0.1, y + 1.1, z + 0.1, 0.85); else b.loot(x + 0.5, y + 1.15, z + 0.5, o.tier || 1); }
      else if (R.chance(0.5)) { F.barrel(b, x + 0.3, y, z + 0.3, R.pick([0x3c5a7a, 0x7a3c30, 0x5a5a40])); F.barrel(b, x + 1.0, y, z + 0.4, R.pick([0x3c5a7a, 0x7a3c30, 0x5a5a40])); }
      else { b.box('wood', x, y, z, x + 1.2, y + 0.14, z + 1.0, 0x9a8260, NC); b.box('fabric', x + 0.05, y + 0.14, z + 0.05, x + 1.15, y + 0.9, z + 0.95, R.pick([0xb8ae94, 0x8a9a8a, 0xa89878])); b.loot(x + 0.6, y + 0.95, z + 0.5, o.tier || 1); } }
  }
  if (fill === 'factory') { for (let i = 0; i < 3; i++) { const mx = w * (0.2 + i * 0.3), mz = d * 0.5; b.box('steel', mx - 1.6, y, mz - 1.2, mx + 1.6, y + 2.2, mz + 1.2, R.pick([0x4f6a58, 0x5a6470, 0x6a5a48])); b.cyl('steel', mx, y + 2.2, mz, 0.7, 1.8, 0x70706a, 12, { c: true }); b.cylH('steel', mx - 1.6, y + 3.4, mz, 3.2, 0.18, 'x', 0x8a8a84); b.box('steel', mx + 1.6, y + 0.6, mz - 0.5, mx + 1.9, y + 1.5, mz + 0.5, 0xb89030, NC); } }
  if (fill === 'barn') { for (let i = 0; i < 7; i++) { const hx = R.range(1.5, w - 3), hz = R.range(1.5, d - 3); if (Math.abs(hx - w / 2) < 3) continue; b.box('fabric', hx, y, hz, hx + 1.5, y + 0.8, hz + 0.9, 0xc8a850); if (R.chance(0.5)) b.box('fabric', hx + 0.1, y + 0.8, hz, hx + 1.6, y + 1.6, hz + 0.9, 0xc0a048); } b.loot(w * 0.3, y + 0.05, d * 0.5, 1); b.loot(w * 0.7, y + 0.05, d * 0.3, 1); }
  if (o.mezz) { const mz = Math.min(5, d * 0.3), my = y + 3; b.box('steel', T, my - 0.15, T, w - T, my, T + mz, 0x5c6066, { bottom: true }); stairs(b, w - T - 1.3, y, T + mz, T + mz + 1.2, 3, -1, 'steel', 0x5c6066, false);
    b.box('steel', T, my, T + mz - 0.06, w - T - 5.2, my + 1.0, T + mz, 0x3c3c3c); for (let x = 2; x < w - 4; x += 4) { if (R.chance(0.6)) F.ammoBox(b, x, my, T + 0.8); else { F.crate(b, x, my, T + 0.6); b.loot(x + 1.4, my + 0.05, T + 1.5, o.tier || 2); } } }
  b.loot(w * 0.5, y + 0.05, d * 0.5, o.tier || 1); b.loot(w * 0.25, y + 0.05, d * 0.75, o.tier || 1);
}

// Original barrel-vault aircraft hangar: ribbed metal shell, sliding doors, mezzanine, workshop bays.
export function hangar(b, o) {
  const R = o.R, w = o.w || 28, d = o.d || 42, H = o.h || 10.5, col = o.color || 0x7d8778, NC = { c: false }; const N = 16, a = w / 2;
  mark(b, 0, 0, w, d, '#59634f'); b.box('concrete', -0.4, -2.2, -0.4, w + 0.4, BASE, d + 0.4, 0x8c8a84); b.box('concrete', 0.4, BASE, 0.4, w - 0.4, BASE + 0.02, d - 0.4, 0xb8b4a8, NC);
  const px = (k) => a - a * Math.cos(k / N * Math.PI), py = (k) => BASE + H * Math.sin(k / N * Math.PI); const arcY = (x) => BASE + H * Math.sqrt(Math.max(0, 1 - ((x - a) / a) ** 2));
  // shell (two-sided corrugated skin) with skylight panels, ribs and purlins
  for (let k = 0; k < N; k++) { const sky = k === N / 2 - 1 || k === N / 2; for (let z0 = 0; z0 < d; z0 += 7) { const z1 = Math.min(d, z0 + 7); const lit = sky && (Math.round(z0 / 7) % 2 === 1);
    b.quad(lit ? 'glass' : 'metal', [px(k + 1), py(k + 1), z0], [px(k), py(k), z0], [px(k), py(k), z1], [px(k + 1), py(k + 1), z1], lit ? 0xffffff : (k % 2 ? col : 0x727c6e), true); } }
  for (let z = 0; z <= d + 0.01; z += 7) for (let k = 0; k < N; k++) { const x0 = px(k), y0 = py(k), x1 = px(k + 1), y1 = py(k + 1); const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0); const zz = Math.min(d - 0.15, Math.max(0.15, z));
    const c = Math.cos(ang), sn = Math.sin(ang), t = 0.16, ix = sn * 0.16, iy = -c * 0.16; const P = (u, v, dz) => [mx + ix + c * u - sn * v, my + iy + sn * u + c * v, zz + dz];
    b.quad('steel', P(-len / 2, -t, -0.12), P(len / 2, -t, -0.12), P(len / 2, -t, 0.12), P(-len / 2, -t, 0.12), 0x4a4f50, true); b.quad('steel', P(-len / 2, -t, 0.12), P(len / 2, -t, 0.12), P(len / 2, t, 0.12), P(-len / 2, t, 0.12), 0x4a4f50, true); b.quad('steel', P(len / 2, -t, -0.12), P(-len / 2, -t, -0.12), P(-len / 2, t, -0.12), P(len / 2, t, -0.12), 0x4a4f50, true); }
  for (const k of [3, 5, 8, 11, 13]) b.box('steel', px(k) - 0.06, py(k) - 0.34, 0.2, px(k) + 0.06, py(k) - 0.22, d - 0.2, 0x55595a, NC);
  // end walls in vertical strips that follow the arch; front has the door opening
  const dw = o.doorW || 15, dh = o.doorH || 6.6, strips = 28, sw = w / strips;
  for (let i = 0; i < strips; i++) { const x0 = i * sw, x1 = x0 + sw, top = Math.min(arcY(x0 + 0.02), arcY(x1 - 0.02)) + 0.05; if (top < BASE + 0.3) continue;
    b.box('metal', x0, BASE, 0, x1, top, 0.3, i % 2 ? col : 0x727c6e); const inDoor = x1 > a - dw / 2 && x0 < a + dw / 2; if (!inDoor) b.box('metal', x0, BASE, d - 0.3, x1, top, d, i % 2 ? col : 0x727c6e); else if (top > BASE + dh) b.box('metal', x0, BASE + dh, d - 0.3, x1, top, d, 0x727c6e); }
  b.box('steel', a - dw / 2 - 0.3, BASE + dh, d - 0.42, a + dw / 2 + 0.3, BASE + dh + 0.35, d + 0.5, 0x3c4040); b.box('steel', a - dw / 2 - 0.35, BASE, d - 0.42, a - dw / 2, BASE + dh, d + 0.1, 0x3c4040); b.box('steel', a + dw / 2, BASE, d - 0.42, a + dw / 2 + 0.35, BASE + dh, d + 0.1, 0x3c4040);
  // sliding doors, left partly open
  for (const [x0, x1] of [[a - dw / 2 - 2.6, a - 3.4], [a + 4.6, a + dw / 2 + 3.2]]) { b.box('steel', x0, BASE, d + 0.12, x1, BASE + dh, d + 0.32, 0x4f5c48); for (let x = x0 + 0.5; x < x1 - 0.2; x += 1.1) b.box('steel', x, BASE + 0.2, d + 0.32, x + 0.08, BASE + dh - 0.2, d + 0.38, 0x3a4436, NC); b.box('glass', x0 + 0.6, BASE + 3.4, d + 0.33, x1 - 0.6, BASE + 4.3, d + 0.35, 0xffffff, NC); }
  b.box('emissive', a - 1.2, BASE + dh + 0.45, d + 0.1, a + 1.2, BASE + dh + 0.75, d + 0.16, 0xfff0d0, NC);
  // side + roof colliders (the curved skin itself is visual)
  b.box(null, -0.2, BASE, 0, 0.5, BASE + 4.4, d, 0, { mat: 2 }); b.box(null, w - 0.5, BASE, 0, w + 0.2, BASE + 4.4, d, 0, { mat: 2 }); b.box(null, 0.5, BASE + 4.4, 0, 2.6, BASE + 7.6, d, 0, { mat: 2 }); b.box(null, w - 2.6, BASE + 4.4, 0, w - 0.5, BASE + 7.6, d, 0, { mat: 2 }); b.box(null, 2.6, BASE + H * 0.82, 0, w - 2.6, BASE + H + 0.3, d, 0, { mat: 2 });
  // hanging lights
  for (let z = 5; z < d - 3; z += 8) for (const x of [a - 5, a + 5]) { b.box('steel', x - 0.02, arcY(x) - 2.4, z - 0.02, x + 0.02, arcY(x) - 0.3, z + 0.02, 0x222222, NC); b.box('emissive', x - 0.5, arcY(x) - 2.52, z - 0.18, x + 0.5, arcY(x) - 2.4, z + 0.18, 0xfff2d8, NC); }
  // rear mezzanine with stairs and an office
  const y = BASE, my = y + 3.4, mz = 7; b.box('steel', 1.2, my - 0.16, 0.3, w - 1.2, my, mz, 0x5c6066, { bottom: true }); for (let x = 2; x < w - 1; x += 5.6) b.box('steel', x - 0.1, y, mz - 0.25, x + 0.1, my - 0.16, mz - 0.05, 0x44484c);
  b.box('steel', 1.2, my, mz - 0.07, w - 6.4, my + 1.05, mz, 0x3c3c3c); b.box('steel', 1.2, my + 0.5, mz - 0.05, w - 6.4, my + 0.56, mz - 0.02, 0x9a8a2a, NC);
  stairs(b, mz + 4.2, y, w - 5.6, w - 4.4, 3.4, -1, 'steel', 0x5c6066, true); b.box('steel', w - 6.4, my - 0.16, mz, w - 1.2, my, mz + 0.9, 0x5c6066, { bottom: true });
  for (let x = 3; x < w - 9; x += 4.4) { if (R.chance(0.5)) F.ammoBox(b, x, my, 1.4); else { F.crate(b, x, my, 1.2, 1); b.loot(x + 1.5, my + 0.05, 2.2, 2); } } F.locker(b, w - 5.6, my, 0.5, 3, true); F.desk(b, 6.5, my, 3.6, R);
  // workshop floor: bays, benches, parts
  for (const x of [1.4, w - 3.2]) for (let z = mz + 4; z < d - 6; z += 6.5) { if (R.chance(0.2)) continue; const t = R.f(); if (t < 0.4) { b.box('steel', x, y, z, x + 1.8, y + 0.9, z + 3.2, 0x4a5a66); b.box('wood', x - 0.05, y + 0.9, z - 0.05, x + 1.85, y + 0.97, z + 3.25, 0x8a7458, NC); b.box('steel', x + 0.3, y + 0.97, z + 0.4, x + 1.1, y + 1.35, z + 1.0, 0xa83a2a, NC); b.loot(x + 0.9, y + 1.02, z + 2.2, 2); }
    else if (t < 0.7) { F.crate(b, x, y, z, 1.2); F.crate(b, x + 0.1, y, z + 1.4, 1.0); F.crate(b, x + 0.15, y + 1.2, z + 0.2, 0.85); } else { F.barrel(b, x + 0.5, y, z + 0.5, 0x7a3c30); F.barrel(b, x + 1.2, y, z + 0.7, 0x3c5a7a); F.barrel(b, x + 0.8, y, z + 1.4, 0x5a5a40); P.tires(b, x + 0.9, y, z + 2.6, 4); } }
  // floor markings
  for (const x of [a - dw / 2 + 0.6, a + dw / 2 - 0.9]) b.box('emissive', x, y + 0.02, mz + 2, x + 0.3, y + 0.03, d - 0.5, 0xc8a020, NC);
  b.loot(a, y + 0.05, d * 0.6, 2); b.loot(a - 6, y + 0.05, d * 0.35, 2); b.loot(a + 6, y + 0.05, d * 0.8, 2); b.loot(w - 3, my + 0.05, 4, 2);
}

export function watchtower(b, R, hgt = 6) {
  const s = 4.6, NC = { c: false }; mark(b, 0, 0, s, s, '#6d6a60', 0);
  for (const [x, z] of [[0, 0], [s - 0.3, 0], [0, s - 0.3], [s - 0.3, s - 0.3]]) b.box('wood', x, -1.5, z, x + 0.3, hgt + 2.4, z + 0.3, 0x5c4a36);
  for (let k = 0; k < 2; k++) { const y = k * hgt / 2; b.boxR('wood', s / 2, y + hgt / 4, 0.15, s * 1.15, 0.1, 0.08, 0, 0x5c4a36); b.box('wood', 0, y + hgt / 2 - 0.1, 0, s, y + hgt / 2, 0.14, 0x5c4a36, NC); b.box('wood', 0, y + hgt / 2 - 0.1, s - 0.14, s, y + hgt / 2, s, 0x5c4a36, NC); }
  const half = hgt / 2;
  stairs(b, 0.5, 0, 0.35, 1.45, half, 1, 'wood', 0x7a6248); b.box('wood', 0.5 + 3.6, half - 0.12, 0.35, s - 0.3, half, 2.7, 0x7a6248); b.box('wood', 0.3, half - 0.12, 1.55, 0.5 + 3.6, half, 2.7, 0x7a6248, NC);
  stairs(b, 0.5 + 3.6, half, 1.55, 2.65, half, -1, 'wood', 0x7a6248);
  slab(b, 'wood', 0x7a6248, -0.4, -0.4, s + 0.4, s + 0.4, hgt - 0.14, hgt, { x0: 0.5, x1: 4.1, z0: 1.55, z1: 2.65 });
  const rl = (x0, z0, x1, z1) => { b.box('wood', x0, hgt, z0, x1, hgt + 1.05, z1, 0x6a5540); };
  rl(-0.4, -0.4, s + 0.4, -0.3); rl(-0.4, s + 0.3, s + 0.4, s + 0.4); rl(-0.4, -0.3, -0.3, s + 0.3); rl(s + 0.3, -0.3, s + 0.4, s + 0.3);
  b.box('metal', -0.7, hgt + 2.4, -0.7, s + 0.7, hgt + 2.52, s + 0.7, 0x5a6258); b.loot(s / 2, hgt + 0.05, s - 0.8, 2); b.loot(s - 0.9, hgt + 0.05, 0.6, 2);
}

export function container(b, x, y, z, R, alongX = true, len = 6.1, open = false, color = null) {
  const c = color || R.pick([0x9a3a2a, 0x2a5a8a, 0x3a7a4a, 0xb8862a, 0x7a7a7a, 0x5a2a6a, 0xb8b4a8, 0x1f4a5a]); const W = 2.44, H = 2.6; const X = alongX ? len : W, Z = alongX ? W : len;
  if (!open) { b.box('container', x, y, z, x + X, y + H, z + Z, c, { bottom: true }); }
  else { const t = 0.08; b.box('container', x, y, z, x + X, y + t, z + Z, c); b.box('container', x, y + H - t, z, x + X, y + H, z + Z, c, { bottom: true });
    if (alongX) { b.box('container', x, y + t, z, x + X, y + H - t, z + t, c); b.box('container', x, y + t, z + Z - t, x + X, y + H - t, z + Z, c); b.box('container', x, y + t, z + t, x + t, y + H - t, z + Z - t, c); b.boxR('container', x + X + 0.5, y + H / 2, z - 0.25, 1.2, H - 0.1, 0.06, 0.5, c); b.boxR('container', x + X + 0.5, y + H / 2, z + Z + 0.25, 1.2, H - 0.1, 0.06, -0.5, c); b.loot(x + X * 0.3, y + 0.12, z + Z / 2, 1); b.loot(x + X * 0.7, y + 0.12, z + Z / 2, 1); }
    else { b.box('container', x, y + t, z, x + t, y + H - t, z + Z, c); b.box('container', x + X - t, y + t, z, x + X, y + H - t, z + Z, c); b.box('container', x + t, y + t, z, x + X - t, y + H - t, z + t, c); b.boxR('container', x - 0.25, y + H / 2, z + Z + 0.5, 0.06, H - 0.1, 1.2, 0.5, c); b.boxR('container', x + X + 0.25, y + H / 2, z + Z + 0.5, 0.06, H - 0.1, 1.2, -0.5, c); b.loot(x + X / 2, y + 0.12, z + Z * 0.3, 1); b.loot(x + X / 2, y + 0.12, z + Z * 0.7, 1); } }
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) b.box('steel', x + u * (X - 0.12), y, z + v * (Z - 0.12), x + u * (X - 0.12) + 0.12, y + H + 0.01, z + v * (Z - 0.12) + 0.12, c, { c: false, shade: 0.7 });
}

// Street dressing from the city asset pack (no-ops when assets are missing)
export const S = {
  // random loose clutter: debris, bricks, gas cans, pipes, planks, bags
  clutter(b, x, y, z, R) { const k = R.pick([['urban/debris_pile', 1.6, 0.5], ['urban/bricks', 0.9, 0.4], ['urban/gas_can', 0.35, 0.45], ['urban/propane_tank', 0.4, 0.6], ['urban/pipes', 2.4, 0.5], ['urban/wood_planks', 1.8, 0.25], ['urban/trash_bags', 1.0, 0.6], ['urban/cardboard_boxes_2', 1.1, 0.8], ['urban/trash_container_open', 1.5, 1.2]]); const w = k[1], ax = R.chance(0.5); b.prop(k[0], x, y, z, x + (ax ? w : w * 0.6), y + k[2], z + (ax ? w * 0.6 : w), { out: 1, uniform: 1 }); if (k[2] > 0.55) b.box(null, x, y, z, x + w * 0.6, y + k[2] * 0.9, z + w * 0.6, 0, { mat: 3 }); },
  brickWall(b, x, y, z, ax = true) { const X = ax ? 3.2 : 0.35, Z = ax ? 0.35 : 3.2; if (b.prop('urban/brick_wall', x, y, z, x + X, y + 1.25, z + Z, { out: 1 })) b.box(null, x, y, z, x + X, y + 1.2, z + Z, 0, { mat: 0 }); },
  heli(b, x, y, z) { if (b.prop('mil/helicopter', x - 6.5, y, z - 2.2, x + 6.5, y + 4.2, z + 2.2, { out: 1, uniform: 1 })) { b.box(null, x - 4, y, z - 1.2, x + 3, y + 2.6, z + 1.2, 0, { mat: 2 }); b.loot(x, y + 0.05, z + 2.4, 2); } },
  boat(b, x, y, z, ax = true) { const X = ax ? 9 : 3, Z = ax ? 3 : 9; if (b.prop('mil/military_boat', x, y, z, x + X, y + 2.6, z + Z, { out: 1 })) b.box(null, x, y - 1, z, x + X, y + 1.0, z + Z, 0, { mat: 2 }); },
  tank(b, x, y, z, ax = true, light = false) { const X = ax ? 7 : 3.4, Z = ax ? 3.4 : 7; if (b.prop('vehicles2/tank', x, y, z, x + X, y + 2.9, z + Z, { out: 1 })) { b.box(null, x + 0.2, y, z + 0.2, x + X - 0.2, y + 2.3, z + Z - 0.2, 0, { mat: 2 }); b.loot(x + X / 2 + (ax ? 0 : 2.4), y + 0.05, z + Z / 2 + (ax ? 2.4 : 0), 2); } },
  light(b, x, y, z) { if (b.prop('city/traffic_light', x - 0.6, y, z - 0.6, x + 0.6, y + 5.2, z + 0.6, { out: 1, uniform: 1 })) b.box(null, x - 0.15, y, z - 0.15, x + 0.15, y + 4, z + 0.15, 0, { mat: 2 }); },
  hydrant(b, x, y, z) { if (b.prop('city/fire_hydrant', x - 0.25, y, z - 0.25, x + 0.25, y + 0.85, z + 0.25, { out: 1, uniform: 1 })) b.box(null, x - 0.2, y, z - 0.2, x + 0.2, y + 0.8, z + 0.2, 0, { mat: 2 }); },
  mailbox(b, x, y, z) { if (b.prop('city/mailbox', x - 0.3, y, z - 0.3, x + 0.3, y + 1.25, z + 0.3, { out: 1, uniform: 1 })) b.box(null, x - 0.25, y, z - 0.25, x + 0.25, y + 1.2, z + 0.25, 0, { mat: 2 }); },
  cone(b, x, y, z) { b.prop('city/cone', x - 0.22, y, z - 0.22, x + 0.22, y + 0.62, z + 0.22, { out: 1, uniform: 1 }); },
  trash(b, x, y, z) { if (b.prop('city/trash_can', x - 0.3, y, z - 0.3, x + 0.3, y + 0.95, z + 0.3, { out: 1, uniform: 1 })) b.box(null, x - 0.28, y, z - 0.28, x + 0.28, y + 0.9, z + 0.28, 0, { mat: 2 }); },
  bags(b, x, y, z) { b.prop('city/trah_bag_grey', x - 0.3, y, z - 0.3, x + 0.3, y + 0.6, z + 0.3, { out: 1, uniform: 1 }); b.prop('city/trah_bag_grey', x + 0.35, y, z - 0.1, x + 0.9, y + 0.5, z + 0.45, { out: 1, uniform: 1 }); },
  busStop(b, x, y, z, ax = true) { const X = ax ? 3.6 : 1.5, Z = ax ? 1.5 : 3.6; if (b.prop('city/bus_stop', x, y, z, x + X, y + 2.6, z + Z, { out: 1 })) b.box(null, x, y, z, x + X, y + 2.5, z + (ax ? 0.2 : Z), 0, { mat: 2, nav: 1 }); },
  stop(b, x, y, z) { if (b.prop('city/stop_sign', x - 0.4, y, z - 0.4, x + 0.4, y + 2.6, z + 0.4, { out: 1, uniform: 1 })) b.box(null, x - 0.08, y, z - 0.08, x + 0.08, y + 2.5, z + 0.08, 0, { mat: 2 }); },
  billboard(b, x, y, z, ax = true) { const X = ax ? 7 : 2.4, Z = ax ? 2.4 : 7; if (b.prop('city/billboard', x, y, z, x + X, y + 8, z + Z, { out: 1 })) b.box(null, x + X / 2 - 0.3, y, z + Z / 2 - 0.3, x + X / 2 + 0.3, y + 4, z + Z / 2 + 0.3, 0, { mat: 2 }); },
  atm(b, x, y, z) { if (b.prop('city/atm', x, y, z, x + 0.8, y + 1.9, z + 0.7, { out: 1, uniform: 1 })) b.box(null, x, y, z, x + 0.8, y + 1.8, z + 0.7, 0, { mat: 2 }); },
  planter(b, x, y, z, ax = true) { const X = ax ? 2.2 : 0.8, Z = ax ? 0.8 : 2.2; if (b.prop('city/planter_bushes', x, y, z, x + X, y + 1.1, z + Z, { out: 1 })) b.box(null, x, y, z, x + X, y + 0.6, z + Z, 0, { mat: 0 }); },
  power(b, x, y, z) { if (b.prop('city/power_box', x, y, z, x + 0.9, y + 1.4, z + 0.5, { out: 1 })) b.box(null, x, y, z, x + 0.9, y + 1.4, z + 0.5, 0, { mat: 2 }); },
  bus(b, x, y, z, ax = true) { const X = ax ? 10.5 : 2.6, Z = ax ? 2.6 : 10.5; if (b.prop('city/bus', x, y, z, x + X, y + 3.1, z + Z, { out: 1 })) { b.box(null, x, y, z, x + X, y + 3, z + Z, 0, { mat: 2 }); b.loot(x + X / 2 + (ax ? 0 : 2), y + 0.05, z + Z / 2 + (ax ? 2 : 0), 1); } },
};
export const P = {
  lamp(b, x, y, z, dir = 1) { if (b.prop('urban/street_light', x - 0.3, y, z - 1.6, x + 0.3, y + 6.2, z + 1.6, { out: 1, uniform: 1 })) { b.box(null, x - 0.12, y, z - 0.12, x + 0.12, y + 5, z + 0.12, 0, { mat: 2 }); return; } b.cyl('steel', x, y, z, 0.07, 6, 0x3a3e42, 6, { c: true, r2: 0.05 }); b.box('steel', x, y + 5.9, z - 0.04, x + dir * 1.4, y + 6.0, z + 0.04, 0x3a3e42, { c: false }); b.box('emissive', x + dir * 1.0, y + 5.82, z - 0.1, x + dir * 1.45, y + 5.9, z + 0.1, 0xfff0d0, { c: false }); },
  pole(b, x, y, z) { b.cyl('wood', x, y - 0.5, z, 0.13, 8.5, 0x4a3a2a, 6, { c: true }); b.box('wood', x - 1.1, y + 7.2, z - 0.06, x + 1.1, y + 7.32, z + 0.06, 0x4a3a2a, { c: false }); for (const u of [-0.9, 0, 0.9]) b.cyl('concrete', x + u, y + 7.32, z, 0.04, 0.14, 0xcfd8d8, 5); },
  bench(b, x, y, z, ax = true) { { const X0 = ax ? 1.7 : 0.6, Z0 = ax ? 0.6 : 1.7; if (b.prop('city/bench', x, y, z, x + X0, y + 0.9, z + Z0, { out: 1 })) { b.box(null, x, y, z, x + X0, y + 0.45, z + Z0, 0, { mat: 1 }); return; } } const X = ax ? 1.7 : 0.5, Z = ax ? 0.5 : 1.7; b.box('wood', x, y + 0.4, z, x + X, y + 0.46, z + Z, 0x7a5a3a); if (ax) b.box('wood', x, y + 0.46, z, x + X, y + 0.9, z + 0.06, 0x7a5a3a, { c: false }); else b.box('wood', x, y + 0.46, z, x + 0.06, y + 0.9, z + Z, 0x7a5a3a, { c: false }); b.box('steel', x + 0.1, y, z + 0.1, x + X - 0.1, y + 0.4, z + Z - 0.1, 0x2c2c2c, { c: false }); },
  dumpster(b, x, y, z, R) { if (b.prop('city/dumpster', x, y, z, x + 2.0, y + 1.35, z + 1.1, { out: 1 })) { b.box(null, x, y, z, x + 2.0, y + 1.3, z + 1.1, 0, { mat: 2 }); return; } const c = R.pick([0x2e5a3e, 0x3a4e6a, 0x6a3a30]); b.box('steel', x, y, z, x + 2.0, y + 1.25, z + 1.1, c); b.box('steel', x - 0.04, y + 1.25, z - 0.04, x + 2.04, y + 1.32, z + 1.14, 0x222222, { c: false }); },
  barrier(b, x, y, z, ax = true, len = 2.4) { { const X0 = ax ? len : 0.6, Z0 = ax ? 0.6 : len; if (b.prop('urban/barrier_single', x, y, z, x + X0, y + 0.95, z + Z0, { out: 1 })) { b.box(null, x, y, z, x + X0, y + 0.95, z + Z0, 0, { mat: 0 }); return; } } const X = ax ? len : 0.5, Z = ax ? 0.5 : len; b.box('concrete', x, y, z, x + X, y + 0.45, z + Z, 0xa8a49a); if (ax) b.box('concrete', x, y + 0.45, z + 0.14, x + X, y + 0.95, z + 0.36, 0xa8a49a); else b.box('concrete', x + 0.14, y + 0.45, z, x + 0.36, y + 0.95, z + Z, 0xa8a49a); },
  sandbags(b, x, y, z, ax = true, len = 3.2, rows = 3, R = null) { const bw = 0.62, bh = 0.24; for (let r = 0; r < rows; r++) for (let i = 0; i < Math.floor(len / bw); i++) { const o = (r % 2) * bw / 2 + i * bw; const sh = 0.85 + ((i * 7 + r * 3) % 5) * 0.04; if (ax) b.box('fabric', x + o, y + r * bh, z, x + o + bw - 0.03, y + (r + 1) * bh - 0.02, z + 0.42, 0xa89a78, { c: false, shade: sh }); else b.box('fabric', x, y + r * bh, z + o, x + 0.42, y + (r + 1) * bh - 0.02, z + o + bw - 0.03, 0xa89a78, { c: false, shade: sh }); }
    if (ax) b.box(null, x, y, z, x + len, y + rows * bh, z + 0.42, 0, { mat: 3 }); else b.box(null, x, y, z, x + 0.42, y + rows * bh, z + len, 0, { mat: 3 }); },
  hesco(b, x, y, z, n = 3, ax = true) { for (let i = 0; i < n; i++) { const X = ax ? x + i * 1.25 : x, Z = ax ? z : z + i * 1.25; b.box('fabric', X, y, Z, X + 1.2, y + 1.35, Z + 1.2, 0x9a8e70); b.box('steel', X - 0.01, y + 1.3, Z - 0.01, X + 1.21, y + 1.36, Z + 1.21, 0x555555, { c: false }); } },
  fence(b, x0, z0, x1, z1, y, h = 1.2, mat = 'wood', col = 0x7a6a54) { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4)); const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let i = 0; i <= n; i++) { const px = x0 + (x1 - x0) * i / n, pz = z0 + (z1 - z0) * i / n; b.box(mat, px - 0.06, y - 0.4, pz - 0.06, px + 0.06, y + h, pz + 0.06, col, { c: false }); }
    for (const fy of [h * 0.45, h * 0.85]) { if (ax) b.box(mat, Math.min(x0, x1), y + fy - 0.05, z0 - 0.025, Math.max(x0, x1), y + fy + 0.05, z0 + 0.025, col, { c: false }); else b.box(mat, x0 - 0.025, y + fy - 0.05, Math.min(z0, z1), x0 + 0.025, y + fy + 0.05, Math.max(z0, z1), col, { c: false }); }
    if (ax) b.box(null, Math.min(x0, x1), y, z0 - 0.06, Math.max(x0, x1), y + h, z0 + 0.06, 0, { mat: 1, nobullet: true }); else b.box(null, x0 - 0.06, y, Math.min(z0, z1), x0 + 0.06, y + h, Math.max(z0, z1), 0, { mat: 1, nobullet: true }); },
  wall(b, x0, z0, x1, z1, y, h = 3, col = 0xa29e94) { const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0); const t = 0.4;
    if (ax) { b.box('concrete', Math.min(x0, x1), y - 1.5, z0 - t / 2, Math.max(x0, x1), y + h, z0 + t / 2, col); b.box('concrete', Math.min(x0, x1), y + h, z0 - t / 2 - 0.06, Math.max(x0, x1), y + h + 0.12, z0 + t / 2 + 0.06, 0x8a867e, { c: false }); }
    else { b.box('concrete', x0 - t / 2, y - 1.5, Math.min(z0, z1), x0 + t / 2, y + h, Math.max(z0, z1), col); b.box('concrete', x0 - t / 2 - 0.06, y + h, Math.min(z0, z1), x0 + t / 2 + 0.06, y + h + 0.12, Math.max(z0, z1), 0x8a867e, { c: false }); } },
  tank(b, x, y, z, r = 3, h = 6, col = 0xb8b8b0) { b.cyl('steel', x, y, z, r, h, col, 20, { c: true }); b.cyl('steel', x, y + h, z, r, 0.6, col, 20, { r2: r * 0.3 }); b.cyl('steel', x, y + h * 0.5, z, r + 0.04, 0.12, 0x777770, 20, { cap: false }); mark(b, x - r, z - r, x + r, z + r, '#9a9a94', 0); },
  tires(b, x, y, z, n = 3) { if (b.prop(n > 3 ? 'urban/wheels_stack' : 'urban/tires', x - 0.5, y, z - 0.5, x + 0.5, y + 0.25 * n, z + 0.5, { out: 1, uniform: 1 })) { b.box(null, x - 0.4, y, z - 0.4, x + 0.4, y + 0.24 * n, z + 0.4, 0, { mat: 3 }); return; } for (let i = 0; i < n; i++) b.cyl('steel', x + (i % 2) * 0.06, y + i * 0.24, z, 0.36, 0.23, 0x1c1c1c, 10, { c: i === 0 }); },
  wreck(b, x, y, z, R, ax = true) { { const k = R.pick(['city/car', 'city/car_2', 'city/suv', 'city/sports_car', 'city/pickup_truck', 'city/van', 'single/police_car', 'city/car']); const L0 = k === 'city/van' ? 4.8 : 4.3, W0 = 1.85, H0 = k === 'city/suv' || k === 'city/van' || k === 'city/pickup_truck' ? 1.75 : 1.4; const X0 = ax ? L0 : W0, Z0 = ax ? W0 : L0; if (b.prop(k, x, y, z, x + X0, y + H0, z + Z0, { out: 1, yaw: R.chance(0.5) ? 2 : 0 })) { b.box(null, x + 0.1, y, z + 0.1, x + X0 - 0.1, y + H0 * 0.86, z + Z0 - 0.1, 0, { mat: 2 }); b.loot(x + X0 / 2 + (ax ? 0 : 1.5), y + 0.05, z + Z0 / 2 + (ax ? 1.5 : 0), 1); return; } } const c = R.pick([0x6a3a2a, 0x5a5a54, 0x3a4a5a, 0x7a6a3a]); const L = 4.3, W = 1.8; const X = ax ? L : W, Z = ax ? W : L; b.box('steel', x, y + 0.3, z, x + X, y + 0.95, z + Z, c); if (ax) b.box('steel', x + 1.1, y + 0.95, z + 0.1, x + 3.0, y + 1.45, z + Z - 0.1, c, { shade: 0.8 }); else b.box('steel', x + 0.1, y + 0.95, z + 1.1, x + X - 0.1, y + 1.45, z + 3.0, c, { shade: 0.8 });
    for (const [u, v] of [[0.7, 0], [3.4, 0], [0.7, 1], [3.4, 1]]) { if (ax) b.cylH('steel', x + u, y + 0.32, z + v * (W - 0.2), 0.2, 0.32, 'z', 0x161616, 10); else b.cylH('steel', x + v * (W - 0.2), y + 0.32, z + u, 0.2, 0.32, 'x', 0x161616, 10); } b.loot(x + X / 2 + (ax ? 0 : 1.4), y + 0.05, z + Z / 2 + (ax ? 1.4 : 0), 1); },
  tent(b, x, y, z, R, col = 0x5c6a48) { const w = 3.2, d = 3.8, h = 1.9; b.quad('fabric', [x, y, z + d], [x, y, z], [x + w / 2, y + h, z], [x + w / 2, y + h, z + d], col, true); b.quad('fabric', [x + w, y, z], [x + w, y, z + d], [x + w / 2, y + h, z + d], [x + w / 2, y + h, z], col, true); b.tri('fabric', [x + w, y, z], [x, y, z], [x + w / 2, y + h, z], col); b.box(null, x, y, z, x + w, y + 1.0, z + 0.1, 0, { mat: 3 }); b.box(null, x, y, z, x + 0.12, y + 1.2, z + d, 0, { mat: 3 }); b.box(null, x + w - 0.12, y, z, x + w, y + 1.2, z + d, 0, { mat: 3 }); b.box('fabric', x + 0.5, y, z + 0.5, x + 1.2, y + 0.1, z + 2.4, 0x7a6a50, { c: false }); b.loot(x + w / 2, y + 0.05, z + d * 0.6, 1); },
  pipeRack(b, x, y, z, len, ax = true) { for (let i = 0; i <= Math.floor(len / 5); i++) { const p = i * 5; if (ax) { b.box('steel', x + p, y, z, x + p + 0.14, y + 3.2, z + 0.14, 0x55595d); b.box('steel', x + p, y, z + 1.4, x + p + 0.14, y + 3.2, z + 1.54, 0x55595d); b.box('steel', x + p, y + 3.05, z, x + p + 0.14, y + 3.2, z + 1.54, 0x55595d, { c: false }); } else { b.box('steel', x, y, z + p, x + 0.14, y + 3.2, z + p + 0.14, 0x55595d); b.box('steel', x + 1.4, y, z + p, x + 1.54, y + 3.2, z + p + 0.14, 0x55595d); b.box('steel', x, y + 3.05, z + p, x + 1.54, y + 3.2, z + p + 0.14, 0x55595d, { c: false }); } }
    for (const [o, r, c] of [[0.35, 0.2, 0x9a9a92], [0.8, 0.14, 0x8a5a3a], [1.2, 0.2, 0xa0a8a8]]) { if (ax) b.cylH('steel', x, y + 3.2 + r, z + o, len, r, 'x', c, 8); else b.cylH('steel', x + o, y + 3.2 + r, z, len, r, 'z', c, 8); } },
};
