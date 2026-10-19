/**
 * Новопільський ліцей — Основний клієнтський JavaScript
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // 1. Mobile Menu Toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const navMenu = document.getElementById('navMenu');

  if (mobileBtn && navMenu) {
    mobileBtn.addEventListener('click', function () {
      const isOpen = navMenu.classList.toggle('open');
      mobileBtn.setAttribute('aria-expanded', String(isOpen));
      mobileBtn.innerHTML = isOpen ? '✕' : '☰';
    });
  }

  // 2. Mobile Dropdown toggle & Keyboard navigation (WCAG 2.1)
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    const link = item.querySelector('.nav-link');
    const dropdown = item.querySelector('.dropdown-menu');
    if (dropdown && link) {
      link.addEventListener('click', function (e) {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          const opened = item.classList.toggle('dropdown-open');
          link.setAttribute('aria-expanded', String(opened));
        }
      });

      item.addEventListener('mouseenter', function () {
        if (window.innerWidth > 768) {
          link.setAttribute('aria-expanded', 'true');
        }
      });

      item.addEventListener('mouseleave', function () {
        if (window.innerWidth > 768) {
          link.setAttribute('aria-expanded', 'false');
        }
      });

      item.addEventListener('focusin', function () {
        if (window.innerWidth > 768) {
          link.setAttribute('aria-expanded', 'true');
        }
      });

      item.addEventListener('focusout', function (e) {
        if (window.innerWidth > 768 && !item.contains(e.relatedTarget)) {
          link.setAttribute('aria-expanded', 'false');
        }
      });
    }
  });

  // 3. Site-wide Search Modal (search-index.json)
  const searchModal = document.getElementById('siteSearchModal');
  const searchInput = document.getElementById('siteSearchInput');
  const searchResults = document.getElementById('siteSearchResults');
  const searchOpenBtns = document.querySelectorAll('[data-open-search]');
  const searchCloseBtn = document.getElementById('siteSearchCloseBtn');
  const searchBackdrop = document.querySelector('[data-close-search]');
  let searchIndexCache = null;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadSearchIndex() {
    if (searchIndexCache) return Promise.resolve(searchIndexCache);
    const basePath = document.documentElement.dataset.basePath || '';
    return fetch(basePath + '/search-index.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        searchIndexCache = Array.isArray(data) ? data : [];
        return searchIndexCache;
      })
      .catch(() => []);
  }

  function openSearchModal() {
    if (!searchModal) return;
    searchModal.hidden = false;
    loadSearchIndex();
    setTimeout(() => {
      if (searchInput) searchInput.focus();
    }, 30);
  }

  function closeSearchModal() {
    if (!searchModal) return;
    searchModal.hidden = true;
  }

  function renderSearchResults(query) {
    if (!searchResults) return;
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      searchResults.innerHTML =
        '<p class="search-modal-hint">Введіть ключове слово (наприклад: «1 клас», «розклад», «булінг», «статут», «харчування»)</p>';
      return;
    }

    loadSearchIndex().then((items) => {
      const matched = items.filter((item) => {
        const t = (item.title || '').toLowerCase();
        const d = (item.description || '').toLowerCase();
        const s = (item.section || '').toLowerCase();
        return t.includes(q) || d.includes(q) || s.includes(q);
      });

      if (!matched.length) {
        searchResults.innerHTML =
          '<p class="search-modal-hint">За вашим запитом нічого не знайдено. Спробуйте інше слово.</p>';
        return;
      }

      const html = matched
        .slice(0, 12)
        .map(
          (item) => `
          <a href="${escapeHtml(item.url)}" class="search-result-item">
            <div class="search-result-section">${escapeHtml(item.section)}</div>
            <div class="search-result-title">${escapeHtml(item.title)}</div>
            ${item.description ? `<div class="search-result-desc">${escapeHtml(item.description)}</div>` : ''}
          </a>
        `
        )
        .join('');

      searchResults.innerHTML = html;
    });
  }

  searchOpenBtns.forEach((btn) => {
    btn.addEventListener('click', openSearchModal);
  });
  if (searchCloseBtn) searchCloseBtn.addEventListener('click', closeSearchModal);
  if (searchBackdrop) searchBackdrop.addEventListener('click', closeSearchModal);
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      renderSearchResults(this.value);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (searchModal && !searchModal.hidden) {
        closeSearchModal();
      }
      navItems.forEach((item) => {
        item.classList.remove('dropdown-open');
        const link = item.querySelector('.nav-link');
        if (link && link.hasAttribute('aria-expanded')) {
          link.setAttribute('aria-expanded', 'false');
        }
      });
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (searchModal && searchModal.hidden) openSearchModal();
      else closeSearchModal();
    }
  });

  // 4. Document Registry Search and Category Filtering
  const docSearchInput = document.getElementById('docSearchInput');
  const docCategorySelect = document.getElementById('docCategorySelect');
  const docRows = document.querySelectorAll('.doc-row');
  const docCountBadge = document.getElementById('docCountBadge');

  function filterDocuments() {
    if (!docRows.length) return;

    const query = (docSearchInput ? docSearchInput.value : '').toLowerCase().trim();
    const category = docCategorySelect ? docCategorySelect.value : 'all';
    let visibleCount = 0;

    docRows.forEach((row) => {
      const title = (row.dataset.title || '').toLowerCase();
      const cat = row.dataset.category;
      const desc = (row.dataset.desc || '').toLowerCase();
      const format = (row.dataset.format || '').toLowerCase();

      const matchesQuery = !query || title.includes(query) || desc.includes(query) || format.includes(query);
      const matchesCategory = category === 'all' || cat === category;

      if (matchesQuery && matchesCategory) {
        row.style.display = '';
        visibleCount++;
      } else {
        row.style.display = 'none';
      }
    });

    if (docCountBadge) {
      docCountBadge.textContent = String(visibleCount);
    }

    const noResultsRow = document.getElementById('docNoResults');
    if (noResultsRow) {
      noResultsRow.style.display = visibleCount === 0 ? '' : 'none';
    }
  }

  if (docSearchInput) {
    docSearchInput.addEventListener('input', filterDocuments);
  }
  if (docCategorySelect) {
    docCategorySelect.addEventListener('change', filterDocuments);
  }

  // Helper to copy text to clipboard with visual feedback
  function setupCopyButton(btnId, getTextFn) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      const text = getTextFn();
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          const orig = btn.textContent;
          btn.textContent = '✓ Скопійовано в буфер!';
          setTimeout(() => {
            btn.textContent = orig;
          }, 2500);
        });
      }
    });
  }

  // 5. Contact / Feedback Form Handling (direct mailto + copy fallback)
  const contactForm = document.getElementById('schoolContactForm');
  let lastContactText = '';
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const recipient = contactForm.dataset.recipient || 'novopol4@ukr.net';
      const name = document.getElementById('contactName')?.value.trim() || '';
      const email = document.getElementById('contactEmail')?.value.trim() || '';
      const phone = document.getElementById('contactPhone')?.value.trim() || 'не вказано';
      const topic = document.getElementById('contactTopic')?.value.trim() || 'Звернення громадян';
      const message = document.getElementById('contactMessage')?.value.trim() || '';

      if (!name || !message) {
        alert('Будь ласка, заповніть ваше ім’я та текст звернення.');
        return;
      }

      const subject = `Електронне звернення громадян: ${topic} (${name})`;
      const body = [
        'Офіційне звернення через вебсайт Новопільського ліцею',
        '--------------------------------------------------',
        `ПІБ заявника: ${name}`,
        `E-mail для відповіді: ${email}`,
        `Контактний телефон: ${phone}`,
        `Тема звернення: ${topic}`,
        '',
        'Текст звернення:',
        message,
      ].join('\r\n');

      lastContactText = `Кому: ${recipient}\nТема: ${subject}\n\n${body}`;
      const mailtoHref = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      const fallbackLink = document.getElementById('contactMailtoFallback');
      if (fallbackLink) fallbackLink.href = mailtoHref;

      const alertBox = document.getElementById('formSuccessAlert');
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      window.location.href = mailtoHref;
    });

    setupCopyButton('contactCopyBtn', () => lastContactText);
  }

  // 6. Anti-bullying Reporting Form Handling (direct mailto + copy fallback)
  const bullyForm = document.getElementById('bullyReportForm');
  let lastBullyText = '';
  if (bullyForm) {
    bullyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const recipient = bullyForm.dataset.recipient || 'novopol4@ukr.net';
      const name = document.getElementById('bullyName')?.value.trim() || 'Анонімно';
      const role = document.getElementById('bullyRole')?.value.trim() || 'Учасник освітнього процесу';
      const place = document.getElementById('bullyClass')?.value.trim() || '';
      const desc = document.getElementById('bullyDetails')?.value.trim() || '';

      if (!desc) {
        alert('Будь ласка, надайте опис ситуації.');
        return;
      }

      const subject = `Конфіденційне повідомлення про булінг (${place || 'Новопільський ліцей'})`;
      const body = [
        'Конфіденційне повідомлення про випадок булінгу (цькування)',
        '----------------------------------------------------------',
        `Заявник: ${name}`,
        `Статус заявника: ${role}`,
        `Клас / місце події: ${place}`,
        '',
        'Опис ситуації:',
        desc,
      ].join('\r\n');

      lastBullyText = `Кому: ${recipient}\nТема: ${subject}\n\n${body}`;
      const mailtoHref = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      const fallbackLink = document.getElementById('bullyMailtoFallback');
      if (fallbackLink) fallbackLink.href = mailtoHref;

      const alertBox = document.getElementById('bullySuccessAlert');
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      window.location.href = mailtoHref;
    });

    setupCopyButton('bullyCopyBtn', () => lastBullyText);
  }
});
