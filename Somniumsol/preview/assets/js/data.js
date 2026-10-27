/* =========================================================
   SOMNIUMSOL — данные витрины
   Цены и состав — демонстрационные, для превью.
   ========================================================= */

window.SOMNIUMSOL = {
  settings: {
    brand: 'Somniumsol',
    phone: '+7 (926) 112-27-17',
    phoneRaw: '+79261122717',
    email: 'AJ.somnium@yandex.ru',
    address: 'Москва, Переведеновский пер., 18, стр. 15',
    hours: 'Пн–Пт, 10:00–19:00',
    telegram: 'https://t.me/somniumsol',
    whatsapp: 'https://wa.me/79261122717',
    freeShippingPacks: 5,
    delivery: {
      moscow: { title: 'Курьер по Москве', price: 390, note: '1–2 дня, в пределах МКАД' },
      cdek: { title: 'СДЭК', price: 290, note: '2–5 дней, пункты выдачи по России' },
      post: { title: 'Почта России', price: 350, note: '3–7 дней, до ближайшего отделения' }
    }
  },

  products: [
    {
      id: 'epico',
      name: 'Epico',
      directory: 'Глубина',
      directoryEn: 'UMBRA',
      tag: 'Тёмная обжарка',
      origin: 'Бразилия · Эфиопия',
      process: 'Натуральная обработка',
      roast: 'dark',
      roastLabel: 'Тёмная',
      notes: ['тёмный шоколад', 'вишня', 'карамель'],
      brew: ['Эспрессо', 'Мока', 'Турка'],
      description: 'Плотный, сладкий бленд с шоколадной серединой и вишнёвой кислотностью. Для тех, кто любит кофе с характером: густое тело, низкая кислотность, долгое карамельное послевкусие.',
      short: 'Шоколад, вишня, карамель. Густой эспрессо на каждый день.',
      color: '#B9552F',
      colorSoft: '#E8C8B6',
      image: 'assets/img/products/epico.png',
      gallery: ['assets/img/products/epico.png', 'assets/img/beans.jpg', 'assets/img/espresso-crop.jpg', 'assets/img/v60-square.jpg'],
      price: { 1000: 2690 },
      subPrice: { 1000: 2420 },
      badge: 'Хит',
      index: '01'
    },
    {
      id: 'sidamo',
      name: 'Sidamo',
      directory: 'Свет',
      directoryEn: 'LUX',
      tag: 'Светлая обжарка',
      origin: 'Эфиопия · Сидамо',
      process: 'Мытая обработка',
      roast: 'light',
      roastLabel: 'Светлая',
      notes: ['бергамот', 'персик', 'жасмин'],
      brew: ['V60', 'Аэропресс', 'Фильтр'],
      description: 'Цветочный и яркий лот. Чайное тело, цитрусовая кислотность и длинное послевкусие — как утренний свет в чашке. Раскрывается в фильтре и не любит спешки.',
      short: 'Бергамот, персик, жасмин. Светлый фильтр-кофе.',
      color: '#C58A2E',
      colorSoft: '#EBD6AE',
      image: 'assets/img/products/sidamo.png',
      gallery: ['assets/img/products/sidamo.png', 'assets/img/v60-square.jpg', 'assets/img/beans.jpg', 'assets/img/flatlay-detail.jpg'],
      price: { 1000: 2550 },
      subPrice: { 1000: 2300 },
      badge: 'Свет',
      index: '02'
    },
    {
      id: 'mariposa',
      name: 'Mariposa',
      directory: 'Зенит',
      directoryEn: 'ZENITH',
      tag: 'Средняя обжарка',
      origin: 'Колумбия · Уила',
      process: 'Мытая обработка',
      roast: 'medium',
      roastLabel: 'Средняя',
      notes: ['красное яблоко', 'какао', 'мёд'],
      brew: ['Универсальный', 'V60', 'Эспрессо'],
      description: 'Баланс сладости и кислотности. Яблочная свежесть, какао и мёд — кофе, который одинаково хорош в эспрессо и в фильтре. Наш выбор на каждый день.',
      short: 'Красное яблоко, какао, мёд. Универсальный баланс.',
      color: '#6E7446',
      colorSoft: '#D5D6BD',
      image: 'assets/img/products/mariposa.png',
      gallery: ['assets/img/products/mariposa.png', 'assets/img/espresso-crop.jpg', 'assets/img/v60-square.jpg', 'assets/img/beans-close.jpg'],
      price: { 1000: 2780 },
      subPrice: { 1000: 2500 },
      badge: 'Баланс',
      index: '03'
    }
  ],

  formats: [
    {
      id: 'subscription',
      type: 'format',
      name: 'Подписка «Солнцестояние»',
      tag: 'от 2300 ₽ / месяц',
      description: 'Кофе к вашему ритуалу. Только формат 1 кг. Выберите сорт и частоту — пауза и отмена в один клик.',
      price: 2300,
      image: 'assets/img/hero.jpg',
      badge: '−10%'
    }
  ],

  gifts: [
    {
      id: 'gift-sun',
      type: 'gift',
      name: 'Солнце в чашке',
      tag: 'Тёплый подарок',
      composition: '1 кг на выбор · керамическая чашка · открытка',
      description: 'Самый простой способ подарить утро. Собираем в крафтовую коробку с тишью и открыткой — можно подписать от руки.',
      price: 3890,
      image: 'assets/img/illustrations/gift-sun.svg',
      bg: '#EAD4B8'
    },
    {
      id: 'gift-shores',
      type: 'gift',
      name: 'Два берега',
      tag: 'Для сравнения',
      composition: '2 × 1 кг (Epico + Sidamo) · подарочная упаковка',
      description: 'Тёмная и светлая сторона кофе рядом. Идеальный набор для тех, кто хочет попробовать два разных характера в полном объеме.',
      price: 5290,
      image: 'assets/img/illustrations/gift-shores.svg',
      bg: '#E5D6BE'
    },
    {
      id: 'gift-circle',
      type: 'gift',
      name: 'Полный круг',
      tag: 'Для дома',
      composition: '1 кг на выбор · воронка V60 · 100 фильтров',
      description: 'Всё для фильтр-ритуала: большой запас кофе, воронка и фильтры. Для тех, кто варит дома каждое утро.',
      price: 3490,
      image: 'assets/img/illustrations/gift-circle.svg',
      bg: '#DDE0C8'
    },
    {
      id: 'gift-somnium',
      type: 'gift',
      name: 'Сон в подарок',
      tag: 'Три сорта',
      composition: '3 × 1 кг (Epico, Sidamo, Mariposa) · открытка · деревянная ложка',
      description: 'Три солнца в одной коробке. Полноценный набор всех характеров бренда для истинного ценителя.',
      price: 7890,
      image: 'assets/img/illustrations/gift-somnium.svg',
      bg: '#2A2119'
    }
  ],

  plans: [
    {
      id: 'plan-circle',
      name: 'Полный круг',
      weight: 1000,
      price: 2300,
      description: 'Для семьи и офиса',
      features: ['1 кг кофе в каждом заказе', 'Раз в месяц или раз в 2 месяца', 'Молотый под способ или в зёрнах', 'Бесплатная доставка'],
      featured: true
    }
  ],

  quiz: [
    {
      q: 'Как вы чаще всего варите кофе?',
      options: [
        { label: 'Эспрессо / кофемашина', value: 'espresso' },
        { label: 'V60 / фильтр', value: 'filter' },
        { label: 'Турка / мока', value: 'turkish' },
        { label: 'Пока не знаю', value: 'any' }
      ]
    },
    {
      q: 'Что вам ближе во вкусе?',
      options: [
        { label: 'Шоколад и карамель', value: 'dark' },
        { label: 'Фрукты и цветы', value: 'light' },
        { label: 'Баланс и мёд', value: 'medium' },
        { label: 'Люблю разное', value: 'any' }
      ]
    },
    {
      q: 'Какой у вас ритуал?',
      options: [
        { label: 'Быстрый утренний эспрессо', value: 'fast' },
        { label: 'Медленный фильтр на выходных', value: 'slow' },
        { label: 'Кофе в офис на всех', value: 'office' },
        { label: 'Хочу попробовать всё', value: 'explore' }
      ]
    }
  ],

  promos: {
    SOL10: { type: 'percent', value: 10, label: '−10% на заказ' },
    SOMNIUM: { type: 'shipping', value: 0, label: 'Бесплатная доставка' }
  },

  weightLabels: { 1000: '1 кг' },
  grindLabels: { beans: 'В зёрнах' },
  frequencyLabels: {
    '2weeks': 'Раз в 2 недели',
    month: 'Раз в месяц',
    '2months': 'Раз в 2 месяца'
  }
};
