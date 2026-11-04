(function () {
  'use strict';

  var APP_VERSION = '1.0.0';
  var APP_TITLE = 'คู่มือนักคอมฯ';
  var MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var PILL = { verified: 'ตรวจแล้ว', pending: 'ร่างจากความรู้ทั่วไป รอตรวจ' };

  /* ================= helpers ================= */

  function load(key, def) {
    try {
      var v = localStorage.getItem('kmc:' + key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem('kmc:' + key, JSON.stringify(val)); } catch (e) {}
  }
  function drop(key) {
    try { localStorage.removeItem('kmc:' + key); } catch (e) {}
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return parent;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // **ตัวหนา** และ `โค้ด` ในข้อความ
  function rich(text) {
    var f = document.createDocumentFragment();
    String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach(function (p) {
      if (!p) return;
      if (p.length > 4 && p.slice(0, 2) === '**' && p.slice(-2) === '**') {
        f.appendChild(el('strong', null, p.slice(2, -2)));
      } else if (p.length > 2 && p.charAt(0) === '`' && p.charAt(p.length - 1) === '`') {
        f.appendChild(el('code', null, p.slice(1, -1)));
      } else {
        f.appendChild(document.createTextNode(p));
      }
    });
    return f;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function thDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    return (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + (+m[1] + 543);
  }

  // ตัดวรรณยุกต์/ทัณฑฆาตออกเพื่อให้ค้นหาเจอแม้สะกดต่างกัน (ปริ้นเตอร์/ปริ๊นเตอร์)
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[่-์]/g, '').replace(/\s+/g, ' ').trim();
  }
  // คำอังกฤษ/ตัวเลขให้ตรงที่ต้นคำ (กัน “tor” ไปเจอใน “restore”) ส่วนภาษาไทยหาแบบมีอยู่ตรงไหนก็ได้
  function has(text, w) {
    if (/^[a-z0-9.\-]+$/.test(w)) {
      return new RegExp('(^|[^a-z0-9])' + w.replace(/[.\-]/g, '\\$&')).test(text);
    }
    return text.indexOf(w) >= 0;
  }
  function flat(a) {
    var out = [];
    (a.blocks || []).forEach(function (b) {
      if (b.x) out.push(b.x);
      if (b.label) out.push(b.label);
      if (b.title) out.push(b.title);
      if (b.head) out.push(b.head.join(' '));
      (b.items || []).forEach(function (i) { out.push(typeof i === 'string' ? i : (i.g || '')); });
      (b.rows || []).forEach(function (r) { out.push(r.join(' ')); });
    });
    return out.join(' ');
  }

  /* ================= data ================= */

  var data = window.MANUAL || { cats: [] };
  var cats = data.cats.slice().sort(function (a, b) { return a.order - b.order; });
  var ARTS = {};
  var latest = '';

  cats.forEach(function (c) {
    (c.articles || []).forEach(function (a, i) {
      ARTS[a.id] = {
        cat: c, art: a, idx: i,
        s: { title: norm(a.title), tags: norm((a.tags || []).join(' ')), sum: norm(a.summary), body: norm(flat(a)) }
      };
      if (a.updated && a.updated > latest) latest = a.updated;
    });
  });

  function catById(id) {
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i];
    return null;
  }

  /* ================= state ================= */

  var app = document.getElementById('app');
  var barTitle = document.getElementById('barTitle');
  var btnBack = document.getElementById('btnBack');
  var toastEl = document.getElementById('toast');

  var favs = load('favs', []);
  var lastQuery = '';
  var scrollPos = {};
  var curKey = '';
  var offline = 'checking';
  var installEvt = null;

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  function copyText(t) {
    function ok() { toast('คัดลอกแล้ว'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); }
      catch (e) { toast('คัดลอกไม่ได้ ให้กดค้างที่ข้อความแล้วเลือกคัดลอก'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(ok, fallback);
    } else {
      fallback();
    }
  }

  /* ================= theme / font ================= */

  var THEMES = ['auto', 'light', 'dark'];
  var THEME_LABEL = { auto: 'สีตามระบบ', light: 'โหมดสว่าง', dark: 'โหมดมืด' };
  var FS_LABEL = ['ตัวอักษรปกติ', 'ตัวอักษรใหญ่', 'ตัวอักษรใหญ่มาก'];

  function applyTheme(t) {
    var r = document.documentElement;
    if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t);
    else r.removeAttribute('data-theme');
  }
  function applyFont(n) {
    var r = document.documentElement;
    if (n > 0) r.setAttribute('data-fs', String(n));
    else r.removeAttribute('data-fs');
  }
  applyTheme(load('theme', 'auto'));
  applyFont(load('fs', 0));

  document.getElementById('btnTheme').addEventListener('click', function () {
    var t = THEMES[(THEMES.indexOf(load('theme', 'auto')) + 1) % THEMES.length];
    save('theme', t);
    applyTheme(t);
    toast(THEME_LABEL[t]);
  });
  document.getElementById('btnFont').addEventListener('click', function () {
    var n = (load('fs', 0) + 1) % 3;
    save('fs', n);
    applyFont(n);
    toast(FS_LABEL[n]);
  });
  btnBack.addEventListener('click', function () {
    var h = btnBack.getAttribute('data-href');
    location.hash = h || '#/';
  });

  /* ================= reference badge ================= */

  function refState(a) {
    if (!a.ref) return null;
    var ov = load('ref:' + a.id, null);
    return {
      status: ov ? ov.status : (a.ref.status || 'pending'),
      checked: ov ? ov.checked : (a.ref.checked || null),
      local: !!ov
    };
  }
  function pill(status) {
    return el('span', 'pill ' + (status === 'verified' ? 'ok' : 'pend'), PILL[status] || PILL.pending);
  }

  function refBox(a) {
    var r = a.ref;
    var box = el('section', 'ref');
    function draw() {
      clear(box);
      var st = refState(a);
      box.appendChild(el('span', 'ref-l', 'อ้างอิง'));
      var ul = el('ul', 'ref-docs');
      (r.docs || []).forEach(function (d) {
        var li = el('li');
        add(li, el('span', 'ref-n', d.name), ' · ',
          el('span', d.edition ? 'ref-e' : 'ref-e miss', d.edition ? d.edition : 'ฉบับ/ปี: รอระบุ'));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      var line = el('div', 'ref-s');
      add(line, 'ตรวจเมื่อ ', el('strong', null, st.checked ? thDate(st.checked) : 'ยังไม่ได้ตรวจ'), ' · ', pill(st.status));
      box.appendChild(line);
      if (r.note && st.status !== 'verified') box.appendChild(el('div', 'ref-note', r.note));

      if (st.status !== 'verified' || st.local) {
        var btn = el('button', 'btn small ghost',
          st.status === 'verified' ? 'ยกเลิกเครื่องหมาย “ตรวจแล้ว”' : 'ทำเครื่องหมายว่าตรวจแล้ว (วันนี้)');
        btn.type = 'button';
        btn.addEventListener('click', function () {
          if (st.status === 'verified') {
            drop('ref:' + a.id);
            toast('ยกเลิกแล้ว กลับเป็นสถานะเดิม');
          } else {
            if (!confirm('ยืนยันว่าได้ตรวจเนื้อหาบทความนี้กับเอกสารอ้างอิงจริงแล้ว?')) return;
            save('ref:' + a.id, { status: 'verified', checked: today() });
            toast('บันทึกแล้ว (เก็บในเครื่องนี้เท่านั้น)');
          }
          draw();
        });
        box.appendChild(btn);
        if (st.status !== 'verified') {
          box.appendChild(el('div', 'ref-note', 'เครื่องหมายนี้เก็บในเครื่องนี้เท่านั้น ถ้าต้องการให้ถาวรให้แก้ที่ไฟล์เนื้อหา (status และ checked)'));
        }
      }
    }
    draw();
    return box;
  }

  /* ================= article blocks ================= */

  function callout(kind, label, text) {
    var n = el('div', 'callout' + (kind ? ' ' + kind : ''));
    n.appendChild(el('strong', null, label));
    n.appendChild(rich(text));
    return n;
  }

  function listBlock(tag) {
    return function (b) {
      var n = el(tag);
      b.items.forEach(function (i) { var li = el('li'); li.appendChild(rich(i)); n.appendChild(li); });
      return n;
    };
  }

  function blkCmd(b) {
    var box = el('div', 'cmd');
    var h = el('div', 'cmd-h');
    h.appendChild(el('span', null, b.label || 'คำสั่ง'));
    var btn = el('button', 'btn small', 'คัดลอก');
    btn.type = 'button';
    btn.addEventListener('click', function () { copyText(b.x); });
    h.appendChild(btn);
    box.appendChild(h);
    box.appendChild(el('pre', null, b.x));
    return box;
  }

  function blkTable(b) {
    var wrap = el('div', 'tbl-wrap');
    var t = el('table');
    var thead = el('thead'), trh = el('tr');
    b.head.forEach(function (h) { trh.appendChild(el('th', null, h)); });
    thead.appendChild(trh);
    t.appendChild(thead);
    var tb = el('tbody');
    b.rows.forEach(function (r) {
      var tr = el('tr');
      r.forEach(function (c) { var td = el('td'); td.appendChild(rich(c)); tr.appendChild(td); });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }

  function blkCheck(b) {
    var box = el('div', 'check');
    if (b.title) box.appendChild(el('h4', null, b.title));
    var boxes = [];
    b.items.forEach(function (it) {
      if (typeof it === 'object' && it.g) { box.appendChild(el('div', 'grp', it.g)); return; }
      var lab = el('label', 'chk');
      var cb = el('input');
      cb.type = 'checkbox';
      boxes.push(cb);
      var sp = el('span');
      sp.appendChild(rich(it));
      add(lab, cb, sp);
      box.appendChild(lab);
    });
    var bar = el('div', 'row');
    var cnt = el('span', 'muted small');
    function upd() {
      var n = boxes.filter(function (c) { return c.checked; }).length;
      cnt.textContent = 'ติ๊กแล้ว ' + n + ' / ' + boxes.length;
    }
    boxes.forEach(function (c) { c.addEventListener('change', upd); });
    var rs = el('button', 'btn small ghost', 'ล้างเครื่องหมาย');
    rs.type = 'button';
    rs.addEventListener('click', function () { boxes.forEach(function (c) { c.checked = false; }); upd(); });
    add(bar, cnt, rs);
    box.appendChild(bar);
    upd();
    return box;
  }

  // ตารางกรอกเอง เก็บในเครื่อง
  function blkFill(b) {
    var key = 'fill:' + b.key;
    var rows = load(key, null);
    if (!rows) rows = b.rows.map(function (r) { return r.slice(); });
    var box = el('div', 'fill');
    function draw() {
      clear(box);
      rows.forEach(function (r, ri) {
        var card = el('div', 'fillrow');
        b.head.forEach(function (h, ci) {
          var lab = el('label', 'fl');
          lab.appendChild(el('span', null, h));
          var inp = el('input');
          inp.type = (b.types && b.types[ci]) || 'text';
          inp.value = r[ci] || '';
          inp.addEventListener('input', function () { r[ci] = inp.value; save(key, rows); });
          lab.appendChild(inp);
          card.appendChild(lab);
        });
        var del = el('button', 'btn small ghost', 'ลบแถวนี้');
        del.type = 'button';
        del.addEventListener('click', function () {
          if (!confirm('ลบแถวนี้?')) return;
          rows.splice(ri, 1);
          save(key, rows);
          draw();
        });
        card.appendChild(del);
        box.appendChild(card);
      });
      var bar = el('div', 'row');
      var addBtn = el('button', 'btn small', '+ เพิ่มแถว');
      addBtn.type = 'button';
      addBtn.addEventListener('click', function () {
        rows.push(b.head.map(function () { return ''; }));
        save(key, rows);
        draw();
      });
      var rst = el('button', 'btn small ghost', 'ล้างทั้งหมดกลับเป็นค่าเริ่มต้น');
      rst.type = 'button';
      rst.addEventListener('click', function () {
        if (!confirm('ล้างข้อมูลที่กรอกไว้ทั้งหมดในตารางนี้?')) return;
        drop(key);
        rows = b.rows.map(function (r) { return r.slice(); });
        draw();
      });
      add(bar, addBtn, rst);
      box.appendChild(bar);
      box.appendChild(el('p', 'muted small', 'ข้อมูลที่กรอกเก็บไว้ในเครื่องนี้เท่านั้น (ไม่ถูกส่งไปที่ใด)'));
    }
    draw();
    return box;
  }

  var BLK = {
    p: function (b) { var n = el('p'); n.appendChild(rich(b.x)); return n; },
    h: function (b) { var n = el('h3'); n.appendChild(rich(b.x)); return n; },
    ul: listBlock('ul'),
    ol: listBlock('ol'),
    note: function (b) { return callout('', 'หมายเหตุ', b.x); },
    warn: function (b) { return callout('warn', 'ข้อควรระวัง', b.x); },
    symptom: function (b) { return callout('sym', 'อาการ', b.x); },
    cmd: blkCmd,
    table: blkTable,
    check: blkCheck,
    fill: blkFill
  };

  /* ================= views ================= */

  function itemLink(a, showCat) {
    var rec = ARTS[a.id];
    var link = el('a', 'item');
    link.href = '#/a/' + encodeURIComponent(a.id);
    link.appendChild(el('div', 'item-t', a.title));
    if (a.summary) link.appendChild(el('div', 'item-s', a.summary));
    var meta = el('div', 'item-m');
    if (showCat) meta.appendChild(el('span', 'chip', rec.cat.icon + ' ' + rec.cat.title));
    var st = refState(a);
    if (st) meta.appendChild(pill(st.status));
    if (meta.firstChild) link.appendChild(meta);
    return link;
  }

  function renderOffline(n) {
    var m = {
      checking: 'กำลังตรวจสอบการใช้งานออฟไลน์…',
      ready: '✓ พร้อมใช้งานออฟไลน์',
      unsupported: 'ยังไม่รองรับโหมดออฟไลน์ (ต้องเปิดผ่านลิงก์ https)'
    };
    n.textContent = m[offline] || '';
    n.className = 'offline ' + offline;
  }
  function setOffline(s) {
    offline = s;
    var n = document.getElementById('offlineState');
    if (n) renderOffline(n);
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }

  function refreshContent() {
    if (!('serviceWorker' in navigator)) { toast('เบราว์เซอร์นี้ไม่รองรับ'); return; }
    if (navigator.onLine === false) { toast('ตอนนี้ออฟไลน์อยู่ จึงอัปเดตไม่ได้'); return; }
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg || !reg.active) { toast('ยังไม่พร้อม ลองใหม่อีกครั้งหลังเปิดแอปสักครู่'); return; }
      function onMsg(e) {
        if (!e.data) return;
        if (e.data.type === 'refreshed') {
          navigator.serviceWorker.removeEventListener('message', onMsg);
          toast('อัปเดตแล้ว กำลังโหลดใหม่…');
          setTimeout(function () { location.reload(); }, 700);
        } else if (e.data.type === 'refresh-failed') {
          navigator.serviceWorker.removeEventListener('message', onMsg);
          toast('อัปเดตไม่สำเร็จ ลองใหม่เมื่อสัญญาณดีขึ้น');
        }
      }
      navigator.serviceWorker.addEventListener('message', onMsg);
      toast('กำลังตรวจอัปเดต…');
      reg.update().catch(function () {});
      reg.active.postMessage({ type: 'refresh' });
    });
  }

  function footer() {
    var f = el('footer', 'foot');
    f.appendChild(el('div', null,
      'เวอร์ชันแอป ' + APP_VERSION + (latest ? ' · เนื้อหาอัปเดตล่าสุด ' + thDate(latest) : '')));
    var off = el('div');
    off.id = 'offlineState';
    renderOffline(off);
    f.appendChild(off);
    var row = el('div', 'row');
    var upd = el('button', 'btn small ghost', 'ตรวจอัปเดตเนื้อหา');
    upd.type = 'button';
    upd.addEventListener('click', refreshContent);
    var ins = el('button', 'btn small', 'ติดตั้งแอป');
    ins.type = 'button';
    ins.id = 'btnInstall';
    ins.hidden = !installEvt;
    ins.addEventListener('click', function () {
      if (!installEvt) return;
      installEvt.prompt();
      installEvt = null;
      ins.hidden = true;
    });
    add(row, upd, ins);
    f.appendChild(row);
    if (!isStandalone()) {
      f.appendChild(el('div', 'small',
        'ติดตั้งลงหน้าจอ: Android (Chrome) เมนู ⋮ → ติดตั้งแอป · iPhone (Safari) ปุ่มแชร์ → เพิ่มลงในหน้าจอโฮม'));
    }
    return f;
  }

  function viewHome() {
    var box = el('div');
    var hero = el('section', 'hero');
    add(hero, el('h1', null, APP_TITLE),
      el('p', 'muted', 'วิธีแก้ปัญหา เช็กลิสต์ และแม่แบบเอกสาร ใช้ได้แม้ไม่มีอินเทอร์เน็ต'));
    var inp = el('input', 'search');
    inp.type = 'search';
    inp.placeholder = 'ค้นหา เช่น ปริ้นเตอร์, TOR, backup';
    inp.value = lastQuery;
    inp.autocomplete = 'off';
    inp.setAttribute('enterkeyhint', 'search');
    inp.setAttribute('aria-label', 'ค้นหาในคู่มือ');
    hero.appendChild(inp);

    var results = el('div', 'results');
    var body = el('div', 'homebody');

    // รายการโปรด
    var favArts = favs.filter(function (id) { return ARTS[id]; });
    if (favArts.length) {
      body.appendChild(el('div', 'sec-t', '★ รายการโปรด'));
      favArts.forEach(function (id) { body.appendChild(itemLink(ARTS[id].art, true)); });
    }

    // หมวด
    body.appendChild(el('div', 'sec-t', 'หมวดหมู่'));
    var grid = el('div', 'cats');
    cats.forEach(function (c) {
      var a = el('a', 'cat');
      a.href = '#/cat/' + encodeURIComponent(c.id);
      var n = (c.articles || []).length;
      var b = el('div', 'cat-b');
      add(b, el('div', 'cat-t', c.title), el('div', 'cat-d', c.desc || ''),
        el('div', 'cat-n', n ? n + ' บทความ' : 'เร็ว ๆ นี้'));
      add(a, el('div', 'cat-i', c.icon || '📁'), b);
      grid.appendChild(a);
    });
    body.appendChild(grid);
    body.appendChild(footer());

    function runSearch() {
      lastQuery = inp.value;
      var q = norm(inp.value);
      clear(results);
      if (!q) { results.hidden = true; body.hidden = false; return; }
      body.hidden = true;
      results.hidden = false;
      var words = q.split(' ').filter(Boolean);
      var hits = [];
      Object.keys(ARTS).forEach(function (id) {
        var s = ARTS[id].s, score = 0, ok = true;
        words.forEach(function (w) {
          var sc = 0;
          if (has(s.title, w)) sc += 10;
          if (has(s.tags, w)) sc += 6;
          if (has(s.sum, w)) sc += 4;
          if (has(s.body, w)) sc += 1;
          if (!sc) ok = false;
          score += sc;
        });
        if (ok) hits.push({ a: ARTS[id].art, score: score });
      });
      hits.sort(function (x, y) { return y.score - x.score; });
      results.appendChild(el('div', 'sec-t', hits.length ? 'พบ ' + hits.length + ' รายการ' : 'ไม่พบรายการที่ตรงกับคำค้น'));
      hits.forEach(function (h) { results.appendChild(itemLink(h.a, true)); });
      if (!hits.length) {
        results.appendChild(el('p', 'muted', 'ลองใช้คำสั้น ๆ หรือคำภาษาอังกฤษ เช่น printer, backup, TOR'));
      }
    }
    inp.addEventListener('input', runSearch);

    add(box, hero, results, body);
    runSearch();
    return box;
  }

  function viewCat(c) {
    var box = el('div');
    add(box, el('h1', null, (c.icon || '') + ' ' + c.title), el('p', 'muted', c.desc || ''));
    var arts = c.articles || [];
    if (!arts.length) {
      box.appendChild(el('div', 'card empty', 'กำลังจัดทำ เนื้อหาหมวดนี้จะเพิ่มในรอบถัดไป'));
      return box;
    }
    arts.forEach(function (a) { box.appendChild(itemLink(a, false)); });
    return box;
  }

  function viewArt(rec) {
    var a = rec.art;
    var box = el('article', 'art');
    var crumb = el('a', 'crumb', (rec.cat.icon || '') + ' ' + rec.cat.title);
    crumb.href = '#/cat/' + encodeURIComponent(rec.cat.id);
    box.appendChild(crumb);
    box.appendChild(el('h1', null, a.title));

    var meta = el('div', 'meta');
    if (a.updated) meta.appendChild(el('span', 'muted small', 'แก้ไขล่าสุด ' + thDate(a.updated)));
    var star = el('button', 'btn small ghost');
    star.type = 'button';
    function drawStar() {
      var on = favs.indexOf(a.id) >= 0;
      star.textContent = on ? '★ อยู่ในรายการโปรด' : '☆ เพิ่มในรายการโปรด';
      star.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    star.addEventListener('click', function () {
      var i = favs.indexOf(a.id);
      if (i >= 0) favs.splice(i, 1); else favs.push(a.id);
      save('favs', favs);
      drawStar();
    });
    drawStar();
    meta.appendChild(star);
    box.appendChild(meta);

    if (a.ref) box.appendChild(refBox(a));

    (a.blocks || []).forEach(function (b) {
      var f = BLK[b.t];
      if (f) box.appendChild(f(b));
    });

    var arts = rec.cat.articles;
    var pn = el('div', 'pn');
    if (rec.idx > 0) {
      var p = el('a'); p.href = '#/a/' + encodeURIComponent(arts[rec.idx - 1].id);
      add(p, el('small', null, '← บทความก่อนหน้า'), arts[rec.idx - 1].title);
      pn.appendChild(p);
    }
    if (rec.idx < arts.length - 1) {
      var n = el('a'); n.href = '#/a/' + encodeURIComponent(arts[rec.idx + 1].id);
      add(n, el('small', null, 'บทความถัดไป →'), arts[rec.idx + 1].title);
      pn.appendChild(n);
    }
    if (pn.firstChild) box.appendChild(pn);
    return box;
  }

  function viewMissing() {
    var box = el('div');
    add(box, el('h1', null, 'ไม่พบหน้านี้'));
    var a = el('a', null, 'กลับหน้าแรก');
    a.href = '#/';
    box.appendChild(a);
    return box;
  }

  /* ================= router ================= */

  function parseHash() {
    var p = (location.hash || '#/').replace(/^#/, '').split('/');
    var id = '';
    try { id = p[2] ? decodeURIComponent(p[2]) : ''; } catch (e) { id = ''; }
    if (p[1] === 'cat' && id) return { v: 'cat', id: id };
    if (p[1] === 'a' && id) return { v: 'art', id: id };
    return { v: 'home' };
  }

  function route() {
    if (curKey) scrollPos[curKey] = window.scrollY;
    var r = parseHash();
    var node, title = APP_TITLE, back = '';
    if (r.v === 'cat' && catById(r.id)) {
      var c = catById(r.id);
      node = viewCat(c);
      title = c.title;
      back = '#/';
    } else if (r.v === 'art' && ARTS[r.id]) {
      node = viewArt(ARTS[r.id]);
      title = ARTS[r.id].cat.title;
      back = '#/cat/' + encodeURIComponent(ARTS[r.id].cat.id);
    } else if (r.v === 'home') {
      node = viewHome();
    } else {
      node = viewMissing();
      back = '#/';
    }
    curKey = location.hash || '#/';
    clear(app);
    app.appendChild(node);
    barTitle.textContent = title;
    btnBack.hidden = !back;
    btnBack.setAttribute('data-href', back);
    document.title = r.v === 'home' ? APP_TITLE : title + ' · ' + APP_TITLE;
    window.scrollTo(0, scrollPos[curKey] || 0);
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvt = e;
    var b = document.getElementById('btnInstall');
    if (b) b.hidden = false;
  });

  /* ================= offline (service worker) ================= */

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () { setOffline('unsupported'); });
    navigator.serviceWorker.ready.then(function () { setOffline('ready'); });
  } else {
    setOffline('unsupported');
  }

  route();
})();
