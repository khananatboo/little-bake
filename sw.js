/* เก็บไฟล์หน้าแอปไว้ในเครื่อง เปิดเร็วขึ้น (ข้อมูลร้านยังดึงจาก Supabase ทุกครั้ง) */
const CACHE = 'little-bake-2.6.1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css?v=2.6.1',
  'js/config.js?v=2.6.1', 'js/util.js?v=2.6.1', 'js/api.js?v=2.6.1', 'js/ui.js?v=2.6.1', 'js/qr.js?v=2.6.1',
  'js/promptpay.js?v=2.6.1', 'js/share.js?v=2.6.1', 'js/views/home.js?v=2.6.1', 'js/views/orders.js?v=2.6.1',
  'js/views/order-form.js?v=2.6.1', 'js/views/rounds.js?v=2.6.1', 'js/views/production.js?v=2.6.1',
  'js/views/more.js?v=2.6.1', 'js/views/kitchen.js?v=2.6.1', 'js/views/stock.js?v=2.6.1', 'js/views/money.js?v=2.6.1', 'js/app.js?v=2.6.1',
  'icons/logo-192.png', 'icons/logo-512.png', 'icons/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // config.js ดึงใหม่ก่อนเสมอ เผื่อเพิ่งแก้ที่อยู่ API
  if (url.pathname.endsWith('/js/config.js')) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
