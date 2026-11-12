// Rigged GLB soldier ("SWAT" by Quaternius, CC0) driven by its mocap-style clips for locomotion,
// with procedural layers on top: aim pitch, two-bone IK for both arms onto the weapon, IK legs for crouch / seat,
// and whole-body pivots for prone / freefall / parachute / swimming. Same interface as the procedural Soldier.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { clamp, damp, lerp } from '../utils/math.js';
import { makeChute } from './Soldier.js';

let JET = null;
function makeJetpack(G) {
  if (!G.assets || !G.assets.has('vehicles2/jetpack')) return null;
  if (!JET) {
    const st = G.assets.static('vehicles2/jetpack'); const c = st.box.getCenter(new THREE.Vector3()); const sc = 0.62 / st.size.y;
    JET = { parts: st.list.map(p => { const g = p.geo.clone(); g.translate(-c.x, -c.y, -c.z); g.scale(sc, sc, sc); return { geo: g, mat: p.mat }; }),
      flameGeo: new THREE.ConeGeometry(0.075, 0.7, 10, 1, true).rotateX(Math.PI).translate(0, -0.35, 0),
      core: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 1.6), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      outer: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 1.1, 0.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }) };
  }
  const grp = new THREE.Group(); const body = new THREE.Group(); body.rotation.y = Math.PI; grp.add(body);
  for (const p of JET.parts) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; body.add(m); }
  const flames = [];
  for (const x of [-0.11, 0.11]) { const o = new THREE.Mesh(JET.flameGeo, JET.outer); o.position.set(x, -0.3, -0.02); o.scale.set(1.7, 1.3, 1.7); const c = new THREE.Mesh(JET.flameGeo, JET.core); c.position.set(x, -0.3, -0.02); grp.add(o, c); flames.push(o, c); }
  grp.userData = { jet: true, flames }; grp.visible = false; return grp;
}
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GLB_OUTFITS = [0x4d5c3a, 0xa38c5c, 0x6c737c, 0x23272e, 0xd9dddd, 0x7c2f29];
export const HERO_KEY = 'single/hero';
import { PEOPLE_KEYS } from '../assets/Assets.js';
export { PEOPLE_KEYS };
const BODY_MAT = ['SciFi_Main', 'Swat', 'Astronaut', 'Hazmat', 'Body', 'Main'];
// enemy pool: the SWAT-style rigs share the hero's clip names; the Universal-rig characters need their names mapped
export const ENEMY_KEYS = ['enemies/soldier', 'enemies/swat_enemy', 'enemies/scifi_char', 'enemies/astro_a', 'enemies/astro_b', 'enemies/astro_c', 'enemies/hazmat', 'enemies/char_enemy', 'enemies/animal_panda', 'enemies/animal_bee', 'enemies/animal_flamingo', 'enemies/animal_frog'];
// animal characters: no arms, so they carry no weapon; their own walk / run / hit / death clips drive them
const ANIMAL = new Set(['enemies/animal_panda', 'enemies/animal_bee', 'enemies/animal_flamingo', 'enemies/animal_frog']);
const ANIMAL_CLIPS = { Idle: 'Idle', Idle_Gun: 'Idle', Idle_Gun_Pointing: 'Idle', Idle_Gun_Shoot: 'Idle', Idle_Neutral: 'Idle', Idle_Sword: 'Idle', Gun_Shoot: 'Shoot_Small', Walk: 'Walk', Run: 'Run', Run_Back: 'Walk', Run_Left: 'Walk', Run_Right: 'Walk', Run_Shoot: 'Run', Death: 'Death', HitRecieve: 'HitRecieve_1', HitRecieve_2: 'HitRecieve_2', Interact: 'Pickup', Roll: 'Jump', Wave: 'Hello', Punch_Left: 'Kick', Punch_Right: 'Kick', Kick_Left: 'Kick', Kick_Right: 'Kick', Sword_Slash: 'Kick' };
// the Swarm (Ultimate Monsters Bundle, CC0): humanoid-rigged creatures that share the universal clip set
export const ALIEN_KEYS = ['monsters/alien_free_model_b', 'monsters/alien_free_model_b', 'monsters/alien_free_model_b', 'monsters/blue_demon_free_model', 'monsters/demon_free_model_b', 'monsters/yeti_free_model_b', 'monsters/orc_free_model', 'monsters/ninja_free_model_b'];
const UNIVERSAL = new Set(['enemies/astro_a', 'enemies/astro_b', 'enemies/astro_c', 'enemies/hazmat', 'enemies/char_enemy', ...ALIEN_KEYS]);
const TPLS = new Map();
// Universal-rig clip fallbacks for every clip name the soldier uses
const UNI = { Idle: ['Idle'], Idle_Gun: ['Idle_Gun', 'Idle_Shoot', 'Weapon', 'Idle'], Idle_Gun_Pointing: ['Idle_Shoot', 'Idle_Gun', 'Weapon', 'Idle'], Idle_Gun_Shoot: ['Idle_Shoot', 'Idle_Gun', 'Idle'], Gun_Shoot: ['Idle_Shoot', 'Idle_Gun', 'Idle'],
  Walk: ['Walk', 'Walk_Gun', 'Walk_Shoot'], Run: ['Run', 'Run_Gun'], Run_Back: ['Run', 'Run_Gun'], Run_Left: ['Run', 'Run_Gun'], Run_Right: ['Run', 'Run_Gun'], Run_Shoot: ['Run_Gun_Shoot', 'Run_Shoot', 'Run_Gun', 'Run'],
  Death: ['Death'], HitRecieve: ['HitReact'], HitRecieve_2: ['HitReact'], Interact: ['Wave'], Roll: ['Duck'], Punch_Left: ['Punch'], Punch_Right: ['Punch'], Kick_Left: ['Punch'], Kick_Right: ['Punch'], Sword_Slash: ['Punch'], Idle_Sword: ['Idle'], Idle_Neutral: ['Idle'], Wave: ['Wave'] };
