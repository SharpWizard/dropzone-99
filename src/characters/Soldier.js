// Procedural rigged soldier: one skinned mesh (17 bones) built from code, animated by a
// procedural animator (gait synthesis + two-bone IK for arms and legs + pose blending).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, damp } from '../utils/math.js';

const B = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, lUp: 5, lFore: 6, lHand: 7, rUp: 8, rFore: 9, rHand: 10, lThigh: 11, lShin: 12, lFoot: 13, rThigh: 14, rShin: 15, rFoot: 16 };
const BIND = [[0, 0.96, 0, -1], [0, 1.08, 0, 0], [0, 1.26, 0, 1], [0, 1.5, 0, 2], [0, 1.58, 0, 3],
  [0.21, 1.44, 0, 2], [0.21, 1.16, 0, 5], [0.21, 0.9, 0, 6], [-0.21, 1.44, 0, 2], [-0.21, 1.16, 0, 8], [-0.21, 0.9, 0, 9],
  [0.1, 0.92, 0, 0], [0.1, 0.5, 0, 11], [0.1, 0.09, 0, 12], [-0.1, 0.92, 0, 0], [-0.1, 0.5, 0, 14], [-0.1, 0.09, 0, 15]];
const ARM1 = 0.28, ARM2 = 0.26, LEG1 = 0.42, LEG2 = 0.41;

let GEO = null;
function part(g, color, chain, blend = 0.05) {
  // chain: [boneTop, y1, bone1, y2, bone2 ...] going downward; or a single bone index
  g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    if (typeof chain === 'number') { si[i * 4] = chain; sw[i * 4] = 1; continue; }
    const y = p.getY(i); let a = chain[0], b2 = chain[0], w = 0;
    for (let k = 1; k < chain.length; k += 2) { const jy = chain[k], below = chain[k + 1]; if (y < jy - blend) { a = below; b2 = below; w = 0; } else if (y < jy + blend) { b2 = below; w = 0.5 - (y - jy) / (2 * blend); break; } else break; }
    si[i * 4] = a; sw[i * 4] = 1 - w; si[i * 4 + 1] = b2; sw[i * 4 + 1] = w;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}
const cyl = (rt, rb, h, x, y, z, sx = 1, sz = 1, seg = 10) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 3); g.scale(sx, 1, sz); g.translate(x, y, z); return g; };
const sph = (r, x, y, z, sx = 1, sy = 1, sz = 1, a = Math.PI) => { const g = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, a); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
const box = (w, h, d, x, y, z, rx = 0) => { const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.32); if (rx) g.rotateX(rx); g.translate(x, y, z); return g; };

