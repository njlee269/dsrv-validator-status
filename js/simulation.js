/**
 * Simulation page — revenue calculator + ranking among current partners
 */
(function () {
  let simPrices = null;

  function fmtNum(n) {
    if (n == null || isNaN(n)) return "—";
    if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtTokens(n) {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString();
  }

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  async function loadProspects() {
    try {
      const r = await fetch("/api/data/potential-partners.json");
      return await r.json();
    } catch { return []; }
  }

  function populateSelector(prospects) {
    const sel = document.getElementById("sim-source");
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    for (const p of prospects) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name + (p.tokenSymbol ? " (" + p.tokenSymbol + ")" : "");
      opt._data = p;
      sel.appendChild(opt);
    }
  }

  async function fetchPrice(coingeckoId) {
    if (!coingeckoId) return null;
    try {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=" + coingeckoId + "&vs_currencies=usd"
      );
      const data = await r.json();
      return data[coingeckoId]?.usd ?? null;
    } catch { return null; }
  }

  function getVal(id) {
    const v = document.getElementById(id)?.value;
    return v === "" || v == null ? null : Number(v);
  }

  function calculate() {
    const price = getVal("sim-price");
    const circSupply = getVal("sim-circ-supply");
    const stakingRatio = getVal("sim-staking-ratio");
    const dsrvShare = getVal("sim-dsrv-share");
    const apr = getVal("sim-apr");
    const commission = getVal("sim-commission");

    let totalStaked = null;
    let dsrvDelegation = null;
    let aum = null;
    let monthly = null;
    let annual = null;

    if (circSupply != null && stakingRatio != null) {
      totalStaked = circSupply * (stakingRatio / 100);
    }
    if (totalStaked != null && dsrvShare != null) {
      dsrvDelegation = totalStaked * (dsrvShare / 100);
    }
    if (dsrvDelegation != null && price != null) {
      aum = dsrvDelegation * price;
    }
    if (dsrvDelegation != null && price != null && apr != null && commission != null) {
      annual = dsrvDelegation * price * (apr / 100) * (commission / 100);
      monthly = annual / 12;
    }

    document.getElementById("sim-r-staked").textContent = fmtTokens(totalStaked);
    document.getElementById("sim-r-delegation").textContent = fmtTokens(dsrvDelegation);
    document.getElementById("sim-r-aum").textContent = fmtNum(aum);
    document.getElementById("sim-r-monthly").textContent = fmtNum(monthly);
    document.getElementById("sim-r-annual").textContent = fmtNum(annual);

    renderRanking(annual, aum);
  }

  function renderRanking(simAnnual, simAum) {
    const tbody = document.getElementById("sim-rank-tbody");
    if (!tbody) return;
    if (typeof PARTNERS === "undefined" || !simPrices) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading partner data...</td></tr>';
      return;
    }

    const rows = [];
    for (const p of PARTNERS) {
      const priceUsd = p.coingeckoId && simPrices[p.coingeckoId]
        ? (simPrices[p.coingeckoId].usd ?? null) : null;
      let annual = null;
      if (p.monthlyRewardCC != null && priceUsd != null) {
        annual = p.monthlyRewardCC * 12 * priceUsd;
      } else if (p.delegationAmount != null && priceUsd != null && p.aprPercent != null && p.commissionPercent != null) {
        annual = p.delegationAmount * priceUsd * (p.aprPercent / 100) * (p.commissionPercent / 100);
      }
      const aum = p.delegationAmount != null && priceUsd != null ? p.delegationAmount * priceUsd : null;
      rows.push({ name: p.name, annual, aum, isSim: false });
    }

    const simName = document.getElementById("sim-name")?.value.trim() || "Simulated";
    if (simAnnual != null) {
      rows.push({ name: simName, annual: simAnnual, aum: simAum, isSim: true });
    }

    rows.sort((a, b) => {
      if (a.annual != null && b.annual != null) return b.annual - a.annual;
      if (a.annual != null) return -1;
      if (b.annual != null) return 1;
      return (b.aum || 0) - (a.aum || 0);
    });

    let html = "";
    rows.forEach((r, i) => {
      const cls = r.isSim ? ' class="highlight-row"' : '';
      html += "<tr" + cls + ">" +
        "<td>" + (i + 1) + "</td>" +
        "<td>" + escHtml(r.name) + (r.isSim ? " *" : "") + "</td>" +
        '<td class="num">' + (r.annual != null ? fmtNum(r.annual) : "—") + "</td>" +
        '<td class="num">' + (r.aum != null ? fmtNum(r.aum) : "—") + "</td>" +
        "</tr>";
    });
    tbody.innerHTML = html;
  }

  function setup() {
    document.getElementById("sim-source")?.addEventListener("change", async function () {
      const opt = this.options[this.selectedIndex];
      if (!opt._data) return;
      const p = opt._data;
      document.getElementById("sim-name").value = p.name || "";
      document.getElementById("sim-token").value = p.tokenSymbol || "";
      document.getElementById("sim-coingecko").value = p.coingeckoId || "";
      document.getElementById("sim-fdv").value = p.fdv || "";
      document.getElementById("sim-circ-supply").value = p.circulatingSupply || "";
      document.getElementById("sim-total-supply").value = p.totalSupply || "";
      document.getElementById("sim-staking-ratio").value = p.stakingRatio ?? "50";
      document.getElementById("sim-apr").value = p.aprPercent ?? "";
      document.getElementById("sim-commission").value = p.expectedCommission ?? "";
      document.getElementById("sim-dsrv-share").value = "1";
      if (p.coingeckoId) {
        const price = await fetchPrice(p.coingeckoId);
        if (price != null) document.getElementById("sim-price").value = price;
      }
    });

    document.getElementById("btn-sim-calc")?.addEventListener("click", calculate);

    document.getElementById("btn-sim-reset")?.addEventListener("click", () => {
      document.getElementById("sim-source").selectedIndex = 0;
      ["sim-name", "sim-token", "sim-coingecko", "sim-price", "sim-fdv",
       "sim-circ-supply", "sim-total-supply"].forEach((id) => {
        document.getElementById(id).value = "";
      });
      document.getElementById("sim-staking-ratio").value = "50";
      document.getElementById("sim-dsrv-share").value = "1";
      document.getElementById("sim-apr").value = "10";
      document.getElementById("sim-commission").value = "10";
      ["sim-r-staked", "sim-r-delegation", "sim-r-aum", "sim-r-monthly", "sim-r-annual"].forEach((id) => {
        document.getElementById(id).textContent = "—";
      });
      document.getElementById("sim-rank-tbody").innerHTML = "";
    });
  }

  async function init() {
    setup();
    const prospects = await loadProspects();
    populateSelector(prospects);

    if (typeof PARTNERS !== "undefined") {
      const ids = [...new Set(PARTNERS.map((p) => p.coingeckoId).filter(Boolean))];
      if (ids.length > 0) {
        try {
          const r = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") + "&vs_currencies=usd"
          );
          simPrices = await r.json();
        } catch { simPrices = {}; }
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
