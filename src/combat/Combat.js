// Hitscan ballistics, damage resolution, grenades and explosions.
import * as THREE from 'three';
import { grenadeMesh } from '../weapons/Weapons.js';
import { MAT } from '../physics/Colliders.js';
import { clamp, lerp } from '../utils/math.js';

const _o = new THREE.Vector3(), _m = new THREE.Vector3();

export class Combat {
  constructor(G) { this.G = G; this.grenades = []; this._impactT = 0; }
  reset() { for (const g of this.grenades) this.G.gfx.scene.remove(g.mesh); this.grenades.length = 0; }

  // ray vs all characters. returns {c, t, zone} for the nearest hit before maxT
  rayChars(ox, oy, oz, dx, dy, dz, maxT, ignore) {
    let best = null, bt = maxT, bz = 'body';
    for (const c of this.G.chars) {
      if (!c.alive || c === ignore || c.mode === 'plane') continue;
      const px = c.pos.x - ox, py = c.pos.y + 0.9 - oy, pz = c.pos.z - oz; const tc = px * dx + py * dy + pz * dz; if (tc < -2 || tc > bt + 2) continue;
      const d2 = px * px + py * py + pz * pz - tc * tc; if (d2 > 2.6) continue;
      const S = c.spheres();
      for (let i = 0; i < 4; i++) { const s = S[i]; if (s[3] <= 0) continue; const sx = s[0] - ox, sy = s[1] - oy, sz = s[2] - oz; const t = sx * dx + sy * dy + sz * dz; if (t < 0) continue; const q = sx * sx + sy * sy + sz * sz - t * t; const r2 = s[3] * s[3]; if (q > r2) continue; const th = t - Math.sqrt(r2 - q); if (th < bt && th > 0) { bt = th; best = c; bz = s[4]; } }
    }
    return best ? { c: best, t: bt, zone: bz } : null;
  }

