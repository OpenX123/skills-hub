import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// 零依赖静态服务器。site/ 也可以直接双击 index.html 打开(数据以 .js 写出,不受 file:// 的 fetch 限制)。
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');

  const ext = path.extname(file).toLowerCase();
  const body = fs.readFileSync(file);
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' };

  if (/gzip/.test(req.headers['accept-encoding'] || '') && body.length > 1024) {
    const gz = zlib.gzipSync(body);
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip', 'content-length': gz.length }).end(gz);
  } else {
    res.writeHead(200, { ...headers, 'content-length': body.length }).end(body);
  }
}).listen(PORT, () => console.log('skills-hub site  ->  http://localhost:' + PORT));
