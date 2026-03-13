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
   Messari API — token allocations + unlock schedules
   ═══════════════════════════════════════ */

const MESSARI_KEY  = process.env.MESSARI_API_KEY || "5YHeI3BsUoqkt65FET-R2xIqR-xb2NVAj9hqCYyI6poe-NIq";
const MESSARI_BASE = "https://data.messari.io/api";

async function messariProfile(slug) {
  if (!MESSARI_KEY || !slug) return null;
  try {
    return await cachedFetch(
      `messari:profile:${slug}`,
      `${MESSARI_BASE}/v2/assets/${encodeURIComponent(slug)}/profile`,
      { "x-messari-api-key": MESSARI_KEY }
    );
  } catch { return null; }
}

async function messariMetrics(slug) {
  if (!MESSARI_KEY || !slug) return null;
  try {
    return await cachedFetch(
      `messari:metrics:${slug}`,
      `${MESSARI_BASE}/v1/assets/${encodeURIComponent(slug)}/metrics`,
      { "x-messari-api-key": MESSARI_KEY }
    );
  } catch { return null; }
}

// Messari uses lowercase name or symbol as slug (e.g. "ethereum", "sui")
function messariSlug(name, symbol) {
  // Try name first (most reliable), then symbol
  return (name || "").toLowerCase().replace(/\s+/g, "-");
}

/* ═══════════════════════════════════════
   CryptoRank API — tokenomics distributions + fundraising
   Free tier: 400 credits/day, 10k/month, 100 req/min
   ═══════════════════════════════════════ */

const CR_KEY  = process.env.CRYPTORANK_API_KEY || "22ac6315241563ef314f7b14eac21941f3607ce0880d695e6c2a3999aa47";
const CR_BASE = "https://api.cryptorank.io/v1";

async function crCurrency(key) {
  if (!CR_KEY || !key) return null;
  try {
    return await cachedFetch(
      `cr:currency:${key}`,
      `${CR_BASE}/currencies/${encodeURIComponent(key)}?api_key=${CR_KEY}`,
      {}
    );
  } catch { return null; }
}

async function crFundraising(key) {
  if (!CR_KEY || !key) return null;
  try {
    return await cachedFetch(
      `cr:fundraising:${key}`,
      `${CR_BASE}/currencies/${encodeURIComponent(key)}/fundraising?api_key=${CR_KEY}`,
      {}
    );
  } catch { return null; }
}

