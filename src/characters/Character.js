// Shared combatant logic for the player and bots: stats, inventory, weapon handling, movement physics, damage, visuals.
import * as THREE from 'three';
import { Soldier } from './Soldier.js';
import { SoldierGLB } from './SoldierGLB.js';
import { WEAPONS, weaponMesh } from '../weapons/Weapons.js';
import { ITEMS, ARMOR_RED } from '../inventory/Items.js';
import { clamp, damp, dampAngle } from '../utils/math.js';
import { WATER_Y, HALF } from '../world/WorldData.js';
const _ts = new THREE.Vector3();

const _v = new THREE.Vector3(), _m = new THREE.Vector3();
export const SPEED = { walk: 2.4, run: 5.3, sprint: 6.9, crouch: 2.6, prone: 1.0, swim: 2.4 };

export class Character {
  constructor(G, id, name) {
    this.G = G; this.id = id; this.name = name; this.isPlayer = false; this.outfit = 0;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.soldier = null; this.sph = [[0, 0, 0, 0, 'head'], [0, 0, 0, 0, 'body'], [0, 0, 0, 0, 'body'], [0, 0, 0, 0, 'limb']];
    this.reset();
  }
  reset() {
    this.hp = 100; this.boost = 0; this.alive = true; this.mode = 'plane'; this.stance = 0; this.grounded = false; this.yaw = 0; this.pitch = 0; this.vel.set(0, 0, 0);
    this.helmet = { lvl: 0, dur: 0 }; this.vest = { lvl: 0, dur: 0 }; this.pack = 0;
    this.weapons = [null, null, null]; this.cur = -1; this.bag = {};
    this.kills = 0; this.dmgDealt = 0; this.shots = 0; this.hits = 0; this.headshots = 0;
    this.fireCd = 0; this.reloadT = -1; this.reloadDur = 1; this.burst = 0; this.bloom = 0; this.heal = null; this.fired = false; this.hurtFlag = false; this.aiming = false; this.sprinting = false;
    this.swim = false; this.meleeItem = null; this.deadT = 0; this.vehicle = null; this.stepAcc = 0; this.moveAng = 0; this.speedNow = 0; this.aimHold = 0; this.rank = 0; this._wkey = ''; this.zoneT = 0; this.airT = 0;
  }
  get height() { return this.stance === 2 ? 0.55 : this.stance === 1 ? 1.2 : 1.76; }
  weapon() { return this.cur >= 0 && this.cur < 3 ? this.weapons[this.cur] : null; }
  def() { const w = this.weapon(); return w ? WEAPONS[w.id] : null; }
  count(id) { return this.bag[id] || 0; }
  ammoFor(def) { return this.bag['ammo_' + def.ammo] || 0; }
  capacity() { return 150 + this.pack * 110 + (this.vest.lvl ? 30 : 0); }
  weight() { let w = 0; for (const k in this.bag) w += (ITEMS[k].w || 0) * this.bag[k]; return w; }
  zoomOf(w) { return w ? (w.scope || WEAPONS[w.id].baseScope || 0) : 0; }

