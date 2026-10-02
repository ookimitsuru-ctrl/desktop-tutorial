import './bosses.js';
import { boot } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('c');
  try {
    boot(canvas);
  } catch (e) {
    document.getElementById('err').textContent = 'WebGL を初期化できませんでした: ' + e.message;
    document.getElementById('err').hidden = false;
    console.error(e);
  }
});