// CryptoRank uses lowercase symbol as key (e.g. "eth", "sui", "btc")
function crKey(symbol) {
  return (symbol || "").toLowerCase();
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

    const mSlug = messariSlug(name, symbol);
    const cKey  = crKey(symbol);
    const [dlMatch, cmcData, msProfile, msMetrics, crData, crFunds] = await Promise.all([
      findDlSlug(name, symbol, id),
      cmcQuote(symbol),
      messariProfile(mSlug),
      messariMetrics(mSlug),
      crCurrency(cKey),
      crFundraising(cKey),
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
      allocations: (function () {
        const msUrl = `https://messari.io/asset/${mSlug}`;
        const crUrl = `https://cryptorank.io/price/${cKey}`;

        // Messari distribution
        const dist    = msProfile?.data?.profile?.economics?.token_distribution?.initial_distribution ?? null;
        const economy = msProfile?.data?.profile?.economics ?? null;
        const msTeam  = dist?.team_allocation_percentage  ?? dist?.team_percentage       ?? null;
        const msInv   = dist?.investors_percentage         ?? dist?.investor_percentage    ?? null;
        const msFnd   = dist?.foundation_allocation_percentage ?? dist?.foundation_percentage ?? null;
        const msComm  = dist?.community_percentage         ?? dist?.ecosystem_fund_percentage ?? null;
        const msAir   = dist?.airdrop_percentage           ?? null;
        const msPub   = dist?.public_sale_percentage       ?? null;

        // CryptoRank distribution — keyed array of { name, percentage }
        const crDist  = crData?.data?.tokenomics?.distributions ?? crData?.data?.distributions ?? [];
        function crPct(labels) {
          const row = crDist.find(d => labels.some(l => (d.name || "").toLowerCase().includes(l)));
          return row ? (row.percentage ?? row.percent ?? null) : null;
        }
        const crTeam = crPct(["team", "founders", "founder"]);
        const crInv  = crPct(["investor", "private", "seed", "strategic"]);
        const crFnd  = crPct(["foundation", "ecosystem fund", "treasury", "reserve"]);
        const crComm = crPct(["community", "public", "airdrop", "staking reward", "rewards"]);
        const crAir  = crPct(["airdrop"]);
        const crPub  = crPct(["public sale", "ido", "ico", "ieo"]);

        // Pick best: prefer whichever source has a non-null value; if both, pick Messari
        const best = (ms, cr, field) => {
          if (ms != null) return srcRef(ms, "messari",     msUrl, field);
          if (cr != null) return srcRef(cr, "cryptorank",  crUrl, field);
          return srcRef(null, "none", null, field);
        };

        // CryptoRank fundraising rounds
        const rounds = crFunds?.data ?? [];
        const totalRaised = rounds.reduce((s, r) => s + (r.amount ?? 0), 0) || null;
        const investors   = [...new Set(rounds.flatMap(r => (r.investors ?? []).map(i => i.name ?? i)))].slice(0, 20);

        return {
          teamPct:       best(msTeam, crTeam, "team_allocation"),
          investorPct:   best(msInv,  crInv,  "investor_allocation"),
          foundationPct: best(msFnd,  crFnd,  "foundation_allocation"),
          communityPct:  best(msComm, crComm, "community_allocation"),
          airdropPct:    best(msAir,  crAir,  "airdrop_allocation"),
          publicSalePct: best(msPub,  crPub,  "public_sale"),
          description:   dist?.description ?? economy?.launch_details?.description ?? null,
          fundraising: {
            totalRaisedUsd: totalRaised,
            rounds: rounds.slice(0, 10).map(r => ({
              name:      r.name ?? r.type ?? null,
              date:      r.date ?? null,
              amountUsd: r.amount ?? null,
              price:     r.price ?? null,
              investors: (r.investors ?? []).map(i => i.name ?? i).slice(0, 8),
            })),
            notableInvestors: investors,
          },
        };
      })(),
      unlocks: (function () {
        const msUrl  = `https://messari.io/asset/${mSlug}`;
        const supply = msMetrics?.data?.supply ?? null;
        const dist   = msProfile?.data?.profile?.economics?.token_distribution ?? null;

        // Annual inflation % → rough 12M unlock estimate as % of circulating supply
        const annualInflation = supply?.annual_inflation_percent ?? null;
        const circSupply      = md.circulating_supply ?? null;
        const tokens12m       = (annualInflation != null && circSupply != null)
          ? circSupply * (annualInflation / 100)
          : null;

        const supplyCurveDetails = dist?.supply_curve_details ?? null;

        return {
          tokens12mEstimate: srcRef(tokens12m, tokens12m != null ? "messari" : "none", tokens12m != null ? msUrl : null, "12m_unlock_estimate"),
          annualInflationPct: srcRef(annualInflation, annualInflation != null ? "messari" : "none", annualInflation != null ? msUrl : null, "annual_inflation"),
          vestingDescription: supplyCurveDetails ?? null,
          launchStyle: msProfile?.data?.profile?.economics?.launch_style ?? null,
        };
      })(),
      fundamentals: {
        tvl: srcRef(currentDlTvl, "defillama", dlUrl, "tvl"),
        protocolFees: srcRef(dailyFees, "defillama", dlUrl, "protocol_fees_24h"),
        revenue: srcRef(dailyRevenue, "defillama", dlUrl, "revenue_24h"),
      },
      utility: (function () {
        const usage = (msProfile?.data?.profile?.economics?.token_usage ?? "").toLowerCase();
        const tech  = (msProfile?.data?.profile?.technology?.technology_details ?? "").toLowerCase();
        const combined = usage + " " + tech;
        return {
          gas:               combined.includes("gas") || combined.includes("transaction fee"),
          staking:           combined.includes("stak"),
          governance:        combined.includes("govern") || combined.includes("voting"),
          feeShare:          combined.includes("fee") && combined.includes("shar"),
          burn:              combined.includes("burn"),
          buyback:           combined.includes("buyback") || combined.includes("buy back"),
          collateral:        combined.includes("collateral"),
          mandatoryUse:      combined.includes("required") || combined.includes("mandatory"),
          validatorSecurity: combined.includes("validator") || combined.includes("bond"),
          rawDescription:    msProfile?.data?.profile?.economics?.token_usage ?? null,
        };
      })(),
      sources: {
        coingecko:    true,
        defillama:    !!dlMatch,
        coinmarketcap: !!cmcQuoteData,
        messari:      !!msProfile?.data,
        cryptorank:   !!crData?.data,
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

/* ═══════════════════════════════════════
   Infra scraper — fetch a URL and extract hardware specs
   GET /api/infra/scrape?url=<encoded-url>
   ═══════════════════════════════════════ */

app.get("/api/infra/scrape", async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: "Invalid URL — must start with http:// or https://" });
  }

  let html;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DSRVBot/1.0; +https://dsrv.kr)",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
  } catch (e) {
    return res.status(502).json({ error: "Could not fetch URL: " + e.message });
  }

  // Strip HTML to plain text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&gt;/gi, ">").replace(/&lt;/gi, "<")
    .replace(/\s+/g, " ");

  const specs = {};

  // vCPU / CPU cores
  const cpuM =
    text.match(/(\d+)\s*[-–]?\s*(?:v?CPU|vCores?|CPU\s+Cores?|logical\s+processors?)/i) ||
    text.match(/(?:v?CPU|CPU\s+Cores?|Cores?)\s*[:\-–]\s*(\d+)/i) ||
    text.match(/(\d+)\s*cores?/i);
  if (cpuM) specs.vcpu = parseInt(cpuM[1]);

  // RAM / Memory
  const ramM =
    text.match(/(\d+)\s*GB\s*(?:RAM|Memory|mem)/i) ||
    text.match(/(?:RAM|Memory|mem)\s*[:\-–]\s*(\d+)\s*GB/i) ||
    text.match(/(\d+)\s*GiB\s*(?:RAM|Memory)/i);
  if (ramM) specs.ramGb = parseInt(ramM[1]);

  // Storage / Disk
  const storM =
    text.match(/(\d+)\s*(TB|GB)\s*(?:SSD|NVMe|HDD|storage|disk|space)/i) ||
    text.match(/(?:storage|disk|SSD|NVMe|HDD)\s*[:\-–]\s*(\d+)\s*(TB|GB)/i) ||
    text.match(/(\d+)\s*(TB|GB)\s*(?:of\s+)?(?:free\s+)?(?:disk|storage)/i);
  if (storM) {
    let val = parseInt(storM[1]);
    if (/TB/i.test(storM[2])) val *= 1024;
    specs.storageGb = val;
  }

  // IOPS
  const iopsM =
    text.match(/(\d[\d,]*)\s*IOPS/i) ||
    text.match(/IOPS\s*[:\-–]\s*(\d[\d,]*)/i);
  if (iopsM) specs.iops = parseInt(iopsM[1].replace(/,/g, ""));

  // Bandwidth (GB/month)
  const bwM =
    text.match(/(\d+)\s*(?:GB|TB)\s*(?:\/\s*(?:month|mo))\s*(?:bandwidth|egress|transfer)?/i) ||
    text.match(/(?:bandwidth|egress|transfer)\s*[:\-–]\s*(\d+)\s*(?:GB|TB)/i);
  if (bwM) {
    let val = parseInt(bwM[1]);
    if (/TB/i.test(bwM[0])) val *= 1024;
    specs.bandwidthGbMonth = val;
  }

  res.json({ specs, excerpt: text.slice(0, 1500) });
});

app.listen(PORT, () => {
  console.log(`DSRV Dashboard running at http://localhost:${PORT}`);
});
