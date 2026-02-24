#!/usr/bin/env node
/**
 * DSRV Validator Status — Bi-weekly sync script
 *
 * Run every 2 weeks:  node scripts/sync.js
 *
 * What it does:
 *   1. Fetches live token prices from CoinGecko
 *   2. Queries Cosmos LCD APIs for validator delegation amounts
 *   3. Appends a new snapshot to data/history.json
 *   4. Prints a summary + CSV of rewards at current prices
 *
 * Chains that require manual lookup are flagged in the output.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const HISTORY_PATH = path.join(ROOT, "data", "history.json");
const DATA_JS_PATH = path.join(ROOT, "js", "data.js");

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

function loadPartners() {
  const src = fs.readFileSync(DATA_JS_PATH, "utf8");
  const match = src.match(/const PARTNERS\s*=\s*(\[[\s\S]*?\n\];)/);
  if (!match) throw new Error("Could not parse PARTNERS from data.js");
  return eval(match[1]);
}

async function fetchPrices(ids) {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=" +
    ids.join(",") +
    "&vs_currencies=usd&include_24hr_change=true";
  return httpGet(url);
}

// Cosmos LCD endpoints for auto-fetching delegation amounts
const COSMOS_VALIDATORS = {
  "Babylon":                { chain: "babylon",     valoper: "bbnvaloper18hly9zagjfuzzeqp92uhwafmplmtgd0u98vjj3" },
  "Celestia":               { chain: "celestia",    valoper: "celestiavaloper1vje2he3pcq3w5udyvla7zm9qd5yes6hzffsjxj" },
  "Cosmos HUB":             { chain: "cosmos",      valoper: "cosmosvaloper1wlagucxdxvsmvj6330864x8q3vxz4x02rmvmsu" },
  "Osmosis":                { chain: "osmosis",     valoper: "osmovaloper1wlagucxdxvsmvj6330864x8q3vxz4x025rraa6" },
  "Axelar":                 { chain: "axelar",      valoper: "axelarvaloper137nzwehjcjxddsanmsmg29p729cm4dghj08clr" },
  "Shentu":                 { chain: "shentu",      valoper: "shentuvaloper1vgpzxfmw8up2gugglj50t2uddlpd5shdu49c8g" },
  "Provenance (Figure)":    { chain: "provenance",  valoper: "pbvaloper1s9f4e20xtqrk9tdfhhpavrf26cqjr4eyt3yjqg" },
};

const LCD_ENDPOINTS = {
  "cosmos":      "https://lcd-cosmos.cosmostation.io",
  "osmosis":     "https://lcd-osmosis.cosmostation.io",
  "celestia":    "https://lcd-celestia.cosmostation.io",
  "axelar":      "https://lcd-axelar.cosmostation.io",
  "shentu":      "https://lcd-shentu.cosmostation.io",
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

// Manual lookup links for non-Cosmos chains
const MANUAL_LOOKUP = {
  "Etherfi (total)": "https://explorer.rated.network/o/DSRV%20-%20Ether.Fi?network=mainnet&timeWindow=1d&idType=poolShare",
  "Lido (total)":    "https://explorer.rated.network/o/DSRV%20-%20Lido?network=mainnet&timeWindow=1d&idType=poolShare",
  "Swell":           "https://explorer.rated.network/o/DSRV%20-%20Swell?network=mainnet&timeWindow=1d&idType=poolShare",
  "Solana":          "https://stakewiz.com/validator/2mxWiqtwdpE8zgkWxwFaJLn127dbuuHY4D32d8A6UnPL",
  "Sui":             "https://suivision.xyz/validator/0x6f4e73ee97bfae95e054d31dff1361a839aaadf2cfdb873ad2b07d479507905a",
  "Aptos (total)":   "https://explorer.aptoslabs.com/validator/0xee36c1068076b199cf537bf652b1e586216a7dfb7c3447ff40333c971717eee6?network=mainnet",
  "Near":            "https://nearscope.net/validator/dsrvlabs.poolv1.near/tab/dashboard",
  "Monad":           "https://monadvision.com/validators  (search DSRV)",
  "Supra":           "https://suprascan.io/address/0x4394f0b524832e01a6ffce798eee9b13ff5fd2a6bd11f9c57de908746faf94e8/f?tab=resources",
  "0G":              "https://explorer.0g.ai/mainnet/validators/0x7840481938247e47db1488c033e8d18a21c85cfd/delegators",
  "IOTA":            "https://iotascan.com/mainnet/validator/0xb7c4b7a63c1dd642d2d220630ca3ebf028c7a9ce8308a61bea75c169d21d611b/info",
  "Story":           "https://story.explorers.guru/validator/storyvaloper1pjhn2l646wdphwjw4jkumsa4w4jsezu7nth4dm",
  "Plume":           "https://staking.plume.org/",
  "Polygon":         "https://staking.polygon.technology/validators/64",
  "Wemix":           "https://wemixstake.com/ko/staking/wonder",
  "IKA":             "https://ikascan.io/mainnet/operator/0x1070423a19ad7097768e8da8d1f2e36663f898bfaeb8325dbb643366bdbf8717",
  "Mitosis":         "https://app.mitosis.org/staking/validator/0xc0cccda718572b80d804214596a7bff1b96064b4",
  "Namada":          "https://namada.valopers.com/validators/tnam1q9vjuxuwdv9muek3ekvvjfngyt973agg2c5c7hxp",
  "Canton":          "https://ccview.io/validators/dsrv-mainnetValidator-01::1220e2f4abe1c5ca7e07464037fe7fefc839b7b8fea24985d0d2a2790fa72e3c13ac/?table=rewards",
};

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

  // 2. Auto-fetch Cosmos validator delegations via LCD
  console.log("Fetching Cosmos-ecosystem validator delegations...");
  const autoFetched = {};
  for (const [name, { chain, valoper }] of Object.entries(COSMOS_VALIDATORS)) {
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
      const link = MANUAL_LOOKUP[name] || "no link";
      console.log(`   • ${name} → ${link}`);
    }
  }

  console.log("\n📋 Non-Cosmos chains (always manual):");
  for (const p of partners) {
    if (!COSMOS_VALIDATORS[p.name] && MANUAL_LOOKUP[p.name]) {
      console.log(`   • ${p.name} → ${MANUAL_LOOKUP[p.name]}`);
    }
  }

  console.log("\n✓ Sync complete. Run this script every 2 weeks.\n");
}

main().catch((e) => {
  console.error("Sync failed:", e);
  process.exit(1);
});
