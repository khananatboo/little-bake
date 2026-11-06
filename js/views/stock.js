/* สต็อกวัตถุดิบ: รับของเข้า นับสต็อก */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;
  const K = () => LB.kitchen;

  /* ---------------- รับของเข้า ---------------- */

  LB.views.receive = async (root, params, query, alive) => {
    const { num, qtyFmt, priceFmt, unitCostFmt, hasCost, matHref } = K();
    const back = query.m ? matHref(query.m) : '#/materials';
    root.innerHTML = LB.topbar('รับของเข้า', back) + LB.loadingHtml;
    const [ml, rl] = await Promise.all([LB.api('materials.list'), LB.api('stock.receipts')]);
    if (!alive()) return;
    const mats = ml.materials;
    const items = new Map();
    const options = [];
    mats.filter((m) => m.status === 'active').forEach((m) => m.items.filter((i) => i.status === 'active').forEach((i) => {
      const text = (i.label.includes(m.name) ? i.label : `${m.name} · ${i.label}`) + ` (${i.id})`;
      items.set(i.id, { ...i, mat: m, text });
      options.push(text);
    }));
    const resolve = (text) => {
      const t = String(text || '').trim();
      const hit = /\(([^()]+)\)\s*$/.exec(t);
      if (hit && items.has(hit[1])) return items.get(hit[1]);
      return [...items.values()].find((i) => i.label === t || i.text === t) || null;
    };
    const blank = () => ({ text: '', packs: '', total: '', size: '', exp: '' });
    const lines = [blank()];
    if (query.m) {
      const m = mats.find((x) => x.name === query.m);
      const it = m && items.get(m.main_item);
      if (it) lines[0].text = it.text;
    }

    root.innerHTML = `${LB.topbar('รับของเข้า', back)}<div class="page no-nav">
      <form class="stack" data-form novalidate>
        <datalist id="item-list">${LB.sortByName(options, (x) => x).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <datalist id="sup-list">${rl.suppliers.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <div class="grid2">
          <div class="field"><label for="rv-date">วันที่รับ</label><input id="rv-date" class="input" type="date" value="${LB.today()}" max="${LB.today()}"></div>
          <div class="field"><label for="rv-sup">ร้านที่ซื้อ</label><input id="rv-sup" class="input" list="sup-list" maxlength="100" placeholder="ไม่บังคับ"></div>
        </div>
        <div class="stack" data-lines></div>
        <button type="button" class="btn" data-add>${LB.icon('plus')}เพิ่มรายการ</button>
        <div class="field"><label for="rv-note">หมายเหตุ</label><input id="rv-note" class="input" maxlength="300" placeholder="ไม่บังคับ"></div>
        <section class="card tight" data-sum></section>
        <button type="submit" class="btn primary">บันทึกรับของ</button>
      </form>
      <div class="stack" data-receipts></div>
    </div>`;
    const form = root.querySelector('[data-form]');
    const linesEl = root.querySelector('[data-lines]');

    const calc = (l) => {
      const it = resolve(l.text);
      if (!it) return { it };
      const size = LB.n(it.pack_size) > 0 ? LB.n(it.pack_size) : num(l.size);
      const packs = num(l.packs);
      const qty = packs * size;
      const old = hasCost(it.price) ? LB.n(it.price) : null;
      const typed = String(l.total).trim() !== '';
      const total = typed ? num(l.total) : (old !== null ? Math.round(old * packs * 100) / 100 : null);
      return { it, size, packs, qty, total, typed, old };
    };
    const paintLine = (row) => {
      const l = lines[row.dataset.i];
      const c = calc(l);
      const info = row.querySelector('[data-info]');
      const out = row.querySelector('[data-calc]');
      const sizeField = row.querySelector('[data-size-field]');
      const it = c.it;
      row.querySelector('[data-pu]').textContent = it && it.pack_unit ? `(${it.pack_unit})` : '';
      sizeField.hidden = !it || LB.n(it.pack_size) > 0;
      if (it) sizeField.querySelector('label').textContent = `1 ${it.pack_unit || 'หน่วยที่ซื้อ'} = กี่ ${it.mat.unit}`;
      const totalIn = row.querySelector('[data-f="total"]');
      totalIn.placeholder = it && c.old !== null && c.packs > 0 ? `ราคาเดิม ${priceFmt(c.total)}` : '';
      if (!l.text.trim()) { info.textContent = ''; out.textContent = ''; return; }
      if (!it) {
        info.innerHTML = '<span class="danger-text">เลือกจากรายการที่ขึ้นมาตอนพิมพ์ ถ้าไม่มี ให้เพิ่มยี่ห้อในหน้าวัตถุดิบก่อน</span>';
        out.textContent = '';
        return;
      }
      info.textContent = `${it.mat.name} · ${LB.n(it.pack_size) > 0 ? `${it.pack_unit || 'หน่วยที่ซื้อ'}ละ ${qtyFmt(it.pack_size)} ${it.mat.unit}` : 'ยังไม่มีขนาด'}${c.old !== null ? ` · ราคาล่าสุด ${priceFmt(c.old)} บาท` : ''}`;
      if (!(c.packs > 0) || !(c.size > 0)) { out.textContent = ''; return; }
      const parts = [`= ${qtyFmt(c.qty)} ${it.mat.unit}`];
      if (c.total !== null) parts.push(`${unitCostFmt(c.total / c.qty)} บาท/${it.mat.unit}`);
      let change = '';
      if (c.typed && c.old !== null && c.packs > 0) {
        const per = (c.total / c.qty) * (LB.n(it.pack_size) || c.size);
        const diff = per - c.old;
        if (Math.abs(diff) >= 0.005) {
          change = ` · ราคา${diff > 0 ? 'ขึ้น' : 'ลง'}จาก ${priceFmt(c.old)} เป็น ${priceFmt(Math.round(per * 100) / 100)} บาท${c.old ? ` (${diff > 0 ? '+' : ''}${Math.round((diff / c.old) * 100)}%)` : ''}`;
        }
      }
      out.innerHTML = `${esc(parts.join(' · '))}<span class="${change.includes('ขึ้น') ? 'danger-text' : ''}">${esc(change)}</span>`;
    };
    const paintSum = () => {
      let total = 0;
      let count = 0;
      let unknown = 0;
      lines.forEach((l) => {
        const c = calc(l);
        if (!c.it || !(c.packs > 0)) return;
        count += 1;
        if (c.total === null) unknown += 1; else total += c.total;
      });
      root.querySelector('[data-sum]').innerHTML = `<div class="kv total"><span>รวม ${count} รายการ</span><span class="num money">${LB.baht(Math.round(total * 100) / 100)}</span></div>
        ${unknown ? `<span class="small danger-text">ยังไม่ได้ใส่ราคา ${unknown} รายการ</span>` : ''}`;
    };
    const render = () => {
      linesEl.innerHTML = lines.map((l, i) => `<section class="card tight" data-i="${i}">
        <div class="row"><input class="input grow" list="item-list" data-f="text" value="${esc(l.text)}" placeholder="พิมพ์ชื่อวัตถุดิบหรือยี่ห้อ" aria-label="วัตถุดิบที่รับ รายการที่ ${i + 1}" autocomplete="off">
          <button type="button" class="icon-btn" data-del aria-label="ลบรายการที่ ${i + 1}">${LB.icon('close')}</button></div>
        <span class="small muted" data-info></span>
        <div class="grid2">
          <div class="field"><label for="rv-p${i}">จำนวนที่ซื้อ <span data-pu></span></label><input id="rv-p${i}" class="input" inputmode="decimal" data-f="packs" value="${esc(l.packs)}"></div>
          <div class="field"><label for="rv-t${i}">จ่ายรวม (บาท)</label><input id="rv-t${i}" class="input" inputmode="decimal" data-f="total" value="${esc(l.total)}"></div>
        </div>
        <div class="field" data-size-field hidden><label for="rv-s${i}">ขนาด</label><input id="rv-s${i}" class="input" inputmode="decimal" data-f="size" value="${esc(l.size)}"></div>
        <div class="field"><label for="rv-e${i}">วันหมดอายุ (ไม่บังคับ)</label><input id="rv-e${i}" class="input" type="date" data-f="exp" value="${esc(l.exp)}"></div>
        <span class="small" data-calc></span></section>`).join('');
      linesEl.querySelectorAll('[data-i]').forEach(paintLine);
      paintSum();
    };
    render();

    form.addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      const row = e.target.closest('[data-i]');
      if (!f || !row) return;
      lines[row.dataset.i][f] = e.target.value;
      paintLine(row);
      paintSum();
    });
    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) {
        lines.push(blank());
        render();
        const all = linesEl.querySelectorAll('[data-f="text"]');
        all[all.length - 1].focus();
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        lines.splice(Number(del.closest('[data-i]').dataset.i), 1);
        if (!lines.length) lines.push(blank());
        render();
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = [];
      for (const l of lines) {
        if (!l.text.trim() && !String(l.packs).trim()) continue;
        const c = calc(l);
        if (!c.it) { LB.error(`ไม่พบ "${l.text.trim() || 'รายการว่าง'}" ในรายการวัตถุดิบ`); return; }
        if (!(c.packs > 0)) { LB.error('ใส่จำนวนที่ซื้อของ ' + c.it.label); return; }
        if (!(c.size > 0)) { LB.error('ใส่ขนาดของ ' + c.it.label); return; }
        if (c.total === null) { LB.error('ใส่ราคาที่จ่ายของ ' + c.it.label); return; }
        out.push({
          item_id: c.it.id, packs: String(l.packs).replace(/,/g, '').trim(), total: c.typed ? String(l.total).replace(/,/g, '').trim() : '',
          pack_size: LB.n(c.it.pack_size) > 0 ? '' : String(l.size).replace(/,/g, '').trim(), expire_date: l.exp
        });
      }
      if (!out.length) { LB.error('เลือกวัตถุดิบที่รับเข้าอย่างน้อย 1 รายการ'); return; }
      try {
        const res = await LB.busy(() => LB.api('stock.receive', {
          date: form.querySelector('#rv-date').value, supplier: form.querySelector('#rv-sup').value,
          note: form.querySelector('#rv-note').value, lines: out
        }));
        LB.toast(`บันทึกรับของ ${res.lines.length} รายการ รวม ${LB.baht(res.total)}`);
        if (query.m) LB.back(back); else LB.reload();
      } catch (err) { LB.error(err); }
    });

    const rcEl = root.querySelector('[data-receipts]');
    rcEl.innerHTML = rl.receipts.length ? `<h2>รับของล่าสุด</h2>${rl.receipts.map((r) => `<details class="more-opts">
        <summary><span>${esc(LB.dateTh(r.date))} · ${esc(r.supplier || 'ไม่ระบุร้าน')} · ${LB.baht(r.total)}</span></summary>
        <div class="stack tight" style="margin-top:8px">
          ${r.lines.map((l) => `<div class="row small"><span class="grow">${esc(l.label || l.material)} ${qtyFmt(l.packs)} ${esc(l.pack_unit)}${l.expire_date ? ` · หมดอายุ ${esc(LB.dateShort(l.expire_date))}` : ''}</span>
            <span class="nowrap">${LB.money(l.total)}</span>${l.used ? '' : `<button type="button" class="link-btn small" data-lot="${esc(l.id)}" data-label="${esc(l.label || l.material)}">ลบ</button>`}</div>`).join('')}
          ${r.note ? `<span class="small muted">${esc(r.note)}</span>` : ''}
          <span class="small muted">บันทึกโดย ${esc(r.created_by || '-')} · ลบได้เฉพาะรายการที่ยังไม่ถูกใช้หรือนับสต็อก</span>
        </div></details>`).join('')}` : '';
    rcEl.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-lot]');
      if (!b) return;
      if (!(await LB.confirm('ลบรายการนี้?', `${b.dataset.label} จะถูกเอาออกจากสต็อก (ใช้เมื่อบันทึกผิด) ราคาล่าสุดของยี่ห้อไม่ย้อนกลับ แก้ได้ที่หน้าวัตถุดิบ`, 'ลบ', true))) return;
      try {
        await LB.busy(() => LB.api('stock.lotDelete', { id: b.dataset.lot }));
        LB.toast('ลบแล้ว');
        LB.reload();
      } catch (err) { LB.error(err); }
    });
  };

  /* ---------------- นับสต็อก ---------------- */

  LB.views.count = async (root, params, query, alive) => {
    const { KINDS, num, qtyFmt, matHref, stockText } = K();
    const only = query.m || '';
    const back = only ? matHref(only) : '#/materials';
    root.innerHTML = LB.topbar('นับสต็อก', back) + LB.loadingHtml;
    const mats = (await LB.api('materials.list')).materials;
    if (!alive()) return;
    const list = LB.sortByName(mats.filter((m) => m.status === 'active' && (!only || m.name === only)), (m) => m.name);
    const unitsOf = (m) => {
      const seen = new Set();
      const out = [[1, m.unit]];
      m.items.filter((i) => i.status === 'active' && LB.n(i.pack_size) > 1 && i.pack_unit).forEach((i) => {
        const k = i.pack_unit + '|' + LB.n(i.pack_size);
        if (seen.has(k)) return;
        seen.add(k);
        out.push([LB.n(i.pack_size), `${i.pack_unit} (${qtyFmt(i.pack_size)} ${m.unit})`]);
      });
      return out;
    };
    const kinds = KINDS.filter((k) => list.some((m) => m.kind === k));
    let filter = 'all';
    root.innerHTML = `${LB.topbar(only ? 'นับสต็อก ' + only : 'นับสต็อก', back)}<form class="page no-nav" data-form novalidate>
      <p class="small muted" style="margin:0">ใส่จำนวนที่มีอยู่จริงเฉพาะรายการที่นับ ช่องที่เว้นว่างจะไม่เปลี่ยน ระบบจะปรับยอดให้ตรงกับที่นับ ของที่หมดอายุและทิ้งไปแล้วไม่ต้องนับรวม</p>
      ${only ? '' : `<input class="input" type="search" data-q placeholder="ค้นหาชื่อ" aria-label="ค้นหาวัตถุดิบ">
      <div class="chips scroll" data-chips>${[['all', 'ทั้งหมด'], ...kinds.map((k) => [k, k])].map(([k, l]) => `<button type="button" class="chip" data-f="${esc(k)}" aria-pressed="${k === filter}">${esc(l)}</button>`).join('')}</div>`}
      ${list.map((m) => `<section class="card tight" data-m="${esc(m.name)}" data-kind="${esc(m.kind)}">
        <div class="row between top"><span class="label grow">${esc(m.name)}</span><span class="small muted right">${m.tracked
          ? 'ในระบบ ' + esc(stockText(m)) + (LB.n(m.expired) ? `<br><span class="danger-text">หมดอายุแล้ว ${qtyFmt(m.expired)} ${esc(m.unit)}</span>` : '') : 'ยังไม่เคยนับ'}</span></div>
        <div class="row"><input class="input grow" inputmode="decimal" data-qty placeholder="นับได้" aria-label="จำนวนที่นับได้ของ ${esc(m.name)}">
          <select class="input" data-unit style="flex:none;width:44%" aria-label="หน่วยที่นับของ ${esc(m.name)}">${unitsOf(m).map(([f, l]) => `<option value="${f}">${esc(l)}</option>`).join('')}</select></div>
        <span class="small" data-diff></span></section>`).join('') || '<p class="empty">ไม่พบวัตถุดิบ</p>'}
      <div class="field"><label for="ct-note">หมายเหตุ</label><input id="ct-note" class="input" maxlength="300" placeholder="เช่น นับต้นเดือน ทิ้งของหมดอายุ"></div>
      <button type="submit" class="btn primary" data-submit>บันทึกการนับ</button>
    </form>`;
    const form = root.querySelector('[data-form]');
    const byName = new Map(list.map((m) => [m.name, m]));
    const readRow = (row) => {
      const v = row.querySelector('[data-qty]').value.trim();
      if (v === '') return null;
      return Math.round(num(v) * Number(row.querySelector('[data-unit]').value) * 1000) / 1000;
    };
    const paintRow = (row) => {
      const m = byName.get(row.dataset.m);
      const qty = readRow(row);
      const el = row.querySelector('[data-diff]');
      if (qty === null) { el.textContent = ''; el.className = 'small'; }
      else {
        const diff = Math.round((qty - LB.n(m.on_hand) - LB.n(m.expired)) * 1000) / 1000;
        el.className = 'small ' + (diff < 0 ? 'danger-text' : 'muted');
        el.textContent = `= ${qtyFmt(qty)} ${m.unit} · ` + (!m.tracked ? 'ตั้งเป็นยอดเริ่มต้น' : diff === 0 ? 'ตรงกับในระบบ' : `ปรับ ${diff > 0 ? '+' : '−'}${qtyFmt(Math.abs(diff))} ${m.unit}`);
      }
      const n = [...form.querySelectorAll('[data-m]')].filter((r) => readRow(r) !== null).length;
      form.querySelector('[data-submit]').textContent = n ? `บันทึกการนับ ${n} รายการ` : 'บันทึกการนับ';
    };
    form.addEventListener('input', (e) => { const row = e.target.closest('[data-m]'); if (row) paintRow(row); });
    form.addEventListener('change', (e) => { const row = e.target.closest('[data-m]'); if (row) paintRow(row); });
    const applyFilter = () => {
      const qEl = form.querySelector('[data-q]');
      const words = qEl ? qEl.value.trim().toLowerCase() : '';
      form.querySelectorAll('[data-m]').forEach((row) => {
        row.hidden = !((filter === 'all' || row.dataset.kind === filter) && (!words || row.dataset.m.toLowerCase().includes(words)));
      });
    };
    const qEl = form.querySelector('[data-q]');
    if (qEl) qEl.addEventListener('input', applyFilter);
    const chips = form.querySelector('[data-chips]');
    if (chips) {
      chips.addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        filter = b.dataset.f;
        chips.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        applyFilter();
      });
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const counts = [...form.querySelectorAll('[data-m]')].map((row) => ({ material: row.dataset.m, qty: readRow(row) })).filter((x) => x.qty !== null);
      if (!counts.length) { LB.error('ใส่จำนวนที่นับได้อย่างน้อย 1 รายการ'); return; }
      try {
        const res = await LB.busy(() => LB.api('stock.count', { counts: counts.map((x) => ({ ...x, qty: String(x.qty) })), note: form.querySelector('#ct-note').value }));
        const changed = res.counts.filter((x) => LB.n(x.diff) !== 0);
        const s = LB.sheet('บันทึกการนับแล้ว', `<p style="margin:0">นับ ${res.counts.length} รายการ · ปรับยอด ${changed.length} รายการ</p>
          ${changed.length ? `<table class="data"><thead><tr><th>วัตถุดิบ</th><th class="r">ในระบบ</th><th class="r">นับได้</th><th class="r">ปรับ</th></tr></thead><tbody>
          ${changed.map((x) => `<tr><td>${esc(x.material)}</td><td class="r">${qtyFmt(x.before)}</td><td class="r">${qtyFmt(x.after)} ${esc(x.unit)}</td>
            <td class="r ${LB.n(x.diff) < 0 ? 'danger-text' : ''}">${LB.n(x.diff) > 0 ? '+' : '−'}${qtyFmt(Math.abs(LB.n(x.diff)))}</td></tr>`).join('')}</tbody></table>` : ''}
          <button type="button" class="btn primary" data-close>เสร็จ</button>`);
        const obs = new MutationObserver(() => {
          if (!document.body.contains(s.el)) { obs.disconnect(); location.replace(back); }
        });
        obs.observe(document.body, { childList: true });
      } catch (err) { LB.error(err); }
    });
  };
})();
