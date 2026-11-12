// Drivable vehicles: military jeep, sedan, motorcycle. Arcade driving model with terrain following,
// collisions, damage, fuel, exhaust and destruction.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, dampAngle } from '../utils/math.js';

const DEFS = {
  jeep: { name: 'JEEP', hp: 1000, max: 25, acc: 9.5, hw: 0.95, hl: 2.05, hh: 1.75, wb: 2.6, wr: 0.42, wx: 0.86, wz: [1.3, -1.3], off: 0.9, seat: [0.42, 0.42, -0.25], hands: [0.42, 1.05, 0.5, 0.17], cam: 7.5, fuelRate: 0.45, colors: [0x4a5438, 0x5a5a48, 0x6a6048] },
  sedan: { name: 'SEDAN', hp: 700, max: 31, acc: 11, hw: 0.9, hl: 2.2, hh: 1.4, wb: 2.7, wr: 0.34, wx: 0.8, wz: [1.35, -1.35], off: 0.55, seat: [0.38, 0.22, -0.1], hands: [0.38, 0.86, 0.48, 0.16], cam: 7, fuelRate: 0.38, colors: [0x7a2a24, 0x2a4a6a, 0xb8b4a8, 0x30343a, 0x3a6a4a] },
  truck: { name: 'TRUCK', hp: 1600, max: 20, acc: 6.5, hw: 1.2, hl: 3.4, hh: 2.8, wb: 4.2, wr: 0.5, wx: 1.0, wz: [2.2, -2.2], off: 0.85, seat: [0.5, 0.9, 1.2], hands: [0.5, 1.5, 1.8, 0.17], cam: 10.5, fuelRate: 0.6, colors: [0x4a5438] },
  tank: { name: 'TANK', hp: 4200, max: 12.5, acc: 5, hw: 1.6, hl: 3.4, hh: 2.6, wb: 3.6, wr: 0.45, wx: 1.4, wz: [2.2, -2.2], off: 1, seat: [0, 0.8, 0], hands: [0, 1.3, 0.5, 0.17], cam: 11.5, fuelRate: 0.8, colors: [0x4a5438] },
  bike: { name: 'MOTORCYCLE', hp: 380, max: 35, acc: 15, hw: 0.4, hl: 1.05, hh: 1.3, wb: 1.5, wr: 0.34, wx: 0, wz: [0.75, -0.72], off: 0.78, seat: [0, 0.22, -0.3], hands: [0, 0.62, 0.36, 0.26], cam: 6, fuelRate: 0.3, colors: [0x1c1c1e, 0x8a2a1e, 0x2e4a2e] },
};

let SHARED = null;
function shared(G) {
  if (SHARED) return SHARED; const T = G.T.tire; T.map.wrapS = T.map.wrapT = THREE.RepeatWrapping;
  const tire = (r, w) => { const g = new THREE.CylinderGeometry(r, r, w, 18, 1); g.rotateZ(Math.PI / 2); const hub = new THREE.CylinderGeometry(r * 0.56, r * 0.56, w + 0.02, 12); hub.rotateZ(Math.PI / 2); return { tire: g, hub }; };
  SHARED = { tireM: G.gfx.std({ map: T.map, normalMap: T.normalMap, roughness: 0.92, color: 0x777777 }), hubM: G.gfx.std({ color: 0x8a8d90, roughness: 0.4, metalness: 0.8 }), dark: G.gfx.std({ color: 0x151618, roughness: 0.6, metalness: 0.3 }),
    glass: G.gfx.std({ color: 0x1a2428, roughness: 0.08, metalness: 0.6, envMapIntensity: 2 }), seat: G.gfx.std({ color: 0x2a2620, roughness: 0.9 }), light: G.gfx.std({ color: 0xffffff, emissive: 0xfff0c8, emissiveIntensity: 1.6 }), tail: G.gfx.std({ color: 0x551010, emissive: 0xaa1010, emissiveIntensity: 0.9 }), chrome: G.gfx.std({ color: 0xb8bcc0, roughness: 0.25, metalness: 0.9 }),
    w42: tire(0.42, 0.28), w34: tire(0.34, 0.22), wb: tire(0.34, 0.13), paints: new Map() };
  return SHARED;
}
const bx = (w, h, d, x, y, z, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
const merge = (a) => mergeGeometries(a.map(g => g.index ? g.toNonIndexed() : g));
// side profile [z,y] extruded along x (width)
function extrude(profile, width, bevel = 0.06) {
  const s = new THREE.Shape(); profile.forEach(([z, y], i) => i ? s.lineTo(z, y) : s.moveTo(z, y)); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); return g; // shape x -> world z, extrusion -> world x
}

