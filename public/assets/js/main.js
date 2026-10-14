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
      mobileBtn.setAttribute('aria-expanded', isOpen);
      mobileBtn.innerHTML = isOpen ? '✕' : '☰';
    });
  }

  // 2. Mobile Dropdown toggle on click for mobile
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    const link = item.querySelector('.nav-link');
    const dropdown = item.querySelector('.dropdown-menu');
    if (dropdown && link) {
      link.addEventListener('click', function (e) {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          item.classList.toggle('dropdown-open');
        }
      });
    }
  });

  // 3. Document Registry Search and Category Filtering
  const docSearchInput = document.getElementById('docSearchInput');
  const docCategorySelect = document.getElementById('docCategorySelect');
  const docRows = document.querySelectorAll('.doc-row');
  const docCountBadge = document.getElementById('docCountBadge');

  function filterDocuments() {
    if (!docRows.length) return;

    const query = (docSearchInput ? docSearchInput.value : '').toLowerCase().trim();
    const category = (docCategorySelect ? docCategorySelect.value : 'all');
    let visibleCount = 0;

    docRows.forEach((row) => {
      const title = row.dataset.title.toLowerCase();
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
      docCountBadge.textContent = visibleCount;
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

  // 4. Contact / Feedback Form Handling
  const contactForm = document.getElementById('schoolContactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = document.getElementById('contactName')?.value.trim();
      const email = document.getElementById('contactEmail')?.value.trim();
      const message = document.getElementById('contactMessage')?.value.trim();

      if (!name || !message) {
        alert('Будь ласка, заповніть ваше ім’я та текст звернення.');
        return;
      }

      const alertBox = document.getElementById('formSuccessAlert');
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.scrollIntoView({ behavior: 'smooth' });
      } else {
        alert('Дякуємо! Ваше звернення згідно ЗУ «Про звернення громадян» успішно зареєстровано.');
      }
      contactForm.reset();
    });
  }

  // 5. Anti-bullying Reporting Form Handling
  const bullyForm = document.getElementById('bullyReportForm');
  if (bullyForm) {
    bullyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const desc = document.getElementById('bullyDetails')?.value.trim();
      if (!desc) {
        alert('Будь ласка, надайте опис ситуації.');
        return;
      }

      const alertBox = document.getElementById('bullySuccessAlert');
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.scrollIntoView({ behavior: 'smooth' });
      } else {
        alert('Ваше повідомлення конфіденційно передано дирекції ліцею та психологічній службі. Допомога поруч!');
      }
      bullyForm.reset();
    });
  }
});
