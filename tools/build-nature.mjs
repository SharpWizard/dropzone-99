// Downloads CC0 nature models from Poly Haven (1k textures) and turns the film-resolution scans into game-ready GLBs.
// - every plant/rock variant in a file becomes its own model (id_v0, id_v1 ...)
// - solid parts (trunks, rocks) are decimated with meshoptimizer
// - foliage (alpha cards / leaf islands) is thinned by dropping whole islands and enlarging the survivors,
//   which keeps leaves looking like leaves instead of collapsing them into shards
// - trees get a second, much lighter LOD (id_vN_lo); textures are resized and stored as WebP
//   node tools/build-nature.mjs [ids...]
import fs from 'fs'; import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const OUT = 'public/assets/models/nature', CACHE = path.join(process.env.TEMP || '.', 'dz-polyhaven');
// id: { hi, lo (0 = none), tex, pick: variant indices to keep (default all), kind }
const SET = {
  rock_07: { hi: 1400, tex: 1024, kind: 'rock' }, rock_09: { hi: 1400, tex: 1024, kind: 'rock' }, stone_01: { hi: 1200, tex: 1024, kind: 'rock' }, namaqualand_stones_01: { hi: 700, tex: 1024, kind: 'rock' },
  rock_face_01: { hi: 1600, tex: 1024, kind: 'boulder' }, rock_moss_set_01: { hi: 1300, tex: 1024, kind: 'boulder' }, rock_moss_set_02: { hi: 1300, tex: 1024, kind: 'boulder' }, boulder_01: { hi: 2200, tex: 1024, kind: 'boulder' },
  namaqualand_boulder_04: { hi: 1800, tex: 1024, kind: 'boulder' }, namaqualand_boulders_01: { hi: 1500, tex: 1024, kind: 'boulder' },
  shrub_02: { hi: 2600, tex: 512, kind: 'bush' }, shrub_03: { hi: 2600, tex: 512, kind: 'bush' }, shrub_04: { hi: 2600, tex: 512, kind: 'bush' }, fern_02: { hi: 1200, tex: 512, kind: 'bush' }, wild_rooibos_bush: { hi: 2600, tex: 512, kind: 'bush' },
  tree_stump_01: { hi: 1400, tex: 1024, kind: 'deco' }, tree_stump_02: { hi: 1600, tex: 1024, kind: 'deco' }, dry_branches_medium_01: { hi: 900, tex: 512, kind: 'deco' },
  weed_plant_02: { hi: 900, tex: 512, kind: 'deco' }, dandelion_01: { hi: 700, tex: 512, kind: 'deco' }, flower_gazania: { hi: 700, tex: 512, kind: 'deco' }, periwinkle_plant: { hi: 900, tex: 512, kind: 'deco' },
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

async function download(id) {
  const dir = path.join(CACHE, id); const main = path.join(dir, id + '_1k.gltf'); if (fs.existsSync(main)) return main;
  const j = await (await fetch('https://api.polyhaven.com/files/' + id, { headers: { 'User-Agent': 'dropzone99-build' } })).json(); const g = j.gltf['1k'].gltf;
  fs.mkdirSync(dir, { recursive: true });
  const get = async (url, file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); };
  for (const [rel, v] of Object.entries(g.include || {})) await get(v.url, path.join(dir, rel));
  await get(g.url, main); return main;
}
const primTris = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
const tris = (doc, f) => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) if (!f || f(p)) t += primTris(p); return Math.round(t); };
const isFoliage = (p) => { const m = p.getMaterial(); return !!m && (m.getAlphaMode() !== 'OPAQUE' || /leav|leaf|twig|needle|frond|petal|flower/i.test(m.getName())); };

// keep a fraction of the connected islands of a primitive, enlarge the survivors, drop unused vertices
function thin(doc, prim, keep, seed, maxScale = 3.4) {
  const idx = prim.getIndices(); if (!idx) return; const I = idx.getArray(), pos = prim.getAttribute('POSITION'), P = pos.getArray(), nv = pos.getCount();
  const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i; const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let i = 0; i < I.length; i += 3) { const a = find(I[i]), b = find(I[i + 1]), c = find(I[i + 2]); par[b] = a; par[c] = a; }
  const seen = new Map(); for (let i = 0; i < nv; i++) { const k = Math.round(P[i * 3] * 2000) + ',' + Math.round(P[i * 3 + 1] * 2000) + ',' + Math.round(P[i * 3 + 2] * 2000); const o = seen.get(k); if (o === undefined) seen.set(k, i); else par[find(i)] = find(o); }
  const keepSet = new Map(); let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < nv; i++) { const r = find(i); if (!keepSet.has(r)) keepSet.set(r, rnd() < keep); }
  const f = Math.min(maxScale, Math.sqrt(1 / keep) * 0.95);
  // centroid per kept island
  const cen = new Map(); for (let i = 0; i < nv; i++) { const r = find(i); if (!keepSet.get(r)) continue; let c = cen.get(r); if (!c) cen.set(r, c = [0, 0, 0, 0]); c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; c[3]++; }
  const remap = new Int32Array(nv).fill(-1); let n = 0; for (let i = 0; i < nv; i++) if (keepSet.get(find(i))) remap[i] = n++;
  if (n === 0) { remap[I[0]] = 0; remap[I[1]] = 1; remap[I[2]] = 2; n = 3; }
  for (const sem of prim.listSemantics()) {
    const a = prim.getAttribute(sem), src = a.getArray(), es = a.getElementSize(); const dst = new src.constructor(n * es);
    for (let i = 0; i < nv; i++) { const k = remap[i]; if (k < 0) continue; for (let e = 0; e < es; e++) dst[k * es + e] = src[i * es + e];
      if (sem === 'POSITION') { const c = cen.get(find(i)); if (c) for (let e = 0; e < 3; e++) { const m = c[e] / c[3]; dst[k * 3 + e] = m + (src[i * 3 + e] - m) * f; } } }
    prim.setAttribute(sem, doc.createAccessor().setType(a.getType()).setNormalized(a.getNormalized()).setArray(dst));
  }
  const out = []; for (let i = 0; i < I.length; i += 3) { const a = remap[I[i]], b = remap[I[i + 1]], c = remap[I[i + 2]]; if (a >= 0 && b >= 0 && c >= 0) out.push(a, b, c); }
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(n > 65535 ? new Uint32Array(out) : new Uint16Array(out)));
}

