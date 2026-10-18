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
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Горизонтальні лінії
  html = html.replace(/^---$/gim, '<hr class="section-divider" />');

  // Жирний та курсив
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // GitHub Alerts / Callouts
  html = html.replace(/> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\r?\n([\s\S]*?)(?=\n\n|$)/gim, (m, type, text) => {
    const alertType = type.toLowerCase();
    const cleanText = text.replace(/^> ?/gm, '').trim();
    let badge = 'Зверніть увагу';
    if (type === 'WARNING' || type === 'CAUTION') badge = 'Важливо';
    if (type === 'TIP') badge = 'Корисна порада';
    return `<div class="callout callout-${alertType}"><strong>${badge}:</strong> ${cleanText}</div>`;
  });

  // Звичайні цитати >
  html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

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
    return tHtml;
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

  // Списки - або *
  html = html.replace(/(?:^[*-] .+(?:\r?\n|$))+/gm, (listMatch) => {
    const items = listMatch.trim().split(/\r?\n/).map((line) => {
      return `<li>${line.replace(/^[*-] /, '').trim()}</li>`;
    });
    return `<ul>${items.join('')}</ul>`;
  });

  // Нумеровані списки 1.
  html = html.replace(/(?:^\d+\. .+(?:\r?\n|$))+/gm, (listMatch) => {
    const items = listMatch.trim().split(/\r?\n/).map((line) => {
      return `<li>${line.replace(/^\d+\. /, '').trim()}</li>`;
    });
    return `<ol>${items.join('')}</ol>`;
  });

  // Параграфи
  const paragraphs = html.split(/\r?\n\r?\n/);
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
    .join('\n');

  return html;
}

