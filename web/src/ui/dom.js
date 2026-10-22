// 小さなDOMヘルパー

export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** タップ（ポインタ）で反応するボタン。clickより反応が速く、スクロールの誤判定もない */
/** 値が変わったときだけ文字を書き換える（毎フレーム呼んでも再レイアウトを起こさない） */
export function setText(el, text) {
  const v = String(text);
  if (el._text !== v) {
    el._text = v;
    el.textContent = v;
  }
}

/** 値が変わったときだけスタイルを書き換える */
export function setStyle(el, prop, value) {
  const k = `_s_${prop}`;
  if (el[k] !== value) {
    el[k] = value;
    el.style[prop] = value;
  }
}

export function tap(el, fn) {
  let id = null;
  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    el.classList.add('pressed');
    e.stopPropagation();
  });
  el.addEventListener('pointerup', (e) => {
    el.classList.remove('pressed');
    if (id === e.pointerId) {
      id = null;
      fn(e);
    }
  });
  el.addEventListener('pointerleave', () => {
    el.classList.remove('pressed');
    id = null;
  });
  el.addEventListener('pointercancel', () => {
    el.classList.remove('pressed');
    id = null;
  });
  return el;
}

export const ICONS = {
  trophy:
    '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1.2 1.8A5 5 0 0 1 7 8V7zm10 0v1a5 5 0 0 1-.2 1.8A2 2 0 0 0 18 8V7h-1zM6 20h12v2H6z"/></svg>',
  ball:
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5l4 2.9-1.5 4.7h-5L8 10.4z" fill="currentColor"/><path d="M12 7.5V2.6M16 10.4l4.6-1.5M14.5 15.1l2.8 4M9.5 15.1l-2.8 4M8 10.4L3.4 8.9"/></svg>',
  gear:
    '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
  book:
    '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a1.5 1.5 0 0 0 0 3H20v1H6.5A2.5 2.5 0 0 1 4 19.5zM8 6v2h8V6z"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg>',
  pause: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  crest:
    '<svg viewBox="0 0 100 100"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#ffcf3a"/><stop offset="1" stop-color="#c98200"/></linearGradient></defs><path d="M50 4l38 14v30c0 24-17 40-38 48C29 88 12 72 12 48V18z" fill="#0b1f52" stroke="url(#cg)" stroke-width="5"/><circle cx="50" cy="46" r="20" fill="#fff"/><path d="M50 32l8 5.8-3 9.4h-10l-3-9.4z" fill="#0b1f52"/><path d="M50 32v-6M58 37.8l6-2M55 47.2l3.5 5M45 47.2l-3.5 5M42 37.8l-6-2" stroke="#0b1f52" stroke-width="2.5"/><path d="M30 76h40" stroke="url(#cg)" stroke-width="4"/><path d="M36 84h28" stroke="url(#cg)" stroke-width="3"/></svg>',
};

export function icon(name) {
  const s = document.createElement('span');
  s.style.display = 'inline-flex';
  s.innerHTML = ICONS[name];
  return s;
}
