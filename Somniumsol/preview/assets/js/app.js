/* =========================================================
   SOMNIUMSOL — логика витрины
   Vanilla JS, без сборки. Демо-корзина в localStorage.
   ========================================================= */
(function () {
  'use strict';

  const D = window.SOMNIUMSOL;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (id) => D.products.find((p) => p.id === id);
  const giftById = (id) => D.gifts.find((g) => g.id === id);
  const formatById = (id) => D.formats.find((f) => f.id === id);

  const icons = {
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4C10 4 4 9 4 16c0 2 1 3 2 4 6-1 12-5 14-16Z"/><path d="M6 18c3-5 7-8 11-10"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 5-3 6 0 11 2-1 3-3 3-5 3 4 2 11-3 12-5 1-8-3-7-8 1-4 4-5 7-10Z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3 8 8 9 5-1 8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h3l2 5-2 2c1 3 3 5 6 6l2-2 5 2v3c0 2-2 3-4 3C10 21 3 14 3 6c0-2 1-3 3-3Z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14"/><path d="m3 7 9 6 9-6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="17" cy="7" r=".8" fill="currentColor"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m21 4-3 16-6-5-4 3V14L3 12l18-8Z"/><path d="m8 18 5-5"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5A8 8 0 0 1 8.5 19L3 21l1.5-5A8 8 0 1 1 20 11.5Z"/><path d="M8 8c0 5 3 8 8 8"/></svg>',
    vk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7c1 6 4 10 8 10h2v-4c2 0 4 2 5 4h2c-1-3-3-5-5-6 2-1 4-3 5-6h-2c-1 2-3 4-5 4V5h-2v5C9 10 7 8 6 5H4c0 1 0 2 0 2Z"/></svg>',
    minusSmall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/></svg>'
  };

  /* ---------------- cart state ---------------- */
  const CART_KEY = 'somniumsol_cart_v1';
  const ORDER_KEY = 'somniumsol_orders_v1';
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { cart = []; }
  if (!Array.isArray(cart)) cart = [];

  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  }
  function cartCount() { return cart.reduce((s, i) => s + Number(i.qty || 0), 0); }
  function cartSubtotal() { return cart.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 0), 0); }
  function packsCount() { return cart.reduce((s, i) => s + Number(i.qty || 0), 0); }
  function itemKey(item) {
    return [item.type, item.id, item.weight || '', item.grind || '', item.sub ? '1' : '0', item.frequency || ''].join('|');
  }
  function addItem(item) {
    const key = itemKey(item);
    const found = cart.find((i) => i.key === key);
    if (found) found.qty += Number(item.qty || 1);
    else cart.push(Object.assign({}, item, { key, qty: Number(item.qty || 1) }));
    saveCart();
    renderCart();
    openCart();
    toast(item.name + ' — в корзине');
  }
  function removeItem(key) {
    cart = cart.filter((i) => i.key !== key);
    saveCart(); renderCart();
  }
  function changeQty(key, delta) {
    const it = cart.find((i) => i.key === key);
    if (!it) return;
    it.qty = Math.max(1, Number(it.qty) + delta);
    saveCart(); renderCart();
  }
  function addProduct(id, weight, grind, sub, frequency, qty) {
    const p = byId(id); if (!p) return;
    weight = Number(weight || 1000);
    grind = grind || 'beans';
    const isSub = !!sub;
    const price = isSub ? p.subPrice[weight] : p.price[weight];
    addItem({
      type: isSub ? 'subscription' : 'coffee',
      id: p.id, name: p.name,
      weight, grind,
      sub: isSub,
      frequency: isSub ? (frequency || 'month') : '',
      price,
      image: p.image,
      variant: (D.weightLabels[weight] || '1 кг') + ' · ' + D.grindLabels[grind] + (isSub ? ' · подписка' : '')
    });
  }
  function addGift(id) {
    const g = giftById(id); if (!g) return;
    addItem({ type: 'gift', id: g.id, name: g.name, price: g.price, image: g.image, variant: g.composition });
  }
  function addFormat(id) {
    const f = formatById(id); if (!f) return;
    addItem({ type: 'format', id: f.id, name: f.name, price: f.price, image: f.image, variant: f.tag });
  }

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(message) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast';
      el.innerHTML = icons.check + '<span></span>';
      document.body.appendChild(el);
    }
    $('span', el).textContent = message;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 2800);
  }

  /* ---------------- chrome ---------------- */
  function pageName() {
    const p = location.pathname.split('/').pop();
    return p || 'index.html';
  }
  function navLink(href, label, active) {
    return `<a class="nav__link${active ? ' is-active' : ''}" href="${href}">${label}</a>`;
  }
  function renderChrome() {
    const page = pageName();
    const active = {
      catalog: page === 'catalog.html' || page === 'product.html',
      subscription: page === 'subscription.html',
      gifts: page === 'gifts.html',
      about: page === 'about.html',
      delivery: page === 'delivery.html'
    };
    const headerHost = $('#site-header');
    if (headerHost) {
      headerHost.innerHTML = `
        <div class="announcement"><span class="announcement__item announcement__item--roast">Только 100% арабика</span><span class="dot announcement__dot--roast"></span><span class="announcement__item">Бесплатная доставка от 5 пачек</span><span class="hide-mobile"><span class="dot"></span> Москва · доставка по России</span></div>
        <header class="header" id="siteHeader">
          <div class="container header__inner">
            <a class="logo" href="index.html" aria-label="Somniumsol — на главную">
              <img class="logo__img" src="assets/img/logo-somniumsol.png" alt="Somniumsol" width="1100" height="300">
            </a>
            <nav class="nav" aria-label="Основная навигация">
              ${navLink('catalog.html', 'Каталог', active.catalog)}
              ${navLink('subscription.html', 'Подписка', active.subscription)}
              ${navLink('gifts.html', 'Наборы', active.gifts)}
              ${navLink('about.html', 'О бренде', active.about)}
              ${navLink('delivery.html', 'Доставка', active.delivery)}
            </nav>
            <div class="header__actions">
              <button class="icon-btn" type="button" data-search-open aria-label="Поиск">${icons.search}</button>
              <button class="icon-btn" type="button" data-cart-open aria-label="Открыть корзину">${icons.bag}<span class="cart-count" data-cart-count>0</span></button>
              <button class="burger" type="button" aria-label="Меню" aria-expanded="false" aria-controls="mobileNav"><span></span><span></span><span></span></button>
            </div>
          </div>
        </header>
        <div class="mobile-nav" id="mobileNav">
          <div>
            <div class="eyebrow eyebrow--plain" style="margin-bottom:22px">Somniumsol · Moscow</div>
            <nav class="mobile-nav__links" aria-label="Мобильная навигация">
              <a href="catalog.html">Каталог <span>01</span></a>
              <a href="subscription.html">Подписка <span>02</span></a>
              <a href="gifts.html">Наборы <span>03</span></a>
              <a href="about.html">О бренде <span>04</span></a>
              <a href="delivery.html">Доставка <span>05</span></a>
              <a href="checkout.html">Корзина <span>06</span></a>
            </nav>
          </div>
          <div class="mobile-nav__bottom">
            <a href="tel:${D.settings.phoneRaw}">${D.settings.phone}</a>
            <a href="mailto:${D.settings.email}">${D.settings.email}</a>
            <span>${D.settings.address}</span>
          </div>
        </div>`;
    }

    const footerHost = $('#site-footer');
    if (footerHost) {
      footerHost.innerHTML = `
        <footer class="footer">
          <div class="container">
            <div class="footer__top">
              <div class="footer__brand">
                <a class="logo" href="index.html" aria-label="Somniumsol — на главную"><img class="logo__img" src="assets/img/logo-somniumsol-light.png" alt="Somniumsol" width="1100" height="300"></a>
                <p>Кофе, в котором просыпается солнце. 100% арабика, три характера на выбор.</p>
                <div class="footer__social">
                  <a href="${D.settings.telegram}" aria-label="Telegram" target="_blank" rel="noopener">${icons.telegram}</a>
                  <a href="${D.settings.whatsapp}" aria-label="WhatsApp" target="_blank" rel="noopener">${icons.whatsapp}</a>
                  <a href="#" aria-label="Instagram" target="_blank" rel="noopener">${icons.instagram}</a>
                </div>
              </div>
              <div>
                <h4>Информация</h4>
                <div class="footer__links">
                  <a href="catalog.html">Каталог</a>
                  <a href="subscription.html">Подписка</a>
                  <a href="gifts.html">Наборы</a>
                  <a href="about.html">О бренде</a>
                  <a href="delivery.html">Доставка и оплата</a>
                </div>
              </div>
              <div>
                <h4>Кофе</h4>
                <div class="footer__links">
                  <a href="product.html?id=epico">Epico</a>
                  <a href="product.html?id=sidamo">Sidamo</a>
                  <a href="product.html?id=mariposa">Mariposa</a>
                  <a href="subscription.html">«Солнцестояние»</a>
                </div>
              </div>
              <div>
                <h4>Контакты</h4>
                <div class="footer__contact">
                  <a href="tel:${D.settings.phoneRaw}">${D.settings.phone}</a>
                  <a href="mailto:${D.settings.email}">${D.settings.email}</a>
                  <span>${D.settings.address}</span>
                  <span style="display:block;margin-top:8px;color:rgba(251,245,233,.42)">${D.settings.hours}</span>
                </div>
              </div>
            </div>
            <div class="footer__bottom">
              <span>© ${new Date().getFullYear()} Somniumsol. Все права защищены.</span>
              <div class="footer__legal">
                <a href="legal.html">Оферта</a>
                <a href="legal.html#privacy">Политика конфиденциальности</a>
                <a href="legal.html#cookies">Cookies</a>
              </div>
              <div class="footer__pay"><span>МИР</span><span>Visa</span><span>Mastercard</span><span>СБП</span><span>ЮKassa</span><span>CloudPayments</span></div>
            </div>
          </div>
        </footer>`;
    }

    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay" data-overlay></div>
      <aside class="drawer" id="cartDrawer" aria-hidden="true" aria-label="Корзина">
        <div class="drawer__head"><h3>Корзина</h3><button class="drawer__close" type="button" data-cart-close aria-label="Закрыть корзину">${icons.close}</button></div>
        <div class="drawer__body" data-cart-items></div>
        <div class="drawer__foot">
          <div class="shipping-progress" data-shipping-progress></div>
          <div class="cart-total"><span>Итого</span><b data-cart-subtotal>0 ₽</b></div>
          <a class="btn btn--wide" href="checkout.html"><span>Оформить заказ</span>${icons.arrowRight}</a>
          <div class="drawer__note">Оплата картой, СБП или при получении</div>
        </div>
      </aside>
      <div class="search-panel" id="searchPanel" aria-hidden="true">
        <div class="search-panel__head"><span>Поиск по Somniumsol</span><button class="drawer__close" type="button" data-search-close aria-label="Закрыть поиск">${icons.close}</button></div>
        <div class="search-panel__body">
          <input type="search" id="searchInput" placeholder="Epico, Sidamo, подписка…" autocomplete="off" aria-label="Поиск">
          <div class="search-results" id="searchResults"></div>
          <div class="search-hint">Например: «шоколад», «фильтр», «подарок»</div>
        </div>
      </div>
    `);

    initChromeEvents();
    renderCart();
  }

  function initChromeEvents() {
    const overlay = $('[data-overlay]');
    const drawer = $('#cartDrawer');
    const searchPanel = $('#searchPanel');
    const burger = $('.burger');
    const mobileNav = $('#mobileNav');

    function lock(on) { document.body.classList.toggle('is-locked', on); }
    window.openCart = function () {
      drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false');
      overlay.classList.add('is-open'); lock(true);
    };
    window.closeCart = function () {
      drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('is-open'); lock(false);
    };
    window.openSearch = function () {
      searchPanel.classList.add('is-open'); searchPanel.setAttribute('aria-hidden', 'false');
      lock(true);
      setTimeout(() => $('#searchInput') && $('#searchInput').focus(), 200);
      renderSearch('');
    };
    window.closeSearch = function () {
      searchPanel.classList.remove('is-open'); searchPanel.setAttribute('aria-hidden', 'true');
      lock(false);
    };
    window.closeAll = function () { closeCart(); closeSearch(); closeMobile(); };

    function openMobile() {
      mobileNav.classList.add('is-open'); burger.setAttribute('aria-expanded', 'true'); lock(true);
    }
    function closeMobile() {
      mobileNav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false');
      if (!drawer.classList.contains('is-open') && !searchPanel.classList.contains('is-open')) lock(false);
    }
    window.closeMobile = closeMobile;

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-cart-open]')) { e.preventDefault(); openCart(); }
      if (e.target.closest('[data-cart-close]') || e.target === overlay) closeCart();
      if (e.target.closest('[data-search-open]')) { e.preventDefault(); openSearch(); }
      if (e.target.closest('[data-search-close]')) closeSearch();
      if (e.target.closest('.burger')) {
        if (mobileNav.classList.contains('is-open')) closeMobile(); else openMobile();
      }
      if (e.target.closest('#mobileNav a')) closeMobile();
      if (e.target.closest('[data-add-product]')) {
        const b = e.target.closest('[data-add-product]');
        addProduct(b.dataset.addProduct, b.dataset.weight || 1000, b.dataset.grind || 'beans', b.dataset.sub === 'true', b.dataset.frequency || 'month', b.dataset.qty || 1);
      }
      if (e.target.closest('[data-add-gift]')) addGift(e.target.closest('[data-add-gift]').dataset.addGift);
      if (e.target.closest('[data-add-format]')) addFormat(e.target.closest('[data-add-format]').dataset.addFormat);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });

    const searchInput = $('#searchInput');
    if (searchInput) searchInput.addEventListener('input', (e) => renderSearch(e.target.value));

    const syncHeader = () => {
      const h = $('#siteHeader');
      if (h) h.classList.toggle('is-scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', syncHeader, { passive: true });
    syncHeader();
  }

  function renderSearch(query) {
    const box = $('#searchResults');
    if (!box) return;
    const q = String(query || '').trim().toLowerCase();
    let results = D.products.filter((p) => !q || [p.name, p.origin, p.tag, p.notes.join(' '), p.description].join(' ').toLowerCase().includes(q));
    if (!q) results = D.products;
    let html = results.map((p) => `
      <a class="search-result" href="product.html?id=${p.id}">
        <img src="${p.image}" alt="${esc(p.name)}" loading="lazy">
        <div><h4>${p.name}</h4><p>${p.tag} · ${p.origin}</p></div>
      </a>`).join('');
    if (q && results.length === 0) {
      const gifts = D.gifts.filter((g) => (g.name + ' ' + g.composition).toLowerCase().includes(q));
      html = gifts.map((g) => `
        <a class="search-result" href="gifts.html">
          <img src="${g.image}" alt="${esc(g.name)}" loading="lazy">
          <div><h4>${g.name}</h4><p>Набор · ${money(g.price)}</p></div>
        </a>`).join('');
    }
    box.innerHTML = html || '<p class="small">Ничего не найдено. Попробуйте «Epico» или «подарок».</p>';
  }

  function renderCart() {
    const body = $('[data-cart-items]');
    const countEls = $$('[data-cart-count]');
    const totalEls = $$('[data-cart-subtotal]');
    const count = cartCount();
    countEls.forEach((el) => { el.textContent = count; el.style.display = count ? '' : 'none'; });
    totalEls.forEach((el) => { el.textContent = money(cartSubtotal()); });
    $$('.cart-count').forEach((el) => {
      el.classList.remove('is-bump');
      void el.offsetWidth;
      if (count) el.classList.add('is-bump');
    });
    if (!body) return;
    if (!cart.length) {
      body.innerHTML = `<div class="cart-empty"><div class="cart-empty__icon">${icons.bag}</div><h4>Пока пусто</h4><p>Начните с трёх солнц — Epico, Sidamo или Mariposa.</p><a class="btn btn--sm" href="catalog.html"><span>В каталог</span>${icons.arrowRight}</a></div>`;
    } else {
      body.innerHTML = cart.map((i) => `
        <div class="cart-item">
          <div class="cart-item__img"><img src="${i.image}" alt="${esc(i.name)}"></div>
          <div class="cart-item__info">
            <h4>${esc(i.name)}</h4>
            <p>${esc(i.variant || '')}${i.sub && i.frequency ? ' · ' + D.frequencyLabels[i.frequency] : ''}</p>
            <div class="cart-item__qty"><button type="button" data-qty-minus="${i.key}" aria-label="Уменьшить">${icons.minus}</button><span>${i.qty}</span><button type="button" data-qty-plus="${i.key}" aria-label="Увеличить">${icons.plus}</button></div>
          </div>
          <div class="cart-item__price">${money(i.price * i.qty)}</div>
          <button class="cart-item__remove" type="button" data-remove="${i.key}">Удалить</button>
        </div>`).join('');
    }
    const packs = packsCount();
    const left = Math.max(0, D.settings.freeShippingPacks - packs);
    const progress = Math.min(100, (packs / D.settings.freeShippingPacks) * 100);
    const progressEl = $('[data-shipping-progress]');
    if (progressEl) {
      progressEl.innerHTML = left
        ? `<div class="shipping-progress__text"><span>До бесплатной доставки по Москве: ${left} пачк${left === 1 ? 'а' : left < 5 ? 'и' : ''}</span><span>${packs}/${D.settings.freeShippingPacks}</span></div><div class="shipping-progress__bar"><i style="width:${progress}%"></i></div>`
        : `<a class="shipping-free" href="checkout.html"><span>Бесплатная доставка по Москве</span><span>${packs}/${D.settings.freeShippingPacks} ✓</span></a>`;
    }
    $$('[data-qty-plus]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.qtyPlus, 1)));
    $$('[data-qty-minus]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.qtyMinus, -1)));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => removeItem(b.dataset.remove)));
    document.dispatchEvent(new CustomEvent('cart:updated'));
  }

  function productCardHTML(p) {
    return `<article class="product-card product-card--${p.id}" data-reveal>
      <div class="product-card__top"><span>${p.directory} / ${p.directoryEn}</span><span>${p.index} · 100% арабика</span></div>
      <a class="product-card__img" href="product.html?id=${p.id}" aria-label="Открыть ${p.name}">
        <img src="${p.image}" alt="Кофе ${p.name} — ${p.tag}" loading="lazy" width="1280" height="1280">
      </a>
      <div class="product-card__num" aria-hidden="true">${p.index}</div>
      <div class="product-card__body">
        <div class="product-card__dir">${p.tag}</div>
        <h3><a href="product.html?id=${p.id}">${p.name}</a></h3>
        <div class="product-card__origin">${p.origin}</div>
        <p class="product-card__notes">${p.notes.join(' · ')}</p>
        <div class="product-card__bottom">
          <div class="product-card__price">от ${money(p.price[1000])}<small>/ 1 кг</small></div>
          <button class="add-btn" type="button" data-add-product="${p.id}" data-weight="1000" data-grind="beans" aria-label="Добавить ${p.name} 1 кг в корзину">${icons.plus}</button>
        </div>
      </div>
    </article>`;
  }

  function giftCardHTML(g) {
    return `<article class="gift-card" style="--gift-bg:${g.bg}" data-reveal>
      <a class="gift-card__art" href="gifts.html" aria-label="Набор ${g.name}"><img src="${g.image}" alt="Набор ${g.name}" loading="lazy"></a>
      <div class="gift-card__body">
        <div class="gift-card__tag">${g.tag}</div>
        <h3>${g.name}</h3>
        <p class="gift-card__desc">${g.description}</p>
        <div class="gift-card__bottom"><div class="gift-card__price">${money(g.price)}</div><button class="btn btn--sm" type="button" data-add-gift="${g.id}"><span>В корзину</span>${icons.plus}</button></div>
      </div>
    </article>`;
  }

  function planCardHTML(p, linkMode) {
    return `<article class="plan ${p.featured ? 'plan--featured' : ''}" data-reveal>
      <div class="plan__tag"><span>${p.featured ? 'Выбор большинства' : 'Подписка'}</span><span>${p.weight === 1000 ? '1 кг' : p.weight + ' г'}</span></div>
      <h3 class="plan__name">${p.name}</h3>
      <div class="plan__weight">${p.description}</div>
      <ul class="plan__list">${p.features.map((f) => '<li>' + f + '</li>').join('')}</ul>
      <div class="plan__price">от ${money(p.price)}<small>/ месяц</small></div>
      ${linkMode ? `<a class="btn ${p.featured ? '' : 'btn--light'}" href="subscription.html?plan=${p.id}" style="margin-top:18px"><span>Выбрать</span>${icons.arrowRight}</a>` : `<button class="btn ${p.featured ? '' : 'btn--light'}" type="button" data-plan-select="${p.id}" style="margin-top:18px"><span>Выбрать</span>${icons.arrowRight}</button>`}
    </article>`;
  }

  function formatCardHTML(f) {
    const isSub = f.type === 'format' && f.id === 'subscription';
    return `<article class="format-card" data-reveal>
      <div class="format-card__img"><img src="${f.image}" alt="${esc(f.name)}" loading="lazy"></div>
      <div>
        <div class="eyebrow eyebrow--plain" style="margin-bottom:8px">${f.badge}</div>
        <h3>${f.name}</h3>
        <p>${f.description}</p>
        <div class="format-card__row"><span class="format-card__price">${isSub ? 'от ' + money(f.price) : money(f.price)}</span>
        ${isSub ? `<a class="btn btn--sm" href="subscription.html"><span>Собрать</span>${icons.arrowRight}</a>` : `<button class="btn btn--sm" type="button" data-add-format="${f.id}"><span>В корзину</span>${icons.plus}</button>`}</div>
      </div>
    </article>`;
  }

  /* ---------------- common page inits ---------------- */
  function initReveal() {
    const els = $$('[data-reveal]');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-visible')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => io.observe(el));
  }

  function initFaq() {
    $$('.faq__item').forEach((item) => {
      const q = $('.faq__q', item);
      const a = $('.faq__a', item);
      if (!q || !a) return;
      q.addEventListener('click', () => {
        const open = item.classList.contains('is-open');
        $$('.faq__item').forEach((other) => {
          other.classList.remove('is-open');
          const oa = $('.faq__a', other); if (oa) oa.style.maxHeight = null;
        });
        if (!open) { item.classList.add('is-open'); a.style.maxHeight = a.scrollHeight + 'px'; }
      });
    });
  }

  function initProductAccordions() {
    $$('.product-acc').forEach((item) => {
      const q = $('.product-acc__q', item);
      const a = $('.product-acc__a', item);
      if (!q || !a) return;
      q.addEventListener('click', () => {
        const open = item.classList.contains('is-open');
        item.classList.toggle('is-open', !open);
        a.style.maxHeight = open ? null : a.scrollHeight + 'px';
      });
    });
  }

  function initNewsletter() {
    const form = $('#newsletterForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('input', form);
      if (!input || !input.value.includes('@')) { toast('Укажите email'); return; }
      toast('Спасибо! Письма о новых лотах уже в пути');
      form.reset();
    });
  }

  /* ---------------- home ---------------- */
  function initHome() {
    const productsEl = $('#home-products');
    if (productsEl) productsEl.innerHTML = D.products.map(productCardHTML).join('');
    const plansEl = $('#home-plans');
    if (plansEl) plansEl.innerHTML = D.plans.map((p) => planCardHTML(p, !plansEl.hasAttribute('data-plan-select'))).join('');
    const giftsEl = $('#home-gifts');
    if (giftsEl) giftsEl.innerHTML = D.gifts.map(giftCardHTML).join('');
    const formatsEl = $('#home-formats');
    if (formatsEl) formatsEl.innerHTML = D.formats.map(formatCardHTML).join('');
    initReveal();
  }

  /* ---------------- catalog ---------------- */
  function initCatalog() {
    const grid = $('#catalog-grid');
    if (!grid) return;
    let roast = 'all';
    let sort = 'default';

    function render() {
      let list = D.products.slice();
      if (roast !== 'all') list = list.filter((p) => p.roast === roast);
      if (sort === 'price-asc') list.sort((a, b) => a.price[1000] - b.price[1000]);
      if (sort === 'price-desc') list.sort((a, b) => b.price[1000] - a.price[1000]);
      if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      grid.innerHTML = list.map(productCardHTML).join('');
      const count = $('#catalog-count');
      if (count) count.textContent = list.length + ' из ' + D.products.length;
      initReveal();
    }

    $$('[data-filter-roast]').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('[data-filter-roast]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        roast = btn.dataset.filterRoast;
        render();
      });
    });
    const sortEl = $('#catalog-sort');
    if (sortEl) sortEl.addEventListener('change', () => { sort = sortEl.value; render(); });

    const formatsEl = $('#format-grid');
    if (formatsEl) formatsEl.innerHTML = D.formats.map(formatCardHTML).join('');
    render();
    initReveal();
  }

  /* ---------------- product page ---------------- */
  function initProductPage() {
    const root = $('#product-root');
    if (!root) return;
    const params = new URLSearchParams(location.search);
    const p = byId(params.get('id')) || D.products[0];
    document.title = p.name + ' — Somniumsol';
    const state = { weight: 1000, grind: 'beans', sub: false, frequency: 'month', qty: 1 };
    const related = D.products.filter((x) => x.id !== p.id);

    root.innerHTML = `
      <div class="container">
        <nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="index.html">Главная</a><span>/</span><a href="catalog.html">Каталог</a><span>/</span><span>${p.name}</span></nav>
        <div class="product-layout">
          <div class="product-gallery">
            <div class="product-gallery__main" style="--gallery-bg:${p.colorSoft}"><div class="product-gallery__frame"><img id="galleryMain" src="${p.gallery[0]}" alt="Кофе ${p.name} — ${p.tag}" width="711" height="1278"></div></div>
            <div class="product-gallery__thumbs">${p.gallery.map((src, i) => `<button class="product-thumb${i === 0 ? ' is-active' : ''}" type="button" data-gallery="${src}" aria-label="Фото ${i + 1}"><img src="${src}" alt=""></button>`).join('')}</div>
            <div class="product-gallery__note"><span>100% арабика</span><span>Москва · 2026</span></div>
          </div>
          <div class="product-info">
            <div class="product-info__dir">${p.directory} / ${p.directoryEn} · ${p.tag}</div>
            <h1>${p.name}</h1>
            <div class="product-info__origin">${p.origin} · ${p.process} · 100% арабика</div>
            <div class="product-info__notes">${p.notes.map((n) => `<span class="note-tag">${n}</span>`).join('')}</div>
            <p class="product-info__desc">${p.description}</p>
            <div class="product-price"><b data-product-price>${money(p.price[1000])}</b><span data-product-unit>/ 1 кг</span></div>

            <div class="product-option">
              <div class="product-option__head"><span class="product-option__label">Вес</span><span class="product-option__hint">Только 1 кг</span></div>
              <div class="option-row">${[1000].map((w) => `<button class="option${w === 1000 ? ' is-active' : ''}" type="button" data-weight="${w}">${D.weightLabels[w]}</button>`).join('')}</div>
            </div>

            <div class="purchase-toggle">
              <button class="is-active" type="button" data-purchase="once">Разово</button>
              <button type="button" data-purchase="sub">Подписка <small>−10%</small></button>
            </div>
            <div class="sub-options" id="subOptions">
              <div class="product-option" style="margin-bottom:12px">
                <div class="product-option__head"><span class="product-option__label">Частота</span></div>
                <div class="option-row">${Object.entries(D.frequencyLabels).map(([k, v]) => `<button class="option${k === 'month' ? ' is-active' : ''}" type="button" data-frequency="${k}">${v}</button>`).join('')}</div>
              </div>
              <p class="small" style="font-size:10px;line-height:1.5">Скидка 10% и доставка включены. Пауза, замена вкуса и отмена — в личном кабинете.</p>
            </div>

            <div class="product-buy">
              <div class="qty"><button type="button" data-qty="-1" aria-label="Уменьшить">−</button><input id="productQty" value="1" inputmode="numeric" aria-label="Количество"><button type="button" data-qty="1" aria-label="Увеличить">+</button></div>
              <button class="btn" type="button" id="addToCartBtn"><span>Добавить в корзину</span>${icons.arrowRight}</button>
            </div>
            <div class="product-meta"><span>${icons.truck} Доставка 1–3 дня</span><span>${icons.leaf} 100% арабика</span><span>${icons.flame} В зёрнах</span><span>${icons.shield} Гарантия качества</span></div>

            <div class="product-accordion">
              <div class="product-acc">
                <button class="product-acc__q" type="button">О лоте <span>+</span></button>
                <div class="product-acc__a"><div class="product-acc__a-inner"><p>${p.description}</p><table><tr><td>Происхождение</td><td>${p.origin}</td></tr><tr><td>Обработка</td><td>${p.process}</td></tr><tr><td>Обжарка</td><td>${p.roastLabel}</td></tr><tr><td>Состав</td><td>100% арабика</td></tr></table></div></div>
              </div>
              <div class="product-acc">
                <button class="product-acc__q" type="button">Как заваривать <span>+</span></button>
                <div class="product-acc__a"><div class="product-acc__a-inner"><p>Рекомендуем: ${p.brew.join(', ')}. Для фильтра — 15 г на 250 мл, вода 92–94 °C, общее время 2:30. Для эспрессо — 18 г на 36 г, 25–30 секунд.</p><p>Если вкус кажется слишком плотным — уменьшите дозировку или время экстракции.</p></div></div>
              </div>
              <div class="product-acc">
                <button class="product-acc__q" type="button">Доставка и оплата <span>+</span></button>
                <div class="product-acc__a"><div class="product-acc__a-inner"><p>Курьер по Москве — 390 ₽, СДЭК — от 290 ₽, Почта России — 350 ₽. Бесплатно от 5 пачек, кроме дальних зон. Оплата картой, СБП или при получении.</p></div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="related">
          <div class="eyebrow" style="margin-bottom:14px">Продолжить дегустацию</div>
          <h2>Другие <em>солнца</em></h2>
          <div class="product-grid">${related.map(productCardHTML).join('')}
            <a class="related-cta" href="gifts.html">
              <div>
                <span class="eyebrow eyebrow--plain">Набор «Сон в подарок»</span>
                <h3>Не можете выбрать?</h3>
                <p>Три сорта по 1 кг — Epico, Sidamo и Mariposa в одной коробке. Хороший способ попробовать всё сразу.</p>
              </div>
              <span class="link-underline">Смотреть набор
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>
              </span>
            </a>
          </div>
        </div>
      </div>`;

    function updatePrice() {
      const price = state.sub ? p.subPrice[state.weight] : p.price[state.weight];
      const el = $('[data-product-price]', root);
      if (el) el.textContent = money(price);
      const unit = $('[data-product-unit]', root);
      if (unit) unit.textContent = '/ ' + (D.weightLabels[state.weight] || '1 кг');
      const add = $('#addToCartBtn span', root);
      if (add) add.textContent = state.sub ? 'Оформить подписку' : 'Добавить в корзину';
    }

    $$('[data-weight]', root).forEach((b) => b.addEventListener('click', () => {
      $$('[data-weight]', root).forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active'); state.weight = Number(b.dataset.weight); updatePrice();
    }));
    $$('[data-purchase]', root).forEach((b) => b.addEventListener('click', () => {
      $$('[data-purchase]', root).forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      state.sub = b.dataset.purchase === 'sub';
      $('#subOptions', root).classList.toggle('is-active', state.sub);
      updatePrice();
    }));
    $$('[data-frequency]', root).forEach((b) => b.addEventListener('click', () => {
      $$('[data-frequency]', root).forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active'); state.frequency = b.dataset.frequency;
    }));
    $$('[data-gallery]', root).forEach((b) => b.addEventListener('click', () => {
      $$('.product-thumb', root).forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      $('#galleryMain', root).src = b.dataset.gallery;
    }));
    $$('[data-qty]', root).forEach((b) => b.addEventListener('click', () => {
      const input = $('#productQty', root);
      state.qty = Math.max(1, Math.min(99, Number(input.value || 1) + Number(b.dataset.qty)));
      input.value = state.qty;
    }));
    const qtyInput = $('#productQty', root);
    if (qtyInput) qtyInput.addEventListener('change', () => { state.qty = Math.max(1, Math.min(99, Number(qtyInput.value || 1))); qtyInput.value = state.qty; });
    const addBtn = $('#addToCartBtn', root);
    if (addBtn) addBtn.addEventListener('click', () => addProduct(p.id, state.weight, state.grind, state.sub, state.frequency, state.qty));
    initReveal();
    initProductAccordions();
  }

  /* ---------------- subscription page ---------------- */
  function initSubscriptionPage() {
    const root = $('#sub-config');
    if (!root) return;
    const state = { coffee: 'mariposa', weight: 1000, frequency: 'month', grind: 'beans' };
    const params = new URLSearchParams(location.search);
    if (params.get('plan') === 'plan-circle') state.weight = 1000;

    function renderOptions() {
      $('#sub-coffee-options').innerHTML = D.products.map((p) => `<button class="option${p.id === state.coffee ? ' is-active' : ''}" type="button" data-sub-coffee="${p.id}">${p.name}</button>`).join('');
      $('#sub-weight-options').innerHTML = [1000].map((w) => `<button class="option${w === state.weight ? ' is-active' : ''}" type="button" data-sub-weight="${w}">${D.weightLabels[w]}</button>`).join('');
      $('#sub-frequency-options').innerHTML = Object.entries(D.frequencyLabels).map(([k, v]) => `<button class="option${k === state.frequency ? ' is-active' : ''}" type="button" data-sub-frequency="${k}">${v}</button>`).join('');
      bind();
      update();
    }
    function bind() {
      $$('[data-sub-coffee]', root).forEach((b) => b.onclick = () => { state.coffee = b.dataset.subCoffee; renderOptions(); });
      $$('[data-sub-weight]', root).forEach((b) => b.onclick = () => { state.weight = Number(b.dataset.subWeight); renderOptions(); });
      $$('[data-sub-frequency]', root).forEach((b) => b.onclick = () => { state.frequency = b.dataset.subFrequency; renderOptions(); });
    }
    function update() {
      const p = byId(state.coffee);
      const price = p.subPrice[state.weight];
      const priceEl = $('#sub-price'); if (priceEl) priceEl.textContent = money(price);
      const sum = $('#sub-summary');
      if (sum) sum.textContent = `${p.name} · ${D.weightLabels[state.weight]} · ${D.frequencyLabels[state.frequency]}. Скидка 10% уже включена.`;
      const old = $('#sub-old-price');
      if (old) old.innerHTML = '<s>' + money(p.price[state.weight]) + '</s> разово';
    }
    const add = $('#sub-add');
    if (add) add.addEventListener('click', () => addProduct(state.coffee, state.weight, state.grind, true, state.frequency, 1));
    $$('[data-plan-select]').forEach((b) => b.addEventListener('click', () => {
      const plan = D.plans.find((p) => p.id === b.dataset.planSelect);
      if (plan) { state.weight = plan.weight; renderOptions(); root.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }));
    renderOptions();
    initReveal();
  }

  /* ---------------- gifts page ---------------- */
  function initGiftsPage() {
    const grid = $('#gifts-grid');
    if (!grid) return;
    grid.innerHTML = D.gifts.map((g) => `<article class="gift-card" style="--gift-bg:${g.bg}" data-reveal>
      <a class="gift-card__art" href="#${g.id}" aria-label="Набор ${g.name}"><img src="${g.image}" alt="Набор ${g.name}" loading="lazy"></a>
      <div class="gift-card__body" id="${g.id}">
        <div class="gift-card__tag">${g.tag}</div>
        <h3>${g.name}</h3>
        <p class="gift-card__desc">${g.description}</p>
        <div class="small" style="margin-bottom:16px;color:var(--muted)">${g.composition}</div>
        <div class="gift-card__bottom"><div class="gift-card__price">${money(g.price)}</div><button class="btn btn--sm" type="button" data-add-gift="${g.id}"><span>В корзину</span>${icons.plus}</button></div>
      </div>
    </article>`).join('');
    initReveal();
  }

  /* ---------------- quiz ---------------- */
  function initQuiz() {
    const root = $('#quiz');
    if (!root) return;
    const answers = [];
    let step = 0;
    const stepsEl = $('#quizSteps');
    const resultEl = $('#quizResult');
    const progressEl = $('#quizProgress');

    function render() {
      stepsEl.innerHTML = D.quiz.map((q, i) => `<div class="quiz__step${i === step ? ' is-active' : ''}" data-step="${i}"><div class="quiz__q">${q.q}</div><div class="quiz__options">${q.options.map((o) => `<button class="quiz__option" type="button" data-answer="${o.value}" data-label="${o.label}">${o.label}</button>`).join('')}</div></div>`).join('');
      progressEl.innerHTML = D.quiz.map((_, i) => `<i class="${i < step ? 'is-done' : ''}"></i>`).join('');
      $$('[data-answer]', stepsEl).forEach((b) => b.addEventListener('click', () => {
        answers[step] = { value: b.dataset.answer, label: b.dataset.label };
        if (step < D.quiz.length - 1) { step++; render(); }
        else showResult();
      }));
    }
    function showResult() {
      stepsEl.style.display = 'none';
      resultEl.classList.add('is-active');
      progressEl.innerHTML = D.quiz.map(() => '<i class="is-done"></i>').join('');
      const all = answers.map((a) => a.value);
      let product = D.products[2];
      if (all.includes('filter') || all.includes('light') || all.includes('slow')) product = D.products[1];
      if (all.includes('espresso') || all.includes('dark') || all.includes('fast')) product = D.products[0];
      if (all.includes('office') || all.includes('explore')) product = D.products[2];
      if (all.includes('any') && all.includes('explore')) product = D.products[2];
      resultEl.innerHTML = `<img src="${product.image}" alt="${product.name}"><div><div class="eyebrow eyebrow--plain" style="margin-bottom:8px">Ваше солнце</div><h3>${product.name}</h3><p>${product.notes.join(' · ')}. ${product.short}</p></div><button class="btn btn--sm" type="button" data-add-product="${product.id}" data-weight="1000" data-grind="beans"><span>Добавить 1 кг</span>${icons.plus}</button>`;
    }
    render();
  }

  /* ---------------- checkout ---------------- */
  function initCheckout() {
    const main = $('#checkout-main');
    if (!main) return;
    const empty = $('#checkout-empty');
    const success = $('#checkout-success');
    const summaryItems = $('#summary-items');
    const summaryTotals = $('#summary-totals');
    const promoInput = $('#promo-input');
    const promoBtn = $('#promo-apply');
    const promoMsg = $('#promo-message');
    let promo = null;
    let completed = false;

    function selectedDelivery() {
      const r = $('input[name="delivery"]:checked');
      return r ? r.value : 'moscow';
    }
    function selectedPayment() {
      const r = $('input[name="payment"]:checked');
      return r ? r.value : 'yookassa-card';
    }
    function discount() {
      if (!promo) return 0;
      if (promo.type === 'percent') return Math.round(cartSubtotal() * promo.value / 100);
      return 0;
    }
    function shipping() {
      if (!cart.length) return 0;
      if (promo && promo.type === 'shipping') return 0;
      if (packsCount() >= D.settings.freeShippingPacks) return 0;
      const d = D.settings.delivery[selectedDelivery()];
      return d ? d.price : 0;
    }
    function total() { return Math.max(0, cartSubtotal() - discount() + shipping()); }

    function renderSummary() {
      if (completed) {
        if (empty) empty.style.display = 'none';
        main.style.display = 'none';
        return;
      }
      const has = cart.length > 0;
      if (empty) empty.style.display = has ? 'none' : 'block';
      main.style.display = has ? '' : 'none';
      if (!has) return;
      summaryItems.innerHTML = cart.map((i) => `<div class="summary-item"><div class="summary-item__img"><img src="${i.image}" alt="${esc(i.name)}"></div><div><h4>${esc(i.name)}</h4><p>${esc(i.variant || '')}${i.sub && i.frequency ? ' · ' + D.frequencyLabels[i.frequency] : ''} · ${i.qty} шт.</p></div><b>${money(i.price * i.qty)}</b></div>`).join('');
      const d = discount();
      const s = shipping();
      summaryTotals.innerHTML = `
        <div><span>Товары</span><span>${money(cartSubtotal())}</span></div>
        ${d ? `<div><span>Скидка${promo ? ' · ' + promo.label : ''}</span><span>−${money(d)}</span></div>` : ''}
        <div><span>Доставка</span><span>${s ? money(s) : 'Бесплатно'}</span></div>
        <div class="is-total"><span>Итого</span><b>${money(total())}</b></div>`;
      if (promoMsg) promoMsg.textContent = promo ? promo.label : '';
      syncFreeMoscow();
    }

    function syncFreeMoscow() {
      const box = $('[data-free-moscow]');
      if (!box) return;
      const reached = packsCount() >= D.settings.freeShippingPacks;
      box.hidden = !reached;
      const moscow = $('input[name="delivery"][value="moscow"]');
      if (moscow) {
        const span = moscow.closest('.delivery-option').querySelector('b span');
        if (span) {
          span.textContent = reached ? 'Бесплатно' : money(D.settings.delivery.moscow.price);
          span.classList.toggle('is-free', reached);
        }
      }
      const applied = reached && selectedDelivery() === 'moscow';
      box.classList.toggle('is-applied', applied);
      const btn = box.querySelector('.free-moscow__btn');
      if (btn) btn.textContent = applied ? 'Бесплатная доставка по Москве ✓' : 'Включить бесплатную доставку по Москве';
    }
    const freeBtn = $('[data-free-moscow-apply]');
    if (freeBtn) freeBtn.addEventListener('click', () => {
      const moscow = $('input[name="delivery"][value="moscow"]');
      if (!moscow) return;
      moscow.checked = true;
      moscow.dispatchEvent(new Event('change', { bubbles: true }));
      toast('Бесплатная доставка по Москве применена');
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('input[name="delivery"]')) renderSummary();
    });
    $$('input[name="delivery"]').forEach((r) => r.addEventListener('change', () => {
      $$('.delivery-option').forEach((o) => o.classList.toggle('is-active', o.querySelector('input').checked));
      const addr = $('#address-field');
      if (addr) addr.style.display = '';
      renderSummary();
    }));
    $$('input[name="payment"]').forEach((r) => r.addEventListener('change', () => {
      $$('.payment-option').forEach((o) => o.classList.toggle('is-active', o.querySelector('input').checked));
    }));
    if (promoBtn) promoBtn.addEventListener('click', () => {
      const code = (promoInput.value || '').trim().toUpperCase();
      const found = D.promos[code];
      if (!found) { promoMsg.textContent = 'Промокод не найден'; promoMsg.style.color = 'var(--terracotta)'; promo = null; renderSummary(); return; }
      promo = Object.assign({ code }, found);
      promoMsg.textContent = found.label;
      promoMsg.style.color = 'var(--olive)';
      renderSummary();
      toast('Промокод применён: ' + found.label);
    });

    const form = $('#checkout-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!cart.length) return;
      const required = $$('[data-required]', form);
      let ok = true;
      required.forEach((el) => {
        const valid = el.type === 'checkbox' ? el.checked : (el.value || '').trim().length > 1;
        el.classList.toggle('is-invalid', !valid);
        if (!valid) ok = false;
      });
      const email = $('#email');
      if (email && email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { email.classList.add('is-invalid'); ok = false; }
      if (!ok) { toast('Проверьте выделенные поля'); return; }
      if (!selectedDelivery()) return;
      const order = {
        number: 'SOL-' + String(Date.now()).slice(-6),
        date: new Date().toISOString(),
        items: cart.slice(),
        subtotal: cartSubtotal(), discount: discount(), shipping: shipping(), total: total(),
        customer: {
          name: $('#name').value.trim(), phone: $('#phone').value.trim(), email: $('#email').value.trim(),
          city: $('#city').value.trim(), address: ($('#address') ? $('#address').value.trim() : ''),
          comment: ($('#comment') ? $('#comment').value.trim() : '')
        },
        delivery: selectedDelivery(), payment: selectedPayment(), promo: promo ? promo.code : ''
      };
      try {
        const orders = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
        orders.push(order);
        localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
      } catch (err) {}
      showSuccess(order);
    });

    function showSuccess(order) {
      completed = true;
      const head = $('.checkout__head');
      if (head) head.style.display = 'none';
      const toastEl = $('#toast');
      if (toastEl) toastEl.classList.remove('is-show');
      main.style.display = 'none';
      if (empty) empty.style.display = 'none';
      success.classList.add('is-active');
      const num = $('#success-number'); if (num) num.textContent = order.number;
      const details = $('#success-details');
      if (details) details.innerHTML = `Заказ на ${money(order.total)} · ${D.settings.delivery[order.delivery] ? D.settings.delivery[order.delivery].title : 'Доставка'} · ${order.items.reduce((s, i) => s + i.qty, 0)} шт.`;
      const text = `Заказ ${order.number}\n${order.items.map((i) => `${i.name} — ${i.qty} шт. — ${money(i.price * i.qty)}`).join('\n')}\nИтого: ${money(order.total)}\n${order.customer.name}, ${order.customer.phone}\n${order.customer.city}, ${order.customer.address}`;
      const wa = $('#success-wa'); if (wa) wa.href = D.settings.whatsapp + '?text=' + encodeURIComponent(text);
      const tg = $('#success-tg'); if (tg) tg.href = D.settings.telegram;
      cart = []; saveCart(); renderCart();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    renderSummary();
    document.addEventListener('cart:updated', renderSummary);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    renderChrome();
    initHome();
    initCatalog();
    initProductPage();
    initSubscriptionPage();
    initGiftsPage();
    initQuiz();
    initCheckout();
    initFaq();
    initProductAccordions();
    initNewsletter();
    initReveal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
