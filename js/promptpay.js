/* สร้างข้อความ PromptPay QR (มาตรฐาน EMVCo ของ ธปท.) */
(function () {
  'use strict';
  function field(tag, value) {
    return tag + String(value.length).padStart(2, '0') + value;
  }
  function crc16(s) {
    let crc = 0xffff;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  /** id: เบอร์โทร 10 หลัก, เลขบัตร/เลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก */
  function payload(id, amount) {
    const digits = String(id || '').replace(/\D/g, '');
    if (!digits) throw new Error('ยังไม่ได้ตั้ง PromptPay ID');
    let account;
    if (digits.length >= 15) account = field('03', digits);
    else if (digits.length >= 13) account = field('02', digits);
    else account = field('01', ('0000000000000' + digits.replace(/^0/, '66')).slice(-13));
    const amt = Number(amount);
    let p = field('00', '01') + field('01', amt > 0 ? '12' : '11') +
      field('29', field('00', 'A000000677010111') + account) +
      field('58', 'TH') + field('53', '764');
    if (amt > 0) p += field('54', amt.toFixed(2));
    p += '6304';
    return p + crc16(p);
  }
  function maskId(id) {
    const d = String(id || '').replace(/\D/g, '');
    if (d.length <= 4) return d;
    return 'x'.repeat(d.length - 4) + d.slice(-4);
  }
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.LBPromptPay = { payload, crc16, maskId };
})();
