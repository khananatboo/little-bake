/* รายการออเดอร์ และรายละเอียดออเดอร์ */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  const FILTERS = [['all', 'ทั้งหมด'], ['pending_deposit', 'รอมัดจำ'], ['confirmed', 'ยืนยันแล้ว'], ['ready', 'พร้อมส่ง'],
    ['delivered', 'ส่งมอบแล้ว'], ['cancelled', 'ยกเลิก']];

  function orderCard(o) {
    const due = LB.n(o.total) + LB.n(o.shipping_fee);
    let money;
    if (o.status === 'cancelled') money = o.refund ? `คืนเงิน ${LB.baht(o.refund)}` : 'ไม่คืนเงิน';
    else if (o.status === 'pending_deposit') money = `<span class="danger-text">ยังไม่ได้รับมัดจำ ${LB.baht(LB.n(o.deposit_due) - LB.n(o.paid))}</span>`;
    else if (o.balance > 0) money = o.paid > 0 ? `จ่ายแล้ว ${LB.baht(o.paid)} · ค้าง ${LB.baht(o.balance)}` : (o.status === 'delivered' ? `<span class="danger-text">ค้างชำระ ${LB.baht(o.balance)}</span>` : 'ชำระวันรับ');
    else money = 'ชำระครบ';
    return `<a class="card tight link" href="#/order/${esc(o.id)}">
      <div class="row between"><span class="label grow">${esc(o.customer_name)} <span class="small muted" style="font-weight:400">· ${esc(LB.L.channel[o.channel] || '')}</span></span>
      <span class="row" style="gap:4px">${o.kind === 'no_deposit' ? '<span class="badge outline">ไม่มัดจำ</span>' : ''}${LB.badge(o.status)}</span></div>
      <span style="font-size:14px;line-height:20px">${esc(LB.itemsText(o.items))}</span>
      <div class="row between small muted"><span>${o.kind === 'walkin' ? 'ขายหน้าร้าน' : esc(LB.L.handover[o.handover])} · ${esc(o.status === 'delivered' ? LB.dateTimeTh(o.delivered_at) : LB.relDay(o.due_date))}${o.status !== 'delivered' && o.due_time ? ' ' + esc(o.due_time) : ''}</span><span>${esc(o.id)}</span></div>
      <div class="row between"><span class="small muted">${money}</span><span class="num nowrap" style="font-size:16px">${LB.baht(due)}</span></div></a>`;
  }

  LB.views.orders = async (root, params, query, alive) => {
    root.innerHTML = LB.topbar('ออเดอร์') + LB.loadingHtml;
    const list = await LB.api('orders.list', { days: 60 });
    if (!alive()) return;
    let filter = query.status || 'all';
    let q = '';
    const counts = {};
    list.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    root.innerHTML = `${LB.topbar('ออเดอร์')}<div class="page">
      <div class="chips scroll" data-filters>${FILTERS.map(([k, label]) => { const c = k === 'all' ? list.length : (counts[k] || 0); return `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === filter}">${label}${c ? ` <span class="count">${c}</span>` : ''}</button>`; }).join('')}</div>
      <input class="input" type="search" placeholder="ค้นหาชื่อลูกค้า เมนู หรือเลขออเดอร์" aria-label="ค้นหาออเดอร์" data-q>
      <div class="stack" data-list></div></div>
      <a class="fab" href="#/orders/new">${LB.icon('plus')}ออเดอร์ใหม่</a>`;
    const listEl = root.querySelector('[data-list]');
    const paint = () => {
      const rows = list.filter((o) => (filter === 'all' || o.status === filter) &&
        (!q || [o.customer_name, o.id, o.phone, LB.itemsText(o.items)].join(' ').toLowerCase().includes(q)));
      if (!rows.length) { listEl.innerHTML = '<div class="empty">ไม่มีออเดอร์</div>'; return; }
      const groups = [];
      const byKey = {};
      rows.forEach((o) => {
        let key, title, stamp = false;
        if (!LB.ACTIVE.includes(o.status)) { key = 'z-' + o.status; title = LB.L.status[o.status] + ' (60 วันล่าสุด)'; }
        else if (o.round_id) { key = 'a-' + o.round_bake_date + o.round_id; title = 'รอบผลิต ' + LB.dateTh(o.round_bake_date); stamp = true; }
        else { key = 'b-ready'; title = 'จองจากของพร้อมขาย'; }
        if (!byKey[key]) { byKey[key] = { key, title, stamp, rows: [] }; groups.push(byKey[key]); }
        byKey[key].rows.push(o);
      });
      groups.sort((a, b) => (a.key < b.key ? -1 : 1));
      listEl.innerHTML = groups.map((g) => `<h2 class="small muted" style="font-family:var(--font-body);font-weight:500;margin-top:4px">${g.stamp ? LB.stamp(g.title) : esc(g.title)}</h2>${g.rows.map(orderCard).join('')}`).join('');
    };
    paint();
    root.querySelector('[data-filters]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      root.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      paint();
    });
    root.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); paint(); });
  };

  /* ---------------- รายละเอียดออเดอร์ ---------------- */

  function payMethodHtml(name, value) {
    return LB.choiceHtml('seg', name, [['promptpay', 'PromptPay'], ['transfer', 'โอน'], ['cash', 'เงินสด']], value || 'promptpay');
  }

  /** ยอดที่ควรได้รับตอนนี้: มัดจำที่ยังขาด หรือยอดค้าง */
  LB.dueNow = (o) => (o.status === 'pending_deposit' ? Math.max(0, LB.n(o.deposit_due) - LB.n(o.paid)) : LB.n(o.balance));

  /**
   * ผู้ขายกดยืนยันว่าได้รับเงินแล้ว (ไม่ต้องแนบสลิป)
   * opts: { amount, method, onDone(order) }
   */
  LB.confirmPayment = (o, opts) => {
    opts = opts || {};
    const pendingDeposit = o.status === 'pending_deposit';
    const amount = opts.amount !== undefined ? opts.amount : LB.dueNow(o);
    const s = LB.sheet(pendingDeposit ? 'ยืนยันรับมัดจำ' : 'ยืนยันรับเงิน', `
      <div class="pay-confirm">
        <span class="small muted">${esc(o.id)} · ${esc(o.customer_name)}</span>
        <span class="num money pay-amount" data-show>${LB.baht(amount)}</span>
        <span class="small muted">${pendingDeposit ? `มัดจำ ${esc(LB.state.settings.deposit_percent)}% ของ ${LB.baht(o.total)}` : `ยอดรวม ${LB.baht(LB.n(o.total) + LB.n(o.shipping_fee))} · จ่ายแล้ว ${LB.baht(o.paid)}`}</span>
      </div>
      <div class="field"><span class="label">ลูกค้าจ่ายทาง</span>${payMethodHtml('method', opts.method || 'promptpay')}</div>
      <details class="more-opts">
        <summary>ยอดไม่ตรง หรือรับเงินวันอื่น</summary>
        <div class="stack" style="margin-top:12px">
          <div class="field"><label for="pay-amt">จำนวนเงินที่ได้รับ (บาท)</label>
          <input id="pay-amt" class="input" type="text" inputmode="decimal" value="${esc(amount)}"></div>
          <div class="field"><label for="pay-date">วันที่รับเงิน</label><input id="pay-date" class="input" type="date" value="${LB.today()}"></div>
        </div>
      </details>
      <p class="hint" style="margin:0">ตรวจว่าเงินเข้าบัญชีแล้วในแอปธนาคาร ก่อนกดยืนยัน</p>
      <button type="button" class="btn primary" data-save>ยืนยันได้รับเงินแล้ว</button>`);
    LB.bindChoice(s.el, '.seg');
    const amtIn = s.el.querySelector('#pay-amt');
    amtIn.addEventListener('input', () => { s.el.querySelector('[data-show]').textContent = LB.baht(amtIn.value); });
    s.el.querySelector('[data-save]').onclick = async () => {
      try {
        const r = await LB.busy(() => LB.api('payments.add', {
          orderId: o.id, amount: amtIn.value, method: LB.choiceVal(s.el, 'method'),
          date: s.el.querySelector('#pay-date').value, type: pendingDeposit ? 'deposit' : undefined
        }));
        s.close();
        LB.toast(pendingDeposit && r.status !== 'pending_deposit' ? 'ยืนยันรับมัดจำแล้ว ออเดอร์ยืนยันแล้ว' : 'ยืนยันรับเงินแล้ว');
        if (opts.onDone) opts.onDone(r);
      } catch (e) { LB.error(e); }
    };
  };

  LB.deliverSheet = (o, onDone) => deliverSheet(o, onDone);
  function deliverSheet(o, onDone) {
    const ship = o.handover !== 'pickup';
    const s = LB.sheet('ส่งมอบ ' + o.id, `
      <p style="margin:0">${esc(LB.itemsText(o.items))}</p>
      ${ship ? `<div class="field"><label for="dl-ship">ค่าส่ง (บาท)</label>
        <input id="dl-ship" class="input" type="text" inputmode="decimal" value="${esc(LB.n(o.shipping_fee) || '')}" placeholder="0">
        <span class="hint">ลูกค้าจ่ายตามจริง ใส่ 0 ถ้าลูกค้าจ่ายคนส่งเอง</span></div>` : ''}
      <div class="kv"><span>ยอดค้างชำระ</span><span class="num" data-bal>${LB.baht(o.balance)}</span></div>
      <div class="field"><label for="dl-amt">รับเงินตอนส่งมอบ (บาท)</label>
      <input id="dl-amt" class="input" type="text" inputmode="decimal" value="${esc(o.balance)}"></div>
      <div class="field"><span class="label">ช่องทาง</span>${payMethodHtml('method', 'cash')}</div>
      <button type="button" class="btn" data-qr hidden>${LB.icon('qr')}แสดง QR ยอดนี้</button>
      <button type="button" class="btn primary" data-save>ยืนยันส่งมอบ</button>`);
    const qrBtn = s.el.querySelector('[data-qr]');
    LB.bindChoice(s.el, '.seg', (n, v) => { qrBtn.hidden = v !== 'promptpay'; });
    qrBtn.onclick = () => LB.openPayQr(o, LB.n(s.el.querySelector('#dl-amt').value), 'QR รับเงิน ' + o.id);
    const shipIn = s.el.querySelector('#dl-ship');
    if (shipIn) {
      shipIn.addEventListener('input', () => {
        const bal = Math.max(0, LB.n(o.total) + LB.n(shipIn.value) - LB.n(o.paid));
        s.el.querySelector('[data-bal]').textContent = LB.baht(bal);
        s.el.querySelector('#dl-amt').value = bal;
      });
    }
    s.el.querySelector('[data-save]').onclick = async () => {
      try {
        const r = await LB.busy(() => LB.api('orders.deliver', {
          id: o.id, shipping_fee: shipIn ? shipIn.value : undefined,
          payment: { amount: s.el.querySelector('#dl-amt').value, method: LB.choiceVal(s.el, 'method') }
        }));
        s.close();
        LB.toast('ส่งมอบแล้ว');
        onDone(r);
      } catch (e) { LB.error(e); }
    };
  }

  async function cancelSheet(o, onDone) {
    let info;
    try { info = await LB.busy(() => LB.api('orders.cancelPreview', { id: o.id })); } catch (e) { LB.error(e); return; }
    const policy = info.paid > 0
      ? (info.eligible
        ? `ยกเลิกก่อนวันรับ ${info.daysBefore} วัน (ตั้งแต่ ${info.refundDays} วันขึ้นไป) ตามนโยบายคืนเงิน ${LB.baht(info.paid)}`
        : `ยกเลิกก่อนวันรับ ${Math.max(0, info.daysBefore)} วัน (น้อยกว่า ${info.refundDays} วัน) ตามนโยบายไม่คืนเงิน`)
      : 'ลูกค้ายังไม่ได้จ่ายเงิน';
    const s = LB.sheet('ยกเลิก ' + o.id, `
      <p style="margin:0">${esc(policy)}</p>
      ${info.paid > 0 ? `<div class="field"><label for="cc-ref">คืนเงิน (บาท)</label>
        <input id="cc-ref" class="input" type="text" inputmode="decimal" value="${esc(info.suggestedRefund)}">
        <span class="hint">ลูกค้าจ่ายแล้ว ${LB.baht(info.paid)} แก้ยอดคืนได้ถ้าตกลงกันเป็นอย่างอื่น</span></div>
        <div class="field"><span class="label">คืนทาง</span>${LB.choiceHtml('seg', 'method', [['transfer', 'โอน'], ['cash', 'เงินสด']], 'transfer')}</div>` : ''}
      <div class="field"><label for="cc-why">เหตุผล (ไม่บังคับ)</label><input id="cc-why" class="input" maxlength="120"></div>
      <button type="button" class="btn danger" data-save>ยืนยันยกเลิกออเดอร์</button>`);
    LB.bindChoice(s.el, '.seg');
    s.el.querySelector('[data-save]').onclick = async () => {
      try {
        const refIn = s.el.querySelector('#cc-ref');
        const r = await LB.busy(() => LB.api('orders.cancel', {
          id: o.id, refund: refIn ? refIn.value : 0, method: LB.choiceVal(s.el, 'method') || 'transfer',
          reason: s.el.querySelector('#cc-why').value
        }));
        s.close();
        LB.toast('ยกเลิกออเดอร์แล้ว');
        onDone(r);
      } catch (e) { LB.error(e); }
    };
  }

  LB.views.order = async (root, params, query, alive) => {
    root.innerHTML = LB.topbar('ออเดอร์', '#/orders') + LB.loadingHtml;
    let o = await LB.api('orders.get', { id: params[0] });
    if (!alive()) return;
    let paint = null;
    const done = (r) => { o = r; if (alive()) paint(); };
    paint = () => {
      const active = LB.ACTIVE.includes(o.status);
      const mapLink = /^https?:\/\//.test(o.address) ? `<a href="${esc(o.address)}" target="_blank" rel="noopener">${LB.icon('map')} เปิดแผนที่</a>` : esc(o.address);
      root.innerHTML = `${LB.topbar(o.id, '#/orders', active ? `<a class="icon-btn" href="#/order/${esc(o.id)}/edit" aria-label="แก้ไขออเดอร์">${LB.icon('edit')}</a>` : '')}
      <div class="page">
        <div class="row wrap">${LB.badge(o.status)}<span class="badge outline">${esc(LB.L.kind[o.kind])}</span>
          ${o.round ? LB.stamp('รอบผลิต ' + LB.dateTh(o.round.bake_date), '#/round/' + o.round.id) : ''}</div>
        <section class="card">
          <div class="row between top"><div class="stack tight" style="gap:0"><h2>${esc(o.customer_name)}</h2>
            <span class="small muted">สั่งผ่าน ${esc(LB.L.channel[o.channel] || '')}</span></div>
            ${o.phone ? `<a class="btn small" href="tel:${esc(o.phone)}">${LB.icon('phone')}${esc(o.phone)}</a>` : ''}</div>
          <div class="kv"><span class="muted">${esc(LB.L.handover[o.handover])}</span><span>${esc(LB.dateTh(o.due_date))}${o.due_time ? ' ' + esc(o.due_time) + ' น.' : ''}</span></div>
          ${o.address ? `<div class="kv"><span class="muted">ที่อยู่</span><span class="right" style="word-break:break-word">${mapLink}</span></div>` : ''}
          ${o.note ? `<div class="kv"><span class="muted">หมายเหตุ</span><span class="right">${esc(o.note)}</span></div>` : ''}
        </section>
        <section class="card">
          <table class="data"><thead><tr><th>เมนู</th><th class="r">จำนวน</th><th class="r">รวม</th></tr></thead><tbody>
          ${o.items.map((i) => `<tr><td>${esc(i.product_name)}<div class="small muted">${LB.money(i.price)} บาท</div></td><td class="r">${i.qty} ${esc(i.unit || '')}</td><td class="r">${LB.baht(i.qty * i.price)}</td></tr>`).join('')}
          </tbody></table>
          <div class="stack tight">
            <div class="kv"><span>ค่าขนม</span><span>${LB.baht(o.subtotal)}</span></div>
            ${LB.n(o.discount) ? `<div class="kv"><span>ส่วนลด</span><span>−${LB.baht(o.discount)}</span></div>` : ''}
            ${LB.n(o.shipping_fee) ? `<div class="kv"><span>ค่าส่ง</span><span>${LB.baht(o.shipping_fee)}</span></div>` : (o.handover !== 'pickup' ? '<div class="kv"><span>ค่าส่ง</span><span class="muted">ตามจริง</span></div>' : '')}
            ${LB.n(o.tip) ? `<div class="kv"><span>ทิป</span><span>+${LB.baht(o.tip)}</span></div>` : ''}
            <div class="kv total"><span>รวม</span><span>${LB.baht(LB.n(o.total) + LB.n(o.shipping_fee) + LB.n(o.tip))}</span></div>
            ${o.kind === 'deposit' ? `<div class="kv"><span>มัดจำ ${esc(LB.state.settings.deposit_percent)}%</span><span class="row" style="gap:4px">${LB.baht(o.deposit_due)}${o.depositPaid ? `${LB.icon('check', 'ok-icon')}<span class="sr-only">จ่ายแล้ว</span>` : ''}</span></div>` : ''}
            <div class="kv"><span>จ่ายแล้ว</span><span>${LB.baht(o.paid)}</span></div>
            ${o.status !== 'cancelled' ? `<div class="kv total"><span>ค้างชำระ</span><span class="${o.balance > 0 ? 'money' : ''}">${LB.baht(o.balance)}</span></div>` : `<div class="kv"><span>คืนเงิน</span><span>${LB.baht(o.refund)}</span></div>`}
          </div>
        </section>
        ${o.payments.length ? `<section class="card"><h2>การชำระเงิน</h2>
          ${o.payments.map((p) => `<div class="kv top"><span class="stack tight" style="gap:0"><span>${esc(LB.dateShort(p.date))} · ${esc(LB.L.payType[p.type] || p.type)} · ${esc(LB.L.method[p.method] || p.method)}</span>
          <span class="small muted">${p.type === 'refund' ? 'คืนโดย' : 'ยืนยันรับเงินโดย'} ${esc(p.created_by)}</span></span><span class="nowrap">${LB.baht(p.amount)}</span></div>`).join('')}</section>` : ''}
        ${active ? `<section class="stack">
          ${o.status === 'pending_deposit' ? `<div class="btn-row"><button type="button" class="btn" data-a="qr-dep">${LB.icon('qr')}ส่ง QR มัดจำ</button>
            <button type="button" class="btn primary" data-a="pay">ยืนยันรับมัดจำ</button></div>` : ''}
          ${o.status !== 'pending_deposit' ? `<div class="btn-row">
            ${o.status === 'confirmed' ? '<button type="button" class="btn" data-a="ready">แพ็กเสร็จ</button>' : '<button type="button" class="btn" data-a="unready">ยังไม่พร้อม</button>'}
            <button type="button" class="btn primary" data-a="deliver">ส่งมอบ</button></div>` : ''}
          <div class="btn-row">${o.balance > 0 ? `<button type="button" class="btn" data-a="qr-bal">${LB.icon('qr')}QR ยอดค้าง</button>` : ''}
            ${o.status !== 'pending_deposit' && o.balance > 0 ? '<button type="button" class="btn" data-a="pay">ยืนยันรับเงิน</button>' : ''}</div>
          <button type="button" class="btn" data-a="copy">${LB.icon('copy')}คัดลอกข้อความยืนยันออเดอร์</button>
          <button type="button" class="btn danger" data-a="cancel">ยกเลิกออเดอร์</button>
        </section>` : (o.status === 'delivered' && o.balance > 0 ? `<button type="button" class="btn primary" data-a="pay">ยืนยันรับเงินที่ค้าง</button>` : '')}
        <p class="small muted" style="margin:0">สร้างเมื่อ ${esc(LB.dateTimeTh(o.created_at))} โดย ${esc(o.created_by)}${o.delivered_at ? ` · ส่งมอบ ${esc(LB.dateTimeTh(o.delivered_at))}` : ''}</p>
      </div>`;
      root.querySelectorAll('[data-a]').forEach((b) => {
        b.onclick = async () => {
          const a = b.dataset.a;
          if (a === 'qr-dep') LB.openPayQr(o, LB.dueNow(o), 'QR มัดจำ ' + o.id, done);
          else if (a === 'qr-bal') LB.openPayQr(o, o.balance, 'QR ยอดค้าง ' + o.id, done);
          else if (a === 'pay') LB.confirmPayment(o, { onDone: done });
          else if (a === 'deliver') deliverSheet(o, done);
          else if (a === 'cancel') cancelSheet(o, done);
          else if (a === 'copy') LB.copyText(LB.msgOrder(o));
          else if (a === 'ready' || a === 'unready') {
            try { done(await LB.busy(() => LB.api('orders.setStatus', { id: o.id, status: a === 'ready' ? 'ready' : 'confirmed' }))); } catch (e) { LB.error(e); }
          }
        };
      });
    };
    paint();
    if (query.qr === 'deposit' && o.status === 'pending_deposit') {
      history.replaceState(null, '', '#/order/' + encodeURIComponent(o.id));
      LB.openPayQr(o, LB.dueNow(o), 'QR มัดจำ ' + o.id, done);
    }
  };
})();
