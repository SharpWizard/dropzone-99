// HUD + menus + inventory + map + settings. Pure DOM/canvas overlay; reads game state, never owns it.
import { WEAPONS, AMMO_NAMES } from '../weapons/Weapons.js';
import { ITEMS, itemName } from '../inventory/Items.js';
import { ACTIONS, DIFFS } from '../core/Settings.js';
import { OUTFITS } from '../characters/Soldier.js';
import { GLB_OUTFITS, SoldierGLB } from '../characters/SoldierGLB.js';
import { HEROES, heroIndex } from '../characters/Heroes.js';
import { PETS } from '../characters/Pet.js';
import { PRESETS } from '../rendering/Gfx.js';
import { TOTAL, STAGES, loadCheckpoint } from '../battleRoyale/Match.js';
import { fmtTime, clamp, wrapAngle } from '../utils/math.js';
import { HALF, WORLD } from '../world/WorldData.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const WNAME = { frag: 'Frag Grenade', zone: 'the zone', fall: 'gravity', vehicle: 'a vehicle', crash: 'a crash', pet: 'companion', melee: 'melee' };

export class UI {
  constructor(G) {
    this.G = G; this.root = $('#ui'); this.panel = null; this.feedItems = []; this.threats = []; this.dmgInd = []; this.cache = {}; this._mmT = 0; this._invT = 0; this.marker = null; this.hurtK = 0; this.hitT = 0; this.toastT = 0; this.bannerT = 0; this.killT = 0; this.locName = ''; this.locT = 0;
    this.root.innerHTML = `
    <div id="quick"><button class="q-btn" id="q-sound" data-act="qsound"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="spk" d="M3 9h4l5-4v14l-5-4H3z"/><path class="wav" d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M16 9l6 6M22 9l-6 6"/></svg><kbd id="q-sk"></kbd></button><button class="q-btn q-cheat" id="q-cheat" data-act="qcheat"><b>∞</b><span>CHEATS</span><kbd id="q-ck"></kbd></button></div>
    <div id="hud" class="hidden">
      <div class="tl"><div class="alive"><b id="h-alive">99</b><span>ALIVE</span></div><div class="kills"><b id="h-kills">0</b><span>KILLS</span></div><div class="kills"><b id="h-pts">0</b><span>POINTS</span></div></div>
      <canvas id="compass" width="560" height="44"></canvas>
      <div class="tr"><div class="mm-wrap"><canvas id="minimap" width="220" height="220"></canvas><div class="mm-n">N</div></div>
        <div class="zone"><i id="z-ico"></i><span id="z-label">SAFE ZONE</span><b id="z-time">0:00</b><div class="zbar"><u id="z-fill"></u></div></div></div>
      <div id="feed"></div>
      <div class="bl"><div class="gear"><span id="g-helm" class="gi">H<i></i></span><span id="g-vest" class="gi">V<i></i></span><span id="g-pack" class="gi">B<i></i></span></div>
        <div class="bar boost"><u id="b-boost"></u></div><div class="bar hp"><u id="b-hp"></u><span id="t-hp">100</span></div><div class="bar st"><u id="b-st"></u></div></div>
      <div class="bc"><div id="slots"></div><div class="ammo"><b id="a-mag">0</b><span id="a-res">/ 0</span><em id="a-name"></em></div></div>
      <div class="br"><div class="mode" id="f-mode">AUTO</div><div class="cons" id="cons"></div></div>
      <div id="cross"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><i class="c-d"></i></div>
      <div id="scope"><i class="s-h"></i><i class="s-v"></i><i class="s-d"></i></div>
      <div id="hitm"><i></i><i></i><i></i><i></i></div>
      <div id="prompt"></div><div id="progress"><span id="p-label"></span><div><u id="p-fill"></u></div></div>
      <div id="toast"></div><div id="banner"><b></b><span></span></div><div id="killb"><b></b><span></span></div><div id="loc"></div>
      <div id="dmg"></div><div id="hurt"></div><div id="fps"></div><div id="spd"></div>
    </div>
    <div id="menu" class="screen hidden"></div><div id="panel" class="screen hidden"></div>`;
    this.hud = $('#hud'); this.menu = $('#menu'); this.pan = $('#panel');
    this.mm = $('#minimap').getContext('2d'); this.cp = $('#compass').getContext('2d');
    this.root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { G.audio.unlock(); G.audio.ui('click'); this.act(b.dataset.act, b.dataset.arg, b); } });
    this.root.addEventListener('mouseover', (e) => { const b = e.target.closest('.btn'); if (b && b !== this._hov) { this._hov = b; G.audio.ui('hover'); } });
    this.root.addEventListener('contextmenu', (e) => { e.preventDefault(); const b = e.target.closest('[data-drop]'); if (b) { G.player.dropItem(b.dataset.drop, e.shiftKey ? 1 : 9999); G.audio.ui('click'); this._inv(); } });
  }
  set(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; const e = document.getElementById(id); if (e) { e.textContent = v; if (id === 'h-kills' || id === 'h-pts' || id === 'h-alive') { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } } } }
  blocking() { return !!this.panel; }

  // ---------- menus ----------
  showMenu() {
    this.quick();
    this.panel = null; this.pan.classList.add('hidden'); this.hud.classList.add('hidden'); this.menu.classList.remove('hidden');
    this.menu.innerHTML = `<div class="m-left"><div class="logo">DROPZONE <b>99</b></div><div class="tag">DROP IN. GEAR UP. OUTLAST THEM ALL.</div><div class="tag" style="max-width:430px;opacity:.75;letter-spacing:.06em;line-height:1.5;text-transform:none;margin-top:6px">${this.G.career ? '<div class="career">RANK <b>' + this.G.career.summary().rank + '</b> · ' + this.G.career.summary().points + ' career pts · ' + this.G.career.summary().next + '</div>' : ''}They fell from the sky and the city went dark. Ninety-nine dropped in to take it back. Explore every street, save who you can, and be the last one standing.</div>
      <div class="m-btns">${this._startButtons()}<button class="btn" data-act="open" data-arg="character">CHARACTER</button><button class="btn" data-act="open" data-arg="settings">SETTINGS</button><button class="btn" data-act="open" data-arg="howto">HOW TO PLAY</button><button class="btn ghost" data-act="exit">EXIT</button></div></div>
      <div class="m-foot"><span>DROPZONE ISLAND · ${this.G.settings.d.difficulty} · ${this.G.gfx.presetName} GRAPHICS</span><span>v0.1 · WebGL2</span></div>`;
  }
  // CONTINUE (from the saved mission) + NEW CAMPAIGN, or a single START GAME
  _startButtons() { const S = this.G.settings.d, br = S.mode === 'BATTLE ROYALE', cp = !br && loadCheckpoint();
    if (cp) return '<button class="btn big" data-act="continue" data-arg="' + cp.stage + '"><span>CONTINUE</span><em>MISSION ' + cp.stage + ' · ' + STAGES[cp.stage][0] + '</em></button><button class="btn" data-act="start">NEW CAMPAIGN</button>';
    return '<button class="btn big" data-act="start"><span>START GAME</span><em>' + (br ? 'SOLO · BATTLE ROYALE · LAST ONE STANDING' : 'SOLO · MISSION 1 · ' + STAGES[1][0]) + '</em></button>'; }
  // corner toggles: reflect the current state and the bound keys
  quick() { const S = this.G.settings.d, s = $('#q-sound'), c = $('#q-cheat'); if (!s) return;
    s.classList.toggle('off', !!S.muted); c.classList.toggle('on', !!S.cheats); $('#q-sk').textContent = this.G.settings.label('mute'); $('#q-ck').textContent = this.G.settings.label('cheats');
    s.title = (S.muted ? 'Sound is OFF' : 'Sound is ON') + ' · click or press ' + this.G.settings.label('mute'); c.title = (S.cheats ? 'Cheats ON: unlimited health, ammo, grenades, meds, stamina and fuel' : 'Cheats OFF') + ' · click or press ' + this.G.settings.label('cheats'); }
  hideMenu() { this.menu.classList.add('hidden'); }
  open(name) {
    const G = this.G, S = G.settings.d; this.panel = name; this.pan.classList.remove('hidden'); this.pan.classList.toggle('clear', name === 'character'); G.input.unlock(); let h = '';
    const head = (t, sub = '') => `<div class="p-head"><h2>${t}</h2><span>${sub}</span><button class="btn sm" data-act="close">${G.state === 'menu' ? 'BACK' : 'CLOSE'}</button></div>`;
    if (name === 'pause') h = `<div class="p-box narrow">${head('PAUSED')}<div class="col"><button class="btn big" data-act="close"><span>RESUME</span></button><button class="btn" data-act="open" data-arg="settings">SETTINGS</button><button class="btn" data-act="open" data-arg="howto">HOW TO PLAY</button><button class="btn ghost" data-act="quit">QUIT TO MENU</button></div></div>`;
    else if (name === 'settings') {
      const opt = (act, list, cur) => list.map(v => `<button class="chip ${v === cur ? 'on' : ''}" data-act="${act}" data-arg="${v}">${v}</button>`).join('');
      const sl = (id, label, min, max, step, v) => `<label class="row"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><b id="${id}-v">${v}</b></label>`;
      const tg = (key, label) => `<label class="row"><span>${label}</span><button class="chip ${S[key] ? 'on' : ''}" data-act="toggle" data-arg="${key}">${S[key] ? 'ON' : 'OFF'}</button></label>`;
      h = `<div class="p-box">${head('SETTINGS')}<div class="grid2"><div><h3>GRAPHICS</h3><div class="row"><span>Preset</span><div>${opt('preset', Object.keys(PRESETS), G.gfx.presetName)}</div></div><div class="row"><span>Time of day</span><div>${opt('tod', ['auto', 'realtime', 'day'], localStorage.getItem('dz.tod') || 'auto')}</div></div><div class="row"><span>Render resolution</span><div>${opt('res', ['auto', '1080', '1440', 'native'], localStorage.getItem('dz.res') || 'auto')}</div></div><div class="row"><span>Render scale</span><div>${opt('rscale', ['70%', '85%', '100%', '125%'], (localStorage.getItem('dz.rscale') || '100') + '%')}</div></div><p class="note">Changing the preset reloads the game. Resolution also scales automatically to hold frame rate.</p>
        ${sl('s-fov', 'Field of view', 60, 95, 1, S.fov)}<div class="row"><span>Camera view</span><div>${opt('view', ['third', 'first'], S.view || 'third')}</div></div>${sl('s-cam', 'Camera distance', 1.2, 8, 0.1, (S.camDist || 3.1).toFixed(1))}${tg('showFps', 'Show FPS')}<h3>GAMEPLAY</h3><div class="row"><span>Game mode</span><div>${opt('gmode', ['STORY', 'BATTLE ROYALE'], S.mode || 'STORY')}</div></div><div class="row"><span>Difficulty</span><div>${opt('diff', Object.keys(DIFFS), S.difficulty)}</div></div>${tg('autoPickup', 'Auto pick-up')}
        <h3>CONTROLS</h3>${sl('s-sens', 'Mouse sensitivity', 0.2, 3, 0.05, S.sens)}${sl('s-ads', 'Aim sensitivity', 0.2, 2, 0.05, S.adsSens)}${tg('invertY', 'Invert Y')}<h3>AUDIO</h3>${sl('s-vol', 'Master volume', 0, 1, 0.05, S.volume)}</div>
        <div><h3>KEY BINDINGS <small>click to rebind</small></h3><div class="keys">${ACTIONS.map(([a, l]) => `<div class="krow"><span>${l}</span><button class="chip key" data-act="bind" data-arg="${a}">${G.settings.label(a)}</button></div>`).join('')}<div class="krow"><span>Shoot / Aim</span><b class="fixed">LMB / RMB</b></div><div class="krow"><span>Pause</span><b class="fixed">ESC</b></div></div><button class="btn sm" data-act="resetkeys">RESET BINDINGS</button></div></div></div>`;
    } else if (name === 'howto') {
      const k = (a) => `<kbd>${G.settings.label(a)}</kbd>`;
      h = `<div class="p-box">${head('HOW TO PLAY')}<div class="grid2"><div><h3>THE MATCH</h3><ol class="steps"><li><b>Deploy.</b> Press ${k('interact')} to leave the plane. Look down to dive faster, ignite the jetpack with ${k('interact')} and fly it down anywhere, rooftops included.</li><li><b>Loot.</b> Buildings hold weapons, armor and meds. Walk over ammo to grab it, press ${k('interact')} for the rest.</li>${G.match.br() ? '<li><b>Survive.</b> Stay inside the blue zone. The white circle on the map is the next safe area.</li><li><b>Win.</b> Be the last of 99 standing.</li>' : '<li><b>Explore.</b> STORY mode is free roam: follow the six missions, find a hidden cache in every location, grab supply drops and complete bounties.</li><li><b>Win.</b> Finish the final assault on the Citadel. (BATTLE ROYALE mode in Settings brings back the shrinking zone.)</li>'}</ol>
        <h3>TIPS</h3><ul class="tips"><li>Headshots deal 2.3x. Helmets and vests soak damage until they break.</li><li>Crouching or going prone tightens your spread and makes you harder to spot.</li><li>Gunfire and sprinting draw enemies. A suppressor keeps you quiet.</li><li>Vehicles are fast but loud. Watch the fuel gauge: a jerrycan adds 50% (stand by the vehicle and press ${k('interact')}, or use it from the inventory).</li><li>Bandages heal to 75. Energy drinks regenerate the rest.</li><li>Get 3 kills to earn a flying companion (dragon hurls fireballs, ghost skull fires spectral bolts).</li><li>Jetpack flies like a vehicle: W speed up, S brake, A/D turn, SPACE climb (uses fuel), SHIFT descend. Land anywhere, rooftops included.</li></ul><h3>CREDITS</h3><p class="note">3D models from poly.pizza. CC-BY 3.0: Alex Safayan, Bruno Oliveira, CMHT Oculus, Danni Bittman, Darwin Yamamoto, Francisco Hui, Ignition Labs, J-Toastie, Jakers_H, Jarlan Perez, Jens Kull, Julien Kleber (Juliusprod), Nick Slough, Poly by Google, Quaternius (Witch, Worker and Suit heroes), Zsky, dook, jeremy, madtrollstudio. CC0: CreativeTrio, Kay Lousberg, Kenney, Quaternius. Full list in CREDITS.md.</p></div>
        <div><h3>CONTROLS</h3><div class="keys">${[['Move', k('forward') + k('left') + k('back') + k('right')], ['Look / Shoot / Aim', '<kbd>MOUSE</kbd><kbd>LMB</kbd><kbd>RMB</kbd>'], ['Sprint / Jump', k('sprint') + k('jump')], ['Crouch / Prone', k('crouch') + k('prone')], ['Reload / Fire mode', k('reload') + k('firemode')], ['Interact', k('interact')], ['Weapons', k('slot1') + k('slot2') + k('slot3') + k('slot4')], ['Bandage / Kit / Drink', k('heal1') + k('heal2') + k('heal3')], ['Shoulder / Camera', k('shoulder') + k('camera')], ['Inventory / Map', k('inventory') + k('map')], ['Vehicle', k('forward') + k('back') + ' steer ' + k('left') + k('right') + ' brake ' + k('jump')]].map(([a, b]) => `<div class="krow"><span>${a}</span><div>${b}</div></div>`).join('')}</div></div></div></div>`;
    } else if (name === 'character') {
      h = `<div class="p-box narrow right">${head('CHARACTER')}<label class="row"><span>Callsign</span><input type="text" id="c-name" maxlength="14" value="${S.name.replace(/"/g, '')}"></label><h3>HERO</h3><div class="heroes">${HEROES.map((h, i) => `<button class="herocard ${i === heroIndex(S.hero) ? 'on' : ''}" data-act="hero" data-arg="${h.id}" style="--hc:#${h.accent.toString(16).padStart(6, '0')}"><b>${h.name}</b><span>${h.role}</span><em>${h.blurb}</em></button>`).join('')}</div><h3>COMPANION <small>joins you after 3 kills</small></h3><div class="heroes">${Object.entries(PETS).map(([k, p]) => `<button class="herocard ${k === (S.pet || 'dragon') ? 'on' : ''}" data-act="pet" data-arg="${k}" style="--hc:rgb(${p.halo.map(v => Math.round(v / Math.max(...p.halo) * 255)).join(',')})"><b>${p.name}</b><em>${k === 'dragon' ? 'Hurls fireballs that burst on impact' : 'Fires fast spectral bolts'}</em></button>`).join('')}</div></div>`;
    } else if (name === 'inventory') h = `<div class="p-box wide inv">${head('INVENTORY', 'Left click: use / equip / attach &nbsp;·&nbsp; Right click: drop')}<div class="inv3"><div><h3>VICINITY</h3><div id="i-near" class="ilist"></div></div><div><h3>BACKPACK <small id="i-cap"></small></h3><div class="capbar"><u id="i-capfill"></u></div><div id="i-bag" class="ilist"></div></div><div><h3>LOADOUT</h3><div id="i-load"></div></div></div></div>`;
    else if (name === 'map') h = `<div class="p-box mapbox">${head('DROPZONE ISLAND', 'Click to place a marker')}<canvas id="bigmap" width="760" height="760"></canvas></div>`;
    this.pan.innerHTML = h;
    if (name === 'settings') { const bind = (id, key, f) => { const e = $('#' + id); e.addEventListener('input', () => { S[key] = parseFloat(e.value); $('#' + id + '-v').textContent = e.value; G.settings.save(); if (f) f(S[key]); }); }; bind('s-fov', 'fov'); bind('s-cam', 'camDist', v => { G.player.camDist = v; }); bind('s-sens', 'sens'); bind('s-ads', 'adsSens'); bind('s-vol', 'volume', v => { if (!S.muted) G.audio.setVolume(v); }); }
    if (name === 'character') { const n = $('#c-name'); n.addEventListener('input', () => { S.name = n.value.trim().toUpperCase() || 'YOU'; G.settings.save(); }); }
    if (name === 'inventory') this._inv();
    if (name === 'map') { const c = $('#bigmap'); c.addEventListener('click', (e) => { const r = c.getBoundingClientRect(); this.marker = { x: (e.clientX - r.left) / r.width * WORLD - HALF, z: (e.clientY - r.top) / r.height * WORLD - HALF }; this._bigmap(); }); c.addEventListener('contextmenu', () => { this.marker = null; this._bigmap(); }); this._bigmap(); }
  }
  close() { const G = this.G; if (!this.panel) return; const was = this.panel; this.panel = null; this.pan.classList.add('hidden'); this.pan.innerHTML = ''; if (G.state === 'menu') { if (was !== 'character') G.setMenuCam(0); else G.setMenuCam(0); return; } if (G.state === 'paused') G.resume(); else G.input.lock(); }

  act(a, arg, btn) {
    const G = this.G, S = G.settings.d;
    if (a === 'qsound') { G.toggleSound(); return; } if (a === 'qcheat') { G.toggleCheats(); return; }
    if (a === 'start' || a === 'again') G.startMatch(); else if (a === 'continue') G.startMatch({ stage: +arg }); else if (a === 'open') { if (arg === 'character') G.setMenuCam(1); this.open(arg); } else if (a === 'close') { if (this.panel && this.panel !== 'pause' && G.state === 'paused') this.open('pause'); else this.close(); }
    else if (a === 'quit' || a === 'tomenu') G.toMenu(); else if (a === 'exit') { this.menu.innerHTML = `<div class="m-left"><div class="logo">DROPZONE <b>99</b></div><div class="tag">THANKS FOR PLAYING</div><div class="m-btns"><button class="btn big" data-act="back"><span>RETURN</span></button></div></div>`; }
    else if (a === 'back') this.showMenu();
    else if (a === 'view') { S.view = arg; G.settings.save(); G.player.fpp = arg === 'first'; this.open('settings'); }
    else if (a === 'tod') { G.env.setMode(arg); this.open('settings'); }
    else if (a === 'rscale') { localStorage.setItem('dz.rscale', arg.replace('%', '')); G.gfx.resize(); this.open('settings'); }
    else if (a === 'res') { localStorage.setItem('dz.res', arg); G.gfx.resMode = arg; G.gfx.resize(); this.open('settings'); }
        else if (a === 'preset') { localStorage.setItem('dz.preset', arg); location.reload(); }
    else if (a === 'gmode') { S.mode = arg; G.settings.save(); if (G.state === 'play' || G.state === 'paused') this.toast('GAME MODE CHANGES NEXT MATCH'); this.open('settings'); }
    else if (a === 'diff') { S.difficulty = arg; G.settings.save(); this.open('settings'); }
    else if (a === 'toggle') { S[arg] = !S[arg]; G.settings.save(); this.open('settings'); }
    else if (a === 'bind') { btn.textContent = 'PRESS KEY'; btn.classList.add('on'); G.input.capture = (code) => { if (code !== 'Escape') { S.keys[arg] = code; G.settings.save(); this.quick(); } this.open('settings'); }; }
    else if (a === 'resetkeys') { for (const [k, , c] of ACTIONS) S.keys[k] = c; G.settings.save(); this.open('settings'); }
    else if (a === 'pet') { S.pet = arg; G.settings.save(); if (G.pet && G.pet.unlocked) G.pet.setKind(arg); this.open('character'); }
    else if (a === 'hero') { S.hero = arg; G.settings.save(); G.player.setHero(S.hero); this.open('character'); }
    else if (a === 'outfit') { S.outfit = +arg; G.settings.save(); G.player.outfit = S.outfit; if (G.player.soldier) G.player.soldier.setOutfit(S.outfit); this.open('character'); }
    else if (a === 'take') { const it = this._nearItems && this._nearItems[+arg]; if (it && it.alive) G.player.pickup(it); this._inv(); }
    else if (a === 'use') { const p = G.player, d = ITEMS[arg]; if (d.type === 'heal') { p.tryHeal(arg); this.close(); } else if (d.type === 'scope' || d.type === 'supp') { if (!p.attach(arg)) this.toast('CANNOT ATTACH TO THIS WEAPON'); this._inv(); } else if (d.type === 'throw') { p.switchTo(3); this.close(); } else if (d.type === 'fuel') { if (p.refuel()) this._inv(); } }
    else if (a === 'slot') { G.player.switchTo(+arg); this._inv(); } else if (a === 'dropw') { G.player.dropWeapon(+arg); this._inv(); } else if (a === 'detach') { const [s, w] = arg.split(':'); G.player.detach(+s, w); this._inv(); }
  }

  _inv() {
    if (this.panel !== 'inventory') return; const G = this.G, p = G.player;
    const near = this._nearItems = G.loot.near(p.pos.x, p.pos.z, 3.2, []).filter(i => i.alive && Math.abs(i.y - p.pos.y) < 1.8).slice(0, 14);
    $('#i-near').innerHTML = near.length ? near.map((it, i) => `<button class="item" data-act="take" data-arg="${i}"><i class="ic ${ITEMS[it.id].type}"></i><span>${itemName(it.id)}</span><b>${it.n > 1 ? 'x' + it.n : ''}</b></button>`).join('') : '<p class="empty">Nothing within reach</p>';
    const order = ['heal', 'throw', 'fuel', 'ammo', 'scope', 'supp']; const keys = Object.keys(p.bag).filter(k => p.bag[k] > 0).sort((a, b) => order.indexOf(ITEMS[a].type) - order.indexOf(ITEMS[b].type));
    $('#i-bag').innerHTML = keys.length ? keys.map(k => `<button class="item" data-act="use" data-arg="${k}" data-drop="${k}"><i class="ic ${ITEMS[k].type}"></i><span>${itemName(k)}</span><b>x${p.bag[k]}</b></button>`).join('') : '<p class="empty">Backpack is empty</p>';
    const w = p.weight(), c = p.capacity(); $('#i-cap').textContent = Math.round(w) + ' / ' + c; $('#i-capfill').style.width = clamp(w / c * 100, 0, 100) + '%';
    const slot = (i, label) => { const wp = p.weapons[i]; if (!wp) return `<div class="wslot empty"><em>${label}</em><span>EMPTY</span></div>`; const d = WEAPONS[wp.id]; return `<div class="wslot ${p.cur === i ? 'on' : ''}"><em>${label} · ${d.cls}</em><button class="wname" data-act="slot" data-arg="${i}">${d.name}</button><span>${wp.ammo} / ${p.ammoFor(d)} · ${AMMO_NAMES[d.ammo]}</span><div class="atts">${wp.scope ? `<button class="chip on" data-act="detach" data-arg="${i}:scope">${wp.scope}x SCOPE ✕</button>` : d.baseScope ? `<span class="chip">${d.baseScope}x BUILT-IN</span>` : ''}${wp.supp ? `<button class="chip on" data-act="detach" data-arg="${i}:supp">SUPPRESSOR ✕</button>` : ''}<button class="chip" data-act="dropw" data-arg="${i}">DROP</button></div></div>`; };
    const arm = (o, n) => `<div class="arm"><em>${n}</em><span>${o.lvl ? 'LEVEL ' + o.lvl : 'NONE'}</span>${o.lvl ? `<div class="capbar"><u style="width:${clamp(o.dur / ITEMS[(n === 'HELMET' ? 'helmet' : 'vest') + o.lvl].dur * 100, 0, 100)}%"></u></div>` : ''}</div>`;
    $('#i-load').innerHTML = slot(0, 'PRIMARY') + slot(1, 'SECONDARY') + slot(2, 'SIDEARM') + `<div class="arms">${arm(p.helmet, 'HELMET')}${arm(p.vest, 'BODY ARMOR')}<div class="arm"><em>BACKPACK</em><span>${p.pack ? 'LEVEL ' + p.pack : 'NONE'}</span></div></div>`;
  }

  // ---------- map ----------
  _w2m(x, size) { return (x + HALF) / WORLD * size; }
  _mapOverlay(ctx, size, lw) {
    const G = this.G, Z = G.zone, M = G.match, s = size / WORLD;
    if (M.plane.mesh.visible) { ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.setLineDash([lw * 5, lw * 4]); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(this._w2m(M.org.x, size), this._w2m(M.org.z, size)); ctx.lineTo(this._w2m(M.org.x + M.dir.x * M.len, size), this._w2m(M.org.z + M.dir.z * M.len, size)); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.translate(this._w2m(M.plane.pos.x, size), this._w2m(M.plane.pos.z, size)); ctx.rotate(Math.PI - M.plane.yaw); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -lw * 6); ctx.lineTo(lw * 5, lw * 5); ctx.lineTo(0, lw * 2); ctx.lineTo(-lw * 5, lw * 5); ctx.fill(); ctx.restore(); }
    if (Z.active || M.state !== 'idle') { if (Z.active) { ctx.strokeStyle = '#3aa0ff'; ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.arc(this._w2m(Z.cx, size), this._w2m(Z.cz, size), Z.r * s, 0, 6.283); ctx.stroke(); ctx.fillStyle = 'rgba(40,110,255,.16)'; ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.arc(this._w2m(Z.cx, size), this._w2m(Z.cz, size), Z.r * s, 0, 6.283, true); ctx.fill('evenodd'); }
      if (Z.active && Z.nr > 1) { ctx.strokeStyle = '#fff'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(this._w2m(Z.nx, size), this._w2m(Z.nz, size), Z.nr * s, 0, 6.283); ctx.stroke(); } }
    if (G.activities) G.activities.drawMap(ctx, (v) => this._w2m(v, size), lw);
    if (G.match) G.match.drawObjectives(ctx, (v) => this._w2m(v, size), lw);
    if (this.marker) { const mx = this._w2m(this.marker.x, size), mz = this._w2m(this.marker.z, size); ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(mx, mz); ctx.lineTo(mx - lw * 4, mz - lw * 9); ctx.lineTo(mx + lw * 4, mz - lw * 9); ctx.fill(); }
  }
  _bigmap() {
    const c = $('#bigmap'); if (!c) return; const ctx = c.getContext('2d'), size = c.width, G = this.G; ctx.drawImage(G.mapCanvas, 0, 0, size, size); this._mapOverlay(ctx, size, 1.6);
    ctx.font = '600 13px Bahnschrift, Arial Narrow, sans-serif'; ctx.textAlign = 'center';
    for (const L of G.world.locations) { const x = this._w2m(L.x, size), y = this._w2m(L.z, size) - 6; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(L.name, x + 1, y + 1); ctx.fillStyle = '#f2ecd8'; ctx.fillText(L.name, x, y); }
    for (const v of G.vehicles.list) if (!v.dead) { ctx.fillStyle = '#d8d4c8'; ctx.fillRect(this._w2m(v.pos.x, size) - 2.5, this._w2m(v.pos.z, size) - 2.5, 5, 5); }
    const p = G.player; ctx.save(); ctx.translate(this._w2m(p.pos.x, size), this._w2m(p.pos.z, size)); ctx.rotate(Math.PI - p.camYaw); ctx.fillStyle = '#ffb02e'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  _minimap() {
    const G = this.G, ctx = this.mm, S = 220, p = G.player; const range = p.mode === 'plane' || p.mode === 'fall' ? 620 : p.mode === 'seat' ? 300 : 190; const ms = G.mapCanvas.width / WORLD;
    ctx.fillStyle = '#16303a'; ctx.fillRect(0, 0, S, S);
    const sx = (p.pos.x + HALF - range) * ms, sz = (p.pos.z + HALF - range) * ms, sw = range * 2 * ms; ctx.drawImage(G.mapCanvas, sx, sz, sw, sw, 0, 0, S, S);
    ctx.save(); const k = S / (range * 2); ctx.translate(S / 2 - p.pos.x * k - HALF * k, S / 2 - p.pos.z * k - HALF * k); this._mapOverlay(ctx, WORLD * k, 1.5 / 1);
    for (const v of G.vehicles.list) if (!v.dead && !v.driver) { ctx.fillStyle = '#e8e4d8'; ctx.fillRect((v.pos.x + HALF) * k - 3, (v.pos.z + HALF) * k - 3, 6, 6); }
    for (const t of this.threats) { ctx.fillStyle = `rgba(255,70,50,${clamp(t.t / 2.2, 0, 1)})`; ctx.beginPath(); ctx.arc((t.x + HALF) * k, (t.z + HALF) * k, 4, 0, 6.283); ctx.fill(); }
    ctx.restore();
    // line to the next zone when outside it
    const Z = G.zone; if (Z.active) { const dx = Z.nx - p.pos.x, dz = Z.nz - p.pos.z, d = Math.hypot(dx, dz); if (d > Z.nr) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.lineTo(S / 2 + dx * k, S / 2 + dz * k); ctx.stroke(); ctx.setLineDash([]); } }
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(Math.PI - p.camYaw); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 70, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.fill();
    ctx.fillStyle = '#ffb02e'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  _compass() {
    const G = this.G, ctx = this.cp, W = 560, H = 44, p = G.player; ctx.clearRect(0, 0, W, H);
    const hdg = ((Math.atan2(Math.sin(p.camYaw), -Math.cos(p.camYaw)) * 180 / Math.PI) + 360) % 360; const ppd = 3.6; ctx.textAlign = 'center';
    for (let d = Math.floor((hdg - 80) / 5) * 5; d <= hdg + 80; d += 5) { const x = W / 2 + (d - hdg) * ppd; const dd = ((d % 360) + 360) % 360; const fade = clamp(1 - Math.abs(d - hdg) / 78, 0, 1); ctx.globalAlpha = fade;
      if (dd % 45 === 0) { const n = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][dd / 45]; ctx.fillStyle = dd === 0 ? '#ff5a1f' : '#ece8dc'; ctx.font = (dd % 90 === 0 ? '700 17px' : '600 12px') + ' Bahnschrift, Arial Narrow, sans-serif'; ctx.fillText(n, x, 17); ctx.fillRect(x - 1, 24, 2, 9); }
      else if (dd % 15 === 0) { ctx.fillStyle = 'rgba(236,232,220,.8)'; ctx.font = '500 10px Bahnschrift, Arial Narrow, sans-serif'; ctx.fillText(dd, x, 16); ctx.fillRect(x - 0.5, 25, 1, 7); } else { ctx.fillStyle = 'rgba(236,232,220,.5)'; ctx.fillRect(x - 0.5, 27, 1, 4); } }
    const mark = (wx, wz, col) => { const b = ((Math.atan2(wx - p.pos.x, -(wz - p.pos.z)) * 180 / Math.PI) + 360) % 360; let dl = b - hdg; if (dl > 180) dl -= 360; if (dl < -180) dl += 360; if (Math.abs(dl) < 76) { ctx.globalAlpha = 1; ctx.fillStyle = col; const x = W / 2 + dl * ppd; ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x - 5, 35); ctx.lineTo(x + 5, 35); ctx.fill(); } };
    if (this.marker) mark(this.marker.x, this.marker.z, '#ffb02e'); if (G.zone.active && G.zone.outside(p.pos.x, p.pos.z)) mark(G.zone.cx, G.zone.cz, '#3aa0ff'); else if (G.zone.active && Math.hypot(p.pos.x - G.zone.nx, p.pos.z - G.zone.nz) > G.zone.nr) mark(G.zone.nx, G.zone.nz, '#ffffff');
    for (const t of this.threats) mark(t.x, t.z, `rgba(255,70,50,${clamp(t.t / 2.2, 0, 1)})`);
    if (G.activities) for (const m of G.activities.marks()) mark(m.x, m.z, m.col);
    if (G.match) for (const o of G.match.objectives()) if (o.main) mark(o.x, o.z, o.kind === 'foe' ? '#ff5a4a' : '#5fe6ff');
    ctx.globalAlpha = 1; ctx.fillStyle = '#ff5a1f'; ctx.fillRect(W / 2 - 1, 22, 2, 14); ctx.fillStyle = '#ece8dc'; ctx.font = '700 11px Consolas, monospace'; ctx.fillText(Math.round(hdg) + '°', W / 2, 44);
  }

  // ---------- events ----------
  toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); this.toastT = 1.8; }
  banner(a, b) { const e = $('#banner'); e.children[0].textContent = a; e.children[1].textContent = b || ''; e.classList.add('on'); this.bannerT = 4; }
  killBanner(name, kills, head) { const e = $('#killb'); e.children[0].textContent = (head ? 'HEADSHOT · ' : 'ELIMINATED · ') + name; e.children[1].textContent = kills + (kills === 1 ? ' KILL' : ' KILLS'); e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); this.killT = 3; }
  pickup(id) { this.toast('+ ' + itemName(id).toUpperCase()); if (this.panel === 'inventory') this._inv(); }
  hitMarker(head, kill) { const e = $('#hitm'); e.className = 'on' + (kill ? ' kill' : head ? ' head' : ''); this.hitT = kill ? 0.35 : 0.16; this.G.audio.hit(head); }
  threat(x, z) { for (const t of this.threats) if (Math.hypot(t.x - x, t.z - z) < 12) { t.t = 2.2; t.x = x; t.z = z; return; } if (this.threats.length < 12) this.threats.push({ x, z, t: 2.2 }); }
  // HUD jolt: the whole overlay kicks for a moment (1 light, 2 heavy)
  // score popup that floats up beside the crosshair
  pointsPop(n, label = '') { const e = document.createElement('div'); e.className = 'ptpop'; e.innerHTML = '<b>+' + n + '</b>' + (label ? '<span>' + label + '</span>' : ''); document.body.appendChild(e); setTimeout(() => e.remove(), 1300); }
  shakeHud(k = 1) { const e = document.getElementById('hud'); if (!e) return; e.classList.remove('jolt', 'jolt2'); void e.offsetWidth; e.classList.add(k > 1 ? 'jolt2' : 'jolt'); }
  hurt(amount, x, z) { this.hurtK = Math.min(1.2, this.hurtK + 0.3 + amount * 0.02); const d = el('i'); $('#dmg').appendChild(d); this.dmgInd.push({ e: d, x, z, t: 1.4 }); if (this.dmgInd.length > 6) { const o = this.dmgInd.shift(); o.e.remove(); } }
  feed(killer, victim, wid, head) {
    const pl = this.G.player; const me = killer === pl || victim === pl; const how = WEAPONS[wid] ? WEAPONS[wid].name : (WNAME[wid] || '');
    const txt = killer ? `<b class="${killer === pl ? 'me' : ''}">${killer.name}</b><em>${head ? '◎ ' : ''}${how}</em><b class="${victim === pl ? 'me' : ''}">${victim.name}</b>` : `<b class="${victim === pl ? 'me' : ''}">${victim.name}</b><em>died to ${how || 'the island'}</em>`;
    const e = el('div', 'fi' + (me ? ' mine' : ''), txt); const f = $('#feed'); f.prepend(e); this.feedItems.push({ e, t: 6 }); while (this.feedItems.length > 6) this.feedItems.shift().e.remove();
  }
  // Radial weapon selector: hold the key, flick the mouse toward a segment, release to equip.
  wheelUpdate(I, p) {
    const G = this.G, S = G.settings; const open = G.state === 'play' && !this.panel && p.alive && p.mode !== 'plane' && I.is('wheel');
    if (!this.ww) { const e = this.ww = document.createElement('div'); e.id = 'wwheel'; e.className = 'hidden'; this.hud.appendChild(e); this.wwOpen = false; }
    const has = (i) => i === 3 ? !!p.bag.frag : !!p.weapons[i];
    if (open && !this.wwOpen) { this.wwOpen = true; this.wwV = [0, 0]; this.wwSel = -1;
      const seg = (i, label) => { const x = i < 3 ? p.weapons[i] : null, d = x ? WEAPONS[x.id] : null; const name = i === 3 ? 'FRAG GRENADE' : d ? d.name : 'EMPTY'; const info = i === 3 ? 'x' + (p.bag.frag || 0) : d ? x.ammo + ' / ' + p.ammoFor(d) : '—';
        return `<div class="ww-seg s${i} ${has(i) ? '' : 'none'} ${p.cur === i ? 'cur' : ''}" data-i="${i}"><em>${label} · ${S.label('slot' + (i + 1))}</em>${wicon(i === 3 ? 'FRAG' : d ? d.cls : 'AR')}<b>${name}</b><span>${info}</span></div>`; };
      this.ww.innerHTML = `<div class="ww-ring"></div><div class="ww-scan"></div><div class="ww-core"><b id="ww-name">SELECT</b><span>RELEASE ${S.label('wheel')} TO EQUIP</span></div>${seg(0, 'PRIMARY')}${seg(1, 'SECONDARY')}${seg(2, 'SIDEARM')}${seg(3, 'THROWABLE')}<i id="ww-dot"></i>`;
      this.ww.classList.remove('hidden'); }
    if (this.wwOpen) {
      const v = this.wwV; v[0] += I.mx * 0.9; v[1] += I.my * 0.9; const l = Math.hypot(v[0], v[1]); if (l > 130) { v[0] *= 130 / l; v[1] *= 130 / l; } I.mx = 0; I.my = 0; I.mb[0] = false; I.mhit[0] = false; I.mb[1] = false; I.mhit[1] = false; I.wheel = 0;
      let sel = -1; if (l > 30) sel = Math.abs(v[0]) > Math.abs(v[1]) ? (v[0] > 0 ? 1 : 3) : (v[1] < 0 ? 0 : 2);
      for (let i = 0; i < 4; i++) if (I.pressed('slot' + (i + 1))) { sel = i; v[0] = [0, 90, 0, -90][i]; v[1] = [-90, 0, 90, 0][i]; }
      if (sel !== this.wwSel) { this.wwSel = sel; this.ww.querySelectorAll('.ww-seg').forEach(e => e.classList.toggle('on', +e.dataset.i === sel)); const n = this.ww.querySelector('.ww-seg.on b'); $('#ww-name').textContent = n ? n.textContent : 'SELECT'; if (sel >= 0) G.audio.reload(1); }
      const dot = $('#ww-dot'); if (dot) dot.style.transform = `translate(${v[0]}px, ${v[1]}px)`;
      if (!open) { this.wwOpen = false; this.ww.classList.add('hidden'); if (this.wwSel >= 0 && has(this.wwSel) && this.wwSel !== p.cur) p.switchTo(this.wwSel); }
    }
  }
  onMatchStart() { this.hideMenu(); this.pan.classList.add('hidden'); this.panel = null; this.hud.classList.remove('hidden'); $('#feed').innerHTML = ''; this.feedItems.length = 0; this.threats.length = 0; this.cache = {}; this.marker = null; $('#slots').innerHTML = ''; this.hurtK = 0; this.locName = ''; }
  showEnd(r) {
    this.G.input.unlock(); this.panel = 'end'; this.pan.classList.remove('hidden');
    this.pan.innerHTML = `<div class="end ${r.win ? 'win' : 'lose'}"><div class="e-top">DROPZONE <b>99</b></div><h1>${r.win ? (this.G.mission && this.G.mission.won ? 'MISSION COMPLETE' : 'WINNER!') : (this.G.mission ? 'MISSION FAILED' : 'ELIMINATED')}</h1><div class="e-sub">${r.win ? (this.G.mission && this.G.mission.won ? 'THE RESISTANCE PREVAILS' : 'YOU ARE THE LAST SURVIVOR') : 'THE MACHINES HAVE YOU'}</div>
      <div class="e-rank"><b>#${r.rank}</b><span>/ ${TOTAL}</span></div>
      ${r.rankUp ? '<div class="rankup">RANK UP · ' + r.rankUp + '</div>' : ''}${r.cheated ? '<div class="career">CHEATS USED · career progress not saved</div>' : ''}${r.career ? '<div class="career">RANK <b>' + r.career.rank + '</b> · ' + r.career.points + ' career pts · ' + r.career.next + '</div>' : ''}<div class="e-stats"><div><b>${r.kills}</b><span>KILLS</span></div><div><b>${r.points || 0}</b><span>POINTS</span></div><div><b>${r.damage}</b><span>DAMAGE DEALT</span></div><div><b>${fmtTime(r.time)}</b><span>SURVIVAL TIME</span></div><div><b>${r.accuracy}%</b><span>ACCURACY</span></div><div><b>${r.headshots}</b><span>HEADSHOTS</span></div></div>
      <div class="e-btns"><button class="btn big" data-act="again"><span>PLAY AGAIN</span></button><button class="btn" data-act="tomenu">MAIN MENU</button></div></div>`;
  }

  // ---------- per frame ----------
  update(dt) {
    const G = this.G, p = G.player; if (this.hud.classList.contains('hidden')) return;
    const S = G.settings; const w = p.weapon(), def = p.def();
    this.set('h-alive', G.match.alive); this.set('h-kills', p.kills); this.set('h-pts', p.points || 0); document.body.classList.toggle('lowhp', p.alive && p.hp < 30 && G.state === 'play');
    const hp = Math.ceil(p.hp); if (this.cache.hp !== hp) { this.cache.hp = hp; $('#b-hp').style.width = hp + '%'; $('#t-hp').textContent = hp; $('#b-hp').className = hp < 25 ? 'crit' : hp < 50 ? 'low' : ''; }
    const st = Math.round(p.stamina); if (this.cache.st !== st) { this.cache.st = st; $('#b-st').style.width = st + '%'; } const bo = Math.round(p.boost); if (this.cache.bo !== bo) { this.cache.bo = bo; $('#b-boost').style.width = bo + '%'; }
    const gk = p.helmet.lvl + ':' + Math.round(p.helmet.dur / 10) + ':' + p.vest.lvl + ':' + Math.round(p.vest.dur / 10) + ':' + p.pack;
    if (this.cache.gk !== gk) { this.cache.gk = gk; const g = (id, o, max) => { const e = $(id); e.className = 'gi l' + o.lvl; e.firstElementChild.style.height = (o.lvl ? clamp(o.dur / max * 100, 0, 100) : 0) + '%'; e.dataset.l = o.lvl || ''; }; g('#g-helm', p.helmet, p.helmet.lvl ? ITEMS['helmet' + p.helmet.lvl].dur : 1); g('#g-vest', p.vest, p.vest.lvl ? ITEMS['vest' + p.vest.lvl].dur : 1); const pk = $('#g-pack'); pk.className = 'gi l' + p.pack; pk.dataset.l = p.pack || ''; pk.firstElementChild.style.height = p.pack ? '100%' : '0'; }
    // weapon slots
    const sk = p.cur + '|' + p.weapons.map(x => x ? x.id + x.scope + x.supp : '-').join(',') + '|' + (p.bag.frag || 0) + S.d.keys.slot1;
    if (this.cache.sk !== sk) { this.cache.sk = sk; $('#slots').innerHTML = [0, 1, 2].map(i => { const x = p.weapons[i]; return `<div class="slot ${p.cur === i ? 'on' : ''} ${x ? '' : 'none'}"><kbd>${S.label('slot' + (i + 1))}</kbd>${x ? wicon(WEAPONS[x.id].cls) : ''}<span>${x ? WEAPONS[x.id].name : '—'}</span>${x && (x.scope || WEAPONS[x.id].baseScope) ? `<em>${x.scope || WEAPONS[x.id].baseScope}x</em>` : ''}${x && x.supp ? '<em>S</em>' : ''}</div>`; }).join('') + `<div class="slot gren ${p.cur === 3 ? 'on' : ''} ${p.bag.frag ? '' : 'none'}"><kbd>${S.label('slot4')}</kbd>${wicon('FRAG')}<span>FRAG</span><em>${p.bag.frag || 0}</em></div>`; }
    if (p.cur === 3) { this.set('a-mag', p.bag.frag || 0); this.set('a-res', ''); this.set('a-name', 'FRAG GRENADE'); this.set('f-mode', 'THROW'); }
    else if (w) { this.set('a-mag', w.ammo); this.set('a-res', '/ ' + p.ammoFor(def)); this.set('a-name', AMMO_NAMES[def.ammo]); this.set('f-mode', def.modes[w.mode || 0]); const low = w.ammo <= def.mag * 0.25; if (this.cache.low !== low) { this.cache.low = low; $('#a-mag').className = low ? 'low' : ''; } }
    else { this.set('a-mag', ''); this.set('a-res', ''); this.set('a-name', 'UNARMED'); this.set('f-mode', 'NO WEAPON'); }
    const ck = (p.bag.bandage || 0) + ':' + (p.bag.medkit || 0) + ':' + (p.bag.drink || 0) + S.d.keys.heal1;
    if (this.cache.ck !== ck) { this.cache.ck = ck; $('#cons').innerHTML = [['bandage', 'heal1', 'BANDAGE'], ['medkit', 'heal2', 'FIRST AID'], ['drink', 'heal3', 'ENERGY']].map(([id, a, n]) => `<div class="con ${p.bag[id] ? '' : 'none'}"><kbd>${S.label(a)}</kbd><i class="ic ${id}"></i><b>${p.bag[id] || 0}</b><span>${n}</span></div>`).join(''); }
    // zone
    const Z = G.zone; if (Z.active) { this.set('z-time', fmtTime(Z.timer > 9000 ? 0 : Z.timer)); this.set('z-label', Z.shrinking ? 'ZONE SHRINKING' : 'ZONE HOLDS'); const out = Z.outside(p.pos.x, p.pos.z); const zc = (Z.shrinking ? 's' : 'w') + (out ? 'o' : ''); if (this.cache.zc !== zc) { this.cache.zc = zc; $('.zone').className = 'zone ' + (Z.shrinking ? 'shr ' : '') + (out ? 'out' : ''); } }
    else { this.set('z-time', '--:--'); this.set('z-label', p.mode === 'plane' ? 'DEPLOYING' : G.match.br() ? 'ZONE PENDING' : 'FREE ROAM · EXPLORE'); }
    G.gfx.fx.uZone.value = Z.active && Z.outside(p.pos.x, p.pos.z) && p.mode !== 'plane' ? 1 : 0;
    // crosshair
    const cross = $('#cross'), ground = p.mode === 'ground' && p.alive; const showCross = ground && !p.scoped && (w || p.cur === 3) && !this.panel;
    if (this.cache.cross !== showCross) { this.cache.cross = showCross; cross.style.display = showCross ? 'block' : 'none'; }
    if (showCross && def) { const ads = p.aiming ? 1 : 0; let sp = def.spread[0] + (def.spread[1] - def.spread[0]) * ads; sp *= (1 + Math.min(p.speedNow / 6, 1.2) * 0.9) * (p.stance === 1 ? 0.8 : p.stance === 2 ? 0.6 : 1); sp += p.bloom * 0.9; const gap = 4 + sp * 6.5 * (72 / G.gfx.camera.fov); cross.style.setProperty('--g', gap.toFixed(1) + 'px'); }
    const sc = p.scoped && p.alive; if (this.cache.sc !== sc) { this.cache.sc = sc; $('#scope').style.display = sc ? 'block' : 'none'; }
    // prompt + progress
    const pr = p.prompt && !this.panel ? `<kbd>${S.label(p.prompt.key)}</kbd> ${p.prompt.text}` : ''; if (this.cache.pr !== pr) { this.cache.pr = pr; const e = $('#prompt'); e.innerHTML = pr; e.style.display = pr ? 'flex' : 'none'; }
    let prog = -1, pl = ''; if (p.heal) { prog = p.heal.t / p.heal.dur; pl = 'USING ' + itemName(p.heal.id).toUpperCase(); } else if (p.reloadT >= 0) { prog = p.reloadT; pl = 'RELOADING'; }
    const pe = $('#progress'); if (prog >= 0) { pe.style.display = 'block'; this.set('p-label', pl); $('#p-fill').style.width = (prog * 100).toFixed(0) + '%'; } else if (pe.style.display !== 'none') pe.style.display = 'none';
    // timers
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('#toast').classList.remove('on'); } if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('#banner').classList.remove('on'); } if (this.killT > 0) { this.killT -= dt; if (this.killT <= 0) $('#killb').classList.remove('on'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) $('#hitm').className = ''; }
    for (let i = this.feedItems.length - 1; i >= 0; i--) { const f = this.feedItems[i]; f.t -= dt; if (f.t <= 0) { f.e.remove(); this.feedItems.splice(i, 1); } else if (f.t < 1) f.e.style.opacity = f.t; }
    for (let i = this.threats.length - 1; i >= 0; i--) { this.threats[i].t -= dt; if (this.threats[i].t <= 0) this.threats.splice(i, 1); }
    for (let i = this.dmgInd.length - 1; i >= 0; i--) { const d = this.dmgInd[i]; d.t -= dt; if (d.t <= 0) { d.e.remove(); this.dmgInd.splice(i, 1); continue; } const a = wrapAngle(Math.atan2(d.x - p.pos.x, d.z - p.pos.z) - p.camYaw); d.e.style.transform = `rotate(${(-a * 180 / Math.PI).toFixed(1)}deg)`; d.e.style.opacity = Math.min(1, d.t); }
    this.hurtK = Math.max(0, this.hurtK - dt * 0.9); const lowHp = p.alive && p.hp < 30 ? (0.35 + 0.15 * Math.sin(G.time * 5)) : 0; G.gfx.fx.uHurt.value = Math.max(this.hurtK, lowHp); G.gfx.fx.uSat.value = p.alive ? 1 - Math.max(0, (30 - p.hp) / 60) : 0.25;
    // location name
    this.locT -= dt; if (this.locT <= 0 && ground) { this.locT = 1; const L = G.world.locationAt(p.pos.x, p.pos.z); const n = L ? L.name : ''; if (n !== this.locName) { this.locName = n; if (n) { const e = $('#loc'); e.textContent = n; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); } } }
    const sp = p.mode === 'seat' && p.vehicle ? `${Math.round(Math.abs(p.vehicle.speed) * 3.6)} KM/H · FUEL ${Math.round(p.vehicle.fuel)}% · HP ${Math.max(0, Math.round(p.vehicle.hp / p.vehicle.def.hp * 100))}%` : (p.mode === 'fall' || p.mode === 'chute') ? `ALT ${Math.max(0, Math.round(p.pos.y - G.world.heightAt(p.pos.x, p.pos.z)))} M · ${Math.round(Math.abs(p.vel.y) * 3.6)} KM/H` : ''; this.set('spd', sp); if (this.cache.spdOn !== !!sp) { this.cache.spdOn = !!sp; document.getElementById('spd').style.display = sp ? 'block' : 'none'; }
    if (S.d.showFps) this.set('fps', Math.round(G.gfx.fps || 0) + ' FPS · ' + G.gfx.renderer.info.render.calls + ' draws · ' + Math.round(G.gfx.renderer.info.render.triangles / 1000) + 'k tris · x' + G.gfx.dynScale.toFixed(2)); else this.set('fps', '');
    this._compass(); this._mmT -= dt; if (this._mmT <= 0) { this._mmT = 0.08; this._minimap(); if (this.panel === 'map') this._bigmap(); }
    if (this.panel === 'inventory') { this._invT -= dt; if (this._invT <= 0) { this._invT = 0.4; this._inv(); } }
  }
}