function buildGeo() {
  const F = [], Gp = []; // fabric (camo) parts, gear parts
  const torso = [B.chest, 1.24, B.spine, 1.07, B.hips];
  F.push(part(cyl(0.2, 0.172, 0.27, 0, 1.365, 0, 1, 0.66, 12), 0xffffff, torso), part(cyl(0.172, 0.168, 0.2, 0, 1.15, 0, 1, 0.68, 12), 0xffffff, torso), part(cyl(0.168, 0.175, 0.16, 0, 0.99, 0, 1, 0.72, 12), 0xffffff, torso), part(sph(0.178, 0, 0.92, 0, 1, 0.5, 0.7), 0xf0f0f0, B.hips));
  for (const s of [1, -1]) {
    const up = s > 0 ? B.lUp : B.rUp, fo = s > 0 ? B.lFore : B.rFore, ha = s > 0 ? B.lHand : B.rHand, th = s > 0 ? B.lThigh : B.rThigh, sh = s > 0 ? B.lShin : B.rShin, ft = s > 0 ? B.lFoot : B.rFoot;
    const arm = [B.chest, 1.47, up, 1.16, fo, 0.91, ha], leg = [B.hips, 0.93, th, 0.5, sh, 0.1, ft];
    F.push(part(sph(0.078, s * 0.205, 1.44, 0, 1, 1, 1), 0xffffff, arm, 0.03), part(cyl(0.06, 0.05, 0.3, s * 0.21, 1.3, 0), 0xffffff, arm), part(cyl(0.05, 0.04, 0.27, s * 0.21, 1.035, 0), 0xf4f4f4, arm), part(sph(0.052, s * 0.21, 1.16, 0), 0xffffff, arm));
    F.push(part(cyl(0.092, 0.072, 0.44, s * 0.1, 0.71, 0, 1, 1.05), 0xffffff, leg, 0.06), part(cyl(0.068, 0.052, 0.38, s * 0.1, 0.305, 0), 0xf2f2f2, leg), part(sph(0.073, s * 0.1, 0.5, 0.005), 0xffffff, leg, 0.06));
    Gp.push(part(sph(0.046, s * 0.21, 0.865, 0.005, 0.85, 1.25, 1), 0x1c1c1a, ha), part(box(0.07, 0.035, 0.05, s * 0.21, 0.915, 0), 0x2a2a26, ha));
    Gp.push(part(box(0.105, 0.11, 0.27, s * 0.1, 0.055, 0.045), 0x161512, ft), part(cyl(0.062, 0.058, 0.13, s * 0.1, 0.155, 0), 0x1c1a16, sh), part(box(0.107, 0.025, 0.28, s * 0.1, 0.012, 0.045), 0x0c0c0b, ft));
    Gp.push(part(box(0.11, 0.13, 0.05, s * 0.1, 0.5, 0.065), 0x2b2e24, sh), part(box(0.085, 0.14, 0.05, s * 0.2, 1.33, 0.0), 0x33372b, up));
  }
  // helmet (camo cover) + head
  F.push(part(sph(0.128, 0, 1.635, -0.005, 1, 0.96, 1.13, Math.PI * 0.56), 0xdcdcdc, B.head));
  Gp.push(part(cyl(0.052, 0.06, 0.1, 0, 1.52, 0), 0xb08a6a, B.neck), part(sph(0.103, 0, 1.6, 0.005, 0.92, 1.12, 1), 0xb89070, B.head));
  Gp.push(part(box(0.17, 0.045, 0.06, 0, 1.615, 0.085), 0x15171a, B.head), part(box(0.2, 0.05, 0.14, 0, 1.56, 0.04), 0x2a2d24, B.head), part(box(0.265, 0.03, 0.3, 0, 1.628, 0.0), 0x30342a, B.head), part(box(0.035, 0.11, 0.09, 0.118, 1.6, -0.01), 0x1c1d1a, B.head), part(box(0.035, 0.11, 0.09, -0.118, 1.6, -0.01), 0x1c1d1a, B.head), part(box(0.06, 0.04, 0.05, 0, 1.72, 0.1), 0x1a1a1a, B.head));
  // plate carrier, pouches, belt, backpack
  const vest = 0x3a3e30, pouch = 0x2e3226;
  Gp.push(part(box(0.37, 0.34, 0.05, 0, 1.33, 0.125), vest, B.chest), part(box(0.37, 0.36, 0.05, 0, 1.33, -0.125), vest, B.chest), part(box(0.05, 0.3, 0.25, 0.185, 1.3, 0), vest, B.chest), part(box(0.05, 0.3, 0.25, -0.185, 1.3, 0), vest, B.chest));
  Gp.push(part(box(0.075, 0.07, 0.3, 0.12, 1.5, 0), vest, B.chest), part(box(0.075, 0.07, 0.3, -0.12, 1.5, 0), vest, B.chest));
  for (const x of [-0.11, 0, 0.11]) Gp.push(part(box(0.085, 0.14, 0.055, x, 1.235, 0.17), pouch, B.chest));
  Gp.push(part(box(0.1, 0.08, 0.05, 0.1, 1.4, 0.16), pouch, B.chest), part(box(0.06, 0.1, 0.045, -0.11, 1.41, 0.16), 0x1a1a1a, B.chest));
  Gp.push(part(cyl(0.178, 0.178, 0.055, 0, 1.03, 0, 1, 0.74, 12), 0x23241e, B.hips), part(box(0.07, 0.17, 0.09, -0.185, 0.9, 0.02), 0x1e1e1b, B.rThigh), part(box(0.1, 0.11, 0.07, 0.17, 0.97, 0.03), pouch, B.hips), part(box(0.14, 0.1, 0.07, 0, 0.99, -0.13), pouch, B.hips));
  Gp.push(part(box(0.3, 0.4, 0.17, 0, 1.33, -0.235), 0x343829, B.chest), part(box(0.22, 0.18, 0.06, 0, 1.25, -0.345), 0x2c3024, B.chest), part(cyl(0.065, 0.065, 0.32, 0, 0, 0).rotateZ(Math.PI / 2).translate(0, 1.565, -0.22), 0x4a4a38, B.chest));
  const fab = mergeGeometries(F), gear = mergeGeometries(Gp);
  // camo UVs: project by position so the pattern is continuous
  const uv = fab.attributes.uv, p = fab.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i) * 0.6) * 2.2, p.getY(i) * 2.2);
  const g = mergeGeometries([fab, gear], true); g.computeBoundingSphere(); return g;
}

