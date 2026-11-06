/* ตัวหลักของแอป: เริ่มระบบ ล็อกอิน PIN เส้นทางหน้า และเมนูล่าง */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;
  LB.views = LB.views || {};

  const ROUTES = [
    [/^#\/home$/, 'home', 'home'],
    [/^#\/orders$/, 'orders', 'orders'],
    [/^#\/orders\/new$/, 'orderForm', null],
    [/^#\/order\/([^/]+)\/edit$/, 'orderForm', null],
    [/^#\/order\/([^/]+)$/, 'order', 'orders'],
    [/^#\/rounds$/, 'rounds', 'rounds'],
    [/^#\/rounds\/new$/, 'roundForm', null],
    [/^#\/round\/([^/]+)\/edit$/, 'roundForm', null],
    [/^#\/round\/([^/]+)$/, 'round', 'rounds'],
    [/^#\/production$/, 'production', 'production'],
    [/^#\/more$/, 'more', 'more'],
    [/^#\/report$/, 'report', 'more'],
    [/^#\/products$/, 'products', 'more'],
    [/^#\/materials$/, 'materials', 'more'],
    [/^#\/material\/([^/]+)$/, 'material', 'more'],
    [/^#\/recipes$/, 'recipes', 'more'],
    [/^#\/expenses$/, 'expenses', 'more'],
    [/^#\/profit$/, 'profit', 'more'],
    [/^#\/receive$/, 'receive', null],
    [/^#\/count$/, 'count', null],
    [/^#\/recipe\/([^/]+)\/edit$/, 'recipeEdit', null],
    [/^#\/recipe\/([^/]+)$/, 'recipe', 'more'],
    [/^#\/settings$/, 'settings', null],
    [/^#\/sale$/, 'sale', null]
  ];

  const NAV = [
    ['home', '#/home', 'home', 'หน้าหลัก'],
    ['orders', '#/orders', 'list', 'ออเดอร์'],
    ['rounds', '#/rounds', 'calendar', 'รอบผลิต'],
    ['production', '#/production', 'cake', 'ผลิต'],
    ['more', '#/more', 'more', 'เพิ่มเติม']
  ];

  LB.go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
  LB.back = (fallback) => { if (history.length > 1) history.back(); else LB.go(fallback || '#/home'); };

  LB.topbar = (title, backHref, right) => `<header class="topbar">
    ${backHref ? `<a class="icon-btn" href="${esc(backHref)}" data-back aria-label="กลับ">${LB.icon('back')}</a>` : '<span style="width:8px"></span>'}
    <div class="titles"><h1>${esc(title)}</h1></div>${right || ''}</header>`;

  function nav(active) {
    const el = document.getElementById('nav');
    if (!active) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = NAV.map(([key, href, icon, label]) =>
      `<a href="${href}" ${key === active ? 'aria-current="page"' : ''}>${LB.icon(icon)}${label}</a>`).join('');
  }

  let renderSeq = 0;
  async function route() {
    if (!LB.state) return;
    const hash = location.hash || '#/home';
    const path = hash.split('?')[0];
    const query = LB.qs(hash);
    let match = null;
    for (const [re, view, tab] of ROUTES) {
      const m = re.exec(path);
      if (m) { match = { view, tab, params: m.slice(1).map(decodeURIComponent) }; break; }
    }
    if (!match) { location.replace('#/home'); return; }
    nav(match.tab);
    const seq = ++renderSeq;
    const host = document.getElementById('view');
    const root = document.createElement('div');
    root.className = 'view';
    host.replaceChildren(root);
    window.scrollTo(0, 0);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-back]');
      if (b) { e.preventDefault(); LB.back(b.getAttribute('href')); }
    });
    try {
      await LB.views[match.view](root, match.params, query, () => seq === renderSeq);
    } catch (e) {
      if (seq !== renderSeq) return;
      if (e && (e.code === 'AUTH' || e.code === 'NOSTAFF')) return;
      root.innerHTML = `${LB.topbar('เกิดข้อผิดพลาด', '#/home')}<div class="page"><div class="card">
        <p style="margin:0">${esc(e.message || e)}</p>
        <button type="button" class="btn" data-retry>ลองใหม่</button></div></div>`;
      root.querySelector('[data-retry]').onclick = route;
    }
  }
  LB.reload = route;

  LB.refreshState = async () => {
    const data = await LB.api('bootstrap');
    LB.state = data;
    return data;
  };

  /* ---------------- หน้าเริ่มต้น ---------------- */

  function authScreen(html) {
    nav(null);
    LB.clearToast();
    const host = document.getElementById('view');
    host.innerHTML = `<div class="auth">${html}</div>`;
    return host.firstElementChild;
  }
  const logoImg = '<img class="logo" src="icons/logo-512.png" alt="โลโก้ Little Bake">';

  /** บทบาทของ key แบบเก่า (JWT) ใช้กันวาง service_role key ในแอป */
  function keyRole(k) {
    try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role || ''; } catch (e) { return ''; }
  }

  function configScreen() {
    const el = authScreen(`${logoImg}<h1>เชื่อมต่อฐานข้อมูลร้าน</h1>
      <form class="form" data-form>
        <div class="field"><label for="sb-url">Project URL ของ Supabase</label>
        <input id="sb-url" class="input" type="url" placeholder="https://xxxx.supabase.co" required autocomplete="off"></div>
        <div class="field"><label for="sb-key">Publishable key</label>
        <input id="sb-key" class="input" required autocomplete="off" spellcheck="false" placeholder="sb_publishable_…"></div>
        <p class="hint" style="margin:0">ดูได้ใน Supabase ตามคู่มือติดตั้ง ขั้นที่ 3</p>
        <button class="btn primary" type="submit">บันทึก</button></form>`);
    el.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = el.querySelector('#sb-url').value.trim().replace(/\/+$/, '');
      const key = el.querySelector('#sb-key').value.trim();
      if (!/^https:\/\/[^\s/]+$/.test(url)) { LB.error('Project URL ต้องขึ้นต้นด้วย https:// เช่น https://xxxx.supabase.co'); return; }
      if (/^sb_secret_/.test(key) || keyRole(key) === 'service_role') {
        LB.error('นี่คือ secret key ห้ามใส่ในแอป ให้ใช้ publishable key (หรือ anon key)');
        return;
      }
      if (key.length < 20) { LB.error('Key สั้นเกินไป ตรวจว่าคัดลอกครบ'); return; }
      LB.setSbConfig(url, key);
      LB.start();
    });
  }

  function loginScreen(message) {
    const el = authScreen(`${logoImg}<h1>เข้าสู่ระบบร้าน</h1>
      ${message ? `<p class="muted" style="max-width:360px;margin:0">${esc(message)}</p>` : ''}
      <form class="form" data-form>
        <div class="field"><label for="li-email">อีเมล</label>
        <input id="li-email" class="input" type="email" autocomplete="username" required value="${esc(LB.store.get('lb_email') || '')}"></div>
        <div class="field"><label for="li-pass">รหัสผ่าน</label>
        <input id="li-pass" class="input" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit">เข้าสู่ระบบ</button></form>
      ${window.LB_CONFIG && window.LB_CONFIG.SUPABASE_URL ? '' : '<button type="button" class="link-btn small" data-cfg>เปลี่ยนการเชื่อมต่อฐานข้อมูล</button>'}`);
    el.querySelector('[data-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = el.querySelector('#li-email').value.trim();
      try {
        await LB.busy(() => LB.signIn(email, el.querySelector('#li-pass').value));
        LB.store.set('lb_email', email);
        LB.start();
      } catch (err) { LB.error(err); }
    });
    const cfg = el.querySelector('[data-cfg]');
    if (cfg) cfg.onclick = () => { LB.clearSbConfig(); configScreen(); };
  }

  function setupScreen() {
    const el = authScreen(`${logoImg}<h1>ตั้งค่าเจ้าของร้าน</h1>
      <p class="muted" style="max-width:360px;margin:0">ทำครั้งเดียว: ใส่ชื่อ และตั้ง PIN ไว้ปลดล็อกแอปในแต่ละเครื่อง</p>
      <form class="form" data-form>
        <div class="field"><label for="su-name">ชื่อของคุณ</label><input id="su-name" class="input" required maxlength="60"></div>
        <div class="field"><label for="su-pin">ตั้ง PIN 4–6 หลัก</label>
        <input id="su-pin" class="input" type="password" inputmode="numeric" pattern="\\d{4,6}" required autocomplete="new-password">
        <span class="hint">แนะนำ 6 หลัก ที่ไม่ใช่วันเกิด</span></div>
        <div class="field"><label for="su-pin2">ใส่ PIN อีกครั้ง</label>
        <input id="su-pin2" class="input" type="password" inputmode="numeric" pattern="\\d{4,6}" required autocomplete="new-password"></div>
        <button class="btn primary" type="submit">เริ่มใช้งาน</button></form>`);
    el.querySelector('[data-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = el.querySelector('#su-pin').value;
      if (pin !== el.querySelector('#su-pin2').value) { LB.error('PIN สองช่องไม่ตรงกัน'); return; }
      try {
        await LB.busy(() => LB.rpc('setup.owner', { name: el.querySelector('#su-name').value, pin }));
        LB.start();
      } catch (err) { LB.error(err); }
    });
  }

  function noAccessScreen() {
    const el = authScreen(`${logoImg}<h1>บัญชีนี้ใช้งานร้านไม่ได้</h1>
      <p class="muted" style="max-width:360px;margin:0">${esc((LB.session() || {}).email || 'บัญชีนี้')} ยังไม่ได้เป็นผู้ใช้ของร้าน
      ถ้าเป็นบัญชีสำรองข้อมูล ใช้กับสคริปต์สำรองข้อมูลเท่านั้น</p>
      <button type="button" class="btn primary" data-out>ออกจากระบบ</button>`);
    el.querySelector('[data-out]').onclick = async () => { await LB.signOut(); LB.start(); };
  }

  function errorScreen(e) {
    const el = authScreen(`${logoImg}<h1>เชื่อมต่อไม่ได้</h1><p class="muted" style="max-width:360px;margin:0">${esc(e.message || e)}</p>
      <div class="btn-row" style="width:100%;max-width:360px"><button type="button" class="btn" data-cfg>เปลี่ยนการเชื่อมต่อ</button>
      <button type="button" class="btn primary" data-retry>ลองอีกครั้ง</button></div>`);
    el.querySelector('[data-retry]').onclick = LB.start;
    el.querySelector('[data-cfg]').onclick = async () => {
      if (!(await LB.confirm('เปลี่ยนการเชื่อมต่อ?', 'ต้องใส่ Project URL และ key ใหม่ แล้วล็อกอินอีกครั้ง', 'เปลี่ยน'))) return;
      await LB.signOut();
      LB.clearSbConfig();
      LB.start();
    };
  }

  /* ---------------- PIN ---------------- */

  const keypadHtml = () => `<div class="pin-dots" aria-hidden="true">${'<span></span>'.repeat(6)}</div>
    <p class="sr-only" aria-live="polite" data-count></p>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
      <button type="button" class="ghost" data-k="del" aria-label="ลบ">ลบ</button><button type="button" data-k="0">0</button>
      <button type="button" class="ghost" data-k="ok">ตกลง</button></div>`;

  function forgotPinSheet() {
    return new Promise((resolve) => {
      const email = (LB.session() || {}).email || '';
      const s = LB.sheet('ลืม PIN', `<p style="margin:0">ใส่รหัสผ่านของบัญชี ${esc(email)} แล้วตั้ง PIN ใหม่</p>
        <div class="field"><label for="fp-pass">รหัสผ่านบัญชี</label><input id="fp-pass" class="input" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="fp-pin">PIN ใหม่ 4–6 หลัก</label><input id="fp-pin" class="input" type="password" inputmode="numeric" autocomplete="new-password"></div>
        <div class="field"><label for="fp-pin2">ใส่ PIN ใหม่อีกครั้ง</label><input id="fp-pin2" class="input" type="password" inputmode="numeric" autocomplete="new-password"></div>
        <button type="button" class="btn primary" data-save>ตั้ง PIN ใหม่</button>`);
      s.el.querySelector('[data-save]').onclick = async () => {
        const pin = s.el.querySelector('#fp-pin').value;
        if (pin !== s.el.querySelector('#fp-pin2').value) { LB.error('PIN ใหม่สองช่องไม่ตรงกัน'); return; }
        try {
          await LB.busy(async () => {
            await LB.signIn(email, s.el.querySelector('#fp-pass').value);
            await LB.rpc('pin.reset', { pin });
          });
          s.close();
          LB.toast('ตั้ง PIN ใหม่แล้ว');
          resolve(true);
        } catch (e) { LB.error(e); }
      };
    });
  }

  /** หน้าใส่ PIN ทับหน้าจอเดิม ปลดล็อกแล้วหน้าจอเดิมทำงานต่อ */
  let pinPromise = null;
  LB.pinGate = () => {
    if (pinPromise) return pinPromise;
    pinPromise = new Promise((resolve, reject) => {
      const wrap = document.createElement('div');
      wrap.className = 'pin-overlay';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-label', 'ใส่ PIN');
      const name = LB.store.get('lb_user_name') || '';
      wrap.innerHTML = `<div class="auth">${logoImg}<h1>ใส่ PIN</h1>
        <p class="muted" style="margin:0">${esc(name || (LB.session() || {}).email || '')}</p>
        ${keypadHtml()}
        <div class="row" style="gap:20px;justify-content:center">
          <button type="button" class="link-btn small" data-forgot>ลืม PIN</button>
          <button type="button" class="link-btn small" data-out>ออกจากระบบ</button></div></div>`;
      document.body.appendChild(wrap);
      LB.clearToast();
      let pin = '';
      let busy = false;
      const dots = wrap.querySelectorAll('.pin-dots span');
      const paint = () => {
        dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
        wrap.querySelector('[data-count]').textContent = pin.length ? 'ใส่แล้ว ' + pin.length + ' หลัก' : '';
      };
      const finish = (err) => {
        document.removeEventListener('keydown', onKey);
        wrap.remove();
        pinPromise = null;
        if (err) reject(err); else resolve();
      };
      const submit = async () => {
        if (pin.length < 4 || busy) return;
        busy = true;
        try {
          const r = await LB.busy(() => LB.rpc('pin.verify', { pin }));
          if (r.ok) {
            if (r.user) LB.store.set('lb_user_name', r.user.name);
            finish(null);
            return;
          }
          pin = ''; paint();
          LB.error(r.error);
        } catch (e) {
          pin = ''; paint();
          if (e.code === 'AUTH') { const err = new Error(e.message); err.code = 'AUTH'; finish(err); LB.logout(); return; }
          LB.error(e);
        } finally { busy = false; }
      };
      const press = (k) => {
        if (k === 'del') pin = pin.slice(0, -1);
        else if (k === 'ok') { submit(); return; }
        else if (/^\d$/.test(k) && pin.length < 6) pin += k;
        paint();
        if (pin.length === 6) submit();
      };
      function onKey(e) {
        if (document.querySelector('.sheet-backdrop')) return;
        if (/^\d$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') press('del');
        else if (e.key === 'Enter') press('ok');
      }
      document.addEventListener('keydown', onKey);
      wrap.querySelector('.keypad').addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (b) press(b.dataset.k);
      });
      wrap.querySelector('[data-forgot]').onclick = async () => { if (await forgotPinSheet()) finish(null); };
      wrap.querySelector('[data-out]').onclick = () => {
        const err = new Error('ออกจากระบบแล้ว');
        err.code = 'AUTH';
        err.handled = true;
        finish(err);
        LB.logout();
      };
    });
    return pinPromise;
  };

  /* ---------------- เริ่มระบบ ---------------- */

  LB.start = async () => {
    LB.state = null;
    if (!LB.sbConfig()) { configScreen(); return; }
    if (!LB.session()) { loginScreen(); return; }
    authScreen(`${logoImg}${LB.loadingHtml}`);
    try {
      const st = await LB.rpc('app.status');
      if (st.needsSetup) { setupScreen(); return; }
      if (!st.isStaff) { noAccessScreen(); return; }
      if (st.user) LB.store.set('lb_user_name', st.user.name);
      LB.state = await LB.api('bootstrap');
      route();
    } catch (e) {
      if (e.handled) return;
      if (e.code === 'AUTH') { await LB.signOut(); loginScreen('กรุณาเข้าสู่ระบบอีกครั้ง'); return; }
      if (e.code === 'NOSTAFF') { noAccessScreen(); return; }
      errorScreen(e);
    }
  };

  /** ล็อกแอป: ต้องใส่ PIN ก่อนใช้ต่อ */
  LB.lockApp = async () => {
    try { await LB.busy(() => LB.rpc('lock')); } catch (e) { LB.error(e); return; }
    LB.start();
  };

  /** ออกจากระบบ: ต้องใช้อีเมลและรหัสผ่านเมื่อกลับมา */
  LB.logout = async () => {
    try { await LB.rpc('lock'); } catch (e) { /* ไม่เป็นไร */ }
    await LB.signOut();
    LB.state = null;
    LB.start();
  };

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', () => {
    if (!location.hash) history.replaceState(null, '', '#/home');
    LB.start();
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* ไม่มี service worker ก็ใช้งานได้ */ });
    }
  });
})();
