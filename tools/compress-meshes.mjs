// Geometry compression for every GLB under public/assets/models: meshopt (EXT_meshopt_compression) with quantised
// attributes. The game's loader has the matching MeshoptDecoder. Skinned / animated files keep full-precision joints.
//   node tools/compress-meshes.mjs [dir]        (default public/assets/models)
import fs from 'fs'; import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const DIR = process.argv[2] || 'public/assets/models';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
let before = 0, after = 0, n = 0, skipped = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.glb') ? [path.join(d, e.name)] : []);
for (const file of walk(DIR)) {
  const size0 = fs.statSync(file).size; before += size0;
  try {
    const doc = await io.read(file);
    if (doc.getRoot().listExtensionsUsed().some(e => e.extensionName === 'EXT_meshopt_compression')) { after += size0; skipped++; continue; }
    await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const buf = await io.writeBinary(doc);
    if (buf.byteLength < size0) { fs.writeFileSync(file, buf); after += buf.byteLength; n++; } else after += size0;
  } catch (e) { console.log('skip', file, e.message); after += size0; skipped++; }
}
console.log(`compressed ${n} files (${skipped} skipped): ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
