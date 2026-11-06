/* หน้าผลิต: แผนอบต่อรอบ บันทึกอบเสร็จ และของในตู้ */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  function batchActions(b, x, onDone) {
    const s = LB.sheet(`${x.name} · ผลิต ${LB.dateShort(b.produced_date)}`, `
      <p class="muted" style="margin:0">เหลือ ${b.remaining} ${esc(x.unit)} · หมดอายุ ${esc(LB.dateTh(b.expire_date))}</p>
      <button type="button" class="btn" data-a="cost">ดูต้นทุนและวัตถุดิบที่ใช้</button>
      <section class="stack"><h3>ลดราคา</h3>
        <div class="row"><input class="input grow" type="text" inputmode="decimal" data-price value="${esc(LB.n(b.discount_price) || '')}" placeholder="ราคาเต็ม ${LB.money(x.price)}" aria-label="ราคาลด">
        <button type="button" class="btn" data-a="discount">บันทึก</button></div>
        <span class="hint">ใช้ราคานี้ตอนขายหน้าร้านและจองของพร้อมขาย เว้นว่างเพื่อกลับเป็นราคาเต็ม</span></section>
      <section class="stack"><h3>บันทึกทิ้ง</h3>
        <div class="row">${LB.stepper('waste', b.remaining, 1, b.remaining, ' ที่ทิ้ง')}<button type="button" class="btn danger" data-a="waste">ทิ้ง</button></div></section>
      <section class="stack"><h3>ปรับยอดให้ตรงของจริง</h3>
        <div class="row">${LB.stepper('adjust', b.remaining, 0, undefined, ' คงเหลือจริง')}<button type="button" class="btn" data-a="adjust">ปรับยอด</button></div></section>`);
    LB.bindSteppers(s.el);
    s.el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-a]');
      if (!btn) return;
      const a = btn.dataset.a;
      if (a === 'cost') { s.close(); costSheet(b.id, () => onDone()); return; }
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

  const costFmt = (v) => LB.n(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const choiceOnly = (opt) => String(opt || '').split(' · ').map((x) => x.split(': ').slice(1).join(': ') || x).join(' · ');
  const batchRecipe = (b) => (b.recipe_version ? (b.label || 'เวอร์ชัน ' + b.recipe_version) + (b.option_used ? ' · ' + choiceOnly(b.option_used) : '') : 'ไม่ได้ตัดตามสูตร');

  /** รายละเอียดต้นทุนของการอบ 1 ชุด และยกเลิกการบันทึกที่ผิด */
  async function costSheet(batchId, onDone) {
    let b;
    try { b = await LB.busy(() => LB.api('production.detail', { batchId })); } catch (e) { LB.error(e); return; }
    const { qtyFmt } = LB.kitchen;
    const d = b.detail || {};
    const lines = d.lines || [];
    const others = d.others || [];
    const u = esc(b.unit);
    const s = LB.sheet(`${b.name} · อบ ${b.qty} ${b.unit}`, `
      <p class="small muted" style="margin:0">ผลิต ${esc(LB.dateTh(b.produced_date))} · บันทึกโดย ${esc(b.created_by || '-')}<br>
        สูตร: ${esc(batchRecipe(b))}${d.factor && b.recipe_version ? ` · ใช้ ${qtyFmt(d.factor)} เท่าของสูตร` : ''}</p>
      ${lines.length ? `<table class="data"><thead><tr><th>วัตถุดิบ</th><th class="r">ใช้</th><th class="r">บาท</th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td>${esc(l.material)}${l.extra ? ' <span class="small muted">(นอกสูตร)</span>' : ''}${LB.n(l.short) > 0 ? `<br><span class="small danger-text">ขาดในระบบ ${qtyFmt(l.short)} ${esc(l.unit)}</span>` : ''}</td>
          <td class="r nowrap">${qtyFmt(l.qty)} ${esc(l.unit)}</td><td class="r">${l.missing ? '<span class="danger-text">ไม่มีราคา</span>' : costFmt(l.cost)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${others.length ? `<div class="stack tight"><span class="small muted">ค่าใช้จ่ายอื่น</span>${others.map((o) => `<div class="kv small"><span>${esc(o.name)}</span><span>${costFmt(o.amount)}</span></div>`).join('')}</div>` : ''}
      <div class="stack tight">
        ${b.material_cost !== null ? `<div class="kv"><span class="muted">วัตถุดิบ</span><span>${costFmt(b.material_cost)} บาท</span></div>` : ''}
        ${LB.n(b.other_cost) ? `<div class="kv"><span class="muted">ค่าใช้จ่ายอื่น</span><span>${costFmt(b.other_cost)} บาท</span></div>` : ''}
        ${b.unit_cost !== null ? `<div class="kv total"><span>ต้นทุนต่อ${u}</span><span>${costFmt(b.unit_cost)} บาท</span></div>` : ''}
        ${b.cost_missing ? `<span class="small danger-text">${d.no_recipe ? 'ไม่ได้ตัดวัตถุดิบตามสูตร ' : ''}ต้นทุนยังไม่ครบ</span>` : ''}
        ${b.shorts ? '<span class="small muted">ส่วนที่ขาดในระบบคิดตามราคาล่าสุด ควรนับสต็อกหรือบันทึกรับของเข้าให้ตรง</span>' : ''}
      </div>
      ${b.note ? `<p class="small" style="margin:0">หมายเหตุ: ${esc(b.note)}</p>` : ''}
      ${b.undoable ? '<button type="button" class="btn danger" data-undo>ยกเลิกการบันทึกนี้ (บันทึกผิด)</button><span class="hint">วัตถุดิบที่ตัดจะคืนเข้าสต็อก และขนมชุดนี้จะออกจากตู้</span>'
        : '<span class="small muted">ชุดนี้ถูกขาย ส่งมอบ หรือปรับยอดแล้ว ยกเลิกการบันทึกไม่ได้</span>'}`);
    const ub = s.el.querySelector('[data-undo]');
    if (ub) {
      ub.onclick = async () => {
        if (!(await LB.confirm('ยกเลิกการบันทึกผลิต?', `${b.name} ${b.qty} ${b.unit} จะออกจากตู้ และคืนวัตถุดิบที่ตัดไปเข้าสต็อก`, 'ยกเลิกการบันทึก', true))) return;
        try {
          const res = await LB.busy(() => LB.api('production.undo', { batchId }));
          s.close();
          LB.toast('ยกเลิกการบันทึกแล้ว');
          onDone(res);
        } catch (e) { LB.error(e); }
      };
    }
  }

  /** บันทึกการผลิต: เลือกเวอร์ชันสูตร แบบ วัตถุดิบหรือค่าใช้จ่ายนอกสูตร แล้วตัดสต็อก */
  async function recordSheet(opts) {
    const { num, qtyFmt, unitCostFmt, hasCost } = LB.kitchen;
    const ps = LB.sortByName(LB.state.products.filter((p) => p.status === 'active'), (p) => p.name);
    let pid = opts.productId || (ps[0] || {}).id;
    const prod = () => LB.state.products.find((p) => p.id === pid) || {};
    let data = null;
    let ctx = null;
    let snapshot = null;
    let ver = '';
    let picks = {};
    let skip = false;
    const extras = [];
    const s = LB.sheet(opts.pick ? 'บันทึกการผลิตนอกรอบ' : 'บันทึกการผลิต ' + prod().name, `
      ${opts.pick ? `<div class="field"><label for="pr-p">เมนู</label><select id="pr-p" class="input">${ps.map((p) => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      <div class="grid2">
        <div class="field"><label for="pr-q">อบเสร็จ (<span data-unit></span>)</label><input id="pr-q" class="input" inputmode="numeric" value="${esc(opts.qty || '')}"></div>
        <div class="field"><label for="pr-d">วันที่ผลิต</label><input id="pr-d" class="input" type="date" value="${LB.today()}" max="${LB.today()}"></div>
      </div>
      <datalist id="pr-mats"></datalist>
      <div class="stack" data-recipe>${LB.loadingHtml}</div>
      <section class="stack tight"><h3>เพิ่มนอกสูตร</h3>
        <span class="hint" style="margin:0">วัตถุดิบที่ใช้เพิ่มจะตัดสต็อกด้วย ค่าใช้จ่ายอื่น (เช่น ผลไม้ที่ซื้อมาใช้ครั้งเดียว) ใส่เป็นบาท</span>
        <div class="stack tight" data-extras></div>
        <div class="btn-row"><button type="button" class="btn small" data-add-mat>${LB.icon('plus')}วัตถุดิบ</button><button type="button" class="btn small" data-add-cost>${LB.icon('plus')}ค่าใช้จ่ายอื่น</button></div></section>
      <div class="field"><label for="pr-note">หมายเหตุ</label><input id="pr-note" class="input" maxlength="200" placeholder="ไม่บังคับ"></div>
      <section class="card tight" data-sum></section>
      <button type="button" class="btn primary" data-save>บันทึกการผลิต</button>`);
    const el = s.el;
    const qtyNow = () => LB.n(el.querySelector('#pr-q').value);
    const recipe = () => (ctx ? (snapshot ? { ...snapshot, product_id: pid } : ctx.recs.get(pid)) : null);

    const needs = () => {
      const rec = recipe();
      if (!rec || skip || !(qtyNow() > 0)) return [];
      const c = LB.recipeCost(rec, ctx, picks);
      const k = qtyNow() / c.yieldQty;
      const map = new Map();
      const add = (l, mult) => {
        const e = map.get(l.material) || { material: l.material, unit: l.unit, qty: 0, unitCost: l.unitCost };
        e.qty += l.qty * mult;
        map.set(l.material, e);
      };
      c.sections.forEach((sec) => sec.picked.lines.forEach((l) => add(l, k)));
      if (c.base) c.base.of.sections.forEach((sec) => sec.picked.lines.forEach((l) => add(l, k * c.base.factor)));
      return [...map.values()];
    };
    const have = (name) => { const m = ctx && ctx.mats.get(name); return m ? LB.n(m.on_hand) : 0; };

    const paintSum = () => {
      const list = needs();
      const usedExtra = new Map();
      let est = 0;
      let unknown = 0;
      let short = 0;
      list.forEach((x) => {
        if (x.unitCost === null) unknown += 1; else est += x.unitCost * x.qty;
        usedExtra.set(x.material, x.qty);
      });
      let other = 0;
      extras.forEach((x) => {
        if (x.kind === 'cost') { other += num(x.amount); return; }
        const m = ctx && ctx.mats.get(x.material.trim());
        if (!m || !(num(x.qty) > 0)) return;
        if (hasCost(m.unit_cost)) est += LB.n(m.unit_cost) * num(x.qty); else unknown += 1;
        usedExtra.set(m.name, (usedExtra.get(m.name) || 0) + num(x.qty));
      });
      usedExtra.forEach((q, name) => { if (q > have(name) + 1e-9) short += 1; });
      const q = qtyNow();
      const rec = recipe();
      el.querySelector('[data-sum]').innerHTML = `
        <div class="kv"><span class="muted">วัตถุดิบ (ประมาณ)</span><span>${costFmt(est)} บาท</span></div>
        ${other ? `<div class="kv"><span class="muted">ค่าใช้จ่ายอื่น</span><span>${costFmt(other)} บาท</span></div>` : ''}
        ${q > 0 ? `<div class="kv total"><span>ต้นทุนต่อ${esc(prod().unit || 'ชิ้น')}</span><span>${costFmt((est + other) / q)} บาท</span></div>` : ''}
        ${!rec || skip ? '<span class="small danger-text">ไม่ได้ตัดวัตถุดิบตามสูตร ต้นทุนจะไม่ครบ</span>' : ''}
        ${unknown ? `<span class="small danger-text">ยังไม่มีราคา ${unknown} รายการ</span>` : ''}
        ${short ? `<span class="small danger-text">ในระบบมีไม่พอ ${short} รายการ บันทึกได้ ระบบจะจดส่วนที่ขาดไว้ ควรนับสต็อกหรือบันทึกรับของเข้าให้ตรง</span>` : ''}
        <span class="small muted">ต้นทุนจริงคิดจากราคาที่จ่ายของล็อตที่ถูกตัด จะเห็นหลังบันทึก</span>`;
    };

    const paintNeeds = () => {
      const box = el.querySelector('[data-needs]');
      if (!box) return;
      const list = needs();
      box.innerHTML = list.length ? `<table class="data"><thead><tr><th>วัตถุดิบที่จะตัด</th><th class="r">ใช้</th><th class="r">มีในระบบ</th></tr></thead><tbody>
        ${list.map((x) => { const h = have(x.material); const sh = x.qty - h > 1e-9; return `<tr><td>${esc(x.material)}</td><td class="r nowrap">${qtyFmt(x.qty)} ${esc(x.unit)}</td>
          <td class="r nowrap ${sh ? 'danger-text' : 'muted'}">${sh ? 'ขาด ' + qtyFmt(x.qty - h) : qtyFmt(h)}</td></tr>`; }).join('')}</tbody></table>` : '';
      paintSum();
    };

    const paintRecipe = () => {
      const box = el.querySelector('[data-recipe]');
      el.querySelector('[data-unit]').textContent = prod().unit || '';
      const cur = ctx.recs.get(pid);
      if (!cur) {
        box.innerHTML = `<p class="small muted" style="margin:0">เมนูนี้ยังไม่มีสูตร จะไม่ตัดวัตถุดิบ <a href="#/recipe/${encodeURIComponent(pid)}/edit">เขียนสูตร</a></p>`;
        paintSum();
        return;
      }
      const rec = recipe();
      const c = LB.recipeCost(rec, ctx, picks);
      const alts = c.sections.filter((x) => x.choices.length > 1);
      const versions = data.versions || [];
      box.innerHTML = `
        ${versions.length > 1 ? `<div class="field"><label for="pr-v">สูตรที่ใช้</label><select id="pr-v" class="input">
          ${versions.map((v) => `<option value="${v.version === cur.version ? '' : v.version}" ${(ver === '' ? v.version === cur.version : String(v.version) === String(ver)) ? 'selected' : ''}>${esc(v.label || 'เวอร์ชัน ' + v.version)}${v.version === cur.version ? ' (สูตรหลัก)' : ''}</option>`).join('')}</select></div>`
          : `<p class="small muted" style="margin:0">สูตร: ${esc(cur.version_label || 'เวอร์ชัน ' + cur.version)} · ทำ 1 ครั้งได้ ${qtyFmt(c.yieldQty)} ${esc(prod().unit)}</p>`}
        ${alts.map((sec) => `<div class="field"><span class="label">${esc(sec.name || 'วัตถุดิบ')}</span><div class="chips">${sec.choices.map((ch) => `<button type="button" class="chip soft" data-sec="${esc(sec.name)}" data-pick="${esc(ch.name)}" aria-pressed="${ch === sec.picked}">${esc(ch.name)}</button>`).join('')}</div></div>`).join('')}
        <div data-needs></div>
        <label class="row small"><input type="checkbox" class="check" data-skip ${skip ? 'checked' : ''}><span>ไม่ตัดวัตถุดิบครั้งนี้ (เช่น บันทึกย้อนหลังก่อนเริ่มนับสต็อก)</span></label>`;
      paintNeeds();
    };

    const loadProduct = async () => {
      el.querySelector('[data-recipe]').innerHTML = LB.loadingHtml;
      snapshot = null; ver = ''; picks = {};
      try { data = await LB.api('recipes.list', { product_id: pid }); } catch (e) { LB.error(e); return; }
      ctx = { mats: new Map(data.materials.map((m) => [m.name, m])), recs: new Map(data.recipes.map((r) => [r.product_id, r])) };
      el.querySelector('#pr-mats').innerHTML = LB.sortByName(data.materials.filter((m) => m.status === 'active'), (m) => m.name).map((m) => `<option value="${esc(m.name)}">`).join('');
      paintRecipe();
      paintExtras();
    };

    const paintExtras = () => {
      el.querySelector('[data-extras]').innerHTML = extras.map((x, i) => (x.kind === 'mat'
        ? `<div class="row" data-x="${i}"><input class="input grow" list="pr-mats" data-xf="material" value="${esc(x.material)}" placeholder="วัตถุดิบ" aria-label="วัตถุดิบนอกสูตร" autocomplete="off">
            <input class="input" style="width:84px" inputmode="decimal" data-xf="qty" value="${esc(x.qty)}" placeholder="ปริมาณ" aria-label="ปริมาณ"><span class="small muted" data-xu style="min-width:28px"></span>
            <button type="button" class="icon-btn" data-xdel aria-label="ลบรายการนี้">${LB.icon('close')}</button></div>`
        : `<div class="row" data-x="${i}"><input class="input grow" data-xf="name" value="${esc(x.name)}" placeholder="ค่าใช้จ่าย เช่น ผลไม้สด" aria-label="ชื่อค่าใช้จ่าย" maxlength="100">
            <input class="input" style="width:96px" inputmode="decimal" data-xf="amount" value="${esc(x.amount)}" placeholder="บาท" aria-label="จำนวนเงิน">
            <button type="button" class="icon-btn" data-xdel aria-label="ลบรายการนี้">${LB.icon('close')}</button></div>`)).join('');
      el.querySelectorAll('[data-x]').forEach((row) => {
        const u = row.querySelector('[data-xu]');
        if (u) { const m = ctx && ctx.mats.get(extras[row.dataset.x].material.trim()); u.textContent = m ? m.unit : ''; }
      });
      paintSum();
    };

    el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'pr-q') { paintNeeds(); return; }
      const row = t.closest('[data-x]');
      if (row && t.dataset.xf) {
        extras[row.dataset.x][t.dataset.xf] = t.value;
        const u = row.querySelector('[data-xu]');
        if (u) { const m = ctx && ctx.mats.get(extras[row.dataset.x].material.trim()); u.textContent = m ? m.unit : ''; }
        paintSum();
      }
    });
    el.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.id === 'pr-p') { pid = t.value; await loadProduct(); }
      else if (t.id === 'pr-v') {
        ver = t.value;
        picks = {};
        if (ver === '') snapshot = null;
        else {
          try { snapshot = await LB.busy(() => LB.api('recipes.version', { product_id: pid, version: Number(ver) })); } catch (err) { LB.error(err); return; }
        }
        paintRecipe();
      } else if (t.matches('[data-skip]')) { skip = t.checked; paintNeeds(); }
    });
    el.addEventListener('click', (e) => {
      const pk = e.target.closest('[data-pick]');
      if (pk) { picks[pk.dataset.sec] = pk.dataset.pick; paintRecipe(); return; }
      if (e.target.closest('[data-add-mat]')) { extras.push({ kind: 'mat', material: '', qty: '' }); paintExtras(); const all = el.querySelectorAll('[data-xf="material"]'); if (all.length) all[all.length - 1].focus(); return; }
      if (e.target.closest('[data-add-cost]')) { extras.push({ kind: 'cost', name: '', amount: '' }); paintExtras(); const all = el.querySelectorAll('[data-xf="name"]'); if (all.length) all[all.length - 1].focus(); return; }
      const del = e.target.closest('[data-xdel]');
      if (del) { extras.splice(Number(del.closest('[data-x]').dataset.x), 1); paintExtras(); }
    });
    el.querySelector('[data-save]').onclick = async () => {
      const q = el.querySelector('#pr-q').value.trim();
      if (!(Number(q) > 0)) { LB.error('ใส่จำนวนที่อบเสร็จ'); return; }
      for (const x of extras) {
        if (x.kind === 'mat' && x.material.trim() && !(ctx && ctx.mats.has(x.material.trim()))) { LB.error(`ไม่พบ "${x.material.trim()}" ในรายการวัตถุดิบ`); return; }
      }
      try {
        const res = await LB.busy(() => LB.api('production.record', {
          roundId: opts.roundId || '', productId: pid, qty: q, producedDate: el.querySelector('#pr-d').value,
          note: el.querySelector('#pr-note').value, recipeVersion: ver, choices: picks, useRecipe: !skip,
          extras: extras.map((x) => (x.kind === 'mat' ? { material: x.material.trim(), qty: String(x.qty).replace(/,/g, '') } : { name: x.name, amount: String(x.amount).replace(/,/g, '') }))
        }));
        s.close();
        const r = res.recorded || {};
        LB.toast(`บันทึกการผลิตแล้ว${r.unit_cost !== null && r.unit_cost !== undefined ? ` · ต้นทุน ${costFmt(r.unit_cost)} บาท/${prod().unit}` : ''}${r.shorts ? ` · ขาดในระบบ ${r.shorts} รายการ` : ''}`);
        opts.onDone(res);
      } catch (err) { LB.error(err); }
    };
    await loadProduct();
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
        ${stock.rounds.length ? `<div class="chips scroll" data-rounds>${stock.rounds.map((r) => `<button type="button" class="chip soft" data-r="${esc(r.id)}" aria-pressed="${r.id === roundId}">รอบ ${esc(LB.dateTh(r.bake_date))}</button>`).join('')}</div>` : ''}
        ${plan ? `<p class="small muted" style="margin:0">รอบ ${esc(LB.dateTh(plan.bake_date))} · ${esc(LB.L.roundState[plan.state])}${shelf ? ` · ผลิตวันนี้หมดอายุ ${esc(LB.dateTh(LB.addDays(LB.today(), LB.n(shelf.shelf_days))))}` : ''}</p>
          ${plan.items.map((i) => `<section class="card" data-item="${esc(i.product_id)}">
            <h2>${esc(i.name)}</h2>
            <div class="grid3" style="text-align:center">
              <div class="tile stat"><span class="small muted">จองแล้ว</span><span class="num">${i.ordered}</span>${i.pending ? `<span class="small muted">รอมัดจำ ${i.pending}</span>` : ''}</div>
              <div class="tile stat"><label class="small muted" for="ex-${esc(i.product_id)}">เผื่อขาย</label>
                <input id="ex-${esc(i.product_id)}" class="num" data-extra type="text" inputmode="numeric" value="${i.extra_qty}" style="width:100%;border:0;border-bottom:1px solid var(--line-strong);background:transparent;text-align:center;font-size:22px;line-height:28px"></div>
              <div class="tile stat key"><span class="small">ต้องอบเพิ่ม</span><span class="num" style="font-weight:600">${i.toBake}</span></div>
            </div>
            ${i.produced ? `<span class="small muted">อบแล้ว ${i.produced} ${esc(i.unit)} · ส่งมอบแล้ว ${i.delivered}</span>` : ''}
            ${(i.batches || []).map((b) => `<button type="button" class="row between small" data-cost="${esc(b.id)}" style="border:0;border-top:1px solid var(--line);background:none;padding:8px 0 0;text-align:left;cursor:pointer;width:100%;font:inherit;color:inherit">
              <span class="grow stack tight" style="gap:2px"><span>${esc(LB.dateShort(b.produced_date))} · อบ ${b.qty} ${esc(i.unit)} · ${esc(batchRecipe(b))}</span>
              <span>${b.unit_cost !== null ? `ต้นทุน <span class="num">${costFmt(b.unit_cost)}</span> บาท/${esc(i.unit)}` : ''}${b.cost_missing ? ' <span class="danger-text">ต้นทุนไม่ครบ</span>' : ''}${b.shorts ? ` <span class="danger-text">· ขาดในระบบ ${b.shorts} รายการ</span>` : ''}</span></span>${LB.icon('chevron')}</button>`).join('')}
            <div class="row"><label class="label grow" for="bk-${esc(i.product_id)}">อบเสร็จ (${esc(i.unit)})</label>
              <input id="bk-${esc(i.product_id)}" class="input" data-baked type="text" inputmode="numeric" value="${i.toBake || ''}" placeholder="0" style="width:84px;text-align:center">
              <button type="button" class="btn" data-record style="font-weight:600">บันทึก</button></div>
          </section>`).join('')}` : '<div class="empty">ยังไม่มีรอบผลิต <a href="#/rounds/new">เปิดรอบผลิต</a></div>'}
        <button type="button" class="btn" data-extra-record>${LB.icon('plus')}บันทึกการผลิตนอกรอบ</button>
        <p class="hint" style="margin:-8px 0 0">บันทึกแล้ว ระบบเพิ่มของในตู้ ตั้งวันหมดอายุตามอายุขายของเมนู และตัดวัตถุดิบตามสูตรให้อัตโนมัติ</p>

        <section class="stack">
          <h2>ในตู้ตอนนี้</h2>
          ${stock.stock.length ? stock.stock.map((x) => `<div class="card tight">
            <div class="row between top"><span class="label grow" style="font-size:16px">${esc(x.name)}</span>
            <span class="num nowrap" style="font-size:16px">${x.physical} ${esc(x.unit)}</span></div>
            <span class="small muted">จองแล้ว ${x.committed} · ขายได้ ${Math.max(0, x.free)}${x.free < 0 ? ` · <span class="danger-text">ขาด ${-x.free}</span>` : ''}</span>
            ${x.batches.map((b) => `<button type="button" class="row between" data-batch="${esc(b.id)}" data-pid="${esc(x.product_id)}" style="border:0;border-top:1px solid var(--line);background:none;padding:8px 0 0;text-align:left;cursor:pointer;width:100%">
              <span class="small grow">ผลิต ${esc(LB.dateShort(b.produced_date))} · เหลือ ${b.remaining}${LB.n(b.discount_price) ? ` · ลดเหลือ ${LB.money(b.discount_price)}` : ''}</span>
              ${b.state === 'expired' ? LB.badge('expired', 'หมดอายุแล้ว') : (b.state === 'warn' ? LB.badge('warn', 'หมดอายุ ' + LB.relDay(b.expire_date)) : LB.stamp('หมดอายุ ' + LB.dateShort(b.expire_date)))}
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
        card.querySelector('[data-record]').onclick = () => {
          const qty = card.querySelector('[data-baked]').value;
          recordSheet({ productId: pid, qty, roundId, onDone: async (res) => {
            plan = res;
            try { stock = await LB.api('stock.list'); } catch (err) { LB.error(err); }
            paint();
          } });
        };
        card.querySelectorAll('[data-cost]').forEach((b) => {
          b.onclick = () => costSheet(b.dataset.cost, () => refresh().catch(LB.error));
        });
      });
      root.querySelector('[data-extra-record]').onclick = () => recordSheet({ pick: true, onDone: () => refresh().catch(LB.error) });
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
