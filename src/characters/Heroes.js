// The four playable heroes. Each is a rigged model with a hand-made look: every named material is repainted from the
// hero's palette (with its own metalness / roughness), accent parts glow, a rim light in the hero's colour outlines the
// silhouette, and a scan line sweeps up the body when the hero is chosen or deploys. A glowing ring marks the hero on
// the menu.
import * as THREE from 'three';

// palette entry: [colour, metalness, roughness, glow?]  (glow: 'g' strong pulsing light, 'a' soft accent light)
export const HEROES = [
  { id: 'ghost', name: 'GHOST', role: 'RECON SPECIALIST', blurb: 'Prototype exo-suit: white ceramic plate over a navy weave, cyan power lines.', key: 'single/hero', accent: 0x2fd6ff,
    pal: { SciFi_Light: [0xeef2f5, 0.5, 0.28], SciFi_Main: [0x1f2a38, 0.35, 0.45], SciFi_MainDark: [0x10161e, 0.3, 0.55], SciFi_Light_Accent: [0x2fd6ff, 0, 0.3, 'g'], Grey: [0x2a3036, 0.55, 0.4] } },
  { id: 'raven', name: 'RAVEN', role: 'INFILTRATOR', blurb: 'Night-silk hood, violet leathers, polished silver and gold fittings.', key: 'people_f/hooded_adventurer_free_model', accent: 0xa45cff,
    pal: { Black: [0x17131f, 0, 0.72], Metal: [0xc9d0da, 0.9, 0.24], Metal_Dark: [0x3b3448, 0.75, 0.32], Brown2: [0x3b2752, 0, 0.66], LightBrown: [0x6c3fb0, 0.05, 0.55], DarkBrown: [0x22172e, 0, 0.7], Gold: [0xe8b45a, 0.95, 0.22, 'a'], White: [0xf2eaff, 0, 0.55], Brown: [0x281d33, 0, 0.72] } },
  { id: 'vanguard', name: 'VANGUARD', role: 'ASSAULT', blurb: 'Navy heavy plate, matte black webbing and a gold heads-up visor.', key: 'enemies/swat_enemy', accent: 0xffb02e,
    pal: { Swat: [0x2b3a55, 0.45, 0.38], Swat_Black: [0x14171c, 0.2, 0.6], Visor: [0xffb02e, 0.2, 0.12, 'g'] } },
  { id: 'sable', name: 'SABLE', role: 'MARKSMAN', blurb: 'Crimson armour, black under-suit, platinum hair. Calm under fire.', key: 'enemies/soldier', accent: 0xff3b46,
    pal: { Black: [0x111114, 0.15, 0.58], Swat: [0x9b1f2a, 0.45, 0.36], Grey: [0x2a2a30, 0.5, 0.42], Hair_Brown: [0xece6de, 0, 0.5], Brown: [0x1e1517, 0, 0.7] } },
];
export const heroIndex = (i) => Math.max(0, Math.min(HEROES.length - 1, i | 0));

// one material set per hero, shared by every use of that hero
const CACHE = new Map();
function heroMaterials(G, H) {
  if (CACHE.has(H.id)) return CACHE.get(H.id);
  const U = { uRim: { value: new THREE.Color(H.accent) }, uScanT: { value: -100 }, uBaseY: { value: 0 }, uTime: G.gfx.uTime };
  const mats = new Map();
  const make = (src) => {
    if (mats.has(src.name)) return mats.get(src.name); const p = H.pal[src.name]; const m = src.clone(); m.userData.dz = false; m.name = src.name;
    if (p) { m.color.set(p[0]); m.metalness = p[1]; m.roughness = p[2]; if (m.map && !/Skin|Hair/i.test(src.name)) m.map = null; }
    else { m.metalness = Math.min(m.metalness || 0, 0.2); m.roughness = Math.max(0.45, m.roughness || 0.6); }
    const glow = p && p[3] ? (p[3] === 'g' ? 2.4 : 0.55) : 0; m.envMapIntensity = 1.15;
    G.gfx.mat(m, 'herofx', (sh) => {
      Object.assign(sh.uniforms, U); sh.uniforms.uGlow = { value: glow };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHeroY;').replace('#include <project_vertex>', '#include <project_vertex>\nvHeroY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHeroY; uniform vec3 uRim; uniform float uScanT, uBaseY, uTime, uGlow;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
          totalEmissiveRadiance += uRim * rimF * 0.42;
          totalEmissiveRadiance += diffuseColor.rgb * uGlow * (0.82 + 0.18 * sin(uTime * 3.1));
          float h = vHeroY - uBaseY, st = uTime - uScanT, band = st * 2.4 - 0.2;
          if (st > 0.0 && st < 1.4) { float b = smoothstep(0.16, 0.0, abs(h - band)); totalEmissiveRadiance += uRim * b * 3.2 + uRim * smoothstep(band, band - 0.6, h) * 0.25 * (1.0 - st / 1.4); } }`);
    });
    mats.set(src.name, m); return m;
  };
  const out = { U, make }; CACHE.set(H.id, out); return out;
}

// repaint a SoldierGLB with a hero look and give it the menu aura
export function applyHero(S, heroI) {
  const G = S.G, H = HEROES[heroIndex(heroI)], M = heroMaterials(G, H); S.hero = H; S.heroU = M.U;
  for (const o of S.meshes) { if (Array.isArray(o.material)) o.material = o.material.map(m => M.make(m)); else o.material = M.make(o.material); }
  // aura: a slowly turning ring of light under the hero, shown on the menu and character screens
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: G.gfx.uTime, uCol: { value: new THREE.Color(H.accent) } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv; void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
      float ring = smoothstep(0.05, 0.0, abs(r - 0.78)) * (0.55 + 0.45 * sin(a * 3.0 + uTime * 1.6));
      float inner = smoothstep(0.03, 0.0, abs(r - 0.52)) * step(0.5, fract(a * 1.9099 - uTime * 0.25)) * 0.7;
      float glow = smoothstep(0.85, 0.0, r) * 0.22; gl_FragColor = vec4(uCol * 2.0, ring + inner + glow); }` }));
  ring.position.y = 0.04; ring.renderOrder = 4; ring.userData.heroAura = true; ring.visible = false; S.group.add(ring); S.aura = ring; /* shown by SoldierGLB.animate on the menu screens */
  return H;
}
// a sweep of light up the body (on selection, and when the hero deploys)
export function heroScan(S) { if (S && S.heroU) S.heroU.uScanT.value = S.G.gfx.uTime.value; }
