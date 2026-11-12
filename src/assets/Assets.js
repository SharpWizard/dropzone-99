// GLB asset loading (models from poly.pizza - see CREDITS.md). Every consumer falls back to the
// procedural version when a model is missing, so a failed download never breaks the game.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const C = (n) => 'city/' + n, O = (n) => 'office/' + n, S = (n) => 'single/' + n;
// downloaded people models (CC0 1.0, Quaternius via Poly Pizza): rigged, with the same clip set as the hero
export const PEOPLE_KEYS = ['people_m/adventurer_free_model', 'people_m/astronaut_free_model', 'people_m/beach_character_free_model', 'people_m/business_man_free_model', 'people_m/casual_character_free_model', 'people_m/farmer_free_model', 'people_m/hoodie_character_free_model', 'people_m/king_free_model', 'people_m/punk_free_model', 'people_m/worker_free_model', 'people_f/adventurer_free_model', 'people_f/animated_woman_free_model', 'people_f/animated_woman_free_model_b', 'people_f/hooded_adventurer_free_model', 'people_f/punk_free_model', 'people_f/suit_free_model', 'people_f/witch_free_model', 'people_f/worker_free_model'];
export const ASSET_KEYS = [
  S('hero'), S('humvee'), S('police_car'), S('car_model'),
  'aircraft/venom_scout', 'vehicles2/jetpack',
  ...['car', 'car_2', 'suv', 'sports_car', 'pickup_truck', 'van', 'bus', 'bench', 'dumpster', 'traffic_light', 'fire_hydrant', 'mailbox', 'cone', 'trash_can', 'trah_bag_grey', 'bus_stop', 'stop_sign', 'billboard', 'atm', 'planter_bushes', 'power_box', 'box', 'air_conditioner', 'big_building', 'building_green', 'building_red', 'brown_building', 'flower_pot'].map(C),
  ...['table', 'coffee_table', 'chair', 'office_chair', 'couch_medium', 'couch_wide', 'couch_small', 'medium_book_shelf', 'shelf', 'file_cabinet', 'cabinet', 'desk_3', 'desk_5', 'computer_screen', 'monitor', 'keyboard_2', 'houseplant_2', 'potted_plant', 'plant_white_pot', 'rug', 'rug_round', 'light_floor', 'water_cooler', 'vending_machine', 'cardboard_boxes', 'cardboard_box', 'night_stand', 'trashcan', 'office_printer_u002f_copier', 'whiteboard', 'wall_art_02', 'wall_art_03', 'wall_art_05', 'toilet', 'bathroom_sink', 'fire_extinguisher', 'table_large_circular', 'laptop_u002f_macbook_pro'].map(O),
];

