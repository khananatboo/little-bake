/* รอบผลิต: รายการ ฟอร์ม และรายละเอียด */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  LB.views.rounds = async (root, params, query, alive) => {
    root.innerHTML = LB.topbar('รอบผลิต') + LB.loadingHtml;
    const list = await LB.api('rounds.list', { limit: 60 });
    if (!alive()) return;
    const current = list.filter((r) => ['open', 'closed', 'baked'].includes(r.state));
    const past = list.filter((r) => !['open', 'closed', 'baked'].includes(r.state));
    const card = (r) => `<a class="card link" href="#/round/${esc(r.id)}">
      <div class="row between top"><div class="stack tight" style="gap:0"><h2>รอบผลิต ${esc(LB.dateTh(r.bake_date))}</h2>
      <span class="small muted">ปิดรับ ${esc(LB.dateTh(r.close_date))} · ${r.orderCount} ออเดอร์</span></div>${LB.roundBadge(r.state)}</div>
      <span class="small">${r.items.map((i) => `${esc(i.name)} ${i.ordered}/${i.max_qty}`).join(' · ')}</span></a>`;
    root.innerHTML = `${LB.topbar('รอบผลิต')}<div class="page">
      <a class="btn primary" href="#/rounds/new">${LB.icon('plus')}เปิดรอบผลิตใหม่</a>
      ${current.length ? current.map(card).join('') : '<div class="empty">ยังไม่มีรอบที่กำลังดำเนินอยู่</div>'}
      ${past.length ? `<h2 class="small muted" style="font-family:var(--font-body);font-weight:500">รอบที่ผ่านมา</h2>${past.map(card).join('')}` : ''}
    </div>`;
  };

  LB.views.roundForm = async (root, params, query, alive) => {
    const editId = params[0] || '';
    root.innerHTML = LB.topbar(editId ? 'แก้ไขรอบผลิต' : 'เปิดรอบผลิต', editId ? '#/round/' + editId : '#/rounds') + LB.loadingHtml;
    const existing = editId ? await LB.api('rounds.get', { id: editId }) : null;
    if (!alive()) return;
    const s = LB.state.settings;
    const cutoff = LB.n(s.cutoff_days);
    const products = LB.state.products.filter((p) => p.status === 'active' && p.preorder !== false);
    const sel = {};
    if (existing) existing.items.forEach((i) => { sel[i.product_id] = { max: i.max_qty, extra: i.extra_qty, ordered: i.ordered }; });
    let bake = existing ? existing.bake_date : LB.addDays(LB.today(), cutoff + 1);
    let close = existing ? existing.close_date : LB.addDays(bake, -cutoff);
    let closeTouched = !!existing;
    root.innerHTML = `${LB.topbar(editId ? 'แก้ไขรอบผลิต' : 'เปิดรอบผลิต', editId ? '#/round/' + editId : '#/rounds')}
      <form class="page no-nav" data-form novalidate>
        <div class="grid2"><div class="field"><label for="rf-bake">วันผลิต</label><input id="rf-bake" class="input" type="date" value="${esc(bake)}"></div>
        <div class="field"><label for="rf-close">ปิดรับ</label><input id="rf-close" class="input" type="date" value="${esc(close)}"></div></div>
        <span class="hint" style="margin-top:-8px">ค่าเริ่มต้นปิดรับ ${cutoff} วันก่อนวันผลิต หรือปิดเองเมื่อรับครบ</span>
        <section class="stack">
          <div class="section-title"><h2>เมนูในรอบ</h2><span class="small muted">เลือก 1–2 เมนู</span></div>
          ${products.map((p) => {
            const v = sel[p.id];
            return `<div class="card tight ${v ? 'selected' : ''}" data-p="${esc(p.id)}">
              <div class="row"><input id="rp-${esc(p.id)}" type="checkbox" class="check" ${v ? 'checked' : ''} ${v && v.ordered ? 'disabled' : ''}>
              <label for="rp-${esc(p.id)}" class="grow stack tight" style="gap:0"><span class="label" style="font-size:16px">${esc(p.name)}</span>
              <span class="small muted">${LB.money(p.price)} บาท · อายุ ${p.shelf_days} วัน ${esc(p.storage || '')}</span></label></div>
              <div class="row between" data-qty ${v ? '' : 'hidden'}><span style="font-size:14px">รับสูงสุด (${esc(p.unit)})</span>
              ${LB.stepper('max', v ? v.max : 10, v && v.ordered ? v.ordered : 1, undefined, ' ' + p.name)}</div>
              ${v && v.ordered ? `<span class="hint">มีออเดอร์แล้ว ${v.ordered} ${esc(p.unit)}</span>` : ''}</div>`;
          }).join('')}
        </section>
        <div class="field"><label for="rf-note">หมายเหตุ</label><input id="rf-note" class="input" value="${esc(existing ? existing.note : '')}" maxlength="300"></div>
        <section class="card tight row between"><span class="small muted">ถ้าขายครบทั้งรอบ</span><span class="num money" style="font-size:20px" data-pot></span></section>
        <button class="btn primary" type="submit">${editId ? 'บันทึก' : 'เปิดรอบ'}</button>
      </form>`;
    const form = root.querySelector('[data-form]');
    const bakeIn = root.querySelector('#rf-bake');
    const closeIn = root.querySelector('#rf-close');
    const collect = () => [...root.querySelectorAll('[data-p]')].filter((c) => c.querySelector('.check').checked).map((c) => ({
      product_id: c.dataset.p, max_qty: Math.round(Number(c.querySelector('[data-qty] input').value) || 0),
      extra_qty: sel[c.dataset.p] ? sel[c.dataset.p].extra : 0
    }));
    const pot = () => {
      const sum = collect().reduce((a, i) => a + i.max_qty * LB.n((products.find((p) => p.id === i.product_id) || {}).price), 0);
      root.querySelector('[data-pot]').textContent = LB.baht(sum);
    };
    pot();
    bakeIn.addEventListener('change', () => {
      if (!closeTouched && LB.isDate(bakeIn.value)) closeIn.value = LB.addDays(bakeIn.value, -cutoff);
    });
    closeIn.addEventListener('change', () => { closeTouched = true; });
    form.addEventListener('change', (e) => {
      if (!e.target.classList.contains('check')) return;
      const c = e.target.closest('[data-p]');
      c.classList.toggle('selected', e.target.checked);
      c.querySelector('[data-qty]').hidden = !e.target.checked;
      pot();
    });
    LB.bindSteppers(form, pot);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const items = collect();
      if (!items.length) { LB.error('เลือกอย่างน้อย 1 เมนู'); return; }
      try {
        const r = await LB.busy(() => LB.api('rounds.save', {
          id: editId || undefined, bake_date: bakeIn.value, close_date: closeIn.value,
          note: root.querySelector('#rf-note').value, items
        }));
        LB.toast(editId ? 'บันทึกรอบผลิตแล้ว' : 'เปิดรอบผลิตแล้ว');
        location.replace('#/round/' + encodeURIComponent(r.id) + (editId ? '' : '?story=1'));
      } catch (err) { LB.error(err); }
    });
  };

  LB.views.round = async (root, params, query, alive) => {
    root.innerHTML = LB.topbar('รอบผลิต', '#/rounds') + LB.loadingHtml;
    let r = await LB.api('rounds.get', { id: params[0] });
    if (!alive()) return;
    const paint = () => {
      const editable = ['open', 'closed'].includes(r.state);
      root.innerHTML = `${LB.topbar('รอบผลิต ' + LB.dateTh(r.bake_date), '#/rounds', editable ? `<a class="icon-btn" href="#/round/${esc(r.id)}/edit" aria-label="แก้ไขรอบผลิต">${LB.icon('edit')}</a>` : '')}
      <div class="page">
        <div class="row wrap">${LB.roundBadge(r.state)}<span class="small muted">ปิดรับ ${esc(LB.dateTh(r.close_date))} · ${r.orderCount} ออเดอร์</span></div>
        ${r.note ? `<p class="muted" style="margin:0">${esc(r.note)}</p>` : ''}
        <section class="card">${LB.roundItemsHtml(r)}
          <div class="kv"><span class="muted">ถ้าขายครบทั้งรอบ</span><span class="num money">${LB.baht(r.potential)}</span></div></section>
        <div class="btn-row"><button type="button" class="btn" data-a="story">${LB.icon('share')}ภาพประกาศ</button>
          <button type="button" class="btn" data-a="copy">${LB.icon('copy')}ข้อความประกาศ</button></div>
        <div class="btn-row">
          ${r.state === 'open' ? `<a class="btn primary" href="#/orders/new?round=${esc(r.id)}">${LB.icon('plus')}ออเดอร์ในรอบนี้</a>` : ''}
          <a class="btn" href="#/production?round=${esc(r.id)}">${LB.icon('cake')}หน้าผลิต</a></div>
        <section class="stack">
          <h2>ออเดอร์ในรอบ</h2>
          ${r.orders.length ? r.orders.map((o, idx) => `${idx ? '<hr class="divider">' : ''}${LB.orderRowHtml(o, `<span class="num nowrap" style="font-size:14px">${LB.baht(LB.n(o.total) + LB.n(o.shipping_fee))}</span>`)}`).join('') : '<p class="muted" style="margin:0">ยังไม่มีออเดอร์</p>'}
        </section>
        ${r.state === 'open' ? '<button type="button" class="btn" data-a="close">ปิดรับออเดอร์ตอนนี้</button>' : ''}
        ${r.state === 'closed' ? '<button type="button" class="btn" data-a="reopen">เปิดรับอีกครั้ง</button>' : ''}
        ${editable && !r.activeOrders ? '<button type="button" class="btn danger" data-a="cancel">ยกเลิกรอบนี้</button>' : ''}
      </div>`;
      root.querySelectorAll('[data-a]').forEach((b) => {
        b.onclick = async () => {
          const a = b.dataset.a;
          if (a === 'story') LB.openStory(r);
          else if (a === 'copy') LB.copyText(LB.msgRound(r));
          else {
            const map = { close: ['closed', 'ปิดรับออเดอร์รอบนี้?'], reopen: ['open', 'เปิดรับออเดอร์อีกครั้ง?'], cancel: ['cancelled', 'ยกเลิกรอบผลิตนี้?'] };
            const [status, q] = map[a];
            if (!(await LB.confirm(q, a === 'reopen' ? 'ถ้าวันปิดรับผ่านไปแล้ว ระบบจะเลื่อนวันปิดรับเป็นวันนี้' : 'เปลี่ยนกลับได้ภายหลัง', 'ยืนยัน', a === 'cancel'))) return;
            try { r = await LB.busy(() => LB.api('rounds.setStatus', { id: r.id, status })); paint(); } catch (e) { LB.error(e); }
          }
        };
      });
    };
    paint();
    if (query.story) {
      history.replaceState(null, '', '#/round/' + encodeURIComponent(r.id));
      LB.openStory(r);
    }
  };
})();
