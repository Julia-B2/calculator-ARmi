const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};
http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream'});
    res.end(data);
  });
}).listen(4173, '127.0.0.1', () => console.log('Server running at http://127.0.0.1:4173'));
