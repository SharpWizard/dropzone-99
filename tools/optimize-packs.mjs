// Shrinks downloaded Poly Pizza packs for the browser: textures resized and stored as WebP, blended foliage switched to
// alpha-tested cut-outs (sorts correctly when instanced), unused data pruned. Rewrites the GLBs in place.
//   node tools/optimize-packs.mjs [groups...]      (default: every downloaded pack group)
//   TEX=1024 sets the texture size (default 1024); NORMALS=0 strips normal maps from the nature packs
import fs from 'fs'; import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = 'public/assets/models', groups = process.argv.slice(2).length ? process.argv.slice(2) : ['natk', 'natu', 'town', 'train', 'farm', 'food', 'retro', 'bottles', 'cbits', 'city2'];
const TEX = +(process.env.TEX || 1024), KEEP_NORMALS = process.env.NORMALS !== '0';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let before = 0, after = 0;
for (const g of groups) {
  const dir = path.join(ROOT, g); if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.glb'))) {
    const file = path.join(dir, f), size0 = fs.statSync(file).size; before += size0;
    const doc = await io.read(file);
    for (const m of doc.getRoot().listMaterials()) {
      if (m.getAlphaMode() === 'BLEND') { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.5); m.setDoubleSided(true); }
      // normal maps on bark / rock read well up close; strip them with NORMALS=0 for a lighter build
      const n = m.getNormalTexture(); if (n && g.startsWith('nat') && !KEEP_NORMALS) m.setNormalTexture(null);
    }
    await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 90 }));
    await io.write(file, doc); const size1 = fs.statSync(file).size; after += size1;
    if (size0 > 300 * 1024) console.log(g + '/' + f, (size0 / 1024 | 0) + 'k ->', (size1 / 1024 | 0) + 'k');
  }
}
console.log('total', (before / 1048576).toFixed(1), 'MB ->', (after / 1048576).toFixed(1), 'MB');
