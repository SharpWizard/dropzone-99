// Renderer: WebGL2 HDR pipeline with cascaded shadow maps, physical sky + IBL,
// depth-based ambient occlusion, bloom, ACES tone mapping and colour grading.
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp } from '../utils/math.js';

export const PRESETS = {
  LOW: { scale: 0.8, msaa: 2, cascades: 0, shadowSize: 1024, shadowFar: 70, ao: false, bloom: false, grass: 14000, grassTile: 48, treeHi: 90, treeFar: 520, terrainHi: 200, tex: 1, clouds: 0.4, particles: 0.5, botDraw: 160, propDist: 0.7, dynShadow: 45 },
  MEDIUM: { scale: 1, msaa: 2, cascades: 2, shadowSize: 2048, shadowFar: 150, ao: true, bloom: true, grass: 36000, grassTile: 64, treeHi: 150, treeFar: 800, terrainHi: 300, tex: 2, clouds: 0.42, particles: 0.8, botDraw: 260, propDist: 0.85, dynShadow: 60 },
  HIGH: { scale: 1, msaa: 4, cascades: 3, shadowSize: 2048, shadowFar: 230, ao: true, bloom: true, grass: 70000, grassTile: 80, treeHi: 180, treeFar: 900, terrainHi: 420, tex: 2, clouds: 0.42, particles: 1, botDraw: 380, propDist: 1, dynShadow: 75 },
  ULTRA: { scale: 1, msaa: 4, cascades: 4, shadowSize: 4096, shadowFar: 300, ao: true, bloom: true, grass: 120000, grassTile: 96, treeHi: 200, treeFar: 1100, terrainHi: 400, tex: 2, clouds: 0.5, particles: 1.1, botDraw: 420, propDist: 1.25, dynShadow: 110 },
};

// Probe WebGL2 support. Returns { ok, renderer, reason }.
export function probeWebGL() {
  try {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
    if (!gl) return { ok: false, reason: 'WebGL 2 is not available in this browser.' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) + '';
    const lost = gl.getExtension('WEBGL_lose_context'); if (lost) lost.loseContext();
    return { ok: true, renderer };
  } catch (e) { return { ok: false, reason: 'WebGL could not start: ' + (e && e.message ? e.message : e) }; }
}

// Pick a starting quality from the GPU name and CPU/RAM. Unknown hardware gets MEDIUM, never ULTRA by default.
export function detectPreset(renderer = '') {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  const r = renderer || probeWebGL().renderer || '';
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(r)) return 'LOW';
  if (/mobile|adreno|mali|powervr|apple gpu/i.test(navigator.userAgent + ' ' + r) && !/apple m/i.test(r)) return 'LOW';
  if (/GTX\s?(9\d\d|7\d\d|6\d\d)|HD Graphics [2-4]\d{3}|Intel.*(HD 4|HD 5|HD 6)/i.test(r)) return 'LOW';
  const strong = /RTX\s?(40[7-9]0|50\d0)|RX\s?(7[89]00|79\d0|9\d00)|Apple M(2|3|4) (Pro|Max|Ultra)/i.test(r);
  const good = /RTX\s?(30[5-9]0|20[6-8]0)|RTX\s?40[5-6]0|RX\s?(6[6-9]00|6[7-9]\d0)|Arc A7|Apple M[1-4]|GTX\s?(16[5-9]0|1080)/i.test(r);
  if (strong && cores >= 8 && mem >= 8) return 'ULTRA';
  if (good && cores >= 6) return 'HIGH';
  if (/Intel|UHD|Iris|HD Graphics|Vega|GTX/i.test(r) || cores <= 4 || mem <= 4) return 'MEDIUM';
  return 'MEDIUM';
}

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const AO_FRAG = `
precision highp float;
uniform sampler2D tDepth; uniform vec2 uProj; uniform float uNear, uFar; varying vec2 vUv;
float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 vp(vec2 uv){ float z = lin(texture2D(tDepth, uv).x); return vec3((uv * 2.0 - 1.0) * uProj * z, -z); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  vec3 p = vp(vUv); float depth = -p.z;
  if (depth > 220.0) { gl_FragColor = vec4(1.0); return; }
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  float rad = 0.7 + depth * 0.012; float ang = ign(gl_FragCoord.xy) * 6.2831853; float occ = 0.0;
  vec2 ps = vec2(0.5) / (uProj * depth);
  for (int i = 0; i < 10; i++) {
    float t = (float(i) + 0.5) / 10.0; float a = ang + float(i) * 2.399963; float r = sqrt(t) * rad;
    vec3 q = vp(vUv + vec2(cos(a), sin(a)) * r * ps); vec3 v = q - p; float d = length(v);
    occ += max(0.0, dot(n, v) / (d + 1e-4) - 0.12) * smoothstep(rad * 1.6, rad * 0.2, d);
  }
  float ao = 1.0 - clamp(occ / 10.0 * 1.35, 0.0, 0.8);
  gl_FragColor = vec4(mix(ao, 1.0, smoothstep(120.0, 220.0, depth)));
}`;

