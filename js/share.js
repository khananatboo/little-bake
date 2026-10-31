/* ข้อความถึงลูกค้า ภาพประกาศรอบ (Story) และภาพ QR PromptPay */
(function () {
  'use strict';
  const LB = window.LB;
  const C = {
    surface: '#fbf8ef', raised: '#ffffff', ink: '#33211a', muted: '#6f5b4c', line: '#e8dfce',
    caramel: '#ad560c', orange: '#f89813', cheesecake: '#edd285', blueberry: '#38215b'
  };
  const DISPLAY = 'Mitr, "Noto Sans Thai Looped", sans-serif';
  const BODY = '"Noto Sans Thai Looped", "Noto Sans Thai", sans-serif';

  function settings() { return (LB.state && LB.state.settings) || {}; }
  function particle() { return settings().polite_particle || 'ครับ'; }

  /* ---------- ข้อความ ---------- */

  LB.msgRound = (round) => {
    const s = settings();
    const lines = [`${s.shop_name || 'Little Bake'} เปิดรอบผลิต ${LB.dateTh(round.bake_date)}`];
    round.items.forEach((i) => {
      const left = i.max_qty - i.ordered;
      const tail = left <= 0 ? 'เต็มแล้ว' : (i.ordered > 0 ? `เหลือ ${left} ${i.unit}` : `รับ ${i.max_qty} ${i.unit}`);
      lines.push(`• ${i.name} ${LB.money(i.price)} บาท (${tail})`);
    });
    lines.push(`ปิดรับ ${LB.dateTh(round.close_date)} หรือจนกว่าจะเต็ม`);
    lines.push(`มัดจำ ${s.deposit_percent || 50}% · รับเอง / ร้านไปส่ง / เรียกรถส่ง (ค่าส่งตามจริง)`);
    const where = [s.page_facebook ? `เพจ ${s.page_facebook}` : 'เพจ Facebook', s.page_ig ? `IG ${s.page_ig}` : 'IG'];
    lines.push(`สั่งทาง inbox ${where.join(' หรือ ')} หรือทักเจ้าของร้านได้โดยตรง${particle()}`);
    return lines.join('\n');
  };

  LB.msgOrder = (o) => {
    const s = settings();
    const p = particle();
    const lines = [`ยืนยันออเดอร์ ${o.id} ${p}`, o.customer_name, ''];
    o.items.forEach((i) => lines.push(`• ${i.product_name} ×${i.qty} = ${LB.money(i.qty * i.price)} บาท`));
    lines.push(`ค่าขนม ${LB.money(o.subtotal)} บาท`);
    if (LB.n(o.discount) > 0) lines.push(`ส่วนลด ${LB.money(o.discount)} บาท`);
    if (LB.n(o.shipping_fee) > 0) lines.push(`ค่าส่ง ${LB.money(o.shipping_fee)} บาท`);
    else if (o.handover !== 'pickup') lines.push('ค่าส่งตามจริง');
    if (o.kind === 'deposit') {
      lines.push(`มัดจำ ${s.deposit_percent || 50}% = ${LB.money(o.deposit_due)} บาท ${o.depositPaid ? '(ได้รับแล้ว)' : '(รอโอน)'}`);
    }
    if (o.paid > 0 && o.kind !== 'deposit') lines.push(`ชำระแล้ว ${LB.money(o.paid)} บาท`);
    lines.push(o.balance > 0 ? `ชำระวันรับ ${LB.money(o.balance)} บาท` : 'ชำระครบแล้ว');
    lines.push(`${LB.L.handover[o.handover]} ${LB.dateTh(o.due_date)}${o.due_time ? ' ' + o.due_time + ' น.' : ''}`);
    if (o.kind !== 'ready') {
      lines.push('');
      lines.push(`ยกเลิกก่อนวันรับ ${s.refund_days || 7} วันขึ้นไปคืนเงินเต็มจำนวน หากน้อยกว่านั้นขอสงวนสิทธิ์ไม่คืนเงิน${p}`);
    }
    lines.push(`ขอบคุณที่สั่งขนม ${s.shop_name || 'Little Bake'} ${p}`);
    return lines.join('\n');
  };

  /* ---------- วาดภาพ ---------- */

  async function fontsReady() {
    if (!document.fonts || !document.fonts.load) return;
    const wait = Promise.all([
      document.fonts.load(`600 120px Mitr`), document.fonts.load(`500 48px Mitr`),
      document.fonts.load(`400 34px "Noto Sans Thai Looped"`)
    ]).catch(() => null);
    await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))]);
  }
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }
  /** ตัวอักษรที่ย่อลงจนพอดีความกว้าง */
  function fitFont(ctx, text, maxW, size, weight, family, minRatio) {
    let s = size;
    const min = size * (minRatio || 0.6);
    do {
      ctx.font = `${weight} ${s}px ${family}`;
      if (ctx.measureText(text).width <= maxW) return s;
      s -= 2;
    } while (s > min);
    ctx.font = `${weight} ${min}px ${family}`;
    return min;
  }
  function circle(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** ภาพประกาศรอบขนาด Story 1080×1920 */
  LB.drawStory = async (round) => {
    await fontsReady();
    const s = settings();
    const W = 1080, H = 1920;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, H);
    // ลวดลายบลูเบอร์รี่
    circle(ctx, W - 124, 148, 28, C.blueberry); circle(ctx, W - 196, 124, 28, C.blueberry);
    circle(ctx, W - 164, 196, 28, C.blueberry); circle(ctx, W - 80, 216, 20, C.orange);
    circle(ctx, 100, H - 172, 28, C.blueberry); circle(ctx, 168, H - 208, 28, C.blueberry);
    circle(ctx, 132, H - 124, 20, C.orange);

    const logo = await loadImage('icons/logo-512.png');
    let y = 150;
    if (logo) {
      ctx.save();
      ctx.beginPath(); ctx.arc(W / 2, y + 120, 120, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logo, W / 2 - 120, y, 240, 240);
      ctx.restore();
    }
    y += 240 + 110;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.caramel;
    fitFont(ctx, 'เปิดรอบผลิต', W - 192, 120, 600, DISPLAY);
    ctx.fillText('เปิดรอบผลิต', W / 2, y);
    y += 72;
    ctx.fillStyle = C.ink;
    const sub = `อบสด ${LB.dateTh(round.bake_date)} · รับจำนวนจำกัด`;
    fitFont(ctx, sub, W - 192, 48, 500, DISPLAY);
    ctx.fillText(sub, W / 2, y);
    y += 56;

    const items = round.items.slice(0, 5);
    const cardH = items.length > 3 ? 150 : 176;
    const gap = 22;
    items.forEach((i) => {
      roundRect(ctx, 96, y, W - 192, cardH, 40, C.raised, C.line);
      const left = i.max_qty - i.ordered;
      const tail = left <= 0 ? 'เต็มแล้ว' : (i.ordered > 0 ? `เหลือ ${left} ${i.unit}` : `รับ ${i.max_qty} ${i.unit}`);
      ctx.textAlign = 'right';
      ctx.fillStyle = C.caramel;
      ctx.font = `600 60px ${DISPLAY}`;
      const price = `${LB.money(i.price)} บาท`;
      const priceW = ctx.measureText(price).width;
      ctx.fillText(price, W - 136, y + cardH / 2 + 22);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.ink;
      fitFont(ctx, i.name, W - 192 - 80 - priceW - 40, 50, 500, DISPLAY, 0.55);
      ctx.fillText(i.name, 136, y + cardH / 2 - 6);
      ctx.fillStyle = left <= 0 ? '#b42318' : C.muted;
      ctx.font = `400 34px ${BODY}`;
      ctx.fillText(tail, 136, y + cardH / 2 + 46);
      y += cardH + gap;
    });
    if (round.items.length > 5) {
      ctx.textAlign = 'center';
      ctx.fillStyle = C.muted;
      ctx.font = `400 32px ${BODY}`;
      ctx.fillText(`และอีก ${round.items.length - 5} เมนู`, W / 2, y + 20);
      y += 50;
    }
    y += 12;
    const shelf = Array.from(new Set(round.items.map((i) => (LB.state.products.find((p) => p.id === i.product_id) || {}).shelf_days)));
    const panelLines = [`มัดจำ ${s.deposit_percent || 50}% · รับเอง / ร้านไปส่ง / เรียกรถส่ง`,
      'ค่าส่งตามจริง' + (shelf.length === 1 && shelf[0] ? ` · แช่เย็นเก็บได้ ${shelf[0]} วัน` : '')];
    const panelH = 230;
    roundRect(ctx, 96, y, W - 192, panelH, 44, C.blueberry);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.cheesecake;
    ctx.font = `600 56px ${DISPLAY}`;
    ctx.fillText(`ปิดรับ ${LB.dateTh(round.close_date)}`, W / 2, y + 84);
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, panelLines[0], W - 260, 34, 400, BODY);
    ctx.fillText(panelLines[0], W / 2, y + 144);
    fitFont(ctx, panelLines[1], W - 260, 30, 400, BODY);
    ctx.fillText(panelLines[1], W / 2, y + 194);
    y += panelH + 72;

    ctx.fillStyle = C.ink;
    const how = 'สั่งทาง inbox เพจ Facebook หรือ IG';
    fitFont(ctx, how, W - 192, 44, 500, DISPLAY);
    ctx.fillText(how, W / 2, y);
    const names = [s.page_facebook, s.page_ig ? (String(s.page_ig).startsWith('@') ? s.page_ig : '@' + s.page_ig) : ''].filter(Boolean).join(' · ');
    if (names) {
      y += 56;
      ctx.fillStyle = C.muted;
      fitFont(ctx, names, W - 192, 34, 400, BODY);
      ctx.fillText(names, W / 2, y);
    }
    y += 56;
    ctx.fillStyle = C.ink;
    fitFont(ctx, 'หรือสั่งกับเจ้าของร้านได้โดยตรง', W - 192, 34, 400, BODY);
    ctx.fillText('หรือสั่งกับเจ้าของร้านได้โดยตรง', W / 2, y);
    return cv;
  };

  /** ภาพ QR PromptPay พร้อมยอดเงิน 720×980 */
  LB.drawPayQr = async (order, amount) => {
    await fontsReady();
    const s = settings();
    const payload = window.LBPromptPay.payload(s.promptpay_id, amount);
    const W = 720, H = 980;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, H);
    roundRect(ctx, 32, 32, W - 64, H - 64, 40, C.raised, C.line);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.caramel;
    ctx.font = `600 44px ${DISPLAY}`;
    ctx.fillText(s.shop_name || 'Little Bake', W / 2, 112);
    ctx.fillStyle = C.ink;
    ctx.font = `500 30px ${DISPLAY}`;
    ctx.fillText('สแกนจ่ายด้วย PromptPay', W / 2, 162);
    window.LBQR.draw(ctx, payload, (W - 500) / 2, 196, 500, '#000000', '#ffffff');
    ctx.fillStyle = C.caramel;
    ctx.font = `600 60px ${DISPLAY}`;
    ctx.fillText(`${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`, W / 2, 772);
    ctx.fillStyle = C.muted;
    const who = [order.id, order.customer_name].filter(Boolean).join(' · ');
    fitFont(ctx, who, W - 140, 28, 400, BODY);
    ctx.fillText(who, W / 2, 828);
    ctx.font = `400 24px ${BODY}`;
    ctx.fillText(`PromptPay ${window.LBPromptPay.maskId(s.promptpay_id)}`, W / 2, 874);
    return cv;
  };

  /** แชร์รูปผ่านแอปในเครื่อง หรือดาวน์โหลดถ้าแชร์ไม่ได้ */
  LB.shareCanvas = async (canvas, filename, title) => {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: title || filename });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    LB.toast('บันทึกรูปแล้ว');
  };

  /** แผ่นล่างแสดงภาพประกาศรอบ */
  LB.openStory = async (round) => {
    const s = LB.sheet('ภาพประกาศรอบ', LB.loadingHtml);
    let cv;
    try {
      cv = await LB.drawStory(round);
    } catch (e) {
      s.close();
      LB.error(e);
      return;
    }
    s.el.innerHTML = `<img class="preview-img" alt="ภาพประกาศรอบผลิต ${LB.esc(LB.dateTh(round.bake_date))}" src="${cv.toDataURL('image/png')}">
      <div class="btn-row"><button type="button" class="btn" data-copy>${LB.icon('copy')}คัดลอกข้อความ</button>
      <button type="button" class="btn primary" data-share>${LB.icon('share')}แชร์รูป</button></div>
      <p class="hint" style="margin:0">แชร์ไปที่ Facebook หรือ IG Story แล้ววางข้อความประกาศในโพสต์ได้เลย</p>`;
    s.el.querySelector('[data-copy]').onclick = () => LB.copyText(LB.msgRound(round));
    s.el.querySelector('[data-share]').onclick = () => LB.shareCanvas(cv, `little-bake-${round.bake_date}.png`, 'ประกาศรอบผลิต');
  };

  /** แผ่นล่าง QR รับเงิน (ส่ง onPaid มาด้วย จะมีปุ่มให้ผู้ขายยืนยันว่าได้รับเงินแล้ว) */
  LB.openPayQr = (order, amount, title, onPaid) => {
    const s = settings();
    if (!String(s.promptpay_id || '').replace(/\D/g, '')) {
      LB.sheet('ยังไม่ได้ตั้ง PromptPay', `<p style="margin:0">ใส่ PromptPay ID (เบอร์โทรหรือเลข 13 หลัก) ในหน้าตั้งค่าร้านก่อน</p>
        <a class="btn primary" href="#/settings" data-close>ไปหน้าตั้งค่าร้าน</a>`);
      return;
    }
    const sh = LB.sheet(title || 'QR รับเงิน', `<div class="field"><label for="qr-amt">ยอดเงิน (บาท)</label>
      <input id="qr-amt" class="input" type="text" inputmode="decimal" value="${LB.esc(amount)}"></div>
      <div class="qr-box" data-qr>${LB.loadingHtml}</div>
      <div class="btn-row"><button type="button" class="btn" data-copy>${LB.icon('copy')}คัดลอกข้อความ</button>
      <button type="button" class="btn ${onPaid ? '' : 'primary'}" data-share>${LB.icon('share')}แชร์รูป QR</button></div>
      ${onPaid ? `<hr class="divider"><p class="hint" style="margin:0">ลูกค้าโอนแล้ว ตรวจเงินเข้าในแอปธนาคาร แล้วกดยืนยัน</p>
      <button type="button" class="btn primary" data-paid>ยืนยันได้รับเงินแล้ว</button>` : ''}`);
    const paidBtn = sh.el.querySelector('[data-paid]');
    if (paidBtn) {
      paidBtn.onclick = () => {
        const amt = sh.el.querySelector('#qr-amt').value;
        sh.close();
        LB.confirmPayment(order, { amount: LB.n(amt), method: 'promptpay', onDone: onPaid });
      };
    }
    let cv = null;
    const render = async () => {
      const amt = Number(sh.el.querySelector('#qr-amt').value);
      const box = sh.el.querySelector('[data-qr]');
      if (!(amt > 0)) { box.innerHTML = '<p class="hint">ใส่ยอดเงินมากกว่า 0</p>'; cv = null; return; }
      cv = await LB.drawPayQr(order, amt);
      box.innerHTML = `<img alt="QR PromptPay ยอด ${LB.esc(LB.money(amt))} บาท" src="${cv.toDataURL('image/png')}">`;
    };
    render().catch(LB.error);
    let t = null;
    sh.el.querySelector('#qr-amt').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => render().catch(LB.error), 350); });
    sh.el.querySelector('[data-share]').onclick = () => { if (cv) LB.shareCanvas(cv, `qr-${order.id}.png`, 'QR PromptPay'); };
    sh.el.querySelector('[data-copy]').onclick = () => LB.copyText(LB.msgOrder(order));
  };
})();