// every clip in the character file; SHOTS are one-shot actions triggered by game events
const CLIPS = ['Idle', 'Idle_Gun', 'Idle_Gun_Pointing', 'Idle_Gun_Shoot', 'Idle_Neutral', 'Idle_Sword', 'Walk', 'Run', 'Run_Back', 'Run_Left', 'Run_Right', 'Run_Shoot', 'Death', 'HitRecieve', 'HitRecieve_2', 'Gun_Shoot', 'Interact', 'Roll', 'Kick_Left', 'Kick_Right', 'Punch_Left', 'Punch_Right', 'Sword_Slash', 'Wave'];
const SHOTS = new Set(['Gun_Shoot', 'Interact', 'Roll', 'Kick_Left', 'Kick_Right', 'Punch_Left', 'Punch_Right', 'Sword_Slash', 'Wave', 'Idle_Neutral', 'Idle_Sword', 'Idle_Gun_Shoot', 'HitRecieve', 'HitRecieve_2']);
const MELEE = ['Punch_Left', 'Punch_Right', 'Kick_Left', 'Kick_Right', 'Sword_Slash'];
const COMBO = ['Punch_Left', 'Punch_Right', 'Kick_Right', 'Punch_Left', 'Kick_Left', 'Sword_Slash'];
const NOM = { Walk: 1.9, Run: 5.4, Run_Back: 4.2, Run_Left: 4.6, Run_Right: 4.6, Run_Shoot: 5.0 };
const _shotNames = [];

