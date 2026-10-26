/* 중남미 뉴스 현황판 */
(function () {
  'use strict';

  // 대상 20개국: ISO2 → { iso3, 한국어명, 표시 좌표, 카드 방향 }
  // side: 'w'는 카드를 지점 왼쪽(태평양 쪽), 'e'는 오른쪽(대서양 쪽)에 띄운다
  var COUNTRIES = {
    MX: { iso3: 'MEX', ko: '멕시코', at: [23.6, -102.5], side: 'w' },
    GT: { iso3: 'GTM', ko: '과테말라', at: [15.4, -91.6], side: 'w' },
    BZ: { iso3: 'BLZ', ko: '벨리즈', at: [18.6, -87.2], side: 'w' },
    HN: { iso3: 'HND', ko: '온두라스', at: [16.4, -84.6], side: 'w' },
    SV: { iso3: 'SLV', ko: '엘살바도르', at: [12.4, -90.2], side: 'w' },
    NI: { iso3: 'NIC', ko: '니카라과', at: [13.2, -83.0], side: 'w' },
    CR: { iso3: 'CRI', ko: '코스타리카', at: [9.2, -85.9], side: 'w' },
    PA: { iso3: 'PAN', ko: '파나마', at: [9.6, -79.0], side: 'w' },
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
  var ROTATE_MS = 9000;          // 카드 한 장이 머무는 시간
  var RELOAD_MS = 30 * 60 * 1000; // 데이터 다시 읽는 주기

  var state = { news: [], py: null, cat: 'all', geo: null };
  var map, geoLayer, badgeLayer;

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
  function newsItemHtml(n, showCountry) {
    var imp = IMP_RANK[n.importance] ? n.importance : 'low';
    var who = showCountry && COUNTRIES[n.country] ? COUNTRIES[n.country].ko + ' · ' : '';
    return '<li class="news-item ' + imp + '">' +
      '<div class="row1"><span>' + esc(who) + esc(fmtDate(n.date)) + '</span>' +
      '<span><span class="cat">' + esc(n.category || n.agency || '') + '</span> ' + esc(IMP_KO[imp]) + '</span></div>' +
      '<div class="title">' + esc(n.title_ko) + '</div>' +
      (n.summary_ko ? '<div class="summary">' + esc(n.summary_ko) + '</div>' : '') +
      '<div class="src"><a href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener">' +
      esc(n.source || n.agency || '원문') + ' 원문 보기 ↗</a></div></li>';
  }

  // ---------- 지도 ----------
  function initMap() {
    map = L.map('map', {
      zoomControl: true, attributionControl: false, zoomSnap: 0.25,
      minZoom: 2, maxZoom: 7, worldCopyJump: false
    });
    fitView();
    window.addEventListener('resize', function () { fitView(); placeCards(); });
    map.on('move zoom', placeCards);
  }
  function fitView() {
    map.fitBounds([[32.5, -118], [-56, -34]], { padding: [10, 10] });
  }
  function countryStyle(feature) {
    var c2 = ISO3_TO_2[feature.id];
    if (!c2) return { color: '#26344c', weight: 0.6, fillColor: '#141d2c', fillOpacity: 1 };
    var imp = maxImp(filtered().filter(function (n) { return n.country === c2; }));
    var fill = '#233350';
    if (imp === 'high') fill = '#3d2633';
    else if (imp === 'medium') fill = '#3a3230';
    var isPy = c2 === 'PY';
    return {
      color: isPy ? '#3ccf91' : '#3a4d6b',
      weight: isPy ? 2.2 : 0.9,
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

  // ---------- 순환 카드 ----------
  // 화면이 넓으면 두 장(서쪽·동쪽)을 번갈아, 좁으면 한 장만 돌린다
  var slots = [];
  var paused = false;

  function buildQueue(side) {
    var items = filtered().filter(function (n) {
      return !side || COUNTRIES[n.country].side === side;
    }).sort(byDateDesc);
    // 나라별 최신 3건까지, 빨강은 한 번 더 넣어 자주 보이게 한다
    var perCountry = {}, q = [];
    items.forEach(function (n) {
      perCountry[n.country] = (perCountry[n.country] || 0) + 1;
      if (perCountry[n.country] <= 3) q.push(n);
    });
    q.slice().forEach(function (n) { if (n.importance === 'high') q.push(n); });
    // 같은 나라가 연달아 나오지 않도록 섞는다
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
  function makeSlot(side, delay) {
    var el = document.createElement('div');
    el.className = 'news-card hidden';
    var ring = document.createElement('div');
    ring.className = 'focus-ring hidden';
    var area = document.querySelector('.map-area');
    area.appendChild(ring);
    area.appendChild(el);
    var slot = { side: side, el: el, ring: ring, queue: [], i: 0, cur: null, timer: null };
    el.addEventListener('mouseenter', function () { paused = true; });
    el.addEventListener('mouseleave', function () { paused = false; });
    el.addEventListener('click', function (e) {
      if (e.target.closest('a') || !slot.cur) return;
      slot.cur.country === 'PY' ? focusPy() : openDrawer(slot.cur.country);
    });
    setTimeout(function () { advance(slot); slot.timer = setInterval(function () { advance(slot); }, ROTATE_MS); }, delay);
    return slot;
  }
  function advance(slot) {
    if (paused || document.getElementById('drawer').classList.contains('open')) return;
    if (!slot.queue.length || slot.i >= slot.queue.length) { slot.queue = buildQueue(slot.side); slot.i = 0; }
    if (!slot.queue.length) { slot.el.classList.add('hidden'); slot.ring.classList.add('hidden'); slot.cur = null; return; }
    var n = slot.queue[slot.i++];
    slot.el.classList.add('leaving');
    setTimeout(function () {
      slot.cur = n;
      renderCard(slot, n);
      slot.el.classList.remove('hidden', 'leaving');
      slot.ring.classList.remove('hidden');
      placeCard(slot);
    }, 350);
  }
  function renderCard(slot, n) {
    var imp = IMP_RANK[n.importance] ? n.importance : 'low';
    slot.el.className = 'news-card ' + imp;
    slot.el.innerHTML = '<div class="pop-anim">' +
      '<div class="pop-head"><span class="pop-country">' + esc(COUNTRIES[n.country].ko) + '</span>' +
      '<span class="pop-date">' + esc(fmtDate(n.date)) + '</span></div>' +
      '<div class="pop-title">' + esc(n.title_ko) + '</div>' +
      '<div class="pop-summary">' + esc(n.summary_ko) + '</div>' +
      '<div class="pop-foot"><span><span class="cat">' + esc(n.category) + '</span> ' +
      '<span style="color:var(--' + imp + ')">● ' + esc(IMP_KO[imp]) + '</span></span>' +
      '<a href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener">' + esc(n.source || '원문') + ' ↗</a></div></div>';
  }
  function placeCard(slot) {
    if (!slot.cur) return;
    var c = COUNTRIES[slot.cur.country];
    var p = map.latLngToContainerPoint(c.at);
    var area = document.querySelector('.map-area');
    var W = area.clientWidth, H = area.clientHeight;
    var w = slot.el.offsetWidth, h = slot.el.offsetHeight, gap = 26;
    var left = c.side === 'w' ? p.x - gap - w : p.x + gap;
    if (left < 8) left = p.x + gap;
    if (left + w > W - 8) left = Math.max(8, p.x - gap - w);
    var top = Math.min(Math.max(p.y - h / 2, 8), H - h - 8);
    slot.el.style.left = left + 'px';
    slot.el.style.top = top + 'px';
    slot.ring.style.left = p.x + 'px';
    slot.ring.style.top = p.y + 'px';
  }
  function placeCards() { slots.forEach(placeCard); }
  function startRotation() {
    var narrow = window.matchMedia('(max-width: 900px)').matches;
    slots = narrow ? [makeSlot(null, 300)] : [makeSlot('w', 300), makeSlot('e', 300 + ROTATE_MS / 2)];
  }
  function resetQueues() { slots.forEach(function (s) { s.queue = []; s.i = 0; }); }

  // ---------- 국가 상세 서랍 ----------
  function openDrawer(c2) {
    var items = filtered().filter(function (n) { return n.country === c2; }).sort(byDateDesc);
    document.getElementById('drawerTitle').textContent = COUNTRIES[c2].ko;
    document.getElementById('drawerSub').textContent =
      '최근 7일 ' + items.length + '건' + (state.cat === 'all' ? '' : ' · ' + state.cat);
    document.getElementById('drawerList').innerHTML = items.length
      ? items.map(function (n) { return newsItemHtml(n, false); }).join('')
      : '<li class="empty">최근 7일간 수집된 뉴스가 없습니다.</li>';
    var d = document.getElementById('drawer');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    slots.forEach(function (s) { s.el.classList.add('hidden'); s.ring.classList.add('hidden'); });
  }
  function closeDrawer() {
    var d = document.getElementById('drawer');
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    slots.forEach(function (s) { if (s.cur) { s.el.classList.remove('hidden'); s.ring.classList.remove('hidden'); } });
  }

  // ---------- 파라과이 패널 ----------
  function focusPy() {
    var p = document.getElementById('pyPanel');
    p.scrollIntoView({ behavior: 'smooth' });
    p.animate([{ boxShadow: 'inset 0 0 0 3px #3ccf91' }, { boxShadow: 'inset 0 0 0 0 transparent' }], { duration: 1200 });
  }
  function renderPy() {
    var news = filtered().filter(function (n) { return n.country === 'PY'; }).sort(byDateDesc);
    document.getElementById('pyCount').textContent = '최근 7일 ' + news.length + '건';
    document.getElementById('pyNews').innerHTML = news.length
      ? news.map(function (n) { return newsItemHtml(n, false); }).join('')
      : '<li class="empty">최근 7일간 수집된 뉴스가 없습니다.</li>';
    var py = state.py || {};
    var reg = (py.regulatory || []).slice().sort(byDateDesc);
    document.getElementById('pyReg').innerHTML = reg.length
      ? reg.map(function (n) { return newsItemHtml(n, false); }).join('')
      : '<li class="empty">수집된 보건·규제 동향이 없습니다.</li>';
    document.getElementById('indicators').innerHTML = (py.indicators || []).map(function (x) {
      return '<a class="ind" href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">' +
        '<span class="muted">' + esc(x.name_ko) + '</span><b>' + esc(x.value) + '</b>' +
        '<small>' + esc(x.source) + ' · ' + esc(x.as_of) + '</small></a>';
    }).join('');
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
    resetQueues();
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
