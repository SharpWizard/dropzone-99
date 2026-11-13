// Wildlife: deer, stags, foxes, rabbits, bison and bears in the woods; cows, sheep, horses and chickens on the farm.
// The Animal Kit models (madtrollstudio, CC-BY 3.0) are static meshes, so walking is done in the vertex shader:
// legs (everything below the belly) swing in diagonal pairs about the hip line, the body bobs, grazing lowers the head.
// Animals graze and wander, bolt from noise, gunfire and a sprinting player, and the bear charges and attacks.
// Shooting or striking one hurts it; killing it scores points.
import * as THREE from 'three';
import { RNG, clamp, dampAngle } from '../utils/math.js';

const K = (n) => 'animals/' + n + '_free_model';
// len: body length (m), hp, pts: points for a kill, walk / run speeds (m/s), flee: distance at which it bolts, gait: stride frequency per m/s
const SPECIES = {
  deer: { key: K('deer'), len: 1.8, hp: 60, pts: 50, walk: 1.5, run: 11, flee: 26, legs: 0.5, gait: 1.2, name: 'DEER' },
  stag: { key: 'animals/deer_free_model_b', len: 2.2, hp: 85, pts: 75, walk: 1.5, run: 10.5, flee: 30, legs: 0.48, gait: 1.1, name: 'STAG' },
  fox: { key: K('fox'), len: 1.1, hp: 40, pts: 60, walk: 1.8, run: 9.5, flee: 20, legs: 0.42, gait: 1.8, name: 'FOX' },
  rabbit: { key: K('rabbit'), len: 0.5, hp: 20, pts: 30, walk: 1.2, run: 8, flee: 12, legs: 0.38, gait: 3.0, hop: 1, name: 'RABBIT' },
  bison: { key: K('bizon'), len: 3.0, hp: 220, pts: 100, walk: 1.2, run: 8, flee: 22, legs: 0.36, gait: 0.9, name: 'BISON' },
  bear: { key: K('bear'), len: 2.3, hp: 260, pts: 150, walk: 1.3, run: 8.5, flee: 0, legs: 0.36, gait: 1.1, hunt: 26, bite: 20, name: 'BEAR' },
  horse: { key: K('horse'), len: 2.4, hp: 110, pts: 40, walk: 1.6, run: 12, flee: 24, legs: 0.48, gait: 1.0, name: 'HORSE' },
  cow: { key: K('cow'), len: 2.4, hp: 120, pts: 15, walk: 1.0, run: 5, flee: 10, legs: 0.36, gait: 1.1, name: 'COW' },
  sheep: { key: K('sheep'), len: 1.3, hp: 45, pts: 15, walk: 1.0, run: 6, flee: 14, legs: 0.4, gait: 1.5, name: 'SHEEP' },
  chicken: { key: K('chicken'), len: 0.45, hp: 15, pts: 10, walk: 0.9, run: 4.5, flee: 8, legs: 0.42, gait: 3.2, name: 'CHICKEN' },
};
export const ANIMAL_KEYS = [...new Set(Object.values(SPECIES).map(s => s.key))];
// herds: [species, count range, where]
const HERDS = [['deer', [3, 5], 'forest'], ['deer', [2, 4], 'forest'], ['stag', [1, 2], 'forest'], ['fox', [1, 2], 'forest'], ['fox', [1, 1], 'forest'], ['rabbit', [3, 5], 'forest'], ['rabbit', [2, 4], 'meadow'],
  ['bear', [1, 1], 'forest'], ['bear', [1, 1], 'forest'], ['bison', [3, 5], 'meadow'], ['deer', [2, 4], 'meadow'], ['horse', [2, 3], 'farm'], ['cow', [3, 5], 'farm'], ['sheep', [4, 7], 'farm'], ['chicken', [4, 6], 'farm']];

const _v = new THREE.Vector3();

export class Animals {
  constructor(G) { this.G = G; this.list = []; this.group = new THREE.Group(); this.group.name = 'animals'; G.gfx.scene.add(this.group); this.R = new RNG(5150); this.t = 0; this.tpl = {}; this.pending = []; }

