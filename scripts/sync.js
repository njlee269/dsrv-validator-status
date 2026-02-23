#!/usr/bin/env node
/**
 * DSRV Validator Status — Bi-weekly sync script
 *
 * Run every 2 weeks:  node scripts/sync.js
 *
 * What it does:
 *   1. Fetches live token prices from CoinGecko
 *   2. Queries Mintscan REST API for Cosmos-ecosystem validator delegation amounts
 *   3. Queries other chain-specific APIs where available
 *   4. Appends a new snapshot to data/history.json
 *   5. Prints a summary + CSV of rewards at current prices
 *
 * Chains that require manual lookup are flagged in the output.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const HISTORY_PATH = path.join(ROOT, "data", "history.json");
const DATA_JS_PATH = path.join(ROOT, "js", "data.js");

// ── Helpers ──

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "dsrv-sync/1.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Parse PARTNERS from data.js (cheap text extraction) ──

function loadPartners() {
  const src = fs.readFileSync(DATA_JS_PATH, "utf8");
  const match = src.match(/const PARTNERS\s*=\s*(\[[\s\S]*?\n\];)/);
  if (!match) throw new Error("Could not parse PARTNERS from data.js");
  return eval(match[1]);
}

// ── CoinGecko price fetch ──

async function fetchPrices(ids) {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=" +
    ids.join(",") +
    "&vs_currencies=usd&include_24hr_change=true";
  return httpGet(url);
}

// ── Mintscan Cosmos validator delegation ──
// Mintscan v2 API: GET /v2/{chain}/validators/{valoper}
// Falls back to chain LCD endpoints

const MINTSCAN_VALIDATORS = {
  "Babylon":     { chain: "babylon",     valoper: "bbnvaloper18hly9zagjfuzzeqp92uhwafmplmtgd0u98vjj3" },
  "Celestia":    { chain: "celestia",    valoper: "celestiavaloper1vje2he3pcq3w5udyvla7zm9qd5yes6hzffsjxj" },
  "Cosmos HUB":  { chain: "cosmos",      valoper: "cosmosvaloper1wlagucxdxvsmvj6330864x8q3vxz4x02rmvmsu" },
  "Osmosis":     { chain: "osmosis",     valoper: "osmovaloper1wlagucxdxvsmvj6330864x8q3vxz4x025rraa6" },
  "Axelar":      { chain: "axelar",      valoper: "axelarvaloper137nzwehjcjxddsanmsmg29p729cm4dghj08clr" },
  "Shentu":      { chain: "shentu",      valoper: "shentuvaloper1vgpzxfmw8up2gugglj50t2uddlpd5shdu49c8g" },
  "Archway":     { chain: "archway",     valoper: "archwayvaloper1zttnm2cl60m5ffsrfeqtzkmtvepl4hwndvgtka" },
  "Agoric":      { chain: "agoric",      valoper: "agoricvaloper1wlagucxdxvsmvj6330864x8q3vxz4x02y2fcsc" },
  "Persistence": { chain: "persistence", valoper: "persistencevaloper1d0xdy0v97grs8ru8nccqyzyc9l8ppv0zv6p5xg" },
  "XPLA":        { chain: "xpla",        valoper: "xplavaloper18nwzp4g297pvq9kv6exzrlwx23tqpsfxnp3yyd" },
  "Chihuahua":   { chain: "chihuahua",   valoper: "chihuahuavaloper128jw67hyqd02zxeqeqzy4dzfx67g3dplwqlqjl" },
  "Zeta":        { chain: "zeta",        valoper: "zetavaloper1txfmxp4d9dc9wqa2f7wvqed9635zajn0hrmz8z" },
  "Xion":        { chain: "xion",        valoper: "xionvaloper1ddqn26gh4kqeta6h7mcpt6sf0ww5r2kclajve5" },
  "Provenance (Figure)": { chain: "provenance", valoper: "pbvaloper1s9f4e20xtqrk9tdfhhpavrf26cqjr4eyt3yjqg" },
  "AtomOne":     { chain: "atomone",     valoper: "atonevaloper1wlagucxdxvsmvj6330864x8q3vxz4x022j0qq0" },
};

// LCD endpoints for Cosmos chains (staking/validators/{valoper})
const LCD_ENDPOINTS = {
  "cosmos":      "https://lcd-cosmos.cosmostation.io",
  "osmosis":     "https://lcd-osmosis.cosmostation.io",
  "celestia":    "https://lcd-celestia.cosmostation.io",
  "axelar":      "https://lcd-axelar.cosmostation.io",
  "shentu":      "https://lcd-shentu.cosmostation.io",
  "persistence": "https://lcd-persistence.cosmostation.io",
  "archway":     "https://lcd-archway.cosmostation.io",
  "agoric":      "https://lcd-agoric.cosmostation.io",
  "provenance":  "https://lcd-provenance.cosmostation.io",
};

async function fetchCosmosDelegation(chain, valoper) {
  const lcd = LCD_ENDPOINTS[chain];
  if (!lcd) return null;
  try {
    const url = `${lcd}/cosmos/staking/v1beta1/validators/${valoper}`;
    const data = await httpGet(url);
    const tokens = data?.validator?.tokens;
    if (tokens) return Math.round(Number(tokens) / 1e6);
    return null;
  } catch {
    return null;
  }
}

// ── Main ──

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  DSRV Validator Status — Bi-weekly Sync");
  console.log("  " + new Date().toISOString().slice(0, 10));
  console.log("═══════════════════════════════════════════\n");

  const partners = loadPartners();
  console.log(`Loaded ${partners.length} partners from data.js\n`);

  // 1. Fetch prices
  const ids = [...new Set(partners.map((p) => p.coingeckoId).filter(Boolean))];
  console.log(`Fetching prices for ${ids.length} tokens from CoinGecko...`);
  let prices = {};
  try {
    prices = await fetchPrices(ids);
    console.log("  ✓ Prices fetched\n");
  } catch (e) {
    console.log("  ✗ Price fetch failed:", e.message, "\n");
  }

  // 2. Fetch Cosmos validator delegations
  console.log("Fetching Cosmos-ecosystem validator delegations...");
  const autoFetched = {};
  for (const [name, { chain, valoper }] of Object.entries(MINTSCAN_VALIDATORS)) {
    const amount = await fetchCosmosDelegation(chain, valoper);
    if (amount != null) {
      autoFetched[name] = amount;
      console.log(`  ✓ ${name}: ${amount.toLocaleString()} tokens`);
    } else {
      console.log(`  ○ ${name}: manual lookup needed`);
    }
    await sleep(300);
  }

  // 3. Build snapshot
  const today = new Date().toISOString().slice(0, 10);
  const delegations = {};
  const manualNeeded = [];

  for (const p of partners) {
    if (autoFetched[p.name] != null) {
      delegations[p.name] = autoFetched[p.name];
    } else if (p.delegationAmount != null) {
      delegations[p.name] = p.delegationAmount;
    } else {
      delegations[p.name] = null;
      manualNeeded.push(p.name);
    }
  }

  // 4. Save snapshot
  let history;
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  } catch {
    history = { snapshots: [] };
  }

  const existingIdx = history.snapshots.findIndex((s) => s.date === today);
  if (existingIdx >= 0) {
    history.snapshots[existingIdx] = { date: today, delegations };
    console.log(`\nUpdated existing snapshot for ${today}`);
  } else {
    history.snapshots.push({ date: today, delegations });
    console.log(`\nAdded new snapshot for ${today}`);
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
  console.log(`Saved to ${HISTORY_PATH}`);

  // 5. Rewards summary
  console.log("\n═══════════════════════════════════════════");
  console.log("  REWARDS SUMMARY (monthly = annual / 12)");
  console.log("═══════════════════════════════════════════\n");
  console.log(
    "Partner".padEnd(25) +
    "Delegation".padStart(15) +
    "Price".padStart(12) +
    "APR%".padStart(8) +
    "Comm%".padStart(8) +
    "Mo.Reward$".padStart(14) +
    "AUM$".padStart(14)
  );
  console.log("─".repeat(96));

  let totalAum = 0;
  let totalMonthlyReward = 0;

  for (const p of partners) {
    const del = delegations[p.name];
    const priceData = p.coingeckoId ? prices[p.coingeckoId] : null;
    const priceUsd = priceData?.usd ?? null;
    const aum = del != null && priceUsd != null ? del * priceUsd : null;
    let monthlyReward = null;
    if (del != null && priceUsd != null && p.aprPercent != null && p.commissionPercent != null) {
      monthlyReward = (del * priceUsd * (p.aprPercent / 100) * (p.commissionPercent / 100)) / 12;
    }

    if (aum) totalAum += aum;
    if (monthlyReward) totalMonthlyReward += monthlyReward;

    console.log(
      p.name.padEnd(25) +
      (del != null ? del.toLocaleString() : "—").padStart(15) +
      (priceUsd != null ? "$" + priceUsd.toFixed(4) : "—").padStart(12) +
      (p.aprPercent != null ? p.aprPercent + "%" : "—").padStart(8) +
      (p.commissionPercent != null ? p.commissionPercent + "%" : "—").padStart(8) +
      (monthlyReward != null ? "$" + Math.round(monthlyReward).toLocaleString() : "—").padStart(14) +
      (aum != null ? "$" + Math.round(aum).toLocaleString() : "—").padStart(14)
    );
  }

  console.log("─".repeat(96));
  console.log(
    "TOTAL".padEnd(25) +
    "".padStart(15) +
    "".padStart(12) +
    "".padStart(8) +
    "".padStart(8) +
    ("$" + Math.round(totalMonthlyReward).toLocaleString()).padStart(14) +
    ("$" + Math.round(totalAum).toLocaleString()).padStart(14)
  );

  if (manualNeeded.length > 0) {
    console.log("\n⚠  Manual lookup needed for:");
    for (const name of manualNeeded) {
      const p = partners.find((x) => x.name === name);
      console.log(`   • ${name} → ${p?.explorerDelegation || "no link"}`);
    }
  }

  console.log("\n✓ Sync complete. Run this script every 2 weeks.\n");
}

main().catch((e) => {
  console.error("Sync failed:", e);
  process.exit(1);
});
