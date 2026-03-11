/**
 * Competitors page — track other validator operators
 */
(function () {
  let competitors = [];
  let editingId = null;

  const API = "/api/data/competitors.json";

  async function load() {
    try {
      const r = await fetch(API);
      competitors = await r.json();
      if (!Array.isArray(competitors)) competitors = [];
    } catch { competitors = []; }
  }

  async function save() {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(competitors),
    });
  }

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

  function totalAum(comp) {
    if (!comp.chains || !comp.chains.length) return null;
    let sum = 0;
    let hasAny = false;
    for (const c of comp.chains) {
      if (c.aum != null) { sum += c.aum; hasAny = true; }
    }
    return hasAny ? sum : null;
  }

  function renderTable() {
    const tbody = document.getElementById("comp-tbody");
    if (!tbody) return;

    if (competitors.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No competitors added yet. Click "+ Add Competitor" to start.</td></tr>';
      return;
    }

    let html = "";
    for (const c of competitors) {
      const aum = totalAum(c);
      const nChains = c.chains ? c.chains.length : 0;
      html += "<tr>" +
        "<td>" + escHtml(c.name) + "</td>" +
        "<td>" + (c.website ? '<a href="' + escHtml(c.website) + '" target="_blank">' + escHtml(c.website.replace(/^https?:\/\//, "")) + "</a>" : "—") + "</td>" +
        '<td class="num">' + nChains + "</td>" +
        '<td class="num">' + (aum != null ? fmtNum(aum) : "—") + "</td>" +
        "<td>" + escHtml(c.notes || "") + "</td>" +
        '<td><div class="action-btns">' +
          '<button class="btn-secondary btn-sm" onclick="compView(\'' + c.id + '\')">View</button>' +
          '<button class="btn-secondary btn-sm" onclick="compEdit(\'' + c.id + '\')">Edit</button>' +
          '<button class="btn-danger btn-sm" onclick="compDelete(\'' + c.id + '\')">Del</button>' +
        "</div></td>" +
        "</tr>";
    }
    tbody.innerHTML = html;
  }

  function renderDetail(comp) {
    const wrap = document.getElementById("comp-detail-wrap");
    const placeholder = document.getElementById("comp-detail-placeholder");
    const tbody = document.getElementById("comp-detail-tbody");
    if (!wrap || !tbody) return;

    if (!comp || !comp.chains || comp.chains.length === 0) {
      wrap.style.display = "none";
      if (placeholder) {
        placeholder.style.display = "";
        placeholder.textContent = comp
          ? "No chain data for " + comp.name
          : "Select a competitor above to view chain details";
      }
      return;
    }

    if (placeholder) placeholder.style.display = "none";
    wrap.style.display = "";

    let html = "";
    for (const ch of comp.chains) {
      html += "<tr>" +
        "<td>" + escHtml(ch.chain) + "</td>" +
        '<td class="num">' + fmtTokens(ch.delegation) + "</td>" +
        '<td class="num">' + (ch.aum != null ? fmtNum(ch.aum) : "—") + "</td>" +
        '<td class="num">' + (ch.commission != null ? ch.commission + "%" : "—") + "</td>" +
        "</tr>";
    }
    tbody.innerHTML = html;
  }

  function buildChainRows(chains) {
    const list = document.getElementById("cf-chains-list");
    if (!list) return;
    list.innerHTML = "";
    if (!chains || chains.length === 0) return;
    for (const ch of chains) {
      addChainRow(ch);
    }
  }

  function addChainRow(data) {
    const list = document.getElementById("cf-chains-list");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "chain-row";
    row.innerHTML =
      '<input type="text" placeholder="Chain" value="' + escHtml(data?.chain || "") + '" />' +
      '<input type="number" placeholder="Delegation" step="any" value="' + (data?.delegation ?? "") + '" />' +
      '<input type="number" placeholder="AUM ($)" step="any" value="' + (data?.aum ?? "") + '" />' +
      '<input type="number" placeholder="Commission %" step="any" value="' + (data?.commission ?? "") + '" />' +
      '<button type="button" class="btn-danger btn-sm" onclick="this.parentElement.remove()">X</button>';
    list.appendChild(row);
  }

  function readChainRows() {
    const rows = document.querySelectorAll("#cf-chains-list .chain-row");
    const chains = [];
    rows.forEach((row) => {
      const inputs = row.querySelectorAll("input");
      const chain = inputs[0]?.value.trim();
      if (!chain) return;
      chains.push({
        chain,
        delegation: inputs[1]?.value ? Number(inputs[1].value) : null,
        aum: inputs[2]?.value ? Number(inputs[2].value) : null,
        commission: inputs[3]?.value ? Number(inputs[3].value) : null,
      });
    });
    return chains;
  }

  function showForm(data) {
    document.getElementById("comp-form-wrap").style.display = "";
    document.getElementById("cf-id").value = data?.id || "";
    document.getElementById("cf-name").value = data?.name || "";
    document.getElementById("cf-website").value = data?.website || "";
    document.getElementById("cf-notes").value = data?.notes || "";
    buildChainRows(data?.chains || []);
    editingId = data?.id || null;
  }

  function hideForm() {
    document.getElementById("comp-form-wrap").style.display = "none";
    document.getElementById("comp-form").reset();
    document.getElementById("cf-chains-list").innerHTML = "";
    editingId = null;
  }

  window.compView = function (id) {
    const c = competitors.find((x) => x.id === id);
    renderDetail(c || null);
  };

  window.compEdit = function (id) {
    const c = competitors.find((x) => x.id === id);
    if (c) showForm(c);
  };

  window.compDelete = async function (id) {
    if (!confirm("Delete this competitor?")) return;
    competitors = competitors.filter((x) => x.id !== id);
    await save();
    renderTable();
    renderDetail(null);
  };

  function setup() {
    document.getElementById("btn-add-competitor")?.addEventListener("click", () => showForm(null));
    document.getElementById("btn-cancel-competitor")?.addEventListener("click", hideForm);
    document.getElementById("btn-add-comp-chain")?.addEventListener("click", () => addChainRow(null));

    document.getElementById("comp-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        id: editingId || crypto.randomUUID(),
        name: document.getElementById("cf-name").value.trim(),
        website: document.getElementById("cf-website").value.trim() || null,
        notes: document.getElementById("cf-notes").value.trim() || null,
        chains: readChainRows(),
      };
      if (editingId) {
        const idx = competitors.findIndex((x) => x.id === editingId);
        if (idx >= 0) competitors[idx] = data;
      } else {
        competitors.push(data);
      }
      await save();
      hideForm();
      renderTable();
    });
  }

  async function init() {
    await load();
    setup();
    renderTable();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
