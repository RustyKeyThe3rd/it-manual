// Service Worker: เก็บไฟล์ทั้งหมดไว้ในเครื่องเพื่อใช้ออฟไลน์
// เปลี่ยนเลข VERSION เมื่อต้องการล้างแคชเก่าทิ้งทั้งหมด
var VERSION = 'v1';
var CACHE = 'kmc-' + VERSION;

var ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon192.png',
  'icon512.png',
  'contentnet.js',
  'contenthelpdesk.js',
  'contentbackup.js',
  'contentprocure.js',
  'contentsecurity.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('kmc-') === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// เปิดจากแคชก่อน (เร็วและใช้ออฟไลน์ได้) แล้วโหลดฉบับใหม่ทับไว้เบื้องหลังเมื่อมีเน็ต
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return null; });

        if (cached) {
          e.waitUntil(net);
          return cached;
        }
        return net.then(function (res) {
          if (res) return res;
          if (req.mode === 'navigate') return cache.match('index.html');
          return Response.error();
        });
      });
    })
  );
});

// ปุ่ม “ตรวจอัปเดตเนื้อหา” ในแอปจะส่งข้อความมาที่นี่
self.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'refresh') return;
  var src = e.source;
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return fetch(new Request(u, { cache: 'reload' })).then(function (r) {
          if (!r.ok) throw new Error(u);
          return c.put(u, r);
        });
      }));
    }).then(
      function () { if (src) src.postMessage({ type: 'refreshed' }); },
      function () { if (src) src.postMessage({ type: 'refresh-failed' }); }
    )
  );
});
