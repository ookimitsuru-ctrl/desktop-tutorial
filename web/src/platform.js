// Androidホストとの橋渡し（ブラウザ単体でも動くようにフォールバック付き）

const host = typeof window !== 'undefined' ? window.AndroidHost : undefined;

let hapticsOn = true;
export function setHaptics(on) {
  hapticsOn = on;
}

export function haptic(ms = 10) {
  if (!hapticsOn) return;
  try {
    if (host?.vibrate) host.vibrate(ms);
    else navigator.vibrate?.(ms);
  } catch {
    /* 振動非対応 */
  }
}

export function exitApp() {
  try {
    host?.exitApp?.();
  } catch {
    /* noop */
  }
}

export const isAndroid = !!host;

const store = (() => {
  try {
    const k = '__t';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
})();

export function load(key, fallback) {
  try {
    const v = store?.getItem(`ws.${key}`);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    store?.setItem(`ws.${key}`, JSON.stringify(value));
  } catch {
    /* 保存できない環境 */
  }
}

export function remove(key) {
  try {
    store?.removeItem(`ws.${key}`);
  } catch {
    /* noop */
  }
}
