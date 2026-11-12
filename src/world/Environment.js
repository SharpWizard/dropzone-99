// Living environment: automatic day/night cycle (starting from the player's local clock), automatic weather,
// rain, and a ring of snow-capped alpine mountains around the island.
import * as THREE from 'three';
import { ridged } from '../utils/math.js';
import { NIGHT_LIGHTS } from '../rendering/GeoBatch.js';

const WX = {
  clear: { cloud: 0.3, sun: 1, fog: 1, grey: 0, rain: 0, label: 'Clear' },
  fair: { cloud: 0.5, sun: 0.95, fog: 1.1, grey: 0.05, rain: 0, label: 'Fair' },
  overcast: { cloud: 0.92, sun: 0.5, fog: 1.8, grey: 0.7, rain: 0, label: 'Overcast' },
  rain: { cloud: 1, sun: 0.35, fog: 2.6, grey: 0.85, rain: 1, label: 'Rain' },
  mist: { cloud: 0.42, sun: 0.75, fog: 3.8, grey: 0.35, rain: 0, label: 'Mist' },
};
const ODDS = [['clear', 0.42], ['fair', 0.3], ['overcast', 0.11], ['rain', 0.09], ['mist', 0.08]];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DAY_SECONDS = 720; // one full day in 'auto' mode

const NIGHT_TOP = new THREE.Color(0x0a1230), DAY_TOP = new THREE.Color(0x2f7fdc), NIGHT_HOR = new THREE.Color(0x24365e), DAY_HOR = new THREE.Color(0xbfe2f6);
const GOLD_HOR = new THREE.Color(0xffb877), GOLD_TOP = new THREE.Color(0x5a5fa8), GREY_TOP = new THREE.Color(0.42, 0.47, 0.54), GREY_HOR = new THREE.Color(0.7, 0.74, 0.78);
const SUN_LOW = new THREE.Color(1, 0.55, 0.28), SUN_HIGH = new THREE.Color(1, 0.96, 0.88), MOON = new THREE.Color(0.62, 0.74, 1.0), GREY_LIGHT = new THREE.Color(0.85, 0.88, 0.92);
const HEMI_NIGHT = new THREE.Color(0x5a74b8), HEMI_DAY = new THREE.Color(0xcfe4ff);
const _c = new THREE.Color();

export class Environment {
  constructor(G) {
    this.G = G; this.mode = localStorage.getItem('dz.tod') || 'auto'; this.tod = 10; this.active = false;
    this.w = { ...WX.clear }; this.from = { ...WX.clear }; this.to = WX.clear; this.blend = 1; this.wxT = 120; this.wxName = 'clear';
    this.o = { dir: new THREE.Vector3(), lightCol: new THREE.Color(), inten: 3, hemi: 1.2, hemiSky: new THREE.Color(), top: new THREE.Color(), hor: new THREE.Color(), disc: new THREE.Color(), cloud: 0.4, night: 0, lit: 1, fog: new THREE.Color(), fogD: 0.00048, bake: false };
    this._acc = 1; this._bake = 0; this._clockT = 0;
    this._mountains(); this._rain();
    const el = this.clock = document.createElement('div'); el.style.cssText = 'position:fixed;left:50%;top:76px;transform:translateX(-50%);font:600 11px/1 system-ui,sans-serif;letter-spacing:.14em;color:#e8f1f7;opacity:.82;text-shadow:0 1px 3px rgba(0,0,0,.7);pointer-events:none;z-index:5;display:none;text-transform:uppercase';
    document.body.appendChild(el);
  }

