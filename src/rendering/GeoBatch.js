import { realTex } from './RealTex.js';
// Batches thousands of boxes / prisms / cylinders into one mesh per material and
// registers matching collision boxes. Buildings and props are authored through this.
import * as THREE from 'three';
import { MAT } from '../physics/Colliders.js';

const _c = new THREE.Color();
// material that the day-night controller brightens after dusk
export const NIGHT_LIGHTS = { mat: null, u: { value: 0 } };
const MAT_KIND = { wood: MAT.WOOD, woodDark: MAT.WOOD, metal: MAT.METAL, steel: MAT.METAL, container: MAT.METAL, glass: MAT.GLASS, glassLit: MAT.GLASS, parquet: MAT.WOOD, stairwood: MAT.WOOD, tower: MAT.METAL, glow: MAT.METAL, holo: MAT.GLASS, fabric: MAT.DIRT, sandbag: MAT.DIRT, hay: MAT.DIRT };

export class GeoBatch {
  constructor(colliders, world) {
    this.col = colliders; this.world = world; this.groups = new Map();
    this.ox = 0; this.oy = 0; this.oz = 0; this.rot = 0;
  }
  origin(ox, oy, oz, rot = 0) { this.ox = ox; this.oy = oy; this.oz = oz; this.rot = ((rot % 4) + 4) % 4; return this; }
  _g(mat) { let g = this.groups.get(mat); if (!g) this.groups.set(mat, g = { p: [], n: [], u: [], c: [], i: [], nv: 0 }); return g; }
  wx(x, z) { const r = this.rot; return this.ox + (r === 0 ? x : r === 1 ? z : r === 2 ? -x : -z); }
  wz(x, z) { const r = this.rot; return this.oz + (r === 0 ? z : r === 1 ? -x : r === 2 ? -z : x); }
  _v(g, x, y, z, nx, ny, nz, u, v, col) {
    const r = this.rot;
    g.p.push(this.wx(x, z), this.oy + y, this.wz(x, z));
    g.n.push(r === 0 ? nx : r === 1 ? nz : r === 2 ? -nx : -nz, ny, r === 0 ? nz : r === 1 ? -nx : r === 2 ? -nz : nx);
    g.u.push(u, v); g.c.push(col.r, col.g, col.b); return g.nv++;
  }
  toWorld(x, y, z) { return [this.wx(x, z), this.oy + y, this.wz(x, z)]; }
  worldYaw(yaw) { return yaw + this.rot * Math.PI / 2; }

