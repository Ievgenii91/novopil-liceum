---
trigger: model_decision
description: Product & domain context for the Novopil Lyceum website — audience, legal obligations (ст. 30 ЗУ «Про освіту»), tone of voice, factual accuracy, accessibility. Read before writing or editing any user-facing text or school facts.
---

# Product steering — Novopil Lyceum website

## What this is

The official website of **Новопільський ліцей Оліївської сільської ради Житомирського району Житомирської області** — a communal (municipal) general secondary school, grades 1–11 (I–III ступені), ~165 students, founded 1885, in the village of Новопіль.

It is a public-sector information site, not a marketing site. Its job is to:

1. **Satisfy legal transparency duties** — Article 30 of the Law of Ukraine «Про освіту» requires schools to publish specific documents and data (statute, license, capacity, catchment area, annual reports, finances, quality monitoring, paid services, etc.). The `/transparency/` section and `content/documents/registry.json` exist for this.
2. **Serve parents and students** — admission to 1st grade, schedules, electronic journal (NZ.UA), canteen, forms.
3. **Communicate safety** — anti-bullying procedures and report form, civil defense / shelter rules (wartime context), psychological service, inclusion.
4. **Publish news and urgent announcements.**

## Audience

- Parents (often on mobile, varying digital literacy, rural area) — the primary audience.
- Students, teachers, job applicants.
- Inspectors / founders (Оліївська сільська рада, education authorities) checking legal compliance.
- People with visual impairments — the site has a mandatory accessibility panel.

## Tone of voice & language

- **Ukrainian only** (державна мова). Formal-but-warm official style, as used by Ukrainian schools: «Шановні батьки!», «здобувачі освіти», «ліцеїсти».
- Use correct Ukrainian typography: «ялинки» quotes, en/em dashes (`–`, `—`), apostrophe `'` in words like «пам'ятка», `№`.
- Prefer official terminology: «здобувачі освіти» (students), «заклад освіти», «освітній процес», «НУШ», «ВСЗЯО», «ООП», «ІПР».
- Cite laws precisely: «ЗУ «Про освіту»», «ЗУ «Про звернення громадян»», «ст. 30». Do not paraphrase law names.
- Clear and scannable: short paragraphs, headings, bullet lists, tables for schedules/data.
- Emojis are used sparingly as visual markers in UI chrome (📞 ✉️ 📍 🛡️); don't add them to body text of legal pages.

## Factual accuracy — highest priority

This is an official government-adjacent publication. Wrong data has real consequences (parents calling wrong numbers, compliance failures).

- **Never fabricate** requisites, people's names, phone numbers, emails, addresses, dates, counts, document links, or legal references.
- Canonical school facts are in `content/settings/site.json` (name, ЄДРПОУ `06671161`, ІСУО ID `16060`, КОАТУУ, КАТОТТГ, director, phone, email, address, student count, Facebook, NZ.UA). Reuse them verbatim.
- Official document links in `registry.json` point to the founder's site (`rada.info`). Don't replace or "guess" URLs.
- If the user asks for content you don't have data for (e.g. teacher list, schedule), draft structure with clearly marked placeholders such as `[УТОЧНИТИ: ПІБ вчителя]` and tell the user what's missing.
- Dates: the academic year runs Sept–June (e.g. «2026/2027 навчальний рік»).

## Privacy & safety

- Don't publish personal data of children (full names + class, photos without consent, health info). Teachers/administration names are fine when already public in the repo.
- The contact and anti-bullying forms are **front-end only** (no backend; `main.js` just shows a success message). Don't claim in copy that data is stored/sent unless a real backend is added; if you add one, it must handle anonymity for bullying reports.

## Accessibility (legal requirement)

Standard: **WCAG 2.1 / ДСТУ ISO/IEC 40500:2015**. The a11y panel (`public/assets/js/accessibility.js`, `public/assets/css/accessibility.css`) offers font sizes, 3 high-contrast themes, spacing, dyslexia font, grayscale/hidden images, and text-to-speech; settings persist in `localStorage` (`novopil_a11y_settings`).

When changing UI:
- Every image needs meaningful Ukrainian `alt` text; every form control a `<label for>`.
- Don't convey meaning by color alone; keep contrast ≥ 4.5:1.
- New colors/components must also look correct under `theme-bw`, `theme-wb`, `theme-by` and `font-lg`/`font-xl` classes on `<html>`.
- Keep `lang="uk"`, semantic landmarks (`header`, `nav`, `main`, `footer`, `aside`), and keyboard operability.

## Site map (sections)

| Section (frontmatter `section`) | URL prefix | Purpose |
| :-- | :-- | :-- |
| Головна | `/` | Hero, quick links, stats, announcements, latest 3 news |
| Про ліцей | `/about/` | Administration, history, management, teachers, infrastructure, vacancies |
| Прозорість та публічна інформація | `/transparency/` | Art. 30 documents registry + statute, capacity, catchment, reports, monitoring, finance, extra services |
| Освітній процес | `/education/` | Programs, evaluation, schedule, NUSH, distance learning, language |
| Безпечне середовище | `/safety/` | Anti-bullying (+form), civil defense, inclusion, code of conduct, psychology |
| Батькам та учням | `/parents-students/` | 1st-grade admission, forms, NZ.UA, canteen, student council |
| Медіацентр | `/news/` | News feed, gallery, individual articles `/news/<slug>/` |
| Контакти | `/contacts/` | Requisites, contact form + map |

The `README.md` (in Ukrainian) contains the full annotated sitemap and must be updated when sections/pages change.
