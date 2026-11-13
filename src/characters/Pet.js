// Companion creature: flies escort beside the player and attacks enemies in sight with a ranged power attack.
//  - Dragon      : hurls fireballs (blazing core, ember trail, smoke, burst + burn on impact)
//  - Ghost Skull : fires spectral bolts (violet core, swirling sparks, arcane shockwave on impact)
// The creature's own Headbutt / Punch clips play as the cast, Yes celebrates a kill. Damage is credited to the player.
import * as THREE from 'three';
import { damp } from '../utils/math.js';

export const PETS = {
  dragon: { key: 'pets/dragon', name: 'DRAGON', len: 1.05, dmg: 22, cd: 1.15, range: 40, speed: 34, splash: 2.6,
    core: [5, 2.6, 0.7], halo: [3.2, 0.9, 0.12], trail: [4, 1.6, 0.3], smoke: true, sz: 0.55 },
  ghost: { key: 'pets/ghost_skull', name: 'GHOST SKULL', len: 0.85, dmg: 17, cd: 0.8, range: 36, speed: 46, splash: 1.8,
    core: [2.6, 1.4, 5], halo: [1.2, 0.35, 3.4], trail: [1.8, 0.7, 4.2], smoke: false, sz: 0.42 },
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

export class Pet {
  constructor(G) {
    this.G = G; this.kind = null; this.root = null; this.pos = new THREE.Vector3(); this.shots = []; this.pool = [];
    // fixed projectile pool: lights are created once at boot so the scene light count never changes (no shader recompiles)
    for (let i = 0; i < 8; i++) { const s = this._make(); s.grp.visible = false; s.light.intensity = 0; this.pool.push(s); }
    this.ready = true; this.reset();
  }

  setKind(kind) {
    if (this.kind === kind && this.root) return; this.kind = kind; const def = PETS[kind] || PETS.dragon;
    if (this.root) this.G.gfx.scene.remove(this.root);
    const a = this.G.assets && this.G.assets.animated(def.key, { length: def.len, keep: true }); if (!a) { this.root = null; return; }
    this.root = a.grp; this.mixer = a.mixer; this.clips = a.clips; this.def = def; this.G.gfx.scene.add(this.root);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    // aura glow around the creature, tinted to its element
    if (!this.aura) { this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.G.T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); this.aura.renderOrder = 9; }
    this.aura.material.color.setRGB(def.halo[0] * 0.35, def.halo[1] * 0.35, def.halo[2] * 0.35); this.aura.scale.setScalar(def.len * 1.6); this.root.add(this.aura); this.aura.position.set(0, def.len * 0.45, 0);
    this.cur = null; this.play('Flying_Idle');
  }
  reset() {
    this.unlocked = false; if (this.root) this.root.visible = false; this.target = null; this.cd = 0; this.t = 0; this.atkT = 0; this.kill = 0;
    for (const s of this.shots) this._free(s); this.shots.length = 0;
  }
  unlock(player) {
    if (this.unlocked) return; { const pick = this.G.settings && this.G.settings.d.pet; this.setKind(PETS[pick] ? pick : Math.random() < 0.5 ? 'dragon' : 'ghost'); } if (!this.root) return; this.unlocked = true;
    this.pos.set(player.pos.x, player.pos.y + 12, player.pos.z); this.root.position.copy(this.pos);
    this.G.ui.banner('COMPANION UNLOCKED', this.def.name + (this.kind === 'dragon' ? ' — hurls fireballs at enemies' : ' — fires spectral bolts at enemies')); this.G.audio.ui('win');
    this._burst(this.pos.x, this.pos.y, this.pos.z, 1.6); // arrival flare
  }
  play(name, speed = 1, once = false) {
    const a = this.clips && this.clips[name]; if (!a || this.cur === a) return; const old = this.cur; a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.play();
    if (old) old.crossFadeTo(a, 0.2, false); this.cur = a; this.curName = name;
  }
  findTarget(P) {
    let best = null, bd = this.def.range * this.def.range;
    for (const c of this.G.chars) { if (c.isPlayer || c.civ || !c.alive || c.mode === 'plane' || c.mode === 'chute' || c.mode === 'fall') continue;
      const d2 = (c.pos.x - P.x) ** 2 + (c.pos.z - P.z) ** 2 + (c.pos.y - P.y) ** 2; if (d2 > bd) continue; if (!this.G.colliders.los(P.x, P.y, P.z, c.pos.x, c.pos.y + 1.2, c.pos.z)) continue; bd = d2; best = c; }
    return best;
  }

  // ---------- projectiles ----------
  _sprite() { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.G.T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); s.renderOrder = 9; return s; }
  _make() {
    if (this.pool && this.pool.length && this.ready) return this.pool.pop(); if (this.ready && this.shots.length >= 8) { const o = this.shots.shift(); this._free(o); return this.pool.pop(); }
    const grp = new THREE.Group(), halo = this._sprite(), core = this._sprite(); grp.add(halo, core);
    const light = new THREE.PointLight(0xffffff, 0, 9, 2); grp.add(light); this.G.gfx.scene.add(grp); return { grp, halo, core, light, pos: new THREE.Vector3(), vel: new THREE.Vector3() };
  }
  _free(s) { s.grp.visible = false; s.light.intensity = 0; this.pool.push(s); }
  _fire(target, player) {
    const d = this.def, s = this._make(); const head = _v.copy(this.pos); head.y += d.len * 0.45;
    s.pos.copy(head); _d.set(target.pos.x, target.pos.y + 1.1, target.pos.z).sub(head).normalize(); s.vel.copy(_d).multiplyScalar(d.speed);
    s.target = target; s.player = player; s.life = 2.2; s.t = 0; s.grp.visible = true;
    s.halo.material.color.setRGB(...d.halo); s.core.material.color.setRGB(...d.core); s.halo.scale.setScalar(d.sz * 2.4); s.core.scale.setScalar(d.sz);
    s.light.color.setRGB(d.halo[0] / 3, d.halo[1] / 3, d.halo[2] / 3); s.light.intensity = 30; this.shots.push(s);
    // cast flash at the mouth / skull
    const K = this.G.fx.sparks; for (let i = 0; i < 10; i++) K.spawn(head.x, head.y, head.z, _d.x * rnd(2, 6) + rnd(-2, 2), _d.y * rnd(2, 6) + rnd(-1, 2), _d.z * rnd(2, 6) + rnd(-2, 2), ...d.trail, 1, rnd(0.12, 0.3), rnd(0.15, 0.35), 0, 2, 2);
    this.G.audio.gunshot(this.kind === 'dragon' ? 'shotgun' : 'smg', head.x, head.y, head.z, true, false);
  }
  _burst(x, y, z, k) {
    const d = this.def, K = this.G.fx.sparks, S = this.G.fx.smoke;
    for (let i = 0; i < 26 * k; i++) { const a = Math.random() * 6.283, e = rnd(-0.4, 1.2), sp = rnd(3, 11) * k; K.spawn(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, ...d.trail, 1, rnd(0.15, 0.45) * k, rnd(0.25, 0.6), 0.5, 6, 2); }
    for (let i = 0; i < 6 * k; i++) K.spawn(x, y, z, rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1), ...d.halo, 1, rnd(0.8, 1.6) * k, rnd(0.18, 0.3), 3, 0, 4); // fireball / arcane flash
    if (d.smoke) for (let i = 0; i < 8 * k; i++) S.spawn(x + rnd(-0.4, 0.4), y + rnd(0, 0.6), z + rnd(-0.4, 0.4), rnd(-1.2, 1.2), rnd(0.6, 2.4), rnd(-1.2, 1.2), 0.22, 0.2, 0.19, 0.5, rnd(0.5, 0.9), rnd(1.2, 2.2), 1.3, -0.4, 1.4);
    else for (let i = 0; i < 14 * k; i++) { const a = i / (14 * k) * 6.283; K.spawn(x, y, z, Math.cos(a) * 7, 0.3, Math.sin(a) * 7, ...d.core, 0.9, 0.28, 0.32, 1.5, 0, 3); } // shockwave ring
  }
  _updateShots(dt) {
    const d = this.def, K = this.G.fx.sparks, S = this.G.fx.smoke, C = this.G.colliders;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.life -= dt; s.t += dt;
      // light homing so shots feel magical but still dodgeable
      if (s.target && s.target.alive) { _d.set(s.target.pos.x, s.target.pos.y + 1.1, s.target.pos.z).sub(s.pos); const dist = _d.length(); _d.normalize().multiplyScalar(d.speed); s.vel.lerp(_d, Math.min(1, dt * 3.2)); if (dist < 0.9) { this._hit(s, true); this.shots.splice(i, 1); continue; } }
      const step = s.vel.length() * dt; const h = C.raycast(s.pos.x, s.pos.y, s.pos.z, s.vel.x / (step / dt || 1), s.vel.y / (step / dt || 1), s.vel.z / (step / dt || 1), step + 0.05, 0.5);
      if (h || s.life <= 0) { if (h) s.pos.set(h.x, h.y, h.z); this._hit(s, false); this.shots.splice(i, 1); continue; }
      s.pos.addScaledVector(s.vel, dt); s.grp.position.copy(s.pos);
      const flick = 0.85 + Math.random() * 0.3; s.core.scale.setScalar(d.sz * flick); s.halo.scale.setScalar(d.sz * 2.4 * (0.9 + Math.random() * 0.2)); s.halo.material.rotation += dt * 6;
      // trail
      for (let k = 0; k < 3; k++) K.spawn(s.pos.x + rnd(-0.1, 0.1), s.pos.y + rnd(-0.1, 0.1), s.pos.z + rnd(-0.1, 0.1), -s.vel.x * 0.05 + rnd(-0.8, 0.8), -s.vel.y * 0.05 + rnd(-0.4, 1.2), -s.vel.z * 0.05 + rnd(-0.8, 0.8), ...d.trail, 1, rnd(0.12, 0.3), rnd(0.18, 0.4), -0.2, d.smoke ? -1 : 0, 2);
      if (d.smoke && Math.random() < 0.5) S.spawn(s.pos.x, s.pos.y, s.pos.z, rnd(-0.3, 0.3), rnd(0.2, 0.8), rnd(-0.3, 0.3), 0.25, 0.22, 0.2, 0.35, 0.25, 0.9, 1.1, -0.3, 1.2);
      if (!d.smoke) { const a = s.t * 18; K.spawn(s.pos.x + Math.cos(a) * 0.35, s.pos.y + Math.sin(a) * 0.35, s.pos.z, 0, 0, 0, ...d.core, 0.9, 0.14, 0.25, 0, 0, 0); } // spiral wisps
    }
  }
  _hit(s, direct) {
    const d = this.def; this._burst(s.pos.x, s.pos.y, s.pos.z, direct ? 1 : 0.7); this._free(s);
    this.G.audio.impact(this.kind === 'dragon' ? 0 : 2, s.pos.x, s.pos.y, s.pos.z);
    // splash damage around the impact point
    for (const c of this.G.chars) { if (c.isPlayer || c.civ || !c.alive || c.mode === 'plane') continue; const r = Math.hypot(c.pos.x - s.pos.x, c.pos.y + 1 - s.pos.y, c.pos.z - s.pos.z);
      if (r > d.splash) continue; const dmg = d.dmg * (direct && c === s.target ? 1 : 0.5 * (1 - r / d.splash)); if (dmg < 1) continue; c.damage(dmg, s.player, 'body', 'pet', 0, 0);
      if (!c.alive) { this.kill = 1.8; this.target = null; this.G.ui.toast(d.name + ' DOWNED ' + c.name); this.G.audio.ui('pick'); } }
  }

  update(dt, player) {
    const G = this.G; if (this.shots.length) this._updateShots(dt);
    if (!this.root || !player) return;
    const hide = !this.unlocked || player.mode === 'plane' || player.mode === 'fall' || !player.alive || player.scoped; this.root.visible = !hide; if (!this.unlocked || !player.alive) return;
    this.t += dt; this.atkT -= dt; this.kill -= dt;
    const yaw = player.camYaw; const back = Math.sin(this.t * 0.9) * 0.6;
    _v.set(player.pos.x + Math.sin(yaw - 0.9) * (2.6 + back), player.pos.y + 2.3 + Math.sin(this.t * 2.1) * 0.2, player.pos.z + Math.cos(yaw - 0.9) * (2.6 + back));
    let tgt = this.target; if (!tgt || !tgt.alive || tgt.mode === 'plane' || this.t % 3 < dt) tgt = this.target = this.findTarget(this.pos.lengthSq() ? this.pos : _v);
    if (this.kill > 0) this.play('Yes', 1, false);
    else if (tgt) {
      // hold a firing position ~9 m from the target, slightly above, and keep shooting
      _w.set(this.pos.x - tgt.pos.x, 0, this.pos.z - tgt.pos.z); const hd = _w.length() || 1; _w.multiplyScalar(1 / hd);
      if (hd > 14 || hd < 5) _v.set(tgt.pos.x + _w.x * 9, tgt.pos.y + 3.4, tgt.pos.z + _w.z * 9);
      if (this.atkT <= 0 && this.pos.distanceTo(tgt.pos) < d_range(this.def)) { this.atkT = this.def.cd * rnd(0.85, 1.15); this.play(Math.random() < 0.5 ? 'Headbutt' : 'Punch', 1.4, true); this._fire(tgt, player); }
      if (this.cur !== this.clips.Headbutt && this.cur !== this.clips.Punch) this.play('Fast_Flying', 1.1);
      else if (this.cur && this.cur.time > this.cur.getClip().duration * 0.95) this.play('Fast_Flying', 1.1);
    } else this.play(player.speedNow > 4 ? 'Fast_Flying' : 'Flying_Idle', 1);
    const k = tgt ? 4.5 : 3.5; this.pos.x = damp(this.pos.x || 0, _v.x, k, dt); this.pos.y = damp(this.pos.y || 0, _v.y, k, dt); this.pos.z = damp(this.pos.z || 0, _v.z, k, dt);
    const cam = G.gfx.camera.position; const cd = this.pos.distanceTo(cam); if (cd < 2.5) { _w.subVectors(this.pos, cam).normalize(); this.pos.addScaledVector(_w, 2.5 - cd); this.pos.y += (2.5 - cd) * 0.6; }
    this.root.position.copy(this.pos); const lx = (tgt && this.kill <= 0 ? tgt.pos.x : player.pos.x) - this.pos.x, lz = (tgt && this.kill <= 0 ? tgt.pos.z : player.pos.z) - this.pos.z; this.root.rotation.y = Math.atan2(lx, lz);
    if (this.aura) this.aura.material.opacity = 0.55 + Math.sin(this.t * 6) * 0.2;
    // ambient element particles drifting off the creature
    if (!hide && Math.random() < 0.35) { const d = this.def; G.fx.sparks.spawn(this.pos.x + rnd(-0.3, 0.3), this.pos.y + d.len * 0.4, this.pos.z + rnd(-0.3, 0.3), rnd(-0.4, 0.4), rnd(0.3, 1.2), rnd(-0.4, 0.4), ...d.trail, 0.8, rnd(0.06, 0.14), rnd(0.4, 0.8), 0, -0.5, 1); }
    this.mixer.update(dt);
  }
}
function d_range(def) { return def.range * 0.75; }
