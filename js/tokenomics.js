/**
 * Tokenomics Intelligence — Page UI
 * Search, manual entry, data fetching, all 8 render panels
 * Depends: tokenomics-calc.js, tokenomics-score.js
 */
(function () {
  var profiles = [];
  var currentData = null;
  var currentMetrics = null;
  var currentScore = null;
  var currentUtility = null;

  var PROFILES_API = "/api/data/tokenomics-profiles.json";

  /* ── Helpers ── */

  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  function fmtNum(n) {
    if (n == null || isNaN(n)) return "—";
    var abs = Math.abs(n);
    if (abs >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
    if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function fmtRaw(n) {
    if (n == null || isNaN(n)) return "—";
    var abs = Math.abs(n);
    if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return "—";
    return (n * 100).toFixed(1) + "%";
  }

  function fmtPrice(n) {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1) return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 0.01) return "$" + n.toFixed(4);
    return "$" + n.toFixed(8);
  }

  function dot(color) {
    return '<span class="tk-dot tk-dot-' + color + '"></span>';
  }

  function srcBadge(srcRef) {
    if (!srcRef || srcRef.value == null) return '<span class="tk-src tk-src-none">no data</span>';
    var c = srcRef.confidence === "high" ? "high" : "low";
    return '<span class="tk-src tk-src-' + c + '">' + esc(srcRef.source) + '</span>';
  }

  function formatMetricValue(m) {
    if (!m.computable) return "N/A";
    var v = m.value;
    if (m.id === "crossSource") return fmtPct(v);
    if (m.id.indexOf("Ratio") >= 0 || m.id.indexOf("Pct") >= 0 || m.id === "circulatingPct"
        || m.id === "floatRatio" || m.id === "remainingDilution" || m.id === "dilution12m"
        || m.id === "insiderConcentration" || m.id === "drawdownAthMc") return fmtPct(v);
    if (m.id === "fdvOverhang" || m.id === "fdvToTvl" || m.id === "mcToTvl") return v != null ? v.toFixed(2) + "x" : "—";
    if (m.id === "fdPriceCheck") return fmtPrice(v);
    return fmtNum(v);
  }

  /* ── Data loading ── */

  async function loadProfiles() {
    try { var r = await fetch(PROFILES_API); profiles = await r.json(); if (!Array.isArray(profiles)) profiles = []; }
    catch (e) { profiles = []; }
  }

  async function saveProfiles() {
    await fetch(PROFILES_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profiles) });
  }

  async function searchCoins(query) {
    var r = await fetch("/api/tokenomics/search?q=" + encodeURIComponent(query));
    if (!r.ok) {
      var err = await r.json().catch(function () { return {}; });
      throw new Error(err.error || "Search failed (status " + r.status + ")");
    }
    return await r.json();
  }

  async function fetchCoinData(id) {
    var r = await fetch("/api/tokenomics/coin/" + encodeURIComponent(id));
    if (!r.ok) throw new Error("Fetch failed: " + r.status);
    return await r.json();
  }

  /* ── Render: Search Panel (always visible) ── */

  function renderSearchResults(coins) {
    var wrap = document.getElementById("tk-search-results");
    if (!wrap) return;
    if (!coins || coins.length === 0) { wrap.innerHTML = '<div class="empty-state">No results found. Try a different name or use <strong>Show Manual Entry</strong> below to add it by hand.</div>'; return; }

    var html = '<div class="tk-candidates">';
    for (var i = 0; i < coins.length; i++) {
      var c = coins[i];
      html += '<div class="tk-candidate" role="button" tabindex="0" data-id="' + esc(c.id) + '">';
      if (c.thumb) html += '<img src="' + esc(c.thumb) + '" width="20" height="20" />';
      html += '<span class="tk-cand-name">' + esc(c.name) + '</span>';
      html += '<span class="tk-cand-sym">' + esc(c.symbol) + '</span>';
      if (c.marketCapRank) html += '<span class="tk-cand-rank">#' + c.marketCapRank + '</span>';
      html += '</div>';
    }
    html += '</div>';
    wrap.innerHTML = html;

    wrap.querySelectorAll(".tk-candidate").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = this.getAttribute("data-id");
        wrap.innerHTML = "";
        runAnalysis(id);
      });
    });
  }

  /* ── Core: Run Analysis ── */

  async function runAnalysis(coingeckoId) {
    showLoading(true);
    try {
      var data = await fetchCoinData(coingeckoId);
      applyManualOverrides(data);
      currentData = data;
      prefillManualFromData(data);
      currentMetrics = TokenomicsCalc.computeAll(data);
      currentUtility = TokenomicsCalc.computeUtilityScore(data.utility);
      currentScore = TokenomicsScore.computeScore(data, currentMetrics, currentUtility);
      renderAll();
    } catch (e) {
      alert("Analysis failed: " + e.message);
    }
    showLoading(false);
  }

  function runFromProfile(profile) {
    currentData = profile.data;
    currentMetrics = TokenomicsCalc.computeAll(profile.data);
    currentUtility = TokenomicsCalc.computeUtilityScore(profile.data.utility);
    currentScore = TokenomicsScore.computeScore(profile.data, currentMetrics, currentUtility);
    renderAll();
  }

  function manualSrc(val, field) {
    return {
      value: val != null && val !== "" ? val : null,
      source: "manual",
      sourceUrl: null,
      confidence: val != null && val !== "" ? "manual" : "none",
      fetchedAt: new Date().toISOString(),
      notes: field && (val == null || val === "") ? field + " not provided" : "Manually entered",
    };
  }

  function numVal(id) {
    var el = document.getElementById(id);
    if (!el || el.value === "") return null;
    var v = parseFloat(el.value);
    return isNaN(v) ? null : v;
  }

  function strVal(id) {
    var el = document.getElementById(id);
    return el && el.value.trim() ? el.value.trim() : null;
  }

  function buildManualData() {
    var name = strVal("tk-m-name");
    var ticker = strVal("tk-m-ticker");
    if (!name || !ticker) return null;

    var catEl = document.getElementById("tk-m-category");
    var cat = catEl ? catEl.value : "Other";
    var now = new Date().toISOString();

    var utilKeys = ["gas", "staking", "governance", "feeShare", "burn", "buyback", "collateral", "mandatoryUse", "validatorSecurity"];
    var utility = {};
    for (var j = 0; j < utilKeys.length; j++) {
      var cb = document.getElementById("tk-u-" + utilKeys[j]);
      utility[utilKeys[j]] = cb ? cb.checked : false;
    }

    var maxS = numVal("tk-m-max");
    var totalS = numVal("tk-m-total");

    return {
      identity: {
        coingeckoId: "manual-" + ticker.toLowerCase().replace(/[^a-z0-9]/g, ""),
        name: name,
        symbol: ticker.toUpperCase(),
        categories: [cat],
        homepage: strVal("tk-m-website"),
        docsUrl: strVal("tk-m-docs"),
        tokenomicsUrl: strVal("tk-m-tokenomics"),
        explorerUrl: null,
        imageThumb: null,
        genesisDate: null,
      },
      market: {
        price: manualSrc(numVal("tk-m-price"), "price"),
        marketCap: manualSrc(numVal("tk-m-mcap"), "market_cap"),
        fdv: manualSrc(numVal("tk-m-fdv"), "fdv"),
        circulatingSupply: manualSrc(numVal("tk-m-circ"), "circulating_supply"),
        totalSupply: manualSrc(totalS, "total_supply"),
        maxSupply: manualSrc(maxS, "max_supply"),
        volume24h: manualSrc(numVal("tk-m-vol"), "volume_24h"),
        ath: manualSrc(null, "ath"),
        athDate: manualSrc(null, "ath_date"),
        athMarketCap: manualSrc(null, "ath_market_cap"),
        priceChange24h: manualSrc(null, "price_change_24h"),
        priceChange7d: manualSrc(null, "price_change_7d"),
        priceChange30d: manualSrc(null, "price_change_30d"),
      },
      allocations: {
        teamPct: manualSrc(numVal("tk-m-team"), "team_allocation"),
        investorPct: manualSrc(numVal("tk-m-investor"), "investor_allocation"),
        foundationPct: manualSrc(numVal("tk-m-foundation"), "foundation_allocation"),
        communityPct: manualSrc(numVal("tk-m-community"), "community_allocation"),
        airdropPct: manualSrc(numVal("tk-m-airdrop"), "airdrop_allocation"),
      },
      unlocks: {
        nextUnlockAmount: manualSrc(null, "next_unlock_amount"),
        nextUnlockDate: manualSrc(null, "next_unlock_date"),
        tokens12mEstimate: manualSrc(numVal("tk-m-unlock12m"), "12m_unlock_estimate"),
      },
      fundamentals: {
        tvl: manualSrc(numVal("tk-m-tvl"), "tvl"),
        protocolFees: manualSrc(null, "protocol_fees"),
        revenue: manualSrc(null, "revenue"),
      },
      utility: utility,
      supplyType: maxS != null ? "capped" : (totalS != null ? "dynamic" : "unknown"),
    };
  }

  function prefillManualFromData(data) {
    if (!data) return;
    var id = data.identity;
    var m = data.market;
    var setVal = function (elId, val) { var el = document.getElementById(elId); if (el && val != null) el.value = val; };

    setVal("tk-m-name", id.name);
    setVal("tk-m-ticker", id.symbol);
    setVal("tk-m-website", id.homepage);
    setVal("tk-m-docs", id.docsUrl);
    setVal("tk-m-tokenomics", id.tokenomicsUrl);

    if (m.price && m.price.value != null) setVal("tk-m-price", m.price.value);
    if (m.marketCap && m.marketCap.value != null) setVal("tk-m-mcap", m.marketCap.value);
    if (m.fdv && m.fdv.value != null) setVal("tk-m-fdv", m.fdv.value);
    if (m.circulatingSupply && m.circulatingSupply.value != null) setVal("tk-m-circ", m.circulatingSupply.value);
    if (m.totalSupply && m.totalSupply.value != null) setVal("tk-m-total", m.totalSupply.value);
    if (m.maxSupply && m.maxSupply.value != null) setVal("tk-m-max", m.maxSupply.value);
    if (m.volume24h && m.volume24h.value != null) setVal("tk-m-vol", m.volume24h.value);

    var fTvl = data.fundamentals && data.fundamentals.tvl;
    if (fTvl && fTvl.value != null) setVal("tk-m-tvl", fTvl.value);
  }

  function applyManualOverrides(data) {
    var fields = [
      { el: "tk-m-team", path: "allocations.teamPct" },
      { el: "tk-m-investor", path: "allocations.investorPct" },
      { el: "tk-m-foundation", path: "allocations.foundationPct" },
      { el: "tk-m-community", path: "allocations.communityPct" },
      { el: "tk-m-airdrop", path: "allocations.airdropPct" },
      { el: "tk-m-unlock12m", path: "unlocks.tokens12mEstimate" },
      { el: "tk-m-tvl", path: "fundamentals.tvl" },
    ];
    for (var i = 0; i < fields.length; i++) {
      var el = document.getElementById(fields[i].el);
      if (el && el.value !== "") {
        var val = parseFloat(el.value);
        if (!isNaN(val)) {
          var parts = fields[i].path.split(".");
          data[parts[0]][parts[1]] = { value: val, source: "manual", sourceUrl: null, confidence: "manual", fetchedAt: new Date().toISOString(), notes: "Manually entered" };
        }
      }
    }

    var utilKeys = ["gas", "staking", "governance", "feeShare", "burn", "buyback", "collateral", "mandatoryUse", "validatorSecurity"];
    for (var j = 0; j < utilKeys.length; j++) {
      var cb = document.getElementById("tk-u-" + utilKeys[j]);
      if (cb) data.utility[utilKeys[j]] = cb.checked;
    }

    var docsEl = document.getElementById("tk-m-docs");
    if (docsEl && docsEl.value.trim()) data.identity.docsUrl = docsEl.value.trim();
    var tokEl = document.getElementById("tk-m-tokenomics");
    if (tokEl && tokEl.value.trim()) data.identity.tokenomicsUrl = tokEl.value.trim();
  }

  function showLoading(on) {
    var el = document.getElementById("tk-loading");
    if (el) el.style.display = on ? "" : "none";
  }

  /* ── Render All 8 Panels ── */

  function renderAll() {
    if (!currentData) return;
    document.getElementById("tk-results").style.display = "";
    renderHeader();
    renderRawCards();
    renderMetricsTable();
    renderRiskIndicators();
    renderScorePanel();
    renderSummary();
    renderSourceAudit();
  }

  /* Panel 2: Header */
  function renderHeader() {
    var d = currentData.identity;
    var el = document.getElementById("tk-header-content");
    if (!el) return;

    var cats = (d.categories || []).filter(Boolean).slice(0, 3);
    var catHtml = cats.map(function (c) { return '<span class="tk-tag">' + esc(c) + '</span>'; }).join(" ");

    el.innerHTML =
      '<div class="tk-header-left">' +
        (d.imageThumb ? '<img src="' + esc(d.imageThumb) + '" width="36" height="36" class="tk-logo" /> ' : '') +
        '<div>' +
          '<div class="tk-hdr-name">' + esc(d.name) + ' <span class="tk-hdr-sym">' + esc(d.symbol) + '</span></div>' +
          '<div class="tk-hdr-cats">' + catHtml + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tk-header-right">' +
        (d.homepage ? '<a href="' + esc(d.homepage) + '" target="_blank" class="btn-secondary btn-sm">Website</a> ' : '') +
        '<span class="tk-src tk-src-' + (currentScore.confidence >= 60 ? 'high' : 'low') + '">Confidence: ' + currentScore.confidence + '%</span>' +
      '</div>';
  }

  /* Panel 3: Raw Data Cards */
  function renderRawCards() {
    var el = document.getElementById("tk-raw-cards");
    if (!el) return;
    var m = currentData.market;
    var cards = [
      { label: "Price", val: fmtPrice(TokenomicsCalc.v(m.price)), src: m.price },
      { label: "Market Cap", val: fmtNum(TokenomicsCalc.v(m.marketCap)), src: m.marketCap },
      { label: "FDV", val: fmtNum(TokenomicsCalc.v(m.fdv)), src: m.fdv },
      { label: "Circ. Supply", val: fmtRaw(TokenomicsCalc.v(m.circulatingSupply)), src: m.circulatingSupply },
      { label: "Max Supply", val: fmtRaw(TokenomicsCalc.v(m.maxSupply)), src: m.maxSupply },
      { label: "24h Volume", val: fmtNum(TokenomicsCalc.v(m.volume24h)), src: m.volume24h },
      { label: "TVL", val: fmtNum(TokenomicsCalc.v(currentData.fundamentals.tvl)), src: currentData.fundamentals.tvl },
    ];

    var html = '';
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      html += '<div class="metric-box">' +
        '<div class="metric-label">' + c.label + '</div>' +
        '<div class="metric-value">' + c.val + '</div>' +
        '<div>' + srcBadge(c.src) + '</div>' +
      '</div>';
    }
    el.innerHTML = html;
  }

  /* Panel 4: Calculated Metrics Table */
  function renderMetricsTable() {
    var tbody = document.getElementById("tk-metrics-tbody");
    if (!tbody) return;

    var html = "";
    for (var i = 0; i < currentMetrics.length; i++) {
      var m = currentMetrics[i];
      var sig = TokenomicsScore.getSignal(m.id, m.value);
      html += '<tr>' +
        '<td>' + dot(sig.color) + ' ' + esc(m.name) + '</td>' +
        '<td class="tk-formula">' + esc(m.formula) + '</td>' +
        '<td class="num">' + formatMetricValue(m) + '</td>' +
        '<td>' + dot(sig.color) + ' ' + esc(sig.color) + '</td>' +
        '<td class="tk-interp">' + esc(sig.text) + '</td>' +
        '<td>' + (m.computable ? '<span class="tk-src tk-src-high">' + m.confidence + '</span>' : '<span class="tk-src tk-src-none">N/A</span>') + '</td>' +
      '</tr>';
    }
    tbody.innerHTML = html;
  }

  /* Panel 5: Risk Indicators */
  function renderRiskIndicators() {
    var el = document.getElementById("tk-risk-bars");
    if (!el) return;

    var indicators = [
      { id: "floatRatio", label: "Low Float Risk" },
      { id: "fdvOverhang", label: "Dilution Overhang" },
      { id: "dilution12m", label: "Unlock Pressure" },
      { id: "liquidityRatio", label: "Liquidity Health" },
      { id: "insiderConcentration", label: "Insider Concentration" },
      { id: "mcToTvl", label: "Valuation Sanity" },
    ];

    var utilSig = currentUtility.score >= 60 ? "green" : (currentUtility.score >= 30 ? "yellow" : "red");
    var html = '';
    for (var i = 0; i < indicators.length; i++) {
      var ind = indicators[i];
      var m = null;
      for (var j = 0; j < currentMetrics.length; j++) {
        if (currentMetrics[j].id === ind.id) { m = currentMetrics[j]; break; }
      }
      var sig = TokenomicsScore.getSignal(ind.id, m ? m.value : null);
      html += '<div class="tk-risk-item">' +
        '<div class="tk-risk-label">' + esc(ind.label) + '</div>' +
        '<div class="tk-risk-bar"><div class="tk-risk-fill tk-fill-' + sig.color + '"></div></div>' +
        '<div class="tk-risk-status">' + dot(sig.color) + '</div>' +
      '</div>';
    }
    html += '<div class="tk-risk-item">' +
      '<div class="tk-risk-label">Token Utility</div>' +
      '<div class="tk-risk-bar"><div class="tk-risk-fill tk-fill-' + utilSig + '" style="width:' + currentUtility.score + '%"></div></div>' +
      '<div class="tk-risk-status">' + dot(utilSig) + '</div>' +
    '</div>';
    el.innerHTML = html;
  }

  /* Panel 6: Score Panel */
  function renderScorePanel() {
    var el = document.getElementById("tk-score-content");
    if (!el || !currentScore) return;

    var sc = currentScore;
    var vColor = sc.verdict.color;

    var barsHtml = '';
    for (var i = 0; i < sc.breakdown.length; i++) {
      var b = sc.breakdown[i];
      var w = b.raw != null ? b.raw : 0;
      barsHtml += '<div class="tk-dim-row">' +
        '<div class="tk-dim-label">' + esc(b.label) + ' <span class="tk-dim-weight">(' + b.weight + 'pts)</span></div>' +
        '<div class="tk-dim-bar"><div class="tk-dim-fill tk-fill-' + b.color + '" style="width:' + w + '%"></div></div>' +
        '<div class="tk-dim-val">' + (b.raw != null ? b.raw : "—") + '</div>' +
      '</div>';
    }

    el.innerHTML =
      '<div class="tk-score-top">' +
        '<div class="tk-score-circle tk-border-' + vColor + '"><span class="tk-score-num">' + sc.overall + '</span><span class="tk-score-of">/100</span></div>' +
        '<div class="tk-score-meta">' +
          '<div class="tk-verdict tk-verdict-' + vColor + '">' + esc(sc.verdict.label) + '</div>' +
          '<div class="tk-partnership">' + esc(sc.partnership) + '</div>' +
          '<div class="tk-confidence">Confidence: ' + sc.confidence + '%</div>' +
          '<div class="tk-signal-counts">' + dot("green") + sc.greens + '  ' + dot("yellow") + sc.yellows + '  ' + dot("red") + sc.reds + '  ' + dot("gray") + sc.grays + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tk-dim-breakdown">' + barsHtml + '</div>';
  }

  /* Panel 7: Executive Summary */
  function renderSummary() {
    var el = document.getElementById("tk-summary-text");
    if (!el) return;
    var text = TokenomicsScore.generateSummary(currentData, currentMetrics, currentScore, currentUtility);
    el.textContent = text;
  }

  /* Panel 8: Source Audit */
  function renderSourceAudit() {
    var tbody = document.getElementById("tk-audit-tbody");
    if (!tbody) return;

    var rows = [];
    function addSrc(label, ref) {
      if (!ref) return;
      rows.push({ field: label, value: ref.value != null ? String(ref.value) : "—", source: ref.source || "—", url: ref.sourceUrl || "", confidence: ref.confidence || "none", fetchedAt: ref.fetchedAt || "—", notes: ref.notes || "" });
    }

    var m = currentData.market;
    addSrc("Price", m.price);
    addSrc("Market Cap", m.marketCap);
    addSrc("FDV", m.fdv);
    addSrc("Circ. Supply", m.circulatingSupply);
    addSrc("Total Supply", m.totalSupply);
    addSrc("Max Supply", m.maxSupply);
    addSrc("24h Volume", m.volume24h);
    addSrc("ATH", m.ath);

    var a = currentData.allocations;
    addSrc("Team %", a.teamPct);
    addSrc("Investor %", a.investorPct);
    addSrc("Foundation %", a.foundationPct);
    addSrc("Community %", a.communityPct);
    addSrc("Airdrop %", a.airdropPct);

    addSrc("12M Unlock Est.", currentData.unlocks.tokens12mEstimate);
    addSrc("TVL", currentData.fundamentals.tvl);

    var html = "";
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var confCls = r.confidence === "high" ? "high" : (r.confidence === "manual" ? "high" : "none");
      html += '<tr>' +
        '<td>' + esc(r.field) + '</td>' +
        '<td class="num">' + esc(r.value) + '</td>' +
        '<td><span class="tk-src tk-src-' + confCls + '">' + esc(r.source) + '</span></td>' +
        '<td>' + (r.url ? '<a href="' + esc(r.url) + '" target="_blank">link</a>' : '—') + '</td>' +
        '<td><span class="tk-src tk-src-' + confCls + '">' + esc(r.confidence) + '</span></td>' +
        '<td>' + esc(r.fetchedAt ? r.fetchedAt.slice(0, 16) : "") + '</td>' +
      '</tr>';
    }
    tbody.innerHTML = html;
  }

  /* ── Save profile ── */

  async function saveCurrentProfile() {
    if (!currentData || !currentScore) { alert("Run an analysis first before saving."); return; }
    var id = currentData.identity.coingeckoId || ("manual-" + currentData.identity.symbol.toLowerCase());
    var existing = profiles.findIndex(function (p) { return p.id === id; });
    var entry = {
      id: id,
      name: currentData.identity.name,
      symbol: currentData.identity.symbol,
      data: currentData,
      score: currentScore.overall,
      verdict: currentScore.verdict.label,
      savedAt: new Date().toISOString(),
    };
    if (existing >= 0) profiles[existing] = entry;
    else profiles.push(entry);
    await saveProfiles();
    populateLoadSelector();
  }

  function populateLoadSelector() {
    var sel = document.getElementById("tk-load-profile");
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    for (var i = 0; i < profiles.length; i++) {
      var p = profiles[i];
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name + " (" + p.symbol + ") — " + p.score + "/100";
      sel.appendChild(opt);
    }
  }

  /* ── Event Setup ── */

  function setup() {
    var searchBtn = document.getElementById("tk-search-btn");
    var searchInput = document.getElementById("tk-search-input");

    if (searchBtn) searchBtn.addEventListener("click", async function () {
      var q = searchInput.value.trim();
      if (!q) return;
      searchBtn.disabled = true;
      searchBtn.textContent = "Searching...";
      try {
        var coins = await searchCoins(q);
        renderSearchResults(coins);
      } catch (e) {
        var wrap = document.getElementById("tk-search-results");
        if (wrap) wrap.innerHTML = '<div class="empty-state" style="color:var(--red)">Search error: ' + esc(e.message) + '. Use <strong>Show Manual Entry</strong> to add manually.</div>';
      }
      searchBtn.disabled = false;
      searchBtn.textContent = "Search";
    });

    if (searchInput) searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); searchBtn.click(); }
    });

    var loadSel = document.getElementById("tk-load-profile");
    if (loadSel) loadSel.addEventListener("change", function () {
      var id = this.value;
      if (!id) return;
      var profile = profiles.find(function (p) { return p.id === id; });
      if (profile) runFromProfile(profile);
    });

    var saveBtn = document.getElementById("tk-save-btn");
    if (saveBtn) saveBtn.addEventListener("click", function () { saveCurrentProfile(); });

    var toggleManual = document.getElementById("tk-toggle-manual");
    var manualPanel = document.getElementById("tk-manual-panel");
    if (toggleManual && manualPanel) {
      toggleManual.addEventListener("click", function () {
        var vis = manualPanel.style.display === "none";
        manualPanel.style.display = vis ? "" : "none";
        toggleManual.textContent = vis ? "Hide Manual Entry" : "Show Manual Entry";
      });
    }

    var rerunBtn = document.getElementById("tk-rerun-btn");
    if (rerunBtn) rerunBtn.addEventListener("click", function () {
      if (currentData) {
        applyManualOverrides(currentData);
        currentMetrics = TokenomicsCalc.computeAll(currentData);
        currentUtility = TokenomicsCalc.computeUtilityScore(currentData.utility);
        currentScore = TokenomicsScore.computeScore(currentData, currentMetrics, currentUtility);
        renderAll();
      }
    });

    var manualAnalyzeBtn = document.getElementById("tk-manual-analyze-btn");
    if (manualAnalyzeBtn) manualAnalyzeBtn.addEventListener("click", function () {
      var data = buildManualData();
      if (!data) {
        alert("Please fill in at least Protocol Name and Ticker.");
        return;
      }
      currentData = data;
      currentMetrics = TokenomicsCalc.computeAll(data);
      currentUtility = TokenomicsCalc.computeUtilityScore(data.utility);
      currentScore = TokenomicsScore.computeScore(data, currentMetrics, currentUtility);
      renderAll();
    });
  }

  /* ── Init ── */

  async function init() {
    await loadProfiles();
    setup();
    populateLoadSelector();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
