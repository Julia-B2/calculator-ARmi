/* ============================================================
   i18n: RU (в HTML, по умолчанию) + EN (этот словарь)
   Механизм по ТЗ, п. 8: data-i18n / data-i18n-placeholder /
   data-i18n-content, localStorage, <html lang>, title/description
   ============================================================ */
(function () {
  'use strict';

  var dict = {
    en: {
      /* Мета */
      'meta.title': 'AI Agent Deployment for Business — Yuliya Baranova',
      'meta.desc': 'I deploy AI agents for small and medium businesses: process audit, a pilot in 2–4 weeks, and a rollout with measurable results.',
      'meta.ogdesc': 'Process audit, a pilot in 2–4 weeks, and a rollout with measurable results.',

      /* Общее */
      'a11y.skip': 'Skip to content',

      /* Навигация */
      'nav.benefits': 'Benefits',
      'nav.trust': 'Trust',
      'nav.form': 'Request',
      'nav.contacts': 'Contacts',
      'cta.apply': 'Discuss a task',
      'cta.main': 'Discuss a task',
      'cta.secondary': 'How I work',

      /* Hero */
      'hero.h1a': 'I deploy',
      'hero.h1b': 'AI agents',
      'hero.h1c': 'that take routine work off your team',
      'hero.sub': 'Process audit → a pilot in 2–4 weeks → a rollout with measurable results. I work with small and medium businesses.',
      'metric.impl': 'deployments',
      'metric.payback': 'mo. to recoup',
      'metric.nda': 'and staged payment',

      /* Польза */
      'benefits.h2a': 'What',
      'benefits.h2b': 'changes',
      'benefits.h2c': 'after deployment',
      'tag.before': 'Before',
      'tag.after': 'After',
      'b1.before': 'Requests are handled manually, replies take hours',
      'b1.after': 'The agent answers customers in seconds, 24/7',
      'b1.metric': 'Response time: hours → seconds',
      'b2.before': 'Reports are assembled by hand from different spreadsheets',
      'b2.after': 'The agent builds and refreshes reports on its own',
      'b2.metric': 'Savings: [FILL IN] h per week',
      'b3.before': 'You hire a person for a repetitive task',
      'b3.after': 'The process is automated, headcount stays flat',
      'b3.metric': 'Costs: [FILL IN: −N% operating]',
      'b4.before': 'Mistakes caused by the human factor',
      'b4.after': 'Consistent rules and checklists in every request',
      'b4.metric': 'Quality: [FILL IN]',
      'b5.before': 'Scaling is limited by people',
      'b5.after': 'Load grows — the team doesn’t have to grow',
      'b5.metric': 'Growth: [FILL IN]',
      'bcta.title': 'Ready to find out what to automate in your business?',
      'bcta.text': 'Describe your process — I’ll show you where an AI agent fits.',

      /* Доверие */
      'trust.h2a': 'Process',
      'trust.h2b': 'cases and guarantees',
      'trust.graphH3': 'How the agent solves a task',
      'g1.name': 'Goal',
      'g1.meta': 'start',
      'g1.tip': 'We pin down which routine to remove and how the result will be measured',
      'g2.name': 'Audit',
      'g2.meta': '≈1 week',
      'g2.tip': 'I map the processes and find the scenarios worth automating',
      'g3.name': 'Pilot',
      'g3.meta': '2–4 weeks',
      'g3.tip': 'We launch the agent on one scenario and verify the effect',
      'g4.name': 'Deployment',
      'g4.meta': 'as planned',
      'g4.tip': 'I connect it to your systems and train the team',
      'g5.name': 'Result',
      'g5.meta': 'metric',
      'g5.tip': 'We compare the before/after numbers and back it up with support',
      'trust.casesH3': 'Cases',
      'case.badge': 'Example',
      'case.task': 'Task',
      'case.solution': 'Solution',
      'case.result': 'Result',
      'case1.title': 'Customer requests',
      'case1.task': 'Incoming requests handled manually, replies were delayed',
      'case1.solution': 'An AI assistant in messaging apps and on the website',
      'case1.result': '[FILL IN: numbers]',
      'case2.title': 'Management reporting',
      'case2.task': 'Reports assembled by hand from CRM and spreadsheets',
      'case2.solution': 'The agent builds a digest and sends it to the manager',
      'case2.result': '[FILL IN: numbers]',
      'trust.aboutH3': 'About me',
      'trust.aboutText': 'Your introduction goes here: 2–3 sentences about your experience, specialization and approach to AI agent deployment. [FILL IN]',
      'trust.guarH3': 'Guarantees',
      'guar1': 'NDA',
      'guar2': 'Staged payment',
      'guar3': 'Post-launch support: [FILL IN: period]',
      'guar4': 'Result on the pilot or a refund',

      /* Форма */
      'form.h2a': 'Describe your task —',
      'form.h2b': 'I’ll reply',
      'form.h2c': 'within one business day',
      'form.step1': 'I reply within one business day',
      'form.step2': 'We discuss the process and find where an agent fits',
      'form.step3': 'I propose a pilot scenario with timelines',
      'form.name': 'Name',
      'form.contact': 'Contact',
      'form.contactPh': '@username or email',
      'form.task': 'What to automate',
      'form.taskPh': '1–2 sentences about your process',
      'form.budget': 'Budget',
      'form.optional': 'optional',
      'form.b0': 'Not sure yet',
      'form.b1': 'up to 100k ₽',
      'form.b2': '100–300k ₽',
      'form.b3': '300k ₽ and above',
      'form.consent': 'By submitting this form, I consent to the processing of my personal data in accordance with the',
      'form.privacy': 'privacy policy',
      'form.submit': 'Send request',
      'form.micro': 'Your data is never shared with third parties.',
      'form.okTitle': 'Request sent',
      'form.okText': 'I’ll get back to you within one business day.',
      'form.errTitle': 'Could not send',
      'form.errText': 'Write to me directly:',

      /* Контакты */
      'contacts.h2': 'Contacts',
      'contacts.phone': 'Phone',
      'contacts.max': 'MAX',

      /* Футер */
      'footer.name': 'Yuliya Baranova',
      'footer.privacy': 'Privacy policy'
    }
  };

  /* Терминальные строки EN (печатаются в Hero) */
  dict.en['term.0'] = '> task: manual requests';
  dict.en['term.1'] = '> agent: connected to the channel';
  dict.en['term.2'] = '> manual hours: 32h/mo → 0h';
  dict.en['term.3'] = '> status: result confirmed ✓';

  var STORAGE_KEY = 'site-lang';
  var currentLang = 'ru';

  function t(key) {
    if (currentLang === 'ru') {
      // RU живёт в DOM: при первом переключении забираем оригинал
      var el = document.querySelector('[data-i18n="' + key + '"]');
      if (el && el.getAttribute('data-ru') !== null) {
        return el.getAttribute('data-ru');
      }
      return key;
    }
    return dict[currentLang][key] !== undefined ? dict[currentLang][key] : key;
  }

  function storeRuSources() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (!el.hasAttribute('data-ru')) {
        el.setAttribute('data-ru', el.innerHTML);
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      if (!el.hasAttribute('data-ru-ph')) {
        el.setAttribute('data-ru-ph', el.getAttribute('placeholder') || '');
      }
    });
    document.querySelectorAll('[data-i18n-content]').forEach(function (el) {
      if (!el.hasAttribute('data-ru-content')) {
        el.setAttribute('data-ru-content', el.getAttribute('content') || '');
      }
    });
  }

  function applyLang(lang) {
    currentLang = lang;
    var isEn = lang === 'en';

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      el.innerHTML = isEn
        ? (dict.en[key] !== undefined ? dict.en[key] : el.getAttribute('data-ru'))
        : el.getAttribute('data-ru');
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', isEn
        ? (dict.en[key] !== undefined ? dict.en[key] : el.getAttribute('data-ru-ph'))
        : el.getAttribute('data-ru-ph'));
    });

    document.querySelectorAll('[data-i18n-content]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-content');
      el.setAttribute('content', isEn
        ? (dict.en[key] !== undefined ? dict.en[key] : el.getAttribute('data-ru-content'))
        : el.getAttribute('data-ru-content'));
    });

    document.documentElement.setAttribute('lang', lang);

    document.querySelectorAll('.lang__btn').forEach(function (btn) {
      var active = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) { /* приватный режим — молча */ }

    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  function init() {
    storeRuSources();

    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    var initial = saved || 'ru';
    if (initial !== 'ru') applyLang(initial);

    document.querySelectorAll('.lang__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyLang(btn.getAttribute('data-lang'));
      });
    });
  }

  window.addEventListener('DOMContentLoaded', init);

  /* Доступно для main.js */
  window.__i18n = { t: t, getLang: function () { return currentLang; } };
})();
