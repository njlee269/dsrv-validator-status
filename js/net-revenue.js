/**
 * Net Revenue page — joins gross reward from PARTNERS with infra costs
 */
(function () {
  let netrevChart = null;
  let nrPrices = null;
  let nrCosts = [];

  function fmtNum(n) {
    if (n == null || isNaN(n)) return "—";
    if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function getGrossMonthly(p, prices) {
    if (!prices || !p.coingeckoId) return null;
    const priceData = prices[p.coingeckoId];
    const priceUsd = priceData?.usd ?? (typeof priceData === "number" ? priceData : null);
    if (priceUsd == null) return null;

    if (p.monthlyRewardCC != null) {
      return p.monthlyRewardCC * priceUsd;
    }
    if (p.delegationAmount != null && p.aprPercent != null && p.commissionPercent != null) {
      return (p.delegationAmount * priceUsd * (p.aprPercent / 100) * (p.commissionPercent / 100)) / 12;
    }
    return null;
  }

  function getCostForChain(name) {
    const entry = nrCosts.find((c) =>
      c.chainName && c.chainName.toLowerCase() === name.toLowerCase()
    );
    return entry ? (entry.monthlyCostUsd || 0) : 0;
  }

  function render() {
    if (typeof PARTNERS === "undefined") return;

    const rows = [];
    let totalGross = 0;
    let totalCost = 0;

    for (const p of PARTNERS) {
      const gross = getGrossMonthly(p, nrPrices);
      const cost = getCostForChain(p.name);
      const net = gross != null ? gross - cost : null;
      const margin = gross != null && gross > 0 ? ((net / gross) * 100) : null;

      if (gross != null) totalGross += gross;
      totalCost += cost;

      rows.push({ name: p.name, gross, cost, net, margin });
    }

    rows.sort((a, b) => {
      if (a.net != null && b.net != null) return b.net - a.net;
      if (a.net != null) return -1;
      if (b.net != null) return 1;
      return 0;
    });

    const totalNet = totalGross - totalCost;
    const avgMargin = totalGross > 0 ? ((totalNet / totalGross) * 100) : null;

    const el = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = v;
    };
    el("netrev-gross", fmtNum(totalGross));
    el("netrev-cost", fmtNum(totalCost));
    el("netrev-net", fmtNum(totalNet));
    el("netrev-margin", avgMargin != null ? avgMargin.toFixed(1) + "%" : "—");

    const tbody = document.getElementById("netrev-tbody");
    if (tbody) {
      let html = "";
      for (const r of rows) {
        const marginCls = r.margin != null ? (r.margin >= 0 ? "up" : "down") : "";
        html += "<tr>" +
          "<td>" + escHtml(r.name) + "</td>" +
          '<td class="num">' + (r.gross != null ? fmtNum(r.gross) : "—") + "</td>" +
          '<td class="num">' + fmtNum(r.cost) + "</td>" +
          '<td class="num">' + (r.net != null ? fmtNum(r.net) : "—") + "</td>" +
          '<td class="num ' + marginCls + '">' + (r.margin != null ? r.margin.toFixed(1) + "%" : "—") + "</td>" +
          "</tr>";
      }
      tbody.innerHTML = html;
    }

    drawChart(rows);
  }

  function drawChart(rows) {
    const ctx = document.getElementById("netrev-chart");
    if (!ctx || !window.Chart) return;

    const filtered = rows.filter((r) => r.net != null).slice(0, 20);
    const labels = filtered.map((r) => r.name);
    const grossData = filtered.map((r) => r.gross || 0);
    const costData = filtered.map((r) => r.cost || 0);

    if (netrevChart) netrevChart.destroy();

    netrevChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Gross Revenue",
            data: grossData,
            backgroundColor: "rgba(37,99,235,0.6)",
            borderRadius: 4,
          },
          {
            label: "Infra Cost",
            data: costData,
            backgroundColor: "rgba(248,113,113,0.5)",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#7a7a7a", font: { family: "'Inter', sans-serif", size: 11 } },
          },
          tooltip: {
            backgroundColor: "#1e1e1e",
            titleColor: "#f0f0f0",
            bodyColor: "#f0f0f0",
            cornerRadius: 8,
            titleFont: { family: "'Inter', sans-serif" },
            bodyFont: { family: "'Inter', sans-serif" },
            callbacks: {
              label: (ctx) => ctx.dataset.label + ": $" + Math.round(ctx.raw).toLocaleString(),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#7a7a7a", font: { family: "'Inter', sans-serif", size: 10 }, maxRotation: 45 },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: {
              color: "#7a7a7a",
              font: { family: "'Inter', sans-serif", size: 11 },
              callback: (v) => "$" + (v >= 1000 ? (v / 1000).toFixed(0) + "K" : v),
            },
          },
        },
      },
    });
  }

  async function init() {
    try {
      const r = await fetch("/api/data/infra-costs.json");
      nrCosts = await r.json();
      if (!Array.isArray(nrCosts)) nrCosts = [];
    } catch { nrCosts = []; }

    if (typeof PARTNERS !== "undefined") {
      const ids = [...new Set(PARTNERS.map((p) => p.coingeckoId).filter(Boolean))];
      if (ids.length > 0) {
        try {
          const r = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") + "&vs_currencies=usd"
          );
          nrPrices = await r.json();
        } catch { nrPrices = {}; }
      }
    }

    render();
  }

  window.registerPageInit?.("net-revenue", init);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
