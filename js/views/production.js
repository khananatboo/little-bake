/* หน้าผลิต: แผนอบต่อรอบ บันทึกอบเสร็จ และของในตู้ */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  function batchActions(b, x, onDone) {
    const s = LB.sheet(`${x.name} · ผลิต ${LB.dateShort(b.produced_date)}`, `
      <p class="muted" style="margin:0">เหลือ ${b.remaining} ${esc(x.unit)} · หมดอายุ ${esc(LB.dateTh(b.expire_date))}</p>
      <section class="stack"><h3>ลดราคา</h3>
        <div class="row"><input class="input grow" type="text" inputmode="decimal" data-price value="${esc(LB.n(b.discount_price) || '')}" placeholder="ราคาเต็ม ${LB.money(x.price)}" aria-label="ราคาลด">
        <button type="button" class="btn" data-a="discount">บันทึก</button></div>
        <span class="hint">ใช้ราคานี้ตอนขายหน้างานและจองของพร้อมขาย เว้นว่างเพื่อกลับเป็นราคาเต็ม</span></section>
      <section class="stack"><h3>บันทึกทิ้ง</h3>
        <div class="row">${LB.stepper('waste', b.remaining, 1, b.remaining, ' ที่ทิ้ง')}<button type="button" class="btn danger" data-a="waste">ทิ้ง</button></div></section>
      <section class="stack"><h3>ปรับยอดให้ตรงของจริง</h3>
        <div class="row">${LB.stepper('adjust', b.remaining, 0, undefined, ' คงเหลือจริง')}<button type="button" class="btn" data-a="adjust">ปรับยอด</button></div></section>`);
    LB.bindSteppers(s.el);
    s.el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-a]');
      if (!btn) return;
      const a = btn.dataset.a;
      try {
        let r;
        if (a === 'discount') r = await LB.busy(() => LB.api('stock.discount', { batchId: b.id, price: s.el.querySelector('[data-price]').value }));
        if (a === 'waste') {
          const qty = s.el.querySelector('input[name="waste"]').value;
          if (!(await LB.confirm('บันทึกทิ้ง', `ทิ้ง ${x.name} ${qty} ${x.unit}?`, 'ทิ้ง', true))) return;
          r = await LB.busy(() => LB.api('stock.waste', { batchId: b.id, qty }));
        }
        if (a === 'adjust') r = await LB.busy(() => LB.api('stock.adjust', { batchId: b.id, remaining: s.el.querySelector('input[name="adjust"]').value }));
        s.close();
        LB.toast('บันทึกแล้ว');
        onDone();
        void r;
      } catch (err) { LB.error(err); }
    });
  }

  function extraRecord(onDone) {
    const ps = LB.state.products.filter((p) => p.status === 'active');
    const s = LB.sheet('บันทึกการผลิตนอกรอบ', `
      <div class="field"><label for="xr-p">เมนู</label><select id="xr-p" class="input">${ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><span class="label">จำนวนที่อบเสร็จ</span>${LB.stepper('qty', 1, 1, undefined, '')}</div>
      <div class="field"><label for="xr-d">วันที่ผลิต</label><input id="xr-d" class="input" type="date" value="${LB.today()}"></div>
      <button type="button" class="btn primary" data-save>บันทึก</button>`);
    LB.bindSteppers(s.el);
    s.el.querySelector('[data-save]').onclick = async () => {
      try {
        await LB.busy(() => LB.api('production.record', {
          productId: s.el.querySelector('#xr-p').value, qty: s.el.querySelector('input[name="qty"]').value,
          producedDate: s.el.querySelector('#xr-d').value
        }));
        s.close();
        LB.toast('บันทึกการผลิตแล้ว');
        onDone();
      } catch (e) { LB.error(e); }
    };
  }

  LB.views.production = async (root, params, query, alive) => {
    root.innerHTML = LB.topbar('บันทึกการผลิต') + LB.loadingHtml;
    let stock = await LB.api('stock.list');
    if (!alive()) return;
    let roundId = query.round || (stock.rounds.find((r) => r.state !== 'open') || stock.rounds[0] || {}).id || '';
    if (roundId && !stock.rounds.some((r) => r.id === roundId)) {
      const r = await LB.api('rounds.get', { id: roundId });
      stock.rounds.unshift({ id: r.id, bake_date: r.bake_date, state: r.state });
    }
    let plan = roundId ? await LB.api('production.plan', { roundId }) : null;
    if (!alive()) return;
    const products = {};
    LB.state.products.forEach((p) => { products[p.id] = p; });

    const paint = () => {
      const shelf = plan && plan.items.length ? products[plan.items[0].product_id] : null;
      root.innerHTML = `${LB.topbar('บันทึกการผลิต')}<div class="page">
        ${stock.rounds.length ? `<div class="chips" data-rounds>${stock.rounds.map((r) => `<button type="button" class="chip soft" data-r="${esc(r.id)}" aria-pressed="${r.id === roundId}">รอบ ${esc(LB.dateTh(r.bake_date))}</button>`).join('')}</div>` : ''}
        ${plan ? `<p class="small muted" style="margin:0">รอบ ${esc(LB.dateTh(plan.bake_date))} · ${esc(LB.L.roundState[plan.state])}${shelf ? ` · ผลิตวันนี้หมดอายุ ${esc(LB.dateTh(LB.addDays(LB.today(), LB.n(shelf.shelf_days))))}` : ''}</p>
          ${plan.items.map((i) => `<section class="card" data-item="${esc(i.product_id)}">
            <h2>${esc(i.name)}</h2>
            <div class="grid3" style="text-align:center">
              <div class="tile" style="padding:8px;background:var(--surface)"><span class="small muted">จองแล้ว</span><span class="num">${i.ordered}${i.pending ? `<span class="small muted"> (รอมัดจำ ${i.pending})</span>` : ''}</span></div>
              <div class="tile" style="padding:8px;background:var(--surface)"><label class="small muted" for="ex-${esc(i.product_id)}">เผื่อขาย</label>
                <input id="ex-${esc(i.product_id)}" class="num" data-extra type="text" inputmode="numeric" value="${i.extra_qty}" style="width:100%;border:0;border-bottom:1px solid var(--line-strong);background:transparent;text-align:center;font-size:20px"></div>
              <div class="tile" style="padding:8px;background:var(--cheesecake);border-color:var(--cheesecake)"><span class="small">ต้องอบเพิ่ม</span><span class="num" style="font-weight:600">${i.toBake}</span></div>
            </div>
            ${i.produced ? `<span class="small muted">อบแล้ว ${i.produced} ${esc(i.unit)} · ส่งมอบแล้ว ${i.delivered}</span>` : ''}
            <div class="row"><label class="label grow" for="bk-${esc(i.product_id)}">อบเสร็จ (${esc(i.unit)})</label>
              <input id="bk-${esc(i.product_id)}" class="input" data-baked type="text" inputmode="numeric" value="${i.toBake || ''}" placeholder="0" style="width:84px;text-align:center">
              <button type="button" class="btn primary" data-record style="min-height:44px;font-size:14px">บันทึก</button></div>
          </section>`).join('')}` : '<div class="empty">ยังไม่มีรอบผลิต <a href="#/rounds/new">เปิดรอบผลิต</a></div>'}
        <button type="button" class="btn" data-extra-record>${LB.icon('plus')}บันทึกการผลิตนอกรอบ</button>
        <p class="hint" style="margin:-8px 0 0">บันทึกแล้ว ระบบเพิ่มของในตู้ และตั้งวันหมดอายุตามอายุขายของเมนูให้อัตโนมัติ</p>

        <section class="stack">
          <h2>ในตู้ตอนนี้</h2>
          ${stock.stock.length ? stock.stock.map((x) => `<div class="card tight">
            <div class="row between top"><span class="label grow" style="font-size:16px">${esc(x.name)}</span>
            <span class="num nowrap" style="font-size:16px">${x.physical} ${esc(x.unit)}</span></div>
            <span class="small muted">จองแล้ว ${x.committed} · ขายได้ ${Math.max(0, x.free)}${x.free < 0 ? ` · <span class="danger-text">ขาด ${-x.free}</span>` : ''}</span>
            ${x.batches.map((b) => `<button type="button" class="row between" data-batch="${esc(b.id)}" data-pid="${esc(x.product_id)}" style="border:0;border-top:1px solid var(--line);background:none;padding:8px 0 0;text-align:left;cursor:pointer;width:100%">
              <span class="small grow">ผลิต ${esc(LB.dateShort(b.produced_date))} · เหลือ ${b.remaining}${LB.n(b.discount_price) ? ` · ลดเหลือ ${LB.money(b.discount_price)}` : ''}</span>
              ${b.state === 'expired' ? LB.badge('expired', 'หมดอายุแล้ว') : (b.state === 'warn' ? LB.badge('warn', 'หมดอายุ ' + LB.relDay(b.expire_date)) : `<span class="small muted">หมดอายุ ${esc(LB.dateShort(b.expire_date))}</span>`)}
              ${LB.icon('chevron')}</button>`).join('')}
          </div>`).join('') : '<p class="muted" style="margin:0">ยังไม่มีของในตู้</p>'}
        </section>
      </div>`;
      bind();
    };

    const refresh = async () => {
      stock = await LB.api('stock.list');
      if (roundId) plan = await LB.api('production.plan', { roundId });
      paint();
    };

    function bind() {
      const chips = root.querySelector('[data-rounds]');
      if (chips) chips.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-r]');
        if (!b || b.dataset.r === roundId) return;
        roundId = b.dataset.r;
        history.replaceState(null, '', '#/production?round=' + encodeURIComponent(roundId));
        try { plan = await LB.busy(() => LB.api('production.plan', { roundId })); paint(); } catch (err) { LB.error(err); }
      });
      root.querySelectorAll('[data-item]').forEach((card) => {
        const pid = card.dataset.item;
        card.querySelector('[data-extra]').addEventListener('change', async (e) => {
          try { plan = await LB.busy(() => LB.api('production.setExtra', { roundId, productId: pid, extra: e.target.value })); paint(); } catch (err) { LB.error(err); }
        });
        card.querySelector('[data-record]').onclick = async () => {
          const qty = card.querySelector('[data-baked]').value;
          if (!(Number(qty) > 0)) { LB.error('ใส่จำนวนที่อบเสร็จ'); return; }
          try {
            plan = await LB.busy(() => LB.api('production.record', { roundId, productId: pid, qty }));
            stock = await LB.api('stock.list');
            LB.toast('บันทึกการผลิตแล้ว');
            paint();
          } catch (err) { LB.error(err); }
        };
      });
      root.querySelector('[data-extra-record]').onclick = () => extraRecord(() => refresh().catch(LB.error));
      root.querySelectorAll('[data-batch]').forEach((b) => {
        b.onclick = () => {
          const x = stock.stock.find((s) => s.product_id === b.dataset.pid);
          batchActions(x.batches.find((y) => y.id === b.dataset.batch), x, () => refresh().catch(LB.error));
        };
      });
    }
    paint();
  };
})();