ASSET_KEYS.push(...['house/bed_king_free_model', 'house/bed_single_free_model', 'house/couch_medium_free_model', 'house/l_couch_free_model', 'house/table_round_large_free_model', 'house/chair_free_model', 'house/kitchen_fridge_free_model', 'house/oven_free_model', 'house/kitchen_sink_free_model', 'house/bathtub_free_model', 'house/houseplant_free_model', 'house/lamp_free_model', 'house/night_stand_free_model', 'house/washing_machine_free_model', 'props/desk_free_model', 'props/bookshelf_free_model', 'props/couch_free_model', 'props/dresser_free_model', 'props/bed_free_model', 'props/stove_free_model', 'props/toilet_free_model', 'props/bathroom_sink_free_model', 'props/armchair_free_model', 'props/desk_lamp_free_model']);
ASSET_KEYS.push(...PEOPLE_KEYS);
ASSET_KEYS.push('foliage/tree_marc', 'foliage/fall_tree', 'foliage/fall_tree_v1', 'foliage/pine_q', 'foliage/pine_q2', 'foliage/pine_trees_q', 'foliage/palm_q', 'foliage/palm_google', 'foliage/palm_jeremy', 'foliage/tree_stump', 'foliage/grass_green', 'foliage/tall_grass', 'foliage/dandelions');
ASSET_KEYS.push('enemies/soldier', 'enemies/swat_enemy', 'enemies/scifi_char', 'enemies/astro_a', 'enemies/astro_b', 'enemies/astro_c', 'enemies/hazmat', 'enemies/char_enemy', 'enemies/animal_panda', 'enemies/animal_bee', 'enemies/animal_flamingo', 'enemies/animal_frog');
ASSET_KEYS.push('pets/dragon', 'pets/ghost_skull');
ASSET_KEYS.push('building/large_building_a', 'building/building_red', 'building/large_building_b');
ASSET_KEYS.push(
  ...['jeep', 'truck', 'helicopter', 'military_boat', 'ambulance_car'].map(n => 'mil/' + n),
  'vehicles2/tank', 'vehicles2/bike', 'vehicles2/military_bike',
  ...['barrel', 'tires', 'wheels_stack', 'debris_pile', 'bricks', 'gas_can', 'propane_tank', 'pipes', 'wood_planks', 'barrier_single', 'brick_wall', 'metal_fence', 'street_light', 'sofa', 'sofa_small', 'trash_container_open', 'trash_bags', 'cardboard_boxes_2', 'fence_long', 'radio'].map(n => 'urban/' + n),
  ...['bar_stool', 'pool_table', 'coffee_machine', 'electric_oven', 'can_fridge', 'dishwasher', 'kitchen_cabinet_corner', 'triple_sink', 'cash_register', 'storage_crate', 'side_table', 'coffee_table', 'drum_set', 'guitar_amp', 'bass_speakers', 'speaker', 'backpack', 'couch_medium', 'couch_small', 'table', 'kitchen_microwave'].map(n => 'cafe/' + n));

