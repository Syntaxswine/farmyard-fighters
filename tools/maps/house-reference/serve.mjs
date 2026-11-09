// Read-only local server for the Mount Dora house survey. Serves files under
// maps/mount-dora/ on 127.0.0.1 and opens at /reference/survey/. Stop it with
// Ctrl+C; `--minutes N` makes it retire itself after N minutes.
//
//   node tools/maps/house-reference/serve.mjs [port] [--minutes N]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../maps/mount-dora');
const args = process.argv.slice(2), minutesAt = args.indexOf('--minutes');
const minutes = minutesAt >= 0 ? Number(args.splice(minutesAt, 2)[1]) : 0;
const port = Number(args[0] || process.env.PORT || 4597);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv; charset=utf-8'};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/' || url.pathname === '/reference/survey') return res.writeHead(302, {Location: '/reference/survey/'}).end();
  let name = decodeURIComponent(url.pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  try {
    if (!file.startsWith(root + path.sep) || !fs.realpathSync(file).startsWith(root + path.sep) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  } catch { return res.writeHead(404).end(); }
  res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Mount Dora house survey: http://127.0.0.1:${server.address().port}/reference/survey/`);
  if (minutes > 0) setTimeout(() => { console.log('Retiring after', minutes, 'minutes.'); server.close(); server.closeAllConnections(); }, minutes * 60000).unref();
});
