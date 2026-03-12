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
   Shared fetch helpers with retry + cache
   ═══════════════════════════════════════ */

const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function cachedFetch(cacheKey, url, headers, retries = 3) {
  const now = Date.now();
  const cached = apiCache.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL) return cached.data;

  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(30000),
      });
      if (resp.status === 429) {
        const wait = Math.min(2000 * Math.pow(2, i), 15000);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 120)}`);
      }
      const data = await resp.json();
      apiCache.set(cacheKey, { data, ts: now });
      return data;
    } catch (e) {
      lastErr = e;
      if (i < retries - 1 && (e.name === "TimeoutError" || e.message.includes("429"))) {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
    }
  }
  throw lastErr || new Error("Fetch failed after retries");
}

/* ═══════════════════════════════════════
   CoinGecko API
   ═══════════════════════════════════════ */

const CG_BASE = "https://api.coingecko.com/api/v3";

async function cgSearch(query) {
  return cachedFetch(
    `cg:search:${query}`,
    `${CG_BASE}/search?query=${encodeURIComponent(query)}`,
    {}
  );
}

async function cgCoin(id) {
  return cachedFetch(
    `cg:coin:${id}`,
    `${CG_BASE}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
    {}
  );
}

/* ═══════════════════════════════════════
   DefiLlama API (free, no key, no rate limit)
   ═══════════════════════════════════════ */

const DL_BASE = "https://api.llama.fi";

async function dlProtocols() {
  return cachedFetch("dl:protocols", `${DL_BASE}/protocols`, {});
}

async function dlProtocol(slug) {
  return cachedFetch(`dl:protocol:${slug}`, `${DL_BASE}/protocol/${slug}`, {});
}

async function dlFees(slug) {
  try {
    return await cachedFetch(`dl:fees:${slug}`, `${DL_BASE}/summary/fees/${slug}`, {});
  } catch { return null; }
}

async function dlRevenue(slug) {
  try {
    return await cachedFetch(`dl:revenue:${slug}`, `${DL_BASE}/summary/revenue/${slug}`, {});
  } catch { return null; }
}

async function dlChains() {
  return cachedFetch("dl:chains", `${DL_BASE}/v2/chains`, {});
}

async function findDlSlug(name, symbol, geckoId) {
  let chainMatch = null;
  let protocolMatch = null;

  try {
    const chains = await dlChains();
    chainMatch = chains.find(
      (c) => c.name.toLowerCase() === name.toLowerCase() ||
             c.gecko_id === geckoId ||
             (c.tokenSymbol && c.tokenSymbol.toLowerCase() === symbol.toLowerCase())
    );
  } catch { /* ignore */ }

  try {
    const protocols = await dlProtocols();
    const nameLow = name.toLowerCase();

    const candidates = protocols.filter(
      (p) => p.gecko_id === geckoId ||
             p.name.toLowerCase() === nameLow ||
             p.slug === nameLow
    );
    const filtered = candidates.filter(
      (p) => !p.slug.endsWith("-foundation") && !p.slug.endsWith("-treasury")
    );
    const pool = filtered.length > 0 ? filtered : candidates;
    pool.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
    protocolMatch = pool[0] || null;
  } catch { /* ignore */ }

  if (chainMatch && protocolMatch) {
    const chainTvl = chainMatch.tvl || 0;
    const protoTvl = protocolMatch.tvl || 0;
    if (chainTvl > protoTvl) return { slug: chainMatch.name, type: "chain", tvl: chainMatch.tvl };
    return { slug: protocolMatch.slug, type: "protocol" };
  }
  if (chainMatch) return { slug: chainMatch.name, type: "chain", tvl: chainMatch.tvl };
  if (protocolMatch) return { slug: protocolMatch.slug, type: "protocol" };
  return null;
}

/* ═══════════════════════════════════════
   CoinMarketCap API (optional, needs CMC_API_KEY env)
   ═══════════════════════════════════════ */

const CMC_KEY = process.env.CMC_API_KEY || "";
const CMC_BASE = "https://pro-api.coinmarketcap.com/v1";

async function cmcQuote(symbol) {
  if (!CMC_KEY) return null;
  try {
    return await cachedFetch(
      `cmc:quote:${symbol}`,
      `${CMC_BASE}/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol)}&convert=USD`,
      { "X-CMC_PRO_API_KEY": CMC_KEY }
    );
  } catch { return null; }
}

/* ═══════════════════════════════════════
   Source reference builder
   ═══════════════════════════════════════ */

function srcRef(value, source, sourceUrl, field) {
  return {
    value: value ?? null,
    source,
    sourceUrl: sourceUrl || null,
    confidence: value != null ? "high" : "none",
    fetchedAt: new Date().toISOString(),
    notes: field && value == null ? `${field} not available from ${source}` : null,
  };
}

function pickBest(refs) {
  const valid = refs.filter((r) => r && r.value != null);
  if (valid.length === 0) return refs[0] || srcRef(null, "none", null, null);
  if (valid.length === 1) return valid[0];
  const priority = { coingecko: 2, defillama: 3, coinmarketcap: 1 };
  valid.sort((a, b) => (priority[b.source] || 0) - (priority[a.source] || 0));
  return valid[0];
}

