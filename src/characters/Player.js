// Player controller: input, movement states (plane / freefall / parachute / ground / vehicle), weapon handling,
// interaction and the third-person / first-person / scoped camera.
import * as THREE from 'three';
import { Character, SPEED } from './Character.js';
import { WEAPONS } from '../weapons/Weapons.js';
import { ITEMS, itemName } from '../inventory/Items.js';
import { HEROES, heroIndex, heroScan } from './Heroes.js';
import { clamp, damp, dampAngle, lerp, wrapAngle } from '../utils/math.js';

const _eye = new THREE.Vector3(), _f = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Vector3();

export class Player extends Character {
  constructor(G) {
    super(G, 0, G.settings.d.name || 'YOU'); this.isPlayer = true; this.outfit = G.settings.d.outfit || 0; this.setHero(G.settings.d.hero || 0);
    this.camYaw = 0; this.camPitch = -0.1; this.camDist = 3.1; this.camDistNow = 3.1; this.shoulder = 1; this.fpp = false; this.scoped = false; this.aimK = 0; this.pivotY = 1.55;
    this.recover = 0; this.shake = 0; this.stamina = 100; this.suppress = 0; this.prompt = null; this._auto = 0; this._near = []; this.throwCd = 0; this.idleLook = 0;
  }
  reset() { super.reset(); this.setHero(this.G.settings.d.hero || 0); this.points = 0; this.stamina = 100; this.scoped = false; this.aimK = 0; this.recover = 0; this.suppress = 0; this.prompt = null; this.throwCd = 0; const SD = this.G.settings.d; this.fpp = SD.view === 'first'; this.camDist = clamp(SD.camDist || 3.1, 1.2, 8); this.meleeCd = 0; this.meleeHit = -1; }
  // choose a hero: swap the model (rebuilt on the next visual sync) and play the scan-line reveal
  setHero(i) { i = heroIndex(i); const changed = this.heroId !== i; this.heroId = i; this.modelKey = HEROES[i].key;
    if (changed && this.soldier) { if (this.soldier.group.parent) this.soldier.group.parent.remove(this.soldier.group); this.soldier = null; this._wkey = ''; }
    this._scanNext = true; }
  shakeCam(a) { this.shake = Math.max(this.shake, a); }
  onHurt(amount, attacker, zone, fx, fz) { const G = this.G; G.ui.shakeHud(amount > 25 ? 2 : 1); G.audio.hurt(); G.ui.hurt(amount, attacker ? attacker.pos.x : this.pos.x - fx, attacker ? attacker.pos.z : this.pos.z - fz); this.shake = Math.max(this.shake, 0.25 + amount * 0.012); }

  update(dt) {
    const G = this.G, I = G.input, S = G.settings.d;
    // ---- look
    const zoom = this.scoped ? Math.max(1.3, this.zoomOf(this.weapon())) : 1 + this.aimK * 0.35;
    const sens = 0.0022 * S.sens * (this.aimK > 0.5 ? S.adsSens : 1) / (this.scoped ? zoom * 0.5 : 1);
    if (I.mx || I.my) this.idleLook = 0; else this.idleLook += dt;
    this.camYaw = wrapAngle(this.camYaw - I.mx * sens); this.camPitch = clamp(this.camPitch - I.my * sens * (S.invertY ? -1 : 1), -1.45, 1.45);
    if (this.recover > 0) { const r = this.recover * (1 - Math.exp(-7 * dt)); this.camPitch -= r; this.recover -= r; }
    this.tick(dt); this.throwCd -= dt; this.suppress = Math.max(0, (this.suppress || 0) - dt * 0.8);
    this.prompt = null;
    if (!this.alive) { this.deadT += dt; this.aiming = false; this.scoped = false; this._camera(dt); return; }
    const m = this.mode;
    if (m === 'plane') this._plane(dt); else if (m === 'fall' || m === 'chute') this._air(dt); else if (m === 'seat') this._seat(dt); else this._ground(dt);
    this._camera(dt);
  }

