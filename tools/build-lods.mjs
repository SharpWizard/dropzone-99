// Light LODs for the stylised nature packs: writes <file>_lo.glb next to each tree model.
// Foliage is thinned by dropping whole leaf islands and enlarging the survivors (same idea as build-nature.mjs),
// bark is decimated with meshoptimizer. Node names are kept, so 'file#Part' keys work for the _lo files too.
//   node tools/build-lods.mjs
import fs from 'fs'; import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const ROOT = 'public/assets/models';
const FILES = [
  ...['tree', 'pine', 'twisted_tree', 'dead_tree'].flatMap(n => ['', '_b', '_b_b', '_b_b_b', '_b_b_b_b'].map(s => 'natk/' + n + '_free_model' + s)),
  ...['trees', 'birch_trees', 'maple_trees', 'pine_trees', 'dead_trees', 'dead_trees_free_model_b', 'palm_trees'].map(n => 'natu/' + (n.includes('free_model') ? n : n + '_free_model')),
];
const KEEP = 0.16; // share of triangles kept
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); await MeshoptSimplifier.ready;
const primTris = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
const isFoliage = (p) => { const m = p.getMaterial(); return !!m && (m.getAlphaMode() !== 'OPAQUE' || /leav|leaf|needle|frond|flower|petal/i.test(m.getName())); };

function thin(doc, prim, keep, seed, maxScale) {
  const idx = prim.getIndices(); if (!idx) return; const I = idx.getArray(), pos = prim.getAttribute('POSITION'), P = pos.getArray(), nv = pos.getCount();
  const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i; const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let i = 0; i < I.length; i += 3) { const a = find(I[i]), b = find(I[i + 1]), c = find(I[i + 2]); par[b] = a; par[c] = a; }
  const keepSet = new Map(); let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < nv; i++) { const r = find(i); if (!keepSet.has(r)) keepSet.set(r, rnd() < keep); }
  if (keepSet.size < 4) return false; // one big island: leave it to the simplifier
  const f = Math.min(maxScale, Math.sqrt(1 / keep) * 0.92);
  const cen = new Map(); for (let i = 0; i < nv; i++) { const r = find(i); if (!keepSet.get(r)) continue; let c = cen.get(r); if (!c) cen.set(r, c = [0, 0, 0, 0]); c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; c[3]++; }
  const remap = new Int32Array(nv).fill(-1); let n = 0; for (let i = 0; i < nv; i++) if (keepSet.get(find(i))) remap[i] = n++;
  if (n < 3) return false;
  for (const sem of prim.listSemantics()) {
    const a = prim.getAttribute(sem), src = a.getArray(), es = a.getElementSize(); const dst = new src.constructor(n * es);
    for (let i = 0; i < nv; i++) { const k = remap[i]; if (k < 0) continue; for (let e = 0; e < es; e++) dst[k * es + e] = src[i * es + e];
      if (sem === 'POSITION') { const c = cen.get(find(i)); for (let e = 0; e < 3; e++) { const m = c[e] / c[3]; dst[k * 3 + e] = m + (src[i * 3 + e] - m) * f; } } }
    prim.setAttribute(sem, doc.createAccessor().setType(a.getType()).setNormalized(a.getNormalized()).setArray(dst));
  }
  const out = []; for (let i = 0; i < I.length; i += 3) { const a = remap[I[i]], b = remap[I[i + 1]], c = remap[I[i + 2]]; if (a >= 0 && b >= 0 && c >= 0) out.push(a, b, c); }
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(n > 65535 ? new Uint32Array(out) : new Uint16Array(out))); return true;
}

for (const f of FILES) {
  const src = path.join(ROOT, f + '.glb'); if (!fs.existsSync(src)) { console.log('missing', f); continue; }
  const doc = await io.read(src); let before = 0, seed = 11; const rest = [];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { before += primTris(p); if (!isFoliage(p) || !thin(doc, p, KEEP * 1.4, seed += 31, 3.2)) rest.push([m, p]); }
  // decimate everything that was not thinned (trunks, branches, solid leaf blobs)
  const hold = []; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) if (!rest.some(([, q]) => q === p)) { hold.push([m, p]); m.removePrimitive(p); }
  await doc.transform(weld());
  for (const err of [0.02, 0.06, 0.15]) { let now = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) now += primTris(p); if (now <= before * KEEP * 1.1) break; await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: KEEP, error: err, lockBorder: false })); }
  for (const [m, p] of hold) m.addPrimitive(p);
  await doc.transform(prune());
  let after = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) after += primTris(p);
  const out = path.join(ROOT, f + '_lo.glb'); await io.write(out, doc); console.log(f + '_lo', Math.round(before), '->', Math.round(after), 'tris', (fs.statSync(out).size / 1024 | 0) + 'k');
}
