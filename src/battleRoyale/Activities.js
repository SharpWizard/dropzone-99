// Free-roam activities for STORY mode: a hidden cache in every named location, supply drops that fall from the sky
// near the player, and rolling bounties (hunt a species, take down hostiles). Everything reports to the HUD side panel,
// the compass, the minimap and the career record.
import * as THREE from 'three';
import { RNG } from '../utils/math.js';
import { rollLoot } from '../inventory/Items.js';

const BOUNTIES = [['deer', 2, 'DEER'], ['rabbit', 3, 'RABBITS'], ['fox', 1, 'FOX'], ['bear', 1, 'BEAR'], ['bison', 2, 'BISON'], ['hostile', 3, 'HOSTILES'], ['hostile', 5, 'HOSTILES'], ['headshot', 2, 'HEADSHOT KILLS']];

export class Activities {
  constructor(G) { this.G = G; this.group = new THREE.Group(); this.group.name = 'activities'; G.gfx.scene.add(this.group); this.caches = []; this.drops = []; this.bounty = null; this.R = new RNG(1); this._el = null; this._hudT = 0; }

  reset() {
    const G = this.G; for (const c of this.caches) this.group.remove(c.g); for (const d of this.drops) this._dropRemove(d); this.caches = []; this.drops = []; this.bounty = null; this.dropT = 75; this.R = new RNG((Date.now() % 1e9) | 0);
    if (!this.on()) { this._hud(); return; }
    // one cache per location, hidden at a loot spot inside it (indoors when possible)
    for (const L of G.world.locations) { const spots = G.world.lootSpots.filter(s => Math.hypot(s.x - L.x, s.z - L.z) < L.r * 0.9);
      const sp = spots.length ? spots[this.R.int(0, spots.length - 1)] : null; const x = sp ? sp.x : L.x, z = sp ? sp.z : L.z, y = sp ? sp.y : G.world.heightAt(x, z);
      const g = this._chestMesh(); g.position.set(x, y, z); g.rotation.y = this.R.f() * 6.28; this.group.add(g); this.caches.push({ L, x, y, z, g, found: false }); }
    this._newBounty();
    this._hud();
  }
  on() { return !this.G.match.br(); }

