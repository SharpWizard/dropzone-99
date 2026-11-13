import { ITEMS } from '../inventory/Items.js';
import { PEOPLE_KEYS } from '../characters/SoldierGLB.js';
// Battle royale match flow: deployment plane, bot drops, shrinking safe zone, eliminations, victory.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, clamp, lerp } from '../utils/math.js';

export const TOTAL = 99;
export const PET_KILLS = 3; // kills needed to earn a companion
// wait (s), shrink (s), radius factor of previous, damage per second
const PHASES = [[95, 75, 0.5, 0.6], [80, 55, 0.52, 1], [65, 45, 0.52, 2], [50, 40, 0.5, 4], [40, 32, 0.45, 7], [30, 26, 0.4, 10], [20, 22, 0.001, 14]];

export class Zone {
  constructor(G) {
    this.G = G; this.cx = 0; this.cz = 0; this.r = 1350; this.nx = 0; this.nz = 0; this.nr = 1350; this.phase = -1; this.timer = 0; this.shrinking = false; this.dps = 0; this.active = false;
    const g = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: G.gfx.uTime, uR: { value: 1 } },
      vertexShader: 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; varying vec2 vUv; uniform float uTime, uR;
        void main(){ float d = distance(vW, cameraPosition); float arc = vUv.x * uR * 6.2832;
          float seam = smoothstep(0.992, 1.0, abs(sin(arc * 0.39))) * 0.5;
          float scan = smoothstep(0.93, 1.0, sin(vW.y * 0.5 - uTime * 1.4) * 0.5 + 0.5) * 0.3;
          float flow = 0.5 + 0.5 * sin(arc * 0.07 + vW.y * 0.045 + uTime * 0.7);
          float near = smoothstep(320.0, 15.0, d); float low = smoothstep(240.0, 0.0, vW.y);
          float a = (0.09 + 0.15 * near + (seam + scan) * near * 0.55 + flow * 0.05) * (0.3 + 0.7 * low) * smoothstep(0.0, 5.0, d);
          gl_FragColor = vec4(vec3(0.1, 0.4, 1.35) + (seam + scan) * vec3(0.5, 0.9, 1.6), clamp(a, 0.0, 0.62)); }` });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false; G.gfx.scene.add(this.mesh);
  }
  reset(R) { this.R = R; this.cx = 0; this.cz = 0; this.r = 1350; this.phase = -1; this.active = false; this.shrinking = false; this.dps = 0; this.mesh.visible = false; this._pickNext(); this.timer = PHASES[0][0]; }
  begin() { this.active = true; this.phase = 0; this.timer = PHASES[0][0]; this.mesh.visible = true; }
  _pickNext() {
    const p = PHASES[Math.max(0, this.phase < 0 ? 0 : this.phase)]; const first = this.phase <= 0; this.sx = this.cx; this.sz = this.cz; this.sr = this.r;
    const nr = first ? 620 : Math.max(0.5, this.r * p[2]); let x = this.cx, z = this.cz;
    for (let k = 0; k < 40; k++) { const a = this.R.f() * 6.283, d = Math.sqrt(this.R.f()) * (first ? 420 : (this.r - nr)); const tx = (first ? 0 : this.cx) + Math.cos(a) * d, tz = (first ? 0 : this.cz) + Math.sin(a) * d; if (this.G.world.heightAt(tx, tz) > 2.5 && this.G.nav.isLandFree(tx, tz)) { x = tx; z = tz; break; } }
    this.nx = x; this.nz = z; this.nr = nr;
  }
  update(dt) {
    if (!this.active) return; this.timer -= dt; const p = PHASES[Math.min(this.phase, PHASES.length - 1)]; this.dps = p[3];
    if (!this.shrinking) { if (this.timer <= 0) { if (this.phase >= PHASES.length) return; this.shrinking = true; this.timer = p[1]; this.G.ui.banner('SAFE ZONE SHRINKING', 'Get inside the white circle'); this.G.audio.ui('warn'); } else if (this.timer < 20 && this.timer + dt >= 20) { this.G.ui.banner('ZONE SHRINKS IN 20s', ''); this.G.audio.ui('warn'); } }
    else { const t = clamp(1 - this.timer / p[1], 0, 1); this.cx = lerp(this.sx, this.nx, t); this.cz = lerp(this.sz, this.nz, t); this.r = lerp(this.sr, this.nr, t);
      if (this.timer <= 0) { this.shrinking = false; this.cx = this.nx; this.cz = this.nz; this.r = this.nr; this.phase++; if (this.phase < PHASES.length) { this.timer = PHASES[this.phase][0]; this._pickNext(); } else { this.timer = 9999; } } }
    this.mesh.position.set(this.cx, 120, this.cz); this.mesh.scale.set(this.r, 520, this.r); this.mat.uniforms.uR.value = this.r;
  }
  outside(x, z) { return Math.hypot(x - this.cx, z - this.cz) > this.r; }
}

function planeMesh(G, key = 'aircraft/venom_scout') {
  if (G.assets && G.assets.has(key)) { const f = G.assets.fitted(key, { length: 36, flip: true }); if (f) { const grp = new THREE.Group(); grp.add(f); grp.userData.props = []; return grp; } }
  return proceduralPlane(G);
}
function proceduralPlane(G) {
  const M = G.gfx.std({ color: 0x6f7a6c, roughness: 0.55, metalness: 0.35 }), D = G.gfx.std({ color: 0x23262a, roughness: 0.5, metalness: 0.4 }); const g = new THREE.Group(); const parts = [];
  const add = (geo, m = parts) => m.push(geo);
  const fus = new THREE.CylinderGeometry(3.1, 3.1, 26, 18); fus.rotateX(Math.PI / 2); add(fus);
  const nose = new THREE.SphereGeometry(3.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); nose.rotateX(Math.PI / 2); nose.scale(1, 1, 1.8); nose.translate(0, 0, 13); add(nose);
  const tail = new THREE.CylinderGeometry(3.1, 0.8, 13, 18); tail.rotateX(-Math.PI / 2); tail.translate(0, 1.2, -19.3); add(tail);
  const wing = new THREE.BoxGeometry(44, 0.6, 6); wing.translate(0, 2.9, 2); add(wing);
  const fin = new THREE.BoxGeometry(0.5, 9, 6); fin.translate(0, 6.5, -22); add(fin); const stab = new THREE.BoxGeometry(17, 0.4, 4); stab.translate(0, 10.6, -22.5); add(stab);
  const belly = new THREE.BoxGeometry(7.4, 2.4, 9); belly.translate(0, -2.2, 0); add(belly);
  for (const x of [-15, -8, 8, 15]) { const e = new THREE.CylinderGeometry(1.0, 0.8, 5, 12); e.rotateX(Math.PI / 2); e.translate(x, 2.0, 4.5); add(e); }
  const body = new THREE.Mesh(mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)), M); body.castShadow = true; g.add(body);
  const win = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.1, 2.4), D); win.position.set(0, 1.9, 15.2); g.add(win);
  g.userData.props = [];
  for (const x of [-15, -8, 8, 15]) { const p = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 0.12), D); p.position.set(x, 2.0, 7.1); g.add(p); const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.6, 0.12), D); p.add(p2); g.userData.props.push(p); }
  return g;
}

const DROPS = [['iron', 16], ['base', 10], ['port', 9], ['river', 8], ['green', 7], ['steel', 8], ['dust', 7], ['last', 6], ['forest', 6], ['peak', 2], ['', 21]];

export class Match {
  constructor(G) { this.G = G; this.state = 'idle'; this.plane = { pos: new THREE.Vector3(), yaw: 0, mesh: planeMesh(G), s: 0 }; this.plane.mesh.visible = false; G.gfx.scene.add(this.plane.mesh);
    // objective beacon: a cyan light beam over the current mission objective
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 400, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.8, 2.6), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); this.beacon.visible = false; this.beacon.renderOrder = 5; G.gfx.scene.add(this.beacon); this.obj = []; this.objT = 0;
    this.time = 0; this.alive = TOTAL; this.canJump = false; this.forceJump = false; this.endT = -1; this.result = null; }

  start() {
    const G = this.G, R = this.R = new RNG((Date.now() % 1e9) | 0); this.state = 'plane'; this.mode = G.settings.d.mode; this.win = false; this.time = 0; this.endT = -1; this.result = null; this.canJump = false; this.forceJump = false; this.landed = false;
    G.combat.reset(); G.fx.clear(); G.loot.clear(); G.loot.spawnAll(R.int(1, 1e9)); if (G.animals) G.animals.spawn(); G.vehicles.reset(R);
    G.player.reset(); G.player.outfit = G.settings.d.outfit; G.player.name = G.settings.d.name || 'YOU'; if (G.player.soldier) G.player.soldier.setOutfit(G.player.outfit); G.ai.reset();
    G.zone.reset(R);
    // story mission 1: six survivors hide in the Civilian Survival Zone (the 'river' location)
    if (G.mission && G.mission.targets) for (const t of G.mission.targets) G.gfx.scene.remove(t.mesh);
    if (G.mission && G.mission.points) for (const t of G.mission.points) G.gfx.scene.remove(t.mesh);
    { const L = G.world.locations.find(l => l.id === 'river'); G.mission = { need: 6, got: 0, won: false, stage: 1 }; this.seen = new Set(); const IRON = G.world.locations.find(l => l.id === 'iron');
      G.ai.bots.slice(0, 18).forEach((b, i) => { const L0 = L; { /* six hide by the river, the rest are caught in the streets of Iron City */ } b.civ = true; b.modelKey = PEOPLE_KEYS[(i * 5) % PEOPLE_KEYS.length]; if (b.soldier) { G.gfx.scene.remove(b.soldier.group); b.soldier = null; } b.weapons = [null, null, null]; b.cur = -1; b._wkey = ''; b.bag = {}; b.drop = null; b.mode = 'ground'; b.grounded = true; b.speedNow = 0; b.rescueT = 0; b.home = null; b.goal = null;
        const LL = i < 6 ? L0 : IRON; const a = i * 2.4 + R.f(), r = R.range(10, LL.r * 0.55), x = LL.x + Math.cos(a) * r, z = LL.z + Math.sin(a) * r; const f = G.nav.nearestFree(x, z, 20) || { x, z }; b.pos.set(f.x, G.world.heightAt(f.x, f.z), f.z); b.yaw = a; });
      G.ui.banner('MISSION 1 · INTO THE RUINS', 'Rescue 6 survivors: follow the cyan beacon and stand beside them');
    }
    this.alive = G.chars.reduce((n, c) => n + (c.civ ? 0 : 1), 0);
    // flight path across the island
    const a = R.f() * 6.283, ox = R.range(-220, 220), oz = R.range(-220, 220); this.dir = { x: Math.sin(a), z: Math.cos(a) }; this.org = { x: ox - this.dir.x * 1350, z: oz - this.dir.z * 1350 }; this.len = 2700;
    const P = this.plane; P.s = 0; P.yaw = a; P.mesh.visible = true; P.mesh.rotation.y = a; this._planePos();
    G.player.mode = 'plane'; G.player.camYaw = a + 2.6; G.player.camPitch = -0.22;
    // bot drop plans
    for (const b of G.ai.bots) {
      if (b.civ) continue; // civilians are already on the ground in the mission zone
      let tx = 0, tz = 0, s = 0, ok = false;
      for (let k = 0; k < 30 && !ok; k++) {
        let sum = 0; for (const d of DROPS) sum += d[1]; let r = R.f() * sum, id = ''; for (const d of DROPS) { r -= d[1]; if (r <= 0) { id = d[0]; break; } }
        if (id) { const L = G.world.locations.find(l => l.id === id); const spots = G.world.lootSpots; const sp = spots[R.int(0, spots.length - 1)]; if (Math.hypot(sp.x - L.x, sp.z - L.z) < L.r + 30) { tx = sp.x + R.range(-6, 6); tz = sp.z + R.range(-6, 6); } else { tx = L.x + R.range(-L.r, L.r) * 0.8; tz = L.z + R.range(-L.r, L.r) * 0.8; } }
        else { tx = R.range(-850, 850); tz = R.range(-850, 850); }
        const f = G.nav.nearestFree(tx, tz, 14); if (!f || !G.nav.isLandFree(f.x, f.z)) continue; tx = f.x; tz = f.z;
        s = (tx - this.org.x) * this.dir.x + (tz - this.org.z) * this.dir.z; const px = this.org.x + this.dir.x * s, pz = this.org.z + this.dir.z * s; const off = Math.hypot(tx - px, tz - pz);
        if (off < 780 && s > 250 && s < this.len - 250) ok = true;
      }
      if (!ok) { s = R.range(600, this.len - 600); tx = this.org.x + this.dir.x * s; tz = this.org.z + this.dir.z * s; const f = G.nav.nearestFree(tx, tz, 60); if (f) { tx = f.x; tz = f.z; } }
      b.jumpS = clamp(s - R.range(0, 260), 300, this.len - 300); b.drop = { tx, tz }; b.mode = 'plane';
    }
    if (G.activities) G.activities.reset(); if (G.career) G.career.applyLoadout(G.player);
    G.ui.onMatchStart();
  }

  // the current mission's objectives, [{ x, z, kind, main }]; 'main' is the one the waypoint, beacon and distance point to
  objectives() { return this.obj; }
  _objectives() {
    const G = this.G, M = G.mission, P = G.player, out = []; if (!M || M.won || this.state === 'idle' || this.state === 'over' || !P.alive) return out;
    const pick = (list) => { let b = null, bd = 1e18; for (const o of list) { const d = (o.x - P.pos.x) ** 2 + (o.z - P.pos.z) ** 2; if (d < bd) { bd = d; b = o; } } if (b) b.main = true; return list; };
    const air = (b) => b.mode === 'plane' || b.mode === 'chute' || b.mode === 'fall';
    if (M.stage === 1) { for (const b of G.ai.bots) if (b.civ && b.alive && !b.rescued) out.push({ x: b.pos.x, z: b.pos.z, kind: 'civ' }); return pick(out); }
    if (M.stage === 2) { const B = G.world.locations.find(l => l.id === 'base'); return [{ x: B.x, z: B.z, kind: 'goal', main: true }]; }
    if (M.stage === 3) { const foes = []; for (const b of G.ai.bots) if (!b.civ && b.alive && !air(b)) foes.push({ x: b.pos.x, z: b.pos.z, kind: 'foe' }); const l = pick(foes).filter(o => o.main); return l; }
    if (M.stage === 4 && M.targets) { for (const t of M.targets) if (!t.done) out.push({ x: t.x, z: t.z, kind: 'goal' }); return pick(out); }
    if (M.stage === 5 && M.boss && M.boss.alive) return [{ x: M.boss.pos.x, z: M.boss.pos.z, kind: 'foe', main: true }];
    if (M.stage === 6 && M.points) { const t = M.points.find(q => !q.done); return t ? [{ x: t.x, z: t.z, kind: 'goal', main: true }] : out; }
    return out;
  }
  _updateObjectives(dt) {
    const G = this.G; this.objT -= dt; if (this.objT <= 0) { this.objT = 0.25; this.obj = this._objectives(); }
    const m = this.obj.find(o => o.main), P = G.player; const d = m ? Math.hypot(m.x - P.pos.x, m.z - P.pos.z) : 0; this.objDist = m ? d : -1;
    this.beacon.visible = !!m && d > 14 && P.mode !== 'plane'; if (this.beacon.visible) { const gy = G.world.heightAt(m.x, m.z); this.beacon.position.set(m.x, gy + 200, m.z); this.beacon.material.opacity = 0.2 + Math.sin(this.time * 3) * 0.07; }
  }
  // markers for the minimap and the big map
  drawObjectives(ctx, w2m, lw) {
    for (const o of this.obj) { const x = w2m(o.x), z = w2m(o.z);
      if (o.kind === 'civ' && !o.main) { ctx.fillStyle = '#7dffb0'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.arc(x, z, lw * 2.6, 0, 6.283); ctx.fill(); ctx.stroke(); continue; }
      const r = lw * (o.main ? 6 : 4.5); ctx.fillStyle = o.kind === 'foe' ? '#ff5a4a' : '#5fe6ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 1.2;
      ctx.beginPath(); ctx.moveTo(x, z - r); ctx.lineTo(x + r, z); ctx.lineTo(x, z + r); ctx.lineTo(x - r, z); ctx.closePath(); if (o.main) ctx.fill(); ctx.stroke(); }
  }
  br() { return (this.mode || this.G.settings.d.mode) === 'BATTLE ROYALE'; }
  _missionUI() {
    const G = this.G, M = G.mission; let el = document.getElementById('mission');
    if (!el) { el = document.createElement('div'); el.id = 'mission'; el.style.cssText = 'position:fixed;left:20px;top:92px;font:600 12px/1.3 system-ui,sans-serif;letter-spacing:.12em;color:#9ff4ff;text-shadow:0 0 8px rgba(95,230,255,.5);pointer-events:none;z-index:4'; document.body.appendChild(el); }
    el.textContent = M.won ? 'MISSION COMPLETE' : M.stage === 6 && M.points ? (function () { const t = M.points.find(q => !q.done); return t ? 'MISSION 6 · THE FINAL ASSAULT — ' + t.name + ' ' + Math.min(t.need, t.hold).toFixed(1) + ' / ' + t.need : 'MISSION COMPLETE'; })() : M.stage === 5 && M.boss ? 'MISSION 5 · THE TITAN WALKER — HULL ' + Math.max(0, Math.round((M.boss.hp / M.boss.maxHp) * 100)) + '%' : M.stage === 4 ? 'MISSION 4 · BURN THE ALIEN HIVES — REACTORS ' + (M.done || 0) + ' / 3' : M.stage === 3 ? 'MISSION 3 · THE RESISTANCE AWAKENS — PATROLS ' + Math.max(0, (G.player.kills || 0) - M.killBase) + ' / 3' : M.stage === 2 ? 'MISSION 2 · THE RESISTANCE BUNKER' + (M.hold ? ' — HOLD ' + Math.max(0, 3 - M.hold).toFixed(1) : '') : 'MISSION 1 · INTO THE RUINS — SURVIVORS ' + M.got + ' / ' + M.need;
    if (!M.won && this.objDist >= 0) el.textContent += '  ·  ' + Math.round(this.objDist) + ' M';
    el.style.display = G.state === 'play' || G.state === 'paused' ? 'block' : 'none';
  }
  _celebrate() { const G = this.G, p = G.player.pos; G.fx.burst(p.x, p.y + 7, p.z); G.player.shakeCam(0.5); G.ui.shakeHud(1); }
  _planePos() { const P = this.plane; P.pos.set(this.org.x + this.dir.x * P.s, 440, this.org.z + this.dir.z * P.s); P.mesh.position.copy(P.pos); }
  onPlayerJump() { this.G.ui.toast('FREEFALL - LOOK DOWN TO DIVE'); }
  onPlayerLand() { this.landed = true; this.G.player._scanNext = true; }

  update(dt) {
    const G = this.G; if (this.state === 'idle') return; this.time += dt;
    const P = this.plane;
    if (P.mesh.visible) {
      P.s += 66 * dt; this._planePos(); for (const p of P.mesh.userData.props) p.rotation.z += dt * 38;
      { // the aircraft feels alive: it rides the air (bob, roll, pitch), leaves contrails and engine glow, and flies through cloud
        const t = this.time, m = P.mesh, d = this.dir, rx = d.z, rz = -d.x; m.position.y += Math.sin(t * 0.9) * 1.3 + Math.sin(t * 2.3) * 0.4; m.rotation.z = Math.sin(t * 0.7) * 0.06 + Math.sin(t * 1.9) * 0.018; m.rotation.x = Math.sin(t * 0.5 + 1) * 0.025;
        this._trailT = (this._trailT || 0) - dt; const aboard = G.player.mode === 'plane'; if (this._trailT <= 0 && m.position.distanceTo(G.gfx.camera.position) < (aboard ? 900 : 450)) { this._trailT = aboard ? 0.05 : 0.12; const S = G.fx.smoke, K = G.fx.sparks, y = m.position.y;
          for (const w of [-14, 14]) S.spawn(P.pos.x - d.x * 6 + rx * w, y + 1.5, P.pos.z - d.z * 6 + rz * w, 0, 0.3, 0, 1, 1, 1, 0.2, 0.9, 3.6, 0.9, 0, 0);
          for (const w of [-3.5, 3.5]) { K.spawn(P.pos.x - d.x * 18 + rx * w, y + 1, P.pos.z - d.z * 18 + rz * w, -d.x * 14, 0, -d.z * 14, 1.6, 2.8, 5, 1, 1.6, 0.16, 3, 0, 0); S.spawn(P.pos.x - d.x * 20 + rx * w, y + 1, P.pos.z - d.z * 20 + rz * w, -d.x * 6, 0.4, -d.z * 6, 0.8, 0.82, 0.86, 0.16, 1.4, 2.4, 1.6, 0, 0.4); }
          if (G.player.mode === 'plane') for (let i = 0; i < 2; i++) { const f = 110 + Math.random() * 110, l = (Math.random() - 0.5) * 150; S.spawn(P.pos.x + d.x * f + rx * l, y + (Math.random() - 0.5) * 60, P.pos.z + d.z * f + rz * l, 0, 0, 0, 1, 1, 1, 0.1 + Math.random() * 0.12, 10 + Math.random() * 22, 4, 3, 0, 0); } } }
      const dc = Math.hypot(P.pos.x, P.pos.z); this.canJump = dc < 960 && P.s > 200 && P.s < this.len - 150; this.forceJump = G.player.mode === 'plane' && (P.s > this.len / 2 && dc > 800 || P.s > this.len - 160); // leaving the island: jump while still over the coast
      for (const b of G.ai.bots) if (b.mode === 'plane' && P.s >= b.jumpS) { const D = b.drop; D.sx = P.pos.x; D.sy = P.pos.y - 6; D.sz = P.pos.z; D.ty = Math.max(G.world.heightAt(D.tx, D.tz), -1); D.t = 0; D.dur = 24 + Math.hypot(D.tx - D.sx, D.tz - D.sz) / 24 + b.R.range(0, 8); b.pos.set(D.sx, D.sy, D.sz); b.mode = 'chute'; }
      if (P.s > this.len + 500) { P.mesh.visible = false; }
      if (this.state === 'plane' && P.s > this.len - 100 && G.player.mode !== 'plane') { this.state = 'play'; }
      if (this.state === 'plane' && G.player.mode !== 'plane' && !G.zone.active && this.br() && P.s > this.len * 0.75) { G.zone.begin(); this.state = 'play'; G.ui.banner('SAFE ZONE MARKED', 'First circle is on your map'); }
    }
    if (!G.zone.active && this.br() && this.time > 55 && G.player.mode !== 'plane') { G.zone.begin(); this.state = 'play'; G.ui.banner('SAFE ZONE MARKED', 'First circle is on your map'); }
    G.zone.update(dt); this._updateObjectives(dt);
    // exploration: every named location you set foot in for the first time is logged and rewarded
    this._dT = (this._dT || 0) - dt; if (this._dT <= 0 && G.player.alive && G.player.mode === 'ground') { this._dT = 1; const L = G.world.locationAt(G.player.pos.x, G.player.pos.z); this.seen = this.seen || new Set();
      if (L && !this.seen.has(L.id)) { this.seen.add(L.id); G.player.points = (G.player.points || 0) + 50; G.fx.sparkle(G.player.pos.x, G.player.pos.y + 1, G.player.pos.z, 1, 0.8, 0.3, 22); if (G.career) G.career.discover(L.id); G.ui.banner('DISCOVERED · ' + L.name, '+50 POINTS  ·  ' + this.seen.size + ' / ' + G.world.locations.length + ' LOCATIONS'); G.audio.ui('click'); } }
    if (G.mission) { const M = G.mission, P = G.player;
      if (M.stage === 1) { this._civT = (this._civT || 0) - dt; if (this._civT <= 0) { this._civT = 1; const left = G.ai.bots.reduce((n, b) => n + (b.civ && b.alive && !b.rescued ? 1 : 0), 0); if (M.got + left < M.need) { M.need = Math.max(1, M.got + left); if (M.got < M.need) G.ui.toast('SURVIVORS LOST · RESCUE THE ' + (M.need - M.got) + ' STILL ALIVE'); } } }
      if (M.stage === 1 && M.got >= M.need) { M.stage = 2; G.ui.banner('MISSION 2 · THE RESISTANCE BUNKER', 'Escort complete. Reach the bunker in the north-east and hold it'); G.audio.ui('win'); G.match._celebrate(); }
      if (M.stage === 2 && !M.won && P.alive && this.state !== 'over' && this.endT < 0) { const B = G.world.locations.find(l => l.id === 'base'); M.dist = Math.hypot(P.pos.x - B.x, P.pos.z - B.z); M.hold = M.dist < 30 ? (M.hold || 0) + dt : 0;
        if (M.hold > 3) { // bunker secured: the armoury opens and the resistance equips the player
          M.stage = 3; M.killBase = P.kills || 0; const IT = Object.keys(ITEMS), best = (type) => IT.filter(k => ITEMS[k].type === type).sort((a, b) => (ITEMS[b].lvl || 0) - (ITEMS[a].lvl || 0))[0];
          P.give({ id: 'ravager' }); for (const t of ['helmet', 'vest']) { const k = best(t); if (k) P.give({ id: k }); } for (const k of IT.filter(k => ITEMS[k].type === 'heal').slice(0, 2)) P.give({ id: k });
          G.ui.banner('MISSION 3 · THE RESISTANCE AWAKENS', 'Armoury unlocked: RAVAGER-762, armour and medical supplies. Clear 3 Swarm patrols'); G.audio.ui('win'); G.match._celebrate(); } }
      if (M.stage === 3 && P.alive && (P.kills || 0) - M.killBase >= 3) { // patrols cleared: move on to the factories
        M.stage = 4; M.done = 0; const L = G.world.locations.find(l => l.id === 'steel'), R = this.R || Math.random; M.targets = [];
        for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283 + 0.6, r = L.r * 0.45, x0 = L.x + Math.cos(a) * r, z0 = L.z + Math.sin(a) * r; const f = G.nav.nearestFree(x0, z0, 20) || { x: x0, z: z0 }; const y = G.world.heightAt(f.x, f.z);
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 3.2, 14), new THREE.MeshBasicMaterial({ color: 0xff3a3a, toneMapped: false })); mesh.position.set(f.x, y + 1.6, f.z); G.gfx.scene.add(mesh);
          M.targets.push({ x: f.x, z: f.z, mesh, hold: 0, done: false }); }
        G.ui.banner('MISSION 4 · BURN THE ALIEN HIVES', 'Destroy the three hive cores in the Industrial Warzone: stand beside each one'); G.audio.ui('win'); G.match._celebrate(); }
      if (M.stage === 4 && P.alive && this.state !== 'over' && this.endT < 0 && !M.won) { let progressed = false;
        for (const t of M.targets) { if (t.done) continue; const d = Math.hypot(P.pos.x - t.x, P.pos.z - t.z); t.hold = d < 5 ? t.hold + dt : 0;
          if (t.hold > 3) { t.done = true; t.mesh.material.color.set(0x35ff7a); M.done++; progressed = true; G.ui.toast('HIVE CORE DESTROYED · ' + M.done + ' / 3'); } }
        if (M.done >= 3) { // factories offline: the Titan walker drops into the Dead Sector
          M.stage = 5; const L = G.world.locations.find(l => l.id === 'dust'); const boss = G.ai.bots.find(b => !b.civ && b.alive) || G.ai.bots[0];
          const f = G.nav.nearestFree(L.x, L.z, 40) || { x: L.x, z: L.z }; boss.pos.set(f.x, G.world.heightAt(f.x, f.z), f.z); boss.mode = 'ground'; boss.grounded = true; boss.drop = null; boss.goal = null; boss.target = null; boss.civ = false;
          boss.hp = 500; boss.maxHp = 500; boss.boss = true; boss.weapons = [{ id: 'ravager', ammo: 30, scope: 0, supp: false, mode: 0 }, null, null]; boss.cur = 0; boss._wkey = ''; boss.bag['ammo_762'] = 240; M.boss = boss;
          G.ui.banner('MISSION 5 · THE TITAN WALKER', 'A war machine is walking the Dead Sector. Destroy it'); G.audio.ui('win'); G.match._celebrate(); } }
      if (M.stage === 5 && M.boss) { const bo = M.boss; if (bo.soldier) bo.soldier.group.scale.setScalar(3.2);
        if (!bo.alive && M.stage === 5) { // the Titan is down: the assault on the Citadel begins
          M.stage = 6; const C = G.world.locations.find(l => l.id === 'peak'); M.points = [];
          const spots = [{ name: 'BREACH THE GATE', need: 4, a: 0 }, { name: 'SHUT DOWN THE CORE TERMINAL', need: 6, a: Math.PI }];
          for (const sp of spots) { const x0 = C.x + Math.cos(sp.a) * 28, z0 = C.z + Math.sin(sp.a) * 28; const f = G.nav.nearestFree(x0, z0, 12) || { x: x0, z: z0 }; const y = G.world.heightAt(f.x, f.z);
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 14), new THREE.MeshBasicMaterial({ color: 0xb04dff, toneMapped: false })); mesh.position.set(f.x, y + 1.2, f.z); G.gfx.scene.add(mesh);
            M.points.push({ name: sp.name, need: sp.need, x: f.x, z: f.z, hold: 0, done: false, mesh }); }
          M.pi = 0; G.ui.banner('MISSION 6 · THE FINAL ASSAULT', 'Breach the Citadel gate, then shut down the core terminal at its rear'); G.audio.ui('win'); G.match._celebrate(); } }
      if (M.stage === 6 && M.points && P.alive && this.state !== 'over' && this.endT < 0 && !M.won) {
        for (const t of M.points) { if (t.done) continue; const d = Math.hypot(P.pos.x - t.x, P.pos.z - t.z); t.hold = d < 6 ? t.hold + dt : 0;
          if (t.hold > t.need) { t.done = true; t.mesh.material.color.set(0x35ff7a); G.ui.toast(t.name + ' · DONE'); } }
        if (M.points.every(t => t.done)) { M.won = true; this.win = true; this.endT = 3; G.ui.banner('MISSION COMPLETE', 'The Swarm is broken. The city is free'); G.audio.ui('win'); G.match._celebrate(); } }
      this._missionUI(); }
    // zone damage (1 Hz, staggered per character)
    if (G.zone.active) for (const c of G.chars) { if (!c.alive || c.mode === 'plane' || c.mode === 'chute' || c.mode === 'fall') continue; c.zoneT -= dt; if (c.zoneT <= 0) { c.zoneT = 1; if (G.zone.outside(c.pos.x, c.pos.z)) c.damage(G.zone.dps, null, 'zone', 'zone'); } }
    if (this.endT >= 0) { this.endT -= dt; if (this.endT < 0 && !this.result) this._finish(); }
  }

  onKill(attacker, victim, wid, head) {
    const G = this.G; this.alive = G.chars.reduce((n, c) => n + (c.alive && !c.civ ? 1 : 0), 0); victim.rank = this.alive + 1;
    if (attacker && attacker !== victim && !victim.civ) attacker.kills++;
    if (attacker && attacker.isPlayer && attacker !== victim && !victim.civ) attacker.points = (attacker.points || 0) + (head ? 150 : 100);
    G.fx.kill(victim.pos.x, victim.pos.y, victim.pos.z); if (attacker && attacker.isPlayer && attacker !== victim && G.activities) G.activities.onKill(victim, head); if (attacker && attacker.isPlayer && attacker !== victim) { G.player.shakeCam(head ? 0.5 : 0.32); G.ui.shakeHud(1); if (!victim.civ) G.ui.pointsPop(head ? 150 : 100, head ? 'HEADSHOT' : 'KILL'); }
    if (victim.civ) { if (attacker && attacker.isPlayer) { attacker.points = (attacker.points || 0) - 200; G.ui.toast('CIVILIAN KILLED · -200 POINTS'); } else if (victim.pos.distanceTo(G.player.pos) < 120) G.ui.toast('A CIVILIAN WAS KILLED NEARBY'); }
    if (attacker && attacker.isPlayer && attacker.kills >= PET_KILLS && G.pet && !G.pet.unlocked) G.pet.unlock(attacker);
    G.ui.feed(attacker && attacker !== victim ? attacker : null, victim, wid, head);
    if (attacker && attacker.isPlayer && attacker !== victim && !victim.civ) { G.audio.kill(); G.ui.killBanner(victim.name, attacker.kills, head); }
    if (victim.isPlayer && !(this.win && this.endT >= 0)) { this.win = false; this.endT = 2.6; G.audio.ui('lose'); }
    else if (this.alive === 1 && G.player.alive) { this.win = true; G.player.rank = 1; this.endT = 1.6; }
    if (this.alive <= 10 && this.alive > 1 && !victim.isPlayer && this.alive !== this._lastAnn) { this._lastAnn = this.alive; if (this.alive === 10 || this.alive === 5 || this.alive === 2) G.ui.banner(this.alive + ' SURVIVORS LEFT', this.alive === 2 ? 'Final duel' : 'The circle is closing'); }
  }
  _finish() {
    const G = this.G, p = G.player; this.state = 'over';
    this._bankResult = true;
    this.result = { win: !!this.win, rank: this.win ? 1 : p.rank || this.alive + 1, kills: p.kills, points: p.points || 0, damage: Math.round(p.dmgDealt), time: this.time, accuracy: p.shots ? Math.round(p.hits / p.shots * 100) : 0, headshots: p.headshots };
    if (this.G.career) { const up = this.G.career.bank(this.result); this.result.rankUp = up ? up[1] + (up[2] ? ' · ' + up[2] : '') : null; this.result.career = this.G.career.summary(); }
    if (this.win) { G.audio.ui('win'); this._celebrate(); } G.ui.showEnd(this.result);
  }
  stop() { this.state = 'idle'; this.plane.mesh.visible = false; this.beacon.visible = false; this.obj = []; this.G.zone.active = false; this.G.zone.mesh.visible = false; }
}
