// Enemy AI: perception (sight + hearing), decision making (loot / roam / zone / fight / cover / heal), path following,
// weapon handling, plus a cheap far-away simulation tier so 98 opponents stay alive on the island.
import * as THREE from 'three';
import { Character, SPEED } from '../characters/Character.js';
import { ENEMY_KEYS, PEOPLE_KEYS, ALIEN_KEYS } from '../characters/SoldierGLB.js';
import { WEAPONS } from '../weapons/Weapons.js';
import { ITEMS, rollLoot } from '../inventory/Items.js';
import { RNG, clamp, dampAngle, wrapAngle } from '../utils/math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _tmp = { x: 0, z: 0 };
const PRE = ['Ghost', 'Viper', 'Rogue', 'Ash', 'Nova', 'Echo', 'Raven', 'Onyx', 'Jinx', 'Kilo', 'Mako', 'Drift', 'Saber', 'Tango', 'Wraith', 'Frost', 'Blitz', 'Cobra', 'Dusk', 'Ember', 'Flint', 'Grit', 'Havoc', 'Iron', 'Lynx', 'Moss', 'Nyx', 'Pike', 'Quill', 'Rook', 'Slate', 'Thorn', 'Vex', 'Wolf', 'Zed'];
const SUF = ['', '_7', 'X', '99', '_TV', 'zz', '_K', '47', 'HD', '_Pro', '13', 'ko', '_II', '88', 'xD'];

export class Bot extends Character {
  constructor(G, id, name, R) { super(G, id, name); this.R = R; this.modelKey = R.chance(0.72) ? R.pick(ALIEN_KEYS) : R.pick(ENEMY_KEYS.slice(0, 8)); /* hostiles are the Swarm; civilians are re-skinned as people by the mission */ this.path = []; this.skill = R.range(0.7, 1.3); this.outfit = R.int(0, 5); this.resetAI(); }
  resetAI() {
    this.state = 'loot'; this.target = null; this.seenT = 9; this.lastSeen = { x: 0, z: 0 }; this.goal = null; this.path.length = 0; this.pathI = 0; this.wantPath = false; this.pathT = 0;
    this.thinkT = this.R.f() * 0.2; this.react = 0; this.burstT = 0; this.pauseT = 0; this.strafe = 1; this.strafeT = 0; this.lod = 'far'; this.farT = this.R.f() * 0.5; this.fightT = this.R.f();
    this.alert = null; this.stuckT = 0; this.lx = 0; this.lz = 0; this.fails = 0; this.lootIt = null; this.drop = null; this.jumpS = 0; this.acq = 0; this.coverT = 0; this.wantCrouch = false; this.grenT = this.R.range(8, 20); this.visYaw = 0; this.flankT = 0; this.flankChk = this.R.range(1, 4); this.dodgeT = 0; this.supp = false; this.callT = 0; this.idleT = 0; this.gearT = this.R.range(10, 30);
  }
  onHurt(amount, attacker) { const D = this.G.settings.diff(); if (this.alive && this.R.chance(D.dodge || 0)) { this.strafe = this.strafe ? -this.strafe : (this.R.chance(0.5) ? 1 : -1); this.strafeT = this.R.range(0.6, 1.3); this.wantCrouch = false; this.dodgeT = 0.4; }
    if (attacker && attacker !== this && attacker.alive) { if (!this.target || this.seenT > 1) { this.target = attacker; this.seenT = 0.5; this.lastSeen.x = attacker.pos.x; this.lastSeen.z = attacker.pos.z; this.react = Math.min(this.react, 0.25); } this.strafeT = 0; } }
  hasGun() { return !!(this.weapons[0] || this.weapons[1] || this.weapons[2]); }
  bestSlot(dist) { let best = -1, bs = -1; for (let i = 0; i < 3; i++) { const w = this.weapons[i]; if (!w) continue; const d = WEAPONS[w.id]; let s = d.dmg * d.pellets * d.rpm / 600; if (dist > d.range[1]) s *= 0.2; else if (dist > d.range[0] * 1.5) s *= 0.6; if (d.cls === 'SNIPER' || d.cls === 'DMR') s *= dist > 60 ? 1.6 : 0.5; if (d.cls === 'SHOTGUN') s *= dist < 18 ? 1.6 : 0.2; if (s > bs) { bs = s; best = i; } } return best; }
  // instant abstract loot (used by the far tier)
  gearUp(tier = 1) {
    const id = rollLoot(this.R, tier), d = ITEMS[id];
    if (d.type === 'weapon') { const def = WEAPONS[id]; const slot = def.slot === 'sidearm' ? 2 : !this.weapons[0] ? 0 : !this.weapons[1] ? 1 : -1; if (slot >= 0) { this.weapons[slot] = { id, ammo: def.mag, scope: 0, supp: false, mode: 0 }; this.bag['ammo_' + def.ammo] = (this.bag['ammo_' + def.ammo] || 0) + def.mag * 3; if (this.cur < 0 || slot < this.cur) this.cur = slot; } }
    else if (d.type === 'helmet' || d.type === 'vest') { if (this[d.type].lvl < d.lvl) { this[d.type].lvl = d.lvl; this[d.type].dur = d.dur; } }
    else if (d.type === 'pack') this.pack = Math.max(this.pack, d.lvl);
    else if (d.type === 'heal' || d.type === 'throw') this.bag[id] = Math.min(4, (this.bag[id] || 0) + (d.n || 1));
    this._wkey = '';
  }
  wants(it) { const d = ITEMS[it.id]; if (d.type === 'weapon') { const def = WEAPONS[it.id]; return def.slot === 'sidearm' ? !this.weapons[2] && !this.weapons[0] : (!this.weapons[0] || !this.weapons[1]); } if (d.type === 'helmet' || d.type === 'vest') return this[d.type].lvl < d.lvl; if (d.type === 'pack') return this.pack < d.lvl; if (d.type === 'heal') return (this.bag[it.id] || 0) < 3; if (d.type === 'throw') return (this.bag.frag || 0) < 2; if (d.type === 'ammo') return this.weapons.some(w => w && 'ammo_' + WEAPONS[w.id].ammo === it.id) && (this.bag[it.id] || 0) < 150; return false; }
}