async function variant(id, vi, cfg, target, suffix, lite) {
  const doc = await io.read(await download(id)); const scene = doc.getRoot().listScenes()[0]; const nodes = scene.listChildren().filter(n => n.getMesh() || n.listChildren().length);
  nodes.forEach((n, i) => { if (i !== vi) n.dispose(); else { const t = n.getTranslation(); n.setTranslation([0, t[1], 0]); } });
  // Poly Haven's glTF export drops foliage opacity: merge the separate alpha map back into the base colour texture
  for (const m of doc.getRoot().listMaterials()) {
    if (m.getAlphaMode() === 'OPAQUE' && !/leav|leaf|twig|needle|frond|petal|flower/i.test(m.getName())) continue; const tex = m.getBaseColorTexture(); if (!tex || tex.getMimeType() === 'image/png') continue;
    const file = path.basename(tex.getURI() || ''); if (!/_diff_/.test(file)) continue; const af = path.join(CACHE, id, 'textures', file.replace('_diff_', '_alpha_'));
    try { if (!fs.existsSync(af)) { const r = await fetch('https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/' + id + '/' + path.basename(af)); if (!r.ok) throw new Error('no alpha map'); fs.writeFileSync(af, Buffer.from(await r.arrayBuffer())); }
      const meta = await sharp(tex.getImage()).metadata(); const alpha = await sharp(af).resize(meta.width, meta.height).greyscale().raw().toBuffer();
      const rgb = await sharp(tex.getImage()).removeAlpha().raw().toBuffer(); const px = meta.width * meta.height, buf = Buffer.alloc(px * 4);
      for (let i = 0; i < px; i++) { buf[i * 4] = rgb[i * 3]; buf[i * 4 + 1] = rgb[i * 3 + 1]; buf[i * 4 + 2] = rgb[i * 3 + 2]; buf[i * 4 + 3] = alpha[i]; }
      const rgba = await sharp(buf, { raw: { width: meta.width, height: meta.height, channels: 4 } }).png().toBuffer();
      tex.setImage(rgba).setMimeType('image/png'); m.setAlphaMode('MASK').setAlphaCutoff(0.45); m.setDoubleSided(true);
    } catch (e) { console.log("alpha merge skipped:", m.getName(), e.message); }
  }
  for (const m of doc.getRoot().listMaterials()) { m.setOcclusionTexture(null); m.setMetallicRoughnessTexture(null); m.setRoughnessFactor(0.9); m.setMetallicFactor(0); if (lite) m.setNormalTexture(null); if (m.getAlphaMode() === 'BLEND') { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.45); } }
  await doc.transform(prune(), dedup());
  const before = tris(doc); const fol = tris(doc, isFoliage), solid = before - fol;
  const folBudget = fol ? Math.max(target * (solid ? 0.75 : 1), target - solid) : 0, solidBudget = Math.max(200, target - Math.min(fol, folBudget));
  if (fol > folBudget * 1.15) { let s = 7 + vi; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) if (isFoliage(p)) thin(doc, p, Math.min(1, folBudget / fol), s += 31, lite ? 9 : 3.6); }
  if (solid > solidBudget * 1.2) {
    // decimate solid primitives only: temporarily detach foliage
    const hold = []; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) if (isFoliage(p)) { hold.push([m, p]); m.removePrimitive(p); }
    await doc.transform(weld());
    for (const err of [0.01, 0.03, 0.08, 0.2]) { const now = tris(doc); if (now <= solidBudget * 1.2) break; await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.002, solidBudget / now), error: err, lockBorder: false })); }
    for (const [m, p] of hold) m.addPrimitive(p);
  }
  const ts = lite ? Math.min(512, cfg.tex) : cfg.tex;
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [ts, ts], quality: 82 }));
  const name = `${id}_v${vi}${suffix}`; fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name + '.glb'), await io.writeBinary(doc));
  console.log(`${name}: ${before} (${fol} foliage) -> ${tris(doc)} tris, ${(fs.statSync(path.join(OUT, name + '.glb')).size / 1024).toFixed(0)} kB`);
  return name;
}

const only = process.argv.slice(2); const indexFile = path.join(OUT, 'index.json'); const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
for (const [id, cfg] of Object.entries(SET)) {
  if (only.length && !only.includes(id)) continue;
  try {
    const doc = await io.read(await download(id)); const count = doc.getRoot().listScenes()[0].listChildren().filter(n => n.getMesh() || n.listChildren().length).length;
    const picks = (cfg.pick || [...Array(count).keys()]).filter(i => i < count).slice(0, 5); const names = [];
    for (const vi of picks) { names.push(await variant(id, vi, cfg, cfg.hi, '', false)); if (cfg.lo) await variant(id, vi, cfg, cfg.lo, '_lo', true); }
    index[id] = { kind: cfg.kind, variants: names, lo: !!cfg.lo };
  } catch (e) { console.log(id, 'FAILED', e.message); }
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
}
const stampFile = path.join(OUT, 'stamp.json'); fs.writeFileSync(stampFile, JSON.stringify({ built: Date.now() }));
