---
trigger: model_decision
description: Technical steering for the Novopil Lyceum site — zero-dependency Node.js SSG (src/build.js), dev server + CMS API (src/server.js), custom Markdown/frontmatter parsers and their quirks, Decap CMS, CI/deploy, known bugs. Read before changing code in src/ or public/assets/.
---

# Tech steering

## Stack

| Layer | Tech |
| :-- | :-- |
| Generator | `src/build.js` — plain Node.js (CommonJS, `require`), **no dependencies**. Exports `buildSite()`. |
| Dev server | `src/server.js` — `http` module; builds on start, serves `dist/`, exposes content API |
| Templates | Inline JS template literals inside `build.js` (`src/templates/` exists but is empty/unused) |
| Styles | `public/assets/css/style.css` (design tokens in `:root`), `accessibility.css` |
| Client JS | Vanilla ES2015+, no modules: `main.js` (menu, registry filter, forms), `accessibility.js` (IIFE) |
| CMS | Decap CMS 3 from unpkg (`public/admin/index.html` + `config.yml`), and a custom editor at `public/admin/editor/index.html` |
| CI/CD | GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`, Node 20) |
| Runtime locally | `.\node.cmd` → Antigravity-bundled Node (v24). Target compatibility: **Node 20**. |

## Hard constraints

- **No npm packages, ever.** No `package-lock.json`, no build tools, no TypeScript, no frameworks. If a feature seems to need a library, implement a small focused version with built-ins or ask the user.
- Keep CommonJS (`require` / `module.exports`). Keep `build.js` runnable both directly (`require.main === module`) and via `require('./build')` from the server.
- Client JS must work without a bundler: plain `<script>` tags, `'use strict'`, guard every DOM lookup (`if (el) …`) because the same `main.js` runs on every page.
- Code style: 2-space indent, single quotes, semicolons, arrow functions in callbacks, Ukrainian comments.

## Build pipeline (`buildSite()`)

1. `content/settings/site.json` and `content/documents/registry.json` are read **once at module load**, not per build. When the dev server rebuilds after a save, edits to these two files are **not** picked up until the server restarts (Markdown files are re-read every build).
2. `copyDirSync(public → dist)` — overwrites, **never deletes**.
3. For each `content/pages/*.md`: `parseFrontmatter` → `markdownToHtml` → replace widget placeholders → `renderFullPage` → `dist/<path>/index.html`. `path: "/"` → homepage (hero, stats, announcements, latest 3 news).
4. For each `content/news/*.md`: render to `dist/news/<file-slug>/index.html`.
5. Write `dist/search-index.json`, `dist/sitemap.xml` (domain hardcoded `https://novopil-lyceum.zt.ua`), `dist/robots.txt`.

## Custom frontmatter parser — limits

`parseFrontmatter()` is line-based, **not YAML**:
- Only `key: value` on a single line. No multi-line strings (`>`/`|`), no nested objects, no block lists (`- item`).
- Quoted values are unquoted; `true`/`false` become booleans; `[...]` is parsed as JSON (single quotes converted) with a comma-split fallback.
- Everything else stays a string (dates included). News sorting is a **string compare** on `date`, so use ISO `YYYY-MM-DD`.
- ⚠️ Decap CMS writes real YAML (block lists for `tags`, possibly folded multi-line `excerpt`, ISO datetimes). Entries saved via Decap can silently lose tags/excerpt. If you touch this, prefer making the parser tolerant over changing content format.

## Custom Markdown converter — supported subset & quirks

`markdownToHtml()` is a sequence of regex replacements. Order matters. Supported: `#`–`####` headings, `---` (→ `<hr class="section-divider">`), `***bold-italic***`, `**bold**`, `*italic*`, GitHub alerts `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]` (→ `.callout`), `>` blockquotes (single line), pipe tables (→ `.data-table` in `.table-responsive`), links (external get `target="_blank" rel="noopener noreferrer"`), inline code, flat `-`/`*` lists, flat `1.` lists, paragraphs (blank-line separated; single newlines → `<br />`).

Known quirks (don't "rely on" them, don't break other content when fixing):
- **`![alt](url)` with non-empty alt is broken** — the link regex runs first and produces `!<a href…>`. Use raw `<img src="…" alt="…" loading="lazy" />` HTML instead.
- No fenced code blocks, no nested lists, no `_underscore_` emphasis, no headings `#####`+.
- GitHub alerts capture only **one** body line (the regex uses the multiline `$`), so multi-line callouts split into a callout + plain blockquotes.
- HTML comments are stripped **except** the four widget placeholders (see below).
- Raw HTML passes through; blocks starting with `<div`, `<h`, `<ul`, `<ol`, `<blockquote`, `<hr`, `<!--` are not wrapped in `<p>`.
- `*` inside URLs or text can be misread as emphasis.
- No HTML escaping anywhere: frontmatter values are interpolated raw into `<title>`, `content="…"`, `alt="…"`, `data-*` attributes. A `"` in a title/description breaks the attribute. Prefer «» quotes in content; if you add escaping, add one `escapeHtml()` helper and apply it to attribute contexts.

If you change the converter, rebuild and diff several representative pages in `dist/` (tables: `education-schedule`, alerts/lists: `safety-civil-defense`, widgets: `transparency-overview`, `contacts`, `safety-anti-bullying`, `news-overview`).

## Widgets (placeholders in Markdown)

| Placeholder | Generator in `build.js` | Client behavior (`main.js`) |
| :-- | :-- | :-- |
| `<!-- DOCUMENTS_REGISTRY_TABLE -->` | `generateDocumentsRegistryHtml()` from `registry.json` | Live search `#docSearchInput` + category `#docCategorySelect` |
| `<!-- NEWS_GRID -->` | inline in `buildSite()` from `getNewsList()` | — |
| `<!-- BULLYING_REPORT_FORM -->` | `generateBullyingFormHtml()` | `#bullyReportForm` → shows success alert only |
| `<!-- CONTACT_FORM_AND_MAP -->` | `generateContactsHtml()` (OSM iframe) | `#schoolContactForm` → shows success alert only |

Adding a widget = (1) generator function, (2) add the name to the comment-preserving whitelist at the top of `markdownToHtml()`, (3) replacement in `buildSite()`, (4) optional client logic in `main.js` guarded by element existence.

## Dev server & content API (`src/server.js`)

- `GET /api/content/list` — grouped file list for the visual editor (groups and the two settings files are hardcoded).
- `GET /api/content/read?file=<rel>` / `POST /api/content/save {file, content}` — paths are relative to `content/`, guarded with `startsWith(CONTENT_DIR)`. Save writes the file, calls `buildSite()`, then tries `git add` + `git commit -m "CMS: оновлено <file>"` (failures ignored).
- Static files from `dist/` with directory → `index.html` resolution; inline Ukrainian 404 page.
- Local-only tool: no auth. Never expose it publicly; don't weaken the path guard.

## Design system

Use CSS variables from `:root` in `style.css` (`--primary #0f3b6c`, `--accent #f59e0b`, `--text-muted`, `--border-color`, `--border-radius`, `--shadow-*`, `--container-width 1220px`). `build.js` contains many inline `style="…"` attributes with literal hex values — for new work prefer classes in `style.css` over more inline styles. Mobile breakpoint: `768px` (also hardcoded in `main.js`).

## Deployment caveats (flag, don't silently change)

- Decap `backend.repo` is `Ievgenii91/novopil-liceum`; GitHub Pages for that repo would serve under `/novopil-liceum/` unless a custom domain is configured, but all site links are root-absolute (`/assets/…`) and there is no `CNAME` in `public/`. The sitemap assumes `novopil-lyceum.zt.ua`.
- `dist/` is committed (the ignore rule is commented out in `.gitignore`) even though CI rebuilds it.
- Decap uploads go to `public/assets/uploads` (folder doesn't exist yet).

## Resolved bugs & enhancements

- **Sidebar restored across all sub-pages**: `renderSidebarMenu()` now matches by URL prefix and section aliases.
- **Image Markdown parser fixed**: `![alt](url)` is parsed before regular links, so alt text no longer breaks into corrupted HTML.
- **Decap YAML & registry format compatibility**: `parseFrontmatter()` now handles Decap YAML output (block lists, folded strings), and `registry.json` is supported both as a top-level array and `{ items: [...] }`.
- **Dynamic site settings**: Homepage `stats`, `quickLinks`, address, phone, and email now read dynamically from `content/settings/site.json` with fallback defaults.
- **GitHub Pages path adaptation**: Added support for `BASE_PATH` and `SITE_URL` environment variables, automatically hooked in `.github/workflows/deploy.yml` with `actions/configure-pages`.
- **Clickable breadcrumbs**: Section names in page breadcrumbs now link directly to the respective section overview page.
