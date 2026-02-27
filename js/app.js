/**
 * DSRV Validator Status — Dashboard
 * Depends: data.js (PARTNERS, DATA_DATE), Chart.js (global)
 */

let historyData = null;
let latestPrices = null;

function formatNum(n) {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function getPriceUsd(prices, p) {
  if (!prices || !p.coingeckoId) return null;
  const price = prices[p.coingeckoId];
  return price != null ? (price.usd ?? price) : null;
}

function computeRow(p, prices) {
  const priceUsd = getPriceUsd(prices, p);
  const aum = (p.delegationAmount != null && priceUsd != null) ? p.delegationAmount * priceUsd : null;
  let annualRewardUsd = null;
  if (p.monthlyRewardCC != null && priceUsd != null) {
    annualRewardUsd = p.monthlyRewardCC * 12 * priceUsd;
  } else if (p.delegationAmount != null && priceUsd != null && p.aprPercent != null && p.commissionPercent != null) {
    annualRewardUsd = p.delegationAmount * priceUsd * (p.aprPercent / 100) * (p.commissionPercent / 100);
  }
  const monthlyRewardUsd = annualRewardUsd != null ? annualRewardUsd / 12 : null;
  const change = (prices && p.coingeckoId && prices[p.coingeckoId]?.usd_24h_change != null)
    ? prices[p.coingeckoId].usd_24h_change : null;
  return { priceUsd, aum, annualRewardUsd, monthlyRewardUsd, change };
}

function renderTable(prices) {
  const tbody = document.getElementById("tbody");
  if (!tbody) return;

  const active = PARTNERS.filter((p) => p.delegationAmount != null || p.delegationNote);

  const rows = active.map((p) => {
    const r = computeRow(p, prices);
    return { partner: p, ...r };
  });

  rows.sort((a, b) => {
    if (a.annualRewardUsd != null && b.annualRewardUsd != null)
      return b.annualRewardUsd - a.annualRewardUsd;
    if (a.annualRewardUsd != null) return -1;
    if (b.annualRewardUsd != null) return 1;
    const aumA = a.aum || 0, aumB = b.aum || 0;
    return aumB - aumA;
  });

  let html = "";
  let thresholdInserted = false;
  const THRESHOLD = 50000;

  for (const row of rows) {
    const p = row.partner;

    if (!thresholdInserted && row.annualRewardUsd != null && row.annualRewardUsd < THRESHOLD) {
      html += '<tr class="threshold-row"><td colspan="12"><span class="threshold-label">$50K annual threshold</span></td></tr>';
      thresholdInserted = true;
    }
    if (!thresholdInserted && row.annualRewardUsd == null) {
      html += '<tr class="threshold-row"><td colspan="12"><span class="threshold-label">$50K annual threshold</span></td></tr>';
      thresholdInserted = true;
    }

    const del = p.delegationAmount != null ? formatNum(p.delegationAmount) : (p.delegationNote || "—");
    const priceStr = row.priceUsd != null
      ? "$" + row.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
      : "—";
    const aprStr = p.aprPercent != null ? p.aprPercent.toFixed(1) + "%" : "—";
    const commStr = p.commissionPercent != null ? p.commissionPercent.toFixed(1) + "%" : "—";
    const annualStr = row.annualRewardUsd != null
      ? "$" + row.annualRewardUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "—";
    const monthlyStr = row.monthlyRewardUsd != null
      ? "$" + row.monthlyRewardUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "—";
    const aumStr = row.aum != null ? "$" + formatNum(row.aum) : "—";
    const changeStr = row.change != null ? (row.change >= 0 ? "+" : "") + row.change.toFixed(2) + "%" : "—";
    const changeClass = row.change != null ? (row.change >= 0 ? "up" : "down") : "";
    const uptime = p.uptimePercent != null ? p.uptimePercent + "%" : "—";
    const linkDel = p.explorerDelegation
      ? '<a href="' + p.explorerDelegation + '" target="_blank" rel="noopener">Delegation</a>' : "—";
    const linkUp = p.explorerUptime
      ? '<a href="' + p.explorerUptime + '" target="_blank" rel="noopener">Uptime</a>' : "—";
    const partnerLink = '<a href="partner.html?name=' + encodeURIComponent(p.name) + '">' + escapeHtml(p.name) + '</a>';

    html +=
      "<tr data-name=\"" + escapeHtml(p.name.toLowerCase()) + "\"><td>" + partnerLink +
      "</td><td class=\"num\">" + escapeHtml(String(del)) +
      "</td><td>" + escapeHtml(p.tokenSymbol) +
      "</td><td class=\"num\">" + priceStr +
      "</td><td class=\"num " + changeClass + "\">" + changeStr +
      "</td><td class=\"num\">" + aprStr +
      "</td><td class=\"num\">" + commStr +
      "</td><td class=\"num\">" + monthlyStr +
      "</td><td class=\"num\">" + annualStr +
      "</td><td class=\"num\">" + aumStr +
      "</td><td class=\"num\">" + uptime +
      "</td><td class=\"link-cell\">" + linkDel + " · " + linkUp +
      "</td></tr>";
  }

  tbody.innerHTML = html;
}

let chart = null;

function getTotalAum(prices) {
  let sum = 0;
  for (const p of PARTNERS) {
    const priceUsd = getPriceUsd(prices, p);
    if (p.delegationAmount != null && priceUsd != null)
      sum += p.delegationAmount * priceUsd;
  }
  return sum;
}

function drawChart(prices) {
  const ctx = document.getElementById("chart");
  if (!ctx || !window.Chart) return;

  let labels = [];
  let values = [];
  let chartLabel = "Total AUM (USD)";
  let yPrefix = "$";

  if (historyData && historyData.snapshots) {
    const priceMap = {};
    if (prices) {
      for (const p of PARTNERS) {
        if (p.coingeckoId && prices[p.coingeckoId])
          priceMap[p.name] = prices[p.coingeckoId].usd ?? prices[p.coingeckoId];
      }
    }
    const hasPrices = Object.keys(priceMap).length > 0;
    for (const snap of historyData.snapshots) {
      const d = new Date(snap.date);
      labels.push(d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
      let monthAum = 0;
      for (const [name, amount] of Object.entries(snap.delegations)) {
        if (amount != null) {
          if (hasPrices && priceMap[name] != null) {
            monthAum += amount * priceMap[name];
          } else if (!hasPrices) {
            monthAum += amount;
          }
        }
      }
      values.push(monthAum);
    }
    chartLabel = hasPrices ? "Total AUM (USD)" : "Total Delegation (tokens, prices loading…)";
    yPrefix = hasPrices ? "$" : "";
  } else {
    const totalAum = getTotalAum(prices);
    labels = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
    values = [0.82, 0.88, 0.91, 0.94, 0.97, 0.99, 1].map((f) => totalAum * f);
  }

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: chartLabel,
        data: values,
        borderColor: "#111111",
        backgroundColor: "rgba(17,17,17,0.06)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: "#111111",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        borderWidth: 2.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1d2939",
          titleColor: "#fff",
          bodyColor: "#fff",
          cornerRadius: 8,
          padding: 10,
          titleFont: { family: "'Source Code Pro', monospace" },
          bodyFont: { family: "'Source Code Pro', monospace" },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(0,0,0,0.04)" },
          ticks: { color: "#667085", font: { family: "'Source Code Pro', monospace", size: 11 } },
        },
        y: {
          grid: { color: "rgba(0,0,0,0.04)" },
          ticks: {
            color: "#667085",
            font: { family: "'Source Code Pro', monospace", size: 11 },
            callback: (v) => yPrefix + formatNum(v),
          },
        },
      },
    },
  });
}

