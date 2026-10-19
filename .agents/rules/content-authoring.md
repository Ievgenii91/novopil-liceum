---
trigger: model_decision
description: Content authoring rules for files in content/ of the Novopil Lyceum site — exact frontmatter schemas for pages, news, announcements, registry and settings; the Markdown subset the custom converter supports; Ukrainian writing conventions; templates. Read before creating or editing anything in content/.
---

# Content authoring steering

All content is UTF-8 Markdown with frontmatter (or JSON). It is parsed by hand-written code, so **stick exactly to the formats below**.

## Frontmatter rules (all `.md` files)

- Starts on line 1 with `---`, ends with `---`, then the body.
- One `key: value` per line. **No multi-line values, no nested keys, no `- item` lists.**
- Always wrap string values in **double quotes**. Use «» for quotes inside text, never `"`.
- Arrays inline as JSON: `tags: ["Олімпіади", "Досягнення"]`.
- Booleans unquoted: `active: true`.
- Dates as ISO strings: `date: "2026-09-15"`.

## Schemas

### Page — `content/pages/<prefix>-<topic>.md`
```markdown
---
title: "Протидія булінгу (цькуванню)"
path: "/safety/anti-bullying/"
section: "Безпечне середовище"
description: "Одне-два речення для SEO (≈120–160 символів), українською."
---
## Перший підзаголовок
…
```
- `section` ∈ «Головна», «Про ліцей», «Прозорість та публічна інформація», «Освітній процес», «Безпечне середовище», «Батькам та учням», «Медіацентр», «Контакти».
- The template already renders `title` as the page `<h1>` — start the body at `##`. Don't repeat the title.
- A new page also needs a nav entry — see structure.md.

### News — `content/news/YYYY-MM-DD-slug.md`
```markdown
---
title: "Заголовок новини"
date: "2026-10-01"
excerpt: "Короткий анонс в одне-два речення для картки новини."
author: "Пресцентр Новопільського ліцею"
tags: ["Життя ліцею", "Події"]
image: "/assets/images/news-1.svg"
gallery: ["/assets/images/news/photo-1.jpg", "/assets/images/news/photo-2.jpg"]
---
Текст новини абзацами…
```
- Filename date must equal `date`. Slug = Latin transliteration of the topic (`den-vchytelya`, `pershyj-dzvinok`).
- The first tag is shown as the card badge — put the most meaningful one first.
- `image` must exist under `public/assets/` (or `public/assets/uploads/`). Defaults if omitted: first `gallery` photo or `news-1.svg`, author «Пресцентр Новопільського ліцею», tags `["Події"]`.
- `gallery` (optional): inline JSON array of image URLs (or YAML block list `- /assets/...` from Decap CMS). Rendered as a responsive uncropped photo gallery with lightbox at the bottom of the news article (or at `<!-- NEWS_GALLERY -->`).
- No children's full names or identifiable photos without consent.

### Announcement — `content/announcements/<slug>.md`
```markdown
---
title: "Коротко і по суті"
date: "2026-10-10"
active: true
priority: "Важливо"
---
Один абзац тексту з посиланням на детальну сторінку і телефоном для довідок.
```
- `priority` ∈ «Звичайна», «Важливо», «Терміново». Body should be one short paragraph (it is rendered inside a `<p>`).

### Documents registry — `content/documents/registry.json`
Top-level array of objects:
```json
{
  "id": 29,
  "title": "Офіційна назва документа",
  "category": "Існуюча категорія (скопіювати точно)",
  "format": "PDF",
  "url": "https://…",
  "pagePath": "/transparency/statute/",
  "description": "Одне речення: що це за документ."
}
```
Keep `id` sequential and unique. Only use URLs provided by the user or already in the repo. Validate JSON after editing (e.g. `.\node.cmd -e "JSON.parse(require('fs').readFileSync('content/documents/registry.json','utf8'))"`).

### Settings — `content/settings/site.json`
Flat object of school requisites. Don't rename keys (templates reference `schoolName`, `shortName`, `director`, `phone`, `email`, `edrpou`, `isuoId`, `koatuu`, `katottg`, `facebookUrl`). Changing a value here is not enough — see structure.md → «Change school contacts».

## Markdown you may use

| Want | Write |
| :-- | :-- |
| Section heading | `## …` / `### …` / `#### …` (no `#` — page already has h1) |
| Emphasis | `**жирний**`, `*курсив*` |
| Lists | `* пункт` or `- пункт`; `1. пункт` — flat only, one item per line |
| Table | GitHub pipe table with a `|---|` separator row (schedules, contacts, data) |
| Callout | `> [!NOTE]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` / `> [!CAUTION]` on its own line, followed by **exactly one** `> текст` line, then a blank line (extra `>` lines fall out of the callout as plain blockquotes) |
| Quote | `> один рядок` |
| Divider | `---` on its own line |
| Internal link | `[текст](/safety/civil-defense/)` — root-absolute, trailing slash |
| External link | `[текст](https://…)` — opens in new tab automatically |
| Image | raw HTML: `<img src="/assets/images/x.svg" alt="Опис українською" loading="lazy" />` |
| Widget | `<!-- DOCUMENTS_REGISTRY_TABLE -->`, `<!-- NEWS_GRID -->`, `<!-- BULLYING_REPORT_FORM -->`, `<!-- CONTACT_FORM_AND_MAP -->` — own line, blank lines around |

**Avoid:** `![alt](url)` (renders broken), fenced code blocks, nested/indented lists, `_underscores_` for emphasis, stray `*` characters in text, other HTML comments (they're stripped), `"` straight quotes in frontmatter.

Separate every block (paragraph, list, table, heading, callout) with a blank line. Single line breaks inside a paragraph become `<br />`.

## Writing conventions

- Ukrainian, official-friendly register; address parents as «Шановні батьки».
- Typography: «ялинки», `—` for dashes in sentences, `–` for ranges (`1–4 класи`, `08:30–09:15`), `№`, proper apostrophe.
- Academic year format: «2026/2027 навчальний рік». Grades: «1–4 класи», «5–11 класи».
- Phone format as in `site.json`: `+38 (067) 184-42-88`.
- Laws: «Закон України «Про освіту»», «ст. 30 ЗУ «Про освіту»».
- Prefer tables for schedules and structured data; callouts for safety-critical instructions (e.g. air-raid alert procedures).
- Unknown facts → `[УТОЧНИТИ: …]` placeholder + tell the user. Never guess.

## After editing content

1. `.\node.cmd src/build.js` — check the reported page/news counts.
2. Open the generated `dist/<path>/index.html` and confirm headings, lists, tables, links, and widgets rendered (no literal `**`, `|`, `[`, `!<a` left over).
3. If you renamed/removed a file, delete the stale folder in `dist/`.
