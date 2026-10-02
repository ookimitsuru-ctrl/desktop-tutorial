// ローカル確認用の静的サーバ: npm run build && npm run serve → http://localhost:8080
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../game/dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
http.createServer((req, res) => {
  const f = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(8080, () => console.log('http://localhost:8080  (?debug で FPS 表示)'));