// GLB vehicles (poly.pizza). len in metres. Wheel meshes (name contains 'Wheel') are re-pivoted so they can spin / steer.
const VEH_GLB = {
  jeep: [{ key: 'single/humvee', len: 4.7, closed: true }, { key: 'mil/jeep', len: 4.1, closed: true, name: 'ARMY JEEP' }],
  truck: [{ key: 'mil/truck', len: 7.2, closed: true }],
  tank: [{ key: 'vehicles2/tank', len: 7.0, closed: true, name: 'TANK', animated: true }],
  sedan: [{ key: 'city/car', len: 4.2, closed: true }, { key: 'city/car_2', len: 4.5, closed: true }, { key: 'city/suv', len: 4.6, closed: true }, { key: 'city/sports_car', len: 4.3, closed: true }, { key: 'single/police_car', len: 4.4, closed: true }, { key: 'single/car_model', len: 4.6, closed: true, fast: true, name: 'SUPERCAR' }, { key: 'city/pickup_truck', len: 5.0, closed: true, name: 'PICKUP' }, { key: 'mil/ambulance_car', len: 5.0, closed: true, name: 'AMBULANCE' }],
  bike: [{ key: 'vehicles2/bike', len: 2.1, closed: false }, { key: 'vehicles2/military_bike', len: 2.2, closed: false, name: 'ARMY BIKE' }],
};
function glbModel(G, cfg, wr) {
  if (cfg.animated) { const a = G.assets.animated(cfg.key, { length: cfg.len }); if (!a) return null; const body = new THREE.Group(); body.add(a.grp); a.grp.position.y = -wr; const grp = new THREE.Group(); grp.add(body);
    return { grp, body, wheels: [], size: a.size, mixer: a.mixer, clips: a.clips }; }
  const f = G.assets.fitted(cfg.key, { length: cfg.len, flip: cfg.flip }); if (!f) return null;
  const grp = new THREE.Group(), body = new THREE.Group(); grp.add(body); body.add(f); f.position.y = -wr; const wheels = [];
  const inner = f.children[0].children[0]; const box = new THREE.Box3();
  for (const m of inner.children.slice()) { if (!/wheel/i.test(m.name)) continue; m.geometry = m.geometry.clone(); m.geometry.computeBoundingBox(); box.copy(m.geometry.boundingBox); const c = box.getCenter(new THREE.Vector3()); m.geometry.translate(-c.x, -c.y, -c.z); m.position.copy(c); m.rotation.order = 'YXZ'; wheels.push({ piv: m, w: m, front: /front|_F[LR]/i.test(m.name), glb: true }); }
  return { grp, body, wheels, size: f.userData.size };
}

