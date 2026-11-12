// Town layer: ordinary city buildings from the City Pack (brownstones, corner shops, apartment blocks, a city hall),
// downtown blocks around a civic plaza, small outlying towns and roadside hamlets, ruins in the Dead Sector, the
// Eagle Peak fort, and a railway loop around Iron City with a station, a parked train and two running trains.
// prepareTown() shapes the ground (call before anything is placed); buildTown() places everything (call last).
import * as THREE from 'three';
import { RNG } from '../utils/math.js';
import { ROADS, RIVER } from './WorldData.js';
import { building, wallRun, F, P, S, BASE } from './Buildings.js';
import { SoldierGLB, PEOPLE_KEYS } from '../characters/SoldierGLB.js';

// real-world sizes (m): w along the street front, d deep, h tall. flip: extra quarter turns so the shop front faces the street
const CITY = {
  red: { key: 'city/building_red', w: 9.6, d: 8.2, h: 13.8 }, green: { key: 'city/building_green', w: 9.6, d: 8.2, h: 13.8 },
  rb: { key: 'town/rb_blank_free_model', w: 9.6, d: 8.2, h: 13.8 }, gb: { key: 'town/gb_blank_free_model', w: 9.6, d: 8.2, h: 13.8 },
  brown: { key: 'city/brown_building', w: 9.2, d: 8.8, h: 16.4 }, aptS: { key: 'building/large_building_a', w: 8.6, d: 7.4, h: 14.8 },
  apt: { key: 'building/large_building_b', w: 18, d: 10.9, h: 14.8 }, hall: { key: 'city/big_building', w: 18.6, d: 17.4, h: 22.4 },
  cornerR: { key: 'town/building_red_corner_free_model', w: 5.4, d: 5.4, h: 14 }, cornerP: { key: 'town/pizza_corner_free_model', w: 5.4, d: 5.4, h: 14 },
};
const CB = (s) => 'cbits/' + s, C2 = (n) => 'city2/' + n + '_free_model';
Object.assign(CITY, {
  cb1: { key: CB('building_b_free_model'), s: 5 }, cb2: { key: CB('building_free_model'), s: 5 }, cb3: { key: CB('building_free_model_b'), s: 5 }, cb4: { key: CB('building_free_model_b_b'), s: 5 },
  cb5: { key: CB('building_free_model_b_b_b'), s: 5 }, cb6: { key: CB('building_free_model_b_b_b_b'), s: 5 }, cb7: { key: CB('building_free_model_b_b_b_b_b'), s: 5 }, cb8: { key: CB('building_free_model_b_b_b_b_b_b'), s: 5 },
  apt2: { key: C2('apartment_building'), s: 1, dz: 1.5 }, classic: { key: C2('building'), s: 2.8 }, townh: { key: C2('town_house'), s: 3 }, office: { key: C2('large_building'), s: 6.5 },
  bar: { key: C2('bar'), len: 15 }, hospital: { key: C2('hospital'), len: 46 }, hotel: { key: C2('hotel_building'), len: 28 }, sky: { key: C2('skyscraper'), s: 2.4 }, house2: { key: C2('house_with_driveway'), len: 17 },
});
const FLIP = { red: 0, green: 0, rb: 0, gb: 0, brown: 0, aptS: 0, apt: 0, hall: 0, cornerR: 0, cornerP: 0 };
// street fronts mix the brownstones with the colourful Builder Bits blocks and the classic apartment / office buildings
const ROW_TYPES = ['red', 'green', 'rb', 'gb', 'brown', 'aptS', 'apt', 'cb1', 'cb2', 'cb3', 'cb4', 'cb5', 'cb6', 'cb7', 'cb8', 'apt2', 'apt2', 'classic', 'office', 'red', 'gb', 'cb3', 'cb6', 'bar', 'townh'];
const ROOF_TANK = new Set(['red', 'green', 'rb', 'gb', 'brown', 'aptS', 'apt', 'apt2', 'classic']);
const TRACK_SC = 1.35;

function segD(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
function lineDist(list, x, z) { let m = 1e9; for (const p of list) for (let i = 0; i < p.length - 1; i++) m = Math.min(m, segD(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])); return m; }

// ---- railway geometry: a rounded rectangle around Iron City, sampled every metre
function railLoop(C) {
  const X0 = C.x - 205, X1 = C.x + 225, Z0 = C.z - 215, Z1 = C.z + 215, Rr = 18 * TRACK_SC; const pts = [];
  const line = (ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az)); for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); };
  const arc = (f) => { const n = Math.ceil(Rr * Math.PI / 2); for (let i = 0; i < n; i++) pts.push(f(i / n * Math.PI / 2)); };
  line(X0 + Rr, Z1, X1 - Rr, Z1); arc(p => [X1 - Rr + Rr * Math.sin(p), Z1 - Rr + Rr * Math.cos(p)]);
  line(X1, Z1 - Rr, X1, Z0 + Rr); arc(p => [X1 - Rr + Rr * Math.cos(p), Z0 + Rr - Rr * Math.sin(p)]);
  line(X1 - Rr, Z0, X0 + Rr, Z0); arc(p => [X0 + Rr - Rr * Math.sin(p), Z0 + Rr - Rr * Math.cos(p)]);
  line(X0, Z0 + Rr, X0, Z1 - Rr); arc(p => [X0 + Rr - Rr * Math.cos(p), Z1 - Rr + Rr * Math.sin(p)]);
  // resample at exactly 1 m
  const out = [[pts[0][0], pts[0][1]]]; let acc = 0; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], c = pts[i % pts.length]; let seg = Math.hypot(c[0] - a[0], c[1] - a[1]), t0 = 0; while (acc + seg - t0 >= 1) { const t = t0 + (1 - acc); out.push([a[0] + (c[0] - a[0]) * t / seg, a[1] + (c[1] - a[1]) * t / seg]); t0 = t; acc = 0; } acc += seg - t0; }
  if (Math.hypot(out[out.length - 1][0] - out[0][0], out[out.length - 1][1] - out[0][1]) < 0.5) out.pop();
  return { X0, X1, Z0, Z1, Rr, pts: out, len: out.length };
}

export function prepareTown(G) {
  const world = G.world, C = world.locations.find(l => l.id === 'iron'); const rail = railLoop(C); const n = rail.len;
  // smooth height profile (never below the beach) and a flattened corridor with a ballast bed
  let h = rail.pts.map(p => Math.max(3.2, world.heightAt(p[0], p[1])));
  for (let pass = 0; pass < 3; pass++) { const o = new Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let k = -30; k <= 30; k++) s += h[(i + k + n) % n]; o[i] = s / 61; } h = o; }
  rail.y = h; for (let i = 0; i < n; i += 2) { const [x, z] = rail.pts[i]; world.flattenRect(x - 3.5, z - 3.5, x + 3.5, z + 3.5, h[i], 7); }
  for (let i = 0; i < n; i += 2) { const [x, z] = rail.pts[i]; world.paintRect(1, x - 2.6, z - 2.6, x + 2.6, z + 2.6, 210, 1.2); world.paintRect(3, x - 5, z - 5, x + 5, z + 5, 0, 2); }
  // station platform + siding on the south straight
  const sx = C.x + 110, sy = h[Math.round(sx - (rail.X0 + rail.Rr))]; rail.station = { x: sx, z: rail.Z1, y: sy, s: Math.round(sx - (rail.X0 + rail.Rr)) };
  world.flattenRect(sx - 70, rail.Z1 - 22, sx + 70, rail.Z1 + 10, sy, 10); world.paintRect(2, sx - 40, rail.Z1 - 20, sx + 40, rail.Z1 - 2.5, 220, 1.5); world.paintRect(1, sx - 66, rail.Z1 + 4, sx + 66, rail.Z1 + 8, 210, 1.2);
  world.paintRect(3, sx - 72, rail.Z1 - 24, sx + 72, rail.Z1 + 12, 0, 3);
  for (let i = 0; i < n; i++) if (Math.abs(rail.pts[i][1] - rail.Z1) < 0.01 && Math.abs(rail.pts[i][0] - sx) < 72) rail.y[i] = sy;
  // freight stop on the north straight
  const fx = C.x + 10; rail.freight = { x: fx, z: rail.Z0, s: Math.round((rail.X1 - rail.Rr - rail.X0 - rail.Rr) + rail.Rr * Math.PI / 2 + (rail.Z1 - rail.Z0 - 2 * rail.Rr) + rail.Rr * Math.PI / 2 + (rail.X1 - rail.Rr - fx)) };
  // footprints (minimap + keeps other builders off the line)
  const fp = (x0, z0, x1, z1) => world.footprints.push({ x0, z0, x1, z1, c: '#5c534a', rail: 1 });
  fp(rail.X0 + rail.Rr, rail.Z1 - 1.6, rail.X1 - rail.Rr, rail.Z1 + 1.6); fp(rail.X0 + rail.Rr, rail.Z0 - 1.6, rail.X1 - rail.Rr, rail.Z0 + 1.6); fp(rail.X0 - 1.6, rail.Z0 + rail.Rr, rail.X0 + 1.6, rail.Z1 - rail.Rr); fp(rail.X1 - 1.6, rail.Z0 + rail.Rr, rail.X1 + 1.6, rail.Z1 - rail.Rr);
  for (const [cx, cz] of [[rail.X0, rail.Z0], [rail.X1 - rail.Rr, rail.Z0], [rail.X0, rail.Z1 - rail.Rr], [rail.X1 - rail.Rr, rail.Z1 - rail.Rr]]) fp(cx, cz, cx + rail.Rr, cz + rail.Rr);
  world.rail = rail; world.extraTrees = world.extraTrees || [];
}