export class AI {
  constructor(G) { this.G = G; this.bots = []; this.R = new RNG(Date.now() & 0xffff); this.queue = []; this._near = []; }

  create(n) {
    const used = new Set();
    for (let i = 0; i < n; i++) { let name; do { name = this.R.pick(PRE) + this.R.pick(SUF); } while (used.has(name)); used.add(name); const b = new Bot(this.G, i + 1, name, new RNG(this.R.int(1, 1e9))); this.bots.push(b); }
    return this.bots;
  }
  reset() { for (const b of this.bots) { b.reset(); b.resetAI(); b.hideSoldier(); b.civ = false; b.rescued = false; } this.queue.length = 0; }

  // sound event: gunshots, footsteps, explosions
  noise(x, z, radius, src, boom = false) {
    if (this.G.animals) this.G.animals.noise(x, z, radius);
    for (const b of this.bots) {
      if (!b.alive || b === src || b.mode !== 'ground' || b.lod !== 'near') continue; const dx = b.pos.x - x, dz = b.pos.z - z, d2 = dx * dx + dz * dz, hr = radius * (this.G.settings.diff().hear || 1); if (d2 > hr * hr) continue;
      if (boom && d2 < 30 * 30) { b.strafeT = 0; b.coverT = 2; }
      if (b.target && b.seenT < 2) continue;
      if (!b.alert || d2 < 60 * 60 || b.alert.t > 4) { b.alert = { x: x + b.R.range(-6, 6), z: z + b.R.range(-6, 6), t: 0, src }; }
    }
  }

  update(dt) {
    const G = this.G, P = G.player, cam = G.gfx.camera.position, draw = G.gfx.q.botDraw;
    // path planning budget
    let budget = 4; while (budget-- > 0 && this.queue.length) { const b = this.queue.shift(); b.wantPath = false; if (!b.alive || !b.goal) continue; G.nav.findPath(b.pos.x, b.pos.z, b.goal.x, b.goal.z, b.path); b.pathI = 0; b.pathT = 0; }
    for (const b of this.bots) {
      if (b.mode === 'plane') continue;
      if (!b.alive) { if (b._ring) b._ring.visible = false; b.deadT += dt; if (b.soldier && b.soldier.group.visible) { if (b.deadT > 14) b.hideSoldier(); else b.syncVisual(dt, b.visYaw); } continue; }
      const d = Math.hypot(b.pos.x - cam.x, b.pos.z - cam.z);
      b.lod = d < (b.lod === 'near' ? 270 : 235) ? 'near' : 'far';
      if (b.civ) this._civ(b, dt);
      else if (b.mode === 'chute') this._descend(b, dt);
      else if (b.lod === 'near') { if (b._wasFar) { b._wasFar = false; const s = G.nav.nearestFree(b.pos.x, b.pos.z, 14, _tmp); if (s) { b.pos.x = s.x; b.pos.z = s.z; } b.pos.y = G.colliders.groundAt(b.pos.x, b.pos.z, G.world.heightAt(b.pos.x, b.pos.z) + 0.6); b.grounded = true; b.goal = null; b.path.length = 0; } this._near_(b, dt); }
      else { b._wasFar = true; b.farT -= dt; if (b.farT <= 0) { this._far(b, 0.5); b.farT = 0.5; } }
      if (d < draw && b.alive) { b.visYaw = dampAngle(b.visYaw, b.yaw, 12, dt); b.syncVisual(dt, b.visYaw); this._mark(b, d); } else b.hideSoldier();
    }
  }