function multiSrc(cgVal, cgUrl, dlVal, dlUrl, cmcVal, cmcUrl, field) {
  const refs = [];
  refs.push(srcRef(cgVal, "coingecko", cgUrl, field));
  if (dlVal != null) refs.push(srcRef(dlVal, "defillama", dlUrl, field));
  if (cmcVal != null) refs.push(srcRef(cmcVal, "coinmarketcap", cmcUrl, field));

  const best = pickBest(refs);
  best.allSources = refs.filter((r) => r.value != null).map((r) => ({
    source: r.source,
    value: r.value,
    sourceUrl: r.sourceUrl,
  }));
  return best;
}

/* ═══════════════════════════════════════
   Search endpoint — CoinGecko + DefiLlama
   ═══════════════════════════════════════ */

app.get("/api/tokenomics/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  const results = [];
  const seen = new Set();

  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
  const [cgResult, dlResult] = await Promise.allSettled([
    Promise.race([cgSearch(q), timeout(10000)]),
    Promise.race([dlProtocols(), timeout(8000)]),
  ]);

  if (cgResult.status === "fulfilled") {
    for (const c of (cgResult.value.coins || []).slice(0, 12)) {
      seen.add(c.id);
      results.push({
        id: c.id,
        name: c.name,
        symbol: c.symbol,
        thumb: c.thumb,
        marketCapRank: c.market_cap_rank,
        source: "coingecko",
      });
    }
  }

  if (dlResult.status === "fulfilled") {
    const qLow = q.toLowerCase();
    const dlMatches = dlResult.value
      .filter((p) =>
        p.name.toLowerCase().includes(qLow) ||
        (p.symbol && p.symbol.toLowerCase().includes(qLow))
      )
      .slice(0, 8);

    for (const p of dlMatches) {
      if (p.gecko_id && seen.has(p.gecko_id)) continue;
      const id = p.gecko_id || `dl-${p.slug}`;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({
        id: id,
        name: p.name,
        symbol: (p.symbol || "").toUpperCase(),
        thumb: p.logo || null,
        marketCapRank: null,
        tvl: p.tvl || null,
        source: "defillama",
        dlSlug: p.slug,
      });
    }
  }

  if (results.length === 0 && cgResult.status === "rejected") {
    return res.status(502).json({
      error: "Search failed: " + (cgResult.reason?.message || "CoinGecko unavailable. Try again in a moment."),
    });
  }

  res.json(results.slice(0, 15));
});

/* ═══════════════════════════════════════
   Coin detail — multi-source merge
   ═══════════════════════════════════════ */

