/* เพิ่มเติม: สรุปยอด ขายหน้าร้าน เมนูและราคา สูตร วัตถุดิบ ตั้งค่าร้าน */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  LB.views.more = async (root) => {
    const link = (href, icon, title, sub) => `<a class="card tight link row" href="${href}">${LB.icon(icon)}
      <span class="grow stack tight" style="gap:0"><span class="label" style="font-size:16px">${title}</span>${sub ? `<span class="small muted">${sub}</span>` : ''}</span>${LB.icon('chevron')}</a>`;
    root.innerHTML = `${LB.topbar('เพิ่มเติม')}<div class="page">
      ${link('#/report', 'chart', 'สรุปยอดขาย', 'วันนี้ เดือนนี้ ไตรมาส ปี')}
      ${link('#/sale', 'cart', 'ขายหน้าร้าน', 'ขายของในตู้ที่ไม่ได้จองล่วงหน้า')}
      ${link('#/products', 'tag', 'เมนูและราคา', LB.state.products.filter((p) => p.status === 'active').length + ' เมนูที่เปิดขาย')}
      ${link('#/recipes', 'book', 'สูตรและต้นทุน', 'ต้นทุนต่อชิ้นและส่วนต่างของแต่ละเมนู')}
      ${link('#/materials', 'box', 'วัตถุดิบและสต็อก', 'รับของเข้า นับสต็อก ราคาที่ใช้คิดต้นทุน')}
      ${link('#/settings', 'settings', 'ตั้งค่าร้าน', 'PromptPay มัดจำ การยกเลิก ชื่อเพจ')}
      <button type="button" class="card tight link row" data-lock style="text-align:left;font:inherit">${LB.icon('lock')}<span class="grow stack tight" style="gap:0"><span class="label" style="font-size:16px">ล็อกแอป</span><span class="small muted">ต้องใส่ PIN ก่อนใช้ต่อ</span></span></button>
      <button type="button" class="card tight link row" data-pin style="text-align:left;font:inherit">${LB.icon('lock')}<span class="grow label" style="font-size:16px">เปลี่ยน PIN</span>${LB.icon('chevron')}</button>
      <button type="button" class="card tight link row" data-others style="text-align:left;font:inherit">${LB.icon('lock')}<span class="grow stack tight" style="gap:0"><span class="label" style="font-size:16px">ล็อกเครื่องอื่นทั้งหมด</span><span class="small muted">ใช้เมื่อมือถือหรือแท็บเล็ตหาย</span></span></button>
      <button type="button" class="card tight link row" data-logout style="text-align:left;font:inherit">${LB.icon('logout')}<span class="grow label" style="font-size:16px">ออกจากระบบ</span></button>
      <p class="small muted" style="margin:0">ผู้ใช้: ${esc(LB.state.user.name)} · ${esc((LB.session() || {}).email || '')} · Little Bake เวอร์ชัน ${esc(LB.APP_VERSION)}${LB.state.version !== LB.APP_VERSION ? ` (ฐานข้อมูล ${esc(LB.state.version)})` : ''}</p>
    </div>`;
    root.querySelector('[data-lock]').onclick = () => LB.lockApp();
    root.querySelector('[data-others]').onclick = async () => {
      if (!(await LB.confirm('ล็อกเครื่องอื่นทั้งหมด?', 'ทุกเครื่องยกเว้นเครื่องนี้ต้องใส่ PIN ก่อนใช้ต่อ ถ้ามือถือหาย ให้เปลี่ยน PIN ด้วย', 'ล็อกเครื่องอื่น'))) return;
      try {
        const r = await LB.busy(() => LB.api('lock.others'));
        LB.toast(r.locked ? 'ล็อกแล้ว ' + r.locked + ' เครื่อง' : 'ไม่มีเครื่องอื่นที่ปลดล็อกอยู่');
      } catch (e) { LB.error(e); }
    };
    root.querySelector('[data-logout]').onclick = async () => {
      if (await LB.confirm('ออกจากระบบ?', 'เมื่อกลับมาต้องใส่อีเมล รหัสผ่าน และ PIN อีกครั้ง', 'ออกจากระบบ')) LB.logout();
    };
    root.querySelector('[data-pin]').onclick = () => {
      const s = LB.sheet('เปลี่ยน PIN', `<div class="field"><label for="cp-old">PIN เดิม</label><input id="cp-old" class="input" type="password" inputmode="numeric" autocomplete="current-password"></div>
        <div class="field"><label for="cp-new">PIN ใหม่ 4–6 หลัก</label><input id="cp-new" class="input" type="password" inputmode="numeric" autocomplete="new-password"></div>
        <div class="field"><label for="cp-new2">ใส่ PIN ใหม่อีกครั้ง</label><input id="cp-new2" class="input" type="password" inputmode="numeric" autocomplete="new-password"></div>
        <button type="button" class="btn primary" data-save>บันทึก</button>`);
      s.el.querySelector('[data-save]').onclick = async () => {
        const n = s.el.querySelector('#cp-new').value;
        if (n !== s.el.querySelector('#cp-new2').value) { LB.error('PIN ใหม่สองช่องไม่ตรงกัน'); return; }
        try { await LB.busy(() => LB.api('users.changePin', { oldPin: s.el.querySelector('#cp-old').value, newPin: n })); s.close(); LB.toast('เปลี่ยน PIN แล้ว'); } catch (e) { LB.error(e); }
      };
    };
  };

  /* ---------------- สรุปยอดขาย ---------------- */

  function presetRange(key) {
    const t = LB.today();
    const [y, m] = t.split('-').map(Number);
    if (key === 'today') return [t, t];
    if (key === '7d') return [LB.addDays(t, -6), t];
    if (key === 'month') return [`${y}-${String(m).padStart(2, '0')}-01`, t];
    if (key === 'quarter') { const qm = Math.floor((m - 1) / 3) * 3 + 1; return [`${y}-${String(qm).padStart(2, '0')}-01`, t]; }
    if (key === 'year') return [`${y}-01-01`, t];
    return [t, t];
  }

  LB.views.report = async (root, params, query, alive) => {
    let preset = query.p || 'month';
    let [from, to] = presetRange(preset);
    const load = async () => {
      root.querySelector('[data-body]').innerHTML = LB.loadingHtml;
      const r = await LB.api('report.summary', { from, to });
      if (!alive()) return;
      const maxDay = Math.max(1, ...r.byDay.map((d) => d.sales));
      const vatPct = r.vatThreshold ? Math.min(100, (r.yearSales / r.vatThreshold) * 100) : 0;
      const target = preset === 'month' && r.monthlyTarget ? r.monthlyTarget : 0;
      root.querySelector('[data-body]').innerHTML = `
        <div class="grid2">
          <div class="tile"><span class="small muted">ยอดขาย</span><span class="num money">${LB.baht(r.sales)}</span></div>
          <div class="tile"><span class="small muted">ออเดอร์ที่ส่งมอบ</span><span class="num">${r.orders}</span></div>
          <div class="tile"><span class="small muted">เฉลี่ยต่อออเดอร์</span><span class="num">${LB.baht(Math.round(r.avgPerOrder))}</span></div>
          <div class="tile"><span class="small muted">เงินเข้า (สุทธิ)</span><span class="num">${LB.baht(r.moneyIn)}</span></div>
        </div>
        ${target ? `<section class="card tight"><div class="row between small"><span class="muted">เป้าเดือนนี้</span><span>${LB.money(r.sales)} / ${LB.money(target)}</span></div>
          <div class="bar"><span class="a" style="width:${Math.min(100, (r.sales / target) * 100)}%"></span></div></section>` : ''}
        <p class="small muted" style="margin:-4px 0 0">ยอดขายนับจากออเดอร์ที่ส่งมอบแล้ว ไม่รวมค่าส่งและทิป${r.discount ? ` · ให้ส่วนลดไป ${LB.baht(r.discount)}` : ''}${r.shipping ? ` · ค่าส่งที่เก็บ ${LB.baht(r.shipping)}` : ''}${LB.n(r.tips) ? ` · ได้ทิป ${LB.baht(r.tips)}` : ''}</p>

        ${r.byDay.length > 1 ? `<section class="card"><h2>ยอดรายวัน</h2>
          ${r.byDay.map((d) => `<div class="row small"><span style="width:64px" class="muted">${esc(LB.dateShort(d.date))}</span>
            <span class="grow bar" style="height:10px"><span class="a" style="width:${(d.sales / maxDay) * 100}%"></span></span>
            <span class="nowrap right" style="width:80px">${LB.money(d.sales)}</span></div>`).join('')}</section>` : ''}

        <section class="card"><h2>ขายดีตามเมนู</h2>
          ${r.byGroup.length ? `<table class="data"><thead><tr><th>เมนู</th><th class="r">จำนวน</th><th class="r">บาท</th></tr></thead><tbody>
          ${r.byGroup.map((g) => `<tr><td>${esc(g.group)}${r.byProduct.filter((p) => p.group === g.group).length > 1
            ? `<div class="small muted">${r.byProduct.filter((p) => p.group === g.group).map((p) => `${esc(p.name.replace(g.group, '').trim() || p.name)} ${p.qty}`).join(' · ')}</div>` : ''}</td>
            <td class="r">${g.qty}</td><td class="r">${LB.money(g.revenue)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="margin:0">ยังไม่มียอดขายในช่วงนี้</p>'}</section>

        <section class="card"><h2>ตามช่องทางสั่ง</h2>
          ${r.byChannel.length ? r.byChannel.map((c) => `<div class="kv"><span>${esc(LB.L.channel[c.channel] || c.channel)} · ${c.orders} ออเดอร์</span><span>${LB.baht(c.sales)}</span></div>`).join('') : '<p class="muted" style="margin:0">-</p>'}</section>

        <section class="card"><h2>เงินเข้าตามช่องทางชำระ</h2>
          ${Object.keys(r.byMethod).length ? Object.keys(r.byMethod).map((k) => `<div class="kv"><span>${esc(LB.L.method[k] || k)}</span><span>${LB.baht(r.byMethod[k])}</span></div>`).join('') : '<p class="muted" style="margin:0">-</p>'}
          ${r.refunds ? `<div class="kv"><span>คืนเงินลูกค้า</span><span class="danger-text">−${LB.baht(r.refunds)}</span></div>` : ''}
          <div class="kv"><span>มัดจำที่ถืออยู่ (ออเดอร์ยังไม่ส่ง)</span><span>${LB.baht(r.depositsHeld)}</span></div></section>

        ${r.waste.length ? `<section class="card"><h2>ของเสียที่ทิ้ง</h2>
          ${r.waste.map((w) => `<div class="kv"><span>${esc(w.name)} ${w.qty} ${esc(w.unit)}</span><span class="muted">ราคาขาย ${LB.baht(w.value)}</span></div>`).join('')}</section>` : ''}

        <section class="card tight"><div class="row between small"><span class="muted">ยอดขายปี ${esc(Number(to.slice(0, 4)) + 543)} เทียบเกณฑ์ VAT</span>
          <span>${LB.money(r.yearSales)} / ${LB.money(r.vatThreshold)}</span></div>
          <div class="bar"><span class="${vatPct >= 80 ? 'b' : 'a'}" style="width:${vatPct}%"></span></div></section>`;
    };
    root.innerHTML = `${LB.topbar('สรุปยอดขาย', '#/more')}<div class="page">
      <div class="chips" data-presets>${[['today', 'วันนี้'], ['7d', '7 วัน'], ['month', 'เดือนนี้'], ['quarter', 'ไตรมาสนี้'], ['year', 'ปีนี้'], ['custom', 'กำหนดเอง']]
        .map(([k, l]) => `<button type="button" class="chip" data-p="${k}" aria-pressed="${k === preset}">${l}</button>`).join('')}</div>
      <div class="grid2" data-custom ${preset === 'custom' ? '' : 'hidden'}>
        <div class="field"><label for="rp-from">ตั้งแต่</label><input id="rp-from" class="input" type="date" value="${from}"></div>
        <div class="field"><label for="rp-to">ถึง</label><input id="rp-to" class="input" type="date" value="${to}"></div></div>
      <p class="small muted" style="margin:0" data-range></p>
      <div class="stack" data-body></div></div>`;
    const rangeEl = root.querySelector('[data-range]');
    const showRange = () => { rangeEl.textContent = from === to ? LB.dateTh(from, true) : `${LB.dateTh(from, true)} – ${LB.dateTh(to, true)}`; };
    showRange();
    root.querySelector('[data-presets]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      preset = b.dataset.p;
      root.querySelectorAll('[data-p]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      root.querySelector('[data-custom]').hidden = preset !== 'custom';
      if (preset !== 'custom') { [from, to] = presetRange(preset); showRange(); load().catch(LB.error); }
    });
    root.querySelectorAll('#rp-from, #rp-to').forEach((el) => el.addEventListener('change', () => {
      from = root.querySelector('#rp-from').value; to = root.querySelector('#rp-to').value;
      if (LB.isDate(from) && LB.isDate(to)) { showRange(); load().catch(LB.error); }
    }));
    await load();
  };

  /* ---------------- ขายหน้าร้าน ---------------- */

  LB.views.sale = async (root, params, query, alive) => {
    root.innerHTML = LB.topbar('ขายหน้าร้าน', '#/home') + LB.loadingHtml;
    const st = await LB.api('stock.list');
    if (!alive()) return;
    const items = LB.sortByName(st.stock.filter((x) => x.free > 0), (x) => x.name).map((x) => {
      const disc = (x.batches.find((b) => LB.n(b.discount_price) > 0 && b.state !== 'expired') || {}).discount_price;
      return { ...x, sellPrice: LB.n(disc) || x.price, discounted: !!LB.n(disc) };
    });
    root.innerHTML = `${LB.topbar('ขายหน้าร้าน', '#/home')}<form class="page no-nav" data-form novalidate>
      ${items.length ? items.map((x) => `<div class="card tight" data-line="${esc(x.product_id)}">
        <div class="row"><div class="grow stack tight" style="gap:0"><span class="label" style="font-size:16px">${esc(x.name)}</span>
        <span class="small muted">${x.discounted ? `<s>${LB.money(x.price)}</s> ` : ''}${LB.money(x.sellPrice)} บาท · ขายได้ ${x.free} ${esc(x.unit)}</span></div>
        ${LB.stepper('q', 0, 0, x.free, ' ' + x.name)}</div></div>`).join('') : '<div class="empty">ไม่มีของพร้อมขายในตู้</div>'}
      ${items.length ? `<div class="field"><label for="sl-name">ชื่อลูกค้า (ไม่บังคับ)</label><input id="sl-name" class="input" maxlength="80"></div>
      <div class="grid2">
        <div class="field"><label for="sl-disc">ส่วนลด (บาท)</label><input id="sl-disc" class="input" type="text" inputmode="decimal" placeholder="0" data-money></div>
        <div class="field"><label for="sl-tip">ทิป (บาท)</label><input id="sl-tip" class="input" type="text" inputmode="decimal" placeholder="0" data-money></div>
      </div>
      <div class="field"><span class="label">รับเงินทาง</span>${LB.choiceHtml('seg', 'method', [['cash', 'เงินสด'], ['promptpay', 'PromptPay'], ['transfer', 'โอน']], 'cash')}</div>
      <section class="card tight stack tight" data-summary>
        <div class="kv"><span>ค่าขนม</span><span data-sub>0 บาท</span></div>
        <div class="kv" data-disc-row hidden><span>ส่วนลด</span><span data-disc>0 บาท</span></div>
        <div class="kv" data-tip-row hidden><span>ทิป</span><span data-tip>0 บาท</span></div>
        <div class="kv total"><span>รับเงินรวม</span><span class="num money" style="font-size:20px" data-total>0 บาท</span></div>
      </section>
      <button class="btn primary" type="submit" data-submit>บันทึกการขาย</button>` : ''}</form>`;
    const form = root.querySelector('[data-form]');
    const calc = () => {
      let sub = 0;
      form.querySelectorAll('[data-line]').forEach((el) => {
        const x = items.find((i) => i.product_id === el.dataset.line);
        sub += (Number(el.querySelector('input').value) || 0) * x.sellPrice;
      });
      const discIn = form.querySelector('#sl-disc');
      const tipIn = form.querySelector('#sl-tip');
      const disc = discIn ? Math.max(0, LB.n(discIn.value)) : 0;
      const tip = tipIn ? Math.max(0, LB.n(tipIn.value)) : 0;
      return { sub, disc, tip, total: sub - disc + tip };
    };
    const paint = () => {
      const c = calc();
      const q = (sel) => form.querySelector(sel);
      if (!q('[data-total]')) return;
      q('[data-sub]').textContent = LB.baht(c.sub);
      q('[data-disc]').textContent = '−' + LB.baht(c.disc);
      q('[data-tip]').textContent = '+' + LB.baht(c.tip);
      q('[data-disc-row]').hidden = !c.disc;
      q('[data-tip-row]').hidden = !c.tip;
      q('[data-total]').textContent = LB.baht(Math.max(0, c.total));
    };
    const method = () => LB.choiceVal(form, 'method');
    const label = () => {
      const b = form.querySelector('[data-submit]');
      if (b) b.textContent = method() === 'promptpay' ? 'แสดง QR รับเงิน' : 'บันทึกการขาย';
    };
    LB.bindSteppers(form, paint);
    LB.bindChoice(form, '.seg', label);
    form.querySelectorAll('[data-money]').forEach((el) => el.addEventListener('input', paint));
    const save = async (sheet) => {
      const lines = [...form.querySelectorAll('[data-line]')].map((el) => ({ product_id: el.dataset.line, qty: Math.round(Number(el.querySelector('input').value) || 0) })).filter((i) => i.qty > 0);
      try {
        const o = await LB.busy(() => LB.api('sales.quick', {
          items: lines, method: method(), customer_name: form.querySelector('#sl-name').value,
          discount: form.querySelector('#sl-disc').value, tip: form.querySelector('#sl-tip').value
        }));
        if (sheet) sheet.close();
        LB.toast(`บันทึกการขาย ${LB.baht(LB.n(o.total) + LB.n(o.tip))} แล้ว`);
        location.replace('#/home');
      } catch (err) { LB.error(err); }
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const c = calc();
      if (!c.sub) { LB.error('เลือกจำนวนอย่างน้อย 1 รายการ'); return; }
      if (c.disc > c.sub) { LB.error('ส่วนลดมากกว่ายอดค่าขนม'); return; }
      if (method() === 'promptpay' && c.total > 0) {
        LB.openSaleQr(c.total, form.querySelector('#sl-name').value.trim(), save);
        return;
      }
      save(null);
    });
  };

  /* ---------------- เมนูและราคา ---------------- */

  function productSheet(p, onDone) {
    const cats = ['เบเกอรี่', 'เครื่องดื่ม', 'คุกกี้'];
    const s = LB.sheet(p ? 'แก้ไขเมนู' : 'เพิ่มเมนู', `
      <div class="field"><label for="pf-name">ชื่อเมนู</label><input id="pf-name" class="input" value="${esc(p ? p.name : '')}" maxlength="100"></div>
      <div class="field"><label for="pf-group">เมนูหลัก (รวมหลายขนาด)</label><input id="pf-group" class="input" value="${esc(p ? p.group_name : '')}" maxlength="100" placeholder="เว้นว่าง = ใช้ชื่อเมนู">
        <span class="hint">เช่น Basque ทุกขนาดใช้ "Basque Burnt Cheesecake" รายงานจะรวมยอดให้</span></div>
      <div class="grid2"><div class="field"><label for="pf-price">ราคาขาย (บาท)</label><input id="pf-price" class="input" type="text" inputmode="decimal" value="${esc(p ? p.price : '')}"></div>
        <div class="field"><label for="pf-unit">หน่วยขาย</label><input id="pf-unit" class="input" value="${esc(p ? p.unit : 'ชิ้น')}" maxlength="20"></div></div>
      <div class="grid2"><div class="field"><label for="pf-shelf">อายุขาย (วัน)</label><input id="pf-shelf" class="input" type="text" inputmode="numeric" value="${esc(p ? p.shelf_days : 7)}"></div>
        <div class="field"><label for="pf-weight">น้ำหนักโดยประมาณ (g)</label><input id="pf-weight" class="input" type="text" inputmode="decimal" value="${esc(p && p.weight_g ? p.weight_g : '')}" placeholder="ไม่บังคับ"></div></div>
      <div class="grid2"><div class="field"><label for="pf-cat">หมวด</label><select id="pf-cat" class="input">${cats.map((c) => `<option ${p && p.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label for="pf-storage">การเก็บรักษา</label><select id="pf-storage" class="input">${['แช่เย็น', 'อุณหภูมิห้อง', 'แช่แข็ง'].map((c) => `<option ${p && p.storage === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
      <div class="field"><label for="pf-all">สารก่อภูมิแพ้</label><input id="pf-all" class="input" value="${esc(p ? p.allergens : '')}" maxlength="200" placeholder="เช่น นม, ไข่, กลูเตน, ถั่ว"></div>
      <label class="row"><input type="checkbox" class="check" id="pf-pre" ${!p || p.preorder !== false ? 'checked' : ''}><span>เปิดให้จองในรอบผลิต</span></label>
      <label class="row"><input type="checkbox" class="check" id="pf-active" ${!p || p.status === 'active' ? 'checked' : ''}><span>เปิดขาย (ปิดเพื่อซ่อนเมนูที่เลิกขาย ข้อมูลเดิมยังอยู่ครบ)</span></label>
      <button type="button" class="btn primary" data-save>บันทึก</button>`);
    s.el.querySelector('[data-save]').onclick = async () => {
      const g = (id) => s.el.querySelector(id).value;
      try {
        await LB.busy(() => LB.api('products.save', {
          id: p ? p.id : undefined, name: g('#pf-name'), group_name: g('#pf-group'), price: g('#pf-price'), unit: g('#pf-unit'),
          shelf_days: g('#pf-shelf'), weight_g: g('#pf-weight'), category: g('#pf-cat'), storage: g('#pf-storage'),
          allergens: g('#pf-all'), preorder: s.el.querySelector('#pf-pre').checked,
          status: s.el.querySelector('#pf-active').checked ? 'active' : 'inactive'
        }));
        await LB.refreshState();
        s.close();
        LB.toast('บันทึกเมนูแล้ว');
        onDone();
      } catch (e) { LB.error(e); }
    };
  }

  LB.views.products = async (root) => {
    const paint = () => {
      const ps = LB.sortByName(LB.state.products, (p) => p.name);
      const row = (p) => `<button type="button" class="card tight link" data-p="${esc(p.id)}" style="text-align:left;font:inherit">
        <div class="row between"><span class="label grow" style="font-size:16px">${esc(p.name)}</span><span class="num money nowrap">${LB.baht(p.price)}</span></div>
        <span class="small muted">${esc(p.category)} · ${esc(p.unit)} · อายุ ${p.shelf_days} วัน ${esc(p.storage || '')}${p.allergens ? ' · มี ' + esc(p.allergens) : ''}</span></button>`;
      root.innerHTML = `${LB.topbar('เมนูและราคา', '#/more')}<div class="page">
        <button type="button" class="btn primary" data-add>${LB.icon('plus')}เพิ่มเมนู</button>
        ${ps.filter((p) => p.status === 'active').map(row).join('')}
        ${ps.some((p) => p.status !== 'active') ? `<h2 class="small muted" style="font-family:var(--font-body);font-weight:500">ปิดขายอยู่</h2>${ps.filter((p) => p.status !== 'active').map(row).join('')}` : ''}
      </div>`;
      root.querySelector('[data-add]').onclick = () => productSheet(null, paint);
      root.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => productSheet(ps.find((p) => p.id === b.dataset.p), paint); });
    };
    paint();
  };

  /* ---------------- ตั้งค่าร้าน ---------------- */

  LB.views.settings = async (root) => {
    const s = LB.state.settings;
    const field = (key, label, hint, attrs) => `<div class="field"><label for="st-${key}">${label}</label>
      <input id="st-${key}" class="input" data-key="${key}" value="${esc(s[key] || '')}" ${attrs || ''}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    root.innerHTML = `${LB.topbar('ตั้งค่าร้าน', '#/more')}<form class="page no-nav" data-form novalidate>
      ${field('shop_name', 'ชื่อร้าน', '', 'maxlength="60"')}
      ${field('promptpay_id', 'PromptPay', 'เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก ใช้สร้าง QR รับเงิน', 'inputmode="numeric" maxlength="20"')}
      <div class="grid2">${field('deposit_percent', 'มัดจำ (%)', '', 'inputmode="numeric"')}${field('refund_days', 'คืนเงินถ้ายกเลิกก่อน (วัน)', '', 'inputmode="numeric"')}</div>
      <div class="grid2">${field('cutoff_days', 'ปิดรับก่อนวันผลิต (วัน)', '', 'inputmode="numeric"')}${field('expiry_warn_days', 'เตือนใกล้หมดอายุ (วัน)', '', 'inputmode="numeric"')}</div>
      ${field('material_warn_days', 'เตือนวัตถุดิบใกล้หมดอายุ (วัน)', 'นับจากวันหมดอายุที่ใส่ตอนรับของเข้า', 'inputmode="numeric"')}
      ${field('page_facebook', 'ชื่อเพจ Facebook', 'แสดงในภาพและข้อความประกาศรอบ', 'maxlength="80"')}
      ${field('page_ig', 'IG ของร้าน', 'เช่น @littlebake', 'maxlength="60"')}
      <div class="field"><span class="label">คำลงท้ายในข้อความถึงลูกค้า</span>${LB.choiceHtml('seg', 'polite_particle', [['ครับ', 'ครับ'], ['ค่ะ', 'ค่ะ'], ['นะคะ', 'นะคะ']], s.polite_particle || 'ครับ')}</div>
      <div class="grid2">${field('monthly_target', 'เป้ายอดขายต่อเดือน (บาท)', '', 'inputmode="numeric"')}${field('vat_threshold', 'เกณฑ์จด VAT (บาท/ปี)', '', 'inputmode="numeric"')}</div>
      ${field('pin_lock_hours', 'ขอ PIN อีกครั้งเมื่อไม่ได้ใช้ (ชั่วโมง)', 'ใส่ 0 ถ้าไม่ต้องการให้ล็อกเอง (ยังล็อกได้จากเมนูเพิ่มเติม)', 'inputmode="decimal"')}
      <button class="btn primary" type="submit">บันทึก</button></form>`;
    const form = root.querySelector('[data-form]');
    LB.bindChoice(form, '.seg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {};
      form.querySelectorAll('[data-key]').forEach((el) => { values[el.dataset.key] = el.value; });
      values.polite_particle = LB.choiceVal(form, 'polite_particle');
      try {
        LB.state.settings = await LB.busy(() => LB.api('settings.save', { values }));
        LB.toast('บันทึกการตั้งค่าแล้ว');
      } catch (err) { LB.error(err); }
    });
  };
})();
