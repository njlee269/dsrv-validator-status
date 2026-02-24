/**
 * DSRV Validator Status — Partner detail page
 * Depends: data.js (PARTNERS), Chart.js (global)
 */

(function () {
  const params = new URLSearchParams(window.location.search);
  const partnerName = params.get("name");

  if (!partnerName) {
    document.getElementById("partner-name").textContent = "Unknown partner";
    return;
  }

  const partner = PARTNERS.find((p) => p.name === partnerName);
  if (!partner) {
    document.getElementById("partner-name").textContent = partnerName + " (not found)";
    return;
  }

  document.title = partner.name + " — DSRV Validator Status";
  document.getElementById("partner-name").textContent = partner.name + " (" + partner.tokenSymbol + ")";

  function formatNum(n) {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  let delegationChart = null;
  let sparklineChart = null;

  function drawDelegationChart(snapshots) {
    const ctx = document.getElementById("delegation-chart");
    if (!ctx || !window.Chart) return;

    const labels = [];
    const values = [];
    for (const snap of snapshots) {
      const d = new Date(snap.date);
      labels.push(d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
      const amount = snap.delegations[partner.name];
      values.push(amount != null ? amount : null);
    }

    if (delegationChart) delegationChart.destroy();
    delegationChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Delegation (" + partner.tokenSymbol + ")",
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
              callback: (v) => formatNum(v),
            },
          },
        },
      },
    });
  }

  function drawSparkline(priceData) {
    const ctx = document.getElementById("price-sparkline");
    if (!ctx || !window.Chart || !priceData) return;

    const prices = priceData.map((pt) => pt[1]);
    const labels = priceData.map((pt) => {
      const d = new Date(pt[0]);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });

    if (sparklineChart) sparklineChart.destroy();
    sparklineChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          data: prices,
          borderColor: "#111111",
          borderWidth: 1.5,
          backgroundColor: "rgba(17,17,17,0.06)",
          fill: true,
          tension: 0.4,
          pointRadius: 0,
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
            cornerRadius: 6,
            padding: 8,
          },
        },
        scales: {
          x: { display: false },
          y: { display: false },
        },
      },
    });
  }

  function renderHistoryTable(snapshots, priceUsd) {
    const tbody = document.getElementById("history-tbody");
    if (!tbody) return;
    const rows = [];
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const snap = snapshots[i];
      const amount = snap.delegations[partner.name];
      const aum = amount != null && priceUsd != null ? amount * priceUsd : null;
      const d = new Date(snap.date);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      let monthlyReward = null;
      if (partner.monthlyRewardCC != null && priceUsd != null) {
        monthlyReward = partner.monthlyRewardCC * priceUsd;
      } else if (amount != null && priceUsd != null && partner.aprPercent != null && partner.commissionPercent != null) {
        monthlyReward = (amount * priceUsd * (partner.aprPercent / 100) * (partner.commissionPercent / 100)) / 12;
      }
      rows.push(
        "<tr><td>" + dateStr +
        "</td><td class=\"num\">" + (amount != null ? formatNum(amount) + " " + partner.tokenSymbol : "—") +
        "</td><td class=\"num\">" + (aum != null ? "$" + formatNum(aum) : "—") +
        "</td><td class=\"num\">" + (monthlyReward != null ? "$" + monthlyReward.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—") +
        "</td></tr>"
      );
    }
    tbody.innerHTML = rows.join("");
  }

  function updateMetrics(priceUsd) {
    document.getElementById("m-price").textContent =
      priceUsd != null
        ? "$" + priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
        : "—";

    const hasFixedReward = partner.monthlyRewardCC != null;

    if (hasFixedReward) {
      const aprBox = document.getElementById("m-apr").parentElement;
      const commBox = document.getElementById("m-commission").parentElement;
      aprBox.querySelector(".metric-label").textContent = "Reward Capture";
      aprBox.querySelector(".metric-value").textContent =
        partner.rewardCapture != null ? partner.rewardCapture + "%" : "—";
      commBox.querySelector(".metric-label").textContent = "Monthly CC Earned";
      commBox.querySelector(".metric-value").textContent =
        formatNum(partner.monthlyRewardCC) + " CC";
    } else {
      document.getElementById("m-apr").textContent =
        partner.aprPercent != null ? partner.aprPercent.toFixed(1) + "%" : "—";
      document.getElementById("m-commission").textContent =
        partner.commissionPercent != null ? partner.commissionPercent.toFixed(1) + "%" : "—";
    }

    let reward = null;
    if (hasFixedReward && priceUsd != null) {
      reward = partner.monthlyRewardCC * 12 * priceUsd;
    } else if (
      partner.delegationAmount != null &&
      priceUsd != null &&
      partner.aprPercent != null &&
      partner.commissionPercent != null
    ) {
      reward =
        partner.delegationAmount *
        priceUsd *
        (partner.aprPercent / 100) *
        (partner.commissionPercent / 100);
    }
    document.getElementById("m-reward").textContent =
      reward != null
        ? "$" + reward.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : "—";

    const monthly = reward != null ? reward / 12 : null;
    document.getElementById("m-monthly").textContent =
      monthly != null
        ? "$" + monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : "—";

    const aum = partner.delegationAmount != null && priceUsd != null
      ? partner.delegationAmount * priceUsd : null;
    document.getElementById("m-aum").textContent =
      aum != null
        ? "$" + formatNum(aum)
        : "—";
  }

  function loadHistory() {
    return fetch("data/history.json")
      .then((r) => r.json())
      .catch(() => null);
  }

  function loadCurrentPrice() {
    if (!partner.coingeckoId) return Promise.resolve(null);
    return fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=" +
        partner.coingeckoId +
        "&vs_currencies=usd&include_24hr_change=true"
    )
      .then((r) => r.json())
      .then((data) => data[partner.coingeckoId]?.usd ?? null)
      .catch(() => null);
  }

  function loadPriceHistory() {
    if (!partner.coingeckoId) return Promise.resolve(null);
    return fetch(
      "https://api.coingecko.com/api/v3/coins/" +
        partner.coingeckoId +
        "/market_chart?vs_currency=usd&days=30"
    )
      .then((r) => r.json())
      .then((data) => data.prices || null)
      .catch(() => null);
  }

  function init() {
    const pricesEl = document.getElementById("prices-loading");
    const updatedEl = document.getElementById("prices-updated");

    Promise.all([loadHistory(), loadCurrentPrice(), loadPriceHistory()])
      .then(([history, priceUsd, priceHistory]) => {
        if (pricesEl) pricesEl.textContent = priceUsd != null ? "OK" : "—";
        if (updatedEl && priceUsd != null)
          updatedEl.textContent = "· Updated " + new Date().toLocaleTimeString();

        updateMetrics(priceUsd);

        if (history && history.snapshots) {
          drawDelegationChart(history.snapshots);
          renderHistoryTable(history.snapshots, priceUsd);
        }

        if (priceHistory) {
          drawSparkline(priceHistory);
        }
      });
  }

  if (window.Chart) {
    init();
  } else {
    const waitChart = setInterval(() => {
      if (window.Chart) {
        clearInterval(waitChart);
        init();
      }
    }, 100);
  }
})();
