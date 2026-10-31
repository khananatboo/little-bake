/* ส่วนประกอบหน้าจอ: แจ้งเตือน แผ่นล่าง ยืนยัน ปุ่มเพิ่มลด */
(function () {
  'use strict';
  const LB = window.LB;
  const esc = LB.esc;

  let toastTimer = null;
  LB.toast = (msg, type) => {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, type === 'error' ? 5000 : 2600);
  };
  LB.error = (e) => LB.toast(e && e.message ? e.message : String(e), 'error');
  /** ซ่อนข้อความแจ้งเตือนเมื่อเปลี่ยนไปหน้าเข้าสู่ระบบหรือหน้าใส่ PIN */
  LB.clearToast = () => {
    clearTimeout(toastTimer);
    const el = document.getElementById('toast');
    if (el) el.hidden = true;
  };

  /** เปิดแผ่นล่าง คืนค่า { el, close } */
  LB.sheet = (title, bodyHtml, onMount) => {
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="ปิด">${LB.icon('close')}</button></div>
      <div class="sheet-body stack">${bodyHtml}</div></div>`;
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement;
    const close = () => {
      back.remove();
      if (!document.querySelector('.sheet-backdrop')) document.body.style.overflow = '';
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-close]')) close();
    });
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    const sheet = back.querySelector('.sheet');
    sheet.setAttribute('tabindex', '-1');
    sheet.focus();
    const api = { el: sheet.querySelector('.sheet-body'), close };
    if (onMount) onMount(api.el, close);
    return api;
  };

  LB.confirm = (title, message, okText, danger) => new Promise((resolve) => {
    let done = false;
    const s = LB.sheet(title, `<p style="margin:0">${esc(message)}</p>
      <div class="btn-row"><button type="button" class="btn" data-no>ไม่ใช่</button>
      <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okText || 'ตกลง')}</button></div>`, (el, close) => {
      el.querySelector('[data-no]').onclick = () => { done = true; close(); resolve(false); };
      el.querySelector('[data-yes]').onclick = () => { done = true; close(); resolve(true); };
    });
    const obs = new MutationObserver(() => {
      if (!document.body.contains(s.el)) { obs.disconnect(); if (!done) resolve(false); }
    });
    obs.observe(document.body, { childList: true });
  });

  /** ทำงานพร้อมแสดงสถานะกำลังบันทึก กันกดซ้ำ */
  LB.busy = async (fn) => {
    const ov = document.createElement('div');
    ov.className = 'busy-overlay';
    ov.innerHTML = '<div class="spinner" role="status" aria-label="กำลังบันทึก"></div>';
    document.body.appendChild(ov);
    try {
      return await fn();
    } finally {
      ov.remove();
    }
  };

  LB.loadingHtml = '<div class="loading"><div class="spinner" role="status" aria-label="กำลังโหลด"></div></div>';

  LB.stepper = (name, value, min, max, label) => `<div class="stepper" data-stepper>
    <button type="button" data-step="-1" aria-label="ลด${esc(label || '')}">−</button>
    <input type="text" inputmode="numeric" name="${esc(name)}" value="${esc(value)}" data-min="${min}" data-max="${max === undefined ? '' : max}" aria-label="จำนวน${esc(label || '')}">
    <button type="button" data-step="1" aria-label="เพิ่ม${esc(label || '')}">+</button></div>`;

  /** ผูกปุ่มเพิ่มลดทั้งหมดในพื้นที่ */
  LB.bindSteppers = (root, onChange) => {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const wrap = b.closest('[data-stepper]');
      const input = wrap.querySelector('input');
      const min = Number(input.dataset.min || 0);
      const max = input.dataset.max === '' ? Infinity : Number(input.dataset.max);
      let v = Math.round(Number(input.value) || 0) + Number(b.dataset.step);
      v = Math.max(min, Math.min(max, v));
      input.value = v;
      if (onChange) onChange(input);
    });
    root.addEventListener('input', (e) => {
      if (e.target.closest('[data-stepper]') && onChange) onChange(e.target);
    });
  };

  LB.copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      LB.toast('คัดลอกข้อความแล้ว');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); LB.toast('คัดลอกข้อความแล้ว'); } catch (e2) { LB.error('คัดลอกไม่ได้'); }
      ta.remove();
    }
  };

  /** ปุ่มแบบเลือกได้ 1 อัน (segmented / chips) */
  LB.bindChoice = (root, selector, onPick) => {
    root.querySelectorAll(selector).forEach((group) => {
      group.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-val]');
        if (!b || b.disabled) return;
        group.querySelectorAll('button[data-val]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (onPick) onPick(group.dataset.name, b.dataset.val);
      });
    });
  };
  LB.choiceVal = (root, name) => {
    const b = root.querySelector(`[data-name="${name}"] button[aria-pressed="true"]`);
    return b ? b.dataset.val : '';
  };
  LB.choiceHtml = (cls, name, options, value) => `<div class="${cls}" data-name="${esc(name)}" role="group">${
    options.map(([v, label]) => `<button type="button" data-val="${esc(v)}" aria-pressed="${v === value}">${esc(label)}</button>`).join('')}</div>`;
})();
