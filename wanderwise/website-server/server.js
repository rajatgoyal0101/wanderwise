// Tiny zero-dependency static server for the WanderWise frontend.
//   node server.js
// Serves ../website on PORT (default 5173).

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = path.resolve(__dirname, '..', 'website');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.woff2':'font/woff2'
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.normalize(path.join(root, decoded));
  if (!target.startsWith(root)) return null;
  return target;
}

const server = http.createServer((req, res) => {
  let target = safeJoin(ROOT, req.url === '/' ? '/index.html' : req.url);
  if (!target) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(target, (err, stat) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    if (stat.isDirectory()) target = path.join(target, 'index.html');

    fs.readFile(target, (readErr, data) => {
      if (readErr) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n🌸  WanderWise site running at http://localhost:${PORT}`);
  console.log(`     Serving: ${ROOT}\n`);
});
