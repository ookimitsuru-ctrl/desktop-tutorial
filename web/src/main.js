import { App } from './game/app.js';

// エントリーポイント
const app = new App();
window.__app = app;
app.start().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;color:#fff;background:#300;padding:20px;white-space:pre-wrap;z-index:99">${e.stack || e}</pre>`);
});