  _plane(dt) {
    const M = this.G.match, pl = M.plane; this.pos.copy(pl.pos); this.yaw = pl.yaw; this.aiming = false;
    // engine vibration, with a jolt of turbulence every few seconds
    this.shakeCam(0.2); this._turbT = (this._turbT === undefined ? 2.5 : this._turbT) - dt; if (this._turbT <= 0) { this._turbT = 2.5 + Math.random() * 4; this.shakeCam(0.75 + Math.random() * 0.3); this.G.ui.shakeHud(1); }
    if (!M.canJump) this.prompt = { text: 'APPROACHING THE DROP ZONE  ·  STAND BY', key: 'interact' };
    if (M.canJump) { this.prompt = { text: 'JUMP  ·  ALT 440 m', key: 'interact' }; if (this.G.input.pressed('interact') || this.G.input.pressed('jump') || M.forceJump) this.jump(); }
  }
  jump() { const pl = this.G.match.plane; this.shakeCam(1.1); this.G.ui.shakeHud(2); this.mode = 'fall'; this.pos.copy(pl.pos); this.pos.y -= 7; this.vel.set(Math.sin(pl.yaw) * 34, -8, Math.cos(pl.yaw) * 34); this.camYaw = pl.yaw; this.camPitch = -0.5; this.G.match.onPlayerJump(); }