  setMode(m) { this.mode = m; localStorage.setItem('dz.tod', m); this._initTime(); this._acc = 1; this._bake = 0; }
  _local() { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
  _initTime() { this.tod = this.mode === 'day' ? 11 : this._local(); }
  _pick() { let r = Math.random(), n = 'clear'; for (const [k, p] of ODDS) { if (r < p) { n = k; break; } r -= p; } return n; }

  start() {
    this.active = true; this._initTime(); const n = Math.random() < 0.6 ? 'clear' : 'fair';
    this.wxName = n; this.w = { ...WX[n] }; this.from = { ...WX[n] }; this.to = WX[n]; this.blend = 1; this.wxT = 80 + Math.random() * 80; this._acc = 1; this._bake = 0;
    this.update(0);
  }
  stop() { this.active = false; if (NIGHT_LIGHTS.mat) NIGHT_LIGHTS.mat.emissiveIntensity = 0; this.rain.visible = false; this.clock.style.display = 'none'; this.G.gfx.fx.uExposure.value = 0.6; }

  update(dt) {
    if (this.G.townLife) this.G.townLife.update(dt);
    if (!this.active) return; const G = this.G, gfx = G.gfx, o = this.o, w = this.w;
    // ---- time
    if (this.mode === 'realtime') this.tod = this._local();
    else if (this.mode !== 'day') { const night = this.tod < 5.5 || this.tod > 19.5; this.tod = (this.tod + dt * 24 / DAY_SECONDS * (night ? 2.2 : 1)) % 24; }
    // ---- weather: hold, then blend to the next state
    this.wxT -= dt;
    if (this.wxT <= 0) { let n = this._pick(); if (n === this.wxName) n = this._pick(); this.wxName = n; this.from = { ...w }; this.to = WX[n]; this.blend = 0; this.wxT = 100 + Math.random() * 110; }
    if (this.blend < 1) { this.blend = Math.min(1, this.blend + dt / 25); const k = this.blend * this.blend * (3 - 2 * this.blend); for (const key of ['cloud', 'sun', 'fog', 'grey', 'rain']) w[key] = this.from[key] + (this.to[key] - this.from[key]) * k; }
    // rain follows the camera every frame
    this.rain.visible = w.rain > 0.02; if (this.rain.visible) { this.rain.material.uniforms.uCam.value.copy(gfx.camera.position); this.rain.material.uniforms.uA.value = w.rain * 0.42; }
    this._clockT -= dt; if (this._clockT <= 0) { this._clockT = 1; const h = Math.floor(this.tod), m = Math.floor((this.tod - h) * 60); this.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + '  ·  ' + WX[this.wxName].label; this.clock.style.display = G.state === 'play' ? 'block' : 'none'; }
    // ---- lighting (throttled; the reflection probe is re-baked rarely)
    this._acc += dt; if (this._acc < 0.25) return; this._acc = 0;
    const a = (this.tod - 6) / 12 * Math.PI, e = Math.sin(a) * 62, az = 100 + (this.tod - 6) / 12 * 160;
    const day = ss(-6, 10, e), gold = (1 - ss(4, 26, e)) * ss(-10, -1, e), moon = e < 0;
    const le = moon ? Math.min(60, Math.max(16, -e)) : Math.max(e, 3), la = moon ? az - 150 : az;
    o.dir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - le), THREE.MathUtils.degToRad(la));
    o.inten = moon ? 1.15 * ss(-2, -10, e) * (0.5 + 0.5 * w.sun) : (0.7 + 2.7 * ss(0, 26, e)) * ss(0, 6, e) * w.sun;
    if (moon) o.lightCol.copy(MOON); else o.lightCol.copy(SUN_LOW).lerp(SUN_HIGH, ss(2, 30, e)); o.lightCol.lerp(GREY_LIGHT, w.grey * 0.8);
    const bright = 0.12 + 0.88 * day;
    o.top.copy(NIGHT_TOP).lerp(DAY_TOP, day).lerp(GOLD_TOP, gold * 0.2).lerp(_c.copy(GREY_TOP).multiplyScalar(bright), w.grey);
    o.hor.copy(NIGHT_HOR).lerp(DAY_HOR, day).lerp(GOLD_HOR, gold * 0.75).lerp(_c.copy(GREY_HOR).multiplyScalar(bright), w.grey);
    if (moon) o.disc.setRGB(0.75, 0.82, 1); else o.disc.copy(SUN_LOW).lerp(_c.setRGB(1, 0.92, 0.72), ss(2, 30, e)); o.disc.multiplyScalar(1 - w.grey * 0.8);
    o.cloud = w.cloud; o.lit = (0.1 + 0.9 * day) * (1 - w.grey * 0.35); o.night = (1 - day) * (1 - w.cloud * 0.8);
    o.hemi = (0.8 + 0.78 * day) * (1 - w.grey * 0.2); o.hemiSky.copy(HEMI_NIGHT).lerp(HEMI_DAY, day);
    o.fog.copy(o.hor).lerp(o.top, 0.3); o.fogD = 0.00072 * w.fog * (1 + (1 - day) * 0.3);
    this._bake -= 0.25; o.bake = this._bake <= 0; if (o.bake) this._bake = 9;
    gfx.setSky(o);
    gfx.fx.uExposure.value = 0.6 * (1 + (1 - day) * 1.3);
    if (G.water) G.water.uniforms.uSunCol.value.copy(gfx.sunColor);
    NIGHT_LIGHTS.u.value = 1 - ss(-3, 9, e);
    if (NIGHT_LIGHTS.mat) NIGHT_LIGHTS.mat.emissiveIntensity = 0.3 + (1 - ss(-3, 7, e)) * 5.2 + w.grey * 0.6 * day;
  }

  // ---- distant alpine range: forested feet, grey rock, snow caps. One draw call, lit and fogged like the world.
  _mountains() {
    const NA = 240, NR = 10, R0 = 1480, R1 = 3200; const P = [], Cc = [], I = []; const c = new THREE.Color();
    const forest = new THREE.Color(0.07, 0.24, 0.08), meadow = new THREE.Color(0.2, 0.42, 0.1), rock = new THREE.Color(0.33, 0.35, 0.4), snow = new THREE.Color(0.93, 0.96, 1.0);
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) {
      const a = i / NA * Math.PI * 2, t = j / NR, r = R0 + (R1 - R0) * t, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const prof = Math.pow(Math.sin(t * Math.PI), 0.8); const n = ridged(Math.cos(a) * 3.1 + 7, Math.sin(a) * 3.1 + 3, 5, 31), n2 = ridged(x * 0.0013 + 50, z * 0.0013 + 50, 4, 9);
      const h = -40 + prof * (170 + 640 * n * (0.5 + 0.5 * n2)); P.push(x, h, z);
      const jit = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1 * 40;
      if (h + jit > 400) c.copy(snow); else if (h + jit > 250) c.copy(rock).lerp(snow, ss(330, 400, h + jit) * 0.7); else if (h > 130) c.copy(meadow).lerp(rock, ss(170, 250, h + jit)); else c.copy(forest).lerp(meadow, ss(40, 130, h));
      Cc.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const p = j * (NA + 1) + i, q = p + NA + 1; I.push(p, q, p + 1, p + 1, q, q + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setIndex(I); g.computeVertexNormals();
    const m = this.mtn = new THREE.Mesh(g, this.G.gfx.std({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }, 'mountains', (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', 'float mff = 1.0 - exp(-pow(fogDensity * 0.4 * vFogDepth, 2.0)); gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(mff, 0.0, 1.0));'); }));
    m.frustumCulled = false; m.matrixAutoUpdate = false; m.castShadow = false; m.receiveShadow = false; m.name = 'mountains'; this.G.gfx.scene.add(m);
  }

  _rain() {
    const N = Math.round(1500 * (this.G.gfx.q.particles || 1)); const P = new Float32Array(N * 6), E = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const x = Math.random() * 40, y = Math.random() * 30, z = Math.random() * 40; P.set([x, y, z, x, y, z], i * 6); E[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(E, 1));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: this.G.gfx.uTime, uCam: { value: new THREE.Vector3() }, uA: { value: 0 } },
      vertexShader: `attribute float aEnd; uniform float uTime; uniform vec3 uCam; void main(){ vec3 p = position; p.y = mod(p.y - uTime * 27.0, 30.0);
        vec3 w = vec3(mod(p.x - uCam.x, 40.0) - 20.0 + uCam.x, p.y - 12.0 + uCam.y, mod(p.z - uCam.z, 40.0) - 20.0 + uCam.z); w += vec3(0.07, 1.0, 0.03) * aEnd * 0.75;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: 'uniform float uA; void main(){ gl_FragColor = vec4(0.78, 0.85, 0.93, uA); }' });
    const m = this.rain = new THREE.LineSegments(g, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = 9; this.G.gfx.scene.add(m);
  }
}
