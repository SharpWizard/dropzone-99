// Game: owns every subsystem, the boot sequence, the state machine and the main loop.
import * as THREE from 'three';
import { Environment } from '../world/Environment.js';
import { Gfx, detectPreset, probeWebGL } from '../rendering/Gfx.js';
import { buildTextures } from '../rendering/Textures.js';
import { buildMaterials } from '../rendering/GeoBatch.js';
import { FX } from '../rendering/FX.js';
import { WorldData } from '../world/WorldData.js';
import { Colliders } from '../physics/Colliders.js';
import { buildLocations } from '../world/Locations.js';
import { Terrain, Water } from '../terrain/Terrain.js';
import { Vegetation } from '../world/Vegetation.js';
import { Animals } from '../world/Animals.js';
import { Activities } from '../battleRoyale/Activities.js';
import { Career } from './Career.js';
import { ITEMS, itemMesh } from '../inventory/Items.js';
import { Nav } from '../ai/Nav.js';
import { AI } from '../ai/Bots.js';
import { Settings, Input } from './Settings.js';
import { AudioSys } from '../audio/Audio.js';
import { Loot } from '../inventory/Items.js';
import { Combat } from '../combat/Combat.js';
import { Player } from '../characters/Player.js';
import { Vehicles } from '../vehicles/Vehicles.js';
import { Match, Zone, TOTAL } from '../battleRoyale/Match.js';
import { UI, renderMap } from '../ui/UI.js';
import { damp } from '../utils/math.js';
import { Assets, Props, ASSET_KEYS } from '../assets/Assets.js';
import { Pet } from '../characters/Pet.js';

const nextFrame = () => new Promise(r => setTimeout(r, 0));
const SKIES = [[44, 135], [30, 105], [56, 190], [19, 248], [36, 220]];

export class Game {
  constructor(canvas) { this.canvas = canvas; this.state = 'boot'; this.time = 0; this.menuCam = 0; this.menuT = 0; this.sunT = 0; }

  progress(p, msg) { const f = document.getElementById('boot-fill'), m = document.getElementById('boot-msg'); if (f) f.style.width = Math.round(p * 100) + '%'; if (m && msg) m.textContent = msg; }

  async boot() {
    this.settings = new Settings();
    const probe = probeWebGL();
    if (!probe.ok) throw new Error(probe.reason + ' Try a current Chrome, Edge or Firefox with hardware acceleration on.');
    const preset = localStorage.getItem('dz.preset') || detectPreset(probe.renderer);
    this.gfx = new Gfx(this.canvas, preset);
    this.gfx.onLost = () => this.progress(0, 'Graphics device lost — restoring…');
    this.gfx.onAutoLower = (lower) => { this.pendingLower = lower; this.toast && this.toast('Quality lowered to ' + lower + ' for smoother play'); };
    this.input = new Input(this.canvas, this.settings); this.audio = new AudioSys(this); this.audio.vol = this.settings.d.volume;
    this.progress(0.04, 'Mixing paint, rust and dirt'); await nextFrame();
    this.T = await buildTextures(this.gfx.q.tex, this.gfx.maxAniso, (p, n) => this.progress(0.04 + p * 0.3, 'Synthesising ' + n));
    this.mats = buildMaterials(this.gfx, this.T);
    this.assets = new Assets(this); this.props = new Props(this);
    await this.assets.load(ASSET_KEYS, (p, n) => this.progress(0.3 + p * 0.06, 'Loading models ' + Math.round(p * 100) + '%'));
    this.progress(0.36, 'Raising Dropzone Island'); await nextFrame();
    this.world = new WorldData(); this.world.generate();
    this.colliders = new Colliders(this.world);
    this.progress(0.48, 'Building ten locations'); await nextFrame();
    buildLocations(this); this.props.build();
    this.progress(0.62, 'Sculpting terrain'); await nextFrame();
    this.terrain = new Terrain(this); this.terrain.build();
    this.water = new Water(this, this.terrain.heightTex);
    this.progress(0.72, 'Planting Shadow Forest'); await nextFrame();
    this.vegetation = new Vegetation(this); this.vegetation.build(this.terrain.heightTex, this.terrain.splatTex);
    this.progress(0.82, 'Charting navigation'); await nextFrame();
    this.nav = new Nav(this.world, this.colliders); this.nav.build();
    this.progress(0.9, 'Drawing the map'); await nextFrame();
    this.mapCanvas = renderMap(this.world, 1024);
    this.progress(0.95, 'Briefing 98 opponents'); await nextFrame();
    this.fx = new FX(this); this.env = new Environment(this); this.loot = new Loot(this); this.animals = new Animals(this); this.activities = new Activities(this); this.career = new Career(this); this.combat = new Combat(this); this.vehicles = new Vehicles(this); this.zone = new Zone(this);
    this.ai = new AI(this); this.player = new Player(this); this.chars = [this.player, ...this.ai.create(TOTAL - 1)];
    this.match = new Match(this); this.ui = new UI(this); this.pet = new Pet(this);
    this._events();
    this.toMenu(true);
    this.progress(1, 'Ready'); await nextFrame();
    this.clock = performance.now();
    // pre-compile shaders while the boot screen is still up
    this.progress(1, 'Warming up shaders'); await nextFrame(); await this.warmup(); await nextFrame();
    this.frame(0.016); await nextFrame();
    document.getElementById('boot').classList.add('done');
    const loop = (t) => { requestAnimationFrame(loop); const dt = Math.min(0.05, Math.max(0.001, (t - this.clock) / 1000)); this.clock = t; try { this.frame(dt); } catch (e) { if (!this._err) { this._err = true; console.error(e); } } };
    requestAnimationFrame(loop);
  }