/* ── Mini delegation tile grid ── */

let tileCharts = [];

function renderTiles() {
  const grid = document.getElementById("tile-grid");
  if (!grid || !historyData || !historyData.snapshots || !window.Chart) return;

  tileCharts.forEach((c) => c.destroy());
  tileCharts = [];
  grid.innerHTML = "";

  const snaps = historyData.snapshots;
  const lastSnap = snaps[snaps.length - 1];
  const prevSnap = snaps.length >= 2 ? snaps[snaps.length - 2] : null;

  for (const p of PARTNERS) {
    const curVal = lastSnap.delegations[p.name];
    if (curVal == null) continue;

    const prevVal = prevSnap ? prevSnap.delegations[p.name] : null;
    let pctChange = null;
    if (prevVal != null && prevVal > 0) {
      pctChange = ((curVal - prevVal) / prevVal) * 100;
    }

    const values = snaps.map((s) => s.delegations[p.name] ?? null);

    const priceUsd = getPriceUsd(latestPrices, p);
    const priceStr = priceUsd != null
      ? "$" + priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : "";

    const tile = document.createElement("a");
    tile.className = "tile";
    tile.href = "partner.html?name=" + encodeURIComponent(p.name);

    const header = document.createElement("div");
    header.className = "tile-header";
    const nameEl = document.createElement("span");
    nameEl.className = "tile-name";
    nameEl.textContent = p.name;
    const priceEl = document.createElement("span");
    priceEl.className = "tile-price";
    priceEl.textContent = priceStr;
    header.appendChild(nameEl);
    header.appendChild(priceEl);
    tile.appendChild(header);

    const chartDiv = document.createElement("div");
    chartDiv.className = "tile-chart";
    const canvas = document.createElement("canvas");
    chartDiv.appendChild(canvas);
    tile.appendChild(chartDiv);

    const footer = document.createElement("div");
    footer.className = "tile-footer";

    const changeEl = document.createElement("span");
    if (pctChange != null) {
      const isUp = pctChange >= 0;
      changeEl.className = "tile-change " + (isUp ? "up" : "down");
      changeEl.textContent = (isUp ? "+" : "") + pctChange.toFixed(2) + "%";
    } else {
      changeEl.className = "tile-change neutral";
      changeEl.textContent = "—";
    }
    footer.appendChild(changeEl);

    const tokenEl = document.createElement("span");
    tokenEl.className = "tile-token";
    tokenEl.textContent = p.tokenSymbol;
    footer.appendChild(tokenEl);

    tile.appendChild(footer);
    grid.appendChild(tile);

    const isUp = pctChange != null && pctChange >= 0;
    const lineColor = isUp ? "#12b76a" : "#f04438";
    const fillColor = isUp ? "rgba(18,183,106,0.12)" : "rgba(240,68,56,0.10)";

    const miniChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: snaps.map((s) => {
          const d = new Date(s.date);
          return d.toLocaleDateString("en-US", { month: "short" });
        }),
        datasets: [{
          data: values,
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
          tension: 0.4,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointBackgroundColor: lineColor,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        animation: false,
      },
    });
    tileCharts.push(miniChart);
  }
}