// Top-down map image rendered once from world data.
export function renderMap(world, size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size), d = img.data; const k = WORLD / size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -HALF + (i + 0.5) * k, z = -HALF + (j + 0.5) * k; const h = world.heightAt(x, z); let r, g, b;
    if (h < 0) { const t = clamp(-h / 14, 0, 1); r = 52 - t * 30; g = 108 - t * 50; b = 128 - t * 44; }
    else { const sl = world.slopeAt(x, z); const t = clamp(h / 120, 0, 1); r = 92 + t * 60; g = 122 + t * 30; b = 70 + t * 50; if (h < 1.8) { r = 190; g = 176; b = 132; } if (sl > 0.75 || h > 150) { r = 128; g = 124; b = 116; }
      const sR = world.splatAt(x, z, 0), sG = world.splatAt(x, z, 1), sB = world.splatAt(x, z, 2); if (sG > 120) { r = r * 0.4 + 150 * 0.6; g = g * 0.4 + 124 * 0.6; b = b * 0.4 + 86 * 0.6; } if (sB > 110) { r = 150; g = 150; b = 146; } if (sR > 110) { r = 226; g = 214; b = 180; }
      const sh = clamp(1 + (world.heightAt(x - 3, z - 3) - world.heightAt(x + 3, z + 3)) * 0.05, 0.6, 1.35); r *= sh; g *= sh; b *= sh; }
    const q = (j * size + i) * 4; d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); const s = size / WORLD;
  for (const f of world.footprints) { ctx.fillStyle = f.c; ctx.fillRect((f.x0 + HALF) * s, (f.z0 + HALF) * s, Math.max(1.5, (f.x1 - f.x0) * s), Math.max(1.5, (f.z1 - f.z0) * s)); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.5; ctx.strokeRect((f.x0 + HALF) * s, (f.z0 + HALF) * s, Math.max(1.5, (f.x1 - f.x0) * s), Math.max(1.5, (f.z1 - f.z0) * s)); }
  return c;
}

// weapon silhouettes for the hotbar and the weapon wheel
const WICON = { AR: 'M2 9h38l2-3h6v3h14v3H48l-3 4h-6l-2 6h-6l2-6H18l-4 5H6l3-7H2z', DMR: 'M1 10h62v2H44l-3 6h-6l-1-6H22l-5 6H8l3-6H1zM24 4h16v4H24z', SNIPER: 'M1 10h62v2H44l-3 6h-6l-1-6H22l-5 6H8l3-6H1zM22 3h20v5H22z',
  SMG: 'M6 8h36v5H34l-1 9h-6l1-9H20l-3 6h-6l2-6H6zM42 9h10v2H42z', SHOTGUN: 'M2 9h58v3H40l-4 5H24l-2-5H2zM30 13h22v2H30z', PISTOL: 'M14 6h34v6H32l-2 10h-9l2-10h-9z', FRAG: 'M32 6a8 8 0 1 0 .01 0zM29 2h6v4h-6zM35 3h6v2h-6z' };
function wicon(cls) { return `<svg class="wicon" viewBox="0 0 64 24" aria-hidden="true"><path d="${WICON[cls] || WICON.AR}"/></svg>`; }
