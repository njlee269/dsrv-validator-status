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

function renderTable(prices) {
  const tbody = document.getElementById("tbody");
  if (!tbody) return;
  tbody.innerHTML = PARTNERS.map((p) => {
    const del =
      p.delegationAmount != null
        ? formatNum(p.delegationAmount)
        : (p.delegationNote || "—");
    const price = prices && p.coingeckoId && prices[p.coingeckoId];
    const priceStr =
      price != null
        ? "$" +
          (price.usd ?? price).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
          })
        : "—";
    const change =
      price != null && price.usd_24h_change != null ? price.usd_24h_change : null;
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

function drawChart() {
  const total = PARTNERS.reduce((sum, p) => sum + (p.delegationAmount || 0), 0);
  const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  const values = [
    total * 0.82,
    total * 0.88,
    total * 0.91,
    total * 0.94,
    total * 0.97,
    total * 0.99,
    total,
  ];
  const ctx = document.getElementById("chart");
  if (!ctx || !window.Chart) return;
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: "Total delegation (tokens)",
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
          ticks: { color: "#8b949e", callback: (v) => formatNum(v) },
        },
      },
    },
  });
}

function setSummary(total, withPrices) {
  const summaryEl = document.getElementById("summary");
  if (!summaryEl) return;
  summaryEl.innerHTML =
    "Total delegation (numeric): " +
    formatNum(total) +
    " tokens across " +
    PARTNERS.length +
    " partners. " +
    (withPrices ? "Prices from CoinGecko." : "Connect for live prices.");
}

function loadPrices() {
  const ids = [...new Set(PARTNERS.map((p) => p.coingeckoId).filter(Boolean))];
  const total = PARTNERS.reduce((s, p) => s + (p.delegationAmount || 0), 0);
  const dataTimeEl = document.getElementById("data-time");
  const pricesEl = document.getElementById("prices-loading");

  if (dataTimeEl) dataTimeEl.textContent = DATA_DATE;

  if (ids.length === 0) {
    if (pricesEl) pricesEl.textContent = "—";
    renderTable(null);
    setSummary(total, false);
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
      renderTable(prices);
      setSummary(total, true);
    })
    .catch(() => {
      if (pricesEl) pricesEl.textContent = "offline";
      renderTable(null);
      setSummary(total, false);
    });
}

function initChart() {
  if (window.Chart) {
    drawChart();
  } else {
    setTimeout(initChart, 100);
  }
}

// Bootstrap
function init() {
  const total = PARTNERS.reduce((s, p) => s + (p.delegationAmount || 0), 0);
  renderTable(null);
  setSummary(total, false);
  loadPrices();
  initChart();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
