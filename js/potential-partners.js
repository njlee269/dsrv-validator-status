/**
 * Potential Partners page — CRUD + revenue calculator + news
 */
(function () {
  let prospects = [];
  let prospectPrices = {};
  let editingId = null;

  const API = "/api/data/potential-partners.json";

  async function load() {
    try {
      const r = await fetch(API);
      prospects = await r.json();
      if (!Array.isArray(prospects)) prospects = [];
    } catch { prospects = []; }
  }

  async function save() {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prospects),
    });
  }

  async function fetchProspectPrices() {
    const ids = [...new Set(prospects.map((p) => p.coingeckoId).filter(Boolean))];
    if (ids.length === 0) return;
    try {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=" +
        ids.join(",") + "&vs_currencies=usd"
      );
      prospectPrices = await r.json();
    } catch { prospectPrices = {}; }
  }

  function getPrice(p) {
    if (!p.coingeckoId || !prospectPrices[p.coingeckoId]) return null;
    return prospectPrices[p.coingeckoId].usd ?? null;
  }

  function calcMonthlyRev(p) {
    const price = getPrice(p);
    const del = p.delegation;
    if (del == null || price == null || p.aprPercent == null || p.expectedCommission == null) return null;
    return (del * price * (p.aprPercent / 100) * (p.expectedCommission / 100)) / 12;
  }

  function fmtNum(n) {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtRaw(n) {
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

  function renderTable() {
    const tbody = document.getElementById("prospect-tbody");
    if (!tbody) return;

    if (prospects.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No potential partners yet. Click "+ Add Protocol" to start.</td></tr>';
      return;
    }

    let html = "";
    for (const p of prospects) {
      const rev = calcMonthlyRev(p);
      html += "<tr>" +
        "<td>" + escHtml(p.name) + "</td>" +
        "<td>" + escHtml(p.chainType) + "</td>" +
        "<td>" + escHtml(p.tokenSymbol) + "</td>" +
        '<td class="num">' + (p.fdv ? fmtNum(p.fdv) : "—") + "</td>" +
        '<td class="num">' + (p.marketCap ? fmtNum(p.marketCap) : "—") + "</td>" +
        '<td class="num">' + (p.stakingRatio != null ? p.stakingRatio + "%" : "—") + "</td>" +
        '<td class="num">' + (p.aprPercent != null ? p.aprPercent + "%" : "—") + "</td>" +
        '<td class="num">' + (p.expectedCommission != null ? p.expectedCommission + "%" : "—") + "</td>" +
        '<td class="num">' + (rev != null ? fmtNum(rev) : "—") + "</td>" +
        "<td>" + escHtml(p.dateAdded || "") + "</td>" +
        '<td><div class="action-btns">' +
          '<button class="btn-secondary btn-sm" onclick="prospectEdit(\'' + p.id + '\')">Edit</button>' +
          '<button class="btn-danger btn-sm" onclick="prospectDelete(\'' + p.id + '\')">Del</button>' +
        "</div></td>" +
        "</tr>";
    }
    tbody.innerHTML = html;
  }

  function renderNews() {
    const list = document.getElementById("news-list");
    if (!list) return;

    const allNews = [];
    for (const p of prospects) {
      if (p.newsItems) {
        for (const n of p.newsItems) {
          allNews.push({ ...n, protocol: p.name });
        }
      }
    }
    allNews.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    if (allNews.length === 0) {
      list.innerHTML = '<div class="empty-state">No news items yet.</div>';
      return;
    }

    let html = "";
    for (const n of allNews) {
      html += '<div class="news-item">' +
        '<div class="news-date">' + escHtml(n.date || "") + '</div>' +
        '<div>' +
          '<div class="news-title">' +
            (n.link ? '<a href="' + escHtml(n.link) + '" target="_blank">' + escHtml(n.title) + '</a>' : escHtml(n.title)) +
            ' <span class="news-protocol">' + escHtml(n.protocol) + '</span>' +
          '</div>' +
          (n.summary ? '<div class="news-summary">' + escHtml(n.summary) + '</div>' : '') +
        '</div>' +
      '</div>';
    }
    list.innerHTML = html;
  }

  function showForm(data) {
    const wrap = document.getElementById("prospect-form-wrap");
    wrap.style.display = "";
    document.getElementById("pf-id").value = data?.id || "";
    document.getElementById("pf-name").value = data?.name || "";
    document.getElementById("pf-chain-type").value = data?.chainType || "L1";
    document.getElementById("pf-token").value = data?.tokenSymbol || "";
    document.getElementById("pf-coingecko").value = data?.coingeckoId || "";
    document.getElementById("pf-website").value = data?.website || "";
    document.getElementById("pf-twitter").value = data?.twitter || "";
    document.getElementById("pf-explorer").value = data?.explorer || "";
    document.getElementById("pf-fdv").value = data?.fdv || "";
    document.getElementById("pf-mcap").value = data?.marketCap || "";
    document.getElementById("pf-circ-supply").value = data?.circulatingSupply || "";
    document.getElementById("pf-total-supply").value = data?.totalSupply || "";
    document.getElementById("pf-staking-ratio").value = data?.stakingRatio ?? "";
    document.getElementById("pf-apr").value = data?.aprPercent ?? "";
    document.getElementById("pf-commission").value = data?.expectedCommission ?? "";
    document.getElementById("pf-delegation").value = data?.delegation ?? "";
    document.getElementById("pf-backers").value = data?.backers || "";
    document.getElementById("pf-background").value = data?.background || "";
    document.getElementById("pf-notes").value = data?.notes || "";
    editingId = data?.id || null;
  }

  function hideForm() {
    document.getElementById("prospect-form-wrap").style.display = "none";
    document.getElementById("prospect-form").reset();
    editingId = null;
  }

  function readForm() {
    const numOrNull = (id) => {
      const v = document.getElementById(id).value;
      return v === "" ? null : Number(v);
    };
    return {
      id: editingId || crypto.randomUUID(),
      name: document.getElementById("pf-name").value.trim(),
      chainType: document.getElementById("pf-chain-type").value,
      tokenSymbol: document.getElementById("pf-token").value.trim(),
      coingeckoId: document.getElementById("pf-coingecko").value.trim() || null,
      website: document.getElementById("pf-website").value.trim() || null,
      twitter: document.getElementById("pf-twitter").value.trim() || null,
      explorer: document.getElementById("pf-explorer").value.trim() || null,
      fdv: numOrNull("pf-fdv"),
      marketCap: numOrNull("pf-mcap"),
      circulatingSupply: numOrNull("pf-circ-supply"),
      totalSupply: numOrNull("pf-total-supply"),
      stakingRatio: numOrNull("pf-staking-ratio"),
      aprPercent: numOrNull("pf-apr"),
      expectedCommission: numOrNull("pf-commission"),
      delegation: numOrNull("pf-delegation"),
      backers: document.getElementById("pf-backers").value.trim() || null,
      background: document.getElementById("pf-background").value.trim() || null,
      notes: document.getElementById("pf-notes").value.trim() || null,
      dateAdded: new Date().toISOString().slice(0, 10),
    };
  }

  // Global handlers for inline onclick
  window.prospectEdit = function (id) {
    const p = prospects.find((x) => x.id === id);
    if (p) showForm(p);
  };

  window.prospectDelete = async function (id) {
    if (!confirm("Delete this potential partner?")) return;
    prospects = prospects.filter((x) => x.id !== id);
    await save();
    renderTable();
    renderNews();
  };

  function setup() {
    document.getElementById("btn-add-prospect")?.addEventListener("click", () => showForm(null));
    document.getElementById("btn-cancel-prospect")?.addEventListener("click", hideForm);

    document.getElementById("prospect-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = readForm();
      if (editingId) {
        const idx = prospects.findIndex((x) => x.id === editingId);
        if (idx >= 0) {
          data.newsItems = prospects[idx].newsItems || [];
          data.dateAdded = prospects[idx].dateAdded || data.dateAdded;
          prospects[idx] = data;
        }
      } else {
        data.newsItems = [];
        prospects.push(data);
      }
      await save();
      hideForm();
      await fetchProspectPrices();
      renderTable();
    });

    // News form
    document.getElementById("btn-add-news")?.addEventListener("click", () => {
      document.getElementById("news-form-wrap").style.display = "";
      document.getElementById("nf-date").value = new Date().toISOString().slice(0, 10);
    });
    document.getElementById("btn-cancel-news")?.addEventListener("click", () => {
      document.getElementById("news-form-wrap").style.display = "none";
      document.getElementById("news-form").reset();
    });
    document.getElementById("news-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const protocol = document.getElementById("nf-protocol").value.trim();
      const newsItem = {
        title: document.getElementById("nf-title").value.trim(),
        link: document.getElementById("nf-link").value.trim() || null,
        date: document.getElementById("nf-date").value || null,
        summary: document.getElementById("nf-summary").value.trim() || null,
      };
      let target = prospects.find((p) => p.name.toLowerCase() === protocol.toLowerCase());
      if (!target && protocol) {
        target = {
          id: crypto.randomUUID(),
          name: protocol,
          chainType: "Other",
          tokenSymbol: "",
          newsItems: [],
          dateAdded: new Date().toISOString().slice(0, 10),
        };
        prospects.push(target);
      }
      if (target) {
        if (!target.newsItems) target.newsItems = [];
        target.newsItems.push(newsItem);
        await save();
      }
      document.getElementById("news-form-wrap").style.display = "none";
      document.getElementById("news-form").reset();
      renderTable();
      renderNews();
    });
  }

  async function init() {
    await load();
    setup();
    await fetchProspectPrices();
    renderTable();
    renderNews();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
