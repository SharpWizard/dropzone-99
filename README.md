# DROPZONE 99

**99 drop in. One survives.** A single-player third-person battle royale for the browser, built with Three.js (WebGL2).

## Run

```
npm install
npm run dev
```

Open http://127.0.0.1:5199/ — or `npm run build` and serve the `dist/` folder.

## Controls

| Action | Key |
|---|---|
| Move / look | WASD / mouse |
| Shoot / aim | LMB / RMB |
| Sprint / jump | Shift / Space |
| Crouch / prone | C / Z |
| Reload / fire mode | R / B |
| Pick up, interact, jump from plane, parachute, enter and exit vehicles | F |
| Weapons / grenade | 1 2 3 / 4 |
| Bandage / first aid / energy drink | 5 / 6 / 7 |
| Switch shoulder / first-person | Q / V |
| Inventory / map | Tab / M |
| Pause | Esc |

All keys can be rebound in Settings. Graphics presets (LOW, MEDIUM, HIGH, ULTRA) are in Settings too; the game picks one from your GPU on first launch and scales resolution to hold frame rate.

## Layout

```
src/
  core/         game loop, state machine, settings, input
  rendering/    renderer (CSM shadows, sky, AO, bloom, grading), procedural textures, geometry batcher, effects
  assets/       GLB loader and instanced props
  world/        island data, buildings, the ten locations, vegetation
  terrain/      chunked terrain and water
  physics/      colliders, ground queries, ray casts
  characters/   character base, player, rigged soldier
  weapons/      weapon stats and models
  combat/       ballistics, damage, grenades
  ai/           navigation grid, bots
  vehicles/     driving model
  inventory/    items and loot
  battleRoyale/ plane, zone, match flow
  audio/        synthesised sound
  ui/           HUD, menus, inventory, map
public/assets/models/   GLB models (see CREDITS.md)
```

## Notes

- Ten playable heroes (src/characters/Heroes.js): the Astronaut (GHOST, the main hero) and SWAT trooper (VANGUARD) in custom colours, plus the eight women of the Ultimate Modular Women Pack in their own colours. All share one rig and clip set.
- Terrain, buildings, textures and all audio are generated in code. Characters, guns, vehicles, street props and furniture are GLB models from Poly Pizza; if a model fails to load the game falls back to a procedural version.
- Trees, bushes, rocks, grass, flowers and forest-floor plants come from the Stylized Nature MegaKit and Ultimate Stylized Nature Pack (CC0), grouped by biome in `NATURE` (src/assets/Assets.js). New packs are fetched with `node tools/fetch-bundles.mjs`, shrunk with `node tools/optimize-packs.mjs` and given light tree LODs with `node tools/build-lods.mjs`.
- Rendering (src/rendering/Gfx.js): HDR pipeline with cascaded soft shadows, MSAA + alpha-to-coverage foliage, SSAO, bloom, ACES and a vivid grade; atmospheric height fog with sun scattering replaces three's fog chunks for every material. Dynamic objects cast shadows only near the camera and rigs are culled out of view (`_dynLOD`); props are batched per 96 m cell with size-based draw distances. Settings has presets, output resolution and render scale; resolution adapts automatically while the window is focused.
- The grass field (Vegetation `_grass`) is one instanced draw call of blade clumps coloured from the terrain palette; counts per preset are in `PRESETS`.
- Photo textures are the 2K Poly Haven originals (`node tools/upgrade-textures.mjs` finds each source and downloads it); pack textures are 1024 px WebP (`TEX=1024 node tools/optimize-packs.mjs`).
- The town layer (src/world/Town.js) builds the City Pack downtown, small towns, roadside hamlets, the railway loop with its station and running trains, and the Eagle Peak fort.
- Floating pickups (first aid, bandages, water, food cans, an axe, a knife, a shovel and VIPER pistols) hover across the island; melee tools are carried in the hand and swung with the melee key. Wildlife (src/world/Animals.js) grazes the woods and the farm; hunting scores POINTS (bears fight back).
- STORY mode (default) is free roam: a hidden cache in every location, supply drops that fall near you, rolling bounties and location discovery (src/battleRoyale/Activities.js). BATTLE ROYALE mode in Settings brings back the shrinking zone.
- Vehicles burn fuel; jerrycans (loot) add 50%: stand next to the vehicle and press F, or use one from the inventory.
- Your companion (dragon or ghost skull) is picked in CHARACTER and joins after 3 kills; it never attacks civilians.
- The STORY campaign has six missions (STAGES in src/battleRoyale/Match.js). Each mission's objective is marked on the compass, minimap and map and by a cyan light beam. Survivors you find follow you and count once you lead them into the Civilian Survival Zone; mission 3 sends three Swarm patrols to the bunker, and the hive cores, the Titan and the Citadel points are guarded. Reaching a mission saves a checkpoint, and the menu offers CONTINUE from it.
- Loading: models download while textures are synthesised, and three.js is a separate cached chunk (vite.config.js). On LOW and MEDIUM, shadow maps refresh every other frame.
- Career (src/core/Career.js) saves lifetime points in the browser; seven ranks unlock a better starting loadout.
- Hostiles are the alien Swarm (Ultimate Monsters Bundle) with guns from the Ultimate Guns Pack; civilians flee them.
- Models are meshopt-compressed (`node tools/compress-meshes.mjs`); the loader decodes and unpacks them. Shaders compile during loading and again in parallel during the plane ride, so arriving somewhere new does not stall.
- Difficulty (EASY, NORMAL, HARD, EXPERT in `DIFFS`, src/core/Settings.js) sets the bots' aim, hearing, field of view, squad callouts, flanking, search time, suppressive fire, dodging and how strongly they focus on you.
- 98 bots are simulated. Those near you run full perception, path finding and ballistics; distant ones use a cheaper abstract simulation.
- `window.__dz` exposes the game object for debugging (`__dz.timeScale = 8` fast-forwards a match).
