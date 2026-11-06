/* เฟส 3: ค่าใช้จ่ายของร้าน และกำไรขาดทุน */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;
  const DEFAULT_CATS = ['ค่าแก๊ส', 'ค่าไฟ', 'ค่าน้ำ', 'ค่าเช่า', 'ค่าแรง', 'ค่าส่ง', 'ค่าการตลาด', 'อุปกรณ์', 'ค่าธรรมเนียม', 'อื่น ๆ'];
  const METHODS = [['cash', 'เงินสด'], ['transfer', 'โอน'], ['other', 'อื่น ๆ']];
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const b2 = (v) => LB.n(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y + 543}`; };
  const monthRange = (m) => {
    const [y, mo] = m.split('-').map(Number);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`];
  };
  const shiftMonth = (m, k) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1 + k, 1)).toISOString().slice(0, 7);
  };

  /* ---------------- ค่าใช้จ่าย ---------------- */

  function expenseSheet(e, cats, copy, onDone) {
    const edit = !!e && !copy;
    const method = e ? e.method : 'cash';
    const s = LB.sheet(edit ? 'แก้ค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย', `
      <div class="field"><label for="ex-cat">หมวด</label>
        <input id="ex-cat" class="input" list="ex-cats" value="${esc(e ? e.category : '')}" maxlength="50" placeholder="เลือกด้านล่าง หรือพิมพ์หมวดใหม่" autocomplete="off">
        <datalist id="ex-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <div class="chips" data-cats>${cats.slice(0, 14).map((c) => `<button type="button" class="chip soft" data-c="${esc(c)}" aria-pressed="${!!e && e.category === c}">${esc(c)}</button>`).join('')}</div></div>
      <div class="grid2">
        <div class="field"><label for="ex-amt">จำนวนเงิน (บาท)</label><input id="ex-amt" class="input" inputmode="decimal" value="${e ? esc(Number(e.amount)) : ''}"></div>
        <div class="field"><label for="ex-date">วันที่จ่าย</label><input id="ex-date" class="input" type="date" value="${edit ? esc(e.date) : LB.today()}" max="${LB.today()}"></div>
      </div>
      <div class="field"><span class="label">จ่ายด้วย</span><div class="seg" data-method>${METHODS.map(([k, l]) => `<button type="button" data-m="${k}" aria-pressed="${method === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><label for="ex-note">หมายเหตุ</label><input id="ex-note" class="input" maxlength="200" value="${esc(e ? e.note : '')}" placeholder="เช่น บิลเดือนตุลาคม"></div>
      <button type="button" class="btn primary" data-save>บันทึก</button>
      ${edit ? '<button type="button" class="btn" data-copy>บันทึกซ้ำเป็นรายการใหม่</button><button type="button" class="btn danger" data-del>ลบรายการนี้</button>' : ''}`);
    const el = s.el;
    let m = method;
    el.querySelector('[data-cats]').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-c]');
      if (!b) return;
      el.querySelector('#ex-cat').value = b.dataset.c;
      el.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    el.querySelector('[data-method]').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      m = b.dataset.m;
      el.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    el.querySelector('[data-save]').onclick = async () => {
      try {
        await LB.busy(() => LB.api('expenses.save', {
          id: edit ? e.id : undefined, category: el.querySelector('#ex-cat').value, amount: el.querySelector('#ex-amt').value.replace(/,/g, ''),
          date: el.querySelector('#ex-date').value, method: m, note: el.querySelector('#ex-note').value
        }));
        s.close();
        LB.toast('บันทึกค่าใช้จ่ายแล้ว');
        onDone();
      } catch (err) { LB.error(err); }
    };
    const cp = el.querySelector('[data-copy]');
    if (cp) cp.onclick = () => { s.close(); expenseSheet(e, cats, true, onDone); };
    const del = el.querySelector('[data-del]');
    if (del) {
      del.onclick = async () => {
        if (!(await LB.confirm('ลบรายการนี้?', `${e.category} ${LB.baht(e.amount)} วันที่ ${LB.dateTh(e.date)}`, 'ลบ', true))) return;
        try {
          await LB.busy(() => LB.api('expenses.delete', { id: e.id }));
          s.close();
          LB.toast('ลบแล้ว');
          onDone();
        } catch (err) { LB.error(err); }
      };
    }
  }

  LB.views.expenses = async (root, params, query, alive) => {
    let month = /^\d{4}-\d{2}$/.test(query.m || '') ? query.m : LB.today().slice(0, 7);
    let cats = DEFAULT_CATS;
    root.innerHTML = `${LB.topbar('ค่าใช้จ่ายร้าน', '#/more')}<div class="page">
      <div class="row between"><button type="button" class="icon-btn" data-prev aria-label="เดือนก่อน"><span style="display:inline-flex;transform:rotate(180deg)">${LB.icon('chevron')}</span></button>
        <h2 data-month style="margin:0"></h2><button type="button" class="icon-btn" data-next aria-label="เดือนถัดไป">${LB.icon('chevron')}</button></div>
      <button type="button" class="btn solid" data-add>${LB.icon('plus')}เพิ่มค่าใช้จ่าย</button>
      <p class="small muted" style="margin:0">ซื้อวัตถุดิบให้บันทึกที่ วัตถุดิบ > รับของเข้า · ของที่ซื้อมาใช้กับการอบชุดเดียว ใส่เป็นค่าใช้จ่ายอื่นตอนบันทึกผลิต จะได้ไม่นับซ้ำ</p>
      <div class="stack" data-body></div></div>`;
    const body = root.querySelector('[data-body]');
    const load = async () => {
      root.querySelector('[data-month]').textContent = monthLabel(month);
      root.querySelector('[data-next]').disabled = month >= LB.today().slice(0, 7);
      body.innerHTML = LB.loadingHtml;
      const [from, to] = monthRange(month);
      let r;
      try { r = await LB.api('expenses.list', { from, to }); } catch (e) { LB.error(e); body.innerHTML = ''; return; }
      if (!alive()) return;
      cats = [...new Set([...r.categories, ...DEFAULT_CATS])];
      const max = Math.max(1, ...r.byCategory.map((c) => LB.n(c.amount)));
      const days = [];
      r.expenses.forEach((x) => { const g = days.find((d) => d.date === x.date); if (g) g.list.push(x); else days.push({ date: x.date, list: [x] }); });
      body.innerHTML = `<section class="card">
          <div class="kv total"><span>รวม${monthLabel(month)}</span><span class="num money">${LB.baht(r.total)}</span></div>
          ${r.byCategory.map((c) => `<div class="row small"><span style="width:96px" class="nowrap">${esc(c.category)}</span>
            <span class="grow bar" style="height:10px"><span class="a" style="width:${(LB.n(c.amount) / max) * 100}%"></span></span>
            <span class="nowrap right" style="width:84px">${LB.money(c.amount)}</span></div>`).join('') || '<p class="muted" style="margin:0">ยังไม่มีค่าใช้จ่ายในเดือนนี้</p>'}
        </section>
        ${days.map((d) => `<h3 style="margin:8px 0 0">${esc(LB.dateTh(d.date))}</h3>${d.list.map((x) => `<button type="button" class="card tight link row" data-id="${esc(x.id)}" style="text-align:left;font:inherit">
            <span class="grow stack tight" style="gap:0"><span class="label">${esc(x.category)}</span>
              <span class="small muted">${esc((METHODS.find(([k]) => k === x.method) || [0, ''])[1])}${x.note ? ' · ' + esc(x.note) : ''}</span></span>
            <span class="num nowrap">${LB.money(x.amount)}</span>${LB.icon('chevron')}</button>`).join('')}`).join('')}`;
      body.querySelectorAll('[data-id]').forEach((b) => {
        b.onclick = () => expenseSheet(r.expenses.find((x) => x.id === b.dataset.id), cats, false, load);
      });
    };
    root.querySelector('[data-prev]').onclick = () => { month = shiftMonth(month, -1); load(); };
    root.querySelector('[data-next]').onclick = () => { if (month < LB.today().slice(0, 7)) { month = shiftMonth(month, 1); load(); } };
    root.querySelector('[data-add]').onclick = () => expenseSheet(null, cats, false, load);
    await load();
  };

  /* ---------------- กำไรขาดทุน ---------------- */

  LB.views.profit = async (root, params, query, alive) => {
    let preset = query.p || 'month';
    let [from, to] = LB.presetRange(preset);
    root.innerHTML = `${LB.topbar('กำไรขาดทุน', '#/more')}<div class="page">
      <div class="chips scroll" data-presets>${[['month', 'เดือนนี้'], ['lastmonth', 'เดือนก่อน'], ['quarter', 'ไตรมาสนี้'], ['year', 'ปีนี้'], ['custom', 'กำหนดเอง']]
        .map(([k, l]) => `<button type="button" class="chip" data-p="${k}" aria-pressed="${k === preset}">${l}</button>`).join('')}</div>
      <div class="grid2" data-custom ${preset === 'custom' ? '' : 'hidden'}>
        <div class="field"><label for="pf-from">ตั้งแต่</label><input id="pf-from" class="input" type="date" value="${from}"></div>
        <div class="field"><label for="pf-to">ถึง</label><input id="pf-to" class="input" type="date" value="${to}"></div></div>
      <p class="small muted" style="margin:0" data-range></p>
      <div class="stack" data-body></div></div>`;
    const body = root.querySelector('[data-body]');
    const row = (label, v, opts = {}) => `<div class="kv ${opts.total ? 'total' : ''}"><span class="${opts.sub ? 'small muted' : ''}" style="${opts.sub ? 'padding-left:12px' : ''}">${label}</span>
      <span class="nowrap ${opts.cls || ''}">${(opts.neg ? LB.n(v) !== 0 : LB.n(v) < 0) ? '−' : ''}${b2(Math.abs(LB.n(v)))}</span></div>`;
    const load = async () => {
      root.querySelector('[data-range]').textContent = from === to ? LB.dateTh(from, true) : `${LB.dateTh(from, true)} – ${LB.dateTh(to, true)}`;
      body.innerHTML = LB.loadingHtml;
      let r;
      try { r = await LB.api('report.profit', { from, to }); } catch (e) { LB.error(e); body.innerHTML = ''; return; }
      if (!alive()) return;
      const sales = LB.n(r.sales);
      const income = sales + LB.n(r.shipping) + LB.n(r.tips);
      const gross = sales - LB.n(r.cogs);
      const net = income - LB.n(r.cogs) - LB.n(r.lostCost) - LB.n(r.materialLoss) - LB.n(r.expenses);
      const pct = (v) => (sales ? ` (${String(Math.round((v / sales) * 100)).replace('-', '−')}%)` : '');
      const notes = [];
      if (LB.n(r.cogsEstQty)) notes.push(`${r.cogsEstQty} ชิ้นที่ขายมาจากการอบที่ไม่ได้ตัดวัตถุดิบ ใช้ต้นทุนประมาณจากสูตรตามราคาวันนี้`);
      if (LB.n(r.cogsUnknownQty)) notes.push(`${r.cogsUnknownQty} ชิ้นเป็นเมนูที่ยังไม่มีสูตร จึงยังไม่มีต้นทุน กำไรจริงจะต่ำกว่าที่แสดง`);
      if (LB.n(r.lostUnknownQty)) notes.push(`ของเสีย ${r.lostUnknownQty} ชิ้นยังไม่มีต้นทุน`);
      const cash = r.cash;
      const cashNet = LB.n(cash.moneyIn) - LB.n(cash.purchases) - LB.n(cash.expenses) - LB.n(cash.productionOther);
      body.innerHTML = `
        <div class="grid2">
          <div class="tile"><span class="small muted">ยอดขายสุทธิ</span><span class="num money">${LB.baht(Math.round(sales))}</span></div>
          <div class="tile"><span class="small muted">กำไรขั้นต้น${pct(gross)}</span><span class="num">${LB.baht(Math.round(gross))}</span></div>
          <div class="tile"><span class="small muted">ค่าใช้จ่าย</span><span class="num">${LB.baht(Math.round(LB.n(r.expenses)))}</span></div>
          <div class="tile"><span class="small muted">กำไรสุทธิ${pct(net)}</span><span class="num ${net < 0 ? 'danger-text' : 'money'}">${net < 0 ? '−' : ''}${LB.baht(Math.round(Math.abs(net)))}</span></div>
        </div>
        <section class="card stack tight">
          <h2>กำไรขาดทุน</h2>
          ${row('ยอดขายขนม (ก่อนส่วนลด)', r.grossSales)}
          ${LB.n(r.discount) ? row('ส่วนลด', r.discount, { neg: true, sub: true }) : ''}
          ${LB.n(r.shipping) ? row('ค่าส่งที่เก็บจากลูกค้า', r.shipping, { sub: true }) : ''}
          ${LB.n(r.tips) ? row('ทิป', r.tips, { sub: true }) : ''}
          ${row('รายได้รวม', income, { total: true })}
          <hr class="divider">
          ${row('ต้นทุนขนมที่ขาย', r.cogs, { neg: true })}
          ${row('กำไรขั้นต้น' + pct(gross), gross, { total: true })}
          <hr class="divider">
          ${LB.n(r.lostCost) ? row(`ขนมเสียหรือทิ้ง ${r.lostQty} ชิ้น (ต้นทุน)`, r.lostCost, { neg: true }) : ''}
          ${LB.n(r.materialLoss) ? row('วัตถุดิบหายหรือทิ้ง (จากนับสต็อก)', r.materialLoss, { neg: true }) : ''}
          ${row('ค่าใช้จ่ายร้าน', r.expenses, { neg: true })}
          ${r.byCategory.map((c) => row(esc(c.category), c.amount, { sub: true })).join('')}
          <hr class="divider">
          ${row('กำไรสุทธิ', net, { total: true, cls: net < 0 ? 'danger-text' : 'money' })}
          ${notes.length ? `<div class="stack tight">${notes.map((x) => `<span class="small danger-text">${esc(x)}</span>`).join('')}</div>` : ''}
          <a class="small" href="#/expenses">บันทึกหรือแก้ค่าใช้จ่าย</a>
        </section>

        <section class="card"><h2>กำไรรายเมนู</h2>
          ${r.byProduct.length ? `<table class="data"><thead><tr><th>เมนู</th><th class="r">ยอดขาย</th><th class="r">ต้นทุน</th><th class="r">กำไร</th></tr></thead><tbody>
          ${r.byProduct.map((x) => {
            const unknown = LB.n(x.unknown) > 0;
            const g = LB.n(x.revenue) - LB.n(x.cogs);
            return `<tr><td>${esc(x.name)}<div class="small muted">ขาย ${x.qty} ${esc(x.unit)}${LB.n(x.lost_qty) ? ` · เสีย ${x.lost_qty}` : ''}${LB.n(x.sold) ? ` · ${b2(LB.n(x.cogs) / Math.max(1, LB.n(x.sold) - LB.n(x.unknown)))}/${esc(x.unit)}` : ''}</div></td>
              <td class="r">${LB.money(x.revenue)}</td>
              <td class="r">${unknown && !LB.n(x.cogs) ? '<span class="danger-text">ไม่มี</span>' : LB.money(Math.round(LB.n(x.cogs)))}${LB.n(x.est_qty) || (unknown && LB.n(x.cogs)) ? '*' : ''}</td>
              <td class="r">${unknown ? '<span class="muted">–</span>' : `<span class="${g < 0 ? 'danger-text' : ''}">${LB.money(Math.round(g))}</span>${LB.n(x.revenue) ? `<div class="small muted">${Math.round((g / LB.n(x.revenue)) * 100)}%</div>` : ''}`}</td></tr>`;
          }).join('')}</tbody></table>
          <p class="small muted" style="margin:0">ยอดขายรายเมนูยังไม่หักส่วนลดท้ายบิล · * มีต้นทุนประมาณจากสูตร</p>` : '<p class="muted" style="margin:0">ยังไม่มียอดขายในช่วงนี้</p>'}
        </section>

        <section class="card stack tight"><h2>เงินเข้าออกจริง</h2>
          ${row('เงินเข้าจากลูกค้า', cash.moneyIn)}
          ${row('จ่ายซื้อวัตถุดิบ (รับของเข้า)', cash.purchases, { neg: true })}
          ${row('ค่าใช้จ่ายร้าน', cash.expenses, { neg: true })}
          ${LB.n(cash.productionOther) ? row('ค่าใช้จ่ายอื่นตอนบันทึกผลิต', cash.productionOther, { neg: true }) : ''}
          ${row('เงินเหลือสุทธิ', cashNet, { total: true, cls: cashNet < 0 ? 'danger-text' : '' })}
          <p class="small muted" style="margin:0">ต่างจากกำไร เพราะวัตถุดิบที่ซื้อมาบางส่วนยังเก็บไว้ใช้ทีหลัง และเงินเข้ารวมมัดจำของออเดอร์ที่ยังไม่ส่ง</p>
        </section>

        <section class="card stack tight"><h2>มูลค่าของในร้านตอนนี้</h2>
          ${row('วัตถุดิบคงเหลือ (ตามราคาที่ซื้อ)', r.stockValue.materials)}
          ${row('ขนมในตู้ (ต้นทุน)', r.stockValue.products)}
        </section>
        <p class="small muted" style="margin:0">ยอดขายนับจากออเดอร์ที่ส่งมอบแล้ว ต้นทุนขายคิดจากต้นทุนจริงของชุดที่อบ (ราคาที่จ่ายจริงของวัตถุดิบ + ค่าใช้จ่ายอื่นตอนอบ)</p>
        <a class="btn" href="#/report">ดูสรุปยอดขาย</a>`;
    };
    root.querySelector('[data-presets]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      preset = b.dataset.p;
      root.querySelectorAll('[data-p]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      root.querySelector('[data-custom]').hidden = preset !== 'custom';
      if (preset !== 'custom') { [from, to] = LB.presetRange(preset); load(); }
    });
    root.querySelector('[data-custom]').addEventListener('change', () => {
      const f = root.querySelector('#pf-from').value;
      const t = root.querySelector('#pf-to').value;
      if (f && t && f <= t) { from = f; to = t; load(); }
    });
    await load();
  };
})();