// ---- stylised nature (Stylized Nature MegaKit + Ultimate Stylized Nature Pack, CC0, Quaternius): families by biome.
// [key, target height m]; trees also have a light '_lo' file (tools/build-lods.mjs). 'file#Part' picks one tree out of a row.
const NK = (n, s = '') => 'natk/' + n + '_free_model' + s, NU = (f, part) => 'natu/' + f + '_free_model#' + part;
const sfx = ['', '_b', '_b_b', '_b_b_b', '_b_b_b_b'];
export const NATURE = {
  broad: [[NK('tree'), 9], [NK('tree', '_b'), 9.5], [NK('tree', '_b_b'), 8], [NK('tree', '_b_b_b'), 8], [NK('tree', '_b_b_b_b'), 7.5], [NU('trees', 'NormalTree_1'), 8.5], [NU('trees', 'NormalTree_2'), 8.5], [NU('trees', 'NormalTree_3'), 7.5], [NU('maple_trees', 'MapleTree_1'), 9.5], [NU('maple_trees', 'MapleTree_2'), 9.5], [NU('maple_trees', 'MapleTree_3'), 10], [NU('maple_trees', 'MapleTree_5'), 10]],
  birch: [1, 2, 3, 4, 5].map(i => [NU('birch_trees', 'BirchTree_' + i), 9 + (i % 3)]),
  conifer: [[NK('pine'), 11], [NK('pine', '_b'), 12.5], [NK('pine', '_b_b'), 11], [NU('pine_trees', 'PineTree_1'), 10], [NU('pine_trees', 'PineTree_2'), 12.5], [NU('pine_trees', 'PineTree_4'), 9.5], [NU('pine_trees', 'PineTree_5'), 9.5]],
  old: sfx.map((s, i) => [NK('twisted_tree', s), 14 + i * 0.6]),
  dead: [...sfx.map((s, i) => [NK('dead_tree', s), 8.5 + i * 0.6]), ...[6, 7, 8, 10].map(i => [NU('dead_trees', 'DeadTree_' + i), 7.5])],
  palm: [1, 2, 3, 4].map(i => [NU('palm_trees', 'PalmTree_' + i), 8.5]),
  bush: [[NK('bush'), 1.3], [NK('bush_with_flowers'), 1.3], [NU('bushes', 'Bush'), 1.0], [NU('bushes', 'Bush_Flowers'), 1.05], [NU('bushes', 'Plant_1'), 0.8], [NU('flower_bushes', 'Plant_Flowers'), 1.0], [NU('flower_bushes', 'Plant_2'), 0.7], [NK('plant_big', '_b'), 1.5]],
  rock: [[NK('rock_medium'), 1.5], [NK('rock_medium', '_b'), 1.6], [NK('rock_medium', '_b_b'), 1.6], [NU('rocks', 'Rock_1'), 1.1], [NU('rocks', 'Rock_2'), 1.1], [NU('rocks', 'Rock_3'), 1.2], [NU('rocks', 'Rock_5'), 1.4]],
  grass: [[NK('grass'), 0.6], [NK('grass_wispy'), 0.55], [NU('grass', 'Grass_Small'), 0.45], [NU('grass', 'Grass_Large_Extruded'), 0.5]],
  flower: [[NK('flower_single'), 0.6], [NK('flower_single', '_b'), 0.7], [NK('flower_group'), 0.6], [NK('flower_group', '_b'), 0.7], [NU('flowers', 'Flower_1_Clump'), 0.45], [NU('flowers', 'Flower_3_Clump'), 0.45], [NU('flowers', 'Flower_4_Clump'), 0.45], [NK('clover'), 0.35]],
  floor: [[NK('fern'), 0.9], [NK('mushroom'), 0.3], [NK('mushroom_laetiporus'), 0.35], [NK('plant'), 0.55], [NK('flower_petal'), 0.1], [NK('flower_petal', '_b'), 0.1], [NK('plant_big'), 0.12]],
};
export const NATURE_FILES = (() => { const set = new Set(); for (const list of Object.values(NATURE)) for (const [k] of list) { const f = k.split('#')[0]; set.add(f); if (/natk\/(tree|pine|twisted_tree|dead_tree)_|natu\/(trees|birch|maple|pine|dead|palm)/.test(f)) set.add(f + '_lo'); } return [...set]; })();
ASSET_KEYS.push(...NATURE_FILES);
// furniture, food, City Pack buildings, farm buildings and the train set
ASSET_KEYS.push(...['couch_medium', 'couch_large', 'shelf_large', 'fireplace', 'drawer', 'drawer_b', 'drawer_b_b_b', 'drawer_b_b_b_b', 'light_stand', 'houseplant_b_b', 'houseplant_b_b_b_b', 'houseplant_b', 'houseplant_b_b_b', 'cactus', 'kitchen_fridge', 'oven', 'kitchen_sink', 'washing_machine', 'trashcan_small', 'trashcan_small_b', 'bed_king', 'bed_single', 'night_stand', 'night_stand_b', 'table_lamp', 'towel_rack', 'bathtub', 'rug', 'round_rug', 'table_round_small', 'table_round_small_b', 'chair', 'chair_b'].map(n => 'house/' + n.replace(/((?:_b)*)$/, '_free_model$1')));
ASSET_KEYS.push(...['couch', 'armchair', 'rocking_chair', 'bookshelf', 'lamp_with_shade', 'grandfathers_clock', 'refrigirator', 'stove', 'trash_bin', 'bed', 'dresser', 'coat_rack', 'toilet', 'bathroom_sink', 'treadmill', 'safe', 'ladder', 'alarm_clock', 'flowers', 'globe', 'books', 'trophy', 'fruit_bowl', 'candlestick', 'cup_of_tea', 'headphones', 'desk_lamp', 'mug_with_office_tool'].map(n => 'props/' + n.replace(/((?:_b)*)$/, '_free_model$1')));
ASSET_KEYS.push(...['apple_green', 'avocado', 'banana', 'bottle', 'bottle_b', 'bread', 'broccoli', 'carrot', 'cheeseburger', 'chicken_leg', 'chocolate_bar', 'cooking_pot', 'croissant', 'cupcake', 'donut', 'eggplant', 'fries', 'hotdog', 'ketchup_bottle', 'lettuce', 'pancakes_stack', 'pepper_green', 'pizza', 'plate_square', 'pumpkin', 'soda', 'steak', 'tomato', 'turnip', 'waffle'].map(n => 'food/' + n.replace(/((?:_b)*)$/, '_free_model$1')));
ASSET_KEYS.push(...['building_red_corner', 'pizza_corner', 'rb_blank', 'gb_blank'].map(n => 'town/' + n.replace(/((?:_b)*)$/, '_free_model$1')));
ASSET_KEYS.push(...['barn', 'big_barn', 'chickencoop', 'fence', 'fence_b', 'open_barn', 'silo', 'silo_house', 'small_barn', 'tower_windmill'].map(n => 'farm/' + n.replace(/((?:_b)*)$/, '_free_model$1')));
ASSET_KEYS.push(...['cargo_train_coal_conta', 'cargo_train_container', 'cargo_train_front', 'cargo_train_wagon', 'high_speed_front', 'high_speed_wagon', 'locomotive_front', 'locomotive_passenger_carriage', 'locomotive_wagon', 'railway_track_curve', 'railway_track_straight'].map(n => 'train/' + n.replace(/((?:_b)*)$/, '_free_model$1')));

