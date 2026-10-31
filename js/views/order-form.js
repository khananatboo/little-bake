/* ฟอร์มออเดอร์ใหม่ / แก้ไขออเดอร์ */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  LB.views.orderForm = async (root, params, query, alive) => {
    const editId = params[0] || '';
    root.innerHTML = LB.topbar(editId ? 'แก้ไขออเดอร์' : 'ออเดอร์ใหม่', editId ? '#/order/' + editId : '#/orders') + LB.loadingHtml;
    const [rounds, stockData, existing] = await Promise.all([
      LB.api('rounds.list', { limit: 30 }),
      LB.api('stock.list'),
      editId ? LB.api('orders.get', { id: editId }) : Promise.resolve(null)
    ]);
    if (!alive()) return;
    const s = LB.state.settings;
    const pct = LB.n(s.deposit_percent);
    const products = {};
    LB.state.products.forEach((p) => { products[p.id] = p; });
    const openRounds = rounds.filter((r) => r.state === 'open' || (existing && r.id === existing.round_id));

    const f = {
      kind: existing ? existing.kind : (query.kind || (openRounds.length ? 'deposit' : 'ready')),
      round_id: existing ? existing.round_id : (query.round || (openRounds[0] && openRounds[0].id) || ''),
      customer_name: existing ? existing.customer_name : '',
      channel: existing ? existing.channel : 'facebook',
      phone: existing ? existing.phone : '',
      handover: existing ? existing.handover : 'pickup',
      due_date: existing ? existing.due_date : '',
      due_time: existing ? existing.due_time : '',
      address: existing ? existing.address : '',
      shipping_fee: existing ? (LB.n(existing.shipping_fee) || '') : '',
      discount: existing ? (LB.n(existing.discount) || '') : '',
      note: existing ? existing.note : '',
      qty: {}
    };
    const own = {};
    if (existing) existing.items.forEach((i) => { f.qty[i.product_id] = i.qty; own[i.product_id] = i.qty; });
    const ownPrice = {};
    if (existing) existing.items.forEach((i) => { ownPrice[i.product_id] = i.price; });

    function round() { return openRounds.find((r) => r.id === f.round_id); }
    function lines() {
      if (f.kind === 'ready') {
        return stockData.stock.filter((x) => x.free + (own[x.product_id] || 0) > 0).map((x) => {
          const disc = (x.batches.find((b) => LB.n(b.discount_price) > 0) || {}).discount_price;
          return { product_id: x.product_id, name: x.name, unit: x.unit,
            price: ownPrice[x.product_id] !== undefined ? ownPrice[x.product_id] : (LB.n(disc) || x.price),
            max: Math.max(0, x.free) + (own[x.product_id] || 0), note: `ขายได้ ${Math.max(0, x.free) + (own[x.product_id] || 0)} ${x.unit}` };
        });
      }
      const r = round();
      if (!r) return [];
      return r.items.map((i) => {
        const max = i.left + (own[i.product_id] || 0);
        return { product_id: i.product_id, name: i.name, unit: i.unit,
          price: ownPrice[i.product_id] !== undefined ? ownPrice[i.product_id] : i.price, max,
          note: max <= 0 ? 'เต็มแล้ว' : `เหลือ ${max} ${i.unit}` };
      });
    }

    function paint() {
      const ls = lines();
      const r = round();
      if (!f.due_date) f.due_date = f.kind === 'ready' ? LB.today() : (r ? r.bake_date : LB.today());
      root.innerHTML = `${LB.topbar(editId ? 'แก้ไข ' + editId : 'ออเดอร์ใหม่', editId ? '#/order/' + editId : '#/orders')}
      <form class="page no-nav" data-form novalidate>
        <div class="field"><span class="label">แบบออเดอร์</span>
          ${LB.choiceHtml('seg', 'kind', [['deposit', `มัดจำ ${pct}%`], ['no_deposit', 'ไม่มัดจำ'], ['ready', 'ของพร้อมขาย']], f.kind)}</div>
        ${f.kind !== 'ready' ? `<div class="field"><span class="label">รอบผลิต</span>
          ${openRounds.length ? `<div class="chips" data-name="round_id" role="group">${openRounds.map((x) => `<button type="button" class="chip soft" data-val="${esc(x.id)}" aria-pressed="${x.id === f.round_id}">${esc(LB.dateTh(x.bake_date))}</button>`).join('')}</div>
          ${r ? `<span class="hint">ปิดรับ ${esc(LB.dateTh(r.close_date))}</span>` : ''}`
          : '<p class="muted" style="margin:0">ยังไม่มีรอบที่เปิดรับ <a href="#/rounds/new">เปิดรอบผลิต</a></p>'}</div>` : ''}

        <section class="stack">
          <h2>ลูกค้า</h2>
          <div class="field"><label for="of-name">ชื่อ</label>
          <input id="of-name" class="input" list="of-customers" value="${esc(f.customer_name)}" maxlength="80" autocomplete="off">
          <datalist id="of-customers">${LB.state.customers.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist></div>
          <div class="field"><span class="label">สั่งผ่าน</span>
          ${LB.choiceHtml('chips', 'channel', [['facebook', 'Facebook'], ['ig', 'IG'], ['direct', 'สั่งตรงกับเจ้าของ']], f.channel).replace(/<button /g, '<button class="chip soft" ')}</div>
          <div class="field"><label for="of-phone">เบอร์โทร</label>
          <input id="of-phone" class="input" type="tel" inputmode="tel" value="${esc(f.phone)}" placeholder="ไม่บังคับ" maxlength="20"></div>
        </section>

        <section class="stack">
          <h2>เมนู</h2>
          ${ls.length ? ls.map((l) => `<div class="card tight ${f.qty[l.product_id] ? 'selected' : ''}" data-line="${esc(l.product_id)}">
            <div class="row"><div class="grow stack tight" style="gap:0"><span class="label" style="font-size:16px">${esc(l.name)}</span>
            <span class="small muted">${LB.money(l.price)} บาท · ${esc(l.note)}</span></div>
            ${LB.stepper('q_' + l.product_id, f.qty[l.product_id] || 0, 0, l.max, ' ' + l.name)}</div></div>`).join('')
            : `<p class="muted" style="margin:0">${f.kind === 'ready' ? 'ยังไม่มีของพร้อมขายในตู้' : 'เลือกรอบผลิตก่อน'}</p>`}
        </section>

        <section class="stack">
          <h2>ส่งมอบ</h2>
          ${LB.choiceHtml('seg', 'handover', [['pickup', 'รับเอง'], ['shop_delivery', 'ร้านไปส่ง'], ['courier', 'เรียกรถส่ง']], f.handover)}
          <div class="grid2"><div class="field"><label for="of-date">วันที่</label><input id="of-date" class="input" type="date" value="${esc(f.due_date)}" ${r && f.kind !== 'ready' ? `min="${esc(r.bake_date)}"` : ''}></div>
          <div class="field"><label for="of-time">เวลา</label><input id="of-time" class="input" type="time" value="${esc(f.due_time)}"></div></div>
          ${f.handover !== 'pickup' ? `<div class="field"><label for="of-addr">ที่อยู่หรือลิงก์แผนที่</label>
            <input id="of-addr" class="input" value="${esc(f.address)}" placeholder="วางลิงก์ Google Maps" maxlength="300"></div>
            <div class="field"><label for="of-ship">ค่าส่ง (บาท)</label><input id="of-ship" class="input" type="text" inputmode="decimal" value="${esc(f.shipping_fee)}" placeholder="ใส่ทีหลังได้ตอนส่งมอบ"></div>` : ''}
        </section>

        <div class="grid2"><div class="field"><label for="of-disc">ส่วนลด (บาท)</label><input id="of-disc" class="input" type="text" inputmode="decimal" value="${esc(f.discount)}" placeholder="0"></div></div>
        <div class="field"><label for="of-note">หมายเหตุ</label><textarea id="of-note" class="input" rows="2" maxlength="300" placeholder="เช่น ข้อความบนกล่อง">${esc(f.note)}</textarea></div>

        <section class="card" data-summary></section>
        <button class="btn primary" type="submit">${editId ? 'บันทึกการแก้ไข' : (f.kind === 'deposit' ? 'บันทึกและส่ง QR มัดจำ' : 'บันทึกออเดอร์')}</button>
      </form>`;
      if (editId) root.querySelectorAll('[data-name="kind"] button, [data-name="round_id"] button').forEach((b) => { b.disabled = true; });
      summary();
      bind();
    }

    function readFields() {
      const g = (id) => { const el = root.querySelector(id); return el ? el.value : undefined; };
      f.customer_name = g('#of-name') || '';
      f.phone = g('#of-phone') || '';
      f.due_date = g('#of-date') || f.due_date;
      f.due_time = g('#of-time') || '';
      if (g('#of-addr') !== undefined) f.address = g('#of-addr');
      if (g('#of-ship') !== undefined) f.shipping_fee = g('#of-ship');
      f.discount = g('#of-disc') || '';
      f.note = g('#of-note') || '';
      root.querySelectorAll('[data-line]').forEach((el) => {
        f.qty[el.dataset.line] = Math.max(0, Math.round(Number(el.querySelector('input').value) || 0));
      });
    }

    function summary() {
      const box = root.querySelector('[data-summary]');
      const ls = lines();
      let sub = 0;
      ls.forEach((l) => { sub += (f.qty[l.product_id] || 0) * l.price; });
      const disc = Math.min(sub, LB.n(f.discount));
      const total = sub - disc;
      const ship = f.handover !== 'pickup' ? LB.n(f.shipping_fee) : 0;
      const dep = f.kind === 'deposit' ? Math.ceil(total * pct / 100) : 0;
      box.innerHTML = `<div class="kv"><span>ค่าขนม</span><span>${LB.baht(sub)}</span></div>
        ${disc ? `<div class="kv"><span>ส่วนลด</span><span>−${LB.baht(disc)}</span></div>` : ''}
        ${f.handover !== 'pickup' ? `<div class="kv"><span>ค่าส่ง</span><span>${ship ? LB.baht(ship) : 'ตามจริง'}</span></div>` : ''}
        ${f.kind === 'deposit' ? `<div class="kv total"><span>มัดจำ ${pct}% (โอนตอนนี้)</span><span class="num money" style="font-size:20px">${LB.baht(dep)}</span></div>
          <div class="kv muted"><span>ชำระวันรับ</span><span>${LB.baht(total - dep)}${f.handover !== 'pickup' && !ship ? ' + ค่าส่ง' : ''}</span></div>`
          : `<div class="kv total"><span>รวม</span><span class="num money" style="font-size:20px">${LB.baht(total + ship)}</span></div>`}
        ${f.kind !== 'ready' ? `<span class="hint">ยกเลิกก่อนวันรับ ${esc(s.refund_days)} วันขึ้นไป คืนเงินเต็ม น้อยกว่านั้นไม่คืน</span>` : ''}`;
    }

    function bind() {
      const form = root.querySelector('[data-form]');
      LB.bindChoice(root, '[data-name="kind"], [data-name="round_id"], [data-name="channel"], [data-name="handover"]', (name, val) => {
        readFields();
        if (name === 'kind') { f.kind = val; f.qty = {}; f.due_date = ''; }
        if (name === 'round_id') { f.round_id = val; f.qty = {}; f.due_date = ''; }
        if (name === 'channel') { f.channel = val; return; }
        if (name === 'handover') f.handover = val;
        paint();
      });
      LB.bindSteppers(form, (input) => {
        const card = input.closest('[data-line]');
        if (card) card.classList.toggle('selected', Number(input.value) > 0);
        readFields();
        summary();
      });
      ['#of-disc', '#of-ship'].forEach((id) => {
        const el = root.querySelector(id);
        if (el) el.addEventListener('input', () => { readFields(); summary(); });
      });
      const nameIn = root.querySelector('#of-name');
      nameIn.addEventListener('change', () => {
        const c = LB.state.customers.find((x) => x.name === nameIn.value);
        if (!c) return;
        const ph = root.querySelector('#of-phone');
        if (c.phone && !ph.value) ph.value = c.phone;
        if (c.channel && ['facebook', 'ig', 'direct'].includes(c.channel)) {
          f.channel = c.channel;
          root.querySelectorAll('[data-name="channel"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.val === c.channel)));
        }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        readFields();
        const items = Object.keys(f.qty).filter((k) => f.qty[k] > 0).map((k) => ({ product_id: k, qty: f.qty[k] }));
        if (!f.customer_name.trim()) { LB.error('กรุณาใส่ชื่อลูกค้า'); return; }
        if (!items.length) { LB.error('เลือกเมนูอย่างน้อย 1 รายการ'); return; }
        const payload = {
          id: editId || undefined, kind: f.kind, round_id: f.kind === 'ready' ? '' : f.round_id,
          customer_name: f.customer_name, channel: f.channel, phone: f.phone, handover: f.handover,
          due_date: f.due_date, due_time: f.due_time, address: f.handover !== 'pickup' ? f.address : '',
          shipping_fee: f.handover !== 'pickup' ? f.shipping_fee : 0, discount: f.discount, note: f.note, items
        };
        try {
          const o = await LB.busy(() => LB.api(editId ? 'orders.update' : 'orders.create', payload));
          if (!LB.state.customers.some((c) => c.name === o.customer_name)) {
            LB.state.customers.push({ name: o.customer_name, phone: o.phone, channel: o.channel });
          }
          LB.toast(editId ? 'บันทึกการแก้ไขแล้ว' : 'บันทึกออเดอร์ ' + o.id + ' แล้ว');
          const target = '#/order/' + encodeURIComponent(o.id) + (!editId && o.status === 'pending_deposit' ? '?qr=deposit' : '');
          if (editId) history.back(); else location.replace(target);
        } catch (err) { LB.error(err); }
      });
    }

    paint();
  };
})();