function buildModel(G, type, color, cfg) {
  if (cfg) { const g = glbModel(G, cfg, DEFS[type].wr); if (g) return g; }
  const S = shared(G), grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
  let paint = S.paints.get(color); if (!paint) S.paints.set(color, paint = G.gfx.std({ color, roughness: type === 'jeep' ? 0.7 : 0.32, metalness: type === 'jeep' ? 0.2 : 0.55, envMapIntensity: 1.4 }));
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; body.add(m); return m; };
  const wheels = [];
  const wheel = (set, x, z, front) => { const w = new THREE.Group(); const t = new THREE.Mesh(set.tire, S.tireM), h = new THREE.Mesh(set.hub, S.hubM); t.castShadow = true; w.add(t, h); const piv = new THREE.Group(); piv.position.set(x, 0, z); piv.add(w); grp.add(piv); wheels.push({ piv, w, front }); };
  if (type === 'jeep') {
    add(extrude([[-2.0, 0.55], [2.02, 0.55], [2.06, 1.0], [0.92, 1.08], [0.92, 1.02], [-0.9, 1.02], [-0.9, 1.1], [-2.0, 1.1]], 1.72), paint);
    add(merge([bx(1.74, 0.12, 0.5, 0, 0.5, 2.1), bx(1.74, 0.12, 0.3, 0, 0.5, -2.08), bx(1.5, 0.3, 0.06, 0, 0.82, 2.08), bx(0.12, 0.9, 0.06, 0.74, 1.5, 0.9, -0.2), bx(0.12, 0.9, 0.06, -0.74, 1.5, 0.9, -0.2), bx(1.6, 0.08, 0.06, 0, 1.94, 0.81), bx(0.07, 0.07, 1.9, 0.78, 1.95, -0.15), bx(0.07, 0.07, 1.9, -0.78, 1.95, -0.15), bx(0.07, 0.86, 0.07, 0.78, 1.52, -1.1), bx(0.07, 0.86, 0.07, -0.78, 1.52, -1.1), bx(1.62, 0.07, 0.07, 0, 1.95, -1.1), bx(0.05, 0.3, 0.05, 0.3, 1.0, 0.62, 0.9), bx(1.9, 0.14, 0.72, 0, 0.96, 1.3).translate(0, 0, 0), bx(0.3, 0.5, 0.62, 0.92, 0.92, -1.3), bx(0.3, 0.5, 0.62, -0.92, 0.92, -1.3)]), S.dark);
    add(merge([bx(0.22, 0.18, 0.7, 0.93, 0.98, 1.3), bx(0.22, 0.18, 0.7, -0.93, 0.98, 1.3)]), paint);
    add(bx(1.5, 0.7, 0.03, 0, 1.52, 0.9, -0.2), S.glass, false).material = G.mats.glass;
    add(merge([bx(0.5, 0.14, 0.5, 0.42, 0.72, -0.2), bx(0.5, 0.5, 0.12, 0.42, 0.98, -0.5), bx(0.5, 0.14, 0.5, -0.42, 0.72, -0.2), bx(0.5, 0.5, 0.12, -0.42, 0.98, -0.5), bx(1.4, 0.14, 0.45, 0, 0.72, -1.2)]), S.seat);
    const st = new THREE.TorusGeometry(0.17, 0.022, 6, 14); st.rotateX(-0.5); st.translate(0.42, 1.05, 0.5); add(st, S.dark);
    add(merge([new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12).rotateX(Math.PI / 2).translate(0.62, 0.86, 2.1), new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12).rotateX(Math.PI / 2).translate(-0.62, 0.86, 2.1)]), S.light);
    add(merge([bx(0.16, 0.1, 0.04, 0.72, 0.9, -2.03), bx(0.16, 0.1, 0.04, -0.72, 0.9, -2.03)]), S.tail);
    const sp = new THREE.Mesh(S.w42.tire, S.tireM); sp.rotation.y = Math.PI / 2; sp.position.set(0, 1.0, -2.2); body.add(sp);
    for (const z of DEFS.jeep.wz) for (const x of [0.86, -0.86]) wheel(S.w42, x, z, z > 0);
  } else if (type === 'sedan') {
    add(extrude([[-2.2, 0.32], [2.2, 0.32], [2.25, 0.62], [2.05, 0.82], [0.95, 0.9], [-1.5, 0.92], [-2.2, 0.86]], 1.76, 0.09), paint);
    add(extrude([[0.98, 0.88], [0.35, 1.36], [-1.0, 1.38], [-1.55, 0.9]], 1.56, 0.07), S.glass);
    add(merge([bx(1.38, 0.05, 1.3, 0, 1.385, -0.33), bx(0.07, 0.5, 0.07, 0.75, 1.13, -0.3), bx(0.07, 0.5, 0.07, -0.75, 1.13, -0.3)]), paint);
    add(merge([bx(1.8, 0.16, 0.2, 0, 0.36, 2.2), bx(1.8, 0.16, 0.2, 0, 0.36, -2.2), bx(0.9, 0.14, 0.04, 0, 0.6, 2.26), bx(0.1, 0.08, 0.16, 0.92, 0.98, 0.72), bx(0.1, 0.08, 0.16, -0.92, 0.98, 0.72)]), S.dark);
    add(merge([bx(0.36, 0.12, 0.05, 0.62, 0.72, 2.2, 0.3), bx(0.36, 0.12, 0.05, -0.62, 0.72, 2.2, 0.3)]), S.light); add(merge([bx(0.4, 0.1, 0.05, 0.6, 0.78, -2.2), bx(0.4, 0.1, 0.05, -0.6, 0.78, -2.2)]), S.tail);
    for (const z of DEFS.sedan.wz) for (const x of [0.8, -0.8]) wheel(S.w34, x, z, z > 0);
  } else {
    add(merge([bx(0.12, 0.1, 1.0, 0, 0.62, 0, 0.12), bx(0.3, 0.3, 0.42, 0, 0.5, 0.02), bx(0.1, 0.5, 0.1, 0, 0.72, 0.52, -0.42), bx(0.62, 0.05, 0.05, 0, 1.03, 0.4), bx(0.12, 0.08, 0.5, 0, 0.6, -0.55, -0.25), new THREE.CylinderGeometry(0.045, 0.05, 0.75, 8).rotateX(Math.PI / 2 - 0.1).translate(0.17, 0.42, -0.42)]), S.dark);
    const tank = new THREE.SphereGeometry(0.24, 12, 8); tank.scale(0.78, 0.62, 1.25); tank.translate(0, 0.86, 0.12); add(tank, paint); add(bx(0.2, 0.06, 0.26, 0, 0.9, -0.62), paint);
    add(bx(0.3, 0.1, 0.56, 0, 0.82, -0.3), S.seat); add(merge([new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6).rotateX(-0.42).translate(0.1, 0.62, 0.62), new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6).rotateX(-0.42).translate(-0.1, 0.62, 0.62)]), S.chrome);
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10).rotateX(Math.PI / 2).translate(0, 0.92, 0.62), S.light);
    for (const z of DEFS.bike.wz) wheel(S.wb, 0, z, z > 0);
  }
  return { grp, body, wheels, paint };
}

