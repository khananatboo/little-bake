/* เครื่องมือพื้นฐาน: ป้องกัน HTML, รูปแบบวันที่/เงิน, ป้ายภาษาไทย, ไอคอน */
(function () {
  'use strict';
  const LB = (window.LB = window.LB || {});
  LB.views = LB.views || {};

  LB.esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  LB.n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  LB.money = (v) => LB.n(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  LB.baht = (v) => LB.money(v) + ' บาท';

  const WD = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const MO = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const MO_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  LB.MO_FULL = MO_FULL;

  function parts(s) {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }
  LB.isDate = (s) => /^\d{4}-\d{2}-\d{2}/.test(String(s || ''));
  /** "อ. 27 ต.ค." */
  LB.dateTh = (s, withYear) => {
    if (!LB.isDate(s)) return '';
    const p = parts(s);
    return `${WD[p.wd]} ${p.d} ${MO[p.m - 1]}` + (withYear ? ` ${p.y + 543}` : '');
  };
  LB.dateShort = (s) => { if (!LB.isDate(s)) return ''; const p = parts(s); return `${p.d} ${MO[p.m - 1]}`; };
  LB.dateTimeTh = (s) => {
    if (!LB.isDate(s)) return '';
    const t = String(s).slice(11, 16);
    return LB.dateShort(s) + (t ? ' ' + t : '');
  };
  LB.today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  LB.addDays = (s, n) => {
    const p = parts(s);
    return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10);
  };
  LB.diffDays = (a, b) => {
    const pa = parts(a), pb = parts(b);
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 864e5);
  };
  LB.relDay = (s) => {
    if (!LB.isDate(s)) return '';
    const d = LB.diffDays(LB.today(), s);
    if (d === 0) return 'วันนี้';
    if (d === 1) return 'พรุ่งนี้';
    if (d === -1) return 'เมื่อวาน';
    return LB.dateTh(s);
  };

  LB.L = {
    kind: { deposit: 'มัดจำ', no_deposit: 'ไม่มัดจำ', ready: 'ของพร้อมขาย', walkin: 'ขายหน้าร้าน' },
    channel: { facebook: 'Facebook', ig: 'IG', direct: 'สั่งตรง', walkin: 'หน้าร้าน' },
    handover: { pickup: 'รับเอง', shop_delivery: 'ร้านไปส่ง', courier: 'เรียกรถส่ง' },
    status: { pending_deposit: 'รอมัดจำ', confirmed: 'ยืนยันแล้ว', ready: 'พร้อมส่ง', delivered: 'ส่งมอบแล้ว', cancelled: 'ยกเลิก' },
    method: { promptpay: 'PromptPay', transfer: 'โอนเข้าบัญชี', cash: 'เงินสด' },
    payType: { deposit: 'มัดจำ', balance: 'ส่วนที่เหลือ', full: 'ชำระเต็ม', refund: 'คืนเงิน' },
    roundState: { open: 'เปิดรับ', closed: 'ปิดรับแล้ว', baked: 'ผลิตแล้ว', done: 'เสร็จสิ้น', cancelled: 'ยกเลิก' }
  };
  LB.ACTIVE = ['pending_deposit', 'confirmed', 'ready'];

  LB.badge = (status, text) => `<span class="badge ${LB.esc(status)}">${LB.esc(text || LB.L.status[status] || status)}</span>`;
  LB.roundBadge = (state) => `<span class="badge ${LB.esc(state)}">${LB.esc(LB.L.roundState[state] || state)}</span>`;

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M21 14v7h-4"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>',
    map: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'
  };
  LB.icon = (name, cls) => `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  LB.store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* โหมดส่วนตัว */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* โหมดส่วนตัว */ } }
  };

  LB.qs = (hash) => {
    const i = hash.indexOf('?');
    const out = {};
    if (i < 0) return out;
    new URLSearchParams(hash.slice(i + 1)).forEach((v, k) => { out[k] = v; });
    return out;
  };

  /** สรุปรายการขนม เช่น "Nutella Cheesecake ×2 · Brownie ×1" */
  LB.itemsText = (items) => (items || []).map((i) => `${i.product_name} ×${i.qty}`).join(' · ');
})();
