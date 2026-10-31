/* เชื่อมต่อ Supabase: ล็อกอิน ต่ออายุ token และเรียกคำสั่งในฐานข้อมูล */
(function () {
  'use strict';
  const LB = window.LB;
  const KEY_CFG = 'lb_sb';
  const KEY_SESSION = 'lb_session';

  /* ---------- การตั้งค่าการเชื่อมต่อ ---------- */

  LB.sbConfig = () => {
    const c = window.LB_CONFIG || {};
    let url = String(c.SUPABASE_URL || '').trim();
    let key = String(c.SUPABASE_KEY || '').trim();
    if (!url || !key) {
      try {
        const s = JSON.parse(LB.store.get(KEY_CFG) || '{}');
        url = url || s.url || '';
        key = key || s.key || '';
      } catch (e) { /* ค่าเสีย ถือว่ายังไม่ตั้ง */ }
    }
    return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
  };
  LB.setSbConfig = (url, key) => LB.store.set(KEY_CFG, JSON.stringify({ url, key }));
  LB.clearSbConfig = () => LB.store.del(KEY_CFG);

  /* ---------- session ---------- */

  let session;
  function loadSession() {
    if (session === undefined) {
      try { session = JSON.parse(LB.store.get(KEY_SESSION) || 'null'); } catch (e) { session = null; }
    }
    return session;
  }
  function saveSession(s) {
    session = s;
    if (s) LB.store.set(KEY_SESSION, JSON.stringify(s)); else LB.store.del(KEY_SESSION);
  }
  LB.session = () => loadSession();

  function authError(msg) {
    const e = new Error(msg || 'กรุณาเข้าสู่ระบบ');
    e.code = 'AUTH';
    return e;
  }

  async function request(path, init) {
    const cfg = LB.sbConfig();
    if (!cfg) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ');
    const headers = Object.assign({ apikey: cfg.key }, init.headers || {});
    let res;
    try {
      res = await fetch(cfg.url + path, Object.assign({}, init, { headers }));
    } catch (e) {
      throw new Error('เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่');
    }
    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch (e) { json = null; } }
    return { res, json };
  }

  async function tokenCall(grant, body) {
    const { res, json } = await request('/auth/v1/token?grant_type=' + grant, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok || !json || !json.access_token) {
      if (grant === 'password') {
        if (res.status === 400 || res.status === 401) throw authError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        if (res.status === 429) throw new Error('ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่');
        throw new Error((json && (json.msg || json.error_description || json.message)) || 'ล็อกอินไม่สำเร็จ (' + res.status + ')');
      }
      saveSession(null);
      throw authError('กรุณาเข้าสู่ระบบใหม่');
    }
    const prev = loadSession() || {};
    const s = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at || Math.floor(Date.now() / 1000) + (json.expires_in || 3600),
      email: (json.user && json.user.email) || body.email || prev.email || ''
    };
    saveSession(s);
    return s;
  }

  let refreshing = null;
  function refresh() {
    const s = loadSession();
    if (!s || !s.refresh_token) return Promise.reject(authError());
    if (!refreshing) {
      refreshing = tokenCall('refresh_token', { refresh_token: s.refresh_token }).finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function accessToken() {
    const s = loadSession();
    if (!s) throw authError();
    if (s.expires_at - 60 < Date.now() / 1000) return (await refresh()).access_token;
    return s.access_token;
  }

  LB.signIn = (email, password) => tokenCall('password', { email: String(email || '').trim(), password });

  LB.signOut = async () => {
    const s = loadSession();
    if (s) {
      try {
        await request('/auth/v1/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + s.access_token } });
      } catch (e) { /* ออฟไลน์ก็ล้างในเครื่องได้ */ }
    }
    saveSession(null);
  };

  /* ---------- คำสั่งในฐานข้อมูล ---------- */

  /** 'orders.cancelPreview' -> 'lb_orders_cancel_preview' */
  const rpcName = (action) => 'lb_' + action.replace(/\./g, '_').replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

  LB.rpc = async (action, data, retried) => {
    const token = await accessToken();
    const { res, json } = await request('/rest/v1/rpc/' + rpcName(action), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ d: data || {} })
    });
    if (res.ok) return json;
    if (res.status === 401 && !retried && json && /JWT|PGRST30/i.test(String(json.code) + ' ' + String(json.message))) {
      await refresh();
      return LB.rpc(action, data, true);
    }
    const err = new Error((json && json.message) || 'เกิดข้อผิดพลาด (' + res.status + ')');
    err.code = (json && json.hint) || '';
    err.status = res.status;
    if (res.status === 404) {
      err.code = 'INSTALL';
      err.message = 'ยังไม่ได้ติดตั้งฐานข้อมูล หรือเป็นเวอร์ชันเก่า (รัน schema.sql ใน Supabase)';
    } else if (res.status === 401 || res.status === 403) {
      err.code = err.code || 'AUTH';
    }
    throw err;
  };

  /** เรียกคำสั่งจากหน้าจอ: ถ้าถูกล็อกจะขอ PIN แล้วทำต่อให้เอง */
  LB.api = async (action, data) => {
    try {
      return await LB.rpc(action, data);
    } catch (e) {
      if (e.code === 'PIN' && LB.pinGate) {
        await LB.pinGate();
        return LB.rpc(action, data);
      }
      if ((e.code === 'AUTH' || e.code === 'NOSTAFF') && LB.state) {
        LB.state = null;
        setTimeout(() => LB.start(), 0);
      }
      throw e;
    }
  };
})();
