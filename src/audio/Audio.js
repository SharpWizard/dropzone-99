// Fully synthesised audio (Web Audio): positional gunfire with distance delay + muffling, footsteps per surface,
// reloads, impacts, explosions, engines, ambience and UI. No sample files.
import { clamp } from '../utils/math.js';

export class AudioSys {
  constructor(G) { this.G = G; this.ctx = null; this.vol = 0.8; this.lx = 0; this.ly = 0; this.lz = 0; this.fx = 0; this.fz = 1; this.amb = null; this.engine = null; this._distT = 8; }

  // must be called from a user gesture
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.18;
    this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown-ish noise for rumble
    this.brown = c.createBuffer(1, len, c.sampleRate); const e = this.brown.getChannelData(0); let l = 0; for (let i = 0; i < len; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; e[i] = l * 3.5; }
    this._ambience();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  listener(x, y, z, fx, fz) { this.lx = x; this.ly = y; this.lz = z; this.fx = fx; this.fz = fz; }

  // route a source through distance attenuation + stereo pan. Returns {out, delay, dist} or null if inaudible.
  _spatial(x, y, z, ref, maxD) {
    const c = this.ctx; if (!c) return null;
    let gain = 1, pan = 0, dist = 0;
    if (x !== undefined && x !== null) {
      const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz; dist = Math.sqrt(dx * dx + dy * dy + dz * dz); if (dist > maxD) return null;
      gain = ref / (ref + Math.max(0, dist - 1)); gain *= clamp(1 - dist / maxD, 0, 1) ** 0.5;
      const rx = -this.fz, rz = this.fx; // listener right vector (facing fx,fz)
      if (dist > 0.3) pan = clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.85;
    }
    const g = c.createGain(); g.gain.value = gain; const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master);
    return { out: g, dist, t: c.currentTime + Math.min(1.6, dist / 343) };
  }
  _noise(buf, t, dur, dest, type, f0, f1, q, peak, attack = 0.002) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random() * 1.5; const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  _tone(t, dur, dest, type, f0, f1, peak, attack = 0.002) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  gunshot(kind, x, y, z, supp = false, own = false) {
    const sp = this._spatial(own ? null : x, y, z, supp ? 6 : 26, supp ? 90 : 900); if (!sp) return; const t = sp.t, o = sp.out;
    const far = clamp(sp.dist / 260, 0, 1); const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000 - far * 14600; lp.connect(o);
    const P = { ar: [0.16, 2600, 0.9, 150, 0.5], ak: [0.2, 1900, 1.0, 120, 0.7], smg: [0.11, 3200, 0.7, 190, 0.35], dmr: [0.26, 2000, 1.1, 110, 0.8], sniper: [0.5, 1500, 1.3, 80, 1.1], shotgun: [0.34, 1300, 1.2, 90, 1.0], pistol: [0.12, 2800, 0.75, 170, 0.4] }[kind] || [0.16, 2600, 0.9, 150, 0.5];
    const v = own ? 0.8 : 1;
    if (supp) { this._noise(this.noise, t, 0.09, lp, 'bandpass', 1800, 700, 0.8, 0.5 * v); this._tone(t, 0.05, lp, 'sine', 240, 90, 0.25 * v); return; }
    this._noise(this.noise, t, P[0], lp, 'lowpass', P[1] * 3, 300, 0.4, P[2] * v);            // crack
    this._noise(this.noise, t, 0.03, lp, 'highpass', 3000, 5000, 0.5, 0.5 * v);              // transient
    this._tone(t, P[0] * 0.8, lp, 'sine', P[3], 42, P[4] * v);                                // thump
    this._noise(this.brown, t + 0.02, P[0] * 3 + far * 0.6, lp, 'lowpass', 900, 160, 0.3, 0.3 * v, 0.02); // tail / echo
  }
  reload(stage = 0) { const sp = this._spatial(); if (!sp) return; const t = sp.t; if (stage === 0) { this._noise(this.noise, t, 0.05, sp.out, 'bandpass', 2400, 1200, 3, 0.35); this._tone(t + 0.02, 0.04, sp.out, 'square', 900, 300, 0.05); } else if (stage === 1) { this._noise(this.noise, t, 0.06, sp.out, 'bandpass', 1500, 2600, 3, 0.4); this._tone(t, 0.05, sp.out, 'square', 400, 700, 0.06); } else { this._noise(this.noise, t, 0.04, sp.out, 'bandpass', 3200, 1800, 4, 0.5); this._noise(this.noise, t + 0.08, 0.05, sp.out, 'bandpass', 2600, 3800, 4, 0.5); } }
  dry() { const sp = this._spatial(); if (sp) this._noise(this.noise, sp.t, 0.03, sp.out, 'bandpass', 3000, 2000, 5, 0.3); }
  footstep(surface, x, y, z, own = false, loud = 1) {
    const sp = this._spatial(own ? null : x, y, z, 2.2, 38); if (!sp) return; const t = sp.t, v = (own ? 0.2 : 0.42) * loud;
    if (surface === 'grass') this._noise(this.noise, t, 0.13, sp.out, 'bandpass', 900 + Math.random() * 500, 400, 0.7, v * 0.9, 0.012);
    else if (surface === 'dirt' || surface === 'sand') this._noise(this.noise, t, 0.11, sp.out, 'lowpass', 1300, 300, 0.6, v, 0.006);
    else if (surface === 'water') { this._noise(this.noise, t, 0.22, sp.out, 'bandpass', 1500, 600, 1.2, v * 1.3, 0.02); }
    else if (surface === 'wood') { this._tone(t, 0.07, sp.out, 'sine', 150 + Math.random() * 40, 70, v * 1.3); this._noise(this.noise, t, 0.04, sp.out, 'lowpass', 1600, 500, 0.6, v * 0.5); }
    else if (surface === 'metal') { this._tone(t, 0.12, sp.out, 'triangle', 520 + Math.random() * 200, 380, v * 0.5); this._noise(this.noise, t, 0.04, sp.out, 'highpass', 2000, 3000, 0.6, v * 0.5); }
    else { this._noise(this.noise, t, 0.06, sp.out, 'lowpass', 2400, 600, 0.6, v * 0.85); this._tone(t, 0.05, sp.out, 'sine', 110, 60, v * 0.8); }
  }
  impact(mat, x, y, z) { const sp = this._spatial(x, y, z, 2.5, 60); if (!sp) return; const t = sp.t; if (mat === 2) { this._tone(t, 0.16, sp.out, 'triangle', 1400 + Math.random() * 1400, 900, 0.3); this._noise(this.noise, t, 0.04, sp.out, 'highpass', 4000, 6000, 0.6, 0.4); } else if (mat === 5) this._noise(this.noise, t, 0.07, sp.out, 'lowpass', 900, 300, 0.6, 0.6); else if (mat === 6) this._noise(this.noise, t, 0.18, sp.out, 'bandpass', 1600, 600, 1, 0.5); else this._noise(this.noise, t, 0.07, sp.out, 'bandpass', 1800 + Math.random() * 1500, 600, 0.9, 0.5); }
  whiz(x, y, z) { const sp = this._spatial(x, y, z, 4, 30); if (sp) this._noise(this.noise, sp.t, 0.12, sp.out, 'bandpass', 5200, 1400, 6, 0.5, 0.02); }
  explosion(x, y, z) { const sp = this._spatial(x, y, z, 60, 1400); if (!sp) return; const t = sp.t; const far = clamp(sp.dist / 400, 0, 1); const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000 - far * 8200; lp.connect(sp.out);
    this._noise(this.brown, t, 1.6, lp, 'lowpass', 2400, 60, 0.3, 1.6, 0.004); this._noise(this.noise, t, 0.35, lp, 'lowpass', 5000, 200, 0.3, 1.2); this._tone(t, 0.9, lp, 'sine', 95, 28, 1.6); }
  hit(head) { const sp = this._spatial(); if (!sp) return; if (head) { this._tone(sp.t, 0.11, sp.out, 'triangle', 1900, 1500, 0.3); this._tone(sp.t + 0.05, 0.12, sp.out, 'triangle', 2600, 2100, 0.25); } else this._tone(sp.t, 0.06, sp.out, 'triangle', 1250, 950, 0.25); }
  kill() { const sp = this._spatial(); if (!sp) return; this._tone(sp.t, 0.1, sp.out, 'triangle', 880, 880, 0.25); this._tone(sp.t + 0.09, 0.2, sp.out, 'triangle', 1320, 1320, 0.3); }
  hurt() { const sp = this._spatial(); if (!sp) return; this._noise(this.noise, sp.t, 0.1, sp.out, 'lowpass', 700, 200, 0.6, 0.7); this._tone(sp.t, 0.14, sp.out, 'sine', 140, 60, 0.6); }
  ui(kind = 'click') { const sp = this._spatial(); if (!sp) return; const t = sp.t; if (kind === 'hover') this._tone(t, 0.03, sp.out, 'sine', 1500, 1500, 0.04); else if (kind === 'pick') { this._tone(t, 0.05, sp.out, 'triangle', 700, 1000, 0.14); this._noise(this.noise, t, 0.04, sp.out, 'bandpass', 2400, 1600, 2, 0.14); } else if (kind === 'warn') { this._tone(t, 0.14, sp.out, 'square', 620, 620, 0.07); this._tone(t + 0.2, 0.14, sp.out, 'square', 620, 620, 0.07); } else if (kind === 'win') { [523, 659, 784, 1046].forEach((f, i) => this._tone(t + i * 0.13, 0.5, sp.out, 'triangle', f, f, 0.2)); } else if (kind === 'lose') { [392, 330, 262].forEach((f, i) => this._tone(t + i * 0.2, 0.6, sp.out, 'triangle', f, f * 0.98, 0.2)); } else this._tone(t, 0.045, sp.out, 'triangle', 900, 620, 0.14); }
  heal() { const sp = this._spatial(); if (sp) { this._noise(this.noise, sp.t, 0.3, sp.out, 'bandpass', 3000, 5000, 2, 0.12, 0.05); } }
  chute() { const sp = this._spatial(); if (sp) { this._noise(this.brown, sp.t, 0.7, sp.out, 'lowpass', 600, 1800, 0.5, 1.2, 0.05); this._noise(this.noise, sp.t, 0.25, sp.out, 'bandpass', 900, 2500, 1, 0.5, 0.02); } }
  land() { const sp = this._spatial(); if (sp) { this._tone(sp.t, 0.14, sp.out, 'sine', 120, 45, 0.8); this._noise(this.noise, sp.t, 0.12, sp.out, 'lowpass', 1200, 300, 0.5, 0.5); } }
  vehicleHit(x, y, z) { const sp = this._spatial(x, y, z, 6, 120); if (sp) { this._noise(this.noise, sp.t, 0.25, sp.out, 'lowpass', 2600, 300, 0.6, 1); this._tone(sp.t, 0.2, sp.out, 'triangle', 260, 120, 0.5); } }

  // train: two-tone air horn, and a hiss of steam
  horn(x, y, z) { const sp = this._spatial(x, y, z, 40, 900); if (!sp) return; const t = sp.t; for (const f of [311, 370]) { this._tone(t, 1.6, sp.out, 'sawtooth', f, f * 0.985, 0.11, 0.06); this._tone(t + 1.9, 0.7, sp.out, 'sawtooth', f, f * 0.98, 0.1, 0.04); } }
  steam(x, y, z) { const sp = this._spatial(x, y, z, 10, 200); if (sp) this._noise(this.noise, sp.t, 0.9, sp.out, 'highpass', 2600, 1800, 0.7, 0.35, 0.03); }
  // animals: bear roar (growl + rumble), deer alarm bark
  roar(x, y, z) { const sp = this._spatial(x, y, z, 14, 260); if (!sp) return; const t = sp.t; this._noise(this.brown, t, 1.3, sp.out, 'lowpass', 420, 160, 2, 1.6, 0.12); this._tone(t, 1.2, sp.out, 'sawtooth', 96, 64, 0.22, 0.1); this._noise(this.noise, t + 0.05, 0.9, sp.out, 'bandpass', 700, 380, 3, 0.45, 0.1); }
  bleat(x, y, z) { const sp = this._spatial(x, y, z, 8, 160); if (!sp) return; this._tone(sp.t, 0.22, sp.out, 'square', 760, 520, 0.08, 0.01); this._noise(this.noise, sp.t, 0.18, sp.out, 'bandpass', 1500, 900, 4, 0.25, 0.01); }
  // alien: rising chittering screech when one of the Swarm locks onto you
  screech(x, y, z) { const sp = this._spatial(x, y, z, 10, 200); if (!sp) return; const t = sp.t; this._tone(t, 0.55, sp.out, 'sawtooth', 340, 1250, 0.13, 0.02); this._tone(t + 0.04, 0.5, sp.out, 'square', 520, 1700, 0.06, 0.02); for (let i = 0; i < 5; i++) this._noise(this.noise, t + i * 0.08, 0.06, sp.out, 'bandpass', 2400 + i * 300, 1800, 8, 0.35, 0.005); }
  _ambience() {
    const c = this.ctx; const mk = (buf, type, freq, q, gain) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(this.master); s.start(); return { f, g }; };
    this.amb = { wind: mk(this.noise, 'bandpass', 420, 0.5, 0.0), rush: mk(this.noise, 'bandpass', 900, 0.4, 0.0), sea: mk(this.brown, 'lowpass', 500, 0.3, 0.0) };
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = c.createGain(); g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master); o1.start(); o2.start(); this.engine = { o1, o2, f, g };
    const p1 = c.createOscillator(), p2 = c.createOscillator(); p1.type = 'sawtooth'; p2.type = 'sawtooth'; p1.frequency.value = 62; p2.frequency.value = 93.5; const pf = c.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 260; const pg = c.createGain(); pg.gain.value = 0;
    p1.connect(pf); p2.connect(pf); pf.connect(pg); pg.connect(this.master); p1.start(); p2.start(); this.plane = pg;
  }
  // per-frame mixing of continuous layers. env: {wind 0..1, rush 0..1 (falling), sea 0..1, engine: rpm 0..1 | -1, plane 0..1, bird: bool}
  update(dt, env) {
    if (!this.ctx || !this.amb) return; const t = this.ctx.currentTime, A = this.amb;
    A.wind.g.gain.setTargetAtTime(0.035 + env.wind * 0.07 + Math.sin(t * 0.31) * 0.012, t, 0.4); A.wind.f.frequency.setTargetAtTime(340 + env.wind * 500 + Math.sin(t * 0.17) * 90, t, 0.6);
    A.rush.g.gain.setTargetAtTime(env.rush * 0.5, t, 0.15); A.rush.f.frequency.setTargetAtTime(500 + env.rush * 1400, t, 0.2);
    A.sea.g.gain.setTargetAtTime(env.sea * 0.16 * (0.7 + 0.3 * Math.sin(t * 0.7)), t, 0.5);
    const E = this.engine; if (env.engine >= 0) { const f = 42 + env.engine * 105; E.o1.frequency.setTargetAtTime(f, t, 0.06); E.o2.frequency.setTargetAtTime(f * 0.502, t, 0.06); E.f.frequency.setTargetAtTime(280 + env.engine * 900, t, 0.08); E.g.gain.setTargetAtTime(0.1 + env.engine * 0.08, t, 0.08); } else E.g.gain.setTargetAtTime(0, t, 0.12);
    this.plane.gain.setTargetAtTime(env.plane * 0.22, t, 0.3);
    // sparse wildlife + far-off firefights keep the island alive
    this._distT -= dt;
    if (this._distT <= 0) {
      this._distT = 5 + Math.random() * 12;
      if (env.bird && Math.random() < 0.6) { const sp = this._spatial(); if (sp) { const f = 2200 + Math.random() * 1800; for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this._tone(sp.t + i * 0.13, 0.09, sp.out, 'sine', f, f * (1.15 + Math.random() * 0.2), 0.022, 0.02); } }
      else if (env.combat) { const a = Math.random() * 6.28, d = 350 + Math.random() * 350; const n = 2 + Math.floor(Math.random() * 6), kind = Math.random() < 0.5 ? 'ar' : 'ak'; for (let i = 0; i < n; i++) setTimeout(() => this.gunshot(kind, this.lx + Math.cos(a) * d, this.ly, this.lz + Math.sin(a) * d), i * (90 + Math.random() * 60)); }
    }
  }
}
