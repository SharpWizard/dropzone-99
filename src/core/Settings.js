// Persistent settings + key bindings + raw input state.
// Enemy skill per difficulty. aimErr/react/sight/burst: shooting; hear: hearing range scale; fov: half-angle of vision (rad);
// track: seconds to settle the aim on a new target; squad: radius (m) in which a bot that spots you alerts its neighbours;
// flank: chance to work round your side; search: seconds they keep hunting after losing you; suppress: chance to keep firing at
// your last position when you break line of sight; coverHp: health at which they fall back to cover; dodge: chance to sidestep
// when hit; grenade: grenade use; focus: how strongly they prefer you over other targets.
export const DIFFS = {
  EASY: { aimErr: 2.6, react: 0.95, dmgToPlayer: 0.5, sight: 85, burst: 0.7, hear: 0.6, fov: 1.1, track: 1.6, squad: 0, flank: 0, search: 5, suppress: 0, coverHp: 30, dodge: 0.1, grenade: 0.3, focus: 0 },
  NORMAL: { aimErr: 1.5, react: 0.6, dmgToPlayer: 0.75, sight: 115, burst: 1, hear: 0.85, fov: 1.3, track: 1.1, squad: 55, flank: 0.25, search: 10, suppress: 0.25, coverHp: 45, dodge: 0.3, grenade: 0.6, focus: 0.3 },
  HARD: { aimErr: 0.85, react: 0.32, dmgToPlayer: 1, sight: 150, burst: 1.3, hear: 1, fov: 1.5, track: 0.75, squad: 100, flank: 0.5, search: 16, suppress: 0.55, coverHp: 55, dodge: 0.55, grenade: 1, focus: 0.55 },
  EXPERT: { aimErr: 0.55, react: 0.2, dmgToPlayer: 1.15, sight: 175, burst: 1.5, hear: 1.2, fov: 1.7, track: 0.5, squad: 150, flank: 0.7, search: 22, suppress: 0.8, coverHp: 60, dodge: 0.75, grenade: 1.3, focus: 0.75 },
};
export const ACTIONS = [['forward', 'Move forward', 'KeyW'], ['back', 'Move back', 'KeyS'], ['left', 'Move left', 'KeyA'], ['right', 'Move right', 'KeyD'], ['sprint', 'Sprint', 'ShiftLeft'], ['jump', 'Jump', 'Space'],
  ['crouch', 'Crouch', 'KeyC'], ['prone', 'Prone', 'KeyZ'], ['reload', 'Reload', 'KeyR'], ['interact', 'Pick up / Interact', 'KeyF'], ['slot1', 'Primary weapon', 'Digit1'], ['slot2', 'Secondary weapon', 'Digit2'],
  ['slot3', 'Sidearm', 'Digit3'], ['slot4', 'Grenade', 'Digit4'], ['heal1', 'Use bandage', 'Digit5'], ['heal2', 'Use first aid kit', 'Digit6'], ['heal3', 'Use energy drink', 'Digit7'], ['firemode', 'Fire mode', 'KeyB'],
  ['shoulder', 'Switch shoulder', 'KeyQ'], ['roll', 'Roll / dodge', 'ControlLeft'], ['melee', 'Melee strike (unarmed)', 'KeyG'], ['camera', 'Camera mode (TPP/FPP)', 'KeyV'], ['mute', 'Sound on / off', 'KeyN'], ['cheats', 'Cheats on / off', 'KeyK'], ['zoomIn', 'Camera zoom in', 'Equal'], ['zoomOut', 'Camera zoom out', 'Minus'], ['wheel', 'Weapon wheel (hold)', 'KeyX'], ['inventory', 'Inventory', 'Tab'], ['map', 'Map', 'KeyM']];

export class Settings {
  constructor() {
    this.d = { preset: '', sens: 1, adsSens: 0.75, invertY: false, volume: 0.8, difficulty: 'NORMAL', fov: 72, autoPickup: true, showFps: false, outfit: 0, view: 'third', camDist: 3.1, name: 'YOU', pet: 'dragon', muted: false, cheats: false, keys: {} };
    for (const [a, , k] of ACTIONS) this.d.keys[a] = k;
    try { const s = JSON.parse(localStorage.getItem('dz.settings') || '{}'); Object.assign(this.d, s, { keys: { ...this.d.keys, ...(s.keys || {}) } }); } catch (e) { /* defaults */ }
  }
  save() { try { localStorage.setItem('dz.settings', JSON.stringify(this.d)); } catch (e) { /* ignore */ } }
  diff() { return DIFFS[this.d.difficulty] || DIFFS.NORMAL; }
  keyName(code) { return (code || '').replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'SHIFT').replace('ControlLeft', 'CTRL').replace('Space', 'SPACE').replace('Equal', '+').replace('Minus', '-').replace('AltLeft', 'ALT').toUpperCase(); }
  label(action) { return this.keyName(this.d.keys[action]); }
}

export class Input {
  constructor(canvas, settings) {
    this.s = settings; this.canvas = canvas; this.down = new Set(); this.hit = new Set(); this.mb = [false, false, false]; this.mhit = [false, false, false]; this.mx = 0; this.my = 0; this.wheel = 0; this.locked = false; this.enabled = false; this.capture = null;
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); e.stopImmediatePropagation(); const c = this.capture; this.capture = null; c(e.code); return; }
      if (e.code === 'Tab' || e.code === 'Space' || (this.enabled && (e.code.startsWith('Arrow') || e.code === 'AltLeft'))) e.preventDefault();
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (!e.repeat) this.hit.add(e.code); this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.mb = [false, false, false]; });
    canvas.addEventListener('mousedown', (e) => { if (e.button < 3) { this.mb[e.button] = true; this.mhit[e.button] = true; } });
    addEventListener('mouseup', (e) => { if (e.button < 3) this.mb[e.button] = false; });
    addEventListener('mousemove', (e) => { if (this.locked || (this.enabled && this.dragLook && (e.buttons & 4))) { this.mx += e.movementX || 0; this.my += e.movementY || 0; } });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (this.onLock) this.onLock(this.locked); });
  }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { /* unsupported */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  is(action) { return this.down.has(this.s.d.keys[action]); }
  pressed(action) { return this.hit.has(this.s.d.keys[action]); }
  key(code) { return this.hit.has(code); }
  endFrame() { this.hit.clear(); this.mhit[0] = this.mhit[1] = this.mhit[2] = false; this.mx = 0; this.my = 0; this.wheel = 0; }
}