  // ---- inventory ----
  // returns true when the item (or part of it) was taken. `it` = {id,n,w}
  give(it, quiet = false) {
    const d = ITEMS[it.id], L = this.G.loot, p = this.pos;
    if (d.type === 'weapon') {
      const def = WEAPONS[it.id]; let slot;
      if (def.slot === 'sidearm') slot = 2; else slot = !this.weapons[0] ? 0 : !this.weapons[1] ? 1 : (this.cur === 1 ? 1 : 0);
      if (this.weapons[slot]) this.dropWeapon(slot);
      this.weapons[slot] = it.w ? { id: it.id, ...it.w } : { id: it.id, ammo: def.mag, scope: 0, supp: false, mode: 0 };
      if (this.cur < 0 || this.cur === slot || (this.cur === 2 && slot < 2) || this.cur === 3) this.switchTo(slot, true);
      this._autoAttach(); return true;
    }
    if (d.type === 'helmet' || d.type === 'vest') { const cur = this[d.type]; if (cur.lvl > d.lvl || (cur.lvl === d.lvl && cur.dur >= (it.dur || d.dur))) return false; if (cur.lvl) L.drop(d.type + cur.lvl, 1, p.x, p.y, p.z).dur = cur.dur; cur.lvl = d.lvl; cur.dur = it.dur || d.dur; return true; }
    if (d.type === 'melee') { if (this.meleeItem === it.id) return false; if (this.meleeItem) L.drop(this.meleeItem, 1, p.x, p.y, p.z); this.meleeItem = it.id; if (this.onMelee) this.onMelee(); return true; }
    if (d.type === 'pack') { if (this.pack >= d.lvl) return false; if (this.pack) L.drop('pack' + this.pack, 1, p.x, p.y, p.z); this.pack = d.lvl; return true; }
    const free = this.capacity() - this.weight(); const can = d.w > 0 ? Math.floor(free / d.w) : it.n; const take = Math.min(it.n, can);
    if (take <= 0) return false;
    this.bag[it.id] = (this.bag[it.id] || 0) + take; it.n -= take;
    if (d.type === 'scope' || d.type === 'supp') this._autoAttach();
    return it.n <= 0 ? true : 'partial';
  }
  _autoAttach() {
    for (const w of this.weapons) { if (!w) continue; const def = WEAPONS[w.id];
      if (def.supp && !w.supp && this.bag.supp > 0) { w.supp = true; this._take('supp', 1); }
      if (def.scopes) for (const z of [8, 4, 2]) { if (z > (w.scope || def.baseScope || 0) && this.bag['scope' + z] > 0) { if (w.scope) this.bag['scope' + w.scope] = (this.bag['scope' + w.scope] || 0) + 1; w.scope = z; this._take('scope' + z, 1); break; } } }
    this._wkey = '';
  }
  _take(id, n) { this.bag[id] = (this.bag[id] || 0) - n; if (this.bag[id] <= 0) delete this.bag[id]; }
  detach(slot, what) { const w = this.weapons[slot]; if (!w) return; if (what === 'scope' && w.scope) { this.bag['scope' + w.scope] = (this.bag['scope' + w.scope] || 0) + 1; w.scope = 0; } if (what === 'supp' && w.supp) { this.bag.supp = (this.bag.supp || 0) + 1; w.supp = false; } this._wkey = ''; }
  attach(id) { const w = this.weapon(); if (!w || !this.bag[id]) return false; const def = WEAPONS[w.id], d = ITEMS[id];
    if (d.type === 'supp') { if (!def.supp || w.supp) return false; w.supp = true; this._take(id, 1); }
    else if (d.type === 'scope') { if (!def.scopes) return false; if (w.scope) this.bag['scope' + w.scope] = (this.bag['scope' + w.scope] || 0) + 1; w.scope = d.zoom; this._take(id, 1); }
    this._wkey = ''; return true; }
  dropWeapon(slot) { const w = this.weapons[slot]; if (!w) return; const p = this.pos; this.G.loot.drop(w.id, 1, p.x, p.y, p.z, { ammo: w.ammo, scope: w.scope, supp: w.supp, mode: w.mode }); this.weapons[slot] = null; if (this.cur === slot) { this.cur = -1; this.reloadT = -1; for (let i = 0; i < 3; i++) if (this.weapons[i]) { this.cur = i; break; } } this._wkey = ''; }
  dropItem(id, n) { n = Math.min(n, this.bag[id] || 0); if (n <= 0) return; this._take(id, n); const p = this.pos; this.G.loot.drop(id, n, p.x, p.y, p.z); }
  switchTo(slot, force = false) {
    if (slot === 3) { if (!this.bag.frag) return false; } else if (!this.weapons[slot]) return false;
    if (this.cur === slot && !force) return false;
    this.cur = slot; this.reloadT = -1; this.burst = 0; this.fireCd = Math.max(this.fireCd, 0.35); this.heal = null; this._wkey = ''; return true;
  }
  startReload() { const w = this.weapon(); if (!w || this.reloadT >= 0) return false; const d = WEAPONS[w.id]; if (w.ammo >= d.mag || this.ammoFor(d) <= 0) return false; this.reloadT = 0; this.reloadDur = d.reload; this.heal = null; this._rs = 0; return true; }
  useHeal(id) {
    if (!this.bag[id] || this.heal || this.mode !== 'ground') return false; const d = ITEMS[id];
    if (d.heal && this.hp >= d.cap) return false; if (d.boost && this.boost >= 100) return false;
    this.heal = { id, t: 0, dur: d.time }; this.reloadT = -1; return true;
  }

