// Photographic PBR textures (Poly Haven, CC0 1.0, 2K - see tools/upgrade-textures.mjs), loaded from public/assets/textures.
// Each set tiles every `metres` world metres; UVs in the batch are world metres, so repeat = 1 / metres.
import * as THREE from 'three';

const cache = new Map();
const loader = new THREE.TextureLoader();

export function realTex(name, metres = 4, renderer = null) {
  const key = name + '@' + metres; if (cache.has(key)) return cache.get(key);
  const load = (suffix, srgb) => { const t = loader.load('assets/textures/' + name + '_' + suffix + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / metres, 1 / metres);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = renderer ? Math.min(16, renderer.capabilities.getMaxAnisotropy()) : 16; return t; };
  const set = { map: load('diff', true), normalMap: load('nor', false), roughnessMap: load('rough', false) };
  cache.set(key, set); return set;
}
