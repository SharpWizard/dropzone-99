import { realTex } from '../rendering/RealTex.js';
// Chunked, LOD-streamed terrain mesh with a splat-mapped PBR material, plus the ocean/river water surface.
import * as THREE from 'three';
import { WORLD, HALF, GRID, SPLAT } from '../world/WorldData.js';

const CH = 128, NCH = WORLD / CH;

export class Terrain {
  constructor(G) { this.G = G; this.chunks = []; this.group = new THREE.Group(); this.group.name = 'terrain'; G.gfx.scene.add(this.group); this._queue = []; }

  build() {
    const { world, gfx, T } = this.G;
    // data textures shared with water + grass
    const hf = new Uint16Array(GRID * GRID); for (let i = 0; i < hf.length; i++) hf[i] = THREE.DataUtils.toHalfFloat(world.heights[i]);
    const ht = this.heightTex = new THREE.DataTexture(hf, GRID, GRID, THREE.RedFormat, THREE.HalfFloatType);
    ht.magFilter = ht.minFilter = THREE.LinearFilter; ht.needsUpdate = true;
    const st = this.splatTex = new THREE.DataTexture(world.splat, SPLAT, SPLAT, THREE.RGBAFormat, THREE.UnsignedByteType);
    st.magFilter = st.minFilter = THREE.LinearFilter; st.needsUpdate = true;

    const U = { tSplat: { value: st }, tGrass: { value: realTex('grass', 1, gfx.renderer).map }, tGrassN: { value: realTex('grass', 1, gfx.renderer).normalMap }, tRock: { value: T.rock.map }, tRockN: { value: T.rock.normalMap },
      tDirt: { value: T.dirt.map }, tDirtN: { value: T.dirt.normalMap }, tSand: { value: T.sand.map }, tAsph: { value: realTex('asphalt', 1, gfx.renderer).map }, tConc: { value: realTex('pavement', 1, gfx.renderer).map } };
    this.material = gfx.std({ roughness: 0.95, metalness: 0, envMapIntensity: 0.3 }, 'terrain', (s) => {
      Object.assign(s.uniforms, U);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = transformed; vWNrm = normal;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm;
        uniform sampler2D tSplat, tGrass, tGrassN, tRock, tRockN, tDirt, tDirtN, tSand, tAsph, tConc;
        float tRough; vec3 tDN;
        float th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tnz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }
        vec3 tS(sampler2D t, vec2 uv, float sc, float far){ return mix(texture2D(t, uv*sc).rgb, texture2D(t, uv*sc*0.19).rgb, far); }`)
        .replace('#include <map_fragment>', `
        vec2 tuv = vWPos.xz; float tdist = distance(vWPos, cameraPosition); float tfar = smoothstep(30.0, 200.0, tdist) * 0.8;
        vec4 sp = texture2D(tSplat, tuv / 2048.0 + 0.5 + 0.5 / 1024.0);
        float macro = tnz(tuv * 0.011) * 0.6 + tnz(tuv * 0.047) * 0.4; float fineN = tnz(tuv * 0.9);
        vec3 nUp = normalize(vWNrm); float slope = 1.0 - nUp.y;
        vec3 cg = tS(tGrass, tuv, 0.21, tfar) * mix(vec3(0.62, 0.92, 0.42), vec3(1.28, 1.22, 0.7), macro);
        vec3 cr = mix(texture2D(tRock, tuv * 0.31).rgb, texture2D(tRock, tuv * 0.043).rgb, 0.35 + tfar * 0.5) * vec3(1.12, 1.06, 0.98) * mix(0.8, 1.1, macro);
        vec3 cd = tS(tDirt, tuv, 0.19, tfar);
        float wRock = smoothstep(0.2, 0.36, slope + (macro - 0.5) * 0.14); wRock = max(wRock, smoothstep(150.0, 190.0, vWPos.y + macro * 30.0));
        float wSand = smoothstep(2.3, 1.1, vWPos.y + (macro - 0.5) * 1.6);
        float wDirt = smoothstep(0.3, 0.62, sp.g + (fineN - 0.5) * 0.45 + (macro - 0.5) * 0.2);
        float wConc = smoothstep(0.4, 0.56, sp.b + (fineN - 0.5) * 0.12);
        float wAsph = smoothstep(0.42, 0.6, sp.r + (fineN - 0.5) * 0.16);
        vec3 tcol = mix(cg, cd, wDirt);
        tcol = mix(tcol, tS(tSand, tuv, 0.23, tfar), wSand);
        tcol = mix(tcol, cr, wRock);
        tcol = mix(tcol, tS(tConc, tuv, 0.17, tfar * 0.6) * 0.56, wConc);
        tcol = mix(tcol, tS(tAsph, tuv, 0.27, tfar * 0.5) * vec3(1.5, 1.42, 1.28) * mix(0.85, 1.1, macro), wAsph);
        // stylised palette (linear): the textures contribute 30 % detail, the palette sets the colour
        vec3 pal = mix(vec3(0.075, 0.255, 0.05), vec3(0.185, 0.40, 0.07), macro); pal = mix(pal, vec3(0.29, 0.40, 0.09), smoothstep(0.5, 0.8, tnz(tuv * 0.006 + 3.0)) * 0.55);
        pal *= 0.9 + 0.2 * tnz(tuv * 0.21);
        pal = mix(pal, vec3(0.33, 0.215, 0.115), wDirt); pal = mix(pal, vec3(0.80, 0.66, 0.37), wSand); pal = mix(pal, mix(vec3(0.30, 0.31, 0.36), vec3(0.42, 0.41, 0.42), macro), wRock);
        pal = mix(pal, vec3(0.31, 0.325, 0.35), wConc); pal = mix(pal, vec3(0.115, 0.12, 0.135), wAsph);
        float lum = dot(tcol, vec3(0.3, 0.6, 0.1)); float plum = dot(pal, vec3(0.3, 0.6, 0.1));
        tcol = mix(pal * (0.8 + 0.2 * clamp(lum / max(plum, 0.02), 0.4, 1.8)), tcol, 0.1);
        float wSnow = smoothstep(92.0, 124.0, vWPos.y + (macro - 0.5) * 34.0 - slope * 60.0) * (1.0 - max(wAsph, wConc));
        tcol = mix(tcol, vec3(0.88, 0.93, 1.0) * (0.92 + 0.08 * fineN), wSnow);
        tcol *= mix(0.5, 1.0, smoothstep(-1.2, 0.5, vWPos.y));
        diffuseColor.rgb = tcol;
        float nf = 1.0 - smoothstep(60.0, 160.0, tdist);
        vec3 dn = texture2D(tGrassN, tuv * 0.21).xyz * 2.0 - 1.0;
        dn = mix(dn, texture2D(tDirtN, tuv * 0.19).xyz * 2.0 - 1.0, max(wDirt, max(wSand * 0.5, max(wAsph, wConc))));
        dn = mix(dn, (texture2D(tRockN, tuv * 0.31).xyz * 2.0 - 1.0) * 0.8, wRock);
        tDN = dn * nf * 0.4 * mix(1.0, 0.3, max(wAsph, wConc));
        tRough = mix(mix(0.96, 0.86, wRock), 0.93, max(wAsph, wConc)); tRough = mix(tRough, 0.45, smoothstep(0.6, -0.2, vWPos.y));`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize(normal + mat3(viewMatrix) * vec3(tDN.x, 0.0, -tDN.y) * 0.9);');
    });

    for (let cj = 0; cj < NCH; cj++) for (let ci = 0; ci < NCH; ci++) {
      const x0 = -HALF + ci * CH, z0 = -HALF + cj * CH;
      const lo = this._geo(x0, z0, 16, 5);
      const mesh = new THREE.Mesh(lo, this.material); mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.chunks.push({ mesh, lo, hi: null, x0, z0, cx: x0 + CH / 2, cz: z0 + CH / 2, isHi: false });
    }
  }

  _geo(x0, z0, segs, skirt) {
    const W = this.G.world; const n = segs + 1, step = CH / segs; const nv = n * n + n * 4;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3); const idx = []; const tmp = { x: 0, y: 0, z: 0 };
    let minY = 1e9, maxY = -1e9;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3, x = x0 + i * step, z = z0 + j * step, y = W.heightAt(x, z);
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; W.normalAt(x, z, tmp); nor[k] = tmp.x; nor[k + 1] = tmp.y; nor[k + 2] = tmp.z;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    // skirts hide cracks between LOD levels
    let v = n * n;
    const edge = (get) => {
      const start = v;
      for (let i = 0; i < n; i++) { const s = get(i) * 3, k = v * 3; pos[k] = pos[s]; pos[k + 1] = pos[s + 1] - skirt; pos[k + 2] = pos[s + 2]; nor[k] = nor[s]; nor[k + 1] = nor[s + 1]; nor[k + 2] = nor[s + 2]; v++; }
      for (let i = 0; i < segs; i++) { const a = get(i), b = get(i + 1), c = start + i, d = start + i + 1; idx.push(a, c, b, b, c, d, a, b, c, b, d, c); }
    };
    edge(i => i); edge(i => (n - 1) * n + i); edge(i => i * n); edge(i => i * n + n - 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + CH / 2, (minY + maxY) / 2, z0 + CH / 2), Math.hypot(CH * 0.71, (maxY - minY) / 2 + skirt));
    return g;
  }

  // stream hi-res chunks in around the camera, release them when far
  update(cam) {
    const hiD = this.G.gfx.q.terrainHi; let built = 0;
    for (const c of this.chunks) {
      const d = Math.hypot(cam.x - c.cx, cam.z - c.cz);
      if (d < hiD && !c.isHi) {
        if (!c.hi) { if (built >= 1) continue; c.hi = this._geo(c.x0, c.z0, 64, 1.5); built++; }
        c.mesh.geometry = c.hi; c.isHi = true;
      } else if (d > hiD + 60 && c.isHi) {
        c.mesh.geometry = c.lo; c.isHi = false;
        if (d > hiD + 300 && c.hi) { c.hi.dispose(); c.hi = null; }
      }
    }
  }
  // force-load everything near a point (used at spawn so the player never sees pop-in)
  warm(x, z, r) { for (const c of this.chunks) if (Math.hypot(x - c.cx, z - c.cz) < r && !c.isHi) { if (!c.hi) c.hi = this._geo(c.x0, c.z0, 64, 1.5); c.mesh.geometry = c.hi; c.isHi = true; } }
}

export class Water {
  constructor(G, heightTex) {
    const gfx = G.gfx;
    this.uniforms = { tHeight: { value: heightTex }, tWaves: { value: G.T.waves.normalMap }, uTime: gfx.uTime, uSun: { value: gfx.sunDir }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
      uFog: { value: gfx.scene.fog.color }, uFogD: { value: gfx.scene.fog.density } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        precision highp float; varying vec3 vW; uniform sampler2D tHeight, tWaves; uniform float uTime, uFogD; uniform vec3 uSun, uSunCol, uFog;
        void main(){
          vec2 huv = (vW.xz + 1024.0) / 2048.0; float th = -24.0;
          if (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) th = texture2D(tHeight, huv * (1024.0 / 1025.0) + 0.5 / 1025.0).r;
          float depth = max(0.0, -th);
          float dist = distance(vW, cameraPosition);
          vec3 n1 = texture2D(tWaves, vW.xz * 0.03 + uTime * vec2(0.011, 0.007)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(tWaves, vW.xz * 0.083 - uTime * vec2(0.009, 0.016)).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(tWaves, vW.xz * 0.004 + uTime * vec2(0.002, 0.001)).xyz * 2.0 - 1.0;
          float calm = mix(0.35, 1.0, smoothstep(0.0, 4.0, depth)) * mix(1.0, 0.35, smoothstep(150.0, 900.0, dist));
          vec3 n = normalize(vec3((n1.x + n2.x * 0.7 + n3.x) * calm, 2.6, (n1.y + n2.y * 0.7 + n3.y) * calm));
          vec3 V = normalize(cameraPosition - vW);
          float fres = 0.025 + 0.975 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 R = reflect(-V, n); R.y = abs(R.y);
          vec3 sky = mix(uFog * 1.05, vec3(0.16, 0.34, 0.68), pow(R.y, 0.55));
          vec3 spec = uSunCol * pow(max(dot(R, uSun), 0.0), 520.0) * 22.0 + uSunCol * pow(max(dot(R, uSun), 0.0), 40.0) * 0.12;
          vec3 body = mix(vec3(0.06, 0.42, 0.44), vec3(0.01, 0.10, 0.24), 1.0 - exp(-depth * 0.3));
          vec3 col = mix(body, sky, fres) + spec;
          float foam = smoothstep(0.42, 0.0, depth) * smoothstep(-0.25, 0.45, n1.x + n2.y + sin(uTime * 1.2 + vW.x * 0.3 + vW.z * 0.2) * 0.2);
          col = mix(col, vec3(0.85, 0.9, 0.9), foam * 0.75);
          float alpha = clamp(smoothstep(0.0, 1.3, depth) * 0.86 + fres * 0.6 + foam, 0.0, 1.0);
          float f = 1.0 - exp(-dist * dist * uFogD * uFogD);
          gl_FragColor = vec4(mix(col, uFog, f), alpha);
        }` });
    const mesh = this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(9600, 9600, 1, 1).rotateX(-Math.PI / 2), mat);
    mesh.position.y = 0; mesh.renderOrder = 1; mesh.frustumCulled = false; gfx.scene.add(mesh);
  }
}
