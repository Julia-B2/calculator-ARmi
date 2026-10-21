/* ============================================================
   main.js — анимации, интерактив, форма
   Реализация по дизайн-гайду, разделы 7–8:
   1) reveal-каскад по IntersectionObserver (80 мс)
   2) canvas-нейросеть в Hero (пауза при hidden/reduced-motion)
   3) печать в терминале (однократно)
   4) прорисовка графа + тултипы (CSS-состояния)
   5) бургер-меню
   6) форма Formspree (валидация, AJAX, состояния)
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Reveal-каскад ---------- */
  function initReveal() {
    var items = document.querySelectorAll('[data-reveal]');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    // Каскад: элементы одной секции появляются с шагом 80 мс
    var groups = document.querySelectorAll('[data-reveal-group]');
    groups.forEach(function (group) {
      group.querySelectorAll('[data-reveal]').forEach(function (el, i) {
        el.style.transitionDelay = (i * 80) + 'ms';
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 2. Canvas-нейросеть (Hero) ---------- */
  function initCanvas() {
    var canvas = document.getElementById('hero-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var nodes = [];
    var raf = null;
    var running = false;

    function count() {
      return window.innerWidth < 768 ? 26 : 52;
    }

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed(rect.width, rect.height);
      if (reduceMotion) drawFrame(0);
    }

    function seed(w, h) {
      nodes = [];
      for (var i = 0; i < count(); i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25
        });
      }
    }

    function drawFrame() {
      var w = canvas.width / dpr;
      var h = canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);

      // Связи (дистанция < 130px)
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.strokeStyle = 'rgba(77, 139, 255, ' + (0.25 * (1 - dist / 130)) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      // Узлы
      for (var k = 0; k < nodes.length; k++) {
        ctx.fillStyle = 'rgba(77, 139, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(nodes[k].x, nodes[k].y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function tick() {
      var w = canvas.width / dpr;
      var h = canvas.height / dpr;
      nodes.forEach(function (n) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      });
      drawFrame();
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (running || reduceMotion) return;
      running = true;
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }

    resize();
    // Пауза при скрытой вкладке (гайд, п. 7)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
    window.addEventListener('resize', function () {
      resize();
    });
    start();
  }

  /* ---------- 3. Печать в терминале ---------- */
  function initTerminal() {
    var body = document.getElementById('terminal-body');
    if (!body) return;

    var lines = Array.prototype.slice.call(body.querySelectorAll('.terminal__line'));
    var source = lines.map(function (l) { return l.textContent; }); // RU из HTML
    var revealed = false;   // секция уже попадала в вьюпорт
    var animToken = 0;      // счётчик запусков: отмена устаревшей печати

    function typeAll() {
      var token = ++animToken;
      // очистка строк и позиционирование курсора
      lines.forEach(function (l) { l.textContent = ''; });
      var cursor = document.createElement('span');
      cursor.className = 'terminal__cursor';
      body.appendChild(cursor);

      var li = 0, ci = 0;
      (function step() {
        if (token !== animToken || !cursor.isConnected) return; // отменено сменой языка/повтором
        if (li >= lines.length) { cursor.remove(); return; }
        var src = source[li] || '';
        if (ci === 0) lines[li].textContent = '';
        lines[li].textContent = src.slice(0, ++ci);
        if (ci >= src.length) { li++; ci = 0; }
        body.appendChild(cursor);
        setTimeout(step, ci === 0 ? 320 : 26);
      })();
    }

    if (reduceMotion) return; // статичный текст, печати нет

    // Смена языка: i18n уже подставил новый текст — берём его как источник и печатаем заново
    document.addEventListener('langchange', function () {
      source = lines.map(function (l) { return l.textContent; });
      if (revealed) typeAll();
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          revealed = true;
          typeAll();
          io.disconnect();
        }
      }, { threshold: 0.4 });
      io.observe(body);
    } else {
      revealed = true;
      typeAll();
    }
  }

  /* ---------- 4. Прорисовка графа ---------- */
  function initGraph() {
    var graph = document.getElementById('process-graph');
    if (!graph) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      graph.classList.add('is-visible');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        graph.classList.add('is-visible');
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(graph);
  }

  /* ---------- 5. Бургер-меню ---------- */
  function initBurger() {
    var burger = document.querySelector('.burger');
    var nav = document.getElementById('site-nav');
    if (!burger || !nav) return;

    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('.nav__link')) {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        burger.focus();
      }
    });
  }

  /* ---------- 6. Форма Formspree ---------- */
  function initForm() {
    var form = document.getElementById('lead-form');
    if (!form) return;

    var btn = document.getElementById('submit-btn');
    var success = document.getElementById('form-success');
    var error = document.getElementById('form-error');
    var i18n = window.__i18n;

    var errors = {
      ru: {
        required: 'Заполните поле',
        consent: 'Нужно согласие на обработку данных'
      },
      en: {
        required: 'This field is required',
        consent: 'Consent is required to send the form'
      }
    };

    function setError(id, message) {
      var input = document.getElementById(id);
      var err = document.getElementById('err-' + id.slice(2));
      if (err) err.textContent = message || '';
      if (input) {
        if (message) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    }

    function validate() {
      var lang = (i18n && i18n.getLang()) || 'ru';
      var msg = errors[lang];
      var ok = true;

      ['f-name', 'f-contact', 'f-message'].forEach(function (id) {
        var input = document.getElementById(id);
        if (!input.value.trim()) { setError(id, msg.required); ok = false; }
        else setError(id, '');
      });

      var consent = document.getElementById('f-consent');
      var consentErr = document.getElementById('err-consent');
      if (!consent.checked) {
        consentErr.textContent = msg.consent;
        ok = false;
      } else {
        consentErr.textContent = '';
      }
      return ok;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      error.hidden = true;
      if (!validate()) {
        var firstInvalid = form.querySelector('[aria-invalid="true"]');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      btn.disabled = true;
      btn.classList.add('is-loading');

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      })
        .then(function (res) {
          if (res.ok) {
            form.hidden = true;
            success.hidden = false;
            success.focus && success.focus();
          } else {
            throw new Error('Formspree ' + res.status);
          }
        })
        .catch(function () {
          // Фолбэк: прямая связь (ТЗ, п. 6)
          error.hidden = false;
        })
        .finally(function () {
          btn.disabled = false;
          btn.classList.remove('is-loading');
        });
    });

    // Очистка ошибки при вводе
    form.addEventListener('input', function (e) {
      var id = e.target.id;
      if (id) setError(id, '');
    });
    form.addEventListener('change', function (e) {
      if (e.target.id === 'f-consent') {
        document.getElementById('err-consent').textContent = '';
      }
    });
  }

  /* ---------- 7. Плейсхолдеры-ссылки (заглушки макета) ---------- */
  function initPlaceholderLinks() {
    document.querySelectorAll('[data-placeholder-link]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
      });
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initReveal();
    initCanvas();
    initTerminal();
    initGraph();
    initBurger();
    initForm();
    initPlaceholderLinks();
  });
})();