  // Render one frame with every hidden object forced visible from above the island, so every shader program
  // (LODs, impostors, props, vehicles, effects, shadow passes) compiles and every buffer uploads now, not mid-flight.
  async warmup() {
    const scene = this.gfx.scene, cam = this.gfx.camera, hidden = [], shadowOff = [];
    scene.traverse(o => { if (!o.visible && o !== this.zone.mesh) { hidden.push(o); o.visible = true; } if (o.isMesh && !o.castShadow && (o.userData._cs || o.userData.cast)) { shadowOff.push(o); o.castShadow = true; } });
    this.gfx._noDyn = true;
    const pos = cam.position.clone(), quat = cam.quaternion.clone(), fov = cam.fov, far = cam.far;
    cam.position.set(0, 900, 300); cam.lookAt(0, 0, 0); cam.fov = 70; cam.far = 5200; cam.updateProjectionMatrix();
    try { const r = this.gfx.renderer; if (r.compileAsync) await r.compileAsync(scene, cam); else r.compile(scene, cam); this.gfx.render(0.016, cam.position); } catch (e) { console.warn('warmup', e); }
    this.gfx._noDyn = false; for (const o of shadowOff) o.castShadow = false;
    for (const o of hidden) o.visible = false;
    cam.position.copy(pos); cam.quaternion.copy(quat); cam.fov = fov; cam.far = far; cam.updateProjectionMatrix();
  }

