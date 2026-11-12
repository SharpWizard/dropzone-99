// Finds the Poly Haven source of each photo texture in public/assets/textures (by image similarity among candidates)
// and replaces the 1K maps with the 2K version of the same texture (diff, GL normal, roughness). CC0 1.0.
//   node tools/upgrade-textures.mjs [res=2k]
import fs from 'fs'; import path from 'path'; import sharp from 'sharp';
const RES = process.argv[2] || '2k', DIR = 'public/assets/textures', CACHE = path.join(process.env.TEMP || '.', 'dz-ph-tex'); fs.mkdirSync(CACHE, { recursive: true });
const UA = { headers: { 'User-Agent': 'dropzone99-build' } };
const CAND = {
  asphalt: ['asphalt_01', 'asphalt_02', 'asphalt_03', 'asphalt_04', 'asphalt_05', 'asphalt_06', 'asphalt_07', 'clean_asphalt', 'worn_asphalt', 'asphalt_floor', 'aerial_asphalt_01'],
  brick: ['brick_wall_001', 'brick_wall_003', 'brick_wall_005', 'brick_wall_006', 'brick_wall_02', 'brick_wall_04', 'brick_wall_07', 'brick_wall_08', 'brick_wall_09', 'brick_wall_10', 'brick_wall_11', 'brick_wall_12', 'brick_wall_13', 'red_brick_03', 'red_brick_wall', 'brown_brick_02'],
  cladding: ['exterior_wall_cladding', 'exterior_wall_cladding_02', 'exterior_wall_cladding_03'],
  concrete: ['concrete', 'concrete_floor', 'concrete_floor_01', 'concrete_floor_02', 'concrete_floor_03', 'concrete_wall_001', 'concrete_wall_003', 'concrete_wall_004', 'concrete_wall_006', 'concrete_wall_007', 'concrete_wall_008', 'brushed_concrete', 'concrete_panels', 'concrete_layers'],
  grass: ['aerial_grass_rock', 'grass_ground', 'leafy_grass', 'sparse_grass', 'withered_grass', 'grass_path_2', 'grass_path_3', 'forest_ground_01', 'rocky_terrain_02'],
  metal: ['corrugated_iron', 'corrugated_iron_02', 'corrugated_iron_03', 'rusty_corrugated_iron', 'worn_corrugated_iron', 'box_profile_metal_sheet', 'metal_plate', 'metal_plate_02', 'rusty_metal_sheet', 'blue_metal_plate', 'green_metal_rust'],
  pavement: ['pavement_01', 'pavement_02', 'pavement_03', 'pavement_04', 'pavement_05', 'pavement_06', 'concrete_pavement', 'concrete_pavement_02', 'concrete_pavers', 'floor_pavement', 'rectangular_paving', 'square_brick_paving', 'patterned_paving', 'herringbone_pavement'],
  plaster: ['plastered_wall', 'plastered_wall_02', 'plastered_wall_03', 'plastered_wall_04', 'plastered_wall_05', 'painted_plaster_wall', 'grey_plaster', 'grey_plaster_02', 'grey_plaster_03', 'rough_plaster_03', 'clay_plaster', 'beige_wall_001', 'white_plaster_02'],
  roof: ['roof_tiles', 'roof_tiles_14', 'clay_roof_tiles', 'clay_roof_tiles_02', 'clay_roof_tiles_03', 'grey_roof_tiles', 'grey_roof_tiles_02', 'red_slate_roof_tiles_01', 'roof_slates_02', 'roof_slates_03', 'ceramic_roof_01', 'grey_roof_01', 'roof_07', 'roof_09', 'roof_3'],
  steel: ['metal_plate', 'metal_plate_02', 'rusty_metal', 'rusty_metal_02', 'rusty_metal_03', 'painted_metal_shutter', 'blue_metal_plate', 'metal_grate_rusty', 'green_metal_rust', 'rusty_painted_metal', 'rusty_metal_sheet'],
  woodfloor: ['wood_floor', 'wood_floor_deck', 'wood_floor_worn', 'old_wood_floor', 'laminate_floor', 'laminate_floor_02', 'herringbone_parquet', 'oak_wood_planks', 'raw_wooden_floor_01', 'old_wooden_floor_01'],
  wood: ['wood_planks', 'wooden_planks', 'weathered_planks', 'worn_planks', 'brown_planks_03', 'brown_planks_04', 'brown_planks_05', 'old_planks_02', 'wood_plank_wall', 'rough_wood', 'dark_wooden_planks', 'planks_brown_10', 'wood_planks_grey', 'wood_planks_dirt', 'medieval_wood'],
};
// no exact match among the hand-picked candidates: widen to every Poly Haven texture whose id has one of these words
const WIDE = { cladding: ['cladding', 'siding', 'panel', 'wall', 'plank', 'facade', 'metal_sheet'], plaster: ['plaster', 'stucco', 'wall', 'painted'] };
let ALL = null; const all = async () => ALL || (ALL = Object.keys(await (await fetch('https://api.polyhaven.com/assets?t=textures', UA)).json()));
const sig = async (src) => { const { data } = await sharp(src).resize(48, 48, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true }); const a = Float32Array.from(data); const m = a.reduce((s, v) => s + v, 0) / a.length; let s2 = 0; for (let i = 0; i < a.length; i++) { a[i] -= m; s2 += a[i] * a[i]; } const n = Math.sqrt(s2) || 1; return { a: a.map(v => v / n), m }; };
const colour = async (src) => { const { channels } = await sharp(src).stats(); return channels.slice(0, 3).map(c => c.mean); };
const corr = (p, q) => { let s = 0; for (let i = 0; i < p.a.length; i++) s += p.a[i] * q.a[i]; return s; };
const get = async (url, file) => { if (fs.existsSync(file)) return file; const r = await fetch(url, UA); if (!r.ok) throw new Error(r.status + ' ' + url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return file; };
const files = async (id) => { const f = path.join(CACHE, id + '.json'); if (!fs.existsSync(f)) { const r = await fetch('https://api.polyhaven.com/files/' + id, UA); if (!r.ok) return null; fs.writeFileSync(f, await r.text()); } return JSON.parse(fs.readFileSync(f, 'utf8')); };
const report = [];
for (const [name, ids] of Object.entries(CAND)) {
  const mine = path.join(DIR, name + '_diff.jpg'); if (!fs.existsSync(mine)) continue; const ms = await sig(mine), mc = await colour(mine); let best = null;
  for (const id of ids) { const fj = await files(id); if (!fj || !fj.Diffuse || !fj.Diffuse['1k']) continue;
    try { const p = await get(fj.Diffuse['1k'].jpg.url, path.join(CACHE, id + '_diff_1k.jpg')); const c = corr(ms, await sig(p)), cc = await colour(p); const cd = Math.hypot(...cc.map((v, i) => v - mc[i])) / 255;
      const score = c - cd * 0.5; if (!best || score > best.score) best = { id, c, cd, score, fj }; } catch (e) { /* skip */ } }
  if ((!best || best.c < 0.9) && WIDE[name]) for (const id of (await all()).filter(i => WIDE[name].some(w => i.includes(w)) && !ids.includes(i))) { const fj = await files(id); if (!fj || !fj.Diffuse || !fj.Diffuse['1k']) continue;
    try { const p = await get(fj.Diffuse['1k'].jpg.url, path.join(CACHE, id + '_diff_1k.jpg')); const c = corr(ms, await sig(p)), cc = await colour(p); const cd = Math.hypot(...cc.map((v, i) => v - mc[i])) / 255; const score = c - cd * 0.5; if (!best || score > best.score) best = { id, c, cd, score, fj }; if (c > 0.95) break; } catch (e) { /* skip */ } }
  if (!best) { report.push(name + ': no candidate'); continue; }
  const exact = best.c > 0.9;
  if (!exact) { report.push(`${name}: closest ${best.id} (corr ${best.c.toFixed(2)}) - not an exact match, kept 1K`); continue; }
  const fj = best.fj, pick = (k) => fj[k] && fj[k][RES] && fj[k][RES].jpg && fj[k][RES].jpg.url;
  const maps = [['diff', pick('Diffuse')], ['nor', pick('nor_gl')], ['rough', pick('Rough') || pick('arm')]];
  for (const [suf, url] of maps) { if (!url) continue; const dst = path.join(DIR, name + '_' + suf + '.jpg'); const bak = path.join(CACHE, 'orig_' + name + '_' + suf + '.jpg'); if (!fs.existsSync(bak)) fs.copyFileSync(dst, bak);
    const raw = await get(url, path.join(CACHE, best.id + '_' + suf + '_' + RES + '.jpg')); await sharp(raw).jpeg({ quality: 88, mozjpeg: true }).toFile(dst + '.tmp'); fs.renameSync(dst + '.tmp', dst); }
  report.push(`${name}: ${best.id} (corr ${best.c.toFixed(2)}) -> ${RES}`);
}
console.log(report.join('\n'));
