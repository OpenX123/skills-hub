import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// 零依赖静态服务器,伺服 `next build` 的 out/ 产物。
// Next 配了 output: export,所以不能用 `next start`,直接发静态文件即可。
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

if (!fs.existsSync(ROOT)) {
  console.error('找不到 out/ —— 先跑 npm run build');
  process.exit(1);
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const withHtml = file.replace(/\/$/, '') + '.html';
      file = fs.existsSync(withHtml) ? withHtml : path.join(ROOT, '404.html');
    }

    const ext = path.extname(file).toLowerCase();
    const body = fs.readFileSync(file);
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' };

    if (/gzip/.test(req.headers['accept-encoding'] || '') && body.length > 1024) {
      const gz = zlib.gzipSync(body);
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip', 'content-length': gz.length }).end(gz);
    } else {
      res.writeHead(200, { ...headers, 'content-length': body.length }).end(body);
    }
  })
  .listen(PORT, () => console.log('skills-hub (Next 静态导出)  ->  http://localhost:' + PORT));
