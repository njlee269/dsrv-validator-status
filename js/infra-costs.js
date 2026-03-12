/**
 * Infra Costs — formula-based cloud cost calculator per chain
 * Monthly = ($/hr × 730) + (Storage GB × $0.10) + (Bandwidth GB × $0.09)
 */
(function () {
  // ── State ─────────────────────────────────────────────────────────────────
  let costs = [];
  let editingId = null;
  let editingNodes = [];
  let currentFilter = "all";

  const API = "/api/data/infra-costs.json";

  // ── AWS Instance lookup table ─────────────────────────────────────────────
  const AWS_INSTANCES = [
    { type: "t3.medium",   vcpu: 2,  ram: 4,   usdPerHr: 0.0416 },
    { type: "t3.large",    vcpu: 2,  ram: 8,   usdPerHr: 0.0832 },
    { type: "t3.xlarge",   vcpu: 4,  ram: 16,  usdPerHr: 0.1664 },
    { type: "t3.2xlarge",  vcpu: 8,  ram: 32,  usdPerHr: 0.3328 },
    { type: "m5.large",    vcpu: 2,  ram: 8,   usdPerHr: 0.096  },
    { type: "m5.xlarge",   vcpu: 4,  ram: 16,  usdPerHr: 0.192  },
    { type: "m5.2xlarge",  vcpu: 8,  ram: 32,  usdPerHr: 0.384  },
    { type: "m5.4xlarge",  vcpu: 16, ram: 64,  usdPerHr: 0.768  },
    { type: "m5.8xlarge",  vcpu: 32, ram: 128, usdPerHr: 1.536  },
    { type: "c5.xlarge",   vcpu: 4,  ram: 8,   usdPerHr: 0.17   },
    { type: "c5.2xlarge",  vcpu: 8,  ram: 16,  usdPerHr: 0.34   },
    { type: "c5.4xlarge",  vcpu: 16, ram: 32,  usdPerHr: 0.68   },
    { type: "c5.9xlarge",  vcpu: 36, ram: 72,  usdPerHr: 1.53   },
    { type: "r5.large",    vcpu: 2,  ram: 16,  usdPerHr: 0.126  },
    { type: "r5.xlarge",   vcpu: 4,  ram: 32,  usdPerHr: 0.252  },
    { type: "r5.2xlarge",  vcpu: 8,  ram: 64,  usdPerHr: 0.504  },
    { type: "r5.4xlarge",  vcpu: 16, ram: 128, usdPerHr: 1.008  },
    { type: "i3.large",    vcpu: 2,  ram: 15,  usdPerHr: 0.156  },
    { type: "i3.xlarge",   vcpu: 4,  ram: 30,  usdPerHr: 0.312  },
    { type: "i3.2xlarge",  vcpu: 8,  ram: 61,  usdPerHr: 0.624  },
    { type: "i3.4xlarge",  vcpu: 16, ram: 122, usdPerHr: 1.248  },
  ];

  function suggestInstance(vcpu, ramGb) {
    const v = vcpu || 0, r = ramGb || 0;
    const candidates = AWS_INSTANCES.filter(i => i.vcpu >= v && i.ram >= r);
    if (!candidates.length) return null;
    candidates.sort((a, b) => (a.vcpu - v + a.ram - r) - (b.vcpu - v + b.ram - r));
    return candidates[0];
  }

  // ── Cost formula ──────────────────────────────────────────────────────────
  function nodeMonthly(n) {
    const inst = (n.onDemandUsdPerHr || 0) * 730;
    const stor = (n.storageGb || 0) * 0.10;
    const bw   = (n.bandwidthGbMonth || 0) * 0.09;
    return (inst + stor + bw) * (n.count || 1);
  }

  function chainMonthly(chain) {
    return (chain.nodes || []).reduce((s, n) => s + nodeMonthly(n), 0);
  }

  // ── Formatting ────────────────────────────────────────────────────────────
  function fmtUsd(n) {
    if (n == null || isNaN(n)) return "—";
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtUsd2(n) {
    if (n == null || isNaN(n)) return "—";
    return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  // ── Load / Save ───────────────────────────────────────────────────────────
  async function load() {
    try {
      const r = await fetch(API);
      costs = await r.json();
      if (!Array.isArray(costs)) costs = [];
      // Migrate old flat entries (no nodes array) to new schema
      costs = costs.map(c => {
        if (!c.nodes) {
          c.nodes = [{
            nodeType: "Validator",
            vcpu: null, ramGb: null, storageGb: null, iops: null,
            networkGbps: null, bandwidthGbMonth: 0,
            provider: c.provider || "AWS",
            instanceType: c.instanceType || "",
            onDemandUsdPerHr: c.monthlyCostUsd ? c.monthlyCostUsd / 730 : 0,
            count: 1,
          }];
        }
        return c;
      });
    } catch { costs = []; }
  }

  async function save() {
    const data = costs.map(c => ({ ...c, monthlyCostUsd: chainMonthly(c) }));
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  function renderSummary() {
    let cur = 0, pot = 0;
    for (const c of costs) {
      const v = chainMonthly(c);
      if (c.isCurrentPartner) cur += v; else pot += v;
    }
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = fmtUsd(v); };
    set("infra-total-current",  cur);
    set("infra-total-potential", pot);
    set("infra-total-all",      cur + pot);
    set("infra-total-annual",   (cur + pot) * 12);
  }

  // ── Rankings table ────────────────────────────────────────────────────────
  function renderRankings() {
    const tbody = document.getElementById("infra-rankings-tbody");
    if (!tbody) return;

    let list = costs.slice();
    if (currentFilter === "current")   list = list.filter(c => c.isCurrentPartner);
    if (currentFilter === "potential") list = list.filter(c => !c.isCurrentPartner);
    list.sort((a, b) => chainMonthly(b) - chainMonthly(a));

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No entries yet. Click "+ Add Chain" to begin.</td></tr>';
      renderSummary();
      return;
    }

    let html = "";
    list.forEach((c, i) => {
      const monthly   = chainMonthly(c);
      const annual    = monthly * 12;
      const nodeCount = (c.nodes || []).length;
      const badge     = c.isCurrentPartner
        ? '<span class="ic-badge ic-badge-green">Current</span>'
        : '<span class="ic-badge ic-badge-blue">Potential</span>';
      html += `<tr>
        <td class="num" style="color:var(--text-muted);font-weight:700">#${i + 1}</td>
        <td><strong>${escHtml(c.chainName)}</strong></td>
        <td>${badge}</td>
        <td style="color:var(--text-dim)">${nodeCount} node type${nodeCount !== 1 ? "s" : ""}</td>
        <td class="num" style="color:var(--accent);font-weight:700">${fmtUsd(monthly)}</td>
        <td class="num" style="color:var(--text-dim)">${fmtUsd(annual)}</td>
        <td><div class="action-btns">
          <button class="btn-secondary btn-sm" onclick="infraViewDetail('${c.id}')">Detail</button>
          <button class="btn-secondary btn-sm" onclick="infraEdit('${c.id}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="infraDelete('${c.id}')">Del</button>
        </div></td>
      </tr>`;
    });
    tbody.innerHTML = html;
    renderSummary();
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  window.infraViewDetail = function (id) {
    const c = costs.find(x => x.id === id);
    if (!c) return;

    document.getElementById("infra-detail-title").textContent = c.chainName + " — Node Breakdown";
    const tbody = document.getElementById("infra-detail-tbody");
    let html = "", total = 0;

    for (const n of (c.nodes || [])) {
      const cnt      = n.count || 1;
      const instCost = (n.onDemandUsdPerHr || 0) * 730 * cnt;
      const storCost = (n.storageGb || 0) * 0.10 * cnt;
      const bwCost   = (n.bandwidthGbMonth || 0) * 0.09 * cnt;
      const rowTotal = instCost + storCost + bwCost;
      total += rowTotal;
      html += `<tr>
        <td><strong>${escHtml(n.nodeType)}</strong></td>
        <td>${n.vcpu != null ? n.vcpu : "—"}</td>
        <td>${n.ramGb != null ? n.ramGb + " GB" : "—"}</td>
        <td>${n.storageGb != null ? n.storageGb + " GB" : "—"}</td>
        <td>${n.bandwidthGbMonth ? n.bandwidthGbMonth + " GB" : "—"}</td>
        <td>${escHtml(n.provider || "AWS")}</td>
        <td style="font-family:monospace;font-size:0.78rem">${escHtml(n.instanceType || "—")}</td>
        <td style="font-family:monospace">${n.onDemandUsdPerHr ? "$" + n.onDemandUsdPerHr.toFixed(4) : "—"}</td>
        <td style="color:var(--text-dim)">×${cnt}</td>
        <td class="num">${fmtUsd2(instCost)}</td>
        <td class="num">${fmtUsd2(storCost)}</td>
        <td class="num">${fmtUsd2(bwCost)}</td>
        <td class="num" style="font-weight:700;color:var(--accent)">${fmtUsd2(rowTotal)}</td>
      </tr>`;
    }

    tbody.innerHTML = html;
    document.getElementById("infra-detail-total").textContent = fmtUsd2(total);
    const panel = document.getElementById("infra-detail-panel");
    panel.style.display = "";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Node editor rows ──────────────────────────────────────────────────────
  function nodeRowHtml(idx, n) {
    n = n || {};
    const sel = (val, opt) => val === opt ? " selected" : "";
    return `<tr id="infra-nr-${idx}" data-idx="${idx}">
      <td>
        <select class="inf-nodetype" data-idx="${idx}">
          <option${sel(n.nodeType, "Validator")}>Validator</option>
          <option${sel(n.nodeType, "Sentry")}>Sentry</option>
          <option${sel(n.nodeType, "RPC")}>RPC</option>
          <option${sel(n.nodeType, "Full Node")}>Full Node</option>
          <option${sel(n.nodeType, "Archive")}>Archive</option>
          <option${sel(n.nodeType, "Other")}>Other</option>
        </select>
      </td>
      <td><input type="number" class="inf-vcpu" data-idx="${idx}" value="${n.vcpu != null ? n.vcpu : ""}" min="1" placeholder="—" /></td>
      <td><input type="number" class="inf-ram"  data-idx="${idx}" value="${n.ramGb != null ? n.ramGb : ""}" min="1" placeholder="—" /></td>
      <td><input type="number" class="inf-stor" data-idx="${idx}" value="${n.storageGb != null ? n.storageGb : ""}" min="1" placeholder="—" /></td>
      <td><input type="number" class="inf-iops" data-idx="${idx}" value="${n.iops != null ? n.iops : ""}" min="0" placeholder="—" /></td>
      <td><input type="number" class="inf-bw"   data-idx="${idx}" value="${n.bandwidthGbMonth != null ? n.bandwidthGbMonth : ""}" min="0" placeholder="—" /></td>
      <td>
        <select class="inf-prov" data-idx="${idx}">
          <option${sel(n.provider || "AWS", "AWS")}>AWS</option>
          <option${sel(n.provider, "GCP")}>GCP</option>
          <option${sel(n.provider, "Azure")}>Azure</option>
          <option${sel(n.provider, "Bare Metal")}>Bare Metal</option>
          <option${sel(n.provider, "Other")}>Other</option>
        </select>
      </td>
      <td><input type="text"   class="inf-inst" data-idx="${idx}" value="${escHtml(n.instanceType || "")}" placeholder="e.g. m5.2xlarge" /></td>
      <td><input type="number" class="inf-usdhr" data-idx="${idx}" value="${n.onDemandUsdPerHr != null ? n.onDemandUsdPerHr : ""}" step="0.0001" min="0" placeholder="—" /></td>
      <td><input type="number" class="inf-cnt" data-idx="${idx}" value="${n.count != null ? n.count : 1}" min="1" /></td>
      <td class="num inf-row-mo" id="infra-rm-${idx}">—</td>
      <td><button class="btn-danger btn-sm" onclick="infraRemoveNode(${idx})">×</button></td>
    </tr>`;
  }

  function updateEditorTotal() {
    const nodes = readNodes();
    const total = nodes.reduce((s, n) => s + nodeMonthly(n), 0);
    const el = document.getElementById("infra-editor-total");
    if (el) el.textContent = fmtUsd(total);
    nodes.forEach((n, idx) => {
      const cel = document.getElementById(`infra-rm-${idx}`);
      if (cel) cel.textContent = fmtUsd(nodeMonthly(n));
    });
  }

  function wireNodeRow(idx) {
    const inputs = document.querySelectorAll(`[data-idx="${idx}"]`);
    inputs.forEach(el => {
      el.addEventListener("input", () => {
        const cls = el.classList[0];
        if (cls === "inf-vcpu" || cls === "inf-ram") autoSuggestInstance(idx);
        updateEditorTotal();
      });
      if (el.classList.contains("inf-inst")) {
        el.addEventListener("blur", () => autoFillPrice(idx));
      }
    });
  }

  function autoSuggestInstance(idx) {
    const prov = document.querySelector(`.inf-prov[data-idx="${idx}"]`);
    if (prov && prov.value !== "AWS") return;
    const vcpu = parseFloat(document.querySelector(`.inf-vcpu[data-idx="${idx}"]`)?.value);
    const ram  = parseFloat(document.querySelector(`.inf-ram[data-idx="${idx}"]`)?.value);
    const inst = suggestInstance(vcpu || 0, ram || 0);
    if (!inst) return;
    const instEl = document.querySelector(`.inf-inst[data-idx="${idx}"]`);
    const usdEl  = document.querySelector(`.inf-usdhr[data-idx="${idx}"]`);
    if (instEl && !instEl.value) instEl.value = inst.type;
    if (usdEl  && !usdEl.value)  usdEl.value  = inst.usdPerHr;
    updateEditorTotal();
  }

  function autoFillPrice(idx) {
    const instEl = document.querySelector(`.inf-inst[data-idx="${idx}"]`);
    const usdEl  = document.querySelector(`.inf-usdhr[data-idx="${idx}"]`);
    if (!instEl || !usdEl || usdEl.value) return;
    const match = AWS_INSTANCES.find(i => i.type === instEl.value.trim());
    if (match) { usdEl.value = match.usdPerHr; updateEditorTotal(); }
  }

  window.infraRemoveNode = function (idx) {
    const row = document.getElementById(`infra-nr-${idx}`);
    if (row) row.remove();
    updateEditorTotal();
  };

  function addNodeRow(n) {
    const idx = document.querySelectorAll("#infra-node-rows tr").length;
    document.getElementById("infra-node-rows").insertAdjacentHTML("beforeend", nodeRowHtml(idx, n));
    wireNodeRow(idx);
    updateEditorTotal();
  }

  function readNodes() {
    const nodes = [];
    document.querySelectorAll("#infra-node-rows tr").forEach(row => {
      const idx = row.dataset.idx;
      if (idx == null) return;
      nodes.push({
        nodeType:          document.querySelector(`.inf-nodetype[data-idx="${idx}"]`)?.value || "Validator",
        vcpu:              parseFloat(document.querySelector(`.inf-vcpu[data-idx="${idx}"]`)?.value) || null,
        ramGb:             parseFloat(document.querySelector(`.inf-ram[data-idx="${idx}"]`)?.value) || null,
        storageGb:         parseFloat(document.querySelector(`.inf-stor[data-idx="${idx}"]`)?.value) || null,
        iops:              parseFloat(document.querySelector(`.inf-iops[data-idx="${idx}"]`)?.value) || null,
        bandwidthGbMonth:  parseFloat(document.querySelector(`.inf-bw[data-idx="${idx}"]`)?.value) || 0,
        provider:          document.querySelector(`.inf-prov[data-idx="${idx}"]`)?.value || "AWS",
        instanceType:      document.querySelector(`.inf-inst[data-idx="${idx}"]`)?.value.trim() || null,
        onDemandUsdPerHr:  parseFloat(document.querySelector(`.inf-usdhr[data-idx="${idx}"]`)?.value) || 0,
        count:             parseInt(document.querySelector(`.inf-cnt[data-idx="${idx}"]`)?.value) || 1,
      });
    });
    return nodes;
  }

  // ── Editor show / hide ────────────────────────────────────────────────────
  function showEditor(chain) {
    editingId = chain?.id || null;
    document.getElementById("infra-editor-title").textContent =
      chain ? "Edit Chain: " + chain.chainName : "Add Chain Infrastructure";
    document.getElementById("inf-chain").value        = chain?.chainName || "";
    document.getElementById("inf-is-current").value   = chain?.isCurrentPartner != null ? String(chain.isCurrentPartner) : "true";
    document.getElementById("inf-notes").value        = chain?.notes || "";
    document.getElementById("infra-scrape-url").value = chain?.partnerUrl || "";
    document.getElementById("infra-scrape-status").textContent = "";
    document.getElementById("infra-node-rows").innerHTML = "";
    document.getElementById("infra-detail-panel").style.display = "none";

    const nodes = (chain?.nodes && chain.nodes.length) ? chain.nodes : [{}];
    nodes.forEach(n => addNodeRow(n));

    document.getElementById("infra-editor-panel").style.display = "";
    document.getElementById("infra-editor-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function hideEditor() {
    document.getElementById("infra-editor-panel").style.display = "none";
    editingId = null;
  }

  // ── URL Scraper ───────────────────────────────────────────────────────────
  async function scrapeUrl() {
    const url = document.getElementById("infra-scrape-url").value.trim();
    if (!url) { alert("Paste a URL first"); return; }
    const status = document.getElementById("infra-scrape-status");
    status.textContent = "Fetching page…";
    status.className = "scrape-status scrape-pending";
    try {
      const r = await fetch("/api/infra/scrape?url=" + encodeURIComponent(url));
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        throw new Error("Server not running or needs restart (got HTML instead of JSON)");
      }
      const data = await r.json();
      if (data.error) throw new Error(data.error);

      const specs = data.specs || {};
      let filled = 0;

      // Apply to row 0 (first node row)
      const apply = (cls, val) => {
        if (val == null || val === 0) return;
        const el = document.querySelector(`.${cls}[data-idx="0"]`);
        if (el) { el.value = val; filled++; }
      };
      apply("inf-vcpu", specs.vcpu);
      apply("inf-ram",  specs.ramGb);
      apply("inf-stor", specs.storageGb);
      apply("inf-iops", specs.iops);
      apply("inf-bw",   specs.bandwidthGbMonth);
      if (specs.vcpu || specs.ramGb) autoSuggestInstance(0);
      updateEditorTotal();

      status.textContent = filled > 0
        ? `✓ Auto-filled ${filled} spec(s) from page`
        : "No hardware specs detected — fill manually";
      status.className = "scrape-status " + (filled > 0 ? "scrape-ok" : "scrape-warn");
    } catch (e) {
      status.textContent = "Error: " + e.message;
      status.className = "scrape-status scrape-err";
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  window.infraEdit = function (id) {
    const c = costs.find(x => x.id === id);
    if (c) showEditor(c);
  };

  window.infraDelete = async function (id) {
    if (!confirm("Delete this chain cost entry?")) return;
    costs = costs.filter(x => x.id !== id);
    await save();
    renderRankings();
  };

  async function saveChain() {
    const chainName = document.getElementById("inf-chain").value.trim();
    if (!chainName) { alert("Chain name is required"); return; }
    const nodes = readNodes();
    if (!nodes.length) { alert("Add at least one node type"); return; }

    const entry = {
      id:              editingId || crypto.randomUUID(),
      chainName,
      isCurrentPartner: document.getElementById("inf-is-current").value === "true",
      partnerUrl:      document.getElementById("infra-scrape-url").value.trim() || null,
      notes:           document.getElementById("inf-notes").value.trim() || null,
      nodes,
      monthlyCostUsd:  nodes.reduce((s, n) => s + nodeMonthly(n), 0),
      savedAt:         new Date().toISOString(),
    };

    if (editingId) {
      const idx = costs.findIndex(x => x.id === editingId);
      if (idx >= 0) costs[idx] = entry; else costs.push(entry);
    } else {
      costs.push(entry);
    }

    await save();
    hideEditor();
    renderRankings();
  }

  // ── Filter tabs ───────────────────────────────────────────────────────────
  function setupFilterTabs() {
    document.querySelectorAll("#infra-filter-tabs .ic-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.filter;
        document.querySelectorAll("#infra-filter-tabs .ic-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderRankings();
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function setup() {
    document.getElementById("btn-add-infra")?.addEventListener("click", () => showEditor(null));
    document.getElementById("btn-add-node")?.addEventListener("click", () => addNodeRow({}));
    document.getElementById("btn-cancel-infra")?.addEventListener("click", hideEditor);
    document.getElementById("btn-save-infra")?.addEventListener("click", saveChain);
    document.getElementById("btn-infra-scrape")?.addEventListener("click", scrapeUrl);
    document.getElementById("btn-close-detail")?.addEventListener("click", () => {
      document.getElementById("infra-detail-panel").style.display = "none";
    });
    setupFilterTabs();
  }

  async function init() {
    await load();
    setup();
    renderRankings();
  }

  // Expose for simulation / net-revenue compatibility
  window.getInfraCosts = function () {
    return costs.map(c => ({ ...c, monthlyCostUsd: chainMonthly(c) }));
  };
  window.loadInfraCosts = load;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