  shoot(shooter, def, w, ox, oy, oz, dx, dy, dz, spreadDeg) {
    const G = this.G, C = G.colliders, fx = G.fx; const player = G.player;
    shooter.muzzle(_m);
    const camD = Math.hypot(_m.x - G.gfx.camera.position.x, _m.z - G.gfx.camera.position.z);
    const visible = camD < 420;
    if (visible && !(shooter.isPlayer && G.player.scoped)) fx.flash(_m.x, _m.y, _m.z, w.supp ? 0.2 : (def.cls === 'SHOTGUN' || def.cls === 'SNIPER' ? 1.0 : 0.72), !w.supp && camD < 60);
    if (visible && camD < 45) { const S = fx.smoke, hx = dx, hz = dz, hl = Math.hypot(hx, hz) || 1, rx0 = -hz / hl, rz0 = hx / hl; // spent case flips out to the right, a curl of smoke leaves the muzzle
      S.spawn(_m.x - dx * 0.35, _m.y + 0.02, _m.z - dz * 0.35, rx0 * (1.6 + Math.random() * 1.4) + shooter.vel.x, 2 + Math.random() * 1.6, rz0 * (1.6 + Math.random() * 1.4) + shooter.vel.z, 0.86, 0.66, 0.22, 1, def.cls === 'SHOTGUN' ? 0.034 : 0.022, 0.9, 0, 9.8, 0.3);
      if (!w.supp) S.spawn(_m.x + dx * 0.1, _m.y, _m.z + dz * 0.1, dx * 1.2, 0.5 + Math.random() * 0.4, dz * 1.2, 0.8, 0.8, 0.82, 0.22, 0.07, 0.7, 0.5, -0.4, 2.5); }
    G.audio.gunshot(def.snd, _m.x, _m.y, _m.z, w.supp, shooter.isPlayer);
    G.ai.noise(shooter.pos.x, shooter.pos.z, w.supp ? 28 : def.hear, shooter);
    if (!shooter.isPlayer && shooter.pos.distanceTo(player.pos) < (w.supp ? 40 : 260)) G.ui.threat(shooter.pos.x, shooter.pos.z);
    // build an orthonormal basis for the spread cone
    let ux = -dz, uz = dx; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul; const vx = dy * uz, vy = dz * ux - dx * uz, vz = -dy * ux;
    let anyHit = false;
    for (let p = 0; p < def.pellets; p++) {
      const a = Math.random() * 6.283, r = Math.tan(spreadDeg * 0.01745) * Math.sqrt(Math.random()); const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      let rx = dx + ux * ca + vx * sa, ry = dy + vy * sa, rz = dz + uz * ca + vz * sa; const l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
      const max = def.range[1] * 1.6; const wh = C.raycast(ox, oy, oz, rx, ry, rz, max, 2, true); let dist = wh ? wh.dist : max; let hx, hy, hz;
      const wnx = wh ? wh.nx : 0, wny = wh ? wh.ny : 1, wnz = wh ? wh.nz : 0, wmat = wh ? wh.mat : -1;
      const vh = G.vehicles.rayHit(ox, oy, oz, rx, ry, rz, dist, shooter.vehicle); let hitVeh = null; if (vh) { dist = vh.t; hitVeh = vh.v; }
      const ch = this.rayChars(ox, oy, oz, rx, ry, rz, dist, shooter);
      const an = G.animals ? G.animals.rayHit(ox, oy, oz, rx, ry, rz, ch ? ch.t : dist) : null;
      if (an) {
        dist = an.t; hx = ox + rx * dist; hy = oy + ry * dist; hz = oz + rz * dist;
        const fall = lerp(1, def.range[2], clamp((dist - def.range[0]) / (def.range[1] - def.range[0]), 0, 1)); const killed = G.animals.hurt(an.a, def.dmg * fall, shooter, an.head); anyHit = true;
        if (shooter.isPlayer) G.ui.hitMarker(an.head, killed, def.dmg * fall); if (visible) fx.impact(hx, hy, hz, -rx, 0.2, -rz, MAT.FLESH); if (camD < 80) G.audio.impact(MAT.FLESH, hx, hy, hz);
      } else if (ch) {
        dist = ch.t; hx = ox + rx * dist; hy = oy + ry * dist; hz = oz + rz * dist;
        const fall = lerp(1, def.range[2], clamp((dist - def.range[0]) / (def.range[1] - def.range[0]), 0, 1));
        const dealt = ch.c.damage(def.dmg * fall, shooter, ch.zone, def.id, rx, rz);
        if (dealt > 0) { anyHit = true; if (ch.zone === 'head') shooter.headshots++; if (shooter.isPlayer) G.ui.hitMarker(ch.zone === 'head', !ch.c.alive, dealt); }
        if (visible) fx.impact(hx, hy, hz, -rx, 0.2, -rz, MAT.FLESH);
        if (camD < 80) G.audio.impact(MAT.FLESH, hx, hy, hz);
      } else if (hitVeh) {
        hx = ox + rx * dist; hy = oy + ry * dist; hz = oz + rz * dist; hitVeh.damage(def.dmg * 0.9, shooter);
        if (visible) fx.impact(hx, hy, hz, -rx, 0.3, -rz, MAT.METAL); if (camD < 120) G.audio.impact(MAT.METAL, hx, hy, hz);
      } else {
        hx = ox + rx * dist; hy = oy + ry * dist; hz = oz + rz * dist;
        if (wh && visible) { fx.impact(hx, hy, hz, wnx, wny, wnz, wmat); if (this._impactT <= 0) { this._impactT = 0.05; G.audio.impact(wmat, hx, hy, hz); } }
      }
      if (visible) fx.tracer(_m.x, _m.y, _m.z, hx, hy, hz); if (p === def.pellets - 1 && anyHit) shooter.hits++;
      // near miss feedback for the player
      if (!shooter.isPlayer && player.alive) { const px = player.pos.x - ox, py = player.pos.y + 1.4 - oy, pz = player.pos.z - oz; const t = px * rx + py * ry + pz * rz; if (t > 2 && t < dist) { const q = px * px + py * py + pz * pz - t * t; if (q < 2.2 * 2.2) { G.audio.whiz(ox + rx * t, oy + ry * t, oz + rz * t); player.suppress = Math.min(1, (player.suppress || 0) + 0.35); player.shakeCam(0.22); } } }
    }
  }

