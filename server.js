const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8787;
const DATA_DIR = path.join(__dirname, "data");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

const ALLOWED_FILES = new Set([
  "history.json",
  "validators.json",
  "potential-partners.json",
  "infra-costs.json",
  "competitors.json",
  "tokenomics-profiles.json",
]);

function sanitizeFilename(name) {
  const base = path.basename(name);
  if (!ALLOWED_FILES.has(base)) return null;
  return base;
}

app.get("/api/data/:file", (req, res) => {
  const file = sanitizeFilename(req.params.file);
  if (!file) return res.status(400).json({ error: "Invalid file" });

  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return res.json([]);

  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    res.json(data);
  } catch {
    res.json([]);
  }
});

app.post("/api/data/:file", (req, res) => {
  const file = sanitizeFilename(req.params.file);
  if (!file) return res.status(400).json({ error: "Invalid file" });

  const fp = path.join(DATA_DIR, file);
  try {
    fs.writeFileSync(fp, JSON.stringify(req.body, null, 2) + "\n");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════
   Tokenomics Intelligence — CoinGecko proxy with 5-min cache
   ═══════════════════════════════════════ */

const cgCache = new Map();
const CG_TTL = 5 * 60 * 1000;
const CG_BASE = "https://api.coingecko.com/api/v3";

async function cgFetch(urlPath) {
  const now = Date.now();
  const cached = cgCache.get(urlPath);
  if (cached && now - cached.ts < CG_TTL) return cached.data;

  const url = CG_BASE + urlPath;
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`CoinGecko ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  cgCache.set(urlPath, { data, ts: now });
  return data;
}

app.get("/api/tokenomics/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  try {
    const data = await cgFetch(`/search?query=${encodeURIComponent(q)}`);
    const coins = (data.coins || []).slice(0, 15).map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      thumb: c.thumb,
      marketCapRank: c.market_cap_rank,
    }));
    res.json(coins);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/tokenomics/coin/:id", async (req, res) => {
  const id = req.params.id;
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid coin id" });
  }

  try {
    const raw = await cgFetch(
      `/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
    );

    const now = new Date().toISOString();
    const src = (val, field) => ({
      value: val ?? null,
      source: "coingecko",
      sourceUrl: `https://www.coingecko.com/en/coins/${id}`,
      confidence: val != null ? "high" : "none",
      fetchedAt: now,
      notes: field && val == null ? `${field} not available from CoinGecko` : null,
    });

    const md = raw.market_data || {};
    const normalized = {
      identity: {
        coingeckoId: id,
        name: raw.name,
        symbol: (raw.symbol || "").toUpperCase(),
        categories: raw.categories || [],
        homepage: raw.links?.homepage?.[0] || null,
        docsUrl: null,
        tokenomicsUrl: null,
        explorerUrl: raw.links?.blockchain_site?.[0] || null,
        imageThumb: raw.image?.small || null,
        genesisDate: raw.genesis_date || null,
      },
      market: {
        price: src(md.current_price?.usd, "price"),
        marketCap: src(md.market_cap?.usd, "market_cap"),
        fdv: src(md.fully_diluted_valuation?.usd, "fdv"),
        circulatingSupply: src(md.circulating_supply, "circulating_supply"),
        totalSupply: src(md.total_supply, "total_supply"),
        maxSupply: src(md.max_supply, "max_supply"),
        volume24h: src(md.total_volume?.usd, "volume_24h"),
        ath: src(md.ath?.usd, "ath"),
        athDate: src(md.ath_date?.usd, "ath_date"),
        athMarketCap: src(null, "ath_market_cap"),
        priceChange24h: src(md.price_change_percentage_24h, "price_change_24h"),
        priceChange7d: src(md.price_change_percentage_7d, "price_change_7d"),
        priceChange30d: src(md.price_change_percentage_30d, "price_change_30d"),
      },
      allocations: {
        teamPct: src(null, "team_allocation"),
        investorPct: src(null, "investor_allocation"),
        foundationPct: src(null, "foundation_allocation"),
        communityPct: src(null, "community_allocation"),
        airdropPct: src(null, "airdrop_allocation"),
      },
      unlocks: {
        nextUnlockAmount: src(null, "next_unlock_amount"),
        nextUnlockDate: src(null, "next_unlock_date"),
        tokens12mEstimate: src(null, "12m_unlock_estimate"),
      },
      fundamentals: {
        tvl: src(null, "tvl"),
        protocolFees: src(null, "protocol_fees"),
        revenue: src(null, "revenue"),
      },
      utility: {
        gas: false,
        staking: false,
        governance: false,
        feeShare: false,
        burn: false,
        buyback: false,
        collateral: false,
        mandatoryUse: false,
        validatorSecurity: false,
      },
      supplyType: md.max_supply != null ? "capped" : (md.total_supply != null ? "dynamic" : "unknown"),
    };

    res.json(normalized);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`DSRV Dashboard running at http://localhost:${PORT}`);
});