export function buildTown(G, b, L, group, api) {
  const world = G.world, A = G.assets, R = new RNG(2189); const roads = ROADS.map(r => r.p), river = [RIVER]; const NC = { c: false };
  const clear = (cx, cz, hw, hd = hw, m = 3) => { for (const f of world.footprints) if (cx + hw > f.x0 - m && cx - hw < f.x1 + m && cz + hd > f.z0 - m && cz - hd < f.z1 + m) return false; return true; };
  const tree = (x, z, s = 1, fam = 'street') => world.extraTrees.push({ x, z, s, fam });

  // ---- one City Pack building. face: the direction its front looks (0 +z, 1 +x, 2 -z, 3 -x); w: optional width override
  // size of a catalogue entry: explicit (w, d, h) or measured from the model (uniform scale s, or longest side len); yo sinks models that carry a ground slab
  const dims = (type) => { const T = CITY[type]; if (!T) return null; if (T.w) return { W: T.w, D: T.d, H: T.h, yo: 0 }; const st = A && A.has(T.key) && A.static(T.key); if (!st) return null;
    const s = T.s || T.len / Math.max(st.size.x, st.size.z); return { W: st.size.x * s, D: st.size.z * s * (T.dz || 1), H: st.size.y * s, yo: Math.min(0, st.box.min.y * s) }; };
  const city = (type, cx, cz, face, y, w) => {
    const T = CITY[type], dm = dims(type); if (!T || !dm || !A || !A.has(T.key)) return false; const W = w || dm.W, D = dm.D, H = dm.H * (w ? Math.min(1.1, Math.max(0.92, w / dm.W)) : 1), yo = dm.yo;
    const along = face % 2 === 0, X = along ? W : D, Z = along ? D : W, x0 = cx - X / 2, z0 = cz - Z / 2;
    b.origin(0, y, 0, 0); b.prop(T.key, x0, yo, z0, x0 + X, yo + H, z0 + Z, { out: 1, yaw: (face + (FLIP[type] || 0)) % 4, fixed: 1 });
    // a water tank on some flat roofs, the way old city blocks have them
    if (ROOF_TANK.has(type) && R.chance(0.3) && A.has('cbits/watertower_free_model')) { const tx = cx + R.range(-X * 0.25, X * 0.25), tz = cz + R.range(-Z * 0.2, Z * 0.2), top = yo + H - 0.45; b.prop('cbits/watertower_free_model', tx - 1.6, top, tz - 1.6, tx + 1.6, top + 4.3, tz + 1.6, { out: 1, fixed: 1 }); }
    b.box(null, x0 + 0.15, -1, z0 + 0.15, x0 + X - 0.15, H, z0 + Z - 0.15, 0, { mat: 2 });
    b.box('concrete', x0 - 0.25, -2.5, z0 - 0.25, x0 + X + 0.25, 0.1, z0 + Z + 0.25, 0x8c8a84);
    world.paintRect(3, x0 - 1.5, z0 - 1.5, x0 + X + 1.5, z0 + Z + 1.5, 0, 2); world.footprints.push({ x0, z0, x1: x0 + X, z1: z0 + Z, c: type === 'hall' ? '#9a8a74' : '#8a7a6c' });
    return true; };
  // a straight street front from a0 to a1 along `axis` with fronts on `line`, facing `face`; gap: leave an opening in the middle
  const row = (axis, a0, a1, line, face, y, gap = 0) => {
    const L0 = a1 - a0 - gap; if (L0 < 6) return; const list = []; let sum = 0;
    for (let t = 0; t < 30; t++) { const ty = R.pick(ROW_TYPES), dm = dims(ty); if (!dm || dm.D > 12.5) continue; const w = dm.W; if (sum + w > L0 * 1.08) { if (sum >= L0 * 0.86) break; continue; } list.push(ty); sum += w; }
    if (!list.length) return; const k = L0 / sum; let u = a0; const mid = Math.floor(list.length / 2);
    list.forEach((ty, i) => { if (gap && i === mid) u += gap; const dm = dims(ty), W = dm.W * k, D = dm.D, c = u + W / 2; const off = face === 0 || face === 1 ? -D / 2 : D / 2;
      if (axis === 'x') city(ty, c, line + off, face, y, W); else city(ty, line + off, c, face, y, W); u += W; });
  };
  const lampRow = (axis, a0, a1, line, y, step = 18) => { b.origin(0, y, 0, 0); for (let u = a0; u <= a1; u += step) { if (axis === 'x') P.lamp(b, u, 0, line, line > 0 ? -1 : 1); else P.lamp(b, line, 0, u, 1); } };

  // ================= IRON CITY DOWNTOWN: four blocks around the central crossing =================
  { const C = L.iron, y = C.h; const IN = 21.5; // building fronts sit IN m from the block centre (pavement + tree strip in front)
    for (const [bx, bz, civic] of [[C.x - 32, C.z - 32, true], [C.x + 32, C.z - 32, false], [C.x - 32, C.z + 32, false], [C.x + 32, C.z + 32, false]]) {
      world.paintRect(2, bx - 27, bz - 27, bx + 27, bz + 27, 235, 1.5); world.paintRect(3, bx - 27, bz - 27, bx + 27, bz + 27, 0, 1);
      if (civic) { // city hall on a lawn with a fountain and trees
        city('hall', bx, bz - 4, 2, y); b.origin(0, y, 0, 0);
        world.paintRect(3, bx - 20, bz + 7, bx + 20, bz + 20, 255, 1); world.paintRect(2, bx - 20, bz + 7, bx + 20, bz + 20, 0, 1); world.paintRect(2, bx - 2.5, bz + 5, bx + 2.5, bz + 27, 235, 0.6); world.paintRect(2, bx - 20, bz + 12.5, bx + 20, bz + 15.5, 235, 0.6);
        b.cyl('concrete', bx, 0, bz + 14, 3.4, 0.6, 0xb4ae9e, 18, { c: true }); b.cyl('concrete', bx, 0.6, bz + 14, 3.0, 0.08, 0x5a8fa6, 18, NC); b.cyl('concrete', bx, 0.6, bz + 14, 0.45, 1.6, 0xa8a292, 10, { c: true }); b.cyl('concrete', bx, 2.2, bz + 14, 1.1, 0.25, 0xa8a292, 12, NC);
        for (const sg of [-1, 1]) { P.bench(b, bx + sg * 7 - 0.85, 0, bz + 10.2, true); P.bench(b, bx + sg * 7 - 0.85, 0, bz + 17.2, true); tree(bx + sg * 14, bz + 10, 0.85, 'park'); tree(bx + sg * 14, bz + 18, 0.85, 'park'); tree(bx + sg * 21, bz - 4, 0.9, 'park'); tree(bx + sg * 21, bz - 16, 0.9, 'park'); }
        b.box('steel', bx + 9, 0, bz + 21, bx + 9.12, 9, bz + 21.12, 0x8a8f94, NC); b.box('fabric', bx + 9.12, 7.4, bz + 21.05, bx + 11.4, 8.9, bz + 21.08, 0x2e5a8a, NC);
        b.loot(bx - 6, 0.05, bz + 14, 1); b.loot(bx + 16, 0.05, bz + 4, 1); continue; }
      if (bx > C.x && bz < C.z && dims('sky')) { // tower plaza: the skyscraper on a paved square with trees, benches and planters
        world.paintRect(2, bx - 26, bz - 26, bx + 26, bz + 26, 245, 1); city('sky', bx, bz - 2, 0, y); b.origin(0, y, 0, 0);
        for (const [u, v] of [[-18, -18], [18, -18], [-18, 18], [18, 18], [-18, 0], [18, 0]]) tree(bx + u, bz + v, 0.8, 'park');
        for (const sg of [-1, 1]) { P.bench(b, bx + sg * 13 - 0.85, 0, bz + 16, true); S.planter(b, bx + sg * 8, 0, bz + 18.5, true); S.planter(b, bx + sg * 20, 0, bz + 8, false); }
        b.cyl('concrete', bx, 0, bz + 18.5, 2.4, 0.5, 0xb4ae9e, 16, { c: true }); b.cyl('concrete', bx, 0.5, bz + 18.5, 2.1, 0.06, 0x5a8fa6, 16, NC);
        b.loot(bx - 12, 0.05, bz + 12, 1); b.loot(bx + 14, 0.05, bz - 14, 1); continue; }
      // perimeter of brownstones with corner shops; alleys on two sides lead into a courtyard
      const sides = [[bz - IN, 2, 'x', true], [bz + IN, 0, 'x', false], [bx - IN, 3, 'z', false], [bx + IN, 1, 'z', true]];
      for (const [line, face, axis, gap] of sides) { const c0 = axis === 'x' ? bx : bz; row(axis, c0 - IN + 5.4, c0 + IN - 5.4, line, face, y, gap ? 6 : 0); }
      for (const [sx, sz, face] of [[-1, -1, 2], [1, -1, 2], [-1, 1, 0], [1, 1, 0]]) city(R.chance(0.5) ? 'cornerR' : 'cornerP', bx + sx * (IN - 2.7), bz + sz * (IN - 2.7), face, y);
      // courtyard: one enterable building, parking and a tree
      const t = R.f(); if (t < 0.5) api.shop(R, bx, bz + 1, R.pick([0, 2]), y, { w: 14, d: 9, floors: 2 }); else api.apartment(R, bx, bz + 1, R.pick([0, 2]), y, { w: 16, d: 10, floors: 2 });
      b.origin(0, y, 0, 0); P.dumpster(b, bx + R.range(-9, 6), 0, bz - 9, R); F.crate(b, bx - 10, 0, bz + 9); b.loot(bx + 8, 0.05, bz + 9, 1); b.loot(bx - 8, 0.05, bz - 8, 1);
    }
    // pavements: street trees, lamps, benches, hydrants and parked cars along the central avenues
    b.origin(0, y, 0, 0);
    for (const k of [-1, 0, 1]) for (const sg of [-1, 1]) { if (k && sg === k) continue; const line = k * 64 + sg * 6.6; /* ring roads: inner pavement only */
      for (let u = -58; u <= 58; u += 13) { if (Math.abs(u) < 9 || Math.abs(Math.abs(u) - 64) < 9) continue; tree(C.x + u, C.z + line, 0.62); tree(C.x + line, C.z + u, 0.62); }
      for (let u = -56; u <= 56; u += 19) { if (Math.abs(u) < 8) continue; P.lamp(b, C.x + u + 4, 0, C.z + line, -sg); P.lamp(b, C.x + line, 0, C.z + u + 4, -sg); } }
    for (let i = 0; i < 10; i++) { const sg = R.chance(0.5) ? 1 : -1, k = 0, u = R.range(-54, 54); /* parked on the central avenues (the ring roads carry traffic) */ if (Math.abs(u) < 10) continue; const key = R.pick(['city/car', 'city/car_2', 'city/suv', 'city/van', 'city/pickup_truck']);
      if (R.chance(0.5)) b.prop(key, C.x + u - 2.3, 0, C.z + k * 64 + sg * 3.2 - 1.0, C.x + u + 2.3, 1.6, C.z + k * 64 + sg * 3.2 + 1.0, { out: 1 }); else b.prop(key, C.x + k * 64 + sg * 3.2 - 1.0, 0, C.z + u - 2.3, C.x + k * 64 + sg * 3.2 + 1.0, 1.6, C.z + u + 2.3, { out: 1 }); }
    for (let i = 0; i < 8; i++) { const sg = R.chance(0.5) ? 1 : -1, u = R.range(-50, 50); if (Math.abs(u) < 8) continue; if (i % 2) { S.hydrant(b, C.x + u, 0, C.z + sg * 6); P.bench(b, C.x + sg * 7, 0, C.z + u, false); } else { S.trash(b, C.x + u, 0, C.z + sg * 6.2); S.planter(b, C.x + u + 3, 0, C.z + sg * 6.4, true); } }
    S.busStop(b, C.x + 40, 0, C.z + 6.4, true); S.busStop(b, C.x - 6.4, 0, C.z - 44, false);
    // overhead traffic lights (City Builder Bits): one per corner, the arm reaching over the lanes of the road beside it
    if (A && A.has('cbits/traffic_light_free_model_b')) { const K = 'cbits/traffic_light_free_model_b', arm = 4.8, h = 5.8;
      for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) { const ix = C.x + i * 64, iz = C.z + j * 64;
        for (const [sx, sz, q] of [[1, 1, 0], [-1, 1, 3], [-1, -1, 2], [1, -1, 1]]) { const px = ix + sx * 6.0, pz = iz + sz * 6.0;
          const box = q === 0 ? [px - arm, pz - 0.6, px + 0.3, pz + 0.6] : q === 2 ? [px - 0.3, pz - 0.6, px + arm, pz + 0.6] : q === 1 ? [px - 0.6, pz - 0.3, px + 0.6, pz + arm] : [px - 0.6, pz - arm, px + 0.6, pz + 0.3];
          b.prop(K, box[0], 0, box[1], box[2], h, box[3], { out: 1, yaw: q, fixed: 1 }); b.box(null, px - 0.15, 0, pz - 0.15, px + 0.15, 3, pz + 0.15, 0, { mat: 2 }); } } }
    // more parked cars along the side streets: the classic cars of City Pack 2 and the Builder Bits taxis and police
    const parked = ['city2/convertible_free_model', 'city2/nissan_gtr_free_model', 'city2/2015_dodge_challenger_free_model', 'city2/1994_nissan_180mx_free_model', 'cbits/taxi_free_model', 'cbits/stationwagon_free_model', 'cbits/car_hatchback_free_model'].filter(k => A && A.has(k));
    for (let i = 0; i < 14 && parked.length; i++) { const sg = R.chance(0.5) ? 1 : -1, k = R.pick([-1, 1]) * 32, u = R.range(-56, 56); if (Math.abs(Math.abs(u) - 32) < 4) continue; const key = R.pick(parked);
      if (R.chance(0.5)) b.prop(key, C.x + u - 1.0, 0, C.z + k + sg * 3.3 - 2.3, C.x + u + 1.0, 1.5, C.z + k + sg * 3.3 + 2.3, { out: 1, uniform: 1 }); else b.prop(key, C.x + k + sg * 3.3 - 2.3, 0, C.z + u - 1.0, C.x + k + sg * 3.3 + 2.3, 1.5, C.z + u + 1.0, { out: 1, uniform: 1 }); }
  }

  // ================= RAILWAY: track, level crossings, station, parked train =================
  const rail = world.rail;
  if (rail) { const n = rail.len, { X0, X1, Z0, Z1, Rr } = rail; const yAt = (s) => rail.y[((Math.round(s) % n) + n) % n];
    const piece = TRACK_SC * 18, gauge = 1.26 * TRACK_SC, th = 0.14 * TRACK_SC;
    const straight = (axis, a0, a1, line, s0, dir) => { const len = a1 - a0, k = Math.ceil(len / piece), pl = len / k;
      for (let i = 0; i < k; i++) { const u0 = a0 + i * pl, u1 = u0 + pl; let ys = 0; for (let q = 0; q < 5; q++) ys += yAt(s0 + dir * (i * pl + pl * q / 4)); const y = ys / 5; b.origin(0, y, 0, 0);
        if (axis === 'x') { b.box('concrete', u0, -1.2, line - 1.9, u1, 0.06, line + 1.9, 0x6f675e, NC); b.prop('train/railway_track_straight_free_model', u0, 0.06, line - gauge / 2, u1, 0.06 + th, line + gauge / 2, { out: 1, fixed: 1 }); }
        else { b.box('concrete', line - 1.9, -1.2, u0, line + 1.9, 0.06, u1, 0x6f675e, NC); b.prop('train/railway_track_straight_free_model', line - gauge / 2, 0.06, u0, line + gauge / 2, 0.06 + th, u1, { out: 1, yaw: 1, fixed: 1 }); } } };
    const sS = 0, lenX = X1 - X0 - 2 * Rr, lenZ = Z1 - Z0 - 2 * Rr, q = Rr * Math.PI / 2;
    straight('x', X0 + Rr, X1 - Rr, Z1, sS, 1); straight('z', Z0 + Rr, Z1 - Rr, X1, lenX + q + lenZ, -1); straight('x', X0 + Rr, X1 - Rr, Z0, 2 * lenX + 2 * q + lenZ, -1); straight('z', Z0 + Rr, Z1 - Rr, X0, 2 * lenX + 3 * q + lenZ, 1);
    // curves: built along the same 1 m path samples the trains follow (ballast, sleepers, two rails), so they always line up
    const corner = (cx, cz, qt0, s0) => { void cx; void cz; void qt0; const P2 = rail.pts, at = (i) => P2[((i % n) + n) % n];
      for (let i = Math.floor(s0) - 1; i < s0 + q + 1; i++) { const p = at(i), p2 = at(i + 1), mx = (p[0] + p2[0]) / 2, mz = (p[1] + p2[1]) / 2, yaw = Math.atan2(-(p2[1] - p[1]), p2[0] - p[0]), y = yAt(i); b.origin(0, y, 0, 0);
        const nx = -Math.sin(yaw), nz = -Math.cos(yaw); // unit normal to the track
        b.boxR('concrete', mx, -0.57, mz, 1.15, 1.26, 3.8, yaw, 0x6f675e, NC);
        for (const sg of [-1, 1]) b.boxR('steel', mx + nx * sg * gauge * 0.36, 0.06 + th * 0.75, mz + nz * sg * gauge * 0.36, 1.05, th * 0.5, 0.09, yaw, 0xd8dade, NC);
        b.boxR('wood', mx, 0.06 + th * 0.25, mz, 0.32, th * 0.5, gauge * 1.15, yaw, 0xc9c6bf, NC); } };
    corner(X1 - Rr, Z1 - Rr, 2, lenX); corner(X1 - Rr, Z0 + Rr, 3, lenX + q + lenZ); corner(X0 + Rr, Z0 + Rr, 0, 2 * lenX + 2 * q + lenZ); corner(X0 + Rr, Z1 - Rr, 1, 2 * lenX + 3 * q + lenZ);
    // level crossings: plank deck + warning posts where roads meet the line
    let last = -99; for (let i = 0; i < n; i++) { const [x, z] = rail.pts[i]; if (lineDist(roads, x, z) > 4 || i - last < 20) continue; last = i; const p2 = rail.pts[(i + 1) % n], yaw = Math.atan2(-(p2[1] - z), p2[0] - x), y = rail.y[i]; b.origin(0, y, 0, 0);
      b.boxR('wood', x, 0.1, z, 9, 0.2, 3.2, yaw, 0x6a5440, NC); const nx = -Math.sin(yaw), nz = -Math.cos(yaw);
      for (const sg of [-1, 1]) { const px = x + Math.cos(yaw) * 5.5 * sg + nx * 4.2 * sg, pz = z - Math.sin(yaw) * 5.5 * sg + nz * 4.2 * sg; b.cyl('steel', px, 0, pz, 0.08, 3.2, 0xe8e8e0, 8, { c: true }); b.boxR('paint', px, 2.85, pz, 1.4, 0.22, 0.05, yaw + 0.6, 0xe8e2d8, NC); b.boxR('paint', px, 2.85, pz, 1.4, 0.22, 0.05, yaw - 0.6, 0xc8392e, NC); b.box('steel', px - 0.16, 2.2, pz - 0.16, px + 0.16, 2.5, pz + 0.16, 0x222222, NC); } }
    // station: covered platform, benches, lamps, nameboards and a station house with a kiosk
    { const st = rail.station, x = st.x, z = st.z, y = st.y; b.origin(0, y, 0, 0);
      b.box('concrete', x - 36, -0.8, z - 6.4, x + 36, 0.95, z - 2.2, 0xb4ae9e); b.box('paint', x - 36, 0.95, z - 2.45, x + 36, 0.97, z - 2.2, 0xe8d23a, NC);
      for (let u = -28; u <= 28; u += 8) { b.box('steel', x + u - 0.1, 0.95, z - 5.0, x + u + 0.1, 4.4, z - 4.8, 0x3a4048); if (Math.abs(u) <= 24) P.bench(b, x + u + 2.2, 0.95, z - 5.8, true); }
      b.box('roof', x - 30, 4.4, z - 6.6, x + 30, 4.6, z - 2.0, 0x5a3a2e, { bottom: true });
      for (const u of [-30, 30]) { b.box('steel', x + u - 0.08, 0.95, z - 6.2, x + u + 0.08, 3.2, z - 6.04, 0x2a2e32, NC); }
      for (let u = -34; u <= 34; u += 17) P.lamp(b, x + u, 0.95, z - 6.0, 1);
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 160; const cx2 = cv.getContext('2d'); cx2.fillStyle = '#1e3a5c'; cx2.fillRect(0, 0, 1024, 160); cx2.strokeStyle = '#f2efe6'; cx2.lineWidth = 8; cx2.strokeRect(10, 10, 1004, 140);
      cx2.font = '700 96px "Segoe UI", Arial, sans-serif'; cx2.textAlign = 'center'; cx2.textBaseline = 'middle'; cx2.fillStyle = '#f2efe6'; cx2.fillText('IRON CITY', 512, 84);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      for (const u of [-18, 18]) for (const side of [0, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.75), sm); m.position.set(x + u, y + 3.75, z - 4.9 + (side ? -0.03 : 0.03)); m.rotation.y = side ? Math.PI : 0; group.add(m); }
      api.shop(R, x, z - 13, 0, y, { w: 16, d: 9, floors: 1, doors: ['S', 'N'], awning: 0x2e4a7a, wall: 'brick', roof: 'gable', roofColor: 0x5a3a2e });
      b.origin(0, y, 0, 0); for (const u of [-24, 24]) { P.bench(b, x + u, 0, z - 20, true); S.trash(b, x + u + 2.4, 0, z - 19.5); } S.busStop(b, x - 12, 0, z - 22, true);
      // siding with a parked commuter train
      b.origin(0, y, 0, 0); for (let i = 0; i < 5; i++) { const u0 = x - 60 + i * 24, u1 = u0 + 24; b.box('concrete', u0, -1.2, z + 6 - 1.9, u1, 0.06, z + 6 + 1.9, 0x6f675e, NC); b.prop('train/railway_track_straight_free_model', u0, 0.06, z + 6 - gauge / 2, u1, 0.06 + th, z + 6 + gauge / 2, { out: 1, fixed: 1 }); }
      b.box('steel', x - 61, 0.06, z + 5, x - 60, 1.2, z + 7, 0x8a2a22); b.box('steel', x + 60, 0.06, z + 5, x + 61, 1.2, z + 7, 0x8a2a22);
      const cars = [['high_speed_front', 0], ['high_speed_wagon', 0], ['high_speed_wagon', 0], ['high_speed_front', 2]]; let u = x - 30;
      for (const [k, yaw] of cars) { const key = 'train/' + k + '_free_model'; const st2 = A && A.has(key) && A.static(key); if (!st2) continue; const Lc = st2.size.x * TRACK_SC, Wc = st2.size.z * TRACK_SC, Hc = st2.size.y * TRACK_SC;
        b.prop(key, u, 0.25, z + 6 - Wc / 2, u + Lc, 0.25 + Hc, z + 6 + Wc / 2, { out: 1, yaw, fixed: 1 }); b.box(null, u, 0.25, z + 6 - Wc / 2, u + Lc, 0.25 + Hc, z + 6 + Wc / 2, 0, { mat: 2 }); u += Lc + 0.5; }
      b.loot(x - 10, 0.97, z - 4, 1); b.loot(x + 14, 0.97, z - 4, 1); }
    // freight yard on the north side: containers and crates of supplies
    { const fy = rail.freight, y = yAt(fy.s); b.origin(0, y, 0, 0); world.paintRect(2, fy.x - 30, fy.z + 4, fy.x + 30, fy.z + 16, 200, 2);
      world.paintRect(3, fy.x - 32, fy.z + 2, fy.x + 32, fy.z + 18, 0, 2); b.box('concrete', fy.x - 26, -0.6, fy.z + 2.6, fy.x + 26, 1.1, fy.z + 7, 0xa8a292); for (let i = 0; i < 6; i++) { F.crate(b, fy.x - 22 + i * 7.5, 1.1, fy.z + 4.2, 1.0); if (i % 2) F.crate(b, fy.x - 21.8 + i * 7.5, 2.1, fy.z + 4.4, 0.8); }
      for (const k of ['apple_green', 'carrot', 'bread', 'lettuce', 'tomato', 'pumpkin']) { const fx = fy.x + R.range(-20, 20); b.prop('food/' + k + '_free_model', fx, 1.1, fy.z + 5.6, fx + 0.35, 1.45, fy.z + 5.95, { out: 1, uniform: 1 }); }
      b.loot(fy.x - 6, 1.15, fy.z + 5.6, 1); b.loot(fy.x + 9, 1.15, fy.z + 5.6, 1); }
  }

  // ================= SMALL TOWNS: a main street of brownstones, a back row of houses, a little park =================
  const town = (cx0, cz0) => {
    let spot = null; for (let r = 0; r <= 120 && !spot; r += 30) for (let a = 0; a < 6.28 && !spot; a += r ? 0.785 : 7) { const cx = cx0 + Math.cos(a) * r, cz = cz0 + Math.sin(a) * r;
      if (!clear(cx, cz, 76, 40, 8)) continue; const hs = []; for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) hs.push(world.heightAt(cx + i * 36, cz + j * 30)); hs.sort((p, q) => p - q);
      if (hs[0] < 3.8 || hs[hs.length - 1] - hs[0] > 16) continue; let ok = true; for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) if (lineDist(river, cx + i * 36, cz + j * 30) < 55) ok = false; if (ok) spot = [cx, cz, hs[7]]; }
    if (!spot) return; const [cx, cz, y] = spot; const half = 64;
    world.flattenRect(cx - half - 8, cz - 36, cx + half + 8, cz + 36, y, 16); world.paintRect(0, cx - half - 8, cz - 4, cx + half + 8, cz + 4, 255, 1); world.paintRect(2, cx - half - 8, cz - 7.5, cx + half + 8, cz + 7.5, 225, 1); world.paintRect(3, cx - half - 10, cz - 38, cx + half + 10, cz + 38, 0, 3);
    row('x', cx - half, cx + half, cz - 9.5, 0, y, 12); row('x', cx - half, cx + half, cz + 9.5, 2, y, 12);
    b.origin(0, y, 0, 0); for (let u = -half + 6; u <= half - 6; u += 16) { if (Math.abs(u) < 8) continue; P.lamp(b, cx + u, 0, cz - 7, 1); P.lamp(b, cx + u + 8, 0, cz + 7, -1); tree(cx + u + 4, cz - 6.2, 0.6); tree(cx + u + 12, cz + 6.2, 0.6); }
    for (let i = 0; i < 4; i++) { const u = R.range(-half + 8, half - 8); if (Math.abs(u) < 9) continue; b.prop(R.pick(['city/car', 'city/car_2', 'city/suv', 'city/van']), cx + u - 2.3, 0, cz + (i % 2 ? 3.2 : -3.2) - 1, cx + u + 2.3, 1.6, cz + (i % 2 ? 3.2 : -3.2) + 1, { out: 1 }); }
    S.busStop(b, cx - 20, 0, cz + 6.6, true); S.hydrant(b, cx + 24, 0, cz - 6.4); S.trash(b, cx - 30, 0, cz - 6.2); S.mailbox(b, cx + 10, 0, cz + 6.4);
    // back lanes: enterable houses and a corner store behind each row
    for (const sg of [-1, 1]) { api.house(R, cx - 30, cz + sg * 29, sg < 0 ? 0 : 2, y, { w: 10, d: 8 }); api.house(R, cx + 30, cz + sg * 29, sg < 0 ? 0 : 2, y, { w: 10, d: 8 }); }
    api.shop(R, cx + 2, cz - 30, 0, y, { w: 13, d: 9 });
    b.origin(0, y, 0, 0); world.paintRect(3, cx - 6, cz + 22, cx + 10, cz + 36, 255, 1); for (let k = 0; k < 3; k++) tree(cx + R.range(-4, 8), cz + R.range(24, 34), 0.8, 'park'); P.bench(b, cx - 3, 0, cz + 24, true); P.bench(b, cx + 4, 0, cz + 24, true);
    for (let k = 0; k < 4; k++) b.loot(cx + R.range(-half, half), 0.05, cz + R.range(-5, 5), 1);
    // link road to the nearest highway
    let best = null, bd = 1e9; for (const p of roads) for (const q of p) { const d = Math.hypot(q[0] - cx, q[1] - cz); if (d < bd) { bd = d; best = q; } }
    if (best && bd < 360) { const ex = cx + Math.sign(best[0] - cx) * (half + 8), n = Math.ceil(Math.hypot(best[0] - ex, best[1] - cz) / 2); for (let i = 0; i <= n; i++) { const x = ex + (best[0] - ex) * i / n, z = cz + (best[1] - cz) * i / n; world.paintRect(1, x - 2.2, z - 2.2, x + 2.2, z + 2.2, 230, 1); world.paintRect(3, x - 3.5, z - 3.5, x + 3.5, z + 3.5, 0, 1); } }
  };
  for (const [x, z] of [[640, -300], [-640, -90], [210, 700], [-390, 320], [700, 410]]) town(x, z);
  // stand-alone landmark on its own levelled plot beside the nearest road
  const landmark = (type, x0, z0) => { const dm = dims(type); if (!dm) return; const hw = Math.max(dm.W, dm.D) / 2 + 6;
    for (let r = 0; r <= 160; r += 20) for (let a = 0; a < 6.28; a += r ? 0.5 : 7) { const cx = x0 + Math.cos(a) * r, cz = z0 + Math.sin(a) * r; const y = world.heightAt(cx, cz);
      if (y < 4 || world.slopeAt(cx, cz) > 0.25 || lineDist(river, cx, cz) < 50 || lineDist(roads, cx, cz) < hw + 6 || !clear(cx, cz, hw, hw, 6)) continue;
      let lo = 1e9, hi = -1e9; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const h = world.heightAt(cx + i * hw, cz + j * hw); lo = Math.min(lo, h); hi = Math.max(hi, h); } if (hi - lo > 9) continue;
      world.flattenRect(cx - hw, cz - hw, cx + hw, cz + hw, y, 10); world.paintRect(2, cx - hw, cz - hw, cx + hw, cz + hw, 220, 2); world.paintRect(3, cx - hw - 4, cz - hw - 4, cx + hw + 4, cz + hw + 4, 0, 3);
      let best = null, bd = 1e9; for (const p of roads) for (let i = 0; i < p.length - 1; i++) for (let t = 0; t <= 1; t += 0.05) { const qx = p[i][0] + (p[i + 1][0] - p[i][0]) * t, qz = p[i][1] + (p[i + 1][1] - p[i][1]) * t, d = Math.hypot(qx - cx, qz - cz); if (d < bd) { bd = d; best = [qx, qz]; } }
      const face = best ? (Math.abs(best[0] - cx) > Math.abs(best[1] - cz) ? (best[0] > cx ? 1 : 3) : (best[1] > cz ? 0 : 2)) : 0; city(type, cx, cz, face, y);
      if (best) { const n = Math.ceil(bd / 2); for (let i = 0; i <= n; i++) { const x = cx + (best[0] - cx) * i / n, z = cz + (best[1] - cz) * i / n; world.paintRect(0, x - 2.6, z - 2.6, x + 2.6, z + 2.6, 230, 1); world.paintRect(3, x - 4, z - 4, x + 4, z + 4, 0, 1); } }
      b.origin(0, y, 0, 0); for (let k = 0; k < 4; k++) { const a2 = k * 1.57 + 0.6; tree(cx + Math.cos(a2) * (hw - 2), cz + Math.sin(a2) * (hw - 2), 0.8, 'park'); }
      for (let k = 0; k < 3; k++) b.loot(cx + R.range(-hw, hw) * 0.8, 0.05, cz + R.range(-hw, hw) * 0.8, 1); return; } };
  landmark('hospital', 560, -250); landmark('hotel', -330, 260);

  // ================= ROADSIDE HAMLETS: a few houses facing the highway =================
  { let made = 0; for (const road of ROADS) { if (road.t) continue; let acc = 60; for (let s = 0; s < road.p.length - 1; s++) { const [ax, az] = road.p[s], [bx2, bz2] = road.p[s + 1]; const len = Math.hypot(bx2 - ax, bz2 - az), dx = (bx2 - ax) / len, dz = (bz2 - az) / len;
      for (let d = 0; d < len; d += 10) { acc += 10; if (acc < 150 || made > 26) continue; const sg = R.chance(0.5) ? 1 : -1, px = ax + dx * d - dz * 24 * sg, pz = az + dz * d + dx * 24 * sg; const hgt = world.heightAt(px, pz);
        if (hgt < 3.5 || hgt > 70 || world.slopeAt(px, pz) > 0.3 || lineDist(river, px, pz) < 50 || world.locationAt(px, pz) || !clear(px, pz, 18, 18, 6)) continue; acc = 0; made++;
        const toRoad = [dz * sg, -dx * sg], rr = Math.abs(toRoad[0]) > Math.abs(toRoad[1]) ? (toRoad[0] > 0 ? 1 : 3) : (toRoad[1] > 0 ? 0 : 2); // front door towards the road
        const n2 = R.int(1, 3), tx = rr % 2 ? 0 : 1, tz = rr % 2 ? 1 : 0;
        for (let k = 0; k < n2; k++) { const o = (k - (n2 - 1) / 2) * 15, hx = px + tx * o, hz = pz + tz * o; if (!clear(hx, hz, 7, 7, 2)) continue; const y = api.flat(hx, hz, rr, 10, 8); api.house(R, hx, hz, rr, y, { w: R.int(9, 11), d: 8 });
          b.origin(0, y, 0, 0); tree(hx + (tx ? 0 : 1) * R.range(-9, 9) + tx * 8, hz + (tz ? 0 : 1) * R.range(-9, 9) + tz * 8, R.range(0.8, 1.1), 'park'); }
        const y = world.heightAt(px, pz); b.origin(0, y, 0, 0); S.mailbox(b, px + toRoad[0] * 9, 0, pz + toRoad[1] * 9);
        // a modern house with a driveway beside some hamlets (City Pack 2)
        if (R.chance(0.45)) { const o = (n2 / 2 + 1.2) * 15 * (R.chance(0.5) ? 1 : -1), hx = px + tx * o, hz = pz + tz * o, dm = dims('house2'); if (dm && clear(hx, hz, dm.D / 2 + 2, dm.D / 2 + 2, 2) && world.slopeAt(hx, hz) < 0.3) { const hy = api.flat(hx, hz, rr, dm.W, dm.D); city('house2', hx, hz, rr, hy); } } } } } }

  // ================= THE DEAD SECTOR: bombed-out blocks =================
  { const C = L.dust; const ruin = (cx, cz, w, d) => { if (!clear(cx, cz, w / 2 + 2, d / 2 + 2)) return; const y = world.heightAt(cx, cz); world.flattenRect(cx - w / 2 - 3, cz - d / 2 - 3, cx + w / 2 + 3, cz + d / 2 + 3, y, 8); world.paintRect(1, cx - w / 2 - 6, cz - d / 2 - 6, cx + w / 2 + 6, cz + d / 2 + 6, 200, 4); world.paintRect(3, cx - w / 2 - 4, cz - d / 2 - 4, cx + w / 2 + 4, cz + d / 2 + 4, 0, 3);
      const x0 = cx - w / 2, z0 = cz - d / 2; b.origin(x0, y, z0, 0); const wm = R.pick(['brick', 'brick', 'concrete']), wc = wm === 'brick' ? R.pick([0xffffff, 0xd8c8c0, 0xc8b8a8]) : R.pick([0xa8a090, 0x8e8478, 0x9a948a]); const tall = () => R.range(1.2, 9);
      b.box('concrete', -0.3, -2, -0.3, w + 0.3, BASE, d + 0.3, 0x7a766e); const win = (len) => { const a = []; for (let p = 2; p < len - 1.5; p += 3.2) a.push({ p, w: 1.3, s: 0.9, h: 2.2 }); a.push({ p: len / 2, w: 1.5, s: 0, h: 2.3 }); return a; };
      wallRun(b, wm, wc, 'x', 0.15, 0, w * R.range(0.55, 1), BASE, BASE + tall(), win(w), 0x77706a, R); wallRun(b, wm, wc, 'x', d - 0.15, w * R.range(0, 0.35), w, BASE, BASE + tall(), win(w), 0x77706a, R);
      wallRun(b, wm, wc, 'z', 0.15, 0.3, d * R.range(0.6, 1), BASE, BASE + tall(), win(d), 0x77706a, R); wallRun(b, wm, wc, 'z', w - 0.15, d * R.range(0, 0.3), d - 0.3, BASE, BASE + tall(), win(d), 0x77706a, R);
      if (R.chance(0.6)) b.box('concrete', 0.3, 3.1, 0.3, w * R.range(0.4, 0.7), 3.35, d * R.range(0.4, 0.8), 0x8a867c, { bottom: true });
      for (let i = 0; i < 9; i++) { const s = R.range(0.5, 1.8); b.boxR(wm, R.range(0.5, w - 0.5), s * 0.25, R.range(0.5, d - 0.5), s * R.range(1, 2), s * 0.5, s, R.f() * 3, wc, { c: s > 1.2 }); }
      for (let i = 0; i < 3; i++) b.boxR('wood', R.range(1, w - 1), 0.4, R.range(1, d - 1), R.range(2, 4), 0.18, 0.2, R.f() * 3, 0x2a2420, NC);
      b.loot(w * 0.3, BASE + 0.05, d * 0.4, 1); b.loot(w * 0.7, BASE + 0.05, d * 0.65, R.chance(0.3) ? 2 : 1); world.footprints.push({ x0, z0, x1: x0 + w, z1: z0 + d, c: '#7a6a5c' }); };
    for (let i = 0; i < 16; i++) { const a = R.f() * 6.283, r = R.range(40, 175), x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r; if (lineDist(roads, x, z) < 20) continue; ruin(x, z, R.int(10, 16), R.int(8, 12)); } }

  // ================= EAGLE PEAK FORT: stone curtain wall, a keep, a lookout and a radio mast =================
  { const C = L.peak, y = C.h, cx = C.x, cz = C.z, STONE = 0x9a968c; b.origin(0, y, 0, 0); const rr = 19, n = 14;
    for (let i = 0; i < n; i++) { const a0 = i / n * 6.283 + 0.11, a1 = (i + 1) / n * 6.283 + 0.11; const mid = (a0 + a1) / 2; if (Math.abs(Math.sin(mid) - 1) < 0.08) continue; // gate in the south wall
      P.wall(b, cx + Math.cos(a0) * rr, cz + Math.sin(a0) * rr, cx + Math.cos(a1) * rr, cz + Math.sin(a1) * rr, 0, 3.6, STONE); }
    for (const sg of [-1, 1]) { const gx = cx + sg * 4.4, gz = cz + rr - 0.6; b.box('concrete', gx - 1.2, 0, gz - 1.2, gx + 1.2, 5.2, gz + 1.2, 0x8a867c); b.box('concrete', gx - 1.4, 5.2, gz - 1.4, gx + 1.4, 5.6, gz + 1.4, 0x7a766e, NC); }
    b.box('wood', cx - 3.2, 4.4, cz + rr - 1.3, cx + 3.2, 4.9, cz + rr + 0.1, 0x5a4632, { bottom: true });
    b.origin(cx - 7, y, cz - 11, 0); building(b, { R, w: 14, d: 10, floors: 2, fh: 3.2, wall: 'concrete', color: STONE, trim: 0x77736a, kind: 'mil', roofAccess: true, doors: ['S'], floorMat: 'concrete', floorColor: 0xa8a69a, mapColor: '#6a665c', apron: 0, winW: 1.0, sill: 1.1, head: 2.1 });
    b.origin(cx + 9, y, cz + 2, 0); /* lookout */ for (const [u, v] of [[0, 0], [3, 0], [0, 3], [3, 3]]) b.box('wood', u, 0, v, u + 0.25, 7, v + 0.25, 0x5a4632); b.box('wood', -0.3, 7, -0.3, 3.55, 7.2, 3.55, 0x6a5440, { bottom: true }); b.box('roof', -0.5, 9.6, -0.5, 3.75, 9.8, 3.75, 0x4a3a2e, { bottom: true });
    for (const [u, v] of [[0, 0], [3.25, 0], [0, 3.25], [3.25, 3.25]]) b.box('wood', u, 7.2, v, u + 0.12, 9.6, v + 0.12, 0x5a4632, NC); b.box('wood', -0.3, 7.2, -0.3, 3.55, 8.2, -0.2, 0x6a5440); b.box('wood', -0.3, 7.2, 3.45, 3.55, 8.2, 3.55, 0x6a5440); b.loot(1.6, 7.25, 1.6, 2);
    b.origin(0, y, 0, 0); const mx = cx - 12, mz = cz + 6; for (const [u, v] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) b.box('steel', mx + u - 0.07, 0, mz + v - 0.07, mx + u + 0.07, 22, mz + v + 0.07, 0xb03a2e, NC);
    for (let k = 1; k < 7; k++) b.box('steel', mx - 0.95, k * 3.2, mz - 0.95, mx + 0.95, k * 3.2 + 0.08, mz + 0.95, 0xdedad0, NC); b.box(null, mx - 1, 0, mz - 1, mx + 1, 22, mz + 1, 0, { mat: 2 }); b.cyl('emissive', mx, 22, mz, 0.22, 0.4, 0xff4030, 8);
    b.box('steel', cx + 2, 0, cz + 12, cx + 2.12, 10, cz + 12.12, 0x8a8f94, NC); b.box('fabric', cx + 2.12, 8.2, cz + 12.04, cx + 4.6, 9.8, cz + 12.08, 0x2e5a3a, NC);
    for (let i = 0; i < 5; i++) { if (i % 2) F.crate(b, cx + R.range(-12, 12), 0, cz + R.range(-2, 12)); else F.ammoBox(b, cx + R.range(-12, 12), 0, cz + R.range(-2, 12)); }
    world.footprints.push({ x0: cx - rr, z0: cz - rr, x1: cx + rr, z1: cz + rr, c: '#7a766c' }); }

  // ================= MOVING THINGS: trains on the loop, traffic and pedestrians downtown =================
  const life = { t: 0, trains: [], street: null, update: null }; G.townLife = life;
  if (rail && A) { const P2 = rail.pts, n = rail.len;
    const make = (keys, stop) => { const cars = []; for (const k of keys) { const key = 'train/' + k + '_free_model'; if (!A.has(key)) continue; const st = A.static(key); const len = st.size.x * TRACK_SC; const f = A.fitted(key, { length: len }); if (!f) continue; const g = new THREE.Group(); g.add(f); group.add(g); cars.push({ g, len, flip: 0 }); }
      return cars.length ? { cars, s: stop, v: 0, state: 'wait', wait: 6 + R.f() * 4, stop, vmax: 15 } : null; };
    const pax = make(['locomotive_front', 'locomotive_wagon', 'locomotive_passenger_carriage', 'locomotive_passenger_carriage', 'locomotive_passenger_carriage'], rail.station.s + 40);
    const cargo = make(['cargo_train_front', 'cargo_train_container', 'cargo_train_coal_conta', 'cargo_train_wagon', 'cargo_train_container', 'cargo_train_coal_conta'], rail.freight.s + 30);
    for (const t of [pax, cargo]) if (t) life.trains.push(t); if (pax) pax.steam = true;
    const at = (s, out) => { const i = ((Math.floor(s) % n) + n) % n, f = s - Math.floor(s), a = P2[i], c = P2[(i + 1) % n]; out[0] = a[0] + (c[0] - a[0]) * f; out[1] = rail.y[i] + (rail.y[(i + 1) % n] - rail.y[i]) * f; out[2] = a[1] + (c[1] - a[1]) * f; return out; };
    const pa = [0, 0, 0], pb = [0, 0, 0];
    life.placeTrain = (T) => { let s = T.s; for (const c of T.cars) { const mid = s - c.len / 2; at(mid + c.len * 0.36, pa); at(mid - c.len * 0.36, pb);
        c.g.position.set((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 + 0.25, (pa[2] + pb[2]) / 2); c.g.rotation.y = Math.atan2(pa[0] - pb[0], pa[2] - pb[2]) + (c.flip ? Math.PI : 0); s -= c.len + 0.6; } };
    life.trains.forEach(T => life.placeTrain(T));
    life.ahead = (T) => ((T.stop - T.s) % n + n) % n;
  }
  { const C = L.iron, H = 64; const ringAt = (t) => { const u = ((t % 1) + 1) % 1 * 4, k = Math.floor(u), f = u - k; const Pq = [[-H, -H], [H, -H], [H, H], [-H, H]]; const a = Pq[k % 4], c = Pq[(k + 1) % 4];
      return { x: C.x + a[0] + (c[0] - a[0]) * f, z: C.z + a[1] + (c[1] - a[1]) * f, dx: c[0] - a[0], dz: c[1] - a[1] }; };
    const cars = []; const carSrc = ['city/car', 'cbits/taxi_free_model', 'city/car_2', 'city/sports_car', 'cbits/police_car_free_model', 'city/suv', 'city2/convertible_free_model', 'city/van', 'cbits/stationwagon_free_model', 'city/pickup_truck', 'city/bus', 'city2/mitsubishi_l200_free_model'];
    if (A) for (let i = 0; i < 12; i++) { const k = carSrc[i % carSrc.length]; if (!A.has(k)) continue; const f = A.fitted(k, { length: k === 'city/bus' ? 10 : 4.4 }); if (!f) continue; const g = new THREE.Group(); g.add(f); group.add(g); cars.push({ g, t: R.f(), sp: R.range(0.012, 0.02) * (i % 2 ? 1 : -1) }); }
    const walkers = [];
    if (A) for (let i = 0; i < 18; i++) { const key = PEOPLE_KEYS[i % PEOPLE_KEYS.length]; if (!A.has(key)) continue; const w = new SoldierGLB(G, 0, key); group.add(w.group); w.group.visible = false; const sign = i % 2 ? 1 : -1; walkers.push({ w, t: R.f(), sp: (R.range(1.2, 1.7) / 512) * sign, off: R.range(5.6, 6.8) * (R.chance(0.5) ? 1 : -1) }); }
    life.street = { cars, walkers, ringAt }; }
  life.update = (dt) => { life.t += dt; const cam = G.gfx.camera.position;
    if (life.street) { const St = life.street;
      for (const c of St.cars) { c.t += c.sp * dt; const p = St.ringAt(c.t), sg = Math.sign(c.sp), ln = Math.hypot(p.dx, p.dz) || 1, lane = 2.2 * sg; const x = p.x - p.dz / ln * lane, z = p.z + p.dx / ln * lane; c.g.position.set(x, G.world.heightAt(x, z) + 0.05, z); c.g.rotation.y = Math.atan2(p.dx * sg, p.dz * sg); }
      for (const k of St.walkers) { k.t += k.sp * dt; const base = St.ringAt(k.t), ln = Math.hypot(base.dx, base.dz) || 1, sg = Math.sign(k.sp);
        const x = base.x - base.dz / ln * k.off, z = base.z + base.dx / ln * k.off; const near = Math.hypot(x - cam.x, z - cam.z) < 200; k.w.group.visible = near; if (!near) continue;
        k.w.group.position.set(x, G.world.heightAt(x, z), z); k.w.group.rotation.y = Math.atan2(base.dx * sg, base.dz * sg);
        k.w.animate({ dt, mode: 'ground', speed: Math.abs(k.sp) * 512, moveAng: 0, stance: 0, aiming: false, pitch: 0, weapon: 'none', reload: -1, sprint: false, fired: false, hurt: false, bank: 0, handL: null, handR: null }); } }
    for (const T of life.trains) { // run, brake for the stop, dwell, pull away
      if (T.state === 'wait') { T.wait -= dt; if (T.wait <= 0) { T.state = 'run'; T.leave = 60; const c0 = T.cars[0].g.position; G.audio.horn && G.audio.horn(c0.x, c0.y + 3, c0.z); if (T.steam) G.audio.steam && G.audio.steam(c0.x, c0.y + 1, c0.z); } }
      else { const d = life.ahead(T); const braking = T.leave <= 0 && d < 220; const vt = braking ? Math.min(T.vmax, Math.sqrt(2 * 0.7 * Math.max(0, d - 0.3)) + 0.4) : T.vmax; T.v += Math.max(-1.6 * dt, Math.min(0.7 * dt, vt - T.v)); const ds = T.v * dt; T.s += ds; if (T.leave > 0) T.leave -= ds;
        if (braking && d < 0.6) { T.s = T.stop; T.v = 0; T.state = 'wait'; T.wait = 14; } }
      life.placeTrain(T);
      if (T.steam) { T.puff = (T.puff || 0) - dt; const c0 = T.cars[0].g; if (T.puff <= 0 && Math.hypot(c0.position.x - cam.x, c0.position.z - cam.z) < 320) { T.puff = T.v > 1 ? 0.07 : 0.3; const ya = c0.rotation.y, fx = Math.sin(ya), fz = Math.cos(ya), S = G.fx.smoke, g = 0.8 + Math.random() * 0.18;
          S.spawn(c0.position.x + fx * 3.3, c0.position.y + 4.7, c0.position.z + fz * 3.3, -fx * T.v * 0.25 + (Math.random() - 0.5) * 0.4, 2.2 + Math.random() * 1.6, -fz * T.v * 0.25 + (Math.random() - 0.5) * 0.4, g, g, g, 0.62, 1.1 + Math.random() * 0.8, 3.6, 2.0, -0.4, 0.35);
          S.spawn(c0.position.x + fx * 3.3, c0.position.y + 5.2, c0.position.z + fz * 3.3, -fx * T.v * 0.2, 3 + Math.random(), -fz * T.v * 0.2, g * 0.6, g * 0.6, g * 0.62, 0.5, 0.8, 2.4, 1.6, -0.5, 0.4);
          if (T.v > 0.3 && T.v < 6) for (const sd of [-1, 1]) S.spawn(c0.position.x + fx * 2 + fz * sd * 1.3, c0.position.y + 0.6, c0.position.z + fz * 2 - fx * sd * 1.3, fz * sd * 1.6, 0.4, -fx * sd * 1.6, 0.95, 0.95, 0.97, 0.3, 0.4, 0.9, 1.4, -0.2, 1.5); } }
      { const Pq = G.player, c0 = T.cars[0]; if (Pq && Pq.alive && T.v > 2 && c0 && Pq.shakeCam) { let dm = 1e9; for (const c of T.cars) dm = Math.min(dm, Math.hypot(Pq.pos.x - c.g.position.x, Pq.pos.z - c.g.position.z)); if (dm < 38) Pq.shakeCam((1 - dm / 38) * 0.5 * Math.min(1, T.v / 10)); } }
      // nobody stands inside a moving train: push the player clear of the cars
      const Pl = G.player; if (Pl && Pl.alive && T.v > 0.5) for (const c of T.cars) { const dx = Pl.pos.x - c.g.position.x, dz = Pl.pos.z - c.g.position.z; if (Math.abs(Pl.pos.y - c.g.position.y) > 4 || dx * dx + dz * dz > (c.len * 0.6) ** 2) continue;
        const ya = c.g.rotation.y, fx = Math.sin(ya), fz = Math.cos(ya), along = dx * fx + dz * fz, side = dx * fz - dz * fx; if (Math.abs(along) < c.len / 2 && Math.abs(side) < 1.9) { const push = (1.95 - Math.abs(side)) * Math.sign(side || 1); Pl.pos.x += fz * push; Pl.pos.z -= fx * push;
          // struck by a moving train: damage grows with speed, and you are thrown clear
          if (T.v > 4 && (Pl._trainT || 0) < life.t) { Pl._trainT = life.t + 1.2; Pl.damage(T.v * 5.5, null, 'body', 'train', fz * Math.sign(side || 1), -fx * Math.sign(side || 1)); Pl.vel.x += fz * Math.sign(side || 1) * T.v * 0.7 + fx * T.v * 0.4; Pl.vel.z += -fx * Math.sign(side || 1) * T.v * 0.7 + fz * T.v * 0.4; Pl.vel.y = Math.max(Pl.vel.y || 0, 3.5); Pl.shakeCam(1.4); G.ui.toast('HIT BY A TRAIN'); G.audio.vehicleHit && G.audio.vehicleHit(Pl.pos.x, Pl.pos.y, Pl.pos.z); } } } }
  };
}
