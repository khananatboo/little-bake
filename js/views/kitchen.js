/* วัตถุดิบ สูตรขนม และต้นทุนต่อชิ้น (เฟส 2) */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;
  const KINDS = ['วัตถุดิบ', 'กึ่งสำเร็จ', 'บรรจุภัณฑ์', 'วัสดุสิ้นเปลือง'];
  const UNITS = ['g', 'ml', 'ฟอง', 'ลูก', 'ชิ้น', 'อัน', 'แผ่น', 'กล่อง', 'ดวง', 'ใบ', 'ขวด', 'ม้วน'];

  const num = (v) => LB.n(String(v === null || v === undefined ? '' : v).replace(/,/g, '').trim());
  const qtyFmt = (v) => LB.n(v).toLocaleString('th-TH', { maximumFractionDigits: 3 });
  const costFmt = (v) => LB.n(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const priceFmt = (v) => LB.n(v).toLocaleString('th-TH', { maximumFractionDigits: 4 });
  const unitCostFmt = (v) => {
    const x = LB.n(v);
    return x.toLocaleString('th-TH', { maximumFractionDigits: x >= 10 ? 2 : x >= 1 ? 3 : 4 });
  };
  const hasCost = (v) => v !== null && v !== undefined && v !== '';
  const product = (id) => LB.state.products.find((p) => p.id === id);
  const pname = (id) => (product(id) || {}).name || id;
  const matHref = (name) => '#/material/' + encodeURIComponent(name);
  const recipeHref = (id) => '#/recipe/' + encodeURIComponent(id);
  const secName = (n) => n || 'วัตถุดิบ';
  const itemSpec = (i, unit) => `${i.pack_unit ? i.pack_unit + 'ละ ' : ''}${hasCost(i.pack_size) ? qtyFmt(i.pack_size) + ' ' + unit : 'ไม่ระบุขนาด'} · ${
    hasCost(i.price) ? priceFmt(i.price) + ' บาท' : 'ไม่มีราคา'}`;

  function makeCtx(materials, recipes) {
    return {
      mats: new Map(materials.map((m) => [m.name, m])),
      recs: new Map((recipes || []).map((r) => [r.product_id, r]))
    };
  }

  /**
   * ต้นทุนของสูตร: แยกตามส่วน ส่วนที่มีทางเลือกคิดจากแบบที่เลือก (ไม่เลือก = แบบหลัก คือแบบแรก)
   * คืน { sections, base, batch, yieldQty, perUnit, missing }
   */
  LB.recipeCost = (recipe, ctx, picks, nested) => {
    const sections = [];
    const byName = {};
    (recipe.lines || []).forEach((l) => {
      let s = byName[l.section];
      if (!s) { s = byName[l.section] = { name: l.section, choices: [] }; sections.push(s); }
      let c = s.choices.find((x) => x.name === l.choice);
      if (!c) { c = { name: l.choice, lines: [], cost: 0, missing: [] }; s.choices.push(c); }
      const m = ctx.mats.get(l.material);
      const uc = m && hasCost(m.unit_cost) ? Number(m.unit_cost) : null;
      const cost = uc === null ? null : uc * Number(l.qty);
      c.lines.push({ material: l.material, qty: Number(l.qty), unit: m ? m.unit : '', unitCost: uc, cost });
      if (cost === null) c.missing.push(l.material); else c.cost += cost;
    });
    let batch = 0;
    const missing = new Set();
    sections.forEach((s) => {
      s.alt = s.choices.some((c) => c.name !== '');
      s.picked = s.choices.find((c) => picks && c.name === picks[s.name]) || s.choices[0];
      batch += s.picked.cost;
      s.picked.missing.forEach((x) => missing.add(x));
    });
    let base = null;
    if (recipe.base_product && !nested) {
      const br = ctx.recs.get(recipe.base_product);
      if (br) {
        const of = LB.recipeCost(br, ctx, null, true);
        const factor = Number(recipe.base_factor) || 0;
        base = { product_id: recipe.base_product, factor, cost: of.batch * factor, of };
        batch += base.cost;
        of.missing.forEach((x) => missing.add(x));
      }
    }
    const yieldQty = Number(recipe.yield_qty) || 1;
    return { sections, base, batch, yieldQty, perUnit: batch / yieldQty, missing: [...missing] };
  };

  const missingHtml = (list) => (list.length ? `<p class="small danger-text" style="margin:0">ยังคิดต้นทุนไม่ครบ: ${
    list.map((m) => `<a href="${matHref(m)}">${esc(m)}</a>`).join(', ')} ยังไม่มีราคาหรือขนาด</p>` : '');

  /* ---------------- แผ่นแก้ไขวัตถุดิบ ---------------- */

  function materialSheet(m, prefill, onSaved) {
    const s = LB.sheet(m ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบ', `
      <div class="field"><label for="mt-name">ชื่อกลาง (ชื่อที่ใช้ในสูตร)</label><input id="mt-name" class="input" value="${esc(m ? m.name : prefill || '')}" maxlength="100" placeholder="เช่น เนยเค็ม">
        <span class="hint">ยี่ห้อหรือขนาดต่างกันให้ใส่ไว้ใต้ชื่อเดียวกัน</span></div>
      <div class="grid2">
        <div class="field"><label for="mt-kind">ประเภท</label><select id="mt-kind" class="input">${KINDS.map((k) => `<option ${(m ? m.kind : 'วัตถุดิบ') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label for="mt-unit">หน่วยที่สูตรใช้</label><input id="mt-unit" class="input" list="unit-list" value="${esc(m ? m.unit : 'g')}" maxlength="20">
          <datalist id="unit-list">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist></div></div>
      ${m && (m.items.length || m.used_in.length) ? '<span class="hint">ถ้าเปลี่ยนหน่วย ต้องแก้ขนาดของทุกยี่ห้อและปริมาณในสูตรให้เป็นหน่วยใหม่ด้วย</span>' : ''}
      <div class="field"><label for="mt-note">หมายเหตุ</label><textarea id="mt-note" class="input" rows="2" maxlength="300">${esc(m ? m.note : '')}</textarea></div>
      ${m ? `<label class="row"><input type="checkbox" class="check" id="mt-active" ${m.status === 'active' ? 'checked' : ''}><span>ยังใช้อยู่ (ปิดเพื่อซ่อนจากรายการตอนเขียนสูตร)</span></label>` : ''}
      <button type="button" class="btn primary" data-save>บันทึก</button>`);
    s.el.querySelector('[data-save]').onclick = async () => {
      const g = (id) => s.el.querySelector(id).value;
      const act = s.el.querySelector('#mt-active');
      try {
        const res = await LB.busy(() => LB.api('materials.save', {
          old_name: m ? m.name : '', name: g('#mt-name'), kind: g('#mt-kind'), unit: g('#mt-unit'), note: g('#mt-note'),
          status: act && !act.checked ? 'inactive' : 'active'
        }));
        s.close();
        LB.toast('บันทึกวัตถุดิบแล้ว');
        onSaved(res);
      } catch (e) { LB.error(e); }
    };
  }

  function itemSheet(m, it, onSaved) {
    const isMain = it ? it.id === m.main_item : !m.items.some((i) => i.status === 'active');
    const s = LB.sheet(it ? 'แก้ยี่ห้อหรือขนาด' : 'เพิ่มยี่ห้อหรือขนาด', `
      <p class="small muted" style="margin:0">${esc(m.name)} · สูตรใช้หน่วย ${esc(m.unit)}${it ? ' · ' + esc(it.id) : ''}</p>
      <div class="field"><label for="it-label">ชื่อสินค้า ยี่ห้อ ขนาด</label><input id="it-label" class="input" value="${esc(it ? it.label : '')}" maxlength="150" placeholder="เช่น ${esc(m.name)} ยี่ห้อ 200 g"></div>
      <div class="grid2">
        <div class="field"><label for="it-pu">ซื้อเป็น</label><input id="it-pu" class="input" value="${esc(it ? it.pack_unit : '')}" maxlength="20" placeholder="ถุง ขวด แพ็ค"></div>
        <div class="field"><label for="it-size">1 หน่วยที่ซื้อ = กี่ ${esc(m.unit)}</label><input id="it-size" class="input" inputmode="decimal" value="${esc(it && hasCost(it.pack_size) ? Number(it.pack_size) : '')}"></div></div>
      <div class="field"><label for="it-price">ราคาต่อหน่วยที่ซื้อ (บาท)</label><input id="it-price" class="input" inputmode="decimal" value="${esc(it && hasCost(it.price) ? Number(it.price) : '')}">
        <span class="hint" data-calc></span></div>
      <div class="field"><label for="it-note">หมายเหตุ</label><input id="it-note" class="input" value="${esc(it ? it.note : '')}" maxlength="300" placeholder="เช่น ร้านที่ซื้อ"></div>
      <label class="row"><input type="checkbox" class="check" id="it-main" ${isMain ? 'checked' : ''} ${it && it.id === m.main_item ? 'disabled' : ''}>
        <span>ใช้ราคานี้คิดต้นทุนสูตร${it && it.id === m.main_item ? ' (ถ้าจะเปลี่ยน ให้เลือกที่ยี่ห้ออื่น)' : ''}</span></label>
      <label class="row"><input type="checkbox" class="check" id="it-active" ${!it || it.status === 'active' ? 'checked' : ''}><span>ยังซื้อยี่ห้อนี้อยู่</span></label>
      <button type="button" class="btn primary" data-save>บันทึก</button>
      ${it ? '<button type="button" class="btn danger" data-del>ลบยี่ห้อนี้</button>' : ''}`);
    const g = (id) => s.el.querySelector(id).value;
    const calc = () => {
      const size = num(g('#it-size'));
      const price = g('#it-price').trim();
      s.el.querySelector('[data-calc]').textContent = size > 0 && price !== '' ? `= ${unitCostFmt(num(price) / size)} บาท ต่อ ${m.unit}` : '';
    };
    s.el.addEventListener('input', calc);
    calc();
    s.el.querySelector('[data-save]').onclick = async () => {
      try {
        const res = await LB.busy(() => LB.api('items.save', {
          id: it ? it.id : undefined, material: m.name, label: g('#it-label'), pack_unit: g('#it-pu'),
          pack_size: g('#it-size'), price: g('#it-price'), note: g('#it-note'),
          make_main: s.el.querySelector('#it-main').checked,
          status: s.el.querySelector('#it-active').checked ? 'active' : 'inactive'
        }));
        s.close();
        LB.toast('บันทึกแล้ว');
        onSaved(res.materials);
      } catch (e) { LB.error(e); }
    };
    const del = s.el.querySelector('[data-del]');
    if (del) {
      del.onclick = async () => {
        if (!(await LB.confirm('ลบยี่ห้อนี้?', it.label + ' จะหายจากรายการ ถ้ายังซื้ออยู่แต่ไม่อยากใช้คิดต้นทุน ให้เลือกยี่ห้ออื่นเป็นหลักแทน', 'ลบ', true))) return;
        try {
          const res = await LB.busy(() => LB.api('items.delete', { id: it.id }));
          s.close();
          LB.toast('ลบแล้ว');
          onSaved(res.materials);
        } catch (e) { LB.error(e); }
      };
    }
  }

  /* ---------------- รายการวัตถุดิบ ---------------- */

  LB.views.materials = async (root, params, query, alive) => {
    root.innerHTML = LB.topbar('วัตถุดิบ', '#/more') + LB.loadingHtml;
    let mats = (await LB.api('materials.list')).materials;
    if (!alive()) return;
    let filter = query.f || 'all';
    let q = '';
    root.innerHTML = `${LB.topbar('วัตถุดิบ', '#/more')}<div class="page">
      <p class="small muted" style="margin:0">สูตรใช้ชื่อกลาง ต้นทุนคิดจากยี่ห้อที่ตั้งเป็นหลัก ราคาต่อหน่วยที่ซื้อ ÷ ขนาด</p>
      <input class="input" type="search" data-q placeholder="ค้นหาชื่อหรือยี่ห้อ" aria-label="ค้นหาวัตถุดิบ">
      <div class="chips" data-chips></div>
      <button type="button" class="btn primary" data-add>${LB.icon('plus')}เพิ่มวัตถุดิบ</button>
      <div class="stack" data-list></div></div>`;
    const card = (m) => {
      const main = m.items.find((i) => i.id === m.main_item);
      const bits = [main ? esc(main.label) + ' · ' + esc(itemSpec(main, m.unit)) : 'ยังไม่มียี่ห้อหรือขนาด'];
      if (m.items.length > 1) bits.push(m.items.length + ' ยี่ห้อ/ขนาด');
      if (m.used_in.length) bits.push('ใช้ใน ' + m.used_in.length + ' สูตร');
      return `<a class="card tight link" href="${matHref(m.name)}">
        <div class="row between"><span class="label grow" style="font-size:16px">${esc(m.name)}</span>${hasCost(m.unit_cost)
          ? `<span class="nowrap"><span class="num">${unitCostFmt(m.unit_cost)}</span> <span class="small muted">บาท/${esc(m.unit)}</span></span>`
          : '<span class="badge warn">ต้องเติมราคา</span>'}</div>
        <span class="small muted">${bits.join(' · ')}</span></a>`;
    };
    const paint = () => {
      const active = mats.filter((m) => m.status === 'active');
      const needs = active.filter((m) => !hasCost(m.unit_cost)).length;
      const kinds = KINDS.filter((k) => mats.some((m) => m.kind === k));
      const chips = [['all', 'ทั้งหมด'], ...(needs ? [['need', `ต้องเติมราคา ${needs}`]] : []), ...kinds.map((k) => [k, k])];
      if (!chips.some(([k]) => k === filter)) filter = 'all';
      root.querySelector('[data-chips]').innerHTML = chips.map(([k, l]) => `<button type="button" class="chip" data-f="${esc(k)}" aria-pressed="${k === filter}">${esc(l)}</button>`).join('');
      const words = q.toLowerCase();
      const shown = mats.filter((m) => (!words || m.name.toLowerCase().includes(words) || m.items.some((i) => i.label.toLowerCase().includes(words)))
        && (filter === 'all' || (filter === 'need' ? m.status === 'active' && !hasCost(m.unit_cost) : m.kind === filter)));
      const groups = [...KINDS.map((k) => [k, shown.filter((m) => m.kind === k && m.status === 'active')]),
        ['เลิกใช้', shown.filter((m) => m.status !== 'active')]].filter(([, list]) => list.length);
      root.querySelector('[data-list]').innerHTML = groups.length ? groups.map(([k, list]) => `<h2>${esc(k)} <span class="small muted">${list.length}</span></h2>${list.map(card).join('')}`).join('')
        : '<p class="empty">ไม่พบวัตถุดิบ</p>';
    };
    paint();
    root.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value.trim(); paint(); });
    root.querySelector('[data-chips]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) { filter = b.dataset.f; paint(); }
    });
    root.querySelector('[data-add]').onclick = () => materialSheet(null, '', (res) => LB.go(matHref(res.name)));
  };

  LB.views.material = async (root, params, query, alive) => {
    const name = params[0];
    root.innerHTML = LB.topbar(name, '#/materials') + LB.loadingHtml;
    let mats = (await LB.api('materials.list')).materials;
    if (!alive()) return;
    const paint = () => {
      const m = mats.find((x) => x.name === name);
      if (!m) {
        root.innerHTML = `${LB.topbar(name, '#/materials')}<div class="page"><p class="empty">ไม่พบวัตถุดิบนี้</p></div>`;
        return;
      }
      const main = m.items.find((i) => i.id === m.main_item);
      root.innerHTML = `${LB.topbar(m.name, '#/materials', `<button type="button" class="icon-btn" data-edit aria-label="แก้ชื่อ ประเภท หน่วย">${LB.icon('edit')}</button>`)}<div class="page">
        <section class="card tight">
          <div class="kv"><span class="muted">ประเภท</span><span>${esc(m.kind)}${m.status !== 'active' ? ' · เลิกใช้' : ''}</span></div>
          <div class="kv"><span class="muted">หน่วยที่สูตรใช้</span><span>${esc(m.unit)}</span></div>
          <div class="kv"><span class="muted">ต้นทุนที่ใช้คิด</span><span>${hasCost(m.unit_cost) ? `${unitCostFmt(m.unit_cost)} บาท/${esc(m.unit)}` : '<span class="danger-text">ยังไม่มี</span>'}</span></div>
          ${main ? `<span class="small muted">คิดจาก ${esc(main.label)}</span>` : ''}
          ${m.note ? `<p class="small pre" style="margin:0">${esc(m.note)}</p>` : ''}
        </section>
        <h2>ยี่ห้อและขนาดที่ซื้อ</h2>
        ${m.items.map((i) => `<button type="button" class="card tight link" data-item="${esc(i.id)}" style="text-align:left;font:inherit">
          <div class="row between"><span class="label grow">${esc(i.label)}</span>${i.id === m.main_item ? '<span class="badge ok">ใช้คิดต้นทุน</span>' : ''}${i.status !== 'active' ? '<span class="badge outline">เลิกซื้อ</span>' : ''}</div>
          <span class="small muted">${esc(i.id)} · ${esc(itemSpec(i, m.unit))}${hasCost(i.unit_cost) ? ` · ${unitCostFmt(i.unit_cost)} บาท/${esc(m.unit)}` : ''}</span>
          ${hasCost(i.unit_cost) ? '' : '<span class="small danger-text">ใส่ขนาดและราคาเพื่อคิดต้นทุน</span>'}
          ${i.note ? `<span class="small muted">${esc(i.note)}</span>` : ''}</button>`).join('') || '<p class="muted" style="margin:0">ยังไม่มียี่ห้อหรือขนาด</p>'}
        <button type="button" class="btn" data-add>${LB.icon('plus')}เพิ่มยี่ห้อหรือขนาด</button>
        ${m.used_in.length ? `<section class="card tight"><span class="small muted">ใช้ในสูตร</span>${m.used_in.map((id) => `<a href="${recipeHref(id)}">${esc(pname(id))}</a>`).join('')}</section>`
          : '<button type="button" class="btn danger" data-del>ลบวัตถุดิบนี้</button>'}
      </div>`;
      const update = (list) => { mats = list; paint(); };
      root.querySelector('[data-edit]').onclick = () => materialSheet(m, '', (res) => {
        mats = res.materials;
        if (res.name !== name) location.replace(matHref(res.name)); else paint();
      });
      root.querySelector('[data-add]').onclick = () => itemSheet(m, null, update);
      root.querySelectorAll('[data-item]').forEach((b) => { b.onclick = () => itemSheet(m, m.items.find((i) => i.id === b.dataset.item), update); });
      const del = root.querySelector('[data-del]');
      if (del) {
        del.onclick = async () => {
          if (!(await LB.confirm('ลบวัตถุดิบนี้?', `${m.name} และยี่ห้อทั้งหมดใต้ชื่อนี้จะหายจากรายการ`, 'ลบ', true))) return;
          try {
            await LB.busy(() => LB.api('materials.delete', { name: m.name }));
            LB.toast('ลบแล้ว');
            location.replace('#/materials');
          } catch (e) { LB.error(e); }
        };
      }
    };
    paint();
  };

  /* ---------------- สูตรและต้นทุน ---------------- */

  LB.views.recipes = async (root, params, query, alive) => {
    root.innerHTML = LB.topbar('สูตรและต้นทุน', '#/more') + LB.loadingHtml;
    const data = await LB.api('recipes.list');
    if (!alive()) return;
    const ctx = makeCtx(data.materials, data.recipes);
    const ps = LB.state.products.filter((p) => p.status === 'active' || ctx.recs.has(p.id));
    const row = (p) => {
      const r = ctx.recs.get(p.id);
      if (!r) {
        return `<a class="card tight link row" href="${recipeHref(p.id)}"><span class="label grow" style="font-size:16px">${esc(p.name)}</span>
          <span class="small muted nowrap">เขียนสูตร</span>${LB.icon('chevron')}</a>`;
      }
      const c = LB.recipeCost(r, ctx);
      const price = LB.n(p.price);
      const left = price - c.perUnit;
      return `<a class="card tight link" href="${recipeHref(p.id)}">
        <div class="row between"><span class="label grow" style="font-size:16px">${esc(p.name)}</span>${c.missing.length ? '<span class="badge warn">ราคาไม่ครบ</span>' : ''}</div>
        <div class="grid3">
          <span class="stack tight" style="gap:0"><span class="small muted">ต้นทุน/${esc(p.unit)}</span><span class="num">${costFmt(c.perUnit)}</span></span>
          <span class="stack tight" style="gap:0"><span class="small muted">ราคาขาย</span><span class="num">${LB.money(price)}</span></span>
          <span class="stack tight" style="gap:0"><span class="small muted">เหลือ</span><span class="num ${left < 0 ? 'danger-text' : 'money'}">${costFmt(left)}${price ? ` <span class="small">(${Math.round((left / price) * 100)}%)</span>` : ''}</span></span>
        </div></a>`;
    };
    const has = ps.filter((p) => ctx.recs.has(p.id));
    const not = ps.filter((p) => !ctx.recs.has(p.id));
    root.innerHTML = `${LB.topbar('สูตรและต้นทุน', '#/more')}<div class="page">
      <p class="small muted" style="margin:0">ต้นทุนคิดจากวัตถุดิบและบรรจุภัณฑ์ตามราคาในหน้าวัตถุดิบ ยังไม่รวมค่าแรง ค่าไฟ ค่าแก๊ส · เมนูที่มีทางเลือกคิดจากแบบหลัก</p>
      ${has.map(row).join('') || '<p class="empty">ยังไม่มีสูตร เลือกเมนูด้านล่างเพื่อเขียนสูตร</p>'}
      ${not.length ? `<h2>ยังไม่มีสูตร</h2>${not.map(row).join('')}` : ''}
      <a class="btn" href="#/materials">ดูรายการวัตถุดิบและราคา</a>
    </div>`;
  };

  function versionSheet(pid, p, r, ctx) {
    return async (ver) => {
      let v;
      try { v = await LB.busy(() => LB.api('recipes.version', { product_id: pid, version: ver })); } catch (e) { LB.error(e); return; }
      const c = LB.recipeCost({ ...v, product_id: pid }, ctx);
      const s = LB.sheet('สูตรเวอร์ชัน ' + v.version, `
        <p class="small muted" style="margin:0">บันทึก ${esc(LB.dateTimeTh(v.saved_at))} โดย ${esc(v.saved_by || '-')} · ทำ 1 ครั้งได้ ${qtyFmt(v.yield_qty)} ${esc(p.unit)}${
          v.base_product ? ` · ใช้สูตร ${esc(pname(v.base_product))} × ${qtyFmt(v.base_factor)}` : ''}</p>
        ${c.sections.map((sec) => `<div class="stack tight"><h3>${esc(secName(sec.name))}</h3>${sec.choices.map((ch) => `${sec.alt ? `<span class="small muted">${esc(ch.name)}</span>` : ''}
          <span class="small">${ch.lines.map((l) => `${esc(l.material)} ${qtyFmt(l.qty)} ${esc(l.unit)}`).join(' · ')}</span>`).join('')}</div>`).join('')}
        <p class="small muted" style="margin:0">ถ้าใช้สูตรนี้ ต้นทุนตามราคาวันนี้ ${costFmt(c.perUnit)} บาท/${esc(p.unit)}</p>
        ${v.steps ? `<details class="more-opts"><summary>วิธีทำ</summary><p class="pre small">${esc(v.steps)}</p></details>` : ''}
        ${v.version !== r.version ? '<button type="button" class="btn" data-restore>กลับไปใช้สูตรเวอร์ชันนี้</button>' : '<span class="badge ok" style="align-self:flex-start">เวอร์ชันที่ใช้อยู่</span>'}`);
      const rb = s.el.querySelector('[data-restore]');
      if (!rb) return;
      rb.onclick = async () => {
        try {
          const res = await LB.busy(() => LB.api('recipes.save', {
            product_id: pid, yield_qty: v.yield_qty, base_product: v.base_product, base_factor: v.base_factor,
            steps: v.steps, note: v.note, lines: v.lines, expect_version: r.version
          }));
          s.close();
          LB.toast(`กลับไปใช้สูตรเวอร์ชัน ${v.version} แล้ว (บันทึกเป็นเวอร์ชัน ${res.version})`);
          LB.reload();
        } catch (e) { LB.error(e); }
      };
    };
  }

  LB.views.recipe = async (root, params, query, alive) => {
    const pid = params[0];
    const p = product(pid);
    if (!p) { location.replace('#/recipes'); return; }
    root.innerHTML = LB.topbar(p.name, '#/recipes') + LB.loadingHtml;
    const data = await LB.api('recipes.list', { product_id: pid });
    if (!alive()) return;
    const ctx = makeCtx(data.materials, data.recipes);
    const r = ctx.recs.get(pid);
    if (!r) {
      root.innerHTML = `${LB.topbar(p.name, '#/recipes')}<div class="page"><div class="card empty">
        <p style="margin:0">ยังไม่มีสูตรของเมนูนี้</p>
        <a class="btn primary" href="${recipeHref(pid)}/edit">${LB.icon('plus')}เขียนสูตร</a></div></div>`;
      return;
    }
    const picks = {};
    let want = LB.n(r.yield_qty);
    root.innerHTML = `${LB.topbar(p.name, '#/recipes', `<a class="icon-btn" href="${recipeHref(pid)}/edit" aria-label="แก้สูตร">${LB.icon('edit')}</a>`)}<div class="page">
      <div class="stack" data-sum></div>
      <div class="field"><label for="rc-want">ดูปริมาณวัตถุดิบสำหรับกี่${esc(p.unit)}</label>
        <input id="rc-want" class="input" inputmode="decimal" value="${esc(qtyFmt(want))}"><span class="hint" data-scale></span></div>
      <div class="stack" data-body></div>
      ${r.steps ? `<section class="card"><h2>วิธีทำ</h2><p class="pre" style="margin:0">${esc(r.steps)}</p></section>` : ''}
      ${r.note ? `<section class="card tight"><span class="small muted">หมายเหตุ</span><p class="pre" style="margin:0">${esc(r.note)}</p></section>` : ''}
      <details class="more-opts"><summary>ประวัติการแก้สูตร (${data.versions.length} เวอร์ชัน)</summary>
        <div class="stack tight" style="margin-top:8px">${data.versions.map((v) => `<button type="button" class="card tight link row" data-ver="${v.version}" style="text-align:left;font:inherit">
          <span class="grow">เวอร์ชัน ${v.version}${v.version === r.version ? ' · ใช้อยู่' : ''}<br><span class="small muted">${esc(LB.dateTimeTh(v.saved_at))} · ${esc(v.saved_by || '-')}</span></span>${LB.icon('chevron')}</button>`).join('')}</div></details>
    </div>`;
    const sumEl = root.querySelector('[data-sum]');
    const bodyEl = root.querySelector('[data-body]');
    const linesTable = (lines, k) => `<table class="data"><tbody>${lines.map((l) => `<tr><td><a class="plain" href="${matHref(l.material)}">${esc(l.material)}</a></td>
      <td class="r">${qtyFmt(l.qty * k)} ${esc(l.unit)}</td><td class="r muted">${l.cost === null ? '<span class="danger-text">ไม่มีราคา</span>' : costFmt(l.cost * k)}</td></tr>`).join('')}</tbody></table>`;
    const paint = () => {
      const c = LB.recipeCost(r, ctx, picks);
      const price = LB.n(p.price);
      const left = price - c.perUnit;
      const k = want > 0 ? want / c.yieldQty : 1;
      const alts = c.sections.filter((s) => s.choices.length > 1);
      sumEl.innerHTML = `<section class="card">
          <div class="row between small muted"><span>ทำ 1 ครั้งได้ ${qtyFmt(c.yieldQty)} ${esc(p.unit)}</span><span>สูตรเวอร์ชัน ${r.version} · ${esc(LB.dateShort(r.updated_at))}</span></div>
          <div class="grid3">
            <div class="stack tight" style="gap:0"><span class="small muted">ต้นทุน/${esc(p.unit)}</span><span class="num" style="font-size:20px">${costFmt(c.perUnit)}</span></div>
            <div class="stack tight" style="gap:0"><span class="small muted">ราคาขาย</span><span class="num" style="font-size:20px">${LB.money(price)}</span></div>
            <div class="stack tight" style="gap:0"><span class="small muted">เหลือ${price ? ` ${Math.round((left / price) * 100)}%` : ''}</span><span class="num ${left < 0 ? 'danger-text' : 'money'}" style="font-size:20px">${costFmt(left)}</span></div>
          </div>
          <div class="kv"><span class="muted">ต้นทุนต่อครั้ง (${qtyFmt(c.yieldQty)} ${esc(p.unit)})</span><span>${costFmt(c.batch)} บาท</span></div>
          <p class="small muted" style="margin:0">ยังไม่รวมค่าแรง ค่าไฟ ค่าแก๊ส${alts.length ? ' · คิดตามแบบที่เลือกด้านล่าง' : ''}</p>
          ${missingHtml(c.missing)}
        </section>
        ${alts.map((s) => `<section class="card tight"><h3>เทียบ${esc(secName(s.name))}</h3>
          <table class="data"><thead><tr><th>แบบ</th><th class="r">ส่วนนี้/ครั้ง</th><th class="r">รวมต่อ${esc(p.unit)}</th></tr></thead><tbody>
          ${s.choices.map((ch, i) => `<tr><td>${esc(ch.name)}${i === 0 ? ' <span class="small muted">(หลัก)</span>' : ''}</td><td class="r">${costFmt(ch.cost)}</td>
            <td class="r">${costFmt((c.batch - s.picked.cost + ch.cost) / c.yieldQty)}</td></tr>`).join('')}</tbody></table></section>`).join('')}`;
      root.querySelector('[data-scale]').textContent = Math.abs(k - 1) > 1e-9 ? `ปริมาณด้านล่างคูณสูตร × ${qtyFmt(k)} · ต้นทุนรวม ${costFmt(c.batch * k)} บาท` : '';
      bodyEl.innerHTML = c.sections.map((s) => `<section class="card">
          <div class="row between"><h2>${esc(secName(s.name))}</h2><span class="small muted nowrap">${costFmt(s.picked.cost * k)} บาท</span></div>
          ${s.choices.length > 1 ? `<div class="chips">${s.choices.map((ch) => `<button type="button" class="chip soft" data-sec="${esc(s.name)}" data-pick="${esc(ch.name)}" aria-pressed="${ch === s.picked}">${esc(ch.name)}</button>`).join('')}</div>`
            : s.alt ? `<span class="small muted">${esc(s.picked.name)}</span>` : ''}
          ${linesTable(s.picked.lines, k)}</section>`).join('')
        + (c.base ? `<section class="card">
          <div class="row between"><h2>สูตร <a href="${recipeHref(c.base.product_id)}">${esc(pname(c.base.product_id))}</a> × ${qtyFmt(c.base.factor)}</h2><span class="small muted nowrap">${costFmt(c.base.cost * k)} บาท</span></div>
          ${c.base.of.sections.map((s) => `<span class="small muted">${esc(secName(s.name))}${s.alt ? ' · ' + esc(s.picked.name) : ''}</span>${linesTable(s.picked.lines, c.base.factor * k)}`).join('')}</section>` : '')
        + (r.base_product && !c.base ? '<p class="small danger-text">สูตรฐานถูกลบไปแล้ว แก้สูตรนี้ใหม่</p>' : '');
    };
    paint();
    root.querySelector('#rc-want').addEventListener('input', (e) => { want = num(e.target.value); paint(); });
    bodyEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      picks[b.dataset.sec] = b.dataset.pick;
      paint();
    });
    const openVersion = versionSheet(pid, p, r, ctx);
    root.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => openVersion(Number(b.dataset.ver)); });
  };

  /* ---------------- เขียนและแก้สูตร ---------------- */

  const newLine = () => ({ material: '', qty: '' });
  const newSection = (name) => ({ name, alts: false, choices: [{ name: '', lines: [newLine()] }] });
  const qtyStr = (v) => (hasCost(v) ? String(Number(v)) : '');

  function toModel(r) {
    const m = {
      yield_qty: r ? qtyStr(r.yield_qty) : '', base_product: r ? r.base_product : '', base_factor: r ? qtyStr(r.base_factor) : '',
      steps: r ? r.steps : '', note: r ? r.note : '', sections: []
    };
    (r ? r.lines : []).forEach((l) => {
      let s = m.sections.find((x) => x.name === l.section);
      if (!s) { s = { name: l.section, alts: false, choices: [] }; m.sections.push(s); }
      if (l.choice) s.alts = true;
      let c = s.choices.find((x) => x.name === l.choice);
      if (!c) { c = { name: l.choice, lines: [] }; s.choices.push(c); }
      c.lines.push({ material: l.material, qty: qtyStr(l.qty) });
    });
    if (!m.sections.length) m.sections.push(newSection(''));
    return m;
  }

  function toLines(st) {
    const out = [];
    st.sections.forEach((s) => s.choices.forEach((c) => c.lines.forEach((l) => {
      if (l.material.trim() || String(l.qty).trim()) {
        out.push({ section: s.name.trim(), choice: s.alts ? c.name.trim() : '', material: l.material.trim(), qty: String(l.qty).replace(/,/g, '').trim() });
      }
    })));
    return out;
  }

  LB.views.recipeEdit = async (root, params, query, alive) => {
    const pid = params[0];
    const p = product(pid);
    if (!p) { location.replace('#/recipes'); return; }
    root.innerHTML = LB.topbar('แก้สูตร', recipeHref(pid)) + LB.loadingHtml;
    const data = await LB.api('recipes.list', { product_id: pid });
    if (!alive()) return;
    let ctx = makeCtx(data.materials, data.recipes);
    const r = ctx.recs.get(pid);
    const st = toModel(r);
    const bases = data.recipes.filter((x) => x.product_id !== pid && !x.base_product);
    const matOptions = () => data.materials.filter((m) => m.status === 'active').map((m) => `<option value="${esc(m.name)}">`).join('');
    root.innerHTML = `${LB.topbar(r ? 'แก้สูตร' : 'เขียนสูตร', recipeHref(pid))}<form class="page no-nav" data-form novalidate>
      <datalist id="mat-list">${matOptions()}</datalist>
      <section class="card tight"><span class="label" style="font-size:16px">${esc(p.name)}</span>
        <div class="field"><label for="re-yield">ทำ 1 ครั้งได้กี่${esc(p.unit)}</label><input id="re-yield" class="input" inputmode="decimal" value="${esc(st.yield_qty)}" data-k="yield_qty"></div>
        ${bases.length || st.base_product ? `<details class="more-opts" ${st.base_product ? 'open' : ''}><summary>ใช้สูตรของเมนูอื่นเป็นฐาน</summary>
          <div class="stack" style="margin-top:8px"><span class="hint">เช่น เค้ก 2 ปอนด์ = สูตร 1 ปอนด์ × 2 แล้วใส่เฉพาะกล่องและฐานเค้กด้านล่าง</span>
          <div class="grid2"><div class="field"><label for="re-base">สูตรฐาน</label><select id="re-base" class="input" data-k="base_product"><option value="">ไม่ใช้</option>${
            bases.map((b) => `<option value="${esc(b.product_id)}" ${b.product_id === st.base_product ? 'selected' : ''}>${esc(pname(b.product_id))}</option>`).join('')}</select></div>
          <div class="field"><label for="re-factor">คูณ</label><input id="re-factor" class="input" inputmode="decimal" value="${esc(st.base_factor)}" data-k="base_factor" placeholder="เช่น 2 หรือ 0.5"></div></div></div></details>` : ''}
      </section>
      <div class="stack" data-secs></div>
      <button type="button" class="btn" data-act="add-sec">${LB.icon('plus')}เพิ่มส่วนของสูตร</button>
      <div class="field"><label for="re-steps">วิธีทำ</label><textarea id="re-steps" class="input" rows="6" data-k="steps" maxlength="8000" placeholder="เขียนเป็นข้อ ๆ ได้">${esc(st.steps)}</textarea></div>
      <div class="field"><label for="re-note">หมายเหตุ</label><textarea id="re-note" class="input" rows="2" data-k="note" maxlength="1000">${esc(st.note)}</textarea></div>
      <section class="card tight" data-total></section>
      <button type="submit" class="btn primary">${r ? 'บันทึกเป็นสูตรเวอร์ชันใหม่' : 'บันทึกสูตร'}</button>
      ${r ? '<button type="button" class="btn danger" data-del>ลบสูตรนี้</button>' : ''}
    </form>`;
    const form = root.querySelector('[data-form]');
    const secsEl = root.querySelector('[data-secs]');
    const totalEl = root.querySelector('[data-total]');

    const draft = () => ({
      yield_qty: num(st.yield_qty) || 1, base_product: st.base_product, base_factor: num(st.base_factor),
      lines: toLines(st).filter((l) => ctx.mats.has(l.material) && num(l.qty) > 0).map((l) => ({ ...l, qty: num(l.qty) }))
    });

    const refresh = () => {
      secsEl.querySelectorAll('.line-row').forEach((row) => {
        const l = st.sections[row.dataset.s].choices[row.dataset.c].lines[row.dataset.l];
        const name = l.material.trim();
        const m = ctx.mats.get(name);
        row.querySelector('[data-unit]').textContent = m ? m.unit : '';
        const info = row.querySelector('[data-info]');
        if (!name) info.textContent = '';
        else if (!m) info.innerHTML = `<button type="button" class="link-btn small" data-act="new-mat">เพิ่ม "${esc(name)}" เข้ารายการวัตถุดิบ</button>`;
        else if (!hasCost(m.unit_cost)) info.innerHTML = '<span class="danger-text">ยังไม่มีราคา</span>';
        else info.textContent = num(l.qty) > 0 ? `≈ ${costFmt(m.unit_cost * num(l.qty))} บาท` : `${unitCostFmt(m.unit_cost)} บาท/${m.unit}`;
      });
      const c = LB.recipeCost(draft(), ctx);
      st.sections.forEach((s, si) => {
        const cs = c.sections.find((x) => x.name === s.name.trim());
        secsEl.querySelector(`[data-sec-cost="${si}"]`).textContent = cs ? costFmt(cs.picked.cost) + ' บาท' : '';
      });
      const price = LB.n(p.price);
      totalEl.innerHTML = `<div class="kv"><span>ต้นทุนต่อครั้ง</span><span>${costFmt(c.batch)} บาท</span></div>
        <div class="kv total"><span>ต้นทุนต่อ${esc(p.unit)}</span><span>${costFmt(c.perUnit)} บาท</span></div>
        ${price ? `<div class="kv"><span class="muted">ขาย ${LB.money(price)} บาท เหลือ</span><span class="${price - c.perUnit < 0 ? 'danger-text' : ''}">${costFmt(price - c.perUnit)} บาท</span></div>` : ''}
        ${c.sections.some((s) => s.choices.length > 1) ? '<span class="small muted">ส่วนที่มีทางเลือก คิดจากแบบหลัก</span>' : ''}
        ${missingHtml(c.missing)}`;
    };

    const lineHtml = (si, ci, li, l) => `<div class="line-row" data-s="${si}" data-c="${ci}" data-l="${li}">
      <input class="input mat" list="mat-list" value="${esc(l.material)}" data-f="mat" placeholder="วัตถุดิบ" aria-label="วัตถุดิบ" autocomplete="off">
      <button type="button" class="icon-btn del" data-act="del-line" aria-label="ลบ ${esc(l.material || 'บรรทัดนี้')}">${LB.icon('close')}</button>
      <span class="info small muted" data-info></span>
      <input class="input qty" inputmode="decimal" value="${esc(l.qty)}" data-f="qty" placeholder="ปริมาณ" aria-label="ปริมาณ">
      <span class="unit small" data-unit></span></div>`;
    const choiceHtml = (s, si, c, ci) => `${s.alts ? `<div class="row">
        <input class="input grow" value="${esc(c.name)}" data-f="choice" data-s="${si}" data-c="${ci}" placeholder="ชื่อทางเลือก เช่น ทำเอง" aria-label="ชื่อทางเลือก">
        ${ci === 0 ? '<span class="badge ok">แบบหลัก</span>' : `<button type="button" class="link-btn small nowrap" data-act="main-choice" data-s="${si}" data-c="${ci}">ตั้งเป็นหลัก</button>`}
        <button type="button" class="icon-btn" data-act="del-choice" data-s="${si}" data-c="${ci}" aria-label="ลบทางเลือกนี้">${LB.icon('close')}</button></div>` : ''}
      ${c.lines.map((l, li) => lineHtml(si, ci, li, l)).join('')}
      <button type="button" class="btn small" data-act="add-line" data-s="${si}" data-c="${ci}" style="align-self:flex-start">${LB.icon('plus')}วัตถุดิบ</button>`;
    const renderSecs = () => {
      secsEl.innerHTML = st.sections.map((s, si) => `<section class="card">
        <div class="row"><input class="input grow" value="${esc(s.name)}" data-f="sec" data-s="${si}" placeholder="ชื่อส่วน เช่น ฐาน ไส้ บรรจุภัณฑ์" aria-label="ชื่อส่วนของสูตร">
          <span class="small muted nowrap" data-sec-cost="${si}"></span>
          <button type="button" class="icon-btn" data-act="del-sec" data-s="${si}" aria-label="ลบส่วนนี้">${LB.icon('close')}</button></div>
        ${s.alts ? s.choices.map((c, ci) => `<div class="choice-box">${choiceHtml(s, si, c, ci)}</div>`).join('') : choiceHtml(s, si, s.choices[0], 0)}
        <button type="button" class="link-btn small" data-act="add-choice" data-s="${si}" style="align-self:flex-start">${s.alts ? '+ เพิ่มทางเลือก' : '+ มีให้เลือกหลายแบบ'}</button>
      </section>`).join('');
      refresh();
    };
    renderSecs();

    const onInput = (e) => {
      const el = e.target;
      if (el.dataset.k) { st[el.dataset.k] = el.value; refresh(); return; }
      const f = el.dataset.f;
      if (!f) return;
      if (f === 'sec') st.sections[el.dataset.s].name = el.value;
      else if (f === 'choice') st.sections[el.dataset.s].choices[el.dataset.c].name = el.value;
      else {
        const row = el.closest('.line-row');
        const l = st.sections[row.dataset.s].choices[row.dataset.c].lines[row.dataset.l];
        if (f === 'mat') l.material = el.value; else l.qty = el.value;
      }
      refresh();
    };
    form.addEventListener('input', onInput);
    form.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') onInput(e); });

    const focusLast = (sel) => { const all = secsEl.querySelectorAll(sel); if (all.length) all[all.length - 1].focus(); };
    form.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'add-sec') { st.sections.push(newSection('')); renderSecs(); focusLast('[data-f="sec"]'); return; }
      const row = b.closest('.line-row');
      const si = Number(row ? row.dataset.s : b.dataset.s);
      const ci = Number(row ? row.dataset.c : b.dataset.c);
      const s = st.sections[si];
      if (act === 'add-line') {
        s.choices[ci].lines.push(newLine());
        renderSecs();
        focusLast(`.line-row[data-s="${si}"][data-c="${ci}"] [data-f="mat"]`);
      } else if (act === 'del-line') {
        s.choices[ci].lines.splice(Number(row.dataset.l), 1);
        renderSecs();
      } else if (act === 'add-choice') {
        s.alts = true;
        s.choices.push({ name: '', lines: [newLine()] });
        renderSecs();
        focusLast(`[data-f="choice"][data-s="${si}"]`);
      } else if (act === 'del-choice') {
        const ch = s.choices[ci];
        if (ch.lines.some((l) => l.material.trim()) && !(await LB.confirm('ลบทางเลือกนี้?', `วัตถุดิบในแบบ "${ch.name || 'ไม่มีชื่อ'}" จะถูกเอาออกจากสูตร`, 'ลบ', true))) return;
        s.choices.splice(ci, 1);
        if (s.choices.length <= 1) {
          s.alts = false;
          if (!s.choices.length) s.choices.push({ name: '', lines: [newLine()] });
          s.choices[0].name = '';
        }
        renderSecs();
      } else if (act === 'main-choice') {
        s.choices.unshift(s.choices.splice(ci, 1)[0]);
        renderSecs();
      } else if (act === 'del-sec') {
        const used = s.choices.some((c) => c.lines.some((l) => l.material.trim()));
        if (used && !(await LB.confirm('ลบส่วนนี้?', `วัตถุดิบทั้งหมดในส่วน "${secName(s.name.trim())}" จะถูกเอาออกจากสูตร`, 'ลบ', true))) return;
        st.sections.splice(si, 1);
        if (!st.sections.length) st.sections.push(newSection(''));
        renderSecs();
      } else if (act === 'new-mat') {
        const l = s.choices[ci].lines[Number(row.dataset.l)];
        materialSheet(null, l.material.trim(), (res) => {
          data.materials = res.materials;
          ctx = makeCtx(data.materials, data.recipes);
          root.querySelector('#mat-list').innerHTML = matOptions();
          l.material = res.name;
          renderSecs();
          LB.toast('เพิ่มแล้ว ใส่ยี่ห้อและราคาได้ที่หน้าวัตถุดิบ');
        });
      }
    });

    const validate = () => {
      if (!(num(st.yield_qty) > 0)) return `ใส่จำนวนที่ทำได้ต่อครั้ง (${p.unit})`;
      if (st.base_product && !(num(st.base_factor) > 0)) return 'ใส่ตัวคูณของสูตรฐาน';
      const seen = new Set();
      for (const s of st.sections) {
        const sn = s.name.trim();
        if (!s.choices.some((c) => c.lines.some((l) => l.material.trim() || String(l.qty).trim()))) continue;
        if (seen.has(sn)) return sn ? `ชื่อส่วน "${sn}" ซ้ำกัน` : 'มีส่วนที่ไม่มีชื่อมากกว่า 1 ส่วน ตั้งชื่อให้แต่ละส่วน';
        seen.add(sn);
        if (s.alts) {
          const names = new Set();
          for (const c of s.choices) {
            if (!c.lines.some((l) => l.material.trim())) continue;
            const n = c.name.trim();
            if (!n) return `ตั้งชื่อทางเลือกในส่วน "${secName(sn)}"`;
            if (names.has(n)) return `ชื่อทางเลือก "${n}" ซ้ำกัน`;
            names.add(n);
          }
        }
        for (const c of s.choices) {
          for (const l of c.lines) {
            const mn = l.material.trim();
            if (!mn && !String(l.qty).trim()) continue;
            if (!mn) return `ใส่ชื่อวัตถุดิบในส่วน "${secName(sn)}"`;
            if (!ctx.mats.has(mn)) return `ไม่พบ "${mn}" ในรายการวัตถุดิบ กดเพิ่มเข้ารายการก่อน`;
            if (!(num(l.qty) > 0)) return `ใส่ปริมาณของ ${mn}`;
          }
        }
      }
      if (!seen.size && !st.base_product) return 'ใส่วัตถุดิบอย่างน้อย 1 รายการ';
      return '';
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = validate();
      if (err) { LB.error(err); return; }
      try {
        const res = await LB.busy(() => LB.api('recipes.save', {
          product_id: pid, yield_qty: String(st.yield_qty).replace(/,/g, ''), base_product: st.base_product,
          base_factor: st.base_product ? String(st.base_factor).replace(/,/g, '') : '', steps: st.steps, note: st.note,
          lines: toLines(st), expect_version: r ? r.version : ''
        }));
        LB.toast(res.unchanged ? 'สูตรเหมือนเดิม ไม่ได้สร้างเวอร์ชันใหม่' : `บันทึกสูตรแล้ว (เวอร์ชัน ${res.version})`);
        LB.back(recipeHref(pid));
      } catch (err2) { LB.error(err2); }
    });

    const del = root.querySelector('[data-del]');
    if (del) {
      del.onclick = async () => {
        if (!(await LB.confirm('ลบสูตรนี้?', `${p.name} จะไม่มีสูตรและไม่คิดต้นทุน ประวัติเวอร์ชันเก่ายังเก็บไว้`, 'ลบสูตร', true))) return;
        try {
          await LB.busy(() => LB.api('recipes.delete', { product_id: pid }));
          LB.toast('ลบสูตรแล้ว');
          location.replace('#/recipes');
        } catch (e2) { LB.error(e2); }
      };
    }
  };
})();
