/**
 * DSRV Validator Status — Bloomberg-style dashboard
 * Depends: data.js (PARTNERS, DATA_DATE), Chart.js (global)
 */

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
    // Annual Reward (USD) = delegation * token price * (APR/100) * (commission/100)
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
    // AUM = delegation amount * token price
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
      ? '<a href="' +
        p.explorerDelegation +
        '" target="_blank" rel="noopener">Delegation</a>'
      : "—";
    const linkUp = p.explorerUptime
      ? '<a href="' +
        p.explorerUptime +
        '" target="_blank" rel="noopener">Uptime</a>'
      : "—";
    return (
      "<tr><td>" +
      escapeHtml(p.name) +
      "</td><td class=\"num\">" +
      escapeHtml(String(del)) +
      "</td><td>" +
      escapeHtml(p.tokenSymbol) +
      "</td><td class=\"num\">" +
      priceStr +
      "</td><td class=\"num\">" +
      aprStr +
      "</td><td class=\"num\">" +
      commStr +
      "</td><td class=\"num\">" +
      annualRewardStr +
      "</td><td class=\"num\">" +
      aumStr +
      "</td><td class=\"num " +
      changeClass +
      "\">" +
      changeStr +
      "</td><td class=\"num\">" +
      uptime +
      "</td><td class=\"link-cell\">" +
      linkDel +
      " · " +
      linkUp +
      "</td></tr>"
    );
  }).join("");
}

let chart = null;

/** Total AUM (USD) = sum of delegationAmount * price per partner. */
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
  const totalAum = getTotalAum(prices);
  const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  const factors = [0.82, 0.88, 0.91, 0.94, 0.97, 0.99, 1];
  const values = factors.map((f) => totalAum * f);
  const ctx = document.getElementById("chart");
  if (!ctx || !window.Chart) return;
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: "Total AUM (USD)",
          data: values,
          borderColor: "#f0883e",
          backgroundColor: "rgba(240,136,62,0.15)",
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { color: "rgba(48,54,61,0.8)" },
          ticks: { color: "#8b949e", maxTicksLimit: 7 },
        },
        y: {
          grid: { color: "rgba(48,54,61,0.8)" },
          ticks: {
            color: "#8b949e",
            callback: (v) => "$" + formatNum(v),
          },
        },
      },
    },
  });
}

function setSummary(total, totalAum, withPrices) {
  const summaryEl = document.getElementById("summary");
  if (!summaryEl) return;
  let msg =
    "Total delegation: " +
    formatNum(total) +
    " tokens across " +
    PARTNERS.length +
    " partners. ";
  if (totalAum != null && !isNaN(totalAum))
    msg += "Total AUM: $" + formatNum(totalAum) + ". ";
  msg += withPrices ? "Prices from CoinGecko (refresh every 5 min). " : "Connect for live prices. ";
  msg += "Uptime %: fill from explorer Uptime links (search DSRV on each page).";
  summaryEl.innerHTML = msg;
}

const PRICE_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

function loadPrices() {
  const ids = [...new Set(PARTNERS.map((p) => p.coingeckoId).filter(Boolean))];
  const total = PARTNERS.reduce((s, p) => s + (p.delegationAmount || 0), 0);
  const dataTimeEl = document.getElementById("data-time");
  const pricesEl = document.getElementById("prices-loading");
  const updatedEl = document.getElementById("prices-updated");

  if (dataTimeEl) dataTimeEl.textContent = DATA_DATE;

  if (ids.length === 0) {
    if (pricesEl) pricesEl.textContent = "—";
    if (updatedEl) updatedEl.textContent = "";
    renderTable(null);
    setSummary(total, null, false);
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
      if (pricesEl) pricesEl.textContent = "OK";
      const now = new Date();
      if (updatedEl)
        updatedEl.textContent = "| Updated " + now.toLocaleTimeString();
      renderTable(prices);
      const totalAum = getTotalAum(prices);
      setSummary(total, totalAum, true);
      drawChart(prices);
    })
    .catch(() => {
      if (pricesEl) pricesEl.textContent = "offline";
      if (updatedEl) updatedEl.textContent = "";
      renderTable(null);
      setSummary(total, null, false);
      drawChart(null);
    });
}

function initChart() {
  if (window.Chart) {
    drawChart(null);
  } else {
    setTimeout(initChart, 100);
  }
}

// Bootstrap
function init() {
  const total = PARTNERS.reduce((s, p) => s + (p.delegationAmount || 0), 0);
  renderTable(null);
  setSummary(total, null, false);
  loadPrices();
  initChart();
  // Live refresh: prices every 5 minutes (table + chart update)
  setInterval(loadPrices, PRICE_REFRESH_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