// Retro Computers + Bottles (interiors), City Builder Bits + City Pack 2 (town)
ASSET_KEYS.push(...['macintosh_classic', 'computer_90s', 'computer_generic_2000s'].map(n => 'retro/' + n + '_free_model'), ...['baby_bottle', 'bottle', 'champagne_bottle', 'hand_wash_bottle', 'old_bottle', 'sauce_bottle'].map(n => 'bottles/' + n + '_free_model'));
ASSET_KEYS.push(...['building_b_free_model', 'building_free_model', 'building_free_model_b', 'building_free_model_b_b', 'building_free_model_b_b_b', 'building_free_model_b_b_b_b', 'building_free_model_b_b_b_b_b', 'building_free_model_b_b_b_b_b_b', 'watertower_free_model', 'traffic_light_free_model_b', 'taxi_free_model', 'police_car_free_model', 'stationwagon_free_model', 'car_hatchback_free_model'].map(n => 'cbits/' + n));
ASSET_KEYS.push(...['apartment_building', 'building', 'town_house', 'large_building', 'bar', 'hospital', 'hotel_building', 'skyscraper', 'house_with_driveway', 'convertible', 'nissan_gtr', '2015_dodge_challenger', '1994_nissan_180mx', 'mitsubishi_l200'].map(n => 'city2/' + n + '_free_model'));

// Survival Pack (floating supplies, melee tools) and Animal Kit (wildlife)
ASSET_KEYS.push(...['axe', 'knife', 'shovel', 'first_aid_kit', 'water_bottle', 'can', 'can_red'].map(n => 'survival/' + n + '_free_model'), 'survival/first_aid_kit_free_model_b');
ASSET_KEYS.push(...['deer', 'fox', 'rabbit', 'bizon', 'bear', 'horse', 'cow', 'sheep', 'chicken'].map(n => 'animals/' + n + '_free_model'), 'animals/deer_free_model_b');

// Ultimate Guns Pack + Ultimate Monsters Bundle (Quaternius, CC0): weapon models and the alien Swarm
ASSET_KEYS.push(...[['assault_rifle', ''], ['assault_rifle', '_b'], ['assault_rifle', '_b_b'], ['bullpup', ''], ['submachine_gun', ''], ['submachine_gun', '_b'], ['sniper_rifle', ''], ['sniper_rifle', '_b'], ['sniper_rifle', '_b_b'], ['sniper_rifle', '_b_b_b'], ['shotgun', ''], ['shotgun', '_b'], ['shotgun_short_stock', ''], ['pistol', ''], ['pistol', '_b'], ['pistol', '_b_b'], ['pistol', '_b_b_b'], ['revolver', ''], ['revolver', '_b']].map(([n, s]) => 'guns/' + n + '_free_model' + s));
ASSET_KEYS.push(...['alien_free_model_b', 'blue_demon_free_model', 'demon_free_model_b', 'yeti_free_model_b', 'orc_free_model', 'ninja_free_model_b'].map(n => 'monsters/' + n));

