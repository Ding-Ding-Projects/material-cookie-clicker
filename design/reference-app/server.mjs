import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appDirectory, '..', '..');
const port = Number(process.env.DESIGN_REFERENCE_PORT ?? 4174);
const host = '127.0.0.1';
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
]);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    const relative = decodeURIComponent(url.pathname === '/' ? '/design/reference-app/index.html' : url.pathname);
    const candidate = resolve(repositoryRoot, `.${relative}`);
    if (candidate !== repositoryRoot && !candidate.startsWith(`${repositoryRoot}${sep}`)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Path refused');
      return;
    }
    const info = await stat(candidate);
    const path = info.isDirectory() ? resolve(candidate, 'index.html') : candidate;
    const body = await readFile(path);
    const referenceDocument = relative.startsWith('/design/')
      && relative.endsWith('.html')
      && !relative.startsWith('/design/reference-app/');
    const connectPolicy = referenceDocument ? "connect-src 'none';" : "connect-src 'self';";
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes.get(extname(path)) ?? 'application/octet-stream',
      'content-security-policy': `default-src 'self'; ${connectPolicy} frame-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'`,
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, host, () => {
  console.log(`Design-reference app: http://${host}:${port}/design/reference-app/index.html`);
});
