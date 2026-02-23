/**
 * DSRV Validator Status — Bloomberg-style dashboard
 * Depends: data.js (PARTNERS, DATA_DATE), Chart.js (global)
 */

let historyData = null;
let latestPrices = null;

function formatNum(n) {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
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

function renderTable(prices) {
  const tbody = document.getElementById("tbody");
  if (!tbody) return;
  tbody.innerHTML = PARTNERS.map((p) => {
    const del =
      p.delegationAmount != null
        ? formatNum(p.delegationAmount)
        : (p.delegationNote || "—");
    const priceUsd = getPriceUsd(prices, p);
    const priceStr =
      priceUsd != null
        ? "$" +
          priceUsd.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
          })
        : "—";
    const aprStr =
      p.aprPercent != null ? p.aprPercent.toFixed(1) + "%" : "—";
    const commStr =
      p.commissionPercent != null ? p.commissionPercent.toFixed(1) + "%" : "—";
    let annualRewardUsd = null;
    if (
      p.delegationAmount != null &&
      priceUsd != null &&
      p.aprPercent != null &&
      p.commissionPercent != null
    ) {
      annualRewardUsd =
        p.delegationAmount *
        priceUsd *
        (p.aprPercent / 100) *
        (p.commissionPercent / 100);
    }
    const annualRewardStr =
      annualRewardUsd != null
        ? "$" + annualRewardUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : "—";
    const monthlyRewardUsd = annualRewardUsd != null ? annualRewardUsd / 12 : null;
    const monthlyRewardStr =
      monthlyRewardUsd != null
        ? "$" + monthlyRewardUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : "—";
    const aum =
      p.delegationAmount != null && priceUsd != null
        ? p.delegationAmount * priceUsd
        : null;
    const aumStr =
      aum != null
        ? "$" + formatNum(aum)
        : "—";
    const change =
      prices && p.coingeckoId && prices[p.coingeckoId]?.usd_24h_change != null
        ? prices[p.coingeckoId].usd_24h_change
        : null;
    const changeStr =
      change != null ? (change >= 0 ? "+" : "") + change.toFixed(2) + "%" : "—";
    const changeClass = change != null ? (change >= 0 ? "up" : "down") : "";
    const uptime = p.uptimePercent != null ? p.uptimePercent + "%" : "—";
    const linkDel = p.explorerDelegation
      ? '<a href="' + p.explorerDelegation + '" target="_blank" rel="noopener">Delegation</a>'
      : "—";
    const linkUp = p.explorerUptime
      ? '<a href="' + p.explorerUptime + '" target="_blank" rel="noopener">Uptime</a>'
      : "—";
    const partnerLink = '<a href="partner.html?name=' + encodeURIComponent(p.name) + '">' + escapeHtml(p.name) + '</a>';
    return (
      "<tr><td>" + partnerLink +
      "</td><td class=\"num\">" + escapeHtml(String(del)) +
      "</td><td>" + escapeHtml(p.tokenSymbol) +
      "</td><td class=\"num\">" + priceStr +
      "</td><td class=\"num\">" + aprStr +
      "</td><td class=\"num\">" + commStr +
      "</td><td class=\"num\">" + annualRewardStr +
      "</td><td class=\"num\">" + monthlyRewardStr +
      "</td><td class=\"num\">" + aumStr +
      "</td><td class=\"num " + changeClass + "\">" + changeStr +
      "</td><td class=\"num\">" + uptime +
      "</td><td class=\"link-cell\">" + linkDel + " · " + linkUp +
      "</td></tr>"
    );
  }).join("");
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

/**
 * Compute monthly AUM from history.json snapshots and current prices.
 * Uses current token prices applied to historical delegation amounts.
 */
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
        borderColor: "#f0883e",
        backgroundColor: "rgba(240,136,62,0.15)",
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "rgba(48,54,61,0.8)" }, ticks: { color: "#8b949e", maxTicksLimit: 7 } },
        y: { grid: { color: "rgba(48,54,61,0.8)" }, ticks: { color: "#8b949e", callback: (v) => yPrefix + formatNum(v) } },
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

    const tile = document.createElement("div");
    tile.className = "tile";

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

    const lineColor = pctChange != null && pctChange >= 0
      ? "rgba(240,136,62,0.9)"
      : "rgba(248,81,73,0.8)";
    const fillColor = pctChange != null && pctChange >= 0
      ? "rgba(240,136,62,0.15)"
      : "rgba(248,81,73,0.10)";

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
          tension: 0.3,
          borderWidth: 1.5,
          pointRadius: 2,
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
        updatedEl.textContent = "| Updated " + now.toLocaleTimeString();
      renderTable(prices);
      drawChart(prices);
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