  // identification ring on the ground: pulsing red under hostiles, green under civilians (one shared quad + two shaders)
  _mark(b, d) {
    const S = b.soldier; if (!S) return; let r = b._ring;
    if (!r || r.parent !== S.group || r.userData.civ !== !!b.civ) { if (r && r.parent) r.parent.remove(r);
      if (!this._ringGeo) { this._ringGeo = new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2); this._ringMat = (col) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          uniforms: { uTime: this.G.gfx.uTime, uCol: { value: new THREE.Color(col) } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv; void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
            float ring = smoothstep(0.07, 0.0, abs(r - 0.82)); float dash = 0.45 + 0.55 * step(0.5, fract(a * 1.2732 + uTime * 0.6));
            float w = fract(uTime * 0.7); float wave = smoothstep(0.06, 0.0, abs(r - w * 0.8)) * (1.0 - w) * 0.7; float core = smoothstep(0.8, 0.0, r) * 0.16 * (0.6 + 0.4 * sin(uTime * 5.0));
            gl_FragColor = vec4(uCol * 2.4, ring * dash + wave + core); }` }); this._ringRed = this._ringMat(0xff2a1e); this._ringGreen = this._ringMat(0x35ff7a); }
      r = b._ring = new THREE.Mesh(this._ringGeo, b.civ ? this._ringGreen : this._ringRed); r.userData.civ = !!b.civ; r.position.y = 0.07; r.renderOrder = 4; r.castShadow = false; S.group.add(r); }
    r.visible = b.mode === 'ground' && d < 160;
  }

  _descend(b, dt) {
    const D = b.drop; D.t += dt / D.dur; const t = clamp(D.t, 0, 1);
    b.pos.x = D.sx + (D.tx - D.sx) * t; b.pos.z = D.sz + (D.tz - D.sz) * t; b.pos.y = D.sy + (D.ty - D.sy) * (t * t * 0.35 + t * 0.65);
    b.yaw = Math.atan2(D.tx - D.sx, D.tz - D.sz);
    if (t >= 1) { if (b.lod === 'near') this.G.fx.dust(b.pos.x, D.ty, b.pos.z, 6); b.mode = 'ground'; b.grounded = true; b.pos.y = this.G.colliders.groundAt(b.pos.x, b.pos.z, D.ty + 1); b.state = 'loot'; b.thinkT = b.R.f() * 0.5; }
  }

  // civilians: cower in place while the player is close, drift near their spot otherwise; rescued when the player stays beside them
  _civ(b, dt) {
    const G = this.G, p = b.pos, P = G.player; if (!b.home) b.home = { x: p.x, z: p.z };
    const dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz);
    let sp = 0;
    // terror: when an armed hostile comes close the civilian bolts in the opposite direction, zig-zagging
    b.fearT = (b.fearT || 0) - dt; b.scanT = (b.scanT || 0) - dt;
    if (b.scanT <= 0) { b.scanT = 0.35; let th = null, td = 36; for (const o of this.bots) { if (o.civ || !o.alive || o.mode !== 'ground') continue; const q = Math.hypot(o.pos.x - p.x, o.pos.z - p.z); if (q < td) { td = q; th = o; } }
      if (th) { b.fearT = 5; const ax = (p.x - th.pos.x) / (td || 1), az = (p.z - th.pos.z) / (td || 1), j = b.R.range(-0.7, 0.7), cj = Math.cos(j), sj = Math.sin(j); b.goal = { x: p.x + (ax * cj - az * sj) * 16, z: p.z + (az * cj + ax * sj) * 16 }; } }
    const scared = b.fearT > 0; b.sprinting = scared;
    if (scared) sp = 6.4;
    else if (!(P.alive && d < 16)) { // calm: wander slowly around home
      b.idleT = (b.idleT || 0) - dt;
      if (!b.goal || b.idleT <= 0) { const a = b.R.f() * 6.283, r = b.R.range(2, 8); b.goal = { x: b.home.x + Math.cos(a) * r, z: b.home.z + Math.sin(a) * r }; b.idleT = b.R.range(4, 9); }
      sp = 1.4;
    }
    if (b.goal && sp > 0) { const gx = b.goal.x - p.x, gz = b.goal.z - p.z, gd = Math.hypot(gx, gz);
      if (gd > 0.5) { const st = Math.min(gd, sp * dt), nx = p.x + gx / gd * st, nz = p.z + gz / gd * st; if (G.nav.isFree(nx, nz)) { p.x = nx; p.z = nz; b.yaw = Math.atan2(gx, gz); b.speedNow = sp; } else { b.goal = null; b.speedNow = 0; } }
      else { b.goal = null; b.speedNow = 0; } } else b.speedNow = 0;
    p.y = Math.max(G.world.heightAt(p.x, p.z), -1.3); b.grounded = true;
    if (d < 3.2 && P.alive && P.mode === 'ground') { b.rescueT = (b.rescueT || 0) + dt; if (b.rescueT >= 1.2) this._rescue(b); }
    else b.rescueT = Math.max(0, (b.rescueT || 0) - dt);
  }
  _rescue(b) {
    const G = this.G; b.alive = false; b.rescued = true; b.hideSoldier(); b.speedNow = 0;
    G.fx.sparkle(b.pos.x, b.pos.y + 1, b.pos.z, 0.3, 1, 0.5, 26); G.player.points = (G.player.points || 0) + 75; G.ui.pointsPop(75, 'RESCUED'); G.ui.shakeHud(1); if (G.career) G.career.add('rescues', 1);
    const M = G.mission; if (M) { M.got++; G.ui.toast('SURVIVOR RESCUED · ' + M.got + ' / ' + M.need); }
  }

  // ---------- goal helpers ----------
  _setGoal(b, x, z) { b.goal = { x, z }; b.path.length = 0; b.pathI = 0; if (!b.wantPath) { b.wantPath = true; this.queue.push(b); } b.fails = 0; }
  _zoneGoal(b) { const Z = this.G.zone; const a = b.R.f() * 6.283, r = Math.sqrt(b.R.f()) * Z.nr * 0.75; let x = Z.nx + Math.cos(a) * r, z = Z.nz + Math.sin(a) * r; const s = this.G.nav.nearestFree(x, z, 20, _tmp); if (s) { x = s.x; z = s.z; } return { x, z }; }
  _inZone(x, z, margin = 0) { const Z = this.G.zone; return Math.hypot(x - Z.cx, z - Z.cz) < Z.r - margin; }
  _inNext(x, z, margin = 0) { const Z = this.G.zone; return Math.hypot(x - Z.nx, z - Z.nz) < Z.nr - margin; }
  _roamGoal(b) {
    const G = this.G, Z = G.zone;
    for (let k = 0; k < 8; k++) {
      let x, z; if (b.R.chance(0.55)) { const L = b.R.pick(G.world.locations); x = L.x + b.R.range(-L.r, L.r) * 0.8; z = L.z + b.R.range(-L.r, L.r) * 0.8; if (Math.hypot(x - b.pos.x, z - b.pos.z) > 420) continue; } else { const a = b.R.f() * 6.283, r = b.R.range(40, 160); x = b.pos.x + Math.cos(a) * r; z = b.pos.z + Math.sin(a) * r; }
      if (Math.hypot(x - Z.nx, z - Z.nz) > Z.nr * 0.92) continue; if (!G.nav.isLandFree(x, z)) continue; return { x, z };
    }
    return this._zoneGoal(b);
  }

  // ---------- full simulation tier ----------
  _near_(b, dt) {
    const G = this.G; b.tick(dt); b.thinkT -= dt; b.seenT += dt; b.strafeT -= dt; b.coverT -= dt; b.grenT -= dt; b.pathT += dt; b.flankT -= dt; b.dodgeT -= dt; b.callT -= dt; if (b.alert) { b.alert.t += dt; if (b.alert.t > 14) b.alert = null; }
    if (b.thinkT <= 0) { b.thinkT = 0.14 + b.R.f() * 0.06; this._think(b); }
    // ----- act
    let wx = 0, wz = 0, sp = SPEED.run; const T = b.target; const fighting = T && T.alive && b.seenT < 3.5 && b.hasGun();
    let moveGoal = null;
    if (b.goal) {
      if (b.pathI < b.path.length) { let tx = b.path[b.pathI], tz = b.path[b.pathI + 1]; if (Math.hypot(tx - b.pos.x, tz - b.pos.z) < 0.75) { b.pathI += 2; if (b.pathI < b.path.length) { tx = b.path[b.pathI]; tz = b.path[b.pathI + 1]; } } moveGoal = _tmp; _tmp.x = tx; _tmp.z = tz; }
      else { const dg = Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z); if (dg < 1.3) { b.goal = null; } else if (!b.wantPath) { if (b.pathT > 0.4) { b.wantPath = true; this.queue.push(b); } if (dg < 6 && G.nav.line(b.pos.x, b.pos.z, b.goal.x, b.goal.z)) { moveGoal = _tmp; _tmp.x = b.goal.x; _tmp.z = b.goal.z; } } }
    }
    if (b.state === 'zone' || b.state === 'flee') sp = SPEED.sprint; else if (b.state === 'loot' || b.state === 'roam') sp = b.R ? SPEED.run : SPEED.run; if (b.heal) sp = 0;
    b.stance = b.wantCrouch && fighting ? 1 : 0; if (b.stance === 1) sp = SPEED.crouch;
    if (moveGoal) { const dx = moveGoal.x - b.pos.x, dz = moveGoal.z - b.pos.z, l = Math.hypot(dx, dz) || 1; wx = dx / l * sp; wz = dz / l * sp; }
    if (fighting && b.state === 'combat') {
      // strafing while shooting
      const dx = T.pos.x - b.pos.x, dz = T.pos.z - b.pos.z, dist = Math.hypot(dx, dz) || 1; const def = b.def();
      if (b.strafeT <= 0) { b.strafeT = b.R.range(0.7, 2.2); b.strafe = b.R.pick([-1, 1, 0, 1, -1]); b.wantCrouch = b.R.chance(0.3) && dist > 14; }
      if (!moveGoal) { const px = -dz / dist, pz = dx / dist; let adv = 0; const ideal = def ? Math.min(def.range[0] * 0.9, 55) : 20; if (dist > ideal * 1.4) adv = 1; else if (dist < Math.min(7, ideal * 0.4)) adv = -1;
        const s2 = b.wantCrouch ? 0 : SPEED.walk + 1; wx = (px * b.strafe + dx / dist * adv) * s2; wz = (pz * b.strafe + dz / dist * adv) * s2;
        if (b.dodgeT > 0) { wx += px * b.strafe * 4.5; wz += pz * b.strafe * 4.5; }
        if (!G.nav.isFree(b.pos.x + wx * 0.5, b.pos.z + wz * 0.5)) { wx = 0; wz = 0; b.strafeT = 0; } }
      b.yaw = dampAngle(b.yaw, Math.atan2(dx, dz), 9, dt); b.aiming = true; b.aimHold = 0.5;
      this._shoot(b, T, dist, dt);
    } else {
      b.aiming = false; b.react = Math.max(b.react, 0.15); b.acq = 0;
      if (wx || wz) b.yaw = dampAngle(b.yaw, Math.atan2(wx, wz), 8, dt); else if (b.alert && !b.heal) b.yaw = dampAngle(b.yaw, Math.atan2(b.alert.x - b.pos.x, b.alert.z - b.pos.z), 4, dt);
      b.pitch = b.pitch * 0.9;
    }
    b.sprinting = sp > 6 && (wx || wz) !== 0;
    b.stepGround(dt, wx, wz, false);
    b.moveAng = wx || wz ? wrapAngle(Math.atan2(wx, wz) - b.yaw) : b.moveAng;
    // footsteps the player can hear
    if (b.speedNow > 1) { b.stepAcc += b.speedNow * dt; if (b.stepAcc > 1.9) { b.stepAcc = 0; const pd = b.pos.distanceTo(G.player.pos); if (pd < 36) G.audio.footstep(G.world.surfaceAt(b.pos.x, b.pos.z), b.pos.x, b.pos.y, b.pos.z, false, b.stance ? 0.5 : 1); } }
    // stuck handling
    b.stuckT += dt; if (b.stuckT > 1.1) { const moved = Math.hypot(b.pos.x - b.lx, b.pos.z - b.lz); b.lx = b.pos.x; b.lz = b.pos.z; b.stuckT = 0; if ((wx || wz) && moved < 0.35) { b.fails++; b.path.length = 0; b.pathI = 0; if (b.fails > 2) { b.goal = null; b.lootIt = null; b.fails = 0; } else if (b.goal && !b.wantPath) { b.wantPath = true; this.queue.push(b); } } else b.fails = 0; }
    // zone damage / fall into the sea safety
    if (b.pos.y < -1.2 && G.world.heightAt(b.pos.x, b.pos.z) < -2.6) { const s = G.nav.nearestFree(b.pos.x, b.pos.z, 30, _tmp); if (s) { b.pos.x = s.x; b.pos.z = s.z; } }
  }

  _think(b) {
    const G = this.G, D = G.settings.diff(), Z = G.zone; const p = b.pos;
    // ---- perception
    let best = null, bd = 1e9; b.eye(_a);
    for (const c of G.chars) {
      if (c === b || !c.alive || c.mode === 'plane' || c.mode === 'fall') continue; const dx = c.pos.x - p.x, dz = c.pos.z - p.z, d = Math.hypot(dx, dz); if (c.civ && d > 45) continue; // civilians are prey at close range
      let sight = D.sight * (c.stance === 2 ? 0.45 : c.stance === 1 ? 0.7 : 1) * (c.mode === 'seat' ? 1.4 : 1); if (c === b.target) sight *= 1.5;
      if (d > sight || d > bd) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - b.yaw)); if (ang > (D.fov || 1.25) && d > 14 && c !== b.target) continue;
      if (!G.colliders.los(_a.x, _a.y, _a.z, c.pos.x, c.pos.y + (c.stance === 2 ? 0.3 : c.stance === 1 ? 0.9 : 1.3), c.pos.z)) continue;
      best = c; bd = d * (c.civ ? 1.7 : c.isPlayer ? 1 - (D.focus || 0) * 0.75 : 1);
    }
    if (best) bd = Math.hypot(best.pos.x - p.x, best.pos.z - p.z);
    if (best && b.target !== best && D.squad > 0 && b.callT <= 0) { b.callT = 6; for (const o of this.bots) { if (o === b || !o.alive || o.civ || o.lod !== 'near' || o.mode !== 'ground') continue; if ((o.target && o.seenT < 3) || Math.hypot(o.pos.x - p.x, o.pos.z - p.z) > D.squad) continue; o.alert = { x: best.pos.x + o.R.range(-5, 5), z: best.pos.z + o.R.range(-5, 5), t: 0, src: best }; } }
    if (best) { if (b.target !== best) { b.react = D.react * b.R.range(0.7, 1.4) / b.skill; b.acq = 0; if (best.isPlayer && /^monsters\//.test(b.modelKey) && (b.screechT || 0) < performance.now()) { b.screechT = performance.now() + 9000; G.audio.screech && G.audio.screech(p.x, p.y + 1.6, p.z); } } b.target = best; b.seenT = 0; b.lastSeen.x = best.pos.x; b.lastSeen.z = best.pos.z; b.alert = null; }
    else if (b.target && (!b.target.alive || b.seenT > Math.max(4, D.search || 9))) b.target = null;
    if (!best && b.target && b.seenT > 0.35 && b.seenT < 0.55) b.supp = b.R.chance(D.suppress || 0); // just lost sight: decide whether to keep suppressing
    const T = b.target, armed = b.hasGun(); const out = !this._inZone(p.x, p.z, 4), outNext = !this._inNext(p.x, p.z, 6);
    const urgent = out || (outNext && (Z.shrinking || Z.timer < 35 + Z.nr * 0.05 + Math.hypot(p.x - Z.nx, p.z - Z.nz) / 5));
    // ---- healing
    if (b.hp < 60 && !b.heal && (!T || b.seenT > 3 || b.coverT > 0)) { if (b.bag.medkit && b.hp < 45) b.useHeal('medkit'); else if (b.bag.bandage) b.useHeal('bandage'); else if (b.bag.drink) b.useHeal('drink'); }
    // ---- state selection
    if (T && b.seenT < 3.5 && armed && !(out && b.hp < 50)) {
      b.state = 'combat'; const slot = b.bestSlot(bd < 1e8 ? bd : 30); if (slot >= 0 && slot !== b.cur) b.switchTo(slot);
      const w = b.weapon(); if (w && w.ammo <= 0 && b.reloadT < 0) { const def = WEAPONS[w.id]; if (b.ammoFor(def) <= 0) b.bag['ammo_' + def.ammo] = def.mag; b.startReload(); }
      // seek cover when hurt or reloading
      const heals = (b.bag.medkit || 0) + (b.bag.bandage || 0) + (b.bag.drink || 0);
      if (b.hp < 22 && !heals && D.coverHp >= 55 && b.flankT <= 0 && (!b.goal || b.coverT <= 0)) { const dx = p.x - T.pos.x, dz = p.z - T.pos.z, l = Math.hypot(dx, dz) || 1; const s = G.nav.randomFree(p.x + dx / l * 35, p.z + dz / l * 35, 14, b.R, _tmp, true); if (s) { this._setGoal(b, s.x, s.z); b.coverT = 5; } } // fall back
      else if ((b.hp < (D.coverHp || 45) || b.reloadT >= 0) && b.coverT <= 0 && !b.goal) { const c = this._findCover(b, T); if (c) { this._setGoal(b, c.x, c.z); b.coverT = 3.5; } }
      else if (b.flankT <= 0 && !b.goal && b.hp > 60 && bd > 16 && bd < 85 && (b.flankChk -= 0.17) <= 0) { b.flankChk = b.R.range(2.5, 4.5); if (b.R.chance(D.flank || 0)) { // work round the target's side
          const ux = (p.x - T.pos.x) / bd, uz = (p.z - T.pos.z) / bd, side = b.R.chance(0.5) ? 1 : -1, r = Math.min(30, bd * 0.7); const s = G.nav.nearestFree(T.pos.x + (ux * 0.55 - uz * side * 0.85) * r, T.pos.z + (uz * 0.55 + ux * side * 0.85) * r, 10, _tmp);
          if (s) { this._setGoal(b, s.x, s.z); b.flankT = 7; } } }
      else if (b.seenT > 1.2 && !b.goal && b.hp > 50) { this._setGoal(b, b.lastSeen.x + b.R.range(-4, 4), b.lastSeen.z + b.R.range(-4, 4)); } // push the last known position
      else if (b.seenT < 0.3 && b.goal && b.coverT <= 0 && b.flankT <= 0 && bd < 60) { b.goal = null; b.path.length = 0; }
      if (b.grenT <= 0 && b.bag.frag > 0 && b.seenT > 1 && b.seenT < 3.4 && (D.grenade || 0) > 0) { const d = Math.hypot(b.lastSeen.x - p.x, b.lastSeen.z - p.z); if (d > 9 && d < 34) { b.grenT = b.R.range(10, 22) / (D.grenade || 1); b._take('frag', 1); const t = 1.1 + d / 26; b.eye(_a); G.combat.throwGrenade(b, _a.x, _a.y, _a.z, (b.lastSeen.x - p.x) / t, 15 * t / 2 + 1.2, (b.lastSeen.z - p.z) / t); } }
      return;
    }
    if (T && !armed && b.seenT < 4 && (T.weapons[0] || T.weapons[1] || T.weapons[2]) && Math.hypot(T.pos.x - p.x, T.pos.z - p.z) < 70) { // unarmed vs armed: break line of sight
      if (b.state !== 'flee' || !b.goal) { b.state = 'flee'; const dx = p.x - T.pos.x, dz = p.z - T.pos.z, l = Math.hypot(dx, dz) || 1; const s = G.nav.randomFree(p.x + dx / l * 40, p.z + dz / l * 40, 18, b.R, _tmp, true); if (s) this._setGoal(b, s.x, s.z); }
      return;
    }
    if (urgent) { if (b.state !== 'zone' || !b.goal) { b.state = 'zone'; const g = this._zoneGoal(b); this._setGoal(b, g.x, g.z); } return; }
    if (b.heal) { b.goal = null; return; }
    if (T && T.alive && armed && b.hp > 35 && b.seenT >= 3.5 && b.seenT < (D.search || 9)) { // search pattern around the last known position
      if (b.state !== 'search' || !b.goal) { b.state = 'search'; const r = Math.min(16, 3 + (b.seenT - 3.5) * 1.6), a = b.R.f() * 6.283; const s = G.nav.nearestFree(b.lastSeen.x + Math.cos(a) * r, b.lastSeen.z + Math.sin(a) * r, 8, _tmp); if (s) this._setGoal(b, s.x, s.z); }
      return; }
    if (b.alert && armed && b.hp > 40 && b.alert.t < 10) { if (b.state !== 'hunt' || !b.goal) { b.state = 'hunt'; this._setGoal(b, b.alert.x, b.alert.z); } if (Math.hypot(b.alert.x - p.x, b.alert.z - p.z) < 6) b.alert = null; return; }
    // ---- looting: walk to wanted items nearby
    if (b.lootIt && (!b.lootIt.alive || !b.wants(b.lootIt))) { b.lootIt = null; b.goal = null; }
    if (b.lootIt) { const it = b.lootIt; if (Math.hypot(it.x - p.x, it.z - p.z) < 1.3 && Math.abs(it.y - p.y) < 1.6) { const r = b.give(it); if (r === true) G.loot.remove(it); else if (!r) it._skip = b.id; if (ITEMS[it.id].type === 'weapon') { const def = WEAPONS[it.id]; b.bag['ammo_' + def.ammo] = (b.bag['ammo_' + def.ammo] || 0) + def.mag * 2; } b.lootIt = null; b.goal = null; } else if (!b.goal) { this._setGoal(b, it.x, it.z); b.state = 'loot'; } return; }
    b.idleT -= 0.17;
    if (b.idleT <= 0) {
      b.idleT = 0.9; const list = G.loot.near(p.x, p.z, armed ? 26 : 45, this._near); let pick = null, pd = 1e9;
      for (const it of list) { if (!it.alive || it._skip === b.id || !b.wants(it)) continue; if (Math.abs(it.y - p.y) > 1.4) continue; if (!G.nav.isFree(it.x, it.z)) continue; const d = (it.x - p.x) ** 2 + (it.z - p.z) ** 2 - (ITEMS[it.id].type === 'weapon' ? 300 : 0); if (d < pd) { pd = d; pick = it; } }
      if (pick) { b.lootIt = pick; b.state = 'loot'; this._setGoal(b, pick.x, pick.z); return; }
    }
    if (!b.goal) { b.state = 'roam'; const g = this._roamGoal(b); this._setGoal(b, g.x, g.z); }
  }

  _findCover(b, T) {
    const G = this.G; let best = null, bs = 1e9; const ty = T.pos.y + 1.3;
    for (let k = 0; k < 10; k++) { const a = b.R.f() * 6.283, r = b.R.range(4, 16), x = b.pos.x + Math.cos(a) * r, z = b.pos.z + Math.sin(a) * r; if (!G.nav.isLandFree(x, z)) continue; const y = G.world.heightAt(x, z) + 1.1; if (G.colliders.los(x, y, z, T.pos.x, ty, T.pos.z)) continue; if (r < bs) { bs = r; best = { x, z }; } }
    return best;
  }

  _shoot(b, T, dist, dt) {
    const G = this.G, D = G.settings.diff(); const def = b.def(); if (!def) return;
    const sup = b.seenT > 0.35; if (sup && !(b.supp && b.seenT < 2.4)) { b.burstT = 0; return; } // no line of sight (unless suppressing)
    b.react -= dt; b.acq += dt; if (b.react > 0) return;
    b.pauseT -= dt; if (b.pauseT > 0) return;
    if (b.burstT <= 0) { b.burstT = (def.modes[0] === 'AUTO' ? b.R.range(0.25, 0.8) : 0.05) * D.burst; }
    if (b.fireCd > 0 || b.reloadT >= 0) return;
    b.eye(_a); const S = T.spheres(); const head = !sup && b.R.chance(0.1 * b.skill * (dist < 40 ? 1 : 0.5)); const s = sup ? [b.lastSeen.x, T.pos.y + 1.1, b.lastSeen.z] : S[head ? 0 : 1];
    let dx = s[0] - _a.x, dy = s[1] - _a.y, dz = s[2] - _a.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    // aim error cone (degrees) - shrinks as the bot tracks, grows with range and motion
    let err = D.aimErr / b.skill * (1 + dist / 70) * (T.speedNow > 3 ? 1.35 : 1) * (b.speedNow > 1.5 ? 1.3 : 1) * (1 + Math.max(0, (D.track || 1.1) - b.acq) * 1.2) * (sup ? 2.2 : 1) * (T.stance === 2 ? 1.3 : 1) * (T.mode === 'seat' ? 1.6 : 1);
    const e = err * 0.01745; dx += (b.R.f() + b.R.f() - 1) * e; dy += (b.R.f() + b.R.f() - 1) * e * 0.7; dz += (b.R.f() + b.R.f() - 1) * e; const l2 = Math.hypot(dx, dy, dz); dx /= l2; dy /= l2; dz /= l2;
    b.pitch = Math.asin(clamp(dy, -1, 1));
    if (b.fire(_a.x, _a.y, _a.z, dx, dy, dz)) {
      if (def.modes[0] !== 'AUTO') b.fireCd = Math.max(b.fireCd, (60 / def.rpm) * b.R.range(1.3, 2.4) / Math.min(1.2, b.skill));
      b.burstT -= 60 / def.rpm; if (b.burstT <= 0) b.pauseT = b.R.range(0.25, 0.9) / D.burst;
    }
  }

  // ---------- cheap far-away tier ----------
  _far(b, dt) {
    const G = this.G, Z = G.zone, p = b.pos; b.tick(dt); b.aiming = false; b.stance = 0;
    b.gearT -= dt; if (b.gearT <= 0) { b.gearT = b.R.range(14, 30); if (G.world.locationAt(p.x, p.z) || b.R.chance(0.35)) b.gearUp(b.R.chance(0.2) ? 2 : 1); if (b.hp < 70 && (b.bag.bandage || b.bag.medkit)) { b.hp = Math.min(100, b.hp + 30); if (b.bag.bandage) b._take('bandage', 1); else b._take('medkit', 1); } }
    const outNext = !this._inNext(p.x, p.z, 8);
    if (!b.goal || (outNext && b.state !== 'zone' && (Z.shrinking || Z.timer < 60 + Math.hypot(p.x - Z.nx, p.z - Z.nz) / 4.5))) { if (outNext) { b.state = 'zone'; b.goal = this._zoneGoal(b); } else { b.state = 'roam'; b.goal = this._roamGoal(b); } }
    const dx = b.goal.x - p.x, dz = b.goal.z - p.z, d = Math.hypot(dx, dz);
    if (d < 3) { b.goal = null; b.speedNow = 0; }
    else {
      const sp = (b.state === 'zone' ? 6 : 4.6) * dt; let nx = p.x + dx / d * sp, nz = p.z + dz / d * sp;
      if (!G.nav.isFree(nx, nz)) { const a = Math.atan2(dx, dz) + b.strafe * 1.2; nx = p.x + Math.sin(a) * sp; nz = p.z + Math.cos(a) * sp; if (!G.nav.isFree(nx, nz)) { b.strafe *= -1; b.fails++; if (b.fails > 6) { b.goal = null; b.fails = 0; } nx = p.x; nz = p.z; } }
      p.x = nx; p.z = nz; p.y = Math.max(G.world.heightAt(nx, nz), -1.3); b.yaw = Math.atan2(dx, dz); b.speedNow = 4.6;
    }
    // abstract firefights between far bots
    b.fightT -= dt;
    if (b.fightT <= 0) {
      b.fightT = 1.6; if (!b.hasGun()) return;
      let foe = null, fd = 48 * 48; for (const o of this.bots) { if (o === b || !o.alive || o.civ || o.mode !== 'ground' || o.lod !== 'far') continue; const q = (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2; if (q < fd) { fd = q; foe = o; } }
      if (foe) { if (b.cur < 0) b.cur = b.bestSlot(30); const def = b.def(); if (!def) return; const dist = Math.sqrt(fd); const acc = clamp(0.5 - dist / 120, 0.08, 0.5) * b.skill * (0.05 + 0.04 * Math.max(0, Z.phase)); const shots = Math.min(def.rpm / 60, 7) * 0.55; let dmg = 0; for (let i = 0; i < shots; i++) if (b.R.f() < acc) dmg += def.dmg * def.pellets * (def.pellets > 1 ? 0.4 : 1);
        if (dmg > 0) foe.damage(dmg, b, b.R.chance(0.12) ? 'head' : 'body', def.id); }
    }
  }
}