  // per-frame timers. Returns nothing; sets flags consumed by visuals.
  tick(dt) {
    if (this.fireCd > 0) this.fireCd -= dt; this.bloom = Math.max(0, this.bloom - dt * 5);
    if (this.reloadT >= 0) {
      this.reloadT += dt / this.reloadDur;
      if (this.isPlayer) { if (this._rs === 0 && this.reloadT > 0.2) { this._rs = 1; this.G.audio.reload(0); } else if (this._rs === 1 && this.reloadT > 0.62) { this._rs = 2; this.G.audio.reload(1); } else if (this._rs === 2 && this.reloadT > 0.88) { this._rs = 3; this.G.audio.reload(2); } }
      if (this.reloadT >= 1) { const w = this.weapon(); this.reloadT = -1; if (w) { const d = WEAPONS[w.id]; const need = d.mag - w.ammo, have = this.ammoFor(d), n = Math.min(need, have); w.ammo += n; this._take('ammo_' + d.ammo, n); } }
    }
    if (this.heal) { const h = this.heal; h.t += dt; if (this.speedNow > 3.2 || this.mode !== 'ground') this.heal = null; else if (h.t >= h.dur) { const d = ITEMS[h.id]; this._take(h.id, 1); if (d.heal) this.hp = Math.min(Math.max(this.hp, d.cap), this.hp + d.heal); if (d.boost) this.boost = Math.min(100, this.boost + d.boost); this.heal = null; this.G.fx.sparkle(this.pos.x, this.pos.y + 1.0, this.pos.z, 0.3, 1, 0.45, 14); if (this.isPlayer) this.G.audio.ui('pick'); } }
    if (this.boost > 0) { this.boost = Math.max(0, this.boost - dt * 0.9); if (this.hp < 100) this.hp = Math.min(100, this.hp + dt * (this.boost > 60 ? 1.6 : 0.9)); }
  }

  // ---- weapon fire. ox..: ray origin, d: unit dir. Returns true if a shot left the barrel.
  fire(ox, oy, oz, dx, dy, dz) {
    const w = this.weapon(); if (!w || this.reloadT >= 0 || this.fireCd > 0 || this.heal) return false; const d = WEAPONS[w.id];
    if (w.ammo <= 0) { if (this.isPlayer) this.G.audio.dry(); this.fireCd = 0.25; this.startReload(); return false; }
    w.ammo--; this.fireCd = 60 / d.rpm; this.fired = true; this.shots++;
    const ads = this.aiming ? 1 : 0; let spread = d.spread[0] + (d.spread[1] - d.spread[0]) * ads;
    spread *= (1 + Math.min(this.speedNow / 6, 1.2) * (ads ? 0.6 : 0.9)) * (this.stance === 1 ? 0.8 : this.stance === 2 ? 0.6 : 1) * (this.grounded ? 1 : 1.8); spread += this.bloom * (ads ? 0.35 : 0.9);
    this.bloom = Math.min(3.2, this.bloom + d.recoil[0] * 0.55);
    this.G.combat.shoot(this, d, w, ox, oy, oz, dx, dy, dz, spread);
    return true;
  }

  // ---- damage ----
  damage(amount, attacker, zone = 'body', wid = '', fx = 0, fz = 0) {
    if (!this.alive || this.mode === 'plane') return 0;
    if (zone === 'head') { amount *= 2.3; if (this.helmet.lvl && this.helmet.dur > 0) { const r = ARMOR_RED[this.helmet.lvl]; this.helmet.dur -= amount * r; amount *= 1 - r; if (this.helmet.dur <= 0) this.helmet.lvl = 0; } }
    else if (zone === 'body') { if (this.vest.lvl && this.vest.dur > 0) { const r = ARMOR_RED[this.vest.lvl]; this.vest.dur -= amount * r; amount *= 1 - r; if (this.vest.dur <= 0) this.vest.lvl = 0; } }
    else if (zone === 'limb') amount *= 0.85;
    if (this.isPlayer && attacker && !attacker.isPlayer) amount *= this.G.settings.diff().dmgToPlayer;
    amount = Math.min(amount, this.hp); this.hp -= amount; this.hurtFlag = true; this.heal = null;
    if (attacker && attacker !== this) { attacker.dmgDealt += amount; }
    this.onHurt(amount, attacker, zone, fx, fz);
    if (this.hp <= 0.01) this.die(attacker, wid, zone === 'head');
    return amount;
  }
  onHurt() { }
  die(attacker, wid, head) {
    if (!this.alive) return; this.alive = false; this.hp = 0; if (this.isPlayer) { this.shake = 1.5; this.G.ui.shakeHud(2); } this.mode = 'dead'; this.deadT = 0; this.heal = null; this.reloadT = -1;
    if (this.vehicle) this.G.vehicles.eject(this);
    if (this.soldier) this.soldier.deadDir = Math.random() < 0.5 ? 1 : -1;
    this.dropAll(); this.G.match.onKill(attacker, this, wid, head);
  }
  dropAll() {
    const L = this.G.loot, p = this.pos; if (p.y < -0.5 || this.G.world.heightAt(p.x, p.z) < -0.5) return; const y = p.y;
    for (let s = 0; s < 3; s++) { const w = this.weapons[s]; if (w) L.drop(w.id, 1, p.x, y, p.z, { ammo: w.ammo, scope: w.scope, supp: w.supp, mode: w.mode }); this.weapons[s] = null; }
    for (const k in this.bag) if (this.bag[k] > 0) L.drop(k, this.bag[k], p.x, y, p.z); this.bag = {};
    if (this.helmet.lvl) L.drop('helmet' + this.helmet.lvl, 1, p.x, y, p.z).dur = this.helmet.dur; if (this.vest.lvl) L.drop('vest' + this.vest.lvl, 1, p.x, y, p.z).dur = this.vest.dur; if (this.pack) L.drop('pack' + this.pack, 1, p.x, y, p.z);
    this.cur = -1;
  }