  // per-species template: fitted model + leg-swing shader (each animal gets its own material copy for its stride phase)
  _template(sp) {
    if (this.tpl[sp]) return this.tpl[sp]; const S = SPECIES[sp], A = this.G.assets; if (!A || !A.has(S.key)) return (this.tpl[sp] = null);
    const st = A.static(S.key); const longX = st.size.x > st.size.z, c = st.box.getCenter(new THREE.Vector3());
    const fit = A.fitted(S.key, { length: S.len }); if (!fit) return (this.tpl[sp] = null); const H = fit.userData.size.y;
    return (this.tpl[sp] = { fit, st, H, longX, c, legY: st.box.min.y + st.size.y * S.legs, sizeY: st.size.y, half: (longX ? st.size.x : st.size.z) / 2 });
  }
  _material(base, T) {
    const m = base.clone(); m.userData.dz = true; const U = { uPh: { value: 0 }, uAmp: { value: 0 }, uLegY: { value: T.legY }, uMinY: { value: T.st.box.min.y }, uC: { value: new THREE.Vector2(T.c.x, T.c.z) }, uLongX: { value: T.longX ? 1 : 0 }, uHalf: { value: T.half }, uGraze: { value: 0 } };
    const hook = (sh) => { Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPh, uAmp, uLegY, uMinY, uLongX, uHalf, uGraze; uniform vec2 uC;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float fw = mix(position.z - uC.y, position.x - uC.x, uLongX), sd = mix(position.x - uC.x, position.z - uC.y, uLongX);
          // legs: diagonal pairs swing together, more at the hoof than at the hip
          float leg = clamp((uLegY - position.y) / max(uLegY - uMinY, 1e-4), 0.0, 1.0);
          float pair = (fw > 0.0) == (sd > 0.0) ? 0.0 : 3.14159; float sw = sin(uPh + pair) * uAmp * leg * (uLegY - uMinY);
          if (uLongX > 0.5) transformed.x += sw; else transformed.z += sw;
          transformed.y += max(0.0, -cos(uPh + pair)) * uAmp * 0.18 * leg * (uLegY - uMinY);
          // grazing: the front of the body above the legs dips toward the ground
          float front = clamp(fw / uHalf - 0.35, 0.0, 1.0) * (1.0 - leg); transformed.y -= front * front * uGraze * (uLegY - uMinY) * 1.4; }`); };
    this.G.gfx.mat(m, 'animalLeg', hook); return { m, U };
  }

  spawn() {
    const G = this.G, W = G.world, R = this.R; this.clear();
    const forest = W.locations.find(l => l.id === 'forest'), farm = W.locations.find(l => l.id === 'green');
    const where = (kind) => { for (let k = 0; k < 40; k++) { let x, z;
        if (kind === 'forest') { const a = R.f() * 6.283, r = Math.sqrt(R.f()) * forest.r * 1.1; x = forest.x + Math.cos(a) * r; z = forest.z + Math.sin(a) * r; }
        else if (kind === 'farm') { const f = R.pick([[-95, -75], [-90, 85], [105, 95], [-100, -25]]); x = farm.x + f[0] + R.range(-30, 30); z = farm.z + f[1] + R.range(-30, 30); }
        else { x = R.range(-850, 850); z = R.range(-850, 850); if (W.locationAt(x, z) || W.splatAt(x, z, 3) < 120) continue; }
        if (W.heightAt(x, z) < 3 || W.slopeAt(x, z) > 0.45 || !G.nav.isLandFree(x, z)) continue; return { x, z }; } return null; };
    for (const [sp, [n0, n1], kind] of HERDS) { const home = where(kind); if (!home) continue; const n = R.int(n0, n1); for (let i = 0; i < n; i++) this._add(sp, home.x + R.range(-8, 8), home.z + R.range(-8, 8), home); }
  }
  _add(sp, x, z, home) {
    const T = this._template(sp); if (!T || !this.G.nav.isLandFree(x, z)) return null; const S = SPECIES[sp];
    const g = new THREE.Group(), body = T.fit.clone(true); const mats = []; body.traverse(o => { if (o.isMesh) { const { m, U } = this._material(o.material, T); o.material = m; mats.push(U); o.castShadow = true; o.receiveShadow = true; } });
    g.add(body); this.group.add(g); const a = { sp, S, g, body, mats, x, z, y: this.G.world.heightAt(x, z), yaw: this.R.f() * 6.28, hp: S.hp, alive: true, state: 'graze', t: this.R.range(1, 6), goal: null, home: home || { x, z }, ph: this.R.f() * 6.28, speed: 0, H: T.H, len: S.len, deadT: 0, atkT: 0, fleeFrom: null, graze: 0 };
    this.list.push(a); return a;
  }
  clear() { for (const a of this.list) { this.group.remove(a.g); a.body.traverse(o => { if (o.isMesh && o.material && o.material.userData.dz) this.G.gfx.unmat(o.material); }); } this.list.length = 0; this.pending.length = 0; }

  // sound: gunshots and explosions scare animals within the radius (bears come to investigate instead)
  noise(x, z, radius) { for (const a of this.list) { if (!a.alive) continue; const d = Math.hypot(a.x - x, a.z - z); if (d > radius * 0.8) continue; if (a.S.hunt) { if (d < 60) { a.state = 'hunt'; a.t = 8; } } else { a.state = 'flee'; a.t = this.R.range(5, 9); a.fleeFrom = { x, z }; } } }

  // ray test against animal bodies (two spheres along the body + head). returns {a, t, head}
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bt = maxT, bh = false;
    for (const a of this.list) { if (!a.alive || !a.g.visible) continue; const px = a.x - ox, pz = a.z - oz; const tc = px * dx + pz * dz; if (tc < -3 || tc > bt + 3) continue;
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), H = a.H, L = a.len;
      for (const [f, h, r, head] of [[L * 0.2, H * 0.58, Math.max(H, L * 0.4) * 0.32, false], [-L * 0.22, H * 0.55, Math.max(H, L * 0.4) * 0.3, false], [L * 0.45, H * 0.82, Math.max(0.12, H * 0.18), true]]) {
        const sx = a.x + fx * f - ox, sy = a.y + h - oy, sz = a.z + fz * f - oz; const t = sx * dx + sy * dy + sz * dz; if (t < 0 || t > bt) continue; const q = sx * sx + sy * sy + sz * sz - t * t; if (q > r * r) continue;
        const tt = t - Math.sqrt(r * r - q); if (tt < bt) { bt = tt; best = a; bh = head; } } }
    return best ? { a: best, t: bt, head: bh } : null;
  }
  // a hit from a bullet or a blow. returns true when it killed the animal
  hurt(a, dmg, attacker, head = false) {
    if (!a.alive) return false; a.hp -= dmg * (head ? 2 : 1);
    if (a.hp <= 0) { a.alive = false; a.state = 'dead'; a.deadT = 0; a.speed = 0; this.G.fx.kill(a.x, a.y, a.z, a.H * 0.6); if (this.G.activities && attacker && attacker.isPlayer) this.G.activities.onAnimalKill(a.sp); if (attacker && attacker.isPlayer) this.G.ui.pointsPop(a.S.pts + (head ? 20 : 0), a.S.name); if (attacker && attacker.isPlayer) { attacker.points = (attacker.points || 0) + a.S.pts + (head ? 20 : 0); this.G.ui.toast('+' + (a.S.pts + (head ? 20 : 0)) + ' · ' + a.S.name + (head ? ' · HEADSHOT' : '')); this.G.audio.ui && this.G.audio.ui('win'); attacker.shakeCam && attacker.shakeCam(0.25); }
      // the rest of the herd bolts
      for (const o of this.list) if (o !== a && o.alive && !o.S.hunt && Math.hypot(o.x - a.x, o.z - a.z) < 45) { o.state = 'flee'; o.t = this.R.range(6, 10); o.fleeFrom = { x: a.x, z: a.z }; }
      return true; }
    if (a.S.hunt) { a.state = 'hunt'; a.t = 12; } else { a.state = 'flee'; a.t = this.R.range(6, 10); a.fleeFrom = attacker ? { x: attacker.pos.x, z: attacker.pos.z } : { x: a.x, z: a.z }; }
    return false;
  }
  // melee from the player: strike animals in front within reach
  melee(P, fx, fz, dmg) { let hit = false; for (const a of this.list) { if (!a.alive) continue; const dx = a.x - P.pos.x, dz = a.z - P.pos.z, d = Math.hypot(dx, dz); if (d > 1.6 + a.len * 0.5 || Math.abs(a.y - P.pos.y) > 1.8) continue; if (d > 0.4 && (dx * fx + dz * fz) / d < 0.3) continue; this.hurt(a, dmg, P, false); hit = true; } return hit; }

  update(dt) {
    const G = this.G, P = G.player, cam = G.gfx.camera.position, W = G.world, nav = G.nav; this.t += dt; const diff = G.settings.diff();
    for (const a of this.list) {
      const dc = Math.hypot(a.x - cam.x, a.z - cam.z); a.g.visible = dc < 260; if (dc > 320 && a.alive) continue;
      if (!a.alive) { a.deadT += dt; const k = clamp(a.deadT / 0.6, 0, 1); a.body.rotation.z = k * 1.45; a.g.position.y = a.y - Math.max(0, a.deadT - 20) * 0.15; for (const U of a.mats) U.uAmp.value = 0;
        if (a.deadT > 26) { this.group.remove(a.g); a.removed = true; a.body.traverse(o => { if (o.isMesh && o.material && o.material.userData.dz) this.G.gfx.unmat(o.material); }); } continue; }
      const S = a.S, dp = P && P.alive ? Math.hypot(a.x - P.pos.x, a.z - P.pos.z) : 1e9; a.t -= dt; let want = 0, tx = null, tz = null;
      // ---- decide
      if (S.hunt && P && P.alive && P.mode === 'ground' && (a.state === 'hunt' || dp < S.hunt)) { if (a.state !== 'hunt') { a.t = 10; G.audio.roar && G.audio.roar(a.x, a.y + 1, a.z); } a.state = 'hunt'; }
      else if (!S.hunt && P && P.alive && P.mode === 'ground' && a.state !== 'flee' && (dp < S.flee * 0.45 || (dp < S.flee && (P.sprinting || P.speedNow > 4.5)))) { if (this.R.f() < 0.5 && (a.sp === 'deer' || a.sp === 'stag')) G.audio.bleat && G.audio.bleat(a.x, a.y + 1.2, a.z); a.state = 'flee'; a.t = this.R.range(5, 8); a.fleeFrom = { x: P.pos.x, z: P.pos.z }; }
      if (a.state === 'hunt') { if (!P || !P.alive || a.t <= 0 && dp > S.hunt * 1.6) { a.state = 'graze'; a.t = 4; } else { tx = P.pos.x; tz = P.pos.z; want = dp > 2.2 ? S.run : 0;
          a.atkT -= dt; if (dp < 2.6 && a.atkT <= 0) { a.atkT = 1.4; P.damage(S.bite * (diff.dmgToPlayer || 1) * 1.2, null, 'body', 'animal', Math.sin(a.yaw), Math.cos(a.yaw)); G.fx.impact(P.pos.x, P.pos.y + 1.1, P.pos.z, -Math.sin(a.yaw), 0.3, -Math.cos(a.yaw), 5); G.ui.toast(S.name + ' ATTACK'); P.shakeCam(0.9); } } }
      else if (a.state === 'flee') { if (a.t <= 0) { a.state = 'graze'; a.t = this.R.range(2, 5); a.home = { x: a.x, z: a.z }; } else { const f = a.fleeFrom || a; let ax = a.x - f.x, az = a.z - f.z; const l = Math.hypot(ax, az) || 1; tx = a.x + ax / l * 20; tz = a.z + az / l * 20; want = S.run; } }
      else if (a.state === 'walk') { if (!a.goal || Math.hypot(a.goal.x - a.x, a.goal.z - a.z) < 1 || a.t <= 0) { a.state = 'graze'; a.t = this.R.range(3, 9); a.goal = null; } else { tx = a.goal.x; tz = a.goal.z; want = S.walk; } }
      else { if (a.t <= 0) { a.state = 'walk'; a.t = this.R.range(6, 14); const ang = this.R.f() * 6.283, r = this.R.range(4, 22); a.goal = { x: a.home.x + Math.cos(ang) * r, z: a.home.z + Math.sin(ang) * r }; } }
      // ---- move (terrain following, stay on land, steer round obstacles)
      if (tx !== null && want > 0) { let hd = Math.atan2(tx - a.x, tz - a.z); for (const off of [0, 0.6, -0.6, 1.3, -1.3, 2.2, -2.2]) { const h2 = hd + off, nx = a.x + Math.sin(h2) * 1.5, nz = a.z + Math.cos(h2) * 1.5; if (W.heightAt(nx, nz) > 2.4 && nav.isFree(nx, nz)) { hd = h2; break; } }
        a.yaw = dampAngle(a.yaw, hd, want > 3 ? 7 : 3, dt); }
      a.speed += clamp(want - a.speed, -9 * dt, (want > 3 ? 7 : 2) * dt);
      if (a.speed > 0.05) { const nx = a.x + Math.sin(a.yaw) * a.speed * dt, nz = a.z + Math.cos(a.yaw) * a.speed * dt; if (W.heightAt(nx, nz) > 2.3 && nav.isFree(nx, nz)) { a.x = nx; a.z = nz; } else { a.speed *= 0.3; if (a.state === 'walk') a.goal = null; } }
      a.y = W.heightAt(a.x, a.z); if (S.hp > 200 && a.speed > 5 && dp < 14 && P.shakeCam) P.shakeCam((1 - dp / 14) * 0.35);
      // ---- animate: stride phase from distance travelled, body bob + pitch with the slope, rabbits hop, grazing dips the head
      a.ph += a.speed * dt * S.gait * 2.2; const run = clamp((a.speed - S.walk) / (S.run - S.walk), 0, 1), amp = clamp(a.speed / S.walk, 0, 1) * (0.32 + run * 0.35);
      a.graze += ((a.state === 'graze' && Math.sin(this.t * 0.4 + a.ph) > -0.2 ? 1 : 0) - a.graze) * Math.min(1, dt * 1.5);
      for (const U of a.mats) { U.uPh.value = a.ph; U.uAmp.value = S.hop ? 0 : amp; U.uGraze.value = a.graze; }
      const bob = S.hop ? Math.abs(Math.sin(a.ph * 0.5)) * clamp(a.speed, 0, 2) * 0.12 : Math.abs(Math.sin(a.ph)) * amp * a.H * 0.035;
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), pitch = Math.atan2(W.heightAt(a.x - fx * a.len * 0.4, a.z - fz * a.len * 0.4) - W.heightAt(a.x + fx * a.len * 0.4, a.z + fz * a.len * 0.4), a.len * 0.8);
      a.g.position.set(a.x, a.y + bob, a.z); a.g.rotation.set(0, a.yaw, 0); a.body.rotation.x = pitch * 0.8;
    }
    // respawn: keep the woods populated (new animals appear far from the player)
    if (this.list.some(a => a.removed)) { for (const a of this.list) if (a.removed) this.pending.push({ sp: a.sp, home: a.home, t: 45 }); this.list = this.list.filter(a => !a.removed); }
    for (let i = this.pending.length - 1; i >= 0; i--) { const q = this.pending[i]; q.t -= dt; if (q.t > 0) continue; const P0 = G.player; if (P0 && P0.alive && Math.hypot(q.home.x - P0.pos.x, q.home.z - P0.pos.z) < 160) { q.t = 10; continue; }
      if (this._add(q.sp, q.home.x + this.R.range(-10, 10), q.home.z + this.R.range(-10, 10), q.home)) this.pending.splice(i, 1); else q.t = 10; }
  }
}