  // Axis aligned box given by min/max corners (local space). opt: {c:false} no collider, {soft}, {nobullet}, {shade} colour multiplier, {bottom}
  box(mat, x0, y0, z0, x1, y1, z1, color = 0xffffff, opt = null) {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; } if (y1 < y0) { const t = y0; y0 = y1; y1 = t; } if (z1 < z0) { const t = z0; z0 = z1; z1 = t; }
    if (mat) {
      const g = this._g(mat); _c.set(color); if (opt && opt.shade) _c.multiplyScalar(opt.shade);
      const q = (a, b, c2, d) => { g.i.push(a, b, c2, a, c2, d); };
      let a, b, c, d;
      // +X
      a = this._v(g, x1, y0, z1, 1, 0, 0, -z1, y0, _c); b = this._v(g, x1, y0, z0, 1, 0, 0, -z0, y0, _c); c = this._v(g, x1, y1, z0, 1, 0, 0, -z0, y1, _c); d = this._v(g, x1, y1, z1, 1, 0, 0, -z1, y1, _c); q(a, b, c, d);
      // -X
      a = this._v(g, x0, y0, z0, -1, 0, 0, z0, y0, _c); b = this._v(g, x0, y0, z1, -1, 0, 0, z1, y0, _c); c = this._v(g, x0, y1, z1, -1, 0, 0, z1, y1, _c); d = this._v(g, x0, y1, z0, -1, 0, 0, z0, y1, _c); q(a, b, c, d);
      // +Z
      a = this._v(g, x0, y0, z1, 0, 0, 1, x0, y0, _c); b = this._v(g, x1, y0, z1, 0, 0, 1, x1, y0, _c); c = this._v(g, x1, y1, z1, 0, 0, 1, x1, y1, _c); d = this._v(g, x0, y1, z1, 0, 0, 1, x0, y1, _c); q(a, b, c, d);
      // -Z
      a = this._v(g, x1, y0, z0, 0, 0, -1, -x1, y0, _c); b = this._v(g, x0, y0, z0, 0, 0, -1, -x0, y0, _c); c = this._v(g, x0, y1, z0, 0, 0, -1, -x0, y1, _c); d = this._v(g, x1, y1, z0, 0, 0, -1, -x1, y1, _c); q(a, b, c, d);
      // +Y
      a = this._v(g, x0, y1, z1, 0, 1, 0, x0, z1, _c); b = this._v(g, x1, y1, z1, 0, 1, 0, x1, z1, _c); c = this._v(g, x1, y1, z0, 0, 1, 0, x1, z0, _c); d = this._v(g, x0, y1, z0, 0, 1, 0, x0, z0, _c); q(a, b, c, d);
      if (opt && opt.bottom) { a = this._v(g, x0, y0, z0, 0, -1, 0, x0, z0, _c); b = this._v(g, x1, y0, z0, 0, -1, 0, x1, z0, _c); c = this._v(g, x1, y0, z1, 0, -1, 0, x1, z1, _c); d = this._v(g, x0, y0, z1, 0, -1, 0, x0, z1, _c); q(a, b, c, d); }
    }
    if (!opt || opt.c !== false) {
      const ax = this.wx(x0, z0), bx = this.wx(x1, z1), az = this.wz(x0, z0), bz = this.wz(x1, z1);
      return this.col.add(Math.min(ax, bx), this.oy + y0, Math.min(az, bz), Math.max(ax, bx), this.oy + y1, Math.max(az, bz), (opt && opt.mat !== undefined) ? opt.mat : (MAT_KIND[mat] || 0), opt);
    }
    return null;
  }

  // Arbitrary quad (local space, CCW seen from the front). Visual only.
  quad(mat, p0, p1, p2, p3, color = 0xffffff, twoSided = false) {
    const g = this._g(mat); _c.set(color);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
    const a = this._v(g, p0[0], p0[1], p0[2], nx, ny, nz, 0, 0, _c), b = this._v(g, p1[0], p1[1], p1[2], nx, ny, nz, lu, 0, _c), c = this._v(g, p2[0], p2[1], p2[2], nx, ny, nz, lu, lv, _c), d = this._v(g, p3[0], p3[1], p3[2], nx, ny, nz, 0, lv, _c);
    g.i.push(a, b, c, a, c, d);
    if (twoSided) {
      const a2 = this._v(g, p0[0], p0[1], p0[2], -nx, -ny, -nz, 0, 0, _c), b2 = this._v(g, p1[0], p1[1], p1[2], -nx, -ny, -nz, lu, 0, _c), c2 = this._v(g, p2[0], p2[1], p2[2], -nx, -ny, -nz, lu, lv, _c), d2 = this._v(g, p3[0], p3[1], p3[2], -nx, -ny, -nz, 0, lv, _c);
      g.i.push(a2, c2, b2, a2, d2, c2);
    }
  }
  tri(mat, p0, p1, p2, color = 0xffffff) {
    const g = this._g(mat); _c.set(color);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const a = this._v(g, p0[0], p0[1], p0[2], nx, ny, nz, p0[0] + p0[2], p0[1], _c), b = this._v(g, p1[0], p1[1], p1[2], nx, ny, nz, p1[0] + p1[2], p1[1], _c), c = this._v(g, p2[0], p2[1], p2[2], nx, ny, nz, p2[0] + p2[2], p2[1], _c);
    g.i.push(a, b, c);
  }

  // Box rotated by an arbitrary yaw about its centre (visual only unless opt.c -> conservative AABB collider)
  boxR(mat, cx, cy, cz, sx, sy, sz, yaw, color = 0xffffff, opt = null) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, co = Math.cos(yaw), si = Math.sin(yaw);
    const P = (x, y, z) => [cx + x * co + z * si, cy + y, cz - x * si + z * co];
    const A = P(-hx, -hy, hz), B = P(hx, -hy, hz), C = P(hx, -hy, -hz), D = P(-hx, -hy, -hz), E = P(-hx, hy, hz), F = P(hx, hy, hz), G = P(hx, hy, -hz), H = P(-hx, hy, -hz);
    this.quad(mat, A, B, F, E, color); this.quad(mat, B, C, G, F, color); this.quad(mat, C, D, H, G, color); this.quad(mat, D, A, E, H, color); this.quad(mat, E, F, G, H, color);
    if (opt && opt.c) { const r = Math.max(hx, hz) * 0.85; this.box(null, cx - r, cy - hy, cz - r, cx + r, cy + hy, cz + r, 0, { mat: MAT_KIND[mat] || 0 }); }
  }

  // Vertical cylinder / cone frustum. opt: {c:true collider, r2: top radius, cap:false}
  cyl(mat, cx, y0, cz, r, h, color = 0xffffff, segs = 12, opt = null) {
    const g = this._g(mat); _c.set(color); const r2 = opt && opt.r2 !== undefined ? opt.r2 : r; const base = [];
    for (let s = 0; s <= segs; s++) {
      const a = s / segs * Math.PI * 2, co = Math.cos(a), si = Math.sin(a); const u = a * r;
      base.push(this._v(g, cx + co * r, y0, cz + si * r, co, 0, si, u, y0, _c), this._v(g, cx + co * r2, y0 + h, cz + si * r2, co, 0, si, u, y0 + h, _c));
    }
    for (let s = 0; s < segs; s++) { const a = base[s * 2], b = base[s * 2 + 1], c = base[s * 2 + 3], d = base[s * 2 + 2]; g.i.push(a, b, c, a, c, d); }
    if (!opt || opt.cap !== false) {
      const ctr = this._v(g, cx, y0 + h, cz, 0, 1, 0, cx, cz, _c); const ring = [];
      for (let s = 0; s <= segs; s++) { const a = s / segs * Math.PI * 2; ring.push(this._v(g, cx + Math.cos(a) * r2, y0 + h, cz + Math.sin(a) * r2, 0, 1, 0, cx + Math.cos(a) * r2, cz + Math.sin(a) * r2, _c)); }
      for (let s = 0; s < segs; s++) g.i.push(ctr, ring[s + 1], ring[s]);
    }
    if (opt && opt.c) { const k = r * 0.8; this.box(null, cx - k, y0, cz - k, cx + k, y0 + h, cz + k, 0, { mat: MAT_KIND[mat] || 0 }); }
  }
  // Horizontal cylinder along local X (axis='x') or Z
  cylH(mat, x0, y, z0, len, r, axis = 'x', color = 0xffffff, segs = 10) {
    const g = this._g(mat); _c.set(color); const base = [];
    for (let s = 0; s <= segs; s++) {
      const a = s / segs * Math.PI * 2, co = Math.cos(a), si = Math.sin(a); const u = a * r;
      if (axis === 'x') base.push(this._v(g, x0, y + co * r, z0 + si * r, 0, co, si, u, 0, _c), this._v(g, x0 + len, y + co * r, z0 + si * r, 0, co, si, u, len, _c));
      else base.push(this._v(g, x0 + si * r, y + co * r, z0, si, co, 0, u, 0, _c), this._v(g, x0 + si * r, y + co * r, z0 + len, si, co, 0, u, len, _c));
    }
    for (let s = 0; s < segs; s++) { const a = base[s * 2], b = base[s * 2 + 1], c = base[s * 2 + 3], d = base[s * 2 + 2]; if (axis === 'x') g.i.push(a, c, b, a, d, c); else g.i.push(a, b, c, a, c, d); }
  }

  // Gabled roof over a rectangle. ridge runs along 'x' or 'z'. Returns nothing; adds gable-end triangles in wallMat.
  gable(roofMat, wallMat, x0, z0, x1, z1, y, rise, ridge = 'x', roofColor = 0xffffff, wallColor = 0xffffff, over = 0.45) {
    if (ridge === 'x') {
      const zm = (z0 + z1) / 2, e = over, s = rise / ((z1 - z0) / 2); const yo = y - e * s;
      this.quad(roofMat, [x0 - e, yo, z1 + e], [x1 + e, yo, z1 + e], [x1 + e, y + rise, zm], [x0 - e, y + rise, zm], roofColor);
      this.quad(roofMat, [x1 + e, yo, z0 - e], [x0 - e, yo, z0 - e], [x0 - e, y + rise, zm], [x1 + e, y + rise, zm], roofColor);
      this.tri(wallMat, [x0, y, z0], [x0, y, z1], [x0, y + rise, zm], wallColor); this.tri(wallMat, [x1, y, z1], [x1, y, z0], [x1, y + rise, zm], wallColor);
    } else {
      const xm = (x0 + x1) / 2, e = over, s = rise / ((x1 - x0) / 2); const yo = y - e * s;
      this.quad(roofMat, [x1 + e, yo, z1 + e], [x1 + e, yo, z0 - e], [xm, y + rise, z0 - e], [xm, y + rise, z1 + e], roofColor);
      this.quad(roofMat, [x0 - e, yo, z0 - e], [x0 - e, yo, z1 + e], [xm, y + rise, z1 + e], [xm, y + rise, z0 - e], roofColor);
      this.tri(wallMat, [x0, y, z1], [x1, y, z1], [xm, y + rise, z1], wallColor); this.tri(wallMat, [x1, y, z0], [x0, y, z0], [xm, y + rise, z0], wallColor);
    }
    this.box(null, x0, y, z0, x1, y + rise * 0.45, z1, 0, { mat: MAT_KIND[roofMat] || 0 });
  }

  // place a GLB model fitted into a local-space box (returns false when the asset is unavailable)
  prop(key, x0, y0, z0, x1, y1, z1, opt = null) {
    if (!this.props || !this.props.has(key)) return false;
    const ax = this.wx(x0, z0), bx = this.wx(x1, z1), az = this.wz(x0, z0), bz = this.wz(x1, z1);
    this.props.add(key, Math.min(ax, bx), this.oy + y0, Math.min(az, bz), Math.max(ax, bx), this.oy + y1, Math.max(az, bz), { region: (this.region || 'world') + (opt && opt.out ? '' : ':in'), shadow: !!(opt && opt.out), yaw: ((opt && opt.yaw) || 0) + (opt && opt.fixed ? this.rot : 0), uniform: !!(opt && opt.uniform), fixed: !!(opt && opt.fixed) });
    return true;
  }
  loot(x, y, z, tier = 1) { const p = this.toWorld(x, y, z); this.world.lootSpots.push({ x: p[0], y: p[1], z: p[2], tier }); }

  // Emit meshes (one per material) and reset.
  build(parent, mats, name = 'batch') {
    const out = [];
    for (const [key, g] of this.groups) {
      if (!g.nv) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
      geo.setIndex(g.nv > 65535 ? new THREE.Uint32BufferAttribute(g.i, 1) : new THREE.Uint16BufferAttribute(g.i, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, mats[key] || mats.concrete); m.name = name + ':' + key;
      m.castShadow = key !== 'glass' && key !== 'glassLit' && key !== 'holo' && key !== 'glow'; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      if (key === 'glass') m.renderOrder = 2;
      parent.add(m); out.push(m);
    }
    this.groups.clear();
    return out;
  }
}

