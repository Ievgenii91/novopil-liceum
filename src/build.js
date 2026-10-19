/**
 * Новопільський ліцей — Static Site Generator (SSG)
 * Чистий Node.js без зовнішніх залежностей.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Базовий шлях (для GitHub Pages без власного домену, напр. "/novopil-liceum") та адреса сайту для sitemap.
// У CI значення передаються з actions/configure-pages; локально — порожній шлях і домен за замовчуванням.
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const SITE_URL = (process.env.SITE_URL || 'https://novopil-lyceum.zt.ua').replace(/\/+$/, '');

// Дані налаштувань та реєстру документів (перечитуються при кожному білді — див. loadData())
let siteSettings = {};
let documentsRegistry = [];

function loadData() {
  siteSettings = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'settings', 'site.json'), 'utf8'));
  const registryRaw = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'documents', 'registry.json'), 'utf8'));
  // Підтримка обох форматів: масив (історичний) та { items: [...] } (формат Decap CMS)
  documentsRegistry = Array.isArray(registryRaw) ? registryRaw : registryRaw.items || [];
}

// Початкове завантаження
loadData();

// Екранування значень для HTML-атрибутів
function escapeAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Додавання базового шляху до кореневих посилань (href="/...", src="/...", action="/...")
function applyBasePath(html) {
  if (!BASE_PATH) return html;
  return html.replace(/(\s(?:href|src|action)=["'])\/(?!\/)/g, `$1${BASE_PATH}/`);
}

// Розбір одного скалярного значення frontmatter
function parseScalar(raw) {
  const val = raw.trim();
  if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
    try {
      return JSON.parse(val);
    } catch (e) {
      return val.slice(1, -1);
    }
  }
  if (val.length >= 2 && val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1).replace(/''/g, "'");
  }
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val.startsWith('[') && val.endsWith(']')) {
    try {
      return JSON.parse(val.replace(/'/g, '"'));
    } catch (e) {
      return val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
  }
  return val;
}

// Парсер Frontmatter (--- key: val ---)
// Підтримує однорядкові значення, а також підмножину YAML, яку записує Decap CMS:
// блокові списки (key:\n  - a\n  - b) та багаторядкові рядки (key: >- / key: |).
function parseFrontmatter(fileContent) {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: fileContent };
  }

  const rawMeta = match[1];
  const content = match[2];
  const data = {};
  const lines = rawMeta.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#') || /^\s/.test(line)) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();

    // Блоковий список або багаторядковий рядок: збираємо наступні відступлені рядки / рядки "- "
    if (val === '' || /^[>|][+-]?$/.test(val)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || (val === '' && /^-\s/.test(lines[i + 1])) || lines[i + 1].trim() === '')) {
        block.push(lines[i + 1]);
        i++;
      }
      while (block.length && !block[block.length - 1].trim()) block.pop();

      if (val === '' && block.length && block.every((l) => !l.trim() || /^\s*-\s/.test(l))) {
        data[key] = block.filter((l) => l.trim()).map((l) => parseScalar(l.replace(/^\s*-\s/, '')));
      } else if (val.startsWith('|')) {
        data[key] = block.map((l) => l.trim()).join('\n');
      } else {
        data[key] = block.map((l) => l.trim()).filter(Boolean).join(' ');
      }
      continue;
    }

    data[key] = parseScalar(val);
  }

  return { data, content };
}

// Нормалізація дати до формату YYYY-MM-DD (Decap може записувати ISO datetime)
function normalizeDate(value) {
  const str = String(value || '').trim();
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : str;
}

// Повний Markdown конвертер в HTML
function markdownToHtml(md) {
  if (!md) return '';

  let html = md;

  // Видалення коментарів
  html = html.replace(/<!--[\s\S]*?-->/g, (match) => {
    // Зберігаємо наші спеціальні плейсхолдери
    if (match.includes('DOCUMENTS_REGISTRY_TABLE') || 
        match.includes('NEWS_GRID') || 
        match.includes('BULLYING_REPORT_FORM') || 
        match.includes('CONTACT_FORM_AND_MAP')) {
      return match;
    }
    return '';
  });

  // Заголовки h4 - h1
  html = html.replace(/^#### (.*$)/gim, '\n\n<h4>$1</h4>\n\n');
  html = html.replace(/^### (.*$)/gim, '\n\n<h3>$1</h3>\n\n');
  html = html.replace(/^## (.*$)/gim, '\n\n<h2>$1</h2>\n\n');
  html = html.replace(/^# (.*$)/gim, '\n\n<h1>$1</h1>\n\n');

  // Горизонтальні лінії
  html = html.replace(/^---$/gim, '\n\n<hr class="section-divider" />\n\n');

  // Жирний та курсив
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/(^|[^*\w])\*([^*\r\n]+)\*(?!\*)/gim, '$1<em>$2</em>');

  // GitHub Alerts / Callouts (підтримка одно- та багаторядкових блоків)
  html = html.replace(/> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\r?\n((?:>.*(?:\r?\n|$))+)/gim, (m, type, text) => {
    const alertType = type.toLowerCase();
    const cleanText = text
      .trim()
      .split(/\r?\n/)
      .map((l) => l.replace(/^> ?/, '').trim())
      .join('<br />');
    let badge = 'Зверніть увагу';
    if (type === 'WARNING' || type === 'CAUTION') badge = 'Важливо';
    if (type === 'TIP') badge = 'Корисна порада';
    if (type === 'IMPORTANT') badge = 'Важлива інформація';
    return `\n\n<div class="callout callout-${alertType}"><strong>${badge}:</strong> ${cleanText}</div>\n\n`;
  });

  // Звичайні цитати >
  html = html.replace(/^> (.*$)/gim, '\n\n<blockquote>$1</blockquote>\n\n');

  // Таблиці
  html = html.replace(/(\|.+\|\r?\n\|[-:| ]+\|\r?\n(?:\|.+\|\r?\n?)+)/g, (tableMatch) => {
    const lines = tableMatch.trim().split(/\r?\n/);
    if (lines.length < 3) return tableMatch;

    const headers = lines[0].split('|').slice(1, -1).map((h) => h.trim());
    let tHtml = '<div class="table-responsive"><table class="data-table"><thead><tr>';
    headers.forEach((h) => {
      tHtml += `<th>${h}</th>`;
    });
    tHtml += '</tr></thead><tbody>';

    for (let i = 2; i < lines.length; i++) {
      const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
      tHtml += '<tr>';
      cells.forEach((c) => {
        tHtml += `<td>${c}</td>`;
      });
      tHtml += '</tr>';
    }
    tHtml += '</tbody></table></div>';
    return `\n\n${tHtml}\n\n`;
  });

  // Зображення ![alt](url) (обов'язково перед звичайними посиланнями!)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1" loading="lazy" />');

  // Посилання [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, (m, text, url) => {
    const isExt = url.startsWith('http://') || url.startsWith('https://');
    const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${url}"${target}>${text}</a>`;
  });

  // Інлайн-код `code`
  html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

  // Списки - або * (включно з відступленими підпунктами)
  html = html.replace(/(?:^\s*[*-] .+(?:\r?\n|$))+/gm, (listMatch) => {
    const items = listMatch.trim().split(/\r?\n/).map((line) => {
      return `<li>${line.replace(/^\s*[*-] /, '').trim()}</li>`;
    });
    return `\n\n<ul>${items.join('')}</ul>\n\n`;
  });

  // Нумеровані списки 1.
  html = html.replace(/(?:^\s*\d+\. .+(?:\r?\n|$))+/gm, (listMatch) => {
    const items = listMatch.trim().split(/\r?\n/).map((line) => {
      return `<li>${line.replace(/^\s*\d+\. /, '').trim()}</li>`;
    });
    return `\n\n<ol>${items.join('')}</ol>\n\n`;
  });

  // Параграфи
  const paragraphs = html.split(/(?:\r?\n){2,}/);
  html = paragraphs
    .map((p) => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || 
          p.startsWith('<ul') || 
          p.startsWith('<ol') || 
          p.startsWith('<div') || 
          p.startsWith('<blockquote') || 
          p.startsWith('<hr') || 
          p.startsWith('<!--')) {
        return p;
      }
      return `<p>${p.replace(/\r?\n/g, '<br />')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  return html;
}

// Генерація блоку офіційних документів з реєстру для конкретної сторінки (за pagePath)
function generatePageDocumentsBoxHtml(pagePath) {
  if (!pagePath || pagePath === '/' || pagePath === '/transparency/') return '';
  const docs = documentsRegistry.filter((d) => d.pagePath === pagePath);
  if (!docs.length) return '';

  const itemsHtml = docs
    .map((doc) => {
      const fmt = String(doc.format || 'PDF').toLowerCase();
      return `
        <div class="page-doc-card">
          <div class="page-doc-info">
            <div class="page-doc-meta">
              <span class="format-badge badge-${escapeAttr(fmt)}">${escapeAttr(doc.format)}</span>
              <span class="page-doc-cat">Реєстр ст. 30 ЗУ (№${escapeAttr(doc.id)}) • ${escapeAttr(doc.category)}</span>
            </div>
            <h4 class="page-doc-title">
              <a href="${escapeAttr(doc.url)}" target="_blank" rel="noopener noreferrer">${escapeAttr(doc.title)}</a>
            </h4>
            <p class="page-doc-desc">${escapeAttr(doc.description)}</p>
          </div>
          <div class="page-doc-action">
            <a href="${escapeAttr(doc.url)}" target="_blank" rel="noopener noreferrer" class="btn-doc-download">
              📥 Відкрити першоджерело
            </a>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <section class="page-docs-widget" aria-label="Офіційні документи з реєстру прозорості">
      <div class="page-docs-header">
        <div>
          <h3>📂 Верифіковані документи у реєстрі прозорості (ст. 30 ЗУ «Про освіту»)</h3>
          <p>Офіційні оцифровані першоджерела Оліївської сільської ради, закріплені за цим розділом</p>
        </div>
        <a href="/transparency/" class="section-link">Увесь реєстр (${documentsRegistry.length}) →</a>
      </div>
      <div class="page-docs-list">
        ${itemsHtml}
      </div>
    </section>
  `;
}

// Генерація таблиці 28 документів з фільтрами
function generateDocumentsRegistryHtml() {
  const categories = Array.from(new Set(documentsRegistry.map((d) => d.category)));

  let selectOptions = '<option value="all">Усі категорії документів (' + documentsRegistry.length + ')</option>';
  categories.forEach((cat) => {
    const count = documentsRegistry.filter((d) => d.category === cat).length;
    selectOptions += `<option value="${escapeAttr(cat)}">${escapeAttr(cat)} (${count})</option>`;
  });

  let rowsHtml = '';
  documentsRegistry.forEach((doc) => {
    const fmt = String(doc.format || 'PDF').toLowerCase();
    rowsHtml += `
      <tr class="doc-row" data-category="${escapeAttr(doc.category)}" data-title="${escapeAttr(doc.title)}" data-desc="${escapeAttr(doc.description)}" data-format="${escapeAttr(doc.format)}">
        <td class="doc-col-id">${escapeAttr(doc.id)}</td>
        <td>
          <div class="doc-row-title">
            <a href="${escapeAttr(doc.url)}" target="_blank" rel="noopener noreferrer">${escapeAttr(doc.title)}</a>
          </div>
          <div class="doc-row-desc">${escapeAttr(doc.description)}</div>
        </td>
        <td>
          <span class="doc-category-pill">
            ${escapeAttr(doc.category)}
          </span>
        </td>
        <td style="text-align: center;">
          <span class="format-badge badge-${escapeAttr(fmt)}">${escapeAttr(doc.format)}</span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <a href="${escapeAttr(doc.url)}" target="_blank" rel="noopener noreferrer" class="btn-doc-download">
            📥 Відкрити
          </a>
        </td>
      </tr>
    `;
  });

  return `
    <div class="doc-search-box">
      <div class="doc-input-wrapper">
        <span class="doc-search-icon" aria-hidden="true">🔍</span>
        <input type="text" id="docSearchInput" class="doc-input" aria-label="Швидкий пошук документів за назвою або ключовими словами" placeholder="Швидкий пошук документів за назвою або ключовими словами..." />
      </div>
      <select id="docCategorySelect" class="doc-filter-select" aria-label="Фільтр документів за категорією">
        ${selectOptions}
      </select>
    </div>
    <div class="doc-summary-bar">
      <span>Знайдено документів: <strong id="docCountBadge">${documentsRegistry.length}</strong></span>
      <span>Офіційні першоджерела Оліївської сільської ради</span>
    </div>
    <div class="doc-table-wrapper">
      <table class="doc-table">
        <thead>
          <tr>
            <th style="width: 45px; text-align: center;">№</th>
            <th>Назва та опис документа</th>
            <th>Категорія</th>
            <th style="width: 80px; text-align: center;">Формат</th>
            <th style="width: 130px; text-align: right;">Дія</th>
          </tr>
        </thead>
        <tbody id="docTableBody">
          ${rowsHtml}
          <tr id="docNoResults" style="display: none;">
            <td colspan="5" class="doc-no-results">
              За вашим запитом документів не знайдено. Спробуйте змінити ключові слова або категорію.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

// Генерація форми зворотного зв'язку та карти для контактів
function generateContactsHtml() {
  const email = siteSettings.email || 'novopol4@ukr.net';
  return `
    <div class="contacts-grid">
      <!-- Форма звернення -->
      <div class="widget-card">
        <h3 class="widget-card-title">Електронне звернення громадян</h3>
        <p class="widget-card-subtitle">
          Відповідно до Закону України «Про звернення громадян», ви можете сформувати та надіслати електронний запит на офіційну пошту дирекції ліцею (<strong>${escapeAttr(email)}</strong>).
        </p>

        <div id="formSuccessAlert" class="form-alert-success" role="status" aria-live="polite" style="display: none;">
          <div>✓ <strong>Лист-звернення сформовано!</strong> Ваш поштовий клієнт відкрито для підтвердження відправки на адресу <strong>${escapeAttr(email)}</strong>.</div>
          <div style="margin-top: 8px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
            <a id="contactMailtoFallback" href="mailto:${escapeAttr(email)}" class="btn-doc-download">✉️ Відкрити в пошті ще раз</a>
            <button type="button" id="contactCopyBtn" class="btn-doc-download" style="border: 1px solid currentColor; cursor: pointer;">📋 Скопіювати текст звернення</button>
          </div>
        </div>

        <form id="schoolContactForm" data-recipient="${escapeAttr(email)}">
          <div class="form-group">
            <label class="form-label" for="contactName">Прізвище, ім'я та по батькові *</label>
            <input type="text" id="contactName" class="form-control" placeholder="Іваненко Іван Іванович" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="contactEmail">Електронна пошта для відповіді *</label>
            <input type="email" id="contactEmail" class="form-control" placeholder="name@example.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="contactPhone">Контактний телефон</label>
            <input type="tel" id="contactPhone" class="form-control" placeholder="+38 (0__) ___-__-__" />
          </div>
          <div class="form-group">
            <label class="form-label" for="contactTopic">Тема звернення</label>
            <select id="contactTopic" class="form-control">
              <option value="Вступ до 1-го класу / зарахування">Вступ до 1-го класу / зарахування</option>
              <option value="Організація освітнього процесу">Організація освітнього процесу</option>
              <option value="Харчування здобувачів освіти">Харчування здобувачів освіти</option>
              <option value="Загальні питання та пропозиції">Загальні питання та пропозиції</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="contactMessage">Текст звернення *</label>
            <textarea id="contactMessage" class="form-control" placeholder="Викладіть суть вашого питання чи звернення..." required></textarea>
          </div>
          <button type="submit" class="btn-submit">Надіслати звернення</button>
        </form>
      </div>

      <!-- Інтерактивна карта та схема доїзду -->
      <div class="widget-card" style="display: flex; flex-direction: column;">
        <h3 class="widget-card-title">Розташування та безпечний підхід</h3>
        <p class="widget-card-subtitle">
          Адреса: ${escapeAttr(siteSettings.address || 'вул. Миру, 12, с. Новопіль, Житомирський район, Житомирська область, Україна, 12333')}.
        </p>
        <div class="map-frame-wrapper">
          <iframe 
            title="Інтерактивна карта розташування Новопільського ліцею"
            width="100%" 
            height="100%" 
            frameborder="0" 
            scrolling="no" 
            marginheight="0" 
            marginwidth="0" 
            src="https://www.openstreetmap.org/export/embed.html?bbox=28.6400%2C50.3550%2C28.6900%2C50.3780&amp;layer=mapnik&amp;marker=50.3667%2C28.6667"
            style="border: 0; min-height: 300px;">
          </iframe>
        </div>
        <div class="map-landmark-note">
          📍 <strong>Орієнтир:</strong> Центр села Новопіль, поруч із центральною зупинкою та парковою зоною. Під'їзні шляхи асфальтовані, облаштовано безпечний пішохідний перехід.
        </div>
      </div>
    </div>
  `;
}

// Генерація форми повідомлення про булінг
function generateBullyingFormHtml() {
  const email = siteSettings.email || 'novopol4@ukr.net';
  return `
    <div class="bully-form-box">
      <h3 class="bully-form-title">
        🛡️ Форма конфіденційного повідомлення про булінг (цькування)
      </h3>
      <p class="bully-form-subtitle">
        Якщо ви стали свідком або потерпілим від булінгу в ліцеї, ви можете повідомити про це дирекцію та психологічну службу (<strong>${escapeAttr(email)}</strong>). Ви маєте право залишитися анонімним або звернутися на гарячу лінію <strong>116 111</strong>.
      </p>

      <div id="bullySuccessAlert" class="form-alert-success" role="status" aria-live="polite" style="display: none;">
        <div>✓ <strong>Повідомлення сформовано!</strong> Відкрито поштовий клієнт для надсилання дирекції ліцею на <strong>${escapeAttr(email)}</strong> (або скопіюйте текст нижче для передачі через зручний канал).</div>
        <div style="margin-top: 8px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <a id="bullyMailtoFallback" href="mailto:${escapeAttr(email)}" class="btn-doc-download">✉️ Відкрити в пошті ще раз</a>
          <button type="button" id="bullyCopyBtn" class="btn-doc-download" style="border: 1px solid currentColor; cursor: pointer;">📋 Скопіювати текст заяви</button>
        </div>
      </div>

      <form id="bullyReportForm" data-recipient="${escapeAttr(email)}">
        <div class="bully-form-grid">
          <div class="form-group">
            <label class="form-label" for="bullyName">Ваше ім'я (за бажанням, можна залишити порожнім)</label>
            <input type="text" id="bullyName" class="form-control" placeholder="Анонімно або вкажіть ім'я" />
          </div>
          <div class="form-group">
            <label class="form-label" for="bullyRole">Хто ви?</label>
            <select id="bullyRole" class="form-control">
              <option value="Учень / учениця ліцею">Учень / учениця ліцею</option>
              <option value="Батько / мати / опікун">Батько / мати / опікун</option>
              <option value="Вчитель / працівник ліцею">Вчитель / працівник ліцею</option>
              <option value="Свідок ситуації">Свідок ситуації</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="bullyClass">У якому класі або де це сталося? *</label>
          <input type="text" id="bullyClass" class="form-control" placeholder="Наприклад: 7 клас, шкільне подвір'я або в Інтернеті" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="bullyDetails">Опишіть ситуацію *</label>
          <textarea id="bullyDetails" class="form-control" placeholder="Що саме сталося, хто брав участь, чи потрібна термінова психологічна або медична допомога..." required></textarea>
        </div>
        <button type="submit" class="btn-submit btn-submit-danger">
          Надіслати конфіденційне повідомлення
        </button>
      </form>
    </div>
  `;
}

// Завантаження всіх новин
function getNewsList() {
  const newsDir = path.join(CONTENT_DIR, 'news');
  if (!fs.existsSync(newsDir)) return [];

  const files = fs.readdirSync(newsDir).filter((f) => f.endsWith('.md'));
  const list = files.map((file) => {
    const raw = fs.readFileSync(path.join(newsDir, file), 'utf8');
    const { data, content } = parseFrontmatter(raw);
    const slug = file.replace(/\.md$/, '');
    const tags = Array.isArray(data.tags) ? data.tags : data.tags ? [String(data.tags)] : ['Події'];
    return {
      slug,
      title: data.title || 'Новина ліцею',
      date: normalizeDate(data.date),
      excerpt: data.excerpt || '',
      author: data.author || 'Пресцентр Новопільського ліцею',
      tags,
      image: data.image || '/assets/images/news-1.svg',
      content,
    };
  });

  return list.sort((a, b) => (b.date > a.date ? 1 : -1));
}

// Завантаження активних оголошень
function getActiveAnnouncements() {
  const annDir = path.join(CONTENT_DIR, 'announcements');
  if (!fs.existsSync(annDir)) return [];

  const files = fs.readdirSync(annDir).filter((f) => f.endsWith('.md'));
  const list = files.map((file) => {
    const raw = fs.readFileSync(path.join(annDir, file), 'utf8');
    const { data, content } = parseFrontmatter(raw);
    return {
      title: data.title || 'Оголошення',
      date: data.date || '',
      active: data.active !== false,
      priority: data.priority || 'Звичайна',
      content: content.trim(),
    };
  });

  return list.filter((a) => a.active);
}

// Завантаження всіх сторінок
function getAllPages() {
  const pagesDir = path.join(CONTENT_DIR, 'pages');
  if (!fs.existsSync(pagesDir)) return [];

  const files = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(pagesDir, file), 'utf8');
    const { data, content } = parseFrontmatter(raw);
    return {
      file,
      slug: file.replace(/\.md$/, ''),
      title: data.title || '',
      path: data.path || '/',
      section: data.section || 'Головна',
      description: data.description || '',
      content,
    };
  });
}

// Меню навігації з повною картою сайту
const navigationStructure = [
  {
    title: 'Головна',
    url: '/',
  },
  {
    title: 'Про ліцей',
    url: '/about/',
    children: [
      { title: 'Візитівка та адміністрація', url: '/about/administration/' },
      { title: 'Історія школи (з 1885 р.)', url: '/about/history/' },
      { title: 'Структура та врядування', url: '/about/management/' },
      { title: 'Педагогічний колектив', url: '/about/teachers/' },
      { title: 'Матеріально-технічна база', url: '/about/infrastructure/' },
      { title: 'Вакансії', url: '/about/vacancies/' },
    ],
  },
  {
    title: 'Прозорість та звітність',
    url: '/transparency/',
    badge: 'ст. 30 ЗУ',
    children: [
      { title: 'Огляд публічної інформації', url: '/transparency/' },
      { title: 'Статут та ліцензії', url: '/transparency/statute/' },
      { title: 'Ліцензований обсяг та учні', url: '/transparency/capacity/' },
      { title: 'Територія обслуговування', url: '/transparency/catchment-area/' },
      { title: 'Звіти директора', url: '/transparency/annual-reports/' },
      { title: 'Моніторинг якості освіти', url: '/transparency/quality-monitoring/' },
      { title: 'Фінансова звітність / Закупівлі', url: '/transparency/finance/' },
      { title: 'Додаткові послуги', url: '/transparency/extra-services/' },
    ],
  },
  {
    title: 'Освітній процес',
    url: '/education/',
    children: [
      { title: 'Освітні програми', url: '/education/programs/' },
      { title: 'Критерії оцінювання (1-4 та 5-11 кл.)', url: '/education/evaluation/' },
      { title: 'Розклад уроків та дзвінків', url: '/education/schedule/' },
      { title: 'НУШ: Нова українська школа', url: '/education/nush/' },
      { title: 'Дистанційне навчання', url: '/education/distance-learning/' },
      { title: 'Мова освітнього процесу', url: '/education/language/' },
    ],
  },
  {
    title: 'Безпечне середовище',
    url: '/safety/',
    children: [
      { title: 'Протидія булінгу (плани, заяви)', url: '/safety/anti-bullying/' },
      { title: 'Цивільний захист та укриття', url: '/safety/civil-defense/' },
      { title: 'Інклюзивна освіта (ООП)', url: '/safety/inclusion/' },
      { title: 'Правила поведінки учнів', url: '/safety/code-of-conduct/' },
      { title: 'Психологічна служба', url: '/safety/psychology/' },
    ],
  },
  {
    title: 'Вступ та батькам',
    url: '/parents-students/',
    children: [
      { title: 'Прийом до 1 класу', url: '/parents-students/admission-1st-grade/' },
      { title: 'Зразки заяв та згод', url: '/parents-students/forms/' },
      { title: 'Електронний щоденник (NZ.UA)', url: '/parents-students/electronic-journal/' },
      { title: 'Організація харчування (НАССР)', url: '/parents-students/canteen/' },
      { title: 'Учнівське самоврядування', url: '/parents-students/student-council/' },
    ],
  },
  {
    title: 'Медіа',
    url: '/news/',
    children: [
      { title: 'Новини ліцею', url: '/news/' },
      { title: 'Фото та відеогалерея', url: '/news/gallery/' },
      { title: 'Facebook-спільнота', url: 'https://www.facebook.com/groups/410306759668647', external: true },
    ],
  },
  {
    title: 'Контакти',
    url: '/contacts/',
  },
];

// Генерація HTML-розмітки навігаційного меню
function renderNavigationMenu(currentUrl) {
  return navigationStructure
    .map((item) => {
      const isActive = currentUrl === item.url || (item.children && item.children.some((c) => c.url === currentUrl));
      const hasChildren = item.children && item.children.length > 0;
      const ariaAttrs = hasChildren ? ' aria-haspopup="true" aria-expanded="false"' : '';

      let linkHtml = `<a href="${item.url}" class="nav-link"${ariaAttrs}>${item.title}`;
      if (hasChildren) {
        linkHtml += ` <span class="arrow" aria-hidden="true">▼</span>`;
      }
      linkHtml += `</a>`;

      let dropHtml = '';
      if (hasChildren) {
        dropHtml = '<ul class="dropdown-menu">';
        item.children.forEach((sub) => {
          const target = sub.external ? ' target="_blank" rel="noopener noreferrer"' : '';
          dropHtml += `<li><a href="${sub.url}" class="dropdown-link"${target}>${sub.title}</a></li>`;
        });
        dropHtml += '</ul>';
      }

      return `<li class="nav-item ${isActive ? 'active' : ''}">${linkHtml}${dropHtml}</li>`;
    })
    .join('');
}

// Генерація бічного меню для внутрішніх сторінок
function renderSidebarMenu(currentSection, currentUrl) {
  // Зіставлення за URL або назвою розділу
  const sectionObj = navigationStructure.find((item) => {
    if (item.url !== '/' && currentUrl.startsWith(item.url)) return true;
    if (item.children && item.children.some((c) => c.url === currentUrl)) return true;
    if (currentSection && item.title.includes(currentSection)) return true;
    if (currentSection === 'Прозорість та публічна інформація' && item.url === '/transparency/') return true;
    if (currentSection === 'Батькам та учням' && item.url === '/parents-students/') return true;
    if (currentSection === 'Медіацентр' && item.url === '/news/') return true;
    return false;
  });

  if (!sectionObj || !sectionObj.children) return '';

  let listHtml = '';
  sectionObj.children.forEach((sub) => {
    const isAct = sub.url === currentUrl;
    const target = sub.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    listHtml += `<li class="${isAct ? 'active' : ''}"><a href="${sub.url}"${target}>${sub.title}</a></li>`;
  });

  const phone = siteSettings.phone || '+38 (067) 184-42-88';
  const email = siteSettings.email || 'novopol4@ukr.net';

  return `
    <aside class="page-sidebar">
      <h3 class="sidebar-title">${escapeAttr(sectionObj.title)}</h3>
      <ul class="sidebar-nav">
        ${listHtml}
      </ul>
      <div class="sidebar-consult-box">
        <p class="sidebar-consult-label"><strong>Потрібна консультація?</strong></p>
        <p class="sidebar-consult-phone"><a href="tel:${escapeAttr(phone.replace(/[^0-9+]/g, ''))}">${escapeAttr(phone)}</a></p>
        <p class="sidebar-consult-email"><a href="mailto:${escapeAttr(email)}">${escapeAttr(email)}</a></p>
      </div>
    </aside>
  `;
}

// Генерація головного HTML шаблону
function renderFullPage({ title, description, contentHtml, currentUrl, section, isHomepage }) {
  const navHtml = renderNavigationMenu(currentUrl);
  const sidebarHtml = isHomepage ? '' : renderSidebarMenu(section, currentUrl);

  const heroBanner = isHomepage
    ? `
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <div class="hero-badge">
            <span>🏛️ Оліївська сільська рада • Житомирський район</span>
          </div>
          <h1 class="hero-title">${escapeAttr(siteSettings.schoolName)}</h1>
          <p class="hero-desc">
            Освітній простір успіху, безпеки та розвитку дитини. Зберігаємо понад 140-річні традиції школи з 1885 року та впроваджуємо сучасні технології Нової української школи для ${escapeAttr(siteSettings.studentsCount || 165)} ліцеїстів.
          </p>
          <div class="hero-actions">
            <a href="/parents-students/admission-1st-grade/" class="btn-primary">
              🎒 Прийом до 1 класу
            </a>
            <a href="${escapeAttr(siteSettings.electronicJournalUrl || 'https://nz.ua/')}" target="_blank" rel="noopener noreferrer" class="btn-secondary">
              📖 Електронний щоденник NZ.UA
            </a>
            <a href="/safety/civil-defense/" class="btn-secondary">
              🛡️ Безпека та укриття
            </a>
          </div>
        </div>

        <div>
          <div class="hero-card">
            <div class="hero-director">
              <div class="director-avatar" aria-hidden="true">👩‍🏫</div>
              <div class="director-info">
                <h2>${escapeAttr(siteSettings.director)}</h2>
                <p>Директор Новопільського ліцею</p>
              </div>
            </div>
            <p class="hero-quote">
              «Ми прагнемо створити в ліцеї атмосферу захищеності, підтримки та натхнення, де кожна дитина відчуває себе особистістю, знаходить друзів та розкриває свої унікальні здібності.»
            </p>
            <div class="hero-contacts-list">
              <div>📞 <strong>Телефон:</strong> <a href="tel:${escapeAttr(siteSettings.phone.replace(/[^0-9+]/g, ''))}">${escapeAttr(siteSettings.phone)}</a></div>
              <div>✉️ <strong>E-mail:</strong> <a href="mailto:${escapeAttr(siteSettings.email)}">${escapeAttr(siteSettings.email)}</a></div>
              <div>📍 <strong>Адреса:</strong> ${escapeAttr(siteSettings.address || 'вул. Миру, 12, с. Новопіль')}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Швидкі кнопки переходу -->
    <div class="container quick-bar">
      <div class="quick-grid">
        ${(siteSettings.quickLinks && siteSettings.quickLinks.length ? siteSettings.quickLinks : [
          { title: 'Вступ до 1 класу', url: '/parents-students/admission-1st-grade/', icon: '🎒' },
          { title: 'Щоденник NZ.UA', url: 'https://nz.ua/', icon: '📊', external: true },
          { title: 'Розклад уроків', url: '/education/schedule/', icon: '⏰' },
          { title: 'Протидія булінгу', url: '/safety/anti-bullying/', icon: '🛡️' },
          { title: 'Безпечне укриття', url: '/safety/civil-defense/', icon: '🚪' },
          { title: 'Прозорість (ст. 30 ЗУ)', url: '/transparency/', icon: '📜' }
        ]).map(ql => {
          const iconMap = {
            admission: '🎒',
            journal: '📊',
            schedule: '⏰',
            safety: '🛡️',
            shield: '🚪',
            document: '📜'
          };
          const icon = iconMap[ql.icon] || ql.icon || '🔗';
          const ext = ql.external ? ' target="_blank" rel="noopener noreferrer"' : '';
          return `
            <a href="${escapeAttr(ql.url)}"${ext} class="quick-card">
              <div class="quick-icon" aria-hidden="true">${icon}</div>
              <div><h3>${escapeAttr(ql.title)}</h3></div>
            </a>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Ключові факти в цифрах -->
    <div class="container stats-section">
      <div class="stats-grid">
        ${(siteSettings.stats && siteSettings.stats.length ? siteSettings.stats : [
          { value: String(siteSettings.studentsCount || 165), label: 'Здобувачів освіти' },
          { value: 'I-III', label: 'Ступені навчання' },
          { value: '1885', label: 'Рік заснування школи' },
          { value: '100%', label: 'Облаштоване укриття ДСНС' }
        ]).map(st => `
          <div class="stat-item">
            <div class="stat-num">${escapeAttr(st.value)}</div>
            <div class="stat-label">${escapeAttr(st.label)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `
    : '';

  const announcements = isHomepage ? getActiveAnnouncements() : [];
  let announcementHtml = '';
  if (announcements.length > 0) {
    const ann = announcements[0];
    announcementHtml = `
      <div class="container">
        <div class="announcement-banner" role="region" aria-label="Важливе оголошення">
          <div class="announcement-icon" aria-hidden="true">📢</div>
          <div class="announcement-content">
            <h2>${escapeAttr(ann.title)}</h2>
            ${markdownToHtml(ann.content)}
          </div>
        </div>
      </div>
    `;
  }

  const newsList = isHomepage ? getNewsList().slice(0, 3) : [];
  let homeNewsHtml = '';
  if (isHomepage && newsList.length > 0) {
    let cards = '';
    newsList.forEach((n) => {
      cards += `
        <article class="news-card">
          <div class="news-img">
            <img src="${escapeAttr(n.image)}" alt="${escapeAttr(n.title)}" loading="lazy" />
            <span class="news-tag">${escapeAttr(n.tags[0] || 'Подія')}</span>
          </div>
          <div class="news-body">
            <div class="news-date">📅 ${escapeAttr(n.date)} • ${escapeAttr(n.author)}</div>
            <h3 class="news-title">${escapeAttr(n.title)}</h3>
            <p class="news-desc">${escapeAttr(n.excerpt)}</p>
            <a href="/news/${escapeAttr(n.slug)}/" class="section-link" style="margin-top: auto;">
              Читати повністю →
            </a>
          </div>
        </article>
      `;
    });

    homeNewsHtml = `
      <section style="padding: 20px 0 50px;">
        <div class="container">
          <div class="section-head">
            <div>
              <h2 class="section-title">Свіжі новини ліцею</h2>
              <p class="section-subtitle">Події, урочистості, олімпіади та повсякденне шкільне життя</p>
            </div>
            <a href="/news/" class="section-link">Всі новини ліцею →</a>
          </div>
          <div class="cards-grid">
            ${cards}
          </div>
        </div>
      </section>
    `;
  }

  const phoneClean = (siteSettings.phone || '+380671844288').replace(/[^0-9+]/g, '');

  const rawHtml = `<!doctype html>
<html lang="uk" data-base-path="${escapeAttr(BASE_PATH)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeAttr(title)} | Новопільський ліцей Оліївської сільської ради</title>
  <meta name="description" content="${escapeAttr(description || siteSettings.schoolName)}" />
  <link rel="icon" type="image/svg+xml" href="/assets/images/logo.svg" />
  
  <!-- CSS Stylesheets -->
  <link rel="stylesheet" href="/assets/css/style.css" />
  <link rel="stylesheet" href="/assets/css/accessibility.css" />
</head>
<body>

  <!-- ВЕРХНЯ ПАНЕЛЬ ДОСТУПНОСТІ (WCAG 2.1 / ДСТУ ISO/IEC 40500:2015) -->
  <div id="a11yPanel" class="a11y-panel" role="region" aria-label="Панель налаштувань доступності">
    <div class="a11y-container">
      <div class="a11y-group">
        <span class="a11y-label">Розмір шрифту:</span>
        <button type="button" class="a11y-btn" data-a11y-action="fontsize" data-a11y-value="font-md" title="Звичайний розмір шрифту">A</button>
        <button type="button" class="a11y-btn" data-a11y-action="fontsize" data-a11y-value="font-lg" title="Збільшений шрифт">A+</button>
        <button type="button" class="a11y-btn" data-a11y-action="fontsize" data-a11y-value="font-xl" title="Дуже великий шрифт">A++</button>
      </div>

      <div class="a11y-group">
        <span class="a11y-label">Контрастність:</span>
        <button type="button" class="a11y-btn" data-a11y-action="theme" data-a11y-value="theme-normal" title="Звичайна колірна схема">Стандарт</button>
        <button type="button" class="a11y-btn" data-a11y-action="theme" data-a11y-value="theme-bw" title="Чорно-білий контраст">Ч/Б</button>
        <button type="button" class="a11y-btn" data-a11y-action="theme" data-a11y-value="theme-wb" title="Темний високий контраст">Інверсія</button>
        <button type="button" class="a11y-btn" data-a11y-action="theme" data-a11y-value="theme-by" title="Синій на жовтому фоні">Синьо-жовтий</button>
      </div>

      <div class="a11y-group">
        <span class="a11y-label">Додатково:</span>
        <button type="button" class="a11y-btn" data-a11y-action="spacing" title="Збільшити міжрядковий інтервал">Інтервал</button>
        <button type="button" class="a11y-btn" data-a11y-action="dyslexic" title="Шрифт для людей з дислексією">Шрифт НУШ</button>
        <button type="button" class="a11y-btn" data-a11y-action="images" data-a11y-value="grayscale" title="Чорно-білі фотографії">Ч/Б фото</button>
        <button type="button" class="a11y-btn" data-a11y-action="images" data-a11y-value="hide" title="Приховати зображення">Без фото</button>
        <button type="button" class="a11y-btn" data-a11y-action="speech" title="Озвучити текст сторінки">🔊 Читати голос</button>
        <button type="button" class="a11y-btn" data-a11y-action="reset" title="Скинути до стандартних налаштувань">Скинути</button>
      </div>

      <div>
        <button type="button" id="a11yCloseBtn" class="a11y-btn-close">✕ Закрити</button>
      </div>
    </div>
  </div>

  <!-- МОДАЛЬНЕ ВІКНО ПОШУКУ ПО САЙТУ -->
  <div id="siteSearchModal" class="search-modal" role="dialog" aria-modal="true" aria-label="Пошук по сайту ліцею" hidden>
    <div class="search-modal-backdrop" data-close-search></div>
    <div class="search-modal-dialog">
      <div class="search-modal-header">
        <label for="siteSearchInput" class="sr-only">Пошук сторінок, новин та документів</label>
        <span class="search-modal-icon" aria-hidden="true">🔍</span>
        <input type="search" id="siteSearchInput" class="search-modal-input" placeholder="Пошук сторінок, новин, розкладу, правил вступу..." autocomplete="off" />
        <button type="button" id="siteSearchCloseBtn" class="search-modal-close" aria-label="Закрити вікно пошуку">✕</button>
      </div>
      <div id="siteSearchResults" class="search-modal-results" role="region" aria-live="polite">
        <p class="search-modal-hint">Введіть ключове слово (наприклад: «1 клас», «розклад», «булінг», «статут», «харчування»)</p>
      </div>
    </div>
  </div>

  <!-- TOP CONTACT BAR -->
  <div class="topbar">
    <div class="container">
      <div class="topbar-contacts">
        <a href="tel:${escapeAttr(phoneClean)}">
          📞 ${escapeAttr(siteSettings.phone)}
        </a>
        <a href="mailto:${escapeAttr(siteSettings.email)}">
          ✉️ ${escapeAttr(siteSettings.email)}
        </a>
        <span>📍 ${escapeAttr(siteSettings.address || 'с. Новопіль, вул. Миру, 12')}</span>
      </div>
      <div class="topbar-actions">
        <button type="button" class="btn-search-trigger" data-open-search title="Пошук по сайту (Ctrl+K)">
          🔍 Пошук
        </button>
        <button type="button" id="a11yToggleBtn" class="btn-accessibility" data-toggle-a11y aria-expanded="false" title="Налаштування сайту для людей з порушенням зору">
          👁️ Людям з порушенням зору
        </button>
        <a href="${escapeAttr(siteSettings.electronicJournalUrl || 'https://nz.ua/')}" target="_blank" rel="noopener noreferrer" class="btn-journal-link">
          📖 NZ.UA Щоденник
        </a>
        <a href="${escapeAttr(siteSettings.facebookUrl)}" target="_blank" rel="noopener noreferrer" class="topbar-fb-link" title="Facebook ліцею">
          f Facebook
        </a>
      </div>
    </div>
  </div>

  <!-- SITE HEADER & NAV -->
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand-wrapper">
        <img src="/assets/images/logo.svg" alt="Герб Новопільського ліцею" class="brand-logo" />
        <div class="brand-text">
          <div class="brand-title">${escapeAttr(siteSettings.shortName)}</div>
          <p>Оліївської сільської ради Житомирського району</p>
        </div>
      </a>

      <div class="header-mobile-controls">
        <button type="button" class="mobile-icon-btn" data-open-search aria-label="Пошук по сайту" title="Пошук по сайту">
          🔍
        </button>
        <button type="button" class="mobile-icon-btn" data-toggle-a11y aria-label="Налаштування для людей з порушенням зору" title="Людям з порушенням зору">
          👁️
        </button>
        <button type="button" id="mobileMenuBtn" class="mobile-menu-btn" aria-label="Відкрити головне меню" aria-expanded="false">
          ☰
        </button>
      </div>

      <nav aria-label="Головна навігація сайту">
        <ul id="navMenu" class="nav-menu">
          ${navHtml}
          <li class="nav-mobile-Utility">
            <div class="nav-mobile-actions">
              <button type="button" class="btn-accessibility" data-toggle-a11y style="width: 100%; justify-content: center; padding: 10px;">
                👁️ Версія для людей з порушенням зору
              </button>
              <a href="${escapeAttr(siteSettings.electronicJournalUrl || 'https://nz.ua/')}" target="_blank" rel="noopener noreferrer" class="btn-journal-link" style="width: 100%; justify-content: center; padding: 10px;">
                📖 Електронний щоденник NZ.UA
              </a>
              <div class="nav-mobile-contacts">
                <a href="tel:${escapeAttr(phoneClean)}">📞 ${escapeAttr(siteSettings.phone)}</a>
                <a href="mailto:${escapeAttr(siteSettings.email)}">✉️ ${escapeAttr(siteSettings.email)}</a>
              </div>
            </div>
          </li>
        </ul>
      </nav>
    </div>
  </header>

  <!-- HERO SECTION (Лише на головній) -->
  ${heroBanner}

  <!-- ОГОЛОШЕННЯ (якщо є активні) -->
  ${announcementHtml}

  <!-- ГОЛОВНИЙ ЗМІСТ СТОРІНКИ -->
  <main>
    ${
      isHomepage
        ? `
        <div class="container" style="margin-bottom: 50px;">
          <div class="page-content" style="border-radius: 16px;">
            ${contentHtml}
          </div>
        </div>
        ${homeNewsHtml}
      `
        : `
        <div class="page-header">
          <div class="container">
            <div class="breadcrumbs" aria-label="Хлібні крихти">
              <a href="/">Головна</a>
              <span aria-hidden="true">/</span>
              ${(() => {
                const sectionUrlMap = {
                  'Про ліцей': '/about/',
                  'Прозорість та публічна інформація': '/transparency/',
                  'Освітній процес': '/education/',
                  'Безпечне середовище': '/safety/',
                  'Батькам та учням': '/parents-students/',
                  'Медіацентр': '/news/',
                  'Новини ліцею': '/news/',
                  'Контакти': '/contacts/'
                };
                const sUrl = sectionUrlMap[section];
                if (sUrl && sUrl !== currentUrl) {
                  return `<span><a href="${sUrl}">${escapeAttr(section)}</a></span>`;
                }
                return `<span>${escapeAttr(section)}</span>`;
              })()}
              <span aria-hidden="true">/</span>
              <span aria-current="page">${escapeAttr(title)}</span>
            </div>
            <h1 class="page-title">${escapeAttr(title)}</h1>
          </div>
        </div>

        <div class="container page-container${sidebarHtml && sidebarHtml.trim() ? '' : ' no-sidebar'}">
          ${sidebarHtml}
          <article class="page-content">
            ${contentHtml}
          </article>
        </div>
      `
    }
  </main>

  <!-- FOOTER -->
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <h3>${escapeAttr(siteSettings.shortName)}</h3>
          <p>
            Комунальний заклад загальної середньої освіти I–III ступенів Оліївської сільської ради Житомирського району Житомирської області.
          </p>
          <div class="footer-requisites">
            <div>• Код ЄДРПОУ: <strong>${escapeAttr(siteSettings.edrpou)}</strong></div>
            <div>• ID закладу в ІСУО: <strong>${escapeAttr(siteSettings.isuoId)}</strong></div>
            <div>• КОАТУУ: <strong>${escapeAttr(siteSettings.koatuu)}</strong></div>
            <div>• КАТОТТГ: <strong>${escapeAttr(siteSettings.katottg)}</strong></div>
          </div>
        </div>

        <div class="footer-col">
          <h4>Навігація</h4>
          <ul class="footer-links">
            <li><a href="/about/">Про ліцей</a></li>
            <li><a href="/transparency/">Прозорість (ст. 30 ЗУ)</a></li>
            <li><a href="/education/">Освітній процес</a></li>
            <li><a href="/safety/">Безпечне середовище</a></li>
            <li><a href="/parents-students/">Батькам та учням</a></li>
            <li><a href="/news/">Медіацентр</a></li>
            <li><a href="/contacts/">Контакти</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Швидкий доступ</h4>
          <ul class="footer-links">
            <li><a href="/parents-students/admission-1st-grade/">Вступ до 1 класу</a></li>
            <li><a href="${escapeAttr(siteSettings.electronicJournalUrl || 'https://nz.ua/')}" target="_blank" rel="noopener noreferrer">Електронний щоденник NZ.UA</a></li>
            <li><a href="/safety/civil-defense/">Укриття ліцею</a></li>
            <li><a href="/safety/anti-bullying/">Протидія булінгу</a></li>
            <li><a href="/transparency/statute/">Статутні документи</a></li>
            <li><a href="/transparency/annual-reports/">Звіти директора</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Контакти ліцею</h4>
          <ul class="footer-contacts">
            <li>📍 ${escapeAttr(siteSettings.address || '12333, Житомирська обл., Житомирський р-н, с. Новопіль, вул. Миру, 12')}</li>
            <li>📞 <a href="tel:${escapeAttr(phoneClean)}">${escapeAttr(siteSettings.phone)}</a></li>
            <li>✉️ <a href="mailto:${escapeAttr(siteSettings.email)}">${escapeAttr(siteSettings.email)}</a></li>
            <li>👤 Директор: ${escapeAttr(siteSettings.director)}</li>
            <li>🌐 <a href="${escapeAttr(siteSettings.facebookUrl)}" target="_blank" rel="noopener noreferrer">Facebook-сторінка</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <div>
          © ${new Date().getFullYear()} Новопільський ліцей Оліївської сільської ради. Всі права захищено.
        </div>
        <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
          <a href="/transparency/">Відповідність ст. 30 ЗУ «Про освіту»</a>
          <span>•</span>
          <a href="/admin/" class="footer-cms-badge" title="Керування вмістом сайту через Git-based CMS (Decap)">
            ⚙️ Панель керування (Git CMS)
          </a>
        </div>
      </div>
    </div>
  </footer>

  <!-- Scripts -->
  <script src="/assets/js/accessibility.js"></script>
  <script src="/assets/js/main.js"></script>
</body>
</html>`;

  return applyBasePath(rawHtml);
}

// Рекурсивне копіювання файлів
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Головна функція збирання
function buildSite() {
  console.log('🚀 Початок генерації статичного сайту Новопільського ліцею...');

  // Перечитування конфігурації та реєстру документів перед кожним білдом
  loadData();

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // 1. Копіювання public асетів
  console.log('📦 Копіювання статичних асетів (CSS, JS, зображення, Decap CMS)...');
  copyDirSync(PUBLIC_DIR, DIST_DIR);

  // Адаптація BASE_PATH для адмін-панелі та конфігурації Decap CMS у dist/
  if (BASE_PATH) {
    const adminHtmlPath = path.join(DIST_DIR, 'admin', 'index.html');
    if (fs.existsSync(adminHtmlPath)) {
      fs.writeFileSync(adminHtmlPath, applyBasePath(fs.readFileSync(adminHtmlPath, 'utf8')), 'utf8');
    }
    const editorHtmlPath = path.join(DIST_DIR, 'admin', 'editor', 'index.html');
    if (fs.existsSync(editorHtmlPath)) {
      fs.writeFileSync(editorHtmlPath, applyBasePath(fs.readFileSync(editorHtmlPath, 'utf8')), 'utf8');
    }
    const decapConfigPath = path.join(DIST_DIR, 'admin', 'config.yml');
    if (fs.existsSync(decapConfigPath)) {
      const cfg = fs.readFileSync(decapConfigPath, 'utf8').replace(
        /^public_folder:\s*["']?\/assets\/uploads["']?/m,
        `public_folder: "${BASE_PATH}/assets/uploads"`
      );
      fs.writeFileSync(decapConfigPath, cfg, 'utf8');
    }
  }

  // 2. Збирання сторінок контенту
  const pages = getAllPages();
  const searchIndex = [];

  console.log(`📄 Генерація ${pages.length} сторінок сайту...`);

  pages.forEach((page) => {
    let parsedBody = markdownToHtml(page.content);

    // Заміна специфічних віджетів
    if (parsedBody.includes('<!-- DOCUMENTS_REGISTRY_TABLE -->')) {
      parsedBody = parsedBody.replace('<!-- DOCUMENTS_REGISTRY_TABLE -->', generateDocumentsRegistryHtml());
    }
    if (parsedBody.includes('<!-- BULLYING_REPORT_FORM -->')) {
      parsedBody = parsedBody.replace('<!-- BULLYING_REPORT_FORM -->', generateBullyingFormHtml());
    }
    if (parsedBody.includes('<!-- CONTACT_FORM_AND_MAP -->')) {
      parsedBody = parsedBody.replace('<!-- CONTACT_FORM_AND_MAP -->', generateContactsHtml());
    }
    if (parsedBody.includes('<!-- NEWS_GRID -->')) {
      const allNews = getNewsList();
      let cards = '';
      allNews.forEach((n) => {
        cards += `
          <article class="news-card">
            <div class="news-img">
              <img src="${escapeAttr(n.image)}" alt="${escapeAttr(n.title)}" loading="lazy" />
              <span class="news-tag">${escapeAttr(n.tags[0] || 'Подія')}</span>
            </div>
            <div class="news-body">
              <div class="news-date">📅 ${escapeAttr(n.date)} • ${escapeAttr(n.author)}</div>
              <h3 class="news-title">${escapeAttr(n.title)}</h3>
              <p class="news-desc">${escapeAttr(n.excerpt)}</p>
              <a href="/news/${escapeAttr(n.slug)}/" class="section-link" style="margin-top: auto;">
                Читати повністю →
              </a>
            </div>
          </article>
        `;
      });
      parsedBody = parsedBody.replace('<!-- NEWS_GRID -->', `<div class="cards-grid">${cards}</div>`);
    }

    // Автоматичний блок верифікованих документів з реєстру прозорості (ст. 30 ЗУ) для відповідних підсторінок
    const pageDocsBox = generatePageDocumentsBoxHtml(page.path);
    if (pageDocsBox) {
      parsedBody += '\n' + pageDocsBox;
    }

    const isHomepage = page.path === '/' || page.path === '';
    const fullHtml = renderFullPage({
      title: page.title,
      description: page.description,
      contentHtml: parsedBody,
      currentUrl: page.path,
      section: page.section,
      isHomepage,
    });

    let targetDir;
    if (isHomepage) {
      targetDir = DIST_DIR;
    } else {
      const cleanPath = page.path.replace(/^\/|\/$/g, '');
      targetDir = path.join(DIST_DIR, cleanPath);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(path.join(targetDir, 'index.html'), fullHtml, 'utf8');

    searchIndex.push({
      title: page.title,
      url: `${BASE_PATH}${page.path}`,
      section: page.section,
      description: page.description,
    });
  });

  // 3. Збирання окремих сторінок новин
  const newsList = getNewsList();
  console.log(`📰 Генерація ${newsList.length} публікацій новин...`);

  newsList.forEach((news) => {
    const newsContentHtml = `
      <div class="news-article-meta">
        📅 <strong>Дата публікації:</strong> ${escapeAttr(news.date)} | ✍️ <strong>Автор:</strong> ${escapeAttr(news.author)}
      </div>
      <div class="news-article-cover">
        <img src="${escapeAttr(news.image)}" alt="${escapeAttr(news.title)}" style="width: 100%; max-height: 420px; object-fit: cover;" />
      </div>
      <div class="news-article-body">
        ${markdownToHtml(news.content)}
      </div>
      <div class="news-article-footer">
        <a href="/news/" class="section-link">← Повернутися до всіх новин</a>
        <a href="${escapeAttr(siteSettings.facebookUrl)}" target="_blank" rel="noopener noreferrer" class="section-link">Обговорити на Facebook →</a>
      </div>
    `;

    const fullHtml = renderFullPage({
      title: news.title,
      description: news.excerpt,
      contentHtml: newsContentHtml,
      currentUrl: `/news/${news.slug}/`,
      section: 'Медіацентр',
      isHomepage: false,
    });

    const newsTargetDir = path.join(DIST_DIR, 'news', news.slug);
    if (!fs.existsSync(newsTargetDir)) {
      fs.mkdirSync(newsTargetDir, { recursive: true });
    }
    fs.writeFileSync(path.join(newsTargetDir, 'index.html'), fullHtml, 'utf8');

    searchIndex.push({
      title: news.title,
      url: `${BASE_PATH}/news/${news.slug}/`,
      section: 'Новини ліцею',
      description: news.excerpt,
    });
  });

  // Додаємо документи з реєстру до пошукового індексу для зручного наскрізного пошуку
  documentsRegistry.forEach((doc) => {
    searchIndex.push({
      title: `📄 ${doc.title} (${doc.format})`,
      url: doc.pagePath ? `${BASE_PATH}${doc.pagePath}` : `${BASE_PATH}/transparency/`,
      section: `Документ ст. 30 ЗУ • ${doc.category}`,
      description: doc.description,
    });
  });

  // 4. Генерація search-index.json та 404.html (для GitHub Pages)
  fs.writeFileSync(path.join(DIST_DIR, 'search-index.json'), JSON.stringify(searchIndex, null, 2), 'utf8');

  const notFoundHtml = renderFullPage({
    title: '404 — Сторінку не знайдено',
    description: 'Запитувану сторінку не знайдено на офіційному сайті Новопільського ліцею.',
    contentHtml: `
      <div style="text-align: center; padding: 40px 10px;">
        <h2 style="font-size: 56px; margin-bottom: 10px;">404</h2>
        <p style="font-size: 18px; margin-bottom: 24px;">На жаль, запитувану сторінку не знайдено або її було переміщено.</p>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <a href="/" class="btn-primary">🏠 Повернутися на головну</a>
          <a href="/transparency/" class="btn-doc-download" style="padding: 12px 20px;">📜 Реєстр документів (ст. 30 ЗУ)</a>
        </div>
      </div>
    `,
    currentUrl: '/404.html',
    section: 'Головна',
    isHomepage: false,
  });
  fs.writeFileSync(path.join(DIST_DIR, '404.html'), notFoundHtml, 'utf8');

  // 5. Генерація sitemap.xml
  let sitemapXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemapXml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  pages.forEach((p) => {
    sitemapXml += `  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${p.path === '/' ? '1.0' : '0.8'}</priority>\n  </url>\n`;
  });
  newsList.forEach((n) => {
    sitemapXml += `  <url>\n    <loc>${SITE_URL}/news/${n.slug}/</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
  });
  sitemapXml += '</urlset>';
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');

  // 6. Генерація robots.txt
  const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt, 'utf8');

  console.log('✅ Генерація сайту успішно завершена! Всі статичні файли розміщено в папці /dist.');
}

if (require.main === module) {
  buildSite();
}

module.exports = { buildSite };

