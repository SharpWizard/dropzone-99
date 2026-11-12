// Layouts for the ten named locations of Dropzone Island + bridges and roadside props.
import * as THREE from 'three';
import { GeoBatch } from '../rendering/GeoBatch.js';
import { RNG } from '../utils/math.js';
import { BRIDGES, BRIDGE_Y, ROADS } from './WorldData.js';
import { prepareTown, buildTown } from './Town.js';
import { building, hall, watchtower, hangar, container, stairs, slab, wallRun, F, P, S, BASE } from './Buildings.js';

const WALLS = [0xe8dcc4, 0xd8c8b0, 0xc9d2d6, 0xe0d0b8, 0xcfc0a8, 0xb8c4b8, 0xd9b8a0];
const ROOFS = [0x7a4a3c, 0x4a5058, 0x5a4a3a, 0x6a3a34, 0x3e4a44];
const SOUTH = 0, EAST = 1, NORTH = 2, WEST = 3;

export function buildLocations(G) {
  const { world, colliders, gfx, mats } = G; const group = new THREE.Group(); group.name = 'locations'; gfx.scene.add(group);
  const L = Object.fromEntries(world.locations.map(l => [l.id, l]));
  prepareTown(G); // railway corridor: shape the ground before anything stands on it
  const veh = (x, z, yaw, type) => world.vehicleSpots.push({ x, z, yaw, type });
  let b;
  // place footprint (w x d) centred at world cx,cz with rotation r (door side 'S' faces: 0 +z, 1 +x, 2 -z, 3 -x)
  const site = (cx, cz, r, w, d, y) => { const hx = w / 2, hz = d / 2; const ox = r === 0 ? hx : r === 1 ? hz : r === 2 ? -hx : -hz, oz = r === 0 ? hz : r === 1 ? -hx : r === 2 ? -hz : hx; b.origin(cx - ox, y === undefined ? world.heightAt(cx, cz) : y, cz - oz, r); };
  const free = (y = 0) => b.origin(0, y, 0, 0);
  const flat = (cx, cz, r, w, d) => { const y = world.heightAt(cx, cz); const hw = (r % 2 ? d : w) / 2 + 1.5, hd = (r % 2 ? w : d) / 2 + 1.5; world.flattenRect(cx - hw, cz - hd, cx + hw, cz + hd, y, 7); return y; };
  const begin = (name) => { b = new GeoBatch(colliders, world); b.props = G.props; b.region = name; };
  const end = (name) => { b.build(group, mats, name); };

  const house = (R, cx, cz, r, y, o = {}) => { const w = o.w || R.int(9, 12), d = o.d || R.int(7, 9); site(cx, cz, r, w, d, y);
    const wm = R.pick(['plaster', 'plaster', 'brick', 'wood']); building(b, { R, w, d, floors: o.floors || (R.chance(0.45) ? 2 : 1), wall: wm, color: wm === 'plaster' ? R.pick(WALLS) : wm === 'wood' ? R.pick([0xb09070, 0x9aa49a, 0xc8b89a, 0x8a6a50]) : 0xffffff, roof: 'gable', roofColor: R.pick(ROOFS), porch: R.chance(0.5), doors: ['S', 'N'], kind: 'home', mapColor: '#9a8f7c', ...o }); };
  const apartment = (R, cx, cz, r, y, o = {}) => { const w = o.w || R.int(18, 24), d = o.d || 13; site(cx, cz, r, w, d, y);
    const wm = R.pick(['concrete', 'brick', 'plaster']); building(b, { R, w, d, floors: o.floors || R.int(3, 5), fh: 3.1, wall: wm, color: wm === 'plaster' ? R.pick(WALLS) : wm === 'concrete' ? R.pick([0xd0ccc0, 0xbcc4c8, 0xc8beb0]) : 0xffffff, balcony: true, roofAccess: true, doors: ['S', 'N'], kind: 'home', floorMat: 'concrete', floorColor: 0xc4c0b4, mapColor: '#8a8d92', ...o }); };
  const shop = (R, cx, cz, r, y, o = {}) => { const w = o.w || R.int(12, 15), d = o.d || 9; site(cx, cz, r, w, d, y);
    building(b, { R, w, d, floors: o.floors || 1, fh: 3.6, wall: R.pick(['brick', 'plaster']), color: R.pick(WALLS), winW: 2.4, sill: 0.55, head: 2.7, winEvery: 4, awning: R.pick([0x9a3a2e, 0x2e5a4a, 0x2e4a7a, 0xb8902e]), kind: 'store', doors: ['S'], floorMat: 'concrete', floorColor: 0xcac6ba, mapColor: '#96887a', ...o }); };

  // ================= IRON CITY =================
  begin('iron'); {
    const C = L.iron, R = new RNG(101), y = C.h, P64 = 64;
    for (let k = -2; k <= 2; k++) { world.paintRect(0, C.x - 168, C.z + k * P64 - 4.5, C.x + 168, C.z + k * P64 + 4.5, 255, 1); world.paintRect(0, C.x + k * P64 - 4.5, C.z - 168, C.x + k * P64 + 4.5, C.z + 168, 255, 1);
      world.paintRect(3, C.x - 168, C.z + k * P64 - 7, C.x + 168, C.z + k * P64 + 7, 0, 2); world.paintRect(3, C.x + k * P64 - 7, C.z - 168, C.x + k * P64 + 7, C.z + 168, 0, 2); }
    for (let bj = 0; bj < 4; bj++) for (let bi = 0; bi < 4; bi++) {
      const bx = C.x - 96 + bi * P64, bz = C.z - 96 + bj * P64; const central = (bi === 1 || bi === 2) && (bj === 1 || bj === 2);
      const kind = central ? (bi === bj ? 'tower' : 'mixed') : R.pick(['mixed', 'mixed', 'mixed', 'park', 'lot', 'houses']);
      if (central) continue; // the four central blocks are the downtown of Town.js
      free(y);
      for (const [u, v] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) P.lamp(b, bx + u, 0, bz + v, u < 0 ? 1 : -1);
      S.light(b, bx - 28.5, 0, bz - 28.5); S.light(b, bx + 28.5, 0, bz + 28.5); S.hydrant(b, bx + R.range(-20, 20), 0, bz - 28); S.trash(b, bx - 28, 0, bz + R.range(-18, 18)); S.trash(b, bx + 28, 0, bz + R.range(-18, 18));
      if (R.chance(0.5)) S.mailbox(b, bx + 28, 0, bz - R.range(8, 20)); if (R.chance(0.4)) S.busStop(b, bx + R.range(-14, 8), 0, bz + 27.6, true); if (R.chance(0.5)) S.planter(b, bx + R.range(-20, 14), 0, bz - 28.4, true); if (R.chance(0.35)) S.power(b, bx - 28.6, 0, bz + R.range(-10, 10)); if (R.chance(0.5)) S.bags(b, bx + R.range(-20, 20), 0, bz + 1);
      for (let i = 0; i < 3; i++) if (R.chance(0.4)) S.cone(b, bx + 30 + R.range(0, 3), 0, bz + R.range(-24, 24));
      if (R.chance(0.3)) S.atm(b, bx - 26.6, 0, bz + 24.6);
      if (kind === 'park') { for (let i = 0; i < 4; i++) P.bench(b, bx + R.range(-18, 18), 0, bz + R.range(-18, 18), R.chance(0.5)); b.cyl('concrete', bx, 0, bz, 3.2, 0.5, 0xa8a49a, 16, { c: true }); b.cyl('concrete', bx, 0.5, bz, 0.5, 2.2, 0x9a968c, 10, { c: true }); world.paintCircle(2, bx, bz, 7, 200); world.paintRect(1, bx - 24, bz - 1.2, bx + 24, bz + 1.2, 200, 1); world.paintRect(1, bx - 1.2, bz - 24, bx + 1.2, bz + 24, 200, 1); b.loot(bx + 2, 0.05, bz + 4.5, 1); b.loot(bx - 12, 0.05, bz + 9, 1); continue; }
      world.paintRect(2, bx - 27, bz - 27, bx + 27, bz + 27, 235, 1.5); world.paintRect(3, bx - 27, bz - 27, bx + 27, bz + 27, 0, 1);
      if (kind === 'lot') { world.paintRect(0, bx - 23, bz - 23, bx + 23, bz + 23, 230, 1); for (let i = 0; i < 5; i++) P.wreck(b, bx + R.range(-19, 14), 0, bz - 18 + i * 8.5, R, true); for (let i = 0; i < 4; i++) P.barrier(b, bx - 23 + i * 6, 0, bz + 22, true); P.dumpster(b, bx + 18, 0, bz - 22, R); veh(bx - 8, bz + 14, 0, R.pick(['sedan', 'bike'])); shop(R, bx + 15, bz + 17, WEST, y, { w: 12, d: 8 }); continue; }
      if (kind === 'tower') { apartment(R, bx, bz - 4, SOUTH, y, { w: 26, d: 22, floors: 6 + bi, wall: 'concrete', color: 0xc4ccd0, winEvery: 2.9 }); free(y); for (let i = 0; i < 3; i++) P.barrier(b, bx - 10 + i * 8, 0, bz + 18, true); P.sandbags(b, bx - 20, 0, bz + 14, false, 3.2, 4); continue; }
      const lot = (north) => { const r = north ? NORTH : SOUTH; const zc = (d) => north ? bz - 23 + d / 2 : bz + 23 - d / 2;
        if (kind === 'houses') { for (const u of [-13, 13]) house(R, bx + u, zc(8), r, y, { w: 10, d: 8 }); return; }
        const t = R.f(); if (t < 0.4) apartment(R, bx, zc(13), r, y); else if (t < 0.7) { shop(R, bx - 13, zc(9), r, y); shop(R, bx + 12, zc(9), r, y, { floors: 2 }); } else { apartment(R, bx - 12, zc(12), r, y, { w: 18, d: 12, floors: R.int(2, 4) }); shop(R, bx + 14, zc(9), r, y, { w: 12 }); } };
      lot(true); lot(false); free(y);
      P.dumpster(b, bx + R.range(-18, 12), 0, bz - 0.5, R); F.crate(b, bx + R.range(-20, 18), 0, bz + R.range(-2, 1)); b.loot(bx + R.range(-15, 15), 0.05, bz, 1);
      if (R.chance(0.5)) P.tires(b, bx + R.range(-20, 20), 0, bz + 1.5, 3);
      for (let i = 0; i < 3; i++) S.clutter(b, bx + R.range(-22, 20), 0, bz + R.range(-2.5, 1.5), R); if (R.chance(0.3)) S.brickWall(b, bx + R.range(-20, 14), 0, bz - 2.2, true);
    }
    free(y);
    for (let i = 0; i < 16; i++) { const k = R.int(-2, 2), along = R.range(-150, 150); if (Math.abs(along % 64) < 9) continue; if (R.chance(0.5)) P.wreck(b, C.x + along, 0, C.z + k * 64 + R.range(-3.5, 1.5), R, true); else P.wreck(b, C.x + k * 64 + R.range(-3.5, 1.5), 0, C.z + along, R, false); }
    for (let i = 0; i < 10; i++) { const k = R.int(-2, 2), along = R.range(-150, 150); if (R.chance(0.5)) P.barrier(b, C.x + along, 0, C.z + k * 64 + R.range(-4, 3), R.chance(0.5)); else P.sandbags(b, C.x + k * 64 + R.range(-4, 2), 0, C.z + along, R.chance(0.5)); }
    if (G.assets && G.assets.has('building/large_building_b')) { const keep = [b.ox, b.oy, b.oz, b.rot]; b.origin(0, 0, 0, 0); b.prop('building/large_building_b', C.x - 226, 0, C.z - 206, C.x - 196, 14, C.z - 176, { out: 1 }); b.prop('building/large_building_a', C.x + 178, 0, C.z + 128, C.x + 204, 13, C.z + 156, { out: 1 }); b.prop('building/building_red', C.x + 200, 0, C.z - 150, C.x + 226, 11, C.z - 124, { out: 1 }); b.origin(keep[0], keep[1], keep[2], keep[3]); }
    S.bus(b, C.x + 70, 0, C.z - 3.6, true); S.bus(b, C.x - 3.4, 0, C.z - 150, false); S.billboard(b, C.x - 158, 0, C.z + 20, false); S.billboard(b, C.x + 150, 0, C.z - 80, false);
    veh(C.x + 36, C.z + 2, Math.PI / 2, 'sedan'); veh(C.x - 100, C.z - 62, 0, 'jeep'); veh(C.x + 3, C.z + 110, 0, 'bike'); veh(C.x - 60, C.z + 66, Math.PI / 2, 'sedan');
  } end('iron');

  // ================= RIVERSIDE TOWN =================
  begin('river'); {
    const C = L.river, R = new RNG(202), y = C.h; world.paintRect(3, C.x - 110, C.z - 8, C.x + 95, C.z + 8, 0, 3);
    for (let i = 0; i < 8; i++) { const x = C.x - 98 + i * 24; if (R.chance(0.88)) house(R, x, C.z - 17, SOUTH, y); if (R.chance(0.88)) house(R, x + 6, C.z + 17, NORTH, y); }
    for (let i = 0; i < 5; i++) { const x = C.x - 80 + i * 30; house(R, x, C.z - 48, SOUTH, y, { floors: 1 }); if (i % 2) house(R, x, C.z + 50, NORTH, y); }
    shop(R, C.x + 20, C.z + 48, NORTH, y, { w: 16, floors: 2 }); apartment(R, C.x - 30, C.z + 52, NORTH, y, { w: 18, d: 11, floors: 3 });
    free(y);
    world.paintRect(1, C.x - 100, C.z - 36, C.x + 80, C.z - 33, 220, 1.5); world.paintRect(1, C.x - 100, C.z + 33, C.x + 80, C.z + 36, 220, 1.5);
    for (let i = 0; i < 9; i++) { P.lamp(b, C.x - 100 + i * 24, 0, C.z - 6.5, 1); P.pole(b, C.x - 90 + i * 24, 0, C.z + 7); }
    for (let i = 0; i < 6; i++) P.fence(b, C.x - 104 + i * 30, C.z - 30, C.x - 86 + i * 30, C.z - 30, 0, 1.1);
    // riverside boathouse + jetty
    const jx = C.x + 100, jz = C.z + 44; site(jx, jz, WEST, 10, 7, y); hall(b, { R, w: 10, d: 7, h: 3.6, wall: 'wood', color: 0x8a7458, roofMat: 'roof', roofColor: 0x4a5058, doors: ['S', 'N'], doorW: 3, doorH: 2.6, fill: 'storage', mapColor: '#8a7458' });
    free(0); b.box('wood', C.x + 104, 0.35, jz + 8, C.x + 124, 0.6, jz + 10.4, 0x7a6248); for (let i = 0; i < 6; i++) b.box('wood', C.x + 105 + i * 3.6, -3, jz + 8, C.x + 105.25 + i * 3.6, 1.2, jz + 8.25, 0x4a3a2a, { c: false });
    b.box('wood', C.x + 96, 0.6, jz + 8, C.x + 104.5, y + 0.05, jz + 10.4, 0x7a6248);
    veh(C.x - 60, C.z + 3, Math.PI / 2, 'sedan'); veh(C.x + 30, C.z - 3, -Math.PI / 2, 'bike'); veh(C.x - 100, C.z - 40, 0, 'jeep');
  } end('river');

  // ================= GREENFIELD FARMS (Farm Buildings Bundle + Food Pack) =================
  begin('green'); {
    const C = L.green, R = new RNG(303), y = C.h, A = G.assets;
    // a farm model scaled uniformly to `width` (m) with its front facing `face` (0 +z, 1 +x, 2 -z, 3 -x); solid
    const farm = (n, cx, cz, face, width, solid = true) => { const key = 'farm/' + n + '_free_model'; const st = A && A.has(key) && A.static(key); if (!st) return false; const s = width / st.size.x, W = width, D = st.size.z * s, H = st.size.y * s;
      const X = face % 2 ? D : W, Z = face % 2 ? W : D, x0 = cx - X / 2, z0 = cz - Z / 2; free(y); b.prop(key, x0, 0, z0, x0 + X, H, z0 + Z, { out: 1, yaw: face, fixed: 1 });
      if (solid) b.box(null, x0 + 0.3, 0, z0 + 0.3, x0 + X - 0.3, H * 0.8, z0 + Z - 0.3, 0, { mat: 1 }); b.box('concrete', x0 - 0.2, -1.5, z0 - 0.2, x0 + X + 0.2, 0.08, z0 + Z + 0.2, 0x8a7a64);
      world.paintRect(3, x0 - 2, z0 - 2, x0 + X + 2, z0 + Z + 2, 0, 2); world.paintRect(1, x0 - 3, z0 - 3, x0 + X + 3, z0 + Z + 3, 170, 3); world.footprints.push({ x0, z0, x1: x0 + X, z1: z0 + Z, c: '#9a4a3e' }); return true; };
    // fence line of model panels (falls back to the procedural fence), with a collider
    const fence = (x0, z0, x1, z1) => { const key = R.chance(0.5) ? 'farm/fence_free_model' : 'farm/fence_free_model_b'; if (!(A && A.has(key))) { P.fence(b, x0, z0, x1, z1, 0); return; } const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = ax ? Math.abs(x1 - x0) : Math.abs(z1 - z0), n = Math.max(1, Math.round(len / 5.9)), pl = len / n;
      const a0 = ax ? Math.min(x0, x1) : Math.min(z0, z1); for (let i = 0; i < n; i++) { const u = a0 + i * pl; if (ax) b.prop(key, u, 0, z0 - 0.1, u + pl, 1.15, z0 + 0.1, { out: 1, fixed: 1 }); else b.prop(key, x0 - 0.1, 0, u, x0 + 0.1, 1.15, u + pl, { out: 1, yaw: 1, fixed: 1 }); }
      if (ax) b.box(null, a0, 0, z0 - 0.12, a0 + len, 1.1, z0 + 0.12, 0, { mat: 1 }); else b.box(null, x0 - 0.12, 0, a0, x0 + 0.12, 1.1, a0 + len, 0, { mat: 1 }); };
    const crop = (key, X0, Z0, X1, Z1, size, step) => { const st = A && A.has(key) && A.static(key); if (!st) return; const s = size / Math.max(st.size.x, st.size.z), h = st.size.y * s, w = st.size.x * s, d = st.size.z * s;
      for (let z = Z0 + 3; z < Z1 - 2; z += 4) for (let x = X0 + 3; x < X1 - 2; x += step) { if (!R.chance(0.82)) continue; const px = x + R.range(-0.4, 0.4), pz = z + 0.8 + R.range(-0.3, 0.3); b.prop(key, px - w / 2, 0, pz - d / 2, px + w / 2, h, pz + d / 2, { out: 1, yaw: R.int(0, 3), fixed: 1 }); } };
    const fields = [[-150, -120, -50, -30, 0], [-140, 40, -40, 130, 1], [40, -130, 150, -40, 1], [60, 50, 150, 140, 0]];
    fields.forEach(([x0, z0, x1, z1, plow], fi) => { free(y); const X0 = C.x + x0, Z0 = C.z + z0, X1 = C.x + x1, Z1 = C.z + z1;
      if (plow) { for (let z = Z0 + 2; z < Z1 - 2; z += 4) world.paintRect(1, X0 + 2, z, X1 - 2, z + 1.6, 255, 0.8); if (fi === 2) crop('food/pumpkin_free_model', X0, Z0, X1, Z1, 0.62, 2.6); else { crop('food/lettuce_free_model', X0, Z0, (X0 + X1) / 2, Z1, 0.5, 2.0); crop('food/broccoli_free_model', (X0 + X1) / 2, Z0, X1, Z1, 0.42, 2.0); } }
      else { world.paintRect(1, X0, Z0, X1, Z1, 90, 3); for (let i = 0; i < 9; i++) { const hx = R.range(X0 + 4, X1 - 4), hz = R.range(Z0 + 4, Z1 - 4); b.cylH('fabric', hx, 0.75, hz, 1.5, 0.75, 'x', 0xc8a850, 12); b.box(null, hx, 0, hz - 0.7, hx + 1.5, 1.4, hz + 0.7, 0, { mat: 3 }); } }
      world.paintRect(3, X0, Z0, X1, Z1, plow ? 20 : 120, 2);
      fence(X0, Z0, X1, Z0); fence(X0, Z1, X1, Z1); fence(X0, Z0, X0, Z1); fence(X1, Z0, X1, (Z0 + Z1) / 2 - 3); fence(X1, (Z0 + Z1) / 2 + 3, X1, Z1); });
    // farmhouses (enterable, furnished)
    house(R, C.x - 12, C.z - 26, SOUTH, y, { w: 12, d: 9, floors: 2, wall: 'wood', color: 0xd8d2c4, porch: true, roofColor: 0x7a3a30 }); house(R, C.x + 28, C.z + 22, WEST, y, { floors: 1, wall: 'wood', color: 0xe8e0cc, porch: true }); house(R, C.x - 28, C.z + 60, EAST, y, { floors: 2, wall: 'plaster', color: 0xe8dcc4 });
    // barns, silos, windmill, coops (procedural barns when the models are missing)
    if (!farm('big_barn', C.x + 20, C.z - 62, SOUTH, 16)) { site(C.x + 20, C.z - 62, SOUTH, 16, 22, y); hall(b, { R, w: 16, d: 22, h: 5, wall: 'wood', color: 0x9a3a2e, roofMat: 'metal', roofColor: 0x8a8f94, rise: 4.2, doors: ['S', 'N'], fill: 'barn', mezz: false, mapColor: '#9a4a3e' }); }
    if (!farm('barn', C.x - 62, C.z + 14, EAST, 14)) { site(C.x - 62, C.z + 14, EAST, 14, 18, y); hall(b, { R, w: 14, d: 18, h: 4.6, wall: 'wood', color: 0x7a6248, roofMat: 'metal', roofColor: 0x7a6a5a, rise: 3.6, doors: ['S'], fill: 'barn', mapColor: '#7a6248' }); }
    site(C.x + 60, C.z + 8, WEST, 18, 12, y); hall(b, { R, w: 18, d: 12, h: 4.2, wall: 'metal', color: 0xa8b0a8, doors: ['S'], fill: 'storage', mapColor: '#8a9088' });
    farm('silo_house', C.x + 34, C.z - 60, WEST, 9); farm('silo', C.x + 34, C.z - 47, WEST, 6.4); farm('open_barn', C.x + 60, C.z - 24, WEST, 12, false); farm('small_barn', C.x - 64, C.z - 18, EAST, 11);
    farm('tower_windmill', C.x - 22, C.z + 22, SOUTH, 12); farm('chickencoop', C.x - 27, C.z - 25, EAST, 3.8); farm('chickencoop', C.x - 27, C.z - 18, EAST, 3.8);
    free(y);
    // water tower
    const tx = C.x - 40, tz = C.z - 60; for (const [u, v] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.box('steel', tx + u - 0.12, 0, tz + v - 0.12, tx + u + 0.12, 9, tz + v + 0.12, 0x5a5a56); b.cyl('metal', tx, 9, tz, 3.2, 3.6, 0x9aa4a0, 14, { c: false }); b.cyl('metal', tx, 12.6, tz, 3.2, 1.2, 0x8a9490, 14, { r2: 0.2 });
    world.paintRect(1, C.x - 70, C.z - 3, C.x + 70, C.z + 3, 230, 2); world.paintRect(1, C.x - 3, C.z - 70, C.x + 3, C.z + 70, 230, 2); world.paintCircle(1, C.x, C.z, 22, 200);
    // farm market + food supply depot at the crossroads: stalls of produce, crates of supplies (loot tier 3 = food)
    const stall = (sx, sz, ax) => { const X = ax ? 3.2 : 1.4, Z = ax ? 1.4 : 3.2; b.box('wood', sx, 0.85, sz, sx + X, 0.92, sz + Z, 0x8a6a48); for (const [u, v] of [[0, 0], [X - 0.1, 0], [0, Z - 0.1], [X - 0.1, Z - 0.1]]) b.box('wood', sx + u, 0, sz + v, sx + u + 0.1, 2.4, sz + v + 0.1, 0x6a5038, { c: false });
      b.box('fabric', sx - 0.2, 2.4, sz - 0.2, sx + X + 0.2, 2.5, sz + Z + 0.2, R.pick([0xb83a2e, 0x2e6a4a, 0xd8a83a, 0x2e5a8a]), { c: false, bottom: true }); b.box(null, sx, 0, sz, sx + X, 0.92, sz + Z, 0, { mat: 1 });
      const goods = ['apple_green', 'tomato', 'carrot', 'bread', 'pumpkin', 'lettuce', 'banana', 'eggplant', 'pepper_green', 'broccoli', 'turnip', 'avocado', 'croissant', 'bottle'];
      for (let i = 0; i < 9; i++) { const k = 'food/' + R.pick(goods) + '_free_model', u = (i % 3 + 0.5) / 3, v = (Math.floor(i / 3) + 0.5) / 3, fx = sx + u * X - 0.16, fz = sz + v * Z - 0.16; b.prop(k, fx, 0.92, fz, fx + 0.32, 1.22, fz + 0.32, { out: 1, uniform: 1 }); }
      b.loot(sx + X / 2, 0.95, sz + Z / 2, 3); };
    stall(C.x + 8, C.z + 6, true); stall(C.x + 12.4, C.z + 6, true); stall(C.x - 11, C.z - 10, false); stall(C.x - 11, C.z + 7, false);
    for (let i = 0; i < 5; i++) { const cx = C.x + 8 + R.range(0, 9), cz = C.z - 12 + R.range(-2, 2); F.crate(b, cx, 0, cz, 1.0); const k = 'food/' + R.pick(['apple_green', 'carrot', 'tomato', 'pumpkin', 'bread']) + '_free_model'; b.prop(k, cx + 0.3, 1.0, cz + 0.3, cx + 0.7, 1.35, cz + 0.7, { out: 1, uniform: 1 }); b.loot(cx + 0.5, 1.02, cz + 0.5, 3); }
    P.tires(b, C.x + 8, 0, C.z - 20, 4); P.wreck(b, C.x - 14, 0, C.z + 30, R, true);
    veh(C.x + 6, C.z + 16, 1, 'jeep'); veh(C.x - 26, C.z - 6, 2, 'bike');
  } end('green');

  // ================= BLACKRIDGE MILITARY BASE =================
  begin('base'); {
    const C = L.base, R = new RNG(404), y = C.h, HW = 105, HD = 92; free(y);
    world.paintRect(2, C.x - HW, C.z - HD, C.x + HW, C.z + HD, 210, 4); world.paintRect(3, C.x - HW - 6, C.z - HD - 6, C.x + HW + 6, C.z + HD + 6, 0, 4);
    world.paintRect(0, C.x - HW - 30, C.z + 20, C.x + 40, C.z + 30, 255, 1.5); world.paintRect(0, C.x - 30, C.z - 60, C.x - 20, C.z + HD + 20, 255, 1.5); world.paintRect(0, C.x + 20, C.z - 70, C.x + 80, C.z - 20, 240, 2);
    const seg = (x0, z0, x1, z1) => P.wall(b, C.x + x0, C.z + z0, C.x + x1, C.z + z1, 0, 3.2);
    seg(-HW, -HD, HW, -HD); seg(HW, -HD, HW, HD); seg(-HW, HD, -31, HD); seg(-19, HD, HW, HD); seg(-HW, -HD, -HW, 19); seg(-HW, 31, -HW, HD);
    for (const [u, v] of [[-HW + 5, -HD + 5], [HW - 9, -HD + 5], [-HW + 5, HD - 9], [HW - 9, HD - 9]]) { b.origin(C.x + u, y, C.z + v, 0); watchtower(b, R, 7); }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const cx = C.x - 78 + i * 26, cz = C.z - 62 + j * 34; site(cx, cz, SOUTH, 20, 9, y); building(b, { R, w: 20, d: 9, floors: 1, fh: 3, wall: 'concrete', color: 0x8f9684, roof: 'gable', roofMat: 'metal', roofColor: 0x5c6652, rise: 1.6, chimney: false, kind: 'mil', doors: ['S', 'N'], floorMat: 'concrete', floorColor: 0xb4b2a8, mapColor: '#6f7a62' }); }
    site(C.x + 50, C.z + 52, WEST, 24, 16, y); building(b, { R, w: 24, d: 16, floors: 2, fh: 3.2, wall: 'concrete', color: 0xa8ac98, kind: 'mil', roofAccess: true, doors: ['S', 'N'], floorMat: 'concrete', floorColor: 0xb4b2a8, mapColor: '#5f6a52' });
    site(C.x + 50, C.z - 45, SOUTH, 40, 28, y); hall(b, { R, w: 40, d: 28, h: 8, wall: 'metal', color: 0x7a8474, roofColor: 0x5c6652, doors: ['S'], doorW: 14, doorH: 6, fill: 'storage', mezz: true, tier: 2, mapColor: '#5c6652' });
    site(C.x - 70, C.z + 62, EAST, 22, 14, y); hall(b, { R, w: 22, d: 14, h: 5, wall: 'metal', color: 0x8a9484, doors: ['S'], fill: 'storage', tier: 2, mapColor: '#6a7462' });
    // aircraft hangar (north side, doors facing the parade ground) with the helicopter and a light tank inside
    world.paintRect(0, C.x - 10, C.z - 36, C.x + 18, C.z - 14, 255, 2);
    site(C.x + 4, C.z - 58, SOUTH, 28, 42, y); hangar(b, { R, w: 28, d: 42 }); S.heli(b, 14, BASE, 24); S.tank(b, 4.5, BASE, 30, false, true);
    free(y);
    for (let i = 0; i < 3; i++) P.tank(b, C.x + 84, 0, C.z + 10 + i * 9, 3.4, 4.5, 0x7a8474);
    for (let i = 0; i < 6; i++) P.sandbags(b, C.x + R.range(-60, 30), 0, C.z + R.range(10, 40), R.chance(0.5), 3.2, 4); for (let i = 0; i < 4; i++) P.hesco(b, C.x - HW + 8, 0, C.z + 8 + i * 1.3 - (i > 1 ? 0 : 0), 1); P.hesco(b, C.x - HW + 8, 0, C.z + 34, 3, true); P.hesco(b, C.x - 34, 0, C.z + HD - 8, 2, false); P.hesco(b, C.x - 17, 0, C.z + HD - 8, 2, false);
    for (let i = 0; i < 8; i++) { const cx = C.x + R.range(-40, 10), cz = C.z + R.range(-20, 8); if (R.chance(0.5)) F.ammoBox(b, cx, 0, cz); else F.crate(b, cx, 0, cz, 1); }
    world.paintCircle(0, C.x + 6, C.z + 60, 13, 255); S.tank(b, C.x - 6, 0, C.z + 4, true); b.cyl('emissive', C.x + 6, 0.02, C.z + 60, 0.25, 0.1, 0xff5030, 8); // helipad + armour
    // radar mast
    const mx = C.x + 88, mz = C.z - 72; for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('steel', mx + u - 0.08, 0, mz + v - 0.08, mx + u + 0.08, 18, mz + v + 0.08, 0x7a3a2e); for (let k = 1; k < 6; k++) b.box('steel', mx - 1, k * 3, mz - 1, mx + 1, k * 3 + 0.08, mz + 1, 0x8a8a84, { c: false }); b.cyl('steel', mx, 18, mz, 1.6, 0.3, 0xcfd2d2, 14); b.box(null, mx - 1, 0, mz - 1, mx + 1, 18, mz + 1, 0, { mat: 2 });
    veh(C.x - 26, C.z + 50, 0, 'jeep'); veh(C.x - 60, C.z + 25, Math.PI / 2, 'jeep'); veh(C.x + 30, C.z + 25, Math.PI / 2, 'bike'); veh(C.x - 44, C.z + 25, Math.PI / 2, 'truck'); veh(C.x + 64, C.z - 8, 0, 'tank');
  } end('base');

  // ================= DEADPORT =================
  begin('port'); {
    const C = L.port, R = new RNG(505), y = C.h; free(y);
    world.paintRect(2, C.x - 110, C.z - 130, 840, C.z + 130, 235, 5); world.paintRect(3, C.x - 116, C.z - 136, 846, C.z + 136, 0, 4); world.paintRect(0, C.x - 110, C.z - 8, 826, C.z + 6, 255, 1.5); world.paintRect(0, 812, C.z - 126, 824, C.z + 126, 255, 1.5);
    b.box('concrete', 834, -9.5, C.z - 140, 838.5, 0.12, C.z + 140, 0x8f8c84); for (let z = -130; z <= 130; z += 20) { b.cyl('steel', 836.5, 0.12, C.z + z, 0.22, 0.5, 0x2c2c2c, 8, { c: true }); }
    // container yard
    for (let row = 0; row < 5; row++) for (let i = 0; i < 9; i++) { if (R.chance(0.22)) continue; const cx = C.x - 100 + row * 22, cz = C.z + 18 + i * 12.6; const open = R.chance(0.2); container(b, cx, 0, cz, R, true, 12.2, open); if (!open && R.chance(0.55)) { container(b, cx, 2.6, cz, R, true, 12.2); if (R.chance(0.35)) container(b, cx, 5.2, cz, R, true, 12.2); else b.loot(cx + 6, 5.25, cz + 1.2, 1); } }
    for (let row = 0; row < 4; row++) for (let i = 0; i < 7; i++) { if (R.chance(0.3)) continue; const cx = C.x - 96 + row * 26, cz = C.z - 124 + i * 7.2; const open = R.chance(0.3); container(b, cx + (i % 2) * 3, 0, cz, R, true, 6.1, open); if (!open && R.chance(0.4)) container(b, cx + (i % 2) * 3, 2.6, cz, R, true, 6.1); }
    // gantry cranes
    for (const gz of [C.z - 70, C.z + 60]) { const gx = 816; for (const [u, v] of [[0, 0], [14, 0], [0, 16], [14, 16]]) b.box('steel', gx + u, 0, gz + v, gx + u + 1.1, 26, gz + v + 1.1, 0xc8a020); b.box('steel', gx - 16, 26, gz + 6, gx + 44, 28.2, gz + 10.5, 0xc8a020, { bottom: true }); b.box('steel', gx, 22, gz, gx + 15.1, 23, gz + 1.1, 0xc8a020, { c: false, bottom: true }); b.box('steel', gx, 22, gz + 16, gx + 15.1, 23, gz + 17.1, 0xc8a020, { c: false, bottom: true });
      b.box('steel', gx + 26, 23.2, gz + 6.5, gx + 30, 26, gz + 10, 0xd8d8d0, { bottom: true }); b.box('steel', gx + 27.8, 9, gz + 8.1, gx + 28, 23.2, gz + 8.3, 0x222222, { c: false }); container(b, gx + 22, 6.4, gz + 7, R, true, 12.2); }
    site(C.x - 70, C.z - 30, SOUTH, 34, 20, y); hall(b, { R, w: 34, d: 20, h: 7, wall: 'metal', color: 0x8a9aa8, baseMat: 'brick', doors: ['S', 'E'], doorW: 6, doorH: 4.5, fill: 'storage', mezz: true, mapColor: '#6a7a88' });
    site(C.x - 20, C.z - 30, SOUTH, 30, 20, y); hall(b, { R, w: 30, d: 20, h: 7, wall: 'metal', color: 0xa89a8a, baseMat: 'brick', doors: ['S'], doorW: 6, doorH: 4.5, fill: 'storage', mapColor: '#887a6a' });
    site(C.x + 26, C.z - 30, SOUTH, 16, 12, y); building(b, { R, w: 16, d: 12, floors: 3, wall: 'brick', kind: 'office', roofAccess: true, doors: ['S', 'W'], floorMat: 'concrete', floorColor: 0xc4c0b4, mapColor: '#8a7060' });
    free(y); for (let i = 0; i < 12; i++) { const px = R.range(C.x - 30, 806), pz = R.range(C.z - 16, C.z + 14); if (Math.abs(pz - C.z) < 9) continue; R.chance(0.5) ? F.crate(b, px, 0, pz, 1.1) : F.barrel(b, px, 0, pz, 0x7a3c30); }
    for (let i = 0; i < 6; i++) P.lamp(b, 808, 0, C.z - 110 + i * 44, 1);
    // moored cargo ship
    const sx0 = 845, sx1 = 863, sz0 = C.z - 50, sz1 = C.z + 54, dk = 3.0; free(0);
    b.box('steel', sx0, -3.2, sz0, sx1, 1.2, sz1, 0x6a2a22, { bottom: true }); b.box('steel', sx0, 1.2, sz0, sx1, dk, sz1, 0x1c2024); b.box('steel', sx0 + 3, -3.2, sz1, sx1 - 3, dk, sz1 + 7, 0x1c2024); b.box('steel', sx0 + 6.5, -3.2, sz1 + 7, sx1 - 6.5, dk, sz1 + 12, 0x1c2024);
    b.box('wood', sx0 + 0.3, dk, sz0 + 0.3, sx1 - 0.3, dk + 0.04, sz1 - 0.3, 0x5a5048, { c: false });
    const bw = (x0, z0, x1, z1) => b.box('steel', x0, dk, z0, x1, dk + 1.05, z1, 0x24282c); bw(sx0, sz0, sx1, sz0 + 0.2); bw(sx1 - 0.2, sz0, sx1, sz1); bw(sx0, sz0, sx0 + 0.2, C.z - 4); bw(sx0, C.z + 4, sx0 + 0.2, sz1); bw(sx0 + 3, sz1 + 6.8, sx1 - 3, sz1 + 7);
    b.box('steel', 836, y - 0.1, C.z - 1.6, sx0 + 0.6, dk + 0.02, C.z + 1.6, 0x55595d, { bottom: true });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { if (R.chance(0.2)) continue; container(b, sx0 + 2.4 + j * 7, dk, C.z + 10 + i * 13, R, false, 12.2, R.chance(0.3)); }
    b.origin(sx0 + 2, dk - BASE, sz0 + 3, 0); building(b, { R, w: 14, d: 12, floors: 3, fh: 2.8, wall: 'steel', color: 0xe4e4dc, kind: 'office', roofAccess: true, doors: ['S'], floorMat: 'steel', floorColor: 0x6a7078, mapColor: '#c8c8c0', apron: 0, winEvery: 2.6 });
    free(0); b.cyl('steel', sx0 + 9, dk + 8.6, sz0 + 6, 0.9, 4.5, 0x8a2a22, 12, { c: true }); b.loot(sx0 + 9, dk + 0.05, C.z - 20, 2); b.loot(sx0 + 4, dk + 0.05, sz1 - 4, 2);
    free(0); S.boat(b, 840, 0.2, C.z + 84, false); S.boat(b, 840, 0.2, C.z - 100, false); free(y); for (let i = 0; i < 10; i++) S.clutter(b, R.range(C.x - 100, 800), 0, R.range(C.z - 14, C.z + 12) + (R.chance(0.5) ? 14 : -16), R);
    veh(C.x - 40, C.z - 1, Math.PI / 2, 'jeep'); veh(818, C.z + 30, 0, 'sedan'); veh(C.x - 60, C.z + 2, Math.PI / 2, 'truck');
  } end('port');

  // ================= STEEL FACTORY =================
  begin('steel'); {
    const C = L.steel, R = new RNG(606), y = C.h; free(y);
    world.paintRect(2, C.x - 95, C.z - 85, C.x + 95, C.z + 85, 200, 6); world.paintRect(3, C.x - 100, C.z - 90, C.x + 100, C.z + 90, 0, 6); world.paintRect(0, C.x - 95, C.z - 4, C.x + 95, C.z + 6, 255, 1.5); world.paintRect(1, C.x - 80, C.z + 40, C.x + 20, C.z + 80, 200, 4);
    site(C.x - 20, C.z - 42, SOUTH, 70, 40, y); hall(b, { R, w: 70, d: 40, h: 12, wall: 'metal', color: 0x8a8580, baseMat: 'brick', baseColor: 0xb8a898, roofColor: 0x6a6a68, doors: ['S', 'E', 'W'], doorW: 8, doorH: 6, fill: 'factory', mezz: true, tier: 1, mapColor: '#6a6560' });
    site(C.x + 62, C.z - 50, WEST, 26, 18, y); hall(b, { R, w: 26, d: 18, h: 7, wall: 'brick', color: 0xffffff, roofColor: 0x5a5a58, doors: ['S'], fill: 'storage', mapColor: '#8a6a5a' });
    site(C.x + 60, C.z + 40, NORTH, 18, 12, y); building(b, { R, w: 18, d: 12, floors: 2, wall: 'brick', kind: 'office', doors: ['S', 'N'], roofAccess: true, floorMat: 'concrete', floorColor: 0xc4c0b4, mapColor: '#8a6a5a' });
    free(y);
    for (const [u, v, hh] of [[-70, -72, 34], [-58, -72, 28], [30, -74, 38]]) { b.cyl('brick', C.x + u, 0, C.z + v, 2.2, hh, 0xb0a090, 14, { c: true, r2: 1.4 }); b.cyl('concrete', C.x + u, hh, C.z + v, 1.55, 0.6, 0x55504a, 14); }
    // blast furnace
    const fx = C.x - 50, fz = C.z + 34; b.cyl('steel', fx, 0, fz, 5, 9, 0x5a4a40, 18, { c: true }); b.cyl('steel', fx, 9, fz, 5, 5, 0x4a3e36, 18, { r2: 2.6 }); b.cyl('steel', fx, 14, fz, 2.6, 7, 0x4a3e36, 14); b.cylH('steel', fx, 17, fz, 24, 0.9, 'x', 0x6a5a4a, 10); b.cyl('steel', fx + 24, 0, fz, 3, 18, 0x70645a, 14, { c: true });
    for (const [u, v] of [[-3.8, -3.8], [3.6, -3.8], [-3.8, 3.6], [3.6, 3.6]]) b.box('steel', fx + u * 1.6, 0, fz + v * 1.6, fx + u * 1.6 + 0.3, 12, fz + v * 1.6 + 0.3, 0x3a3a38);
    b.box('steel', fx - 6.4, 6, fz - 6.4, fx + 6.4, 6.15, fz - 5.0, 0x55595d); b.box('steel', fx - 6.4, 6, fz + 5.0, fx + 6.4, 6.15, fz + 6.4, 0x55595d); b.box('steel', fx - 6.4, 6, fz - 5, fx - 5, 6.15, fz + 5, 0x55595d); b.box('steel', fx + 5, 6, fz - 5, fx + 6.4, 6.15, fz + 5, 0x55595d);
    stairs(b, fx - 6.4, 0, fz + 6.6, fz + 7.8, 6, 1, 'steel', 0x55595d); b.box('steel', fx + 0.8, 5.85, fz + 6.4, fx + 2.4, 6, fz + 7.8, 0x55595d); b.loot(fx + 5.6, 6.2, fz, 2); b.loot(fx - 5.6, 6.2, fz - 5.6, 2);
    P.pipeRack(b, C.x - 40, 0, C.z + 10, 80, true); P.pipeRack(b, C.x + 44, 0, C.z - 30, 38, false);
    for (let i = 0; i < 3; i++) P.tank(b, C.x + 30 + i * 9, 0, C.z + 62, 3.6, 7, 0x9a9a92);
    for (let i = 0; i < 26; i++) { const px = C.x + R.range(-78, 16), pz = C.z + R.range(44, 78); if (Math.hypot(px - fx, pz - fz) < 10) continue; b.boxR('steel', px, R.range(0.2, 0.7), pz, R.range(0.6, 2.6), R.range(0.3, 1.2), R.range(0.5, 2), R.f() * 3, R.pick([0x6a4a3a, 0x55595d, 0x7a5a40]), { c: true }); }
    for (let i = 0; i < 5; i++) container(b, C.x + 70, 0, C.z - 20 + i * 3.2, R, true, 6.1, i === 2);
    for (let i = 0; i < 8; i++) P.fence(b, C.x - 96 + i * 24, C.z + 86, C.x - 74 + i * 24, C.z + 86, 0, 2.2, 'steel', 0x6a6e6a);
    for (let i = 0; i < 12; i++) S.clutter(b, C.x + R.range(-80, 80), 0, C.z + R.range(10, 34), R);
    veh(C.x + 20, C.z + 2, Math.PI / 2, 'jeep'); veh(C.x - 76, C.z - 2, Math.PI / 2, 'sedan'); veh(C.x + 50, C.z + 2, Math.PI / 2, 'truck');
  } end('steel');

  // ================= DUST VALLEY =================
  begin('dust'); {
    const C = L.dust, R = new RNG(707);
    const ruin = (cx, cz, w, d) => { const y = flat(cx, cz, 0, w, d); site(cx, cz, R.int(0, 3), w, d, y); const wm = R.pick(['plaster', 'brick', 'concrete']), wc = R.pick([0xd8c8a8, 0xc8b898, 0xbfb4a0]);
      b.box('concrete', -0.2, -2, -0.2, w + 0.2, BASE, d + 0.2, 0x9a9484); const hs = () => R.range(0.8, 3.1);
      const win = (len) => [{ p: len * 0.3, w: 1.2, s: 0.9, h: 2.1 }, { p: len * 0.7, w: 1.3, s: 0, h: 2.15 }];
      wallRun(b, wm, wc, 'x', 0.125, 0, w * R.range(0.5, 1), BASE, BASE + hs(), win(w), 0xb8b0a0, R); wallRun(b, wm, wc, 'x', d - 0.125, w * R.range(0, 0.4), w, BASE, BASE + hs(), win(w), 0xb8b0a0, R);
      wallRun(b, wm, wc, 'z', 0.125, 0.25, d - 0.25, BASE, BASE + hs(), win(d), 0xb8b0a0, R); wallRun(b, wm, wc, 'z', w - 0.125, 0.25, d * R.range(0.5, 1), BASE, BASE + hs(), win(d), 0xb8b0a0, R);
      for (let i = 0; i < 5; i++) b.boxR(wm, R.range(0.5, w - 0.5), BASE + 0.15, R.range(0.5, d - 0.5), R.range(0.4, 1.3), 0.3, R.range(0.3, 0.9), R.f() * 3, wc);
      if (R.chance(0.6)) F.crate(b, w * 0.3, BASE, d * 0.4); b.loot(w * 0.6, BASE + 0.05, d * 0.6, 1); b.loot(w * 0.3, BASE + 0.05, d * 0.25, 1); world.footprints.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, c: '#a09078' }); };
    for (let i = 0; i < 13; i++) { const a = R.f() * 6.28, r = R.range(30, 170); const cx = C.x + Math.cos(a) * r, cz = C.z + Math.sin(a) * r; if (world.splatAt(cx, cz, 0) > 60) continue; ruin(cx, cz, R.int(7, 11), R.int(6, 9)); }
    // old gas station on the road
    { const cx = C.x - 20, cz = C.z + 12, y = flat(cx, cz, 0, 30, 24); world.paintRect(2, cx - 14, cz - 12, cx + 14, cz + 12, 220, 3); shop(R, cx, cz - 6, SOUTH, y, { w: 14, d: 8, awning: 0 }); free(y);
      for (const u of [-5, 5]) { b.box('steel', cx + u - 0.15, 0, cz + 6, cx + u + 0.15, 4.4, cz + 6.3, 0xb8b4a8); b.box('steel', cx + u - 0.4, 0, cz + 5.6, cx + u + 0.4, 1.5, cz + 6.7, 0x9a3a2a); }
      b.box('steel', cx - 8, 4.4, cz + 2.5, cx + 8, 4.9, cz + 9.5, 0xc8c0b0, { bottom: true }); P.wreck(b, cx - 2, 0, cz + 8, R, true); P.tires(b, cx + 9, 0, cz + 3, 4); veh(cx + 11, cz + 9, 0.4, 'bike'); }
    // motel
    { const cx = C.x + 60, cz = C.z - 50, y = flat(cx, cz, 0, 44, 12); for (let i = 0; i < 4; i++) { site(cx - 16.5 + i * 11, cz, SOUTH, 10.5, 8, y); building(b, { R, w: 10.5, d: 8, floors: 1, wall: 'plaster', color: 0xd8c0a0, kind: 'home', doors: ['S'], parapet: 0.3, roofProps: false, mapColor: '#b0a088', apron: 2 }); } veh(cx - 8, cz + 12, 1.57, 'sedan'); }
    // shanty sheds + water tower
    for (let i = 0; i < 6; i++) { const cx = C.x + R.range(-150, 150), cz = C.z + R.range(-150, 150); if (world.splatAt(cx, cz, 0) > 40 || world.splatAt(cx, cz, 3) < 10) continue; const y = flat(cx, cz, 0, 8, 7); site(cx, cz, R.int(0, 3), 7, 6, y); hall(b, { R, w: 7, d: 6, h: 2.8, wall: 'metal', color: R.pick([0x9a8a70, 0x8a9088, 0xa07050]), doors: ['S'], doorW: 2.2, doorH: 2.2, fill: 'none', rise: 0.5, mapColor: '#8a8070' }); }
    free(); for (let i = 0; i < 10; i++) { const px = C.x + R.range(-160, 160), pz = C.z + R.range(-160, 160); const y = world.heightAt(px, pz); if (world.splatAt(px, pz, 3) < 10) continue; if (i % 3 === 0) P.wreck(b, px, y, pz, R, R.chance(0.5)); else if (i % 3 === 1) P.pole(b, px, y, pz); else { F.barrel(b, px, y, pz, 0x6a4a34); F.barrel(b, px + 0.7, y, pz + 0.2, 0x5a5a40); } }
    free(); for (let i = 0; i < 14; i++) { const px = C.x + R.range(-150, 150), pz = C.z + R.range(-150, 150); if (world.splatAt(px, pz, 3) < 10) continue; b.origin(0, world.heightAt(px, pz), 0, 0); S.clutter(b, px, 0, pz, R); }
    veh(C.x + 10, C.z - 14, 2.2, 'jeep');
  } end('dust');

  // ================= EAGLE PEAK =================
  begin('peak'); {
    const C = L.peak, y = C.h; world.paintCircle(2, C.x, C.z, 26, 220); world.paintCircle(3, C.x, C.z, 26, 0); free(y);
    P.sandbags(b, C.x - 4, 0, C.z + 25, true, 4, 4); F.ammoBox(b, C.x - 2, 0, C.z + 23); b.loot(C.x + 3, 0.05, C.z + 24, 2); b.loot(C.x - 24, 0.05, C.z + 2, 2); b.loot(C.x + 24, 0.05, C.z - 3, 2);
  } end('peak');

  // ================= SHADOW FOREST =================
  begin('forest'); {
    const C = L.forest, R = new RNG(909);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + R.range(-0.3, 0.3), r = R.range(40, 190); const cx = C.x + Math.cos(a) * r, cz = C.z + Math.sin(a) * r; if (world.heightAt(cx, cz) < 3 || world.splatAt(cx, cz, 0) > 40) continue; const y = flat(cx, cz, 0, 12, 12);
      house(R, cx, cz, R.int(0, 3), y, { w: R.int(7, 9), d: R.int(6, 7), floors: 1, wall: 'wood', color: R.pick([0x7a5a40, 0x6a5a48, 0x8a6a50]), roofColor: R.pick([0x3e4a44, 0x4a4038]), porch: R.chance(0.6), apron: 1 }); world.paintCircle(3, cx, cz, 9, 40);
      free(y); P.tires(b, cx + 7, 0, cz + 5, 2); for (let k = 0; k < 3; k++) b.cylH('wood', cx - 7 + k * 0.1, 0.25 + k * 0.01, cz - 6 + k * 0.6, 2.2, 0.25, 'x', 0x5a4632, 8); }
    for (let i = 0; i < 5; i++) { const cx = C.x + R.range(-170, 170), cz = C.z + R.range(-170, 170); if (world.heightAt(cx, cz) < 3) continue; const y = flat(cx, cz, 0, 10, 10); world.paintCircle(1, cx, cz, 7, 200); world.paintCircle(3, cx, cz, 8, 30); free(y);
      P.tent(b, cx - 4, 0, cz - 2, R, R.pick([0x5c6a48, 0x6a5c44, 0x4a5a5a])); if (R.chance(0.6)) P.tent(b, cx + 1.5, 0, cz - 3, R, 0x586848); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; b.boxR('concrete', cx + Math.cos(a) * 0.7, 0.1, cz + 3 + Math.sin(a) * 0.7, 0.35, 0.25, 0.3, a, 0x77736a); } b.boxR('wood', cx, 0.12, cz + 3, 0.9, 0.14, 0.14, 0.6, 0x1c1814); b.cylH('wood', cx - 2.2, 0.22, cz + 4.6, 1.8, 0.22, 'x', 0x5a4632, 8); F.crate(b, cx + 3.6, 0, cz + 1.6, 0.8); b.loot(cx + 1.2, 0.05, cz + 4.5, 1); }
    for (let i = 0; i < 4; i++) { const cx = C.x + R.range(-190, 190), cz = C.z + R.range(-190, 190); if (world.heightAt(cx, cz) < 3) continue; const y = flat(cx, cz, 0, 6, 6); b.origin(cx, y, cz, 0); watchtower(b, R, 5); }
    { const cx = C.x + 30, cz = C.z - 20, y = flat(cx, cz, 0, 14, 12); site(cx, cz, EAST, 12, 9, y); building(b, { R, w: 12, d: 9, floors: 1, fh: 2.6, wall: 'concrete', color: 0x7a7e72, kind: 'mil', doors: ['S'], winW: 1.4, sill: 1.35, head: 1.75, parapet: 0, roofProps: false, mapColor: '#5a5e52', apron: 2 }); world.paintCircle(3, cx, cz, 12, 20); }
  } end('forest');

  // ================= LAST STAND COMPOUND =================
  begin('last'); {
    const C = L.last, R = new RNG(1010), y = C.h, H = 62; free(y);
    world.paintRect(2, C.x - H, C.z - H, C.x + H, C.z + H, 190, 5); world.paintRect(3, C.x - H - 8, C.z - H - 8, C.x + H + 8, C.z + H + 8, 0, 5); world.paintRect(1, C.x - H, C.z - H, C.x + H, C.z + H, 120, 5);
    const seg = (x0, z0, x1, z1, h = 4) => P.wall(b, C.x + x0, C.z + z0, C.x + x1, C.z + z1, 0, h, 0x8f8a7c);
    seg(-H, -H, H, -H); seg(-H, H, -6, H); seg(6, H, H, H); seg(-H, -H, -H, H); seg(H, -H, H, -6); seg(H, 6, H, H);
    for (const [u, v] of [[-H, -H], [H - 8, -H], [-H, H - 8], [H - 8, H - 8]]) { b.origin(C.x + u, y, C.z + v, 0); building(b, { R, w: 8, d: 8, floors: 2, fh: 3, wall: 'concrete', color: 0x8a8678, kind: 'mil', roofAccess: true, doors: [u < 0 ? 'E' : 'W'], winW: 1.5, sill: 1.2, head: 1.7, interior: true, floorMat: 'concrete', floorColor: 0xa8a69a, mapColor: '#5c584c', apron: 0 }); }
    site(C.x, C.z - 8, SOUTH, 28, 20, y); building(b, { R, w: 28, d: 20, floors: 3, fh: 3.2, wall: 'concrete', color: 0x9a9684, kind: 'mil', roofAccess: true, doors: ['S', 'N', 'E', 'W'], winEvery: 3.6, floorMat: 'concrete', floorColor: 0xa8a69a, mapColor: '#4c4a3e', apron: 0 });
    site(C.x - 38, C.z + 30, EAST, 16, 10, y); hall(b, { R, w: 16, d: 10, h: 4, wall: 'metal', color: 0x6a7260, doors: ['S'], fill: 'storage', tier: 2, mapColor: '#5c6652' });
    site(C.x + 38, C.z + 34, WEST, 16, 10, y); hall(b, { R, w: 16, d: 10, h: 4, wall: 'metal', color: 0x6a7260, doors: ['S'], fill: 'storage', tier: 2, mapColor: '#5c6652' });
    free(y);
    for (let i = 0; i < 10; i++) { const px = C.x + R.range(-48, 48), pz = C.z + R.range(14, 54); if (Math.abs(px) < 0) continue; if (i % 2) P.sandbags(b, px, 0, pz, R.chance(0.5), 3.8, 4); else P.hesco(b, px, 0, pz, 2, R.chance(0.5)); }
    P.hesco(b, C.x - 12, 0, C.z + H + 6, 3, true); P.hesco(b, C.x + 9, 0, C.z + H + 6, 3, true); P.hesco(b, C.x + H + 6, 0, C.z - 12, 3, false); P.hesco(b, C.x + H + 6, 0, C.z + 9, 3, false);
    for (let i = 0; i < 6; i++) F.ammoBox(b, C.x + R.range(-40, 40), 0, C.z + R.range(-52, -30)); for (let i = 0; i < 4; i++) P.barrier(b, C.x - 9 + i * 5, 0, C.z + H - 12, true);
    S.tank(b, C.x - 30, 0, C.z + 4, false); for (let i = 0; i < 6; i++) S.clutter(b, C.x + R.range(-50, 50), 0, C.z + R.range(20, 55), R);
    veh(C.x + 20, C.z + 48, 0, 'jeep'); veh(C.x - 14, C.z + 74, 1.57, 'bike'); veh(C.x + 34, C.z + 20, 0, 'tank'); veh(C.x - 20, C.z + 74, 1.57, 'truck');
  } end('last');

  // ================= BRIDGES + ROAD PROPS =================
  begin('roads'); {
    const R = new RNG(1111);
    for (const br of BRIDGES) { free(0); const top = BRIDGE_Y - 0.1, x0 = br.x - 37, x1 = br.x + 37;
      b.box('concrete', x0, top - 0.7, br.z - 5.4, x1, top - 0.08, br.z + 5.4, 0x9a968c, { bottom: true }); b.box('asphalt', x0, top - 0.08, br.z - 4.4, x1, top, br.z + 4.4, 0xffffff, { c: false }); b.box(null, x0, top - 0.1, br.z - 5.4, x1, top, br.z + 5.4, 0, { mat: 0 });
      for (const s of [-1, 1]) { b.box('concrete', x0, top, br.z + s * 5.4 - 0.2, x1, top + 0.95, br.z + s * 5.4 + 0.2, 0xa8a49a, { nav: 1 }); for (let px = x0 + 2; px < x1; px += 7) b.box('concrete', px - 0.25, top + 0.95, br.z + s * 5.4 - 0.25, px + 0.25, top + 1.25, br.z + s * 5.4 + 0.25, 0x8f8b82, { c: false }); }
      for (const u of [-22, 0, 22]) b.box('concrete', br.x + u - 1.2, -6, br.z - 4.6, br.x + u + 1.2, top - 0.7, br.z + 4.6, 0x8a867c, { nav: -1 });
      world.footprints.push({ x0, z0: br.z - 5, x1, z1: br.z + 5, c: '#77777a' }); }
    // power poles + occasional cover along the highways
    for (const road of ROADS) { if (road.t) continue; let acc = 0; for (let s = 0; s < road.p.length - 1; s++) { const [ax, az] = road.p[s], [bx2, bz2] = road.p[s + 1]; const len = Math.hypot(bx2 - ax, bz2 - az), nx = -(bz2 - az) / len, nz = (bx2 - ax) / len;
      for (let d = 0; d < len; d += 1) { acc += 1; if (acc < 46) continue; acc = 0; const px = ax + (bx2 - ax) * d / len + nx * 8.5, pz = az + (bz2 - az) * d / len + nz * 8.5; const h = world.heightAt(px, pz); if (h < 2 || world.locationAt(px, pz)) continue; free(h);
        if (R.chance(0.7)) P.pole(b, px, 0, pz); else if (R.chance(0.5)) { P.wreck(b, px - nx * 5, 0, pz - nz * 5, R, Math.abs(nx) < 0.7); } else { P.barrier(b, px - nx * 4, 0, pz - nz * 4, Math.abs(nx) < 0.7); b.loot(px - nx * 3, 0.05, pz - nz * 3 + 1, 1); } } } }
    veh(-80, -196, Math.PI / 2, 'sedan'); veh(-200, 150, 0, 'bike'); veh(250, 326, 1, 'jeep'); veh(-440, 36, 2.2, 'sedan'); veh(-296, -500, 0.7, 'jeep'); veh(540, -86, 2, 'bike'); veh(-455, 572, 1.5, 'sedan'); veh(600, 262, 2.5, 'jeep');
  } end('roads');
  begin('town'); buildTown(G, b, L, group, { house, apartment, shop, flat }); end('town');
  return group;
}