/* ── Search filter ── */

function setupSearch() {
  const input = document.getElementById("partner-search");
  if (!input) return;
  input.addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    const rows = document.querySelectorAll("#tbody tr");
    rows.forEach((row) => {
      if (row.classList.contains("threshold-row")) {
        row.style.display = q ? "none" : "";
        return;
      }
      const name = row.getAttribute("data-name") || "";
      row.style.display = name.includes(q) ? "" : "none";
    });
  });
}

/* ── Toggle delegation section ── */

function setupToggle() {
  const btn = document.getElementById("toggle-tiles");
  const wrapper = document.getElementById("tile-grid-wrapper");
  if (!btn || !wrapper) return;

  btn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    const isHidden = wrapper.classList.toggle("collapsed");
    this.textContent = isHidden ? "Show" : "Hide";
  });
}

const PRICE_REFRESH_MS = 5 * 60 * 1000;

function loadPrices() {
  const ids = [...new Set(PARTNERS.map((p) => p.coingeckoId).filter(Boolean))];
  const dataTimeEl = document.getElementById("data-time");
  const pricesEl = document.getElementById("prices-loading");
  const updatedEl = document.getElementById("prices-updated");

  if (dataTimeEl) dataTimeEl.textContent = DATA_DATE;

  if (ids.length === 0) {
    if (pricesEl) pricesEl.textContent = "—";
    if (updatedEl) updatedEl.textContent = "";
    renderTable(null);
    drawChart(null);
    return;
  }

  fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=" +
      ids.join(",") +
      "&vs_currencies=usd&include_24hr_change=true"
  )
    .then((r) => r.json())
    .then((prices) => {
      latestPrices = prices;
      if (pricesEl) pricesEl.textContent = "OK";
      const now = new Date();
      if (updatedEl)
        updatedEl.textContent = "· Updated " + now.toLocaleTimeString();
      renderTable(prices);
      drawChart(prices);
      renderTiles();
    })
    .catch(() => {
      if (pricesEl) pricesEl.textContent = "offline";
      if (updatedEl) updatedEl.textContent = "";
      renderTable(null);
      drawChart(null);
    });
}

function loadHistory() {
  return fetch("data/history.json")
    .then((r) => r.json())
    .then((data) => { historyData = data; })
    .catch(() => { historyData = null; });
}

function waitForChartJs() {
  return new Promise((resolve) => {
    if (window.Chart) return resolve();
    const t = setInterval(() => {
      if (window.Chart) { clearInterval(t); resolve(); }
    }, 50);
  });
}

function init() {
  renderTable(null);
  setupSearch();
  setupToggle();

  Promise.all([loadHistory(), waitForChartJs()])
    .then(() => {
      drawChart(null);
      renderTiles();
      loadPrices();
      setInterval(loadPrices, PRICE_REFRESH_MS);
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