  throwGrenade(owner, ox, oy, oz, vx, vy, vz) {
    const mesh = grenadeMesh(this.G); mesh.position.set(ox, oy, oz); this.G.gfx.scene.add(mesh);
    this.grenades.push({ owner, mesh, p: new THREE.Vector3(ox, oy, oz), v: new THREE.Vector3(vx, vy, vz), fuse: 3.2, rest: false });
  }

  explode(x, y, z, owner, radius = 9.5, maxDmg = 165) {
    const G = this.G; G.fx.explosion(x, y, z, 1); G.audio.explosion(x, y, z); G.ai.noise(x, z, 320, owner, true);
    for (const c of G.chars) {
      if (!c.alive || c.mode === 'plane') continue; const dx = c.pos.x - x, dy = c.pos.y + 0.9 - y, dz = c.pos.z - z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d > radius) continue;
      if (d > 1.5 && !G.colliders.los(x, y + 0.5, z, c.pos.x, c.pos.y + (c.stance === 2 ? 0.3 : 1.1), c.pos.z)) continue;
      const k = Math.pow(1 - d / radius, 1.25) * (c.stance === 2 ? 0.75 : 1); c.damage(maxDmg * k, owner, 'body', 'frag', dx / (d || 1), dz / (d || 1));
      if (c.isPlayer) { G.player.shakeCam(1.2 * k + 0.3); G.ui.shakeHud(k > 0.4 ? 2 : 1); }
    }
    for (const v of G.vehicles.list) { const d = Math.hypot(v.pos.x - x, v.pos.y - y, v.pos.z - z); if (d < radius) v.damage(maxDmg * 2.2 * (1 - d / radius), owner); }
  }

  update(dt) {
    this._impactT -= dt; const C = this.G.colliders;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.fuse -= dt;
      if (!g.rest) {
        g.v.y -= 15 * dt; const sp = g.v.length(); const step = sp * dt;
        if (step > 1e-4) {
          const dx = g.v.x / sp, dy = g.v.y / sp, dz = g.v.z / sp; const h = C.raycast(g.p.x, g.p.y, g.p.z, dx, dy, dz, step + 0.08, 0.5);
          if (h) {
            g.p.set(h.x + h.nx * 0.07, h.y + h.ny * 0.07, h.z + h.nz * 0.07); const vn = g.v.x * h.nx + g.v.y * h.ny + g.v.z * h.nz;
            g.v.x = (g.v.x - 2 * vn * h.nx) * 0.42; g.v.y = (g.v.y - 2 * vn * h.ny) * 0.36; g.v.z = (g.v.z - 2 * vn * h.nz) * 0.42;
            if (sp > 3) this.G.audio.impact(h.mat === MAT.METAL ? 2 : 0, g.p.x, g.p.y, g.p.z);
            if (g.v.length() < 0.8 && h.ny > 0.6) { g.rest = true; g.v.set(0, 0, 0); }
          } else g.p.addScaledVector(g.v, dt);
        }
        g.mesh.position.copy(g.p); g.mesh.rotation.x += dt * sp * 1.5; g.mesh.rotation.z += dt * sp;
        if (g.p.y < -3) g.fuse = Math.min(g.fuse, 0.05);
      }
      if (g.fuse <= 0) { this.G.gfx.scene.remove(g.mesh); this.grenades.splice(i, 1); this.explode(g.p.x, g.p.y + 0.1, g.p.z, g.owner); }
    }
  }
}
