/**
 * Simulation — Validator Revenue Calculator
 * Formula: ANNUAL REV = DELEGATION x APR% x COMMISSION% x TOKEN PRICE
 */
(function () {
  var simPrices = null;
  var infraCosts = [];

  function fmtUsd(n) {
    if (n == null || isNaN(n)) return "—";
    var abs = Math.abs(n), sign = n < 0 ? "-" : "";
    if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
    return sign + "$" + abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtKrw(n) {
    if (n == null || isNaN(n)) return "—";
    var abs = Math.abs(n), sign = n < 0 ? "-" : "";
    if (abs >= 1e8) return sign + "₩" + (abs / 1e8).toFixed(2) + "억";
    return sign + "₩" + Math.round(abs).toLocaleString();
  }

  function fmtTokens(n) {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtPct(n) { return (n == null || isNaN(n)) ? "—" : n.toFixed(2) + "%"; }

  function fmtPrice(n) {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1) return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return "$" + parseFloat(n.toFixed(8));
  }

  function escHtml(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  function getVal(id) {
    var v = document.getElementById(id) ? document.getElementById(id).value : null;
    return (v === "" || v == null) ? null : Number(v);
  }

  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

  function setColor(id, value) {
    var el = document.getElementById(id); if (!el) return;
    el.style.color = (value != null && !isNaN(value)) ? (value >= 0 ? "var(--green)" : "var(--red)") : "";
  }

  function getOpCost() {
    var override = getVal("sim-op-cost");
    if (override != null) return override;
    var chainName = ((document.getElementById("sim-name") ? document.getElementById("sim-name").value : "") || "").toLowerCase().trim();
    if (!chainName || !infraCosts.length) return null;
    var match = null;
    for (var i = 0; i < infraCosts.length; i++) {
      var c = infraCosts[i];
      var cn = (c.chainName || "").toLowerCase();
      if (cn.includes(chainName) || chainName.includes(cn)) { match = c; break; }
    }
    return match ? match.monthlyCostUsd : null;
  }

  async function fetchTokenPrice(cgId) {
    if (!cgId) return { usd: null, krw: null };
    try {
      var r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=" + encodeURIComponent(cgId) + "&vs_currencies=usd,krw");
      var data = await r.json();
      return { usd: data[cgId] ? data[cgId].usd : null, krw: data[cgId] ? data[cgId].krw : null };
    } catch (e) { return { usd: null, krw: null }; }
  }

  async function fetchKrwRate() {
    try {
      var r = await fetch("https://open.er-api.com/v6/latest/USD");
      var data = await r.json();
      return data && data.rates ? data.rates.KRW : null;
    } catch (e) { return null; }
  }

  function calculate() {
    var price      = getVal("sim-price");
    var krwRate    = getVal("sim-krw-rate");
    var selfStake  = getVal("sim-self-stake");
    var deleg      = getVal("sim-delegation");
    var apr        = getVal("sim-apr");
    var comm       = getVal("sim-commission");
    var opMonthly  = getOpCost();
    var opAnnual   = opMonthly != null ? opMonthly * 12 : null;
    var payMonthly = getVal("sim-op-payment");
    var payAnnual  = payMonthly != null ? payMonthly * 12 : null;
    var simName    = (document.getElementById("sim-name") ? document.getElementById("sim-name").value.trim() : "") || "Simulated";

    var opEl = document.getElementById("sim-op-cost");
    if (opEl && !opEl.value && opMonthly != null) opEl.placeholder = "Auto: $" + opMonthly + "/mo";

    function annualRev(d) {
      if (d == null || price == null || apr == null || comm == null) return null;
      return d * price * (apr / 100) * (comm / 100);
    }

    var selfRev = annualRev(selfStake);
    var delRev  = annualRev(deleg);
    var selfRevKrw = (selfRev != null && krwRate != null) ? selfRev * krwRate : null;
    var delRevKrw  = (delRev  != null && krwRate != null) ? delRev  * krwRate : null;
    var selfNet = (selfRev != null && opAnnual != null) ? selfRev - opAnnual : null;
    var delNet  = (delRev  != null && opAnnual != null) ? delRev  - opAnnual : null;
    var selfAum = (selfStake != null && price != null) ? selfStake * price : null;
    var delAum  = (deleg    != null && price != null) ? deleg    * price : null;
    var selfMo  = selfRev != null ? selfRev / 12 : null;
    var delMo   = delRev  != null ? delRev  / 12 : null;
    var selfMoNet = (selfMo != null && opMonthly != null) ? selfMo - opMonthly : null;
    var delMoNet  = (delMo  != null && opMonthly != null) ? delMo  - opMonthly : null;
    var selfStakeKrw = (selfAum != null && krwRate != null) ? selfAum * krwRate : null;
    var delStakeKrw  = (delAum  != null && krwRate != null) ? delAum  * krwRate : null;
    var addToken = (selfStake != null && deleg != null) ? deleg - selfStake : null;
    var addRev   = (selfRev != null && delRev != null) ? delRev - selfRev : null;
    var addRevKrw = (addRev != null && krwRate != null) ? addRev * krwRate : null;
    var addAum   = (selfAum != null && delAum != null) ? delAum - selfAum : null;

    setText("sc-self-deleg", fmtTokens(selfStake));
    setText("sc-del-deleg",  fmtTokens(deleg));
    setText("sc-self-apr",   fmtPct(apr));
    setText("sc-del-apr",    fmtPct(apr));
    setText("sc-self-comm",  fmtPct(comm));
    setText("sc-del-comm",   fmtPct(comm));
    setText("sc-self-price", fmtPrice(price));
    setText("sc-del-price",  fmtPrice(price));
    setText("sc-self-rev-usd", fmtUsd(selfRev));
    setText("sc-del-rev-usd",  fmtUsd(delRev));
    setText("sc-self-rev-krw", fmtKrw(selfRevKrw));
    setText("sc-del-rev-krw",  fmtKrw(delRevKrw));
    setText("sc-self-net", selfNet != null ? fmtUsd(selfNet) : "—");
    setText("sc-del-net",  delNet  != null ? fmtUsd(delNet)  : "—");
    setColor("sc-self-net", selfNet); setColor("sc-del-net", delNet);
    setText("sc-self-aum",     fmtUsd(selfAum)); setText("sc-del-aum",     fmtUsd(delAum));
    setText("sc-self-mo-usd",  fmtUsd(selfMo));  setText("sc-del-mo-usd",  fmtUsd(delMo));
    setText("sc-self-mo-net",  selfMoNet != null ? fmtUsd(selfMoNet) : "—");
    setText("sc-del-mo-net",   delMoNet  != null ? fmtUsd(delMoNet)  : "—");
    setColor("sc-self-mo-net", selfMoNet); setColor("sc-del-mo-net", delMoNet);
    setText("sc-self-stake-usd", fmtUsd(selfAum)); setText("sc-del-stake-usd", fmtUsd(delAum));
    setText("sc-self-stake-krw", fmtKrw(selfStakeKrw)); setText("sc-del-stake-krw", fmtKrw(delStakeKrw));

    setText("sc-add-token",   fmtTokens(addToken));
    setText("sc-add-rev-usd", fmtUsd(addRev));
    setText("sc-add-rev-krw", fmtKrw(addRevKrw));
    setText("sc-add-aum",     fmtUsd(addAum));

    var opAEl = document.getElementById("sc-op-annual");
    var opMEl = document.getElementById("sc-op-monthly");
    if (opAEl) { opAEl.textContent = opAnnual != null ? fmtUsd(opAnnual) : "—"; opAEl.style.color = opAnnual != null ? "var(--red)" : ""; }
    if (opMEl) { opMEl.textContent = opMonthly != null ? fmtUsd(opMonthly) : "—"; opMEl.style.color = opMonthly != null ? "var(--red)" : ""; }
    var pyAEl = document.getElementById("sc-pay-annual");
    var pyMEl = document.getElementById("sc-pay-monthly");
    if (pyAEl) { pyAEl.textContent = payAnnual != null ? fmtUsd(payAnnual) : "—"; pyAEl.style.color = "var(--green)"; }
    if (pyMEl) { pyMEl.textContent = payMonthly != null ? fmtUsd(payMonthly) : "—"; pyMEl.style.color = "var(--green)"; }

    var yearsSelf = (selfAum != null && selfNet != null && selfNet > 0) ? selfAum / selfNet : null;
    var yearsDel  = (delAum  != null && delNet  != null && delNet  > 0) ? delAum  / delNet  : null;
    setText("sc-years-self", yearsSelf != null ? yearsSelf.toFixed(2) + " yrs" : (selfNet != null && selfNet <= 0 ? "N/A (negative net)" : "—"));
    setText("sc-years-del",  yearsDel  != null ? yearsDel.toFixed(2)  + " yrs" : (delNet  != null && delNet  <= 0 ? "N/A (negative net)" : "—"));
    setText("sc-stakein-self-krw", fmtKrw(selfStakeKrw));
    setText("sc-stakein-del-krw",  fmtKrw(delStakeKrw));

    document.getElementById("sim-results-panel").style.display = "";
    document.getElementById("sim-additional-panel").style.display = addToken != null ? "" : "none";
    document.getElementById("sim-opex-panel").style.display = "";
    document.getElementById("sim-projection-panel").style.display = "";

    updateProjection(deleg, apr, comm, opMonthly, krwRate);
    renderBep(deleg, price, apr, comm, opAnnual);
    renderRanking(delRev, delAum, simName);
  }

  function updateProjection(deleg, apr, comm, opMonthly, krwRate) {
    var startYear = parseInt(document.getElementById("sim-start-year") ? document.getElementById("sim-start-year").value : "2025") || 2025;
    for (var i = 0; i < 3; i++) {
      var yr = startYear + i;
      var head = document.getElementById("sim-yr-head-" + i);
      if (head) head.textContent = yr;
      var p = getVal("sim-yr-price-" + i);
      if (p == null || deleg == null || apr == null || comm == null) {
        setText("sim-yr-rev-" + i, "—"); setText("sim-yr-mo-" + i, "—");
        setText("sim-yr-net-" + i, "—"); setText("sim-yr-mo-net-" + i, "—");
        setText("sim-yr-rev-krw-" + i, "—"); continue;
      }
      var rev   = deleg * p * (apr / 100) * (comm / 100);
      var moRev = rev / 12;
      var net   = opMonthly != null ? rev - opMonthly * 12 : null;
      var moNet = opMonthly != null ? moRev - opMonthly : null;
      var revKrw = krwRate != null ? rev * krwRate : null;
      setText("sim-yr-rev-" + i,     fmtUsd(rev));
      setText("sim-yr-mo-" + i,      fmtUsd(moRev));
      setText("sim-yr-net-" + i,     net    != null ? fmtUsd(net)    : "—");
      setText("sim-yr-mo-net-" + i,  moNet  != null ? fmtUsd(moNet)  : "—");
      setText("sim-yr-rev-krw-" + i, revKrw != null ? fmtKrw(revKrw) : "—");
      setColor("sim-yr-net-" + i,    net);
      setColor("sim-yr-mo-net-" + i, moNet);
    }
  }

  function renderBep(deleg, price, apr, comm, opAnnual) {
    var panel = document.getElementById("sim-bep-panel");
    var content = document.getElementById("sim-bep-content");
    if (!panel || !content) return;
    if (deleg == null || price == null || apr == null || comm == null || opAnnual == null) { panel.style.display = "none"; return; }
    panel.style.display = "";
    var perToken   = price * (apr / 100) * (comm / 100);
    var bepDeleg   = perToken > 0 ? opAnnual / perToken : null;
    var t50kDeleg  = perToken > 0 ? (opAnnual + 50000) / perToken : null;
    var addForBep  = bepDeleg  != null ? Math.max(0, bepDeleg  - deleg) : null;
    var addFor50k  = t50kDeleg != null ? Math.max(0, t50kDeleg - deleg) : null;
    var currentNet = deleg * perToken - opAnnual;

    var html = '<div style="overflow-x:auto"><table class="sim-calc-table">';
    html += "<thead><tr><th>TARGET</th><th>DELEGATION REQUIRED</th><th>ADDITIONAL NEEDED</th></tr></thead><tbody>";
    html += "<tr><td>Break-Even Point (BEP)</td><td>" + (bepDeleg != null ? fmtTokens(bepDeleg) : "—") + "</td><td>" +
      (addForBep != null ? (addForBep > 0 ? '<span style="color:var(--red)">' + fmtTokens(addForBep) + "</span>" : '<span style="color:var(--green)">✓ Already achieved</span>') : "—") + "</td></tr>";
    html += "<tr><td>$50K Annual Net Rev</td><td>" + (t50kDeleg != null ? fmtTokens(t50kDeleg) : "—") + "</td><td>" +
      (addFor50k != null ? (addFor50k > 0 ? '<span style="color:var(--orange)">' + fmtTokens(addFor50k) + "</span>" : '<span style="color:var(--green)">✓ Already achieved</span>') : "—") + "</td></tr>";
    html += "</tbody></table></div>";
    if (currentNet < 0) {
      html += '<div class="sim-bep-alert">Current delegation yields <strong style="color:var(--red)">' + fmtUsd(currentNet) + '</strong> net annual revenue. Need <strong>' + fmtTokens(addForBep) + '</strong> more tokens delegated to break even.</div>';
    }
    content.innerHTML = html;
  }

  function populateSelector(prospects) {
    var sel = document.getElementById("sim-source"); if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    for (var i = 0; i < prospects.length; i++) {
      var p = prospects[i], opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name + (p.tokenSymbol ? " (" + p.tokenSymbol + ")" : "");
      opt._data = p; sel.appendChild(opt);
    }
  }

  function renderRanking(simAnnual, simAum, simName) {
    var tbody = document.getElementById("sim-rank-tbody"); if (!tbody) return;
    if (typeof PARTNERS === "undefined" || !simPrices) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading partner data...</td></tr>'; return;
    }
    var rows = [];
    for (var i = 0; i < PARTNERS.length; i++) {
      var p = PARTNERS[i];
      var priceUsd = (p.coingeckoId && simPrices[p.coingeckoId]) ? (simPrices[p.coingeckoId].usd || null) : null;
      var annual = null;
      if (p.monthlyRewardCC != null && priceUsd != null) annual = p.monthlyRewardCC * 12 * priceUsd;
      else if (p.delegationAmount != null && priceUsd != null && p.aprPercent != null && p.commissionPercent != null)
        annual = p.delegationAmount * priceUsd * (p.aprPercent / 100) * (p.commissionPercent / 100);
      rows.push({ name: p.name, annual: annual, aum: (p.delegationAmount != null && priceUsd != null) ? p.delegationAmount * priceUsd : null, isSim: false });
    }
    if (simAnnual != null) rows.push({ name: simName || "Simulated", annual: simAnnual, aum: simAum, isSim: true });
    rows.sort(function (a, b) {
      if (a.annual != null && b.annual != null) return b.annual - a.annual;
      if (a.annual != null) return -1; if (b.annual != null) return 1;
      return (b.aum || 0) - (a.aum || 0);
    });
    var html = "";
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      html += "<tr" + (r.isSim ? ' class="highlight-row"' : '') + ">" +
        "<td>" + (j + 1) + "</td><td>" + escHtml(r.name) + (r.isSim ? " ★" : "") + "</td>" +
        '<td class="num">' + (r.annual != null ? fmtUsd(r.annual) : "—") + "</td>" +
        '<td class="num">' + (r.aum    != null ? fmtUsd(r.aum)    : "—") + "</td></tr>";
    }
    tbody.innerHTML = html;
  }

  // ── Coin search dropdown ───────────────────────────────────────────────────
  var searchTimer = null;

  async function searchCoins(q) {
    // Try server proxy first
    try {
      var r = await fetch("/api/tokenomics/search?q=" + encodeURIComponent(q));
      if (r.ok) {
        var data = await r.json();
        if (Array.isArray(data) && data.length) return data;
      }
    } catch (e) { /* fall through */ }
    // Browser direct fallback
    try {
      var r2 = await fetch("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(q));
      var d2 = await r2.json();
      return (d2.coins || []).slice(0, 10).map(function (c) {
        return { id: c.id, name: c.name, symbol: (c.symbol || "").toUpperCase(), thumb: c.thumb };
      });
    } catch (e) { return []; }
  }

  function showDropdown(results) {
    var dd = document.getElementById("sim-search-dropdown");
    if (!dd) return;
    if (!results || !results.length) { dd.style.display = "none"; return; }
    var html = "";
    results.forEach(function (r) {
      html += '<div class="sim-dd-item" data-id="' + escHtml(r.id) + '" data-name="' + escHtml(r.name) + '" data-symbol="' + escHtml(r.symbol) + '">' +
        (r.thumb ? '<img src="' + escHtml(r.thumb) + '" />' : '<span class="sim-dd-noimg"></span>') +
        '<span class="sim-dd-name">' + escHtml(r.name) + '</span>' +
        '<span class="sim-dd-sym">' + escHtml(r.symbol) + '</span>' +
        '</div>';
    });
    dd.innerHTML = html;
    dd.style.display = "";
    dd.querySelectorAll(".sim-dd-item").forEach(function (item) {
      item.addEventListener("mousedown", function (e) {
        e.preventDefault();
        selectCoin(item.dataset.id, item.dataset.name, item.dataset.symbol);
      });
    });
  }

  function closeDropdown() {
    var dd = document.getElementById("sim-search-dropdown");
    if (dd) dd.style.display = "none";
  }

  async function selectCoin(id, name, symbol) {
    closeDropdown();
    var nameEl = document.getElementById("sim-name");
    var tokenEl = document.getElementById("sim-token");
    var cgEl = document.getElementById("sim-coingecko");
    var priceEl = document.getElementById("sim-price");
    if (nameEl)  nameEl.value  = name;
    if (tokenEl) tokenEl.value = symbol;
    if (cgEl)    cgEl.value    = id;
    if (priceEl) priceEl.placeholder = "Fetching…";
    var data = await fetchTokenPrice(id);
    if (data.usd != null) {
      if (priceEl) priceEl.value = data.usd;
      var krwEl = document.getElementById("sim-krw-rate");
      if (krwEl && !krwEl.value && data.krw && data.usd) krwEl.value = Math.round(data.krw / data.usd);
    }
    if (priceEl) priceEl.placeholder = "Auto-filled on select";
  }

  function setupSearch() {
    var nameEl = document.getElementById("sim-name");
    if (!nameEl) return;
    nameEl.addEventListener("input", function () {
      var q = this.value.trim();
      clearTimeout(searchTimer);
      if (q.length < 2) { closeDropdown(); return; }
      searchTimer = setTimeout(async function () {
        var results = await searchCoins(q);
        showDropdown(results);
      }, 350);
    });
    nameEl.addEventListener("blur", function () {
      setTimeout(closeDropdown, 150);
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".sim-search-wrap")) closeDropdown();
    });
  }

  function setup() {
    document.getElementById("btn-sim-calc") && document.getElementById("btn-sim-calc").addEventListener("click", calculate);
    setupSearch();

    document.getElementById("btn-fetch-krw") && document.getElementById("btn-fetch-krw").addEventListener("click", async function () {
      this.textContent = "..."; this.disabled = true;
      var rate = await fetchKrwRate();
      if (rate != null) document.getElementById("sim-krw-rate").value = Math.round(rate);
      else alert("Could not fetch USD/KRW rate.");
      this.textContent = "Auto"; this.disabled = false;
    });

    document.getElementById("sim-source") && document.getElementById("sim-source").addEventListener("change", async function () {
      var opt = this.options[this.selectedIndex]; if (!opt._data) return;
      var p = opt._data;
      var setV = function (id, v) { var el = document.getElementById(id); if (el && v != null) el.value = v; };
      setV("sim-name", p.name); setV("sim-token", p.tokenSymbol);
      setV("sim-coingecko", p.coingeckoId); setV("sim-apr", p.aprPercent);
      setV("sim-commission", p.expectedCommission);
      if (p.coingeckoId) {
        var data = await fetchTokenPrice(p.coingeckoId);
        if (data.usd != null) document.getElementById("sim-price").value = data.usd;
        var krwEl = document.getElementById("sim-krw-rate");
        if (krwEl && !krwEl.value && data.krw && data.usd) krwEl.value = Math.round(data.krw / data.usd);
      }
    });

    document.getElementById("btn-sim-reset") && document.getElementById("btn-sim-reset").addEventListener("click", function () {
      closeDropdown();
      var clearIds = ["sim-name","sim-token","sim-coingecko","sim-price","sim-krw-rate","sim-self-stake","sim-delegation","sim-op-cost","sim-op-payment","sim-selfstake-note"];
      for (var i = 0; i < clearIds.length; i++) { var el = document.getElementById(clearIds[i]); if (el) el.value = ""; }
      document.getElementById("sim-apr").value = "10";
      document.getElementById("sim-commission").value = "10";
      var hideIds = ["sim-results-panel","sim-additional-panel","sim-opex-panel","sim-projection-panel","sim-bep-panel"];
      for (var j = 0; j < hideIds.length; j++) { var el2 = document.getElementById(hideIds[j]); if (el2) el2.style.display = "none"; }
    });

    for (var i = 0; i < 3; i++) {
      (function (idx) {
        var el = document.getElementById("sim-yr-price-" + idx);
        if (el) el.addEventListener("input", function () {
          var d = getVal("sim-delegation"), a = getVal("sim-apr"), c = getVal("sim-commission");
          var op = getOpCost(), kr = getVal("sim-krw-rate");
          if (d && a && c) updateProjection(d, a, c, op, kr);
        });
      })(i);
    }
    var syEl = document.getElementById("sim-start-year");
    if (syEl) syEl.addEventListener("change", function () {
      var d = getVal("sim-delegation"), a = getVal("sim-apr"), c = getVal("sim-commission");
      var op = getOpCost(), kr = getVal("sim-krw-rate");
      if (d && a && c) updateProjection(d, a, c, op, kr);
    });
  }

  async function init() {
    try {
      var r = await fetch("/api/data/infra-costs.json");
      var data = await r.json();
      if (Array.isArray(data)) infraCosts = data;
    } catch (e) { infraCosts = []; }

    setup();

    try {
      var r2 = await fetch("/api/data/potential-partners.json");
      var prospects = await r2.json();
      populateSelector(Array.isArray(prospects) ? prospects : []);
    } catch (e) { populateSelector([]); }

    if (typeof PARTNERS !== "undefined") {
      var ids = [];
      for (var i = 0; i < PARTNERS.length; i++) { if (PARTNERS[i].coingeckoId && ids.indexOf(PARTNERS[i].coingeckoId) < 0) ids.push(PARTNERS[i].coingeckoId); }
      if (ids.length > 0) {
        try {
          var r3 = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") + "&vs_currencies=usd");
          simPrices = await r3.json();
        } catch (e) { simPrices = {}; }
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
