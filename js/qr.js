/*
 * ตัวสร้าง QR Code ขนาดเล็ก (โหมดไบต์ ระดับแก้ไขข้อผิดพลาด M เวอร์ชัน 1–10)
 * พอสำหรับ PromptPay ไม่ต้องโหลดไลบรารีจากภายนอก
 * อัลกอริทึมตามมาตรฐาน ISO/IEC 18004 (ลำดับขั้นแบบเดียวกับ Nayuki QR Code generator)
 */
(function () {
  'use strict';
  const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  const FORMAT_BITS_M = 0;

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver];
  }
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    const r = new Array(degree).fill(0);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = gfMul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
    }
    return r;
  }
  function utf8(text) {
    return Array.from(new TextEncoder().encode(text));
  }

  function encode(text) {
    const bytes = utf8(text);
    let ver = 0;
    for (let v = 1; v <= 10; v++) {
      const cc = v < 10 ? 8 : 16;
      if (4 + cc + bytes.length * 8 <= dataCodewords(v) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('ข้อความยาวเกินสำหรับ QR');
    const capBits = dataCodewords(ver) * 8;
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0x4, 4);
    push(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach((b) => push(b, 8));
    push(0, Math.min(4, capBits - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }

    // แบ่งบล็อกและเติม ECC
    const numBlocks = BLOCKS_M[ver];
    const eccLen = ECC_PER_BLOCK_M[ver];
    const rawCw = Math.floor(rawModules(ver) / 8);
    const numShort = numBlocks - (rawCw % numBlocks);
    const shortLen = Math.floor(rawCw / numBlocks);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => {
        if (i !== shortLen - eccLen || j >= numShort) all.push(b[i]);
      });
    }

    // วาดโมดูล
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
      const pos = [6];
      for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
      pos.forEach((y, i) => pos.forEach((x, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          setF(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }));
    }
    const formatBits = (mask) => {
      const d = (FORMAT_BITS_M << 3) | mask;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      const bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
      setF(8, size - 8, true);
    };
    formatBits(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((b >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3), c = Math.floor(i / 3);
        setF(a, c, dark); setF(c, a, dark);
      }
    }
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - v : v;
        if (!fn[y][x] && i < all.length * 8) {
          mod[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }

    const maskFns = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
      (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
    ];
    const applyMask = (m) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (!fn[y][x] && maskFns[m](x, y)) mod[y][x] = !mod[y][x];
      }
    };
    const penalty = () => {
      let score = 0;
      const addHist = (len, h) => { if (h[0] === 0) len += size; h.pop(); h.unshift(len); };
      const count = (h) => {
        const n = h[1];
        const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
        return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
      };
      const finish = (color, len, h) => { if (color) { addHist(len, h); len = 0; } len += size; addHist(len, h); return count(h); };
      for (let pass = 0; pass < 2; pass++) {
        for (let a = 0; a < size; a++) {
          let color = false, run = 0;
          const h = [0, 0, 0, 0, 0, 0, 0];
          for (let b = 0; b < size; b++) {
            const c = pass === 0 ? mod[a][b] : mod[b][a];
            if (c === color) {
              run++;
              if (run === 5) score += 3; else if (run > 5) score++;
            } else {
              addHist(run, h);
              if (!color) score += count(h) * 40;
              color = c;
              run = 1;
            }
          }
          score += finish(color, run, h) * 40;
        }
      }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
      }
      let dark = 0;
      mod.forEach((row) => row.forEach((c) => { if (c) dark++; }));
      const total = size * size;
      score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return score;
    };
    let best = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m);
      formatBits(m);
      const s = penalty();
      if (s < bestScore) { best = m; bestScore = s; }
      applyMask(m);
    }
    applyMask(best);
    formatBits(best);
    return { size, isDark: (y, x) => mod[y][x] };
  }

  /** วาด QR ลงบน canvas context ที่ตำแหน่งและขนาดที่กำหนด (รวมขอบขาว 4 โมดูล) */
  function draw(ctx, text, x, y, px, dark, light) {
    const q = encode(text);
    const border = 4;
    const n = q.size + border * 2;
    const cell = px / n;
    ctx.fillStyle = light || '#ffffff';
    ctx.fillRect(x, y, px, px);
    ctx.fillStyle = dark || '#000000';
    for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) {
      if (q.isDark(r, c)) {
        ctx.fillRect(Math.floor(x + (c + border) * cell), Math.floor(y + (r + border) * cell),
          Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.LBQR = { encode, draw };
})();
