/* ขายหน้าร้าน (POS): หน้าขาย บิล รับเงิน และรับของพรีออเดอร์ */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  /* ---------- ลำดับเมนู ---------- */

  const SIZE = / (1\/2|\d+(?:\.\d+)?) ปอนด์$| \(ชิ้น\)$/;
  const baseOf = (n) => n.replace(SIZE, '');
  /** ขนาดจากชื่อเมนู: (ชิ้น) = 0, 1/2 ปอนด์ = 0.5, ไม่มีขนาด = -1 */
  const sizeOf = (n) => {
    const m = SIZE.exec(n);
    if (!m) return -1;
    if (!m[1]) return 0;
    return m[1] === '1/2' ? 0.5 : Number(m[1]);
  };
  const isPound = (n) => /ปอนด์/.test(n);
  const isDrink = (m) => m.category === 'เครื่องดื่ม';
  /** พร้อมขายก่อน แล้ว ก-ฮ ตามด้วย A-Z (ไม่นับขนาด) แล้วขนาดเล็กไปใหญ่ */
  const byMenu = (a, b) => (a.off - b.off) || LB.byName(baseOf(a.name), baseOf(b.name)) || (sizeOf(a.name) - sizeOf(b.name));
  /** หมวดขนมเป็นปอนด์: พร้อมขายก่อน แล้วขนาดเล็กไปใหญ่ */
  const bySize = (a, b) => (a.off - b.off) || (sizeOf(a.name) - sizeOf(b.name)) || LB.byName(a.name, b.name);

  /** สีพื้นแทนรูปเมนู (ขนมเดียวกันทุกขนาดใช้สีเดียวกัน) */
  const TINTS = ['#f1dcb8', '#edd285', '#e7d6c4', '#d9d0e6', '#dccbbd', '#eadfcf', '#efe3bf', '#f3d9d6', '#e2cfc0', '#dde5cf'];
  const tintOf = (s) => {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return TINTS[h % TINTS.length];
  };
  const initialOf = (name) => (String(name || '').match(/[ก-ฮA-Za-z0-9]/) || ['?'])[0];
  const LOGO = 'icons/logo-round-256.png';

  /** ปุ่มเงินที่ลูกค้ามักยื่นให้: พอดี แล้วปัดขึ้นเป็นหลักร้อย ห้าร้อย พัน */
  function quickAmounts(total) {
    const list = [[total, 'พอดี']];
    for (const step of [100, 500, 1000]) {
      const v = Math.ceil(total / step) * step;
      if (v > total && !list.some(([x]) => x === v)) list.push([v, LB.money(v)]);
    }
    if (total < 1000 && !list.some(([x]) => x === 1000)) list.push([1000, LB.money(1000)]);
    return list.slice(0, 4);
  }

  function drawQr(canvas, amount) {
    const ctx = canvas.getContext('2d');
    const payload = window.LBPromptPay.payload(LB.state.settings.promptpay_id, amount);
    window.LBQR.draw(ctx, payload, 0, 0, canvas.width, '#000000', '#ffffff');
  }

  LB.views.sale = async (root, params, query, alive) => {
    root.innerHTML = LB.loadingHtml;
    const user = LB.state.user || {};
    const shop = (LB.state.settings || {}).shop_name || 'little bake.';
    const st = {
      menu: [], cart: new Map(), orders: null,
      tab: query.tab === 'pickup' ? 'pickup' : 'sell', step: 'menu',
      cat: 'all', q: '', pq: '', name: '', disc: '',
      method: 'cash', recv: '', tipKeep: false, qrAt: 0
    };

    async function loadMenu() {
      const [prods, stock] = await Promise.all([LB.api('products.list'), LB.api('stock.list')]);
      const byId = new Map(stock.stock.map((x) => [x.product_id, x]));
      st.menu = prods.filter((p) => p.status === 'active').map((p) => {
        const s = byId.get(p.id) || { free: 0, physical: 0, batches: [] };
        const disc = LB.n((s.batches.find((b) => LB.n(b.discount_price) > 0 && b.state !== 'expired') || {}).discount_price);
        const free = Math.max(0, LB.n(s.free));
        return {
          id: p.id, name: p.name, unit: p.unit, category: p.category || 'เบเกอรี่', group: p.group_name || p.name,
          price: LB.n(p.price), sell: disc || LB.n(p.price), discounted: !!disc,
          free, physical: LB.n(s.physical), off: free > 0 ? 0 : 1
        };
      });
      for (const [id, qty] of [...st.cart]) {
        const m = st.menu.find((x) => x.id === id);
        if (!m || m.free <= 0) st.cart.delete(id);
        else if (qty > m.free) st.cart.set(id, m.free);
      }
    }
    async function loadOrders() {
      const list = await LB.api('orders.list', { days: 1 });
      st.orders = list.filter((o) => o.kind !== 'walkin' && LB.ACTIVE.includes(o.status));
    }
    await Promise.all([loadMenu(), loadOrders()]);
    if (!alive()) return;

    /* ---------- คำนวณบิล ---------- */

    const lines = () => [...st.cart].map(([id, qty]) => ({ m: st.menu.find((x) => x.id === id), qty })).filter((l) => l.m && l.qty > 0);
    const totals = () => {
      const ls = lines();
      const sub = ls.reduce((s, l) => s + l.qty * l.m.sell, 0);
      const disc = Math.min(sub, Math.max(0, LB.n(st.disc)));
      return { sub, disc, total: Math.round((sub - disc) * 100) / 100, count: ls.reduce((s, l) => s + l.qty, 0) };
    };
    const dueToday = () => (st.orders || []).filter((o) => !o.due_date || o.due_date <= LB.today());

    /* ---------- หน้าเลือกเมนู ---------- */

    function head() {
      const n = dueToday().length;
      return `<header class="pos-head">
        <a class="icon-btn" href="#/home" aria-label="กลับหน้าหลัก">${LB.icon('back')}</a>
        <div class="pos-brand"><img class="pos-logo" src="${LOGO}" alt="" width="40" height="40"><h1>${esc(shop)}</h1></div>
        <div class="seg pos-tabs" data-name="tab" role="group">
          <button type="button" data-val="sell" aria-pressed="${st.tab === 'sell'}">ขายหน้าร้าน</button>
          <button type="button" data-val="pickup" aria-pressed="${st.tab === 'pickup'}">รับของพรีออเดอร์${n ? ` <span class="count">${n}</span>` : ''}</button>
        </div>
        <span class="pos-user" title="คนขาย: ${esc(user.name || '')}"><span class="av" aria-hidden="true">${esc(initialOf(user.name))}</span><span class="nm"><span class="sr-only">คนขาย </span>${esc(user.name || '')}</span></span>
      </header>`;
    }

    function tile(m) {
      const qty = st.cart.get(m.id) || 0;
      const left = m.free > 0 ? `เหลือ ${m.free}` : (m.physical > 0 ? 'จองหมดแล้ว' : 'หมด');
      const label = `${m.name} ${LB.baht(m.sell)} ${left}${qty ? ` ในบิล ${qty}` : ''}`;
      return `<button type="button" class="tile-p${qty ? ' in' : ''}" data-add="${esc(m.id)}" aria-label="${esc(label)}"${m.off ? ' aria-disabled="true"' : ''}>
        <span class="ph" aria-hidden="true" style="background:${m.off ? '#e4e1dc' : tintOf(m.group)}"></span>
        <span class="nm">${esc(m.name)}</span>
        <span class="ft"><span class="pr">${m.discounted ? `<s>${LB.money(m.price)}</s> ` : ''}${LB.baht(m.sell)}</span><span class="lf">${esc(left)}</span></span>
        ${qty ? `<span class="qty" aria-hidden="true">× ${qty}</span>` : ''}</button>`;
    }

    function catList() {
      const list = [['all', 'ทั้งหมด', 0]];
      const pound = st.menu.filter((m) => isPound(m.name)).length;
      if (pound) list.push(['pound', 'ขนมเป็นปอนด์', pound]);
      const cats = [...new Set(st.menu.map((m) => m.category))].sort((a, b) => (a === 'เครื่องดื่ม') - (b === 'เครื่องดื่ม') || LB.byName(a, b));
      if (cats.length > 1) cats.forEach((c) => list.push([c, c, 0]));
      if (!list.some(([k]) => k === st.cat)) st.cat = 'all';
      return list;
    }

    function sectionsHtml() {
      const q = st.q.toLowerCase();
      const shown = st.menu.filter((m) => !q || m.name.toLowerCase().includes(q));
      if (!st.menu.length) return '<div class="empty">ยังไม่มีเมนูที่เปิดขาย เพิ่มเมนูได้ที่ เพิ่มเติม > เมนูและราคา</div>';
      const grid = (list) => `<div class="pos-grid">${list.map(tile).join('')}</div>`;
      const sec = (title, list) => (list.length ? `<section class="group"><h2>${esc(title)}</h2>${grid(list)}</section>` : '');
      let html;
      if (st.cat === 'pound') {
        html = sec('ขนมเป็นปอนด์ · ขนาดเล็กไปใหญ่', shown.filter((m) => isPound(m.name)).sort(bySize));
      } else if (st.cat === 'all') {
        html = sec('เบเกอรี่', shown.filter((m) => !isDrink(m)).sort(byMenu)) + sec('เครื่องดื่ม', shown.filter(isDrink).sort(byMenu));
      } else {
        html = sec(st.cat, shown.filter((m) => m.category === st.cat).sort(byMenu));
      }
      return html || '<div class="empty">ไม่พบเมนูที่ค้นหา</div>';
    }

    function cartHtml() {
      const ls = lines();
      const t = totals();
      return `${st.step === 'bill' ? `<button type="button" class="btn small" data-to-menu style="align-self:flex-start">${LB.icon('back')}เลือกเมนูต่อ</button>` : ''}
        <div class="row between"><h2>บิลหน้าร้าน</h2>${ls.length ? '<button type="button" class="btn small" data-clear>ล้างบิล</button>' : ''}</div>
        ${ls.length ? `<div class="cart-lines">${ls.map((l) => `<div class="cart-line" data-line="${esc(l.m.id)}">
            <div class="nm"><span class="label">${esc(l.m.name)}</span><span class="small muted">${LB.baht(l.m.sell)} × ${l.qty} = ${LB.baht(l.m.sell * l.qty)}</span></div>
            ${LB.stepper('q', l.qty, 0, l.m.free, ' ' + l.m.name)}</div>`).join('')}</div>`
          : '<div class="empty small" style="padding:24px 8px">แตะเมนูเพื่อเพิ่มลงบิล</div>'}
        <div class="grid2">
          <div class="field"><label for="ps-name">ชื่อลูกค้า</label><input id="ps-name" class="input" maxlength="80" placeholder="ไม่บังคับ" value="${esc(st.name)}"></div>
          <div class="field"><label for="ps-disc">ส่วนลด (บาท)</label><input id="ps-disc" class="input" type="text" inputmode="decimal" placeholder="0" value="${esc(st.disc)}"></div>
        </div>
        <div class="stack tight">
          <div class="kv"><span>ค่าขนม ${t.count ? `${t.count} ชิ้น` : ''}</span><span data-sub>${LB.baht(t.sub)}</span></div>
          <div class="kv" data-disc-row ${t.disc ? '' : 'hidden'}><span>ส่วนลด</span><span data-disc>−${LB.baht(t.disc)}</span></div>
          <div class="kv total"><span>ยอดที่ต้องจ่าย</span><span class="num money pos-total" data-total>${LB.baht(t.total)}</span></div>
        </div>
        <button type="button" class="btn primary big" data-pay ${t.count ? '' : 'disabled'}>รับเงิน</button>`;
    }

    function barHtml() {
      const t = totals();
      return `<div class="grow stack tight" style="gap:0"><span class="small muted">${t.count ? `${t.count} ชิ้นในบิล` : 'ยังไม่มีของในบิล'}</span>
        <span class="num money" style="font-size:22px;line-height:28px">${LB.baht(t.total)}</span></div>
        <button type="button" class="btn primary" data-bill ${t.count ? '' : 'disabled'}>ดูบิลและรับเงิน</button>`;
    }

    /* ---------- รับของพรีออเดอร์ ---------- */

    function orderCard(o) {
      const today = LB.today();
      const late = o.due_date && o.due_date < today;
      const when = o.due_date ? `${LB.dateTh(o.due_date)}${o.due_time ? ' ' + o.due_time : ''}` : 'ยังไม่กำหนดวัน';
      return `<article class="card tight">
        <div class="row between"><span class="label">${esc(o.customer_name)} <span class="small muted">· ${esc(LB.L.channel[o.channel] || o.channel || '')}</span></span>
          <span class="row" style="gap:4px">${late ? '<span class="badge warn">เลยวันรับ</span>' : ''}${LB.badge(o.status)}</span></div>
        <span>${esc(LB.itemsText(o.items))}</span>
        <div class="row between small muted"><span>${esc(LB.L.handover[o.handover] || '')} · ${esc(when)}</span><span>${esc(o.id)}</span></div>
        <div class="row between wrap" style="gap:8px">
          <span class="${LB.n(o.balance) > 0 ? 'warn-text' : 'small muted'}">${LB.n(o.balance) > 0 ? `ค้างจ่าย ${LB.baht(o.balance)}` : 'จ่ายครบแล้ว'}</span>
          <span class="row" style="gap:8px"><a class="btn small" href="#/order/${encodeURIComponent(o.id)}">ดูออเดอร์</a>
          <button type="button" class="btn small" style="font-weight:600" data-deliver="${esc(o.id)}">ส่งมอบ</button></span></div>
      </article>`;
    }

    function pickupHtml() {
      const q = st.pq.toLowerCase();
      const match = (o) => !q || [o.customer_name, o.id, o.phone, LB.itemsText(o.items)].join(' ').toLowerCase().includes(q);
      const today = LB.today();
      const now = (st.orders || []).filter((o) => (!o.due_date || o.due_date <= today) && match(o));
      const later = (st.orders || []).filter((o) => o.due_date && o.due_date > today && match(o));
      return `<label class="sr-only" for="pk-q">ค้นหาออเดอร์</label>
        <input id="pk-q" class="input" type="search" placeholder="ค้นหาชื่อลูกค้า เมนู หรือเลขออเดอร์" value="${esc(st.pq)}">
        <section class="group"><h2>ถึงวันรับแล้ว <span class="small muted">${now.length}</span></h2>
          ${now.length ? now.map(orderCard).join('') : '<div class="empty small">ไม่มีออเดอร์ที่ต้องส่งมอบวันนี้</div>'}</section>
        ${later.length ? `<section class="group"><h2>รับวันถัดไป <span class="small muted">${later.length}</span></h2>${later.map(orderCard).join('')}</section>` : ''}`;
    }

    /* ---------- หน้ารับเงิน ---------- */

    function payHtml() {
      const ls = lines();
      const t = totals();
      const nowText = new Date().toLocaleString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<div class="pay">
        <section class="card pay-bill">
          <button type="button" class="btn small" data-to-menu style="align-self:flex-start">${LB.icon('back')}กลับไปแก้บิล</button>
          <h2>บิลหน้าร้าน</h2>
          <span class="small muted">${esc(nowText)} · ขายโดย ${esc(user.name || '')}${st.name ? ' · ' + esc(st.name) : ''}</span>
          <table class="data"><tbody>${ls.map((l) => `<tr><td>${esc(l.m.name)} × ${l.qty}</td><td class="r">${LB.baht(l.qty * l.m.sell)}</td></tr>`).join('')}</tbody></table>
          ${t.disc ? `<div class="kv"><span>ส่วนลด</span><span>−${LB.baht(t.disc)}</span></div>` : ''}
          <div class="kv total"><span>ยอดที่ต้องจ่าย</span><span class="num money pos-total">${LB.baht(t.total)}</span></div>
        </section>
        <section class="pay-panel">
          ${LB.choiceHtml('seg', 'method', [['cash', 'เงินสด'], ['promptpay', 'PromptPay'], ['transfer', 'โอน / อื่น ๆ']], st.method)}
          <div class="stack" data-pane></div>
          <p class="hint" style="margin:0">ก่อนกดปุ่มนี้ ระบบยังไม่บันทึกการขายและยังไม่ตัดขนมจากตู้</p>
          <button type="button" class="btn primary big" data-close-bill></button>
        </section>
      </div>`;
    }

    function cashPane(total) {
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
      return `<div class="field"><label for="cash-in">รับเงินมา (บาท)</label>
          <input id="cash-in" class="input cash-in" type="text" inputmode="none" autocomplete="off" value="${esc(st.recv)}" placeholder="${esc(LB.money(total))}"></div>
        <div class="quick">${quickAmounts(total).map(([v, label]) => `<button type="button" class="btn" data-quick="${v}">${esc(label)}</button>`).join('')}</div>
        <div class="keypad-pos">${keys.map((k) => `<button type="button" data-key="${k}" aria-label="${k === 'del' ? 'ลบตัวเลขตัวท้าย' : 'ตัวเลข ' + k}">${k === 'del' ? 'ลบ' : k}</button>`).join('')}</div>
        <div class="change" data-change aria-live="polite"></div>
        <label class="row" data-tip-row hidden style="gap:12px;min-height:44px"><input type="checkbox" class="check" data-tip ${st.tipKeep ? 'checked' : ''}>ลูกค้าไม่รับเงินทอน เก็บเป็นทิป</label>`;
    }

    function promptpayPane(total) {
      const s = LB.state.settings || {};
      if (!String(s.promptpay_id || '').replace(/\D/g, '')) {
        return `<div class="card stack tight"><p style="margin:0">ยังไม่ได้ใส่ PromptPay ID ของร้าน</p>
          <a class="btn" href="#/settings">ไปหน้าตั้งค่าร้าน</a></div>`;
      }
      return `<div class="card qr-pos">
          <div class="row" style="gap:8px;align-self:stretch"><img class="pos-logo" src="${LOGO}" alt="" width="40" height="40"><span class="label">สแกนจ่ายด้วย PromptPay</span></div>
          <canvas data-qr width="580" height="580" role="img" aria-label="QR PromptPay ยอด ${esc(LB.money(total))} บาท"></canvas>
          <span class="num money pos-total">${LB.baht(total)}</span>
          <span class="small muted">${esc(shop)} · PromptPay ${esc(window.LBPromptPay.maskId(s.promptpay_id))}</span>
        </div>
        <div class="btn-row"><button type="button" class="btn" data-full>${LB.icon('expand')}เต็มจอให้ลูกค้า</button>
          <button type="button" class="btn" data-share-qr>${LB.icon('share')}แชร์รูป QR</button></div>
        <span class="wait-pill" data-wait>${LB.icon('clock')}<span data-wait-text>รอลูกค้าโอน</span></span>
        <div class="alert-box">${LB.icon('alert')}<span><b>ดูแค่สลิปบนมือถือลูกค้าไม่พอ</b> สลิปปลอมทำได้ง่าย ให้ดูแจ้งเตือนเงินเข้าในแอปธนาคารของร้านทุกครั้ง</span></div>`;
    }

    function transferPane() {
      return `<div class="card stack tight"><span class="label">โอนเข้าบัญชีร้าน หรือจ่ายช่องทางอื่น</span>
        <span class="small muted">ดูว่าเงินเข้าแล้วในแอปธนาคารของร้าน ก่อนกดปิดบิล</span></div>`;
    }

    /** เงินสด: คิดเงินทอน */
    function cashState() {
      const t = totals();
      const recv = st.recv === '' ? t.total : LB.n(st.recv);
      return { total: t.total, recv, change: Math.round((recv - t.total) * 100) / 100 };
    }
    function paintCash() {
      const box = root.querySelector('[data-change]');
      if (!box) return;
      const c = cashState();
      box.className = 'change' + (c.change < 0 ? ' short' : '');
      box.innerHTML = c.change < 0
        ? `<span>ยังขาดอีก</span><span class="num">${LB.baht(-c.change)}</span>`
        : `<span>เงินทอน</span><span class="num">${LB.baht(st.tipKeep ? 0 : c.change)}</span>`;
      const tipRow = root.querySelector('[data-tip-row]');
      tipRow.hidden = !(c.change > 0);
      if (c.change <= 0) st.tipKeep = false;
      root.querySelector('[data-close-bill]').disabled = c.change < 0;
      root.querySelectorAll('[data-quick]').forEach((b) => b.setAttribute('aria-pressed', String(st.recv !== '' && LB.n(st.recv) === Number(b.dataset.quick))));
    }

    let waitTimer = null;
    function paintPane() {
      const pane = root.querySelector('[data-pane]');
      const t = totals();
      clearInterval(waitTimer);
      const btn = root.querySelector('[data-close-bill]');
      btn.disabled = false;
      if (st.method === 'cash') {
        pane.innerHTML = cashPane(t.total);
        btn.textContent = 'ได้รับเงินแล้ว ปิดบิล';
        paintCash();
      } else if (st.method === 'promptpay') {
        pane.innerHTML = promptpayPane(t.total);
        btn.textContent = 'เงินเข้าแล้ว ปิดบิล';
        const cv = pane.querySelector('[data-qr]');
        if (cv) {
          drawQr(cv, t.total);
          if (!st.qrAt) st.qrAt = Date.now();
          const tick = () => {
            if (!alive() || !document.body.contains(cv)) { clearInterval(waitTimer); return; }
            const sec = Math.floor((Date.now() - st.qrAt) / 1000);
            const el = pane.querySelector('[data-wait-text]');
            if (el) el.textContent = `รอลูกค้าโอน · เปิด QR มา ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
          };
          tick();
          waitTimer = setInterval(tick, 1000);
        } else {
          btn.disabled = true;
        }
      } else {
        pane.innerHTML = transferPane();
        btn.textContent = 'เงินเข้าแล้ว ปิดบิล';
      }
    }

    /** QR เต็มจอ หันให้ลูกค้าสแกน แตะค้างเพื่อกลับ ลูกค้าจะได้ไม่เผลอปิด */
    function openFull() {
      const t = totals();
      const ov = document.createElement('div');
      ov.className = 'qr-full';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', 'QR สำหรับลูกค้าสแกนจ่าย');
      ov.innerHTML = `<div class="qr-full-card"><canvas width="720" height="720" role="img" aria-label="QR PromptPay ยอด ${esc(LB.money(t.total))} บาท"></canvas></div>
        <div class="qr-full-info">
          <img class="qr-full-logo" src="${LOGO}" alt="${esc(shop)}" width="128" height="128">
          <h2>สแกนจ่ายด้วย PromptPay</h2>
          <div class="stack tight" style="gap:0"><span class="muted">ยอดที่ต้องจ่าย</span><span class="num money qr-full-amt">${LB.baht(t.total)}</span></div>
          <div class="qr-full-lines">${lines().map((l) => `<div class="kv"><span>${esc(l.m.name)} × ${l.qty}</span><span>${LB.baht(l.qty * l.m.sell)}</span></div>`).join('')}</div>
          <span class="muted">สแกนด้วยแอปธนาคารใดก็ได้ ยอดเงินขึ้นให้เอง ขอบคุณที่อุดหนุน</span>
        </div>
        <button type="button" class="btn small qr-full-back">แตะค้างเพื่อกลับ (คนขาย)</button>`;
      document.body.appendChild(ov);
      document.body.style.overflow = 'hidden';
      drawQr(ov.querySelector('canvas'), t.total);
      const close = () => {
        ov.remove();
        if (!document.querySelector('.sheet-backdrop')) document.body.style.overflow = '';
        const b = root.querySelector('[data-full]');
        if (b) b.focus();
      };
      const back = ov.querySelector('.qr-full-back');
      let hold = null;
      const start = (e) => { e.preventDefault(); clearTimeout(hold); hold = setTimeout(close, 600); };
      const stop = () => clearTimeout(hold);
      back.addEventListener('pointerdown', start);
      back.addEventListener('pointerup', stop);
      back.addEventListener('pointerleave', stop);
      back.addEventListener('pointercancel', stop);
      back.addEventListener('contextmenu', (e) => e.preventDefault());
      back.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(); } });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      back.focus();
      const watch = setInterval(() => { if (!alive()) { clearInterval(watch); close(); } else if (!document.body.contains(ov)) clearInterval(watch); }, 500);
    }

    async function closeBill() {
      const t = totals();
      const items = lines().map((l) => ({ product_id: l.m.id, qty: l.qty }));
      if (!items.length) { LB.error('ยังไม่มีของในบิล'); return; }
      let tip = 0;
      let note = '';
      if (st.method === 'cash') {
        const c = cashState();
        if (c.change < 0) { LB.error('รับเงินมาไม่พอ'); return; }
        if (st.tipKeep && c.change > 0) tip = c.change;
        if (st.recv !== '' && c.change !== 0) note = st.tipKeep ? `รับเงินสด ${LB.money(c.recv)} บาท ไม่รับเงินทอน ${LB.money(c.change)} บาท เก็บเป็นทิป` : `รับเงินสด ${LB.money(c.recv)} บาท ทอน ${LB.money(c.change)} บาท`;
      }
      try {
        const o = await LB.busy(() => LB.api('sales.quick', {
          items, method: st.method, customer_name: st.name, discount: t.disc || '', tip: tip || '', note
        }));
        LB.toast(`ปิดบิลแล้ว ${LB.baht(LB.n(o.total) + LB.n(o.tip))}`);
        st.cart.clear();
        Object.assign(st, { name: '', disc: '', step: 'menu', recv: '', tipKeep: false, qrAt: 0, method: 'cash' });
        await loadMenu();
        if (!alive()) return;
        paint();
      } catch (e) { LB.error(e); }
    }

    /* ---------- วาดหน้า ---------- */

    function paintMenu() {
      const el = root.querySelector('[data-sections]');
      if (el) el.innerHTML = sectionsHtml();
    }
    function paintCart() {
      const el = root.querySelector('[data-cart]');
      if (el) el.innerHTML = cartHtml();
      const bar = root.querySelector('[data-bar]');
      if (bar) bar.innerHTML = barHtml();
    }
    function paintTotals() {
      const t = totals();
      const q = (s) => root.querySelector(s);
      if (!q('[data-total]')) return;
      q('[data-sub]').textContent = LB.baht(t.sub);
      q('[data-disc]').textContent = '−' + LB.baht(t.disc);
      q('[data-disc-row]').hidden = !t.disc;
      q('[data-total]').textContent = LB.baht(t.total);
      const bar = q('[data-bar]');
      if (bar) bar.innerHTML = barHtml();
    }
    function paintPickup() {
      const el = root.querySelector('[data-pickup]');
      if (el) el.innerHTML = pickupHtml();
    }

    function paint() {
      clearInterval(waitTimer);
      const wrap = document.createElement('div');
      wrap.className = 'pos';
      wrap.dataset.screen = st.step;
      wrap.dataset.tab = st.tab;
      if (st.step === 'pay') {
        wrap.innerHTML = head() + payHtml();
      } else {
        const chips = catList();
        wrap.innerHTML = `${head()}<div class="pos-body">
          <section class="pos-menu" ${st.tab === 'sell' ? '' : 'hidden'}>
            <label class="sr-only" for="ps-q">ค้นหาเมนู</label>
            <input id="ps-q" class="input" type="search" placeholder="ค้นหาเมนู" value="${esc(st.q)}">
            <div class="chips scroll" data-cats>${chips.map(([k, label, n]) => `<button type="button" class="chip" data-cat="${esc(k)}" aria-pressed="${k === st.cat}">${esc(label)}${n ? ` <span class="count">${n}</span>` : ''}</button>`).join('')}</div>
            <div class="stack" data-sections>${sectionsHtml()}</div>
          </section>
          <section class="pos-menu" data-pickup ${st.tab === 'pickup' ? '' : 'hidden'}>${pickupHtml()}</section>
          <aside class="pos-cart" data-cart aria-label="บิลหน้าร้าน">${cartHtml()}</aside>
        </div>
        <div class="pos-bar" data-bar>${barHtml()}</div>`;
      }
      root.replaceChildren(wrap);
      LB.bindChoice(wrap, '.pos-tabs', (n, v) => {
        st.tab = v;
        if (st.step === 'pay') st.step = 'menu';
        paint();
        if (v === 'pickup') loadOrders().then(() => { if (alive()) { paintPickup(); refreshTabCount(); } }).catch(LB.error);
      });
      if (st.step === 'pay') {
        LB.bindChoice(wrap, '[data-name="method"]', (n, v) => { st.method = v; paintPane(); });
        paintPane();
      }
      window.scrollTo(0, 0);
    }
    function refreshTabCount() {
      const b = root.querySelector('.pos-tabs [data-val="pickup"]');
      const n = dueToday().length;
      if (b) b.innerHTML = `รับของพรีออเดอร์${n ? ` <span class="count">${n}</span>` : ''}`;
    }

    /* ---------- การกด ---------- */

    const setQty = (id, qty) => {
      const m = st.menu.find((x) => x.id === id);
      if (!m) return;
      const v = Math.max(0, Math.min(m.free, Math.round(qty) || 0));
      if (v) st.cart.set(id, v); else st.cart.delete(id);
    };

    root.addEventListener('click', async (e) => {
      const t = e.target;
      const add = t.closest('[data-add]');
      if (add) {
        const m = st.menu.find((x) => x.id === add.dataset.add);
        if (!m) return;
        if (m.off) { LB.toast(`${m.name} ${m.physical > 0 ? 'จองหมดแล้ว' : 'หมดแล้ว'}`); return; }
        const have = st.cart.get(m.id) || 0;
        if (have >= m.free) { LB.toast(`${m.name} เหลือในตู้ ${m.free} ${m.unit}`); return; }
        setQty(m.id, have + 1);
        paintMenu();
        paintCart();
        const again = root.querySelector(`[data-add="${CSS.escape(m.id)}"]`);
        if (again) again.focus();
        return;
      }
      const step = t.closest('[data-step]');
      if (step) {
        const line = step.closest('[data-line]');
        setQty(line.dataset.line, (st.cart.get(line.dataset.line) || 0) + Number(step.dataset.step));
        paintMenu();
        paintCart();
        const keep = root.querySelector(`[data-line="${CSS.escape(line.dataset.line)}"] [data-step="${step.dataset.step}"]`);
        if (keep) keep.focus();
        return;
      }
      const cat = t.closest('[data-cat]');
      if (cat) {
        st.cat = cat.dataset.cat;
        root.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === cat)));
        paintMenu();
        return;
      }
      if (t.closest('[data-clear]')) {
        if (!(await LB.confirm('ล้างบิล', 'เอาของทั้งหมดออกจากบิลนี้ไหม', 'ล้างบิล', true))) return;
        st.cart.clear();
        st.disc = '';
        paintMenu();
        paintCart();
        return;
      }
      if (t.closest('[data-bill]')) { st.step = 'bill'; paint(); return; }
      if (t.closest('[data-to-menu]')) { st.step = 'menu'; st.qrAt = 0; paint(); return; }
      if (t.closest('[data-pay]')) {
        if (!totals().count) return;
        st.step = 'pay';
        st.recv = '';
        st.tipKeep = false;
        st.qrAt = 0;
        paint();
        return;
      }
      const key = t.closest('[data-key]');
      if (key) {
        const k = key.dataset.key;
        if (k === 'del') st.recv = st.recv.slice(0, -1);
        else if ((st.recv + k).replace(/^0+(?=\d)/, '').length <= 7) st.recv = (st.recv + k).replace(/^0+(?=\d)/, '');
        root.querySelector('#cash-in').value = st.recv;
        paintCash();
        return;
      }
      const quick = t.closest('[data-quick]');
      if (quick) {
        st.recv = String(Number(quick.dataset.quick));
        root.querySelector('#cash-in').value = st.recv;
        paintCash();
        return;
      }
      if (t.closest('[data-full]')) { openFull(); return; }
      if (t.closest('[data-share-qr]')) {
        try {
          const cv = await LB.drawPayQr({ id: 'ขายหน้าร้าน', customer_name: st.name }, totals().total);
          LB.shareCanvas(cv, 'qr-promptpay.png', 'QR PromptPay');
        } catch (err) { LB.error(err); }
        return;
      }
      if (t.closest('[data-close-bill]')) { closeBill(); return; }
      const dl = t.closest('[data-deliver]');
      if (dl) {
        const o = (st.orders || []).find((x) => x.id === dl.dataset.deliver);
        if (!o) return;
        LB.deliverSheet(o, async () => {
          try {
            await Promise.all([loadOrders(), loadMenu()]);
            if (!alive()) return;
            paintPickup();
            refreshTabCount();
          } catch (err) { LB.error(err); }
        });
      }
    });

    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'ps-q') { st.q = t.value.trim(); paintMenu(); }
      else if (t.id === 'pk-q') {
        st.pq = t.value.trim();
        const pos = t.selectionStart;
        paintPickup();
        const again = root.querySelector('#pk-q');
        if (again) { again.focus(); again.setSelectionRange(pos, pos); }
      } else if (t.id === 'ps-name') st.name = t.value;
      else if (t.id === 'ps-disc') { st.disc = t.value; paintTotals(); }
      else if (t.id === 'cash-in') { st.recv = t.value.replace(/[^\d.]/g, ''); paintCash(); }
      else if (t.matches('[data-tip]')) { st.tipKeep = t.checked; paintCash(); }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.closest('[data-stepper]')) {
        const line = t.closest('[data-line]');
        setQty(line.dataset.line, Number(t.value));
        paintMenu();
        paintCart();
      } else if (t.matches('[data-tip]')) { st.tipKeep = t.checked; paintCash(); }
    });

    paint();
  };
})();
