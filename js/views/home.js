/* หน้าหลัก */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  LB.roundItemsHtml = (r) => r.items.map((i) => {
    const pctOk = i.max_qty ? Math.min(100, ((i.ordered - i.pending) / i.max_qty) * 100) : 0;
    const pctPend = i.max_qty ? Math.min(100 - pctOk, (i.pending / i.max_qty) * 100) : 0;
    return `<div class="stack tight">
      <div class="row between label"><span class="grow">${esc(i.name)}</span>
      <span class="nowrap">จอง ${i.ordered}/${i.max_qty}${i.pending ? ` · รอมัดจำ ${i.pending}` : ''}</span></div>
      <div class="bar" role="img" aria-label="จองแล้ว ${i.ordered} จาก ${i.max_qty}"><span class="a" style="width:${pctOk}%"></span><span class="b" style="width:${pctPend}%"></span></div></div>`;
  }).join('');

  LB.orderRowHtml = (o, action) => `<div class="list-row">
    ${LB.badge(o.status)}
    <a class="grow" href="#/order/${esc(o.id)}" style="color:inherit;text-decoration:none;display:flex;flex-direction:column;min-width:0">
      <span class="label">${esc(o.customer_name)} · ${o.status === 'pending_deposit' ? `มัดจำ ${LB.baht(o.deposit_due)}` : `${esc(LB.L.handover[o.handover])} ${esc(LB.relDay(o.due_date))}${o.due_time ? ' ' + esc(o.due_time) : ''}`}</span>
      <span class="small muted">${esc(LB.itemsText(o.items))}</span></a>
    ${action || ''}</div>`;

  LB.views.home = async (root, params, query, alive) => {
    root.innerHTML = LB.loadingHtml;
    const d = await LB.api('dashboard');
    if (!alive()) return;
    const s = LB.state.settings;
    const vatPct = d.vatThreshold ? Math.min(100, (d.yearSales / d.vatThreshold) * 100) : 0;
    root.innerHTML = `
      <header class="topbar home">
        <img class="logo" src="icons/logo-512.png" alt="โลโก้ ${esc(s.shop_name)}">
        <div class="titles"><span class="display" style="font-size:18px;line-height:26px">${esc(s.shop_name)}</span>
        <span class="small muted">${esc(LB.dateTh(d.today, true))}</span></div>
      </header>
      <div class="page">
        <div class="grid2">
          <div class="tile"><span class="small muted">ยอดขายวันนี้</span><span class="num money">${LB.baht(d.salesToday)}</span></div>
          <div class="tile"><span class="small muted">ออเดอร์ที่เปิดอยู่</span><span class="num">${d.openOrders} ออเดอร์</span></div>
        </div>
        ${d.moneyInToday ? `<p class="small muted" style="margin:-8px 0 0">เงินเข้าวันนี้ ${LB.baht(d.moneyInToday)} (รวมมัดจำ)</p>` : ''}

        ${d.rounds.length ? d.rounds.map((r) => `<section class="card">
          <div class="row between top"><div class="stack tight" style="gap:0">
            <span class="small muted">${r.state === 'open' ? 'รอบที่เปิดรับ' : 'รอบผลิต'}</span>
            <h2>รอบผลิต ${esc(LB.dateTh(r.bake_date))}</h2></div>
            ${r.state === 'open' ? `<span class="badge ready">ปิดรับ ${esc(LB.dateTh(r.close_date))}</span>` : LB.roundBadge(r.state)}</div>
          ${LB.roundItemsHtml(r)}
          <div class="btn-row"><a class="btn" href="#/round/${esc(r.id)}">ดูรอบนี้</a>
          ${r.state === 'open' ? `<button type="button" class="btn" data-story="${esc(r.id)}">${LB.icon('share')}แชร์ประกาศ</button>` : `<a class="btn" href="#/production?round=${esc(r.id)}">${LB.icon('cake')}ไปหน้าผลิต</a>`}</div>
        </section>`).join('') : `<section class="card"><h2>ยังไม่มีรอบผลิตที่เปิดอยู่</h2>
          <p class="muted" style="margin:0">เปิดรอบใหม่เพื่อเริ่มรับ pre-order</p>
          <a class="btn primary" href="#/rounds/new">เปิดรอบผลิต</a></section>`}

        <section class="card">
          <h2>ต้องทำวันนี้</h2>
          ${d.todo.length ? d.todo.map((o, idx) => `${idx ? '<hr class="divider">' : ''}${LB.orderRowHtml(o,
            o.status === 'pending_deposit'
              ? `<button type="button" class="btn small primary" data-pay="${esc(o.id)}">ยืนยันรับเงิน</button>`
              : `<a class="btn small" href="#/order/${esc(o.id)}">ส่งมอบ</a>`)}`).join('')
            : '<p class="muted" style="margin:0">ไม่มีงานค้าง</p>'}
        </section>

        <section class="card">
          <div class="section-title"><h2>ของพร้อมขายในตู้</h2><a class="small" href="#/production">จัดการ</a></div>
          ${d.stock.length ? d.stock.map((x, idx) => {
            const warn = x.batches.some((b) => b.state !== 'ok');
            return `${idx ? '<hr class="divider">' : ''}<div class="stack tight">
              <div class="row between top"><span class="label grow">${esc(x.name)}</span>
              <span class="num nowrap" style="font-size:16px">ขายได้ ${Math.max(0, x.free)} ${esc(x.unit)}</span></div>
              <span class="small ${warn ? 'danger-text' : 'muted'}">ในตู้ ${x.physical}${x.committed ? ` · จองแล้ว ${x.committed}` : ''}${x.nearestExpiry ? ` · หมดอายุ ${esc(LB.dateTh(x.nearestExpiry))}` : ''}${x.expired ? ` · หมดอายุแล้ว ${x.expired}` : ''}</span></div>`;
          }).join('') : '<p class="muted" style="margin:0">ยังไม่มีของในตู้</p>'}
          ${d.stock.some((x) => x.free > 0) ? `<a class="btn" href="#/sale">${LB.icon('cart')}ขายหน้างาน</a>` : ''}
        </section>

        <section class="card tight">
          <div class="row between small"><span class="muted">ยอดขายปีนี้เทียบเกณฑ์ VAT</span>
          <span class="nowrap">${LB.money(d.yearSales)} / ${LB.money(d.vatThreshold)}</span></div>
          <div class="bar" role="img" aria-label="ยอดขายปีนี้ ${Math.round(vatPct)}% ของเกณฑ์ VAT"><span class="${vatPct >= 80 ? 'b' : 'a'}" style="width:${vatPct}%"></span></div>
          ${vatPct >= 80 ? '<span class="small danger-text">ใกล้ถึงเกณฑ์ต้องจด VAT (ยื่นภายใน 30 วันเมื่อรายรับเกินเกณฑ์)</span>' : ''}
        </section>
      </div>
      <a class="fab" href="#/orders/new">${LB.icon('plus')}ออเดอร์ใหม่</a>`;

    root.querySelectorAll('[data-story]').forEach((b) => {
      b.onclick = () => LB.openStory(d.rounds.find((r) => r.id === b.dataset.story));
    });
    root.querySelectorAll('[data-pay]').forEach((b) => {
      b.onclick = () => LB.confirmPayment(d.todo.find((x) => x.id === b.dataset.pay), { onDone: () => LB.reload() });
    });
  };
})();
