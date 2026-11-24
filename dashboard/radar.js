/* Token Radar v2: the page. Reads window.RADAR (data.js, written by main.ts); no framework, no network. */
(function () {
  'use strict';
  var R = window.RADAR;
  var M = R.model;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ---------- formatting ---------- */
  function money(x) {
    var a = Math.abs(x);
    if (a >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (x / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (x / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
    return '$' + (a >= 10 ? Math.round(x) : x.toFixed(2));
  }
  function axis(e) { return e >= 9 ? '$' + Math.pow(10, e - 9) + 'B' : e >= 6 ? '$' + Math.pow(10, e - 6) + 'M' : '$' + Math.pow(10, e - 3) + 'K'; }
  function pct(x) { return x === null ? '—' : (x > 0 ? '+' : '') + x.toFixed(1) + '%'; }
  function trend(x) { return x === null ? '' : x > 0 ? 'up' : x < 0 ? 'down' : ''; }
  function age(d) { return d === null ? 'unknown' : d < 60 ? d + 'd' : d < 730 ? Math.round(d / 30.4) + 'mo' : (d / 365).toFixed(1) + 'y'; }
  function mult(x) { return '×' + (x >= 1 ? x.toFixed(2) : x.toFixed(3)); }
  function hours(m) { return m >= 60 ? (m / 60).toFixed(1) + ' h' : m + ' min'; }
  /* What a $1,000 position could earn under the plan's stated user share. */
  function evPer1k(r) { return r.value_per_tvl * M.user_share * 1000; }

  /* ---------- state, kept in the URL hash so a view can be shared ---------- */
  var S = { view: 'board', q: '', fam: '', cat: '', chain: '', mintvl: 0, seg: 'all', sort: 'implied_value_usd', dir: -1, open: '' };
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    Object.keys(S).forEach(function (k) {
      if (!h.has(k)) return;
      var v = h.get(k);
      S[k] = typeof S[k] === 'number' ? Number(v) || 0 : v;
    });
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (S.view !== 'board') h.set('view', S.view);
    ['q', 'fam', 'cat', 'chain', 'open'].forEach(function (k) { if (S[k]) h.set(k, S[k]); });
    if (S.mintvl) h.set('mintvl', S.mintvl);
    if (S.seg !== 'all') h.set('seg', S.seg);
    if (S.sort !== 'implied_value_usd' || S.dir !== -1) { h.set('sort', S.sort); h.set('dir', S.dir); }
    history.replaceState(null, '', h.toString() ? '#' + h.toString() : location.pathname);
  }

  /* ---------- header, KPIs and the model card ---------- */
  function renderHead() {
    var c = R.counts, top = R.rows[0];
    $('sub').textContent = 'Every protocol in the ' + R.as_of + ' DefiLlama snapshot that records no token, ranked by what its token would be worth if its record stayed as it is, with a costed plan to farm it. A model, not a promise: it never says whether or when a token comes.';
    var k = [
      ['Ranked', R.rows.length, c.watchlist + ' watchlist + ' + c.early + ' early'],
      ['Watchlist', c.watchlist + '/' + c.watchlist, 'covered, floor ' + money(R.floor_usd)],
      ['Top implied', money(top.implied_value_usd), top.name],
      ['Already trade', c.trading, 'kept off the board'],
      ['Model check', 'ρ ' + R.check.spearman_model.toFixed(2), 'vs ' + R.check.n + ' live market caps']
    ];
    $('kpis').innerHTML = k.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd><small>' + esc(x[2]) + '</small></div>'; }).join('');
  }

  function renderModel() {
    var ch = R.check;
    $('model').innerHTML =
      '<h2>The value model <span class="note">' + esc(M.version) + '</span></h2>' +
      '<div class="formula">implied = TVL × peer × growth × runway × reach</div>' +
      '<dl class="terms">' +
      '<dt>peer</dt><dd>market cap ÷ TVL of live tokens in the same category, log-median shrunk toward its family and the market (k = ' + M.shrink_k + '), ' + M.multiple_min + '–' + M.multiple_max + '×</dd>' +
      '<dt>growth</dt><dd>1 + ' + M.growth_amp + '·tanh(7d change ÷ ' + M.growth_scale + '%): 0.6–1.4×</dd>' +
      '<dt>runway</dt><dd>' + M.runway_floor + ' + ' + M.runway_gain + '·(1 − e<sup>−days/' + M.runway_days + '</sup>): time run with no token</dd>' +
      '<dt>reach</dt><dd>+' + M.reach_step + ' per extra chain, up to ' + M.reach_max_chains + '</dd>' +
      '</dl>' +
      '<div class="check"><div><b>ρ ' + ch.spearman_model.toFixed(2) + '</b><span>rank match, model vs market cap (TVL alone ' + ch.spearman_tvl.toFixed(2) + ')</span></div>' +
      '<div><b>' + ch.median_fold_error.toFixed(1) + '×</b><span>median miss on ' + ch.n + ' live tokens, each left out of its own peers</span></div>' +
      '<div><b>' + Math.round(ch.within_3x * 100) + '%</b><span>priced within 3× of the market</span></div></div>' +
      '<p class="note">Live tokens trade at 0.01× to 10×+ their TVL, so the model is a central estimate: it is unbiased (median model ÷ market ' + ch.median_ratio + '×) and each row shows its range.</p>' +
      '<p class="note">No protocol name is read by the model. ' + R.counts.set_aside + ' no-token protocols are set aside by the watchlist\'s own rule: ' + R.set_aside.map(function (s) { return s.count + ' ' + s.reason; }).join(', ') + '.</p>';
  }

  /* ---------- the scatter: implied value against TVL, both log ---------- */
  function renderScatter(rows) {
    var W = 640, H = 300, L = 46, B = 26, T = 10, Rt = 30;
    var xs = R.rows.map(function (r) { return Math.log10(r.tvl_usd); });
    var ys = R.rows.map(function (r) { return Math.log10(r.implied_value_usd); });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var X = function (v) { return L + (v - x0) / (x1 - x0) * (W - L - Rt); };
    var Y = function (v) { return H - B - (v - y0) / (y1 - y0) * (H - B - T); };
    var g = '';
    for (var i = x0; i <= x1; i++) g += '<line class="grid" x1="' + X(i) + '" x2="' + X(i) + '" y1="' + T + '" y2="' + (H - B) + '"/><text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + axis(i) + ' TVL</text>';
    for (var j = y0; j <= y1; j++) g += '<line class="grid" x1="' + L + '" x2="' + (W - Rt) + '" y1="' + Y(j) + '" y2="' + Y(j) + '"/><text x="' + (L - 6) + '" y="' + (Y(j) + 3) + '" text-anchor="end">' + axis(j) + '</text>';
    var m = Math.log10(marketMedian);
    g += '<line class="med" x1="' + X(x0) + '" y1="' + Y(x0 + m) + '" x2="' + X(x1) + '" y2="' + Y(x1 + m) + '"/>';
    var shown = {};
    rows.forEach(function (r) { shown[r.slug] = 1; });
    var dots = '', labs = '', placed = [];
    R.rows.forEach(function (r) {
      if (!shown[r.slug] || placed.length >= 5) return;
      var cx = X(Math.log10(r.tvl_usd)), cy = Y(Math.log10(r.implied_value_usd));
      var clash = placed.some(function (p) { return Math.abs(p[0] - cx) < 120 && Math.abs(p[1] - cy) < 18; });
      if (clash) return;
      placed.push([cx, cy]);
      var left = cx > W - 150;
      labs += '<text class="lab" x="' + (left ? cx - 7 : cx + 7).toFixed(1) + '" y="' + (cy + 3.5).toFixed(1) + '"' + (left ? ' text-anchor="end"' : '') + '>' + esc(r.name) + '</text>';
    });
    R.rows.slice().reverse().forEach(function (r) {
      if (!shown[r.slug]) return;
      var cx = X(Math.log10(r.tvl_usd)), cy = Y(Math.log10(r.implied_value_usd));
      dots += '<circle data-slug="' + esc(r.slug) + '" class="' + (r.segment === 'watchlist' ? 'wl' : 'ea') + (S.open === r.slug ? ' sel' : '') + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (r.segment === 'watchlist' ? 4.6 : 3.4) + '"><title>' + esc(r.name) + ': ' + money(r.implied_value_usd) + ' implied on ' + money(r.tvl_usd) + ' TVL</title></circle>';
    });
    $('scatter').innerHTML = g + dots + labs;
  }
  var marketMedian = 0.25;

  /* ---------- filters ---------- */
  function uniq(list) { return list.filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort(); }
  function fillSelect(el, label, values, counts) {
    el.innerHTML = '<option value="">All ' + label + '</option>' + values.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + (counts ? ' (' + counts[v] + ')' : '') + '</option>'; }).join('');
  }
  function countBy(rows, f) { var c = {}; rows.forEach(function (r) { [].concat(f(r)).forEach(function (k) { c[k] = (c[k] || 0) + 1; }); }); return c; }
  function renderFilterOptions() {
    var fams = countBy(R.rows, function (r) { return r.family; });
    var cats = countBy(R.rows, function (r) { return r.category || 'Uncategorised'; });
    var chains = countBy(R.rows, function (r) { return r.chains; });
    fillSelect($('fam'), 'families', uniq(Object.keys(fams)), fams);
    fillSelect($('cat'), 'categories', uniq(Object.keys(cats)), cats);
    fillSelect($('chain'), 'chains', Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a] || (a < b ? -1 : 1); }).slice(0, 40), chains);
  }

  function matches(r) {
    if (S.q) {
      var q = S.q.toLowerCase();
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    if (S.fam && r.family !== S.fam) return false;
    if (S.cat && (r.category || 'Uncategorised') !== S.cat) return false;
    if (S.chain && r.chains.indexOf(S.chain) < 0) return false;
    if (S.mintvl && r.tvl_usd < S.mintvl) return false;
    if (S.seg === 'watchlist' && r.segment !== 'watchlist') return false;
    if (S.seg === 'early' && r.segment !== 'early') return false;
    if (S.seg === 'rising' && !(r.change_7d > 0)) return false;
    return true;
  }

  var BOARD_COLS = [
    ['rank', '#', 'n'],
    ['name', 'Protocol'],
    ['chains', 'Main chain'],
    ['tvl_usd', 'TVL', 'n'],
    ['change_7d', '7d', 'n'],
    ['age', 'No token for', 'n'],
    ['implied_value_usd', 'Implied value', 'n'],
    ['ev', 'Per $1k farmed', 'n'],
    ['fees', 'Plan fees', 'n']
  ];
  var LIVE_COLS = [
    ['name', 'Protocol'],
    ['category', 'Category'],
    ['tvl_usd', 'TVL', 'n'],
    ['mcap_usd', 'Market cap', 'n'],
    ['model_usd', 'Model price', 'n'],
    ['ratio', 'Model ÷ market', 'n']
  ];
  function sortKey(r, k) {
    if (k === 'age') return r.model.age_days === null ? -1 : r.model.age_days;
    if (k === 'ev') return evPer1k(r);
    if (k === 'fees') return r.plan.fees_usd;
    if (k === 'chains') return r.chains[0] || '';
    if (k === 'name' || k === 'category') return String(r[k] || '').toLowerCase();
    return r[k] === null ? -Infinity : r[k];
  }
  function sorted(rows) {
    var k = S.sort, d = S.dir;
    return rows.slice().sort(function (a, b) {
      var x = sortKey(a, k), y = sortKey(b, k);
      return (x < y ? -1 : x > y ? 1 : 0) * d || (a.rank || 0) - (b.rank || 0);
    });
  }
  function head(cols) {
    return '<thead><tr>' + cols.map(function (c) {
      var sort = S.sort === c[0] ? (S.dir < 0 ? 'descending' : 'ascending') : 'none';
      return '<th data-k="' + c[0] + '" class="' + (c[2] || '') + '" aria-sort="' + sort + '">' + c[1] + '</th>';
    }).join('') + '</tr></thead>';
  }

  function boardRow(r) {
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="n rk">' + r.rank + '</td>' +
      '<td><span class="pname">' + esc(r.name) + '</span><span class="badge ' + (r.segment === 'watchlist' ? 'wl">watchlist' : 'ea">early') + '</span><div class="pmeta">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.family) + '</div></td>' +
      '<td>' + esc(r.chains[0] || '—') + (r.chains.length > 1 ? ' <span class="pmeta">+' + (r.chains.length - 1) + '</span>' : '') + '</td>' +
      '<td class="n">' + money(r.tvl_usd) + '</td>' +
      '<td class="n ' + trend(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
      '<td class="n">' + age(r.model.age_days) + '</td>' +
      '<td class="n"><span class="val">' + money(r.implied_value_usd) + '</span><div class="pmeta">' + money(r.implied_low_usd) + '–' + money(r.implied_high_usd) + '</div></td>' +
      '<td class="n ev">' + money(evPer1k(r)) + '</td>' +
      '<td class="n">' + money(r.plan.fees_usd) + '</td></tr>';
  }
  function liveRow(r) {
    return '<tr data-live="' + esc(r.slug) + '"><td><span class="pname">' + esc(r.name) + '</span>' + (r.symbol ? ' <span class="pmeta">' + esc(r.symbol) + '</span>' : '') + '</td>' +
      '<td>' + esc(r.category || '—') + '</td><td class="n">' + money(r.tvl_usd) + '</td><td class="n">' + money(r.mcap_usd) + '</td>' +
      '<td class="n">' + money(r.model_usd) + '</td><td class="n ' + (r.ratio > 3 ? 'down' : r.ratio < 1 / 3 ? 'up' : '') + '">' + (r.ratio >= 1 ? r.ratio.toFixed(1) + '×' : '1/' + (1 / r.ratio).toFixed(1)) + '</td></tr>';
  }

  function render() {
    var live = S.view === 'live';
    document.querySelectorAll('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.view === S.view)); });
    $('filters').style.display = live ? 'none' : '';
    var rows;
    if (live) {
      if (!LIVE_COLS.some(function (c) { return c[0] === S.sort; })) { S.sort = 'mcap_usd'; S.dir = -1; }
      rows = sorted(R.check.rows);
      $('table').innerHTML = head(LIVE_COLS) + '<tbody>' + rows.map(liveRow).join('') + '</tbody>';
      $('count').innerHTML = '<b>' + rows.length + '</b> protocols whose token already trades, priced by the same model with each one left out of its own peer set. They are never ranked on the board.';
      $('foot').textContent = 'Model ÷ market above 3× means the model would price the token higher than the market does; under 1/3, lower. Median miss ' + R.check.median_fold_error + '×.';
    } else {
      if (!BOARD_COLS.some(function (c) { return c[0] === S.sort; })) { S.sort = 'implied_value_usd'; S.dir = -1; }
      rows = sorted(R.rows.filter(matches));
      var total = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
      $('table').innerHTML = head(BOARD_COLS) + '<tbody>' + rows.map(boardRow).join('') + '</tbody>';
      $('count').innerHTML = '<b>' + rows.length + '</b> of ' + R.rows.length + ' protocols · ' + money(total) + ' implied in view · sorted by ' + BOARD_COLS.filter(function (c) { return c[0] === S.sort; })[0][1].toLowerCase() + (S.dir < 0 ? ' ↓' : ' ↑');
      $('foot').textContent = 'Per $1k farmed: what $1,000 could earn if ' + Math.round(M.user_share * 100) + '% of the implied value went to users pro rata to TVL. Plan fees: gas and transfer costs of the whole plan on the main chain. Under each value: its range at the peer set\'s quartiles.';
      renderScatter(rows);
    }
    writeHash();
  }

  /* ---------- the detail drawer ---------- */
  function openDetail(slug) {
    var r = R.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) { closeDetail(); return; }
    S.open = slug;
    var m = r.model, plan = r.plan;
    var stepsV = [
      ['TVL', r.tvl_usd, money(r.tvl_usd) + ' locked today'],
      ['× peer ' + mult(m.multiple), r.tvl_usd * m.multiple, peerWords(r)],
      ['× growth ' + mult(m.growth), r.tvl_usd * m.multiple * m.growth, '7-day TVL change ' + pct(r.change_7d)],
      ['× runway ' + mult(m.runway), r.tvl_usd * m.multiple * m.growth * m.runway, (m.age_assumed ? 'listing date unknown, ' + M.unknown_age_days + ' days assumed' : age(m.age_days) + ' tracked with no token, since ' + r.listed_at)],
      ['× reach ' + mult(m.reach), r.implied_value_usd, r.chains.length + ' chain' + (r.chains.length > 1 ? 's' : '') + ': ' + r.chains.slice(0, 6).join(', ') + (r.chains.length > 6 ? '…' : '')]
    ];
    var maxV = Math.max.apply(null, stepsV.map(function (s) { return s[1]; }));
    var wf = stepsV.map(function (s, i) {
      return '<span>' + s[0] + '</span><div class="bar"><i class="' + (i === stepsV.length - 1 ? 'hot' : '') + '" style="width:' + Math.max(1, s[1] / maxV * 100).toFixed(1) + '%"></i></div><span class="n">' + money(s[1]) + '</span><em>' + esc(s[2]) + '</em>';
    }).join('');
    var recomputed = Math.round(r.tvl_usd * m.multiple * m.growth * m.runway * m.reach);
    var ok = Math.abs(recomputed - r.implied_value_usd) <= Math.max(2, r.implied_value_usd * 1e-3);
    $('detail').innerHTML =
      '<div class="dhead"><div><h2>' + esc(r.name) + '</h2><p class="pmeta">Rank ' + r.rank + ' of ' + R.rows.length + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + (r.segment === 'watchlist' ? 'on the watchlist' : 'early find, under the ' + money(R.floor_usd) + ' floor') + ' · DefiLlama records no token</p></div><button class="close" aria-label="Close">✕</button></div>' +
      '<div class="stats"><div><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div><div><span>Range</span><b>' + money(r.implied_low_usd) + '–' + money(r.implied_high_usd) + '</b></div><div><span>Value ÷ TVL</span><b>' + mult(r.value_per_tvl) + '</b></div><div><span>7-day TVL</span><b class="' + trend(r.change_7d) + '">' + pct(r.change_7d) + '</b></div></div>' +
      '<h3>Why this value</h3><div class="wf">' + wf + '</div>' +
      '<p class="note" style="margin-top:8px">' + (ok ? '✓ The page recomputed ' + money(recomputed) + ' from these inputs: it matches the board.' : 'Recomputed ' + money(recomputed) + ': differs from the board.') + '</p>' +
      '<h3>Farm plan · ' + plan.hold_days + ' days on ' + esc(r.chains[0] || 'its main chain') + '</h3>' +
      '<div class="totals"><div><span>Capital (stays yours)</span><b>' + money(plan.capital_usd) + '</b></div><div><span>Fees, whole plan</span><b>' + money(plan.fees_usd) + '</b></div><div><span>Hands-on time</span><b>' + hours(plan.hands_on_minutes) + '</b></div></div>' +
      '<div class="calc"><label for="cap">If I farm with</label><input id="cap" type="number" min="100" step="100" value="' + plan.capital_usd + '"><span id="capout"></span></div>' +
      '<ol class="plan" style="margin-top:16px">' + plan.steps.map(function (s) { return '<li>' + esc(s.do) + '.<div class="tags"><span>' + esc(s.cost) + '</span><span>' + esc(s.time) + '</span></div></li>'; }).join('') + '</ol>';
    $('detail').hidden = false;
    $('scrim').hidden = false;
    var cap = $('cap');
    var calc = function () {
      var c = Math.max(0, Number(cap.value) || 0);
      var ev = r.value_per_tvl * M.user_share * c;
      $('capout').innerHTML = 'could earn <b class="ev">' + money(ev) + '</b> against ' + money(plan.fees_usd) + ' of fees (' + (ev / Math.max(plan.fees_usd, 0.01)).toFixed(1) + ' to 1)';
    };
    cap.addEventListener('input', calc);
    calc();
    $('detail').querySelector('.close').addEventListener('click', closeDetail);
    render();
  }
  function peerWords(r) {
    var m = r.model;
    var cat = r.category || 'Uncategorised';
    if (m.peer_n === 0) return 'no live ' + cat + ' token to read, so the ' + r.family + ' family\'s ' + m.family_n + ' live tokens set it';
    return m.peer_n + ' live ' + cat + ' token' + (m.peer_n > 1 ? 's' : '') + ' at ' + mult(m.peer_raw) + ', shrunk toward ' + r.family + ' (' + m.family_n + ' tokens)';
  }
  function closeDetail() {
    S.open = '';
    $('detail').hidden = true;
    $('scrim').hidden = true;
    render();
  }

  /* ---------- wiring ---------- */
  function bind() {
    $('q').addEventListener('input', function (e) { S.q = e.target.value.trim(); render(); });
    ['fam', 'cat', 'chain'].forEach(function (id) { $(id).addEventListener('change', function (e) { S[id] = e.target.value; render(); }); });
    $('mintvl').addEventListener('change', function (e) { S.mintvl = Number(e.target.value); render(); });
    $('seg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S.seg = b.dataset.seg;
      document.querySelectorAll('#seg button').forEach(function (x) { x.classList.toggle('on', x === b); });
      render();
    });
    document.querySelector('.tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      S.view = b.dataset.view; render();
    });
    $('table').addEventListener('click', function (e) {
      var th = e.target.closest('th');
      if (th) {
        var k = th.dataset.k === 'rank' ? 'implied_value_usd' : th.dataset.k;
        if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = k === 'name' || k === 'chains' || k === 'category' ? 1 : -1; }
        render(); return;
      }
      var tr = e.target.closest('tr[data-slug]');
      if (tr) openDetail(tr.dataset.slug);
    });
    $('scatter').addEventListener('click', function (e) { var c = e.target.closest('circle'); if (c) openDetail(c.dataset.slug); });
    $('scrim').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) closeDetail(); });
  }

  function syncControls() {
    $('q').value = S.q; $('fam').value = S.fam; $('cat').value = S.cat; $('chain').value = S.chain; $('mintvl').value = String(S.mintvl);
    document.querySelectorAll('#seg button').forEach(function (x) { x.classList.toggle('on', x.dataset.seg === S.seg); });
  }

  var live = R.check.rows.map(function (r) { return r.mcap_usd / r.tvl_usd; }).sort(function (a, b) { return a - b; });
  marketMedian = live.length ? live[live.length >> 1] : 0.25;
  readHash();
  renderHead();
  renderModel();
  renderFilterOptions();
  syncControls();
  bind();
  if (S.open) openDetail(S.open); else render();
})();
