// Instanced vegetation: broadleaf + pine trees (2 LODs), bushes, boulders and a camera-following grass field.
import * as THREE from 'three';
import { makeTrees } from './TreeGen.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, fbm, clamp } from '../utils/math.js';
import { HALF } from './WorldData.js';
import { MAT } from '../physics/Colliders.js';
import { NATURE } from '../assets/Assets.js';

const SEC = 128;

class Cards {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.s = []; this.i = []; this.nv = 0; }
  quad(a, b, c, d, na, nb, nc, nd, uv, shade, sway) {
    const P = [a, b, c, d], N = [na, nb, nc, nd];
    for (let k = 0; k < 4; k++) { this.p.push(P[k][0], P[k][1], P[k][2]); this.n.push(N[k][0], N[k][1], N[k][2]); this.u.push(uv[k * 2], uv[k * 2 + 1]); const sh = shade[k]; this.c.push(sh, sh, sh); this.s.push(sway[k]); }
    const v = this.nv; this.i.push(v, v + 1, v + 2, v, v + 2, v + 3, v, v + 2, v + 1, v, v + 3, v + 2); this.nv += 4;
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.s, 1)); g.setIndex(this.i); return g;
  }
}
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

function canopy(seed, n, size, C, rad) {
  const R = new RNG(seed), K = new Cards();
  for (let i = 0; i < n; i++) {
    let dx = R.range(-1, 1), dy = R.range(-0.45, 1), dz = R.range(-1, 1); const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const k = 0.5 + R.f() * 0.5; const px = C[0] + dx * rad[0] * k, py = C[1] + dy * rad[1] * k, pz = C[2] + dz * rad[2] * k;
    // card facing mostly outward with random roll
    let ax = R.range(-1, 1), ay = R.range(-1, 1), az = R.range(-1, 1);
    let t1 = nrm(dy * az - dz * ay, dz * ax - dx * az, dx * ay - dy * ax);
    let t2 = nrm(dy * t1[2] - dz * t1[1], dz * t1[0] - dx * t1[2], dx * t1[1] - dy * t1[0]);
    if (R.chance(0.35)) { const t = t2; t2 = [dx, dy, dz]; t1 = t; }
    const s = size * (0.75 + R.f() * 0.55);
    const V = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(q => [px + (t1[0] * q[0] + t2[0] * q[1]) * s, py + (t1[1] * q[0] + t2[1] * q[1]) * s, pz + (t1[2] * q[0] + t2[2] * q[1]) * s]);
    const N = V.map(v => nrm(v[0] - C[0], (v[1] - C[1]) + rad[1] * 0.9, v[2] - C[2]));
    const sh = V.map(v => clamp(0.5 + (v[1] - C[1]) / (rad[1] * 2.2) + k * 0.25, 0.42, 1.08));
    K.quad(V[0], V[1], V[2], V[3], N[0], N[1], N[2], N[3], [0, 0, 1, 0, 1, 1, 0, 1], sh, V.map(v => v[1] / 7));
  }
  return K.geo();
}

function pineCards(seed, layers, segs) {
  const R = new RNG(seed), K = new Cards();
  for (let L = 0; L < layers; L++) {
    const t = L / (layers - 1), yb = 1.7 + t * 7.4, r = 2.7 - t * 2.05, h = 2.9 - t * 1.2; const off = R.f() * 6.28;
    const apex = K.nv; K.p.push(0, yb + h, 0); K.n.push(0, 1, 0); K.u.push(0.5, 1); const sa = 0.5 + t * 0.2; K.c.push(sa, sa, sa); K.s.push((yb + h) / 9); K.nv++;
    const first = K.nv;
    for (let k = 0; k <= segs; k++) {
      const a = off + k / segs * Math.PI * 2, co = Math.cos(a), si = Math.sin(a), rr = r * (k === segs ? 1 : 1) * (0.86 + 0.28 * Math.abs(Math.sin(k * 2.7 + L)));
      K.p.push(co * rr, yb - (k % 2) * 0.3, si * rr); const n = nrm(co * 0.75, 0.66, si * 0.75); K.n.push(n[0], n[1], n[2]); K.u.push(k / segs * 3, 0);
      const sb = 0.86 + t * 0.24; K.c.push(sb, sb, sb); K.s.push(yb / 9 + 0.25); K.nv++;
    }
    for (let k = 0; k < segs; k++) K.i.push(apex, first + k + 1, first + k, apex, first + k, first + k + 1);
  }
  return K.geo();
}

function trunkGeo(parts) {
  const gs = parts.map(([rt, rb, h, seg, x, y, z, rx, rz]) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 2, true); g.translate(0, h / 2, 0); g.rotateX(rx || 0); g.rotateZ(rz || 0); g.translate(x || 0, y || 0, z || 0); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h * 0.5); return g; });
  return mergeGeometries(gs);
}

function rockGeo(seed) {
  let g = new THREE.IcosahedronGeometry(1, 3); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-3);
  const p = g.attributes.position; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm(x * 1.3 + y * 0.9 + seed * 7, z * 1.3 - y * 0.7, 4, seed) * 0.9 + 0.55; const flat = y < -0.45 ? 0.5 : 1;
    const q = Math.round(n * 5) / 5 * 0.4 + n * 0.6; // slightly faceted
    p.setXYZ(i, x * q, y * q * 0.72 * flat, z * q * 0.92); uv[i * 2] = (x * 0.5 + z * 0.3) * 1.5; uv[i * 2 + 1] = (y + z * 0.4) * 1.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}