  _events() {
    this.input.onLock = (locked) => { if (!locked && this.state === 'play' && !this.ui.panel && !this.noLock) this.pause(); };
    this.canvas.addEventListener('mousedown', () => { this.audio.unlock(); if (this.state === 'play' && !this.input.locked && !this.ui.panel) this.input.lock(); });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { if (this.ui.panel === 'end') return; if (this.ui.panel) { if (this.state === 'paused' && this.ui.panel !== 'pause') this.ui.open('pause'); else this.ui.close(); } else if (this.state === 'play' && !this.input.locked) this.pause(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play' && !this.noLock) this.pause(); });
  }

  // ---- state transitions ----
  toMenu(first) {
    if (this.pendingLower && !first) { location.reload(); return; } // apply an automatic quality drop between matches
    this.match.stop(); if (this.pet && this.pet.root) this.pet.root.visible = false; this.state = 'menu'; this.input.enabled = false; this.input.unlock(); this.ai.reset(); this.combat.reset(); this.loot.clear();
    for (const v of this.vehicles.list) this.gfx.scene.remove(v.grp); this.vehicles.list.length = 0;
    const p = this.player; p.reset(); p.mode = 'ground'; p.grounded = true; p.outfit = this.settings.d.outfit;
    // scenic overlook near Iron City
    const C = this.world.locations.find(l => l.id === 'iron'); let best = null, bh = -1;
    for (let i = 0; i < 90; i++) { const a = i / 90 * Math.PI * 2, r = 250 + (i % 5) * 22; const x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r; const h = this.world.heightAt(x, z); if (h > bh && this.nav.isLandFree(x, z) && this.world.slopeAt(x, z) < 0.35) { bh = h; best = { x, z }; } }
    best = best || { x: C.x - 260, z: C.z }; p.pos.set(best.x, this.world.heightAt(best.x, best.z), best.z); p.yaw = Math.atan2(C.x - best.x, C.z - best.z) + Math.PI - 0.5;
    p.weapons[0] = { id: 'kestrel', ammo: 30, scope: 4, supp: true, mode: 0 }; p.cur = 0; p._wkey = '';
    if (this.env) this.env.stop();
    this.menuPos = best; this.menuYaw = p.yaw; this.gfx.setSun(36, (p.yaw + 1.05) * 180 / Math.PI); this.water.uniforms.uSunCol.value.copy(this.gfx.sunColor);
    this.gfx.camera.fov = 50; this.gfx.camera.updateProjectionMatrix(); this.gfx.fx.uScope.value = 0; this.gfx.fx.uZone.value = 0; this.gfx.fx.uHurt.value = 0; this.gfx.fx.uSat.value = 1;
    this.terrain.warm(best.x, best.z, 260);
    this.ui.showMenu();
  }
  setMenuCam(i) { this.menuCam = i; }
  startMatch() {
    this.audio.unlock(); this.env.start();
    this.pet.reset(); this.match.start(); this.state = 'play'; this.input.enabled = true; this.input.lock();
    setTimeout(() => this.warmupMatch(), 400);
  }
  // Second warm-up while the player rides the plane: objects that only exist once a match runs (each enemy model with
  // its gun, loot of every kind, animals, activity markers) get their shaders compiled in parallel, without a hitch.
  async warmupMatch() {
    const r = this.gfx.renderer; if (!r.compileAsync) return; const temp = [], shown = [], shadowOff = [];
    const byKey = new Map(); for (const b of this.ai.bots) if (!byKey.has(b.modelKey)) byKey.set(b.modelKey, b);
    for (const b of byKey.values()) { const S = b.ensureSoldier(); if (!S.group.visible) { S.group.visible = true; shown.push(S.group); } }
    const g = new THREE.Group(); g.position.set(0, -500, 0); this.gfx.scene.add(g); let i = 0;
    for (const id in ITEMS) { try { const m = itemMesh(this, { id, rot: 0.3, w: null, model: ITEMS[id].model || null, float: false }); m.position.x = (i++ % 20) * 2; g.add(m); } catch (e) { /* item without a mesh */ } }
    this.gfx.scene.traverse(o => { if (!o.visible && o !== this.zone.mesh) { shown.push(o); o.visible = true; } if (o.isMesh && !o.castShadow && (o.userData._cs || o.userData.cast)) { shadowOff.push(o); o.castShadow = true; } });
    try { await r.compileAsync(this.gfx.scene, this.gfx.camera); } catch (e) { console.warn('match warmup', e); }
    for (const o of shadowOff) o.castShadow = false; for (const o of shown) o.visible = false; this.gfx.scene.remove(g); temp.length = 0;
  }
  pause() { if (this.state !== 'play') return; this.state = 'paused'; this.ui.open('pause'); }
  resume() { if (this.state !== 'paused') return; this.state = 'play'; this.input.lock(); }

  frame(dt) {
    const gfx = this.gfx, cam = gfx.camera, p = this.player, I = this.input;
    if (this.state === 'play') {
      this.time += dt;
      if (I.pressed('inventory') && p.alive && this.ui.panel !== 'end') { if (this.ui.panel === 'inventory') this.ui.close(); else if (!this.ui.panel) this.ui.open('inventory'); }
      if (I.pressed('map') && this.ui.panel !== 'end') { if (this.ui.panel === 'map') this.ui.close(); else if (!this.ui.panel) this.ui.open('map'); }
      this.ui.wheelUpdate(I, p);
      p.update(dt);
      this.vehicles.update(dt); this.ai.update(dt); this.animals.update(dt); this.activities.update(dt); this.combat.update(dt); this.match.update(dt);
      for (let k = 1; k < (this.timeScale || 1); k++) { I.mx = 0; I.my = 0; p.update(dt); this.vehicles.update(dt); this.ai.update(dt); this.combat.update(dt); this.match.update(dt); } // debug fast-forward
      if (p.mode !== 'plane') p.syncVisual(dt, p.yaw); else p.hideSoldier();
      if (p.soldier && (p.hideBody || (p.mode === 'seat' && p.vehicle && p.vehicle.closed))) p.soldier.group.visible = false;
      this.pet.update(dt, p);
      this.loot.update(p.pos.x, p.pos.y, p.pos.z); this.fx.update(dt);
      // slow sun drift = dynamic sky
      this.env.update(dt);
      const alt = Math.max(0, p.pos.y - this.world.heightAt(p.pos.x, p.pos.z));
      this.audio.listener(cam.position.x, cam.position.y, cam.position.z, Math.sin(p.camYaw), Math.cos(p.camYaw));
      this.audio.update(dt, { wind: Math.min(1, 0.25 + alt / 200), rush: p.mode === 'fall' ? Math.min(1, Math.abs(p.vel.y) / 60) : p.mode === 'chute' ? 0.25 : 0, sea: this.world.heightAt(p.pos.x, p.pos.z) < 3.5 ? 1 : 0, engine: p.mode === 'chute' ? 0.85 : p.vehicle ? Math.min(1, Math.abs(p.vehicle.speed) / p.vehicle.def.max + Math.abs(p.vehicle.thr) * 0.15) : -1,
        plane: p.mode === 'plane' ? 1 : this.match.plane.mesh.visible ? Math.max(0, 1 - this.match.plane.pos.distanceTo(cam.position) / 700) : 0, bird: p.mode === 'ground' && this.world.surfaceAt(p.pos.x, p.pos.z) === 'grass', combat: this.match.alive > 8 && this.match.time > 60 });
    } else if (this.state === 'menu') {
      this.time += dt; this.menuT += dt; const t = this.menuT; p.speedNow = 0; p.aiming = false; p.pitch = -0.05 + Math.sin(t * 0.4) * 0.03; p.yaw = this.menuYaw + Math.sin(t * 0.25) * 0.12; p.syncVisual(dt, p.yaw);
      const fx = Math.sin(this.menuYaw), fz = Math.cos(this.menuYaw); const k = this._mk = damp(this._mk || 0, this.menuCam, 3, dt);
      const ang = this.menuYaw + 0.5 + Math.sin(t * 0.1) * 0.12 - k * 0.2, dist = 4.3 - k * 1.5, h = 1.42 + Math.sin(t * 0.2) * 0.06;
      cam.position.set(p.pos.x + Math.sin(ang) * dist, p.pos.y + h, p.pos.z + Math.cos(ang) * dist);
      const off = -1.3 + k * 2.2; cam.rotation.order = 'YXZ'; cam.lookAt(p.pos.x + Math.cos(ang) * off, p.pos.y + 1.2, p.pos.z - Math.sin(ang) * off);
      this.fx.update(dt); this.audio.update(dt, { wind: 0.3, rush: 0, sea: 0, engine: -1, plane: 0, bird: true, combat: false });
    } else { /* paused / boot: keep rendering the frozen frame */ }
    this.terrain.update(cam.position); this.vegetation.update(cam.position); this.props.update(cam.position);
    if (this.dbgCam && p) { const c = this.dbgCam, a = p.yaw + c[0]; cam.position.set(p.pos.x + Math.sin(a) * c[1], p.pos.y + c[2], p.pos.z + Math.cos(a) * c[1]); cam.lookAt(p.pos.x, p.pos.y + (c[3] || 1), p.pos.z); if (p.soldier) p.soldier.group.visible = true; } // debug orbit view
    if (this.ui) this.ui.update(dt);
    gfx.render(this.state === 'paused' ? 0 : dt, p ? p.pos : cam.position);
    I.endFrame();
  }
}
