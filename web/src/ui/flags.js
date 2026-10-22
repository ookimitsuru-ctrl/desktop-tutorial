// 各国の旗（架空国はオリジナルデザイン）をキャンバスで描いて dataURL にする

const cache = new Map();

function draw(id, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  switch (id) {
    case 'jpn': {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#bc002d';
      g.beginPath();
      g.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'val': {
      // ヴァルドリア: 赤・金・赤の横三色に、盾と冠
      g.fillStyle = '#b5121b';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f3c641';
      g.fillRect(0, h * 0.28, w, h * 0.44);
      const cx = w * 0.5;
      const cy = h * 0.52;
      const s = h * 0.18;
      g.fillStyle = '#b5121b';
      g.strokeStyle = '#3b0a0a';
      g.lineWidth = Math.max(1, h * 0.02);
      g.beginPath();
      g.moveTo(cx - s, cy - s);
      g.lineTo(cx + s, cy - s);
      g.lineTo(cx + s, cy + s * 0.2);
      g.quadraticCurveTo(cx + s, cy + s * 1.1, cx, cy + s * 1.3);
      g.quadraticCurveTo(cx - s, cy + s * 1.1, cx - s, cy + s * 0.2);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#f3c641';
      g.beginPath();
      g.moveTo(cx - s * 0.8, cy - s * 1.15);
      g.lineTo(cx - s * 0.5, cy - s * 1.6);
      g.lineTo(cx - s * 0.2, cy - s * 1.25);
      g.lineTo(cx, cy - s * 1.75);
      g.lineTo(cx + s * 0.2, cy - s * 1.25);
      g.lineTo(cx + s * 0.5, cy - s * 1.6);
      g.lineTo(cx + s * 0.8, cy - s * 1.15);
      g.closePath();
      g.fill();
      g.fillRect(cx - s * 0.12, cy - s * 0.55, s * 0.24, s * 1.1);
      g.fillRect(cx - s * 0.5, cy - s * 0.2, s, s * 0.24);
      break;
    }
    case 'sol': {
      // ソレスタ: 緑と黄の斜め二分割に白い太陽
      g.fillStyle = '#0b8a43';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd11a';
      g.beginPath();
      g.moveTo(w, 0);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.closePath();
      g.fill();
      g.fillStyle = '#163d9c';
      g.beginPath();
      g.moveTo(w * 0.92, 0);
      g.lineTo(w, 0);
      g.lineTo(w * 0.08, h);
      g.lineTo(0, h);
      g.closePath();
      g.fill();
      const cx = w / 2;
      const cy = h / 2;
      const r = h * 0.17;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a - 0.12) * r * 1.1, cy + Math.sin(a - 0.12) * r * 1.1);
        g.lineTo(cx + Math.cos(a) * r * (i % 2 ? 1.6 : 1.9), cy + Math.sin(a) * r * (i % 2 ? 1.6 : 1.9));
        g.lineTo(cx + Math.cos(a + 0.12) * r * 1.1, cy + Math.sin(a + 0.12) * r * 1.1);
        g.fill();
      }
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffd11a';
      g.beginPath();
      g.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'ndg': {
      // ノルデンガルド: 白地に紺のスカンジナビア十字と青緑の細線
      g.fillStyle = '#f2f4f7';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0d2b52';
      const cx = w * 0.36;
      g.fillRect(cx - h * 0.14, 0, h * 0.28, h);
      g.fillRect(0, h * 0.36, w, h * 0.28);
      g.fillStyle = '#2ec4b6';
      g.fillRect(cx - h * 0.04, 0, h * 0.08, h);
      g.fillRect(0, h * 0.46, w, h * 0.08);
      break;
    }
    default:
      g.fillStyle = '#888';
      g.fillRect(0, 0, w, h);
  }
  // 布の陰影
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return c;
}

export function flagURL(id, w = 120, h = 80) {
  const key = `${id}-${w}-${h}`;
  if (!cache.has(key)) cache.set(key, draw(id, w, h).toDataURL());
  return cache.get(key);
}

export function flagCanvas(id, w = 256, h = 170) {
  return draw(id, w, h);
}

export function flagImg(team, cls = 'flag') {
  const img = document.createElement('img');
  img.className = cls;
  img.src = flagURL(team.flag);
  img.alt = team.name;
  img.draggable = false;
  return img;
}