const BRIGHT_FRAG = `
precision highp float; uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0);
  c += min(texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb, vec3(24.0));
  c += min(texture2D(tColor, vUv + uTexel * vec2( 1.0, -1.0)).rgb, vec3(24.0));
  c += min(texture2D(tColor, vUv + uTexel * vec2(-1.0,  1.0)).rgb, vec3(24.0));
  c += min(texture2D(tColor, vUv + uTexel * vec2( 1.0,  1.0)).rgb, vec3(24.0));
  c *= 0.25; float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(1.4, 3.2, l), 1.0);
}`;
const BLUR_FRAG = `
precision highp float; uniform sampler2D tColor; uniform vec2 uTexel; uniform float uSpread; varying vec2 vUv;
void main(){
  vec2 o = uTexel * uSpread;
  vec3 c = texture2D(tColor, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tColor, vUv + vec2(o.x, -o.y)).rgb
         + texture2D(tColor, vUv + vec2(-o.x, o.y)).rgb + texture2D(tColor, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const FINAL_FRAG = `
precision highp float;
uniform sampler2D tColor, tAO, tBloom; uniform vec2 uAOTexel; uniform vec2 uSharpTexel; uniform float uSharp; uniform float uExposure, uAO, uBloom, uTime, uSat, uZone, uHurt, uScope;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color){
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6; color = I * color; color = RRTAndODTFit(color); color = O * color; return clamp(color, 0.0, 1.0);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  if (uSharp > 0.0) { vec3 nb = (texture2D(tColor, vUv + vec2(uSharpTexel.x, 0.0)).rgb + texture2D(tColor, vUv - vec2(uSharpTexel.x, 0.0)).rgb + texture2D(tColor, vUv + vec2(0.0, uSharpTexel.y)).rgb + texture2D(tColor, vUv - vec2(0.0, uSharpTexel.y)).rgb) * 0.25; c = max(vec3(0.0), c + (c - nb) * uSharp); }
  if (uAO > 0.0) {
    float ao = texture2D(tAO, vUv + uAOTexel * vec2(-0.5, -0.5)).r + texture2D(tAO, vUv + uAOTexel * vec2(1.5, -0.5)).r
             + texture2D(tAO, vUv + uAOTexel * vec2(-0.5, 1.5)).r + texture2D(tAO, vUv + uAOTexel * vec2(1.5, 1.5)).r;
    c *= mix(1.0, ao * 0.25, uAO);
  }
  if (uBloom > 0.0) c += texture2D(tBloom, vUv).rgb * uBloom;
  c = aces(c);
  // grade: gentle filmic contrast, warm highlights / cool shadows
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(l), c, (1.22 + 0.42 * (1.0 - sat)) * uSat);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);
  c = pow(c, vec3(0.94));
  c *= mix(vec3(0.97, 1.0, 1.05), vec3(1.04, 1.01, 0.95), smoothstep(0.05, 0.85, l));
  c = mix(c, c * vec3(0.72, 0.86, 1.25), uZone * 0.3);
  vec2 q = vUv - 0.5; float v = dot(q, q);
  c *= 1.0 - v * 0.32;
  c = mix(c, vec3(0.5, 0.02, 0.0), clamp(v * 2.4 * uHurt, 0.0, 0.7));
  if (uScope > 0.0) { vec2 s = q * vec2(uScope, 1.0); float r = length(s); c *= 1.0 - smoothstep(0.455, 0.47, r); c *= 1.0 - smoothstep(0.3, 0.47, r) * 0.35; }
  c = pow(c, vec3(1.0 / 2.2));
  c += (hash(vUv * 913.0 + uTime) - 0.5) * 0.005;
  gl_FragColor = vec4(c, 1.0);
}`;

// Atmospheric fog replaces three's fog chunks, so every lit material gets it. The extra uniforms are bound by Gfx.mat();
// a material that never passes through it sees zeros there and falls back to plain exponential fog.
export const FOG_U = { uFogSun: { value: new THREE.Vector3(0, 1, 0) }, uFogSunCol: { value: new THREE.Color(0, 0, 0) }, uFogK: { value: 1 } };
function installFog() {
  const C = THREE.ShaderChunk; if (C.__dzFog) return; C.__dzFog = true;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogDir;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogDir = transpose(mat3(viewMatrix)) * mvPosition.xyz;\n#endif';
  C.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogDir; uniform vec3 uFogSun; uniform vec3 uFogSunCol; uniform float uFogK;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n#endif';
  C.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogH = cameraPosition.y + vFogDir.y;
      float fogHK = mix(1.0, clamp(exp(-(fogH - 12.0) * 0.011), 0.3, 1.5), uFogK);
      float fogD = fogDensity * vFogDepth * fogHK;
      float fogFactor = 1.0 - exp(-fogD * fogD);
      float fogSunA = pow(max(dot(normalize(vFogDir), uFogSun), 0.0), 6.0);
      vec3 fogCol = fogColor + uFogSunCol * fogSunA;
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth); vec3 fogCol = fogColor;
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogFactor);
  #endif`;
}