  _air(dt) {
    const G = this.G, I = G.input, p = this.pos, v = this.vel; const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const fwd = (I.is('forward') ? 1 : 0) - (I.is('back') ? 1 : 0), side = (I.is('right') ? 1 : 0) - (I.is('left') ? 1 : 0);
    const ground = Math.max(G.colliders.groundAt(p.x, p.z, p.y + 0.5, 0.5), -1.3); const agl = p.y - ground;
    if (this.mode === 'fall') {
      const dive = clamp(-this.camPitch / 1.2, 0, 1); const hs = (8 + Math.max(0, fwd) * 26) * (1 - dive * 0.65);
      v.x = damp(v.x, fx * hs - fz * side * 9, 1.6, dt); v.z = damp(v.z, fz * hs + fx * side * 9, 1.6, dt); v.y = damp(v.y, -(40 + dive * 30 - Math.max(0, fwd) * (1 - dive) * 8), 1.3, dt);
      this.yaw = dampAngle(this.yaw, this.camYaw, 5, dt); const spd = Math.hypot(v.x, v.y, v.z); this.shakeCam(0.3 + dive * 0.45 + Math.min(0.25, spd * 0.003)); this.fallK = dive;
      // cloud wisps and mist streaming up past the body
      this._wispT = (this._wispT || 0) - dt; if (this._wispT <= 0) { this._wispT = 0.035; const S2 = G.fx.smoke, lead = 0.9 + Math.random() * 0.8;
        for (let i = 0; i < 2; i++) { const a = Math.random() * 6.283, r = 2.5 + Math.random() * 16; S2.spawn(p.x + v.x * lead + Math.cos(a) * r, p.y + v.y * lead + (Math.random() - 0.5) * 6, p.z + v.z * lead + Math.sin(a) * r, v.x * 0.15, 4 + Math.random() * 6, v.z * 0.15, 1, 1, 1, 0.1 + Math.random() * 0.14, 1.5 + Math.random() * 5, 1.6, 2.5, 0, 0); }
        const a2 = Math.random() * 6.283, r2 = 0.8 + Math.random() * 3; G.fx.sparks.spawn(p.x + v.x * 0.5 + Math.cos(a2) * r2, p.y + v.y * 0.6, p.z + v.z * 0.5 + Math.sin(a2) * r2, 0, 14 + dive * 20, 0, 0.9, 0.95, 1, 0.5, 0.03, 0.5, 0, 0, 0); }
      this.prompt = { text: (agl < 400 ? 'IGNITE JETPACK  ·  ' : '') + 'ALT ' + Math.round(agl) + ' m  ·  ' + Math.round(spd * 3.6) + ' km/h', key: 'interact' };
      if (agl < 105 || ((I.pressed('interact') || I.pressed('jump')) && agl < 400)) { this.mode = 'chute'; this.shakeCam(0.8); this.jetFuel = 100; this.jetSpd = Math.hypot(v.x, v.z) * 0.5; this.jetBank = 0; G.audio.chute(); v.y = Math.max(v.y, -30); }
    } else {
      if (Math.random() < 0.6) { const tw = this.yaw + 0.75, bx = p.x - Math.sin(tw) * 0.3, bz = p.z - Math.cos(tw) * 0.3;
        G.fx.sparks.spawn(bx, p.y + 0.85, bz, (Math.random() - 0.5) * 0.6, -7 - Math.random() * 3, (Math.random() - 0.5) * 0.6, 4, 2.2, 0.7, 1, 0.12, 0.18, 0, 0, 0.5);
        if (Math.random() < 0.3) G.fx.smoke.spawn(bx, p.y + 0.4, bz, (Math.random() - 0.5) * 0.4, -2.5, (Math.random() - 0.5) * 0.4, 0.62, 0.62, 0.66, 0.12, 0.18, 0.9, 0.6, -0.6, 1.2); }
      // jetpack flight, driven like a vehicle: W throttle, S brake / reverse, A / D turn, SPACE lift, SHIFT / C descend
      const up = I.is('jump'), down = I.is('sprint') || I.is('crouch');
      if (this.jetSpd === undefined) this.jetSpd = Math.hypot(v.x, v.z);
      if (fwd > 0) this.jetSpd = Math.min(20, this.jetSpd + 9 * dt); else if (fwd < 0) this.jetSpd = Math.max(-5, this.jetSpd - 14 * dt); else this.jetSpd = damp(this.jetSpd, 0, 0.8, dt);
      this.shakeCam(0.13 + (up && this.jetFuel > 0 ? 0.14 : 0) + Math.min(0.12, Math.abs(this.jetSpd || 0) * 0.006));
      const turn = side * (1.9 - Math.min(1, Math.abs(this.jetSpd) / 20) * 0.8); this.yaw -= turn * dt;
      this.jetBank = damp(this.jetBank || 0, -side * Math.min(1, Math.abs(this.jetSpd) / 8) * 0.35, 6, dt);
      const hx = Math.sin(this.yaw), hz = Math.cos(this.yaw);
      if (this.jetFuel === undefined) this.jetFuel = 100; const lift = up && this.jetFuel > 0;
      let vs = lift ? (agl > 380 ? -0.5 : 2.2) : down ? -13 : -3.8 - Math.abs(this.jetSpd) * 0.05; if (!lift && agl < 10 && !down) vs *= 0.45 + agl / 18;
      this.jetFuel = lift ? Math.max(0, this.jetFuel - 7 * dt) : Math.min(100, this.jetFuel + 2.5 * dt);
      v.x = damp(v.x, hx * this.jetSpd, 3, dt); v.z = damp(v.z, hz * this.jetSpd, 3, dt); v.y = damp(v.y, vs, 2.2, dt);
      // camera trails behind the jetpack like a car chase cam unless the player is looking around
      if (this.idleLook > 0.6) { this.camYaw = dampAngle(this.camYaw, this.yaw, 2.5, dt); this.camPitch = damp(this.camPitch, -0.32, 2, dt); }
      this.prompt = { text: 'W/S SPEED  ·  A/D TURN  ·  SHIFT DOWN  ·  FUEL ' + Math.round(this.jetFuel) + '%', key: 'jump' };
    }
    p.addScaledVector(v, dt); p.x = clamp(p.x, -1016, 1016); p.z = clamp(p.z, -1016, 1016);
    if (agl < 40) G.colliders.resolve(p, p.y, 0.4, 1.8);
    this.speedNow = 0; this.aiming = false;
    if (p.y <= ground + 0.02) { p.y = ground; const hard = this.mode === 'fall'; this.mode = 'ground'; this.grounded = true; this.stance = 0; v.set(v.x * 0.3, 0, v.z * 0.3); G.audio.land(); G.fx.dust(p.x, p.y, p.z, 8); this.shake = 0.5; if (hard) this.damage(60, null, 'limb', 'fall'); G.match.onPlayerLand(); }
  }

