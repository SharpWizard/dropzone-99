import { Game } from './core/Game.js';

const game = new Game(document.getElementById('view'));
window.__dz = game; // debug handle
game.boot().catch((e) => {
  console.error(e);
  const m = document.getElementById('boot-msg');
  if (m) { m.textContent = 'Could not start: ' + (e && e.message ? e.message : e); m.style.color = '#ff6b5a'; m.style.maxWidth = '640px'; m.style.textAlign = 'center'; m.style.whiteSpace = 'normal'; }
});