const _p = new THREE.Vector3();
class Vehicle {
  constructor(G, type, x, z, yaw, color) {
    this.G = G; this.type = type; this.def = DEFS[type];
    let cfg = null; if (G.assets && VEH_GLB[type]) { const opts = VEH_GLB[type].filter(c => G.assets.has(c.key)); if (opts.length) cfg = opts[Math.floor(Math.random() * opts.length)]; }
    const m = buildModel(G, type, color, cfg); this.model = cfg ? cfg.key : type;
    if (m.size) { this.def = { ...this.def, hl: m.size.z / 2, hw: Math.max(0.35, m.size.x / 2 * 0.9), hh: m.size.y, name: cfg.name || this.def.name, max: cfg.fast ? 40 : this.def.max, acc: cfg.fast ? 16 : this.def.acc, wz: [m.size.z * 0.3, -m.size.z * 0.3] }; this.closed = !!cfg.closed; }
    this.grp = m.grp; this.body = m.body; this.wheels = m.wheels; this.grp.rotation.order = 'YXZ'; this.mixer = m.mixer || null; this.clips = m.clips || null; this.anim = null;
    this.pos = new THREE.Vector3(x, G.world.heightAt(x, z), z); this.yaw = yaw; this.speed = 0; this.steer = 0; this.thr = 0; this.brake = false; this.hp = this.def.hp; this.fuel = 60 + Math.random() * 40; this.driver = null; this.dead = false; this.pitch = 0; this.roll = 0; this.spin = 0; this.smokeT = 0; this.lean = 0;
    G.gfx.scene.add(this.grp); this._place(0.016, true);
  }
  input(thr, steer, brake) { this.thr = thr; this.steerIn = steer; this.brake = brake; }
  damage(d, by) { if (this.dead) return; this.hp -= d; if (this.hp <= 0) this.destroy(by); }
  destroy(by) {
    if (this.dead) return; this.dead = true; const G = this.G; const drv = this.driver; if (drv) { G.vehicles.eject(drv); drv.damage(70, by, 'limb', 'vehicle'); }
    G.combat.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, by, 8, 120); this.speed = 0;
    this.body.traverse(o => { if (o.isMesh) { o.material = shared(G).dark; } }); this.grp.rotation.z += 0.12;
  }
  _ground(x, z) { return Math.max(this.G.colliders.groundAt(x, z, this.pos.y + 0.9, 0.7, 0.05), -1.6); }
  _place(dt, snap) {
    const d = this.def, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx; const p = this.pos;
    const hf = this._ground(p.x + fx * d.wz[0], p.z + fz * d.wz[0]), hb = this._ground(p.x + fx * d.wz[1], p.z + fz * d.wz[1]);
    const w = Math.max(d.wx, 0.3), hl = this._ground(p.x - rx * w, p.z - rz * w), hr = this._ground(p.x + rx * w, p.z + rz * w);
    const y = (hf + hb) / 2, pitch = Math.atan2(hb - hf, d.wz[0] - d.wz[1]), roll = Math.atan2(hr - hl, w * 2) * (d.wx ? 1 : 0.3);
    p.y = snap ? y : (y > p.y ? damp(p.y, y, 22, dt) : Math.max(y, p.y - 12 * dt)); this.pitch = snap ? pitch : damp(this.pitch, pitch, 9, dt); this.roll = snap ? roll : damp(this.roll, roll, 9, dt);
    this.grp.position.set(p.x, p.y + d.wr, p.z); this.grp.rotation.set(this.pitch, this.yaw, -this.roll + this.lean);
    return pitch;
  }
  // play the tank's own track clips: forward, backwards, or turning left/right while moving
  _animate(dt) {
    const c = this.clips || {}; const pick = (n) => Object.keys(c).find(k => k.includes(n)); const sp = this.speed, turn = this.steer;
    let want = null; if (Math.abs(sp) > 0.4) { if (Math.abs(turn) > 0.25) want = turn > 0 ? pick('TurningLeft') : pick('TurningRight'); else want = sp > 0 ? pick('Tank_Forward') : pick('Tank_Backwards'); }
    const name = want || this.anim; if (want && this.anim !== want) { const old = this.anim && c[this.anim]; const nw = c[want]; if (nw) { nw.reset().play(); if (old) old.crossFadeTo(nw, 0.25, false); } this.anim = want; }
    if (this.anim && c[this.anim]) c[this.anim].timeScale = Math.abs(sp) < 0.4 ? 0 : Math.min(2.5, Math.abs(sp) / 6);
    this.mixer.update(dt);
  }
  update(dt) {
    const G = this.G, d = this.def, p = this.pos; if (this.dead) { this.smokeT -= dt; if (this.smokeT <= 0 && p.distanceTo(G.gfx.camera.position) < 200) { this.smokeT = 0.12; G.fx.smoke.spawn(p.x, p.y + 1.2, p.z, 0.3, 2.2, 0.2, 0.08, 0.08, 0.08, 0.5, 0.8, 2.6, 1.4, -0.4, 0.6); } return; }
    if (this.mixer) this._animate(dt);
    const active = this.driver || Math.abs(this.speed) > 0.05; if (!active) return;
    const terr = G.world.heightAt(p.x, p.z); const surf = G.world.surfaceAt(p.x, p.z); const onRoad = surf === 'road' || surf === 'concrete' || p.y > terr + 0.3; const wet = terr < -0.9;
    let max = d.max * (onRoad ? 1 : d.off) * (wet ? 0.3 : 1); let thr = this.driver ? this.thr : 0; if (this.fuel <= 0) thr = 0;
    if (this.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 24 * dt);
    else if (thr !== 0) { const rev = thr < 0; const lim = rev ? max * 0.35 : max; if (Math.sign(this.speed) !== Math.sign(thr) && Math.abs(this.speed) > 1) this.speed += thr * 20 * dt; else this.speed += thr * d.acc * Math.max(0, 1 - Math.abs(this.speed) / lim) * dt; this.fuel = Math.max(0, this.fuel - d.fuelRate * dt); }
    this.speed -= this.speed * (onRoad ? 0.18 : 0.42) * dt; if (thr === 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.6 * dt);
    this.speed -= Math.sin(this.pitch) * -9.8 * 0.55 * dt * (Math.abs(this.pitch) > 0.05 ? 1 : 0);
    const st = this.driver ? (this.steerIn || 0) : 0; this.steer = damp(this.steer, st, 7, dt);
    const maxSteer = 0.6 / (1 + Math.abs(this.speed) / 11); this.yaw += Math.tan(this.steer * maxSteer) * this.speed / d.wb * dt; this.lean = this.type === 'bike' ? damp(this.lean, this.steer * Math.min(0.5, Math.abs(this.speed) * 0.035), 6, dt) : 0;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); const ox = p.x, oz = p.z; p.x += fx * this.speed * dt; p.z += fz * this.speed * dt;
    // collisions: probe the leading edge
    const dir = this.speed >= 0 ? 1 : -1, lead = d.hl * dir, C = G.colliders; let hit = false;
    for (const s of [-1, 0, 1]) { const qx = p.x + fx * lead - fz * s * d.hw * 0.8, qz = p.z + fz * lead + fx * s * d.hw * 0.8; if (C.blocked(qx, qz, p.y + 0.25, 0.3, 1.1)) { hit = true; break; } }
    if (Math.abs(p.x) > 1010 || Math.abs(p.z) > 1010) hit = true;
    if (hit) { const sp = Math.abs(this.speed); p.x = ox; p.z = oz; if (sp > 7) { this.damage((sp - 5) * 9, null); G.audio.vehicleHit(p.x, p.y, p.z); if (this.driver) { this.driver.damage((sp - 7) * 1.6, null, 'limb', 'crash'); if (this.driver && this.driver.isPlayer) G.player.shakeCam(0.8); } G.fx.sparks.spawn(p.x + fx * lead, p.y + 0.8, p.z + fz * lead, 0, 2, 0, 4, 2.5, 1, 1, 0.4, 0.2, 0, 4, 1); } this.speed = -this.speed * 0.22; }
    // run people over
    if (this.driver && this.driver.isPlayer) { const sp = Math.abs(this.speed), road = G.world.surfaceAt(p.x, p.z) === 'road'; if (sp > 2) G.player.shakeCam(Math.min(0.3, sp * (road ? 0.006 : 0.014))); }
    if (Math.abs(this.speed) > 4.5) for (const c of G.chars) { if (!c.alive || c === this.driver || c.mode !== 'ground') continue; const dx = c.pos.x - (p.x + fx * lead * 0.6), dz = c.pos.z - (p.z + fz * lead * 0.6); if (dx * dx + dz * dz < (d.hw + 0.55) ** 2 && Math.abs(c.pos.y - p.y) < 1.6) { c.damage(Math.abs(this.speed) * 6.5, this.driver, 'body', 'vehicle', fx, fz); c.vel.x += fx * this.speed * 0.6; c.vel.z += fz * this.speed * 0.6; this.speed *= 0.88; if (this.driver && this.driver.isPlayer) G.player.shakeCam(0.6); if (c.isPlayer) c.shakeCam(1); } }
    if (terr < -1.5) { this.damage(90 * dt, null); this.speed *= 1 - 2 * dt; }
    this._place(dt, false);
    this.spin += this.speed / d.wr * dt; for (const w of this.wheels) { w.w.rotation.x = this.spin; if (w.front) w.piv.rotation.y = this.steer * maxSteer; }
    // effects
    const cd = p.distanceTo(G.gfx.camera.position);
    if (cd < 150) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.07; if (this.driver) G.fx.exhaust(p.x - fx * d.hl, p.y + 0.4, p.z - fz * d.hl, -fx * 1.5, -fz * 1.5); if (!onRoad && Math.abs(this.speed) > 6) G.fx.dust(p.x - fx * d.hl * 0.8, p.y + 0.1, p.z - fz * d.hl * 0.8, 1); if (this.hp < d.hp * 0.35) G.fx.smoke.spawn(p.x + fx * d.hl * 0.6, p.y + 1.1, p.z + fz * d.hl * 0.6, 0, 1.6, 0, 0.1, 0.1, 0.1, 0.5, 0.5, 1.6, 1.2, -0.3, 0.6); } }
    if (this.driver) { const c = this.driver; const s = d.seat; c.pos.set(p.x + fz * s[0] + fx * s[2], p.y + d.wr + s[1] - 0.2, p.z - fx * s[0] + fz * s[2]); c.yaw = this.yaw; c.pitch = 0;
      if (!c.handL) { c.handL = new THREE.Vector3(); c.handR = new THREE.Vector3(); } const h = d.hands; c.handL.set(h[3], h[1] - s[1] + 0.2 - 0.0, h[2] - s[2]); c.handR.set(-h[3], h[1] - s[1] + 0.2, h[2] - s[2]);
      if (this.type !== 'bike') { c.handL.x += h[0] - s[0]; c.handR.x += h[0] - s[0]; }
      if (Math.abs(this.speed) > 2) G.ai.noise(p.x, p.z, 60, c); }
  }
  rayHit(ox, oy, oz, dx, dy, dz, max) {
    const d = this.def, p = this.pos, c = Math.cos(this.yaw), s = Math.sin(this.yaw); const lx = (ox - p.x) * c - (oz - p.z) * s, lz = (ox - p.x) * s + (oz - p.z) * c, ly = oy - p.y; const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
    let t0 = 0, t1 = max; const sl = (o, dd, mn, mx) => { if (Math.abs(dd) < 1e-8) return o >= mn && o <= mx; let a = (mn - o) / dd, b = (mx - o) / dd; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; return t0 <= t1; };
    if (!sl(lx, ldx, -d.hw, d.hw) || !sl(ly, dy, 0.2, d.hh) || !sl(lz, ldz, -d.hl, d.hl)) return -1; return t0 > 0 ? t0 : -1;
  }
}