  _ground(dt) {
    const G = this.G, I = G.input, S = G.settings.d, ui = G.ui.blocking();
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    let f = 0, s = 0; if (!ui) { f = (I.is('forward') ? 1 : 0) - (I.is('back') ? 1 : 0); s = (I.is('right') ? 1 : 0) - (I.is('left') ? 1 : 0); }
    const w = this.weapon(), def = this.def();
    // stance
    if (!ui) {
      if (I.pressed('crouch')) this.stance = this.stance === 1 ? 0 : 1;
      if (I.pressed('prone')) this.stance = this.stance === 2 ? 0 : 2;
    }
    const wantAim = !ui && I.mb[2] && w && this.reloadT < 0 && !this.heal;
    const moving = f !== 0 || s !== 0;
    let jump = false; if (!ui && I.pressed('jump')) { if (this.stance !== 0) this.stance = 0; else if (this.grounded) jump = true; }
    const canSprint = !ui && I.is('sprint') && f > 0 && this.stance === 0 && !wantAim && this.stamina > 1 && !this.swim && !this.heal;
    this.sprinting = canSprint && moving;
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt * 9); else this.stamina = Math.min(100, this.stamina + dt * (this.boost > 20 ? 16 : 10));
    let sp = this.swim ? SPEED.swim : this.stance === 2 ? SPEED.prone : this.stance === 1 ? SPEED.crouch : this.sprinting ? SPEED.sprint : wantAim ? SPEED.walk + 0.6 : SPEED.run;
    if (this.heal) sp = Math.min(sp, 2.2); if (f < 0) sp *= 0.78; if (this.boost > 60) sp *= 1.06; if (this.suppress > 0.5) sp *= 0.96;
    let wx = 0, wz = 0; if (moving) { const l = Math.hypot(f, s); wx = (fx * f - fz * s) / l * sp; wz = (fz * f + fx * s) / l * sp; }
    const landed = this.stepGround(dt, wx, wz, jump);
    if (landed > 13.5) { this.damage((landed - 13.5) * 8, null, 'limb', 'fall'); this.shake = 0.6; } if (landed > 4) { this.shakeCam(Math.min(0.5, landed * 0.035)); G.audio.land(); G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 3); }
    this.yaw = dampAngle(this.yaw, this.camYaw, 16, dt); this.pitch = this.camPitch;
    this.moveAng = moving ? Math.atan2(-s, f) : this.moveAng;
    // footsteps
    if (this.grounded && this.speedNow > 0.6) {
      this.stepAcc += this.speedNow * dt; const stride = this.stance === 2 ? 0.9 : this.sprinting ? 2.3 : 1.75;
      if (this.stepAcc > stride) { this.stepAcc = 0; const surf = this.surface(); if (surf === 'water') G.fx.splash(this.pos.x, this.pos.z, this.swim ? 1 : 0.6); else if (this.sprinting && surf !== 'road' && surf !== 'concrete' && surf !== 'metal' && surf !== 'wood') G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 2); if (this.sprinting) this.shakeCam(0.07); G.audio.footstep(surf, 0, 0, 0, true, this.stance ? 0.5 : this.sprinting ? 1.3 : 1); G.ai.noise(this.pos.x, this.pos.z, this.stance === 2 ? 2 : this.stance === 1 ? 5 : this.sprinting ? 24 : 13, this);
        if ((surf === 'dirt' || surf === 'sand') && this.speedNow > 3) G.fx.dust(this.pos.x, this.pos.y, this.pos.z, this.sprinting ? 2 : 1); else if (surf === 'grass' && this.sprinting) G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 1, 0.32, 0.5, 0.2); if (surf === 'water') G.fx.impact(this.pos.x, 0, this.pos.z, 0, 1, 0, 6); }
    }
    // ---- weapons
    this.aiming = !!wantAim && !this.sprinting; this.aimK = damp(this.aimK, this.aiming ? 1 : 0, 13, dt);
    const z = this.zoomOf(w); this.scoped = this.aiming && this.aimK > 0.82 && (z >= 4 || this.fpp && z >= 2);
    if (!ui) {
      for (let i = 0; i < 4; i++) if (I.pressed('slot' + (i + 1))) { if (this.switchTo(i)) G.audio.reload(1); }
      if (I.wheel && !this.aiming) { let n = this.cur; for (let k = 0; k < 4; k++) { n = (n + (I.wheel > 0 ? 1 : 3)) % 4; if (n === 3 ? this.bag.frag : this.weapons[n]) break; } if (this.switchTo(n)) G.audio.reload(1); }
      if (I.pressed('reload')) this.startReload();
      if (I.pressed('roll') && this.grounded && this.stance === 0 && !this.swim && this.soldier && this.soldier.play) { if (this.soldier.play('Roll')) { G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 5); this.shakeCam(0.22); this.vel.x = Math.sin(this.yaw) * 6; this.vel.z = Math.cos(this.yaw) * 6; } }
      // melee: unarmed combo (punches / kicks) or a weapon-butt strike; the blow lands a moment after the swing starts
      this.meleeCd -= dt;
      if (I.pressed('melee') && this.meleeCd <= 0 && this.soldier && this.soldier.melee && !this.reloading) { const tool = !w && this.meleeItem ? ITEMS[this.meleeItem] : null; const kind = w ? 'bash' : tool ? (this.soldier.play && this.soldier.play('Sword_Slash', 1.5) ? 'Sword_Slash' : this.soldier.melee()) : this.soldier.melee(); if (w) this.bashFlag = true; if (kind) { this.shakeCam(0.14); this.meleeCd = w ? 0.7 : 0.42; this.meleeHit = w ? 0.14 : 0.17; this.meleeDmg = w ? 42 : tool ? tool.dmg : /Kick/.test(kind) ? 46 : /Sword/.test(kind) ? 55 : 30; if (tool) this.meleeCd = tool.rate; if (this.grounded) { this.vel.x += Math.sin(this.yaw) * 2.6; this.vel.z += Math.cos(this.yaw) * 2.6; } G.audio.footstep('dirt', 0, 0, 0, true, 1.2); } }
      if (this.meleeHit >= 0) { this.meleeHit -= dt; if (this.meleeHit < 0) { const fx0 = Math.sin(this.yaw), fz0 = Math.cos(this.yaw); let hit = false;
        for (const c of G.chars) { if (c === this || !c.alive) continue; const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z, dy = c.pos.y - this.pos.y; const d = Math.hypot(dx, dz); if (d > 2.3 || Math.abs(dy) > 1.6) continue; if (d > 0.4 && (dx * fx0 + dz * fz0) / d < 0.45) continue;
          c.damage(this.meleeDmg, this, 'body', 'melee', fx0, fz0); hit = true; G.fx.impact(c.pos.x - fx0 * 0.25, c.pos.y + 1.2, c.pos.z - fz0 * 0.25, -fx0, 0.3, -fz0, 5); if (c.vel) { c.vel.x += fx0 * 3.5; c.vel.z += fz0 * 3.5; } }
        if (G.animals && G.animals.melee(this, fx0, fz0, this.meleeDmg)) hit = true;
        if (hit) { this.shake = Math.max(this.shake, 0.35); G.audio.impact(5, this.pos.x + fx0, this.pos.y + 1.2, this.pos.z + fz0); } } }
      if (I.pressed('firemode') && w) { w.mode = ((w.mode || 0) + 1) % def.modes.length; G.audio.ui('click'); G.ui.toast(def.modes[w.mode]); }
      if (I.pressed('heal1')) this.tryHeal('bandage'); if (I.pressed('heal2')) this.tryHeal('medkit'); if (I.pressed('heal3')) this.tryHeal('drink');
      if (I.pressed('shoulder')) this.shoulder *= -1; if (I.pressed('camera')) { this.fpp = !this.fpp; G.settings.d.view = this.fpp ? 'first' : 'third'; G.settings.save(); G.ui.toast(this.fpp ? 'FIRST PERSON' : 'THIRD PERSON'); }
      { const zd = (I.is('zoomOut') ? 1 : 0) - (I.is('zoomIn') ? 1 : 0); // smooth zoom: all the way in switches to first person, zooming out leaves it
        if (zd) { if (this.fpp) { if (zd > 0) { this.fpp = false; this.camDist = 1.3; G.ui.toast('THIRD PERSON'); } } else { this.camDist = clamp(this.camDist + zd * dt * 4.5, 1.2, 8); if (zd < 0 && this.camDist <= 1.2) { this.fpp = true; G.ui.toast('FIRST PERSON'); } } this._zoomDirty = true; }
        else if (this._zoomDirty) { this._zoomDirty = false; G.settings.d.camDist = this.camDist; G.settings.d.view = this.fpp ? 'first' : 'third'; G.settings.save(); } }
      if (this.cur === 3) { if (I.mhit[0] && this.throwCd <= 0 && this.bag.frag > 0) this.throwGrenade(); }
      else if (w) {
        const mode = def.modes[w.mode || 0]; let pull = false;
        if (mode === 'AUTO') pull = I.mb[0]; else if (mode === 'BURST') { if (I.mhit[0] && this.burst <= 0) this.burst = 3; pull = this.burst > 0; } else pull = I.mhit[0];
        if (pull && this.fireCd <= 0 && !this.sprinting) {
          this._aimRay();
          if (this.fire(_p.x, _p.y, _p.z, _f.x, _f.y, _f.z)) {
            if (this.burst > 0) { this.burst--; if (this.burst > 0) this.fireCd = Math.min(this.fireCd, 0.07); }
            const k = (this.stance === 1 ? 0.75 : this.stance === 2 ? 0.55 : 1) * (this.aiming ? 0.85 : 1.15) * 0.0175;
            const up = def.recoil[0] * k, sd = (Math.random() * 2 - 1) * def.recoil[1] * k;
            this.camPitch = Math.min(1.45, this.camPitch + up); this.camYaw += sd; this.recover += up * 0.55; this.shake = Math.max(this.shake, 0.1 + def.recoil[0] * 0.07); this.fovK = Math.min(1.6, (this.fovK || 0) + 0.55 + def.recoil[0] * 0.12);
            if (w.ammo === 0 && this.ammoFor(def) > 0) this.startReload();
          } else if (this.burst > 0 && w.ammo <= 0) this.burst = 0;
        }
      }
    }
    // ---- interaction
    this._interact(dt, ui);
  }

  tryHeal(id) { if (this.useHeal(id)) { this.G.audio.heal(); } else if (!this.bag[id]) this.G.ui.toast('NO ' + itemName(id).toUpperCase()); }

  throwGrenade() {
    this._aimRay(); this.eye(_eye); const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
    this.G.combat.throwGrenade(this, _eye.x + rx * 0.3 + _f.x * 0.5, _eye.y + 0.1, _eye.z + rz * 0.3 + _f.z * 0.5, _f.x * 19 + this.vel.x, _f.y * 19 + 4.2, _f.z * 19 + this.vel.z);
    this._take('frag', 1); this.shakeCam(0.2); this.throwCd = 0.9; this.fired = true; this.G.audio.reload(0);
    if (!this.bag.frag) { for (let i = 0; i < 3; i++) if (this.weapons[i]) { this.switchTo(i, true); break; } if (this.cur === 3) this.cur = -1; }
  }

  // camera ray -> origin (_p) advanced to the player's depth, direction (_f)
  _aimRay() {
    const cam = this.G.gfx.camera; cam.getWorldDirection(_f); this.eye(_eye);
    const t = Math.max(0, _c.subVectors(_eye, cam.position).dot(_f)); _p.copy(cam.position).addScaledVector(_f, t);
  }

  surface() {
    const G = this.G, p = this.pos; const th = G.world.heightAt(p.x, p.z);
    if (p.y > th + 0.25) { const L = G.world.locationAt(p.x, p.z); if (L && (L.id === 'port' || L.id === 'steel')) return 'metal'; if (L && (L.id === 'green' || L.id === 'forest' || L.id === 'river' || L.id === 'peak')) return 'wood'; return 'concrete'; }
    return this.swim || th < -0.2 ? 'water' : G.world.surfaceAt(p.x, p.z);
  }

  _wants(it) { // auto-pickup filter
    const d = ITEMS[it.id];
    if (d.type === 'ammo') return this.weapons.some(w => w && 'ammo_' + WEAPONS[w.id].ammo === it.id) && (this.bag[it.id] || 0) < 240;
    if (d.type === 'heal') return (this.bag[it.id] || 0) < (it.id === 'bandage' ? 10 : it.id === 'medkit' ? 3 : 5);
    if (d.type === 'throw') return (this.bag.frag || 0) < 4;
    if (d.type === 'helmet' || d.type === 'vest') return this[d.type].lvl < d.lvl;
    if (d.type === 'pack') return this.pack < d.lvl;
    if (d.type === 'melee') return !this.meleeItem;
    if (d.type === 'scope') return this.weapons.some(w => w && WEAPONS[w.id].scopes && this.zoomOf(w) < d.zoom);
    if (d.type === 'supp') return this.weapons.some(w => w && WEAPONS[w.id].supp && !w.supp);
    if (d.type === 'weapon') { const def = WEAPONS[it.id]; return def.slot === 'sidearm' ? !this.weapons[2] : (!this.weapons[0] || !this.weapons[1]); }
    return false;
  }
  pickup(it) {
    if (this.soldier && this.soldier.play) this.soldier.play('Interact');
    const r = this.give(it); if (!r) { this.G.ui.toast(ITEMS[it.id].type === 'weapon' || ITEMS[it.id].w ? 'BACKPACK FULL' : 'ALREADY BETTER EQUIPPED'); return false; }
    { const wp = ITEMS[it.id].type === 'weapon' || ITEMS[it.id].type === 'melee'; this.G.fx.sparkle(it.x, it.y + 0.15, it.z, wp ? 0.4 : 1, wp ? 0.8 : 0.85, wp ? 1 : 0.4, wp ? 14 : 8); }
    if (r === true) this.G.loot.remove(it); this.G.audio.ui('pick'); this.G.ui.pickup(it.id); return true;
  }
  _interact(dt, ui) {
    const G = this.G, I = G.input, p = this.pos;
    this._auto -= dt;
    if (G.settings.d.autoPickup && this._auto <= 0 && this.alive) { this._auto = 0.2; const list = G.loot.near(p.x, p.z, 1.5, this._near); for (const it of list) { if (it.alive && Math.abs(it.y - p.y) < 1.3 && this._wants(it)) { this.pickup(it); break; } } }
    const it = G.loot.nearest(p.x, p.y, p.z, 2.3); const veh = G.vehicles.nearest(p, 3.4);
    if (it) { this.prompt = { text: itemName(it.id) + (it.n > 1 ? ' x' + it.n : ''), key: 'interact', item: it }; if (!ui && I.pressed('interact')) this.pickup(it); }
    else if (veh) { this.prompt = { text: 'DRIVE ' + veh.def.name, key: 'interact' }; if (!ui && I.pressed('interact')) G.vehicles.enter(this, veh); }
  }

  _seat(dt) {
    const G = this.G, I = G.input, v = this.vehicle; if (!v) { this.mode = 'ground'; return; }
    this.aiming = false; this.scoped = false; this.sprinting = false; this.speedNow = 0; this.stance = 0;
    const ui = G.ui.blocking();
    v.input(ui ? 0 : (I.is('forward') ? 1 : 0) - (I.is('back') ? 1 : 0), ui ? 0 : (I.is('left') ? 1 : 0) - (I.is('right') ? 1 : 0), !ui && I.is('jump'));
    this.prompt = { text: 'EXIT VEHICLE', key: 'interact' };
    if (!ui && I.pressed('interact')) G.vehicles.eject(this);
  }

  _camera(dt) {
    if (this._scanNext && this.soldier && this.soldier.heroU) { this._scanNext = false; heroScan(this.soldier); }
    const G = this.G, cam = G.gfx.camera, S = G.settings.d; const p = this.pos;
    this.shake = Math.max(0, this.shake - dt * 3.2); const sh = this.shake + G.fx.shake;
    const st = performance.now() / 1000, sk = Math.min(1.6, sh), s2 = sk * (0.35 + 0.65 * sk); const nz = (f, o) => (Math.sin(st * f + o) + Math.sin(st * f * 1.71 + o * 2.3) * 0.6 + Math.sin(st * f * 2.93 + o * 0.7) * 0.3) / 1.9;
    const yaw = this.camYaw + nz(31, 0.3) * s2 * 0.02, pitch = this.camPitch + nz(37, 1.9) * s2 * 0.018; this._roll = nz(27, 4.1) * s2 * 0.022;
    const cp = Math.cos(pitch), fx = Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = Math.cos(yaw) * cp; const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let fov = S.fov, scope = 0; const m = this.mode; const z = this.zoomOf(this.weapon());
    if (m === 'plane') {
      const pl = G.match.plane; _c.set(pl.pos.x - fx * 46 + nz(0.9, 1.0) * 1.6, pl.mesh.position.y - fy * 46 + 6 + nz(1.3, 4.0) * 1.1, pl.pos.z - fz * 46 + nz(1.1, 2.5) * 1.6); cam.position.copy(_c); this._roll += nz(0.6, 3.3) * 0.02; fov += 4 + nz(7, 0.4) * 1.2;
    } else if (m === 'seat' && this.vehicle) {
      const v = this.vehicle; if (this.idleLook > 2.5 && Math.abs(v.speed) > 3) { this.camYaw = dampAngle(this.camYaw, v.yaw + (v.speed < -1 ? Math.PI : 0), 1.6, dt); this.camPitch = damp(this.camPitch, -0.16, 1.6, dt); }
      const d = this._camCollide(v.pos.x, v.pos.y + 1.9, v.pos.z, -fx, -fy, -fz, v.def.cam); cam.position.set(v.pos.x - fx * d, v.pos.y + 1.9 - fy * d, v.pos.z - fz * d); fov += Math.min(10, Math.abs(v.speed) * 0.35);
    } else {
      const air = m === 'fall' || m === 'chute';
      const eyeH = !this.alive ? 0.6 : air ? 1.3 : this.stance === 2 ? 0.5 : this.stance === 1 ? 1.12 : 1.58; this.pivotY = damp(this.pivotY, eyeH, 11, dt);
      const px = p.x, py = p.y + this.pivotY, pz = p.z;
      const first = (this.fpp || this.scoped) && this.alive && !air;
      if (this.soldier) this.soldier.fp = first;
      if (first) {
        const fwd = this.stance === 2 ? 0.75 : 0.12; cam.position.set(px + Math.sin(this.yaw) * fwd + fx * 0.06, py + 0.06, pz + Math.cos(this.yaw) * fwd + fz * 0.06);
        if (this.scoped) { fov = S.fov / (z * 0.82); scope = 1; } else fov = S.fov * (1 - this.aimK * (z >= 2 ? 0.45 : 0.22)) + 6;
      } else {
        const a = this.aimK; const pis = this.def() && this.def().hold === 'pistol'; const want = !this.alive ? 4.2 : air ? 7 : lerp(this.camDist, pis ? 1.2 : 1.3, a); const side = lerp(0.5, 0.64, a) * this.shoulder * (air || !this.alive ? 0 : 1), up = lerp(0.16, 0.24, a);
        const ox = px + rx * side, oy = py + up, oz = pz + rz * side;
        // keep the shoulder offset from clipping into walls
        let sx = ox, sz = oz; if (side !== 0) { const h = G.colliders.raycast(px, py + up, pz, rx * Math.sign(side), 0.001, rz * Math.sign(side), Math.abs(side) + 0.25, 1); if (h) { const k = Math.max(0, h.dist - 0.25) * Math.sign(side); sx = px + rx * k; sz = pz + rz * k; } }
        const d = this._camCollide(sx, oy, sz, -fx, -fy, -fz, want); this.camDistNow = d < this.camDistNow ? d : damp(this.camDistNow, d, 8, dt);
        cam.position.set(sx - fx * this.camDistNow, oy - fy * this.camDistNow, sz - fz * this.camDistNow);
        this.fovK = damp(this.fovK || 0, 0, 14, dt); fov = S.fov * (1 - a * (z >= 2 ? 0.42 : 0.33)) + (this.sprinting ? 4 : 0) + this.fovK * 2.4 + (m === 'fall' ? 9 + (this.fallK || 0) * 16 + nz(9, 2.2) * 2.5 : 0);
        if (m === 'fall') { const bk = 0.12 + (this.fallK || 0) * 0.2; cam.position.x += nz(23, 5.0) * bk; cam.position.y += nz(29, 7.7) * bk; cam.position.z += nz(19, 3.1) * bk; const sdI = (G.input.is('right') ? 1 : 0) - (G.input.is('left') ? 1 : 0); this._bank = damp(this._bank || 0, sdI * 0.16, 3, dt); this._roll += this._bank; } else this._bank = 0;
        if (!G.ui.blocking() && G.input.wheel && this.aiming) this.camDist = clamp(this.camDist + G.input.wheel * 0.4, 1.2, 8);
      }
    }
    { const fl = m === 'fall' && this.alive; if (fl !== this._fl) { this._fl = fl; document.body.classList.toggle('falling', fl); } if (fl) document.body.style.setProperty('--fall', (0.25 + (this.fallK || 0) * 0.75).toFixed(2)); }
    const th = G.world.heightAt(cam.position.x, cam.position.z) + 0.22; if (cam.position.y < th) cam.position.y = th;
    cam.rotation.order = 'YXZ'; cam.rotation.set(pitch, yaw + Math.PI, this._roll || 0);
    fov = clamp(fov, 4, 110); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = damp(cam.fov, fov, this.scoped || scope ? 30 : 12, dt); cam.updateProjectionMatrix(); }
    G.gfx.fx.uScope.value = scope ? cam.aspect : 0;
    this.hideBody = (scope && this.scoped) || m === 'plane' || (!this.fpp && this.alive && (m === 'ground') && this.camDistNow < 0.6 && this.aimK < 0.5);
  }
  _camCollide(ox, oy, oz, dx, dy, dz, want) { const h = this.G.colliders.raycast(ox, oy, oz, dx, dy, dz, want + 0.3, 1); return h ? Math.max(0.25, h.dist - 0.28) : want; }
}
