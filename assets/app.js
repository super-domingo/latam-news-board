/* 중남미 뉴스 현황판 */
(function () {
  'use strict';

  // 대상 20개국: ISO2 → { iso3, 한국어명, 표시 좌표, 카드 방향 }
  // side: 'w'는 카드를 지점 왼쪽(태평양 쪽), 'e'는 오른쪽(대서양 쪽)에 먼저 놓아 본다
  // pin: 카드를 늘 그 자리(지도 왼쪽 위 기준 x, y)에 고정한다
  var COUNTRIES = {
    MX: { iso3: 'MEX', ko: '멕시코', at: [23.6, -102.5], side: 'w', pin: [10, 10] },
    GT: { iso3: 'GTM', ko: '과테말라', at: [15.4, -91.6], side: 'w' },
    BZ: { iso3: 'BLZ', ko: '벨리즈', at: [18.6, -87.2], side: 'e' },
    HN: { iso3: 'HND', ko: '온두라스', at: [16.4, -84.6], side: 'e' },
    SV: { iso3: 'SLV', ko: '엘살바도르', at: [12.4, -90.2], side: 'w' },
    NI: { iso3: 'NIC', ko: '니카라과', at: [13.2, -83.0], side: 'e' },
    CR: { iso3: 'CRI', ko: '코스타리카', at: [9.2, -85.9], side: 'w' },
    PA: { iso3: 'PAN', ko: '파나마', at: [9.6, -79.0], side: 'e' },
    CO: { iso3: 'COL', ko: '콜롬비아', at: [4.0, -73.0], side: 'w' },
    VE: { iso3: 'VEN', ko: '베네수엘라', at: [7.0, -66.0], side: 'e' },
    GY: { iso3: 'GUY', ko: '가이아나', at: [5.0, -58.9], side: 'e' },
    SR: { iso3: 'SUR', ko: '수리남', at: [4.1, -55.9], side: 'e' },
    EC: { iso3: 'ECU', ko: '에콰도르', at: [-1.5, -78.4], side: 'w' },
    PE: { iso3: 'PER', ko: '페루', at: [-9.5, -75.0], side: 'w' },
    BR: { iso3: 'BRA', ko: '브라질', at: [-10.5, -52.0], side: 'e' },
    BO: { iso3: 'BOL', ko: '볼리비아', at: [-16.5, -64.7], side: 'w' },
    PY: { iso3: 'PRY', ko: '파라과이', at: [-23.3, -58.2], side: 'e' },
    CL: { iso3: 'CHL', ko: '칠레', at: [-33.0, -70.8], side: 'w' },
    AR: { iso3: 'ARG', ko: '아르헨티나', at: [-35.0, -64.5], side: 'w' },
    UY: { iso3: 'URY', ko: '우루과이', at: [-32.8, -56.0], side: 'e' }
  };
  var ISO3_TO_2 = {};
  Object.keys(COUNTRIES).forEach(function (k) { ISO3_TO_2[COUNTRIES[k].iso3] = k; });

  var IMP_RANK = { high: 3, medium: 2, low: 1 };
  var IMP_KO = { high: '즉시 확인', medium: '주의', low: '참고' };
  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  var ROTATE_MS = 20700;          // 카드 한 장이 머무는 시간
  var CARDS_WIDE = 5;             // 넓은 화면에 동시에 띄우는 카드 수
  var CARDS_NARROW = 2;
  var MAX_OVERLAP = 0.1;          // 카드끼리 겹쳐도 되는 최대 면적 비율
  var MAX_DIST = 130;             // 나라 위치에서 카드까지 최대 거리(px)
  var RELOAD_MS = 30 * 60 * 1000; // 데이터 다시 읽는 주기
  var SUN_MS = 60 * 1000;         // 낮·밤 경계 다시 그리는 주기

  var state = { news: [], py: null, cat: 'all', geo: null };
  var map, geoLayer, badgeLayer, nightCanvas, sunMarker;

  // ---------- 공통 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return (+p[1]) + '.' + (+p[2]) + ' (' + WEEKDAY[d.getUTCDay()] + ')';
  }
  function fmtKst(isoTs) {
    if (!isoTs) return '-';
    var d = new Date(isoTs);
    if (isNaN(d)) return isoTs;
    var k = new Date(d.getTime() + 9 * 3600 * 1000);
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return k.getUTCFullYear() + '-' + z(k.getUTCMonth() + 1) + '-' + z(k.getUTCDate()) +
      ' ' + z(k.getUTCHours()) + ':' + z(k.getUTCMinutes()) + ' KST';
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : '#'; }
  function byDateDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (IMP_RANK[b.importance] || 0) - (IMP_RANK[a.importance] || 0);
  }
  function filtered() {
    return state.news.filter(function (n) {
      return COUNTRIES[n.country] && (state.cat === 'all' || n.category === state.cat);
    });
  }
  function maxImp(items) {
    var best = null;
    items.forEach(function (n) {
      if (!best || (IMP_RANK[n.importance] || 0) > (IMP_RANK[best] || 0)) best = n.importance;
    });
    return best;
  }
  // withSummary: 국가 상세 서랍에서만 요약을 보여준다
  function newsItemHtml(n, withSummary) {
    var imp = IMP_RANK[n.importance] ? n.importance : 'low';
    return '<li class="news-item ' + imp + '">' +
      '<div class="row1"><span>' + esc(fmtDate(n.date)) + '</span>' +
      '<span><span class="cat">' + esc(n.category || n.agency || '') + '</span> ' + esc(IMP_KO[imp]) + '</span></div>' +
      '<div class="title">' + esc(n.title_ko) + '</div>' +
      (withSummary && n.summary_ko ? '<div class="summary">' + esc(n.summary_ko) + '</div>' : '') +
      '<div class="src"><a href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener">' +
      esc(n.source || n.agency || '원문') + ' 원문 보기 ↗</a></div></li>';
  }

  // ---------- 지도 ----------
  function initMap() {
    map = L.map('map', {
      zoomControl: false, attributionControl: false, zoomSnap: 0.25,
      minZoom: 2, maxZoom: 7
    });
    // 확대·축소 단추는 카드와 부딪치지 않게 오른쪽 아래에 둔다
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.createPane('night').style.zIndex = 450;   // 나라 경계(400) 위, 배지(600) 아래
    map.getPane('night').style.pointerEvents = 'none';
    fitView();
    window.addEventListener('resize', function () { fitView(); drawNight(); placeAll(); });
    map.on('move zoom', function () { drawNight(); placeAll(); });
  }
  // 주소 뒤에 ?zoom=1.5 처럼 붙이면 그 배율만큼 더 확대한다
  var ZOOM_BOOST = parseFloat(new URLSearchParams(location.search).get('zoom')) || 1;
  function fitView() {
    // 20개국 배지가 모두 들어오는 범위로 꽉 채운다(미국·아르헨티나 남부 제외)
    map.fitBounds([[26, -104], [-37.5, -50]], { padding: [0, 0] });
    if (ZOOM_BOOST !== 1) map.setZoom(map.getZoom() + Math.log(ZOOM_BOOST) / Math.LN2, { animate: false });
  }
  function countryStyle(feature) {
    var c2 = ISO3_TO_2[feature.id];
    if (!c2) return { color: '#b9c6d6', weight: 0.6, fillColor: '#eef1f5', fillOpacity: 1 };
    var imp = maxImp(filtered().filter(function (n) { return n.country === c2; }));
    var fill = '#ffffff';
    if (imp === 'high') fill = '#fbe3e3';
    else if (imp === 'medium') fill = '#fdf0dc';
    var isPy = c2 === 'PY';
    return {
      color: isPy ? '#14a06a' : '#7f97b5',
      weight: isPy ? 2.6 : 0.9,
      fillColor: fill,
      fillOpacity: 1
    };
  }
  function drawCountries() {
    if (geoLayer) geoLayer.remove();
    geoLayer = L.geoJSON(state.geo, {
      style: countryStyle,
      onEachFeature: function (f, layer) {
        var c2 = ISO3_TO_2[f.id];
        if (!c2) return;
        layer.on('click', function () { c2 === 'PY' ? focusPy() : openDrawer(c2); });
        layer.on('mouseover', function () { layer.setStyle({ fillOpacity: 0.8 }); });
        layer.on('mouseout', function () { layer.setStyle({ fillOpacity: 1 }); });
      }
    }).addTo(map);
  }
  function drawBadges() {
    if (badgeLayer) badgeLayer.remove();
    badgeLayer = L.layerGroup().addTo(map);
    var items = filtered();
    Object.keys(COUNTRIES).forEach(function (c2) {
      var c = COUNTRIES[c2];
      var mine = items.filter(function (n) { return n.country === c2; });
      var imp = maxImp(mine) || 'low';
      var html = '<div style="display:flex;flex-direction:column;align-items:center;gap:2px">' +
        '<div class="count-badge ' + imp + '">' + mine.length + '</div>' +
        '<div class="country-label">' + esc(c.ko) + '</div></div>';
      var m = L.marker(c.at, {
        icon: L.divIcon({ className: '', html: html, iconSize: [70, 40], iconAnchor: [35, 11] }),
        keyboard: false
      }).addTo(badgeLayer);
      m.on('click', function () { c2 === 'PY' ? focusPy() : openDrawer(c2); });
    });
  }
  function drawStats() {
    var items = filtered();
    var high = items.filter(function (n) { return n.importance === 'high'; }).length;
    var med = items.filter(function (n) { return n.importance === 'medium'; }).length;
    document.getElementById('mapStats').innerHTML =
      '<div><span class="muted">7일 뉴스</span><b>' + items.length + '</b></div>' +
      '<div><span class="muted">즉시 확인</span><b style="color:var(--high)">' + high + '</b></div>' +
      '<div><span class="muted">주의</span><b style="color:var(--medium)">' + med + '</b></div>';
  }

  // ---------- 낮·밤 (실시간 해 위치) ----------
  var RAD = Math.PI / 180;
  // 태양 적위와 태양 바로 아래 지점의 경도 (천문 연감 근사식, 오차 1° 이내)
  function sunPosition(date) {
    var d = date.getTime() / 86400000 - 10957.5;           // J2000.0 기준 일수
    var g = (357.529 + 0.98560028 * d) * RAD;
    var q = 280.459 + 0.98564736 * d;
    var lam = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    var eps = (23.439 - 0.00000036 * d) * RAD;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / RAD;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam)) / RAD;
    var gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    var lon = ((ra - gmst * 15) % 360 + 540) % 360 - 180;
    return { dec: dec, lon: lon };
  }
  // 해가 떠 있는 곳은 그대로(밝게), 진 곳은 어둡게 덮는다. 박명(고도 0~-12°)은 점점 어둡게
  function drawNight() {
    if (!map) return;
    var size = map.getSize();
    if (!nightCanvas) {
      nightCanvas = L.DomUtil.create('canvas', 'night-canvas', map.getPane('night'));
    }
    var step = 4;
    var w = Math.ceil(size.x / step), h = Math.ceil(size.y / step);
    nightCanvas.width = w;
    nightCanvas.height = h;
    nightCanvas.style.width = size.x + 'px';
    nightCanvas.style.height = size.y + 'px';
    L.DomUtil.setPosition(nightCanvas, map.containerPointToLayerPoint([0, 0]));

    var sun = sunPosition(new Date());
    var sinDec = Math.sin(sun.dec * RAD), cosDec = Math.cos(sun.dec * RAD);
    var lons = new Float32Array(w), lats = new Float32Array(h);
    for (var x = 0; x < w; x++) lons[x] = map.containerPointToLatLng([x * step, 0]).lng;
    for (var y = 0; y < h; y++) lats[y] = map.containerPointToLatLng([0, y * step]).lat;

    var ctx = nightCanvas.getContext('2d');
    var img = ctx.createImageData(w, h);
    var px = img.data;
    var NIGHT = 0.67;   // 밤: 검은색을 최대 67%까지 덮는다
    var DAY = 0.23;     // 낮: 해가 높을수록 따뜻한 햇빛색을 최대 23%까지 더한다
    for (y = 0; y < h; y++) {
      var la = lats[y] * RAD, a = Math.sin(la) * sinDec, b = Math.cos(la) * cosDec;
      for (x = 0; x < w; x++) {
        var el = Math.asin(a + b * Math.cos((lons[x] - sun.lon) * RAD)) / RAD;
        var i = (y * w + x) * 4;
        if (el > 0) {
          px[i] = 255; px[i + 1] = 226; px[i + 2] = 140;
          px[i + 3] = Math.round(Math.min(el / 50, 1) * DAY * 255);
        } else {
          var t = el <= -12 ? 1 : -el / 12;
          px[i] = 6; px[i + 1] = 8; px[i + 2] = 12;
          px[i + 3] = Math.round(t * NIGHT * 255);
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    var at = [sun.dec, sun.lon];
    if (!sunMarker) {
      sunMarker = L.marker(at, {
        icon: L.divIcon({ className: 'sun-icon', html: '<span>☀</span>', iconSize: [40, 40], iconAnchor: [20, 20] }),
        interactive: false, keyboard: false
      }).addTo(map);
    } else {
      sunMarker.setLatLng(at);
    }
  }

  // ---------- 순환 카드 ----------
  // 카드 여러 장을 시차를 두고 하나씩 바꾼다. 같은 나라 카드가 동시에 두 장 뜨지 않게 한다
  var slots = [];
  // 메르코수르 회원국(정회원; 회원 자격이 정지된 베네수엘라는 제외) 기사를
  // 비회원국 기사보다 2배 자주 보여준다 (메르코수르 2 : 비회원 1)
  var MERCOSUR = { AR: 1, BR: 1, PY: 1, UY: 1, BO: 1 };
  var MERCOSUR_RATIO = 2;
  var queues = { M: [], N: [] }, qpos = { M: 0, N: 0 }, shownCount = { M: 0, N: 0 };
  function groupOf(n) { return MERCOSUR[n.country] ? 'M' : 'N'; }
  var paused = false;

  function buildQueue(group) {
    var items = filtered().filter(function (n) { return groupOf(n) === group; });
    // 중요한 기사부터(빨강 → 주황 → 회색, 같은 등급은 최신순) 나라별 최대 4건
    // (메르코수르는 나라 수가 적어 나라별 최대 8건)
    var cap = group === 'M' ? 8 : 4;
    items.sort(function (a, b) {
      return (IMP_RANK[b.importance] || 0) - (IMP_RANK[a.importance] || 0) || byDateDesc(a, b);
    });
    var perCountry = {}, q = [];
    items.forEach(function (n) {
      perCountry[n.country] = (perCountry[n.country] || 0) + 1;
      if (perCountry[n.country] <= cap) q.push(n);
    });
    // 같은 나라가 연달아 나오지 않게 하되 중요도 순서는 최대한 지킨다
    var out = [], pool = q.slice();
    while (pool.length) {
      var idx = 0;
      if (out.length) {
        var last = out[out.length - 1].country;
        for (var i = 0; i < pool.length; i++) { if (pool[i].country !== last) { idx = i; break; } }
      }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }
  function pickFrom(group, shown) {
    var q = queues[group];
    if (qpos[group] >= q.length) { q = queues[group] = buildQueue(group); qpos[group] = 0; }
    for (var k = 0; k < q.length; k++) {
      var j = (qpos[group] + k) % q.length, n = q[j];
      if (!shown[n.country]) {
        // 고른 항목을 현재 위치로 당겨 와 순서를 유지한다
        q.splice(j, 1);
        q.splice(qpos[group], 0, n);
        qpos[group]++;
        return n;
      }
    }
    return null;
  }
  function nextItem(slot) {
    var shown = {};
    slots.forEach(function (s) { if (s !== slot && s.cur) shown[s.cur.country] = true; });
    var view = map.getBounds();   // 화면 밖으로 잘린 나라는 건너뛴다
    Object.keys(COUNTRIES).forEach(function (c2) { if (!view.contains(COUNTRIES[c2].at)) shown[c2] = true; });
    // 지금까지 띄운 수를 보고 2:1 비율에 모자란 쪽에서 먼저 고른다
    var want = shownCount.M < MERCOSUR_RATIO * (shownCount.N + 1) ? 'M' : 'N';
    return pickFrom(want, shown) || pickFrom(want === 'M' ? 'N' : 'M', shown);
  }
  function makeSlot(delay) {
    var area = document.querySelector('.map-area');
    var el = document.createElement('div');
    el.className = 'news-card hidden';
    var ring = document.createElement('div');
    ring.className = 'focus-ring hidden';
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'leader hidden');
    document.getElementById('leaders').appendChild(line);
    area.appendChild(ring);
    area.appendChild(el);
    var slot = { el: el, ring: ring, line: line, cur: null, rect: null };
    el.addEventListener('mouseenter', function () { paused = true; });
    el.addEventListener('mouseleave', function () { paused = false; });
    el.addEventListener('click', function (e) {
      if (e.target.closest('a') || !slot.cur) return;
      slot.cur.country === 'PY' ? focusPy() : openDrawer(slot.cur.country);
    });
    setTimeout(function () {
      advance(slot);
      setInterval(function () { advance(slot); }, ROTATE_MS);
    }, delay);
    return slot;
  }
  function setVisible(slot, on) {
    [slot.el, slot.ring, slot.line].forEach(function (x) { x.classList.toggle('hidden', !on); });
  }
  function advance(slot) {
    if (paused || document.getElementById('drawer').classList.contains('open')) return;
    var n = nextItem(slot);
    if (!n) { slot.cur = null; slot.rect = null; setVisible(slot, false); return; }
    slot.el.classList.add('leaving');
    setTimeout(function () {
      // 다른 카드와 10% 이상 겹치거나 나라에서 너무 멀면 다음 기사로 바꿔
      // 최대 8번 다시 놓아 본다. 끝내 자리가 없으면 이번 차례는 비워 둔다
      var ok = false;
      for (var tries = 0; tries < 8; tries++) {
        slot.cur = n;
        renderCard(slot, n);
        if (fits(placeCard(slot))) { ok = true; break; }
        var alt = nextItem(slot);
        if (!alt) break;
        n = alt;
      }
      if (!ok) { slot.cur = null; slot.rect = null; setVisible(slot, false); return; }
      shownCount[groupOf(n)]++;
      slot.el.classList.remove('leaving');
      setVisible(slot, true);
    }, 350);
  }
  function renderCard(slot, n) {
    var imp = IMP_RANK[n.importance] ? n.importance : 'low';
    slot.el.className = 'news-card ' + imp;
    // 고정 자리 카드(멕시코)는 나라 배지를 가리지 않게 폭을 줄인다
    slot.el.style.width = COUNTRIES[n.country].pin ? '270px' : '';
    slot.el.innerHTML = '<div class="pop-anim">' +
      '<div class="pop-head"><span class="pop-country">' + esc(COUNTRIES[n.country].ko) + '</span>' +
      '<span class="pop-date">' + esc(fmtDate(n.date)) + '</span></div>' +
      '<div class="pop-title">' + esc(n.title_ko) + '</div>' +
      '<div class="pop-foot"><span class="cat">' + esc(n.category) + '</span>' +
      '<a href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener">' + esc(n.source || '원문') + ' ↗</a></div></div>';
  }
  function overlapArea(a, b) {
    var x = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    var y = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    return x > 0 && y > 0 ? x * y : 0;
  }
  function pad(r, m) { return { l: r.l - m, r: r.r + m, t: r.t - m, b: r.b + m }; }
  // 점 p에서 사각형 r까지의 거리(안에 있으면 0)와 가장 가까운 테두리 점
  function nearest(p, r) {
    var x = Math.min(Math.max(p.x, r.l), r.r), y = Math.min(Math.max(p.y, r.t), r.b);
    return { x: x, y: y, d: Math.sqrt((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)) };
  }
  // 나라 둘레(좌우·위아래)의 후보 자리를 훑어 점수가 가장 낮은 곳을 고른다.
  // 점수 = 다른 카드와 겹침(가장 무겁게) + 확대 단추·통계 상자 + 자기 나라 배지
  //      + 다른 나라 배지(가볍게) + 나라에서 떨어진 거리
  // 반환값: { overlap: 다른 카드와 겹친 면적 비율, dist: 나라에서 카드까지 거리(px) }
  function placeCard(slot) {
    if (!slot.cur) return { overlap: 0, dist: 0 };
    var c2 = slot.cur.country, c = COUNTRIES[c2];
    var p = map.latLngToContainerPoint(c.at);
    var area = document.querySelector('.map-area');
    var W = area.clientWidth, H = area.clientHeight;
    var w = slot.el.offsetWidth, h = slot.el.offsetHeight;
    var cards = slots.filter(function (s) { return s !== slot && s.rect && s.cur; })
      .map(function (s) { return pad(s.rect, 8); });
    var fixed = [
      { l: 0, r: 230, t: H - 80, b: H },   // 왼쪽 아래 통계 상자
      { l: W - 54, r: W, t: H - 92, b: H } // 확대·축소 단추
    ];
    var own = null, badges = [];
    Object.keys(COUNTRIES).forEach(function (k2) {
      var b = map.latLngToContainerPoint(COUNTRIES[k2].at);
      var r = { l: b.x - 32, r: b.x + 32, t: b.y - 12, b: b.y + 28 };
      if (k2 === c2) own = r; else badges.push(r);
    });
    var cands = [];
    function add(l, t) {
      l = Math.min(Math.max(l, 8), W - w - 8);
      t = Math.min(Math.max(t, 8), H - h - 8);
      cands.push({ l: l, r: l + w, t: t, b: t + h });
    }
    if (c.pin) {
      add(c.pin[0], c.pin[1]);   // 멕시코는 지도 왼쪽 위 모서리에 고정
    } else {
      [36, 70, 110, 160, 220].forEach(function (gap) {
        for (var dy = -h; dy <= h; dy += 18) {           // 좌우
          add(p.x + gap, p.y - h / 2 + dy);
          add(p.x - gap - w, p.y - h / 2 + dy);
        }
        for (var dx = -w * 0.8; dx <= w * 0.8; dx += w / 8) {  // 위아래
          add(p.x - w / 2 + dx, p.y + gap);
          add(p.x - w / 2 + dx, p.y - gap - h);
        }
      });
    }
    var best = null, bestScore = Infinity, bestCard = 0, bestDist = 0;
    cands.forEach(function (r) {
      var cardA = 0, score = 0;
      cards.forEach(function (o) { cardA += overlapArea(r, o); });
      fixed.forEach(function (o) { score += overlapArea(r, o) * 500; });   // 단추·통계 상자는 절대 가리지 않게
      score += overlapArea(r, own) * 20;
      badges.forEach(function (o) { score += overlapArea(r, o) * 2; });
      var d = nearest(p, r).d;
      score += cardA * 50 + d * d * 2;   // 멀어질수록 벌점이 빠르게 커진다
      if (score < bestScore) { bestScore = score; best = r; bestCard = cardA; bestDist = d; }
    });
    slot.rect = best;
    slot.el.style.left = best.l + 'px';
    slot.el.style.top = best.t + 'px';
    slot.ring.style.left = p.x + 'px';
    slot.ring.style.top = p.y + 'px';
    var e = nearest(p, best);
    slot.line.setAttribute('x1', p.x); slot.line.setAttribute('y1', p.y);
    slot.line.setAttribute('x2', e.x); slot.line.setAttribute('y2', e.y);
    return { overlap: bestCard / (w * h), dist: c.pin ? 0 : bestDist };
  }
  function fits(res, slack) {
    return res.overlap < MAX_OVERLAP && res.dist <= MAX_DIST * (slack || 1);
  }
  function placeAll() {
    slots.forEach(function (s) { s.rect = null; });
    slots.forEach(function (s) {
      // 화면 크기·확대가 바뀌어 자리가 모자라면 그 카드는 다음 차례까지 숨긴다
      if (s.cur && !fits(placeCard(s), 1.5)) { s.cur = null; s.rect = null; setVisible(s, false); }
    });
  }
  function startRotation() {
    var narrow = window.matchMedia('(max-width: 900px)').matches;
    var count = narrow ? CARDS_NARROW : CARDS_WIDE;
    for (var i = 0; i < count; i++) slots.push(makeSlot(300 + i * (ROTATE_MS / count)));
  }
  function resetQueue() { queues = { M: [], N: [] }; qpos = { M: 0, N: 0 }; }

  // ---------- 국가 상세 서랍 ----------
  function openDrawer(c2) {
    var items = filtered().filter(function (n) { return n.country === c2; }).sort(byDateDesc);
    document.getElementById('drawerTitle').textContent = COUNTRIES[c2].ko;
    document.getElementById('drawerSub').textContent =
      '최근 7일 ' + items.length + '건' + (state.cat === 'all' ? '' : ' · ' + state.cat);
    document.getElementById('drawerList').innerHTML = items.length
      ? items.map(function (n) { return newsItemHtml(n, true); }).join('')
      : '<li class="empty">최근 7일간 수집된 뉴스가 없습니다.</li>';
    var d = document.getElementById('drawer');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    slots.forEach(function (s) { setVisible(s, false); });
  }
  function closeDrawer() {
    var d = document.getElementById('drawer');
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    slots.forEach(function (s) { if (s.cur) setVisible(s, true); });
  }

  // ---------- 파라과이 패널 ----------
  function focusPy() {
    var p = document.getElementById('pyPanel');
    p.scrollIntoView({ behavior: 'smooth' });
    p.animate([{ boxShadow: 'inset 0 0 0 3px #14a06a' }, { boxShadow: 'inset 0 0 0 0 transparent' }], { duration: 1200 });
  }
  function renderPy() {
    var news = filtered().filter(function (n) { return n.country === 'PY'; }).sort(byDateDesc);
    document.getElementById('pyCount').textContent = '최근 7일 ' + news.length + '건';
    document.getElementById('pyNews').innerHTML = news.length
      ? news.map(function (n) { return newsItemHtml(n, false); }).join('')
      : '<li class="empty">최근 7일간 수집된 뉴스가 없습니다.</li>';
    var reg = ((state.py || {}).regulatory || []).slice().sort(byDateDesc);
    document.getElementById('pyReg').innerHTML = reg.length
      ? reg.map(function (n) { return newsItemHtml(n, false); }).join('')
      : '<li class="empty">수집된 보건·규제 동향이 없습니다.</li>';
  }
  function loadFx() {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.result !== 'success') throw new Error('fx');
        var pyg = d.rates.PYG, krw = d.rates.KRW;
        document.getElementById('fxUsd').textContent = Math.round(pyg).toLocaleString('ko-KR') + ' ₲';
        document.getElementById('fxKrw').textContent = Math.round(pyg / krw * 1000).toLocaleString('ko-KR') + ' ₲';
        document.getElementById('fxNote').textContent =
          '기준 ' + fmtKst(new Date(d.time_last_update_unix * 1000).toISOString()) + ' · ExchangeRate-API';
      })
      .catch(function () { document.getElementById('fxNote').textContent = '환율을 불러오지 못했습니다.'; });
  }

  // ---------- 데이터 ----------
  function loadData() {
    var bust = '?t=' + Date.now();
    return Promise.all([
      fetch('data/news.json' + bust).then(function (r) { return r.json(); }),
      fetch('data/paraguay.json' + bust).then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      state.news = (res[0].items || []);
      state.py = res[1];
      document.getElementById('updatedAt').textContent = fmtKst(res[0].updated_at);
      renderAll();
    });
  }
  function renderAll() {
    drawCountries();
    drawBadges();
    drawStats();
    renderPy();
    resetQueue();
  }

  // ---------- 이벤트 ----------
  function bindUi() {
    document.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        state.cat = b.getAttribute('data-cat');
        renderAll();
        closeDrawer();
      });
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        var reg = t.getAttribute('data-tab') === 'reg';
        document.getElementById('pyNews').classList.toggle('hidden', reg);
        document.getElementById('pyReg').classList.toggle('hidden', !reg);
      });
    });
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  }

  // ---------- 시작 ----------
  initMap();
  bindUi();
  drawNight();
  setInterval(drawNight, SUN_MS);
  fetch('assets/latam.geo.json').then(function (r) { return r.json(); }).then(function (geo) {
    state.geo = geo;
    return loadData();
  }).then(function () {
    startRotation();
    loadFx();
    setInterval(loadData, RELOAD_MS);
    setInterval(loadFx, RELOAD_MS);
  }).catch(function (err) {
    console.error(err);
    document.getElementById('updatedAt').textContent = '데이터를 불러오지 못했습니다';
  });
})();