  _chestMesh() {
    const g = new THREE.Group(), A = this.G.assets; let m = null;
    for (const k of ['cafe/storage_crate', 'props/safe_free_model']) if (A && A.has(k)) { m = A.fitted(k, { length: 0.9 }); if (m) break; }
    if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x7a5a30 })); m.position.y = 0.3; }
    g.add(m); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.G.T.glow, color: 0xffcc55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(1.8); s.position.y = 0.5; g.add(s); g.userData.halo = s;
    return g;
  }

  _newBounty() {
    const G = this.G, live = new Set((G.animals ? G.animals.list : []).filter(a => a.alive).map(a => a.sp)); const pool = BOUNTIES.filter(b => b[0] === 'hostile' || b[0] === 'headshot' || live.has(b[0]));
    const b = this.R.pick(pool); this.bounty = { kind: b[0], need: b[1], got: 0, label: b[2], reward: b[0] === 'bear' ? 300 : b[0] === 'headshot' ? 300 : 120 + b[1] * 60 };
  }
  onAnimalKill(sp) { const b = this.bounty; if (!b || b.kind !== sp) return; this._progress(); }
  onKill(victim, head) { const b = this.bounty; if (!b || victim.civ) return; if (b.kind === 'hostile' || (b.kind === 'headshot' && head)) this._progress(); }
  _progress() { const G = this.G, b = this.bounty; b.got++; if (b.got >= b.need) { G.player.points = (G.player.points || 0) + b.reward; G.ui.pointsPop(b.reward, 'BOUNTY COMPLETE'); G.ui.banner('BOUNTY COMPLETE', b.need + ' ' + b.label + '  ·  +' + b.reward + ' POINTS'); G.match._celebrate(); if (G.career) G.career.add('bounties', 1); this._newBounty(); } else G.ui.toast('BOUNTY · ' + b.got + ' / ' + b.need + ' ' + b.label); this._hud(true); }

  // supply drop: a crate falls under a red smoke trail with a light beam marking it, somewhere ahead of the player
  _spawnDrop() {
    const G = this.G, P = G.player; for (let k = 0; k < 20; k++) { const a = this.R.f() * 6.283, r = this.R.range(110, 260), x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
      if (!G.nav.isLandFree(x, z)) continue; const gy = G.world.heightAt(x, z); if (gy < 2) continue;
      const g = this._chestMesh(); g.scale.setScalar(1.5); g.position.set(x, gy + 220, z); this.group.add(g);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 400, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.4, 0.25), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      beam.position.set(x, gy + 200, z); this.group.add(beam);
      const d = { x, z, gy, g, beam, landed: false, t: 160 }; this.drops.push(d);
      const bearing = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(x - P.pos.x, -(z - P.pos.z)) * 180 / Math.PI + 360) % 360) / 45) % 8];
      G.ui.banner('SUPPLY DROP INBOUND', Math.round(r) + ' m ' + bearing + '  ·  follow the red beam'); G.audio.ui('win'); return; }
  }
  _dropRemove(d) { this.group.remove(d.g); this.group.remove(d.beam); d.beam.geometry.dispose(); d.beam.material.dispose(); }

  update(dt) {
    const G = this.G, P = G.player; if (!this.on() || G.state !== 'play') return; const t = performance.now() / 1000;
    // caches glint, and open when the player reaches them
    for (const c of this.caches) { if (c.found) continue; const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z); c.g.visible = d < 120; if (!c.g.visible) continue; c.g.userData.halo.scale.setScalar(1.5 + Math.sin(t * 3 + c.x) * 0.35);
      if (d < 1.9 && Math.abs(P.pos.y - c.y) < 1.6 && P.alive) { c.found = true; this.group.remove(c.g); G.fx.sparkle(c.x, c.y + 0.5, c.z, 1, 0.8, 0.3, 30); for (let i = 0; i < 3; i++) G.loot.drop(this._roll(2), 0, c.x, c.y + 0.5, c.z);
        P.points = (P.points || 0) + 100; G.ui.pointsPop(100, 'HIDDEN CACHE'); G.ui.banner('HIDDEN CACHE · ' + c.L.name, this.caches.filter(q => q.found).length + ' / ' + this.caches.length + ' found'); G.audio.ui('win'); if (G.career) G.career.add('caches', 1); this._hud(true); } }
    // supply drops: timer, fall, land, open
    if (P.alive && P.mode === 'ground') { this.dropT -= dt; if (this.dropT <= 0 && this.drops.length < 2) { this.dropT = 150; this._spawnDrop(); } }
    for (let i = this.drops.length - 1; i >= 0; i--) { const d = this.drops[i]; d.t -= dt;
      if (!d.landed) { d.g.position.y = Math.max(d.gy, d.g.position.y - 11 * dt); d.g.rotation.y += dt * 0.6; G.fx.smoke.spawn(d.x + (Math.random() - 0.5) * 0.6, d.g.position.y + 0.8, d.z + (Math.random() - 0.5) * 0.6, 0, 1.2, 0, 1.4, 0.18, 0.12, 0.5, 0.8, 2.6, 1.1, -0.2, 0.4);
        if (d.g.position.y <= d.gy + 0.01) { d.landed = true; G.fx.dust(d.x, d.gy, d.z, 14); G.fx.ring(d.x, d.gy, d.z, 6, 0.5); if (Math.hypot(P.pos.x - d.x, P.pos.z - d.z) < 60) P.shakeCam(0.5); } }
      else if (Math.random() < 0.5) G.fx.smoke.spawn(d.x + 0.6, d.gy + 0.6, d.z, 0.3, 2.4, 0.1, 1.2, 0.15, 0.1, 0.45, 0.9, 3.4, 1.6, -0.3, 0.3);
      d.beam.material.opacity = 0.22 + Math.sin(t * 4) * 0.1;
      if (d.landed && P.alive && Math.hypot(P.pos.x - d.x, P.pos.z - d.z) < 2.4) { for (let k = 0; k < 4; k++) G.loot.drop(this._roll(2), 0, d.x, d.gy + 0.6, d.z); G.loot.drop('medkit', 0, d.x, d.gy + 0.6, d.z);
        P.points = (P.points || 0) + 150; G.ui.pointsPop(150, 'SUPPLY DROP'); G.fx.sparkle(d.x, d.gy + 1, d.z, 1, 0.4, 0.3, 26); G.audio.ui('win'); if (G.career) G.career.add('drops', 1); this._dropRemove(d); this.drops.splice(i, 1); continue; }
      if (d.t <= 0) { this._dropRemove(d); this.drops.splice(i, 1); } }
    this._hudT -= dt; if (this._hudT <= 0) { this._hudT = 0.5; this._hud(); }
  }
  // gear only (weapons from a cache would come without a magazine): re-roll until it is not a gun
  _roll(tier) { for (let i = 0; i < 8; i++) { const id = rollLoot(this.R, tier); if (!/^(kestrel|ravager|hornet|sentry|longbow|breacher|viper)$/.test(id)) return id; } return 'medkit'; }

  // compass / minimap markers
  marks() { const out = []; for (const d of this.drops) out.push({ x: d.x, z: d.z, col: '#ff4a2a' }); return out; }
  drawMap(ctx, w2m, lw) {
    for (const d of this.drops) { const x = w2m(d.x), z = w2m(d.z); ctx.fillStyle = '#ff4a2a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = lw; ctx.beginPath(); ctx.rect(x - lw * 4, z - lw * 4, lw * 8, lw * 8); ctx.fill(); ctx.stroke(); }
    const P = this.G.player; for (const c of this.caches) { if (c.found || Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > 70) continue; const x = w2m(c.x), z = w2m(c.z); ctx.strokeStyle = '#ffcc55'; ctx.lineWidth = lw * 1.4; ctx.beginPath(); ctx.arc(x, z, lw * 7, 0, 6.283); ctx.stroke(); }
  }

  _hud(pulse) {
    let el = this._el; if (!el) { el = this._el = document.createElement('div'); el.id = 'sidejobs'; document.body.appendChild(el); }
    const G = this.G; const show = this.on() && (G.state === 'play' || G.state === 'paused'); el.style.display = show ? 'block' : 'none'; if (!show) return;
    const P = G.player, found = this.caches.filter(c => c.found).length, b = this.bounty; let drop = '';
    for (const d of this.drops) { const r = Math.hypot(P.pos.x - d.x, P.pos.z - d.z); drop = 'SUPPLY DROP · ' + Math.round(r) + ' m'; }
    el.innerHTML = '<div>HIDDEN CACHES · <b>' + found + ' / ' + this.caches.length + '</b></div>' + (b ? '<div>BOUNTY · ' + b.label + ' <b>' + b.got + ' / ' + b.need + '</b> · +' + b.reward + '</div>' : '') + (drop ? '<div class="hot">' + drop + '</div>' : '') +
      (G.match.seen ? '<div>DISCOVERED · <b>' + G.match.seen.size + ' / ' + G.world.locations.length + '</b></div>' : '');
    if (pulse) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  }
}