  // ---- ground movement with collisions. wx/wz: desired velocity. Returns landing speed (>0) on touchdown.
  stepGround(dt, wx, wz, jump) {
    const C = this.G.colliders, p = this.pos, v = this.vel; const terr = this.G.world.heightAt(p.x, p.z);
    const acc = this.grounded ? 11 : 2.2; v.x = damp(v.x, wx, acc, dt); v.z = damp(v.z, wz, acc, dt);
    // steep slopes resist climbing
    if (this.grounded && !this.swim) { const s = this.G.world.slopeAt(p.x, p.z); if (s > 0.85) { const e = 0.6, gx = this.G.world.heightAt(p.x + e, p.z) - this.G.world.heightAt(p.x - e, p.z), gz = this.G.world.heightAt(p.x, p.z + e) - this.G.world.heightAt(p.x, p.z - e); const up = (v.x * gx + v.z * gz); if (up > 0) { const k = clamp((s - 0.85) * 2.2, 0, 0.92); v.x *= 1 - k; v.z *= 1 - k; } } }
    p.x += v.x * dt; p.z += v.z * dt;
    p.x = clamp(p.x, -HALF + 6, HALF - 6); p.z = clamp(p.z, -HALF + 6, HALF - 6);
    C.resolve(p, p.y, 0.33, this.height);
    let ground = C.groundAt(p.x, p.z, p.y, this.grounded ? 0.56 : 0.3);
    const waterFloor = WATER_Y - 1.32; this.swim = terr < waterFloor && p.y <= waterFloor + 0.4 && ground <= waterFloor; if (ground < waterFloor) ground = waterFloor;
    let landed = 0;
    if (this.grounded) {
      if (jump && !this.swim) { v.y = 6.4; this.grounded = false; if (this.isPlayer) this.G.fx.dust(p.x, p.y, p.z, 2); }
      else if (ground < p.y - 0.62) { this.grounded = false; } // walked off a ledge
      else p.y = ground > p.y ? Math.min(ground, p.y + dt * 9) : Math.max(ground, p.y - dt * 9);
    }
    if (!this.grounded) {
      v.y -= 21 * dt; p.y += v.y * dt; this.airT += dt;
      if (v.y > 0) { const c = C.ceilingAt(p.x, p.z, p.y + 0.4); if (c < p.y + this.height) { v.y = 0; p.y = c - this.height; } }
      if (p.y <= ground) { landed = -v.y; p.y = ground; v.y = 0; this.grounded = true; this.airT = 0; }
    }
    this.speedNow = Math.hypot(v.x, v.z);
    return landed;
  }