function template(G, key = HERO_KEY) {
  if (TPLS.has(key)) return TPLS.get(key); const g = G.assets && G.assets.get(key); if (!g) return null;
  g.scene.updateMatrixWorld(true); const head = g.scene.getObjectByName('Head'); const hy = head.getWorldPosition(new THREE.Vector3()).y;
  const raw = {}; for (const c of g.animations) raw[c.name.split('|').pop()] = c;
  const clips = {}; if (ANIMAL.has(key)) { for (const want in ANIMAL_CLIPS) { const src = ANIMAL_CLIPS[want]; if (raw[src]) clips[want] = raw[src].clone(); } } else if (UNIVERSAL.has(key)) { for (const want in UNI) { const src = UNI[want].find(n => raw[n]); if (src) clips[want] = raw[src].clone(); } if (raw.Death) clips.Death = raw.Death; }
  else for (const n of CLIPS) if (raw[n]) clips[n] = raw[n];
  const mats = GLB_OUTFITS.map(() => null); let base = null; g.scene.traverse(o => { if (o.isMesh && o.material && BODY_MAT.includes(o.material.name)) base = o.material; });
  const T = { key, scene: g.scene, scale: 1.6 / hy, clips, base, mats, G, universal: UNIVERSAL.has(key), animal: ANIMAL.has(key) };
  TPLS.set(key, T); return T;
}
// ---- original tactical kit bolted onto the rig: plate carrier, pouches, pack, pauldrons, helmet gear, knee pads.
// Pieces are authored in metres relative to a bone (model axes: x left, y up, z forward) and follow that bone.
const VEST = 0x3a4033, POUCH = 0x2c3027, PACK = 0x464c39, BLK = 0x17181a, TAN = 0x6e6248, STRAP = 0x24271f;
const KIT = {
  Chest: [[0.31, 0.27, 0.075, 0, -0.08, 0.125, VEST], [0.31, 0.3, 0.06, 0, -0.07, -0.13, VEST], [0.07, 0.07, 0.27, 0.115, 0.1, 0, STRAP], [0.07, 0.07, 0.27, -0.115, 0.1, 0, STRAP],
    [0.3, 0.37, 0.15, 0, -0.1, -0.235, PACK], [0.22, 0.15, 0.05, 0, -0.17, -0.33, POUCH], [0.3, 0.1, 0.1, 0, 0.13, -0.23, TAN, 0.05], [0.05, 0.13, 0.045, 0.115, 0.03, 0.17, BLK], [0.012, 0.16, 0.012, 0.135, 0.17, 0.16, BLK],
    [0.09, 0.07, 0.04, -0.09, 0.0, 0.175, POUCH], [0.05, 0.05, 0.25, 0.165, -0.12, 0, VEST], [0.05, 0.05, 0.25, -0.165, -0.12, 0, VEST]],
  Torso: [[0.085, 0.14, 0.055, -0.1, 0.02, 0.165, POUCH], [0.085, 0.14, 0.055, 0, 0.02, 0.172, POUCH], [0.085, 0.14, 0.055, 0.1, 0.02, 0.165, POUCH], [0.3, 0.06, 0.24, 0, -0.07, 0.0, STRAP]],
  Head: [[0.1, 0.055, 0.075, 0, 0.2, 0.115, BLK], [0.05, 0.045, 0.06, 0, 0.165, 0.15, BLK], [0.04, 0.1, 0.09, 0.128, 0.07, 0.0, BLK], [0.04, 0.1, 0.09, -0.128, 0.07, 0.0, BLK], [0.03, 0.03, 0.06, 0.1, 0.2, 0.03, 0x3a3d40], [0.02, 0.02, 0.2, -0.125, 0.15, 0.0, 0x2a2c2e]],
  UpperArmL: [[0.1, 0.13, 0.135, 0.035, -0.03, 0, VEST], [0.09, 0.05, 0.11, 0.03, -0.12, 0, POUCH]], UpperArmR: [[0.1, 0.13, 0.135, -0.035, -0.03, 0, VEST], [0.09, 0.05, 0.11, -0.03, -0.12, 0, POUCH]],
  Hips: [[0.11, 0.11, 0.07, 0.15, 0.07, 0.05, POUCH], [0.1, 0.1, 0.07, -0.15, 0.07, 0.04, POUCH], [0.17, 0.11, 0.075, 0, 0.06, -0.14, POUCH]],
  UpperLegR: [[0.06, 0.2, 0.11, -0.085, -0.17, 0.0, BLK], [0.07, 0.03, 0.13, -0.08, -0.08, 0.0, STRAP]], UpperLegL: [[0.07, 0.16, 0.11, 0.085, -0.16, -0.01, POUCH]],
  LowerLegL: [[0.115, 0.14, 0.06, 0, -0.03, 0.065, BLK]], LowerLegR: [[0.115, 0.14, 0.06, 0, -0.03, 0.065, BLK]],
};
function kit(T) {
  if (T.kit) return T.kit; T.kit = []; const mat = T.G.gfx.std({ vertexColors: true, roughness: 0.86, metalness: 0.04 }); const inv = new THREE.Matrix4(), D = new THREE.Matrix4(), p = new THREE.Vector3(), c = new THREE.Color();
  const k = 1 / T.scale; // metres -> template scene units
  for (const name in KIT) { const bone = T.scene.getObjectByName(name); if (!bone) continue;
    const geos = KIT[name].map(([w, h, d, x, y, z, col, round]) => { let g = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * (round ? 0.5 : 0.22)); g.translate(x, y, z); g = g.toNonIndexed(); const n = g.attributes.position.count, a = new Float32Array(n * 3); c.set(col); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; });
    p.setFromMatrixPosition(bone.matrixWorld); D.makeScale(k, k, k).setPosition(p); inv.copy(bone.matrixWorld).invert();
    T.kit.push({ name, geo: mergeGeometries(geos), mat, local: new THREE.Matrix4().multiplyMatrices(inv, D) }); }
  return T.kit;
}
const CAMO_TINT = [[1.3, 1.3, 1.22], [2.0, 1.62, 1.08], [1.08, 1.16, 1.36], [0.42, 0.46, 0.52], [2.5, 2.5, 2.6], [1.95, 0.82, 0.72]];
function outfitMat(T, i) {
  if (!T.base) return null; if (T.key === HERO_KEY) return outfitMatFlat(T, i);
  if (!T.mats[i] && T.G.T && T.G.T.camo) { // camouflage projected from rest-pose position, so it needs no UVs
    const cam = T.G.T.camo.map; cam.wrapS = cam.wrapT = THREE.RepeatWrapping; const t = CAMO_TINT[i];
    T.mats[i] = T.G.gfx.std({ map: cam, color: new THREE.Color(t[0], t[1], t[2]), roughness: 0.92, metalness: 0 }, 'swatcamo', (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vec2(position.x + position.y * 0.37, position.z + position.y * 0.61) * 190.0;\n#endif'); });
    T.mats[i].name = 'Swat';
  }
  if (T.mats[i]) return T.mats[i];
  return outfitMatFlat(T, i);
}
function suitHook(T) {
  let hU = 1.6 / T.scale, ax = 'y'; T.scene.traverse(o => { if (o.isSkinnedMesh && o.material === T.base) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z; if (sz > sy) { hU = sz; ax = 'z'; } else hU = sy; } });
  const W = (Math.PI * 2 * 150 / hU).toFixed(4), PS = (11 / hU).toFixed(5);
  return (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSuitP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSuitP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSuitP; float suitSeam; float suitWeave;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 q = vSuitP * ${W}; suitWeave = sin(q.x) * sin(q.y) * 0.5 + sin(q.z) * sin(q.y * 1.31 + 1.0) * 0.5;
          float band = abs(fract(vSuitP.${ax} * ${PS}) - 0.5); suitSeam = smoothstep(0.468, 0.492, band);
          float hexa = smoothstep(0.82, 0.95, sin(q.x * 0.21) * sin(q.y * 0.21 + 1.7) * sin(q.z * 0.21 + 0.6) + 0.55);
          diffuseColor.rgb *= (0.92 + 0.08 * suitWeave) * (1.0 - 0.32 * suitSeam) * (1.0 + 0.10 * hexa); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + 0.07 * suitWeave - 0.22 * suitSeam, 0.18, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 3.4); totalEmissiveRadiance += vec3(0.22, 0.62, 0.95) * rim * 0.2; }');
  };
}
function outfitMatFlat(T, i) { if (!T.base) return null; if (!T.mats[i]) { const m = T.base.clone(); m.color.set(GLB_OUTFITS[i]); m.name = 'SciFi_Main'; m.userData.dz = false; const hero = T.key === HERO_KEY; m.roughness = hero ? 0.62 : 0.85; if (hero) { m.metalness = 0.18; m.envMapIntensity = 0.9; } T.mats[i] = hero ? T.G.gfx.mat(m, 'herosuit', suitHook(T)) : T.G.gfx.mat(m); } return T.mats[i]; }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _k = new THREE.Vector3(), _pole = new THREE.Vector3(), _t = new THREE.Vector3(), _t2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _fq1 = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _BU = new THREE.Vector3(), _BF = new THREE.Vector3(), _BL = new THREE.Vector3(), _J = new THREE.Vector3(), _H = new THREE.Vector3(), _PO = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _wq = new THREE.Quaternion(), _aimQ = new THREE.Quaternion(), _wp = new THREE.Vector3(), _anchor = new THREE.Vector3(), _ax = new THREE.Vector3();