export class Assets {
  constructor(G) { this.G = G; this.gltf = {}; this.parts = {}; }
  // 'file#Part' addresses one named node (and its children) inside a multi-model file, e.g. 'natu/trees_free_model#NormalTree_1'
  has(key) { return !!this.gltf[key.split('#')[0]]; }
  get(key) { return this.gltf[key.split('#')[0]]; }

  async load(keys, onProgress) {
    // Poly Haven nature models are listed by the build tool (tools/build-nature.mjs)
    this.nature = {}; keys = keys.slice();
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); /* models are meshopt-compressed (tools/compress-meshes.mjs) */ let done = 0; const queue = keys.slice();
    const worker = async () => { while (queue.length) { const k = queue.shift(); try { const g = await loader.loadAsync('assets/models/' + k + '.glb' + (k.startsWith('nature/') && this.stamp ? '?v=' + this.stamp : '')); this._fix(g.scene); this.gltf[k] = g; } catch (e) { console.warn('asset missing', k); this.gltf[k] = null; } done++; if (onProgress) onProgress(done / keys.length, k); } };
    await Promise.all(Array.from({ length: 8 }, worker));
  }

  // route every imported material through the renderer (needed for cascaded shadows) and tame PBR values
  _fix(scene) {
    const gfx = this.G.gfx;
    scene.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
      // compressed models store positions / normals / uvs as packed integers; the game bakes transforms into vertices,
      // so unpack them to plain floats once here (skin indices and weights stay as they are)
      const g = o.geometry; if (g && !g.userData.dequant) { g.userData.dequant = true; for (const k of ['position', 'normal', 'uv', 'uv1', 'color', 'tangent']) { const at = g.attributes[k]; if (!at || (!at.isInterleavedBufferAttribute && at.array instanceof Float32Array)) continue;
        const n = at.count, sz = at.itemSize, out = new Float32Array(n * sz), get = [at.getX, at.getY, at.getZ, at.getW]; for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) out[i * sz + c] = get[c].call(at, i); g.setAttribute(k, new THREE.BufferAttribute(out, sz)); } }
      const fix = (m) => { if (m.userData.dz) return m; m.userData.dz = true; if (m.metalness !== undefined && !m.metalnessMap) m.metalness = Math.min(m.metalness, 0.6); if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.35); for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = 16; if (m.map) m.map.generateMipmaps = true; if (m.transparent && m.opacity > 0.98) m.transparent = false; return gfx.mat(m); };
      if (Array.isArray(o.material)) o.material = o.material.map(fix); else o.material = fix(o.material);
    });
    scene.updateMatrixWorld(true);
  }

  // A playable copy of an animated model: skeleton and clips kept, fitted to a length along +Z, sitting on y=0.
  animated(key, opts = {}) {
    const g = this.gltf[key]; if (!g) return null; const root = SkeletonUtils.clone(g.scene);
    // measure from mesh geometry, not from object bounds (rigs often carry odd nested scales)
    const measure = () => { root.updateMatrixWorld(true); const bb = new THREE.Box3(); root.traverse(o => { if (!o.isMesh) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); bb.union(b); }); return bb; };
    const grp = new THREE.Group(); grp.add(root);
    let box = measure(); let size = box.getSize(new THREE.Vector3()); const longX = size.x > size.z; root.rotation.y = (longX && !opts.keep ? Math.PI / 2 : 0) + (opts.flip ? Math.PI : 0); // keep: model already faces +Z (e.g. winged creatures)
    box = measure(); size = box.getSize(new THREE.Vector3()); const sc = (opts.length || 6) / Math.max(size.x, size.z); root.scale.multiplyScalar(sc);
    box = measure(); const c = box.getCenter(new THREE.Vector3()); root.position.set(root.position.x - c.x, root.position.y - box.min.y, root.position.z - c.z); root.updateMatrixWorld(true);
    const mixer = new THREE.AnimationMixer(root); const clips = {};
    for (const cl of g.animations || []) { const n = cl.name.split('|').pop(); clips[n] = mixer.clipAction(cl); }
    const size3 = measure().getSize(new THREE.Vector3());
    return { grp, mixer, clips, size: size3 };
  }

  // Static model flattened to world-baked geometries + bounding box. Cached.
  static(key) {
    if (this.parts[key]) return this.parts[key]; const [file, part] = key.split('#'); const g = this.gltf[file]; if (!g) return null;
    const list = [], box = new THREE.Box3(); g.scene.updateMatrixWorld(true);
    const inPart = (o) => { if (!part) return true; for (let n = o; n; n = n.parent) if (n.name === part || n.name.replace(/[_.]\d+$/, '') === part) return true; return false; };
    g.scene.traverse(o => { if (!o.isMesh || !inPart(o)) return; const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingBox(); box.union(geo.boundingBox); list.push({ geo, mat: o.material, name: o.name }); });
    if (!list.length) { console.warn('asset part missing', key); return (this.parts[key] = null); }
    const size = box.getSize(new THREE.Vector3());
    return (this.parts[key] = { list, box, size });
  }

  // A fresh Group of the model scaled/aligned so its longest horizontal axis lies on +Z with the given length (or height),
  // sitting on y=0 and centred in x/z. opts: {length, height, flip}
  fitted(key, opts = {}) {
    const p = this.static(key); if (!p) return null; const grp = new THREE.Group(), inner = new THREE.Group(); grp.add(inner);
    const longX = p.size.x > p.size.z; const len = Math.max(p.size.x, p.size.z); const s = opts.height ? opts.height / p.size.y : (opts.length || 1) / len;
    const c = p.box.getCenter(new THREE.Vector3());
    // auto-orientation: the barrel end is the narrower end of the long axis; turn the model so it faces forward (+Z)
    if (opts.auto) {
      const A = longX ? 'x' : 'z', O = longX ? 'z' : 'x', lo = p.box.min[A], hi = p.box.max[A], span = hi - lo || 1; const spread = (from, to) => { let n = 0, sum = 0, sq = 0; for (const part of p.list) { const pos = part.geo.attributes.position; for (let i = 0; i < pos.count; i++) { const a = pos.getComponent(i, longX ? 0 : 2), t = (a - lo) / span; if (t < from || t > to) continue; const o = pos.getComponent(i, longX ? 2 : 0), y = pos.getComponent(i, 1); sum += o + y; sq += o * o + y * y; n++; } } return n ? sq / n - (sum / n) ** 2 * 0 : 1e9; };
      const narrowHigh = spread(0.8, 1.0) < spread(0.0, 0.2); const worldZ = (narrowHigh ? 1 : -1) * (longX ? -1 : 1); opts = { ...opts, flip: worldZ < 0 };
    }
    for (const part of p.list) { const m = new THREE.Mesh(part.geo, part.mat); m.castShadow = true; m.receiveShadow = true; m.name = part.name; inner.add(m); }
    inner.position.set(-c.x, -p.box.min.y, -c.z); const rot = new THREE.Group(); rot.add(inner); rot.rotation.y = (longX ? Math.PI / 2 : 0) + (opts.flip ? Math.PI : 0); rot.scale.setScalar(s); grp.add(rot);
    grp.userData.size = longX ? new THREE.Vector3(p.size.z * s, p.size.y * s, p.size.x * s) : p.size.clone().multiplyScalar(s);
    return grp;
  }
}