  eye(out) { const h = this.stance === 2 ? 0.34 : this.stance === 1 ? 1.12 : 1.62; return out.set(this.pos.x, this.pos.y + h, this.pos.z); }
  // bullet hit volumes: [x,y,z,r,zone] x4
  _toolVisual(S, st) {
    const want = this.meleeItem && (st.weapon === 'none' || this.toolSwingT > 0) && this.mode === 'ground' && this.alive ? this.meleeItem : null; const hand = S.b && (S.b.wrR || S.b.laR);
    if (this._toolId !== want) { if (this._tool) { this._tool.parent && this._tool.parent.remove(this._tool); this._tool = null; } this._toolId = want;
      const key = want && ITEMS[want].model; if (key && hand && this.G.assets && this.G.assets.has(key)) { // the tool models stand upright (handle along +Y); the hand bone's +Y runs down the forearm, so the handle sits in the fist and the head hangs below
        const f = this.G.assets.fitted(key, { height: want === 'knife' ? 0.3 : want === 'shovel' ? 1.0 : 0.8 }); const g = new THREE.Group(); g.add(f); f.position.set(0, -0.05, 0); this._tool = g; hand.add(g); } }
    if (this._tool && hand) { hand.getWorldScale(_ts); this._tool.scale.set(1 / _ts.x, 1 / _ts.y, 1 / _ts.z); this._tool.position.set(0, 0.06 / _ts.y, 0); }
  }
  spheres() {
    const s = this.sph, p = this.pos, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    if (this.mode === 'seat') { const y = p.y; s[0][0] = p.x; s[0][1] = y + 1.02; s[0][2] = p.z; s[0][3] = 0.17; s[1][0] = p.x; s[1][1] = y + 0.7; s[1][2] = p.z; s[1][3] = 0.3; s[2][3] = 0; s[3][3] = 0; return s; }
    if (this.stance === 2 && this.mode === 'ground') { const y = p.y + 0.24; const set = (i, f, r) => { s[i][0] = p.x + fx * f; s[i][1] = y; s[i][2] = p.z + fz * f; s[i][3] = r; }; set(0, 0.72, 0.17); set(1, 0.36, 0.27); set(2, -0.05, 0.27); set(3, -0.55, 0.26); return s; }
    const c = this.stance === 1 && this.mode === 'ground'; const lean = c ? 0.12 : 0.03;
    s[0][0] = p.x + fx * lean; s[0][1] = p.y + (c ? 1.14 : 1.63); s[0][2] = p.z + fz * lean; s[0][3] = 0.165;
    s[1][0] = p.x; s[1][1] = p.y + (c ? 0.84 : 1.28); s[1][2] = p.z; s[1][3] = 0.29;
    s[2][0] = p.x; s[2][1] = p.y + (c ? 0.5 : 0.9); s[2][2] = p.z; s[2][3] = 0.28;
    s[3][0] = p.x; s[3][1] = p.y + (c ? 0.22 : 0.4); s[3][2] = p.z; s[3][3] = 0.27;
    return s;
  }
  muzzle(out) { if (this.soldier && this.soldier.weapon && this.soldier.group.visible) { this.soldier.group.updateMatrixWorld(true); return out.copy(this.soldier.weapon.userData.muzzle).applyMatrix4(this.soldier.weapon.matrixWorld); } this.eye(out); out.x += Math.sin(this.yaw) * 0.6; out.z += Math.cos(this.yaw) * 0.6; out.y -= 0.15; return out; }

  // ---- visuals ----
  ensureSoldier() { if (!this.soldier) { this.soldier = this.G.assets && SoldierGLB.available(this.G) ? new SoldierGLB(this.G, this.outfit, this.modelKey, this.heroId) : new Soldier(this.G, this.outfit); this.G.gfx.scene.add(this.soldier.group); } return this.soldier; }
  hideSoldier() { if (this.soldier) this.soldier.group.visible = false; }
  syncVisual(dt, visYaw) {
    const S = this.ensureSoldier(); S.group.visible = true;
    const key = this.cur + ':' + (this.cur >= 0 && this.cur < 3 && this.weapons[this.cur] ? this.weapons[this.cur].id + this.weapons[this.cur].scope + this.weapons[this.cur].supp : '');
    if (key !== this._wkey) { this._wkey = key; const w = this.weapon(); S.setWeapon(w ? weaponMesh(this.G, w.id, w.scope, w.supp) : null); }
    S.group.position.copy(this.pos); S.group.rotation.y = visYaw === undefined ? this.yaw : visYaw;
    const d = this.def(); let mode = this.mode === 'ground' ? (this.swim ? 'swim' : this.grounded ? 'ground' : 'air') : this.mode;
    const st = this._st || (this._st = {}); st.dt = dt; st.speed = mode === 'ground' || mode === 'swim' ? this.speedNow : 0; st.moveAng = this.moveAng; st.stance = this.stance; st.aiming = this.aiming || this.aimHold > 0; st.pitch = this.pitch; st.mode = mode;
    st.weapon = !d || this.heal || this.toolSwingT > 0 ? 'none' : d.hold; if (this.toolSwingT > 0) this.toolSwingT -= dt; // a tool swing lowers the gun for its duration st.reload = this.reloadT; st.sprint = this.sprinting; st.fired = this.fired; st.hurt = this.hurtFlag; st.handL = this.handL; st.handR = this.handR; st.bank = this.jetBank || 0; st.bash = this.bashFlag; st.vy = this.vel.y; st.hs = Math.hypot(this.vel.x, this.vel.z); this.bashFlag = false;
    S.setChute(mode === 'chute'); S.animate(st); if (this.isPlayer) this._toolVisual(S, st); this.fired = false; this.hurtFlag = false; if (this.aimHold > 0) this.aimHold -= dt;
  }
}
