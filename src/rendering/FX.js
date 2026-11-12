// Pooled visual effects: particles (smoke/dust/sparks), bullet tracers, impact decals, muzzle flashes, explosions.
import * as THREE from 'three';
import { MAT } from '../physics/Colliders.js';

const PV = `attribute vec4 aColor; attribute float aSize; varying vec4 vC; uniform float uScale;
void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PF = `precision highp float; uniform sampler2D tMap; uniform vec3 uFog; uniform float uFogD; varying vec4 vC;
void main(){ vec4 t = texture2D(tMap, gl_PointCoord); float a = t.a * vC.a; if (a < 0.004) discard; float d = 1.0 / gl_FragCoord.w; float f = 1.0 - exp(-d * d * uFogD * uFogD); gl_FragColor = vec4(mix(vC.rgb * t.rgb, uFog, f * FOGK), a); }`;

class Particles {
  constructor(G, max, additive, tex) {
    this.max = max; this.n = 0; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grow = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: PV, fragmentShader: PF.replace('FOGK', additive ? '0.0' : '1.0'), uniforms: { tMap: { value: tex }, uScale: { value: 600 }, uFog: { value: G.gfx.scene.fog.color }, uFogD: { value: G.gfx.scene.fog.density } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5; G.gfx.scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, r, g, b, a, size, life, grow = 0, grav = 0, drag = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a; this.a0[i] = a; this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt, pxScale) {
    this.mat.uniforms.uScale.value = pxScale; const P = this.pos, V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue; this.life[i] -= dt;
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt); V[i * 3] *= d; V[i * 3 + 1] = V[i * 3 + 1] * d - this.grav[i] * dt; V[i * 3 + 2] *= d;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt; this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i]; const fo = Math.min(1, t * 2.2), fi = Math.min(1, (1 - t) * 10); this.col[i * 4 + 3] = this.a0[i] * fo * fo * (3 - 2 * fo) * fi * fi * (3 - 2 * fi);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(G) {
    this.G = G; const T = G.T, scene = G.gfx.scene; const k = G.gfx.q.particles;
    this.smoke = new Particles(G, Math.round(1800 * k), false, T.puff); this.sparks = new Particles(G, Math.round(700 * k), true, T.glow);
    // tracers: camera-facing ribbons
    const NT = this.NT = 72; this.tr = []; const tg = this.trGeo = new THREE.BufferGeometry();
    this.trPos = new Float32Array(NT * 12); const tuv = new Float32Array(NT * 8), ti = [];
    for (let i = 0; i < NT; i++) { tuv.set([0, 0, 0, 1, 1, 1, 1, 0], i * 8); ti.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); this.tr.push({ life: 0 }); }
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3).setUsage(THREE.DynamicDrawUsage)); tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2)); tg.setIndex(ti);
    this.trMesh = new THREE.Mesh(tg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      // white-hot core inside an orange glow, fading along the tail (HDR values feed the bloom)
      fragmentShader: 'varying vec2 vUv; void main(){ float e = 1.0 - abs(vUv.y * 2.0 - 1.0); float h = smoothstep(0.0, 0.35, vUv.x) * (0.35 + 0.65 * vUv.x); float core = smoothstep(0.55, 0.95, e); gl_FragColor = vec4((vec3(4.2, 2.3, 0.7) * e * e + vec3(7.0, 6.2, 4.6) * core) * h, 1.0); }' }));
    this.trMesh.frustumCulled = false; this.trMesh.renderOrder = 7; scene.add(this.trMesh); this.trCursor = 0;
    // decals
    const ND = this.ND = 220; this.dPos = new Float32Array(ND * 12); const duv = new Float32Array(ND * 8), di = []; const dg = this.dGeo = new THREE.BufferGeometry();
    for (let i = 0; i < ND; i++) { duv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); di.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); }
    dg.setAttribute('position', new THREE.BufferAttribute(this.dPos, 3).setUsage(THREE.DynamicDrawUsage)); dg.setAttribute('uv', new THREE.BufferAttribute(duv, 2)); dg.setIndex(di);
    this.dMesh = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ map: T.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0x9a9a9a }));
    this.dMesh.frustumCulled = false; this.dMesh.renderOrder = 3; scene.add(this.dMesh); this.dCursor = 0;
    // muzzle flashes + light
    this.flashes = []; for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(6, 4.5, 2.5) })); s.visible = false; s.renderOrder = 8; scene.add(s); this.flashes.push({ s, life: 0 }); }
    this.fCursor = 0;
    this.light = new THREE.PointLight(0xffc070, 0, 14, 2); scene.add(this.light); this.lightLife = 0;
    this.boom = new THREE.PointLight(0xff9a40, 0, 60, 1.6); scene.add(this.boom); this.boomLife = 0;
    this.shake = 0;
    // falling leaves: small opaque leaf-shaped points that drift and flutter
    const lc = document.createElement('canvas'); lc.width = lc.height = 32; const lx = lc.getContext('2d'); lx.translate(16, 16); lx.rotate(0.6); lx.fillStyle = '#fff'; lx.beginPath(); lx.ellipse(0, 0, 13, 6, 0, 0, 6.283); lx.fill();
    const lt = new THREE.CanvasTexture(lc); this.leaves = new Particles(G, Math.round(160 * k), false, lt); this._amb = 0; this._t = 0;
    // explosion shockwaves: flat rings that expand over the ground
    this.rings = []; const rg = new THREE.RingGeometry(0.82, 1, 48); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); m.visible = false; m.renderOrder = 6; scene.add(m); this.rings.push({ m, life: 0, max: 1, r: 1 }); }
    this.rCursor = 0;
    // blood pools (spread on the ground under a kill, fade later) and lingering fires (after explosions)
    this.pools = []; const pg = new THREE.CircleGeometry(1, 22).rotateX(-Math.PI / 2);
    for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x4a0505, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.visible = false; m.renderOrder = 3; scene.add(m); this.pools.push({ m, life: 0, r: 1 }); }
    this.pCursor = 0; this.fires = [];
  }
  // a character dies: spray of droplets, a red mist, a flash, and a pool that spreads on the ground
  // rising glitter (pickups, heals, rescues, discoveries)
  sparkle(x, y, z, r = 1, g = 0.85, b = 0.4, n = 10) { const K = this.sparks; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = rnd(0.1, 0.5); K.spawn(x + Math.cos(a) * d, y + rnd(-0.1, 0.3), z + Math.sin(a) * d, Math.cos(a) * rnd(0.2, 1), rnd(0.8, 2.6), Math.sin(a) * rnd(0.2, 1), r * 3, g * 3, b * 3, 1, rnd(0.03, 0.07), rnd(0.5, 1.0), 0, -0.6, 1.2); } K.spawn(x, y, z, 0, 0, 0, r * 3, g * 3, b * 3, 0.9, 0.5, 0.18, 3, 0, 0); }
  // feet or bodies hitting water: droplets and a spreading ripple of foam
  splash(x, z, k = 1) { const S = this.smoke; for (let i = 0; i < 6 * k; i++) S.spawn(x + rnd(-0.2, 0.2), 0.05, z + rnd(-0.2, 0.2), rnd(-1, 1), rnd(1.2, 3.4) * k, rnd(-1, 1), 0.88, 0.95, 1, 0.6, rnd(0.04, 0.09), rnd(0.35, 0.6), 0.2, 9, 0.5); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; S.spawn(x, 0.04, z, Math.cos(a) * 1.2 * k, 0.02, Math.sin(a) * 1.2 * k, 0.92, 0.97, 1, 0.3, 0.1, 0.7, 0.5, 0, 2.2); } }
  // celebration: bursts of coloured sparks overhead (mission stages, victory)
  burst(x, y, z) { const K = this.sparks; const cols = [[5, 1.2, 0.6], [1, 4, 5], [5, 4, 0.8], [1.4, 5, 1.6], [5, 1.4, 4]]; for (let k = 0; k < 4; k++) { const c = cols[(Math.random() * cols.length) | 0], bx = x + rnd(-7, 7), by = y + rnd(0, 5), bz = z + rnd(-7, 7); K.spawn(bx, by, bz, 0, 0, 0, c[0], c[1], c[2], 1, 2.2, 0.25, 4, 0, 0);
      for (let i = 0; i < 34; i++) { const a = Math.random() * 6.283, e = (Math.random() - 0.5) * 3.14, sp = rnd(3, 8); K.spawn(bx, by, bz, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, c[0], c[1], c[2], 1, rnd(0.06, 0.12), rnd(0.8, 1.6), 0, 3.5, 1.4); } } }
  kill(x, y, z, h = 1.1) {
    const S = this.smoke, K = this.sparks; const cy = y + h;
    for (let i = 0; i < 22; i++) { const a = Math.random() * 6.283, sp = rnd(1.2, 4.6); S.spawn(x, cy, z, Math.cos(a) * sp, rnd(1.5, 5.5), Math.sin(a) * sp, rnd(0.45, 0.62), 0.02, 0.02, 1, rnd(0.03, 0.07), rnd(0.6, 1.1), 0, 11, 0.3); }
    for (let i = 0; i < 7; i++) S.spawn(x + rnd(-0.25, 0.25), cy + rnd(-0.3, 0.3), z + rnd(-0.25, 0.25), rnd(-0.6, 0.6), rnd(0.2, 1.0), rnd(-0.6, 0.6), 0.5, 0.03, 0.03, 0.42, rnd(0.25, 0.45), rnd(0.7, 1.3), 0.9, 0.6, 1.6);
    K.spawn(x, cy, z, 0, 0, 0, 3.2, 0.25, 0.2, 1, 0.9, 0.09, 4, 0, 0);
    const p = this.pools[this.pCursor]; this.pCursor = (this.pCursor + 1) % this.pools.length; p.m.position.set(x + rnd(-0.2, 0.2), y + 0.04, z + rnd(-0.2, 0.2)); p.s = 0.08; p.m.scale.set(0.08, 1, 0.08); p.m.rotation.y = Math.random() * 6.28; p.m.visible = true; p.life = 34; p.r = rnd(0.55, 0.95) * Math.min(1.6, Math.max(0.5, h / 1.1)); p.sx = rnd(0.8, 1.25);
  }
  _linger(dt) {
    for (const p of this.pools) { if (p.life <= 0) continue; p.life -= dt; p.s = Math.min(p.r, p.s + (p.r - p.s) * Math.min(1, dt * 1.6)); p.m.scale.set(p.s * p.sx, 1, p.s); p.m.material.opacity = 0.82 * Math.min(1, p.life / 6) * Math.min(1, (34 - p.life) * 4); if (p.life <= 0) p.m.visible = false; }
    const S = this.smoke, K = this.sparks;
    for (let i = this.fires.length - 1; i >= 0; i--) { const f = this.fires[i]; f.t -= dt; if (f.t <= 0) { this.fires.splice(i, 1); continue; } const k = Math.min(1, f.t / 1.5) * f.s; f.acc = (f.acc || 0) + dt;
      while (f.acc > 0.03) { f.acc -= 0.03; const ox = rnd(-0.9, 0.9) * k, oz = rnd(-0.9, 0.9) * k; K.spawn(f.x + ox, f.y + rnd(0, 0.3), f.z + oz, rnd(-0.3, 0.3), rnd(1.6, 3.6), rnd(-0.3, 0.3), 4.6, rnd(1.6, 2.6), 0.4, 0.9, rnd(0.35, 0.7) * k, rnd(0.3, 0.55), 0.5, -1.2, 1.2);
        if (Math.random() < 0.25) { const g = rnd(0.06, 0.14); S.spawn(f.x + ox, f.y + rnd(0.8, 1.6), f.z + oz, rnd(-0.3, 0.5), rnd(1.4, 2.8), rnd(-0.3, 0.3), g, g, g, 0.36, rnd(0.5, 0.9) * k, rnd(1.6, 2.8), 0.7, -0.2, 0.5); }
        if (Math.random() < 0.12) K.spawn(f.x + ox, f.y + 0.4, f.z + oz, rnd(-1, 1), rnd(2.5, 6), rnd(-1, 1), 5, 2.4, 0.5, 1, rnd(0.03, 0.05), rnd(0.8, 1.6), 0, -0.5, 0.5); } }
  }
  ring(x, y, z, radius = 9, life = 0.45) { const r = this.rings[this.rCursor]; this.rCursor = (this.rCursor + 1) % this.rings.length; r.m.position.set(x, y + 0.12, z); r.m.scale.setScalar(0.3); r.m.visible = true; r.life = r.max = life; r.r = radius; }
  // drifting leaves and sunlit pollen around the camera, wherever there is vegetation
  ambient(dt) {
    const G = this.G, w = G.world, cam = G.gfx.camera.position; if (!w || !w.splatAt) return;
    this._t += dt; this._amb -= dt; if (this._amb > 0) return; this._amb = 0.07;
    // burning wreckage and towers: rolling smoke, flame cores and embers for the fires near the camera
    const F = null; if (F && F.length) for (let k = 0; k < 4; k++) { const f = F[(Math.random() * F.length) | 0]; const d = Math.hypot(f.x - cam.x, f.z - cam.z); if (d > 420 || d < f.s * 2.5) continue; const s = f.s, g0 = rnd(0.05, 0.14);
      this.smoke.spawn(f.x + rnd(-s, s) * 0.5, f.y + rnd(0, s), f.z + rnd(-s, s) * 0.5, rnd(0.6, 1.8), rnd(2.5, 5), rnd(-0.4, 0.4), g0, g0, g0 * 1.05, 0.42, s * rnd(0.7, 1.2), rnd(3, 5), s * 0.3, -0.15, 0.25);
      if (d < 260) { this.sparks.spawn(f.x + rnd(-s, s) * 0.4, f.y + rnd(-0.3, 0.6), f.z + rnd(-s, s) * 0.4, rnd(-0.3, 0.3), rnd(1.5, 3.5), rnd(-0.3, 0.3), 5, 2.0, 0.4, 1, s * rnd(0.35, 0.7), rnd(0.35, 0.7), s * 0.4, -1, 1);
        if (Math.random() < 0.5) this.sparks.spawn(f.x, f.y, f.z, rnd(-1.5, 1.5), rnd(2, 6), rnd(-1.5, 1.5), 5, 2.2, 0.5, 1, rnd(0.03, 0.06), rnd(1.2, 2.6), 0, -0.4, 0.4); } }
    const x = cam.x + rnd(-22, 22), z = cam.z + rnd(-22, 22); const veg = w.splatAt(x, z, 3) / 255; const gh = w.heightAt(x, z); if (gh < 2 || cam.y - gh > 60) return;
    if (veg > 0.45 && Math.random() < veg) { const c = Math.random(); const r = c < 0.5 ? 0.42 : c < 0.8 ? 0.85 : 0.9, g = c < 0.5 ? 0.72 : c < 0.8 ? 0.7 : 0.42, b = c < 0.5 ? 0.16 : 0.12;
      this.leaves.spawn(x, gh + rnd(4, 10), z, rnd(0.3, 1.1), rnd(-0.9, -0.4), rnd(-0.5, 0.5), r, g, b, 1, rnd(0.07, 0.12), rnd(5, 8), 0, 0.05, 0.25); }
    if (Math.random() < 0.6) this.sparks.spawn(x * 0.5 + cam.x * 0.5, gh + rnd(0.4, 3.5), z * 0.5 + cam.z * 0.5, rnd(-0.15, 0.25), rnd(-0.03, 0.08), rnd(-0.15, 0.15), 1.0, 0.95, 0.7, 0.35, rnd(0.012, 0.03), rnd(3, 6), 0, 0, 0);
  }

  tracer(ax, ay, az, bx, by, bz) {
    const t = this.tr[this.trCursor]; this.trCursor = (this.trCursor + 1) % this.NT;
    const len = Math.hypot(bx - ax, by - ay, bz - az); if (len < 3) return;
    t.ax = ax; t.ay = ay; t.az = az; t.dx = (bx - ax) / len; t.dy = (by - ay) / len; t.dz = (bz - az) / len; t.len = len; t.head = Math.min(len, 4); t.life = 1;
  }
  flash(x, y, z, size = 0.5, light = false) {
    const f = this.flashes[this.fCursor]; this.fCursor = (this.fCursor + 1) % this.flashes.length;
    f.s.position.set(x, y, z); f.s.scale.setScalar(size * rnd(0.8, 1.25)); f.s.material.rotation = Math.random() * 6.28; f.s.visible = true; f.life = 0.045;
    if (light) { this.light.position.set(x, y + 0.1, z); this.light.intensity = 26; this.lightLife = 0.06; }
    this.sparks.spawn(x, y, z, 0, 0, 0, 5, 3.6, 1.6, 1, size * 0.55, 0.05, 2, 0, 0);
    for (let i = 0; i < 2; i++) this.sparks.spawn(x, y, z, rnd(-2.5, 2.5), rnd(-0.5, 2.5), rnd(-2.5, 2.5), 4, 2.6, 0.9, 1, 0.03, rnd(0.08, 0.18), 0, 9, 2);
    this.smoke.spawn(x, y, z, rnd(-0.3, 0.3), rnd(0.2, 0.7), rnd(-0.3, 0.3), 0.75, 0.75, 0.75, 0.16, 0.12, 0.7, 0.9, -0.2, 1.5);
  }
  decal(x, y, z, nx, ny, nz, size = 0.07) {
    const i = this.dCursor; this.dCursor = (this.dCursor + 1) % this.ND; _n.set(nx, ny, nz);
    _t.set(Math.abs(ny) > 0.9 ? 1 : 0, Math.abs(ny) > 0.9 ? 0 : 1, 0).cross(_n).normalize(); _u.crossVectors(_n, _t);
    const a = Math.random() * 6.28, c = Math.cos(a) * size, s = Math.sin(a) * size; const P = this.dPos; const o = 0.012;
    const put = (k, tx, ty) => { P[i * 12 + k * 3] = x + nx * o + _t.x * tx + _u.x * ty; P[i * 12 + k * 3 + 1] = y + ny * o + _t.y * tx + _u.y * ty; P[i * 12 + k * 3 + 2] = z + nz * o + _t.z * tx + _u.z * ty; };
    put(0, -c + s, -s - c); put(1, c + s, s - c); put(2, c - s, s + c); put(3, -c - s, -s + c);
    this.dGeo.attributes.position.needsUpdate = true;
  }
  // bullet impact on a surface
  impact(x, y, z, nx, ny, nz, mat) {
    const S = this.smoke, K = this.sparks;
    if (mat === MAT.WATER) { for (let i = 0; i < 9; i++) S.spawn(x, y, z, rnd(-0.9, 0.9), rnd(1.5, 5), rnd(-0.9, 0.9), 0.85, 0.94, 0.98, 0.55, rnd(0.06, 0.14), rnd(0.4, 0.7), 0.4, 9, 0.5); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; S.spawn(x, y + 0.03, z, Math.cos(a) * 1.3, 0.05, Math.sin(a) * 1.3, 0.9, 0.96, 1, 0.35, 0.1, 0.6, 0.5, 0, 2.5); } return; }
    if (mat === MAT.FLESH) { for (let i = 0; i < 7; i++) S.spawn(x, y, z, nx * rnd(0.5, 3) + rnd(-1.2, 1.2), rnd(0.5, 3.2), nz * rnd(0.5, 3) + rnd(-1.2, 1.2), rnd(0.45, 0.6), 0.02, 0.02, 1, rnd(0.022, 0.05), rnd(0.4, 0.8), 0, 11, 0.3); for (let i = 0; i < 4; i++) S.spawn(x, y, z, nx * rnd(0.3, 1.2) + rnd(-0.5, 0.5), rnd(0, 0.8), nz * rnd(0.3, 1.2) + rnd(-0.5, 0.5), 0.42, 0.05, 0.04, 0.5, 0.09, 0.35, 0.5, 3, 2); return; }
    let r = 0.6, g = 0.58, b = 0.54; if (mat === MAT.DIRT) { r = 0.42; g = 0.34; b = 0.24; } else if (mat === MAT.WOOD) { r = 0.5; g = 0.38; b = 0.24; } else if (mat === MAT.METAL) { r = 0.4; g = 0.4; b = 0.42; }
    for (let i = 0; i < 4; i++) S.spawn(x, y, z, nx * rnd(0.6, 2.2) + rnd(-0.6, 0.6), ny * rnd(0.6, 2.2) + rnd(0, 0.9), nz * rnd(0.6, 2.2) + rnd(-0.6, 0.6), r, g, b, 0.42, 0.1, rnd(0.5, 1.1), 1.1, 0.6, 2.2);
    // chips thrown off the surface, falling under gravity
    const nc = mat === MAT.DIRT ? 6 : mat === MAT.WOOD ? 5 : 4; const ck = mat === MAT.WOOD ? 1.35 : 0.7;
    for (let i = 0; i < nc; i++) S.spawn(x, y, z, nx * rnd(1, 4) + rnd(-1.6, 1.6), ny * rnd(1, 4) + rnd(0.8, 3.6), nz * rnd(1, 4) + rnd(-1.6, 1.6), r * ck, g * ck, b * ck, 1, rnd(0.018, 0.04), rnd(0.45, 0.9), 0, 9.8, 0.4);
    if (mat === MAT.DIRT) for (let i = 0; i < 3; i++) S.spawn(x, y + 0.05, z, rnd(-0.7, 0.7), rnd(0.6, 1.8), rnd(-0.7, 0.7), r, g, b, 0.38, 0.16, rnd(0.8, 1.4), 1.3, 0.4, 1.8);
    if (mat === MAT.METAL || mat === MAT.CONCRETE) K.spawn(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03, 0, 0, 0, 4, 3, 1.6, 1, 0.16, 0.06, 1.5, 0, 0);
    const ns = mat === MAT.METAL ? 7 : mat === MAT.CONCRETE ? 3 : 1;
    for (let i = 0; i < ns; i++) K.spawn(x, y, z, nx * rnd(2, 7) + rnd(-3, 3), ny * rnd(2, 7) + rnd(-1, 4), nz * rnd(2, 7) + rnd(-3, 3), 3, 2, 0.8, 1, 0.045, rnd(0.12, 0.3), 0, 12, 1);
    if (mat !== MAT.DIRT && mat !== MAT.GLASS) this.decal(x, y, z, nx, ny, nz, rnd(0.05, 0.08));
  }
  dust(x, y, z, amount = 1, r = 0.5, g = 0.43, b = 0.33) { for (let i = 0; i < amount; i++) this.smoke.spawn(x + rnd(-0.2, 0.2), y + 0.05, z + rnd(-0.2, 0.2), rnd(-0.5, 0.5), rnd(0.1, 0.6), rnd(-0.5, 0.5), r, g, b, 0.2, 0.18, rnd(0.6, 1.2), 0.9, -0.1, 1.2); }
  exhaust(x, y, z, vx, vz) { this.smoke.spawn(x, y, z, vx + rnd(-0.2, 0.2), rnd(0.2, 0.6), vz + rnd(-0.2, 0.2), 0.3, 0.3, 0.3, 0.2, 0.1, 0.9, 0.7, -0.4, 1); }
  explosion(x, y, z, big = 1) {
    const S = this.smoke, K = this.sparks; this.fires.push({ x, y, z, t: 4.5, s: big }); if (this.fires.length > 6) this.fires.shift();
    for (let i = 0; i < 26 * big; i++) { const a = Math.random() * 6.28, e = Math.random() * 1.4, sp = rnd(2, 9) * big; K.spawn(x, y + 0.3, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, 5, 2.6, 0.7, 1, rnd(0.5, 1.3) * big, rnd(0.25, 0.55), 2.5, 0, 3); }
    for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, sp = rnd(6, 22); K.spawn(x, y + 0.2, z, Math.cos(a) * sp, rnd(4, 16), Math.sin(a) * sp, 4, 2.4, 0.8, 1, 0.07, rnd(0.4, 1.0), 0, 16, 0.6); }
    for (let i = 0; i < 34 * big; i++) { const a = Math.random() * 6.28, sp = rnd(0.5, 5) * big; const sh = rnd(0.12, 0.3); S.spawn(x + rnd(-0.5, 0.5), y + rnd(0.2, 1.2), z + rnd(-0.5, 0.5), Math.cos(a) * sp, rnd(0.8, 5), Math.sin(a) * sp, sh, sh, sh, 0.55, rnd(0.7, 1.6) * big, rnd(1.6, 3.6), 1.6, -0.5, 1.4); }
    for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, sp = rnd(3, 9); S.spawn(x, y + 0.1, z, Math.cos(a) * sp, rnd(0.2, 1), Math.sin(a) * sp, 0.46, 0.4, 0.32, 0.4, 0.5, rnd(1, 2), 2.5, 0, 2.2); }
    for (let i = 0; i < 3; i++) K.spawn(x, y + 0.6, z, 0, 0.5, 0, 8, 6.5, 4, 1, (2.2 + i * 0.9) * big, 0.12 + i * 0.04, 9, 0, 0);
    for (let i = 0; i < 18; i++) K.spawn(x + rnd(-1.2, 1.2), y + rnd(0.3, 1.5), z + rnd(-1.2, 1.2), rnd(-0.8, 0.8), rnd(1.2, 3.4), rnd(-0.8, 0.8), 4, 1.6, 0.4, 1, rnd(0.03, 0.06), rnd(1.2, 2.6), 0, -0.6, 0.5);
    for (let i = 0; i < 12; i++) { const sh = rnd(0.07, 0.16); S.spawn(x + rnd(-0.8, 0.8), y + rnd(0.5, 2), z + rnd(-0.8, 0.8), rnd(-0.4, 0.4), rnd(1.5, 3.2), rnd(-0.4, 0.4), sh, sh, sh, 0.5, rnd(1.2, 2) * big, rnd(3.5, 6), 1.1, -0.25, 0.5); }
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, sp = rnd(4, 11); S.spawn(x, y + 0.2, z, Math.cos(a) * sp, rnd(4, 11), Math.sin(a) * sp, 0.2, 0.17, 0.13, 1, rnd(0.04, 0.09), rnd(0.9, 1.6), 0, 9.8, 0.3); }
    this.ring(x, y, z, 10 * big, 0.42);
    this.boom.position.set(x, y + 1.2, z); this.boom.intensity = 900 * big; this.boomLife = 0.22;
    this.decal(x, y + 0.02, z, 0, 1, 0, 1.6 * big);
    const cam = this.G.gfx.camera.position; const d = Math.hypot(cam.x - x, cam.y - y, cam.z - z); this.shake = Math.max(this.shake, Math.max(0, 1 - d / 55) * 1.1);
  }

  update(dt) {
    const cam = this.G.gfx.camera; const px = this.G.gfx.H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    this._linger(dt); this.smoke.update(dt, px); this.sparks.update(dt, px);
    this.ambient(dt); const L = this.leaves, LV = L.vel; for (let i = 0; i < L.max; i++) { if (L.life[i] <= 0) continue; LV[i * 3] += Math.sin(this._t * 2.6 + i * 1.7) * 1.4 * dt; LV[i * 3 + 2] += Math.cos(this._t * 2.1 + i * 2.3) * 1.4 * dt; LV[i * 3 + 1] += Math.sin(this._t * 3.4 + i) * 0.5 * dt; }
    L.update(dt, px);
    for (const r of this.rings) { if (r.life <= 0) continue; r.life -= dt; const t = 1 - Math.max(0, r.life) / r.max; r.m.scale.setScalar(0.3 + (1 - (1 - t) * (1 - t)) * r.r); r.m.material.opacity = (1 - t) * 0.8; if (r.life <= 0) r.m.visible = false; }
    // tracers
    const P = this.trPos; let dirty = false;
    for (let i = 0; i < this.NT; i++) {
      const t = this.tr[i]; if (t.life <= 0) continue; dirty = true;
      t.head += 420 * dt; const tail = Math.max(0, t.head - 14);
      if (tail >= t.len) { t.life = 0; for (let k = 0; k < 12; k++) P[i * 12 + k] = 0; continue; }
      const h = Math.min(t.head, t.len);
      _a.set(t.ax + t.dx * tail, t.ay + t.dy * tail, t.az + t.dz * tail); _b.set(t.ax + t.dx * h, t.ay + t.dy * h, t.az + t.dz * h);
      _c.subVectors(_a, cam.position); _n.set(t.dx, t.dy, t.dz).cross(_c).normalize().multiplyScalar(0.012 + _c.length() * 0.0009);
      P[i * 12] = _a.x - _n.x; P[i * 12 + 1] = _a.y - _n.y; P[i * 12 + 2] = _a.z - _n.z; P[i * 12 + 3] = _a.x + _n.x; P[i * 12 + 4] = _a.y + _n.y; P[i * 12 + 5] = _a.z + _n.z;
      P[i * 12 + 6] = _b.x + _n.x; P[i * 12 + 7] = _b.y + _n.y; P[i * 12 + 8] = _b.z + _n.z; P[i * 12 + 9] = _b.x - _n.x; P[i * 12 + 10] = _b.y - _n.y; P[i * 12 + 11] = _b.z - _n.z;
    }
    if (dirty) this.trGeo.attributes.position.needsUpdate = true;
    for (const f of this.flashes) if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.s.visible = false; }
    if (this.lightLife > 0) { this.lightLife -= dt; if (this.lightLife <= 0) this.light.intensity = 0; }
    if (this.boomLife > 0) { this.boomLife -= dt; this.boom.intensity *= Math.exp(-14 * dt); if (this.boomLife <= 0) this.boom.intensity = 0; }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
  clear() { this.dPos.fill(0); this.dGeo.attributes.position.needsUpdate = true; for (const p of this.pools) { p.life = 0; p.m.visible = false; } this.fires.length = 0; }
}