export class Gfx {
  constructor(canvas, presetName) {
    installFog();
    this.presetName = presetName; this.q = PRESETS[presetName] || PRESETS.MEDIUM;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in r187; softness comes from shadow.radius
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; if (this.onLost) this.onLost(); });
    canvas.addEventListener('webglcontextrestored', () => { location.reload(); });
    r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    r.info.autoReset = false;
    this.maxAniso = r.capabilities.getMaxAnisotropy();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.12, 5200);
    this.scene.add(this.camera);
    this.dynScale = 1; this._fpsAcc = 0; this._fpsN = 0;
    this.sunDir = new THREE.Vector3(0.4, 0.7, 0.3).normalize();
    this.materials = new Set();
    this.time = 0; this.uTime = { value: 0 };
    this._lastFov = 0;

    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0xb4bf98, 1.2); this.scene.add(this.hemi);
    if (this.q.cascades > 0) {
      this.csm = new CSM({ maxFar: this.q.shadowFar, cascades: this.q.cascades, mode: 'practical', parent: this.scene, shadowMapSize: this.q.shadowSize,
        lightDirection: this.sunDir.clone().negate(), camera: this.camera, lightIntensity: 3.2, lightNear: 1, lightFar: 1400, lightMargin: 320, shadowBias: -0.00012 });
      this.csm.fade = true;
      this.csm.lights.forEach((l, i) => { l.shadow.normalBias = 0.04 + i * 0.05; l.shadow.radius = 2.2; });
    } else {
      const l = this.sun = new THREE.DirectionalLight(0xffffff, 3.2); l.castShadow = true; l.shadow.radius = 2.2;
      l.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize); const s = this.q.shadowFar;
      Object.assign(l.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 900 }); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.08;
      this.scene.add(l); this.scene.add(l.target);
    }
    this.scene.fog = new THREE.FogExp2(0xcfe6f2, 0.00048);

    // sky + image based lighting
    this.sky = this._stylisedSky(); this.sky.frustumCulled = false; this.scene.add(this.sky);
    this.skyEnv = null;
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene(); this.envSky = this._stylisedSky(1000); this.envScene.add(this.envSky);
    this.scene.environmentIntensity = 0.9;

    // post
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene(); this.postScene.add(this.quad); this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sm = (frag, uniforms, extra) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.mAO = sm(AO_FRAG, { tDepth: { value: null }, uProj: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 } });
    this.mBright = sm(BRIGHT_FRAG, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mBlur = sm(BLUR_FRAG, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 1 } });
    this.mUp = sm(BLUR_FRAG, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.mFinal = sm(FINAL_FRAG, { tColor: { value: null }, tAO: { value: null }, tBloom: { value: null }, uAOTexel: { value: new THREE.Vector2() },
      uExposure: { value: 0.6 }, uSharp: { value: 0.35 }, uSharpTexel: { value: new THREE.Vector2() }, uAO: { value: this.q.ao ? 1 : 0 }, uBloom: { value: this.q.bloom ? 0.16 : 0 }, uTime: { value: 0 }, uSat: { value: 1 }, uZone: { value: 0 }, uHurt: { value: 0 }, uScope: { value: 0 } });
    this.fx = this.mFinal.uniforms;
    this.bloomRT = [];
    this.setSun(42, 135);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Forget a material registered with mat() and free its GPU program (for per-instance clones that are thrown away)
  unmat(m) { if (!m) return; this.materials.delete(m); if (this.csm) this.csm.shaders.delete(m); m.dispose(); }
  // Register a lit material (needed for cascaded shadows) and optionally add a shader hook.
  mat(m, key, hook) {
    if (this.materials.has(m)) return m;
    this.materials.add(m);
    if (this.csm) this.csm.setupMaterial(m);
    const csmHook = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => { if (this.csm && csmHook) csmHook(shader, renderer); Object.assign(shader.uniforms, FOG_U); if (hook) hook(shader); };
    m.customProgramCacheKey = () => (key || 'std') + (this.csm ? '_csm' : '') + '_fog';
    return m;
  }
  std(params, key, hook) { return this.mat(new THREE.MeshStandardMaterial(params), key, hook); }

  // Stylised sky dome: vertical gradient (deep blue zenith -> warm horizon), a glowing sun disc and
  // soft cloud layers from fbm noise. One draw call, no textures.
  _stylisedSky(radius = 4800) {
    const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uTop: { value: new THREE.Color(0x3f8fe0) }, uHor: { value: new THREE.Color(0xbfe6ff) }, uSunCol: { value: new THREE.Color(1.0, 0.92, 0.72) }, uCloud: { value: this.q.clouds }, uNight: { value: 0 }, uLit: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp float; varying vec3 vDir; uniform vec3 uSun, uTop, uHor, uSunCol; uniform float uTime, uCloud, uNight, uLit;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*n(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float up = clamp(d.y, 0.0, 1.0);
          vec3 mid = mix(uHor, uTop, 0.62) * vec3(0.96, 1.03, 1.08);
          vec3 col = up < 0.28 ? mix(uHor, mid, smoothstep(0.0, 0.28, up)) : mix(mid, uTop, smoothstep(0.28, 0.95, up));
          if (uNight > 0.01) { vec3 sg = floor(d * 190.0); float st = step(0.9965, h(sg.xy + sg.z * 37.0)); col += vec3(0.9, 0.95, 1.0) * st * uNight * smoothstep(0.0, 0.25, d.y) * (1.2 + 0.6 * sin(uTime * 2.0 + sg.x)); }
          float sd = max(0.0, dot(d, normalize(uSun)));
          col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 22.0) * 0.4 + pow(sd, 4.0) * 0.12);
          // clouds: project onto a plane above the horizon
          if (d.y > 0.02) {
            vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.005);
            float c = fbm(uv * 1.3) * 0.82 + fbm(uv * 0.42 + 9.0) * 0.26;
            float cover = smoothstep(1.0 - uCloud * 0.9, 1.0 - uCloud * 0.9 + 0.16, c);
            // light: sample the density a step towards the sun - thick cloud in that direction means a shaded base
            vec2 sdir = normalize(uSun.xz + vec2(1e-4)) * 0.09; float c2 = fbm((uv + sdir) * 1.3) * 0.82 + fbm((uv + sdir) * 0.42 + 9.0) * 0.26;
            float lit = clamp(0.62 + (c - c2) * 3.2, 0.0, 1.0);
            vec3 cloudCol = mix(mix(uHor, uTop, 0.35) * 0.82, vec3(1.0, 0.985, 0.95), lit);
            cloudCol = mix(cloudCol, uSunCol * 1.15, pow(sd, 5.0) * 0.55); cloudCol *= uLit;
            col = mix(col, cloudCol, cover * smoothstep(0.02, 0.22, d.y) * 0.92);
          }
          // gentle horizon haze band
          col = mix(col, uHor, smoothstep(0.08, 0.0, d.y) * 0.6);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }` });
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat); m.name = 'sky'; return m;
  }

  // Apply a complete sky / light state (used by the day-night and weather controller).
  setSky(o) {
    this.sunDir.copy(o.dir);
    for (const m of [this.sky.material, this.envSky.material]) { const u = m.uniforms; u.uSun.value.copy(o.dir); u.uTop.value.copy(o.top); u.uHor.value.copy(o.hor); u.uSunCol.value.copy(o.disc); u.uCloud.value = o.cloud; u.uNight.value = o.night; u.uLit.value = o.lit; }
    if (this.csm) { this.csm.lightDirection.copy(o.dir).negate(); this.csm.lights.forEach(l => { l.color.copy(o.lightCol); l.intensity = o.inten; }); }
    else { this.sun.color.copy(o.lightCol); this.sun.intensity = o.inten; }
    this.hemi.intensity = o.hemi; this.hemi.color.copy(o.hemiSky);
    this.scene.fog.color.copy(o.fog); this.scene.fog.density = o.fogD; if (this.uFogD) this.uFogD.value = o.fogD; // water and particles share this uniform
    FOG_U.uFogSun.value.copy(o.dir); FOG_U.uFogSunCol.value.copy(o.disc).multiplyScalar(0.34 * Math.min(1, o.inten / 2.2) * (o.night > 0.5 ? 0.3 : 1));
    this.sunColor = (this.sunColor || new THREE.Color()).copy(o.lightCol).multiplyScalar(Math.min(1, o.inten / 2.6));
    if (o.bake !== false) { if (this.envRT) this.envRT.dispose(); this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000); this.scene.environment = this.envRT.texture; }
  }
  // Fixed daytime sun (menu and defaults).
  setSun(elevDeg, azimDeg) {
    const warm = clamp((elevDeg - 5) / 35, 0, 1); const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevDeg), THREE.MathUtils.degToRad(azimDeg));
    this.setSky({ dir, lightCol: new THREE.Color().setRGB(1, 0.78 + warm * 0.2, 0.56 + warm * 0.38), inten: 1.2 + warm * 2.3, hemi: 0.9 + warm * 0.5, hemiSky: new THREE.Color(0xcfe4ff),
      top: new THREE.Color(0x3f8fe0), hor: new THREE.Color(0xbfe6ff), disc: new THREE.Color(1.0, 0.92, 0.72), cloud: this.q.clouds || 0.4, night: 0, lit: 1,
      fog: new THREE.Color().setRGB(0.52 + (1 - warm) * 0.2, 0.62 + (1 - warm) * 0.02, 0.74 - (1 - warm) * 0.12), fogD: 0.00048 });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // render target height from the chosen output resolution; the scene renders at that size and is scaled to the window
    const choice = (this.resMode || localStorage.getItem('dz.res') || 'auto');
    const targetH = { '1080': 1080, '1440': 1440, native: window.innerHeight * (window.devicePixelRatio || 1) }[choice] || null;
    const userScale = clamp(+(localStorage.getItem('dz.rscale') || 100) / 100, 0.5, 1.5);
    const pr = (targetH ? Math.min(targetH / Math.max(1, window.innerHeight), 2.5) : Math.min(window.devicePixelRatio || 1, 2)) * this.q.scale * this.dynScale * userScale;
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
    const W = Math.max(320, Math.round(w * pr)), H = Math.max(180, Math.round(h * pr));
    this.W = W; this.H = H;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.rtScene) { this.rtScene.depthTexture.dispose(); this.rtScene.dispose(); this.rtAO.dispose(); this.bloomRT.forEach(t => t.dispose()); }
    this.rtScene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: this.q.msaa, depthBuffer: true });
    this.rtScene.depthTexture = new THREE.DepthTexture(W, H); this.rtScene.depthTexture.type = THREE.UnsignedIntType;
    this.rtAO = new THREE.WebGLRenderTarget(W >> 1, H >> 1, { depthBuffer: false });
    this.bloomRT = [];
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < 5; i++) { this.bloomRT.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), { type: THREE.HalfFloatType, depthBuffer: false })); bw >>= 1; bh >>= 1; }
    if (this.csm) this.csm.updateFrustums();
  }

  // Dynamic objects (characters, vehicles, animals, loot, trains): they cast shadows only near the camera, and skinned
  // rigs - 14 to 23 separate meshes per modular character, with per-mesh culling off - are skipped when out of view.
  // Without this every character costs up to 90 draw calls a frame (main pass + each shadow cascade).
  _dynLOD() {
    const cam = this.camera, cp = cam.position; const fr = this._fr || (this._fr = new THREE.Frustum()), pm = this._pm || (this._pm = new THREE.Matrix4()), sp = this._sp || (this._sp = new THREE.Sphere());
    cam.updateMatrixWorld(); fr.setFromProjectionMatrix(pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const visit = (o, sd) => { if (!o.isGroup || !o.visible) return; let u = o.userData._dyn;
      if (!u || u.n !== o.children.length) { const cast = [], rig = []; o.traverse(m => { if (!m.isMesh) return; if (m.castShadow || m.userData._cs) { m.userData._cs = true; cast.push(m); } if (m.isSkinnedMesh) rig.push(m); }); u = o.userData._dyn = { cast, rig, n: o.children.length, s: null, v: null }; }
      const p = o.position, d = Math.hypot(p.x - cp.x, p.y - cp.y, p.z - cp.z); const s = d < sd; if (u.s !== s) { u.s = s; for (const m of u.cast) m.castShadow = s; }
      if (u.rig.length) { sp.center.set(p.x, p.y + 1, p.z); sp.radius = 3; const v = d < 25 || fr.intersectsSphere(sp); if (u.v !== v) { u.v = v; for (const m of u.rig) m.visible = v; } } };
    const sd = this.q.dynShadow || 70;
    for (const o of this.scene.children) { if (!o.isGroup) continue; const n = o.name; if (n === 'locations' || n === 'animals') { for (const k of o.children) visit(k, sd); } else if (n === 'loot') { for (const k of o.children) visit(k, 18); } else if (!n) visit(o, sd); }
  }

  _pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.postScene, this.postCam); }

  render(dt, focus) {
    const r = this.renderer, cam = this.camera;
    this.time += dt; this.uTime.value = this.time;
    // dynamic resolution: keep the frame rate healthy
    // ignore background tabs and load hitches so they never lower the quality
    if (document.hidden || !document.hasFocus() || dt > 0.25) { this._fpsAcc = 0; this._fpsN = 0; this._slow = 0; } else { this._fpsAcc += dt; this._fpsN++; }
    if (this._fpsAcc > 2.5) {
      const fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; this.fps = fps;
      const old = this.dynScale;
      this._slow = (fps < 30 && this.dynScale <= 0.56) ? (this._slow || 0) + 1 : 0;
      if (this._slow >= 3 && this.presetName !== 'LOW') { const order = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']; const lower = order[Math.max(0, order.indexOf(this.presetName) - 1)]; localStorage.setItem('dz.preset', lower); localStorage.setItem('dz.autoLowered', lower); this._slow = 0; if (this.onAutoLower) this.onAutoLower(lower); }
            if (fps < 48) this.dynScale = Math.max(0.55, this.dynScale - (fps < 36 ? 0.12 : 0.06)); else if (fps > 57 && this.dynScale < 1) this.dynScale = Math.min(1, this.dynScale + 0.05);
      if (old !== this.dynScale) this.resize();
    }
    const su = this.sky.material.uniforms; su.uTime.value = this.time;
    this.sky.position.copy(cam.position);
    if (this.csm) {
      if (cam.fov !== this._lastFov) { this._lastFov = cam.fov; this.csm.updateFrustums(); }
      this.csm.update();
    } else if (focus) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 400); this.sun.target.position.copy(focus);
    }
    if (!this._noDyn) this._dynLOD();
    r.info.reset();
    r.setRenderTarget(this.rtScene); r.render(this.scene, cam);
    const fx = this.fx;
    if (this.q.ao) {
      const u = this.mAO.uniforms; const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      u.tDepth.value = this.rtScene.depthTexture; u.uProj.value.set(t * cam.aspect, t); u.uNear.value = cam.near; u.uFar.value = cam.far;
      this._pass(this.mAO, this.rtAO); fx.tAO.value = this.rtAO.texture; fx.uAOTexel.value.set(1 / this.rtAO.width, 1 / this.rtAO.height);
    }
    if (this.q.bloom) {
      const B = this.bloomRT;
      this.mBright.uniforms.tColor.value = this.rtScene.texture; this.mBright.uniforms.uTexel.value.set(0.5 / this.W, 0.5 / this.H);
      this._pass(this.mBright, B[0]);
      for (let i = 1; i < B.length; i++) { const u = this.mBlur.uniforms; u.tColor.value = B[i - 1].texture; u.uTexel.value.set(1 / B[i - 1].width, 1 / B[i - 1].height); this._pass(this.mBlur, B[i]); }
      r.autoClear = false;
      for (let i = B.length - 2; i >= 0; i--) { const u = this.mUp.uniforms; u.tColor.value = B[i + 1].texture; u.uTexel.value.set(1 / B[i + 1].width, 1 / B[i + 1].height); this._pass(this.mUp, B[i]); }
      r.autoClear = true;
      fx.tBloom.value = B[0].texture;
    }
    fx.tColor.value = this.rtScene.texture; fx.uTime.value = this.time % 100; fx.uSharpTexel.value.set(1 / this.W, 1 / this.H);
    this._pass(this.mFinal, null);
  }
}