// Shared PBR material library for the built world.
const FILL = (k) => (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ' + k.toFixed(2) + ';'); };
const STYL = (flat = 0.55, gain = 1.12) => (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv ); vec3 stAvg = textureLod( map, vMapUv, 9.0 ).rgb;
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, stAvg, ${flat.toFixed(2)} ) * ${gain.toFixed(2)}; diffuseColor *= sampledDiffuseColor;
#endif`); };
export function buildMaterials(gfx, T) {
  const S = (tex, p = {}) => gfx.std({ map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true, roughness: 0.9, metalness: 0, ...p });
  const M = {
    concrete: gfx.std({ ...realTex('concrete', 4, gfx.renderer), color: new THREE.Color(1.55, 1.55, 1.55), normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true, roughness: 1, metalness: 0 }, 'styl_concrete', STYL(0.6, 1.05)),
    brick: gfx.std({ ...realTex('brick', 3.2, gfx.renderer), color: new THREE.Color(0.78, 0.76, 0.74), normalScale: new THREE.Vector2(0.55, 0.55), vertexColors: true, roughness: 1, metalness: 0 }, 'styl_brick', STYL(0.5, 1.3)),
    plaster: gfx.std({ ...realTex('plaster', 4, gfx.renderer), normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 1, metalness: 0 }, 'styl_plaster', STYL(0.6, 1.12)),
    wood: gfx.std({ ...realTex('wood', 2.4, gfx.renderer), color: new THREE.Color(1.35, 1.3, 1.25), normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 1, metalness: 0 }, 'styl_wood', STYL(0.5, 1.4)),
    metal: gfx.std({ ...realTex('metal', 3, gfx.renderer), normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, roughness: 1, metalness: 0.35 }, 'styl_metal', STYL(0.55, 1.1)),
    steel: S(T.steel, { roughness: 0.5, metalness: 0.45 }),
    container: S(T.container, { roughness: 0.6, metalness: 0.4 }),
    roof: gfx.std({ ...realTex('roof', 3, gfx.renderer), color: new THREE.Color(1.9, 1.85, 1.8), normalScale: new THREE.Vector2(0.9, 0.9), vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }, 'styl_roof', STYL(0.5, 1.1)),
    fabric: S(T.fabric, { roughness: 0.95 }),
    asphalt: gfx.std({ ...realTex('asphalt', 4, gfx.renderer), normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, roughness: 1, metalness: 0 }, 'styl_asphalt', STYL(0.5, 1.0)),
    glass: gfx.std({ color: 0x9fc0cc, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.32, envMapIntensity: 2.2, vertexColors: true, depthWrite: false }),
    // megatower curtain wall: procedural window grid in world space; a share of the windows is lit (more after dusk), with dead blocks from war damage
    tower: gfx.std({ ...realTex('cladding', 6, gfx.renderer), normalScale: new THREE.Vector2(0.3, 0.3), vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 1.3 }, 'nx_tower2', (sh) => { sh.uniforms.uTwNight = NIGHT_LIGHTS.u;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTwP; varying vec3 vTwN;').replace('#include <project_vertex>', '#include <project_vertex>\nvTwP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTwN = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTwP; varying vec3 vTwN; uniform float uTwNight; vec3 twGlow; float twM;').replace('#include <color_fragment>', `#include <color_fragment>
        // light cladding frame (photo texture, lightly tinted by the tower colour) around real-looking glass:
        // each pane mirrors a sky gradient along the reflected view ray, so towers read as glass instead of black slabs
        twGlow = vec3(0.0); twM = 0.0; diffuseColor.rgb = diffuseColor.rgb / max(vColor.rgb, vec3(0.05)) * mix(vec3(1.0), vColor.rgb * 1.6, 0.3) * 1.75;
        { vec3 an = abs(vTwN); if (an.y < 0.6) { float u = an.x > an.z ? vTwP.z : vTwP.x; vec2 g = vec2(u / 3.2, vTwP.y / 3.6); vec2 c = floor(g), f = fract(g);
          vec2 aa2 = fwidth(g) * 1.2; float m = smoothstep(0.06 - aa2.x, 0.06 + aa2.x, f.x) * smoothstep(0.94 + aa2.x, 0.94 - aa2.x, f.x) * smoothstep(0.1 - aa2.y, 0.1 + aa2.y, f.y) * smoothstep(0.9 + aa2.y, 0.9 - aa2.y, f.y);
          float r1 = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453), r2 = fract(r1 * 91.7); float far = smoothstep(350.0, 800.0, distance(vTwP, cameraPosition)); m = mix(m, 0.78, far);
          vec3 V = normalize(cameraPosition - vTwP), Rf = reflect(-V, normalize(vTwN)); float day = 1.0 - uTwNight * 0.88;
          vec3 sky = mix(vec3(0.66, 0.76, 0.86), vec3(0.2, 0.42, 0.74), clamp(Rf.y * 1.4 + 0.25, 0.0, 1.0)); sky = mix(sky, vec3(0.1, 0.16, 0.22), smoothstep(0.0, -0.5, Rf.y));
          vec3 glass = sky * (0.86 + 0.2 * r2) * mix(vec3(1.0), vColor.rgb * 1.5, 0.25);
          float blk = step(0.34, fract(sin(dot(floor(c / vec2(5.0, 7.0)), vec2(41.3, 17.9))) * 9731.1)); float th = 0.95 - uTwNight * 0.36; float lit = smoothstep(th - 0.02, th + 0.02, r1) * blk;
          vec3 wc = r2 < 0.8 ? vec3(1.0, 0.82, 0.55) : vec3(0.75, 0.9, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass * 0.55 * day + vec3(0.012, 0.016, 0.022), m); twM = m;
          twGlow = glass * 0.34 * day * m + wc * m * lit * (0.25 + 0.8 * uTwNight) * (0.6 + 0.4 * r2); } }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, twM);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += twGlow;'); }),
    // neon / fire / energy: glows in its own vertex colour
    glow: gfx.std({ vertexColors: true, roughness: 0.6, metalness: 0 }, 'nx_glow', (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 3.4;'); }),
    // holographic billboard: scanlines and flickering blocks
    holo: gfx.std({ vertexColors: true, roughness: 1, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide }, 'nx_holo', (sh) => { sh.uniforms.uTime = gfx.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHoP;').replace('#include <project_vertex>', '#include <project_vertex>\nvHoP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHoP; uniform float uTime; vec3 holoG;').replace('#include <color_fragment>', `#include <color_fragment>
        { float hs = 0.6 + 0.4 * sin(vHoP.y * 9.0 - uTime * 6.0); vec2 hc = floor(vec2((vHoP.x + vHoP.z) / 1.4, vHoP.y / 1.4)); float hb = step(0.45, fract(sin(dot(hc + floor(uTime * 0.7), vec2(12.9, 78.2))) * 43758.5));
          holoG = diffuseColor.rgb * (0.4 + 1.9 * hb) * hs * (0.85 + 0.15 * sin(uTime * 23.0)); diffuseColor.a = 0.5 + 0.35 * hb; diffuseColor.rgb *= 0.12; }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += holoG * 2.2;'); }),
    // interiors: bounce-light approximation (a share of the surface colour is added back as ambient)
    parquet: gfx.std({ ...realTex('woodfloor', 2.2, gfx.renderer), color: new THREE.Color(1.45, 1.4, 1.35), normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, roughness: 1, metalness: 0 }, 'int_parquet2', FILL(0.5)),
    paint: gfx.std({ vertexColors: true, roughness: 0.92, metalness: 0 }, 'int_paint', FILL(0.55)),
    // interior floor tiles: clean procedural grid in world space (no photo texture), lightly glossy
    tile: gfx.std({ vertexColors: true, roughness: 0.42, metalness: 0 }, 'int_tile', (sh) => { FILL(0.5)(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTileP;').replace('#include <project_vertex>', '#include <project_vertex>\nvTileP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTileP;').replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 tq = vTileP.xz / 0.6; vec2 tf = abs(fract(tq) - 0.5); float grout = smoothstep(0.47, 0.49, max(tf.x, tf.y)); vec2 ti = floor(tq); float chk = mod(ti.x + ti.y, 2.0);
          float tv = fract(sin(dot(ti, vec2(12.9898, 78.233))) * 43758.5453); diffuseColor.rgb *= (0.93 + 0.07 * chk) * (0.96 + 0.06 * tv) * (1.0 - 0.3 * grout); }`); }),
    stairwood: gfx.std({ ...realTex('wood', 2.4, gfx.renderer), color: new THREE.Color(1.3, 1.25, 1.2), vertexColors: true, roughness: 1, metalness: 0 }, 'int_stair2', FILL(0.45)),
    glassLit: (NIGHT_LIGHTS.mat = gfx.std({ color: 0xb9ad94, roughness: 0.55, metalness: 0, emissive: 0xffb45e, emissiveIntensity: 0, vertexColors: true })),
    emissive: gfx.std({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 2.5, vertexColors: true }),
    neon: gfx.std({ color: 0x6fe9ff, emissive: 0x3fd8ff, emissiveIntensity: 3.2, roughness: 0.3, vertexColors: true }),
  };
  M.asphalt.map.repeat.set(1 / 4, 1 / 4); M.asphalt.normalMap.repeat.set(1 / 4, 1 / 4);
  M.asphalt.map.wrapS = M.asphalt.map.wrapT = M.asphalt.normalMap.wrapS = M.asphalt.normalMap.wrapT = THREE.RepeatWrapping;
  return M;
}