app.get("/api/tokenomics/coin/:id", async (req, res) => {
  const id = req.params.id;
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid coin id" });
  }

  try {
    const cgRaw = await cgCoin(id);
    const md = cgRaw.market_data || {};
    const cgUrl = `https://www.coingecko.com/en/coins/${id}`;
    const name = cgRaw.name || "";
    const symbol = (cgRaw.symbol || "").toUpperCase();

    const [dlMatch, cmcData] = await Promise.all([
      findDlSlug(name, symbol, id),
      cmcQuote(symbol),
    ]);

    let dlData = null, dlFeesData = null, dlRevData = null;
    let currentDlTvl = null;
    let dlSlug = null;
    let dlUrl = null;

    if (dlMatch) {
      dlSlug = dlMatch.slug;
      if (dlMatch.type === "chain") {
        currentDlTvl = dlMatch.tvl || null;
        dlUrl = `https://defillama.com/chain/${dlSlug}`;
        [dlFeesData, dlRevData] = await Promise.all([
          dlFees(dlSlug.toLowerCase()),
          dlRevenue(dlSlug.toLowerCase()),
        ]);
      } else {
        dlUrl = `https://defillama.com/protocol/${dlSlug}`;
        [dlData, dlFeesData, dlRevData] = await Promise.all([
          dlProtocol(dlSlug).catch(() => null),
          dlFees(dlSlug),
          dlRevenue(dlSlug),
        ]);
        if (dlData) {
          if (typeof dlData.currentChainTvls === "object" && dlData.currentChainTvls !== null) {
            const chains = Object.entries(dlData.currentChainTvls).filter(([k]) => !k.includes("-"));
            currentDlTvl = chains.reduce((sum, [, v]) => sum + (v || 0), 0);
          }
          if (!currentDlTvl && Array.isArray(dlData.tvl) && dlData.tvl.length > 0) {
            currentDlTvl = dlData.tvl[dlData.tvl.length - 1]?.totalLiquidityUSD;
          }
        }
      }
    }

    const cmcQuoteData = cmcData?.data?.[symbol]?.quote?.USD;
    const cmcUrl = cmcData?.data?.[symbol] ? `https://coinmarketcap.com/currencies/${cmcData.data[symbol].slug}/` : null;

    const dailyFees = dlFeesData?.total24h ?? null;
    const dailyRevenue = dlRevData?.total24h ?? null;

    const normalized = {
      identity: {
        coingeckoId: id,
        defillamaSlug: dlSlug || null,
        defillamaType: dlMatch?.type || null,
        name: name,
        symbol: symbol,
        categories: cgRaw.categories || [],
        homepage: cgRaw.links?.homepage?.[0] || null,
        docsUrl: null,
        tokenomicsUrl: null,
        explorerUrl: cgRaw.links?.blockchain_site?.[0] || null,
        imageThumb: cgRaw.image?.small || null,
        genesisDate: cgRaw.genesis_date || null,
      },
      market: {
        price: multiSrc(md.current_price?.usd, cgUrl, null, null, cmcQuoteData?.price, cmcUrl, "price"),
        marketCap: multiSrc(md.market_cap?.usd, cgUrl, null, null, cmcQuoteData?.market_cap, cmcUrl, "market_cap"),
        fdv: multiSrc(md.fully_diluted_valuation?.usd, cgUrl, null, null, cmcQuoteData?.fully_diluted_market_cap, cmcUrl, "fdv"),
        circulatingSupply: srcRef(md.circulating_supply, "coingecko", cgUrl, "circulating_supply"),
        totalSupply: srcRef(md.total_supply, "coingecko", cgUrl, "total_supply"),
        maxSupply: srcRef(md.max_supply, "coingecko", cgUrl, "max_supply"),
        volume24h: multiSrc(md.total_volume?.usd, cgUrl, null, null, cmcQuoteData?.volume_24h, cmcUrl, "volume_24h"),
        ath: srcRef(md.ath?.usd, "coingecko", cgUrl, "ath"),
        athDate: srcRef(md.ath_date?.usd, "coingecko", cgUrl, "ath_date"),
        athMarketCap: srcRef(null, "coingecko", cgUrl, "ath_market_cap"),
        priceChange24h: srcRef(md.price_change_percentage_24h, "coingecko", cgUrl, "price_change_24h"),
        priceChange7d: srcRef(md.price_change_percentage_7d, "coingecko", cgUrl, "price_change_7d"),
        priceChange30d: srcRef(md.price_change_percentage_30d, "coingecko", cgUrl, "price_change_30d"),
      },
      allocations: {
        teamPct: srcRef(null, "coingecko", cgUrl, "team_allocation"),
        investorPct: srcRef(null, "coingecko", cgUrl, "investor_allocation"),
        foundationPct: srcRef(null, "coingecko", cgUrl, "foundation_allocation"),
        communityPct: srcRef(null, "coingecko", cgUrl, "community_allocation"),
        airdropPct: srcRef(null, "coingecko", cgUrl, "airdrop_allocation"),
      },
      unlocks: {
        nextUnlockAmount: srcRef(null, "none", null, "next_unlock_amount"),
        nextUnlockDate: srcRef(null, "none", null, "next_unlock_date"),
        tokens12mEstimate: srcRef(null, "none", null, "12m_unlock_estimate"),
      },
      fundamentals: {
        tvl: srcRef(currentDlTvl, "defillama", dlUrl, "tvl"),
        protocolFees: srcRef(dailyFees, "defillama", dlUrl, "protocol_fees_24h"),
        revenue: srcRef(dailyRevenue, "defillama", dlUrl, "revenue_24h"),
      },
      utility: {
        gas: false, staking: false, governance: false, feeShare: false,
        burn: false, buyback: false, collateral: false, mandatoryUse: false,
        validatorSecurity: false,
      },
      sources: {
        coingecko: true,
        defillama: !!dlMatch,
        coinmarketcap: !!cmcQuoteData,
      },
      supplyType: md.max_supply != null ? "capped" : (md.total_supply != null ? "dynamic" : "unknown"),
    };

    res.json(normalized);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════
   Batch refresh — used by GitHub Actions cron
   POST /api/tokenomics/refresh
   Re-fetches all saved profiles
   ═══════════════════════════════════════ */

app.post("/api/tokenomics/refresh", async (req, res) => {
  const fp = path.join(DATA_DIR, "tokenomics-profiles.json");
  let profiles = [];
  try {
    profiles = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!Array.isArray(profiles)) profiles = [];
  } catch { profiles = []; }

  if (profiles.length === 0) return res.json({ refreshed: 0 });

  let refreshed = 0;
  for (const profile of profiles) {
    const cgId = profile.id;
    if (!cgId || cgId.startsWith("manual-")) continue;
    try {
      const coinResp = await new Promise((resolve, reject) => {
        const url = `http://localhost:${PORT}/api/tokenomics/coin/${encodeURIComponent(cgId)}`;
        fetch(url).then((r) => r.json()).then(resolve).catch(reject);
      });
      if (coinResp && coinResp.identity) {
        profile.data = coinResp;
        profile.savedAt = new Date().toISOString();
        refreshed++;
      }
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      console.error(`Refresh failed for ${cgId}:`, e.message);
    }
  }

  fs.writeFileSync(fp, JSON.stringify(profiles, null, 2) + "\n");
  res.json({ refreshed, total: profiles.length });
});

app.listen(PORT, () => {
  console.log(`DSRV Dashboard running at http://localhost:${PORT}`);
});
