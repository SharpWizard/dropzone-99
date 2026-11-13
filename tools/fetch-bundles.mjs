// Downloads Poly Pizza bundles into public/assets/models/<group>/ and records title / author / licence in manifest.json.
// Usage: node tools/fetch-bundles.mjs
import fs from 'node:fs'; import path from 'node:path';
const BUNDLES = [
  ['people_m', 'https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ'],
  ['people_f', 'https://poly.pizza/bundle/Ultimate-Modular-Women-Pack-aCBDXDdTNN'],
  ['house', 'https://poly.pizza/bundle/Ultimate-House-Interior-Pack-2SXnFbwFzm'],
  ['props', 'https://poly.pizza/bundle/Household-Props-001-KsNBhP96PT'],
  ['town', 'https://poly.pizza/bundle/City-Pack-kJqRAIGsw0'],
  ['natk', 'https://poly.pizza/bundle/Stylized-Nature-MegaKit-T34GZFA0fm'],
  ['natu', 'https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr'],
  ['food', 'https://poly.pizza/bundle/Ultimate-Food-Pack-h3WC1gyRb4'],
  ['farm', 'https://poly.pizza/bundle/Farm-Buildings-Bundle-ppbnhEfNEt'],
  ['train', 'https://poly.pizza/bundle/Modular-Train-Pack-jYEybkFVr1'],
  ['retro', 'https://poly.pizza/bundle/Retro-Computers-tD2dNnGHex'],
  ['bottles', 'https://poly.pizza/bundle/Bottles-JmoVmcI8vY'],
  ['cbits', 'https://poly.pizza/bundle/City-Builder-Bits-1wLdnIddSx'],
  ['city2', 'https://poly.pizza/bundle/City-Pack-q11onRvPoJ'],
  ['survival', 'https://poly.pizza/bundle/Survival-Pack-XzvQPP0yWB'],
  ['animals', 'https://poly.pizza/bundle/Animal-Kit-J1PqAonfYb'],
  ['monsters', 'https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6'],
  ['guns', 'https://poly.pizza/bundle/Ultimate-Guns-Pack-cpgUfI4t2F'],
];
const UA = { 'User-Agent': 'Mozilla/5.0 (asset fetch)' };
const root = 'public/assets/models', mfPath = path.join(root, 'manifest.json');
// a model counts as downloaded only while its file is on disk, so deleted models can be fetched again
const manifest = JSON.parse(fs.readFileSync(mfPath, 'utf8')).filter(m => fs.existsSync(path.join(root, m.key + '.glb'))); const have = new Set(manifest.map(m => m.url));
const get = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(r.status + ' ' + u); return r; };
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
let total = 0; const added = [];
for (const [group, url] of BUNDLES) {
  const html = await (await get(url)).text(); const ids = [...new Set([...html.matchAll(/\/m\/([A-Za-z0-9_-]{6,14})/g)].map(m => m[1]))];
  fs.mkdirSync(path.join(root, group), { recursive: true }); const used = new Set(); let n = 0;
  for (const id of ids) {
    const page = 'https://poly.pizza/m/' + id; if (have.has(page)) continue;
    try {
      const h = await (await get(page)).text(); const glb = (h.match(/static\.poly\.pizza\/[a-f0-9-]+\.glb/) || [])[0]; if (!glb) { console.log('no glb', id); continue; }
      const title = ((h.match(/<meta[^>]+og:title[^>]+content="([^"]+)"/) || h.match(/<h1[^>]*>([^<]+)</) || [])[1] || id).replace(/ - Poly Pizza.*$/i, '').replace(/&amp;/g, '&').replace(/^Free\s+/i, '').replace(/\s+3D Model.*$/i, '').replace(/\s+by\s+.*$/i, '').trim();
      const lic = /CC0 1\.0|Public Domain/.test(h) ? 'CC0 1.0' : /CC-BY 3\.0|Attribution/.test(h) ? 'CC-BY 3.0' : 'unknown';
      const by = ((h.match(/href="\/u\/([^"]+)"/) || [])[1] || 'unknown').replace(/%20/g, ' ');
      if (lic === 'unknown') { console.log('skip (licence not stated)', title); continue; }
      let s = slug(title) || id.toLowerCase(); while (used.has(s)) s += '_b'; used.add(s);
      const buf = Buffer.from(await (await get('https://' + glb)).arrayBuffer()); fs.writeFileSync(path.join(root, group, s + '.glb'), buf);
      manifest.push({ key: group + '/' + s, title, by, lic, url: page, size: buf.length }); have.add(page); total += buf.length; n++; added.push(group + '/' + s + ' ' + (buf.length / 1024 | 0) + 'k ' + by + ' ' + lic);
    } catch (e) { console.log('fail', id, e.message); }
  }
  console.log(group, 'downloaded', n, 'of', ids.length);
}
fs.writeFileSync(mfPath, JSON.stringify(manifest, null, 1));
console.log(added.join('\n')); console.log('total MB', (total / 1048576).toFixed(1));
