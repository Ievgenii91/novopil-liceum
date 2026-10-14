---
trigger: model_decision
description: Repository structure and step-by-step recipes for the Novopil Lyceum site — where things live, naming conventions, and how to add a page, section, news item, announcement, document, widget, or change school contact details. Read when adding/moving files or changing navigation.
---

# Structure steering

## File map

```
.
├── AGENTS.md                      # Agent entry point (always loaded)
├── .agents/rules/                 # Steering docs (this folder)
├── .github/workflows/deploy.yml   # CI: build + deploy dist/ to GitHub Pages
├── content/                       # ← ALL site content (source of truth, edited by CMS)
│   ├── settings/site.json         # School requisites & contacts (flat JSON object)
│   ├── documents/registry.json    # Art. 30 documents registry (top-level JSON array)
│   ├── pages/*.md                 # One file per page; URL comes from frontmatter `path`
│   ├── news/YYYY-MM-DD-slug.md    # News; URL = /news/<filename-without-.md>/
│   └── announcements/*.md         # Homepage banner; first active one is shown
├── public/                        # Copied verbatim into dist/
│   ├── admin/index.html           # Decap CMS shell (loads decap-cms from unpkg)
│   ├── admin/config.yml           # Decap collections — mirror of content/ schema
│   ├── admin/editor/index.html    # Custom visual editor (uses /api/content/*)
│   └── assets/{css,js,images}/    # style.css, accessibility.css, main.js, accessibility.js, logo.svg, news-*.svg
├── src/
│   ├── build.js                   # SSG: parsers, nav structure, widgets, page template, sitemap
│   ├── server.js                  # Dev server + content API (local only)
│   └── templates/                 # Empty / unused
├── dist/                          # GENERATED — do not edit by hand (committed)
├── node.cmd                       # Windows wrapper for the bundled Node binary
├── package.json                   # Scripts only; no dependencies
└── README.md                      # Ukrainian project docs + full sitemap
```

## Where things are defined in `src/build.js`

| Concern | Symbol |
| :-- | :-- |
| Frontmatter parsing | `parseFrontmatter()` |
| Markdown → HTML | `markdownToHtml()` (also the widget-comment whitelist) |
| Top nav + dropdowns + sidebar source | `navigationStructure` constant |
| Header/footer/hero/a11y panel/page layout | `renderFullPage()` |
| Sidebar | `renderSidebarMenu()` |
| Data loaders | `getAllPages()`, `getNewsList()`, `getActiveAnnouncements()` |
| Widgets | `generateDocumentsRegistryHtml()`, `generateContactsHtml()`, `generateBullyingFormHtml()`, `NEWS_GRID` block in `buildSite()` |
| Output (pages, news, search index, sitemap, robots) | `buildSite()` |

## Naming conventions

- Page files: `<section-prefix>-<topic>.md` in kebab-case Latin — prefixes `about-`, `transparency-`, `education-`, `safety-`, `parents-`, `news-`; section landing pages are `<prefix>-overview.md`; homepage is `index.md`. The filename does **not** determine the URL — `path` does.
- URL paths: lowercase English kebab-case, leading **and** trailing slash: `/safety/anti-bullying/`.
- News files: `YYYY-MM-DD-<transliterated-ukrainian-slug>.md` (e.g. `2026-10-01-den-vchytelya.md`), matching Decap's `{{year}}-{{month}}-{{day}}-{{slug}}`. The filename becomes the public URL — don't rename published news.
- Announcement files: transliterated slug, e.g. `pryjom-do-1-klasu.md`.
- DOM ids: camelCase (`docSearchInput`); CSS classes: kebab-case (`doc-search-box`).

## Recipes

### Add a page to an existing section
1. Create `content/pages/<prefix>-<topic>.md` with frontmatter `title`, `path`, `section`, `description` (see content-authoring.md). `section` must be one of the 8 values in `public/admin/config.yml`.
2. Add `{ title, url }` to the right `children` array in `navigationStructure` (`src/build.js`) — otherwise the page is orphaned from menus/sidebar.
3. Link it from the section's `*-overview.md` if that page lists sub-pages.
4. Update the sitemap list in `README.md`.
5. Build; confirm `dist/<path>/index.html` exists and the menu shows it.

### Add a new top-level section
Everything in the previous recipe, plus: a new top-level item in `navigationStructure` (keep the «N. Назва» numbering), a new option in the `section` select in `config.yml`, an `<prefix>-overview.md` landing page, footer links in `renderFullPage()` if appropriate. Make sure the nav title **contains** the `section` string, or the sidebar won't render (see tech.md known bugs).

### Rename / move a page
Change `path`, update `navigationStructure`, every internal Markdown link (`grep` for the old path across `content/` and `src/`), `pagePath` in `registry.json`, README; delete the old `dist/<old-path>/` folder (build never deletes).

### Add a news item
Create `content/news/YYYY-MM-DD-slug.md` (frontmatter: `title`, `date`, `excerpt`, `author`, `tags`, `image`). It appears automatically on `/news/` (via `NEWS_GRID`), in the homepage top-3 (sorted by `date` desc), the search index, and the sitemap. No nav change.

### Add / retire an announcement
Create `content/announcements/<slug>.md` with `active: true`. Only the **first** active announcement (filesystem order) is shown on the homepage. To retire, set `active: false` rather than deleting (keeps history).

### Add a document to the transparency registry
Append an object to `content/documents/registry.json` with the next sequential `id` and fields `title`, `category`, `format` (`PDF`/`DOCX`/…; becomes `badge-<lowercase>` CSS class), `url`, `pagePath`, `description`. Reuse an existing `category` string exactly (it drives the filter dropdown). Update any hard-coded document counts in copy («28 документів» appears in README, server.js, config.yml labels) if the count changes. Restart the dev server to see it (file cached at load).

### Add a widget
See tech.md → Widgets. Insert the placeholder comment on its own line, surrounded by blank lines, in the target page's Markdown.

### Change school contacts / requisites
1. Update `content/settings/site.json`.
2. Search and update hardcoded copies: `src/build.js` (sidebar phone/email in `renderSidebarMenu`, hero text & address, topbar address, footer address, `generateContactsHtml` address, homepage stats «165»), `content/pages/*.md` (e.g. `contacts.md`, `about-administration.md`, announcements), and `README.md`.
3. Build and grep `dist/` for the old value to confirm zero leftovers.

### Add a Decap-editable field
Add it to the content files, the relevant collection in `public/admin/config.yml`, and the loader in `build.js` (`getAllPages`/`getNewsList`/…) with a sensible default. Remember the frontmatter parser limits (single-line values).
