/**
 * Модуль доступності (WCAG 2.1 / ДСТУ ISO/IEC 40500:2015)
 * Забезпечує налаштування для людей з порушенням зору та збереження в localStorage
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'novopil_a11y_settings';

  const defaultSettings = {
    panelOpen: false,
    fontSize: 'font-md',
    theme: 'theme-normal',
    spacing: false,
    dyslexic: false,
    images: 'normal',
  };

  let settings = { ...defaultSettings };

  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        settings = { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Не вдалося завантажити налаштування доступності:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Не вдалося зберегти налаштування доступності:', e);
    }
  }

  function applySettings() {
    const html = document.documentElement;

    // Reset font size classes
    html.classList.remove('font-md', 'font-lg', 'font-xl');
    html.classList.add(settings.fontSize);

    // Reset theme classes
    html.classList.remove('theme-bw', 'theme-wb', 'theme-by');
    if (settings.theme !== 'theme-normal') {
      html.classList.add(settings.theme);
    }

    // Spacing
    if (settings.spacing) {
      html.classList.add('spacing-wide');
    } else {
      html.classList.remove('spacing-wide');
    }

    // Dyslexic font
    if (settings.dyslexic) {
      html.classList.add('font-dyslexic');
    } else {
      html.classList.remove('font-dyslexic');
    }

    // Images
    html.classList.remove('images-grayscale', 'images-hide');
    if (settings.images === 'grayscale') {
      html.classList.add('images-grayscale');
    } else if (settings.images === 'hide') {
      html.classList.add('images-hide');
    }

    // Update panel active button states
    updateButtonStates();

    // Toggle panel visibility
    const panel = document.getElementById('a11yPanel');
    const toggleBtn = document.getElementById('a11yToggleBtn');
    if (panel) {
      if (settings.panelOpen) {
        panel.classList.add('is-active');
        if (toggleBtn) toggleBtn.classList.add('active');
      } else {
        panel.classList.remove('is-active');
        if (toggleBtn) toggleBtn.classList.remove('active');
      }
    }
  }

  function updateButtonStates() {
    document.querySelectorAll('[data-a11y-action]').forEach((btn) => {
      const action = btn.dataset.a11yAction;
      const val = btn.dataset.a11yValue;

      if (action === 'fontsize') {
        btn.classList.toggle('active', settings.fontSize === val);
      } else if (action === 'theme') {
        btn.classList.toggle('active', settings.theme === val);
      } else if (action === 'spacing') {
        btn.classList.toggle('active', settings.spacing);
      } else if (action === 'dyslexic') {
        btn.classList.toggle('active', settings.dyslexic);
      } else if (action === 'images') {
        btn.classList.toggle('active', settings.images === val);
      }
    });
  }

  function setupEventListeners() {
    const toggleBtn = document.getElementById('a11yToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        settings.panelOpen = !settings.panelOpen;
        saveSettings();
        applySettings();
      });
    }

    const closeBtn = document.getElementById('a11yCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        settings.panelOpen = false;
        saveSettings();
        applySettings();
      });
    }

    document.querySelectorAll('[data-a11y-action]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const action = this.dataset.a11yAction;
        const val = this.dataset.a11yValue;

        if (action === 'fontsize') {
          settings.fontSize = val;
        } else if (action === 'theme') {
          settings.theme = val;
        } else if (action === 'spacing') {
          settings.spacing = !settings.spacing;
        } else if (action === 'dyslexic') {
          settings.dyslexic = !settings.dyslexic;
        } else if (action === 'images') {
          settings.images = settings.images === val ? 'normal' : val;
        } else if (action === 'reset') {
          settings = { ...defaultSettings, panelOpen: true };
        } else if (action === 'speech') {
          toggleSpeech();
          return;
        }

        saveSettings();
        applySettings();
      });
    });
  }

  let isSpeaking = false;
  function toggleSpeech() {
    if (!('speechSynthesis' in window)) {
      alert('Ваш браузер не підтримує синтез мовлення (Web Speech API).');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      const speechBtn = document.querySelector('[data-a11y-action="speech"]');
      if (speechBtn) speechBtn.classList.remove('active');
      return;
    }

    const selectedText = window.getSelection().toString().trim();
    const textToRead = selectedText || document.querySelector('.page-content, .hero-desc, body').innerText;
    
    if (!textToRead) return;

    const utterance = new SpeechSynthesisUtterance(textToRead.slice(0, 1500));
    utterance.lang = 'uk-UA';
    utterance.rate = 0.95;

    utterance.onend = () => {
      isSpeaking = false;
      const speechBtn = document.querySelector('[data-a11y-action="speech"]');
      if (speechBtn) speechBtn.classList.remove('active');
    };

    utterance.onerror = () => {
      isSpeaking = false;
      const speechBtn = document.querySelector('[data-a11y-action="speech"]');
      if (speechBtn) speechBtn.classList.remove('active');
    };

    window.speechSynthesis.speak(utterance);
    isSpeaking = true;
    const speechBtn = document.querySelector('[data-a11y-action="speech"]');
    if (speechBtn) speechBtn.classList.add('active');
  }

  // Init
  loadSettings();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applySettings();
      setupEventListeners();
    });
  } else {
    applySettings();
    setupEventListeners();
  }
})();
