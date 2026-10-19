/**
 * Новопільський ліцей — Сервер розробки та Git-based CMS Backend API
 * Працює на чистому Node.js без додаткових модулів.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildSite } = require('./build');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.pdf': 'application/pdf',
};

// Безпечна нормалізація імені завантаженого файлу
function sanitizeUploadFileName(rawName) {
  const ext = path.extname(String(rawName || '')).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
  const safeExt = allowedExts.includes(ext) ? ext : '.jpg';
  const base = path
    .basename(String(rawName || 'photo'), ext)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'photo';
  return `${base}-${Date.now().toString(36)}${safeExt}`;
}

// Запуск первинного білду перед стартом
buildSite();

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // 1. API: Список файлів для CMS редактора
  if (pathname === '/api/content/list' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });

    const groups = {
      'Налаштування сайту': [
        { name: 'site.json', title: 'Паспортні дані та реквізити ліцею', path: 'settings/site.json', webUrl: '/' },
        { name: 'registry.json', title: 'Реєстр 28 першоджерел та документів', path: 'documents/registry.json', webUrl: '/transparency/' },
      ],
      'Сторінки сайту': [],
      'Новини ліцею': [],
      'Термінові оголошення': [],
    };

    // Pages
    const pagesDir = path.join(CONTENT_DIR, 'pages');
    if (fs.existsSync(pagesDir)) {
      fs.readdirSync(pagesDir).forEach((f) => {
        if (f.endsWith('.md')) {
          const raw = fs.readFileSync(path.join(pagesDir, f), 'utf8');
          const titleMatch = raw.match(/title:\s*["']?([^"\r\n]+)/);
          const pathMatch = raw.match(/path:\s*["']?([^"\r\n]+)/);
          groups['Сторінки сайту'].push({
            name: f,
            title: titleMatch ? titleMatch[1] : f,
            path: `pages/${f}`,
            webUrl: pathMatch ? pathMatch[1] : '/',
          });
        }
      });
    }

    // News
    const newsDir = path.join(CONTENT_DIR, 'news');
    if (fs.existsSync(newsDir)) {
      fs.readdirSync(newsDir).forEach((f) => {
        if (f.endsWith('.md')) {
          const raw = fs.readFileSync(path.join(newsDir, f), 'utf8');
          const titleMatch = raw.match(/title:\s*["']?([^"\r\n]+)/);
          const slug = f.replace(/\.md$/, '');
          groups['Новини ліцею'].push({
            name: f,
            title: titleMatch ? titleMatch[1] : f,
            path: `news/${f}`,
            webUrl: `/news/${slug}/`,
          });
        }
      });
    }

    // Announcements
    const annDir = path.join(CONTENT_DIR, 'announcements');
    if (fs.existsSync(annDir)) {
      fs.readdirSync(annDir).forEach((f) => {
        if (f.endsWith('.md')) {
          const raw = fs.readFileSync(path.join(annDir, f), 'utf8');
          const titleMatch = raw.match(/title:\s*["']?([^"\r\n]+)/);
          groups['Термінові оголошення'].push({
            name: f,
            title: titleMatch ? titleMatch[1] : f,
            path: `announcements/${f}`,
            webUrl: '/',
          });
        }
      });
    }

    return res.end(JSON.stringify(groups));
  }

  // 2. API: Читання вмісту файлу
  if (pathname === '/api/content/read' && req.method === 'GET') {
    const fileRel = parsedUrl.searchParams.get('file');
    if (!fileRel) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Параметр file є обов’язковим' }));
    }

    const fullPath = path.resolve(CONTENT_DIR, fileRel);
    const relCheck = path.relative(CONTENT_DIR, fullPath);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck) || !fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Файл не знайдено' }));
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ file: fileRel, content }));
  }

  // 3. API: Збереження файлу в Git CMS
  if (pathname === '/api/content/save' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { file, content } = JSON.parse(body);
        if (!file || typeof content !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Некоректні дані запиту' }));
        }

        const fullPath = path.resolve(CONTENT_DIR, file);
        const relCheck = path.relative(CONTENT_DIR, fullPath);
        if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Доступ заборонено' }));
        }

        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');

        // Автоматична регенерація статичного сайту
        buildSite();

        // Фіксація в Git (якщо налаштовано репозиторій)
        try {
          execSync(`git add "${fullPath}"`, { cwd: ROOT_DIR, stdio: 'ignore' });
          execSync(`git commit -m "CMS: оновлено ${file}"`, { cwd: ROOT_DIR, stdio: 'ignore' });
        } catch (gitErr) {
          // Не критично, якщо git не налаштовано глобально
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, file }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3b. API: Завантаження одного або кількох зображень (галереї) для новин
  if (pathname === '/api/media/upload' && req.method === 'POST') {
    const chunks = [];
    let totalBytes = 0;
    const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // до 50 МБ для пакетного завантаження галереї

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes <= MAX_UPLOAD_BYTES) {
        chunks.push(chunk);
      }
    });

    req.on('end', () => {
      if (totalBytes > MAX_UPLOAD_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Перевищено максимальний розмір завантаження (50 МБ)' }));
      }

      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const items = Array.isArray(payload.files)
          ? payload.files
          : payload.name && payload.data
            ? [{ name: payload.name, data: payload.data }]
            : [];

        if (!items.length) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Не передано файлів для завантаження' }));
        }

        const targetDir = path.join(PUBLIC_DIR, 'assets', 'images', 'news');
        fs.mkdirSync(targetDir, { recursive: true });

        const uploadedUrls = [];
        items.forEach((item) => {
          if (!item || !item.data) return;
          const safeName = sanitizeUploadFileName(item.name);
          const base64Data = String(item.data).replace(/^data:[^;]+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          const destPath = path.join(targetDir, safeName);
          fs.writeFileSync(destPath, buffer);
          uploadedUrls.push(`/assets/images/news/${safeName}`);
        });

        buildSite();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, urls: uploadedUrls }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3c. API: Список наявних медіафайлів новин
  if (pathname === '/api/media/list' && req.method === 'GET') {
    const mediaDirs = [
      { dir: path.join(PUBLIC_DIR, 'assets', 'images', 'news'), prefix: '/assets/images/news/' },
      { dir: path.join(PUBLIC_DIR, 'assets', 'uploads'), prefix: '/assets/uploads/' },
    ];
    const images = [];
    mediaDirs.forEach(({ dir, prefix }) => {
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach((f) => {
          if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f)) {
            images.push(prefix + f);
          }
        });
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ images }));
  }

  // 4. Статичні файли сайту з /dist
  let filePath = path.resolve(DIST_DIR, '.' + pathname);
  const relDist = path.relative(DIST_DIR, filePath);
  if (relDist.startsWith('..') || path.isAbsolute(relDist)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Доступ заборонено');
  }

  // Перевірка директорій (напр. /about/ -> /about/index.html)
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  } else if (!fs.existsSync(filePath) && fs.existsSync(path.join(filePath, 'index.html'))) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } else {
    // 404
    const custom404 = path.join(DIST_DIR, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    if (fs.existsSync(custom404)) {
      return fs.createReadStream(custom404).pipe(res);
    }
    res.end(`
      <!doctype html>
      <html lang="uk">
      <head><meta charset="utf-8"><title>404 | Сторінку не знайдено</title>
      <link rel="stylesheet" href="/assets/css/style.css"></head>
      <body style="text-align: center; padding: 80px 20px;">
        <h1 style="font-size: 60px; color: #0f3b6c;">404</h1>
        <h2>Сторінку не знайдено</h2>
        <p style="color: #64748b; margin: 20px 0;">Можливо, сторінку було переміщено або введено неправильну адресу.</p>
        <a href="/" class="btn-primary" style="display: inline-block;">Повернутися на головну</a>
      </body>
      </html>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`\n===============================================================`);
  console.log(`🏛️  НОВОПІЛЬСЬКИЙ ЛІЦЕЙ — ОФІЦІЙНИЙ ВЕБСАЙТ ТА GIT CMS`);
  console.log(`===============================================================`);
  console.log(`🌐 Вебсайт ліцею:              http://localhost:${PORT}/`);
  console.log(`📜 Прозорість (ст. 30 ЗУ):     http://localhost:${PORT}/transparency/`);
  console.log(`⚙️  Decap CMS (Git-based):      http://localhost:${PORT}/admin/`);
  console.log(`✏️  Візуальний редактор вмісту: http://localhost:${PORT}/admin/editor/`);
  console.log(`===============================================================\n`);
});
