// Android WebView に Chrome DevTools Protocol で直接つなぐ小さなクライアント
// (Playwright の connectOverCDP は WebView のブラウザ単位の操作に対応していないため)
const http = require('http');
function getJSON(url) {
  return new Promise((res, rej) => http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
}
async function connect(port = 9222) {
  const pages = await getJSON(`http://127.0.0.1:${port}/json`);
  const pg = pages.find((p) => p.type === 'page');
  if (!pg) throw new Error('no page');
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const wait = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && wait.has(msg.id)) { const w = wait.get(msg.id); wait.delete(msg.id); msg.error ? w.rej(new Error(msg.error.message)) : w.res(msg.result); }
    else if (msg.method) for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, timeoutMs = 120000) => new Promise((res, rej) => {
    const i = ++id; wait.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (wait.has(i)) { wait.delete(i); rej(new Error('timeout ' + method)); } }, timeoutMs);
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  };
  return { send, evaluate, on: (f) => listeners.push(f), close: () => ws.close(), title: pg.title };
}
module.exports = { connect, getJSON };
