// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board with search, category, chain, TVL and watchlist filters, sortable columns, a Live
// token view, and a per-protocol detail drawer carrying the model's own arithmetic and the protocol's
// farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', min: 0, watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures the row carries and
  // checks the number board.json holds, so the page's code and the board's data are the same arithmetic.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? DATA.median_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chainMult = 1 + Math.min(Math.max(row.chains.length - 1, 0), m.chain_max_extra) * m.chain_step;
    return Math.min(1e14, Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * chainMult)));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the moves, the capital, the fees and the hold. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500;
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 2.5e8) return 150;
    if (p.tvl_usd >= 5e7) return 100;
    if (p.tvl_usd >= 1e7) return 75;
    return 50;
  }
  function gasFor(chain) {
    if (chain === 'Ethereum') return 12;
    if (chain === 'Bitcoin') return 6;
    if (chain === 'Solana') return 1;
    return 3;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    if (age < 730) return 35;
    return 30;
  }
  function movesFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var n = p.name;
    var half = Math.round(capital / 2);
    var fifth = Math.round(capital / 5);
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateral') >= 0) return {
      main: 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ' and leave the deposit earning.',
      second: 'Borrow $' + half + ' of USDC against the deposit at a conservative health factor and redeposit it once, so the wallet shows both sides of the market.',
      weekly: 'Repay a slice of the borrow and borrow it again, keeping the health factor comfortably safe.'
    };
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity') >= 0) return {
      main: 'Provide $' + capital + " split evenly across both sides of " + n + "'s busiest pool on " + chain + '.',
      second: 'Route $' + half + " of ordinary swaps through " + n + " itself rather than an aggregator, so the volume is the protocol's own.",
      weekly: 'Make two or three small swaps through ' + n + ' and rebalance the pool position if it drifts out of range.'
    };
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return {
      main: 'Deposit $' + capital + ' into the largest ' + n + ' vault on ' + chain + ' and keep the vault shares in the wallet.',
      second: 'Split a second $' + half + ' into a different ' + n + ' vault on another chain it curates, so the wallet appears in more than one of its markets.',
      weekly: 'Move a small slice between two ' + n + ' vaults, which keeps the wallet active in its allocation record.'
    };
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return {
      main: 'Deposit $' + capital + " of USDC into " + n + "'s highest-TVL vault on " + chain + ' and keep the vault shares in the wallet.',
      second: 'Ladder a second $' + half + ' into a different ' + n + ' vault or strategy, so the wallet is not riding on one pool.',
      weekly: "Harvest the week's yield and redeposit it into the same vault, which compounds the position and refreshes the activity record."
    };
    if (c.indexOf('bridge') >= 0) return {
      main: 'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + ' through ' + n + ' and use the bridged funds in the destination app.',
      second: 'Bridge $' + half + ' back a week later rather than the same day, so both directions sit in separate weekly snapshots.',
      weekly: 'Send one small transfer of $' + fifth + ' through ' + n + ' on a route you have not used before.'
    };
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('anchor') >= 0 || c.indexOf('decentralized btc') >= 0) return {
      main: 'Stake $' + capital + " of the chain's staking asset through " + n + ' and keep the liquid receipt in the wallet.',
      second: 'Use half the receipt as collateral or in a pool where ' + n + ' itself lists it, so the position counts twice in its ecosystem.',
      weekly: 'Add a small top-up of $' + fifth + ' to the stake rather than opening a second wallet.'
    };
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('interest rate') >= 0) return {
      main: 'Deposit $' + capital + ' of USDC as margin on ' + n + ' and open one small hedged position, long and short in equal size.',
      second: 'Post $' + half + " into " + n + "'s liquidity or vault side if it has one, which earns without a directional bet.",
      weekly: 'Roll the hedge once: close it and reopen it at the new price, keeping the size small and the margin topped up.'
    };
    if (c.indexOf('basis') >= 0) return {
      main: 'Deposit $' + capital + " of USDC into " + n + "'s basis vault on " + chain + ' and keep the shares.',
      second: 'Hold the matching spot asset in the same wallet, so your position mirrors the trade ' + n + ' itself runs.',
      weekly: 'Add $' + fifth + ' to the vault and check the funding-rate page it publishes.'
    };
    if (c.indexOf('rwa') >= 0) return {
      main: 'Mint $' + capital + " of " + n + "'s yield-bearing asset on " + chain + ' after its onboarding and hold the asset in the wallet.',
      second: 'Supply half the minted asset as collateral where ' + n + ' lists it, or hold a second, smaller tranche with a different maturity.',
      weekly: 'Accrue one more small mint of $' + fifth + ' rather than moving the whole position at once.'
    };
    if (c.indexOf('stable') >= 0 || c.indexOf('algo') >= 0) return {
      main: 'Mint or deposit $' + capital + ' of the stable asset through ' + n + ' on ' + chain + ' and hold it unspent.',
      second: 'Provide $' + half + ' of the stable asset to the pool ' + n + ' names as its main liquidity venue.',
      weekly: "Swap a small amount into the stable asset and back through " + n + "'s own interface."
    };
    if (c === 'chain') return {
      main: 'Bridge $' + capital + " of USDC onto " + n + "'s chain and hold it in the wallet as a native balance.",
      second: 'Pay real fees on the chain: deploy a trivial contract or run $' + half + ' of transfers and swaps in its own apps.',
      weekly: 'Make a handful of ordinary transactions on the chain each week, spread across different days.'
    };
    if (c.indexOf('prediction') >= 0) return {
      main: 'Fund $' + capital + ' and take a position in ' + n + "'s most liquid market, on the side you actually believe.",
      second: 'Add a standing limit order $' + half + ' in size on a second market, so the wallet also provides liquidity.',
      weekly: 'Settle or roll one position and open one new one in a market that resolves this month.'
    };
    if (c.indexOf('insurance') >= 0) return {
      main: 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ' for a position you really hold, and keep the policy to expiry.',
      second: 'Stake $' + half + " into " + n + "'s underwriting pool if it offers one, which is the side a launch rewards first.",
      weekly: 'Renew or extend one small policy rather than letting cover lapse entirely.'
    };
    if (c.indexOf('launchpad') >= 0) return {
      main: 'Deposit $' + capital + " into " + n + "'s current sale or staking tier on " + chain + ' and complete its participation steps.',
      second: 'Take part in one launch end to end: commit, claim and hold the allocation instead of selling on day one.',
      weekly: 'Check the launch calendar and register for the next sale before its snapshot date.'
    };
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return {
      main: 'Move $' + capital + ' through ' + n + ' as a real payment or balance and leave it sitting in the account.',
      second: 'Make one payment to a second wallet you control through ' + n + ', so both sending and receiving show.',
      weekly: 'Run one ordinary payment a week rather than a single large one.'
    };
    if (c.indexOf('privacy') >= 0) return {
      main: 'Deposit $' + capital + " of USDC into " + n + "'s shielded pool on " + chain + ' through its own interface.',
      second: 'Withdraw half to a second wallet you control after a few days, completing a full private round trip.',
      weekly: 'Add one small shielded transfer of $' + fifth + '.'
    };
    return {
      main: 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.',
      second: 'Make one further $' + half + ' deposit a week later from the same wallet, so the record shows a returning user.',
      weekly: "Make one qualifying action, such as a deposit, a swap or a vote in " + n + "'s own interface."
    };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var gas = gasFor(chain);
    var hold = holdDaysFor(p.age_days);
    var moves = movesFor(p, capital, chain);
    var halfGas = Math.max(1, Math.round(gas / 2));
    return [
      { text: 'Open a fresh wallet for this farm, keep its seed phrase offline, and fund it only with what this plan uses.', cost: 'no fee beyond the first funding transaction', time: '10 minutes' },
      { text: moves.main, cost: '$' + capital + ' of capital and about $' + gas + ' of network fees', time: '15 minutes to set up' },
      { text: moves.second, cost: 'about $' + halfGas + ' of network fees beyond the amount named', time: '10 minutes' },
      { text: "Open " + p.name + "'s own points or rewards page, connect the same wallet and confirm the position shows as counted; save a screenshot of it in your farm log.", cost: 'free to check, and never pay anyone to claim on your behalf', time: '5 minutes' },
      { text: moves.weekly, cost: 'about $' + halfGas + ' of network fees a week', time: '10 minutes a week' },
      { text: 'Keep the position untouched for at least ' + hold + ' days, across at least two weekly snapshots, so the activity reads as use and not a one-day visit.', cost: 'the $' + capital + ' stays committed, and its price and smart-contract risk are yours', time: hold + ' days' },
      { text: "Write every transaction hash and date in a farm diary; before withdrawing, re-check the points page and " + p.name + "'s own announcements for a snapshot or claim window.", cost: 'nothing but the diary', time: '5 minutes a week' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('min')) state.min = Number(params.get('min')) || 0;
    if (params.get('w') === '1') state.watch = true;
    if (params.get('tab') === 'live') state.tab = 'live';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.min) params.set('min', String(state.min));
    if (state.watch) params.set('w', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.min && r.tvl_usd < state.min) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' comparables model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' protocols that record no token, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record is here, and the radar adds the standalone pre-token protocols below that line. An implied value is what this model says a launch would be worth if the record stayed as it is. It is a claim, not a promise, and recording no token is not proof a protocol has none.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Market multiple (median)' }), el('b', { text: 'x' + DATA.global_multiple })),
        el('div', { class: 'fact' }, el('span', { text: 'Products of traded tokens set aside' }), el('b', { text: String(DATA.aside_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols shown' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a] || (a < b ? -1 : 1); });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () {
      state.q = search.value; writeHash(); render();
      var again = document.getElementById('q');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var mins = [[0, 'Any TVL'], [1e7, '$10M and up'], [5e7, '$50M and up'], [2.5e8, '$250M and up'], [1e9, '$1B and up']];
    var minSelect = el('select', { id: 'min', 'aria-label': 'Filter by minimum TVL' },
      mins.map(function (pair) { return el('option', { value: String(pair[0]), text: pair[1], selected: state.min === pair[0] ? 'selected' : null }); })
    );
    minSelect.addEventListener('change', function () { state.min = Number(minSelect.value) || 0; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watch ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'min', text: 'Minimum TVL' }), minSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), el('label', { class: 'check' }, watchBox, 'Watchlist only')),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or loosen a filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.min = 0; state.watch = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }, r.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' on ' + (r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: 'x' + r.category_multiple }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'trades' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' on ' + (r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.symbol || '—' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live token: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking; their market-cap to TVL ratios are the comparables the model is built from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Symbol' })))
          ,
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'One function scores every row from the snapshot figures alone; no protocol name is special-cased and no row is hand-picked. The multiple is what the market already pays for the same kind of protocol: the median market-cap to TVL ratio of the category members whose token trades, each ratio clamped to [x' + m.ratio_floor + ', x' + m.ratio_cap + '] and shrunk toward the market median x' + DATA.global_multiple + ' in proportion to how few traded members stand behind it. A category with no traded member takes the market median outright.' }),
      el('div', { class: 'formula' },
        'implied = tvl x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x extra_chains)'
      ),
      el('p', { text: 'Age is the time since the protocol was first listed, the snapshot record of how long it has run with no token; an unrecorded age scores the snapshot median of ' + DATA.median_age_days + ' days. Extra chains count up to ' + m.chain_max_extra + '. The board ranks standalone protocols only: bridges, liquid staking and restaking products, wrapped and staked wrappers, versioned pools and exchanges are set aside at every size, because a product of a token that already trades is not a token that does not exist yet. Every row of the detail view shows its own multiple and multipliers, and the page recomputes the row from them to prove the number is the model output and not a typed-in figure.' }),
      el('div', { class: 'mults' }, DATA.multiples.map(function (mm) {
        return el('span', { class: 'chip' }, mm.category + ' ', el('b', { text: 'x' + mm.multiple }), ' · ' + mm.comparables + (mm.comparables === 1 ? ' comparable' : ' comparables'));
      }))
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' on ' + (row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.watchlist ? ' · on the house watchlist' : '') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + row.comparables + ' traded comparables)' }), el('b', { class: 'num', text: 'x' + row.category_multiple })),
        el('div', null, el('span', { text: 'Seven-day growth ' + fmtPct(row.change_7d) }), el('b', { class: 'num', text: 'x' + row.growth_multiplier })),
        el('div', null, el('span', { text: 'Age with no token ' + fmtAge(row.age_days) }), el('b', { class: 'num', text: 'x' + row.maturity_multiplier })),
        el('div', null, el('span', { text: 'Chains (' + row.chains.length + ')' }), el('b', { class: 'num', text: 'x' + row.chain_multiplier })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' ' + row.name + ' records no token in the snapshot; that is DefiLlama\u2019s record, not proof it has none. The implied value is the model\u2019s claim, not a price and not a forecast of a launch.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { text: 'The plan is generated from this protocol\u2019s category, chains, TVL and age, the same derivation board.json carries. Costs are estimates in dollars at snapshot time; the capital stays yours and at risk.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