const PCELL = 96; // props are batched per 96 m cell
// Instanced static props (street furniture, parked cars, interior furniture) grouped per region for culling.
export class Props {
  constructor(G) { this.G = G; this.req = new Map(); this.regions = []; this.flip = {}; }
  has(key) { return this.G.assets && this.G.assets.has(key); }
  // Fit model `key` into the world-space box. opts: {yaw: extra quarter turns, uniform, shadow, region}
  add(key, x0, y0, z0, x1, y1, z1, opts = {}) {
    const rk = (opts.region || 'world') + '@' + Math.floor((x0 + x1) / 2 / PCELL) + ',' + Math.floor((z0 + z1) / 2 / PCELL) + '|' + key + '|' + (opts.shadow ? 1 : 0); let a = this.req.get(rk); if (!a) this.req.set(rk, a = []);
    a.push([x0, y0, z0, x1, y1, z1, opts.yaw || 0, opts.uniform ? 1 : 0, opts.fixed ? 1 : 0]);
  }
  build() {
    const A = this.G.assets, scene = this.G.gfx.scene; const _pv = new THREE.Vector3(); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), pre = new THREE.Matrix4(), Y = new THREE.Vector3(0, 1, 0);
    const regs = new Map();
    for (const [rk, list] of this.req) {
      const [region, key, shadow] = rk.split('|'); const st = A.static(key); if (!st) continue; this.stats = this.stats || {}; this.stats[key] = (this.stats[key] || 0) + list.length;
      let R = regs.get(region); if (!R) { R = { name: region, meshes: [], box: new THREE.Box3() }; regs.set(region, R); }
      const c = st.box.getCenter(new THREE.Vector3()); pre.makeTranslation(-c.x, -st.box.min.y, -c.z);
      let dim = 0; const mats = list.map(([x0, y0, z0, x1, y1, z1, yawQ, uni, fixed]) => {
        const X = x1 - x0, Yh = y1 - y0, Z = z1 - z0; dim = Math.max(dim, X, Yh, Z); let mx = st.size.x, mz = st.size.z; let turn = yawQ;
        // fixed: the caller gives the exact facing (model +Z turned by yaw quarter turns); otherwise fit the long axis to the box
        if (!fixed && (mx > mz) !== (X > Z) && Math.abs(mx - mz) > 0.12 * Math.max(mx, mz)) turn += 1;
        if (turn % 2) { const t = mx; mx = mz; mz = t; }
        let sx = X / mx, sy = Yh / st.size.y, sz = Z / mz; if (uni) { const u = Math.min(sx, sy, sz); sx = sy = sz = u; }
        // scale is applied in model space (before rotation) so swap back for odd turns
        s.set(turn % 2 ? sz : sx, sy, turn % 2 ? sx : sz); q.setFromAxisAngle(Y, turn * Math.PI / 2); p.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
        R.box.expandByPoint(p); R.box.expandByPoint(_pv.set(p.x, y1, p.z)); return new THREE.Matrix4().compose(p, q, s).multiply(pre);
      });
      // furniture stands indoors where only ambient light reaches: add the same bounce-light fill the interior surfaces use
      if (/^(office|cafe|interior|house|props)\//.test(key)) for (const part of st.list) { const m = part.mat; if (m.userData.fill || !m.isMeshStandardMaterial) continue; m.userData.fill = true; const prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
        m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.5;'); };
        m.customProgramCacheKey = () => (pk ? pk.call(m) : '') + '_fill'; m.needsUpdate = true; }
      for (const part of st.list) { const im = new THREE.InstancedMesh(part.geo, part.mat, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow === '1' && dim > 0.7; im.receiveShadow = true; im.matrixAutoUpdate = false; im.computeBoundingSphere(); scene.add(im); R.meshes.push(im);
        // draw distance by size: a bottle disappears long before a building does
        im.userData.far = region.includes(':in') ? Math.min(60, Math.max(16, dim * 28)) : dim > 7 ? 800 : Math.min(320, Math.max(60, dim * 70)); im.userData.cast = im.castShadow; im.userData.sfar = dim > 7 ? 260 : Math.max(30, dim * 40); }
    }
    for (const R of regs.values()) { R.c = R.box.getCenter(new THREE.Vector3()); R.r = R.box.getSize(new THREE.Vector3()).length() / 2; this.regions.push(R); }
    this.req.clear();
  }
  update(cam) { if ((this._t = (this._t || 0) + 1) % 4 !== 1) return; const k = this.G.gfx.q.propDist || 1; for (const R of this.regions) { const d = Math.hypot(cam.x - R.c.x, cam.y - R.c.y, cam.z - R.c.z) - R.r; for (const m of R.meshes) { const v = d < m.userData.far * k; if (m.visible !== v) m.visible = v; if (m.userData.cast) m.castShadow = d < m.userData.sfar; } } }
}