export class Vegetation {
  constructor(G) { this.G = G; this.sectors = []; this.group = new THREE.Group(); this.group.name = 'vegetation'; G.gfx.scene.add(this.group); this._t = 0; }

  build(heightTex, splatTex) {
    const { world, gfx, T, colliders } = this.G; const q = gfx.q;
    const swayHook = (s) => {
      s.uniforms.uTime = gfx.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float sway; uniform float uTime;')
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz; float ph = ip.x * 0.31 + ip.z * 0.17;
          transformed.x += sin(uTime * 1.4 + ph + position.y * 0.6) * 0.09 * sway; transformed.z += cos(uTime * 1.1 + ph * 1.3 + position.x) * 0.07 * sway;
        #endif`);
    };
    const leafM = (map, col) => gfx.std({ map, alphaTest: 0.4, vertexColors: true, roughness: 0.78, color: col }, 'leaf', swayHook);
    const mats = { oak: leafM(T.leaf, 0xdfe6c8), oak2: leafM(T.leaf2, 0xe6dcb0), pine: leafM(T.pine, 0xcfe0cf), bush: leafM(T.leaf, 0xc8d6a8),
      bark: gfx.std({ map: T.bark.map, normalMap: T.bark.normalMap, roughness: 0.95 }), rock: gfx.std({ map: T.rock.map, normalMap: T.rock.normalMap, roughness: 0.9, color: 0xb8b4aa }) };
    T.rock.map.wrapS = T.rock.map.wrapT = THREE.RepeatWrapping;
    const G = {
      oakT: trunkGeo([[0.15, 0.32, 3.8, 8], [0.05, 0.12, 2.6, 5, 0, 3.0, 0, 0.75, 0.2], [0.05, 0.11, 2.4, 5, 0, 3.2, 0, -0.6, -0.55], [0.04, 0.1, 2.2, 5, 0, 3.4, 0, 0.1, 0.8]]),
      oakTlo: trunkGeo([[0.15, 0.32, 3.8, 5]]),
      oakL: canopy(1, 44, 1.3, [0, 5.3, 0], [2.7, 2.0, 2.7]), oakLlo: canopy(2, 12, 2.4, [0, 5.3, 0], [2.3, 1.7, 2.3]),
      pineT: trunkGeo([[0.04, 0.26, 10.6, 7]]), pineTlo: trunkGeo([[0.04, 0.26, 10.6, 4]]),
      pineL: pineCards(3, 8, 11), pineLlo: pineCards(4, 4, 6),
      bush: canopy(5, 12, 0.62, [0, 0.55, 0], [0.75, 0.5, 0.75]),
      rock: [rockGeo(1), rockGeo(2), rockGeo(3)],
    };

    // ---- placement
    const R = new RNG(4242); const secs = new Map();
    const sec = (x, z) => { const k = Math.floor((x + HALF) / SEC) + Math.floor((z + HALF) / SEC) * 64; let s = secs.get(k); if (!s) secs.set(k, s = { cx: (Math.floor((x + HALF) / SEC) + 0.5) * SEC - HALF, cz: (Math.floor((z + HALF) / SEC) + 0.5) * SEC - HALF, oak: [], oak2: [], pine: [], bush: [], rock0: [], rock1: [], rock2: [] }); return s; };
    const forest = world.locations.find(l => l.id === 'forest');
    const STEP = 6.5;
    for (let z = -HALF + 8; z < HALF - 8; z += STEP) for (let x = -HALF + 8; x < HALF - 8; x += STEP) {
      const px = x + R.range(-3, 3), pz = z + R.range(-3, 3); const h = world.heightAt(px, pz);
      if (h < 2.2 || h > 150) { R.f(); continue; }
      const veg = world.splatAt(px, pz, 3) / 255; if (veg < 0.05) continue;
      const slope = world.slopeAt(px, pz); if (slope > 0.85) continue;
      const fd = Math.hypot(px - forest.x, pz - forest.z);
      const patch = fbm(px * 0.006 + 3, pz * 0.006 + 8, 3, 55);
      let dens = 0.03 + Math.max(0, patch - 0.5) * 1.5; if (fd < forest.r + 60) dens = Math.max(dens, 0.8 * (1 - Math.max(0, fd - forest.r) / 60));
      if (h > 50) dens = Math.max(dens, 0.34);
      dens *= veg * 0.34;
      const roll = R.f();
      if (roll < dens) {
        const pineP = clamp((h - 22) / 40, 0, 1) * 0.9 + (fd < forest.r ? 0.45 : 0.1) + (patch > 0.62 ? 0.2 : 0);
        const kind = R.f() < pineP ? 'pine' : (R.chance(0.3) ? 'oak2' : 'oak'); const s = kind === 'pine' ? R.range(0.85, 1.5) : R.range(0.9, 1.55);
        sec(px, pz)[kind].push([px, h - 0.15, pz, s, R.f() * 6.28, R.range(0.82, 1.08)]);
        colliders.add(px - 0.26 * s, h - 0.5, pz - 0.26 * s, px + 0.26 * s, h + 6 * s, pz + 0.26 * s, MAT.WOOD);
      } else if (roll < dens + 0.045 * veg + (dens > 0.3 ? 0.1 : 0)) {
        sec(px, pz).bush.push([px, h - 0.05, pz, R.range(0.8, 1.9), R.f() * 6.28, R.range(0.8, 1.05)]);
      } else if (roll > 0.992 - (slope > 0.45 ? 0.05 : 0) - (h > 70 ? 0.03 : 0) - world.splatAt(px, pz, 1) / 255 * 0.012) {
        const s = R.chance(0.2) ? R.range(1.6, 3.4) : R.range(0.45, 1.3);
        sec(px, pz)['rock' + R.int(0, 2)].push([px, h - 0.1 * s, pz, s, R.f() * 6.28, 1]);
        if (s > 1.0) colliders.add(px - 0.62 * s, h - 1, pz - 0.6 * s, px + 0.62 * s, h + 0.62 * s, pz + 0.6 * s, MAT.CONCRETE);
      }
    }
    for (const t of world.extraTrees || []) { const h = world.heightAt(t.x, t.z); const s = sec(t.x, t.z); (s.street = s.street || []).push([t.x, h - 0.1, t.z, t.s, R.f() * 6.28, 1, t.fam]); colliders.add(t.x - 0.3, h - 0.5, t.z - 0.3, t.x + 0.3, h + 5, t.z + 0.3, MAT.WOOD); }
    if (this.G.assets && this.G.assets.has('foliage/pine_q')) {
      this._instFoliage(secs, splatTex); if (q.grass > 0) this._grass(heightTex, splatTex, q.grass, q.grassTile || 72); this.update(new THREE.Vector3(0, 0, 0), true); return;
    }
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const inst = (geo, mat, list, shadow, tilt) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => { e.set(tilt ? Math.sin(t[4] * 7) * tilt : 0, t[4], tilt ? Math.cos(t[4] * 5) * tilt : 0); qt.setFromEuler(e); v.set(t[0], t[1], t[2]); sc.setScalar(t[3]); m4.compose(v, qt, sc); im.setMatrixAt(i, m4); const hv = Math.sin(t[4] * 12.9898 + t[0] * 0.37) * 0.5 + 0.5; if (t[6] !== undefined) im.setColorAt(i, col.set(t[6])); else im.setColorAt(i, col.setRGB(t[5] * (0.86 + hv * 0.24), t[5], t[5] * (0.78 + (1 - hv) * 0.26))); });
      im.castShadow = shadow; im.receiveShadow = true; im.matrixAutoUpdate = false; im.computeBoundingSphere(); this.group.add(im); return im;
    };
    this.count = 0;
    for (const s of secs.values()) {
      const S = { cx: s.cx, cz: s.cz, hi: [], lo: [], near: [], mid: [] };
      for (const kind of ['oak', 'oak2']) if (s[kind].length) { this.count += s[kind].length;
        S.hi.push(inst(G.oakT, mats.bark, s[kind], true), inst(G.oakL, mats[kind], s[kind], true)); S.lo.push(inst(G.oakTlo, mats.bark, s[kind], false), inst(G.oakLlo, mats[kind], s[kind], false)); }
      if (s.pine.length) { this.count += s.pine.length; S.hi.push(inst(G.pineT, mats.bark, s.pine, true), inst(G.pineL, mats.pine, s.pine, true)); S.lo.push(inst(G.pineTlo, mats.bark, s.pine, false), inst(G.pineLlo, mats.pine, s.pine, false)); }
      if (s.bush.length) S.near.push(inst(G.bush, mats.bush, s.bush, false));
      for (let k = 0; k < 3; k++) if (s['rock' + k].length) S.mid.push(inst(G.rock[k], mats.rock, s['rock' + k], true, 0.3));
      this.sectors.push(S);
    }
    if (q.grass > 0) this._grass(heightTex, splatTex, q.grass, q.grassTile || 72);
    this.update(new THREE.Vector3(0, 0, 0), true);
  }

  // ---- photogrammetry-based vegetation (Poly Haven, CC0): hi mesh near, decimated mesh mid, baked impostor far
  _norm(key, targetH, byWidth, lo, ref) {
    const st = this.G.assets.static(key); if (!st) return null; const stylised = /^nat[ku]\//.test(key);
    const c = ref ? ref.c : st.box.getCenter(new THREE.Vector3()), minY = ref ? ref.minY : st.box.min.y, s = ref ? ref.s : targetH / (byWidth ? Math.max(st.size.x, st.size.y, st.size.z) : st.size.y);
    const parts = st.list.map(p => { const g = p.geo.clone(); g.translate(-c.x, -minY, -c.z); g.scale(s, s, s); g.computeBoundingSphere(); const m = p.mat;
      if (m.transparent || m.alphaTest > 0 || m.alphaMap || (m.map && m.name && /lea|twig|branch|needle|frond|flower|plant|shrub|fern|bush|weed|grass/i.test(m.name))) { m.transparent = false; m.alphaTest = stylised ? (lo ? 0.3 : 0.45) : lo ? 0.1 : 0.28; m.side = THREE.DoubleSide; m.depthWrite = true; m.alphaToCoverage = this.G.gfx.q.msaa > 0; if (!m.userData.lit) { m.userData.lit = true; if (!stylised) { m.color.multiplyScalar(1.55); m.roughness = 0.7; } } }
      m.envMapIntensity = 0.3; m.metalness = 0; if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, stylised ? 0.8 : 0.88); return { geo: g, mat: m }; });
    return { parts, h: st.size.y * s, w: Math.max(st.size.x, st.size.z) * s, c, minY, s };
  }
  _impostor(n) { // bake an albedo billboard of the model, used as crossed quads in the distance
    const r = this.G.gfx.renderer, W = 256, H = 512; const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true }); rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter; rt.texture.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene(); for (const p of n.parts) sc.add(new THREE.Mesh(p.geo, new THREE.MeshBasicMaterial({ map: p.mat.map || null, color: p.mat.map ? 0xffffff : p.mat.color, vertexColors: !!p.mat.vertexColors, alphaTest: p.mat.alphaTest || 0, side: THREE.DoubleSide })));
    const hw = n.w / 2 * 1.04; const cam = new THREE.OrthographicCamera(-hw, hw, n.h * 1.02, 0, 0.1, 100); cam.position.set(0, 0, 40); cam.lookAt(0, 0, 0); cam.position.y = 0; cam.rotation.set(0, 0, 0); cam.updateMatrixWorld();
    const old = new THREE.Color(); r.getClearColor(old); const oa = r.getClearAlpha(); r.setClearColor(0x2c3a1e, 0); r.setRenderTarget(rt); r.clear(); r.render(sc, cam); r.setRenderTarget(null); r.setClearColor(old, oa);
    const g = new THREE.BufferGeometry(); const P = [], N = [], U = [], I = []; const w = hw, h = n.h * 1.02;
    for (let k = 0; k < 2; k++) { const cx = k ? 0 : 1, cz = k ? 1 : 0; const b = k * 4; P.push(-w * cx, 0, -w * cz, w * cx, 0, w * cz, w * cx, h, w * cz, -w * cx, h, -w * cz); for (let i = 0; i < 4; i++) N.push(0, 1, 0); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
    const mat = this.G.gfx.std({ map: rt.texture, alphaTest: 0.14, side: THREE.DoubleSide, roughness: 0.9, color: new THREE.Color(1.5, 1.5, 1.4), envMapIntensity: 0.2 });
    return { geo: g, mat };
  }
  // ---- Poly Pizza foliage (CC0 / CC-BY): trees by family, palms on dry ground, grass tufts and flowers
  // stylised rock variants: faceted, flat-shaded, palette-coloured (replaces the realistic photo scans)
  _stylisedRocks() {
    if (this._rocks) return this._rocks;
    const PAL = [0x8a8f96, 0x9ea4aa, 0x7b8088, 0xa8a196, 0x6f7a6e];
    const make = (seed) => {
      const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position; let sd = seed * 977 + 13;
      const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      for (let i = 0; i < p.count; i++) { const k = 0.8 + r() * 0.35; p.setXYZ(i, p.getX(i) * k * 1.12, p.getY(i) * k * 0.62, p.getZ(i) * k); }
      const ng = g.toNonIndexed(); ng.translate(0, 0.02, 0);
      const c = new THREE.Color(PAL[seed % PAL.length]); const n = ng.attributes.position.count; const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const v = 0.85 + ((i * 37) % 11) / 40; col[i * 3] = c.r * v; col[i * 3 + 1] = c.g * v; col[i * 3 + 2] = c.b * v; }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); ng.computeVertexNormals();
      return { geo: ng, mat: this.G.gfx.std({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true }) };
    };
    this._rocks = [1, 2, 3, 4].map(make);
    return this._rocks;
  }

  // layered wind for instanced foliage: whole-plant bend that grows with height, slow gusts, small leaf flutter
  _wind(n, H, amp, flut) {
    if (!n) return n; const gfx = this.G.gfx;
    for (const p of n.parts) { const m = p.mat; if (m.userData.wind) continue; m.userData.wind = true; gfx.mat(m);
      const prev = m.onBeforeCompile, pk = m.customProgramCacheKey, tag = '_wind' + H.toFixed(2) + '_' + amp + '_' + flut;
      m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); sh.uniforms.uTime = gfx.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wip = instanceMatrix[3].xyz; float wph = wip.x * 0.13 + wip.z * 0.17;
          float whk = clamp(position.y / ${H.toFixed(2)}, 0.0, 1.3); float wb = whk * whk;
          float wg = 0.55 + 0.45 * sin(uTime * 0.45 + wph * 0.3);
          transformed.x += (sin(uTime * 1.15 + wph) * 0.7 + 0.35) * wb * ${amp.toFixed(3)} * wg;
          transformed.z += cos(uTime * 0.85 + wph * 1.3) * wb * ${(amp * 0.6).toFixed(3)} * wg;
          transformed += vec3(sin(uTime * 3.1 + position.z * 1.9 + wph), sin(uTime * 2.7 + position.x * 1.7) * 0.5, cos(uTime * 3.4 + position.x * 2.3 + wph)) * ${flut.toFixed(3)} * whk;
        #endif`); };
      m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + tag; m.needsUpdate = true; }
    return n;
  }

  // pack bushes / rocks (fall back to the procedural ones)
  _packBushes() { if (this._pb) return this._pb; const A = this.G.assets; const list = NATURE.bush.filter(([k]) => A.has(k)).map(([k, t]) => this._wind(this._norm(k, t), t, 0.07, 0.02)).filter(Boolean); return (this._pb = list.length ? list : this._stylisedBushes()); }
  _packRocks() { if (this._pr) return this._pr; const A = this.G.assets; const list = NATURE.rock.filter(([k]) => A.has(k)).map(([k, t]) => this._norm(k, t)).filter(Boolean); return (this._pr = list.length ? list : this._stylisedRocks()); }
  // stylised bushes: clustered faceted blobs, lighter towards the top
  _stylisedBushes() {
    if (this._bushes) return this._bushes;
    const PAL = [[0x2f8f2a, 0x7fd13b], [0x2a7a3a, 0x58c05a], [0x3d8a1f, 0xa6d63a]];
    const make = (seed) => { let sd = seed * 733 + 5; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      const P = []; const blobs = 3 + seed % 3;
      for (let b = 0; b < blobs; b++) { const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(); const a = r() * 6.28, d = b ? 0.35 + r() * 0.45 : 0, sz = b ? 0.45 + r() * 0.3 : 0.7, oy = sz * 0.75 + r() * 0.15; const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.86 + 0.28 * Math.abs(Math.sin(x * 5.1 + y * 3.7 + z * 4.3 + b)); P.push(Math.cos(a) * d + x * sz * k, Math.max(0, oy + y * sz * k * 0.85), Math.sin(a) * d + z * sz * k); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); g.computeBoundingBox();
      const lo = new THREE.Color(PAL[seed % PAL.length][0]), hi = new THREE.Color(PAL[seed % PAL.length][1]), c = new THREE.Color(); const n = P.length / 3, col = new Float32Array(n * 3), top = g.boundingBox.max.y;
      for (let i = 0; i < n; i += 3) { const y = (P[i * 3 + 1] + P[i * 3 + 4] + P[i * 3 + 7]) / 3; c.copy(lo).lerp(hi, Math.min(1, y / top) * (0.75 + ((i * 13) % 7) / 28)); for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; } }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeBoundingSphere();
      return this._wind({ parts: [{ geo: g, mat: this.G.gfx.std({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true }) }] }, 1.4, 0.07, 0.02).parts[0]; };
    this._bushes = [1, 2, 3].map(make);
    return this._bushes;
  }

  _instFoliage(secs, splatTex) {
    const A = this.G.assets, world = this.G.world; const h = (k, t) => { const n = this._wind(this._norm('foliage/' + k, t), t, 0.42, 0.035); return n ? { hi: n, imp: this._impostor(n), cluster: /trees/.test(k) } : null; };
    const fam = (list) => list.map(([k, t]) => h(k, t)).filter(Boolean);
    const TG = makeTrees(); const P = (d) => { const mat = this.G.gfx.std({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3 });
      const hi = this._wind({ parts: [{ geo: d.hi, mat }], h: d.h, w: d.w }, d.h, 0.4, 0.03); return { hi, lo: { parts: [{ geo: d.lo, mat }] }, imp: this._impostor(hi) }; };
    // stylised nature packs, one family per biome; every tree has hi / light lo / impostor
    const famN = (list, amp = 0.42, flut = 0.035) => list.map(([k, t]) => { if (!A.has(k)) return null; const hi = this._wind(this._norm(k, t), t, amp, flut); if (!hi) return null; const [file, part] = k.split('#');
      const lk = file + '_lo' + (part ? '#' + part : ''); const lo = A.has(file + '_lo') ? this._wind(this._norm(lk, t, false, true, hi), t, amp, flut) : null; return { hi, lo, imp: this._impostor(hi) }; }).filter(Boolean);
    const NB = famN(NATURE.broad), NBI = famN(NATURE.birch), NCF = famN(NATURE.conifer), NOLD = famN(NATURE.old, 0.3, 0.03), NDEAD = famN(NATURE.dead, 0.2, 0.01), NPALM = famN(NATURE.palm, 0.5, 0.04);
    const BROAD = NB.length ? NB : TG.broad.map(P), CONIF = NCF.length ? NCF : TG.conif.map(P), SNOWY = TG.snow.map(P), PALM = NPALM.length ? NPALM : fam([['palm_q', 9], ['palm_google', 10], ['palm_jeremy', 10]]);
    const BIRCH = NBI.length ? NBI : BROAD, OLD = NOLD.length ? NOLD : BROAD, DEAD = NDEAD.length ? NDEAD : BROAD;
    const STREET = BROAD.filter((m, i) => i < 5 || i === 5 || i === 6); // compact broadleaf for pavements and parks
    const FAMS = [BROAD, CONIF, SNOWY, PALM, BIRCH, OLD, DEAD, STREET]; const dust = world.locations.find(l => l.id === 'dust'), forest = world.locations.find(l => l.id === 'forest');
    const small = (list, amp, flut) => list.filter(([k]) => A.has(k)).map(([k, t]) => this._wind(this._norm(k, t), t, amp, flut)).filter(Boolean);
    const NGRASS = small(NATURE.grass, 0.14, 0.01), NFLOW = small(NATURE.flower, 0.08, 0.008), FLOOR = small(NATURE.floor, 0.06, 0.006);
    const GRASS = NGRASS.length ? NGRASS : [this._wind(this._norm('foliage/grass_green', 0.9, false), 0.9, 0.16, 0.012), this._wind(this._norm('foliage/tall_grass', 0.95, false), 0.95, 0.2, 0.012)].filter(Boolean);
    const FLOWERS = NFLOW.length ? NFLOW : [this._wind(this._norm('foliage/dandelions', 0.45, false), 0.45, 0.07, 0.006)].filter(Boolean), TINT = !NFLOW.length;
    const STUMP = [this._norm('foliage/tree_stump', 1.1, false)].filter(Boolean);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const inst = (parts, list, shadow, tiltK = 0) => parts.map(p => { const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
      list.forEach((t, i) => { e.set(tiltK ? Math.sin(t[4] * 7) * tiltK : 0, t[4], tiltK ? Math.cos(t[4] * 5) * tiltK : 0); qt.setFromEuler(e); v.set(t[0], t[1], t[2]); sc.setScalar(t[3]); m4.compose(v, qt, sc); im.setMatrixAt(i, m4); im.setColorAt(i, col.setScalar(t[5])); });
      im.castShadow = shadow; im.receiveShadow = true; im.matrixAutoUpdate = false; im.computeBoundingSphere(); this.group.add(im); return im; });
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pick = (set) => set[Math.floor(rnd() * set.length)];
    this.count = 0; this.glb = true;
    const pack = (list) => { const by = new Map(); for (const t of list) { const key = t.m; if (!by.has(key)) by.set(key, []); by.get(key).push([t[0], t[1], t[2], t[3], t[4], t[5]]); } return by; };
    for (const s of secs.values()) {
      const S = { cx: s.cx, cz: s.cz, hi: [], lo: [], far: [], near: [], mid: [], grass: [] };
      const trees = new Map(); const add = (set, t, dry) => { const cold = !dry && set === CONIF && t[1] > 82; const f = dry ? PALM : cold ? SNOWY : set; if (!f.length) return; const m = f[(Math.abs(Math.floor(s.cx * 0.13 + s.cz * 0.29)) + Math.floor(rnd() * 3)) % f.length]; const k = f.indexOf(m) + FAMS.indexOf(f) * 100; if (!trees.has(k)) trees.set(k, { m, list: [] }); const sc = t[3] * (0.82 + rnd() * rnd() * 0.62), rr = (m.cluster ? m.hi.w * 0.36 : Math.max(0.5, m.hi.w * 0.08)) * sc; let y = world.heightAt(t[0], t[2]); for (let q = 0; q < 6; q++) y = Math.min(y, world.heightAt(t[0] + Math.cos(q * 1.047) * rr, t[2] + Math.sin(q * 1.047) * rr)); trees.get(k).list.push([t[0], y - 0.3 * sc, t[2], sc, t[4], 0.88 + rnd() * 0.2]); };
      // biomes: dead trees in the Dead Sector and on bare dirt, palms on the dry coast, old twisted giants in Ashwood, birches in the mixed woods
      const biome = (t) => { const dd = Math.hypot(t[0] - dust.x, t[2] - dust.z), dirt = world.splatAt(t[0], t[2], 1) > 150; if (dd < 300 || (dirt && t[1] > 6)) return rnd() < 0.75 ? DEAD : BROAD; if (dirt || t[1] < 4.5) return PALM; if (Math.hypot(t[0] - forest.x, t[2] - forest.z) < forest.r && rnd() < 0.22) return OLD; return null; };
      for (const t of s.oak) { const f = biome(t); add(f || BROAD, t, false); } for (const t of s.oak2) { const f = biome(t); add(f || (rnd() < 0.65 ? BIRCH : BROAD), t, false); } for (const t of s.pine) { const f = biome(t); add(f === DEAD || f === PALM ? f : CONIF, t, false); }
      for (const t of s.street || []) { const f = t[6] === 'park' ? BROAD : STREET; if (!f.length) continue; const m = f[Math.floor(rnd() * f.length)], k = f.indexOf(m) + 700 + (t[6] === 'park' ? 50 : 0); if (!trees.has(k)) trees.set(k, { m, list: [] }); trees.get(k).list.push([t[0], t[1], t[2], t[3], t[4], 0.95 + rnd() * 0.1]); }
      for (const { m, list } of trees.values()) { this.count += list.length; S.hi.push(...inst(m.hi.parts, list, true)); S.lo.push(...inst((m.lo || m.hi).parts, list, false)); S.far.push(...inst([m.imp], list, false)); }
      // stumps and flowers: small ground dressing
      const deco = []; for (const t of [...s.oak, ...s.pine]) if (rnd() < 0.18) deco.push([t[0] + (rnd() - 0.5) * 4, 0, t[2] + (rnd() - 0.5) * 4, 0.7 + rnd() * 0.5, rnd() * 6.28, 1]);
      for (const d of deco) d[1] = world.heightAt(d[0], d[2]) - 0.02; if (STUMP.length) S.near.push(...inst(STUMP[0].parts, deco.slice(0, 3).map(d => [d[0], d[1], d[2], d[3] * 0.9, d[4], 1]), true));
      // grass tufts across the sector (instanced, culled by distance); flowers in the sunnier meadows
      const gl = GRASS.map(() => []), fl = [];
      for (let z = s.cz - 64; z < s.cz + 64; z += 3.2) for (let x = s.cx - 64; x < s.cx + 64; x += 3.2) {
        const px = x + (rnd() - 0.5) * 2.6, pz = z + (rnd() - 0.5) * 2.6; const hh = world.heightAt(px, pz); if (hh < 2.2 || hh > 90) continue;
        const veg = world.splatAt(px, pz, 3) / 255, road = world.surfaceAt(px, pz); if (road !== 'grass' && road !== 'dirt') continue; if (world.slopeAt(px, pz) > 0.6) continue;
        const r = rnd(); if (r < 0.07 * veg) gl[Math.floor(rnd() * GRASS.length)].push([px, hh - 0.02, pz, 0.8 + rnd() * 0.6, rnd() * 6.28, 0.85 + rnd() * 0.3]);
        else if (r < 0.2 * veg + 0.075 && FLOWERS.length) fl.push([px, hh - 0.01, pz, 0.9 + rnd() * 0.7, rnd() * 6.28, 1, TINT ? [0xffffff, 0xfff0a0, 0xffb0d8, 0xcdb4ff, 0xffa08c][Math.floor(rnd() * 5)] : 0xffffff]);
      }
      const BUSH = this._packBushes(); const bl = BUSH.map(() => []);
      for (const t of [...s.oak, ...s.oak2, ...s.pine]) { if (rnd() > 0.5) continue; const a = rnd() * 6.28, d = 1.6 + rnd() * 4.5, px = t[0] + Math.cos(a) * d, pz = t[2] + Math.sin(a) * d; const hh = world.heightAt(px, pz); if (hh < 2.3) continue; const sf = world.surfaceAt(px, pz); if (sf !== 'grass' && sf !== 'dirt') continue;
        bl[Math.floor(rnd() * BUSH.length)].push([px, hh - 0.05, pz, 0.55 + rnd() * 0.8, rnd() * 6.28, 0.9 + rnd() * 0.2]); }
      BUSH.forEach((B, i) => { if (bl[i].length) S.near.push(...inst(B.parts || [B], bl[i], true)); });
      // stylised boulders on slopes and outcrops, grouped by variant
      const ROCKS = this._packRocks(); const rl = ROCKS.map(() => []);
      for (let q = 0; q < 6; q++) { const px = s.cx + (rnd() - 0.5) * 120, pz = s.cz + (rnd() - 0.5) * 120; const hh = world.heightAt(px, pz); if (hh < 2.5 || hh > 120) continue; if (world.slopeAt(px, pz) < 0.22 && rnd() < 0.7) continue; { const sf = world.surfaceAt(px, pz); if (sf !== 'grass' && sf !== 'dirt' && sf !== 'rock' && sf !== 'sand') continue; } // natural ground only
        const sz = 0.6 + rnd() * 1.6; rl[Math.floor(rnd() * ROCKS.length)].push([px, hh - 0.1 * sz, pz, sz, rnd() * 6.28, 0.9 + rnd() * 0.2]); }
      ROCKS.forEach((R, i) => { if (rl[i].length) S.mid.push(...inst(R.parts || [R], rl[i], true, 0.08)); });
      GRASS.forEach((g, i) => { if (gl[i] && gl[i].length) S.grass.push(...inst(g.parts, gl[i], false)); });
      if (FLOWERS.length && fl.length) { const per = FLOWERS.map(() => []); for (const f of fl) per[Math.floor(rnd() * FLOWERS.length)].push(f); FLOWERS.forEach((F2, i) => { if (per[i].length) S.grass.push(...inst(F2.parts, per[i], false)); }); }
      // forest floor: ferns, mushrooms and leaf litter around tree trunks
      if (FLOOR.length) { const ff = FLOOR.map(() => []); for (const t of [...s.oak, ...s.oak2, ...s.pine]) { if (rnd() > 0.55) continue; const a = rnd() * 6.28, d = 0.8 + rnd() * 2.6, px = t[0] + Math.cos(a) * d, pz = t[2] + Math.sin(a) * d, hh = world.heightAt(px, pz); if (hh < 2.4) continue;
          const sf = world.surfaceAt(px, pz); if (sf !== 'grass' && sf !== 'dirt') continue; const i = Math.floor(rnd() * FLOOR.length); ff[i].push([px, hh - 0.02, pz, 0.7 + rnd() * 0.7, rnd() * 6.28, 0.9 + rnd() * 0.2]); }
        FLOOR.forEach((F2, i) => { if (ff[i].length) S.near.push(...inst(F2.parts, ff[i], false)); }); }
      this.sectors.push(S);
    }
    this._grassCount = this.sectors.reduce((n, S) => n + S.grass.length, 0);
  }

  // Dense grass field that follows the camera: one draw call of instanced blade clumps (real geometry, no alpha cards).
  // Position, height and colour come from the terrain height / splat textures in the vertex shader; the root colour is
  // the terrain's own grass palette, so the field melts into the ground and fades out with distance.
  _grass(heightTex, splatTex, count, TILE) {
    const { gfx } = this.G; const R = new RNG(77);
    const P = [], N = [], S = [], I = []; let v = 0;
    for (let b = 0; b < 4; b++) { const a = b * 1.57 + R.range(-0.5, 0.5), ox = Math.cos(a) * R.range(0.03, 0.16), oz = Math.sin(a) * R.range(0.03, 0.16), h = R.range(0.26, 0.46), w = R.range(0.026, 0.04), lean = R.range(0.05, 0.16);
      const cx = Math.cos(a + 1.57), cz = Math.sin(a + 1.57), lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
      const pt = (side, t, wk) => { P.push(ox + cx * w * side * wk + lx * t * t, h * t, oz + cz * w * side * wk + lz * t * t); N.push(0, 1, 0); S.push(t); };
      pt(-1, 0, 1); pt(1, 0, 1); pt(-1, 0.5, 0.75); pt(1, 0.5, 0.75); pt(0, 1, 0); I.push(v, v + 1, v + 3, v, v + 3, v + 2, v + 2, v + 3, v + 4); v += 5; }
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('sway', new THREE.Float32BufferAttribute(S, 1)); g.setIndex(I);
    const off = new Float32Array(count * 3); for (let i = 0; i < count; i++) { off[i * 3] = R.f() * TILE; off[i * 3 + 1] = R.f() * TILE; off[i * 3 + 2] = R.f(); }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); g.instanceCount = count;
    this.grassU = { uCam: { value: new THREE.Vector3() }, tHeight: { value: heightTex }, tSplatG: { value: splatTex } };
    const mat = gfx.std({ roughness: 0.82, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.25 }, 'grassfield', (s) => {
      s.uniforms.uTime = gfx.uTime; Object.assign(s.uniforms, this.grassU);
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
        attribute vec3 aOff; attribute float sway; uniform vec3 uCam; uniform float uTime; uniform sampler2D tHeight, tSplatG; varying vec3 vGrassCol;
        float gth(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gnz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(gth(i), gth(i+vec2(1,0)), f.x), mix(gth(i+vec2(0,1)), gth(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
        const float TILE = ${TILE.toFixed(1)};
        vec2 wp = mod(aOff.xy - uCam.xz, TILE) - TILE * 0.5 + uCam.xz; float rnd = aOff.z;
        float ca = cos(rnd * 6.283), sa = sin(rnd * 6.283);
        vec3 transformed = vec3(position.x * ca - position.z * sa, position.y, position.x * sa + position.z * ca);
        float gd = distance(wp, uCam.xz); float fade = 1.0 - smoothstep(TILE * 0.30, TILE * 0.48, gd);
        vec4 sp = texture2D(tSplatG, wp / 2048.0 + 0.5 + 0.5 / 1024.0);
        float gh = texture2D(tHeight, (wp + 1024.0) / 2048.0 * (1024.0 / 1025.0) + 0.5 / 1025.0).r;
        float veg = sp.a * (1.0 - smoothstep(0.15, 0.4, sp.r)) * (1.0 - smoothstep(0.15, 0.4, sp.b)) * (1.0 - smoothstep(0.3, 0.6, sp.g));
        float macro = gnz(wp * 0.011) * 0.6 + gnz(wp * 0.047) * 0.4;
        float patchN = 0.55 + 0.45 * gnz(wp * 0.09 + 5.0);
        float keep = step(fract(rnd * 7.31), veg * patchN * 1.25) * step(2.3, gh) * step(gh, 96.0);
        float gs = (0.75 + fract(rnd * 3.7) * 0.7) * fade * keep;
        transformed *= vec3(gs, gs * (0.75 + fract(rnd * 5.3) * 0.75 + macro * 0.3), gs);
        float wv = sin(uTime * 1.7 + wp.x * 0.33 + wp.y * 0.27) * 0.6 + sin(uTime * 3.3 + wp.x * 1.3 + rnd * 6.0) * 0.25;
        transformed.x += wv * 0.14 * sway * sway; transformed.z += wv * 0.08 * sway * sway;
        transformed.xz += wp; transformed.y += gh - 0.03;
        // the terrain's grass palette at the root, sunlit yellow-green towards the tip
        vec3 gpal = mix(vec3(0.075, 0.255, 0.05), vec3(0.185, 0.40, 0.07), macro); gpal = mix(gpal, vec3(0.29, 0.40, 0.09), smoothstep(0.5, 0.8, gnz(wp * 0.006 + 3.0)) * 0.55);
        vGrassCol = mix(gpal * 0.86, gpal * vec3(1.42, 1.34, 1.2) + vec3(0.02, 0.035, 0.0), sway) * (0.9 + fract(rnd * 9.1) * 0.22);`);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;').replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassCol;');
    });
    const mesh = this.grass = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
    this.G.gfx.scene.add(mesh);
  }

  update(cam, force) {
    if (this.grassU) this.grassU.uCam.value.copy(cam);
    this._t++; if (!force && this._t % 12) return;
    const q = this.G.gfx.q;
    for (const s of this.sectors) {
      const d = Math.hypot(cam.x - s.cx, cam.z - s.cz);
      if (this.glb) { const hiD = q.treeHi * 0.32 + 45, loD = hiD + 210; const hi = d < hiD, lo = !hi && d < loD, far = !hi && !lo && d < q.treeFar; for (const m of s.hi) m.visible = hi; for (const m of s.lo) m.visible = lo; for (const m of s.far) m.visible = far; for (const m of s.near) m.visible = d < q.treeHi * 0.45 + 90; for (const m of s.mid) m.visible = d < q.treeFar * 0.45; const gd = d < (this.G.gfx.q.grass > 40000 ? 110 : 80); for (const m of s.grass) m.visible = gd; continue; }
      const hi = d < q.treeHi + 90, lo = !hi && d < q.treeFar;
      for (const m of s.hi) m.visible = hi; for (const m of s.lo) m.visible = lo;
      for (const m of s.near) m.visible = d < q.treeHi + 60; for (const m of s.mid) m.visible = d < q.treeFar * 0.7;
    }
  }
}
