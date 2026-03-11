/**
 * Infra Costs page — CRUD for machine/cloud costs per chain
 */
(function () {
  let costs = [];
  let editingId = null;

  const API = "/api/data/infra-costs.json";

  async function load() {
    try {
      const r = await fetch(API);
      costs = await r.json();
      if (!Array.isArray(costs)) costs = [];
    } catch { costs = []; }
  }

  async function save() {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(costs),
    });
  }

  function fmtUsd(n) {
    if (n == null || isNaN(n)) return "—";
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function renderSummary() {
    let totalCurrent = 0;
    let totalPotential = 0;
    for (const c of costs) {
      const v = c.monthlyCostUsd || 0;
      if (c.isCurrentPartner) totalCurrent += v;
      else totalPotential += v;
    }
    const el = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.textContent = fmtUsd(v);
    };
    el("infra-total-current", totalCurrent);
    el("infra-total-potential", totalPotential);
    el("infra-total-all", totalCurrent + totalPotential);
  }

  function renderTable() {
    const tbody = document.getElementById("infra-tbody");
    if (!tbody) return;

    if (costs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No cost entries yet. Click "+ Add Cost Entry" to start.</td></tr>';
      renderSummary();
      return;
    }

    const sorted = [...costs].sort((a, b) => {
      if (a.isCurrentPartner !== b.isCurrentPartner) return a.isCurrentPartner ? -1 : 1;
      return (a.chainName || "").localeCompare(b.chainName || "");
    });

    let html = "";
    for (const c of sorted) {
      html += "<tr>" +
        "<td>" + escHtml(c.chainName) + "</td>" +
        "<td>" + (c.isCurrentPartner ? "Current" : "Potential") + "</td>" +
        "<td>" + escHtml(c.provider || "") + "</td>" +
        "<td>" + escHtml(c.instanceType || "") + "</td>" +
        '<td class="num">' + fmtUsd(c.monthlyCostUsd) + "</td>" +
        "<td>" + escHtml(c.notes || "") + "</td>" +
        '<td><div class="action-btns">' +
          '<button class="btn-secondary btn-sm" onclick="infraEdit(\'' + c.id + '\')">Edit</button>' +
          '<button class="btn-danger btn-sm" onclick="infraDelete(\'' + c.id + '\')">Del</button>' +
        "</div></td>" +
        "</tr>";
    }
    tbody.innerHTML = html;
    renderSummary();
  }

  function showForm(data) {
    document.getElementById("infra-form-wrap").style.display = "";
    document.getElementById("inf-id").value = data?.id || "";
    document.getElementById("inf-chain").value = data?.chainName || "";
    document.getElementById("inf-is-current").value = data?.isCurrentPartner != null ? String(data.isCurrentPartner) : "true";
    document.getElementById("inf-provider").value = data?.provider || "AWS";
    document.getElementById("inf-instance").value = data?.instanceType || "";
    document.getElementById("inf-cost").value = data?.monthlyCostUsd ?? "";
    document.getElementById("inf-notes").value = data?.notes || "";
    editingId = data?.id || null;
  }

  function hideForm() {
    document.getElementById("infra-form-wrap").style.display = "none";
    document.getElementById("infra-form").reset();
    editingId = null;
  }

  function readForm() {
    return {
      id: editingId || crypto.randomUUID(),
      chainName: document.getElementById("inf-chain").value.trim(),
      isCurrentPartner: document.getElementById("inf-is-current").value === "true",
      provider: document.getElementById("inf-provider").value,
      instanceType: document.getElementById("inf-instance").value.trim() || null,
      monthlyCostUsd: Number(document.getElementById("inf-cost").value) || 0,
      notes: document.getElementById("inf-notes").value.trim() || null,
    };
  }

  window.infraEdit = function (id) {
    const c = costs.find((x) => x.id === id);
    if (c) showForm(c);
  };

  window.infraDelete = async function (id) {
    if (!confirm("Delete this cost entry?")) return;
    costs = costs.filter((x) => x.id !== id);
    await save();
    renderTable();
  };

  function setup() {
    document.getElementById("btn-add-infra")?.addEventListener("click", () => showForm(null));
    document.getElementById("btn-cancel-infra")?.addEventListener("click", hideForm);

    document.getElementById("infra-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = readForm();
      if (editingId) {
        const idx = costs.findIndex((x) => x.id === editingId);
        if (idx >= 0) costs[idx] = data;
      } else {
        costs.push(data);
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

  // Expose for net-revenue page
  window.getInfraCosts = function () { return costs; };
  window.loadInfraCosts = load;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
