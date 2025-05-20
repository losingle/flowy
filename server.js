const { join } = require('path');
const { existsSync } = require('fs');

const PORT = 3000;
const ROOT_DIR = import.meta.dir;
const DEMO_DIR = join(ROOT_DIR, 'demo');

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    
    if (path === '/' || path === '') {
      path = '/index.html';
    }
    
    let filePath;
    if (path.startsWith('/dist/')) {
      filePath = join(ROOT_DIR, path);
    } else if (path.startsWith('/engine/')) {
      filePath = join(ROOT_DIR, path);
    } else {
      filePath = join(DEMO_DIR, path);
    }
    
    try {
      if (!existsSync(filePath)) {
        return new Response('404 Not Found', { status: 404 });
      }
      
      const file = Bun.file(filePath);
      const contentType = getContentType(path);
      return new Response(file, {
        headers: {
          'Content-Type': contentType
        }
      });
    } catch (error) {
      console.error(`Error serving ${path}:`, error);
      return new Response('500 Internal Server Error', { status: 500 });
    }
  }
});

function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const types = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon'
  };
  return types[ext] || 'application/octet-stream';
}

console.log(`Flowy live server running at http://localhost:${PORT}`);
console.log(`Press Ctrl+C to stop the server`);