export class Vehicles {
  constructor(G) { this.G = G; this.list = []; }
  reset(R) {
    for (const v of this.list) this.G.gfx.scene.remove(v.grp); this.list.length = 0;
    for (const s of this.G.world.vehicleSpots) { if (R.f() < 0.12) continue; const f = this.G.nav.nearestFree(s.x, s.z, 10); if (!f) continue; const d = DEFS[s.type]; if (!d || ((s.type === 'truck' || s.type === 'tank') && !(this.G.assets && this.G.assets.has(s.type === 'tank' ? 'vehicles2/tank' : 'mil/truck')))) continue; this.list.push(new Vehicle(this.G, s.type, f.x, f.z, s.yaw, R.pick(d.colors))); }
  }
  nearest(pos, r) { let best = null, bd = r * r; for (const v of this.list) { if (v.dead || v.driver) continue; const q = (v.pos.x - pos.x) ** 2 + (v.pos.z - pos.z) ** 2; if (q < bd && Math.abs(v.pos.y - pos.y) < 2.5) { bd = q; best = v; } } return best; }
  enter(c, v) { if (v.driver || v.dead) return; if (c.soldier && c.soldier.play) c.soldier.play('Interact'); v.driver = c; c.vehicle = v; c.mode = 'seat'; c.reloadT = -1; c.heal = null; c.vel.set(0, 0, 0); if (c.isPlayer) { c.shakeCam(0.35); this.G.fx.dust(v.pos.x, v.pos.y, v.pos.z, 4); this.G.audio.ui('pick'); this.G.ui.toast(v.fuel <= 0 ? 'OUT OF FUEL' : v.def.name); } }
  eject(c) {
    const v = c.vehicle; if (!v) return; v.driver = null; v.thr = 0; v.steerIn = 0; v.brake = false; c.vehicle = null; if (c.alive) c.mode = 'ground'; c.grounded = false; c.handL = null; c.handR = null;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); for (const [sx, sz] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) { const x = v.pos.x + (-fz * sx) * -(v.def.hw + 0.9) + fx * sz * (v.def.hl + 0.9), z = v.pos.z + (fx * sx) * -(v.def.hw + 0.9) + fz * sz * (v.def.hl + 0.9); if (!this.G.colliders.blocked(x, z, v.pos.y + 0.3, 0.35, 1.7)) { c.pos.set(x, v.pos.y + 0.3, z); break; } }
    c.vel.set(fx * v.speed * 0.5, 0, fz * v.speed * 0.5);
  }
  rayHit(ox, oy, oz, dx, dy, dz, max, ignore) { let best = null, bt = max; for (const v of this.list) { if (v === ignore) continue; const px = v.pos.x - ox, pz = v.pos.z - oz; if (px * px + pz * pz > (max + 4) * (max + 4)) continue; const t = v.rayHit(ox, oy, oz, dx, dy, dz, bt); if (t > 0 && t < bt) { bt = t; best = v; } } return best ? { v: best, t: bt } : null; }
  update(dt) { for (const v of this.list) v.update(dt); }
}