export const OUTFITS = [{ name: 'WOODLAND', c: 0xffffff }, { name: 'DESERT', c: 0xf2d9a8 }, { name: 'URBAN', c: 0xb9c2cc }, { name: 'NIGHT OPS', c: 0x5c6670 }, { name: 'ARCTIC', c: 0xf4f6f8, bright: 1.7 }, { name: 'CRIMSON', c: 0xc86a58 }];
let MATS = null;
function mats(G) {
  if (MATS) return MATS; const T = G.T.camo; T.map.wrapS = T.map.wrapT = T.normalMap.wrapS = T.normalMap.wrapT = THREE.RepeatWrapping;
  MATS = { gear: G.gfx.std({ vertexColors: true, roughness: 0.72, metalness: 0.05 }), fab: OUTFITS.map(o => G.gfx.std({ map: T.map, normalMap: T.normalMap, vertexColors: true, roughness: 0.92, color: new THREE.Color(o.c).multiplyScalar(o.bright || 1.25) })) };
  return MATS;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _e = new THREE.Euler();
const DOWN = new THREE.Vector3(0, -1, 0), XA = new THREE.Vector3(1, 0, 0), YA = new THREE.Vector3(0, 1, 0);
const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _E = new THREE.Vector3(), _pole = new THREE.Vector3(), _d = new THREE.Vector3();
const _qU = new THREE.Quaternion(), _qF = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _pl = new THREE.Vector3(), _wq = new THREE.Quaternion();

export class Soldier {
  constructor(G, outfit = 0) {
    this.G = G; if (!GEO) GEO = buildGeo(); const M = mats(G);
    this.group = new THREE.Group(); this.group.rotation.order = 'YXZ';
    this.bones = BIND.map(() => new THREE.Bone());
    BIND.forEach(([x, y, z, par], i) => { const b = this.bones[i]; if (par < 0) b.position.set(x, y, z); else { b.position.set(x - BIND[par][0], y - BIND[par][1], z - BIND[par][2]); this.bones[par].add(b); } });
    this.mesh = new THREE.SkinnedMesh(GEO, [M.fab[outfit % M.fab.length], M.gear]);
    this.mesh.add(this.bones[0]); this.mesh.bind(new THREE.Skeleton(this.bones)); this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.mount = new THREE.Group(); this.group.add(this.mount); // weapon mount (model space)
    this.weapon = null;
    // animation state
    this.phase = Math.random() * 6; this.k = { crouch: 0, prone: 0, aim: 0, move: 0, air: 0, sprint: 0, dead: 0, chute: 0, fall: 0, seat: 0, swim: 0, kick: 0, flinch: 0, lean: 0 };
    this.wp = new THREE.Vector3(-0.16, 1.12, 0.22); this.wq = new THREE.Quaternion(); this.deadDir = 1; this.fp = false; this.idle = Math.random() * 10;
  }
  setOutfit(i) { this.mesh.material = [mats(this.G).fab[i % OUTFITS.length], mats(this.G).gear]; }
  setWeapon(obj) { if (this.weapon) this.mount.remove(this.weapon); this.weapon = obj; if (obj) this.mount.add(obj); }
  setChute(on) {
    if (on && !this.chute) { this.chute = makeChute(this.G); this.group.add(this.chute); }
    if (this.chute) this.chute.visible = on;
  }

  // two-bone IK in model space. S: root joint, T: target, returns elbow/knee in _E, clamps T
  _ik(S, T, l1, l2, pole) {
    _d.subVectors(T, S); let dist = _d.length(); const max = l1 + l2 - 0.004; if (dist > max) { _d.multiplyScalar(max / dist); dist = max; T.copy(S).add(_d); } if (dist < 0.06) { dist = 0.06; }
    _d.normalize(); const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist); const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _pole.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_pole.lengthSq() < 1e-6) _pole.set(0, 0, 1); _pole.normalize();
    _E.copy(S).addScaledVector(_d, a).addScaledVector(_pole, h);
  }
  _limb(up, fore, end, parentQ, S, T, l1, l2, pole, endQ) {
    this._ik(S, T, l1, l2, pole);
    _v.subVectors(_E, S).normalize(); _qU.setFromUnitVectors(DOWN, _v);
    _v.subVectors(T, _E).normalize(); _qF.setFromUnitVectors(DOWN, _v);
    this.bones[up].quaternion.copy(_qP.copy(parentQ).invert()).multiply(_qU);
    this.bones[fore].quaternion.copy(_qP.copy(_qU).invert()).multiply(_qF);
    if (endQ) this.bones[end].quaternion.copy(_qP.copy(_qF).invert()).multiply(endQ); else this.bones[end].quaternion.identity();
  }

  /* st: { dt, speed, moveAng, stance(0/1/2), aiming, pitch, mode('ground'|'air'|'fall'|'chute'|'seat'|'dead'|'swim'), weapon('rifle'|'pistol'|'none'),
           reload(0..1|-1), sprint, fired, hurt, handL, handR (model-space Vector3 for seat mode) } */
  animate(st) {
    const dt = st.dt, k = this.k, b = this.bones;
    const tgt = (name, v, rate = 10) => { k[name] = damp(k[name], v, rate, dt); };
    const mode = st.mode;
    tgt('crouch', st.stance === 1 && mode === 'ground' ? 1 : 0, 9); tgt('prone', st.stance === 2 && mode === 'ground' ? 1 : 0, 6);
    tgt('aim', st.aiming ? 1 : 0, 12); tgt('move', clamp(st.speed / 5.2, 0, 1.4), 9); tgt('air', mode === 'air' ? 1 : 0, 10); tgt('sprint', st.sprint ? 1 : 0, 7);
    tgt('dead', mode === 'dead' ? 1 : 0, 5.5); tgt('chute', mode === 'chute' ? 1 : 0, 6); tgt('fall', mode === 'fall' ? 1 : 0, 5); tgt('seat', mode === 'seat' ? 1 : 0, 9); tgt('swim', mode === 'swim' ? 1 : 0, 6);
    if (st.fired) k.kick = 1; k.kick = damp(k.kick, 0, 18, dt); if (st.hurt) k.flinch = 1; k.flinch = damp(k.flinch, 0, 9, dt);
    const stride = 0.56 + 0.11 * st.speed; this.phase += dt * st.speed / stride * Math.PI; this.idle += dt;
    const ph = this.phase, mv = Math.min(1, k.move * 1.3), pitch = st.pitch || 0;
    const breath = Math.sin(this.idle * 1.6) * 0.006;

    // ---- hips
    const low = Math.max(k.crouch, k.seat);
    let hy = 0.955 - k.crouch * 0.36 - k.seat * 0.42 - Math.abs(Math.sin(ph)) * 0.04 * mv * (1 - k.prone) + breath;
    hy = lerp(hy, 0.2, k.prone); hy = lerp(hy, 0.17, k.dead); hy -= k.air * 0.02; hy = lerp(hy, 0.9, Math.max(k.fall, k.chute)); hy = lerp(hy, 0.42, k.swim);
    let hp = 0.07 * mv + k.sprint * 0.14 + k.crouch * 0.26 + k.seat * -0.22; hp = lerp(hp, 1.46, k.prone); hp = lerp(hp, 1.35, k.fall); hp = lerp(hp, 1.1, k.swim); hp = lerp(hp, this.deadDir * 1.5, k.dead);
    const sway = Math.sin(ph) * 0.05 * mv;
    b[0].position.set(sway * 0.4, hy, k.prone * -0.05 + k.dead * this.deadDir * -0.35);
    _e.set(hp, Math.sin(ph) * 0.09 * mv * (1 - k.prone) + k.dead * 0.3, -sway * 0.5, 'YXZ'); b[0].quaternion.setFromEuler(_e);
    // ---- spine / chest / head
    const upK = (1 - k.prone) * (1 - k.dead) * (1 - k.fall);
    const ap = -pitch * (0.25 + 0.35 * k.aim) * upK;
    _e.set(ap * 0.5 - hp * 0.35 * upK * (1 - k.seat) + k.prone * -0.18 + k.flinch * 0.12, -Math.sin(ph) * 0.07 * mv, 0, 'YXZ'); b[1].quaternion.setFromEuler(_e);
    _e.set(ap * 0.5 - hp * 0.3 * upK * (1 - k.seat) + k.prone * -0.3 + k.fall * -0.35 + k.kick * -0.02, -Math.sin(ph) * 0.05 * mv + k.aim * -0.12 * upK * (st.weapon === 'rifle' ? 1 : 0), 0, 'YXZ'); b[2].quaternion.setFromEuler(_e);
    _e.set(-pitch * 0.25 * upK + k.prone * -0.45 + k.fall * -0.5 + k.swim * -0.6 + k.dead * 0.2, k.aim * 0.12 * upK * (st.weapon === 'rifle' ? 1 : 0), 0, 'YXZ'); b[3].quaternion.setFromEuler(_e);
    b[4].quaternion.identity(); if (this.fp) b[4].scale.setScalar(0.001); else b[4].scale.setScalar(1);
    // model-space chain
    const qH = b[0].quaternion, pH = b[0].position;
    const qS = _q.copy(qH).multiply(b[1].quaternion), pS = _v.copy(b[1].position).applyQuaternion(qH).add(pH);
    const qC = _q2.copy(qS).multiply(b[2].quaternion), pC = _v2.copy(b[2].position).applyQuaternion(qS).add(pS);
    const anchor = _v3.set(0, 0.2, 0).applyQuaternion(qC).add(pC);

    // ---- legs
    const ma = st.moveAng || 0, mx = Math.sin(ma), mz = Math.cos(ma);
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1, th = s === 0 ? B.lThigh : B.rThigh; const p = ph + (s === 0 ? 0 : Math.PI);
      _S.set(side * 0.1, -0.04, 0).applyQuaternion(qH).add(pH);
      const A = Math.min(0.5, stride * 0.5) * mv * (1 - k.prone * 0.75), along = -Math.cos(p) * A, lift = Math.max(0, Math.sin(p)) * (0.07 + 0.11 * mv) * mv;
      _T.set(side * (0.1 + k.crouch * 0.07) + mx * along, 0.09 + lift, mz * along + k.crouch * (side > 0 ? 0.12 : -0.1));
      let toe = lift * 2.2 - Math.max(0, -Math.cos(p)) * 0.25 * mv, poleX = side * 0.12, poleY = 0.1, poleZ = 1;
      if (k.seat > 0.01) { _T.lerp(_d.set(side * 0.16, 0.2, 0.52), k.seat); _T.copy(_T); }
      if (k.prone > 0.01) { _T.lerp(_d.set(side * 0.15, 0.07, -0.86 + Math.sin(p) * 0.1 * mv), k.prone); toe = lerp(toe, 1.3, k.prone); poleY = lerp(poleY, -0.3, k.prone); poleX = side * 0.4; }
      if (k.air > 0.01) { _T.lerp(_d.set(side * 0.11, hy - 0.74 + (side > 0 ? 0.1 : 0), side > 0 ? 0.16 : -0.1), k.air); toe = lerp(toe, 0.5, k.air); }
      if (k.chute > 0.01) { _T.lerp(_d.set(side * 0.12, hy - 0.72, 0.12 + Math.sin(this.idle * 1.3 + s) * 0.05), k.chute); toe = lerp(toe, 0.4, k.chute); }
      if (k.fall > 0.01) { _T.lerp(_d.set(side * 0.3, hy + 0.08 + Math.sin(this.idle * 7 + s * 2) * 0.03, -0.72), k.fall); toe = lerp(toe, 1.2, k.fall); poleY = lerp(poleY, 1, k.fall); }
      if (k.swim > 0.01) { _T.lerp(_d.set(side * 0.14, hy - 0.2 + Math.sin(this.idle * 5 + s * 3.14) * 0.14, -0.62), k.swim); toe = lerp(toe, 1.2, k.swim); }
      if (k.dead > 0.01) { _T.lerp(_d.set(side * 0.2, 0.07, this.deadDir * -0.95 + (side > 0 ? 0.1 : -0.05)), k.dead); toe = lerp(toe, -this.deadDir * 1.2, k.dead); poleX = side; poleY = 0.6; }
      _pole.set(poleX, poleY, poleZ); _e.set(toe, 0, 0); _q3.setFromEuler(_e);
      _pl.copy(_pole); this._limb(th, th + 1, th + 2, qH, _S, _T, LEG1, LEG2, _pl, _q3);
    }

    // ---- weapon pose (model space) + arms
    const armed = st.weapon !== 'none', pistol = st.weapon === 'pistol';
    const aimQ = _q3; _e.set(-pitch, 0, 0); aimQ.setFromEuler(_e);
    const wpT = _S, wqT = _wq.identity(); let aimK = k.aim * upK;
    const proneAim = k.prone;
    if (armed) {
      // low-ready
      const bob = Math.sin(ph * 2) * 0.012 * mv;
      wpT.set(-0.15 + k.sprint * 0.05, -0.31 + bob - k.sprint * 0.02, 0.2).applyQuaternion(qC).add(anchor);
      _e.set(0.5 + k.sprint * 0.25, 0.6 + k.sprint * 0.25, 0.25, 'YXZ'); wqT.setFromEuler(_e);
      if (pistol) { wpT.set(-0.2, -0.38 + bob, 0.2).applyQuaternion(qC).add(anchor); _e.set(0.9, 0.1, 0, 'YXZ'); wqT.setFromEuler(_e); }
      const ak = Math.max(aimK, proneAim * (1 - k.dead));
      if (ak > 0.001) {
        _T.set(pistol ? -0.03 : -0.135, pistol ? -0.06 : -0.115, pistol ? 0.46 : 0.25).applyQuaternion(aimQ).add(anchor);
        wpT.lerp(_T, ak); wqT.slerp(aimQ, ak);
      }
      if (st.reload >= 0) { const r = Math.sin(st.reload * Math.PI); _e.set(-0.25 * r, 0.25 * r, -0.5 * r); _qF.setFromEuler(_e); wqT.multiply(_qF); wpT.y -= 0.03 * r; }
      if (k.kick > 0.01) { _T.set(0, 0.012, -0.045).multiplyScalar(k.kick).applyQuaternion(wqT); wpT.add(_T); _e.set(-0.045 * k.kick, 0, 0); _qF.setFromEuler(_e); wqT.multiply(_qF); }
    }
    const special = Math.max(k.dead, k.chute, k.fall, k.seat, k.swim);
    this.wp.lerp(wpT, 1 - Math.exp(-16 * dt)); this.wq.slerp(wqT, 1 - Math.exp(-16 * dt));
    if (armed) { this.mount.position.copy(this.wp); this.mount.quaternion.copy(this.wq); }
    this.mount.visible = armed && k.fall < 0.5 && k.chute < 0.5 && k.swim < 0.5;
    const W = this.weapon && this.weapon.userData;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1, up = s === 0 ? B.lUp : B.rUp;
      _S.set(side * 0.21, 0.18, 0).applyQuaternion(qC).add(pC);
      // default: relaxed swing
      _T.set(side * (0.27 + mv * 0.03), hy + 0.0 + k.crouch * 0.1, -Math.sin(ph + (s === 0 ? Math.PI : 0)) * 0.26 * mv + 0.04).applyQuaternion(_qF.setFromAxisAngle(YA, 0));
      _T.y = Math.max(_T.y, 0.12); if (k.prone > 0.01) _T.lerp(_d.set(side * 0.3, 0.1, 0.55), k.prone);
      if (armed && special < 0.99) {
        if (s === 1) _d.copy(this.wp); // right hand on the grip
        else { _d.copy(W ? W.fore : _v.set(0, 0, 0.3)); if (pistol) _d.set(0.035, -0.03, 0.0); if (st.reload >= 0) { const r = st.reload; const m = W ? W.magPos : _d; const t2 = r < 0.25 ? r / 0.25 : r < 0.5 ? 1 : r < 0.8 ? 1 : (1 - r) / 0.2; const dip = r > 0.25 && r < 0.8 ? Math.sin((r - 0.25) / 0.55 * Math.PI) : 0; _d.lerp(_pole.copy(m), clamp(t2, 0, 1)); _d.y -= dip * 0.22; _d.x += dip * 0.08; } _d.applyQuaternion(this.wq).add(this.wp); }
        _T.lerp(_d, 1 - special);
      }
      if (k.chute > 0.01) _T.lerp(_d.set(side * 0.3, 0.44, 0.04).applyQuaternion(qC).add(anchor), k.chute);
      if (k.fall > 0.01) _T.lerp(_d.set(side * 0.52, -0.02 + Math.sin(this.idle * 8 + s) * 0.02, 0.28).applyQuaternion(qC).add(anchor), k.fall);
      if (k.swim > 0.01) _T.lerp(_d.set(side * (0.25 + Math.sin(this.idle * 3 + s * 3.14) * 0.15), -0.05, 0.42 + Math.cos(this.idle * 3 + s * 3.14) * 0.12).applyQuaternion(qC).add(anchor), k.swim);
      if (k.seat > 0.01 && st.handL) _T.lerp(s === 0 ? st.handL : st.handR, k.seat);
      if (k.dead > 0.01) _T.lerp(_d.set(side * 0.5, 0.06, this.deadDir * 0.5), k.dead);
      _pl.set(side * 0.7, -0.75, -0.35); if (k.prone > 0.3 || k.fall > 0.3) _pl.set(side, 0.1, -0.2);
      this._limb(up, up + 1, up + 2, qC, _S, _T, ARM1, ARM2, _pl, null);
    }
    if (this.chute && this.chute.visible) { this.chute.scale.setScalar(clamp(k.chute * 1.3, 0.05, 1)); this.chute.rotation.z = Math.sin(this.idle * 0.9) * 0.05; }
  }
}

let CHUTE_GEO = null, CHUTE_MAT = null, LINE_MAT = null;
// procedural canopy (the jetpack is the usual descent rig; this is its fallback)
export function makeChute(G) {
  if (!CHUTE_GEO) {
    const g = new THREE.SphereGeometry(3.4, 16, 5, 0, Math.PI * 2, 0, 1.05); g.scale(1, 0.62, 1); const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const seg = Math.floor((a + Math.PI) / (Math.PI * 2) * 16 + 0.001); col.set(seg % 2 ? 0x596b3a : 0xc8662a); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.translate(0, 3.6, 0); CHUTE_GEO = g;
    CHUTE_MAT = G.gfx.std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }); LINE_MAT = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
  }
  const grp = new THREE.Group(); const m = new THREE.Mesh(CHUTE_GEO, CHUTE_MAT); m.castShadow = true; grp.add(m);
  const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push(new THREE.Vector3(i % 2 ? 0.2 : -0.2, 1.5, 0), new THREE.Vector3(Math.cos(a) * 2.9, 4.05, Math.sin(a) * 2.9)); }
  grp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), LINE_MAT)); grp.visible = false; return grp;
}