export class SoldierGLB {
  static available(G) { return !!template(G, HERO_KEY); }
  constructor(G, outfit = 0, key = HERO_KEY) {
    this.G = G; const T = template(G, key) || template(G, HERO_KEY); this.T = T;
    this.group = new THREE.Group(); this.pivot = new THREE.Group(); this.group.add(this.pivot);
    this.model = SkeletonUtils.clone(T.scene); this.model.scale.setScalar(T.scale); this.pivot.add(this.model);
    this.meshes = []; this.model.traverse(o => { if (!o.isMesh) return; if (!o.isSkinnedMesh) { o.visible = false; return; } o.frustumCulled = false; o.castShadow = true; this.meshes.push(o); });
    const B = (n) => this.model.getObjectByName(n);
    const A = (...n) => { for (const x of n) { const o = B(x); if (o) return o; } return null; };
    this.b = { body: A('Body'), hips: A('Hips'), abdomen: A('Abdomen'), torso: A('Torso'), chest: A('Chest', 'Torso'), neck: A('Neck'), head: A('Head'),
      uaL: A('UpperArmL', 'UpperArm.L'), laL: A('LowerArmL', 'LowerArm.L'), wrL: A('WristL', 'Wrist.L', 'LowerArmL', 'LowerArm.L'), uaR: A('UpperArmR', 'UpperArm.R'), laR: A('LowerArmR', 'LowerArm.R'), wrR: A('WristR', 'Wrist.R', 'LowerArmR', 'LowerArm.R'),
      ulL: A('UpperLegL', 'UpperLeg.L'), llL: A('LowerLegL', 'LowerLeg.L'), ulR: A('UpperLegR', 'UpperLeg.R'), llR: A('LowerLegR', 'LowerLeg.R'), ftL: A('FootL', 'Foot.L'), ftR: A('FootR', 'Foot.R') };
    // bones we post-process: remember the animation's own pose so overrides never accumulate
    // (the mixer skips writing values that did not change, so we track what it last wrote ourselves)
    const bb = this.b; this.ovQ = [bb.abdomen, bb.torso, bb.neck, bb.uaL, bb.laL, bb.uaR, bb.laR, bb.ulL, bb.llL, bb.ulR, bb.llR, bb.ftL, bb.ftR].filter(Boolean).map(o => ({ o, clean: o.quaternion.clone(), last: o.quaternion.clone() }));
    this.ovP = [bb.body, bb.ftL, bb.ftR].filter(Boolean).map(o => ({ o, clean: o.position.clone(), last: o.position.clone() }));
    // finger joints, curled procedurally around weapon grips (the clips keep hands open)
    this.fingers = []; this.model.traverse(o => { const m = /^(Index|Middle|Ring|Pinky|Thumb)([1-3])[LR]$/.exec(o.name); if (m) this.fingers.push({ o, rest: o.quaternion.clone(), j: +m[2], thumb: m[1] === 'Thumb' }); });
    this.model.updateMatrixWorld(true);
    // bone lengths in world units (bind pose)
    const dist = (x, y) => (x && y) ? x.getWorldPosition(_a).distanceTo(y.getWorldPosition(_b)) : 0.3;
    this.len = { arm1: dist(this.b.uaL, this.b.laL), arm2: (this.b.wrL && this.b.wrL !== this.b.laL) ? dist(this.b.laL, this.b.wrL) : dist(this.b.uaL, this.b.laL) * 1.05, leg1: dist(this.b.ulL, this.b.llL), leg2: dist(this.b.llL, this.b.ftL) };
    this.hasArms = !T.animal; if (false) for (const it of kit(T)) { const bone = B(it.name); if (!bone) continue; const m = new THREE.Mesh(it.geo, it.mat); m.matrixAutoUpdate = false; m.matrix.copy(it.local); m.castShadow = true; m.frustumCulled = false; bone.add(m); }
    this.mixer = new THREE.AnimationMixer(this.model); this.act = {}; this.w = {};
    for (const n in T.clips) { const a = this.mixer.clipAction(T.clips[n]); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); this.act[n] = a; this.w[n] = n === 'Idle' ? 1 : 0; if (SHOTS.has(n)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.enabled = false; } }
    if (this.act.Death) { this.act.Death.setLoop(THREE.LoopOnce, 1); this.act.Death.clampWhenFinished = true; }
    this.mount = new THREE.Group(); this.group.add(this.mount); this.weapon = null; this.fp = false; this.deadDir = 1; this.wasDead = false;
    this.k = { crouch: 0, prone: 0, aim: 0, fall: 0, chute: 0, seat: 0, swim: 0, kick: 0, dead: 0, armed: 0, air: 0, sprint: 0, lean: 0, bash: 0, turn: 0, stroke: 0, dive: 0, jet: 0 }; this._ly = 0; this.swimPh = 0;
    this.wp = new THREE.Vector3(-0.16, 1.15, 0.22); this.wq = new THREE.Quaternion(); this.idle = Math.random() * 10;
    this.setOutfit(outfit);
  }
  // play a one-shot clip from the character file (fire, interact, roll, melee, idle variants, hit reactions)
  play(name, speed = 1) {
    if (!this.act[name]) return false; if (this.shot && this.shot.name === name && this.shot.t < 0.15) return false;
    const a = this.act[name]; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.timeScale = speed; a.play();
    this.shot = { name, t: 0, dur: a.getClip().duration / speed }; return true;
  }
  melee() { const now = performance.now(); this.combo = (now - (this.comboT || 0) < 1300) ? (this.combo + 1) % COMBO.length : 0; this.comboT = now; const n = COMBO[this.combo]; return this.play(n, 1.35) ? n : (this.act[n] ? null : 'Punch_Right'); }
  setOutfit(i) { const m = outfitMat(this.T, i % GLB_OUTFITS.length); if (m) for (const o of this.meshes) if (BODY_MAT.includes(o.material.name)) o.material = m; }
  setWeapon(obj) { if (this.weapon) this.mount.remove(this.weapon); this.weapon = obj; if (obj) this.mount.add(obj); }
  // descent rig: jetpack on the back with two flickering rocket flames (falls back to the parachute if the model is missing)
  setChute(on) {
    if (on && !this.chute) { this.chute = makeJetpack(this.G) || makeChute(this.G); this.group.add(this.chute); }
    if (this.chute) this.chute.visible = on;
  }

  // rotate a bone by a world-space delta rotation
  _rotW(bone, axis, ang) { if (!bone || Math.abs(ang) < 1e-4) return; _q.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_q2); _q2.premultiply(_q); bone.parent.getWorldQuaternion(_q3); bone.quaternion.copy(_q3.invert().multiply(_q2)); bone.updateWorldMatrix(false, true); }
  // point bone's +Y axis (bone direction) at world direction `want`
  _aimBone(bone, want) { if (!bone) return; bone.getWorldQuaternion(_q2); _d.set(0, 1, 0).applyQuaternion(_q2).normalize(); _q.setFromUnitVectors(_d, want); _q2.premultiply(_q); bone.parent.getWorldQuaternion(_q3); bone.quaternion.copy(_q3.invert().multiply(_q2)); bone.updateWorldMatrix(false, true); }
  // two-bone IK (world space): upper/lower bones, target T, lengths, pole hint
  _ik(upper, lower, T, l1, l2, pole) {
    upper.getWorldPosition(_a); _d.subVectors(T, _a); let dist = _d.length(); const max = (l1 + l2) * 0.995; if (dist > max) dist = max; if (dist < 0.05) dist = 0.05; _d.normalize();
    const al = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - al * al));
    _pole.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_pole.lengthSq() < 1e-6) _pole.set(0, 0, 1); _pole.normalize();
    _k.copy(_a).addScaledVector(_d, al).addScaledVector(_pole, h); _c.copy(_a).addScaledVector(_d, dist);
    _b.subVectors(_k, _a).normalize(); this._aimBone(upper, _b.clone());
    lower.getWorldPosition(_b); _b.subVectors(_c, _b).normalize(); this._aimBone(lower, _b.clone());
  }

  // Full-body poses for skydiving, jetpack flight and swimming. Targets are written in the body's own frame
  // (BU head direction, BF chest-facing direction, BL character's left), so they hold whatever the pivot tilt is.
  _flyPose(st, k) {
    const b = this.b, t = this.idle, L1 = this.len.arm1, L2 = this.len.arm2, G1 = this.len.leg1, G2 = this.len.leg2;
    this.model.getWorldQuaternion(_bq); _BU.set(0, 1, 0).applyQuaternion(_bq); _BF.set(0, 0, 1).applyQuaternion(_bq); _BL.set(1, 0, 0).applyQuaternion(_bq);
    const fall = k.fall > Math.max(k.chute, k.swim), jet = !fall && k.chute >= k.swim, d = k.dive, sk = k.stroke;
    const AL = L1 + L2, LL = G1 + G2; // targets are written as fractions of the limb length, so elbows / knees bend on any rig
    // offsets: [left, up, forward] x limb length
    const put = (out, from, l, u, f, S) => out.copy(from).addScaledVector(_BL, l * S).addScaledVector(_BU, u * S).addScaledVector(_BF, f * S);
    for (let s = 0; s < 2; s++) {
      const side = s ? -1 : 1, ph = s ? Math.PI : 0; const sh = (s ? b.uaR : b.uaL), hip = (s ? b.ulR : b.ulL); if (!sh || !hip) continue;
      sh.getWorldPosition(_J); hip.getWorldPosition(_H);
      // ---- arms
      if (fall) { // box position: upper arms out, elbows bent ~90 degrees, hands level with the head; a dive sweeps the arms back along the body
        const fl = Math.sin(t * 11 + s * 1.7) * 0.07 + Math.sin(t * 23 + s) * 0.025;
        put(_t, _J, side * (0.58 - d * 0.26), 0.5 - d * 1.35, 0.18 + fl, AL); _PO.copy(_BL).multiplyScalar(side).addScaledVector(_BF, 0.55 - d * 0.3).addScaledVector(_BU, -0.3 - d * 0.6);
      } else if (jet) { // balancing: arms down and out, elbows slightly bent and back, a little sway; swept back at speed
        const sw = Math.sin(t * 1.6 + s * 2.1) * 0.06;
        put(_t, _J, side * (0.5 + k.jet * 0.08), -0.74 + sw, 0.2 - k.jet * 0.42, AL); _PO.copy(_BL).multiplyScalar(side * 0.7).addScaledVector(_BF, -0.6).addScaledVector(_BU, -0.2);
      } else { // swimming: freestyle crawl (pull under the body, recover above the back) blended with sculling while treading water
        const a = this.swimPh + ph; const cr = put(_k.copy(_J), _J, side * 0.3, 0.9 * Math.cos(a), 0.62 * Math.sin(a) + 0.08, AL);
        const sc = Math.sin(t * 3.0 + ph); put(_t, _J, side * 0.72, -0.32, 0.42 + sc * 0.3, AL); _t.lerp(cr, sk);
        _PO.copy(_BL).multiplyScalar(side * (0.8 - sk * 0.3)).addScaledVector(_BF, -0.9 * sk).addScaledVector(_BU, -0.5 * (1 - sk));
      }
      this._ik(s ? b.uaR : b.uaL, s ? b.laR : b.laL, _t.clone(), L1, L2, _PO.clone());
      // ---- legs
      if (fall) { // knees bent ~90 degrees, shins raised behind; straighter and closer together in a dive
        const fl = Math.sin(t * 9 + s * 2.3) * 0.055 + Math.sin(t * 19 + s * 3.0) * 0.02;
        put(_t, _H, side * (0.2 - d * 0.14), -0.5 - d * 0.42, -0.52 + d * 0.46 + fl, LL); _PO.copy(_BF).addScaledVector(_BL, side * 0.25);
      } else if (jet) { // one leg hanging nearly straight, the other with the knee lifted; both trail back a little at speed
        const sw = Math.sin(t * 1.7 + s) * 0.03; const bent = s === 1;
        put(_t, _H, side * 0.06, bent ? -0.66 : -0.93 + sw, bent ? -0.34 - k.jet * 0.12 : 0.04 - k.jet * 0.15, LL); _PO.copy(_BF).addScaledVector(_BL, side * 0.15);
      } else { // flutter kick from the hips while swimming, slow eggbeater while treading water
        const a = this.swimPh * 3 + ph; const fk = put(_k.copy(_H), _H, side * 0.06, -0.94, 0.12 * Math.sin(a), LL);
        const eg = t * 2.6 + ph; put(_t, _H, side * (0.12 + 0.05 * Math.cos(eg)), -0.82, 0.14 * Math.sin(eg), LL); _t.lerp(fk, sk); _PO.copy(_BF).addScaledVector(_BL, side * 0.2);
      }
      const ll = s ? b.llR : b.llL, ft = s ? b.ftR : b.ftL; if (ll) ll.getWorldQuaternion(_fq1);
      this._ik(s ? b.ulR : b.ulL, ll, _t.clone(), G1, G2, _PO.clone());
      // the rig's feet are IK bones under Root, not children of the shins: carry each foot to the end of its shin and turn it
      // with the shin (plus pointed toes in the air / water), otherwise the boots stretch back to the standing pose
      if (ll && ft && ft.parent !== ll) {
        ll.getWorldQuaternion(_fq2); _fq2.multiply(_fq1.invert()); if (!jet) { _q.setFromAxisAngle(_BL, 0.45); _fq2.premultiply(_q); }
        ft.getWorldQuaternion(_fq1); _fq1.premultiply(_fq2); ft.parent.getWorldQuaternion(_q3); ft.quaternion.copy(_q3.invert().multiply(_fq1));
        const end = ll.children.find(c => /_end$/.test(c.name)); if (end) end.getWorldPosition(_J); else _J.copy(_t);
        ft.parent.worldToLocal(_J); ft.position.copy(_J); ft.updateWorldMatrix(false, true);
      }
    }
  }

  animate(st) {
    const dt = st.dt, k = this.k, b = this.b, W = this.w, mode = st.mode; this.idle += dt;
    const tg = (n, v, r = 10) => { k[n] = damp(k[n], v, r, dt); };
    const dead = mode === 'dead'; const armed = st.weapon !== 'none' && !dead, pistol = st.weapon === 'pistol';
    tg('crouch', st.stance === 1 && mode === 'ground' ? 1 : 0, 9); tg('prone', st.stance === 2 && mode === 'ground' ? 1 : 0, 6); tg('aim', st.aiming && !dead ? 1 : 0, 12);
    tg('fall', mode === 'fall' ? 1 : 0, 5); tg('chute', mode === 'chute' ? 1 : 0, 6); tg('seat', mode === 'seat' ? 1 : 0, 9); tg('swim', mode === 'swim' ? 1 : 0, 6); tg('dead', dead ? 1 : 0, 6); tg('armed', armed ? 1 : 0, 10); tg('air', mode === 'air' ? 1 : 0, 9); tg('sprint', st.sprint && st.speed > 4 && mode === 'ground' ? 1 : 0, 6);
    { const gy = this.group.rotation.y; let dy = gy - this._ly; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this._ly = gy; k.lean = damp(k.lean, dt > 0 && st.speed > 2 && mode === 'ground' ? clamp(dy / dt * 0.045, -0.16, 0.16) : 0, 6, dt); }
    if (st.fired) k.kick = 1; k.kick = damp(k.kick, 0, 13, dt);
    // ---- clip weights
    const want = {}; const sp = st.speed, moving = sp > 0.35 && mode === 'ground';
    tg('stroke', mode === 'swim' && sp > 0.35 ? 1 : 0, 4); tg('dive', mode === 'fall' ? clamp((-(st.vy || -40) - 42) / 26, 0, 1) : 0, 3); tg('jet', mode === 'chute' ? clamp((st.hs || 0) / 18, 0, 1) : 0, 3);
    if (mode === 'swim') this.swimPh += dt * (2.6 + sp * 0.9) * (0.35 + 0.65 * k.stroke);
    if (this.shot) { this.shot.t += dt; if (this.shot.t >= this.shot.dur) this.shot = null; }
    if (st.fired && !dead && !this.shot && mode !== 'seat' && !(armed && this.hasArms)) this.play('Gun_Shoot');
    if (st.bash) k.bash = 1; k.bash = damp(k.bash, 0, 7, dt);
    if (st.hurt && !dead && !this.shot) this.play(Math.random() < 0.5 ? 'HitRecieve' : 'HitRecieve_2');
    if (!this.shot && !moving && !armed && mode === 'ground') { this.idleT = (this.idleT || 0) + dt; if (this.idleT > 9) { this.idleT = 0; this.play(['Wave', 'Idle_Neutral'][Math.floor(Math.random() * 2)]); } } else this.idleT = 0;
    const simple = this.T.universal || this.T.animal; let shotK = 0;
    if (dead) want.Death = 1;
    else if (this.shot && !(moving && /^(HitRecieve|Gun_Shoot|Interact|Wave)/.test(this.shot.name))) want[this.shot.name] = 1;
    else if (moving) {
      if (this.shot) { shotK = 0.45; want[this.shot.name] = shotK; }
      const f = Math.cos(st.moveAng || 0), s = Math.sin(st.moveAng || 0); const fwd = sp < 3.1 || st.stance ? 'Walk' : (st.aiming && armed ? 'Run_Shoot' : 'Run');
      let wf = Math.max(0, f), wb = Math.max(0, -f), wl = Math.max(0, s), wr = Math.max(0, -s); const n = wf + wb + wl + wr || 1;
      if (simple) { wf = 1; wb = wl = wr = 0; } // rigs without strafe clips turn their body into the movement instead (see below)
      const lk = (1 - shotK) / (simple ? 1 : n); want[fwd] = wf * lk; want.Run_Back = wb * lk; want.Run_Left = wl * lk; want.Run_Right = wr * lk;
      for (const c in NOM) if (this.act[c]) this.act[c].timeScale = clamp(sp / NOM[c], 0.45, 1.5) * (c === 'Run_Back' && st.stance ? 0.8 : 1);
      if (simple) { const back = Math.abs(st.moveAng || 0) > 2.0; if (this.act[fwd]) this.act[fwd].timeScale = Math.abs(this.act[fwd].timeScale) * (back ? -1 : 1); }
    } else want[armed ? (st.aiming ? 'Idle_Gun_Pointing' : 'Idle_Gun') : 'Idle'] = 1;
    // body turn for simple rigs: face the way the legs travel (backwards = reversed run, no turn)
    { let ta = 0; if (simple && moving && !dead) { const ma = st.moveAng || 0; ta = Math.abs(ma) > 2.0 ? ma - Math.sign(ma) * Math.PI : clamp(ma, -1.25, 1.25); } k.turn = damp(k.turn, ta, 9, dt); this.model.rotation.y = k.turn; }
    if (dead && !this.wasDead) { this.act.Death.reset(); this.act.Death.play(); } this.wasDead = dead;
    let sum = 0; for (const n in this.act) { const isShot = SHOTS.has(n); W[n] = damp(W[n] || 0, want[n] || 0, dead ? 14 : (isShot ? 18 : 9), dt); sum += W[n]; }
    for (const n in this.act) this.act[n].setEffectiveWeight(W[n] / (sum || 1));
    this.mixer.update(dt);
    for (const v of this.ovQ) { if (v.o.quaternion.equals(v.last)) v.o.quaternion.copy(v.clean); else v.clean.copy(v.o.quaternion); }
    for (const v of this.ovP) { if (v.o.position.equals(v.last)) v.o.position.copy(v.clean); else v.clean.copy(v.o.position); }
    // ---- whole-body pivots
    const P = this.pivot; const swimFlat = k.swim * k.stroke; const flat = Math.max(k.prone, k.fall * 0.92, swimFlat * 0.85);
    const wob = Math.sin(this.idle * 2.3) * 0.07 + Math.sin(this.idle * 5.1) * 0.035 + Math.sin(this.idle * 11.3) * 0.012; // air turbulence
    P.rotation.y = 0; P.rotation.z = k.chute * (Math.sin(this.idle * 1.3) * 0.04 + (st.bank || 0) * 1.2) + k.fall * wob - k.lean * (1 - flat) + swimFlat * Math.sin(this.swimPh) * 0.22;
    P.rotation.x = k.prone * 1.5 + k.fall * (1.42 + k.dive * 0.62 + wob * 0.5) + k.chute * (0.08 + k.jet * 0.3) + k.swim * (0.18 + k.stroke * 1.12) + (k.sprint * 0.1 + k.air * 0.06) * (1 - flat) * (1 - k.dead);
    const bob = k.swim * Math.sin(this.idle * 1.7) * (0.05 - k.stroke * 0.02);
    P.position.set(0, k.prone * 0.13 + k.fall * 0.9 + k.swim * (0.06 + k.stroke * 0.8) + bob, -k.prone * 0.75 - k.swim * k.stroke * 0.75);
    b.head.scale.setScalar(this.fp ? 0.001 : 1);
    const S = this.model.scale.x * 100; // bone local units -> world
    const low = (k.crouch * 0.4 + k.seat * 0.52 + k.air * 0.2) * (1 - flat) * (1 - k.chute);
    if (low > 0.005) b.body.position.y -= low / S;
    this.group.updateMatrixWorld(true);
    const yaw = this.group.rotation.y; _ax.set(Math.cos(yaw), 0, -Math.sin(yaw)); // character left axis (world)
    const fwdW = _t2.set(Math.sin(yaw), 0, Math.cos(yaw));
    // ---- legs: IK keeps the feet planted when the hips drop (crouch / seated)
    if (low > 0.005 && !dead) {
      for (let s = 0; s < 2; s++) {
        const ul = s ? b.ulR : b.ulL, ll = s ? b.llR : b.llL, ft = s ? b.ftR : b.ftL; const side = s ? -1 : 1;
        if (k.seat > 0.01) { ft.getWorldPosition(_t); _t.addScaledVector(fwdW, 0.42 * k.seat).addScaledVector(_ax, side * 0.05 * k.seat); _t.y += 0.16 * k.seat; ft.parent.worldToLocal(_c.copy(_t)); ft.position.copy(_c); ft.updateWorldMatrix(false, true); }
        ft.getWorldPosition(_t); _pole.copy(fwdW).addScaledVector(_ax, side * 0.35).setY(0.25);
        this._ik(ul, ll, _t.clone(), this.len.leg1, this.len.leg2, _pole.clone());
      }
    }
    // ---- torso aim pitch
    const pitch = st.pitch || 0; const upK = (1 - flat) * (1 - k.dead);
    const breath = Math.sin(this.idle * 1.75) * 0.014 * (1 - Math.min(1, sp * 0.4)) * upK;
    const ap = -pitch * (0.3 + 0.4 * k.aim) * upK + k.crouch * 0.18 * upK - k.prone * 0.35 - k.fall * (0.42 - k.dive * 0.35) - k.swim * k.stroke * 0.12 + k.chute * 0.08 + breath - (armed ? k.kick * 0.09 : 0) * upK + (armed ? k.aim * 0.07 : 0) * upK + k.bash * 0.22 * upK;
    if (Math.abs(ap) > 0.002) { this._rotW(b.abdomen, _ax, ap * 0.5); this._rotW(b.torso, _ax, ap * 0.5); }
    this._rotW(b.neck, _ax, -pitch * 0.3 * upK - k.prone * 0.9 - k.fall * (0.75 - k.dive * 0.45) - k.swim * k.stroke * 0.85 - k.chute * 0.1);
    // ---- weapon pose in model space (anchored to the animated chest)
    const special = Math.max(k.dead, k.chute, k.fall, k.seat, k.swim);
    (b.neck || b.chest).getWorldPosition(_anchor); this.group.worldToLocal(_anchor); if (b.neck) _anchor.y -= 0.13;
    _e.set(-pitch, 0, 0); _aimQ.setFromEuler(_e);
    if (armed) {
      const bob = 0; _wp.set(pistol ? -0.2 : -0.17, pistol ? -0.34 : -0.2 + bob, pistol ? 0.24 : 0.2).add(_anchor);
      _e.set(pistol ? 0.9 : 0.55 + (st.sprint ? 0.25 : 0), pistol ? 0.1 : 0.62, pistol ? 0 : 0.25, 'YXZ'); _wq.setFromEuler(_e);
      const ak = Math.max(k.aim * upK, k.prone * (1 - k.dead));
      if (ak > 0.001) { _t.set(pistol ? -0.04 : -0.14, pistol ? 0.1 : -0.03, pistol ? 0.5 : 0.26).applyQuaternion(_aimQ).add(_anchor); _wp.lerp(_t, ak); _wq.slerp(_aimQ, ak); }
      if (this.fp && ak < 1 && special < 0.5) { const fk = 1 - ak; _t.set(pistol ? -0.16 : -0.19, pistol ? -0.02 : -0.1, pistol ? 0.46 : 0.34).applyQuaternion(_aimQ).add(_anchor); _wp.lerp(_t, fk); _wq.slerp(_aimQ, fk); } // first person: weapon held up in view
      if (st.reload >= 0) { const r = Math.sin(st.reload * Math.PI); _e.set(-0.25 * r, 0.25 * r, -0.5 * r); _q.setFromEuler(_e); _wq.multiply(_q); _wp.y -= 0.03 * r; }
      if (k.bash > 0.01) { const bk = Math.sin(Math.min(1, k.bash) * Math.PI); _t.set(0.05, 0.1, 0.3).multiplyScalar(bk).applyQuaternion(_aimQ); _wp.add(_t); _e.set(-0.9 * bk, 0.5 * bk, 0); _q.setFromEuler(_e); _wq.multiply(_q); }
      const a = 1 - Math.exp(-18 * dt); this.wp.lerp(_wp, a); this.wq.slerp(_wq, a); this.mount.position.copy(this.wp); this.mount.quaternion.copy(this.wq);
      if (k.kick > 0.01) { const kk = k.kick * k.kick * (3 - 2 * k.kick); _t.set((Math.sin(this.idle * 91) * 0.006), pistol ? 0.035 : 0.014, pistol ? -0.075 : -0.085).multiplyScalar(kk).applyQuaternion(this.wq); this.mount.position.add(_t); _e.set(-(pistol ? 0.3 : 0.085) * kk, 0, (pistol ? 0.05 : 0.02) * kk); _q.setFromEuler(_e); this.mount.quaternion.multiply(_q); }
    }
    this.mount.visible = armed && special < 0.5 && this.hasArms;
    if (this.fingers.length) { const c = k.armed * (1 - special); for (const f of this.fingers) { _e.set(-(f.thumb ? 0.35 : f.j === 1 ? 0.75 : 1.05) * c, 0, 0); _q.setFromEuler(_e); f.o.quaternion.copy(f.rest).multiply(_q); } }
    // ---- arms: IK both hands onto the weapon
    const U = this.weapon && this.weapon.userData;
    if (armed && special < 0.6 && U && this.hasArms) {
      this.mount.updateWorldMatrix(true, false);
      const back = _d.set(0, 0, -1).applyQuaternion(this.wq).applyAxisAngle(_up, yaw).clone();
      // right hand on the grip
      _t.set(0, -0.035, -0.02).applyMatrix4(this.mount.matrixWorld).addScaledVector(back, 0.055);
      _pole.set(0, -0.8, 0).addScaledVector(_ax, -0.75).addScaledVector(fwdW, -0.3);
      this._ik(b.uaR, b.laR, _t.clone(), this.len.arm1, this.len.arm2, _pole.clone());
      // left hand on the fore-end (or supporting the pistol / handling the magazine)
      if (pistol) _t.set(0.045, -0.05, -0.01); else { _t.copy(U.fore); _t.y -= 0.03; }
      if (st.reload >= 0) { const r = st.reload; const t2 = r < 0.25 ? r / 0.25 : r < 0.8 ? 1 : (1 - r) / 0.2; const dip = r > 0.25 && r < 0.8 ? Math.sin((r - 0.25) / 0.55 * Math.PI) : 0; _t.lerp(U.magPos, clamp(t2, 0, 1)); _t.y -= dip * 0.22; _t.x += dip * 0.08; }
      _t.applyMatrix4(this.mount.matrixWorld).addScaledVector(back, 0.03);
      _pole.set(0, -0.9, 0).addScaledVector(_ax, 0.6).addScaledVector(fwdW, -0.2);
      this._ik(b.uaL, b.laL, _t.clone(), this.len.arm1, this.len.arm2, _pole.clone());
    } else if (this.hasArms && !dead && k.seat > 0.3) {
      for (let s = 0; s < 2; s++) {
        const side = s ? -1 : 1; b.chest.getWorldPosition(_t);
        if (st.handL) _t.copy(s ? st.handR : st.handL).applyMatrix4(this.group.matrixWorld); else { _t.addScaledVector(_ax, side * 0.3).addScaledVector(fwdW, 0.4); _t.y -= 0.2; }
        _pole.set(0, -0.5, 0).addScaledVector(_ax, side * 0.8).addScaledVector(fwdW, -0.3);
        this._ik(s ? b.uaR : b.uaL, s ? b.laR : b.laL, _t.clone(), this.len.arm1, this.len.arm2, _pole.clone());
      }
    }
    if (this.hasArms && !dead && Math.max(k.fall, k.chute, k.swim) > 0.25) this._flyPose(st, k);
    if (this.chute && this.chute.visible) {
      if (this.chute.userData.jet) { // pin the jetpack to the upper back, follow the stance twist, flicker the flames
        const c = b.chest || b.neck || b.torso; c.getWorldPosition(_t); this.group.worldToLocal(_t);
        const rx = P.rotation.x; this.chute.position.set(_t.x, _t.y - 0.12 * Math.cos(rx) + 0.22 * Math.sin(rx), _t.z - 0.22 * Math.cos(rx) - 0.12 * Math.sin(rx)); this.chute.rotation.set(rx, 0, P.rotation.z);
        for (const f of this.chute.userData.flames) { const fl = 0.75 + Math.random() * 0.5; f.scale.set(fl * 0.9, fl * (1.1 + Math.random() * 0.6), fl * 0.9); }
      } else { this.chute.scale.setScalar(clamp(k.chute * 1.3, 0.05, 1)); this.chute.rotation.z = Math.sin(this.idle * 0.9) * 0.05; }
    }
    for (const v of this.ovQ) v.last.copy(v.o.quaternion); for (const v of this.ovP) v.last.copy(v.o.position);
  }
}