// Генерація таблиці 28 документів з фільтрами
function generateDocumentsRegistryHtml() {
  const categories = Array.from(new Set(documentsRegistry.map((d) => d.category)));

  let selectOptions = '<option value="all">Усі категорії документів (' + documentsRegistry.length + ')</option>';
  categories.forEach((cat) => {
    const count = documentsRegistry.filter((d) => d.category === cat).length;
    selectOptions += `<option value="${cat}">${cat} (${count})</option>`;
  });

  let rowsHtml = '';
  documentsRegistry.forEach((doc) => {
    const fmt = doc.format.toLowerCase();
    rowsHtml += `
      <tr class="doc-row" data-category="${doc.category}" data-title="${doc.title}" data-desc="${doc.description}" data-format="${doc.format}">
        <td style="width: 45px; text-align: center; font-weight: bold; color: #64748b;">${doc.id}</td>
        <td>
          <div style="font-weight: 700; color: #0f3b6c; font-size: 15px; margin-bottom: 4px;">
            <a href="${doc.url}" target="_blank" rel="noopener noreferrer">${doc.title}</a>
          </div>
          <div style="font-size: 13px; color: #64748b; line-height: 1.4;">${doc.description}</div>
        </td>
        <td style="font-size: 13px; color: #475569;">
          <span style="display: inline-block; background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-weight: 500;">
            ${doc.category}
          </span>
        </td>
        <td style="text-align: center;">
          <span class="format-badge badge-${fmt}">${doc.format}</span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <a href="${doc.url}" target="_blank" rel="noopener noreferrer" class="btn-doc-download">
            📥 Відкрити
          </a>
        </td>
      </tr>
    `;
  });

  return `
    <div class="doc-search-box">
      <div class="doc-input-wrapper">
        <span class="doc-search-icon">🔍</span>
        <input type="text" id="docSearchInput" class="doc-input" placeholder="Швидкий пошук документів за назвою або ключовими словами..." />
      </div>
      <select id="docCategorySelect" class="doc-filter-select">
        ${selectOptions}
      </select>
    </div>
    <div style="font-size: 13.5px; color: #64748b; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
      <span>Знайдено документів: <strong id="docCountBadge" style="color: #0f3b6c;">${documentsRegistry.length}</strong></span>
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
            <td colspan="5" style="text-align: center; padding: 30px; color: #64748b;">
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
  return `
    <div class="contacts-grid">
      <!-- Форма звернення -->
      <div style="background: #ffffff; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0; color: #0f3b6c; font-size: 19px; margin-bottom: 12px;">Електронне звернення громадян</h3>
        <p style="font-size: 13.5px; color: #64748b; margin-bottom: 18px;">
          Відповідно до Закону України «Про звернення громадян», ви можете надіслати електронний запит до дирекції ліцею.
        </p>

        <div id="formSuccessAlert" style="display: none; background: #ecfdf5; border: 1px solid #10b981; color: #065f46; padding: 14px; border-radius: 8px; margin-bottom: 16px; font-size: 14px;">
          ✓ Ваше звернення успішно надіслано до адміністрації Новопільського ліцею. Відповідь буде надано у встановлений законом термін.
        </div>

        <form id="schoolContactForm">
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
              <option value="admission">Вступ до 1-го класу / зарахування</option>
              <option value="learning">Організація освітнього процесу</option>
              <option value="nutrition">Харчування здобувачів освіти</option>
              <option value="general">Загальні питання та пропозиції</option>
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
      <div style="background: #ffffff; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; flex-direction: column;">
        <h3 style="margin-top: 0; color: #0f3b6c; font-size: 19px; margin-bottom: 12px;">Розташування та безпечний підхід</h3>
        <p style="font-size: 13.5px; color: #64748b; margin-bottom: 16px;">
          Адреса: ${siteSettings.address || 'вул. Миру, 12, с. Новопіль, Житомирський район, Житомирська область, Україна, 12333'}.
        </p>
        <div style="flex-grow: 1; min-height: 280px; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; position: relative;">
          <iframe 
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
        <div style="margin-top: 14px; font-size: 13px; color: #475569; background: #eff6ff; padding: 10px 14px; border-radius: 6px;">
          📍 <strong>Орієнтир:</strong> Центр села Новопіль, поруч із центральною зупинкою та парковою зоною. Під'їзні шляхи асфальтовані, облаштовано безпечний пішохідний перехід.
        </div>
      </div>
    </div>
  `;
}

// Генерація форми повідомлення про булінг
function generateBullyingFormHtml() {
  return `
    <div style="background: #fff1f2; border: 2px solid #fecdd3; border-radius: 12px; padding: 25px; margin: 30px 0;">
      <h3 style="margin-top: 0; color: #9f1239; font-size: 20px; display: flex; align-items: center; gap: 8px;">
        🛡️ Форма конфіденційного повідомлення про булінг (цькування)
      </h3>
      <p style="font-size: 14px; color: #881337; margin-bottom: 18px;">
        Якщо ви стали свідком або потерпілим від булінгу в ліцеї, ви можете повідомити про це адміністрацію. Ви маєте право залишитися анонімним.
      </p>

      <div id="bullySuccessAlert" style="display: none; background: #ecfdf5; border: 1px solid #10b981; color: #065f46; padding: 14px; border-radius: 8px; margin-bottom: 16px; font-size: 14px;">
        ✓ Ваше повідомлення зареєстровано та передано дирекції ліцею і психологічній службі для невідкладного реагування. Дякуємо за вашу небайдужість!
      </div>

      <form id="bullyReportForm">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label class="form-label" for="bullyName">Ваше ім'я (за бажанням, можна залишити порожнім)</label>
            <input type="text" id="bullyName" class="form-control" placeholder="Анонімно або вкажіть ім'я" />
          </div>
          <div class="form-group">
            <label class="form-label" for="bullyRole">Хто ви?</label>
            <select id="bullyRole" class="form-control">
              <option value="student">Учень / учениця ліцею</option>
              <option value="parent">Батько / мати / опікун</option>
              <option value="teacher">Вчитель / працівник ліцею</option>
              <option value="witness">Свідок ситуації</option>
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
        <button type="submit" class="btn-submit" style="background: #e11d48;">
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
    return {
      slug,
      title: data.title || 'Новина ліцею',
      date: data.date || '',
      excerpt: data.excerpt || '',
      author: data.author || 'Пресцентр Новопільського ліцею',
      tags: data.tags || ['Події'],
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

      let linkHtml = `<a href="${item.url}" class="nav-link">${item.title}`;
      if (hasChildren) {
        linkHtml += ` <span class="arrow">▼</span>`;
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
      <h3 class="sidebar-title">${sectionObj.title}</h3>
      <ul class="sidebar-nav">
        ${listHtml}
      </ul>
      <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 13px;">
        <p style="color: #64748b; margin-bottom: 8px;"><strong>Потрібна консультація?</strong></p>
        <p style="color: #0f3b6c; font-weight: 700;">${phone}</p>
        <p style="color: #64748b;">${email}</p>
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
          <h1 class="hero-title">${siteSettings.schoolName}</h1>
          <p class="hero-desc">
            Освітній простір успіху, безпеки та розвитку дитини. Зберігаємо понад 140-річні традиції школи з 1885 року та впроваджуємо сучасні технології Нової української школи для 165 ліцеїстів.
          </p>
          <div class="hero-actions">
            <a href="/parents-students/admission-1st-grade/" class="btn-primary">
              🎒 Прийом до 1 класу
            </a>
            <a href="https://nz.ua/" target="_blank" rel="noopener noreferrer" class="btn-secondary">
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
              <div class="director-avatar">👩‍🏫</div>
              <div class="director-info">
                <h4>${siteSettings.director}</h4>
                <p>Директор Новопільського ліцею</p>
              </div>
            </div>
            <p class="hero-quote">
              «Ми прагнемо створити в ліцеї атмосферу захищеності, підтримки та натхнення, де кожна дитина відчуває себе особистістю, знаходить друзів та розкриває свої унікальні здібності.»
            </p>
            <div style="font-size: 13.5px; color: #475569; display: flex; flex-direction: column; gap: 6px;">
              <div>📞 <strong>Телефон:</strong> ${siteSettings.phone}</div>
              <div>✉️ <strong>E-mail:</strong> ${siteSettings.email}</div>
              <div>📍 <strong>Адреса:</strong> ${siteSettings.address || 'вул. Миру, 12, с. Новопіль'}</div>
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
            <a href="${ql.url}"${ext} class="quick-card">
              <div class="quick-icon">${icon}</div>
              <div><h3>${ql.title}</h3></div>
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
            <div class="stat-num">${st.value}</div>
            <div class="stat-label">${st.label}</div>
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
        <div class="announcement-banner">
          <div class="announcement-icon">📢</div>
          <div class="announcement-content">
            <h4>${ann.title}</h4>
            <p>${markdownToHtml(ann.content)}</p>
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
            <img src="${n.image}" alt="${n.title}" />
            <span class="news-tag">${n.tags[0] || 'Подія'}</span>
          </div>
          <div class="news-body">
            <div class="news-date">📅 ${n.date} • ${n.author}</div>
            <h3 class="news-title">${n.title}</h3>
            <p class="news-desc">${n.excerpt}</p>
            <a href="/news/${n.slug}/" class="section-link" style="margin-top: auto;">
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

  const rawHtml = `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} | Новопільський ліцей Оліївської сільської ради</title>
  <meta name="description" content="${description || siteSettings.schoolName}" />
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
        <button class="a11y-btn" data-a11y-action="fontsize" data-a11y-value="font-md" title="Звичайний розмір шрифту">A</button>
        <button class="a11y-btn" data-a11y-action="fontsize" data-a11y-value="font-lg" title="Збільшений шрифт">A+</button>
        <button class="a11y-btn" data-a11y-action="fontsize" data-a11y-value="font-xl" title="Дуже великий шрифт">A++</button>
      </div>

      <div class="a11y-group">
        <span class="a11y-label">Контрастність:</span>
        <button class="a11y-btn" data-a11y-action="theme" data-a11y-value="theme-normal" title="Звичайна колірна схема">Стандарт</button>
        <button class="a11y-btn" data-a11y-action="theme" data-a11y-value="theme-bw" title="Чорно-білий контраст">Ч/Б</button>
        <button class="a11y-btn" data-a11y-action="theme" data-a11y-value="theme-wb" title="Темний високий контраст">Інверсія</button>
        <button class="a11y-btn" data-a11y-action="theme" data-a11y-value="theme-by" title="Синій на жовтому фоні">Синьо-жовтий</button>
      </div>

      <div class="a11y-group">
        <span class="a11y-label">Додатково:</span>
        <button class="a11y-btn" data-a11y-action="spacing" title="Збільшити міжрядковий інтервал">Інтервал</button>
        <button class="a11y-btn" data-a11y-action="dyslexic" title="Шрифт для людей з дислексією">Шрифт НУШ</button>
        <button class="a11y-btn" data-a11y-action="images" data-a11y-value="grayscale" title="Чорно-білі фотографії">Ч/Б фото</button>
        <button class="a11y-btn" data-a11y-action="images" data-a11y-value="hide" title="Приховати зображення">Без фото</button>
        <button class="a11y-btn" data-a11y-action="speech" title="Озвучити текст сторінки">🔊 Читати голос</button>
        <button class="a11y-btn" data-a11y-action="reset" title="Скинути до стандартних налаштувань">Скинути</button>
      </div>

      <div>
        <button id="a11yCloseBtn" class="a11y-btn-close">✕ Закрити</button>
      </div>
    </div>
  </div>

  <!-- TOP CONTACT BAR -->
  <div class="topbar">
    <div class="container">
      <div class="topbar-contacts">
        <a href="tel:${siteSettings.phone.replace(/[^0-9+]/g, '')}">
          📞 ${siteSettings.phone}
        </a>
        <a href="mailto:${siteSettings.email}">
          ✉️ ${siteSettings.email}
        </a>
        <span>📍 ${siteSettings.address || 'с. Новопіль, вул. Миру, 12'}</span>
      </div>
      <div class="topbar-actions">
        <button id="a11yToggleBtn" class="btn-accessibility" title="Налаштування сайту для людей з порушенням зору">
          👁️ Людям з порушенням зору
        </button>
        <a href="https://nz.ua/" target="_blank" rel="noopener noreferrer" class="btn-journal-link">
          📖 NZ.UA Щоденник
        </a>
        <a href="${siteSettings.facebookUrl}" target="_blank" rel="noopener noreferrer" style="color: #cbd5e1;" title="Facebook ліцею">
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
          <h1>${siteSettings.shortName}</h1>
          <p>Оліївської сільської ради Житомирського району</p>
        </div>
      </a>

      <button id="mobileMenuBtn" class="mobile-menu-btn" aria-label="Відкрити головне меню">
        ☰
      </button>

      <nav>
        <ul id="navMenu" class="nav-menu">
          ${navHtml}
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
            <div class="breadcrumbs">
              <a href="/">Головна</a>
              <span>/</span>
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
              <span>/</span>
              <span>${escapeAttr(title)}</span>
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
          <h3>${siteSettings.shortName}</h3>
          <p>
            Комунальний заклад загальної середньої освіти I–III ступенів Оліївської сільської ради Житомирського району Житомирської області.
          </p>
          <div style="font-size: 13px; line-height: 1.5; color: #cbd5e1;">
            <div>• Код ЄДРПОУ: <strong>${siteSettings.edrpou}</strong></div>
            <div>• ID закладу в ІСУО: <strong>${siteSettings.isuoId}</strong></div>
            <div>• КОАТУУ: <strong>${siteSettings.koatuu}</strong></div>
            <div>• КАТОТТГ: <strong>${siteSettings.katottg}</strong></div>
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
            <li><a href="https://nz.ua/" target="_blank" rel="noopener noreferrer">Електронний щоденник NZ.UA</a></li>
            <li><a href="/safety/civil-defense/">Укриття ліцею</a></li>
            <li><a href="/safety/anti-bullying/">Протидія булінгу</a></li>
            <li><a href="/transparency/statute/">Статутні документи</a></li>
            <li><a href="/transparency/annual-reports/">Звіти директора</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Контакти ліцею</h4>
          <ul class="footer-contacts">
            <li>📍 ${siteSettings.address || '12333, Житомирська обл., Житомирський р-н, с. Новопіль, вул. Миру, 12'}</li>
            <li>📞 <a href="tel:${siteSettings.phone.replace(/[^0-9+]/g, '')}">${siteSettings.phone}</a></li>
            <li>✉️ <a href="mailto:${siteSettings.email}">${siteSettings.email}</a></li>
            <li>👤 Директор: ${siteSettings.director}</li>
            <li>🌐 <a href="${siteSettings.facebookUrl}" target="_blank" rel="noopener noreferrer">Facebook-сторінка</a></li>
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
              <img src="${n.image}" alt="${n.title}" />
              <span class="news-tag">${n.tags[0] || 'Подія'}</span>
            </div>
            <div class="news-body">
              <div class="news-date">📅 ${n.date} • ${n.author}</div>
              <h3 class="news-title">${n.title}</h3>
              <p class="news-desc">${n.excerpt}</p>
              <a href="/news/${n.slug}/" class="section-link" style="margin-top: auto;">
                Читати повністю →
              </a>
            </div>
          </article>
        `;
      });
      parsedBody = parsedBody.replace('<!-- NEWS_GRID -->', `<div class="cards-grid">${cards}</div>`);
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
      url: page.path,
      section: page.section,
      description: page.description,
    });
  });

  // 3. Збирання окремих сторінок новин
  const newsList = getNewsList();
  console.log(`📰 Генерація ${newsList.length} публікацій новин...`);

  newsList.forEach((news) => {
    const newsContentHtml = `
      <div style="font-size: 14px; color: #64748b; margin-bottom: 20px;">
        📅 <strong>Дата публікації:</strong> ${news.date} | ✍️ <strong>Автор:</strong> ${news.author}
      </div>
      <div style="margin-bottom: 25px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
        <img src="${news.image}" alt="${news.title}" style="width: 100%; max-height: 420px; object-fit: cover;" />
      </div>
      <div style="font-size: 17px; line-height: 1.8;">
        ${markdownToHtml(news.content)}
      </div>
      <div style="margin-top: 35px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
        <a href="/news/" class="section-link">← Повернутися до всіх новин</a>
        <a href="${siteSettings.facebookUrl}" target="_blank" rel="noopener noreferrer" class="section-link">Обговорити на Facebook →</a>
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
      url: `/news/${news.slug}/`,
      section: 'Новини ліцею',
      description: news.excerpt,
    });
  });

  // 4. Генерація search-index.json
  fs.writeFileSync(path.join(DIST_DIR, 'search-index.json'), JSON.stringify(searchIndex, null, 2), 'utf8');

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
